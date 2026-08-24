// CEM · Entrega un recurso a cambio de un contacto.
//
// Es la pieza del final del embudo de redes: alguien comenta una palabra en
// Instagram, ManyChat le manda un enlace, y ese enlace acaba aquí con sus
// datos. Esta función los guarda y le devuelve lo prometido.
//
// Va sin verify_jwt porque quien llama NO tiene cuenta —ése es justamente el
// punto—, así que todo lo que llega es de fuera y nada se cree sin comprobar.
//
// Por qué existe esta función y no se hace todo con una llamada a la base:
//
//   · El documento vive en un cubo PRIVADO. Convertir su ruta en un enlace que
//     se pueda abrir requiere firmarlo con la clave de servicio, y esa clave no
//     puede estar en el navegador. Aquí sí.
//   · Y así la ruta del archivo no viaja nunca al navegador: lo que se
//     devuelve es un enlace ya firmado, que caduca. Quien mire la respuesta de
//     la red no encuentra dónde está el original.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

/** Cuánto dura el enlace del documento. Una hora es de sobra para descargarlo
 *  y poco para publicarlo en un grupo y que siga sirviendo mañana. */
const DURA_SEGUNDOS = 60 * 60;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** El texto del correo de después. Va aquí y no en la base porque es lo único
 *  que cambia según lo que se entregó. */
function correoDeDespues(nombre: string, titulo: string, correo: string, sitio: string) {
  const registro = `${sitio}/plataforma/index.html?registro=1&correo=${encodeURIComponent(correo)}`;
  return {
    asunto: `Ahí lo tienes: ${titulo}`,
    cuerpo: `Hola ${nombre}:

Ya tienes «${titulo}». Si el enlace se te caducó, escríbenos y te lo mandamos otra vez.

Una cosa más, por si te sirve: con los datos que nos dejaste puedes terminar tu
cuenta en un minuto y quedarte con todo lo que vayas pidiendo en un solo sitio,
además de poder inscribirte en un programa cuando quieras.

Terminar mi cuenta: ${registro}

Y si no te interesa, no hace falta que hagas nada. Lo que pediste ya es tuyo.

— CEM International`,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Sólo POST.' }, 405);

  try {
    const { codigo, nombre, apellido, email, telefono, origen, sitio } =
      await req.json().catch(() => ({}));

    if (!codigo) return json({ error: 'Falta decir qué recurso es.' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // La base comprueba los datos y anota el contacto. Si algo falta o el
    // recurso no existe, contesta ella con el motivo en castellano.
    const { data, error } = await admin.rpc('cem_recurso_entregar', {
      p_codigo: String(codigo),
      p_nombre: String(nombre ?? ''),
      p_apellido: String(apellido ?? ''),
      p_email: String(email ?? ''),
      p_telefono: String(telefono ?? ''),
      p_origen: origen ? String(origen).slice(0, 120) : null,
    });
    if (error) return json({ error: error.message }, 400);

    /* Lo que se devuelve depende del tipo, y en ningún caso incluye dónde está
       el original. */
    let entrega: Record<string, unknown> = { tipo: data.tipo, titulo: data.titulo };

    if (data.tipo === 'documento') {
      const { data: firmado, error: eFirma } = await admin.storage
        .from('cem-regalos')
        .createSignedUrl(data.storage_path, DURA_SEGUNDOS, {
          // Que al descargarlo se llame como su archivo y no como su uuid.
          download: data.archivo_nombre || true,
        });
      if (eFirma || !firmado?.signedUrl) {
        // El contacto YA está guardado, así que esto no se puede tragar en
        // silencio: la persona dejó sus datos y hay que decirle qué pasó.
        return json({
          error: 'Tus datos quedaron guardados, pero el archivo no se pudo preparar. '
               + 'Escríbenos y te lo mandamos a mano.',
        }, 502);
      }
      entrega = { ...entrega, enlace: firmado.signedUrl, caducaEn: DURA_SEGUNDOS,
                  archivo: data.archivo_nombre };
    } else if (data.tipo === 'video') {
      entrega = { ...entrega, video: data.video_id };
    } else {
      entrega = { ...entrega, enlace: data.url, externo: true };
    }

    /* El correo sólo la primera vez. A quien vuelve a pedir el mismo recurso
       porque se le caducó el enlace no hay que volver a invitarle a nada. */
    if (!data.repetido && data.email) {
      const base = typeof sitio === 'string' && /^https:\/\/[\w.-]+$/.test(sitio)
        ? sitio : 'https://escuelacem.com';
      const { asunto, cuerpo } = correoDeDespues(data.nombre, data.titulo, data.email, base);
      // Falla sin ruido a propósito: que el correo no salga no puede impedir
      // que la persona reciba lo que vino a buscar.
      await admin.from('cem_correo_cola').insert({
        para: data.email, asunto, cuerpo,
        clave: `recurso:${codigo}:${data.email}`,
      }).then(() => {}, () => {});
    }

    return json({ ok: true, ...entrega });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
