/* Rehace la lista de países y sus contornos.
   ═══════════════════════════════════════════════════════════════════════════
   Se ejecuta a mano, muy de vez en cuando, y lo que escribe se guarda en el
   repositorio: la plataforma no descarga un atlas en cada visita.

       npm i world-atlas@2 topojson-client d3-geo i18n-iso-countries
       node herramientas/mapas-de-paises.mjs

   Escribe dos archivos en plataforma/assets/, y los dos son sólo datos:
     paises-lista.js      código y nombre en español
     paises-contornos.js  el trazo de cada país, encajado en un cuadro 100×100

   Lo que se hace con esos datos —la bandera, traducir lo escrito a mano, las
   opciones de un desplegable— vive en paises.js, que está escrito a mano y
   esta herramienta no toca. Si la lógica viviera dentro de la plantilla de
   aquí, cualquiera la corregiría en el archivo generado y se perdería en la
   siguiente pasada.

   Las fronteras son de Natural Earth (dominio público) a través de
   world-atlas, en resolución 1:110m: es la que se ve bien a ciento cincuenta
   píxeles y no pesa. Los nombres en español salen de i18n-iso-countries.

   Por qué contornos y no un mapa de verdad: en la portada un país es un
   dibujo, no un dato. Se reconoce de un vistazo, no se hace zoom sobre él, y
   una imagen por país serían ciento setenta y cuatro descargas. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as topojson from 'topojson-client';
import { geoPath, geoMercator } from 'd3-geo';

const require = createRequire(import.meta.url);
const LADO = 100;
const DESTINO = new URL('../plataforma/assets/', import.meta.url);

/* ── los nombres ────────────────────────────────────────────────────────── */
const iso = require('i18n-iso-countries');
iso.registerLocale(require('i18n-iso-countries/langs/es.json'));
const nombres = iso.getNames('es');

/* El código numérico es lo que trae el atlas; el de dos letras es con el que
   habla la plataforma y del que sale la bandera. */
const numAlfa = {};
for (const alfa of Object.keys(nombres)) {
  const n = iso.alpha2ToNumeric(alfa);
  if (n) numAlfa[String(Number(n))] = alfa;
}

const lista = Object.entries(nombres)
  .map(([codigo, nombre]) => ({ codigo, nombre }))
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

writeFileSync(new URL('paises-lista.js', DESTINO),
  `/* Los países, en español y ordenados como se leen.
   Generado por herramientas/mapas-de-paises.mjs; no se edita a mano.
   Lo que se hace con esta lista está en paises.js, que sí se edita. */

export const PAISES = [
${lista.map(({ codigo, nombre }) => `  ['${codigo}', ${JSON.stringify(nombre)}],`).join('\n')}
];
`);

/* ── los contornos ──────────────────────────────────────────────────────── */
const topo = JSON.parse(readFileSync(require.resolve('world-atlas/countries-110m.json'), 'utf8'));
const geo = topojson.feature(topo, topo.objects.countries);

const contornos = {};
for (const f of geo.features) {
  /* Los códigos numéricos van con ceros delante —Argentina es el 032— y según
     de dónde vengan se leen como «032» o como «32». Se comparan como números
     para que no se pierdan justo los que empiezan por cero. */
  const alfa = numAlfa[String(Number(f.id))];
  if (!alfa) continue;

  /* Mercator centrado en cada país: uno estrecho y largo —Chile— se ve
     entero, y ninguno sale deformado por estar lejos del ecuador, que es lo
     que pasaría con una sola proyección para todo el mundo.

     El encuadre se calcula sobre el trozo más grande, no sobre el país entero.
     Con el país entero, Estados Unidos se dibuja para que quepa Alaska y los
     cuarenta y ocho de abajo quedan diminutos; España se encoge para que
     entren Canarias. O se reconoce el trozo principal, o no se reconoce nada.

     Los demás trozos se siguen dibujando si caen dentro del encuadre —las
     islas de Venezuela, las griegas— y se descartan los que quedan fuera, que
     si no aparecen como manchas pegadas al borde. */
  const trozos = f.geometry.type === 'MultiPolygon'
    ? f.geometry.coordinates.map((c) => ({ type: 'Polygon', coordinates: c }))
    : [f.geometry];
  const medir = geoPath();
  const mayor = trozos.reduce((a, b) => (medir.area(a) >= medir.area(b) ? a : b));
  const dibujar = geoPath(geoMercator().fitExtent([[4, 4], [LADO - 4, LADO - 4]], mayor));
  const d = trozos
    .filter((t) => {
      const [[x0, y0], [x1, y1]] = dibujar.bounds(t);
      return x1 > 0 && x0 < LADO && y1 > 0 && y0 < LADO;
    })
    .map((t) => dibujar(t)).filter(Boolean).join('');
  if (!d) continue;
  /* Un decimal sobre cien es medio píxel a tamaño natural: no se ve, y el
     archivo baja a la mitad. */
  contornos[alfa] = d.replace(/-?\d+\.?\d*/g, (n) => String(Math.round(n * 10) / 10));
}

const codigos = Object.keys(contornos).sort();
writeFileSync(new URL('paises-contornos.js', DESTINO),
  `/* El contorno de cada país, encajado en un cuadro de 100×100.
   Generado por herramientas/mapas-de-paises.mjs; no se edita a mano.
   Fronteras de Natural Earth (dominio público), resolución 1:110m.
   Los países muy pequeños no tienen contorno a esta resolución: en la pantalla
   se quedan con su bandera, que es lo que se reconoce de ellos de todos modos. */

export const CONTORNOS = {
${codigos.map((c) => `  ${c}: '${contornos[c]}',`).join('\n')}
};
`);

console.log(`${lista.length} países y ${codigos.length} contornos escritos en plataforma/assets/.`);
