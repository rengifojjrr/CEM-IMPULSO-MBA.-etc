-- Cobrar con tarjeta en la cuenta de Stripe de otra empresa, curso por curso.
--
-- Hasta hoy había una sola cuenta de Stripe: la fila `stripe` de
-- cem_integraciones, que leían las tres funciones de servidor y el reflejo de
-- productos. El dueño va a ofrecer programas cuyo beneficiario es otra empresa,
-- y esos programas tienen que cobrar en la cuenta de esa empresa, no en la del
-- CEM. El dinero va entero a ella (no hay comisión: son dos cuentas
-- independientes, no Stripe Connect), y sólo cambia la tarjeta: el pago móvil y
-- las transferencias siguen yendo a las cuentas del CEM.
--
-- La cuenta principal NO cambia de sitio: sigue siendo `stripe`, con sus mismas
-- funciones y su misma pantalla. Las demás son filas `stripe:<clave>`, y cada
-- programa dice en cuál cobra (cem_courses.stripe_cuenta; vacío = la del CEM).
--
-- Y lo cobrado en cada cuenta se apunta en su propia cartera, con su propio
-- método («Tarjeta de crédito/débito (Empresa)»): si no, el dinero de otra
-- empresa aparecería mezclado con el del CEM en la cartera `stripe`.

-- 1. DÓNDE COBRA CADA PROGRAMA, Y EN QUÉ CUENTA SE ABRIÓ CADA COBRO
alter table public.cem_courses add column if not exists stripe_cuenta text;
comment on column public.cem_courses.stripe_cuenta is
  'La cuenta de Stripe donde se cobra este programa con tarjeta: la clave de una fila stripe:<clave> de cem_integraciones. Vacío = la cuenta principal del CEM.';

alter table public.cem_stripe_sesiones add column if not exists cuenta text;
comment on column public.cem_stripe_sesiones.cuenta is
  'La cuenta de Stripe donde se abrió el cobro (vacío = la principal).';

-- 2. LA CLAVE SECRETA DE LA CUENTA DE UN PROGRAMA
--    Interna: sólo la usan otras funciones de la base. Ni el navegador ni un
--    usuario con sesión pueden llamarla.
create or replace function public.cem_stripe_secreto_de_curso(p_course_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  select i.datos->>'secret_key'
    from cem_courses c
    join cem_integraciones i
      on i.id = case when c.stripe_cuenta is null then 'stripe' else 'stripe:' || c.stripe_cuenta end
   where c.id = p_course_id;
$$;
revoke all on function public.cem_stripe_secreto_de_curso(uuid) from public, anon, authenticated;

-- 3. EL PRODUCTO DE STRIPE SE CREA EN LA CUENTA DEL PROGRAMA
--    La misma función de 20260101000003_funciones.sql; cambia de dónde sale la
--    clave y el mensaje cuando falta.
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
  v_secreto := cem_stripe_secreto_de_curso(p_course_id);
  if v_secreto is null then
    update cem_courses
       set stripe_sync_error = case when c.stripe_cuenta is null
             then 'Stripe no está configurado todavía.'
             else format('La cuenta de Stripe «%s» no está configurada.', c.stripe_cuenta) end
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
$function$;

-- 4. QUE UN PROGRAMA SÓLO PUEDA APUNTAR A UNA CUENTA QUE EXISTE
--    Y que, al cambiar de cuenta, su producto se cree de nuevo en la nueva: el
--    identificador de producto de una cuenta no existe en la otra.
create or replace function public.cem_tg_curso_cuenta_stripe()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.stripe_cuenta := nullif(lower(trim(coalesce(new.stripe_cuenta, ''))), '');
  if new.stripe_cuenta is not null and not exists (
       select 1 from cem_integraciones
        where id = 'stripe:' || new.stripe_cuenta
          and nullif(datos->>'secret_key', '') is not null
          and nullif(datos->>'publishable_key', '') is not null) then
    raise exception 'La cuenta de Stripe «%» no existe o le faltan las claves. Configúrala antes en Admin → Cobros con tarjeta → Otras empresas.',
      new.stripe_cuenta;
  end if;
  if tg_op = 'UPDATE' and new.stripe_cuenta is distinct from old.stripe_cuenta then
    new.stripe_product_id := null;
    new.stripe_sync_error := null;
    new.stripe_sync_peticion := null;
  end if;
  return new;
end $$;
revoke all on function public.cem_tg_curso_cuenta_stripe() from public, anon, authenticated;

drop trigger if exists cem_curso_cuenta_stripe on public.cem_courses;
create trigger cem_curso_cuenta_stripe
  before insert or update of stripe_cuenta on public.cem_courses
  for each row execute function public.cem_tg_curso_cuenta_stripe();

-- El reflejo, que ahora también salta cuando cambia la cuenta.
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
     or new.estado is distinct from old.estado
     or new.stripe_cuenta is distinct from old.stripe_cuenta then
    perform cem_stripe_producto_reflejar(new.id);
  end if;
  return new;
end
$function$;

-- 5. LA CUENTA PRINCIPAL CUENTA SÓLO SUS COBROS
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
    'cobrados', (select count(*) from cem_stripe_sesiones where estado = 'pagada' and cuenta is null),
    'abiertas', (select count(*) from cem_stripe_sesiones where estado = 'abierta' and cuenta is null));
