-- Becas y donaciones. 3 de 4: el servidor y el equipo.
--
-- QUIÉN PUEDE QUÉ
-- · Revisar solicitudes y armar convocatorias: el equipo (coordinación,
--   admin, superadmin): cem_is_staff().
-- · Dar, regalar y revocar becas, anular donaciones, tocar paquetes y
--   ajustes: sólo admin y superadmin (cem_es_admin()), porque mueven dinero
--   del fondo o deciden a quién se le regala.
-- · Registrar una donación que llegó por Zelle, transferencia o cheque:
--   cobranza para arriba (cem_puede_cobranza()), que es quien la ve llegar.
-- · Leerlo todo: también el auditor (cem_es_auditor()), sin escribir nada.
-- · Abrir y confirmar las donaciones con tarjeta: sólo el servidor (la
--   función cem-donar y el webhook de Stripe, con la clave de servicio).

-- ═══ 1. SÓLO EL SERVIDOR ════════════════════════════════════════════════════

create or replace function public.cem_becas_exigir_servidor()
returns void
language plpgsql stable set search_path = public as $$
begin
  if auth.uid() is not null or not cem_es_servidor() then
    raise exception 'Esto sólo lo hace el servidor.' using errcode = '42501';
  end if;
end $$;

-- Abrir una donación con tarjeta: valida, frena y la deja «iniciada». El
-- importe lo pone la base (el del paquete, o el «otro monto» dentro de sus
-- límites): nunca el navegador.
create or replace function public.cem_beca_donacion_abrir(
  p_paquete_id uuid, p_monto numeric, p_nombre text, p_email text, p_pais text default null,
  p_organizacion text default null, p_mensaje text default null, p_publica boolean default false,
  p_idioma text default 'es', p_origen text default null, p_campana text default null, p_ip text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  a cem_becas_ajustes; k cem_becas_paquetes; v_en boolean := lower(coalesce(p_idioma, 'es')) = 'en';
  v_monto numeric; v_email text := lower(btrim(coalesce(p_email, ''))); v_nombre text := left(btrim(coalesce(p_nombre, '')), 80);
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

  if length(v_nombre) < 2 then
    raise exception '%', case when v_en then 'Please tell us your name.' else 'Hace falta tu nombre.' end;
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception '%', case when v_en then 'That email doesn''t look right.' else 'Ese correo no parece un correo.' end;
  end if;

  -- Frenos: por correo, por dirección y en total. Una página de donar con
  -- tarjeta es el sitio donde se prueban tarjetas robadas.
  if not cem_rate_limit_consumir('donacion:' || v_email, 6, 3600, 3600)
     or (nullif(btrim(coalesce(p_ip, '')), '') is not null
         and not cem_rate_limit_consumir('donacion-ip:' || left(btrim(p_ip), 64), 12, 3600, 3600))
     or not cem_rate_limit_consumir('donaciones-con-tarjeta', 80, 3600, 900) then
    raise exception '%', case when v_en then 'Too many attempts in a row. Please try again later.'
                              else 'Demasiados intentos seguidos. Prueba otra vez en un rato.' end;
  end if;

  insert into cem_becas_donaciones (paquete_id, monto, donante_nombre, donante_email, donante_pais,
    organizacion, mensaje, publica, idioma, metodo, estado, stripe_cuenta, origen, campana, ip)
  values (k.id, v_monto, v_nombre, v_email, nullif(left(btrim(coalesce(p_pais, '')), 60), ''),
    nullif(left(btrim(coalesce(p_organizacion, '')), 120), ''), nullif(left(btrim(coalesce(p_mensaje, '')), 500), ''),
    coalesce(p_publica, false), case when v_en then 'en' else 'es' end, 'tarjeta', 'iniciada', a.stripe_cuenta,
    nullif(left(regexp_replace(lower(coalesce(p_origen, '')), '[^a-z0-9_.-]', '', 'g'), 40), ''),
    nullif(left(regexp_replace(coalesce(p_campana, ''), '[^a-zA-Z0-9_ -]', '', 'g'), 60), ''),
    nullif(left(btrim(coalesce(p_ip, '')), 64), ''))
  returning * into d;

  return jsonb_build_object('donacion_id', d.id, 'numero', cem_becas_numero('DON', d.numero),
    'monto', d.monto, 'moneda', d.moneda, 'stripe_cuenta', d.stripe_cuenta, 'idioma', d.idioma,
    'paquete', case when k.id is null then null when v_en then k.nombre_en else k.nombre_es end);
end $$;

create or replace function public.cem_beca_donacion_sesion(p_id uuid, p_session_id text)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform cem_becas_exigir_servidor();
  update cem_becas_donaciones set stripe_session_id = p_session_id
   where id = p_id and estado = 'iniciada' and stripe_session_id is null;
end $$;

-- El recibo, en el idioma de quien donó. El de inglés empieza por «Hi …»:
-- cem_correo_html lo reconoce y pone la cabecera y el pie en inglés.
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
        split_part(btrim(d.donante_nombre), ' ', 1), cem_becas_numero('DON', d.numero),
        to_char(d.fecha, 'FMMonth FMDD, YYYY'), cem_becas_usd(d.monto, 'en'), v_metodo, a.texto_recibo_en),
      'donacion-recibo:' || d.id);
  else
    perform cem_becas_correo(d.donante_email,
      'Gracias por tu aporte · Recibo ' || cem_becas_numero('DON', d.numero),
      format(E'Hola %s:\n\nRecibimos tu aporte al fondo de becas del CEM. Gracias de verdad: con él, alguien que hoy no podría pagarlo va a estudiar.\n\nRecibo: %s\nFecha: %s\nAporte: %s\nForma de pago: %s\n\n%s\n\nCada dólar del fondo queda anotado. Cuando tu aporte pague una beca, te escribimos para contarte a quién ayudó.\n\nAyuda a alguien más a estudiar: https://escuelacem.com/plataforma/becas.html',
        split_part(btrim(d.donante_nombre), ' ', 1), cem_becas_numero('DON', d.numero),
        to_char(d.fecha, 'DD/MM/YYYY'), cem_becas_usd(d.monto, 'es'), v_metodo, a.texto_recibo_es),
      'donacion-recibo:' || d.id);
  end if;
end $$;

