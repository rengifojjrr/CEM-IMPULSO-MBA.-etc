/* ============================================================================
   Mensajes: hablar con una persona, dentro de la aplicación
   ============================================================================
   Lo que había era soporte por tickets —que va a una cola por categoría, no a
   nadie en concreto— y el correo. Un estudiante con una duda de su cuota no
   quiere abrir un ticket de categoría «Pagos»: quiere escribirle a quien cobra,
   verle la cara y saber que lo leyó.

   Aquí está eso: una bandeja, una conversación, y un directorio de a quién se
   le puede escribir. Igual que el perfil, vive en un módulo y lo montan las
   tres carpetas con una página de diez líneas cada una.

   Lo que NO hace, a propósito
   ---------------------------
   No se borra nada. No hay botón de borrar un mensaje ni de borrar una
   conversación, y no es un descuido: lo que se dice aquí queda, que es lo que
   convierte un chat en un registro. Si algo hay que retirar, se retira desde la
   base y queda en la auditoría.

   Quién ve qué lo decide el servidor y sólo el servidor. Estas funciones no
   reciben nunca «de quién son los datos»: preguntan por lo de quien entró.
   ========================================================================= */

import { sb, $, $$, esc, chip, fdatetime, modal, ok, fail, mensajeError,
         avisar, vacio, ocupado, etiqueta, initials } from './app.js?v=2026-09-04-4';

/* Cada cuánto se vuelve a preguntar si hay algo nuevo mientras la pantalla
   está abierta. Doce segundos: bastante para que una conversación se sienta
   viva, y poco tráfico para una escuela de este tamaño. Nada de tiempo real:
   una suscripción abierta por persona cuesta más de lo que aporta aquí. */
const CADA = 12000;

/** Un rato en palabras: «hace un momento», «hace 5 min», o la fecha. */
function cuando(iso) {
  const t = new Date(iso).getTime();
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  if (min < 60 * 24) return `hace ${Math.round(min / 60)} h`;
  return fdatetime(iso);
}

const nombreDe = (x) => [x?.nombre, x?.apellido].filter(Boolean).join(' ') || 'Sin nombre';

/* El armazón. Sin comentarios dentro: esto entra por `innerHTML` y todo lo que
   lleve acabaría en la página de verdad.

   Dos columnas en pantalla ancha —la lista y la conversación abierta— y una
   sola en el teléfono, donde abrir una conversación tapa la lista y el botón
   de volver la trae de vuelta. */
const ARMAZON = `
  <div class="page-head">
    <div><h1>Mensajes</h1><p>Habla con el equipo del CEM sin salir de la plataforma.
      Todo lo que se escribe aquí queda guardado.</p></div>
    <div class="actions">
      <button class="btn" id="btnEscribir">
        <span class="material-symbols-outlined" aria-hidden="true">edit_square</span>
        Escribir a alguien</button>
    </div>
  </div>
  <div class="msg-tablero">
    <div class="card msg-lista" id="colLista">
      <div class="field"><label for="msgBuscar">Buscar</label>
        <input type="search" id="msgBuscar" placeholder="Por nombre o asunto…"></div>
      <div id="bandeja"></div>
    </div>
    <div class="card msg-hilo" id="colHilo">
      <div id="hilo"></div>
    </div>
  </div>
  <div id="zonaRegistro"></div>`;

/**
 * Monta la pantalla de mensajes dentro del `#page` de la página que la llama.
 * @param {object} p El perfil que devolvió `mount()`.
 */