end $function$;

-- 6. LAS OTRAS CUENTAS
--    La lista, para la pantalla. Las claves secretas no salen nunca: sólo sus
--    cuatro últimos caracteres, para saber cuál está puesta.
create or replace function public.cem_stripe_cuentas()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede ver las cuentas de Stripe.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'clave', substr(i.id, 8),
             'nombre', i.datos->>'nombre',
             'modo', coalesce(i.datos->>'modo', 'prueba'),
             'publishable_key', i.datos->>'publishable_key',
             'configurada', nullif(i.datos->>'secret_key', '') is not null
                            and nullif(i.datos->>'publishable_key', '') is not null,
             'secreto_pista', case when i.datos->>'secret_key' is null then null
                                   else '••••' || right(i.datos->>'secret_key', 4) end,
             'webhook_pista', case when i.datos->>'webhook_secret' is null then null
                                   else '••••' || right(i.datos->>'webhook_secret', 4) end,
             'metodo', i.datos->>'metodo',
             'cursos', (select count(*) from cem_courses c where c.stripe_cuenta = substr(i.id, 8)),
             'cobrados', (select count(*) from cem_stripe_sesiones s
                           where s.cuenta = substr(i.id, 8) and s.estado = 'pagada'))
           order by i.datos->>'nombre')
      from cem_integraciones i
     where i.id like 'stripe:%'), '[]'::jsonb);
end $$;
revoke all on function public.cem_stripe_cuentas() from public, anon;
grant execute on function public.cem_stripe_cuentas() to authenticated;

-- Sólo nombre y clave, para el desplegable de la ficha del programa: la ve
-- también coordinación, que no administra las claves.
create or replace function public.cem_stripe_cuentas_nombres()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'clave', substr(i.id, 8), 'nombre', i.datos->>'nombre',
           'modo', coalesce(i.datos->>'modo', 'prueba'))
         order by i.datos->>'nombre'), '[]'::jsonb)
    from cem_integraciones i
   where i.id like 'stripe:%' and cem_is_staff()
     and nullif(i.datos->>'secret_key', '') is not null
     and nullif(i.datos->>'publishable_key', '') is not null;
$$;
revoke all on function public.cem_stripe_cuentas_nombres() from public, anon;
grant execute on function public.cem_stripe_cuentas_nombres() to authenticated;

