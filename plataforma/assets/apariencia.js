/* El panel para elegir cómo se ve la plataforma.
   ==========================================================================
   Estaba metido dentro de Configuración académica, que sólo ven el
   administrador y el superadministrador. O sea: la persona que pasa ocho
   horas al día en esta pantalla —quien cobra, quien da clase, quien estudia—
   no podía cambiarle ni el color ni el tamaño de las cosas. Y la apariencia
   es justo lo contrario de una decisión institucional: se guarda en el
   navegador de cada quien y no toca la base ni a nadie más.

   Así que el panel vive aquí, y lo llaman dos sitios: Configuración, que lo
   pinta dentro de su tarjeta, y el pie del menú lateral, que lo abre en una
   ventana. Ese pie lo ve todo el mundo, en todas las áreas.

   Cinco cosas se eligen por separado —colores, claro/oscuro, estilo de los
   recuadros, esquinas y densidad— y se combinan sin estorbarse. No hay
   «Guardar»: el cambio se ve en el acto, que es la única forma de elegir un
   aspecto con criterio. */

import { $, $$, esc, ok, modal } from './app.js?v=2026-08-21-4';
import {
  PALETAS, ESTILOS, FORMAS, DENSIDADES,
  aplicarApariencia, aparienciaDeFabrica,
  paletaActual, temaActual, estiloActual, formaActual, densidadActual,
} from './temas.js?v=2026-08-21-4';

/** El HTML del panel. `compacto` quita las explicaciones largas: en una ventana no caben. */
function armazon(compacto) {
  return `<div class="ap-panel">
    ${compacto ? '' : `<p class="tiny muted sin-margen">Los colores, la forma de los recuadros, las
      esquinas y el aire entre las cosas. Todo se ve al momento —no hay que guardar— y se recuerda la
      próxima vez que entres. Como se guarda en este navegador, cada quien puede tener el suyo sin
      molestar a nadie.</p>`}

    <h3 class="sub-ap">Paleta de colores</h3>
    <div class="paletas" data-ap="paletas"></div>

    <h3 class="sub-ap">Estilo de los recuadros</h3>
    ${compacto ? '' : `<p class="tiny muted sin-margen">Cada muestra está pintada con su propio
      estilo: lo que ves en el botón es lo que va a pasar en toda la plataforma.</p>`}
    <div class="estilos sep-poco" data-ap="estilos"></div>
    <p class="tiny muted sep-poco">Los marcados <b>ligero</b> no difuminan el fondo detrás de las
      tarjetas, así que no cuestan nada al desplazar una tabla larga. Los marcados <b>pesado</b> sí
      difuminan: se ven mejor y, en un equipo lento con listas de cientos de filas, se puede notar.</p>

    <div class="grid g3 sep">
      <div><h3 class="sub-ap sin-margen">Claro u oscuro</h3>
        <div class="row sep-poco" data-ap="temas"></div></div>
      <div><h3 class="sub-ap sin-margen">Esquinas</h3>
        <div class="formas sep-poco" data-ap="formas"></div></div>
      <div><h3 class="sub-ap sin-margen">Densidad</h3>
        <div class="row sep-poco" data-ap="densidades"></div>
        <p class="tiny muted sep-poco" data-ap="densidadNota"></p></div>
    </div>

    <div class="row sep">
      <button type="button" class="btn outline sm" data-ap="fabrica">
        <span class="material-symbols-outlined">restart_alt</span> Volver a como viene de fábrica</button>
    </div>
  </div>`;
}

/**
 * Pinta el panel dentro de `host` y lo deja funcionando.
 * @param {Element|string} host
 * @param {{compacto?:boolean, alCambiar?:Function}} [opciones]
 */