-- Lo que hace entrar una donación en el fondo, venga de Stripe o del equipo.
create or replace function public.cem_becas_donacion_entra(p_id uuid, p_actor uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare d cem_becas_donaciones;
begin
  select * into d from cem_becas_donaciones where id = p_id;
  insert into cem_becas_fondo (tipo, monto, donacion_id, actor_id)
  values ('donacion', d.monto, d.id, p_actor);

  perform cem_avisar_equipo('donacion_recibida',
    format('Donación de %s de %s', cem_becas_usd(d.monto, 'es'),
           coalesce(nullif(btrim(d.organizacion), ''), d.donante_nombre)),
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

-- Lo que llama el webhook de Stripe cuando una donación se cobró. Dos avisos
-- iguales no suman dos veces (la fila se bloquea, y el libro tiene una sola
-- entrada por donación). Lo que no cuadra se anota y se contesta que sí, para
-- que Stripe no reintente durante días algo que no se arregla solo.
create or replace function public.cem_beca_donacion_confirmar_servidor(
  p_id uuid, p_session_id text, p_payment_intent text, p_centimos bigint, p_moneda text, p_cuenta text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d cem_becas_donaciones; v_monto numeric; v_nota text;
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

  -- Lo que entra es lo que Stripe dice que cobró.
  v_monto := round(coalesce(p_centimos, 0) / 100.0, 2);
  if v_monto <= 0 then return jsonb_build_object('ok', false, 'motivo', 'sin_importe'); end if;
  if v_monto <> d.monto then
    v_nota := format('Stripe cobró %s; se esperaba %s.', cem_becas_usd(v_monto, 'es'), cem_becas_usd(d.monto, 'es'));
  end if;

  update cem_becas_donaciones
     set estado = 'confirmada', monto = v_monto, fecha = current_date,
         stripe_session_id = coalesce(stripe_session_id, p_session_id),
         stripe_payment_intent = coalesce(p_payment_intent, stripe_payment_intent),
         confirmada_en = now(),
         nota = case when v_nota is null then nota else trim(both ' ' from coalesce(nota, '') || ' ' || v_nota) end
   where id = d.id;

  perform cem_becas_donacion_entra(d.id, null);
  perform cem_becas_recibo(d.id);
  return jsonb_build_object('ok', true, 'numero', cem_becas_numero('DON', d.numero));
end $$;

revoke all on function public.cem_becas_exigir_servidor() from public, anon, authenticated;
revoke all on function public.cem_becas_recibo(uuid) from public, anon, authenticated;
revoke all on function public.cem_becas_donacion_entra(uuid, uuid) from public, anon, authenticated;
revoke all on function public.cem_beca_donacion_abrir(uuid, numeric, text, text, text, text, text, boolean, text, text, text, text) from public, anon, authenticated;
grant execute on function public.cem_beca_donacion_abrir(uuid, numeric, text, text, text, text, text, boolean, text, text, text, text) to service_role;
revoke all on function public.cem_beca_donacion_sesion(uuid, text) from public, anon, authenticated;
grant execute on function public.cem_beca_donacion_sesion(uuid, text) to service_role;
revoke all on function public.cem_beca_donacion_confirmar_servidor(uuid, text, text, bigint, text, text) from public, anon, authenticated;
grant execute on function public.cem_beca_donacion_confirmar_servidor(uuid, text, text, bigint, text, text) to service_role;

-- ═══ 2. EL EQUIPO: RESUMEN Y SOLICITUDES ════════════════════════════════════

create or replace function public.cem_becas_puede_ver()
returns boolean
language sql stable security definer set search_path = public as $$
  select cem_is_staff() or cem_puede_cobranza() or cem_es_auditor();
$$;

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
    'donantes', (select count(distinct lower(coalesce(nullif(btrim(donante_email), ''), btrim(donante_nombre))))
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

create or replace function public.cem_becas_solicitudes_listar(p_estado text default null, p_convocatoria uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (cem_is_staff() or cem_es_auditor()) then
    raise exception 'Sólo el equipo puede ver las solicitudes de beca.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'numero', cem_becas_numero('SOL', s.numero), 'creada_en', s.creada_en,
      'convocatoria_id', s.convocatoria_id, 'convocatoria', v.titulo, 'codigo', v.codigo,
      'course_id', s.course_id, 'programa', coalesce(c.nombre, s.programa_texto),
      'nombre', s.nombre, 'apellido', s.apellido, 'email', s.email, 'telefono', s.telefono,
      'pais', s.pais, 'ciudad', s.ciudad, 'edad', s.edad, 'ocupacion', s.ocupacion,
      'respuestas', s.respuestas, 'redes', s.redes, 'como_nos_conocio', s.como_nos_conocio,
      'origen', s.origen, 'campana', s.campana, 'acepta_publicar', s.acepta_publicar,
      'estado', s.estado, 'puntaje', s.puntaje, 'nota_interna', s.nota_interna,
      'revisada_por', (select trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')) from cem_profiles p where p.id = s.revisada_por),
      'revisada_en', s.revisada_en, 'avisada_en', s.avisada_en,
      'beca_id', s.beca_id, 'beca', (select cem_becas_numero('BEC', b.numero) from cem_becas b where b.id = s.beca_id),
      'tiene_cuenta', exists (select 1 from cem_profiles p where lower(p.email) = lower(s.email)))
    order by s.creada_en desc)
    from cem_becas_solicitudes s
    join cem_becas_convocatorias v on v.id = s.convocatoria_id
    left join cem_courses c on c.id = s.course_id
   where (p_estado is null or s.estado = p_estado)
     and (p_convocatoria is null or s.convocatoria_id = p_convocatoria)), '[]'::jsonb);
end $$;

-- Mover una solicitud (en revisión, preseleccionada, en espera, rechazada…),
-- puntuarla y anotarla. «Aprobada» no se pone aquí: la pone dar la beca.
create or replace function public.cem_beca_solicitud_revisar(
  p_id uuid, p_estado text default null, p_puntaje integer default null,
  p_nota text default null, p_avisar boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare s cem_becas_solicitudes; v_estado text := nullif(btrim(coalesce(p_estado, '')), '');
begin
  if not cem_is_staff() then
    raise exception 'Sólo el equipo puede revisar solicitudes de beca.' using errcode = '42501';
  end if;
  select * into s from cem_becas_solicitudes where id = p_id for update;
  if s.id is null then raise exception 'Esa solicitud no existe.'; end if;
  if v_estado is not null and v_estado not in ('recibida', 'en_revision', 'preseleccionada', 'en_espera', 'rechazada', 'retirada') then
    raise exception 'Ese estado no vale aquí. Para aprobarla, dale la beca.';
  end if;
  if s.estado = 'aprobada' and v_estado is not null and v_estado <> 'aprobada' then
    raise exception 'Esa solicitud ya tiene su beca. Si hay que quitarla, se revoca la beca.';
  end if;
  if p_puntaje is not null and (p_puntaje < 1 or p_puntaje > 5) then
    raise exception 'La puntuación va de 1 a 5.';
  end if;

  update cem_becas_solicitudes
     set estado = coalesce(v_estado, estado),
         puntaje = coalesce(p_puntaje, puntaje),
         nota_interna = case when p_nota is null then nota_interna else nullif(btrim(p_nota), '') end,
         revisada_por = auth.uid(), revisada_en = now(), actualizada_en = now()
   where id = s.id
  returning * into s;

  -- Un «no» amable, sólo si el equipo lo pide y una vez.
  if s.estado = 'rechazada' and coalesce(p_avisar, false) and s.avisada_en is null then
    perform cem_becas_correo(s.email, 'Sobre tu solicitud de beca',
      format(E'Hola %s:\n\nGracias por contarnos tu historia. Esta vez no pudimos darte la beca: llegan muchas solicitudes y el fondo alcanza para pocas.\n\nEso no cierra la puerta. Abrimos convocatorias nuevas cada cierto tiempo, y si quieres empezar ya, los programas se pueden pagar en cuotas: https://escuelacem.com/programas/\n\nUn abrazo,\nEquipo CEM',
             split_part(btrim(s.nombre), ' ', 1)),
      'beca-no:' || s.id);
    update cem_becas_solicitudes set avisada_en = now() where id = s.id;
  end if;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  select auth.uid(), p.email, 'beca.solicitud_revisada', 'cem_becas_solicitudes', s.id, 'bajo',
         jsonb_build_object('solicitud', cem_becas_numero('SOL', s.numero), 'estado', s.estado, 'puntaje', s.puntaje)
    from cem_profiles p where p.id = auth.uid();

  return jsonb_build_object('ok', true, 'estado', s.estado, 'puntaje', s.puntaje);
end $$;

-- ═══ 3. CONVOCATORIAS ═══════════════════════════════════════════════════════

create or replace function public.cem_becas_convocatorias_listar()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (cem_is_staff() or cem_es_auditor()) then
    raise exception 'Sólo el equipo puede ver las convocatorias.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', v.id, 'codigo', v.codigo, 'titulo', v.titulo, 'descripcion', v.descripcion,
      'cursos', v.cursos, 'cupos', v.cupos, 'abre_en', v.abre_en, 'cierra_en', v.cierra_en,
      'activa', v.activa, 'pregunta_extra', v.pregunta_extra, 'gracias', v.gracias,
      'creada_en', v.creada_en,
      'solicitudes', (select count(*) from cem_becas_solicitudes s where s.convocatoria_id = v.id),
      'por_canal', (select coalesce(jsonb_object_agg(o, n), '{}'::jsonb) from (
          select coalesce(s.origen, 'directo') as o, count(*) as n
            from cem_becas_solicitudes s where s.convocatoria_id = v.id group by 1) x),
      'becas', (select count(*) from cem_becas b where b.convocatoria_id = v.id and b.estado in ('por_activar', 'otorgada')))
    order by (v.codigo = 'becas-cem') desc, v.creada_en desc)
    from cem_becas_convocatorias v), '[]'::jsonb);
