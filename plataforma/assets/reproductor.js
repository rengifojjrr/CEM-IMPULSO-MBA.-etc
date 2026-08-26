/* CEM · El reproductor de la casa
   ═══════════════════════════════════════════════════════════════════════════

   Por qué existe esto en vez de usar el reproductor de YouTube tal cual.

   Un <iframe> de YouTube trae SU interfaz: el título del vídeo arriba, el
   nombre del canal, el botón «Mirar en YouTube», el menú de compartir y el de
   copiar el enlace. Todo eso es una invitación a salirse de la plataforma — y
   fuera de la plataforma no hay marca de agua, no hay registro de quién vio
   qué, y no hay razón para haber pagado.

   Así que se hace lo contrario: se le quitan a YouTube TODOS los controles
   (`controls: 0`) y se deja su marco SIN recibir un solo evento de ratón
   (`pointer-events: none`, en styles.css). Sin eventos, YouTube no se entera de
   que hay nadie encima y no llega a dibujar su interfaz: no es que la tapemos,
   es que no existe. Y su menú del clic derecho —el que ofrece «Copiar
   vínculo»— tampoco, porque el clic derecho nunca llega hasta él.

   Encima va además una lámina transparente, pero ya sólo para recoger el clic
   de reproducir y pausar. Al principio era ella la defensa, y se paraba antes
   de la franja de los mandos para no pelearse con la barra: entre su borde y el
   de los mandos quedaba UN PÍXEL de vídeo al descubierto, a todo lo ancho, y se
   cruzaba cada vez que se bajaba el ratón a los controles. Un píxel bastaba
   para que saliera todo. Tapar con un rectángulo es un argumento de geometría,
   y la geometría se rompe sola en cuanto alguien cambia un alto.

   Queda un momento que nada de eso cubre: ANTES del primer play. Ahí el
   <iframe> dibuja su portada —título, canal, botón rojo, «Mirar en YouTube»—
   sin que nadie haya movido el ratón, porque ése es su estado de partida. Y es
   justo cuando la pantalla está quieta y todo el mundo la mira. Así que la
   portada la ponemos nosotros, con la imagen del propio vídeo y sin una letra
   encima; se quita al sonar y vuelve al terminar, que es cuando YouTube sacaría
   su pantalla de final.

   Y sobre todo eso van los mandos de la casa —reproducir, barra, saltar,
   volumen, pantalla completa y una rueda con velocidad, calidad y subtítulos—
   hablando con el reproductor por su API. Lo que se quitó con los controles de
   YouTube hay que devolverlo: un curso sin poder ir a 1,25× o sin poder subir
   la calidad es peor curso, y el motivo para quitarlos era el botón que llevaba
   a YouTube, no la calidad.

   ── Lo que esto SÍ consigue ────────────────────────────────────────────────
   · No se ve el título ni el canal ni el botón de YouTube, ni reproduciendo, ni
     antes de empezar, ni al terminar.
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

import { $, $$, esc } from './app.js?v=2026-08-26-10';

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
 * @param {Function} [o.alTerminar]    se llama cuando el vídeo llega al final
 * @returns {{el:Element, segundo:Function, saltarA:Function, jugando:Function, destruir:Function}}
 */
