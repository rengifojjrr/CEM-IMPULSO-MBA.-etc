-- La compra sin cuenta no pierde un cobro, el pago local termina, y anular
-- cierra lo que el pago abrió.
--
-- EL AGUJERO
-- Dos fallos de la compra sin cuenta (lo-que-falta §3.10), uno que el arreglo
-- del segundo habría encendido, y uno de anular que salió al revisar los pagos:
--   · Un cobro con tarjeta podía quedarse sin apuntar. cerrar-compra.ts cerraba
--     la compra (cem_compra_invitado_cerrar, que la marca «pagada») y DESPUÉS
--     apuntaba el pago (cem_reportar_pago_servidor): dos transacciones. Si el
--     pago fallaba, Stripe reintentaba, cerrar contestaba «repetido» y la
--     función devolvía OK: cobrado y sin apuntar, para siempre. Formas de que
--     fallara: la inscripción reutilizada no tenía cuota por pagar, la forma de
--     pago de la cuenta no estaba configurada, o se cortaba la conexión.
--     Reproducido el 9 de noviembre: compra «pagada», cero pagos. En la
--     confirmación manual era peor: una referencia repetida se tomaba por un
--     reintento, y el equipo leía «Confirmado, aula abierta» sin pago detrás.
--   · El pago local sin cuenta no podía terminar. cem_compra_invitado_reportar
--     sólo aceptaba compras «pendiente» o «reportada», pero nacen «abierta», y
--     escribía «reportada», que la tabla no admitía. La lista del equipo,
--     confirmar y rechazar, que buscan «reportada», no veían nunca nada.
--   · Y el monto declarado iba en euros (lo que tocaba pagar) a una función que
--     lo lee en la moneda de la forma de pago: 1,62 € declarados por pago móvil
--     se abonaban como 0,00 €. Arreglar lo de arriba sin esto lo encendía.
--   · Anular un pago aprobado devolvía el saldo a la cuota, pero la inscripción
--     que ese pago había activado seguía «activa», y una activa abre el aula.
--     Pasaba también con «Deshacer» en Verificar pagos.
-- Hoy no había ninguna compra sin cuenta, ni programa a la venta, ni forma de
-- pago local con destino: nada que reparar en los datos.
--
-- EL ARREGLO
--   · cem_compra_invitado_asentar cierra la compra y apunta el pago en UNA
--     transacción (cerrar → cem_reportar_pago → cem_aprobar_pago) y guarda el
--     pago en la compra (payment_id). Si el pago no entra no queda nada, ni la
--     marca «pagada», y el reintento lo intenta entero otra vez. cerrar queda
--     interna: sólo la llama asentar.
--   · La cuota que se paga es la primera que de verdad debe algo (pendiente,
--     parcial, vencida o congelada, con saldo), nunca una anulada o
--     reembolsada. Si no queda ninguna, el cobro se apunta en la última —el
--     dinero entró y tiene que constar— y se avisa al equipo para devolverlo o
--     aplicarlo. abrir se niega antes de cobrar si la inscripción ya no debe
--     nada: el mismo principio que con la congelada (20261108000005).
--   · cem_cuenta_por_correo: la cuenta por el correo exacto, en auth.users. La
--     usan abrir y cerrar-compra.ts, que la buscaba con ilike («_» y «%» hacen
--     de comodín) y, si no, con listUsers, que sólo mira la primera página.
--   · cem_compra_invitado_fallo: si asentar falla en el aviso de Stripe, el
--     error queda en la compra y el equipo se entera, una vez por cada error
--     distinto. Al asentarse, el error se borra.
--   · El pago local: «reportada» es un estado de la tabla. reportar acepta la
--     compra abierta (y la reportada, para corregir antes de que el equipo
--     actúe), exige una forma de pago con destino y un monto, y no toca una
--     compra abierta para tarjeta. El monto va en la moneda de la forma de
--     pago; la lista del equipo lo enseña así y con lo que equivale, y
--     confirmarlo lo apunta con la tasa del día en que se pagó, a nombre de
--     quien lo confirmó y sin decir que fue con tarjeta.
--   · El rescate («¿Seguimos?») escribe una vez por persona, y no a quien ya
--     declaró o pagó, ni a una compra cuyo cobro no se pudo apuntar.
--   · Anular cierra lo que ese pago abrió: si la auditoría dice que ESE pago
--     activó la inscripción, no le queda otro pago confirmado y cuesta algo,
--     vuelve a «pendiente»; si está congelada, se corrige la pausa para que
--     reactivarla no la reabra (20261108000004 la devuelve a lo que diga ahí).
--
-- LO QUE NO CAMBIA
-- abrir niega con el mismo mensaje neutro; cerrar elige la misma inscripción y
-- avisa igual de la congelada o la suspendida. El pago de los alumnos con
-- cuenta no se toca. Anular no cierra una inscripción activada a mano, por
-- beca o por otro pago, ni toca una finalizada, suspendida o cancelada.
--
-- LOS PERMISOS
-- asentar, fallo y cuenta_por_correo, sólo service_role: las llaman las
-- funciones de borde. cuenta_por_correo no se le da a authenticated porque
-- diría qué correos tienen cuenta. cerrar pasa a ser sólo del dueño, y
-- cem_equivalente_seguro es interna. reportar sigue siendo una puerta de
-- invitado (anon), pero con los permisos escritos: sin PUBLIC. anular sigue
-- siendo del equipo (authenticated, con su comprobación dentro).
--
-- Las pruebas: pruebas/sql/compra-sin-cuenta.sql (antes de esto, 22 fallos de
-- 28) y pruebas/sql/anular-pago.sql (4 de 9).

