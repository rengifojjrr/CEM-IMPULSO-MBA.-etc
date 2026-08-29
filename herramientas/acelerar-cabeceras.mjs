#!/usr/bin/env node
/* Ordenar la cabecera de todas las pantallas para que pinten antes.
   ═══════════════════════════════════════════════════════════════════════════
   Ninguna pantalla de esta plataforma dibuja nada hasta que `mount()` destapa
   `#page`, y `mount()` no corre hasta que el navegador ha bajado, por este
   orden: dos hojas de fuentes de Google, 216 KB de estilos, 188 KB de guion, y
   la librería de base de datos desde un CDN de fuera. Cuatro servidores
   distintos, uno detrás de otro. En un teléfono con datos móviles eso son
   segundos de pantalla en blanco, y la pantalla en blanco es donde se pierde
   la gente que no os conoce todavía.

   No se puede quitar ninguna de las cuatro cosas sin reescribir la casa. Lo
   que sí se puede es dejar de hacerlas EN FILA. Esta herramienta pone al
   principio de cada cabecera:

     · preconnect a los cuatro dominios de fuera. Abre DNS + TLS con cada uno
       en paralelo, mientras el navegador todavía está leyendo el HTML. El de
       fonts.gstatic.com ya estaba, pero DESPUÉS de la hoja que dispara la
       descarga —o sea, llegando tarde a su propia fiesta—, así que también se
       reordena.

     · modulepreload de app.js. Sin esto el navegador no sabe que existe hasta
       que termina de leer el HTML y llega al <script type="module"> del final.
       Con esto empieza a bajarlo a la vez que los estilos.

   Es idempotente: se puede correr las veces que haga falta. Y es una
   herramienta y no un parche escrito a mano porque son 79 pantallas, y 79
   sitios donde olvidarse es 79 sitios donde se olvidará.

   Uso:  node herramientas/acelerar-cabeceras.mjs           (aplica)
         node herramientas/acelerar-cabeceras.mjs --mirar   (sólo dice qué haría)
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SOLO_MIRAR = process.argv.includes('--mirar');

/* El proyecto de Supabase. Está escrito en app.js y aquí se repite porque el
   preconnect va en el HTML, que no puede importar nada. Si algún día cambia,
   `revisar.mjs` cazará la diferencia: comprueba que la URL del proyecto sea la
   misma en todo el repositorio. */
const SUPABASE = 'https://vajbsfgojtunamhrzrpf.supabase.co';

const DOMINIOS = [
  ['https://fonts.googleapis.com', false],
  ['https://fonts.gstatic.com', true],
  ['https://esm.sh', true],
  [SUPABASE, true],
];

function htmls(dir, acc = []) {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.git') continue;
    const p = join(dir, nombre);
    if (statSync(p).isDirectory()) htmls(p, acc);
    else if (nombre.endsWith('.html')) acc.push(p);
  }
  return acc;
}

let tocados = 0, saltados = 0;

for (const archivo of htmls(RAIZ)) {
  const antes = readFileSync(archivo, 'utf8');

  /* Las páginas de /programas/ NO. Las escribe herramientas/generar-seo.mjs
     cada noche desde su propia plantilla, así que tocarlas aquí dura hasta la
     madrugada siguiente —y eso pasó de verdad: el arreglo se aplicó, el reloj
     regeneró, y a la mañana estaba deshecho—. Lo que se genera se arregla en
     el generador, que ya lleva el mismo orden de preconnect.

     Y hay otra razón para no tocarlas: no cargan app.js. Ponerles el
     modulepreload y los preconnect de esm.sh y Supabase sería pedirle al
     navegador que abra tres conexiones que esa página no va a usar. */
  if (archivo.includes('/programas/')) { saltados++; continue; }

  /* Del resto, sólo pantallas de la casa: las que cargan nuestros estilos. */
  const hojaEstilos = antes.match(/<link rel="stylesheet" href="([^"]*assets\/styles\.css[^"]*)">/);
  if (!hojaEstilos) { saltados++; continue; }

  let t = antes;

  /* 1 · Fuera los preconnect que hubiera, estén donde estén. Se vuelven a
     poner todos juntos y en orden más abajo; dejar los viejos donde estaban
     sería quedarse con la mitad del arreglo. */
  t = t.replace(/^[ \t]*<link rel="preconnect"[^>]*>\n/gm, '');
  t = t.replace(/^[ \t]*<link rel="modulepreload"[^>]*>\n/gm, '');
  /* Y el comentario que esta misma herramienta deja, para no acumular copias. */
  t = t.replace(/^[ \t]*<!-- Los cuatro servidores[\s\S]*?-->\n/gm, '');

  /* 2 · El bloque nuevo, justo antes de la primera hoja de estilo de la
     cabecera —sea la de Google o la nuestra—, que es lo primero que dispara
     una descarga. */
  const rutaApp = hojaEstilos[1].replace(/styles\.css/, 'app.js');
  const bloque =
    '<!-- Los cuatro servidores de fuera, avisados de golpe y no en fila.\n'
    + '     Sin esto el navegador descubre cada uno cuando le toca, y paga el\n'
    + '     DNS y el saludo TLS de cada cual por separado, con la pantalla en\n'
    + '     blanco mientras tanto. Ver herramientas/acelerar-cabeceras.mjs. -->\n'
    + DOMINIOS.map(([d, cruzado]) =>
        `<link rel="preconnect" href="${d}"${cruzado ? ' crossorigin' : ''}>`).join('\n')
    + `\n<link rel="modulepreload" href="${rutaApp}">\n`;

  const primeraHoja = t.search(/<link (?:rel="stylesheet"|href="https:\/\/fonts\.googleapis)/);
  if (primeraHoja < 0) { saltados++; continue; }
  t = t.slice(0, primeraHoja) + bloque + t.slice(primeraHoja);

  if (t === antes) continue;
  tocados++;
  if (!SOLO_MIRAR) writeFileSync(archivo, t);
}

console.log(`${SOLO_MIRAR ? 'Cambiaría' : 'Cambiadas'} ${tocados} pantallas`
  + ` · ${saltados} sin estilos de la casa, sin tocar`);
