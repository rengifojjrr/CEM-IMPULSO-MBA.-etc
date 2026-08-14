/* Que la plataforma siga siendo simple de usar.

   Estas comprobaciones cuidan las piezas compartidas que hacen que las 50
   pantallas se lean igual: la tabla que se apila en el teléfono, el buscador
   único, las columnas que cada quien elige, los estados vacíos que ofrecen
   por dónde seguir y las palabras en castellano en vez de los valores que
   guarda la base.

   Son las que más fácil se rompen sin que nadie lo note: nada falla, sólo
   vuelve a costar más trabajo usar la plataforma. */

import { acta, nuevaPestana, entrar, BASE } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('simplificar');

  /* ============ en el teléfono, cada fila es una tarjeta ============ */
  const M = await nuevaPestana(navegador, { ancho: 390 });
  await entrar(M, 'admin', 'admin/cursos.html');
  await M.waitForSelector('#tabla tbody tr', { timeout: 25000 });
  await M.waitForTimeout(1500);

  const tarjetas = await M.evaluate(() => {
    const tabla = document.querySelector('#tabla');
    const celda = tabla?.querySelector('tbody tr td');
    return {
      apila: !!tabla?.classList.contains('tarjetas'),
      etiqueta: celda?.dataset.col || '',
      // Con las filas apiladas, la página no debe desplazarse de lado.
      deLado: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    };
  });
  a.comprobar(tarjetas.apila, 'En pantalla estrecha la tabla se apila como tarjetas');
  a.comprobar(tarjetas.etiqueta.length > 0,
    `Y cada celda lleva el nombre de su columna, copiado del encabezado («${tarjetas.etiqueta}»)`);
  a.comprobar(!tarjetas.deLado, 'Así la página ya no se lee arrastrando de lado');

  /* ============ un solo buscador por pantalla ============ */
  const A = await nuevaPestana(navegador, { ancho: 1400 });
  await entrar(A, 'admin', 'admin/estudiantes.html');
  await A.waitForSelector('#tabla tbody tr', { timeout: 25000 });
  await A.waitForTimeout(1500);

  const buscadores = await A.evaluate(() => {
    const local = document.querySelector('#page .filters input#q');
    const campo = local?.closest('.field');
    return {
      localOculto: !!campo?.hidden,
      pistaHeredada: document.querySelector('#cemGlobalSearch')?.placeholder || '',
      visibles: [...document.querySelectorAll('input[type="search"]')]
        .filter((i) => i.offsetParent !== null).length,
    };
  });
  a.comprobar(buscadores.visibles === 1, 'Sólo queda un buscador a la vista, no dos');
  a.comprobar(buscadores.localOculto, 'El de la tabla se retira en favor del de arriba');
  a.comprobar(/documento/i.test(buscadores.pistaHeredada),
    'Y el de arriba hereda la pista de qué se puede buscar ahí');

  // Escribir arriba filtra la tabla de abajo, sin recargar ni navegar.
  const antes = await A.locator('#tb tr').count();
  await A.fill('#cemGlobalSearch', 'zzzzzznoexiste');
  await A.waitForTimeout(700);
  const despues = await A.locator('#tb tr').count();
  a.comprobar(despues <= antes && (await A.locator('#tb .empty').count()) === 1,
    'Escribir en el buscador de arriba filtra la tabla que estás mirando');
  a.comprobar(/no coincide|Ningún/i.test(await A.locator('#tb').textContent()),
    'Y cuando no hay nada lo dice con palabras, no con una tabla en blanco');
  await A.fill('#cemGlobalSearch', '');
  await A.waitForTimeout(600);

  /* ============ cada quien elige qué columnas ve ============ */
  const conSelector = await A.locator('#zonaColumnas button').count();
  a.comprobar(conSelector === 1, 'La tabla ofrece elegir qué columnas se ven');
  if (conSelector) {
    const columnasAntes = await A.locator('#tabla thead th').evaluateAll(
      (ths) => ths.filter((t) => t.offsetParent !== null).length);
    await A.locator('#zonaColumnas button').click();
    await A.waitForSelector('[data-col-tog]', { timeout: 8000 });
    await A.locator('[data-col-tog="2"]').uncheck();
    await A.waitForTimeout(400);
    const columnasDespues = await A.locator('#tabla thead th').evaluateAll(
      (ths) => ths.filter((t) => t.offsetParent !== null).length);
    a.comprobar(columnasDespues === columnasAntes - 1, 'Apagar una la esconde de verdad');

    // Y la elección sobrevive a recargar: si no, no sirve de nada.
    await A.locator('.modal [data-x]').first().click();
    await A.reload({ waitUntil: 'domcontentloaded' });
    await A.waitForSelector('#tabla tbody tr', { timeout: 25000 });
    await A.waitForTimeout(1200);
    const trasRecargar = await A.locator('#tabla thead th').evaluateAll(
      (ths) => ths.filter((t) => t.offsetParent !== null).length);
    a.comprobar(trasRecargar === columnasAntes - 1, 'Y se recuerda para la próxima vez');

    // Se deja como estaba, para no ensuciar la siguiente prueba.
    await A.evaluate(() => localStorage.removeItem('cemColEstudiantes'));
  }

  /* ============ los indicadores dicen qué cuentan ============ */
  await A.goto(`${BASE}/plataforma/admin/index.html`, { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('#kpis .kpi', { timeout: 25000 });
  await A.waitForTimeout(1500);
  a.comprobar(await A.locator('#kpis .kpi').count() === 4,
    'El tablero abre con cuatro cifras, no con ocho');
  a.comprobar(await A.locator('.kpis-mas').count() === 1,
    'Y el resto queda a un clic, plegado');
  a.comprobar(await A.locator('#kpis .ayuda-btn').count() === 4,
    'Cada cifra explica qué está contando');

  await A.locator('.kpis-mas summary').click();
  await A.waitForTimeout(400);
  a.comprobar(await A.locator('.kpis-mas .kpi').count() === 4,
    'Al desplegarlo aparecen los otros cuatro');

  await A.locator('#kpis .ayuda-btn').first().click();
  await A.waitForTimeout(300);
  const globo = await A.locator('.ayuda-globo').textContent().catch(() => '');
  a.comprobar((globo || '').length > 30,
    'El «?» abre su explicación ahí mismo, sin mandarte al manual');

  /* ============ nada de valores crudos de la base ============ */
  const crudos = [];
  for (const pantalla of ['cursos.html', 'cohortes.html', 'inscripciones.html', 'usuarios.html']) {
    await A.goto(`${BASE}/plataforma/admin/${pantalla}`, { waitUntil: 'domcontentloaded' });
    await A.waitForSelector('#page', { timeout: 25000 });
    await A.waitForTimeout(2200);
    /* Los iconos de Material se escriben con su nombre dentro del span
       (add_circle, vital_signs) y la fuente los dibuja: no son texto que nadie
       lea, así que se quitan antes de mirar. */
    const texto = await A.evaluate(() => {
      const copia = document.querySelector('#page').cloneNode(true);
      copia.querySelectorAll('.material-symbols-outlined').forEach((i) => i.remove());
      return copia.textContent;
    });
    // Los valores internos llegan con guion bajo: en_revision, verdadero_falso…
    const encontrados = (texto.match(/\b[a-záéíóúñ]+_[a-záéíóúñ]+\b/g) || []);
    if (encontrados.length) crudos.push(`${pantalla}: ${[...new Set(encontrados)].slice(0, 3).join(', ')}`);
  }
  a.comprobar(crudos.length === 0,
    `Ninguna pantalla muestra los valores tal como los guarda la base ${JSON.stringify(crudos)}`);

  /* ============ el vacío ofrece por dónde empezar ============ */
  await A.goto(`${BASE}/plataforma/admin/cursos.html`, { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('#tabla tbody tr', { timeout: 25000 });
  await A.waitForTimeout(1200);
  await A.fill('#cemGlobalSearch', 'zzzzzznoexiste');
  await A.waitForTimeout(700);
  a.comprobar((await A.locator('#tb .empty').textContent()).length > 20,
    'Un filtro sin resultados explica qué pasó en vez de dejar la tabla en blanco');

  /* ============ ordenar pulsando el encabezado ============ */
  await A.fill('#cemGlobalSearch', '');
  await A.waitForTimeout(700);
  const ordenables = await A.locator('#tabla th.ordenable, #tabla th[data-ord]').count();
  a.comprobar(ordenables >= 4, `Las columnas se pueden ordenar pulsando su título (${ordenables})`);
  if (ordenables) {
    const primero = () => A.locator('#tb tr td').first().textContent();
    const antesDeOrdenar = await primero();
    await A.locator('#tabla th[data-ord]').first().click();
    await A.waitForTimeout(600);
    await A.locator('#tabla th[data-ord]').first().click();   // al revés
    await A.waitForTimeout(600);
    a.comprobar((await primero()) !== antesDeOrdenar || (await A.locator('#tb tr').count()) <= 1,
      'Y ordenar cambia de verdad el orden de las filas');
  }

  a.comprobar(A.errores.length === 0,
    `Ninguna de estas pantallas lanza errores ${JSON.stringify(A.errores.slice(0, 2))}`);
  a.comprobar(M.errores.length === 0,
    `Ni la versión de teléfono ${JSON.stringify(M.errores.slice(0, 2))}`);

  return a;
}
