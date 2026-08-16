// CEM · Runtime compartido por todas las páginas de la plataforma.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* La apariencia elegida se aplica al importar este módulo, que es lo primero
   que corre en cualquier pantalla y ocurre antes de que `mount()` destape
   `#page`. Se reexporta para que Configuración pueda ofrecerla. */
export { PALETAS, PALETA_POR_DEFECTO, aplicarApariencia,
         paletaActual, temaActual, vidrioActual } from './temas.js';

export const SUPABASE_URL = 'https://vajbsfgojtunamhrzrpf.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_Xljd7Ep1GxBXSPp5F4A1hg_Qg-iESzl';
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ============ utilidades ============ */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const money = (n, cur = 'USD') => (n == null ? '—' :
  new Intl.NumberFormat('es-ES', { style: 'currency', currency: cur, maximumFractionDigits: 2 }).format(Number(n)));
export const num = (n) => (n == null ? '—' : new Intl.NumberFormat('es-ES').format(Number(n)));
export const fdate = (d) => d ? new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

/* Fecha corta, para dentro de una tabla. «28 ago 2026» ocupa una columna
   entera; en una lista ordenada por fecha basta el día y el mes, y el año sólo
   cuando no es el corriente. */
export const fdateCorta = (d) => {
  if (!d) return '—';
  const f = new Date(d);
  const esteAno = f.getFullYear() === new Date().getFullYear();
  return f.toLocaleDateString('es-ES', esteAno
    ? { day: '2-digit', month: 'short' }
    : { day: '2-digit', month: 'short', year: '2-digit' });
};
export const fdatetime = (d) => d ? new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const initials = (a, b) => ((a || '?')[0] + (b ? b[0] : '')).toUpperCase();
export const qs = (k) => new URLSearchParams(location.search).get(k);
export const pct = (n) => `${Math.round(Number(n) || 0)}%`;

/* ============ una nota, con su escala (item 57) ============
   Un «18» suelto no dice nada: puede ser sobre 20 —notable— o sobre 100
   —suspenso—. Y sin saber con cuánto se aprueba esa evaluación, tampoco se
   sabe si el 18 sirve. Van siempre los tres números juntos. */
export function nota(puntaje, sobre = 100, aprueba = null) {
  if (puntaje == null || puntaje === '') return '<span class="muted">Sin calificar</span>';
  const n = Number(puntaje), max = Number(sobre) || 100;
  const min = aprueba == null ? null : Number(aprueba);
  const paso = min == null ? null : n >= min;
  return `<b class="${paso === false ? 'err-text' : ''}">${n} / ${max}</b>` +
    (min == null ? '' : ` <span class="tiny muted">· aprueba con ${min}</span>`);
}

/** La misma nota resumida a un chip, para las listas apretadas. */
export function chipNota(puntaje, sobre = 100, aprueba = null) {
  if (puntaje == null || puntaje === '') return chip('Sin calificar', 'neutral');
  const n = Number(puntaje), max = Number(sobre) || 100;
  const min = aprueba == null ? null : Number(aprueba);
  const paso = min == null ? null : n >= min;
  return chip(`${n} / ${max}${min == null ? '' : paso ? ' · aprobado' : ' · reprobado'}`,
    paso == null ? 'info' : paso ? 'ok' : 'err');
}

/* ============ cómo se escribe el dinero ============
   Una columna de cifras sólo se puede comparar de un vistazo si están alineadas
   a la derecha y todos los dígitos ocupan lo mismo. Antes cada pantalla lo
   resolvía a su manera —o no lo resolvía— y en la misma columna convivían
   «2160,00 US$» y un «0» pelado. */

/** Celda de dinero para una tabla: alineada, con dígitos de ancho fijo. */
export const celdaMoney = (n, cur = 'USD') =>
  `<td class="num">${n == null ? '—' : esc(money(n, cur))}</td>`;

/** Un saldo: cuando no se debe nada lo dice con palabras, que es lo que importa. */
/* item 31 · en la misma columna convivían «2160,00 US$» alineado a la derecha
   y un chip «Al día» centrado, así que la columna dejaba de leerse en
   vertical, que es lo único que una columna sabe hacer. Ahora las dos formas
   ocupan el mismo sitio: cifra o guion, ambos a la derecha. */
export const saldo = (n, cur = 'USD') =>
  (Number(n) || 0) <= 0
    ? '<span class="muted" title="Sin nada pendiente">—</span>'
    : esc(money(n, cur));

/**
 * Cuánto vale un pago en dólares, sea cual sea la moneda en que se hizo.
 *
 * Un pago guarda `monto` en la moneda en que se pagó y `monto_base` ya
 * convertido a dólares (nulo cuando el pago ya era en dólares). Sumar `monto` a
 * secas cuenta 4.575 bolívares como 4.575 dólares: la cifra de ingresos salía
 * disparada y no cuadraba con nada.
 */
export const enDolares = (pago) => {
  if (!pago) return 0;
  if (pago.monto_base != null) return Number(pago.monto_base) || 0;
  const m = Number(pago.monto) || 0;
  if (!pago.moneda || pago.moneda === 'USD') return m;
  const t = Number(pago.tasa) || 0;
  return t > 0 ? m / t : 0;   // sin tasa no se puede convertir: no se inventa
};

/** Cómo se muestra un pago: lo que se pagó y, si no fue en dólares, su equivalente. */
export const montoPagado = (pago) => {
  if (!pago) return '—';
  const propio = money(pago.monto, pago.moneda || 'USD');
  if (!pago.moneda || pago.moneda === 'USD') return propio;
  return `${propio}<div class="tiny muted">${money(enDolares(pago))} a ${num(pago.tasa)}</div>`;
};

/** El mismo importe en bolívares y en dólares, con la tasa que se usó. */
export function moneyBs(montoUsd, tasa, cur = 'USD') {
  if (montoUsd == null) return '—';
  const enUsd = money(montoUsd, cur);
  if (!tasa || Number(tasa) <= 0) return enUsd;
  const bs = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(Number(montoUsd) * Number(tasa));
  return `${enUsd}<span class="tiny muted"> · ${bs} Bs a ${num(tasa)}</span>`;
}

/* ============ cómo se llaman las cosas ============
   La base guarda `en_revision`, `verdadero_falso`, `pago movil`. Eso está bien
   dentro de la base y muy mal en la pantalla: sin tildes, en minúscula y con
   guiones bajos. Aquí está la traducción, en un solo sitio, para que la misma
   cosa se llame igual en las 50 pantallas. */
export const ETIQUETAS = {
  // publicación de cursos, contenidos y evaluaciones
  borrador: 'Borrador', en_revision: 'En revisión', publicado: 'Publicado',
  pausado: 'En pausa', archivado: 'Archivado',
  // modalidad
  online: 'En línea', en_vivo: 'En vivo', presencial: 'Presencial', hibrido: 'Híbrido',
  // nivel
  basico: 'Básico', intermedio: 'Intermedio', avanzado: 'Avanzado',
  // tipo de programa
  masterclass: 'Masterclass', curso: 'Curso', programa: 'Programa',
  diplomado: 'Diplomado', maestria: 'Maestría',
  // cohortes
  planificada: 'Planificada', inscripciones_abiertas: 'Inscripciones abiertas',
  en_curso: 'En curso', finalizada: 'Finalizada', cancelada: 'Cancelada',
  // inscripciones
  pendiente: 'Pendiente', activa: 'Activa', suspendida: 'Suspendida', congelada: 'Congelada',
  // cuotas
  parcial: 'Pagada a medias', pagada: 'Pagada', vencida: 'Vencida',
  anulada: 'Anulada', reembolsada: 'Reembolsada',
  // pagos
  reportado: 'En revisión', confirmado: 'Confirmado', rechazado: 'Rechazado',
  transferencia: 'Transferencia', zelle: 'Zelle', paypal: 'PayPal', binance: 'Binance',
  efectivo: 'Efectivo', 'pago movil': 'Pago móvil', pago_movil: 'Pago móvil', tarjeta: 'Tarjeta',
  // lecciones y biblioteca
  video: 'Vídeo', pdf: 'PDF', texto: 'Texto', enlace: 'Enlace', quiz: 'Cuestionario',
  tarea: 'Tarea', excel: 'Excel', imagen: 'Imagen',
  // evaluaciones y preguntas
  examen: 'Examen', practica: 'Práctica', ensayo: 'Desarrollo',
  multiple: 'Opción múltiple', verdadero_falso: 'Verdadero o falso', corta: 'Respuesta corta',
  // entregas
  en_progreso: 'En progreso', entregada: 'Entregada', calificada: 'Calificada', tarde: 'Entregada tarde',
  // clases
  programada: 'Programada', dictada: 'Dictada', reprogramada: 'Reprogramada',
  // prioridad y dificultad
  baja: 'Baja', media: 'Media', alta: 'Alta', urgente: 'Urgente',
  // tickets
  abierto: 'Abierto', en_proceso: 'En proceso', esperando: 'Esperando respuesta',
  resuelto: 'Resuelto', cerrado: 'Cerrado',
  acceso: 'Acceso', contenido: 'Contenido', pagos: 'Pagos',
  certificados: 'Certificados', general: 'General',
  // apelaciones
  recibida: 'Recibida', en_analisis: 'En análisis', requiere_info: 'Falta información',
  aceptada: 'Aceptada',
  // comunicaciones
  todos: 'Todos', estudiantes: 'Estudiantes', profesores: 'Profesores',
  administrativos: 'Administrativos', plataforma: 'En la plataforma', email: 'Por correo',
  ambos: 'Plataforma y correo',
  // roles
  estudiante: 'Estudiante', profesor: 'Profesor', coordinador: 'Coordinador',
  cobranza: 'Cobranza', admin: 'Administrador', auditor: 'Auditor',
  superadmin: 'Administrador general',
};

/** Qué puede hacer cada rol, para que asignarlo no sea adivinar. */
export const QUE_HACE_EL_ROL = {
  estudiante: 'Ve lo suyo: sus cursos, sus notas y sus pagos.',
  profesor: 'Sólo los cursos que dicta. Pone notas y pasa asistencia.',
  coordinador: 'Lo académico y lo administrativo. No cambia roles ni cuentas.',
  cobranza: 'Sólo dinero: cuotas, pagos y estudiantes. Nada de cursos ni notas.',
  admin: 'Todo, incluidos los roles y las cuentas.',
  auditor: 'Lee todo y no puede escribir nada.',
  superadmin: 'Todo, sin límites.',
};

/** El nombre en castellano de un valor guardado. Si no lo conoce, lo deja presentable. */
export const etiqueta = (v) => {
  if (v == null || v === '') return '—';
  const k = String(v).trim();
  if (ETIQUETAS[k]) return ETIQUETAS[k];
  const suelto = k.replace(/_/g, ' ');
  return suelto.charAt(0).toUpperCase() + suelto.slice(1);
};

/**
 * Opciones de un desplegable, ya traducidas.
 * `opciones(['borrador','publicado'], curso.estado)` en vez de repetir el map.
 */
export const opciones = (valores, seleccionado) => valores.map((v) =>
  `<option value="${esc(v)}"${v === seleccionado ? ' selected' : ''}>${esc(etiqueta(v))}</option>`).join('');

/** Igual que `chip`, pero traduciendo el valor. */
export const chipEstado = (v, kind) => chip(etiqueta(v), kind);

/* ============ fechas ============ */
/** «hace 3 días», «ayer», «en 2 semanas» — cómo lo piensa la gente. */
export function fdesde(d) {
  if (!d) return '—';
  const dias = Math.round((new Date(d) - new Date()) / 86400000);
  const rtf = new Intl.RelativeTimeFormat('es-ES', { numeric: 'auto' });
  if (Math.abs(dias) === 0) return 'hoy';
  if (Math.abs(dias) < 30) return rtf.format(dias, 'day');
  if (Math.abs(dias) < 365) return rtf.format(Math.round(dias / 30), 'month');
  return fdate(d);
}
/** La fecha de siempre y, al lado, cuánto hace. */
export const fdateRel = (d) => d ? `${fdate(d)}<span class="tiny muted"> · ${fdesde(d)}</span>` : '—';

