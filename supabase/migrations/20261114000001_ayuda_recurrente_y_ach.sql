-- La ayuda recurrente («Services Fee», $3,99 al mes por ACH) y el ACH en las
-- donaciones de una vez.
--
-- Lo que pidió el dueño: en la página de becas, una «Ayuda recurrente» de
-- $3,99 al mes que se cobra por ACH (cuenta bancaria de EE. UU.), y que quien
-- la paga la vea como «Services Fee»: quien la sostiene da un servicio a los
-- estudiantes. Y las donaciones de una vez, que también se puedan pagar por
-- ACH además de con tarjeta (en una de $2.300, la tarjeta cuesta unos $67 y
-- ACH $5 como mucho).
--
-- Cómo funciona:
-- · Una suscripción vive en cem_becas_suscripciones. Se abre «iniciada» al
--   pulsar el botón, pasa a «activa» cuando Stripe avisa de que se completó el
--   alta, a «impagada» si un cobro falla y a «cancelada» al terminar.
-- · Cada cobro mensual que entra es UNA donación confirmada (método «ach»),
--   ligada a su suscripción y a su factura de Stripe: entra en el fondo, tiene
--   su recibo y cuenta en el contador, como cualquier otra. La misma factura
--   no entra dos veces.
-- · La campana del equipo avisa de un alta, de un cobro que falla y de una
--   baja; no de cada $3,99, que la llenaría.
-- · Quien paga tiene su página (ayuda-recurrente.html?s=<llave>) para ver sus
--   cobros y cancelar. La llave llega por correo.
-- · Un ACH de una vez tarda unos días: la donación se queda «iniciada» con
--   procesando_desde, el recibo dice que está en camino, y entra cuando Stripe
--   avisa (async_payment_succeeded) o se da por fallida (…_failed).
--
-- Arranca APAGADA (recurrente_activa = false): se enciende desde Paquetes y
-- ajustes cuando todo está publicado.

-- ═══ 1. LO QUE SE GUARDA ════════════════════════════════════════════════════

-- 1.1 Las suscripciones.
create sequence if not exists public.cem_becas_suscripciones_numero_seq;
create table if not exists public.cem_becas_suscripciones (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.cem_becas_suscripciones_numero_seq'),
  estado text not null default 'iniciada' check (estado in ('iniciada','activa','impagada','cancelada')),
  monto numeric(12,2) not null check (monto > 0),
  moneda text not null default 'USD' check (moneda = 'USD'),
  producto text not null,
  donante_nombre text not null,
  donante_email text,
  donante_pais text,
  organizacion text,
  publica boolean not null default false,
  anonima boolean not null default false,
  idioma text not null default 'es' check (idioma in ('es','en')),
  stripe_cuenta text,
  stripe_session_id text unique,
  stripe_customer text,
  stripe_subscription text unique,
  clave text not null unique default public.cem_becas_token_nuevo(),
  origen text,
  campana text,
  ip text,
  nota text,
  creada_en timestamptz not null default now(),
  activada_en timestamptz,
  proximo_cobro timestamptz,
  ultimo_fallo_en timestamptz,
  cancelada_en timestamptz,
  motivo_fin text
);
alter sequence public.cem_becas_suscripciones_numero_seq owned by public.cem_becas_suscripciones.numero;
create index if not exists cem_becas_suscripciones_estado on public.cem_becas_suscripciones (estado, creada_en);
alter table public.cem_becas_suscripciones enable row level security;
revoke all on table public.cem_becas_suscripciones from public, anon, authenticated;
revoke all on sequence public.cem_becas_suscripciones_numero_seq from public, anon, authenticated;
comment on table public.cem_becas_suscripciones is
  'La ayuda recurrente al fondo de becas («Services Fee» para quien la paga): una suscripción mensual de Stripe cobrada por ACH. Cada cobro que entra es una donación confirmada con suscripcion_id. La clave abre la página de quien la paga (ver y cancelar).';

-- 1.2 Las donaciones: ACH como forma de pago, de qué suscripción y factura
--     viene un cobro mensual, y cuándo empezó un ACH que está en camino.
alter table public.cem_becas_donaciones drop constraint if exists cem_becas_donaciones_metodo_check;
alter table public.cem_becas_donaciones add constraint cem_becas_donaciones_metodo_check
  check (metodo in ('tarjeta','ach','zelle','transferencia','cheque','efectivo','otro'));
alter table public.cem_becas_donaciones
  add column if not exists suscripcion_id uuid references public.cem_becas_suscripciones(id),
  add column if not exists stripe_invoice text,
  add column if not exists periodo date,
  add column if not exists procesando_desde timestamptz;
create unique index if not exists cem_becas_donaciones_stripe_invoice_key
  on public.cem_becas_donaciones (stripe_invoice) where stripe_invoice is not null;
create index if not exists cem_becas_donaciones_suscripcion
  on public.cem_becas_donaciones (suscripcion_id) where suscripcion_id is not null;
comment on column public.cem_becas_donaciones.stripe_invoice is
  'La factura de Stripe de un cobro mensual de la ayuda recurrente. Única: Stripe puede avisar dos veces del mismo cobro y entra una sola.';
comment on column public.cem_becas_donaciones.procesando_desde is
  'Un pago por ACH que Stripe ya recibió pero que tarda unos días en entrar. Mientras, la donación sigue «iniciada» y el recibo dice que está en camino.';

-- 1.3 Los ajustes: la ayuda recurrente (apagada hasta que se encienda) y el
--     ACH en las donaciones de una vez.
alter table public.cem_becas_ajustes
  add column if not exists recurrente_activa boolean not null default false,
  add column if not exists recurrente_monto numeric(12,2) not null default 3.99,
  add column if not exists recurrente_nombre text not null default 'Services Fee',
  add column if not exists ach_activo boolean not null default true;
comment on column public.cem_becas_ajustes.recurrente_nombre is
  'El nombre con el que quien dona ve la ayuda recurrente, en la página, en Stripe y en sus recibos. Por decisión del dueño, «Services Fee»: quien la paga da un servicio a los estudiantes.';

-- ═══ 2. LA AYUDA RECURRENTE ═════════════════════════════════════════════════

