/* Pausar, reactivar, suspender y retirarse con beca, caso por caso.
   ==========================================================================
   Lo que comprueba (migración 20261108000004_reactivar_y_becas):
     · Que Mi perfil pueda pedir: queda una sola
       cem_solicitar_cambio_inscripcion, y la llamada de la pantalla (cuatro
       parámetros con nombre) encaja en ella. Con dos, PostgREST contesta
       PGRST203; aquí se ve como 42725, «is not unique».
     · Que reactivar devuelva la inscripción a como estaba antes de la pausa:
       la pendiente sin pagar vuelve pendiente, y cerrada; la activa, activa;
       la pendiente que pagó durante la pausa, activa. Sin apunte (congelada a
       mano), decide el dinero.
     · Que una suspendida no pida pausa ni reactivación, ni nadie «reactive» lo
       que no está en pausa; y que aprobar mire el estado de ahora: lo pedido
       estando activa no se congela si entre medias el equipo la suspendió, no
       se reactiva lo que ya no está en pausa, no se retira lo ya cancelado.
     · Que la beca se vaya con quien se retira, por cualquier camino: la
       retirada que aprueba coordinación, la baja del propio estudiante
       (cem_cancelar_inscripcion) y el estado puesto a mano en Admin →
       Estudiante, que es un update directo como authenticated. Si la pagaba el
       fondo, el dinero vuelve al fondo, una sola vez.
     · Que cem_beca_revocar siga contestando lo que vuelve al fondo y que la
       beca no se revoque dos veces.

   CÓMO SE CORRE
   Como acceso-abierto.sql: entera, de una vez, en Supabase → SQL Editor o con
   la herramienta execute_sql. Siempre termina en ERROR, a propósito: es lo
   que deshace todo lo que creó (inscripciones, cuotas, pagos, solicitudes,
   becas, la donación de prueba y sus movimientos del fondo, los avisos y
   correos en cola, y el coordinador de prueba si hizo falta). Ningún
   disparador de esas tablas sale de la transacción.
     · «PRUEBA_OK: …»     todo como debe.
     · «PRUEBA_FALLA: …»  la lista de lo que no.
   Cualquier otro error es un fallo de la prueba misma, no de lo que prueba.

   QUÉ NECESITA
   Un curso de pago, alguien de admin y siete estudiantes activos sin ninguna
   inscripción en él: las becas eligen «la inscripción abierta de esa persona
   en ese curso», y una real la confundiría. Si no hay nadie de coordinación,
   el séptimo estudiante lo es mientras dura la prueba: la retirada tiene que
   poder aprobarla coordinación, que no puede revocar becas.
   Las becas y la donación de prueba llevan número negativo. Esos números
   salen de una secuencia, que no vuelve atrás al deshacer: así la prueba no
   gasta números de verdad (BEC-…, DON-…).

   QUIÉN PREGUNTA
   Como en acceso-abierto.sql: cada cambio de persona fija
   request.jwt.claim.sub y request.jwt.claims, y se comprueba enseguida con
   auth.uid(); lo hace pg_temp.prueba_ser, que se crea aquí y se va con todo
   lo demás. El rol no cambia (postgres), sólo quién dice ser, salvo en el
   caso del update directo, que va con el rol del navegador. */

do $prueba$
declare
  v_curso  uuid;
  v_admin  uuid;
  v_coord  uuid;
  v_est    uuid[];
  v_n      integer := 0;
  v_fallos text[] := '{}';
  v_sol    uuid;
  v_err    text;
  v_txt    text;
  v_num    numeric;
  v_r      jsonb;
  v_filas  integer;
  v_disp0  numeric;
  r        record;
  -- Las inscripciones sin beca, todas del estudiante 1.
  e_perfil      uuid;   -- pide la pausa como lo hace Mi perfil
  e_pendiente   uuid;   -- pendiente sin pagar: pausa y reactivación
  e_activa      uuid;   -- pagada y activa: pausa y reactivación
  e_pago_pausa  uuid;   -- pendiente que paga durante la pausa
  e_legado_pago uuid;   -- congelada a mano, con pago: sin apunte
  e_legado_sin  uuid;   -- congelada a mano, sin pago: sin apunte
  e_suspendida  uuid;   -- suspendida: no pide pausa ni reactivación
  e_sin_pausa   uuid;   -- activa: no tiene nada que reactivar
  e_susp_luego  uuid;   -- pide la pausa activa; la suspenden antes de aprobar
  e_react_luego uuid;   -- pide reactivar en pausa; la suspenden antes de aprobar
  e_ret_luego   uuid;   -- pide retirarse; la cancelan antes de aprobar
  -- Las becas, cada una de una persona: (beca, inscripción).
  d_prueba uuid;                -- la donación que pone dinero en el fondo
  b_cem   uuid; e_cem   uuid;   -- del CEM; se retira, lo aprueba coordinación
  b_fondo uuid; e_fondo uuid;   -- del fondo; ídem
  b_rev   uuid; e_rev   uuid;   -- del fondo; la revoca admin (cem_beca_revocar)
  b_mano  uuid; e_mano  uuid;   -- del fondo; el equipo pone «cancelada» a mano
  b_baja  uuid; e_baja  uuid;   -- del CEM; la persona se da de baja ella misma
