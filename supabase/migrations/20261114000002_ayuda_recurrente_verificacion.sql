-- La ayuda recurrente cuando falta confirmar la cuenta bancaria.
--
-- Quien escribe los datos de su cuenta a mano en Stripe Checkout (en vez de
-- elegir su banco de la lista) no paga todavía: Stripe le manda un depósito de
-- prueba (1–2 días hábiles) y un correo para confirmarlo, y el cobro no empieza
-- hasta entonces. Tiene 10 días. Pasó con las dos primeras (SUS-000004 y
-- SUS-000005): la plataforma las daba por «Activas» y les escribió «quedó
-- activo», sin decirles que les faltaba ese paso.
--
-- Stripe no avisa de esto con un evento propio de la suscripción: la sesión
-- llega «completada» y sin pagar. El webhook pregunta entonces a Stripe por el
-- pago de ese cliente y, si está esperando el depósito de prueba, llama aquí
-- con el enlace para confirmarlo y la fecha en que llega.
--
-- Lo que cambia:
-- · Tres columnas: desde cuándo falta confirmar, el enlace de Stripe, cuándo
--   llega el depósito y de qué tipo es (un código o dos cantidades).
-- · Un correo «Falta un paso» en lugar del de alta, una sola vez.
-- · Si el primer cobro no llega a hacerse (la cuenta no se confirmó, el banco
--   lo rechazó o Stripe la dio por caducada), la ayuda se cierra con UN correo
--   —«no llegó a empezar, no se te cobró nada»— venga el aviso que venga.
--   Antes podían salir tres: el de cobro fallido (que promete un reintento
--   que no existe), el de baja y ninguno que dijera lo que pasó.

-- ═══ 1. LO QUE SE GUARDA ════════════════════════════════════════════════════

alter table public.cem_becas_suscripciones
  add column if not exists verificando_desde timestamptz,
  add column if not exists verificar_url text,
  add column if not exists verificar_llegada date,
  add column if not exists verificar_tipo text;
comment on column public.cem_becas_suscripciones.verificando_desde is
  'Desde cuándo falta que quien paga confirme su cuenta con el depósito de prueba de Stripe (escribió la cuenta a mano). Vacía: no falta nada. Se vacía al entrar el primer cobro.';
comment on column public.cem_becas_suscripciones.verificar_url is
  'El enlace de Stripe (payments.stripe.com) donde quien paga confirma el depósito de prueba. Sólo se enseña en su página, con su llave.';

-- ═══ 2. AYUDAS ══════════════════════════════════════════════════════════════

-- «lunes 16 de noviembre» / «Monday, November 16», para decir cuándo llega el
-- depósito de prueba.
create or replace function public.cem_becas_dia_texto(p_fecha date, p_idioma text)
returns text
language sql immutable as $$
  select case when p_fecha is null then null
    when p_idioma = 'en' then (array['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'])[extract(isodow from p_fecha)::int]
         || ', ' || (array['January','February','March','April','May','June','July','August',
                           'September','October','November','December'])[extract(month from p_fecha)::int]
         || ' ' || extract(day from p_fecha)::int
    else (array['lunes','martes','miércoles','jueves','viernes','sábado','domingo'])[extract(isodow from p_fecha)::int]
         || ' ' || extract(day from p_fecha)::int || ' de '
         || (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre',
                   'noviembre','diciembre'])[extract(month from p_fecha)::int] end;
$$;

-- Los correos a quien sostiene una ayuda recurrente. A los de 20261114000001
-- (alta, fallo, baja) se suman «verificar» (falta confirmar la cuenta) y
-- «sin_verificar» (no llegó a empezar). El de alta gana una frase para quien
-- escribió la cuenta a mano, por si el aviso de Stripe no llegara a tiempo.
create or replace function public.cem_becas_recurrente_correo(p_id uuid, p_tipo text, p_clave_correo text)
returns void
language plpgsql security definer set search_path = public as $$
declare s cem_becas_suscripciones; v_en boolean; v_hola text; v_monto text; v_enlace text;
        v_cobros int; v_total numeric; v_asunto text; v_cuerpo text;
        v_cuando text; v_paso text; v_dato text; v_donde text;
