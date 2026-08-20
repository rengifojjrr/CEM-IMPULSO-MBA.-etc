/* La conexión con YouTube.
   ==========================================================================
   Los vídeos de los cursos no viven en la plataforma: van a un canal de YouTube
   «no listado» y aquí se guarda a cuál corresponde cada lección. Sale gratis y
   el vídeo nunca pasa por nuestro servidor.

   Para eso hacen falta unas credenciales de Google, y guardarlas era un INSERT
   a mano en cem_integraciones. La pantalla lo decía con eufemismo —«ese paso lo
   hace quien administra la plataforma»— que es como se quedó sin hacer.

   ── AVISO, y viene de haberla liado ──────────────────────────────────────
   La primera versión de esta prueba guardaba credenciales de mentira y luego
   las borraba. Con la escuela ya conectada, eso tiró abajo la conexión de
   verdad, y el permiso del canal NO se puede restaurar desde aquí: hay que
   volver a pulsar «Conectar» delante de Google.

   Peor todavía: una de las sondas de validación —guardar sin secreto— no falla
   cuando ya hay uno guardado. Está bien que no falle, es lo que permite
   corregir la URL de retorno sin ir a buscar el secreto otra vez. Pero eso la
   convierte en una escritura, y escribía el identificador falso encima del
   bueno.

   De ahí la forma de este archivo: PRIMERO se mira si hay una app de verdad, y
   sólo si no la hay se ejecuta nada que escriba. La prueba no puede «guardar y
   restaurar» para salir del paso, porque el secreto no se puede leer ni siendo
   administrador — y eso es una virtud del diseño, no un estorbo. Lo correcto es
   que la prueba se aparte. */

import { acta, nuevaPestana, entrar } from '../entorno.mjs';

const FALSO_ID = '000000000000-pruebaautomatica.apps.googleusercontent.com';

