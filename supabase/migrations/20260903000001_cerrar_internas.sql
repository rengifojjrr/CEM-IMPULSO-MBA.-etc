-- ═══════════════════════════════════════════════════════════════════════════
-- Cerrar las funciones internas que un navegador podía llamar
-- ═══════════════════════════════════════════════════════════════════════════
-- Sale de comprobar el punto 1.6 de la auditoría del 3 de septiembre de 2026
-- («verificar RLS por rol»), que era el único que el auditor no había podido
-- probar desde el navegador.
--
-- El resultado del repaso, en corto: de las 309 funciones `cem_*` que son
-- SECURITY DEFINER, 194 comprueban el rol de quien llama y 31 se limitan solas
-- a `auth.uid()`. El patrón de la casa aguanta. Lo que no aguantaba eran las
-- que se quedaron con el reparto de permisos de fábrica de Postgres, que
-- concede EXECUTE a PUBLIC salvo que se revoque a mano.
--
-- Importa más de lo normal en esta base: el asistente resuelve TODO lo que
-- toca datos de personas con el token de quien pregunta, a propósito, para que
-- manden las reglas de la base (ver supabase/functions/cem-asistente). Si la
-- regla no está puesta, no manda nadie.

-- ── 1. La puerta que faltaba en cem_recalc_progress ────────────────────────
-- Escribía el avance de CUALQUIER inscripción, y la llama clase.html, o sea un
-- estudiante. Se le añaden tres líneas y nada más: el cuerpo es el mismo que
-- en 20260101000003_funciones.sql.
create or replace function public.cem_recalc_progress(p_enrollment_id uuid)
returns numeric language plpgsql security definer set search_path to 'public' as $function$
declare v_course uuid; v_peso numeric;
        v_lec_total int; v_lec_hechas int; v_pct_lec numeric := 0;
        v_ev_total int; v_ev_ok int; v_pct_ev numeric := 0;
        v_pct numeric;
begin
  -- Sólo su dueño, el profesorado o el equipo.
  if not (cem_owns_enrollment(p_enrollment_id) or cem_is_staff() or cem_is_teacher()) then
    raise exception 'Esa inscripción no es tuya.';
  end if;

  select e.course_id, coalesce(c.peso_evaluaciones, 30)
    into v_course, v_peso
    from cem_enrollments e join cem_courses c on c.id = e.course_id
   where e.id = p_enrollment_id;

  select count(*) into v_lec_total from cem_lessons l
    join cem_modules m on m.id = l.module_id where m.course_id = v_course;
  select count(*) into v_lec_hechas from cem_lesson_progress lp
    join cem_lessons l on l.id = lp.lesson_id
    join cem_modules m on m.id = l.module_id
   where lp.enrollment_id = p_enrollment_id and lp.completado and m.course_id = v_course;
  if v_lec_total > 0 then v_pct_lec := 100.0 * v_lec_hechas / v_lec_total; end if;

  -- Sólo cuentan las evaluaciones publicadas: un borrador no puede frenar a nadie.
  select count(*) into v_ev_total from cem_assessments a
   where a.course_id = v_course and a.estado = 'publicado';
  select count(distinct s.assessment_id) into v_ev_ok
    from cem_submissions s join cem_assessments a on a.id = s.assessment_id
   where s.enrollment_id = p_enrollment_id
     and a.course_id = v_course and a.estado = 'publicado'
     and s.estado = 'calificada'
     and s.puntaje >= coalesce(a.nota_aprobatoria, 0);
  if v_ev_total > 0 then v_pct_ev := 100.0 * v_ev_ok / v_ev_total; end if;

  v_pct := case
    when v_ev_total = 0 then v_pct_lec
    when v_lec_total = 0 then v_pct_ev
    else v_pct_lec * (100 - v_peso) / 100.0 + v_pct_ev * v_peso / 100.0
  end;
  v_pct := round(least(100, greatest(0, v_pct)), 2);

  update cem_enrollments set progreso = v_pct, ultimo_acceso = now() where id = p_enrollment_id;

  begin
    perform cem_evaluar_insignias((select profile_id from cem_enrollments where id = p_enrollment_id));
  exception when others then
    -- A propósito en silencio: el avance ya quedó guardado, que es lo que
    -- importaba. Si aquí se levantara la excepción, la nota se perdería.
    null;
  end;

  begin
    -- Quien termina un módulo que certifica se lleva su título sin que nadie
    -- tenga que acordarse de dárselo. Mismo silencio y misma razón.
    perform cem_certificar_modulos_terminados(p_enrollment_id);
  exception when others then
    null;
  end;

  return v_pct;