end $$;

create or replace function public.cem_becas_convocatoria_guardar(
  p_id uuid, p_codigo text, p_titulo text, p_descripcion text default '', p_cursos uuid[] default '{}',
  p_cupos integer default null, p_abre_en timestamptz default null, p_cierra_en timestamptz default null,
  p_activa boolean default true, p_pregunta_extra text default null, p_gracias text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v cem_becas_convocatorias; v_codigo text := lower(btrim(coalesce(p_codigo, '')));
begin
  if not cem_is_staff() then
    raise exception 'Sólo el equipo puede armar convocatorias de becas.' using errcode = '42501';
  end if;
  if v_codigo !~ '^[a-z0-9][a-z0-9-]{1,39}$' then
    raise exception 'El código va en minúsculas, sin espacios ni tildes: letras, números y guiones (por ejemplo «instagram-noviembre»).';
  end if;
  if length(btrim(coalesce(p_titulo, ''))) < 3 then raise exception 'Falta el título.'; end if;
  if p_cupos is not null and p_cupos < 1 then raise exception 'Los cupos, si se ponen, son 1 o más.'; end if;
  if p_abre_en is not null and p_cierra_en is not null and p_cierra_en <= p_abre_en then
    raise exception 'La convocatoria tiene que cerrar después de abrir.';
  end if;
  if exists (select 1 from unnest(coalesce(p_cursos, '{}')) x where not exists (select 1 from cem_courses c where c.id = x)) then
    raise exception 'Alguno de esos programas no existe.';
  end if;

  if p_id is null then
    insert into cem_becas_convocatorias (codigo, titulo, descripcion, cursos, cupos, abre_en, cierra_en,
                                         activa, pregunta_extra, gracias, creada_por)
    values (v_codigo, btrim(p_titulo), coalesce(btrim(p_descripcion), ''), coalesce(p_cursos, '{}'), p_cupos,
            p_abre_en, p_cierra_en, coalesce(p_activa, true), nullif(btrim(coalesce(p_pregunta_extra, '')), ''),
            nullif(btrim(coalesce(p_gracias, '')), ''), auth.uid())
    returning * into v;
  else
    select * into v from cem_becas_convocatorias where id = p_id for update;
    if v.id is null then raise exception 'Esa convocatoria no existe.'; end if;
    -- El código va dentro de los enlaces que ya se compartieron en redes.
    if v.codigo <> v_codigo and exists (select 1 from cem_becas_solicitudes where convocatoria_id = v.id) then
      raise exception 'Esa convocatoria ya recibió solicitudes: su código va en enlaces que ya se compartieron y no se cambia.';
    end if;
    update cem_becas_convocatorias
       set codigo = v_codigo, titulo = btrim(p_titulo), descripcion = coalesce(btrim(p_descripcion), ''),
           cursos = coalesce(p_cursos, '{}'), cupos = p_cupos, abre_en = p_abre_en, cierra_en = p_cierra_en,
           activa = coalesce(p_activa, true), pregunta_extra = nullif(btrim(coalesce(p_pregunta_extra, '')), ''),
           gracias = nullif(btrim(coalesce(p_gracias, '')), ''), actualizada_en = now()
     where id = v.id
    returning * into v;
  end if;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  select auth.uid(), p.email, 'beca.convocatoria_guardada', 'cem_becas_convocatorias', v.id, 'bajo',
         jsonb_build_object('codigo', v.codigo, 'activa', v.activa, 'cupos', v.cupos)
    from cem_profiles p where p.id = auth.uid();
  return jsonb_build_object('ok', true, 'id', v.id, 'codigo', v.codigo);
exception when unique_violation then
  raise exception 'Ya hay otra convocatoria con el código «%».', v_codigo;
end $$;

-- ═══ 4. DAR BECAS ═══════════════════════════════════════════════════════════

-- Lo común a dar una beca a quien la solicitó y a regalar un curso. Si la
-- persona ya tiene cuenta, queda inscrita al momento; si no, se crea un
-- enlace para que la active al crear su cuenta.
create or replace function public.cem_becas_crear(
  p_tipo text, p_course_id uuid, p_cohort_id uuid, p_nombre text, p_email text, p_pais text,
  p_solicitud_id uuid, p_convocatoria_id uuid, p_mensaje text, p_dias integer, p_publicable boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  c cem_courses; v jsonb; b cem_becas; p cem_profiles; v_token text; v_enlace text;
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 120);
  v_dias integer := least(greatest(coalesce(p_dias, 30), 1), 120);
begin
  if p_tipo not in ('fondo', 'cem') then raise exception 'Una beca la paga el fondo o la regala el CEM.'; end if;
  select * into c from cem_courses where id = p_course_id;
  if c.id is null then raise exception 'Elige el programa de la beca.'; end if;
  if c.estado::text <> 'publicado' then
    raise exception '«%» no está publicado: publícalo antes de regalarlo.', c.nombre;
  end if;
  if p_cohort_id is not null and not exists (select 1 from cem_cohorts where id = p_cohort_id and course_id = c.id) then
    raise exception 'Esa cohorte no es de este programa.';
  end if;
  if length(v_nombre) < 2 then raise exception 'Falta el nombre de la persona.'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'Ese correo no parece un correo.';
  end if;

  v := cem_becas_valor(c.id);
  if (v->>'valor_usd')::numeric <= 0 then
    raise exception '«%» no tiene precio: no hace falta beca para entrar.', c.nombre;
  end if;

  if v_email is not null then
    select * into p from cem_profiles where lower(email) = v_email and activo limit 1;
  end if;

  insert into cem_becas (tipo, solicitud_id, convocatoria_id, course_id, cohort_id, nombre, email, pais,
                         valor, moneda, valor_usd, cambio, estado, publicable, mensaje, otorgada_por)
  values (p_tipo, p_solicitud_id, p_convocatoria_id, c.id, p_cohort_id, v_nombre, v_email,
          nullif(left(btrim(coalesce(p_pais, '')), 60), ''),
          (v->>'valor')::numeric, v->>'moneda', (v->>'valor_usd')::numeric, (v->>'cambio')::numeric,
          'por_activar', coalesce(p_publicable, false), nullif(btrim(coalesce(p_mensaje, '')), ''), auth.uid())
  returning * into b;

  if p_tipo = 'fondo' then
    perform cem_becas_reservar(b.id, b.valor_usd, auth.uid());
  end if;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  select auth.uid(), x.email, 'beca.otorgada', 'cem_becas', b.id, 'alto',
         jsonb_build_object('beca', cem_becas_numero('BEC', b.numero), 'tipo', b.tipo, 'curso', c.nombre,
                            'para', v_nombre, 'correo', v_email, 'valor_usd', b.valor_usd,
                            'solicitud', p_solicitud_id)
    from cem_profiles x where x.id = auth.uid();

  if p.id is not null then
    perform cem_becas_inscribir(b.id, p.id, true);
    return jsonb_build_object('ok', true, 'beca_id', b.id, 'numero', cem_becas_numero('BEC', b.numero),
                              'estado', 'otorgada', 'inscrita', true, 'valor_usd', b.valor_usd);
  end if;

  v_token := cem_becas_token_nuevo();
  v_enlace := cem_becas_enlace(v_token);
  update cem_becas set token_hash = cem_becas_hash(v_token), vence_en = now() + make_interval(days => v_dias)
   where id = b.id returning * into b;

  if v_email is not null then
    perform cem_becas_correo(v_email, '¡Tienes una beca del CEM para ' || c.nombre || '!',
      format(E'Hola %s:\n\nTenemos una gran noticia: el CEM te da una beca completa para estudiar %s. No tienes que pagar nada.%s\n\nPara empezar, abre este enlace, crea tu cuenta con este mismo correo y la beca queda activada:\n%s\n\nEl enlace es personal y vale hasta el %s.\n\n¡Te esperamos!\nEquipo CEM',
             split_part(v_nombre, ' ', 1), c.nombre,
             coalesce(E'\n\n' || nullif(btrim(p_mensaje), ''), ''),
             v_enlace, to_char(b.vence_en, 'DD/MM/YYYY')),
      'beca-enlace:' || b.id || ':' || left(b.token_hash, 12));
  end if;

  return jsonb_build_object('ok', true, 'beca_id', b.id, 'numero', cem_becas_numero('BEC', b.numero),
                            'estado', 'por_activar', 'inscrita', false, 'enlace', v_enlace,
                            'vence_en', b.vence_en, 'correo_enviado', v_email is not null,
                            'valor_usd', b.valor_usd);
end $$;

create or replace function public.cem_beca_otorgar(
  p_solicitud_id uuid, p_course_id uuid default null, p_cohort_id uuid default null,
  p_tipo text default 'fondo', p_mensaje text default null, p_dias integer default 30)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare s cem_becas_solicitudes; r jsonb;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede dar una beca.' using errcode = '42501';
  end if;
  select * into s from cem_becas_solicitudes where id = p_solicitud_id for update;
  if s.id is null then raise exception 'Esa solicitud no existe.'; end if;
  if s.beca_id is not null then raise exception 'Esa solicitud ya tiene su beca.'; end if;
  if s.estado = 'retirada' then raise exception 'Esa solicitud se retiró.'; end if;

  r := cem_becas_crear(p_tipo, coalesce(p_course_id, s.course_id), p_cohort_id,
                       btrim(s.nombre || ' ' || coalesce(s.apellido, '')), s.email, s.pais,
                       s.id, s.convocatoria_id, p_mensaje, p_dias, s.acepta_publicar);

  update cem_becas_solicitudes
     set estado = 'aprobada', beca_id = (r->>'beca_id')::uuid, revisada_por = auth.uid(),
         revisada_en = now(), avisada_en = now(), actualizada_en = now()
   where id = s.id;
  return r;
end $$;

create or replace function public.cem_beca_regalar(
  p_course_id uuid, p_nombre text, p_email text default null, p_pais text default null,
  p_tipo text default 'cem', p_cohort_id uuid default null, p_mensaje text default null,
  p_dias integer default 30, p_publicable boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede regalar un curso.' using errcode = '42501';
  end if;
  return cem_becas_crear(p_tipo, p_course_id, p_cohort_id, p_nombre, p_email, p_pais,
                         null, null, p_mensaje, p_dias, p_publicable);
end $$;

-- Un enlace nuevo para una beca que todavía no se activó (se perdió el
-- correo, o venció). El anterior deja de valer.
create or replace function public.cem_beca_nuevo_enlace(p_beca_id uuid, p_dias integer default 30, p_enviar boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare b cem_becas; v_token text; v_enlace text; v_programa text;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede dar un enlace nuevo.' using errcode = '42501';
  end if;
  select * into b from cem_becas where id = p_beca_id for update;
  if b.id is null then raise exception 'Esa beca no existe.'; end if;
  if b.estado <> 'por_activar' then raise exception 'Esa beca ya está %.', b.estado; end if;
  v_token := cem_becas_token_nuevo();
  v_enlace := cem_becas_enlace(v_token);
  update cem_becas
     set token_hash = cem_becas_hash(v_token),
         vence_en = now() + make_interval(days => least(greatest(coalesce(p_dias, 30), 1), 120))
   where id = b.id returning * into b;
  select nombre into v_programa from cem_courses where id = b.course_id;
  if coalesce(p_enviar, true) and b.email is not null then
    perform cem_becas_correo(b.email, 'Tu enlace para activar la beca del CEM',
      format(E'Hola %s:\n\nAquí tienes un enlace nuevo para activar tu beca de %s. Ábrelo, crea tu cuenta con este mismo correo y la beca queda activada:\n%s\n\nVale hasta el %s. El enlace anterior ya no funciona.\n\nEquipo CEM',
             split_part(btrim(b.nombre), ' ', 1), v_programa, v_enlace, to_char(b.vence_en, 'DD/MM/YYYY')),
      'beca-enlace:' || b.id || ':' || left(b.token_hash, 12));
  end if;
  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  select auth.uid(), x.email, 'beca.enlace_nuevo', 'cem_becas', b.id, 'medio',
         jsonb_build_object('beca', cem_becas_numero('BEC', b.numero), 'vence', b.vence_en)
    from cem_profiles x where x.id = auth.uid();
  return jsonb_build_object('ok', true, 'enlace', v_enlace, 'vence_en', b.vence_en,
                            'correo_enviado', coalesce(p_enviar, true) and b.email is not null);
end $$;

-- Revocar una beca. Si ya estaba activada, la inscripción se cancela y vuelve
-- a su precio (una inscripción a 0 abre el programa aunque esté cancelada).
-- Si la pagaba el fondo, el dinero vuelve al fondo.
create or replace function public.cem_beca_revocar(p_beca_id uuid, p_motivo text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare b cem_becas; v_vuelve numeric := 0;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede revocar una beca.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Escribe por qué se revoca.'; end if;
  select * into b from cem_becas where id = p_beca_id for update;
  if b.id is null then raise exception 'Esa beca no existe.'; end if;
  if b.estado = 'revocada' then raise exception 'Esa beca ya está revocada.'; end if;
  if b.tipo = 'anterior' then raise exception 'Una beca anterior no se revoca: si se registró por error, avisa a quien administra la plataforma.'; end if;

  if b.enrollment_id is not null then
    update cem_enrollments
       set estado = 'cancelada', precio_final = precio_lista, descuento = 0
     where id = b.enrollment_id and fuente = 'beca';
  end if;
  if b.tipo = 'fondo' then
    v_vuelve := cem_becas_liberar(b.id, auth.uid(), 'Beca revocada: ' || btrim(p_motivo));
  end if;
  update cem_becas
     set estado = 'revocada', revocada_en = now(), revocada_por = auth.uid(), motivo = btrim(p_motivo)
   where id = b.id;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  select auth.uid(), x.email, 'beca.revocada', 'cem_becas', b.id, 'alto',
         jsonb_build_object('beca', cem_becas_numero('BEC', b.numero), 'motivo', btrim(p_motivo),
                            'estaba', b.estado, 'vuelve_al_fondo', v_vuelve)
    from cem_profiles x where x.id = auth.uid();
  return jsonb_build_object('ok', true, 'vuelve_al_fondo', v_vuelve);
end $$;

-- Becas dadas antes de este sistema: suman en las cifras de la web, no tocan
-- el fondo ni abren nada.
create or replace function public.cem_beca_anterior_registrar(
  p_nombre text, p_pais text, p_course_id uuid default null, p_curso_texto text default null,
  p_valor_usd numeric default 0, p_fecha date default null, p_nota text default null,
  p_publicable boolean default false, p_historia text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare b cem_becas;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede registrar becas anteriores.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) < 2 then raise exception 'Falta el nombre de la persona.'; end if;
  if p_course_id is null and length(btrim(coalesce(p_curso_texto, ''))) < 2 then
    raise exception 'Dinos qué estudió.';
  end if;
  if coalesce(p_valor_usd, 0) < 0 then raise exception 'El valor no puede ser negativo.'; end if;
  insert into cem_becas (tipo, course_id, curso_texto, nombre, pais, valor, moneda, valor_usd, cambio,
                         estado, publicable, historia, mensaje, fecha, otorgada_por, activada_en)
  values ('anterior', p_course_id, nullif(btrim(coalesce(p_curso_texto, '')), ''), btrim(p_nombre),
          nullif(btrim(coalesce(p_pais, '')), ''), coalesce(p_valor_usd, 0), 'USD', coalesce(p_valor_usd, 0), 1,
          'otorgada', coalesce(p_publicable, false), nullif(btrim(coalesce(p_historia, '')), ''),
          nullif(btrim(coalesce(p_nota, '')), ''), coalesce(p_fecha, current_date), auth.uid(), now())
  returning * into b;
  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  select auth.uid(), x.email, 'beca.anterior_registrada', 'cem_becas', b.id, 'medio',
         jsonb_build_object('beca', cem_becas_numero('BEC', b.numero), 'para', b.nombre, 'valor_usd', b.valor_usd)
    from cem_profiles x where x.id = auth.uid();
  return jsonb_build_object('ok', true, 'beca_id', b.id, 'numero', cem_becas_numero('BEC', b.numero));
end $$;

-- Lo que sale en la web de una beca: si se publica y su frase.
create or replace function public.cem_beca_publicacion(p_beca_id uuid, p_publicable boolean, p_historia text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede cambiar lo que se publica.' using errcode = '42501';
  end if;
  update cem_becas set publicable = coalesce(p_publicable, false),
                       historia = nullif(btrim(coalesce(p_historia, '')), '')
   where id = p_beca_id;
  if not found then raise exception 'Esa beca no existe.'; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cem_becas_listar(p_estado text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not cem_becas_puede_ver() then
    raise exception 'Sólo el equipo puede ver las becas.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', b.id, 'numero', cem_becas_numero('BEC', b.numero), 'tipo', b.tipo, 'estado', b.estado,
      'nombre', b.nombre, 'email', b.email, 'pais', b.pais,
      'course_id', b.course_id, 'programa', coalesce(c.nombre, b.curso_texto),
      'valor', b.valor, 'moneda', b.moneda, 'valor_usd', b.valor_usd, 'cambio', b.cambio,
      'fecha', b.fecha, 'creada_en', b.creada_en, 'activada_en', b.activada_en, 'vence_en', b.vence_en,
      'vencida', b.estado = 'por_activar' and b.vence_en < now(),
      'publicable', b.publicable, 'historia', b.historia, 'mensaje', b.mensaje,
      'solicitud', (select cem_becas_numero('SOL', s.numero) from cem_becas_solicitudes s where s.id = b.solicitud_id),
      'convocatoria', (select v.titulo from cem_becas_convocatorias v where v.id = b.convocatoria_id),
      'otorgada_por', (select trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')) from cem_profiles p where p.id = b.otorgada_por),
      'revocada_en', b.revocada_en, 'motivo', b.motivo,
      'financiacion', coalesce((select jsonb_agg(jsonb_build_object(
            'donacion', cem_becas_numero('DON', d.numero), 'donacion_id', d.id,
            'donante', coalesce(nullif(btrim(d.organizacion), ''), d.donante_nombre),
            'monto', f.monto, 'liberada_en', f.liberada_en) order by d.numero)
          from cem_becas_financiacion f join cem_becas_donaciones d on d.id = f.donacion_id
         where f.beca_id = b.id), '[]'::jsonb))
    order by b.creada_en desc)
    from cem_becas b left join cem_courses c on c.id = b.course_id
   where p_estado is null or b.estado = p_estado), '[]'::jsonb);
end $$;

-- ═══ 5. DONACIONES ══════════════════════════════════════════════════════════

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

-- Una donación y todo lo que pagó: la trazabilidad que se le puede enseñar a
-- quien donó.
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

-- Registrar una donación que llegó por Zelle, transferencia, cheque o en
-- efectivo. Quien la registra es quien la vio llegar: entra confirmada.
create or replace function public.cem_beca_donacion_registrar(
  p_monto numeric, p_metodo text, p_referencia text, p_fecha date, p_nombre text,
  p_email text default null, p_pais text default null, p_organizacion text default null,
  p_mensaje text default null, p_publica boolean default false, p_comprobante text default null,
  p_idioma text default 'es', p_enviar_recibo boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d cem_becas_donaciones; v_ref text := nullif(btrim(coalesce(p_referencia, '')), '');
        v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
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
  if length(btrim(coalesce(p_nombre, ''))) < 2 then raise exception 'Falta el nombre de quien donó.'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'Ese correo no parece un correo.';
  end if;
  if p_fecha is not null and p_fecha > current_date then raise exception 'La fecha no puede ser futura.'; end if;

  perform pg_advisory_xact_lock(hashtext('cem_becas_fondo'));
  insert into cem_becas_donaciones (monto, donante_nombre, donante_email, donante_pais, organizacion, mensaje,
    publica, idioma, metodo, estado, referencia, comprobante, fecha, registrada_por, confirmada_en, confirmada_por)
  values (round(p_monto, 2), left(btrim(p_nombre), 80), v_email, nullif(left(btrim(coalesce(p_pais, '')), 60), ''),
    nullif(left(btrim(coalesce(p_organizacion, '')), 120), ''), nullif(left(btrim(coalesce(p_mensaje, '')), 500), ''),
    coalesce(p_publica, false), case when lower(coalesce(p_idioma, 'es')) = 'en' then 'en' else 'es' end,
    p_metodo, 'confirmada', v_ref, nullif(btrim(coalesce(p_comprobante, '')), ''),
    coalesce(p_fecha, current_date), auth.uid(), now(), auth.uid())
  returning * into d;

  perform cem_becas_donacion_entra(d.id, auth.uid());
  if coalesce(p_enviar_recibo, true) then perform cem_becas_recibo(d.id); end if;
  return jsonb_build_object('ok', true, 'id', d.id, 'numero', cem_becas_numero('DON', d.numero));
exception when unique_violation then
  raise exception 'Ya hay una donación registrada por % con la referencia «%».', p_metodo, v_ref;
end $$;

-- Anular una donación (se registró por error, o se devolvió el dinero). No si
-- ya pagó alguna beca: esa beca seguiría ahí, pagada con un dinero que el
-- libro diría que no entró.
create or replace function public.cem_beca_donacion_anular(p_id uuid, p_motivo text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d cem_becas_donaciones; v_usado numeric;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede anular una donación.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Escribe por qué se anula.'; end if;
  perform pg_advisory_xact_lock(hashtext('cem_becas_fondo'));
  select * into d from cem_becas_donaciones where id = p_id for update;
  if d.id is null then raise exception 'Esa donación no existe.'; end if;
  if d.estado = 'anulada' then raise exception 'Esa donación ya está anulada.'; end if;

  if d.estado = 'confirmada' then
    select coalesce(sum(monto), 0) into v_usado from cem_becas_financiacion
     where donacion_id = d.id and liberada_en is null;
    if v_usado > 0 then
      raise exception 'Esta donación ya pagó becas por %. No se anula: primero habría que revocar esas becas.',
        cem_becas_usd(v_usado, 'es');
    end if;
    insert into cem_becas_fondo (tipo, monto, donacion_id, nota, actor_id)
    values ('anulacion', -d.monto, d.id, btrim(p_motivo), auth.uid());
  end if;

  update cem_becas_donaciones
     set estado = 'anulada', anulada_en = now(), anulada_por = auth.uid(), motivo_anulacion = btrim(p_motivo)
   where id = d.id;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  select auth.uid(), x.email, 'beca.donacion_anulada', 'cem_becas_donaciones', d.id, 'alto',
         jsonb_build_object('donacion', cem_becas_numero('DON', d.numero), 'monto', d.monto,
                            'estaba', d.estado, 'motivo', btrim(p_motivo))
    from cem_profiles x where x.id = auth.uid();
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.cem_becas_movimientos()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (cem_puede_cobranza() or cem_es_auditor()) then
    raise exception 'Sólo cobranza y administración pueden ver el fondo.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', m.id, 'fecha', m.fecha, 'tipo', m.tipo, 'monto', m.monto, 'nota', m.nota,
      'saldo', m.saldo,
      'donacion', (select cem_becas_numero('DON', d.numero) from cem_becas_donaciones d where d.id = m.donacion_id),
      'beca', (select cem_becas_numero('BEC', b.numero) from cem_becas b where b.id = m.beca_id),
      'quien', (select trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')) from cem_profiles p where p.id = m.actor_id))
    order by m.id desc)
    from (select f.*, sum(f.monto) over (order by f.id) as saldo from cem_becas_fondo f) m), '[]'::jsonb);
end $$;

-- ═══ 6. AJUSTES Y PAQUETES ══════════════════════════════════════════════════

create or replace function public.cem_becas_ajustes_ver()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a cem_becas_ajustes;
begin
  if not cem_becas_puede_ver() then
    raise exception 'Sólo el equipo puede ver los ajustes de becas.' using errcode = '42501';
  end if;
  select * into a from cem_becas_ajustes where id = 1;
  return to_jsonb(a) || jsonb_build_object(
    'paquetes', coalesce((select jsonb_agg(to_jsonb(k) order by k.orden, k.monto) from cem_becas_paquetes k), '[]'::jsonb));
end $$;

create or replace function public.cem_becas_ajustes_guardar(
  p_stripe_cuenta text, p_otro_monto boolean, p_otro_monto_minimo numeric, p_otro_monto_maximo numeric,
  p_texto_recibo_es text, p_texto_recibo_en text, p_mostrar_donantes boolean, p_mostrar_historias boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_cuenta text := nullif(lower(btrim(coalesce(p_stripe_cuenta, ''))), '');
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede cambiar los ajustes de becas.' using errcode = '42501';
  end if;
  if v_cuenta is not null and not exists (
       select 1 from cem_integraciones where id = 'stripe:' || v_cuenta
          and nullif(datos->>'secret_key', '') is not null) then
    raise exception 'La cuenta de Stripe «%» no está configurada. Añádela antes en Cobros con tarjeta → Otras empresas.', v_cuenta;
  end if;
  if coalesce(p_otro_monto_minimo, 0) <= 0 or coalesce(p_otro_monto_maximo, 0) < coalesce(p_otro_monto_minimo, 0) then
    raise exception 'El mínimo de «otro monto» tiene que ser mayor que cero y el máximo, mayor que el mínimo.';
  end if;
  if length(btrim(coalesce(p_texto_recibo_es, ''))) < 20 or length(btrim(coalesce(p_texto_recibo_en, ''))) < 20 then
    raise exception 'El texto del recibo hace falta en los dos idiomas.';
  end if;
  update cem_becas_ajustes
     set stripe_cuenta = v_cuenta, otro_monto = coalesce(p_otro_monto, true),
         otro_monto_minimo = round(p_otro_monto_minimo, 2), otro_monto_maximo = round(p_otro_monto_maximo, 2),
         texto_recibo_es = btrim(p_texto_recibo_es), texto_recibo_en = btrim(p_texto_recibo_en),
         mostrar_donantes = coalesce(p_mostrar_donantes, true), mostrar_historias = coalesce(p_mostrar_historias, true),
         actualizado_en = now(), actualizado_por = auth.uid()
   where id = 1;
  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  select auth.uid(), x.email, 'beca.ajustes', 'cem_becas_ajustes', null, 'alto',
         jsonb_build_object('stripe_cuenta', coalesce(v_cuenta, 'principal'), 'otro_monto', p_otro_monto,
                            'minimo', p_otro_monto_minimo, 'maximo', p_otro_monto_maximo)
    from cem_profiles x where x.id = auth.uid();
  return cem_becas_ajustes_ver();
end $$;

create or replace function public.cem_becas_paquete_guardar(
  p_id uuid, p_monto numeric, p_nombre_es text, p_nombre_en text, p_descripcion_es text default '',
  p_descripcion_en text default '', p_orden integer default 0, p_activo boolean default true,
  p_destacado boolean default false)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare k cem_becas_paquetes;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede cambiar los paquetes.' using errcode = '42501';
  end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'El monto tiene que ser mayor que cero.'; end if;
  if length(btrim(coalesce(p_nombre_es, ''))) < 2 or length(btrim(coalesce(p_nombre_en, ''))) < 2 then
    raise exception 'El nombre del paquete hace falta en los dos idiomas.';
  end if;
  if p_id is null then
    insert into cem_becas_paquetes (monto, nombre_es, nombre_en, descripcion_es, descripcion_en, orden, activo, destacado)
    values (round(p_monto, 2), btrim(p_nombre_es), btrim(p_nombre_en), coalesce(btrim(p_descripcion_es), ''),
            coalesce(btrim(p_descripcion_en), ''), coalesce(p_orden, 0), coalesce(p_activo, true), coalesce(p_destacado, false))
    returning * into k;
  else
    update cem_becas_paquetes
       set monto = round(p_monto, 2), nombre_es = btrim(p_nombre_es), nombre_en = btrim(p_nombre_en),
           descripcion_es = coalesce(btrim(p_descripcion_es), ''), descripcion_en = coalesce(btrim(p_descripcion_en), ''),
           orden = coalesce(p_orden, 0), activo = coalesce(p_activo, true), destacado = coalesce(p_destacado, false),
           actualizado_en = now()
     where id = p_id returning * into k;
    if k.id is null then raise exception 'Ese paquete no existe.'; end if;
  end if;
  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  select auth.uid(), x.email, 'beca.paquete', 'cem_becas_paquetes', k.id, 'medio',
         jsonb_build_object('monto', k.monto, 'nombre', k.nombre_es, 'activo', k.activo)
    from cem_profiles x where x.id = auth.uid();
  return cem_becas_ajustes_ver();
end $$;

-- ═══ 7. EL MES, APARTE DE LO COBRADO ════════════════════════════════════════

create or replace function public.cem_becas_mes_calc(p_mes date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_ini date := date_trunc('month', coalesce(p_mes, current_date))::date;
        v_fin date := (date_trunc('month', coalesce(p_mes, current_date)) + interval '1 month')::date;
begin
  return jsonb_build_object(
    'mes', to_char(v_ini, 'YYYY-MM'),
    'donado', (select coalesce(sum(monto), 0) from cem_becas_donaciones
                where estado = 'confirmada' and fecha >= v_ini and fecha < v_fin),
    'donaciones', (select count(*) from cem_becas_donaciones
                    where estado = 'confirmada' and fecha >= v_ini and fecha < v_fin),
    'por_metodo', (select coalesce(jsonb_object_agg(metodo, total), '{}'::jsonb) from (
        select metodo, sum(monto) as total from cem_becas_donaciones
         where estado = 'confirmada' and fecha >= v_ini and fecha < v_fin group by metodo) x),
    'becas', (select count(*) from cem_becas
               where tipo in ('fondo', 'cem') and estado = 'otorgada'
                 and activada_en >= v_ini and activada_en < v_fin),
    'valor_becas', (select coalesce(sum(valor_usd), 0) from cem_becas
                     where tipo in ('fondo', 'cem') and estado = 'otorgada'
                       and activada_en >= v_ini and activada_en < v_fin),
    'becas_fondo', (select count(*) from cem_becas
                     where tipo = 'fondo' and estado = 'otorgada' and activada_en >= v_ini and activada_en < v_fin),
    'becas_cem', (select count(*) from cem_becas
                   where tipo = 'cem' and estado = 'otorgada' and activada_en >= v_ini and activada_en < v_fin),
    'salio_del_fondo', (select coalesce(-sum(monto), 0) from cem_becas_fondo
                         where tipo in ('beca', 'devolucion') and fecha >= v_ini and fecha < v_fin),
    'saldo_fin', (select coalesce(sum(monto), 0) from cem_becas_fondo where fecha < v_fin),
    'detalle_donaciones', coalesce((select jsonb_agg(jsonb_build_object(
          'fecha', d.fecha, 'numero', cem_becas_numero('DON', d.numero),
          'donante', coalesce(nullif(btrim(d.organizacion), ''), d.donante_nombre),
          'metodo', d.metodo, 'monto', d.monto) order by d.fecha, d.numero)
        from cem_becas_donaciones d
       where d.estado = 'confirmada' and d.fecha >= v_ini and d.fecha < v_fin), '[]'::jsonb),
    'detalle_becas', coalesce((select jsonb_agg(jsonb_build_object(
          'fecha', b.activada_en, 'numero', cem_becas_numero('BEC', b.numero), 'persona', b.nombre,
          'pais', b.pais, 'programa', c.nombre, 'tipo', b.tipo, 'valor_usd', b.valor_usd) order by b.activada_en)
        from cem_becas b left join cem_courses c on c.id = b.course_id
       where b.tipo in ('fondo', 'cem') and b.estado = 'otorgada'
         and b.activada_en >= v_ini and b.activada_en < v_fin), '[]'::jsonb));
end $$;

create or replace function public.cem_becas_mes(p_mes date default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not cem_becas_puede_ver() then
    raise exception 'Sólo el equipo puede ver el informe de becas.' using errcode = '42501';
  end if;
  return cem_becas_mes_calc(p_mes);
end $$;

-- ═══ 8. PERMISOS ════════════════════════════════════════════════════════════

revoke all on function public.cem_becas_puede_ver() from public, anon;
grant execute on function public.cem_becas_puede_ver() to authenticated;
revoke all on function public.cem_becas_crear(text, uuid, uuid, text, text, text, uuid, uuid, text, integer, boolean) from public, anon, authenticated;
revoke all on function public.cem_becas_mes_calc(date) from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'cem_becas_resumen()',
    'cem_becas_solicitudes_listar(text, uuid)',
    'cem_beca_solicitud_revisar(uuid, text, integer, text, boolean)',
    'cem_becas_convocatorias_listar()',
    'cem_becas_convocatoria_guardar(uuid, text, text, text, uuid[], integer, timestamptz, timestamptz, boolean, text, text)',
    'cem_beca_otorgar(uuid, uuid, uuid, text, text, integer)',
    'cem_beca_regalar(uuid, text, text, text, text, uuid, text, integer, boolean)',
    'cem_beca_nuevo_enlace(uuid, integer, boolean)',
    'cem_beca_revocar(uuid, text)',
    'cem_beca_anterior_registrar(text, text, uuid, text, numeric, date, text, boolean, text)',
    'cem_beca_publicacion(uuid, boolean, text)',
    'cem_becas_listar(text)',
    'cem_becas_donaciones_listar(text)',
    'cem_beca_donacion_detalle(uuid)',
    'cem_beca_donacion_registrar(numeric, text, text, date, text, text, text, text, text, boolean, text, text, boolean)',
    'cem_beca_donacion_anular(uuid, text)',
    'cem_becas_movimientos()',
    'cem_becas_ajustes_ver()',
    'cem_becas_ajustes_guardar(text, boolean, numeric, numeric, text, text, boolean, boolean)',
    'cem_becas_paquete_guardar(uuid, numeric, text, text, text, text, integer, boolean, boolean)',
    'cem_becas_mes(date)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Qué decide cada una y quién puede llamarla, para quien la lea dentro de un año.
comment on function public.cem_beca_donacion_abrir(uuid, numeric, text, text, text, text, text, boolean, text, text, text, text) is
  'Sólo el servidor (cem-donar): valida, frena y deja «iniciada» una donación con tarjeta. El importe lo pone la base, nunca el navegador.';
comment on function public.cem_beca_donacion_confirmar_servidor(uuid, text, text, bigint, text, text) is
  'Sólo el servidor (el webhook de Stripe): da por cobrada una donación con el importe real, la suma al fondo una sola vez y manda el recibo.';
comment on function public.cem_beca_otorgar(uuid, uuid, uuid, text, text, integer) is
  'Admin: da la beca (100 % del programa) a una solicitud. Si es del fondo, reserva su valor y apunta qué donaciones la pagan, las más antiguas primero.';
comment on function public.cem_beca_regalar(uuid, text, text, text, text, uuid, text, integer, boolean) is
  'Admin: regala un programa a una persona concreta, sin convocatoria. Con cuenta, la inscribe al momento; sin cuenta, devuelve un enlace que vale N días.';
comment on function public.cem_beca_revocar(uuid, text) is
  'Admin: revoca una beca. Cierra la inscripción devolviéndole su precio (una inscripción a 0 € seguiría abierta) y devuelve lo reservado al fondo.';
comment on function public.cem_beca_donacion_registrar(numeric, text, text, date, text, text, text, text, text, boolean, text, text, boolean) is
  'Cobranza para arriba: registra una donación que llegó por Zelle, transferencia, cheque o en efectivo. Entra confirmada y suma al fondo.';
comment on function public.cem_beca_donacion_anular(uuid, text) is
  'Admin: anula una donación con motivo. Se niega si ya pagó becas: primero habría que revocarlas.';
comment on function public.cem_becas_mes(date) is
  'Equipo, cobranza y auditor: donaciones y becas de un mes, aparte de lo cobrado (no entran en el cierre ni en el reparto).';
