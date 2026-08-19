#!/usr/bin/env node
/* Pone (o actualiza) la marca de versión de los archivos compartidos.
 *
 * El problema que resuelve: `assets/app.js` y `assets/styles.css` los usan las
 * 49 pantallas. Al publicar un cambio, el navegador de quien ya entró antes
 * sigue usando la copia vieja que tiene guardada hasta que se le ocurra
 * revalidarla — y mientras tanto ve una plataforma a medio actualizar, con
 * errores que no existen en el servidor. Añadirle `?v=…` a la dirección la
 * convierte en otra dirección: el navegador no tiene nada guardado para ella y
 * la baja de nuevo. Sin esa marca no hay forma de forzarlo, porque el sitio se
 * publica como archivos estáticos y no hay paso de compilación que renombre
 * nada.
 *
 *   node herramientas/versionar-assets.mjs          marca con la fecha de hoy
 *   node herramientas/versionar-assets.mjs 2026-09-01   con una fecha concreta
 *   node herramientas/versionar-assets.mjs --revisar    sólo comprueba
 *
 * `--revisar` no toca nada: devuelve código 1 si alguna pantalla quedó con una
 * marca distinta a las demás (o sin marca). Es lo que corre la revisión
 * automática al subir cambios, para que no se publique media plataforma
 * apuntando a la versión nueva y la otra media a la vieja.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { glob } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Los archivos compartidos que hay que marcar, tal como se escriben en el HTML:
 * el cliente y los estilos que usan las 49 pantallas del portal, y el motor del
 * generador de certificados, que comparten dos pantallas.
 *
 * Sólo cuenta si viene justo detrás de una comilla o un paréntesis, o sea si es
 * de verdad la dirección de un `import`, un `href` o un `src`. Si no, el mismo
 * nombre escrito de pasada dentro de un comentario también terminaría con un
 * `?v=…` pegado. */
/* Todos los módulos que se comparten entre pantallas. Que falte uno no da
   error: da algo peor. La marca se sube en los que están en esta lista y el que
   falta se queda con la vieja, así que el navegador baja el app.js nuevo y
   sigue usando el graficos.js de antes — dos versiones conviviendo, que es
   justo lo que esta herramienta existe para impedir. Y `--revisar` tampoco lo
   ve, porque mira con esta misma lista. */
const MODULOS = 'app|temas|aula|preguntas|apariencia|graficos|reproductor';
const COMPARTIDOS = new RegExp(
  `(?<=["'(])(` +
    // desde una pantalla: ../assets/app.js, ./assets/styles.css
    `(?:\\.\\.\\/)*(?:\\.\\/)?assets\\/(?:${MODULOS})\\.js` +
    `|(?:\\.\\.\\/)*(?:\\.\\/)?assets\\/styles\\.css` +
    // desde dentro de assets, donde son vecinos: ./app.js
    `|\\.\\/(?:${MODULOS})\\.js` +
    // desde las pruebas, que hablan con el navegador en absoluto
    `|\\/plataforma\\/assets\\/(?:${MODULOS})\\.js` +
    `|(?:\\.\\.\\/)*(?:\\.\\/)?certificados\\/generador\\.js|generador\\.js` +
  `)(\\?v=[0-9-]+)?`, 'g');

/** Dónde buscar. Los módulos compartidos se importan entre ellos, así que
    también hay que marcar los `import` que hay DENTRO de assets: si sólo se
    marcan los HTML, la página baja el app.js nuevo pero preguntas.js sigue
    pidiendo el viejo y conviven dos copias distintas del mismo módulo.

    Las pruebas van también. Hacen `import('/plataforma/assets/app.js?v=…')`
    dentro del navegador para hablar con la base con la sesión que ya hay
    abierta, y eso sólo funciona si piden EXACTAMENTE la misma dirección que
    pidió la pantalla: con una marca distinta el navegador carga un segundo
    módulo, con su propio cliente, y la prueba deja de mirar lo que mira el
    usuario sin que nada falle a la vista. */
const CARPETAS = [
  'plataforma/**/*.html', 'plataforma/assets/*.js', 'certificados/*.html',
  'pruebas/*.mjs', 'pruebas/casos/*.mjs',
];

const argumento = process.argv[2] || '';
const soloRevisar = argumento === '--revisar';

