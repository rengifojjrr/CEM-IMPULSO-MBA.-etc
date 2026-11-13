-- Visitas, campañas, certificados del registro y cupones (3 de septiembre de 2026)
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
-- Va numerado 000000 a propósito: en producción todo esto se aplicó entre las
-- 01:05 y las 05:26 del 3 de septiembre, ANTES que el cierre de funciones de
-- las 07:31 (20260903000001_cerrar_internas.sql). Si fuera detrás, un grant de
-- aquí podría reabrir algo que ese cierre cerró.
--
-- Lo que acompañó en el repositorio: el motor de campañas (commit 71f650e,
-- admin/campanas.html), reclamar los certificados propios (7b85337) y Mis
-- cupones (f3f1ddf, estudiante/cupones.html).

-- ┌── producción 20260903010545 · contar_visitas_publicas · md5 ec2a7fd883b2f375b4ef7aac5d0fa2a2
/* Contar visitas: la tabla existía desde el principio y no la escribía nadie.
   ═══════════════════════════════════════════════════════════════════════════
   `cem_visitas` estaba construida —día, pantalla, curso, canal, campaña y un
   contador— y llevaba meses vacía porque ninguna pantalla la llamaba. Sin esto
   no se puede juzgar ninguna campaña: no habría forma de saber si el descuento
   de la portada trajo gente o no.

   Se cuenta AGREGADO y no una fila por visita, que es como estaba pensada:
   una fila por (día, pantalla, curso, canal, campaña) con un contador que sube.
   Cien mil visitas a la portada en un mes son treinta filas, no cien mil. Y de
   paso no se guarda nada de la persona —ni IP, ni identificador, ni sesión—,
   así que esto cuenta cuánta gente pasó sin saber quién.

   Hacía falta el índice único: sin él, `on conflict` no tiene a qué agarrarse.
   Va con `coalesce` porque en Postgres dos NULL no son iguales, y sin eso cada
   visita a una pantalla sin curso crearía una fila nueva. */
create unique index if not exists cem_visitas_una_por_dia
  on public.cem_visitas (dia, pantalla, coalesce(course_id, '00000000-0000-0000-0000-000000000000'::uuid),
                         canal, coalesce(campana, ''));

create or replace function public.cem_contar_visita(
  p_pantalla text, p_course_id uuid default null,
  p_canal text default null, p_campana text default null)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare
  v_pant text := left(btrim(coalesce(p_pantalla, '')), 120);
  v_canal text := lower(left(btrim(coalesce(p_canal, '')), 40));
  v_camp text := nullif(left(btrim(coalesce(p_campana, '')), 120), '');
begin
  if v_pant = '' then return; end if;
  /* El canal se limita a una lista corta a propósito. Es un campo que llega de
     la dirección del navegador —`?utm_source=`— o sea, de fuera: sin esto,
     cualquiera podría llenar la tabla de canales inventados y dejar el informe
     inservible. Lo que no se reconozca cae en «otro», que sigue siendo cierto. */
  if v_canal not in ('directo','instagram','facebook','tiktok','whatsapp','google',
                     'youtube','correo','x','linkedin','manychat','otro') then
    v_canal := case when v_canal = '' then 'directo' else 'otro' end;
  end if;

  insert into cem_visitas (dia, pantalla, course_id, canal, campana, cuantas)
  values (current_date, v_pant, p_course_id, v_canal, v_camp, 1)
  on conflict (dia, pantalla, coalesce(course_id, '00000000-0000-0000-0000-000000000000'::uuid),
               canal, coalesce(campana, ''))
  do update set cuantas = cem_visitas.cuantas + 1;
end $$;

/* Lo que ve la dirección: por dónde entra la gente y a qué. */
create or replace function public.cem_visitas_resumen(p_dias integer default 30)
returns jsonb language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object(
    'desde', current_date - greatest(coalesce(p_dias, 30), 1),
    'total', coalesce((select sum(cuantas) from cem_visitas
                        where dia > current_date - greatest(coalesce(p_dias,30),1)), 0),
    'por_canal', coalesce((select jsonb_agg(x order by (x->>'cuantas')::int desc) from (
        select jsonb_build_object('canal', canal, 'cuantas', sum(cuantas)) as x
        from cem_visitas where dia > current_date - greatest(coalesce(p_dias,30),1)
        group by canal) t), '[]'::jsonb),
    'por_pantalla', coalesce((select jsonb_agg(x order by (x->>'cuantas')::int desc) from (
        select jsonb_build_object('pantalla', pantalla, 'cuantas', sum(cuantas)) as x
        from cem_visitas where dia > current_date - greatest(coalesce(p_dias,30),1)
        group by pantalla limit 40) t), '[]'::jsonb),
    'por_dia', coalesce((select jsonb_agg(x order by x->>'dia') from (
        select jsonb_build_object('dia', dia, 'cuantas', sum(cuantas)) as x
        from cem_visitas where dia > current_date - greatest(coalesce(p_dias,30),1)
        group by dia) t), '[]'::jsonb)
  ) where cem_is_staff();
$$;

revoke all on function public.cem_contar_visita(text, uuid, text, text) from public;
revoke all on function public.cem_visitas_resumen(integer) from public;
grant execute on function public.cem_contar_visita(text, uuid, text, text) to anon, authenticated;
grant execute on function public.cem_visitas_resumen(integer) to authenticated;
-- └── fin de 20260903010545

-- ┌── producción 20260903010855 · quitar_duplicados_de_visitas · md5 38da89d1b9c09efb93788b7e2e60abdc
/* Fuera lo que dupliqué por no mirar antes.
   ═══════════════════════════════════════════════════════════════════════════
   Di por hecho que `cem_visitas` estaba vacía porque no existía quien la
   escribiera, y creé una función y un índice. Los dos ya existían:
   `cem_visita_anotar` con la misma firma y `cem_visitas_una_por_combinacion`
   con las mismas columnas —en otro orden, que a Postgres le da igual para
   resolver un `on conflict`—.

   La causa real era otra: las 24 páginas que genera el SEO, que son a las que
   manda Google, no cargan `app.js` y por tanto no llaman a nadie. Se arregla
   en el generador, no aquí.

   Dos índices únicos sobre las mismas columnas no es sólo desorden: cada
   inserción paga los dos. */
drop index if exists public.cem_visitas_una_por_dia;
drop function if exists public.cem_contar_visita(text, uuid, text, text);

/* El resumen sí se queda: no había ninguna forma de leer esta tabla desde
   ninguna pantalla, y una tabla que nadie puede mirar tampoco sirve de nada. */
comment on function public.cem_visitas_resumen(integer) is
  'Visitas por canal, pantalla y día, para la pantalla de dirección.';
-- └── fin de 20260903010855