-- ═══ 1. LA TABLA ═════════════════════════════════════════════════════════════

alter table public.cem_compras_invitado
  drop constraint cem_compras_invitado_estado_check,
  add constraint cem_compras_invitado_estado_check
    check (estado = any (array['abierta', 'reportada', 'pagada', 'cancelada', 'fallida'])),
  add column payment_id uuid references public.cem_payments(id),
  add column error_cierre text,
  add column error_en timestamptz;

comment on column public.cem_compras_invitado.payment_id is
  'El pago con que se asentó la compra. Lo pone cem_compra_invitado_asentar en la misma transacción que la marca «pagada»: una compra pagada sin pago no puede existir.';
comment on column public.cem_compras_invitado.error_cierre is
  'Por qué no se pudo asentar el último aviso de Stripe (cem_compra_invitado_fallo). Se borra al asentarse.';

-- ═══ 2. LA CUENTA, POR EL CORREO EXACTO ══════════════════════════════════════

create or replace function public.cem_cuenta_por_correo(p_email text)
returns uuid
language sql stable security definer set search_path = public
as $$
  select u.id
    from auth.users u
   where lower(u.email) = nullif(lower(btrim(coalesce(p_email, ''))), '')
   order by u.created_at
   limit 1;
$$;

comment on function public.cem_cuenta_por_correo(text) is
  'La cuenta de acceso con ese correo, sin mayúsculas ni espacios y sin comodines. Sólo para el servidor: a cualquier otro le diría qué correos tienen cuenta. La usan cem_compra_invitado_abrir y cerrar-compra.ts.';

revoke all on function public.cem_cuenta_por_correo(text) from public, anon, authenticated;
grant execute on function public.cem_cuenta_por_correo(text) to service_role;

-- ═══ 3. ABRIR: TAMPOCO SI YA NO SE DEBE NADA ════════════════════════════════

