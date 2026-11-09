/* La compra sin cuenta no pierde un cobro, y el pago local termina.
   ==========================================================================
   Prueba la migración 20261109000001 contra la base de verdad, con compras,
   inscripciones y pagos de mentira que nunca llegan a guardarse:

     · cem_compra_invitado_asentar cierra la compra y apunta el pago en UNA
       transacción. Si el pago no entra no queda nada: ni la marca «pagada»
       ni la inscripción. Si entra, la compra guarda su pago, y un reintento
       de Stripe sale por «repetido» sin apuntarlo otra vez.
     · Sin cuota por pagar (dos compras en carrera), el pago se apunta en la
       última cuota y se avisa al equipo; y abrir se niega antes de cobrar si
       la inscripción ya no debe nada.
     · cem_cuenta_por_correo encuentra la cuenta por el correo exacto: sin
       mayúsculas, sin espacios y sin que «_» haga de comodín.
     · cem_compra_invitado_fallo deja el error en la compra y avisa al equipo
       una vez por cada error distinto; al asentarse, el error se borra.
     · El pago local: reportar acepta la compra recién abierta, exige una
       forma de pago con destino y un monto, y no toca compras de tarjeta ni
       pagadas. La lista del equipo enseña el monto en la moneda de la forma
       de pago y lo que equivale. Confirmarlo apunta el pago en esa moneda,
       convertido, a nombre de quien lo confirmó. Rechazarlo funciona.
     · El correo de rescate sale una vez por persona, y no a quien ya
       declaró un pago ni a una compra cuyo cobro no se pudo apuntar.
     · Los permisos de cada función.

   CÓMO SE CORRE
   Entera, de una vez: en Supabase → SQL Editor, o con la herramienta
   execute_sql, como dueño (postgres): casi todas son sólo del servidor.
   Siempre termina en ERROR, a propósito: es lo que deshace todo lo que creó
   (compras, inscripciones, pagos, la forma de pago de prueba, y los avisos y
   correos en cola). No toca cem_courses: su disparador llama a Stripe.
     · «PRUEBA_OK: …»     todo como debe.
     · «PRUEBA_FALLA: …»  la lista de lo que no.
   Cualquier otro error es un fallo de la prueba misma, no de la regla.

   QUÉ NECESITA
   Un programa con precio; cinco estudiantes activos sin nada en él, con el
   mismo correo en su cuenta de acceso y en su perfil, y sin ninguna compra;
   una forma de pago «directo» activa en la moneda del programa (la
   tarjeta); la tasa de esa moneda de hoy o de antes; y alguien del equipo.
   Los busca ella: aquí no se escribe el id ni el correo de nadie. La forma
   de pago local de prueba la crea ella misma. */