-- ┌── producción 20260903011022 · quitar_resumen_duplicado_de_visitas · md5 4c77b40f1b4688e8149c3ebf6d69ab47
/* El tercer duplicado, y el que más claro deja la lección.
   ═══════════════════════════════════════════════════════════════════════════
   Escribí `cem_visitas_resumen` para que hubiera «alguna forma de leer esta
   tabla desde alguna pantalla». Ya la había: `cem_de_donde_vienen(p_dias)`,
   que la pantalla de Reportes llama desde hace tiempo y que además reparte por
   canal Y por programa, cosa que la mía no hacía. Y la tarjeta se esconde sola
   cuando no hay nada contado, con un comentario que explica por qué.

   Tres funciones y un índice creados de más, todos por dar por supuesto que
   «la tabla está vacía» quería decir «no hay quien la escriba». Quería decir
   que las páginas con visitas —las 24 que genera el SEO— no llamaban a nadie,
   porque no cargan app.js. Eso se arregló en el generador, en una línea. */
drop function if exists public.cem_visitas_resumen(integer);
-- └── fin de 20260903011022

-- ┌── producción 20260903011155 · motor_de_campanas · md5 fae3afef8ad2fee795e2aaede7e81bad
/* Campañas: la escuela arma la mecánica, el programa sólo la aplica.
   ═══════════════════════════════════════════════════════════════════════════
   Mismo reparto que en las insignias, que ya funcionaba así: el TIPO de
   mecánica vive en el código —porque cada uno se comporta distinto— y todo lo
   demás vive en la base. Cambiar «10 % por registrarte» por «15 %», o mover la
   fecha de cierre, o subir el cupo de 20 a 30, es una decisión de la escuela a
   las once de la noche, no una publicación de código.

   Seis tipos, y cada uno responde a una pregunta distinta:
     registro        · deja el correo y te llevas algo. El más simple.
     compartir       · comparte el enlace y se te abre algo concreto.
     referido        · trae a alguien; ganáis los dos.
     racha           · vuelve N días seguidos.
     reto            · haz X antes de una fecha.
     sorteo          · entra quien cumpla; se elige después.

   Lo que NO hay, a propósito: cuentas atrás que se reinician, ruletas que
   quedan cerca y cadenas de referidos sin final. Un certificado vale lo que la
   gente cree que vale, y esas tres cosas se notan. */

create table if not exists public.cem_campanas (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,
  nombre        text not null,
  tipo          text not null,
  /* Lo que se lee. Van en la base porque el texto de una promoción se reescribe
     diez veces y ninguna de esas veces debería tocar el programa. */
  titular       text,
  explicacion   text,
  boton         text,
  gracias       text,
  /* El premio, en dos campos y no en uno: «20» no dice nada sin saber si son
     por ciento o dólares. `premio_texto` es lo que se le enseña a la persona
     cuando no es un número —«una clase suelta», «el temario completo»—. */
  premio_tipo   text not null default 'descuento',
  premio_valor  numeric,
  premio_texto  text,
  /* El cupo. Si es cierto se enseña cuánto queda; si es nulo, no se enseña
     nada. Un contador de plazas que no se agota nunca es de las cosas que más
     rápido enseñan a no creerse lo que dice una web. */
  cupo          integer,
  /* Dónde sale. Vacío = en todas las públicas. */
  pantallas     text[] not null default '{}',
  course_id     uuid references public.cem_courses(id) on delete set null,
  empieza_en    timestamptz,
  termina_en    timestamptz,
  activa        boolean not null default false,
  creada_por    uuid references public.cem_profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  actualizada_en timestamptz not null default now(),
  constraint cem_campanas_codigo_limpio check (codigo ~ '^[a-z0-9][a-z0-9-]{1,60}$'),
  constraint cem_campanas_tipo check (tipo in ('registro','compartir','referido','racha','reto','sorteo')),
  constraint cem_campanas_premio check (premio_tipo in ('descuento','descuento_fijo','regalo','sorteo')),
  /* Un descuento sin número no es un descuento. */
  constraint cem_campanas_valor_si_toca
    check (premio_tipo not in ('descuento','descuento_fijo') or premio_valor is not null),
  /* Y un porcentaje por encima de 100 es un error de tecleo, no una oferta. */
  constraint cem_campanas_porcentaje_sensato
    check (premio_tipo <> 'descuento' or (premio_valor > 0 and premio_valor <= 100)),
  constraint cem_campanas_fechas check (termina_en is null or empieza_en is null or termina_en > empieza_en)
);

/* Un premio entregado a una persona. Es lo que se canjea, y por eso lleva
   código propio: el mismo patrón que un certificado —se comprueba, se usa una
   vez y queda registrado quién y cuándo—. */
create table if not exists public.cem_premios (
  id            uuid primary key default gen_random_uuid(),
  campana_id    uuid not null references public.cem_campanas(id) on delete cascade,
  codigo        text not null unique,
  lead_id       uuid references public.cem_leads(id) on delete set null,
  profile_id    uuid references public.cem_profiles(id) on delete set null,
  email         text,
  /* De quién vino, si vino de alguien. Es lo que hace que un referido pueda
     cobrar lo suyo cuando el referido de verdad compra. */
  referido_por  uuid references public.cem_premios(id) on delete set null,
  estado        text not null default 'vigente',
  canjeado_en   timestamptz,
  canjeado_por  uuid references public.cem_profiles(id) on delete set null,
  nota          text,
  caduca_en     timestamptz,
  created_at    timestamptz not null default now(),
  constraint cem_premios_estado check (estado in ('vigente','canjeado','caducado','anulado'))
);

create index if not exists cem_premios_de_campana on public.cem_premios (campana_id, created_at desc);
create index if not exists cem_premios_por_correo on public.cem_premios (lower(btrim(email)));
/* Un premio por persona y campaña: si no, basta con recargar para tener diez. */
create unique index if not exists cem_premios_uno_por_persona
  on public.cem_premios (campana_id, lower(btrim(email))) where email is not null;

alter table public.cem_campanas enable row level security;
alter table public.cem_premios  enable row level security;
revoke all on public.cem_campanas from anon, authenticated;
revoke all on public.cem_premios  from anon, authenticated;
-- └── fin de 20260903011155

