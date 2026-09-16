-- Arreglos de la radiografía del 12 de septiembre de 2026 (docs/auditoria-2026-09-12.md).
--
-- Todo lo que aquí se toca salió de esa revisión. Cada bloque dice qué
-- hallazgo cierra, para que quien lea esto dentro de un año sepa por qué está.
--
--   1. Cinco funciones que sólo debe llamar el reloj (pg_cron) tenían EXECUTE
--      para `authenticated`: cualquier alumno podía disparar el resumen semanal
--      o la recogida de correo. Se les quita.
--   2. `cem_alertas_gobierno` y `cem_tasa_bcv_recoger` no comprobaban quién las
--      llama. Las llama el reloj (sin sesión) y el equipo (con sesión); se
--      deja pasar al reloj y se exige rol a quien traiga sesión.
--   3. `cem_tasa_vigente()` sin parámetro era una firma vieja sin ningún
--      llamador; dos firmas confunden a PostgREST. Se borra.
--   4. `cem_visita_anotar` se comía la barra de `programas/marketing`. Se deja.
--   5. `cem_mis_notificaciones` contaba las no leídas una vez POR FILA.
--   6. Los ajustes que el sitio público necesita (analítica, contacto, cara y
--      nombre del asistente) salen por una función que devuelve SÓLO eso, y la
--      lectura directa de `cem_settings` se estrecha al equipo.
--   7. Quien escribe recibe un acuse, y el equipo —cobranza incluida— se entera
--      de cada contacto venga por donde venga (formulario, recurso, promoción,
--      asistente). Antes sólo avisaba el formulario de la web.
--   8. Un contacto que lleva más de un día en «nuevo» genera un recordatorio
--      diario al equipo. Y dos plantillas más para el seguimiento.

-- ── 1 · Sólo el reloj ───────────────────────────────────────────────────────
revoke all on function public.cem_correo_recoger()              from public, anon, authenticated;
revoke all on function public.cem_stripe_sync_revisar()         from public, anon, authenticated;
revoke all on function public.cem_compras_rescatar()            from public, anon, authenticated;
revoke all on function public.cem_bot_resumen_semanal_enviar()  from public, anon, authenticated;
revoke all on function public.cem_alertas_gobierno_avisar()     from public, anon, authenticated;

