/* El generador de certificados.

   Tres cosas que se rompieron antes y no queremos que vuelvan a romperse:

   1. El motor vive en UN solo archivo (certificados/generador.js) y lo montan
      dos pantallas distintas. Si alguien toca una y no la otra, se separan.
   2. Los fondos ya no viajan incrustados en la configuración (eran 15 MB por
      abrir la pantalla): están en el almacenamiento y se piden con CORS. Sin
      CORS el lienzo queda "contaminado" y el PDF no se puede exportar — un
      fallo que no se ve hasta el final del proceso.
   3. La generación en tandas paralelas no debe desordenar nada: cada archivo
      conserva su número y cada PDF combinado, una página por estudiante. */

import { acta, nuevaPestana, entrar, BASE } from '../entorno.mjs';

const ALUMNOS = ['Ana Prueba', 'Bruno Prueba', 'Carla Prueba', 'Diego Prueba'];

/** Un valor creíble para cada columna que pidan las plantillas. */
function valorDe(campo, alumno, i) {
  const c = campo.toLowerCase();
  if (/apellido/.test(c)) return alumno.split(' ')[1] || 'Prueba';
  if (/nombre|estudiante|participante/.test(c)) return alumno.split(' ')[0];
  if (/c[eé]dula|documento|identidad|dni/.test(c)) return `V-${10000000 + i * 7}`;
  if (/fecha/.test(c)) return '2026-07-15';
  if (/hora/.test(c)) return '120';
  if (/nota|promedio|calificaci/.test(c)) return '18';
  if (/curso|programa|diplomado/.test(c)) return 'Diplomado de prueba automática';
  return `Prueba ${i + 1}`;
}