export function toast(msg, kind = '') {
  let host = $('#toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; document.body.appendChild(host); }
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  const icon = kind === 'ok' ? 'check_circle' : kind === 'err' ? 'error' : 'info';
  el.innerHTML = `<span class="material-symbols-outlined">${icon}</span><span>${esc(msg)}</span>`;
  host.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}
export const ok = (m) => toast(m, 'ok');
export const fail = (m) => toast(m, 'err');

/**
 * Aviso de que algo salió bien, diciendo QUÉ salió bien y ofreciendo deshacerlo.
 * Antes salía «Guardado» y desaparecía: si guardaste la fila equivocada no había
 * forma de saberlo ni de volver atrás.
 */
export function okDeshacer(msg, deshacer) {
  let host = $('#toasts');
  if (!host) { host = document.createElement('div'); host.id = 'toasts'; document.body.appendChild(host); }
  const el = document.createElement('div');
  el.className = 'toast ok';
  el.innerHTML = `<span class="material-symbols-outlined">check_circle</span>
    <span class="grow">${esc(msg)}</span>
    <button type="button" class="btn ghost sm deshacer">Deshacer</button>`;
  host.appendChild(el);
  const quitar = () => el.remove();
  const plazo = setTimeout(quitar, 7000);   // más que un aviso normal: hay que poder leerlo y decidir
  el.querySelector('.deshacer').addEventListener('click', async () => {
    clearTimeout(plazo); quitar();
    try { await deshacer(); toast('Deshecho'); }
    catch (e) { fail(mensajeError(e, 'No se pudo deshacer.')); }
  });
}

/**
 * El aviso de un formulario, escrito siempre igual (item 53).
 *
 * Un mensaje flotante en la esquina sirve para contar lo que ya pasó; lo que
 * hay que corregir se dice junto al formulario. Antes cada pantalla lo pintaba
 * a su manera —etiqueta roja, párrafo gris, chip verde—; ahora hay una sola
 * forma y un solo sitio.
 *
 * @param {HTMLElement|string} donde  el hueco reservado en el diálogo
 * @param {string} texto  vacío para borrar el aviso anterior
 * @param {'err'|'ok'|'warn'|''} tipo
 */
export function avisar(donde, texto, tipo = 'err') {
  const el = typeof donde === 'string' ? $(donde) : donde;
  if (!el) return;
  // El aviso va DENTRO del hueco, no encima de él: así el hueco conserva sus
  // clases y quien luego lo repinte con contenido normal lo deja limpio.
  el.innerHTML = '';
  if (!texto) return;
  const p = document.createElement('p');
  p.className = `nota ${tipo}`.trim();
  p.textContent = texto;
  el.appendChild(p);
}

/**
 * El botoncito «?» junto a una etiqueta: dos frases donde surge la duda, en vez
 * de mandar a la persona al manual en otra pestaña.
 */
export const ayuda = (texto) =>
  `<button type="button" class="ayuda-btn" data-ayuda="${esc(texto)}"
     aria-label="Qué es esto">?</button>`;

/** Conecta los «?» de un contenedor. Se llama solo en cada mount(). */
export function montarAyudas(root = document) {
  $$('[data-ayuda]', root).forEach((b) => {
    if (b.dataset.listo) return;
    b.dataset.listo = '1';
    b.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      const previo = $('.ayuda-globo');
      if (previo) previo.remove();
      const globo = document.createElement('div');
      globo.className = 'ayuda-globo';
      globo.textContent = b.dataset.ayuda;
      document.body.appendChild(globo);
      const r = b.getBoundingClientRect();
      globo.style.top = `${r.bottom + window.scrollY + 6}px`;
      globo.style.left = `${Math.max(8, Math.min(r.left + window.scrollX, innerWidth - 300))}px`;
      const cerrar = (ev) => {
        if (globo.contains(ev.target) || b.contains(ev.target)) return;
        globo.remove(); document.removeEventListener('click', cerrar);
      };
      setTimeout(() => document.addEventListener('click', cerrar), 0);
    });
  });
}

/**
 * Avisa antes de salir de un formulario con cambios sin guardar.
 * Devuelve `{ tocado(), limpio() }` para marcar cuándo se guardó.
 */
export function vigilarCambiosSinGuardar(form) {
  let sucio = false;
  const marcar = () => { sucio = true; };
  form.addEventListener('input', marcar);
  form.addEventListener('change', marcar);
  const avisar = (e) => { if (sucio) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', avisar);
  return {
    tocado: () => sucio,
    limpio: () => { sucio = false; },
    soltar: () => window.removeEventListener('beforeunload', avisar),
  };
}

/** Modal reutilizable. Devuelve el nodo; se cierra con .close() */
export function modal({ title, body, footer, wide = false }) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${wide ? 'wide' : ''}">
    <div class="modal-h"><h3>${esc(title || '')}</h3>
      <button class="icon-btn" data-x><span class="material-symbols-outlined">close</span></button></div>
    <div class="modal-b"></div>
    ${footer ? '<div class="modal-f"></div>' : ''}
  </div>`;
  $('.modal-b', bg).innerHTML = body || '';
  if (footer) $('.modal-f', bg).innerHTML = footer;
  bg.close = () => bg.remove();
  // Se conectan TODOS los [data-x], no sólo el primero: además de la X de la
  // cabecera, el pie suele traer un botón "Cancelar" con la misma marca.
  $$('[data-x]', bg).forEach(b => { b.onclick = bg.close; });
  bg.onclick = (e) => { if (e.target === bg) bg.close(); };
  botonesQueAvisan(bg);
  fechasSinAmbiguedad(bg);
  document.body.appendChild(bg);
  return bg;
}

/* ============ el botón que dice que está trabajando (item 52) ============
   Guardar tarda un segundo largo y hasta ahora no cambiaba nada en pantalla:
   la gente volvía a pulsar y se guardaba dos veces. La convención de toda la
   plataforma es que el botón de confirmar de un diálogo lleva `data-s`, así
   que en vez de repetir el mismo `disabled = true` en las treinta pantallas se
   intercepta aquí la asignación del `onclick`: lo que la página escriba queda
   envuelto en `ocupado()` sin que tenga que enterarse. */
function botonesQueAvisan(raiz) {
  $$('[data-s]', raiz).forEach((b) => {
    const mientras = /guard/i.test(b.textContent) ? 'Guardando…'
      : /emit/i.test(b.textContent) ? 'Emitiendo…'
      : /crear/i.test(b.textContent) ? 'Creando…'
      : /envi/i.test(b.textContent) ? 'Enviando…'
      : 'Un momento…';
    let hacer = null, conectado = false;
    Object.defineProperty(b, 'onclick', {
      configurable: true,
      get: () => hacer,
      set: (fn) => {
        hacer = fn;
        if (conectado) return;   // reasignar no debe encadenar dos oyentes
        conectado = true;
        b.addEventListener('click', (ev) => ocupado(b, mientras, () => hacer?.call(b, ev)));
      },
    });
  });
}

export function confirmDialog(msg, title = 'Confirmar') {
  return new Promise(res => {
    const m = modal({ title, body: `<p>${esc(msg)}</p>`,
      footer: `<button class="btn outline" data-no>Cancelar</button><button class="btn" data-si>Confirmar</button>` });
    $('[data-no]', m).onclick = () => { m.close(); res(false); };
    $('[data-si]', m).onclick = () => { m.close(); res(true); };
  });
}

/* ============ vocabulario y mensajes en un solo lugar ============
 * Antes cada pantalla escribía sus propios textos: cambiar cómo se llama algo
 * obligaba a buscarlo por los 44 archivos y siempre quedaba alguno viejo.
 * Los términos del negocio y los mensajes de error viven acá. */
export const TXT = {
  cuota: 'cuota', cuotas: 'cuotas',
  inscripcion: 'inscripción', inscripciones: 'inscripciones',
  cohorte: 'cohorte', cohortes: 'cohortes',
  evaluacion: 'evaluación', evaluaciones: 'evaluaciones',
  entrega: 'entrega', constancia: 'constancia de estudios',
  /* item 42 · un error que sólo dice «no se pudo» deja a la persona parada.
     Cada mensaje termina diciendo qué hacer con él. */
  sinPermiso: 'Tu rol no puede hacer esto. Pídele a un administrador que te lo habilite en Permisos.',
  sesionVencida: 'Tu sesión venció por seguridad. Vuelve a entrar y retoma donde ibas.',
  sinConexion: 'No se pudo hablar con el servidor. Revisa tu internet y vuelve a intentarlo; nada se guardó a medias.',
  guardado: 'Guardado.',
  errorGenerico: 'No se pudo completar la operación. Inténtalo otra vez; si vuelve a fallar, avísale al equipo técnico con la hora exacta.',
};

/* ============ traducción de errores (uno solo para toda la plataforma) ============
 * La base responde en inglés y con códigos: "duplicate key value violates
 * unique constraint" no le dice nada a quien está del otro lado. Acá se
 * traduce lo conocido y se deja pasar tal cual lo que ya viene en castellano
 * (nuestras funciones del servidor lanzan mensajes escritos para leerse). */
const ERRORES_CONOCIDOS = {
  '23505': 'Ya existe un registro con esos mismos datos. Búscalo en la lista y edítalo en vez de crear otro.',
  '23503': 'No se puede borrar: hay información que depende de esto. Quita primero lo que cuelga de aquí.',
  '23514': 'Alguno de los datos está fuera de lo permitido. Revisa los campos marcados y corrige el que no cuadre.',
  '23502': 'Falta un dato obligatorio. Completa los campos con asterisco y vuelve a guardar.',
  '22P02': 'Un dato tiene un formato que no se entiende: revisa fechas, montos y números.',
  '42501': TXT.sinPermiso,
  '42P01': 'Esa parte del sistema todavía no está disponible. Avísale al equipo técnico.',
  'PGRST301': TXT.sesionVencida,
  'PGRST116': 'No se encontró lo que buscabas. Puede que alguien lo haya borrado: recarga la lista.',
  'PGRST201': 'La consulta quedó ambigua. Avísale al equipo técnico indicando en qué pantalla pasó.',
};

/** Convierte cualquier error (de Supabase, de red o propio) en una frase legible. */
export function mensajeError(e, porDefecto = TXT.errorGenerico) {
  if (!e) return porDefecto;
  if (typeof e === 'string') return e;
  const code = e.code || e.status;
  // Las políticas de acceso responden con "row-level security" o 401/403.
  if (/row-level security|violates row-level/i.test(e.message || '')) return TXT.sinPermiso;
  if (code === 401 || code === 403) return TXT.sinPermiso;
  if (/Failed to fetch|NetworkError|load failed/i.test(e.message || '')) return TXT.sinConexion;
  if (/JWT expired|invalid claim|token is expired/i.test(e.message || '')) return TXT.sesionVencida;
  if (ERRORES_CONOCIDOS[code]) return ERRORES_CONOCIDOS[code];
  // P0001 es un `raise exception` nuestro: el mensaje ya está redactado.
  if (code === 'P0001' || code === 'P0002') return e.message || porDefecto;
  const m = e.message || e.error_description || '';
  // Si sigue viniendo en inglés técnico, no se lo mostramos crudo a nadie.
  if (!m || /^[\x00-\x7F]*$/.test(m) && /constraint|relation|column|syntax|operator|function .* does not exist/i.test(m)) {
    return porDefecto;
  }
  return m;
}

/** Envuelve una llamada a Supabase mostrando el error si falla. */
export async function run(promise, errMsg = TXT.errorGenerico) {
  const { data, error } = await promise;
  if (error) {
    if (esErrorDeSesion(error)) { sesionVencida(); throw error; }
    fail(mensajeError(error, errMsg));
    throw error;
  }
  return data;
}

/* ============ cuando la consulta no vuelve (item 12) ============
   Si una consulta falla, la tabla se queda vacía y parece que no hay datos.
   «No hay estudiantes» y «no pudimos preguntar» son cosas muy distintas y se
   veían igual: la primera es una respuesta, la segunda es un fallo que hay que
   reintentar. Este envoltorio distingue las dos y ofrece volver a probar.

   @param {Function} consultar  devuelve la promesa de Supabase
   @param {HTMLElement|string} donde  dónde escribir el aviso si falla
   @param {Function} pintar  qué hacer con los datos cuando llegan */
export async function cargarEn(donde, consultar, pintar) {
  const host = typeof donde === 'string' ? $(donde) : donde;
  try {
    const { data, error } = await consultar();
    if (error) throw error;
    return pintar(data);
  } catch (e) {
    if (esErrorDeSesion(e)) { sesionVencida(); return; }
    if (!host) { fail(mensajeError(e)); return; }
    const aviso = `<div class="empty">
      <span class="material-symbols-outlined ico">cloud_off</span>
      <b>No pudimos cargar esto</b>
      <span>${esc(mensajeError(e, 'La consulta no llegó a completarse.'))}</span>
      <button class="btn sm" type="button" data-reintentar>Volver a intentarlo</button>
    </div>`;
    // Dentro de una tabla el aviso tiene que ir en una fila, o el navegador lo
    // saca del <tbody> y aparece flotando encima del encabezado.
    if (host.tagName === 'TBODY') {
      const columnas = host.closest('table')?.querySelectorAll('thead th').length || 1;
      host.innerHTML = `<tr><td colspan="${columnas}">${aviso}</td></tr>`;
    } else {
      host.innerHTML = aviso;
    }
    host.querySelector('[data-reintentar]').onclick = () => cargarEn(donde, consultar, pintar);
  }
}

/* ============ el filtro, en la dirección de la página (item 13) ============
   Se filtra, se entra a una ficha, se vuelve — y la lista está otra vez
   completa. Guardando el filtro en la dirección, el botón de atrás funciona y
   además se puede mandar a alguien «mira esta pantalla como la veo yo».

   `replaceState` y no `pushState` a propósito: escribir en un buscador no debe
   dejar veinte entradas en el historial. */
export function filtrosEnLaDireccion(campos, alCambiar) {
  const url = new URL(location.href);
  const leer = () => Object.fromEntries(
    Object.keys(campos).map((k) => [k, url.searchParams.get(k) || '']));

  // Al abrir: lo que venga en la dirección manda sobre lo que haya en el campo.
  const inicial = leer();
  Object.entries(campos).forEach(([clave, sel]) => {
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (el && inicial[clave]) el.value = inicial[clave];
  });

  const guardar = () => {
    const u = new URL(location.href);
    Object.entries(campos).forEach(([clave, sel]) => {
      const el = typeof sel === 'string' ? $(sel) : sel;
      const v = (el?.value || '').trim();
      if (v) u.searchParams.set(clave, v); else u.searchParams.delete(clave);
    });
    history.replaceState(null, '', u);
  };

  Object.values(campos).forEach((sel) => {
    const el = typeof sel === 'string' ? $(sel) : sel;
    if (!el) return;
    ['input', 'change'].forEach((ev) => el.addEventListener(ev, () => {
      guardar();
      alCambiar?.();
    }));
  });
  return inicial;
}

/* ============ cuántas filas hay (item 14) ============
   Las consultas piden hasta 300 o 500 registros y la lista se corta ahí sin
   decirlo: nadie se entera de que faltan. Esto dice cuántas se ven, cuántas
   hay, y avisa cuando la lista está recortada. */
export function contarFilas(donde, mostradas, total, tope = null) {
  const host = typeof donde === 'string' ? $(donde) : donde;
  if (!host) return;
  const recortada = tope != null && total >= tope;
  host.innerHTML = mostradas === total
    ? `<span class="cuenta-filas">${num(total)} ${total === 1 ? 'fila' : 'filas'}${
        recortada ? ` <b>· la lista está recortada en ${num(tope)}: afina el filtro para verlo todo</b>` : ''}</span>`
    : `<span class="cuenta-filas">${num(mostradas)} de ${num(total)}${
        recortada ? ` <b>· recortada en ${num(tope)}</b>` : ''}</span>`;
}

/* ============ borrar pide la misma puerta en todas partes (item 15) ============
   Unas pantallas preguntaban y otras borraban directo. Y para lo grave, decir
   que sí no basta: hay que escribir el nombre de lo que se va a destruir, que
   es lo que obliga a leerlo. */
export function confirmarBorrado({ que, nombre, consecuencia, exigirNombre = false }) {
  return new Promise((res) => {
    const m = modal({ title: `Borrar ${que}`, body: `
      <p>Vas a borrar <b>${esc(nombre)}</b>.</p>
      ${consecuencia ? `<p class="nota warn">${esc(consecuencia)}</p>` : ''}
      ${exigirNombre ? `<div class="field">
        <label>Escribe <b>${esc(nombre)}</b> para confirmar</label>
        <input id="confNombre" autocomplete="off" spellcheck="false"></div>` : ''}
      <div id="confMsg"></div>`,
      footer: `<button class="btn outline" data-x>Cancelar</button>
               <button class="btn danger" data-borrar>Borrar</button>` });

    $('[data-x]', m).addEventListener('click', () => res(false));
    $('[data-borrar]', m).onclick = () => {
      if (exigirNombre && $('#confNombre', m).value.trim() !== String(nombre).trim()) {
        avisar($('#confMsg', m), 'El nombre no coincide. Cópialo tal cual para confirmar.', 'err');
        return;
      }
      m.close(); res(true);
    };
  });
}

export async function audit(accion, entidad, entidad_id, riesgo = 'bajo', detalle = {}) {
  try {
    const p = await profile();
    await sb.from('cem_audit_events').insert({
      actor_id: p?.id, actor_email: p?.email, accion, entidad, entidad_id, riesgo, detalle
    });
  } catch { /* la auditoría nunca debe romper el flujo */ }
}

/* ============ video (YouTube, sin costo y sin límite de espacio) ============
 * Los videos de los cursos no se guardan en Supabase Storage (su plan
 * gratuito sólo trae 1 GB, insuficiente para clases grabadas); se suben
 * directo desde el navegador a un canal de YouTube "no listado" conectado
 * en Configuración → Integraciones, y sólo se guarda el enlace embebible.
 * El archivo nunca pasa por nuestro servidor: pedimos un access_token de
 * corta duración a la función youtube-upload-token y con eso se habla
 * directo con la API de subida resumible de YouTube. */
export class YoutubeNoConectadoError extends Error {}

async function youtubeAccessToken() {
  const { data: { session } } = await sb.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/cem-youtube-upload-token`, {
    headers: { Authorization: `Bearer ${session?.access_token}`, apikey: SUPABASE_KEY },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (json.error === 'not_connected' || json.error === 'reauth_required') {
      throw new YoutubeNoConectadoError('El canal de YouTube no está conectado o hay que reconectarlo. Ve a Configuración → Integraciones.');
    }
    throw new Error(json.error || 'No se pudo preparar la subida.');
  }
  return json;
}

