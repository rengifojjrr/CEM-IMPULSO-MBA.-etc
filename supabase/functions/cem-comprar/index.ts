// CEM · Comprar un programa SIN tener cuenta.
//
// POR QUE EXISTE
// ---------------------------------------------------------------------------
// Hasta ahora, quien veia un programa en la web y pulsaba «Inscribirme»
// aterrizaba en una pantalla que exige sesion: habia que registrarse, confirmar
// el correo, entrar, y sólo entonces se podia pagar. Cuatro paradas entre la
// decision de comprar y el cobro, y cada una es gente que se cae.
//
// Aqui el orden se invierte: nombre, correo, y a pagar. La cuenta y la
// inscripcion se crean cuando el dinero entra de verdad, en el webhook.
//
// POR QUE NO SE CREA LA CUENTA AQUI
// ---------------------------------------------------------------------------
// Porque esta puerta es publica y sin sesion. Si creara cuentas, cualquiera
// podria llenar la plataforma de cuentas con correos ajenos sin pagar un
// centimo — y el equipo tendria una lista de alumnos que no lo son. Lo unico
// que se guarda antes de pagar es la INTENCION: nombre, correo y que programa.
//
// EL IMPORTE NO VIENE DEL NAVEGADOR
// ---------------------------------------------------------------------------
// Lo calcula la base, con el mismo factor por cuotas que una inscripcion
// normal. Es lo unico que impide que alguien pida un cobro de un euro por un
// diplomado abriendo las herramientas de su navegador.

// TRES PUERTAS, UNA SOLA FUNCION
// ---------------------------------------------------------------------------
//   (sin accion)  · abre el cobro con tarjeta en Stripe. Es lo de siempre.
//   accion=local  · abre la MISMA intencion de compra sin Stripe, para quien
//                   va a pagar por transferencia o pago movil. En Venezuela
//                   esto no es una alternativa: es la forma normal de pagar.
//   accion=confirmar · el equipo dice que ese pago aparecio en el banco, y
//                   entonces —y solo entonces— nace la cuenta y la inscripcion.
//
// Van juntas porque comparten lo unico delicado que hay aqui: el importe lo
// pone la base y no el navegador. Separarlas en tres funciones era repartir esa
// regla en tres sitios.

import { createClient } from 'jsr:@supabase/supabase-js@2';
/* Convertir una compra de invitado en alumno es exactamente el mismo trabajo
   lo confirme Stripe o lo confirme una persona mirando el extracto, asi que lo
   hace un solo modulo compartido con cem-stripe-webhook. */
