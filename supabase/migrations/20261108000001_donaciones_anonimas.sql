-- Donaciones: el correo es opcional, se puede donar de forma anónima y la
-- página de becas enseña un contador de lo recibido.
--
-- Lo que decidió el dueño:
-- · El contador enseña el número de donaciones Y el total donado.
-- · Una donación anónima con tarjeta no guarda el nombre, pero sí el correo
--   que la persona pone al pagar en Stripe: con él se le manda el recibo y se
--   le cuenta a quién ayudó su aporte. Anónima quiere decir que no sale en
--   ningún sitio público.
--
-- Sólo se cambia lo que hace falta: las funciones se rehacen enteras (como
-- exige `create or replace`) pero con lo mismo de antes salvo lo marcado.

-- 1. LA MARCA
alter table public.cem_becas_donaciones add column if not exists anonima boolean not null default false;
comment on column public.cem_becas_donaciones.anonima is
  'Donó sin dar su nombre: no sale en ningún sitio público y los correos no la saludan por el nombre. El correo, si lo hay, sí se guarda para el recibo.';

-- 2. ABRIR UNA DONACIÓN CON TARJETA: sin nombre es anónima; el correo, si
--    no viene, lo pide Stripe al pagar y llega con el aviso de cobro.
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
    'paquete', case when k.id is null then null when v_en then k.nombre_en else k.nombre_es end);
end $$;

-- 3. EL RECIBO: a una anónima no se la saluda por un nombre que no dio.
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
      format(E'Hi %s,\n\nWe received your contribution to the CEM scholarship fund. Thank you: because of it, someone who couldn''t afford it today will get to study.\n\nReceipt: %s\nDate: %s\nAmount: %s\nPayment method: %s\n\n%s\n\nEvery dollar in the fund is recorded. When your gift pays for a scholarship, we''ll write to tell you who it helped.\n\nHelp someone else study: https://escuelacem.com/plataforma/becas.html?lang=en',
        case when d.anonima then 'there' else split_part(btrim(d.donante_nombre), ' ', 1) end,
        cem_becas_numero('DON', d.numero),
        to_char(d.fecha, 'FMMonth FMDD, YYYY'), cem_becas_usd(d.monto, 'en'), v_metodo, a.texto_recibo_en),
      'donacion-recibo:' || d.id);
  else
    perform cem_becas_correo(d.donante_email,
      'Gracias por tu aporte · Recibo ' || cem_becas_numero('DON', d.numero),
      format(E'Hola%s:\n\nRecibimos tu aporte al fondo de becas del CEM. Gracias de verdad: con él, alguien que hoy no podría pagarlo va a estudiar.\n\nRecibo: %s\nFecha: %s\nAporte: %s\nForma de pago: %s\n\n%s\n\nCada dólar del fondo queda anotado. Cuando tu aporte pague una beca, te escribimos para contarte a quién ayudó.\n\nAyuda a alguien más a estudiar: https://escuelacem.com/plataforma/becas.html',
        case when d.anonima then '' else ' ' || split_part(btrim(d.donante_nombre), ' ', 1) end,
        cem_becas_numero('DON', d.numero),
        to_char(d.fecha, 'DD/MM/YYYY'), cem_becas_usd(d.monto, 'es'), v_metodo, a.texto_recibo_es),
      'donacion-recibo:' || d.id);
  end if;
end $$;

