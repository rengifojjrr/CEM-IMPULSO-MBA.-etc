// CEM · Runtime compartido por todas las páginas de la plataforma.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

/* La apariencia elegida se aplica al importar este módulo, que es lo primero
   que corre en cualquier pantalla y ocurre antes de que `mount()` destape
   `#page`. Se reexporta para que Configuración pueda ofrecerla. */
export { PALETAS, PALETA_POR_DEFECTO, ESTILOS, ESTILO_POR_DEFECTO,
         FORMAS, FORMA_POR_DEFECTO, DENSIDADES, DENSIDAD_POR_DEFECTO,
         aplicarApariencia, aparienciaDeFabrica,
         paletaActual, temaActual, estiloActual, formaActual, densidadActual,
         vidrioActual } from './temas.js?v=2026-08-21-25';

export const SUPABASE_URL = 'https://vajbsfgojtunamhrzrpf.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_Xljd7Ep1GxBXSPp5F4A1hg_Qg-iESzl';
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ============ utilidades ============ */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
/* La moneda de la casa. El CEM pone precio en euros a tasa BCV; el dólar y el
   bolívar son formas de pagar, no formas de cobrar. Está aquí y no repetido en
   cincuenta pantallas para que cambiarlo sea cambiar una línea. */
export const MONEDA_BASE = 'EUR';
export const money = (n, cur = MONEDA_BASE) => (n == null ? '—' :
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
export const celdaMoney = (n, cur = MONEDA_BASE) =>
  `<td class="num">${n == null ? '—' : esc(money(n, cur))}</td>`;

/** Un saldo: cuando no se debe nada lo dice con palabras, que es lo que importa. */
/* item 31 · en la misma columna convivían «2160,00 US$» alineado a la derecha
   y un chip «Al día» centrado, así que la columna dejaba de leerse en
   vertical, que es lo único que una columna sabe hacer. Ahora las dos formas
   ocupan el mismo sitio: cifra o guion, ambos a la derecha. */
export const saldo = (n, cur = MONEDA_BASE) =>
  (Number(n) || 0) <= 0
    ? '<span class="muted" title="Sin nada pendiente">—</span>'
    : esc(money(n, cur));

/**
 * Cuánto salda un pago, en la moneda de la casa, sea cual sea la moneda en que
 * se hizo.
 *
 * Un pago guarda `monto` en la moneda en que llegó y `monto_base` ya convertido
 * a euros. Sumar `monto` a secas cuenta 4.575 bolívares como 4.575 euros: la
 * cifra de ingresos salía disparada y no cuadraba con nada.
 *
 * La conversión la hace el servidor al reportar el pago y se guarda con la tasa
 * de ESE día. Aquí no se recalcula nunca: un pago de hace un mes no vale hoy lo
 * que valía entonces, y volver a dividir por la tasa de hoy sería reescribir la
 * historia.
 */
export const enBase = (pago) => {
  if (!pago) return 0;
  if (pago.monto_base != null) return Number(pago.monto_base) || 0;
  const m = Number(pago.monto) || 0;
  if (!pago.moneda || pago.moneda === MONEDA_BASE) return m;
  const t = Number(pago.tasa) || 0;
  return t > 0 ? m / t : 0;   // sin tasa no se puede convertir: no se inventa
};
/** Nombre anterior, cuando la casa cobraba en dólares. */
export const enDolares = enBase;

/** Cómo se muestra un pago: lo que se pagó y, si no vino en euros, a cuánto equivale. */
export const montoPagado = (pago) => {
  if (!pago) return '—';
  const propio = money(pago.monto, pago.moneda || MONEDA_BASE);
  if (!pago.moneda || pago.moneda === MONEDA_BASE) return propio;
  const nota = Number(pago.tasa) > 1
    ? `${money(enBase(pago))} a ${num(pago.tasa)}`
    : `${money(enBase(pago))} a la par`;
  return `${propio}<div class="tiny muted">${nota}</div>`;
};

/** El mismo importe en bolívares y en dólares, con la tasa que se usó. */
export function moneyBs(montoUsd, tasa, cur = MONEDA_BASE) {
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
  /* Los tipos de solicitud que puede hacer un estudiante. Sin esto,
     «plan_de_pago» salía como «Plan de pago» por la regla general, que está
     bien, pero «cambio de plan» dice mejor lo que es. */
  plan_de_pago: 'Cambio de plan de pago',
  // contactos que llegan de la web pública
  nuevo: 'Sin contactar', contactado: 'Contactado', interesado: 'Interesado',
  inscrito: 'Se inscribió', descartado: 'Descartado',
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

/* ============ la contraseña ============
 * Una medida sencilla y honesta: longitud y variedad. No pretende ser un
 * medidor de seguridad —para eso hace falta un diccionario de las filtradas—,
 * sólo evitar «12345678» y decirlo mientras se escribe, no al enviar.
 *
 * Vive aquí porque la piden dos pantallas: el registro y el cambio de
 * contraseña. Tenerla dos veces significaría que un día una exige ocho
 * caracteres y la otra seis, y nadie se enteraría hasta que alguien se queda
 * sin poder entrar. */
export const CLAVE_MINIMA = 8;

export function fuerzaDeClave(v) {
  const clave = String(v ?? '');
  if (!clave) return { nivel: 'vacia', texto: `Mínimo ${CLAVE_MINIMA} caracteres.`, sirve: false };
  const variedad = [/[a-z]/, /[A-Z]/, /\d/, /[^\w]/].filter(r => r.test(clave)).length;
  if (clave.length < CLAVE_MINIMA) {
    return { nivel: 'corta', texto: `Muy corta: te faltan ${CLAVE_MINIMA - clave.length}.`, sirve: false };
  }
  if (clave.length >= 12 && variedad >= 3) return { nivel: 'fuerte', texto: 'Fuerte.', sirve: true };
  if (variedad >= 2) return { nivel: 'aceptable', texto: 'Aceptable.', sirve: true };
  return { nivel: 'debil', texto: 'Débil: mezcla mayúsculas, números o símbolos.', sirve: true };
}

/** Pinta el medidor y el aviso de «no coinciden» en un par de campos. */
export function medidorDeClave({ clave, repetir, donde }) {
  const c = typeof clave === 'string' ? $(clave) : clave;
  const r = typeof repetir === 'string' ? $(repetir) : repetir;
  const d = typeof donde === 'string' ? $(donde) : donde;
  if (!c || !d) return () => true;

  /* El mínimo lo pone la constante, no el HTML: con el número escrito a mano en
     cada `minlength` basta un descuido para que la casilla acepte seis y el envío
     exija ocho, y la persona no entiende por qué no la deja pasar. */
  [c, r].forEach((el) => { if (el) el.minLength = CLAVE_MINIMA; });

  const pintar = () => {
    const f = fuerzaDeClave(c.value);
    const repetida = r ? r.value : '';
    const cuadran = !r || !repetida || repetida === c.value;
    d.dataset.nivel = cuadran ? f.nivel : 'corta';
    d.textContent = cuadran ? f.texto : 'Las dos contraseñas no coinciden.';
  };
  c.addEventListener('input', pintar);
  if (r) r.addEventListener('input', pintar);
  pintar();

  /** ¿Se puede enviar? Devuelve el motivo si no, o null si sí. */
  return () => {
    if (!fuerzaDeClave(c.value).sirve) return `Usa al menos ${CLAVE_MINIMA} caracteres.`;
    if (r && r.value !== c.value) return 'Las dos contraseñas no coinciden.';
    return null;
  };
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

/**
 * El identificador de 11 caracteres dentro de cualquier forma de enlace de
 * YouTube: `youtu.be/…`, `/shorts/…`, `/embed/…`, `watch?v=…`. Devuelve null si
 * no hay ninguno, y eso también es información: el enlace no es de YouTube.
 *
 * Vive aquí y no en cada pantalla porque hay dos sitios que deciden con esto
 * —el aula, para saber qué reproducir, y el editor de contenidos, para saber si
 * lo que se pegó y lo que se asignó son el mismo vídeo— y dos copias de una
 * expresión regular acaban siempre siendo dos reglas distintas.
 */
export function idDeYoutube(url) {
  const m = /(?:youtu\.be\/|\/shorts\/|\/embed\/|[?&]v=)([A-Za-z0-9_-]{11})/.exec(String(url || ''));
  return m ? m[1] : null;
}

/* ============ ver el material antes de abrirlo ============
 * Una biblioteca de fichas con el mismo icono repetido no es un catálogo: es
 * una lista de nombres de archivo. Se pidió previsualización en cinco sitios
 * distintos —la biblioteca del estudiante, la del equipo, los recursos de la
 * lección, las plantillas de certificado y el catálogo de programas— y todos
 * quieren lo mismo: enseñar el material, no describirlo.
 *
 * Qué se puede enseñar de verdad, y qué no:
 *   · una imagen           → la imagen;
 *   · un vídeo de YouTube  → su miniatura, con el triángulo encima;
 *   · todo lo demás        → el icono de su tipo sobre un fondo tenue.
 *
 * Por qué el PDF no enseña su primera página
 * ------------------------------------------------------------------------
 * Se probó: un <iframe> con el PDF y `#page=1&view=Fit`. Suelto en una página
 * de prueba se ve bien; dentro de la ficha de verdad sale un rectángulo gris.
 * El visor de PDF del navegador decide su escala cuando carga, y en una
 * cuadrícula la ficha todavía no tiene su tamaño definitivo en ese momento —
 * así que unas veces sale la página y otras un trozo enorme o nada. Ajustarlo
 * a base de tanteo deja una miniatura que depende de la versión del navegador
 * y del orden en que se pinte la pantalla, que es peor que no tenerla.
 *
 * La forma correcta es generar la miniatura UNA vez, al subir el archivo, y
 * guardarla como imagen junto al documento: la ficha entonces sólo enseña un
 * <img>, igual que las demás, sin visores incrustados ni sorpresas. Está
 * apuntado en `docs/lo-que-falta.md`; hasta entonces, un PDF se anuncia como
 * lo que es y no se finge una vista previa que no lo es.
 *
 * La regla de fondo: si no hay nada que enseñar, no se pinta un marco vacío
 * que parezca roto — se pinta el icono del tipo sobre un fondo tenue, que es
 * una respuesta honesta y mantiene la cuadrícula legible.
 */
const ICONO_DE = {
  pdf: 'picture_as_pdf', excel: 'table_chart', hoja: 'table_chart',
  video: 'play_circle', imagen: 'image', audio: 'graphic_eq',
  documento: 'description', enlace: 'link',
};

/** El icono que le toca a un material, por su tipo o por su extensión. */
export function iconoDeMaterial(tipo, url) {
  if (ICONO_DE[tipo]) return ICONO_DE[tipo];
  const ext = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(String(url || ''))?.[1]?.toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg'].includes(ext)) return 'image';
  if (ext === 'pdf') return 'picture_as_pdf';
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'table_chart';
  if (['doc', 'docx', 'txt', 'md'].includes(ext)) return 'description';
  if (['mp4', 'mov', 'webm', 'm4v'].includes(ext)) return 'play_circle';
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return 'graphic_eq';
  return 'draft';
}

/** ¿De qué se puede sacar una imagen de verdad? */
function claseDePrevia(tipo, url) {
  const u = String(url || '');
  if (!u) return 'nada';
  if (idDeYoutube(u)) return 'youtube';
  if (iconoDeMaterial(tipo, u) === 'image') return 'imagen';
  return 'nada';
}

/**
 * Devuelve el HTML de la previsualización de un material.
 * `alto` es la altura del marco en píxeles; el contenido se recorta dentro.
 */
export function previaDeMaterial({ tipo, url, nombre = '', alto = 132 } = {}) {
  const clase = claseDePrevia(tipo, url);
  const marco = (dentro, extra = '') =>
    `<div class="previa ${extra}" style="height:${Number(alto)}px">${dentro}</div>`;

  if (clase === 'youtube') {
    const id = idDeYoutube(url);
    return marco(`
      <img src="https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg" alt="" loading="lazy"
           onerror="this.closest('.previa').classList.add('sin-previa');this.remove()">
      <span class="previa-play"><span class="material-symbols-outlined">play_arrow</span></span>`);
  }
  if (clase === 'imagen') {
    return marco(`<img src="${esc(url)}" alt="${esc(nombre)}" loading="lazy"
      onerror="this.closest('.previa').classList.add('sin-previa');this.remove()">`);
  }
  return marco(
    `<span class="material-symbols-outlined">${iconoDeMaterial(tipo, url)}</span>`,
    'sin-previa');
}

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
/* El menú institucional tenía 39 entradas repartidas en siete grupos con
   nombre de área —«Académico», «Credenciales», «Gobierno»— y nadie recordaba
   dónde estaba nada, porque nadie piensa en áreas: se piensa en lo que hay que
   hacer esta mañana. Matricular a alguien. Cobrar. Preparar la clase. Firmar
   los certificados.

   Así que los grupos se llaman ahora por el verbo, y cada entrada vive donde
   se la busca: «Formas de pago» estaba en Gobierno con la configuración, y es
   lo primero que abre quien cobra. Ninguna pantalla desaparece; lo único que
   cambia es en qué cajón está. */
/* El menú del portal institucional, con quién puede abrir cada cosa.
   ═══════════════════════════════════════════════════════════════════════════
   El cuarto elemento de cada entrada son los roles que la pueden abrir, y es
   EXACTAMENTE la lista que esa pantalla le pasa a `mount({ require })`.

   Por qué está aquí repetida, y por qué no pasa nada
   ---------------------------------------------------------------------------
   El menú se dibuja antes de abrir ninguna otra pantalla, así que no hay forma
   de preguntarle a cada archivo qué exige sin descargarlos los cuarenta. La
   copia es inevitable; lo que no es inevitable es que se separen. Hay una
   comprobación en `herramientas/revisar.mjs` que abre cada pantalla, le lee el
   `require` y lo compara con esta lista: si alguien cambia uno y no el otro, se
   pone roja y dice cuál.

   Por qué se esconde en vez de dejarlo y que rebote
   ---------------------------------------------------------------------------
   Un coordinador veía «Banco», «Formas de pago» y «Cobros con tarjeta» en su
   menú, pulsaba, y la pantalla le decía que no. Ofrecer y luego negar es peor
   que no ofrecer: hace dudar de si es un fallo, invita a pedir permisos que no
   necesita y ensucia el menú con siete entradas que nunca va a usar. Esconderlo
   no es seguridad —la seguridad está en `mount()` y en las políticas de la
   base, y ahí sigue—, es no mentir sobre lo que se puede hacer. */
const TODOS = null;   // sin restricción propia: vale con estar en esta área

const ADMIN_NAV = [
  { lbl: 'Hoy', items: [
    ['index.html', 'dashboard', 'Qué hay que hacer', ['coordinador','admin','superadmin','auditor']],
    ['calendario.html', 'calendar_today', 'Calendario', ['coordinador','admin','superadmin','auditor']],
  ]},
  { lbl: 'Matricular', items: [
    ['leads.html', 'contact_phone', 'Contactos de la web', ['cobranza','coordinador','admin','superadmin']],
    ['estudiantes.html', 'person', 'Estudiantes', ['cobranza','coordinador','admin','superadmin','auditor']],
    ['inscripciones.html', 'assignment_ind', 'Inscripciones y cuotas', ['cobranza','coordinador','admin','superadmin','auditor']],
    ['cohortes.html', 'groups', 'Cohortes', ['coordinador','admin','superadmin','auditor']],
  ]},
  { lbl: 'Cobrar', items: [
    ['pagos-verificar.html', 'fact_check', 'Verificar pagos', ['cobranza','coordinador','admin','superadmin','auditor']],
    ['carteras.html', 'account_balance_wallet', 'Carteras', ['cobranza','coordinador','admin','superadmin','auditor']],
    ['cierre-mes.html', 'event_available', 'Cierre de mes', ['cobranza','coordinador','admin','superadmin','auditor']],
    ['bancaribe.html', 'account_balance', 'Banco (Bancaribe)', ['cobranza','admin','superadmin']],
    ['formas-de-pago.html', 'payments', 'Formas de pago', ['admin','superadmin']],
    ['stripe.html', 'credit_card', 'Cobros con tarjeta', ['admin','superadmin']],
  ]},
  { lbl: 'Dar clase', items: [
    ['cursos.html', 'school', 'Cursos', ['coordinador','admin','superadmin','auditor']],
    ['contenido.html', 'import_contacts', 'Contenidos', ['coordinador','admin','superadmin','profesor']],
    ['videos.html', 'smart_display', 'Vídeo de cada lección', ['coordinador','admin','superadmin']],
    ['multimedia.html', 'perm_media', 'Biblioteca', ['coordinador','admin','superadmin','profesor','auditor']],
    ['profesores.html', 'psychology', 'Profesores', ['coordinador','admin','superadmin','auditor']],
    ['revision.html', 'fact_check', 'Revisión de contenido', ['coordinador','admin','superadmin','profesor','auditor']],
  ]},
  { lbl: 'Evaluar', items: [
    ['calificar.html', 'grade', 'Calificar', ['coordinador','admin','superadmin','profesor','auditor']],
    ['evaluaciones.html', 'quiz', 'Evaluaciones', ['coordinador','admin','superadmin','profesor','auditor']],
    ['preguntas.html', 'help_center', 'Banco de preguntas', ['coordinador','admin','superadmin','profesor','auditor']],
    ['apelaciones.html', 'gavel', 'Apelaciones', ['coordinador','admin','superadmin','profesor','auditor']],
  ]},
  { lbl: 'Certificar', items: [
    ['certificados.html', 'workspace_premium', 'Certificados', ['coordinador','admin','superadmin','auditor']],
    ['certificados-plantillas.html', 'design_services', 'Plantillas', ['coordinador','admin','superadmin']],
    ['insignias.html', 'military_tech', 'Insignias', ['coordinador','admin','superadmin','auditor']],
  ]},
  { lbl: 'Hablar con la gente', items: [
    ['comunicaciones.html', 'mail', 'Comunicaciones', ['coordinador','admin','superadmin','profesor','auditor']],
    ['correo.html', 'outgoing_mail', 'Envío de correo', ['admin','superadmin']],
    ['soporte.html', 'support_agent', 'Soporte', ['coordinador','admin','superadmin','auditor']],
  ]},
  { lbl: 'Gobierno', items: [
    ['reportes.html', 'analytics', 'Reportes', ['coordinador','admin','superadmin','auditor']],
    ['auditoria.html', 'history', 'Auditoría', ['admin','superadmin','auditor']],
    ['usuarios.html', 'manage_accounts', 'Usuarios y roles', ['admin','superadmin','auditor']],
    ['permisos.html', 'admin_panel_settings', 'Matriz de permisos', ['admin','superadmin','auditor']],
    ['seguridad.html', 'shield_lock', 'Seguridad de mi cuenta', ['cobranza','coordinador','admin','superadmin','auditor']],
    ['configuracion.html', 'settings', 'Configuración', ['admin','superadmin']],
  ]},
];
/* Las evaluaciones y la ayuda no estaban en el menú.
   ------------------------------------------------------------------------
   Las evaluaciones vivían sólo dentro del panel, en una tarjeta que se
   pierde en cuanto se desplaza la página: para volver a un examen a medias
   había que ir al panel y buscarlo. Es lo que más urgencia tiene de todo lo
   que hace un alumno, así que tiene su propia entrada.

   El calendario y la ayuda son las otras dos cosas que un estudiante busca
   con el menú y no encontraba. */
const STUDENT_NAV = [
  ['panel.html', 'space_dashboard', 'Mi panel'],
  ['catalogo.html', 'menu_book', 'Catálogo'],
  ['calendario.html', 'calendar_month', 'Mi calendario'],
  ['evaluaciones.html', 'quiz', 'Mis evaluaciones'],
  ['pagos.html', 'payments', 'Mis pagos'],
  ['biblioteca.html', 'local_library', 'Biblioteca'],
  ['certificados.html', 'workspace_premium', 'Certificados'],
  ['perfil.html', 'account_circle', 'Mi perfil'],
  ['ayuda.html', 'help', 'Ayuda'],
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
    /* La conciliación contra el extracto es trabajo suyo, y hasta ahora esta
       pantalla no estaba en su menú: era de administración. */
    ['bancaribe.html', 'account_balance', 'Banco y conciliación'],
    ['leads.html', 'contact_phone', 'Contactos de la web'],
    ['carteras.html', 'account_balance_wallet', 'Carteras'],
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

/* Las opciones que `mount()` entiende.
   ------------------------------------------------------------------------
   Existe esta lista porque una pantalla escribió `roles:` donde iba `require:`
   y estuvo meses abierta a cualquiera con sesión: la opción con el nombre
   equivocado no daba error, simplemente no hacía nada, y «no hacer nada» aquí
   quiere decir «no comprobar el rol». Un guardia que se desactiva con una
   errata y no se queja es peor que no tener guardia, porque se cree que está.

   Ahora una opción desconocida detiene la pantalla. Cortar es deliberado: la
   alternativa —seguir y avisar por consola— es exactamente lo que dejó pasar
   el fallo anterior. */
const OPCIONES_DE_MOUNT = new Set(['require', 'active', 'area', 'pub']);

export async function mount(opts = {}) {
  const desconocidas = Object.keys(opts).filter((k) => !OPCIONES_DE_MOUNT.has(k));
  if (desconocidas.length) {
    const aviso = `mount() no conoce ${desconocidas.map((k) => `«${k}»`).join(', ')}.`
      + ` Las opciones son: ${[...OPCIONES_DE_MOUNT].join(', ')}.`
      + ' Si era el control de acceso, esta pantalla estaría abierta a cualquiera.';
    document.body.innerHTML = `<div style="max-width:640px;margin:12vh auto;padding:24px;
      font-family:system-ui,sans-serif;line-height:1.6">
      <h1 style="font-size:20px">Esta pantalla está mal configurada</h1>
      <p>${esc(aviso)}</p>
      <p style="color:#666;font-size:14px">Se detuvo a propósito: es más seguro no abrirla.</p></div>`;
    throw new Error(aviso);
  }

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
  tablasExportables();
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
  $$('table', raiz).forEach(prepararTabla);

  /* Hay pantallas que no tienen ninguna tabla al montar porque se construyen
     enteras con JavaScript un momento después —el generador de certificados,
     sin ir más lejos— y esas se quedaban sin apilar para siempre: la regla se
     aplicaba una vez, al arrancar, sobre lo que hubiera. Ahora se vigila el
     contenido y cualquier tabla que nazca después recibe el mismo trato. */
  const contenido = $('#cemContent') || document.body;
  if (contenido && !contenido.dataset.cemVigilaTablas) {
    contenido.dataset.cemVigilaTablas = '1';
    new MutationObserver((cambios) => {
      for (const c of cambios) {
        for (const n of c.addedNodes) {
          if (n.nodeType !== 1) continue;
          if (n.tagName === 'TABLE') prepararTabla(n);
          else $$('table', n).forEach(prepararTabla);
        }
      }
    }).observe(contenido, { childList: true, subtree: true });
  }
}

function prepararTabla(tabla) {
  if (tabla.dataset.cemPreparada) return;
  tabla.dataset.cemPreparada = '1';
  {
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
      /* Dos columnas se leen de frente y apilarlas sólo estorba. Tres ya no:
         medido en un teléfono de 390 puntos, una tabla de tres columnas con
         texto de verdad sigue obligando a arrastrar de lado. */
      if (ths.length >= 3) {
        tabla.classList.add('tarjetas');
        marcar(ths);
        monedaAlEncabezado(tabla, ths);
      }
      botonesConNombre(tabla);
      obs?.observe(tabla, { childList: true, subtree: true });
    };
    obs = new MutationObserver(sellar);
    sellar();
  }
}

/* ============ que toda tabla se pueda sacar a Excel (mejora 29) ============
   La mitad de las tablas de la plataforma no se podían exportar, y esa mitad
   acababa copiada a mano. Poner un botón en cada pantalla era escribir veinte
   veces lo mismo y olvidarse en la veintiuna, así que se hace una vez y para
   todas: cualquier tabla con encabezado y datos gana su botón.

   Exporta LO QUE SE ESTÁ VIENDO, con los filtros puestos. Es lo que la gente
   espera —«sácame esta lista»— y además hace innecesario reimplementar en el
   servidor cada combinación de filtros. Lo que no está en pantalla, como una
   segunda página sin cargar, no sale: por eso el nombre del archivo lleva la
   fecha y no promete ser «todo». */
function tablasExportables(raiz = document) {
  /* Si la pantalla ya trae su propio botón de exportar, no se le añade
     ninguno: quien la escribió ya decidió qué se saca y cómo, y dos botones
     que hacen cosas parecidas obligan a averiguar en qué se diferencian. */
  if ($('#page [id*="xport"]')) return;

  $$('table', raiz).forEach((tabla) => {
    if (tabla.dataset.cemExportable) return;
    const caja = tabla.closest('.card');
    if (!caja) return;
    if ($('[data-exportar]', caja)) return;
    if ($$('thead th', tabla).length < 2) return;
    tabla.dataset.cemExportable = '1';

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn ghost sm exportar-tabla';
    boton.dataset.exportar = '1';
    boton.title = 'Descargar esta tabla como CSV, con los filtros puestos';
    boton.setAttribute('aria-label', boton.title);
    boton.innerHTML = '<span class="material-symbols-outlined">download</span>';
    boton.onclick = () => bajarTabla(tabla, caja);

    // Al lado del título de la tarjeta si lo hay; si no, flotando sobre ella.
    const cabecera = $('.row.between', caja) || $('.card-head', caja);
    if (cabecera) cabecera.appendChild(boton);
    else { caja.classList.add('con-exportar'); caja.appendChild(boton); }
  });
}

function bajarTabla(tabla, caja) {
  const cols = $$('thead th', tabla).map((th) => {
    const copia = th.cloneNode(true);
    $$('.unidad', copia).forEach((u) => u.remove());
    return copia.textContent.trim();
  });
  const filas = $$('tbody tr', tabla)
    .filter((tr) => !tr.querySelector('td[colspan]') && !tr.classList.contains('esqueleto-fila'))
    .map((tr) => {
      const o = {};
      [...tr.children].forEach((td, i) => {
        if (!cols[i]) return;
        // Los botones de acción no son datos; se van del CSV.
        const copia = td.cloneNode(true);
        $$('button, .btn, input[type=checkbox]', copia).forEach((b) => b.remove());
        o[cols[i]] = copia.textContent.replace(/\s+/g, ' ').trim();
      });
      return o;
    });
  if (!filas.length) { toast('No hay nada que exportar con estos filtros.'); return; }

  const titulo = ($('h1', document) || $('h2', caja) || {}).textContent || 'tabla';
  const nombre = titulo.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'tabla';
  download(`${nombre}-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(filas));
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

/* ============ el buscador de arriba busca de verdad (mejora 22) ============
   Decía «Buscar estudiantes, cursos, cohortes…» y lo que hacía era mandarte a
   la lista de estudiantes con el texto puesto en su filtro. Si buscabas una
   cohorte por su código, no la encontrabas nunca; y aunque encontrara a la
   persona, te dejaba en una lista filtrada en vez de en su ficha.

   Ahora pregunta a la base por las tres cosas y salta al resultado. Con
   teclado: flechas para moverse, Enter para entrar, Escape para cerrar — quien
   busca cincuenta veces al día no quiere soltar el teclado. */
const ICONO_RESULTADO = {
  estudiante: 'person', profesor: 'psychology', coordinador: 'badge',
  admin: 'shield_person', superadmin: 'shield_person', cobranza: 'payments',
  auditor: 'history', curso: 'school', cohorte: 'groups',
};

function buscadorDeVerdad(caja) {
  const envoltura = caja.closest('.search') || caja.parentElement;
  envoltura.style.position = envoltura.style.position || 'relative';

  const lista = document.createElement('div');
  lista.className = 'gsearch-res';
  lista.setAttribute('role', 'listbox');
  lista.hidden = true;
  envoltura.appendChild(lista);

  let resultados = [];
  let marcado = -1;
  let reloj = null;
  let ultima = 0;

  const cerrar = () => { lista.hidden = true; marcado = -1; };

  const pintar = () => {
    if (!resultados.length) {
      lista.innerHTML = `<div class="gsearch-nada">Nada con ese nombre.</div>`;
      lista.hidden = false;
      return;
    }
    lista.innerHTML = resultados.map((r, i) => `
      <a class="gsearch-item${i === marcado ? ' on' : ''}" href="${esc(r.url)}" role="option"
         aria-selected="${i === marcado}">
        <span class="material-symbols-outlined">${ICONO_RESULTADO[r.tipo] || 'search'}</span>
        <span class="crece"><b>${esc(r.titulo || '—')}</b>
          <span class="tiny muted">${esc(r.detalle || '')}</span></span>
        <span class="tiny muted">${esc(etiqueta(r.tipo))}</span></a>`).join('');
    lista.hidden = false;
  };

  const buscar = async () => {
    const q = caja.value.trim();
    if (q.length < 2) { resultados = []; cerrar(); return; }
    const mio = ++ultima;
    const { data } = await sb.rpc('cem_buscar', { p_q: q, p_tope: 6 });
    // Una respuesta que llega tarde no puede pisar a una búsqueda más nueva.
    if (mio !== ultima) return;
    resultados = data || [];
    marcado = -1;
    pintar();
  };

  caja.addEventListener('input', () => { clearTimeout(reloj); reloj = setTimeout(buscar, 220); });
  caja.addEventListener('focus', () => { if (resultados.length) pintar(); });
  caja.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { cerrar(); return; }
    if (!resultados.length) {
      // Enter sin resultados todavía: se busca ya, sin esperar al temporizador.
      if (e.key === 'Enter') { e.preventDefault(); clearTimeout(reloj); buscar(); }
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      marcado = (marcado + (e.key === 'ArrowDown' ? 1 : -1) + resultados.length) % resultados.length;
      pintar();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const r = resultados[marcado] || resultados[0];
      if (r) location.href = r.url;
    }
  });

  // Pulsar fuera cierra. En `mousedown` y no en `click`: si se espera al click,
  // el campo pierde el foco antes y la lista se va justo debajo del dedo.
  document.addEventListener('mousedown', (e) => {
    if (!envoltura.contains(e.target)) cerrar();
  });
}

/* ============ un solo buscador por pantalla (item 27) ============
   Había dos cajas de búsqueda a la vez —la de la barra de arriba y la de cada
   tabla— con reglas distintas: una te mandaba a otra pantalla y la otra
   filtraba lo que estabas mirando. Sigue habiendo un solo filtro por pantalla;
   lo que cambió es que ya no se esconde ninguna caja.

   Por qué se deshizo lo de esconderla
   ------------------------------------------------------------------------
   Se retiraba la de la tabla y mandaba la de arriba. Sobre el papel es una
   caja menos; en la práctica el filtro acababa a cuatrocientos píxeles de la
   lista que filtra, arriba a la izquierda, fuera del recuadro y pegado a la
   campana de avisos. El resultado se repitió en cinco pantallas distintas:
   «aquí hace falta una barra de búsqueda» —dicho de pantallas que la tenían—.
   Un control que la gente no encuentra no existe, por muy bien colocado que
   esté en el diagrama.

   Ahora las dos se ven y son la misma: escribir en cualquiera de ellas mueve
   la otra y filtra la lista. Lo que aquel comentario quería evitar —dos cajas
   con dos reglas— no vuelve, porque no hay dos reglas: hay un filtro con dos
   sitios donde escribirlo. La de arriba sigue heredando la pista de qué se
   puede buscar, que la sabe mejor la pantalla. */
function unSoloBuscador(area) {
  const global = $('#cemGlobalSearch');
  if (!global) return;

  // Sólo cuenta como «buscador de la pantalla» el de la franja de filtros.
  const local = $('#page .filters input#q');
  if (!local) {
    if (area === 'admin') { buscadorDeVerdad(global); return; }
    global.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && global.value.trim()) {
        location.href = `catalogo.html?q=${encodeURIComponent(global.value.trim())}`;
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

  /* Las dos son la misma caja: cada una copia a la otra y sólo la de la tabla
     dispara el filtrado, para que no haya dos caminos hacia el mismo sitio.
     El guardia `copiando` corta el rebote —arriba escribe abajo, abajo
     escribiría arriba, y así sin parar—. */
  let copiando = false;
  const propagar = () => {
    if (copiando) return;
    copiando = true;
    local.value = global.value;
    local.dispatchEvent(new Event('input', { bubbles: true }));
    copiando = false;
  };
  global.addEventListener('input', propagar);
  local.addEventListener('input', () => {
    if (copiando) return;
    copiando = true;
    global.value = local.value;
    copiando = false;
  });
  /* Llegar con `?q=` desde otra pantalla dejaba el texto escrito arriba y la
     tabla sin filtrar: se veía la palabra en la caja y la lista entera debajo.
     Se propaga una vez al montar, que es lo que la persona esperaba al pulsar
     el enlace. */
  if (!local.value && desdeLaUrl) propagar();
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
  let nav = area === 'admin'
    ? (p.rol === 'cobranza' ? COBRANZA_NAV : p.rol === 'auditor' ? AUDITOR_NAV : ADMIN_NAV)
    : area === 'docente' ? [{ lbl: '', items: TEACHER_NAV }]
    : [{ lbl: '', items: STUDENT_NAV }];
  const areaLabel = area === 'admin'
    ? (p.rol === 'cobranza' ? 'Cobranza' : p.rol === 'auditor' ? 'Auditoría' : 'Portal institucional')
    : area === 'docente' ? 'Portal docente' : 'Portal del estudiante';

  /* El menú del administrador son 27 entradas en 7 grupos, y antes se veían los
     7 abiertos a la vez: había que recorrer la lista entera con la vista para
     encontrar cualquier cosa. Ahora sólo queda abierto el grupo de la pantalla
     en la que estás; los demás se abren al pulsarlos y se recuerda cuáles. */
  let abiertosGuardados = [];
  try { abiertosGuardados = JSON.parse(localStorage.getItem('cemNavAbiertos') || '[]'); } catch {}
  /* Sólo lo que esta persona puede abrir de verdad. Un grupo que se queda sin
     entradas —«Cobrar» para quien no cobra— desaparece entero: un encabezado
     solo, sin nada debajo, se lee como un fallo. */
  const puedeAbrir = ([, , , roles]) => !roles || roles.includes(p.rol);
  nav = nav
    .map((g) => ({ ...g, items: g.items.filter(puedeAbrir) }))
    .filter((g) => g.items.length);

  const flat = nav.flatMap(g => g.items);
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
        <button class="btn ghost sm block" id="cemApariencia"
                title="Colores, estilo de los recuadros, claro u oscuro">
          <span class="material-symbols-outlined">palette</span> <span>Apariencia</span></button>
        <button class="btn outline sm block" id="cemLogout" title="Cerrar sesión">
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

  /* La apariencia es de quien mira, no de la institución: se guarda en este

     navegador. Por eso el botón está en el pie del menú, al lado del nombre

     de la persona, y no dentro de Configuración —que sólo ve el administrador.

     El módulo se carga al pulsar y no al arrancar: son doce paletas y siete

     estilos que la mayoría de las visitas no va a abrir. */

  const btnAp = $('#cemApariencia');

  if (btnAp) btnAp.onclick = async () => {

    const m = await import('./apariencia.js?v=2026-08-21-25');

    m.abrirApariencia();

  };


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
  /* Si no hay proveedor de correo, los avisos de aquí son los ÚNICOS que la
     persona va a recibir, y hay que decirlo. Callarlo es lo que hizo que quien
     esperaba el correo de «tu pago fue aprobado» creyera durante días que su
     pago no se había aprobado. Se pregunta una vez por carga: cambia cuando
     alguien conecta un proveedor, no cada dos minutos. */
  let enPausa = false;
  sb.rpc('cem_correo_en_pausa').then(({ data }) => { enPausa = data === true; });

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
    const pausa = enPausa
      ? `<p class="nota warn" id="cemCorreoPausa">Los avisos por correo están en pausa,
           así que <b>esta lista es la única forma de enterarte</b>. Nada se pierde: los
           mensajes quedan guardados y saldrán en cuanto el correo vuelva a funcionar.</p>`
      : '';
    const dlg = modal({
      title: 'Avisos',
      body: pausa + (avisos.length
        ? `<div class="avisos">${avisos.map(a => `
            <${a.url ? 'a' : 'div'} class="aviso ${a.leida_en ? '' : 'nuevo'}"
              ${a.url ? `href="${base()}${esc(a.url)}"` : ''}>
              <b>${esc(a.titulo)}</b>
              ${a.cuerpo ? `<span>${esc(a.cuerpo)}</span>` : ''}
              <em>${fdatetime(a.created_at)}</em>
            </${a.url ? 'a' : 'div'}>`).join('')}</div>`
        : '<div class="empty">No tienes avisos por ahora.</div>'),
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

/* El encabezado público lo usan pantallas de la raíz de la plataforma y también
   de estudiante/. Con los enlaces escritos a mano, el mismo encabezado llevaba a
   404 desde la mitad de ellas. Se calcula de dónde se está mirando. */
const enSubcarpeta = () => /\/(estudiante|admin|docente)\//.test(location.pathname);
export const raizPublica = () => (enSubcarpeta() ? '../' : './');

function renderPublicHeader(p) {
  const r = raizPublica();
  const h = document.createElement('header');
  h.className = 'pub-header';
  const activa = (archivo) => location.pathname.endsWith(archivo) ? ' class="on"' : '';
  h.innerHTML = `<div class="pub-inner">
    <a class="pub-brand" href="${r}inicio.html">
      <span class="material-symbols-outlined">account_balance</span> CEM International</a>
    <nav>
      <a href="${r}inicio.html"${activa('inicio.html')}>Inicio</a>
      <a href="${r}catalogo.html"${activa('catalogo.html')}>Cursos</a>
      <a href="${r}catalogo.html?tipo=programa">Programas</a>
      <a href="${r}nosotros.html"${activa('nosotros.html')}>Quiénes somos</a>
      <a href="${r}verificar.html"${activa('verificar.html')}>Verificar certificado</a>
    </nav>
    <div class="pub-cta">
      ${p ? `<a class="btn outline sm" href="${r}${homeForRoot(p.rol)}">Mi panel</a>
             <div class="avatar" title="${esc(p.email)}">${initials(p.nombre, p.apellido)}</div>`
          : `<a class="btn outline sm" href="${r}index.html">Iniciar sesión</a>
             <a class="btn sm" href="${r}index.html?registro=1">Registrarse</a>`}
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
  // contactos de la web: «sin contactar» es un aviso, no un estado neutro.
  'sin contactar':'warn', contactado:'info', interesado:'info', 'se inscribió':'ok', descartado:'neutral',
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
                               etiquetaSubir = 'Elegir archivo', permitirEnlace = true,
                               alCambiar = null }) {
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

    /* `alCambiar` avisa cuando lo elegido ya está subido y firme.
       ------------------------------------------------------------------
       El resto de las pantallas leen `valor()` al pulsar Guardar, porque el
       campo vive dentro de un formulario. Pero hay sitios donde el archivo
       ES el formulario —la foto de perfil, sin más campos ni botón—, y ahí
       obligar a pulsar Guardar por una sola cosa sobra. El aviso llega sólo
       cuando hay dirección definitiva o cuando se quita: nunca con la
       miniatura provisional que se pinta mientras sube, que apunta a un
       `blob:` de este navegador y no sirve para guardarla en ningún sitio. */
    const pintar = (u, texto, sub, provisional) => {
      actual = u || '';
      vacia.hidden = !!actual;
      hecha.hidden = !actual;
      if (mini && actual) mini.src = actual;
      if (nombre) nombre.textContent = texto || 'Archivo cargado';
      if (detalle) detalle.textContent = sub || '';
      if (url) url.value = actual;
      if (!provisional) alCambiar?.(actual);
    };
    if (actual) pintar(actual, 'Archivo cargado', '', true);

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
      if (mini) { pintar(URL.createObjectURL(listo), listo.name, 'subiendo…', true); }
      else pintar('pendiente', listo.name, 'subiendo…', true);
      avance.hidden = false; avance.removeAttribute('value');
      zona.classList.add('subiendo');
      try {
        const dir = await subir(listo);
        pintar(dir, listo.name, `${(listo.size / 1048576).toFixed(1)} MB`);
        ok('Archivo subido');
      } catch (e) {
        pintar('', '', '', true);
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

/* ============ buscar a una persona, en vez de bajar por una lista ============
   item 22 · «Nueva inscripción» empezaba con un desplegable de quinientos
   nombres ordenados alfabéticamente. Con quinientas cuentas eso ya no es
   elegir: es buscar a mano en una lista que no se puede buscar. Y el número
   sólo crece.

   Aquí se escribe y la base contesta. Se pregunta a partir de dos letras y con
   un respiro de 220 ms, para no lanzar una consulta por tecla. Se devuelve el
   mismo trato que `campoArchivo`: { html, conectar(raíz), valor(), fijar(x) }.

   `buscar` recibe el texto y devuelve una lista de { id, titulo, sub }. Así
   sirve igual para estudiantes, para profesores o para lo que haga falta. */
export function campoBuscar({ id, etiqueta: etq = 'Buscar', ayudaTexto = 'Escribe dos letras del nombre o del correo',
                              buscar, alElegir = null, minimo = 2 }) {
  let elegido = null;

  const html = `
    <div class="field buscador" id="${id}Campo">
      <label for="${id}">${esc(etq)}</label>
      <input id="${id}" type="search" role="combobox" aria-expanded="false" aria-autocomplete="list"
             aria-controls="${id}Lista" autocomplete="off" spellcheck="false"
             placeholder="${esc(ayudaTexto)}">
      <div class="buscador-elegido" id="${id}Elegido" hidden>
        <span class="grow"></span>
        <button type="button" class="btn ghost sm" id="${id}Quitar" aria-label="Elegir a otra persona">
          <span class="material-symbols-outlined">close</span></button>
      </div>
      <ul class="buscador-lista" id="${id}Lista" role="listbox" hidden></ul>
    </div>`;

  function conectar(raiz = document) {
    const input = raiz.querySelector('#' + id);
    const lista = raiz.querySelector('#' + id + 'Lista');
    const caja  = raiz.querySelector('#' + id + 'Elegido');
    const quien = caja.querySelector('.grow');
    let espera = null, resultados = [], marcado = -1, pedido = 0;

    const cerrar = () => { lista.hidden = true; input.setAttribute('aria-expanded', 'false'); marcado = -1; };

    const pintar = () => {
      lista.innerHTML = resultados.length
        ? resultados.map((r, k) => `<li role="option" id="${id}Op${k}" data-k="${k}"
            aria-selected="${k === marcado}" class="${k === marcado ? 'marcada' : ''}">
            <b>${esc(r.titulo)}</b>${r.sub ? `<span class="tiny muted">${esc(r.sub)}</span>` : ''}</li>`).join('')
        : `<li class="vacia" aria-disabled="true">Nadie con ese nombre ni ese correo</li>`;
      lista.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      input.setAttribute('aria-activedescendant', marcado >= 0 ? `${id}Op${marcado}` : '');
    };

    const elegir = (r) => {
      elegido = r;
      quien.innerHTML = `<b>${esc(r.titulo)}</b>${r.sub ? ` <span class="tiny muted">${esc(r.sub)}</span>` : ''}`;
      caja.hidden = false;
      input.hidden = true;
      cerrar();
      alElegir?.(r);
    };

    input.addEventListener('input', () => {
      clearTimeout(espera);
      const q = input.value.trim();
      if (q.length < minimo) { resultados = []; cerrar(); return; }
      espera = setTimeout(async () => {
        /* Cada consulta lleva su número. Si vuelve una vieja después de una
           nueva —pasa cuando se escribe rápido y la red va a saltos—, se tira:
           pintar la respuesta de «ma» encima de la de «marta» es peor que no
           pintar nada. */
        const mio = ++pedido;
        try {
          const r = await buscar(q);
          if (mio !== pedido) return;
          resultados = r || []; marcado = -1; pintar();
        } catch { if (mio === pedido) { resultados = []; pintar(); } }
      }, 220);
    });

    input.addEventListener('keydown', (e) => {
      if (lista.hidden || !resultados.length) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); marcado = (marcado + 1) % resultados.length; pintar(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); marcado = (marcado - 1 + resultados.length) % resultados.length; pintar(); }
      else if (e.key === 'Enter' && marcado >= 0) { e.preventDefault(); elegir(resultados[marcado]); }
      else if (e.key === 'Escape') cerrar();
    });

    lista.addEventListener('mousedown', (e) => {
      const li = e.target.closest('li[data-k]');
      if (li) { e.preventDefault(); elegir(resultados[Number(li.dataset.k)]); }
    });
    input.addEventListener('blur', () => setTimeout(cerrar, 120));

    raiz.querySelector('#' + id + 'Quitar').addEventListener('click', () => {
      elegido = null; caja.hidden = true; input.hidden = false;
      input.value = ''; input.focus(); alElegir?.(null);
    });

    return api;
  }

  const api = { html, conectar, valor: () => elegido, fijar: (r) => { elegido = r; } };
  return api;
}

/* ============ un descuento, en porcentaje o en dinero ============
   item 22 · el campo era un número suelto y nadie sabía si «10» eran diez
   euros o el diez por ciento. Sobre un programa de 2.160 € la diferencia son
   206 €, y se descubría al emitir las cuotas.

   Se guarda siempre en dinero, que es lo que entiende la base; el porcentaje
   es sólo la forma de escribirlo. Y debajo se enseña el precio que queda, que
   es la única cifra que de verdad se está decidiendo. */
export function campoDescuento({ id, precio = 0, moneda = MONEDA_BASE, alCambiar = null }) {
  let base = Number(precio) || 0;

  const html = `
    <div class="field descuento" id="${id}Campo">
      <label for="${id}">Descuento</label>
      <div class="row descuento-fila">
        <input type="number" step="0.01" min="0" id="${id}" value="0" aria-describedby="${id}Nota">
        <div class="segmentado" role="radiogroup" aria-label="Cómo se expresa el descuento">
          <button type="button" class="btn outline sm" id="${id}Pct" role="radio" aria-checked="false">%</button>
          <button type="button" class="btn outline sm activo" id="${id}Eur" role="radio" aria-checked="true">${esc(moneda === 'EUR' ? '€' : moneda)}</button>
        </div>
      </div>
      <p class="tiny muted" id="${id}Nota"></p>
    </div>`;

  function conectar(raiz = document) {
    const input = raiz.querySelector('#' + id);
    const bPct  = raiz.querySelector('#' + id + 'Pct');
    const bEur  = raiz.querySelector('#' + id + 'Eur');
    const nota  = raiz.querySelector('#' + id + 'Nota');
    let enPct = false;

    const enDinero = () => {
      const v = Number(input.value) || 0;
      if (!enPct) return Math.min(Math.max(v, 0), base);
      return Math.round(base * Math.min(Math.max(v, 0), 100)) / 100;
    };

    const repintar = () => {
      const d = enDinero();
      const final = Math.max(base - d, 0);
      nota.innerHTML = base
        ? `Precio de lista ${esc(money(base, moneda))} · queda en <b>${esc(money(final, moneda))}</b>`
          + (d > 0 ? ` (${enPct ? esc(money(d, moneda)) : Math.round(1000 * d / base) / 10 + ' %'})` : '')
        : 'Este programa no tiene precio de lista, así que no hay nada que descontar.';
      alCambiar?.({ descuento: d, final });
    };

    const modo = (pct) => {
      enPct = pct;
      bPct.classList.toggle('activo', pct);   bPct.setAttribute('aria-checked', String(pct));
      bEur.classList.toggle('activo', !pct);  bEur.setAttribute('aria-checked', String(!pct));
      input.max = pct ? 100 : (base || '');
      repintar();
    };

    bPct.addEventListener('click', () => modo(true));
    bEur.addEventListener('click', () => modo(false));
    input.addEventListener('input', repintar);

    api.fijarPrecio = (p) => { base = Number(p) || 0; input.max = enPct ? 100 : (base || ''); repintar(); };
    api.valor = () => { const d = enDinero(); return { descuento: d, final: Math.max(base - d, 0), enPct }; };
    repintar();
    return api;
  }

  const api = { html, conectar, valor: () => ({ descuento: 0, final: base, enPct: false }), fijarPrecio: () => {} };
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

/**
 * Tasa BCV vigente de una moneda. Son dos y hacen cosas distintas: la del EURO
 * convierte los bolívares que entran —es la que cobra—, y la del DÓLAR sirve
 * para los reportes y para cuadrar con el banco.
 */
export async function tasaVigente(moneda = MONEDA_BASE, { forzar = false } = {}){
  // Se llamaba con un objeto de opciones cuando sólo había una tasa; las
  // pantallas viejas siguen haciéndolo y no tienen por qué romperse.
  if (moneda && typeof moneda === 'object') { forzar = moneda.forzar; moneda = MONEDA_BASE; }
  const llave = `${CLAVE_TASA}:${moneda}`;
  if (!forzar) {
    try {
      const c = JSON.parse(sessionStorage.getItem(llave) || 'null');
      if (c && Date.now() - c.en < VIDA_TASA_MS) return c.tasa;
    } catch { /* si el guardado está corrupto, se pide de nuevo */ }
  }
  const { data, error } = await sb.rpc('cem_tasa_vigente', { p_moneda: moneda });
  if (error) return null;
  const t = Array.isArray(data) ? data[0] : data;
  const tasa = t && t.valor ? t : null;
  try { sessionStorage.setItem(llave, JSON.stringify({ en: Date.now(), tasa })); } catch {}
  return tasa;
}

/** Borra las tasas guardadas. Llamar después de cargar una nueva a mano. */
export function olvidarTasa(){
  try { ['EUR','USD'].forEach(m => sessionStorage.removeItem(`${CLAVE_TASA}:${m}`)); } catch {}
}

/* ============ cómo salda cada forma de pago ============
   La regla vive en la base (`cem_metodos_pago`) y no en el código, porque
   «el efectivo se recibe a la par del euro» es una decisión comercial que
   puede cambiar un martes y no debería exigir publicar la plataforma.

   Lo de aquí abajo es SÓLO para enseñar el equivalente mientras alguien
   escribe. Lo que vale es lo que calcula el servidor al guardar el pago: si
   los dos números difirieran, manda el del servidor. */
let _metodos = null;
export async function metodosDePago({ forzar = false } = {}){
  if (_metodos && !forzar) return _metodos;
  const { data } = await sb.from('cem_metodos_pago')
    .select('*').eq('activo', true).order('orden');
  _metodos = data || [];
  return _metodos;
}

/**
 * El equivalente en euros de lo que alguien está escribiendo.
 * Devuelve `null` cuando falta la tasa: sin ella no se inventa un número.
 */
export function equivalenteEnBase(monto, metodo, tasas = {}) {
  const m = (_metodos || []).find(x => x.metodo === metodo);
  const v = Number(monto) || 0;
  if (!m || v <= 0) return null;
  if (m.regla === 'directo' || m.regla === 'uno_a_uno') {
    return { base: Math.round(v * 100) / 100, tasa: 1, moneda: m.moneda, regla: m.regla };
  }
  const t = Number(tasas[m.tasa_moneda]?.valor || tasas[m.tasa_moneda] || 0);
  if (!(t > 0)) return null;
  return { base: Math.round((v / t) * 100) / 100, tasa: t, moneda: m.moneda, regla: m.regla };
}

/** La frase que explica la conversión, en castellano y sin jerga. */
export function explicaConversion(monto, metodo, tasas = {}) {
  const r = equivalenteEnBase(monto, metodo, tasas);
  const m = (_metodos || []).find(x => x.metodo === metodo);
  if (!m) return '';
  if (!r) {
    return m.regla === 'tasa_bcv'
      ? `Falta cargar la tasa BCV del ${m.tasa_moneda === 'EUR' ? 'euro' : 'dólar'}: sin ella no se puede convertir.`
      : '';
  }
  if (r.regla === 'directo') return '';
  if (r.regla === 'uno_a_uno') {
    /* Decir «el efectivo en dólares» era heredado de cuando sólo el efectivo iba
       a la par; ahora también Zelle, PayPal y tarjeta, y quien paga con tarjeta
       leía una frase sobre efectivo.
       Y se dice lo que se ahorra. La paridad es una concesión de la escuela: si
       no se cuenta, el estudiante no se entera de que le están cobrando menos, y
       una ventaja que no se ve no convence a nadie. El cruce sale de las dos
       tasas del BCV, que esta pantalla ya tiene cargadas. */
    const eur = Number(tasas.EUR?.valor || tasas.EUR || 0);
    const usd = Number(tasas.USD?.valor || tasas.USD || 0);
    const cruce = usd > 0 ? eur / usd : 0;
    const ahorro = cruce > 1 ? r.base - (r.base / cruce) : 0;
    return `Salda ${money(r.base)} — los dólares se reciben a la par del euro.`
      + (ahorro >= 0.5 ? ` Al cambio real pagarías ${money(r.base / cruce)}: te ahorras ${money(ahorro)}.` : '');
  }
  return `Salda ${money(r.base)} a la tasa BCV del euro (${num(r.tasa)} Bs).`;
}

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
