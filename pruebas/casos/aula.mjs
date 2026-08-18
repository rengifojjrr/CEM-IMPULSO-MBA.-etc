/* El aula: el tablón, la gente, la cuadrícula de notas y los puntajes.

   Lo que hace que un aula se sienta un aula no es tener el contenido —eso ya
   estaba— sino que haya un sitio donde el profesor diga «mañana no hay clase»
   y alguien pueda preguntar. Estas comprobaciones siguen ese camino entero:
   el profesor publica, el estudiante lo ve, y el estudiante responde.

   La parte delicada es la de las opiniones: el estudiante tiene que poder
   decir lo que piensa sabiendo que su profesor NO va a saber que fue él. Si
   eso se rompe, no se rompe con un error: simplemente la gente deja de
   escribir cosas útiles y nadie se entera. Por eso hay una comprobación
   dedicada a que el nombre no salga por ninguna parte. */

import { acta, nuevaPestana, entrar, BASE } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('aula');
  const MARCA = 'PRUEBA-' + Date.now();

  /* ============ el profesor abre su clase ============ */
  const D = await nuevaPestana(navegador, { ancho: 1400, alto: 1100 });
  await entrar(D, 'profesor', 'docente/aula.html');
  await D.waitForSelector('#tabs button', { timeout: 25000 });
  await D.waitForTimeout(3000);

  const pestanas = await D.evaluate(() =>
    [...document.querySelectorAll('#tabs button')].map((b) => b.textContent.trim()));
  a.comprobar(pestanas.length >= 5,
    `El aula tiene sus pestañas: ${pestanas.join(' · ')}`);

  const codigo = await D.locator('#codigoClase').textContent();
  a.comprobar(codigo.trim().length > 1 && codigo.trim() !== '—',
    `Y el código de clase a la vista, que es lo que se le pasa a alguien para inscribirse (${codigo.trim()})`);

  /* ============ publica un aviso ============ */
  a.comprobar(await D.locator('#muroAbrir').count() > 0,
    'Quien dicta puede escribir en el tablón');

  await D.click('#muroAbrir');
  await D.waitForSelector('#pCuerpo', { timeout: 10000 });
  await D.click('#pGo');
  await D.waitForTimeout(800);
  a.comprobar(await D.locator('#pMsg .nota').count() > 0,
    'Publicar en blanco no se deja: un aviso vacío no le dice nada a nadie');

  await D.fill('#pCuerpo', `${MARCA} — la clase del jueves se pasa al viernes.`);
  await D.click('#pGo');
  await D.waitForTimeout(3000);
  a.comprobar((await D.locator('#panelTablon').textContent()).includes(MARCA),
    'El aviso aparece en el tablón al momento');

  /* ============ el estudiante lo ve y responde ============ */
  const E = await nuevaPestana(navegador, { ancho: 1300, alto: 1000 });
  await entrar(E, 'estudiante', 'estudiante/panel.html');
  await E.waitForTimeout(2500);
  const enlace = await E.evaluate(() =>
    document.querySelector('a[href*="clase.html"]')?.getAttribute('href'));

  if (enlace) {
    await E.goto(`${BASE}/plataforma/estudiante/${enlace.replace(/^\.\//, '')}`,
      { waitUntil: 'domcontentloaded' });
    await E.waitForSelector('#tabs button', { timeout: 25000 });
    await E.waitForTimeout(3000);
    const visto = await E.locator('#panelTabs').textContent();
    a.comprobar(visto.includes(MARCA),
      'Y el estudiante de esa clase lo ve en su tablón');

    // No puede publicar: el tablón es del profesor, los comentarios de todos.
    a.comprobar(await E.locator('#muroAbrir').count() === 0,
      'Pero no puede publicar avisos él: el tablón lo escribe quien dicta');

    const f = E.locator('.comentar').first();
    await f.locator('input').fill(`${MARCA} ¿a la misma hora?`);
    await f.locator('button[type=submit]').click();
    await E.waitForTimeout(3000);
    a.comprobar((await E.locator('#panelTabs').textContent()).includes('a la misma hora'),
      'Sí puede comentar, que es de lo que se trata');
  }

  /* ============ la cuadrícula de notas ============ */
  await D.click('[data-t="notas"]');
  await D.waitForTimeout(3000);
  const celdas = await D.locator('#cuadricula .celda-nota input').count();
  a.comprobar(celdas > 0 || (await D.locator('#cuadricula .empty').count()) > 0,
    `La cuadrícula pinta una casilla por estudiante y evaluación (${celdas})`);

  if (celdas > 0) {
    const primera = D.locator('#cuadricula .celda-nota input').first();
    const antes = await primera.inputValue();
    await primera.fill('7');
    await primera.blur();
    await D.waitForTimeout(2500);
    // Se recarga la pestaña para comprobar que se guardó de verdad y no sólo
    // en la pantalla: una nota que se ve pero no se guardó es lo peor que
    // puede pasar aquí.
    await D.click('[data-t="gente"]'); await D.waitForTimeout(500);
    await D.click('[data-t="notas"]'); await D.waitForTimeout(3000);
    const guardada = await D.locator('#cuadricula .celda-nota input').first().inputValue();
    a.comprobar(guardada === '7',
      `La nota se guarda al salir de la casilla, sin botón (quedó «${guardada}»)`);

    /* Y que sea UNA casilla por estudiante y evaluación. Con dos intentos de la
       misma evaluación la cuadrícula enseñaba una nota cualquiera de las dos
       —jsonb_object_agg se quedaba con la última fila que le llegara— mientras
       el guardado escribía siempre en el último intento. O sea: escribías 7,
       decía «guardado», y al volver seguía poniendo 100. La nota estaba bien
       guardada; lo que engañaba era la pantalla. */
    const rejilla = await D.evaluate(() => {
      const inputs = [...document.querySelectorAll('#cuadricula .celda-nota input')];
      const pares = inputs.map((i) => `${i.dataset.ins}·${i.dataset.ev}`);
      return { total: pares.length, distintos: new Set(pares).size };
    });
    a.comprobar(rejilla.total === rejilla.distintos,
      `Cada estudiante tiene una sola casilla por evaluación, no una por intento (${
        rejilla.total} casillas, ${rejilla.distintos} pares distintos)`);

    // Dejarlo como estaba: la prueba no debe cambiarle las notas a nadie.
    await D.locator('#cuadricula .celda-nota input').first().fill(antes);
    await D.locator('#cuadricula .celda-nota input').first().blur();
    await D.waitForTimeout(2000);
  }

  /* ============ los dos puntajes ============ */
  await D.click('[data-t="puntajes"]');
  await D.waitForTimeout(3000);
  const puntajes = await D.locator('#panelPuntajes').textContent();
  a.comprobar(/En riesgo/i.test(puntajes) && /Avance medio/i.test(puntajes),
    'La retención sale de los datos: quién sigue, quién se está yendo y cuánto lleva visto');
  a.comprobar(/opina la clase/i.test(puntajes),
    'Y al lado, lo que opina la clase — que es otra pregunta, no la misma');

  /* Lo que NUNCA puede salir de aquí es quién opinó. Se comprueba contra los
     nombres reales del grupo, que están en la pestaña de Personas. */
  await D.click('[data-t="gente"]');
  await D.waitForTimeout(1500);
  const nombres = await D.evaluate(() =>
    [...document.querySelectorAll('#tbGente tr td:first-child')]
      .map((t) => t.textContent.trim()).filter((n) => n.length > 3));
  await D.click('[data-t="puntajes"]');
  await D.waitForTimeout(2500);
  const comentarios = await D.locator('#comentarios').textContent();
  const filtrado = nombres.filter((n) => comentarios.includes(n));
  a.comprobar(filtrado.length === 0,
    `Los comentarios llegan sin nombre: si se supiera quién dijo qué, nadie diría nada útil (${filtrado.join(', ') || 'ninguno se escapó'})`);

  a.comprobar(D.errores.length === 0, `El aula del profesor no lanza errores ${JSON.stringify(D.errores.slice(0, 2))}`);
  a.comprobar(E.errores.length === 0, `Ni la del estudiante ${JSON.stringify(E.errores.slice(0, 2))}`);
  await D.close();

  /* ============ el panel del estudiante empieza por sus cursos ============ */
  /* Antes esta pantalla abría con cuatro cifras y dos gráficos, y los cursos
     quedaban a media pantalla de distancia. Pero un estudiante entra aquí a
     hacer una cosa: seguir por donde iba. El resumen no se quita —se pliega—,
     así que hay que comprobar las dos mitades: que los cursos van primero y
     que lo plegado sigue funcionando cuando se abre. */
  const P = await nuevaPestana(navegador, { ancho: 1400, alto: 1000 });
  await entrar(P, 'estudiante', 'estudiante/panel.html');
  await P.waitForSelector('#cursos .card', { timeout: 40000 });
  await P.waitForTimeout(2500);

  const arriba = await P.evaluate(() => {
    const cursos = document.querySelector('#cursos');
    const resumen = document.querySelector('#resumen');
    return {
      yCursos: cursos?.getBoundingClientRect().top ?? -1,
      yResumen: resumen?.getBoundingClientRect().top ?? -1,
      resumenAbierto: !!resumen?.open,
      // Las cifras y los gráficos tienen que seguir existiendo, sólo plegados.
      kpisDentro: !!resumen?.querySelector('#kpis'),
      graficosDentro: !!resumen?.querySelector('#graficos'),
      elevables: !!cursos?.classList.contains('tarjetas-elevables'),
    };
  });
  a.comprobar(arriba.yCursos > 0 && arriba.yCursos < arriba.yResumen,
    `Lo primero que se ve son los cursos, no las estadísticas (cursos en ${
      Math.round(arriba.yCursos)}px, resumen en ${Math.round(arriba.yResumen)}px)`);
  a.comprobar(arriba.resumenAbierto === false,
    'Y el resumen arranca plegado: se abre cuando alguien quiera mirarlo');
  a.comprobar(arriba.kpisDentro && arriba.graficosDentro,
    'Las cifras y los gráficos no se quitaron, sólo se plegaron');

  /* El botón de abrir el curso es la acción principal de la pantalla y era del
     mismo tamaño que «Ver programa», que no lo es. */
  const alto = await P.evaluate(() => {
    const abrir = document.querySelector('#cursos .btn.abrir-curso');
    const otro = document.querySelector('#cursos .btn.outline');
    return {
      abrir: abrir ? Math.round(abrir.getBoundingClientRect().height) : 0,
      otro: otro ? Math.round(otro.getBoundingClientRect().height) : 0,
    };
  });
  a.comprobar(alto.abrir >= 44,
    `El botón de entrar al curso es grande de verdad (${alto.abrir}px de alto)`);
  a.comprobar(alto.abrir > alto.otro,
    `Y más grande que el secundario, que es lo que lo hace la acción principal (${alto.abrir} vs ${alto.otro})`);

  /* La animación al pasar por encima. Se comprueba el `transform` calculado y
     no una clase: una clase puede estar puesta y no mover nada. */
  const quieto = await P.evaluate(() =>
    getComputedStyle(document.querySelector('#cursos > .card')).transform);
  await P.hover('#cursos > .card');
  await P.waitForTimeout(600);
  const movido = await P.evaluate(() =>
    getComputedStyle(document.querySelector('#cursos > .card')).transform);
  a.comprobar(quieto === 'none' && movido !== 'none' && movido.includes('matrix3d'),
    `La tarjeta se levanta al pasar el ratón, en tres dimensiones (${movido.slice(0, 30)}…)`);

  /* Y al abrir el resumen, lo de dentro se pinta: los gráficos viven en un
     <details> cerrado, y algo que mide su propio ancho al arrancar se habría
     quedado en cero sin que nadie lo notara. */
  await P.click('#resumen summary');
  await P.waitForTimeout(1500);
  const dentro = await P.evaluate(() => ({
    abierto: !!document.querySelector('#resumen')?.open,
    kpis: document.querySelectorAll('#kpis .kpi').length,
    svgs: document.querySelectorAll('#graficos svg').length,
    filas: document.querySelectorAll('#tbDesempeno tr').length,
  }));
  a.comprobar(dentro.abierto && dentro.kpis === 4,
    `Al abrirlo salen las cuatro cifras (${dentro.kpis})`);
  a.comprobar(dentro.svgs > 0,
    `Y los gráficos se dibujan aunque nacieran dentro de algo cerrado (${dentro.svgs})`);
  a.comprobar(dentro.filas > 0,
    `Y la tabla de «cómo voy» trae filas (${dentro.filas})`);

  a.comprobar(P.errores.length === 0,
    `El panel del estudiante no lanza errores ${JSON.stringify(P.errores.slice(0, 2))}`);
  await P.close();
  return a;
}
