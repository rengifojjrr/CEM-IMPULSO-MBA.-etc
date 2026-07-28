// CEM · Runtime compartido por todas las páginas de la plataforma.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
export const fdatetime = (d) => d ? new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const initials = (a, b) => ((a || '?')[0] + (b ? b[0] : '')).toUpperCase();
export const qs = (k) => new URLSearchParams(location.search).get(k);
export const pct = (n) => `${Math.round(Number(n) || 0)}%`;

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
  $('[data-x]', bg).onclick = bg.close;
  bg.onclick = (e) => { if (e.target === bg) bg.close(); };
  document.body.appendChild(bg);
  return bg;
}

export function confirmDialog(msg, title = 'Confirmar') {
  return new Promise(res => {
    const m = modal({ title, body: `<p>${esc(msg)}</p>`,
      footer: `<button class="btn outline" data-no>Cancelar</button><button class="btn" data-si>Confirmar</button>` });
    $('[data-no]', m).onclick = () => { m.close(); res(false); };
    $('[data-si]', m).onclick = () => { m.close(); res(true); };
  });
}

/** Envuelve una llamada a Supabase mostrando el error si falla. */
export async function run(promise, errMsg = 'No se pudo completar la operación') {
  const { data, error } = await promise;
  if (error) { fail(`${errMsg}: ${error.message}`); throw error; }
  return data;
}

export async function audit(accion, entidad, entidad_id, riesgo = 'bajo', detalle = {}) {
  try {
    const p = await profile();
    await sb.from('cem_audit_events').insert({
      actor_id: p?.id, actor_email: p?.email, accion, entidad, entidad_id, riesgo, detalle
    });
  } catch { /* la auditoría nunca debe romper el flujo */ }
}

/* ============ sesión y perfil ============ */
let _profile = null;
export async function profile() {
  if (_profile) return _profile;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return null;
  const { data } = await sb.rpc('cem_my_profile');
  _profile = Array.isArray(data) ? data[0] : data;
  return _profile;
}
export async function logout() { await sb.auth.signOut(); location.href = base() + 'index.html'; }

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
  ]},
  { lbl: 'Evaluación', items: [
    ['evaluaciones.html', 'quiz', 'Evaluaciones'],
    ['preguntas.html', 'help_center', 'Banco de preguntas'],
    ['calificar.html', 'grade', 'Calificar'],
    ['apelaciones.html', 'gavel', 'Apelaciones'],
  ]},
  { lbl: 'Credenciales', items: [
    ['certificados.html', 'workspace_premium', 'Certificados'],
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
    ['configuracion.html', 'settings', 'Configuración'],
  ]},
];
const STUDENT_NAV = [
  ['panel.html', 'space_dashboard', 'Mi panel'],
  ['catalogo.html', 'menu_book', 'Catálogo'],
  ['biblioteca.html', 'local_library', 'Biblioteca'],
  ['certificados.html', 'workspace_premium', 'Certificados'],
];
const TEACHER_NAV = [
  ['panel.html', 'space_dashboard', 'Mi panel'],
];

const ROLES_STAFF = ['coordinador', 'admin', 'superadmin'];

/**
 * Punto de entrada de cada página.
 * @param {{require?:string[], active?:string, title?:string, area?:'admin'|'estudiante'|'docente', pub?:boolean}} opts
 */
export async function mount(opts = {}) {
  const p = await profile();
  const area = opts.area || 'admin';

  if (opts.pub) { renderPublicHeader(p); return p; }

  if (!p) { location.href = base() + 'index.html?next=' + encodeURIComponent(location.pathname.split('/').slice(-2).join('/')); return null; }
  if (!p.activo) { document.body.innerHTML = '<div class="auth-wrap"><div class="auth-card"><h1>Cuenta desactivada</h1><p class="sub">Contacta al administrador.</p></div></div>'; return null; }
  if (opts.require && !opts.require.includes(p.rol)) {
    document.body.innerHTML = `<div class="auth-wrap"><div class="auth-card">
      <div class="brand-badge"><span class="material-symbols-outlined">lock</span></div>
      <h1>Sin acceso</h1><p class="sub">Tu rol (<b>${esc(p.rol)}</b>) no tiene permiso para esta página.</p>
      <a class="btn block" href="${homeFor(p.rol)}">Ir a mi inicio</a></div></div>`;
    return null;
  }
  renderShell(p, area, opts.active);
  return p;
}

