// CEM · Donar al fondo de becas («Ayuda a alguien a estudiar»).
//
// El navegador NO habla con Stripe: pide aquí un cobro y recibe la dirección a
// la que ir. El importe no viene del navegador: lo pone la base, que es la que
// sabe cuánto es cada paquete, entre qué límites puede estar «otro monto» y
// cuánto es la ayuda recurrente.
//
// Tres cosas, según lo que llegue:
//   · una donación de una vez (lo de siempre): con tarjeta o, si los ajustes lo
//     dejan, con cuenta bancaria de EE. UU. (ACH);
//   · `tipo: 'recurrente'`: la ayuda recurrente, una suscripción mensual que se
//     cobra sólo por ACH y que quien la paga ve como «Services Fee» (o el
//     nombre que digan los ajustes);
//   · `accion: 'cancelar'` con la llave de una ayuda recurrente: la cancela en
//     Stripe. La llave es la prueba: sólo la tiene quien la paga (le llega por
//     correo) y el equipo.
//
// Nada entra en el fondo aquí: entra cuando Stripe avisa, firmado, de que se
// cobró (cem-stripe-webhook). Una sesión abierta que nadie paga no cuenta.
//
// Se cobra en la cuenta de Stripe que digan los ajustes de becas (la del CEM, u
// otra de «Otras empresas»: ver _shared/stripe-cuentas.ts).

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { cuentaPorClave } from '../_shared/stripe-cuentas.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/* A dónde vuelve la persona después de pagar. NO se toma del navegador tal
   cual: una dirección de vuelta que se elige desde fuera convierte la
   pantalla de pago de Stripe, con nuestro nombre, en un trampolín a cualquier
   sitio. Sólo estas, y si no, la de siempre. */
const VUELTAS = ['https://escuelacem.com', 'https://www.escuelacem.com'];
const VUELTA_POR_DEFECTO = 'https://escuelacem.com';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// deno-lint-ignore no-explicit-any
type Admin = any;
type Datos = Record<string, unknown>;

