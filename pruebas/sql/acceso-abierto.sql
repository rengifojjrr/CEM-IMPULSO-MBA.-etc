/* La regla de acceso al aula, caso por caso.
   ==========================================================================
   cem_acceso_abierto() es la única que decide si una inscripción abre el
   aula: las políticas, el material de las lecciones, los exámenes y lo que
   enseña el panel la consultan a ella. Esto la prueba contra la base de
   verdad, con inscripciones de mentira que nunca llegan a guardarse.

   CÓMO SE CORRE
   Entera, de una vez: en Supabase → SQL Editor, o con la herramienta
   execute_sql. Siempre termina en ERROR, a propósito: es lo que deshace todo
   lo que creó (inscripciones, pagos, progreso, y los avisos y correos en cola
   que esos pagos disparan; ningún disparador de esas tablas sale de la
   transacción: ni net.http, ni dblink, ni pg_notify).
     · «PRUEBA_OK: …»     todo como debe.
     · «PRUEBA_FALLA: …»  la lista de lo que no.
   Cualquier otro error es un fallo de la prueba misma, no de la regla.

   QUÉ NECESITA
   Un curso, dos estudiantes activos sin ninguna inscripción en él y una
   persona del equipo. Los busca ella: aquí no se escribe el id de nadie. Que
   los estudiantes no tengan nada en ese curso importa: las puertas preguntan
   «¿tiene ALGUNA inscripción abierta en este curso?», y una real taparía el
   resultado de las de mentira.

   QUIÉN PREGUNTA
   auth.uid() mira primero request.jwt.claim.sub y luego
   request.jwt.claims->>'sub' (el andamio de herramientas/ sólo el primero),
   así que cada cambio de persona fija los dos y se comprueba enseguida: si
   no se pudo ser esa persona, la prueba se para en vez de probar otra cosa.

   LA REGLA QUE COMPRUEBA (migraciones 20261107000006 y 20261108000002)
     equipo                            → abre siempre
     activa, finalizada                → abre
     pendiente                         → abre si cuesta 0 o tiene un pago confirmado
     suspendida, congelada, cancelada  → no abre nunca, ni gratis ni pagada
   Y que los informes del equipo («Ver como», el embudo) miren la inscripción
   y no a quien pregunta, que siendo del equipo siempre entraría. */

do $prueba$
declare
  v_curso   uuid;
  v_leccion uuid;
  v_equipo  uuid;
  v_uno     uuid;   -- sólo tiene inscripciones que deben quedar cerradas
  v_dos     uuid;   -- sólo tiene inscripciones que deben abrir
  v_mi      jsonb;
  v_vc      jsonb;
  v_fila    jsonb;
  v_embudo_antes jsonb;
  v_embudo  jsonb;
  v_n       integer := 0;
  v_fallos  text[] := '{}';
  c_cancelada_cero     uuid;
  c_congelada_cero     uuid;
  c_suspendida_cero    uuid;
  c_cancelada_pagada   uuid;
  c_congelada_pagada   uuid;
  c_suspendida_pagada  uuid;
  c_pendiente_sin_pago uuid;
  c_beca               uuid;
  c_pagada             uuid;
  c_pendiente_a_cero   uuid;
  c_finalizada         uuid;
  r record;
