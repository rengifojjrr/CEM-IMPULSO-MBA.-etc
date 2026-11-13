-- El recibo de una donación, con forma de factura y descargable en PDF.
--
-- Hasta ahora, al volver de Stripe la página de becas decía «¡Gracias! Tu
-- aporte está confirmado (recibo DON-…)», y el correo traía el recibo en
-- texto. Ahora cada donación tiene su página de recibo —quién donó, cuánto,
-- cuándo, cómo y su número, con un sello de «Pagado»— que se descarga en PDF
-- o se imprime, para guardarlo como comprobante.
--
-- Se llama «Recibo de donación» y no «Factura» a propósito: en casi toda
-- Latinoamérica una factura es un documento fiscal, y el aporte no es
-- deducible de impuestos.
--
-- La página se abre con una llave, como el enlace de una beca: sin ella no se
-- ve nada. A diferencia de aquella, ésta se guarda tal cual y no su huella:
-- hay que poder enseñarla más de una vez (a la vuelta de Stripe, en el
-- correo y al equipo), y lo único que abre es un recibo.

-- 1. LA LLAVE. Cada donación que ya existe recibe la suya al añadir la
--    columna: el valor por omisión se calcula fila a fila.
alter table public.cem_becas_donaciones
  add column if not exists recibo_clave text not null default public.cem_becas_token_nuevo();
create unique index if not exists cem_becas_donaciones_recibo_clave_key
  on public.cem_becas_donaciones (recibo_clave);
comment on column public.cem_becas_donaciones.recibo_clave is
  'La llave de la página del recibo (plataforma/recibo.html?r=…). Se guarda tal cual porque se enseña varias veces: a la vuelta de Stripe, en el correo del recibo y al equipo. Sólo abre el recibo de esta donación.';

-- 2. ABRIR UNA DONACIÓN devuelve también la llave, para que cem-donar mande
--    a quien paga de vuelta a su recibo. Lo demás, igual que en
--    20261108000001.
create or replace function public.cem_beca_donacion_abrir(
  p_paquete_id uuid, p_monto numeric, p_nombre text, p_email text, p_pais text default null,
  p_organizacion text default null, p_mensaje text default null, p_publica boolean default false,
  p_idioma text default 'es', p_origen text default null, p_campana text default null, p_ip text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  a cem_becas_ajustes; k cem_becas_paquetes; v_en boolean := lower(coalesce(p_idioma, 'es')) = 'en';
  v_monto numeric; v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 80);
  v_anonima boolean; v_frenada boolean := false;
  d cem_becas_donaciones;
begin
  perform cem_becas_exigir_servidor();
  select * into a from cem_becas_ajustes where id = 1;

  if p_paquete_id is not null then
    select * into k from cem_becas_paquetes where id = p_paquete_id and activo;
    if k.id is null then
      raise exception '%', case when v_en then 'That option is no longer available. Please choose another one.'
                                else 'Esa opción ya no está disponible. Elige otra.' end;
    end if;
    v_monto := k.monto;
  else
    if not coalesce(a.otro_monto, false) then
      raise exception '%', case when v_en then 'Please choose one of the options.' else 'Elige una de las opciones.' end;
    end if;
    v_monto := round(coalesce(p_monto, 0), 2);
    if v_monto < a.otro_monto_minimo or v_monto > a.otro_monto_maximo then
      raise exception '%', case when v_en
        then format('The amount must be between %s and %s.', cem_becas_usd(a.otro_monto_minimo, 'en'), cem_becas_usd(a.otro_monto_maximo, 'en'))
        else format('El monto tiene que estar entre %s y %s.', cem_becas_usd(a.otro_monto_minimo, 'es'), cem_becas_usd(a.otro_monto_maximo, 'es')) end;
    end if;
  end if;

  -- Sin nombre, la donación es anónima. Una letra suelta tampoco es un nombre.
  v_anonima := length(v_nombre) < 2;
  if v_anonima then v_nombre := case when v_en then 'Anonymous' else 'Anónimo' end; end if;

  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception '%', case when v_en then 'That email doesn''t look right.' else 'Ese correo no parece un correo.' end;
  end if;

  -- Los frenos, uno detrás de otro: el del correo sólo si hay correo.
  if v_email is not null then
    v_frenada := not cem_rate_limit_consumir('donacion:' || v_email, 6, 3600, 3600);
  end if;
  if not v_frenada and nullif(btrim(coalesce(p_ip, '')), '') is not null then
    v_frenada := not cem_rate_limit_consumir('donacion-ip:' || left(btrim(p_ip), 64), 12, 3600, 3600);
  end if;
  if not v_frenada then
    v_frenada := not cem_rate_limit_consumir('donaciones-con-tarjeta', 80, 3600, 900);
  end if;
  if v_frenada then
    raise exception '%', case when v_en then 'Too many attempts in a row. Please try again later.'
                              else 'Demasiados intentos seguidos. Prueba otra vez en un rato.' end;
  end if;

  insert into cem_becas_donaciones (paquete_id, monto, donante_nombre, donante_email, donante_pais,
    organizacion, mensaje, publica, anonima, idioma, metodo, estado, stripe_cuenta, origen, campana, ip)
  values (k.id, v_monto, v_nombre, v_email, nullif(left(btrim(coalesce(p_pais, '')), 60), ''),
    case when v_anonima then null else nullif(left(btrim(coalesce(p_organizacion, '')), 120), '') end,
    nullif(left(btrim(coalesce(p_mensaje, '')), 500), ''),
    coalesce(p_publica, false) and not v_anonima, v_anonima,
    case when v_en then 'en' else 'es' end, 'tarjeta', 'iniciada', a.stripe_cuenta,
    nullif(left(regexp_replace(lower(coalesce(p_origen, '')), '[^a-z0-9_.-]', '', 'g'), 40), ''),
    nullif(left(regexp_replace(coalesce(p_campana, ''), '[^a-zA-Z0-9_ -]', '', 'g'), 60), ''),
    nullif(left(btrim(coalesce(p_ip, '')), 64), ''))
  returning * into d;

  return jsonb_build_object('donacion_id', d.id, 'numero', cem_becas_numero('DON', d.numero),
    'monto', d.monto, 'moneda', d.moneda, 'stripe_cuenta', d.stripe_cuenta, 'idioma', d.idioma,
    'paquete', case when k.id is null then null when v_en then k.nombre_en else k.nombre_es end,
    'recibo_clave', d.recibo_clave);