do $prueba$
declare
  c_neutro   constant text := 'No podemos abrir esta compra. Si ya tienes una cuenta en el CEM, entra con ella o escríbenos y lo resolvemos.';
  c_url      constant text := '/plataforma/admin/inscripciones.html?compra=';
  c_movil    constant text := 'Prueba pago móvil (no usar)';
  c_servidor constant text := '{"role":"service_role"}';
  c_asentar  constant text := 'public.cem_compra_invitado_asentar(uuid,uuid,boolean,numeric,text,text,uuid)';
  v_curso    uuid;
  v_moneda   text;
  v_primera  numeric;
  v_tarjeta  text;
  v_staff    uuid;
  v_equipo   integer;
  v_tasa     numeric;
  v_est      uuid[] := '{}';
  v_cor      text[] := '{}';
  v_compra   uuid;
  v_otra     uuid;
  v_pagada   uuid;
  v_enr      uuid;
  v_pago     uuid;
  v_r        jsonb;
  v_fila     jsonb;
  v_err      text;
  v_ref      text;
  v_bs       numeric;
  v_cnt      integer;
  v_cnt2     integer;
  v_x        text;
  v_n        integer := 0;
  v_fallos   text[] := '{}';
  r record;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  select id, coalesce(moneda, 'EUR'), round(precio * 0.9, 2)
    into v_curso, v_moneda, v_primera
    from cem_courses where coalesce(precio, 0) > 0
   order by (estado = 'publicado') desc, created_at limit 1;
  select metodo into v_tarjeta from cem_metodos_pago
   where activo and regla = 'directo' and moneda = v_moneda order by orden limit 1;
  select id into v_staff from cem_profiles
   where activo and rol::text = 'superadmin' order by created_at limit 1;
  select count(*) into v_equipo from cem_profiles
   where activo and rol::text = any (array['admin','superadmin','cobranza','coordinador']);
  select t.valor into v_tasa from cem_tasas_bcv t
   where t.moneda = v_moneda and t.fecha <= current_date
   order by t.fecha desc, (t.id_tasa = 'MANUAL') desc, t.actualizado_en desc limit 1;

  for r in
    select p.id, lower(p.email) as correo
      from cem_profiles p join auth.users u on u.id = p.id
     where p.rol = 'estudiante' and p.activo
       and lower(u.email) = lower(p.email)
       and lower(p.email) ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'
       and not exists (select 1 from cem_enrollments e
                        where e.profile_id = p.id and e.course_id = v_curso)
       and not exists (select 1 from cem_profiles q
                        where q.id <> p.id and lower(q.email) = lower(p.email))
       and not exists (select 1 from cem_compras_invitado c
                        where lower(c.email) = lower(p.email))
     order by p.created_at
     limit 5
  loop
    v_est := v_est || r.id;
    v_cor := v_cor || r.correo;
  end loop;

  if v_curso is null or v_tarjeta is null or v_staff is null or v_equipo = 0
     or v_tasa is null or coalesce(cardinality(v_est), 0) < 5 then
    raise exception 'PRUEBA_FALLA: faltan datos para probar (programa %, tarjeta %, equipo % / %, tasa %, estudiantes %)',
      v_curso, v_tarjeta, v_staff, v_equipo, v_tasa, cardinality(v_est);
  end if;

  -- La forma de pago local de prueba: bolívares a la tasa, con destino (pública).
  insert into cem_metodos_pago (metodo, moneda, regla, tasa_moneda, activo, orden, destino, destino_etiqueta)
  values (c_movil, 'VES', 'tasa_bcv', v_moneda, true, 999, '0102-0000-prueba', 'Teléfono');
  v_bs := round(v_primera * v_tasa, 2);   -- lo que manda quien paga en bolívares

  /* ── 1 · Permisos ───────────────────────────────────────────────────────── */
  for r in select * from (values
      (c_asentar,                                                false, false, true),
      ('public.cem_compra_invitado_fallo(uuid,text)',            false, false, true),
      ('public.cem_cuenta_por_correo(text)',                     false, false, true),
      ('public.cem_compra_invitado_cerrar(uuid,uuid,boolean)',   false, false, false),
      ('public.cem_equivalente_seguro(numeric,text,date)',       false, false, false),
      ('public.cem_compra_invitado_reportar(uuid,text,text,numeric)', true, true, true),
      ('public.cem_compras_invitado_pendientes()',               false, true,  true),
      ('public.cem_compras_rescatar()',                          false, false, true)
    ) as t(firma, anon, auth, servicio)
  loop
    v_n := v_n + 1;
    begin
      if has_function_privilege('anon', r.firma, 'execute') is distinct from r.anon
         or has_function_privilege('authenticated', r.firma, 'execute') is distinct from r.auth
         or has_function_privilege('service_role', r.firma, 'execute') is distinct from r.servicio
         or exists (select 1 from pg_proc
                     where oid = r.firma::regprocedure and proacl::text ~ '(^|[{,])=X/') then
        v_fallos := v_fallos || format('permisos de %s: anon %s, authenticated %s, service_role %s, acl %s (esperaba %s, %s, %s y nada para PUBLIC)',
          r.firma, has_function_privilege('anon', r.firma, 'execute'),
          has_function_privilege('authenticated', r.firma, 'execute'),
          has_function_privilege('service_role', r.firma, 'execute'),
          (select proacl::text from pg_proc where oid = r.firma::regprocedure),
          r.anon, r.auth, r.servicio);
      end if;
    exception when others then
      v_fallos := v_fallos || format('%s: %s', r.firma, sqlerrm);
    end;
  end loop;

  /* ── 2 · La cuenta, por el correo exacto ────────────────────────────────── */
  v_n := v_n + 3;
  begin
    if public.cem_cuenta_por_correo('  ' || upper(v_cor[1]) || ' ') is distinct from v_est[1] then
      v_fallos := v_fallos || 'cuenta_por_correo no encuentra la cuenta con el correo en mayúsculas y con espacios'::text;
    end if;
    -- «_» en lugar de la primera letra: con ilike daría con la persona; aquí no.
    if public.cem_cuenta_por_correo('_' || substr(v_cor[1], 2)) is not distinct from v_est[1] then
      v_fallos := v_fallos || 'cuenta_por_correo trata «_» como comodín'::text;
    end if;
    if public.cem_cuenta_por_correo('nadie-' || gen_random_uuid()::text || '@ejemplo.invalid') is not null then
      v_fallos := v_fallos || 'cuenta_por_correo devuelve una cuenta para un correo que no existe'::text;
    end if;
  exception when others then
    v_fallos := v_fallos || format('cuenta_por_correo: %s', sqlerrm);
  end;

  /* ── 3 · Asentar un cobro con tarjeta (como el aviso de Stripe) ─────────── */
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', c_servidor, true);
  if auth.uid() is not null or not public.cem_es_servidor() then
    raise exception 'PRUEBA_FALLA: no consigo hablar como el servidor';
  end if;

  if to_regprocedure(c_asentar) is null then
    v_n := v_n + 1;
    v_fallos := v_fallos || 'cem_compra_invitado_asentar no existe: cerrar y apuntar el pago siguen en dos transacciones'::text;
  else
    begin
      insert into cem_compras_invitado (course_id, nombre, email, cuotas, monto, moneda)
      values (v_curso, 'Prueba Asentar', v_cor[1], 1, v_primera, v_moneda) returning id into v_compra;
      -- Corta, como las de Stripe (pi_…, unos 27): el pago guarda 40 caracteres.
      v_ref := 'pi_prueba_' || left(replace(v_compra::text, '-', ''), 20);

      -- 3a · El pago no entra (una forma de pago que no existe): no queda nada.
      v_err := null;
      begin
        v_r := public.cem_compra_invitado_asentar(v_compra, v_est[1], true, v_primera, v_ref,
                                                  'Forma de pago que no existe', null);
      exception when others then v_err := sqlerrm; end;
      v_n := v_n + 4;
      if v_err is null or v_err not like '%No sé cómo convertir%' then
        v_fallos := v_fallos || format('asentar con una forma de pago que no existe tenía que fallar al convertir, y %s',
          coalesce('dijo «' || v_err || '»', 'no falló'));
      end if;
      if (select estado from cem_compras_invitado where id = v_compra) is distinct from 'abierta' then
        v_fallos := v_fallos || format('tras un pago que no entró, la compra quedó «%s»: tenía que seguir abierta',
          (select estado from cem_compras_invitado where id = v_compra));
      end if;
      if exists (select 1 from cem_enrollments where profile_id = v_est[1] and course_id = v_curso) then
        v_fallos := v_fallos || 'tras un pago que no entró, quedó una inscripción creada'::text;
      end if;
      if exists (select 1 from cem_payments where referencia = v_ref) then
        v_fallos := v_fallos || 'tras un pago que no entró, quedó un pago apuntado'::text;
      end if;

      -- 3b · Entra: una sola transacción lo deja todo.
      v_r := public.cem_compra_invitado_asentar(v_compra, v_est[1], true, v_primera, v_ref, v_tarjeta, null);
      v_pago := (v_r ->> 'payment_id')::uuid;
      v_enr := (v_r ->> 'enrollment_id')::uuid;
      v_pagada := v_compra;
      v_n := v_n + 7;
      if v_pago is null or not exists (
           select 1 from cem_payments
            where id = v_pago and estado = 'confirmado' and referencia = v_ref
              and monto = v_primera and nota like 'Cobrado con tarjeta%') then
        v_fallos := v_fallos || format('asentar no dejó el pago confirmado, con su referencia, su importe y la nota de la tarjeta: %s', v_r);
      end if;
      if not exists (select 1 from cem_compras_invitado
                      where id = v_compra and estado = 'pagada' and payment_id = v_pago
                        and enrollment_id = v_enr and profile_id = v_est[1] and cuenta_nueva) then
        v_fallos := v_fallos || 'la compra no quedó pagada, con su pago, su inscripción, su perfil y cuenta_nueva'::text;
      end if;
      if (select estado::text from cem_enrollments where id = v_enr) is distinct from 'activa' then
        v_fallos := v_fallos || format('la inscripción quedó «%s», no activa',
          (select estado::text from cem_enrollments where id = v_enr));
      end if;
      if (select estado::text from cem_installments where enrollment_id = v_enr order by numero limit 1)
         is distinct from 'pagada' then
        v_fallos := v_fallos || 'la cuota no quedó pagada'::text;
      end if;
      if (select registrado_por from cem_payments where id = v_pago) is not null then
        v_fallos := v_fallos || 'un cobro de Stripe quedó a nombre de alguien del equipo'::text;
      end if;
      if (select error_cierre from cem_compras_invitado where id = v_compra) is not null then
        v_fallos := v_fallos || 'la compra asentada guarda un error'::text;
      end if;
      if (v_r ->> 'sin_cuota') = 'true' then
        v_fallos := v_fallos || 'asentar dijo «sin cuota» habiendo una por pagar'::text;
      end if;

      -- 3c · Stripe repite el aviso: «repetido», el mismo pago, y uno solo.
      v_r := public.cem_compra_invitado_asentar(v_compra, v_est[1], true, v_primera, v_ref, v_tarjeta, null);
      v_n := v_n + 2;
      if (v_r ->> 'repetido') is distinct from 'true' or (v_r ->> 'payment_id')::uuid is distinct from v_pago then
        v_fallos := v_fallos || format('el reintento no dijo «repetido» con el mismo pago: %s', v_r);
      end if;
      if (select count(*) from cem_payments where referencia = v_ref) <> 1 then
        v_fallos := v_fallos || 'el reintento apuntó el pago otra vez'::text;
      end if;
    exception when others then
      v_fallos := v_fallos || format('asentar con tarjeta: error inesperado «%s»', sqlerrm);
    end;
  end if;

  /* ── 4 · Sin nada por pagar: abrir se niega, y la carrera se apunta ─────── */
  begin
    -- Una inscripción ya pagada entera.
    v_enr := (public.cem_inscribir_a(v_est[2], v_curso, null, 1, null)).id;
    update cem_installments set estado = 'pagada', saldo = 0 where enrollment_id = v_enr;
    update cem_enrollments set estado = 'activa' where id = v_enr;

    v_err := null;
    begin
      perform public.cem_compra_invitado_abrir(v_curso, 'Prueba Sin Cuota', '  ' || upper(v_cor[2]), 1);
    exception when others then v_err := sqlerrm; end;
    v_n := v_n + 1;
    if v_err is distinct from c_neutro then
      v_fallos := v_fallos || format('abrir con la inscripción ya pagada tenía que negarse con el mensaje neutro, y %s',
        coalesce('dijo «' || v_err || '»', 'abrió la compra'));
    end if;

    -- La compra que se abrió antes de que esa inscripción quedara pagada.
    insert into cem_compras_invitado (course_id, nombre, email, cuotas, monto, moneda)
    values (v_curso, 'Prueba Sin Cuota', v_cor[2], 1, v_primera, v_moneda) returning id into v_otra;

    -- El aviso falla dos veces con el mismo error y una con otro.
    perform public.cem_compra_invitado_fallo(v_otra, 'Error de prueba A');
    perform public.cem_compra_invitado_fallo(v_otra, 'Error de prueba A');
    select count(*) into v_cnt from cem_notificaciones
     where url = c_url || v_otra and tipo = 'compra_sin_asentar';
    perform public.cem_compra_invitado_fallo(v_otra, 'Error de prueba B');
    select count(*) into v_cnt2 from cem_notificaciones
     where url = c_url || v_otra and tipo = 'compra_sin_asentar';
    v_n := v_n + 3;
    if v_cnt is distinct from v_equipo then
      v_fallos := v_fallos || format('el mismo error dos veces dejó %s avisos, y son %s quienes los reciben', v_cnt, v_equipo);
    end if;
    if v_cnt2 is distinct from 2 * v_equipo then
      v_fallos := v_fallos || format('un error distinto no avisó otra vez: %s avisos en total', v_cnt2);
    end if;
    if (select error_cierre from cem_compras_invitado where id = v_otra) is distinct from 'Error de prueba B' then
      v_fallos := v_fallos || 'fallo no dejó en la compra el último error'::text;
    end if;

    -- Y se asienta: en la última cuota, y con aviso.
    v_r := public.cem_compra_invitado_asentar(v_otra, v_est[2], false, v_primera,
                                              'pi_prueba_' || left(replace(v_otra::text, '-', ''), 20), v_tarjeta, null);
    v_n := v_n + 4;
    if (v_r ->> 'sin_cuota') is distinct from 'true' then
      v_fallos := v_fallos || format('asentar sobre una inscripción ya pagada no dice «sin cuota»: %s', v_r);
    end if;
    if not exists (select 1 from cem_payments
                    where id = (v_r ->> 'payment_id')::uuid and estado = 'confirmado' and enrollment_id = v_enr) then
      v_fallos := v_fallos || 'el cobro sin cuota no quedó apuntado en su inscripción'::text;
    end if;
    if (select count(*) from cem_notificaciones where url = c_url || v_otra and tipo = 'compra_sin_cuota')
       is distinct from v_equipo::bigint then
      v_fallos := v_fallos || 'el cobro sin cuota no avisó a cada persona del equipo'::text;
    end if;
    if (select error_cierre from cem_compras_invitado where id = v_otra) is not null then
      v_fallos := v_fallos || 'al asentarse no se borró el error de la compra'::text;
    end if;
  exception when others then
    v_n := v_n + 1;
    v_fallos := v_fallos || format('sin nada por pagar: error inesperado «%s»', sqlerrm);
  end;

  /* ── 5 · El pago local: reportar, la lista, confirmar y rechazar ───────── */
  begin
    insert into cem_compras_invitado (course_id, nombre, email, cuotas, monto, moneda)
    values (v_curso, 'Prueba Local', v_cor[3], 1, v_primera, v_moneda) returning id into v_compra;
    v_ref := 'REF-' || left(replace(v_compra::text, '-', ''), 8);

    for r in select * from (values
        ('una forma de pago que no existe', 'Forma de pago que no existe', 'REF123456', v_bs,           '%forma de pago%'),
        ('la tarjeta, que no tiene destino', v_tarjeta,                    'REF123456', v_bs,           '%forma de pago%'),
        ('monto 0',                          c_movil,                      'REF123456', 0::numeric,     '%cuánto pagaste%'),
        ('sin monto',                        c_movil,                      'REF123456', null::numeric,  '%cuánto pagaste%'),
        ('sin referencia',                   c_movil,                      '   ',       v_bs,           '%referencia%')
      ) as t(caso, metodo, ref, monto, dice)
    loop
      v_err := null;
      begin
        perform public.cem_compra_invitado_reportar(v_compra, r.metodo, r.ref, r.monto);
      exception when others then v_err := sqlerrm; end;
      v_n := v_n + 1;
      if v_err is null or v_err not like r.dice then
        v_fallos := v_fallos || format('reportar con %s tenía que negarse (%s), y %s',
          r.caso, r.dice, coalesce('dijo «' || v_err || '»', 'lo aceptó'));
      end if;
    end loop;

    -- Bien: queda reportada, con todo, y el equipo se entera.
    v_err := null;
    begin
      perform public.cem_compra_invitado_reportar(v_compra, c_movil, ' ' || v_ref || ' ', v_bs);
    exception when others then v_err := sqlerrm; end;
    v_n := v_n + 2;
    if v_err is not null then
      v_fallos := v_fallos || format('reportar una compra recién abierta falló: «%s»', v_err);
    elsif not exists (select 1 from cem_compras_invitado
                       where id = v_compra and estado = 'reportada' and metodo = c_movil
                         and referencia = v_ref and monto_reportado = v_bs and reportada_en is not null) then
      v_fallos := v_fallos || 'reportar no dejó la compra reportada con su forma de pago, su referencia y su monto'::text;
    end if;
    if (select count(*) from cem_notificaciones where url = c_url || v_compra and tipo = 'pago_reportado')
       is distinct from v_equipo::bigint then
      v_fallos := v_fallos || 'reportar no avisó a cada persona del equipo'::text;
    end if;

    -- Corregir antes de que el equipo actúe: se puede.
    v_err := null;
    begin
      perform public.cem_compra_invitado_reportar(v_compra, c_movil, v_ref, v_bs + 1);
    exception when others then v_err := sqlerrm; end;
    v_n := v_n + 1;
    if (select monto_reportado from cem_compras_invitado where id = v_compra) is distinct from v_bs + 1 then
      v_fallos := v_fallos || format('reportar otra vez no corrigió el monto (%s)', coalesce(v_err, 'sin error'));
    end if;
    begin
      perform public.cem_compra_invitado_reportar(v_compra, c_movil, v_ref, v_bs);
    exception when others then null; end;

    -- No se tocan: una compra abierta para pagar con tarjeta, ni una pagada.
    insert into cem_compras_invitado (course_id, nombre, email, cuotas, monto, moneda, session_id)
    values (v_curso, 'Prueba Local', v_cor[3], 1, v_primera, v_moneda, 'cs_prueba_' || gen_random_uuid()::text)
    returning id into v_otra;
    for r in select * from (values ('abierta para pagar con tarjeta', v_otra,   '%tarjeta%'),
                                   ('pagada',                         v_pagada, '%a la espera%')
                          ) as t(caso, id, dice) loop
      continue when r.id is null;
      v_err := null;
      begin
        perform public.cem_compra_invitado_reportar(r.id, c_movil, 'REF999999', v_bs);
      exception when others then v_err := sqlerrm; end;
      v_n := v_n + 1;
      if v_err is null or v_err not like r.dice then
        v_fallos := v_fallos || format('reportar sobre una compra %s tenía que negarse (%s), y %s',
          r.caso, r.dice, coalesce('dijo «' || v_err || '»', 'la aceptó'));
      end if;
    end loop;

    -- La lista del equipo, como cobranza.
    perform set_config('request.jwt.claim.sub', v_staff::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
    if auth.uid() is distinct from v_staff then
      raise exception 'no consigo ser alguien del equipo';
    end if;
    select x into v_fila from jsonb_array_elements(public.cem_compras_invitado_pendientes()) x
     where x ->> 'id' = v_compra::text;
    v_n := v_n + 2;
    if v_fila is null then
      v_fallos := v_fallos || 'la lista del equipo no enseña la compra reportada'::text;
    else
      if v_fila ->> 'moneda_pago' is distinct from 'VES' then
        v_fallos := v_fallos || format('la lista enseña el monto en %s, no en la moneda de la forma de pago (VES)',
          coalesce(v_fila ->> 'moneda_pago', 'ninguna'));
      end if;
      if abs(coalesce((v_fila ->> 'equivale')::numeric, -1) - round(v_bs / v_tasa, 2)) > 0.01 then
        v_fallos := v_fallos || format('la lista dice que %s Bs equivalen a %s; a la tasa son %s',
          v_bs, coalesce(v_fila ->> 'equivale', 'nada'), round(v_bs / v_tasa, 2));
      end if;
    end if;

    -- Confirmarla, como cem-comprar: el servidor, a nombre de quien confirma.
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', c_servidor, true);
    if to_regprocedure(c_asentar) is null then
      v_n := v_n + 1;
      v_fallos := v_fallos || 'sin asentar no se puede confirmar un pago local'::text;
    else
      v_r := public.cem_compra_invitado_asentar(v_compra, v_est[3], true, v_bs, v_ref, c_movil, v_staff);
      v_pago := (v_r ->> 'payment_id')::uuid;
      v_n := v_n + 3;
      if not exists (select 1 from cem_payments
                      where id = v_pago and estado = 'confirmado' and moneda = 'VES' and monto = v_bs
                        and abs(monto_base - round(v_bs / v_tasa, 2)) <= 0.01
                        and registrado_por = v_staff) then
        v_fallos := v_fallos || format('confirmar no apuntó el pago en bolívares, convertido y a nombre de quien confirma: %s', v_r);
      end if;
      if (select nota from cem_payments where id = v_pago) ilike '%tarjeta%' then
        v_fallos := v_fallos || 'un pago móvil confirmado por el equipo dice que fue con tarjeta'::text;
      end if;
      if (select estado::text from cem_installments
           where enrollment_id = (v_r ->> 'enrollment_id')::uuid order by numero limit 1) is distinct from 'pagada' then
        v_fallos := v_fallos || 'la cuota no quedó pagada con el monto en bolívares'::text;
      end if;
    end if;

    -- Rechazar otra.
    insert into cem_compras_invitado (course_id, nombre, email, cuotas, monto, moneda)
    values (v_curso, 'Prueba Local', v_cor[4], 1, v_primera, v_moneda) returning id into v_otra;
    perform public.cem_compra_invitado_reportar(v_otra, c_movil, 'REF-RECHAZO', v_bs);
    perform set_config('request.jwt.claim.sub', v_staff::text, true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
    perform public.cem_compra_invitado_rechazar(v_otra, 'Esa referencia no aparece en el extracto de esta semana.');
    v_n := v_n + 1;
    if (select estado from cem_compras_invitado where id = v_otra) is distinct from 'fallida' then
      v_fallos := v_fallos || 'rechazar una compra reportada no la dejó fallida'::text;
    end if;
  exception when others then
    v_n := v_n + 1;
    v_fallos := v_fallos || format('pago local: error inesperado «%s»', sqlerrm);
  end;

  /* ── 6 · El correo de rescate ───────────────────────────────────────────── */
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', c_servidor, true);
  begin
    -- Correos que no son de nadie.
    v_x := 'prueba-rescate-' || left(replace(gen_random_uuid()::text, '-', ''), 10);
    insert into cem_compras_invitado (course_id, nombre, email, cuotas, monto, moneda, creada_en) values
      (v_curso, 'Prueba Rescate', v_x || '-a@ejemplo.invalid', 1, v_primera, v_moneda, now() - interval '5 hours'),
      (v_curso, 'Prueba Rescate', v_x || '-a@ejemplo.invalid', 1, v_primera, v_moneda, now() - interval '2 hours'),
      (v_curso, 'Prueba Rescate', v_x || '-b@ejemplo.invalid', 1, v_primera, v_moneda, now() - interval '2 hours');
    insert into cem_compras_invitado (course_id, nombre, email, cuotas, monto, moneda, creada_en,
                                      estado, metodo, referencia, monto_reportado, reportada_en)
    values (v_curso, 'Prueba Rescate', v_x || '-b@ejemplo.invalid', 1, v_primera, v_moneda,
            now() - interval '90 minutes', 'reportada', c_movil, 'REF-RESCATE', v_bs, now());
    insert into cem_compras_invitado (course_id, nombre, email, cuotas, monto, moneda, creada_en,
                                      error_cierre, error_en)
    values (v_curso, 'Prueba Rescate', v_x || '-c@ejemplo.invalid', 1, v_primera, v_moneda,
            now() - interval '2 hours', 'Error de prueba', now());

    perform public.cem_compras_rescatar();

    v_n := v_n + 4;
    select count(*) into v_cnt from cem_correo_cola where para = v_x || '-a@ejemplo.invalid';
    if v_cnt <> 1 then
      v_fallos := v_fallos || format('el rescate mandó %s correos a quien abrió dos compras: tenía que ser uno', v_cnt);
    end if;
    if exists (select 1 from cem_compras_invitado
                where email = v_x || '-a@ejemplo.invalid' and estado = 'abierta' and rescatada_en is null) then
      v_fallos := v_fallos || 'el rescate dejó sin marcar la otra compra abierta de la misma persona'::text;
    end if;
    if exists (select 1 from cem_correo_cola where para = v_x || '-b@ejemplo.invalid') then
      v_fallos := v_fallos || 'el rescate le escribió a quien ya declaró un pago'::text;
    end if;
    if exists (select 1 from cem_correo_cola where para = v_x || '-c@ejemplo.invalid') then
      v_fallos := v_fallos || 'el rescate le escribió a una compra cuyo cobro no se pudo apuntar'::text;
    end if;
  exception when others then
    v_n := v_n + 1;
    v_fallos := v_fallos || format('rescate: error inesperado «%s»', sqlerrm);
  end;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  if cardinality(v_fallos) > 0 then
    raise exception 'PRUEBA_FALLA: % de % comprobaciones: %',
      cardinality(v_fallos), v_n, array_to_string(v_fallos, ' | ');
  end if;
  raise exception 'PRUEBA_OK: % comprobaciones', v_n;
end
$prueba$;
