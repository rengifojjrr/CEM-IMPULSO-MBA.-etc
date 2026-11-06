-- Comprar sin cuenta ya no cobra lo que pagar no abre.
--
-- EL AGUJERO
-- Desde 20261107000006 una inscripción congelada o suspendida no abre el aula,
-- y pagar no la reabre: la pausa la levanta la reactivación, y la suspensión,
-- el equipo. La compra sin cuenta no lo sabía. El camino es comprar.html →
-- cem-comprar → cem_compra_invitado_abrir → Stripe → el aviso de pago →
-- _shared/cerrar-compra.ts → cem_compra_invitado_cerrar, y cerrar reutiliza
-- cualquier inscripción de esa persona en ese programa que no esté cancelada
-- ni finalizada. Así que quien tenía la suya en pausa o suspendida y compraba
-- el mismo programa con su correo pagaba, el pago caía en esa inscripción y el
-- aula seguía cerrada. Y con dos inscripciones, el LIMIT 1 sin ORDER BY
-- elegía cualquiera: una congelada podía tapar a la activa.
--
-- EL ARREGLO (lo decidió el dueño: «negar la compra antes de cobrar»)
-- abrir mira, antes de apuntar la compra, en qué inscripción caería el pago,
-- con el mismo orden que cerrar. Si es una congelada o una suspendida, se
-- niega. El mensaje no dice qué hay: el error llega tal cual a quien compra
-- (cem-comprar lo devuelve y comprar.html lo enseña), y esa puerta es pública
-- y sin sesión, así que cualquiera puede escribir el correo de otro.
--
-- cerrar elige siempre la misma: la activa, después la pendiente (el pago la
-- abre) y, a igualdad, la más nueva. Lo que abrir no puede impedir —la sesión
-- de Stripe sigue abierta horas, y la inscripción pudo pararse entre medias—
-- lo apunta como siempre, avisa al equipo y devuelve el estado. Ahí no se
-- lanza: el dinero ya está cobrado, y un error haría a Stripe reintentar el
-- aviso durante días.
--
-- LO QUE NO CAMBIA
-- Lo demás de abrir, en el mismo orden: el nombre, el correo, el plan, el
-- tope de seis intentos por correo y hora, el programa y el precio. La
-- comprobación nueva va entre el tope y el programa. Con una inscripción
-- activa se sigue pudiendo comprar: el pago entra en ella como abono, que es
-- lo que cerrar ya hacía a propósito, y negarlo sería otra decisión. Con una
-- pendiente, también: es el caso de siempre, y el pago la abre. Con una
-- cancelada o una finalizada, cerrar crea una nueva, como antes. Ninguna
-- devuelve dinero ni toca la inscripción.
--
-- LO QUE QUEDA
-- Una negativa no se apunta, así que no cuenta para el tope: quien insista
-- puede saber si un correo tiene algo parado en un programa, aunque no qué.
-- Es el precio de negar antes de cobrar.
--
-- LOS PERMISOS
-- Los de antes, que create or replace conserva: las dos sólo para el
-- servidor (service_role). Ni PUBLIC, ni anon, ni authenticated. Se repiten
-- para que este archivo diga el estado final.
--
-- La prueba: pruebas/sql/compra-en-pausa.sql. Antes de esto daba 8 fallos de
-- 30; con estas sentencias ejecutadas delante, 30 de 30.

