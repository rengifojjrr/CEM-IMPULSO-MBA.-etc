/* El registro y el correo de confirmación.
   ==========================================================================
   Tres fallos distintos, los tres invisibles desde dentro:

   1 · Los ocho campos del registro tenían el rótulo sin `for`, sin `name` y sin
       `autocomplete`. Al tocar el rótulo no pasaba nada —y en un teléfono se
       toca el rótulo, que es lo más grande de la fila—, el navegador no ofrecía
       autocompletar, y él mismo lo reportaba como error en la consola.

   2 · Pedía la contraseña una sola vez. Un dedo torcido al escribirla y la
       cuenta queda con una contraseña que nadie sabe, sin forma de enterarse
       hasta el primer intento de entrar.

   3 · El enlace del correo caía en el «Site URL» del proyecto —localhost:3000—
       y quien se registraba acababa en una dirección muerta con la cola del
       error pegada. Eso se arregla en el panel de Supabase, pero la pantalla
       tiene que saber leer la queja y ofrecer otro enlace: un enlace de
       confirmación vale UNA vez, y hay clientes de correo que lo gastan solos.

   No se crea ninguna cuenta: registrarse de verdad manda un correo, gasta el
   límite de envíos del proyecto y deja un usuario en la base de producción.
   Lo que se comprueba es la pantalla y lo que rechaza. */

