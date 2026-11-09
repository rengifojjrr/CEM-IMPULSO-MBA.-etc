/* Las clases en vivo, los adjuntos y la lista del almacén, por la regla del aula.
   ==========================================================================
   Desde la migración 20261108000003, una clase en vivo (cem_classes), un
   adjunto (cem_media) y la lista del depósito cem-assets ya no los lee
   cualquiera con sesión: las clases y los adjuntos, quien tiene el aula
   abierta o es del equipo; la lista del depósito, el equipo y cada cual su
   carpeta. Y cem_avisar_de_clase sólo avisa a quien puede entrar. Esto lo
   prueba contra la base de verdad, con datos de mentira que nunca llegan a
   guardarse.

   CÓMO SE CORRE
   Como pruebas/sql/acceso-abierto.sql: entera, de una vez, en Supabase → SQL
   Editor o con la herramienta execute_sql. Siempre termina en ERROR, a
   propósito: es lo que deshace todo lo que creó (la cohorte, la clase, los
   adjuntos, las inscripciones y su pago, el profesor y sus asignaciones, la
   ficha de mentira del almacén, la asistencia, la valoración, los avisos y
   los correos en cola). Ningún disparador de esas tablas sale de la
   transacción: ni net.http, ni dblink, ni pg_notify.
     · «PRUEBA_OK: …»     todo como debe.
     · «PRUEBA_FALLA: …»  la lista de lo que no.
   Cualquier otro error es un fallo de la prueba misma, no de la regla.

   QUÉ NECESITA
   Un curso, una persona del equipo y cuatro estudiantes activos sin ninguna
   inscripción en ese curso ni ninguna clase asignada. Los busca ella: aquí
   no se escribe el id de nadie. La cohorte, la clase y los adjuntos los crea
   ella, así que nada real tapa el resultado.
   Hoy no hay ningún profesor en la base, así que uno de los cuatro hace de
   profesor: se le cambia el rol dentro de la transacción, sin nadie delante
   (el camino del servidor, que el disparador del rol deja pasar), y se
   deshace con todo lo demás.

   EL ALMACÉN
   No se toca ningún archivo. Se añade a storage.objects una ficha de mentira,
   sin archivo detrás, en la carpeta perfiles/<uid>/ de un estudiante, y se
   deshace con el resto. Que las direcciones públicas sigan sirviendo no se
   puede probar desde aquí: el almacén las sirve sin pasar por las políticas.

   QUIÉN PREGUNTA
   Cada cambio de persona fija request.jwt.claim.sub y request.jwt.claims y
   se comprueba enseguida: si no se pudo ser esa persona, la prueba se para
   en vez de probar otra cosa. Las lecturas se hacen con el rol con que llega
   el navegador —authenticated, o anon sin sesión—: postgres se salta RLS y
   no probaría nada.

   LO QUE COMPRUEBA
     la clase y        el equipo y el profesor lo ven todo; quien da clase en
     los adjuntos      la cohorte sin ser del equipo ve la clase; quien tiene
                       el aula abierta ve la clase y los adjuntos visibles,
                       no el oculto; quien sólo la tiene cerrada no ve nada;
                       sin sesión no se ve nada, y sin error.
     el aviso          cem_avisar_de_clase avisa a la abierta y no a la
                       congelada, y dice a cuántas avisó.
     lo que se apoya   cem_att_write y cem_valoraciones_las_mias miran
     en las clases     cem_classes con los permisos de quien pregunta: el
                       profesor sigue pasando asistencia, y quien tiene el
                       aula abierta sigue leyendo la suya y valorando la clase.
     el depósito       un estudiante lista sólo su carpeta; el profesor
                       tampoco lista; el equipo, todo; y sin sesión, nada.
                       Sin sesión, hoy, storage.objects ni se deja leer: otra
                       política del depósito, de otra aplicación de este
                       proyecto, llama a una función que anon no puede
                       ejecutar. Ese error tapa el resultado, así que además
                       se lee la regla en el catálogo: ninguna política que
                       alcance a quien no tiene sesión puede nombrar
                       cem-assets. El OK lo dice cuando pasa. */