create or replace function public.cem_compra_invitado_abrir(p_course_id uuid, p_nombre text, p_email text, p_cuotas integer default 1, p_cohort_id uuid default null::uuid, p_ip text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_c public.cem_courses; v_id uuid;
  v_email text := lower(trim(coalesce(p_email,'')));
  v_nombre text := trim(coalesce(p_nombre,''));
  v_factor numeric; v_total numeric; v_primera numeric; v_recientes int;
  v_destino text;
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

  /* Pagar no abre una inscripción congelada ni una suspendida
     (20261107000006). Si el pago iba a caer en una, se niega aquí, antes de
     cobrar, y no después con el dinero ya dentro.

     Se mira la inscripción que usaría cem_compra_invitado_cerrar, con su
     mismo orden: si al lado hay una activa o una pendiente, el pago va a ésa
     y no hay nada que negar. Si se cambia el orden allí, se cambia aquí.

     El perfil se busca por el correo exacto, sin mayúsculas. Ojo: el aviso de
     pago (_shared/cerrar-compra.ts) lo busca con ilike, donde «_» y «%» hacen
     de comodín, así que en un caso raro puede dar con otro perfil. Para eso,
     y para la carrera, está el aviso al equipo que da cerrar.

     El mensaje no dice qué hay —ni si existe la cuenta, ni cómo está— porque
     llega tal cual a quien escribió el correo, que puede ser cualquiera. */
  select e.estado::text into v_destino
    from public.cem_profiles p
    join public.cem_enrollments e on e.profile_id = p.id
   where lower(p.email) = v_email and e.course_id = p_course_id
     and e.estado not in ('cancelada','finalizada')
   order by case e.estado when 'activa' then 0 when 'pendiente' then 1 else 2 end,
            e.created_at desc, e.id
   limit 1;
  if v_destino in ('congelada', 'suspendida') then
    raise exception 'No podemos abrir esta compra. Si ya tienes una cuenta en el CEM, entra con ella o escríbenos y lo resolvemos.';
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
end $function$;

comment on function public.cem_compra_invitado_abrir(uuid, text, text, integer, uuid, text) is
  'Abre una compra sin cuenta (nombre, correo, programa y plan) y pone el importe. Se niega, sin decir por qué, si el pago iba a caer en una inscripción congelada o suspendida de ese correo en ese programa, porque pagar no la abriría. Sólo el servidor (cem-comprar).';

revoke all on function public.cem_compra_invitado_abrir(uuid, text, text, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.cem_compra_invitado_abrir(uuid, text, text, integer, uuid, text) to service_role;

create or replace function public.cem_compra_invitado_cerrar(p_compra_id uuid, p_profile_id uuid, p_cuenta_nueva boolean default null::boolean)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_c record; v_ins public.cem_enrollments; v_cuota uuid; v_curso text; v_como text;
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
     misma persona y el mismo curso.

     Si tiene más de una, se elige siempre la misma: la activa, después la
     pendiente (el pago la abre) y, a igualdad, la más nueva. Antes era un
     LIMIT 1 sin orden, y una congelada podía tapar a la activa.
     cem_compra_invitado_abrir mira con este mismo orden: si se cambia aquí,
     se cambia allí. */
  select * into v_ins from public.cem_enrollments
   where profile_id = p_profile_id and course_id = v_c.course_id
     and estado not in ('cancelada','finalizada')
   order by case estado when 'activa' then 0 when 'pendiente' then 1 else 2 end,
            created_at desc, id
   limit 1;

  if v_ins.id is null then
    v_ins := public.cem_inscribir_a(p_profile_id, v_c.course_id, v_c.cohort_id, v_c.cuotas, null);
  end if;

  select id into v_cuota from public.cem_installments
   where enrollment_id = v_ins.id and estado <> 'pagada' order by numero limit 1;

  update public.cem_compras_invitado
     set estado = 'pagada', pagada_en = now(), profile_id = p_profile_id,
         enrollment_id = v_ins.id, cuenta_nueva = coalesce(p_cuenta_nueva, cuenta_nueva)
   where id = p_compra_id;

  /* Cayó en una congelada o en una suspendida. abrir lo niega antes de
     cobrar, pero no llega a todo: la sesión de Stripe sigue abierta horas y
     la inscripción pudo pararse entre medias, o el aviso de pago dio con el
     perfil por otro camino (cerrar-compra.ts lo busca con ilike).

     El dinero ya está cobrado, así que aquí NO se lanza: Stripe reintentaría
     el aviso durante días por algo que no se arregla solo. Se apunta como
     siempre, el estado va en la respuesta y se avisa al equipo, que es quien
     decide si reactiva o devuelve: pagar no reabre la inscripción. Un
     reintento del aviso sale por «repetido», arriba, y no avisa dos veces. */
  if v_ins.estado in ('congelada', 'suspendida') then
    v_como := case v_ins.estado when 'congelada' then 'en pausa' else 'suspendida' end;
    select nombre into v_curso from public.cem_courses where id = v_c.course_id;
    perform cem_avisar_equipo(
      'compra_en_pausa',
      'Pago sobre una inscripción ' || v_como || ': ' || v_c.nombre,
      v_c.nombre || ' (' || v_c.email || ') pagó ' || coalesce(v_curso, 'un programa')
        || ' sin entrar con su cuenta, y su inscripción en ese programa está ' || v_como
        || '. El pago se apunta en ella, pero pagar no la reabre: el aula sigue cerrada.'
        || ' Hay que decidir si se reactiva o se le devuelve el dinero.',
      '/plataforma/admin/inscripciones.html?compra=' || p_compra_id,
      array['admin','superadmin','cobranza','coordinador']);
  end if;

  return jsonb_build_object('enrollment_id', v_ins.id, 'installment_id', v_cuota,
                            'profile_id', p_profile_id, 'estado', v_ins.estado);
end $function$;

comment on function public.cem_compra_invitado_cerrar(uuid, uuid, boolean) is
  'Convierte una compra sin cuenta ya cobrada en inscripción: usa la que haya en ese programa (la activa, luego la pendiente, luego la más nueva) o crea una, y devuelve su estado. Si cae en una congelada o suspendida no lanza, porque el dinero ya entró: la apunta y avisa al equipo. Idempotente. Sólo el servidor (_shared/cerrar-compra.ts).';

revoke all on function public.cem_compra_invitado_cerrar(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.cem_compra_invitado_cerrar(uuid, uuid, boolean) to service_role;
