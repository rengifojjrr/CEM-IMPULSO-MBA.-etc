-- Cuántas preguntas tiene una evaluación, para quien va a rendirla.
--
-- Las preguntas de una evaluación sólo las lee el equipo y el profesor (así
-- debe ser: son las preguntas). Pero «cuántas son» no es una pregunta, es un
-- dato que quien va a empezar necesita para saber si se sienta diez minutos o
-- una hora. Se devuelve sólo a quien está inscrito en el curso de esa
-- evaluación —o al equipo— y sólo el número.
create or replace function public.cem_evaluacion_cuantas_preguntas(p_assessment_id uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select count(*)::int
    from cem_assessment_questions q
   where q.assessment_id = p_assessment_id
     and (cem_can_read_all()
          or exists (select 1
                       from cem_assessments a
                       join cem_enrollments e on e.course_id = a.course_id
                      where a.id = p_assessment_id and e.profile_id = auth.uid()));
$$;
revoke all on function public.cem_evaluacion_cuantas_preguntas(uuid) from public, anon;
grant execute on function public.cem_evaluacion_cuantas_preguntas(uuid) to authenticated;
