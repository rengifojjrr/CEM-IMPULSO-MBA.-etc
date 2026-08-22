/* Entrar, salir y recuperar la contraseña.
   Si esto se rompe, nadie puede usar la plataforma. */

import { acta, nuevaPestana, entrar, BASE, CLAVE } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('acceso');
  const P = await nuevaPestana(navegador);

  /* ---- recuperación de contraseña ---- */
  await P.goto(`${BASE}/plataforma/index.html`, { waitUntil: 'domcontentloaded' });
  await P.waitForSelector('#toOlvide', { timeout: 15000 });
  a.comprobar(true, 'La pantalla de entrada ofrece "Olvidé mi contraseña"');

  await P.fill('#email', 'estudiante@cem.demo');
  await P.click('#toOlvide');
  await P.waitForSelector('#cardOlvide:not(.hidden)', { timeout: 8000 });
  a.comprobar((await P.inputValue('#oEmail')) === 'estudiante@cem.demo',
    'Arrastra el correo ya escrito en vez de hacerlo teclear otra vez');

  // La respuesta es la misma exista o no la cuenta: si dijéramos "ese correo no
  // existe" estaríamos regalando qué direcciones están registradas.
  await P.fill('#oEmail', 'nadie-en-absoluto-1729@gmail.com');
  await P.click('#formOlvide button[type=submit]');
  await P.waitForTimeout(3500);
  const respuesta = await P.locator('#olvideMsg').textContent();
  a.comprobar(/ya salió el enlace|carpeta de correo/i.test(respuesta),
    'Con una dirección inexistente responde igual que con una registrada');
  a.comprobar(!/invalid|error|not found/i.test(respuesta),
    'Y nunca filtra el mensaje crudo del proveedor');

  // Una dirección mal escrita ni siquiera sale a la red.
  await P.fill('#oEmail', 'esto-no-es-un-correo');
  const campoValido = await P.locator('#oEmail').evaluate((el) => el.checkValidity());
  let salioPeticion = false;
  const espia = (r) => { if (/auth\/v1\/recover/.test(r.url())) salioPeticion = true; };
  P.on('request', espia);
  await P.click('#formOlvide button[type=submit]');
  await P.waitForTimeout(1200);
  P.off('request', espia);
  a.comprobar(!campoValido && !salioPeticion,
    'Una dirección mal escrita se ataja antes de salir a la red');

  /* ---- la pantalla de clave nueva rechaza un enlace inválido ---- */
  await P.goto(`${BASE}/plataforma/nueva-clave.html`, { waitUntil: 'domcontentloaded' });
  await P.waitForTimeout(4500);
  const aviso = (await P.locator('#sub').textContent()) + (await P.locator('#msg').textContent());
  a.comprobar(/no es válido|caduc/i.test(aviso),
    'Sin un enlace válido avisa en vez de mostrar el formulario');
  a.comprobar(await P.locator('#form').isHidden(),
    'Y no deja escribir una contraseña nueva');

  /* ---- rebote por sesión vencida ---- */
  await P.goto(`${BASE}/plataforma/index.html?motivo=vencida&next=admin/estudiantes.html`,
    { waitUntil: 'domcontentloaded' });
  await P.waitForTimeout(900);
  a.comprobar(/venció por inactividad/i.test(await P.locator('#loginMsg').textContent()),
    'Al rebotar por vencimiento explica por qué');

  /* Y cabe donde va. El aviso estaba metido en un `.chip`, que lleva
     `white-space:nowrap` porque es una etiqueta de estado —«Al día», «3
     cuotas»—. Una frase de setenta y ocho caracteres ahí dentro no se parte:
     se salía de la tarjeta por los dos lados.

     Esta comprobación existía y pasaba en verde con la pantalla rota. Dos
     motivos, y los dos valen para más sitios:

     1 · Buscaba la caja con `closest('.card')`, pero estas tarjetas son
         `.auth-card`, que NO casa con `.card` —son clases distintas, no una
         subcadena—. Al no encontrarla se quedaba con `parentElement`, que es
         el propio contenedor del mensaje: un div que crece con lo que lleva
         dentro. O sea, medía el aviso contra sí mismo, y eso da cero siempre.

     2 · Sólo miraba la tarjeta de entrar. El que se rompió fue el de recuperar
         contraseña, que nadie estaba mirando.

     Ahora se mide contra la tarjeta de verdad, y en las tres pantallas. */
  const cabeEn = (sel) => P.evaluate((s) => {
    const aviso = document.querySelector(s + ' > *');
    const caja = aviso?.closest('.auth-card, .card');
    if (!aviso || !caja) return null;
    const a = aviso.getBoundingClientRect(), c = caja.getBoundingClientRect();
    return { desborde: Math.round(Math.max(0, c.left - a.left) + Math.max(0, a.right - c.right)),
             ancho: Math.round(a.width), caja: Math.round(c.width),
             /* Y que la propia página no se haya ido a lo ancho: un desbordado
                puede caber en su caja y aun así empujar la ventana. */
             pagina: Math.round(document.documentElement.scrollWidth - innerWidth) };
  }, sel);

  const cabe = await cabeEn('#loginMsg');
  a.comprobar(cabe && cabe.desborde === 0 && cabe.pagina <= 0,
    `Y el aviso cabe dentro de la tarjeta, sin asomar por los lados (${
      cabe ? `${cabe.ancho}px en ${cabe.caja}px, desborde ${cabe.desborde}px` : 'no se encontró'})`);

  /* ---- y el de recuperar contraseña, que es el que se salía de verdad ----
     La respuesta lleva dentro el correo que se escribió, así que su largo lo
     decide quien lo teclea: una dirección larga la hace crecer todavía más. */
  await P.goto(`${BASE}/plataforma/index.html`, { waitUntil: 'domcontentloaded' });
  await P.waitForFunction(() => !!document.querySelector('#toOlvide')?.onclick,
    null, { timeout: 30000 });
  await P.click('#toOlvide');
  await P.waitForSelector('#cardOlvide:not(.hidden)', { timeout: 10000 });
  await P.fill('#oEmail', 'una.direccion.larga.de.prueba@correo-de-ejemplo.com');
  await P.click('#formOlvide button[type=submit]');
  await P.waitForFunction(() => document.querySelector('#olvideMsg')?.children.length > 0,
    null, { timeout: 25000 });
  await P.waitForTimeout(500);
  const cabeOlvide = await cabeEn('#olvideMsg');
  a.comprobar(cabeOlvide && cabeOlvide.desborde === 0 && cabeOlvide.pagina <= 0,
    `El aviso de recuperar contraseña también cabe (${
      cabeOlvide ? `${cabeOlvide.ancho}px en ${cabeOlvide.caja}px, desborde ${cabeOlvide.desborde}px, `
        + `página ${cabeOlvide.pagina}px` : 'no se encontró'})`);

  /* Y va en `.nota`, que es de bloque y parte donde toque, no en un chip. */
  a.comprobar(await P.evaluate(() =>
    /\bnota\b/.test(document.querySelector('#olvideMsg > *')?.className || '')),
    'Y va en una nota, no en una píldora que no sabe partir líneas');

  await P.goto(`${BASE}/plataforma/index.html?motivo=vencida&next=admin/estudiantes.html`,
    { waitUntil: 'domcontentloaded' });
  await P.waitForTimeout(900);

  await P.fill('#email', 'admin@cem.demo');
  await P.fill('#pass', CLAVE);
  await P.click('#formLogin button[type=submit]');
  await P.waitForURL(/admin\/estudiantes\.html/, { timeout: 30000, waitUntil: 'domcontentloaded' })
    .catch(() => {});
  a.comprobar(/admin\/estudiantes\.html/.test(P.url()),
    'Tras entrar lo lleva a la pantalla a la que iba');

  /* ---- un destino manipulado no saca a nadie del sitio ---- */
  const Q = await nuevaPestana(navegador);
  await Q.goto(`${BASE}/plataforma/index.html?next=https://ejemplo.invalido/robo`,
    { waitUntil: 'domcontentloaded' });
  await Q.fill('#email', 'estudiante@cem.demo');
  await Q.fill('#pass', CLAVE);
  await Q.click('#formLogin button[type=submit]');
  await Q.waitForTimeout(7000);
  a.comprobar(Q.url().startsWith(BASE) && /estudiante\/panel/.test(Q.url()),
    'Un destino externo en el enlace se ignora');

  /* ---- la campana de avisos ---- */
  await Q.waitForSelector('#cemCampana', { timeout: 20000 });
  await Q.click('#cemCampana');
  await Q.waitForSelector('.modal', { timeout: 10000 });
  a.comprobar((await Q.locator('.modal-b').textContent()).trim().length > 0,
    'La campana abre la lista de avisos de la persona');

  a.comprobar(P.errores.length === 0,
    `La entrada no lanza errores en la consola ${JSON.stringify(P.errores.slice(0, 2))}`);
  a.comprobar(Q.errores.length === 0,
    `El panel del estudiante tampoco ${JSON.stringify(Q.errores.slice(0, 2))}`);

  return a;
}