-- ┌── producción 20260903011312 · motor_de_campanas_funciones · md5 5db48de157b98c4d7a6aa1595f92e997
create or replace function public.cem_campana_para(p_pantalla text default null)
returns jsonb language sql stable security definer set search_path to 'public'
as $$
  select case when c.id is null then null else jsonb_build_object(
    'codigo', c.codigo, 'tipo', c.tipo,
    'titular', c.titular, 'explicacion', c.explicacion,
    'boton', coalesce(nullif(btrim(c.boton), ''), 'Lo quiero'),
    'premio_tipo', c.premio_tipo, 'premio_valor', c.premio_valor,
    'premio_texto', c.premio_texto,
    'termina_en', c.termina_en,
    /* Plazas restantes, sólo si hay cupo. Nunca un número inventado. */
    'quedan', case when c.cupo is null then null
      else greatest(c.cupo - (select count(*) from cem_premios p
                               where p.campana_id = c.id and p.estado <> 'anulado'), 0) end
  ) end
  from cem_campanas c
  where c.activa
    and (c.empieza_en is null or c.empieza_en <= now())
    and (c.termina_en is null or c.termina_en > now())
    and (cardinality(c.pantallas) = 0
         or coalesce(btrim(p_pantalla), '') = any(c.pantallas))
    /* Con el cupo agotado deja de ofrecerse sola. Prometer una plaza que ya
       no existe es la manera más rápida de que no te crean la siguiente. */
    and (c.cupo is null
         or (select count(*) from cem_premios p
              where p.campana_id = c.id and p.estado <> 'anulado') < c.cupo)
  order by c.created_at desc
  limit 1;
$$;

/* Un código legible en voz alta: sin O ni 0, sin I ni 1 ni L. Son las que se
   confunden al dictarlo por teléfono, y este código se dicta por teléfono. */
create or replace function public.cem_codigo_legible(p_prefijo text, p_largo integer default 5)
returns text language sql volatile set search_path to 'public'
as $$
  select upper(btrim(coalesce(p_prefijo, 'CEM'))) || '-' || (
    select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789',
                             1 + floor(random() * 31)::int, 1), '')
    from generate_series(1, greatest(coalesce(p_largo, 5), 4)));
$$;

create or replace function public.cem_campana_pedir(
  p_codigo text, p_email text, p_nombre text default null,
  p_telefono text default null, p_referido text default null,
  p_origen text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  c        cem_campanas;
  v_email  text := nullif(lower(left(btrim(coalesce(p_email, '')), 200)), '');
  v_nombre text := nullif(left(btrim(coalesce(p_nombre, '')), 120), '');
  v_tel    text := nullif(left(btrim(coalesce(p_telefono, '')), 40), '');
  v_lead   uuid;
  v_dados  integer;
  v_ref    uuid;
  v_ya     cem_premios;
  v_cod    text;
begin
  select * into c from cem_campanas where codigo = lower(btrim(p_codigo));
  if c.id is null then
    raise exception 'Esa promoción no existe.' using errcode = '42704';
  end if;
  if not c.activa then
    raise exception 'Esta promoción ya no está activa.' using errcode = '42704';
  end if;
  if c.empieza_en is not null and c.empieza_en > now() then
    raise exception 'Esta promoción todavía no ha empezado.' using errcode = '42704';
  end if;
  if c.termina_en is not null and c.termina_en <= now() then
    raise exception 'Esta promoción ya terminó.' using errcode = '42704';
  end if;
  if v_email is null then raise exception 'Hace falta tu correo: es a donde te mandamos el código.'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' then
    raise exception 'Ese correo no parece una dirección válida.';
  end if;

  /* Si ya lo pidió, se le devuelve EL MISMO, no uno nuevo. Perder el correo y
     volver a pedirlo es normal; dar dos códigos por eso, no. */
  select * into v_ya from cem_premios
   where campana_id = c.id and lower(btrim(email)) = v_email;
  if v_ya.id is not null then
    return jsonb_build_object('ok', true, 'repetido', true, 'codigo', v_ya.codigo,
      'estado', v_ya.estado, 'caduca_en', v_ya.caduca_en,
      'premio_tipo', c.premio_tipo, 'premio_valor', c.premio_valor,
      'premio_texto', c.premio_texto, 'gracias', c.gracias);
  end if;

  if c.cupo is not null then
    select count(*) into v_dados from cem_premios
     where campana_id = c.id and estado <> 'anulado';
    if v_dados >= c.cupo then
      raise exception 'Se acabaron las plazas de esta promoción.' using errcode = '42704';
    end if;
  end if;

  /* Quien refirió, si lo hay. Un código que no existe no es un error: se
     entrega el premio igual y sin referidor. Castigar a quien tecleó mal el
     código de un amigo sería castigar a la persona equivocada. */
  if nullif(btrim(coalesce(p_referido, '')), '') is not null then
    select id into v_ref from cem_premios
     where codigo = upper(btrim(p_referido)) and estado <> 'anulado';
  end if;

  select id into v_lead from cem_leads where lower(btrim(email)) = v_email limit 1;
  if v_lead is null then
    insert into cem_leads (nombre, email, telefono, interes, course_id, origen)
    values (coalesce(v_nombre, 'Sin nombre'), v_email, v_tel, c.nombre, c.course_id,
            coalesce(nullif(left(btrim(coalesce(p_origen,'')), 120), ''), 'campana:' || c.codigo))
    returning id into v_lead;
  else
    update cem_leads set
      telefono = coalesce(telefono, v_tel),
      nombre = case when coalesce(btrim(nombre), '') = '' then coalesce(v_nombre, nombre) else nombre end
     where id = v_lead;
  end if;

  loop
    v_cod := cem_codigo_legible(c.codigo, 5);
    exit when not exists (select 1 from cem_premios where codigo = v_cod);
  end loop;

  insert into cem_premios (campana_id, codigo, lead_id, email, referido_por, caduca_en)
  values (c.id, v_cod, v_lead, v_email, v_ref, c.termina_en);

  return jsonb_build_object('ok', true, 'repetido', false, 'codigo', v_cod,
    'estado', 'vigente', 'caduca_en', c.termina_en,
    'premio_tipo', c.premio_tipo, 'premio_valor', c.premio_valor,
    'premio_texto', c.premio_texto,
    'gracias', coalesce(nullif(btrim(coalesce(c.gracias, '')), ''),
      'Guarda este código: es el tuyo y se usa una sola vez.'));
end $$;

/* Comprobar un código antes de aplicarlo. Anónima a propósito: la pantalla de
   pago necesita decir «vale, son 15 %» ANTES de que nadie tenga cuenta.
   No dice de quién es el código, sólo si sirve y para cuánto. */
create or replace function public.cem_premio_comprobar(p_codigo text)
returns jsonb language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object(
    'existe', p.id is not null,
    'sirve', p.id is not null and p.estado = 'vigente'
             and (p.caduca_en is null or p.caduca_en > now())
             and c.activa,
    'porque', case
      when p.id is null then 'Ese código no existe.'
      when p.estado = 'canjeado' then 'Ese código ya se usó.'
      when p.estado = 'anulado' then 'Ese código fue anulado.'
      when p.caduca_en is not null and p.caduca_en <= now() then 'Ese código ya caducó.'
      when not c.activa then 'Esa promoción ya no está activa.'
      else null end,
    'premio_tipo', c.premio_tipo, 'premio_valor', c.premio_valor,
    'premio_texto', c.premio_texto, 'campana', c.nombre)
  from cem_premios p join cem_campanas c on c.id = p.campana_id
  where p.codigo = upper(btrim(p_codigo));
$$;

revoke all on function public.cem_campana_para(text) from public;
revoke all on function public.cem_campana_pedir(text, text, text, text, text, text) from public;
revoke all on function public.cem_premio_comprobar(text) from public;
revoke all on function public.cem_codigo_legible(text, integer) from public;
grant execute on function public.cem_campana_para(text) to anon, authenticated;
grant execute on function public.cem_campana_pedir(text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.cem_premio_comprobar(text) to anon, authenticated;
-- └── fin de 20260903011312

-- ┌── producción 20260903011356 · motor_de_campanas_equipo · md5 75b7984cc48fb8e21f6e351ea3c23e6b
create or replace function public.cem_campanas_listar()
returns jsonb language sql stable security definer set search_path to 'public'
as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', c.id, 'codigo', c.codigo, 'nombre', c.nombre, 'tipo', c.tipo,
      'titular', c.titular, 'explicacion', c.explicacion, 'boton', c.boton,
      'gracias', c.gracias, 'premio_tipo', c.premio_tipo,
      'premio_valor', c.premio_valor, 'premio_texto', c.premio_texto,
      'cupo', c.cupo, 'pantallas', to_jsonb(c.pantallas),
      'course_id', c.course_id, 'empieza_en', c.empieza_en, 'termina_en', c.termina_en,
      'activa', c.activa, 'created_at', c.created_at,
      'curso', (select k.nombre from cem_courses k where k.id = c.course_id),
      /* Las tres cifras con las que se juzga una campaña, y en este orden:
         cuántos la pidieron, cuántos la usaron, y qué porcentaje es eso. Una
         campaña con mil códigos dados y dos canjeados no está funcionando por
         mucho que la primera cifra impresione. */
      'dados', (select count(*) from cem_premios p
                 where p.campana_id = c.id and p.estado <> 'anulado'),
      'canjeados', (select count(*) from cem_premios p
                     where p.campana_id = c.id and p.estado = 'canjeado'),
      'ultimo', (select max(p.created_at) from cem_premios p where p.campana_id = c.id)
    ) as x
    from cem_campanas c
    where cem_is_staff()
  ) t;
