-- Una inscripción cancelada, suspendida o congelada ya no abre el aula.
--
-- EL AGUJERO
-- cem_acceso_abierto() abría si se cumplía cualquiera de cuatro cosas: ser
-- del equipo, costar 0, estar activa o finalizada, o tener un pago
-- confirmado. Dos de las cuatro no miraban el estado, así que abrían:
--   · una cancelada a 0 € (lo de lo-que-falta §3.8: puesta a 0 a mano y
--     cancelada después);
--   · una cancelada con un pago, que es lo que deja una retirada aprobada:
--     cem_resolver_solicitud_inscripcion la pasa a cancelada y anula las
--     cuotas que faltan sin mirar lo pagado. Quien pagaba una cuota y se
--     retiraba se quedaba el programa entero;
--   · una congelada con un pago: congelar para las cuotas futuras, así que
--     se podía congelar y seguir estudiando sin pagar;
--   · una suspendida con un pago: suspender no le cortaba nada a quien
--     hubiera pagado una cuota.
-- Las becas lo esquivaban porque cem_beca_revocar devuelve el precio al
-- cancelar.
--
-- EL ARREGLO
-- La regla pasa a ser una lista blanca de estados:
--   activa, finalizada  → abre;
--   pendiente           → abre si cuesta 0 o ya tiene un pago confirmado;
--   todo lo demás       → no abre nunca, ni gratis ni pagado.
-- Un estado que se añada mañana al enum nace cerrado. El equipo sigue
-- entrando siempre. Pagar no levanta una suspensión ni una pausa: las
-- levanta el equipo, o la reactivación que pide el estudiante.
--
-- LO QUE NO CAMBIA
-- Lo gratis de verdad: cem_tg_activar_si_es_gratis deja activa al insertarla
-- la inscripción que cuesta 0, y una pendiente a la que se le baja el precio
-- a 0 después (el disparador sólo mira al insertar) abre por la rama de
-- pendiente. Las becas entran activas. Lo pagado lo activa
-- cem_tg_activar_al_pagar. Ninguna puerta cambia: todas preguntan aquí.
-- Lo que no pasa por aquí tampoco cambia: cem_media y cem_classes se leen
-- con sesión sin mirar la inscripción (anotado aparte en lo-que-falta).
--
-- LOS PERMISOS
-- Los de la casa: ni PUBLIC ni anon, sólo authenticated (y service_role, el
-- servidor). Antes la podían ejecutar PUBLIC, anon, authenticated y
-- service_role.
-- Parecía que anon hacía falta, porque la función está dentro de dos
-- políticas «to public» (cem_course_shorts_leer, cem_progress_all) sobre
-- tablas que anon puede leer, y a cem_can_read_all le pasa eso de verdad. Se
-- comprobó que aquí no: en cem_course_shorts_leer va dentro de una subconsulta
-- sobre cem_enrollments, donde anon no tiene política, así que para anon esa
-- subconsulta se descarta al planificar («One-Time Filter: false») y nunca
-- llega a llamarla; en cem_progress_all sólo está en el WITH CHECK, que una
-- lectura no evalúa. Una inserción anónima en cem_lesson_progress sigue
-- negada; sólo cambia el texto del error. Se aplicó en dos pasos en la base
-- (cancelada_no_abre y cancelada_no_abre_sin_anon); esto es el estado final.
--
-- La prueba: pruebas/sql/acceso-abierto.sql. Antes de esto daba 13 fallos
-- de 30.

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
      -- Está estudiando, o ya terminó y conserva lo suyo.
      or e.estado in ('activa', 'finalizada')
      -- Pendiente: sólo si no hay nada que cobrar o ya hay un pago confirmado.
      or (e.estado = 'pendiente'
          and (coalesce(e.precio_final, 0) <= 0
               or exists (select 1 from cem_payments p
                           where p.enrollment_id = e.id and p.estado = 'confirmado')))
      -- Suspendida, congelada o cancelada no abren nunca, ni gratis ni pagadas.
    from cem_enrollments e where e.id = p_enrollment_id), false);
$$;

comment on function public.cem_acceso_abierto(uuid) is
  'La única definición de «esta persona puede entrar al programa». Abre al equipo siempre; a la inscripción activa o finalizada; y a la pendiente sólo si no cuesta nada o ya tiene un pago confirmado. Suspendida, congelada o cancelada no abren nunca. Si se cambia aquí, cambia en todas las puertas a la vez.';

revoke all on function public.cem_acceso_abierto(uuid) from public, anon;
grant execute on function public.cem_acceso_abierto(uuid) to authenticated, service_role;

comment on function public.cem_beca_revocar(uuid, text) is
  'Admin: revoca una beca. Cancela la inscripción y le devuelve su precio, para que deje de contar como beca, y devuelve lo reservado al fondo. Cerrar el aula ya lo hace la cancelación: cem_acceso_abierto no abre nada cancelado.';
