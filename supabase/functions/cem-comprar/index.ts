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

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    const { curso_id, nombre, email, cuotas, cohorte_id, volver_a } =
      await req.json().catch(() => ({} as Record<string, unknown>));

    if (!curso_id) return json({ error: 'Falta decir qué programa.' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

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
      cancel_url: `${origen}/plataforma/curso.html?id=${curso_id}&pago=cancelado`,
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