/**
 * Sube un archivo de video directo a YouTube (no listado) y devuelve el
 * enlace embebible listo para guardar en cem_lessons.url / cem_media.url.
 * onProgress recibe un número de 0 a 1.
 */
export async function subirVideoYoutube(file, { titulo = '', descripcion = '' } = {}, onProgress = () => {}) {
  const { access_token } = await youtubeAccessToken();

  const initRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(file.size),
      'X-Upload-Content-Type': file.type || 'video/*',
    },
    body: JSON.stringify({
      snippet: { title: titulo || file.name, description: descripcion || '' },
      status: { privacyStatus: 'unlisted', selfDeclaredMadeForKids: false },
    }),
  });
  if (!initRes.ok) throw new Error('YouTube rechazó iniciar la subida (' + initRes.status + ').');
  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) throw new Error('YouTube no devolvió la URL de subida.');

  const videoId = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl);
    xhr.setRequestHeader('Content-Type', file.type || 'video/*');
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText).id); }
        catch { reject(new Error('Respuesta inesperada de YouTube.')); }
      } else reject(new Error('La subida a YouTube falló (' + xhr.status + ').'));
    };
    xhr.onerror = () => reject(new Error('Error de red durante la subida.'));
    xhr.send(file);
  });

  return { videoId, embedUrl: `https://www.youtube.com/embed/${videoId}` };
}

/**
 * Modal reutilizable de "Subir video" (elegir archivo, título, progreso).
 * Devuelve una promesa que resuelve con { embedUrl, videoId } si se subió,
 * o null si se canceló.
 */
export function abrirSubidaVideo({ tituloDefault = '' } = {}) {
  return new Promise((resolve) => {
    const dlg = modal({ title: 'Subir video a YouTube', body: `
      <div class="field"><label>Archivo de video</label><input type="file" id="vArchivo" accept="video/*"></div>
      <div class="field"><label>Título en YouTube</label><input id="vTitulo" value="${esc(tituloDefault)}"></div>
      <p class="tiny muted">Se sube como "no listado": no aparece en búsquedas de YouTube, sólo es visible con el enlace.</p>
      <div id="vProgWrap" style="display:none;margin:10px 0">
        <div class="bar"><i id="vProgBar" style="width:0%"></i></div>
        <div class="tiny muted" id="vProgTxt" style="margin-top:4px">Subiendo… 0%</div>
      </div>
      <div id="vErr" class="tiny" style="color:var(--error)"></div>`,
      footer: `<button class="btn outline" data-x>Cancelar</button><button class="btn" data-s>Subir</button>` });
    let subiendo = false;
    $('[data-x]', dlg).onclick = () => { if (!subiendo) { dlg.close(); resolve(null); } };
    $('[data-s]', dlg).onclick = async () => {
      const file = $('#vArchivo', dlg).files[0];
      const err = $('#vErr', dlg);
      err.textContent = '';
      if (!file) { err.textContent = 'Elige un archivo de video.'; return; }
      subiendo = true;
      $('[data-s]', dlg).disabled = true; $('[data-x]', dlg).disabled = true;
      $('#vProgWrap', dlg).style.display = 'block';
      try {
        const resultado = await subirVideoYoutube(file, { titulo: $('#vTitulo', dlg).value.trim() || file.name }, (frac) => {
          const pctTxt = Math.round(frac * 100);
          $('#vProgBar', dlg).style.width = pctTxt + '%';
          $('#vProgTxt', dlg).textContent = `Subiendo… ${pctTxt}%`;
        });
        dlg.close(); resolve({ ...resultado, nombreArchivo: file.name, tamanoBytes: file.size });
      } catch (e) {
        subiendo = false;
        $('[data-s]', dlg).disabled = false; $('[data-x]', dlg).disabled = false;
        err.textContent = e instanceof YoutubeNoConectadoError ? e.message : (e.message || 'No se pudo subir el video.');
      }
    };
  });
}

/* ============ sesión y perfil ============ */
let _profile = null;
export async function profile() {
  if (_profile) return _profile;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data } = await sb.rpc('cem_my_profile');
  const row = Array.isArray(data) ? data[0] : data;
  // cem_my_profile() devuelve UNA fila (no un conjunto): si la sesión no
  // tiene perfil todavía, Postgres no da "sin filas" sino un registro con
  // todos los campos en null — un objeto, así que sigue siendo verdadero en
  // JS. Sin este chequeo, una cuenta sin perfil se veía como "desactivada"
  // en vez de mandarla al login (que sí sabe qué hacer si no hay sesión).
  _profile = (row && row.id) ? row : null;
  return _profile;
}
let _saliendoAProposito = false;
export async function logout() {
  _saliendoAProposito = true;
  await sb.auth.signOut();
  location.href = base() + 'index.html';
}

/* ============ sesión vencida ============
 * Cuando el token caduca, las consultas empiezan a devolver vacío y la
 * pantalla parece "sin datos" en vez de pedir entrar de nuevo — peor todavía
 * si pasa mientras alguien llena un formulario largo. Acá se detecta el
 * vencimiento (por evento de la librería o por el código del error) y se
 * avisa una sola vez, guardando a dónde iba para volver ahí después. */
export function esErrorDeSesion(e) {
  if (!e) return false;
  const code = e.code || e.status;
  return code === 'PGRST301' || code === 401
    || /JWT expired|token is expired|invalid claim/i.test(e.message || '');
}

let _avisoVencimiento = null;
export function sesionVencida() {
  if (_saliendoAProposito || _avisoVencimiento) return;
  if (document.body.classList.contains('cem-publico')) return;
  const destino = base() + 'index.html?next=' + encodeURIComponent(rutaRelativaActual())
    + '&motivo=vencida';
  _avisoVencimiento = modal({
    title: 'Tu sesión venció',
    body: `<p>Por seguridad, la sesión se cierra después de un rato sin actividad.
      Vuelve a entrar y te llevamos de nuevo a esta misma pantalla.</p>
      <p class="tiny muted">Si tenías algo escrito sin guardar, cópialo antes de continuar.</p>`,
    footer: `<button class="btn block" data-entrar>Volver a entrar</button>`,
  });
  $('[data-entrar]', _avisoVencimiento).onclick = () => { location.href = destino; };
}

function rutaRelativaActual() {
  const partes = location.pathname.split('/').filter(Boolean);
  const i = partes.indexOf('plataforma');
  const cola = i >= 0 ? partes.slice(i + 1) : partes.slice(-2);
  return cola.join('/') + location.search;
}

/* ============ enterarse de que algo se rompió ============
 * Si a un estudiante le explota una pantalla, nadie se entera salvo que lo
 * cuente. Los errores no controlados quedan asentados en la auditoría con la
 * pantalla y la línea, para poder revisarlos después sin depender del reporte
 * de nadie. Se limita a unos pocos por carga para no llenar la tabla si algo
 * falla dentro de un bucle. */
let _erroresVigilados = false;
let _erroresReportados = 0;
const TOPE_ERRORES_POR_CARGA = 3;

async function reportarError(origen, mensaje, extra = {}) {
  if (_erroresReportados >= TOPE_ERRORES_POR_CARGA) return;
  _erroresReportados++;
  try {
    const p = await profile();
    if (!p) return; // sin sesión no hay a quién atribuirlo ni permiso para escribir
    await sb.from('cem_audit_events').insert({
      actor_id: p.id, actor_email: p.email,
      accion: 'error_navegador', entidad: 'ui', riesgo: 'medio',
      detalle: {
        origen,
        mensaje: String(mensaje || '').slice(0, 500),
        pantalla: location.pathname.split('/').slice(-2).join('/'),
        navegador: navigator.userAgent.slice(0, 160),
        ...extra,
      },
    });
  } catch { /* si ni siquiera se puede avisar, no vale la pena insistir */ }
}

function vigilarErrores() {
  if (_erroresVigilados) return;
  _erroresVigilados = true;
  window.addEventListener('error', (e) => {
    if (!e.message) return;
    reportarError('error', e.message, { archivo: (e.filename || '').split('/').pop(), linea: e.lineno });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason;
    if (esErrorDeSesion(r)) { sesionVencida(); return; }
    reportarError('promesa', r?.message || r);
  });
}

/** Escucha los cambios de sesión de la librería. Lo llama mount() una vez. */
function vigilarSesion() {
  sb.auth.onAuthStateChange((evento, sesion) => {
    if (evento === 'SIGNED_OUT' && !sesion) sesionVencida();
    if (evento === 'TOKEN_REFRESHED' && !sesion) sesionVencida();
    if (evento === 'USER_UPDATED') _profile = null;
  });
}

/** Ruta base de la plataforma según la profundidad de la página actual. */
export function base() {
  return location.pathname.includes('/admin/') || location.pathname.includes('/estudiante/')
    || location.pathname.includes('/docente/') ? '../' : './';
}

/* ============ navegación ============ */
const ADMIN_NAV = [
  { lbl: 'General', items: [
    ['index.html', 'dashboard', 'Resumen'],
    ['reportes.html', 'analytics', 'Reportes'],
    ['calendario.html', 'calendar_today', 'Calendario'],
  ]},
  { lbl: 'Académico', items: [
    ['cursos.html', 'school', 'Cursos'],
    ['cohortes.html', 'groups', 'Cohortes'],
    ['contenido.html', 'import_contacts', 'Contenidos'],
    ['revision.html', 'fact_check', 'Revisión'],
    ['multimedia.html', 'perm_media', 'Biblioteca'],
    ['profesores.html', 'psychology', 'Profesores'],
  ]},
  { lbl: 'Estudiantes', items: [
    ['estudiantes.html', 'person', 'Estudiantes'],
    ['inscripciones.html', 'assignment_ind', 'Inscripciones y pagos'],
    ['pagos-verificar.html', 'fact_check', 'Verificar pagos'],
    ['cierre-mes.html', 'event_available', 'Cierre de mes'],
    ['bancaribe.html', 'account_balance', 'Banco (Bancaribe)'],
  ]},
  { lbl: 'Evaluación', items: [
    ['evaluaciones.html', 'quiz', 'Evaluaciones'],
    ['preguntas.html', 'help_center', 'Banco de preguntas'],
    ['calificar.html', 'grade', 'Calificar'],
    ['apelaciones.html', 'gavel', 'Apelaciones'],
  ]},
  { lbl: 'Credenciales', items: [
    ['certificados.html', 'workspace_premium', 'Certificados'],
    ['certificados-plantillas.html', 'design_services', 'Plantillas de certificados'],
    ['insignias.html', 'military_tech', 'Insignias'],
  ]},
  { lbl: 'Operación', items: [
    ['comunicaciones.html', 'mail', 'Comunicaciones'],
    ['soporte.html', 'support_agent', 'Soporte'],
  ]},
  { lbl: 'Gobierno', items: [
    ['usuarios.html', 'manage_accounts', 'Usuarios y roles'],
    ['permisos.html', 'admin_panel_settings', 'Matriz de permisos'],
    ['auditoria.html', 'history', 'Auditoría'],
    ['seguridad.html', 'shield_lock', 'Seguridad de mi cuenta'],
    ['configuracion.html', 'settings', 'Configuración'],
  ]},
];
const STUDENT_NAV = [
  ['panel.html', 'space_dashboard', 'Mi panel'],
  ['catalogo.html', 'menu_book', 'Catálogo'],
  ['pagos.html', 'payments', 'Mis pagos'],
  ['biblioteca.html', 'local_library', 'Biblioteca'],
  ['certificados.html', 'workspace_premium', 'Certificados'],
  ['perfil.html', 'account_circle', 'Mi perfil'],
];
const TEACHER_NAV = [
  ['panel.html', 'space_dashboard', 'Mi panel'],
  ['aula.html', 'menu_book', 'Mi aula'],
  ['grupo.html', 'insights', 'Cómo va mi grupo'],
  ['asistencia.html', 'how_to_reg', 'Asistencia'],
];