-- «noviembre de 2026» / «November 2026», para el recibo de cada mes.
create or replace function public.cem_becas_mes_texto(p_fecha date, p_idioma text)
returns text
language sql immutable as $$
  select case when p_fecha is null then null
    when p_idioma = 'en' then (array['January','February','March','April','May','June','July','August',
           'September','October','November','December'])[extract(month from p_fecha)::int] || ' ' || extract(year from p_fecha)::int
    else (array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre',
           'noviembre','diciembre'])[extract(month from p_fecha)::int] || ' de ' || extract(year from p_fecha)::int end;
$$;

-- Los correos a quien sostiene una ayuda recurrente: el alta, un cobro que
-- falla y la baja. El de inglés empieza por «Hi …»: cem_correo_html lo
-- reconoce y pone la cabecera y el pie en inglés.
create or replace function public.cem_becas_recurrente_correo(p_id uuid, p_tipo text, p_clave_correo text)
returns void
language plpgsql security definer set search_path = public as $$
declare s cem_becas_suscripciones; v_en boolean; v_hola text; v_monto text; v_enlace text;
        v_cobros int; v_total numeric; v_asunto text; v_cuerpo text;
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
    v_cuerpo := case when v_en then format(E'%s\n\nThank you: from today your %s of %s a month supports the CEM scholarship fund. Because of it, someone who couldn''t afford it today gets to study a full program.\n\nIt is charged every month by ACH, from the bank account you chose. The first charge takes a few business days to clear, and every month we send you its receipt.\n\nSee your recurring support, or cancel it whenever you want:\n%s\n\nHelp someone else study: https://escuelacem.com/plataforma/becas.html?lang=en', v_hola, s.producto, v_monto, v_enlace)
      else format(E'%s\n\nGracias: desde hoy tu %s de %s al mes sostiene el fondo de becas del CEM. Con él, alguien que hoy no podría pagarlo estudia un programa completo.\n\nSe cobra cada mes por ACH, desde la cuenta bancaria que elegiste. El primer cobro tarda unos días hábiles en confirmarse, y cada mes te mandamos su recibo.\n\nTu ayuda recurrente, para verla o cancelarla cuando quieras:\n%s\n\nAyuda a alguien más a estudiar: https://escuelacem.com/plataforma/becas.html', v_hola, s.producto, v_monto, v_enlace) end;
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