/** Llama a Stripe con la clave de la cuenta, en el formato que Stripe lee. */
async function stripe(clave: string, metodo: string, ruta: string, cuerpo?: URLSearchParams, idempotencia?: string) {
  const res = await fetch(`https://api.stripe.com/v1/${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${clave}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(idempotencia ? { 'Idempotency-Key': idempotencia } : {}),
    },
    body: cuerpo,
  });
  return { ok: res.ok, datos: await res.json().catch(() => ({})) };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Sólo POST.' }, 405);

  try {
    const d = await req.json().catch(() => ({} as Datos));
    const idioma = d.idioma === 'en' ? 'en' : 'es';
    const en = idioma === 'en';
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    if (d.accion === 'cancelar') return await cancelar(admin, d, en);

    const origenPedido = req.headers.get('origin') || '';
    const vuelta = VUELTAS.includes(origenPedido) ? origenPedido : VUELTA_POR_DEFECTO;
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;

    if (d.tipo === 'recurrente') return await abrirRecurrente(admin, d, idioma, vuelta, ip);
    return await abrirDonacion(admin, d, idioma, vuelta, ip);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});

/* El nombre y el correo son opcionales. Sin nombre, la donación es anónima: no
   sale en ningún sitio. Sin correo, Stripe lo pide en su pantalla y llega con
   el aviso de cobro, para mandar el recibo. */
function quien(d: Datos) {
  const anonima = d.anonima === true;
  return {
    anonima,
    correo: String(d.email ?? '').trim().toLowerCase(),
    nombre: anonima ? '' : String(d.nombre ?? ''),
    organizacion: !anonima && d.organizacion ? String(d.organizacion) : null,
    publica: !anonima && d.publica === true,
  };
}

const sinConfigurar = (en: boolean) => json({ error: en
  ? 'Online giving is not set up yet. Please write to us and we will help you give another way.'
  : 'Las donaciones en línea todavía no están configuradas. Escríbenos y te ayudamos a donar de otra forma.' }, 409);

/* ── Una donación de una vez ─────────────────────────────────────────────── */
async function abrirDonacion(admin: Admin, d: Datos, idioma: string, vuelta: string, ip: string | null) {
  const en = idioma === 'en';
  const q = quien(d);

  // La base valida, frena y deja la donación «iniciada» con su importe.
  const { data: don, error: eAbrir } = await admin.rpc('cem_beca_donacion_abrir', {
    p_paquete_id: typeof d.paquete_id === 'string' && d.paquete_id ? d.paquete_id : null,
    p_monto: d.paquete_id ? null : Number(d.monto ?? 0),
    p_nombre: q.nombre,
    p_email: q.correo || null,
    p_pais: d.pais ? String(d.pais) : null,
    p_organizacion: q.organizacion,
    p_mensaje: d.mensaje ? String(d.mensaje) : null,
    p_publica: q.publica,
    p_idioma: idioma,
    p_origen: d.origen ? String(d.origen) : null,
    p_campana: d.campana ? String(d.campana) : null,
    p_ip: ip,
  });
  if (eAbrir) return json({ error: eAbrir.message }, 400);

  const cuenta = await cuentaPorClave(admin, don.stripe_cuenta ?? null);
  if (!cuenta?.secret_key) return sinConfigurar(en);

  /* ACH además de tarjeta, si los ajustes lo dejan: en una donación grande la
     tarjeta se lleva casi un 3 % y ACH, como mucho, $5. Un ACH tarda unos días:
     Stripe avisa primero de que lo tiene (la sesión se completa sin pagar) y
     después de que entró, o de que no. */
  const { data: ajustes } = await admin.from('cem_becas_ajustes').select('ach_activo').eq('id', 1).maybeSingle();
  const conAch = ajustes?.ach_activo === true;

  const pagina = `${vuelta}/plataforma/becas.html`;
  const lang = en ? '&lang=en' : '';
  const centimos = Math.round(Number(don.monto) * 100);
  const nombreProducto = en ? 'Gift to the CEM scholarship fund' : 'Aporte al fondo de becas del CEM';
  const descripcion = [don.paquete, en ? 'Pays for full programs for people who cannot afford them.'
    : 'Paga programas completos a personas que no pueden pagarlos.'].filter(Boolean).join(' · ');

  const cuerpo = new URLSearchParams({
    mode: 'payment',
    // El botón de Stripe dice «Donar», no «Pagar».
    submit_type: 'donate',
    // Ver el comentario largo en cem-stripe-checkout: con «Managed Payments»
    // puesto, Stripe RECHAZA payment_method_types en vez de ignorarlo.
    'managed_payments[enabled]': 'false',
    'payment_method_types[0]': 'card',
    ...(conAch ? {
      'payment_method_types[1]': 'us_bank_account',
      // Stripe elige: entrar al banco y verificarlo al momento, o depósitos de prueba.
      'payment_method_options[us_bank_account][verification_method]': 'automatic',
    } : {}),
    locale: idioma,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(centimos),
    'line_items[0][price_data][product_data][name]': nombreProducto,
    'line_items[0][price_data][product_data][description]': descripcion,
    'payment_intent_data[description]': `${don.numero} · ${nombreProducto}`,
    'payment_intent_data[metadata][donacion_id]': String(don.donacion_id),
    // Sólo si lo dio (la base ya comprobó que es un correo): un
    // customer_email vacío Stripe lo rechaza.
    ...(q.correo ? { customer_email: q.correo } : {}),
    /* Al pagar, de vuelta a su recibo: la página con forma de factura que
       se descarga en PDF. La llave del recibo la da la base al abrir la
       donación; si por lo que sea no viniera, la vuelta de antes a la página
       de becas sigue sirviendo. */
    success_url: don.recibo_clave
      ? `${vuelta}/plataforma/recibo.html?r=${encodeURIComponent(String(don.recibo_clave))}&gracias=1${lang}`
      : `${pagina}?donacion=${don.donacion_id}&gracias=1${lang}`,
    cancel_url: `${pagina}?donacion=${don.donacion_id}&cancelada=1${lang}`,
    /* Sin client_reference_id, a propósito: el webhook lo lee como el
       identificador de una cuota cuando no hay otra cosa. La donación se
       reconoce por su propia marca. */
    'metadata[donacion_id]': String(don.donacion_id),
    ...(cuenta.clave ? { 'metadata[cuenta]': cuenta.clave } : {}),
  });

  // Cada intento es una donación nueva, con su propio identificador: la clave
  // de idempotencia sólo protege del doble envío de ESTE intento.
  const { ok, datos: sesion } = await stripe(cuenta.secret_key, 'POST', 'checkout/sessions', cuerpo, `cem-don-${don.donacion_id}`);
  if (!ok) {
    await admin.from('cem_becas_donaciones').update({ estado: 'fallida' })
      .eq('id', don.donacion_id).eq('estado', 'iniciada');
    return json({ error: sesion?.error?.message || (en ? 'Stripe could not open the payment.' : 'Stripe no pudo abrir el cobro.') }, 502);
  }

  await admin.rpc('cem_beca_donacion_sesion', { p_id: don.donacion_id, p_session_id: sesion.id });
  return json({ ok: true, url: sesion.url, donacion_id: don.donacion_id, numero: don.numero });
}

/* ── La ayuda recurrente ─────────────────────────────────────────────────────
   Una suscripción mensual de Stripe, sólo por ACH: en $3,99 la tarjeta se
   llevaría unos 42 centavos, y ACH unos 3. El producto se llama como digan los
   ajustes («Services Fee»): así lo ve quien la paga en Stripe y en su banco. La
   marca `suscripcion_id` viaja en la sesión y en la suscripción (y de ahí en
   cada factura), para que el webhook reconozca cada cobro como nuestro. */
async function abrirRecurrente(admin: Admin, d: Datos, idioma: string, vuelta: string, ip: string | null) {
  const en = idioma === 'en';
  const q = quien(d);

  const { data: sus, error: eAbrir } = await admin.rpc('cem_beca_recurrente_abrir', {
    p_nombre: q.nombre,
    p_email: q.correo || null,
    p_pais: d.pais ? String(d.pais) : null,
    p_organizacion: q.organizacion,
    p_publica: q.publica,
    p_idioma: idioma,
    p_origen: d.origen ? String(d.origen) : null,
    p_campana: d.campana ? String(d.campana) : null,
    p_ip: ip,
  });
  if (eAbrir) return json({ error: eAbrir.message }, 400);

  const cuenta = await cuentaPorClave(admin, sus.stripe_cuenta ?? null);
  if (!cuenta?.secret_key) return sinConfigurar(en);

  const lang = en ? '&lang=en' : '';
  const centimos = Math.round(Number(sus.monto) * 100);
  const marca = (prefijo: string) => ({
    [`${prefijo}[suscripcion_id]`]: String(sus.suscripcion_id),
    ...(cuenta.clave ? { [`${prefijo}[cuenta]`]: cuenta.clave } : {}),
  });

  const cuerpo = new URLSearchParams({
    mode: 'subscription',
    'managed_payments[enabled]': 'false',
    'payment_method_types[0]': 'us_bank_account',
    'payment_method_options[us_bank_account][verification_method]': 'automatic',
    locale: idioma,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(centimos),
    'line_items[0][price_data][recurring][interval]': 'month',
    'line_items[0][price_data][product_data][name]': String(sus.producto),
    'line_items[0][price_data][product_data][description]': en
      ? 'Monthly support for the CEM scholarship fund. Cancel anytime.'
      : 'Ayuda mensual al fondo de becas del CEM. Cancelas cuando quieras.',
    'subscription_data[description]': `${sus.numero} · ${sus.producto}`,
    ...marca('subscription_data[metadata]'),
    ...marca('metadata'),
    ...(q.correo ? { customer_email: q.correo } : {}),
    success_url: `${vuelta}/plataforma/ayuda-recurrente.html?s=${encodeURIComponent(String(sus.clave))}&gracias=1${lang}`,
    cancel_url: `${vuelta}/plataforma/becas.html?recurrente=cancelada${lang}#donar`,
  });

  const { ok, datos: sesion } = await stripe(cuenta.secret_key, 'POST', 'checkout/sessions', cuerpo, `cem-sus-${sus.suscripcion_id}`);
  if (!ok) {
    await admin.from('cem_becas_suscripciones').update({ estado: 'cancelada', motivo_fin: 'Stripe no pudo abrir el alta.' })
      .eq('id', sus.suscripcion_id).eq('estado', 'iniciada');
    return json({ error: sesion?.error?.message || (en ? 'Stripe could not open the sign-up.' : 'Stripe no pudo abrir el alta.') }, 502);
  }

  await admin.rpc('cem_beca_recurrente_sesion', { p_id: sus.suscripcion_id, p_session_id: sesion.id });
  return json({ ok: true, url: sesion.url, numero: sus.numero });
}

