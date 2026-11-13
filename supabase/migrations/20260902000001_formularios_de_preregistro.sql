-- Las listas de pre-registro (2 de septiembre de 2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- RECUPERADO, NO ESCRITO. Se aplicó en producción con apply_migration después
-- del volcado del 29 de agosto (los archivos 20260101*) y no dejó archivo en
-- este repositorio. Por eso la reconstrucción desde cero no lo tenía, y por eso
-- 20260924000001_promocion_en_la_web.sql daba 12 errores: tocaba lo que aquí
-- se crea. Se descubrió el 13 de noviembre de 2026.
--
-- Cada bloque es la migración tal cual está en
-- supabase_migrations.schema_migrations de producción, copiada byte a byte
-- entre sus marcas (leída con un select, sin escribir nada allí). La marca de
-- inicio lleva el md5 que calcula producción sobre ese mismo texto, y
-- herramientas/revisar.mjs comprueba que sigue cuadrando. Para cotejarlo:
--
--   select version, md5(array_to_string(statements, E'\n'))
--     from supabase_migrations.schema_migrations where version = '…';
--
-- NO se edita a mano. Si algo de aquí tiene que cambiar, va en una migración
-- nueva, como todo. Los comentarios de dentro son de quien escribió cada
-- migración en septiembre, y hablan de aquel momento.
--
-- Lo que acompañó en el repositorio: el commit aa22f04 («Listas de
-- pre-registro: un formulario por convocatoria»), con admin/formularios.html y
-- formulario.html, que llaman a las funciones de aquí.

-- ┌── producción 20260902203524 · formularios_de_preregistro · md5 83de8fc174753d509c54189589c73ad1
/* Listas de pre-registro: un formulario propio por curso, con enlace para redes.
   ═══════════════════════════════════════════════════════════════════════════
   Lo que ya había: `cem_recursos` entrega un PDF a cambio de cuatro datos
   fijos —nombre, apellido, correo, teléfono— y no se pueden cambiar. Sirve para
   regalar un material, no para preguntar «¿qué horario te viene?» antes de
   abrir una convocatoria.

   Esto es lo otro: la escuela arma el formulario que quiera, elige qué datos
   pide, añade sus propias preguntas, y saca un enlace para pegar en Instagram.

   Las tres tablas van con RLS y CERO políticas a propósito. No es un descuido:
   es el mismo patrón que `cem_leads`. Nadie —ni anónimo ni con sesión— toca
   estas filas directamente; todo pasa por funciones SECURITY DEFINER que
   validan primero. Una política de escritura para anónimos sobre una tabla de
   respuestas es una invitación a que te la llenen de basura. */

create table if not exists public.cem_formularios (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,
  titulo        text not null,
  descripcion   text,
  /* A qué programa se refiere. Opcional: puede haber una lista de espera
     general —«avísame de lo próximo que abran»— sin curso concreto. */
  course_id     uuid references public.cem_courses(id) on delete set null,
  /* Los campos de siempre, encendidos o apagados uno a uno. Se guarda como
     jsonb y no como quince columnas booleanas porque la lista va a crecer, y
     añadir una columna a una tabla en producción por cada dato nuevo que se le
     ocurra a alguien es exactamente el trabajo que esto viene a evitar.
     Forma: {"nombre":{"activo":true,"obligatorio":true}, …} */
  campos        jsonb not null default '{}'::jsonb,
  /* Lo que se lee después de enviar. Es la única pantalla donde se puede
     decir «te escribimos por WhatsApp esta semana», así que se edita. */
  gracias       text,
  activo        boolean not null default true,
  /* Cierre opcional. Una convocatoria que ya pasó debe dejar de recoger
     gente sola, sin que nadie se acuerde de ir a apagarla. */
  cierra_en     timestamptz,
  creado_por    uuid references public.cem_profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint cem_formularios_codigo_limpio
    check (codigo ~ '^[a-z0-9][a-z0-9-]{1,60}$')
);

create table if not exists public.cem_formulario_preguntas (
  id            uuid primary key default gen_random_uuid(),
  formulario_id uuid not null references public.cem_formularios(id) on delete cascade,
  orden         integer not null default 0,
  etiqueta      text not null,
  ayuda         text,
  tipo          text not null default 'texto',
  /* Sólo para «opcion» y «varias». Lista de textos. */
  opciones      jsonb not null default '[]'::jsonb,
  obligatoria   boolean not null default false,
  activa        boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint cem_formulario_preguntas_tipo
    check (tipo in ('texto','parrafo','numero','opcion','varias','si_no','fecha'))
);

create table if not exists public.cem_formulario_respuestas (
  id            uuid primary key default gen_random_uuid(),
  formulario_id uuid not null references public.cem_formularios(id) on delete cascade,
  /* La persona, en la MISMA tabla de contactos que todo lo demás. Ésta es la
     decisión que hace que esto sirva de algo: si las respuestas vivieran en su
     propia isla, cobranza tendría que mirar en dos sitios y nadie sabría que
     quien pidió el PDF en agosto es quien se apuntó a la lista en septiembre. */
  lead_id       uuid references public.cem_leads(id) on delete set null,
  /* Copia de los datos tal y como los escribió, congelados. El lead se va
     actualizando con el tiempo; esto es lo que puso ese día. */
  datos         jsonb not null default '{}'::jsonb,
  respuestas    jsonb not null default '{}'::jsonb,
  origen        text,
  created_at    timestamptz not null default now()
);

/* Una persona, una respuesta por formulario. Si vuelve a enviarlo se
   actualiza la que ya tenía en vez de duplicarla: la gente reenvía por
   costumbre cuando no está segura de que llegó. */
create unique index if not exists cem_formulario_respuestas_unica
  on public.cem_formulario_respuestas (formulario_id, lead_id)
  where lead_id is not null;

create index if not exists cem_formulario_preguntas_del_formulario
  on public.cem_formulario_preguntas (formulario_id, orden);
create index if not exists cem_formulario_respuestas_del_formulario
  on public.cem_formulario_respuestas (formulario_id, created_at desc);

alter table public.cem_formularios            enable row level security;
alter table public.cem_formulario_preguntas   enable row level security;
alter table public.cem_formulario_respuestas  enable row level security;

/* Y sin políticas. Todo entra y sale por las funciones de abajo. */
revoke all on public.cem_formularios           from anon, authenticated;
revoke all on public.cem_formulario_preguntas  from anon, authenticated;
revoke all on public.cem_formulario_respuestas from anon, authenticated;
-- └── fin de 20260902203524

-- ┌── producción 20260902203621 · formularios_de_preregistro_publico · md5 bbc1865c9bd4884e36c91ca3d1b93af0
/* La ficha que ve quien abre el enlace. Anónima: no hay sesión que valga.
   ───────────────────────────────────────────────────────────────────────────
   Devuelve sólo lo que hace falta para dibujar el formulario. NO devuelve
   cuántas personas se han apuntado ni quiénes: eso es de la escuela, y esta
   función la puede llamar cualquiera que tenga el enlace. */
create or replace function public.cem_formulario_ficha(p_codigo text)
returns jsonb language sql stable security definer set search_path to 'public'
as $$
  select case when f.id is null then null else jsonb_build_object(
    'codigo', f.codigo,
    'titulo', f.titulo,
    'descripcion', f.descripcion,
    'campos', f.campos,
    'gracias', f.gracias,
    'curso', (select c.nombre from cem_courses c where c.id = f.course_id),
    /* Abierto o no, decidido AQUÍ y no en la pantalla: una fecha de cierre que
       sólo comprueba el navegador no cierra nada. */
    'abierto', (f.activo and (f.cierra_en is null or f.cierra_en > now())),
    'cerrado_porque', case
      when not f.activo then 'Esta lista ya no está recogiendo inscripciones.'
      when f.cierra_en is not null and f.cierra_en <= now()
        then 'El plazo para apuntarse a esta lista se cerró.'
      else null end,
    'preguntas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id, 'etiqueta', q.etiqueta, 'ayuda', q.ayuda,
               'tipo', q.tipo, 'opciones', q.opciones, 'obligatoria', q.obligatoria)
             order by q.orden, q.created_at)
      from cem_formulario_preguntas q
      where q.formulario_id = f.id and q.activa), '[]'::jsonb)
  ) end
  from cem_formularios f
  where f.codigo = lower(btrim(p_codigo));
