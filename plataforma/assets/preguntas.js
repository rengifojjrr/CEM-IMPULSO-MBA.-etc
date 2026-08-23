/* Los tipos de pregunta, en un solo sitio.
   ==========================================================================
   Tres pantallas distintas tienen que estar de acuerdo sobre qué es una
   pregunta de casillas: la que la escribe, la que la responde y la que cuenta
   las respuestas. Cuando cada una lo sabía por su cuenta, bastaba agregar un
   tipo nuevo para que una de las tres se quedara atrás y empezara a mostrar
   cosas raras sin dar ningún error.

   La forma de la respuesta según el tipo —esto es el contrato con la base de
   datos, que guarda `cem_submissions.respuestas` como {id_pregunta: valor}:

     multiple, desplegable, verdadero_falso, corta, ensayo   texto
     casillas                                                lista de textos
     escala                                                  número
     fecha ("2026-08-16"), hora ("14:30"), archivo (URL)     texto
     cuadricula                                              {fila: columna}
     cuadricula_casillas                                     {fila: [columnas]}

   El servidor compara con la misma forma en cem_es_correcta(). Si aquí se
   cambia una, allá hay que cambiarla también. */

import { esc, $, $$, montarAyudas } from './app.js?v=2026-08-23-13';

export const TIPOS = {
  multiple:            { etq: 'Selección múltiple',      icono: 'radio_button_checked', opciones: true },
  casillas:            { etq: 'Casillas',                icono: 'check_box',            opciones: true, varias: true },
  desplegable:         { etq: 'Lista desplegable',       icono: 'arrow_drop_down_circle', opciones: true },
  verdadero_falso:     { etq: 'Verdadero o falso',       icono: 'rule',                 fijas: ['Verdadero', 'Falso'] },
  escala:              { etq: 'Escala lineal',           icono: 'linear_scale' },
  cuadricula:          { etq: 'Cuadrícula de opciones',  icono: 'grid_on',              rejilla: true },
  cuadricula_casillas: { etq: 'Cuadrícula de casillas',  icono: 'apps',                 rejilla: true, varias: true },
  corta:               { etq: 'Respuesta corta',         icono: 'short_text' },
  ensayo:              { etq: 'Párrafo',                 icono: 'notes',                aMano: true },
  fecha:               { etq: 'Fecha',                   icono: 'event' },
  hora:                { etq: 'Hora',                    icono: 'schedule' },
  archivo:             { etq: 'Subir archivo',           icono: 'upload_file',          aMano: true },
};

export const etiquetaTipo = (t) => TIPOS[t]?.etq || t;
export const iconoTipo = (t) => TIPOS[t]?.icono || 'help';

/** ¿Esta pregunta la puede corregir la máquina sola? Espejo de cem_es_correcta(). */
export const seCorrigeSola = (q) =>
  !TIPOS[q.tipo]?.aMano && q.respuesta_correcta != null &&
  !(Array.isArray(q.respuesta_correcta) && q.respuesta_correcta.length === 0);

/** Una pregunta recién creada, con lo mínimo para que se pueda responder. */
export function nuevaPregunta(tipo = 'multiple') {
  const q = {
    id: null, enunciado: '', ayuda: '', tipo, dificultad: 'media',
    opciones: [], respuesta_correcta: null, explicacion: '', config: {},
    obligatoria: true, barajar_opciones: false, puntaje: 0,
    seccion: null, seccion_desc: null,
  };
  return conFormaDeSuTipo(q, tipo);
}

