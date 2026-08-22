/* El constructor de evaluaciones, tipo formulario.
   ==========================================================================
   Lo que se comprueba aquí no es que los botones estén: es la regla de la
   casa. Una evaluación declara sobre cuánto va —cien, normalmente— y las
   preguntas tienen que repartir exactamente ese número. Ni noventa ni ciento
   diez. Si eso se cuela, alguien saca 110 sobre 100 y no hay forma de
   explicarle a un estudiante por qué.

   La regla se comprueba dos veces a propósito: en la pantalla, que es donde
   ayuda, y contra la base llamando a la RPC directamente, que es donde tiene
   que aguantar. Una validación que sólo vive en el navegador no es una
   validación: es un consejo. */

import { acta, nuevaPestana, entrar, conLaBase, BASE } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('evaluaciones');
  const MARCA = 'PRUEBA-' + Date.now();

  const D = await nuevaPestana(navegador, { ancho: 1400, alto: 1100 });
  await entrar(D, 'coordinador', 'admin/evaluacion-nueva.html');
  await D.waitForSelector('#marcador', { timeout: 25000 });
  await D.waitForTimeout(2500);

  /* ============ el marcador de puntos ============ */
  a.comprobar((await D.locator('#marcador').textContent()).includes('de 100'),
    'El constructor abre diciendo sobre cuánto va la evaluación');

  const pestanas = await D.evaluate(() =>
    [...document.querySelectorAll('#tabs button')].map((b) => b.textContent.trim()));
  a.comprobar(pestanas.join(' ').includes('Respuestas'),
    `Y trae las tres pestañas de un formulario: ${pestanas.join(' · ')}`);

  /* ============ escribir preguntas ============ */
  await D.click('#btnAdd');
  await D.waitForSelector('[data-enun="0"]', { timeout: 10000 });

  const cuantosTipos = await D.locator('[data-tipo="0"] option').count();
  a.comprobar(cuantosTipos >= 10,
    `Cada pregunta puede ser de ${cuantosTipos} tipos distintos, no sólo de cuatro`);

  await D.fill('[data-enun="0"]', `${MARCA} ¿Cuál es la capital de Venezuela?`);
  await D.fill('[data-op="0:0"]', 'Caracas');
  await D.fill('[data-op="0:1"]', 'Maracaibo');
  await D.locator('[data-enun="0"]').click();          // salir del campo repinta las opciones
  await D.waitForTimeout(600);
  await D.locator('[data-clave="0"]').first().check();
  await D.waitForTimeout(500);

  // Una segunda pregunta, de un tipo que antes no existía.
  await D.click('#btnAdd');
  await D.waitForSelector('[data-enun="1"]', { timeout: 10000 });
  await D.fill('[data-enun="1"]', `${MARCA} Marca los países de Suramérica`);
  await D.selectOption('[data-tipo="1"]', 'casillas');
  await D.waitForTimeout(600);
  await D.fill('[data-op="1:0"]', 'Perú');
  await D.fill('[data-op="1:1"]', 'Portugal');
  await D.locator('[data-enun="1"]').click();
  await D.waitForTimeout(600);
  await D.locator('[data-clave="1"]').first().check();
  await D.waitForTimeout(500);
  a.comprobar(await D.locator('.opt-fila.correcta input[data-op="1:0"]').count() === 1,
    'Marcar la correcta la deja marcada de verdad, con el texto que tiene la opción ahora');

  /* ============ la regla: los puntos tienen que cuadrar ============ */
  const antes = await D.locator('#marcador').textContent();
  a.comprobar(/Faltan .* puntos/.test(antes),
    `Mientras no cuadren, el marcador dice cuánto falta («${antes.replace(/\s+/g, ' ').trim().slice(0, 70)}»)`);

  await D.click('#btnPub');
  await D.waitForTimeout(1200);
  const aviso = await D.locator('.toast').last().textContent().catch(() => '');
  a.comprobar(/suma|Faltan|exactamente/i.test(aviso),
    `Publicar sin cuadrar no se deja, y el aviso dice por qué: «${aviso.trim().slice(0, 80)}»`);
  a.comprobar(!/evaluaciones\.html$/.test(D.url()),
    'Y no se va de la pantalla: te deja donde puedes arreglarlo');

  /* ============ cuadrar de un botón ============ */
  await D.click('#btnRepartir');
  await D.waitForTimeout(1200);
  const cuadrado = await D.locator('#marcador').textContent();
  a.comprobar(/cuadran/.test(cuadrado),
    'El botón de repartir deja la suma exacta, sin dejar céntimos sueltos');

  const cifra = (await D.locator('#marcador .cifra').textContent()).replace(/\s+/g, ' ').trim();
  a.comprobar(cifra.startsWith('100 de 100'),
    `Y el marcador da 100 clavado, sin céntimos sueltos («${cifra}»)`);

  /* ============ la misma regla, del lado del servidor ============ */
  /* Aquí está lo importante: se salta la pantalla entera y se le pide a la
     base que publique una evaluación descuadrada. Si esto pasa, la regla no
     existe: sólo estaba pintada. */
  const cursoId = await D.locator('#curso').inputValue();
  const rechazo = await conLaBase(D, async (sb, curso) => {
    const { error } = await sb.rpc('cem_guardar_evaluacion', {
      p_id: null,
      p_datos: { nombre: 'DESCUADRADA', course_id: curso, puntaje_max: 100, estado: 'publicado' },
      p_preguntas: [{ enunciado: 'Una sola', tipo: 'corta', puntaje: 40 }],
    });
    return error?.message || 'SE PUBLICÓ IGUAL';
  }, cursoId);
  a.comprobar(/suman 40(\.00)? y la evaluación es sobre 100/i.test(rechazo),
    `La base rechaza publicar descuadrado aunque no pase por la pantalla: «${rechazo.slice(0, 90)}»`);

  const rechazoVacia = await conLaBase(D, async (sb, curso) => {
    const { error } = await sb.rpc('cem_guardar_evaluacion', {
      p_id: null,
      p_datos: { nombre: 'VACÍA', course_id: curso, puntaje_max: 100, estado: 'publicado' },
      p_preguntas: [],
    });
    return error?.message || 'SE PUBLICÓ IGUAL';
  }, cursoId);
  a.comprobar(/sin preguntas/i.test(rechazoVacia),
    'Y tampoco deja publicar una evaluación sin ninguna pregunta');

  /* Esos dos rechazos son peticiones que la base contesta con un 400, y el
     navegador los anota como errores de red. Los provocó esta prueba a
     propósito, así que no cuentan: se limpian aquí para que el recuento del
     final siga sirviendo para detectar los que no esperábamos. */
  D.errores.length = 0;

  /* ============ publicar de verdad ============ */
  await D.locator('[data-t="ajustes"]').click();
  await D.waitForTimeout(400);
  await D.fill('#nombre', `${MARCA} Examen de prueba`);
  await D.locator('#mostrarCorrectas').check();
  await D.locator('[data-t="preguntas"]').click();
  await D.waitForTimeout(400);

  await D.click('#btnPub');
  await D.waitForTimeout(3500);
  const publicada = await conLaBase(D, async (sb, marca) => {
    const { data } = await sb.from('cem_assessments').select('id,estado,puntaje_max')
      .ilike('nombre', `${marca}%`).maybeSingle();
    return data;
  }, MARCA);
  a.comprobar(publicada?.estado === 'publicado',
    `La evaluación cuadrada sí se publica (quedó «${publicada?.estado}»)`);

  /* Que las preguntas escritas dentro del constructor entren al banco es lo
     que hace que se puedan reutilizar; si se quedaran sueltas, cada examen
     empezaría de cero. */
  const enBanco = await conLaBase(D, async (sb, marca) => {
    const { count } = await sb.from('cem_questions')
      .select('id', { count: 'exact', head: true }).ilike('enunciado', `${marca}%`);
    return count;
  }, MARCA);
  a.comprobar(enBanco >= 2,
    `Las preguntas escritas en el constructor quedan en el banco para reutilizarlas (${enBanco})`);

  /* ============ el corrector entiende los tipos nuevos ============ */
  const corrige = await conLaBase(D, async (sb) => {
    const casos = [
      ['casillas', '["b","a"]', '["a","b"]'],       // el orden no cuenta
      ['corta', '"  caracas "', '["Caracas"]'],     // ni las tildes ni el espacio
      ['cuadricula', '{"f1":"c2"}', '{"f1":"c2"}'],
      ['ensayo', '"lo que sea"', '"clave"'],        // esta la lee una persona
    ];
    const salida = [];
    for (const [tipo, dada, clave] of casos) {
      const { data } = await sb.rpc('cem_es_correcta',
        { p_tipo: tipo, p_dada: JSON.parse(dada), p_clave: JSON.parse(clave) });
      salida.push(data);
    }
    return salida;
  });
  a.comprobar(corrige[0] === true && corrige[1] === true && corrige[2] === true,
    'El corrector entiende casillas desordenadas, respuestas escritas con tilde y cuadrículas');
  a.comprobar(corrige[3] === null,
    'Y sabe cuándo NO puede corregir solo: un ensayo lo lee una persona, no la máquina');

  /* ============ las métricas ============ */
  await D.goto(`${BASE}/plataforma/admin/evaluacion-nueva.html?id=${publicada.id}`,
    { waitUntil: 'domcontentloaded' });
  await D.waitForSelector('#tabs button', { timeout: 25000 });
  await D.waitForTimeout(3000);
  await D.locator('[data-t="respuestas"]').click();
  await D.waitForTimeout(3000);
  const respuestas = await D.locator('#panelRespuestas').textContent();
  a.comprobar(/presentado|Entregas|respuestas/i.test(respuestas),
    'La pestaña de respuestas abre aunque todavía no haya ninguna, y lo dice');

  /* ============ limpiar ============ */
  await conLaBase(D, async (sb, marca) => {
    const { data } = await sb.from('cem_assessments').select('id').ilike('nombre', `${marca}%`);
    for (const x of data || []) {
      await sb.from('cem_assessment_questions').delete().eq('assessment_id', x.id);
      await sb.from('cem_assessments').delete().eq('id', x.id);
    }
    await sb.from('cem_questions').delete().ilike('enunciado', `${marca}%`);
  }, MARCA);

  a.comprobar(D.errores.length === 0,
    `El constructor no lanza errores ${JSON.stringify(D.errores.slice(0, 2))}`);
  return a;
}
