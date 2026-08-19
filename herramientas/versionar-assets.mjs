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
    `|(?:\\.\\.\\/)*(?:\\.\\/)?certificados\\/generador\\.js|generador\\.js` +
  `)(\\?v=[0-9-]+)?`, 'g');

/** Dónde buscar. Los módulos compartidos se importan entre ellos, así que
    también hay que marcar los `import` que hay DENTRO de assets: si sólo se
    marcan los HTML, la página baja el app.js nuevo pero preguntas.js sigue
    pidiendo el viejo y conviven dos copias distintas del mismo módulo. */
const CARPETAS = ['plataforma/**/*.html', 'plataforma/assets/*.js', 'certificados/*.html'];

const argumento = process.argv[2] || '';
const soloRevisar = argumento === '--revisar';
const version = soloRevisar || !argumento
  ? new Date().toISOString().slice(0, 10)
  : argumento;

if (!/^\d{4}-\d{2}-\d{2}$/.test(version)) {
  console.error(`"${version}" no tiene la forma AAAA-MM-DD.`);
  process.exit(1);
}

const paginas = [];
for (const patron of CARPETAS) {
  for await (const p of glob(patron, { cwd: RAIZ })) paginas.push(p);
}
paginas.sort();

const marcas = new Map();   // marca encontrada -> páginas que la usan
const sinMarca = [];
let conCompartidos = 0;
let tocadas = 0;

for (const pagina of paginas) {
  const ruta = join(RAIZ, pagina);
  const original = await readFile(ruta, 'utf8');
  let referencias = 0;

  const nuevo = original.replace(COMPARTIDOS, (_, archivo, marca) => {
    referencias++;
    if (marca) {
      const v = marca.slice(3);
      if (!marcas.has(v)) marcas.set(v, []);
      marcas.get(v).push(pagina);
    } else {
      sinMarca.push(pagina);
    }
    return `${archivo}?v=${version}`;
  });

  if (!referencias) continue;   // una pantalla que no usa los compartidos
  conCompartidos++;
  if (!soloRevisar && nuevo !== original) {
    await writeFile(ruta, nuevo);
    tocadas++;
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