/** Ajusta opciones y config al cambiar de tipo, conservando lo que siga valiendo. */
export function conFormaDeSuTipo(q, tipo) {
  const d = TIPOS[tipo] || {};
  q.tipo = tipo;
  if (d.fijas) { q.opciones = [...d.fijas]; }
  else if (d.opciones) { if (!Array.isArray(q.opciones) || q.opciones.length < 2) q.opciones = ['', '']; }
  else { q.opciones = []; }

  if (tipo === 'escala') {
    q.config = { min: 1, max: 5, etq_min: '', etq_max: '', ...(q.config || {}) };
  } else if (d.rejilla) {
    q.config = { filas: ['', ''], columnas: ['', ''], ...(q.config || {}) };
    if (!Array.isArray(q.config.filas) || !q.config.filas.length) q.config.filas = ['', ''];
    if (!Array.isArray(q.config.columnas) || !q.config.columnas.length) q.config.columnas = ['', ''];
  } else if (tipo === 'archivo') {
    q.config = { formatos: '', max_mb: 10, ...(q.config || {}) };
  } else {
    q.config = {};
  }
  // La clave vieja casi nunca sirve para el tipo nuevo, y una clave equivocada
  // es peor que ninguna: corrige mal y nadie se entera hasta que reclaman.
  if (!d.opciones && !d.fijas) q.respuesta_correcta = null;
  else if (d.varias) { if (!Array.isArray(q.respuesta_correcta)) q.respuesta_correcta = null; }
  else if (Array.isArray(q.respuesta_correcta)) q.respuesta_correcta = null;
  return q;
}

/* ============ el reparto de puntos ============
   Repartir 100 entre 3 da 33,33 y tres veces 33,33 son 99,99. Como la regla es
   que la suma dé EXACTAMENTE el total, el sobrante se le suma a la primera en
   vez de dejar el hueco. Se trabaja en céntimos para no arrastrar los errores
   de la coma flotante. */
export function repartirPuntos(n, total) {
  if (n <= 0) return [];
  const centimos = Math.round(Number(total) * 100);
  const base = Math.floor(centimos / n);
  const resto = centimos - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < resto ? 1 : 0)) / 100);
}

/** Lo que hay que enseñar arriba del todo: cuánto se lleva repartido y cuánto falta. */
export function estadoPuntos(preguntas, maximo) {
  const total = Math.round(preguntas.reduce((a, q) => a + (Number(q.puntaje) || 0), 0) * 100) / 100;
  const max = Math.round((Number(maximo) || 0) * 100) / 100;
  const dif = Math.round((max - total) * 100) / 100;
  return {
    total, max, dif,
    cuadra: dif === 0,
    clase: dif === 0 ? 'cuadra' : dif > 0 ? 'falta' : 'pasa',
    texto: dif === 0 ? 'Los puntajes cuadran con el total'
      : dif > 0 ? `Faltan ${dif} puntos por repartir`
      : `Te pasas por ${Math.abs(dif)} puntos`,
  };
}

/* ============ responder ============
   Devuelve el HTML del control de una pregunta. Quien lo llama se encarga de
   escuchar los cambios: aquí sólo se marca cada control con data-q (el id de
   la pregunta) para que un único escuchador sirva para todos. */