-- Guardar una cuenta: las mismas comprobaciones que cem_stripe_guardar, más el
-- nombre de la empresa. Crea su cartera y su método la primera vez.
create or replace function public.cem_stripe_cuenta_guardar(
  p_clave text, p_nombre text, p_publishable_key text, p_modo text default 'prueba',
  p_secret_key text default null, p_webhook_secret text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_clave  text := lower(trim(coalesce(p_clave, '')));
  v_nombre text := left(trim(coalesce(p_nombre, '')), 80);
  v_antes  jsonb;
  v_sec    text;
  v_hook   text;
  v_metodo text;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede configurar los cobros con tarjeta.' using errcode = '42501';
  end if;
  if v_clave !~ '^[a-z0-9][a-z0-9-]{1,29}$' then
    raise exception 'El identificador de la cuenta va en minúsculas, sin espacios ni tildes: letras, números y guiones (por ejemplo «empresa-b»).';
  end if;
  if length(v_nombre) < 2 then
    raise exception 'Falta el nombre de la empresa.';
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

  select coalesce(datos, '{}'::jsonb) into v_antes from cem_integraciones where id = 'stripe:' || v_clave;
  v_sec  := coalesce(nullif(trim(p_secret_key), ''), v_antes->>'secret_key');
  v_hook := coalesce(nullif(trim(p_webhook_secret), ''), v_antes->>'webhook_secret');
  if v_sec is null then
    raise exception 'Falta la clave secreta. Es la que Stripe enseña en Developers → API keys de la cuenta de esa empresa.';
  end if;
  -- La equivocación más fácil: pegar las claves del CEM en la cuenta de otra
  -- empresa. Cobraría, pero el dinero iría al CEM.
  if exists (select 1 from cem_integraciones
              where id <> 'stripe:' || v_clave and id like 'stripe%'
                and (datos->>'secret_key' = v_sec or datos->>'publishable_key' = trim(p_publishable_key))) then
    raise exception 'Esas claves ya son de otra cuenta configurada aquí. Cada empresa necesita las claves de SU cuenta de Stripe.';
  end if;

  -- El método se nombra una vez y no se cambia: los pagos ya registrados lo
  -- llevan escrito.
  v_metodo := coalesce(v_antes->>'metodo', 'Tarjeta de crédito/débito (' || v_nombre || ')');

  insert into cem_integraciones (id, datos, actualizado_en)
  values ('stripe:' || v_clave, jsonb_build_object(
    'nombre', v_nombre, 'publishable_key', trim(p_publishable_key), 'secret_key', v_sec,
    'webhook_secret', v_hook, 'modo', p_modo, 'metodo', v_metodo), now())
  on conflict (id) do update set datos = excluded.datos, actualizado_en = now();

  insert into cem_carteras (id, nombre, moneda, tipo, orden, activa, nota)
  values ('stripe-' || v_clave, 'Stripe · ' || v_nombre, 'EUR', 'pasarela', 1, true,
          'Los cobros con tarjeta de los programas de ' || v_nombre
          || ', en su propia cuenta de Stripe. Ese dinero es de esa empresa, no del CEM.')
  on conflict (id) do update set nombre = excluded.nombre, activa = true;

  insert into cem_metodos_pago (metodo, moneda, regla, activo, orden, cartera_id, instrucciones, nota)
  values (v_metodo, 'EUR', 'directo', true, 1, 'stripe-' || v_clave,
          'Se paga en el momento desde la plataforma. No hay que enviar comprobante: '
          || 'la confirmación llega sola y el curso se abre solo.',
          'La creó la cuenta de Stripe de ' || v_nombre || '. Si se desactiva, sus cobros '
          || 'dejan de poder asentarse aunque Stripe siga cobrando.')
  on conflict (metodo) do update
     set activo = true, cartera_id = excluded.cartera_id, regla = 'directo';

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, riesgo, detalle)
  select auth.uid(), (select email from cem_profiles where id = auth.uid()),
         'stripe.configurado', 'cem_integraciones', 'alto',
         jsonb_build_object('cuenta', v_clave, 'empresa', v_nombre, 'modo', p_modo,
           'clave_publica', trim(p_publishable_key),
           'secreto_cambiado', nullif(trim(p_secret_key), '') is not null);

  return cem_stripe_cuentas();
end $$;
revoke all on function public.cem_stripe_cuenta_guardar(text, text, text, text, text, text) from public, anon;
grant execute on function public.cem_stripe_cuenta_guardar(text, text, text, text, text, text) to authenticated;

-- Quitar una cuenta. No mientras algún programa cobre en ella: esos programas
-- se quedarían sin poder cobrar con tarjeta sin que nadie lo notara.
create or replace function public.cem_stripe_cuenta_quitar(p_clave text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_clave text := lower(trim(coalesce(p_clave, '')));
  v_datos jsonb;
  v_cursos int;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede quitar una cuenta de Stripe.' using errcode = '42501';
  end if;
  select datos into v_datos from cem_integraciones where id = 'stripe:' || v_clave;
  if v_datos is null then raise exception 'Esa cuenta no existe.'; end if;
  select count(*) into v_cursos from cem_courses where stripe_cuenta = v_clave;
  if v_cursos > 0 then
    raise exception 'La usan % programa(s). Cámbialos antes a otra cuenta en Cursos.', v_cursos;
  end if;

  delete from cem_integraciones where id = 'stripe:' || v_clave;
  -- El método se apaga, la cartera se queda: los cobros de antes siguen ahí.
  update cem_metodos_pago set activo = false where metodo = v_datos->>'metodo';

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, riesgo, detalle)
  select auth.uid(), (select email from cem_profiles where id = auth.uid()),
         'stripe.desconectado', 'cem_integraciones', 'alto',
         jsonb_build_object('cuenta', v_clave, 'empresa', v_datos->>'nombre');
  return cem_stripe_cuentas();
end $$;
revoke all on function public.cem_stripe_cuenta_quitar(text) from public, anon;
grant execute on function public.cem_stripe_cuenta_quitar(text) to authenticated;
