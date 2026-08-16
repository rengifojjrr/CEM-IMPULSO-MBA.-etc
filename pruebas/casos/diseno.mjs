/* Que el sistema visual no se vuelva a dispersar.

   Un diseño no se estropea de golpe: se estropea de una pantalla en una,
   cuando alguien necesita «un gris un poco más claro» o «esta letra un punto
   más grande» y lo escribe ahí mismo. Al cabo de un año hay veintiocho
   tamaños de letra, once radios de esquina y cuatro grises que se parecen —y
   la plataforma se ve hecha a pedazos aunque cada pieza suelta esté bien.

   Estas comprobaciones cuentan lo que hay pintado en la pantalla de verdad,
   no lo que dice la hoja de estilos: si alguien mete un `style=` con un
   tamaño nuevo, el número sube y esta prueba se pone roja.

   Los topes no son sagrados, son un aviso. Si hace falta un valor más, lo
   correcto es añadirlo a los tokens de `styles.css` y subir el tope aquí
   a propósito, no que se cuele sin que nadie lo mire. */

import { acta, nuevaPestana, entrar, BASE } from '../entorno.mjs';

/** Cuenta los valores distintos de una propiedad entre lo que se ve. */
const inventario = () => ({
  /* Sólo lo visible: lo que está oculto no ensucia la vista. */
  medir(prop, filtro = () => true) {
    const vistos = new Map();
    for (const el of document.querySelectorAll('#page *')) {
      if (!el.getClientRects().length) continue;
      if (!el.textContent.trim() && !el.children.length
          && !['IMG', 'INPUT', 'SELECT', 'HR'].includes(el.tagName)) continue;
      const v = getComputedStyle(el)[prop];
      if (!filtro(v, el)) continue;
      vistos.set(v, (vistos.get(v) || 0) + 1);
    }
    return [...vistos.entries()].sort((a, b) => b[1] - a[1]);
  },
});

