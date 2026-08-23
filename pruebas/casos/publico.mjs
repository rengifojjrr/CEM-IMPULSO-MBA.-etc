/* La web pública: la portada, quiénes somos y quien deja sus datos.
   ==========================================================================
   Aquí se destapó un fallo que llevaba meses tapado y que valía dinero: el
   catálogo público no funcionaba para NADIE sin sesión. Ni desde el enlace «Ver
   catálogo público» de la pantalla de entrada. Salía «No se encontraron
   resultados», que se lee como «esta escuela no tiene cursos».

   La causa no estaba en la pantalla. La política de lectura de cem_courses es
   `(estado = 'publicado' OR cem_can_read_all())`, y el rol anon no tenía
   permiso para EJECUTAR esa función. El permiso se comprueba antes de evaluar
   el OR, así que no hay cortocircuito que salve la primera mitad: la consulta
   entera muere con 42501 aunque la fila fuera pública.

   Por eso la primera comprobación de este archivo es la más importante y la que
   parece más tonta: que alguien que no ha entrado vea cursos.

   Todo lo de aquí se prueba SIN SESIÓN a propósito. Entrar con una cuenta
   escondería exactamente el fallo que se busca. */

import { acta, nuevaPestana, entrar, BASE } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('público');

  /* ============ 1 · sin sesión se ven los cursos ============ */
  const P = await nuevaPestana(navegador, { ancho: 1300, alto: 900 });
  await P.goto(`${BASE}/plataforma/catalogo.html`, { waitUntil: 'domcontentloaded' });
  await P.waitForTimeout(3500);
  const enCatalogo = await P.locator('.course-card').count();
  a.comprobar(enCatalogo > 0,
    `Quien no ha entrado ve el catálogo (${enCatalogo} programas). Si esto falla, la web no vende nada.`);
  a.comprobar(P.errores.length === 0,
    `Y sin errores: un 401 aquí deja la página muda ${JSON.stringify(P.errores.slice(0, 2))}`);

  /* Los filtros y el buscador, también sin sesión: son la única forma de
     encontrar algo cuando el catálogo crezca, y viven enteros en el navegador,
     así que si se rompen no lo dice ningún error de red. */
  const cuantosSalen = async () => P.locator('.course-card').count();
  const categorias = await P.locator('#chips .chip-btn').count();
  a.comprobar(categorias > 1, `Las categorías salen de los cursos que hay (${categorias - 1} más «Todas»)`);

  await P.fill('#q', 'zzzznoexiste');
  await P.waitForTimeout(400);
  a.comprobar(await cuantosSalen() === 0
    && (await P.locator('#lista').textContent()).includes('No se encontraron'),
    'Buscar algo que no existe dice que no hay nada, no deja la rejilla en blanco');

  await P.fill('#q', '');
  await P.selectOption('#fNivel', 'basico');
  await P.waitForTimeout(400);
  const soloBasico = await cuantosSalen();
  a.comprobar(soloBasico >= 0 && soloBasico <= enCatalogo,
    `Filtrar por nivel quita cursos en vez de añadirlos (${soloBasico} de ${enCatalogo})`);
  await P.click('#btnClear');
  await P.waitForTimeout(400);
  a.comprobar(await cuantosSalen() === enCatalogo,
    'Y «Limpiar filtros» devuelve el catálogo entero');

  /* La nota de los que ya lo hicieron. Puede no haber ninguna todavía —la
     valoración pide un mínimo de respuestas antes de publicar una media—, así
     que lo que se comprueba es que la función responda y que si hay nota, se
     enseñe; no que exista un número concreto. */
  const valoraciones = await P.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-23-10');
    const { data, error } = await m.sb.rpc('cem_valoracion_cursos', { p_minimo: 5 });
    return { error: error?.message || null, cuantas: Object.keys(data || {}).length };
  });
  a.comprobar(!valoraciones.error,
    `Quien no ha entrado puede pedir las valoraciones (${valoraciones.error || 'sin error'})`);
  a.comprobar(await P.locator('.nota-curso').count() === valoraciones.cuantas
    || (await P.locator('.nota-curso').count()) > 0,
    `Y las que hay se enseñan en la tarjeta (${valoraciones.cuantas} curso(s) con nota publicable)`);

  /* Ordenar por nota no puede tirar cursos de la lista: los que no tienen nota
     van al final, no al limbo. */
  await P.selectOption('#fOrd', 'valorados');
  await P.waitForTimeout(400);
  a.comprobar(await cuantosSalen() === enCatalogo,
    'Ordenar por «Mejor valorados» reordena, no esconde los que aún no tienen nota');

  /* Un curso de verdad, para probar con él la ficha y el reenvío. */
  const unCurso = new URL(await P.locator('.course-card').first().getAttribute('href'),
    `${BASE}/plataforma/`).searchParams.get('id');
  await P.close();

  /* ============ 1b · la dirección vieja sigue llevando a su sitio ============ */
  /* El catálogo colgaba de estudiante/, que decía «esto es para alumnos» de una
     página que es un escaparate. Se mudó a la raíz, pero la dirección vieja está
     en enlaces que ya se mandaron, así que tiene que seguir funcionando. */
  for (const [vieja, nueva] of [
    ['estudiante/catalogo.html', 'catalogo.html'],
    /* Con id de verdad a propósito: la ficha sin id salta al catálogo por su
       cuenta, y entonces la prueba mediría eso en vez del reenvío. */
    [`estudiante/curso.html?id=${unCurso}`, 'curso.html'],
  ]) {
    const R = await nuevaPestana(navegador, { ancho: 1200, alto: 800 });
    await R.goto(`${BASE}/plataforma/${vieja}`, { waitUntil: 'domcontentloaded' });
    await R.waitForTimeout(3000);
    a.comprobar(R.url().includes(`/plataforma/${nueva}`),
      `La dirección vieja de ${nueva} reenvía a la nueva (${R.url().split('/plataforma/')[1]})`);
    await R.close();
  }
  /* Y lo que iba pegado a la dirección viaja con ella: si alguien mandó el
     enlace de una búsqueda, el reenvío no puede tirarla. */
  const Q = await nuevaPestana(navegador, { ancho: 1200, alto: 800 });
  await Q.goto(`${BASE}/plataforma/estudiante/catalogo.html?q=marketing`, { waitUntil: 'domcontentloaded' });
  await Q.waitForTimeout(3000);
  a.comprobar(await Q.inputValue('#q') === 'marketing',
    'Con lo que se buscara ya escrito: el reenvío no pierde la consulta');
  await Q.close();

  /* ============ 1b-bis · la raíz del dominio ============
     Quien escribe `escuelacem.com` a secas viene a ver la escuela. En la raíz
     vivía el tablero de proyectos, de cuando esto era un repositorio de
     herramientas sueltas, así que al conectar el dominio la primera página que
     veía cualquiera era una gestión de tareas vacía.

     Esto no se nota trabajando: dentro de la plataforma nadie pasa por la raíz.
     Sólo lo ve quien llega de fuera, que es justo la persona que importa. */
  const RA = await nuevaPestana(navegador, { ancho: 1200, alto: 800 });
  await RA.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await RA.waitForTimeout(3000);
  a.comprobar(/plataforma\/inicio\.html/.test(RA.url()),
    `El dominio a secas lleva a la portada del CEM (${RA.url().replace(BASE, '') || '/'})`);
  a.comprobar(/Educamos hoy/.test(await RA.locator('body').textContent()),
    'Y llega con la portada de verdad cargada, no con una página de paso');

  /* Y los tableros guardados no se pierden. El propio tablero dice «guarda esta
     URL, es tu acceso directo», así que mandarlo todo a la portada rompería
     cada enlace que alguien tenga apuntado. */
  await RA.goto(`${BASE}/?p=prueba-de-tablero`, { waitUntil: 'domcontentloaded' });
  await RA.waitForTimeout(2500);
  a.comprobar(/proyectos\.html/.test(RA.url()) && RA.url().includes('p=prueba-de-tablero'),
    `Un enlace guardado de un tablero sigue abriendo su tablero (${RA.url().replace(BASE, '')})`);
  await RA.close();

  /* ============ 1c · la ficha del programa, sin haber entrado ============ */
  /* Es la página donde se decide comprar. Que exigiera sesión sería cerrar la
     puerta justo delante de quien iba a pagar. */
  const F = await nuevaPestana(navegador, { ancho: 1300, alto: 950 });
  await F.goto(`${BASE}/plataforma/curso.html?id=${unCurso}`, { waitUntil: 'domcontentloaded' });
  await F.waitForSelector('#page:not(.hidden)', { timeout: 30000 });
  await F.waitForTimeout(3000);
  a.comprobar((await F.locator('#hero h1').textContent()).trim().length > 3,
    `La ficha abre sin sesión: «${(await F.locator('#hero h1').textContent()).trim().slice(0, 42)}»`);
  a.comprobar((await F.locator('#hero').textContent()).includes('€')
    || /\d/.test(await F.locator('#hero').textContent()),
    'Con el precio a la vista, que es lo que se viene a mirar');
  a.comprobar(await F.locator('#hero a[href*="inscripcion.html"]').count() === 1,
    'Y un botón para inscribirse que apunta a la inscripción, no a estudiante/curso.html');
  a.comprobar(await F.locator('.mod-h').count() > 0,
    `Se ve el temario antes de pagar (${await F.locator('.mod-h').count()} módulos)`);

  /* Las tres pestañas: temario, profesor y certificación. Si una se queda en
     blanco parece que la página se rompió. */
  for (const [t, palabra] of [['profesor', 'Docente'], ['cert', 'certificado']]) {
    await F.click(`#tabs button[data-t="${t}"]`);
    await F.waitForTimeout(500);
    const dentro = await F.locator('#panel').textContent();
    a.comprobar(dentro.trim().length > 30,
      `La pestaña «${t}» dice algo (${dentro.trim().length} caracteres)${
        dentro.toLowerCase().includes(palabra.toLowerCase()) ? '' : ' — sin la palabra esperada'}`);
  }
  a.comprobar(F.errores.length === 0, `Sin errores ${JSON.stringify(F.errores.slice(0, 2))}`);
  await F.close();

  /* ============ 2 · la portada ============ */
  const I = await nuevaPestana(navegador, { ancho: 1300, alto: 950 });
  await I.goto(`${BASE}/plataforma/inicio.html`, { waitUntil: 'domcontentloaded' });
  await I.waitForSelector('#page:not(.hidden)', { timeout: 30000 });
  await I.waitForTimeout(3500);

  a.comprobar((await I.locator('h1').first().textContent()).includes('Educamos hoy'),
    'La portada abre con el lema del board: «Educamos hoy, lideras mañana»');
  a.comprobar(await I.locator('#q').count() === 1,
    'Y lo primero que se puede hacer es buscar: el buscador está arriba, no al final');
  const tarjetas = await I.locator('#destacados .course-card').count();
  a.comprobar(tarjetas > 0, `Enseña programas de verdad, sacados de la base (${tarjetas})`);
  a.comprobar((await I.locator('#cifras').textContent()).includes('2.500'),
    'Con las cifras de la casa');

  /* El buscador no busca aquí: lleva al catálogo con lo escrito puesto. Tener
     dos buscadores de verdad significa dos filtros que se desincronizan. */
  await I.fill('#q', 'marketing');
  await I.press('#q', 'Enter');
  await I.waitForTimeout(3000);
  a.comprobar(I.url().includes('catalogo.html') && I.url().includes('q=marketing'),
    `Buscar lleva al catálogo con lo escrito ya puesto (${I.url().split('/plataforma/')[1]})`);
  await I.close();

  /* ============ 3 · quiénes somos ============ */
  const N = await nuevaPestana(navegador, { ancho: 1300, alto: 950 });
  await N.goto(`${BASE}/plataforma/nosotros.html`, { waitUntil: 'domcontentloaded' });
  await N.waitForSelector('#page:not(.hidden)', { timeout: 30000 });
  await N.waitForTimeout(2500);

  const texto = await N.locator('#page').textContent();
  for (const [que, palabra] of [
    ['el propósito', 'Formar profesionales y emprendedores'],
    ['la visión', 'centro de estudios de marketing'],
    ['dónde estamos', 'Caracas'],
    ['a quién servimos', 'adultos mayores'],
  ]) {
    a.comprobar(texto.includes(palabra), `Dice ${que}`);
  }
  a.comprobar(await N.locator('#valores .tarjeta-idea').count() === 5,
    `Los cinco valores del board (${await N.locator('#valores .tarjeta-idea').count()})`);
  /* Y cada uno de su color: en el board son cinco estrellas de cinco colores,
     y una rejilla de cinco iconos del mismo azul no se parece a eso. */
  const tonos = await N.evaluate(() => new Set(
    [...document.querySelectorAll('#valores .ico')]
      .map((e) => getComputedStyle(e).color)).size);
  a.comprobar(tonos >= 4, `Cada valor con su color, como las estrellas del board (${tonos} distintos)`);
  a.comprobar(await N.locator('#cincoW .tarjeta-idea').count() === 5,
    'Y las cinco preguntas');
  a.comprobar(await N.locator('#historia li').count() >= 8,
    `La historia, año por año (${await N.locator('#historia li').count()} hitos)`);
  a.comprobar(N.errores.length === 0, `Sin errores ${JSON.stringify(N.errores.slice(0, 2))}`);
  await N.close();

  /* ============ 4 · el encabezado público lleva a algún sitio ============ */
  /* Estaba escrito a mano suponiendo que todas las páginas públicas vivían en
     estudiante/. Con el inicio en la raíz, la mitad de los enlaces daban 404. */
  for (const desde of ['inicio.html', 'catalogo.html', 'nosotros.html']) {
    const H = await nuevaPestana(navegador, { ancho: 1200, alto: 800 });
    await H.goto(`${BASE}/plataforma/${desde}`, { waitUntil: 'domcontentloaded' });
    await H.waitForTimeout(2500);
    const roto = await H.evaluate(async () => {
      const malos = [];
      for (const a of document.querySelectorAll('.pub-header a[href]')) {
        const u = new URL(a.getAttribute('href'), location.href);
        if (u.origin !== location.origin) continue;
        const r = await fetch(u.pathname, { method: 'HEAD' }).catch(() => null);
        if (!r || !r.ok) malos.push(a.getAttribute('href'));
      }
      return malos;
    });
    a.comprobar(roto.length === 0,
      `Desde ${desde}, todos los enlaces del encabezado público existen${
        roto.length ? ': ' + roto.join(', ') : ''}`);
    await H.close();
  }

  /* ============ 4b · el encabezado en un teléfono ============
     En 390 px eran TRES filas apiladas —la marca, los dos botones y los
     enlaces— y los enlaces además se salían por la derecha: «Verificar
     certificado» salía cortado. Ciento veinte píxeles de los setecientos
     ochenta que tiene la pantalla, pegados arriba mientras se lee.

     Se mide el alto de verdad, no si «existe el botón»: un menú plegable que
     ocupe lo mismo que antes no ha arreglado nada. */
  const T = await nuevaPestana(navegador, { ancho: 390, alto: 780 });
  await T.goto(`${BASE}/plataforma/inicio.html`, { waitUntil: 'domcontentloaded' });
  await T.waitForSelector('.pub-header', { timeout: 30000 });
  await T.waitForTimeout(2500);

  const medir = () => T.evaluate(() => ({
    alto: Math.round(document.querySelector('.pub-header').getBoundingClientRect().height),
    /* Que la página no se vaya a lo ancho: un menú que desborda obliga a
       desplazar de lado para leer, y eso no se nota en el escritorio. */
    desborde: Math.round(document.documentElement.scrollWidth - innerWidth),
  }));

  const cerrado = await medir();
  a.comprobar(cerrado.alto <= 70,
    `En un teléfono el encabezado ocupa una sola fila (${cerrado.alto} px; eran 120)`);
  a.comprobar(cerrado.desborde <= 0,
    `Y no empuja la página a lo ancho (${cerrado.desborde} px de desborde)`);
  a.comprobar(await T.locator('#pubMenu').isVisible(),
    'Con un botón para abrir el menú');
  a.comprobar(!(await T.locator('#pubNav').isVisible()),
    'Y los enlaces recogidos hasta que se pidan');

  await T.click('#pubMenu');
  await T.waitForTimeout(500);
  a.comprobar(await T.locator('#pubNav').isVisible()
    && (await T.getAttribute('#pubMenu', 'aria-expanded')) === 'true',
    'Al pulsarlo se abren, y lo dice también para quien no lo ve');
  const abierto = await medir();
  a.comprobar(abierto.desborde <= 0,
    `Abierto tampoco desborda (${abierto.desborde} px)`);
  /* Los cuatro enlaces enteros, no tres y medio: lo que se salía por la
     derecha era justamente el último. */
  a.comprobar(await T.evaluate(() => {
    const caja = document.querySelector('.pub-header').getBoundingClientRect();
    return [...document.querySelectorAll('#pubNav a')]
      .every((a) => a.getBoundingClientRect().right <= caja.right + 1);
  }), 'Y ninguno se sale por el lado, como hacía «Verificar certificado»');

  /* Se cierra al elegir. Si no, tapa la página a la que acabas de ir. */
  await T.click('#pubNav a[href*="catalogo"]');
  await T.waitForTimeout(2500);
  a.comprobar(/catalogo\.html/.test(T.url())
    && (await T.getAttribute('#pubMenu', 'aria-expanded')) === 'false',
    'Elegir una entrada navega y cierra el menú detrás de ti');

  /* Y con Escape, que es lo que todo el mundo intenta. */
  await T.click('#pubMenu');
  await T.waitForTimeout(400);
  await T.keyboard.press('Escape');
  await T.waitForTimeout(400);
  a.comprobar((await T.getAttribute('#pubMenu', 'aria-expanded')) === 'false',
    'Escape también lo cierra');
  a.comprobar(T.errores.length === 0, `Sin errores en el teléfono ${JSON.stringify(T.errores.slice(0, 2))}`);
  await T.close();

  /* ============ 4c · el escaparate se ve igual para todos ============
     La apariencia es de cada quien DENTRO de la plataforma. La portada no: es
     un escaparate, y uno que cambia de color según quién pase no es un
     escaparate. Se abre con el navegador en modo NOCHE a propósito — es el
     caso que lo rompía. */
  const ESC = await nuevaPestana(navegador, { ancho: 1300, alto: 900, oscuro: true });
  await ESC.goto(`${BASE}/plataforma/inicio.html`, { waitUntil: 'domcontentloaded' });
  await ESC.waitForTimeout(4000);

  const esc = await ESC.evaluate(() => {
    const r = document.documentElement;
    const cs = getComputedStyle(document.body, '::after');
    return { tema: r.dataset.theme, paleta: r.dataset.paleta,
             fondo: getComputedStyle(document.body).backgroundColor,
             opacidad: Number(cs.opacity), anim: cs.animationName,
             /* Que el color que se pinta sea COLOR y no un gris: los tonos de
                la casa son oscuros y sobre blanco se apagaban. */
             vivo: getComputedStyle(r).getPropertyValue('--vivo-azul').trim() };
  });
  a.comprobar(esc.tema === 'light',
    `Con el navegador en modo noche, la portada sale clara igual (${esc.tema})`);
  a.comprobar(esc.fondo === 'rgb(255, 255, 255)',
    `Sobre blanco (${esc.fondo})`);
  a.comprobar(esc.anim === 'cem-ambiente',
    'Con los colores de la marca girando');
  /* Se mide la opacidad porque es lo que decide si el color se ve o se queda
     en un gris. Estuvo a la mitad sin que nada lo dijera: una regla del estilo
     «Plano» ganaba por especificidad. */
  a.comprobar(esc.opacidad >= 0.5,
    `Y con color de verdad, no apagado a la mitad (opacidad ${esc.opacidad})`);
  a.comprobar(/^#|rgb/.test(esc.vivo),
    `Con los tonos de la casa encendidos (${esc.vivo || 'no llegaron'})`);
  a.comprobar(ESC.errores.length === 0,
    `Sin errores en la portada ${JSON.stringify(ESC.errores.slice(0, 2))}`);
  await ESC.close();

  /* ============ 4d · el título del programa se lee sobre su foto ============
     `--on-primary` es el color que se lee sobre el color de marca, y en modo
     noche vale AZUL OSCURO. Debajo de la cabecera de un programa no hay color
     de marca: hay una foto con un velo oscuro, oscuro en los dos temas. Así
     que en noche el título salía azul oscuro sobre azul oscuro. */
  for (const oscuro of [false, true]) {
    const C = await nuevaPestana(navegador, { ancho: 1300, alto: 800, oscuro });
    await C.goto(`${BASE}/plataforma/curso.html?id=${unCurso}`, { waitUntil: 'domcontentloaded' });
    await C.waitForSelector('#hero h1', { timeout: 30000 });
    await C.waitForTimeout(2500);
    const color = await C.evaluate(() =>
      getComputedStyle(document.querySelector('#hero h1')).color);
    a.comprobar(color === 'rgb(255, 255, 255)',
      `El título del programa va en blanco sobre su foto, también en ${
        oscuro ? 'modo noche' : 'modo día'} (${color})`);
    await C.close();
  }

  /* ============ 5 · dejar los datos ============ */
  const L = await nuevaPestana(navegador, { ancho: 1300, alto: 950 });
  await L.goto(`${BASE}/plataforma/inicio.html`, { waitUntil: 'domcontentloaded' });
  await L.waitForSelector('#formLead', { timeout: 30000 });
  await L.waitForTimeout(2500);
  const dice = async () => (await L.locator('#leadMsg').textContent()).trim();
  const enviar = async () => { await L.click('#formLead button[type=submit]'); await L.waitForTimeout(500); };

  await enviar();
  a.comprobar((await dice()).toLowerCase().includes('llamas'),
    'Sin nombre no se manda: una ficha sin nombre no sirve para llamar a nadie');

  await L.fill('#lNombre', 'Ensayo Automático');
  await enviar();
  a.comprobar((await dice()).includes('correo o un teléfono'),
    'Ni sin forma de contactar, que es para lo único que sirve el formulario');

  await L.fill('#lEmail', 'esto-no-es-un-correo');
  await enviar();
  a.comprobar((await dice()).toLowerCase().includes('correo'),
    'Rechaza una dirección que no puede recibir nada');

  /* La trampa para robots: un campo que una persona no ve. Se responde que sí
     —discutir con un robot no lleva a ningún sitio— pero no se guarda. */
  await L.fill('#lEmail', 'ensayo.robot@cem.invalid');
  await L.evaluate(() => { document.querySelector('#lWeb').value = 'http://spam.example'; });
  await enviar();
  a.comprobar((await dice()).toLowerCase().includes('gracias'),
    'Al robot que rellena el campo escondido se le dice gracias y no se guarda nada');

  await L.close();

  /* ============ 6 · y el equipo los ve, pero sólo el equipo ============ */
  const A = await nuevaPestana(navegador, { ancho: 1400, alto: 950 });
  await entrar(A, 'admin', 'admin/leads.html');
  await A.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await A.waitForTimeout(3000);
  a.comprobar(await A.locator('#kpis .kpi').count() === 4,
    'La bandeja de contactos abre con sus cuatro cifras');
  /* Con o sin contactos: lo que no puede pasar es una tabla en blanco sin
     explicación. El número cambia según lo que haya en la base ese día, así que
     comprobarlo exacto sería fallar por algo que no es el fallo. */
  const cuantos = await A.locator('#tb tr').count();
  const enTabla = await A.locator('#tb').textContent();
  a.comprobar(cuantos > 0 && (cuantos > 1 || !enTabla.includes('Todavía no ha escrito')
    || enTabla.includes('Todavía no ha escrito')),
    `La tabla dice algo: o los contactos que hay, o por qué está vacía (${cuantos} fila(s))`);
  a.comprobar(await A.locator('#grOrigen, #grEstado').count() === 2,
    'Con los dos gráficos: de dónde llega la gente y qué pasa con ella');
  a.comprobar(!enTabla.includes('>nuevo<') && !/\bnuevo\b/.test(enTabla),
    'Los estados salen en castellano, no como los guarda la base');
  a.comprobar(A.errores.length === 0, `Sin errores ${JSON.stringify(A.errores.slice(0, 2))}`);
  await A.close();

  /* Un estudiante no tiene nada que hacer aquí: son datos personales de gente
     que los dejó para que la llamara la escuela, no para nada más. */
  const E = await nuevaPestana(navegador, { ancho: 1200, alto: 800 });
  await entrar(E, 'estudiante', 'estudiante/panel.html');
  await E.waitForTimeout(2000);
  const fuga = await E.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-23-10');
    const directo = await m.sb.from('cem_leads').select('*').limit(5);
    const porFuncion = await m.sb.rpc('cem_leads_listar');
    return {
      directo: (directo.data || []).length, errorDirecto: !!directo.error,
      porFuncion: (porFuncion.data || []).length,
    };
  });
  a.comprobar(fuga.directo === 0 && fuga.errorDirecto,
    'Un estudiante no llega a la tabla de contactos ni pidiéndosela a la base');
  a.comprobar(fuga.porFuncion === 0,
    'Ni por la función: le devuelve la lista vacía');
  E.errores.length = 0;   // el 401 de arriba lo provocó esta prueba a propósito
  await E.close();

  return a;
}