$$;

create or replace function public.cem_campana_guardar(
  p_id uuid, p_codigo text, p_nombre text, p_tipo text,
  p_premio_tipo text, p_premio_valor numeric, p_premio_texto text,
  p_titular text default null, p_explicacion text default null,
  p_boton text default null, p_gracias text default null,
  p_cupo integer default null, p_pantallas text[] default '{}',
  p_course_id uuid default null, p_empieza_en timestamptz default null,
  p_termina_en timestamptz default null, p_activa boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare v_id uuid; v_cod text := lower(btrim(coalesce(p_codigo, '')));
begin
  if not cem_is_staff() then
    raise exception 'Sólo el equipo puede crear campañas.' using errcode = '42501';
  end if;
  if v_cod !~ '^[a-z0-9][a-z0-9-]{1,60}$' then
    raise exception 'El código sólo lleva minúsculas, números y guiones. Llegó «%».', p_codigo;
  end if;
  if exists (select 1 from cem_campanas where codigo = v_cod and id is distinct from p_id) then
    raise exception 'Ya hay una campaña con el código «%».', v_cod;
  end if;
  /* El código va DENTRO del código del premio que se entrega, así que cambiarlo
     con premios ya dados dejaría códigos viejos con un prefijo que ya no existe.
     No rompe nada, pero confunde a quien los lea después. */
  if p_id is not null and exists (
       select 1 from cem_campanas c where c.id = p_id and c.codigo <> v_cod
         and exists (select 1 from cem_premios p where p.campana_id = p_id)) then
    raise exception 'Esta campaña ya entregó premios: su código no se puede cambiar, porque va dentro de cada premio entregado.';
  end if;

  if p_id is null then
    insert into cem_campanas (codigo, nombre, tipo, premio_tipo, premio_valor, premio_texto,
                              titular, explicacion, boton, gracias, cupo, pantallas,
                              course_id, empieza_en, termina_en, activa, creada_por)
    values (v_cod, btrim(p_nombre), p_tipo, p_premio_tipo, p_premio_valor,
            nullif(btrim(coalesce(p_premio_texto,'')),''),
            nullif(btrim(coalesce(p_titular,'')),''),
            nullif(btrim(coalesce(p_explicacion,'')),''),
            nullif(btrim(coalesce(p_boton,'')),''),
            nullif(btrim(coalesce(p_gracias,'')),''),
            p_cupo, coalesce(p_pantallas, '{}'), p_course_id,
            p_empieza_en, p_termina_en, coalesce(p_activa, false), auth.uid())
    returning id into v_id;
  else
    update cem_campanas set
      codigo = v_cod, nombre = btrim(p_nombre), tipo = p_tipo,
      premio_tipo = p_premio_tipo, premio_valor = p_premio_valor,
      premio_texto = nullif(btrim(coalesce(p_premio_texto,'')),''),
      titular = nullif(btrim(coalesce(p_titular,'')),''),
      explicacion = nullif(btrim(coalesce(p_explicacion,'')),''),
      boton = nullif(btrim(coalesce(p_boton,'')),''),
      gracias = nullif(btrim(coalesce(p_gracias,'')),''),
      cupo = p_cupo, pantallas = coalesce(p_pantallas, '{}'),
      course_id = p_course_id, empieza_en = p_empieza_en, termina_en = p_termina_en,
      activa = coalesce(p_activa, false), actualizada_en = now()
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Esa campaña ya no existe.'; end if;
  end if;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  select auth.uid(), (select email from cem_profiles where id = auth.uid()),
         case when p_id is null then 'campana.creada' else 'campana.editada' end,
         'cem_campanas', v_id, 'medio',
         jsonb_build_object('codigo', v_cod, 'tipo', p_tipo, 'activa', p_activa,
                            'premio', p_premio_tipo || ' ' || coalesce(p_premio_valor::text, ''));

  return jsonb_build_object('ok', true, 'id', v_id, 'codigo', v_cod);
end $$;

/* Canjear. Es lo único de aquí que cambia dinero, así que lo hace el equipo y
   queda en la auditoría con riesgo medio. */
create or replace function public.cem_premio_canjear(p_codigo text, p_nota text default null)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare p cem_premios; c cem_campanas;
begin
  if not cem_is_staff() then
    raise exception 'Sólo el equipo puede canjear un premio.' using errcode = '42501';
  end if;
  select * into p from cem_premios where codigo = upper(btrim(p_codigo));
  if p.id is null then raise exception 'Ese código no existe.'; end if;
  if p.estado = 'canjeado' then
    raise exception 'Ese código ya se canjeó el %.', to_char(p.canjeado_en, 'DD/MM/YYYY');
  end if;
  if p.estado = 'anulado' then raise exception 'Ese código fue anulado.'; end if;
  if p.caduca_en is not null and p.caduca_en <= now() then
    raise exception 'Ese código caducó el %.', to_char(p.caduca_en, 'DD/MM/YYYY');
  end if;
  select * into c from cem_campanas where id = p.campana_id;

  update cem_premios set estado = 'canjeado', canjeado_en = now(),
    canjeado_por = auth.uid(), nota = nullif(btrim(coalesce(p_nota,'')),'')
   where id = p.id;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  select auth.uid(), (select email from cem_profiles where id = auth.uid()),
         'premio.canjeado', 'cem_premios', p.id, 'medio',
         jsonb_build_object('codigo', p.codigo, 'campana', c.nombre,
                            'premio', c.premio_tipo || ' ' || coalesce(c.premio_valor::text, ''),
                            'email', p.email);

  return jsonb_build_object('ok', true, 'codigo', p.codigo, 'campana', c.nombre,
    'premio_tipo', c.premio_tipo, 'premio_valor', c.premio_valor,
    'premio_texto', c.premio_texto, 'email', p.email);
end $$;

/* Quién pidió qué, ya cruzado con el contacto y con quién lo trajo. */
create or replace function public.cem_premios_listar(p_campana_id uuid)
returns jsonb language sql stable security definer set search_path to 'public'
as $$
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', p.id, 'codigo', p.codigo, 'estado', p.estado,
      'created_at', p.created_at, 'canjeado_en', p.canjeado_en,
      'caduca_en', p.caduca_en, 'email', p.email, 'nota', p.nota,
      'nombre', l.nombre, 'telefono', l.telefono,
      'lo_trajo', (select r.codigo from cem_premios r where r.id = p.referido_por),
      'tiene_cuenta', exists (select 1 from cem_profiles f
                               where lower(btrim(f.email)) = lower(btrim(p.email)))
    ) as x
    from cem_premios p
    left join cem_leads l on l.id = p.lead_id
    where p.campana_id = p_campana_id and cem_is_staff()
  ) t;
