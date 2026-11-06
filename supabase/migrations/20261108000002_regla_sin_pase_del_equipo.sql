-- La regla de la inscripción, separada del pase del equipo.
--
-- EL FALLO
-- cem_acceso_abierto() dice «sí» a quien pregunta si es del equipo, además de
-- aplicar la regla de la inscripción. Para las puertas del aula está bien: el
-- equipo tiene que poder revisar el contenido. Pero dos informes sólo los usa
-- el equipo, y por eso recibían «sí» siempre:
--   · cem_embudo: «Se les abrió el curso» salía siempre igual a «Se
--     inscribieron», y lo mismo los escalones de debajo;
--   · cem_ver_como: «abierto» siempre verdadero y «porque» nunca calculado,
--     así que Admin → Estudiante decía «Lo ve abierto» a todo.
--
-- EL ARREGLO
-- cem_inscripcion_abierta(inscripción) es la regla sola, sin mirar quién
-- pregunta: activa o finalizada abren; pendiente si cuesta 0 o tiene un pago
-- confirmado; suspendida, congelada o cancelada nunca. cem_acceso_abierto pasa
-- a ser «equipo, o esa regla», sin cambiar lo que devuelve. Los dos informes
-- usan la regla sola, y «porque» explica primero el estado (cancelada, en
-- pausa, suspendida) y después el dinero.
--
-- LOS PERMISOS
-- cem_inscripcion_abierta es interna: sólo la llaman funciones security
-- definer (que corren como su dueño), así que nadie más la ejecuta. Dada a
-- authenticated, cualquiera podría preguntar por la inscripción de otro.
--
-- La prueba: pruebas/sql/acceso-abierto.sql (antes de esto, 8 fallos de 40).

