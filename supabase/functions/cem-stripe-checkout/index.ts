// CEM · Abre un cobro con tarjeta para una cuota concreta.
//
// El navegador NO habla con Stripe: pide aquí una sesión de pago y recibe una
// dirección a la que ir. La razón es que el importe no puede venir del
// navegador — quien sabe abrir las herramientas de su navegador podría pedir
// una sesión de un euro para una cuota de mil. Así que aquí se lee la cuota de
// la base y se cobra lo que la base dice que debe.
//
// La clave secreta de Stripe vive en cem_integraciones y sólo la alcanza este
// entorno de servidor: ni el navegador ni el repositorio la ven nunca.

import { createClient } from 'jsr:@supabase/supabase-js@2';

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

  try {
    // Quién pide el cobro. Se resuelve con SU sesión, no con la de servicio:
    // así la base aplica sus propias reglas al decir de quién es la cuota.
    const auth = req.headers.get('Authorization') || '';
    const comoUsuario = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: auth } },
    });
    const { data: perfilRows } = await comoUsuario.rpc('cem_my_profile');
    const perfil = Array.isArray(perfilRows) ? perfilRows[0] : perfilRows;
    if (!perfil?.id) return json({ error: 'Hay que haber entrado para pagar.' }, 401);

    const { installment_id, volver_a } = await req.json().catch(() => ({}));
    if (!installment_id) return json({ error: 'Falta decir qué cuota se paga.' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: cfg } = await admin.from('cem_integraciones')
      .select('datos').eq('id', 'stripe').maybeSingle();
    const secret = cfg?.datos?.secret_key;
    if (!secret) return json({ error: 'Los cobros con tarjeta no están configurados todavía.' }, 409);

    // La cuota, y que sea de quien dice. Se comprueba aquí y no se confía en lo
    // que mande el navegador: es lo único que impide pagar la cuota de otro —o
    // pagar un euro por una de mil.
    const { data: cuota } = await admin
      .from('cem_installments')
      .select('id, monto, saldo, moneda, estado, numero, enrollment_id, cem_enrollments(profile_id, cem_courses(nombre))')
      .eq('id', installment_id)
      .maybeSingle();

    if (!cuota) return json({ error: 'Esa cuota no existe.' }, 404);
    const duenio = (cuota as Record<string, any>).cem_enrollments?.profile_id;
    if (duenio !== perfil.id) return json({ error: 'Esa cuota no es tuya.' }, 403);
    if (cuota.estado === 'pagada') return json({ error: 'Esa cuota ya está pagada.' }, 409);

    const saldo = Number(cuota.saldo ?? cuota.monto ?? 0);
    if (!(saldo > 0)) return json({ error: 'Esa cuota no tiene saldo pendiente.' }, 409);

    // Stripe cobra en la unidad mínima. Se redondea una sola vez y aquí: hacerlo
    // en dos sitios distintos es como se cuela un céntimo que nadie encuentra.
    const centimos = Math.round(saldo * 100);
    const moneda = String(cuota.moneda || 'EUR').toLowerCase();
    const curso = (cuota as Record<string, any>).cem_enrollments?.cem_courses?.nombre || 'Programa';
    const origen = volver_a || req.headers.get('origin') || '';

    const cuerpo = new URLSearchParams({
      mode: 'payment',
      'payment_method_types[0]': 'card',
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': moneda,
      'line_items[0][price_data][unit_amount]': String(centimos),
      'line_items[0][price_data][product_data][name]': `${curso} — cuota ${cuota.numero ?? ''}`.trim(),
      success_url: `${origen}?pago=ok`,
      cancel_url: `${origen}?pago=cancelado`,
      client_reference_id: String(cuota.id),
      'metadata[installment_id]': String(cuota.id),
      'metadata[profile_id]': String(perfil.id),
      ...(perfil.email ? { customer_email: String(perfil.email) } : {}),
    });

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        // Si la persona pulsa dos veces, Stripe devuelve la MISMA sesión en vez
        // de abrir dos cobros. La clave incluye el saldo: si abona una parte por
        // otra vía, el importe cambia y entonces sí hace falta una sesión nueva.
        'Idempotency-Key': `cem-${cuota.id}-${centimos}`,
      },
      body: cuerpo,
    });
    const sesion = await res.json();
    if (!res.ok) {
      return json({ error: sesion?.error?.message || 'Stripe no pudo abrir el cobro.' }, 502);
    }

    await admin.from('cem_stripe_sesiones').upsert({
      session_id: sesion.id,
      installment_id: cuota.id,
      profile_id: perfil.id,
      monto_centimos: centimos,
      moneda,
      estado: 'abierta',
    }, { onConflict: 'session_id' });

    return json({ ok: true, url: sesion.url, session_id: sesion.id });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
