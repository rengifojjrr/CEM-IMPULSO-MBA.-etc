// CEM · Vacía la cola de correo.
//
// Esto ya NO envía. Envía la base de datos.
//
// Antes esta función tenía su propia plantilla HTML, su propia política de
// reintentos y su propia lectura de la configuración. El problema no era que
// estuviera mal: era que nadie la llamaba. La cola se quedó con 345 mensajes
// desde el 14 de agosto porque la función estaba desplegada y no había ningún
// reloj apuntándole.
//
// Para que la llamara pg_cron hacía falta que la base guardara la clave de
// servicio (por el verify_jwt), y esa clave no puede vivir en el repositorio ni
// tenemos forma de meterla en el Vault desde aquí. Así que el envío se movió a
// donde ya estaba la clave del proveedor: la propia base, con pg_net hablando
// directamente con Resend. Un motor menos que se pueda apagar solo.
//
//   cem_correo_empujar(tanda)  entrega la tanda al proveedor
//   cem_correo_recoger()       lee lo que contestó y cierra cada mensaje
//   cron: las dos, cada minuto
//
// Esta función se queda como puerta manual —un «vacía la cola ahora» que se
// puede pulsar desde fuera de la plataforma, o desde un despliegue— y delega en
// esas dos. Delegar y no duplicar: dos plantillas en dos sitios acaban siendo
// dos plantillas distintas, y dos políticas de reintento acaban contando los
// intentos dos veces.
//
// La configuración del proveedor se guarda desde la pantalla
// `plataforma/admin/correo.html`, no desde aquí ni con SQL a mano.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  // Recoger primero: si quedó algo de la vuelta anterior esperando respuesta,
  // cerrarlo antes de empujar más deja el recuento honesto.
  const { data: recogido, error: eRecoger } = await sb.rpc('cem_correo_recoger');
  if (eRecoger) return json({ ok: false, error: eRecoger.message }, 500);

  const { data: empujado, error: eEmpujar } = await sb.rpc('cem_correo_empujar', { p_tanda: 25 });
  if (eEmpujar) return json({ ok: false, error: eEmpujar.message }, 500);

  const { count: enCola } = await sb
    .from('cem_correo_cola')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'pendiente');

  return json({
    ok: true,
    en_cola: enCola ?? 0,
    // Lo que se acaba de entregar al proveedor. Todavía no se sabe si llegó:
    // pg_net contesta en su propio proceso y el reloj lo recoge en un minuto.
    puestos: empujado?.puestos ?? 0,
    // Lo que se cerró de la vuelta anterior.
    enviados: recogido?.enviados ?? 0,
    se_reintentan: recogido?.se_reintentan ?? 0,
    fallidos: recogido?.fallidos ?? 0,
    ...(empujado?.en_pausa
      ? {
        en_pausa: true,
        aviso: empujado.motivo
          ?? 'No hay proveedor de correo configurado. Los mensajes quedan en cola sin perderse. '
             + 'Para activarlo, entra en Operación → Envío de correo y pega la clave del proveedor.',
      }
      : {}),
  });
});