import { cerrarCompraInvitado } from '../_shared/cerrar-compra.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'no' }, 405);

  try {
    const cuerpo0 = await req.json().catch(() => ({} as Record<string, unknown>));
    const { curso_id, nombre, email, cuotas, cohorte_id, volver_a, accion } = cuerpo0;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── El equipo confirma un pago que vio en el banco ──────────────────────
    if (accion === 'confirmar') return await confirmar(admin, req, cuerpo0);

    if (!curso_id) return json({ error: 'Falta decir qué programa.' }, 400);

    // ── Pago local: la misma intención de compra, sin pasar por Stripe ──────
    if (accion === 'local') {
      const ipL = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
      const { data: c, error: e } = await admin.rpc('cem_compra_invitado_abrir', {
        p_course_id: curso_id,
        p_nombre: String(nombre ?? ''),
        p_email: String(email ?? ''),
        p_cuotas: Number(cuotas ?? 1),
        p_cohort_id: cohorte_id ?? null,
        p_ip: ipL,
      });
      if (e) return json({ error: e.message }, 400);
      const { data: donde } = await admin.rpc('cem_donde_pagar_publico');
      return json({
        ok: true, compra_id: c.compra_id, curso: c.curso,
        a_cobrar: c.a_cobrar_ahora, moneda: c.moneda, cuotas: c.cuotas,
        donde_pagar: donde ?? [],
      });
    }

    const { data: cfg } = await admin.from('cem_integraciones')
      .select('datos').eq('id', 'stripe').maybeSingle();
    const secret = (cfg?.datos as Record<string, string> | null)?.secret_key;
    if (!secret) return json({ error: 'Los cobros con tarjeta no están configurados todavía.' }, 409);

    // La base valida el nombre, el correo, el plan, que el programa exista y
    // esté publicado, y pone el precio. Si algo no cuadra, lanza con un mensaje
    // que se le puede enseñar a la persona tal cual.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const { data: compra, error: eAbrir } = await admin.rpc('cem_compra_invitado_abrir', {
      p_course_id: curso_id,
      p_nombre: String(nombre ?? ''),
      p_email: String(email ?? ''),
      p_cuotas: Number(cuotas ?? 1),
      p_cohort_id: cohorte_id ?? null,
      p_ip: ip,
    });
    if (eAbrir) return json({ error: eAbrir.message }, 400);

    // Stripe cobra en la unidad mínima. Se redondea UNA vez y aquí: hacerlo en
    // dos sitios distintos es como se cuela un céntimo que nadie encuentra.
    const centimos = Math.round(Number(compra.a_cobrar_ahora) * 100);
    const moneda = String(compra.moneda || 'USD').toLowerCase();
    const origen = volver_a || req.headers.get('origin') || '';
    const cuotasN = Number(compra.cuotas);

    // Igual que en el cobro de una cuota: si el curso tiene su producto en
    // Stripe se cobra contra ÉL, para que el informe salga por programa y la
    // pantalla de pago enseñe su imagen. Si no lo tiene, se cae al nombre — un
    // cobro no se pierde por un adorno de catálogo.
    const linea = compra.stripe_product_id
      ? { 'line_items[0][price_data][product]': String(compra.stripe_product_id) }
      : { 'line_items[0][price_data][product_data][name]': String(compra.curso) };

    const cuerpo = new URLSearchParams({
      mode: 'payment',
      // Ver el comentario largo en cem-stripe-checkout: con «Managed Payments»
      // puesto, Stripe RECHAZA payment_method_types en vez de ignorarlo.
      'managed_payments[enabled]': 'false',
      'payment_method_types[0]': 'card',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': moneda,
      'line_items[0][price_data][unit_amount]': String(centimos),
      ...linea,
      'payment_intent_data[description]': cuotasN > 1
        ? `${compra.curso} — cuota 1 de ${cuotasN}`
        : String(compra.curso),
      success_url: `${origen}/plataforma/bienvenida.html?compra=${compra.compra_id}`,
      /* Vuelve a la pantalla de comprar y no a la ficha, y con el numero de
         compra: asi puede reintentar con sus datos ya puestos o cambiarse a
         pago movil, en vez de empezar de cero. Una tarjeta rechazada no puede
         costar la venta entera. */
      cancel_url: `${origen}/plataforma/comprar.html?curso=${curso_id}`
        + `&compra=${compra.compra_id}&pago=cancelado`,
      client_reference_id: String(compra.compra_id),
      'metadata[compra_invitado_id]': String(compra.compra_id),
      customer_email: String(compra.email),
    });

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        // Por compra, no por persona: cada intento crea su propia fila, así que
        // dos clics seguidos sobre el mismo botón ya vienen con identificadores
        // distintos. Esta clave protege del doble envío del MISMO intento.
        'Idempotency-Key': `cem-inv-${compra.compra_id}`,
      },
      body: cuerpo,
    });
    const sesion = await res.json();
    if (!res.ok) {
      await admin.from('cem_compras_invitado')
        .update({ estado: 'fallida' }).eq('id', compra.compra_id);
      return json({ error: sesion?.error?.message || 'Stripe no pudo abrir el cobro.' }, 502);
    }

    await admin.from('cem_compras_invitado')
      .update({ session_id: sesion.id }).eq('id', compra.compra_id);

    return json({ ok: true, url: sesion.url, compra_id: compra.compra_id });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});

/* ── Confirmar a mano un pago local ────────────────────────────────────────
   Esta funcion esta abierta al publico (verify_jwt = false), asi que aqui el
   permiso NO se da por supuesto: se comprueba con el propio token de quien
   llama, preguntandole a la base con SUS credenciales si puede cobranza. Es la
   misma respuesta que da la pantalla, no una copia de la regla.

   Lo que se registra es lo que la persona declaro y el equipo comprobo: su
   referencia y su metodo. Falsear esto es la diferencia entre un extracto que
   cuadra y uno que no. */
async function confirmar(
  admin: ReturnType<typeof createClient>,
  req: Request,
  cuerpo: Record<string, unknown>,
): Promise<Response> {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Hace falta iniciar sesión.' }, 401);

  const comoQuienLlama = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: puede, error: ePuede } = await comoQuienLlama.rpc('cem_puede_cobranza');
  if (ePuede) return json({ error: ePuede.message }, 401);
  if (!puede) return json({ error: 'No tienes permiso para confirmar cobros.' }, 403);

  const compraId = String(cuerpo.compra_id ?? '');
  if (!compraId) return json({ error: 'Falta decir qué compra.' }, 400);

  const { data: compra } = await admin.from('cem_compras_invitado')
    .select('*').eq('id', compraId).maybeSingle();
  if (!compra) return json({ error: 'Esa compra no existe.' }, 404);
  if (compra.estado !== 'reportada') {
    return json({ error: `Esa compra está ${compra.estado}, no a la espera.` }, 409);
  }

  const r = await cerrarCompraInvitado(admin, compraId, {
    // Lo que de verdad entró, si el equipo lo corrige; si no, lo que tocaba.
    monto: Number(cuerpo.monto ?? compra.monto_reportado ?? compra.monto ?? 0),
    moneda: String(cuerpo.moneda ?? compra.moneda ?? 'USD').toUpperCase(),
    referencia: String(compra.referencia ?? compraId),
    metodo: String(compra.metodo ?? 'Pago móvil'),
  });
  if (r.error) return json({ error: r.error }, r.status ?? 500);
  return json(r.cuerpo);
}