export function panelApariencia(host, { compacto = false, alCambiar = () => {} } = {}) {
  const raiz = typeof host === 'string' ? $(host) : host;
  if (!raiz) return;
  raiz.innerHTML = armazon(compacto);
  const dentro = (nombre) => $(`[data-ap="${nombre}"]`, raiz);

  function pintar() {
    const elegida = paletaActual();
    dentro('paletas').innerHTML = Object.entries(PALETAS).map(([clave, pal]) => `
      <button type="button" class="pal" data-paleta="${esc(clave)}"
        aria-pressed="${clave === elegida}">
        <span class="tiras" aria-hidden="true">${pal.muestra.map((c) =>
          `<i style="background:${esc(c)}"></i>`).join('')}</span>
        <span><span class="nom">${esc(pal.nombre)}</span>
          <span class="des">${esc(pal.resumen)}</span></span>
      </button>`).join('');

    /* Cada botón lleva dentro un recuadro pintado con su propio estilo: elegir
       entre siete nombres a ciegas no es elegir. */
    const estilo = estiloActual();
    dentro('estilos').innerHTML = Object.entries(ESTILOS).map(([clave, e]) => `
      <button type="button" class="estilo" data-estilo="${esc(clave)}"
        data-muestra="${esc(clave)}" aria-pressed="${clave === estilo}">
        <span class="lienzo" aria-hidden="true"><span class="pieza">1 248</span></span>
        <span class="nom">${esc(e.nombre)}</span>
        <span class="des">${esc(e.resumen)}</span>
        <span class="coste ${e.desenfoque ? 'caro' : 'barato'}">${
          e.desenfoque ? 'pesado' : 'ligero'}</span>
      </button>`).join('');

    const tema = temaActual();
    dentro('temas').innerHTML = [
      ['auto', 'Como el sistema', 'brightness_auto'],
      ['claro', 'Claro', 'light_mode'],
      ['oscuro', 'Oscuro', 'dark_mode'],
    ].map(([v, txt, ico]) => `<button type="button" class="btn sm ${tema === v ? '' : 'outline'}"
        data-tema="${v}" aria-pressed="${tema === v}">
        <span class="material-symbols-outlined">${ico}</span> ${txt}</button>`).join('');

    const forma = formaActual();
    dentro('formas').innerHTML = Object.entries(FORMAS).map(([clave, f]) => `
      <button type="button" class="forma" data-forma="${esc(clave)}"
        aria-pressed="${clave === forma}" title="${esc(f.resumen)}">
        <i aria-hidden="true"></i>${esc(f.nombre)}</button>`).join('');

    const densidad = densidadActual();
    dentro('densidades').innerHTML = Object.entries(DENSIDADES).map(([clave, d]) => `
      <button type="button" class="btn sm ${clave === densidad ? '' : 'outline'}"
        data-densidad="${esc(clave)}" aria-pressed="${clave === densidad}">${esc(d.nombre)}</button>`).join('');
    dentro('densidadNota').textContent = DENSIDADES[densidad].resumen;

    const cambiar = (ajuste, aviso) => {
      aplicarApariencia(ajuste);
      pintar();
      alCambiar(ajuste);
      if (aviso) ok(aviso);
    };
    $$('[data-paleta]', raiz).forEach((b) => b.onclick = () =>
      cambiar({ paleta: b.dataset.paleta }, `Paleta «${PALETAS[b.dataset.paleta].nombre}» aplicada.`));
    $$('[data-estilo]', raiz).forEach((b) => b.onclick = () =>
      cambiar({ estilo: b.dataset.estilo }, `Estilo «${ESTILOS[b.dataset.estilo].nombre}» aplicado.`));
    $$('[data-tema]', raiz).forEach((b) => b.onclick = () => cambiar({ tema: b.dataset.tema }));
    $$('[data-forma]', raiz).forEach((b) => b.onclick = () => cambiar({ forma: b.dataset.forma }));
    $$('[data-densidad]', raiz).forEach((b) => b.onclick = () => cambiar({ densidad: b.dataset.densidad }));

    dentro('fabrica').onclick = () => {
      aparienciaDeFabrica();
      pintar();
      alCambiar({});
      ok('Aspecto restablecido: paleta de la casa, sin vidrio, esquinas suaves.');
    };
  }

  pintar();
}

/** El mismo panel, en una ventana. Es lo que abre el botón del menú lateral. */
export function abrirApariencia() {
  const dlg = modal({
    title: 'Cómo se ve la plataforma',
    wide: true,
    body: '<div id="apDentro"></div>',
    footer: '<button class="btn" data-x>Listo</button>',
  });
  panelApariencia($('#apDentro', dlg), { compacto: true });
  const cerrar = $('[data-x]', dlg);
  if (cerrar) cerrar.onclick = dlg.close;
  return dlg;
}