/* Barra inferior del teléfono: el menú institucional tiene 23 entradas y no cabe.
   Se muestran las de uso diario con etiqueta corta; el resto sigue estando
   completo en el menú lateral que abre el botón de hamburguesa. */
const ADMIN_MOBILE = [
  ['index.html', 'dashboard', 'Resumen'],
  ['cursos.html', 'school', 'Cursos'],
  ['estudiantes.html', 'person', 'Alumnos'],
  ['inscripciones.html', 'assignment_ind', 'Pagos'],
  ['calificar.html', 'grade', 'Calificar'],
];

const ROLES_STAFF = ['coordinador', 'admin', 'superadmin'];

/* El auditor entraba a las mismas pantallas del administrador con los botones
   escondidos: bastaba olvidar una comprobación en una pantalla nueva para que
   pudiera operar. Ahora la base misma le impide escribir, y además ve un menú
   propio con lo que de verdad necesita revisar. */
const AUDITOR_NAV = [
  { lbl: 'Auditoría', items: [
    ['auditoria.html', 'history', 'Registro de auditoría'],
    ['reportes.html', 'analytics', 'Reportes'],
    ['permisos.html', 'admin_panel_settings', 'Matriz de permisos'],
    ['seguridad.html', 'shield_lock', 'Seguridad de mi cuenta'],
  ]},
  { lbl: 'Consulta', items: [
    ['estudiantes.html', 'person', 'Estudiantes'],
    ['inscripciones.html', 'assignment_ind', 'Inscripciones y pagos'],
    ['certificados.html', 'workspace_premium', 'Certificados'],
    ['cursos.html', 'school', 'Cursos'],
  ]},
];

/* El rol de cobranza existe para que quien verifica pagos no necesite además
   acceso a cursos, notas y usuarios. Su menú es corto a propósito. */
const COBRANZA_NAV = [
  { lbl: 'Cobranza', items: [
    ['pagos-verificar.html', 'fact_check', 'Verificar pagos'],
    ['cierre-mes.html', 'event_available', 'Cierre de mes'],
    ['inscripciones.html', 'assignment_ind', 'Inscripciones y cuotas'],
    ['estudiantes.html', 'person', 'Estudiantes'],
    ['seguridad.html', 'shield_lock', 'Seguridad de mi cuenta'],
  ]},
];

/**
 * Punto de entrada de cada página.
 * @param {{require?:string[], active?:string, title?:string, area?:'admin'|'estudiante'|'docente', pub?:boolean}} opts
 */
/* Cuando no se puede entrar a una pantalla, mount() ya reemplazó el cuerpo por
 * el aviso correspondiente y no queda nada más que hacer. Devolver null no
 * bastaba: las páginas siguen ejecutándose después del `await mount(...)` y
 * enganchan eventos a elementos que ya no existen ("Cannot set properties of
 * null"). Con una promesa que nunca se resuelve, el módulo simplemente se
 * detiene ahí — sin error y sin efectos raros. */
const DETENER_LA_PAGINA = new Promise(() => {});

export async function mount(opts = {}) {
  vigilarSesion();
  vigilarErrores();
  const p = await profile();
  const area = opts.area || 'admin';

  if (opts.pub) { document.body.classList.add('cem-publico'); renderPublicHeader(p); return p; }

  if (!p) {
    location.href = base() + 'index.html?next=' + encodeURIComponent(rutaRelativaActual());
    return DETENER_LA_PAGINA;
  }
  if (!p.activo) {
    document.body.innerHTML = `<div class="auth-wrap"><div class="auth-card">
      <div class="brand-badge"><span class="material-symbols-outlined">no_accounts</span></div>
      <h1>Cuenta desactivada</h1>
      <p class="sub">Tu cuenta está desactivada. Escríbele al administrador para reactivarla.</p></div></div>`;
    return DETENER_LA_PAGINA;
  }
  if (opts.require && !opts.require.includes(p.rol)) {
    document.body.innerHTML = `<div class="auth-wrap"><div class="auth-card">
      <div class="brand-badge"><span class="material-symbols-outlined">lock</span></div>
      <h1>Sin acceso</h1><p class="sub">Como <b>${esc(etiqueta(p.rol))}</b> no puedes entrar a esta pantalla.
        ${esc(QUE_HACE_EL_ROL[p.rol] || '')}</p>
      <a class="btn block" href="${homeFor(p.rol)}">Ir a mi inicio</a></div></div>`;
    return DETENER_LA_PAGINA;
  }
  renderShell(p, area, opts.active);
  // Los «?» de ayuda y las cifras de dinero funcionan igual en todas las
  // pantallas: se conectan aquí y no hay que acordarse en cada una.
  subtituloDetrasDelSigno();
  fechasSinAmbiguedad();
  botonesConNombre();
  montarAyudas(document);
  tablasLegiblesEnElTelefono();
  buscadorDePantallaCompleta();
  esqueletosDeTabla();
  return p;
}

/* ============ un botón de icono también tiene que tener nombre (item 11) ============
   Un botón que sólo es un icono se lee «botón» y ya: ni un lector de pantalla
   ni nadie que no reconozca el dibujo sabe qué hace. Casi todos tienen `title`
   —que sirve para el ratón y no existe en el teléfono—, así que se copia a
   `aria-label` en vez de escribirlo dos veces en cada pantalla.

   Se hace también en cada repintado de tabla, porque las acciones de fila
   nacen y mueren con cada filtro. */
export function botonesConNombre(raiz = document) {
  $$('button, a.btn, .icon-btn', raiz).forEach((b) => {
    if (b.getAttribute('aria-label')) return;
    // Si tiene texto propio, ya tiene nombre.
    const texto = [...b.childNodes]
      .filter((n) => n.nodeType === 3 || !n.classList?.contains('material-symbols-outlined'))
      .map((n) => n.textContent).join('').trim();
    if (texto) return;
    const nombre = b.getAttribute('title') || b.dataset.ayuda;
    if (nombre) b.setAttribute('aria-label', nombre);
  });
}

/* ============ una fecha que no se pueda leer al revés (item 08) ============
   `<input type="date">` se pinta según el idioma del navegador, no según el de
   la página: en un equipo en inglés, el 1 de septiembre sale «09/01/2024» y se
   lee como el 9 de enero. En fechas de vencimiento y de cierre eso no es
   cosmético — es cobrar el mes que no era.

   No se puede obligar al navegador a cambiar de formato, así que se hace lo
   único que quita la duda del todo: debajo del campo se escribe la fecha con
   el mes en letras. Da igual cómo la pinte el widget; lo que se lee es
   «1 de septiembre de 2024».

   Va por delegación para que funcione también en los diálogos, que nacen
   después de que esta función haya corrido. */
const enLetras = (valor) => {
  if (!valor) return '';
  // El valor de un input date es siempre AAAA-MM-DD, independiente del idioma.
  const [a, m, d] = valor.split('-').map(Number);
  if (!a || !m || !d) return '';
  return new Date(a, m - 1, d).toLocaleDateString('es-ES',
    { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

function aclararFecha(input) {
  if (!input || input.type !== 'date') return;
  let eco = input.nextElementSibling;
  if (!eco || !eco.classList?.contains('fecha-clara')) {
    eco = document.createElement('small');
    eco.className = 'fecha-clara';
    input.insertAdjacentElement('afterend', eco);
  }
  eco.textContent = enLetras(input.value);
}

export function fechasSinAmbiguedad(raiz = document) {
  $$('input[type=date]', raiz).forEach(aclararFecha);
}

document.addEventListener('input', (ev) => {
  if (ev.target?.type === 'date') aclararFecha(ev.target);
});
document.addEventListener('change', (ev) => {
  if (ev.target?.type === 'date') aclararFecha(ev.target);
});

/* ============ el subtítulo de la pantalla, detrás del «?» (item 29) ============
   Cada pantalla abría con un párrafo de dos líneas —«Supervisa la actividad
   académica y administra la experiencia educativa de CEM»— que se lee una vez
   en la vida y luego empuja los datos medio metro hacia abajo. El texto sigue
   ahí para quien llega por primera vez, pero pulsando el «?» del título; lo
   que ocupa el sitio de arriba son las cifras.

   Se hace en un solo lugar porque el encabezado es el mismo en las 51
   pantallas: cambiar 51 archivos para esto habría sido pagar el impuesto dos
   veces. */
function subtituloDetrasDelSigno() {
  const cabeza = $('.page-head');
  const h1 = $('.page-head h1');
  const sub = cabeza && $('.page-head > div > p, .page-head > p');
  if (!h1 || !sub) return;
  // Un subtítulo con `id` no es un letrero fijo: la pantalla escribe dentro
  // —el curso elegido, cuántas entregas faltan— y quitarlo dejaba a la página
  // hablándole a un elemento que ya no existe. Ése se queda donde está.
  if (sub.id) return;
  const texto = sub.textContent.trim();
  if (!texto) return;
  // Hay pantallas que ya traen su propio «?» escrito en el título. Añadir otro
  // deja dos signos seguidos preguntando cosas parecidas: el subtítulo se
  // suma al que ya está y no se crea ninguno nuevo.
  const previo = h1.querySelector('.ayuda-btn');
  if (previo) {
    sub.remove();
    previo.dataset.ayuda = `${texto}\n\n${previo.dataset.ayuda || ''}`.trim();
    return;
  }
  sub.remove();
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ayuda-btn';
  b.dataset.ayuda = texto;
  b.setAttribute('aria-label', 'Para qué sirve esta pantalla');
  b.textContent = '?';
  h1.append(' ', b);
}

/* ============ el hueco de la tabla mientras llegan los datos (item 50) ============
   La tabla nacía vacía —encabezado y nada— y al llegar la consulta la página
   pegaba un salto de medio metro. En vez de escribir el esqueleto a mano en
   cada una de las treinta tablas, se rellena aquí cualquier `<tbody>` que aún
   esté vacío, con tantas columnas como tenga su encabezado. La primera línea
   que pinte la pantalla lo reemplaza.

   El temporizador es el seguro: si una consulta nunca vuelve, mejor una tabla
   vacía que un hueco latiendo para siempre. */
function esqueletosDeTabla() {
  const puestos = $$('table tbody').filter((tb) => tb.children.length === 0);
  puestos.forEach((tb) => {
    const cols = $$('thead th', tb.closest('table')).length;
    if (!cols) return;
    tb.innerHTML = filasEsqueleto(cols, 4);
  });
  if (!puestos.length) return;
  setTimeout(() => puestos.forEach((tb) => {
    if (tb.querySelector('.esqueleto-fila')) tb.innerHTML = '';
  }), 10000);
}

/* ============ que las tablas se lean en el teléfono (items 59 y 47) ============
   En un teléfono de 390 puntos, una tabla de diez columnas se ve «CURSO · TIPO
   · M…» y el resto se alcanza arrastrando. La regla de CSS que apila cada fila
   como tarjeta necesita saber de qué columna es cada celda, y eso está en el
   encabezado. En vez de escribir `data-col` a mano en las treinta tablas de la
   plataforma —donde siempre se olvida una y donde cada tabla que se repinta lo
   pierde—, se copia del `<thead>` cada vez que el cuerpo cambia.

   De paso hereda la alineación: si el encabezado es una columna de dinero
   (`th.num`), sus celdas también, así las cifras quedan a la derecha y con
   ancho fijo sin repetirlo fila por fila. */
function tablasLegiblesEnElTelefono(raiz = document) {
  $$('table', raiz).forEach((tabla) => {
    const marcar = (ths) => {
      const etiquetas = ths.map((th) => th.textContent.trim());
      const numericas = ths.map((th) => th.classList.contains('num'));
      $$('tbody tr', tabla).forEach((tr) => {
        // Las filas de «no hay nada» ocupan toda la tabla: no son datos.
        if (tr.querySelector('td[colspan]')) return;
        [...tr.children].forEach((td, i) => {
          if (etiquetas[i] && !td.dataset.col) td.dataset.col = etiquetas[i];
          if (numericas[i]) td.classList.add('num');
        });
      });
    };

    let obs = null;
    // Hay pantallas que pintan el encabezado con JavaScript y otras que lo
    // rehacen entero al cambiar de pestaña. Por eso no se decide nada al
    // montar —cuando la tabla suele estar vacía— sino en cada pasada: se
    // vuelven a leer los `th` y se mira si ya hay columnas suficientes.
    // Y como escribir en la tabla despierta al propio observador, se
    // desconecta mientras se la toca y se reconecta al terminar.
    const sellar = () => {
      obs?.disconnect();
      const ths = $$('thead th', tabla);
      // Una tabla de dos columnas ya se lee de frente; apilarla sólo estorba.
      if (ths.length >= 4) {
        tabla.classList.add('tarjetas');
        marcar(ths);
        monedaAlEncabezado(tabla, ths);
      }
      botonesConNombre(tabla);
      obs?.observe(tabla, { childList: true, subtree: true });
    };
    obs = new MutationObserver(sellar);
    sellar();
  });
}

/* ============ la moneda, una vez, en el encabezado (item 41) ============
   Una columna de treinta filas repetía «US$» treinta veces para decir algo que
   no cambia entre filas. Pero en esta plataforma sí puede cambiar —se cobra en
   dólares y en bolívares—, así que no se puede borrar a ciegas: se mira lo que
   hay pintado y sólo si TODAS las filas visibles traen la misma moneda se sube
   al encabezado y se quita de las celdas. En cuanto aparece una fila en otra
   moneda, cada cifra vuelve a llevar la suya. */
const CIFRA_CON_MONEDA = /^(-?[\d.,\s]+)\s+(\D{1,4})$/u;
function monedaAlEncabezado(tabla, ths) {
  ths.forEach((th, i) => {
    if (!th.classList.contains('num')) return;
    // La fila de totales va en el pie pero es la misma columna: si el
    // encabezado se lleva la moneda, ella también.
    const celdas = $$('tbody tr, tfoot tr', tabla)
      .filter((tr) => !tr.querySelector('td[colspan]') && !tr.classList.contains('esqueleto-fila'))
      .map((tr) => tr.children[i]).filter(Boolean);
    if (!celdas.length) return;

    const monedas = new Set();
    const partido = new Map();
    for (const td of celdas) {
      const t = td.textContent.trim();
      if (!t || t === '—') continue;               // vacío no vota
      const m = CIFRA_CON_MONEDA.exec(t);
      if (!m) { monedas.add(null); break; }        // no es una cifra con moneda
      monedas.add(m[2]); partido.set(td, m[1].trim());
    }

    const unica = monedas.size === 1 && !monedas.has(null) ? [...monedas][0] : null;
    const marca = $('.unidad', th);
    if (!unica) { marca?.remove(); delete th.dataset.unidad; return; }

    // El nombre de la columna sin la marca que le hayamos puesto antes.
    const copia = th.cloneNode(true);
    $$('.unidad', copia).forEach((u) => u.remove());
    const nombre = copia.textContent.trim();

    if (th.dataset.unidad !== unica) {
      marca?.remove();
      th.insertAdjacentHTML('beforeend', ` <span class="unidad">${esc(unica)}</span>`);
      th.dataset.unidad = unica;
    }
    // En el teléfono no hay encabezado: cada celda lleva el nombre de su
    // columna delante. Si la moneda se subió al encabezado, ahí también.
    celdas.forEach((td) => { td.dataset.col = `${nombre} ${unica}`; });
    // La celda puede traer envoltorio (<b>, un renglón de conversión debajo):
    // se reescribe sólo si lo único que tiene es la cifra.
    partido.forEach((cifra, td) => {
      if (td.children.length === 0) td.textContent = cifra;
      else if (td.children.length === 1 && td.firstElementChild.children.length === 0
               && td.textContent.trim() === td.firstElementChild.textContent.trim()) {
        td.firstElementChild.textContent = cifra;
      }
    });
  });
}

/* ============ un solo buscador por pantalla (item 27) ============
   Había dos cajas de búsqueda a la vez —la de la barra de arriba y la de cada
   tabla— con reglas distintas: una te mandaba a otra pantalla y la otra
   filtraba lo que estabas mirando. Ahora, cuando la pantalla tiene su propio
   buscador, la de arriba filtra ése y el de la tabla se retira; cuando no lo
   tiene, la de arriba sigue llevándote a buscar donde corresponda. */
function unSoloBuscador(area) {
  const global = $('#cemGlobalSearch');
  if (!global) return;

  // Sólo cuenta como «buscador de la pantalla» el de la franja de filtros.
  const local = $('#page .filters input#q');
  if (!local) {
    global.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && global.value.trim()) {
        const dest = area === 'admin' ? 'estudiantes.html' : 'catalogo.html';
        location.href = `${dest}?q=${encodeURIComponent(global.value.trim())}`;
      }
    });
    return;
  }

  // El de la tabla sabía mejor qué se puede buscar: ese texto sube arriba.
  if (local.placeholder) global.placeholder = local.placeholder;
  global.setAttribute('aria-label', 'Buscar en esta pantalla');
  /* Varias pantallas rellenan su buscador con el ?q= de la dirección dentro de
     su carga, que corre después de esto. Se lee la dirección aquí para que la
     caja que se ve arranque con lo mismo que está filtrando la tabla. */
  const desdeLaUrl = new URLSearchParams(location.search).get('q');
  global.value = local.value || desdeLaUrl || '';

  const campo = local.closest('.field') || local;
  campo.hidden = true;

  const propagar = () => {
    local.value = global.value;
    local.dispatchEvent(new Event('input', { bubbles: true }));
  };
  global.addEventListener('input', propagar);
  // Enter no debe recargar ni navegar: ya está filtrando mientras se escribe.
  global.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });

  // «Limpiar» borra el de la tabla; que borre también el que se ve.
  const limpiar = $('#page #btnClear');
  if (limpiar) limpiar.addEventListener('click', () => { global.value = ''; }, true);
}

