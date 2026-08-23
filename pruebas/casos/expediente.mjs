/* El expediente del estudiante y su perfil público.

   Son las dos caras de la misma información: una hacia dentro, con todo, para
   quien atiende; otra hacia fuera, con lo que el graduado autorizó, para quien
   escanea su título.

   Lo que más importa comprobar aquí no es que se vea bonito, sino dos cosas
   que si se rompen se rompen en silencio: que el perfil público NO deje
   escapar datos personales, y que un certificado anulado siga apareciendo en
   la verificación diciendo que fue anulado —y no como «no existe», que es lo
   que hacía antes y sugiere que el papel es falso. */

import { acta, nuevaPestana, nuevoContexto, entrar, conLaBase, BASE, CUENTAS } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('expediente');

  /* ============ el estudiante publica lo suyo ============ */
  const E = await nuevaPestana(navegador, { ancho: 1400 });
  await entrar(E, 'estudiante', 'estudiante/perfil.html');
  await E.waitForSelector('#btnPublicar, #btnDespublicar', { timeout: 25000 });

  a.comprobar(true, 'El estudiante tiene dónde publicar o retirar su perfil');

  /* ============ la pantalla abre por la persona, no por el formulario ======
     Esto era el fallo: «Mi perfil» empezaba con los campos de la cédula y la
     foto estaba cuatro tarjetas más abajo. Se podía corregir un dato y no
     reconocerse. Se comprueba el ORDEN, no que los trozos existan: existir ya
     existían, sueltos y donde nadie los veía. */
  const cabeza = await E.evaluate(() => {
    const primera = document.querySelector('#page > .card');
    return {
      esLaCabecera: !!primera?.classList.contains('perfil-cabeza'),
      nombre: document.querySelector('#nombreGrande')?.textContent.trim() || '',
      hayPortada: !!document.querySelector('#portada'),
      fotoTocable: document.querySelector('#miFoto')?.tagName === 'BUTTON',
      cifras: [...document.querySelectorAll('#cifrasPerfil b')].map((x) => x.textContent),
      compartirArriba: !!document.querySelector('#manosPerfil #btnCompartir'),
    };
  });
  a.comprobar(cabeza.esLaCabecera,
    'La pantalla abre con la cabecera del perfil, no con el formulario de la cédula');
  a.comprobar(cabeza.nombre.length > 0, `Con el nombre a tamaño de nombre (${cabeza.nombre})`);
  a.comprobar(cabeza.hayPortada, 'Con su portada');
  a.comprobar(cabeza.fotoTocable,
    'Y la foto se cambia tocándola, sin ir a buscar el botón a otra tarjeta');
  a.comprobar(cabeza.cifras.length === 3,
    `Con las cifras que mira quien va a contratar (${cabeza.cifras.join(' · ')})`);
  a.comprobar(cabeza.compartirArriba,
    'Compartir está arriba, en la cabecera: es a lo que se viene');

  /* ============ compartir sin haber publicado ============
     El enlace existe antes de publicar, pero le enseña al otro un «este perfil
     no está publicado». Repartir eso es peor que no tener botón. */
  await conLaBase(E, async (sb) => sb.rpc('cem_publicar_perfil', { p_publicar: false, p_muestra: null }));
  await E.reload({ waitUntil: 'domcontentloaded' });
  await E.waitForSelector('#btnCompartir', { timeout: 25000 });
  await E.waitForTimeout(800);
  await E.click('#btnCompartir');
  await E.waitForTimeout(900);
  a.comprobar(await E.locator('#pubYa').count() === 1,
    'Compartir sin haber publicado ofrece publicarlo primero, en vez de repartir un enlace roto');
  const aviso = await E.locator('.modal').innerText().catch(() => '');
  a.comprobar(/nunca tu c[ée]dula/i.test(aviso),
    'Y dice qué se va a ver ANTES de publicar, no después');
  await E.locator('.modal [data-x]').last().click();   // la aspa y «Ahora no» llevan la misma marca
  await E.waitForTimeout(500);

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

  /* ============ la misma cabecera que ve quien publica ============
     Si aquí saliera otra cosa, nadie podría comprobar qué está enseñando sin
     pedirle el enlace a un tercero. */
  const cabezaPub = await Pub.evaluate(() => ({
    esLaCabecera: !!document.querySelector('.perfil-cabeza'),
    hayPortada: !!document.querySelector('.perfil-portada'),
    cifras: [...document.querySelectorAll('.perfil-cifras b')].map((x) => x.textContent),
    compartir: !!document.querySelector('#btnCompartir'),
  }));
  a.comprobar(cabezaPub.esLaCabecera && cabezaPub.hayPortada,
    'Quien abre el enlace ve la misma cabecera que la persona tiene delante');
  a.comprobar(cabezaPub.cifras.length === 3,
    `Con las mismas cifras (${cabezaPub.cifras.join(' · ')})`);
  a.comprobar(cabezaPub.compartir,
    'Y puede volver a repartirlo, que es como un perfil llega lejos');

  /* ============ la ocupación no se publica sola ============
     Se preguntó al registrarse para saber quién estudia aquí. Publicarla sin
     avisar sería usar para una cosa un dato que se dio para otra. Se comprueba
     en las dos direcciones: apagada NO sale, encendida SÍ. Con sólo la primera
     mitad, un campo que no se guardara nunca también pasaría la prueba. */
  const OFICIO = 'Fotógrafa de prueba automática';
  const antes = await conLaBase(E, async (sb, oficio) => {
    const { data: yo } = await sb.from('cem_profiles').select('id,ocupacion,perfil_muestra')
      .eq('email', CUENTAS.estudiante).single();
    await sb.from('cem_profiles').update({ ocupacion: oficio }).eq('id', yo.id);
    return { id: yo.id, ocupacion: yo.ocupacion, muestra: yo.perfil_muestra };
  }, OFICIO);

  await conLaBase(E, async (sb, m) => sb.rpc('cem_publicar_perfil',
    { p_publicar: true, p_muestra: { ...(m || {}), ocupacion: false } }), antes.muestra);
  await Pub.reload({ waitUntil: 'domcontentloaded' });
  await Pub.waitForTimeout(1500);
  const apagada = await Pub.evaluate(() => document.body.innerText);
  a.comprobar(!apagada.includes(OFICIO),
    'Con la ocupación apagada, el perfil público no la enseña');

  await conLaBase(E, async (sb, m) => sb.rpc('cem_publicar_perfil',
    { p_publicar: true, p_muestra: { ...(m || {}), ocupacion: true } }), antes.muestra);
  await Pub.reload({ waitUntil: 'domcontentloaded' });
  await Pub.waitForTimeout(1500);
  const encendida = await Pub.evaluate(() => document.body.innerText);
  a.comprobar(encendida.includes(OFICIO),
    'Y encendiéndola sí, que es lo que hace que la primera mitad de esto valga algo');

  /* ============ y el interruptor de los programas hace algo ============
     Se podía apagar y el nombre del programa seguía saliendo debajo de cada
     título: nadie leía esa opción. Un ajuste de privacidad que no hace nada es
     peor que no tenerlo, porque la persona cree que apagó algo. */
  const mirarProgramas = (encendido) => conLaBase(E, async (sb, x) => {
    await sb.rpc('cem_publicar_perfil',
      { p_publicar: true, p_muestra: { ...(x.muestra || {}), programas: x.encendido } });
    const { data: yo } = await sb.from('cem_profiles').select('perfil_slug')
      .eq('email', CUENTAS.estudiante).single();
    const { data } = await sb.rpc('cem_perfil_publico', { p_slug: yo.perfil_slug });
    const certs = data?.certificados || [];
    return { titulos: certs.length, conNombre: certs.filter((c) => c.programa).length };
  }, { muestra: antes.muestra, encendido });

  const conProgramas = await mirarProgramas(true);
  const sinProgramas = await mirarProgramas(false);
  /* Sin un título vigente las dos mitades darían cero y la comprobación pasaría
     sin haber comprobado nada. Se dice antes, para que si algún día vuelve a
     pasar se sepa que el problema son los datos y no el interruptor. */
  a.comprobar(conProgramas.titulos > 0,
    `Hay un título vigente con el que probar el interruptor (${conProgramas.titulos})`);
  a.comprobar(conProgramas.conNombre > 0 && sinProgramas.conNombre === 0,
    `Apagar «los programas que cursé» los apaga de verdad (encendido ${
      conProgramas.conNombre}, apagado ${sinProgramas.conNombre})`);

  // Devolver la ocupación y las opciones a como estaban.
  await conLaBase(E, async (sb, x) => {
    await sb.from('cem_profiles').update({ ocupacion: x.ocupacion }).eq('id', x.id);
    await sb.rpc('cem_publicar_perfil', { p_publicar: true, p_muestra: x.muestra || null });
  }, antes);

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

    /* Y se deja como estaba.
       ───────────────────────────────────────────────────────────────────────
       Esto no lo hacía, y el resultado era que el único título de la escuela
       llevaba meses anulado «por prueba automática»: nulo para quien lo
       verificara, y encima dejaba sin poder comprobarse todo lo que necesita
       un título vigente —esta misma prueba lo descubrió al mirar el
       interruptor de los programas y encontrarse cero certificados—.

       Una prueba que escribe en la base de verdad tiene que devolverla como
       estaba, sin excepciones. */
    const devuelto = await conLaBase(A, async (sb, cod) => {
      const { error } = await sb.from('cem_certificates')
        .update({ anulado_en: null, anulado_por: null, anulado_motivo: null })
        .eq('codigo', cod);
      return error ? error.message : null;
    }, codigo);
    a.comprobar(!devuelto, `El título vuelve a estar vigente al terminar ${devuelto || ''}`);
    const vigenteOtraVez = await conLaBase(A, async (sb, cod) => {
      const { data } = await sb.from('cem_certificates')
        .select('anulado_en').eq('codigo', cod).single();
      return data?.anulado_en === null;
    }, codigo);
    a.comprobar(vigenteOtraVez === true,
      'Y se comprueba, que es la diferencia entre limpiar y creer que se limpió');
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
