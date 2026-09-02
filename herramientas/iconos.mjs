#!/usr/bin/env node
/* El logotipo de la casa, declarado igual en todas las pantallas.
   ═══════════════════════════════════════════════════════════════════════════
   El problema, visto en un resultado de búsqueda de verdad: Google enseñaba el
   sitio con un cuadrito negro y una «E» dentro. Ése es el sustituto que pone
   cuando no encuentra un favicon que le sirva — la inicial del dominio sobre un
   fondo liso.

   Eran DOS causas, y la primera tapaba a la segunda:

   1 · `escuelacem.com/favicon.ico` daba 404. Google busca ahí primero, por
       convención de 1995, y sólo después mira lo que declara el HTML.

   2 · Y lo único que declaraba el HTML era un SVG SIN `width` ni `height` en
       su etiqueta raíz — sólo `viewBox`. Ese archivo se dibuja perfectamente
       dentro de un `<img>` que le dé medidas, y por eso el logotipo del
       encabezado se veía bien y esto costó encontrarlo. Pero como
       `<link rel="icon" type="image/svg+xml">` no hay ningún `<img>`: el
       navegador tiene que deducir el tamaño natural del propio archivo, no lo
       encuentra, y descarta el icono. En su lugar pone su suplente: un
       cuadrado con la inicial del dominio.

   Arreglado lo primero, seguía saliendo la «E», que es lo que llevó a lo
   segundo. Ahora se declaran cuatro cosas, y cada una tiene su público:

     · /favicon.ico          — Google y cualquier cosa vieja. Lleva 16, 32 y 48
                               px dentro del mismo archivo.
     · favicon-96.png        — el formato que ningún navegador discute, y el
                               seguro por si el SVG vuelve a dar problemas.
     · favicon.svg           — los navegadores modernos: una sola forma vectorial
                               nítida a cualquier tamaño.
     · icono-180.png         — la pantalla de inicio de un iPhone.
     · icono-192 y 512       — el manifiesto, para instalarlo como aplicación.

   Los mapas de bits NO se dibujan aquí cada vez: se generan con `--dibujar`
   cuando cambia el logotipo, y se guardan en el repositorio. Un icono que se
   regenerara en cada publicación cambiaría de bytes sin cambiar de aspecto, y
   eso es exactamente lo que hace que un navegador —y Google— se lo vuelva a
   bajar sin motivo.

   Uso:  node herramientas/iconos.mjs            declara los iconos en el HTML
         node herramientas/iconos.mjs --mirar    sólo dice qué haría
         node herramientas/iconos.mjs --dibujar  redibuja los PNG y el .ico
                                                 desde favicon.svg (necesita
                                                 Playwright, en pruebas/)
*/
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SOLO_MIRAR = process.argv.includes('--mirar');
const DIBUJAR = process.argv.includes('--dibujar');

/* El navy de la marca, el mismo que el `theme-color` de todas las pantallas.
   Con fondo y no en transparencia porque Google dibuja el favicon dentro de una
   pastilla pequeña: un birrete flotando se deshace ahí, y sobre el navy tiene
   borde y se reconoce a 16 px. */
const NAVY = '#0d2440';
const TAMANOS = [16, 32, 48, 96, 180, 192, 512];
const EN_EL_ICO = [16, 32, 48];