-- El paso de «iniciada» a «activa», venga del alta o del primer cobro (Stripe
-- no garantiza en qué orden avisa). Sólo la primera vez: el correo de alta y
-- el aviso al equipo salen una vez.
create or replace function public.cem_becas_recurrente_estrenar(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare s cem_becas_suscripciones;
begin
  update cem_becas_suscripciones set estado = 'activa', activada_en = now()
   where id = p_id and estado = 'iniciada' returning * into s;
  if s.id is null then return; end if;
  perform cem_becas_recurrente_correo(s.id, 'alta', 'recurrente-alta:' || s.id);
  perform cem_avisar_equipo('ayuda_recurrente',
    format('Nueva ayuda recurrente: %s al mes', cem_becas_usd(s.monto, 'es')),
    format('%s · %s%s. Se cobra por ACH cada mes.', cem_becas_numero('SUS', s.numero),
           case when s.anonima then 'anónima' else coalesce(nullif(btrim(s.organizacion), ''), s.donante_nombre) end,
           coalesce(', desde ' || nullif(btrim(s.donante_pais), ''), '')),
    'admin/donaciones.html?pestana=recurrente', array['cobranza', 'admin', 'superadmin']);
  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  values (null, 'stripe', 'beca.recurrente_alta', 'cem_becas_suscripciones', s.id, 'medio',
          jsonb_build_object('suscripcion', cem_becas_numero('SUS', s.numero), 'monto', s.monto,
                             'subscription', s.stripe_subscription));
end $$;

-- Abrir una ayuda recurrente: valida, frena (los mismos frenos que una
-- donación) y la deja «iniciada» con el monto y el nombre de los ajustes. El
-- importe lo pone la base, nunca el navegador.
create or replace function public.cem_beca_recurrente_abrir(
  p_nombre text, p_email text, p_pais text default null, p_organizacion text default null,
  p_publica boolean default false, p_idioma text default 'es', p_origen text default null,
  p_campana text default null, p_ip text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  a cem_becas_ajustes; v_en boolean := lower(coalesce(p_idioma, 'es')) = 'en';
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_nombre text := left(btrim(coalesce(p_nombre, '')), 80);
  v_anonima boolean; v_frenada boolean := false;
  s cem_becas_suscripciones;
begin
  perform cem_becas_exigir_servidor();
  select * into a from cem_becas_ajustes where id = 1;
  if not coalesce(a.recurrente_activa, false) then
    raise exception '%', case when v_en then 'Recurring support isn''t available right now.'
                              else 'La ayuda recurrente no está disponible ahora mismo.' end;
  end if;

  v_anonima := length(v_nombre) < 2;
  if v_anonima then v_nombre := case when v_en then 'Anonymous' else 'Anónimo' end; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception '%', case when v_en then 'That email doesn''t look right.' else 'Ese correo no parece un correo.' end;
  end if;

  if v_email is not null then
    v_frenada := not cem_rate_limit_consumir('donacion:' || v_email, 6, 3600, 3600);
  end if;
  if not v_frenada and nullif(btrim(coalesce(p_ip, '')), '') is not null then
    v_frenada := not cem_rate_limit_consumir('donacion-ip:' || left(btrim(p_ip), 64), 12, 3600, 3600);
  end if;
  if not v_frenada then
    v_frenada := not cem_rate_limit_consumir('donaciones-con-tarjeta', 80, 3600, 900);
  end if;
  if v_frenada then
    raise exception '%', case when v_en then 'Too many attempts in a row. Please try again later.'
                              else 'Demasiados intentos seguidos. Prueba otra vez en un rato.' end;
  end if;

  insert into cem_becas_suscripciones (monto, producto, donante_nombre, donante_email, donante_pais,
    organizacion, publica, anonima, idioma, stripe_cuenta, origen, campana, ip)
  values (a.recurrente_monto, a.recurrente_nombre, v_nombre, v_email, nullif(left(btrim(coalesce(p_pais, '')), 60), ''),
    case when v_anonima then null else nullif(left(btrim(coalesce(p_organizacion, '')), 120), '') end,
    coalesce(p_publica, false) and not v_anonima, v_anonima, case when v_en then 'en' else 'es' end, a.stripe_cuenta,
    nullif(left(regexp_replace(lower(coalesce(p_origen, '')), '[^a-z0-9_.-]', '', 'g'), 40), ''),
    nullif(left(regexp_replace(coalesce(p_campana, ''), '[^a-zA-Z0-9_ -]', '', 'g'), 60), ''),
    nullif(left(btrim(coalesce(p_ip, '')), 64), ''))
  returning * into s;

  return jsonb_build_object('suscripcion_id', s.id, 'numero', cem_becas_numero('SUS', s.numero),
    'monto', s.monto, 'moneda', s.moneda, 'producto', s.producto, 'stripe_cuenta', s.stripe_cuenta,
    'idioma', s.idioma, 'clave', s.clave);
end $$;

create or replace function public.cem_beca_recurrente_sesion(p_id uuid, p_session_id text)
returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  perform cem_becas_exigir_servidor();
  update cem_becas_suscripciones set stripe_session_id = p_session_id
   where id = p_id and estado = 'iniciada' and stripe_session_id is null;
end $$;

-- Stripe avisa de que el alta se completó (checkout.session.completed en modo
-- suscripción). Con ACH el primer cobro todavía está en camino: la suscripción
-- ya está activa, el dinero llega con invoice.paid.
create or replace function public.cem_beca_recurrente_activar_servidor(
  p_id uuid, p_session_id text, p_customer text, p_subscription text, p_cuenta text, p_email text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare s cem_becas_suscripciones; v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  perform cem_becas_exigir_servidor();
  select * into s from cem_becas_suscripciones where id = p_id for update;
  if s.id is null then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if coalesce(s.stripe_cuenta, '') is distinct from coalesce(p_cuenta, '') then
    update cem_becas_suscripciones
       set nota = trim(both ' ' from coalesce(nota, '') || ' Aviso de Stripe desde otra cuenta (' || coalesce(p_cuenta, 'principal') || '): revisar.')
     where id = s.id;
    return jsonb_build_object('ok', false, 'motivo', 'otra_cuenta');
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then v_email := null; end if;
  update cem_becas_suscripciones
     set stripe_session_id = coalesce(stripe_session_id, p_session_id),
         stripe_customer = coalesce(stripe_customer, p_customer),
         stripe_subscription = coalesce(stripe_subscription, p_subscription),
         donante_email = coalesce(donante_email, left(v_email, 120))
   where id = s.id;
  if s.estado = 'cancelada' then return jsonb_build_object('ok', true, 'cancelada', true); end if;
  perform cem_becas_recurrente_estrenar(s.id);
  return jsonb_build_object('ok', true, 'numero', cem_becas_numero('SUS', s.numero));
end $$;

-- Un cobro mensual que entró (invoice.paid): una donación confirmada, por
-- ACH, en el fondo, con su recibo. La misma factura no entra dos veces.
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
         estado = case when estado = 'impagada' then 'activa' else estado end
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

-- Un cobro mensual que falló (invoice.payment_failed). Stripe lo reintenta:
-- a quien paga se le escribe como mucho una vez cada tres días.
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

-- Lo que Stripe dice del estado de la suscripción (customer.subscription.
-- updated): el próximo cobro, y si está al día o debe un cobro. El alta la
-- hace el aviso del Checkout; la baja, _fin_servidor.
create or replace function public.cem_beca_recurrente_estado_servidor(
  p_suscripcion_id uuid, p_subscription text, p_estado text, p_proximo timestamptz, p_cuenta text)
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
  if s.estado = 'cancelada' then return jsonb_build_object('ok', true, 'cancelada', true); end if;
  update cem_becas_suscripciones
     set proximo_cobro = coalesce(p_proximo, proximo_cobro),
         stripe_subscription = coalesce(stripe_subscription, p_subscription),
         estado = case
           when estado = 'iniciada' then estado
           when p_estado in ('past_due', 'unpaid') then 'impagada'
           when p_estado in ('active', 'trialing') then 'activa'
           else estado end
   where id = s.id;
  return jsonb_build_object('ok', true);
end $$;

-- La baja: la avisa Stripe (customer.subscription.deleted) o la pide quien
-- paga desde su página (cem-donar la cancela en Stripe y llama aquí). Con
-- p_cuenta nulo no se compara la cuenta: lo llama cem-donar, que ya usó la de
-- la suscripción.
create or replace function public.cem_beca_recurrente_fin_servidor(
  p_suscripcion_id uuid, p_subscription text, p_motivo text, p_cuenta text default null, p_comprobar_cuenta boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare s cem_becas_suscripciones; v_activa boolean;
begin
  perform cem_becas_exigir_servidor();
  if p_suscripcion_id is not null then
    select * into s from cem_becas_suscripciones where id = p_suscripcion_id for update;
  end if;
  if s.id is null and p_subscription is not null then
    select * into s from cem_becas_suscripciones where stripe_subscription = p_subscription for update;
  end if;
  if s.id is null then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if p_comprobar_cuenta and coalesce(s.stripe_cuenta, '') is distinct from coalesce(p_cuenta, '') then
    return jsonb_build_object('ok', false, 'motivo', 'otra_cuenta');
  end if;
  if s.estado = 'cancelada' then return jsonb_build_object('ok', true, 'repetida', true); end if;
  v_activa := s.estado <> 'iniciada';
  update cem_becas_suscripciones
     set estado = 'cancelada', cancelada_en = now(), motivo_fin = left(coalesce(p_motivo, ''), 200)
   where id = s.id;
  if v_activa then
    perform cem_becas_recurrente_correo(s.id, 'baja', 'recurrente-baja:' || s.id);
    perform cem_avisar_equipo('ayuda_recurrente',
      format('Se canceló una ayuda recurrente (%s)', cem_becas_numero('SUS', s.numero)),
      format('%s al mes · %s. %s', cem_becas_usd(s.monto, 'es'),
             case when s.anonima then 'anónima' else coalesce(nullif(btrim(s.organizacion), ''), s.donante_nombre) end,
             coalesce(p_motivo, '')),
      'admin/donaciones.html?pestana=recurrente', array['cobranza', 'admin', 'superadmin']);
  end if;
  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  values (null, 'stripe', 'beca.recurrente_baja', 'cem_becas_suscripciones', s.id, 'medio',
          jsonb_build_object('suscripcion', cem_becas_numero('SUS', s.numero), 'motivo', p_motivo));
  return jsonb_build_object('ok', true);
end $$;

-- Para cancelar desde la página de quien paga: cem-donar necesita saber qué
-- suscripción de Stripe es y en qué cuenta, con la llave como prueba.
create or replace function public.cem_beca_recurrente_para_cancelar(p_clave text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s cem_becas_suscripciones;
begin
  perform cem_becas_exigir_servidor();
  if p_clave is null or length(p_clave) < 20 or length(p_clave) > 64 then
    return jsonb_build_object('hay', false);
  end if;
  select * into s from cem_becas_suscripciones where clave = p_clave;
  if s.id is null then return jsonb_build_object('hay', false); end if;
  return jsonb_build_object('hay', true, 'id', s.id, 'estado', s.estado, 'idioma', s.idioma,
    'stripe_subscription', s.stripe_subscription, 'stripe_cuenta', s.stripe_cuenta);
end $$;

-- La página de quien paga: el estado, los cobros (cada uno con su recibo) y
-- el total. Con la llave; nunca el correo, ni el nombre de una anónima.
create or replace function public.cem_beca_recurrente_ver(p_clave text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s cem_becas_suscripciones;
begin
  if p_clave is null or length(p_clave) < 20 or length(p_clave) > 64 then
    return jsonb_build_object('hay', false);
  end if;
  select * into s from cem_becas_suscripciones where clave = p_clave;
  if s.id is null then return jsonb_build_object('hay', false); end if;
  return jsonb_build_object(
    'hay', true, 'estado', s.estado, 'idioma', s.idioma, 'numero', cem_becas_numero('SUS', s.numero),
    'monto', s.monto, 'moneda', s.moneda, 'producto', s.producto, 'anonima', s.anonima,
    'nombre', case when s.anonima then null else s.donante_nombre end,
    'desde', coalesce(s.activada_en, s.creada_en),
    'proximo_cobro', case when s.estado in ('activa', 'impagada') then s.proximo_cobro end,
    'cancelada_en', s.cancelada_en, 'con_correo', s.donante_email is not null,
    'cobros', coalesce((select jsonb_agg(jsonb_build_object(
        'numero', cem_becas_numero('DON', d.numero), 'fecha', d.fecha, 'periodo', d.periodo,
        'monto', d.monto, 'estado', d.estado,
        'recibo', case when d.estado = 'confirmada' then d.recibo_clave end) order by d.numero desc)
      from cem_becas_donaciones d where d.suscripcion_id = s.id and d.estado in ('confirmada', 'anulada')), '[]'::jsonb),
    'total', (select coalesce(sum(d.monto), 0) from cem_becas_donaciones d
               where d.suscripcion_id = s.id and d.estado = 'confirmada'));
end $$;

-- La lista del equipo.
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
      'cobros', (select count(*) from cem_becas_donaciones d where d.suscripcion_id = s.id and d.estado = 'confirmada'),
      'total', (select coalesce(sum(d.monto), 0) from cem_becas_donaciones d where d.suscripcion_id = s.id and d.estado = 'confirmada'),
      'ultimo_cobro', (select max(d.fecha) from cem_becas_donaciones d where d.suscripcion_id = s.id and d.estado = 'confirmada'))
    order by s.creada_en desc)
    from cem_becas_suscripciones s), '[]'::jsonb);
end $$;

-- Los ajustes de la ayuda recurrente y del ACH: sólo administración.
create or replace function public.cem_becas_recurrente_guardar(
  p_activa boolean, p_monto numeric, p_nombre text, p_ach boolean)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_nombre text := btrim(coalesce(p_nombre, '')); v_monto numeric := round(coalesce(p_monto, 0), 2);
        a cem_becas_ajustes;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede cambiar los ajustes de becas.' using errcode = '42501';
  end if;
  if v_monto < 1 or v_monto > 1000 then raise exception 'El monto de la ayuda recurrente tiene que estar entre $1 y $1.000.'; end if;
  if length(v_nombre) < 2 or length(v_nombre) > 60 then raise exception 'Ponle un nombre a la ayuda recurrente (de 2 a 60 letras).'; end if;
  update cem_becas_ajustes
     set recurrente_activa = coalesce(p_activa, false), recurrente_monto = v_monto,
         recurrente_nombre = v_nombre, ach_activo = coalesce(p_ach, false)
   where id = 1 returning * into a;
  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), (select email from cem_profiles where id = auth.uid()), 'beca.ajustes_recurrente',
          'cem_becas_ajustes', null, 'medio',
          jsonb_build_object('activa', a.recurrente_activa, 'monto', a.recurrente_monto,
                             'nombre', a.recurrente_nombre, 'ach', a.ach_activo));
  return to_jsonb(a);