/* ============ el buscador de arriba, entero (item 46) ============
   En el teléfono la barra superior repartía el ancho entre logo, buscador y
   campana, y el buscador se quedaba en «Busc». Al tocarlo ahora se abre sobre
   toda la pantalla; al salir, vuelve a su sitio. */
function buscadorDePantallaCompleta() {
  const caja = $('#cemGlobalSearch');
  if (!caja) return;
  const envoltura = caja.closest('.search') || caja.parentElement;
  const abrir = () => {
    if (!matchMedia('(max-width: 720px)').matches) return;
    document.body.classList.add('buscando');
    envoltura.classList.add('buscando');
    if (!$('#cemBuscarCerrar')) {
      const x = document.createElement('button');
      x.id = 'cemBuscarCerrar'; x.type = 'button'; x.className = 'gsearch-cerrar';
      x.setAttribute('aria-label', 'Cerrar la búsqueda');
      x.innerHTML = '<span class="material-symbols-outlined">close</span>';
      x.onclick = cerrar;
      envoltura.appendChild(x);
    }
  };
  const cerrar = () => {
    document.body.classList.remove('buscando');
    envoltura.classList.remove('buscando');
    caja.blur();
  };
  caja.addEventListener('focus', abrir);
  caja.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrar(); });
}

/**
 * El camino hasta donde estás: Estudiantes › Ana Rodríguez › Pagos.
 * Se llega a la misma ficha desde tres sitios y todas se veían igual, sin rastro
 * de por dónde entraste ni forma de volver que no fuera el botón del navegador.
 * @param {Array<[string,string]|string>} tramos  [texto, enlace] o sólo texto
 */
export function migas(tramos) {
  return `<nav class="migas" aria-label="Dónde estás">${tramos.map((t, i) => {
    const ultimo = i === tramos.length - 1;
    const [txt, href] = Array.isArray(t) ? t : [t, null];
    const sep = i ? '<span class="material-symbols-outlined sep">chevron_right</span>' : '';
    return sep + (href && !ultimo
      ? `<a href="${esc(href)}">${esc(txt)}</a>`
      : `<span${ultimo ? ' aria-current="page"' : ''}>${esc(txt)}</span>`);
  }).join('')}</nav>`;
}

export function homeFor(rol) {
  if (rol === 'estudiante') return '../estudiante/panel.html';
  if (rol === 'profesor') return '../docente/panel.html';
  if (rol === 'cobranza') return '../admin/pagos-verificar.html';
  if (rol === 'auditor') return '../admin/auditoria.html';
  return '../admin/index.html';
}
export function homeForRoot(rol) {
  if (rol === 'estudiante') return 'estudiante/panel.html';
  if (rol === 'profesor') return 'docente/panel.html';
  if (rol === 'cobranza') return 'admin/pagos-verificar.html';
  if (rol === 'auditor') return 'admin/auditoria.html';
  return 'admin/index.html';
}

function renderShell(p, area, active) {
  const nav = area === 'admin'
    ? (p.rol === 'cobranza' ? COBRANZA_NAV : p.rol === 'auditor' ? AUDITOR_NAV : ADMIN_NAV)
    : area === 'docente' ? [{ lbl: '', items: TEACHER_NAV }]
    : [{ lbl: '', items: STUDENT_NAV }];
  const flat = nav.flatMap(g => g.items);
  const areaLabel = area === 'admin'
    ? (p.rol === 'cobranza' ? 'Cobranza' : p.rol === 'auditor' ? 'Auditoría' : 'Portal institucional')
    : area === 'docente' ? 'Portal docente' : 'Portal del estudiante';

  /* El menú del administrador son 27 entradas en 7 grupos, y antes se veían los
     7 abiertos a la vez: había que recorrer la lista entera con la vista para
     encontrar cualquier cosa. Ahora sólo queda abierto el grupo de la pantalla
     en la que estás; los demás se abren al pulsarlos y se recuerda cuáles. */
  let abiertosGuardados = [];
  try { abiertosGuardados = JSON.parse(localStorage.getItem('cemNavAbiertos') || '[]'); } catch {}
  const conVariosGrupos = nav.filter(g => g.lbl).length > 1;

  const sideHtml = nav.map((g, gi) => {
    const tieneLaActiva = g.items.some(([href]) => href === active);
    const abierto = !conVariosGrupos || tieneLaActiva || abiertosGuardados.includes(g.lbl);
    return `
    <div class="nav-group${abierto ? ' abierto' : ''}" data-grupo="${esc(g.lbl || gi)}">
      ${g.lbl ? `<button type="button" class="lbl" aria-expanded="${abierto}">
        <span>${g.lbl}</span>
        <span class="material-symbols-outlined flecha">expand_more</span></button>` : ''}
      <div class="nav-items">
        ${g.items.map(([href, ic, txt]) => `
        <a class="nav-item ${active === href ? 'active' : ''}" href="${href}">
          <span class="material-symbols-outlined">${ic}</span><span>${txt}</span></a>`).join('')}
      </div>
    </div>`;
  }).join('');

  const shell = document.createElement('div');
  shell.className = 'shell';
  shell.innerHTML = `
    <aside class="sidebar" id="cemSidebar">
      <div class="brand">
        <div class="mark">C</div>
        <div><b>CEM</b><span>${areaLabel}</span></div>
      </div>
      ${sideHtml}
      <div class="foot">
        <button class="sidebar-plegar" id="cemPlegar" type="button"
                title="Ensanchar o estrechar el menú">
          <span class="material-symbols-outlined">chevron_left</span><span>Estrechar</span></button>
        <div class="who"><b>${esc(p.nombre)} ${esc(p.apellido || '')}</b>${esc(etiqueta(p.rol))}</div>
        <button class="btn outline sm block" id="cemLogout">
          <span class="material-symbols-outlined">logout</span> <span>Cerrar sesión</span></button>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="menu-btn icon-btn" id="cemMenu"><span class="material-symbols-outlined">menu</span></button>
        <div class="search"><span class="material-symbols-outlined">search</span>
          <input type="search" id="cemGlobalSearch" placeholder="Buscar estudiantes, cursos, cohortes…"></div>
        <div class="spacer"></div>
        <button class="icon-btn campana" id="cemCampana" title="Avisos">
          <span class="material-symbols-outlined">notifications</span>
          <i class="punto" id="cemCampanaPunto" hidden></i></button>
        <a class="avatar" href="${area === 'estudiante' ? 'perfil.html' : '#'}"
           title="${esc(p.email)}">${initials(p.nombre, p.apellido)}</a>
      </header>
      <main class="content" id="cemContent"></main>
    </div>
    <nav class="bottomnav">
      ${(area === 'admin' && !['cobranza','auditor'].includes(p.rol) ? ADMIN_MOBILE : flat).slice(0, 4).map(([href, ic, txt]) => `
        <a class="${active === href ? 'active' : ''}" href="${href}">
          <span class="material-symbols-outlined">${ic}</span>${txt}</a>`).join('')}
    </nav>`;

  const page = $('#page');
  document.body.insertBefore(shell, document.body.firstChild);
  if (page) { $('#cemContent', shell).appendChild(page); page.classList.remove('hidden'); }

  $('#cemLogout').onclick = logout;

  // Plegar y desplegar los grupos del menú, recordando cuáles quedaron abiertos.
  $$('.nav-group .lbl', shell).forEach((btn) => btn.addEventListener('click', () => {
    const grupo = btn.closest('.nav-group');
    const abierto = grupo.classList.toggle('abierto');
    btn.setAttribute('aria-expanded', String(abierto));
    const abiertos = $$('.nav-group.abierto', shell).map(g => g.dataset.grupo);
    try { localStorage.setItem('cemNavAbiertos', JSON.stringify(abiertos)); } catch {}
  }));

  const sidebar = $('#cemSidebar');
  $('#cemMenu').onclick = () => {
    sidebar.classList.add('open');
    const sc = document.createElement('div');
    sc.className = 'scrim';
    sc.onclick = () => { sidebar.classList.remove('open'); sc.remove(); };
    document.body.appendChild(sc);
  };
  unSoloBuscador(area);

  /* item 55 · 236 px fijos son el 16% de una pantalla dedicados a navegación.
     Quien ya se sabe el menú lo estrecha a iconos y recupera el sitio. */
  const plegar = $('#cemPlegar');
  if (plegar) {
    if (localStorage.getItem('cemMenuPlegado') === '1') shell.classList.add('plegado');
    plegar.onclick = () => {
      const ahora = shell.classList.toggle('plegado');
      localStorage.setItem('cemMenuPlegado', ahora ? '1' : '0');
      plegar.title = ahora ? 'Ensanchar el menú' : 'Estrechar el menú';
    };
    /* Plegado, la entrada sólo tiene su icono: el nombre pasa al tooltip. */
    $$('.sidebar a.nav-item', shell).forEach((a) => {
      if (!a.title) a.title = a.textContent.trim();
    });
  }

  montarCampana();
}

/* ============ campana de avisos ============
 * El botón de la barra superior era decorativo. Ahora trae los avisos de la
 * persona: pago aprobado o rechazado, cuota por vencer, certificado emitido,
 * respuesta de soporte, apelación resuelta, insignia ganada. */