$$;

create or replace function public.cem_campana_borrar(p_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare v_dados int;
begin
  if not cem_is_staff() then
    raise exception 'Sólo el equipo puede borrar campañas.' using errcode = '42501';
  end if;
  select count(*) into v_dados from cem_premios where campana_id = p_id;
  /* Con premios entregados no se borra: se apaga. Borrarla invalidaría códigos
     que hay gente guardando en el móvil esperando usarlos. */
  if v_dados > 0 then
    update cem_campanas set activa = false, actualizada_en = now() where id = p_id;
    return jsonb_build_object('ok', true, 'apagada', true, 'premios', v_dados);
  end if;
  delete from cem_campanas where id = p_id;
  return jsonb_build_object('ok', true, 'apagada', false, 'premios', 0);
end $$;

revoke all on function public.cem_campanas_listar() from public;
revoke all on function public.cem_campana_guardar(uuid, text, text, text, text, numeric, text, text, text, text, text, integer, text[], uuid, timestamptz, timestamptz, boolean) from public;
revoke all on function public.cem_premio_canjear(text, text) from public;
revoke all on function public.cem_premios_listar(uuid) from public;
revoke all on function public.cem_campana_borrar(uuid) from public;
grant execute on function public.cem_campanas_listar() to authenticated;
grant execute on function public.cem_campana_guardar(uuid, text, text, text, text, numeric, text, text, text, text, text, integer, text[], uuid, timestamptz, timestamptz, boolean) to authenticated;
grant execute on function public.cem_premio_canjear(text, text) to authenticated;
grant execute on function public.cem_premios_listar(uuid) to authenticated;
grant execute on function public.cem_campana_borrar(uuid) to authenticated;
-- └── fin de 20260903011356

-- ┌── producción 20260903011445 · comprobar_premio_siempre_responde · md5 cc9e91c57bc33bac5c65adccfcfebb6b
/* Un código que no existe tiene que dar una respuesta, no el vacío.
   ───────────────────────────────────────────────────────────────────────────
   La versión de antes era un `select … from cem_premios where codigo = …`: si
   no había fila, no había resultado, y la pantalla recibía `null`. Podía decir
   «no sirve», pero no POR QUÉ —y «ese código no existe» y «ese código ya se
   usó» mandan a la persona a hacer cosas distintas—.

   Se ve sólo probando con un código inventado, que es justo el caso que nadie
   prueba a mano. Ahora el objeto se arma siempre y la fila se busca dentro. */
create or replace function public.cem_premio_comprobar(p_codigo text)
returns jsonb language sql stable security definer set search_path to 'public'
as $$
  with buscado as (
    select p.estado, p.caduca_en, c.activa, c.nombre,
           c.premio_tipo, c.premio_valor, c.premio_texto
    from cem_premios p join cem_campanas c on c.id = p.campana_id
    where p.codigo = upper(btrim(coalesce(p_codigo, '')))
  )
  select jsonb_build_object(
    'existe', exists (select 1 from buscado),
    'sirve', exists (select 1 from buscado b
                      where b.estado = 'vigente' and b.activa
                        and (b.caduca_en is null or b.caduca_en > now())),
    'porque', (select case
        when b.estado = 'canjeado' then 'Ese código ya se usó.'
        when b.estado = 'anulado' then 'Ese código fue anulado.'
        when b.caduca_en is not null and b.caduca_en <= now() then 'Ese código ya caducó.'
        when not b.activa then 'Esa promoción ya no está activa.'
        else null end from buscado b),
    'premio_tipo', (select b.premio_tipo from buscado b),
    'premio_valor', (select b.premio_valor from buscado b),
    'premio_texto', (select b.premio_texto from buscado b),
    'campana', (select b.nombre from buscado b))
    || case when exists (select 1 from buscado) then '{}'::jsonb
            else jsonb_build_object('porque', 'Ese código no existe.') end;
$$;

revoke all on function public.cem_premio_comprobar(text) from public;
grant execute on function public.cem_premio_comprobar(text) to anon, authenticated;
-- └── fin de 20260903011445

-- ┌── producción 20260903012545 · puente_certificados_reales · md5 d677343ef6528f1d1fedb5c8aacb1138
/* El puente entre los certificados de verdad y las personas de la plataforma.
   ═══════════════════════════════════════════════════════════════════════════
   Hay DOS registros de certificados y no se conocían entre sí:

     · `cem_certificates` — el de la plataforma. Una fila.
     · `cert_certificates` — el del generador, el que de verdad se usa. 529
       vigentes, 35 personas distintas. No tiene `profile_id`: guarda el nombre
       y la cédula dentro de un jsonb, porque se carga desde una hoja de cálculo
       y la mayoría de esa gente nunca ha tenido cuenta.

   Por eso el motor de insignias no podía premiar a nadie aunque hubiera 529
   certificados: mira `cem_certificates`, y ahí hay uno. Yo mismo escribí en el
   informe que «primer certificado» se dispararía sobre cientos. No es verdad, y
   se ve leyendo la función, no suponiéndola.

   El único enlace posible entre los dos mundos es la cédula, y hay que
   normalizarla a los dos lados: en la plataforma se guarda como la teclee cada
   quien y en los certificados va con puntos —«24.530.066»—. Se comparan sólo
   los dígitos. */
create or replace function public.cem_certificados_del_registro(p_profile_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_perfil uuid := coalesce(p_profile_id, auth.uid());
  v_doc text;
begin
  if v_perfil is null then return '[]'::jsonb; end if;
  /* Los de otro sólo los ve el equipo. Los propios, cualquiera. */
  if v_perfil <> auth.uid() and not cem_is_staff() then
    raise exception 'Sólo el equipo puede ver los certificados de otra persona.'
      using errcode = '42501';
  end if;

  select regexp_replace(coalesce(documento, ''), '[^0-9]', '', 'g')
    into v_doc from cem_profiles where id = v_perfil;
  /* Sin cédula no hay forma de cruzarlos, y devolver «todos los que no tienen
     cédula» sería enseñarle a alguien los títulos de otro. */
  if coalesce(v_doc, '') = '' then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id,
             'titulo', c.plantilla_nombre,
             'nombre', c.datos->>'Nombre',
             'fecha', coalesce(c.datos->>'fecha', c.datos->>'Fecha'),
             'entidad', c.entidad_emisora,
             'emitido_en', c.created_at)
           order by c.created_at desc)
    from cert_certificates c
    where c.estado = 'vigente'
      and regexp_replace(coalesce(c.datos->>'cedula', ''), '[^0-9]', '', 'g') = v_doc
  ), '[]'::jsonb);