const paginas = [];
for (const patron of CARPETAS) {
  for await (const p of glob(patron, { cwd: RAIZ })) paginas.push(p);
}
paginas.sort();

/* Primero se LEE todo, y después se decide la marca. Al revés no se puede:
   para elegir una marca que sirva hay que saber cuál está puesta. */
const marcas = new Map();   // marca encontrada -> páginas que la usan
const sinMarca = [];
const archivos = [];
for (const pagina of paginas) {
  const ruta = join(RAIZ, pagina);
  const original = await readFile(ruta, 'utf8');
  let referencias = 0;
  for (const trozo of original.matchAll(COMPARTIDOS)) {
    referencias++;
    const marca = trozo[2];
    if (marca) {
      const v = marca.slice(3);
      if (!marcas.has(v)) marcas.set(v, []);
      marcas.get(v).push(pagina);
    } else {
      sinMarca.push(pagina);
    }
  }
  if (referencias) archivos.push({ ruta, original });   // el resto no usa los compartidos
}
const conCompartidos = archivos.length;

/* La marca es la fecha de hoy, pero tiene que ser distinta de la que ya está o
   no sirve para nada: publicar dos veces el mismo día dejaba la misma dirección
   y el navegador se quedaba tan tranquilo con la copia vieja — que es
   exactamente lo que esta herramienta viene a impedir. Cuando la fecha ya está
   usada se le añade un contador: 2026-08-19-2.

   Y nunca se retrocede: si la marca puesta es de una fecha posterior a hoy
   —porque se marcó a mano, o porque el reloj de la máquina va atrasado—, se
   parte de ella. Una marca «más vieja» funcionaría igual, pero leer el
   historial al revés confunde a cualquiera. */
function marcaLibre() {
  const hoy = new Date().toISOString().slice(0, 10);
  const puestas = [...marcas.keys()].sort();
  const mayor = (puestas[puestas.length - 1] || '').slice(0, 10);
  const base = mayor > hoy ? mayor : hoy;
  const usadas = new Set(puestas);
  if (!usadas.has(base)) return base;
  for (let n = 2; n < 1000; n++) if (!usadas.has(`${base}-${n}`)) return `${base}-${n}`;
  return `${base}-${Date.now() % 100000}`;
}

const version = soloRevisar ? '' : (argumento || marcaLibre());

if (!soloRevisar && !/^\d{4}-\d{2}-\d{2}(-\d+)?$/.test(version)) {
  console.error(`"${version}" no tiene la forma AAAA-MM-DD (o AAAA-MM-DD-N).`);
  process.exit(1);
}

let tocadas = 0;
if (!soloRevisar) {
  for (const { ruta, original } of archivos) {
    const nuevo = original.replace(COMPARTIDOS, (_, archivo) => `${archivo}?v=${version}`);
    if (nuevo !== original) { await writeFile(ruta, nuevo); tocadas++; }
  }
}

if (soloRevisar) {
  const problemas = [];
  if (sinMarca.length) {
    problemas.push(`Sin marca de versión: ${[...new Set(sinMarca)].join(', ')}`);
  }
  if (marcas.size > 1) {
    problemas.push('Conviven varias marcas de versión:\n' +
      [...marcas].map(([v, ps]) => `    ${v} → ${[...new Set(ps)].length} pantalla(s)`).join('\n'));
  }
  if (problemas.length) {
    console.error('✗ Los archivos compartidos no están versionados igual en todas las pantallas.');
    problemas.forEach((p) => console.error('  ' + p));
    console.error('\n  Se arregla con: node herramientas/versionar-assets.mjs');
    process.exit(1);
  }
  console.log(`✓ Las ${conCompartidos} pantallas que usan los archivos compartidos ` +
    `apuntan todas a la misma versión (${[...marcas.keys()][0]}).`);
  process.exit(0);
}

console.log(`✓ ${tocadas} de ${conCompartidos} pantalla(s) actualizadas a la versión ${version}` +
  `${tocadas < conCompartidos ? '; el resto ya estaba' : ''}.`);
console.log('\n  Subí este cambio junto con el de assets/: si se publica la marca nueva');
console.log('  sin el archivo nuevo, el navegador baja el viejo y lo vuelve a guardar.');
