/* Los países.
   ═══════════════════════════════════════════════════════════════════════════
   La lista y los contornos los genera herramientas/mapas-de-paises.mjs y son
   sólo datos. Todo lo que se HACE con ellos está aquí, que es un archivo
   normal y se edita a mano.

   Por qué existe: el país era un campo de texto libre. En la base convivían
   «usa», «Estados Unidos» y «Venezuela» como si fueran tres cosas del mismo
   tipo, y contar de dónde son los estudiantes era imposible. Un código de dos
   letras se cuenta, se ordena y sirve para sacar la bandera y el mapa. */

import { PAISES } from './paises-lista.js';
export { PAISES };

/** El nombre en español, o lo que hubiera escrito si no es un código nuestro. */
export const paisNombre = (codigo) =>
  PAISES.find(([c]) => c === codigo)?.[1] || codigo || '';

/* La bandera se arma con los dos «indicadores regionales» que corresponden a
   las letras del código: 🇻 y 🇪 juntos se pintan como la bandera de Venezuela.
   Así no hay que guardar doscientos cincuenta emojis ni doscientas cincuenta
   imágenes. Donde el sistema no sepa dibujarla salen las dos letras, que se
   siguen entendiendo. */
export const paisBandera = (codigo) => /^[A-Za-z]{2}$/.test(codigo || '')
  ? String.fromCodePoint(...[...codigo.toUpperCase()].map((l) => 0x1f1e6 + l.charCodeAt(0) - 65))
  : '';

/** El nombre con su bandera delante, para leerlo de un vistazo en una tabla. */
export const paisConBandera = (codigo) => {
  const n = paisNombre(codigo);
  const b = paisBandera(codigo);
  return b ? `${b} ${n}` : n;
};

/* Sin tildes y en minúscula: «Perú», «peru» y «PERU» son el mismo sitio. */
const llano = (t) => String(t || '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[.\s]+/g, ' ').trim();

/* Lo que la gente escribe de verdad cuando el campo es libre. Sale de mirar lo
   que ya había guardado, no de imaginarlo. */
const APODOS = {
  usa: 'US', eeuu: 'US', 'ee uu': 'US', 'estados unidos': 'US', eua: 'US',
  'estados unidos de america': 'US', 'united states': 'US',
  venezuela: 'VE', vzla: 'VE', 'republica bolivariana de venezuela': 'VE',
  espana: 'ES', mexico: 'MX', brasil: 'BR', brazil: 'BR',
  'republica dominicana': 'DO', 'rep dominicana': 'DO',
  'reino unido': 'GB', inglaterra: 'GB', 'gran bretana': 'GB',
};

/**
 * Convierte lo que haya escrito —«usa», «Venezuela», «PE»— en un código.
 * Devuelve '' si no lo reconoce, y entonces se deja el texto original: perder
 * el país de alguien es peor que enseñarlo raro.
 */
export function paisDesdeTexto(texto) {
  const t = String(texto || '').trim();
  if (!t) return '';
  if (/^[A-Za-z]{2}$/.test(t)) {
    const arriba = t.toUpperCase();
    if (PAISES.some(([c]) => c === arriba)) return arriba;
  }
  const clave = llano(t);
  if (APODOS[clave]) return APODOS[clave];
  return PAISES.find(([, n]) => llano(n) === clave)?.[0] || '';
}

/**
 * Las opciones de un `<select>`, con lo que hubiera guardado ya elegido.
 *
 * Si lo guardado no es un código —texto viejo que no se pudo traducir— se
 * añade como una opción más en vez de perderse: quien abra su perfil sigue
 * viendo lo que escribió y puede corregirlo. Vaciarle el país sin avisar sería
 * peor que un nombre raro.
 */
export function opcionesDePais(elegido = '', vacio = 'Selecciona un país') {
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const conocido = PAISES.some(([c]) => c === elegido);
  const suelto = elegido && !conocido
    ? `<option value="${esc(elegido)}" selected>${esc(elegido)}</option>` : '';
  return `<option value="">${esc(vacio)}</option>${suelto}` + PAISES.map(([c, n]) =>
    `<option value="${c}"${c === elegido ? ' selected' : ''}>${paisBandera(c)} ${esc(n)}</option>`
  ).join('');
}
