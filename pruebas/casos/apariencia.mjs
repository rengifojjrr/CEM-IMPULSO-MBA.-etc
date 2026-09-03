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
    const t = await import('/plataforma/assets/temas.js?v=2026-09-03-8');
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
        const t = await import('/plataforma/assets/temas.js?v=2026-09-03-8');
        t.aplicarApariencia(t.aparienciaDeFabrica());
      });
      await U.waitForTimeout(400);
    }
    a.comprobar(U.errores.length === 0,
      `Sin errores en el área de ${cuenta} ${JSON.stringify(U.errores.slice(0, 2))}`);
    await U.close();
  }

  /* ============ el estilo llega a TODOS los cuadros ============
     Los ocho estilos son ocho juegos de cuatro variables en `:root`, y lo que
     decide si algo cambia de aspecto no es en qué pantalla esté, sino si las
     consume. Durante mucho tiempo sólo las consumían `.card` y `.kpi`, así que
     una pantalla que se dibujara su propio recuadro quedaba fuera sin que nada
     lo dijera: en Formas de pago, que no usa `.card` ni una vez, cambiar de
     estilo no hacía absolutamente nada.

     Esto lo mide donde duele: se recorren los ocho estilos y se cuentan los
     cuadros VISIBLES que devuelven siempre el mismo aspecto. */
  for (const [cuenta, ruta] of [
    ['admin', 'admin/formas-de-pago.html'],
    ['admin', 'admin/carteras.html'],
    ['admin', 'admin/cierre-mes.html'],
    ['estudiante', 'estudiante/pagos.html'],
    ['estudiante', 'estudiante/certificados.html'],
  ]) {
    const C = await nuevaPestana(navegador, { ancho: 1440, alto: 1000 });
    await entrar(C, cuenta, ruta);
    await C.waitForSelector('#page:not(.hidden)', { timeout: 40000 }).catch(() => {});
    await C.waitForTimeout(2500);

    const r = await C.evaluate(async () => {
      const m = await import('/plataforma/assets/temas.js?v=2026-09-03-8');
      const cajas = [...document.querySelectorAll('.card, .caja, .kpi')]
        .filter((e) => e.offsetParent !== null).slice(0, 40);
      if (!cajas.length) return { n: 0, sordas: 0 };
      const antes = m.estiloActual();
      const vistas = cajas.map(() => new Set());
      for (const e of Object.keys(m.ESTILOS)) {
        m.aplicarApariencia({ estilo: e });
        await new Promise((r2) => requestAnimationFrame(() => requestAnimationFrame(r2)));
        cajas.forEach((el, i) => {
          const c = getComputedStyle(el);
          vistas[i].add([c.background, c.backdropFilter, c.boxShadow, c.borderRadius].join('|'));
        });
      }
      m.aplicarApariencia({ estilo: antes });   // dejarla como estaba
      return { n: cajas.length, sordas: vistas.filter((v) => v.size === 1).length };
    });

    a.comprobar(r.n > 0 && r.sordas === 0,
      `Los ${r.n} cuadros de ${ruta} cambian con el estilo (${r.sordas} sordos)`);
    await C.close();
  }

  /* ============ el fondo con movimiento ============
     Un interruptor para que las manchas de color se muevan muy despacio. Tres
     cosas tienen que cumplirse, y la tercera no es opcional. */
  const M = await nuevaPestana(navegador, { ancho: 1300, alto: 850 });
  await entrar(M, 'estudiante', 'estudiante/panel.html');
  await M.waitForSelector('#page:not(.hidden)', { timeout: 40000 });

  const ambiente = () => M.evaluate(() => {
    const cs = getComputedStyle(document.body, '::after');
    return { anim: cs.animationName, transform: cs.transform };
  });

  /* PRIMERO, COMO LA ABRE UNA PERSONA: sin tocar ningún ajuste.
     ----------------------------------------------------------------------
     Esto es lo que faltaba y por lo que la animación no se veía en la vida
     real mientras la prueba pasaba en verde. La prueba forzaba el estilo
     «escarcha» antes de mirar; nadie hace eso. De fábrica el estilo es
     «plano», y toda la capa de ambiente colgaba de `:not([data-estilo=
     "plano"])`: sin fondo de colores, no había nada que mover. El interruptor
     estaba encendido y era imposible que pasara nada.

     Ahora la capa existe siempre que la animación esté encendida —más tenue
     en plano, que tiene que seguir siendo plano— y esto lo comprueba tal cual
     se abre la pantalla. */
  const deFabrica = await ambiente();
  a.comprobar(deFabrica.anim === 'cem-ambiente',
    `Recién abierta, sin tocar nada, el fondo ya se mueve (estilo de fábrica, ${deFabrica.anim})`);

  await M.evaluate(async () => {
    const t = await import('/plataforma/assets/temas.js?v=2026-09-03-8');
    t.aplicarApariencia({ estilo: 'escarcha', animacion: true });
  });
  await M.waitForTimeout(600);
  const t0 = await ambiente();
  a.comprobar(t0.anim === 'cem-ambiente', `Y con vidrio también (${t0.anim})`);

  /* Y en los ocho estilos, no en el que le venga bien a la prueba. */
  const porEstilo = await M.evaluate(async () => {
    const t = await import('/plataforma/assets/temas.js?v=2026-09-03-8');
    const antes = t.estiloActual();
    const mudos = [];
    for (const e of Object.keys(t.ESTILOS)) {
      t.aplicarApariencia({ estilo: e, animacion: true });
      await new Promise((r) => requestAnimationFrame(r));
      const cs = getComputedStyle(document.body, '::after');
      if (cs.animationName !== 'cem-ambiente' || cs.content === 'none') mudos.push(e);
    }
    t.aplicarApariencia({ estilo: antes });
    return mudos;
  });
  a.comprobar(porEstilo.length === 0,
    `El fondo se mueve con los ocho estilos${porEstilo.length ? ', menos ' + porEstilo.join(', ') : ''}`);

  /* Y aquí está la comprobación que faltaba la primera vez.
     ----------------------------------------------------------------------
     La primera versión de esto comparaba la matriz antes y después: cambiaba,
     así que pasaba en verde. Pero la animación era de 1,6 grados en noventa
     segundos, o sea que las manchas se desplazaban entre 0,5 y 1,3 píxeles por
     segundo — muy por debajo de lo que un ojo percibe en algo grande, difuso y
     de poco contraste. La animación funcionaba y era invisible.

     Así que ahora se mide lo que se ve: cuántos PÍXELES recorre de verdad una
     mancha del fondo. Se toma una esquina de la capa, que es el punto que más
     se mueve, y se calcula su recorrido con la matriz real del navegador. */
  const recorrido = await M.evaluate(async () => {
    const puntoDe = (m, x, y) => {
      const n = (m.match(/matrix\(([^)]+)\)/)?.[1] || '').split(',').map(Number);
      if (n.length < 6) return null;
      const [a1, b1, c1, d1, e1, f1] = n;
      return { x: a1 * x + c1 * y + e1, y: b1 * x + d1 * y + f1 };
    };
    // Una esquina de la ventana, medida desde su centro.
    const px = window.innerWidth / 2, py = window.innerHeight / 2;
    const leer = () => getComputedStyle(document.body, '::after').transform;
    /* Se sigue el camino durante diez segundos en vez de comparar dos
       instantes. Con una curva `ease-in-out` hay tramos del ciclo en los que
       casi se detiene, y dos muestras que cayeran ahí darían casi cero: la
       prueba fallaría sin que nada estuviera roto. Sumando el recorrido, dónde
       empiece deja de importar. */
    let total = 0, pico = 0, previo = puntoDe(leer(), px, py);
    if (!previo) return null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const ahora = puntoDe(leer(), px, py);
      const d = Math.hypot(ahora.x - previo.x, ahora.y - previo.y);
      total += d;
      pico = Math.max(pico, d / 0.5);
      previo = ahora;
    }
    return { px: total, segundos: 10, pico };
  });
  const velocidad = recorrido ? recorrido.px / recorrido.segundos : 0;
  /* Dos píxeles por segundo es el suelo de lo perceptible; por debajo, la
     animación existe sólo en las herramientas del navegador. */
  a.comprobar(velocidad >= 2,
    `Y se mueve lo bastante como para verse: ${velocidad.toFixed(1)} px/s de media, `
    + `${(recorrido?.pico ?? 0).toFixed(1)} de pico (hace falta 2 o más)`);

  /* ── y ahora la única medida que de verdad decide ──────────────────────
     Todo lo de arriba mide la CAPA: cuántos píxeles recorre su transformación.
     Se puede cumplir entero y no verse nada, y eso fue exactamente lo que
     pasó durante cuatro intentos: la capa recorría sus píxeles y la pantalla
     no cambiaba, porque lo que se movía eran manchas de 60vmax difuminadas
     hasta el 66% —sin borde que seguir— y encima detrás de tarjetas opacas.

     Así que esto no mira ninguna propiedad: fotografía la pantalla dos veces
     y resta los píxeles. Es la diferencia entre «la propiedad cambió» y «se
     ve», y es la comprobación que había que haber escrito la primera vez.

     Se mide donde el fondo asoma de verdad —debajo de la última tarjeta—,
     porque con el estilo «Plano» la barra y las tarjetas tapan el resto. */
  const visible = await M.evaluate(async () => {
    const t = await import('/plataforma/assets/temas.js?v=2026-09-03-8');
    t.aplicarApariencia({ animacion: true, fuerza: t.AMBIENTE.fuerza.max, ritmo: t.AMBIENTE.ritmo.max });
    /* La zona de fondo NO se supone: se busca. Preguntar por el rectángulo de
       la última tarjeta daba una franja que caía dentro de otra tarjeta cuando
       la página era larga, y entonces se medía el cambio de algo opaco —o sea,
       cero— y la prueba culpaba a la animación.

       Se recorre una rejilla preguntando qué hay en cada punto. Fondo es lo
       que no está dentro de ninguna tarjeta, barra ni cabecera. */
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((r) => setTimeout(r, 600));
    const esFondo = (x, y) => {
      const e = document.elementFromPoint(x, y);
      return e && !e.closest('.card, .kpi, .sidebar, .topbar, table, .caja');
    };
    const puntos = [];
    for (let y = 10; y < innerHeight - 10; y += 10)
      for (let x = 10; x < innerWidth - 10; x += 10)
        if (esFondo(x, y)) puntos.push([x, y]);
    if (puntos.length < 40) return null;
    const xs = puntos.map((p) => p[0]), ys = puntos.map((p) => p[1]);
    return { x: Math.min(...xs), y: Math.min(...ys),
             width: Math.max(20, Math.max(...xs) - Math.min(...xs)),
             height: Math.max(20, Math.max(...ys) - Math.min(...ys)),
             cuantos: puntos.length };
  });

  let cambio = null;
  if (visible && visible.y > 0) {
    const foto = async () => (await M.screenshot({ clip: visible })).toString('base64');
    const a1 = await foto();
    await M.waitForTimeout(4000);
    const a2 = await foto();
    /* Comparar los PNG en crudo bastaría para saber si algo cambió, pero no
       cuánto. Se descomprimen en el navegador, que ya tiene un decodificador
       de imágenes, y se restan canal a canal. */
    cambio = await M.evaluate(async ([u1, u2]) => {
      const carga = (b64) => new Promise((r) => {
        const i = new Image(); i.onload = () => r(i); i.src = 'data:image/png;base64,' + b64;
      });
      const [i1, i2] = await Promise.all([carga(u1), carga(u2)]);
      const lienzo = (im) => {
        const c = document.createElement('canvas');
        c.width = im.width; c.height = im.height;
        c.getContext('2d').drawImage(im, 0, 0);
        return c.getContext('2d').getImageData(0, 0, im.width, im.height).data;
      };
      const [d1, d2] = [lienzo(i1), lienzo(i2)];
      let suma = 0, max = 0;
      for (let i = 0; i < d1.length; i += 4) {
        const d = Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]);
        suma += d; if (d > max) max = d;
      }
      return { medio: suma / (d1.length / 4), max };
    }, [a1, a2]);
  }

  /* El listón: que algún píxel cambie al menos 30 sobre 765 —unos diez niveles
     de 255 por canal— en cuatro segundos. Por debajo de eso el ojo no lo llama
     movimiento. Antes de separar la capa que se mueve de la que hace de
     vidrio, esta misma medida daba 16; ahora pasa de 100. */
  a.comprobar(cambio !== null && cambio.max >= 30,
    cambio === null
      ? 'No se pudo medir: no se encontró suficiente fondo a la vista'
      : `Y la pantalla cambia de verdad donde el fondo asoma: máximo ${cambio.max}/765 `
        + `en 4 s, media ${cambio.medio.toFixed(2)} (hace falta 30 de máximo)`);

  /* La cuenta que evita el fallo clásico de esta animación: al girar un
     rectángulo sus esquinas dejan de tapar las de la ventana, y asoma una cuña
     del fondo pelado. Hace falta ampliarlo al menos `cos θ + sen θ`. */
  /* Desde que la vuelta es entera, mirar UN instante ya no vale: el ciclo pasa
     por 45° cuatro veces, que es donde más ampliación hace falta, y una muestra
     suelta puede caer justo en un momento cómodo y dar verde con las esquinas
     descubiertas la mayor parte del tiempo. Así que se acelera el ciclo al
     mínimo y se vigila el ciclo COMPLETO, quedándose con el peor momento. */
  const cubre = await M.evaluate(async () => {
    const t = await import('/plataforma/assets/temas.js?v=2026-09-03-8');
    t.aplicarApariencia({ animacion: true, ritmo: t.AMBIENTE.ritmo.max });
    const ciclo = parseFloat(getComputedStyle(document.body, '::after').animationDuration) || 25;
    let peor = null;
    const hasta = performance.now() + Math.min(ciclo, 26) * 1000;
    while (performance.now() < hasta) {
      const cs = getComputedStyle(document.body, '::after');
      const m = cs.transform.match(/matrix\(([-\d.]+),\s*([-\d.]+)/);
      if (m) {
        const [, a1, b1] = m.map(Number);
        const escala = Math.hypot(a1, b1);
        const giro = Math.abs(Math.atan2(b1, a1));
        const necesaria = Math.cos(giro) + Math.sin(giro);
        const holgura = escala - necesaria;
        if (!peor || holgura < peor.holgura) peor = { escala, necesaria, holgura };
      }
      await new Promise((r) => setTimeout(r, 120));
    }
    t.aplicarApariencia(t.aparienciaDeFabrica());
    return peor;
  });
  a.comprobar(cubre && cubre.holgura >= 0,
    `La capa tapa la ventana durante TODA la vuelta; en su peor momento `
    + `escala ${cubre?.escala.toFixed(4)} contra ${cubre?.necesaria.toFixed(4)} que hacen falta`);

  /* ── los dos mandos ──────────────────────────────────────────────────
     Elegir la intensidad y la velocidad es de cada quien, así que hay dos
     deslizadores. Se comprueba que muevan de verdad lo que dicen mover, en el
     estilo de fábrica y no en uno elegido a conveniencia. */
  const mandos = await M.evaluate(async () => {
    const t = await import('/plataforma/assets/temas.js?v=2026-09-03-8');
    const leer = () => {
      const cs = getComputedStyle(document.body, '::after');
      return { opacidad: Number(cs.opacity), ciclo: cs.animationDuration };
    };
    t.aplicarApariencia({ animacion: true, fuerza: t.AMBIENTE.fuerza.min, ritmo: t.AMBIENTE.ritmo.min });
    await new Promise((r) => requestAnimationFrame(r));
    const flojo = leer();
    t.aplicarApariencia({ fuerza: t.AMBIENTE.fuerza.max, ritmo: t.AMBIENTE.ritmo.max });
    await new Promise((r) => requestAnimationFrame(r));
    const fuerte = leer();
    /* «De fábrica» cambia también el ESTILO, y el estilo aporta su propio
       factor a la opacidad —plano va al 55% para seguir siendo plano—. Así que
       mirar la opacidad resultante mezcla dos cosas. Lo que tienen que volver
       a su sitio son los dos valores que controlan los mandos, y esos están en
       las variables. */
    t.aplicarApariencia(t.aparienciaDeFabrica());
    await new Promise((r) => requestAnimationFrame(r));
    const raiz = getComputedStyle(document.documentElement);
    return { flojo, fuerte, serie: {
      fuerza: Number(raiz.getPropertyValue('--ambiente-fuerza')),
      ciclo: raiz.getPropertyValue('--ambiente-ciclo').trim(),
      esperado: { fuerza: t.AMBIENTE.fuerza.porOmision,
                  ciclo: (t.AMBIENTE.ritmo.cicloBase / t.AMBIENTE.ritmo.porOmision).toFixed(1) + 's' },
    } };
  });
  a.comprobar(mandos.fuerte.opacidad > mandos.flojo.opacidad,
    `La intensidad sube el color de verdad (${mandos.flojo.opacidad.toFixed(2)} → ${mandos.fuerte.opacidad.toFixed(2)})`);
  a.comprobar(parseFloat(mandos.fuerte.ciclo) < parseFloat(mandos.flojo.ciclo),
    `Y la velocidad acorta el ciclo (${mandos.flojo.ciclo} → ${mandos.fuerte.ciclo})`);

  /* Ni en el extremo flojo la capa desaparece —eso ya es apagarla, y para eso
     está el botón— ni en el fuerte se sale de lo que `opacity` admite. */
  a.comprobar(mandos.flojo.opacidad > 0.05 && mandos.fuerte.opacidad <= 1,
    `Los extremos siguen siendo usables (${mandos.flojo.opacidad.toFixed(2)} y ${mandos.fuerte.opacidad.toFixed(2)})`);

  /* Y que «volver a como viene de fábrica» los devuelva también a ellos. */
  a.comprobar(mandos.serie.fuerza === mandos.serie.esperado.fuerza
    && mandos.serie.ciclo === mandos.serie.esperado.ciclo,
    `De fábrica los dos mandos vuelven a su sitio (${mandos.serie.fuerza} · ${mandos.serie.ciclo})`);

  await M.evaluate(async () => {
    const t = await import('/plataforma/assets/temas.js?v=2026-09-03-8');
    t.aplicarApariencia({ animacion: false });
  });
  await M.waitForTimeout(500);
  a.comprobar((await ambiente()).anim === 'none', 'Y el botón la apaga');
  await M.close();

  /* Menos movimiento pedido en el sistema: manda como valor de partida, no
     como veto. Quien tiene trastorno vestibular no se encuentra el fondo
     moviéndose sin haberlo pedido; y quien sí lo pide, lo obtiene.

     Esta prueba antes afirmaba lo contrario y pasaba, mientras el interruptor
     estaba muerto para toda esa gente. Lo que la hacía inútil no era el
     `reducedMotion`, era mirar sólo si se movía: nunca comprobó que el motivo
     fuera la preferencia del sistema y no un fallo. Ahora mira las dos ramas. */
  const Q = await navegador.newContext({ reducedMotion: 'reduce', viewport: { width: 1200, height: 800 } });
  const QP = await Q.newPage();
  await QP.goto(`${BASE}/plataforma/index.html`, { waitUntil: 'domcontentloaded' });
  const ambienteQ = () => QP.evaluate(() => {
    const e = getComputedStyle(document.body, '::after');
    return { nombre: e.animationName, ciclo: e.animationDuration, vueltas: e.animationIterationCount };
  });

  // Sin nada elegido: el sistema decide y el fondo llega quieto.
  await QP.evaluate(async () => {
    const t = await import('/plataforma/assets/temas.js?v=2026-09-03-8');
    localStorage.removeItem('cemAnimacion');
    t.aplicarApariencia({ estilo: 'escarcha' });
  });
  await QP.waitForTimeout(400);
  a.comprobar((await ambienteQ()).nombre === 'none',
    'Con «menos movimiento» en el sistema, de fábrica el fondo viene quieto');
  a.comprobar(await QP.evaluate(() => document.documentElement.dataset.animacion) === 'no',
    'Y el interruptor aparece apagado, no encendido y sin efecto');

  // Encendido a mano: la elección de la persona gana al valor de partida.
  await QP.evaluate(async () => {
    const t = await import('/plataforma/assets/temas.js?v=2026-09-03-8');
    t.aplicarApariencia({ estilo: 'escarcha', animacion: true, ritmo: 2 });
  });
  await QP.waitForTimeout(400);
  const conElección = await ambienteQ();
  a.comprobar(conElección.nombre === 'cem-ambiente',
    'Pero si esa persona lo enciende aquí, se mueve: su elección manda');
  a.comprobar(conElección.vueltas === 'infinite',
    'Y no da una sola vuelta: el reinicio global no se lo come');
  a.comprobar(parseFloat(conElección.ciclo) > 1 && parseFloat(conElección.ciclo) < 62,
    `Y el mando de la velocidad sigue mandando (${conElección.ciclo}, no 0.01ms ni 62s)`);
  await Q.close();

  // Dejar esta pestaña como estaba, por lo mismo.
  await D.evaluate(async () => {
    const t = await import('/plataforma/assets/temas.js?v=2026-09-03-8');
    t.aplicarApariencia(t.aparienciaDeFabrica());
  });
  a.comprobar(D.errores.length === 0, `Sin errores ${JSON.stringify(D.errores.slice(0, 2))}`);
  return a;
}