CREATE OR REPLACE FUNCTION public.cem_compra_invitado_abrir(p_course_id uuid, p_nombre text, p_email text, p_cuotas integer DEFAULT 1, p_cohort_id uuid DEFAULT NULL::uuid, p_ip text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_c public.cem_courses; v_id uuid;
  v_email text := lower(trim(coalesce(p_email,'')));
  v_nombre text := trim(coalesce(p_nombre,''));
  v_factor numeric; v_total numeric; v_primera numeric; v_recientes int;
  v_destino public.cem_enrollments;
begin
  if v_nombre = '' or length(v_nombre) < 2 then
    raise exception 'Hace falta tu nombre.';
  end if;
  -- Comprobación deliberadamente simple: aquí no se valida si el correo
  -- existe, sólo que tenga forma de correo. Lo demás lo dice el pago.
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'Ese correo no parece un correo.';
  end if;
  if p_cuotas not in (1,3,6) then
    raise exception 'El plan de pago debe ser de 1, 3 o 6 cuotas.';
  end if;

  /* Un tope por correo. Sin esto, esta puerta —que es pública y sin sesión—
     deja abrir cobros en bucle: ruido en Stripe y una tabla que crece sola. */
  select count(*) into v_recientes from public.cem_compras_invitado
   where lower(email) = v_email and creada_en > now() - interval '1 hour';
  if v_recientes >= 6 then
    raise exception 'Demasiados intentos con ese correo. Prueba en un rato o escríbenos.';
  end if;

  /* No se cobra lo que pagar no abre ni lo que ya no se debe.
       · Pagar no abre una inscripción congelada ni una suspendida
         (20261107000006).
       · Una inscripción sin ninguna cuota que deba algo (pagada entera, o de
         beca, que no tiene cuotas) no tiene dónde recibir este pago.
     En los dos casos se niega aquí, antes de cobrar, y no después con el
     dinero ya dentro.

     Se mira la inscripción que usaría cem_compra_invitado_cerrar, con su
     mismo orden: si al lado hay una activa o una pendiente, el pago va a ésa.
     Si se cambia el orden allí, se cambia aquí. La cuenta se busca como la
     busca el aviso de pago: cem_cuenta_por_correo, el correo exacto.

     El mensaje no dice qué hay —ni si existe la cuenta, ni cómo está— porque
     llega tal cual a quien escribió el correo, que puede ser cualquiera. */
  select e.* into v_destino
    from public.cem_enrollments e
   where e.profile_id = public.cem_cuenta_por_correo(v_email)
     and e.course_id = p_course_id
     and e.estado not in ('cancelada','finalizada')
   order by case e.estado when 'activa' then 0 when 'pendiente' then 1 else 2 end,
            e.created_at desc, e.id
   limit 1;
  if v_destino.id is not null
     and (v_destino.estado in ('congelada', 'suspendida')
          or not exists (select 1 from public.cem_installments i
                          where i.enrollment_id = v_destino.id
                            and i.estado in ('pendiente', 'parcial', 'vencida', 'congelada')
                            and coalesce(i.saldo, i.monto) > 0.009)) then
    raise exception 'No podemos abrir esta compra. Si ya tienes una cuenta en el CEM, entra con ella o escríbenos y lo resolvemos.';
  end if;

  select * into v_c from public.cem_courses where id = p_course_id;
  if v_c.id is null then raise exception 'Ese programa no existe.'; end if;
  if v_c.estado is distinct from 'publicado' then
    raise exception 'Ese programa no está abierto a inscripción ahora mismo.';
  end if;
  if coalesce(v_c.precio, 0) <= 0 then
    raise exception 'Ese programa no tiene precio puesto. Escríbenos y lo resolvemos.';
  end if;

  -- El MISMO factor que cem_inscribir_a. Si esto y aquello dijeran cosas
  -- distintas, se cobraría un importe y se crearía la cuota por otro.
  v_factor := case p_cuotas when 1 then 0.9 when 3 then 1 when 6 then 1.06 end;
  v_total := round(coalesce(v_c.precio,0) * v_factor, 2);
  v_primera := round(v_total / p_cuotas, 2);

  insert into public.cem_compras_invitado
    (course_id, cohort_id, nombre, email, cuotas, monto, moneda, ip)
  values (p_course_id, p_cohort_id, v_nombre, v_email, p_cuotas,
          v_primera, coalesce(v_c.moneda,'USD'), p_ip)
  returning id into v_id;

  return jsonb_build_object(
    'compra_id', v_id, 'nombre', v_nombre, 'email', v_email,
    'curso', v_c.nombre, 'stripe_product_id', v_c.stripe_product_id,
    'cuotas', p_cuotas, 'total', v_total,
    'a_cobrar_ahora', v_primera, 'moneda', coalesce(v_c.moneda,'USD'));
end $function$;

comment on function public.cem_compra_invitado_abrir(uuid, text, text, integer, uuid, text) is
  'Abre la intención de compra de alguien sin cuenta y pone el importe. Se niega, con un mensaje que no dice qué hay, si el pago iba a caer en una inscripción congelada, suspendida o que ya no debe nada. Sólo para el servidor (cem-comprar).';

revoke all on function public.cem_compra_invitado_abrir(uuid, text, text, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.cem_compra_invitado_abrir(uuid, text, text, integer, uuid, text) to service_role;

-- ═══ 4. CERRAR: LA CUOTA QUE DE VERDAD DEBE, Y SÓLO DESDE ASENTAR ═══════════

CREATE OR REPLACE FUNCTION public.cem_compra_invitado_cerrar(p_compra_id uuid, p_profile_id uuid, p_cuenta_nueva boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_c record; v_ins public.cem_enrollments; v_cuota uuid; v_sin_cuota boolean := false;
        v_curso text; v_como text;
begin
  select * into v_c from public.cem_compras_invitado where id = p_compra_id for update;
  if v_c.id is null then raise exception 'Esa compra no existe.'; end if;

  -- Ya asentada. Desde 20261109000001 «pagada» y el pago se escriben en la
  -- misma transacción (cem_compra_invitado_asentar), así que esto quiere
  -- decir de verdad que el cobro consta.
  if v_c.estado = 'pagada' and v_c.enrollment_id is not null then
    select id into v_cuota from public.cem_installments
     where enrollment_id = v_c.enrollment_id order by numero limit 1;
    return jsonb_build_object('repetido', true, 'enrollment_id', v_c.enrollment_id,
                              'installment_id', v_cuota, 'profile_id', v_c.profile_id,
                              'payment_id', v_c.payment_id);
  end if;

  /* Si ya tenía una inscripción abierta en ese programa —compró dos veces, o
     ya estaba inscrito con otra forma de pago— NO se crea otra: se usa la que
     hay y el pago entra ahí. Crear una segunda dejaría dos carteras para la
     misma persona y el mismo curso.

     Si tiene más de una, se elige siempre la misma: la activa, después la
     pendiente (el pago la abre) y, a igualdad, la más nueva. Antes era un
     LIMIT 1 sin orden, y una congelada podía tapar a la activa.
     cem_compra_invitado_abrir mira con este mismo orden: si se cambia aquí,
     se cambia allí. */
  select * into v_ins from public.cem_enrollments
   where profile_id = p_profile_id and course_id = v_c.course_id
     and estado not in ('cancelada','finalizada')
   order by case estado when 'activa' then 0 when 'pendiente' then 1 else 2 end,
            created_at desc, id
   limit 1;

  if v_ins.id is null then
    v_ins := public.cem_inscribir_a(p_profile_id, v_c.course_id, v_c.cohort_id, v_c.cuotas, null);
  end if;

  /* La primera cuota que de verdad debe algo. Antes era «la primera que no
     esté pagada», y eso incluía una anulada o una reembolsada. */
  select id into v_cuota from public.cem_installments
   where enrollment_id = v_ins.id
     and estado in ('pendiente', 'parcial', 'vencida', 'congelada')
     and coalesce(saldo, monto) > 0.009
   order by numero limit 1;

  /* Ninguna: dos compras en carrera, o una que se abrió antes de que esta
     inscripción quedara pagada. El dinero ya entró y tiene que constar, así
     que va a la última cuota, y asentar avisa al equipo para devolverlo o
     aplicarlo. abrir lo niega antes de cobrar; esto es lo que se le escapa. */
  if v_cuota is null then
    v_sin_cuota := true;
    select id into v_cuota from public.cem_installments
     where enrollment_id = v_ins.id order by numero desc limit 1;
  end if;

  update public.cem_compras_invitado
     set estado = 'pagada', pagada_en = now(), profile_id = p_profile_id,
         enrollment_id = v_ins.id, cuenta_nueva = coalesce(p_cuenta_nueva, cuenta_nueva)
   where id = p_compra_id;

  /* Cayó en una congelada o en una suspendida. abrir lo niega antes de
     cobrar, pero no llega a todo: la sesión de Stripe sigue abierta horas y
     la inscripción pudo pararse entre medias.

     El dinero ya está cobrado, así que aquí NO se lanza: Stripe reintentaría
     el aviso durante días por algo que no se arregla solo. Se apunta como
     siempre, el estado va en la respuesta y se avisa al equipo, que es quien
     decide si reactiva o devuelve: pagar no reabre la inscripción. Un
     reintento del aviso sale por «repetido», arriba, y no avisa dos veces. */
  if v_ins.estado in ('congelada', 'suspendida') then
    v_como := case v_ins.estado when 'congelada' then 'en pausa' else 'suspendida' end;
    select nombre into v_curso from public.cem_courses where id = v_c.course_id;
    perform cem_avisar_equipo(
      'compra_en_pausa',
      'Pago sobre una inscripción ' || v_como || ': ' || v_c.nombre,
      v_c.nombre || ' (' || v_c.email || ') pagó ' || coalesce(v_curso, 'un programa')
        || ' sin entrar con su cuenta, y su inscripción en ese programa está ' || v_como
        || '. El pago se apunta en ella, pero pagar no la reabre: el aula sigue cerrada.'
        || ' Hay que decidir si se reactiva o se le devuelve el dinero.',
      '/plataforma/admin/inscripciones.html?compra=' || p_compra_id,
      array['admin','superadmin','cobranza','coordinador']);
  end if;

  return jsonb_build_object('enrollment_id', v_ins.id, 'installment_id', v_cuota,
                            'profile_id', p_profile_id, 'estado', v_ins.estado,
                            'sin_cuota', v_sin_cuota);
end $function$;

comment on function public.cem_compra_invitado_cerrar(uuid, uuid, boolean) is
  'Interna: la llama cem_compra_invitado_asentar, en la misma transacción que el pago. Usa (o crea) la inscripción, elige la primera cuota que debe algo —o la última, con sin_cuota— y marca la compra pagada. Llamada sola dejaría una compra pagada sin pago: por eso no la ejecuta nadie más que su dueño.';

revoke all on function public.cem_compra_invitado_cerrar(uuid, uuid, boolean) from public, anon, authenticated, service_role;

-- ═══ 5. ASENTAR: CERRAR Y APUNTAR, EN UNA TRANSACCIÓN ═══════════════════════

create or replace function public.cem_compra_invitado_asentar(
  p_compra_id uuid, p_profile_id uuid, p_cuenta_nueva boolean,
  p_monto numeric, p_referencia text, p_metodo text, p_confirmado_por uuid default null)
returns jsonb
language plpgsql security definer set search_path = public
as $function$
declare
  v       jsonb;
  v_c     public.cem_compras_invitado;
  v_cuota uuid;
  v_pago  public.cem_payments;
  v_nota  text;
  v_curso text;
begin
  -- auth.uid() es nulo cuando llama la cuenta de servicio. Con sesión es una
  -- persona intentando entrar por la puerta del servidor.
  if auth.uid() is not null then
    raise exception 'Esta función es sólo para el servidor.' using errcode = '42501';
  end if;

  v := public.cem_compra_invitado_cerrar(p_compra_id, p_profile_id, p_cuenta_nueva);
  if (v ->> 'repetido') = 'true' then
    return v;
  end if;

  v_cuota := (v ->> 'installment_id')::uuid;
  if v_cuota is null then
    -- Sólo pasa con una inscripción sin cuotas (las de beca no tienen), que
    -- abrir ya niega: el cobro tiene que entrar a mano, y no hay que dejarlo
    -- pasar como hecho.
    raise exception 'La inscripción de esta compra no tiene cuotas donde apuntar el cobro: hay que devolverlo o apuntarlo a mano.';
  end if;

  select * into v_c from public.cem_compras_invitado where id = p_compra_id;

  v_nota := case when p_confirmado_por is null
    then 'Cobrado con tarjeta sin cuenta. Confirmado por la pasarela, sin verificación manual.'
    else 'Pagado sin cuenta por ' || coalesce(nullif(btrim(p_metodo), ''), 'pago local')
         || '; comprobado en el banco por el equipo.' end;
  if (v ->> 'sin_cuota') = 'true' then
    v_nota := v_nota || ' Entró sin ninguna cuota por pagar: hay que devolverlo o aplicarlo.';
  end if;

  /* Por la puerta de siempre: cem_reportar_pago convierte con la forma de
     pago (el monto viene en SU moneda) y cem_aprobar_pago abona la cuota y,
     por el disparador, activa la inscripción. Si cualquiera de las dos lanza
     —forma de pago sin configurar, referencia ya usada, monto cero—, se
     deshace todo, también la marca de cerrar.

     La fecha del pago es la del día en que se pagó: con tarjeta, ahora; un
     pago local, el día en que la persona lo declaró, que es la tasa que vio. */
  v_pago := public.cem_reportar_pago(
    p_installment_id  := v_cuota,
    p_monto           := p_monto,
    p_moneda          := null,
    p_referencia      := left(btrim(coalesce(p_referencia, '')), 40),
    p_metodo          := p_metodo,
    p_fecha           := case when p_confirmado_por is null then now()
                              else coalesce(v_c.reportada_en, now()) end,
    p_comprobante_url := null,
    p_nota            := v_nota);
  if p_confirmado_por is not null then
    update public.cem_payments set registrado_por = p_confirmado_por where id = v_pago.id;
  end if;
  -- Sin nota: así no pisa la de arriba, ni el «Revisar» que pone
  -- cem_reportar_pago cuando el monto no cuadra con la cuota.
  perform public.cem_aprobar_pago(v_pago.id, null);

  update public.cem_compras_invitado
     set payment_id = v_pago.id, error_cierre = null, error_en = null
   where id = p_compra_id;

  if (v ->> 'sin_cuota') = 'true' then
    select nombre into v_curso from public.cem_courses where id = v_c.course_id;
    perform cem_avisar_equipo(
      'compra_sin_cuota',
      'Cobro sin cuota pendiente: ' || v_c.nombre,
      v_c.nombre || ' (' || v_c.email || ') pagó ' || coalesce(v_curso, 'un programa')
        || ' sin entrar con su cuenta, y su inscripción ya no debía nada. El cobro se apuntó'
        || ' en la última cuota para que conste: hay que devolverlo o aplicarlo.',
      '/plataforma/admin/inscripciones.html?compra=' || p_compra_id,
      array['admin','superadmin','cobranza','coordinador']);
  end if;

  return v || jsonb_build_object('payment_id', v_pago.id);
end $function$;

comment on function public.cem_compra_invitado_asentar(uuid, uuid, boolean, numeric, text, text, uuid) is
  'Convierte una compra sin cuenta en alumno y apunta su cobro, todo en una transacción: cem_compra_invitado_cerrar, cem_reportar_pago (el monto en la moneda de la forma de pago) y cem_aprobar_pago. Si el pago no entra no queda nada; un reintento de una ya asentada sale por «repetido» con su payment_id. p_confirmado_por: quien del equipo confirmó un pago local (nulo si lo confirma Stripe). Sólo para el servidor.';

revoke all on function public.cem_compra_invitado_asentar(uuid, uuid, boolean, numeric, text, text, uuid) from public, anon, authenticated;
grant execute on function public.cem_compra_invitado_asentar(uuid, uuid, boolean, numeric, text, text, uuid) to service_role;

-- ═══ 6. QUE UN FALLO SE VEA ══════════════════════════════════════════════════

create or replace function public.cem_compra_invitado_fallo(p_compra_id uuid, p_error text)
returns void
language plpgsql security definer set search_path = public
as $function$
declare
  v_c     public.cem_compras_invitado;
  v_error text := left(coalesce(nullif(btrim(p_error), ''), 'Error sin mensaje'), 500);
  v_curso text;
begin
  select * into v_c from public.cem_compras_invitado where id = p_compra_id for update;
  if v_c.id is null or v_c.estado = 'pagada' then return; end if;

  update public.cem_compras_invitado
     set error_cierre = v_error, error_en = now()
   where id = p_compra_id;

  -- Stripe reintenta durante días: el mismo error no se avisa en cada intento.
  if v_c.error_cierre is not distinct from v_error then return; end if;

  select nombre into v_curso from public.cem_courses where id = v_c.course_id;
  perform cem_avisar_equipo(
    'compra_sin_asentar',
    'Un cobro sin cuenta no se pudo apuntar: ' || v_c.nombre,
    v_c.nombre || ' (' || v_c.email || ') pagó ' || coalesce(v_curso, 'un programa')
      || ' con tarjeta y el cobro no se pudo apuntar: ' || v_error
      || '. El dinero está cobrado y todavía no consta. Stripe lo reintentará solo:'
      || ' si el error no se arregla (por ejemplo, una forma de pago sin configurar), hay que arreglarlo.',
    '/plataforma/admin/inscripciones.html?compra=' || p_compra_id,
    array['admin','superadmin','cobranza','coordinador']);
end $function$;

comment on function public.cem_compra_invitado_fallo(uuid, text) is
  'El aviso de Stripe no pudo asentar la compra: deja el error en ella (error_cierre) y avisa al equipo, una vez por cada error distinto. No toca una compra ya pagada. Sólo para el servidor (cerrar-compra.ts).';

revoke all on function public.cem_compra_invitado_fallo(uuid, text) from public, anon, authenticated;
grant execute on function public.cem_compra_invitado_fallo(uuid, text) to service_role;

-- ═══ 7. EL PAGO LOCAL: REPORTAR, Y LO QUE VE EL EQUIPO ══════════════════════

-- Lo que vale un monto en la moneda base, o nada si no se puede saber (forma
-- de pago sin configurar, día sin tasa). Para enseñarlo, no para apuntarlo:
-- apuntar sigue lanzando si no se puede convertir.
create or replace function public.cem_equivalente_seguro(p_monto numeric, p_metodo text, p_fecha date default current_date)
returns numeric
language plpgsql stable security definer set search_path = public
as $function$
begin
  if p_monto is null or p_metodo is null then return null; end if;
  return (select e.monto_base
            from public.cem_equivalente_en_base(p_monto, p_metodo, coalesce(p_fecha, current_date)) e);
exception when others then
  return null;
end $function$;

comment on function public.cem_equivalente_seguro(numeric, text, date) is
  'cem_equivalente_en_base sin lanzar: el monto en la moneda base, o nulo si la forma de pago no está configurada o ese día no hay tasa. Interna: la usa cem_compras_invitado_pendientes para enseñar, nunca para apuntar.';

revoke all on function public.cem_equivalente_seguro(numeric, text, date) from public, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cem_compra_invitado_reportar(p_compra_id uuid, p_metodo text, p_referencia text, p_monto numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  c        public.cem_compras_invitado;
  v_curso  text;
  v_metodo text := btrim(coalesce(p_metodo, ''));
  v_ref    text := btrim(coalesce(p_referencia, ''));
begin
  select * into c from public.cem_compras_invitado where id = p_compra_id for update;
  if not found then raise exception 'Esa compra no existe.'; end if;

  -- Una compra abierta para pagar con tarjeta tiene su cobro en Stripe; si se
  -- pudiera declarar también por el banco, podría acabar apuntada dos veces.
  if c.session_id is not null then
    raise exception 'Esta compra se abrió para pagar con tarjeta. Si pagaste por transferencia o pago móvil, vuelve a empezar eligiendo esa forma de pago.';
  end if;
  -- Nace «abierta». «reportada» también vale: es corregir lo declarado antes
  -- de que el equipo lo mire.
  if c.estado not in ('abierta', 'reportada') then
    raise exception 'Esa compra ya no está a la espera.';
  end if;
  if v_ref = '' then
    raise exception 'Hace falta la referencia del pago.';
  end if;
  -- Las mismas que se le enseñan (cem_donde_pagar_publico): activas y con
  -- destino. Otra no se podría convertir al confirmarla.
  if not exists (select 1 from public.cem_metodos_pago m
                  where m.metodo = v_metodo and m.activo
                    and nullif(btrim(coalesce(m.destino, '')), '') is not null) then
    raise exception 'Esa forma de pago no está disponible para pagar sin cuenta.';
  end if;
  -- En la moneda de la forma de pago: bolívares si fue pago móvil.
  if p_monto is null or p_monto <= 0 then
    raise exception 'Escribe cuánto pagaste.';
  end if;

  select nombre into v_curso from public.cem_courses where id = c.course_id;

  update public.cem_compras_invitado
     set estado = 'reportada',
         metodo = v_metodo,
         referencia = left(v_ref, 60),
         monto_reportado = round(p_monto, 2),
         reportada_en = now()
   where id = p_compra_id;

  -- El equipo se entera por la campana.
  perform cem_avisar_equipo(
    'pago_reportado',
    'Pago reportado sin cuenta: ' || coalesce(c.nombre, c.email),
    coalesce(c.nombre, 'Alguien') || ' dice haber pagado ' || coalesce(v_curso, 'un programa')
      || ' por ' || v_metodo || ', referencia ' || left(v_ref, 60) || '.',
    '/plataforma/admin/inscripciones.html?compra=' || p_compra_id,
    array['admin','superadmin','cobranza','coordinador']);

  return jsonb_build_object('ok', true, 'compra_id', p_compra_id);
end;
$function$;

comment on function public.cem_compra_invitado_reportar(uuid, text, text, numeric) is
  'Quien compró sin cuenta declara su pago local: forma de pago (una con destino), referencia y cuánto pagó, en la moneda de esa forma de pago. Acepta la compra abierta y la reportada (para corregir); no una abierta para tarjeta. Puerta de invitado: la ejecuta anon, y el número de compra es la llave.';

revoke all on function public.cem_compra_invitado_reportar(uuid, text, text, numeric) from public;
grant execute on function public.cem_compra_invitado_reportar(uuid, text, text, numeric) to anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cem_compras_invitado_pendientes()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case when not cem_puede_cobranza() then '[]'::jsonb else
    coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'nombre', c.nombre, 'email', c.email,
        'curso', cu.nombre, 'course_id', c.course_id,
        'cuotas', c.cuotas, 'a_cobrar', c.monto, 'moneda', c.moneda,
        'metodo', c.metodo, 'referencia', c.referencia,
        -- Lo declarado va en la moneda de la forma de pago, y lo que equivale
        -- en la del programa, a la tasa del día en que se declaró.
        'monto_reportado', c.monto_reportado,
        'moneda_pago', m.moneda,
        'equivale', cem_equivalente_seguro(c.monto_reportado, c.metodo,
                                           (coalesce(c.reportada_en, now()))::date),
        'estado', c.estado,
        'reportada_en', c.reportada_en, 'creada_en', c.creada_en)
      order by c.reportada_en desc nulls last, c.creada_en desc)
      from cem_compras_invitado c
      left join cem_courses cu on cu.id = c.course_id
      left join cem_metodos_pago m on m.metodo = c.metodo
     where c.estado = 'reportada'), '[]'::jsonb)
  end;