begin
  -- Ser alguien: los dos ajustes que lee auth.uid(), comprobados enseguida.
  -- Si no se pudo ser esa persona, la prueba se para en vez de probar otra cosa.
  execute $f$
    create function pg_temp.prueba_ser(p_id uuid, p_quien text) returns void
    language plpgsql as $c$
    begin
      perform set_config('request.jwt.claim.sub', coalesce(p_id::text, ''), true);
      perform set_config('request.jwt.claims',
        case when p_id is null then ''
             else json_build_object('sub', p_id, 'role', 'authenticated')::text end, true);
      if auth.uid() is distinct from p_id then
        raise exception 'PRUEBA_FALLA: no se pudo hacer pasar la prueba por %', p_quien;
      end if;
    end $c$;
  $f$;
  perform pg_temp.prueba_ser(null, 'nadie');

  select id into v_curso from cem_courses order by (precio > 0) desc, created_at limit 1;
  select id into v_admin from cem_profiles
   where activo and rol in ('admin', 'superadmin') order by created_at limit 1;
  select id into v_coord from cem_profiles
   where activo and rol = 'coordinador' order by created_at limit 1;
  select array_agg(x.id order by x.created_at) into v_est
    from (select p.id, p.created_at from cem_profiles p
           where p.rol = 'estudiante' and p.activo
             and not exists (select 1 from cem_enrollments e
                              where e.profile_id = p.id and e.course_id = v_curso)
           order by p.created_at limit 7) x;
  if v_curso is null or v_admin is null or coalesce(cardinality(v_est), 0) < 7 then
    raise exception 'PRUEBA_FALLA: faltan datos para probar (curso %, admin %, % estudiantes de 7)',
      v_curso, v_admin, coalesce(cardinality(v_est), 0);
  end if;
  if v_coord is null then
    -- Sin sesión, cambiar el rol es el servidor actuando. Se deshace con todo.
    v_coord := v_est[7];
    update cem_profiles set rol = 'coordinador' where id = v_coord;
  end if;
  perform pg_temp.prueba_ser(v_coord, 'coordinación');
  if not cem_is_staff() or cem_es_admin() then
    raise exception 'PRUEBA_FALLA: quien aprueba tiene que ser de coordinación, sin poder de admin';
  end if;
  perform pg_temp.prueba_ser(null, 'nadie');

  /* ── 1. Mi perfil puede pedir ──────────────────────────────────────────── */
  v_n := v_n + 1;
  select count(*) into v_num from pg_proc
   where pronamespace = 'public'::regnamespace and proname = 'cem_solicitar_cambio_inscripcion';
  if v_num <> 1 then
    v_fallos := v_fallos || format('hay %s cem_solicitar_cambio_inscripcion y tiene que quedar una', v_num);
  end if;

  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_est[1], v_curso, 'activa', 100, 100, 'EUR') returning id into e_perfil;
  perform pg_temp.prueba_ser(v_est[1], 'el estudiante 1');
  v_n := v_n + 1;
  begin
    -- Lo mismo que manda plataforma/assets/perfil.js: cuatro, con nombre.
    v_sol := public.cem_solicitar_cambio_inscripcion(
      p_enrollment_id => e_perfil, p_tipo => 'congelamiento',
      p_motivo => 'Prueba automática: pedir la pausa desde Mi perfil.', p_hasta => null::date);
    if not exists (select 1 from cem_solicitudes_inscripcion where id = v_sol and estado = 'pendiente') then
      v_fallos := v_fallos || 'la llamada de Mi perfil no deja ninguna solicitud'::text;
    end if;
  exception when others then
    v_fallos := v_fallos || format('la llamada de Mi perfil no se puede hacer (%s %s)', sqlstate, sqlerrm);
  end;

  /* ── 2. Las inscripciones de prueba sin beca ───────────────────────────── */
  perform pg_temp.prueba_ser(null, 'nadie');
  -- Pendiente sin pagar, con su cuota por vencer.
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_est[1], v_curso, 'pendiente', 100, 100, 'EUR') returning id into e_pendiente;
  insert into cem_installments (enrollment_id, numero, monto, saldo, moneda, fecha_vencimiento, estado)
  values (e_pendiente, 1, 100, 100, 'EUR', current_date + 30, 'pendiente');
  -- Pagada: cem_tg_activar_al_pagar la pasa a activa. Y la que pagará en la pausa.
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_est[1], v_curso, 'pendiente', 100, 100, 'EUR') returning id into e_activa;
  insert into cem_payments (enrollment_id, monto, moneda, estado) values (e_activa, 100, 'EUR', 'confirmado');
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_est[1], v_curso, 'pendiente', 100, 100, 'EUR') returning id into e_pago_pausa;
  -- Congeladas a mano, sin solicitud: lo de antes de este cambio.
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_est[1], v_curso, 'pendiente', 100, 100, 'EUR') returning id into e_legado_pago;
  insert into cem_payments (enrollment_id, monto, moneda, estado) values (e_legado_pago, 100, 'EUR', 'confirmado');
  update cem_enrollments set estado = 'congelada' where id = e_legado_pago;
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_est[1], v_curso, 'congelada', 100, 100, 'EUR') returning id into e_legado_sin;
  -- Suspendida, y una activa que no tiene nada que reactivar.
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_est[1], v_curso, 'suspendida', 100, 100, 'EUR') returning id into e_suspendida;
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_est[1], v_curso, 'activa', 100, 100, 'EUR') returning id into e_sin_pausa;
  -- Las que el equipo toca entre la solicitud y la aprobación.
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_est[1], v_curso, 'activa', 100, 100, 'EUR') returning id into e_susp_luego;
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_est[1], v_curso, 'congelada', 100, 100, 'EUR') returning id into e_react_luego;
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_est[1], v_curso, 'activa', 100, 100, 'EUR') returning id into e_ret_luego;

  v_n := v_n + 1;
  if (select estado::text from cem_enrollments where id = e_activa) <> 'activa'
     or (select estado::text from cem_enrollments where id = e_legado_pago) <> 'congelada' then
    v_fallos := v_fallos || 'las inscripciones de prueba no quedaron como hacía falta: la prueba no prueba lo que dice'::text;
  end if;

  /* ── 3. Pendiente sin pagar: pausa y vuelta, y sigue cerrada ───────────── */
  begin
    perform pg_temp.prueba_ser(v_est[1], 'el estudiante 1');
    v_sol := cem_solicitar_cambio_inscripcion(p_enrollment_id => e_pendiente, p_tipo => 'congelamiento',
      p_motivo => 'Prueba automática: pausa sin haber pagado.', p_hasta => null::date, p_cuotas => null::integer);
    perform pg_temp.prueba_ser(v_coord, 'coordinación');
    perform cem_resolver_solicitud_inscripcion(v_sol, true, null);

    v_n := v_n + 3;
    if (select estado::text from cem_enrollments where id = e_pendiente) <> 'congelada' then
      v_fallos := v_fallos || 'la pausa aprobada de una pendiente no la deja congelada'::text;
    end if;
    if (select estado::text from cem_installments where enrollment_id = e_pendiente) <> 'congelada' then
      v_fallos := v_fallos || 'la pausa no congela la cuota que todavía no venció'::text;
    end if;
    select datos ->> 'estado_previo' into v_txt from cem_solicitudes_inscripcion where id = v_sol;
    if v_txt is distinct from 'pendiente' then
      v_fallos := v_fallos || format('la pausa no apunta de dónde venía (estado_previo: %s, y era pendiente)',
                                     coalesce(v_txt, 'nada'));
    end if;

    perform pg_temp.prueba_ser(v_est[1], 'el estudiante 1');
    v_sol := cem_solicitar_cambio_inscripcion(p_enrollment_id => e_pendiente, p_tipo => 'reactivacion',
      p_motivo => 'Prueba automática: vuelvo.', p_hasta => null::date, p_cuotas => null::integer);
    perform pg_temp.prueba_ser(v_coord, 'coordinación');
    perform cem_resolver_solicitud_inscripcion(v_sol, true, null);

    v_n := v_n + 4;
    select estado::text into v_txt from cem_enrollments where id = e_pendiente;
    if v_txt <> 'pendiente' then
      v_fallos := v_fallos || format('la pendiente sin pagar sale de la pausa %s: tenía que volver pendiente', v_txt);
    end if;
    if public.cem_inscripcion_abierta(e_pendiente) then
      v_fallos := v_fallos || 'la pendiente sin pagar abre el aula después de la pausa'::text;
    end if;
    if (select estado::text from cem_installments where enrollment_id = e_pendiente) <> 'pendiente' then
      v_fallos := v_fallos || 'la reactivación no devuelve la cuota congelada a pendiente'::text;
    end if;
    if not exists (select 1 from cem_notificaciones
                    where profile_id = v_est[1] and tipo = 'solicitud_inscripcion'
                      and titulo ilike '%reactivacion fue aprobada%')
       or not exists (select 1 from cem_audit_events
                       where accion = 'solicitud_reactivacion_aprobada' and entidad_id = e_pendiente) then
      v_fallos := v_fallos || 'la reactivación aprobada ya no avisa al estudiante o no deja su apunte en la auditoría'::text;
    end if;
  exception when others then
    v_fallos := v_fallos || format('el caso «pendiente sin pagar» se cortó: %s', sqlerrm);
  end;

  /* ── 4. Activa y pagada: pausa y vuelta, activa y abierta ──────────────── */
  begin
    perform pg_temp.prueba_ser(v_est[1], 'el estudiante 1');
    v_sol := cem_solicitar_cambio_inscripcion(p_enrollment_id => e_activa, p_tipo => 'congelamiento',
      p_motivo => 'Prueba automática: pausa con todo pagado.', p_hasta => null::date, p_cuotas => null::integer);
    perform pg_temp.prueba_ser(v_coord, 'coordinación');
    perform cem_resolver_solicitud_inscripcion(v_sol, true, null);
    v_n := v_n + 2;
    if (select estado::text from cem_enrollments where id = e_activa) <> 'congelada' then
      v_fallos := v_fallos || 'la pausa aprobada de una activa no la deja congelada'::text;
    end if;
    if public.cem_inscripcion_abierta(e_activa) then
      v_fallos := v_fallos || 'una congelada pagada abre el aula'::text;
    end if;

    perform pg_temp.prueba_ser(v_est[1], 'el estudiante 1');
    v_sol := cem_solicitar_cambio_inscripcion(p_enrollment_id => e_activa, p_tipo => 'reactivacion',
      p_motivo => 'Prueba automática: vuelvo.', p_hasta => null::date, p_cuotas => null::integer);
    perform pg_temp.prueba_ser(v_coord, 'coordinación');
    perform cem_resolver_solicitud_inscripcion(v_sol, true, null);
    v_n := v_n + 2;
    select estado::text into v_txt from cem_enrollments where id = e_activa;
    if v_txt <> 'activa' then
      v_fallos := v_fallos || format('la activa pagada sale de la pausa %s: tenía que volver activa', v_txt);
    end if;
    if not public.cem_inscripcion_abierta(e_activa) then
      v_fallos := v_fallos || 'la activa pagada no abre el aula después de la pausa'::text;
    end if;
  exception when others then
    v_fallos := v_fallos || format('el caso «activa y pagada» se cortó: %s', sqlerrm);
  end;

  /* ── 5. Pendiente que paga durante la pausa: vuelve activa ─────────────── */
  begin
    perform pg_temp.prueba_ser(v_est[1], 'el estudiante 1');
    v_sol := cem_solicitar_cambio_inscripcion(p_enrollment_id => e_pago_pausa, p_tipo => 'congelamiento',
      p_motivo => 'Prueba automática: pausa antes de pagar.', p_hasta => null::date, p_cuotas => null::integer);
    perform pg_temp.prueba_ser(v_coord, 'coordinación');
    perform cem_resolver_solicitud_inscripcion(v_sol, true, null);
    -- Paga en la pausa: cem_activar_al_pagar sólo activa pendientes, así que sigue congelada.
    perform pg_temp.prueba_ser(null, 'nadie');
    insert into cem_payments (enrollment_id, monto, moneda, estado) values (e_pago_pausa, 100, 'EUR', 'confirmado');
    v_n := v_n + 1;
    if (select estado::text from cem_enrollments where id = e_pago_pausa) <> 'congelada' then
      v_fallos := v_fallos || 'pagar en la pausa sacó la inscripción de la pausa: el caso no prueba lo que dice'::text;
    end if;
    perform pg_temp.prueba_ser(v_est[1], 'el estudiante 1');
    v_sol := cem_solicitar_cambio_inscripcion(p_enrollment_id => e_pago_pausa, p_tipo => 'reactivacion',
      p_motivo => 'Prueba automática: ya pagué, vuelvo.', p_hasta => null::date, p_cuotas => null::integer);
    perform pg_temp.prueba_ser(v_coord, 'coordinación');
    perform cem_resolver_solicitud_inscripcion(v_sol, true, null);
    v_n := v_n + 1;
    select estado::text into v_txt from cem_enrollments where id = e_pago_pausa;
    if v_txt <> 'activa' then
      v_fallos := v_fallos || format('la pendiente que pagó en la pausa vuelve %s: tenía que volver activa', v_txt);
    end if;
  exception when others then
    v_fallos := v_fallos || format('el caso «paga en la pausa» se cortó: %s', sqlerrm);
  end;

  /* ── 6. Congeladas a mano, sin apunte: decide el dinero ────────────────── */
  begin
    for r in select * from (values
        ('congelada a mano con un pago', e_legado_pago, 'activa'),
        ('congelada a mano sin pagar',   e_legado_sin,  'pendiente')
      ) as t(caso, id, espera)
    loop
      perform pg_temp.prueba_ser(v_est[1], 'el estudiante 1');
      v_sol := cem_solicitar_cambio_inscripcion(p_enrollment_id => r.id, p_tipo => 'reactivacion',
        p_motivo => 'Prueba automática: vuelvo.', p_hasta => null::date, p_cuotas => null::integer);
      perform pg_temp.prueba_ser(v_coord, 'coordinación');
      perform cem_resolver_solicitud_inscripcion(v_sol, true, null);
      v_n := v_n + 1;
      select estado::text into v_txt from cem_enrollments where id = r.id;
      if v_txt <> r.espera then
        v_fallos := v_fallos || format('la %s sale de la pausa %s: tenía que quedar %s', r.caso, v_txt, r.espera);
      end if;
    end loop;
  exception when others then
    v_fallos := v_fallos || format('el caso «congelada a mano» se cortó: %s', sqlerrm);
  end;

  /* ── 7. Lo que no se puede pedir ───────────────────────────────────────── */
  perform pg_temp.prueba_ser(v_est[1], 'el estudiante 1');
  -- Una suspendida no sale por la pausa: se le dice por qué.
  for r in select * from (values ('congelamiento'), ('reactivacion')) as t(tipo) loop
    v_n := v_n + 1;
    v_err := null;
    begin
      perform cem_solicitar_cambio_inscripcion(p_enrollment_id => e_suspendida, p_tipo => r.tipo,
        p_motivo => 'Prueba automática: salir de la suspensión por la pausa.', p_hasta => null::date, p_cuotas => null::integer);
    exception when others then v_err := sqlerrm;
    end;
    if v_err is null then
      v_fallos := v_fallos || format('una suspendida puede pedir %s', r.tipo);
    elsif v_err not ilike '%suspendida%' then
      v_fallos := v_fallos || format('a la suspendida que pide %s no se le dice por qué: «%s»', r.tipo, v_err);
    end if;
  end loop;
  v_n := v_n + 1;
  if exists (select 1 from cem_solicitudes_inscripcion where enrollment_id = e_suspendida) then
    v_fallos := v_fallos || 'una solicitud de la suspendida se guardó'::text;
  end if;
  -- Ni se pide «reactivar» lo que nunca estuvo en pausa: aprobado, quedaba activa.
  v_n := v_n + 1;
  v_err := null;
  begin
    perform cem_solicitar_cambio_inscripcion(p_enrollment_id => e_sin_pausa, p_tipo => 'reactivacion',
      p_motivo => 'Prueba automática: reactivar lo que no está en pausa.', p_hasta => null::date, p_cuotas => null::integer);
  exception when others then v_err := sqlerrm;
  end;
  if v_err is null then
    v_fallos := v_fallos || 'se puede pedir reactivar una inscripción que no está en pausa'::text;
  end if;

  /* ── 8. Aprobar mira el estado de ahora ────────────────────────────────── */
  for r in select * from (values
      ('pausa pedida estando activa, suspendida antes de aprobarla',     e_susp_luego,  'congelamiento', 'suspendida'),
      ('reactivación pedida en pausa, suspendida antes de aprobarla',    e_react_luego, 'reactivacion',  'suspendida'),
      ('retiro pedido, cancelada por el equipo antes de aprobarlo',      e_ret_luego,   'retiro',        'cancelada')
    ) as t(caso, id, tipo, equipo)
  loop
    begin
      perform pg_temp.prueba_ser(v_est[1], 'el estudiante 1');
      v_sol := cem_solicitar_cambio_inscripcion(p_enrollment_id => r.id, p_tipo => r.tipo,
        p_motivo => 'Prueba automática: ' || r.caso, p_hasta => null::date, p_cuotas => null::integer);
      perform pg_temp.prueba_ser(null, 'nadie');
      update cem_enrollments set estado = r.equipo::cem_inscripcion_estado where id = r.id;
      perform pg_temp.prueba_ser(v_coord, 'coordinación');
      v_n := v_n + 1;
      v_err := null;
      begin
        perform cem_resolver_solicitud_inscripcion(v_sol, true, null);
      exception when others then v_err := sqlerrm;
      end;
      select estado::text into v_txt from cem_enrollments where id = r.id;
      if v_err is null then
        v_fallos := v_fallos || format('«%s»: se aprueba igual y queda %s', r.caso, v_txt);
      elsif v_txt <> r.equipo
            or (select estado from cem_solicitudes_inscripcion where id = v_sol) <> 'pendiente' then
        v_fallos := v_fallos || format('«%s»: se niega, pero la deja %s', r.caso, v_txt);
      end if;
      -- Lo que le queda al equipo es rechazarla, y eso sigue funcionando.
      v_n := v_n + 1;
      begin
        perform cem_resolver_solicitud_inscripcion(v_sol, false, 'Prueba automática: cambió mientras tanto.');
        if (select estado from cem_solicitudes_inscripcion where id = v_sol) <> 'rechazada' then
          v_fallos := v_fallos || format('«%s»: rechazarla no la cierra', r.caso);
        end if;
      exception when others then
        -- Si se aprobó, ya estaba resuelta: ese fallo ya está apuntado arriba.
        if v_err is not null then
          v_fallos := v_fallos || format('«%s»: después de negarse, rechazarla falla: %s', r.caso, sqlerrm);
        end if;
      end;
    exception when others then
      v_fallos := v_fallos || format('el caso «%s» se cortó: %s', r.caso, sqlerrm);
    end;
  end loop;

  /* ── 9. Las becas ──────────────────────────────────────────────────────── */
  perform pg_temp.prueba_ser(v_admin, 'admin');
  -- Dinero en el fondo, entrado como entra una donación confirmada.
  insert into cem_becas_donaciones (numero, monto, donante_nombre, metodo, estado, referencia,
                                    registrada_por, confirmada_en, confirmada_por)
  values (-1, 1000, 'Prueba automática', 'zelle', 'confirmada', 'PRUEBA-' || gen_random_uuid(),
          v_admin, now(), v_admin)
  returning id into d_prueba;
  perform cem_becas_donacion_entra(d_prueba, v_admin);
  v_disp0 := cem_becas_disponible();

  -- Cinco becas, cada una de una persona, inscritas como las deja cem_becas_crear:
  -- la del fondo, con su dinero apartado antes de inscribir.
  insert into cem_becas (numero, tipo, course_id, nombre, valor, moneda, valor_usd, cambio, estado, otorgada_por)
  values (-1, 'cem', v_curso, 'Prueba automática', 100, 'EUR', 100, 1, 'por_activar', v_admin)
  returning id into b_cem;
  e_cem := cem_becas_inscribir(b_cem, v_est[2], false);

  insert into cem_becas (numero, tipo, course_id, nombre, valor, moneda, valor_usd, cambio, estado, otorgada_por)
  values (-2, 'fondo', v_curso, 'Prueba automática', 100, 'EUR', 100, 1, 'por_activar', v_admin)
  returning id into b_fondo;
  perform cem_becas_reservar(b_fondo, 100, v_admin);
  e_fondo := cem_becas_inscribir(b_fondo, v_est[3], false);

  insert into cem_becas (numero, tipo, course_id, nombre, valor, moneda, valor_usd, cambio, estado, otorgada_por)
  values (-3, 'fondo', v_curso, 'Prueba automática', 80, 'EUR', 80, 1, 'por_activar', v_admin)
  returning id into b_rev;
  perform cem_becas_reservar(b_rev, 80, v_admin);
  e_rev := cem_becas_inscribir(b_rev, v_est[4], false);

  insert into cem_becas (numero, tipo, course_id, nombre, valor, moneda, valor_usd, cambio, estado, otorgada_por)
  values (-4, 'fondo', v_curso, 'Prueba automática', 60, 'EUR', 60, 1, 'por_activar', v_admin)
  returning id into b_mano;
  perform cem_becas_reservar(b_mano, 60, v_admin);
  e_mano := cem_becas_inscribir(b_mano, v_est[5], false);

  insert into cem_becas (numero, tipo, course_id, nombre, valor, moneda, valor_usd, cambio, estado, otorgada_por)
  values (-5, 'cem', v_curso, 'Prueba automática', 100, 'EUR', 100, 1, 'por_activar', v_admin)
  returning id into b_baja;
  e_baja := cem_becas_inscribir(b_baja, v_est[6], false);

  v_n := v_n + 1;
  if cem_becas_disponible() <> v_disp0 - 240
     or exists (select 1 from cem_becas where id in (b_cem, b_fondo, b_rev, b_mano, b_baja) and estado <> 'otorgada')
     or exists (select 1 from cem_enrollments where id in (e_cem, e_fondo, e_rev, e_mano, e_baja)
                 and (estado <> 'activa' or fuente is distinct from 'beca')) then
    v_fallos := v_fallos || 'las becas de prueba no quedaron otorgadas, activas y con su dinero apartado: la prueba no prueba lo que dice'::text;
  end if;

  -- 9a. Retiradas que aprueba coordinación: la del CEM y la del fondo.
  for r in select * from (values
      ('la beca del CEM',   b_cem,   e_cem,   2, 0::numeric),
      ('la beca del fondo', b_fondo, e_fondo, 3, 100::numeric)
    ) as t(caso, beca, id, quien, vuelve)
  loop
    begin
      perform pg_temp.prueba_ser(v_est[r.quien], 'quien tiene ' || r.caso);
      v_sol := cem_solicitar_cambio_inscripcion(p_enrollment_id => r.id, p_tipo => 'retiro',
        p_motivo => 'Prueba automática: me retiro.', p_hasta => null::date, p_cuotas => null::integer);
      perform pg_temp.prueba_ser(v_coord, 'coordinación');
      perform cem_resolver_solicitud_inscripcion(v_sol, true, null);
      v_n := v_n + 3;
      if (select estado::text from cem_enrollments where id = r.id) <> 'cancelada' then
        v_fallos := v_fallos || format('la retirada aprobada no cancela la inscripción con %s', r.caso);
      end if;
      if not exists (select 1 from cem_becas where id = r.beca and estado = 'revocada'
                       and revocada_por = v_coord and revocada_en is not null and motivo ilike 'Se retiró%') then
        v_fallos := v_fallos || format('quien se retira con %s la conserva: sigue %s',
          r.caso, (select estado from cem_becas where id = r.beca));
      end if;
      select count(*), max((detalle ->> 'vuelve_al_fondo')::numeric) into v_filas, v_num
        from cem_audit_events where accion = 'beca.revocada' and entidad_id = r.beca and actor_id = v_coord;
      if v_filas <> 1 or v_num is distinct from r.vuelve then
        v_fallos := v_fallos || format('la retirada con %s deja %s apuntes de «beca.revocada» (dicen que vuelven %s, y vuelven %s)',
          r.caso, v_filas, coalesce(v_num::text, 'nada'), r.vuelve);
      end if;
    exception when others then
      v_fallos := v_fallos || format('la retirada con %s se cortó: %s', r.caso, sqlerrm);
    end;
  end loop;

  -- 9b. Admin revoca con cem_beca_revocar: sigue contestando lo que vuelve.
  begin
    perform pg_temp.prueba_ser(v_admin, 'admin');
    v_r := cem_beca_revocar(b_rev, 'Prueba automática: revocada por el equipo.');
    v_n := v_n + 3;
    if (v_r ->> 'vuelve_al_fondo')::numeric is distinct from 80 then
      v_fallos := v_fallos || format('cem_beca_revocar dice que vuelven %s al fondo, y vuelven 80', v_r ->> 'vuelve_al_fondo');
    end if;
    if not exists (select 1 from cem_becas where id = b_rev and estado = 'revocada'
                     and motivo = 'Prueba automática: revocada por el equipo.' and revocada_por = v_admin)
       or not exists (select 1 from cem_enrollments where id = e_rev and estado = 'cancelada'
                        and precio_final = precio_lista and descuento = 0) then
      v_fallos := v_fallos || 'cem_beca_revocar no deja la beca revocada con su motivo y la inscripción cancelada con su precio'::text;
    end if;
    if (select count(*) from cem_audit_events where accion = 'beca.revocada' and entidad_id = b_rev) <> 1 then
      v_fallos := v_fallos || 'cem_beca_revocar deja más de un apunte de «beca.revocada»: la revocó también el disparador'::text;
    end if;
  exception when others then
    v_fallos := v_fallos || format('cem_beca_revocar se cortó: %s', sqlerrm);
  end;

  -- 9c. El equipo pone «cancelada» a mano en Admin → Estudiante: un update
  -- directo, con el rol con que llega el navegador, que no puede ni leer cem_becas.
  begin
    perform pg_temp.prueba_ser(v_admin, 'admin');
    perform set_config('role', 'authenticated', true);
    update cem_enrollments set estado = 'cancelada' where id = e_mano;
    get diagnostics v_filas = row_count;
    perform set_config('role', 'none', true);
    v_n := v_n + 2;
    if v_filas <> 1 then
      v_fallos := v_fallos || 'el equipo no puede poner «cancelada» a mano: la prueba no prueba lo que dice'::text;
    end if;
    if not exists (select 1 from cem_becas where id = b_mano and estado = 'revocada' and revocada_por = v_admin) then
      v_fallos := v_fallos || format('cancelar a mano deja la beca %s', (select estado from cem_becas where id = b_mano));
    end if;
  exception when others then
    v_fallos := v_fallos || format('cancelar a mano se cortó: %s', sqlerrm);
  end;
  perform set_config('role', 'none', true);

  -- 9d. La persona se da de baja ella misma (cem_cancelar_inscripcion).
  begin
    perform pg_temp.prueba_ser(v_est[6], 'quien tiene la beca que se da de baja');
    perform cem_cancelar_inscripcion(e_baja, 'Prueba automática: ya no me interesa.');
    v_n := v_n + 1;
    if not exists (select 1 from cem_becas where id = b_baja and estado = 'revocada' and revocada_por = v_est[6]) then
      v_fallos := v_fallos || format('darse de baja deja la beca %s', (select estado from cem_becas where id = b_baja));
    end if;
  exception when others then
    v_fallos := v_fallos || format('darse de baja se cortó: %s', sqlerrm);
  end;

  -- 9e. El dinero de las tres becas del fondo volvió, una vez cada una.
  perform pg_temp.prueba_ser(null, 'nadie');
  v_n := v_n + 1;
  if cem_becas_disponible() <> v_disp0 then
    v_fallos := v_fallos || format('al fondo le faltan %s después de retirar, revocar y cancelar sus tres becas',
                                   v_disp0 - cem_becas_disponible());
  end if;
  for r in select * from (values ('retirada', b_fondo), ('revocada', b_rev), ('cancelada a mano', b_mano)) as t(caso, beca) loop
    v_n := v_n + 1;
    if (select count(*) from cem_becas_fondo where beca_id = r.beca and tipo = 'devolucion') <> 1
       or (select coalesce(sum(monto), 0) from cem_becas_fondo where beca_id = r.beca) <> 0
       or exists (select 1 from cem_becas_financiacion where beca_id = r.beca and liberada_en is null) then
      v_fallos := v_fallos || format('la beca del fondo %s no devuelve su dinero exactamente una vez', r.caso);
    end if;
  end loop;

  /* ── 10. Los permisos ──────────────────────────────────────────────────── */
  -- Las internas, sin EXECUTE para nadie más que su dueño: ni PUBLIC, ni anon,
  -- ni authenticated, ni service_role.
  for r in select * from (values ('public.cem_becas_al_cancelar(uuid,text)'),
                                 ('public.cem_tg_becas_al_cancelar()')) as t(firma) loop
    v_n := v_n + 1;
    if to_regprocedure(r.firma) is null then
      v_fallos := v_fallos || format('no existe %s', r.firma);
    elsif exists (select 1 from pg_proc p
                   where p.oid = to_regprocedure(r.firma)
                     and (p.proacl is null
                          or exists (select 1 from aclexplode(p.proacl) a
                                      where a.grantee <> p.proowner and a.privilege_type = 'EXECUTE'))) then
      v_fallos := v_fallos || format('%s la puede ejecutar alguien más que su dueño', r.firma);
    end if;
  end loop;
  -- Las que llaman las pantallas: authenticated sí, anon no.
  for r in select * from (values ('public.cem_solicitar_cambio_inscripcion(uuid,text,text,date,integer)'),
                                 ('public.cem_resolver_solicitud_inscripcion(uuid,boolean,text)'),
                                 ('public.cem_beca_revocar(uuid,text)')) as t(firma) loop
    v_n := v_n + 1;
    if not has_function_privilege('authenticated', r.firma, 'execute')
       or has_function_privilege('anon', r.firma, 'execute') then
      v_fallos := v_fallos || format('%s: tiene que poder llamarla authenticated y no anon', r.firma);
    end if;
  end loop;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  if cardinality(v_fallos) > 0 then
    raise exception 'PRUEBA_FALLA: % de % comprobaciones: %',
      cardinality(v_fallos), v_n, array_to_string(v_fallos, ' | ');
  end if;
  raise exception 'PRUEBA_OK: % comprobaciones', v_n;
end
$prueba$;