async function montarCampana() {
  const btn = $('#cemCampana');
  const punto = $('#cemCampanaPunto');
  if (!btn) return;

  let avisos = [];
  async function refrescar() {
    const { data, error } = await sb.rpc('cem_mis_notificaciones', { p_limite: 20 });
    if (error) return;
    avisos = data || [];
    const sinLeer = Number(avisos[0]?.sin_leer || 0);
    punto.hidden = sinLeer === 0;
    btn.title = sinLeer ? `${sinLeer} aviso${sinLeer > 1 ? 's' : ''} sin leer` : 'Avisos';
  }

  btn.onclick = async () => {
    await refrescar();
    const dlg = modal({
      title: 'Avisos',
      body: avisos.length
        ? `<div class="avisos">${avisos.map(a => `
            <${a.url ? 'a' : 'div'} class="aviso ${a.leida_en ? '' : 'nuevo'}"
              ${a.url ? `href="${base()}${esc(a.url)}"` : ''}>
              <b>${esc(a.titulo)}</b>
              ${a.cuerpo ? `<span>${esc(a.cuerpo)}</span>` : ''}
              <em>${fdatetime(a.created_at)}</em>
            </${a.url ? 'a' : 'div'}>`).join('')}</div>`
        : '<div class="empty">No tienes avisos por ahora.</div>',
      footer: avisos.some(a => !a.leida_en)
        ? '<button class="btn outline" data-x>Cerrar</button><button class="btn" data-leidas>Marcar todo como leído</button>'
        : '<button class="btn outline block" data-x>Cerrar</button>',
    });
    const bl = $('[data-leidas]', dlg);
    if (bl) bl.onclick = async () => {
      await sb.rpc('cem_marcar_notificaciones_leidas');
      dlg.close();
      refrescar();
    };
  };

  refrescar();
  // Cada dos minutos alcanza: son avisos, no un chat.
  setInterval(refrescar, 120000);
}

function renderPublicHeader(p) {
  const h = document.createElement('header');
  h.className = 'pub-header';
  h.innerHTML = `<div class="pub-inner">
    <a class="pub-brand" href="catalogo.html">
      <span class="material-symbols-outlined">account_balance</span> CEM International</a>
    <nav>
      <a href="catalogo.html">Cursos</a>
      <a href="catalogo.html?tipo=programa">Programas</a>
      <a href="../verificar.html">Verificar certificado</a>
    </nav>
    <div class="pub-cta">
      ${p ? `<a class="btn outline sm" href="${homeFor(p.rol)}">Mi panel</a>
             <div class="avatar" title="${esc(p.email)}">${initials(p.nombre, p.apellido)}</div>`
          : `<a class="btn outline sm" href="../index.html">Iniciar sesión</a>
             <a class="btn sm" href="../index.html?registro=1">Registrarse</a>`}
    </div></div>`;
  document.body.insertBefore(h, document.body.firstChild);
  const page = $('#page');
  if (page) page.classList.remove('hidden');
}

/* ============ helpers de render ============ */
/**
 * Un indicador. El último parámetro, `explica`, es lo que de verdad cuenta esa
 * cifra: «cuántos estudiantes» no dice si son los de este mes, los que pagaron
 * o los que entraron alguna vez. Sale como un «?» al lado del título.
 */
export function kpi(label, value, icon, sub = '', cls = '', explica = '') {
  /* Un cero es la buena noticia: no lleva rojo ni verde. El color se guarda
     para lo que de verdad está pasando. */
  const cero = /^0([,.]0+)?\s|^0$|^0\s|^0[,.]00/.test(String(sub).trim());
  /* Y la cifra en sí: un «0» en negro grande pesa lo mismo que un 4.000, pero
     dice que no hay nada. Se escribe en gris, para que la vista pase de largo
     y se detenga en lo que sí tiene contenido. */
  const valorVacio = /^0([.,]0+)?(\s|$)/.test(String(value).replace(/<[^>]*>/g, '').trim());
  return `<div class="kpi"><div class="k-top"><span>${esc(label)}${explica ? ' ' + ayuda(explica) : ''}</span>
    <span class="material-symbols-outlined">${icon}</span></div>
    <div class="k-val${valorVacio ? ' vacio' : ''}">${value}</div>${sub ? `<div class="k-sub ${cls}${cero ? ' cero' : ''}">${esc(sub)}</div>` : ''}</div>`;
}

/**
 * Ocho indicadores en fila son ocho números que nadie mira. Deja a la vista los
 * que se consultan a diario dentro de `host`, y cuelga el resto detrás de un
 * desplegable justo debajo, recordando si quedó abierto.
 */
export function kpisConMas(host, principales, secundarios, clave = 'cemKpisMas') {
  const cont = typeof host === 'string' ? $(host) : host;
  if (!cont) return;
  cont.innerHTML = principales.join('');
  const previo = cont.parentNode.querySelector('.kpis-mas');
  if (previo) previo.remove();
  if (!secundarios.length) { montarAyudas(cont); return; }

  const d = document.createElement('details');
  d.className = 'kpis-mas';
  d.open = localStorage.getItem(clave) === '1';
  d.innerHTML = `<summary><span class="material-symbols-outlined">expand_more</span>
      <span>${secundarios.length} indicadores más</span></summary>
    <div class="kpis">${secundarios.join('')}</div>`;
  cont.insertAdjacentElement('afterend', d);
  d.addEventListener('toggle', () => localStorage.setItem(clave, d.open ? '1' : '0'));
  montarAyudas(cont); montarAyudas(d);
}
export function bar(p, gold = false) {
  return `<div class="bar ${gold ? 'gold' : ''}"><i style="width:${Math.min(100, Math.max(0, Number(p) || 0))}%"></i></div>`;
}
const CHIP_MAP = {
  publicado:'ok', activa:'ok', pagada:'ok', aprobado:'ok', calificada:'ok', resuelto:'ok', emitido:'ok', en_curso:'ok', aceptada:'ok', dictada:'ok',
  borrador:'neutral', planificada:'neutral', pendiente:'warn', parcial:'warn', en_revision:'warn', en_proceso:'warn', entregada:'warn',
  requiere_cambios:'warn', en_analisis:'warn', requiere_info:'warn', abierto:'info', programada:'info', inscripciones_abiertas:'info', recibida:'info',
  vencida:'err', cancelada:'err', rechazada:'err', suspendida:'err', anulada:'err', inactivo:'err', pausado:'warn', tarde:'err',
  finalizada:'teal', archivado:'neutral', congelada:'neutral', alta:'err', media:'warn', baja:'neutral', urgente:'err',
};
export function chip(txt, kind) {
  const k = kind || CHIP_MAP[String(txt).toLowerCase()] || 'neutral';
  return `<span class="chip ${k}">${esc(String(txt).replace(/_/g, ' '))}</span>`;
}

/* ============ un hueco que dice por dónde seguir (item 57) ============
   Al estudiante recién inscrito la plataforma le enseñaba cinco frases grises
   —«Aún no tienes certificados», «Aún no tienes cursos», «No tienes clases»—
   y ninguna decía qué hacer. Un hueco es el mejor sitio para poner la puerta:
   un dibujo tenue, una frase y el botón que lleva al primer paso.

   @param {{icono?:string, titulo:string, texto?:string,
            accion?:{texto:string, href:string}}} o */
export function vacio(o) {
  return `<div class="empty">
    <span class="material-symbols-outlined ico">${esc(o.icono || 'inbox')}</span>
    <b>${esc(o.titulo)}</b>
    ${o.texto ? `<span>${esc(o.texto)}</span>` : ''}
    ${o.accion ? `<a class="btn sm" href="${esc(o.accion.href)}">${esc(o.accion.texto)}</a>` : ''}
  </div>`;
}
/**
 * Fila de tabla vacía. Con `accion` ofrece por dónde empezar, en vez de dejar a
 * la persona en un callejón: eran 41 mensajes de «no hay nada» y sólo uno decía
 * qué hacer a continuación.
 * @param {{texto:string, id:string, icono?:string}} [accion]
 */
/* ============ mientras llegan los datos (item 50) ============
   Antes había una palabra en gris —«Cargando…»— y al llegar la tabla la
   pantalla saltaba entera. Un bloque del tamaño de lo que viene no salta:
   el ojo ya sabe dónde va a estar cada cosa. */

/** Filas fantasma con la forma de la tabla que va a venir. */
export function filasEsqueleto(columnas, filas = 5) {
  return Array.from({ length: filas }, () =>
    `<tr class="esqueleto-fila" aria-hidden="true">${
      Array.from({ length: columnas }, (_, i) =>
        `<td><span style="width:${[70, 90, 55, 80, 45][i % 5]}%"></span></td>`).join('')
    }</tr>`).join('');
}

/** El mismo truco para un bloque suelto: tres líneas de distinto largo. */
export function bloqueEsqueleto(lineas = 3) {
  const anchos = ['larga', 'media', 'corta'];
  return `<div aria-hidden="true">${
    Array.from({ length: lineas }, (_, i) =>
      `<div class="hueso linea ${anchos[i % 3]}"></div>`).join('')}</div>`;
}

/* ============ un botón que dice que está trabajando (item 52) ============
   Al guardar no cambiaba nada hasta que terminaba, así que se pulsaba dos
   veces y se guardaba dos veces. */

/**
 * Envuelve una acción: desactiva el botón, cambia su texto al verbo en
 * presente y lo devuelve a como estaba pase lo que pase.
 * @param {HTMLElement|string} boton
 * @param {string} mientras  «Guardando…», «Aprobando…»
 * @param {Function} hacer
 */
export async function ocupado(boton, mientras, hacer) {
  const b = typeof boton === 'string' ? $(boton) : boton;
  if (!b) return hacer();
  const antes = b.innerHTML;
  b.disabled = true;
  b.setAttribute('aria-busy', 'true');
  b.innerHTML = `<span class="material-symbols-outlined">hourglass_top</span> ${esc(mientras)}`;
  try { return await hacer(); }
  finally {
    b.disabled = false;
    b.removeAttribute('aria-busy');
    b.innerHTML = antes;
  }
}

export function emptyRow(cols, msg = 'Sin resultados.', accion = null) {
  const boton = accion ? `<button class="btn sm" id="${esc(accion.id)}" data-vacio="${esc(accion.id)}" style="margin-top:10px">
      <span class="material-symbols-outlined">${esc(accion.icono || 'add')}</span>
      ${esc(accion.texto)}</button>` : '';
  return `<tr><td colspan="${cols}"><div class="empty">${esc(msg)}${boton}</div></td></tr>`;
}

/* El botón del estado vacío nace y muere con cada repintado de la tabla, así
   que engancharlo una vez por su id no sirve: al filtrar y volver, el clic ya
   no hace nada. Se registra la acción por nombre y un único oyente del
   documento la reparte. */
const ACCIONES_VACIAS = new Map();
export function accionVacio(id, hacer) { ACCIONES_VACIAS.set(id, hacer); }
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-vacio]');
  if (!b) return;
  const hacer = ACCIONES_VACIAS.get(b.dataset.vacio);
  if (hacer) { ev.preventDefault(); hacer(); }
});

/* ============ elegir qué columnas se ven (item 24) ============
   Contabilidad quiere saldo y documento; coordinación quiere progreso y último
   acceso. Antes se veían las diez columnas siempre y cada quien leía de lado.
   Ahora cada persona apaga las que no usa y la elección se recuerda. */

/**
 * @param {string} tablaSel  selector de la <table> (debe tener id)
 * @param {string} hostSel   dónde poner el botón «Columnas»
 * @param {string} clave     clave de localStorage
 * @param {Array<{i:number, nombre:string, fija?:boolean}>} columnas
 *        `i` es la posición de la columna (1 = la primera). Las `fija` no se
 *        pueden apagar: sin ellas la fila no se identifica.
 */
export function selectorColumnas(tablaSel, hostSel, clave, columnas) {
  const tabla = $(tablaSel), host = $(hostSel);
  if (!tabla || !host) return;
  if (!tabla.id) tabla.id = 'tabla-' + Math.random().toString(36).slice(2, 8);

  let ocultas = new Set();
  try { ocultas = new Set(JSON.parse(localStorage.getItem(clave) || '[]')); } catch { /* preferencia ilegible: se ven todas */ }
  columnas.filter((c) => c.fija).forEach((c) => ocultas.delete(c.i));

  const hoja = document.createElement('style');
  document.head.appendChild(hoja);
  const aplicar = () => {
    hoja.textContent = [...ocultas]
      .map((i) => `#${tabla.id} tr > *:nth-child(${i}){display:none !important;}`).join('\n');
    localStorage.setItem(clave, JSON.stringify([...ocultas]));
    const n = ocultas.size;
    boton.innerHTML = `<span class="material-symbols-outlined">view_column</span> Columnas${n ? ` (${columnas.length - n} de ${columnas.length})` : ''}`;
  };

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn ghost sm';
  host.appendChild(boton);
  boton.onclick = () => {
    const m = modal({ title:'Qué columnas quieres ver', body:
      `<p class="tiny muted">Se guarda para la próxima vez que entres, sólo en este equipo.</p>` +
      columnas.map((c) => `<label class="check" style="display:flex;gap:9px;align-items:center;padding:5px 0">
          <input type="checkbox" data-col-tog="${c.i}" ${ocultas.has(c.i) ? '' : 'checked'} ${c.fija ? 'disabled' : ''}>
          <span>${esc(c.nombre)}${c.fija ? ' <span class="tiny muted">(siempre visible)</span>' : ''}</span>
        </label>`).join(''),
      footer:`<button class="btn outline" data-x>Cerrar</button>
              <button class="btn ghost" id="colTodas">Ver todas</button>` });
    $$('[data-col-tog]', m).forEach((c) => c.onchange = () => {
      const i = Number(c.dataset.colTog);
      if (c.checked) ocultas.delete(i); else ocultas.add(i);
      aplicar();
    });
    $('#colTodas', m).onclick = () => {
      ocultas.clear(); aplicar();
      $$('[data-col-tog]', m).forEach((c) => c.checked = true);
    };
  };
  aplicar();
}

