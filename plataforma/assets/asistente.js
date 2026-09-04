/* La cara del asistente: el botón, la ventana y la conversación.
   ═══════════════════════════════════════════════════════════════════════════

   Son dos asistentes con la misma ventana. Lo único que cambia entre uno y
   otro es el `ambito` que se manda, y ni siquiera eso decide nada: el servidor
   comprueba quién pregunta y devuelve el ámbito que le toque. Pedir «equipo»
   desde la consola del navegador no convierte a nadie en administrador.

   Se monta solo desde `mount()`, así que no hay que acordarse en cada una de
   las 82 pantallas —y, sobre todo, no hay ninguna que se quede sin él porque a
   alguien se le olvidara.

   Lo que NO hace, y por qué
   ---------------------------------------------------------------------------
   No lee datos de nadie por su cuenta. Todo lo que sabe de quien pregunta se
   lo da el servidor con el token de esa persona. Aquí no hay ni una consulta
   a una tabla de personas: si la hubiera, el permiso viviría en el navegador,
   que es el único sitio donde no se puede defender. */

import { sb, $, esc, profile } from './app.js?v=2026-09-04-3';

/* ── Cómo se llama y qué cara tiene ──────────────────────────────────────── */
/* El nombre y el render salen de `cem_settings`, no de aquí. El dibujo
   vectorial es el respaldo: en cuanto suban el render de verdad desde
   Configuración, esto usa el render y el vector deja de verse. */
const NOMBRE_POR_DEFECTO = 'Cemi';
let AJUSTES = null;
let pidiendoAjustes = null;

/* Se piden UNA vez, aunque llamen quince.
   ───────────────────────────────────────────────────────────────────────────
   Sin la promesa guardada, cada pantalla que quiera dibujar la mascota lanza
   su propia consulta, y las que lleguen mientras la primera está en el aire
   ven `AJUSTES` todavía en null. */
async function ajustes() {
  if (AJUSTES) return AJUSTES;
  if (pidiendoAjustes) return pidiendoAjustes;
  pidiendoAjustes = (async () => {
    const leidos = { nombre: NOMBRE_POR_DEFECTO, foto: null };
    try {
      const { data } = await sb.from('cem_settings').select('clave, valor')
        .in('clave', ['asistente_nombre', 'mascota_url']);
      for (const f of data ?? []) {
        const v = typeof f.valor === 'string' ? f.valor : f.valor?.valor ?? f.valor;
        if (f.clave === 'asistente_nombre' && v) leidos.nombre = String(v);
        if (f.clave === 'mascota_url' && v) leidos.foto = String(v);
      }
    } catch { /* si falla, se queda con el nombre y el dibujo de casa */ }
    AJUSTES = leidos;
    ponerLaCaraDeVerdad();
    return AJUSTES;
  })();
  return pidiendoAjustes;
}

/* Cambiar el dibujo por el render en lo que YA se pintó.
   ───────────────────────────────────────────────────────────────────────────
   Esto existe por un fallo que se vio en producción: la pantalla del asistente
   pinta el retrato nada más cargar, cuando los ajustes todavía van por el
   aire. Se quedaba con el dibujo de respaldo y no lo cambiaba nunca, así que
   subir el render de la casa no servía de nada: la foto estaba guardada y la
   pantalla seguía enseñando el vector.

   Se podría arreglar haciendo que cada pantalla espere los ajustes antes de
   pintar, pero entonces habría que acordarse en cada una, y la que se olvide
   vuelve a fallar en silencio. Así se arregla solo, venga de donde venga. */
function ponerLaCaraDeVerdad(raiz = document) {
  if (!AJUSTES?.foto) return;
  for (const img of raiz.querySelectorAll('img[data-mascota]')) {
    if (img.src !== AJUSTES.foto) img.src = AJUSTES.foto;
  }
}

// Se piden en cuanto se carga el módulo, no cuando alguien las necesita: así
// suelen estar listas antes del primer dibujo y no hace falta ningún cambio.
ajustes();

function raizAssets() {
  return location.pathname.includes('/admin/')
    || location.pathname.includes('/estudiante/')
    || location.pathname.includes('/docente/') ? '../assets/' : './assets/';
}

