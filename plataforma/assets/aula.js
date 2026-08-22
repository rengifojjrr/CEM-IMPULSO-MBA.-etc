/* CEM · El aula
   ═══════════════════════════════════════════════════════════════════════════

   El tablón, las próximas entregas y la cuadrícula de notas. Vive aparte
   porque lo usan dos pantallas distintas —la del profesor y la del
   estudiante— y son la misma cosa vista desde dos sitios: si estuviera
   copiado, un arreglo en una dejaría la otra a medias.

   Lo que hace que un aula se sienta un aula no es tener el contenido: eso ya
   estaba. Es que haya un sitio donde el profesor diga «mañana no hay clase»
   y alguien pueda preguntar. */

import { sb, $, $$, esc, fdate, fdatetime, num, modal, ok, okDeshacer, fail, mensajeError,
         avisar, ocupado, initials, confirmarBorrado } from './app.js?v=2026-08-22-5';

/** Segundos a «12:04». Se usa en las dudas y al retomar un vídeo. */
export const reloj = (s) => {
  const n = Math.max(0, Math.round(Number(s) || 0));
  const h = Math.floor(n / 3600);
  const m = Math.floor((n % 3600) / 60);
  const g = n % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m))
    + ':' + String(g).padStart(2, '0');
};

/* ── cuánto hace de esto ──────────────────────────────────────────────────
   En un tablón la fecha exacta estorba: lo que importa es si es de hoy o de
   la semana pasada. La fecha completa se queda en el `title` para quien la
   necesite. */
