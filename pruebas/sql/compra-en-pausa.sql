/* Comprar sin cuenta no cobra lo que pagar no abre.
   ==========================================================================
   Desde 20261107000006 una inscripción congelada o suspendida no abre el
   aula, y pagar no la reabre. Esto prueba la compra sin cuenta (migración
   20261108000005) contra la base de verdad, con inscripciones y compras de
   mentira que nunca llegan a guardarse:
     · cem_compra_invitado_abrir se niega, con un mensaje que no dice qué hay,
       si el pago iba a caer en una congelada o en una suspendida; y deja
       pasar a quien no tiene nada en el programa, o lo tiene activo,
       pendiente, cancelado o terminado;
     · cem_compra_invitado_cerrar, si aun así cae en una (la sesión de Stripe
       sigue abierta horas, y la inscripción puede pararse entre medias), no
       lanza: la apunta, devuelve el estado y avisa al equipo, una sola vez;
     · y con dos inscripciones, cerrar elige la abierta y no la que salga.
   Desde 20261109000001 abrir se niega también si la inscripción ya no debe
   nada, así que cada inscripción de esta prueba lleva una cuota por pagar; y
   cerrar sólo la ejecuta su dueño (la llama cem_compra_invitado_asentar).

   CÓMO SE CORRE
   Entera, de una vez: en Supabase → SQL Editor, o con la herramienta
   execute_sql, como dueño (postgres): las dos funciones son sólo del
   servidor. Siempre termina en ERROR, a propósito: es lo que deshace todo lo
   que creó (inscripciones, compras, y los avisos y correos en cola que se le
   mandan al equipo; ninguna de esas tablas tiene un disparador que salga de
   la transacción). No toca cem_courses: su disparador llama a Stripe.
     · «PRUEBA_OK: …»     todo como debe.
     · «PRUEBA_FALLA: …»  la lista de lo que no.
   Cualquier otro error es un fallo de la prueba misma, no de la regla.

   QUÉ NECESITA
   Un programa con precio; tres estudiantes activos sin nada en él, con un
   correo que no comparta nadie y sin compras en la última hora (abrir
   admite seis por correo y hora); y alguien del equipo que reciba avisos. Los
   busca ella: aquí no se escribe el id de nadie.

   SI EL PROGRAMA NO ESTÁ A LA VENTA
   abrir mira la inscripción antes que el programa. Si el único programa con
   precio no está publicado, abrir se para después en «Ese programa…», y
   entonces «deja pasar» quiere decir que llega hasta ahí sin negarse por la
   inscripción: no se llega a crear la compra. El resultado dice qué caso fue
   («programa a la venta: …»). Las compras que necesita cerrar se crean a mano,
   como las dejaría abrir. */

do $prueba$
declare
  c_neutro    constant text := 'No podemos abrir esta compra. Si ya tienes una cuenta en el CEM, entra con ella o escríbenos y lo resolvemos.';
  c_url       constant text := '/plataforma/admin/inscripciones.html?compra=';
  v_curso     uuid;
  v_a_la_venta boolean;
  v_equipo    integer;
  v_uno       uuid;   -- su inscripción pasa por todos los estados
  v_dos       uuid;   -- tiene una congelada y una activa a la vez
  v_tres      uuid;   -- la carrera: compra con la inscripción activa, y se para antes de pagar
  v_correo_uno  text;
  v_correo_dos  text;
  v_correo_tres text;
  v_enr       uuid;
  v_activa    uuid;
  v_congelada uuid;
  v_compra    uuid;
  v_cierre    jsonb;
  v_err       text;
  v_avisos    integer;
  v_n         integer := 0;
  v_fallos    text[] := '{}';
  r record;