do $prueba$
declare
  v_curso      uuid;
  v_equipo     uuid;
  v_est        uuid[];
  v_cerrado    uuid;   -- sólo tiene inscripciones que no abren el aula
  v_abierto    uuid;   -- tiene una inscripción activa
  v_profe      uuid;   -- se hace profesor aquí dentro
  v_asignado   uuid;   -- da clase en la cohorte sin ser del equipo
  v_cohorte    uuid;
  v_clase      uuid;
  m_visible    uuid;   -- marcado «visible para todos los estudiantes del curso»
  m_sin_marca  uuid;   -- publico vacío: cuenta como visible
  m_oculto     uuid;   -- publico = false: sólo el equipo
  e_abierta    uuid;
  e_congelada  uuid;
  v_ficha      text;   -- la ficha de mentira del almacén
  v_total      integer;
  v_mias       integer;
  v_del_profe  integer;
  v_avisados   integer;
  v_vistos     text;
  v_nota       text;   -- por qué no se pudo contar sin sesión, si pasa
  v_k          integer;
  v_n          integer := 0;
  v_fallos     text[] := '{}';
  r record;
begin
  -- Nadie delante: el pase del equipo no se puede colar en lo que no es suyo.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if auth.uid() is not null then
    raise exception 'PRUEBA_FALLA: la sesión ya tiene identidad (%) y así no se puede probar la regla', auth.uid();
  end if;

  select id into v_curso from cem_courses order by (precio > 0) desc, created_at limit 1;
  select id into v_equipo from cem_profiles
   where activo and rol in ('admin', 'superadmin', 'coordinador')
   order by created_at limit 1;
  select array_agg(x.id order by x.created_at) into v_est
    from (select p.id, p.created_at from cem_profiles p
           where p.rol = 'estudiante' and p.activo
             and not exists (select 1 from cem_enrollments e
                              where e.profile_id = p.id and e.course_id = v_curso)
             and not exists (select 1 from cem_teacher_assignments t
                              where t.teacher_id = p.id)
           order by p.created_at limit 4) x;
  v_cerrado := v_est[1]; v_abierto := v_est[2]; v_profe := v_est[3]; v_asignado := v_est[4];
  if v_curso is null or v_equipo is null or v_asignado is null then
    raise exception 'PRUEBA_FALLA: faltan datos para probar (curso %, equipo %, % estudiantes de 4)',
      v_curso, v_equipo, coalesce(cardinality(v_est), 0);
  end if;

  /* ── El escenario ──────────────────────────────────────────────────────── */
  insert into cem_cohorts (course_id, codigo, nombre)
  values (v_curso, 'PRUEBA-' || left(gen_random_uuid()::text, 8), 'Prueba · clases y adjuntos')
  returning id into v_cohorte;

  insert into cem_classes (cohort_id, titulo, fecha, hora_inicio, hora_fin, url_sesion, grabacion_url)
  values (v_cohorte, 'Prueba · sesión en vivo', current_date + 7, '18:00', '19:30',
          'https://ejemplo.invalid/sesion', 'https://ejemplo.invalid/grabacion')
  returning id into v_clase;

  insert into cem_media (nombre, url, course_id, publico)
  values ('Prueba · visible', 'https://ejemplo.invalid/visible.pdf', v_curso, true)
  returning id into m_visible;
  insert into cem_media (nombre, url, course_id, publico)
  values ('Prueba · sin marcar', 'https://ejemplo.invalid/sin-marcar.pdf', v_curso, null)
  returning id into m_sin_marca;
  insert into cem_media (nombre, url, course_id, publico)
  values ('Prueba · oculto', 'https://ejemplo.invalid/oculto.pdf', v_curso, false)
  returning id into m_oculto;

  -- Quien tiene el aula cerrada la tiene cerrada de todas las formas, en la
  -- cohorte de la clase y en el curso de los adjuntos. La congelada pagó una
  -- cuota antes de pausar: es la que antes seguía recibiendo los avisos.
  insert into cem_enrollments (profile_id, course_id, cohort_id, estado, precio_lista, precio_final, moneda)
  values (v_cerrado, v_curso, v_cohorte, 'activa', 100, 100, 'EUR') returning id into e_congelada;
  insert into cem_payments (enrollment_id, monto, moneda, estado)
  values (e_congelada, 100, 'EUR', 'confirmado');
  update cem_enrollments set estado = 'congelada' where id = e_congelada;
  insert into cem_enrollments (profile_id, course_id, cohort_id, estado, precio_lista, precio_final, moneda)
  values (v_cerrado, v_curso, v_cohorte, 'suspendida', 100, 100, 'EUR'),
         (v_cerrado, v_curso, v_cohorte, 'cancelada',  100, 0,   'EUR'),
         (v_cerrado, v_curso, v_cohorte, 'pendiente',  100, 100, 'EUR');

  -- Quien la tiene abierta.
  insert into cem_enrollments (profile_id, course_id, cohort_id, estado, precio_lista, precio_final, moneda)
  values (v_abierto, v_curso, v_cohorte, 'activa', 100, 100, 'EUR') returning id into e_abierta;

  -- El profesor de la cohorte. Y quien da clase en ella sin ser del equipo:
  -- prueba sola la rama de cem_docente_de_cohorte, que con un profesor de
  -- verdad quedaría tapada por cem_can_read_all.
  update cem_profiles set rol = 'profesor' where id = v_profe;
  insert into cem_teacher_assignments (teacher_id, cohort_id) values (v_profe, v_cohorte);
  insert into cem_teacher_assignments (teacher_id, cohort_id) values (v_asignado, v_cohorte);

  -- La ficha del almacén, en la carpeta de quien tiene el aula abierta.
  v_ficha := format('perfiles/%s/prueba-%s.jpg', v_abierto, gen_random_uuid());
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('cem-assets', v_ficha, v_abierto::text, '{"mimetype": "image/jpeg", "size": 1}'::jsonb);
  select count(*) into v_total from storage.objects where bucket_id = 'cem-assets';
  select count(*) into v_mias from storage.objects
   where bucket_id = 'cem-assets' and name like format('perfiles/%s/%%', v_abierto);
  select count(*) into v_del_profe from storage.objects
   where bucket_id = 'cem-assets' and name like format('perfiles/%s/%%', v_profe);

  if v_cohorte is null or v_clase is null or m_visible is null or m_sin_marca is null
     or m_oculto is null or e_congelada is null or e_abierta is null then
    raise exception 'PRUEBA_FALLA: no se pudo montar el escenario de prueba';
  end if;

  /* ── El aviso de la clase ──────────────────────────────────────────────── */
  perform set_config('request.jwt.claim.sub', v_equipo::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_equipo, 'role', 'authenticated')::text, true);
  if auth.uid() is distinct from v_equipo or not cem_is_staff() then
    raise exception 'PRUEBA_FALLA: no se pudo hacer pasar la prueba por el equipo';
  end if;
  v_avisados := public.cem_avisar_de_clase(v_clase, null);

  v_n := v_n + 1;
  select count(*) into v_k from cem_notificaciones
   where tipo = 'clase_en_vivo' and url like '%' || v_clase::text and profile_id = v_cerrado;
  if v_k > 0 then
    v_fallos := v_fallos || format('cem_avisar_de_clase avisa a quien sólo tiene el aula cerrada '
                                   || '(%s aviso): la congelada ya no puede entrar', v_k);
  end if;
  v_n := v_n + 1;
  select count(*) into v_k from cem_notificaciones
   where tipo = 'clase_en_vivo' and url like '%' || v_clase::text and profile_id = v_abierto;
  if v_k <> 1 then
    v_fallos := v_fallos || format('cem_avisar_de_clase tenía que avisar una vez a quien tiene '
                                   || 'el aula abierta, y avisó %s', v_k);
  end if;
  v_n := v_n + 1;
  if v_avisados is distinct from 1 then
    v_fallos := v_fallos || format('cem_avisar_de_clase le dice al profesor que avisó a %s, '
                                   || 'y sólo una inscripción puede entrar', v_avisados);
  end if;

  /* ── La regla del depósito, leída en el catálogo ───────────────────────── */
  -- Ninguna política de lectura que alcance a quien no tiene sesión puede
  -- nombrar cem-assets. Es la mitad de «sin sesión no se lista» que no tapa
  -- el error de la otra aplicación (ver arriba).
  v_n := v_n + 1;
  select count(*) into v_k from pg_policies
   where schemaname = 'storage' and tablename = 'objects' and cmd in ('SELECT', 'ALL')
     and roles && array['public', 'anon']::name[] and qual like '%cem-assets%';
  if v_k > 0 then
    v_fallos := v_fallos || format('%s política(s) dejan listar cem-assets sin sesión', v_k);
  end if;

  /* ── Lo que ve cada quien, con el rol del navegador ────────────────────── */
  perform set_config('role', 'authenticated', true);
  for r in select * from (values
      ('el equipo',                         v_equipo,   true,  1,
       'el visible, el sin marcar, el oculto'),
      ('el profesor de la cohorte',         v_profe,    true,  1,
       'el visible, el sin marcar, el oculto'),
      ('quien da clase en la cohorte sin ser del equipo', v_asignado, false, 1, null),
      ('quien tiene el aula abierta',       v_abierto,  false, 1, 'el visible, el sin marcar'),
      ('quien sólo tiene el aula cerrada',  v_cerrado,  false, 0, 'ninguno')
    ) as t(quien, id, lee_todo, clases, adjuntos)
  loop
    perform set_config('request.jwt.claim.sub', r.id::text, true);
    perform set_config('request.jwt.claims',
      json_build_object('sub', r.id, 'role', 'authenticated')::text, true);
    if auth.uid() is distinct from r.id or cem_can_read_all() is distinct from r.lee_todo then
      raise exception 'PRUEBA_FALLA: no se pudo hacer pasar la prueba por %', r.quien;
    end if;

    v_n := v_n + 1;
    select count(*) into v_k from cem_classes where id = v_clase;
    if v_k <> r.clases then
      v_fallos := v_fallos || format('%s %s la clase en vivo', r.quien,
                                     case when v_k > 0 then 've' else 'no ve' end);
    end if;

    if r.adjuntos is not null then
      v_n := v_n + 1;
      select coalesce(string_agg(t.que, ', ' order by t.orden), 'ninguno') into v_vistos
        from cem_media d
        join (values (m_visible, 1, 'el visible'), (m_sin_marca, 2, 'el sin marcar'),
                     (m_oculto, 3, 'el oculto')) as t(id, orden, que) on t.id = d.id;
      if v_vistos is distinct from r.adjuntos then
        v_fallos := v_fallos || format('de los adjuntos, %s ve: %s (tenía que ver: %s)',
                                       r.quien, v_vistos, r.adjuntos);
      end if;
    end if;
  end loop;

  /* ── Lo que se apoya en las clases ─────────────────────────────────────── */
  -- Si la clase dejara de verse para quien la usa, estas dos políticas se
  -- negarían sin decir por qué.
  perform set_config('request.jwt.claim.sub', v_profe::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_profe, 'role', 'authenticated')::text, true);
  if auth.uid() is distinct from v_profe or not cem_is_teacher() then
    raise exception 'PRUEBA_FALLA: no se pudo hacer pasar la prueba por el profesor';
  end if;
  v_n := v_n + 1;
  begin
    insert into cem_attendance (class_id, enrollment_id, presente, minutos)
    values (v_clase, e_abierta, true, 90);
  exception when others then
    v_fallos := v_fallos || format('el profesor de la cohorte no puede pasar asistencia: %s', sqlerrm);
  end;

  -- Y el depósito, que el profesor tampoco lista: es cosa de quien sube ahí.
  v_n := v_n + 1;
  select count(*) into v_k from storage.objects where bucket_id = 'cem-assets';
  if v_k <> v_del_profe then
    v_fallos := v_fallos || format('el profesor lista %s archivos de cem-assets, y suyos son %s',
                                   v_k, v_del_profe);
  end if;

  perform set_config('request.jwt.claim.sub', v_abierto::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_abierto, 'role', 'authenticated')::text, true);
  if auth.uid() is distinct from v_abierto or cem_can_read_all() then
    raise exception 'PRUEBA_FALLA: no se pudo hacer pasar la prueba por quien tiene el aula abierta';
  end if;
  v_n := v_n + 1;
  begin
    select count(*) into v_k from cem_attendance where class_id = v_clase;
    if v_k <> 1 then
      v_fallos := v_fallos || format('quien tiene el aula abierta ve %s registros de su asistencia, '
                                     || 'y tiene 1', v_k);
    end if;
  exception when others then
    v_fallos := v_fallos || format('quien tiene el aula abierta no puede leer su asistencia: %s', sqlerrm);
  end;
  v_n := v_n + 1;
  begin
    insert into cem_valoraciones (class_id, cohort_id, profile_id, claridad, utilidad, ritmo)
    values (v_clase, v_cohorte, v_abierto, 5, 4, 5);
  exception when others then
    v_fallos := v_fallos || format('quien tiene el aula abierta no puede valorar la clase: %s', sqlerrm);
  end;

  /* ── La lista del depósito ─────────────────────────────────────────────── */
  -- Un estudiante (sigue siendo quien tiene el aula abierta): sólo lo suyo.
  v_n := v_n + 1;
  select count(*) into v_k from storage.objects where bucket_id = 'cem-assets';
  if v_k <> v_mias then
    v_fallos := v_fallos || format('un estudiante lista %s archivos de cem-assets, y suyos son %s',
                                   v_k, v_mias);
  end if;
  v_n := v_n + 1;
  select count(*) into v_k from storage.objects where bucket_id = 'cem-assets' and name = v_ficha;
  if v_k <> 1 then
    v_fallos := v_fallos || 'un estudiante ya no ve lo de su propia carpeta perfiles/<uid>/'::text;
  end if;

  -- El equipo: todo, que es quien sube, cambia y borra ahí.
  perform set_config('request.jwt.claim.sub', v_equipo::text, true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_equipo, 'role', 'authenticated')::text, true);
  if auth.uid() is distinct from v_equipo or not cem_is_staff() then
    raise exception 'PRUEBA_FALLA: no se pudo volver a ser del equipo';
  end if;
  v_n := v_n + 1;
  select count(*) into v_k from storage.objects where bucket_id = 'cem-assets';
  if v_k <> v_total then
    v_fallos := v_fallos || format('el equipo lista %s archivos de cem-assets, y hay %s', v_k, v_total);
  end if;

  /* ── Sin sesión ────────────────────────────────────────────────────────── */
  -- Leer tiene que dar cero filas, no un error: una pantalla pública que
  -- tocara estas tablas se rompería entera.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  if auth.uid() is not null then
    raise exception 'PRUEBA_FALLA: no se pudo quitar la identidad para probar sin sesión';
  end if;
  v_n := v_n + 1;
  begin
    select count(*) into v_k from cem_classes where id = v_clase;
    if v_k > 0 then
      v_fallos := v_fallos || 'sin sesión se ve la clase en vivo'::text;
    end if;
  exception when others then
    v_fallos := v_fallos || format('leer cem_classes sin sesión da error: %s', sqlerrm);
  end;
  v_n := v_n + 1;
  begin
    select count(*) into v_k from cem_media where id in (m_visible, m_sin_marca, m_oculto);
    if v_k > 0 then
      v_fallos := v_fallos || format('sin sesión se ven %s adjuntos', v_k);
    end if;
  exception when others then
    v_fallos := v_fallos || format('leer cem_media sin sesión da error: %s', sqlerrm);
  end;
  v_n := v_n + 1;
  begin
    select count(*) into v_k from storage.objects where bucket_id = 'cem-assets';
    if v_k > 0 then
      v_fallos := v_fallos || format('sin sesión se listan %s archivos de cem-assets', v_k);
    end if;
  exception when insufficient_privilege then
    -- No se llega a contar (ver la cabecera): tampoco se lista nada. Lo que
    -- lo asegura de verdad es la comprobación del catálogo, más arriba.
    v_nota := sqlerrm;
  end;

  if cardinality(v_fallos) > 0 then
    raise exception 'PRUEBA_FALLA: % de % comprobaciones: %',
      cardinality(v_fallos), v_n, array_to_string(v_fallos, ' | ');
  end if;
  raise exception 'PRUEBA_OK: % comprobaciones%', v_n,
    case when v_nota is null then ''
         else format(' (sin sesión, storage.objects no se deja leer: «%s»)', v_nota) end;
end
$prueba$;