$$;

/* Apuntarse. La única escritura que puede hacer un anónimo, y por eso valida
   todo aquí dentro: lo que compruebe el navegador es una cortesía, no una
   defensa —cualquiera puede llamar a esta función sin pasar por la pantalla. */
create or replace function public.cem_formulario_enviar(
  p_codigo text, p_datos jsonb, p_respuestas jsonb default '{}'::jsonb,
  p_origen text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  f        cem_formularios;
  v_campo  text;
  v_cfg    jsonb;
  v_valor  text;
  v_email  text;
  v_tel    text;
  v_nombre text;
  v_apell  text;
  v_lead   uuid;
  v_datos  jsonb := coalesce(p_datos, '{}'::jsonb);
  v_resp   jsonb := '{}'::jsonb;
  q        record;
  v_ya     boolean;
begin
  select * into f from cem_formularios where codigo = lower(btrim(p_codigo));
  if f.id is null then
    raise exception 'Ese enlace no corresponde a ninguna lista.' using errcode = '42704';
  end if;
  if not f.activo then
    raise exception 'Esta lista ya no está recogiendo inscripciones.' using errcode = '42704';
  end if;
  if f.cierra_en is not null and f.cierra_en <= now() then
    raise exception 'El plazo para apuntarse a esta lista se cerró.' using errcode = '42704';
  end if;

  /* Los campos de siempre: se recorre lo que el formulario declaró tener
     encendido, no lo que vino en la petición. Así, un campo apagado que
     alguien mande a mano se ignora en vez de guardarse. */
  for v_campo, v_cfg in select key, value from jsonb_each(f.campos) loop
    if coalesce((v_cfg->>'activo')::boolean, false) then
      v_valor := nullif(btrim(coalesce(v_datos->>v_campo, '')), '');
      if v_valor is null and coalesce((v_cfg->>'obligatorio')::boolean, false) then
        raise exception 'Falta un dato obligatorio: %.', v_campo;
      end if;
    end if;
  end loop;

  v_nombre := left(btrim(coalesce(v_datos->>'nombre', '')), 120);
  v_apell  := nullif(left(btrim(coalesce(v_datos->>'apellido', '')), 120), '');
  v_email  := nullif(lower(left(btrim(coalesce(v_datos->>'email', '')), 200)), '');
  v_tel    := nullif(left(btrim(coalesce(v_datos->>'telefono', '')), 40), '');

  if v_email is not null
     and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' then
    raise exception 'Ese correo no parece una dirección válida.';
  end if;
  if v_email is null and v_tel is null then
    raise exception 'Hace falta un correo o un teléfono: si no, no hay manera de avisarte.';
  end if;

  /* Las preguntas propias, también recorridas desde la base. Se guarda la
     etiqueta junto a la respuesta a propósito: si mañana cambian la pregunta,
     lo que ya se contestó tiene que seguir queriendo decir lo que quería. */
  for q in select * from cem_formulario_preguntas
            where formulario_id = f.id and activa order by orden, created_at loop
    v_valor := nullif(btrim(coalesce(p_respuestas->>(q.id::text), '')), '');
    if v_valor is null and q.obligatoria then
      raise exception 'Falta una respuesta obligatoria: %.', q.etiqueta;
    end if;
    if v_valor is not null then
      v_resp := v_resp || jsonb_build_object(q.id::text,
                  jsonb_build_object('etiqueta', q.etiqueta, 'valor', left(v_valor, 2000)));
    end if;
  end loop;

  /* La persona, en la tabla de contactos de siempre. Buscada por correo, y si
     no hay correo por teléfono: hay listas que sólo piden WhatsApp. */
  if v_email is not null then
    select id into v_lead from cem_leads where lower(btrim(email)) = v_email limit 1;
  else
    select id into v_lead from cem_leads
     where regexp_replace(coalesce(telefono,''), '[^0-9]', '', 'g')
         = regexp_replace(v_tel, '[^0-9]', '', 'g')
       and regexp_replace(v_tel, '[^0-9]', '', 'g') <> '' limit 1;
  end if;

  if v_lead is null then
    insert into cem_leads (nombre, apellido, email, telefono, interes, course_id,
                           origen, como_nos_conocio)
    values (coalesce(nullif(v_nombre, ''), 'Sin nombre'), v_apell, v_email, v_tel,
            f.titulo, f.course_id,
            coalesce(nullif(left(btrim(coalesce(p_origen, '')), 120), ''),
                     'lista:' || f.codigo),
            nullif(btrim(coalesce(v_datos->>'como_nos_conocio', '')), ''))
    returning id into v_lead;
  else
    /* Sólo se rellenan huecos, igual que en los recursos: lo que ya se sabía
       de esa persona vale más que lo que teclee deprisa en un móvil. */
    update cem_leads set
      apellido  = coalesce(apellido, v_apell),
      telefono  = coalesce(telefono, v_tel),
      email     = coalesce(email, v_email),
      course_id = coalesce(course_id, f.course_id),
      interes   = coalesce(interes, f.titulo),
      nombre    = case when coalesce(btrim(nombre), '') = '' then v_nombre else nombre end
     where id = v_lead;
  end if;

  select exists(select 1 from cem_formulario_respuestas
                 where formulario_id = f.id and lead_id = v_lead) into v_ya;

  insert into cem_formulario_respuestas (formulario_id, lead_id, datos, respuestas, origen)
  values (f.id, v_lead, v_datos, v_resp, p_origen)
  on conflict (formulario_id, lead_id) where lead_id is not null
  do update set datos = excluded.datos, respuestas = excluded.respuestas,
                created_at = now();

  return jsonb_build_object('ok', true, 'repetido', v_ya,
    'gracias', coalesce(nullif(btrim(coalesce(f.gracias, '')), ''),
      'Listo, quedaste apuntado. Te escribimos en cuanto abra la convocatoria.'),
    'titulo', f.titulo);
end $$;

revoke all on function public.cem_formulario_ficha(text) from public;
revoke all on function public.cem_formulario_enviar(text, jsonb, jsonb, text) from public;
grant execute on function public.cem_formulario_ficha(text) to anon, authenticated;
grant execute on function public.cem_formulario_enviar(text, jsonb, jsonb, text) to anon, authenticated;
-- └── fin de 20260902203621

-- ┌── producción 20260902203708 · formularios_de_preregistro_equipo · md5 b64a0757b9f686aacf0ee37880f88955
/* Las listas, con lo que de verdad se mira de un vistazo: cuánta gente hay y
   cuándo entró la última. Sin eso hay que abrir una por una para saber cuál
   está funcionando. */
create or replace function public.cem_formularios_listar()
returns jsonb language sql stable security definer set search_path to 'public'
as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', f.id, 'codigo', f.codigo, 'titulo', f.titulo,
      'descripcion', f.descripcion, 'campos', f.campos, 'gracias', f.gracias,
      'activo', f.activo, 'cierra_en', f.cierra_en, 'created_at', f.created_at,
      'course_id', f.course_id,
      'curso', (select c.nombre from cem_courses c where c.id = f.course_id),
      'preguntas', (select count(*) from cem_formulario_preguntas q
                     where q.formulario_id = f.id and q.activa),
      'personas', (select count(*) from cem_formulario_respuestas r
                    where r.formulario_id = f.id),
      'ultima', (select max(r.created_at) from cem_formulario_respuestas r
                  where r.formulario_id = f.id),
      /* Cuántos de los apuntados ya tienen cuenta en la plataforma: es la
         diferencia entre una lista de interesados y una de alumnos. */
      'con_cuenta', (
        select count(*) from cem_formulario_respuestas r
          join cem_leads l on l.id = r.lead_id
         where r.formulario_id = f.id
           and exists (select 1 from cem_profiles p
                        where lower(btrim(p.email)) = lower(btrim(l.email))))
    ) as x
    from cem_formularios f
    where cem_is_staff()
  ) t;
