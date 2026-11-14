// CEM · Lo que Stripe nos cuenta cuando alguien paga.
//
// Esta es la pieza que hace que pagar con tarjeta abra el curso solo. Sin ella,
// la persona paga, Stripe cobra, y aquí nadie se entera — la cuota seguiría
// pendiente y el curso cerrado.
//
// NO confía en quien llama. Cualquiera puede mandar un POST aquí diciendo «esta
// cuota está pagada»; lo que lo impide es la firma que Stripe pone en cada
// aviso, comprobada abajo contra el secreto del webhook. Sin firma válida no se
// toca nada.
//
// Va sin verify_jwt: quien llama es Stripe, que no tiene sesión de Supabase.
// Por eso la firma no es un detalle de seguridad, es LA seguridad.
//
// UNA DIRECCIÓN POR CUENTA
// Cada programa cobra en la cuenta de Stripe que tenga asignada: la del CEM o
// la de la empresa beneficiaria (ver _shared/stripe-cuentas.ts). Cada cuenta
// tiene su propio webhook y su propio secreto, y avisa aquí con su dirección:
//   …/cem-stripe-webhook                → la cuenta principal, como siempre
//   …/cem-stripe-webhook?cuenta=<clave> → la de esa empresa
// La firma se comprueba con el secreto de ESA cuenta, y el cobro se apunta con
// SU método, que lleva a SU cartera: el dinero de otra empresa no se mezcla con
// el del CEM.

import { createClient } from 'jsr:@supabase/supabase-js@2';
/* Convertir la compra en alumno lo hace un solo sitio, compartido con
   cem-comprar: si el equipo confirma un pago movil a mano tiene que pasar
   exactamente lo mismo que si lo confirma Stripe. */
import { cerrarCompraInvitado } from '../_shared/cerrar-compra.ts';
import { claveValida, cuentaPorClave, todasLasCuentas, type CuentaStripe } from '../_shared/stripe-cuentas.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

/** La firma de Stripe: `t=<segundos>,v1=<hmac>`. Se rehace el hmac con el
 *  secreto y se compara. Es HMAC-SHA256 sobre «timestamp.cuerpo». */
async function firmaValida(cuerpo: string, cabecera: string, secreto: string): Promise<boolean> {
  const partes = Object.fromEntries(
    cabecera.split(',').map((p) => p.split('=').map((x) => x.trim())) as [string, string][],
  );
  const t = partes['t'];
  const v1 = partes['v1'];
  if (!t || !v1) return false;

  // Un aviso de hace horas es un aviso repetido por alguien que lo capturó.
  // Cinco minutos es la tolerancia que recomienda Stripe.
  const edad = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(edad) || edad > 300) return false;

  const clave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(`${t}.${cuerpo}`));
  const esperado = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');

  // Comparación de tiempo constante: comparar con === filtra el secreto poco a
  // poco a quien mida cuánto tarda en fallar.
  if (esperado.length !== v1.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ v1.charCodeAt(i);
  return dif === 0;
}

// deno-lint-ignore no-explicit-any
type Admin = any;
// deno-lint-ignore no-explicit-any
type Objeto = Record<string, any>;

/** Stripe manda a veces un id y a veces el objeto entero (si se expande). */
const idDe = (x: unknown): string | null =>
  typeof x === 'string' ? x : (x && typeof x === 'object' && typeof (x as Objeto).id === 'string' ? (x as Objeto).id : null);

/** Un instante de Stripe (segundos) en ISO, o null. */
const instante = (s: unknown): string | null =>
  typeof s === 'number' && s > 0 ? new Date(s * 1000).toISOString() : null;

/** Lo mismo que se exige a una sesión: que avise la cuenta donde se abrió. */
const deOtraCuenta = (meta: Objeto | null | undefined, cuenta: CuentaStripe) =>
  (claveValida(meta?.cuenta) || null) !== cuenta.clave;