end $$;

/* Y una regla de insignia que sepa mirar ahí.
   ───────────────────────────────────────────────────────────────────────────
   Se añade en vez de cambiar `primer_certificado`, que sigue sirviendo para
   quien se certifique por la plataforma. Son dos caminos distintos a la misma
   cosa y conviene poder distinguirlos. */
create or replace function public.cem_evaluar_insignias(p_profile_id uuid default null)
returns integer language plpgsql security definer set search_path to 'public'
as $$
declare v_perfil uuid := coalesce(p_profile_id, auth.uid());
        v_otorgadas integer := 0; b record; v_cumple boolean; v_doc text;
begin
  if v_perfil is null then return 0; end if;
  if v_perfil <> auth.uid() and not cem_is_staff() then
    raise exception 'Sólo el personal autorizado puede revisar las insignias de otra persona.';
  end if;

  select regexp_replace(coalesce(documento, ''), '[^0-9]', '', 'g')
    into v_doc from cem_profiles where id = v_perfil;

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

      /* Nueva: el registro de verdad, cruzado por cédula. Es la única que hoy
         puede premiar a alguien, porque es la única que mira donde están los
         529 certificados. `regla_valor` es cuántos hacen falta —1 para «tu
         primer certificado», 8 para «completaste el diplomado»—. */
      when 'certificado_del_registro' then (
        coalesce(v_doc, '') <> '' and (
          select count(*) >= coalesce(b.regla_valor, 1)
            from cert_certificates c
           where c.estado = 'vigente'
             and regexp_replace(coalesce(c.datos->>'cedula', ''), '[^0-9]', '', 'g') = v_doc))

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

      /* Existía escrita en el criterio —«asistir a más del 90% de las
         sesiones»— pero no había regla que la mirara. Se pide un mínimo de
         cinco clases registradas: con dos asistencias de dos, un 100% no dice
         nada. */
      when 'asistencia_alta' then (
        select count(*) >= 5
               and 100.0 * count(*) filter (where a.presente) / greatest(count(*), 1)
                   >= coalesce(b.regla_valor, 90)
          from cem_attendance a
          join cem_enrollments e on e.id = a.enrollment_id
         where e.profile_id = v_perfil
           and (b.regla_curso is null or e.course_id = b.regla_curso))

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
end $$;

/* Y que el alcance sepa contarla, para que la pantalla diga «esto premiaría a
   N personas» antes de encenderla. La de antes sólo miraba matriculados; ésta
   mira a todo el que tenga cédula, que es donde está la gente de verdad. */
create or replace function public.cem_insignia_alcance(
  p_regla text, p_valor numeric default null, p_curso uuid default null)
returns integer language sql stable security definer set search_path to 'public'
as $$
  select case when not (cem_is_staff() or cem_es_auditor()) then null
    when p_regla = 'certificado_del_registro' then (
      select count(*)::integer from cem_profiles p
       where regexp_replace(coalesce(p.documento, ''), '[^0-9]', '', 'g') <> ''
         and (select count(*) from cert_certificates c
               where c.estado = 'vigente'
                 and regexp_replace(coalesce(c.datos->>'cedula',''), '[^0-9]', '', 'g')
                   = regexp_replace(coalesce(p.documento,''), '[^0-9]', '', 'g'))
             >= coalesce(p_valor, 1))
    else (
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
      ) q)
  end;
$$;

revoke all on function public.cem_certificados_del_registro(uuid) from public;
grant execute on function public.cem_certificados_del_registro(uuid) to authenticated;
-- └── fin de 20260903012545

