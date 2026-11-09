-- Las clases en vivo, los adjuntos y la lista del almacén, por la regla del aula.
--
-- EL AGUJERO
-- cem_acceso_abierto() cierra las lecciones, los exámenes y el progreso de una
-- inscripción cancelada, congelada, suspendida o sin pagar. Pero tres cosas no
-- le preguntaban (lo-que-falta §3.9):
--   · cem_classes, las sesiones en vivo. Su política de lectura era
--     «using (true)»: cualquier cuenta, inscrita o no, leía todas las clases de
--     todas las cohortes, con el enlace para entrar (url_sesion) y la
--     grabación (grabacion_url). Quien se retiraba seguía entrando en vivo.
--   · cem_media, los adjuntos. Igual, «using (true)»: la lista entera con la
--     dirección de cada archivo, también los que el equipo dejó sin marcar
--     «Visible para todos los estudiantes del curso».
--   · El depósito cem-assets. cem_assets_lectura («to public») dejaba LISTAR
--     el depósito entero a cualquier cuenta: los adjuntos (materiales/), los
--     fondos de los diplomas y la carpeta de cada perfil, sin tener que saber
--     antes ninguna dirección. La política lo dejaba también sin sesión; hoy
--     no llega a pasar sólo porque otra política del depósito, de otra
--     aplicación de este proyecto, hace fallar entera la consulta de anon.
-- Y cem_avisar_de_clase avisaba de cada clase en vivo también a las
-- congeladas, a las que el aula ya no deja entrar (lo-que-falta §3.10).
--
-- EL ARREGLO
--   · Una clase la leen el equipo (cem_can_read_all, que incluye a los
--     profesores), quien da clase en esa cohorte (cem_docente_de_cohorte) y
--     quien tiene en esa cohorte una inscripción abierta (cem_acceso_abierto).
--     Con el aula cerrada no se ve nada de la clase, tampoco el horario.
--   · Un adjunto lo leen el equipo y, si está marcado como visible para los
--     estudiantes (publico; vacío cuenta como visible, igual que en
--     cem_material_lecciones), quien tiene una inscripción abierta en su
--     curso. Un adjunto sin curso queda para el equipo: ninguna pantalla del
--     estudiante lo enseñaba.
--   · La lista del depósito la ve el equipo (cem_is_staff: los mismos que
--     suben, cambian y borran ahí) y cada cuenta su carpeta perfiles/<su uid>/,
--     que es la única donde puede escribir. Sin sesión, ninguna.
--   · cem_avisar_de_clase avisa a las inscripciones que abren el aula
--     (cem_inscripcion_abierta, la regla sin el pase del equipo). Sale la
--     congelada; entran la finalizada y la pendiente que ya pagó o no cuesta
--     nada, que sí pueden entrar.
--
-- LO QUE NO CAMBIA
-- Las direcciones públicas del depósito (/storage/v1/object/public/…) siguen
-- sirviendo: en un depósito público el almacén busca el archivo como
-- superusuario, sin mirar políticas (documentación de Supabase, «Public
-- buckets», y su código, getPublicObject). Las fotos de los cursos, los fondos
-- de los diplomas y las fotos de perfil se ven igual. Subir tampoco cambia:
-- sólo pide la política de inserción, y ninguna pantalla ni función de borde
-- lista, descarga o sube con «upsert» en este depósito. Quién escribe
-- (cem_classes_write, cem_media_write) sigue igual —ver LOS PERMISOS—, y las
-- funciones security definer que leen estas tablas no pasan por estas
-- políticas: cem_aula, el muro de la cohorte, sigue enseñando el título y la
-- hora de las próximas clases (sin enlace) a quien tenga cualquier
-- inscripción en la cohorte. Queda anotado aparte.
--
-- LOS PERMISOS
-- cem_classes_write pasa de «to public» a «to authenticated», con la misma
-- regla. Sin sesión nunca pudo escribir (cem_is_staff y cem_is_teacher dan
-- falso), pero al ser «to public» se evaluaba también al LEER sin sesión, y
-- lleva dentro cem_docente_de_cohorte, que anon no puede ejecutar: leer
-- cem_classes sin sesión no daba cero filas, daba «permission denied». Ahora
-- da cero filas, como cem_media, cuyas dos políticas ya eran
-- «to authenticated». No se le abre la función a anon: ninguna página
-- pública lee estas tablas (lo-que-falta §3.1).
--
-- La prueba: pruebas/sql/clases-y-adjuntos.sql (antes de esto, 9 fallos de 23).

alter policy cem_classes_read on public.cem_classes
  to authenticated
  using (
    cem_can_read_all()
    or cem_docente_de_cohorte(cohort_id)
    or exists (select 1 from cem_enrollments e
                where e.profile_id = (select auth.uid())
                  and e.cohort_id = cem_classes.cohort_id
                  and cem_acceso_abierto(e.id))
  );

comment on policy cem_classes_read on public.cem_classes is
  'Una clase en vivo la leen el equipo, quien da clase en su cohorte y quien tiene en esa cohorte una inscripción abierta (cem_acceso_abierto). Con el aula cerrada no se ve nada: ni el horario, ni el enlace, ni la grabación. Antes era using (true).';

-- La misma regla de siempre; sólo deja de alcanzar a quien no tiene sesión.
alter policy cem_classes_write on public.cem_classes
  to authenticated;

alter policy cem_media_read on public.cem_media
  to authenticated
  using (
    cem_can_read_all()
    or (coalesce(publico, true)
        and exists (select 1 from cem_enrollments e
                     where e.profile_id = (select auth.uid())
                       and e.course_id = cem_media.course_id
                       and cem_acceso_abierto(e.id)))
  );

comment on policy cem_media_read on public.cem_media is
  'Un adjunto lo leen el equipo y, si está marcado como visible para los estudiantes (publico; vacío cuenta como visible), quien tiene una inscripción abierta en su curso. Antes era using (true).';

alter policy cem_assets_lectura on storage.objects
  to authenticated
  using (
    bucket_id = 'cem-assets'
    and (public.cem_is_staff()
         or ((storage.foldername(name))[1] = 'perfiles'
             and (storage.foldername(name))[2] = (select auth.uid())::text))
  );

comment on policy cem_assets_lectura on storage.objects is
  'La lista de cem-assets: el equipo entera, y cada cuenta su carpeta perfiles/<su uid>/. Las direcciones públicas no pasan por aquí: el depósito es público y las sirve sin políticas. Antes la política dejaba listar el depósito entero a cualquiera, también sin sesión.';

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

  -- Sólo a quien el aula deja entrar: la regla de la inscripción, sin el pase
  -- del equipo. Antes iba a «activa» y «congelada», y la congelada ya no entra.
  -- Quien ya terminó conserva el aula pero no está cursando: no se le avisa,
  -- como antes.
  for r in
    select e.profile_id from cem_enrollments e
     where e.cohort_id = v_c.cohort_id and e.estado <> 'finalizada'
       and cem_inscripcion_abierta(e.id)
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
end $function$;

comment on function public.cem_avisar_de_clase(uuid, text) is
  'Profesor de la cohorte o equipo: avisa de una sesión en vivo (aviso y correo) a las inscripciones de la cohorte que abren el aula según cem_inscripcion_abierta. Devuelve a cuántas avisó.';

revoke all on function public.cem_avisar_de_clase(uuid, text) from public, anon;
grant execute on function public.cem_avisar_de_clase(uuid, text) to authenticated, service_role;