export function hace(iso) {
  if (!iso) return '';
  const min = Math.round((Date.now() - new Date(iso)) / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  if (d === 1) return 'ayer';
  if (d < 7) return `hace ${d} días`;
  return fdate(iso);
}

/** El nombre viene junto («Ana Rodríguez»); initials() lo espera partido. */
const inicialesDe = (nombre) => {
  const [n, a] = String(nombre || '?').trim().split(/\s+/);
  return initials(n, a);
};

/** Un cuerpo de texto escrito a mano: se respetan los saltos, nada más. */
const cuerpoHTML = (t) => esc(t).replace(/\n/g, '<br>');

/**
 * Pinta el tablón dentro de `host`.
 *
 * @param {object} o
 * @param {string} o.host      selector del contenedor
 * @param {object} o.aula      lo que devolvió `cem_aula`
 * @param {string} o.yo        id del perfil que mira
 * @param {Function} o.recargar  qué llamar cuando algo cambie
 */
export function pintarMuro({ host, aula, yo, recargar }) {
  const caja = typeof host === 'string' ? $(host) : host;
  if (!caja) return;
  const puedePublicar = !!aula.dicta;
  const posts = aula.muro || [];

  caja.innerHTML = `
    ${puedePublicar ? `
      <div class="card muro-nuevo">
        <button type="button" class="muro-abrir" id="muroAbrir">
          <span class="material-symbols-outlined">campaign</span>
          Comparte algo con tu clase…
        </button>
      </div>` : ''}
    <div id="muroLista">${posts.length ? posts.map(pintarPost).join('')
      : `<div class="empty">
           <span class="material-symbols-outlined ico">forum</span>
           <b>Todavía no hay nada en el tablón</b>
           <span>${puedePublicar
             ? 'Escribe el primer aviso: aquí es donde la clase se entera de las cosas.'
             : 'Cuando tu profesor publique algo, aparecerá aquí.'}</span>
         </div>`}</div>`;

  if (puedePublicar) $('#muroAbrir', caja).onclick = () => escribirPost({ aula, recargar });
  conectarPosts(caja, { aula, yo, recargar });
}

function pintarPost(m) {
  const comentarios = m.comentarios || [];
  return `<article class="card post" data-post="${esc(m.id)}">
    <header class="post-cab">
      <span class="avatar" aria-hidden="true">${esc(inicialesDe(m.autor))}</span>
      <div class="grow">
        <div class="post-quien">${esc(m.autor || 'Alguien')}${
          m.fijado ? ' <span class="material-symbols-outlined fijado" title="Fijado arriba">push_pin</span>' : ''}</div>
        <div class="post-cuando" title="${esc(fdatetime(m.created_at))}">${esc(hace(m.created_at))}${
          m.editado_en ? ' · editado' : ''}</div>
      </div>
      <span class="acciones">
        <button class="btn ghost sm" data-fijar="${esc(m.id)}" data-valor="${m.fijado ? '0' : '1'}"
          title="${m.fijado ? 'Dejar de fijar' : 'Fijar arriba'}" hidden>
          <span class="material-symbols-outlined">push_pin</span></button>
        <button class="btn ghost sm" data-borrar-post="${esc(m.id)}" title="Borrar" hidden
          style="color:var(--error)"><span class="material-symbols-outlined">delete</span></button>
      </span>
    </header>
    <div class="post-cuerpo">${cuerpoHTML(m.cuerpo)}</div>
    ${(m.adjuntos || []).length ? `<div class="post-adjuntos">${(m.adjuntos || []).map(a =>
      `<a class="adjunto" href="${esc(a.url)}" target="_blank" rel="noopener">
         <span class="material-symbols-outlined">${a.tipo === 'video' ? 'smart_display' : 'attach_file'}</span>
         ${esc(a.nombre || 'Adjunto')}</a>`).join('')}</div>` : ''}

    <div class="post-comentarios">
      ${comentarios.length ? comentarios.map(c => `
        <div class="comentario" data-com="${esc(c.id)}">
          <span class="avatar sm" aria-hidden="true">${esc(inicialesDe(c.autor))}</span>
          <div class="grow"><b>${esc(c.autor || 'Alguien')}</b>
            <span class="tiny muted"> · ${esc(hace(c.created_at))}</span>
            <div>${cuerpoHTML(c.cuerpo)}</div></div>
          <button class="btn ghost sm" data-borrar-com="${esc(c.id)}" title="Borrar" hidden
            style="color:var(--error)"><span class="material-symbols-outlined">close</span></button>
        </div>`).join('') : ''}
      <form class="comentar" data-comentar="${esc(m.id)}">
        <input placeholder="Escribe un comentario…" maxlength="600" aria-label="Comentar">
        <button class="btn sm" type="submit">Enviar</button>
      </form>
    </div>
  </article>`;
}

function conectarPosts(caja, { aula, yo, recargar }) {
  const dicta = !!aula.dicta;

  // Los botones de borrar y fijar sólo se destapan para quien puede usarlos.
  // Se pintan siempre y se ocultan aquí, en vez de no pintarlos: así el HTML
  // del post es el mismo mire quien lo mire.
  if (dicta) $$('[data-fijar],[data-borrar-post]', caja).forEach(b => { b.hidden = false; });
  $$('[data-borrar-com]', caja).forEach((b) => {
    const c = b.closest('.comentario');
    const suyo = (aula.muro || []).some(m => (m.comentarios || [])
      .some(k => k.id === c.dataset.com && k.autor_id === yo));
    b.hidden = !(dicta || suyo);
  });

  $$('[data-fijar]', caja).forEach(b => b.onclick = async () => {
    const { error } = await sb.from('cem_muro')
      .update({ fijado: b.dataset.valor === '1' }).eq('id', b.dataset.fijar);
    if (error) { fail(mensajeError(error)); return; }
    recargar();
  });

  $$('[data-borrar-post]', caja).forEach(b => b.onclick = async () => {
    const bien = await confirmarBorrado({
      que: 'este aviso',
      nombre: 'el aviso del tablón',
      consecuencia: 'Se va con sus comentarios. La clase deja de verlo.',
    });
    if (!bien) return;
    const { error } = await sb.from('cem_muro').update({ eliminado: true }).eq('id', b.dataset.borrarPost);
    if (error) { fail(mensajeError(error)); return; }
    ok('Aviso retirado.'); recargar();
  });

  $$('[data-borrar-com]', caja).forEach(b => b.onclick = async () => {
    const { error } = await sb.from('cem_muro_comentarios')
      .update({ eliminado: true }).eq('id', b.dataset.borrarCom);
    if (error) { fail(mensajeError(error)); return; }
    recargar();
  });

  $$('[data-comentar]', caja).forEach((f) => {
    f.onsubmit = async (e) => {
      e.preventDefault();
      const campo = f.querySelector('input');
      const texto = campo.value.trim();
      if (!texto) return;
      campo.value = '';
      const { error } = await sb.from('cem_muro_comentarios')
        .insert({ post_id: f.dataset.comentar, autor_id: yo, cuerpo: texto });
      if (error) { fail(mensajeError(error)); campo.value = texto; return; }
      recargar();
    };
  });
}

/* ── escribir un aviso ───────────────────────────────────────────────────── */
function escribirPost({ aula, recargar }) {
  const m = modal({ title: 'Publicar en el tablón', body: `
    <div class="field"><label>¿Qué quieres decirle a la clase?</label>
      <textarea id="pCuerpo" rows="5" maxlength="4000"
        placeholder="Por ejemplo: la clase del jueves se pasa al viernes a la misma hora."></textarea></div>
    <div class="field"><label>
      <input type="checkbox" id="pFijar"> Fijarlo arriba</label>
      <span class="tiny muted">Para lo que tiene que seguir viéndose aunque se publiquen cosas nuevas.</span></div>
    <div id="pMsg"></div>`,
    footer: `<button class="btn outline" data-x>Cancelar</button>
             <button class="btn" id="pGo">Publicar</button>` });

  $('#pGo', m).onclick = () => ocupado('#pGo', 'Publicando…', async () => {
    const cuerpo = $('#pCuerpo', m).value.trim();
    if (!cuerpo) { avisar($('#pMsg', m), 'Escribe algo antes de publicar.', 'err'); return; }
    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from('cem_muro').insert({
      cohort_id: aula.cohorte.id, autor_id: user?.id, cuerpo,
      fijado: $('#pFijar', m).checked,
    });
    if (error) { avisar($('#pMsg', m), mensajeError(error), 'err'); return; }
    m.close(); ok('Publicado. La clase ya lo ve.'); recargar();
  });
}

/* ── lo que vence pronto ──────────────────────────────────────────────────
   La caja que hace que alguien abra la plataforma sin que se lo pidan. */
export function pintarProximas(host, aula) {
  const caja = typeof host === 'string' ? $(host) : host;
  if (!caja) return;
  const items = (aula.proximas || []).slice(0, 6);
  caja.innerHTML = items.length ? items.map((x) => {
    const dias = Math.ceil((new Date(x.cuando) - Date.now()) / 86400000);
    const urgente = dias <= 2;
    return `<div class="list-item">
      <span class="material-symbols-outlined" style="color:var(--${urgente ? 'warn' : 'tinta-3'})">
        ${x.clase === 'clase' ? 'event' : 'assignment'}</span>
      <div class="grow"><div class="t">${esc(x.titulo)}</div>
        <div class="s">${x.clase === 'clase' ? 'Sesión' : 'Entrega'} · ${
          dias <= 0 ? 'hoy' : dias === 1 ? 'mañana' : `en ${dias} días`} (${fdate(x.cuando)})</div></div>
    </div>`;
  }).join('') : '<p class="tiny muted">No tienes nada pendiente esta semana.</p>';
}

/* ── la cuadrícula de notas ───────────────────────────────────────────────
   Estudiantes en las filas, evaluaciones en las columnas, y la nota se
   escribe donde está el hueco. Guarda al salir de la casilla: pedir un botón
   por celda sería trescientos clics. */
export async function pintarNotas(host, cohortId) {
  const caja = typeof host === 'string' ? $(host) : host;
  if (!caja) return;
  caja.innerHTML = '<span class="cargando una"></span>';

  const { data, error } = await sb.rpc('cem_notas_cohorte', { p_cohort: cohortId });
  if (error) { caja.innerHTML = `<p class="nota err">${esc(mensajeError(error))}</p>`; return; }

  const evs = data.evaluaciones || [];
  const ests = data.estudiantes || [];
  if (!evs.length) {
    caja.innerHTML = `<div class="empty"><span class="material-symbols-outlined ico">grading</span>
      <b>Este programa todavía no tiene evaluaciones</b>
      <span>Cuando las cree, aparecerán aquí como columnas.</span></div>`;
    return;
  }

  caja.innerHTML = `
    <p class="tiny muted sin-margen">Escribe la nota y sal de la casilla: se guarda sola. Un hueco
      vacío es alguien que todavía no tiene nota, y eso también es información.</p>
    <div class="table-wrap sep-poco"><table class="notas">
      <thead><tr><th class="pegada">Estudiante</th>
        ${evs.map(e => `<th class="num" title="${esc(e.nombre)} · sobre ${num(e.puntaje_max)}">
          <span class="recorta">${esc(e.nombre)}</span>
          <span class="tiny muted">/${num(e.puntaje_max)}</span></th>`).join('')}
        <th class="num">Promedio</th></tr></thead>
      <tbody>${ests.map(s => {
        const puestas = evs.map(e => Number(s.notas?.[e.id]?.puntaje)).filter(n => !Number.isNaN(n));
        const media = puestas.length ? puestas.reduce((a, b) => a + b, 0) / puestas.length : null;
        return `<tr>
          <td class="pegada"><span class="recorta">${esc(s.nombre)}</span></td>
          ${evs.map((e) => {
            const n = s.notas?.[e.id];
            const aprobo = n?.puntaje != null && e.nota_aprobatoria != null
              && Number(n.puntaje) >= Number(e.nota_aprobatoria);
            return `<td class="num celda-nota${n?.puntaje != null && !aprobo ? ' suspende' : ''}">
              <input type="number" step="0.01" min="0" max="${esc(String(e.puntaje_max))}"
                value="${n?.puntaje ?? ''}" aria-label="Nota de ${esc(s.nombre)} en ${esc(e.nombre)}"
                data-ev="${esc(e.id)}" data-ins="${esc(s.enrollment_id)}"
                data-antes="${n?.puntaje ?? ''}">
              ${n?.tarde ? '<span class="tiny" style="color:var(--warn)" title="Entregada tarde">tarde</span>' : ''}
            </td>`;
          }).join('')}
          <td class="num">${media == null ? '—' : num(Math.round(media * 100) / 100)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>`;

  $$('.celda-nota input', caja).forEach((inp) => {
    inp.onchange = async () => {
      const v = inp.value.trim();
      if (v === inp.dataset.antes) return;
      const puntaje = v === '' ? null : Number(v);
      inp.disabled = true;
      const { error } = await sb.rpc('cem_poner_nota', {
        p_assessment_id: inp.dataset.ev,
        p_enrollment_id: inp.dataset.ins,
        p_puntaje: puntaje,
      });
      inp.disabled = false;
      if (error) {
        // Se devuelve el valor anterior: dejar en pantalla una nota que no se
        // guardó es peor que no haberla escrito.
        inp.value = inp.dataset.antes;
        fail(mensajeError(error));
        return;
      }
      const previo = inp.dataset.antes;
      inp.dataset.antes = v;
      inp.closest('td').classList.add('guardada');
      setTimeout(() => inp.closest('td')?.classList.remove('guardada'), 1200);

      /* Poner una nota en la casilla de al lado pasa todos los días: son
         treinta filas de números y la vista se desliza una línea. Deshacer
         devuelve la que había —incluido «ninguna»—, y lo hace por el mismo
         camino, así que también queda asentado. */
      okDeshacer(v === '' ? 'Nota borrada.' : `Nota ${v} guardada.`, async () => {
        const { error: e2 } = await sb.rpc('cem_poner_nota', {
          p_assessment_id: inp.dataset.ev,
          p_enrollment_id: inp.dataset.ins,
          p_puntaje: previo === '' ? null : Number(previo),
        });
        if (e2) { fail(mensajeError(e2)); return; }
        inp.value = previo;
        inp.dataset.antes = previo;
      });
    };
  });
}

/* ── las dudas de una lección (mejoras 1 y 13) ─────────────────────────────
   Hasta ahora, «en el minuto 14 no entendí de dónde sale el WACC» acababa en
   el WhatsApp del profesor o no se preguntaba. Las dos salidas son malas: la
   primera se responde una vez a una persona y no queda; la segunda es alguien
   que se atasca y termina abandonando.

   Por eso el hilo es de la lección y lo ve la cohorte entera: una duda buena
   la tienen cinco personas y sólo una se atreve a escribirla.

   `minutoActual` es una función, no un número: cuando se pulsa «preguntar» hay
   que mirar dónde está el vídeo EN ESE MOMENTO, no dónde estaba al pintar.

   @param {object} o
   @param {string|Element} o.host   dónde pintarlo
   @param {string} o.lessonId       la lección
   @param {boolean} o.puedeResponder  si quien mira contesta como profesor
   @param {Function} [o.minutoActual]  devuelve el segundo del vídeo, o null
   @param {Function} [o.alSaltar]   qué hacer al pulsar el minuto de una duda
*/
export async function pintarDudas({ host, lessonId, puedeResponder = false,
                                    minutoActual = () => null, alSaltar = null }) {
  const caja = typeof host === 'string' ? $(host) : host;
  if (!caja) return;
  caja.innerHTML = '<span class="cargando una"></span>';

  const { data, error } = await sb.rpc('cem_dudas_de_leccion', { p_lesson_id: lessonId });
  if (error) { caja.innerHTML = `<p class="nota err">${esc(mensajeError(error))}</p>`; return; }
  const dudas = data || [];
  const recargar = () => pintarDudas({ host, lessonId, puedeResponder, minutoActual, alSaltar });

  caja.innerHTML = `
    <form class="duda-nueva" id="dudaForm">
      <textarea id="dudaTexto" rows="2" maxlength="1500"
        placeholder="¿Qué no quedó claro? Sé concreto: se responde una vez y lo ve toda tu clase."
        aria-label="Escribe tu duda"></textarea>
      <div class="row between sep-poco">
        <label class="tiny muted" id="dudaMinLbl" hidden>
          <input type="checkbox" id="dudaMin" checked> Marcar el minuto <b id="dudaMinTxt"></b></label>
        <button class="btn sm" type="submit">Preguntar</button>
      </div>
      <div id="dudaMsg"></div>
    </form>
    <div id="dudaLista" class="sep">${dudas.length ? dudas.map(d => unaDuda(d, puedeResponder)).join('')
      : `<div class="empty"><span class="material-symbols-outlined ico">contact_support</span>
           <b>Nadie ha preguntado nada todavía</b>
           <span>Si algo no quedó claro, pregúntalo aquí: la respuesta la ve toda tu clase.</span></div>`}</div>`;

  // El minuto sólo se ofrece si hay vídeo sonando: en una lección de texto no
  // significa nada y sólo añade una casilla que no se entiende.
  const s = minutoActual();
  if (s != null && s > 2) {
    $('#dudaMinLbl', caja).hidden = false;
    $('#dudaMinTxt', caja).textContent = reloj(s);
  }

  $('#dudaForm', caja).onsubmit = (ev) => {
    ev.preventDefault();
    return ocupado($('#dudaForm button[type=submit]', caja), 'Enviando…', async () => {
      const cuerpo = $('#dudaTexto', caja).value.trim();
      if (!cuerpo) { avisar($('#dudaMsg', caja), 'Escribe la duda antes de enviarla.', 'err'); return; }
      const marcar = $('#dudaMin', caja);
      const seg = marcar && !marcar.hidden && marcar.checked ? Math.round(minutoActual() || 0) : null;
      const { error: e } = await sb.rpc('cem_preguntar', {
        p_lesson_id: lessonId, p_cuerpo: cuerpo, p_segundo: seg || null });
      if (e) { avisar($('#dudaMsg', caja), mensajeError(e), 'err'); return; }
      ok('Preguntado. Tu profesor recibe el aviso.');
      recargar();
    });
  };

  $$('[data-saltar]', caja).forEach(b => b.onclick = () => alSaltar?.(Number(b.dataset.saltar)));

  $$('[data-resolver]', caja).forEach(b => b.onclick = async () => {
    const { error: e } = await sb.rpc('cem_resolver_duda', {
      p_duda_id: b.dataset.resolver, p_resuelta: b.dataset.valor === '1' });
    if (e) { fail(mensajeError(e)); return; }
    recargar();
  });

  $$('[data-borrar-duda]', caja).forEach(b => b.onclick = async () => {
    const bien = await confirmarBorrado({
      que: 'esta duda', nombre: 'la pregunta',
      consecuencia: 'Se va con sus respuestas y la clase deja de verla.' });
    if (!bien) return;
    const { error: e } = await sb.rpc('cem_borrar_duda', { p_duda_id: b.dataset.borrarDuda });
    if (e) { fail(mensajeError(e)); return; }
    ok('Duda retirada.'); recargar();
  });

  $$('[data-responder]', caja).forEach((f) => {
    f.onsubmit = async (ev) => {
      ev.preventDefault();
      const campo = f.querySelector('input');
      const texto = campo.value.trim();
      if (!texto) return;
      campo.value = '';
      const { error: e } = await sb.rpc('cem_responder_duda', {
        p_duda_id: f.dataset.responder, p_cuerpo: texto });
      if (e) { fail(mensajeError(e)); campo.value = texto; return; }
      recargar();
    };
  });
}

function unaDuda(d, puedeResponder) {
  const respuestas = d.respuestas || [];
  const contestada = respuestas.some(r => r.de_docente);
  return `<article class="card duda${d.resuelta ? ' resuelta' : ''}" data-duda="${esc(d.id)}">
    <header class="post-cab">
      <span class="avatar" aria-hidden="true">${esc(inicialesDe(d.autor))}</span>
      <div class="grow">
        <div class="post-quien">${esc(d.autor || 'Alguien')}</div>
        <div class="post-cuando" title="${esc(fdatetime(d.created_at))}">${esc(hace(d.created_at))}</div>
      </div>
      ${d.segundo ? `<button type="button" class="btn ghost sm" data-saltar="${esc(String(d.segundo))}"
        title="Ir a ese punto del vídeo"><span class="material-symbols-outlined">play_circle</span>
        ${esc(reloj(d.segundo))}</button>` : ''}
      ${d.resuelta ? '<span class="chip ok">resuelta</span>'
        : contestada ? '<span class="chip info">respondida</span>'
        : '<span class="chip warn">sin responder</span>'}
    </header>
    <div class="post-cuerpo">${cuerpoHTML(d.cuerpo)}</div>

    <div class="post-comentarios">
      ${respuestas.map(r => `
        <div class="comentario${r.de_docente ? ' del-profe' : ''}">
          <span class="avatar sm" aria-hidden="true">${esc(inicialesDe(r.autor))}</span>
          <div class="grow"><b>${esc(r.autor || 'Alguien')}</b>
            ${r.de_docente ? '<span class="chip info tiny">profesor</span>' : ''}
            <span class="tiny muted"> · ${esc(hace(r.created_at))}</span>
            <div>${cuerpoHTML(r.cuerpo)}</div></div>
        </div>`).join('')}
      <form class="comentar" data-responder="${esc(d.id)}">
        <input placeholder="${puedeResponder ? 'Responder a la clase…' : 'Añadir algo…'}"
          maxlength="1500" aria-label="Responder">
        <button class="btn sm" type="submit">Responder</button>
      </form>
      <div class="row sep-poco" style="gap:8px">
        ${(d.mia || puedeResponder) ? `<button class="btn ghost sm" data-resolver="${esc(d.id)}"
          data-valor="${d.resuelta ? '0' : '1'}">
          <span class="material-symbols-outlined">${d.resuelta ? 'undo' : 'check'}</span>
          ${d.resuelta ? 'Volver a abrirla' : 'Ya está resuelta'}</button>` : ''}
        ${(d.mia || puedeResponder) ? `<button class="btn ghost sm" data-borrar-duda="${esc(d.id)}"
          style="color:var(--error)" title="Borrar la duda">
          <span class="material-symbols-outlined">delete</span></button>` : ''}
      </div>
    </div>
  </article>`;
}

/* ============ escribirle a un estudiante (mejora 14) ============
   Antes su única salida era pedirle el teléfono a administración. Queda
   registrado a propósito: un mensaje de la escuela a un alumno no es una
   conversación privada, y si acaba en una queja tiene que poder consultarse. */
export function escribirle(profileId, nombre){
  const m = modal({ title: `Escribirle a ${nombre || 'un estudiante'}`, body: `
    <p class="tiny muted">Le llega como aviso dentro de la plataforma y por correo.
      Queda registrado, como cualquier comunicación de la escuela.</p>
    <div class="field"><label>Asunto *</label>
      <input id="mAsunto" maxlength="120" placeholder="Por ejemplo: te echo de menos en clase"></div>
    <div class="field"><label>Mensaje *</label>
      <textarea id="mCuerpo" rows="5" maxlength="2000"
        placeholder="Escríbele como le hablarías: qué has notado y qué le propones."></textarea></div>
    <div id="mMsg"></div>`,
    footer: `<button class="btn outline" data-x>Cancelar</button>
             <button class="btn" id="mGo">Enviar</button>` });

  $('#mGo', m).onclick = () => ocupado('#mGo', 'Enviando…', async () => {
    const asunto = $('#mAsunto', m).value.trim();
    const cuerpo = $('#mCuerpo', m).value.trim();
    if (!asunto || cuerpo.length < 10) {
      avisar($('#mMsg', m), 'Hace falta un asunto y un mensaje con una frase completa.', 'err');
      return;
    }
    const { error } = await sb.rpc('cem_mensaje_a_estudiante', {
      p_profile_id: profileId, p_asunto: asunto, p_cuerpo: cuerpo });
    if (error) { avisar($('#mMsg', m), mensajeError(error), 'err'); return; }
    m.close(); ok('Enviado. Le llega el aviso y el correo.');
  });
}