import { acta, nuevaPestana, BASE } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('registro');
  const R = await nuevaPestana(navegador, { ancho: 1200, alto: 900 });
  await R.goto(`${BASE}/plataforma/index.html?registro=1`, { waitUntil: 'domcontentloaded' });
  await R.waitForSelector('#cardReg:not(.hidden)', { timeout: 30000 });
  await R.waitForTimeout(1200);

  /* ============ 1 · el formulario está bien escrito ============ */
  const forma = await R.evaluate(() => {
    const sinRotulo = [], sinNombre = [], sinTipo = [];
    for (const el of document.querySelectorAll('#formReg input, #formReg select')) {
      if (!(el.labels?.length) && !el.getAttribute('aria-label')) sinRotulo.push(el.id || '(sin id)');
      if (!el.name) sinNombre.push(el.id || '(sin id)');
    }
    for (const b of document.querySelectorAll('button')) {
      if (!b.getAttribute('type')) sinTipo.push(b.id || b.textContent.trim().slice(0, 20));
    }
    return { sinRotulo, sinNombre, sinTipo,
             campos: document.querySelectorAll('#formReg input, #formReg select').length };
  });
  a.comprobar(forma.sinRotulo.length === 0,
    `Cada campo del registro tiene su rótulo asociado, así que al tocarlo enfoca (${
      forma.campos} campos${forma.sinRotulo.length ? ': ' + forma.sinRotulo.join(', ') : ''})`);
  a.comprobar(forma.sinNombre.length === 0,
    `Y su «name», sin el cual el navegador no ofrece autocompletar${
      forma.sinNombre.length ? ': ' + forma.sinNombre.join(', ') : ''}`);
  a.comprobar(forma.sinTipo.length === 0,
    `Ningún botón se queda sin «type»: el valor por omisión es enviar${
      forma.sinTipo.length ? ' — ' + forma.sinTipo.join(', ') : ''}`);

  /* ============ 2 · la contraseña se pide dos veces y se mide ============ */
  a.comprobar(await R.locator('#rPass2').count() === 1,
    'La contraseña se pide dos veces, para que un dedo torcido no deje la cuenta inaccesible');
  a.comprobar(await R.locator('#rPass').getAttribute('minlength') === '8',
    'El mínimo lo pone el código compartido, no un número escrito a mano en el HTML');

  const medidas = [];
  for (const [clave, esperado] of [['abc', 'corta'], ['contrasena', 'debil'],
                                   ['Contrasena1', 'aceptable'], ['CemPrueba2026!', 'fuerte']]) {
    await R.fill('#rPass', clave);
    await R.waitForTimeout(150);
    medidas.push(await R.locator('#rFuerza').getAttribute('data-nivel'));
    a.comprobar(medidas[medidas.length - 1] === esperado,
      `«${clave.replace(/./g, (c, i) => i < 3 ? c : '·')}» se mide como ${esperado} (dio ${
        medidas[medidas.length - 1]})`);
  }

  await R.fill('#rPass2', 'otraCosa123!');
  await R.waitForTimeout(200);
  a.comprobar((await R.locator('#rFuerza').textContent()).includes('no coinciden'),
    'Y avisa de que no coinciden mientras se escribe, no al enviar');

  /* ============ 3 · qué rechaza, y en qué orden ============ */
  /* El orden importa: la casilla de aceptar está al final del formulario, así
     que si se comprueba antes que la contraseña, quien se equivocó al repetirla
     recibe «acepta los datos» y no entiende nada. */
  const queja = async () => (await R.locator('#regMsg').textContent()).trim();
  const enviar = async () => {
    await R.click('#formReg button[type=submit]');
    await R.waitForTimeout(400);
  };

  await enviar();
  a.comprobar((await queja()).includes('nombre'),
    `Sin nombre no deja seguir, y lo dice: «${(await queja()).slice(0, 40)}»`);

  await R.fill('#rNombre', 'Ensayo'); await R.fill('#rApellido', 'Registro');
  await R.fill('#rDoc', 'V-00000000');
  await enviar();
  a.comprobar((await queja()).includes('nacimiento'),
    'Pide la fecha de nacimiento: es lo que dice a qué grupo de edad acompañar a alguien');

  await R.fill('#rNac', '1995-04-12');
  await R.fill('#rEmail', 'esto-no-es-un-correo');
  await enviar();
  a.comprobar((await queja()).toLowerCase().includes('correo'),
    'Rechaza una dirección que no puede recibir nada');

  await R.fill('#rEmail', 'ensayo.registro@cem.invalid');
  await enviar();
  a.comprobar((await queja()).includes('no coinciden'),
    'Con las contraseñas distintas se queja de eso, no de otra cosa');

  await R.fill('#rPass2', 'CemPrueba2026!');
  await enviar();
  a.comprobar((await queja()).toLowerCase().includes('acept'),
    'Y sólo al final pide el consentimiento, que es donde está la casilla');

  a.comprobar(await R.locator('#cardRevisa.hidden').count() === 1,
    'Con algo mal, no se pasa a «revisa tu correo»: no se creó ninguna cuenta');

  /* ============ 4 · la fecha de nacimiento acotada ============ */
  const limites = await R.evaluate(() => {
    const n = document.querySelector('#rNac');
    return { max: n.max, min: n.min };
  });
  const anoMax = Number(String(limites.max).slice(0, 4));
  a.comprobar(anoMax > 1900 && anoMax < new Date().getFullYear(),
    `No se puede nacer mañana: el campo se corta en ${limites.max}`);

  /* ============ 5 · la pantalla de confirmación ============ */
  const casos = [
    ['confirmar.html#error=access_denied&error_code=otp_expired', 'ya no sirve',
     'Un enlace caducado se explica en castellano en vez de dejar la cola pegada'],
    ['confirmar.html', 'correo',
     'Y quien llega de más a esa dirección lee qué tiene que hacer'],
  ];
  for (const [ruta, esperado, texto] of casos) {
    const C = await nuevaPestana(navegador, { ancho: 1100, alto: 800 });
    await C.goto(`${BASE}/plataforma/${ruta}`, { waitUntil: 'domcontentloaded' });
    await C.waitForTimeout(2500);
    const titulo = (await C.locator('#titulo').textContent()).toLowerCase();
    const sub = (await C.locator('#sub').textContent()).toLowerCase();
    a.comprobar(titulo.includes(esperado) || sub.includes(esperado),
      `${texto} («${(await C.locator('#titulo').textContent()).slice(0, 40)}»)`);
    a.comprobar(await C.locator('#formOtro:not(.hidden)').count() === 1,
      'Y ofrece pedir otro enlace, que es la única salida real cuando el anterior se gastó');
    a.comprobar(C.errores.length === 0, `Sin errores en confirmar.html ${JSON.stringify(C.errores.slice(0, 2))}`);
    await C.close();
  }

  /* La raíz también: si el «Site URL» del proyecto sigue apuntando aquí, el
     error cae en la pantalla de entrada y no puede quedarse mudo. */
  const E = await nuevaPestana(navegador, { ancho: 1100, alto: 800 });
  await E.goto(`${BASE}/plataforma/index.html#error=access_denied&error_code=otp_expired`,
    { waitUntil: 'domcontentloaded' });
  await E.waitForTimeout(2500);
  a.comprobar((await E.locator('#loginMsg').textContent()).includes('caduc'),
    'La pantalla de entrada también sabe leer la queja del correo');
  a.comprobar(!E.url().includes('#error'),
    'Y limpia la dirección, para que al recargar no vuelva a salir el mismo aviso');
  await E.close();

  a.comprobar(R.errores.length === 0, `Sin errores ${JSON.stringify(R.errores.slice(0, 2))}`);
  return a;
}
