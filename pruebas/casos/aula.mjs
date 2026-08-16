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
  return a;
}
