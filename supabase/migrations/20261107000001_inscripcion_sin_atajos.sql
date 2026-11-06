-- Inscribirse gratis en un programa de pago ya no se puede por la puerta de atrás.
--
-- EL AGUJERO
-- La política cem_enroll_insert dejaba a cualquiera con sesión insertar SU
-- inscripción directamente en la tabla (profile_id = auth.uid()). Y
-- cem_enrollments.precio_final vale 0 por defecto, y el disparador
-- cem_tg_activar_si_es_gratis activa sola cualquier inscripción a 0. Juntas,
-- las tres cosas: una llamada a la API con {profile_id, course_id} y la
-- persona tenía el programa abierto sin pagar un céntimo (y podía, además,
-- escribir a mano vendedor_id, referido_por o progreso). Salió a la luz al
-- montar las becas, que pierden el sentido si cualquiera se regala el curso.
--
-- EL ARREGLO
-- Que un estudiante no inserte nunca directamente: sólo por las funciones que
-- ponen el precio (cem_self_enroll → cem_inscribir_a, las invitaciones, las
-- becas), que corren como dueño de la tabla y no pasan por la política.
--
-- La única que insertaba con los permisos del propio estudiante era
-- cem_bot_apuntarme (Cemi: «apúntame»). Ya fijaba ella misma quién (auth.uid()),
-- que el programa esté publicado y el precio entero, así que pasa a security
-- definer sin tocar lo que hace. El equipo sigue pudiendo matricular a mano
-- desde sus pantallas, y el servidor (service_role) no pasa por RLS.

alter function public.cem_bot_apuntarme(text) security definer;

alter policy cem_enroll_insert on public.cem_enrollments
  with check (cem_is_staff());

comment on policy cem_enroll_insert on public.cem_enrollments is
  'Sólo el equipo inserta inscripciones directamente. Los estudiantes se inscriben por cem_self_enroll, cem_bot_apuntarme, las invitaciones o las becas, que ponen el precio. Antes cualquiera podía insertar la suya a precio 0 y quedaba activa.';