export async function crearReproductor(host, {
  videoId, marca = '', repetir = false, compacto = false, empezarEn = 0,
  alSonar = () => {}, alFallar = () => {}, alLatir = () => {}, alTerminar = () => {},
} = {}) {
  const caja = typeof host === 'string' ? $(host) : host;
  if (!caja) return null;

  caja.innerHTML = `
    <div class="repro${compacto ? ' compacto' : ''}" tabindex="0">
      <div class="repro-video"><div class="repro-hueco"></div></div>
      <img class="repro-tapa" alt="" aria-hidden="true">
      <div class="repro-lamina" aria-hidden="true"></div>
      <div class="repro-velo" aria-hidden="true"></div>
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
        <button type="button" class="repro-btn sec" data-ajustes aria-label="Ajustes"
                aria-haspopup="dialog" aria-expanded="false">
          <span class="material-symbols-outlined">settings</span></button>
        <button type="button" class="repro-btn sec" data-pantalla aria-label="Pantalla completa">
          <span class="material-symbols-outlined">fullscreen</span></button>
      </div>
      <div class="repro-panel" role="dialog" aria-label="Ajustes del vídeo" hidden></div>
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

  /* ── La portada ───────────────────────────────────────────────────────────
     Quitarle a YouTube los eventos de ratón impide que dibuje su interfaz…
     mientras reproduce. ANTES del primer play no hace falta ratón ninguno: el
     <iframe> enseña su portada con el título, el canal, su botón rojo y «Mirar
     en YouTube» porque ése es su estado inicial, no una reacción a nada. Y ése
     es justo el momento en que todo el mundo mira la pantalla.

     Así que la portada la ponemos nosotros: la misma imagen del vídeo, sin una
     letra encima. Se quita en cuanto suena de verdad y vuelve al terminar, que
     es cuando YouTube sacaría su pantalla de final. */
  const tapa = $('.repro-tapa', caja);
  /* La portada tapa desde el primer instante con su propio negro, sin pedir
     nada. La imagen del vídeo llega después, y sólo si el vídeo existe: pedirla
     a ciegas dejaba un 404 en la consola por cada lección del catálogo de
     ejemplo, que llevan identificadores de mentira a la espera del material
     real. Un error en la consola que se sabe que va a estar es un error que
     enseña a no mirar la consola. */
  const miniatura = (cual) => `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/${cual}.jpg`;
  function ponerImagen() {
    if (fallo || tapa.getAttribute('src')) return;
    /* No se pide la miniatura hasta saber que el vídeo EXISTE, y eso se sabe
       porque YouTube ya dio su título. Antes se esperaba un plazo fijo y se
       pedía; con los identificadores de relleno del catálogo de ejemplo, el
       plazo se agotaba antes de que llegara el error y quedaba un 404 en la
       consola por cada lección sin vídeo real. Un plazo es una carrera, no una
       comprobación. */
    if (!seguro(() => player.getVideoData()?.title, '')) return;
    /* Se pide `oardefault`, que es la miniatura con la proporción ORIGINAL del
       vídeo. Importa para el vídeo vertical: `hqdefault` viene siempre en 4:3
       con el vertical encajado en una columna estrecha entre dos franjas
       negras, y recortar ESO para llenar un marco 9:16 deja la columna
       ampliada hasta que sólo se ve un trozo del centro. Cortado, y mal.

       Para un vídeo apaisado YouTube contesta a `oardefault` con un sello de
       120×90 en vez de la imagen: por eso no basta con mirar si la petición
       falló, hay que mirar el tamaño de lo que llegó.

       Y `hqdefault` como respaldo, no `maxresdefault`: la grande sólo existe
       para los vídeos subidos en alta, y pedirla dejaba un 404 en la consola
       por cada vídeo antiguo. */
    tapa.onload = () => {
      if (tapa.dataset.respaldo) return;
      if (tapa.naturalWidth >= 200) return;      // la buena, con su proporción
      tapa.dataset.respaldo = '1';
      tapa.src = miniatura('hqdefault');
    };
    tapa.onerror = () => {
      if (tapa.dataset.respaldo) { tapa.removeAttribute('src'); return; }   // queda el negro
      tapa.dataset.respaldo = '1';
      tapa.src = miniatura('hqdefault');
    };
    /* `oardefault` sólo en el marco vertical, que es donde hace falta.
       Se creía que existía siempre —devolviendo un sello de 120×90 para los
       apaisados— y no: para muchos vídeos de 16:9 contesta 404. Pedirla a todos
       dejaba un error en la consola por cada clase normal, y un error que se
       sabe que va a estar es un error que enseña a no mirar la consola.
       `hqdefault` existe para todos, y en un marco 16:9 recorta bien. */
    tapa.src = miniatura(compacto ? 'oardefault' : 'hqdefault');
  }

  let YT;
  try { YT = await cargarYoutubeAPI(); }
  catch { avisar(caja, 'No se pudo cargar el reproductor. Comprueba tu conexión.'); alFallar(null); return null; }

  let player = null, sono = false, fallo = false, jugando = false;
  let relojBarra = null, relojAgua = null, relojLatido = null, relojPanel = null;

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
        pintarMudo();
        aplicarPreferencias();
        /* Un margen antes de pedir la imagen: si el vídeo no se puede ver,
           `onError` llega justo después de `onReady` y así no se pide nada. */
        setTimeout(ponerImagen, 700);
        moverAgua();
        relojAgua = setInterval(moverAgua, 8000);
      },
      onStateChange: (ev) => {
        if (fallo) return;
        // En cuanto YouTube da señales de vida sabe ya el título, así que es el
        // momento de poner la portada — y no antes, a ciegas y con un plazo.
        ponerImagen();
        jugando = ev.data === YT.PlayerState.PLAYING;
        pintarBoton();
        if (jugando) {
          /* Ya hay imagen de verdad debajo: fuera la portada. */
          el.classList.add('arrancado');
          if (!sono) { sono = true; alSonar(); aplicarPreferencias(); }
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
        /* Al terminar, YouTube saca su pantalla de final —con su logo y su
           invitación a seguir en YouTube—. Vuelve la portada por encima. */
        else if (ev.data === YT.PlayerState.ENDED) { el.classList.remove('arrancado'); alTerminar(); }
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
  $('.repro-lamina', caja).onclick = () => {
    /* Con el panel de ajustes abierto, tocar el vídeo lo cierra y nada más:
       pausar además sería castigar el gesto de descartar un menú. */
    if (!panel.hidden) { cerrarPanel(); return; }
    alternar();
  };

  const mudo = $('[data-mudo]', caja);
  function pintarMudo() {
    const callado = seguro(() => player.isMuted(), false) || seguro(() => player.getVolume(), 100) === 0;
    mudo.querySelector('.material-symbols-outlined').textContent = callado ? 'volume_off' : 'volume_up';
    mudo.setAttribute('aria-label', callado ? 'Quitar el silencio' : 'Silenciar');
  }
  mudo.onclick = () => {
    const callado = seguro(() => player.isMuted(), false);
    seguro(() => (callado ? player.unMute() : player.mute()));
    pintarMudo();
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

  /* ── ajustes: velocidad, calidad, subtítulos y volumen ──────────────────
     Al quitarle a YouTube sus controles se le quitó también su rueda dentada,
     y con ella la calidad y la velocidad. Aquí vuelven, pero puestas por
     nosotros y sin la puerta a YouTube que traía aquel menú.

     Una advertencia sobre la calidad, porque es la que se malinterpreta:
     `setPlaybackQuality` es una PETICIÓN, no una orden. YouTube sirve el vídeo
     por tramos y decide el tramo según la conexión de cada uno; si no da, baja
     la calidad por su cuenta y no avisa. Por eso el panel no enseña lo que se
     pidió sino lo que hay puesto de verdad (`getPlaybackQuality`), y lo dice
     con palabras. Un selector que jurara «1080p» mientras se está viendo 480p
     sería peor que no tenerlo.

     La lista de calidades tampoco existe hasta que el vídeo ha empezado a
     cargar, así que el panel se construye cada vez que se abre y no una sola
     vez al montar. */
  const panel = $('.repro-panel', caja);
  const gear = $('[data-ajustes]', caja);

  const NOMBRE_CALIDAD = {
    highres: 'Máxima', hd2160: '2160p', hd1440: '1440p', hd1080: '1080p',
    hd720: '720p', large: '480p', medium: '360p', small: '240p', tiny: '144p',
  };

  /* Las preferencias se recuerdan en este navegador: quien estudia a 1,25×
     no quiere volver a ponerlo en cada lección. */
  const CLAVE_PREFS = 'cem.repro.prefs';
  const leerPrefs = () => {
    try { return JSON.parse(localStorage.getItem(CLAVE_PREFS)) || {}; } catch { return {}; }
  };
  const guardarPref = (k, v) => {
    try { localStorage.setItem(CLAVE_PREFS, JSON.stringify({ ...leerPrefs(), [k]: v })); }
    catch { /* sin sitio o en modo privado: se pierde la preferencia, nada más */ }
  };

  /* Los subtítulos NO se apagan por defecto a propósito. Quien los lleva
     puestos en YouTube puede necesitarlos, y decidir por él sería quitarle una
     ayuda sin preguntarle. Se ofrecen las tres opciones y sólo mandamos sobre
     YouTube cuando alguien elige. */
  const ponerSubtitulos = (v) => {
    if (v === 'si') seguro(() => player.loadModule('captions'));
    if (v === 'no') seguro(() => player.unloadModule('captions'));
  };

  /* Lo que se eligió la última vez se vuelve a poner al abrir la siguiente
     lección. La velocidad y el volumen agarran en cuanto el reproductor está
     listo; la calidad y los subtítulos hay que repetirlos cuando el vídeo
     empieza a sonar, porque antes de eso YouTube todavía no tiene ni la lista
     de calidades ni el módulo de subtítulos cargado. */
  function aplicarPreferencias() {
    const pref = leerPrefs();
    if (pref.velocidad) seguro(() => player.setPlaybackRate(Number(pref.velocidad)));
    if (pref.calidad && pref.calidad !== 'default') seguro(() => player.setPlaybackQuality(pref.calidad));
    if (pref.subtitulos) ponerSubtitulos(pref.subtitulos);
    if (pref.volumen != null) seguro(() => player.setVolume(Number(pref.volumen)));
  }

  /* Cuántas calidades había la última vez que se pintó. Sirve para repintar el
     panel solo cuando de verdad cambia algo: si se repintara cada segundo a
     ciegas, arrastrar el volumen sería imposible. */
  let ultimasCalidades = [];

  const grupo = (titulo, clave, ops) => `
    <div class="repro-grupo"><h4>${esc(titulo)}</h4>
      ${ops.map((o) => `<button type="button" class="repro-op${o.on ? ' on' : ''}"
          data-clave="${esc(clave)}" data-valor="${esc(o.v)}">
          <span class="material-symbols-outlined">${o.on ? 'check' : ''}</span>
          <span>${esc(o.t)}</span></button>`).join('')}
    </div>`;

  function pintarPanel() {
    if (panel.hidden) return;
    const pref = leerPrefs();
    const partes = [];

    const ritmos = seguro(() => player.getAvailablePlaybackRates(), []) || [];
    if (ritmos.length > 1) {
      const ahora = seguro(() => player.getPlaybackRate(), 1);
      partes.push(grupo('Velocidad', 'velocidad', ritmos.map((r) => ({
        v: String(r), t: r === 1 ? 'Normal' : `${String(r).replace('.', ',')}×`,
        on: Math.abs(r - ahora) < 0.001,
      }))));
    }

    /* La calidad SIEMPRE tiene su sitio, aunque todavía no haya nada que
       elegir. YouTube no dice qué calidades tiene hasta que el vídeo empieza a
       cargar, y la primera versión de esto se limitaba a no dibujar la sección:
       quien abría los ajustes antes de darle al play no veía la calidad por
       ningún lado y concluía, con razón, que no estaba. Decir «todavía no» es
       información; callar parece una falta. */
    const niveles = ultimasCalidades = (seguro(() => player.getAvailableQualityLevels(), []) || [])
      .filter((q) => q !== 'auto' && NOMBRE_CALIDAD[q]);
    if (niveles.length) {
      const real = seguro(() => player.getPlaybackQuality(), '') || '';
      const pedida = pref.calidad || 'default';
      partes.push(grupo('Calidad', 'calidad', [
        { v: 'default', on: pedida === 'default',
          t: `Automática${NOMBRE_CALIDAD[real] ? ` (${NOMBRE_CALIDAD[real]} ahora)` : ''}` },
        ...niveles.map((q) => ({ v: q, t: NOMBRE_CALIDAD[q], on: pedida === q })),
      ]));
      partes.push('<p class="repro-nota">YouTube tiene la última palabra: si tu conexión no da, la baja por su cuenta.</p>');
    } else {
      partes.push(`<div class="repro-grupo"><h4>Calidad</h4>
        <p class="repro-espera">Dale al play y aquí aparecen las calidades de este vídeo.</p></div>`);
    }

    partes.push(grupo('Subtítulos', 'subtitulos', [
      { v: 'youtube', t: 'Como los tengas en YouTube', on: !pref.subtitulos || pref.subtitulos === 'youtube' },
      { v: 'si', t: 'Activados', on: pref.subtitulos === 'si' },
      { v: 'no', t: 'Desactivados', on: pref.subtitulos === 'no' },
    ]));

    const vol = seguro(() => Math.round(player.getVolume()), 100);
    partes.push(`<div class="repro-grupo"><h4>Volumen</h4>
      <div class="repro-vol"><input type="range" min="0" max="100" value="${vol}"
        aria-label="Volumen" data-vol></div></div>`);

    panel.innerHTML = partes.join('');
    $$('.repro-op', panel).forEach((b) => {
      b.onclick = () => aplicar(b.dataset.clave, b.dataset.valor);
    });
    const rango = $('[data-vol]', panel);
    if (rango) rango.oninput = () => {
      const v = Number(rango.value);
      seguro(() => player.setVolume(v));
      seguro(() => (v === 0 ? player.mute() : player.unMute()));
      guardarPref('volumen', v);
      pintarMudo();
    };
  }

  function aplicar(clave, valor) {
    if (clave === 'velocidad') seguro(() => player.setPlaybackRate(Number(valor)));
    if (clave === 'calidad') seguro(() => player.setPlaybackQuality(valor));
    if (clave === 'subtitulos') ponerSubtitulos(valor);
    guardarPref(clave, valor);
    /* La calidad se repinta un momento después: YouTube tarda en cambiar de
       tramo, y preguntarle en el acto devolvería todavía la de antes. */
    if (clave === 'calidad') setTimeout(pintarPanel, 900);
    else pintarPanel();
  }

  const cerrarPanel = () => {
    panel.hidden = true;
    gear.setAttribute('aria-expanded', 'false');
    clearInterval(relojPanel); relojPanel = null;
  };
  gear.onclick = (ev) => {
    ev.stopPropagation();
    if (!panel.hidden) { cerrarPanel(); return; }
    panel.hidden = false;
    gear.setAttribute('aria-expanded', 'true');
    pintarPanel();
    /* Con el panel abierto se vigila la lista de calidades: si alguien abre los
       ajustes y desde ahí le da al play, la sección se rellena sola en cuanto
       YouTube contesta, sin tener que cerrar y volver a abrir. Sólo se repinta
       cuando la lista cambia de verdad. */
    clearInterval(relojPanel);
    relojPanel = setInterval(() => {
      if (panel.hidden) { clearInterval(relojPanel); relojPanel = null; return; }
      const ahora = (seguro(() => player.getAvailableQualityLevels(), []) || [])
        .filter((q) => q !== 'auto' && NOMBRE_CALIDAD[q]);
      if (ahora.length !== ultimasCalidades.length) pintarPanel();
    }, 900);
  };
  panel.addEventListener('click', (ev) => ev.stopPropagation());
  el.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') cerrarPanel(); });

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
    clearInterval(relojPanel); relojPanel = null;
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
