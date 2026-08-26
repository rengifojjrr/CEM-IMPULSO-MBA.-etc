/* El asistente: la ventana de chat y su sección en el panel.
   ═══════════════════════════════════════════════════════════════════════════
   Lo que se comprueba aquí es justo lo que las comprobaciones estáticas no
   pueden ver: que la pantalla abre sin errores, que el botón del chat aparece
   en TODAS las áreas y no sólo en la que se miró a mano, y que al auditor no
   se le ofrecen botones que le van a rebotar.

   No se le pregunta al modelo, y es a propósito. Eso cuesta dinero, tarda y
   depende de un tercero: el día que el proveedor vaya lento, la suite se
   pondría roja por algo que no es la plataforma. Lo que sí se comprueba es que
   la ventana se abre, saluda y ofrece por dónde empezar. */

import { acta, nuevaPestana, entrar } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('asistente');

  /* ── La sección del panel ──────────────────────────────────────────────── */
  const A = await nuevaPestana(navegador);
  await entrar(A, 'admin', 'admin/asistente.html');
  await A.waitForSelector('#page:not(.hidden)', { timeout: 25000 });
  await A.waitForTimeout(1500);

  a.comprobar(await A.locator('#kpis .kpi').count() >= 4,
    'La pantalla del asistente abre y enseña sus cifras');

  a.comprobar(await A.locator('.ficha-saber, #listaSaber .empty').count() > 0,
    'Enseña lo que sabe, o dice claramente que todavía no sabe nada');

  a.comprobar(await A.locator('#btnRefrescar').isVisible(),
    'El botón de ponerlo al día está a la vista');

  a.comprobar(await A.locator('#retrato img').count() === 1,
    'La mascota se ve en su pantalla');

  // Las conversaciones se piden al abrir la pestaña, no al cargar la pantalla.
  await A.click('#tabs button[data-t="charlas"]');
  await A.waitForTimeout(2000);
  a.comprobar(await A.locator('#tablaCharlas tbody tr').count() > 0,
    'La pestaña de conversaciones pinta su tabla (aunque sea para decir que no hay)');

  await A.click('#tabs button[data-t="salud"]');
  a.comprobar((await A.textContent('#salud')).includes('Tarda normalmente'),
    '«Cómo va» dice cuánto tarda y cuántos fallos hubo');

  a.comprobar(A.errores.length === 0,
    `La pantalla del asistente no lanza errores ${JSON.stringify(A.errores.slice(0, 2))}`);

  /* ── El botón del chat, en las dos áreas ───────────────────────────────── */
  /* Se monta desde `mount()`: basta con que falle en una pantalla para que
     falte en todas las de esa área. Por eso se mira una de cada. */
  for (const [cuenta, destino, quien] of [
    ['admin', 'admin/index.html', 'el equipo'],
    ['estudiante', 'estudiante/panel.html', 'un alumno'],
  ]) {
    const P = await nuevaPestana(navegador);
    await entrar(P, cuenta, destino);
    await P.waitForSelector('#cemChatBoton', { timeout: 25000 });
    a.comprobar(true, `${quien} ve el botón del asistente en su panel`);

    await P.click('#cemChatBoton');
    await P.waitForSelector('#cemChat:not([hidden])', { timeout: 6000 });
    await P.waitForTimeout(600);
    a.comprobar(await P.locator('.chat-linea.suya').count() > 0,
      `A ${quien} se le abre la ventana y le saluda`);

    a.comprobar(await P.locator('.chat-sug').count() === 4,
      `A ${quien} se le ofrecen cuatro preguntas para empezar`);

    /* Escape cierra. Es un reflejo en el escritorio, y que no pase nada se
       siente como que la página se colgó. */
    await P.keyboard.press('Escape');
    await P.waitForTimeout(300);
    a.comprobar(await P.locator('#cemChat').isHidden(),
      `A ${quien} la tecla Escape le cierra el chat`);

    a.comprobar(P.errores.length === 0,
      `La ventana del chat no rompe la pantalla de ${quien} `
      + JSON.stringify(P.errores.slice(0, 2)));
    await P.context().close();
  }

  /* ── El auditor mira y no toca ─────────────────────────────────────────── */
  const U = await nuevaPestana(navegador);
  await entrar(U, 'auditor', 'admin/asistente.html');
  await U.waitForSelector('#page:not(.hidden)', { timeout: 25000 });
  await U.waitForTimeout(1200);
  a.comprobar(await U.locator('#kpis .kpi').count() >= 4,
    'El auditor entra a la pantalla del asistente y la lee entera');
  a.comprobar(await U.locator('#btnRefrescar').count() === 0
           && await U.locator('#btnNuevaFicha').count() === 0,
    'Al auditor no se le ofrece cambiar lo que sabe el asistente');

  await A.context().close();
  await U.context().close();
  return a.resumen();
}
