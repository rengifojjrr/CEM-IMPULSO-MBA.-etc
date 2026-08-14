// CEM · Vacía la cola de correo.
//
// La plataforma nunca envía un correo directamente: los deja en
// `cem_correo_cola` y esta función los saca de a tandas. Así el aviso dentro
// de la plataforma funciona siempre, aunque todavía no haya un proveedor de
// correo contratado, y el día que se conecte uno no hay que tocar ninguna
// pantalla — sólo guardar la clave en `cem_integraciones` con id 'correo'.
//
// Configuración esperada en cem_integraciones (id = 'correo'):
//   { "proveedor": "resend", "api_key": "re_...", "remitente": "CEM <no-responder@dominio>" }
//
// Las claves viven sólo del lado del servidor: ni el navegador ni el
// repositorio las ven nunca.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TANDA = 25;          // correos por invocación
const MAX_INTENTOS = 4;    // después de esto se marca fallido y no se reintenta

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

/** Envuelve el texto plano en una plantilla sobria con la marca de la casa. */
function plantillaHtml(asunto: string, cuerpo: string) {
  const escapar = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const parrafos = cuerpo
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.6">${escapar(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<!doctype html><html lang="es"><body style="margin:0;background:#F6F4EF;
    font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#22201C">
    <div style="max-width:560px;margin:0 auto;padding:28px 20px">
      <div style="font-weight:700;letter-spacing:.04em;color:#8A6D1F;margin-bottom:18px">CEM INTERNATIONAL</div>
      <div style="background:#fff;border:1px solid #E6E1D6;border-radius:14px;padding:24px">
        <h1 style="margin:0 0 16px;font-size:19px;line-height:1.35">${escapar(asunto)}</h1>
        ${parrafos}
      </div>
      <p style="margin:18px 0 0;font-size:12px;color:#7A756B;line-height:1.5">
        Este mensaje se envió automáticamente desde la plataforma de CEM International.
        No respondas a esta dirección; escríbenos desde tu panel si necesitas ayuda.
      </p>
    </div></body></html>`;
}

async function enviarResend(apiKey: string, remitente: string, para: string, asunto: string, cuerpo: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: remitente,
      to: [para],
      subject: asunto,
      text: cuerpo,
      html: plantillaHtml(asunto, cuerpo),
    }),
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Resend respondió ${res.status}: ${detalle.slice(0, 300)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: cfg } = await sb
    .from('cem_integraciones')
    .select('datos')
    .eq('id', 'correo')
    .maybeSingle();

  const proveedor = cfg?.datos?.proveedor;
  const apiKey = cfg?.datos?.api_key;
  const remitente = cfg?.datos?.remitente;

  const { count: enCola } = await sb
    .from('cem_correo_cola')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'pendiente');

  if (!proveedor || !apiKey || !remitente) {
    // No es un error: es el estado normal mientras no haya proveedor. Los
    // avisos dentro de la plataforma ya le llegaron a la persona.
    return json({
      ok: true,
      enviados: 0,
      en_cola: enCola ?? 0,
      aviso: 'No hay proveedor de correo configurado. Los mensajes quedan en cola sin perderse. ' +
             "Para activarlo, guarda en cem_integraciones (id 'correo') el proveedor, la clave y el remitente.",
    });
  }
  if (proveedor !== 'resend') {
    return json({ ok: false, error: `Proveedor "${proveedor}" no implementado. Hoy sólo se envía por Resend.` }, 400);
  }

  const { data: pendientes, error } = await sb
    .from('cem_correo_cola')
    .select('id, para, asunto, cuerpo, intentos')
    .eq('estado', 'pendiente')
    .order('created_at', { ascending: true })
    .limit(TANDA);

  if (error) return json({ ok: false, error: error.message }, 500);

  let enviados = 0;
  let fallidos = 0;

  for (const m of pendientes ?? []) {
    try {
      await enviarResend(apiKey, remitente, m.para, m.asunto, m.cuerpo);
      await sb.from('cem_correo_cola')
        .update({ estado: 'enviado', enviado_en: new Date().toISOString(), error: null })
        .eq('id', m.id);
      enviados++;
    } catch (e) {
      const intentos = (m.intentos ?? 0) + 1;
      const agotado = intentos >= MAX_INTENTOS;
      await sb.from('cem_correo_cola')
        .update({
          estado: agotado ? 'fallido' : 'pendiente',
          intentos,
          error: String((e as Error).message).slice(0, 500),
        })
        .eq('id', m.id);
      fallidos++;
    }
  }

  return json({ ok: true, enviados, fallidos, en_cola: Math.max(0, (enCola ?? 0) - enviados) });
});