begin
  select * into s from cem_becas_suscripciones where id = p_id;
  if s.id is null or s.donante_email is null then return; end if;
  v_en := s.idioma = 'en';
  v_monto := cem_becas_usd(s.monto, s.idioma);
  v_enlace := 'https://escuelacem.com/plataforma/ayuda-recurrente.html?s=' || s.clave;
  v_hola := case when v_en then 'Hi ' || case when s.anonima then 'there' else split_part(btrim(s.donante_nombre), ' ', 1) end || ','
                 else 'Hola' || case when s.anonima then '' else ' ' || split_part(btrim(s.donante_nombre), ' ', 1) end || ':' end;
  if p_tipo = 'alta' then
    v_asunto := case when v_en then format('Your %s is active · Thank you', s.producto)
                     else format('Tu %s está activo · Gracias', s.producto) end;
    v_cuerpo := case when v_en then format(E'%s\n\nThank you: from today your %s of %s a month supports the CEM scholarship fund. Because of it, someone who couldn''t afford it today gets to study a full program.\n\nIt is charged every month by ACH, from the bank account you chose. The first charge takes a few business days to clear, and every month we send you its receipt. If you typed in your account details, Stripe will first send a small test deposit and an email to confirm the account.\n\nSee your recurring support, or cancel it whenever you want:\n%s\n\nHelp someone else study: https://escuelacem.com/plataforma/becas.html?lang=en', v_hola, s.producto, v_monto, v_enlace)
      else format(E'%s\n\nGracias: desde hoy tu %s de %s al mes sostiene el fondo de becas del CEM. Con él, alguien que hoy no podría pagarlo estudia un programa completo.\n\nSe cobra cada mes por ACH, desde la cuenta bancaria que elegiste. El primer cobro tarda unos días hábiles en confirmarse, y cada mes te mandamos su recibo. Si escribiste los datos de tu cuenta a mano, Stripe te mandará antes un depósito de prueba y un correo para confirmarla.\n\nTu ayuda recurrente, para verla o cancelarla cuando quieras:\n%s\n\nAyuda a alguien más a estudiar: https://escuelacem.com/plataforma/becas.html', v_hola, s.producto, v_monto, v_enlace) end;
  elsif p_tipo = 'verificar' then
    v_cuando := case when s.verificar_llegada is null then case when v_en then 'In 1–2 business days' else 'En 1 o 2 días hábiles' end
                     when v_en then 'Around ' || cem_becas_dia_texto(s.verificar_llegada, 'en') || ','
                     else 'Hacia el ' || cem_becas_dia_texto(s.verificar_llegada, 'es') end;
    if s.verificar_tipo = 'amounts' then
      v_paso := case when v_en then format('%s you''ll see two small deposits from Stripe in your account (a few cents each), described as "ACCTVERIFY".', v_cuando)
                     else format('%s verás en tu cuenta dos depósitos pequeños de Stripe (unos centavos cada uno), con la descripción «ACCTVERIFY».', v_cuando) end;
      v_dato := case when v_en then 'those two amounts' else 'esas dos cantidades' end;
    else
      v_paso := case when v_en then format('%s you''ll see a $0.01 deposit from Stripe in your account. Its description has a 6-character code that starts with "SM".', v_cuando)
                     else format('%s verás en tu cuenta un depósito de 0,01 USD de Stripe. En la descripción del movimiento hay un código de 6 caracteres que empieza por «SM».', v_cuando) end;
      v_dato := case when v_en then 'that code' else 'ese código' end;
    end if;
    v_donde := coalesce(case when v_en then E' here:\n' else E' aquí:\n' end || s.verificar_url,
                        case when v_en then ' in the link of the email Stripe sends you.' else ' en el enlace del correo que te manda Stripe.' end);
    v_asunto := case when v_en then format('One step left for your %s', s.producto)
                     else format('Falta un paso para tu %s', s.producto) end;
    v_cuerpo := case when v_en then format(E'%s\n\nThank you for your %s of %s a month. One step is left before it starts: because you typed in your account details, Stripe needs to confirm the account is yours.\n\n1. %s\n2. Enter %s%s\n\nYou have 10 days. Nothing is charged until then: the first charge starts once you confirm the account, and we''ll send you its receipt.\n\nYour recurring support, to see it or cancel it:\n%s', v_hola, s.producto, v_monto, v_paso, v_dato, v_donde, v_enlace)
      else format(E'%s\n\nGracias por tu %s de %s al mes. Falta un paso para que empiece: como escribiste los datos de tu cuenta a mano, Stripe tiene que comprobar que es tuya.\n\n1. %s\n2. Escribe %s%s\n\nTienes 10 días. Hasta entonces no se te cobra nada: el primer cobro empieza cuando confirmas la cuenta, y te mandamos su recibo.\n\nTu ayuda recurrente, para verla o cancelarla:\n%s', v_hola, s.producto, v_monto, v_paso, v_dato, v_donde, v_enlace) end;
  elsif p_tipo = 'sin_verificar' then
    v_asunto := case when v_en then format('Your %s didn''t start', s.producto)
                     else format('Tu %s no llegó a empezar', s.producto) end;
    v_cuerpo := case when v_en then format(E'%s\n\nThe first charge for your %s couldn''t be made: your bank account couldn''t be confirmed, or the bank declined it. So it never started and you weren''t charged anything.\n\nIf you''d like to try again, start over from the scholarships page and choose your bank from the list: that way the account is confirmed right away.\nhttps://escuelacem.com/plataforma/becas.html?lang=en#donar\n\nThank you for wanting to help.', v_hola, s.producto)
      else format(E'%s\n\nEl primer cobro de tu %s no se pudo hacer: no se pudo confirmar tu cuenta bancaria, o el banco lo rechazó. Así que no llegó a empezar y no se te cobró nada.\n\nSi quieres intentarlo otra vez, empieza de nuevo desde la página de becas y elige tu banco de la lista: así la cuenta queda confirmada al momento.\nhttps://escuelacem.com/plataforma/becas.html#donar\n\nGracias por querer ayudar.', v_hola, s.producto) end;
  elsif p_tipo = 'fallo' then
    v_asunto := case when v_en then format('We couldn''t charge this month''s %s', s.producto)
                     else format('No pudimos cobrar el %s de este mes', s.producto) end;
    v_cuerpo := case when v_en then format(E'%s\n\nThis month''s charge for your %s (%s) could not be taken from your bank account. There may not have been enough funds, or the account may no longer be active. Stripe will try again in a few days.\n\nIf you would rather use another account, cancel this one and start a new one from the scholarships page:\n%s', v_hola, s.producto, v_monto, v_enlace)
      else format(E'%s\n\nEl cobro de este mes de tu %s (%s) no se pudo hacer desde tu cuenta bancaria. Puede que no hubiera fondos o que la cuenta ya no esté activa. Stripe lo volverá a intentar en unos días.\n\nSi prefieres usar otra cuenta, cancela ésta y empieza otra desde la página de becas:\n%s', v_hola, s.producto, v_monto, v_enlace) end;
  elsif p_tipo = 'baja' then
    select count(*), coalesce(sum(monto), 0) into v_cobros, v_total
      from cem_becas_donaciones where suscripcion_id = s.id and estado = 'confirmada';
    v_asunto := case when v_en then format('Your %s has been canceled', s.producto)
                     else format('Tu %s quedó cancelado', s.producto) end;
    v_cuerpo := case when v_en then format(E'%s\n\nYour %s has been canceled and you won''t be charged again.%s\n\nIf you ever want to come back: https://escuelacem.com/plataforma/becas.html?lang=en', v_hola, s.producto,
          case when v_cobros > 0 then format(' Thank you for everything you gave: %s %s, %s in total.', v_cobros, case when v_cobros = 1 then 'month' else 'months' end, cem_becas_usd(v_total, 'en')) else '' end)
      else format(E'%s\n\nTu %s quedó cancelado y no se te cobrará más.%s\n\nSi algún día quieres volver: https://escuelacem.com/plataforma/becas.html', v_hola, s.producto,
          case when v_cobros > 0 then format(' Gracias por todo lo que aportaste: %s %s, %s en total.', v_cobros, case when v_cobros = 1 then 'mes' else 'meses' end, cem_becas_usd(v_total, 'es')) else '' end) end;
  else
    return;
  end if;
  perform cem_becas_correo(s.donante_email, v_asunto, v_cuerpo, p_clave_correo);
