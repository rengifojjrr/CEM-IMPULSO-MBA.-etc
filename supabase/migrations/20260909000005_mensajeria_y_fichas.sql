-- Mensajería dentro de la plataforma, y una ficha que se pueda mirar.
-- ============================================================================
-- Hasta ahora, un estudiante con un problema tenía dos caminos: abrir un ticket
-- de soporte —que va a una cola por categoría, no a una persona— o salirse de la
-- aplicación y escribir por WhatsApp. Y si quería saber con quién estaba
-- hablando, no podía: el perfil de otra persona sólo se ve si ESA persona lo
-- publicó hacia fuera, y casi nadie lo publica.
--
-- Aquí van las dos piezas que faltaban:
--
--   1. `cem_ficha_de(id)` — la ficha de alguien, para mirarla dentro de la app.
--   2. Conversaciones y mensajes entre personas, con todo guardado.
--
-- Quién puede ver a quién, y por qué
-- ----------------------------------
-- El equipo (profesores, coordinación, cobranza, dirección y auditoría) es
-- VISIBLE PARA CUALQUIERA que haya entrado. Es lo que hace falta para lo que se
-- pidió: que un estudiante con un problema de dinero encuentre a quien cobra, le
-- vea la cara y le escriba.
--
-- Un estudiante, en cambio, sólo lo ven el equipo y quien abra su perfil público
-- si él lo publicó. No es una asimetría por capricho: quien trabaja aquí está
-- localizable porque ése es su trabajo; quien estudia aquí no dio su nombre para
-- que lo pueda buscar cualquiera. La lista de estudiantes no se sirve a nadie
-- que no sea del equipo.
--
-- La ficha NUNCA lleva cédula, teléfono, correo, fecha de nacimiento ni nada de
-- pagos — ni siquiera la del equipo. Para eso está la mensajería.
--
-- Quién puede escribirle a quién
-- ------------------------------
-- Cualquiera puede escribirle al equipo. El equipo puede escribirle a cualquiera.
-- Entre estudiantes NO, salvo que la dirección lo encienda en los ajustes: dos
-- estudiantes que se escriben sin que nadie modere es una función que hay que
-- decidir a propósito, no heredar por descuido. El interruptor está puesto y
-- apagado; encenderlo es una línea.
--
-- El registro
-- -----------
-- Nada se borra: no hay función de borrar un mensaje, ni la va a haber. La
-- dirección y la auditoría ven el REGISTRO —quién le escribió a quién, cuándo y
-- cuántas veces— sin leer lo que dice. Para leer el contenido hace falta
-- `cem_msg_leer_por_auditoria`, que exige rol de dirección o auditoría y deja
-- constancia en la auditoría de que alguien lo abrió. Un buzón que el jefe puede
-- leer sin que quede rastro no es un registro: es vigilancia.

-- ══════════════════════ 1. La ficha de una persona ══════════════════════

