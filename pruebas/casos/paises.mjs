/* Los países: el campo, la franja de la portada y lo que se enseña de ellos.

   Aquí hay dos cosas que se rompen en silencio y por eso se comprueban de
   verdad, no de lejos:

   1. El campo dejó de ser texto libre. Si un desplegable se queda sin opciones
      —porque la lista no cargó, porque cambió una ruta— la pantalla se ve
      perfecta y guarda el país vacío. Nadie lo nota hasta que alguien pregunta
      de dónde son los estudiantes.

   2. Las pantallas guardan «VE» y tienen que ENSEÑAR «Venezuela». Es el fallo
      típico de migrar a códigos: la base queda impecable y al estudiante le
      sale su país en dos letras. Se mira el texto que se ve, no la variable.

   Y una tercera que no es un fallo sino una promesa: la portada dice en
   cuántos países se da clase, y ese número tiene que salir de la lista que se
   enseña debajo. Si se escriben por separado, el día que se añada un país la
   frase miente. */

import { acta, nuevaPestana, nuevoContexto, entrar, conLaBase, BASE } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('países');

  /* ============ la portada, sin cuenta ============
     Se abre en un contexto limpio: quien llega a la portada no ha entrado, y
     si la franja necesitara sesión funcionaría en las pruebas y no en la
     calle. */
  const anon = await nuevoContexto(navegador);
  const P = await anon.newPage();
  await P.goto(`${BASE}/plataforma/inicio.html`, { waitUntil: 'domcontentloaded' });
  await P.waitForSelector('.pais-tarjeta', { timeout: 25000 });

  const franja = await P.evaluate(() => ({
    tarjetas: document.querySelectorAll('.pais-tarjeta').length,
    conMapa: document.querySelectorAll('.pais-tarjeta svg path').length,
    nombres: [...document.querySelectorAll('.pais-tarjeta .nombre')].map((x) => x.textContent.trim()),
    frase: document.querySelector('#fraseAlcance')?.textContent.trim() || '',
    hayIntro: !!document.querySelector('.pais-intro'),
  }));

  a.comprobar(franja.tarjetas > 0,
    `La portada enseña los países sin necesidad de cuenta (${franja.tarjetas})`);
  a.comprobar(franja.hayIntro, 'Con la tarjeta de la idea delante, en color');
  a.comprobar(franja.conMapa === franja.tarjetas,
    `Cada país lleva su contorno dibujado (${franja.conMapa} de ${franja.tarjetas})`);

  /* El nombre, no el código: es justo lo que se rompe al migrar a códigos. */
  const enCodigo = franja.nombres.filter((n) => /^[A-Z]{2}$/.test(n));
  a.comprobar(enCodigo.length === 0,
    `Los países se leen con su nombre y no en clave${enCodigo.length ? ` (salían: ${enCodigo})` : ''}`);
  a.comprobar(franja.nombres.every((n) => n.length > 2),
    `Ninguna tarjeta se queda sin nombre (${franja.nombres.slice(0, 3).join(', ')}…)`);

  /* La frase y la fila tienen que contar lo mismo. Se compara el número que se
     lee con las tarjetas que hay, que es lo que ve quien entra. */
  const LETRAS = { un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
                   ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 };
  const dicho = franja.frase.match(/en (\w+) pa[íi]s/)?.[1] || '';
  const cuantosDice = LETRAS[dicho] ?? Number(dicho);
  a.comprobar(cuantosDice === franja.tarjetas,
    `«${franja.frase}» cuadra con los ${franja.tarjetas} países de la fila`);

  /* La fila se arrastra de lado: si perdiera el desplazamiento, con nueve
     países se saldrían de la pantalla y no habría forma de llegar al último. */
  const fila = await P.evaluate(() => {
    const f = document.querySelector('#paisesFila');
    return { desborda: f.scrollWidth > f.clientWidth + 4,
             seDesplaza: getComputedStyle(f).overflowX === 'auto' };
  });
  a.comprobar(fila.seDesplaza && fila.desborda,
    'La fila se arrastra de lado en vez de cortar los países de la derecha');

  await anon.close();

  /* ============ el campo del perfil ============ */
  const E = await nuevaPestana(navegador, { ancho: 1400 });
  await entrar(E, 'estudiante', 'estudiante/perfil.html');
  /* Se espera a que la lista tenga opciones, no a que «se vean»: un <option>
     no es un elemento visible y esperarlo así se agota siempre. */
  await E.waitForFunction(() => document.querySelector('#pais')?.options.length > 0,
    null, { timeout: 25000 });

  const campo = await E.evaluate(() => {
    const s = document.querySelector('#pais');
    return {
      esLista: s?.tagName === 'SELECT',
      cuantos: s?.options.length || 0,
      elegido: s?.value || '',
      textoElegido: s?.selectedOptions[0]?.textContent.trim() || '',
      titular: document.querySelector('#titularPerfil')?.textContent.trim() || '',
    };
  });
  a.comprobar(campo.esLista, 'El país del perfil es una lista, no una casilla de texto');
  a.comprobar(campo.cuantos > 200,
    `Con todos los países dentro (${campo.cuantos} opciones)`);
  a.comprobar(/^[A-Z]{2}$/.test(campo.elegido),
    `Lo que guarda es el código del país (${campo.elegido || 'vacío'})`);
  a.comprobar(!/^[A-Z]{2}$/.test(campo.textoElegido) && campo.textoElegido.length > 2,
    `Lo que se lee es el nombre (${campo.textoElegido})`);

  /* La cabecera del perfil enseña el país junto a la ocupación, con su nombre.
     Es la misma cabecera que ve quien abra el enlace público, así que si aquí
     saliera «VE» saldría «VE» en el sitio donde más se nota. */
  a.comprobar(!/\bVE\b|\bCO\b|\bUS\b/.test(campo.titular),
    `El titular del perfil no enseña el país en clave («${campo.titular}»)`);

  /* Que guardar de verdad escribe el código, no el nombre: si se guardara el
     nombre volveríamos al texto libre por la puerta de atrás. */
  await E.selectOption('#pais', 'CO');
  await E.click('#fPerfil button[type=submit]');
  await E.waitForTimeout(1500);
  const guardado = await conLaBase(E, async (sb) => {
    const { data } = await sb.auth.getUser();
    const { data: p } = await sb.from('cem_profiles').select('pais').eq('id', data.user.id).single();
    return p?.pais;
  });
  a.comprobar(guardado === 'CO', `Al guardar queda el código en la base (${guardado})`);

  /* Se deja como estaba: las pruebas no son dueñas de los datos de nadie. */
  if (campo.elegido && campo.elegido !== 'CO') {
    await E.selectOption('#pais', campo.elegido);
    await E.click('#fPerfil button[type=submit]');
    await E.waitForTimeout(1500);
    const vuelto = await conLaBase(E, async (sb) => {
      const { data } = await sb.auth.getUser();
      const { data: p } = await sb.from('cem_profiles').select('pais').eq('id', data.user.id).single();
      return p?.pais;
    });
    a.comprobar(vuelto === campo.elegido,
      `Y la prueba devuelve el país del estudiante a como estaba (${vuelto})`);
  }

  /* ============ traducir lo que se escribió a mano ============
     Se prueba contra el módulo de verdad, cargado por la pantalla, y no contra
     una copia del razonamiento escrita aquí: una prueba que reimplementa lo
     que comprueba pasa siempre. */
  const traduce = await E.evaluate(async () => {
    const m = await import('/plataforma/assets/paises.js?v=2026-08-26-10');
    return {
      usa: m.paisDesdeTexto('usa'),
      venezuela: m.paisDesdeTexto('Venezuela'),
      conTilde: m.paisDesdeTexto('Perú'),
      sinTilde: m.paisDesdeTexto('peru'),
      inventado: m.paisDesdeTexto('Narnia'),
      vacio: m.paisDesdeTexto(''),
      nombre: m.paisNombre('VE'),
      desconocido: m.paisNombre('Narnia'),
    };
  });
  a.comprobar(traduce.usa === 'US' && traduce.venezuela === 'VE',
    'Lo escrito a mano —«usa», «Venezuela»— se traduce a su código');
  a.comprobar(traduce.conTilde === 'PE' && traduce.sinTilde === 'PE',
    'Con tilde y sin tilde son el mismo país');
  a.comprobar(traduce.inventado === '' && traduce.vacio === '',
    'Lo que no se reconoce no se inventa: devuelve vacío');
  a.comprobar(traduce.nombre === 'Venezuela',
    `El código se lee como nombre (VE → ${traduce.nombre})`);
  a.comprobar(traduce.desconocido === 'Narnia',
    'Y un texto viejo que no es código se enseña tal cual, en vez de perderse');

  /* ============ las pantallas de dentro ============
     La lista de estudiantes es donde el código en crudo se vería primero. */
  const A = await nuevaPestana(navegador, { ancho: 1400 });
  await entrar(A, 'admin', 'admin/estudiantes.html');
  /* Se espera a una celda de país CON TEXTO, no a que exista la celda.
     ─────────────────────────────────────────────────────────────────────────
     Ya se corrigió una vez esperando a «alguna fila», porque la de «cargando»
     también era una fila. Esperar a `td[data-col="País"]` tenía el mismo
     problema por detrás: el esqueleto de carga se dibuja con el mismo número
     de columnas y el vigilante de tablas le pone `data-col` igual que a las
     de verdad. Así que la espera se cumplía con el esqueleto y se leían cuatro
     celdas vacías.

     Se notaba sólo en la tanda completa: al correr este caso solo, la pantalla
     carga antes de que nadie mire. Bajo la carga de las 889, el esqueleto
     ganaba la carrera. Una prueba que depende de quién llegue antes no está
     comprobando lo que dice comprobar. */
  await A.waitForFunction(() => {
    const celdas = [...document.querySelectorAll('td[data-col="País"]')];
    return celdas.length > 0
      && !document.querySelector('.esqueleto-fila')
      && celdas.some((t) => t.textContent.trim().length > 0);
  }, null, { timeout: 25000 });
  const columna = await A.evaluate(() => [...document.querySelectorAll('td[data-col="País"]')]
    .map((t) => t.textContent.trim()).filter((t) => t && t !== '—'));
  a.comprobar(columna.length > 0, `La lista de estudiantes trae países (${columna.length})`);
  a.comprobar(columna.every((t) => !/^[A-Z]{2}$/.test(t)),
    `Y los enseña con nombre y bandera (${columna[0] || '—'})`);

  await A.close();
  await E.close();
  return a;
}