/** La carita, para el botón y para cada respuesta. */
export function caraMascota(clase = '') {
  const src = AJUSTES?.foto || (raizAssets() + 'mascota-cara.svg');
  return `<img class="mascota ${clase}" data-mascota="cara" src="${esc(src)}" alt="" aria-hidden="true">`;
}

/** El bicho entero, para pantallas donde hay sitio. */
export function mascotaEntera(clase = '') {
  const src = AJUSTES?.foto || (raizAssets() + 'mascota.svg');
  return `<img class="mascota-entera ${clase}" data-mascota="entera" src="${esc(src)}" alt="La mascota del CEM">`;
}

/* ── Estado de la ventana ────────────────────────────────────────────────── */
let conversacion = null;
let ambitoActual = 'estudiante';
let enviando = false;
let montado = false;

/* ── La conversación sobrevive a cambiar de pantalla ─────────────────────
   ═══════════════════════════════════════════════════════════════════════════
   Antes, minimizar y seguir en la misma pantalla conservaba el hilo, pero
   pasar a otra pantalla lo borraba: el módulo se vuelve a cargar y con él las
   variables. Y es justo lo que pasa siempre — se le pregunta a Cemi dónde se
   hace algo, se va uno a hacerlo, y al volver el hilo no está.

   Se guarda en `sessionStorage` y no en `localStorage` a propósito: vive
   mientras dure la pestaña. Una conversación de trabajo de hace tres días
   reaparecida al abrir el portal no es memoria, es ruido.

   Lo que se guarda es el HTML de las burbujas, no los mensajes sueltos. El
   registro de verdad está en la base (`cem_bot_mensajes`); esto es sólo para
   no perder de vista lo que ya se leyó. */
const CAJON = 'cemChatHilo';

function guardarHilo() {
  const lista = $('#chatLista');
  if (!lista) return;
  try {
    sessionStorage.setItem(CAJON, JSON.stringify({
      conversacion, ambito: ambitoActual,
      html: lista.innerHTML.replace(/<div class="chat-linea suya" id="chatPensando">[\s\S]*?<\/div><\/div>/g, ''),
    }));
  } catch { /* modo privado, cuota llena: no perder el hilo no vale un error */ }
}

function hiloGuardado() {
  try {
    const g = JSON.parse(sessionStorage.getItem(CAJON) || 'null');
    // El ámbito importa: el hilo del equipo no se le enseña a un estudiante
    // que entre después en la misma pestaña.
    if (!g || !g.html || g.ambito !== ambitoActual) return null;
    return g;
  } catch { return null; }
}

function olvidarHilo() {
  conversacion = null;
  try { sessionStorage.removeItem(CAJON); } catch {}
}

const PRIMERAS = {
  /* Un visitante no pregunta «cómo voy»: no va por ningún sitio todavía.
     Pregunta lo que pregunta alguien de pie en la puerta. */
  visitante: [
    'Que programas tienen?',
    'Cuanto cuesta y como se paga?',
    'Cuanto dura y como son las clases?',
    'Avisenme cuando abra la proxima',
  ],
  estudiante: [
    'Como voy en mi curso?',
    'Cuando vence mi proxima cuota?',
    'Donde veo mi certificado?',
    'Que programas hay?',
  ],
  equipo: [
    'Cuantas cuotas estan vencidas?',
    'Cuantos contactos sin atender hay?',
    'Donde se emite un certificado?',
    'Como matriculo a alguien?',
  ],
};

/* ── Dibujar ─────────────────────────────────────────────────────────────── */
function burbuja(quien, texto, extra = '') {
  const mio = quien === 'persona';
  return `<div class="chat-linea ${mio ? 'mia' : 'suya'}">
    ${mio ? '' : caraMascota('chica')}
    <div class="chat-burbuja">${esc(texto).replace(/\n/g, '<br>')}${extra}</div>
  </div>`;
}

function pintar(quien, texto, extra = '') {
  const lista = $('#chatLista');
  if (!lista) return;
  lista.insertAdjacentHTML('beforeend', burbuja(quien, texto, extra));
  lista.scrollTop = lista.scrollHeight;
  guardarHilo();
}

