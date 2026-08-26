/* ============================================================================
   El certificado, dibujado en un solo sitio
   ============================================================================
   Antes el diploma se maquetaba a mano dentro de la pantalla del estudiante y
   en ningún sitio más. Ahora hace falta el mismo dibujo en tres lugares que
   NO son equivalentes:

     · la pantalla del alumno  → es suyo, lo ve limpio
     · la ficha del equipo     → lo ve limpio, para comprobarlo y emitirlo
     · el perfil que comparte  → lo ve cualquiera, y va con marca de agua

   Tenerlo en un solo módulo no es orden por el orden: si el diploma se dibuja
   en dos sitios, el día que cambie el escudo o la firma cambiará en uno.

   Sobre la marca de agua
   ----------------------
   No pretende ser infalsificable —nada dibujado en una página lo es—. Hace
   dos cosas concretas y honestas:

     1. Que una captura de pantalla se note que es una captura, para que no
        pase por el documento original delante de quien no mire con cuidado.
     2. Que si alguien la recorta igualmente, el código del certificado siga
        estando dentro de la imagen. Ese código se comprueba en /verificar.html
        contra el registro, que es la única prueba que vale de verdad.

   Lo que de verdad protege el título es la verificación, no la marca. Por eso
   el código y el QR van SIEMPRE, con marca y sin ella.
   ========================================================================= */

import { esc, fdate } from './app.js?v=2026-08-26-11';

/**
 * Dibuja un certificado.
 *
 * @param {object} c              datos del certificado
 * @param {string} c.codigo       el código que se verifica
 * @param {string} c.titulo       el programa
 * @param {string} c.emitido_en   fecha de emisión
 * @param {string} [c.programa]   el diplomado al que pertenece, si es un módulo
 * @param {number} [c.horas]
 * @param {string} nombre         a nombre de quién
 * @param {object} opciones
 * @param {boolean} [opciones.marca]  poner la marca de agua (lo compartido)
 * @param {string}  [opciones.id]     id del nodo, para imprimirlo
 * @param {Function} [opciones.qr]    generador de QR; sin él no se dibuja
 */
export function lienzoCertificado(c, nombre, { marca = false, id = '', qr = null } = {}) {
  const enlace = new URL('verificar.html', urlBase()).href
    + '?codigo=' + encodeURIComponent(c.codigo || '');

  let etiquetaQR = '';
  if (typeof qr === 'function') {
    try {
      const q = qr(0, 'M'); q.addData(enlace); q.make();
      etiquetaQR = q.createImgTag(3, 4);
    } catch { etiquetaQR = ''; }
  }

  return `<div ${id ? `id="${esc(id)}"` : ''} class="diploma">
    ${marca ? capaDeMarca(c.codigo || '') : ''}
    <div class="diploma-hoja">
      <div class="diploma-casa">CEM International Education</div>
      <h2 class="diploma-titulo">Certificado de finalización</h2>
      <p class="diploma-pie-linea">Se otorga el presente certificado a</p>
      <div class="diploma-nombre">${esc(nombre || '')}</div>
      <p class="diploma-pie-linea">por haber completado satisfactoriamente</p>
      <div class="diploma-programa">${esc(c.titulo || '')}</div>
      ${c.programa && c.programa !== c.titulo
        ? `<div class="diploma-dentro-de">del programa ${esc(c.programa)}</div>` : ''}
      ${c.horas ? `<div class="diploma-dentro-de">${esc(String(c.horas))} horas</div>` : ''}

      <div class="diploma-firmas">
        ${etiquetaQR ? `<div class="diploma-qr">${etiquetaQR}
          <div class="diploma-mini">Verificación</div></div>` : ''}
        <div class="diploma-firma">Dirección Académica</div>
      </div>

      <div class="diploma-mini diploma-codigo">Código: ${esc(c.codigo || '')}
        · Emitido el ${fdate(c.emitido_en)}</div>
    </div>
  </div>`;
}

/* La capa de la marca de agua.
   ═══════════════════════════════════════════════════════════════════════════
   El primer intento fue texto en un `::after` centrado y girado. Se veía bien
   en las esquinas y dejaba el centro del diploma limpio — que es exactamente
   el trozo que alguien recortaría. Una marca que sólo cubre los bordes no
   cubre nada.

   Esto en cambio TESELA: una baldosa de SVG con el texto en horizontal, que
   se repite por toda la superficie, y la capa entera girada. Al girar la capa
   y no cada baldosa no quedan costuras, y como la capa es más grande que el
   diploma (`inset:-50%`) el giro no descubre ninguna esquina.

   Va con `pointer-events:none` para que se pueda seguir leyendo y
   seleccionando el código de debajo: la marca disuade de hacer pasar una
   captura por el original, no de leer el documento. */
function capaDeMarca(codigo) {
  const texto = `${codigo}  ·  CEM  ·  COPIA  ·  `;
  const baldosa = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="104">`
    + `<text x="0" y="26" font-family="ui-monospace,monospace" font-size="15"`
    + ` font-weight="700" letter-spacing="2.5" fill="rgba(13,36,64,0.16)">${escXml(texto)}</text>`
    + `<text x="-210" y="78" font-family="ui-monospace,monospace" font-size="15"`
    + ` font-weight="700" letter-spacing="2.5" fill="rgba(13,36,64,0.16)">${escXml(texto)}</text>`
    + `</svg>`;
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(baldosa)}`;
  return `<div class="diploma-marca" aria-hidden="true"
    style="background-image:url(&quot;${url}&quot;)"></div>`;
}

/* En XML no valen las mismas escapadas que en HTML: `&` sin cerrar rompe el
   SVG entero y la baldosa se queda en blanco sin decir por qué. */
function escXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/* La dirección del portal, sea cual sea la carpeta desde la que se llame.
   Escribir '../verificar.html' funcionaba desde la pantalla del alumno y
   habría fallado desde la raíz, que es justo donde vive el perfil público. */
function urlBase() {
  const i = location.pathname.indexOf('/plataforma/');
  return i >= 0
    ? location.origin + location.pathname.slice(0, i + '/plataforma/'.length)
    : location.href;
}

/**
 * Lo que se le dice a quien mira un certificado con marca de agua. Va aparte
 * para que la pantalla decida dónde ponerlo y no quede metido en el dibujo.
 */
export const AVISO_MARCA =
  'Esta es una vista para compartir y por eso lleva marca de agua. '
  + 'El original sin marca lo descarga la persona titulada desde su cuenta. '
  + 'Para comprobar que es auténtico no hace falta la imagen: basta el código.';