export function controlDeRespuesta(q, valor) {
  const d = TIPOS[q.tipo] || {};
  const id = q.id;
  const ops = ordenDeOpciones(q);

  if (q.tipo === 'corta') {
    return `<input type="text" data-q="${id}" data-forma="texto" value="${esc(valor ?? '')}"
      placeholder="Tu respuesta" autocomplete="off">`;
  }
  if (q.tipo === 'ensayo') {
    return `<textarea data-q="${id}" data-forma="texto" style="min-height:110px"
      placeholder="Escribe tu respuesta…">${esc(valor ?? '')}</textarea>`;
  }
  if (q.tipo === 'fecha') {
    return `<input type="date" data-q="${id}" data-forma="texto" value="${esc(valor ?? '')}">`;
  }
  if (q.tipo === 'hora') {
    return `<input type="time" data-q="${id}" data-forma="texto" value="${esc(valor ?? '')}">`;
  }
  if (q.tipo === 'archivo') {
    const cfg = q.config || {};
    return `<div class="stack">
      <input type="file" data-q="${id}" data-forma="archivo"
        ${cfg.formatos ? `accept="${esc(cfg.formatos)}"` : ''}>
      <div class="tiny muted" data-archivo-de="${id}">${valor
        ? `<a href="${esc(valor)}" target="_blank" rel="noopener">Archivo entregado</a>`
        : `Formatos: ${esc(cfg.formatos || 'cualquiera')} · hasta ${Number(cfg.max_mb) || 10} MB`}</div>
    </div>`;
  }
  if (q.tipo === 'desplegable') {
    return `<select data-q="${id}" data-forma="texto">
      <option value="">Elige una respuesta</option>
      ${ops.map((o) => `<option value="${esc(o)}" ${valor === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
    </select>`;
  }
  if (q.tipo === 'escala') {
    const cfg = q.config || {};
    const min = Number(cfg.min ?? 1), max = Number(cfg.max ?? 5);
    const puntos = [];
    for (let n = min; n <= max; n++) puntos.push(n);
    return `<div class="escala-lineal">
      ${cfg.etq_min ? `<span class="tope">${esc(cfg.etq_min)}</span>` : ''}
      ${puntos.map((n) => `<label class="punto">
        <span class="tiny">${n}</span>
        <input type="radio" name="q_${id}" data-q="${id}" data-forma="numero"
          value="${n}" ${Number(valor) === n ? 'checked' : ''}></label>`).join('')}
      ${cfg.etq_max ? `<span class="tope">${esc(cfg.etq_max)}</span>` : ''}
    </div>`;
  }
  if (d.rejilla) {
    const cfg = q.config || {};
    const filas = (cfg.filas || []).filter(Boolean);
    const cols = (cfg.columnas || []).filter(Boolean);
    const marcado = (f, c) => q.tipo === 'cuadricula_casillas'
      ? Array.isArray(valor?.[f]) && valor[f].includes(c)
      : valor?.[f] === c;
    return `<div class="table-wrap"><table class="rejilla-resp">
      <thead><tr><th></th>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${filas.map((f) => `<tr><td>${esc(f)}</td>${cols.map((c) => `<td>
        <input type="${q.tipo === 'cuadricula_casillas' ? 'checkbox' : 'radio'}"
          name="q_${id}_${esc(f)}" data-q="${id}" data-forma="rejilla"
          data-fila="${esc(f)}" value="${esc(c)}" ${marcado(f, c) ? 'checked' : ''}></td>`).join('')}
      </tr>`).join('')}</tbody></table></div>`;
  }
  if (d.varias) {
    const marcadas = Array.isArray(valor) ? valor : [];
    return `<div class="stack">${ops.map((o) => `<label class="opt ${marcadas.includes(o) ? 'on' : ''}">
      <input type="checkbox" data-q="${id}" data-forma="lista" value="${esc(o)}"
        ${marcadas.includes(o) ? 'checked' : ''}>
      <span>${esc(o)}</span></label>`).join('')}</div>`;
  }
  // multiple y verdadero_falso
  return `<div class="stack">${ops.map((o) => `<label class="opt ${valor === o ? 'on' : ''}">
    <input type="radio" name="q_${id}" data-q="${id}" data-forma="texto" value="${esc(o)}"
      ${valor === o ? 'checked' : ''}>
    <span>${esc(o)}</span></label>`).join('')}</div>`;
}

/* El orden en que se enseñan las opciones. Barajarlas evita que se copie «la
   tercera siempre es la buena», pero tiene que ser el MISMO orden cada vez que
   se repinta la pregunta: si baila al marcar, quien responde se pierde. Por
   eso se calcula una vez y se guarda en la propia pregunta. */
function ordenDeOpciones(q) {
  const ops = (q.opciones || []).filter((o) => String(o).trim() !== '');
  if (!q.barajar_opciones) return ops;
  if (!q._orden || q._orden.length !== ops.length) {
    q._orden = ops.map((o, i) => [Math.random(), i]).sort((a, b) => a[0] - b[0]).map(([, i]) => i);
  }
  return q._orden.map((i) => ops[i]);
}

/** Lee de un control lo que hay que guardar, en la forma que espera el servidor. */
export function leerControl(el, anterior) {
  const forma = el.dataset.forma;
  if (forma === 'numero') return Number(el.value);
  if (forma === 'lista') {
    const previas = Array.isArray(anterior) ? anterior : [];
    const sin = previas.filter((v) => v !== el.value);
    return el.checked ? [...sin, el.value] : sin;
  }
  if (forma === 'rejilla') {
    const base = (anterior && typeof anterior === 'object' && !Array.isArray(anterior)) ? { ...anterior } : {};
    const fila = el.dataset.fila;
    if (el.type === 'checkbox') {
      const previas = Array.isArray(base[fila]) ? base[fila] : [];
      const sin = previas.filter((v) => v !== el.value);
      base[fila] = el.checked ? [...sin, el.value] : sin;
    } else {
      base[fila] = el.value;
    }
    return base;
  }
  return el.value;
}

/** ¿Se contestó? Una obligatoria en blanco no deja entregar. */
export function estaRespondida(valor) {
  if (valor == null) return false;
  if (Array.isArray(valor)) return valor.length > 0;
  if (typeof valor === 'object') {
    const vs = Object.values(valor);
    return vs.length > 0 && vs.some((v) => Array.isArray(v) ? v.length > 0 : String(v ?? '').trim() !== '');
  }
  if (typeof valor === 'number') return Number.isFinite(valor);
  return String(valor).trim() !== '';
}

/** Una respuesta escrita en una línea, para las pantallas de revisión. */
export function respuestaEnTexto(valor) {
  if (valor == null || valor === '') return '—';
  if (Array.isArray(valor)) return valor.join(', ') || '—';
  if (typeof valor === 'object') {
    return Object.entries(valor)
      .map(([f, v]) => `${f}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join(' · ') || '—';
  }
  return String(valor);
}

/* ============ escribir una pregunta ============
   El trozo del formulario que cambia con el tipo: opciones, filas y columnas,
   los topes de la escala, la clave de respuesta. Vive aquí y no en el
   constructor de evaluaciones porque el banco de preguntas necesita
   exactamente lo mismo, y tener dos copias es tener una que se queda atrás.

   `i` es sólo un prefijo para los data-attributes: permite tener varias
   preguntas abiertas en la misma página sin que se pisen los selectores. */
export function editorDeCuerpo(q, i = 0) {
  const d = TIPOS[q.tipo] || {};

  if (q.tipo === 'archivo') {
    return `<p class="tiny muted">El estudiante sube un archivo y lo revisa un profesor.</p>
      <div class="row">
        <div class="field medio" style="margin:0"><label class="tiny">Formatos que acepta</label>
          <input data-cfg="${i}:formatos" value="${esc(q.config?.formatos || '')}" placeholder=".pdf,.docx"></div>
        <div class="field corto" style="margin:0"><label class="tiny">Tamaño máx. (MB)</label>
          <input type="number" min="1" data-cfg="${i}:max_mb" value="${Number(q.config?.max_mb) || 10}"></div>
      </div>`;
  }
  if (q.tipo === 'ensayo') {
    return `<p class="tiny muted">Respuesta larga: la lee y la califica un profesor.</p>`;
  }

  if (q.tipo === 'escala') {
    const c = q.config || {};
    return `<div class="row">
      <div class="field corto" style="margin:0"><label class="tiny">De</label>
        <select data-cfg="${i}:min">${[0, 1].map((n) =>
          `<option value="${n}" ${Number(c.min) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="field corto" style="margin:0"><label class="tiny">A</label>
        <select data-cfg="${i}:max">${[3, 4, 5, 6, 7, 8, 9, 10].map((n) =>
          `<option value="${n}" ${Number(c.max) === n ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
      <div class="field medio" style="margin:0"><label class="tiny">Etiqueta del mínimo</label>
        <input data-cfg="${i}:etq_min" value="${esc(c.etq_min || '')}" placeholder="Nada de acuerdo"></div>
      <div class="field medio" style="margin:0"><label class="tiny">Etiqueta del máximo</label>
        <input data-cfg="${i}:etq_max" value="${esc(c.etq_max || '')}" placeholder="Muy de acuerdo"></div>
    </div>
    <div class="field sep-poco" style="margin:0"><label class="tiny">Respuesta correcta
      <span class="muted">— déjalo vacío si es una pregunta de opinión</span></label>
      <input type="number" data-clave="${i}" value="${q.respuesta_correcta ?? ''}"
        placeholder="sin respuesta correcta"></div>`;
  }

  if (d.rejilla) {
    const c = q.config || {};
    const filas = c.filas || [], cols = c.columnas || [];
    return `<div class="row" style="align-items:flex-start;gap:var(--e2)">
      <div class="crece"><label class="tiny negrita">Filas</label>
        ${filas.map((f, k) => `<div class="opt-fila">
          <input type="text" data-fila="${i}:${k}" value="${esc(f)}" placeholder="Fila ${k + 1}">
          <button type="button" class="btn ghost sm" data-rmfila="${i}:${k}" ${filas.length <= 1 ? 'disabled' : ''}
            title="Quitar la fila"><span class="material-symbols-outlined">close</span></button></div>`).join('')}
        <button type="button" class="btn ghost sm" data-addfila="${i}">
          <span class="material-symbols-outlined">add</span> Fila</button></div>
      <div class="crece"><label class="tiny negrita">Columnas</label>
        ${cols.map((o, k) => `<div class="opt-fila">
          <input type="text" data-col="${i}:${k}" value="${esc(o)}" placeholder="Columna ${k + 1}">
          <button type="button" class="btn ghost sm" data-rmcol="${i}:${k}" ${cols.length <= 1 ? 'disabled' : ''}
            title="Quitar la columna"><span class="material-symbols-outlined">close</span></button></div>`).join('')}
        <button type="button" class="btn ghost sm" data-addcol="${i}">
          <span class="material-symbols-outlined">add</span> Columna</button></div>
    </div>
    ${filas.filter(Boolean).length && cols.filter(Boolean).length ? `
    <div class="sep-poco"><label class="tiny negrita">Respuesta correcta por fila
      <span class="muted">— déjalo vacío si no se corrige sola</span></label>
      ${filas.filter(Boolean).map((f) => `<div class="row" style="gap:var(--e1);align-items:center">
        <span class="tiny crece">${esc(f)}</span>
        ${q.tipo === 'cuadricula_casillas'
          ? cols.filter(Boolean).map((o) => `<label class="check tiny"><input type="checkbox"
              data-rejclave="${i}" data-f="${esc(f)}" value="${esc(o)}"
              ${(q.respuesta_correcta?.[f] || []).includes(o) ? 'checked' : ''}> ${esc(o)}</label>`).join('')
          : `<select data-rejclave="${i}" data-f="${esc(f)}" style="max-width:220px">
              <option value="">— sin clave —</option>
              ${cols.filter(Boolean).map((o) => `<option value="${esc(o)}"
                ${q.respuesta_correcta?.[f] === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`}
      </div>`).join('')}</div>` : ''}`;
  }

  if (q.tipo === 'corta') {
    const clave = Array.isArray(q.respuesta_correcta) ? q.respuesta_correcta.join('\n')
      : (q.respuesta_correcta ?? '');
    return `<div class="field" style="margin:0"><label class="tiny">Respuestas que se dan por buenas — una por línea
      <button type="button" class="ayuda-btn" data-ayuda="No distingue mayúsculas, ni tildes, ni espacios de más: «caracas» vale por «Caracas». Escribe todas las formas razonables de decir lo mismo. Si lo dejas vacío, la corrige un profesor a mano.">?</button></label>
      <textarea data-clave="${i}" style="min-height:60px" placeholder="Caracas&#10;Ccs">${esc(clave)}</textarea></div>`;
  }

  if (q.tipo === 'fecha' || q.tipo === 'hora') {
    return `<div class="field" style="margin:0"><label class="tiny">Respuesta correcta (opcional)</label>
      <input type="${q.tipo === 'fecha' ? 'date' : 'time'}" data-clave="${i}"
        value="${esc(q.respuesta_correcta ?? '')}"></div>`;
  }

  // multiple, casillas, desplegable, verdadero_falso
  const fijas = !!d.fijas;
  const marca = (o) => d.varias
    ? (Array.isArray(q.respuesta_correcta) && q.respuesta_correcta.includes(o))
    : q.respuesta_correcta === o;
  /* El control que marca la correcta lleva la POSICIÓN de la opción, no su
     texto. Con el texto pasaba esto: se escribía «Caracas» en la casilla, se
     pulsaba el redondel de al lado —que seguía teniendo el valor en blanco del
     último pintado— y la evaluación se guardaba sin respuesta correcta. Nadie
     se enteraba hasta que corregía mal todas las entregas. */
  return `<label class="tiny negrita">Opciones — marca la${d.varias ? 's' : ''} correcta${d.varias ? 's' : ''}</label>
    ${(q.opciones || []).map((o, k) => `<div class="opt-fila ${marca(o) && o ? 'correcta' : ''}">
      <input type="${d.varias ? 'checkbox' : 'radio'}" name="clave_${i}" data-clave="${i}" data-k="${k}"
        ${marca(o) && o ? 'checked' : ''} title="Marcar como correcta">
      <input type="text" data-op="${i}:${k}" value="${esc(o)}" placeholder="Opción ${k + 1}" ${fijas ? 'readonly' : ''}>
      ${fijas ? '' : `<button type="button" class="btn ghost sm" data-rmop="${i}:${k}"
        ${(q.opciones || []).length <= 2 ? 'disabled' : ''} title="Quitar la opción">
        <span class="material-symbols-outlined">close</span></button>`}
    </div>`).join('')}
    ${fijas ? '' : `<button type="button" class="btn ghost sm" data-addop="${i}">
      <span class="material-symbols-outlined">add</span> Agregar opción</button>`}`;
}

/**
 * Escucha el trozo que devuelve editorDeCuerpo(). Escribe directamente sobre el
 * objeto `q` que se le pase.
 * @param {{raiz:Element, q:object, i?:number|string, repintar:Function}} o
 */
export function conectarEditorDeCuerpo({ raiz, q, i = 0, repintar }) {
  const d = TIPOS[q.tipo] || {};

  $$(`[data-op^="${i}:"]`, raiz).forEach((el) => el.oninput = () => {
    const k = Number(el.dataset.op.split(':')[1]);
    const antes = q.opciones[k];
    q.opciones[k] = el.value;
    // Si la opción que se está renombrando era la correcta, la clave la sigue.
    // Si no, cambiarle una letra al texto deja la pregunta sin clave y nadie lo
    // nota hasta que ya corrigió mal todas las entregas.
    if (Array.isArray(q.respuesta_correcta)) {
      q.respuesta_correcta = q.respuesta_correcta.map((v) => (v === antes ? el.value : v));
    } else if (q.respuesta_correcta === antes) {
      q.respuesta_correcta = el.value;
    }
  });
  // Al salir de la casilla se repinta: es lo que mueve la marca de «correcta»
  // al texto nuevo y deja los controles con la lista de opciones al día.
  $$(`[data-op^="${i}:"]`, raiz).forEach((el) => el.onchange = repintar);
  $$(`[data-addop="${i}"]`, raiz).forEach((el) => el.onclick = () => { q.opciones.push(''); repintar(); });
  $$(`[data-rmop^="${i}:"]`, raiz).forEach((el) => el.onclick = () => {
    const k = Number(el.dataset.rmop.split(':')[1]);
    const fuera = q.opciones.splice(k, 1)[0];
    if (Array.isArray(q.respuesta_correcta)) q.respuesta_correcta = q.respuesta_correcta.filter((v) => v !== fuera);
    else if (q.respuesta_correcta === fuera) q.respuesta_correcta = null;
    repintar();
  });

  $$(`[data-clave="${i}"]`, raiz).forEach((el) => {
    const guardar = () => {
      if (q.tipo === 'corta') {
        const lineas = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
        q.respuesta_correcta = lineas.length ? lineas : null;
      } else if (q.tipo === 'escala') {
        q.respuesta_correcta = el.value === '' ? null : Number(el.value);
      } else if (el.dataset.k != null) {
        // Opciones: la clave se lee de q.opciones por posición.
        if (d.varias) {
          const marcadas = $$(`[data-clave="${i}"]`, raiz).filter((x) => x.checked)
            .map((x) => q.opciones[Number(x.dataset.k)]).filter((v) => String(v ?? '').trim() !== '');
          q.respuesta_correcta = marcadas.length ? marcadas : null;
        } else {
          q.respuesta_correcta = q.opciones[Number(el.dataset.k)] || null;
        }
      } else {
        q.respuesta_correcta = el.value || null;
      }
      if (el.type === 'radio' || el.type === 'checkbox') repintar();
    };
    if (el.type === 'radio' || el.type === 'checkbox') el.onchange = guardar;
    else { el.oninput = guardar; el.onchange = guardar; }
  });

  $$(`[data-cfg^="${i}:"]`, raiz).forEach((el) => el.onchange = () => {
    const campo = el.dataset.cfg.split(':')[1];
    const numerico = el.type === 'number' || campo === 'min' || campo === 'max';
    q.config = { ...(q.config || {}), [campo]: numerico ? Number(el.value) : el.value };
    if (campo === 'min' || campo === 'max') repintar();
  });

  $$(`[data-fila^="${i}:"]`, raiz).forEach((el) => {
    const k = Number(el.dataset.fila.split(':')[1]);
    // Al renombrar una fila hay que mover su clave, que va indexada por nombre.
    el.onchange = () => {
      const antes = q.config.filas[k];
      q.config.filas[k] = el.value;
      const c = q.respuesta_correcta;
      if (c && typeof c === 'object' && !Array.isArray(c) && antes in c && antes !== el.value) {
        c[el.value] = c[antes]; delete c[antes];
      }
      repintar();
    };
    el.oninput = () => { q.config.filas[k] = el.value; };
  });
  $$(`[data-col^="${i}:"]`, raiz).forEach((el) => {
    const k = Number(el.dataset.col.split(':')[1]);
    el.oninput = () => { q.config.columnas[k] = el.value; };
    el.onchange = repintar;
  });
  $$(`[data-addfila="${i}"]`, raiz).forEach((el) => el.onclick = () => { q.config.filas.push(''); repintar(); });
  $$(`[data-addcol="${i}"]`, raiz).forEach((el) => el.onclick = () => { q.config.columnas.push(''); repintar(); });
  $$(`[data-rmfila^="${i}:"]`, raiz).forEach((el) => el.onclick = () => {
    const k = Number(el.dataset.rmfila.split(':')[1]);
    const fuera = q.config.filas.splice(k, 1)[0];
    if (q.respuesta_correcta && typeof q.respuesta_correcta === 'object') delete q.respuesta_correcta[fuera];
    repintar();
  });
  $$(`[data-rmcol^="${i}:"]`, raiz).forEach((el) => el.onclick = () => {
    const k = Number(el.dataset.rmcol.split(':')[1]);
    q.config.columnas.splice(k, 1); repintar();
  });

  $$(`[data-rejclave="${i}"]`, raiz).forEach((el) => el.onchange = () => {
    const f = el.dataset.f;
    const c = q.respuesta_correcta;
    const clave = (c && typeof c === 'object' && !Array.isArray(c)) ? { ...c } : {};
    if (el.type === 'checkbox') {
      const marcadas = $$(`[data-rejclave="${i}"]`, raiz)
        .filter((x) => x.dataset.f === f && x.checked).map((x) => x.value);
      if (marcadas.length) clave[f] = marcadas; else delete clave[f];
    } else if (el.value) { clave[f] = el.value; } else { delete clave[f]; }
    q.respuesta_correcta = Object.keys(clave).length ? clave : null;
  });

  montarAyudas(raiz);
}