begin
  -- Nadie delante: así llama el servidor.
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if auth.uid() is not null then
    raise exception 'PRUEBA_FALLA: la sesión ya tiene identidad (%) y así no se prueba como el servidor', auth.uid();
  end if;

  -- El programa: uno a la venta si lo hay; si no, cualquiera con precio.
  select id, (estado = 'publicado') into v_curso, v_a_la_venta
    from cem_courses
   where coalesce(precio, 0) > 0
   order by (estado = 'publicado') desc, created_at
   limit 1;

  -- abrir busca el perfil por el correo: tiene que ser de una sola persona,
  -- tener forma de correo tal cual está guardado y no gastar el tope.
  for r in
    select p.id, lower(p.email) as correo
      from cem_profiles p
     where p.rol = 'estudiante' and p.activo
       and lower(p.email) ~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'
       and not exists (select 1 from cem_enrollments e
                        where e.profile_id = p.id and e.course_id = v_curso)
       and not exists (select 1 from cem_profiles q
                        where q.id <> p.id and lower(q.email) = lower(p.email))
       and not exists (select 1 from cem_compras_invitado c
                        where lower(c.email) = lower(p.email)
                          and c.creada_en > now() - interval '1 hour')
     order by p.created_at
     limit 3
  loop
    if v_uno is null then v_uno := r.id; v_correo_uno := r.correo;
    elsif v_dos is null then v_dos := r.id; v_correo_dos := r.correo;
    else v_tres := r.id; v_correo_tres := r.correo;
    end if;
  end loop;

  -- Los que reciben el aviso: los mismos roles que pone cerrar.
  select count(*) into v_equipo from cem_profiles
   where activo and rol::text = any (array['admin','superadmin','cobranza','coordinador']);

  if v_curso is null or v_tres is null or v_equipo = 0 then
    raise exception 'PRUEBA_FALLA: faltan datos para probar (programa %, estudiantes % % %, equipo %)',
      v_curso, v_uno, v_dos, v_tres, v_equipo;
  end if;

  /* ── abrir sigue siendo sólo del servidor; cerrar, sólo de su dueño ────
     Desde 20261109000001 cerrar no la llama nadie suelta: la llama
     cem_compra_invitado_asentar, en la misma transacción que el pago. */
  for r in select * from (values
      ('public.cem_compra_invitado_abrir(uuid,text,text,integer,uuid,text)', true),
      ('public.cem_compra_invitado_cerrar(uuid,uuid,boolean)',               false)
    ) as t(firma, servidor)
  loop
    v_n := v_n + 1;
    if has_function_privilege('anon', r.firma, 'execute')
       or has_function_privilege('authenticated', r.firma, 'execute')
       or has_function_privilege('service_role', r.firma, 'execute') is distinct from r.servidor then
      v_fallos := v_fallos || format('%s: tenía que ejecutarla %s', r.firma,
        case when r.servidor then 'sólo el servidor' else 'sólo su dueño' end);
    end if;
  end loop;

  /* ── abrir, con la inscripción del estudiante 1 en cada estado ────────── */
  -- Entra congelada directamente: el disparador de lo gratis sólo toca las
  -- pendientes, y sólo al insertar.
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_uno, v_curso, 'congelada', 100, 100, 'EUR') returning id into v_enr;
  -- Con una cuota que debe algo: sin ella, abrir se niega también por eso
  -- (una inscripción que ya no debe nada no recibe el pago, 20261109000001).
  insert into cem_installments (enrollment_id, numero, monto, moneda, fecha_vencimiento, estado, saldo)
  values (v_enr, 1, 100, 'EUR', current_date, 'pendiente', 100);

  for r in select * from (values
      ('congelada',  true),
      ('suspendida', true),
      ('activa',     false),
      ('pendiente',  false),
      ('cancelada',  false),
      ('finalizada', false)
    ) as t(estado, se_niega)
  loop
    update cem_enrollments set estado = r.estado::cem_inscripcion_estado where id = v_enr;
    -- El correo como lo escribe la gente: con mayúsculas y espacios.
    v_err := null;
    begin
      perform public.cem_compra_invitado_abrir(v_curso, 'Prueba Compra',
                                               '  ' || upper(v_correo_uno) || ' ', 1);
    exception when others then
      v_err := sqlerrm;
    end;
    v_n := v_n + 1;
    if r.se_niega then
      if v_err is distinct from c_neutro then
        v_fallos := v_fallos || format('abrir con la inscripción %s tenía que negarse con el mensaje neutro, y %s',
          r.estado, coalesce('dijo «' || v_err || '»', 'abrió la compra'));
      end if;
    elsif not coalesce(case when v_a_la_venta then v_err is null
                            else v_err like 'Ese programa%' end, false) then
      v_fallos := v_fallos || format('abrir con la inscripción %s tenía que dejar pasar, y dijo «%s»',
        r.estado, v_err);
    end if;
  end loop;

  /* ── Una congelada y una activa a la vez: el pago va a la activa ──────── */
  -- Primero sin nada en el programa: el control.
  v_err := null;
  begin
    perform public.cem_compra_invitado_abrir(v_curso, 'Prueba Compra', v_correo_dos, 1);
  exception when others then
    v_err := sqlerrm;
  end;
  v_n := v_n + 1;
  if not coalesce(case when v_a_la_venta then v_err is null
                       else v_err like 'Ese programa%' end, false) then
    v_fallos := v_fallos || format('abrir sin ninguna inscripción tenía que dejar pasar, y dijo «%s»', v_err);
  end if;

  -- La congelada entra primero: un LIMIT 1 sin orden suele devolver la
  -- primera que se guardó.
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_dos, v_curso, 'congelada', 100, 100, 'EUR') returning id into v_congelada;
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_dos, v_curso, 'activa', 100, 100, 'EUR') returning id into v_activa;
  insert into cem_installments (enrollment_id, numero, monto, moneda, fecha_vencimiento, estado, saldo)
  values (v_activa, 1, 100, 'EUR', current_date, 'pendiente', 100);

  v_err := null;
  begin
    perform public.cem_compra_invitado_abrir(v_curso, 'Prueba Compra', v_correo_dos, 1);
  exception when others then
    v_err := sqlerrm;
  end;
  v_n := v_n + 1;
  if not coalesce(case when v_a_la_venta then v_err is null
                       else v_err like 'Ese programa%' end, false) then
    v_fallos := v_fallos || format('abrir con una congelada y una activa tenía que dejar pasar (el pago va a la activa), y dijo «%s»', v_err);
  end if;

  -- La compra como la deja abrir, y el aviso de pago que llega después.
  insert into cem_compras_invitado (course_id, nombre, email, cuotas, monto, moneda)
  values (v_curso, 'Prueba Compra', v_correo_dos, 1, 90, 'EUR') returning id into v_compra;
  v_cierre := public.cem_compra_invitado_cerrar(v_compra, v_dos, false);

  v_n := v_n + 4;
  if v_cierre ->> 'enrollment_id' is distinct from v_activa::text then
    v_fallos := v_fallos || format('cerrar con una congelada y una activa apuntó el pago en %s, no en la activa',
      case v_cierre ->> 'enrollment_id' when v_congelada::text then 'la congelada'
                                        else coalesce(v_cierre ->> 'enrollment_id', 'ninguna') end);
  end if;
  if v_cierre ->> 'estado' is distinct from 'activa' then
    v_fallos := v_fallos || format('cerrar no devuelve el estado de la inscripción (activa): devuelve %s', v_cierre);
  end if;
  if exists (select 1 from cem_notificaciones where url = c_url || v_compra) then
    v_fallos := v_fallos || 'cerrar avisó al equipo de un pago que cayó en una inscripción activa'::text;
  end if;
  if (select count(*) from cem_enrollments where profile_id = v_dos and course_id = v_curso) <> 2 then
    v_fallos := v_fallos || 'cerrar creó otra inscripción teniendo ya una activa'::text;
  end if;

  /* ── La carrera: se compra con la activa, y se para antes de pagar ────── */
  insert into cem_enrollments (profile_id, course_id, estado, precio_lista, precio_final, moneda)
  values (v_tres, v_curso, 'activa', 100, 100, 'EUR') returning id into v_enr;
  insert into cem_installments (enrollment_id, numero, monto, moneda, fecha_vencimiento, estado, saldo)
  values (v_enr, 1, 100, 'EUR', current_date, 'pendiente', 100);

  for r in select * from (values
      ('congelada',  'en pausa'),
      ('suspendida', 'suspendida')
    ) as t(estado, dice)
  loop
    insert into cem_compras_invitado (course_id, nombre, email, cuotas, monto, moneda)
    values (v_curso, 'Prueba Compra', v_correo_tres, 1, 90, 'EUR') returning id into v_compra;
    -- Mientras la persona está en la pantalla de Stripe, el equipo la para.
    update cem_enrollments set estado = r.estado::cem_inscripcion_estado where id = v_enr;

    v_cierre := null;
    v_err := null;
    begin
      v_cierre := public.cem_compra_invitado_cerrar(v_compra, v_tres, false);
    exception when others then
      v_err := sqlerrm;
    end;

    v_n := v_n + 1;
    if v_err is not null then
      v_fallos := v_fallos || format('cerrar sobre una %s lanzó «%s»: el dinero ya entró, y Stripe reintentaría días',
                                     r.estado, v_err);
      continue;
    end if;

    v_n := v_n + 4;
    if v_cierre ->> 'enrollment_id' is distinct from v_enr::text then
      v_fallos := v_fallos || format('cerrar sobre una %s no la usó: devuelve %s', r.estado, v_cierre);
    end if;
    if v_cierre ->> 'estado' is distinct from r.estado then
      v_fallos := v_fallos || format('cerrar sobre una %s no devuelve su estado: devuelve %s', r.estado, v_cierre);
    end if;
    if not exists (select 1 from cem_compras_invitado
                    where id = v_compra and estado = 'pagada' and enrollment_id = v_enr) then
      v_fallos := v_fallos || format('cerrar sobre una %s no dejó la compra apuntada y pagada', r.estado);
    end if;
    if (select estado::text from cem_enrollments where id = v_enr) is distinct from r.estado then
      v_fallos := v_fallos || format('cerrar le cambió el estado a una %s', r.estado);
    end if;

    -- Un aviso por persona del equipo, y que diga cómo está.
    select count(*) into v_avisos from cem_notificaciones
     where url = c_url || v_compra and tipo = 'compra_en_pausa' and titulo like '%' || r.dice || '%';
    v_n := v_n + 1;
    if v_avisos is distinct from v_equipo then
      v_fallos := v_fallos || format('cerrar sobre una %s dejó %s avisos al equipo, y son %s quienes los reciben',
                                     r.estado, v_avisos, v_equipo);
    end if;

    -- Stripe repite el aviso: sale por «repetido» y no avisa otra vez.
    v_cierre := public.cem_compra_invitado_cerrar(v_compra, v_tres, false);
    v_n := v_n + 2;
    if (v_cierre ->> 'repetido') is distinct from 'true' then
      v_fallos := v_fallos || format('cerrar repetido sobre una %s no dice «repetido»: %s', r.estado, v_cierre);
    end if;
    if (select count(*) from cem_notificaciones where url = c_url || v_compra) is distinct from v_avisos then
      v_fallos := v_fallos || format('cerrar repetido sobre una %s avisó otra vez al equipo', r.estado);
    end if;
  end loop;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  if cardinality(v_fallos) > 0 then
    raise exception 'PRUEBA_FALLA: % de % comprobaciones: %',
      cardinality(v_fallos), v_n, array_to_string(v_fallos, ' | ');
  end if;
  raise exception 'PRUEBA_OK: % comprobaciones (programa a la venta: %)', v_n, v_a_la_venta;
end
$prueba$;
