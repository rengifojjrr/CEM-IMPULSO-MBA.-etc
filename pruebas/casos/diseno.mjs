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

  /* ============ la tabla, legible ============
     El ratón se queda donde hizo clic para entrar, y ahí puede caer encima de
     una fila: esa fila se pinta con el color de «estás sobre mí» y la
     comprobación de que no hay filas cebradas se pone roja sin que nadie haya
     cebrado nada. Se aparta antes de mirar. */
  await A.mouse.move(2, 2);
  await A.waitForTimeout(200);
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

  /* Los selectores son `data-ap` y no ids porque el panel de apariencia vive
     en assets/apariencia.js y puede pintarse dos veces en la misma página —en
     Configuración y en la ventana que abre cualquier usuario desde el menú—.
     Dos elementos con el mismo id habrían roto esto de forma silenciosa. */
  /* Los números salen del catálogo y no escritos a mano: cada vez que se añadía
     un estilo había que venir a subir el número, y el día que alguien no lo
     hacía la prueba se ponía roja por una función nueva que estaba bien. Lo que
     importa es que el panel ofrezca TODO lo que hay, no que haya siete. */
  const cuantos = await P.evaluate(async () => {
    const t = await import('/plataforma/assets/temas.js?v=2026-08-22-5');
    return { paletas: Object.keys(t.PALETAS).length, estilos: Object.keys(t.ESTILOS).length,
             formas: Object.keys(t.FORMAS).length, densidades: Object.keys(t.DENSIDADES).length };
  });
  a.comprobar((await P.locator('[data-ap="estilos"] .estilo').count()) === cuantos.estilos,
    `Ofrece los ${cuantos.estilos} estilos de recuadro que hay, no unos cuantos`);
  a.comprobar((await P.locator('.pal').count()) === cuantos.paletas,
    `Y las ${cuantos.paletas} paletas`);
  a.comprobar((await P.locator('[data-ap="formas"] .forma').count()) === cuantos.formas,
    `Las ${cuantos.formas} formas de esquina`);
  a.comprobar((await P.locator('[data-ap="densidades"] [data-densidad]').count()) === cuantos.densidades,
    `Y las ${cuantos.densidades} densidades`);

  /* ============ la paleta del manual de marca ============
     Entre las paletas está la de la empresa, y sus colores son los del manual y
     no unos parecidos. Se fijan aquí los hexadecimales para que si alguien los
     ajusta «un poquito» se entere de que está tocando la identidad, no un tema
     más. También la tipografía: un manual de marca son los colores Y la letra, y
     dejar los colores oficiales con la letra de otra identidad no es aplicarlo.  */
  const marca = await P.evaluate(async () => {
    const t = await import('/plataforma/assets/temas.js?v=2026-08-22-5');
    const antes = { paleta: t.paletaActual(), tema: t.temaActual() };
    t.aplicarApariencia({ paleta: 'cemMarca', tema: 'claro' });
    const cs = getComputedStyle(document.documentElement);
    const v = (k) => cs.getPropertyValue(k).trim();
    const salida = {
      existe: !!t.PALETAS.cemMarca,
      fuente: t.PALETAS.cemMarca?.fuente,
      letraPuesta: getComputedStyle(document.body).fontFamily,
      letraPedida: !!document.getElementById('cemLetraPaleta'),
      series: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => v(`--serie-${n}`).toUpperCase()),
    };
    /* Se vuelve a «caribe» y no a la de antes: la de fábrica es ahora la de la
       marca, que TRAE letra, así que volver a ella no retiraría el enlace y la
       comprobación de abajo no probaría nada. */
    t.aplicarApariencia({ paleta: 'caribe', tema: antes.tema });
    salida.letraRetirada = !document.getElementById('cemLetraPaleta');
    t.aplicarApariencia(antes);
    return salida;
  });
  a.comprobar(marca.existe,
    'Entre las paletas está la oficial de la empresa, la del manual de marca');
  /* Los ocho cromáticos del brand board, en su orden y sin retocar. Se fijan
     aquí para que si alguien los ajusta «un poquito» se entere de que está
     tocando la identidad. */
  a.comprobar(JSON.stringify(marca.series)
      === JSON.stringify(['#3E7BFF', '#7EFF72', '#FF45A6', '#FF8A00',
                          '#9B5CFF', '#00E0D1', '#FFE45E', '#1F1F1F']),
    `Y sus gráficos usan los ocho colores del board sin retocar (${marca.series.slice(0, 3).join(' ')}…)`);
  a.comprobar(marca.fuente === 'Poppins' && /Poppins/.test(marca.letraPuesta) && marca.letraPedida,
    `Con la tipografía del board, que se pide sólo al elegirla (${
      marca.letraPuesta.split(',')[0]})`);
  a.comprobar(marca.letraRetirada,
    'Y al cambiar a otra paleta se retira: no se queda una letra descargada de más');

  await P.click('[data-paleta="violeta"]');
  await P.click('[data-ap="estilos"] [data-estilo="bisel"]');
  await P.click('[data-ap="formas"] [data-forma="redonda"]');
  await P.click('[data-ap="densidades"] [data-densidad="compacta"]');
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
  await P.click('[data-ap="estilos"] [data-estilo="canto"]');
  await P.waitForTimeout(500);
  const ligero = await P.evaluate(() =>
    getComputedStyle(document.querySelector('.card')).backdropFilter);
  a.comprobar(ligero === 'none',
    `«Canto tallado» dice que es ligero y no desenfoca las tarjetas (${ligero})`);
  await P.click('[data-ap="estilos"] [data-estilo="bisel"]');
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
  /* ============ que se lea, en TODAS las paletas y en los dos temas ============
     Un barrido de 77 pantallas midiendo píxel a píxel encontró 1.993 textos por
     debajo del mínimo legible, casi todos por lo mismo: `--tinta-3` estaba
     calibrada contra el papel, y con vidrio el papel se tiñe con lo que tiene
     detrás. Esto no vuelve a medir píxeles —eso tarda diez minutos— sino los
     tres pares que causaban el problema, que se pueden comprobar exactos.

     Antes esta comprobación no medía lo que decía medir. Recorría seis nombres
     de paleta escritos a mano poniendo `data-paleta`, pero la hoja que lleva los
     colores sólo contiene la paleta ELEGIDA: al poner «indigo» no había ninguna
     regla que coincidiera y se seguían leyendo los tokens de base. O sea que
     medía la paleta de la casa cinco veces y una sola de verdad, y daba verde.
     Ahora se llama a aplicarApariencia() —el camino real— y se recorre el
     catálogo entero, así que una paleta nueva entra sola en la prueba. */
  const contraste = await P.evaluate(async () => {
    const t = await import('/plataforma/assets/temas.js?v=2026-08-22-5');
    const canal = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const lum = ([r, g, b]) => 0.2126 * canal(r / 255) + 0.7152 * canal(g / 255) + 0.0722 * canal(b / 255);
    const leer = (txt) => {
      const d = document.createElement('div');
      d.style.color = txt; document.body.appendChild(d);
      const c = getComputedStyle(d).color; d.remove();
      const n = [...c.matchAll(/-?[\d.]+/g)].map((m) => Number(m[0]));
      // color-mix() se devuelve como color(srgb 0..1); rgb() como 0..255.
      return c.startsWith('color(') ? n.slice(0, 3).map((v) => Math.round(v * 255)) : n.slice(0, 3);
    };
    const razon = (a, b) => {
      const [x, y] = [lum(leer(a)), lum(leer(b))].sort((p, q) => q - p);
      return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
    };
    const tok = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

    const nombres = Object.keys(t.PALETAS);
    const antes = { paleta: t.paletaActual(), tema: t.temaActual(), estilo: t.estiloActual() };
    const salida = { peorTinta: 99, peorTinta2: 99, dorado: 99, aviso: 99,
                     donde: '', dondeDorado: '', paletas: nombres.length };

    for (const paleta of nombres) {
      for (const tema of ['claro', 'oscuro']) {
        t.aplicarApariencia({ paleta, tema, estilo: 'plano' });
        const c3 = razon(tok('--tinta-3'), tok('--papel'));
        const c2 = razon(tok('--tinta-2'), tok('--papel'));
        const cd = razon(tok('--on-gold'), tok('--gold'));
        if (c3 < salida.peorTinta) { salida.peorTinta = c3; salida.donde = `${paleta}/${tema}`; }
        if (cd < salida.dorado) { salida.dorado = cd; salida.dondeDorado = `${paleta}/${tema}`; }
        salida.peorTinta2 = Math.min(salida.peorTinta2, c2);
        salida.aviso = Math.min(salida.aviso, razon(tok('--inverse-on-surface'), tok('--inverse-surface')));
      }
    }
    t.aplicarApariencia(antes);
    return salida;
  });
  a.comprobar(contraste.peorTinta >= 4.5,
    `La tinta más tenue se lee en las ${contraste.paletas} paletas y los dos temas (peor: ${
      contraste.peorTinta} en ${contraste.donde})`);
  a.comprobar(contraste.peorTinta2 >= 4.5,
    `Y la de las explicaciones también (peor: ${contraste.peorTinta2})`);
  a.comprobar(contraste.dorado >= 4.5,
    `Lo que se escribe sobre el dorado se lee de día y de noche (${contraste.dorado} en ${
      contraste.dondeDorado})`);
  a.comprobar(contraste.aviso >= 4.5,
    `Y el aviso flotante, que lleva la letra al revés que el resto (${contraste.aviso})`);

  /* Dejar el aspecto como estaba. Sin esto, la elección que hace esta prueba
     —violeta, bisel, esquinas redondas, densidad compacta— se queda guardada
     en el navegador de trabajo y las comprobaciones de más arriba, que corren
     antes en la vuelta SIGUIENTE, miden una plataforma con vidrio: el
     encabezado de la tabla pasa a tener fondo y «no hay filas cebradas» se
     pone rojo sin que nadie haya tocado nada. */
  // La comprobación de que la elección persiste nos dejó en el tablero.
  await P.goto(`${BASE}/plataforma/admin/configuracion.html`, { waitUntil: 'domcontentloaded' });
  await P.waitForSelector('[data-ap="fabrica"]', { timeout: 25000 });
  await P.click('[data-ap="fabrica"]');
  await P.waitForTimeout(800);
  const fabrica = await P.evaluate(() => ({
    estilo: document.documentElement.dataset.estilo,
    forma: document.documentElement.dataset.forma,
    densidad: document.documentElement.dataset.densidad,
  }));
  a.comprobar(fabrica.estilo === 'plano' && fabrica.forma === 'suave' && fabrica.densidad === 'normal',
    `«Volver a como viene de fábrica» devuelve las tres cosas (${JSON.stringify(fabrica)})`);

  /* El aire entre cuadros tiene que ser mayor que el relleno de dentro, o dos
     tarjetas seguidas se leen como una sola cosa partida por la mitad. */
  const aire = await P.evaluate(() => {
    const px = (v) => parseFloat(v) || 0;
    const cs = getComputedStyle(document.documentElement);
    const tarjeta = document.querySelector('.card');
    return {
      entre: px(cs.getPropertyValue('--aire')) || px(getComputedStyle(document.querySelector('.grid'))?.gap),
      dentro: tarjeta ? px(getComputedStyle(tarjeta).paddingTop) : 0,
    };
  });
  a.comprobar(aire.entre > aire.dentro,
    `Hay más aire entre cuadros que dentro de ellos (${aire.entre} entre · ${aire.dentro} dentro)`);

  /* ============ el armazón, en sus dos anchos ============
     Tres defectos que se veían a simple vista y que ninguna prueba miraba:
     el menú estrechado partía las palabras de sus botones, la barra de
     acciones dejaba los botones flotando por encima de la casilla de al lado,
     y al llegar arriba del todo el rebote del navegador despegaba la
     aplicación del borde de la ventana. */

  /* Tab aparte a propósito: la comprobación de errores de `P` habla de la
     pantalla de configuración, y `pagina.errores` se va acumulando. */
  const S = await nuevaPestana(navegador, { ancho: 1440, alto: 950 });
  await entrar(S, 'admin', 'admin/cierre-mes.html');
  await S.waitForSelector('#page:not(.hidden)', { timeout: 30000 });
  await S.waitForTimeout(1200);

  // Estrechado, el pie es una columna de iconos: nada se corta y ninguno se
  // queda vacío. `scrollWidth > clientWidth` es exactamente «no cabe».
  const menu = await S.evaluate(async () => {
    const shell = document.querySelector('.shell');
    const plegado = shell.classList.contains('plegado');
    if (!plegado) document.querySelector('#cemPlegar').click();
    await new Promise((r) => setTimeout(r, 500));
    const pie = [...document.querySelectorAll('.sidebar .foot button')].map((b) => ({
      que: (b.title || b.textContent).trim().slice(0, 22),
      corta: b.scrollWidth > b.clientWidth + 1,
      icono: Math.round(b.querySelector('.material-symbols-outlined')?.getBoundingClientRect().width || 0),
      rotulo: !!b.title,
    }));
    if (!plegado) { document.querySelector('#cemPlegar').click(); await new Promise((r) => setTimeout(r, 500)); }
    return pie;
  });
  a.comprobar(menu.length >= 3 && menu.every((b) => !b.corta),
    `Con el menú estrechado no se parte ninguna palabra (${
      menu.filter((b) => b.corta).map((b) => b.que).join(', ') || 'ninguna'})`);
  a.comprobar(menu.every((b) => b.icono > 0),
    `Y ningún botón se queda vacío: todos conservan su icono (${
      menu.filter((b) => !b.icono).map((b) => b.que).join(', ') || 'todos lo tienen'})`);
  a.comprobar(menu.every((b) => b.rotulo),
    'El nombre que se esconde pasa al tooltip, que es lo único que queda para saber qué hace');

  // Un campo con rótulo mide una etiqueta más que un botón. Si la fila se
  // centra, los botones suben y parecen de otra fila.
  const linea = await S.evaluate(() => {
    const acciones = document.querySelector('.page-head .actions');
    const campo = acciones.querySelector('.field input, .field select');
    const boton = acciones.querySelector('button, .btn');
    const fondo = (e) => Math.round(e.getBoundingClientRect().bottom);
    return { hay: !!(campo && boton), dif: campo && boton ? Math.abs(fondo(campo) - fondo(boton)) : -1 };
  });
  a.comprobar(linea.hay && linea.dif <= 3,
    `Los botones de la cabecera se apoyan en la misma línea que la casilla de al lado (${linea.dif} px)`);

  const rebote = await S.evaluate(() =>
    getComputedStyle(document.documentElement).overscrollBehaviorY);
  a.comprobar(rebote === 'none',
    `Al llegar arriba la aplicación no se despega del borde de la ventana (${rebote})`);

  a.comprobar(S.errores.length === 0, `El armazón no lanza errores ${JSON.stringify(S.errores.slice(0, 2))}`);


  a.comprobar(P.errores.length === 0, `Configuración no lanza errores ${JSON.stringify(P.errores.slice(0, 2))}`);

  a.comprobar(A.errores.length === 0, `El escritorio no lanza errores ${JSON.stringify(A.errores.slice(0, 2))}`);
  a.comprobar(N.errores.length === 0, `El modo oscuro tampoco ${JSON.stringify(N.errores.slice(0, 2))}`);
  a.comprobar(M.errores.length === 0, `Ni el teléfono ${JSON.stringify(M.errores.slice(0, 2))}`);

  return a;
}