async function dibujar() {
  const { chromium } = await import(join(RAIZ, 'pruebas', 'node_modules', 'playwright', 'index.mjs'))
    .catch(() => import('playwright'));
  const svg = readFileSync(join(RAIZ, 'plataforma', 'assets', 'favicon.svg'), 'utf8');
  const nav = await chromium.launch();
  const hechos = {};
  for (const n of TAMANOS) {
    /* Margen proporcional: sin él, a 16 px el ala del birrete toca los bordes y
       al redondear la pastilla se le comen las esquinas. */
    const m = Math.max(1, Math.round(n * 0.09));
    const ctx = await nav.newContext({ viewport: { width: n, height: n }, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    await p.setContent(`<!doctype html><style>
      html,body{margin:0;padding:0;width:${n}px;height:${n}px;overflow:hidden;background:${NAVY}}
      .c{width:${n}px;height:${n}px;display:flex;align-items:center;justify-content:center}
      svg{display:block;width:${n - m * 2}px;height:${n - m * 2}px}
      </style><div class="c">${svg}</div>`);
    await p.waitForTimeout(120);
    hechos[n] = await p.screenshot();
    await ctx.close();
  }
  await nav.close();

  const A = join(RAIZ, 'plataforma', 'assets');
  writeFileSync(join(A, 'favicon-48.png'), hechos[48]);
  writeFileSync(join(A, 'favicon-96.png'), hechos[96]);
  writeFileSync(join(A, 'icono-180.png'), hechos[180]);
  writeFileSync(join(A, 'icono-192.png'), hechos[192]);
  writeFileSync(join(A, 'icono-512.png'), hechos[512]);

  /* El .ico, a mano. El formato es de 1985 y su estructura es corta:
       · 6 bytes de cabecera: reservado(2)=0, tipo(2)=1, cuántas(2)
       · 16 por imagen: ancho, alto, colores=0, reservado, planos=1, bits=32,
         tamaño(4), desplazamiento(4)
       · los datos, uno detrás de otro
     Desde Vista los datos pueden ser un PNG tal cual, que es lo que va aquí. */
  const cab = Buffer.alloc(6);
  cab.writeUInt16LE(1, 2);
  cab.writeUInt16LE(EN_EL_ICO.length, 4);
  let off = 6 + EN_EL_ICO.length * 16;
  const entradas = EN_EL_ICO.map((n) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(n, 0); e.writeUInt8(n, 1);
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(hechos[n].length, 8); e.writeUInt32LE(off, 12);
    off += hechos[n].length;
    return e;
  });
  const ico = Buffer.concat([cab, ...entradas, ...EN_EL_ICO.map((n) => hechos[n])]);
  writeFileSync(join(RAIZ, 'favicon.ico'), ico);
  console.log(`Redibujados ${TAMANOS.length} tamaños · favicon.ico con ${EN_EL_ICO.join(', ')} px dentro`);
}

/* ── declararlos en el HTML ─────────────────────────────────────────────── */

function htmls(dir, acc = []) {
  for (const nombre of readdirSync(dir)) {
    /* `.artefactos/` está en .gitignore: son borradores que no se publican, y
       contarlos hacía que la herramienta dijera «8 pantallas» cuando las
       pantallas de verdad eran 7. */
    if (nombre === 'node_modules' || nombre === '.git' || nombre === '.artefactos') continue;
    const p = join(dir, nombre);
    if (statSync(p).isDirectory()) htmls(p, acc);
    else if (nombre.endsWith('.html')) acc.push(p);
  }
  return acc;
}

/* Cualquier declaración de icono que hubiera, para reemplazarla entera. */
const VIEJOS = /^[ \t]*<link rel="(?:icon|shortcut icon|apple-touch-icon)"[^>]*>\n/gm;

function bloque(rutaRelativa) {
  /* El .ico va con dirección absoluta a propósito: vive en la raíz del dominio
     porque es donde Google lo busca, y desde una pantalla en /plataforma/admin/
     una ruta relativa apuntaría a otro sitio. */
  /* Cuatro declaraciones, y cada una para quien no entiende las otras.
     El .ico primero y absoluto: vive en la raíz del dominio porque es ahí
     donde lo busca Google, antes incluso de leer esta línea. El PNG después,
     porque es el formato que ningún navegador discute. El SVG para quien
     prefiera un vector. Y el de 180 para la pantalla de inicio de un iPhone. */
  return '<!-- El logotipo, para cada quien lo pida: .ico para Google y lo viejo,\n'
    + '     PNG para todo lo demás, SVG para quien prefiera un vector, y el de 180\n'
    + '     para el iPhone. Ver herramientas/iconos.mjs. -->\n'
    + '<link rel="icon" href="/favicon.ico" sizes="32x32">\n'
    + `<link rel="icon" type="image/png" sizes="96x96" href="${rutaRelativa}favicon-96.png">\n`
    + `<link rel="icon" type="image/svg+xml" href="${rutaRelativa}favicon.svg">\n`
    + `<link rel="apple-touch-icon" href="${rutaRelativa}icono-180.png">\n`;
}

/* Lo que escribe herramientas/generar-seo.mjs, y que por tanto NO se toca aquí.
   ───────────────────────────────────────────────────────────────────────────
   Esta lección ya costó una regresión antes, con las cabeceras: se arregló a
   mano lo que un generador reescribe cada noche, y a la mañana siguiente
   estaba deshecho. Lo que se genera se arregla en el generador —que ya declara
   los mismos iconos—, y aquí sólo se tocan las pantallas escritas a mano.

   Y en el otro sentido: si estos archivos se dejaran pasar, las dos
   herramientas se pelearían por el mismo bloque, cada una convencida de tener
   razón, y el repositorio cambiaría solo con cada pasada de cualquiera. */
const LAS_GENERA_OTRO = new Set(['index.html', 'preguntas-frecuentes.html', '404.html']);

let tocados = 0, saltados = 0;
for (const archivo of htmls(RAIZ)) {
  if (archivo.includes('/programas/')) { saltados++; continue; }   // las escribe generar-seo
  if (LAS_GENERA_OTRO.has(archivo.slice(RAIZ.length + 1))) { saltados++; continue; }
  const antes = readFileSync(archivo, 'utf8');
  VIEJOS.lastIndex = 0;
  /* Antes se saltaba aquí toda pantalla que no declarase ya un icono, que es
     justo al revés de lo que hace falta: las que no declaraban nada eran
     precisamente las que estaban mal. Ahora sólo se descarta lo que no es una
     pantalla —un fragmento sin <head> se descarta más abajo, al no encontrar
     dónde meter el bloque. */

  /* De dónde cuelga assets/ visto desde esta pantalla.
     ───────────────────────────────────────────────────────────────────────
     Primero, lo que la propia página ya declaraba: si acierta, se respeta tal
     cual y no se cambia una ruta que funciona.

     Y si no declara nada, se CALCULA, que antes era rendirse. Ahí estaba el
     agujero: ocho pantallas de verdad —admin.html, proyectos.html, las dos de
     certificados/, manual.html, las dos del estudiante— no llevaban ni un solo
     `<link rel="icon">`, y por eso el navegador les ponía en la pestaña su
     suplente: el cuadrito con la inicial del dominio. Justo lo que se creía
     arreglado. No salían en ninguna comprobación porque esta herramienta las
     saltaba en silencio, y `revisar-seo.mjs` sólo mira las páginas públicas.

     Se calcula con `relative`, que es lo correcto y no lo que se intentó la
     primera vez: contar carpetas a mano se equivocaba con las de la raíz.
     Desde plataforma/estudiante/curso.html da «../assets/»; desde
     certificados/generar.html, «../plataforma/assets/»; desde admin.html,
     «plataforma/assets/». */
  const pista = antes.match(/href="((?:\.\.\/)*(?:\.\/)?(?:plataforma\/)?assets\/)favicon\.svg"/);
  const haciaAssets = pista
    ? pista[1]
    : (relative(dirname(archivo), join(RAIZ, 'plataforma', 'assets')) || '.') + '/';

  /* Se quita TODO lo viejo primero —los enlaces y el comentario que deja esta
     misma herramienta— y sólo después se busca dónde poner lo nuevo. Al revés
     no funciona: al calcular la posición antes de borrar el comentario, en la
     segunda pasada el índice apuntaba tres líneas más abajo de lo debido, y el
     bloque acababa metido dentro de otra cosa. Se vio porque `--mirar` seguía
     diciendo que cambiaría las 77 pantallas después de haberlas cambiado. */
  let t = antes.replace(VIEJOS, '')
    .replace(/^[ \t]*<!-- El logotipo, para cada quien[\s\S]*?-->\n/gm, '');
  /* Justo después del <title>, que es donde estaban. Si no lo hubiera, al
     principio de la cabecera. */
  const trasTitulo = t.search(/(?<=<\/title>\n)/);
  const donde = trasTitulo >= 0 ? trasTitulo : t.search(/(?<=<head>\n)/);
  if (donde < 0) { saltados++; continue; }
  t = t.slice(0, donde) + bloque(haciaAssets) + t.slice(donde);

  if (t === antes) { saltados++; continue; }
  tocados++;
  if (!SOLO_MIRAR) writeFileSync(archivo, t);
}

if (DIBUJAR) await dibujar();
console.log(`${SOLO_MIRAR ? 'Declararía' : 'Declarados'} los iconos en ${tocados} pantallas`
  + ` · ${saltados} sin tocar`);