/* ── El botón que lleva a la pantalla de la que se está hablando ──────────
   Quién decide el destino es el servidor: allí se sabe qué herramienta se usó
   y, sobre todo, qué rol tiene quien pregunta. Aquí sólo se dibuja.

   La ruta llega desde la raíz del sitio («plataforma/admin/…») y hay que
   volverla relativa a la pantalla actual, que puede estar a dos carpetas de
   profundidad. Se hace con `new URL` sobre el origen y no pegando trozos de
   texto: pegar trozos es como se llega a «../../plataforma/plataforma/». */
function botonDeIr(ir) {
  if (!ir?.ruta || !ir?.titulo) return '';
  let destino;
  try { destino = new URL(ir.ruta, location.origin + '/').href; } catch { return ''; }
  return `<a class="chat-ir" href="${esc(destino)}">
    <span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span>
    <span>Ir a ${esc(ir.titulo)}</span></a>`;
}

function pensando(si) {
  const lista = $('#chatLista');
  if (!lista) return;
  $('#chatPensando')?.remove();
  if (!si) return;
  lista.insertAdjacentHTML('beforeend',
    `<div class="chat-linea suya" id="chatPensando">${caraMascota('chica')}
      <div class="chat-burbuja pensando"><span></span><span></span><span></span></div>
    </div>`);
  lista.scrollTop = lista.scrollHeight;
}

/* ── Hablar ──────────────────────────────────────────────────────────────── */
async function abrirConversacion(canal = 'web') {
  if (conversacion) return conversacion;
  /* Un visitante no puede abrirla: `cem_bot_abrir` cuelga la conversación de
     una persona, y aquí no hay ninguna. La abre el servidor al recibir el
     primer mensaje y la devuelve en la respuesta. */
  if (ambitoActual === 'visitante') return null;
  const { data, error } = await sb.rpc('cem_bot_abrir',
    { p_ambito: ambitoActual, p_canal: canal });
  if (error) throw error;
  conversacion = data?.id ?? data?.[0]?.id ?? null;
  return conversacion;
}

/* Una marca del navegador para separar conversaciones de visitantes distintos.
   NO identifica a nadie y no se usa para nada más: el tope de gasto que de
   verdad protege es el global, que no depende de esto. */
function huellaVisitante() {
  const CLAVE = 'cemHuella';
  try {
    let h = localStorage.getItem(CLAVE);
    if (!h) {
      h = (crypto.randomUUID?.() || String(Math.random())).replace(/-/g, '').slice(0, 24);
      localStorage.setItem(CLAVE, h);
    }
    return h;
  } catch { return 'sin-huella'; }
}

async function preguntar(texto) {
  if (enviando || !texto.trim()) return;
  enviando = true;
  $('#chatEnviar')?.setAttribute('disabled', '');
  pintar('persona', texto);
  $('#chatSugerencias')?.remove();
  pensando(true);

  try {
    await abrirConversacion();
    const { data, error } = await sb.functions.invoke('cem-asistente', {
      body: {
        pregunta: texto, ambito: ambitoActual, conversacion,
        ...(ambitoActual === 'visitante' ? { huella: huellaVisitante() } : {}),
      },
    });
    pensando(false);
    if (error) throw error;
    // En el camino del visitante la conversación la abre el servidor.
    if (ambitoActual === 'visitante' && data?.conversacion) conversacion = data.conversacion;

    /* Que el asistente conteste no quiere decir que la respuesta sea buena.
       Cuando el modelo falla, el servidor manda una frase de cortesía y marca
       `degradado`. Si esa marca no se enseñara, la única señal de que el
       asistente está caído sería que empieza a contestar raro, y eso se
       descubre tarde y por un cliente. */
    const aviso = data?.degradado
      ? '<div class="chat-aviso">No pude consultar bien ahora mismo. Ya avisé al equipo.</div>'
      : '';
    pintar('asistente', data?.respuesta || 'No pude responder ahora mismo.',
      aviso + botonDeIr(data?.ir));
  } catch (e) {
    pensando(false);
    /* El mismo aviso que cuando el servidor marca `degradado`.
       ─────────────────────────────────────────────────────────────────────
       Aquí se cae por otra razón —la función no responde siquiera—, pero para
       quien mira la pantalla es lo mismo, y sin el aviso la frase de cortesía
       se lee como que el asistente no quiere contestar. Alguien del equipo
       tiene que poder distinguir «no lo sé» de «estoy roto». */
    pintar('asistente', 'Ahorita no te puedo responder. Ya aviso al equipo para que te escriban.',
      '<div class="chat-aviso">No pude consultar ahora mismo. Ya avisé al equipo.</div>');
    console.error('[asistente]', e);
  } finally {
    enviando = false;
    $('#chatEnviar')?.removeAttribute('disabled');
    $('#chatTexto')?.focus();
  }
}