create or replace function public.cem_ficha_de(p_id uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare
  v_yo        uuid := auth.uid();
  v_soy_equipo boolean;
  v_f         cem_profiles;
  v_certs     integer;
  v_obras     integer;
begin
  if v_yo is null then raise exception 'Necesitas haber entrado.'; end if;

  select * into v_f from cem_profiles where id = p_id and activo;
  if v_f.id is null then return null; end if;

  v_soy_equipo := cem_can_read_all();

  -- Al equipo lo ve cualquiera. A un estudiante sólo el equipo, él mismo, o
  -- quien sea si publicó su perfil.
  if not (v_f.rol <> 'estudiante'
          or v_soy_equipo
          or v_f.id = v_yo
          or coalesce(v_f.perfil_publico, false)) then
    return null;
  end if;

  select count(*) into v_certs
    from cem_certificates where profile_id = p_id and anulado_en is null;
  select count(*) into v_obras from cem_portafolio where profile_id = p_id;

  return jsonb_build_object(
    'id', v_f.id,
    'nombre', v_f.nombre,
    'apellido', v_f.apellido,
    'rol', v_f.rol,
    'avatar_url', v_f.avatar_url,
    'portada_url', v_f.portada_url,
    'ocupacion', v_f.ocupacion,
    'bio', v_f.bio,
    'certificados', v_certs,
    'trabajos', v_obras,
    'perfil_slug', case when coalesce(v_f.perfil_publico, false)
                        then v_f.perfil_slug else null end,
    -- Si esta persona acepta mensajes de quien está mirando.
    'puedo_escribirle', public.cem_msg_puedo_escribir(p_id));
end $function$;

revoke all on function public.cem_ficha_de(uuid) from public, anon;
grant execute on function public.cem_ficha_de(uuid) to authenticated;


-- El directorio: a quién puedo escribirle. Para cualquiera es el equipo; para
-- el equipo es además la gente que le escribió o a quien le escribió.
create or replace function public.cem_directorio(p_buscar text default null)
returns table (
  id uuid, nombre text, apellido text, rol text,
  avatar_url text, ocupacion text
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select p.id, p.nombre, p.apellido, p.rol, p.avatar_url, p.ocupacion
    from cem_profiles p
   where p.activo
     and auth.uid() is not null
     and p.id <> auth.uid()
     -- El equipo siempre; el resto de la gente sólo si quien mira es del equipo.
     and (p.rol <> 'estudiante' or cem_can_read_all())
     and (p_buscar is null or p_buscar = ''
          or (coalesce(p.nombre,'') || ' ' || coalesce(p.apellido,'')) ilike '%' || p_buscar || '%')
   order by
     -- Primero quien resuelve problemas, que es a quien se viene a buscar.
     case p.rol when 'coordinador' then 1 when 'cobranza' then 2
                when 'admin' then 3 when 'superadmin' then 4
                when 'profesor' then 5 else 9 end,
     p.nombre, p.apellido
   limit 200;
$function$;

revoke all on function public.cem_directorio(text) from public, anon;
grant execute on function public.cem_directorio(text) to authenticated;


-- ══════════════════════ 2. Las conversaciones ══════════════════════

create table if not exists public.cem_conversaciones (
  id                uuid primary key default gen_random_uuid(),
  asunto            text not null,
  creada_por        uuid not null references public.cem_profiles(id) on delete restrict,
  created_at        timestamptz not null default now(),
  ultimo_mensaje_en timestamptz not null default now()
);

create table if not exists public.cem_conversacion_partes (
  conversacion_id uuid not null references public.cem_conversaciones(id) on delete cascade,
  profile_id      uuid not null references public.cem_profiles(id) on delete restrict,
  leido_hasta     timestamptz,
  primary key (conversacion_id, profile_id)
);

create table if not exists public.cem_mensajes (
  id              uuid primary key default gen_random_uuid(),
  conversacion_id uuid not null references public.cem_conversaciones(id) on delete cascade,
  autor_id        uuid not null references public.cem_profiles(id) on delete restrict,
  cuerpo          text not null,
  created_at      timestamptz not null default now()
);

-- Por dónde se pregunta de verdad: «mis conversaciones, la más reciente arriba»
-- y «los mensajes de esta conversación, en orden».
create index if not exists cem_partes_por_persona
  on public.cem_conversacion_partes (profile_id);
create index if not exists cem_mensajes_por_conversacion
  on public.cem_mensajes (conversacion_id, created_at);
create index if not exists cem_conversaciones_recientes
  on public.cem_conversaciones (ultimo_mensaje_en desc);

-- El patrón de la casa: reglas encendidas, cero políticas, y todo el acceso por
-- funciones que comprueban ellas mismas de quién es lo que devuelven.
alter table public.cem_conversaciones        enable row level security;
alter table public.cem_conversacion_partes   enable row level security;
alter table public.cem_mensajes              enable row level security;

revoke all on table public.cem_conversaciones      from public, anon, authenticated;
revoke all on table public.cem_conversacion_partes from public, anon, authenticated;
revoke all on table public.cem_mensajes            from public, anon, authenticated;


-- El interruptor de los mensajes entre estudiantes. Apagado.
insert into public.cem_settings (clave, valor, descripcion) values
  ('mensajeria_entre_estudiantes', 'false'::jsonb,
   'Si dos estudiantes pueden escribirse entre ellos. Apagado a propósito: escribirle al equipo no necesita moderación, y esto sí. Enciéndelo sólo cuando haya quien lea las denuncias.')
on conflict (clave) do nothing;


-- ¿Puedo escribirle a esta persona?
create or replace function public.cem_msg_puedo_escribir(p_para uuid)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_yo uuid := auth.uid(); v_mi_rol text; v_su_rol text; v_entre_alumnos boolean;
begin
  if v_yo is null or p_para is null or p_para = v_yo then return false; end if;

  select rol into v_mi_rol from cem_profiles where id = v_yo and activo;
  select rol into v_su_rol from cem_profiles where id = p_para and activo;
  if v_mi_rol is null or v_su_rol is null then return false; end if;

  -- El auditor lee y no escribe. Tampoco aquí: un buzón es una forma de
  -- escribir, y quien revisa no participa en lo que revisa.
  if v_mi_rol = 'auditor' then return false; end if;

  -- A cualquiera del equipo se le puede escribir, y el equipo escribe a todos.
  if v_su_rol <> 'estudiante' or v_mi_rol <> 'estudiante' then return true; end if;

  select coalesce((select (valor #>> '{}')::boolean from cem_settings
                    where clave = 'mensajeria_entre_estudiantes'), false)
    into v_entre_alumnos;
  return v_entre_alumnos;
end $function$;

revoke all on function public.cem_msg_puedo_escribir(uuid) from public, anon;
grant execute on function public.cem_msg_puedo_escribir(uuid) to authenticated;


-- Empezar una conversación. Si ya hay una con esa misma persona y ese mismo
-- asunto, se sigue esa en vez de abrir otra: si no, escribirle tres veces a
-- coordinación deja tres hilos y ninguno con la historia completa.
create or replace function public.cem_msg_nueva(p_para uuid, p_asunto text, p_cuerpo text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_yo uuid := auth.uid(); v_con uuid; v_asunto text; v_cuerpo text;
begin
  v_asunto := nullif(btrim(p_asunto), '');
  v_cuerpo := nullif(btrim(p_cuerpo), '');
  if v_yo is null then raise exception 'Necesitas haber entrado.'; end if;
  if v_asunto is null then raise exception 'Ponle un asunto al mensaje.'; end if;
  if v_cuerpo is null then raise exception 'El mensaje está vacío.'; end if;
  if not public.cem_msg_puedo_escribir(p_para) then
    raise exception 'No puedes escribirle a esa persona.';
  end if;

  select c.id into v_con
    from cem_conversaciones c
    join cem_conversacion_partes yo   on yo.conversacion_id = c.id and yo.profile_id = v_yo
    join cem_conversacion_partes otro on otro.conversacion_id = c.id and otro.profile_id = p_para
   where lower(c.asunto) = lower(v_asunto)
   order by c.ultimo_mensaje_en desc
   limit 1;

  if v_con is null then
    insert into cem_conversaciones (asunto, creada_por) values (v_asunto, v_yo)
      returning id into v_con;
    insert into cem_conversacion_partes (conversacion_id, profile_id)
      values (v_con, v_yo), (v_con, p_para);
  end if;

  insert into cem_mensajes (conversacion_id, autor_id, cuerpo)
    values (v_con, v_yo, v_cuerpo);
  update cem_conversaciones set ultimo_mensaje_en = now() where id = v_con;
  -- Quien escribe ya ha leído lo suyo.
  update cem_conversacion_partes set leido_hasta = now()
   where conversacion_id = v_con and profile_id = v_yo;

  return v_con;
end $function$;

revoke all on function public.cem_msg_nueva(uuid, text, text) from public, anon;
grant execute on function public.cem_msg_nueva(uuid, text, text) to authenticated;


-- Responder en una conversación que ya existe.
create or replace function public.cem_msg_escribir(p_con uuid, p_cuerpo text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_yo uuid := auth.uid(); v_id uuid; v_cuerpo text;
begin
  v_cuerpo := nullif(btrim(p_cuerpo), '');
  if v_yo is null then raise exception 'Necesitas haber entrado.'; end if;
  if v_cuerpo is null then raise exception 'El mensaje está vacío.'; end if;
  if not exists (select 1 from cem_conversacion_partes
                  where conversacion_id = p_con and profile_id = v_yo) then
    raise exception 'Esa conversación no es tuya.';
  end if;
  if exists (select 1 from cem_profiles where id = v_yo and rol = 'auditor') then
    raise exception 'Tu cuenta es de auditoría y no puede escribir.';
  end if;

  insert into cem_mensajes (conversacion_id, autor_id, cuerpo)
    values (p_con, v_yo, v_cuerpo) returning id into v_id;
  update cem_conversaciones set ultimo_mensaje_en = now() where id = p_con;
  update cem_conversacion_partes set leido_hasta = now()
   where conversacion_id = p_con and profile_id = v_yo;
  return v_id;
end $function$;

revoke all on function public.cem_msg_escribir(uuid, text) from public, anon;
grant execute on function public.cem_msg_escribir(uuid, text) to authenticated;


-- Mi bandeja: una fila por conversación, con la otra persona, lo último que se
-- dijo y cuántos me faltan por leer.
create or replace function public.cem_msg_bandeja()
returns table (
  id uuid, asunto text, ultimo_mensaje_en timestamptz,
  otro_id uuid, otro_nombre text, otro_rol text, otro_avatar text,
  ultimo text, sin_leer integer
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select c.id, c.asunto, c.ultimo_mensaje_en,
         o.id,
         btrim(coalesce(o.nombre,'') || ' ' || coalesce(o.apellido,'')),
         o.rol, o.avatar_url,
         (select m.cuerpo from cem_mensajes m
           where m.conversacion_id = c.id order by m.created_at desc limit 1),
         (select count(*)::integer from cem_mensajes m
           where m.conversacion_id = c.id
             and m.autor_id <> auth.uid()
             and (yo.leido_hasta is null or m.created_at > yo.leido_hasta))
    from cem_conversaciones c
    join cem_conversacion_partes yo on yo.conversacion_id = c.id
                                   and yo.profile_id = auth.uid()
    left join lateral (
      select p.* from cem_conversacion_partes cp
        join cem_profiles p on p.id = cp.profile_id
       where cp.conversacion_id = c.id and cp.profile_id <> auth.uid()
       limit 1) o on true
   where auth.uid() is not null
   order by c.ultimo_mensaje_en desc
   limit 200;
$function$;

revoke all on function public.cem_msg_bandeja() from public, anon;
grant execute on function public.cem_msg_bandeja() to authenticated;


-- Abrir una conversación. Devuelve los mensajes y marca lo leído.
create or replace function public.cem_msg_abrir(p_con uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_yo uuid := auth.uid(); v_c cem_conversaciones; v_msgs jsonb; v_otro jsonb;
begin
  if v_yo is null then raise exception 'Necesitas haber entrado.'; end if;
  if not exists (select 1 from cem_conversacion_partes
                  where conversacion_id = p_con and profile_id = v_yo) then
    raise exception 'Esa conversación no es tuya.';
  end if;

  select * into v_c from cem_conversaciones where id = p_con;

  select coalesce(jsonb_agg(x order by x->>'created_at'), '[]'::jsonb) into v_msgs
    from (select jsonb_build_object(
            'id', m.id, 'cuerpo', m.cuerpo, 'created_at', m.created_at,
            'mio', m.autor_id = v_yo,
            'autor', btrim(coalesce(p.nombre,'') || ' ' || coalesce(p.apellido,''))) as x
            from cem_mensajes m join cem_profiles p on p.id = m.autor_id
           where m.conversacion_id = p_con) t;

  select jsonb_build_object('id', p.id, 'rol', p.rol, 'avatar_url', p.avatar_url,
           'nombre', btrim(coalesce(p.nombre,'') || ' ' || coalesce(p.apellido,'')))
    into v_otro
    from cem_conversacion_partes cp join cem_profiles p on p.id = cp.profile_id
   where cp.conversacion_id = p_con and cp.profile_id <> v_yo
   limit 1;

  update cem_conversacion_partes set leido_hasta = now()
   where conversacion_id = p_con and profile_id = v_yo;

  return jsonb_build_object('id', v_c.id, 'asunto', v_c.asunto,
                            'otro', v_otro, 'mensajes', v_msgs);
end $function$;

revoke all on function public.cem_msg_abrir(uuid) from public, anon;
grant execute on function public.cem_msg_abrir(uuid) to authenticated;


-- Cuántos mensajes tengo sin leer, para el punto rojo de la campana.
create or replace function public.cem_msg_sin_leer()
returns integer
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(count(*), 0)::integer
    from cem_mensajes m
    join cem_conversacion_partes yo on yo.conversacion_id = m.conversacion_id
                                   and yo.profile_id = auth.uid()
   where auth.uid() is not null
     and m.autor_id <> auth.uid()
     and (yo.leido_hasta is null or m.created_at > yo.leido_hasta);
$function$;

revoke all on function public.cem_msg_sin_leer() from public, anon;
grant execute on function public.cem_msg_sin_leer() to authenticated;


-- ══════════════════════ 3. El registro ══════════════════════
-- Quién le escribió a quién y cuándo. Sin el contenido: para saber que el
-- sistema se está usando, o que alguien lo está usando mal, no hace falta leer
-- las conversaciones de nadie.
create or replace function public.cem_msg_registro(p_desde date default null)
returns table (
  conversacion_id uuid, asunto text, abierta_en timestamptz,
  ultimo_mensaje_en timestamptz, mensajes integer, quienes text
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select c.id, c.asunto, c.created_at, c.ultimo_mensaje_en,
         (select count(*)::integer from cem_mensajes m where m.conversacion_id = c.id),
         (select string_agg(btrim(coalesce(p.nombre,'') || ' ' || coalesce(p.apellido,''))
                            || ' (' || p.rol || ')', ' ↔ ' order by p.nombre)
            from cem_conversacion_partes cp join cem_profiles p on p.id = cp.profile_id
           where cp.conversacion_id = c.id)
    from cem_conversaciones c
   where (cem_is_staff() or cem_es_auditor())
     and (p_desde is null or c.ultimo_mensaje_en::date >= p_desde)
   order by c.ultimo_mensaje_en desc
   limit 500;
$function$;

revoke all on function public.cem_msg_registro(date) from public, anon;
grant execute on function public.cem_msg_registro(date) to authenticated;


-- Leer una conversación ajena. Sólo dirección o auditoría, y queda escrito en
-- la auditoría que se abrió: un buzón que el jefe puede leer sin dejar rastro
-- no es un registro, es vigilancia.
create or replace function public.cem_msg_leer_por_auditoria(p_con uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_yo uuid := auth.uid(); v_motivo text; v_msgs jsonb; v_asunto text;
begin
  v_motivo := nullif(btrim(p_motivo), '');
  if not (cem_is_staff() or cem_es_auditor()) then
    raise exception 'Esta conversación no es tuya.';
  end if;
  if v_motivo is null or length(v_motivo) < 10 then
    raise exception 'Escribe por qué necesitas abrir una conversación ajena.';
  end if;

  select asunto into v_asunto from cem_conversaciones where id = p_con;
  if v_asunto is null then raise exception 'Esa conversación no existe.'; end if;

  select coalesce(jsonb_agg(x order by x->>'created_at'), '[]'::jsonb) into v_msgs
    from (select jsonb_build_object(
            'cuerpo', m.cuerpo, 'created_at', m.created_at,
            'autor', btrim(coalesce(p.nombre,'') || ' ' || coalesce(p.apellido,''))) as x
            from cem_mensajes m join cem_profiles p on p.id = m.autor_id
           where m.conversacion_id = p_con) t;

  insert into cem_audit_events (actor_id, accion, entidad, entidad_id, riesgo, detalle)
  select v_yo, 'mensajes.leer_ajena', 'cem_conversaciones', p_con, 'alto',
         jsonb_build_object('motivo', v_motivo, 'asunto', v_asunto);

  return jsonb_build_object('asunto', v_asunto, 'mensajes', v_msgs);
end $function$;

revoke all on function public.cem_msg_leer_por_auditoria(uuid, text) from public, anon;
grant execute on function public.cem_msg_leer_por_auditoria(uuid, text) to authenticated;
