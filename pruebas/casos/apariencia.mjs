/* La apariencia: que sea de cada quien, y que no se pisen las cosas.
   ==========================================================================
   Tres fallos distintos que se veían igual de mal, y que esta prueba impide
   que vuelvan:

   1 · Lo que se queda pegado arriba mientras el resto se desplaza tiene que
       TAPAR. Si es translúcido, el contenido pasa por debajo y se lee a
       través: dos textos en el mismo sitio. No se arregla con márgenes —al
       desplazar vuelven a encontrarse—, se arregla con opacidad.

   2 · Un color escrito a mano ignora el tema. La pantalla pública de
       verificar certificados tenía un degradado claro fijo debajo de una
       tarjeta que sí seguía el tema: en modo noche salía fondo claro con
       tarjeta oscura.

   3 · La apariencia se guarda en el navegador de cada quien, así que no es
       una decisión institucional. Estaba dentro de Configuración académica,
       que sólo ve el administrador: quien cobra, quien da clase y quien
       estudia no podían tocarla. */

import { acta, nuevaPestana, entrar, BASE } from '../entorno.mjs';

/** ¿Es un color con el que de verdad se puede tapar lo de detrás? */
const opaco = (color) => {
  const m = String(color).match(/[\d.]+/g) || [];
  // rgb(a, b, c) sin cuarto número es opaco; con él, manda el cuarto.
  return m.length < 4 || Number(m[3]) >= 0.98;
};