export default async function correr(navegador) {
  const a = acta('certificados');

  /* ============ 0) sin cuenta no se emite nada ============ */
  /* Esta pantalla estuvo abierta a cualquiera: con sólo dar con la dirección se
     podían leer los datos de todos los certificados emitidos, emitir uno nuevo
     a nombre de quien fuera o revocar el de un graduado real. */
  const X = await nuevaPestana(navegador);
  await X.goto(`${BASE}/certificados/generar.html`, { waitUntil: 'domcontentloaded' });
  await X.waitForTimeout(4000);
  const puerta = await X.locator('#host').textContent();
  a.comprobar(/[Hh]ay que entrar/.test(puerta),
    'Sin cuenta, el generador no se abre: pide entrar');
  a.comprobar((await X.locator('.panel').count()) === 0,
    'Y no monta ninguno de sus paneles');

  await X.silenciarMientras(async () => {
    // Ni por la puerta de atrás: la propia base rechaza las llamadas.
    const r = await X.evaluate(async () => {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const sb = createClient('https://vajbsfgojtunamhrzrpf.supabase.co',
        'sb_publishable_Xljd7Ep1GxBXSPp5F4A1hg_Qg-iESzl');
      const salida = {};
      for (const f of ['list_cert_certificates', 'list_cert_templates_light',
                       'delete_all_cert_certificates']) {
        const { data, error } = await sb.rpc(f);
        salida[f] = error ? error.code || error.message : `DEVOLVIÓ ${JSON.stringify(data).slice(0, 40)}`;
      }
      return salida;
    });
    a.comprobar(Object.values(r).every((v) => v === '42501'),
      `Y la base rechaza esas llamadas sin sesión ${JSON.stringify(r)}`);
  });

  /* ============ 1) el mismo motor en las dos pantallas ============ */
  const P = await nuevaPestana(navegador, { ancho: 1400, alto: 1200 });
  await entrar(P, 'admin');

  // Cuánto pesa abrir la pantalla, y cuántas veces se baja cada fondo.
  let bytesConfig = 0;
  const descargasFondo = {};
  P.on('response', async (r) => {
    if (/\/rest\/v1\/rpc\/(list_cert_templates_light|get_cert_template)/.test(r.url())) {
      try { bytesConfig += (await r.body()).length; } catch { /* ya se fue */ }
    }
    const m = r.url().match(/\/storage\/v1\/object\/public\/cem-assets\/fondos\/([^?]+)/);
    if (m) descargasFondo[m[1]] = (descargasFondo[m[1]] || 0) + 1;
  });

  await P.goto(`${BASE}/certificados/generar.html`, { waitUntil: 'domcontentloaded' });
  await P.waitForSelector('#appContent', { timeout: 25000 });
  await P.waitForFunction(() => document.querySelectorAll('.plantilla-chip-img').length > 0,
    null, { timeout: 30000 });
  await P.waitForTimeout(3000);

  const panelesPub = await P.locator('.panel').count();
  a.comprobar(panelesPub >= 5,
    `El generador rápido monta sus ${panelesPub} paneles desde el módulo compartido`);
  a.comprobar(/1\. Plantillas/.test(await P.locator('#appContent').textContent()),
    'Con los títulos de siempre');
  a.comprobar(
    (await P.locator('.panel').first().evaluate((el) => getComputedStyle(el).borderRadius)) === '10px',
    'Y con sus estilos propios aplicados');

  const A = await nuevaPestana(navegador, { ancho: 1400, alto: 1200 });
  await entrar(A, 'admin', 'admin/certificados-plantillas.html');
  await A.waitForSelector('#appContent', { timeout: 25000 });
  await A.waitForFunction(() => document.querySelectorAll('.plantilla-chip-img').length > 0,
    null, { timeout: 30000 });
  await A.waitForTimeout(3000);

  a.comprobar((await A.locator('.sidebar').count()) === 1,
    'La pantalla del portal monta el mismo motor y conserva el menú alrededor');

  const controles = (p) => p.evaluate(() => document.querySelectorAll('#appContent [id]').length);
  const [cPub, cPortal] = [await controles(P), await controles(A)];
  a.comprobar(cPub === cPortal && cPub > 300,
    `Las dos pantallas tienen exactamente los mismos controles (${cPub} y ${cPortal})`);

  /* Los iconos del portal son una tipografía de ligaduras: si no carga, en vez
     del símbolo se lee la palabra ("dashboard", "search"). Se mide el ancho
     real, porque a simple vista el HTML es idéntico en los dos casos. */
  const icono = await A.locator('.material-symbols-outlined').first().evaluate((el) => ({
    familia: getComputedStyle(el).fontFamily,
    ancho: el.getBoundingClientRect().width,
  }));
  a.comprobar(/Material Symbols/.test(icono.familia) && icono.ancho < 40,
    `Los iconos cargan como símbolos, no como texto (${icono.ancho.toFixed(0)} px de ancho)`);

  /* ============ 2) los fondos, en el almacenamiento y exportables ============ */
  a.comprobar(bytesConfig < 500 * 1024,
    `Abrir la pantalla baja ${(bytesConfig / 1024).toFixed(0)} kB de configuraciones (antes eran ~15.000 kB)`);

  const fondos = await P.evaluate(() =>
    [...document.querySelectorAll('.plantilla-chip-img')].slice(0, 4).map((i) => ({
      url: i.src.slice(0, 70), cargada: i.complete && i.naturalWidth > 0, cors: i.crossOrigin,
    })));
  a.comprobar(fondos.length > 0 && fondos.every((f) => /^https?:/.test(f.url)),
    'Las miniaturas apuntan al almacenamiento, no traen la imagen incrustada');
  a.comprobar(fondos.every((f) => f.cargada), `Y las ${fondos.length} comprobadas se ven`);
  a.comprobar(fondos.every((f) => f.cors === 'anonymous'),
    'Se piden con CORS, que es lo que permite exportarlas después');

  // La prueba de fuego: dibujar el fondo en un lienzo y exportarlo. Sin CORS
  // esto lanza SecurityError y el PDF sale en blanco.
  const exportacion = await P.evaluate(async () => {
    const url = document.querySelector('.plantilla-chip-img')?.src;
    if (!url) return { error: 'no hay plantillas guardadas' };
    const img = await new Promise((ok, mal) => {
      const i = new Image();
      i.crossOrigin = 'anonymous';
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error('la imagen no cargó'));
      i.src = url;
    }).catch((e) => ({ error: e.message }));
    if (img.error) return img;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    try {
      return { ok: true, kb: c.toDataURL('image/jpeg', 0.7).length / 1024, w: c.width, h: c.height };
    } catch (e) { return { error: 'lienzo contaminado: ' + e.name }; }
  });
  a.comprobar(exportacion.ok, exportacion.ok
    ? `El lienzo se exporta sin problemas (${exportacion.w}×${exportacion.h}, ${exportacion.kb.toFixed(0)} kB)`
    : `No se pudo exportar: ${exportacion.error}`);

  /* ============ 3) una generación de verdad ============ */

  // Primero se pega cualquier cosa para que la tabla muestre sus columnas:
  // son exactamente los campos que piden las plantillas guardadas.
  await P.fill('#pasteData', 'columna\nvalor');
  await P.click('#btnParsePaste');
  await P.waitForTimeout(1000);
  const campos = (await P.locator('#previewTableWrap thead th').allTextContents())
    .map((c) => c.trim()).filter(Boolean);
  a.comprobar(campos.length >= 1,
    `Las plantillas piden ${campos.length} columna(s): ${campos.slice(0, 5).join(', ')}`);

  const tsv = [campos.join('\t')]
    .concat(ALUMNOS.map((n, i) => campos.map((c) => valorDe(c, n, i)).join('\t')))
    .join('\n');
  await P.fill('#pasteData', tsv);
  await P.click('#btnParsePaste');
  await P.waitForTimeout(1200);
  a.comprobar((await P.locator('#previewTableWrap tbody tr').count()) === ALUMNOS.length,
    `Los ${ALUMNOS.length} estudiantes pegados entran en la lista`);

  const disponibles = await P.locator('[data-matrix-tpl]').count();
  a.comprobar(disponibles >= 2, `Hay ${disponibles} plantillas entre las que elegir`);

  /* Sacar una plantilla de la generación y volver a meterla: al volver debe
     quedar asignada a TODOS los estudiantes de una vez. Es el caso normal
     —todos reciben el mismo certificado— y ahorra ir casilla por casilla. */
  const primera = P.locator('[data-matrix-tpl]').first();
  const ti0 = await primera.getAttribute('data-matrix-tpl');
  await primera.uncheck();
  await P.waitForTimeout(700);
  await P.locator(`[data-matrix-tpl="${ti0}"]`).check();
  await P.waitForTimeout(900);
  a.comprobar(
    (await P.locator(`.matrix-wrap tbody input[data-tpl="${ti0}"]:checked`).count()) === ALUMNOS.length,
    'Volver a activar una plantilla la asigna sola a todos los estudiantes');

  // La segunda se marca desde la cabecera de su columna ("todos"), que es el
  // otro camino para lo mismo.
  const ti1 = await P.locator('[data-bulk]').nth(1).getAttribute('data-bulk');
  await P.locator(`[data-bulk="${ti1}"]`).check();
  await P.waitForTimeout(900);

  const marcadas = await P.evaluate(() =>
    document.querySelectorAll('.matrix-wrap tbody input[type=checkbox]:checked').length);
  a.comprobar(marcadas === ALUMNOS.length * 2,
    `Quedan ${marcadas} casillas plantilla×estudiante marcadas para generar`);

  /* La matriz se redibuja entera con cada clic. Antes eso devolvía el scroll
     horizontal al borde izquierdo y había que volver a desplazarse para ver
     las columnas de la derecha en cada marca. */
  const scroll = await P.evaluate(() => {
    const w = document.querySelector('.matrix-wrap');
    if (!w || w.scrollWidth <= w.clientWidth + 40) return { estrecha: true };
    w.scrollLeft = 120;
    const antes = w.scrollLeft;
    document.querySelector('.matrix-wrap tbody input[type=checkbox]').click();
    const despues = document.querySelector('.matrix-wrap').scrollLeft;
    // se deja como estaba
    document.querySelector('.matrix-wrap tbody input[type=checkbox]').click();
    return { antes, despues };
  });
  a.comprobar(scroll.estrecha || scroll.despues === scroll.antes,
    scroll.estrecha
      ? 'La matriz cabe entera en pantalla, no hay scroll que perder'
      : `Marcar una casilla no devuelve la matriz al borde izquierdo (${scroll.antes} → ${scroll.despues})`);

  // Generar. La barra arranca oculta: hay que esperar a que aparezca y sólo
  // entonces a que se oculte, que es cuando terminó de verdad.
  const t0 = Date.now();
  await P.click('#btnGenerar');
  await P.waitForFunction(() => document.getElementById('progressBar')?.style.display === 'block',
    null, { timeout: 30000 });
  await P.waitForFunction(() => document.getElementById('progressBar')?.style.display === 'none',
    null, { timeout: 240000 });
  const segundos = ((Date.now() - t0) / 1000).toFixed(1);
  await P.waitForTimeout(2500);

  const miniaturas = await P.locator('#appContent img[src^="data:image/jpeg"]').count();
  a.comprobar(miniaturas >= ALUMNOS.length * 2,
    `Genera los ${ALUMNOS.length * 2} certificados con su vista previa en ${segundos} s`);

  const repetidoMax = Math.max(0, ...Object.values(descargasFondo));
  a.comprobar(Object.keys(descargasFondo).length > 0 && repetidoMax <= 2,
    `Cada fondo se baja una vez y se reusa en todo el lote (máximo ${repetidoMax} descargas del mismo)`);

  a.comprobar((await P.locator('[data-gen-zip]').count()) >= 1,
    'Ofrece el ZIP con una carpeta por estudiante');

  const combinados = await P.locator('[data-gen-combined]').allTextContents();
  a.comprobar(combinados.length === 2,
    `Y un PDF combinado por plantilla (${combinados.length})`);
  a.comprobar(combinados.length > 0 && combinados.every((t) => t.includes(`(${ALUMNOS.length} pág`)),
    `Cada combinado trae una página por estudiante: ${combinados.join(' | ').slice(0, 80)}`);

  /* Lo que demuestra que el paralelismo no desordenó nada: dentro de cada
     estudiante los archivos van numerados en el orden de las plantillas. */
  const numerados = await P.evaluate(() =>
    [...document.querySelectorAll('a[download], [data-gen-file]')]
      .map((el) => el.getAttribute('download') || el.textContent)
      .filter((t) => t && /\b0[12][_ ]/.test(t)).length);
  a.comprobar(numerados > 0 || /\b01[_ ]/.test(await P.locator('#appContent').textContent()),
    'Los archivos conservan su numeración de orden dentro de cada estudiante');

  /* ============ 4) la verificación pública ============ */
  const V = await nuevaPestana(navegador);
  await V.goto(`${BASE}/certificados/verificar.html`, { waitUntil: 'domcontentloaded' });
  await V.waitForTimeout(2500);
  a.comprobar(/[Ff]alta el código/.test(await V.locator('#card').textContent()),
    'La página de verificación sin código lo dice, no se queda en blanco');

  // Un código con la forma correcta pero que no existe: el que traería un
  // diploma falsificado. Se comprueba contra la base, no contra el QR.
  await V.goto(`${BASE}/certificados/verificar.html?c=00000000-0000-0000-0000-000000000000`,
    { waitUntil: 'domcontentloaded' });
  await V.waitForTimeout(4000);
  const respuesta = await V.locator('#card').textContent();
  a.comprobar(/no (se )?(encontr|existe)/i.test(respuesta),
    'Un código inventado no verifica nada');
  a.comprobar(!/undefined|null|PGRST|JWT/i.test(respuesta),
    'Y lo dice en castellano, sin filtrar el error crudo');

  a.comprobar(P.errores.length === 0,
    `El generador no lanza errores ${JSON.stringify(P.errores.slice(0, 2))}`);
  a.comprobar(A.errores.length === 0,
    `La pantalla del portal tampoco ${JSON.stringify(A.errores.slice(0, 2))}`);
  a.comprobar(V.errores.length === 0,
    `Ni la verificación pública ${JSON.stringify(V.errores.slice(0, 2))}`);
  a.comprobar(X.errores.length === 0,
    `Ni la pantalla que pide entrar ${JSON.stringify(X.errores.slice(0, 2))}`);

  return a;
}