end $$;

-- ═══ 3. EL ACH DE UNA VEZ ═══════════════════════════════════════════════════

-- Stripe ya tiene el pago por ACH pero tarda unos días: la donación sigue
-- «iniciada» y el recibo dice que está en camino.
create or replace function public.cem_beca_donacion_procesando_servidor(p_id uuid, p_session_id text, p_cuenta text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d cem_becas_donaciones;
begin
  perform cem_becas_exigir_servidor();
  select * into d from cem_becas_donaciones where id = p_id for update;
  if d.id is null then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if coalesce(d.stripe_cuenta, '') is distinct from coalesce(p_cuenta, '') then
    return jsonb_build_object('ok', false, 'motivo', 'otra_cuenta');
  end if;
  if d.estado <> 'iniciada' then return jsonb_build_object('ok', true, 'estado', d.estado); end if;
  update cem_becas_donaciones
     set procesando_desde = coalesce(procesando_desde, now()),
         stripe_session_id = coalesce(stripe_session_id, p_session_id)
   where id = d.id;
  return jsonb_build_object('ok', true, 'procesando', true);
end $$;

-- El ACH no entró (checkout.session.async_payment_failed): no se cobró nada.
create or replace function public.cem_beca_donacion_fallida_servidor(p_id uuid, p_session_id text, p_cuenta text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d cem_becas_donaciones; v_en boolean;
begin
  perform cem_becas_exigir_servidor();
  select * into d from cem_becas_donaciones where id = p_id for update;
  if d.id is null then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if coalesce(d.stripe_cuenta, '') is distinct from coalesce(p_cuenta, '') then
    return jsonb_build_object('ok', false, 'motivo', 'otra_cuenta');
  end if;
  if d.estado <> 'iniciada' then return jsonb_build_object('ok', true, 'estado', d.estado); end if;
  update cem_becas_donaciones
     set estado = 'fallida', stripe_session_id = coalesce(stripe_session_id, p_session_id),
         nota = trim(both ' ' from coalesce(nota, '') || ' El pago por ACH no se completó.')
   where id = d.id;
  v_en := d.idioma = 'en';
  if d.donante_email is not null then
    perform cem_becas_correo(d.donante_email,
      case when v_en then 'Your bank payment didn''t go through' else 'Tu pago por ACH no se completó' end,
      case when v_en then format(E'Hi %s,\n\nYour gift of %s to the CEM scholarship fund couldn''t be taken from your bank account, so you weren''t charged anything. There may not have been enough funds, or the bank may have declined it.\n\nIf you like, try again by card or with another account:\nhttps://escuelacem.com/plataforma/becas.html?lang=en',
             case when d.anonima then 'there' else split_part(btrim(d.donante_nombre), ' ', 1) end, cem_becas_usd(d.monto, 'en'))
           else format(E'Hola%s:\n\nTu aporte de %s al fondo de becas del CEM no se pudo cobrar desde tu cuenta bancaria, así que no se te cobró nada. Puede que no hubiera fondos o que el banco lo rechazara.\n\nSi quieres, vuelve a intentarlo con tarjeta o con otra cuenta:\nhttps://escuelacem.com/plataforma/becas.html',
             case when d.anonima then '' else ' ' || split_part(btrim(d.donante_nombre), ' ', 1) end, cem_becas_usd(d.monto, 'es')) end,
      'donacion-ach-fallida:' || d.id);
  end if;
  perform cem_avisar_equipo('cobro_fallido',
    format('Una donación por ACH no entró (%s)', cem_becas_numero('DON', d.numero)),
    format('%s · %s. No se cobró nada.', cem_becas_usd(d.monto, 'es'),
           case when d.anonima then 'anónima' else coalesce(nullif(btrim(d.organizacion), ''), d.donante_nombre) end),
    'admin/donaciones.html?id=' || d.id, array['cobranza', 'admin', 'superadmin']);
  return jsonb_build_object('ok', true, 'fallida', true);
end $$;
-- ═══ 4. LO QUE YA EXISTÍA, CON LO NUEVO ════════════════════════════════════

-- 4.1 Confirmar una donación de Stripe gana p_metodo: «ach» cuando el aviso es
--     de un pago por ACH que entró días después. Con valor por omisión, así
--     el webhook que aún no lo manda sigue llegando a ésta.
drop function if exists public.cem_beca_donacion_confirmar_servidor(uuid, text, text, bigint, text, text, text);
create or replace function public.cem_beca_donacion_confirmar_servidor(
  p_id uuid, p_session_id text, p_payment_intent text, p_centimos bigint, p_moneda text, p_cuenta text,
  p_email text default null, p_metodo text default null)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d cem_becas_donaciones; v_monto numeric; v_nota text;
        v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  perform cem_becas_exigir_servidor();
  perform pg_advisory_xact_lock(hashtext('cem_becas_fondo'));
  select * into d from cem_becas_donaciones where id = p_id for update;
  if d.id is null then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  if d.estado = 'confirmada' then return jsonb_build_object('ok', true, 'repetida', true); end if;
  if d.estado = 'anulada' then
    update cem_becas_donaciones
       set nota = trim(both ' ' from coalesce(nota, '') || ' Stripe avisó de un cobro después de anularla: revisar.')
     where id = d.id;
    return jsonb_build_object('ok', false, 'motivo', 'anulada');
  end if;
  if coalesce(d.stripe_cuenta, '') is distinct from coalesce(p_cuenta, '') then
    update cem_becas_donaciones
       set nota = trim(both ' ' from coalesce(nota, '') || ' Aviso de Stripe desde otra cuenta (' || coalesce(p_cuenta, 'principal') || '): revisar.')
     where id = d.id;
    return jsonb_build_object('ok', false, 'motivo', 'otra_cuenta');
  end if;
  if upper(coalesce(p_moneda, '')) <> 'USD' then
    update cem_becas_donaciones
       set nota = trim(both ' ' from coalesce(nota, '') || ' Stripe cobró en ' || upper(coalesce(p_moneda, '?')) || ', no en USD: revisar.')
     where id = d.id;
    return jsonb_build_object('ok', false, 'motivo', 'otra_moneda');
  end if;

  v_monto := round(coalesce(p_centimos, 0) / 100.0, 2);
  if v_monto <= 0 then return jsonb_build_object('ok', false, 'motivo', 'sin_importe'); end if;
  if v_monto <> d.monto then
    v_nota := format('Stripe cobró %s; se esperaba %s.', cem_becas_usd(v_monto, 'es'), cem_becas_usd(d.monto, 'es'));
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then v_email := null; end if;

  update cem_becas_donaciones
     set estado = 'confirmada', monto = v_monto, fecha = current_date,
         metodo = case when p_metodo = 'ach' then 'ach' else metodo end,
         donante_email = coalesce(donante_email, left(v_email, 120)),
         stripe_session_id = coalesce(stripe_session_id, p_session_id),
         stripe_payment_intent = coalesce(p_payment_intent, stripe_payment_intent),
         confirmada_en = now(),
         nota = case when v_nota is null then nota else trim(both ' ' from coalesce(nota, '') || ' ' || v_nota) end
   where id = d.id;

  perform cem_becas_donacion_entra(d.id, null);
  perform cem_becas_recibo(d.id);
  return jsonb_build_object('ok', true, 'numero', cem_becas_numero('DON', d.numero));
end $$;

-- 4.2 El recibo público: el ACH en camino, y el producto y el mes de un cobro
--     de la ayuda recurrente. Lo demás, igual que en 20261113000001.
create or replace function public.cem_beca_recibo(p_clave text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare d cem_becas_donaciones; a cem_becas_ajustes; v_en boolean; v_producto text;
begin
  if p_clave is null or length(p_clave) < 20 or length(p_clave) > 64 then
    return jsonb_build_object('hay', false);
  end if;
  select * into d from cem_becas_donaciones where recibo_clave = p_clave;
  if d.id is null then return jsonb_build_object('hay', false); end if;
  if d.estado <> 'confirmada' then
    return jsonb_build_object('hay', true, 'estado', d.estado, 'idioma', d.idioma,
                              'numero', cem_becas_numero('DON', d.numero),
                              'procesando', d.estado = 'iniciada' and d.procesando_desde is not null);
  end if;
  select * into a from cem_becas_ajustes where id = 1;
  v_en := d.idioma = 'en';
  if d.suscripcion_id is not null then
    select s.producto into v_producto from cem_becas_suscripciones s where s.id = d.suscripcion_id;
  end if;
  return jsonb_build_object(
    'hay', true, 'estado', d.estado, 'idioma', d.idioma,
    'numero', cem_becas_numero('DON', d.numero),
    'fecha', d.fecha, 'monto', d.monto, 'moneda', d.moneda, 'metodo', d.metodo,
    'referencia', coalesce(d.stripe_payment_intent, d.referencia),
    'paquete', (select case when v_en then k.nombre_en else k.nombre_es end
                  from cem_becas_paquetes k where k.id = d.paquete_id),
    'anonima', d.anonima,
    'nombre', case when d.anonima then null else d.donante_nombre end,
    'organizacion', case when d.anonima then null else nullif(btrim(d.organizacion), '') end,
    'pais', nullif(btrim(d.donante_pais), ''),
    'con_correo', d.donante_email is not null,
    'recurrente', d.suscripcion_id is not null, 'producto', v_producto, 'periodo', d.periodo,
    'nota', case when v_en then a.texto_recibo_en else a.texto_recibo_es end);
end $$;

-- 4.3 El correo del recibo: ACH, y el de cada mes de la ayuda recurrente lleva
--     el enlace para verla o cancelarla. Lo demás, igual que en 20261113000001.
create or replace function public.cem_becas_recibo(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare d cem_becas_donaciones; a cem_becas_ajustes; s cem_becas_suscripciones; v_en boolean; v_metodo text;
        v_intro text; v_gestion text := '';
begin
  select * into d from cem_becas_donaciones where id = p_id;
  if d.id is null or d.donante_email is null or d.estado <> 'confirmada' then return; end if;
  select * into a from cem_becas_ajustes where id = 1;
  v_en := d.idioma = 'en';
  v_metodo := case d.metodo
    when 'tarjeta' then case when v_en then 'card' else 'tarjeta' end
    when 'ach' then case when v_en then 'bank account (ACH)' else 'cuenta bancaria (ACH)' end
    when 'transferencia' then case when v_en then 'bank transfer' else 'transferencia' end
    when 'cheque' then case when v_en then 'check' else 'cheque' end
    when 'efectivo' then case when v_en then 'cash' else 'efectivo' end
    when 'zelle' then 'Zelle'
    else case when v_en then 'other' else 'otro' end end;
  if d.suscripcion_id is not null then
    select * into s from cem_becas_suscripciones where id = d.suscripcion_id;
    v_gestion := case when v_en then E'\n\nYour recurring support, to see it or cancel it:\nhttps://escuelacem.com/plataforma/ayuda-recurrente.html?s='
                      else E'\n\nTu ayuda recurrente, para verla o cancelarla:\nhttps://escuelacem.com/plataforma/ayuda-recurrente.html?s=' end || s.clave;
  end if;
  v_intro := case
    when s.id is not null and v_en then format('We received your %s for %s. Thank you for supporting the CEM scholarship fund every month: because of it, someone who couldn''t afford it today will get to study.', s.producto, cem_becas_mes_texto(coalesce(d.periodo, d.fecha), 'en'))
    when s.id is not null then format('Recibimos tu %s de %s. Gracias por sostener cada mes el fondo de becas del CEM: con él, alguien que hoy no podría pagarlo va a estudiar.', s.producto, cem_becas_mes_texto(coalesce(d.periodo, d.fecha), 'es'))
    when v_en then 'We received your contribution to the CEM scholarship fund. Thank you: because of it, someone who couldn''t afford it today will get to study.'
    else 'Recibimos tu aporte al fondo de becas del CEM. Gracias de verdad: con él, alguien que hoy no podría pagarlo va a estudiar.' end;
  if v_en then
    perform cem_becas_correo(d.donante_email,
      case when s.id is not null then s.producto || ' · Receipt ' else 'Thank you for your gift · Receipt ' end || cem_becas_numero('DON', d.numero),
      format(E'Hi %s,\n\n%s\n\nReceipt: %s\nDate: %s\nAmount: %s\nPayment method: %s\n\nYour receipt, to view it or download it as a PDF:\nhttps://escuelacem.com/plataforma/recibo.html?r=%s%s\n\n%s\n\nEvery dollar in the fund is recorded. When your gift pays for a scholarship, we''ll write to tell you who it helped.\n\nHelp someone else study: https://escuelacem.com/plataforma/becas.html?lang=en',
        case when d.anonima then 'there' else split_part(btrim(d.donante_nombre), ' ', 1) end, v_intro,
        cem_becas_numero('DON', d.numero),
        to_char(d.fecha, 'FMMonth FMDD, YYYY'), cem_becas_usd(d.monto, 'en'), v_metodo, d.recibo_clave, v_gestion, a.texto_recibo_en),
      'donacion-recibo:' || d.id);
  else
    perform cem_becas_correo(d.donante_email,
      case when s.id is not null then s.producto || ' · Recibo ' else 'Gracias por tu aporte · Recibo ' end || cem_becas_numero('DON', d.numero),
      format(E'Hola%s:\n\n%s\n\nRecibo: %s\nFecha: %s\nAporte: %s\nForma de pago: %s\n\nTu recibo, para verlo o descargarlo en PDF:\nhttps://escuelacem.com/plataforma/recibo.html?r=%s%s\n\n%s\n\nCada dólar del fondo queda anotado. Cuando tu aporte pague una beca, te escribimos para contarte a quién ayudó.\n\nAyuda a alguien más a estudiar: https://escuelacem.com/plataforma/becas.html',
        case when d.anonima then '' else ' ' || split_part(btrim(d.donante_nombre), ' ', 1) end, v_intro,
        cem_becas_numero('DON', d.numero),
        to_char(d.fecha, 'DD/MM/YYYY'), cem_becas_usd(d.monto, 'es'), v_metodo, d.recibo_clave, v_gestion, a.texto_recibo_es),
      'donacion-recibo:' || d.id);
  end if;
end $$;

-- 4.4 Lo público de la página de becas. Lo demás, igual que en 20261108000001.
create or replace function public.cem_becas_publico(p_idioma text default 'es')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a cem_becas_ajustes; v_en boolean := lower(coalesce(p_idioma, 'es')) = 'en';
begin
  select * into a from cem_becas_ajustes where id = 1;
  return jsonb_build_object(
    'cifras', (select jsonb_build_object(
        'becas', count(*),
        'valor_usd', coalesce(sum(b.valor_usd), 0),
        'paises', count(distinct lower(btrim(b.pais))) filter (where nullif(btrim(b.pais), '') is not null))
       from cem_becas b where b.estado = 'otorgada')
      || (select jsonb_build_object('donaciones', count(*), 'donado_usd', coalesce(sum(d.monto), 0))
            from cem_becas_donaciones d where d.estado = 'confirmada'),
    'donantes', (select count(distinct coalesce(nullif(lower(btrim(d.donante_email)), ''),
                                                case when d.anonima then d.id::text else lower(btrim(d.donante_nombre)) end))
                   from cem_becas_donaciones d where d.estado = 'confirmada'),
    'paquetes', coalesce((select jsonb_agg(jsonb_build_object(
          'id', k.id, 'monto', k.monto, 'destacado', k.destacado,
          'nombre', case when v_en then k.nombre_en else k.nombre_es end,
          'descripcion', case when v_en then k.descripcion_en else k.descripcion_es end)
        order by k.orden, k.monto)
       from cem_becas_paquetes k where k.activo), '[]'::jsonb),
    'otro_monto', jsonb_build_object('permitido', coalesce(a.otro_monto, false),
                                     'minimo', a.otro_monto_minimo, 'maximo', a.otro_monto_maximo),
    'convocatorias', coalesce((select jsonb_agg(jsonb_build_object(
          'codigo', v.codigo, 'titulo', v.titulo, 'descripcion', v.descripcion, 'cierra_en', v.cierra_en,
          'quedan', case when v.cupos is null then null
                         else greatest(v.cupos - (select count(*) from cem_becas b
                                                   where b.convocatoria_id = v.id
                                                     and b.estado in ('por_activar', 'otorgada')), 0) end)
        order by (v.codigo = 'becas-cem'), v.creada_en desc)
       from cem_becas_convocatorias v
      where v.activa and (v.abre_en is null or v.abre_en <= now())
        and (v.cierra_en is null or v.cierra_en > now())
        and (v.cupos is null or v.cupos > (select count(*) from cem_becas b
                                            where b.convocatoria_id = v.id
                                              and b.estado in ('por_activar', 'otorgada')))), '[]'::jsonb),
    'historias', case when coalesce(a.mostrar_historias, false) then coalesce((select jsonb_agg(x.h order by x.cuando desc) from (
          select jsonb_build_object('nombre', split_part(btrim(b.nombre), ' ', 1), 'pais', b.pais,
                                    'programa', coalesce(c.nombre, b.curso_texto), 'historia', b.historia) as h,
                 coalesce(b.activada_en, b.creada_en) as cuando
            from cem_becas b left join cem_courses c on c.id = b.course_id
           where b.estado = 'otorgada' and b.publicable
           order by coalesce(b.activada_en, b.creada_en) desc limit 6) x), '[]'::jsonb)
      else '[]'::jsonb end,
    'lista_donantes', case when coalesce(a.mostrar_donantes, false) then coalesce((select jsonb_agg(x.quien order by x.cuando desc) from (
          select coalesce(nullif(btrim(d.organizacion), ''), btrim(d.donante_nombre)) as quien, max(d.confirmada_en) as cuando
            from cem_becas_donaciones d
           where d.estado = 'confirmada' and d.publica and not d.anonima
           group by 1 order by 2 desc limit 40) x), '[]'::jsonb)
      else '[]'::jsonb end,
    -- Quienes donaron sin salir con su nombre, para el «y N personas más».
    -- Una persona que repite cuenta una vez si dio su correo.
    'donantes_sin_nombre', case when coalesce(a.mostrar_donantes, false) then
        (select count(distinct coalesce(nullif(lower(btrim(d.donante_email)), ''), d.id::text))
           from cem_becas_donaciones d where d.estado = 'confirmada' and (not d.publica or d.anonima))
      else 0 end,
    'precio_medio_usd', (select round(avg(round(c.precio * 0.9, 2) * cem_becas_cambio_usd_seguro(c.moneda)), 2)
                           from cem_courses c where c.estado = 'publicado' and coalesce(c.precio, 0) > 0),
    'recurrente', jsonb_build_object('activa', coalesce(a.recurrente_activa, false),
        'monto', a.recurrente_monto, 'nombre', a.recurrente_nombre,
        'personas', (select count(*) from cem_becas_suscripciones s where s.estado = 'activa')),
    'ach', coalesce(a.ach_activo, false));
end $$;

-- 4.5 La lista de donaciones del equipo. Lo demás, igual que en 20261108000001.
create or replace function public.cem_becas_donaciones_listar(p_estado text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not (cem_puede_cobranza() or cem_es_auditor()) then
    raise exception 'Sólo cobranza y administración pueden ver las donaciones.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', d.id, 'numero', cem_becas_numero('DON', d.numero), 'estado', d.estado, 'metodo', d.metodo,
      'monto', d.monto, 'moneda', d.moneda, 'fecha', d.fecha, 'creada_en', d.creada_en,
      'confirmada_en', d.confirmada_en, 'donante', d.donante_nombre, 'email', d.donante_email,
      'pais', d.donante_pais, 'organizacion', d.organizacion, 'mensaje', d.mensaje, 'publica', d.publica,
      'anonima', d.anonima,
      'suscripcion', (select cem_becas_numero('SUS', s.numero) from cem_becas_suscripciones s where s.id = d.suscripcion_id),
      'periodo', d.periodo, 'procesando', d.procesando_desde is not null,
      'idioma', d.idioma, 'paquete', (select k.nombre_es from cem_becas_paquetes k where k.id = d.paquete_id),
      'referencia', coalesce(d.referencia, d.stripe_payment_intent), 'stripe_cuenta', d.stripe_cuenta,
      'comprobante', d.comprobante, 'origen', d.origen, 'campana', d.campana, 'nota', d.nota,
      'registrada_por', (select trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')) from cem_profiles p where p.id = d.registrada_por),
      'anulada_en', d.anulada_en, 'motivo_anulacion', d.motivo_anulacion,
      'usado', coalesce((select sum(f.monto) from cem_becas_financiacion f where f.donacion_id = d.id and f.liberada_en is null), 0),
      'queda', cem_becas_queda(d.id))
    order by coalesce(d.confirmada_en, d.creada_en) desc)
    from cem_becas_donaciones d
   where (p_estado is null and d.estado <> 'iniciada') or d.estado = p_estado), '[]'::jsonb);
end $$;

-- ═══ 5. QUIÉN PUEDE QUÉ ═════════════════════════════════════════════════════

-- Por dentro: sólo las llaman otras funciones.
revoke all on function public.cem_becas_mes_texto(date, text) from public, anon, authenticated;
revoke all on function public.cem_becas_recurrente_correo(uuid, text, text) from public, anon, authenticated;
revoke all on function public.cem_becas_recurrente_estrenar(uuid) from public, anon, authenticated;

-- Sólo el servidor (cem-donar y el webhook de Stripe).
revoke all on function public.cem_beca_recurrente_abrir(text, text, text, text, boolean, text, text, text, text) from public, anon, authenticated;
grant execute on function public.cem_beca_recurrente_abrir(text, text, text, text, boolean, text, text, text, text) to service_role;
revoke all on function public.cem_beca_recurrente_sesion(uuid, text) from public, anon, authenticated;
grant execute on function public.cem_beca_recurrente_sesion(uuid, text) to service_role;
revoke all on function public.cem_beca_recurrente_activar_servidor(uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.cem_beca_recurrente_activar_servidor(uuid, text, text, text, text, text) to service_role;
revoke all on function public.cem_beca_recurrente_pago_servidor(uuid, text, text, text, bigint, text, text, date, timestamptz, text) from public, anon, authenticated;
grant execute on function public.cem_beca_recurrente_pago_servidor(uuid, text, text, text, bigint, text, text, date, timestamptz, text) to service_role;
revoke all on function public.cem_beca_recurrente_fallo_servidor(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.cem_beca_recurrente_fallo_servidor(uuid, text, text, text) to service_role;
revoke all on function public.cem_beca_recurrente_estado_servidor(uuid, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.cem_beca_recurrente_estado_servidor(uuid, text, text, timestamptz, text) to service_role;
revoke all on function public.cem_beca_recurrente_fin_servidor(uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.cem_beca_recurrente_fin_servidor(uuid, text, text, text, boolean) to service_role;
revoke all on function public.cem_beca_recurrente_para_cancelar(text) from public, anon, authenticated;
grant execute on function public.cem_beca_recurrente_para_cancelar(text) to service_role;
revoke all on function public.cem_beca_donacion_procesando_servidor(uuid, text, text) from public, anon, authenticated;
grant execute on function public.cem_beca_donacion_procesando_servidor(uuid, text, text) to service_role;
revoke all on function public.cem_beca_donacion_fallida_servidor(uuid, text, text) from public, anon, authenticated;
grant execute on function public.cem_beca_donacion_fallida_servidor(uuid, text, text) to service_role;
revoke all on function public.cem_beca_donacion_confirmar_servidor(uuid, text, text, bigint, text, text, text, text) from public, anon, authenticated;
grant execute on function public.cem_beca_donacion_confirmar_servidor(uuid, text, text, bigint, text, text, text, text) to service_role;

-- Quien tiene la llave de su ayuda recurrente.
revoke all on function public.cem_beca_recurrente_ver(text) from public, anon;
grant execute on function public.cem_beca_recurrente_ver(text) to anon, authenticated;

-- El equipo (cada función comprueba el rol por dentro).
revoke all on function public.cem_becas_recurrentes_listar() from public, anon;
grant execute on function public.cem_becas_recurrentes_listar() to authenticated;
revoke all on function public.cem_becas_recurrente_guardar(boolean, numeric, text, boolean) from public, anon;
grant execute on function public.cem_becas_recurrente_guardar(boolean, numeric, text, boolean) to authenticated;

comment on function public.cem_beca_donacion_confirmar_servidor(uuid, text, text, bigint, text, text, text, text) is
  'Sólo el servidor (el webhook de Stripe): da por cobrada una donación con el importe real, la suma al fondo una sola vez y manda el recibo. Si la persona no dio su correo, se guarda el que Stripe pidió al pagar. Con p_metodo «ach», queda como pagada por cuenta bancaria.';
comment on function public.cem_beca_recurrente_ver(text) is
  'Pública: la ayuda recurrente para quien tiene su enlace (ayuda-recurrente.html?s=…). El enlace es la llave. Su estado, sus cobros con su recibo y el total; nunca el correo, ni el nombre de una anónima.';
comment on function public.cem_beca_recurrente_pago_servidor(uuid, text, text, text, bigint, text, text, date, timestamptz, text) is
  'Sólo el servidor (invoice.paid): un cobro mensual de la ayuda recurrente entra como una donación confirmada por ACH, en el fondo y con su recibo. La misma factura entra una sola vez.';
comment on function public.cem_becas_recurrentes_listar() is
  'Cobranza, administración y auditoría: las ayudas recurrentes con sus cobros y su llave, para atender a quien pida cancelar.';

-- ═══ 6. CEMI ════════════════════════════════════════════════════════════════
-- Si le preguntan por ayudar cada mes. Sólo si el guion sigue como se sembró.
update public.cem_bot_guiones
   set guion = guion || E'\nSi dice «puedo ayudar cada mes?» → Cemi: Sí. En la página de becas eliges «Ayuda recurrente»: es el Services Fee, $3,99 al mes desde tu cuenta bancaria de EE. UU. (ACH), y lo cancelas cuando quieras desde el enlace que te llega por correo.',
       actualizado_en = now()
 where tema = 'Donar y ayudar a otros a estudiar' and origen = 'semilla'
   and guion not like '%Ayuda recurrente%';