/* ── La ventana ──────────────────────────────────────────────────────────── */
async function abrirVentana() {
  const caja = $('#cemChat');
  if (!caja) return;
  caja.hidden = false;
  caja.classList.add('abierto');
  $('#cemChatBoton')?.setAttribute('aria-expanded', 'true');
  document.body.classList.add('con-chat-abierto');
  $('#chatTexto')?.focus();

  if ($('#chatLista')?.children.length) return;   // ya se cargó antes

  /* ¿Había una conversación a medias? Se retoma donde estaba, con el mismo
     identificador, así que el servidor sigue teniendo el hilo entero y Cemi
     no vuelve a preguntar lo que ya le dijeron. */
  const guardado = hiloGuardado();
  if (guardado) {
    conversacion = guardado.conversacion || null;
    const lista = $('#chatLista');
    lista.innerHTML = guardado.html;
    lista.scrollTop = lista.scrollHeight;
    ponerLaCaraDeVerdad(lista);
    $('#chatNuevo')?.removeAttribute('hidden');
    return;
  }

  await saludar();
}

/** El saludo y las cuatro sugerencias del principio. */
async function saludar() {
  const a = await ajustes();
  const sug = (PRIMERAS[ambitoActual] || PRIMERAS.estudiante)
    .map((s) => `<button type="button" class="chat-sug">${esc(s)}</button>`).join('');
  pintar('asistente', ambitoActual === 'equipo'
    ? `Hola. Soy ${a.nombre}. Pregúntame por las cifras del centro o por dónde se hace cada cosa.`
    : `Hola. Soy ${a.nombre}, del CEM. En qué te ayudo?`);
  $('#chatLista').insertAdjacentHTML('beforeend',
    `<div class="chat-sugerencias" id="chatSugerencias">${sug}</div>`);
  guardarHilo();
}

/* Empezar de cero. La conversación anterior NO se borra de la base —queda en
   el registro, que es donde tiene que quedar—: lo que se suelta es el hilo que
   se le manda al modelo, para que una pregunta nueva no arrastre el contexto
   de la anterior. Eso es justamente lo que se pide cuando se pide empezar de
   nuevo. */
async function empezarDeNuevo() {
  if (enviando) return;
  olvidarHilo();
  const lista = $('#chatLista');
  if (lista) lista.innerHTML = '';
  $('#chatNuevo')?.setAttribute('hidden', '');
  await saludar();
  $('#chatTexto')?.focus();
}

function cerrarVentana() {
  const caja = $('#cemChat');
  if (!caja) return;
  caja.classList.remove('abierto');
  caja.hidden = true;
  $('#cemChatBoton')?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('con-chat-abierto');
  $('#cemChatBoton')?.focus();
}

/* ── Montarlo ────────────────────────────────────────────────────────────── */
/**
 * Se llama desde `mount()`. `ambito` es lo que la pantalla CREE que
 * corresponde; el servidor tiene la última palabra.
 */