end $$;

-- El paso a «activa». Si falta confirmar la cuenta, el correo de alta no sale:
-- quien paga ya recibió el de «Falta un paso», y dos correos seguidos que se
-- contradicen confunden más que ayudan. Al equipo sí se le avisa, diciendo
-- que falta ese paso.
create or replace function public.cem_becas_recurrente_estrenar(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare s cem_becas_suscripciones;
begin
  update cem_becas_suscripciones set estado = 'activa', activada_en = now()
   where id = p_id and estado = 'iniciada' returning * into s;
  if s.id is null then return; end if;
  if s.verificando_desde is null then
    perform cem_becas_recurrente_correo(s.id, 'alta', 'recurrente-alta:' || s.id);
  end if;
  perform cem_avisar_equipo('ayuda_recurrente',
    format('Nueva ayuda recurrente: %s al mes', cem_becas_usd(s.monto, 'es')),
    format('%s · %s%s. Se cobra por ACH cada mes.%s', cem_becas_numero('SUS', s.numero),
           case when s.anonima then 'anónima' else coalesce(nullif(btrim(s.organizacion), ''), s.donante_nombre) end,
           coalesce(', desde ' || nullif(btrim(s.donante_pais), ''), ''),
           case when s.verificando_desde is not null then ' Falta que confirme su cuenta con el depósito de prueba de Stripe.' else '' end),
    'admin/donaciones.html?pestana=recurrente', array['cobranza', 'admin', 'superadmin']);
  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  values (null, 'stripe', 'beca.recurrente_alta', 'cem_becas_suscripciones', s.id, 'medio',
          jsonb_build_object('suscripcion', cem_becas_numero('SUS', s.numero), 'monto', s.monto,
                             'subscription', s.stripe_subscription, 'verificando', s.verificando_desde is not null));
end $$;

-- Falta confirmar la cuenta: lo llama el webhook al llegar el alta sin pagar,
-- ANTES de activarla, con lo que Stripe dice del depósito de prueba. El correo
-- sale una sola vez: la primera vez que se sabe.
create or replace function public.cem_beca_recurrente_verificando_servidor(
  p_id uuid, p_url text, p_llegada date, p_tipo text, p_cuenta text, p_email text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare s cem_becas_suscripciones;
        v_url text := nullif(btrim(coalesce(p_url, '')), '');
        v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  perform cem_becas_exigir_servidor();
  select * into s from cem_becas_suscripciones where id = p_id for update;
  if s.id is null then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if coalesce(s.stripe_cuenta, '') is distinct from coalesce(p_cuenta, '') then
    return jsonb_build_object('ok', false, 'motivo', 'otra_cuenta');
  end if;
  if s.estado = 'cancelada' then return jsonb_build_object('ok', true, 'cancelada', true); end if;
  if exists (select 1 from cem_becas_donaciones where suscripcion_id = s.id and estado = 'confirmada') then
    return jsonb_build_object('ok', true, 'ya_cobrada', true);
  end if;
  -- Sólo un enlace de Stripe: la página y el correo lo enseñan como botón.
  if v_url is not null and v_url !~ '^https://([a-z0-9-]+\.)*stripe\.com/' then v_url := null; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then v_email := null; end if;
  update cem_becas_suscripciones
     set verificando_desde = coalesce(verificando_desde, now()),
         verificar_url = coalesce(left(v_url, 500), verificar_url),
         verificar_llegada = coalesce(p_llegada, verificar_llegada),
         verificar_tipo = coalesce(nullif(left(btrim(coalesce(p_tipo, '')), 30), ''), verificar_tipo),
         donante_email = coalesce(donante_email, left(v_email, 120))
   where id = s.id;
  if s.verificando_desde is null then
    perform cem_becas_recurrente_correo(s.id, 'verificar', 'recurrente-verificar:' || s.id);
  end if;
  return jsonb_build_object('ok', true, 'verificando', true, 'avisada', s.verificando_desde is null);
end $$;

-- El primer cobro no llegó a hacerse: la cuenta no se confirmó, el banco lo
-- rechazó o Stripe dio la suscripción por caducada (incomplete_expired). Se
-- cierra con UN correo, sea cual sea el aviso que llegue primero.
create or replace function public.cem_becas_recurrente_sin_verificar(p_id uuid, p_motivo text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare s cem_becas_suscripciones;
begin
  update cem_becas_suscripciones
     set estado = 'cancelada', cancelada_en = now(), motivo_fin = left(coalesce(p_motivo, ''), 200)
   where id = p_id and estado <> 'cancelada' returning * into s;
  if s.id is null then return false; end if;
  perform cem_becas_recurrente_correo(s.id, 'sin_verificar', 'recurrente-sin-empezar:' || s.id);
  perform cem_avisar_equipo('cobro_fallido',
    format('Una ayuda recurrente no llegó a empezar (%s)', cem_becas_numero('SUS', s.numero)),
    format('%s al mes · %s. %s No se cobró nada; a quien la pagaba ya se le escribió.', cem_becas_usd(s.monto, 'es'),
           case when s.anonima then 'anónima' else coalesce(nullif(btrim(s.organizacion), ''), s.donante_nombre) end,
           coalesce(p_motivo, '')),
    'admin/donaciones.html?pestana=recurrente', array['cobranza', 'admin', 'superadmin']);
  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  values (null, 'stripe', 'beca.recurrente_sin_empezar', 'cem_becas_suscripciones', s.id, 'medio',
          jsonb_build_object('suscripcion', cem_becas_numero('SUS', s.numero), 'motivo', p_motivo));
  return true;
end $$;

create or replace function public.cem_beca_recurrente_sin_verificar_servidor(
  p_suscripcion_id uuid, p_subscription text, p_motivo text, p_cuenta text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare s cem_becas_suscripciones;
begin
  perform cem_becas_exigir_servidor();
  if p_suscripcion_id is not null then
    select * into s from cem_becas_suscripciones where id = p_suscripcion_id for update;
  end if;
  if s.id is null and p_subscription is not null then
    select * into s from cem_becas_suscripciones where stripe_subscription = p_subscription for update;
  end if;
  if s.id is null then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if coalesce(s.stripe_cuenta, '') is distinct from coalesce(p_cuenta, '') then
    return jsonb_build_object('ok', false, 'motivo', 'otra_cuenta');
  end if;
  if s.estado = 'cancelada' then return jsonb_build_object('ok', true, 'repetida', true); end if;
  -- Con algún cobro ya hecho no es «no llegó a empezar»: esa baja la trae el
  -- aviso de fin de la suscripción, con su propio correo.
  if exists (select 1 from cem_becas_donaciones where suscripcion_id = s.id and estado = 'confirmada') then
    return jsonb_build_object('ok', false, 'motivo', 'con_cobros');
  end if;
  perform cem_becas_recurrente_sin_verificar(s.id, p_motivo);
  return jsonb_build_object('ok', true, 'sin_empezar', true);
end $$;

-- Un cobro mensual que entró. Lo de 20261114000001, y además: con el primer
-- cobro ya no falta confirmar nada.
create or replace function public.cem_beca_recurrente_pago_servidor(
  p_suscripcion_id uuid, p_subscription text, p_invoice text, p_factura text, p_centimos bigint,
  p_moneda text, p_cuenta text, p_periodo date default null, p_proximo timestamptz default null,
  p_email text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare s cem_becas_suscripciones; d cem_becas_donaciones; v_monto numeric;
        v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  perform cem_becas_exigir_servidor();
  perform pg_advisory_xact_lock(hashtext('cem_becas_fondo'));
  if p_suscripcion_id is not null then
    select * into s from cem_becas_suscripciones where id = p_suscripcion_id for update;
  end if;
  if s.id is null and p_subscription is not null then
    select * into s from cem_becas_suscripciones where stripe_subscription = p_subscription for update;
  end if;
  if s.id is null then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if coalesce(s.stripe_cuenta, '') is distinct from coalesce(p_cuenta, '') then
    update cem_becas_suscripciones
       set nota = trim(both ' ' from coalesce(nota, '') || ' Cobro avisado desde otra cuenta (' || coalesce(p_cuenta, 'principal') || '): revisar.')
     where id = s.id;
    return jsonb_build_object('ok', false, 'motivo', 'otra_cuenta');
  end if;
  if coalesce(p_invoice, '') = '' then return jsonb_build_object('ok', false, 'motivo', 'sin_factura'); end if;
  if exists (select 1 from cem_becas_donaciones where stripe_invoice = p_invoice) then
    return jsonb_build_object('ok', true, 'repetida', true);
  end if;
  if upper(coalesce(p_moneda, '')) <> 'USD' then
    update cem_becas_suscripciones
       set nota = trim(both ' ' from coalesce(nota, '') || ' Stripe cobró en ' || upper(coalesce(p_moneda, '?')) || ', no en USD: revisar.')
     where id = s.id;
    return jsonb_build_object('ok', false, 'motivo', 'otra_moneda');
  end if;
  v_monto := round(coalesce(p_centimos, 0) / 100.0, 2);
  if v_monto <= 0 then return jsonb_build_object('ok', true, 'sin_importe', true); end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then v_email := null; end if;

  update cem_becas_suscripciones
     set stripe_subscription = coalesce(stripe_subscription, p_subscription),
         donante_email = coalesce(donante_email, left(v_email, 120)),
         proximo_cobro = coalesce(p_proximo, proximo_cobro),
         estado = case when estado = 'impagada' then 'activa' else estado end,
         verificando_desde = null, verificar_url = null, verificar_llegada = null, verificar_tipo = null
   where id = s.id;
  perform cem_becas_recurrente_estrenar(s.id);
  select * into s from cem_becas_suscripciones where id = s.id;

  insert into cem_becas_donaciones (monto, donante_nombre, donante_email, donante_pais, organizacion,
    publica, anonima, idioma, metodo, estado, stripe_cuenta, origen, campana,
    suscripcion_id, stripe_invoice, referencia, periodo, fecha, confirmada_en)
  values (v_monto, s.donante_nombre, s.donante_email, s.donante_pais, s.organizacion,
    s.publica, s.anonima, s.idioma, 'ach', 'confirmada', s.stripe_cuenta, s.origen, s.campana,
    s.id, p_invoice, nullif(left(btrim(coalesce(p_factura, '')), 40), ''), p_periodo, current_date, now())
  returning * into d;

  -- Al fondo y a la auditoría, como cualquier donación, pero sin la campana:
  -- un aviso por cada $3,99 de cada persona taparía los que importan.
  insert into cem_becas_fondo (tipo, monto, donacion_id, actor_id) values ('donacion', d.monto, d.id, null);
  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  values (null, 'stripe', 'beca.donacion_confirmada', 'cem_becas_donaciones', d.id, 'medio',
          jsonb_build_object('donacion', cem_becas_numero('DON', d.numero), 'monto', d.monto, 'metodo', 'ach',
                             'suscripcion', cem_becas_numero('SUS', s.numero), 'factura', p_invoice));
  perform cem_becas_recibo(d.id);
  return jsonb_build_object('ok', true, 'numero', cem_becas_numero('DON', d.numero));
end $$;

-- Un cobro que falló. Lo de 20261114000001, salvo una cosa: si la ayuda
-- todavía no tiene ningún cobro, es el PRIMERO el que falló, y Stripe no lo
-- reintenta (la suscripción caduca). Entonces no es «falta un cobro, lo
-- reintentará»: es «no llegó a empezar».
create or replace function public.cem_beca_recurrente_fallo_servidor(
  p_suscripcion_id uuid, p_subscription text, p_invoice text, p_cuenta text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare s cem_becas_suscripciones; v_avisar boolean;
begin
  perform cem_becas_exigir_servidor();
  if p_suscripcion_id is not null then
    select * into s from cem_becas_suscripciones where id = p_suscripcion_id for update;
  end if;
  if s.id is null and p_subscription is not null then
    select * into s from cem_becas_suscripciones where stripe_subscription = p_subscription for update;
  end if;
  if s.id is null then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if coalesce(s.stripe_cuenta, '') is distinct from coalesce(p_cuenta, '') then
    return jsonb_build_object('ok', false, 'motivo', 'otra_cuenta');
  end if;
  if s.estado = 'cancelada' then return jsonb_build_object('ok', true, 'cancelada', true); end if;
  if not exists (select 1 from cem_becas_donaciones where suscripcion_id = s.id and estado = 'confirmada') then
    perform cem_becas_recurrente_sin_verificar(s.id,
      case when s.verificando_desde is not null then 'No se pudo confirmar la cuenta bancaria o el banco rechazó el primer cobro.'
           else 'El banco rechazó el primer cobro.' end);
    return jsonb_build_object('ok', true, 'sin_empezar', true);
  end if;
  v_avisar := s.ultimo_fallo_en is null or s.ultimo_fallo_en < now() - interval '3 days';
  update cem_becas_suscripciones set estado = 'impagada', ultimo_fallo_en = now() where id = s.id;
  if v_avisar then
    perform cem_becas_recurrente_correo(s.id, 'fallo', 'recurrente-fallo:' || coalesce(p_invoice, s.id::text));
    perform cem_avisar_equipo('cobro_fallido',
      format('No se pudo cobrar una ayuda recurrente (%s)', cem_becas_numero('SUS', s.numero)),
      format('%s al mes · %s. Stripe lo reintentará; a quien la paga ya se le avisó.', cem_becas_usd(s.monto, 'es'),
             case when s.anonima then 'anónima' else coalesce(nullif(btrim(s.organizacion), ''), s.donante_nombre) end),
      'admin/donaciones.html?pestana=recurrente', array['cobranza', 'admin', 'superadmin']);
  end if;
  return jsonb_build_object('ok', true, 'avisada', v_avisar);
end $$;

-- La página de quien paga. Lo de 20261114000001, y si falta confirmar la
-- cuenta: el enlace de Stripe, cuándo llega el depósito y de qué tipo es.
create or replace function public.cem_beca_recurrente_ver(p_clave text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s cem_becas_suscripciones; v_verificando boolean;
begin
  if p_clave is null or length(p_clave) < 20 or length(p_clave) > 64 then
    return jsonb_build_object('hay', false);
  end if;
  select * into s from cem_becas_suscripciones where clave = p_clave;
  if s.id is null then return jsonb_build_object('hay', false); end if;
  v_verificando := s.verificando_desde is not null and s.estado <> 'cancelada';
  return jsonb_build_object(
    'hay', true, 'estado', s.estado, 'idioma', s.idioma, 'numero', cem_becas_numero('SUS', s.numero),
    'monto', s.monto, 'moneda', s.moneda, 'producto', s.producto, 'anonima', s.anonima,
    'nombre', case when s.anonima then null else s.donante_nombre end,
    'desde', coalesce(s.activada_en, s.creada_en),
    'proximo_cobro', case when s.estado in ('activa', 'impagada') then s.proximo_cobro end,
    'cancelada_en', s.cancelada_en, 'con_correo', s.donante_email is not null,
    'verificando', v_verificando,
    'verificar_url', case when v_verificando then s.verificar_url end,
    'verificar_llegada', case when v_verificando then s.verificar_llegada end,
    'verificar_tipo', case when v_verificando then s.verificar_tipo end,
    'cobros', coalesce((select jsonb_agg(jsonb_build_object(
        'numero', cem_becas_numero('DON', d.numero), 'fecha', d.fecha, 'periodo', d.periodo,
        'monto', d.monto, 'estado', d.estado,
        'recibo', case when d.estado = 'confirmada' then d.recibo_clave end) order by d.numero desc)
      from cem_becas_donaciones d where d.suscripcion_id = s.id and d.estado in ('confirmada', 'anulada')), '[]'::jsonb),
    'total', (select coalesce(sum(d.monto), 0) from cem_becas_donaciones d
               where d.suscripcion_id = s.id and d.estado = 'confirmada'));
end $$;

-- La lista del equipo. Lo de 20261114000001, con «verificando».
create or replace function public.cem_becas_recurrentes_listar()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (cem_puede_cobranza() or cem_es_auditor()) then
    raise exception 'Sólo cobranza y administración pueden ver las ayudas recurrentes.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'numero', cem_becas_numero('SUS', s.numero), 'estado', s.estado, 'monto', s.monto,
      'producto', s.producto, 'donante', s.donante_nombre, 'email', s.donante_email, 'pais', s.donante_pais,
      'organizacion', s.organizacion, 'anonima', s.anonima, 'publica', s.publica, 'idioma', s.idioma,
      'creada_en', s.creada_en, 'activada_en', s.activada_en, 'proximo_cobro', s.proximo_cobro,
      'ultimo_fallo_en', s.ultimo_fallo_en, 'cancelada_en', s.cancelada_en, 'motivo_fin', s.motivo_fin,
      'origen', s.origen, 'campana', s.campana, 'nota', s.nota, 'clave', s.clave,
      'stripe_subscription', s.stripe_subscription,
      'verificando', s.verificando_desde is not null and s.estado <> 'cancelada',
      'verificar_llegada', s.verificar_llegada,
      'cobros', (select count(*) from cem_becas_donaciones d where d.suscripcion_id = s.id and d.estado = 'confirmada'),
      'total', (select coalesce(sum(d.monto), 0) from cem_becas_donaciones d where d.suscripcion_id = s.id and d.estado = 'confirmada'),
      'ultimo_cobro', (select max(d.fecha) from cem_becas_donaciones d where d.suscripcion_id = s.id and d.estado = 'confirmada'))
    order by s.creada_en desc)
    from cem_becas_suscripciones s), '[]'::jsonb);
end $$;

-- ═══ 3. QUIÉN PUEDE QUÉ ═════════════════════════════════════════════════════

revoke all on function public.cem_becas_dia_texto(date, text) from public, anon, authenticated;
revoke all on function public.cem_becas_recurrente_sin_verificar(uuid, text) from public, anon, authenticated;
revoke all on function public.cem_beca_recurrente_verificando_servidor(uuid, text, date, text, text, text) from public, anon, authenticated;
grant execute on function public.cem_beca_recurrente_verificando_servidor(uuid, text, date, text, text, text) to service_role;
revoke all on function public.cem_beca_recurrente_sin_verificar_servidor(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.cem_beca_recurrente_sin_verificar_servidor(uuid, text, text, text) to service_role;

comment on function public.cem_beca_recurrente_verificando_servidor(uuid, text, date, text, text, text) is
  'Sólo el servidor (el webhook, al llegar el alta sin pagar): a quien paga le falta confirmar su cuenta con el depósito de prueba de Stripe. Guarda el enlace y la fecha, y le escribe una vez.';
comment on function public.cem_beca_recurrente_sin_verificar_servidor(uuid, text, text, text) is
  'Sólo el servidor: el primer cobro de una ayuda recurrente no llegó a hacerse (cuenta sin confirmar, banco que lo rechaza o suscripción caducada). La cierra con un solo correo.';
