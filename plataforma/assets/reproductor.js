/* CEM · El reproductor de la casa
   ═══════════════════════════════════════════════════════════════════════════

   Por qué existe esto en vez de usar el reproductor de YouTube tal cual.

   Un <iframe> de YouTube trae SU interfaz: el título del vídeo arriba, el
   nombre del canal, el botón «Mirar en YouTube», el menú de compartir y el de
   copiar el enlace. Todo eso es una invitación a salirse de la plataforma — y
   fuera de la plataforma no hay marca de agua, no hay registro de quién vio
   qué, y no hay razón para haber pagado.

   Así que se hace lo contrario: se le quitan a YouTube TODOS los controles
   (`controls: 0`) y se le pone encima una lámina transparente que se come
   cualquier clic y cualquier paso del ratón. Sin ratón encima, YouTube no
   enseña nunca su interfaz: no es que la tapemos, es que no llega a dibujarla.
   Y sobre esa lámina van los mandos de la casa —reproducir, barra, saltar,
   volumen, pantalla completa— hablando con el reproductor por su API.

   ── Lo que esto SÍ consigue ────────────────────────────────────────────────
   · No se ve el título ni el canal ni el botón de YouTube.
   · No hay menú de compartir ni de copiar el enlace.
   · El clic derecho no ofrece nada.
   · A pantalla completa la marca de agua sigue puesta, porque el que se pone a
     pantalla completa es NUESTRO recuadro, no el <iframe> de YouTube.

   ── Lo que NO consigue, y hay que decirlo ─────────────────────────────────
   Quien abra las herramientas de su navegador va a encontrar el identificador
   del vídeo. Eso no se puede evitar con YouTube: el navegador necesita saber
   qué vídeo pedir, así que el dato está ahí por fuerza. Esto detiene a quien se
   despista y a quien lo intenta sin saber; no a quien sabe.

   La única forma de que un enlace filtrado no sirva es que el vídeo no viva en
   YouTube, sino en un servicio que sepa decir «este vídeo sólo se reproduce
   dentro de cem.com» — Cloudflare Stream, Bunny, Vimeo Pro. Está explicado en
   docs/videos-y-copia.md.
*/

import { $, $$, esc } from './app.js?v=2026-08-20';

/* ── La librería de YouTube, una sola vez ─────────────────────────────────
   Se pide siempre a `youtube.com`, no al dominio sin cookies: es la librería
   que controla al reproductor, no el reproductor, y Google no la sirve desde
   `-nocookie`. El vídeo en sí se sigue pidiendo a `youtube-nocookie.com`. */
let promesaYT = null;
export function cargarYoutubeAPI() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (promesaYT) return promesaYT;
  promesaYT = new Promise((resolver, rechazar) => {
    const anterior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { anterior?.(); resolver(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => rechazar(new Error('No se pudo cargar la librería de YouTube.'));
    document.head.appendChild(s);
  });
  return promesaYT;
}

/** Segundos a «12:04». */
export const reloj = (s) => {
  const n = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const g = n % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m)) + ':' + String(g).padStart(2, '0');
};

/* Los códigos de error que documenta YouTube. 100 es el único inequívoco; 101
   y 150 son el mismo caso —el dueño no deja reproducirlo fuera de YouTube— con
   dos números según la versión de la API. No conviene afirmar una causa con más
   certeza de la que se tiene. */
const PORQUE_NO = {
  2: 'El identificador del vídeo no es válido.',
  5: 'Este vídeo no se puede reproducir en este reproductor.',
  100: 'El vídeo se borró, o quien lo subió lo puso como privado.',
  101: 'Quien subió el vídeo no permite verlo fuera de YouTube.',
  150: 'Quien subió el vídeo no permite verlo fuera de YouTube.',
};