/* ── El fondo de becas, fuera de «sesión completada» ─────────────────────────
   · El ACH de una donación de una vez entra (o no) días después.
   · Cada cobro de la ayuda recurrente es una factura (invoice.*); su
     suscripción lleva nuestra marca `suscripcion_id`. Dónde viene depende de
     la versión de la API de Stripe: en las de 2025 en adelante, en
     invoice.parent.subscription_details; antes, en invoice.subscription y
     invoice.subscription_details. Se leen las dos.
   · Las facturas y suscripciones sin la marca no son nuestras (o no del
     fondo): se contesta 200 y no se toca nada.
   Lo que no cuadra lo anota la base y se contesta 200 igualmente, como con las
   donaciones: un error haría que Stripe lo reintentara durante días. Un fallo
   de la base sí se devuelve, para que reintente cuando esté arreglado. */
async function otrosAvisos(admin: Admin, tipo: string, o: Objeto, cuenta: CuentaStripe) {
  const llamar = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(fn, args);
    return error ? json({ error: error.message }, 500) : json({ ok: true, [tipo]: data });
  };

  if (tipo === 'checkout.session.async_payment_succeeded' || tipo === 'checkout.session.async_payment_failed') {
    const donacionId = o.metadata?.donacion_id;
    if (!donacionId) return json({ ok: true, ignorado: tipo });
    if (deOtraCuenta(o.metadata, cuenta)) return json({ error: 'Este cobro se abrió en otra cuenta de Stripe.' }, 400);
    if (tipo.endsWith('_failed')) {
      return await llamar('cem_beca_donacion_fallida_servidor', { p_id: donacionId, p_session_id: String(o.id || ''), p_cuenta: cuenta.clave });
    }
    return await llamar('cem_beca_donacion_confirmar_servidor', {
      p_id: donacionId,
      p_session_id: String(o.id || ''),
      p_payment_intent: idDe(o.payment_intent),
      p_centimos: Math.round(Number(o.amount_total || 0)),
      p_moneda: String(o.currency || ''),
      p_cuenta: cuenta.clave,
      p_email: o.customer_details?.email ? String(o.customer_details.email) : null,
      p_metodo: 'ach',
    });
  }

  if (tipo === 'invoice.paid' || tipo === 'invoice.payment_failed') {
    const detalle = o.parent?.subscription_details ?? o.subscription_details ?? null;
    const meta: Objeto = detalle?.metadata ?? {};
    const subscription = idDe(detalle?.subscription) ?? idDe(o.subscription);
    if (!meta.suscripcion_id) return json({ ok: true, ignorado: tipo });
    if (deOtraCuenta(meta, cuenta)) return json({ error: 'Esta factura es de otra cuenta de Stripe.' }, 400);
    if (tipo === 'invoice.payment_failed') {
      return await llamar('cem_beca_recurrente_fallo_servidor', {
        p_suscripcion_id: meta.suscripcion_id, p_subscription: subscription, p_invoice: String(o.id || ''), p_cuenta: cuenta.clave,
      });
    }
    // El periodo que paga esta factura: de su primera línea.
    const periodo = o.lines?.data?.[0]?.period ?? null;
    return await llamar('cem_beca_recurrente_pago_servidor', {
      p_suscripcion_id: meta.suscripcion_id,
      p_subscription: subscription,
      p_invoice: String(o.id || ''),
      p_factura: o.number ? String(o.number) : null,
      p_centimos: Math.round(Number(o.amount_paid || 0)),
      p_moneda: String(o.currency || ''),
      p_cuenta: cuenta.clave,
      p_periodo: instante(periodo?.start)?.slice(0, 10) ?? null,
      p_proximo: instante(periodo?.end),
      p_email: o.customer_email ? String(o.customer_email) : null,
    });
  }

  if (tipo === 'customer.subscription.updated' || tipo === 'customer.subscription.deleted') {
    const meta: Objeto = o.metadata ?? {};
    if (!meta.suscripcion_id) return json({ ok: true, ignorado: tipo });
    if (deOtraCuenta(meta, cuenta)) return json({ error: 'Esta suscripción es de otra cuenta de Stripe.' }, 400);
    if (tipo === 'customer.subscription.deleted' || o.status === 'canceled' || o.status === 'incomplete_expired') {
      return await llamar('cem_beca_recurrente_fin_servidor', {
        p_suscripcion_id: meta.suscripcion_id, p_subscription: idDe(o.id),
        p_motivo: o.cancellation_details?.reason === 'cancellation_requested'
          ? 'Se canceló en Stripe.' : `Stripe la dio por terminada (${o.cancellation_details?.reason || o.status || 'sin motivo'}).`,
        p_cuenta: cuenta.clave, p_comprobar_cuenta: true,
      });
    }
    // El próximo cobro: en las versiones nuevas de la API vive en cada línea.
    const proximo = instante(o.items?.data?.[0]?.current_period_end) ?? instante(o.current_period_end);
    return await llamar('cem_beca_recurrente_estado_servidor', {
      p_suscripcion_id: meta.suscripcion_id, p_subscription: idDe(o.id), p_estado: String(o.status || ''),
      p_proximo: proximo, p_cuenta: cuenta.clave,
    });
  }

  return json({ ok: true, ignorado: tipo });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Sólo POST.' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const cuerpo = await req.text();

  const cabecera = req.headers.get('stripe-signature') || '';

  // De qué cuenta viene el aviso, y que de verdad venga de ella.
  const pedida = new URL(req.url).searchParams.get('cuenta');
  let cuenta: CuentaStripe | null = null;
  if (pedida) {
    cuenta = await cuentaPorClave(admin, pedida);
    if (!cuenta) return json({ error: 'Esa cuenta de Stripe no está configurada aquí.' }, 404);
    if (!cuenta.webhook_secret) return json({ error: 'Sin secreto de webhook configurado.' }, 409);
    if (!(await firmaValida(cuerpo, cabecera, cuenta.webhook_secret))) {
      return json({ error: 'Firma inválida.' }, 401);
    }
  } else {
    // Sin `?cuenta=`: la principal, como siempre. Y si el aviso no lo firma la
    // principal, se prueba con los secretos de las otras: así un webhook dado
    // de alta sin el final de la dirección también funciona. No afloja nada
    // —sigue haciendo falta la firma de una de NUESTRAS cuentas— y la
    // comprobación de más abajo impide que esa cuenta asiente un cobro ajeno.
    const cuentas = (await todasLasCuentas(admin)).filter((c) => c.webhook_secret);
    if (!cuentas.length) return json({ error: 'Sin secreto de webhook configurado.' }, 409);
    for (const c of cuentas) {
      if (await firmaValida(cuerpo, cabecera, c.webhook_secret!)) { cuenta = c; break; }
    }
    if (!cuenta) return json({ error: 'Firma inválida.' }, 401);
  }

  const evento = JSON.parse(cuerpo);
  /* Lo que no es «una sesión de pago se completó»: el ACH que entra o no días
     después, y los cobros, fallos y bajas de la ayuda recurrente. Todo eso es
     del fondo de becas; lo demás se contesta y se ignora. */
  if (evento.type !== 'checkout.session.completed') {
    return await otrosAvisos(admin, String(evento.type || ''), evento.data?.object || {}, cuenta);
  }

  const sesion = evento.data?.object || {};
  const sessionId = sesion.id;

  // El cobro se abrió en una cuenta (metadata.cuenta; sin ella, la principal) y
  // tiene que avisar esa misma. Si no coinciden, algo está mal configurado y no
  // se asienta: el dinero estaría en una cuenta y el registro diría otra.
  const abiertaEn = claveValida(sesion.metadata?.cuenta) || null;
  if (abiertaEn !== cuenta.clave) {
    return json({ error: `Este cobro se abrió en la cuenta «${abiertaEn ?? 'principal'}» y avisa la «${cuenta.clave ?? 'principal'}».` }, 400);
  }

  /* ── El fondo de becas ─────────────────────────────────────────────────
     Va antes que todo lo demás: no es la cuota de nadie ni una compra, y no
     se apunta con el método de la cuenta (las donaciones van APARTE de lo
     cobrado, en su propio libro). Lo que no cuadra lo anota la base y aquí se
     contesta 200 igualmente: un error haría que Stripe lo reintentara durante
     días, y no se arregla solo.

     Primero, el alta de una ayuda recurrente: la suscripción ya existe en
     Stripe. Con ACH el primer cobro todavía está en camino; el dinero llega
     con invoice.paid (otrosAvisos). */
  const suscripcionId = sesion.metadata?.suscripcion_id;
  if (sesion.mode === 'subscription' && suscripcionId) {
    const { data: r, error: eSus } = await admin.rpc('cem_beca_recurrente_activar_servidor', {
      p_id: suscripcionId,
      p_session_id: String(sessionId || ''),
      p_customer: idDe(sesion.customer),
      p_subscription: idDe(sesion.subscription),
      p_cuenta: cuenta.clave,
      p_email: sesion.customer_details?.email ? String(sesion.customer_details.email) : null,
    });
    if (eSus) return json({ error: eSus.message }, 500);
    return json({ ok: true, recurrente: r });
  }

  const donacionId = sesion.metadata?.donacion_id;
  if (donacionId) {
    if (sesion.payment_status !== 'paid') {
      /* Un ACH: Stripe ya lo tiene, pero tarda unos días en entrar. Se apunta
         que está en camino (el recibo lo dice) y se espera al aviso de que
         entró o de que no. */
      const { error: eProc } = await admin.rpc('cem_beca_donacion_procesando_servidor', {
        p_id: donacionId, p_session_id: String(sessionId || ''), p_cuenta: cuenta.clave,
      });
      if (eProc) return json({ error: eProc.message }, 500);
      return json({ ok: true, donacion: donacionId, pendiente: sesion.payment_status ?? 'sin estado' });
    }
    const { data: r, error: eDon } = await admin.rpc('cem_beca_donacion_confirmar_servidor', {
      p_id: donacionId,
      p_session_id: String(sessionId || ''),
      p_payment_intent: sesion.payment_intent ? String(sesion.payment_intent) : null,
      p_centimos: Math.round(Number(sesion.amount_total || 0)),
      p_moneda: String(sesion.currency || ''),
      p_cuenta: cuenta.clave,
      // El correo que Stripe pidió al pagar: la base lo guarda sólo si la
      // persona no había dado uno, y con él le manda el recibo.
      p_email: sesion.customer_details?.email ? String(sesion.customer_details.email) : null,
    });
    // Un fallo de la base (no de los datos) sí se devuelve: ese se arregla, y
    // Stripe lo reintentará cuando esté arreglado.
    if (eDon) return json({ error: eDon.message }, 500);
    return json({ ok: true, donacion: r });
  }

  /* Sólo se asienta un cobro que ya entró. Con tarjeta, una sesión se
     completa ya pagada; pero si algún día se ofrece en Stripe una forma de
     pago que se confirma días después, «completed» llega con
     payment_status «unpaid», y asentarla daría el aula por un dinero que
     todavía no está. Las donaciones, arriba, ya lo miraban. */
  if (sesion.payment_status && sesion.payment_status !== 'paid') {
    return json({ ok: true, pendiente: String(sesion.payment_status) });
  }

  if (!cuenta.metodo) {
    return json({ error: `La cuenta «${cuenta.clave}» no tiene método de pago. Vuelve a guardarla en Admin → Cobros con tarjeta.` }, 500);
  }

  /* ── Compró alguien que no tenía cuenta ────────────────────────────────
     Aquí es donde nace la cuenta, y no antes: si se creara al pulsar
     «comprar», cualquiera podría llenar la plataforma de cuentas con correos
     ajenos sin pagar un céntimo.

     A partir de aquí el camino vuelve a ser el de siempre — se crea la
     inscripción, sale una primera cuota, y ese cobro se registra con la misma
     función que cualquier otro pago. Dos caminos hasta la cartera con reglas
     distintas es como acaban sin cuadrar las cuentas. */
  const compraInvitado = sesion.metadata?.compra_invitado_id;
  if (compraInvitado) {
    // El monto, en la moneda de la forma de pago de esta cuenta: la tarjeta
    // cobra en la del programa, que es la suya.
    const r = await cerrarCompraInvitado(admin, compraInvitado, {
      monto: Math.round(Number(sesion.amount_total || 0)) / 100,
      referencia: String(sesion.payment_intent || sesion.id),
      metodo: cuenta.metodo,
    });
    if (r.error) return json({ error: r.error }, r.status ?? 500);
    return json(r.cuerpo);
  }

  const cuotaId = sesion.metadata?.installment_id || sesion.client_reference_id;
  if (!sessionId || !cuotaId) return json({ ok: true, sin_datos: true });

  // Idempotencia: Stripe reintenta un aviso hasta que le respondemos bien, y
  // repetirlo NO puede cobrar dos veces la misma cuota. Si esta sesión ya se
  // marcó pagada, se contesta que sí y no se toca nada más.
  const { data: yaEstaba } = await admin.from('cem_stripe_sesiones')
    .select('estado').eq('session_id', sessionId).maybeSingle();
  if (yaEstaba?.estado === 'pagada') return json({ ok: true, repetido: true });

  const centimos = Number(sesion.amount_total || 0);
  const monto = Math.round(centimos) / 100;

  // Se registra el pago por la misma puerta que un pago declarado a mano
  // —`cem_reportar_pago` y su aprobación— para que no haya dos caminos que
  // acaben en la cartera con reglas distintas.
  const referencia = String(sesion.payment_intent || sessionId).slice(0, 40);
  const { data: pago, error: eReportar } = await admin.rpc('cem_reportar_pago_servidor', {
    p_installment_id: cuotaId,
    p_monto: monto,
    p_moneda: String(sesion.currency || 'eur').toUpperCase(),
    p_referencia: referencia,
    p_metodo: cuenta.metodo,
    p_profile_id: sesion.metadata?.profile_id || null,
  });

  if (eReportar) {
    // «Ya hay un pago con esa referencia» NO es un fallo aquí: significa que
    // este cobro ya se registró y Stripe está reintentando el aviso. Hay que
    // contestarle que sí — si se le devuelve un error, reintenta durante días.
    //
    // Esto ocurre cuando la fila de la sesión no está (por ejemplo, si el aviso
    // llega antes de que termine de guardarse), así que el guardia de más
    // arriba no lo atrapó. La referencia es la segunda red, y la que de verdad
    // impide cobrar dos veces la misma cuota.
    const yaRegistrado = /ya hay un pago registrado/i.test(eReportar.message || '');
    if (!yaRegistrado) return json({ error: eReportar.message }, 500);

    await admin.from('cem_stripe_sesiones').update({
      estado: 'pagada',
      payment_intent: sesion.payment_intent || null,
      pagado_en: new Date().toISOString(),
    }).eq('session_id', sessionId);
    return json({ ok: true, repetido: true, referencia });
  }

  await admin.from('cem_stripe_sesiones').update({
    estado: 'pagada',
    payment_intent: sesion.payment_intent || null,
    pagado_en: new Date().toISOString(),
  }).eq('session_id', sessionId);

  return json({ ok: true, pago });
});