export default async function correr(navegador) {
  const a = acta('apariencia');

  /* ============ 1 · lo pegajoso tapa ============ */
  const D = await nuevaPestana(navegador, { ancho: 1300, alto: 800 });
  await entrar(D, 'estudiante', 'estudiante/panel.html');
  await D.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  // Con vidrio, que es donde el fallo aparecía: en plano todo es opaco de serie.
  await D.evaluate(async () => {
    const t = await import('/plataforma/assets/temas.js?v=2026-08-21-16');
    t.aplicarApariencia({ estilo: 'escarcha', tema: 'oscuro' });
  });
  await D.waitForTimeout(700);

  await D.goto(`${BASE}/plataforma/admin/cursos.html`, { waitUntil: 'domcontentloaded' })
    .catch(() => {});
  await D.goto(`${BASE}/plataforma/estudiante/panel.html`, { waitUntil: 'domcontentloaded' });
  await D.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await D.waitForTimeout(2500);

  const pegajosos = await D.evaluate(() => {
    const salida = [];
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'sticky') continue;
      salida.push({
        quien: (el.className || el.tagName).toString().slice(0, 30),
        fondo: cs.backgroundColor,
        // El desenfoque también tapa: convierte lo de detrás en textura.
        difumina: cs.backdropFilter !== 'none' && cs.backdropFilter !== '',
      });
    }
    return salida;
  });
  const transparentes = pegajosos.filter((x) => !x.difumina && !opaco(x.fondo));
  a.comprobar(transparentes.length === 0,
    `Todo lo que se queda pegado tapa lo que pasa por debajo (${pegajosos.length} revisados${
      transparentes.length ? ': ' + transparentes.map((x) => x.quien).join(', ') : ''})`);

  /* Y la comprobación de verdad: desplazar y mirar si se solapan. */
  await D.goto(`${BASE}/plataforma/estudiante/panel.html`, { waitUntil: 'domcontentloaded' });
  await D.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await D.waitForTimeout(2000);
  await D.evaluate(() => window.scrollTo(0, 400));
  await D.waitForTimeout(600);
  const seVeATraves = await D.evaluate(() => {
    for (const el of document.querySelectorAll('*')) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'sticky') continue;
      if (cs.backdropFilter !== 'none' && cs.backdropFilter !== '') continue;
      const m = cs.backgroundColor.match(/[\d.]+/g) || [];
      if (m.length === 4 && Number(m[3]) < 0.98) return (el.className || el.tagName).toString();
    }
    return null;
  });
  a.comprobar(!seVeATraves,
    `Al desplazar, nada se lee a través de una barra fija (${seVeATraves || 'ninguna es translúcida'})`);

  /* ============ 2 · las pantallas públicas siguen el tema ============ */
  const N = await nuevaPestana(navegador, { ancho: 1100, alto: 760, oscuro: true });
  for (const pagina of ['verificar.html', 'index.html', 'nueva-clave.html']) {
    await N.goto(`${BASE}/plataforma/${pagina}`, { waitUntil: 'domcontentloaded' });
    await N.waitForTimeout(1500);
    const c = await N.evaluate(() => {
      const luz = (color) => {
        const [r, g, b] = (String(color).match(/[\d.]+/g) || [0, 0, 0]).map(Number);
        // Si vienen en 0..1 —color(srgb …)— se llevan a 0..255.
        const k = (r <= 1 && g <= 1 && b <= 1) ? 255 : 1;
        return (0.2126 * r * k + 0.7152 * g * k + 0.0722 * b * k) / 255;
      };
      const caja = document.querySelector('.auth-card, .card, main, #page') || document.body;
      return { fondo: luz(getComputedStyle(document.body).backgroundColor),
               caja: luz(getComputedStyle(caja).backgroundColor) };
    });
    // Los dos claros o los dos oscuros. Uno de cada es el tema a medias.
    a.comprobar(Math.abs(c.fondo - c.caja) < 0.45,
      `En modo noche, ${pagina} no mezcla fondo claro con tarjeta oscura ` +
      `(fondo ${c.fondo.toFixed(2)} · caja ${c.caja.toFixed(2)})`);
  }
  await N.close();

  /* ============ 3 · la apariencia es de todos ============ */
  for (const [cuenta, destino] of [
    ['estudiante', 'estudiante/panel.html'],
    ['profesor', 'docente/panel.html'],
    ['cobranza', 'admin/pagos-verificar.html'],
    ['auditor', 'admin/auditoria.html'],
  ]) {
    const U = await nuevaPestana(navegador, { ancho: 1300, alto: 900 });
    await entrar(U, cuenta, destino);
    await U.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
    await U.waitForTimeout(1500);
    a.comprobar(await U.locator('#cemApariencia').count() === 1,
      `${cuenta} tiene el botón de apariencia en su menú, no sólo el administrador`);
    if (cuenta === 'estudiante') {
      await U.click('#cemApariencia');
      await U.waitForTimeout(1200);
      a.comprobar(await U.locator('.modal [data-paleta]').count() >= 5,
        'Y al abrirlo salen las paletas de verdad, las mismas que ve el administrador');
      await U.locator('[data-paleta="caribe"]').click();
      await U.waitForTimeout(700);
      a.comprobar(await U.evaluate(() => document.documentElement.dataset.paleta) === 'caribe',
        'Elegir una la aplica al momento, sin guardar ni recargar');
      // Devolverlo a fábrica: la apariencia se guarda, y si se queda puesta la
      // hereda la prueba siguiente y falla por algo que no es suyo.
      await U.evaluate(async () => {
        const t = await import('/plataforma/assets/temas.js?v=2026-08-21-16');
        t.aplicarApariencia(t.aparienciaDeFabrica());
      });
      await U.waitForTimeout(400);
    }
    a.comprobar(U.errores.length === 0,
      `Sin errores en el área de ${cuenta} ${JSON.stringify(U.errores.slice(0, 2))}`);
    await U.close();
  }

  // Dejar esta pestaña como estaba, por lo mismo.
  await D.evaluate(async () => {
    const t = await import('/plataforma/assets/temas.js?v=2026-08-21-16');
    t.aplicarApariencia(t.aparienciaDeFabrica());
  });
  a.comprobar(D.errores.length === 0, `Sin errores ${JSON.stringify(D.errores.slice(0, 2))}`);
  return a;
}