end $$;

-- 3. EL CORREO DEL RECIBO lleva el enlace a la página del recibo. Lo demás,
--    igual que en 20261108000001.
create or replace function public.cem_becas_recibo(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare d cem_becas_donaciones; a cem_becas_ajustes; v_en boolean; v_metodo text;
begin
  select * into d from cem_becas_donaciones where id = p_id;
  if d.id is null or d.donante_email is null or d.estado <> 'confirmada' then return; end if;
  select * into a from cem_becas_ajustes where id = 1;
  v_en := d.idioma = 'en';
  v_metodo := case d.metodo
    when 'tarjeta' then case when v_en then 'card' else 'tarjeta' end
    when 'transferencia' then case when v_en then 'bank transfer' else 'transferencia' end
    when 'cheque' then case when v_en then 'check' else 'cheque' end
    when 'efectivo' then case when v_en then 'cash' else 'efectivo' end
    when 'zelle' then 'Zelle'
    else case when v_en then 'other' else 'otro' end end;
  if v_en then
    perform cem_becas_correo(d.donante_email,
      'Thank you for your gift · Receipt ' || cem_becas_numero('DON', d.numero),
      format(E'Hi %s,\n\nWe received your contribution to the CEM scholarship fund. Thank you: because of it, someone who couldn''t afford it today will get to study.\n\nReceipt: %s\nDate: %s\nAmount: %s\nPayment method: %s\n\nYour receipt, to view it or download it as a PDF:\nhttps://escuelacem.com/plataforma/recibo.html?r=%s\n\n%s\n\nEvery dollar in the fund is recorded. When your gift pays for a scholarship, we''ll write to tell you who it helped.\n\nHelp someone else study: https://escuelacem.com/plataforma/becas.html?lang=en',
        case when d.anonima then 'there' else split_part(btrim(d.donante_nombre), ' ', 1) end,
        cem_becas_numero('DON', d.numero),
        to_char(d.fecha, 'FMMonth FMDD, YYYY'), cem_becas_usd(d.monto, 'en'), v_metodo, d.recibo_clave, a.texto_recibo_en),
      'donacion-recibo:' || d.id);
  else
    perform cem_becas_correo(d.donante_email,
      'Gracias por tu aporte · Recibo ' || cem_becas_numero('DON', d.numero),
      format(E'Hola%s:\n\nRecibimos tu aporte al fondo de becas del CEM. Gracias de verdad: con él, alguien que hoy no podría pagarlo va a estudiar.\n\nRecibo: %s\nFecha: %s\nAporte: %s\nForma de pago: %s\n\nTu recibo, para verlo o descargarlo en PDF:\nhttps://escuelacem.com/plataforma/recibo.html?r=%s\n\n%s\n\nCada dólar del fondo queda anotado. Cuando tu aporte pague una beca, te escribimos para contarte a quién ayudó.\n\nAyuda a alguien más a estudiar: https://escuelacem.com/plataforma/becas.html',
        case when d.anonima then '' else ' ' || split_part(btrim(d.donante_nombre), ' ', 1) end,
        cem_becas_numero('DON', d.numero),
        to_char(d.fecha, 'DD/MM/YYYY'), cem_becas_usd(d.monto, 'es'), v_metodo, d.recibo_clave, a.texto_recibo_es),
      'donacion-recibo:' || d.id);
  end if;
end $$;

-- 4. LO QUE ENSEÑA LA PÁGINA DEL RECIBO a quien tiene su enlace. Hasta que el
--    cobro se confirma, sólo el estado y el número. Nunca el correo de quien
--    donó, y nunca el nombre de una donación anónima.
create or replace function public.cem_beca_recibo(p_clave text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d cem_becas_donaciones; a cem_becas_ajustes; v_en boolean;
begin
  if p_clave is null or length(p_clave) < 20 or length(p_clave) > 64 then
    return jsonb_build_object('hay', false);
  end if;
  select * into d from cem_becas_donaciones where recibo_clave = p_clave;
  if d.id is null then return jsonb_build_object('hay', false); end if;
  if d.estado <> 'confirmada' then
    return jsonb_build_object('hay', true, 'estado', d.estado, 'idioma', d.idioma,
                              'numero', cem_becas_numero('DON', d.numero));
  end if;
  select * into a from cem_becas_ajustes where id = 1;
  v_en := d.idioma = 'en';
  return jsonb_build_object(
    'hay', true, 'estado', d.estado, 'idioma', d.idioma,
    'numero', cem_becas_numero('DON', d.numero),
    'fecha', d.fecha, 'monto', d.monto, 'moneda', d.moneda, 'metodo', d.metodo,
    'referencia', coalesce(d.stripe_payment_intent, d.referencia),
    'paquete', (select case when v_en then k.nombre_en else k.nombre_es end
                  from cem_becas_paquetes k where k.id = d.paquete_id),
    'anonima', d.anonima,
    'nombre', case when d.anonima then null else d.donante_nombre end,
    'organizacion', case when d.anonima then null else nullif(btrim(d.organizacion), '') end,
    'pais', nullif(btrim(d.donante_pais), ''),
    'con_correo', d.donante_email is not null,
    'nota', case when v_en then a.texto_recibo_en else a.texto_recibo_es end);
end $$;

revoke all on function public.cem_beca_recibo(text) from public, anon;
grant execute on function public.cem_beca_recibo(text) to anon, authenticated;
comment on function public.cem_beca_recibo(text) is
  'Pública: el recibo de una donación para quien tiene su enlace. El enlace es la llave. Hasta que el cobro se confirma sólo dice su estado, y nunca lleva el correo de quien donó ni el nombre de una donación anónima.';

-- 5. EL DETALLE DEL EQUIPO lleva la llave, para «Ver recibo» y «Copiar
--    enlace del recibo». Lo demás, igual que en 20261107000004.
create or replace function public.cem_beca_donacion_detalle(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d cem_becas_donaciones;
begin
  if not (cem_puede_cobranza() or cem_es_auditor()) then
    raise exception 'Sólo cobranza y administración pueden ver las donaciones.' using errcode = '42501';
  end if;
  select * into d from cem_becas_donaciones where id = p_id;
  if d.id is null then raise exception 'Esa donación no existe.'; end if;
  return jsonb_build_object(
    'numero', cem_becas_numero('DON', d.numero), 'queda', cem_becas_queda(d.id),
    'recibo_clave', d.recibo_clave,
    'becas', coalesce((select jsonb_agg(jsonb_build_object(
          'beca', cem_becas_numero('BEC', b.numero), 'beca_id', b.id, 'nombre', b.nombre, 'pais', b.pais,
          'programa', c.nombre, 'estado', b.estado, 'monto', f.monto, 'liberada_en', f.liberada_en,
          'fecha', coalesce(b.activada_en, b.creada_en)) order by b.numero)
        from cem_becas_financiacion f
        join cem_becas b on b.id = f.beca_id
        left join cem_courses c on c.id = b.course_id
       where f.donacion_id = d.id), '[]'::jsonb),
    'movimientos', coalesce((select jsonb_agg(jsonb_build_object('fecha', m.fecha, 'tipo', m.tipo,
          'monto', m.monto, 'nota', m.nota) order by m.id)
        from cem_becas_fondo m where m.donacion_id = d.id), '[]'::jsonb));
end $$;