$function$;

comment on function public.cem_compras_invitado_pendientes() is
  'Cobranza: los pagos locales declarados por gente sin cuenta, por confirmar. El monto declarado va en la moneda de la forma de pago (moneda_pago) y «equivale» dice cuánto es en la del programa.';

revoke all on function public.cem_compras_invitado_pendientes() from public, anon;
grant execute on function public.cem_compras_invitado_pendientes() to authenticated, service_role;

-- ═══ 8. EL RESCATE: UNA VEZ, Y NO A QUIEN YA PAGÓ ═══════════════════════════

CREATE OR REPLACE FUNCTION public.cem_compras_rescatar()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_fila record; v_n int := 0; v_url text;
begin
  -- Una por persona: la compra abierta más reciente. Quien abrió tres no
  -- recibe tres correos.
  for v_fila in
    select distinct on (lower(c.email)) c.*, k.nombre as curso_nombre
      from cem_compras_invitado c
      join cem_courses k on k.id = c.course_id
     where c.estado = 'abierta'
       and c.rescatada_en is null
       and c.error_cierre is null
       and c.creada_en < now() - interval '1 hour'
       and c.creada_en > now() - interval '3 days'
       -- Si esa persona ya acabó comprando por otro lado, no se le persigue.
       and not exists (select 1 from cem_profiles p
                        where lower(p.email) = lower(c.email))
       -- Ni si ya declaró un pago, o pagó, o pagó y no se pudo apuntar: a
       -- quien está esperando que le confirmen no se le dice que quedó a medias.
       and not exists (select 1 from cem_compras_invitado o
                        where lower(o.email) = lower(c.email)
                          and (o.estado in ('reportada', 'pagada') or o.error_cierre is not null))
     order by lower(c.email), c.creada_en desc
     limit 50
  loop
    v_url := 'https://escuelacem.com/plataforma/comprar.html?curso=' || v_fila.course_id;

    insert into cem_correo_cola (para, asunto, cuerpo, clave)
    values (v_fila.email,
            format('¿Seguimos con %s?', v_fila.curso_nombre),
            format(E'Hola %s:\n\n'
                   'Empezaste a inscribirte en %s y quedó a medias. No se perdió nada: '
                   'puedes terminar desde aquí, y tarda un minuto.\n\n%s\n\n'
                   'Si te quedó alguna duda, respóndenos a este correo y te contamos.\n\n'
                   'CEM International',
                   split_part(v_fila.nombre, ' ', 1), v_fila.curso_nombre, v_url),
            md5('rescate|' || v_fila.id::text))
    on conflict (clave) where estado = 'pendiente' do nothing;

    -- Las demás abiertas de esa persona quedan marcadas también.
    update cem_compras_invitado set rescatada_en = now()
     where lower(email) = lower(v_fila.email) and estado = 'abierta' and rescatada_en is null;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $function$;