export async function montarAsistente({ ambito = 'estudiante' } = {}) {
  if (montado) return;
  /* Sin sesión no había asistente. Era cierto mientras el asistente sólo sabía
     hablar de datos de alguien: sin persona, no hay nada que contar.

     Con el ámbito de visitante ya no: ese Cemi no sabe nada de nadie —sólo el
     catálogo— y existe justo para quien todavía no ha entrado. Seguir
     exigiendo sesión aquí lo dejaría montado en las 62 pantallas privadas y en
     ninguna de las 15 públicas, que es donde hay dudas de compra. */
  const p = await profile();
  if (!p && ambito !== 'visitante') return;
  montado = true;
  ambitoActual = ambito === 'equipo' ? 'equipo'
               : ambito === 'visitante' ? 'visitante' : 'estudiante';
  const a = await ajustes();

  document.body.insertAdjacentHTML('beforeend', `
    <button type="button" id="cemChatBoton" class="chat-boton"
            aria-expanded="false" aria-controls="cemChat"
            title="Preguntarle a ${esc(a.nombre)}">
      ${caraMascota()}
      <span class="chat-boton-txt">${esc(a.nombre)}</span>
    </button>
    <section id="cemChat" class="chat-caja" hidden role="dialog" aria-modal="false"
             aria-label="Chat con ${esc(a.nombre)}">
      <header class="chat-cab">
        ${caraMascota('chica')}
        <div>
          <b>${esc(a.nombre)}</b>
          <span class="tiny muted">${ambitoActual === 'equipo' ? 'Asistente del equipo'
            : ambitoActual === 'visitante' ? 'Te cuento de los programas' : 'Asistente del CEM'}</span>
        </div>
        <!-- Sólo aparece cuando hay algo que dejar atrás. Un botón de
             «empezar de nuevo» sobre una conversación vacía no hace nada y
             ocupa el sitio del que sí importa. -->
        <button type="button" class="icon-btn" id="chatNuevo" hidden
                title="Empezar una conversación nueva" aria-label="Empezar una conversación nueva">
          <span class="material-symbols-outlined" aria-hidden="true">refresh</span></button>
        <button type="button" class="icon-btn" id="chatCerrar" title="Minimizar" aria-label="Minimizar">
          <span class="material-symbols-outlined" aria-hidden="true">close</span></button>
      </header>
      <div class="chat-lista" id="chatLista"></div>
      <form class="chat-pie" id="chatForm">
        <input id="chatTexto" type="text" autocomplete="off" maxlength="1500"
               placeholder="Escribe tu pregunta">
        <button class="btn primary icon-btn" id="chatEnviar" type="submit" title="Enviar" aria-label="Enviar">
          <span class="material-symbols-outlined" aria-hidden="true">send</span></button>
      </form>
    </section>`);

  $('#cemChatBoton').onclick = () =>
    ($('#cemChat').hidden ? abrirVentana() : cerrarVentana());
  $('#chatCerrar').onclick = cerrarVentana;
  $('#chatNuevo').onclick = empezarDeNuevo;
  $('#chatForm').onsubmit = (e) => {
    e.preventDefault();
    const t = $('#chatTexto').value;
    $('#chatTexto').value = '';
    $('#chatNuevo')?.removeAttribute('hidden');   // ya hay algo que dejar atrás
    preguntar(t);
  };

  /* El botón de la mascota avisa cuando hay una conversación a medias, para
     que se note que sigue ahí sin tener que abrirla. */
  if (hiloGuardado()) $('#cemChatBoton').classList.add('con-hilo');
  /* Delegado y no un `onclick` por botón: las sugerencias se borran en cuanto
     se manda la primera pregunta, así que atarlas una a una obliga a volver a
     atarlas cada vez que se repintan. */
  $('#chatLista').addEventListener('click', (e) => {
    const b = e.target.closest('.chat-sug');
    if (b) preguntar(b.textContent);
  });
  /* Escape cierra. En el escritorio es un reflejo, y que no pase nada se
     siente como que la página se colgó. */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#cemChat').hidden) cerrarVentana();
  });
}

/* ── Ponerlo al día ──────────────────────────────────────────────────────── */
/**
 * El botón de «Actualizar lo que sabe». Relee el catálogo de programas y
 * reescribe las fichas que genera la plataforma. Las que escribió una persona
 * a mano NO se tocan: quien las escribió sabía algo que la base no sabe.
 */
export async function refrescarAsistente() {
  const { data, error } = await sb.rpc('cem_bot_refrescar');
  if (error) throw error;
  return data;   // { programas, fichas, desactivadas }
}