/* ============ hacer lo mismo con varias filas a la vez (item 25) ============
   Aprobar veinte pagos era abrir veinte veces la misma ventana. Con esto se
   marcan las filas que hagan falta y la acción se aplica a todas. */

/**
 * Conecta las casillas de una tabla con una barra de acciones.
 * La tabla debe traer un `<th class="sel"><input type="checkbox" data-todas>`
 * y cada fila un `<td class="sel"><input type="checkbox" data-sel="ID">`.
 *
 * @param {string} tablaSel   selector de la <table>
 * @param {string} barraSel   selector del contenedor de la barra
 * @param {Array<{texto:string, icono?:string, clase?:string, hacer:Function}>} acciones
 *        `hacer` recibe el array de ids marcados.
 * @returns {{marcados:Function, limpiar:Function}}
 */
export function seleccionMultiple(tablaSel, barraSel, acciones) {
  const tabla = $(tablaSel), barra = $(barraSel);
  if (!tabla || !barra) return { marcados: () => [], limpiar() {} };

  const casillas = () => $$('[data-sel]', tabla);
  const marcados = () => casillas().filter((c) => c.checked).map((c) => c.dataset.sel);

  function pintar() {
    const n = marcados().length;
    barra.hidden = n === 0;
    if (!n) return;
    barra.innerHTML = `<span class="cuenta">${n} ${n === 1 ? 'seleccionada' : 'seleccionadas'}</span>` +
      acciones.map((a, i) => `<button type="button" class="btn sm ${esc(a.clase || 'outline')}" data-acc="${i}">
        ${a.icono ? `<span class="material-symbols-outlined">${esc(a.icono)}</span>` : ''}${esc(a.texto)}</button>`).join('') +
      `<button type="button" class="btn ghost sm" data-quitar>Quitar la selección</button>`;
    $$('[data-acc]', barra).forEach((b) => b.onclick = async () => {
      const ids = marcados();
      if (!ids.length) return;
      try { await acciones[Number(b.dataset.acc)].hacer(ids); }
      catch (e) { fail(mensajeError(e, 'No se pudo aplicar a todas.')); }
    });
    $('[data-quitar]', barra).onclick = () => limpiar();
  }

  function limpiar() {
    casillas().forEach((c) => { c.checked = false; c.closest('tr')?.classList.remove('marcada'); });
    const todas = $('[data-todas]', tabla); if (todas) { todas.checked = false; todas.indeterminate = false; }
    pintar();
  }

  tabla.addEventListener('change', (ev) => {
    const t = ev.target;
    if (t.matches('[data-todas]')) {
      casillas().forEach((c) => { c.checked = t.checked; c.closest('tr')?.classList.toggle('marcada', t.checked); });
    } else if (t.matches('[data-sel]')) {
      t.closest('tr')?.classList.toggle('marcada', t.checked);
      const todas = $('[data-todas]', tabla);
      if (todas) {
        const n = marcados().length, total = casillas().length;
        todas.checked = n === total && total > 0;
        todas.indeterminate = n > 0 && n < total;
      }
    } else return;
    pintar();
  });
  /* Marcar una casilla no debe abrir la ficha de la fila. */
  tabla.addEventListener('click', (ev) => { if (ev.target.closest('td.sel, th.sel')) ev.stopPropagation(); }, true);

  pintar();
  return { marcados, limpiar };
}

/* ============ ordenar una tabla pulsando su encabezado ============
   Ninguna tabla se podía ordenar: para saber quién debía más había que
   exportar a Excel y ordenar allí. */

/**
 * Hace ordenable una tabla ya dibujada.
 * @param {string} sel        selector de la <table>
 * @param {Function} redibujar  se llama con ({campo, asc}) para repintar
 * @param {{campo:string, asc:boolean}} estado  el orden actual
 *
 * Los `<th>` participan si traen `data-ord="campo"`.
 */
export function ordenable(sel, estado, redibujar) {
  const tabla = $(sel);
  if (!tabla) return;
  $$('th[data-ord]', tabla).forEach((th) => {
    const campo = th.dataset.ord;
    th.classList.add('ordenable');
    if (estado.campo === campo) th.classList.add(estado.asc ? 'asc' : 'desc');
    th.setAttribute('role', 'button');
    th.setAttribute('tabindex', '0');
    th.title = `Ordenar por ${th.textContent.trim().toLowerCase()}`;
    const pulsar = () => {
      if (estado.campo === campo) estado.asc = !estado.asc;
      else { estado.campo = campo; estado.asc = true; }
      redibujar(estado);
    };
    th.addEventListener('click', pulsar);
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pulsar(); }
    });
  });
}