-- ┌── producción 20260903014123 · reclamar_certificados_del_registro · md5 821d8ebcfff51e2e92d7e7d09ab2d2d2
/* Reclamar los certificados propios: con el código en la mano, no sólo la cédula.
   ═══════════════════════════════════════════════════════════════════════════
   El puente que crucé por cédula tenía un agujero que no vi al construirlo:
   `cem_profiles.documento` no tiene NINGUNA restricción —lo comprobé—, así que
   cualquiera puede registrarse con la cédula de otro.

   Ver la lista de certificados de alguien por su cédula no es información nueva:
   `verificar.html` ya lo hace a propósito, para que una empresa compruebe a un
   candidato. Eso no cambia.

   Lo que sí sería nuevo, y grave, es la INSIGNIA. Se enseña en el perfil
   público, que es una página de credenciales que leen empleadores. Alguien que
   se registre con la cédula de un graduado aparecería acreditado por el CEM sin
   haber estudiado nunca aquí — usando la plataforma de la escuela para
   respaldar la mentira. Eso hay que cerrarlo antes de invitar a nadie.

   Se piden DOS cosas y no una:
     · el código del certificado —el del QR—, que sólo tiene quien lo tiene;
     · que la cédula de ese certificado sea la que la persona declaró al
       registrarse.

   Ninguna de las dos basta sola. El código puede circular —el botón de
   compartir que se acaba de poner reparte precisamente ese enlace—, y la cédula
   está en el propio papel. Juntas exigen que alguien decida deliberadamente
   hacerse pasar por otro, y entonces queda su nombre y la hora en la auditoría. */

alter table public.cem_profiles
  add column if not exists documento_verificado_en timestamptz;

comment on column public.cem_profiles.documento_verificado_en is
  'Cuándo demostró esta persona que la cédula es suya, presentando el código de uno de sus certificados. Nulo = sin comprobar.';

create or replace function public.cem_reclamar_certificados(p_codigo text)
returns jsonb language plpgsql security definer set search_path to 'public'
as $$
declare
  v_perfil uuid := auth.uid();
  v_id     uuid;
  c        cert_certificates;
  v_ced    text;
  v_doc    text;
  v_cuantos integer;
  v_insignias integer;
begin
  if v_perfil is null then
    raise exception 'Entra a tu cuenta para reclamar tus certificados.' using errcode = '42501';
  end if;

  /* El código del QR es un identificador; si lo pegan entero como enlace, se
     saca de ahí. La gente copia el enlace más veces que el código. */
  v_id := nullif(substring(coalesce(p_codigo, '') from
            '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'), '')::uuid;
  if v_id is null then
    raise exception 'Ese no parece el código de un certificado. Está debajo del QR, y también en el enlace que abre al escanearlo.';
  end if;

  select * into c from cert_certificates where id = v_id;
  if c.id is null then
    raise exception 'No encontramos ningún certificado con ese código.' using errcode = '42704';
  end if;
  if c.estado <> 'vigente' then
    raise exception 'Ese certificado no está vigente, así que no sirve para comprobar tu identidad. Escríbenos y lo revisamos.';
  end if;

  v_ced := regexp_replace(coalesce(c.datos->>'cedula', ''), '[^0-9]', '', 'g');
  if v_ced = '' then
    raise exception 'Ese certificado no tiene cédula registrada, así que no podemos comprobar que sea tuyo. Escríbenos y lo resolvemos a mano.';
  end if;

  select regexp_replace(coalesce(documento, ''), '[^0-9]', '', 'g')
    into v_doc from cem_profiles where id = v_perfil;

  /* Las dos cosas tienen que coincidir. Si la cédula del perfil está vacía se
     rellena con la del certificado —quien no la puso al registrarse no tiene
     por qué teclearla ahora—, pero si está puesta y NO coincide, se para. */
  if v_doc <> '' and v_doc <> v_ced then
    insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
    select v_perfil, (select email from cem_profiles where id = v_perfil),
           'certificado.reclamo_rechazado', 'cert_certificates', c.id, 'alto',
           jsonb_build_object('motivo', 'la cedula del perfil no coincide con la del certificado');
    raise exception 'Ese certificado está a nombre de otra cédula. Si es tuyo y la que pusiste al registrarte está mal, escríbenos.';
  end if;

  update cem_profiles
     set documento = coalesce(nullif(btrim(documento), ''), c.datos->>'cedula'),
         documento_tipo = coalesce(documento_tipo, 'cedula'),
         documento_verificado_en = now()
   where id = v_perfil;

  select count(*) into v_cuantos from cert_certificates x
   where x.estado = 'vigente'
     and regexp_replace(coalesce(x.datos->>'cedula', ''), '[^0-9]', '', 'g') = v_ced;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  select v_perfil, (select email from cem_profiles where id = v_perfil),
         'certificado.reclamado', 'cert_certificates', c.id, 'medio',
         jsonb_build_object('certificados', v_cuantos, 'nombre_en_certificado', c.datos->>'Nombre');

  /* Y se le da lo que le toque de una vez, sin esperar a la próxima pasada. */
  v_insignias := cem_evaluar_insignias(v_perfil);

  return jsonb_build_object('ok', true, 'certificados', v_cuantos,
    'nombre', c.datos->>'Nombre', 'insignias', v_insignias);
end $$;

/* Y que el puente y la insignia sólo cuenten lo COMPROBADO.
   ───────────────────────────────────────────────────────────────────────────
   Sin esto, la comprobación de arriba sería un adorno: bastaría con teclear la
   cédula de otro al registrarse y no reclamar nada. */
create or replace function public.cem_certificados_del_registro(p_profile_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_perfil uuid := coalesce(p_profile_id, auth.uid());
  v_doc text;
begin
  if v_perfil is null then return '[]'::jsonb; end if;
  if v_perfil <> auth.uid() and not cem_is_staff() then
    raise exception 'Sólo el equipo puede ver los certificados de otra persona.'
      using errcode = '42501';
  end if;

  select case when documento_verificado_en is null then ''
              else regexp_replace(coalesce(documento, ''), '[^0-9]', '', 'g') end
    into v_doc from cem_profiles where id = v_perfil;
  if coalesce(v_doc, '') = '' then return '[]'::jsonb; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', c.id,
             'titulo', c.plantilla_nombre,
             'nombre', c.datos->>'Nombre',
             'fecha', coalesce(c.datos->>'fecha', c.datos->>'Fecha'),
             'entidad', c.entidad_emisora,
             'emitido_en', c.created_at)
           order by c.created_at desc)
    from cert_certificates c
    where c.estado = 'vigente'
      and regexp_replace(coalesce(c.datos->>'cedula', ''), '[^0-9]', '', 'g') = v_doc
  ), '[]'::jsonb);
end $$;

revoke all on function public.cem_reclamar_certificados(text) from public;
grant execute on function public.cem_reclamar_certificados(text) to authenticated;
-- └── fin de 20260903014123

-- ┌── producción 20260903014235 · insignias_solo_con_cedula_comprobada · md5 281beee8fd4dde1b90bcd2493e2c4040
/* La insignia del registro sólo con la cédula COMPROBADA.
   ═══════════════════════════════════════════════════════════════════════════
   Sin esto, `cem_reclamar_certificados` sería un adorno: bastaría con teclear
   la cédula de un graduado al registrarse, sin reclamar nada, para llevarse la
   insignia. Y esa insignia se enseña en el perfil público, que es una página de
   credenciales que leen empleadores. */