/**
 * Monta un reproductor propio dentro de `host`.
 *
 * @param {Element|string} host        dónde va
 * @param {object} o
 * @param {string} o.videoId           el identificador de YouTube
 * @param {string} [o.marca]           lo que dice la marca de agua
 * @param {boolean} [o.repetir]        volver a empezar al terminar (los cortos)
 * @param {boolean} [o.compacto]       mandos reducidos, para vídeo vertical
 * @param {number} [o.empezarEn]       segundo por el que arrancar
 * @param {Function} [o.alSonar]       se llama la primera vez que suena de verdad
 * @param {Function} [o.alFallar]      se llama con el motivo si no se puede ver
 * @param {Function} [o.alLatir]       cada segundo mientras suena, con el segundo actual
 * @returns {{el:Element, segundo:Function, saltarA:Function, jugando:Function, destruir:Function}}
 */
export async function crearReproductor(host, {
  videoId, marca = '', repetir = false, compacto = false, empezarEn = 0,
  alSonar = () => {}, alFallar = () => {}, alLatir = () => {},
} = {}) {
  const caja = typeof host === 'string' ? $(host) : host;
  if (!caja) return null;

  caja.innerHTML = `
    <div class="repro${compacto ? ' compacto' : ''}" tabindex="0">
      <div class="repro-video"><div class="repro-hueco"></div></div>
      <div class="repro-lamina" aria-hidden="true"></div>
      <div class="repro-agua" aria-hidden="true">${esc(marca)}</div>
      <button type="button" class="repro-grande" data-play aria-label="Reproducir">
        <span class="material-symbols-outlined">play_arrow</span></button>
      <div class="repro-mandos">
        <button type="button" class="repro-btn" data-play aria-label="Reproducir">
          <span class="material-symbols-outlined">play_arrow</span></button>
        <button type="button" class="repro-btn sec" data-atras aria-label="Diez segundos atrás">
          <span class="material-symbols-outlined">replay_10</span></button>
        <button type="button" class="repro-btn sec" data-alante aria-label="Diez segundos adelante">
          <span class="material-symbols-outlined">forward_10</span></button>
        <div class="repro-barra" role="slider" tabindex="0"
             aria-label="Ir a un punto del vídeo" aria-valuemin="0" aria-valuenow="0">
          <div class="repro-visto"></div><div class="repro-punto"></div>
        </div>
        <span class="repro-tiempo">0:00 / 0:00</span>
        <button type="button" class="repro-btn sec" data-mudo aria-label="Silenciar">
          <span class="material-symbols-outlined">volume_up</span></button>
        <button type="button" class="repro-btn sec" data-pantalla aria-label="Pantalla completa">
          <span class="material-symbols-outlined">fullscreen</span></button>
      </div>
    </div>`;

  const el = $('.repro', caja);
  const hueco = $('.repro-hueco', caja);
  const barra = $('.repro-barra', caja);
  const visto = $('.repro-visto', caja);
  const punto = $('.repro-punto', caja);
  const tiempo = $('.repro-tiempo', caja);

  /* El clic derecho no ofrece nada. No impide nada de verdad —quien quiera el
     enlace lo saca de otra forma— pero quita el camino de un solo clic. */
  el.oncontextmenu = (ev) => ev.preventDefault();

  let YT;
  try { YT = await cargarYoutubeAPI(); }
  catch { avisar(caja, 'No se pudo cargar el reproductor. Comprueba tu conexión.'); alFallar(null); return null; }

  let player = null, sono = false, fallo = false, jugando = false;
  let relojBarra = null, relojAgua = null, relojLatido = null;

  const seguro = (fn, porDefecto = 0) => {
    try { return fn(); } catch { return porDefecto; }
  };
  const segundo = () => seguro(() => Math.floor(player?.getCurrentTime?.() || 0));
  const duracion = () => seguro(() => Math.floor(player?.getDuration?.() || 0));

  player = new YT.Player(hueco, {
    videoId,
    host: 'https://www.youtube-nocookie.com',
    width: '100%', height: '100%',
    playerVars: {
      /* `controls: 0` quita la barra de YouTube entera. Es lo que permite poner
         la nuestra sin que se vean las dos. */
      controls: 0,
      /* Y `disablekb: 1` quita sus atajos de teclado, que incluyen el que abre
         el vídeo en YouTube. Los nuestros se enganchan más abajo. */
      disablekb: 1,
      fs: 0,               // su botón de pantalla completa; usamos el nuestro
      rel: 0,              // sin vídeos de otros canales al terminar
      iv_load_policy: 3,   // sin anotaciones encima
      modestbranding: 1,
      playsinline: 1,
      cc_load_policy: 0,
      origin: location.origin,
      ...(repetir ? { loop: 1, playlist: videoId } : {}),
    },
    events: {
      onReady: () => {
        if (empezarEn > 0) seguro(() => player.seekTo(empezarEn, true));
        pintarTiempo();
        moverAgua();
        relojAgua = setInterval(moverAgua, 8000);
      },
      onStateChange: (ev) => {
        if (fallo) return;
        jugando = ev.data === YT.PlayerState.PLAYING;
        pintarBoton();
        if (jugando) {
          if (!sono) { sono = true; alSonar(); }
          clearInterval(relojBarra);
          relojBarra = setInterval(pintarTiempo, 250);
          clearInterval(relojLatido);
          relojLatido = setInterval(() => alLatir(segundo()), 1000);
        } else {
          clearInterval(relojBarra); relojBarra = null;
          clearInterval(relojLatido); relojLatido = null;
          pintarTiempo();
        }
        if (ev.data === YT.PlayerState.ENDED && repetir) seguro(() => player.playVideo());
      },
      onError: (ev) => {
        fallo = true;
        limpiarRelojes();
        avisar(caja, PORQUE_NO[ev.data]
          || 'Puede que este vídeo todavía no se haya emparejado con la lección.');
        alFallar(ev.data);
      },
    },
  });

  /* ── los mandos ─────────────────────────────────────────────────────── */
  function pintarBoton() {
    $$('[data-play]', caja).forEach((b) => {
      b.querySelector('.material-symbols-outlined').textContent = jugando ? 'pause' : 'play_arrow';
      b.setAttribute('aria-label', jugando ? 'Pausar' : 'Reproducir');
    });
    el.classList.toggle('sonando', jugando);
  }

  function pintarTiempo() {
    const d = duracion(), s = segundo();
    const p = d ? Math.min(100, (100 * s) / d) : 0;
    visto.style.width = `${p}%`;
    punto.style.left = `${p}%`;
    tiempo.textContent = `${reloj(s)} / ${reloj(d)}`;
    barra.setAttribute('aria-valuemax', String(d));
    barra.setAttribute('aria-valuenow', String(s));
    barra.setAttribute('aria-valuetext', `${reloj(s)} de ${reloj(d)}`);
  }

  const alternar = () => {
    if (fallo) return;
    if (jugando) seguro(() => player.pauseVideo());
    else seguro(() => player.playVideo());
  };
  const saltarA = (s) => {
    if (fallo) return false;
    seguro(() => player.seekTo(Math.max(0, s), true));
    pintarTiempo();
    return true;
  };
  const mover = (d) => saltarA(segundo() + d);

  $$('[data-play]', caja).forEach((b) => { b.onclick = alternar; });
  $('[data-atras]', caja).onclick = () => mover(-10);
  $('[data-alante]', caja).onclick = () => mover(10);

  /* La lámina también reproduce y pausa: es lo que se espera al pulsar sobre
     un vídeo, y como se come el clic antes de que llegue a YouTube, ese gesto
     no abre nada. */
  $('.repro-lamina', caja).onclick = alternar;

  const mudo = $('[data-mudo]', caja);
  mudo.onclick = () => {
    const callado = seguro(() => player.isMuted(), false);
    seguro(() => (callado ? player.unMute() : player.mute()));
    mudo.querySelector('.material-symbols-outlined').textContent = callado ? 'volume_up' : 'volume_off';
    mudo.setAttribute('aria-label', callado ? 'Silenciar' : 'Quitar el silencio');
  };

  /* Pantalla completa la pide NUESTRO recuadro, no el <iframe>. Es la
     diferencia entre que la marca de agua siga puesta o desaparezca justo
     cuando más falta hace. */
  const pantalla = $('[data-pantalla]', caja);
  pantalla.onclick = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.().catch(() => {});
  };
  document.addEventListener('fullscreenchange', () => {
    const dentro = document.fullscreenElement === el;
    pantalla.querySelector('.material-symbols-outlined').textContent =
      dentro ? 'fullscreen_exit' : 'fullscreen';
    pantalla.setAttribute('aria-label', dentro ? 'Salir de pantalla completa' : 'Pantalla completa');
  });

  /* La barra: pulsar en un punto salta ahí, y arrastrar también. */
  const desdeElRaton = (ev) => {
    const r = barra.getBoundingClientRect();
    const x = Math.min(Math.max((ev.clientX ?? 0) - r.left, 0), r.width);
    return duracion() * (r.width ? x / r.width : 0);
  };
  let arrastrando = false;
  barra.addEventListener('pointerdown', (ev) => {
    arrastrando = true;
    barra.setPointerCapture?.(ev.pointerId);
    saltarA(desdeElRaton(ev));
  });
  barra.addEventListener('pointermove', (ev) => { if (arrastrando) saltarA(desdeElRaton(ev)); });
  barra.addEventListener('pointerup', () => { arrastrando = false; });
  barra.addEventListener('keydown', (ev) => {
    if (ev.key === 'ArrowRight') { ev.preventDefault(); mover(5); }
    if (ev.key === 'ArrowLeft') { ev.preventDefault(); mover(-5); }
  });

  /* Los atajos de siempre, ya que le quitamos los suyos a YouTube. Sólo cuando
     el foco está en el reproductor: en una página con una caja de texto al
     lado, espacio tiene que seguir escribiendo un espacio. */
  el.addEventListener('keydown', (ev) => {
    if (ev.target.closest('input, textarea, [contenteditable]')) return;
    const atajos = {
      ' ': alternar, k: alternar,
      ArrowRight: () => mover(5), ArrowLeft: () => mover(-5),
      j: () => mover(-10), l: () => mover(10),
      m: () => mudo.click(), f: () => pantalla.click(),
    };
    const hacer = atajos[ev.key];
    if (hacer) { ev.preventDefault(); hacer(); }
  });

  /* ── la marca de agua ───────────────────────────────────────────────────
     Va sobre nuestro recuadro, así que a pantalla completa sigue puesta. Se
     mueve entre sitios fijos: recortarla obligaría a recortar el vídeo. */
  const agua = $('.repro-agua', caja);
  const SITIOS = compacto
    ? [[10, 6], [10, 38], [62, 6], [62, 38], [38, 6]]
    : [[8, 6], [8, 42], [8, 74], [46, 6], [46, 74], [84, 6], [84, 42], [84, 74]];
  let k = Math.floor(Math.random() * SITIOS.length);
  function moverAgua() {
    if (!marca) return;
    const [top, left] = SITIOS[k % SITIOS.length];
    agua.style.top = `${top}%`;
    agua.style.left = `${left}%`;
    k += 3;
  }

  function limpiarRelojes() {
    clearInterval(relojBarra); relojBarra = null;
    clearInterval(relojAgua); relojAgua = null;
    clearInterval(relojLatido); relojLatido = null;
  }

  return {
    el,
    segundo,
    duracion,
    saltarA,
    jugando: () => jugando,
    reproducir: () => seguro(() => player.playVideo()),
    pausar: () => seguro(() => player.pauseVideo()),
    destruir() {
      limpiarRelojes();
      if (document.fullscreenElement === el) document.exitFullscreen?.().catch(() => {});
      try { player?.destroy(); } catch { /* ya no había nada que destruir */ }
      player = null;
    },
  };
}

/** El aviso propio que sustituye a la pantalla de error de Google. */
function avisar(caja, porque) {
  caja.innerHTML = `<div class="repro-sin">
    <span class="material-symbols-outlined">videocam_off</span>
    <b>Este vídeo no se puede reproducir todavía</b>
    <span>${esc(porque)} Avísale a tu profesor o a soporte.</span>
  </div>`;
}