/** Ordena una lista por el campo indicado, con números y fechas bien tratados. */
export function ordenarPor(lista, { campo, asc }) {
  if (!campo) return lista;
  const valor = (o) => campo.split('.').reduce((x, k) => x?.[k], o);
  return [...lista].sort((a, b) => {
    const x = valor(a), y = valor(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;          // lo vacío siempre al final
    if (y == null) return -1;
    const nx = Number(x), ny = Number(y);
    const cmp = (!Number.isNaN(nx) && !Number.isNaN(ny) && x !== '' && y !== '')
      ? nx - ny
      : String(x).localeCompare(String(y), 'es', { numeric: true, sensitivity: 'base' });
    return asc ? cmp : -cmp;
  });
}

/** Fila de totales al pie de una tabla de dinero, que responde al filtro puesto. */
export function filaTotales(celdas) {
  return `<tfoot><tr class="totales">${celdas.map((c) =>
    `<td${c && c.num ? ' class="num"' : ''}>${c ? (c.html ?? esc(c.texto ?? c)) : ''}</td>`).join('')}</tr></tfoot>`;
}
/** Descarga contenido como archivo (CSV/JSON). */
export function download(filename, content, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function toCSV(rows) {
  if (!rows?.length) return '';
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const cell = (v) => v == null ? '' : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  return [cols.join(','), ...rows.map(r => cols.map(c => `"${cell(r[c]).replace(/"/g, '""')}"`).join(','))].join('\n');
}
/** Filtro de texto simple sobre varias propiedades. */
export function match(obj, q, keys) {
  if (!q) return true;
  const s = q.toLowerCase();
  return keys.some(k => String(k.split('.').reduce((o, kk) => o?.[kk], obj) ?? '').toLowerCase().includes(s));
}

/* ============ select mejorado (siempre abre hacia abajo) ============
 * Los <select> nativos a veces se abren hacia arriba (el navegador decide
 * la dirección según el espacio disponible) tapando el propio campo. Este
 * envoltorio deja el <select> real intacto (mismo id, mismo .value, mismos
 * listeners de "change") pero lo oculta y dibuja un botón + panel propio,
 * posicionado con JS en document.body para que siempre caiga debajo del
 * campo y nunca se recorte por el overflow de un contenedor o modal. */
export function mejorarSelect(select){
  if (!select || select.dataset.mejorado) return;
  select.dataset.mejorado = '1';

  const wrap = document.createElement('div');
  wrap.className = 'sel-mejorado';
  select.parentNode.insertBefore(wrap, select);
  wrap.appendChild(select);

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'sel-trigger';
  trigger.innerHTML = '<span data-txt></span><span class="material-symbols-outlined">expand_more</span>';
  wrap.appendChild(trigger);

  const panel = document.createElement('div');
  panel.className = 'sel-panel';
  document.body.appendChild(panel);

  const actualizarTrigger = () => {
    const opt = select.options[select.selectedIndex];
    trigger.querySelector('[data-txt]').textContent = opt ? opt.textContent : '';
  };
  const posicionar = () => {
    const r = trigger.getBoundingClientRect();
    panel.style.left = r.left + 'px';
    panel.style.top = (r.bottom + 4) + 'px';
    panel.style.width = r.width + 'px';
    panel.style.maxHeight = Math.max(140, window.innerHeight - r.bottom - 12) + 'px';
  };
  const cerrar = () => { panel.classList.remove('abierto'); document.removeEventListener('mousedown', fueraClick); };
  const fueraClick = (e) => { if (!panel.contains(e.target) && e.target !== trigger && !trigger.contains(e.target)) cerrar(); };
  const renderPanel = () => {
    panel.innerHTML = [...select.options].map((o, i) =>
      `<div class="sel-op ${i === select.selectedIndex ? 'on' : ''}" data-i="${i}">${esc(o.textContent)}</div>`).join('');
    panel.querySelectorAll('[data-i]').forEach(el => el.onclick = () => {
      select.selectedIndex = Number(el.dataset.i);
      select.dispatchEvent(new Event('change', { bubbles: true }));
      actualizarTrigger(); cerrar();
    });
  };
  trigger.onclick = () => {
    if (panel.classList.contains('abierto')) { cerrar(); return; }
    renderPanel(); posicionar(); panel.classList.add('abierto');
    document.addEventListener('mousedown', fueraClick);
  };
  window.addEventListener('scroll', () => panel.classList.contains('abierto') && posicionar(), true);
  window.addEventListener('resize', () => panel.classList.contains('abierto') && posicionar());
  // si algo externo repuebla las <option> o cambia el valor por código, refleja el texto
  new MutationObserver(actualizarTrigger).observe(select, { childList: true, subtree: true, attributes: true });
  select.addEventListener('change', actualizarTrigger);
  actualizarTrigger();
}
/** Aplica mejorarSelect() a todos los <select> dentro de un contenedor. */
export function mejorarSelects(root = document){
  $$('select', root).forEach(mejorarSelect);
}

/* ============ elegir un archivo, no pegar una dirección ============
   Casi todas las pantallas pedían una dirección web para la portada de un
   curso, el material de una lección o el comprobante de un pago. Quien está
   trabajando tiene el archivo delante, no una dirección: subirlo tiene que ser
   lo normal y pegar el enlace, la excepción. */

/** Lo que se acepta en cada sitio, para poder avisarlo ANTES de subir. */
export const TIPOS_ARCHIVO = {
  imagen:      { accept: 'image/png,image/jpeg,image/webp', ayuda: 'JPG, PNG o WEBP', maxMB: 8 },
  comprobante: { accept: 'image/png,image/jpeg,image/webp,application/pdf',
                 ayuda: 'Foto o PDF del comprobante', maxMB: 10 },
  documento:   { accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*',
                 ayuda: 'PDF, Word, Excel, PowerPoint o imagen', maxMB: 50 },
  video:       { accept: 'video/*', ayuda: 'MP4, MOV o WEBM', maxMB: 500 },
};

/**
 * Encoge una foto antes de subirla.
 * Una foto de teléfono son entre tres y ocho megas y se muestra a 300 píxeles:
 * subirla entera es tiempo de espera y de descarga que no le sirve a nadie.
 * Si el archivo no es una imagen, o ya es pequeño, se devuelve tal cual.
 */
export async function encogerImagen(file, ladoMax = 1600, calidad = 0.85) {
  if (!/^image\/(jpe?g|png|webp)$/i.test(file.type || '')) return file;
  if (file.size < 300 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, ladoMax / Math.max(bitmap.width, bitmap.height));
    if (escala >= 1 && file.size < 1024 * 1024) return file;
    const lienzo = document.createElement('canvas');
    lienzo.width = Math.round(bitmap.width * escala);
    lienzo.height = Math.round(bitmap.height * escala);
    lienzo.getContext('2d').drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
    const blob = await new Promise((r) => lienzo.toBlob(r, 'image/jpeg', calidad));
    if (!blob || blob.size >= file.size) return file;   // si no mejora, se deja el original
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch { return file; }
}

/**
 * Zona para elegir o soltar un archivo, con miniatura, avance y el enlace como
 * alternativa plegada. Devuelve `{ valor(), fijar(url), elemento }`.
 *
 * @param {object} o
 * @param {string} o.id          prefijo para los identificadores internos
 * @param {string} o.tipo        una clave de TIPOS_ARCHIVO
 * @param {string} o.valor       la dirección que ya tuviera guardada
 * @param {Function} o.subir     recibe el File y devuelve la dirección
 * @param {string} o.etiquetaSubir  texto del botón
 * @param {boolean} o.permitirEnlace  si se ofrece pegar una dirección
 */
export function campoArchivo({ id, tipo = 'imagen', valor = '', subir,
                               etiquetaSubir = 'Elegir archivo', permitirEnlace = true }) {
  const cfg = TIPOS_ARCHIVO[tipo] || TIPOS_ARCHIVO.imagen;
  const esImagen = tipo === 'imagen' || tipo === 'comprobante';
  let actual = valor || '';

  const html = `
    <div class="subida" id="${id}Zona" tabindex="0" role="button"
         aria-label="${esc(etiquetaSubir)}">
      <div class="subida-vacia" ${actual ? 'hidden' : ''}>
        <span class="material-symbols-outlined">cloud_upload</span>
        <div><b>${esc(etiquetaSubir)}</b> o suéltalo aquí</div>
        <div class="tiny muted">${esc(cfg.ayuda)}, hasta ${cfg.maxMB} MB</div>
      </div>
      <div class="subida-hecha" ${actual ? '' : 'hidden'}>
        ${esImagen ? `<img id="${id}Mini" alt="" ${actual ? `src="${esc(actual)}"` : ''}>` : ''}
        <div class="grow">
          <div class="t" id="${id}Nombre">Archivo cargado</div>
          <div class="tiny muted" id="${id}Detalle"></div>
        </div>
        <button type="button" class="btn ghost sm" id="${id}Quitar"
                title="Quitar el archivo">
          <span class="material-symbols-outlined">close</span></button>
      </div>
      <progress id="${id}Avance" max="100" hidden></progress>
      <input type="file" id="${id}File" accept="${esc(cfg.accept)}" hidden>
    </div>
    ${permitirEnlace ? `
    <details class="subida-enlace">
      <summary class="tiny">o pega una dirección, si ya está publicado en otro sitio</summary>
      <input id="${id}Url" placeholder="https://…" value="${esc(actual)}">
    </details>` : ''}`;

  /** Se llama después de insertar el html en el documento. */
  function conectar(raiz = document) {
    const zona = raiz.querySelector('#' + id + 'Zona');
    if (!zona) return api;
    const input = raiz.querySelector('#' + id + 'File');
    const url = raiz.querySelector('#' + id + 'Url');
    const avance = raiz.querySelector('#' + id + 'Avance');
    const vacia = zona.querySelector('.subida-vacia');
    const hecha = zona.querySelector('.subida-hecha');
    const mini = raiz.querySelector('#' + id + 'Mini');
    const nombre = raiz.querySelector('#' + id + 'Nombre');
    const detalle = raiz.querySelector('#' + id + 'Detalle');

    const pintar = (u, texto, sub) => {
      actual = u || '';
      vacia.hidden = !!actual;
      hecha.hidden = !actual;
      if (mini && actual) mini.src = actual;
      if (nombre) nombre.textContent = texto || 'Archivo cargado';
      if (detalle) detalle.textContent = sub || '';
      if (url) url.value = actual;
    };
    if (actual) pintar(actual, 'Archivo cargado');

    async function tomar(file) {
      if (!file) return;
      const max = cfg.maxMB * 1024 * 1024;
      const listo = await encogerImagen(file);
      if (listo.size > max) {
        fail(`«${file.name}» pesa ${(file.size / 1048576).toFixed(1)} MB y el máximo son ${cfg.maxMB} MB.`);
        return;
      }
      // Miniatura al instante, antes de que termine la subida: así se ve qué se
      // eligió sin tener que guardar y recargar para comprobarlo.
      if (mini) { pintar(URL.createObjectURL(listo), listo.name, 'subiendo…'); }
      else pintar('pendiente', listo.name, 'subiendo…');
      avance.hidden = false; avance.removeAttribute('value');
      zona.classList.add('subiendo');
      try {
        const dir = await subir(listo);
        pintar(dir, listo.name, `${(listo.size / 1048576).toFixed(1)} MB`);
        ok('Archivo subido');
      } catch (e) {
        pintar('', '', '');
        fail(mensajeError(e, 'No se pudo subir el archivo.'));
      } finally {
        avance.hidden = true;
        zona.classList.remove('subiendo');
      }
    }

    zona.addEventListener('click', (e) => {
      if (e.target.closest('#' + id + 'Quitar')) return;
      input.click();
    });
    zona.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    input.addEventListener('change', () => tomar(input.files[0]));

    // Soltar el archivo encima: es el gesto que la gente ya intenta.
    zona.addEventListener('dragover', (e) => { e.preventDefault(); zona.classList.add('encima'); });
    zona.addEventListener('dragleave', () => zona.classList.remove('encima'));
    zona.addEventListener('drop', (e) => {
      e.preventDefault(); zona.classList.remove('encima');
      tomar(e.dataTransfer.files && e.dataTransfer.files[0]);
    });

    const quitar = raiz.querySelector('#' + id + 'Quitar');
    if (quitar) quitar.addEventListener('click', (e) => { e.stopPropagation(); pintar('', '', ''); });
    if (url) url.addEventListener('change', () => pintar(url.value.trim(), 'Enlace pegado'));

    api.fijar = (u) => pintar(u, 'Archivo cargado');
    return api;
  }

  const api = { html, conectar, valor: () => actual, fijar: () => {} };
  return api;
}

/* ============ imagen de portada (Supabase Storage, gratis y de sobra para fotos) ============ */
export async function subirImagenCurso(file, carpeta = 'cursos'){
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const ruta = `${carpeta}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from('cem-assets').upload(ruta, file, { contentType: file.type || 'image/*' });
  if (error) throw new Error(error.message || 'No se pudo subir la imagen.');
  const { data } = sb.storage.from('cem-assets').getPublicUrl(ruta);
  return data.publicUrl;
}

/* ============ documentos adjuntos de una lección (mismo bucket, sin límite práctico) ============ */
export async function subirDocumentoLeccion(file){
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const ruta = `materiales/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from('cem-assets').upload(ruta, file, { contentType: file.type || 'application/octet-stream' });
  if (error) throw new Error(error.message || 'No se pudo subir el documento.');
  const { data } = sb.storage.from('cem-assets').getPublicUrl(ruta);
  const tipo = /pdf/.test(file.type) ? 'pdf' : /sheet|excel|csv/.test(file.type) ? 'excel'
    : /image\//.test(file.type) ? 'imagen' : /video\//.test(file.type) ? 'video' : 'enlace';
  return { url: data.publicUrl, tamanoBytes: file.size, tipo, nombre: file.name };
}

/* ============ comprobantes de pago ============
   A diferencia del material de los cursos, un comprobante de pago es un dato
   financiero de una persona concreta: vive en un bucket privado. Por eso se
   guarda la RUTA del archivo (no una URL pública) y para verlo se pide una
   URL firmada que caduca. La carpeta tiene que llamarse igual que el uid de
   quien sube: es lo que exige la política del bucket. */
export async function subirComprobante(file){
  const { data: { user } } = await sb.auth.getUser();
  if(!user) throw new Error('Tu sesión expiró. Vuelve a entrar para subir el comprobante.');
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const ruta = `${user.id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from('cem-comprobantes')
    .upload(ruta, file, { contentType: file.type || 'application/octet-stream' });
  if (error) throw new Error(error.message || 'No se pudo subir el comprobante.');
  return ruta;
}

/** URL temporal para ver un comprobante guardado (una hora de vigencia). */
export async function urlComprobante(ruta){
  if(!ruta) return null;
  const { data, error } = await sb.storage.from('cem-comprobantes').createSignedUrl(ruta, 3600);
  return error ? null : data.signedUrl;
}

/* ============ tasa del día ============
   Cambia una vez al día pero cada pantalla la volvía a pedir. Se guarda en la
   pestaña con vencimiento corto: dentro de la misma sesión de trabajo se
   consulta una sola vez, y el panel que la modifica llama a olvidarTasa(). */
const CLAVE_TASA = 'cem:tasa';
const VIDA_TASA_MS = 10 * 60 * 1000;

/** Tasa del día vigente (la del BCV si el banco respondió, o la cargada a mano). */
export async function tasaVigente({ forzar = false } = {}){
  if (!forzar) {
    try {
      const c = JSON.parse(sessionStorage.getItem(CLAVE_TASA) || 'null');
      if (c && Date.now() - c.en < VIDA_TASA_MS) return c.tasa;
    } catch { /* si el guardado está corrupto, se pide de nuevo */ }
  }
  const { data, error } = await sb.rpc('cem_tasa_vigente');
  if (error) return null;
  const t = Array.isArray(data) ? data[0] : data;
  const tasa = t && t.valor ? t : null;
  try { sessionStorage.setItem(CLAVE_TASA, JSON.stringify({ en: Date.now(), tasa })); } catch {}
  return tasa;
}

/** Borra la tasa guardada. Llamar después de cargar una tasa nueva a mano. */
export function olvidarTasa(){ try { sessionStorage.removeItem(CLAVE_TASA); } catch {} }

/* ============ listas largas ============
   Ninguna pantalla paginaba: traían la tabla entera y la dibujaban completa.
   Este ayudante encapsula el rango de PostgREST y el conteo exacto, para que
   una lista se pida de a tramos con el mismo par de líneas en todas partes. */
export const TAM_PAGINA = 50;

/**
 * Aplica paginación a una consulta ya armada.
 * @example const { filas, total, hayMas } = await paginar(
 *   sb.from('cem_profiles').select('id,nombre', { count: 'exact' }), pagina);
 */
export async function paginar(consulta, pagina = 0, tam = TAM_PAGINA){
  const desde = pagina * tam;
  const { data, error, count } = await consulta.range(desde, desde + tam - 1);
  if (error) {
    if (esErrorDeSesion(error)) sesionVencida();
    throw error;
  }
  const filas = data || [];
  return { filas, total: count ?? null, hayMas: count == null ? filas.length === tam : desde + filas.length < count };
}

/** Barra de "mostrando X de Y" + botón de cargar más. */
export function controlesPaginacion({ mostrando, total, hayMas, id = 'cemMas' }){
  if (!hayMas && (total == null || mostrando >= total)) {
    return total != null && total > 0 ? `<div class="tiny muted center" style="padding:10px">${num(total)} en total</div>` : '';
  }
  return `<div class="center" style="padding:12px">
    <div class="tiny muted" style="margin-bottom:6px">Mostrando ${num(mostrando)}${total != null ? ' de ' + num(total) : ''}</div>
    <button class="btn outline sm" id="${id}">Cargar más</button></div>`;
}

/* ============ documentos imprimibles ============
   Estado de cuenta y recibo se piden en la ventanilla y en el banco: hay que
   poder darlos en papel o en PDF. En vez de generar un PDF con una librería
   pesada, se abre una ventana con el documento maquetado y se manda a
   imprimir — el propio navegador ofrece "Guardar como PDF" y el resultado se
   ve igual en cualquier equipo. */
export function imprimirDocumento(titulo, cuerpoHtml){
  const w = window.open('', '_blank', 'width=820,height=900');
  if (!w) { fail('El navegador bloqueó la ventana. Permite las ventanas emergentes de este sitio.'); return; }
  w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
    <title>${esc(titulo)}</title>
    <style>
      *{box-sizing:border-box} body{margin:0;padding:34px 30px;background:#fff;color:#22201C;
        font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55}
      .doc{max-width:720px;margin:0 auto}
      .cab{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;
        border-bottom:2px solid #C9A227;padding-bottom:14px;margin-bottom:20px}
      .marca{font-weight:700;letter-spacing:.06em;color:#8A6D1F;font-size:13px}
      h1{font-size:19px;margin:6px 0 0}
      .meta{text-align:right;font-size:12px;color:#7A756B;line-height:1.6}
      h2{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#7A756B;
        margin:22px 0 8px;font-weight:600}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;
        color:#7A756B;border-bottom:1px solid #E6E1D6;padding:6px 8px}
      td{padding:7px 8px;border-bottom:1px solid #F1EEE6}
      td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
      .tot{display:flex;justify-content:space-between;padding:7px 8px}
      .tot.fuerte{border-top:2px solid #22201C;font-weight:700;font-size:15px;margin-top:4px}
      .pie{margin-top:30px;padding-top:12px;border-top:1px solid #E6E1D6;
        font-size:11px;color:#7A756B;line-height:1.6}
      .sello{display:inline-block;padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600}
      .sello.ok{background:#E7F3EC;color:#1E5A4C} .sello.pend{background:#FDF3E0;color:#7A6215}
      @media print{body{padding:0} .noimp{display:none}}
    </style></head><body><div class="doc">${cuerpoHtml}</div>
    <script>window.onload=()=>{setTimeout(()=>window.print(),350)}<\/script>
    </body></html>`);
  w.document.close();
}

/* ============ picker de días de la semana + horario (cohortes) ============ */
export const DIAS_SEMANA = [
  { v: 'lun', l: 'Lun' }, { v: 'mar', l: 'Mar' }, { v: 'mie', l: 'Mié' }, { v: 'jue', l: 'Jue' },
  { v: 'vie', l: 'Vie' }, { v: 'sab', l: 'Sáb' }, { v: 'dom', l: 'Dom' },
];
/** Texto legible a partir de {dias, horaInicio, horaFin}, p. ej. "Lun, Mié 18:30–20:30". */
export function horarioResumen({ dias, horaInicio, horaFin } = {}){
  if (!dias?.length) return '';
  const etiquetas = dias.map(d => DIAS_SEMANA.find(x => x.v === d)?.l || d);
  const rango = (horaInicio && horaFin) ? ` ${horaInicio.slice(0, 5)}–${horaFin.slice(0, 5)}` : '';
  return etiquetas.join(', ') + rango;
}
/**
 * Monta en `container` un selector de días (chips) + hora inicio/fin que se
 * despliega al hacer clic, en vez de un campo de texto libre. onChange(valor)
 * se llama con {dias, horaInicio, horaFin} en cada cambio.
 */
export function montarHorarioPicker(container, valorInicial, onChange){
  let valor = { dias: valorInicial?.dias || [], horaInicio: valorInicial?.horaInicio || '', horaFin: valorInicial?.horaFin || '' };
  let abierto = false;
  function render(){
    container.innerHTML = `
      <button type="button" class="sel-trigger" id="hpTrigger">
        <span>${esc(horarioResumen(valor) || 'Elegir días y horario…')}</span>
        <span class="material-symbols-outlined">${abierto ? 'expand_less' : 'expand_more'}</span></button>
      ${abierto ? `<div class="horario-panel">
        <div class="row" style="gap:6px;flex-wrap:wrap;margin-bottom:10px">
          ${DIAS_SEMANA.map(d => `<span class="dia-chip ${valor.dias.includes(d.v) ? 'on' : ''}" data-dia="${d.v}">${d.l}</span>`).join('')}
        </div>
        <div class="row" style="gap:8px">
          <div class="field" style="flex:1;margin-bottom:0"><label>Hora inicio</label><input type="time" id="hpIni" value="${esc(valor.horaInicio)}"></div>
          <div class="field" style="flex:1;margin-bottom:0"><label>Hora fin</label><input type="time" id="hpFin" value="${esc(valor.horaFin)}"></div>
        </div></div>` : ''}`;
    $('#hpTrigger', container).onclick = () => { abierto = !abierto; render(); };
    $$('[data-dia]', container).forEach(el => el.onclick = () => {
      const d = el.dataset.dia;
      valor = { ...valor, dias: valor.dias.includes(d) ? valor.dias.filter(x => x !== d) : [...valor.dias, d] };
      onChange(valor); render();
    });
    const ini = $('#hpIni', container), fin = $('#hpFin', container);
    if (ini) ini.onchange = () => { valor = { ...valor, horaInicio: ini.value }; onChange(valor); };
    if (fin) fin.onchange = () => { valor = { ...valor, horaFin: fin.value }; onChange(valor); };
  }
  render();
  return { get: () => valor };
}
