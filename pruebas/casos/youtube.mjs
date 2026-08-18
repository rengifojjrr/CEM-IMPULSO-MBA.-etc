/* La conexión con YouTube.
   ==========================================================================
   Los videos de los cursos no viven en la plataforma: van a un canal de YouTube
   «no listado» y aquí se guarda el enlace. Sale gratis y el video nunca pasa por
   nuestro servidor.

   Para que eso funcione hacen falta unas credenciales de Google, y la única
   forma de guardarlas era un INSERT a mano en cem_integraciones. La pantalla lo
   decía con eufemismo —«ese paso lo hace quien administra la plataforma»— que es
   como estuvo tres semanas sin hacerse. Mismo bloqueo que tenía el correo.

   Nada de esto habla con Google de verdad: crear el proyecto en Google Cloud es
   decisión y cuenta del dueño. Lo que se comprueba es que todo lo de este lado
   esté listo, y sobre todo que el secreto no se pueda leer desde el navegador. */

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

  /* ============ 1 · la URL de retorno se puede copiar ============ */
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

  /* ============ 2 · no deja guardar cualquier cosa ============ */
  const malos = await A.evaluate(async (id) => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-20');
    const probar = (args) => m.sb.rpc('cem_youtube_app_guardar', args)
      .then(({ error }) => error?.message || 'PASÓ');
    return {
      // El error más común: pegar el número del proyecto en vez del ID entero.
      idCorto: await probar({ p_client_id: '123456789', p_redirect_uri: 'https://x.test/y.html', p_client_secret: 'GOCSPX-x' }),
      // Google no acepta http salvo en localhost.
      sinHttps: await probar({ p_client_id: id, p_redirect_uri: 'http://ejemplo.com/y.html', p_client_secret: 'GOCSPX-x' }),
      conBarra: await probar({ p_client_id: id, p_redirect_uri: 'https://ejemplo.com/y.html/', p_client_secret: 'GOCSPX-x' }),
      // Sin secreto y sin nada guardado antes no hay nada que conservar.
      sinSecreto: await probar({ p_client_id: id, p_redirect_uri: 'https://ejemplo.com/y.html' }),
    };
  }, FALSO_ID);

  a.comprobar(malos.idCorto.includes('apps.googleusercontent.com'),
    'Un ID de cliente que no es un ID de cliente se rechaza, y dice cómo tiene que ser');
  a.comprobar(malos.sinHttps.includes('https'),
    'Una URL de retorno sin https se rechaza: Google no la acepta');
  a.comprobar(malos.conBarra.includes('barra'),
    'Y una con barra al final también, que es el fallo que nadie ve');
  a.comprobar(malos.sinSecreto.includes('secreto'),
    'Sin secreto no se guarda, y se dice dónde encontrarlo');

  /* ============ 3 · guardar de verdad, y que el secreto no vuelva ============ */
  const guardado = await A.evaluate(async (id) => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-20');
    const { data, error } = await m.sb.rpc('cem_youtube_app_guardar', {
      p_client_id: id,
      p_redirect_uri: location.origin + location.pathname,
      p_client_secret: 'GOCSPX-secreto-de-prueba-4321',
    });
    if (error) return { error: error.message };
    // Y ahora, por todos los caminos posibles: ¿se puede leer el secreto?
    const estado = await m.sb.rpc('cem_youtube_app_estado');
    const directo = await m.sb.from('cem_integraciones').select('*').eq('id', 'youtube_oauth_app');
    return {
      claves: Object.keys(data || {}),
      pista: data?.secreto_pista,
      clientId: data?.client_id,
      configurada: data?.configurada,
      textoEntero: JSON.stringify(estado.data || {}),
      filasDirectas: (directo.data || []).length,
    };
  }, FALSO_ID);

  a.comprobar(guardado.configurada === true && guardado.clientId === FALSO_ID,
    `Se guarda y queda configurada (${guardado.error || 'sin error'})`);
  a.comprobar(!guardado.claves?.includes('client_secret'),
    `El estado no devuelve el secreto (${(guardado.claves || []).join(', ')})`);
  a.comprobar(!guardado.textoEntero?.includes('secreto-de-prueba'),
    'Ni escondido en ningún otro campo de la respuesta');
  a.comprobar(guardado.pista === '••••4321',
    `Sólo una pista de cuatro caracteres para reconocerlo (${guardado.pista})`);
  a.comprobar(guardado.filasDirectas === 0,
    'Ni se llega a la tabla pidiéndosela a la base');

  /* El ID de cliente sí vuelve entero, y tiene que volver: sin él no se puede
     armar la URL a la que mandar a la persona. No es un secreto — viaja en esa
     URL a la vista de cualquiera. */
  await A.click('#btnRefrescar').catch(() => {});
  await A.reload({ waitUntil: 'domcontentloaded' });
  await A.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await A.waitForTimeout(3000);

  const enPantalla = await A.locator('#cont').textContent();
  a.comprobar(enPantalla.includes('Configurada'),
    'Al volver a entrar, la pantalla dice que la app está configurada');
  a.comprobar(!enPantalla.includes('secreto-de-prueba'),
    'Y en ningún sitio de la pantalla aparece el secreto');
  a.comprobar(enPantalla.includes('4321'),
    'Sólo la pista, para reconocer cuál está guardado');

  const boton = A.locator('#btnConectar');
  a.comprobar(!(await boton.isDisabled()),
    'Con la app guardada, el botón de conectar el canal ya se puede pulsar');

  /* ============ 4 · quitar la app la deja como estaba ============ */
  const quitado = await A.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-20');
    const { data, error } = await m.sb.rpc('cem_youtube_app_quitar');
    return { configurada: data?.configurada, conectado: data?.conectado, error: error?.message };
  });
  a.comprobar(quitado.configurada === false && quitado.conectado === false,
    `Quitar la app la borra entera, y el canal con ella (${quitado.error || 'sin error'})`);
  /* No se vuelve a comprobar «sin errores» aquí: las sondas de entrada inválida
     de más arriba provocan 400 a propósito. Que la pantalla abre limpia ya se
     comprobó al entrar, que es antes de haber provocado nada. */
  await A.close();

  /* ============ 5 · esto no lo toca nadie más ============ */
  const E = await nuevaPestana(navegador, { ancho: 1200, alto: 850 });
  await entrar(E, 'estudiante', 'estudiante/panel.html');
  await E.waitForTimeout(2500);

  const alumno = await E.evaluate(async (id) => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-20');
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
  E.errores.length = 0;   // los 403 de arriba los provocó esta prueba a propósito
  await E.close();

  return a;
}
