// CEM · Donar al fondo de becas («Ayuda a alguien a estudiar»).
//
// El navegador NO habla con Stripe: pide aquí un cobro y recibe la dirección a
// la que ir. El importe no viene del navegador: lo pone la base, que es la que
// sabe cuánto es cada paquete y entre qué límites puede estar «otro monto».
//
// La donación se abre «iniciada» y sólo entra en el fondo cuando Stripe avisa,
// firmado, de que se cobró (cem-stripe-webhook → cem_beca_donacion_confirmar_
// servidor). Una sesión abierta que nadie paga no cuenta para nada.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Sólo POST.' }, 405);

  try {
    const d = await req.json().catch(() => ({} as Record<string, unknown>));
    const idioma = d.idioma === 'en' ? 'en' : 'es';
    const en = idioma === 'en';
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    /* El nombre y el correo son opcionales. Sin nombre, la donación es
       anónima: no sale en ningún sitio. Sin correo, Stripe lo pide en su
       pantalla y llega con el aviso de cobro, para mandar el recibo. */
    const anonima = d.anonima === true;
    const correo = String(d.email ?? '').trim().toLowerCase();

    // La base valida, frena y deja la donación «iniciada» con su importe.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const { data: don, error: eAbrir } = await admin.rpc('cem_beca_donacion_abrir', {
      p_paquete_id: typeof d.paquete_id === 'string' && d.paquete_id ? d.paquete_id : null,
      p_monto: d.paquete_id ? null : Number(d.monto ?? 0),
      p_nombre: anonima ? '' : String(d.nombre ?? ''),
      p_email: correo || null,
      p_pais: d.pais ? String(d.pais) : null,
      p_organizacion: !anonima && d.organizacion ? String(d.organizacion) : null,
      p_mensaje: d.mensaje ? String(d.mensaje) : null,
      p_publica: !anonima && d.publica === true,
      p_idioma: idioma,
      p_origen: d.origen ? String(d.origen) : null,
      p_campana: d.campana ? String(d.campana) : null,
      p_ip: ip,
    });
    if (eAbrir) return json({ error: eAbrir.message }, 400);

    const cuenta = await cuentaPorClave(admin, don.stripe_cuenta ?? null);
    if (!cuenta?.secret_key) {
      return json({ error: en
        ? 'Card donations are not set up yet. Please write to us and we will help you give another way.'
        : 'Las donaciones con tarjeta todavía no están configuradas. Escríbenos y te ayudamos a donar de otra forma.' }, 409);
    }

    const origenPedido = req.headers.get('origin') || '';
    const vuelta = VUELTAS.includes(origenPedido) ? origenPedido : VUELTA_POR_DEFECTO;
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
      ...(correo ? { customer_email: correo } : {}),
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

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cuenta.secret_key}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        // Cada intento es una donación nueva, con su propio identificador: esta
        // clave sólo protege del doble envío de ESTE intento.
        'Idempotency-Key': `cem-don-${don.donacion_id}`,
      },
      body: cuerpo,
    });
    const sesion = await res.json();
    if (!res.ok) {
      await admin.from('cem_becas_donaciones').update({ estado: 'fallida' })
        .eq('id', don.donacion_id).eq('estado', 'iniciada');
      return json({ error: sesion?.error?.message || (en ? 'Stripe could not open the payment.' : 'Stripe no pudo abrir el cobro.') }, 502);
    }

    await admin.rpc('cem_beca_donacion_sesion', { p_id: don.donacion_id, p_session_id: sesion.id });
    return json({ ok: true, url: sesion.url, donacion_id: don.donacion_id, numero: don.numero });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
