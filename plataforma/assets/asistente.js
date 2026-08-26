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

import { sb, $, esc, profile } from './app.js?v=2026-08-26';

/* ── Cómo se llama y qué cara tiene ──────────────────────────────────────── */
/* El nombre y el render salen de `cem_settings`, no de aquí. El dibujo
   vectorial es el respaldo: en cuanto suban el render de verdad desde
   Configuración, esto usa el render y el vector deja de verse. */
const NOMBRE_POR_DEFECTO = 'Cemi';
let AJUSTES = null;

async function ajustes() {
  if (AJUSTES) return AJUSTES;
  AJUSTES = { nombre: NOMBRE_POR_DEFECTO, foto: null };
  try {
    const { data } = await sb.from('cem_settings').select('clave, valor')
      .in('clave', ['asistente_nombre', 'mascota_url']);
    for (const f of data ?? []) {
      const v = typeof f.valor === 'string' ? f.valor : f.valor?.valor ?? f.valor;
      if (f.clave === 'asistente_nombre' && v) AJUSTES.nombre = String(v);
      if (f.clave === 'mascota_url' && v) AJUSTES.foto = String(v);
    }
  } catch { /* si falla, se queda con el nombre y el dibujo de casa */ }
  return AJUSTES;
}

function raizAssets() {
  return location.pathname.includes('/admin/')
    || location.pathname.includes('/estudiante/')
    || location.pathname.includes('/docente/') ? '../assets/' : './assets/';
}

/** La carita, para el botón y para cada respuesta. */
export function caraMascota(clase = '') {
  const f = AJUSTES?.foto;
  const src = f || (raizAssets() + 'mascota-cara.svg');
  return `<img class="mascota ${clase}" src="${esc(src)}" alt="" aria-hidden="true">`;
}

/** El bicho entero, para pantallas donde hay sitio. */
export function mascotaEntera(clase = '') {
  const f = AJUSTES?.foto;
  const src = f || (raizAssets() + 'mascota.svg');
  return `<img class="mascota-entera ${clase}" src="${esc(src)}" alt="La mascota del CEM">`;
}

/* ── Estado de la ventana ────────────────────────────────────────────────── */
let conversacion = null;
let ambitoActual = 'estudiante';
let enviando = false;
let montado = false;

const PRIMERAS = {
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
  const { data, error } = await sb.rpc('cem_bot_abrir',
    { p_ambito: ambitoActual, p_canal: canal });
  if (error) throw error;
  conversacion = data?.id ?? data?.[0]?.id ?? null;
  return conversacion;
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
      body: { pregunta: texto, ambito: ambitoActual, conversacion },
    });
    pensando(false);
    if (error) throw error;

    /* Que el asistente conteste no quiere decir que la respuesta sea buena.
       Cuando el modelo falla, el servidor manda una frase de cortesía y marca
       `degradado`. Si esa marca no se enseñara, la única señal de que el
       asistente está caído sería que empieza a contestar raro, y eso se
       descubre tarde y por un cliente. */
    const aviso = data?.degradado
      ? '<div class="chat-aviso">No pude consultar bien ahora mismo. Ya avisé al equipo.</div>'
      : '';
    pintar('asistente', data?.respuesta || 'No pude responder ahora mismo.', aviso);
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

  const a = await ajustes();
  const sug = (PRIMERAS[ambitoActual] || PRIMERAS.estudiante)
    .map((s) => `<button type="button" class="chat-sug">${esc(s)}</button>`).join('');
  pintar('asistente', ambitoActual === 'equipo'
    ? `Hola. Soy ${a.nombre}. Pregúntame por las cifras del centro o por dónde se hace cada cosa.`
    : `Hola. Soy ${a.nombre}, del CEM. En qué te ayudo?`);
  $('#chatLista').insertAdjacentHTML('beforeend',
    `<div class="chat-sugerencias" id="chatSugerencias">${sug}</div>`);
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
  const p = await profile();
  if (!p) return;                     // sin sesión no hay asistente
  montado = true;
  ambitoActual = ambito === 'equipo' ? 'equipo' : 'estudiante';
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
          <span class="tiny muted">${ambitoActual === 'equipo' ? 'Asistente del equipo' : 'Asistente del CEM'}</span>
        </div>
        <button type="button" class="icon-btn" id="chatCerrar" title="Cerrar">
          <span class="material-symbols-outlined">close</span></button>
      </header>
      <div class="chat-lista" id="chatLista"></div>
      <form class="chat-pie" id="chatForm">
        <input id="chatTexto" type="text" autocomplete="off" maxlength="1500"
               placeholder="Escribe tu pregunta">
        <button class="btn primary icon-btn" id="chatEnviar" type="submit" title="Enviar">
          <span class="material-symbols-outlined">send</span></button>
      </form>
    </section>`);

  $('#cemChatBoton').onclick = () =>
    ($('#cemChat').hidden ? abrirVentana() : cerrarVentana());
  $('#chatCerrar').onclick = cerrarVentana;
  $('#chatForm').onsubmit = (e) => {
    e.preventDefault();
    const t = $('#chatTexto').value;
    $('#chatTexto').value = '';
    preguntar(t);
  };
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