-- 4. EL AVISO AL EQUIPO: «Donación anónima de $X».
create or replace function public.cem_becas_donacion_entra(p_id uuid, p_actor uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare d cem_becas_donaciones;
begin
  select * into d from cem_becas_donaciones where id = p_id;
  insert into cem_becas_fondo (tipo, monto, donacion_id, actor_id)
  values ('donacion', d.monto, d.id, p_actor);

  perform cem_avisar_equipo('donacion_recibida',
    case when d.anonima then format('Donación anónima de %s', cem_becas_usd(d.monto, 'es'))
         else format('Donación de %s de %s', cem_becas_usd(d.monto, 'es'),
                     coalesce(nullif(btrim(d.organizacion), ''), d.donante_nombre)) end,
    format(E'%s · %s%s. El fondo de becas tiene ahora %s disponibles.',
           cem_becas_numero('DON', d.numero), d.metodo,
           coalesce(', desde ' || nullif(btrim(d.donante_pais), ''), ''),
           cem_becas_usd(cem_becas_disponible(), 'es')),
    'admin/donaciones.html?id=' || d.id,
    array['cobranza', 'admin', 'superadmin']);

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  values (p_actor, case when p_actor is null then 'stripe' else (select email from cem_profiles where id = p_actor) end,
          'beca.donacion_confirmada', 'cem_becas_donaciones', d.id, 'medio',
          jsonb_build_object('donacion', cem_becas_numero('DON', d.numero), 'monto', d.monto,
                             'metodo', d.metodo, 'referencia', coalesce(d.stripe_payment_intent, d.referencia)));
end $$;

-- 5. CONFIRMAR: el correo que Stripe pidió al pagar se guarda si la persona no
--    lo había dado. La firma cambia (p_email al final, con valor por defecto):
--    se borra la de seis parámetros, y el webhook que aún no lo manda sigue
--    llegando a ésta.
drop function if exists public.cem_beca_donacion_confirmar_servidor(uuid, text, text, bigint, text, text);
create or replace function public.cem_beca_donacion_confirmar_servidor(
  p_id uuid, p_session_id text, p_payment_intent text, p_centimos bigint, p_moneda text, p_cuenta text,
  p_email text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d cem_becas_donaciones; v_monto numeric; v_nota text;
        v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  perform cem_becas_exigir_servidor();
  perform pg_advisory_xact_lock(hashtext('cem_becas_fondo'));
  select * into d from cem_becas_donaciones where id = p_id for update;
  if d.id is null then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if d.estado = 'confirmada' then return jsonb_build_object('ok', true, 'repetida', true); end if;
  if d.estado = 'anulada' then
    update cem_becas_donaciones
       set nota = trim(both ' ' from coalesce(nota, '') || ' Stripe avisó de un cobro después de anularla: revisar.')
     where id = d.id;
    return jsonb_build_object('ok', false, 'motivo', 'anulada');
  end if;
  if coalesce(d.stripe_cuenta, '') is distinct from coalesce(p_cuenta, '') then
    update cem_becas_donaciones
       set nota = trim(both ' ' from coalesce(nota, '') || ' Aviso de Stripe desde otra cuenta (' || coalesce(p_cuenta, 'principal') || '): revisar.')
     where id = d.id;
    return jsonb_build_object('ok', false, 'motivo', 'otra_cuenta');
  end if;
  if upper(coalesce(p_moneda, '')) <> 'USD' then
    update cem_becas_donaciones
       set nota = trim(both ' ' from coalesce(nota, '') || ' Stripe cobró en ' || upper(coalesce(p_moneda, '?')) || ', no en USD: revisar.')
     where id = d.id;
    return jsonb_build_object('ok', false, 'motivo', 'otra_moneda');
  end if;

  v_monto := round(coalesce(p_centimos, 0) / 100.0, 2);
  if v_monto <= 0 then return jsonb_build_object('ok', false, 'motivo', 'sin_importe'); end if;
  if v_monto <> d.monto then
    v_nota := format('Stripe cobró %s; se esperaba %s.', cem_becas_usd(v_monto, 'es'), cem_becas_usd(d.monto, 'es'));
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then v_email := null; end if;

  update cem_becas_donaciones
     set estado = 'confirmada', monto = v_monto, fecha = current_date,
         donante_email = coalesce(donante_email, left(v_email, 120)),
         stripe_session_id = coalesce(stripe_session_id, p_session_id),
         stripe_payment_intent = coalesce(p_payment_intent, stripe_payment_intent),
         confirmada_en = now(),
         nota = case when v_nota is null then nota else trim(both ' ' from coalesce(nota, '') || ' ' || v_nota) end
   where id = d.id;

  perform cem_becas_donacion_entra(d.id, null);
  perform cem_becas_recibo(d.id);
  return jsonb_build_object('ok', true, 'numero', cem_becas_numero('DON', d.numero));
end $$;

revoke all on function public.cem_beca_donacion_confirmar_servidor(uuid, text, text, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.cem_beca_donacion_confirmar_servidor(uuid, text, text, bigint, text, text, text) to service_role;
comment on function public.cem_beca_donacion_confirmar_servidor(uuid, text, text, bigint, text, text, text) is
  'Sólo el servidor (el webhook de Stripe): da por cobrada una donación con el importe real, la suma al fondo una sola vez y manda el recibo. Si la persona no dio su correo, se guarda el que Stripe pidió al pagar.';

-- 6. EL CORREO DE IMPACTO, dentro de la inscripción becada: igual que el
--    recibo, sin nombre para quien donó de forma anónima.
create or replace function public.cem_becas_inscribir(p_beca_id uuid, p_profile_id uuid, p_avisar boolean default true)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  b cem_becas; c cem_courses; p cem_profiles; e cem_enrollments; v_enr uuid;
  v_codigo text; v_quien text; v_en boolean; r record; v_asunto text; v_cuerpo text;
begin
  select * into b from cem_becas where id = p_beca_id for update;
  if b.id is null then raise exception 'Esa beca no existe.'; end if;
  if b.estado <> 'por_activar' then raise exception 'Esa beca ya está %.', b.estado; end if;
  select * into c from cem_courses where id = b.course_id;
  if c.id is null then raise exception 'El programa de esa beca ya no existe.'; end if;
  select * into p from cem_profiles where id = p_profile_id;
  if p.id is null or not p.activo then raise exception 'Esa cuenta no existe o está desactivada.'; end if;

  v_codigo := cem_becas_numero('BEC', b.numero);

  select * into e from cem_enrollments
   where profile_id = p_profile_id and course_id = b.course_id
     and estado not in ('cancelada', 'finalizada')
   order by created_at desc limit 1;

  if e.id is not null then
    if exists (select 1 from cem_payments where enrollment_id = e.id and estado = 'confirmado') then
      raise exception 'Esa persona ya está inscrita en % y pagó parte. Una beca no se aplica a medias: habla con cobranza.', c.nombre;
    end if;
    if exists (select 1 from cem_payments where enrollment_id = e.id and estado in ('registrado', 'reportado')) then
      raise exception 'Hay un pago de % sin revisar en esa inscripción. Cobranza tiene que aprobarlo o rechazarlo antes de aplicar la beca.', c.nombre;
    end if;
    if coalesce(e.precio_final, 0) <= 0 then
      raise exception 'Esa persona ya tiene % sin coste.', c.nombre;
    end if;
    update cem_enrollments
       set precio_lista = coalesce(c.precio, 0), descuento = coalesce(c.precio, 0), precio_final = 0,
           estado = 'activa', fuente = 'beca', promocion = v_codigo,
           cohort_id = coalesce(b.cohort_id, cohort_id)
     where id = e.id;
    update cem_installments
       set estado = 'anulada', saldo = 0,
           nota = trim(both ' ' from coalesce(nota, '') || ' Anulada: el programa pasó a beca ' || v_codigo || '.')
     where enrollment_id = e.id and estado in ('pendiente', 'vencida');
    v_enr := e.id;
  else
    insert into cem_enrollments (profile_id, course_id, cohort_id, precio_lista, descuento, precio_final,
                                 moneda, estado, fuente, promocion)
    values (p_profile_id, b.course_id, b.cohort_id, coalesce(c.precio, 0), coalesce(c.precio, 0), 0,
            coalesce(nullif(btrim(c.moneda), ''), 'EUR'), 'activa', 'beca', v_codigo)
    returning id into v_enr;
  end if;

  update cem_becas
     set estado = 'otorgada', profile_id = p_profile_id, enrollment_id = v_enr, activada_en = now(),
         email = coalesce(email, lower(p.email)),
         nombre = coalesce(nullif(btrim(nombre), ''), btrim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, ''))),
         pais = coalesce(nullif(btrim(pais), ''), p.pais)
   where id = b.id
  returning * into b;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), (select email from cem_profiles where id = auth.uid()),
          'beca.activada', 'cem_becas', b.id, 'medio',
          jsonb_build_object('beca', v_codigo, 'tipo', b.tipo, 'curso', c.nombre,
                             'persona', p_profile_id, 'inscripcion', v_enr, 'valor_usd', b.valor_usd));

  perform cem_notificar(p_profile_id, 'beca_otorgada',
    'Tienes una beca para ' || c.nombre,
    format(E'El CEM te da una beca completa para %s: ya está en tu panel y no tienes que pagar nada.%s\n\nEntra cuando quieras: https://escuelacem.com/plataforma/estudiante/panel.html',
           c.nombre, coalesce(E'\n\n' || nullif(btrim(b.mensaje), ''), '')),
    'estudiante/panel.html', p_avisar);

  if b.tipo = 'fondo' then
    v_quien := split_part(btrim(b.nombre), ' ', 1);
    for r in
      select d.id, d.numero, d.donante_nombre, d.donante_email, d.idioma, d.anonima, f.monto as parte,
             cem_becas_queda(d.id) as queda
        from cem_becas_financiacion f
        join cem_becas_donaciones d on d.id = f.donacion_id
       where f.beca_id = b.id and f.liberada_en is null and d.donante_email is not null
    loop
      v_en := r.idioma = 'en';
      if v_en then
        v_asunto := 'Your gift is now paying for a scholarship';
        v_cuerpo := format(E'Hi %s,\n\nWe wanted to tell you what your gift %s became: it just paid for %s to study %s.\n\n%s of your gift went to it.%s\n\nThank you for making it possible.\n\nThe CEM team',
          case when r.anonima then 'there' else split_part(btrim(r.donante_nombre), ' ', 1) end,
          cem_becas_numero('DON', r.numero),
          case when b.publicable and v_quien <> '' then v_quien || '''s scholarship' || coalesce(', from ' || nullif(btrim(b.pais), ''), '')
               else 'a scholarship for someone' || coalesce(' from ' || nullif(btrim(b.pais), ''), '') end,
          c.nombre, cem_becas_usd(r.parte, 'en'),
          case when r.queda > 0 then ' What remains stays in the fund for the next scholarship.' else '' end);
      else
        v_asunto := 'Tu aporte ya está pagando una beca';
        v_cuerpo := format(E'Hola%s:\n\nTe escribimos para contarte en qué se convirtió tu aporte %s: acaba de pagar %s, que va a estudiar %s.\n\nDe tu aporte se usaron %s.%s\n\nGracias por hacerlo posible.\n\nEquipo CEM',
          case when r.anonima then '' else ' ' || split_part(btrim(r.donante_nombre), ' ', 1) end,
          cem_becas_numero('DON', r.numero),
          case when b.publicable and v_quien <> '' then 'la beca de ' || v_quien || coalesce(', de ' || nullif(btrim(b.pais), ''), '')
               else 'la beca de una persona' || coalesce(' de ' || nullif(btrim(b.pais), ''), '') end,
          c.nombre, cem_becas_usd(r.parte, 'es'),
          case when r.queda > 0 then ' Lo que queda sigue en el fondo para la próxima beca.' else '' end);
      end if;
      perform cem_becas_correo(r.donante_email, v_asunto, v_cuerpo, 'beca-impacto:' || b.id || ':' || r.id);
    end loop;
  end if;

  return v_enr;
end $$;

-- 7. LO PÚBLICO: el contador (cuántas donaciones y cuánto), cuántas personas
--    donaron sin salir con su nombre, y el recuento de donantes sin juntar a
--    todas las anónimas en una.
create or replace function public.cem_becas_publico(p_idioma text default 'es')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a cem_becas_ajustes; v_en boolean := lower(coalesce(p_idioma, 'es')) = 'en';
begin
  select * into a from cem_becas_ajustes where id = 1;
  return jsonb_build_object(
    'cifras', (select jsonb_build_object(
        'becas', count(*),
        'valor_usd', coalesce(sum(b.valor_usd), 0),
        'paises', count(distinct lower(btrim(b.pais))) filter (where nullif(btrim(b.pais), '') is not null))
       from cem_becas b where b.estado = 'otorgada')
      || (select jsonb_build_object('donaciones', count(*), 'donado_usd', coalesce(sum(d.monto), 0))
            from cem_becas_donaciones d where d.estado = 'confirmada'),
    'donantes', (select count(distinct coalesce(nullif(lower(btrim(d.donante_email)), ''),
                                                case when d.anonima then d.id::text else lower(btrim(d.donante_nombre)) end))
                   from cem_becas_donaciones d where d.estado = 'confirmada'),
    'paquetes', coalesce((select jsonb_agg(jsonb_build_object(
          'id', k.id, 'monto', k.monto, 'destacado', k.destacado,
          'nombre', case when v_en then k.nombre_en else k.nombre_es end,
          'descripcion', case when v_en then k.descripcion_en else k.descripcion_es end)
        order by k.orden, k.monto)
       from cem_becas_paquetes k where k.activo), '[]'::jsonb),
    'otro_monto', jsonb_build_object('permitido', coalesce(a.otro_monto, false),
                                     'minimo', a.otro_monto_minimo, 'maximo', a.otro_monto_maximo),
    'convocatorias', coalesce((select jsonb_agg(jsonb_build_object(
          'codigo', v.codigo, 'titulo', v.titulo, 'descripcion', v.descripcion, 'cierra_en', v.cierra_en,
          'quedan', case when v.cupos is null then null
                         else greatest(v.cupos - (select count(*) from cem_becas b
                                                   where b.convocatoria_id = v.id
                                                     and b.estado in ('por_activar', 'otorgada')), 0) end)
        order by (v.codigo = 'becas-cem'), v.creada_en desc)
       from cem_becas_convocatorias v
      where v.activa and (v.abre_en is null or v.abre_en <= now())
        and (v.cierra_en is null or v.cierra_en > now())
        and (v.cupos is null or v.cupos > (select count(*) from cem_becas b
                                            where b.convocatoria_id = v.id
                                              and b.estado in ('por_activar', 'otorgada')))), '[]'::jsonb),
    'historias', case when coalesce(a.mostrar_historias, false) then coalesce((select jsonb_agg(x.h order by x.cuando desc) from (
          select jsonb_build_object('nombre', split_part(btrim(b.nombre), ' ', 1), 'pais', b.pais,
                                    'programa', coalesce(c.nombre, b.curso_texto), 'historia', b.historia) as h,
                 coalesce(b.activada_en, b.creada_en) as cuando
            from cem_becas b left join cem_courses c on c.id = b.course_id
           where b.estado = 'otorgada' and b.publicable
           order by coalesce(b.activada_en, b.creada_en) desc limit 6) x), '[]'::jsonb)
      else '[]'::jsonb end,
    'lista_donantes', case when coalesce(a.mostrar_donantes, false) then coalesce((select jsonb_agg(x.quien order by x.cuando desc) from (
          select coalesce(nullif(btrim(d.organizacion), ''), btrim(d.donante_nombre)) as quien, max(d.confirmada_en) as cuando
            from cem_becas_donaciones d
           where d.estado = 'confirmada' and d.publica and not d.anonima
           group by 1 order by 2 desc limit 40) x), '[]'::jsonb)
      else '[]'::jsonb end,
    -- Quienes donaron sin salir con su nombre, para el «y N personas más».
    -- Una persona que repite cuenta una vez si dio su correo.
    'donantes_sin_nombre', case when coalesce(a.mostrar_donantes, false) then
        (select count(distinct coalesce(nullif(lower(btrim(d.donante_email)), ''), d.id::text))
           from cem_becas_donaciones d where d.estado = 'confirmada' and (not d.publica or d.anonima))
      else 0 end,
    'precio_medio_usd', (select round(avg(round(c.precio * 0.9, 2) * cem_becas_cambio_usd_seguro(c.moneda)), 2)
                           from cem_courses c where c.estado = 'publicado' and coalesce(c.precio, 0) > 0));
end $$;

-- 8. EL RESUMEN DEL EQUIPO: el mismo recuento de donantes.
create or replace function public.cem_becas_resumen()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not cem_becas_puede_ver() then
    raise exception 'Sólo el equipo puede ver las becas.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'disponible', cem_becas_disponible(),
    'donado', (select coalesce(sum(monto), 0) from cem_becas_donaciones where estado = 'confirmada'),
    'donado_mes', (select coalesce(sum(monto), 0) from cem_becas_donaciones
                    where estado = 'confirmada' and fecha >= date_trunc('month', current_date)),
    'donaciones', (select count(*) from cem_becas_donaciones where estado = 'confirmada'),
    'donantes', (select count(distinct coalesce(nullif(lower(btrim(donante_email)), ''),
                                                case when anonima then id::text else lower(btrim(donante_nombre)) end))
                   from cem_becas_donaciones where estado = 'confirmada'),
    'reservado', (select coalesce(sum(valor_usd), 0) from cem_becas where estado = 'por_activar' and tipo = 'fondo'),
    'por_activar', (select count(*) from cem_becas where estado = 'por_activar'),
    'vencidas', (select count(*) from cem_becas where estado = 'por_activar' and vence_en < now()),
    'otorgadas', (select count(*) from cem_becas where estado = 'otorgada'),
    'valor_otorgado', (select coalesce(sum(valor_usd), 0) from cem_becas where estado = 'otorgada'),
    'solicitudes', (select coalesce(jsonb_object_agg(estado, n), '{}'::jsonb)
                      from (select estado, count(*) as n from cem_becas_solicitudes group by estado) x),
    'por_revisar', (select count(*) from cem_becas_solicitudes where estado in ('recibida', 'en_revision')),
    'publico', cem_becas_publico('es')->'cifras');
end $$;

-- 9. LA LISTA DEL EQUIPO: dice cuáles son anónimas.
create or replace function public.cem_becas_donaciones_listar(p_estado text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (cem_puede_cobranza() or cem_es_auditor()) then
    raise exception 'Sólo cobranza y administración pueden ver las donaciones.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id, 'numero', cem_becas_numero('DON', d.numero), 'estado', d.estado, 'metodo', d.metodo,
      'monto', d.monto, 'moneda', d.moneda, 'fecha', d.fecha, 'creada_en', d.creada_en,
      'confirmada_en', d.confirmada_en, 'donante', d.donante_nombre, 'email', d.donante_email,
      'pais', d.donante_pais, 'organizacion', d.organizacion, 'mensaje', d.mensaje, 'publica', d.publica,
      'anonima', d.anonima,
      'idioma', d.idioma, 'paquete', (select k.nombre_es from cem_becas_paquetes k where k.id = d.paquete_id),
      'referencia', coalesce(d.referencia, d.stripe_payment_intent), 'stripe_cuenta', d.stripe_cuenta,
      'comprobante', d.comprobante, 'origen', d.origen, 'campana', d.campana, 'nota', d.nota,
      'registrada_por', (select trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')) from cem_profiles p where p.id = d.registrada_por),
      'anulada_en', d.anulada_en, 'motivo_anulacion', d.motivo_anulacion,
      'usado', coalesce((select sum(f.monto) from cem_becas_financiacion f where f.donacion_id = d.id and f.liberada_en is null), 0),
      'queda', cem_becas_queda(d.id))
    order by coalesce(d.confirmada_en, d.creada_en) desc)
    from cem_becas_donaciones d
   where (p_estado is null and d.estado <> 'iniciada') or d.estado = p_estado), '[]'::jsonb);
end $$;

-- 10. LA DONACIÓN A MANO: sin nombre también es anónima.
create or replace function public.cem_beca_donacion_registrar(
  p_monto numeric, p_metodo text, p_referencia text, p_fecha date, p_nombre text,
  p_email text default null, p_pais text default null, p_organizacion text default null,
  p_mensaje text default null, p_publica boolean default false, p_comprobante text default null,
  p_idioma text default 'es', p_enviar_recibo boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d cem_becas_donaciones; v_ref text := nullif(btrim(coalesce(p_referencia, '')), '');
        v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
        v_en boolean := lower(coalesce(p_idioma, 'es')) = 'en';
        v_nombre text := left(btrim(coalesce(p_nombre, '')), 80); v_anonima boolean;
begin
  if not cem_puede_cobranza() then
    raise exception 'Sólo cobranza y administración pueden registrar donaciones.' using errcode = '42501';
  end if;
  if coalesce(p_metodo, '') not in ('zelle', 'transferencia', 'cheque', 'efectivo', 'otro') then
    raise exception 'Elige cómo llegó: Zelle, transferencia, cheque, efectivo u otro. Las de tarjeta entran solas.';
  end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'El monto tiene que ser mayor que cero.'; end if;
  if p_monto > 1000000 then raise exception 'Ese monto parece un error de tecleo.'; end if;
  if v_ref is null and p_metodo <> 'efectivo' then
    raise exception 'Falta la referencia (el número de la operación o del cheque).';
  end if;
  v_anonima := length(v_nombre) < 2;
  if v_anonima then v_nombre := case when v_en then 'Anonymous' else 'Anónimo' end; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'Ese correo no parece un correo.';
  end if;
  if p_fecha is not null and p_fecha > current_date then raise exception 'La fecha no puede ser futura.'; end if;

  perform pg_advisory_xact_lock(hashtext('cem_becas_fondo'));
  insert into cem_becas_donaciones (monto, donante_nombre, donante_email, donante_pais, organizacion, mensaje,
    publica, anonima, idioma, metodo, estado, referencia, comprobante, fecha, registrada_por, confirmada_en, confirmada_por)
  values (round(p_monto, 2), v_nombre, v_email, nullif(left(btrim(coalesce(p_pais, '')), 60), ''),
    case when v_anonima then null else nullif(left(btrim(coalesce(p_organizacion, '')), 120), '') end,
    nullif(left(btrim(coalesce(p_mensaje, '')), 500), ''),
    coalesce(p_publica, false) and not v_anonima, v_anonima, case when v_en then 'en' else 'es' end,
    p_metodo, 'confirmada', v_ref, nullif(btrim(coalesce(p_comprobante, '')), ''),
    coalesce(p_fecha, current_date), auth.uid(), now(), auth.uid())
  returning * into d;

  perform cem_becas_donacion_entra(d.id, auth.uid());
  if coalesce(p_enviar_recibo, true) then perform cem_becas_recibo(d.id); end if;
  return jsonb_build_object('ok', true, 'id', d.id, 'numero', cem_becas_numero('DON', d.numero));
exception when unique_violation then
  raise exception 'Ya hay una donación registrada por % con la referencia «%».', p_metodo, v_ref;
end $$;

-- 11. CEMI: si le preguntan por donar sin dar el nombre. Sólo si el guion
--     sigue como se sembró: uno que el equipo haya editado no se toca.
update public.cem_bot_guiones
   set guion = guion || E'\nSi dice «puedo donar de forma anónima?» → Cemi: Sí. En la página marcas «Donar de forma anónima»: tu nombre no aparece en ningún sitio, y el recibo te llega al correo que pongas al pagar.',
       actualizado_en = now()
 where tema = 'Donar y ayudar a otros a estudiar' and origen = 'semilla'
   and guion not like '%donar de forma anónima%';