export function montarMensajes(p) {
  const page = $('#page');
  if (!page) return;
  page.innerHTML = ARMAZON;

  const esEquipo = ['coordinador', 'admin', 'superadmin', 'auditor'].includes(p.rol);
  const soloLee = p.rol === 'auditor';
  let conversaciones = [];
  let abierta = null;      // id de la conversación abierta
  let latido = null;

  if (soloLee) $('#btnEscribir').remove();

  $('#btnEscribir')?.addEventListener('click', escribirANuevo);
  $('#msgBuscar').oninput = pintarBandeja;
  if (esEquipo) montarRegistro();

  cargarBandeja();
  /* Se deja de preguntar cuando la pestaña no se ve: si alguien deja la
     pantalla abierta una tarde entera, seguir pidiendo cada doce segundos es
     gastar batería y cuota de servidor para nadie. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { clearInterval(latido); latido = null; }
    else if (!latido) { cargarBandeja(); latido = setInterval(refrescar, CADA); }
  });
  latido = setInterval(refrescar, CADA);

  async function cargarBandeja() {
    const { data, error } = await sb.rpc('cem_msg_bandeja');
    if (error) {
      $('#bandeja').innerHTML = `<p class="nota err">${esc(mensajeError(error))}</p>`;
      return;
    }
    conversaciones = data || [];
    pintarBandeja();
    if (!abierta) pintarHiloVacio();
  }

  /* El latido no repinta la conversación abierta si no ha cambiado nada: si lo
     hiciera, borraría lo que la persona está escribiendo en ese momento. */
  async function refrescar() {
    const antes = JSON.stringify(conversaciones.map(c => [c.id, c.ultimo_mensaje_en, c.sin_leer]));
    const { data } = await sb.rpc('cem_msg_bandeja');
    conversaciones = data || [];
    const ahora = JSON.stringify(conversaciones.map(c => [c.id, c.ultimo_mensaje_en, c.sin_leer]));
    if (antes === ahora) return;
    pintarBandeja();
    if (abierta) {
      const c = conversaciones.find(x => x.id === abierta);
      if (c && c.sin_leer > 0) abrir(abierta, { conservarBorrador: true });
    }
  }

  function pintarBandeja() {
    const q = ($('#msgBuscar').value || '').trim().toLowerCase();
    const lista = conversaciones.filter(c => !q
      || (c.asunto || '').toLowerCase().includes(q)
      || (c.otro_nombre || '').toLowerCase().includes(q));

    $('#bandeja').innerHTML = lista.length ? lista.map(c => `
      <button type="button" class="msg-fila${c.id === abierta ? ' abierta' : ''}"
              data-con="${esc(c.id)}">
        <span class="avatar">${esc(initials(...(c.otro_nombre || ' ').split(' ')))}</span>
        <span class="crece">
          <span class="msg-arriba">
            <b>${esc(c.otro_nombre || 'Sin nombre')}</b>
            <span class="tiny muted nowrap">${esc(cuando(c.ultimo_mensaje_en))}</span>
          </span>
          <span class="tiny muted recorta">${esc(c.asunto)}</span>
          <span class="tiny muted recorta">${esc(c.ultimo || '')}</span>
        </span>
        ${c.sin_leer > 0 ? `<span class="chip info nowrap">${c.sin_leer}</span>` : ''}
      </button>`).join('')
      : (conversaciones.length
          ? '<p class="tiny muted">Ninguna conversación coincide con lo que buscaste.</p>'
          : vacio({ icono: 'forum', titulo: 'Todavía no tienes mensajes',
                    texto: soloLee
                      ? 'Tu cuenta es de auditoría: puedes ver el registro de abajo, pero no escribir.'
                      : 'Escríbele a quien necesites con el botón de arriba.' }));

    $$('[data-con]').forEach(b => b.onclick = () => abrir(b.dataset.con));
  }

  function pintarHiloVacio() {
    $('#hilo').innerHTML = `<div class="msg-nada">
      <span class="material-symbols-outlined" aria-hidden="true">forum</span>
      <p class="tiny muted">Elige una conversación de la izquierda${
        soloLee ? '.' : ', o escríbele a alguien.'}</p></div>`;
  }

  async function abrir(id, { conservarBorrador = false } = {}) {
    const borrador = conservarBorrador ? ($('#msgTexto')?.value || '') : '';
    const { data, error } = await sb.rpc('cem_msg_abrir', { p_con: id });
    if (error) { fail(mensajeError(error)); return; }
    abierta = id;
    document.body.classList.add('msg-abierta');

    const otro = data.otro || {};
    $('#hilo').innerHTML = `
      <div class="msg-cab">
        <button type="button" class="btn ghost sm solo-estrecho" id="msgVolver"
                aria-label="Volver a la lista">
          <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span></button>
        <button type="button" class="msg-quien" data-ficha="${esc(otro.id || '')}">
          <span class="avatar">${esc(initials(...(otro.nombre || ' ').split(' ')))}</span>
          <span class="crece">
            <b>${esc(otro.nombre || 'Sin nombre')}</b>
            <span class="tiny muted">${esc(etiqueta(otro.rol))}</span>
          </span>
        </button>
      </div>
      <div class="msg-asunto">${esc(data.asunto)}</div>
      <div class="chat-lista msg-cuerpo" id="msgCuerpo">
        ${(data.mensajes || []).map(m => `
          <div class="chat-linea ${m.mio ? 'mia' : ''}">
            <div class="chat-burbuja">
              ${esc(m.cuerpo)}
              <div class="msg-hora">${esc(cuando(m.created_at))}</div>
            </div>
          </div>`).join('')}
      </div>
      ${soloLee
        ? '<p class="nota sep-poco">Tu cuenta es de auditoría: puedes leer, no responder.</p>'
        : `<form class="msg-pie" id="msgForm">
             <textarea id="msgTexto" rows="2" required
               placeholder="Escribe tu respuesta…"></textarea>
             <button class="btn" type="submit" aria-label="Enviar">
               <span class="material-symbols-outlined" aria-hidden="true">send</span></button>
           </form>`}`;

    $('#msgVolver').onclick = () => {
      abierta = null;
      document.body.classList.remove('msg-abierta');
      pintarBandeja(); pintarHiloVacio();
    };
    $('[data-ficha]').onclick = (e) => verFicha(e.currentTarget.dataset.ficha);

    const cuerpo = $('#msgCuerpo');
    cuerpo.scrollTop = cuerpo.scrollHeight;

    if (!soloLee) {
      const caja = $('#msgTexto');
      caja.value = borrador;
      if (!conservarBorrador) caja.focus();
      /* Enter envía, Mayúsculas+Enter hace un salto de línea. Es lo que la mano
         ya espera de un cuadro de chat. */
      caja.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); $('#msgForm').requestSubmit(); }
      });
      $('#msgForm').onsubmit = async (ev) => {
        ev.preventDefault();
        const texto = caja.value.trim();
        if (!texto) return;
        caja.value = '';
        const { error } = await sb.rpc('cem_msg_escribir', { p_con: id, p_cuerpo: texto });
        if (error) { caja.value = texto; fail(mensajeError(error)); return; }
        await abrir(id);
        cargarBandeja();
      };
    }
    pintarBandeja();
  }

  /* ============ escribirle a alguien ============ */

  async function escribirANuevo() {
    const m = modal({ title: 'Escribir a alguien', body: `
      <div class="field"><label for="dirBuscar">¿A quién?</label>
        <input type="search" id="dirBuscar" placeholder="Escribe un nombre…" autocomplete="off"></div>
      <div id="dirLista" class="msg-directorio"></div>`,
      footer: '<button class="btn outline" data-x>Cancelar</button>' });

    const pintar = async (q) => {
      const { data, error } = await sb.rpc('cem_directorio', { p_buscar: q || null });
      if (error) { $('#dirLista', m).innerHTML = `<p class="nota err">${esc(mensajeError(error))}</p>`; return; }
      const gente = data || [];
      $('#dirLista', m).innerHTML = gente.length ? gente.map(g => `
        <button type="button" class="msg-persona" data-para="${esc(g.id)}"
                data-nombre="${esc(nombreDe(g))}">
          <span class="avatar">${esc(initials(g.nombre, g.apellido))}</span>
          <span class="crece">
            <b>${esc(nombreDe(g))}</b>
            <span class="tiny muted">${esc(g.ocupacion || etiqueta(g.rol))}</span>
          </span>
          <span class="material-symbols-outlined" aria-hidden="true">chevron_right</span>
        </button>`).join('')
        : '<p class="tiny muted">No hay nadie con ese nombre a quien puedas escribirle.</p>';

      $$('[data-para]', m).forEach(b => b.onclick = () => {
        m.close();
        redactar(b.dataset.para, b.dataset.nombre);
      });
    };

    let espera;
    $('#dirBuscar', m).oninput = (e) => {
      clearTimeout(espera);
      espera = setTimeout(() => pintar(e.target.value.trim()), 250);
    };
    pintar('');
  }

  /** El formulario de un mensaje nuevo a una persona concreta. */
  function redactar(paraId, paraNombre) {
    const m = modal({ title: `Escribir a ${paraNombre}`, body: `
      <div class="field"><label for="nvAsunto">Asunto *</label>
        <input id="nvAsunto" maxlength="120" required
          placeholder="Duda con mi cuota de septiembre"></div>
      <div class="field"><label for="nvCuerpo">Tu mensaje *</label>
        <textarea id="nvCuerpo" rows="5" required
          placeholder="Cuéntale lo que necesitas."></textarea></div>
      <p class="tiny muted">Queda guardado en la plataforma. La dirección puede ver que
        existe esta conversación; para leerla tiene que dejar constancia de por qué.</p>
      <div id="nvMsg"></div>`,
      footer: `<button class="btn outline" data-x>Cancelar</button>
               <button class="btn" data-s>Enviar</button>` });

    $('[data-s]', m).onclick = () => ocupado($('[data-s]', m), 'Enviando…', async () => {
      const asunto = $('#nvAsunto', m).value.trim();
      const cuerpo = $('#nvCuerpo', m).value.trim();
      if (asunto.length < 3) { avisar($('#nvMsg', m), 'Ponle un asunto, aunque sea corto.', 'err'); return; }
      if (cuerpo.length < 2) { avisar($('#nvMsg', m), 'El mensaje está vacío.', 'err'); return; }
      const { data, error } = await sb.rpc('cem_msg_nueva',
        { p_para: paraId, p_asunto: asunto, p_cuerpo: cuerpo });
      if (error) { avisar($('#nvMsg', m), mensajeError(error), 'err'); return; }
      m.close();
      ok('Mensaje enviado.');
      await cargarBandeja();
      abrir(data);
    });
  }

  /* ============ la ficha de una persona ============
     La misma que se abre desde cualquier sitio donde salga un nombre. Trae lo
     que se puede enseñar y nada más: ni cédula, ni teléfono, ni correo. */
  async function verFicha(id) {
    if (!id) return;
    const { data, error } = await sb.rpc('cem_ficha_de', { p_id: id });
    if (error) { fail(mensajeError(error)); return; }
    if (!data) { fail('Esa persona ya no está activa, o su perfil no es visible.'); return; }

    const nombre = nombreDe(data);
    const m = modal({ title: nombre, body: `
      <div class="ficha">
        <div class="ficha-portada">${data.portada_url
          ? `<img src="${esc(data.portada_url)}" alt="">` : ''}</div>
        <div class="ficha-quien">
          <span class="avatar lg">${esc(initials(data.nombre, data.apellido))}${
            data.avatar_url ? `<img src="${esc(data.avatar_url)}" alt="">` : ''}</span>
          <div>
            <b>${esc(nombre)}</b>
            <div class="tiny muted">${esc(data.ocupacion || etiqueta(data.rol))}</div>
            ${chip(etiqueta(data.rol))}
          </div>
        </div>
        ${data.bio ? `<p class="tiny">${esc(data.bio)}</p>` : ''}
        <div class="row tiny muted" style="gap:var(--e2)">
          <span>${data.certificados} certificado${data.certificados === 1 ? '' : 's'}</span>
          <span>${data.trabajos} trabajo${data.trabajos === 1 ? '' : 's'}</span>
        </div>
        ${data.perfil_slug
          ? `<a class="btn outline sm" target="_blank" rel="noopener"
                href="../perfil-publico.html?p=${encodeURIComponent(data.perfil_slug)}">
               <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>
               Ver su perfil público</a>`
          : ''}
      </div>`,
      footer: `<button class="btn outline" data-x>Cerrar</button>
        ${data.puedo_escribirle
          ? '<button class="btn" id="fichaEscribir">Escribirle</button>' : ''}` });

    if ($('#fichaEscribir', m)) $('#fichaEscribir', m).onclick = () => {
      m.close(); redactar(data.id, nombre);
    };
  }

  /* ============ el registro, para la dirección y la auditoría ============
     Quién le escribió a quién y cuándo, sin el contenido. Para leer una
     conversación ajena hay que decir por qué, y eso queda en la auditoría. */
  function montarRegistro() {
    $('#zonaRegistro').innerHTML = `
      <details class="card" id="cardRegistro">
        <summary class="sec" style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px">
          <span class="material-symbols-outlined">expand_more</span>
          Registro de conversaciones
          <span class="chip neutral" id="regCuenta"></span>
        </summary>
        <p class="tiny muted">Quién habló con quién y cuándo. <b>Sin lo que dijeron.</b>
          Para abrir una conversación ajena hay que escribir por qué, y queda anotado en
          la auditoría con tu nombre.</p>
        <div class="table-wrap sep-poco"><table>
          <thead><tr><th>Quiénes</th><th>Asunto</th><th>Mensajes</th><th>Último</th><th></th></tr></thead>
          <tbody id="tbRegistro"></tbody></table></div>
      </details>`;

    $('#cardRegistro').addEventListener('toggle', function () {
      if (this.open) cargarRegistro();
    }, { once: true });
  }

  async function cargarRegistro() {
    const { data, error } = await sb.rpc('cem_msg_registro');
    const cuerpo = $('#tbRegistro');
    if (error) {
      cuerpo.innerHTML = `<tr><td colspan="5" class="tiny muted">${esc(mensajeError(error))}</td></tr>`;
      return;
    }
    const filas = data || [];
    $('#regCuenta').textContent = `${filas.length} en total`;
    cuerpo.innerHTML = filas.length ? filas.map(r => `<tr>
      <td class="wrap">${esc(r.quienes || '—')}</td>
      <td class="wrap">${esc(r.asunto)}</td>
      <td>${r.mensajes}</td>
      <td class="muted nowrap">${esc(cuando(r.ultimo_mensaje_en))}</td>
      <td><button class="btn ghost sm" data-abrirreg="${esc(r.conversacion_id)}"
            >Abrir con motivo</button></td></tr>`).join('')
      : '<tr><td colspan="5" class="tiny muted">Todavía no hay ninguna conversación.</td></tr>';

    $$('[data-abrirreg]').forEach(b => b.onclick = () => leerAjena(b.dataset.abrirreg));
  }

  async function leerAjena(id) {
    const m = modal({ title: 'Abrir una conversación ajena', body: `
      <p class="nota warn">Esto no es una conversación tuya. Se va a anotar en la auditoría
        con tu nombre, la fecha y el motivo que escribas. Hazlo sólo si tienes una razón
        que puedas sostener.</p>
      <div class="field"><label for="regMotivo">¿Por qué necesitas abrirla? *</label>
        <textarea id="regMotivo" rows="3" required
          placeholder="Denuncia de trato indebido, expediente 2026-14."></textarea></div>
      <div id="regMsg"></div>`,
      footer: `<button class="btn outline" data-x>Cancelar</button>
               <button class="btn" data-s>Abrirla y dejar constancia</button>` });

    $('[data-s]', m).onclick = () => ocupado($('[data-s]', m), 'Abriendo…', async () => {
      const motivo = $('#regMotivo', m).value.trim();
      if (motivo.length < 10) {
        avisar($('#regMsg', m), 'Escribe el motivo con una frase completa.', 'err');
        return;
      }
      const { data, error } = await sb.rpc('cem_msg_leer_por_auditoria',
        { p_con: id, p_motivo: motivo });
      if (error) { avisar($('#regMsg', m), mensajeError(error), 'err'); return; }
      m.close();
      modal({ title: data.asunto, wide: true, body: `
        <p class="tiny muted">Queda anotado que abriste esta conversación.</p>
        <div class="chat-lista" style="max-height:60vh">
          ${(data.mensajes || []).map(x => `
            <div class="chat-linea">
              <div class="chat-burbuja">
                <b class="tiny">${esc(x.autor)}</b><br>${esc(x.cuerpo)}
                <div class="msg-hora">${esc(cuando(x.created_at))}</div>
              </div>
            </div>`).join('')}
        </div>`,
        footer: '<button class="btn outline" data-x>Cerrar</button>' });
    });
  }
}