-- ── 2 · Guardias donde faltaban ─────────────────────────────────────────────
-- El reloj entra como `postgres`, sin sesión: `auth.uid()` es null. Una persona
-- entra con sesión y entonces se le pide el rol. Así la misma función sirve a
-- los dos sin abrirla a todo el mundo.
create or replace function public.cem_alertas_gobierno(p_dias integer default 30)
returns table(clave text, tipo text, titulo text, detalle text, riesgo text,
              cuando timestamptz, actor text, entidad_id uuid, url text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is not null and not exists (
       select 1 from cem_profiles
        where id = auth.uid() and activo
          and rol in ('auditor','coordinador','admin','superadmin')) then
    raise exception 'Las alertas de gobierno son para dirección y auditoría.';
  end if;

  return query
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
end $$;

create or replace function public.cem_tasa_bcv_recoger()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_cfg jsonb := (select valor from cem_settings where clave = 'tasa_automatica');
  v_campo text := coalesce(v_cfg->>'campo', 'promedio');
  m record; v_valor numeric; v_fecha date; v_ok int := 0; v_mal int := 0; v_detalle text;
begin
  -- El reloj la llama cada minuto sin sesión; una persona, desde «Verificar
  -- pagos» con el botón de «leer ya la tasa». A la persona se le pide el rol.
  if auth.uid() is not null and not cem_puede_cobranza() then
    raise exception 'Sólo cobranza y coordinación pueden recoger la tasa.';
  end if;

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
end $$;

-- ── 3 · Una sola firma para la tasa ─────────────────────────────────────────
-- Todas las pantallas pasan `p_moneda`; la firma sin parámetro devolvía además
-- una fila sin la moneda, que era la mentira más fácil de leer mal.
drop function if exists public.cem_tasa_vigente();

-- ── 4 · La barra de las pantallas ───────────────────────────────────────────
create or replace function public.cem_visita_anotar(
  p_pantalla text, p_course_id uuid default null, p_canal text default null, p_campana text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_canal text; v_pantalla text; v_campana text;
begin
  -- `programas/marketing` es una pantalla; sin la barra se leía «programasmarketing».
  v_pantalla := lower(left(regexp_replace(coalesce(p_pantalla, 'web'), '[^a-zA-Z0-9_/-]', '', 'g'), 40));
  v_pantalla := trim(both '/' from v_pantalla);
  if v_pantalla = '' then v_pantalla := 'web'; end if;

  v_canal := lower(btrim(coalesce(p_canal, '')));
  v_canal := case
    when v_canal = '' then 'directo'
    when v_canal ~ 'google|bing|duckduck' then 'buscador'
    when v_canal ~ 'instagram|^ig$' then 'instagram'
    when v_canal ~ 'facebook|^fb$' then 'facebook'
    when v_canal ~ 'tiktok' then 'tiktok'
    when v_canal ~ 'whatsapp|^wa$' then 'whatsapp'
    when v_canal ~ 'youtube' then 'youtube'
    when v_canal ~ 'linkedin' then 'linkedin'
    when v_canal ~ 'mail|correo|newsletter' then 'correo'
    when v_canal ~ 'manychat|recurso' then 'recurso'
    else left(regexp_replace(v_canal, '[^a-z0-9_-]', '', 'g'), 24)
  end;
  if v_canal = '' then v_canal := 'directo'; end if;

  v_campana := nullif(left(regexp_replace(coalesce(p_campana,''), '[^a-zA-Z0-9_ -]', '', 'g'), 40), '');

  /* Un tope por si alguien decide inflar el contador. No protege de mucho
     —es un contador público— pero evita que una sola fuente escriba millones
     de filas y deje la tabla inservible para leerla. */
  if not cem_rate_limit_consumir('visita:' || v_pantalla, 600, 60, 60) then
    return;
  end if;

  insert into cem_visitas as v (dia, pantalla, course_id, canal, campana, cuantas)
  values (current_date, v_pantalla, p_course_id, v_canal, v_campana, 1)
  on conflict (dia, pantalla, canal,
               coalesce(course_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(campana, ''))
    do update set cuantas = v.cuantas + 1;
end;
$$;

-- ── 5 · Las no leídas se cuentan una vez ────────────────────────────────────
create or replace function public.cem_mis_notificaciones(p_limite integer default 20, p_categoria text default null)
returns table(id uuid, tipo text, categoria text, titulo text, cuerpo text, url text,
              leida_en timestamptz, created_at timestamptz, sin_leer bigint)
language sql stable security definer set search_path = public as $$
  with sin_leer as (
    select count(*) as n from cem_notificaciones x
     where x.profile_id = auth.uid() and x.leida_en is null
  )
  select n.id, n.tipo, cem_notificacion_categoria(n.tipo), n.titulo, n.cuerpo, n.url,
         n.leida_en, n.created_at, (select n from sin_leer)
    from cem_notificaciones n
   where n.profile_id = auth.uid()
     and (nullif(trim(coalesce(p_categoria, '')), '') is null
          or p_categoria = 'todo'
          or cem_notificacion_categoria(n.tipo) = p_categoria)
   order by n.created_at desc
   limit least(greatest(coalesce(p_limite, 20), 1), 100);
$$;

-- ── 6 · Lo que el sitio público necesita saber, y nada más ──────────────────
-- `analitica`      → {ga4: 'G-XXXX', meta: '1234567890'}   (los píxeles)
-- `contacto_publico` → {whatsapp: '+58412…', correo: 'hola@…'}
-- Se escriben desde Configuración. Aquí sólo se leen y se devuelven junto al
-- nombre y la cara del asistente, que es lo otro que las páginas sin cuenta
-- pedían leyendo la tabla entera.
create or replace function public.cem_sitio_publico()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'analitica', jsonb_build_object(
       'ga4',  nullif(trim(coalesce((select valor->>'ga4'  from cem_settings where clave = 'analitica'), '')), ''),
       'meta', nullif(trim(coalesce((select valor->>'meta' from cem_settings where clave = 'analitica'), '')), '')),
    'contacto', jsonb_build_object(
       'whatsapp', nullif(trim(coalesce((select valor->>'whatsapp' from cem_settings where clave = 'contacto_publico'), '')), ''),
       'correo',   nullif(trim(coalesce((select valor->>'correo'   from cem_settings where clave = 'contacto_publico'), '')), '')),
    'asistente', jsonb_build_object(
       'nombre', coalesce(nullif(trim(coalesce(
                   (select case when jsonb_typeof(valor) = 'string' then valor #>> '{}' else valor->>'valor' end
                      from cem_settings where clave = 'asistente_nombre'), '')), ''), 'Cemi'),
       'foto',   nullif(trim(coalesce(
                   (select case when jsonb_typeof(valor) = 'string' then valor #>> '{}' else valor->>'valor' end
                      from cem_settings where clave = 'mascota_url'), '')), '')));
$$;
revoke all on function public.cem_sitio_publico() from public;
grant execute on function public.cem_sitio_publico() to anon, authenticated;

-- Con la función arriba, ya nadie que abra una página sin cuenta —ni un
-- estudiante desde el aula— tiene que leer la tabla de ajustes. La lectura
-- directa queda para el equipo, que es quien la usa desde Configuración,
-- Asistente y Diplomas en físico.
drop policy if exists cem_set_read on public.cem_settings;
create policy cem_set_read on public.cem_settings
  for select to authenticated using (cem_can_read_all());

-- ── 7 · Cada contacto avisa, venga por donde venga ─────────────────────────
-- Antes el aviso al equipo vivía dentro de `cem_lead_publico_crear`, así que
-- los contactos que entraban por un recurso, una promoción o el asistente no
-- avisaban a nadie: había cuatro esperando desde hacía días sin que saltara
-- ningún aviso. El aviso pasa a un disparador en la tabla, que no distingue
-- puertas. Y la persona recibe un acuse: «te leímos, te escribimos».
create or replace function public.cem_lead_publico_crear(
  p_nombre text, p_email text, p_telefono text default null, p_mensaje text default null,
  p_interes text default null, p_course_id uuid default null, p_origen text default 'web')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_nombre text := nullif(trim(coalesce(p_nombre,'')), '');
  v_email text := lower(nullif(trim(coalesce(p_email,'')), ''));
  v_id uuid;
  v_ultima_hora int;
begin
  if v_nombre is null or length(v_nombre) < 2 then
    raise exception 'Hace falta tu nombre.';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'Ese correo no parece un correo.';
  end if;

  -- Tope por persona: cinco en una hora es de sobra para alguien con dudas.
  if (select count(*) from cem_leads
       where lower(email) = v_email and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Ya recibimos tus mensajes. Te escribimos enseguida.';
  end if;

  /* Tope global. Es la red contra un robot que rote correos: sin esto, el
     tope por persona no protege de nada. Doscientos en una hora es muchísimo
     más de lo que este sitio recibe y aun así corta una inundación. */
  select count(*) into v_ultima_hora from cem_leads
   where created_at > now() - interval '1 hour' and origen = coalesce(p_origen, 'web');
  if v_ultima_hora >= 200 then
    raise exception 'Estamos recibiendo muchos mensajes ahora mismo. Prueba en un rato.';
  end if;

  insert into cem_leads (nombre, email, telefono, mensaje, interes, course_id, origen, estado)
  values (v_nombre, v_email, nullif(trim(coalesce(p_telefono,'')), ''),
          nullif(trim(coalesce(p_mensaje,'')), ''),
          nullif(trim(coalesce(p_interes,'')), ''),
          p_course_id, coalesce(nullif(trim(p_origen),''), 'web'), 'nuevo')
  returning id into v_id;

  -- El aviso al equipo y el acuse a la persona los pone el disparador
  -- `cem_lead_al_entrar`, igual que a los contactos que entran por otra puerta.
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.cem_lead_al_entrar()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nombre text := coalesce(nullif(trim(coalesce(new.nombre, '') || ' ' || coalesce(new.apellido, '')), ''), 'Alguien');
  v_pila   text := coalesce(nullif(split_part(trim(coalesce(new.nombre, '')), ' ', 1), ''), 'hola');
  v_interes text := coalesce(nullif(trim(coalesce(new.interes, '')), ''),
                             (select c.nombre from cem_courses c where c.id = new.course_id),
                             'nuestra formación');
  v_cuerpo text;
begin
  /* Al equipo. Cobranza también, porque en el CEM es quien más llama. */
  perform cem_avisar_equipo('lead_nuevo',
    format('%s quiere información', v_nombre),
    format('%s · llegó por %s.%s',
           v_interes, coalesce(nullif(trim(coalesce(new.origen, '')), ''), 'la web'),
           case when nullif(trim(coalesce(new.mensaje, '')), '') is not null
                then E'\n\n«' || left(trim(new.mensaje), 400) || '»' else '' end),
    'admin/leads.html?id=' || new.id::text,
    array['cobranza','coordinador','admin','superadmin']);

  /* A la persona, sólo si dejó un correo de verdad. Los de prueba no reciben
     nada: `cem_correo_es_de_mentira` los conoce. */
  if nullif(trim(coalesce(new.email, '')), '') is not null
     and not cem_correo_es_de_mentira(new.email) then
    v_cuerpo := format(E'Hola %s:\n\n'
      'Recibimos tu mensaje sobre %s. Una persona del equipo te escribe en menos de un día hábil; '
      'si prefieres que te llamemos, responde a este correo con tu número y una hora buena.\n\n'
      'Mientras tanto, puedes ver los programas abiertos en https://escuelacem.com/programas/\n\n'
      'Un saludo,\nEquipo CEM International', v_pila, v_interes);
    insert into cem_correo_cola (para, asunto, cuerpo, clave)
    values (lower(trim(new.email)), 'Recibimos tu mensaje', v_cuerpo, 'lead-acuse:' || new.id::text)
    on conflict (clave) where estado = 'pendiente' do nothing;
  end if;

  return new;
end $$;
revoke all on function public.cem_lead_al_entrar() from public, anon, authenticated;

drop trigger if exists cem_lead_al_entrar on public.cem_leads;
create trigger cem_lead_al_entrar
  after insert on public.cem_leads
  for each row execute function public.cem_lead_al_entrar();

-- ── 8 · Que nadie se quede en «nuevo» sin que se note ───────────────────────
-- Una vez al día, si hay contactos con más de un día sin que nadie los toque,
-- un solo aviso al equipo con la cuenta y el más viejo. Uno, no uno por
-- contacto: cuarenta avisos iguales son ruido y el ruido se ignora.
create or replace function public.cem_leads_recordar()
returns integer
language plpgsql security definer set search_path = public as $$
declare v_n int; v_viejo record;
begin
  if auth.uid() is not null and not cem_is_staff() then
    raise exception 'Esto lo dispara el reloj.';
  end if;

  select count(*) into v_n from cem_leads
   where estado = 'nuevo' and created_at < now() - interval '24 hours';
  if v_n = 0 then return 0; end if;

  -- Uno al día. Si hoy ya se avisó, no se insiste.
  if exists (select 1 from cem_notificaciones
              where tipo = 'lead_sin_atender' and created_at::date = current_date) then
    return 0;
  end if;

  select nombre, apellido, created_at into v_viejo from cem_leads
   where estado = 'nuevo' and created_at < now() - interval '24 hours'
   order by created_at limit 1;

  perform cem_avisar_equipo('lead_sin_atender',
    case when v_n = 1 then 'Un contacto lleva más de un día sin respuesta'
         else format('%s contactos llevan más de un día sin respuesta', v_n) end,
    format('El más antiguo es %s, que escribió el %s. Entra a Contactos y márcalo como contactado cuando le hayas escrito.',
           coalesce(nullif(trim(coalesce(v_viejo.nombre, '') || ' ' || coalesce(v_viejo.apellido, '')), ''), 'alguien'),
           to_char(v_viejo.created_at, 'DD/MM')),
    'admin/leads.html?estado=nuevo',
    array['cobranza','coordinador','admin','superadmin']);
  return v_n;
end $$;
revoke all on function public.cem_leads_recordar() from public, anon, authenticated;

-- El aviso de «sin atender» cae en «pendientes», con el de contacto nuevo.
create or replace function public.cem_notificacion_categoria(p_tipo text)
returns text
language sql immutable set search_path = public, pg_temp as $$
  select case p_tipo
    when 'cuota_vencida'        then 'dinero'
    when 'cuota_por_vencer'     then 'dinero'
    when 'recordatorio_cuota'   then 'dinero'
    when 'pago_aprobado'        then 'dinero'
    when 'pago_rechazado'       then 'dinero'
    when 'pago_anulado'         then 'dinero'

    when 'clase_en_vivo'          then 'aula'
    when 'recordatorio_entrega'   then 'aula'
    when 'entrega_reabierta'      then 'aula'
    when 'evaluacion_creada'      then 'aula'
    when 'evaluacion_actualizada' then 'aula'
    when 'evaluacion_estado'      then 'aula'
    when 'duda_respondida'        then 'aula'
    when 'mensaje_docente'        then 'aula'
    when 'insignia'               then 'aula'
    when 'certificado_emitido'    then 'aula'
    when 'apelacion_resuelta'     then 'aula'

    when 'solicitud_inscripcion' then 'pendientes'
    when 'solicitud_perfil'      then 'pendientes'
    when 'apelacion_nueva'       then 'pendientes'
    when 'duda_nueva'            then 'pendientes'
    when 'ticket_respuesta'      then 'pendientes'
    when 'cuenta_nueva'          then 'pendientes'
    when 'bot_escalado'          then 'pendientes'
    when 'lead_nuevo'            then 'pendientes'
    when 'lead_sin_atender'      then 'pendientes'

    when 'alerta_gobierno'  then 'sistema'
    when 'puente_whatsapp'  then 'sistema'
    when 'informe_mensual'  then 'sistema'
    when 'resumen_semanal'  then 'sistema'

    /* Un tipo que todavía no está en esta lista NO desaparece: cae aquí. Es a
       propósito. Una categoría que se traga en silencio los avisos que no
       reconoce es peor que no tener categorías, porque el día que alguien
       añada un tipo nuevo nadie se entera de que dejó de verlo. */
    else 'otros'
  end;
$$;

-- A las 13:00 UTC (9:00 en Caracas), después de que el equipo haya abierto el
-- día: el aviso llega cuando hay alguien para leerlo.
select cron.unschedule(jobid) from cron.job where jobname = 'cem-leads-recordar';
select cron.schedule('cem-leads-recordar', '0 13 * * *', 'select public.cem_leads_recordar()');

-- Dos plantillas más para el flujo de contacto (docs/auditoria-2026-09-12.md,
-- «¿Alguien nos escribe?»): la de abrir convocatoria y la de cerrar. El `tipo`
-- tiene una lista cerrada (primer-contacto, promocion, seguimiento,
-- recuperacion, otro): estas dos van como «otro», que es lo que son.
insert into public.cem_mensajes_plantilla (clave, nombre, tipo, asunto, cuerpo, activa, orden)
select 'convocatoria', 'Abrimos convocatoria', 'otro',
       '{nombre}, abrimos convocatoria de {interes}',
       E'Hola {nombre}:\n\nHace un tiempo nos pediste información sobre {interes} y te dijimos que te avisaríamos. Ya está: abrimos convocatoria.\n\nPuedes ver fechas, precio y forma de pago aquí: https://escuelacem.com/programas/\n\nSi quieres una plaza, responde a este correo o inscríbete desde la página. Si tienes cualquier duda —horarios, pagos por cuotas, si te sirve para lo que buscas— pregúntanos sin compromiso.\n\nUn saludo,\nEquipo CEM International',
       true, 5
where not exists (select 1 from public.cem_mensajes_plantilla where clave = 'convocatoria');

insert into public.cem_mensajes_plantilla (clave, nombre, tipo, asunto, cuerpo, activa, orden)
select 'cierre', 'Último aviso antes de cerrar', 'otro',
       '{nombre}, ¿cerramos tu consulta?',
       E'Hola {nombre}:\n\nTe hemos escrito un par de veces sobre {interes} y no hemos tenido respuesta, así que damos por cerrada tu consulta para no molestarte más.\n\nSi en algún momento vuelves a interesarte, escríbenos y retomamos donde lo dejamos: tus datos siguen aquí.\n\nGracias por habernos considerado.\n\nEquipo CEM International',
       true, 6
where not exists (select 1 from public.cem_mensajes_plantilla where clave = 'cierre');
