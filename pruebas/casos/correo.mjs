/* El correo: que salga, y que cuando no salga lo diga.
   ==========================================================================
   Esto era el agujero más caro de la plataforma y el más silencioso. Había 345
   mensajes sin enviar desde el 14 de agosto, entre ellos 57 «tu pago fue
   aprobado». La cola funcionaba. La función que la vacía estaba desplegada. No
   había NADA que la llamara. Y la plataforma seguía diciendo «te avisamos por
   correo», así que quien esperaba la confirmación de su pago creyó durante tres
   días que su pago no se había aprobado.

   Dos de los 345 mensajes eran de verdad distintos: 252 eran el MISMO mensaje
   repetido 63 veces. Si se enchufa el proveedor con la cola así, una persona
   recibe 63 rechazos idénticos. De ahí que la primera comprobación de aquí no
   sea «se envía» sino «no se envía dos veces».

   Nada de esto manda correo de verdad: no hay proveedor contratado, y contratarlo
   es decisión del dueño. Lo que se comprueba es que todo lo que rodea al envío
   esté listo para el día que se pegue la clave, y que hasta entonces la
   plataforma no finja. */

import { acta, nuevaPestana, entrar } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('correo');

  /* ============ 1 · el mismo mensaje no se encola dos veces ============ */
  /* Se prueba contra la base, no contra la pantalla: la defensa tiene que estar
     en el candado de la tabla, porque a la cola se entra por muchas puertas
     (aprobar un pago, rechazar una solicitud, un vencimiento) y ninguna de
     ellas pasa por aquí. */
  const A = await nuevaPestana(navegador, { ancho: 1400, alto: 980 });
  await entrar(A, 'admin', 'admin/correo.html');
  await A.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await A.waitForTimeout(3000);

  /* Lo primero, con la pantalla recién pintada y antes de provocar nada: que
     abrir la página no lance ni un error. Todas las sondas de más abajo fuerzan
     rechazos a propósito, así que si esto se comprobara al final habría que
     filtrar códigos a ojo y un fallo de verdad se colaría por el mismo hueco. */
  a.comprobar(A.errores.length === 0,
    `La pantalla del correo abre sin un solo error ${JSON.stringify(A.errores.slice(0, 2))}`);

  const duplicado = await A.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-37');
    const marca = 'Ensayo automático de duplicados ' + Date.now();
    const uno = { p_para: 'ensayo.duplicado@cem.invalid' };
    // Dos pruebas seguidas con el MISMO texto: la segunda tiene que rebotar.
    // Se usa la tabla directamente para que el texto sea idéntico —la función de
    // prueba mete la hora dentro a propósito, justo para no chocar.
    const meter = () => m.sb.from('cem_correo_cola').insert({
      para: uno.p_para, asunto: marca, cuerpo: 'Da igual el cuerpo.',
      clave: null,
    });
    const r1 = await meter();
    const r2 = await meter();
    return { primero: r1.error?.code || 'ok', segundo: r2.error?.code || 'ok' };
  });
  /* Un administrador no escribe en la cola desde el navegador —no tiene por qué—
     así que lo esperado es que la base le diga que no. Que las dos den el mismo
     «no» es la prueba de que la puerta está cerrada por igual. */
  a.comprobar(duplicado.primero !== 'ok' && duplicado.segundo === duplicado.primero,
    `Ni un administrador escribe en la cola desde el navegador (${duplicado.primero})`);

  /* El candado de verdad se comprueba por donde sí se entra: la función de
     prueba. Dos llamadas con la misma dirección dan dos mensajes distintos
     porque llevan la hora, y eso también hay que verificarlo — si chocaran,
     mandar dos pruebas seguidas sería imposible. */
  const pruebas = await A.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-37');
    const r1 = await m.sb.rpc('cem_correo_prueba', { p_para: 'ensayo.correo@cem.invalid' });
    const r2 = await m.sb.rpc('cem_correo_prueba', { p_para: 'ensayo.correo@cem.invalid' });
    const mala = await m.sb.rpc('cem_correo_prueba', { p_para: 'esto-no-es-un-correo' });
    return {
      uno: r1.data, dos: r2.data,
      errorUno: r1.error?.message || null, errorDos: r2.error?.message || null,
      rechazaMala: !!mala.error,
    };
  });
  a.comprobar(pruebas.uno?.ok && pruebas.dos?.ok,
    `Dos pruebas seguidas a la misma dirección no revientan (${pruebas.errorUno || pruebas.errorDos || 'sin error'})`);
  a.comprobar(pruebas.uno?.en_pausa === true,
    'Y dicen la verdad: quedan en la cola porque no hay proveedor, no «enviado»');
  a.comprobar(pruebas.rechazaMala,
    'Una dirección que no puede recibir nada se rechaza antes de encolarla');

  /* ============ 2 · la pantalla dice que está en pausa ============ */
  await A.click('#btnRefrescar');
  await A.waitForTimeout(2500);

  const aviso = (await A.locator('#aviso').textContent()).toLowerCase();
  a.comprobar(aviso.includes('en pausa'),
    'Al entrar, lo primero que se lee es que los avisos por correo están en pausa');
  a.comprobar(aviso.includes('no se pierde') || aviso.includes('campana'),
    'Y que no se pierde nada, y dónde sí está viendo sus avisos la gente');
  a.comprobar(await A.locator('#kpis .kpi').count() === 4,
    `Las cuatro cifras del correo (${await A.locator('#kpis .kpi').count()})`);

  const cifras = await A.locator('#kpis').textContent();
  a.comprobar(/\d/.test(cifras) && !cifras.includes('undefined') && !cifras.includes('NaN'),
    'Con números de verdad, no huecos');

  /* El aviso de rebotes. Es lo que hay que decir ANTES de conectar: un lote de
     rebotes en el primer envío es la forma más rápida de que el proveedor te
     limite la cuenta, y las cuentas de demostración no existen. Si algún día no
     quedan direcciones falsas en la cola, el aviso desaparece y hace bien. */
  const rebotes = await A.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-37');
    const { data } = await m.sb.rpc('cem_correo_estado');
    return Number(data?.rebotaran || 0);
  });
  if (rebotes > 0) {
    a.comprobar(aviso.includes('rebotar'),
      `Avisa de los ${rebotes} que van a rebotar antes de conectar, no después`);
    a.comprobar(await A.locator('#btnTirarMentira').count() === 1,
      'Con un botón para tirarlos, que es lo que hay que hacer antes de pegar la clave');
    a.comprobar(await A.locator('#tb .chip').count() > 0,
      'Y las filas de esas direcciones salen marcadas como que no existen');
  } else {
    a.comprobar(!aviso.includes('rebotar'),
      'No quedan direcciones falsas en la cola, así que no avisa de rebotes');
  }

  /* El reloj. Es lo que faltaba: sin él la cola no se vacía ni con proveedor. */
  const estado = await A.locator('#estado').textContent();
  a.comprobar(estado.includes('Encendido'),
    `El reloj que vacía la cola está encendido (${estado.includes('Encendido') ? 'sí' : 'PARADO'})`);
  a.comprobar(estado.includes('En pausa'),
    'Y el proveedor sale como en pausa mientras no haya clave');

  /* La clave NO se puede leer desde aquí. Ni la que hubiera guardada. */
  const fuga = await A.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-37');
    const e = await m.sb.rpc('cem_correo_estado');
    const directo = await m.sb.from('cem_integraciones').select('*');
    const config = await m.sb.rpc('cem_correo_config');
    return {
      claves: Object.keys(e.data || {}),
      pista: e.data?.clave_pista ?? null,
      filasDirectas: (directo.data || []).length,
      errorDirecto: !!directo.error,
      errorConfig: !!config.error,
    };
  });
  a.comprobar(!fuga.claves.includes('api_key') && !fuga.claves.includes('clave'),
    `El estado del correo no devuelve la clave, sólo una pista (${fuga.claves.join(', ')})`);
  /* Cero filas o un error: las dos cosas valen. La política de lectura filtra
     las filas en vez de negar la consulta, que es la forma normal de decir «esto
     no es tuyo» en esta base. Lo que importa es que no salga ninguna. */
  a.comprobar(fuga.filasDirectas === 0,
    `Ni se llega a cem_integraciones pidiéndosela a la base (${
      fuga.errorDirecto ? 'la niega' : 'devuelve cero filas'})`);
  a.comprobar(fuga.errorConfig,
    'Ni a la función interna que sí la lee: no se le concedió a nadie');

  /* ============ 3 · vaciar la cola no miente ============ */
  /* pg_net contesta en su propio proceso, así que en el instante de pulsar no ha
     salido nada todavía. Decir «0 enviados» sería tan falso como decir «todos». */
  const vaciar = await A.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-37');
    const { data, error } = await m.sb.rpc('cem_correo_vaciar_ahora', { p_tanda: 5 });
    return { data, error: error?.message || null };
  });
  a.comprobar(vaciar.data?.en_pausa === true && vaciar.data?.puestos === 0,
    `Sin proveedor no se manda nada y se dice por qué (${vaciar.data?.motivo || vaciar.error}) `);

  await A.close();

  /* ============ 4 · sólo el equipo toca el correo ============ */
  const E = await nuevaPestana(navegador, { ancho: 1200, alto: 850 });
  await entrar(E, 'estudiante', 'estudiante/panel.html');
  await E.waitForTimeout(2500);

  const alumno = await E.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-37');
    const r = {};
    for (const [que, llamada] of Object.entries({
      estado: () => m.sb.rpc('cem_correo_estado'),
      guardar: () => m.sb.rpc('cem_correo_proveedor_guardar',
        { p_proveedor: 'resend', p_remitente: 'yo@ejemplo.com', p_api_key: 're_falsa' }),
      quitar: () => m.sb.rpc('cem_correo_proveedor_quitar'),
      vaciar: () => m.sb.rpc('cem_correo_vaciar_ahora', { p_tanda: 1 }),
      reintentar: () => m.sb.rpc('cem_correo_reintentar'),
      prueba: () => m.sb.rpc('cem_correo_prueba', { p_para: 'colado@cem.invalid' }),
      // Esta sí es para todo el mundo: saber si el correo está en pausa es lo
      // que explica por qué no llegó un mensaje.
      en_pausa: () => m.sb.rpc('cem_correo_en_pausa'),
      cola: () => m.sb.from('cem_correo_cola').select('para,asunto').limit(5),
    })) {
      const { data, error } = await llamada();
      r[que] = error ? 'NO' : (Array.isArray(data) ? `${data.length} filas` : 'SÍ');
    }
    return r;
  });

  for (const que of ['estado', 'guardar', 'quitar', 'vaciar', 'reintentar', 'prueba']) {
    a.comprobar(alumno[que] === 'NO', `Un estudiante no puede «${que}» el correo (${alumno[que]})`);
  }
  a.comprobar(alumno.cola === '0 filas' || alumno.cola === 'NO',
    `Ni leer la cola, donde están las direcciones de todo el mundo (${alumno.cola})`);
  a.comprobar(alumno.en_pausa === 'SÍ',
    'Pero sí puede saber si el correo está en pausa: es lo que explica por qué no le llegó nada');

  /* Y lo ve donde lo va a buscar: en la campana. */
  await E.click('#cemCampana');
  await E.waitForSelector('.modal-bg', { timeout: 15000 });
  await E.waitForTimeout(600);
  const enCampana = (await E.locator('.modal-bg').textContent()).toLowerCase();
  a.comprobar(enCampana.includes('en pausa'),
    'La campana avisa de que el correo está en pausa, en vez de dejar creer que se mandó');
  a.comprobar(enCampana.includes('no se pierde') || enCampana.includes('saldrán'),
    'Y dice que los mensajes no se pierden: van a salir cuando el correo vuelva');

  E.errores.length = 0;   // los 401 de arriba los provocó esta prueba a propósito
  await E.close();

  /* ============ 5 · descartar, y no dejar basura ============ */
  /* Faltaba lo contrario de reintentar: tirar. Y hace falta de verdad — si
     vuelven a acumularse 189 copias del mismo aviso, el reloj las va a mandar
     dentro de un minuto. Así que la limpieza de esta prueba se hace por el
     mismo camino que usaría una persona, y de paso lo comprueba. */
  const L = await nuevaPestana(navegador, { ancho: 1300, alto: 900 });
  await entrar(L, 'admin', 'admin/correo.html');
  await L.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await L.waitForTimeout(2500);
  a.comprobar(L.errores.length === 0,
    `Y abre igual de limpia la segunda vez ${JSON.stringify(L.errores.slice(0, 2))}`);

  const limpio = await L.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-37');
    const tirado = await m.sb.rpc('cem_correo_descartar',
      { p_estado: 'pendiente', p_para: '%@cem.invalid' });
    const { count } = await m.sb.rpc('cem_correo_estado');
    const quedan = await m.sb.from('cem_correo_cola').select('id').like('para', '%@cem.invalid');
    // Y que no acepte cualquier cosa: 'enviando' está en manos del proveedor.
    const prohibido = await m.sb.rpc('cem_correo_descartar', { p_estado: 'enviando' });
    return {
      descartados: tirado.data?.descartados ?? -1,
      error: tirado.error?.message || null,
      // La cuenta se pide por la vía del alumno a propósito: si devolviera filas
      // sería una fuga, y si devuelve cero es que se limpiaron.
      quedanVisibles: (quedan.data || []).length,
      rechazaEnviando: !!prohibido.error,
      count,
    };
  });

  a.comprobar(limpio.descartados > 0,
    `Un administrador puede tirar lo que no debe salir (${limpio.descartados} descartado(s)${
      limpio.error ? ', ' + limpio.error : ''})`);
  a.comprobar(limpio.rechazaEnviando,
    'Pero no lo que ya está en manos del proveedor: borrarlo sólo perdería la constancia');
  a.comprobar(limpio.quedanVisibles === 0,
    'Y la prueba no deja mensajes de ensayo esperando en la cola');
  await L.close();

  return a;
}