/* ── Cancelar una ayuda recurrente ──────────────────────────────────────────
   Se cancela en Stripe al momento (no se cobra más) y se apunta la baja aquí
   mismo, sin esperar al aviso: quien pulsa «Cancelar» tiene que ver que se
   canceló. El aviso de Stripe que llega después encuentra la baja hecha. */
async function cancelar(admin: Admin, d: Datos, en: boolean) {
  const clave = String(d.clave ?? '');
  const { data: s, error } = await admin.rpc('cem_beca_recurrente_para_cancelar', { p_clave: clave });
  if (error) return json({ error: error.message }, 500);
  if (!s?.hay) return json({ error: en ? 'We couldn\'t find that recurring support.' : 'No encontramos esa ayuda recurrente.' }, 404);
  if (s.estado === 'cancelada') return json({ ok: true, ya: true });

  if (s.stripe_subscription) {
    const cuenta = await cuentaPorClave(admin, s.stripe_cuenta ?? null);
    if (!cuenta?.secret_key) return sinConfigurar(en);
    const { ok, datos } = await stripe(cuenta.secret_key, 'DELETE', `subscriptions/${encodeURIComponent(String(s.stripe_subscription))}`);
    // Ya cancelada o inexistente en Stripe: lo que importa es que no cobre más.
    const yaNoCobra = ok || datos?.error?.code === 'resource_missing' || /cancel/i.test(datos?.error?.message || '');
    if (!yaNoCobra) {
      return json({ error: datos?.error?.message || (en ? 'Stripe could not cancel it. Please try again.' : 'Stripe no pudo cancelarla. Prueba otra vez.') }, 502);
    }
  }

  const { error: eFin } = await admin.rpc('cem_beca_recurrente_fin_servidor', {
    p_suscripcion_id: s.id,
    p_subscription: s.stripe_subscription ?? null,
    p_motivo: 'La canceló quien la pagaba, desde su página.',
    p_cuenta: null,
    p_comprobar_cuenta: false,
  });
  if (eFin) return json({ error: eFin.message }, 500);
  return json({ ok: true });
}