create or replace function public.cem_evaluar_insignias(p_profile_id uuid default null)
returns integer language plpgsql security definer set search_path to 'public'
as $$
declare v_perfil uuid := coalesce(p_profile_id, auth.uid());
        v_otorgadas integer := 0; b record; v_cumple boolean; v_doc text;
begin
  if v_perfil is null then return 0; end if;
  if v_perfil <> auth.uid() and not cem_is_staff() then
    raise exception 'Sólo el personal autorizado puede revisar las insignias de otra persona.';
  end if;

  /* Vacío mientras no esté comprobada, y así ninguna regla que lo mire la da. */
  select case when documento_verificado_en is null then ''
              else regexp_replace(coalesce(documento, ''), '[^0-9]', '', 'g') end
    into v_doc from cem_profiles where id = v_perfil;

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

      when 'certificado_del_registro' then (
        coalesce(v_doc, '') <> '' and (
          select count(*) >= coalesce(b.regla_valor, 1)
            from cert_certificates c
           where c.estado = 'vigente'
             and regexp_replace(coalesce(c.datos->>'cedula', ''), '[^0-9]', '', 'g') = v_doc))

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

      when 'asistencia_alta' then (
        select count(*) >= 5
               and 100.0 * count(*) filter (where a.presente) / greatest(count(*), 1)
                   >= coalesce(b.regla_valor, 90)
          from cem_attendance a
          join cem_enrollments e on e.id = a.enrollment_id
         where e.profile_id = v_perfil
           and (b.regla_curso is null or e.course_id = b.regla_curso))

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
end $$;

/* Y el alcance, que es lo que la pantalla enseña antes de encender la insignia:
   «esto premiaría a N personas». Cuenta sólo las comprobadas, igual. */
create or replace function public.cem_insignia_alcance(
  p_regla text, p_valor numeric default null, p_curso uuid default null)
returns integer language sql stable security definer set search_path to 'public'
as $$
  select case when not (cem_is_staff() or cem_es_auditor()) then null
    when p_regla = 'certificado_del_registro' then (
      select count(*)::integer from cem_profiles p
       where p.documento_verificado_en is not null
         and regexp_replace(coalesce(p.documento, ''), '[^0-9]', '', 'g') <> ''
         and (select count(*) from cert_certificates c
               where c.estado = 'vigente'
                 and regexp_replace(coalesce(c.datos->>'cedula',''), '[^0-9]', '', 'g')
                   = regexp_replace(coalesce(p.documento,''), '[^0-9]', '', 'g'))
             >= coalesce(p_valor, 1))
    else (
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
      ) q)
  end;
$$;
-- └── fin de 20260903014235

-- ┌── producción 20260903021933 · cem_campana_encender · md5 dbbd0fc5165977f0856289e367bf432c
/* Encender o apagar una campaña desde la propia lista.
   ---------------------------------------------------------------------------
   Hasta ahora lo único que cambiaba `activa` era `cem_campana_guardar`, que
   pide los diecisiete campos. Para encender una campaña había que abrir el
   diálogo entero, bajar hasta la última casilla y volver a guardarlo todo — y
   guardar de nuevo diecisiete campos para tocar uno es también la manera de
   pisar sin querer algo que ya estaba bien.

   Se devuelve el estado que quedó, no un `ok` a secas: la pantalla lo pinta
   con eso en vez de suponer que pasó lo que pidió. */
create or replace function public.cem_campana_encender(p_id uuid, p_activa boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v jsonb;
begin
  if not cem_is_staff() then
    raise exception 'Sólo el equipo puede encender campañas.' using errcode = '42501';
  end if;

  update cem_campanas
     set activa = coalesce(p_activa, false), actualizada_en = now()
   where id = p_id
  returning jsonb_build_object('ok', true, 'id', id, 'activa', activa, 'nombre', nombre)
    into v;

  if v is null then
    raise exception 'Esa campaña ya no existe.' using errcode = 'P0002';
  end if;
  return v;
end $$;

revoke all on function public.cem_campana_encender(uuid, boolean) from public, anon;
grant execute on function public.cem_campana_encender(uuid, boolean) to authenticated;
-- └── fin de 20260903021933

-- ┌── producción 20260903052654 · cem_mis_cupones · md5 34876bd2cc8f59c61499095e7a5beee2
/* Los cupones de quien está mirando.
   ---------------------------------------------------------------------------
   Un cupón se pide ANTES de tener cuenta: lo único que lo identifica es el
   correo con el que se pidió. Cuando esa persona termina de registrarse con
   ese mismo correo, el cupón es suyo — pero nada los había unido todavía.

   Así que esta función hace dos cosas: enlaza (deja el `profile_id` puesto en
   los premios que llevan el correo de quien pregunta) y devuelve. Enlazar aquí
   y no en el registro es a propósito: el registro no puede saber si mañana
   habrá una campaña más, y esto se ejecuta cada vez que alguien abre su lista.

   Se busca por CORREO y no sólo por `profile_id` porque el correo es lo que
   había cuando se pidió. Un premio con `profile_id` de otra persona no se
   toca: eso sería robarle el cupón a alguien. */
create or replace function public.cem_mis_cupones()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_filas jsonb;
begin
  if v_uid is null then
    raise exception 'Hace falta iniciar sesión para ver tus cupones.' using errcode = '42501';
  end if;

  select lower(btrim(email)) into v_email from cem_profiles where id = v_uid;
  if v_email is null then return jsonb_build_array(); end if;

  /* Enlazar los que son suyos y todavía no lo saben. */
  update cem_premios p
     set profile_id = v_uid
   where p.profile_id is null
     and lower(btrim(p.email)) = v_email;

  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into v_filas
  from (
    select jsonb_build_object(
      'codigo', p.codigo,
      'estado', case
        when p.estado = 'canjeado' then 'canjeado'
        when p.estado = 'anulado'  then 'anulado'
        when p.caduca_en is not null and p.caduca_en <= now() then 'caducado'
        else 'vigente' end,
      'canjeado_en', p.canjeado_en,
      'caduca_en', p.caduca_en,
      'created_at', p.created_at,
      'campana', c.nombre,
      'titular', c.titular,
      'premio_tipo', c.premio_tipo,
      'premio_valor', c.premio_valor,
      'premio_texto', c.premio_texto,
      'curso', k.nombre
    ) as x
    from cem_premios p
    join cem_campanas c on c.id = p.campana_id
    left join cem_courses k on k.id = c.course_id
    where p.profile_id = v_uid
       or lower(btrim(p.email)) = v_email
  ) t;

  return v_filas;
end $$;

revoke all on function public.cem_mis_cupones() from public, anon;
grant execute on function public.cem_mis_cupones() to authenticated;
-- └── fin de 20260903052654