export default async function correr(navegador) {
  const a = acta('youtube');

  const A = await nuevaPestana(navegador, { ancho: 1340, alto: 980 });
  await entrar(A, 'admin', 'admin/youtube-conectar.html');
  await A.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await A.waitForTimeout(3000);

  a.comprobar(A.errores.length === 0,
    `La pantalla abre sin un solo error ${JSON.stringify(A.errores.slice(0, 2))}`);

  /* ============ 1 · lo primero de todo: ¿hay algo que se pueda romper? ====== */
  const estado = await A.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-25');
    const { data } = await m.sb.rpc('cem_youtube_app_estado');
    return data || {};
  });
  const esDeMentira = String(estado.client_id || '').includes('pruebaautomatica');
  const puedoEscribir = !estado.configurada || esDeMentira;

  /* ============ 2 · la URL de retorno se puede copiar ============ */
  /* Es el dato del que sale casi todo «redirect_uri_mismatch»: hay que pegarlo
     en Google Cloud carácter por carácter. Que la pantalla lo enseñe en vez de
     obligar a teclearlo es la mitad del arreglo. */
  const url = (await A.locator('#urlRetorno').textContent()).trim();
  a.comprobar(url === A.url().split('?')[0].split('#')[0],
    `Enseña la URL de retorno, y es la de esta misma página (${url.slice(-46)})`);
  a.comprobar(!url.endsWith('/'),
    'Sin barra al final: con barra y sin barra son direcciones distintas para Google');
  a.comprobar(await A.locator('#btnCopiar').count() === 1,
    'Con un botón para copiarla, en vez de que haya que teclearla');

  /* ============ 3 · el secreto no sale por ningún camino ============ */
  /* Esto se comprueba SIEMPRE, haya app de verdad o no: es lo que más importa
     y no escribe nada. */
  const fuga = await A.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-25');
    const e = await m.sb.rpc('cem_youtube_app_estado');
    const directo = await m.sb.from('cem_integraciones').select('*').eq('id', 'youtube_oauth_app');
    return {
      claves: Object.keys(e.data || {}),
      entero: JSON.stringify(e.data || {}),
      pista: e.data?.secreto_pista || null,
      filasDirectas: (directo.data || []).length,
    };
  });
  a.comprobar(!fuga.claves.includes('client_secret'),
    `El estado no devuelve el secreto (${fuga.claves.join(', ')})`);
  a.comprobar(!/GOCSPX-[A-Za-z0-9_-]{6,}/.test(fuga.entero),
    'Ni asomado en ningún otro campo de la respuesta');
  a.comprobar(fuga.filasDirectas === 0,
    'Ni se llega a la tabla pidiéndosela a la base');
  if (estado.configurada) {
    a.comprobar(/^••••.{4}$/.test(fuga.pista || ''),
      `Del secreto guardado sólo vuelve una pista de cuatro caracteres (${fuga.pista})`);
  }

  /* ============ 4 · las entradas malas se rechazan ============ */
  /* Las tres de aquí abajo fallan ANTES de escribir nada, así que son seguras
     con o sin app configurada. La cuarta —guardar sin secreto— no: cuando ya
     hay uno guardado, conserva el de antes y escribe. Por eso vive más abajo,
     dentro del bloque que sólo corre cuando no hay nada que estropear. */
  const malos = await A.evaluate(async (id) => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-25');
    const probar = (args) => m.sb.rpc('cem_youtube_app_guardar', args)
      .then(({ error }) => error?.message || 'PASÓ');
    return {
      idCorto:  await probar({ p_client_id: '123456789', p_redirect_uri: 'https://x.test/y.html', p_client_secret: 'GOCSPX-x' }),
      sinHttps: await probar({ p_client_id: id, p_redirect_uri: 'http://ejemplo.com/y.html', p_client_secret: 'GOCSPX-x' }),
      conBarra: await probar({ p_client_id: id, p_redirect_uri: 'https://ejemplo.com/y.html/', p_client_secret: 'GOCSPX-x' }),
    };
  }, FALSO_ID);

  a.comprobar(malos.idCorto.includes('apps.googleusercontent.com'),
    'Un ID de cliente que no es un ID de cliente se rechaza, y dice cómo tiene que ser');
  a.comprobar(malos.sinHttps.includes('https'),
    'Una URL de retorno sin https se rechaza: Google no la acepta');
  a.comprobar(malos.conBarra.includes('barra'),
    'Y una con barra al final también, que es el fallo que nadie ve');

  /* ============ 5 · el ciclo entero, sólo si no hay nada que romper ======== */
  if (!puedoEscribir) {
    a.comprobar(true,
      `Hay una app de Google de verdad puesta (${String(estado.client_id).slice(0, 16)}…), `
      + 'así que la prueba no la toca: borrarla obligaría a reconectar el canal a mano');
  } else {
    const sinSecreto = await A.evaluate(async (id) => {
      const m = await import('/plataforma/assets/app.js?v=2026-08-21-25');
      const { error } = await m.sb.rpc('cem_youtube_app_guardar',
        { p_client_id: id, p_redirect_uri: 'https://ejemplo.com/y.html' });
      return error?.message || 'PASÓ';
    }, FALSO_ID);
    a.comprobar(sinSecreto.includes('secreto'),
      'Sin nada guardado y sin secreto, no se guarda, y se dice dónde encontrarlo');

    const guardado = await A.evaluate(async (id) => {
      const m = await import('/plataforma/assets/app.js?v=2026-08-21-25');
      const { data, error } = await m.sb.rpc('cem_youtube_app_guardar', {
        p_client_id: id,
        p_redirect_uri: location.origin + location.pathname,
        p_client_secret: 'GOCSPX-secreto-de-prueba-4321',
      });
      return error ? { error: error.message } : data;
    }, FALSO_ID);

    a.comprobar(guardado.configurada === true && guardado.client_id === FALSO_ID,
      `Se guarda y queda configurada (${guardado.error || 'sin error'})`);
    a.comprobar(guardado.secreto_pista === '••••4321',
      `Y del secreto recién puesto sólo vuelve la pista (${guardado.secreto_pista})`);

    await A.reload({ waitUntil: 'domcontentloaded' });
    await A.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
    await A.waitForTimeout(3000);

    const enPantalla = await A.locator('#cont').textContent();
    a.comprobar(enPantalla.includes('Configurada'),
      'Al volver a entrar, la pantalla dice que la app está configurada');
    a.comprobar(!enPantalla.includes('secreto-de-prueba'),
      'Y en ningún sitio de la pantalla aparece el secreto');
    a.comprobar(!(await A.locator('#btnConectar').isDisabled()),
      'Con la app guardada, el botón de conectar el canal ya se puede pulsar');

    /* Y se deja como estaba: sin app, que es como se encontró. */
    const quitado = await A.evaluate(async () => {
      const m = await import('/plataforma/assets/app.js?v=2026-08-21-25');
      const { data, error } = await m.sb.rpc('cem_youtube_app_quitar');
      return { configurada: data?.configurada, conectado: data?.conectado, error: error?.message };
    });
    a.comprobar(quitado.configurada === false && quitado.conectado === false,
      `Quitar la app la borra entera, y el canal con ella (${quitado.error || 'sin error'})`);
  }
  await A.close();

  /* ============ 6 · esto no lo toca nadie más ============ */
  const E = await nuevaPestana(navegador, { ancho: 1200, alto: 850 });
  await entrar(E, 'estudiante', 'estudiante/panel.html');
  await E.waitForTimeout(2500);

  const alumno = await E.evaluate(async (id) => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-25');
    const r = {};
    for (const [que, llamada] of Object.entries({
      estado: () => m.sb.rpc('cem_youtube_app_estado'),
      guardar: () => m.sb.rpc('cem_youtube_app_guardar',
        { p_client_id: id, p_redirect_uri: 'https://colado.test/x.html', p_client_secret: 'GOCSPX-colado' }),
      quitar: () => m.sb.rpc('cem_youtube_app_quitar'),
      desconectar: () => m.sb.rpc('cem_youtube_desconectar'),
    })) {
      const { error } = await llamada();
      r[que] = error ? 'NO' : 'SÍ';
    }
    return r;
  }, FALSO_ID);

  for (const que of ['estado', 'guardar', 'quitar', 'desconectar']) {
    a.comprobar(alumno[que] === 'NO',
      `Un estudiante no puede «${que}» la integración de YouTube (${alumno[que]})`);
  }
  E.errores.length = 0;   // los rechazos de arriba los provocó esta prueba
  await E.close();

  return a;
}