$$;

create or replace function public.cem_formulario_guardar(
  p_id uuid, p_codigo text, p_titulo text, p_descripcion text,
  p_campos jsonb, p_course_id uuid default null, p_gracias text default null,
  p_activo boolean default true, p_cierra_en timestamptz default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare v_id uuid; v_cod text := lower(btrim(coalesce(p_codigo, '')));
begin
  if not cem_is_staff() then
    raise exception 'Sólo el equipo puede crear listas de pre-registro.' using errcode = '42501';
  end if;
  if v_cod !~ '^[a-z0-9][a-z0-9-]{1,60}$' then
    raise exception 'El código del enlace sólo lleva minúsculas, números y guiones, y al menos 2 caracteres. Llegó «%».', p_codigo;
  end if;
  if exists (select 1 from cem_formularios where codigo = v_cod and id is distinct from p_id) then
    raise exception 'Ya hay una lista con el código «%». Los enlaces no se pueden repetir.', v_cod;
  end if;
  if coalesce(btrim(p_titulo), '') = '' then
    raise exception 'La lista necesita un título: es lo primero que lee quien abre el enlace.';
  end if;

  /* Sin correo ni teléfono no hay lista que valga: se recogerían nombres a los
     que nadie puede avisar cuando abra la convocatoria. Se comprueba aquí y no
     en la pantalla porque es una regla del negocio, no un detalle del formulario. */
  if not (coalesce((p_campos->'email'->>'activo')::boolean, false)
       or coalesce((p_campos->'telefono'->>'activo')::boolean, false)) then
    raise exception 'Enciende al menos el correo o el teléfono: si no, no hay forma de avisar a quien se apunte.';
  end if;

  if p_id is null then
    insert into cem_formularios (codigo, titulo, descripcion, campos, course_id,
                                 gracias, activo, cierra_en, creado_por)
    values (v_cod, btrim(p_titulo), nullif(btrim(coalesce(p_descripcion,'')),''),
            coalesce(p_campos, '{}'::jsonb), p_course_id,
            nullif(btrim(coalesce(p_gracias,'')),''), coalesce(p_activo, true),
            p_cierra_en, auth.uid())
    returning id into v_id;
  else
    update cem_formularios set
      codigo = v_cod, titulo = btrim(p_titulo),
      descripcion = nullif(btrim(coalesce(p_descripcion,'')),''),
      campos = coalesce(p_campos, campos), course_id = p_course_id,
      gracias = nullif(btrim(coalesce(p_gracias,'')),''),
      activo = coalesce(p_activo, true), cierra_en = p_cierra_en,
      actualizado_en = now()
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Esa lista ya no existe.'; end if;
  end if;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  select auth.uid(), (select email from cem_profiles where id = auth.uid()),
         case when p_id is null then 'formulario.creado' else 'formulario.editado' end,
         'cem_formularios', v_id, 'bajo',
         jsonb_build_object('codigo', v_cod, 'titulo', p_titulo);

  return jsonb_build_object('ok', true, 'id', v_id, 'codigo', v_cod);
end $$;

/* Las preguntas se guardan TODAS de una vez, no una a una.
   ───────────────────────────────────────────────────────────────────────────
   El editor deja reordenarlas, borrar la del medio y añadir dos al final antes
   de pulsar guardar. Mandar eso como altas y bajas sueltas es donde aparecen
   los huérfanos y los órdenes repetidos. Llega la lista entera y manda ella.

   Lo que NO se borra nunca es una pregunta que ya tenga respuestas: se marca
   inactiva. Borrarla dejaría las respuestas de la gente sin su enunciado, que
   es como tener las contestaciones de un examen sin el examen. */
create or replace function public.cem_formulario_preguntas_guardar(
  p_formulario_id uuid, p_preguntas jsonb)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_vivas uuid[] := '{}';
  q jsonb; v_id uuid; v_n int := 0;
begin
  if not cem_is_staff() then
    raise exception 'Sólo el equipo puede editar las preguntas.' using errcode = '42501';
  end if;
  if not exists (select 1 from cem_formularios where id = p_formulario_id) then
    raise exception 'Esa lista ya no existe.';
  end if;

  for q in select value from jsonb_array_elements(coalesce(p_preguntas, '[]'::jsonb)) loop
    if coalesce(btrim(q->>'etiqueta'), '') = '' then continue; end if;
    v_n := v_n + 1;
    v_id := nullif(q->>'id', '')::uuid;
    if v_id is null then
      insert into cem_formulario_preguntas
        (formulario_id, orden, etiqueta, ayuda, tipo, opciones, obligatoria, activa)
      values (p_formulario_id, v_n, btrim(q->>'etiqueta'),
              nullif(btrim(coalesce(q->>'ayuda','')),''),
              coalesce(nullif(q->>'tipo',''), 'texto'),
              coalesce(q->'opciones', '[]'::jsonb),
              coalesce((q->>'obligatoria')::boolean, false), true)
      returning id into v_id;
    else
      update cem_formulario_preguntas set
        orden = v_n, etiqueta = btrim(q->>'etiqueta'),
        ayuda = nullif(btrim(coalesce(q->>'ayuda','')),''),
        tipo = coalesce(nullif(q->>'tipo',''), 'texto'),
        opciones = coalesce(q->'opciones', '[]'::jsonb),
        obligatoria = coalesce((q->>'obligatoria')::boolean, false),
        activa = true
      where id = v_id and formulario_id = p_formulario_id;
    end if;
    v_vivas := v_vivas || v_id;
  end loop;

  -- Las que ya no vienen: fuera si nadie las contestó, dormidas si sí.
  delete from cem_formulario_preguntas q
   where q.formulario_id = p_formulario_id
     and not (q.id = any(v_vivas))
     and not exists (select 1 from cem_formulario_respuestas r
                      where r.formulario_id = p_formulario_id
                        and r.respuestas ? q.id::text);
  update cem_formulario_preguntas set activa = false
   where formulario_id = p_formulario_id and not (id = any(v_vivas));

  return jsonb_build_object('ok', true, 'preguntas', v_n);
end $$;

/* Las respuestas, ya cruzadas con el contacto. Una fila por persona, con lo
   que puso y con lo que la escuela ya sabía de ella. */
create or replace function public.cem_formulario_respuestas_listar(p_formulario_id uuid)
returns jsonb language sql stable security definer set search_path to 'public'
as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', r.id, 'created_at', r.created_at, 'origen', r.origen,
      'datos', r.datos, 'respuestas', r.respuestas,
      'lead_id', r.lead_id,
      'nombre', l.nombre, 'apellido', l.apellido,
      'email', l.email, 'telefono', l.telefono, 'estado', l.estado,
      'tiene_cuenta', exists (select 1 from cem_profiles p
                               where lower(btrim(p.email)) = lower(btrim(l.email)))
    ) as x
    from cem_formulario_respuestas r
    left join cem_leads l on l.id = r.lead_id
    where r.formulario_id = p_formulario_id and cem_is_staff()
  ) t;
