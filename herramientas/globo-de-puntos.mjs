/* Rehace los puntos del globo de la portada.
   ═══════════════════════════════════════════════════════════════════════════
   Se ejecuta a mano, muy de vez en cuando —las fronteras no cambian—, y lo que
   escribe se guarda en el repositorio: la portada no descarga un atlas en cada
   visita. Mismas dependencias que mapas-de-paises.mjs:

       npm i world-atlas@2 topojson-client d3-geo i18n-iso-countries
       node herramientas/globo-de-puntos.mjs

   Escribe plataforma/assets/globo-datos.js, que es sólo datos:
     PUNTOS   los puntos de tierra, empaquetados (ver más abajo)
     CODIGOS  el país de cada punto, por número
     CENTROS  el centro de cada país, para poner su marca y tirar los arcos

   Los puntos se reparten en una espiral de Fibonacci sobre la esfera, que es
   la forma de poner N puntos a la misma distancia unos de otros: con una
   rejilla de latitud y longitud se amontonarían en los polos. De los dieciocho mil
   se quedan los que caen en tierra, y la Antártida fuera: con el globo
   inclinado hacia el norte sólo se vería como una franja de puntos sueltos.

   Las fronteras son de Natural Earth (dominio público) a través de
   world-atlas, a 1:110m, igual que los contornos de los países. */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as topojson from 'topojson-client';
import { geoContains, geoBounds, geoArea, geoCentroid } from 'd3-geo';

const require = createRequire(import.meta.url);
const DESTINO = new URL('../plataforma/assets/globo-datos.js', import.meta.url);
const N = 18000;
const SUR = -60;

const iso = require('i18n-iso-countries');
const mundo = require('world-atlas/countries-110m.json');
const tierra = topojson.feature(mundo, mundo.objects.land);
const paises = topojson.feature(mundo, mundo.objects.countries).features
  .map((f) => ({ f, codigo: iso.numericToAlpha2(f.id) || '', caja: geoBounds(f) }))
  .filter((p) => p.codigo);

/* ¿Dentro de la caja? Antes de la prueba cara del polígono. Las cajas que
   cruzan el antimeridiano (Rusia, Fiyi) vienen con el oeste mayor que el este. */
const enCaja = ([[o, s], [e, n]], lon, lat) =>
  lat >= s && lat <= n && (o <= e ? lon >= o && lon <= e : lon >= o || lon <= e);

const CODIGOS = [''];
const puntos = [];
const oro = Math.PI * (3 - Math.sqrt(5));
for (let i = 0; i < N; i++) {
  const y = 1 - ((i + 0.5) * 2) / N;
  const lat = (Math.asin(y) * 180) / Math.PI;
  if (lat < SUR) continue;
  let lon = (((i * oro) * 180) / Math.PI) % 360;
  if (lon > 180) lon -= 360;
  if (!geoContains(tierra, [lon, lat])) continue;
  const p = paises.find((q) => enCaja(q.caja, lon, lat) && geoContains(q.f, [lon, lat]));
  let k = 0;
  if (p) {
    k = CODIGOS.indexOf(p.codigo);
    if (k < 0) { k = CODIGOS.length; CODIGOS.push(p.codigo); }
  }
  puntos.push([lat, lon, k]);
}

/* Cinco bytes por punto: latitud y longitud en centésimas de grado, como
   enteros de 16 bits con signo y en little-endian, y el número del país en un
   byte. En base64 para que viaje como texto dentro de un módulo. */
const buf = Buffer.alloc(puntos.length * 5);
puntos.forEach(([lat, lon, k], i) => {
  buf.writeInt16LE(Math.round(lat * 100), i * 5);
  buf.writeInt16LE(Math.round(lon * 100), i * 5 + 2);
  buf.writeUInt8(k, i * 5 + 4);
});

/* El centro de cada país es el de su trozo más grande: el de Estados Unidos
   con Alaska y Hawái caería en mitad de Canadá, y el de Francia con la
   Guayana, en el Atlántico. */
const CENTROS = {};
for (const { f, codigo } of paises) {
  const trozos = f.geometry.type === 'MultiPolygon'
    ? f.geometry.coordinates.map((c) => ({ type: 'Polygon', coordinates: c }))
    : [f.geometry];
  const mayor = trozos.reduce((a, b) => (geoArea(b) > geoArea(a) ? b : a));
  const [lon, lat] = geoCentroid(mayor);
  CENTROS[codigo] = [Math.round(lat * 10) / 10, Math.round(lon * 10) / 10];
}

writeFileSync(DESTINO, `/* Los puntos del globo de la portada.
   Generado por herramientas/globo-de-puntos.mjs; no se edita a mano.
   Fronteras de Natural Earth (dominio público), resolución 1:110m.
   PUNTOS: base64, cinco bytes por punto — latitud y longitud en centésimas de
   grado (int16, little-endian) y el número del país en CODIGOS (uint8). */

export const CODIGOS = ${JSON.stringify(CODIGOS)};

export const PUNTOS = '${buf.toString('base64')}';

export const CENTROS = ${JSON.stringify(CENTROS)};
`);
console.log(`${puntos.length} puntos de tierra, ${CODIGOS.length - 1} países, ${buf.length} bytes.`);