export default async function correr(navegador) {
  const a = acta('diseño');

  const A = await nuevaPestana(navegador, { ancho: 1440 });
  await entrar(A, 'admin', 'admin/inscripciones.html');
  await A.waitForSelector('#tabla tbody tr', { timeout: 25000 });
  await A.waitForTimeout(1500);

  /* ============ cuántas voces habla la pantalla ============ */
  const cuentas = await A.evaluate(() => {
    const inv = {
      medir(prop, filtro = () => true) {
        const vistos = new Map();
        for (const el of document.querySelectorAll('#page *')) {
          if (!el.getClientRects().length) continue;
          if (el.classList.contains('material-symbols-outlined')) continue;
          const v = getComputedStyle(el)[prop];
          if (!filtro(v, el)) continue;
          vistos.set(v, (vistos.get(v) || 0) + 1);
        }
        return [...vistos.entries()].sort((x, y) => y[1] - x[1]);
      },
    };
    return {
      letra: inv.medir('fontSize').map(([v, n]) => `${v}×${n}`),
      radio: inv.medir('borderRadius', (v) => v !== '0px').map(([v, n]) => `${v}×${n}`),
      sombra: inv.medir('boxShadow', (v) => v !== 'none').map(([v, n]) => `${v.slice(0, 40)}×${n}`),
      peso: inv.medir('fontWeight').map(([v, n]) => `${v}×${n}`),
      familia: inv.medir('fontFamily').map(([v]) => v.split(',')[0].replace(/["']/g, '')),
    };
  });

  a.comprobar(cuentas.letra.length <= 8,
    `La pantalla habla con pocos tamaños de letra: ${cuentas.letra.length} (${cuentas.letra.slice(0, 8).join(' ')})`);
  a.comprobar(cuentas.peso.length <= 4,
    `Y con pocos pesos: ${cuentas.peso.length} (${cuentas.peso.join(' ')})`);
  a.comprobar(cuentas.radio.length <= 5,
    `Las esquinas se redondean siempre igual: ${cuentas.radio.length} radio(s) (${cuentas.radio.slice(0, 5).join(' ')})`);
  a.comprobar(cuentas.sombra.length <= 2,
    `Y casi nada levita: ${cuentas.sombra.length} sombra(s)`);
  a.comprobar(cuentas.familia.length <= 3,
    `Con dos tipografías: la del texto y la de las cifras (${cuentas.familia.join(', ')})`);

  /* ============ la tabla, legible ============ */
  const tabla = await A.evaluate(() => {
    const filas = [...document.querySelectorAll('#tabla tbody tr')].filter((tr) => !tr.querySelector('td[colspan]'));
    const th = document.querySelector('#tabla thead th');
    const cebra = filas.length > 2
      && getComputedStyle(filas[0]).backgroundColor !== getComputedStyle(filas[1]).backgroundColor;
    // El encabezado tiene que ser opaco —está fijo y las filas pasan por
    // debajo—, pero del mismo color que la tarjeta: si se ve como una franja
    // de otro color, es una banda que compite con los datos.
    const tarjeta = document.querySelector('#tabla')?.closest('.card');
    return {
      alto: filas.length ? Math.round(filas[0].getBoundingClientRect().height) : 0,
      cebra,
      encabezadoConFondo: !!(th && tarjeta
        && getComputedStyle(th).backgroundColor !== getComputedStyle(tarjeta).backgroundColor),
      // Píldoras de colores dentro de la tabla: deberían ser palabras con punto.
      pildoras: [...document.querySelectorAll('#tabla td .chip')]
        .filter((c) => !/rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(c).backgroundColor)).length,
    };
  });

  a.comprobar(tabla.alto > 0 && tabla.alto <= 56,
    `Una fila de tabla cabe en un renglón (${tabla.alto} px)`);
  a.comprobar(!tabla.cebra, 'Las filas no se pintan de dos colores alternos: basta la línea que las separa');
  a.comprobar(!tabla.encabezadoConFondo, 'Y el encabezado no lleva franja de fondo');
  a.comprobar(tabla.pildoras === 0,
    `Los estados dentro de la tabla son palabras con un punto, no píldoras de colores (${tabla.pildoras})`);

  /* ============ la moneda se dice una vez ============ */
  const dinero = await A.evaluate(() => {
    const th = [...document.querySelectorAll('#tabla thead th.num')];
    const conUnidad = th.filter((t) => t.querySelector('.unidad'));
    const celdas = [...document.querySelectorAll('#tabla tbody td.num')].map((t) => t.textContent.trim());
    return {
      encabezados: th.length,
      conUnidad: conUnidad.length,
      celdasConMoneda: celdas.filter((t) => /[A-Z]{2,3}\$?$|€$/.test(t)).length,
      alineadas: th.length ? getComputedStyle(document.querySelector('#tabla tbody td.num')).textAlign : '',
    };
  });
  a.comprobar(dinero.alineadas === 'right', 'Las cifras se alinean a la derecha, para poder compararlas de un vistazo');
  if (dinero.conUnidad > 0) {
    a.comprobar(dinero.celdasConMoneda === 0,
      'Y la moneda se dice una vez en el encabezado, no en cada una de las filas');
  }

  /* ============ lo primero que se ve son datos ============ */
  const arriba = await A.evaluate(() => {
    const primeraCifra = document.querySelector('.kpi .k-val, #tabla tbody td');
    const h1 = document.querySelector('.page-head h1');
    return {
      hastaLosDatos: primeraCifra ? Math.round(primeraCifra.getBoundingClientRect().top) : 9999,
      // El subtítulo de la pantalla vive detrás del «?», no ocupando dos líneas.
      parrafoDeCabecera: !!document.querySelector('.page-head p'),
      ayudaEnElTitulo: !!h1?.querySelector('.ayuda-btn'),
    };
  });
  a.comprobar(arriba.hastaLosDatos <= 320,
    `El primer dato aparece sin tener que bajar (${arriba.hastaLosDatos} px desde arriba)`);
  a.comprobar(!arriba.parrafoDeCabecera && arriba.ayudaEnElTitulo,
    'La explicación de la pantalla está detrás del «?» del título, no ocupando dos líneas');

  /* ============ el foco se ve al andar con el teclado ============ */
  await A.keyboard.press('Tab');
  const foco = await A.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const s = getComputedStyle(el);
    return { contorno: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 };
  });
  a.comprobar(!foco || foco.contorno, 'Al moverse con el tabulador se ve dónde está el foco');

  /* ============ el mismo sistema, de noche ============ */
  const N = await nuevaPestana(navegador, { ancho: 1440, oscuro: true });
  await entrar(N, 'admin', 'admin/inscripciones.html');
  await N.waitForSelector('#tabla tbody tr', { timeout: 25000 });
  await N.waitForTimeout(1200);

  const noche = await N.evaluate(() => {
    const luminancia = (c) => {
      const [r, g, b] = (c.match(/\d+(\.\d+)?/g) || [255, 255, 255]).map(Number);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    const fondo = getComputedStyle(document.body).backgroundColor;
    const texto = getComputedStyle(document.querySelector('#tabla tbody td') || document.body).color;
    return { fondo: luminancia(fondo), texto: luminancia(texto), fondoBruto: fondo };
  });
  a.comprobar(noche.fondo < 0.3, `De noche el papel es oscuro de verdad (${noche.fondoBruto})`);
  a.comprobar(noche.texto - noche.fondo > 0.45, 'Y el texto sigue teniendo contraste suficiente para leerse');

  /* ============ en el teléfono nada se sale ============ */
  const M = await nuevaPestana(navegador, { ancho: 390 });
  await entrar(M, 'admin', 'admin/inscripciones.html');
  await M.waitForSelector('#tabla tbody tr', { timeout: 25000 });
  await M.waitForTimeout(1200);
  const movil = await M.evaluate(() => ({
    deLado: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    // Una tarjeta dentro de otra tarjeta es un marco de más.
    cajaEnCaja: !!document.querySelector('.card .card'),
    botonesPequenos: [...document.querySelectorAll('#page button, #page .btn')]
      .filter((b) => b.getClientRects().length && b.getBoundingClientRect().height < 30)
      .map((b) => `${b.className}|${b.textContent.trim().slice(0, 20)}|${Math.round(b.getBoundingClientRect().height)}`),
  }));
  a.comprobar(!movil.deLado, 'En el teléfono la pantalla no se arrastra de lado');
  a.comprobar(!movil.cajaEnCaja, 'Ni hay una tarjeta metida dentro de otra');
  a.comprobar(movil.botonesPequenos.length === 0,
    `Y todo lo que se pulsa con el dedo tiene tamaño de dedo (${movil.botonesPequenos.join(' · ') || 'todos'})`);

  /* ============ la apariencia que elige cada quien ============ */
  const P = await nuevaPestana(navegador, { ancho: 1440 });
  await entrar(P, 'admin', 'admin/configuracion.html');
  await P.waitForSelector('.pal', { timeout: 25000 });
  a.comprobar((await P.locator('.pal').count()) >= 5,
    `Configuración ofrece varias paletas para elegir (${await P.locator('.pal').count()})`);

  a.comprobar((await P.locator('#estilos .estilo').count()) === 7,
    `Y siete estilos de recuadro (${await P.locator('#estilos .estilo').count()})`);
  a.comprobar((await P.locator('#formas .forma').count()) === 3,
    'Tres formas de esquina');
  a.comprobar((await P.locator('#densidades [data-densidad]').count()) === 3,
    'Y tres densidades');

  await P.click('[data-paleta="violeta"]');
  await P.click('#estilos [data-estilo="bisel"]');
  await P.click('#formas [data-forma="redonda"]');
  await P.click('#densidades [data-densidad="compacta"]');
  await P.waitForTimeout(700);
  const elegido = await P.evaluate(() => ({
    paleta: document.documentElement.dataset.paleta,
    estilo: document.documentElement.dataset.estilo,
    forma: document.documentElement.dataset.forma,
    densidad: document.documentElement.dataset.densidad,
    primary: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
    radio: getComputedStyle(document.documentElement).getPropertyValue('--r').trim(),
    difumina: getComputedStyle(document.querySelector('.sidebar')).backdropFilter !== 'none',
    // La tarjeta tiene que haber recibido de verdad la receta del bisel.
    tarjetaDifumina: getComputedStyle(document.querySelector('.card')).backdropFilter !== 'none',
  }));
  a.comprobar(elegido.paleta === 'violeta' && elegido.primary === '#7c3aed',
    `Elegir una paleta cambia el color de marca al momento (${elegido.primary})`);
  a.comprobar(elegido.estilo === 'bisel' && elegido.difumina && elegido.tarjetaDifumina,
    'Elegir un estilo de vidrio difumina de verdad el menú y las tarjetas');
  a.comprobar(elegido.forma === 'redonda' && elegido.radio === '18px',
    `Y elegir esquinas redondas cambia el radio de toda la plataforma (${elegido.radio})`);
  a.comprobar(elegido.densidad === 'compacta', 'Y la densidad queda registrada');

  // Un estilo «ligero» no puede llevar desenfoque en las tarjetas: es
  // exactamente lo que promete el rótulo junto a su nombre.
  await P.click('#estilos [data-estilo="canto"]');
  await P.waitForTimeout(500);
  const ligero = await P.evaluate(() =>
    getComputedStyle(document.querySelector('.card')).backdropFilter);
  a.comprobar(ligero === 'none',
    `«Canto tallado» dice que es ligero y no desenfoca las tarjetas (${ligero})`);
  await P.click('#estilos [data-estilo="bisel"]');
  await P.waitForTimeout(400);

  // La elección tiene que seguir puesta en la pantalla siguiente.
  await P.goto(`${BASE}/plataforma/admin/index.html`, { waitUntil: 'domcontentloaded' });
  await P.waitForTimeout(2500);
  const persiste = await P.evaluate(() => ({
    paleta: document.documentElement.dataset.paleta,
    primary: getComputedStyle(document.documentElement).getPropertyValue('--primary').trim(),
  }));
  a.comprobar(persiste.paleta === 'violeta' && persiste.primary === '#7c3aed',
    'La elección se mantiene al cambiar de pantalla');

  // El tema oscuro tiene que seguir funcionando con la paleta puesta: es lo que
  // se rompe si los colores se escriben en el elemento en vez de en una hoja.
  await P.evaluate(() => document.documentElement.dataset.theme = 'dark');
  await P.waitForTimeout(300);
  const deNoche = await P.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--fondo').trim());
  a.comprobar(deNoche === '#15111f',
    `Con la paleta elegida, el tema oscuro sigue oscureciendo (${deNoche})`);
  a.comprobar(P.errores.length === 0, `Configuración no lanza errores ${JSON.stringify(P.errores.slice(0, 2))}`);

  a.comprobar(A.errores.length === 0, `El escritorio no lanza errores ${JSON.stringify(A.errores.slice(0, 2))}`);
  a.comprobar(N.errores.length === 0, `El modo oscuro tampoco ${JSON.stringify(N.errores.slice(0, 2))}`);
  a.comprobar(M.errores.length === 0, `Ni el teléfono ${JSON.stringify(M.errores.slice(0, 2))}`);

  return a;
}