comment on function public.cem_compras_rescatar() is
  'La tarea periódica: a quien empezó a comprar sin cuenta hace entre una hora y tres días, y no terminó, le escribe una vez «¿Seguimos?». No a quien ya tiene cuenta, ya declaró un pago, ya pagó o pagó sin que se pudiera apuntar.';

revoke all on function public.cem_compras_rescatar() from public, anon, authenticated;
grant execute on function public.cem_compras_rescatar() to service_role;

-- ═══ 9. ANULAR CIERRA LO QUE EL PAGO ABRIÓ ═══════════════════════════════════

CREATE OR REPLACE FUNCTION public.cem_anular_pago(p_payment_id uuid, p_motivo text)
 RETURNS cem_payments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pago public.cem_payments;
  v_cuota public.cem_installments;
  v_saldo numeric;
  v_ins public.cem_enrollments;
  v_sol uuid;
begin
  if not public.cem_puede_cobranza() then
    raise exception 'Sólo el personal de cobranza puede anular un pago.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Hay que dejar por escrito por qué se anula el pago.';
  end if;
  select * into v_pago from public.cem_payments where id = p_payment_id;
  if v_pago.id is null then raise exception 'Ese pago no existe.'; end if;
  if v_pago.estado = 'anulado' then raise exception 'Ese pago ya estaba anulado.'; end if;

  if v_pago.estado = 'confirmado' and v_pago.installment_id is not null then
    select * into v_cuota from public.cem_installments where id = v_pago.installment_id;
    v_saldo := round(coalesce(v_cuota.saldo, 0) + coalesce(v_pago.monto_base, v_pago.monto), 2);
    update public.cem_installments
       set saldo = least(v_saldo, v_cuota.monto),
           estado = case when v_saldo >= v_cuota.monto - 0.01 then 'pendiente'::public.cem_cuota_estado
                         else 'parcial'::public.cem_cuota_estado end
     where id = v_cuota.id;
  end if;

  update public.cem_payments
     set estado = 'anulado', conciliado = false, nota = 'Anulado: ' || btrim(p_motivo)
   where id = p_payment_id
   returning * into v_pago;

  insert into public.cem_audit_events (accion, entidad, entidad_id, riesgo, detalle)
  values ('pago_anulado', 'cem_payments', p_payment_id, 'alto',
          jsonb_build_object('referencia', v_pago.referencia, 'monto', v_pago.monto, 'motivo', btrim(p_motivo)));

  /* Lo que ese pago abrió, se cierra. Aprobar el primer pago de una pendiente
     la deja activa (cem_tg_activar_al_pagar), y una activa abre el aula
     siempre: sin esto, anular —o «Deshacer» en Verificar pagos— devolvía el
     saldo y dejaba el aula abierta.

     Sólo si la auditoría dice que fue ESE pago el que la activó, si no le
     queda otro pago confirmado y si cuesta algo. Una activada a mano, por beca
     o por otro pago no se toca, ni una finalizada, suspendida o cancelada. */
  if v_pago.enrollment_id is not null
     and exists (select 1 from public.cem_audit_events a
                  where a.accion = 'inscripcion_activada_por_pago'
                    and a.entidad_id = v_pago.enrollment_id
                    and a.detalle ->> 'pago' = v_pago.id::text)
     and not exists (select 1 from public.cem_payments p
                      where p.enrollment_id = v_pago.enrollment_id and p.estado = 'confirmado') then
    select * into v_ins from public.cem_enrollments where id = v_pago.enrollment_id for update;
    if coalesce(v_ins.precio_final, 0) > 0 then
      if v_ins.estado = 'activa' then
        update public.cem_enrollments set estado = 'pendiente' where id = v_ins.id;
        insert into public.cem_audit_events (actor_id, accion, entidad, entidad_id, riesgo, detalle)
        values (auth.uid(), 'inscripcion_cerrada_por_anulacion', 'cem_enrollments', v_ins.id, 'alto',
                jsonb_build_object('pago', v_pago.id, 'estaba', 'activa', 'motivo', btrim(p_motivo)));
      elsif v_ins.estado = 'congelada' then
        /* En pausa: no se le cambia el estado, pero la pausa apunta a qué
           volver (datos.estado_previo, 20261108000004). Si dice «activa» por
           este pago, reactivarla la reabriría sin ninguno. */
        select s.id into v_sol from public.cem_solicitudes_inscripcion s
         where s.enrollment_id = v_ins.id and s.tipo = 'congelamiento' and s.estado = 'aprobada'
         order by s.resuelto_en desc nulls last, s.created_at desc
         limit 1;
        if v_sol is not null then
          update public.cem_solicitudes_inscripcion
             set datos = coalesce(datos, '{}'::jsonb) || jsonb_build_object('estado_previo', 'pendiente')
           where id = v_sol and coalesce(datos ->> 'estado_previo', '') = 'activa';
          if found then
            insert into public.cem_audit_events (actor_id, accion, entidad, entidad_id, riesgo, detalle)
            values (auth.uid(), 'inscripcion_cerrada_por_anulacion', 'cem_enrollments', v_ins.id, 'alto',
                    jsonb_build_object('pago', v_pago.id, 'estaba', 'congelada', 'solicitud', v_sol,
                                       'motivo', btrim(p_motivo)));
          end if;
        end if;
      end if;
    end if;
  end if;

  return v_pago;
end; $function$;

comment on function public.cem_anular_pago(uuid, text) is
  'Cobranza anula un pago: devuelve su importe a la cuota y, si ese pago fue el que activó la inscripción y no le queda otro confirmado, la devuelve a pendiente (o corrige su pausa, si está congelada). Es también lo que hace «Deshacer» al aprobar en Verificar pagos.';

revoke all on function public.cem_anular_pago(uuid, text) from public, anon;
grant execute on function public.cem_anular_pago(uuid, text) to authenticated, service_role;