begin
  -- Nadie delante: el pase del equipo no se puede colar en lo que no es suyo.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if auth.uid() is not null then
    raise exception 'PRUEBA_FALLA: la sesión ya tiene identidad (%) y así no se puede probar la regla', auth.uid();
  end if;

  select id into v_curso from cem_courses order by (precio > 0) desc, created_at limit 1;
  select l.id into v_leccion
    from cem_lessons l join cem_modules m on m.id = l.module_id
   where m.course_id = v_curso limit 1;
  select id into v_equipo from cem_profiles
   where activo and rol in ('admin', 'superadmin', 'coordinador')
   order by created_at limit 1;
  select p.id into v_uno from cem_profiles p
   where p.rol = 'estudiante' and p.activo
     and not exists (select 1 from cem_enrollments e
                      where e.profile_id = p.id and e.course_id = v_curso)
   order by p.created_at limit 1;
  select p.id into v_dos from cem_profiles p
   where p.rol = 'estudiante' and p.activo and p.id <> v_uno
     and not exists (select 1 from cem_enrollments e
                      where e.profile_id = p.id and e.course_id = v_curso)
   order by p.created_at limit 1;
  if v_curso is null or v_equipo is null or v_uno is null or v_dos is null then
    raise exception 'PRUEBA_FALLA: faltan datos para probar (curso %, equipo %, estudiantes % y %)',
      v_curso, v_equipo, v_uno, v_dos;
  end if;

  -- El embudo de antes, para medir después cuánto le suman las de mentira.
  perform set_config('request.jwt.claim.sub', v_equipo::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_equipo, 'role', 'authenticated')::text, true);
  v_embudo_antes := public.cem_embudo(1);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  /* ── Estudiante 1: todo lo que tiene que quedar cerrado ────────────────── */
  -- A 0 €: el caso de lo-que-falta §3.8 (puesta a 0 a mano y cancelada) y sus
  -- dos primos. Entran con su estado directamente: el disparador de lo gratis
  -- sólo toca las pendientes.
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_uno, v_curso, 'cancelada', 100, 0, 'EUR') returning id into c_cancelada_cero;
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_uno, v_curso, 'congelada', 100, 0, 'EUR') returning id into c_congelada_cero;
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_uno, v_curso, 'suspendida', 100, 0, 'EUR') returning id into c_suspendida_cero;

  -- Pagaron una cuota y después se retiraron, congelaron o los suspendieron.
  -- Nacen activas, se paga, y luego cambian de estado: así las dejan
  -- cem_resolver_solicitud_inscripcion y las pantallas del equipo.
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_uno, v_curso, 'activa', 100, 100, 'EUR') returning id into c_cancelada_pagada;
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_uno, v_curso, 'activa', 100, 100, 'EUR') returning id into c_congelada_pagada;
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_uno, v_curso, 'activa', 100, 100, 'EUR') returning id into c_suspendida_pagada;
  insert into cem_payments (enrollment_id, monto, moneda, estado)
  select x, 100, 'EUR', 'confirmado'
    from unnest(array[c_cancelada_pagada, c_congelada_pagada, c_suspendida_pagada]) as x;
  update cem_enrollments set estado = 'cancelada'  where id = c_cancelada_pagada;
  update cem_enrollments set estado = 'congelada'  where id = c_congelada_pagada;
  update cem_enrollments set estado = 'suspendida' where id = c_suspendida_pagada;

  -- La puerta de siempre: inscrita en un curso de pago y sin pagar.
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_uno, v_curso, 'pendiente', 100, 100, 'EUR') returning id into c_pendiente_sin_pago;

  /* ── Estudiante 2: todo lo que tiene que abrir ─────────────────────────── */
  -- Una beca, como la deja cem_becas_inscribir.
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, descuento,
                               precio_final, moneda, fuente)
  values (v_dos, v_curso, 'activa', 100, 100, 0, 'EUR', 'beca') returning id into c_beca;

  -- Pagada: el disparador cem_tg_activar_al_pagar la pasa a activa.
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_dos, v_curso, 'pendiente', 100, 100, 'EUR') returning id into c_pagada;
  insert into cem_payments (enrollment_id, monto, moneda, estado)
  values (c_pagada, 100, 'EUR', 'confirmado');

  -- Le bajaron el precio a 0 después de inscribirse. El disparador de lo
  -- gratis sólo mira al insertar, así que sigue pendiente: tiene que abrir igual.
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_dos, v_curso, 'pendiente', 100, 100, 'EUR') returning id into c_pendiente_a_cero;
  update cem_enrollments set precio_final = 0 where id = c_pendiente_a_cero;
  v_n := v_n + 1;
  if (select estado::text from cem_enrollments where id = c_pendiente_a_cero) <> 'pendiente' then
    v_fallos := v_fallos || 'el caso «pendiente que bajó a 0 €» no quedó pendiente: la prueba no prueba lo que dice'::text;
  end if;

  -- Terminó: conserva lo suyo aunque no conste ningún pago (graduados, importados).
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_dos, v_curso, 'finalizada', 100, 100, 'EUR') returning id into c_finalizada;

  -- Un id vacío daría «cerrada» por la razón equivocada.
  if c_cancelada_cero is null or c_congelada_cero is null or c_suspendida_cero is null
     or c_cancelada_pagada is null or c_congelada_pagada is null or c_suspendida_pagada is null
     or c_pendiente_sin_pago is null or c_beca is null or c_pagada is null
     or c_pendiente_a_cero is null or c_finalizada is null then
    raise exception 'PRUEBA_FALLA: no se pudieron crear todas las inscripciones de prueba';
  end if;

  /* ── La regla, sin nadie delante ───────────────────────────────────────── */
  for r in select * from (values
      ('cancelada a 0 €',          c_cancelada_cero,     false),
      ('congelada a 0 €',          c_congelada_cero,     false),
      ('suspendida a 0 €',         c_suspendida_cero,    false),
      ('cancelada con pago',       c_cancelada_pagada,   false),
      ('congelada con pago',       c_congelada_pagada,   false),
      ('suspendida con pago',      c_suspendida_pagada,  false),
      ('pendiente sin pago',       c_pendiente_sin_pago, false),
      ('inexistente',              '00000000-0000-0000-0000-000000000000'::uuid, false),
      ('beca activa a 0 €',        c_beca,               true),
      ('pagada',                   c_pagada,             true),
      ('pendiente que bajó a 0 €', c_pendiente_a_cero,   true),
      ('finalizada sin pago',      c_finalizada,         true)
    ) as t(caso, id, espera)
  loop
    v_n := v_n + 1;
    if public.cem_acceso_abierto(r.id) is distinct from r.espera then
      v_fallos := v_fallos || format('«%s» tenía que %s', r.caso,
                                     case when r.espera then 'abrir' else 'quedar cerrada' end);
    end if;
  end loop;

  /* ── El equipo entra siempre, también en lo cerrado ────────────────────── */
  perform set_config('request.jwt.claim.sub', v_equipo::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_equipo, 'role', 'authenticated')::text, true);
  if auth.uid() is distinct from v_equipo or not cem_can_read_all() then
    raise exception 'PRUEBA_FALLA: no se pudo hacer pasar la prueba por alguien del equipo';
  end if;
  for r in select * from (values
      ('cancelada a 0 €',     c_cancelada_cero),
      ('congelada a 0 €',     c_congelada_cero),
      ('suspendida a 0 €',    c_suspendida_cero),
      ('cancelada con pago',  c_cancelada_pagada),
      ('congelada con pago',  c_congelada_pagada),
      ('suspendida con pago', c_suspendida_pagada),
      ('pendiente sin pago',  c_pendiente_sin_pago)
    ) as t(caso, id)
  loop
    v_n := v_n + 1;
    if not coalesce(public.cem_acceso_abierto(r.id), false) then
      v_fallos := v_fallos || format('el equipo no entra en «%s»', r.caso);
    end if;
  end loop;

  /* ── Lo que el equipo ve en sus informes ───────────────────────────────── */
  -- «Ver como» y el embudo sólo los usa el equipo, que siempre entra: tienen
  -- que mirar la inscripción, no a quien pregunta.
  v_vc := public.cem_ver_como(v_uno);
  for r in select * from (values
      ('cancelada a 0 €',     c_cancelada_cero,     'cancelada'),
      ('congelada a 0 €',     c_congelada_cero,     'pausa'),
      ('suspendida a 0 €',    c_suspendida_cero,    'suspendida'),
      ('cancelada con pago',  c_cancelada_pagada,   'cancelada'),
      ('congelada con pago',  c_congelada_pagada,   'pausa'),
      ('suspendida con pago', c_suspendida_pagada,  'suspendida'),
      ('pendiente sin pago',  c_pendiente_sin_pago, 'pago')
    ) as t(caso, id, motivo)
  loop
    v_n := v_n + 1;
    select x into v_fila from jsonb_array_elements(v_vc -> 'inscripciones') as x
     where x ->> 'enrollment_id' = r.id::text;
    if (v_fila ->> 'abierto') is distinct from 'false'
       or coalesce(v_fila ->> 'porque', '') not ilike '%' || r.motivo || '%' then
      v_fallos := v_fallos || format('«Ver como» de «%s»: debería salir cerrada y decir por qué (%s); sale %s',
                                     r.caso, r.motivo, coalesce(v_fila, 'null'::jsonb));
    end if;
  end loop;

  v_vc := public.cem_ver_como(v_dos);
  v_n := v_n + 1;
  if exists (select 1 from jsonb_array_elements(v_vc -> 'inscripciones') as x
              where x ->> 'enrollment_id' in (c_beca::text, c_pagada::text,
                                              c_pendiente_a_cero::text, c_finalizada::text)
                and ((x ->> 'abierto') is distinct from 'true' or x ->> 'porque' is not null)) then
    v_fallos := v_fallos || '«Ver como» enseña cerrada una inscripción que abre'::text;
  end if;

  -- Nueve inscripciones nuevas cuentan como inscritas (las dos canceladas no)
  -- y sólo cuatro se abrieron: las del estudiante 2.
  v_embudo := public.cem_embudo(1);
  v_n := v_n + 2;
  if (select (p ->> 'n')::int from jsonb_array_elements(v_embudo -> 'pasos') p where p ->> 'etq' = 'Se inscribieron')
   - (select (p ->> 'n')::int from jsonb_array_elements(v_embudo_antes -> 'pasos') p where p ->> 'etq' = 'Se inscribieron')
     is distinct from 9 then
    v_fallos := v_fallos || 'el embudo no cuenta como inscritas las nueve que no están canceladas'::text;
  end if;
  if (select (p ->> 'n')::int from jsonb_array_elements(v_embudo -> 'pasos') p where p ->> 'etq' = 'Se les abrió el curso')
   - (select (p ->> 'n')::int from jsonb_array_elements(v_embudo_antes -> 'pasos') p where p ->> 'etq' = 'Se les abrió el curso')
     is distinct from 4 then
    v_fallos := v_fallos || format('el embudo cuenta como abiertas %s de las nuevas, y abren 4',
      (select (p ->> 'n')::int from jsonb_array_elements(v_embudo -> 'pasos') p where p ->> 'etq' = 'Se les abrió el curso')
    - (select (p ->> 'n')::int from jsonb_array_elements(v_embudo_antes -> 'pasos') p where p ->> 'etq' = 'Se les abrió el curso'));
  end if;

  /* ── Lo que ve el estudiante 1 ─────────────────────────────────────────── */
  perform set_config('request.jwt.claim.sub', v_uno::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_uno, 'role', 'authenticated')::text, true);
  if auth.uid() is distinct from v_uno or cem_can_read_all() then
    raise exception 'PRUEBA_FALLA: no se pudo hacer pasar la prueba por el estudiante 1';
  end if;
  v_mi := public.cem_mi_acceso();

  v_n := v_n + 1;
  if (v_mi -> c_cancelada_cero::text) is not null or (v_mi -> c_cancelada_pagada::text) is not null then
    v_fallos := v_fallos || 'cem_mi_acceso enseña una inscripción cancelada'::text;
  end if;

  -- Congelada y suspendida sí salen, cerradas y con su estado: es lo que deja
  -- a la pantalla decir por qué en vez de pedir «el primer pago».
  for r in select * from (values
      ('congelada',  c_congelada_cero),
      ('congelada',  c_congelada_pagada),
      ('suspendida', c_suspendida_cero),
      ('suspendida', c_suspendida_pagada)
    ) as t(estado, id)
  loop
    v_n := v_n + 1;
    if (v_mi -> r.id::text ->> 'abierto') is distinct from 'false'
       or (v_mi -> r.id::text ->> 'estado') is distinct from r.estado then
      v_fallos := v_fallos || format('cem_mi_acceso: la %s debería salir cerrada y con su estado (sale %s)',
                                     r.estado, coalesce(v_mi -> r.id::text, 'null'::jsonb));
    end if;
  end loop;

  -- Las puertas de verdad preguntan «¿tiene ALGUNA inscripción abierta en este
  -- curso?». Quien sólo tiene cerradas no pasa; quien tiene una abierta, sí.
  if v_leccion is not null then
    v_n := v_n + 2;
    if public.cem_puede_ver_leccion(v_leccion) then
      v_fallos := v_fallos || 'quien sólo tiene inscripciones cerradas puede ver la lección'::text;
    end if;
    if public.cem_material_lecciones(array[v_leccion]) <> '{}'::jsonb then
      v_fallos := v_fallos || 'a quien sólo tiene inscripciones cerradas se le entrega el material'::text;
    end if;

    perform set_config('request.jwt.claim.sub', v_dos::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_dos, 'role', 'authenticated')::text, true);
    if auth.uid() is distinct from v_dos or cem_can_read_all() then
      raise exception 'PRUEBA_FALLA: no se pudo hacer pasar la prueba por el estudiante 2';
    end if;
    v_n := v_n + 1;
    if not public.cem_puede_ver_leccion(v_leccion) then
      v_fallos := v_fallos || 'quien tiene una beca y un pago no puede ver la lección'::text;
    end if;

    /* ── La política de progreso, con el rol con que llega el navegador ──── */
    -- cem_progress_all sólo deja marcar una lección en una inscripción propia
    -- y abierta. Como postgres no se ve: el dueño de la tabla se salta RLS.
    perform set_config('request.jwt.claim.sub', v_uno::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_uno, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    v_n := v_n + 1;
    begin
      insert into cem_lesson_progress (enrollment_id, lesson_id, completado)
      values (c_cancelada_pagada, v_leccion, true);
      v_fallos := v_fallos || 'quien se retiró después de pagar puede seguir marcando lecciones'::text;
    exception when insufficient_privilege then
      if sqlerrm not like '%row-level security%' then
        v_fallos := v_fallos || format('el progreso se negó, pero no por la política: %s', sqlerrm);
      end if;
    end;

    -- Y el control: quien tiene beca sí marca. Sin esto, un permiso de tabla
    -- que faltara haría pasar la de arriba por la razón equivocada.
    perform set_config('request.jwt.claim.sub', v_dos::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_dos, 'role', 'authenticated')::text, true);
    v_n := v_n + 1;
    begin
      insert into cem_lesson_progress (enrollment_id, lesson_id, completado)
      values (c_beca, v_leccion, true);
    exception when others then
      v_fallos := v_fallos || format('quien tiene beca no puede marcar una lección: %s', sqlerrm);
    end;
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  if cardinality(v_fallos) > 0 then
    raise exception 'PRUEBA_FALLA: % de % comprobaciones: %',
      cardinality(v_fallos), v_n, array_to_string(v_fallos, ' | ');
  end if;
  raise exception 'PRUEBA_OK: % comprobaciones (con lección: %)', v_n, v_leccion is not null;
end
$prueba$;