$$;

create or replace function public.cem_formulario_borrar(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare v_personas int;
begin
  if not cem_is_staff() then
    raise exception 'Sólo el equipo puede borrar listas.' using errcode = '42501';
  end if;
  select count(*) into v_personas from cem_formulario_respuestas where formulario_id = p_id;
  /* Una lista con gente dentro no se borra: se apaga. Borrarla se llevaría por
     delante a quien se apuntó, y esa gente dio sus datos para que la avisaran. */
  if v_personas > 0 then
    update cem_formularios set activo = false, actualizado_en = now() where id = p_id;
    return jsonb_build_object('ok', true, 'apagada', true, 'personas', v_personas);
  end if;
  delete from cem_formularios where id = p_id;
  return jsonb_build_object('ok', true, 'apagada', false, 'personas', 0);
end $$;

revoke all on function public.cem_formularios_listar() from public;
revoke all on function public.cem_formulario_guardar(uuid, text, text, text, jsonb, uuid, text, boolean, timestamptz) from public;
revoke all on function public.cem_formulario_preguntas_guardar(uuid, jsonb) from public;
revoke all on function public.cem_formulario_respuestas_listar(uuid) from public;
revoke all on function public.cem_formulario_borrar(uuid) from public;
grant execute on function public.cem_formularios_listar() to authenticated;
grant execute on function public.cem_formulario_guardar(uuid, text, text, text, jsonb, uuid, text, boolean, timestamptz) to authenticated;
grant execute on function public.cem_formulario_preguntas_guardar(uuid, jsonb) to authenticated;
grant execute on function public.cem_formulario_respuestas_listar(uuid) to authenticated;
grant execute on function public.cem_formulario_borrar(uuid) to authenticated;
-- └── fin de 20260902203708

-- ┌── producción 20260902203834 · formularios_solo_campos_declarados · md5 22d8268a40a3a5f2b2065c1e7fb5bf24
/* Se guarda SÓLO lo que el formulario declaró pedir.
   ═══════════════════════════════════════════════════════════════════════════
   Antes esto guardaba `p_datos` entero, tal y como llegaba. La primera versión
   del comentario decía que un campo apagado «se ignora en vez de guardarse», y
   era mentira: se guardaba. Se vio al mirar la fila de la prueba, no al leer el
   código —de hecho la prueba casi lo tapa, porque el segundo envío machacaba
   el campo de más del primero.

   Importa porque `cem_formulario_enviar` la puede llamar cualquiera sin
   sesión. Con la versión vieja, un desconocido con el enlace podía meter en la
   base el JSON que le diera la gana —claves inventadas, textos larguísimos—
   simplemente añadiéndolos a la petición. Ahora se construye una fila nueva
   recorriendo los campos DECLARADOS, y lo que no esté en esa lista no entra. */
create or replace function public.cem_formulario_enviar(
  p_codigo text, p_datos jsonb, p_respuestas jsonb default '{}'::jsonb,
  p_origen text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  f        cem_formularios;
  v_campo  text;
  v_cfg    jsonb;
  v_valor  text;
  v_email  text;
  v_tel    text;
  v_nombre text;
  v_apell  text;
  v_lead   uuid;
  v_entra  jsonb := coalesce(p_datos, '{}'::jsonb);
  v_datos  jsonb := '{}'::jsonb;
  v_resp   jsonb := '{}'::jsonb;
  q        record;
  v_ya     boolean;
begin
  select * into f from cem_formularios where codigo = lower(btrim(p_codigo));
  if f.id is null then
    raise exception 'Ese enlace no corresponde a ninguna lista.' using errcode = '42704';
  end if;
  if not f.activo then
    raise exception 'Esta lista ya no está recogiendo inscripciones.' using errcode = '42704';
  end if;
  if f.cierra_en is not null and f.cierra_en <= now() then
    raise exception 'El plazo para apuntarse a esta lista se cerró.' using errcode = '42704';
  end if;

  /* Se recorre lo que el formulario declaró, no lo que vino en la petición.
     Ésa es toda la diferencia: la lista de campos la manda la base. */
  for v_campo, v_cfg in select key, value from jsonb_each(f.campos) loop
    if coalesce((v_cfg->>'activo')::boolean, false) then
      v_valor := nullif(btrim(coalesce(v_entra->>v_campo, '')), '');
      if v_valor is null and coalesce((v_cfg->>'obligatorio')::boolean, false) then
        raise exception 'Falta un dato obligatorio: %.', v_campo;
      end if;
      if v_valor is not null then
        v_datos := v_datos || jsonb_build_object(v_campo, left(v_valor, 500));
      end if;
    end if;
  end loop;

  v_nombre := left(btrim(coalesce(v_datos->>'nombre', '')), 120);
  v_apell  := nullif(left(btrim(coalesce(v_datos->>'apellido', '')), 120), '');
  v_email  := nullif(lower(left(btrim(coalesce(v_datos->>'email', '')), 200)), '');
  v_tel    := nullif(left(btrim(coalesce(v_datos->>'telefono', '')), 40), '');

  if v_email is not null
     and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' then
    raise exception 'Ese correo no parece una dirección válida.';
  end if;
  if v_email is null and v_tel is null then
    raise exception 'Hace falta un correo o un teléfono: si no, no hay manera de avisarte.';
  end if;

  /* Las preguntas propias, igual: se recorren las de la base. Una respuesta a
     una pregunta que no es de esta lista no tiene dónde entrar. */
  for q in select * from cem_formulario_preguntas
            where formulario_id = f.id and activa order by orden, created_at loop
    v_valor := nullif(btrim(coalesce(p_respuestas->>(q.id::text), '')), '');
    if v_valor is null and q.obligatoria then
      raise exception 'Falta una respuesta obligatoria: %.', q.etiqueta;
    end if;
    if v_valor is not null then
      v_resp := v_resp || jsonb_build_object(q.id::text,
                  jsonb_build_object('etiqueta', q.etiqueta, 'valor', left(v_valor, 2000)));
    end if;
  end loop;

  if v_email is not null then
    select id into v_lead from cem_leads where lower(btrim(email)) = v_email limit 1;
  else
    select id into v_lead from cem_leads
     where regexp_replace(coalesce(telefono,''), '[^0-9]', '', 'g')
         = regexp_replace(v_tel, '[^0-9]', '', 'g')
       and regexp_replace(v_tel, '[^0-9]', '', 'g') <> '' limit 1;
  end if;

  if v_lead is null then
    insert into cem_leads (nombre, apellido, email, telefono, interes, course_id,
                           origen, como_nos_conocio)
    values (coalesce(nullif(v_nombre, ''), 'Sin nombre'), v_apell, v_email, v_tel,
            f.titulo, f.course_id,
            coalesce(nullif(left(btrim(coalesce(p_origen, '')), 120), ''),
                     'lista:' || f.codigo),
            nullif(btrim(coalesce(v_datos->>'como_nos_conocio', '')), ''))
    returning id into v_lead;
  else
    update cem_leads set
      apellido  = coalesce(apellido, v_apell),
      telefono  = coalesce(telefono, v_tel),
      email     = coalesce(email, v_email),
      course_id = coalesce(course_id, f.course_id),
      interes   = coalesce(interes, f.titulo),
      nombre    = case when coalesce(btrim(nombre), '') = '' then v_nombre else nombre end
     where id = v_lead;
  end if;

  select exists(select 1 from cem_formulario_respuestas
                 where formulario_id = f.id and lead_id = v_lead) into v_ya;

  insert into cem_formulario_respuestas (formulario_id, lead_id, datos, respuestas, origen)
  values (f.id, v_lead, v_datos, v_resp, left(btrim(coalesce(p_origen,'')), 120))
  on conflict (formulario_id, lead_id) where lead_id is not null
  do update set datos = excluded.datos, respuestas = excluded.respuestas,
                created_at = now();

  return jsonb_build_object('ok', true, 'repetido', v_ya,
    'gracias', coalesce(nullif(btrim(coalesce(f.gracias, '')), ''),
      'Listo, quedaste apuntado. Te escribimos en cuanto abra la convocatoria.'),
    'titulo', f.titulo);
end $$;

revoke all on function public.cem_formulario_enviar(text, jsonb, jsonb, text) from public;
grant execute on function public.cem_formulario_enviar(text, jsonb, jsonb, text) to anon, authenticated;
-- └── fin de 20260902203834