end $function$;

comment on function public.cem_recalc_progress(uuid) is
  'Recalcula el avance de UNA inscripción. Sólo su dueño, el profesorado o el equipo.';

-- ── 2. Las diecinueve internas, fuera del alcance del navegador ────────────
-- Ninguna la llama ninguna pantalla (comprobado por nombre en los 108 HTML y
-- en el JavaScript). Cinco las usan funciones de borde, y las cinco con la
-- clave de servicio, que se salta los permisos. Las que se llaman desde otras
-- funciones siguen igual: una SECURITY DEFINER corre como su dueño.
--
-- Lo que se cierra, y por qué importa cada una:
--
--   cem_notificar        mandaba un aviso Y UN CORREO a cualquier persona, con
--                        el título y el cuerpo que quisiera quien llamara: un
--                        correo salido del CEM diciendo lo que le apeteciera a
--                        un tercero.
--   cem_avisar_equipo    lo mismo, contra el equipo entero.
--   cem_certificar_...   EMITE CERTIFICADOS de una inscripción. Con el número
--                        de una inscripción ajena, se emitían solos.
--   cem_requisitos_...   qué le falta a otra persona para certificarse.
--   cem_modulo_avance    el avance de otra persona, módulo a módulo.
--   cem_bot_*_visitante  las conversaciones de cualquier visitante, por id.
--   cem_cierre_de_mes_calc, cem_reparto_calc, cem_informe_mensual_enviar
--                        cuentas de la casa y reparto a inversionistas.
--   cem_correo_empujar   soltaba la cola de correo a mano.
--   cem_rate_limit_...   quien puede gastarse su propio límite lo desarma.
--
-- El resto son calculadoras internas (cambio de moneda, valoraciones) que no
-- filtran nada, pero tampoco tienen por qué estar al alcance de un navegador.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'cem_notificar', 'cem_avisar_equipo', 'cem_correo_empujar',
         'cem_informe_mensual_enviar', 'cem_cierre_de_mes_calc', 'cem_reparto_calc',
         'cem_certificar_modulos_terminados', 'cem_requisitos_certificado',
         'cem_modulo_avance', 'cem_rate_limit_consumir', 'cem_stripe_producto_reflejar',
         'cem_a_base', 'cem_equivalente_en_base', 'cem_cruce_eur_usd',
         'cem_bot_visitante_permitir', 'cem_bot_guardar_visitante',
         'cem_bot_historial_visitante', 'cem_bot_conversacion_visitante',
         'cem_valoracion_lecciones')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f.firma);
  end loop;
end $$;

-- ── Lo que NO se tocó, y por qué ───────────────────────────────────────────
-- cem_docente_quien_se_esta_yendo parecía abierta y no lo estaba: se limita
-- por cem_docente_de_cohorte(), que va por auth.uid(). Un estudiante que la
-- llamara recibía una lista vacía. Queda como estaba.
--
-- El tablero de proyectos y presupuestos (get_quote, upsert_quote,
-- get_pm_project, upsert_pm_project, log_*_event) tampoco se toca. Es un
-- diseño de «la URL es la llave»: no hay sesión, y el UUID del enlace es la
-- credencial. Está bien hecho —proyectos.html los genera con
-- crypto.randomUUID(), 122 bits, que no se adivinan— pero conviene saber que
-- ese mismo enlace da lectura Y ESCRITURA: quien recibe su presupuesto puede
-- editarlo, precio incluido. Eso es una decisión de negocio, no un fallo, y
-- cambiarla rompería la herramienta; queda anotado para que se decida.