create or replace function public.cem_inscripcion_abierta(p_enrollment_id uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select coalesce((
    select
      -- Está estudiando, o ya terminó y conserva lo suyo.
      e.estado in ('activa', 'finalizada')
      -- Pendiente: sólo si no hay nada que cobrar o ya hay un pago confirmado.
      or (e.estado = 'pendiente'
          and (coalesce(e.precio_final, 0) <= 0
               or exists (select 1 from cem_payments p
                           where p.enrollment_id = e.id and p.estado = 'confirmado')))
      -- Suspendida, congelada o cancelada no abren nunca, ni gratis ni pagadas.
    from cem_enrollments e where e.id = p_enrollment_id), false);
$$;

comment on function public.cem_inscripcion_abierta(uuid) is
  'La regla de la inscripción sola, sin mirar quién pregunta: activa o finalizada abren; pendiente si cuesta 0 o tiene un pago confirmado; suspendida, congelada o cancelada nunca. Interna: la usan cem_acceso_abierto y los informes del equipo.';

revoke all on function public.cem_inscripcion_abierta(uuid) from public, anon, authenticated, service_role;

create or replace function public.cem_acceso_abierto(p_enrollment_id uuid)
returns boolean
language sql
stable security definer
set search_path = public
as $$
  select coalesce((
    select
      -- El equipo entra siempre: tiene que poder revisar el contenido.
      cem_can_read_all() or cem_is_teacher()
      -- Los demás, según la inscripción.
      or cem_inscripcion_abierta(e.id)
    from cem_enrollments e where e.id = p_enrollment_id), false);
$$;

comment on function public.cem_acceso_abierto(uuid) is
  'La única definición de «esta persona puede entrar al programa»: el equipo siempre, y los demás según cem_inscripcion_abierta (activa o finalizada; pendiente si no cuesta nada o ya tiene un pago confirmado; suspendida, congelada o cancelada nunca). Si se cambia aquí, cambia en todas las puertas a la vez. Los informes del equipo usan cem_inscripcion_abierta, no ésta.';

revoke all on function public.cem_acceso_abierto(uuid) from public, anon;
grant execute on function public.cem_acceso_abierto(uuid) to authenticated, service_role;

create or replace function public.cem_embudo(p_dias integer default 90)
returns jsonb
language plpgsql
stable security definer
set search_path = public
as $$
declare
  v_desde timestamptz := now() - make_interval(days => greatest(p_dias, 1));
  v_contactos int; v_cuentas int; v_vieron int; v_empezaron_pago int;
  v_inscritos int; v_abiertos int; v_empezaron int; v_mitad int; v_terminaron int;
begin
  if not cem_is_staff() then return jsonb_build_object('pasos', '[]'::jsonb); end if;

  select coalesce(sum(cuantas), 0) into v_vieron from cem_visitas
   where dia >= v_desde::date and pantalla in ('curso', 'programa');

  select count(*) into v_empezaron_pago from cem_compras_invitado
   where creada_en >= v_desde;

  select count(*) into v_contactos from cem_leads where created_at >= v_desde;
  select count(*) into v_cuentas from cem_profiles
   where created_at >= v_desde and rol = 'estudiante';

  select count(*) into v_inscritos from cem_enrollments
   where fecha_inscripcion >= v_desde and estado <> 'cancelada';

  -- La regla de la inscripción, no cem_acceso_abierto: quien mira el embudo
  -- es del equipo, y para el equipo todo está abierto.
  select count(*) into v_abiertos from cem_enrollments e
   where e.fecha_inscripcion >= v_desde and e.estado <> 'cancelada'
     and cem_inscripcion_abierta(e.id);

  -- «Empezar» es haber completado al menos una lección. Abrir la pantalla no
  -- cuenta: quien entra, mira el título y se va no ha empezado nada.
  select count(*) into v_empezaron from cem_enrollments e
   where e.fecha_inscripcion >= v_desde and e.estado <> 'cancelada'
     and cem_inscripcion_abierta(e.id)
     and exists (select 1 from cem_lesson_progress lp
                  where lp.enrollment_id = e.id and lp.completado);

  select count(*) into v_mitad from cem_enrollments e
   where e.fecha_inscripcion >= v_desde and e.estado <> 'cancelada'
     and cem_inscripcion_abierta(e.id) and coalesce(e.progreso, 0) >= 50;

  select count(*) into v_terminaron from cem_enrollments e
   where e.fecha_inscripcion >= v_desde and e.estado <> 'cancelada'
     and cem_inscripcion_abierta(e.id) and coalesce(e.progreso, 0) >= 100;

  return jsonb_build_object(
    'pasos', jsonb_build_array(
      jsonb_build_object('etq', 'Miraron un programa', 'n', v_vieron,
        'nota', 'Visitas a una ficha de programa. Se cuentan desde que existe el contador: '
             || 'lo de antes no está y no se puede inventar.'),
      jsonb_build_object('etq', 'Empezaron a pagar', 'n', v_empezaron_pago,
        'nota', 'Escribieron su nombre y su correo y pulsaron pagar. Ya habían decidido: '
             || 'lo que se pierde de aquí en adelante se pierde por la puerta, no por el producto.'),
      jsonb_build_object('etq', 'Se inscribieron', 'n', v_inscritos,
        'nota', 'Inscripciones del periodo, sin contar las canceladas.'),
      jsonb_build_object('etq', 'Se les abrió el curso', 'n', v_abiertos,
        'nota', 'Pagaron, o el programa era gratuito, y no están en pausa ni suspendidas. '
             || 'Aquí es donde más dinero se pierde: ya habían elegido.'),
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
            || 'mucha gente se inscribe sin dejar antes sus datos, y muchas cuentas no llegan a inscribirse.'));
end;
$$;

create or replace function public.cem_ver_como(p_profile_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare v_p cem_profiles; v_ins jsonb; v_avisos jsonb; v_pagos jsonb;
begin
  if not cem_is_staff() then
    raise exception 'Sólo el personal autorizado puede mirar la cuenta de otra persona.';
  end if;
  select * into v_p from cem_profiles where id = p_profile_id;
  if v_p.id is null then raise exception 'No encontramos esa cuenta.'; end if;

  -- «Abierto» con la regla de la inscripción, no con cem_acceso_abierto: quien
  -- mira es del equipo, y para el equipo todo estaría abierto.
  select coalesce(jsonb_agg(jsonb_build_object(
      'enrollment_id', e.id,
      'curso', cur.nombre,
      'course_id', cur.id,
      'publicado', cur.estado = 'publicado',
      'estado', e.estado,
      'progreso', coalesce(e.progreso, 0),
      'abierto', cem_inscripcion_abierta(e.id),
      'porque', case
        when cem_inscripcion_abierta(e.id) then null
        when e.estado = 'cancelada' then 'Está cancelada: para volver tiene que inscribirse de nuevo.'
        when e.estado = 'congelada' then 'Está en pausa (congelada): se abre cuando se apruebe la reactivación.'
        when e.estado = 'suspendida' then 'Está suspendida: el equipo tiene que levantar la suspensión.'
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
end $$;