export function homeFor(rol) {
  if (rol === 'estudiante') return '../estudiante/panel.html';
  if (rol === 'profesor') return '../docente/panel.html';
  return '../admin/index.html';
}
export function homeForRoot(rol) {
  if (rol === 'estudiante') return 'estudiante/panel.html';
  if (rol === 'profesor') return 'docente/panel.html';
  return 'admin/index.html';
}

function renderShell(p, area, active) {
  const nav = area === 'admin' ? ADMIN_NAV : area === 'docente' ? [{ lbl: '', items: TEACHER_NAV }] : [{ lbl: '', items: STUDENT_NAV }];
  const flat = nav.flatMap(g => g.items);
  const areaLabel = area === 'admin' ? 'Portal institucional' : area === 'docente' ? 'Portal docente' : 'Portal del estudiante';

  const sideHtml = nav.map(g => `
    <div class="nav-group">
      ${g.lbl ? `<div class="lbl">${g.lbl}</div>` : ''}
      ${g.items.map(([href, ic, txt]) => `
        <a class="nav-item ${active === href ? 'active' : ''}" href="${href}">
          <span class="material-symbols-outlined">${ic}</span><span>${txt}</span></a>`).join('')}
    </div>`).join('');

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
        <div class="who"><b>${esc(p.nombre)} ${esc(p.apellido || '')}</b>${esc(p.rol)}</div>
        <button class="btn outline sm block" id="cemLogout">
          <span class="material-symbols-outlined">logout</span> Cerrar sesión</button>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="menu-btn icon-btn" id="cemMenu"><span class="material-symbols-outlined">menu</span></button>
        <div class="search"><span class="material-symbols-outlined">search</span>
          <input type="search" id="cemGlobalSearch" placeholder="Buscar estudiantes, cursos, cohortes…"></div>
        <div class="spacer"></div>
        <button class="icon-btn" title="Notificaciones"><span class="material-symbols-outlined">notifications</span></button>
        <div class="avatar" title="${esc(p.email)}">${initials(p.nombre, p.apellido)}</div>
      </header>
      <main class="content" id="cemContent"></main>
    </div>
    <nav class="bottomnav">
      ${flat.slice(0, 6).map(([href, ic, txt]) => `
        <a class="${active === href ? 'active' : ''}" href="${href}">
          <span class="material-symbols-outlined">${ic}</span>${txt}</a>`).join('')}
    </nav>`;

  const page = $('#page');
  document.body.insertBefore(shell, document.body.firstChild);
  if (page) { $('#cemContent', shell).appendChild(page); page.classList.remove('hidden'); }

  $('#cemLogout').onclick = logout;
  const sidebar = $('#cemSidebar');
  $('#cemMenu').onclick = () => {
    sidebar.classList.add('open');
    const sc = document.createElement('div');
    sc.className = 'scrim';
    sc.onclick = () => { sidebar.classList.remove('open'); sc.remove(); };
    document.body.appendChild(sc);
  };
  const gs = $('#cemGlobalSearch');
  if (gs) gs.addEventListener('keydown', e => {
    if (e.key === 'Enter' && gs.value.trim()) {
      const dest = area === 'admin' ? 'estudiantes.html' : 'catalogo.html';
      location.href = `${dest}?q=${encodeURIComponent(gs.value.trim())}`;
    }
  });
}

function renderPublicHeader(p) {
  const h = document.createElement('header');
  h.className = 'pub-header';
  h.innerHTML = `<div class="pub-inner">
    <a href="catalogo.html" style="display:flex;align-items:center;gap:9px;font-weight:700;color:var(--primary)">
      <span class="material-symbols-outlined">account_balance</span> CEM International</a>
    <nav>
      <a href="catalogo.html">Cursos</a>
      <a href="catalogo.html?tipo=programa">Programas</a>
      <a href="../verificar.html">Verificar certificado</a>
    </nav>
    <div style="margin-left:auto;display:flex;gap:8px;align-items:center">
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
export function kpi(label, value, icon, sub = '', cls = '') {
  return `<div class="kpi"><div class="k-top"><span>${esc(label)}</span>
    <span class="material-symbols-outlined">${icon}</span></div>
    <div class="k-val">${value}</div>${sub ? `<div class="k-sub ${cls}">${esc(sub)}</div>` : ''}</div>`;
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
export function emptyRow(cols, msg = 'Sin resultados.') {
  return `<tr><td colspan="${cols}"><div class="empty">${esc(msg)}</div></td></tr>`;
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
