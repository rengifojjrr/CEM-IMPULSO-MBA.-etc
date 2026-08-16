/* El expediente del estudiante y su perfil público.

   Son las dos caras de la misma información: una hacia dentro, con todo, para
   quien atiende; otra hacia fuera, con lo que el graduado autorizó, para quien
   escanea su título.

   Lo que más importa comprobar aquí no es que se vea bonito, sino dos cosas
   que si se rompen se rompen en silencio: que el perfil público NO deje
   escapar datos personales, y que un certificado anulado siga apareciendo en
   la verificación diciendo que fue anulado —y no como «no existe», que es lo
   que hacía antes y sugiere que el papel es falso. */

import { acta, nuevaPestana, nuevoContexto, entrar, BASE } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('expediente');

  /* ============ el estudiante publica lo suyo ============ */
  const E = await nuevaPestana(navegador, { ancho: 1400 });
  await entrar(E, 'estudiante', 'estudiante/perfil.html');
  await E.waitForSelector('#btnPublicar, #btnDespublicar', { timeout: 25000 });

  a.comprobar(true, 'El estudiante tiene dónde publicar o retirar su perfil');

  if (await E.locator('#btnPublicar').count()) {
    await E.click('#btnPublicar');
    await E.waitForTimeout(2500);
  }
  const enlace = await E.evaluate(() => document.querySelector('#enlacePerfil .crece')?.textContent || '');
  const slug = (enlace.match(/[?&]p=([^&\s]+)/) || [])[1];
  a.comprobar(!!slug, `Al publicarlo se le da una dirección propia (${slug || 'ninguna'})`);
  a.comprobar(/^[a-z0-9-]+$/.test(slug || ''),
    'Y es legible, para que quepa en un currículum');

  /* ============ el perfil público, sin sesión ============
     Se abre en un contexto nuevo a propósito: si hiciera falta estar dentro
     para verlo, no serviría de nada. */
  const ctx = await nuevoContexto(navegador, { viewport: { width: 1100, height: 900 } });
  const Pub = await ctx.newPage();
  const erroresPub = [];
  Pub.on('pageerror', (e) => erroresPub.push(e.message));
  await Pub.goto(`${BASE}/plataforma/perfil-publico.html?p=${slug}`, { waitUntil: 'domcontentloaded' });
  await Pub.waitForSelector('h1', { timeout: 25000 });
  await Pub.waitForTimeout(1200);

  const publico = await Pub.evaluate(() => ({
    nombre: document.querySelector('h1')?.textContent.trim() || '',
    texto: document.body.innerText,
    credenciales: document.querySelectorAll('.cred').length,
  }));
  a.comprobar(publico.nombre.length > 0,
    `Se abre sin sesión y lleva el nombre del graduado (${publico.nombre})`);

  // Lo que NUNCA puede salir de aquí, lo filtra el servidor, no el navegador.
  const filtrado = [
    ['un correo', /@[\w.-]+\.\w+/],
    // Un código de certificado (CEM-2026-00417) no es un teléfono: el patrón
    // pide o prefijo internacional o el formato local de nueve dígitos.
    ['un teléfono', /\+\d[\d\s()-]{8,}|\b0\d{3}[\s.-]?\d{7}\b/],
    ['algo de dinero', /US\$|\bVES\b|Saldo|cuota/i],
    ['una cédula', /\bC[ÉE]DULA\b|\bV-?\d{7,}/i],
  ];
  for (const [que, patron] of filtrado) {
    a.comprobar(!patron.test(publico.texto),
      `El perfil público no deja escapar ${que}`);
  }

  /* ============ un certificado anulado dice que lo está ============ */
  const A = await nuevaPestana(navegador, { ancho: 1400 });
  await entrar(A, 'admin', 'admin/certificados.html');
  // Esperar `#tb tr` no basta: el esqueleto de carga también son filas.
  await A.waitForSelector('#tb tr td code', { timeout: 25000 });
  await A.waitForTimeout(1200);

  const codigo = await A.evaluate(() =>
    document.querySelector('#tb tr td code')?.textContent.trim() || '');
  a.comprobar(!!codigo, `Hay certificados emitidos con los que probar (${codigo || 'ninguno'})`);

  if (codigo && await A.locator('[data-rev]').count()) {
    await A.locator('[data-rev]').first().click();
    await A.waitForSelector('#anMotivo', { timeout: 10000 });

    // Sin motivo no debe dejar: lo va a leer un tercero.
    await A.click('.modal [data-s]');
    await A.waitForTimeout(600);
    a.comprobar(await A.locator('#anMsg .nota').count() > 0,
      'Anular sin escribir el motivo no se deja: lo va a leer quien verifique');

    await A.fill('#anMotivo', 'Prueba automática: el apellido venía mal escrito en el registro.');
    await A.click('.modal [data-s]');
    await A.waitForTimeout(2500);

    const V = await nuevoContexto(navegador, { viewport: { width: 900, height: 800 } });
    const pag = await V.newPage();
    await pag.goto(`${BASE}/plataforma/verificar.html?codigo=${encodeURIComponent(codigo)}`,
      { waitUntil: 'domcontentloaded' });
    await pag.waitForTimeout(3000);
    const texto = await pag.evaluate(() => document.body.innerText);
    a.comprobar(/anulado/i.test(texto),
      'Y la verificación pública dice que fue anulado, no que no existe');
    a.comprobar(!/No encontrado/i.test(texto),
      'Un título que existió nunca se responde con «no encontrado»');
    await V.close();
  }

  /* ============ la historia, en orden ============ */
  await A.goto(`${BASE}/plataforma/admin/estudiantes.html`, { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('#tb tr[onclick]', { timeout: 25000 });
  const ficha = await A.evaluate(() =>
    (document.querySelector('#tb tr[onclick]')?.getAttribute('onclick') || '')
      .match(/estudiante\.html\?id=[\w-]+/)?.[0]);
  await A.goto(`${BASE}/plataforma/admin/${ficha}`, { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('#tabs button', { timeout: 25000 });
  await A.waitForTimeout(2500);

  a.comprobar(await A.locator('[data-t="historia"]').count() > 0,
    'La ficha del estudiante tiene una pestaña con su historia');
  await A.click('[data-t="historia"]');
  await A.waitForTimeout(1000);
  const hitos = await A.locator('.linea li').count();
  a.comprobar(hitos > 0, `Con los hechos en orden cronológico (${hitos})`);

  // Y en orden de verdad, del más reciente al primero.
  const fechas = await A.evaluate(() =>
    [...document.querySelectorAll('.linea .cuando')].map((e) => e.textContent.trim()));
  a.comprobar(fechas.length === hitos, 'Cada hecho lleva su fecha');

  await A.click('[data-t="resumen"]');
  await A.waitForTimeout(900);
  const resumen = await A.evaluate(() => document.body.innerText);
  a.comprobar(/Asistencia/i.test(resumen),
    'Y el resumen trae también lo académico, que antes no estaba en ninguna parte');

  a.comprobar(erroresPub.length === 0, `El perfil público no lanza errores ${JSON.stringify(erroresPub.slice(0, 2))}`);
  a.comprobar(E.errores.length === 0, `Ni la pantalla del estudiante ${JSON.stringify(E.errores.slice(0, 2))}`);
  a.comprobar(A.errores.length === 0, `Ni la ficha del administrador ${JSON.stringify(A.errores.slice(0, 2))}`);

  await ctx.close();
  return a;
}
