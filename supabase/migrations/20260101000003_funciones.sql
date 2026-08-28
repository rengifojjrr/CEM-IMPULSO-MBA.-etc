-- Las funciones: aquí vive el trabajo de verdad
-- ═══════════════════════════════════════════════════════════════════════════
-- Generado por herramientas/volcar-esquema.sql. NO se edita a mano: se
-- vuelve a generar y se perdería lo escrito. Los cambios se hacen en la
-- base y luego se regenera esto.

-- Las funciones salen en orden alfabético, así que una puede llamar a otra
-- que todavía no existe. Es lo mismo que hace pg_dump y por la misma razón.
set check_function_bodies = false;

CREATE OR REPLACE FUNCTION public.admin_list_events(p_admin_key text, p_quote_id uuid)
 RETURNS SETOF quote_events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if p_admin_key is null or encode(extensions.digest(p_admin_key, 'sha256'), 'hex') <> '5431d602abbdf5eeb093dfe3930fbe1fa67a681071c501dd0e109cce43e220f1' then
    raise exception 'unauthorized';
  end if;
  return query select * from public.quote_events where quote_id = p_quote_id order by created_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.admin_list_quotes(p_admin_key text)
 RETURNS SETOF quotes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
begin
  if p_admin_key is null or encode(extensions.digest(p_admin_key, 'sha256'), 'hex') <> '5431d602abbdf5eeb093dfe3930fbe1fa67a681071c501dd0e109cce43e220f1' then
    raise exception 'unauthorized';
  end if;
  return query select * from public.quotes order by updated_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cash_dist(money, money)
 RETURNS money
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$cash_dist$function$
;

CREATE OR REPLACE FUNCTION public.cem_a_base(p_monto numeric, p_moneda text, p_fecha date DEFAULT CURRENT_DATE)
 RETURNS TABLE(monto_base numeric, tasa numeric, tasa_fecha date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tasa numeric; v_fecha date; v_eur numeric; v_usd numeric;
        v_fe date; v_fu date; v_dia date := coalesce(p_fecha, current_date);
begin
  if p_monto is null then return; end if;

  if coalesce(p_moneda, 'EUR') = 'EUR' then
    return query select round(p_monto, 2), 1::numeric, v_dia; return;
  end if;

  if p_moneda not in ('VES', 'USD') then
    raise exception 'Moneda desconocida: %. Se llevan euros, dólares y bolívares.', p_moneda;
  end if;

  -- La del día o, si no la hay, la anterior más próxima. En su defecto —fechas
  -- de antes de que el sistema existiera— la primera que se llegó a guardar.
  select t.valor, t.fecha into v_eur, v_fe from cem_tasas_bcv t
   where t.moneda = 'EUR' and t.fecha <= v_dia
   order by t.fecha desc, (t.id_tasa = 'MANUAL') desc, t.actualizado_en desc limit 1;
  if v_eur is null then
    select t.valor, t.fecha into v_eur, v_fe from cem_tasas_bcv t
     where t.moneda = 'EUR' order by t.fecha asc limit 1;
  end if;
  if v_eur is null or v_eur <= 0 then
    raise exception 'Todavía no hay ninguna tasa del euro guardada, así que no se puede pasar a euros.';
  end if;

  if p_moneda = 'VES' then
    return query select round(p_monto / v_eur, 2), v_eur, v_fe; return;
  end if;

  select t.valor, t.fecha into v_usd, v_fu from cem_tasas_bcv t
   where t.moneda = 'USD' and t.fecha <= v_dia
   order by t.fecha desc, (t.id_tasa = 'MANUAL') desc, t.actualizado_en desc limit 1;
  if v_usd is null then
    select t.valor, t.fecha into v_usd, v_fu from cem_tasas_bcv t
     where t.moneda = 'USD' order by t.fecha asc limit 1;
  end if;
  if v_usd is null or v_usd <= 0 then
    raise exception 'Todavía no hay ninguna tasa del dólar guardada, así que no se puede pasar a euros.';
  end if;

  -- Dólares por euro. Un gasto en dólares NO se pasa a la par: la paridad es
  -- una concesión de precio que se le hace al estudiante al cobrar, no una
  -- verdad contable. Si la casa giró cien dólares, salieron cien dólares.
  v_tasa  := round(v_eur / v_usd, 6);
  v_fecha := least(v_fe, v_fu);
  return query select round(p_monto / v_tasa, 2), v_tasa, v_fecha;
end $function$
;
comment on function public.cem_a_base(p_monto numeric, p_moneda text, p_fecha date) is 'Pasa un monto a euros con la tasa real más cercana, y dice de qué día era esa tasa.';

CREATE OR REPLACE FUNCTION public.cem_acceso_abierto(p_enrollment_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((
    select
      -- El personal entra siempre: tiene que poder revisar el contenido.
      cem_can_read_all() or cem_is_teacher()
      -- Un programa gratuito no tiene nada que cobrar.
      or coalesce(e.precio_final, 0) <= 0
      -- Quien ya terminó conserva su acceso: pagó en su momento.
      or e.estado in ('activa', 'finalizada')
      -- Y el caso general: hay al menos un pago confirmado.
      or exists (select 1 from cem_payments p
                  where p.enrollment_id = e.id and p.estado = 'confirmado')
    from cem_enrollments e where e.id = p_enrollment_id), false);
$function$
;
comment on function public.cem_acceso_abierto(p_enrollment_id uuid) is 'La única definición de «esta persona puede entrar al programa». Si se cambia aquí, cambia en todas las puertas a la vez.';

CREATE OR REPLACE FUNCTION public.cem_activar_al_pagar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.estado = 'confirmado' and coalesce(old.estado, '') is distinct from 'confirmado' then
    update cem_enrollments
       set estado = 'activa'
     where id = new.enrollment_id and estado = 'pendiente';
    if found then
      insert into cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
      values (auth.uid(), 'inscripcion_activada_por_pago', 'cem_enrollments',
              new.enrollment_id, 'medio',
              jsonb_build_object('pago', new.id, 'monto', new.monto, 'moneda', new.moneda));
    end if;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_activar_si_es_gratis()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if coalesce(new.precio_final, 0) <= 0 and new.estado = 'pendiente' then
    new.estado := 'activa';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_actualizar_mi_perfil(p_datos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_yo uuid := auth.uid(); v_actual cem_profiles; v_tiene_cert boolean;
        v_pendiente jsonb := '{}'::jsonb;
        v_nombre text; v_apellido text; v_doc text; v_doc_tipo text;
begin
  if v_yo is null then raise exception 'Necesitas haber entrado para cambiar tus datos.'; end if;
  select * into v_actual from cem_profiles where id = v_yo;
  if v_actual.id is null then raise exception 'No encontramos tu perfil.'; end if;

  -- Lo que cualquiera puede corregir cuando quiera: no aparece en un certificado.
  update cem_profiles set
    telefono = coalesce(nullif(trim(p_datos ->> 'telefono'), ''), telefono),
    pais     = coalesce(nullif(trim(p_datos ->> 'pais'), ''), pais),
    ciudad   = coalesce(nullif(trim(p_datos ->> 'ciudad'), ''), ciudad),
    bio      = coalesce(p_datos ->> 'bio', bio),
    avatar_url = coalesce(nullif(trim(p_datos ->> 'avatar_url'), ''), avatar_url),
    fecha_nacimiento = coalesce((nullif(trim(p_datos ->> 'fecha_nacimiento'), ''))::date,
                                fecha_nacimiento)
  where id = v_yo;

  v_nombre   := nullif(trim(p_datos ->> 'nombre'), '');
  v_apellido := nullif(trim(p_datos ->> 'apellido'), '');
  v_doc      := nullif(trim(p_datos ->> 'documento'), '');
  v_doc_tipo := nullif(trim(p_datos ->> 'documento_tipo'), '');

  if v_nombre   is not distinct from v_actual.nombre         then v_nombre   := null; end if;
  if v_apellido is not distinct from v_actual.apellido       then v_apellido := null; end if;
  if v_doc      is not distinct from v_actual.documento      then v_doc      := null; end if;
  if v_doc_tipo is not distinct from v_actual.documento_tipo then v_doc_tipo := null; end if;

  if v_nombre is null and v_apellido is null and v_doc is null and v_doc_tipo is null then
    return jsonb_build_object('actualizado', true, 'requiere_aprobacion', false);
  end if;

  select exists (select 1 from cem_certificates where profile_id = v_yo) into v_tiene_cert;

  if not v_tiene_cert then
    update cem_profiles set
      nombre = coalesce(v_nombre, nombre),
      apellido = coalesce(v_apellido, apellido),
      documento = coalesce(v_doc, documento),
      documento_tipo = coalesce(v_doc_tipo, documento_tipo)
    where id = v_yo;
    return jsonb_build_object('actualizado', true, 'requiere_aprobacion', false);
  end if;

  if v_nombre   is not null then v_pendiente := v_pendiente || jsonb_build_object('nombre', v_nombre); end if;
  if v_apellido is not null then v_pendiente := v_pendiente || jsonb_build_object('apellido', v_apellido); end if;
  if v_doc      is not null then v_pendiente := v_pendiente || jsonb_build_object('documento', v_doc); end if;
  if v_doc_tipo is not null then v_pendiente := v_pendiente || jsonb_build_object('documento_tipo', v_doc_tipo); end if;

  update cem_solicitudes_perfil
     set estado = 'rechazada', resolucion = 'Reemplazada por una solicitud más reciente.',
         resuelto_en = now()
   where profile_id = v_yo and estado = 'pendiente';

  insert into cem_solicitudes_perfil (profile_id, campos, motivo)
  values (v_yo, v_pendiente, nullif(trim(p_datos ->> 'motivo'), ''));

  return jsonb_build_object('actualizado', true, 'requiere_aprobacion', true,
    'aviso', 'Ya tienes certificados emitidos con tus datos actuales, así que el cambio de nombre o documento lo revisa el equipo antes de aplicarse.');
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_admin_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if not cem_can_read_all() then raise exception 'No autorizado.'; end if;
  select jsonb_build_object(
    'estudiantes_activos', (select count(distinct profile_id) from cem_enrollments where estado = 'activa'),
    'estudiantes_total', (select count(*) from cem_profiles where rol = 'estudiante'),
    'cursos_publicados', (select count(*) from cem_courses where estado = 'publicado'),
    'cursos_total', (select count(*) from cem_courses),
    'cohortes_activas', (select count(*) from cem_cohorts where estado in ('inscripciones_abiertas','en_curso')),
    'clases_hoy', (select count(*) from cem_classes where fecha = current_date),
    'evaluaciones_pendientes', (select count(*) from cem_submissions where estado = 'entregada'),
    'inscripciones_mes', (select count(*) from cem_enrollments where fecha_inscripcion >= date_trunc('month', now())),
    'ingresos_mes', (select coalesce(sum(coalesce(monto_base, monto)), 0) from cem_payments
                      where estado = 'confirmado' and fecha >= date_trunc('month', now())),
    'ingresos_total', (select coalesce(sum(coalesce(monto_base, monto)), 0) from cem_payments
                        where estado = 'confirmado'),
    -- La cartera vencida es lo que FALTA por cobrar de esas cuotas, no lo ya
    -- abonado: `monto - saldo` estaba restando al revés.
    'cartera_vencida', (select coalesce(sum(coalesce(nullif(saldo, 0), monto)), 0) from cem_installments
                         where estado <> 'pagada' and fecha_vencimiento < current_date),
    'por_cobrar', (select coalesce(sum(coalesce(nullif(saldo, 0), monto)), 0) from cem_installments
                    where estado <> 'pagada'),
    'progreso_promedio', (select coalesce(round(avg(progreso), 1), 0) from cem_enrollments where estado = 'activa'),
    'tickets_abiertos', (select count(*) from cem_tickets where estado in ('abierto','en_proceso')),
    'apelaciones_pendientes', (select count(*) from cem_appeals where estado in ('recibida','en_analisis')),
    'contenidos_pendientes', (select count(*) from cem_content_reviews where estado = 'pendiente'),
    'certificados_emitidos', (select count(*) from cem_certificates where anulado_en is null)
  ) into v;
  return v;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_alertas_gobierno(p_dias integer DEFAULT 30)
 RETURNS TABLE(clave text, tipo text, titulo text, detalle text, riesgo text, cuando timestamp with time zone, actor text, entidad_id uuid, url text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with desde as (select (now() - make_interval(days => greatest(p_dias, 1))) as t)

  select 'ida_vuelta:' || a.entidad_id::text,
         'pago_ida_y_vuelta',
         'Pago aprobado y anulado el mismo día',
         max(coalesce(n.detalle ->> 'motivo', 'Sin motivo escrito')),
         'alto', max(n.created_at),
         max(coalesce(n.actor_email, 'sistema')), a.entidad_id,
         'admin/pagos-verificar.html'
    from cem_audit_events a
    join cem_audit_events n
      on n.entidad_id = a.entidad_id and n.accion = 'pago_anulado'
     and n.created_at::date = a.created_at::date and n.created_at >= a.created_at
   where a.accion = 'pago_aprobado' and a.created_at >= (select t from desde)
     and coalesce(n.detalle ->> 'motivo', '') not like 'Prueba autom%'
   group by a.entidad_id

  union all

  select 'cert_exc:' || a.entidad_id::text,
         'certificado_con_excepcion',
         'Certificado emitido como excepción',
         coalesce(a.detalle ->> 'motivo_excepcion', 'Sin motivo escrito'),
         'alto', a.created_at,
         coalesce(a.actor_email, 'sistema'), a.entidad_id,
         'admin/certificados.html'
    from cem_audit_events a
   where a.accion = 'certificado_emitido_excepcion' and a.created_at >= (select t from desde)

  union all

  select 'destino:' || a.id::text,
         'destino_de_cobro_cambiado',
         'Cambió la cuenta de cobro de ' || coalesce(a.detalle ->> 'metodo', 'un método'),
         format('Antes: %s · Ahora: %s',
                coalesce(nullif(a.detalle ->> 'destino_antes', ''), '(vacío)'),
                coalesce(nullif(a.detalle ->> 'destino_ahora', ''), '(vacío)')),
         'alto', a.created_at,
         coalesce(a.actor_email, 'sistema'), a.entidad_id,
         'admin/formas-de-pago.html'
    from cem_audit_events a
   where a.accion = 'pago.destino_cambiado'
     and a.created_at >= (select t from desde)
     and (a.detalle ->> 'destino_antes') is distinct from (a.detalle ->> 'destino_ahora')

  union all

  select 'rol:' || a.id::text,
         'rol_cambiado',
         'Cambió el rol de ' || coalesce(a.detalle ->> 'email', 'una cuenta'),
         format('%s → %s', coalesce(a.detalle ->> 'de', '?'), coalesce(a.detalle ->> 'a', '?')),
         'alto', a.created_at,
         coalesce(a.actor_email, 'sistema'), a.entidad_id,
         'admin/usuarios.html'
    from cem_audit_events a
   where a.accion = 'rol_cambiado' and a.created_at >= (select t from desde)

  order by 6 desc;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_alertas_gobierno_avisar()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n integer := 0; r record;
begin
  for r in select * from cem_alertas_gobierno(2) loop
    if exists (select 1 from cem_notificaciones n
                where n.tipo = 'alerta_gobierno' and n.url like '%' || r.clave || '%') then
      continue;
    end if;
    v_n := v_n + cem_avisar_equipo('alerta_gobierno', r.titulo, r.detalle,
      'admin/auditoria.html?alerta=' || r.clave,
      array['auditor','admin','superadmin']);
  end loop;
  return v_n;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_anular_certificado(p_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.cem_is_staff() then
    raise exception 'Sólo el personal puede anular un certificado.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo: queda en el registro y lo lee quien verifique.';
  end if;
  update public.cem_certificates
     set anulado_en = now(), anulado_por = auth.uid(), anulado_motivo = trim(p_motivo)
   where id = p_id and anulado_en is null;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_anular_pago(p_payment_id uuid, p_motivo text)
 RETURNS cem_payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pago public.cem_payments;
  v_cuota public.cem_installments;
  v_saldo numeric;
begin
  if not public.cem_puede_cobranza() then
    raise exception 'Sólo el personal de cobranza puede anular un pago.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Hay que dejar por escrito por qué se anula el pago.';
  end if;
  select * into v_pago from public.cem_payments where id = p_payment_id;
  if v_pago.id is null then raise exception 'Ese pago no existe.'; end if;
  if v_pago.estado = 'anulado' then raise exception 'Ese pago ya estaba anulado.'; end if;

  if v_pago.estado = 'confirmado' and v_pago.installment_id is not null then
    select * into v_cuota from public.cem_installments where id = v_pago.installment_id;
    v_saldo := round(coalesce(v_cuota.saldo, 0) + coalesce(v_pago.monto_base, v_pago.monto), 2);
    update public.cem_installments
       set saldo = least(v_saldo, v_cuota.monto),
           estado = case when v_saldo >= v_cuota.monto - 0.01 then 'pendiente'::public.cem_cuota_estado
                         else 'parcial'::public.cem_cuota_estado end
     where id = v_cuota.id;
  end if;

  update public.cem_payments
     set estado = 'anulado', conciliado = false, nota = 'Anulado: ' || btrim(p_motivo)
   where id = p_payment_id
   returning * into v_pago;

  insert into public.cem_audit_events (accion, entidad, entidad_id, riesgo, detalle)
  values ('pago_anulado', 'cem_payments', p_payment_id, 'alto',
          jsonb_build_object('referencia', v_pago.referencia, 'monto', v_pago.monto, 'motivo', btrim(p_motivo)));
  return v_pago;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_aporte_eliminar(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not cem_es_admin() then
    raise exception 'Sólo la dirección puede eliminar un movimiento de capital.';
  end if;
  update cem_aportes set eliminado = true where id = p_id and not eliminado;
  if not found then raise exception 'Ese movimiento ya no está o ya se había eliminado.'; end if;
  insert into cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'capital_eliminado', 'cem_aportes', p_id, 'alto', '{}'::jsonb);
  return jsonb_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_aporte_guardar(p_concepto text, p_monto numeric, p_tipo_capital text, p_inversor_id uuid DEFAULT NULL::uuid, p_moneda text DEFAULT 'EUR'::text, p_fecha date DEFAULT CURRENT_DATE, p_linea text DEFAULT NULL::text, p_cartera_id text DEFAULT NULL::text, p_nota text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_conv record; v_id uuid;
begin
  if not cem_es_admin() then
    raise exception 'Sólo la dirección puede registrar capital.';
  end if;
  if p_tipo_capital not in ('nuevo','reinversion') then
    raise exception 'El capital es nuevo o es reinversión: hay que elegir, no hay valor por omisión.';
  end if;
  if p_tipo_capital = 'nuevo' and p_inversor_id is null then
    raise exception 'El capital nuevo salió del bolsillo de alguien: hay que decir de quién.';
  end if;
  if p_tipo_capital = 'reinversion' and p_inversor_id is not null then
    raise exception 'Una reinversión no tiene dueño: esa plata ya era del negocio y no aumenta el capital de nadie.';
  end if;

  select * into v_conv from cem_a_base(p_monto, coalesce(p_moneda,'EUR'),
                                       coalesce(p_fecha, current_date));

  insert into cem_aportes(fecha, inversor_id, concepto, linea, tipo_capital,
                          monto, moneda, tasa, monto_base, cartera_id, nota, creado_por)
  values (coalesce(p_fecha, current_date), p_inversor_id, btrim(p_concepto),
          nullif(p_linea,'')::cem_course_tipo, p_tipo_capital,
          p_monto, coalesce(p_moneda,'EUR'),
          case when coalesce(p_moneda,'EUR') = 'EUR' then null else v_conv.tasa end,
          v_conv.monto_base, nullif(p_cartera_id,''),
          nullif(btrim(coalesce(p_nota,'')), ''), auth.uid())
  returning id into v_id;

  insert into cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'capital_registrado', 'cem_aportes', v_id, 'alto',
          jsonb_build_object('tipo', p_tipo_capital, 'monto', p_monto, 'moneda', p_moneda,
                             'monto_base', v_conv.monto_base, 'inversor_id', p_inversor_id));

  return jsonb_build_object('ok', true, 'id', v_id, 'monto_base', v_conv.monto_base);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_aprobar_pago(p_payment_id uuid, p_nota text DEFAULT NULL::text)
 RETURNS cem_payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pago public.cem_payments;
  v_cuota public.cem_installments;
  v_saldo_nuevo numeric;
begin
  if not (public.cem_puede_cobranza() or public.cem_es_servidor()) then
    raise exception 'Sólo el personal de cobranza puede aprobar un pago.';
  end if;
  select * into v_pago from public.cem_payments where id = p_payment_id;
  if v_pago.id is null then raise exception 'Ese pago no existe.'; end if;
  if v_pago.estado = 'confirmado' then
    raise exception 'Ese pago ya estaba aprobado.';
  end if;

  update public.cem_payments
     set estado = 'confirmado', conciliado = true,
         nota = coalesce(nullif(btrim(coalesce(p_nota,'')), ''), nota)
   where id = p_payment_id
   returning * into v_pago;

  if v_pago.installment_id is not null then
    select * into v_cuota from public.cem_installments where id = v_pago.installment_id;
    -- se descuenta el importe ya convertido a la moneda de la cuota
    v_saldo_nuevo := round(coalesce(v_cuota.saldo, v_cuota.monto) - coalesce(v_pago.monto_base, v_pago.monto), 2);
    update public.cem_installments
       set saldo = greatest(v_saldo_nuevo, 0),
           estado = case when v_saldo_nuevo <= 0.01 then 'pagada'::public.cem_cuota_estado
                         else 'parcial'::public.cem_cuota_estado end
     where id = v_cuota.id;
  end if;

  insert into public.cem_audit_events (accion, entidad, entidad_id, riesgo, detalle)
  values ('pago_aprobado', 'cem_payments', p_payment_id, 'medio',
          jsonb_build_object('referencia', v_pago.referencia, 'monto', v_pago.monto, 'moneda', v_pago.moneda));

  return v_pago;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_aprobar_pago_multi(p_payment_id uuid, p_nota text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pago public.cem_payments;
  v_restante numeric;
  v_aplicado jsonb := '[]'::jsonb;
  c record;
  v_aplica numeric;
  v_saldo_actual numeric;
begin
  if not public.cem_puede_cobranza() then
    raise exception 'Sólo el personal de cobranza puede aprobar un pago.';
  end if;
  select * into v_pago from public.cem_payments where id = p_payment_id;
  if v_pago.id is null then raise exception 'Ese pago no existe.'; end if;
  if v_pago.estado = 'confirmado' then raise exception 'Ese pago ya estaba aprobado.'; end if;

  v_restante := coalesce(v_pago.monto_base, v_pago.monto);

  for c in
    select * from public.cem_installments
     where enrollment_id = v_pago.enrollment_id
       and estado in ('pendiente','vencida','parcial')
     order by numero
  loop
    exit when v_restante <= 0.01;
    v_saldo_actual := coalesce(c.saldo, c.monto);
    v_aplica := least(v_restante, v_saldo_actual);
    update public.cem_installments
       set saldo = round(v_saldo_actual - v_aplica, 2),
           estado = case when round(v_saldo_actual - v_aplica, 2) <= 0.01
                         then 'pagada'::public.cem_cuota_estado
                         else 'parcial'::public.cem_cuota_estado end
     where id = c.id;
    v_aplicado := v_aplicado || jsonb_build_object('cuota', c.numero, 'aplicado', v_aplica);
    v_restante := round(v_restante - v_aplica, 2);
  end loop;

  update public.cem_payments
     set estado = 'confirmado', conciliado = true,
         nota = coalesce(nullif(btrim(coalesce(p_nota,'')), ''), nota)
   where id = p_payment_id;

  insert into public.cem_audit_events (accion, entidad, entidad_id, riesgo, detalle)
  values ('pago_aprobado_multi', 'cem_payments', p_payment_id, 'medio',
          jsonb_build_object('referencia', v_pago.referencia, 'aplicado_a', v_aplicado, 'sobrante', v_restante));

  return jsonb_build_object('aplicado_a', v_aplicado, 'sobrante', v_restante);
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_asignar_cartera_pago(p_payment_id uuid, p_cartera text)
 RETURNS cem_payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v public.cem_payments;
begin
  if not public.cem_puede_cobranza() then
    raise exception 'Sólo el personal de cobranza puede clasificar un pago.';
  end if;
  update public.cem_payments set cartera_id = p_cartera where id = p_payment_id returning * into v;
  if v.id is null then raise exception 'Ese pago no existe.'; end if;
  insert into public.cem_audit_events (accion, entidad, entidad_id, riesgo, detalle)
  values ('pago_clasificado', 'cem_payments', p_payment_id, 'medio',
          jsonb_build_object('cartera', p_cartera, 'referencia', v.referencia));
  return v;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_asignar_video(p_lesson_id uuid, p_video_id text, p_duracion_min integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_course uuid;
begin
  if not (cem_is_staff() or cem_is_teacher()) then
    raise exception 'No puedes tocar el contenido de este curso.' using errcode = '42501';
  end if;
  -- Se acepta la URL entera además del identificador, por lo mismo de siempre.
  p_video_id := coalesce(cem_youtube_id_de(p_video_id), nullif(trim(p_video_id), ''));
  if p_video_id is not null and p_video_id !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'El identificador de un vídeo de YouTube tiene 11 caracteres. Llegó "%".', p_video_id;
  end if;

  select m.course_id into v_course
    from cem_lessons l join cem_modules m on m.id = l.module_id where l.id = p_lesson_id;
  if v_course is null then raise exception 'Esa lección no existe.'; end if;

  update cem_lessons
     set video_id = p_video_id,
         -- Quitar el vídeo no debe dejar detrás la URL vieja apuntando al
         -- mismo sitio: sería quitarlo de la vista y no de la mano.
         url = case when p_video_id is null then null else url end,
         tipo = case when p_video_id is not null then 'video'::cem_leccion_tipo else tipo end,
         duracion_min = coalesce(p_duracion_min, duracion_min)
   where id = p_lesson_id;

  return cem_curso_lecciones_de_video(v_course);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_audit_perfil_sensible()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.rol is distinct from old.rol then
    insert into public.cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
    values (auth.uid(), 'rol_cambiado', 'cem_profiles', new.id, 'alto',
            jsonb_build_object('de', old.rol, 'a', new.rol, 'email', new.email));
  end if;
  if new.activo is distinct from old.activo then
    insert into public.cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
    values (auth.uid(), case when new.activo then 'cuenta_activada' else 'cuenta_desactivada' end,
            'cem_profiles', new.id, 'alto', jsonb_build_object('email', new.email));
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_aula(p_cohort uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if not public.cem_esta_en_cohorte(p_cohort) then
    raise exception 'No estás en esta clase.';
  end if;

  select jsonb_build_object(
    'cohorte', (select to_jsonb(c) || jsonb_build_object('curso', to_jsonb(cu))
                  from public.cem_cohorts c join public.cem_courses cu on cu.id = c.course_id
                 where c.id = p_cohort),
    'dicta', public.cem_dicta_cohorte(p_cohort),

    'muro', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.fijado desc, x.created_at desc) from (
        select m.id, m.cuerpo, m.adjuntos, m.fijado, m.created_at, m.editado_en,
               m.lesson_id, m.assessment_id,
               trim(coalesce(a.nombre,'') || ' ' || coalesce(a.apellido,'')) as autor,
               a.rol as autor_rol,
               coalesce((
                 select jsonb_agg(to_jsonb(k) order by k.created_at) from (
                   select c.id, c.cuerpo, c.created_at, c.autor_id,
                          trim(coalesce(ca.nombre,'') || ' ' || coalesce(ca.apellido,'')) as autor
                     from public.cem_muro_comentarios c
                     left join public.cem_profiles ca on ca.id = c.autor_id
                    where c.post_id = m.id and not c.eliminado
                 ) k), '[]'::jsonb) as comentarios
          from public.cem_muro m
          left join public.cem_profiles a on a.id = m.autor_id
         where m.cohort_id = p_cohort and not m.eliminado
         order by m.fijado desc, m.created_at desc
         limit 60
      ) x), '[]'::jsonb),

    'proximas', coalesce((
      select jsonb_agg(to_jsonb(y) order by y.cuando) from (
        select ev.id, ev.nombre as titulo, ev.cierra_en as cuando, 'evaluacion' as clase
          from public.cem_assessments ev
          join public.cem_cohorts c on c.course_id = ev.course_id
         where c.id = p_cohort and ev.estado = 'publicado'
           and ev.cierra_en is not null and ev.cierra_en >= now()
         union all
        select cl.id, cl.titulo, (cl.fecha + coalesce(cl.hora_inicio, '00:00'::time))::timestamptz, 'clase'
          from public.cem_classes cl
         where cl.cohort_id = p_cohort and cl.fecha >= current_date
      ) y), '[]'::jsonb),

    'gente', coalesce((
      select jsonb_agg(to_jsonb(z) order by z.rol, z.nombre) from (
        select pr.id, trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,'')) as nombre,
               'estudiante' as rol, e.progreso, e.estado::text as estado
          from public.cem_enrollments e join public.cem_profiles pr on pr.id = e.profile_id
         where e.cohort_id = p_cohort
         union all
        select pr.id, trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,'')),
               'profesor', null, t.rol_docente::text
          from public.cem_teacher_assignments t join public.cem_profiles pr on pr.id = t.teacher_id
         where t.cohort_id = p_cohort
      ) z), '[]'::jsonb)
  ) into v;
  return v;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_avisar_de_clase(p_class_id uuid, p_nota text DEFAULT NULL::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_c cem_classes; v_curso text; v_n integer := 0; r record;
begin
  select * into v_c from cem_classes where id = p_class_id;
  if v_c.id is null then raise exception 'Esa sesión no existe.'; end if;
  if not (cem_is_staff() or cem_docente_de_cohorte(v_c.cohort_id)) then
    raise exception 'Esa sesión no es de un grupo tuyo.';
  end if;

  select cur.nombre into v_curso
    from cem_cohorts co join cem_courses cur on cur.id = co.course_id
   where co.id = v_c.cohort_id;

  for r in
    select e.profile_id from cem_enrollments e
     where e.cohort_id = v_c.cohort_id and e.estado in ('activa','congelada')
  loop
    perform cem_notificar(r.profile_id, 'clase_en_vivo',
      format('%s · %s a las %s', coalesce(v_c.titulo, 'Sesión en vivo'),
             to_char(v_c.fecha, 'DD/MM'), to_char(v_c.hora_inicio, 'HH24:MI')),
      coalesce(nullif(trim(p_nota), ''),
               format('Sesión de %s. Entra desde tu aula.', coalesce(v_curso, 'tu programa'))),
      'estudiante/clase.html?clase=' || p_class_id::text);
    v_n := v_n + 1;
  end loop;

  insert into cem_audit_events (actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'clase_avisada', 'cem_classes', p_class_id, 'bajo',
          jsonb_build_object('avisados', v_n, 'nota', nullif(trim(p_nota), '')));

  return v_n;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_avisar_equipo(p_tipo text, p_titulo text, p_cuerpo text DEFAULT NULL::text, p_url text DEFAULT NULL::text, p_roles text[] DEFAULT ARRAY['cobranza'::text, 'admin'::text, 'superadmin'::text])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n integer := 0; r record;
begin
  for r in
    select id from cem_profiles
     where activo and rol::text = any(p_roles)
  loop
    perform cem_notificar(r.id, p_tipo, p_titulo, p_cuerpo, p_url, true);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_banco_preguntas(p_course uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if not public.cem_is_staff() and not public.cem_is_teacher() then
    raise exception 'Sólo el personal académico puede ver el banco de preguntas.';
  end if;

  select jsonb_build_object(
    'cursos', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.nombre) from (
        select cu.id, cu.nombre,
          coalesce((
            select jsonb_agg(to_jsonb(m) order by m.orden nulls last) from (
              -- El módulo sin nombre agrupa lo que no se asignó a ninguno:
              -- se ve como «Sin módulo» y no se esconde.
              select mo.id, mo.titulo, mo.orden,
                     (select count(*) from public.cem_questions q
                       where q.course_id = cu.id and q.module_id = mo.id) as preguntas,
                     (select count(*) from public.cem_assessments a
                       where a.course_id = cu.id and a.module_id = mo.id) as evaluaciones,
                     coalesce((
                       select jsonb_agg(distinct q.carpeta) from public.cem_questions q
                        where q.course_id = cu.id and q.module_id = mo.id and q.carpeta is not null
                     ), '[]'::jsonb) as carpetas
                from public.cem_modules mo where mo.course_id = cu.id
               union all
              select null, 'Sin módulo', 9999,
                     (select count(*) from public.cem_questions q
                       where q.course_id = cu.id and q.module_id is null),
                     (select count(*) from public.cem_assessments a
                       where a.course_id = cu.id and a.module_id is null),
                     coalesce((select jsonb_agg(distinct q.carpeta) from public.cem_questions q
                                where q.course_id = cu.id and q.module_id is null and q.carpeta is not null),
                              '[]'::jsonb)
            ) m), '[]'::jsonb) as modulos
        from public.cem_courses cu
        where p_course is null or cu.id = p_course
      ) c), '[]'::jsonb)
  ) into v;
  return v;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_bloquear_cambio_rol_no_admin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- Sin sesión de navegador es el servidor actuando con la clave de servicio.
  if auth.uid() is null then return new; end if;

  if new.rol is distinct from old.rol and not cem_es_admin() then
    raise exception 'Cambiar el rol de una persona sólo lo puede hacer un administrador.';
  end if;
  if new.activo is distinct from old.activo and not cem_es_admin() then
    raise exception 'Activar o desactivar una cuenta sólo lo puede hacer un administrador.';
  end if;
  -- Nadie se quita a sí mismo el rol de administrador: es la forma más común
  -- de quedarse sin ningún administrador en el sistema.
  if new.id = auth.uid() and old.rol in ('admin','superadmin')
     and new.rol not in ('admin','superadmin') then
    raise exception 'No puedes quitarte a ti mismo el rol de administrador. Pídeselo a otro administrador.';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_borrar_datos_de_prueba()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  t        record;
  fk       record;
  v_pk     text;
  v_n      bigint;
  v_tot    bigint := 0;
  v_cuelga bigint := 0;
  v_ronda  int := 0;
  v_algo   boolean;
begin
  if not cem_es_admin() then
    raise exception 'Quitar los datos de prueba lo hace la dirección.' using errcode = '42501';
  end if;

  /* Los disparadores NUESTROS, apagados: borrar cuatro mil filas de ensayo no
     es una acción de nadie y no tiene por qué llenar la auditoría. Los del
     sistema —las claves ajenas— siguen puestos: son los que garantizan que
     esto no deje nada colgando. */
  for t in select c.relname as tabla
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'cem\_%'
  loop
    execute format('alter table public.%I disable trigger user', t.tabla);
  end loop;

  loop
    v_ronda := v_ronda + 1;
    v_algo := false;

    /* 1 · lo que CUELGA de una fila de prueba. Se pregunta a Postgres qué
           claves ajenas apuntan a cada tabla del registro, en vez de mantener
           a mano una lista que se rompe con la siguiente tabla que alguien
           añada. Sólo claves de una columna: no hay ninguna compuesta aquí, y
           si algún día la hubiera es mejor que esto se pare a que adivine. */
    for fk in
      select distinct
             hijo.relname   as tabla_hija,
             ah.attname     as col_hija,
             padre.relname  as tabla_padre,
             ap.attname     as col_padre
        from pg_constraint c
        join pg_class  hijo  on hijo.oid  = c.conrelid
        join pg_class  padre on padre.oid = c.confrelid
        join pg_namespace nh on nh.oid = hijo.relnamespace
        join pg_attribute ah on ah.attrelid = hijo.oid  and ah.attnum = c.conkey[1]
        join pg_attribute ap on ap.attrelid = padre.oid and ap.attnum = c.confkey[1]
       where c.contype = 'f'
         and nh.nspname = 'public'
         and array_length(c.conkey, 1) = 1
         and padre.relname in (select distinct tabla from cem_datos_de_prueba)
         and hijo.relname like 'cem\_%'
    loop
      execute format(
        'delete from public.%1$I h
          where h.%2$I::text in (select fila_id from cem_datos_de_prueba where tabla = %3$L)
            and not exists (select 1 from cem_datos_de_prueba d
                             where d.tabla = %1$L and d.fila_id = h.%4$I::text)',
        fk.tabla_hija, fk.col_hija, fk.tabla_padre,
        (select a.attname from pg_index i
           join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
          where i.indrelid = ('public.' || fk.tabla_hija)::regclass and i.indisprimary));
      get diagnostics v_n = row_count;
      if v_n > 0 then v_algo := true; v_cuelga := v_cuelga + v_n; end if;
    end loop;

    /* 2 · y ahora las del registro. */
    for t in select distinct tabla from cem_datos_de_prueba loop
      select a.attname into v_pk
        from pg_index i
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
       where i.indrelid = ('public.' || t.tabla)::regclass and i.indisprimary;
      begin
        execute format(
          'delete from public.%1$I x
            where x.%2$I::text in (select fila_id from cem_datos_de_prueba where tabla = %1$L)',
          t.tabla, v_pk);
        get diagnostics v_n = row_count;
        v_tot := v_tot + v_n;
        delete from cem_datos_de_prueba where tabla = t.tabla;
        v_algo := true;
      exception when foreign_key_violation then
        null;   -- todavía tiene hijos; a la vuelta siguiente
      end;
    end loop;

    exit when not v_algo or v_ronda > 25 or not exists (select 1 from cem_datos_de_prueba);
  end loop;

  for t in select c.relname as tabla
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'cem\_%'
  loop
    execute format('alter table public.%I enable trigger user', t.tabla);
  end loop;

  if exists (select 1 from cem_datos_de_prueba) then
    raise exception 'Quedaron filas de prueba que algo está usando: %. '
                    'No se borra nada a la fuerza.',
      (select string_agg(distinct tabla, ', ') from cem_datos_de_prueba);
  end if;

  delete from auth.users where email like '%@pruebas.local';

  return jsonb_build_object('ok', true, 'filas', v_tot, 'colgando', v_cuelga,
                            'vueltas', v_ronda);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_borrar_duda(p_duda_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_d cem_dudas;
begin
  select * into v_d from cem_dudas where id = p_duda_id;
  if v_d.id is null then return; end if;
  if not (v_d.autor_id = auth.uid() or cem_docente_de_curso(v_d.course_id) or cem_is_staff()) then
    raise exception 'No puedes borrar esta duda.';
  end if;
  update cem_dudas set eliminada = true where id = p_duda_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_a_quien_llamo_hoy(p_cuantos integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(x order by (x->>'peso')::numeric desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'quien',    trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,'')),
             'telefono', pr.telefono,
             'email',    pr.email,
             'programa', c.nombre,
             'cuota',    i.numero,
             'debe',     to_char(coalesce(i.saldo, i.monto), 'FM999999990.00'),
             'moneda',   i.moneda,
             'dias',     (current_date - i.fecha_vencimiento),
             'ultimo_contacto', (
               select to_char(max(n.created_at) at time zone 'America/Caracas', 'DD/MM/YYYY')
                 from cem_notificaciones n
                where n.profile_id = e.profile_id and n.tipo like 'cuota_%'),
             'enlace',   'admin/inscripciones.html#' || i.id,
             'peso',     coalesce(i.saldo, i.monto)
                         * greatest(1, (current_date - i.fecha_vencimiento))) as x
      from cem_installments i
      join cem_enrollments e on e.id = i.enrollment_id
      join cem_courses c     on c.id = e.course_id
      join cem_profiles pr   on pr.id = e.profile_id
     where i.estado in ('vencida','parcial')
       and coalesce(i.saldo, i.monto) > 0
       and i.fecha_vencimiento < current_date
     order by coalesce(i.saldo, i.monto)
              * greatest(1, (current_date - i.fecha_vencimiento)) desc
     limit greatest(1, least(40, coalesce(p_cuantos, 12)))
  ) t;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_abrir(p_ambito text DEFAULT 'estudiante'::text, p_canal text DEFAULT 'web'::text)
 RETURNS cem_bot_conversaciones
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_yo cem_profiles; v_c cem_bot_conversaciones; v_ambito text;
begin
  select * into v_yo from cem_profiles where id = auth.uid();
  if v_yo.id is null then raise exception 'Hay que entrar para hablar con el asistente.'; end if;

  v_ambito := case
    when p_ambito = 'equipo'
     and v_yo.rol in ('profesor','cobranza','coordinador','admin','superadmin','auditor')
    then 'equipo' else 'estudiante' end;

  select * into v_c from cem_bot_conversaciones
   where profile_id = v_yo.id and ambito = v_ambito and canal = coalesce(p_canal,'web')
     and ultimo_en > now() - interval '12 hours'
   order by ultimo_en desc limit 1;

  if v_c.id is null then
    insert into cem_bot_conversaciones (profile_id, ambito, canal)
    values (v_yo.id, v_ambito, coalesce(p_canal,'web')) returning * into v_c;
  end if;
  return v_c;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_abrir_whatsapp(p_telefono text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tel text := cem_tel_normal(p_telefono);
  v_id uuid; v_conv uuid; v_ambito text; v_cuantos int;
begin
  select n.profile_id, n.ambito into v_id, v_ambito
    from cem_bot_numeros n where n.telefono = v_tel and n.activo;

  if v_id is null and length(v_tel) = 10 then
    select count(*) into v_cuantos from cem_profiles p
     where p.activo and cem_tel_normal(p.telefono) = v_tel;
    if v_cuantos = 1 then
      select p.id into v_id from cem_profiles p
       where p.activo and cem_tel_normal(p.telefono) = v_tel;
    end if;
    v_ambito := 'estudiante';
  end if;

  -- Se reaprovecha la conversación abierta de las últimas 12 horas: si cada
  -- mensaje abriera una nueva, el asistente no recordaría lo que se acaba de
  -- decir y volvería a preguntar el nombre en cada línea.
  select c.id into v_conv from cem_bot_conversaciones c
   where c.canal = 'whatsapp' and c.telefono = v_tel
     and c.ultimo_en > now() - interval '12 hours'
   order by c.ultimo_en desc limit 1;
  if v_conv is not null then return v_conv; end if;

  insert into cem_bot_conversaciones (profile_id, ambito, canal, telefono, titulo)
  values (v_id, coalesce(v_ambito, 'estudiante'), 'whatsapp', v_tel, 'WhatsApp ' || v_tel)
  returning id into v_conv;
  return v_conv;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_al_cambiar_catalogo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  begin
    perform cem_bot_refrescar_ahora();
  exception when others then
    -- A propósito: que el asistente no se entere NUNCA puede impedir guardar
    -- un curso. Queda en el registro del servidor para quien lo mire.
    raise warning 'El asistente no pudo ponerse al día: %', sqlerrm;
  end;
  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_anotar(p_texto text, p_telefono text DEFAULT NULL::text, p_canal text DEFAULT 'whatsapp'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_texto text := trim(cem_redactar(p_texto));
begin
  -- Un «ok», un «gracias» o un emoji suelto no enseñan nada y llenarían la
  -- lista de ruido hasta que nadie la mire.
  if length(v_texto) < 12 then return; end if;

  insert into cem_bot_escuchado (canal, quien_huella, texto)
  values (coalesce(p_canal, 'whatsapp'),
          case when p_telefono is null then null
               else encode(sha256(convert_to('cem-escucha:' || cem_tel_normal(p_telefono), 'UTF8')), 'hex') end,
          left(v_texto, 1000));
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_anotar_accion(p_accion text, p_entidad text, p_entidad_id uuid, p_riesgo text DEFAULT 'medio'::text, p_detalle jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(),
          (select email from cem_profiles where id = auth.uid()),
          'asistente.' || p_accion, p_entidad, p_entidad_id, p_riesgo,
          p_detalle || jsonb_build_object('por', 'Cemi'));
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_apuntarme(p_programa text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_c      cem_courses;
  v_cuenta integer;
  v_ya     uuid;
  v_id     uuid;
begin
  if auth.uid() is null then
    raise exception 'Hay que entrar a la cuenta para inscribirse.';
  end if;

  -- Un nombre a medias no puede elegir por la persona. Si encaja en más de un
  -- programa se devuelven los candidatos y decide ella, no el modelo.
  select count(*) into v_cuenta
    from cem_courses c
   where c.estado = 'publicado'
     and c.nombre ilike '%' || coalesce(p_programa, '') || '%';

  if v_cuenta = 0 then
    return jsonb_build_object('hecho', false, 'porque', 'no_encontrado');
  elsif v_cuenta > 1 then
    return jsonb_build_object('hecho', false, 'porque', 'varios',
      'candidatos', (select jsonb_agg(c.nombre) from cem_courses c
                      where c.estado = 'publicado'
                        and c.nombre ilike '%' || coalesce(p_programa, '') || '%'));
  end if;

  select * into v_c
    from cem_courses c
   where c.estado = 'publicado'
     and c.nombre ilike '%' || coalesce(p_programa, '') || '%';

  select e.id into v_ya from cem_enrollments e
   where e.profile_id = auth.uid() and e.course_id = v_c.id
     and e.estado not in ('cancelada');
  if v_ya is not null then
    return jsonb_build_object('hecho', false, 'porque', 'ya_inscrito',
                              'programa', v_c.nombre);
  end if;

  insert into cem_enrollments (profile_id, course_id, estado, precio_lista,
                               precio_final, moneda, fuente)
  values (auth.uid(), v_c.id, 'pendiente', v_c.precio, v_c.precio,
          coalesce(v_c.moneda, 'USD'), 'asistente')
  returning id into v_id;

  return jsonb_build_object(
    'hecho', true, 'programa', v_c.nombre,
    'precio', to_char(coalesce(v_c.precio, 0), 'FM999999990.00'),
    'moneda', coalesce(v_c.moneda, 'USD'),
    'estado', 'pendiente de pago',
    'siguiente_paso', 'estudiante/pagos.html');
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_avisame_antes(p_dias integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_d integer := greatest(1, least(30, coalesce(p_dias, 3)));
begin
  if auth.uid() is null then
    raise exception 'Hay que entrar a la cuenta para poner un recordatorio.';
  end if;

  insert into cem_bot_recordatorios (profile_id, dias_antes, activo, puesto_en)
  values (auth.uid(), v_d, true, now())
  on conflict (profile_id)
    do update set dias_antes = excluded.dias_antes, activo = true, puesto_en = now();

  return jsonb_build_object('dias_antes', v_d, 'guardado', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_borrador_confirmar(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_b      cem_bot_borradores;
  v_n      integer := 0;
  v_fallos jsonb := '[]'::jsonb;
  v_el     jsonb;
  v_uuid   uuid;
  r        record;
begin
  select * into v_b from cem_bot_borradores where id = p_id;
  if v_b.id is null then
    raise exception 'Ese borrador no existe.';
  end if;
  if v_b.estado <> 'pendiente' then
    return jsonb_build_object('hecho', false, 'porque', 'ya_estaba_' || v_b.estado);
  end if;
  -- Una lista calculada hace tres horas ya no es la de ahora: puede haber
  -- gente que entregó o pagó desde entonces, y mandarles el recordatorio sería
  -- decirles algo falso.
  if v_b.created_at <= now() - interval '2 hours' then
    update cem_bot_borradores set estado = 'caducado', resuelto_en = now() where id = p_id;
    return jsonb_build_object('hecho', false, 'porque', 'caducado',
      'que_hacer', 'Pídeselo otra vez a Cemi: recalcula la lista con lo de ahora.');
  end if;

  if v_b.tipo = 'recordatorio_entrega' then
    for v_el in select * from jsonb_array_elements(v_b.ids) loop
      v_uuid := (v_el #>> '{}')::uuid;
      perform cem_notificar(v_uuid, 'recordatorio_entrega',
                            'Te falta una entrega', v_b.cuerpo,
                            'estudiante/evaluaciones.html');
      v_n := v_n + 1;
    end loop;

  elsif v_b.tipo = 'recordatorio_cuota' then
    for r in
      select distinct e.profile_id, i.id as cuota
        from cem_installments i
        join cem_enrollments e on e.id = i.enrollment_id
       where i.id in (select (jsonb_array_elements(v_b.ids) #>> '{}')::uuid)
    loop
      perform cem_notificar(r.profile_id, 'recordatorio_cuota',
                            'Tu cuota vence pronto', v_b.cuerpo,
                            'estudiante/pagos.html#' || r.cuota::text);
      v_n := v_n + 1;
    end loop;

  elsif v_b.tipo = 'certificados_lote' then
    for v_el in select * from jsonb_array_elements(v_b.ids) loop
      v_uuid := (v_el #>> '{}')::uuid;
      -- Uno que falle no puede tumbar el lote entero: se anota y se sigue.
      -- Emitir 9 de 10 y decir cuál falló es mucho mejor que emitir 0.
      begin
        perform cem_issue_certificate(v_uuid, null, 'certificado');
        v_n := v_n + 1;
      exception when others then
        v_fallos := v_fallos || jsonb_build_array(
          jsonb_build_object('inscripcion', v_uuid, 'porque', sqlerrm));
      end;
    end loop;

  else
    raise exception 'Tipo de borrador desconocido: %', v_b.tipo;
  end if;

  update cem_bot_borradores
     set estado = 'confirmado', resuelto_por = auth.uid(), resuelto_en = now(),
         resultado = jsonb_build_object('hechos', v_n, 'fallos', v_fallos)
   where id = p_id;

  perform cem_bot_anotar_accion('borrador_confirmado', 'cem_bot_borradores', p_id,
    case when v_b.tipo = 'certificados_lote' then 'alto' else 'medio' end,
    jsonb_build_object('tipo', v_b.tipo, 'hechos', v_n, 'fallos', v_fallos));

  return jsonb_build_object('hecho', true, 'tipo', v_b.tipo,
                            'hechos', v_n, 'fallos', v_fallos);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_borrador_descartar(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare v_n integer;
begin
  update cem_bot_borradores
     set estado = 'descartado', resuelto_por = auth.uid(), resuelto_en = now()
   where id = p_id and estado = 'pendiente';
  get diagnostics v_n = row_count;
  return jsonb_build_object('hecho', v_n > 0);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_borrador_vigente(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from cem_bot_borradores b
                  where b.id = p_id and b.estado = 'pendiente'
                    and b.created_at > now() - interval '2 hours');
$function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_borradores_listar(p_solo_pendientes boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id',       b.id,
           'tipo',     b.tipo,
           'resumen',  b.resumen,
           'mensaje',  b.cuerpo,
           'a_quien',  b.a_quien,
           'cuantos',  jsonb_array_length(b.ids),
           'estado',   b.estado,
           'vigente',  b.estado = 'pendiente' and b.created_at > now() - interval '2 hours',
           'pidio',    trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,'')),
           'cuando',   to_char(b.created_at at time zone 'America/Caracas', 'DD/MM/YYYY HH24:MI'),
           'resultado', b.resultado)
         order by b.created_at desc), '[]'::jsonb)
    from cem_bot_borradores b
    left join cem_profiles pr on pr.id = b.creado_por
   where (not p_solo_pendientes or b.estado = 'pendiente')
     and b.created_at > now() - interval '7 days';
$function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_buscar_en_lecciones(p_texto text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(x order by (x->>'peso')::real desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'programa', c.nombre,
             'modulo',   m.titulo,
             'leccion',  l.titulo,
             'de_que_va', l.descripcion,
             'tipo',     l.tipo,
             'dura',     case when l.duracion_min is not null
                              then l.duracion_min || ' min' else null end,
             'enlace',   'estudiante/clase.html?clase=' || l.id,
             'peso',     ts_rank(
                           to_tsvector('spanish',
                             coalesce(l.titulo, '') || ' ' || coalesce(l.descripcion, '')
                             || ' ' || coalesce(m.titulo, '')),
                           plainto_tsquery('spanish', p_texto))) as x
      from cem_lessons l
      join cem_modules m on m.id = l.module_id
      join cem_courses c on c.id = m.course_id
      join cem_enrollments e on e.course_id = c.id and e.profile_id = auth.uid()
     where l.estado = 'publicado'
       and nullif(trim(coalesce(p_texto, '')), '') is not null
       and to_tsvector('spanish',
             coalesce(l.titulo, '') || ' ' || coalesce(l.descripcion, '')
             || ' ' || coalesce(m.titulo, ''))
           @@ plainto_tsquery('spanish', p_texto)
     limit 6
  ) t;
$function$
;
comment on function public.cem_bot_buscar_en_lecciones(p_texto text) is 'Busca lecciones de los programas de quien pregunta, por titulo, descripcion y nombre del modulo. NO busca dentro del contenido de la leccion: esa columna esta cerrada a proposito porque lleva los enlaces de video.';

CREATE OR REPLACE FUNCTION public.cem_bot_como_pago()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'cuotas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'programa', c.nombre,
               'numero',   i.numero,
               'monto',    to_char(coalesce(i.saldo, i.monto), 'FM999999990.00'),
               'moneda',   i.moneda,
               'vence',    to_char(i.fecha_vencimiento, 'DD/MM/YYYY'),
               'estado',   i.estado,
               'dias',     (i.fecha_vencimiento - current_date))
             order by i.fecha_vencimiento)
        from cem_installments i
        join cem_enrollments e on e.id = i.enrollment_id
        join cem_courses c on c.id = e.course_id
       where e.profile_id = auth.uid()
         and i.estado in ('pendiente', 'parcial', 'vencida')), '[]'::jsonb),
    'donde_pagar', coalesce((
      select jsonb_agg(jsonb_build_object(
               'metodo',  mp.metodo,
               'moneda',  mp.moneda,
               'titular', mp.titular,
               'destino', mp.destino,
               'etiqueta', mp.destino_etiqueta,
               'como',    mp.instrucciones)
             order by mp.orden)
        from cem_metodos_pago mp where mp.activo), '[]'::jsonb),
    'donde_reportarlo', 'estudiante/pagos.html');
$function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_contexto(p_ambito text DEFAULT 'estudiante'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_yo cem_profiles;
  v_es_equipo boolean;
  v_ambito text := coalesce(p_ambito, 'estudiante');
  v_res jsonb;
  v_cifras jsonb := '{}'::jsonb;
  v_n bigint;
begin
  select * into v_yo from cem_profiles where id = auth.uid();
  if v_yo.id is null then
    return jsonb_build_object('quien', null, 'ambito', 'publico',
      'programas', coalesce((
        select jsonb_agg(jsonb_build_object('nombre', c.nombre, 'tipo', c.tipo,
                 'precio', c.precio, 'moneda', c.moneda, 'horas', c.horas,
                 'resumen', c.descripcion_corta))
          from cem_courses c where c.estado='publicado'), '[]'::jsonb),
      'aviso', 'Nadie ha entrado: sólo se puede hablar del catálogo público.');
  end if;

  v_es_equipo := v_yo.rol in ('profesor','cobranza','coordinador','admin','superadmin','auditor');
  if v_ambito = 'equipo' and not v_es_equipo then
    v_ambito := 'estudiante';   -- pedir el ámbito del equipo no te hace del equipo
  end if;

  v_res := jsonb_build_object(
    'quien', jsonb_build_object(
      'nombre', trim(coalesce(v_yo.nombre,'') || ' ' || coalesce(v_yo.apellido,'')),
      'rol', v_yo.rol,
      'primer_nombre', split_part(trim(coalesce(v_yo.nombre,'')), ' ', 1)),
    'ambito', v_ambito,
    'hoy', to_char(now() at time zone 'America/Caracas', 'DD/MM/YYYY HH24:MI'),

    'programas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nombre', c.nombre, 'tipo', c.tipo, 'modalidad', c.modalidad,
               'horas', c.horas, 'precio', c.precio, 'moneda', c.moneda,
               'duracion', c.duracion_texto, 'resumen', c.descripcion_corta,
               'cuotas', c.cuotas_habilitadas,
               'modulos', (select jsonb_agg(jsonb_build_object(
                     'titulo', m.titulo, 'horas', m.horas, 'certifica', m.certifica)
                     order by m.orden)
                   from cem_modules m where m.course_id = c.id)))
        from cem_courses c where c.estado = 'publicado'), '[]'::jsonb),

    'lo_mio', jsonb_build_object(
      'inscripciones', coalesce((
        select jsonb_agg(jsonb_build_object('programa', cu.nombre, 'estado', e.estado,
                 'avance', round(coalesce(e.progreso,0)) || '%'))
          from cem_enrollments e join cem_courses cu on cu.id = e.course_id
         where e.profile_id = v_yo.id), '[]'::jsonb),
      'certificados', coalesce((
        select jsonb_agg(jsonb_build_object('titulo', ce.titulo, 'codigo', ce.codigo,
                 'emitido', to_char(ce.emitido_en, 'DD/MM/YYYY')))
          from cem_certificates ce
         where ce.profile_id = v_yo.id and ce.anulado_en is null), '[]'::jsonb),
      'cuotas_por_pagar', coalesce((
        select jsonb_agg(jsonb_build_object('numero', i.numero, 'monto', i.saldo,
                 'moneda', i.moneda, 'vence', to_char(i.fecha_vencimiento,'DD/MM/YYYY'),
                 'estado', i.estado))
          from cem_installments i join cem_enrollments e on e.id = i.enrollment_id
         where e.profile_id = v_yo.id
           and i.estado in ('pendiente','parcial','vencida')), '[]'::jsonb)),

    'lo_aprendido', coalesce((
      select jsonb_agg(jsonb_build_object('titulo', k.titulo, 'contenido', k.contenido)
             order by k.origen, k.titulo)
        from cem_bot_conocimiento k
       where k.activo and k.ambito in (v_ambito, 'ambos')), '[]'::jsonb)
  );

  if v_ambito = 'equipo' then
    begin
      select count(*) into v_n from cem_profiles where rol='estudiante';
      v_cifras := v_cifras || jsonb_build_object('estudiantes', v_n);
    exception when others then null; end;
    begin
      select count(*) into v_n from cem_enrollments where estado='activa';
      v_cifras := v_cifras || jsonb_build_object('inscripciones_activas', v_n);
    exception when others then null; end;
    begin
      select count(*) into v_n from cem_leads_listar() where estado='nuevo';
      v_cifras := v_cifras || jsonb_build_object('contactos_sin_atender', v_n);
    exception when others then null; end;
    begin
      select count(*) into v_n from cem_installments where estado='vencida';
      v_cifras := v_cifras || jsonb_build_object('cuotas_vencidas', v_n);
    exception when others then null; end;
    begin
      select count(*) into v_n from cem_certificates where anulado_en is null;
      v_cifras := v_cifras || jsonb_build_object('certificados_emitidos', v_n);
    exception when others then null; end;
    v_res := v_res || jsonb_build_object('del_negocio', v_cifras);
  end if;

  return v_res;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_contexto_whatsapp(p_telefono text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tel text := cem_tel_normal(p_telefono);
  v_id uuid; v_ambito text; v_cuantos int;
  v_ctx jsonb;
  v_nombre text;
begin
  -- Con qué nombre se presenta por este canal. Se lee de Configuración y no se
  -- escribe en la función de borde a propósito: cambiarlo no debería exigir un
  -- despliegue. Si no está puesto, se cae al nombre de siempre.
  select coalesce(
           (select s.valor #>> '{}' from cem_settings s where s.clave = 'asistente_nombre_whatsapp'),
           (select s.valor #>> '{}' from cem_settings s where s.clave = 'asistente_nombre'),
           'Cemi')
    into v_nombre;

  select n.profile_id, n.ambito into v_id, v_ambito
    from cem_bot_numeros n
   where n.telefono = v_tel and n.activo;

  if v_id is null then
    select count(*) into v_cuantos from cem_profiles p
     where p.activo and cem_tel_normal(p.telefono) = v_tel and length(v_tel) = 10;
    if v_cuantos = 1 then
      select p.id into v_id from cem_profiles p
       where p.activo and cem_tel_normal(p.telefono) = v_tel;
      -- Aunque sea del equipo: por un número sin registrar, ámbito de alumno.
      v_ambito := 'estudiante';
    end if;
  end if;

  if v_id is null then
    -- Nadie identificado: sólo lo público. Es el caso normal de alguien que
    -- escribe por primera vez preguntando qué cursos hay.
    return jsonb_build_object(
      'ambito', 'estudiante',
      'canal', 'whatsapp',
      'asistente', jsonb_build_object('nombre', v_nombre),
      'quien', null,
      'programas', coalesce((
        select jsonb_agg(jsonb_build_object(
          'nombre', c.nombre, 'tipo', c.tipo, 'precio', c.precio, 'moneda', c.moneda,
          'horas', c.horas, 'duracion', c.duracion_texto, 'resumen', c.descripcion_corta,
          'cuotas', c.cuotas_habilitadas))
        from cem_courses c where c.estado = 'publicado'), '[]'::jsonb),
      'lo_aprendido', coalesce((
        select jsonb_agg(jsonb_build_object('titulo', k.titulo, 'contenido', k.contenido))
        from cem_bot_conocimiento k
       where k.activo and k.ambito in ('estudiante','ambos')), '[]'::jsonb));
  end if;

  -- Identificado: se le pide el contexto a la MISMA función que usa la web,
  -- ejecutándola como esa persona. Así no hay dos definiciones de «lo que
  -- puede ver fulano» que se puedan separar con el tiempo.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id::text, 'role', 'authenticated')::text, true);
  begin
    v_ctx := cem_bot_contexto(v_ambito);
  exception when others then
    v_ctx := jsonb_build_object('ambito', 'estudiante', 'quien', null);
  end;
  perform set_config('request.jwt.claims', null, true);

  return coalesce(v_ctx, '{}'::jsonb) || jsonb_build_object(
    'canal', 'whatsapp',
    'asistente', jsonb_build_object('nombre', v_nombre));
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_conversacion_ver(p_conversacion uuid)
 RETURNS TABLE(quien text, texto text, modelo text, ms integer, error text, cuando timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (cem_es_admin() or cem_es_auditor() or cem_role() = 'coordinador') then
    raise exception 'Sólo el equipo puede leer una conversación del asistente.';
  end if;
  return query
  select m.quien, m.texto, m.modelo, m.ms, m.error, m.created_at
    from cem_bot_mensajes m
   where m.conversacion_id = p_conversacion
   order by m.created_at asc
   limit 500;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_conversaciones_de(p_profile_id uuid)
 RETURNS TABLE(id uuid, ambito text, canal text, mensajes bigint, ultimo timestamp with time zone, escalado_en timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (cem_es_admin() or cem_es_auditor() or cem_role() = 'coordinador') then
    raise exception 'Sólo el equipo puede ver las conversaciones del asistente.';
  end if;
  return query
  select c.id, c.ambito, c.canal,
         (select count(*) from cem_bot_mensajes m where m.conversacion_id = c.id),
         c.ultimo_en, c.escalado_en
    from cem_bot_conversaciones c
   where c.profile_id = p_profile_id
   order by c.ultimo_en desc nulls last, c.created_at desc
   limit 100;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_conversaciones_listar(p_dias integer DEFAULT 30, p_ambito text DEFAULT NULL::text, p_solo_escaladas boolean DEFAULT false)
 RETURNS TABLE(id uuid, ambito text, canal text, titulo text, persona text, correo text, mensajes bigint, ultimo timestamp with time zone, escalado_en timestamp with time zone, escalado_motivo text, fallos bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (cem_es_admin() or cem_es_auditor() or cem_role() = 'coordinador') then
    raise exception 'Sólo el equipo puede ver las conversaciones del asistente.';
  end if;

  return query
  select c.id, c.ambito, c.canal, c.titulo,
         trim(coalesce(pr.nombre, '') || ' ' || coalesce(pr.apellido, '')) as persona,
         pr.email as correo,
         count(m.id) as mensajes,
         max(m.created_at) as ultimo,
         c.escalado_en, c.escalado_motivo,
         count(m.id) filter (where m.error is not null) as fallos
    from cem_bot_conversaciones c
    left join cem_profiles pr on pr.id = c.profile_id
    left join cem_bot_mensajes m on m.conversacion_id = c.id
   where c.created_at >= now() - make_interval(days => greatest(p_dias, 1))
     and (p_ambito is null or c.ambito = p_ambito)
     and (not p_solo_escaladas or c.escalado_en is not null)
   group by c.id, pr.nombre, pr.apellido, pr.email
   order by max(m.created_at) desc nulls last, c.created_at desc
   limit 300;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_cuanto_entro(p_dias integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_d     integer := greatest(1, least(365, coalesce(p_dias, 7)));
  v_desde date := current_date - v_d + 1;
  v_antes date := current_date - (v_d * 2) + 1;
  v_res   jsonb;
begin
  select jsonb_build_object(
    'desde', to_char(v_desde, 'DD/MM/YYYY'),
    'hasta', to_char(current_date, 'DD/MM/YYYY'),

    'por_metodo', coalesce((
      select jsonb_agg(jsonb_build_object(
               'metodo',  g.metodo,
               'moneda',  g.moneda,
               'cuantos', g.cuantos,
               'suma',    to_char(g.suma, 'FM999999990.00'))
             order by g.suma desc)
        from (select coalesce(p.metodo, 'sin metodo') as metodo, p.moneda,
                     count(*) as cuantos, sum(p.monto) as suma
                from cem_payments p
               where p.estado = 'confirmado'
                 and p.fecha::date between v_desde and current_date
               group by 1, 2) g), '[]'::jsonb),

    'periodo_anterior', coalesce((
      select jsonb_agg(jsonb_build_object(
               'moneda', g.moneda,
               'suma',   to_char(g.suma, 'FM999999990.00'))
             order by g.moneda)
        from (select p.moneda, sum(p.monto) as suma
                from cem_payments p
               where p.estado = 'confirmado'
                 and p.fecha::date between v_antes and v_desde - 1
               group by 1) g), '[]'::jsonb),

    'sin_verificar', coalesce((
      select jsonb_agg(jsonb_build_object(
               'moneda',  g.moneda,
               'cuantos', g.cuantos,
               'suma',    to_char(g.suma, 'FM999999990.00'))
             order by g.moneda)
        from (select p.moneda, count(*) as cuantos, sum(p.monto) as suma
                from cem_payments p
               where p.estado = 'registrado'
               group by 1) g), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_deshacer(p_evento uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_a      cem_audit_events;
  v_motivo text := coalesce(nullif(trim(coalesce(p_motivo, '')), ''),
                            'Deshecho desde el asistente');
  v_est    text;
  v_n      integer := 0;
begin
  select * into v_a from cem_audit_events where id = p_evento;
  if v_a.id is null then
    raise exception 'No encuentro ese registro.';
  end if;
  if v_a.accion not like 'asistente.%' then
    return jsonb_build_object('hecho', false, 'porque', 'no_lo_hizo_cemi',
      'que_hacer', 'Esto lo hizo una persona desde una pantalla. Se deshace en esa pantalla.');
  end if;

  -- El guarda mira si YA existe el evento de deshacer, no una marca dentro del
  -- original. La auditoría no se reescribe.
  if exists (select 1 from cem_audit_events d
              where d.accion = 'asistente.deshecho'
                and d.detalle->>'evento_original' = p_evento::text) then
    return jsonb_build_object('hecho', false, 'porque', 'ya_estaba_deshecho');
  end if;

  if v_a.entidad = 'cem_enrollments' then
    select e.estado::text into v_est from cem_enrollments e where e.id = v_a.entidad_id;
    if v_est is null then
      return jsonb_build_object('hecho', false, 'porque', 'ya_no_existe');
    end if;
    if v_est = 'cancelada' then
      return jsonb_build_object('hecho', false, 'porque', 'ya_estaba_cancelada');
    end if;
    if exists (select 1 from cem_payments p
                where p.enrollment_id = v_a.entidad_id and p.estado = 'confirmado') then
      return jsonb_build_object('hecho', false, 'porque', 'ya_pago',
        'que_hacer', 'Hay un pago confirmado en esa inscripcion. Anularla es devolver dinero, '
                     || 'y eso se decide en Inscripciones, no aqui.');
    end if;
    delete from cem_installments
     where enrollment_id = v_a.entidad_id and estado in ('pendiente','vencida');
    update cem_enrollments set estado = 'cancelada' where id = v_a.entidad_id;
    get diagnostics v_n = row_count;
    -- RLS puede filtrar sin protestar: si no cambió ninguna fila, no se miente
    -- diciendo que se deshizo.
    if v_n = 0 then
      return jsonb_build_object('hecho', false, 'porque', 'sin_permiso',
        'que_hacer', 'Tu cuenta no puede cancelar inscripciones.');
    end if;

  elsif v_a.entidad = 'cem_payments' then
    select p.estado into v_est from cem_payments p where p.id = v_a.entidad_id;
    if v_est is null then
      return jsonb_build_object('hecho', false, 'porque', 'ya_no_existe');
    end if;
    if v_est = 'confirmado' then
      return jsonb_build_object('hecho', false, 'porque', 'ya_verificado',
        'que_hacer', 'Ese pago ya se verifico. Quitarlo descuadra la caja: hazlo en Verificar pagos.');
    end if;
    delete from cem_payments where id = v_a.entidad_id;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      return jsonb_build_object('hecho', false, 'porque', 'sin_permiso',
        'que_hacer', 'Tu cuenta no puede borrar pagos.');
    end if;

  elsif v_a.entidad = 'cem_certificates' then
    perform cem_anular_certificado(v_a.entidad_id, v_motivo);
    v_n := 1;

  elsif v_a.entidad = 'cem_attendance' then
    return jsonb_build_object('hecho', false, 'porque', 'no_se_puede_deshacer',
      'que_hacer', 'La asistencia no guarda como estaba antes. Vuelve a pasarla con los nombres '
                   || 'correctos: la de ahora sustituye a la anterior.');

  elsif v_a.entidad = 'cem_bot_recordatorios' then
    delete from cem_bot_recordatorios where profile_id = auth.uid();
    v_n := 1;

  else
    return jsonb_build_object('hecho', false, 'porque', 'no_se_deshace_esto',
                              'entidad', v_a.entidad);
  end if;

  perform cem_bot_anotar_accion('deshecho', v_a.entidad, v_a.entidad_id, 'alto',
    jsonb_build_object('evento_original', p_evento::text, 'motivo', v_motivo,
                       'que_se_deshizo', replace(v_a.accion, 'asistente.', '')));

  return jsonb_build_object('hecho', true, 'entidad', v_a.entidad, 'filas', v_n);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_donde_me_quede()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_out       jsonb := '[]'::jsonb;
  r           record;
  v_ultima    jsonb;
  v_siguiente jsonb;
begin
  for r in
    select e.id as enr, c.id as curso, c.nombre, coalesce(e.progreso, 0) as progreso
      from cem_enrollments e
      join cem_courses c on c.id = e.course_id
     where e.profile_id = auth.uid()
       and e.estado in ('activa', 'pendiente')
     order by e.ultimo_acceso desc nulls last
     limit 5
  loop
    -- Se vacían en cada vuelta a mano. `select into` sin filas deja el destino
    -- en nulo, sí, pero depender de eso hace que un cambio futuro arrastre en
    -- silencio el curso anterior al siguiente.
    v_ultima := null; v_siguiente := null;

    select jsonb_build_object(
             'leccion',   l.titulo,
             'modulo',    m.titulo,
             'minuto',    case when coalesce(lp.segundos_vistos, 0) >= 30
                               then (lp.segundos_vistos / 60) || ' min'
                               else null end,
             'terminada', coalesce(lp.completado, false),
             'enlace',    'estudiante/clase.html?clase=' || l.id)
      into v_ultima
      from cem_lesson_progress lp
      join cem_lessons l on l.id = lp.lesson_id
      join cem_modules m on m.id = l.module_id
     where lp.enrollment_id = r.enr
     order by lp.actualizado_en desc
     limit 1;

    select jsonb_build_object(
             'leccion', l.titulo,
             'modulo',  m.titulo,
             'dura',    case when l.duracion_min is not null
                             then l.duracion_min || ' min' else null end,
             'enlace',  'estudiante/clase.html?clase=' || l.id)
      into v_siguiente
      from cem_lessons l
      join cem_modules m on m.id = l.module_id
     where m.course_id = r.curso
       and l.estado = 'publicado'
       and not exists (
             select 1 from cem_lesson_progress lp
              where lp.enrollment_id = r.enr
                and lp.lesson_id = l.id
                and lp.completado)
     order by m.orden, l.orden
     limit 1;

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'programa',   r.nombre,
      'avance',     round(r.progreso) || '%',
      'ultima_vez', v_ultima,
      'siguiente',  v_siguiente));
  end loop;

  return v_out;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_escalar(p_conversacion uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_c        cem_bot_conversaciones;
  v_motivo   text := nullif(trim(coalesce(p_motivo, '')), '');
  v_de_quien text;
  v_dinero   boolean;
  v_repetido boolean;
  v_avisados int;
begin
  select * into v_c from cem_bot_conversaciones where id = p_conversacion;
  if v_c.id is null then
    raise exception 'Esa conversación no existe.';
  end if;

  if auth.uid() is not null
     and v_c.profile_id is distinct from auth.uid()
     and not cem_is_staff() then
    raise exception 'No es tu conversación.';
  end if;

  v_repetido := v_c.escalado_en is not null
            and v_c.escalado_en > now() - interval '6 hours';

  update cem_bot_conversaciones
     set escalado_en     = now(),
         escalado_motivo = coalesce(v_motivo, escalado_motivo)
   where id = p_conversacion;

  if v_repetido then
    return jsonb_build_object('avisados', 0, 'ya_estaba_avisado', true);
  end if;

  select nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), '')
    into v_de_quien
    from cem_profiles p where p.id = v_c.profile_id;
  v_de_quien := coalesce(v_de_quien, v_c.telefono, 'alguien sin identificar');

  v_dinero := coalesce(v_motivo, '') || ' ' || coalesce(v_c.titulo, '')
              ~* '(pag|cuota|factur|reembols|cobr|deuda|transferen|precio|descuent)';

  v_avisados := cem_avisar_equipo(
    'bot_escalado',
    'Cemi pide una persona para ' || v_de_quien,
    coalesce(v_motivo, 'Pidió hablar con alguien del equipo.')
      || case when v_c.canal = 'whatsapp' and v_c.telefono is not null
              then ' — escribe por WhatsApp desde ' || v_c.telefono else '' end,
    'admin/asistente.html?conversacion=' || p_conversacion::text,
    case when v_dinero
         then array['coordinador','admin','superadmin','cobranza']
         else array['coordinador','admin','superadmin'] end);

  return jsonb_build_object(
    'avisados', v_avisados,
    'ya_estaba_avisado', false,
    'de_quien', v_de_quien,
    'incluye_cobranza', v_dinero);
end $function$
;
comment on function public.cem_bot_escalar(p_conversacion uuid, p_motivo text) is 'Escala una conversación al equipo DE VERDAD: notifica y encola correo a coordinación y dirección (y a cobranza si es de dinero), sin repetir dentro de 6 horas. Devuelve a cuánta gente avisó para que el asistente no prometa de más.';

CREATE OR REPLACE FUNCTION public.cem_bot_escuchado_listar(p_dias integer DEFAULT 30, p_pendientes boolean DEFAULT true)
 RETURNS TABLE(id uuid, canal text, texto text, cuantos bigint, personas bigint, ultima timestamp with time zone, ficha_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (cem_es_admin() or cem_es_auditor() or cem_role() = 'coordinador') then
    raise exception 'Sólo el equipo puede ver lo que se pregunta.';
  end if;
  return query
  select (array_agg(e.id order by e.created_at desc))[1] as id,
         (array_agg(e.canal order by e.created_at desc))[1] as canal,
         -- Se enseña la más CORTA del grupo: suele ser la que va al grano y
         -- la que mejor se lee de un vistazo en una lista larga.
         (array_agg(e.texto order by length(e.texto)))[1] as texto,
         count(*) as cuantos,
         count(distinct e.quien_huella) as personas,
         max(e.created_at) as ultima,
         (array_agg(e.ficha_id order by e.created_at desc))[1] as ficha_id
    from cem_bot_escuchado e
   where e.created_at >= now() - make_interval(days => greatest(p_dias, 1))
     and not e.descartada
     and (not p_pendientes or e.ficha_id is null)
   group by cem_clave_pregunta(e.texto)
   order by count(*) desc, max(e.created_at) desc
   limit 200;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_escuchado_resolver(p_id uuid, p_ficha uuid DEFAULT NULL::uuid, p_descartar boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_clave text;
begin
  if not (cem_es_admin() or cem_role() = 'coordinador') then
    raise exception 'No tienes permiso para archivar preguntas.';
  end if;
  select cem_clave_pregunta(texto) into v_clave from cem_bot_escuchado where id = p_id;
  if v_clave is null then raise exception 'Esa pregunta ya no existe.'; end if;
  -- Se resuelve el grupo entero, no una sola: la pantalla enseña grupos, y
  -- archivar una y que las otras cuatro sigan ahí sería incomprensible.
  update cem_bot_escuchado
     set ficha_id = p_ficha, descartada = p_descartar
   where cem_clave_pregunta(texto) = v_clave;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_ficha_apagar(p_id uuid, p_activo boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (cem_es_admin() or cem_role() = 'coordinador') then
    raise exception 'No tienes permiso para cambiar lo que sabe el asistente.';
  end if;
  update cem_bot_conocimiento set activo = p_activo, actualizado_en = now() where id = p_id;
  if not found then raise exception 'Esa ficha ya no existe.'; end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_ficha_guardar(p_id uuid, p_ambito text, p_titulo text, p_contenido text, p_etiquetas text[] DEFAULT '{}'::text[], p_activo boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if not (cem_es_admin() or cem_role() = 'coordinador') then
    raise exception 'No tienes permiso para enseñarle cosas al asistente.';
  end if;
  if coalesce(trim(p_titulo), '') = '' or coalesce(trim(p_contenido), '') = '' then
    raise exception 'La ficha necesita un título y un contenido.';
  end if;
  if p_ambito not in ('estudiante', 'equipo', 'ambos') then
    raise exception 'El ámbito tiene que ser estudiante, equipo o ambos.';
  end if;

  if p_id is null then
    insert into cem_bot_conocimiento
      (ambito, titulo, contenido, etiquetas, origen, activo, creado_por)
    values (p_ambito, trim(p_titulo), trim(p_contenido),
            coalesce(p_etiquetas, '{}'), 'manual', p_activo, auth.uid())
    returning id into v_id;
  else
    -- Una ficha que generó la plataforma pasa a ser manual en cuanto alguien la
    -- edita. Si no, el siguiente «actualizar» le pisaría el texto escrito a
    -- mano y nadie entendería por qué se perdió.
    update cem_bot_conocimiento
       set ambito = p_ambito, titulo = trim(p_titulo), contenido = trim(p_contenido),
           etiquetas = coalesce(p_etiquetas, '{}'), activo = p_activo,
           origen = 'manual', actualizado_en = now()
     where id = p_id
     returning id into v_id;
    if v_id is null then
      raise exception 'Esa ficha ya no existe.';
    end if;
  end if;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_fichas(p_ambito text DEFAULT NULL::text)
 RETURNS TABLE(id uuid, ambito text, titulo text, contenido text, etiquetas text[], origen text, clave text, activo boolean, actualizado_en timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (cem_es_admin() or cem_es_auditor() or cem_role() = 'coordinador') then
    raise exception 'Sólo el equipo puede ver lo que sabe el asistente.';
  end if;
  return query
  select k.id, k.ambito, k.titulo, k.contenido, k.etiquetas, k.origen, k.clave,
         k.activo, k.actualizado_en
    from cem_bot_conocimiento k
   where (p_ambito is null or k.ambito = p_ambito or k.ambito = 'ambos')
   order by k.activo desc, k.origen, k.titulo
   limit 500;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_guardar(p_conversacion uuid, p_pregunta text, p_respuesta text, p_modelo text DEFAULT NULL::text, p_tokens_in integer DEFAULT NULL::integer, p_tokens_out integer DEFAULT NULL::integer, p_ms integer DEFAULT NULL::integer, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_c cem_bot_conversaciones;
begin
  select * into v_c from cem_bot_conversaciones where id = p_conversacion;
  if v_c.id is null then raise exception 'Esa conversación no existe.'; end if;
  if v_c.profile_id <> auth.uid() and not cem_is_staff() then
    raise exception 'No es tu conversación.';
  end if;

  if coalesce(trim(p_pregunta),'') <> '' then
    insert into cem_bot_mensajes (conversacion_id, quien, texto)
    values (p_conversacion, 'persona', p_pregunta);
  end if;
  if coalesce(trim(p_respuesta),'') <> '' or p_error is not null then
    insert into cem_bot_mensajes (conversacion_id, quien, texto, modelo,
                                  tokens_entrada, tokens_salida, ms, error)
    values (p_conversacion, 'asistente', coalesce(p_respuesta,''), p_modelo,
            p_tokens_in, p_tokens_out, p_ms, p_error);
  end if;

  update cem_bot_conversaciones
     set ultimo_en = now(),
         titulo = coalesce(titulo, left(nullif(trim(p_pregunta),''), 80))
   where id = p_conversacion;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_guardar_whatsapp(p_conversacion uuid, p_pregunta text, p_respuesta text, p_modelo text DEFAULT NULL::text, p_tokens_in integer DEFAULT NULL::integer, p_tokens_out integer DEFAULT NULL::integer, p_ms integer DEFAULT NULL::integer, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into cem_bot_mensajes (conversacion_id, quien, texto)
  values (p_conversacion, 'persona', p_pregunta);
  insert into cem_bot_mensajes
    (conversacion_id, quien, texto, modelo, tokens_entrada, tokens_salida, ms, error)
  values (p_conversacion, 'asistente', p_respuesta, p_modelo,
          p_tokens_in, p_tokens_out, p_ms, p_error);
  update cem_bot_conversaciones set ultimo_en = now() where id = p_conversacion;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_historial(p_conversacion uuid, p_tope integer DEFAULT 40)
 RETURNS TABLE(quien text, texto text, cuando timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.quien, m.texto, m.created_at
    from cem_bot_mensajes m
    join cem_bot_conversaciones c on c.id = m.conversacion_id
   where m.conversacion_id = p_conversacion
     and (c.profile_id = auth.uid() or cem_is_staff() or cem_puede_cobranza())
   order by m.created_at
   limit greatest(1, least(coalesce(p_tope, 40), 200));
$function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_historial_whatsapp(p_conversacion uuid, p_tope integer DEFAULT 24)
 RETURNS TABLE(quien text, texto text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.quien, m.texto from (
    select m.quien, m.texto, m.created_at
      from cem_bot_mensajes m
     where m.conversacion_id = p_conversacion
     order by m.created_at desc
     limit greatest(coalesce(p_tope, 24), 1)
  ) m order by m.created_at asc
$function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_lo_que_hizo(p_dias integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'evento',   a.id,
           'que',      replace(a.accion, 'asistente.', ''),
           'entidad',  a.entidad,
           'sobre',    a.entidad_id,
           'riesgo',   a.riesgo,
           'quien',    coalesce(a.actor_email, 'sin identificar'),
           'cuando',   to_char(a.created_at at time zone 'America/Caracas', 'DD/MM/YYYY HH24:MI'),
           'detalle',  a.detalle,
           'deshecho', exists (
             select 1 from cem_audit_events d
              where d.accion = 'asistente.deshecho'
                and d.detalle->>'evento_original' = a.id::text))
         order by a.created_at desc), '[]'::jsonb)
    from cem_audit_events a
   where a.accion like 'asistente.%'
     and a.accion <> 'asistente.deshecho'
     and a.created_at > now() - (greatest(1, least(90, coalesce(p_dias, 7))) || ' days')::interval;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_matricular(p_quien text, p_programa text, p_cuotas integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_pid    uuid;
  v_nombre text;
  v_c      cem_courses;
  v_n      integer;
  v_enr    uuid;
  v_cuotas integer;
  v_monto  numeric;
  i        integer;
begin
  select count(*) into v_n from cem_profiles pr
   where (coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,''))
         ilike '%' || coalesce(p_quien, '') || '%' and pr.activo;
  if v_n = 0 then
    return jsonb_build_object('hecho', false, 'porque', 'persona_no_encontrada');
  elsif v_n > 1 then
    return jsonb_build_object('hecho', false, 'porque', 'varias_personas',
      'candidatos', (select jsonb_agg(trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,'')))
                       from cem_profiles pr
                      where (coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,''))
                            ilike '%' || coalesce(p_quien, '') || '%' and pr.activo));
  end if;

  select pr.id, trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,''))
    into v_pid, v_nombre
    from cem_profiles pr
   where (coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,''))
         ilike '%' || coalesce(p_quien, '') || '%' and pr.activo;

  select count(*) into v_n from cem_courses c
   where c.estado = 'publicado' and c.nombre ilike '%' || coalesce(p_programa, '') || '%';
  if v_n = 0 then
    return jsonb_build_object('hecho', false, 'porque', 'programa_no_encontrado');
  elsif v_n > 1 then
    return jsonb_build_object('hecho', false, 'porque', 'varios_programas',
      'candidatos', (select jsonb_agg(c.nombre) from cem_courses c
                      where c.estado = 'publicado'
                        and c.nombre ilike '%' || coalesce(p_programa, '') || '%'));
  end if;

  select * into v_c from cem_courses c
   where c.estado = 'publicado' and c.nombre ilike '%' || coalesce(p_programa, '') || '%';

  if exists (select 1 from cem_enrollments e
              where e.profile_id = v_pid and e.course_id = v_c.id
                and e.estado <> 'cancelada') then
    return jsonb_build_object('hecho', false, 'porque', 'ya_estaba_inscrito',
                              'quien', v_nombre, 'programa', v_c.nombre);
  end if;

  insert into cem_enrollments (profile_id, course_id, estado, precio_lista,
                               precio_final, moneda, fuente, vendedor_id)
  values (v_pid, v_c.id, 'pendiente', v_c.precio, v_c.precio,
          coalesce(v_c.moneda, 'USD'), 'asistente', auth.uid())
  returning id into v_enr;

  -- El plan de cuotas, si el programa las admite. Se reparte parejo y el
  -- último absorbe el redondeo, para que la suma dé exactamente el precio y no
  -- queden céntimos huérfanos que luego nadie sabe cobrar.
  v_cuotas := coalesce(p_cuotas,
                       case when v_c.cuotas_habilitadas then v_c.cuotas_cantidad else null end);
  if v_cuotas is not null and v_cuotas > 1 and coalesce(v_c.precio, 0) > 0 then
    v_monto := round(v_c.precio / v_cuotas, 2);
    for i in 1..v_cuotas loop
      insert into cem_installments (enrollment_id, numero, monto, moneda,
                                    fecha_vencimiento, estado, saldo)
      values (v_enr, i,
              case when i < v_cuotas then v_monto
                   else v_c.precio - (v_monto * (v_cuotas - 1)) end,
              coalesce(v_c.moneda, 'USD'),
              (current_date + ((i - 1) * interval '1 month'))::date,
              'pendiente',
              case when i < v_cuotas then v_monto
                   else v_c.precio - (v_monto * (v_cuotas - 1)) end);
    end loop;
  end if;

  return jsonb_build_object(
    'hecho', true, 'quien', v_nombre, 'programa', v_c.nombre,
    'inscripcion', v_enr, 'estado', 'pendiente de pago',
    'cuotas', coalesce(v_cuotas, 0),
    'donde', 'admin/inscripciones.html');
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_mi_cola_de_correccion()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(x order by (x->>'espera_dias')::int desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'programa',    c.nombre,
             'evaluacion',  a.nombre,
             'quien',       trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,'')),
             'entregado',   to_char(s.entregado_en at time zone 'America/Caracas', 'DD/MM/YYYY'),
             'espera_dias', greatest(0, (current_date - s.entregado_en::date)),
             'tarde',       coalesce(s.tarde, false),
             'enlace',      'admin/calificar.html?entrega=' || s.id) as x
      from cem_submissions s
      join cem_assessments a on a.id = s.assessment_id
      join cem_courses c     on c.id = a.course_id
      join cem_enrollments e on e.id = s.enrollment_id
      join cem_profiles pr   on pr.id = e.profile_id
     where s.estado = 'entregada'
       and (cem_docente_de_curso(c.id) or cem_is_staff())
     limit 40
  ) t;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_mis_certificados()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'titulo',    ce.titulo,
           'codigo',    ce.codigo,
           'emitido',   to_char(ce.emitido_en at time zone 'America/Caracas', 'DD/MM/YYYY'),
           'descarga',  'estudiante/certificados.html',
           'verificar', 'verificar.html?codigo=' || ce.codigo)
         order by ce.emitido_en desc), '[]'::jsonb)
    from cem_certificates ce
   where ce.profile_id = auth.uid()
     and ce.anulado_en is null
     and ce.estado = 'emitido';
$function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_mis_numeros()
 RETURNS TABLE(telefono text, ambito text, activo boolean, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select n.telefono, n.ambito, n.activo, n.created_at
    from cem_bot_numeros n
   where n.profile_id = auth.uid()
   order by n.created_at desc
$function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_olvidar_mi_numero(p_telefono text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from cem_bot_numeros
   where telefono = cem_tel_normal(p_telefono) and profile_id = auth.uid();
  if not found then raise exception 'Ese número no está registrado a tu nombre.'; end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_olvidar_numero(p_telefono text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tel text := cem_tel_normal(p_telefono); v_dueno uuid; v_rol cem_role;
begin
  select n.profile_id into v_dueno from cem_bot_numeros n where n.telefono = v_tel;
  if v_dueno is null then raise exception 'Ese número no está registrado.'; end if;

  select rol into v_rol from cem_profiles where id = v_dueno;
  -- El tuyo siempre; el de otro, con la misma frontera que para ponerlo.
  if v_dueno <> auth.uid() and not cem_puede_invitar_a(v_rol) then
    raise exception 'No puedes quitar el número de alguien con el rol %.', v_rol;
  end if;

  delete from cem_bot_numeros where telefono = v_tel;
  insert into cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'asistente_numero_quitado', 'cem_bot_numeros', v_dueno, 'medio',
          jsonb_build_object('telefono_ultimos', right(v_tel, 4)));
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_panel()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r jsonb := '{}'::jsonb; v numeric;
begin
  if not (cem_es_admin() or cem_es_auditor() or cem_role() = 'coordinador') then
    raise exception 'Sólo el equipo puede ver el panel del asistente.';
  end if;

  begin
    select count(*) into v from cem_bot_mensajes
     where created_at >= now() - interval '1 day';
    r := r || jsonb_build_object('mensajes_hoy', v);
  exception when others then null; end;

  begin
    select count(distinct conversacion_id) into v from cem_bot_mensajes
     where created_at >= now() - interval '7 days';
    r := r || jsonb_build_object('conversaciones_semana', v);
  exception when others then null; end;

  begin
    select count(*) into v from cem_bot_conversaciones where escalado_en is not null;
    r := r || jsonb_build_object('escaladas', v);
  exception when others then null; end;

  begin
    select count(*) into v from cem_bot_mensajes
     where error is not null and created_at >= now() - interval '7 days';
    r := r || jsonb_build_object('fallos_semana', v);
  exception when others then null; end;

  begin
    -- La mediana y no la media: una sola respuesta de 30 segundos por un
    -- reintento sube la media y hace creer que el asistente va lento cuando
    -- las otras noventa y nueve fueron en dos.
    select percentile_cont(0.5) within group (order by ms) into v
      from cem_bot_mensajes
     where ms is not null and created_at >= now() - interval '7 days';
    r := r || jsonb_build_object('mediana_ms', round(coalesce(v, 0)));
  exception when others then null; end;

  begin
    select count(*) into v from cem_bot_conocimiento where activo;
    r := r || jsonb_build_object('fichas', v);
  exception when others then null; end;

  begin
    select count(*) into v from cem_bot_conocimiento where activo and origen = 'plataforma';
    r := r || jsonb_build_object('fichas_automaticas', v);
  exception when others then null; end;

  begin
    select max(actualizado_en) into v from (
      select extract(epoch from max(actualizado_en)) as actualizado_en
        from cem_bot_conocimiento where origen = 'plataforma') t;
    r := r || jsonb_build_object('ultimo_refresco',
      case when v is null then null else to_char(to_timestamp(v) at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS"Z"') end);
  exception when others then null; end;

  return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_pasar_asistencia(p_clase text, p_ausentes text[] DEFAULT '{}'::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_c       cem_classes;
  v_puestos int := 0;
  v_aus     int := 0;
  v_sin_ver text[] := '{}';
  v_nombre  text;
  r         record;
  v_falta   boolean;
begin
  select * into v_c from cem_classes cl
   where (cl.titulo ilike '%' || coalesce(p_clase, '') || '%'
          or cl.id::text = p_clase)
     and cl.fecha <= current_date
   order by cl.fecha desc
   limit 1;

  if v_c.id is null then
    return jsonb_build_object('hecho', false, 'porque', 'clase_no_encontrada');
  end if;

  -- Los nombres que dictó y no aparecen en el grupo se devuelven sin escribir
  -- nada de ellos. Un nombre mal oído no puede marcarle falta a quien sí vino.
  foreach v_nombre in array coalesce(p_ausentes, '{}') loop
    if not exists (
      select 1 from cem_enrollments e
        join cem_profiles pr on pr.id = e.profile_id
       where e.cohort_id = v_c.cohort_id
         and (coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,''))
             ilike '%' || v_nombre || '%')
    then
      v_sin_ver := v_sin_ver || v_nombre;
    end if;
  end loop;

  for r in
    select e.id as enr,
           trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,'')) as quien
      from cem_enrollments e
      join cem_profiles pr on pr.id = e.profile_id
     where e.cohort_id = v_c.cohort_id and e.estado = 'activa'
  loop
    v_falta := exists (
      select 1 from unnest(coalesce(p_ausentes, '{}')) n
       where r.quien ilike '%' || n || '%');

    insert into cem_attendance (class_id, enrollment_id, presente, registrado_en)
    values (v_c.id, r.enr, not v_falta, now())
    on conflict (class_id, enrollment_id)
      do update set presente = excluded.presente, registrado_en = now();

    v_puestos := v_puestos + 1;
    if v_falta then v_aus := v_aus + 1; end if;
  end loop;

  return jsonb_build_object(
    'hecho', true, 'clase', v_c.titulo,
    'fecha', to_char(v_c.fecha, 'DD/MM/YYYY'),
    'registrados', v_puestos, 'ausentes', v_aus,
    'no_reconocidos', to_jsonb(v_sin_ver));
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_por_que_bajo(p_dias integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_d     integer := greatest(7, least(365, coalesce(p_dias, 30)));
  v_desde date := current_date - v_d + 1;
  v_antes date := current_date - (v_d * 2) + 1;

  v_lead_h bigint := 0; v_lead_a bigint := 0;
  v_cont_h bigint := 0; v_cont_a bigint := 0;
  v_ins_h  bigint; v_ins_a  bigint;
  v_pag_h  bigint; v_pag_a  bigint;
  v_ciego  boolean := false;
begin
  begin
    select count(*) into v_lead_h from cem_leads_listar(null)
     where created_at::date between v_desde and current_date;
    select count(*) into v_lead_a from cem_leads_listar(null)
     where created_at::date between v_antes and v_desde - 1;
    select count(*) into v_cont_h from cem_leads_listar(null)
     where created_at::date between v_desde and current_date and estado <> 'nuevo';
    select count(*) into v_cont_a from cem_leads_listar(null)
     where created_at::date between v_antes and v_desde - 1 and estado <> 'nuevo';
  exception when others then
    -- Que no se pueden ver los contactos se DICE. Un embudo al que le faltan
    -- los dos primeros peldaños y no lo avisa parece un embudo que empieza en
    -- la inscripción, y lleva a la conclusión contraria.
    v_ciego := true;
  end;

  select count(*) into v_ins_h from cem_enrollments where created_at::date between v_desde and current_date;
  select count(*) into v_ins_a from cem_enrollments where created_at::date between v_antes and v_desde - 1;
  select count(*) into v_pag_h from cem_enrollments
   where created_at::date between v_desde and current_date and estado = 'activa';
  select count(*) into v_pag_a from cem_enrollments
   where created_at::date between v_antes and v_desde - 1 and estado = 'activa';

  return jsonb_build_object(
    'periodo',  to_char(v_desde, 'DD/MM') || ' al ' || to_char(current_date, 'DD/MM/YYYY'),
    'anterior', to_char(v_antes, 'DD/MM') || ' al ' || to_char(v_desde - 1, 'DD/MM/YYYY'),
    'aviso', case
      when v_ciego then 'Tu cuenta no ve los contactos, asi que faltan los dos primeros pasos del embudo. Dilo.'
      when v_lead_a + v_lead_h < 20
        then 'Son cifras pequenas: un porcentaje aqui puede ser una persona. Mira los numeros, no el porcentaje.'
      else null end,
    'pasos', case when v_ciego then jsonb_build_array(
        jsonb_build_object('paso', 'Se inscribieron', 'ahora', v_ins_h, 'antes', v_ins_a),
        jsonb_build_object('paso', 'Pagaron y quedaron activos', 'ahora', v_pag_h, 'antes', v_pag_a))
      else jsonb_build_array(
        jsonb_build_object('paso', 'Llegaron contactos', 'ahora', v_lead_h, 'antes', v_lead_a),
        jsonb_build_object('paso', 'Se les atendio',     'ahora', v_cont_h, 'antes', v_cont_a),
        jsonb_build_object('paso', 'Se inscribieron',    'ahora', v_ins_h,  'antes', v_ins_a),
        jsonb_build_object('paso', 'Pagaron y quedaron activos', 'ahora', v_pag_h, 'antes', v_pag_a))
      end,
    'donde_mirar', 'admin/metricas-estudiantes.html');
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_preparar_certificados(p_programa text DEFAULT NULL::text, p_conversacion uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_gente  jsonb := '[]'::jsonb;
  v_ids    jsonb := '[]'::jsonb;
  v_id     uuid;
  r        record;
  v_req    jsonb;
  v_cuenta integer;
begin
  for r in
    select e.id, trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,'')) as quien,
           c.nombre as programa
      from cem_enrollments e
      join cem_courses c   on c.id = e.course_id
      join cem_profiles pr on pr.id = e.profile_id
     where e.estado in ('activa','finalizada')
       and (p_programa is null or c.nombre ilike '%' || p_programa || '%')
       and not exists (select 1 from cem_certificates ce
                        where ce.enrollment_id = e.id and ce.anulado_en is null)
     limit 100
  loop
    v_req := cem_requisitos_certificado(r.id);
    if (v_req->>'listo')::boolean then
      v_gente := v_gente || jsonb_build_array(
        jsonb_build_object('quien', r.quien, 'programa', r.programa));
      v_ids := v_ids || jsonb_build_array(r.id);
    end if;
  end loop;

  v_cuenta := jsonb_array_length(v_ids);
  if v_cuenta = 0 then
    return jsonb_build_object('hecho', false, 'porque', 'ninguno_cumple');
  end if;

  insert into cem_bot_borradores (tipo, creado_por, conversacion, resumen, a_quien, ids)
  values ('certificados_lote', auth.uid(), p_conversacion,
          format('Emitir %s %s', v_cuenta,
                 case when v_cuenta = 1 then 'certificado' else 'certificados' end),
          v_gente, v_ids)
  returning id into v_id;

  return jsonb_build_object(
    'hecho', true, 'borrador', v_id, 'cuantos', v_cuenta, 'a_quien', v_gente,
    'falta', 'que una persona lo confirme en Asistente, pestaña Por confirmar');
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_que_falta_para_cerrar()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v_contactos bigint := 0;
begin
  begin
    select count(*) into v_contactos from cem_leads_listar('nuevo');
  exception when others then v_contactos := 0;
  end;

  return coalesce((
    select jsonb_agg(x order by (x->>'cuantos')::int desc)
    from (
      select jsonb_build_object(
               'que', 'Pagos registrados sin verificar',
               'cuantos', (select count(*) from cem_payments where estado = 'registrado'),
               'donde', 'admin/pagos-verificar.html') as x
      union all
      select jsonb_build_object(
               'que', 'Entregas sin calificar',
               'cuantos', (select count(*) from cem_submissions where estado = 'entregada'),
               'donde', 'admin/calificar.html')
      union all
      select jsonb_build_object(
               'que', 'Cuotas vencidas sin cobrar',
               'cuantos', (select count(*) from cem_installments
                            where estado = 'vencida' and coalesce(saldo, monto) > 0),
               'donde', 'admin/carteras.html')
      union all
      select jsonb_build_object(
               'que', 'Inscripciones pendientes de pago',
               'cuantos', (select count(*) from cem_enrollments where estado = 'pendiente'),
               'donde', 'admin/inscripciones.html')
      union all
      select jsonb_build_object(
               'que', 'Contactos sin atender',
               'cuantos', v_contactos,
               'donde', 'admin/leads.html')
    ) t
    where (x->>'cuantos')::int > 0), '[]'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_quien_esta_en_riesgo(p_cuantos integer DEFAULT 15)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(x order by (x->>'senales')::int desc,
                                       (x->>'dias_sin_entrar')::int desc nulls last), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'quien',    trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,'')),
             'telefono', pr.telefono,
             'programa', c.nombre,
             'avance',   round(coalesce(e.progreso, 0)) || '%',
             'dias_sin_entrar', case when e.ultimo_acceso is null then null
                                     else (current_date - e.ultimo_acceso::date) end,
             'cuotas_vencidas', v.vencidas,
             'sin_entregar',    v.sin_entregar,
             'senales', (case when e.ultimo_acceso is null
                                or (current_date - e.ultimo_acceso::date) >= 14 then 1 else 0 end
                       + case when v.vencidas > 0     then 1 else 0 end
                       + case when v.sin_entregar > 0 then 1 else 0 end),
             'enlace',   'admin/estudiante.html?id=' || pr.id) as x
      from cem_enrollments e
      join cem_courses c   on c.id = e.course_id
      join cem_profiles pr on pr.id = e.profile_id
      cross join lateral (
        select
          (select count(*) from cem_installments i
            where i.enrollment_id = e.id and i.estado = 'vencida'
              and coalesce(i.saldo, i.monto) > 0) as vencidas,
          (select count(*) from cem_assessments a
            where a.course_id = e.course_id and a.estado = 'publicado'
              and a.cierra_en < now()
              and not exists (select 1 from cem_submissions s
                               where s.assessment_id = a.id and s.enrollment_id = e.id
                                 and s.estado in ('entregada','calificada','tarde'))) as sin_entregar
      ) v
     where e.estado = 'activa'
       and (case when e.ultimo_acceso is null
                   or (current_date - e.ultimo_acceso::date) >= 14 then 1 else 0 end
          + case when v.vencidas > 0     then 1 else 0 end
          + case when v.sin_entregar > 0 then 1 else 0 end) >= 1
     limit greatest(1, least(50, coalesce(p_cuantos, 15)))
  ) t;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_quien_habla()
 RETURNS TABLE(profile_id uuid, nombre text, email text, rol text, telefono text, ambito text, activo boolean, registrado_en timestamp with time zone, lo_registro text, conversaciones bigint, ultimo_en timestamp with time zone, puedo_gestionarlo boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (cem_es_admin() or cem_es_auditor() or cem_role() = 'coordinador') then
    raise exception 'Sólo el equipo puede ver quién habla con el asistente.';
  end if;
  return query
  select p.id,
         trim(coalesce(p.nombre,'') || ' ' || coalesce(p.apellido,'')) as nombre,
         p.email, p.rol::text,
         n.telefono, n.ambito, coalesce(n.activo, false),
         n.created_at,
         trim(coalesce(q.nombre,'') || ' ' || coalesce(q.apellido,'')) as lo_registro,
         (select count(*) from cem_bot_conversaciones c where c.profile_id = p.id),
         (select max(c.ultimo_en) from cem_bot_conversaciones c where c.profile_id = p.id),
         (p.id = auth.uid() or cem_puede_invitar_a(p.rol))
    from cem_profiles p
    left join cem_bot_numeros n on n.profile_id = p.id
    left join cem_profiles q on q.id = n.creado_por
   where p.activo
     and p.rol <> 'estudiante'      -- el equipo; los alumnos son otra lista
   order by (n.telefono is null), p.rol, nombre;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_quien_no_ha_entregado(p_curso text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(x order by x->>'evaluacion', x->>'quien'), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'programa',   c.nombre,
             'evaluacion', a.nombre,
             'cierra',     to_char(a.cierra_en at time zone 'America/Caracas', 'DD/MM/YYYY'),
             'quien',      trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,'')),
             'email',      pr.email) as x
      from cem_assessments a
      join cem_courses c     on c.id = a.course_id
      join cem_enrollments e on e.course_id = c.id and e.estado = 'activa'
      join cem_profiles pr   on pr.id = e.profile_id
     where a.estado = 'publicado'
       -- El acotado a SUS cursos. Ver la nota de arriba: esto no lo hace RLS.
       and (cem_docente_de_curso(c.id) or cem_is_staff())
       and (p_curso is null or c.nombre ilike '%' || p_curso || '%')
       and not exists (
             select 1 from cem_submissions s
              where s.assessment_id = a.id
                and s.enrollment_id = e.id
                and s.estado in ('entregada','calificada','tarde'))
     limit 60
  ) t;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_redactar_recordatorio_entrega(p_evaluacion text, p_conversacion uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_a      cem_assessments;
  v_curso  text;
  v_gente  jsonb := '[]'::jsonb;
  v_ids    jsonb := '[]'::jsonb;
  v_cuerpo text;
  v_id     uuid;
  v_cuenta integer;
begin
  select a.* into v_a
    from cem_assessments a join cem_courses c on c.id = a.course_id
   where a.estado = 'publicado'
     and a.nombre ilike '%' || coalesce(p_evaluacion, '') || '%'
     and (cem_docente_de_curso(c.id) or cem_is_staff())
   order by a.cierra_en nulls last
   limit 1;

  if v_a.id is null then
    return jsonb_build_object('hecho', false, 'porque', 'no_encontrada');
  end if;

  select c.nombre into v_curso from cem_courses c where c.id = v_a.course_id;

  select coalesce(jsonb_agg(trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,''))), '[]'::jsonb),
         coalesce(jsonb_agg(pr.id), '[]'::jsonb)
    into v_gente, v_ids
    from cem_enrollments e
    join cem_profiles pr on pr.id = e.profile_id
   where e.course_id = v_a.course_id
     and e.estado = 'activa'
     and not exists (select 1 from cem_submissions s
                      where s.assessment_id = v_a.id and s.enrollment_id = e.id
                        and s.estado in ('entregada','calificada','tarde'));

  v_cuenta := jsonb_array_length(v_ids);
  if v_cuenta = 0 then
    return jsonb_build_object('hecho', false, 'porque', 'ya_entregaron_todos',
                              'evaluacion', v_a.nombre);
  end if;

  v_cuerpo := format('Te falta entregar %s de %s.%s Si tienes alguna duda, escríbenos.',
    v_a.nombre, v_curso,
    case when v_a.cierra_en is not null
         then ' Cierra el ' || to_char(v_a.cierra_en at time zone 'America/Caracas', 'DD/MM/YYYY') || '.'
         else '' end);

  insert into cem_bot_borradores (tipo, creado_por, conversacion, resumen, cuerpo, a_quien, ids)
  values ('recordatorio_entrega', auth.uid(), p_conversacion,
          format('Recordatorio de %s a %s %s', v_a.nombre, v_cuenta,
                 case when v_cuenta = 1 then 'persona' else 'personas' end),
          v_cuerpo, v_gente, v_ids)
  returning id into v_id;

  return jsonb_build_object(
    'hecho', true, 'borrador', v_id, 'cuantos', v_cuenta,
    'a_quien', v_gente, 'mensaje', v_cuerpo,
    'falta', 'que una persona lo confirme en Asistente, pestaña Por confirmar');
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_redactar_tanda_cuotas(p_dias integer DEFAULT 7, p_conversacion uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_d      integer := greatest(1, least(30, coalesce(p_dias, 7)));
  v_gente  jsonb := '[]'::jsonb;
  v_ids    jsonb := '[]'::jsonb;
  v_total  numeric := 0;
  v_id     uuid;
  v_cuenta integer;
begin
  select coalesce(jsonb_agg(jsonb_build_object(
           'quien', trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,'')),
           'debe',  to_char(coalesce(i.saldo, i.monto), 'FM999999990.00') || ' ' || i.moneda,
           'vence', to_char(i.fecha_vencimiento, 'DD/MM'))), '[]'::jsonb),
         coalesce(jsonb_agg(i.id), '[]'::jsonb),
         coalesce(sum(coalesce(i.saldo, i.monto)), 0)
    into v_gente, v_ids, v_total
    from cem_installments i
    join cem_enrollments e on e.id = i.enrollment_id
    join cem_profiles pr   on pr.id = e.profile_id
   where i.estado in ('pendiente','parcial')
     and i.fecha_vencimiento between current_date and current_date + v_d;

  v_cuenta := jsonb_array_length(v_ids);
  if v_cuenta = 0 then
    return jsonb_build_object('hecho', false, 'porque', 'ninguna_vence', 'dias', v_d);
  end if;

  insert into cem_bot_borradores (tipo, creado_por, conversacion, resumen, cuerpo, a_quien, ids)
  values ('recordatorio_cuota', auth.uid(), p_conversacion,
          format('Recordatorio a %s %s — %s por cobrar en %s',
                 v_cuenta,
                 case when v_cuenta = 1 then 'persona' else 'personas' end,
                 to_char(v_total, 'FM999999990.00'),
                 case when v_d = 1 then 'un día' else v_d || ' días' end),
          'Te recordamos que tu cuota vence pronto. Puedes reportar tu pago desde la plataforma.',
          v_gente, v_ids)
  returning id into v_id;

  return jsonb_build_object(
    'hecho', true, 'borrador', v_id, 'cuantos', v_cuenta,
    'suma', to_char(v_total, 'FM999999990.00'), 'a_quien', v_gente,
    'falta', 'que una persona lo confirme en Asistente, pestaña Por confirmar');
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_refrescar()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n int;
begin
  if not cem_is_staff() then
    raise exception 'Sólo el equipo puede actualizar lo que sabe el asistente.';
  end if;
  v_n := cem_bot_refrescar_ahora();
  insert into cem_audit_events(actor_id, accion, entidad, riesgo, detalle)
  values (auth.uid(), 'asistente_conocimiento_refrescado', 'cem_bot_conocimiento', 'bajo',
          jsonb_build_object('fichas', v_n));
  return jsonb_build_object('ok', true, 'fichas', v_n,
    'programas', (select count(*) from cem_courses where estado = 'publicado'),
    'cuando', to_char(now() at time zone 'America/Caracas', 'DD/MM/YYYY HH24:MI'));
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_refrescar_ahora()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n int := 0; v_texto text; r record;
begin
  for r in select c.* from cem_courses c where c.estado = 'publicado' loop
    v_texto := format('Programa: %s (%s).', r.nombre, coalesce(r.tipo, 'curso'));
    if r.descripcion_corta is not null then v_texto := v_texto || ' ' || r.descripcion_corta; end if;
    if r.horas is not null then v_texto := v_texto || format(' Dura %s horas.', r.horas); end if;
    if r.duracion_texto is not null then v_texto := v_texto || ' ' || r.duracion_texto || '.'; end if;
    if r.precio is not null then
      v_texto := v_texto || format(' Precio: %s %s.', r.precio, coalesce(r.moneda, 'EUR'));
    end if;
    if r.cuotas_habilitadas then
      v_texto := v_texto || format(' Se puede pagar en %s cuotas.', coalesce(r.cuotas_cantidad, 3));
    end if;
    v_texto := v_texto || coalesce((
      select ' Módulos: ' || string_agg(m.titulo
               || case when m.certifica then ' (con certificado propio)' else '' end,
               ', ' order by m.orden) || '.'
        from cem_modules m where m.course_id = r.id), '');

    insert into cem_bot_conocimiento (ambito, titulo, contenido, origen, clave, etiquetas)
    values ('ambos', 'Programa · ' || r.nombre, v_texto, 'plataforma',
            'programa:' || r.id::text, array['catalogo','precios'])
    on conflict (clave) do update
      set titulo = excluded.titulo, contenido = excluded.contenido,
          activo = true, actualizado_en = now()
      -- Si alguien reescribió la ficha a mano, su texto manda: por eso sólo se
      -- pisan las que siguen siendo de la plataforma.
      where cem_bot_conocimiento.origen = 'plataforma';
    v_n := v_n + 1;
  end loop;

  update cem_bot_conocimiento set activo = false, actualizado_en = now()
   where origen = 'plataforma' and clave like 'programa:%' and activo
     and not exists (select 1 from cem_courses c
                      where 'programa:' || c.id::text = cem_bot_conocimiento.clave
                        and c.estado = 'publicado');

  select string_agg(format('%s (%s)', m.metodo, m.moneda), ', ' order by m.orden, m.metodo)
    into v_texto from cem_metodos_pago m where m.activo;
  insert into cem_bot_conocimiento (ambito, titulo, contenido, origen, clave, etiquetas)
  values ('ambos', 'Formas de pago',
          case when coalesce(v_texto, '') = ''
            then 'Todavía no hay formas de pago configuradas. Si preguntan cómo pagar, '
                 || 'di que el equipo se lo confirma — NO inventes ninguna.'
            else 'Se puede pagar con: ' || v_texto
                 || '. Los datos concretos de cada método los da el equipo al momento de cobrar; '
                 || 'nunca los inventes ni los des tú.' end,
          'plataforma', 'pagos', array['pagos'])
  on conflict (clave) do update
    set contenido = excluded.contenido, activo = true, actualizado_en = now()
    where cem_bot_conocimiento.origen = 'plataforma';
  v_n := v_n + 1;

  select string_agg(format('%s: %s, empieza el %s',
           cu.nombre, co.nombre, to_char(co.fecha_inicio, 'DD/MM/YYYY')), E'\n' order by co.fecha_inicio)
    into v_texto
    from cem_cohorts co join cem_courses cu on cu.id = co.course_id
   where co.estado in ('inscripciones_abiertas','planificada') and co.fecha_inicio is not null;
  insert into cem_bot_conocimiento (ambito, titulo, contenido, origen, clave, etiquetas)
  values ('ambos', 'Grupos con inscripción abierta',
          coalesce(v_texto,
            'Ahora mismo no hay ningún grupo con fecha publicada. Si preguntan cuándo empieza, '
            || 'di que el equipo confirma la fecha — no des ninguna.'),
          'plataforma', 'cohortes', array['fechas'])
  on conflict (clave) do update
    set contenido = excluded.contenido, activo = true, actualizado_en = now()
    where cem_bot_conocimiento.origen = 'plataforma';
  v_n := v_n + 1;

  return v_n;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_registrar_mi_numero(p_telefono text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tel text; v_rol text;
begin
  if auth.uid() is null then
    raise exception 'Hay que entrar para registrar un número.';
  end if;
  v_tel := cem_tel_normal(p_telefono);
  if length(v_tel) < 10 then
    raise exception 'Ese número no parece completo. Escríbelo con el código de área.';
  end if;

  select rol::text into v_rol from cem_profiles where id = auth.uid();

  insert into cem_bot_numeros (telefono, profile_id, ambito, creado_por)
  values (v_tel, auth.uid(),
          case when cem_is_staff() then 'equipo' else 'estudiante' end, auth.uid())
  on conflict (telefono) do update
     set profile_id = excluded.profile_id, ambito = excluded.ambito,
         activo = true, creado_por = excluded.creado_por;
  return v_tel;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_registrar_numero(p_profile_id uuid, p_telefono text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_tel text; v_rol cem_role; v_ambito text; v_nombre text;
begin
  if auth.uid() is null then
    raise exception 'Hay que entrar para registrar un número.';
  end if;

  select rol, trim(coalesce(nombre,'') || ' ' || coalesce(apellido,''))
    into v_rol, v_nombre
    from cem_profiles where id = p_profile_id and activo;
  if v_rol is null then
    raise exception 'Esa persona no existe o está desactivada.';
  end if;

  -- El propio número siempre se puede. El de otro, sólo si podrías crear a
  -- alguien con ese rol.
  if p_profile_id <> auth.uid() and not cem_puede_invitar_a(v_rol) then
    raise exception 'No puedes registrar el número de alguien con el rol %.', v_rol;
  end if;

  v_tel := cem_tel_normal(p_telefono);
  if length(v_tel) < 10 then
    raise exception 'Ese número no parece completo. Escríbelo con el código de área.';
  end if;

  -- El ámbito sale del rol de la persona, no de quien registra: dar de alta el
  -- teléfono de un estudiante no lo convierte en equipo.
  v_ambito := case when v_rol in ('estudiante') then 'estudiante' else 'equipo' end;

  insert into cem_bot_numeros (telefono, profile_id, ambito, creado_por)
  values (v_tel, p_profile_id, v_ambito, auth.uid())
  on conflict (telefono) do update
     set profile_id = excluded.profile_id, ambito = excluded.ambito,
         activo = true, creado_por = excluded.creado_por;

  -- Queda anotado: es un permiso, y los permisos que nadie ve no se revisan.
  insert into cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'asistente_numero_registrado', 'cem_bot_numeros', p_profile_id,
          case when p_profile_id = auth.uid() then 'bajo' else 'alto' end,
          jsonb_build_object('para', v_nombre, 'rol', v_rol, 'ambito', v_ambito));
  return v_tel;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_registrar_pago(p_quien text, p_monto numeric, p_moneda text DEFAULT 'USD'::text, p_metodo text DEFAULT NULL::text, p_referencia text DEFAULT NULL::text, p_fecha date DEFAULT NULL::date, p_comprobante text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_cuantos int;
  v_enr     uuid;
  v_ins     uuid;
  v_nombre  text;
  v_dup     uuid;
  v_id      uuid;
begin
  if coalesce(p_monto, 0) <= 0 then
    return jsonb_build_object('hecho', false, 'porque', 'monto_invalido');
  end if;

  -- Igual que al inscribir: un nombre a medias no elige por la persona.
  -- Aplicar un pago a la cuenta equivocada crea dos problemas, no uno.
  select count(*) into v_cuantos
    from cem_profiles pr
   where (coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,''))
         ilike '%' || coalesce(p_quien, '') || '%'
     and exists (select 1 from cem_enrollments e where e.profile_id = pr.id);

  if v_cuantos = 0 then
    return jsonb_build_object('hecho', false, 'porque', 'no_encontrado');
  elsif v_cuantos > 1 then
    return jsonb_build_object('hecho', false, 'porque', 'varios',
      'candidatos', (select jsonb_agg(trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,'')))
                       from cem_profiles pr
                      where (coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,''))
                            ilike '%' || coalesce(p_quien, '') || '%'
                        and exists (select 1 from cem_enrollments e where e.profile_id = pr.id)));
  end if;

  select e.id, trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,''))
    into v_enr, v_nombre
    from cem_profiles pr
    join cem_enrollments e on e.profile_id = pr.id
   where (coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,''))
         ilike '%' || coalesce(p_quien, '') || '%'
   order by e.created_at desc
   limit 1;

  -- La misma referencia dos veces es el mismo comprobante mandado dos veces.
  -- Registrar el pago dos veces descuadra la cuenta de alguien.
  if nullif(trim(coalesce(p_referencia, '')), '') is not null then
    select p.id into v_dup from cem_payments p
     where p.referencia = trim(p_referencia)
       and p.monto = p_monto
     limit 1;
    if v_dup is not null then
      return jsonb_build_object('hecho', false, 'porque', 'ya_registrado',
                                'pago', v_dup, 'referencia', trim(p_referencia));
    end if;
  end if;

  -- Se aplica a la cuota más vieja que siga debiendo.
  select i.id into v_ins from cem_installments i
   where i.enrollment_id = v_enr
     and i.estado in ('pendiente','parcial','vencida')
   order by i.fecha_vencimiento
   limit 1;

  insert into cem_payments (enrollment_id, installment_id, monto, moneda, metodo,
                            referencia, comprobante_url, estado, registrado_por, fecha, nota)
  values (v_enr, v_ins, p_monto, coalesce(p_moneda, 'USD'), p_metodo,
          nullif(trim(coalesce(p_referencia, '')), ''), p_comprobante,
          'registrado', auth.uid(),
          coalesce(p_fecha, current_date), 'Leído de un comprobante por el asistente')
  returning id into v_id;

  return jsonb_build_object(
    'hecho', true, 'pago', v_id, 'de', v_nombre,
    'monto', to_char(p_monto, 'FM999999990.00'), 'moneda', coalesce(p_moneda, 'USD'),
    'estado', 'registrado, pendiente de verificar',
    'donde_se_verifica', 'admin/pagos-verificar.html');
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_resumen_semana(p_dias integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  v_d     integer := greatest(1, least(90, coalesce(p_dias, 7)));
  v_desde date := current_date - v_d + 1;
  v_antes date := current_date - (v_d * 2) + 1;
  v_nuevos bigint := 0;
  v_sin    bigint := 0;
begin
  begin
    select count(*) into v_nuevos from cem_leads_listar(null)
     where created_at::date between v_desde and current_date;
    select count(*) into v_sin from cem_leads_listar('nuevo');
  exception when others then v_nuevos := 0; v_sin := 0;
  end;

  return jsonb_build_object(
    'periodo', to_char(v_desde, 'DD/MM') || ' al ' || to_char(current_date, 'DD/MM/YYYY'),

    'cobrado', coalesce((
      select jsonb_agg(jsonb_build_object(
               'moneda', g.moneda,
               'suma',   to_char(g.suma, 'FM999999990.00'),
               'pagos',  g.pagos) order by g.moneda)
        from (select p.moneda, sum(p.monto) as suma, count(*) as pagos
                from cem_payments p
               where p.estado = 'confirmado'
                 and p.fecha::date between v_desde and current_date
               group by 1) g), '[]'::jsonb),

    'cobrado_periodo_anterior', coalesce((
      select jsonb_agg(jsonb_build_object(
               'moneda', g.moneda,
               'suma',   to_char(g.suma, 'FM999999990.00')) order by g.moneda)
        from (select p.moneda, sum(p.monto) as suma
                from cem_payments p
               where p.estado = 'confirmado'
                 and p.fecha::date between v_antes and v_desde - 1
               group by 1) g), '[]'::jsonb),

    'inscripciones_nuevas',
      (select count(*) from cem_enrollments where created_at::date between v_desde and current_date),
    'inscripciones_periodo_anterior',
      (select count(*) from cem_enrollments where created_at::date between v_antes and v_desde - 1),

    'contactos_nuevos', v_nuevos,

    'certificados_emitidos',
      (select count(*) from cem_certificates
        where anulado_en is null and emitido_en::date between v_desde and current_date),

    'atascado', jsonb_build_object(
      'pagos_sin_verificar', (select count(*) from cem_payments where estado = 'registrado'),
      'entregas_sin_calificar', (select count(*) from cem_submissions where estado = 'entregada'),
      'cuotas_vencidas', (select count(*) from cem_installments
                           where estado = 'vencida' and coalesce(saldo, monto) > 0),
      'contactos_sin_atender', v_sin,
      'conversaciones_escaladas', (select count(*) from cem_bot_conversaciones
                                    where escalado_en > now() - (v_d || ' days')::interval))
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_bot_resumen_semanal_enviar()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_r    jsonb;
  v_c    text := '';
  v_paso jsonb;
begin
  select cem_bot_resumen_semana(7) into v_r;

  for v_paso in select * from jsonb_array_elements(v_r->'cobrado') loop
    v_c := v_c || format('Cobrado: %s %s en %s pagos. ',
                         v_paso->>'suma', v_paso->>'moneda', v_paso->>'pagos');
  end loop;
  if v_c = '' then v_c := 'No entró ningún pago confirmado. '; end if;

  v_c := v_c || format('Inscripciones nuevas: %s (antes %s). Certificados: %s. ',
                       v_r->>'inscripciones_nuevas',
                       v_r->>'inscripciones_periodo_anterior',
                       v_r->>'certificados_emitidos');
  v_c := v_c || format('Atascado: %s pagos sin verificar, %s entregas sin calificar, '
                       || '%s cuotas vencidas, %s contactos sin atender.',
                       v_r->'atascado'->>'pagos_sin_verificar',
                       v_r->'atascado'->>'entregas_sin_calificar',
                       v_r->'atascado'->>'cuotas_vencidas',
                       v_r->'atascado'->>'contactos_sin_atender');

  return cem_avisar_equipo('resumen_semanal',
    'La semana en el CEM — ' || (v_r->>'periodo'),
    v_c, 'admin/reportes.html', array['admin','superadmin']);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_buscar(p_q text, p_tope integer DEFAULT 8)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with q as (select '%' || btrim(coalesce(p_q, '')) || '%' as t,
                    length(btrim(coalesce(p_q, ''))) as n)
  select case when (select n from q) < 2 or not cem_is_staff() then '[]'::jsonb else
    coalesce((
      select jsonb_agg(x) from (
        (select jsonb_build_object(
          'tipo', coalesce(p.rol::text, 'persona'),
          'id', p.id,
          'titulo', nullif(trim(coalesce(p.nombre,'') || ' ' || coalesce(p.apellido,'')), ''),
          'detalle', coalesce(p.email, ''),
          'url', case when p.rol::text = 'estudiante'
                      then 'estudiante.html?id=' || p.id::text
                      else 'usuarios.html?q=' || replace(coalesce(p.email, ''), '+', '%2B') end) as x
          from cem_profiles p
         where (coalesce(p.nombre,'') || ' ' || coalesce(p.apellido,'') || ' '
                || coalesce(p.email,'') || ' ' || coalesce(p.documento,'')) ilike (select t from q)
         order by p.nombre
         limit p_tope)

        union all

        (select jsonb_build_object(
          'tipo', 'curso', 'id', c.id, 'titulo', c.nombre,
          'detalle', coalesce(c.modalidad::text, ''),
          'url', 'contenido.html?curso=' || c.id::text)
          from cem_courses c
         where c.nombre ilike (select t from q)
         order by c.nombre
         limit p_tope)

        union all

        (select jsonb_build_object(
          'tipo', 'cohorte', 'id', co.id,
          'titulo', co.nombre,
          'detalle', coalesce(cur.nombre, '') || coalesce(' · ' || co.codigo, ''),
          'url', 'cohortes.html?q=' || replace(coalesce(co.codigo, co.nombre), ' ', '%20'))
          from cem_cohorts co
          left join cem_courses cur on cur.id = co.course_id
         where (coalesce(co.nombre,'') || ' ' || coalesce(co.codigo,'')) ilike (select t from q)
         order by co.nombre
         limit p_tope)
      ) t), '[]'::jsonb) end;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_can_read_all()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from cem_profiles
                  where id = auth.uid() and activo
                    and rol in ('profesor','coordinador','cobranza','admin','superadmin','auditor'));
$function$
;
comment on function public.cem_can_read_all() is 'Quién puede leer todo. La ejecuta también anon: aparece en políticas de tablas con filas públicas, y sin el permiso la consulta falla entera aunque la fila fuera pública. Con sesión ausente devuelve false.';

CREATE OR REPLACE FUNCTION public.cem_cancelar_inscripcion(p_enrollment_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_e public.cem_enrollments;
  v_curso text;
  v_pagado numeric;
begin
  select * into v_e from public.cem_enrollments where id = p_enrollment_id;
  if v_e.id is null then raise exception 'Esa inscripción no existe.'; end if;

  if v_e.profile_id <> auth.uid() and not cem_is_staff() then
    raise exception 'Sólo puedes cancelar tus propias inscripciones.';
  end if;

  -- Con dinero de por medio esto ya no es cancelar: es devolver, y eso lo
  -- decide quien cobra, con su nota y su asiento.
  select coalesce(sum(coalesce(monto_base, monto)), 0) into v_pagado
    from public.cem_payments
   where enrollment_id = v_e.id and estado = 'confirmado';
  if v_pagado > 0 then
    raise exception 'Esta inscripción ya tiene pagos confirmados. Pide la anulación a administración.';
  end if;

  if v_e.estado = 'finalizada' then
    raise exception 'Un programa terminado no se cancela.';
  end if;
  if v_e.estado = 'cancelada' then
    return jsonb_build_object('ok', true, 'yaEstaba', true);
  end if;

  select nombre into v_curso from public.cem_courses where id = v_e.course_id;

  -- Las cuotas de un curso que nadie va a hacer no son deuda: se van con él.
  delete from public.cem_installments where enrollment_id = v_e.id and estado <> 'pagada';

  update public.cem_enrollments set estado = 'cancelada' where id = v_e.id;

  insert into public.cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'inscripcion_cancelada', 'cem_enrollments', v_e.id, 'medio',
          jsonb_build_object('curso', v_curso, 'estado_previo', v_e.estado::text,
                             'motivo', nullif(trim(coalesce(p_motivo, '')), ''),
                             'porElEstudiante', v_e.profile_id = auth.uid()));

  return jsonb_build_object('ok', true, 'curso', v_curso);
end; $function$
;
comment on function public.cem_cancelar_inscripcion(p_enrollment_id uuid, p_motivo text) is 'Cancela una inscripción sin pagos confirmados. La pide el propio estudiante o el personal.';

CREATE OR REPLACE FUNCTION public.cem_cartera_historial(p_cartera text, p_limite integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if not (public.cem_puede_cobranza() or public.cem_es_auditor()) then
    raise exception 'Sólo cobranza y auditoría pueden ver las carteras.';
  end if;

  with mov as (
    select p.fecha::date as fecha, p.monto as monto,
           coalesce('Pago de ' || nullif(btrim(pr.nombre || ' ' || coalesce(pr.apellido,'')), ''),
                    'Pago ' || coalesce(p.referencia,'')) as detalle,
           'pago'::text as clase, p.id as origen_id, p.referencia
      from public.cem_payments p
      left join public.cem_enrollments e on e.id = p.enrollment_id
      left join public.cem_profiles pr on pr.id = e.profile_id
     where p.estado = 'confirmado' and p.cartera_id = p_cartera
    union all
    select g.fecha, -g.monto, coalesce(g.concepto,'Gasto'), 'gasto', g.id, g.referencia
      from public.cem_gastos g
     where not g.eliminado and g.cartera_id = p_cartera
    union all
    select k.fecha, -k.monto_origen,
           'Convertido a ' || cd.nombre || case when k.estado='pendiente' then ' (en tránsito)' else '' end,
           'conversion', k.id, null
      from public.cem_conversiones k
      join public.cem_carteras cd on cd.id = k.cartera_destino
     where not k.eliminado and k.cartera_origen = p_cartera
    union all
    select k.fecha, k.monto_destino, 'Recibido de ' || co.nombre, 'conversion', k.id, null
      from public.cem_conversiones k
      join public.cem_carteras co on co.id = k.cartera_origen
     where not k.eliminado and k.estado = 'completada' and k.cartera_destino = p_cartera
    union all
    select k.fecha, k.monto_destino, 'Ajuste: ' || coalesce(k.nota,'sin motivo'), 'ajuste', k.id, null
      from public.cem_conversiones k
     where not k.eliminado and k.cartera_origen is null and k.cartera_destino = p_cartera
  )
  select coalesce(jsonb_agg(to_jsonb(m) order by m.fecha desc), '[]'::jsonb)
    into v
    from (select * from mov order by fecha desc limit greatest(1, coalesce(p_limite,200))) m;
  return v;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_cartera_por_cobrar()
 RETURNS TABLE(estudiante text, email text, documento text, programa text, cohorte text, cuota integer, monto numeric, saldo numeric, moneda text, vence date, estado cem_cuota_estado, dias_mora integer, enrollment_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select trim(coalesce(p.nombre,'') || ' ' || coalesce(p.apellido,'')), p.email,
         cem_formato_cedula(p.documento), c.nombre, co.nombre,
         i.numero, i.monto, coalesce(i.saldo, i.monto), i.moneda,
         i.fecha_vencimiento, i.estado,
         greatest(0, (current_date - i.fecha_vencimiento))::integer,
         e.id
    from cem_installments i
    join cem_enrollments e on e.id = i.enrollment_id
    join cem_profiles p on p.id = e.profile_id
    join cem_courses c on c.id = e.course_id
    left join cem_cohorts co on co.id = e.cohort_id
   where i.estado in ('pendiente','parcial','vencida')
     and (cem_is_staff() or cem_puede_cobranza())
   order by i.fecha_vencimiento, p.apellido;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_carteras_saldos()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if not (public.cem_puede_cobranza() or public.cem_es_auditor()) then
    raise exception 'Sólo cobranza y auditoría pueden ver las carteras.';
  end if;

  with
  -- Lo que entró por matrículas. Sólo los pagos APROBADOS: uno reportado y
  -- todavía sin verificar no es dinero, es una promesa.
  entradas as (
    select p.cartera_id, sum(p.monto) as monto
      from public.cem_payments p
      join public.cem_carteras c on c.id = p.cartera_id
     where p.estado = 'confirmado' and coalesce(p.moneda, 'EUR') = c.moneda
     group by 1
  ),
  gastos as (
    select g.cartera_id, sum(g.monto) as monto
      from public.cem_gastos g
      join public.cem_carteras c on c.id = g.cartera_id
     where not g.eliminado and g.moneda = c.moneda
     group by 1
  ),
  -- El destino sólo suma si la conversión se completó: si sigue pendiente, ese
  -- dinero todavía no llegó y contarlo infla el saldo con plata que no está.
  llega as (
    select k.cartera_destino as cartera_id, sum(k.monto_destino) as monto
      from public.cem_conversiones k
     where not k.eliminado and k.estado = 'completada' and k.cartera_origen is not null
     group by 1
  ),
  -- El origen resta siempre, completada o pendiente: ese dinero ya salió.
  sale as (
    select k.cartera_origen as cartera_id, sum(k.monto_origen) as monto
      from public.cem_conversiones k
     where not k.eliminado and k.cartera_origen is not null
     group by 1
  ),
  -- Los ajustes no tienen origen. Suman o restan según el signo.
  ajustes as (
    select k.cartera_destino as cartera_id, sum(k.monto_destino) as monto
      from public.cem_conversiones k
     where not k.eliminado and k.cartera_origen is null
     group by 1
  ),
  saldos as (
    select c.id, c.nombre, c.moneda, c.tipo, c.orden, c.nota,
           round(coalesce(e.monto,0) - coalesce(g.monto,0)
               + coalesce(l.monto,0) - coalesce(s.monto,0)
               + coalesce(a.monto,0), 2) as saldo,
           coalesce(e.monto,0) as cobrado,
           coalesce(g.monto,0) as gastado,
           coalesce(a.monto,0) as ajustado
      from public.cem_carteras c
      left join entradas e on e.cartera_id = c.id
      left join gastos   g on g.cartera_id = c.id
      left join llega    l on l.cartera_id = c.id
      left join sale     s on s.cartera_id = c.id
      left join ajustes  a on a.cartera_id = c.id
     where c.activa
  ),
  -- Lo entregado que todavía no ha llegado. Se reporta aparte para que quien
  -- mira sepa que existe sin que ensucie ningún saldo.
  transito as (
    select k.id, k.fecha, k.monto_origen, k.monto_destino, k.nota,
           co.nombre as origen, co.moneda as moneda_origen,
           cd.nombre as destino, cd.moneda as moneda_destino
      from public.cem_conversiones k
      join public.cem_carteras co on co.id = k.cartera_origen
      join public.cem_carteras cd on cd.id = k.cartera_destino
     where not k.eliminado and k.estado = 'pendiente'
     order by k.fecha desc
  ),
  -- Dinero real que no suma a ninguna parte porque nadie dijo dónde cayó.
  -- No se adivina: se muestra para que un humano lo asigne.
  sueltos as (
    select p.id, p.fecha::date as fecha, p.referencia, p.monto, p.moneda, p.metodo,
           'pago'::text as clase,
           case when p.cartera_id is null then 'sin cartera'
                else 'la moneda del pago no es la de su cartera' end as porque
      from public.cem_payments p
      left join public.cem_carteras c on c.id = p.cartera_id
     where p.estado = 'confirmado'
       and (p.cartera_id is null or coalesce(p.moneda,'EUR') <> c.moneda)
     union all
    select g.id, g.fecha, g.referencia, g.monto, g.moneda, null,
           'gasto', case when g.cartera_id is null then 'sin cartera'
                         else 'la moneda del gasto no es la de su cartera' end
      from public.cem_gastos g
      left join public.cem_carteras c on c.id = g.cartera_id
     where not g.eliminado
       and (g.cartera_id is null or g.moneda <> c.moneda)
  )
  select jsonb_build_object(
    'saldos',        coalesce((select jsonb_agg(to_jsonb(s) order by s.orden) from saldos s), '[]'::jsonb),
    'pendientes',    coalesce((select jsonb_agg(to_jsonb(t)) from transito t), '[]'::jsonb),
    'sin_clasificar',coalesce((select jsonb_agg(to_jsonb(x) order by x.fecha desc) from sueltos x), '[]'::jsonb)
  ) into v;
  return v;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_certificar_modulos_terminados(p_enrollment_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; v_n int := 0;
begin
  for r in
    select m.id from cem_enrollments e
      join cem_modules m on m.course_id = e.course_id
     where e.id = p_enrollment_id and m.certifica
       and not exists (select 1 from cem_certificates c
                        where c.enrollment_id = e.id and c.module_id = m.id
                          and c.anulado_en is null)
       and cem_modulo_avance(e.id, m.id) >= 100
  loop
    begin
      perform cem_emitir_certificado_modulo(p_enrollment_id, r.id, false, null);
      v_n := v_n + 1;
    exception when others then
      -- Uno que falle no puede llevarse por delante a los demás ni al avance.
      null;
    end;
  end loop;
  return v_n;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_cierre_de_mes(p_mes date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not cem_is_staff() then raise exception 'No autorizado.'; end if;
  return cem_cierre_de_mes_calc(p_mes);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_cierre_de_mes_calc(p_mes date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ini date := date_trunc('month', p_mes)::date;
  v_fin date := (date_trunc('month', p_mes) + interval '1 month')::date;
  v_facturado numeric; v_n_cuotas int;
  v_cobrado numeric;   v_n_pagos int;
  v_vencido numeric;   v_n_vencidas int;
  v_por_revisar numeric; v_n_revisar int;
  v_concedido numeric; v_n_par int; v_sin_cruce int;
begin
  select coalesce(sum(monto), 0), count(*) into v_facturado, v_n_cuotas
    from cem_installments
   where fecha_vencimiento >= v_ini and fecha_vencimiento < v_fin and estado <> 'anulada';

  select coalesce(sum(coalesce(monto_base, monto)), 0), count(*) into v_cobrado, v_n_pagos
    from cem_payments where estado = 'confirmado' and fecha >= v_ini and fecha < v_fin;

  select coalesce(sum(coalesce(saldo, monto)), 0), count(*) into v_vencido, v_n_vencidas
    from cem_installments
   where fecha_vencimiento >= v_ini and fecha_vencimiento < v_fin
     and estado in ('pendiente','parcial','vencida') and fecha_vencimiento < current_date;

  select coalesce(sum(coalesce(monto_base, monto)), 0), count(*) into v_por_revisar, v_n_revisar
    from cem_payments where estado = 'reportado' and fecha >= v_ini and fecha < v_fin;

  select coalesce(sum(p.concesion_base), 0), count(*),
         count(*) filter (where p.concesion_base is null)
    into v_concedido, v_n_par, v_sin_cruce
    from cem_payments p
    join cem_metodos_pago m on m.metodo = p.metodo and m.regla = 'uno_a_uno'
   where p.estado = 'confirmado' and p.fecha >= v_ini and p.fecha < v_fin;

  return jsonb_build_object(
    'mes', to_char(v_ini, 'YYYY-MM'), 'desde', v_ini, 'hasta', (v_fin - 1),
    'facturado', v_facturado, 'cuotas', v_n_cuotas,
    'cobrado', v_cobrado, 'pagos', v_n_pagos,
    'vencido', v_vencido, 'cuotas_vencidas', v_n_vencidas,
    'por_revisar', v_por_revisar, 'pagos_por_revisar', v_n_revisar,
    'concedido_por_paridad', v_concedido, 'pagos_a_la_par', v_n_par,
    'pagos_sin_cruce', v_sin_cruce,
    'detalle_cobrado', (
      select coalesce(jsonb_agg(x order by x->>'fecha'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'fecha', p.fecha, 'estudiante', trim(coalesce(pr.nombre,'')||' '||coalesce(pr.apellido,'')),
                 'programa', c.nombre, 'metodo', p.metodo, 'referencia', p.referencia,
                 'monto', p.monto, 'moneda', p.moneda, 'tasa', p.tasa,
                 'en_dolares', coalesce(p.monto_base, p.monto),
                 'cruce', p.tasa_cruce, 'concedido', p.concesion_base) as x
          from cem_payments p
          join cem_enrollments e on e.id = p.enrollment_id
          left join cem_profiles pr on pr.id = e.profile_id
          left join cem_courses  c  on c.id = e.course_id
         where p.estado = 'confirmado' and p.fecha >= v_ini and p.fecha < v_fin) t),
    'detalle_vencido', (
      select coalesce(jsonb_agg(x order by x->>'vence'), '[]'::jsonb) from (
        select jsonb_build_object(
                 'estudiante', trim(coalesce(pr.nombre,'')||' '||coalesce(pr.apellido,'')),
                 'programa', c.nombre, 'cuota', i.numero,
                 'debe', coalesce(i.saldo, i.monto), 'moneda', coalesce(i.moneda,'USD'),
                 'vence', i.fecha_vencimiento,
                 'dias_mora', (current_date - i.fecha_vencimiento)) as x
          from cem_installments i
          join cem_enrollments e on e.id = i.enrollment_id
          left join cem_profiles pr on pr.id = e.profile_id
          left join cem_courses  c  on c.id = e.course_id
         where i.fecha_vencimiento >= v_ini and i.fecha_vencimiento < v_fin
           and i.estado in ('pendiente','parcial','vencida')
           and i.fecha_vencimiento < current_date) t));
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_clave_pregunta(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce((
    select string_agg(w, ' ' order by w)
      from (
        select distinct w
          from unnest(string_to_array(
                 regexp_replace(
                   lower(translate(coalesce(p, ''),
                     'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')),
                   '[^a-z0-9 ]', ' ', 'g'), ' ')) as w
         where length(w) >= 4
           and w not in (
             -- saludos y cortesía
             'hola','buenas','buenos','dias','tardes','noches','gracias','favor',
             'disculpe','disculpa','saludos','amigo','amiga','señor','senor','señora','senora',
             -- muletillas y palabras vacías largas
             'como','para','pero','esta','este','esto','esa','ese','eso','que','por',
             'con','sin','una','uno','del','las','los','mas','muy','ser','son','soy',
             'tengo','quiero','quisiera','necesito','saber','decir','favorcito',
             'ustedes','usted','ahi','alli','aqui','tambien','entonces','bueno')
      ) s
  ), lower(left(coalesce(p, ''), 40)))
$function$
;

CREATE OR REPLACE FUNCTION public.cem_cola_de_correccion()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((
    select jsonb_agg(x order by (x->>'bloquea')::boolean desc, (x->>'dias')::int desc)
      from (
        select jsonb_build_object(
          'id', s.id,
          'estudiante', trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,'')),
          'email', pr.email,
          'evaluacion', a.nombre,
          'curso', c.nombre,
          'entregado_en', s.entregado_en,
          'dias', greatest(0, (current_date - s.entregado_en::date)),
          'tarde', coalesce(s.tarde, false),
          -- Le bloquea el certificado si es lo ÚNICO que le falta: ya vio todo
          -- el contenido y no debe nada. Corregir eso primero es soltar a una
          -- persona que ya terminó.
          'bloquea', (coalesce(e.progreso, 0) >= 100
                      and not exists (select 1 from cem_installments i
                                       where i.enrollment_id = e.id
                                         and i.estado in ('pendiente','parcial','vencida')))
        ) as x
        from cem_submissions s
        join cem_assessments a on a.id = s.assessment_id
        join cem_enrollments e on e.id = s.enrollment_id
        join cem_courses c on c.id = a.course_id
        left join cem_profiles pr on pr.id = e.profile_id
       where s.estado = 'entregada'
         and (cem_is_staff() or cem_docente_de_curso(a.course_id))
      ) t), '[]'::jsonb);
$function$
;

CREATE OR REPLACE FUNCTION public.cem_columnas_copiables(p_esquema text, p_tabla text)
 RETURNS text
 LANGUAGE sql
 STABLE
AS $function$
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum)
    from pg_attribute a
   where a.attrelid = (quote_ident(p_esquema) || '.' || quote_ident(p_tabla))::regclass
     and a.attnum > 0 and not a.attisdropped
     and a.attgenerated = '';        -- '' = columna normal; 's' = calculada
$function$
;

CREATE OR REPLACE FUNCTION public.cem_comentario_usar(p_texto text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid;
begin
  if coalesce(trim(p_texto), '') = '' then return null; end if;
  select id into v_id from cem_comentarios_guardados
   where profile_id = auth.uid() and texto = trim(p_texto);
  if v_id is null then
    insert into cem_comentarios_guardados (profile_id, texto, usos)
    values (auth.uid(), trim(p_texto), 1) returning id into v_id;
  else
    update cem_comentarios_guardados set usos = usos + 1 where id = v_id;
  end if;
  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_compra_invitado_abrir(p_course_id uuid, p_nombre text, p_email text, p_cuotas integer DEFAULT 1, p_cohort_id uuid DEFAULT NULL::uuid, p_ip text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_c public.cem_courses; v_id uuid;
  v_email text := lower(trim(coalesce(p_email,'')));
  v_nombre text := trim(coalesce(p_nombre,''));
  v_factor numeric; v_total numeric; v_primera numeric; v_recientes int;
begin
  if v_nombre = '' or length(v_nombre) < 2 then
    raise exception 'Hace falta tu nombre.';
  end if;
  -- Comprobación deliberadamente simple: aquí no se valida si el correo
  -- existe, sólo que tenga forma de correo. Lo demás lo dice el pago.
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'Ese correo no parece un correo.';
  end if;
  if p_cuotas not in (1,3,6) then
    raise exception 'El plan de pago debe ser de 1, 3 o 6 cuotas.';
  end if;

  /* Un tope por correo. Sin esto, esta puerta —que es pública y sin sesión—
     deja abrir cobros en bucle: ruido en Stripe y una tabla que crece sola. */
  select count(*) into v_recientes from public.cem_compras_invitado
   where lower(email) = v_email and creada_en > now() - interval '1 hour';
  if v_recientes >= 6 then
    raise exception 'Demasiados intentos con ese correo. Prueba en un rato o escríbenos.';
  end if;

  select * into v_c from public.cem_courses where id = p_course_id;
  if v_c.id is null then raise exception 'Ese programa no existe.'; end if;
  if v_c.estado is distinct from 'publicado' then
    raise exception 'Ese programa no está abierto a inscripción ahora mismo.';
  end if;
  if coalesce(v_c.precio, 0) <= 0 then
    raise exception 'Ese programa no tiene precio puesto. Escríbenos y lo resolvemos.';
  end if;

  -- El MISMO factor que cem_inscribir_a. Si esto y aquello dijeran cosas
  -- distintas, se cobraría un importe y se crearía la cuota por otro.
  v_factor := case p_cuotas when 1 then 0.9 when 3 then 1 when 6 then 1.06 end;
  v_total := round(coalesce(v_c.precio,0) * v_factor, 2);
  v_primera := round(v_total / p_cuotas, 2);

  insert into public.cem_compras_invitado
    (course_id, cohort_id, nombre, email, cuotas, monto, moneda, ip)
  values (p_course_id, p_cohort_id, v_nombre, v_email, p_cuotas,
          v_primera, coalesce(v_c.moneda,'USD'), p_ip)
  returning id into v_id;

  return jsonb_build_object(
    'compra_id', v_id, 'nombre', v_nombre, 'email', v_email,
    'curso', v_c.nombre, 'stripe_product_id', v_c.stripe_product_id,
    'cuotas', p_cuotas, 'total', v_total,
    'a_cobrar_ahora', v_primera, 'moneda', coalesce(v_c.moneda,'USD'));
end $function$
;
CREATE OR REPLACE FUNCTION public.cem_compra_invitado_cerrar(p_compra_id uuid, p_profile_id uuid, p_cuenta_nueva boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_c record; v_ins public.cem_enrollments; v_cuota uuid;
begin
  select * into v_c from public.cem_compras_invitado where id = p_compra_id for update;
  if v_c.id is null then raise exception 'Esa compra no existe.'; end if;

  if v_c.estado = 'pagada' and v_c.enrollment_id is not null then
    select id into v_cuota from public.cem_installments
     where enrollment_id = v_c.enrollment_id order by numero limit 1;
    return jsonb_build_object('repetido', true, 'enrollment_id', v_c.enrollment_id,
                              'installment_id', v_cuota, 'profile_id', v_c.profile_id);
  end if;

  /* Si ya tenía una inscripción activa en ese programa —compró dos veces, o
     ya estaba inscrito con otra forma de pago— NO se crea otra: se usa la que
     hay y el pago entra ahí. Crear una segunda dejaría dos carteras para la
     misma persona y el mismo curso. */
  select * into v_ins from public.cem_enrollments
   where profile_id = p_profile_id and course_id = v_c.course_id
     and estado not in ('cancelada','finalizada') limit 1;

  if v_ins.id is null then
    v_ins := public.cem_inscribir_a(p_profile_id, v_c.course_id, v_c.cohort_id, v_c.cuotas, null);
  end if;

  select id into v_cuota from public.cem_installments
   where enrollment_id = v_ins.id and estado <> 'pagada' order by numero limit 1;

  update public.cem_compras_invitado
     set estado = 'pagada', pagada_en = now(), profile_id = p_profile_id,
         enrollment_id = v_ins.id, cuenta_nueva = coalesce(p_cuenta_nueva, cuenta_nueva)
   where id = p_compra_id;

  return jsonb_build_object('enrollment_id', v_ins.id, 'installment_id', v_cuota,
                            'profile_id', p_profile_id);
end $function$
;
CREATE OR REPLACE FUNCTION public.cem_compra_invitado_estado(p_compra_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select jsonb_build_object(
       'hay', true,
       'estado', c.estado,
       'nombre', c.nombre,
       'email', c.email,
       'curso', k.nombre,
       'cuenta_nueva', coalesce(c.cuenta_nueva, false))
     from cem_compras_invitado c
     join cem_courses k on k.id = c.course_id
     where c.id = p_compra_id),
    jsonb_build_object('hay', false));
$function$
;

CREATE OR REPLACE FUNCTION public.cem_conciliar(p_notificacion_id uuid, p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n cem_bancaribe_notificaciones; v_p cem_payments;
begin
  if not cem_puede_cobranza() then raise exception 'No autorizado.'; end if;

  select * into v_n from cem_bancaribe_notificaciones where id = p_notificacion_id;
  if v_n.id is null then raise exception 'Ese aviso del banco ya no existe.'; end if;
  if v_n.payment_id is not null then
    raise exception 'Ese aviso ya está conciliado con otro pago.';
  end if;

  select * into v_p from cem_payments where id = p_payment_id;
  if v_p.id is null then raise exception 'Ese pago no existe.'; end if;
  if exists (select 1 from cem_bancaribe_notificaciones
              where payment_id = p_payment_id and id <> p_notificacion_id) then
    raise exception 'Ese pago ya está conciliado con otro aviso del banco.';
  end if;

  update cem_bancaribe_notificaciones
     set payment_id = p_payment_id,
         enrollment_id = v_p.enrollment_id,
         estado = 'conciliada',
         conciliado_por = auth.uid(),
         conciliado_en = now()
   where id = p_notificacion_id;

  update cem_payments set conciliado = true where id = p_payment_id;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), (select email from cem_profiles where id = auth.uid()),
          'pago_conciliado', 'cem_payments', p_payment_id, 'medio',
          jsonb_build_object('notificacion', p_notificacion_id,
                             'banco_referencia', coalesce(v_n.origin_bank_reference, v_n.destiny_bank_reference),
                             'pago_referencia', v_p.referencia,
                             'monto_banco', v_n.amount, 'monto_pago', v_p.monto));

  return jsonb_build_object('ok', true, 'payment_id', p_payment_id, 'estado_pago', v_p.estado);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_conciliar_sugerencias(p_dias integer DEFAULT 45)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when not cem_puede_cobranza() then '[]'::jsonb else
    coalesce((
      select jsonb_agg(x order by (x->>'parecido')::int desc, x->>'banco_fecha' desc)
        from (
          select jsonb_build_object(
            'notificacion_id', n.id,
            'banco_referencia', coalesce(n.origin_bank_reference, n.destiny_bank_reference),
            'banco_monto', n.amount,
            'banco_moneda', coalesce(n.currency_code, 'VES'),
            'banco_fecha', n.fecha_banco,
            'banco_telefono', n.client_phone,
            'payment_id', pa.id,
            'pago_referencia', pa.referencia,
            'pago_monto', pa.monto,
            'pago_moneda', pa.moneda,
            'pago_fecha', pa.fecha,
            'pago_metodo', pa.metodo,
            'estudiante', trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,'')),
            'curso', cur.nombre,
            'parecido', cem_parecido_pago(
              coalesce(n.origin_bank_reference, n.destiny_bank_reference), pa.referencia,
              n.amount, pa.monto,
              nullif(n.fecha_banco, '')::date, pa.fecha::date),
            'porque', case
              when regexp_replace(coalesce(n.origin_bank_reference, n.destiny_bank_reference, ''), '\D', '', 'g')
                 = regexp_replace(coalesce(pa.referencia, ''), '\D', '', 'g')
                 and coalesce(pa.referencia,'') <> ''
                then 'La referencia coincide entera.'
              when abs(coalesce(n.amount,0) - coalesce(pa.monto,0)) <= 0.01
                then 'El importe coincide al céntimo y la fecha cuadra.'
              else 'Se parecen, pero conviene mirarlo.' end
          ) as x
          from cem_bancaribe_notificaciones n
          join cem_payments pa
            on pa.estado = 'reportado'
           and pa.moneda = coalesce(n.currency_code, 'VES')
          left join cem_enrollments e on e.id = pa.enrollment_id
          left join cem_profiles pr on pr.id = e.profile_id
          left join cem_courses cur on cur.id = e.course_id
         where coalesce(n.estado, 'pendiente') = 'pendiente'
           and n.payment_id is null
           and n.recibido_en >= now() - make_interval(days => greatest(p_dias, 1))
           and cem_parecido_pago(
                 coalesce(n.origin_bank_reference, n.destiny_bank_reference), pa.referencia,
                 n.amount, pa.monto,
                 nullif(n.fecha_banco, '')::date, pa.fecha::date) >= 30
        ) t), '[]'::jsonb) end;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_confirmar_llegada(p_id uuid, p_monto_destino numeric)
 RETURNS cem_conversiones
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v public.cem_conversiones;
begin
  if not public.cem_puede_cobranza() then
    raise exception 'Sólo el personal de cobranza puede confirmar una llegada.';
  end if;
  if coalesce(p_monto_destino, 0) <= 0 then
    raise exception 'Escribe cuánto llegó de verdad.';
  end if;

  update public.cem_conversiones
     set monto_destino = p_monto_destino,
         estado = 'completada',
         tasa = case when coalesce(monto_origen,0) > 0
                     then round(p_monto_destino / monto_origen, 6) end
   where id = p_id and cartera_origen is not null
  returning * into v;

  if v.id is null then
    raise exception 'Esa conversión no existe o es un ajuste, que no tiene nada que llegar.';
  end if;

  insert into public.cem_audit_events (accion, entidad, entidad_id, riesgo, detalle)
  values ('conversion_confirmada', 'cem_conversiones', p_id, 'alto', to_jsonb(v));
  return v;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_correo_config()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(datos, '{}'::jsonb) from cem_integraciones where id = 'correo';
$function$
;

CREATE OR REPLACE FUNCTION public.cem_correo_descartar(p_estado text DEFAULT 'fallido'::text, p_para text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n int;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede descartar correos.' using errcode = '42501';
  end if;
  if coalesce(p_estado,'') not in ('fallido','pendiente') then
    raise exception 'Sólo se descarta lo fallido o lo que todavía espera. Llegó "%".',
      coalesce(p_estado,'(nada)');
  end if;

  with fuera as (
    delete from cem_correo_cola
     where estado = p_estado
       -- 'enviando' nunca entra aquí: ya está en manos del proveedor y borrar la
       -- fila sólo perdería la constancia de que salió.
       and (p_para is null or para like p_para)
    returning 1)
  select count(*) into v_n from fuera;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, riesgo, detalle)
  select auth.uid(), (select email from cem_profiles where id = auth.uid()),
         'correo.descartados', 'cem_correo_cola', case when p_estado = 'pendiente' then 'alto' else 'medio' end,
         jsonb_build_object('estado', p_estado, 'filtro_destinatario', p_para, 'cuantos', v_n);

  return jsonb_build_object('ok', true, 'descartados', v_n);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_correo_empujar(p_tanda integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v jsonb := cem_correo_config();
  v_clave text := v->>'api_key';
  v_remitente text := v->>'remitente';
  v_proveedor text := coalesce(v->>'proveedor', '');
  m record; v_req bigint; v_puestos int := 0; v_apartados int := 0;
begin
  if v_clave is null or v_remitente is null then
    return jsonb_build_object('ok', true, 'en_pausa', true, 'puestos', 0,
      'motivo', 'No hay proveedor de correo configurado.');
  end if;
  if v_proveedor <> 'resend' then
    return jsonb_build_object('ok', false, 'en_pausa', true, 'puestos', 0,
      'motivo', format('El proveedor "%s" no está implementado. Hoy sólo se envía por Resend.', v_proveedor));
  end if;

  /* Lo primero, apartar lo que rebotaría. No se deja «pendiente» para siempre
     —eso ensucia la cola y el aviso de la pantalla no se apagaría nunca—: se
     marca descartado diciendo por qué, y así queda constancia. */
  update cem_correo_cola
     set estado = 'descartado',
         error = 'Dirección de prueba: no se envía para no acumular rebotes.'
   where estado = 'pendiente' and cem_correo_es_de_mentira(para);
  get diagnostics v_apartados = row_count;

  -- Rescate: un 'enviando' de hace más de media hora es un mensaje cuya
  -- respuesta se perdió (pg_net limpia las suyas a las pocas horas). Vuelve a
  -- la cola en vez de quedarse colgado para siempre.
  update cem_correo_cola
     set estado = 'pendiente', request_id = null,
         error = 'La respuesta del proveedor se perdió; se reintenta.'
   where estado = 'enviando'
     and coalesce(enviado_en, created_at) < now() - interval '30 minutes';

  for m in
    select id, para, asunto, cuerpo
      from cem_correo_cola
     where estado = 'pendiente' and proximo_intento_en <= now()
     order by created_at
     limit greatest(1, least(coalesce(p_tanda, 25), 100))
  loop
    v_req := net.http_post(
      url := 'https://api.resend.com/emails',
      body := jsonb_build_object(
        'from', v_remitente, 'to', jsonb_build_array(m.para),
        'subject', m.asunto, 'text', m.cuerpo,
        'html', cem_correo_html(m.asunto, m.cuerpo)),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || v_clave, 'Content-Type', 'application/json'),
      timeout_milliseconds := 15000);

    update cem_correo_cola
       set estado = 'enviando', request_id = v_req, enviado_en = now(), error = null
     where id = m.id;
    v_puestos := v_puestos + 1;
  end loop;

  return jsonb_build_object('ok', true, 'en_pausa', false,
                            'puestos', v_puestos, 'apartados', v_apartados);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_correo_en_pausa()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select (datos->>'api_key') is null or nullif(datos->>'remitente','') is null
       from cem_integraciones where id = 'correo'),
    true);
$function$
;

CREATE OR REPLACE FUNCTION public.cem_correo_es_de_mentira(p_para text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select coalesce(p_para,'') ~*
    '@(cem\.demo|cem\.invalid|pruebas\.local|example\.(com|org|net)|test|localhost)$';
$function$
;

CREATE OR REPLACE FUNCTION public.cem_correo_estado()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb; v_clave text; v_reloj boolean;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede ver el estado del correo.' using errcode = '42501';
  end if;

  v := cem_correo_config();
  v_clave := v->>'api_key';
  select count(*) = 2 into v_reloj from cron.job
   where jobname in ('cem-correo-empujar','cem-correo-recoger') and active;

  return jsonb_build_object(
    'configurado', v_clave is not null and nullif(v->>'remitente','') is not null,
    'proveedor',   v->>'proveedor',
    'remitente',   v->>'remitente',
    'clave_pista', case when v_clave is null then null else '••••' || right(v_clave, 4) end,
    'reloj_activo', coalesce(v_reloj, false),
    'cifras', (select jsonb_object_agg(estado, n)
                 from (select estado, count(*) as n from cem_correo_cola group by estado) t),
    'mas_viejo', (select min(created_at) from cem_correo_cola where estado = 'pendiente'),
    'enviados_24h', (select count(*) from cem_correo_cola
                      where estado = 'enviado' and enviado_en > now() - interval '24 hours'),
    -- Los que van a rebotar seguro, porque su dirección no existe.
    'rebotaran', (select count(*) from cem_correo_cola
                   where estado = 'pendiente' and cem_correo_es_de_mentira(para)),
    'fallos', (select coalesce(jsonb_agg(f order by f->>'cuantos' desc), '[]'::jsonb) from (
        select jsonb_build_object('motivo', left(error, 160), 'cuantos', count(*)) as f
          from cem_correo_cola where estado = 'fallido' and error is not null
         group by left(error, 160) limit 8) g),
    'proximos', (select coalesce(jsonb_agg(jsonb_build_object(
                    'para', para, 'asunto', asunto, 'espera_desde', created_at,
                    'intentos', intentos, 'de_mentira', cem_correo_es_de_mentira(para))
                    order by created_at), '[]'::jsonb)
                   from (select * from cem_correo_cola where estado = 'pendiente'
                          order by created_at limit 10) p)
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_correo_html(p_asunto text, p_cuerpo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select '<!doctype html><html lang="es"><body style="margin:0;background:#E9ECEF;'
    || 'font-family:Poppins,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1F1F1F">'
    || '<div style="max-width:560px;margin:0 auto;padding:28px 20px">'
    || '<div style="font-weight:700;letter-spacing:.04em;color:#3E7BFF;margin-bottom:18px">'
    || 'CENTRO DE ESTUDIOS DE MARKETING</div>'
    || '<div style="background:#FFFFFF;border:1px solid #E9ECEF;border-radius:14px;padding:24px">'
    || '<h1 style="margin:0 0 16px;font-size:19px;line-height:1.35">'
    || replace(replace(replace(p_asunto, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</h1>'
    || (select string_agg('<p style="margin:0 0 14px;line-height:1.6">'
          || replace(replace(replace(replace(parrafo, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
                     chr(10), '<br>') || '</p>', '')
        from regexp_split_to_table(p_cuerpo, '\n{2,}') as parrafo)
    || '</div>'
    || '<p style="margin:18px 0 0;font-size:12px;color:#6b6b6b;line-height:1.5">'
    || 'Educamos hoy, lideras mañana. · Este mensaje se envió automáticamente desde la '
    || 'plataforma del Centro de Estudios de Marketing. No respondas a esta dirección; '
    || 'escríbenos desde tu panel si necesitas ayuda.</p></div></body></html>';
$function$
;

CREATE OR REPLACE FUNCTION public.cem_correo_proveedor_guardar(p_proveedor text, p_remitente text, p_api_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_antes jsonb; v_clave text;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede configurar el correo.' using errcode = '42501';
  end if;
  if coalesce(p_proveedor,'') <> 'resend' then
    raise exception 'Hoy sólo se envía por Resend. Llegó "%".', coalesce(p_proveedor,'(nada)');
  end if;
  -- El remitente tiene que ser un correo de un dominio verificado en el
  -- proveedor, y admite la forma «Nombre <correo@dominio>».
  if coalesce(p_remitente,'') !~ '^([^<>]*<)?[^@<>[:space:]]+@[^@<>[:space:]]+\.[a-z]{2,}>?$' then
    raise exception 'El remitente no parece una dirección válida: "%". Usa correo@tudominio.com o Nombre <correo@tudominio.com>.',
      coalesce(p_remitente,'(nada)');
  end if;

  v_antes := cem_correo_config();
  -- Sin clave nueva se conserva la de antes: así se puede corregir el remitente
  -- sin tener que ir a buscar la clave otra vez.
  v_clave := coalesce(nullif(trim(p_api_key), ''), v_antes->>'api_key');
  if v_clave is null then
    raise exception 'Falta la clave del proveedor. Es la que empieza por re_ en el panel de Resend.';
  end if;

  insert into cem_integraciones (id, datos)
  values ('correo', jsonb_build_object(
    'proveedor', p_proveedor, 'remitente', trim(p_remitente), 'api_key', v_clave))
  on conflict (id) do update set datos = excluded.datos;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, riesgo, detalle)
  select auth.uid(), (select email from cem_profiles where id = auth.uid()),
         'correo.proveedor_guardado', 'cem_integraciones', 'alto',
         jsonb_build_object('proveedor', p_proveedor, 'remitente', trim(p_remitente),
           'clave_cambiada', nullif(trim(p_api_key), '') is not null,
           'habia_proveedor', v_antes->>'api_key' is not null);

  -- Al conectar, lo que esperaba vuelve a la salida ya: los reintentos con
  -- espera creciente los provocó no haber proveedor, no un problema del envío.
  update cem_correo_cola
     set proximo_intento_en = now(), intentos = 0, error = null
   where estado = 'pendiente';

  return cem_correo_estado();
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_correo_proveedor_quitar()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede desconectar el correo.' using errcode = '42501';
  end if;
  delete from cem_integraciones where id = 'correo';
  insert into cem_audit_events (actor_id, actor_email, accion, entidad, riesgo, detalle)
  select auth.uid(), (select email from cem_profiles where id = auth.uid()),
         'correo.proveedor_quitado', 'cem_integraciones', 'alto',
         jsonb_build_object('nota', 'Los avisos por correo quedan en pausa; la cola no se pierde.');
  return cem_correo_estado();
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_correo_prueba(p_para text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_asunto text; v_cuerpo text; v_clave text; v_puesto boolean;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede mandar una prueba.' using errcode = '42501';
  end if;
  if coalesce(p_para,'') !~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then
    raise exception 'Esa dirección no puede recibir nada: "%".', coalesce(p_para,'(nada)');
  end if;

  v_asunto := 'Prueba de correo de la plataforma';
  v_cuerpo := format(
    'Si estás leyendo esto, el correo de la plataforma funciona.'
    || chr(10) || chr(10) || 'Enviada el %s por %s.'
    || chr(10) || chr(10) || 'Educamos hoy, lideras mañana.',
    to_char(clock_timestamp(), 'DD/MM/YYYY HH24:MI:SS.MS'),
    coalesce((select email from cem_profiles where id = auth.uid()), 'la plataforma'));

  insert into cem_correo_cola (para, asunto, cuerpo, clave)
  values (p_para, v_asunto, v_cuerpo, md5(p_para || '|' || v_asunto || '|' || v_cuerpo))
  on conflict (clave) where estado = 'pendiente' do nothing;
  v_puesto := found;

  if not v_puesto then
    return jsonb_build_object('ok', true, 'en_pausa', cem_correo_en_pausa(),
      'mensaje', 'Ya había una prueba idéntica esperando en la cola, así que no se duplicó.');
  end if;

  if cem_correo_en_pausa() then
    return jsonb_build_object('ok', true, 'en_pausa', true,
      'mensaje', 'La prueba quedó en la cola, pero no saldrá hasta que haya proveedor configurado.');
  end if;
  perform cem_correo_empujar(1);
  return jsonb_build_object('ok', true, 'en_pausa', false,
    'mensaje', format('Va camino a %s. Si no llega en un minuto, mira los fallos aquí abajo.', p_para));
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_correo_recoger()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m record; v_ok int := 0; v_reintenta int := 0; v_muerto int := 0;
  v_MAX constant int := 5;
begin
  for m in
    select c.id, c.intentos, r.status_code, r.content, r.error_msg, r.timed_out
      from cem_correo_cola c
      join net._http_response r on r.id = c.request_id
     where c.estado = 'enviando'
  loop
    if m.status_code between 200 and 299 then
      update cem_correo_cola
         set estado = 'enviado', enviado_en = now(), error = null,
             proveedor_id = nullif(m.content::jsonb->>'id', '')
       where id = m.id;
      v_ok := v_ok + 1;
    else
      -- Un 4xx del proveedor no se arregla reintentando: la dirección es
      -- inválida, o la clave, o el remitente no está verificado. Un 5xx o un
      -- tiempo agotado sí. Distinguirlos evita cuatro intentos inútiles y, al
      -- revés, evita rendirse ante una caída pasajera.
      declare
        v_permanente boolean := coalesce(m.status_code, 0) between 400 and 499;
        v_intentos int := coalesce(m.intentos, 0) + 1;
        v_agotado boolean;
        v_detalle text := left(coalesce(
          nullif(m.error_msg, ''),
          case when m.timed_out then 'El proveedor no respondió en 15 segundos.' end,
          coalesce(m.content, '')), 400);
      begin
        v_agotado := v_permanente or v_intentos >= v_MAX;
        update cem_correo_cola
           set estado = case when v_agotado then 'fallido' else 'pendiente' end,
               intentos = v_intentos,
               request_id = null,
               -- Espera creciente: 1, 4, 16 y 64 minutos. Insistir cada minuto
               -- contra un proveedor caído sólo gasta cuota.
               proximo_intento_en = now() + (interval '1 minute' * power(4, v_intentos)),
               error = format('%s %s', coalesce(m.status_code, 0), v_detalle)
         where id = m.id;
        if v_agotado then v_muerto := v_muerto + 1; else v_reintenta := v_reintenta + 1; end if;
      end;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'enviados', v_ok,
    'se_reintentan', v_reintenta, 'fallidos', v_muerto);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_correo_reintentar()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n int;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede reintentar.' using errcode = '42501';
  end if;
  -- Sin borrar el error: si vuelve a fallar, saber que ya había fallado antes
  -- por lo mismo es la mitad del diagnóstico.
  with vuelven as (
    update cem_correo_cola
       set estado = 'pendiente', intentos = 0, proximo_intento_en = now(), request_id = null
     where estado = 'fallido' returning 1)
  select count(*) into v_n from vuelven;
  return jsonb_build_object('ok', true, 'devueltos_a_la_cola', v_n);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_correo_tirar_los_de_mentira()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n int;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede descartar correos.' using errcode = '42501';
  end if;
  with fuera as (
    delete from cem_correo_cola
     where estado in ('pendiente','fallido') and cem_correo_es_de_mentira(para)
    returning 1)
  select count(*) into v_n from fuera;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, riesgo, detalle)
  select auth.uid(), (select email from cem_profiles where id = auth.uid()),
         'correo.descartados_de_mentira', 'cem_correo_cola', 'bajo',
         jsonb_build_object('cuantos', v_n,
           'motivo', 'Direcciones de demostración que habrían rebotado.');

  return jsonb_build_object('ok', true, 'descartados', v_n);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_correo_vaciar_ahora(p_tanda integer DEFAULT 25)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_empujo jsonb;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede vaciar la cola.' using errcode = '42501';
  end if;
  v_empujo := cem_correo_empujar(p_tanda);
  -- No se recoge aquí: pg_net contesta en su propio proceso y en este instante
  -- todavía no ha salido nada. Decir «0 enviados» sería mentir; el reloj lo
  -- recoge en menos de un minuto.
  return v_empujo || jsonb_build_object('nota',
    'Puestos a la salida. El resultado de cada uno aparece en menos de un minuto.');
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_cruce_eur_usd(p_fecha date DEFAULT CURRENT_DATE)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when u.valor > 0 then round(e.valor / u.valor, 6) end
    from (select valor from cem_tasas_bcv where moneda = 'EUR' and fecha <= coalesce(p_fecha, current_date)
           order by fecha desc, actualizado_en desc limit 1) e,
         (select valor from cem_tasas_bcv where moneda = 'USD' and fecha <= coalesce(p_fecha, current_date)
           order by fecha desc, actualizado_en desc limit 1) u;
$function$
;
comment on function public.cem_cruce_eur_usd(p_fecha date) is 'Cuántos dólares vale un euro ese día, deducido de las dos tasas BCV.';

CREATE OR REPLACE FUNCTION public.cem_cuentas_sin_ficha()
 RETURNS TABLE(correo text, creada timestamp with time zone, ultima_entrada timestamp with time zone, bloqueada boolean, sesiones_vivas integer, que_hacer text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.cem_role() not in ('admin', 'superadmin', 'auditor') then
    raise exception 'Sólo un administrador o un auditor puede ver las cuentas sin ficha.';
  end if;

  return query
  select u.email::text,
         u.created_at,
         u.last_sign_in_at,
         coalesce(u.banned_until > now(), false),
         (select count(*)::integer from auth.sessions s where s.user_id = u.id),
         case
           when coalesce(u.banned_until > now(), false)
                and not exists (select 1 from auth.sessions s where s.user_id = u.id)
             then 'Bloqueada y sin sesiones abiertas. No puede entrar.'
           when coalesce(u.banned_until > now(), false)
             then 'Bloqueada, pero le queda alguna sesión abierta: hay que cerrarla, o seguirá renovándose.'
           else 'Puede entrar ahora mismo y nadie la ve. Hay que bloquearla o darle ficha.'
         end
    from auth.users u
   where not exists (select 1 from cem_profiles p where p.id = u.id)
   order by u.last_sign_in_at desc nulls last, u.created_at;
end
$function$
;

CREATE OR REPLACE FUNCTION public.cem_curso_lecciones_de_video(p_course_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'playlist', (select youtube_playlist from cem_courses where id = p_course_id),
    'modulos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'titulo', m.titulo, 'orden', m.orden,
        'lecciones', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', l.id, 'titulo', l.titulo, 'orden', l.orden,
            'tipo', l.tipo, 'video_id', l.video_id, 'duracion_min', l.duracion_min)
            order by l.orden)
          from cem_lessons l where l.module_id = m.id), '[]'::jsonb))
        order by m.orden)
      from cem_modules m where m.course_id = p_course_id), '[]'::jsonb))
  where cem_is_staff() or cem_is_teacher();
$function$
;

CREATE OR REPLACE FUNCTION public.cem_debe_cambiar_clave()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
  select exists (
    select 1
      from cem_clave_pendiente p
      join auth.users u on u.id = p.profile_id
     where p.profile_id = auth.uid()
       and u.encrypted_password = p.hash_inicial);
$function$
;

CREATE OR REPLACE FUNCTION public.cem_dejar_contacto(p_nombre text, p_email text DEFAULT NULL::text, p_telefono text DEFAULT NULL::text, p_mensaje text DEFAULT NULL::text, p_interes text DEFAULT NULL::text, p_course_id uuid DEFAULT NULL::uuid, p_como_nos_conocio text DEFAULT NULL::text, p_origen text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_nombre text := left(trim(coalesce(p_nombre, '')), 120);
  v_email  text := nullif(lower(left(trim(coalesce(p_email, '')), 200)), '');
  v_tel    text := nullif(left(trim(coalesce(p_telefono, '')), 40), '');
  v_msj    text := nullif(left(trim(coalesce(p_mensaje, '')), 2000), '');
  v_lead   cem_leads;
begin
  if v_nombre = '' then
    raise exception 'Hace falta un nombre para poder responderte.';
  end if;
  if v_email is null and v_tel is null then
    raise exception 'Déjanos un correo o un teléfono, o no podremos contestarte.';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' then
    raise exception 'Ese correo no parece una dirección válida.';
  end if;

  if v_email is not null then
    select * into v_lead from cem_leads where lower(trim(email)) = v_email limit 1;
  end if;

  if v_lead.id is null then
    insert into cem_leads(nombre, email, telefono, mensaje, interes, course_id,
                          como_nos_conocio, origen)
    values (v_nombre, v_email, v_tel, v_msj,
            nullif(left(trim(coalesce(p_interes, '')), 120), ''),
            p_course_id,
            nullif(left(trim(coalesce(p_como_nos_conocio, '')), 60), ''),
            nullif(left(trim(coalesce(p_origen, '')), 120), ''));
    return jsonb_build_object('ok', true);
  end if;

  -- Escribir dos veces lo mismo es un doble clic, no dos consultas.
  if v_msj is not null and v_lead.mensaje is not distinct from v_msj then
    return jsonb_build_object('ok', true, 'yaTeniamos', true);
  end if;

  /* Si vuelve a escribir con algo distinto, lo nuevo va a `mensaje` —que es lo
     primero que se lee al abrir la ficha— y lo viejo baja a la nota interna
     con su fecha. Machacarlo sin más perdería la consulta anterior, que a
     veces es la que explica de qué va la conversación. */
  update cem_leads set
    nombre   = case when coalesce(trim(nombre), '') = '' then v_nombre else nombre end,
    telefono = coalesce(telefono, v_tel),
    interes  = coalesce(interes, nullif(left(trim(coalesce(p_interes, '')), 120), '')),
    course_id = coalesce(course_id, p_course_id),
    como_nos_conocio = coalesce(como_nos_conocio,
      nullif(left(trim(coalesce(p_como_nos_conocio, '')), 60), '')),
    mensaje = coalesce(v_msj, mensaje),
    nota_interna = case
      when v_msj is null or v_lead.mensaje is null then nota_interna
      else nullif(trim(both E'\n' from concat_ws(E'\n\n', nota_interna,
        to_char(v_lead.created_at, 'DD/MM/YYYY') || ' · escribió antes: ' || v_lead.mensaje)), '')
    end
   where id = v_lead.id;

  return jsonb_build_object('ok', true, 'yaTeniamos', true);
end; $function$
;
comment on function public.cem_dejar_contacto(p_nombre text, p_email text, p_telefono text, p_mensaje text, p_interes text, p_course_id uuid, p_como_nos_conocio text, p_origen text) is 'Guarda un contacto desde la web pública. La puede llamar cualquiera: es el formulario.';

CREATE OR REPLACE FUNCTION public.cem_desconciliar(p_notificacion_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n cem_bancaribe_notificaciones;
begin
  if not cem_puede_cobranza() then raise exception 'No autorizado.'; end if;
  select * into v_n from cem_bancaribe_notificaciones where id = p_notificacion_id;
  if v_n.id is null then return; end if;

  update cem_bancaribe_notificaciones
     set payment_id = null, enrollment_id = null, estado = 'pendiente',
         conciliado_por = null, conciliado_en = null
   where id = p_notificacion_id;

  -- El pago vuelve a estar sin conciliar sólo si no le queda otro aviso.
  if v_n.payment_id is not null
     and not exists (select 1 from cem_bancaribe_notificaciones
                      where payment_id = v_n.payment_id) then
    update cem_payments set conciliado = false where id = v_n.payment_id;
  end if;

  insert into cem_audit_events (actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'pago_desconciliado', 'cem_payments', v_n.payment_id, 'medio',
          jsonb_build_object('notificacion', p_notificacion_id));
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_dicta_cohorte(p_cohort uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.cem_is_staff()
      or exists (select 1 from public.cem_teacher_assignments t
                  where t.cohort_id = p_cohort and t.teacher_id = auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.cem_docente_de_cohorte(p_cohort_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from cem_teacher_assignments ta
     where ta.teacher_id = auth.uid() and ta.cohort_id = p_cohort_id
  ) or exists (
    select 1 from cem_cohorts c join cem_teacher_assignments ta on ta.course_id = c.course_id
     where c.id = p_cohort_id and ta.teacher_id = auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.cem_docente_de_curso(p_course_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from cem_teacher_assignments ta
     where ta.teacher_id = auth.uid()
       and (ta.course_id = p_course_id
            or exists (select 1 from cem_cohorts c
                        where c.id = ta.cohort_id and c.course_id = p_course_id))
  );
$function$
;
comment on function public.cem_docente_de_curso(p_course_id uuid) is 'Cierto si quien llama tiene asignado ese curso (directo o a través de una cohorte suya).';

CREATE OR REPLACE FUNCTION public.cem_donde_pagar()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'metodo', m.metodo,
           'moneda', m.moneda,
           'regla', m.regla,
           'titular', m.titular,
           'destino', m.destino,
           'destino_etiqueta', coalesce(m.destino_etiqueta, 'Cuenta'),
           'datos', m.datos,
           'instrucciones', m.instrucciones,
           'nota', m.nota,
           -- Listo para usarse: tiene a dónde mandar el dinero.
           'listo', nullif(trim(coalesce(m.destino, '')), '') is not null)
         order by m.orden), '[]'::jsonb)
    from cem_metodos_pago m
   where m.activo
     and auth.uid() is not null;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_dudas_de_leccion(p_lesson_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when not cem_puede_ver_leccion(p_lesson_id) then '[]'::jsonb else
    coalesce((
      select jsonb_agg(x order by (x->>'resuelta')::boolean, x->>'created_at' desc)
        from (
          select jsonb_build_object(
            'id', d.id, 'cuerpo', d.cuerpo, 'segundo', d.segundo,
            'resuelta', d.resuelta, 'created_at', d.created_at,
            'autor_id', d.autor_id,
            'autor', trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,'')),
            'mia', d.autor_id = auth.uid(),
            'respuestas', coalesce((
              select jsonb_agg(jsonb_build_object(
                       'id', r.id, 'cuerpo', r.cuerpo, 'created_at', r.created_at,
                       'de_docente', r.de_docente,
                       'autor', trim(coalesce(rp.nombre,'') || ' ' || coalesce(rp.apellido,'')))
                     order by r.created_at)
                from cem_duda_respuestas r
                left join cem_profiles rp on rp.id = r.autor_id
               where r.duda_id = d.id and not r.eliminada), '[]'::jsonb)) as x
            from cem_dudas d
            left join cem_profiles pr on pr.id = d.autor_id
           where d.lesson_id = p_lesson_id and not d.eliminada
        ) t), '[]'::jsonb) end;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_dudas_pendientes(p_course_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', d.id, 'cuerpo', d.cuerpo, 'segundo', d.segundo,
             'created_at', d.created_at, 'course_id', d.course_id,
             'lesson_id', d.lesson_id, 'leccion', l.titulo, 'curso', c.nombre,
             'autor', trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,'')),
             'respuestas', (select count(*) from cem_duda_respuestas r
                             where r.duda_id = d.id and not r.eliminada))
           order by d.created_at)
      from cem_dudas d
      join cem_lessons l on l.id = d.lesson_id
      join cem_courses c on c.id = d.course_id
      left join cem_profiles pr on pr.id = d.autor_id
     where not d.eliminada and not d.resuelta
       and (p_course_id is null or d.course_id = p_course_id)
       and (cem_is_staff() or cem_docente_de_curso(d.course_id))
       and not exists (select 1 from cem_duda_respuestas r
                        where r.duda_id = d.id and r.de_docente and not r.eliminada)
  ), '[]'::jsonb);
$function$
;

CREATE OR REPLACE FUNCTION public.cem_eliminar_conversion(p_id uuid, p_eliminar boolean DEFAULT true)
 RETURNS cem_conversiones
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v public.cem_conversiones;
begin
  if not public.cem_puede_cobranza() then
    raise exception 'Sólo el personal de cobranza puede hacer esto.';
  end if;
  update public.cem_conversiones set eliminado = coalesce(p_eliminar, true)
   where id = p_id returning * into v;
  if v.id is null then raise exception 'Esa conversión no existe.'; end if;
  insert into public.cem_audit_events (accion, entidad, entidad_id, riesgo, detalle)
  values (case when p_eliminar then 'conversion_eliminada' else 'conversion_restaurada' end,
          'cem_conversiones', p_id, 'alto', to_jsonb(v));
  return v;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_embudo(p_dias integer DEFAULT 90)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_desde timestamptz := now() - make_interval(days => greatest(p_dias, 1));
  v_contactos int; v_cuentas int;
  v_inscritos int; v_abiertos int; v_empezaron int; v_mitad int; v_terminaron int;
begin
  if not cem_is_staff() then return jsonb_build_object('pasos', '[]'::jsonb); end if;

  select count(*) into v_contactos from cem_leads where created_at >= v_desde;
  select count(*) into v_cuentas from cem_profiles
   where created_at >= v_desde and rol = 'estudiante';

  select count(*) into v_inscritos from cem_enrollments
   where fecha_inscripcion >= v_desde and estado <> 'cancelada';

  select count(*) into v_abiertos from cem_enrollments e
   where e.fecha_inscripcion >= v_desde and e.estado <> 'cancelada'
     and cem_acceso_abierto(e.id);

  -- «Empezar» es haber completado al menos una lección. Abrir la pantalla no
  -- cuenta: quien entra, mira el título y se va no ha empezado nada.
  select count(*) into v_empezaron from cem_enrollments e
   where e.fecha_inscripcion >= v_desde and e.estado <> 'cancelada'
     and cem_acceso_abierto(e.id)
     and exists (select 1 from cem_lesson_progress lp
                  where lp.enrollment_id = e.id and lp.completado);

  select count(*) into v_mitad from cem_enrollments e
   where e.fecha_inscripcion >= v_desde and e.estado <> 'cancelada'
     and cem_acceso_abierto(e.id) and coalesce(e.progreso, 0) >= 50;

  select count(*) into v_terminaron from cem_enrollments e
   where e.fecha_inscripcion >= v_desde and e.estado <> 'cancelada'
     and cem_acceso_abierto(e.id) and coalesce(e.progreso, 0) >= 100;

  return jsonb_build_object(
    'pasos', jsonb_build_array(
      jsonb_build_object('etq', 'Se inscribieron', 'n', v_inscritos,
        'nota', 'Inscripciones del periodo, sin contar las canceladas.'),
      jsonb_build_object('etq', 'Se les abrió el curso', 'n', v_abiertos,
        'nota', 'Pagaron, o el programa era gratuito. Aquí es donde más dinero se pierde: ya habían elegido.'),
      jsonb_build_object('etq', 'Vieron su primera lección', 'n', v_empezaron,
        'nota', 'Quien paga y no empieza en dos semanas casi nunca termina.'),
      jsonb_build_object('etq', 'Pasaron de la mitad', 'n', v_mitad,
        'nota', 'A partir de aquí casi todos llegan al final.'),
      jsonb_build_object('etq', 'Terminaron el contenido', 'n', v_terminaron,
        'nota', 'Cien por cien del temario visto.')),
    -- Contexto, no escalones: son otra población y no contienen a la de abajo.
    'contexto', jsonb_build_object(
      'contactos', v_contactos,
      'cuentas_nuevas', v_cuentas,
      'nota', 'Los contactos de la web y las cuentas nuevas no son escalones de este embudo: '
            || 'mucha gente se inscribe sin dejar antes sus datos, y muchas cuentas no llegan a inscribirse. '
            || 'Del catálogo a la inscripción no se puede medir sin contar visitas, y no se cuentan.'));
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_emitir_certificado_modulo(p_enrollment_id uuid, p_module_id uuid, p_forzar boolean DEFAULT false, p_motivo text DEFAULT NULL::text)
 RETURNS cem_certificates
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_e cem_enrollments; v_m cem_modules; v_p cem_profiles; v_c cem_courses;
  v_cert cem_certificates; v_codigo text; v_intento int := 0; v_avance numeric;
  v_auto boolean := auth.uid() is null;   -- lo llamó el motor, no una persona
begin
  if not v_auto and not cem_is_staff() then
    raise exception 'Sólo el equipo puede emitir certificados.';
  end if;

  select * into v_e from cem_enrollments where id = p_enrollment_id;
  if v_e.id is null then raise exception 'Esa inscripción no existe.'; end if;
  select * into v_m from cem_modules where id = p_module_id;
  if v_m.id is null then raise exception 'Ese módulo no existe.'; end if;
  if v_m.course_id <> v_e.course_id then
    raise exception 'Ese módulo no es del programa en el que está inscrito.';
  end if;
  if not v_m.certifica then
    raise exception 'El módulo «%» no da certificado propio. Enciéndelo primero en el programa.', v_m.titulo;
  end if;

  -- Si ya lo tiene, se devuelve el que hay en vez de reventar: quien pulsa dos
  -- veces quiere el certificado, no un error.
  select * into v_cert from cem_certificates
   where enrollment_id = p_enrollment_id and module_id = p_module_id and anulado_en is null;
  if v_cert.id is not null then return v_cert; end if;

  v_avance := cem_modulo_avance(p_enrollment_id, p_module_id);
  if v_avance < 100 and not coalesce(p_forzar, false) then
    raise exception 'Lleva % %% de «%». Si aun así hay que emitirlo, hazlo como excepción explicando el motivo.',
      round(v_avance), v_m.titulo;
  end if;
  if v_avance < 100 and coalesce(trim(p_motivo), '') = '' then
    raise exception 'Para emitir sin terminar el módulo hay que explicar el motivo: queda asentado.';
  end if;

  select * into v_p from cem_profiles where id = v_e.profile_id;
  select * into v_c from cem_courses where id = v_e.course_id;

  loop
    v_intento := v_intento + 1;
    v_codigo := 'CEM-' || to_char(now(), 'YYYY') || '-' || lpad((floor(random() * 99999) + 1)::text, 5, '0');
    exit when not exists (select 1 from cem_certificates c where c.codigo = v_codigo);
    if v_intento > 50 then raise exception 'No se pudo generar un código único.'; end if;
  end loop;

  insert into cem_certificates(enrollment_id, profile_id, course_id, module_id,
                               codigo, titulo, tipo, datos)
  values (p_enrollment_id, v_e.profile_id, v_e.course_id, p_module_id, v_codigo,
          coalesce(nullif(trim(v_m.certificado_nombre), ''), v_m.titulo),
          'modulo',
          jsonb_build_object(
            'estudiante', trim(coalesce(v_p.nombre,'') || ' ' || coalesce(v_p.apellido,'')),
            'cedula', cem_formato_cedula(v_p.documento),
            'documento_tipo', coalesce(v_p.documento_tipo, ''),
            'curso', v_c.nombre,
            'modulo', v_m.titulo,
            'horas', v_m.horas,
            'profesor', (select nullif(trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,'')), '')
                           from cem_profiles pr where pr.id = v_m.profesor_id),
            'emision', to_char(now(), 'DD/MM/YYYY')))
  returning * into v_cert;

  insert into cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(),
          case when v_avance >= 100 then 'certificado_modulo_emitido'
               else 'certificado_modulo_emitido_excepcion' end,
          'cem_certificates', v_cert.id,
          case when v_avance >= 100 then 'medio' else 'alto' end,
          jsonb_build_object('codigo', v_codigo, 'modulo', v_m.titulo,
                             'avance', v_avance, 'automatico', v_auto,
                             'motivo', nullif(trim(coalesce(p_motivo,'')), '')));
  return v_cert;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_equivalente_en_base(p_monto numeric, p_metodo text, p_fecha date DEFAULT CURRENT_DATE)
 RETURNS TABLE(monto_base numeric, tasa numeric, tasa_moneda text, moneda_pago text, cartera_id text, regla text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m public.cem_metodos_pago;
  v_tasa numeric;
begin
  select * into m from public.cem_metodos_pago where metodo = p_metodo and activo;
  if m.metodo is null then
    raise exception 'No sé cómo convertir un pago hecho por «%». Configúralo en Configuración → Formas de pago.', coalesce(p_metodo,'(sin método)');
  end if;

  if m.regla = 'directo' then
    return query select round(p_monto, 2), 1::numeric, null::text, m.moneda, m.cartera_id, m.regla;

  elsif m.regla = 'uno_a_uno' then
    -- La regla de la casa: un dólar recibido salda un euro debido.
    return query select round(p_monto, 2), 1::numeric, null::text, m.moneda, m.cartera_id, m.regla;

  else
    -- Bolívares: se divide entre la tasa BCV de la moneda que diga la regla
    -- —el euro, en la CEM—, tomando la vigente al día del pago. Y con la misma
    -- jerarquía que arriba: si ese día la casa puso una tasa a mano, es esa.
    select t.valor into v_tasa
      from public.cem_tasas_bcv t
     where t.moneda = m.tasa_moneda and t.fecha <= coalesce(p_fecha, current_date)
     order by t.fecha desc, (t.id_tasa = 'MANUAL') desc, t.actualizado_en desc limit 1;

    if v_tasa is null or v_tasa <= 0 then
      raise exception 'No hay tasa BCV del % cargada para el %, así que no se puede convertir un pago en %. Cárgala en Verificar pagos.',
        m.tasa_moneda, coalesce(p_fecha, current_date), m.moneda;
    end if;
    return query select round(p_monto / v_tasa, 2), v_tasa, m.tasa_moneda, m.moneda, m.cartera_id, m.regla;
  end if;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_es_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from cem_profiles
                  where id = auth.uid() and activo
                    and rol in ('admin','superadmin'));
$function$
;
comment on function public.cem_es_admin() is 'Cambiar roles, borrar cursos y tocar la integración bancaria: sólo admin y superadmin.';

CREATE OR REPLACE FUNCTION public.cem_es_auditor()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from cem_profiles
                  where id = auth.uid() and activo and rol = 'auditor');
$function$
;
comment on function public.cem_es_auditor() is 'El auditor sólo lee. Una política restrictiva en cada tabla cem_* le impide escribir, aunque una pantalla se olvide de esconder el botón.';

CREATE OR REPLACE FUNCTION public.cem_es_correcta(p_tipo text, p_dada jsonb, p_clave jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare a text[]; b text[]; v_dada text;
begin
  -- Sin clave de respuesta no hay nada que comparar: eso lo lee una persona.
  if p_clave is null or p_clave = 'null'::jsonb then return null; end if;
  if p_tipo in ('ensayo', 'archivo') then return null; end if;

  v_dada := coalesce(p_dada #>> '{}', '');
  if p_dada is null or p_dada = 'null'::jsonb
     or (jsonb_typeof(p_dada) = 'string' and btrim(v_dada) = '')
     or (jsonb_typeof(p_dada) = 'array' and jsonb_array_length(p_dada) = 0) then
    return false;
  end if;

  if p_tipo = 'casillas' then
    if jsonb_typeof(p_dada) <> 'array' or jsonb_typeof(p_clave) <> 'array' then return false; end if;
    select array(select public.cem_texto_llano(x) from jsonb_array_elements_text(p_dada) x order by 1) into a;
    select array(select public.cem_texto_llano(x) from jsonb_array_elements_text(p_clave) x order by 1) into b;
    return a = b;
  end if;

  if p_tipo = 'cuadricula' then
    -- Se acierta la pregunta entera o no se acierta: cada fila tiene que cuadrar.
    return (select coalesce(bool_and(
              public.cem_texto_llano(p_dada ->> k) = public.cem_texto_llano(p_clave ->> k)), false)
            from jsonb_object_keys(p_clave) k);
  end if;

  if p_tipo = 'cuadricula_casillas' then
    return (select coalesce(bool_and(
              (select array(select public.cem_texto_llano(x)
                 from jsonb_array_elements_text(coalesce(p_dada -> k, '[]'::jsonb)) x order by 1))
              = (select array(select public.cem_texto_llano(x)
                 from jsonb_array_elements_text(coalesce(p_clave -> k, '[]'::jsonb)) x order by 1))
            ), false)
            from jsonb_object_keys(p_clave) k);
  end if;

  if p_tipo = 'corta' then
    -- La clave puede ser una lista: «Caracas», «caracas», «Ccs» valen igual.
    if jsonb_typeof(p_clave) = 'array' then
      return exists (select 1 from jsonb_array_elements_text(p_clave) x
                     where public.cem_texto_llano(x) = public.cem_texto_llano(v_dada));
    end if;
    return public.cem_texto_llano(p_clave #>> '{}') = public.cem_texto_llano(v_dada);
  end if;

  -- multiple, verdadero_falso, desplegable, escala, fecha, hora
  return p_dada = p_clave
      or public.cem_texto_llano(v_dada) = public.cem_texto_llano(p_clave #>> '{}');
end $function$
;
comment on function public.cem_es_correcta(p_tipo text, p_dada jsonb, p_clave jsonb) is 'Devuelve null cuando la pregunta no se puede corregir sola (ensayo, archivo o sin clave).';

CREATE OR REPLACE FUNCTION public.cem_es_servidor()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v text;
begin
  -- Fuera de una petición HTTP —una tarea de cron, psql— la configuración no
  -- existe y esto tiene que devolver falso, no reventar.
  begin
    v := current_setting('request.jwt.claims', true)::json->>'role';
  exception when others then return false; end;
  return coalesce(v, '') = 'service_role';
end $function$
;
comment on function public.cem_es_servidor() is 'Cierto sólo si la petición entró con la clave de servicio. No se concede a nadie: se usa dentro de otras funciones.';

CREATE OR REPLACE FUNCTION public.cem_esta_en_cohorte(p_cohort uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select public.cem_is_staff()
      or exists (select 1 from public.cem_enrollments e
                  where e.cohort_id = p_cohort and e.profile_id = auth.uid())
      or exists (select 1 from public.cem_teacher_assignments t
                  where t.cohort_id = p_cohort and t.teacher_id = auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.cem_estado_de_cuenta(p_enrollment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_e cem_enrollments; v_p cem_profiles; v_c cem_courses;
begin
  select * into v_e from cem_enrollments where id = p_enrollment_id;
  if v_e.id is null then raise exception 'No encontramos esa inscripción.'; end if;
  if v_e.profile_id <> auth.uid() and not (cem_is_staff() or cem_puede_cobranza()) then
    raise exception 'Sólo puedes ver tu propio estado de cuenta.';
  end if;
  select * into v_p from cem_profiles where id = v_e.profile_id;
  select * into v_c from cem_courses where id = v_e.course_id;

  return jsonb_build_object(
    'emitido_en', to_char(now(), 'DD/MM/YYYY HH24:MI'),
    'estudiante', jsonb_build_object(
      'nombre', trim(coalesce(v_p.nombre,'') || ' ' || coalesce(v_p.apellido,'')),
      'documento', cem_formato_cedula(v_p.documento),
      'email', v_p.email),
    'programa', jsonb_build_object(
      'nombre', v_c.nombre, 'codigo', v_c.codigo,
      'estado_inscripcion', v_e.estado, 'desde', to_char(v_e.fecha_inscripcion, 'DD/MM/YYYY')),
    'totales', jsonb_build_object(
      'precio_lista', v_e.precio_lista, 'descuento', v_e.descuento,
      'precio_final', v_e.precio_final, 'moneda', coalesce(v_e.moneda, 'USD'),
      'pagado', coalesce((select sum(p.monto) from cem_payments p
                           where p.enrollment_id = p_enrollment_id
                             and p.estado in ('confirmado','registrado')), 0),
      'saldo', coalesce((select sum(coalesce(i.saldo, i.monto)) from cem_installments i
                          where i.enrollment_id = p_enrollment_id
                            and i.estado in ('pendiente','parcial','vencida')), 0)),
    'cuotas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'numero', i.numero, 'monto', i.monto, 'saldo', coalesce(i.saldo, i.monto),
               'moneda', i.moneda, 'vence', to_char(i.fecha_vencimiento, 'DD/MM/YYYY'),
               'estado', i.estado) order by i.numero)
        from cem_installments i where i.enrollment_id = p_enrollment_id), '[]'::jsonb),
    'pagos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fecha', to_char(p.fecha, 'DD/MM/YYYY'), 'monto', p.monto, 'moneda', p.moneda,
               'tasa', p.tasa, 'monto_base', p.monto_base,
               'metodo', p.metodo, 'referencia', p.referencia, 'estado', p.estado)
             order by p.fecha)
        from cem_payments p where p.enrollment_id = p_enrollment_id
          and p.estado <> 'anulado'), '[]'::jsonb)
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_evaluar_insignias(p_profile_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_perfil uuid := coalesce(p_profile_id, auth.uid());
        v_otorgadas integer := 0; b record; v_cumple boolean; v_n numeric;
begin
  if v_perfil is null then return 0; end if;
  -- Nadie evalúa las insignias de otro salvo el personal.
  if v_perfil <> auth.uid() and not cem_is_staff() then
    raise exception 'Sólo el personal autorizado puede revisar las insignias de otra persona.';
  end if;

  for b in select * from cem_badges where activo and nullif(regla, '') is not null loop
    if exists (select 1 from cem_badge_awards
                where badge_id = b.id and profile_id = v_perfil) then
      continue;
    end if;

    v_cumple := case b.regla
      when 'curso_completado' then exists (
        select 1 from cem_enrollments
         where profile_id = v_perfil and (estado = 'finalizada' or progreso >= 100)
           and (b.regla_curso is null or course_id = b.regla_curso))

      when 'primer_certificado' then exists (
        select 1 from cem_certificates c
         where c.profile_id = v_perfil and c.anulado_en is null
           and (b.regla_curso is null or c.course_id = b.regla_curso))

      when 'sin_entregas_tarde' then (
        select count(*) filter (where s.tarde) = 0
               and count(*) >= coalesce(b.regla_valor, 3)
          from cem_submissions s
          join cem_enrollments e on e.id = s.enrollment_id
         where e.profile_id = v_perfil and s.entregado_en is not null
           and (b.regla_curso is null or e.course_id = b.regla_curso))

      when 'al_dia_con_pagos' then (
        (select count(*) = 0
           from cem_installments i
           join cem_enrollments e on e.id = i.enrollment_id
          where e.profile_id = v_perfil and i.estado = 'vencida'
            and (b.regla_curso is null or e.course_id = b.regla_curso))
        and exists (select 1 from cem_installments i2
                     join cem_enrollments e2 on e2.id = i2.enrollment_id
                    where e2.profile_id = v_perfil and i2.estado = 'pagada'
                      and (b.regla_curso is null or e2.course_id = b.regla_curso)))

      when 'promedio_excelente' then (
        select coalesce(avg(s.puntaje), 0) >= coalesce(b.regla_valor, 90)
               and count(*) >= 3
          from cem_submissions s
          join cem_enrollments e on e.id = s.enrollment_id
         where e.profile_id = v_perfil and s.estado = 'calificada'
           and (b.regla_curso is null or e.course_id = b.regla_curso))

      /* Nueva. Existía escrita en el criterio —«asistir a más del 90% de las
         sesiones»— pero no había regla que la mirara, así que esa insignia sólo
         se daba a mano. Se pide un mínimo de cinco clases registradas: con dos
         asistencias de dos, un 100% no dice nada. */
      when 'asistencia_alta' then (
        select count(*) >= 5
               and 100.0 * count(*) filter (where a.presente) / greatest(count(*), 1)
                   >= coalesce(b.regla_valor, 90)
          from cem_attendance a
          join cem_enrollments e on e.id = a.enrollment_id
         where e.profile_id = v_perfil
           and (b.regla_curso is null or e.course_id = b.regla_curso))

      /* Nueva. «Aprobó N evaluaciones», que es la forma más común de reconocer
         un avance real sin esperar a que el programa entero termine. */
      when 'evaluaciones_aprobadas' then (
        select count(*) >= coalesce(b.regla_valor, 5)
          from cem_submissions s
          join cem_enrollments e on e.id = s.enrollment_id
          join cem_assessments t on t.id = s.assessment_id
         where e.profile_id = v_perfil and s.estado = 'calificada'
           and s.puntaje >= coalesce(t.nota_aprobatoria, 70)
           and (b.regla_curso is null or e.course_id = b.regla_curso))

      else false
    end;

    if v_cumple then
      insert into cem_badge_awards (badge_id, profile_id, otorgado_en)
      values (b.id, v_perfil, now())
      on conflict do nothing;
      if found then
        perform cem_notificar(v_perfil, 'insignia',
          format('Ganaste la insignia "%s"', b.nombre),
          coalesce(b.descripcion, 'Entra a tu panel para verla.'),
          'estudiante/panel.html', false);
        v_otorgadas := v_otorgadas + 1;
      end if;
    end if;
  end loop;

  return v_otorgadas;
end $function$
;
comment on function public.cem_evaluar_insignias(p_profile_id uuid) is 'Otorga las insignias cuyo criterio ya cumple la persona. Criterios: curso_completado, primer_certificado, sin_entregas_tarde, al_dia_con_pagos, promedio_excelente.';

CREATE OR REPLACE FUNCTION public.cem_evaluar_insignias_todos()
 RETURNS TABLE(personas integer, otorgadas integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_p uuid; v_total integer := 0; v_gente integer := 0;
begin
  if not cem_is_staff() then
    raise exception 'Sólo el equipo puede repasar las insignias de todo el mundo.';
  end if;
  for v_p in select distinct e.profile_id from cem_enrollments e
              where e.estado not in ('cancelada') loop
    v_gente := v_gente + 1;
    v_total := v_total + cem_evaluar_insignias(v_p);
  end loop;
  insert into cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'insignias_repaso', 'cem_badges', null, 'bajo',
          jsonb_build_object('personas', v_gente, 'otorgadas', v_total));
  return query select v_gente, v_total;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_exam_questions(p_assessment_id uuid)
 RETURNS TABLE(question_id uuid, orden integer, puntaje numeric, enunciado text, ayuda text, tipo text, opciones jsonb, config jsonb, obligatoria boolean, barajar_opciones boolean, seccion text, seccion_desc text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_a public.cem_assessments; v_enr uuid;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
  select * into v_a from public.cem_assessments a where a.id = p_assessment_id;
  if v_a.id is null then raise exception 'Evaluación no encontrada.'; end if;

  if not (public.cem_can_read_all() or public.cem_is_teacher()) then
    select e.id into v_enr from public.cem_enrollments e
     where e.profile_id = auth.uid() and e.course_id = v_a.course_id
       and e.estado not in ('cancelada')
     order by e.created_at desc limit 1;
    if v_enr is null then
      raise exception 'No estás inscrito en este programa.';
    end if;
    -- LO NUEVO: estar inscrito no basta. Hace falta haber pagado.
    if not public.cem_acceso_abierto(v_enr) then
      raise exception 'Tu inscripción está pendiente de pago. En cuanto se confirme el primer pago se abre el acceso.';
    end if;
    if v_a.estado is distinct from 'publicado' then
      raise exception 'Esa evaluación todavía no está disponible.';
    end if;
    if v_a.abre_en is not null and now() < v_a.abre_en then
      raise exception 'Esta evaluación abre el %.', to_char(v_a.abre_en, 'DD/MM/YYYY HH24:MI');
    end if;
    if v_a.cierra_en is not null and now() > v_a.cierra_en + interval '1 day' then
      raise exception 'El plazo para esta evaluación ya cerró.';
    end if;
  end if;

  return query
    select q.id, aq.orden, aq.puntaje, q.enunciado, q.ayuda, q.tipo::text, q.opciones,
           q.config, q.obligatoria, q.barajar_opciones, aq.seccion, aq.seccion_desc
    from public.cem_assessment_questions aq
    join public.cem_questions q on q.id = aq.question_id
    where aq.assessment_id = p_assessment_id
    order by case when coalesce(v_a.barajar, false)
                   and not exists (select 1 from public.cem_assessment_questions s
                                    where s.assessment_id = p_assessment_id and s.seccion is not null)
                  then md5(q.id::text || auth.uid()::text)
                  else lpad(aq.orden::text, 6, '0') end;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_expediente(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v public.cem_profiles;
  v_inscripciones jsonb; v_cuotas jsonb; v_pagos jsonb;
  v_entregas jsonb; v_certs jsonb; v_insignias jsonb; v_asistencia jsonb;
  v_linea jsonb;
begin
  if not (public.cem_is_staff() or auth.uid() = p_profile_id) then
    raise exception 'Sin permiso para ver este expediente.';
  end if;

  select * into v from public.cem_profiles where id = p_profile_id;
  if v.id is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'estado', e.estado, 'progreso', e.progreso,
           'nota_final', e.nota_final, 'precio_final', e.precio_final,
           'moneda', e.moneda, 'inscrito_en', e.fecha_inscripcion,
           'ultimo_acceso', e.ultimo_acceso,
           'curso', cur.nombre, 'course_id', cur.id, 'horas', cur.horas,
           'modalidad', cur.modalidad, 'cohorte', coh.nombre
         ) order by e.fecha_inscripcion desc), '[]'::jsonb)
    into v_inscripciones
    from public.cem_enrollments e
    left join public.cem_courses cur on cur.id = e.course_id
    left join public.cem_cohorts coh on coh.id = e.cohort_id
   where e.profile_id = p_profile_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', i.id, 'numero', i.numero, 'monto', i.monto, 'saldo', i.saldo,
           'moneda', i.moneda, 'estado', i.estado, 'vence', i.fecha_vencimiento,
           'enrollment_id', i.enrollment_id
         ) order by i.fecha_vencimiento), '[]'::jsonb)
    into v_cuotas
    from public.cem_installments i
    join public.cem_enrollments e on e.id = i.enrollment_id
   where e.profile_id = p_profile_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', pa.id, 'fecha', pa.fecha, 'monto', pa.monto, 'moneda', pa.moneda,
           'monto_base', pa.monto_base, 'estado', pa.estado,
           'referencia', pa.referencia, 'metodo', pa.metodo
         ) order by pa.fecha desc), '[]'::jsonb)
    into v_pagos
    from public.cem_payments pa
    join public.cem_enrollments e on e.id = pa.enrollment_id
   where e.profile_id = p_profile_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'evaluacion', a.nombre, 'tipo', a.tipo,
           'puntaje', s.puntaje, 'maximo', a.puntaje_max,
           'aprueba_con', a.nota_aprobatoria, 'estado', s.estado,
           'intento', s.intento, 'entregado_en', s.entregado_en
         ) order by s.entregado_en desc nulls last), '[]'::jsonb)
    into v_entregas
    from public.cem_submissions s
    join public.cem_assessments a on a.id = s.assessment_id
    join public.cem_enrollments e on e.id = s.enrollment_id
   where e.profile_id = p_profile_id;

  select jsonb_build_object(
           'total', count(*),
           'presente', count(*) filter (where att.presente),
           'ultima', max(cl.fecha))
    into v_asistencia
    from public.cem_attendance att
    join public.cem_enrollments e on e.id = att.enrollment_id
    left join public.cem_classes cl on cl.id = att.class_id
   where e.profile_id = p_profile_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'codigo', c.codigo, 'titulo', c.titulo, 'tipo', c.tipo,
           'emitido_en', c.emitido_en, 'anulado_en', c.anulado_en,
           'anulado_motivo', c.anulado_motivo
         ) order by c.emitido_en desc), '[]'::jsonb)
    into v_certs
    from public.cem_certificates c where c.profile_id = p_profile_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'nombre', b.nombre, 'nivel', b.nivel, 'icono', b.icono,
           'otorgado_en', aw.otorgado_en) order by aw.otorgado_en desc), '[]'::jsonb)
    into v_insignias
    from public.cem_badge_awards aw
    join public.cem_badges b on b.id = aw.badge_id
   where aw.profile_id = p_profile_id;

  select coalesce(jsonb_agg(t order by t->>'cuando' desc), '[]'::jsonb) into v_linea
  from (
    select jsonb_build_object('cuando', e.fecha_inscripcion, 'tipo', 'inscripcion',
             'titulo', 'Se inscribió en ' || coalesce(cur.nombre, 'un programa'),
             'detalle', coalesce(coh.nombre, '')) as t
      from public.cem_enrollments e
      left join public.cem_courses cur on cur.id = e.course_id
      left join public.cem_cohorts coh on coh.id = e.cohort_id
     where e.profile_id = p_profile_id and e.fecha_inscripcion is not null
    union all
    select jsonb_build_object('cuando', pa.fecha, 'tipo',
             case pa.estado when 'confirmado' then 'pago_ok'
                            when 'rechazado' then 'pago_no' else 'pago' end,
             'titulo', case pa.estado
                         when 'confirmado' then 'Pago aprobado'
                         when 'rechazado'  then 'Pago rechazado'
                         else 'Pago reportado' end,
             'detalle', coalesce(pa.referencia, ''), 'monto', pa.monto, 'moneda', pa.moneda)
      from public.cem_payments pa
      join public.cem_enrollments e on e.id = pa.enrollment_id
     where e.profile_id = p_profile_id and pa.fecha is not null
    union all
    select jsonb_build_object('cuando', s.entregado_en, 'tipo',
             case when s.estado::text = 'calificada' then 'nota' else 'entrega' end,
             'titulo', case when s.estado::text = 'calificada'
                            then 'Calificado en ' || a.nombre
                            else 'Entregó ' || a.nombre end,
             'detalle', case when s.puntaje is null then ''
                             else s.puntaje::text || ' / ' || coalesce(a.puntaje_max, 100)::text end)
      from public.cem_submissions s
      join public.cem_assessments a on a.id = s.assessment_id
      join public.cem_enrollments e on e.id = s.enrollment_id
     where e.profile_id = p_profile_id and s.entregado_en is not null
    union all
    select jsonb_build_object('cuando', c.emitido_en, 'tipo', 'certificado',
             'titulo', 'Certificado emitido', 'detalle', c.titulo)
      from public.cem_certificates c
     where c.profile_id = p_profile_id and c.emitido_en is not null
    union all
    select jsonb_build_object('cuando', aw.otorgado_en, 'tipo', 'insignia',
             'titulo', 'Obtuvo la insignia ' || b.nombre, 'detalle', coalesce(b.nivel, ''))
      from public.cem_badge_awards aw
      join public.cem_badges b on b.id = aw.badge_id
     where aw.profile_id = p_profile_id and aw.otorgado_en is not null
  ) s;

  return jsonb_build_object(
    'perfil', jsonb_build_object(
      'id', v.id, 'nombre', v.nombre, 'apellido', v.apellido, 'email', v.email,
      'telefono', v.telefono, 'documento_tipo', v.documento_tipo,
      'documento', v.documento, 'pais', v.pais, 'ciudad', v.ciudad,
      'avatar_url', v.avatar_url, 'activo', v.activo, 'desde', v.created_at,
      'perfil_publico', v.perfil_publico, 'perfil_slug', v.perfil_slug),
    'inscripciones', v_inscripciones,
    'cuotas', v_cuotas,
    'pagos', v_pagos,
    'entregas', v_entregas,
    'asistencia', v_asistencia,
    'certificados', v_certs,
    'insignias', v_insignias,
    'linea', v_linea);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_extracto_cargar(p_movimientos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m jsonb; v_ref text; v_puestos int := 0; v_repetidos int := 0; v_malos int := 0;
begin
  if not cem_puede_cobranza() then raise exception 'No autorizado.'; end if;
  if jsonb_typeof(p_movimientos) <> 'array' then
    raise exception 'Los movimientos tienen que venir como una lista.';
  end if;
  if jsonb_array_length(p_movimientos) > 1000 then
    raise exception 'Son demasiados movimientos de golpe: sube el extracto por meses.';
  end if;

  for m in select * from jsonb_array_elements(p_movimientos) loop
    v_ref := nullif(btrim(coalesce(m->>'referencia', '')), '');

    -- Sin referencia y sin importe no hay movimiento que conciliar.
    if v_ref is null or coalesce((m->>'monto')::numeric, 0) <= 0 then
      v_malos := v_malos + 1;
      continue;
    end if;

    -- Cargar el mismo extracto dos veces es lo normal —se corrige una fila y
    -- se vuelve a subir—, así que repetir una referencia no duplica nada.
    if exists (select 1 from cem_bancaribe_notificaciones
                where coalesce(origin_bank_reference, destiny_bank_reference) = v_ref) then
      v_repetidos := v_repetidos + 1;
      continue;
    end if;

    insert into cem_bancaribe_notificaciones (
      amount, currency_code, bank_name, origin_bank_reference,
      debtor_id, client_phone, fecha_banco, payment_type, estado, nota, payload)
    values (
      (m->>'monto')::numeric,
      coalesce(nullif(m->>'moneda', ''), 'VES'),
      nullif(m->>'banco', ''),
      v_ref,
      nullif(m->>'documento', ''),
      nullif(m->>'telefono', ''),
      nullif(m->>'fecha', ''),
      'extracto',
      'pendiente',
      'Cargado a mano desde el extracto.',
      m);
    v_puestos := v_puestos + 1;
  end loop;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, riesgo, detalle)
  values (auth.uid(), (select email from cem_profiles where id = auth.uid()),
          'extracto_cargado', 'cem_bancaribe_notificaciones', 'medio',
          jsonb_build_object('puestos', v_puestos, 'repetidos', v_repetidos, 'sin_datos', v_malos));

  return jsonb_build_object('puestos', v_puestos, 'repetidos', v_repetidos, 'sin_datos', v_malos);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_extracto_quitar(p_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n integer := 0;
begin
  if not cem_puede_cobranza() then raise exception 'No autorizado.'; end if;
  delete from cem_bancaribe_notificaciones
   where id = any(coalesce(p_ids, '{}'::uuid[]))
     and payment_type = 'extracto'
     and payment_id is null;
  get diagnostics v_n = row_count;
  return v_n;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_fecha_nacimiento_creible()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare v_edad int;
begin
  if new.fecha_nacimiento is null then return new; end if;
  -- Al actualizar, sólo molesta si la fecha es justo lo que cambia. Así una
  -- fila que ya venía mal no queda congelada para siempre.
  if tg_op = 'UPDATE' and new.fecha_nacimiento is not distinct from old.fecha_nacimiento then
    return new;
  end if;

  v_edad := extract(year from age(current_date, new.fecha_nacimiento));
  if new.fecha_nacimiento >= current_date then
    raise exception 'La fecha de nacimiento es del futuro. Revisa el año.';
  end if;
  if v_edad < 14 then
    raise exception 'Con esa fecha la edad sería % año(s). Revisa el año.', v_edad;
  end if;
  if v_edad > 100 then
    raise exception 'Con esa fecha la edad sería % años. Revisa el año.', v_edad;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_formato_cedula(p_valor text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
declare v text; v_prefijo text; v_digitos text;
begin
  v := btrim(coalesce(p_valor,''));
  if v = '' then return null; end if;

  -- prefijo = todo lo que aparece antes del primer digito (letras, guion, espacio)
  v_prefijo := (regexp_match(v, '^([^0-9]*)'))[1];
  v_digitos := regexp_replace(v, '[^0-9]', '', 'g');

  if v_digitos = '' then return v; end if;   -- sin digitos: se respeta tal cual

  return btrim(v_prefijo) ||
         reverse(regexp_replace(reverse(v_digitos), '(\d{3})(?=\d)', '\1.', 'g'));
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_gasto_clasificar(p_id uuid, p_linea text DEFAULT NULL::text, p_reparto jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not cem_es_admin() then
    raise exception 'Sólo la dirección puede clasificar gastos por línea de negocio.';
  end if;
  if p_linea is not null and p_reparto is not null then
    raise exception 'O es de una línea, o se reparte entre varias. Las dos cosas a la vez no significan nada.';
  end if;
  update cem_gastos
     set linea = nullif(p_linea, '')::cem_course_tipo, reparto = p_reparto
   where id = p_id and not coalesce(eliminado, false);
  if not found then raise exception 'Ese gasto ya no está.'; end if;

  insert into cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'gasto_clasificado', 'cem_gastos', p_id, 'medio',
          jsonb_build_object('linea', p_linea, 'reparto', p_reparto));
  return jsonb_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_gastos_completar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v record;
begin
  if new.monto_base is null and new.monto is not null then
    select * into v from cem_a_base(new.monto, coalesce(new.moneda,'EUR'),
                                    coalesce(new.fecha, current_date));
    new.monto_base := v.monto_base;
    new.tasa       := coalesce(new.tasa, v.tasa);
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_grade_submission(p_submission_id uuid, p_puntaje numeric, p_feedback text DEFAULT NULL::text)
 RETURNS cem_submissions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sub cem_submissions;
begin
  if not (cem_is_staff() or cem_is_teacher()) then raise exception 'No autorizado.'; end if;
  update cem_submissions set puntaje = p_puntaje, feedback = p_feedback,
    estado = 'calificada', calificado_por = auth.uid(), calificado_en = now()
  where id = p_submission_id returning * into v_sub;
  insert into cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'calificacion_registrada', 'cem_submissions', p_submission_id, 'medio',
          jsonb_build_object('puntaje', p_puntaje));
  return v_sub;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_guardar_conversion(p_cartera_origen text, p_cartera_destino text, p_monto_origen numeric, p_monto_destino numeric, p_fecha date DEFAULT CURRENT_DATE, p_estado text DEFAULT 'completada'::text, p_nota text DEFAULT NULL::text, p_id uuid DEFAULT NULL::uuid)
 RETURNS cem_conversiones
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v public.cem_conversiones;
  v_tasa numeric;
begin
  if not public.cem_puede_cobranza() then
    raise exception 'Sólo el personal de cobranza puede mover dinero entre carteras.';
  end if;
  if p_cartera_destino is null then
    raise exception 'Falta decir a qué cartera entra el dinero.';
  end if;
  -- Un ajuste sin explicación es un saldo cambiado a mano sin dejar rastro.
  if p_cartera_origen is null and coalesce(btrim(p_nota),'') = '' then
    raise exception 'Un ajuste necesita una nota que explique por qué se hace.';
  end if;
  if p_cartera_origen is not null and (coalesce(p_monto_origen,0) <= 0 or coalesce(p_monto_destino,0) <= 0) then
    raise exception 'Hay que escribir los dos montos: lo que salió y lo que de verdad llegó.';
  end if;

  -- La tasa se deja anotada, pero es un dato histórico: los saldos salen de
  -- los montos, no de multiplicar por ella.
  v_tasa := case when coalesce(p_monto_destino,0) <> 0 and coalesce(p_monto_origen,0) <> 0
                 then round(p_monto_destino / p_monto_origen, 6) end;

  if p_id is null then
    insert into public.cem_conversiones (fecha, cartera_origen, cartera_destino,
      monto_origen, monto_destino, tasa, estado, nota, creado_por)
    values (coalesce(p_fecha, current_date), p_cartera_origen, p_cartera_destino,
      p_monto_origen, p_monto_destino, v_tasa, coalesce(p_estado,'completada'),
      nullif(btrim(coalesce(p_nota,'')),''), auth.uid())
    returning * into v;
  else
    update public.cem_conversiones set
      fecha = coalesce(p_fecha, fecha), cartera_origen = p_cartera_origen,
      cartera_destino = p_cartera_destino, monto_origen = p_monto_origen,
      monto_destino = p_monto_destino, tasa = v_tasa,
      estado = coalesce(p_estado, estado), nota = nullif(btrim(coalesce(p_nota,'')),'')
    where id = p_id returning * into v;
    if v.id is null then raise exception 'Esa conversión ya no existe.'; end if;
  end if;

  insert into public.cem_audit_events (accion, entidad, entidad_id, riesgo, detalle)
  values (case when p_id is null then 'conversion_creada' else 'conversion_editada' end,
          'cem_conversiones', v.id, 'alto', to_jsonb(v));
  return v;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_guardar_evaluacion(p_id uuid, p_datos jsonb, p_preguntas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id uuid := p_id;
  v_estado public.cem_pub_estado := coalesce(nullif(p_datos->>'estado','')::public.cem_pub_estado, 'borrador');
  v_max numeric := coalesce(nullif(p_datos->>'puntaje_max','')::numeric, 100);
  v_curso uuid := nullif(p_datos->>'course_id','')::uuid;
  v_suma numeric := 0;
  v_n int := coalesce(jsonb_array_length(p_preguntas), 0);
  q jsonb; v_qid uuid; i int := 0;
begin
  if not (cem_is_staff() or cem_is_teacher()) then
    raise exception 'No tienes permiso para editar evaluaciones.';
  end if;
  if coalesce(btrim(p_datos->>'nombre'), '') = '' then
    raise exception 'La evaluación necesita un nombre.';
  end if;
  if v_curso is null then
    raise exception 'Falta indicar a qué programa pertenece la evaluación.';
  end if;
  if v_max <= 0 then
    raise exception 'El puntaje total tiene que ser mayor que cero.';
  end if;

  select coalesce(sum(coalesce(nullif(x->>'puntaje','')::numeric, 0)), 0) into v_suma
    from jsonb_array_elements(coalesce(p_preguntas, '[]'::jsonb)) x;

  -- LA regla: una evaluación sobre 100 tiene que repartir exactamente 100.
  -- Se comprueba aquí y no en la pantalla, porque la pantalla se puede saltar.
  -- En borrador se deja a medias a propósito: se está construyendo.
  if v_estado = 'publicado' then
    if v_n = 0 then
      raise exception 'No se puede publicar una evaluación sin preguntas.';
    end if;
    if round(v_suma, 2) <> round(v_max, 2) then
      raise exception 'Los puntajes suman % y la evaluación es sobre %. %',
        round(v_suma, 2), round(v_max, 2),
        case when v_suma < v_max
             then 'Faltan ' || round(v_max - v_suma, 2) || ' puntos por repartir.'
             else 'Sobran ' || round(v_suma - v_max, 2) || ' puntos.' end;
    end if;
  end if;

  if v_id is null then
    insert into cem_assessments (course_id, module_id, nombre, descripcion, tipo, puntaje_max,
      tiempo_min, intentos, barajar, nota_aprobatoria, estado, abre_en, cierra_en,
      una_por_pagina, mostrar_correctas, mensaje_final, rubrica)
    values (v_curso, nullif(p_datos->>'module_id','')::uuid, btrim(p_datos->>'nombre'),
      nullif(btrim(coalesce(p_datos->>'descripcion','')), ''),
      coalesce(nullif(p_datos->>'tipo','')::public.cem_evaluacion_tipo, 'examen'), v_max,
      nullif(p_datos->>'tiempo_min','')::int, coalesce(nullif(p_datos->>'intentos','')::int, 1),
      coalesce((p_datos->>'barajar')::boolean, false),
      coalesce(nullif(p_datos->>'nota_aprobatoria','')::numeric, 70), v_estado,
      nullif(p_datos->>'abre_en','')::timestamptz, nullif(p_datos->>'cierra_en','')::timestamptz,
      coalesce((p_datos->>'una_por_pagina')::boolean, false),
      coalesce((p_datos->>'mostrar_correctas')::boolean, false),
      nullif(btrim(coalesce(p_datos->>'mensaje_final','')), ''),
      coalesce(p_datos->'rubrica', '[]'::jsonb))
    returning id into v_id;
  else
    update cem_assessments set
      course_id = v_curso, module_id = nullif(p_datos->>'module_id','')::uuid,
      nombre = btrim(p_datos->>'nombre'),
      descripcion = nullif(btrim(coalesce(p_datos->>'descripcion','')), ''),
      tipo = coalesce(nullif(p_datos->>'tipo','')::public.cem_evaluacion_tipo, 'examen'),
      puntaje_max = v_max, tiempo_min = nullif(p_datos->>'tiempo_min','')::int,
      intentos = coalesce(nullif(p_datos->>'intentos','')::int, 1),
      barajar = coalesce((p_datos->>'barajar')::boolean, false),
      nota_aprobatoria = coalesce(nullif(p_datos->>'nota_aprobatoria','')::numeric, 70),
      estado = v_estado,
      abre_en = nullif(p_datos->>'abre_en','')::timestamptz,
      cierra_en = nullif(p_datos->>'cierra_en','')::timestamptz,
      una_por_pagina = coalesce((p_datos->>'una_por_pagina')::boolean, false),
      mostrar_correctas = coalesce((p_datos->>'mostrar_correctas')::boolean, false),
      mensaje_final = nullif(btrim(coalesce(p_datos->>'mensaje_final','')), ''),
      rubrica = coalesce(p_datos->'rubrica', '[]'::jsonb)
    where id = v_id;
    if not found then raise exception 'Esa evaluación ya no existe.'; end if;
  end if;

  delete from cem_assessment_questions where assessment_id = v_id;

  for q in select value from jsonb_array_elements(coalesce(p_preguntas, '[]'::jsonb)) loop
    i := i + 1;
    if coalesce(btrim(q->>'enunciado'), '') = '' then
      raise exception 'La pregunta % está sin enunciado.', i;
    end if;
    v_qid := nullif(q->>'id','')::uuid;

    -- Las preguntas escritas dentro del editor entran igual al banco: así se
    -- pueden reutilizar y sus estadísticas se acumulan con las demás.
    if v_qid is not null and exists (select 1 from cem_questions where id = v_qid) then
      update cem_questions set
        enunciado = btrim(q->>'enunciado'),
        ayuda = nullif(btrim(coalesce(q->>'ayuda','')), ''),
        tipo = coalesce(nullif(q->>'tipo','')::public.cem_pregunta_tipo, 'multiple'),
        dificultad = coalesce(nullif(q->>'dificultad','')::public.cem_dificultad, 'media'),
        opciones = coalesce(q->'opciones', '[]'::jsonb),
        respuesta_correcta = case when q->'respuesta_correcta' = 'null'::jsonb
                                  then null else q->'respuesta_correcta' end,
        explicacion = nullif(btrim(coalesce(q->>'explicacion','')), ''),
        config = coalesce(q->'config', '{}'::jsonb),
        obligatoria = coalesce((q->>'obligatoria')::boolean, true),
        barajar_opciones = coalesce((q->>'barajar_opciones')::boolean, false),
        course_id = coalesce(nullif(q->>'course_id','')::uuid, v_curso),
        module_id = nullif(q->>'module_id','')::uuid,
        carpeta = nullif(btrim(coalesce(q->>'carpeta','')), '')
      where id = v_qid;
    else
      insert into cem_questions (course_id, module_id, carpeta, enunciado, ayuda, tipo, dificultad,
        opciones, respuesta_correcta, explicacion, config, obligatoria, barajar_opciones)
      values (coalesce(nullif(q->>'course_id','')::uuid, v_curso),
        nullif(q->>'module_id','')::uuid, nullif(btrim(coalesce(q->>'carpeta','')), ''),
        btrim(q->>'enunciado'), nullif(btrim(coalesce(q->>'ayuda','')), ''),
        coalesce(nullif(q->>'tipo','')::public.cem_pregunta_tipo, 'multiple'),
        coalesce(nullif(q->>'dificultad','')::public.cem_dificultad, 'media'),
        coalesce(q->'opciones', '[]'::jsonb),
        case when q->'respuesta_correcta' = 'null'::jsonb then null else q->'respuesta_correcta' end,
        nullif(btrim(coalesce(q->>'explicacion','')), ''),
        coalesce(q->'config', '{}'::jsonb),
        coalesce((q->>'obligatoria')::boolean, true),
        coalesce((q->>'barajar_opciones')::boolean, false))
      returning id into v_qid;
    end if;

    insert into cem_assessment_questions (assessment_id, question_id, orden, puntaje, seccion, seccion_desc)
    values (v_id, v_qid, i, coalesce(nullif(q->>'puntaje','')::numeric, 0),
      nullif(btrim(coalesce(q->>'seccion','')), ''),
      nullif(btrim(coalesce(q->>'seccion_desc','')), ''));
  end loop;

  insert into cem_audit_events (actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), case when p_id is null then 'evaluacion_creada' else 'evaluacion_actualizada' end,
    'cem_assessments', v_id, 'medio',
    jsonb_build_object('nombre', p_datos->>'nombre', 'estado', v_estado,
                       'preguntas', v_n, 'puntos', round(v_suma, 2)));

  return jsonb_build_object('id', v_id, 'total', round(v_suma, 2), 'maximo', round(v_max, 2),
                            'preguntas', v_n, 'estado', v_estado);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_guardar_playlist(p_course_id uuid, p_playlist text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (cem_is_staff() or cem_is_teacher()) then
    raise exception 'No puedes tocar el contenido de este curso.' using errcode = '42501';
  end if;
  -- Se acepta pegar la URL entera, que es lo que la gente copia de la barra de
  -- direcciones. Se queda con el identificador.
  p_playlist := coalesce(
    substring(coalesce(p_playlist,'') from '[?&]list=([A-Za-z0-9_-]+)'),
    nullif(trim(p_playlist), ''));
  if p_playlist is not null and p_playlist !~ '^[A-Za-z0-9_-]{10,}$' then
    raise exception 'Eso no parece una lista de reproducción. Pega la dirección de la lista o su identificador (empieza por PL).';
  end if;

  update cem_courses set youtube_playlist = p_playlist where id = p_course_id;
  return cem_curso_lecciones_de_video(p_course_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_guardar_tasa_manual(p_valor numeric, p_fecha date DEFAULT CURRENT_DATE)
 RETURNS cem_tasas_bcv
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.cem_tasas_bcv;
begin
  if not public.cem_puede_cobranza() then
    raise exception 'Sólo el personal autorizado puede cargar la tasa del día.';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'La tasa debe ser un número mayor que cero.';
  end if;
  insert into public.cem_tasas_bcv (id_tasa, valor, descripcion, fecha, actualizado_en)
  values ('MANUAL', p_valor, 'Cargada a mano', coalesce(p_fecha, current_date), now())
  on conflict (id_tasa, fecha) do update
    set valor = excluded.valor, descripcion = excluded.descripcion, actualizado_en = now()
  returning * into r;
  return r;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_guardar_tasa_manual(p_valor numeric, p_fecha date DEFAULT CURRENT_DATE, p_moneda text DEFAULT 'EUR'::text)
 RETURNS cem_tasas_bcv
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v public.cem_tasas_bcv;
begin
  if not public.cem_puede_cobranza() then
    raise exception 'Sólo el personal de cobranza puede cargar la tasa.';
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'La tasa tiene que ser mayor que cero.';
  end if;
  if coalesce(p_moneda,'EUR') not in ('EUR','USD') then
    raise exception 'Sólo se llevan tasas del euro y del dólar.';
  end if;

  insert into public.cem_tasas_bcv (id_tasa, valor, descripcion, fecha, moneda)
  values ('MANUAL', p_valor, 'Cargada a mano', coalesce(p_fecha, current_date), coalesce(p_moneda,'EUR'))
  on conflict (moneda, fecha, id_tasa) do update
    set valor = excluded.valor, actualizado_en = now()
  returning * into v;
  return v;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_nac date;
begin
  if (m->>'cem_signup') <> 'true' then return new; end if;

  -- Una fecha mal escrita no puede tumbar el registro entero: si no se entiende
  -- se guarda en blanco y se pide luego en el perfil.
  begin
    v_nac := nullif(trim(coalesce(m->>'fecha_nacimiento', '')), '')::date;
  exception when others then
    v_nac := null;
  end;

  insert into cem_profiles(id, nombre, apellido, email, rol, telefono,
                           documento_tipo, documento, pais, ciudad,
                           fecha_nacimiento, ocupacion, como_nos_conocio)
  values (
    new.id,
    coalesce(m->>'nombre', ''),
    nullif(trim(coalesce(m->>'apellido', '')), ''),
    new.email,
    'estudiante',
    nullif(trim(coalesce(m->>'telefono', '')), ''),
    nullif(trim(coalesce(m->>'documento_tipo', '')), ''),
    nullif(trim(coalesce(m->>'documento', '')), ''),
    nullif(trim(coalesce(m->>'pais', '')), ''),
    nullif(trim(coalesce(m->>'ciudad', '')), ''),
    v_nac,
    nullif(trim(coalesce(m->>'ocupacion', '')), ''),
    nullif(trim(coalesce(m->>'como_nos_conocio', '')), '')
  ) on conflict (id) do nothing;

  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_hay_datos_de_prueba()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'filas',   (select count(*) from cem_datos_de_prueba),
    'cuentas', (select count(*) from cem_datos_de_prueba where tabla = 'cem_profiles'),
    'desde',   (select min(sembrado_en) from cem_datos_de_prueba),
    'puedo',   cem_es_admin());
$function$
;

CREATE OR REPLACE FUNCTION public.cem_identidad_para_revisar(p_profile_id uuid)
 RETURNS TABLE(frente_ruta text, dorso_ruta text, estado text, subido_en timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_yo uuid := auth.uid();
begin
  if not cem_es_admin() then
    raise exception 'Sólo el equipo puede abrir el documento de otra persona.'
      using errcode = '42501';
  end if;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  select v_yo, p.email, 'identidad_abierta', 'cem_identidad', p_profile_id, 'alto',
         jsonb_build_object('sobre', p_profile_id)
  from cem_profiles p where p.id = v_yo;

  return query
    select i.frente_ruta, i.dorso_ruta, i.estado, i.subido_en
    from cem_identidad i where i.profile_id = p_profile_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_identidad_resolver(p_profile_id uuid, p_estado text, p_motivo text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_yo uuid := auth.uid();
begin
  if not cem_es_admin() then
    raise exception 'Sólo el equipo revisa documentos.' using errcode = '42501';
  end if;
  if p_estado not in ('aprobado','rechazado') then
    raise exception 'El estado sólo puede ser aprobado o rechazado.';
  end if;
  -- Rechazar sin decir por qué obliga a la persona a adivinar qué salió mal, y
  -- lo normal es que vuelva a subir exactamente lo mismo.
  if p_estado = 'rechazado' and coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Al rechazar hay que decir qué está mal, para que se pueda corregir.';
  end if;

  update cem_identidad
     set estado = p_estado, motivo = p_motivo,
         revisado_por = v_yo, revisado_en = now()
   where profile_id = p_profile_id;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  select v_yo, p.email, 'identidad_' || p_estado, 'cem_identidad', p_profile_id, 'alto',
         jsonb_build_object('motivo', p_motivo)
  from cem_profiles p where p.id = v_yo;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_identidad_sin_autoaprobarse()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not cem_es_admin() then
    -- Quien no es del equipo no decide el estado de su propio documento.
    new.estado       := 'pendiente';
    new.revisado_por := null;
    new.revisado_en  := null;
    new.motivo       := null;
  end if;
  if new.frente_ruta is distinct from old.frente_ruta
     or new.dorso_ruta is distinct from old.dorso_ruta then
    new.subido_en := now();
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_informe_mensual_enviar(p_mes date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mes date := coalesce(p_mes, (date_trunc('month', current_date) - interval '1 month')::date);
  v_c jsonb; v_asunto text; v_cuerpo text; v_clave text; v_n integer := 0; r record;
begin
  v_c := cem_cierre_de_mes_calc(v_mes);
  v_asunto := format('CEM · Cierre de %s', to_char(v_mes, 'TMMonth YYYY'));

  v_cuerpo := format(
'Cierre de %s.

Facturado: %s EUR en %s cuotas.
Cobrado: %s EUR en %s pagos.
Vencido y sin cobrar: %s EUR en %s cuotas.
Reportado y sin verificar: %s EUR en %s pagos.
Concedido por recibir dolares a la par: %s EUR.%s

El detalle completo esta en Cierre de mes, dentro de la plataforma.',
    to_char(v_mes, 'TMMonth YYYY'),
    to_char((v_c->>'facturado')::numeric, 'FM999999990.00'), v_c->>'cuotas',
    to_char((v_c->>'cobrado')::numeric,   'FM999999990.00'), v_c->>'pagos',
    to_char((v_c->>'vencido')::numeric,   'FM999999990.00'), v_c->>'cuotas_vencidas',
    to_char((v_c->>'por_revisar')::numeric,'FM999999990.00'), v_c->>'pagos_por_revisar',
    to_char((v_c->>'concedido_por_paridad')::numeric, 'FM999999990.00'),
    case when (v_c->>'pagos_sin_cruce')::int > 0
         then format(E'\nOjo: %s pago(s) no se pudieron medir por falta de tasa BCV de su dia, asi que esa ultima cifra esta incompleta.',
                     v_c->>'pagos_sin_cruce')
         else '' end);

  for r in select id, email from cem_profiles
            where activo and rol in ('admin','superadmin','coordinador') and email is not null
  loop
    v_clave := md5('informe_mensual|' || r.email || '|' || (v_c->>'mes'));
    -- El cuerpo va en llano: quien empuja la cola es el que lo envuelve en
    -- HTML. Guardarlo ya envuelto lo maquetaría dos veces.
    insert into cem_correo_cola (para, asunto, cuerpo, clave)
    values (r.email, v_asunto, v_cuerpo, v_clave)
    on conflict (clave) where estado = 'pendiente' do nothing;

    if not exists (select 1 from cem_notificaciones n
                    where n.profile_id = r.id and n.tipo = 'informe_mensual'
                      and n.url like '%' || (v_c->>'mes') || '%') then
      insert into cem_notificaciones (profile_id, tipo, titulo, cuerpo, url)
      values (r.id, 'informe_mensual', v_asunto,
              format('Cobrado %s EUR · vencido %s EUR.',
                     to_char((v_c->>'cobrado')::numeric, 'FM999999990.00'),
                     to_char((v_c->>'vencido')::numeric, 'FM999999990.00')),
              'admin/cierre-mes.html?mes=' || (v_c->>'mes'));
    end if;
    v_n := v_n + 1;
  end loop;

  return jsonb_build_object('mes', v_c->>'mes', 'destinatarios', v_n);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_iniciar_intento(p_assessment_id uuid)
 RETURNS cem_submissions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_a public.cem_assessments;
  v_enroll uuid;
  v_previos int;
  v_abierta public.cem_submissions;
  v_sub public.cem_submissions;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesión.'; end if;
  select * into v_a from public.cem_assessments where id = p_assessment_id;
  if v_a.id is null then raise exception 'Esa evaluación no existe.'; end if;
  if v_a.estado is distinct from 'publicado' then
    raise exception 'Esa evaluación todavía no está disponible.';
  end if;
  if v_a.abre_en is not null and now() < v_a.abre_en then
    raise exception 'Esta evaluación abre el %.', to_char(v_a.abre_en, 'DD/MM/YYYY HH24:MI');
  end if;
  if v_a.cierra_en is not null and now() > v_a.cierra_en then
    raise exception 'El plazo para presentar esta evaluación cerró el %.', to_char(v_a.cierra_en, 'DD/MM/YYYY HH24:MI');
  end if;

  select e.id into v_enroll from public.cem_enrollments e
   where e.profile_id = auth.uid() and e.course_id = v_a.course_id
     and e.estado not in ('cancelada') limit 1;
  if v_enroll is null then raise exception 'No estás inscrito en este programa.'; end if;

  -- si ya hay un intento abierto sin entregar, se continúa ese en vez de abrir otro
  select * into v_abierta from public.cem_submissions
   where assessment_id = p_assessment_id and enrollment_id = v_enroll and entregado_en is null
   order by intento desc limit 1;
  if v_abierta.id is not null then return v_abierta; end if;

  select count(*) into v_previos from public.cem_submissions
   where assessment_id = p_assessment_id and enrollment_id = v_enroll and entregado_en is not null;
  if v_previos >= coalesce(v_a.intentos, 1) then
    raise exception 'Ya usaste tus % intento(s) para esta evaluación.', coalesce(v_a.intentos, 1);
  end if;

  insert into public.cem_submissions (assessment_id, enrollment_id, intento, estado, iniciado_en)
  values (p_assessment_id, v_enroll, v_previos + 1, 'en_progreso', now())
  returning * into v_sub;
  return v_sub;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_inscribir_a(p_profile_id uuid, p_course_id uuid, p_cohort_id uuid DEFAULT NULL::uuid, p_cuotas integer DEFAULT 1, p_codigo_descuento text DEFAULT NULL::text)
 RETURNS cem_enrollments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_course public.cem_courses;
  v_row public.cem_enrollments;
  v_factor numeric; v_precio_plan numeric; v_descuento_codigo numeric := 0;
  v_final numeric; v_base numeric; v_ultima numeric; v_monto_i numeric;
  i int;
begin
  if p_profile_id is null then raise exception 'Falta decir de quién es la inscripción.'; end if;

  -- Sólo se aceptan los planes que la institución realmente ofrece. Antes
  -- llegaba cualquier número: con 12 se creaban 12 cuotas y además se
  -- esquivaba el recargo, porque el factor sólo contemplaba 1, 3 y 6.
  if p_cuotas is null or p_cuotas not in (1, 3, 6) then
    raise exception 'El plan de pago debe ser de 1, 3 o 6 cuotas.';
  end if;

  select * into v_course from public.cem_courses where id = p_course_id;
  if v_course.id is null then raise exception 'Curso no encontrado.'; end if;
  if exists(select 1 from public.cem_enrollments where profile_id = p_profile_id
            and course_id = p_course_id and estado not in ('cancelada','finalizada')) then
    raise exception 'Ya tienes una inscripcion activa en este programa.';
  end if;

  v_factor := case p_cuotas when 1 then 0.9 when 3 then 1 when 6 then 1.06 end;
  v_precio_plan := round(coalesce(v_course.precio,0) * v_factor, 2);

  if p_codigo_descuento is not null and length(trim(p_codigo_descuento)) > 0
     and v_course.codigo_descuento is not null
     and lower(trim(p_codigo_descuento)) = lower(trim(v_course.codigo_descuento)) then
    v_descuento_codigo := round(coalesce(v_course.precio,0) * coalesce(v_course.descuento_pct,0) / 100.0, 2);
  end if;

  v_final := greatest(v_precio_plan - v_descuento_codigo, 0);

  insert into public.cem_enrollments(profile_id, course_id, cohort_id, precio_lista, descuento, precio_final, moneda, estado)
  values (p_profile_id, p_course_id, p_cohort_id, coalesce(v_course.precio,0),
          greatest(coalesce(v_course.precio,0) - v_final, 0),
          v_final, coalesce(v_course.moneda,'USD'), 'pendiente')
  returning * into v_row;

  -- Reparto exacto: 100 en 3 cuotas da 33,33 + 33,33 + 33,34 = 100,00.
  -- Antes daba 33,33 tres veces y se perdía un céntimo por inscripción.
  v_base := round(v_final / p_cuotas, 2);
  v_ultima := round(v_final - (v_base * (p_cuotas - 1)), 2);

  for i in 1..p_cuotas loop
    v_monto_i := case when i = p_cuotas then v_ultima else v_base end;
    insert into public.cem_installments(enrollment_id, numero, monto, moneda, fecha_vencimiento, estado, saldo)
    values (v_row.id, i, v_monto_i, v_row.moneda,
            (current_date + ((i-1) * interval '1 month'))::date, 'pendiente', v_monto_i);
  end loop;

  insert into public.cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (p_profile_id, 'inscripcion_creada', 'cem_enrollments', v_row.id, 'medio',
          jsonb_build_object('curso', v_course.nombre, 'cuotas', p_cuotas,
                             'codigo_aplicado', v_descuento_codigo > 0, 'total', v_final));
  return v_row;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_insignia_alcance(p_regla text, p_valor numeric DEFAULT NULL::numeric, p_curso uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select count(*)::integer from (
    select distinct e.profile_id
      from cem_enrollments e
     where e.estado <> 'cancelada'
       and (p_curso is null or e.course_id = p_curso)
       and case p_regla
         when 'curso_completado' then (e.estado = 'finalizada' or e.progreso >= 100)
         when 'primer_certificado' then exists (
           select 1 from cem_certificates c where c.profile_id = e.profile_id and c.anulado_en is null
             and (p_curso is null or c.course_id = p_curso))
         when 'sin_entregas_tarde' then (
           select count(*) filter (where s.tarde) = 0 and count(*) >= coalesce(p_valor, 3)
             from cem_submissions s join cem_enrollments e2 on e2.id = s.enrollment_id
            where e2.profile_id = e.profile_id and s.entregado_en is not null
              and (p_curso is null or e2.course_id = p_curso))
         when 'al_dia_con_pagos' then (
           (select count(*) = 0 from cem_installments i join cem_enrollments e3 on e3.id = i.enrollment_id
             where e3.profile_id = e.profile_id and i.estado = 'vencida'
               and (p_curso is null or e3.course_id = p_curso))
           and exists (select 1 from cem_installments i2 join cem_enrollments e4 on e4.id = i2.enrollment_id
                        where e4.profile_id = e.profile_id and i2.estado = 'pagada'
                          and (p_curso is null or e4.course_id = p_curso)))
         when 'promedio_excelente' then (
           select coalesce(avg(s.puntaje), 0) >= coalesce(p_valor, 90) and count(*) >= 3
             from cem_submissions s join cem_enrollments e5 on e5.id = s.enrollment_id
            where e5.profile_id = e.profile_id and s.estado = 'calificada'
              and (p_curso is null or e5.course_id = p_curso))
         when 'asistencia_alta' then (
           select count(*) >= 5
                  and 100.0 * count(*) filter (where a.presente) / greatest(count(*), 1) >= coalesce(p_valor, 90)
             from cem_attendance a join cem_enrollments e6 on e6.id = a.enrollment_id
            where e6.profile_id = e.profile_id
              and (p_curso is null or e6.course_id = p_curso))
         when 'evaluaciones_aprobadas' then (
           select count(*) >= coalesce(p_valor, 5)
             from cem_submissions s join cem_enrollments e7 on e7.id = s.enrollment_id
             join cem_assessments t on t.id = s.assessment_id
            where e7.profile_id = e.profile_id and s.estado = 'calificada'
              and s.puntaje >= coalesce(t.nota_aprobatoria, 70)
              and (p_curso is null or e7.course_id = p_curso))
         else false
       end
  ) q
  where cem_is_staff() or cem_es_auditor();
$function$
;

CREATE OR REPLACE FUNCTION public.cem_invitacion_aceptar(p_token text, p_clave text, p_nombre text, p_apellido text DEFAULT NULL::text, p_telefono text DEFAULT NULL::text, p_pais text DEFAULT NULL::text, p_ciudad text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  i      record;
  v_id   uuid := gen_random_uuid();
  v_hash text;
  v_nom  text := nullif(trim(coalesce(p_nombre, '')), '');
begin
  select * into i from cem_invitaciones_equipo where token = coalesce(p_token, '');

  if i.id is null or i.anulada_en is not null or i.usada_en is not null
     or i.vence_en < now() then
    raise exception 'Esa invitación ya no vale. Pide una nueva.' using errcode = '42501';
  end if;
  if length(coalesce(p_clave, '')) < 8 then
    raise exception 'La contraseña necesita ocho caracteres por lo menos.';
  end if;
  if v_nom is null then
    raise exception 'Hace falta tu nombre.';
  end if;
  if exists (select 1 from auth.users where lower(email) = i.email) then
    raise exception 'Ya hay una cuenta con ese correo. Entra con ella.' using errcode = '42501';
  end if;

  v_hash := extensions.crypt(p_clave, extensions.gen_salt('bf'));

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, reauthentication_token, phone_change,
    phone_change_token, is_super_admin
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    i.email, v_hash, now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('nombre', v_nom, 'apellido', p_apellido),
    '', '', '', '', '', '', '', '', false);

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_id, v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', i.email, 'email_verified', true),
    'email', now(), now(), now());

  insert into cem_profiles (id, nombre, apellido, email, rol, telefono, pais, ciudad, activo)
  values (v_id, v_nom, nullif(trim(coalesce(p_apellido, '')), ''), i.email, i.rol,
          nullif(trim(coalesce(p_telefono, '')), ''),
          nullif(trim(coalesce(p_pais, '')), ''),
          nullif(trim(coalesce(p_ciudad, '')), ''), true)
  on conflict (id) do update
    set nombre = excluded.nombre, apellido = excluded.apellido,
        rol = excluded.rol, telefono = excluded.telefono,
        pais = excluded.pais, ciudad = excluded.ciudad, activo = true;

  update cem_invitaciones_equipo
     set usada_en = now(), usada_por = v_id
   where id = i.id;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id,
                                riesgo, detalle)
  values (v_id, i.email, 'invitacion_aceptada', 'cem_profiles', v_id,
          case when i.rol in ('admin','superadmin','auditor','cobranza') then 'alto'
               else 'medio' end,
          jsonb_build_object('rol', i.rol, 'invitacion', i.id,
                             'invitada_por', i.invitada_por));

  return jsonb_build_object('ok', true, 'email', i.email, 'rol', i.rol);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_invitacion_anular(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare i record;
begin
  select * into i from cem_invitaciones_equipo where id = p_id;
  if i.id is null then raise exception 'Esa invitación no existe.'; end if;
  if not cem_puede_invitar_a(i.rol) then
    raise exception 'No puedes anular una invitación de %.', i.rol using errcode = '42501';
  end if;
  if i.usada_en is not null then
    raise exception 'Esa invitación ya se usó: anularla no desharía la cuenta. '
                    'Lo que se hace es desactivar a esa persona en Usuarios y roles.';
  end if;
  update cem_invitaciones_equipo
     set anulada_en = now(), anulada_por = auth.uid()
   where id = p_id and anulada_en is null;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id,
                                riesgo, detalle)
  select auth.uid(), p.email, 'invitacion_anulada', 'cem_invitaciones_equipo', p_id,
         'medio', jsonb_build_object('email', i.email, 'rol', i.rol)
    from cem_profiles p where p.id = auth.uid();

  return jsonb_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_invitacion_ver(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare i record;
begin
  select * into i from cem_invitaciones_equipo
   where token = coalesce(p_token, '');

  if i.id is null then
    return jsonb_build_object('ok', false, 'motivo', 'no_existe');
  elsif i.anulada_en is not null then
    return jsonb_build_object('ok', false, 'motivo', 'anulada');
  elsif i.usada_en is not null then
    return jsonb_build_object('ok', false, 'motivo', 'usada');
  elsif i.vence_en < now() then
    return jsonb_build_object('ok', false, 'motivo', 'caducada',
                              'vencio', i.vence_en);
  end if;

  return jsonb_build_object('ok', true, 'email', i.email, 'rol', i.rol,
                            'nombre', i.nombre, 'apellido', i.apellido,
                            'mensaje', i.mensaje, 'vence', i.vence_en);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_invitaciones_equipo_listar()
 RETURNS TABLE(id uuid, email text, rol cem_role, nombre text, apellido text, estado text, creada_en timestamp with time zone, vence_en timestamp with time zone, invitada_por_nombre text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select i.id, i.email, i.rol, i.nombre, i.apellido,
         case when i.anulada_en is not null then 'anulada'
              when i.usada_en   is not null then 'aceptada'
              when i.vence_en   <  now()    then 'caducada'
              else 'pendiente' end,
         i.creada_en, i.vence_en,
         trim(coalesce(p.nombre,'') || ' ' || coalesce(p.apellido,''))
    from cem_invitaciones_equipo i
    left join cem_profiles p on p.id = i.invitada_por
   where cem_es_admin() or cem_role() = 'coordinador'
   order by i.creada_en desc
   limit 300;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_invitaciones_listar()
 RETURNS TABLE(id uuid, quien text, email text, profile_id uuid, curso text, cohorte text, precio_lista numeric, descuento numeric, precio_final numeric, moneda text, cuotas integer, estado text, vence date, created_at timestamp with time zone, resuelta_en timestamp with time zone, invito text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select i.id,
         trim(coalesce(p.nombre,'') || ' ' || coalesce(p.apellido,'')), p.email, p.id,
         c.nombre, co.nombre,
         i.precio_lista, i.descuento, i.precio_final, i.moneda, i.cuotas,
         case when i.estado = 'pendiente' and i.vence is not null and i.vence < current_date
              then 'caducada' else i.estado end,
         i.vence, i.created_at, i.resuelta_en,
         trim(coalesce(q.nombre,'') || ' ' || coalesce(q.apellido,''))
    from public.cem_invitaciones i
    join public.cem_profiles p on p.id = i.profile_id
    join public.cem_courses  c on c.id = i.course_id
    left join public.cem_cohorts  co on co.id = i.cohort_id
    left join public.cem_profiles q  on q.id = i.creada_por
   where public.cem_is_staff() or public.cem_es_auditor()
   order by (i.estado = 'pendiente') desc, i.created_at desc
   limit 500;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_invitar(p_email text, p_rol cem_role, p_nombre text DEFAULT NULL::text, p_apellido text DEFAULT NULL::text, p_mensaje text DEFAULT NULL::text, p_dias integer DEFAULT 7)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_token text;
  v_id    uuid;
  v_base  text;
  v_enlace text;
  v_vence timestamptz;
  v_yo    uuid := auth.uid();
  v_quien text;
begin
  if not cem_puede_invitar_a(p_rol) then
    raise exception 'No puedes invitar a alguien como %.', p_rol using errcode = '42501';
  end if;
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' then
    raise exception 'Ese correo no parece una dirección válida.';
  end if;
  if exists (select 1 from cem_profiles where lower(email) = v_email) then
    raise exception 'Ya hay una cuenta con ese correo. No hace falta invitarla: que entre.';
  end if;

  update cem_invitaciones_equipo
     set anulada_en = now(), anulada_por = v_yo
   where lower(email) = v_email and usada_en is null and anulada_en is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_vence := now() + make_interval(days => greatest(coalesce(p_dias, 7), 1));

  insert into cem_invitaciones_equipo (email, rol, nombre, apellido, token,
                                       mensaje, invitada_por, vence_en)
  values (v_email, p_rol,
          nullif(trim(coalesce(p_nombre, '')), ''),
          nullif(trim(coalesce(p_apellido, '')), ''),
          v_token,
          nullif(trim(coalesce(p_mensaje, '')), ''),
          v_yo, v_vence)
  returning id into v_id;

  v_base := coalesce((select valor->>'url' from cem_settings where clave = 'sitio_url'),
                     'https://escuelacem.com');
  v_enlace := v_base || '/plataforma/invitacion.html?t=' || v_token;

  select coalesce(trim(nombre || ' ' || coalesce(apellido, '')), 'el equipo del CEM')
    into v_quien from cem_profiles where id = v_yo;

  insert into cem_correo_cola (para, asunto, cuerpo, clave)
  values (v_email,
          'Te han invitado al CEM International',
          coalesce(trim(p_mensaje) || E'\n\n', '')
          || 'Hola' || coalesce(' ' || nullif(trim(coalesce(p_nombre,'')), ''), '') || ','
          || E'\n\n' || coalesce(v_quien, 'El equipo del CEM')
          || ' te ha invitado a entrar en la plataforma del CEM International como '
          || p_rol || '.'
          || E'\n\nEntra aquí y elige tu contraseña:\n' || v_enlace
          || E'\n\nEl enlace es de un solo uso y caduca el '
          || to_char(v_vence, 'DD/MM/YYYY') || '.'
          || E'\n\nSi no esperabas este correo, ignóralo: sin abrir el enlace no pasa nada.',
          md5(v_email || '|invitacion|' || v_token));

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id,
                                riesgo, detalle)
  select v_yo, p.email, 'invitacion_creada', 'cem_invitaciones_equipo', v_id,
         case when p_rol in ('admin','superadmin','auditor','cobranza') then 'alto'
              else 'medio' end,
         jsonb_build_object('email', v_email, 'rol', p_rol, 'vence', v_vence)
    from cem_profiles p where p.id = v_yo;

  return jsonb_build_object('ok', true, 'id', v_id, 'email', v_email, 'rol', p_rol,
                            'enlace', v_enlace, 'vence', v_vence);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_invitar_a_curso(p_profile_id uuid, p_course_id uuid, p_cohort_id uuid DEFAULT NULL::uuid, p_descuento numeric DEFAULT 0, p_cuotas integer DEFAULT 1, p_mensaje text DEFAULT NULL::text, p_vence date DEFAULT NULL::date)
 RETURNS cem_invitaciones
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_course public.cem_courses;
  v_row    public.cem_invitaciones;
  v_factor numeric;
  v_plan   numeric;
  v_final  numeric;
begin
  if not public.cem_is_staff() then
    raise exception 'Solo el equipo puede invitar a un programa.';
  end if;
  if p_cuotas is null or p_cuotas not in (1,3,6) then
    raise exception 'El plan de pago debe ser de 1, 3 o 6 cuotas.';
  end if;

  select * into v_course from public.cem_courses where id = p_course_id;
  if v_course.id is null then raise exception 'Ese programa no existe.'; end if;
  if v_course.estado <> 'publicado' then
    raise exception 'No se puede invitar a un programa que todavia no esta publicado.';
  end if;

  if not exists (select 1 from public.cem_profiles where id = p_profile_id and activo) then
    raise exception 'Esa persona no existe o su cuenta esta desactivada.';
  end if;

  if exists (select 1 from public.cem_enrollments
             where profile_id = p_profile_id and course_id = p_course_id
               and estado not in ('cancelada','finalizada')) then
    raise exception 'Esa persona ya esta inscrita en este programa.';
  end if;

  /* La cohorte tiene que ser de este programa, o la persona acabaría en un
     grupo de otro curso sin que nada se quejara. */
  if p_cohort_id is not null and not exists (
       select 1 from public.cem_cohorts where id = p_cohort_id and course_id = p_course_id) then
    raise exception 'Esa cohorte no es de este programa.';
  end if;

  if p_vence is not null and p_vence < current_date then
    raise exception 'La invitacion no puede caducar antes de hoy.';
  end if;

  /* El mismo recargo que cuando se inscribe por su cuenta: pago único sale
     más barato, seis cuotas llevan recargo. Si aquí se saltara, invitar sería
     una forma silenciosa de cambiar la tarifa. */
  v_factor := case p_cuotas when 1 then 0.9 when 3 then 1 when 6 then 1.06 end;
  v_plan   := round(coalesce(v_course.precio,0) * v_factor, 2);
  v_final  := greatest(v_plan - greatest(coalesce(p_descuento,0), 0), 0);

  -- Una invitación anterior que nadie contestó deja de estar viva.
  update public.cem_invitaciones
     set estado = 'retirada', resuelta_en = now()
   where profile_id = p_profile_id and course_id = p_course_id and estado = 'pendiente';

  insert into public.cem_invitaciones(profile_id, course_id, cohort_id, precio_lista,
                                      descuento, precio_final, moneda, cuotas, mensaje,
                                      vence, creada_por)
  values (p_profile_id, p_course_id, p_cohort_id, v_plan,
          least(greatest(coalesce(p_descuento,0),0), v_plan), v_final,
          coalesce(v_course.moneda,'EUR'), p_cuotas, nullif(trim(coalesce(p_mensaje,'')),''),
          p_vence, auth.uid())
  returning * into v_row;

  perform public.cem_notificar(
    p_profile_id, 'invitacion',
    'Te invitamos a ' || v_course.nombre,
    coalesce(v_row.mensaje, 'Tienes una invitacion para inscribirte. Entra a tu panel para verla.'),
    'estudiante/index.html');

  insert into public.cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'invitacion_enviada', 'cem_invitaciones', v_row.id, 'bajo',
          jsonb_build_object('curso', v_course.nombre, 'precio_final', v_final,
                             'descuento', v_row.descuento, 'cuotas', p_cuotas));
  return v_row;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_is_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from cem_profiles
                  where id = auth.uid() and activo
                    and rol in ('coordinador','admin','superadmin'));
$function$
;

CREATE OR REPLACE FUNCTION public.cem_is_teacher()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(select 1 from cem_profiles where id = auth.uid() and rol = 'profesor' and activo);
$function$
;

CREATE OR REPLACE FUNCTION public.cem_issue_certificate(p_enrollment_id uuid, p_template_id uuid DEFAULT NULL::uuid, p_tipo text DEFAULT 'certificado'::text)
 RETURNS cem_certificates
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_e cem_enrollments; v_c cem_courses; v_p cem_profiles; v_cert cem_certificates;
        v_codigo text; v_intento int := 0;
begin
  if not cem_is_staff() then raise exception 'No autorizado.'; end if;
  select * into v_e from cem_enrollments where id = p_enrollment_id;
  if v_e.id is null then raise exception 'Inscripcion no encontrada.'; end if;
  select * into v_c from cem_courses where id = v_e.course_id;
  select * into v_p from cem_profiles where id = v_e.profile_id;

  -- codigo unico: reintentar ante colision en vez de fallar la emision
  loop
    v_intento := v_intento + 1;
    v_codigo := 'CEM-' || to_char(now(),'YYYY') || '-' || lpad((floor(random()*99999)+1)::text, 5, '0');
    exit when not exists (select 1 from cem_certificates c where c.codigo = v_codigo);
    if v_intento > 50 then
      raise exception 'No se pudo generar un codigo unico de certificado.';
    end if;
  end loop;

  insert into cem_certificates(enrollment_id, profile_id, course_id, template_id, codigo, titulo, tipo, datos)
  values (p_enrollment_id, v_e.profile_id, v_e.course_id, p_template_id, v_codigo,
          coalesce(v_c.certificado_nombre, v_c.nombre), p_tipo,
          jsonb_build_object(
            'estudiante', trim(coalesce(v_p.nombre,'')||' '||coalesce(v_p.apellido,'')),
            'cedula',     cem_formato_cedula(v_p.documento),
            'documento_tipo', coalesce(v_p.documento_tipo,''),
            'curso',      v_c.nombre,
            'emision',    to_char(now(),'DD/MM/YYYY')))
  returning * into v_cert;

  insert into cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'certificado_emitido', 'cem_certificates', v_cert.id, 'medio',
          jsonb_build_object('codigo', v_codigo));
  return v_cert;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_issue_certificate(p_enrollment_id uuid, p_template_id uuid DEFAULT NULL::uuid, p_tipo text DEFAULT 'certificado'::text, p_forzar boolean DEFAULT false, p_motivo_excepcion text DEFAULT NULL::text)
 RETURNS cem_certificates
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_e cem_enrollments; v_c cem_courses; v_p cem_profiles; v_cert cem_certificates;
        v_codigo text; v_intento int := 0; v_req jsonb;
begin
  if not cem_is_staff() then raise exception 'No autorizado.'; end if;
  select * into v_e from cem_enrollments where id = p_enrollment_id;
  if v_e.id is null then raise exception 'Inscripción no encontrada.'; end if;

  v_req := cem_requisitos_certificado(p_enrollment_id);
  if not (v_req ->> 'listo')::boolean then
    if not p_forzar then
      raise exception 'Todavía no cumple los requisitos: %. Si aun así hay que emitirlo, hazlo como excepción explicando el motivo.',
        array_to_string(array(select jsonb_array_elements_text(v_req -> 'reparos')), ' ');
    end if;
    if coalesce(trim(p_motivo_excepcion), '') = '' then
      raise exception 'Para emitir sin cumplir los requisitos hay que explicar el motivo: queda asentado.';
    end if;
  end if;

  select * into v_c from cem_courses where id = v_e.course_id;
  select * into v_p from cem_profiles where id = v_e.profile_id;

  -- código único: reintentar ante colisión en vez de fallar la emisión
  loop
    v_intento := v_intento + 1;
    v_codigo := 'CEM-' || to_char(now(), 'YYYY') || '-' || lpad((floor(random() * 99999) + 1)::text, 5, '0');
    exit when not exists (select 1 from cem_certificates c where c.codigo = v_codigo);
    if v_intento > 50 then raise exception 'No se pudo generar un código único de certificado.'; end if;
  end loop;

  insert into cem_certificates(enrollment_id, profile_id, course_id, template_id, codigo, titulo, tipo, datos)
  values (p_enrollment_id, v_e.profile_id, v_e.course_id, p_template_id, v_codigo,
          coalesce(v_c.certificado_nombre, v_c.nombre), p_tipo,
          jsonb_build_object(
            'estudiante', trim(coalesce(v_p.nombre, '') || ' ' || coalesce(v_p.apellido, '')),
            'cedula',     cem_formato_cedula(v_p.documento),
            'documento_tipo', coalesce(v_p.documento_tipo, ''),
            'curso',      v_c.nombre,
            'emision',    to_char(now(), 'DD/MM/YYYY')))
  returning * into v_cert;

  insert into cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(),
          case when (v_req ->> 'listo')::boolean then 'certificado_emitido'
               else 'certificado_emitido_excepcion' end,
          'cem_certificates', v_cert.id,
          case when (v_req ->> 'listo')::boolean then 'medio' else 'alto' end,
          jsonb_build_object('codigo', v_codigo, 'requisitos', v_req,
                             'motivo_excepcion', nullif(trim(coalesce(p_motivo_excepcion, '')), '')));
  return v_cert;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_lead_atender(p_id uuid, p_estado text, p_nota text DEFAULT NULL::text)
 RETURNS cem_leads
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v public.cem_leads;
begin
  if not (cem_puede_cobranza() or cem_is_staff()) then
    raise exception 'Sólo el equipo puede atender los contactos.';
  end if;
  if p_estado not in ('nuevo', 'contactado', 'interesado', 'inscrito', 'descartado') then
    raise exception 'Ese estado no existe.';
  end if;

  update cem_leads
     set estado = p_estado,
         nota_interna = coalesce(nullif(trim(coalesce(p_nota, '')), ''), nota_interna),
         atendido_por = auth.uid(),
         atendido_en = now()
   where id = p_id
   returning * into v;
  if v.id is null then raise exception 'Ese contacto no existe.'; end if;

  insert into cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'lead_atendido', 'cem_leads', v.id, 'bajo',
          jsonb_build_object('estado', p_estado));
  return v;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_lead_enviar_plantilla(p_lead_id uuid, p_plantilla_id uuid, p_forzar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lead  public.cem_leads;
  v_pl    public.cem_mensajes_plantilla;
  v_quien text;
  v_asunto text; v_cuerpo text;
  v_correo_id uuid;
  v_ya timestamptz;
begin
  if not (cem_puede_cobranza() or cem_is_staff()) then
    raise exception 'Sólo el equipo puede escribir a los contactos.';
  end if;

  select * into v_lead from cem_leads where id = p_lead_id;
  if v_lead.id is null then raise exception 'Ese contacto no existe.'; end if;
  if coalesce(trim(v_lead.email), '') = '' then
    raise exception 'Este contacto no dejó correo: hay que llamarle.';
  end if;

  select * into v_pl from cem_mensajes_plantilla where id = p_plantilla_id;
  if v_pl.id is null then raise exception 'Esa plantilla ya no existe.'; end if;

  select max(enviado_en) into v_ya from cem_lead_envios
   where lead_id = p_lead_id and plantilla_clave = v_pl.clave;
  if v_ya is not null and not coalesce(p_forzar, false) then
    return jsonb_build_object('enviado', false, 'motivo', 'ya_recibio',
                              'cuando', v_ya, 'plantilla', v_pl.nombre);
  end if;

  v_asunto := cem_mensaje_pintar(v_pl.asunto, v_lead);
  v_cuerpo := cem_mensaje_pintar(v_pl.cuerpo,  v_lead);

  select coalesce(nullif(trim(nombre || ' ' || coalesce(apellido, '')), ''), email)
    into v_quien from cem_profiles where id = auth.uid();

  -- Si ya hay una copia igual esperando en la cola, `on conflict` la descarta
  -- y esto devuelve null. Ese caso NO se apunta como enviado: apuntar un envío
  -- que no salió es exactamente la mentira que esta tabla existe para evitar.
  insert into cem_correo_cola (para, asunto, cuerpo, clave)
  values (v_lead.email, v_asunto, v_cuerpo,
          'plantilla:' || v_lead.id::text || ':' || v_pl.clave || ':'
          || to_char(now(), 'YYYYMMDDHH24MI'))
  on conflict do nothing
  returning id into v_correo_id;

  if v_correo_id is null then
    return jsonb_build_object('enviado', false, 'motivo', 'ya_en_cola',
                              'plantilla', v_pl.nombre);
  end if;

  insert into cem_lead_envios (lead_id, plantilla_id, plantilla_clave, plantilla_nombre,
                               asunto, para, enviado_por)
  values (v_lead.id, v_pl.id, v_pl.clave, v_pl.nombre, v_asunto, v_lead.email, auth.uid());

  update cem_leads
     set estado = case when estado = 'nuevo' then 'contactado' else estado end,
         nota_interna = trim(both E'\n' from
           coalesce(nota_interna || E'\n\n', '')
           || to_char(now(), 'DD/MM/YYYY HH24:MI') || ' · ' || coalesce(v_quien, 'el equipo')
           || ' le mandó «' || v_pl.nombre || '»'),
         atendido_por = auth.uid(),
         atendido_en = now()
   where id = p_lead_id;

  insert into cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'lead_plantilla_enviada', 'cem_leads', v_lead.id, 'bajo',
          jsonb_build_object('plantilla', v_pl.clave, 'para', v_lead.email,
                             'asunto', v_asunto, 'forzado', coalesce(p_forzar,false)));

  return jsonb_build_object('enviado', true, 'plantilla', v_pl.nombre, 'para', v_lead.email);
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_lead_envios_listar()
 RETURNS TABLE(lead_id uuid, plantilla_clave text, plantilla_nombre text, enviado_en timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.lead_id, e.plantilla_clave, e.plantilla_nombre, e.enviado_en
    from cem_lead_envios e
   where cem_puede_cobranza() or cem_can_read_all()
   order by e.enviado_en desc
   limit 20000;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_lead_materiales_listar()
 RETURNS TABLE(lead_id uuid, titulo text, codigo text, tipo text, cuando timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select e.lead_id, r.titulo, r.codigo, r.tipo, e.created_at
    from cem_recurso_entregas e
    join cem_recursos r on r.id = e.recurso_id
   where cem_puede_cobranza() or cem_can_read_all()
   order by e.created_at desc
   limit 20000;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_lead_responder(p_id uuid, p_asunto text, p_cuerpo text)
 RETURNS cem_leads
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v public.cem_leads;
  v_asunto text := nullif(trim(coalesce(p_asunto, '')), '');
  v_cuerpo text := nullif(trim(coalesce(p_cuerpo, '')), '');
  v_quien  text;
begin
  if not (cem_puede_cobranza() or cem_is_staff()) then
    raise exception 'Sólo el equipo puede contestar los contactos.';
  end if;
  if v_asunto is null or v_cuerpo is null then
    raise exception 'Hace falta un asunto y un mensaje.';
  end if;

  select * into v from cem_leads where id = p_id;
  if v.id is null then raise exception 'Ese contacto no existe.'; end if;
  if coalesce(trim(v.email), '') = '' then
    raise exception 'Este contacto no dejó correo: hay que llamarle.';
  end if;

  select coalesce(nullif(trim(nombre || ' ' || coalesce(apellido, '')), ''), email)
    into v_quien from cem_profiles where id = auth.uid();

  -- `clave` es lo que evita mandar dos veces lo mismo si alguien pulsa dos
  -- veces: lleva el contacto y el minuto, no un azar.
  insert into cem_correo_cola (para, asunto, cuerpo, clave)
  values (v.email, v_asunto, v_cuerpo,
          'lead:' || v.id::text || ':' || to_char(now(), 'YYYYMMDDHH24MI'))
  on conflict do nothing;

  update cem_leads
     set estado = case when estado = 'nuevo' then 'contactado' else estado end,
         nota_interna = trim(both E'\n' from
           coalesce(nota_interna || E'\n\n', '')
           || to_char(now(), 'DD/MM/YYYY HH24:MI') || ' · ' || coalesce(v_quien, 'el equipo')
           || ' le escribió: ' || v_asunto),
         atendido_por = auth.uid(),
         atendido_en = now()
   where id = p_id
   returning * into v;

  insert into cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'lead_respondido', 'cem_leads', v.id, 'bajo',
          jsonb_build_object('asunto', v_asunto, 'para', v.email));
  return v;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_leads_enviar_masivo(p_plantilla_id uuid, p_ids uuid[], p_forzar boolean DEFAULT false, p_solo_contar boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pl public.cem_mensajes_plantilla;
  v_ids uuid[];
  v_cuantos int;
  v_ya int := 0; v_sin_correo int := 0; v_enviados int := 0; v_fallos int := 0;
  v_id uuid; v_r jsonb;
  TOPE constant int := 400;
begin
  if not (cem_puede_cobranza() or cem_is_staff()) then
    raise exception 'Sólo el equipo puede escribir a los contactos.';
  end if;
  select * into v_pl from cem_mensajes_plantilla where id = p_plantilla_id;
  if v_pl.id is null then raise exception 'Esa plantilla ya no existe.'; end if;
  if not v_pl.activa then raise exception 'Ese mensaje está apagado: enciéndelo antes de mandarlo.'; end if;

  -- Los tres montones se cuentan por separado porque a quien va a pulsar le
  -- importa la diferencia: «ya lo tiene» se salta y ya está, pero «no dejó
  -- correo» es una lista de gente a la que hay que llamar por teléfono.
  select count(*) filter (where coalesce(trim(l.email),'') = ''),
         count(*) filter (where coalesce(trim(l.email),'') <> '' and yv.lead_id is not null)
    into v_sin_correo, v_ya
    from cem_leads l
    left join (select distinct lead_id from cem_lead_envios
                where plantilla_clave = v_pl.clave) yv on yv.lead_id = l.id
   where l.id = any(coalesce(p_ids, '{}'));

  select coalesce(array_agg(l.id order by l.created_at), '{}')
    into v_ids
    from cem_leads l
    left join (select distinct lead_id from cem_lead_envios
                where plantilla_clave = v_pl.clave) yv on yv.lead_id = l.id
   where l.id = any(coalesce(p_ids, '{}'))
     and coalesce(trim(l.email),'') <> ''
     and (coalesce(p_forzar,false) or yv.lead_id is null);

  v_cuantos := coalesce(array_length(v_ids, 1), 0);

  if coalesce(p_solo_contar, true) then
    return jsonb_build_object('solo_contado', true, 'plantilla', v_pl.nombre,
      'a_enviar', v_cuantos, 'ya_recibieron', v_ya,
      'sin_correo', v_sin_correo, 'tope', TOPE);
  end if;

  if v_cuantos = 0 then
    return jsonb_build_object('solo_contado', false, 'plantilla', v_pl.nombre,
      'enviados', 0, 'no_salieron', 0, 'ya_recibieron', v_ya, 'sin_correo', v_sin_correo);
  end if;

  if v_cuantos > TOPE then
    raise exception 'Son % personas de una vez, y el tope es %. Está puesto para que un clic de más no se convierta en un correo masivo sin querer: afina los filtros y mándalo en dos tandas.',
      v_cuantos, TOPE;
  end if;

  foreach v_id in array v_ids loop
    v_r := cem_lead_enviar_plantilla(v_id, p_plantilla_id, p_forzar);
    if (v_r->>'enviado')::boolean then v_enviados := v_enviados + 1;
    else v_fallos := v_fallos + 1; end if;
  end loop;

  insert into cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'leads_envio_masivo', 'cem_mensajes_plantilla', v_pl.id, 'medio',
          jsonb_build_object('plantilla', v_pl.clave, 'enviados', v_enviados,
                             'ya_recibieron', v_ya, 'sin_correo', v_sin_correo,
                             'pedidos', coalesce(array_length(p_ids,1),0),
                             'forzado', coalesce(p_forzar,false)));

  return jsonb_build_object('solo_contado', false, 'plantilla', v_pl.nombre,
    'enviados', v_enviados, 'no_salieron', v_fallos,
    'ya_recibieron', v_ya, 'sin_correo', v_sin_correo);
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_leads_listar(p_estado text DEFAULT NULL::text)
 RETURNS SETOF cem_leads
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select l.* from cem_leads l
   where (cem_puede_cobranza() or cem_can_read_all())
     and (p_estado is null or l.estado = p_estado)
   order by l.created_at desc
   limit 1000;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_liquidacion_eliminar(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v record;
begin
  if not cem_es_admin() then
    raise exception 'Sólo la dirección puede eliminar un pago a un socio.';
  end if;
  select * into v from cem_liquidaciones where id = p_id and not eliminado;
  if not found then raise exception 'Ese pago ya no está o ya se había eliminado.'; end if;

  update cem_liquidaciones
     set eliminado = true, eliminado_por = auth.uid(), eliminado_en = now()
   where id = p_id;

  insert into cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'liquidacion_eliminada', 'cem_liquidaciones', p_id, 'alto',
          jsonb_build_object('monto', v.monto, 'moneda', v.moneda,
                             'monto_base', v.monto_base, 'linea', v.linea,
                             'inversor_id', v.inversor_id, 'fecha', v.fecha));
  return jsonb_build_object('ok', true, 'devuelto', v.monto_base);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_liquidacion_guardar(p_pagos jsonb, p_fecha date DEFAULT CURRENT_DATE, p_nota text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lote uuid := gen_random_uuid();
  v_rep jsonb; v_avisos jsonb := '[]'::jsonb; e jsonb;
  v_n int := 0; v_total numeric := 0; v_conv record;
  v_debe numeric; v_monto numeric; v_moneda text; v_ronda uuid; v_inv uuid; v_linea text;
  v_nombre text; v_parecido int;
begin
  if not cem_es_admin() then
    raise exception 'Sólo la dirección puede registrar pagos a los socios.';
  end if;
  if coalesce(jsonb_array_length(p_pagos), 0) = 0 then
    raise exception 'No hay ningún pago que registrar.';
  end if;

  -- Se calcula UNA vez, antes de tocar nada: si se recalculara dentro del
  -- bucle, cada fila cambiaría lo que la siguiente considera pendiente y el
  -- aviso dependería del orden en que vinieran los pagos.
  v_rep := cem_reparto_calc(null);

  for e in select * from jsonb_array_elements(p_pagos) loop
    v_ronda  := (e->>'ronda_id')::uuid;
    v_inv    := (e->>'inversor_id')::uuid;
    v_linea  := e->>'linea';
    v_monto  := (e->>'monto')::numeric;
    v_moneda := coalesce(e->>'moneda', 'EUR');

    if v_ronda is null or v_inv is null or v_linea is null or coalesce(v_monto,0) <= 0 then
      raise exception 'Cada pago necesita ronda, socio, línea y monto. Sin línea no se puede descontar de ningún lado.';
    end if;

    select * into v_conv from cem_a_base(v_monto, v_moneda, coalesce(p_fecha, current_date));

    insert into cem_liquidaciones(fecha, ronda_id, inversor_id, linea, monto, moneda,
                                  tasa, monto_base, cartera_id, nota, lote, creado_por)
    values (coalesce(p_fecha, current_date), v_ronda, v_inv, v_linea::cem_course_tipo,
            v_monto, v_moneda,
            case when v_moneda = 'EUR' then null else v_conv.tasa end,
            v_conv.monto_base, nullif(e->>'cartera_id',''),
            nullif(btrim(coalesce(p_nota,'')), ''), v_lote, auth.uid());

    v_n := v_n + 1;
    v_total := v_total + v_conv.monto_base;

    -- Aviso 1: se está pagando más de lo que esa línea debe.
    select (pp->>'le_debo')::numeric into v_debe
      from jsonb_array_elements(v_rep->'rondas') rr,
           jsonb_array_elements(rr->'lineas') ll,
           jsonb_array_elements(ll->'partes') pp
     where rr->>'id' = v_ronda::text and ll->>'linea' = v_linea
       and pp->>'inversor_id' = v_inv::text;
    select nombre into v_nombre from cem_inversores where id = v_inv;
    if v_conv.monto_base > coalesce(v_debe, 0) + 0.01 then
      v_avisos := v_avisos || jsonb_build_object(
        'tipo', 'de_mas',
        'texto', format('A %s se le paga %s € en %s y sólo se le debían %s €. Queda como saldo a favor.',
                        coalesce(v_nombre,'ese socio'), round(v_conv.monto_base,2), v_linea,
                        round(coalesce(v_debe,0),2)));
    end if;

    -- Aviso 2: el doble camino. Si alguien ya cuadró la cartera a mano por un
    -- importe parecido y en fechas parecidas, es probable que sea este mismo
    -- pago cargado dos veces. El código no puede saberlo; la persona sí.
    if nullif(e->>'cartera_id','') is not null then
      select count(*)::int into v_parecido from cem_conversiones c
       where not coalesce(c.eliminado, false)
         and c.cartera_origen is null
         and c.cartera_destino = nullif(e->>'cartera_id','')
         and c.monto_destino < 0
         and abs(abs(c.monto_destino) - v_monto) <= greatest(v_monto * 0.02, 1)
         and c.fecha between coalesce(p_fecha, current_date) - 3
                         and coalesce(p_fecha, current_date) + 3;
      if v_parecido > 0 then
        v_avisos := v_avisos || jsonb_build_object(
          'tipo', 'quizas_repetido',
          'texto', format('Hay %s ajuste(s) de cartera por un importe parecido en estos días. Si eran este mismo pago, uno de los dos sobra.', v_parecido));
      end if;
    end if;
  end loop;

  insert into cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'liquidacion_registrada', 'cem_liquidaciones', v_lote, 'alto',
          jsonb_build_object('lote', v_lote, 'filas', v_n, 'total_eur', round(v_total,2),
                             'fecha', coalesce(p_fecha, current_date), 'avisos', v_avisos));

  return jsonb_build_object('ok', true, 'lote', v_lote, 'filas', v_n,
                            'total', round(v_total, 2), 'avisos', v_avisos);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_liquidaciones_listar(p_limite integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (cem_es_admin() or cem_es_auditor()) then
    raise exception 'Sólo la dirección puede ver los pagos a los socios.';
  end if;

  return coalesce((
    select jsonb_agg(x order by x->>'fecha' desc, x->>'lote')
    from (
      select jsonb_build_object(
        'lote', l.lote,
        'fecha', min(l.fecha),
        'nota', min(l.nota),
        'total', round(sum(l.monto_base), 2),
        'filas', jsonb_agg(jsonb_build_object(
            'id', l.id, 'inversor_id', l.inversor_id, 'inversor', i.nombre,
            'color', i.color, 'ronda_id', l.ronda_id, 'ronda', r.nombre,
            'linea', l.linea, 'monto', l.monto, 'moneda', l.moneda,
            'tasa', l.tasa, 'monto_base', l.monto_base,
            'cartera_id', l.cartera_id, 'cartera', c.nombre) order by i.nombre, l.linea),
        'socios', count(distinct l.inversor_id)::int,
        'sin_cartera', count(*) filter (where l.cartera_id is null)::int) as x
        from cem_liquidaciones l
        join cem_inversores i on i.id = l.inversor_id
        join cem_rondas r on r.id = l.ronda_id
        left join cem_carteras c on c.id = l.cartera_id
       where not l.eliminado
       group by l.lote
       order by min(l.fecha) desc
       limit greatest(coalesce(p_limite, 300), 1)
    ) t), '[]'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_manifiesto_de_respaldo()
 RETURNS TABLE(tabla text, filas bigint, huella text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  t record;
  n bigint;
  h text;
begin
  if auth.uid() is not null
     and public.cem_role() not in ('admin', 'superadmin', 'auditor') then
    raise exception 'Sólo un administrador o un auditor puede sacar el manifiesto de respaldo.';
  end if;

  for t in
    select c.relname::text as nombre
      from pg_class c
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relkind = 'r'
       and c.relname like 'cem\_%'
     order by c.relname
  loop
    -- `t.*::text` serializa la fila entera; ordenar por esa misma
    -- representación hace la huella estable aunque la tabla no tenga `id`.
    execute format(
      'select count(*), md5(coalesce(string_agg(f, E''\n'' order by f), '''')) from (select x::text as f from public.%I x) s',
      t.nombre) into n, h;
    tabla := t.nombre; filas := n; huella := h;
    return next;
  end loop;
end;
$function$
;
comment on function public.cem_manifiesto_de_respaldo() is 'Filas y huella md5 de cada tabla cem_*. Se compara antes y después de restaurar para probar que la restauración quedó completa. Ver docs/respaldo-y-restauracion.md.';

CREATE OR REPLACE FUNCTION public.cem_marcar_notificaciones_leidas()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n integer;
begin
  update cem_notificaciones set leida_en = now()
   where profile_id = auth.uid() and leida_en is null;
  get diagnostics v_n = row_count;
  return v_n;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_material_lecciones(p_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_object_agg(l.id::text, jsonb_build_object(
           'url', case
                    -- Quien edita ve siempre lo que hay escrito.
                    when cem_can_read_all() then l.url
                    -- Al estudiante, si hay vídeo asignado, sólo el id.
                    when l.video_id is not null then null
                    else l.url
                  end,
           'video_id', l.video_id,
           'contenido', l.contenido,
           'adjuntos', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'nombre', d.nombre, 'tipo', d.tipo, 'url', d.url,
                      'bytes', d.tamano_bytes)
                    order by d.created_at)
               from cem_media d
              where d.lesson_id = l.id and coalesce(d.publico, true)
                and d.url is not null), '[]'::jsonb))), '{}'::jsonb)
    from cem_lessons l
    join cem_modules m on m.id = l.module_id
   where l.id = any(coalesce(p_ids, '{}'::uuid[]))
     and (
       cem_can_read_all()
       or exists (
         select 1 from cem_enrollments e
          where e.profile_id = auth.uid()
            and e.course_id = m.course_id
            and cem_acceso_abierto(e.id))
     );
$function$
;
comment on function public.cem_material_lecciones(p_ids uuid[]) is 'Enlace y cuerpo de las lecciones pedidas, sólo para quien pagó el curso o lo lleva.';

CREATE OR REPLACE FUNCTION public.cem_mensaje_a_estudiante(p_profile_id uuid, p_asunto text, p_cuerpo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_quien text; v_puede boolean;
begin
  if coalesce(trim(p_asunto), '') = '' or coalesce(trim(p_cuerpo), '') = '' then
    raise exception 'Hace falta un asunto y un mensaje.';
  end if;

  -- Un profesor sólo escribe a los suyos. El personal, a cualquiera.
  v_puede := cem_is_staff() or exists (
    select 1
      from cem_enrollments e
      join cem_teacher_assignments ta
        on ta.teacher_id = auth.uid()
       and (ta.cohort_id = e.cohort_id or ta.course_id = e.course_id)
     where e.profile_id = p_profile_id);
  if not v_puede then
    raise exception 'Sólo puedes escribirle a los estudiantes de tus grupos.';
  end if;

  select trim(coalesce(nombre,'') || ' ' || coalesce(apellido,'')) into v_quien
    from cem_profiles where id = auth.uid();

  perform cem_notificar(p_profile_id, 'mensaje_docente',
    trim(p_asunto),
    format('%s te escribe: %s', coalesce(nullif(v_quien,''), 'Tu profesor'), trim(p_cuerpo)),
    'estudiante/panel.html');

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), (select email from cem_profiles where id = auth.uid()),
          'mensaje_a_estudiante', 'cem_profiles', p_profile_id, 'bajo',
          jsonb_build_object('asunto', trim(p_asunto), 'cuerpo', left(trim(p_cuerpo), 500)))
  returning id into v_id;

  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_mensaje_pintar(p_texto text, p_lead cem_leads)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select replace(replace(replace(replace(coalesce(p_texto, ''),
    '{nombre}',          coalesce(nullif(split_part(trim(coalesce(p_lead.nombre,'')), ' ', 1), ''), 'hola')),
    '{nombre_completo}', coalesce(nullif(trim(coalesce(p_lead.nombre,'') || ' ' || coalesce(p_lead.apellido,'')), ''), 'hola')),
    '{interes}',         coalesce(nullif(trim(coalesce(p_lead.interes,'')), ''), 'nuestra formación')),
    '{origen}',          coalesce(nullif(trim(coalesce(p_lead.origen,'')), ''), 'la web'));
$function$
;

CREATE OR REPLACE FUNCTION public.cem_metodo_pago_guardar(p_metodo text, p_titular text DEFAULT NULL::text, p_destino text DEFAULT NULL::text, p_destino_etiqueta text DEFAULT NULL::text, p_datos jsonb DEFAULT NULL::jsonb, p_instrucciones text DEFAULT NULL::text, p_activo boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_antes cem_metodos_pago;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede cambiar a dónde llega el dinero.' using errcode = '42501';
  end if;

  select * into v_antes from cem_metodos_pago where metodo = p_metodo;
  if v_antes.metodo is null then
    raise exception 'No existe la forma de pago "%".', coalesce(p_metodo, '(nada)');
  end if;

  update cem_metodos_pago set
    titular = coalesce(nullif(trim(p_titular), ''), titular),
    -- El destino sí se puede vaciar: es la forma de retirar un método sin
    -- desactivarlo, y `coalesce` no dejaría hacerlo.
    destino = case when p_destino is null then destino else nullif(trim(p_destino), '') end,
    destino_etiqueta = coalesce(nullif(trim(p_destino_etiqueta), ''), destino_etiqueta),
    datos = coalesce(p_datos, datos),
    instrucciones = case when p_instrucciones is null then instrucciones
                         else nullif(trim(p_instrucciones), '') end,
    activo = coalesce(p_activo, activo)
  where metodo = p_metodo;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, riesgo, detalle)
  select auth.uid(), (select email from cem_profiles where id = auth.uid()),
         'pago.destino_cambiado', 'cem_metodos_pago', 'alto',
         jsonb_build_object('metodo', p_metodo,
           'destino_antes', v_antes.destino,
           'destino_ahora', (select destino from cem_metodos_pago where metodo = p_metodo),
           'titular_antes', v_antes.titular);

  return jsonb_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_metricas_estudiantes(p_dias integer DEFAULT 365)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_desde timestamptz := case when coalesce(p_dias, 0) > 0
                              then now() - make_interval(days => p_dias)
                              else '-infinity'::timestamptz end;
  v_total int;
begin
  if not (cem_is_staff() or cem_es_auditor()) then
    raise exception 'Saber de dónde viene la gente es cosa de la dirección.';
  end if;

  select count(*) into v_total
    from cem_profiles
   where rol = 'estudiante' and created_at >= v_desde;

  return jsonb_build_object(
    'dias', p_dias,
    'alumnos', v_total,

    /* Cuántos de esos alumnos tienen cada dato. Sin esto los gráficos mienten. */
    'cobertura', (
      select jsonb_build_object(
        'pais',      count(*) filter (where coalesce(pais, '') <> ''),
        'ciudad',    count(*) filter (where coalesce(ciudad, '') <> ''),
        'canal',     count(*) filter (where coalesce(como_nos_conocio, '') <> ''),
        'intereses', count(*) filter (where coalesce(array_length(intereses, 1), 0) > 0),
        'nacimiento',count(*) filter (where fecha_nacimiento is not null),
        'documento', count(*) filter (where exists (
                        select 1 from cem_identidad i where i.profile_id = p.id)))
        from cem_profiles p
       where p.rol = 'estudiante' and p.created_at >= v_desde),

    'paises', coalesce((
      select jsonb_agg(x order by x->>'alumnos' desc)
        from (select jsonb_build_object(
                       'pais', pais,
                       'alumnos', count(*),
                       'parte', round(100.0 * count(*) / nullif(v_total, 0), 1)) as x
                from cem_profiles
               where rol = 'estudiante' and created_at >= v_desde
                 and coalesce(pais, '') <> ''
               group by pais order by count(*) desc limit 20) s), '[]'::jsonb),

    'ciudades', coalesce((
      select jsonb_agg(x)
        from (select jsonb_build_object('ciudad', ciudad, 'pais', pais,
                                        'alumnos', count(*)) as x
                from cem_profiles
               where rol = 'estudiante' and created_at >= v_desde
                 and coalesce(ciudad, '') <> ''
               group by ciudad, pais order by count(*) desc limit 15) s), '[]'::jsonb),

    /* Cómo llegaron. Se juntan dos fuentes que hasta ahora se miraban por
       separado: lo que dice quien ya se hizo la cuenta y lo que dijo quien sólo
       dejó el contacto. Son la misma pregunta hecha en dos momentos. */
    'canales', coalesce((
      select jsonb_agg(jsonb_build_object('canal', canal,
                                          'alumnos', alumnos,
                                          'contactos', contactos)
                       order by alumnos + contactos desc)
        from (select coalesce(c.canal, '(no lo dijeron)') as canal,
                     sum(c.es_alumno)::int   as alumnos,
                     sum(c.es_contacto)::int as contactos
                from (
                  select nullif(trim(como_nos_conocio), '') as canal, 1 as es_alumno, 0 as es_contacto
                    from cem_profiles
                   where rol = 'estudiante' and created_at >= v_desde
                  union all
                  select nullif(trim(como_nos_conocio), ''), 0, 1
                    from cem_leads where created_at >= v_desde) c
               group by 1 order by 2 + 3 desc limit 15) s), '[]'::jsonb),

    'intereses', coalesce((
      select jsonb_agg(jsonb_build_object('tema', tema, 'alumnos', n) order by n desc)
        from (select trim(t) as tema, count(*) as n
                from cem_profiles p, unnest(p.intereses) as t
               where p.rol = 'estudiante' and p.created_at >= v_desde
                 and coalesce(trim(t), '') <> ''
               group by 1 order by 2 desc limit 20) s), '[]'::jsonb),

    'edades', coalesce((
      select jsonb_agg(jsonb_build_object('tramo', tramo, 'alumnos', n) order by tramo)
        from (select case
                       when e < 25 then 'Menos de 25'
                       when e < 35 then '25 a 34'
                       when e < 45 then '35 a 44'
                       when e < 55 then '45 a 54'
                       else '55 o más' end as tramo, count(*) as n
                from (select extract(year from age(fecha_nacimiento))::int as e
                        from cem_profiles
                       where rol = 'estudiante' and created_at >= v_desde
                         and fecha_nacimiento is not null) a
               group by 1) s), '[]'::jsonb),

    'altas', coalesce((
      select jsonb_agg(jsonb_build_object('mes', mes, 'alumnos', n) order by mes)
        from (select to_char(date_trunc('month', created_at), 'YYYY-MM') as mes,
                     count(*) as n
                from cem_profiles
               where rol = 'estudiante' and created_at >= v_desde
               group by 1) s), '[]'::jsonb),

    /* El embudo, con los estados que de verdad existen en cem_enrollments:
       activa, pendiente, finalizada, cancelada. */
    'embudo', jsonb_build_object(
      'contactos',  (select count(*) from cem_leads where created_at >= v_desde),
      'cuentas',    v_total,
      'inscritos',  (select count(distinct profile_id) from cem_enrollments
                      where created_at >= v_desde),
      'estudiando', (select count(distinct profile_id) from cem_enrollments
                      where created_at >= v_desde and estado = 'activa'),
      'esperando',  (select count(distinct profile_id) from cem_enrollments
                      where created_at >= v_desde and estado = 'pendiente'),
      'terminados', (select count(distinct profile_id) from cem_enrollments
                      where created_at >= v_desde and estado = 'finalizada'),
      'anuladas',   (select count(*) from cem_enrollments
                      where created_at >= v_desde and estado = 'cancelada'))
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_metricas_evaluacion(p_assessment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_a cem_assessments;
  v_resumen jsonb; v_dist jsonb; v_preg jsonb := '[]'::jsonb;
  v_entregas bigint;
  r record; v_op jsonb; v_muestra jsonb; v_resp bigint; v_ok bigint; v_auto boolean;
begin
  if not (cem_is_staff() or cem_is_teacher()) then
    raise exception 'No tienes permiso para ver las respuestas de esta evaluación.';
  end if;
  select * into v_a from cem_assessments where id = p_assessment_id;
  if v_a.id is null then raise exception 'Evaluación no encontrada.'; end if;

  select jsonb_build_object(
      'entregas', count(*),
      'corregidas', count(*) filter (where puntaje is not null),
      'por_revisar', count(*) filter (where puntaje is null),
      'tardias', count(*) filter (where tarde),
      'promedio', round(avg(puntaje), 1),
      'mediana', round(percentile_cont(0.5) within group (order by puntaje)::numeric, 1),
      'alta', max(puntaje), 'baja', min(puntaje),
      'aprobados', count(*) filter (where puntaje >= coalesce(v_a.nota_aprobatoria, 70)),
      'reprobados', count(*) filter (where puntaje is not null
                                       and puntaje < coalesce(v_a.nota_aprobatoria, 70)),
      'minutos', round(avg(extract(epoch from (entregado_en - iniciado_en)) / 60.0)::numeric, 1)),
    count(*)
    into v_resumen, v_entregas
    from cem_submissions
   where assessment_id = p_assessment_id and entregado_en is not null;

  -- Diez tramos de diez. El 100 exacto cae en el último, no en uno propio.
  select coalesce(jsonb_agg(jsonb_build_object(
           'desde', (g - 1) * 10, 'hasta', g * 10 - case when g = 10 then 0 else 1 end,
           'n', (select count(*) from cem_submissions e
                  where e.assessment_id = p_assessment_id and e.entregado_en is not null
                    and e.puntaje is not null
                    and least(width_bucket(e.puntaje, 0, 100, 10), 10) = g)) order by g), '[]'::jsonb)
    into v_dist from generate_series(1, 10) g;

  for r in
    select aq.orden, aq.puntaje as vale, aq.seccion, q.id, q.enunciado, q.tipo::text as tipo,
           q.opciones, q.respuesta_correcta
      from cem_assessment_questions aq
      join cem_questions q on q.id = aq.question_id
     where aq.assessment_id = p_assessment_id
     order by aq.orden
  loop
    v_auto := r.tipo not in ('ensayo', 'archivo') and r.respuesta_correcta is not null;

    select count(*) filter (where coalesce(e.respuestas #>> array[r.id::text], '') <> ''),
           count(*) filter (where cem_es_correcta(r.tipo, e.respuestas -> r.id::text,
                                                  r.respuesta_correcta))
      into v_resp, v_ok
      from cem_submissions e
     where e.assessment_id = p_assessment_id and e.entregado_en is not null;

    v_op := '[]'::jsonb; v_muestra := '[]'::jsonb;

    if r.tipo in ('multiple', 'verdadero_falso', 'desplegable', 'escala', 'casillas') then
      -- Cuántos eligieron cada opción, incluidas las que no eligió nadie: un
      -- distractor que nadie marca sobra, y eso sólo se ve si aparece en cero.
      select coalesce(jsonb_agg(jsonb_build_object(
               'valor', o.v, 'n', coalesce(c.n, 0), 'correcta',
               case when jsonb_typeof(r.respuesta_correcta) = 'array'
                    then coalesce(r.respuesta_correcta ? o.v, false)
                    else cem_texto_llano(r.respuesta_correcta #>> '{}') = cem_texto_llano(o.v)
               end) order by o.i), '[]'::jsonb)
        into v_op
        from (select value as v, ordinality as i
                from jsonb_array_elements_text(coalesce(r.opciones, '[]'::jsonb)) with ordinality) o
        left join lateral (
          select count(*) as n from cem_submissions e
           where e.assessment_id = p_assessment_id and e.entregado_en is not null
             and case when jsonb_typeof(e.respuestas -> r.id::text) = 'array'
                      then e.respuestas -> r.id::text ? o.v
                      else e.respuestas ->> r.id::text = o.v end) c on true;

    elsif r.tipo in ('corta', 'ensayo') then
      -- Con respuestas escritas el número no dice nada: hay que leerlas.
      select coalesce(jsonb_agg(t), '[]'::jsonb) into v_muestra from (
        select distinct e.respuestas #>> array[r.id::text] as t
          from cem_submissions e
         where e.assessment_id = p_assessment_id and e.entregado_en is not null
           and coalesce(e.respuestas #>> array[r.id::text], '') <> ''
         limit 25) s(t);
    end if;

    v_preg := v_preg || jsonb_build_object(
      'question_id', r.id, 'orden', r.orden, 'enunciado', r.enunciado, 'tipo', r.tipo,
      'seccion', r.seccion, 'vale', r.vale, 'automatica', v_auto,
      'respondidas', v_resp, 'correctas', v_ok,
      'sin_responder', greatest(v_entregas - v_resp, 0),
      'acierto', case when v_auto and v_resp > 0 then round(100.0 * v_ok / v_resp, 1) else null end,
      'opciones', v_op, 'muestra', v_muestra);
  end loop;

  return jsonb_build_object(
    'evaluacion', jsonb_build_object('id', v_a.id, 'nombre', v_a.nombre, 'estado', v_a.estado,
      'puntaje_max', v_a.puntaje_max, 'nota_aprobatoria', v_a.nota_aprobatoria,
      'intentos', v_a.intentos, 'course_id', v_a.course_id),
    'resumen', v_resumen, 'distribucion', v_dist, 'preguntas', v_preg);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_mi_acceso()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_object_agg(e.id::text, jsonb_build_object(
    'abierto', cem_acceso_abierto(e.id),
    'estado', e.estado::text,
    'precio', e.precio_final,
    'moneda', e.moneda,
    'primeraCuota', (select min(i.monto) from cem_installments i
                      where i.enrollment_id = e.id and i.estado <> 'pagada'),
    'cuotaId', (select i.id from cem_installments i
                 where i.enrollment_id = e.id and i.estado <> 'pagada'
                 order by i.numero limit 1)
  )), '{}'::jsonb)
  from cem_enrollments e
  where e.profile_id = auth.uid() and e.estado <> 'cancelada';
$function$
;

CREATE OR REPLACE FUNCTION public.cem_mi_avance(p_enrollment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_e cem_enrollments; v_mod jsonb; v_notas jsonb; v_cuotas jsonb; v_req jsonb;
begin
  select * into v_e from cem_enrollments where id = p_enrollment_id;
  if v_e.id is null then raise exception 'Inscripción no encontrada.'; end if;
  if not (cem_owns_enrollment(p_enrollment_id) or cem_is_staff() or cem_is_teacher()) then
    raise exception 'No autorizado.';
  end if;

  -- Un porcentaje suelto —«68 %»— no dice si eso es una tarde o tres semanas.
  -- Módulo a módulo sí se ve dónde se quedó.
  select coalesce(jsonb_agg(jsonb_build_object(
           'etq', m.titulo, 'id', m.id,
           'n', case when coalesce(t.total, 0) = 0 then 0
                     else round(100.0 * coalesce(v.vistas, 0) / t.total, 0) end,
           'lecciones', coalesce(t.total, 0)) order by m.orden), '[]'::jsonb)
    into v_mod
    from cem_modules m
    left join lateral (select count(*) as total from cem_lessons l where l.module_id = m.id) t on true
    left join lateral (
      select count(*) as vistas from cem_lesson_progress lp
        join cem_lessons l on l.id = lp.lesson_id
       where l.module_id = m.id and lp.enrollment_id = p_enrollment_id and lp.completado) v on true
   where m.course_id = v_e.course_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'etq', a.nombre, 'n', s.puntaje, 'id', a.id,
           'cuando', to_char(s.entregado_en, 'DD/MM/YYYY')) order by s.entregado_en), '[]'::jsonb)
    into v_notas
    from cem_submissions s join cem_assessments a on a.id = s.assessment_id
   where s.enrollment_id = p_enrollment_id and s.puntaje is not null;

  select coalesce(jsonb_agg(jsonb_build_object(
           'etq', 'Cuota ' || i.numero, 'cuando', to_char(i.fecha_vencimiento, 'DD/MM/YYYY'),
           'id', i.id, 'monto', i.monto, 'moneda', i.moneda, 'estado', i.estado::text,
           'tono', case when i.estado = 'pagada' then 'ok'
                        when i.fecha_vencimiento < current_date then 'err'
                        else 'warn' end) order by i.numero), '[]'::jsonb)
    into v_cuotas from cem_installments i where i.enrollment_id = p_enrollment_id;

  -- Los tres requisitos del certificado, que es la pregunta que más llega a
  -- soporte: «¿por qué no me sale el certificado?».
  select jsonb_build_array(
    jsonb_build_object('etq', 'Ver el contenido',
      'n', coalesce(round(v_e.progreso), 0), 'meta', 100),
    jsonb_build_object('etq', 'Aprobar las evaluaciones',
      'n', (select count(*) from cem_assessments a
             where a.course_id = v_e.course_id and a.estado = 'publicado'
               and exists (select 1 from cem_submissions s
                            where s.assessment_id = a.id and s.enrollment_id = p_enrollment_id
                              and s.puntaje >= coalesce(a.nota_aprobatoria, 70))),
      'meta', (select count(*) from cem_assessments a
                where a.course_id = v_e.course_id and a.estado = 'publicado')),
    jsonb_build_object('etq', 'No deber nada',
      'n', (select count(*) from cem_installments where enrollment_id = p_enrollment_id
             and estado = 'pagada'),
      'meta', (select count(*) from cem_installments where enrollment_id = p_enrollment_id))
  ) into v_req;

  return jsonb_build_object('modulos', v_mod, 'notas', v_notas, 'cuotas', v_cuotas,
    'requisitos', v_req, 'curso', v_e.course_id,
    'aprobatoria', (select coalesce(max(nota_aprobatoria), 70) from cem_assessments
                     where course_id = v_e.course_id));
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_mi_desempeno(p_profile_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(enrollment_id uuid, curso text, curso_id uuid, estado cem_inscripcion_estado, progreso numeric, promedio numeric, nota_minima numeric, evaluaciones_total bigint, evaluaciones_entregadas bigint, evaluaciones_calificadas bigint, evaluaciones_aprobadas bigint, pendientes_de_revision bigint, proxima_evaluacion text, proxima_fecha timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with mio as (
    select e.id, e.course_id, e.estado, e.progreso, c.nombre
      from cem_enrollments e join cem_courses c on c.id = e.course_id
     where e.profile_id = coalesce(p_profile_id, auth.uid())
       and (coalesce(p_profile_id, auth.uid()) = auth.uid() or cem_is_staff())
  )
  select m.id, m.nombre, m.course_id, m.estado, m.progreso,
         (select round(avg(s.puntaje), 1) from cem_submissions s
           where s.enrollment_id = m.id and s.estado = 'calificada'),
         (select round(avg(a.nota_aprobatoria), 0) from cem_assessments a
           where a.course_id = m.course_id and a.estado = 'publicado'),
         (select count(*) from cem_assessments a
           where a.course_id = m.course_id and a.estado = 'publicado'),
         (select count(distinct s.assessment_id) from cem_submissions s
           where s.enrollment_id = m.id and s.entregado_en is not null),
         (select count(distinct s.assessment_id) from cem_submissions s
           where s.enrollment_id = m.id and s.estado = 'calificada'),
         (select count(distinct s.assessment_id) from cem_submissions s
           join cem_assessments a on a.id = s.assessment_id
          where s.enrollment_id = m.id and s.estado = 'calificada'
            and s.puntaje >= coalesce(a.nota_aprobatoria, 0)),
         (select count(*) from cem_submissions s
           where s.enrollment_id = m.id and s.estado = 'entregada'),
         (select a.nombre from cem_assessments a
           where a.course_id = m.course_id and a.estado = 'publicado'
             and (a.cierra_en is null or a.cierra_en > now())
             and not exists (select 1 from cem_submissions s
                              where s.enrollment_id = m.id and s.assessment_id = a.id
                                and s.entregado_en is not null)
           order by a.cierra_en nulls last limit 1),
         (select a.cierra_en from cem_assessments a
           where a.course_id = m.course_id and a.estado = 'publicado'
             and (a.cierra_en is null or a.cierra_en > now())
             and not exists (select 1 from cem_submissions s
                              where s.enrollment_id = m.id and s.assessment_id = a.id
                                and s.entregado_en is not null)
           order by a.cierra_en nulls last limit 1)
    from mio m
   order by m.nombre;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_mi_ritmo(p_enrollment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_e cem_enrollments; v_total int; v_mias int;
  v_mediana numeric; v_companeros int;
begin
  select * into v_e from cem_enrollments where id = p_enrollment_id;
  if v_e.id is null then raise exception 'No encontramos esa inscripción.'; end if;
  if not (cem_owns_enrollment(p_enrollment_id) or cem_is_staff() or cem_is_teacher()) then
    raise exception 'Esa inscripción no es tuya.';
  end if;

  select count(*) into v_total
    from cem_lessons l join cem_modules m on m.id = l.module_id
   where m.course_id = v_e.course_id;

  select count(*) into v_mias
    from cem_lesson_progress lp
    join cem_lessons l on l.id = lp.lesson_id
    join cem_modules m on m.id = l.module_id
   where lp.enrollment_id = p_enrollment_id and lp.completado and m.course_id = v_e.course_id;

  -- El grupo: la cohorte si la hay, y si no, el curso entero. Sin contarse a
  -- uno mismo, o el dato se compararía consigo.
  with grupo as (
    select e.id
      from cem_enrollments e
     where e.id <> p_enrollment_id
       and e.estado in ('activa','finalizada')
       and case when v_e.cohort_id is not null
                then e.cohort_id = v_e.cohort_id
                else e.course_id = v_e.course_id end
  ), vistas as (
    select g.id,
           (select count(*) from cem_lesson_progress lp
             join cem_lessons l on l.id = lp.lesson_id
             join cem_modules m on m.id = l.module_id
            where lp.enrollment_id = g.id and lp.completado and m.course_id = v_e.course_id) as n
      from grupo g
  )
  select percentile_cont(0.5) within group (order by n), count(*)
    into v_mediana, v_companeros from vistas;

  return jsonb_build_object(
    'total', v_total,
    'mias', v_mias,
    'companeros', coalesce(v_companeros, 0),
    'mediana', case when coalesce(v_companeros, 0) >= 3 then round(coalesce(v_mediana, 0)) end,
    -- «al día» es una horquilla, no un empate exacto: estar una lección por
    -- debajo de la mediana no es descolgarse.
    'donde', case
      when coalesce(v_companeros, 0) < 3 then 'sin_grupo'
      when v_mias >= coalesce(v_mediana, 0) + 2 then 'adelante'
      when v_mias <= coalesce(v_mediana, 0) - 2 then 'atras'
      else 'al_dia' end);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_mis_invitaciones()
 RETURNS TABLE(id uuid, curso text, curso_id uuid, portada text, cohorte text, precio_lista numeric, descuento numeric, precio_final numeric, moneda text, cuotas integer, mensaje text, vence date, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select i.id, c.nombre, c.id, c.imagen_url, co.nombre,
         i.precio_lista, i.descuento, i.precio_final, i.moneda,
         i.cuotas, i.mensaje, i.vence, i.created_at
    from public.cem_invitaciones i
    join public.cem_courses c on c.id = i.course_id
    left join public.cem_cohorts co on co.id = i.cohort_id
   where i.profile_id = auth.uid()
     and i.estado = 'pendiente'
     and (i.vence is null or i.vence >= current_date)
   order by i.created_at desc;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_mis_notificaciones(p_limite integer DEFAULT 20)
 RETURNS TABLE(id uuid, tipo text, titulo text, cuerpo text, url text, leida_en timestamp with time zone, created_at timestamp with time zone, sin_leer bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select n.id, n.tipo, n.titulo, n.cuerpo, n.url, n.leida_en, n.created_at,
         (select count(*) from cem_notificaciones x
           where x.profile_id = auth.uid() and x.leida_en is null)
    from cem_notificaciones n
   where n.profile_id = auth.uid()
   order by n.created_at desc
   limit least(greatest(coalesce(p_limite, 20), 1), 100);
$function$
;

CREATE OR REPLACE FUNCTION public.cem_mis_requisitos_certificado(p_enrollment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_dueno uuid; v_req jsonb; v_ya boolean;
begin
  select profile_id into v_dueno from cem_enrollments where id = p_enrollment_id;
  if v_dueno is null then
    raise exception 'No encontramos esa inscripción.';
  end if;
  if v_dueno <> auth.uid() and not cem_is_staff() then
    raise exception 'Esa inscripción no es tuya.';
  end if;

  v_req := cem_requisitos_certificado(p_enrollment_id);
  select exists (select 1 from cem_certificates c where c.enrollment_id = p_enrollment_id)
    into v_ya;
  return v_req || jsonb_build_object('ya_emitido', v_ya);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_modulo_avance(p_enrollment_id uuid, p_module_id uuid)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when count(*) = 0 then 0
              else round(100.0 * count(*) filter (where lp.completado) / count(*), 2) end
    from cem_lessons l
    left join cem_lesson_progress lp
           on lp.lesson_id = l.id and lp.enrollment_id = p_enrollment_id
   where l.module_id = p_module_id;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_modulos_de_la_inscripcion(p_enrollment_id uuid)
 RETURNS TABLE(module_id uuid, titulo text, orden integer, horas integer, certifica boolean, profesor text, avance numeric, certificado_id uuid, certificado_codigo text, emitido_en timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select m.id, m.titulo, m.orden, m.horas, m.certifica,
         nullif(trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,'')), ''),
         cem_modulo_avance(p_enrollment_id, m.id),
         c.id, c.codigo, c.emitido_en
    from cem_enrollments e
    join cem_modules m on m.course_id = e.course_id
    left join cem_profiles pr on pr.id = m.profesor_id
    left join cem_certificates c
           on c.enrollment_id = e.id and c.module_id = m.id and c.anulado_en is null
   where e.id = p_enrollment_id
     and (cem_is_staff() or cem_puede_cobranza()
          or e.profile_id = auth.uid())
   order by m.orden, m.titulo;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_my_profile()
 RETURNS cem_profiles
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from cem_profiles where id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.cem_notas_cohorte(p_cohort uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if not public.cem_dicta_cohorte(p_cohort) then
    raise exception 'Sólo quien dicta esta cohorte puede ver sus notas.';
  end if;

  select jsonb_build_object(
    'evaluaciones', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.orden) from (
        select ev.id, ev.nombre, ev.puntaje_max, ev.nota_aprobatoria, ev.tipo::text as tipo,
               row_number() over (order by ev.created_at) as orden
          from public.cem_assessments ev
          join public.cem_cohorts c on c.course_id = ev.course_id
         where c.id = p_cohort and ev.estado <> 'archivado'
      ) e), '[]'::jsonb),

    'estudiantes', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.nombre) from (
        select e.id as enrollment_id, pr.id as profile_id,
               trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,'')) as nombre,
               e.progreso, e.nota_final,
               coalesce((
                 select jsonb_object_agg(u.assessment_id::text, jsonb_build_object(
                          'id', u.id, 'puntaje', u.puntaje, 'estado', u.estado,
                          'tarde', u.tarde, 'entregado_en', u.entregado_en,
                          'intento', u.intento))
                   from (
                     select distinct on (s.assessment_id)
                            s.id, s.assessment_id, s.puntaje, s.estado, s.tarde,
                            s.entregado_en, s.intento
                       from public.cem_submissions s
                      where s.enrollment_id = e.id
                      order by s.assessment_id, s.intento desc
                   ) u
               ), '{}'::jsonb) as notas
          from public.cem_enrollments e
          join public.cem_profiles pr on pr.id = e.profile_id
         where e.cohort_id = p_cohort
      ) x), '[]'::jsonb)
  ) into v;
  return v;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_notificar(p_profile_id uuid, p_tipo text, p_titulo text, p_cuerpo text DEFAULT NULL::text, p_url text DEFAULT NULL::text, p_correo boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_email text; v_cuerpo text;
begin
  if p_profile_id is null then return; end if;

  insert into cem_notificaciones (profile_id, tipo, titulo, cuerpo, url)
  values (p_profile_id, p_tipo, p_titulo, p_cuerpo, p_url);

  if p_correo then
    select email into v_email from cem_profiles where id = p_profile_id and activo;
    if v_email is not null then
      v_cuerpo := coalesce(p_cuerpo, p_titulo);
      insert into cem_correo_cola (para, asunto, cuerpo, clave)
      values (v_email, p_titulo, v_cuerpo,
              md5(v_email || '|' || p_titulo || '|' || v_cuerpo))
      on conflict (clave) where estado = 'pendiente' do nothing;
    end if;
  end if;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_notificar_apelacion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record;
begin
  if tg_op = 'INSERT' then
    -- al coordinador le llega que hay algo por resolver
    for r in select id from cem_profiles
              where rol in ('coordinador','admin','superadmin') and activo loop
      perform cem_notificar(r.id, 'apelacion_nueva',
        'Hay una apelación por resolver',
        'Un estudiante presentó una apelación sobre su calificación.',
        'admin/apelaciones.html');
    end loop;
  elsif new.estado in ('aceptada','rechazada')
        and new.estado is distinct from old.estado then
    perform cem_notificar(new.profile_id, 'apelacion_resuelta',
      format('Tu apelación fue %s', new.estado),
      coalesce(nullif(new.resolucion, ''), 'Entra a la plataforma para ver el detalle.'),
      'estudiante/apelaciones.html');
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_notificar_certificado()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform cem_notificar(new.profile_id, 'certificado_emitido',
    'Tu certificado ya está disponible',
    format('Emitimos tu %s. Código de verificación: %s.',
           lower(coalesce(new.titulo, 'certificado')), new.codigo),
    'estudiante/certificados.html');
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_notificar_pago()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_perfil uuid; v_curso text;
begin
  if tg_op = 'UPDATE' and new.estado is not distinct from old.estado then
    return new;
  end if;
  select e.profile_id, c.nombre into v_perfil, v_curso
    from cem_enrollments e join cem_courses c on c.id = e.course_id
   where e.id = new.enrollment_id;
  if v_perfil is null then return new; end if;

  if new.estado = 'confirmado' then
    perform cem_notificar(v_perfil, 'pago_aprobado',
      'Tu pago fue aprobado',
      format('Registramos tu pago de %s %s (referencia %s) para %s. Ya está abonado a tu cuota.',
             to_char(new.monto, 'FM999999990.00'), new.moneda,
             coalesce(new.referencia, 'sin referencia'), coalesce(v_curso, 'tu programa')),
      'estudiante/pagos.html');
  elsif new.estado = 'rechazado' then
    perform cem_notificar(v_perfil, 'pago_rechazado',
      'Tu pago no pudo confirmarse',
      format('No pudimos confirmar el pago con referencia %s. Motivo: %s. Puedes reportarlo de nuevo con los datos corregidos.',
             coalesce(new.referencia, 'sin referencia'),
             coalesce(nullif(new.nota, ''), 'no se indicó')),
      'estudiante/pagos.html');
  elsif new.estado = 'anulado' then
    perform cem_notificar(v_perfil, 'pago_anulado',
      'Se anuló un pago de tu cuenta',
      format('El pago con referencia %s fue anulado y el saldo volvió a tu cuota. Motivo: %s.',
             coalesce(new.referencia, 'sin referencia'),
             coalesce(nullif(new.nota, ''), 'no se indicó')),
      'estudiante/pagos.html');
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_notificar_ticket()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_dueno uuid; v_asunto text; v_codigo text; v_autor_rol cem_role; r record;
begin
  if new.interno then return new; end if;
  select t.profile_id, t.asunto, t.codigo into v_dueno, v_asunto, v_codigo
    from cem_tickets t where t.id = new.ticket_id;
  select rol into v_autor_rol from cem_profiles where id = new.autor_id;

  if new.autor_id = v_dueno then
    for r in select id from cem_profiles
              where rol in ('coordinador','admin','superadmin') and activo loop
      perform cem_notificar(r.id, 'ticket_respuesta',
        format('Nueva respuesta en el ticket %s', coalesce(v_codigo, '')),
        coalesce(v_asunto, 'Un estudiante respondió su ticket de soporte.'),
        'admin/soporte.html');
    end loop;
  else
    perform cem_notificar(v_dueno, 'ticket_respuesta',
      format('Respondimos tu ticket %s', coalesce(v_codigo, '')),
      coalesce(v_asunto, 'Entra a la plataforma para leer la respuesta.'),
      'estudiante/soporte.html');
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_owns_enrollment(p_enrollment uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(select 1 from cem_enrollments where id = p_enrollment and profile_id = auth.uid());
$function$
;

CREATE OR REPLACE FUNCTION public.cem_paises_de_la_portada()
 RETURNS text[]
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(
    (select array(select jsonb_array_elements_text(valor -> 'codigos'))
       from cem_settings where clave = 'portada_paises'),
    '{}')::text[];
$function$
;
comment on function public.cem_paises_de_la_portada() is 'Códigos ISO de los países que se enseñan en la portada. Lectura pública; se editan en Configuración.';

CREATE OR REPLACE FUNCTION public.cem_parecido_pago(p_ref_banco text, p_ref_pago text, p_monto_banco numeric, p_monto_pago numeric, p_fecha_banco date, p_fecha_pago date)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select least(100, greatest(0,
    -- La referencia es lo único que identifica de verdad un movimiento. Se
    -- comparan los últimos dígitos porque el banco y el estudiante no siempre
    -- copian los mismos: unos dan ocho, otros los cuatro finales.
    case
      when coalesce(p_ref_banco,'') = '' or coalesce(p_ref_pago,'') = '' then 0
      when regexp_replace(p_ref_banco, '\D', '', 'g') = regexp_replace(p_ref_pago, '\D', '', 'g') then 60
      when length(regexp_replace(p_ref_pago, '\D', '', 'g')) >= 4
       and right(regexp_replace(p_ref_banco, '\D', '', 'g'),
                 length(regexp_replace(p_ref_pago, '\D', '', 'g')))
         = regexp_replace(p_ref_pago, '\D', '', 'g') then 45
      else 0
    end
    +
    -- El importe: exacto vale mucho; parecido, poco. Se admite un céntimo de
    -- diferencia por el redondeo de la conversión, no más.
    case
      when p_monto_banco is null or p_monto_pago is null then 0
      when abs(p_monto_banco - p_monto_pago) <= 0.01 then 30
      when abs(p_monto_banco - p_monto_pago) <= greatest(1, p_monto_banco * 0.01) then 12
      else 0
    end
    +
    -- Y la fecha: el mismo día suma; dos días de diferencia, algo menos —una
    -- transferencia de viernes por la tarde se acredita el lunes.
    case
      when p_fecha_banco is null or p_fecha_pago is null then 0
      when p_fecha_banco = p_fecha_pago then 10
      when abs(p_fecha_banco - p_fecha_pago) <= 2 then 5
      else 0
    end));
$function$
;

CREATE OR REPLACE FUNCTION public.cem_pendientes_de_hoy()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when not (cem_is_staff() or cem_puede_cobranza()) then '[]'::jsonb else
    jsonb_build_array(
      jsonb_build_object('clave','pagos','que','Pagos por verificar',
        'n', (select count(*) from cem_payments where estado = 'reportado'),
        'url','pagos-verificar.html','icono','fact_check','tono','warn'),

      jsonb_build_object('clave','solicitudes','que','Solicitudes por resolver',
        'n', (select count(*) from cem_solicitudes_inscripcion where estado = 'pendiente')
           + (select count(*) from cem_solicitudes_perfil where estado = 'pendiente'),
        'url','inscripciones.html','icono','assignment_ind','tono','warn'),

      jsonb_build_object('clave','entregas','que','Entregas sin corregir',
        'n', (select count(*) from cem_submissions where estado = 'entregada'),
        'url','calificar.html','icono','grade','tono','info'),

      jsonb_build_object('clave','dudas','que','Dudas sin responder',
        'n', (select count(*) from cem_dudas d
               where not d.eliminada and not d.resuelta
                 and not exists (select 1 from cem_duda_respuestas r
                                  where r.duda_id = d.id and r.de_docente and not r.eliminada)),
        'url','contenido.html','icono','contact_support','tono','info'),

      jsonb_build_object('clave','contactos','que','Contactos de la web sin atender',
        'n', (select count(*) from cem_leads where estado = 'nuevo'),
        'url','leads.html','icono','contact_phone','tono','info'),

      jsonb_build_object('clave','revision','que','Contenido esperando revisión',
        'n', (select count(*) from cem_content_reviews where estado = 'pendiente'),
        'url','revision.html','icono','fact_check','tono','neutral'),

      jsonb_build_object('clave','apelaciones','que','Apelaciones abiertas',
        'n', (select count(*) from cem_appeals
               where estado in ('recibida','en_analisis','requiere_info')),
        'url','apelaciones.html','icono','gavel','tono','err'),

      jsonb_build_object('clave','soporte','que','Tickets de soporte abiertos',
        'n', (select count(*) from cem_tickets
               where estado in ('abierto','en_proceso','esperando')),
        'url','soporte.html','icono','support_agent','tono','neutral'),

      jsonb_build_object('clave','mora','que','Cuotas con más de 30 días de mora',
        'n', (select count(*) from cem_installments
               where estado in ('vencida','parcial')
                 and coalesce(saldo, monto) > 0
                 and fecha_vencimiento < current_date - 30),
        'url','inscripciones.html','icono','running_with_errors','tono','err')
    ) end;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_perfil_nombre_bajo_llave()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- El equipo sí puede corregirlo: para eso están las solicitudes que aprueba.
  if cem_is_staff() then return new; end if;

  if (new.nombre, new.apellido, new.documento, new.documento_tipo)
     is distinct from (old.nombre, old.apellido, old.documento, old.documento_tipo)
     and exists (select 1 from cem_certificates where profile_id = old.id) then
    raise exception 'Ya tienes certificados emitidos: el cambio de nombre o documento pasa por aprobación. Pídelo desde Mis datos.'
      using errcode = '42501';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_perfil_publico(p_slug text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v public.cem_profiles;
  v_certs jsonb;
  v_insignias jsonb;
  v_trabajo jsonb;
begin
  select * into v from public.cem_profiles
   where perfil_slug = p_slug and perfil_publico = true and activo = true;
  if v.id is null then return null; end if;

  select coalesce(jsonb_agg(x order by x->>'emitido_en' desc), '[]'::jsonb) into v_certs
  from (
    select jsonb_build_object(
             'codigo', c.codigo, 'titulo', c.titulo, 'tipo', c.tipo,
             'emitido_en', c.emitido_en,
             'anulado', c.anulado_en is not null,
             'programa', case when coalesce((v.perfil_muestra->>'programas')::boolean, true)
                              then cur.nombre else null end,
             'horas', case when coalesce((v.perfil_muestra->>'programas')::boolean, true)
                           then cur.horas else null end,
             'nota', case when (v.perfil_muestra->>'notas')::boolean
                          then e.nota_final else null end) as x
      from public.cem_certificates c
      left join public.cem_courses cur on cur.id = c.course_id
      left join public.cem_enrollments e on e.id = c.enrollment_id
     where c.profile_id = v.id and c.anulado_en is null
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
           'nombre', b.nombre, 'nivel', b.nivel, 'icono', b.icono,
           'otorgado_en', a.otorgado_en) order by a.otorgado_en desc), '[]'::jsonb)
    into v_insignias
    from public.cem_badge_awards a
    join public.cem_badges b on b.id = a.badge_id
   where a.profile_id = v.id
     and coalesce((v.perfil_muestra->>'insignias')::boolean, true);

  select coalesce(jsonb_agg(jsonb_build_object(
           'titulo', t.titulo, 'descripcion', t.descripcion,
           'enlace', t.enlace, 'imagen_url', t.imagen_url) order by t.orden, t.created_at), '[]'::jsonb)
    into v_trabajo
    from public.cem_portafolio t
   where t.profile_id = v.id
     and coalesce((v.perfil_muestra->>'trabajo')::boolean, true);

  return jsonb_build_object(
    'nombre', v.nombre,
    'apellido', v.apellido,
    'pais', v.pais,
    'bio', v.bio,
    'avatar_url', v.avatar_url,
    'portada_url', v.portada_url,
    -- Apagada salvo que se encienda: se preguntó al registrarse, para otra cosa.
    'ocupacion', case when (v.perfil_muestra->>'ocupacion')::boolean
                      then v.ocupacion else null end,
    'slug', v.perfil_slug,
    'desde', v.created_at,
    'certificados', v_certs,
    'insignias', v_insignias,
    'trabajo', v_trabajo);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_plantilla_mensaje_borrar(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (cem_puede_cobranza() or cem_is_staff()) then
    raise exception 'Sólo el equipo puede borrar plantillas.';
  end if;
  delete from cem_mensajes_plantilla where id = p_id;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_plantilla_mensaje_guardar(p_id uuid, p_clave text, p_nombre text, p_tipo text, p_asunto text, p_cuerpo text, p_activa boolean DEFAULT true, p_orden integer DEFAULT 0)
 RETURNS cem_mensajes_plantilla
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v public.cem_mensajes_plantilla;
  v_clave text := lower(regexp_replace(trim(coalesce(nullif(trim(p_clave),''), p_nombre)),
                                       '[^a-zA-Z0-9]+', '-', 'g'));
begin
  if not (cem_puede_cobranza() or cem_is_staff()) then
    raise exception 'Sólo el equipo puede tocar las plantillas.';
  end if;
  v_clave := trim(both '-' from v_clave);
  if coalesce(trim(p_nombre),'') = '' then raise exception 'La plantilla necesita un nombre.'; end if;
  if coalesce(trim(p_asunto),'') = '' then raise exception 'Hace falta un asunto: sin asunto casi nadie abre.'; end if;
  if length(coalesce(trim(p_cuerpo),'')) < 20 then raise exception 'El mensaje es demasiado corto.'; end if;

  if p_id is null then
    insert into cem_mensajes_plantilla (clave, nombre, tipo, asunto, cuerpo, activa, orden, creada_por)
    values (v_clave, trim(p_nombre), coalesce(p_tipo,'otro'), trim(p_asunto), trim(p_cuerpo),
            coalesce(p_activa,true), coalesce(p_orden,0), auth.uid())
    returning * into v;
  else
    -- La clave NO se cambia al editar: el historial ya la tiene apuntada, y
    -- cambiarla dejaría los envíos viejos huérfanos de su plantilla.
    update cem_mensajes_plantilla
       set nombre = trim(p_nombre), tipo = coalesce(p_tipo,'otro'),
           asunto = trim(p_asunto), cuerpo = trim(p_cuerpo),
           activa = coalesce(p_activa,true), orden = coalesce(p_orden,0),
           actualizada_en = now()
     where id = p_id returning * into v;
    if v.id is null then raise exception 'Esa plantilla ya no existe.'; end if;
  end if;
  return v;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_plantilla_usada(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (cem_is_staff() or cem_is_teacher()) then
    raise exception 'No autorizado.';
  end if;
  update cem_plantillas_mensaje set usos = usos + 1 where id = p_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_plantillas_mensaje_listar(p_todas boolean DEFAULT false)
 RETURNS SETOF cem_mensajes_plantilla
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select t.* from cem_mensajes_plantilla t
   where (cem_puede_cobranza() or cem_is_staff())
     and (p_todas or t.activa)
   order by t.orden, t.nombre;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_poner_nota(p_assessment_id uuid, p_enrollment_id uuid, p_puntaje numeric, p_feedback text DEFAULT NULL::text)
 RETURNS cem_submissions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ev  public.cem_assessments;
  v_coh uuid;
  v     public.cem_submissions;
  v_estado public.cem_entrega_estado;
begin
  select * into v_ev from public.cem_assessments where id = p_assessment_id;
  if v_ev.id is null then raise exception 'Esa evaluación no existe.'; end if;
  select cohort_id into v_coh from public.cem_enrollments where id = p_enrollment_id;
  if not public.cem_dicta_cohorte(v_coh) then
    raise exception 'Sólo quien dicta esta cohorte puede calificar.';
  end if;
  if p_puntaje is not null and (p_puntaje < 0 or p_puntaje > coalesce(v_ev.puntaje_max, 100)) then
    raise exception 'La nota tiene que estar entre 0 y %.', coalesce(v_ev.puntaje_max, 100);
  end if;

  v_estado := (case when p_puntaje is null then 'entregada' else 'calificada' end)::public.cem_entrega_estado;

  select * into v from public.cem_submissions
   where assessment_id = p_assessment_id and enrollment_id = p_enrollment_id
   order by intento desc limit 1;

  if v.id is null then
    insert into public.cem_submissions (assessment_id, enrollment_id, intento, respuestas,
      puntaje, estado, feedback, calificado_por, entregado_en, calificado_en)
    values (p_assessment_id, p_enrollment_id, 1, '{}'::jsonb,
      p_puntaje, v_estado, p_feedback, auth.uid(), now(),
      case when p_puntaje is null then null else now() end)
    returning * into v;
  else
    update public.cem_submissions
       set puntaje = p_puntaje,
           estado = v_estado,
           feedback = coalesce(p_feedback, feedback),
           calificado_por = auth.uid(),
           calificado_en = case when p_puntaje is null then null else now() end
     where id = v.id returning * into v;
  end if;

  perform public.cem_recalc_progress(p_enrollment_id);
  return v;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_por_canal(p_dias integer DEFAULT 365)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with limites as (select (now() - make_interval(days => greatest(p_dias, 1))) as desde),

  -- Un contacto por correo: el primero que dejó. Quien está pensándoselo
  -- rellena el formulario dos y tres veces, a veces diciendo un canal distinto
  -- cada vez, y sin esto lo cobrado se sumaba una vez por formulario.
  primerContacto as (
    select distinct on (lower(l.email))
           lower(l.email) as email,
           coalesce(nullif(btrim(l.como_nos_conocio), ''), 'No lo dijo') as canal
      from cem_leads l
     where l.created_at >= (select desde from limites)
       and coalesce(btrim(l.email), '') <> ''
     order by lower(l.email), l.created_at
  ),

  ins as (
    select e.id, e.profile_id,
           coalesce((select sum(coalesce(pa.monto_base, pa.monto))
                       from cem_payments pa
                      where pa.enrollment_id = e.id and pa.estado = 'confirmado'), 0) as cobrado,
           exists (select 1 from cem_payments pa
                    where pa.enrollment_id = e.id and pa.estado = 'confirmado') as pago
      from cem_enrollments e
     where e.fecha_inscripcion >= (select desde from limites)
       and e.estado <> 'cancelada'
  ),

  porCanal as (
    select c.canal,
           count(distinct c.email) as contactos,
           count(distinct pr.id) as con_cuenta,
           count(distinct i.id) as inscritos,
           count(distinct i.id) filter (where i.pago) as pagaron,
           coalesce(sum(i.cobrado), 0) as cobrado
      from primerContacto c
      left join cem_profiles pr on lower(pr.email) = c.email
      left join ins i on i.profile_id = pr.id
     group by 1
  ),

  sinContacto as (
    select 'Se inscribió directo, sin dejar contacto' as canal,
           0::bigint as contactos,
           count(distinct i.profile_id) as con_cuenta,
           count(distinct i.id) as inscritos,
           count(distinct i.id) filter (where i.pago) as pagaron,
           coalesce(sum(i.cobrado), 0) as cobrado
      from ins i
      left join cem_profiles pr on pr.id = i.profile_id
     where not exists (select 1 from cem_leads l2
                        where lower(l2.email) = lower(coalesce(pr.email, '')))
  )

  select case when not cem_is_staff() then '[]'::jsonb else
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'canal', t.canal, 'contactos', t.contactos, 'con_cuenta', t.con_cuenta,
               'inscritos', t.inscritos, 'pagaron', t.pagaron, 'cobrado', t.cobrado,
               'conversion', case when t.contactos > 0
                                  then round(100.0 * t.pagaron / t.contactos, 1) end)
             order by t.cobrado desc, t.contactos desc)
        from (select * from porCanal
              union all
              select * from sinContacto where inscritos > 0) t
    ), '[]'::jsonb) end;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_preguntar(p_lesson_id uuid, p_cuerpo text, p_segundo integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_curso uuid; v_cohorte uuid; v_id uuid; v_titulo text; v_quien text; r record;
begin
  if not cem_puede_ver_leccion(p_lesson_id) then
    raise exception 'Esta lección no es tuya.';
  end if;
  if coalesce(trim(p_cuerpo), '') = '' then
    raise exception 'Escribe la duda antes de enviarla.';
  end if;

  select m.course_id, l.titulo into v_curso, v_titulo
    from cem_lessons l join cem_modules m on m.id = l.module_id where l.id = p_lesson_id;

  select e.cohort_id into v_cohorte
    from cem_enrollments e
   where e.profile_id = auth.uid() and e.course_id = v_curso
   order by e.fecha_inscripcion desc limit 1;

  insert into cem_dudas (lesson_id, course_id, cohort_id, autor_id, cuerpo, segundo)
  values (p_lesson_id, v_curso, v_cohorte, auth.uid(), trim(p_cuerpo),
          nullif(greatest(coalesce(p_segundo, 0), 0), 0))
  returning id into v_id;

  select trim(coalesce(nombre,'') || ' ' || coalesce(apellido,'')) into v_quien
    from cem_profiles where id = auth.uid();

  -- Al profesor que la dicta. Sin esto la pregunta se queda esperando a que
  -- alguien entre por casualidad, que es justo lo que pasaba con WhatsApp.
  for r in
    select distinct ta.teacher_id from cem_teacher_assignments ta
     where ta.course_id = v_curso
        or exists (select 1 from cem_cohorts c where c.id = ta.cohort_id and c.course_id = v_curso)
  loop
    perform cem_notificar(r.teacher_id, 'duda_nueva',
      format('Nueva duda en «%s»', v_titulo),
      format('%s pregunta: %s', coalesce(nullif(v_quien,''),'Un estudiante'),
             left(trim(p_cuerpo), 160)),
      'docente/aula.html?leccion=' || p_lesson_id::text);
  end loop;

  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_publicar_perfil(p_publicar boolean, p_muestra jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_perfil public.cem_profiles;
begin
  select * into v_perfil from public.cem_profiles where id = auth.uid();
  if v_perfil.id is null then
    raise exception 'No hay una sesión válida.';
  end if;

  update public.cem_profiles set
    perfil_publico = p_publicar,
    perfil_muestra = coalesce(p_muestra, perfil_muestra),
    -- El slug se calcula una vez y no cambia: un enlace repartido no se rompe
    -- porque alguien corrija una tilde de su nombre.
    perfil_slug = coalesce(perfil_slug,
                           public.cem_slug_perfil(v_perfil.nombre, v_perfil.apellido, v_perfil.id))
  where id = auth.uid();

  select * into v_perfil from public.cem_profiles where id = auth.uid();
  return jsonb_build_object(
    'publico', v_perfil.perfil_publico,
    'slug', v_perfil.perfil_slug,
    'muestra', v_perfil.perfil_muestra);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_puente_latido(p_estado jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_antes boolean;
  v_habia boolean;
  v_ahora boolean := coalesce((p_estado->>'conectado')::boolean, false);
begin
  select conectado, true into v_antes, v_habia from cem_puente_estado where id;

  insert into cem_puente_estado as e
    (id, conectado, numero, modo, version, ultimo_latido, arrancado,
     mensajes, respondidos, fallos, actualizado)
  values (true, v_ahora,
     nullif(p_estado->>'numero', ''),
     nullif(p_estado->>'modo', ''),
     nullif(p_estado->>'version', ''),
     now(),
     nullif(p_estado->>'arrancado', '')::timestamptz,
     coalesce((p_estado->>'mensajes')::int, 0),
     coalesce((p_estado->>'respondidos')::int, 0),
     coalesce((p_estado->>'fallos')::int, 0),
     now())
  on conflict (id) do update set
     conectado = excluded.conectado,
     numero = coalesce(excluded.numero, e.numero),
     modo = coalesce(excluded.modo, e.modo),
     version = coalesce(excluded.version, e.version),
     ultimo_latido = now(),
     -- El arranque es el del proceso que late AHORA: si se reinició, la cuenta
     -- de «lleva dos horas sin vincular» tiene que empezar de nuevo.
     arrancado = coalesce(excluded.arrancado, e.arrancado),
     mensajes = excluded.mensajes,
     respondidos = excluded.respondidos,
     fallos = excluded.fallos,
     -- Al volver se limpian las marcas, para que la próxima caída sí avise.
     avisado_caida = case when excluded.conectado then null else e.avisado_caida end,
     avisado_sin_vincular = case when excluded.conectado then null else e.avisado_sin_vincular end,
     actualizado = now();

  -- Volvió después de una caída: se dice. Si no, el equipo se queda con el
  -- susto y sin la resolución, y acaba ignorando los dos avisos.
  if v_ahora and v_habia and v_antes is distinct from true then
    perform cem_avisar_equipo(
      'puente_whatsapp',
      'El WhatsApp volvió a estar conectado',
      case when nullif(p_estado->>'numero','') is not null
           then 'Conectado como +' || (p_estado->>'numero') || '.'
           else 'El puente volvió a conectar.' end,
      '/plataforma/admin/asistente.html',
      array['coordinador','admin','superadmin']);
  end if;

  return jsonb_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_puente_modo_poner(p_modo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_antes text; v_rol text; v_yo uuid := auth.uid();
begin
  if p_modo not in ('apagada','escucha','responde') then
    raise exception 'El modo tiene que ser apagada, escucha o responde. Llegó: %', p_modo;
  end if;

  select rol::text into v_rol from cem_profiles where id = v_yo and activo;
  if v_rol is null or v_rol not in ('coordinador','admin','superadmin') then
    raise exception 'Sólo coordinación o dirección pueden encender o apagar el WhatsApp.';
  end if;
  if cem_es_auditor() then
    raise exception 'Una cuenta de auditoría es de sólo lectura.';
  end if;

  select valor #>> '{}' into v_antes from cem_settings where clave = 'asistente_whatsapp_modo';

  insert into cem_settings (clave, valor, descripcion)
  values ('asistente_whatsapp_modo', to_jsonb(p_modo),
          'Manda sobre el modo del puente: apagada / escucha / responde.')
  on conflict (clave) do update set valor = excluded.valor;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, riesgo, detalle)
  values (v_yo,
          (select email from cem_profiles where id = v_yo),
          'asistente.whatsapp_modo', 'cem_settings', 'alto',
          jsonb_build_object('antes', v_antes, 'ahora', p_modo));

  return jsonb_build_object('modo', p_modo, 'antes', v_antes);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_puente_ver()
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare e record; v_seg numeric; v_en_pie boolean;
begin
  select * into e from cem_puente_estado where id;
  if not found then
    return jsonb_build_object('hay', false, 'estado', 'sin montar');
  end if;
  v_seg := extract(epoch from (now() - e.ultimo_latido));
  -- «En pie» es que el PROCESO late. «Conectado» es que además WhatsApp está
  -- vinculado. Son tres estados y no dos: sin montar, en pie pero sin
  -- vincular, y conectado. Confundir los dos últimos manda a mirar la máquina
  -- cuando lo que falta es escanear un QR.
  v_en_pie := v_seg < 600;
  return jsonb_build_object(
    'hay', true,
    'estado', case when not v_en_pie then 'caido'
                   when e.conectado then 'conectado'
                   else 'sin vincular' end,
    'en_pie', v_en_pie,
    'conectado', e.conectado,
    'vivo', v_en_pie and e.conectado,
    'numero', e.numero,
    'modo', e.modo,
    'version', e.version,
    'segundos_sin_latir', floor(v_seg),
    'ultimo_latido', e.ultimo_latido,
    'arrancado', e.arrancado,
    'mensajes', e.mensajes,
    'respondidos', e.respondidos,
    'fallos', e.fallos);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_puente_vigilar()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare e record; v_min numeric; v_avisados int; v_desvinculado_min numeric;
begin
  select * into e from cem_puente_estado where id;
  if not found or e.ultimo_latido is null then
    return jsonb_build_object('estado', 'sin montar');
  end if;

  v_min := extract(epoch from (now() - e.ultimo_latido)) / 60;

  /* ── Caído: ni late ────────────────────────────────────────────────────
     Quince minutos, no tres. El puente late cada dos, pero una máquina de
     casa pierde el wifi un rato y Baileys reconecta solo con espera creciente
     de hasta un minuto. Avisar a los tres sería avisar por cosas que se
     arreglan solas, y un aviso que suele ser falso deja de leerse — que es
     peor que no tenerlo. */
  if v_min >= 15 then
    if e.avisado_caida is not null then
      return jsonb_build_object('estado', 'caido', 'ya_avisado', e.avisado_caida,
                                'minutos_sin_latir', round(v_min, 1));
    end if;
    v_avisados := cem_avisar_equipo(
      'puente_whatsapp',
      'El WhatsApp lleva ' || round(v_min) || ' minutos sin dar señales',
      'La máquina donde corre el puente no está respondiendo. Mientras siga así, '
      || 'a quien escriba al número no se le contesta NI se le anota la pregunta. '
      || 'Mira que esté encendida y que no se haya dormido; si hizo falta, se '
      || 'arranca con: npx pm2 restart cem-puente',
      '/plataforma/admin/asistente.html',
      array['coordinador','admin','superadmin']);
    update cem_puente_estado set avisado_caida = now(), conectado = false where id;
    return jsonb_build_object('estado', 'caido', 'avisados', v_avisados,
                              'minutos_sin_latir', round(v_min, 1));
  end if;

  /* ── En pie pero sin vincular ──────────────────────────────────────────
     Late, o sea que la máquina está bien, pero WhatsApp no está enlazado.
     Pasa de verdad y en silencio: WhatsApp cierra la sesión desde el
     teléfono, el proceso se reinicia solo, y se queda esperando un QR que
     nadie escanea. Todo «funciona» y el número no atiende a nadie.

     Dos horas de margen para no avisar mientras se está montando. */
  if not e.conectado then
    v_desvinculado_min := extract(epoch from (now() - coalesce(e.arrancado, e.ultimo_latido))) / 60;
    if v_desvinculado_min >= 120 and e.avisado_sin_vincular is null then
      v_avisados := cem_avisar_equipo(
        'puente_whatsapp',
        'El WhatsApp está sin vincular',
        'El puente está encendido y funcionando, pero no hay ninguna sesión de '
        || 'WhatsApp enlazada: hay que escanear el QR otra vez desde el teléfono '
        || 'del negocio (WhatsApp → Dispositivos vinculados). Mientras tanto el '
        || 'número no atiende ni anota nada.',
        '/plataforma/admin/asistente.html',
        array['coordinador','admin','superadmin']);
      update cem_puente_estado set avisado_sin_vincular = now() where id;
      return jsonb_build_object('estado', 'sin vincular', 'avisados', v_avisados);
    end if;
    return jsonb_build_object('estado', 'sin vincular',
                              'ya_avisado', e.avisado_sin_vincular,
                              'minutos', round(v_desvinculado_min, 1));
  end if;

  return jsonb_build_object('estado', 'conectado', 'minutos_sin_latir', round(v_min, 1));
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_puede_cobranza()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from cem_profiles
                  where id = auth.uid() and activo
                    and rol in ('cobranza','coordinador','admin','superadmin'));
$function$
;
comment on function public.cem_puede_cobranza() is 'Ver y mover dinero. Incluye el rol acotado "cobranza", que no toca lo académico.';

CREATE OR REPLACE FUNCTION public.cem_puede_invitar_a(p_rol cem_role)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when cem_es_admin() then true
    when cem_role() = 'coordinador' then p_rol in ('profesor','estudiante')
    else false
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_puede_ver_leccion(p_lesson_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from cem_lessons l join cem_modules m on m.id = l.module_id
     where l.id = p_lesson_id
       and (cem_can_read_all()
            or cem_docente_de_curso(m.course_id)
            or exists (select 1 from cem_enrollments e
                        where e.profile_id = auth.uid()
                          and e.course_id = m.course_id
                          and cem_acceso_abierto(e.id))));
$function$
;

CREATE OR REPLACE FUNCTION public.cem_puntaje_evaluacion(p_assessment_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'maximo', coalesce(a.puntaje_max, 100),
    'total', coalesce((select sum(aq.puntaje) from cem_assessment_questions aq
                        where aq.assessment_id = a.id), 0),
    'preguntas', (select count(*) from cem_assessment_questions aq where aq.assessment_id = a.id),
    'cuadra', round(coalesce((select sum(aq.puntaje) from cem_assessment_questions aq
                        where aq.assessment_id = a.id), 0), 2) = round(coalesce(a.puntaje_max, 100), 2))
  from cem_assessments a where a.id = p_assessment_id;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_puntajes_cohorte(p_cohort uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb;
begin
  if not public.cem_dicta_cohorte(p_cohort) then
    raise exception 'Sólo quien dicta esta cohorte o la coordinación pueden ver sus puntajes.';
  end if;

  select jsonb_build_object(
    'opinion', (
      select jsonb_build_object(
        'respuestas', count(*),
        'claridad', round(avg(claridad)::numeric, 2),
        'utilidad', round(avg(utilidad)::numeric, 2),
        'ritmo',    round(avg(ritmo)::numeric, 2),
        'general',  round(avg(((coalesce(claridad,0) + coalesce(utilidad,0) + coalesce(ritmo,0))::numeric)
                              / nullif((case when claridad is null then 0 else 1 end
                                      + case when utilidad is null then 0 else 1 end
                                      + case when ritmo    is null then 0 else 1 end), 0)), 2))
        from public.cem_valoraciones where cohort_id = p_cohort),

    'comentarios', coalesce((
      select jsonb_agg(jsonb_build_object('texto', comentario, 'cuando', created_at::date)
             order by created_at desc)
        from public.cem_valoraciones
       where cohort_id = p_cohort and comentario is not null), '[]'::jsonb),

    'por_clase', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.fecha desc) from (
        select cl.id, cl.titulo, cl.fecha, count(va.id) as respuestas,
               round(avg((va.claridad + va.utilidad + va.ritmo)::numeric / 3), 2) as nota
          from public.cem_classes cl
          left join public.cem_valoraciones va on va.class_id = cl.id
         where cl.cohort_id = p_cohort
         group by cl.id, cl.titulo, cl.fecha
      ) x), '[]'::jsonb),

    'retencion', (
      with base as (
        select e.id, e.progreso, e.estado::text as estado, e.ultimo_acceso
          from public.cem_enrollments e where e.cohort_id = p_cohort),
      asis as (
        select at.enrollment_id,
               count(*) filter (where at.presente)::numeric / nullif(count(*), 0) as tasa
          from public.cem_attendance at
          join base b on b.id = at.enrollment_id
         group by at.enrollment_id),
      entregas as (
        select s.enrollment_id, count(*) as hechas
          from public.cem_submissions s join base b on b.id = s.enrollment_id
         where s.estado::text in ('entregada','calificada')
         group by s.enrollment_id)
      select jsonb_build_object(
        'inscritos',    (select count(*) from base),
        'activos',      (select count(*) from base where estado = 'activa'),
        'abandonos',    (select count(*) from base where estado in ('retirada','abandonada')),
        'en_riesgo',    (select count(*) from base
                          where estado = 'activa'
                            and (ultimo_acceso is null or ultimo_acceso < now() - interval '21 days')),
        'avance_medio', (select round(avg(progreso)::numeric, 1) from base),
        'asistencia',   (select round(avg(tasa) * 100, 1) from asis),
        'sin_entregar', (select count(*) from base b
                          where not exists (select 1 from entregas x where x.enrollment_id = b.id))
      ))
  ) into v;
  return v;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_rate_limit_consumir(p_clave text, p_tope integer DEFAULT 60, p_ventana_seg integer DEFAULT 60, p_castigo_seg integer DEFAULT 300)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v record;
begin
  insert into cem_rate_limit (clave, ventana_en, intentos)
  values (p_clave, now(), 1)
  on conflict (clave) do update
     set intentos   = case when cem_rate_limit.ventana_en < now() - make_interval(secs => p_ventana_seg)
                           then 1 else cem_rate_limit.intentos + 1 end,
         ventana_en = case when cem_rate_limit.ventana_en < now() - make_interval(secs => p_ventana_seg)
                           then now() else cem_rate_limit.ventana_en end
  returning * into v;

  if v.bloqueado_hasta is not null and v.bloqueado_hasta > now() then
    return false;
  end if;
  if v.intentos > p_tope then
    update cem_rate_limit
       set bloqueado_hasta = now() + make_interval(secs => p_castigo_seg)
     where clave = p_clave;
    return false;
  end if;
  return true;
end $function$
;
comment on function public.cem_rate_limit_consumir(p_clave text, p_tope integer, p_ventana_seg integer, p_castigo_seg integer) is 'Devuelve false cuando la clave excedió el tope en su ventana. La usa el webhook público del banco.';

CREATE OR REPLACE FUNCTION public.cem_reabrir_entrega(p_submission_id uuid, p_motivo text)
 RETURNS cem_submissions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_s cem_submissions; v_perfil uuid; v_eval text;
begin
  if not (cem_is_staff() or cem_is_teacher()) then
    raise exception 'Sólo un docente o el personal autorizado puede reabrir una entrega.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Explica por qué la reabres: queda registrado y el estudiante lo lee.';
  end if;

  select * into v_s from cem_submissions where id = p_submission_id;
  if v_s.id is null then raise exception 'No encontramos esa entrega.'; end if;
  if v_s.entregado_en is null then
    raise exception 'Esa entrega todavía está en progreso: no hace falta reabrirla.';
  end if;

  update cem_submissions
     set estado = 'en_progreso',
         entregado_en = null,
         calificado_en = null,
         calificado_por = null,
         puntaje = null,
         feedback = trim(coalesce(feedback || E'\n\n', '') || 'Reabierta para corregir: ' || trim(p_motivo))
   where id = p_submission_id
   returning * into v_s;

  select e.profile_id, a.nombre into v_perfil, v_eval
    from cem_enrollments e, cem_assessments a
   where e.id = v_s.enrollment_id and a.id = v_s.assessment_id;

  perform cem_notificar(v_perfil, 'entrega_reabierta',
    format('Te reabrimos "%s" para corregir', coalesce(v_eval, 'una evaluación')),
    format('Motivo: %s. Entra y vuelve a enviarla.', trim(p_motivo)),
    'estudiante/evaluaciones.html');

  insert into cem_audit_events (actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'entrega_reabierta', 'cem_submissions', p_submission_id, 'medio',
          jsonb_build_object('motivo', trim(p_motivo), 'puntaje_anterior', v_s.puntaje));

  return v_s;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_recalc_progress(p_enrollment_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_course uuid; v_peso numeric;
        v_lec_total int; v_lec_hechas int; v_pct_lec numeric := 0;
        v_ev_total int; v_ev_ok int; v_pct_ev numeric := 0;
        v_pct numeric;
begin
  select e.course_id, coalesce(c.peso_evaluaciones, 30)
    into v_course, v_peso
    from cem_enrollments e join cem_courses c on c.id = e.course_id
   where e.id = p_enrollment_id;

  select count(*) into v_lec_total from cem_lessons l
    join cem_modules m on m.id = l.module_id where m.course_id = v_course;
  select count(*) into v_lec_hechas from cem_lesson_progress lp
    join cem_lessons l on l.id = lp.lesson_id
    join cem_modules m on m.id = l.module_id
   where lp.enrollment_id = p_enrollment_id and lp.completado and m.course_id = v_course;
  if v_lec_total > 0 then v_pct_lec := 100.0 * v_lec_hechas / v_lec_total; end if;

  -- Sólo cuentan las evaluaciones publicadas: un borrador no puede frenar a nadie.
  select count(*) into v_ev_total from cem_assessments a
   where a.course_id = v_course and a.estado = 'publicado';
  select count(distinct s.assessment_id) into v_ev_ok
    from cem_submissions s join cem_assessments a on a.id = s.assessment_id
   where s.enrollment_id = p_enrollment_id
     and a.course_id = v_course and a.estado = 'publicado'
     and s.estado = 'calificada'
     and s.puntaje >= coalesce(a.nota_aprobatoria, 0);
  if v_ev_total > 0 then v_pct_ev := 100.0 * v_ev_ok / v_ev_total; end if;

  v_pct := case
    when v_ev_total = 0 then v_pct_lec
    when v_lec_total = 0 then v_pct_ev
    else v_pct_lec * (100 - v_peso) / 100.0 + v_pct_ev * v_peso / 100.0
  end;
  v_pct := round(least(100, greatest(0, v_pct)), 2);

  update cem_enrollments set progreso = v_pct, ultimo_acceso = now() where id = p_enrollment_id;

  begin
    perform cem_evaluar_insignias((select profile_id from cem_enrollments where id = p_enrollment_id));
  exception when others then
    -- A propósito en silencio: el avance ya quedó guardado, que es lo que
    -- importaba. Si aquí se levantara la excepción, la nota se perdería.
    null;
  end;

  begin
    -- Quien termina un módulo que certifica se lleva su título sin que nadie
    -- tenga que acordarse de dárselo. Mismo silencio y misma razón.
    perform cem_certificar_modulos_terminados(p_enrollment_id);
  exception when others then
    null;
  end;

  return v_pct;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_rechazar_pago(p_payment_id uuid, p_motivo text)
 RETURNS cem_payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_pago public.cem_payments;
begin
  if not public.cem_puede_cobranza() then
    raise exception 'Sólo el personal de cobranza puede rechazar un pago.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Hay que explicar por qué se rechaza, para que el estudiante pueda corregirlo.';
  end if;
  select * into v_pago from public.cem_payments where id = p_payment_id;
  if v_pago.id is null then raise exception 'Ese pago no existe.'; end if;
  if v_pago.estado = 'confirmado' then
    raise exception 'Ese pago ya fue aprobado; para revertirlo hay que anularlo, no rechazarlo.';
  end if;

  update public.cem_payments
     set estado = 'rechazado', conciliado = false, nota = btrim(p_motivo)
   where id = p_payment_id
   returning * into v_pago;

  insert into public.cem_audit_events (accion, entidad, entidad_id, riesgo, detalle)
  values ('pago_rechazado', 'cem_payments', p_payment_id, 'medio',
          jsonb_build_object('referencia', v_pago.referencia, 'motivo', btrim(p_motivo)));

  return v_pago;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_recibo_pago(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_pago cem_payments; v_e cem_enrollments; v_p cem_profiles; v_c cem_courses; v_i cem_installments;
begin
  select * into v_pago from cem_payments where id = p_payment_id;
  if v_pago.id is null then raise exception 'No encontramos ese pago.'; end if;
  select * into v_e from cem_enrollments where id = v_pago.enrollment_id;
  if v_e.profile_id <> auth.uid() and not (cem_is_staff() or cem_puede_cobranza()) then
    raise exception 'Sólo puedes descargar recibos de tus propios pagos.';
  end if;
  if v_pago.estado not in ('confirmado','registrado') then
    raise exception 'Sólo se emite recibo de un pago ya confirmado.';
  end if;

  select * into v_p from cem_profiles where id = v_e.profile_id;
  select * into v_c from cem_courses where id = v_e.course_id;
  select * into v_i from cem_installments where id = v_pago.installment_id;

  return jsonb_build_object(
    -- Un número de recibo estable y legible, derivado del propio pago: no
    -- hace falta una secuencia aparte y siempre da lo mismo para el mismo pago.
    'numero', 'REC-' || to_char(v_pago.fecha, 'YYYYMM') || '-' || upper(substr(replace(v_pago.id::text, '-', ''), 1, 6)),
    'emitido_en', to_char(now(), 'DD/MM/YYYY HH24:MI'),
    'estudiante', trim(coalesce(v_p.nombre,'') || ' ' || coalesce(v_p.apellido,'')),
    'documento', cem_formato_cedula(v_p.documento),
    'email', v_p.email,
    'programa', v_c.nombre,
    'cuota', v_i.numero,
    'fecha', to_char(v_pago.fecha, 'DD/MM/YYYY'),
    'monto', v_pago.monto, 'moneda', v_pago.moneda,
    'tasa', v_pago.tasa, 'monto_base', v_pago.monto_base,
    'metodo', v_pago.metodo, 'referencia', v_pago.referencia,
    'estado', v_pago.estado);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_recurso_borrar(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cod text;
begin
  if not cem_is_staff() then
    raise exception 'Sólo el equipo puede borrar recursos.' using errcode = '42501';
  end if;
  delete from cem_recursos where id = p_id returning codigo into v_cod;
  if v_cod is null then raise exception 'Ese recurso ya no existe.'; end if;
  insert into cem_audit_events (actor_id, actor_email, accion, entidad, riesgo, detalle)
  select auth.uid(), (select email from cem_profiles where id = auth.uid()),
         'recurso.borrado', 'cem_recursos', 'medio',
         jsonb_build_object('codigo', v_cod,
           'nota', 'Los contactos que lo pidieron se conservan; el recuento de entregas se va con él.');
  return jsonb_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_recurso_entregar(p_codigo text, p_nombre text, p_apellido text, p_email text, p_telefono text, p_origen text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r        cem_recursos;
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 120);
  v_apell  text := nullif(left(btrim(coalesce(p_apellido, '')), 120), '');
  v_email  text := nullif(lower(left(btrim(coalesce(p_email, '')), 200)), '');
  v_tel    text := nullif(left(btrim(coalesce(p_telefono, '')), 40), '');
  v_lead   uuid;
  v_ya     boolean;
begin
  select * into r from cem_recursos where codigo = lower(btrim(p_codigo));
  if r.id is null then
    raise exception 'Ese enlace no corresponde a ningún recurso.' using errcode = '42704';
  end if;
  if not r.activo then
    raise exception 'Este material ya no está disponible.' using errcode = '42704';
  end if;

  if v_nombre = '' then raise exception 'Hace falta tu nombre.'; end if;
  if v_apell is null then raise exception 'Hace falta tu apellido.'; end if;
  if v_email is null then raise exception 'Hace falta tu correo: es a donde te lo mandamos.'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' then
    raise exception 'Ese correo no parece una dirección válida.';
  end if;
  if v_tel is null then raise exception 'Hace falta tu teléfono.'; end if;

  -- ¿Ya se le había dado ESTE material? Si sí, se le vuelve a dar —perdió el
  -- enlace, se le caducó, cambió de móvil— pero no se apunta otra vez.
  select exists(select 1 from cem_recurso_entregas e
                 where e.recurso_id = r.id and e.email = v_email) into v_ya;

  -- La persona, buscada por correo. Si ya estaba —del formulario de la web o
  -- de otro material— se le añade lo que falte y se queda en una sola ficha.
  select id into v_lead from cem_leads
   where lower(trim(email)) = v_email limit 1;

  if v_lead is null then
    insert into cem_leads (nombre, apellido, email, telefono, interes, origen, como_nos_conocio)
    values (v_nombre, v_apell, v_email, v_tel, r.titulo,
            coalesce(nullif(left(btrim(coalesce(p_origen, '')), 120), ''), 'recurso:' || r.codigo),
            'redes sociales')
    returning id into v_lead;
  else
    /* Sólo se rellenan los huecos. `interes` no se pisa a propósito: si esa
       persona escribió «quiero información del MBA», eso vale más que el
       título del último PDF que se bajó. Lo que ha ido pidiendo se ve entero
       en su columna de materiales, que para eso está. */
    update cem_leads set
      apellido = coalesce(apellido, v_apell),
      telefono = coalesce(telefono, v_tel),
      interes  = coalesce(interes, r.titulo),
      nombre   = case when coalesce(trim(nombre), '') = '' then v_nombre else nombre end
     where id = v_lead;
  end if;

  if not v_ya then
    insert into cem_recurso_entregas (recurso_id, lead_id, email, origen)
    values (r.id, v_lead, v_email, p_origen)
    on conflict (recurso_id, email) do nothing;
  end if;

  return jsonb_build_object(
    'ok', true, 'repetido', v_ya,
    'titulo', r.titulo, 'tipo', r.tipo,
    'storage_path', r.storage_path, 'archivo_nombre', r.archivo_nombre,
    'video_id', r.video_id, 'url', r.url,
    'email', v_email, 'nombre', v_nombre);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_recurso_ficha(p_codigo text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when r.id is null then jsonb_build_object('existe', false)
    else jsonb_build_object(
      'existe', true,
      'activo', r.activo,
      'titulo', r.titulo,
      'descripcion', r.descripcion,
      'tipo', r.tipo,
      -- Para poder decir «PDF · 2,4 MB» sin entregar el archivo.
      'archivo_nombre', r.archivo_nombre)
  end
  from (select 1) uno
  left join cem_recursos r on r.codigo = lower(btrim(p_codigo));
$function$
;

CREATE OR REPLACE FUNCTION public.cem_recurso_guardar(p_id uuid, p_codigo text, p_titulo text, p_descripcion text, p_tipo text, p_storage_path text DEFAULT NULL::text, p_archivo_nombre text DEFAULT NULL::text, p_video_id text DEFAULT NULL::text, p_url text DEFAULT NULL::text, p_gancho text DEFAULT NULL::text, p_activo boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_cod text := lower(btrim(coalesce(p_codigo, '')));
begin
  if not cem_is_staff() then
    raise exception 'Sólo el equipo puede crear recursos.' using errcode = '42501';
  end if;
  if v_cod !~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$' then
    raise exception 'El código del enlace sólo lleva minúsculas, números y guiones, y al menos 3 caracteres. Llegó «%».', p_codigo;
  end if;
  if exists (select 1 from cem_recursos where codigo = v_cod and id is distinct from p_id) then
    raise exception 'Ya hay un recurso con el código «%». Los enlaces no se pueden repetir.', v_cod;
  end if;

  if p_id is null then
    insert into cem_recursos (codigo, titulo, descripcion, tipo, storage_path,
                              archivo_nombre, video_id, url, gancho, activo, creado_por)
    values (v_cod, btrim(p_titulo), nullif(btrim(coalesce(p_descripcion,'')),''), p_tipo,
            p_storage_path, p_archivo_nombre, nullif(btrim(coalesce(p_video_id,'')),''),
            nullif(btrim(coalesce(p_url,'')),''), nullif(btrim(coalesce(p_gancho,'')),''),
            coalesce(p_activo, true), auth.uid())
    returning id into v_id;
  else
    update cem_recursos set
      codigo = v_cod, titulo = btrim(p_titulo),
      descripcion = nullif(btrim(coalesce(p_descripcion,'')),''),
      tipo = p_tipo,
      -- Vacío quiere decir «déjalo como estaba»: al editar el título de un
      -- recurso no hay que volver a subir el archivo.
      storage_path   = coalesce(p_storage_path, storage_path),
      archivo_nombre = coalesce(p_archivo_nombre, archivo_nombre),
      video_id       = coalesce(nullif(btrim(coalesce(p_video_id,'')),''), video_id),
      url            = coalesce(nullif(btrim(coalesce(p_url,'')),''), url),
      gancho         = nullif(btrim(coalesce(p_gancho,'')),''),
      activo         = coalesce(p_activo, true),
      actualizado_en = now()
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Ese recurso ya no existe.'; end if;
  end if;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  select auth.uid(), (select email from cem_profiles where id = auth.uid()),
         case when p_id is null then 'recurso.creado' else 'recurso.editado' end,
         'cem_recursos', v_id, 'bajo',
         jsonb_build_object('codigo', v_cod, 'titulo', p_titulo, 'tipo', p_tipo);

  return jsonb_build_object('ok', true, 'id', v_id, 'codigo', v_cod);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_recurso_quienes(p_recurso_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(x order by x->>'cuando' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'cuando', e.created_at,
      'nombre', btrim(coalesce(l.nombre,'') || ' ' || coalesce(l.apellido,'')),
      'email', e.email,
      'telefono', l.telefono,
      'origen', e.origen,
      -- Lo que pasó después con esta persona, si es que pasó algo.
      'perfil_id', p.id,
      'rol', p.rol,
      'se_registro_en', p.created_at,
      'inscripciones', (select count(*) from cem_enrollments en
                         where en.profile_id = p.id
                           and en.estado not in ('cancelada'))
    ) as x
    from cem_recurso_entregas e
    left join cem_leads l on l.id = e.lead_id
    left join cem_profiles p on lower(btrim(p.email)) = lower(btrim(e.email))
    where e.recurso_id = p_recurso_id and cem_is_staff()
  ) t;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_recursos_listar()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', r.id, 'codigo', r.codigo, 'titulo', r.titulo,
      'descripcion', r.descripcion, 'tipo', r.tipo, 'gancho', r.gancho,
      'activo', r.activo, 'archivo_nombre', r.archivo_nombre,
      'storage_path', r.storage_path, 'video_id', r.video_id, 'url', r.url,
      'created_at', r.created_at,
      'personas', (select count(*) from cem_recurso_entregas e where e.recurso_id = r.id),
      -- Cuántos de ésos acabaron teniendo cuenta.
      'con_cuenta', (
        select count(*) from cem_recurso_entregas e
         where e.recurso_id = r.id
           and exists (select 1 from cem_profiles p
                        where lower(btrim(p.email)) = lower(btrim(e.email)))),
      'ultima', (select max(e.created_at) from cem_recurso_entregas e where e.recurso_id = r.id)
    ) as x
    from cem_recursos r
    where cem_is_staff()
  ) t;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_redactar(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select regexp_replace(
           regexp_replace(
             regexp_replace(coalesce(p, ''),
               '[A-Za-z0-9._%%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[correo]', 'g'),
             '[+]?[0-9][0-9 ()._-]{7,}[0-9]', '[numero]', 'g'),
           '\m[VEJGvejg]-?[0-9]{6,9}\M', '[documento]', 'g')
$function$
;

CREATE OR REPLACE FUNCTION public.cem_register_payment(p_installment_id uuid, p_monto numeric, p_metodo text DEFAULT NULL::text, p_referencia text DEFAULT NULL::text, p_comprobante text DEFAULT NULL::text)
 RETURNS cem_payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_inst cem_installments; v_pay cem_payments; v_pagado numeric;
begin
  if not cem_puede_cobranza() then raise exception 'No autorizado.'; end if;
  select * into v_inst from cem_installments where id = p_installment_id;
  if v_inst.id is null then raise exception 'Cuota no encontrada.'; end if;

  insert into cem_payments(enrollment_id, installment_id, monto, moneda, metodo, referencia, comprobante_url, registrado_por)
  values (v_inst.enrollment_id, p_installment_id, p_monto, v_inst.moneda, p_metodo, p_referencia, p_comprobante, auth.uid())
  returning * into v_pay;

  select coalesce(sum(monto),0) into v_pagado from cem_payments where installment_id = p_installment_id;
  update cem_installments set
    saldo = greatest(monto - v_pagado, 0),
    estado = case when v_pagado >= monto then 'pagada'::cem_cuota_estado
                  when v_pagado > 0 then 'parcial'::cem_cuota_estado
                  else estado end
  where id = p_installment_id;

  update cem_enrollments set estado = 'activa'
  where id = v_inst.enrollment_id and estado = 'pendiente';

  insert into cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'pago_registrado', 'cem_payments', v_pay.id, 'alto',
          jsonb_build_object('monto', p_monto, 'metodo', p_metodo));
  return v_pay;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_registrar_reproduccion(p_lesson_id uuid, p_segundos integer DEFAULT 0)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_course uuid; v_ip text; v_cab json;
begin
  if auth.uid() is null or p_lesson_id is null then return; end if;

  select m.course_id into v_course
    from cem_lessons l join cem_modules m on m.id = l.module_id
   where l.id = p_lesson_id;

  -- Sólo se registra a quien de verdad puede estar viendo eso. Si no, la tabla
  -- se llena de intentos y deja de significar nada.
  if not (cem_can_read_all() or exists (
        select 1 from cem_enrollments e
         where e.profile_id = auth.uid() and e.course_id = v_course
           and cem_acceso_abierto(e.id))) then
    return;
  end if;

  -- La IP la pone el servidor, de la cabecera que añade el proxy. Nunca la
  -- manda el navegador: sería pedirle a quien se investiga que rellene el
  -- informe.
  begin
    v_cab := current_setting('request.headers', true)::json;
  exception when others then v_cab := null; end;
  v_ip := split_part(coalesce(v_cab->>'x-forwarded-for', ''), ',', 1);

  insert into cem_reproducciones (profile_id, lesson_id, course_id, segundos, ip, navegador)
  values (auth.uid(), p_lesson_id, v_course, greatest(coalesce(p_segundos,0), 0),
          nullif(trim(v_ip),''), left(coalesce(v_cab->>'user-agent',''), 200))
  on conflict (profile_id, lesson_id, dia) do update
    set ultimo_en = now(),
        -- El mayor de los dos: si alguien retrocede el vídeo, lo ya visto no
        -- se deshace.
        segundos  = greatest(cem_reproducciones.segundos, excluded.segundos),
        ip        = coalesce(excluded.ip, cem_reproducciones.ip);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_reparto(p_ronda uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (cem_es_admin() or cem_es_auditor()) then
    raise exception 'Sólo la dirección puede ver el reparto de ganancias.';
  end if;
  return cem_reparto_calc(p_ronda);
end $function$
;
comment on function public.cem_reparto(p_ronda uuid) is 'El reparto entero, recalculado. Nunca guarda una ganancia: la deduce de los pagos y los gastos.';

CREATE OR REPLACE FUNCTION public.cem_reparto_calc(p_ronda uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_out jsonb;
begin
  with rondas as (
    select r.* from cem_rondas r where p_ronda is null or r.id = p_ronda
  ),
  ing as (
    select r.id as ronda_id, c.tipo as linea,
           sum(p.monto_base) as ingreso, count(*)::int as pagos
      from rondas r
      join cem_payments p on p.estado = 'confirmado'
       and p.fecha >= r.desde
       and p.fecha <  coalesce(r.hasta, date '9999-12-30') + 1
      join cem_enrollments e on e.id = p.enrollment_id
      join cem_courses c on c.id = e.course_id
     where p.monto_base is not null
     group by 1, 2
  ),
  gas as (
    select r.id as ronda_id, g.linea, sum(g.monto_base) as gasto, count(*)::int as n
      from rondas r
      join cem_gastos g on not coalesce(g.eliminado, false)
       and g.fecha >= r.desde and g.fecha <= coalesce(r.hasta, date '9999-12-30')
       and g.linea is not null and g.monto_base is not null
     group by 1, 2
  ),
  gas_comp as (
    select r.id as ronda_id, k.key::cem_course_tipo as linea,
           sum(g.monto_base * k.value::numeric / 100) as gasto
      from rondas r
      join cem_gastos g on not coalesce(g.eliminado, false)
       and g.fecha >= r.desde and g.fecha <= coalesce(r.hasta, date '9999-12-30')
       and g.reparto is not null and g.monto_base is not null
      cross join lateral jsonb_each_text(g.reparto) k
     group by 1, 2
  ),
  liq as (
    select l.ronda_id, l.inversor_id, l.linea, sum(l.monto_base) as liquidado
      from cem_liquidaciones l where not l.eliminado group by 1, 2, 3
  ),
  lineas as (
    select pt.ronda_id, pt.linea from cem_ronda_partes pt
      join rondas r on r.id = pt.ronda_id
    union select ronda_id, linea from ing
    union select ronda_id, linea from gas
    union select ronda_id, linea from gas_comp
  ),
  base as (
    select l.ronda_id, l.linea,
           coalesce(i.ingreso, 0)                       as ingreso,
           coalesce(i.pagos, 0)                         as pagos,
           coalesce(g.gasto, 0) + coalesce(gc.gasto, 0) as gastos,
           coalesce(i.ingreso, 0) - coalesce(g.gasto, 0) - coalesce(gc.gasto, 0) as ganancia
      from lineas l
      left join ing      i  on i.ronda_id  = l.ronda_id and i.linea  = l.linea
      left join gas      g  on g.ronda_id  = l.ronda_id and g.linea  = l.linea
      left join gas_comp gc on gc.ronda_id = l.ronda_id and gc.linea = l.linea
  ),
  partes as (
    select b.ronda_id, b.linea, pt.inversor_id, pt.pct, pt.aporte,
           b.ganancia * pt.pct / 100                          as le_toca,
           coalesce(lq.liquidado, 0)                          as liquidado,
           greatest(b.ganancia * pt.pct / 100 - coalesce(lq.liquidado, 0), 0) as le_debo,
           greatest(coalesce(lq.liquidado, 0) - b.ganancia * pt.pct / 100, 0) as a_favor
      from base b
      join cem_ronda_partes pt on pt.ronda_id = b.ronda_id and pt.linea = b.linea
      left join liq lq on lq.ronda_id = b.ronda_id and lq.inversor_id = pt.inversor_id
                      and lq.linea = b.linea
  )
  select jsonb_build_object(
    'inversores', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'nombre', i.nombre, 'color', i.color,
               'activo', i.activo, 'nota', i.nota) order by i.activo desc, i.nombre)
        from cem_inversores i), '[]'::jsonb),

    'rondas', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', r.id, 'nombre', r.nombre, 'desde', r.desde, 'hasta', r.hasta,
          'abierta', r.hasta is null, 'nota', r.nota,
          'lineas', coalesce((
            select jsonb_agg(jsonb_build_object(
                'linea', b.linea,
                'ingreso',  round(b.ingreso, 2),
                'pagos',    b.pagos,
                'gastos',   round(b.gastos, 2),
                'ganancia', round(b.ganancia, 2),
                'pct_total', coalesce((select round(sum(pt2.pct), 4) from cem_ronda_partes pt2
                                        where pt2.ronda_id = b.ronda_id and pt2.linea = b.linea), 0),
                'casa', round(b.ganancia, 2) - coalesce((
                          select sum(round(pp.le_toca, 2)) from partes pp
                           where pp.ronda_id = b.ronda_id and pp.linea = b.linea), 0),
                'partes', coalesce((
                  select jsonb_agg(jsonb_build_object(
                      'inversor_id', pp.inversor_id, 'pct', pp.pct,
                      'aporte',    round(pp.aporte, 2),
                      'le_toca',   round(pp.le_toca, 2),
                      'liquidado', round(pp.liquidado, 2),
                      'le_debo',   round(pp.le_debo, 2),
                      'a_favor',   round(pp.a_favor, 2)) order by pp.pct desc)
                    from partes pp
                   where pp.ronda_id = b.ronda_id and pp.linea = b.linea), '[]'::jsonb))
              order by b.ganancia desc)
            from base b where b.ronda_id = r.id), '[]'::jsonb))
        order by r.desde desc)
      from rondas r), '[]'::jsonb),

    'pendiente_por_inversor', coalesce((
      select jsonb_agg(jsonb_build_object(
               'inversor_id', x.inversor_id,
               'le_toca',   round(x.le_toca, 2),
               'liquidado', round(x.liquidado, 2),
               'le_debo',   round(x.le_debo, 2),
               'a_favor',   round(x.a_favor, 2)) order by x.le_debo desc)
        from (select pp.inversor_id, sum(pp.le_toca) le_toca, sum(pp.liquidado) liquidado,
                     sum(pp.le_debo) le_debo, sum(pp.a_favor) a_favor
                from partes pp group by 1) x), '[]'::jsonb),

    'capital', jsonb_build_object(
      'nuevo',       coalesce((select round(sum(a.monto_base), 2) from cem_aportes a
                                where not a.eliminado and a.tipo_capital = 'nuevo'), 0),
      'reinversion', coalesce((select round(sum(a.monto_base), 2) from cem_aportes a
                                where not a.eliminado and a.tipo_capital = 'reinversion'), 0)),

    'aportado_por_inversor', coalesce((
      select jsonb_agg(jsonb_build_object(
               'inversor_id', z.inversor_id, 'aportado', z.aportado,
               'movimientos', z.movimientos) order by z.aportado desc)
        from (select a.inversor_id, round(sum(a.monto_base), 2) as aportado,
                     count(*)::int as movimientos
                from cem_aportes a
               where not a.eliminado and a.tipo_capital = 'nuevo' and a.inversor_id is not null
               group by a.inversor_id) z), '[]'::jsonb),

    'sin_clasificar', jsonb_build_object(
      'gastos_n',     coalesce((select count(*)::int from cem_gastos g
                                 where not coalesce(g.eliminado,false)
                                   and g.linea is null and g.reparto is null), 0),
      'gastos_monto', coalesce((select round(sum(g.monto_base), 2) from cem_gastos g
                                 where not coalesce(g.eliminado,false)
                                   and g.linea is null and g.reparto is null), 0),
      'liquidaciones_sin_cartera', coalesce((select count(*)::int from cem_liquidaciones l
                                 where not l.eliminado and l.cartera_id is null), 0))
  ) into v_out;

  return v_out;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_reparto_sin_clasificar()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (cem_es_admin() or cem_es_auditor()) then
    raise exception 'Sólo la dirección puede ver esto.';
  end if;

  return jsonb_build_object(
    'gastos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', g.id, 'fecha', g.fecha, 'concepto', g.concepto,
               'categoria', g.categoria, 'monto', g.monto, 'moneda', g.moneda,
               'monto_base', g.monto_base, 'cartera_id', g.cartera_id)
             order by g.fecha desc)
        from cem_gastos g
       where not coalesce(g.eliminado, false)
         and g.linea is null and g.reparto is null), '[]'::jsonb),
    'liquidaciones', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'fecha', l.fecha, 'inversor', i.nombre,
               'linea', l.linea, 'monto', l.monto, 'moneda', l.moneda)
             order by l.fecha desc)
        from cem_liquidaciones l join cem_inversores i on i.id = l.inversor_id
       where not l.eliminado and l.cartera_id is null), '[]'::jsonb));
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_reparto_valido(j jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select j is null or (
    jsonb_typeof(j) = 'object'
    and j <> '{}'::jsonb
    and not exists (
      select 1 from jsonb_each_text(j) e
       where e.key not in ('masterclass','curso','programa','diplomado','maestria')
          or e.value !~ '^[0-9]+(\.[0-9]+)?$')
    and (select round(coalesce(sum(e.value::numeric), 0), 4)
           from jsonb_each_text(j) e) = 100
  );
$function$
;
comment on function public.cem_reparto_valido(j jsonb) is 'Un mapa de reparto válido: líneas reales, números, y que sumen 100.';

CREATE OR REPLACE FUNCTION public.cem_replanificar_cuotas(p_enrollment_id uuid, p_cuotas integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_e cem_enrollments; v_restante numeric := 0; v_moneda text;
  v_desde date; v_num int; v_cuota numeric; v_resto numeric; i int;
  v_intocables int;
begin
  if not cem_is_staff() then raise exception 'No autorizado.'; end if;
  if coalesce(p_cuotas, 0) not between 1 and 24 then
    raise exception 'El número de cuotas tiene que estar entre 1 y 24.';
  end if;

  select * into v_e from cem_enrollments where id = p_enrollment_id;
  if v_e.id is null then raise exception 'No encontramos esa inscripción.'; end if;

  select count(*) into v_intocables
    from cem_installments i
   where i.enrollment_id = p_enrollment_id
     and i.estado in ('pendiente','vencida','congelada')
     and exists (select 1 from cem_payments pa where pa.installment_id = i.id);
  if v_intocables > 0 then
    raise exception 'Hay % cuota(s) con un pago detrás esperando. Resuélvelo antes de cambiar el plan.', v_intocables;
  end if;

  select coalesce(sum(coalesce(saldo, monto)), 0), max(moneda), min(fecha_vencimiento)
    into v_restante, v_moneda, v_desde
    from cem_installments
   where enrollment_id = p_enrollment_id and estado in ('pendiente','vencida','congelada');

  if v_restante <= 0 then
    raise exception 'No queda nada por pagar en esta inscripción.';
  end if;

  delete from cem_installments
   where enrollment_id = p_enrollment_id and estado in ('pendiente','vencida','congelada');

  select coalesce(max(numero), 0) into v_num
    from cem_installments where enrollment_id = p_enrollment_id;

  -- La primera vence dentro de un mes, o en su fecha original si todavía no
  -- llegó: cambiar de plan no puede adelantar lo que ya estaba más lejos.
  v_desde := greatest(coalesce(v_desde, current_date), current_date + 30);

  -- El céntimo que sobra al dividir va en la última: repartirlo a ojo es como
  -- la suma de las cuotas deja de ser el precio.
  v_cuota := round(v_restante / p_cuotas, 2);
  v_resto := v_restante - (v_cuota * p_cuotas);

  for i in 1..p_cuotas loop
    insert into cem_installments (enrollment_id, numero, monto, saldo, moneda,
                                  fecha_vencimiento, estado)
    values (p_enrollment_id, v_num + i,
            v_cuota + case when i = p_cuotas then v_resto else 0 end,
            v_cuota + case when i = p_cuotas then v_resto else 0 end,
            coalesce(v_moneda, v_e.moneda, 'EUR'),
            (v_desde + ((i - 1) * interval '1 month'))::date,
            'pendiente');
  end loop;

  insert into cem_audit_events (actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'plan_de_pago_cambiado', 'cem_enrollments', p_enrollment_id, 'alto',
          jsonb_build_object('cuotas', p_cuotas, 'restante', v_restante, 'moneda', v_moneda));

  return jsonb_build_object('cuotas', p_cuotas, 'restante', v_restante,
                            'cada_una', v_cuota, 'desde', v_desde);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_reportar_pago(p_installment_id uuid, p_monto numeric, p_moneda text, p_referencia text, p_metodo text, p_fecha timestamp with time zone DEFAULT now(), p_comprobante_url text DEFAULT NULL::text, p_nota text DEFAULT NULL::text)
 RETURNS cem_payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cuota  public.cem_installments;
  v_enroll public.cem_enrollments;
  v_conv   record;
  v_saldo  numeric;
  v_nota   text;
  v_pago   public.cem_payments;
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto del pago debe ser mayor que cero.';
  end if;
  if coalesce(btrim(p_referencia), '') = '' then
    raise exception 'Hace falta el número de referencia del pago.';
  end if;

  select * into v_cuota from public.cem_installments where id = p_installment_id;
  if v_cuota.id is null then raise exception 'La cuota indicada no existe.'; end if;
  select * into v_enroll from public.cem_enrollments where id = v_cuota.enrollment_id;
  if not (v_enroll.profile_id = auth.uid() or public.cem_is_staff() or public.cem_es_servidor()) then
    raise exception 'No puedes reportar un pago de una inscripción que no es tuya.';
  end if;

  -- un pago anulado o rechazado libera su referencia para volver a usarla
  if exists (select 1 from public.cem_payments
             where referencia = btrim(p_referencia)
               and coalesce(estado,'') not in ('rechazado','anulado')) then
    raise exception 'Ya hay un pago registrado con la referencia %. Si te equivocaste, avisa a administración.', btrim(p_referencia);
  end if;

  -- Cuánto de esto salda la cuota, y en qué bolsillo cae. La conversión sale
  -- del método de pago, no de la moneda: dos métodos en dólares pueden tener
  -- reglas distintas si algún día se decide así.
  select * into v_conv from public.cem_equivalente_en_base(p_monto, p_metodo, (coalesce(p_fecha, now()))::date);

  v_nota := nullif(btrim(coalesce(p_nota,'')), '');
  v_saldo := coalesce(v_cuota.saldo, v_cuota.monto);
  -- más del doble de lo que se debe: casi siempre es un error de tecleo
  if v_conv.monto_base > v_saldo * 2 and v_conv.monto_base - v_saldo > 10 then
    v_nota := coalesce(v_nota || ' · ', '') ||
      format('Revisar: el monto equivale a %s y la cuota debe %s.', round(v_conv.monto_base,2), round(v_saldo,2));
  end if;

  insert into public.cem_payments (
    enrollment_id, installment_id, monto, moneda, tasa, tasa_moneda, monto_base,
    cartera_id, metodo, referencia, comprobante_url, estado, conciliado,
    registrado_por, fecha, nota
  ) values (
    v_cuota.enrollment_id, v_cuota.id, p_monto, v_conv.moneda_pago,
    v_conv.tasa, v_conv.tasa_moneda, v_conv.monto_base, v_conv.cartera_id,
    btrim(p_metodo), btrim(p_referencia), p_comprobante_url,
    'reportado', false, auth.uid(), coalesce(p_fecha, now()), v_nota
  ) returning * into v_pago;

  return v_pago;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_reportar_pago_servidor(p_installment_id uuid, p_monto numeric, p_moneda text, p_referencia text, p_metodo text, p_profile_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_pago public.cem_payments;
begin
  -- `auth.uid()` es null cuando llama la cuenta de servicio. Si viene con
  -- sesión, es una persona intentando entrar por la puerta del servidor.
  if auth.uid() is not null then
    raise exception 'Esta función es sólo para el servidor.' using errcode = '42501';
  end if;

  -- Reportar: calcula la conversión, el monto base, la cartera y la concesión.
  v_pago := cem_reportar_pago(
    p_installment_id := p_installment_id,
    p_monto          := p_monto,
    p_moneda         := p_moneda,
    p_referencia     := p_referencia,
    p_metodo         := p_metodo,
    p_fecha          := now(),
    p_comprobante_url := null,
    p_nota           := 'Cobrado con tarjeta. Confirmado por la pasarela, sin verificación manual.');

  -- Y aprobar, que es lo que abona la cuota y abre el curso. Pedirle a una
  -- persona que «verifique» un cobro que ya está en la cuenta sólo retrasa la
  -- apertura del curso.
  perform cem_aprobar_pago(v_pago.id, 'Cobrado con tarjeta y confirmado por la pasarela.');

  return jsonb_build_object('ok', true, 'payment_id', v_pago.id);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_reproducciones_sospechosas(p_dias integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(x order by (x->>'ips')::int desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'profile_id', r.profile_id,
      'nombre', trim(coalesce(p.nombre,'') || ' ' || coalesce(p.apellido,'')),
      'email', p.email,
      'ips', count(distinct r.ip),
      'lecciones', count(distinct r.lesson_id),
      'dias', count(distinct r.dia),
      'ultimo', max(r.ultimo_en)) as x
      from cem_reproducciones r
      join cem_profiles p on p.id = r.profile_id
     where r.ultimo_en > now() - (greatest(coalesce(p_dias,30), 1) || ' days')::interval
       and r.ip is not null
     group by r.profile_id, p.nombre, p.apellido, p.email
    having count(distinct r.ip) >= 3
  ) t
  where cem_can_read_all();
$function$
;

CREATE OR REPLACE FUNCTION public.cem_requisitos_certificado(p_enrollment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_e cem_enrollments; v_deuda numeric; v_cuotas int;
        v_ev_total int; v_ev_ok int; v_avance numeric;
begin
  select * into v_e from cem_enrollments where id = p_enrollment_id;
  if v_e.id is null then raise exception 'No encontramos esa inscripción.'; end if;

  select coalesce(sum(coalesce(saldo, monto)), 0), count(*)
    into v_deuda, v_cuotas
    from cem_installments
   where enrollment_id = p_enrollment_id and estado in ('pendiente','parcial','vencida');

  select count(*) into v_ev_total from cem_assessments a
   where a.course_id = v_e.course_id and a.estado = 'publicado';
  select count(distinct s.assessment_id) into v_ev_ok
    from cem_submissions s join cem_assessments a on a.id = s.assessment_id
   where s.enrollment_id = p_enrollment_id and a.course_id = v_e.course_id
     and a.estado = 'publicado' and s.estado = 'calificada'
     and s.puntaje >= coalesce(a.nota_aprobatoria, 0);

  v_avance := coalesce(v_e.progreso, 0);

  return jsonb_build_object(
    'listo', (v_deuda <= 0 and v_ev_ok >= v_ev_total and v_avance >= 100),
    'deuda', v_deuda,
    'cuotas_pendientes', v_cuotas,
    'evaluaciones_total', v_ev_total,
    'evaluaciones_aprobadas', v_ev_ok,
    'avance', v_avance,
    'reparos', (
      select coalesce(jsonb_agg(x), '[]'::jsonb) from (
        select format('Debe %s %s en %s cuota(s).',
                      to_char(v_deuda, 'FM999999990.00'), coalesce(v_e.moneda, 'USD'), v_cuotas) as x
         where v_deuda > 0
        union all
        select format('Le faltan %s evaluación(es) de %s por aprobar.', v_ev_total - v_ev_ok, v_ev_total)
         where v_ev_ok < v_ev_total
        union all
        select format('Su avance es %s%%, no llegó al 100%%.', to_char(v_avance, 'FM990.0'))
         where v_avance < 100
      ) t)
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_resolver_duda(p_duda_id uuid, p_resuelta boolean DEFAULT true)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_d cem_dudas;
begin
  select * into v_d from cem_dudas where id = p_duda_id;
  if v_d.id is null then raise exception 'Esa duda ya no existe.'; end if;
  -- La cierra quien preguntó (ya lo entendió) o quien enseña.
  if not (v_d.autor_id = auth.uid() or cem_docente_de_curso(v_d.course_id) or cem_is_staff()) then
    raise exception 'Sólo quien preguntó o quien enseña puede cerrarla.';
  end if;
  update cem_dudas set resuelta = coalesce(p_resuelta, true) where id = p_duda_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_resolver_solicitud_inscripcion(p_solicitud_id uuid, p_aprobar boolean, p_resolucion text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s cem_solicitudes_inscripcion;
begin
  if not cem_is_staff() then raise exception 'Sólo el personal autorizado resuelve estas solicitudes.'; end if;
  select * into s from cem_solicitudes_inscripcion where id = p_solicitud_id and estado = 'pendiente';
  if s.id is null then raise exception 'Esa solicitud no existe o ya fue resuelta.'; end if;

  if p_aprobar then
    if s.tipo = 'congelamiento' then
      update cem_enrollments set estado = 'congelada' where id = s.enrollment_id;
      -- las cuotas que todavía no vencieron se congelan; lo ya vencido se sigue debiendo
      update cem_installments set estado = 'congelada'
       where enrollment_id = s.enrollment_id and estado = 'pendiente';
    elsif s.tipo = 'retiro' then
      update cem_enrollments set estado = 'cancelada' where id = s.enrollment_id;
      update cem_installments set estado = 'anulada'
       where enrollment_id = s.enrollment_id and estado in ('pendiente','congelada');
    elsif s.tipo = 'plan_de_pago' then
      perform cem_replanificar_cuotas(s.enrollment_id, (s.datos ->> 'cuotas')::int);
    else  -- reactivacion
      update cem_enrollments set estado = 'activa' where id = s.enrollment_id;
      update cem_installments set estado = 'pendiente'
       where enrollment_id = s.enrollment_id and estado = 'congelada';
    end if;
  end if;

  update cem_solicitudes_inscripcion
     set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         resolucion = p_resolucion, resuelto_por = auth.uid(), resuelto_en = now()
   where id = p_solicitud_id;

  perform cem_notificar(s.profile_id, 'solicitud_inscripcion',
    format('Tu solicitud de %s fue %s', replace(s.tipo, '_', ' '),
           case when p_aprobar then 'aprobada' else 'rechazada' end),
    coalesce(nullif(p_resolucion, ''), 'Entra a tu panel para ver el detalle.'),
    case when s.tipo = 'plan_de_pago' then 'estudiante/pagos.html' else 'estudiante/panel.html' end);

  insert into cem_audit_events (actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'solicitud_' || s.tipo || '_' || case when p_aprobar then 'aprobada' else 'rechazada' end,
          'cem_enrollments', s.enrollment_id, 'alto',
          jsonb_build_object('motivo', s.motivo, 'resolucion', p_resolucion, 'datos', s.datos));
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_resolver_solicitud_perfil(p_solicitud_id uuid, p_aprobar boolean, p_resolucion text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s cem_solicitudes_perfil;
begin
  if not cem_is_staff() then raise exception 'Sólo el personal autorizado resuelve estas solicitudes.'; end if;
  select * into s from cem_solicitudes_perfil where id = p_solicitud_id and estado = 'pendiente';
  if s.id is null then raise exception 'Esa solicitud no existe o ya fue resuelta.'; end if;

  if p_aprobar then
    update cem_profiles set
      nombre         = coalesce(s.campos ->> 'nombre', nombre),
      apellido       = coalesce(s.campos ->> 'apellido', apellido),
      documento      = coalesce(s.campos ->> 'documento', documento),
      documento_tipo = coalesce(s.campos ->> 'documento_tipo', documento_tipo)
    where id = s.profile_id;
  end if;

  update cem_solicitudes_perfil
     set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         resolucion = p_resolucion, resuelto_por = auth.uid(), resuelto_en = now()
   where id = p_solicitud_id;

  perform cem_notificar(s.profile_id, 'solicitud_perfil',
    case when p_aprobar then 'Actualizamos tus datos' else 'No pudimos actualizar tus datos' end,
    coalesce(nullif(p_resolucion, ''),
      case when p_aprobar
        then 'Ya quedaron corregidos. Si tienes certificados emitidos con los datos anteriores, pídenos que los reemitamos.'
        else 'Escríbenos por soporte si necesitas revisarlo.' end),
    'estudiante/perfil.html');

  insert into cem_audit_events (actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), case when p_aprobar then 'perfil_cambio_aprobado' else 'perfil_cambio_rechazado' end,
          'cem_profiles', s.profile_id, 'alto', s.campos);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_responder_duda(p_duda_id uuid, p_cuerpo text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_d cem_dudas; v_id uuid; v_docente boolean; v_titulo text; v_quien text;
begin
  select * into v_d from cem_dudas where id = p_duda_id and not eliminada;
  if v_d.id is null then raise exception 'Esa duda ya no existe.'; end if;
  if not cem_puede_ver_leccion(v_d.lesson_id) then
    raise exception 'Esta lección no es tuya.';
  end if;
  if coalesce(trim(p_cuerpo), '') = '' then
    raise exception 'Escribe la respuesta antes de enviarla.';
  end if;

  v_docente := cem_docente_de_curso(v_d.course_id) or cem_is_staff();

  insert into cem_duda_respuestas (duda_id, autor_id, cuerpo, de_docente)
  values (p_duda_id, auth.uid(), trim(p_cuerpo), v_docente)
  returning id into v_id;

  select titulo into v_titulo from cem_lessons where id = v_d.lesson_id;
  select trim(coalesce(nombre,'') || ' ' || coalesce(apellido,'')) into v_quien
    from cem_profiles where id = auth.uid();

  -- A quien preguntó, salvo que se esté contestando a sí mismo.
  if v_d.autor_id is distinct from auth.uid() then
    perform cem_notificar(v_d.autor_id, 'duda_respondida',
      format('%s respondió tu duda', case when v_docente then 'Tu profesor' else coalesce(nullif(v_quien,''),'Alguien') end),
      format('En «%s»: %s', v_titulo, left(trim(p_cuerpo), 160)),
      'estudiante/clase.html?curso=' || v_d.course_id::text || '&leccion=' || v_d.lesson_id::text);
  end if;

  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_responder_invitacion(p_id uuid, p_aceptar boolean)
 RETURNS cem_enrollments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_inv    public.cem_invitaciones;
  v_row    public.cem_enrollments;
  v_base   numeric;
  v_ultima numeric;
  v_monto  numeric;
  i int;
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesion.'; end if;

  select * into v_inv from public.cem_invitaciones where id = p_id for update;
  if v_inv.id is null then raise exception 'Esa invitacion ya no existe.'; end if;
  /* Contestar por otro sería inscribir a otro. La invitación es de quien la
     recibió, no de quien tenga el identificador. */
  if v_inv.profile_id <> auth.uid() then raise exception 'Esa invitacion no es tuya.'; end if;
  if v_inv.estado <> 'pendiente' then raise exception 'Esa invitacion ya fue contestada.'; end if;
  if v_inv.vence is not null and v_inv.vence < current_date then
    raise exception 'Esa invitacion caduco el %.', to_char(v_inv.vence, 'DD/MM/YYYY');
  end if;

  if not p_aceptar then
    update public.cem_invitaciones set estado = 'rechazada', resuelta_en = now() where id = p_id;
    return null;
  end if;

  if exists (select 1 from public.cem_enrollments
             where profile_id = auth.uid() and course_id = v_inv.course_id
               and estado not in ('cancelada','finalizada')) then
    raise exception 'Ya estas inscrito en este programa.';
  end if;

  insert into public.cem_enrollments(profile_id, course_id, cohort_id, precio_lista,
                                     descuento, precio_final, moneda, estado)
  values (auth.uid(), v_inv.course_id, v_inv.cohort_id, v_inv.precio_lista,
          v_inv.descuento, v_inv.precio_final, v_inv.moneda, 'pendiente')
  returning * into v_row;

  -- El mismo reparto exacto que en `cem_self_enroll`: la última cuota absorbe
  -- el céntimo del redondeo, o el plan no suma el total.
  v_base   := round(v_inv.precio_final / v_inv.cuotas, 2);
  v_ultima := round(v_inv.precio_final - (v_base * (v_inv.cuotas - 1)), 2);
  for i in 1..v_inv.cuotas loop
    v_monto := case when i = v_inv.cuotas then v_ultima else v_base end;
    insert into public.cem_installments(enrollment_id, numero, monto, moneda,
                                        fecha_vencimiento, estado, saldo)
    values (v_row.id, i, v_monto, v_row.moneda,
            (current_date + ((i-1) * interval '1 month'))::date, 'pendiente', v_monto);
  end loop;

  update public.cem_invitaciones
     set estado = 'aceptada', resuelta_en = now(), enrollment_id = v_row.id
   where id = p_id;

  insert into public.cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'invitacion_aceptada', 'cem_enrollments', v_row.id, 'medio',
          jsonb_build_object('invitacion', p_id, 'total', v_inv.precio_final));
  return v_row;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_resumen_grupo(p_cohort_id uuid)
 RETURNS TABLE(enrollment_id uuid, profile_id uuid, estudiante text, email text, progreso numeric, promedio numeric, entregas_hechas bigint, entregas_esperadas bigint, entregas_tarde bigint, asistencia_pct numeric, ultimo_acceso timestamp with time zone, riesgo text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with base as (
    select e.id as enrollment_id, e.profile_id, e.course_id, e.progreso, e.ultimo_acceso,
           trim(coalesce(p.nombre,'') || ' ' || coalesce(p.apellido,'')) as estudiante,
           p.email
      from cem_enrollments e
      join cem_profiles p on p.id = e.profile_id
     where e.cohort_id = p_cohort_id
       and (cem_is_staff() or cem_docente_de_cohorte(p_cohort_id))
  ),
  evals as (
    select b.enrollment_id,
           (select count(*) from cem_assessments a
             where a.course_id = b.course_id and a.estado = 'publicado') as esperadas,
           (select count(*) from cem_submissions s
             where s.enrollment_id = b.enrollment_id and s.entregado_en is not null) as hechas,
           (select count(*) from cem_submissions s
             where s.enrollment_id = b.enrollment_id and s.tarde) as tarde,
           (select round(avg(s.puntaje), 1) from cem_submissions s
             where s.enrollment_id = b.enrollment_id and s.estado = 'calificada') as promedio
      from base b
  ),
  asist as (
    select b.enrollment_id,
           case when count(a.id) = 0 then null
                else round(100.0 * count(*) filter (where a.presente) / count(a.id), 0) end as pct
      from base b left join cem_attendance a on a.enrollment_id = b.enrollment_id
     group by b.enrollment_id
  )
  select b.enrollment_id, b.profile_id, b.estudiante, b.email,
         b.progreso, e.promedio, e.hechas, e.esperadas, e.tarde,
         s.pct, b.ultimo_acceso,
         case
           when b.ultimo_acceso is null or b.ultimo_acceso < now() - interval '30 days' then 'sin_actividad'
           when e.esperadas > 0 and e.hechas = 0 then 'sin_entregas'
           when e.promedio is not null and e.promedio < 60 then 'nota_baja'
           when b.progreso < 30 then 'avance_bajo'
           else 'al_dia'
         end as riesgo
    from base b
    join evals e on e.enrollment_id = b.enrollment_id
    join asist s on s.enrollment_id = b.enrollment_id
   order by b.estudiante;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_retirar_invitacion(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.cem_is_staff() then
    raise exception 'Solo el equipo puede retirar una invitacion.';
  end if;
  update public.cem_invitaciones
     set estado = 'retirada', resuelta_en = now()
   where id = p_id and estado = 'pendiente';
  if not found then raise exception 'Esa invitacion ya no estaba pendiente.'; end if;
  insert into public.cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'invitacion_retirada', 'cem_invitaciones', p_id, 'bajo', '{}'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_revisar_cuotas(p_dias_aviso integer DEFAULT 3)
 RETURNS TABLE(marcadas_vencidas integer, avisos_previos integer, avisos_vencidas integer, avisos_mora integer, avisos_cobranza integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_venc integer := 0; v_prev integer := 0; v_hoy integer := 0;
  v_mora integer := 0; v_cob integer := 0;
  r record;
begin
  if auth.uid() is not null and not (cem_is_staff() or cem_puede_cobranza()) then
    raise exception 'No autorizado.';
  end if;

  update cem_installments
     set estado = 'vencida'
   where estado in ('pendiente','parcial')
     and fecha_vencimiento < current_date
     and coalesce(saldo, monto) > 0;
  get diagnostics v_venc = row_count;

  -- Antes de vencer: el peldaño que más cobra, porque todavía da tiempo.
  -- La ventana es la que pidió cada quien, o p_dias_aviso si no pidió nada.
  for r in
    select i.id, i.numero, i.monto, i.moneda, i.fecha_vencimiento,
           e.profile_id, c.nombre as curso
      from cem_installments i
      join cem_enrollments e on e.id = i.enrollment_id
      join cem_courses c on c.id = e.course_id
     where i.estado in ('pendiente','parcial')
       and i.fecha_vencimiento between current_date
           and current_date + coalesce(
                 (select rc.dias_antes from cem_bot_recordatorios rc
                   where rc.profile_id = e.profile_id and rc.activo),
                 p_dias_aviso)
       and not exists (select 1 from cem_notificaciones n
                        where n.profile_id = e.profile_id
                          and n.tipo = 'cuota_por_vencer'
                          and n.url like '%' || i.id::text || '%')
  loop
    perform cem_notificar(r.profile_id, 'cuota_por_vencer',
      format('Tu cuota %s vence el %s', r.numero, to_char(r.fecha_vencimiento, 'DD/MM/YYYY')),
      format('Quedan %s %s por pagar de %s. Puedes reportar tu pago desde la plataforma.',
             to_char(r.monto, 'FM999999990.00'), r.moneda, r.curso),
      'estudiante/pagos.html#' || r.id::text);
    v_prev := v_prev + 1;
  end loop;

  for r in
    select i.id, i.numero, coalesce(i.saldo, i.monto) as saldo, i.moneda,
           e.profile_id, c.nombre as curso
      from cem_installments i
      join cem_enrollments e on e.id = i.enrollment_id
      join cem_courses c on c.id = e.course_id
     where i.estado = 'vencida'
       and not exists (select 1 from cem_notificaciones n
                        where n.profile_id = e.profile_id
                          and n.tipo = 'cuota_vencida'
                          and n.url like '%' || i.id::text || '%')
  loop
    perform cem_notificar(r.profile_id, 'cuota_vencida',
      format('Tu cuota %s está vencida', r.numero),
      format('Quedan %s %s pendientes de %s. Escríbenos si necesitas reprogramarla.',
             to_char(r.saldo, 'FM999999990.00'), r.moneda, r.curso),
      'estudiante/pagos.html#' || r.id::text);
    v_hoy := v_hoy + 1;
  end loop;

  for r in
    select i.id, i.numero, coalesce(i.saldo, i.monto) as saldo, i.moneda,
           e.profile_id, c.nombre as curso,
           (current_date - i.fecha_vencimiento) as dias,
           case when (current_date - i.fecha_vencimiento) >= 30 then 'cuota_mora_30'
                when (current_date - i.fecha_vencimiento) >= 15 then 'cuota_mora_15'
                else 'cuota_mora_3' end as peldano
      from cem_installments i
      join cem_enrollments e on e.id = i.enrollment_id
      join cem_courses c on c.id = e.course_id
     where i.estado in ('vencida','parcial')
       and coalesce(i.saldo, i.monto) > 0
       and (current_date - i.fecha_vencimiento) >= 3
  loop
    if exists (select 1 from cem_notificaciones n
                where n.profile_id = r.profile_id and n.tipo = r.peldano
                  and n.url like '%' || r.id::text || '%') then
      continue;
    end if;

    perform cem_notificar(r.profile_id, r.peldano,
      case r.peldano
        when 'cuota_mora_3'  then format('Tu cuota %s lleva %s días vencida', r.numero, r.dias)
        when 'cuota_mora_15' then format('Tu cuota %s lleva dos semanas sin pagar', r.numero)
        else format('Tu cuota %s lleva más de un mes vencida', r.numero)
      end,
      case r.peldano
        when 'cuota_mora_3' then
          format('Son %s %s de %s. Si ya pagaste, repórtalo desde la plataforma para que lo verifiquemos.',
                 to_char(r.saldo, 'FM999999990.00'), r.moneda, r.curso)
        when 'cuota_mora_15' then
          format('Siguen pendientes %s %s de %s. Si necesitas reprogramar el pago, pídelo desde la plataforma: se puede.',
                 to_char(r.saldo, 'FM999999990.00'), r.moneda, r.curso)
        else
          format('Quedan %s %s de %s. Con más de treinta días la inscripción puede quedar en pausa; hablémoslo antes de llegar a eso.',
                 to_char(r.saldo, 'FM999999990.00'), r.moneda, r.curso)
      end,
      'estudiante/pagos.html#' || r.id::text);
    v_mora := v_mora + 1;
  end loop;

  for r in
    select i.id, i.numero, coalesce(i.saldo, i.monto) as saldo, i.moneda,
           (current_date - i.fecha_vencimiento) as dias,
           trim(coalesce(pr.nombre,'') || ' ' || coalesce(pr.apellido,'')) as quien,
           c.nombre as curso
      from cem_installments i
      join cem_enrollments e on e.id = i.enrollment_id
      join cem_courses c on c.id = e.course_id
      left join cem_profiles pr on pr.id = e.profile_id
     where i.estado in ('vencida','parcial')
       and coalesce(i.saldo, i.monto) > 0
       and (current_date - i.fecha_vencimiento) >= 60
       and not exists (select 1 from cem_notificaciones n
                        where n.tipo = 'mora_larga'
                          and n.url like '%' || i.id::text || '%')
  loop
    v_cob := v_cob + cem_avisar_equipo('mora_larga',
      format('%s lleva %s días de mora', coalesce(nullif(r.quien,''), 'Un estudiante'), r.dias),
      format('Cuota %s de %s: %s %s sin cobrar desde hace %s días.',
             r.numero, r.curso, to_char(r.saldo, 'FM999999990.00'), r.moneda, r.dias),
      'admin/inscripciones.html#' || r.id::text);
  end loop;

  return query select v_venc, v_prev, v_hoy, v_mora, v_cob;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_revisar_funciones()
 RETURNS TABLE(funcion text, definer boolean, publica_a_proposito boolean, veredicto text, explicacion text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  if auth.uid() is not null
     and public.cem_role() not in ('admin', 'superadmin', 'auditor') then
    raise exception 'Sólo un administrador o un auditor puede revisar los permisos de las funciones.';
  end if;

  return query
  with abiertas as (
    select p.oid,
           (p.oid::regprocedure)::text as firma,
           p.proname::text as nombre,
           p.prosecdef as definer
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname like 'cem\_%'
       and has_function_privilege('anon', p.oid, 'EXECUTE')
  )
  select a.firma,
         a.definer,
         -- Las que la web pública necesita de verdad: el catálogo, el
         -- formulario de contacto, la verificación de un certificado y el
         -- perfil público de quien lo publica.
         a.nombre in ('cem_dejar_contacto','cem_verify_certificate','cem_perfil_publico',
                      'cem_valoracion_cursos','cem_slug_de_certificado') as publica_a_proposito,
         case
           when a.nombre in ('cem_dejar_contacto','cem_verify_certificate','cem_perfil_publico',
                             'cem_valoracion_cursos','cem_slug_de_certificado') then 'a_proposito'
           when not a.definer then 'inocua'
           else 'revisar'
         end,
         case
           when a.nombre in ('cem_dejar_contacto','cem_verify_certificate','cem_perfil_publico',
                             'cem_valoracion_cursos','cem_slug_de_certificado')
             then 'La web pública la llama sin sesión: tiene que estar abierta.'
           when not a.definer
             then 'No es SECURITY DEFINER, así que corre con los permisos de quien llama: no da más de lo que ya tiene.'
           else 'Corre con permisos de dueño y la puede llamar alguien sin sesión. '
             || 'Se defiende sola por dentro, pero convendría revocarla de anon: '
             || 'revoke all on function ' || a.firma || ' from public, anon;'
         end
    from abiertas a
   order by 3, 1;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_revisar_politicas()
 RETURNS TABLE(tabla text, rls boolean, politicas integer, permisos_cliente boolean, filas bigint, veredicto text, explicacion text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
begin
  -- auth.uid() es null cuando la llama el propio servidor con la clave de
  -- servicio; ahí no hay a quién comprobarle el rol y se deja pasar.
  if auth.uid() is not null
     and public.cem_role() not in ('admin', 'superadmin', 'auditor') then
    raise exception 'Sólo un administrador o un auditor puede revisar las políticas de acceso.';
  end if;

  return query
  with t as (
    select c.oid,
           c.relname::text                                as tabla,
           c.relrowsecurity                               as rls,
           coalesce(p.n, 0)::integer                      as politicas,
           exists (
             select 1 from information_schema.role_table_grants g
              where g.table_schema = 'public'
                and g.table_name = c.relname
                and g.grantee in ('anon', 'authenticated')
                and g.privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
           )                                              as permisos_cliente,
           coalesce(s.n_live_tup, 0)                      as filas
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join (select polrelid, count(*) n from pg_policy group by polrelid) p
             on p.polrelid = c.oid
      left join pg_stat_user_tables s on s.relid = c.oid
     where n.nspname = 'public'
       and c.relkind = 'r'
  )
  select t.tabla, t.rls, t.politicas, t.permisos_cliente, t.filas,
         case
           when not t.rls and t.permisos_cliente then 'abierta'
           when not t.rls                        then 'sin_rls'
           when t.politicas = 0                  then 'bloqueada'
           else 'bien'
         end,
         case
           when not t.rls and t.permisos_cliente then
             'Cualquiera con la clave pública puede leerla y escribirla. Hay que encenderle RLS y escribirle políticas.'
           when not t.rls then
             'No tiene RLS, pero tampoco permisos para el cliente: sólo la alcanza el servidor.'
           when t.politicas = 0 then
             'Con RLS encendido y ninguna política, no devuelve ni acepta nada desde el navegador: está cerrada. '
             || case when t.permisos_cliente
                     then 'Conviene igual quitarle los permisos de anon/authenticated: hoy la protege sólo el RLS, y basta una política permisiva de más para abrirla entera.'
                     else 'Y además no tiene permisos para el cliente.' end
           else t.politicas || ' política(s) deciden quién ve y quién toca cada fila.'
         end
    from t
   order by case
              when not t.rls and t.permisos_cliente then 0
              when t.politicas = 0                  then 1
              when not t.rls                        then 2
              else 3
            end,
            t.tabla;
end;
$function$
;
comment on function public.cem_revisar_politicas() is 'Radiografía de las políticas de acceso de todas las tablas de public. Sólo admin, superadmin o auditor. Se muestra en admin/seguridad.html.';

CREATE OR REPLACE FUNCTION public.cem_revision_intento(p_submission_id uuid)
 RETURNS TABLE(orden integer, enunciado text, tipo text, acerto boolean, tuya text, correcta text, explicacion text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_sub cem_submissions; v_a cem_assessments; v_staff boolean;
begin
  select * into v_sub from cem_submissions where id = p_submission_id;
  if v_sub.id is null then raise exception 'Entrega no encontrada.'; end if;

  v_staff := cem_is_staff() or cem_is_teacher();
  if not (v_staff or cem_owns_enrollment(v_sub.enrollment_id)) then
    raise exception 'No autorizado.';
  end if;
  if v_sub.entregado_en is null then
    raise exception 'Esta evaluación todavía no se ha entregado.';
  end if;

  select * into v_a from cem_assessments where id = v_sub.assessment_id;
  if not v_staff and not coalesce(v_a.mostrar_correctas, false) then
    raise exception 'Las respuestas de esta evaluación no se muestran.';
  end if;

  return query
    select aq.orden, q.enunciado, q.tipo::text,
           cem_es_correcta(q.tipo::text, v_sub.respuestas -> q.id::text, q.respuesta_correcta),
           -- Un valor jsonb suelto se enseña tal cual; una lista o una
           -- cuadrícula, aplanadas, porque nadie lee JSON.
           case jsonb_typeof(v_sub.respuestas -> q.id::text)
             when 'array' then (select string_agg(x, ', ')
                                  from jsonb_array_elements_text(v_sub.respuestas -> q.id::text) x)
             when 'object' then (select string_agg(k || ': ' ||
                                   case jsonb_typeof(v_sub.respuestas -> q.id::text -> k)
                                     when 'array' then (select string_agg(y, ', ')
                                       from jsonb_array_elements_text(v_sub.respuestas -> q.id::text -> k) y)
                                     else v_sub.respuestas -> q.id::text ->> k end, ' · ')
                                  from jsonb_object_keys(v_sub.respuestas -> q.id::text) k)
             else v_sub.respuestas #>> array[q.id::text] end,
           case jsonb_typeof(q.respuesta_correcta)
             when 'array' then (select string_agg(x, ', ')
                                  from jsonb_array_elements_text(q.respuesta_correcta) x)
             when 'object' then (select string_agg(k || ': ' ||
                                   case jsonb_typeof(q.respuesta_correcta -> k)
                                     when 'array' then (select string_agg(y, ', ')
                                       from jsonb_array_elements_text(q.respuesta_correcta -> k) y)
                                     else q.respuesta_correcta ->> k end, ' · ')
                                  from jsonb_object_keys(q.respuesta_correcta) k)
             else q.respuesta_correcta #>> '{}' end,
           q.explicacion
      from cem_assessment_questions aq
      join cem_questions q on q.id = aq.question_id
     where aq.assessment_id = v_sub.assessment_id
     order by aq.orden;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select rol::text from cem_profiles where id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.cem_ronda_guardar(p_nombre text, p_desde date, p_hasta date DEFAULT NULL::date, p_nota text DEFAULT NULL::text, p_partes jsonb DEFAULT '[]'::jsonb, p_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid := p_id; v_cerradas int := 0; v_n int := 0; e jsonb;
begin
  if not cem_es_admin() then
    raise exception 'Sólo la dirección puede tocar las rondas de reparto.';
  end if;
  if coalesce(btrim(p_nombre), '') = '' then
    raise exception 'La ronda necesita un nombre para poder distinguirla de las demás.';
  end if;
  if p_desde is null then
    raise exception 'La ronda necesita una fecha de inicio: sin ella no se sabe qué ventas entran.';
  end if;
  if p_hasta is not null and p_hasta < p_desde then
    raise exception 'La ronda no puede terminar antes de empezar.';
  end if;

  if v_id is null then
    update cem_rondas set hasta = p_desde - 1
     where hasta is null and desde < p_desde;
    get diagnostics v_cerradas = row_count;

    insert into cem_rondas(nombre, desde, hasta, nota)
    values (btrim(p_nombre), p_desde, p_hasta, nullif(btrim(coalesce(p_nota,'')), ''))
    returning id into v_id;
  else
    update cem_rondas
       set nombre = btrim(p_nombre), desde = p_desde, hasta = p_hasta,
           nota = nullif(btrim(coalesce(p_nota,'')), '')
     where id = v_id;
    if not found then raise exception 'Esa ronda ya no existe.'; end if;
  end if;

  -- Las partes se reemplazan enteras: es más simple de entender que un juego de
  -- altas y bajas, y una parte que desaparece de la lista tiene que desaparecer.
  delete from cem_ronda_partes where ronda_id = v_id;
  for e in select * from jsonb_array_elements(coalesce(p_partes, '[]'::jsonb)) loop
    if coalesce((e->>'pct')::numeric, 0) = 0 and coalesce((e->>'aporte')::numeric, 0) = 0
    then continue; end if;
    insert into cem_ronda_partes(ronda_id, inversor_id, linea, pct, aporte)
    values (v_id, (e->>'inversor_id')::uuid, (e->>'linea')::cem_course_tipo,
            coalesce((e->>'pct')::numeric, 0), coalesce((e->>'aporte')::numeric, 0))
    on conflict (ronda_id, inversor_id, linea) do update
      set pct = excluded.pct, aporte = excluded.aporte;
    v_n := v_n + 1;
  end loop;

  insert into cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), case when p_id is null then 'ronda_abierta' else 'ronda_editada' end,
          'cem_rondas', v_id, 'alto',
          jsonb_build_object('nombre', p_nombre, 'desde', p_desde, 'hasta', p_hasta,
                             'partes', v_n, 'rondas_cerradas', v_cerradas));

  return jsonb_build_object('ok', true, 'id', v_id, 'partes', v_n,
                            'rondas_cerradas', v_cerradas);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_rotar_clave_webhook(p_gracia_horas integer DEFAULT 48)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_datos jsonb; v_nueva text; v_actual text;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede rotar la clave del webhook.';
  end if;
  select datos into v_datos from cem_integraciones where id = 'bancaribe' for update;
  if v_datos is null then
    raise exception 'La integración con el banco todavía no está configurada.';
  end if;

  v_actual := v_datos ->> 'notificacion_api_key';
  v_nueva  := encode(gen_random_bytes(32), 'hex');

  update cem_integraciones
     set datos = v_datos
                 || jsonb_build_object(
                      'notificacion_api_key', v_nueva,
                      'notificacion_api_key_anterior', v_actual,
                      'notificacion_api_key_anterior_vence',
                        to_char(now() + make_interval(hours => greatest(p_gracia_horas, 1)),
                                'YYYY-MM-DD"T"HH24:MI:SSOF'),
                      'notificacion_api_key_rotada_en',
                        to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')),
         actualizado_en = now()
   where id = 'bancaribe';

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  select auth.uid(), p.email, 'webhook_clave_rotada', 'cem_integraciones', null, 'alto',
         jsonb_build_object('gracia_horas', greatest(p_gracia_horas, 1))
    from cem_profiles p where p.id = auth.uid();

  return v_nueva;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_self_enroll(p_course_id uuid, p_cohort_id uuid DEFAULT NULL::uuid, p_cuotas integer DEFAULT 1, p_codigo_descuento text DEFAULT NULL::text)
 RETURNS cem_enrollments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'Debes iniciar sesion.'; end if;
  return public.cem_inscribir_a(auth.uid(), p_course_id, p_cohort_id, p_cuotas, p_codigo_descuento);
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_sembrar_datos_de_prueba(p_clave text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'semilla', 'auth'
AS $function$
declare
  t       record;
  v_pk    text;
  v_cols  text;
  v_n     bigint;
  v_tot   bigint := 0;
  v_hash  text;
  v_ronda int := 0;
  v_algo  boolean;
  v_faltan text[];
  v_clave text;
begin
  if not cem_es_admin() then
    raise exception 'Sembrar datos de prueba lo hace la dirección.' using errcode = '42501';
  end if;
  if exists (select 1 from cem_datos_de_prueba) then
    raise exception 'Ya hay datos de prueba puestos. Quítalos antes de volver a sembrar.';
  end if;

  /* Si no la dan, se inventa una. Veinticuatro caracteres al azar: no hace
     falta que nadie la recuerde, sólo que nadie la adivine. */
  v_clave := coalesce(nullif(trim(coalesce(p_clave, '')), ''),
                      'pru-' || encode(extensions.gen_random_bytes(18), 'base64'));
  v_clave := replace(replace(replace(v_clave, '/', ''), '+', ''), '=', '');
  v_hash := extensions.crypt(v_clave, extensions.gen_salt('bf'));

  v_cols := cem_columnas_copiables('auth', 'users');
  execute format(
    'insert into auth.users (%1$s) select %1$s from semilla.auth_users u
       where not exists (select 1 from auth.users x where x.id = u.id)', v_cols);

  update auth.users
     set encrypted_password = v_hash,
         email_confirmed_at = coalesce(email_confirmed_at, now())
   where email like '%@pruebas.local';

  insert into auth.identities (id, user_id, provider_id, identity_data, provider,
                               last_sign_in_at, created_at, updated_at)
  select gen_random_uuid(), u.id, u.id::text,
         jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
         'email', now(), now(), now()
    from auth.users u
   where u.email like '%@pruebas.local'
     and not exists (select 1 from auth.identities i
                      where i.user_id = u.id and i.provider = 'email');

  alter table public.cem_profiles disable trigger user;
  delete from public.cem_profiles p
   where exists (select 1 from semilla.cem_profiles s where s.id = p.id);
  alter table public.cem_profiles enable trigger user;

  for t in select c.relname as tabla
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'semilla' and c.relkind = 'r' and c.relname like 'cem\_%'
  loop
    execute format('alter table public.%I disable trigger user', t.tabla);
  end loop;

  select array_agg(c.relname) into v_faltan
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'semilla' and c.relkind = 'r' and c.relname like 'cem\_%';

  loop
    v_ronda := v_ronda + 1;
    v_algo := false;
    for t in select unnest(v_faltan) as tabla loop
      select a.attname into v_pk
        from pg_index i
        join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
       where i.indrelid = ('public.' || t.tabla)::regclass and i.indisprimary;
      v_cols := cem_columnas_copiables('public', t.tabla);
      begin
        execute format(
          'insert into public.%1$I (%3$s) select %3$s from semilla.%1$I s
             where not exists (select 1 from public.%1$I x where x.%2$I = s.%2$I)',
          t.tabla, v_pk, v_cols);
        get diagnostics v_n = row_count;
        v_tot := v_tot + v_n;
        execute format(
          'insert into cem_datos_de_prueba (tabla, fila_id)
             select %1$L, s.%2$I::text from semilla.%1$I s
           on conflict do nothing', t.tabla, v_pk);
        v_faltan := array_remove(v_faltan, t.tabla);
        v_algo := true;
      exception when foreign_key_violation then
        null;
      end;
    end loop;
    exit when not v_algo or coalesce(array_length(v_faltan, 1), 0) = 0 or v_ronda > 15;
  end loop;

  for t in select c.relname as tabla
             from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'semilla' and c.relkind = 'r' and c.relname like 'cem\_%'
  loop
    execute format('alter table public.%I enable trigger user', t.tabla);
  end loop;

  if coalesce(array_length(v_faltan, 1), 0) > 0 then
    raise exception 'No se pudieron sembrar: %. Alguna dependencia no cuadra.',
      array_to_string(v_faltan, ', ');
  end if;

  return jsonb_build_object('ok', true, 'filas', v_tot, 'vueltas', v_ronda,
    'cuentas', (select count(*) from semilla.cem_profiles),
    'clave', v_clave);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_series_carteras(p_meses integer DEFAULT 6)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_flujo jsonb; v_gastos jsonb; v_hoy date := current_date;
  v_meses text[] := array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
begin
  if not (cem_is_staff() or cem_can_read_all()) then
    raise exception 'No tienes permiso para ver las carteras.';
  end if;

  -- Entradas y salidas del mes, en la moneda de la casa para poder compararlas.
  -- Cada cartera tiene su propia moneda y su saldo se lleva en ella; esto es
  -- otra cosa: es el movimiento del negocio, y ahí sí hay que convertir.
  select coalesce(jsonb_agg(jsonb_build_object(
           'clave', to_char(m.mes, 'YYYY-MM'),
           'etq', v_meses[extract(month from m.mes)::int],
           'valores', jsonb_build_object(
             'entradas', coalesce(e.total, 0),
             'salidas', coalesce(g.total, 0))) order by m.mes), '[]'::jsonb)
    into v_flujo
    from generate_series(date_trunc('month', v_hoy) - make_interval(months => p_meses - 1),
                         date_trunc('month', v_hoy), interval '1 month') m(mes)
    left join lateral (
      select sum(coalesce(p.monto_base, p.monto)) as total from cem_payments p
       where p.estado = 'confirmado' and date_trunc('month', p.fecha) = m.mes) e on true
    left join lateral (
      select sum(x.monto) as total from cem_gastos x
       where not coalesce(x.eliminado, false)
         and date_trunc('month', x.fecha) = m.mes) g on true;

  -- Barras, no torta: con ocho categorías la torta se vuelve un abanico de
  -- colores y hay que ir a la leyenda por cada trozo.
  select coalesce(jsonb_agg(jsonb_build_object(
           'etq', coalesce(nullif(btrim(categoria), ''), 'Sin categoría'),
           'n', total) order by total desc), '[]'::jsonb)
    into v_gastos
    from (select categoria, sum(monto) as total from cem_gastos
           where not coalesce(eliminado, false)
             and fecha >= date_trunc('month', v_hoy) - make_interval(months => p_meses - 1)
           group by categoria) t;

  return jsonb_build_object('flujo', v_flujo, 'gastos', v_gastos);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_series_cobranza(p_dias integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_hoy date := current_date; v_ant jsonb; v_comp jsonb; v_mes jsonb;
begin
  if not (cem_is_staff() or cem_can_read_all()) then
    raise exception 'No tienes permiso para ver la cartera.';
  end if;

  select jsonb_agg(jsonb_build_object('etq', t.etq, 'clave', t.clave,
           'n', coalesce(s.monto, 0), 'cuantas', coalesce(s.cuantas, 0)) order by t.orden)
    into v_ant
    from (values ('Al día', 'al-dia', 0, -100000, 0), ('1 a 30 días', '1-30', 1, 1, 30),
                 ('31 a 60', '31-60', 2, 31, 60), ('61 a 90', '61-90', 3, 61, 90),
                 ('Más de 90', '90mas', 4, 91, 100000)) t(etq, clave, orden, d1, d2)
    left join lateral (
      select sum(coalesce(nullif(i.saldo, 0), i.monto)) as monto, count(*) as cuantas
        from cem_installments i
       where i.estado <> 'pagada'
         and (v_hoy - i.fecha_vencimiento) between t.d1 and t.d2) s on true;

  select coalesce(jsonb_agg(jsonb_build_object(
           'etq', to_char(d.dia, 'DD/MM'), 'clave', to_char(d.dia, 'YYYY-MM-DD'),
           'valores', jsonb_build_object(
             'porVerificar', coalesce(s.registrado, 0),
             'aprobados',    coalesce(s.confirmado, 0),
             'rechazados',   coalesce(s.rechazado, 0))) order by d.dia), '[]'::jsonb)
    into v_comp
    from generate_series(v_hoy - (p_dias - 1), v_hoy, interval '1 day') d(dia)
    left join lateral (
      select count(*) filter (where p.estado = 'registrado')  as registrado,
             count(*) filter (where p.estado = 'confirmado')  as confirmado,
             count(*) filter (where p.estado in ('rechazado', 'anulado')) as rechazado
        from cem_payments p where p.fecha::date = d.dia::date) s on true;

  select jsonb_build_object(
      'recaudado', coalesce((select sum(coalesce(monto_base, monto)) from cem_payments
                              where estado = 'confirmado'
                                and date_trunc('month', fecha) = date_trunc('month', v_hoy)), 0),
      -- La meta no es una cifra inventada: es lo que la propia escuela puso a
      -- vencer este mes cuando armó los planes de pago.
      'meta', coalesce((select sum(monto) from cem_installments
                         where date_trunc('month', fecha_vencimiento) = date_trunc('month', v_hoy)), 0))
    into v_mes;

  return jsonb_build_object('antiguedad', v_ant, 'comprobantes', v_comp, 'mes', v_mes);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_series_gobierno(p_dias integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_hoy date := current_date; v_eventos jsonb; v_actores jsonb; v_tickets jsonb; v_certs jsonb;
begin
  if not (cem_is_staff() or cem_can_read_all()) then
    raise exception 'No tienes permiso para ver el registro.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'etq', to_char(d.dia, 'DD/MM'), 'clave', to_char(d.dia, 'YYYY-MM-DD'),
           'valores', jsonb_build_object(
             'bajo', coalesce(s.bajo, 0), 'medio', coalesce(s.medio, 0),
             'alto', coalesce(s.alto, 0))) order by d.dia), '[]'::jsonb)
    into v_eventos
    from generate_series(v_hoy - (p_dias - 1), v_hoy, interval '1 day') d(dia)
    left join lateral (
      select count(*) filter (where a.riesgo = 'bajo')  as bajo,
             count(*) filter (where a.riesgo = 'medio') as medio,
             count(*) filter (where a.riesgo = 'alto')  as alto
        from cem_audit_events a where a.created_at::date = d.dia::date) s on true;

  -- No es para vigilar a nadie: es para notar cuando una cuenta empieza a
  -- hacer diez veces lo que hacía.
  select coalesce(jsonb_agg(jsonb_build_object('etq', quien, 'n', cuantos, 'id', id)
           order by cuantos desc), '[]'::jsonb)
    into v_actores
    from (select a.actor_id as id,
                 coalesce(max(p.nombre) || ' ' || coalesce(max(p.apellido), ''),
                          max(a.actor_email), 'Sin identificar') as quien,
                 count(*) as cuantos
            from cem_audit_events a
            left join cem_profiles p on p.id = a.actor_id
           where a.created_at >= v_hoy - p_dias and a.riesgo in ('medio', 'alto')
           group by a.actor_id limit 12) t;

  -- Mismo criterio que la deuda: un ticket de ocho días ya no es un ticket,
  -- es alguien que se fue.
  select jsonb_agg(jsonb_build_object('etq', t.etq, 'clave', t.clave,
           'n', coalesce(s.cuantos, 0)) order by t.orden)
    into v_tickets
    from (values ('Hoy', 'hoy', 0, 0, 0), ('1 a 2 días', '1-2', 1, 1, 2),
                 ('3 a 7', '3-7', 2, 3, 7), ('Más de una semana', '7mas', 3, 8, 100000))
         t(etq, clave, orden, d1, d2)
    left join lateral (
      select count(*) as cuantos from cem_tickets k
       where k.estado in ('abierto', 'en_proceso')
         and (v_hoy - k.created_at::date) between t.d1 and t.d2) s on true;

  select coalesce(jsonb_agg(jsonb_build_object(
           'clave', to_char(m.mes, 'YYYY-MM'), 'etq', to_char(m.mes, 'MM/YY'),
           'n', coalesce(c.total, 0)) order by m.mes), '[]'::jsonb)
    into v_certs
    from generate_series(date_trunc('month', v_hoy) - interval '11 months',
                         date_trunc('month', v_hoy), interval '1 month') m(mes)
    left join lateral (
      select count(*) as total from cem_certificates x
       where x.anulado_en is null and date_trunc('month', x.emitido_en) = m.mes) c on true;

  return jsonb_build_object('eventos', v_eventos, 'actores', v_actores,
                            'tickets', v_tickets, 'certificados', v_certs);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_series_grupo(p_cohort_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_notas jsonb; v_asist jsonb; v_valor jsonb; v_avance jsonb; v_curso uuid;
begin
  if not (cem_is_staff() or cem_is_teacher()) then
    raise exception 'No tienes permiso para ver este grupo.';
  end if;
  select course_id into v_curso from cem_cohorts where id = p_cohort_id;

  -- La campana de notas. Si sale con dos jorobas, el grupo va a dos
  -- velocidades y dar la clase a la media no le sirve a nadie.
  select coalesce(jsonb_agg(jsonb_build_object(
           'desde', (g - 1) * 10, 'hasta', g * 10 - case when g = 10 then 0 else 1 end,
           'n', (select count(*) from cem_submissions s
                  join cem_enrollments e on e.id = s.enrollment_id
                 where e.cohort_id = p_cohort_id and s.puntaje is not null
                   and least(width_bucket(s.puntaje, 0, 100, 10), 10) = g)) order by g), '[]'::jsonb)
    into v_notas from generate_series(1, 10) g;

  select coalesce(jsonb_agg(jsonb_build_object(
           'etq', to_char(c.fecha, 'DD/MM'), 'id', c.id,
           'n', coalesce(a.presentes, 0), 'de', coalesce(a.total, 0)) order by c.fecha), '[]'::jsonb)
    into v_asist
    from cem_classes c
    left join lateral (
      select count(*) filter (where at.presente) as presentes, count(*) as total
        from cem_attendance at where at.class_id = c.id) a on true
   where c.cohort_id = p_cohort_id and c.fecha <= current_date;

  -- Tres barras y nada más. Sin nombres: si se supiera quién dijo qué, se
  -- acaban las opiniones sinceras el mismo día.
  select jsonb_build_array(
      jsonb_build_object('etq', 'Claridad',  'n', round(coalesce(avg(claridad), 0), 2)),
      jsonb_build_object('etq', 'Utilidad',  'n', round(coalesce(avg(utilidad), 0), 2)),
      jsonb_build_object('etq', 'Ritmo',     'n', round(coalesce(avg(ritmo), 0), 2)))
    into v_valor from cem_valoraciones where cohort_id = p_cohort_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'etq', coalesce(m.titulo, 'Sin módulo'), 'id', m.id,
           'n', case when coalesce(t.total, 0) = 0 then 0
                     else round(100.0 * coalesce(v.vistas, 0) / (t.total * greatest(g.alumnos, 1)), 0) end)
           order by m.orden), '[]'::jsonb)
    into v_avance
    from cem_modules m
    cross join lateral (select count(*) as alumnos from cem_enrollments
                         where cohort_id = p_cohort_id) g
    left join lateral (select count(*) as total from cem_lessons l where l.module_id = m.id) t on true
    left join lateral (
      select count(*) as vistas from cem_lesson_progress lp
        join cem_lessons l on l.id = lp.lesson_id
        join cem_enrollments e on e.id = lp.enrollment_id
       where l.module_id = m.id and e.cohort_id = p_cohort_id and lp.completado) v on true
   where m.course_id = v_curso;

  return jsonb_build_object('notas', v_notas, 'asistencia', v_asist,
                            'valoraciones', v_valor, 'avance', v_avance);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_series_tablero(p_meses integer DEFAULT 12)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_embudo jsonb; v_ingresos jsonb; v_matricula jsonb; v_cartera jsonb; v_hoy date := current_date;
  v_meses text[] := array['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  v_solicitudes bigint; v_inscritos bigint; v_pagaron bigint; v_activos bigint; v_certificados bigint;
begin
  if not (cem_is_staff() or cem_can_read_all()) then
    raise exception 'No tienes permiso para ver el resumen.';
  end if;

  select count(*) into v_inscritos from cem_enrollments;
  -- Toda inscripción vino de una solicitud, la registrásemos o no.
  select v_inscritos + count(*) into v_solicitudes
    from cem_solicitudes_inscripcion where enrollment_id is null;
  select count(*) into v_pagaron from cem_enrollments e
   where exists (select 1 from cem_payments p
                  where p.enrollment_id = e.id and p.estado = 'confirmado');
  select count(*) into v_activos from cem_enrollments e
   where e.estado = 'activa'
     and exists (select 1 from cem_payments p
                  where p.enrollment_id = e.id and p.estado = 'confirmado');
  select count(*) into v_certificados from cem_certificates c
   where c.anulado_en is null
     and exists (select 1 from cem_payments p
                  where p.enrollment_id = c.enrollment_id and p.estado = 'confirmado');

  v_embudo := jsonb_build_array(
    jsonb_build_object('etq', 'Solicitudes',     'n', v_solicitudes),
    jsonb_build_object('etq', 'Se inscribieron', 'n', v_inscritos),
    jsonb_build_object('etq', 'Pagaron',         'n', v_pagaron),
    jsonb_build_object('etq', 'Siguen activos',  'n', v_activos),
    jsonb_build_object('etq', 'Se certificaron', 'n', v_certificados));

  select coalesce(jsonb_agg(jsonb_build_object(
           'clave', to_char(m.mes, 'YYYY-MM'),
           'etq', v_meses[extract(month from m.mes)::int]
                  || case when extract(month from m.mes) = 1 or m.mes = date_trunc('month', v_hoy)
                          then ' ' || to_char(m.mes, 'YY') else '' end,
           'n', coalesce(s.total, 0)) order by m.mes), '[]'::jsonb)
    into v_ingresos
    from generate_series(date_trunc('month', v_hoy) - make_interval(months => p_meses - 1),
                         date_trunc('month', v_hoy), interval '1 month') m(mes)
    left join lateral (
      select sum(coalesce(p.monto_base, p.monto)) as total
        from cem_payments p
       where p.estado = 'confirmado' and date_trunc('month', p.fecha) = m.mes) s on true;

  select coalesce(jsonb_agg(x order by (x->>'n')::numeric desc), '[]'::jsonb) into v_matricula from (
    select jsonb_build_object('etq', c.nombre, 'id', c.id,
             'n', count(e.id) filter (where e.estado = 'activa')) as x
      from cem_courses c join cem_enrollments e on e.course_id = c.id
     group by c.id, c.nombre
    having count(e.id) filter (where e.estado = 'activa') > 0) t;

  select jsonb_build_object(
      'cobrado',   coalesce((select sum(coalesce(monto_base, monto)) from cem_payments
                              where estado = 'confirmado'), 0),
      'porCobrar', coalesce((select sum(coalesce(nullif(saldo, 0), monto)) from cem_installments
                              where estado <> 'pagada' and fecha_vencimiento >= v_hoy), 0),
      'vencido',   coalesce((select sum(coalesce(nullif(saldo, 0), monto)) from cem_installments
                              where estado <> 'pagada' and fecha_vencimiento < v_hoy), 0))
    into v_cartera;

  return jsonb_build_object('embudo', v_embudo, 'ingresos', v_ingresos,
                            'matricula', v_matricula, 'cartera', v_cartera);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_short_borrar(p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_curso uuid;
begin
  select course_id into v_curso from cem_course_shorts where id = p_id;
  if v_curso is null then return jsonb_build_object('ok', true, 'borrados', 0); end if;
  if not (cem_is_staff() or (cem_is_teacher() and cem_docente_de_curso(v_curso))) then
    raise exception 'No puedes tocar el contenido de este curso.' using errcode = '42501';
  end if;
  delete from cem_course_shorts where id = p_id;
  return jsonb_build_object('ok', true, 'borrados', 1);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_short_guardar(p_course_id uuid, p_video text, p_titulo text, p_descripcion text DEFAULT NULL::text, p_duracion_seg integer DEFAULT NULL::integer, p_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_video text; v_id uuid; v_orden integer;
begin
  if not (cem_is_staff() or (cem_is_teacher() and cem_docente_de_curso(p_course_id))) then
    raise exception 'No puedes tocar el contenido de este curso.' using errcode = '42501';
  end if;
  if coalesce(trim(p_titulo), '') = '' then
    raise exception 'Ponle un título: es lo único que se lee antes de darle al play.';
  end if;

  v_video := coalesce(cem_youtube_id_de(p_video), nullif(trim(p_video), ''));
  if v_video is null or v_video !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'Eso no parece un vídeo de YouTube. Pega la dirección del short o su identificador, que tiene 11 caracteres.';
  end if;

  if p_id is not null then
    update cem_course_shorts
       set video_id = v_video, titulo = trim(p_titulo),
           descripcion = nullif(trim(p_descripcion), ''),
           duracion_seg = p_duracion_seg
     where id = p_id and course_id = p_course_id
    returning id into v_id;
    if v_id is null then raise exception 'Ese vídeo no está en este curso.'; end if;
  else
    -- Al final de la lista, que es donde se espera que caiga lo que se acaba
    -- de añadir.
    select coalesce(max(orden), 0) + 1 into v_orden
      from cem_course_shorts where course_id = p_course_id;
    insert into cem_course_shorts (course_id, video_id, titulo, descripcion, duracion_seg, orden, creado_por)
    values (p_course_id, v_video, trim(p_titulo), nullif(trim(p_descripcion), ''),
            p_duracion_seg, v_orden, auth.uid())
    -- Volver a pegar el mismo vídeo actualiza el que ya estaba en vez de dar un
    -- error de clave repetida, que no le dice nada a nadie.
    on conflict (course_id, video_id) do update
      set titulo = excluded.titulo, descripcion = excluded.descripcion,
          duracion_seg = excluded.duracion_seg
    returning id into v_id;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_short_publicar(p_id uuid, p_publicado boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_curso uuid;
begin
  select course_id into v_curso from cem_course_shorts where id = p_id;
  if v_curso is null then raise exception 'Ese vídeo ya no existe.'; end if;
  if not (cem_is_staff() or (cem_is_teacher() and cem_docente_de_curso(v_curso))) then
    raise exception 'No puedes tocar el contenido de este curso.' using errcode = '42501';
  end if;
  update cem_course_shorts set publicado = coalesce(p_publicado, true) where id = p_id;
  return jsonb_build_object('ok', true);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_shorts_del_curso(p_course_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'video_id', s.video_id, 'titulo', s.titulo,
           'descripcion', s.descripcion, 'duracion_seg', s.duracion_seg,
           'publicado', s.publicado, 'orden', s.orden)
         order by s.orden, s.created_at), '[]'::jsonb)
    from cem_course_shorts s
   where s.course_id = p_course_id
     and (
       cem_can_read_all()
       or (s.publicado and exists (
         select 1 from cem_enrollments e
          where e.profile_id = auth.uid()
            and e.course_id = p_course_id
            and cem_acceso_abierto(e.id)))
     );
$function$
;

CREATE OR REPLACE FUNCTION public.cem_shorts_ordenar(p_course_id uuid, p_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_n integer;
begin
  if not (cem_is_staff() or (cem_is_teacher() and cem_docente_de_curso(p_course_id))) then
    raise exception 'No puedes tocar el contenido de este curso.' using errcode = '42501';
  end if;
  with nuevo as (
    select id, ord from unnest(coalesce(p_ids, '{}'::uuid[])) with ordinality as t(id, ord)
  )
  update cem_course_shorts s set orden = n.ord
    from nuevo n where s.id = n.id and s.course_id = p_course_id;
  get diagnostics v_n = row_count;
  return jsonb_build_object('ok', true, 'reordenados', v_n);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_slug_de_certificado(p_codigo text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select p.perfil_slug
    from public.cem_certificates c
    join public.cem_profiles p on p.id = c.profile_id
   where upper(c.codigo) = upper(p_codigo)
     and p.perfil_publico = true and c.anulado_en is null;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_slug_perfil(p_nombre text, p_apellido text, p_id uuid)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select trim(both '-' from regexp_replace(
           lower(translate(coalesce(p_nombre,'') || '-' || coalesce(p_apellido,''),
                           'áéíóúàèìòùäëïöüñçÁÉÍÓÚÑÇ', 'aeiouaeiouaeiouncAEIOUNC')),
           '[^a-z0-9]+', '-', 'g'))
         || '-' || substr(replace(p_id::text, '-', ''), 1, 4);
$function$
;

CREATE OR REPLACE FUNCTION public.cem_solicitar_cambio_inscripcion(p_enrollment_id uuid, p_tipo text, p_motivo text, p_hasta date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_yo uuid := auth.uid(); v_dueno uuid; v_estado cem_inscripcion_estado; v_id uuid;
begin
  if p_tipo not in ('congelamiento','retiro','reactivacion') then
    raise exception 'Tipo de solicitud no reconocido.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Cuéntanos el motivo: es lo que va a leer quien lo resuelva.';
  end if;

  select profile_id, estado into v_dueno, v_estado
    from cem_enrollments where id = p_enrollment_id;
  if v_dueno is null then raise exception 'No encontramos esa inscripción.'; end if;
  if v_dueno <> v_yo and not cem_is_staff() then
    raise exception 'Sólo puedes pedir cambios sobre tus propias inscripciones.';
  end if;
  if v_estado in ('cancelada','finalizada') then
    raise exception 'Esa inscripción ya está %; no admite cambios.', v_estado;
  end if;
  if exists (select 1 from cem_solicitudes_inscripcion
              where enrollment_id = p_enrollment_id and estado = 'pendiente') then
    raise exception 'Ya tienes una solicitud pendiente sobre esta inscripción.';
  end if;

  insert into cem_solicitudes_inscripcion (enrollment_id, profile_id, tipo, motivo, hasta)
  values (p_enrollment_id, v_dueno, p_tipo, trim(p_motivo), p_hasta)
  returning id into v_id;

  -- al coordinador le llega que hay algo por resolver
  perform cem_notificar(p.id, 'solicitud_inscripcion',
            format('Solicitud de %s por resolver', p_tipo),
            trim(p_motivo), 'admin/inscripciones.html')
     from cem_profiles p
    where p.rol in ('coordinador','admin','superadmin') and p.activo;

  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_solicitar_cambio_inscripcion(p_enrollment_id uuid, p_tipo text, p_motivo text, p_hasta date DEFAULT NULL::date, p_cuotas integer DEFAULT NULL::integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_yo uuid := auth.uid(); v_dueno uuid; v_estado cem_inscripcion_estado; v_id uuid;
begin
  if p_tipo not in ('congelamiento','retiro','reactivacion','plan_de_pago') then
    raise exception 'Tipo de solicitud no reconocido.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Cuéntanos el motivo: es lo que va a leer quien lo resuelva.';
  end if;
  if p_tipo = 'plan_de_pago' and coalesce(p_cuotas, 0) not between 1 and 24 then
    raise exception 'Di en cuántas cuotas quieres pagarlo, entre 1 y 24.';
  end if;

  select profile_id, estado into v_dueno, v_estado
    from cem_enrollments where id = p_enrollment_id;
  if v_dueno is null then raise exception 'No encontramos esa inscripción.'; end if;
  if v_dueno <> v_yo and not cem_is_staff() then
    raise exception 'Sólo puedes pedir cambios sobre tus propias inscripciones.';
  end if;
  if v_estado in ('cancelada','finalizada') then
    raise exception 'Esa inscripción ya está %; no admite cambios.', v_estado;
  end if;
  if exists (select 1 from cem_solicitudes_inscripcion
              where enrollment_id = p_enrollment_id and estado = 'pendiente') then
    raise exception 'Ya tienes una solicitud pendiente sobre esta inscripción.';
  end if;

  insert into cem_solicitudes_inscripcion (enrollment_id, profile_id, tipo, motivo, hasta, datos)
  values (p_enrollment_id, v_dueno, p_tipo, trim(p_motivo), p_hasta,
          case when p_tipo = 'plan_de_pago'
               then jsonb_build_object('cuotas', p_cuotas) else '{}'::jsonb end)
  returning id into v_id;

  perform cem_notificar(p.id, 'solicitud_inscripcion',
            format('Solicitud de %s por resolver', replace(p_tipo, '_', ' ')),
            trim(p_motivo), 'admin/inscripciones.html')
     from cem_profiles p
    where p.rol in ('coordinador','admin','superadmin') and p.activo;

  return v_id;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_stripe_asegurar_forma_de_pago()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into cem_carteras (id, nombre, moneda, tipo, orden, activa, nota)
  values ('stripe', 'Stripe (tarjetas)', 'EUR', 'pasarela', 1, true,
          'Donde cae el dinero de los cobros con tarjeta antes de que Stripe lo deposite en el banco.')
  on conflict (id) do nothing;

  /* `directo`: lo que cobra Stripe es lo que salda la cuota, sin conversión.
     Y sin destino a propósito — el estudiante no transfiere a ningún sitio, así
     que un destino aquí sería una casilla vacía que nadie sabría rellenar. */
  insert into cem_metodos_pago (metodo, moneda, regla, activo, orden, cartera_id, instrucciones, nota)
  values ('Tarjeta de crédito/débito', 'EUR', 'directo', true, 1, 'stripe',
          'Se paga en el momento desde la plataforma. No hay que enviar comprobante: '
          || 'la confirmación llega sola y el curso se abre solo.',
          'La creó la conexión con Stripe. Si se desactiva, los cobros con tarjeta '
          || 'dejan de poder asentarse aunque Stripe siga cobrando.')
  on conflict (metodo) do update
     set activo = true, cartera_id = 'stripe', regla = 'directo';
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_stripe_codigo_fiscal(p_modalidad text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case p_modalidad
    -- Grabado y a demanda: el estudiante lo ve cuando quiere.
    when 'online'     then 'txcd_20060158'   -- On demand Online Courses (streamed)
    -- Clases en directo por internet.
    when 'en_vivo'    then 'txcd_20060045'   -- Training Services - Live Virtual
    -- En un aula.
    when 'presencial' then 'txcd_20060044'   -- Training
    -- Mezcla de las dos: el genérico de educación, que las cubre.
    else                   'txcd_20060052'   -- Educational Services
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_stripe_config_estado()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v jsonb; v_sec text; v_hook text;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede ver esta integración.' using errcode = '42501';
  end if;
  select coalesce(datos,'{}'::jsonb) into v from cem_integraciones where id = 'stripe';
  v_sec := v->>'secret_key'; v_hook := v->>'webhook_secret';
  return jsonb_build_object(
    'configurada', v_sec is not null and nullif(v->>'publishable_key','') is not null,
    'publishable_key', v->>'publishable_key',
    'modo', coalesce(v->>'modo', 'prueba'),
    'secreto_pista', case when v_sec is null then null else '••••' || right(v_sec, 4) end,
    'webhook_pista', case when v_hook is null then null else '••••' || right(v_hook, 4) end,
    'cobrados', (select count(*) from cem_stripe_sesiones where estado = 'pagada'),
    'abiertas', (select count(*) from cem_stripe_sesiones where estado = 'abierta'));
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_stripe_estado()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'listo', coalesce((
      select nullif(datos->>'secret_key','') is not null
         and nullif(datos->>'publishable_key','') is not null
        from cem_integraciones where id = 'stripe'), false),
    'publishable_key', (select datos->>'publishable_key' from cem_integraciones where id = 'stripe'),
    'modo', (select datos->>'modo' from cem_integraciones where id = 'stripe'))
  where auth.uid() is not null;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_stripe_guardar(p_publishable_key text, p_modo text DEFAULT 'prueba'::text, p_secret_key text DEFAULT NULL::text, p_webhook_secret text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_antes jsonb; v_sec text; v_hook text;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede configurar los cobros con tarjeta.' using errcode = '42501';
  end if;
  if coalesce(p_modo,'') not in ('prueba','real') then
    raise exception 'El modo tiene que ser «prueba» o «real».';
  end if;
  if coalesce(p_publishable_key,'') !~ '^pk_(test|live)_[A-Za-z0-9]{10,}$' then
    raise exception 'La clave pública de Stripe empieza por pk_test_ o pk_live_. Llegó "%".',
      left(coalesce(p_publishable_key,'(nada)'), 12);
  end if;
  if p_secret_key is not null and nullif(trim(p_secret_key),'') is not null
     and trim(p_secret_key) !~ '^(sk|rk)_(test|live)_[A-Za-z0-9]{10,}$' then
    raise exception 'La clave secreta de Stripe empieza por sk_test_, sk_live_ o rk_. Revisa que no hayas pegado la pública dos veces.';
  end if;
  if (p_modo = 'real') <> (p_publishable_key like 'pk_live_%') then
    raise exception 'El modo y la clave no coinciden: en modo real la clave tiene que ser pk_live_, y en prueba pk_test_.';
  end if;

  select coalesce(datos,'{}'::jsonb) into v_antes from cem_integraciones where id = 'stripe';
  v_sec  := coalesce(nullif(trim(p_secret_key), ''), v_antes->>'secret_key');
  v_hook := coalesce(nullif(trim(p_webhook_secret), ''), v_antes->>'webhook_secret');
  if v_sec is null then
    raise exception 'Falta la clave secreta. Es la que Stripe enseña una sola vez, en Developers → API keys.';
  end if;

  insert into cem_integraciones (id, datos, actualizado_en)
  values ('stripe', jsonb_build_object(
    'publishable_key', trim(p_publishable_key), 'secret_key', v_sec,
    'webhook_secret', v_hook, 'modo', p_modo), now())
  on conflict (id) do update set datos = excluded.datos, actualizado_en = now();

  -- Sin esto, Stripe cobra y la plataforma no sabe dónde asentar lo cobrado.
  perform cem_stripe_asegurar_forma_de_pago();

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, riesgo, detalle)
  select auth.uid(), (select email from cem_profiles where id = auth.uid()),
         'stripe.configurado', 'cem_integraciones', 'alto',
         jsonb_build_object('modo', p_modo, 'clave_publica', trim(p_publishable_key),
           'secreto_cambiado', nullif(trim(p_secret_key), '') is not null);

  return cem_stripe_config_estado();
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_stripe_producto_reflejar(p_course_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  c record;
  v_secreto text;
  v_pid text;
  v_url text;
  v_params jsonb;
  v_peticion bigint;
  v_desc text;
begin
  select * into c from cem_courses where id = p_course_id;
  if not found then return 'ese curso no existe'; end if;

  select datos->>'secret_key' into v_secreto from cem_integraciones where id = 'stripe';
  if v_secreto is null then
    update cem_courses
       set stripe_sync_error = 'Stripe no está configurado todavía.'
     where id = p_course_id;
    return 'sin configurar';
  end if;

  v_pid := coalesce(c.stripe_product_id, 'cem_' || replace(p_course_id::text, '-', ''));
  v_desc := nullif(trim(coalesce(c.descripcion_corta, c.descripcion)), '');

  v_params := jsonb_build_object(
    'name', left(coalesce(nullif(trim(c.nombre), ''), 'Programa'), 250),
    'active', case when c.estado::text = 'publicado' then 'true' else 'false' end,
    'tax_code', cem_stripe_codigo_fiscal(c.modalidad::text),
    'metadata[course_id]', p_course_id::text,
    'metadata[codigo]', coalesce(c.codigo, ''),
    'metadata[tipo]', c.tipo::text,
    'metadata[modalidad]', c.modalidad::text);

  if v_desc is not null then
    v_params := v_params || jsonb_build_object('description', left(v_desc, 500));
  end if;

  if c.imagen_url ~* '^https://' then
    v_params := v_params || jsonb_build_object('images[0]', c.imagen_url);
  end if;

  if c.stripe_product_id is null then
    v_url := 'https://api.stripe.com/v1/products';
    v_params := v_params || jsonb_build_object('id', v_pid);
  else
    v_url := 'https://api.stripe.com/v1/products/' || v_pid;
  end if;

  select net.http_post(
    url := v_url,
    params := v_params,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secreto),
    timeout_milliseconds := 8000
  ) into v_peticion;

  update cem_courses
     set stripe_product_id = v_pid,
         stripe_sync_peticion = v_peticion,
         stripe_sync_error = null
   where id = p_course_id;

  return v_pid;
end
$function$
;

CREATE OR REPLACE FUNCTION public.cem_stripe_quitar()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede desconectar los cobros con tarjeta.' using errcode = '42501';
  end if;
  delete from cem_integraciones where id = 'stripe';
  insert into cem_audit_events (actor_id, actor_email, accion, entidad, riesgo, detalle)
  select auth.uid(), (select email from cem_profiles where id = auth.uid()),
         'stripe.desconectado', 'cem_integraciones', 'alto',
         jsonb_build_object('nota', 'Deja de poderse pagar con tarjeta; el resto de formas siguen.');
  return cem_stripe_config_estado();
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_stripe_sync_revisar()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  f record;
  v_resueltos integer := 0;
  v_msg text;
begin
  for f in
    select c.id, c.stripe_sync_peticion, r.status_code, r.content, r.error_msg
      from cem_courses c
      join net._http_response r on r.id = c.stripe_sync_peticion
     where c.stripe_sync_peticion is not null
  loop
    v_resueltos := v_resueltos + 1;

    if f.status_code between 200 and 299 then
      update cem_courses
         set stripe_sync_en = now(), stripe_sync_error = null, stripe_sync_peticion = null
       where id = f.id;
    else
      begin
        v_msg := coalesce((f.content::jsonb)->'error'->>'message', f.error_msg,
                          'Stripe respondió ' || coalesce(f.status_code::text, 'sin código'));
      exception when others then
        v_msg := coalesce(f.error_msg, 'Stripe respondió ' || coalesce(f.status_code::text, 'sin código'));
      end;

      if v_msg ~* 'already exists' then
        -- Existía: se deja el identificador puesto y la próxima vez actualiza.
        update cem_courses
           set stripe_sync_en = now(), stripe_sync_error = null, stripe_sync_peticion = null
         where id = f.id;
      elsif v_msg ~* 'No such product' then
        -- No existía: se borra el identificador y la próxima vez lo crea.
        update cem_courses
           set stripe_product_id = null, stripe_sync_error = null, stripe_sync_peticion = null
         where id = f.id;
        perform cem_stripe_producto_reflejar(f.id);
      else
        update cem_courses
           set stripe_sync_error = left(v_msg, 300), stripe_sync_peticion = null
         where id = f.id;
      end if;
    end if;
  end loop;

  return v_resueltos;
end
$function$
;

CREATE OR REPLACE FUNCTION public.cem_submit_assessment(p_submission_id uuid, p_respuestas jsonb)
 RETURNS cem_submissions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_sub cem_submissions;
  v_a cem_assessments;
  v_total numeric := 0; v_obtenido numeric := 0;
  v_total_obj numeric := 0;
  v_manual boolean := false; v_n int := 0; v_tarde boolean := false;
  v_ok boolean; v_vale numeric; r record;
begin
  select * into v_sub from cem_submissions where id = p_submission_id;
  if v_sub.id is null then raise exception 'Entrega no encontrada.'; end if;
  if not (cem_owns_enrollment(v_sub.enrollment_id) or cem_is_staff()) then
    raise exception 'No autorizado.';
  end if;
  if not (cem_is_staff() or cem_acceso_abierto(v_sub.enrollment_id)) then
    raise exception 'Tu inscripción está pendiente de pago.';
  end if;
  if v_sub.entregado_en is not null then
    raise exception 'Esta evaluación ya fue entregada y no se puede volver a enviar.';
  end if;

  select * into v_a from cem_assessments where id = v_sub.assessment_id;

  if v_a.cierra_en is not null and now() > v_a.cierra_en then v_tarde := true; end if;
  if coalesce(v_a.tiempo_min, 0) > 0 and v_sub.iniciado_en is not null
     and now() > v_sub.iniciado_en + make_interval(mins => v_a.tiempo_min) then
    v_tarde := true;
  end if;

  for r in
    select aq.puntaje, q.id, q.tipo::text as tipo, q.respuesta_correcta
      from cem_assessment_questions aq
      join cem_questions q on q.id = aq.question_id
     where aq.assessment_id = v_sub.assessment_id
  loop
    v_n := v_n + 1;
    v_vale := coalesce(r.puntaje, 0);
    v_total := v_total + v_vale;
    v_ok := cem_es_correcta(r.tipo, p_respuestas -> r.id::text, r.respuesta_correcta);
    if v_ok is null then
      if v_vale > 0 then v_manual := true; end if;
    else
      v_total_obj := v_total_obj + v_vale;
      if v_ok then v_obtenido := v_obtenido + v_vale; end if;
      update cem_questions set usos = coalesce(usos, 0) + 1,
             aciertos = coalesce(aciertos, 0) + case when v_ok then 1 else 0 end
       where id = r.id;
    end if;
  end loop;

  if v_n = 0 then v_manual := true; end if;

  update cem_submissions set
    respuestas = p_respuestas, entregado_en = now(), tarde = v_tarde,
    estado = case when v_manual then 'entregada'::cem_entrega_estado else 'calificada'::cem_entrega_estado end,
    puntaje = case when v_manual then null
                   else case when v_total = 0 then 0 else round(100.0 * v_obtenido / v_total, 2) end end,
    puntaje_objetivo = case when v_total_obj = 0 then null
                            else round(100.0 * v_obtenido / v_total_obj, 2) end,
    peso_objetivo = case when v_total = 0 then null else round(100.0 * v_total_obj / v_total, 1) end,
    requiere_revision = v_manual,
    calificado_en = case when v_manual then null else now() end
  where id = p_submission_id
  returning * into v_sub;

  perform cem_recalc_progress(v_sub.enrollment_id);
  return v_sub;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_tasa_bcv_pedir(p_forzar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cfg jsonb := (select valor from cem_settings where clave = 'tasa_automatica');
  v_moneda text; v_url text; v_req bigint; v_pedidas int := 0;
begin
  if auth.uid() is not null and not public.cem_puede_cobranza() then
    raise exception 'Sólo el personal de cobranza puede pedir la tasa del BCV.';
  end if;

  if not coalesce((v_cfg->>'activa')::boolean, false) then
    return jsonb_build_object('ok', true, 'en_pausa', true, 'pedidas', 0,
      'motivo', 'La actualización automática está apagada.');
  end if;

  update cem_tasa_peticiones
     set estado = 'fallo', error = 'La respuesta se perdió.', resuelto_en = now()
   where estado = 'pidiendo' and pedido_en < now() - interval '10 minutes';

  for v_moneda in select * from jsonb_object_keys(v_cfg->'urls') loop
    if not p_forzar and exists (
         select 1 from cem_tasas_bcv
          where moneda = v_moneda and fecha = current_date and id_tasa = 'BCV') then
      continue;
    end if;
    if exists (select 1 from cem_tasa_peticiones
                where moneda = v_moneda and estado = 'pidiendo') then
      continue;
    end if;

    v_url := v_cfg->'urls'->>v_moneda;
    if v_url is null then continue; end if;

    v_req := net.http_get(url := v_url, timeout_milliseconds := 15000);
    insert into cem_tasa_peticiones (moneda, request_id) values (v_moneda, v_req);
    v_pedidas := v_pedidas + 1;
  end loop;

  return jsonb_build_object('ok', true, 'en_pausa', false, 'pedidas', v_pedidas);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_tasa_bcv_recoger()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_cfg jsonb := (select valor from cem_settings where clave = 'tasa_automatica');
  v_campo text := coalesce(v_cfg->>'campo', 'promedio');
  m record; v_valor numeric; v_fecha date; v_ok int := 0; v_mal int := 0; v_detalle text;
begin
  for m in
    select p.id, p.moneda, r.status_code, r.content, r.error_msg, r.timed_out
      from cem_tasa_peticiones p
      join net._http_response r on r.id = p.request_id
     where p.estado = 'pidiendo'
  loop
    v_valor := null; v_fecha := null; v_detalle := null;

    if m.status_code between 200 and 299 then
      begin
        v_valor := nullif(m.content::jsonb->>v_campo, '')::numeric;
        /* La fecha la pone el proveedor: si el BCV no publicó hoy, lo honesto
           es guardar la tasa con el día que de verdad le corresponde y no
           fecharla hoy, que la haría parecer más fresca de lo que es. */
        v_fecha := coalesce(
          (nullif(m.content::jsonb->>'fechaActualizacion', ''))::timestamptz::date,
          current_date);
      exception when others then
        v_detalle := 'La respuesta no traía un número donde se esperaba: '
                     || left(coalesce(m.content, ''), 200);
      end;
    else
      v_detalle := format('%s %s', coalesce(m.status_code, 0), left(coalesce(
        nullif(m.error_msg, ''),
        case when m.timed_out then 'El proveedor no respondió en 15 segundos.' end,
        coalesce(m.content, '')), 200));
    end if;

    /* Un número absurdo se descarta antes de guardarlo. Una tasa en cero o
       negativa rompería toda conversión, y una respuesta rara del proveedor no
       puede convertirse en el precio que se le cobra a alguien. */
    if v_valor is not null and v_valor <= 0 then
      v_detalle := format('El proveedor devolvió %s, que no es una tasa.', v_valor);
      v_valor := null;
    end if;

    if v_valor is null then
      update cem_tasa_peticiones
         set estado = 'fallo', error = coalesce(v_detalle, 'Sin respuesta utilizable.'),
             resuelto_en = now()
       where id = m.id;
      v_mal := v_mal + 1;
    else
      insert into cem_tasas_bcv (id_tasa, valor, descripcion, fecha, moneda, actualizado_en)
      values ('BCV', round(v_valor, 6), 'Tasa oficial del BCV, traída sola',
              v_fecha, m.moneda, now())
      on conflict (moneda, fecha, id_tasa) do update
        set valor = excluded.valor, actualizado_en = now();
      update cem_tasa_peticiones
         set estado = 'ok', error = null, resuelto_en = now()
       where id = m.id;
      v_ok := v_ok + 1;
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'guardadas', v_ok, 'fallidas', v_mal);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_tasa_estado()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'automatica', coalesce((select (valor->>'activa')::boolean from cem_settings where clave='tasa_automatica'), false),
    'fuente',     (select valor->>'fuente' from cem_settings where clave='tasa_automatica'),
    'monedas', coalesce((
      select jsonb_object_agg(x.pedida, jsonb_build_object(
        'valor', x.valor, 'fecha', x.fecha, 'origen', x.id_tasa,
        'descripcion', x.descripcion, 'actualizado_en', x.actualizado_en,
        -- La del banco de hoy, esté mandando o no.
        'bcv_hoy', (select b.valor from cem_tasas_bcv b
                     where b.moneda = x.pedida and b.id_tasa = 'BCV'
                     order by b.fecha desc limit 1),
        'bcv_fecha', (select b.fecha from cem_tasas_bcv b
                       where b.moneda = x.pedida and b.id_tasa = 'BCV'
                       order by b.fecha desc limit 1)))
      from (select (cem_tasa_vigente(m)).*, m as pedida from unnest(array['EUR','USD']) m) x
    ), '{}'::jsonb),
    'ultimo_intento', (select jsonb_build_object(
        'cuando', p.pedido_en, 'moneda', p.moneda, 'estado', p.estado, 'error', p.error)
       from cem_tasa_peticiones p order by p.pedido_en desc limit 1))
  where cem_puede_cobranza() or cem_es_auditor();
$function$
;

CREATE OR REPLACE FUNCTION public.cem_tasa_soltar_manual(p_moneda text, p_fecha date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_borradas int; v_queda numeric;
begin
  if not public.cem_puede_cobranza() then
    raise exception 'Sólo el personal de cobranza puede soltar la tasa cargada a mano.';
  end if;
  if coalesce(p_moneda,'') not in ('EUR','USD') then
    raise exception 'Sólo se llevan tasas del euro y del dólar.';
  end if;

  delete from cem_tasas_bcv
   where moneda = p_moneda and fecha = coalesce(p_fecha, current_date) and id_tasa = 'MANUAL';
  get diagnostics v_borradas = row_count;

  select valor into v_queda from cem_tasa_vigente(p_moneda);

  insert into cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'tasa_manual_soltada', 'cem_tasas_bcv', null, 'medio',
          jsonb_build_object('moneda', p_moneda, 'fecha', coalesce(p_fecha, current_date),
                             'borradas', v_borradas, 'queda_vigente', v_queda));

  return jsonb_build_object('ok', true, 'borradas', v_borradas, 'vigente', v_queda);
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_tasa_vigente()
 RETURNS TABLE(valor numeric, fecha date, id_tasa text, descripcion text, actualizado_en timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select t.valor, t.fecha, t.id_tasa, t.descripcion, t.actualizado_en
  from public.cem_tasas_bcv t
  order by t.fecha desc, t.actualizado_en desc
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_tasa_vigente(p_moneda text DEFAULT 'EUR'::text)
 RETURNS TABLE(valor numeric, fecha date, id_tasa text, descripcion text, moneda text, actualizado_en timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select t.valor, t.fecha, t.id_tasa, t.descripcion, t.moneda, t.actualizado_en
  from public.cem_tasas_bcv t
  where t.moneda = coalesce(p_moneda, 'EUR')
  -- Primero el día más nuevo; dentro del mismo día, la que escribió la casa.
  order by t.fecha desc, (t.id_tasa = 'MANUAL') desc, t.actualizado_en desc
  limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_tel_normal(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$ select right(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), 10) $function$
;

CREATE OR REPLACE FUNCTION public.cem_texto_llano(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select lower(btrim(regexp_replace(
    translate(coalesce(p, ''),
      'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
      'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'),
    '\s+', ' ', 'g')));
$function$
;
comment on function public.cem_texto_llano(p text) is 'Compara respuestas escritas a mano sin castigar por tildes, mayúsculas o espacios de más.';

CREATE OR REPLACE FUNCTION public.cem_tg_anotar_concesion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_regla text;
  v_cruce numeric;
begin
  select regla into v_regla from cem_metodos_pago where metodo = new.metodo;
  if v_regla is distinct from 'uno_a_uno' then
    new.tasa_cruce := null;
    new.concesion_base := null;
    return new;
  end if;

  v_cruce := cem_cruce_eur_usd((coalesce(new.fecha, now()))::date);
  new.tasa_cruce := v_cruce;
  -- Lo que valdría al cruce real es monto/cruce; lo que se le abona es el monto
  -- entero. La diferencia es lo concedido. Sin cruce cargado no se inventa: se
  -- deja en blanco, que es honesto, en vez de un cero que parece medido.
  new.concesion_base := case
    when v_cruce is null or v_cruce <= 0 then null
    else round(new.monto - (new.monto / v_cruce), 2)
  end;
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_tg_stripe_reflejar_curso()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if tg_op = 'INSERT'
     or new.nombre is distinct from old.nombre
     or new.descripcion_corta is distinct from old.descripcion_corta
     or new.descripcion is distinct from old.descripcion
     or new.imagen_url is distinct from old.imagen_url
     or new.modalidad is distinct from old.modalidad
     or new.tipo is distinct from old.tipo
     or new.codigo is distinct from old.codigo
     or new.estado is distinct from old.estado then
    perform cem_stripe_producto_reflejar(new.id);
  end if;
  return new;
end
$function$
;

CREATE OR REPLACE FUNCTION public.cem_update_certificate(p_certificate_id uuid, p_titulo text DEFAULT NULL::text, p_datos jsonb DEFAULT NULL::jsonb, p_motivo text DEFAULT NULL::text)
 RETURNS cem_certificates
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_antes cem_certificates; v_despues cem_certificates;
begin
  if not cem_is_staff() then raise exception 'No autorizado.'; end if;

  select * into v_antes from cem_certificates where id = p_certificate_id;
  if v_antes.id is null then raise exception 'Certificado no encontrado.'; end if;

  update cem_certificates set
    titulo = coalesce(nullif(btrim(p_titulo),''), titulo),
    -- la cedula se normaliza siempre al formato con puntos
    datos  = case
               when p_datos is null then datos
               else (coalesce(datos,'{}'::jsonb) || p_datos)
                    || jsonb_build_object('cedula',
                         cem_formato_cedula(coalesce(p_datos->>'cedula', datos->>'cedula')))
             end
  where id = p_certificate_id
  returning * into v_despues;

  insert into cem_audit_events(actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'certificado_corregido', 'cem_certificates', p_certificate_id, 'alto',
          jsonb_build_object('codigo', v_antes.codigo, 'motivo', p_motivo,
                             'antes', jsonb_build_object('titulo', v_antes.titulo, 'datos', v_antes.datos),
                             'despues', jsonb_build_object('titulo', v_despues.titulo, 'datos', v_despues.datos)));
  return v_despues;
end; $function$
;

CREATE OR REPLACE FUNCTION public.cem_valoracion_cursos(p_minimo integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_object_agg(x.course_id::text, jsonb_build_object(
           'nota', x.nota, 'respuestas', x.respuestas)), '{}'::jsonb)
    from (
      select co.course_id,
             round(avg((v.claridad + v.utilidad + v.ritmo) / 3.0)::numeric, 1) as nota,
             count(*) as respuestas
        from cem_valoraciones v
        join cem_classes c  on c.id = v.class_id
        join cem_cohorts co on co.id = c.cohort_id
       where v.claridad is not null and v.utilidad is not null and v.ritmo is not null
       group by co.course_id
      having count(*) >= greatest(coalesce(p_minimo, 5), 3)
    ) x;
$function$
;
comment on function public.cem_valoracion_cursos(p_minimo integer) is 'Nota media por curso para el catálogo público. Sólo cursos con suficientes respuestas; ni comentarios ni quién opinó.';

CREATE OR REPLACE FUNCTION public.cem_valoracion_lecciones(p_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_object_agg(t.lesson_id::text, jsonb_build_object(
           'media', round(t.media, 2), 'votos', t.votos)), '{}'::jsonb)
    from (
      select v.lesson_id, avg(v.util)::numeric as media, count(*) as votos
        from cem_leccion_valoraciones v
       where v.lesson_id = any(coalesce(p_ids, '{}'::uuid[]))
       group by v.lesson_id
      having count(*) >= 3      -- con uno o dos votos, la media señala a alguien
    ) t;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_valorar_clase(p_class_id uuid, p_claridad integer DEFAULT NULL::integer, p_utilidad integer DEFAULT NULL::integer, p_ritmo integer DEFAULT NULL::integer, p_comentario text DEFAULT NULL::text)
 RETURNS cem_valoraciones
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_cohorte uuid; v public.cem_valoraciones;
begin
  -- Quién eres, lo primero. Antes esto iba después de buscar la clase, y así
  -- la respuesta decía si un identificador existía o no a quien no tenía por
  -- qué saberlo.
  if auth.uid() is null then
    raise exception 'Necesitas haber entrado para valorar una clase.' using errcode = '42501';
  end if;

  select cohort_id into v_cohorte from public.cem_classes where id = p_class_id;
  if v_cohorte is null then raise exception 'Esa clase no existe.'; end if;
  if not exists (select 1 from public.cem_enrollments e
                  where e.cohort_id = v_cohorte and e.profile_id = auth.uid()) then
    raise exception 'Sólo opina de una clase quien estaba en ella.';
  end if;

  insert into public.cem_valoraciones (class_id, cohort_id, profile_id, claridad, utilidad, ritmo, comentario)
  values (p_class_id, v_cohorte, auth.uid(), p_claridad, p_utilidad, p_ritmo,
          nullif(btrim(coalesce(p_comentario,'')), ''))
  on conflict (class_id, profile_id) do update
    set claridad = excluded.claridad, utilidad = excluded.utilidad,
        ritmo = excluded.ritmo, comentario = excluded.comentario, created_at = now()
  returning * into v;
  return v;
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_ver_como(p_profile_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_p cem_profiles; v_ins jsonb; v_avisos jsonb; v_pagos jsonb;
begin
  if not cem_is_staff() then
    raise exception 'Sólo el personal autorizado puede mirar la cuenta de otra persona.';
  end if;
  select * into v_p from cem_profiles where id = p_profile_id;
  if v_p.id is null then raise exception 'No encontramos esa cuenta.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'enrollment_id', e.id,
      'curso', cur.nombre,
      'course_id', cur.id,
      'publicado', cur.estado = 'publicado',
      'estado', e.estado,
      'progreso', coalesce(e.progreso, 0),
      'abierto', cem_acceso_abierto(e.id),
      'porque', case
        when cem_acceso_abierto(e.id) then null
        when coalesce(e.precio_final, 0) <= 0 then 'Es gratuito y aun así aparece cerrado: revisar.'
        when not exists (select 1 from cem_payments pa
                          where pa.enrollment_id = e.id and pa.estado = 'confirmado')
          then case when exists (select 1 from cem_payments pa
                                  where pa.enrollment_id = e.id and pa.estado = 'reportado')
                    then 'Reportó un pago y está esperando que alguien lo verifique.'
                    else 'No hay ningún pago confirmado todavía.' end
        else 'La inscripción no está activa.' end,
      'cuotas_pendientes', (select count(*) from cem_installments i
                             where i.enrollment_id = e.id
                               and i.estado in ('pendiente','parcial','vencida'))
    ) order by e.fecha_inscripcion desc), '[]'::jsonb)
    into v_ins
    from cem_enrollments e
    left join cem_courses cur on cur.id = e.course_id
   where e.profile_id = p_profile_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', pa.id, 'fecha', pa.fecha, 'monto', pa.monto, 'moneda', pa.moneda,
      'metodo', pa.metodo, 'referencia', pa.referencia, 'estado', pa.estado,
      'nota', pa.nota,
      'nota_de', case when pa.estado = 'rechazado' then 'cobranza' else 'el estudiante' end
      ) order by pa.fecha desc), '[]'::jsonb)
    into v_pagos
    from cem_payments pa
    join cem_enrollments e on e.id = pa.enrollment_id
   where e.profile_id = p_profile_id and pa.estado in ('reportado','rechazado');

  select coalesce(jsonb_agg(jsonb_build_object(
      'tipo', n.tipo, 'titulo', n.titulo, 'cuando', n.created_at,
      'leido', n.leida_en is not null) order by n.created_at desc), '[]'::jsonb)
    into v_avisos
    from (select * from cem_notificaciones
           where profile_id = p_profile_id order by created_at desc limit 10) n;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), (select email from cem_profiles where id = auth.uid()),
          'ver_como', 'cem_profiles', p_profile_id, 'medio',
          jsonb_build_object('a_quien', v_p.email));

  return jsonb_build_object(
    'perfil', jsonb_build_object(
      'id', v_p.id, 'nombre', trim(coalesce(v_p.nombre,'') || ' ' || coalesce(v_p.apellido,'')),
      'email', v_p.email, 'rol', v_p.rol, 'activo', v_p.activo),
    'inscripciones', v_ins,
    'pagos_en_el_aire', v_pagos,
    'avisos', v_avisos,
    'correo_en_pausa', cem_correo_en_pausa());
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_verify_certificate(p_codigo text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'codigo', c.codigo, 'titulo', c.titulo, 'tipo', c.tipo, 'estado', c.estado,
    'emitido_en', c.emitido_en,
    'estudiante', trim(coalesce(p.nombre,'')||' '||coalesce(p.apellido,'')),
    'curso', co.nombre,
    'anulado', c.anulado_en is not null,
    'anulado_en', c.anulado_en,
    'anulado_motivo', c.anulado_motivo,
    -- Si el graduado publicó su perfil, la verificación puede llevar a él: quien
    -- escanea un título suele querer saber qué formación tiene esa persona, no
    -- sólo si ese papel concreto vale.
    'perfil_slug', case when p.perfil_publico then p.perfil_slug else null end
  )
  from cem_certificates c
  join cem_profiles p on p.id = c.profile_id
  left join cem_courses co on co.id = c.course_id
  where upper(c.codigo) = upper(p_codigo) and c.estado = 'emitido';
$function$
;

CREATE OR REPLACE FUNCTION public.cem_youtube_app_estado()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_app jsonb; v_canal jsonb; v_secreto text;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede ver esta integración.' using errcode = '42501';
  end if;
  select coalesce(datos,'{}'::jsonb) into v_app   from cem_integraciones where id = 'youtube_oauth_app';
  select coalesce(datos,'{}'::jsonb) into v_canal from cem_integraciones where id = 'youtube';
  v_secreto := v_app->>'client_secret';

  return jsonb_build_object(
    'configurada',   v_secreto is not null and nullif(v_app->>'client_id','') is not null,
    'client_id',     v_app->>'client_id',
    'redirect_uri',  v_app->>'redirect_uri',
    'secreto_pista', case when v_secreto is null then null else '••••' || right(v_secreto, 4) end,
    'conectado',     nullif(v_canal->>'refresh_token','') is not null,
    'canal',         v_canal->>'channel_title',
    'conectado_por', v_canal->>'conectado_por',
    'conectado_en',  v_canal->>'conectado_en'
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_youtube_app_guardar(p_client_id text, p_redirect_uri text, p_client_secret text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_antes jsonb; v_secreto text;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede configurar esta integración.' using errcode = '42501';
  end if;

  -- Google exige que el client_id termine en .apps.googleusercontent.com, y
  -- pegar el número del proyecto en su lugar es el error más común.
  if coalesce(p_client_id,'') !~ '\.apps\.googleusercontent\.com$' then
    raise exception 'El ID de cliente tiene que terminar en .apps.googleusercontent.com. Llegó "%".',
      coalesce(p_client_id,'(nada)');
  end if;
  -- La URL de retorno tiene que coincidir CARÁCTER POR CARÁCTER con la que se
  -- registró en Google, así que aquí se comprueba lo que se puede comprobar:
  -- que sea https (Google no acepta http salvo en localhost) y sin barra final,
  -- porque «…/x.html/» y «…/x.html» son direcciones distintas para Google.
  if coalesce(p_redirect_uri,'') !~ '^https://[^[:space:]]+$'
     and coalesce(p_redirect_uri,'') !~ '^http://localhost(:[0-9]+)?/[^[:space:]]*$' then
    raise exception 'La URL de retorno tiene que empezar por https:// (o http://localhost para probar). Llegó "%".',
      coalesce(p_redirect_uri,'(nada)');
  end if;
  if p_redirect_uri like '%/' then
    raise exception 'La URL de retorno no puede terminar en barra: para Google, con barra y sin barra son dos direcciones distintas.';
  end if;

  select coalesce(datos,'{}'::jsonb) into v_antes from cem_integraciones where id = 'youtube_oauth_app';
  -- Sin secreto nuevo se conserva el de antes: así se corrige la URL de retorno
  -- sin tener que ir a buscar el secreto otra vez a Google Cloud.
  v_secreto := coalesce(nullif(trim(p_client_secret), ''), v_antes->>'client_secret');
  if v_secreto is null then
    raise exception 'Falta el secreto de cliente. Es el que Google enseña una sola vez al crear las credenciales.';
  end if;

  insert into cem_integraciones (id, datos, actualizado_en)
  values ('youtube_oauth_app', jsonb_build_object(
    'client_id', trim(p_client_id), 'client_secret', v_secreto,
    'redirect_uri', trim(p_redirect_uri)), now())
  on conflict (id) do update set datos = excluded.datos, actualizado_en = now();

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, riesgo, detalle)
  select auth.uid(), (select email from cem_profiles where id = auth.uid()),
         'youtube.app_guardada', 'cem_integraciones', 'alto',
         jsonb_build_object('client_id', trim(p_client_id), 'redirect_uri', trim(p_redirect_uri),
           'secreto_cambiado', nullif(trim(p_client_secret), '') is not null);

  return cem_youtube_app_estado();
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_youtube_app_quitar()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede quitar esta integración.' using errcode = '42501';
  end if;
  -- Se van las dos: sin la app de Google el canal conectado no sirve de nada,
  -- y dejar el refresh_token suelto sólo es un secreto guardado sin uso.
  delete from cem_integraciones where id in ('youtube_oauth_app', 'youtube');
  insert into cem_audit_events (actor_id, actor_email, accion, entidad, riesgo, detalle)
  select auth.uid(), (select email from cem_profiles where id = auth.uid()),
         'youtube.app_quitada', 'cem_integraciones', 'alto',
         jsonb_build_object('nota', 'Se quitaron la app de Google y el canal conectado.');
  return cem_youtube_app_estado();
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_youtube_desconectar()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede desconectar el canal.' using errcode = '42501';
  end if;
  -- Sólo el canal: la app de Google se queda, que es lo que permite volver a
  -- conectar con dos clics en vez de rehacer todo en Google Cloud.
  delete from cem_integraciones where id = 'youtube';
  insert into cem_audit_events (actor_id, actor_email, accion, entidad, riesgo, detalle)
  select auth.uid(), (select email from cem_profiles where id = auth.uid()),
         'youtube.canal_desconectado', 'cem_integraciones', 'medio',
         jsonb_build_object('nota', 'Los videos ya subidos siguen en YouTube; sólo se cortó la subida.');
  return cem_youtube_app_estado();
end $function$
;

CREATE OR REPLACE FUNCTION public.cem_youtube_id_de(p_url text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select substring(coalesce(p_url,'') from
    '(?:youtube\.com/(?:embed/|watch\?v=|v/|shorts/|live/)|youtu\.be/|youtube-nocookie\.com/embed/)([A-Za-z0-9_-]{11})');
$function$
;

CREATE OR REPLACE FUNCTION public.cert_cedula_bonita(p_cedula text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
    when coalesce(regexp_replace(p_cedula, '[^0-9]', '', 'g'), '') = '' then coalesce(p_cedula, '')
    else regexp_replace(regexp_replace(p_cedula, '[^0-9]', '', 'g'),
                        '(\d)(?=(\d{3})+$)', '\1.', 'g')
  end;
$function$
;

CREATE OR REPLACE FUNCTION public.cert_cedula_plana(p_datos jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select nullif(regexp_replace(
    coalesce(p_datos->>'Cédula', p_datos->>'cedula', p_datos->>'Cedula', p_datos->>'CÉDULA', ''),
    '[^0-9]', '', 'g'), '');
$function$
;

CREATE OR REPLACE FUNCTION public.cert_exigir_gestor()
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  -- auth.uid() es null cuando llama el propio servidor con la clave de
  -- servicio: ahí no hay a quién comprobarle nada y se deja pasar.
  if auth.uid() is null and current_setting('request.jwt.claims', true) is null then
    return;
  end if;
  if not public.cert_puede_gestionar() then
    raise exception 'Hay que entrar con una cuenta del equipo para trabajar con los certificados.'
      using errcode = '42501';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cert_lote_agregar_persona(p_lote uuid, p_nombre text, p_cedula text)
 RETURNS SETOF cert_certificates
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_nombre text := nullif(trim(coalesce(p_nombre,'')), '');
  v_ced text := nullif(regexp_replace(coalesce(p_cedula,''), '[^0-9]', '', 'g'), '');
  v_modelo record;
  v_datos jsonb;
  v_nuevo cert_certificates;
begin
  perform cert_exigir_gestor();
  if v_nombre is null then raise exception 'Hace falta el nombre.'; end if;
  if v_ced is null then raise exception 'Hace falta la cédula.'; end if;
  if not exists (select 1 from cert_lotes where id = p_lote) then
    raise exception 'Ese grupo no existe.';
  end if;

  if exists (select 1 from cert_certificates
              where lote_id = p_lote and estado = 'vigente'
                and cert_cedula_plana(datos) = v_ced) then
    raise exception 'Esa cédula ya tiene certificados en este grupo. Si hay que corregirle algo, usa «editar a esta persona».';
  end if;

  -- Un modelo por módulo: el primero que se emitió, que es el que lleva la
  -- fecha buena del grupo.
  for v_modelo in
    select distinct on (plantilla_nombre) plantilla_nombre, datos, entidad_emisora
      from cert_certificates
     where lote_id = p_lote and estado = 'vigente'
     order by plantilla_nombre, created_at
  loop
    -- Se parte del modelo para heredar la fecha y cualquier campo del grupo
    -- (el puntaje del diploma no: ese es de cada quien y se deja en blanco a
    -- propósito, para que se vea que falta en vez de salir con el de otro).
    v_datos := v_modelo.datos;

    if v_datos ? 'Nombre'    then v_datos := jsonb_set(v_datos, '{Nombre}', to_jsonb(v_nombre));
    elsif v_datos ? 'nombre' then v_datos := jsonb_set(v_datos, '{nombre}', to_jsonb(v_nombre));
    else v_datos := jsonb_set(v_datos, '{Nombre}', to_jsonb(v_nombre));
    end if;

    if v_datos ? 'Cédula'    then v_datos := jsonb_set(v_datos, '{Cédula}', to_jsonb(cert_cedula_bonita(v_ced)));
    elsif v_datos ? 'cedula' then v_datos := jsonb_set(v_datos, '{cedula}', to_jsonb(cert_cedula_bonita(v_ced)));
    elsif v_datos ? 'Cedula' then v_datos := jsonb_set(v_datos, '{Cedula}', to_jsonb(cert_cedula_bonita(v_ced)));
    else v_datos := jsonb_set(v_datos, '{Cédula}', to_jsonb(cert_cedula_bonita(v_ced)));
    end if;

    if v_datos ? 'puntaje' then v_datos := jsonb_set(v_datos, '{puntaje}', to_jsonb(''::text)); end if;

    v_nuevo := issue_certificate(v_datos, v_modelo.entidad_emisora, p_lote, null, v_modelo.plantilla_nombre);
    return next v_nuevo;
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.cert_lote_editar_modulo(p_lote uuid, p_plantilla text, p_campo text, p_valor text)
 RETURNS SETOF cert_certificates
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_fila record;
  v_datos jsonb;
  v_nuevo cert_certificates;
begin
  perform cert_exigir_gestor();
  if nullif(trim(coalesce(p_campo,'')), '') is null then
    raise exception 'Hace falta decir qué campo se cambia.';
  end if;

  for v_fila in
    select * from cert_certificates
     where lote_id = p_lote and estado = 'vigente'
       and plantilla_nombre = p_plantilla
     order by cert_nombre_de(datos)
  loop
    v_datos := jsonb_set(v_fila.datos, array[p_campo], to_jsonb(coalesce(p_valor,'')));
    if v_datos = v_fila.datos then continue; end if;
    v_nuevo := replace_cert_certificate(v_fila.id, v_datos);
    return next v_nuevo;
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.cert_lote_completar_modulo(p_lote uuid, p_plantilla text)
 RETURNS SETOF cert_certificates
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_modelo cert_certificates;
  v_quien record;
  v_datos jsonb;
  v_nuevo cert_certificates;
begin
  perform cert_exigir_gestor();

  select * into v_modelo from cert_certificates
   where lote_id = p_lote and plantilla_nombre = p_plantilla and estado = 'vigente'
   order by created_at limit 1;
  if v_modelo.id is null then
    raise exception 'Nadie de este grupo tiene todavía ese documento, así que no hay de dónde copiar la fecha. Genéralo y regístralo para una persona y luego dáselo al resto.';
  end if;

  for v_quien in
    select * from cert_lote_personas(p_lote) p
     where not exists (
       select 1 from cert_certificates x
        where x.lote_id = p_lote and x.plantilla_nombre = p_plantilla
          and x.estado = 'vigente' and cert_cedula_plana(x.datos) = p.cedula)
  loop
    v_datos := v_modelo.datos;

    if v_datos ? 'Nombre'    then v_datos := jsonb_set(v_datos, '{Nombre}', to_jsonb(v_quien.nombre));
    elsif v_datos ? 'nombre' then v_datos := jsonb_set(v_datos, '{nombre}', to_jsonb(v_quien.nombre));
    else v_datos := jsonb_set(v_datos, '{Nombre}', to_jsonb(v_quien.nombre));
    end if;

    if v_datos ? 'Cédula'    then v_datos := jsonb_set(v_datos, '{Cédula}', to_jsonb(cert_cedula_bonita(v_quien.cedula)));
    elsif v_datos ? 'cedula' then v_datos := jsonb_set(v_datos, '{cedula}', to_jsonb(cert_cedula_bonita(v_quien.cedula)));
    elsif v_datos ? 'Cedula' then v_datos := jsonb_set(v_datos, '{Cedula}', to_jsonb(cert_cedula_bonita(v_quien.cedula)));
    else v_datos := jsonb_set(v_datos, '{Cédula}', to_jsonb(cert_cedula_bonita(v_quien.cedula)));
    end if;

    if v_datos ? 'puntaje' then v_datos := jsonb_set(v_datos, '{puntaje}', to_jsonb(''::text)); end if;

    v_nuevo := issue_certificate(v_datos, v_modelo.entidad_emisora, p_lote, null, p_plantilla);
    return next v_nuevo;
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.cert_lote_guardar(p_id uuid, p_nombre text, p_entidad text DEFAULT 'CEM'::text, p_nota text DEFAULT NULL::text)
 RETURNS cert_lotes
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r cert_lotes;
begin
  perform cert_exigir_gestor();
  insert into cert_lotes (id, nombre, entidad, nota, creado_por)
  values (coalesce(p_id, gen_random_uuid()), p_nombre,
          coalesce(nullif(p_entidad, ''), 'CEM'), p_nota,
          coalesce(auth.jwt() ->> 'email', 'sin-login'))
  on conflict (id) do update
     set nombre = excluded.nombre,
         entidad = excluded.entidad,
         nota = coalesce(excluded.nota, cert_lotes.nota)
  returning * into r;
  return r;
end $function$
;

CREATE OR REPLACE FUNCTION public.cert_lote_personas(p_lote uuid)
 RETURNS TABLE(cedula text, nombre text, cuantos bigint, vigentes bigint, modulos text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform cert_exigir_gestor();
  return query
    select c.ced,
           -- Si la misma cédula aparece con dos nombres distintos (porque uno
           -- se corrigió y otro no), gana el del certificado más reciente: es
           -- el que alguien ya se molestó en arreglar.
           (array_agg(c.nom order by c.created_at desc))[1],
           count(*), count(*) filter (where c.estado = 'vigente'),
           array_agg(distinct c.plantilla_nombre)
      from (select cert_cedula_plana(datos) as ced, cert_nombre_de(datos) as nom,
                   estado, plantilla_nombre, created_at
              from cert_certificates
             where lote_id = p_lote and estado <> 'reemplazado') c
     where c.ced is not null
     group by c.ced
     order by 2;
end $function$
;

CREATE OR REPLACE FUNCTION public.cert_nombre_de(p_datos jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select nullif(trim(coalesce(p_datos->>'Nombre', p_datos->>'nombre', p_datos->>'NOMBRE', '')), '');
$function$
;

CREATE OR REPLACE FUNCTION public.cert_persona_editar(p_lote uuid, p_cedula text, p_nombre_nuevo text DEFAULT NULL::text, p_cedula_nueva text DEFAULT NULL::text)
 RETURNS SETOF cert_certificates
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ced_busca text := nullif(regexp_replace(coalesce(p_cedula,''), '[^0-9]', '', 'g'), '');
  v_nombre text := nullif(trim(coalesce(p_nombre_nuevo, '')), '');
  v_ced_nueva text := nullif(regexp_replace(coalesce(p_cedula_nueva,''), '[^0-9]', '', 'g'), '');
  v_fila record;
  v_datos jsonb;
  v_nuevo cert_certificates;
begin
  perform cert_exigir_gestor();
  if v_ced_busca is null then
    raise exception 'Hace falta la cédula de la persona que se va a corregir.';
  end if;
  if v_nombre is null and v_ced_nueva is null then
    raise exception 'No hay nada que cambiar: dime el nombre nuevo, la cédula nueva, o las dos.';
  end if;

  for v_fila in
    select * from cert_certificates
     where (p_lote is null or lote_id = p_lote)
       and estado = 'vigente'
       and cert_cedula_plana(datos) = v_ced_busca
     order by plantilla_nombre
  loop
    v_datos := v_fila.datos;

    -- Se escribe en la clave que ESE certificado ya usa. Meter siempre
    -- «Cédula» dejaría el diploma —que la llama «cedula»— con dos claves y
    -- pintando la vieja.
    if v_nombre is not null then
      if v_datos ? 'Nombre'      then v_datos := jsonb_set(v_datos, '{Nombre}', to_jsonb(v_nombre));
      elsif v_datos ? 'nombre'   then v_datos := jsonb_set(v_datos, '{nombre}', to_jsonb(v_nombre));
      elsif v_datos ? 'NOMBRE'   then v_datos := jsonb_set(v_datos, '{NOMBRE}', to_jsonb(v_nombre));
      else v_datos := jsonb_set(v_datos, '{Nombre}', to_jsonb(v_nombre));
      end if;
    end if;

    if v_ced_nueva is not null then
      if v_datos ? 'Cédula'      then v_datos := jsonb_set(v_datos, '{Cédula}', to_jsonb(cert_cedula_bonita(v_ced_nueva)));
      elsif v_datos ? 'cedula'   then v_datos := jsonb_set(v_datos, '{cedula}', to_jsonb(cert_cedula_bonita(v_ced_nueva)));
      elsif v_datos ? 'Cedula'   then v_datos := jsonb_set(v_datos, '{Cedula}', to_jsonb(cert_cedula_bonita(v_ced_nueva)));
      elsif v_datos ? 'CÉDULA'   then v_datos := jsonb_set(v_datos, '{CÉDULA}', to_jsonb(cert_cedula_bonita(v_ced_nueva)));
      else v_datos := jsonb_set(v_datos, '{Cédula}', to_jsonb(cert_cedula_bonita(v_ced_nueva)));
      end if;
    end if;

    -- Si ese certificado ya decía exactamente esto, no se toca: reemplazarlo
    -- por uno idéntico sólo sirve para inventar un código nuevo y ensuciar el
    -- historial.
    if v_datos = v_fila.datos then continue; end if;

    v_nuevo := replace_cert_certificate(v_fila.id, v_datos);
    return next v_nuevo;
  end loop;
end $function$
;

CREATE OR REPLACE FUNCTION public.cert_puede_gestionar()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    -- el dueño histórico de la herramienta, por su correo
    public.is_cert_admin()
    -- o alguien del equipo de CEM con cuenta activa
    or exists (
      select 1 from public.cem_profiles
       where id = auth.uid() and activo
         and rol in ('coordinador', 'admin', 'superadmin')
    );
$function$
;
comment on function public.cert_puede_gestionar() is 'Quién puede diseñar plantillas y emitir, editar o revocar certificados.';

CREATE OR REPLACE FUNCTION public.date_dist(date, date)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$date_dist$function$
;

CREATE OR REPLACE FUNCTION public.delete_all_cert_certificates()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.cert_exigir_gestor();
  delete from public.cert_certificates where true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.delete_cert_template(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.cert_exigir_gestor();
  delete from public.cert_templates where id = p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.float4_dist(real, real)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$float4_dist$function$
;

CREATE OR REPLACE FUNCTION public.float8_dist(double precision, double precision)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$float8_dist$function$
;

CREATE OR REPLACE FUNCTION public.forest_add_tree_photo(p_tree_id uuid, p_tipo forest_photo_tipo, p_storage_path text, p_hash text DEFAULT NULL::text)
 RETURNS forest_tree_photos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_row forest_tree_photos;
begin
  select registrador_id into v_owner from forest_trees where id = p_tree_id;
  if v_owner <> auth.uid() then
    raise exception 'No autorizado.';
  end if;
  insert into forest_tree_photos(tree_id, tipo, storage_path, hash)
  values (p_tree_id, p_tipo, p_storage_path, p_hash)
  returning * into v_row;
  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_aplicar_marcadores(p_bloques jsonb, p_tree forest_trees, p_especie text, p_etiqueta text)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select case when p_bloques is null or p_bloques = '[]'::jsonb then '[]'::jsonb
    else replace(replace(replace(replace(replace(replace(replace(replace(
      p_bloques::text,
      '{{etiqueta}}',          coalesce(p_etiqueta, '')),
      '{{codigo}}',            coalesce(p_tree.codigo_visible, '')),
      '{{especie}}',           coalesce(p_especie, 'especie no identificada')),
      '{{altura}}',            coalesce(p_tree.altura_m::text || ' m', 'sin medir')),
      '{{dap}}',               coalesce(p_tree.dap_cm::text || ' cm', 'sin medir')),
      '{{condicion}}',         coalesce(p_tree.condicion::text, 'sin determinar')),
      '{{anio}}',              coalesce(extract(year from p_tree.created_at)::text, '')),
      '{{diametro_copa}}',     coalesce(p_tree.diametro_copa_m::text || ' m', 'sin medir')
    )::jsonb end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_assign_tree(p_tree_id uuid, p_supervisor_id uuid DEFAULT NULL::uuid)
 RETURNS forest_trees
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role forest_role; v_row forest_trees;
begin
  select rol into v_role from forest_profiles where id = auth.uid();
  if v_role not in ('administrador','supervisor') then raise exception 'No autorizado.'; end if;
  update forest_trees set asignado_a = p_supervisor_id where id = p_tree_id returning * into v_row;
  insert into forest_audit_events(tree_id, actor_id, accion, comentario)
  values (p_tree_id, auth.uid(), 'asignacion', p_supervisor_id::text);
  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_cambiar_tipo(p_tree_id uuid, p_tipo forest_tree_tipo, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_rol forest_role;
  v_anterior forest_tree_tipo;
begin
  select rol into v_rol from forest_profiles where id = auth.uid();
  if v_rol not in ('administrador','supervisor') then
    raise exception 'Solo un administrador o supervisor puede cambiar el tipo de árbol.';
  end if;

  select tipo into v_anterior from forest_trees where id = p_tree_id;
  if not found then raise exception 'El árbol indicado no existe.'; end if;
  if v_anterior = p_tipo then
    return jsonb_build_object('status','sin_cambios');
  end if;

  update forest_trees set tipo = p_tipo, updated_at = now() where id = p_tree_id;

  insert into forest_audit_events(tree_id, actor_id, accion, comentario)
  values (p_tree_id, auth.uid(), 'cambiar_tipo_arbol',
          format('De %s a %s%s', v_anterior, p_tipo,
                 case when p_motivo is null then '' else '. Motivo: ' || p_motivo end));

  return jsonb_build_object('status','ok','anterior',v_anterior,'nuevo',p_tipo);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_can_upload_photo(p_tree_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from forest_trees t
    join forest_profiles p on p.id = auth.uid()
    where t.id = p_tree_id and t.registrador_id = auth.uid() and p.rol = 'registrador'
  );
$function$
;

CREATE OR REPLACE FUNCTION public.forest_can_view_photo(p_tree_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from forest_profiles p where p.id = auth.uid() and p.rol in ('supervisor','administrador')
  ) or exists (
    select 1 from forest_trees t where t.id = p_tree_id and t.registrador_id = auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.forest_create_tree_draft(p_project_id uuid)
 RETURNS forest_trees
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role forest_role;
  v_codigo text;
  v_row forest_trees;
begin
  select rol into v_role from forest_profiles where id = auth.uid();
  if v_role is distinct from 'registrador' then
    raise exception 'Solo un registrador puede crear un árbol.';
  end if;
  v_codigo := forest_next_codigo(p_project_id);
  insert into forest_trees(codigo_visible, project_id, registrador_id, estado)
  values (v_codigo, p_project_id, auth.uid(), 'BORRADOR')
  returning * into v_row;
  insert into forest_audit_events(tree_id, actor_id, accion, estado_anterior, estado_nuevo)
  values (v_row.id, auth.uid(), 'crear_borrador', null, 'BORRADOR');
  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_dashboard_metrics()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role forest_role; v_result jsonb;
begin
  select rol into v_role from forest_profiles where id = auth.uid();
  if v_role <> 'administrador' then raise exception 'No autorizado.'; end if;
  select jsonb_build_object(
    'total', (select count(*) from forest_trees),
    'por_estado', (select coalesce(jsonb_object_agg(estado, cnt), '{}'::jsonb) from (select estado, count(*) cnt from forest_trees group by estado) s),
    'aprobados', (select count(*) from forest_trees where estado='APROBADO'),
    'rechazados', (select count(*) from forest_trees where estado='RECHAZADO'),
    'devueltos', (select count(*) from forest_trees where estado='REQUIERE_CORRECCION'),
    'pendientes', (select count(*) from forest_trees where estado in ('ENVIADO','EN_REVISION','REQUIERE_ESPECIALISTA')),
    'baja_precision_gps', (select count(*) from forest_trees where precision_m > 15),
    'coincidencia_ia_supervisor', (
      select coalesce(round(100.0 * count(*) filter (
        where lower(coalesce(t.nombre_comun_declarado,'')) = lower(coalesce(p.common_name,''))
      ) / greatest(count(*),1), 1), 0)
      from forest_trees t
      join lateral (select common_name from forest_ai_predictions where tree_id=t.id order by created_at desc limit 1) p on true
      where t.estado in ('APROBADO','RECHAZADO')
    ),
    'por_registrador', (
      select coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'total', total, 'aprobados', aprobados) order by total desc), '[]'::jsonb)
      from (
        select p.nombre as nombre, count(*) as total, count(*) filter (where t.estado = 'APROBADO') as aprobados
        from forest_trees t join forest_profiles p on p.id = t.registrador_id
        group by p.nombre
      ) s
    )
  ) into v_result;
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_decide_review(p_tree_id uuid, p_decision forest_decision, p_comentario text DEFAULT NULL::text, p_especie_confirmada_id uuid DEFAULT NULL::uuid)
 RETURNS forest_trees
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role forest_role; v_row forest_trees; v_prev forest_tree_estado; v_new forest_tree_estado;
begin
  select rol into v_role from forest_profiles where id = auth.uid();
  if v_role not in ('supervisor','administrador') then raise exception 'No autorizado.'; end if;
  select * into v_row from forest_trees where id = p_tree_id;
  if v_row.registrador_id = auth.uid() then
    raise exception 'Un registrador no puede aprobar su propio registro.';
  end if;
  if v_row.estado not in ('ENVIADO','EN_REVISION','REQUIERE_ESPECIALISTA') then
    raise exception 'Este registro no está en un estado revisable.';
  end if;
  v_prev := v_row.estado;
  v_new := case p_decision
    when 'aprobado' then 'APROBADO'
    when 'rechazado' then 'RECHAZADO'
    when 'devuelto' then 'REQUIERE_CORRECCION'
    when 'requiere_especialista' then 'REQUIERE_ESPECIALISTA'
  end;
  update forest_trees set
    estado = v_new,
    especie_confirmada_id = coalesce(p_especie_confirmada_id, especie_confirmada_id),
    updated_at = now()
  where id = p_tree_id returning * into v_row;
  insert into forest_reviews(tree_id, supervisor_id, decision, comentario)
  values (p_tree_id, auth.uid(), p_decision, p_comentario);
  insert into forest_audit_events(tree_id, actor_id, accion, estado_anterior, estado_nuevo, comentario)
  values (p_tree_id, auth.uid(), 'decision_revision:' || p_decision, v_prev, v_new, p_comentario);
  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_delete_push_subscription(p_endpoint text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  delete from forest_push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_get_arbol_publico(p_codigo text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'codigo_visible', t.codigo_visible,
    'estado', t.estado,
    'especie', s.nombre_comun,
    'nombre_cientifico', s.nombre_cientifico,
    'altura_m', t.altura_m,
    'dap_cm', t.dap_cm,
    'condicion', t.condicion,
    'creado', t.created_at,
    'lat_aprox', round(t.lat::numeric, 3),
    'lng_aprox', round(t.lng::numeric, 3),
    'fotos', coalesce((select jsonb_agg(p.storage_path) from forest_tree_photos p
                       where p.tree_id = t.id and p.tipo in ('arbol_completo','flor_fruto')), '[]'::jsonb)
  )
  from forest_trees t
  left join forest_species_catalog s on s.id = t.especie_confirmada_id
  where t.codigo_visible = p_codigo
    and t.estado = 'APROBADO'
    and t.tipo = 'PUBLICO';
$function$
;

CREATE OR REPLACE FUNCTION public.forest_get_default_project()
 RETURNS forest_projects
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from forest_projects order by created_at limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_get_my_profile()
 RETURNS TABLE(id uuid, nombre text, email text, rol forest_role, activo boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select id, nombre, email, rol, activo from forest_profiles where id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.forest_get_tree_detail(p_tree_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role forest_role;
  v_tree forest_trees;
  v_result jsonb;
begin
  select rol into v_role from forest_profiles where id = auth.uid();
  select * into v_tree from forest_trees where id = p_tree_id;
  if v_tree.id is null then return null; end if;
  if v_role = 'registrador' and v_tree.registrador_id <> auth.uid() then
    raise exception 'No autorizado.';
  end if;
  select jsonb_build_object(
    'tree', to_jsonb(v_tree),
    'photos', coalesce((select jsonb_agg(to_jsonb(p)) from forest_tree_photos p where p.tree_id = v_tree.id), '[]'::jsonb),
    'predictions', coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from forest_ai_predictions a where a.tree_id = v_tree.id), '[]'::jsonb),
    'reviews', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from forest_reviews r where r.tree_id = v_tree.id), '[]'::jsonb),
    'audit', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at) from forest_audit_events e where e.tree_id = v_tree.id), '[]'::jsonb),
    'registrador_nombre', (select nombre from forest_profiles where id = v_tree.registrador_id),
    'especie_confirmada', (select to_jsonb(s) from forest_species_catalog s where s.id = v_tree.especie_confirmada_id),
    'asignado_nombre', (select nombre from forest_profiles where id = v_tree.asignado_a)
  ) into v_result;
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (new.raw_user_meta_data->>'self_registered') = 'true' then
    insert into forest_profiles(id, nombre, email, rol, activo, cedula, telefono)
    values (
      new.id,
      trim(both ' ' from coalesce(new.raw_user_meta_data->>'nombre','') || ' ' || coalesce(new.raw_user_meta_data->>'apellido','')),
      new.email,
      'registrador',
      false,
      new.raw_user_meta_data->>'cedula',
      new.raw_user_meta_data->>'telefono'
    )
    on conflict (id) do nothing;
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_is_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select exists(select 1 from forest_profiles where id = auth.uid() and rol = 'administrador'); $function$
;

CREATE OR REPLACE FUNCTION public.forest_is_tree_approved(p_tree_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from forest_trees t where t.id = p_tree_id and t.estado = 'APROBADO');
$function$
;

CREATE OR REPLACE FUNCTION public.forest_list_all_trees(p_estado forest_tree_estado DEFAULT NULL::forest_tree_estado)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role forest_role; v_result jsonb;
begin
  select rol into v_role from forest_profiles where id = auth.uid();
  if v_role not in ('administrador','supervisor') then raise exception 'No autorizado.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'tree', to_jsonb(t),
    'registrador_nombre', (select nombre from forest_profiles where id=t.registrador_id),
    'especie', coalesce((select nombre_comun from forest_species_catalog where id=t.especie_confirmada_id), t.nombre_comun_declarado)
  ) order by t.created_at desc), '[]'::jsonb) into v_result
  from forest_trees t where (p_estado is null or t.estado = p_estado);
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_list_audit()
 RETURNS SETOF forest_audit_events
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role forest_role;
begin
  select rol into v_role from forest_profiles where id = auth.uid();
  if v_role <> 'administrador' then raise exception 'No autorizado.'; end if;
  return query select * from forest_audit_events order by created_at desc;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_list_my_trees()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'tree', to_jsonb(t),
    'foto_principal', (select storage_path from forest_tree_photos where tree_id=t.id and tipo='arbol_completo' limit 1),
    'ultima_revision', (select jsonb_build_object('decision', decision, 'comentario', comentario, 'created_at', created_at) from forest_reviews where tree_id = t.id order by created_at desc limit 1)
  ) order by t.created_at desc), '[]'::jsonb)
  from forest_trees t where t.registrador_id = auth.uid();
$function$
;

CREATE OR REPLACE FUNCTION public.forest_list_pending_review()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role forest_role; v_result jsonb;
begin
  select rol into v_role from forest_profiles where id = auth.uid();
  if v_role not in ('supervisor','administrador') then raise exception 'No autorizado.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'tree', to_jsonb(t),
    'foto_principal', (select storage_path from forest_tree_photos where tree_id=t.id and tipo='arbol_completo' limit 1),
    'prediccion', (select jsonb_build_object('common_name', common_name, 'scientific_name', scientific_name, 'confidence', confidence) from forest_ai_predictions where tree_id=t.id order by created_at desc limit 1),
    'registrador_nombre', (select nombre from forest_profiles where id = t.registrador_id),
    'asignado_nombre', (select nombre from forest_profiles where id = t.asignado_a),
    'dias_pendiente', extract(day from now() - t.created_at)::int
  ) order by t.created_at asc), '[]'::jsonb)
  into v_result
  from forest_trees t where estado in ('ENVIADO','EN_REVISION','REQUIERE_ESPECIALISTA');
  return v_result;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_list_species()
 RETURNS SETOF forest_species_catalog
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from forest_species_catalog order by nombre_comun;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_list_species_requests(p_estado text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role forest_role;
begin
  select rol into v_role from forest_profiles where id = auth.uid();
  if v_role not in ('administrador','supervisor') then raise exception 'No autorizado.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'request', to_jsonb(r),
      'arbol_codigo', t.codigo_visible,
      'supervisor_nombre', p.nombre
    ) order by r.created_at desc)
    from forest_species_requests r
    left join forest_trees t on t.id = r.tree_id
    left join forest_profiles p on p.id = r.supervisor_id
    where (p_estado is null or r.estado = p_estado)
      and (v_role = 'administrador' or r.supervisor_id = auth.uid())
  ), '[]'::jsonb);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_list_users()
 RETURNS SETOF forest_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role forest_role;
begin
  select rol into v_role from forest_profiles where id = auth.uid();
  if v_role <> 'administrador' then raise exception 'No autorizado.'; end if;
  return query select * from forest_profiles order by created_at;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_log_sync_event(p_tree_id uuid, p_accion text, p_comentario text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
begin
  if p_accion not in ('conflicto_detectado', 'conflicto_resuelto_servidor',
                      'conflicto_resuelto_local', 'conflicto_resuelto_combinado') then
    raise exception 'Accion de sincronizacion no reconocida.';
  end if;
  select registrador_id into v_owner from forest_trees where id = p_tree_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'No autorizado.';
  end if;
  insert into forest_audit_events(tree_id, actor_id, accion, comentario)
  values (p_tree_id, auth.uid(), p_accion, p_comentario);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_nearby_trees(p_lat double precision, p_lng double precision, p_radius_m double precision DEFAULT 8)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role forest_role;
begin
  select rol into v_role from forest_profiles where id = auth.uid();
  if v_role is null then raise exception 'No autorizado.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'codigo_visible', t.codigo_visible,
      'estado', t.estado,
      'especie', coalesce((select nombre_comun from forest_species_catalog where id=t.especie_confirmada_id), t.nombre_comun_declarado),
      'distancia_m', round((
        6371000 * acos(greatest(-1, least(1,
          cos(radians(p_lat)) * cos(radians(t.lat)) * cos(radians(t.lng) - radians(p_lng)) +
          sin(radians(p_lat)) * sin(radians(t.lat))
        )))
      )::numeric, 1)
    ))
    from forest_trees t
    where t.lat is not null and t.lng is not null and t.estado <> 'ARCHIVADO'
      and (
        6371000 * acos(greatest(-1, least(1,
          cos(radians(p_lat)) * cos(radians(t.lat)) * cos(radians(t.lng) - radians(p_lng)) +
          sin(radians(p_lat)) * sin(radians(t.lat))
        )))
      ) <= p_radius_m
  ), '[]'::jsonb);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_next_codigo(p_project_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_prefijo text;
  v_anio int := extract(year from now())::int;
  v_num int;
begin
  select prefijo into v_prefijo from forest_projects where id = p_project_id;
  insert into forest_code_sequences(project_id, anio, ultimo_numero)
  values (p_project_id, v_anio, 1)
  on conflict (project_id, anio) do update set ultimo_numero = forest_code_sequences.ultimo_numero + 1
  returning ultimo_numero into v_num;
  return v_prefijo || '-' || v_anio || '-' || lpad(v_num::text, 6, '0');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_open_for_review(p_tree_id uuid)
 RETURNS forest_trees
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role forest_role; v_row forest_trees; v_prev forest_tree_estado;
begin
  select rol into v_role from forest_profiles where id = auth.uid();
  if v_role not in ('supervisor','administrador') then raise exception 'No autorizado.'; end if;
  select * into v_row from forest_trees where id = p_tree_id;
  v_prev := v_row.estado;
  if v_row.estado = 'ENVIADO' then
    update forest_trees set estado = 'EN_REVISION', updated_at = now() where id = p_tree_id returning * into v_row;
    insert into forest_audit_events(tree_id, actor_id, accion, estado_anterior, estado_nuevo)
    values (p_tree_id, auth.uid(), 'abrir_revision', v_prev, 'EN_REVISION');
  end if;
  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_plantilla_guardar(p_ambito forest_tree_tipo, p_bloques_antes jsonb, p_bloques_despues jsonb, p_publicado boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not forest_is_admin() then
    raise exception 'Solo un administrador puede editar la plantilla pública.';
  end if;

  insert into forest_public_templates(ambito, bloques_antes, bloques_despues, publicado, actualizado_por, updated_at)
  values (p_ambito, coalesce(p_bloques_antes,'[]'::jsonb), coalesce(p_bloques_despues,'[]'::jsonb),
          p_publicado, auth.uid(), now())
  on conflict (ambito) do update set
    bloques_antes = excluded.bloques_antes,
    bloques_despues = excluded.bloques_despues,
    publicado = excluded.publicado,
    actualizado_por = excluded.actualizado_por,
    updated_at = now();

  insert into forest_audit_events(actor_id, accion, comentario)
  values (auth.uid(), 'plantilla_publica_editar',
          format('Plantilla de fichas %s actualizada (afecta a todas las fichas de ese tipo)', p_ambito));

  return jsonb_build_object('status','ok');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_plantilla_obtener(p_ambito forest_tree_tipo DEFAULT 'PUBLICO'::forest_tree_tipo)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(to_jsonb(t), '{}'::jsonb)
  from forest_public_templates t
  where t.ambito = p_ambito and forest_is_admin();
$function$
;

CREATE OR REPLACE FUNCTION public.forest_public_content_guardar(p_tree_id uuid, p_titulo text, p_resumen text, p_bloques jsonb, p_publicado boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_rol forest_role;
begin
  select rol into v_rol from forest_profiles where id = auth.uid();
  if v_rol not in ('administrador','supervisor') then
    raise exception 'Solo un administrador o supervisor puede editar la ficha pública.';
  end if;

  insert into forest_public_content(tree_id, titulo, resumen, bloques, publicado, actualizado_por, updated_at)
  values (p_tree_id, p_titulo, p_resumen, coalesce(p_bloques, '[]'::jsonb), p_publicado, auth.uid(), now())
  on conflict (tree_id) do update set
    titulo = excluded.titulo, resumen = excluded.resumen, bloques = excluded.bloques,
    publicado = excluded.publicado, actualizado_por = excluded.actualizado_por, updated_at = now();

  insert into forest_audit_events(tree_id, actor_id, accion, comentario)
  values (p_tree_id, auth.uid(), 'ficha_publica_editar',
          case when p_publicado then 'Ficha pública actualizada' else 'Ficha pública despublicada' end);

  return jsonb_build_object('status','ok');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_public_content_obtener(p_tree_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(to_jsonb(c), '{}'::jsonb)
  from forest_public_content c
  where c.tree_id = p_tree_id
    and exists (select 1 from forest_profiles p where p.id = auth.uid()
                and p.rol in ('administrador','supervisor'));
$function$
;

CREATE OR REPLACE FUNCTION public.forest_qr_generar_lote(p_nombre text, p_cantidad integer, p_tipo forest_tree_tipo DEFAULT 'PUBLICO'::forest_tree_tipo, p_prefijo text DEFAULT 'Árbol'::text, p_notas text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_batch forest_qr_batches;
  v_desde integer;
  v_i integer;
begin
  if not forest_is_admin() then
    raise exception 'Solo un administrador puede generar placas.';
  end if;
  if p_cantidad is null or p_cantidad < 1 or p_cantidad > 2000 then
    raise exception 'La cantidad debe estar entre 1 y 2000.';
  end if;

  -- El contador se bloquea para que dos administradores simultaneos no
  -- obtengan los mismos numeros visibles.
  update forest_qr_counter set ultimo_numero = ultimo_numero + p_cantidad
  where id = 1 returning ultimo_numero - p_cantidad into v_desde;

  insert into forest_qr_batches(nombre, prefijo_etiqueta, cantidad, numero_desde, numero_hasta,
                                tipo_previsto, notas, creado_por)
  values (coalesce(nullif(trim(p_nombre), ''), 'Lote sin nombre'), p_prefijo, p_cantidad,
          v_desde + 1, v_desde + p_cantidad, p_tipo, p_notas, auth.uid())
  returning * into v_batch;

  for v_i in 1..p_cantidad loop
    insert into forest_qr_tags(token, numero, etiqueta_visible, batch_id, tipo_previsto)
    values (forest_qr_token(), v_desde + v_i,
            p_prefijo || ' ' || lpad((v_desde + v_i)::text, 3, '0'),
            v_batch.id, p_tipo);
  end loop;

  insert into forest_audit_events(actor_id, accion, comentario)
  values (auth.uid(), 'qr_generar_lote',
          format('%s placas (%s %s a %s) tipo %s', p_cantidad, p_prefijo,
                 v_batch.numero_desde, v_batch.numero_hasta, p_tipo));

  return jsonb_build_object('batch', to_jsonb(v_batch));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_qr_listar_lotes()
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'batch', to_jsonb(b),
    'creado_por_nombre', (select nombre from forest_profiles where id = b.creado_por),
    'disponibles', (select count(*) from forest_qr_tags t where t.batch_id = b.id and t.estado = 'disponible'),
    'usadas', (select count(*) from forest_qr_tags t where t.batch_id = b.id and t.estado in ('asignada','colocada'))
  ) order by b.created_at desc), '[]'::jsonb)
  from forest_qr_batches b
  where forest_is_admin();
$function$
;

CREATE OR REPLACE FUNCTION public.forest_qr_listar_placas(p_batch_id uuid DEFAULT NULL::uuid, p_estado text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object(
    'tag', to_jsonb(t),
    'codigo_arbol', (select codigo_visible from forest_trees where id = t.tree_id),
    'especie', (select nombre_comun_declarado from forest_trees where id = t.tree_id)
  ) order by t.numero), '[]'::jsonb)
  from forest_qr_tags t
  where forest_is_admin()
    and (p_batch_id is null or t.batch_id = p_batch_id)
    and (p_estado is null or t.estado = p_estado);
$function$
;

CREATE OR REPLACE FUNCTION public.forest_qr_reponer(p_token_viejo text, p_token_nuevo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_vieja forest_qr_tags;
  v_nueva forest_qr_tags;
begin
  if not forest_is_admin() then raise exception 'Solo un administrador puede reponer placas.'; end if;
  select * into v_vieja from forest_qr_tags where token = upper(trim(p_token_viejo));
  if not found or v_vieja.tree_id is null then
    return jsonb_build_object('status','no_existe');
  end if;
  select * into v_nueva from forest_qr_tags where token = upper(trim(p_token_nuevo));
  if not found or v_nueva.estado <> 'disponible' then
    return jsonb_build_object('status','nueva_no_disponible');
  end if;

  update forest_qr_tags set estado = 'danada', updated_at = now() where id = v_vieja.id;
  update forest_qr_tags set tree_id = v_vieja.tree_id, estado = 'colocada',
         reemplaza_a = v_vieja.id, asignada_por = auth.uid(), asignada_en = now(),
         colocada_en = now(), updated_at = now()
  where id = v_nueva.id returning * into v_nueva;

  insert into forest_audit_events(tree_id, actor_id, accion, comentario)
  values (v_vieja.tree_id, auth.uid(), 'qr_reponer',
          format('Placa %s repuesta por %s', v_vieja.etiqueta_visible, v_nueva.etiqueta_visible));

  return jsonb_build_object('status','ok','tag',to_jsonb(v_nueva));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_qr_resolver(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tag forest_qr_tags;
  v_tree forest_trees;
  v_contenido forest_public_content;
  v_especie forest_species_catalog;
  v_plantilla forest_public_templates;
  v_antes jsonb := '[]'::jsonb;
  v_despues jsonb := '[]'::jsonb;
begin
  select * into v_tag from forest_qr_tags where token = upper(trim(p_token));
  if not found then
    return jsonb_build_object('status','desconocida');
  end if;

  if v_tag.tree_id is null then
    return jsonb_build_object('status','sin_asignar', 'etiqueta', v_tag.etiqueta_visible);
  end if;

  select * into v_tree from forest_trees where id = v_tag.tree_id;

  if v_tree.tipo = 'MANEJO' then
    return jsonb_build_object('status','no_publico', 'etiqueta', v_tag.etiqueta_visible,
      'mensaje','Este árbol pertenece a un área de manejo forestal. Su información es de uso institucional.');
  end if;

  if v_tree.estado <> 'APROBADO' then
    return jsonb_build_object('status','en_revision', 'etiqueta', v_tag.etiqueta_visible);
  end if;

  select * into v_contenido from forest_public_content where tree_id = v_tree.id;
  if found and not v_contenido.publicado then
    return jsonb_build_object('status','no_publicado', 'etiqueta', v_tag.etiqueta_visible);
  end if;

  select * into v_especie from forest_species_catalog where id = v_tree.especie_confirmada_id;

  -- La plantilla envuelve al contenido particular del arbol.
  select * into v_plantilla from forest_public_templates where ambito = v_tree.tipo;
  if found and v_plantilla.publicado then
    v_antes := forest_aplicar_marcadores(v_plantilla.bloques_antes, v_tree, v_especie.nombre_comun, v_tag.etiqueta_visible);
    v_despues := forest_aplicar_marcadores(v_plantilla.bloques_despues, v_tree, v_especie.nombre_comun, v_tag.etiqueta_visible);
  end if;

  return jsonb_build_object(
    'status','ok',
    'etiqueta', v_tag.etiqueta_visible,
    'codigo_visible', v_tree.codigo_visible,
    'titulo', coalesce(v_contenido.titulo, v_especie.nombre_comun, 'Árbol registrado'),
    'resumen', v_contenido.resumen,
    'bloques', v_antes
               || forest_aplicar_marcadores(coalesce(v_contenido.bloques,'[]'::jsonb), v_tree, v_especie.nombre_comun, v_tag.etiqueta_visible)
               || v_despues,
    'especie', v_especie.nombre_comun,
    'nombre_cientifico', v_especie.nombre_cientifico,
    'descripcion_especie', v_especie.descripcion,
    'altura_m', v_tree.altura_m,
    'dap_cm', v_tree.dap_cm,
    'condicion', v_tree.condicion,
    'creado', v_tree.created_at,
    'lat_aprox', round(v_tree.lat::numeric, 3),
    'lng_aprox', round(v_tree.lng::numeric, 3),
    'fotos', coalesce((select jsonb_agg(p.storage_path) from forest_tree_photos p
                       where p.tree_id = v_tree.id and p.tipo in ('arbol_completo','flor_fruto')), '[]'::jsonb)
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_qr_token()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_alfabeto text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  v_token text;
  v_i integer;
begin
  loop
    v_token := '';
    for v_i in 1..7 loop
      v_token := v_token || substr(v_alfabeto, 1 + floor(random() * length(v_alfabeto))::int, 1);
    end loop;
    exit when not exists (select 1 from forest_qr_tags where token = v_token);
  end loop;
  return v_token;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_qr_vincular(p_token text, p_tree_id uuid, p_colocada boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tag forest_qr_tags;
  v_tree forest_trees;
  v_rol forest_role;
begin
  select rol into v_rol from forest_profiles where id = auth.uid();
  select * into v_tag from forest_qr_tags where token = upper(trim(p_token));
  if not found then
    return jsonb_build_object('status','no_existe');
  end if;
  select * into v_tree from forest_trees where id = p_tree_id;
  if not found then
    raise exception 'El árbol indicado no existe.';
  end if;

  -- Un registrador solo puede etiquetar arboles suyos; el administrador, cualquiera.
  if v_rol = 'registrador' and v_tree.registrador_id <> auth.uid() then
    raise exception 'No puedes etiquetar un árbol que no registraste.';
  elsif v_rol not in ('registrador','administrador') then
    raise exception 'No autorizado.';
  end if;

  if v_tag.estado in ('danada','retirada') then
    return jsonb_build_object('status','placa_invalida','estado',v_tag.estado);
  end if;
  if v_tag.tree_id is not null and v_tag.tree_id <> p_tree_id then
    return jsonb_build_object('status','ya_usada',
      'codigo_arbol',(select codigo_visible from forest_trees where id = v_tag.tree_id));
  end if;
  if exists (select 1 from forest_qr_tags where tree_id = p_tree_id
             and estado in ('asignada','colocada') and id <> v_tag.id) then
    return jsonb_build_object('status','arbol_ya_etiquetado');
  end if;

  update forest_qr_tags set
    tree_id = p_tree_id,
    estado = case when p_colocada then 'colocada' else 'asignada' end,
    asignada_por = auth.uid(),
    asignada_en = coalesce(asignada_en, now()),
    colocada_en = case when p_colocada then now() else colocada_en end,
    updated_at = now()
  where id = v_tag.id
  returning * into v_tag;

  insert into forest_audit_events(tree_id, actor_id, accion, comentario)
  values (p_tree_id, auth.uid(), 'qr_vincular',
          format('Placa %s (%s) vinculada al árbol', v_tag.etiqueta_visible, v_tag.token));

  return jsonb_build_object('status','ok','tag',to_jsonb(v_tag));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_request_new_species(p_tree_id uuid, p_nombre_comun text, p_nombre_cientifico text DEFAULT NULL::text, p_comentario text DEFAULT NULL::text)
 RETURNS forest_species_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role forest_role; v_row forest_species_requests;
begin
  select rol into v_role from forest_profiles where id = auth.uid();
  if v_role <> 'supervisor' then raise exception 'No autorizado.'; end if;
  insert into forest_species_requests(tree_id, supervisor_id, nombre_comun_propuesto, nombre_cientifico_propuesto, comentario)
  values (p_tree_id, auth.uid(), p_nombre_comun, p_nombre_cientifico, p_comentario)
  returning * into v_row;
  insert into forest_audit_events(tree_id, actor_id, accion, comentario)
  values (p_tree_id, auth.uid(), 'especie_solicitada', p_nombre_comun);
  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_request_reconsideration(p_tree_id uuid, p_motivo text DEFAULT NULL::text)
 RETURNS forest_trees
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role forest_role; v_row forest_trees;
begin
  select rol into v_role from forest_profiles where id = auth.uid();
  if v_role <> 'registrador' then raise exception 'No autorizado.'; end if;
  select * into v_row from forest_trees where id = p_tree_id;
  if v_row.id is null or v_row.registrador_id <> auth.uid() then raise exception 'No autorizado.'; end if;
  if v_row.estado <> 'RECHAZADO' then raise exception 'Solo se puede solicitar reconsideración de un árbol rechazado.'; end if;
  update forest_trees set estado = 'EN_REVISION', updated_at = now() where id = p_tree_id returning * into v_row;
  insert into forest_audit_events(tree_id, actor_id, accion, estado_anterior, estado_nuevo, comentario)
  values (p_tree_id, auth.uid(), 'reconsideracion_solicitada', 'RECHAZADO', 'EN_REVISION', p_motivo);
  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_resolve_species_request(p_request_id uuid, p_aprobar boolean, p_nombre_comun text DEFAULT NULL::text, p_nombre_cientifico text DEFAULT NULL::text, p_descripcion text DEFAULT NULL::text, p_fotos jsonb DEFAULT NULL::jsonb, p_comentario text DEFAULT NULL::text)
 RETURNS forest_species_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role forest_role; v_row forest_species_requests; v_species forest_species_catalog;
begin
  select rol into v_role from forest_profiles where id = auth.uid();
  if v_role <> 'administrador' then raise exception 'No autorizado.'; end if;
  select * into v_row from forest_species_requests where id = p_request_id;
  if v_row.id is null then raise exception 'Solicitud no encontrada.'; end if;
  if v_row.estado <> 'pendiente' then raise exception 'La solicitud ya fue resuelta.'; end if;

  if p_aprobar then
    insert into forest_species_catalog(nombre_comun, nombre_cientifico, descripcion, fotos)
    values (
      coalesce(p_nombre_comun, v_row.nombre_comun_propuesto),
      coalesce(p_nombre_cientifico, v_row.nombre_cientifico_propuesto),
      p_descripcion,
      coalesce(p_fotos, '[]'::jsonb)
    ) returning * into v_species;

    update forest_species_requests
    set estado = 'aprobada', especie_creada_id = v_species.id, resuelto_por = auth.uid(), resuelto_en = now()
    where id = p_request_id
    returning * into v_row;
  else
    update forest_species_requests
    set estado = 'rechazada', resuelto_por = auth.uid(), resuelto_en = now()
    where id = p_request_id
    returning * into v_row;
  end if;

  insert into forest_audit_events(tree_id, actor_id, accion, comentario)
  values (v_row.tree_id, auth.uid(), 'especie_solicitud_' || v_row.estado, p_comentario);

  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_save_ai_prediction(p_tree_id uuid, p_provider text, p_model_version text, p_common_name text, p_scientific_name text, p_confidence numeric, p_alternatives jsonb, p_visible_characteristics jsonb, p_requires_human_review boolean, p_warnings jsonb)
 RETURNS forest_ai_predictions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_row forest_ai_predictions;
begin
  select registrador_id into v_owner from forest_trees where id = p_tree_id;
  if v_owner <> auth.uid() then raise exception 'No autorizado.'; end if;
  insert into forest_ai_predictions(tree_id, provider, model_version, common_name, scientific_name, confidence, alternatives, visible_characteristics, requires_human_review, warnings)
  values (p_tree_id, p_provider, p_model_version, p_common_name, p_scientific_name, p_confidence, coalesce(p_alternatives,'[]'), coalesce(p_visible_characteristics,'[]'), coalesce(p_requires_human_review, true), coalesce(p_warnings,'[]'))
  returning * into v_row;
  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into forest_push_subscriptions(user_id, endpoint, p256dh, auth_key)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth_key = excluded.auth_key;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_set_user_active(p_user_id uuid, p_activo boolean)
 RETURNS forest_profiles
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role forest_role; v_row forest_profiles;
begin
  select rol into v_role from forest_profiles where id = auth.uid();
  if v_role <> 'administrador' then raise exception 'No autorizado.'; end if;
  update forest_profiles set activo = p_activo where id = p_user_id returning * into v_row;
  insert into forest_audit_events(actor_id, accion, comentario) values (auth.uid(), 'usuario_activo:'||p_activo, p_user_id::text);
  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_submit_tree(p_tree_id uuid)
 RETURNS forest_trees
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row forest_trees;
  v_prev forest_tree_estado;
begin
  select * into v_row from forest_trees where id = p_tree_id;
  if v_row.registrador_id <> auth.uid() then raise exception 'No autorizado.'; end if;
  if v_row.estado not in ('BORRADOR','REQUIERE_CORRECCION') then
    raise exception 'Este registro no se puede enviar en su estado actual.';
  end if;
  v_prev := v_row.estado;
  update forest_trees set estado = 'ENVIADO', updated_at = now() where id = p_tree_id returning * into v_row;
  insert into forest_audit_events(tree_id, actor_id, accion, estado_anterior, estado_nuevo)
  values (p_tree_id, auth.uid(), 'enviar', v_prev, 'ENVIADO');
  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_sync_photo(p_tree_id uuid, p_tipo forest_photo_tipo, p_storage_path text, p_hash text)
 RETURNS forest_tree_photos
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner uuid;
  v_row forest_tree_photos;
begin
  select registrador_id into v_owner from forest_trees where id = p_tree_id;
  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'No autorizado.';
  end if;

  if p_hash is not null then
    select * into v_row from forest_tree_photos
    where tree_id = p_tree_id and hash = p_hash
    limit 1;
    if found then
      return v_row;
    end if;
  end if;

  insert into forest_tree_photos(tree_id, tipo, storage_path, hash)
  values (p_tree_id, p_tipo, p_storage_path, p_hash)
  returning * into v_row;
  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_sync_tree(p_client_id uuid, p_project_id uuid, p_payload jsonb, p_base_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_role forest_role;
  v_activo boolean;
  v_row forest_trees;
  v_codigo text;
begin
  select rol, activo into v_role, v_activo from forest_profiles where id = auth.uid();
  if v_role is distinct from 'registrador' then
    raise exception 'Solo un registrador puede sincronizar registros de campo.';
  end if;
  if not coalesce(v_activo, false) then
    raise exception 'Tu cuenta no esta activa.';
  end if;

  select * into v_row from forest_trees where client_id = p_client_id;

  if not found then
    v_codigo := forest_next_codigo(p_project_id);
    insert into forest_trees(
      client_id, codigo_visible, project_id, registrador_id, estado, tipo,
      lat, lng, precision_m, ubicacion_fuente, capturado_en,
      altura_m, dap_cm, diametro_copa_m, condicion, observaciones,
      nombre_comun_declarado, nombre_cientifico_tentativo
    ) values (
      p_client_id, v_codigo, p_project_id, auth.uid(), 'BORRADOR',
      coalesce((p_payload->>'tipo')::forest_tree_tipo, 'PUBLICO'),
      (p_payload->>'lat')::double precision,
      (p_payload->>'lng')::double precision,
      (p_payload->>'precision_m')::numeric,
      coalesce(p_payload->>'ubicacion_fuente', 'gps_navegador'),
      (p_payload->>'capturado_en')::timestamptz,
      (p_payload->>'altura_m')::numeric,
      (p_payload->>'dap_cm')::numeric,
      (p_payload->>'diametro_copa_m')::numeric,
      (p_payload->>'condicion')::forest_condicion,
      p_payload->>'observaciones',
      p_payload->>'nombre_comun_declarado',
      p_payload->>'nombre_cientifico_tentativo'
    )
    returning * into v_row;

    insert into forest_audit_events(tree_id, actor_id, accion, estado_anterior, estado_nuevo, comentario)
    values (v_row.id, auth.uid(), 'sincronizar_alta', null, 'BORRADOR',
            format('Registro capturado sin conexion (tipo %s)', v_row.tipo));

    return jsonb_build_object('status', 'ok', 'created', true, 'tree', to_jsonb(v_row));
  end if;

  if v_row.registrador_id <> auth.uid() then
    raise exception 'No autorizado.';
  end if;

  if v_row.estado not in ('BORRADOR', 'REQUIERE_CORRECCION') then
    return jsonb_build_object('status', 'blocked', 'reason', v_row.estado::text, 'tree', to_jsonb(v_row));
  end if;

  if not p_force and p_base_updated_at is not null and v_row.updated_at > p_base_updated_at then
    return jsonb_build_object('status', 'conflict', 'tree', to_jsonb(v_row));
  end if;

  update forest_trees set
    tipo                        = case when p_payload ? 'tipo' then (p_payload->>'tipo')::forest_tree_tipo else tipo end,
    lat                         = case when p_payload ? 'lat' then (p_payload->>'lat')::double precision else lat end,
    lng                         = case when p_payload ? 'lng' then (p_payload->>'lng')::double precision else lng end,
    precision_m                 = case when p_payload ? 'precision_m' then (p_payload->>'precision_m')::numeric else precision_m end,
    capturado_en                = case when p_payload ? 'capturado_en' then (p_payload->>'capturado_en')::timestamptz else capturado_en end,
    altura_m                    = case when p_payload ? 'altura_m' then (p_payload->>'altura_m')::numeric else altura_m end,
    dap_cm                      = case when p_payload ? 'dap_cm' then (p_payload->>'dap_cm')::numeric else dap_cm end,
    diametro_copa_m             = case when p_payload ? 'diametro_copa_m' then (p_payload->>'diametro_copa_m')::numeric else diametro_copa_m end,
    condicion                   = case when p_payload ? 'condicion' then (p_payload->>'condicion')::forest_condicion else condicion end,
    observaciones               = case when p_payload ? 'observaciones' then p_payload->>'observaciones' else observaciones end,
    nombre_comun_declarado      = case when p_payload ? 'nombre_comun_declarado' then p_payload->>'nombre_comun_declarado' else nombre_comun_declarado end,
    nombre_cientifico_tentativo = case when p_payload ? 'nombre_cientifico_tentativo' then p_payload->>'nombre_cientifico_tentativo' else nombre_cientifico_tentativo end,
    updated_at = now()
  where id = v_row.id
  returning * into v_row;

  insert into forest_audit_events(tree_id, actor_id, accion, estado_anterior, estado_nuevo, comentario)
  values (v_row.id, auth.uid(), 'sincronizar_edicion', v_row.estado::text, v_row.estado::text,
          case when p_force then 'Sincronizacion forzada tras resolver un conflicto' else null end);

  return jsonb_build_object('status', 'ok', 'created', false, 'tree', to_jsonb(v_row));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_update_tree_draft(p_tree_id uuid, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_precision_m numeric DEFAULT NULL::numeric, p_altura_m numeric DEFAULT NULL::numeric, p_dap_cm numeric DEFAULT NULL::numeric, p_diametro_copa_m numeric DEFAULT NULL::numeric, p_condicion forest_condicion DEFAULT NULL::forest_condicion, p_observaciones text DEFAULT NULL::text, p_nombre_comun_declarado text DEFAULT NULL::text, p_nombre_cientifico_tentativo text DEFAULT NULL::text)
 RETURNS forest_trees
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row forest_trees;
begin
  select * into v_row from forest_trees where id = p_tree_id;
  if v_row.registrador_id <> auth.uid() then
    raise exception 'No puedes editar un registro que no es tuyo.';
  end if;
  if v_row.estado not in ('BORRADOR','REQUIERE_CORRECCION') then
    raise exception 'Solo se pueden editar borradores o registros devueltos.';
  end if;
  update forest_trees set
    lat = coalesce(p_lat, lat),
    lng = coalesce(p_lng, lng),
    precision_m = coalesce(p_precision_m, precision_m),
    capturado_en = case when p_lat is not null then now() else capturado_en end,
    altura_m = coalesce(p_altura_m, altura_m),
    dap_cm = coalesce(p_dap_cm, dap_cm),
    diametro_copa_m = coalesce(p_diametro_copa_m, diametro_copa_m),
    condicion = coalesce(p_condicion, condicion),
    observaciones = coalesce(p_observaciones, observaciones),
    nombre_comun_declarado = coalesce(p_nombre_comun_declarado, nombre_comun_declarado),
    nombre_cientifico_tentativo = coalesce(p_nombre_cientifico_tentativo, nombre_cientifico_tentativo),
    updated_at = now()
  where id = p_tree_id
  returning * into v_row;
  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.forest_upsert_species(p_id uuid, p_nombre_comun text, p_nombre_cientifico text, p_sinonimos jsonb DEFAULT '[]'::jsonb, p_descripcion text DEFAULT NULL::text, p_fotos jsonb DEFAULT '[]'::jsonb)
 RETURNS forest_species_catalog
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_role forest_role; v_row forest_species_catalog;
begin
  select rol into v_role from forest_profiles where id = auth.uid();
  if v_role <> 'administrador' then raise exception 'No autorizado.'; end if;
  if p_id is null then
    insert into forest_species_catalog(nombre_comun, nombre_cientifico, sinonimos, descripcion, fotos)
    values (p_nombre_comun, p_nombre_cientifico, coalesce(p_sinonimos,'[]'), p_descripcion, coalesce(p_fotos,'[]'::jsonb))
    returning * into v_row;
  else
    update forest_species_catalog
    set nombre_comun = p_nombre_comun, nombre_cientifico = p_nombre_cientifico,
        sinonimos = coalesce(p_sinonimos,'[]'), descripcion = p_descripcion, fotos = coalesce(p_fotos,'[]'::jsonb)
    where id = p_id returning * into v_row;
  end if;
  return v_row;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.gbt_bit_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bit_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_bit_consistent(internal, bit, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bit_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_bit_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bit_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gbt_bit_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bit_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gbt_bit_same(gbtreekey_var, gbtreekey_var, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bit_same$function$
;

CREATE OR REPLACE FUNCTION public.gbt_bit_union(internal, internal)
 RETURNS gbtreekey_var
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bit_union$function$
;

CREATE OR REPLACE FUNCTION public.gbt_bool_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/btree_gist', $function$gbt_bool_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_bool_consistent(internal, boolean, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/btree_gist', $function$gbt_bool_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_bool_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/btree_gist', $function$gbt_bool_fetch$function$
;

CREATE OR REPLACE FUNCTION public.gbt_bool_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/btree_gist', $function$gbt_bool_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gbt_bool_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/btree_gist', $function$gbt_bool_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gbt_bool_same(gbtreekey2, gbtreekey2, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/btree_gist', $function$gbt_bool_same$function$
;

CREATE OR REPLACE FUNCTION public.gbt_bool_union(internal, internal)
 RETURNS gbtreekey2
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/btree_gist', $function$gbt_bool_union$function$
;

CREATE OR REPLACE FUNCTION public.gbt_bpchar_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bpchar_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_bpchar_consistent(internal, character, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bpchar_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_bytea_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bytea_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_bytea_consistent(internal, bytea, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bytea_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_bytea_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bytea_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gbt_bytea_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bytea_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gbt_bytea_same(gbtreekey_var, gbtreekey_var, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bytea_same$function$
;

CREATE OR REPLACE FUNCTION public.gbt_bytea_union(internal, internal)
 RETURNS gbtreekey_var
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_bytea_union$function$
;

CREATE OR REPLACE FUNCTION public.gbt_cash_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_cash_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_cash_consistent(internal, money, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_cash_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_cash_distance(internal, money, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_cash_distance$function$
;

CREATE OR REPLACE FUNCTION public.gbt_cash_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_cash_fetch$function$
;

CREATE OR REPLACE FUNCTION public.gbt_cash_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_cash_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gbt_cash_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_cash_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gbt_cash_same(gbtreekey16, gbtreekey16, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_cash_same$function$
;

CREATE OR REPLACE FUNCTION public.gbt_cash_union(internal, internal)
 RETURNS gbtreekey16
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_cash_union$function$
;

CREATE OR REPLACE FUNCTION public.gbt_date_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_date_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_date_consistent(internal, date, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_date_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_date_distance(internal, date, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_date_distance$function$
;

CREATE OR REPLACE FUNCTION public.gbt_date_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_date_fetch$function$
;

CREATE OR REPLACE FUNCTION public.gbt_date_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_date_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gbt_date_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_date_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gbt_date_same(gbtreekey8, gbtreekey8, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_date_same$function$
;

CREATE OR REPLACE FUNCTION public.gbt_date_union(internal, internal)
 RETURNS gbtreekey8
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_date_union$function$
;

CREATE OR REPLACE FUNCTION public.gbt_decompress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_decompress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_enum_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_enum_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_enum_consistent(internal, anyenum, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_enum_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_enum_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_enum_fetch$function$
;

CREATE OR REPLACE FUNCTION public.gbt_enum_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_enum_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gbt_enum_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_enum_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gbt_enum_same(gbtreekey8, gbtreekey8, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_enum_same$function$
;

CREATE OR REPLACE FUNCTION public.gbt_enum_union(internal, internal)
 RETURNS gbtreekey8
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_enum_union$function$
;

CREATE OR REPLACE FUNCTION public.gbt_float4_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float4_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_float4_consistent(internal, real, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float4_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_float4_distance(internal, real, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float4_distance$function$
;

CREATE OR REPLACE FUNCTION public.gbt_float4_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float4_fetch$function$
;

CREATE OR REPLACE FUNCTION public.gbt_float4_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float4_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gbt_float4_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float4_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gbt_float4_same(gbtreekey8, gbtreekey8, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float4_same$function$
;

CREATE OR REPLACE FUNCTION public.gbt_float4_union(internal, internal)
 RETURNS gbtreekey8
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float4_union$function$
;

CREATE OR REPLACE FUNCTION public.gbt_float8_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float8_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_float8_consistent(internal, double precision, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float8_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_float8_distance(internal, double precision, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float8_distance$function$
;

CREATE OR REPLACE FUNCTION public.gbt_float8_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float8_fetch$function$
;

CREATE OR REPLACE FUNCTION public.gbt_float8_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float8_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gbt_float8_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float8_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gbt_float8_same(gbtreekey16, gbtreekey16, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float8_same$function$
;

CREATE OR REPLACE FUNCTION public.gbt_float8_union(internal, internal)
 RETURNS gbtreekey16
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_float8_union$function$
;

CREATE OR REPLACE FUNCTION public.gbt_inet_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_inet_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_inet_consistent(internal, inet, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_inet_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_inet_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_inet_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gbt_inet_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_inet_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gbt_inet_same(gbtreekey16, gbtreekey16, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_inet_same$function$
;

CREATE OR REPLACE FUNCTION public.gbt_inet_union(internal, internal)
 RETURNS gbtreekey16
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_inet_union$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int2_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int2_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int2_consistent(internal, smallint, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int2_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int2_distance(internal, smallint, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int2_distance$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int2_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int2_fetch$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int2_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int2_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int2_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int2_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int2_same(gbtreekey4, gbtreekey4, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int2_same$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int2_union(internal, internal)
 RETURNS gbtreekey4
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int2_union$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int4_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int4_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int4_consistent(internal, integer, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int4_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int4_distance(internal, integer, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int4_distance$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int4_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int4_fetch$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int4_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int4_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int4_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int4_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int4_same(gbtreekey8, gbtreekey8, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int4_same$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int4_union(internal, internal)
 RETURNS gbtreekey8
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int4_union$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int8_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int8_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int8_consistent(internal, bigint, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int8_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int8_distance(internal, bigint, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int8_distance$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int8_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int8_fetch$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int8_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int8_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int8_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int8_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int8_same(gbtreekey16, gbtreekey16, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int8_same$function$
;

CREATE OR REPLACE FUNCTION public.gbt_int8_union(internal, internal)
 RETURNS gbtreekey16
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_int8_union$function$
;

CREATE OR REPLACE FUNCTION public.gbt_intv_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_intv_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_intv_consistent(internal, interval, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_intv_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_intv_decompress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_intv_decompress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_intv_distance(internal, interval, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_intv_distance$function$
;

CREATE OR REPLACE FUNCTION public.gbt_intv_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_intv_fetch$function$
;

CREATE OR REPLACE FUNCTION public.gbt_intv_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_intv_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gbt_intv_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_intv_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gbt_intv_same(gbtreekey32, gbtreekey32, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_intv_same$function$
;

CREATE OR REPLACE FUNCTION public.gbt_intv_union(internal, internal)
 RETURNS gbtreekey32
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_intv_union$function$
;

CREATE OR REPLACE FUNCTION public.gbt_macad8_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad8_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_macad8_consistent(internal, macaddr8, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad8_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_macad8_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad8_fetch$function$
;

CREATE OR REPLACE FUNCTION public.gbt_macad8_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad8_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gbt_macad8_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad8_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gbt_macad8_same(gbtreekey16, gbtreekey16, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad8_same$function$
;

CREATE OR REPLACE FUNCTION public.gbt_macad8_union(internal, internal)
 RETURNS gbtreekey16
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad8_union$function$
;

CREATE OR REPLACE FUNCTION public.gbt_macad_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_macad_consistent(internal, macaddr, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_macad_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad_fetch$function$
;

CREATE OR REPLACE FUNCTION public.gbt_macad_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gbt_macad_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gbt_macad_same(gbtreekey16, gbtreekey16, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad_same$function$
;

CREATE OR REPLACE FUNCTION public.gbt_macad_union(internal, internal)
 RETURNS gbtreekey16
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_macad_union$function$
;

CREATE OR REPLACE FUNCTION public.gbt_numeric_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_numeric_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_numeric_consistent(internal, numeric, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_numeric_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_numeric_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_numeric_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gbt_numeric_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_numeric_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gbt_numeric_same(gbtreekey_var, gbtreekey_var, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_numeric_same$function$
;

CREATE OR REPLACE FUNCTION public.gbt_numeric_union(internal, internal)
 RETURNS gbtreekey_var
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_numeric_union$function$
;

CREATE OR REPLACE FUNCTION public.gbt_oid_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_oid_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_oid_consistent(internal, oid, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_oid_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_oid_distance(internal, oid, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_oid_distance$function$
;

CREATE OR REPLACE FUNCTION public.gbt_oid_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_oid_fetch$function$
;

CREATE OR REPLACE FUNCTION public.gbt_oid_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_oid_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gbt_oid_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_oid_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gbt_oid_same(gbtreekey8, gbtreekey8, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_oid_same$function$
;

CREATE OR REPLACE FUNCTION public.gbt_oid_union(internal, internal)
 RETURNS gbtreekey8
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_oid_union$function$
;

CREATE OR REPLACE FUNCTION public.gbt_text_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_text_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_text_consistent(internal, text, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_text_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_text_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_text_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gbt_text_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_text_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gbt_text_same(gbtreekey_var, gbtreekey_var, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_text_same$function$
;

CREATE OR REPLACE FUNCTION public.gbt_text_union(internal, internal)
 RETURNS gbtreekey_var
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_text_union$function$
;

CREATE OR REPLACE FUNCTION public.gbt_time_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_time_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_time_consistent(internal, time without time zone, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_time_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_time_distance(internal, time without time zone, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_time_distance$function$
;

CREATE OR REPLACE FUNCTION public.gbt_time_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_time_fetch$function$
;

CREATE OR REPLACE FUNCTION public.gbt_time_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_time_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gbt_time_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_time_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gbt_time_same(gbtreekey16, gbtreekey16, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_time_same$function$
;

CREATE OR REPLACE FUNCTION public.gbt_time_union(internal, internal)
 RETURNS gbtreekey16
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_time_union$function$
;

CREATE OR REPLACE FUNCTION public.gbt_timetz_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_timetz_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_timetz_consistent(internal, time with time zone, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_timetz_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_ts_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_ts_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_ts_consistent(internal, timestamp without time zone, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_ts_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_ts_distance(internal, timestamp without time zone, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_ts_distance$function$
;

CREATE OR REPLACE FUNCTION public.gbt_ts_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_ts_fetch$function$
;

CREATE OR REPLACE FUNCTION public.gbt_ts_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_ts_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gbt_ts_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_ts_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gbt_ts_same(gbtreekey16, gbtreekey16, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_ts_same$function$
;

CREATE OR REPLACE FUNCTION public.gbt_ts_union(internal, internal)
 RETURNS gbtreekey16
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_ts_union$function$
;

CREATE OR REPLACE FUNCTION public.gbt_tstz_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_tstz_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_tstz_consistent(internal, timestamp with time zone, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_tstz_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_tstz_distance(internal, timestamp with time zone, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_tstz_distance$function$
;

CREATE OR REPLACE FUNCTION public.gbt_uuid_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_uuid_compress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_uuid_consistent(internal, uuid, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_uuid_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gbt_uuid_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_uuid_fetch$function$
;

CREATE OR REPLACE FUNCTION public.gbt_uuid_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_uuid_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gbt_uuid_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_uuid_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gbt_uuid_same(gbtreekey32, gbtreekey32, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_uuid_same$function$
;

CREATE OR REPLACE FUNCTION public.gbt_uuid_union(internal, internal)
 RETURNS gbtreekey32
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_uuid_union$function$
;

CREATE OR REPLACE FUNCTION public.gbt_var_decompress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_var_decompress$function$
;

CREATE OR REPLACE FUNCTION public.gbt_var_fetch(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbt_var_fetch$function$
;

CREATE OR REPLACE FUNCTION public.gbtreekey16_in(cstring)
 RETURNS gbtreekey16
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_in$function$
;

CREATE OR REPLACE FUNCTION public.gbtreekey16_out(gbtreekey16)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_out$function$
;

CREATE OR REPLACE FUNCTION public.gbtreekey2_in(cstring)
 RETURNS gbtreekey2
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_in$function$
;

CREATE OR REPLACE FUNCTION public.gbtreekey2_out(gbtreekey2)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_out$function$
;

CREATE OR REPLACE FUNCTION public.gbtreekey32_in(cstring)
 RETURNS gbtreekey32
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_in$function$
;

CREATE OR REPLACE FUNCTION public.gbtreekey32_out(gbtreekey32)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_out$function$
;

CREATE OR REPLACE FUNCTION public.gbtreekey4_in(cstring)
 RETURNS gbtreekey4
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_in$function$
;

CREATE OR REPLACE FUNCTION public.gbtreekey4_out(gbtreekey4)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_out$function$
;

CREATE OR REPLACE FUNCTION public.gbtreekey8_in(cstring)
 RETURNS gbtreekey8
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_in$function$
;

CREATE OR REPLACE FUNCTION public.gbtreekey8_out(gbtreekey8)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_out$function$
;

CREATE OR REPLACE FUNCTION public.gbtreekey_var_in(cstring)
 RETURNS gbtreekey_var
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_in$function$
;

CREATE OR REPLACE FUNCTION public.gbtreekey_var_out(gbtreekey_var)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$gbtreekey_out$function$
;

CREATE OR REPLACE FUNCTION public.get_cert_settings()
 RETURNS cert_settings
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.cert_settings;
begin
  perform public.cert_exigir_gestor();
  select * into r from public.cert_settings limit 1;
  return r;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_cert_template(p_id uuid)
 RETURNS cert_templates
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.cert_templates;
begin
  perform public.cert_exigir_gestor();
  select * into r from public.cert_templates where id = p_id;
  return r;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_certificado_publico(p_id uuid)
 RETURNS TABLE(datos jsonb, entidad_emisora text, estado text, emitido_en timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select datos, entidad_emisora, estado, created_at
  from public.cert_certificates
  where id = p_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_pm_project(p_id uuid)
 RETURNS SETOF pm_projects
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from public.pm_projects where id = p_id;
$function$
;

CREATE OR REPLACE FUNCTION public.get_quote(p_id uuid)
 RETURNS SETOF quotes
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select * from public.quotes where id = p_id;
$function$
;

CREATE OR REPLACE FUNCTION public.int2_dist(smallint, smallint)
 RETURNS smallint
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$int2_dist$function$
;

CREATE OR REPLACE FUNCTION public.int4_dist(integer, integer)
 RETURNS integer
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$int4_dist$function$
;

CREATE OR REPLACE FUNCTION public.int8_dist(bigint, bigint)
 RETURNS bigint
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$int8_dist$function$
;

CREATE OR REPLACE FUNCTION public.interval_dist(interval, interval)
 RETURNS interval
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$interval_dist$function$
;

CREATE OR REPLACE FUNCTION public.is_cert_admin()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce((auth.jwt() ->> 'email') = any (array['rengifojjrr@gmail.com']), false);
$function$
;

CREATE OR REPLACE FUNCTION public.issue_certificate(p_datos jsonb, p_entidad text, p_lote uuid, p_id uuid DEFAULT NULL::uuid, p_plantilla text DEFAULT NULL::text)
 RETURNS cert_certificates
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.cert_certificates;
begin
  insert into public.cert_certificates (id, datos, entidad_emisora, lote_id, created_by, plantilla_nombre)
  values (coalesce(p_id, gen_random_uuid()), coalesce(p_datos, '{}'::jsonb),
          coalesce(nullif(p_entidad,''), 'SEM'), p_lote, coalesce(auth.jwt() ->> 'email', 'sin-login'), p_plantilla)
  returning * into r;
  return r;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_cert_carpetas()
 RETURNS SETOF text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.cert_exigir_gestor();
  return query select c.ruta from public.cert_carpetas c order by c.ruta;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.list_cert_certificates(p_busca text DEFAULT NULL::text)
 RETURNS SETOF cert_certificates
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_q text := nullif(trim(coalesce(p_busca, '')), '');
begin
  perform cert_exigir_gestor();

  if v_q is null then
    return query select * from cert_certificates order by created_at desc limit 300;
    return;
  end if;

  /* Se busca en los datos y en el nombre de la plantilla, igual que hacía la
     pantalla. La cédula, además, sin puntos: quien escribe «27687821» tiene
     que encontrar el que dice «27.687.821», que es el caso normal cuando se
     copia de una lista y no del certificado. */
  return query
    select * from cert_certificates c
     where exists (select 1 from jsonb_each_text(c.datos) d
                    where d.value ilike '%' || v_q || '%')
        or c.plantilla_nombre ilike '%' || v_q || '%'
        or (regexp_replace(v_q, '[^0-9]', '', 'g') <> ''
            and cert_cedula_plana(c.datos) like '%' || regexp_replace(v_q, '[^0-9]', '', 'g') || '%')
     order by created_at desc
     limit 300;
end $function$
;

CREATE OR REPLACE FUNCTION public.list_cert_certificates_de_lote(p_lote uuid)
 RETURNS SETOF cert_certificates
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform cert_exigir_gestor();
  return query select * from cert_certificates
                where lote_id = p_lote
                order by created_at, plantilla_nombre;
end $function$
;

CREATE OR REPLACE FUNCTION public.list_cert_lotes()
 RETURNS TABLE(lote_id uuid, nombre text, entidad text, nota text, cuantos bigint, vigentes bigint, personas bigint, plantillas bigint, emitido_en timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform cert_exigir_gestor();
  return query
    select c.lote_id,
           /* Los lotes de antes de esta tabla no tienen nombre. En vez de
              enseñar un uuid —que no le dice nada a nadie— se arma uno con lo
              que sí se sabe: el día y cuánta gente. Se puede renombrar. */
           coalesce(l.nombre,
                    'Grupo del ' || to_char(min(c.created_at) at time zone 'America/Caracas', 'DD/MM/YYYY')),
           coalesce(l.entidad, max(c.entidad_emisora)),
           l.nota,
           count(*),
           count(*) filter (where c.estado = 'vigente'),
           count(distinct c.datos->>'Nombre'),
           count(distinct c.plantilla_nombre),
           min(c.created_at)
      from cert_certificates c
      left join cert_lotes l on l.id = c.lote_id
     where c.lote_id is not null
     group by c.lote_id, l.nombre, l.entidad, l.nota
     order by min(c.created_at) desc;
end $function$
;

CREATE OR REPLACE FUNCTION public.list_cert_templates_light()
 RETURNS TABLE(id uuid, nombre text, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.cert_exigir_gestor();
  return query select t.id, t.nombre, t.updated_at
                 from public.cert_templates t
                order by t.nombre;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.log_pm_project_event(p_project_id uuid, p_type text, p_summary text, p_detail jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.pm_projects (id) values (p_project_id)
  on conflict (id) do nothing;

  insert into public.pm_project_events (project_id, event_type, summary, detail)
  values (p_project_id, p_type, p_summary, coalesce(p_detail, '{}'::jsonb));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.log_quote_event(p_quote_id uuid, p_type text, p_summary text, p_detail jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.quotes (id) values (p_quote_id)
  on conflict (id) do nothing;

  insert into public.quote_events (quote_id, event_type, summary, detail)
  values (p_quote_id, p_type, p_summary, coalesce(p_detail, '{}'::jsonb));
end;
$function$
;

CREATE OR REPLACE FUNCTION public.oid_dist(oid, oid)
 RETURNS oid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$oid_dist$function$
;

CREATE OR REPLACE FUNCTION public.regenerate_certificate(p_id uuid, p_datos jsonb)
 RETURNS cert_certificates
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.cert_certificates;
  original public.cert_certificates;
begin
  select * into original from public.cert_certificates where id = p_id;
  if original.id is null then
    raise exception 'Certificado original no encontrado';
  end if;
  update public.cert_certificates set estado = 'reemplazado', updated_at = now() where id = p_id;
  insert into public.cert_certificates (datos, entidad_emisora, reemplaza_a, lote_id, created_by)
  values (coalesce(p_datos, original.datos), original.entidad_emisora, p_id, original.lote_id,
          coalesce(auth.jwt() ->> 'email', 'sin-login'))
  returning * into r;
  return r;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.replace_cert_certificate(p_id uuid, p_datos jsonb)
 RETURNS cert_certificates
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  vieja public.cert_certificates;
  nueva public.cert_certificates;
begin
  select * into vieja from public.cert_certificates where id = p_id;
  if vieja.id is null then
    raise exception 'Certificado no encontrado';
  end if;
  if vieja.estado = 'reemplazado' then
    raise exception 'Este certificado ya fue reemplazado antes';
  end if;

  update public.cert_certificates
    set estado = 'reemplazado', updated_at = now()
    where id = p_id;

  insert into public.cert_certificates
    (id, datos, entidad_emisora, lote_id, created_by, plantilla_nombre, reemplaza_a, estado)
  values
    (gen_random_uuid(), coalesce(p_datos, vieja.datos), vieja.entidad_emisora, vieja.lote_id,
     coalesce(auth.jwt() ->> 'email', 'sin-login'), vieja.plantilla_nombre, p_id, 'vigente')
  returning * into nueva;

  return nueva;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.restore_certificate(p_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_estado text;
  v_motivo_viejo text;
begin
  perform public.cert_exigir_gestor();

  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Hace falta decir por qué vuelve a estar vigente.'
      using errcode = 'check_violation';
  end if;

  select estado, motivo_revocacion into v_estado, v_motivo_viejo
    from public.cert_certificates where id = p_id;

  if v_estado is null then
    raise exception 'Ese certificado no existe.' using errcode = 'no_data_found';
  end if;

  if v_estado = 'vigente' then
    raise exception 'Ese certificado ya está vigente.' using errcode = 'check_violation';
  end if;

  if v_estado = 'reemplazado' then
    raise exception 'Ese certificado fue reemplazado por otro más nuevo. Devolverlo dejaría dos válidos para lo mismo: anula el nuevo primero, si es que el bueno era éste.'
      using errcode = 'check_violation';
  end if;

  update public.cert_certificates
     set estado = 'vigente',
         -- El motivo describía una anulación que ya no está en pie. Se borra de
         -- la fila —que dice el estado de HOY— y queda guardado en el registro.
         motivo_revocacion = null,
         updated_at = now()
   where id = p_id;

  insert into public.cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(),
          (select email from public.cem_profiles where id = auth.uid()),
          'certificado.devuelto_a_vigente', 'cert_certificates', p_id, 'alto',
          jsonb_build_object('motivo', btrim(p_motivo),
                             'motivo_de_la_anulacion', v_motivo_viejo));
end;
$function$
;
comment on function public.restore_certificate(p_id uuid, p_motivo text) is 'Devuelve a vigente un certificado revocado. Sólo coordinación o dirección; deja rastro en cem_audit_events.';

CREATE OR REPLACE FUNCTION public.revoke_certificate(p_id uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.cert_exigir_gestor();
  update public.cert_certificates
     set estado = 'revocado', motivo_revocacion = p_motivo, updated_at = now()
   where id = p_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_cert_carpetas(p_rutas text[])
 RETURNS SETOF text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform public.cert_exigir_gestor();

  delete from public.cert_carpetas
   where ruta <> all (coalesce(p_rutas, array[]::text[]));

  insert into public.cert_carpetas (ruta, creada_por)
  select distinct btrim(r), auth.uid()
    from unnest(coalesce(p_rutas, array[]::text[])) as r
   where btrim(r) <> ''
  on conflict (ruta) do nothing;

  return query select c.ruta from public.cert_carpetas c order by c.ruta;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_cert_settings(p_config jsonb)
 RETURNS cert_settings
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.cert_settings;
begin
  perform public.cert_exigir_gestor();
  insert into public.cert_settings (id, config, updated_at) values (1, p_config, now())
  on conflict (id) do update set config = excluded.config, updated_at = now()
  returning * into r;
  return r;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.save_cert_template(p_id uuid, p_nombre text, p_config jsonb)
 RETURNS cert_templates
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r public.cert_templates;
begin
  perform public.cert_exigir_gestor();
  if p_id is null then
    insert into public.cert_templates (nombre, config)
    values (coalesce(nullif(p_nombre,''), 'Sin nombre'), p_config)
    returning * into r;
  else
    update public.cert_templates
       set nombre = coalesce(nullif(p_nombre,''), 'Sin nombre'), config = p_config, updated_at = now()
     where id = p_id
    returning * into r;
    if r.id is null then
      insert into public.cert_templates (id, nombre, config)
      values (p_id, coalesce(nullif(p_nombre,''), 'Sin nombre'), p_config)
      returning * into r;
    end if;
  end if;
  return r;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.time_dist(time without time zone, time without time zone)
 RETURNS interval
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$time_dist$function$
;

CREATE OR REPLACE FUNCTION public.ts_dist(timestamp without time zone, timestamp without time zone)
 RETURNS interval
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$ts_dist$function$
;

CREATE OR REPLACE FUNCTION public.tstz_dist(timestamp with time zone, timestamp with time zone)
 RETURNS interval
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/btree_gist', $function$tstz_dist$function$
;

CREATE OR REPLACE FUNCTION public.upsert_pm_project(p_id uuid, p_meta jsonb, p_state jsonb)
 RETURNS pm_projects
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into public.pm_projects (id, meta, project_state, updated_at)
  values (p_id, coalesce(p_meta, '{}'::jsonb), coalesce(p_state, '{}'::jsonb), now())
  on conflict (id) do update
    set meta = excluded.meta,
        project_state = excluded.project_state,
        updated_at = now()
  returning *;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_quote(p_id uuid, p_client jsonb, p_state jsonb)
 RETURNS quotes
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  insert into public.quotes (id, client, quote_state, updated_at)
  values (p_id, coalesce(p_client, '{}'::jsonb), coalesce(p_state, '{}'::jsonb), now())
  on conflict (id) do update
    set client = excluded.client,
        quote_state = excluded.quote_state,
        updated_at = now()
  returning *;
$function$
;

