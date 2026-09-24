/* La promoción, en grande y donde llega la gente.
   ═══════════════════════════════════════════════════════════════════════════
   Hasta el 24 de septiembre de 2026 la promoción era una pastilla pequeña en
   una esquina, y además:

     · sólo salía en cuatro pantallas del portal (inicio, catálogo, ficha del
       curso y quiénes somos). En la portada de escuelacem.com, en Programas y
       en Contacto —las páginas que lee Google y donde cae la gente— no había
       nada;
     · se escondía a quien tuviera sesión, así que el equipo, que entra
       siempre con su cuenta, no la veía nunca. «Creamos promociones y ni
       siquiera se ven» era literalmente cierto;
     · cerrada una vez, desaparecía una semana, también para la campaña
       siguiente.

   Ahora es una franja debajo de la cabecera, como las que se ven en las
   páginas de precios de cualquier servicio: la cinta rayada con el descuento,
   el titular grande a dos tonos, y una cuenta atrás.

   LA CUENTA ATRÁS ES DE VERDAD. Cuenta hasta la fecha de fin que el equipo
   puso en la campaña, la misma para todo el mundo. Nada de relojes que se
   reinician a los diez minutos para cada visitante: eso se descubre en la
   segunda visita, y a partir de ahí no se cree ningún otro dato de la página.
   Si la campaña no tiene fecha de fin, no hay reloj.

   Va sin el cliente de Supabase, igual que medir.js: la cargan la portada y
   las páginas de programa, donde cada kilobyte cuenta. Un `fetch` basta.

     montarPromocion({ pantalla })   pregunta si hay campaña para esa pantalla
                                     y, si la hay, pinta la franja
     franja(c, { previa })           la franja de una campaña, como elemento;
                                     la usa también la vista previa de Campañas

   `?promo=ver` en la dirección la enseña aunque se haya cerrado: es como el
   equipo comprueba que está en la web. */
import { medir } from './medir.js?v=2026-09-24';

const URL_BASE = 'https://vajbsfgojtunamhrzrpf.supabase.co';
const CLAVE = 'sb_publishable_Xljd7Ep1GxBXSPp5F4A1hg_Qg-iESzl';
/* El portal, relativo a este archivo: vale igual desde la raíz que desde
   /programas/ o desde el propio portal. */
const PORTAL = new URL('../', import.meta.url).href;
/* Cerrada, se respeta tres días, y por campaña: quien dijo que no a ésta
   merece ver la siguiente. */
const DIAS_CERRADA = 3;
const llave = (codigo) => `cemPromoCerrada:${codigo}`;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dos = (n) => String(n).padStart(2, '0');
/* 10 y no 10.00; 12,5 con coma, como se escribe aquí. Y «10%» pegado, como
   lo escribe el equipo en los titulares: en una misma franja, «10 %» en la
   cinta y «10% OFF» en el titular se lee como un descuido. */
const cifra = (v) => String(Number(v)).replace('.', ',');

async function rpc(nombre, cuerpo) {
  const r = await fetch(`${URL_BASE}/rest/v1/rpc/${nombre}`, {
    method: 'POST',
    headers: { apikey: CLAVE, Authorization: `Bearer ${CLAVE}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.message || 'No se pudo completar. Inténtalo otra vez.');
  return j;
}

/* ¿Hay alguien con sesión en este navegador? No hace falta saber quién: sólo
   si el código que consiga se puede ver ya en «Mis cupones». */
function haySesion() {
  try { return Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k)); }
  catch { return false; }
}

/* Palabras con las que un titular ya dice a qué se aplica. */
const YA_DICE_DONDE = /\b(en|para|del?|programas?|diplomados?|cursos?|m[oó]dulos?)\b/i;

/** Lo que dice cada pieza, a partir de la campaña. */
function textos(c) {
  const v = c.premio_valor != null && c.premio_valor !== '' ? cifra(c.premio_valor) : null;
  const esDescuento = c.premio_tipo === 'descuento' || c.premio_tipo === 'descuento_fijo';
  const titular = (c.titular || '').trim();
  const premio = c.premio_tipo === 'descuento' && v ? `${v}% de descuento`
    : c.premio_tipo === 'descuento_fijo' && v ? `${v} de descuento`
    : (c.premio_texto || (c.premio_tipo === 'sorteo' ? 'Entrada a un sorteo' : 'Un regalo'));
  return {
    premio,
    cinta: c.premio_tipo === 'descuento' && v ? `${v}% de descuento` : premio,
    sello: c.premio_tipo === 'descuento' && v ? `Especial ${v}% OFF`
      : c.premio_tipo === 'descuento_fijo' ? 'Descuento especial'
      : c.premio_tipo === 'sorteo' ? 'Sorteo' : 'Regalo',
    insignia: c.premio_tipo === 'descuento' && v ? `${v}% off` : null,
    /* La primera línea es lo que el equipo escribió; la segunda, a qué se
       aplica. «En todos los programas» sólo si es un descuento sin programa:
       un regalo concreto no se aplica «a todos». */
    l1: titular || premio,
    /* Y sólo si el titular no lo dice ya: «15 % en tu primer diplomado» con
       «en todos los programas» debajo se contradice. */
    l2: esDescuento && !YA_DICE_DONDE.test(titular)
      ? (c.programa ? `en ${c.programa}` : 'en todos los programas') : '',
    limite: c.termina_en ? 'Oferta limitada' : c.quedan != null ? 'Plazas limitadas' : '',
  };
}

/** El tiempo que falta, en días, horas, minutos y segundos. */
function falta(fin) {
  let s = Math.max(0, Math.floor((fin - Date.now()) / 1000));
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  return { d, h, m, s };
}

function fechaLarga(iso) {
  try {
    return new Date(iso).toLocaleDateString('es-VE',
      { weekday: 'long', day: 'numeric', month: 'long' });
  } catch { return ''; }
}

function relojHTML(c, t) {
  const fin = c.termina_en ? new Date(c.termina_en) : null;
  const plazas = c.quedan != null
    ? `<p class="pf-reloj-pie"><b>Quedan ${esc(c.quedan)}</b> ${c.quedan === 1 ? 'plaza' : 'plazas'}</p>` : '';
  if (!fin) {
    /* Sin fecha de fin, el reloj no tiene nada que contar. Si hay cupo, lo
       que se cuenta son las plazas; si tampoco, no hay tarjeta. */
    if (c.quedan == null) return '';
    return `<div class="pf-reloj">
      ${t.insignia ? `<span class="pf-reloj-insignia">${esc(t.insignia)}</span>` : ''}
      <p class="pf-reloj-tit"><span class="material-symbols-outlined" aria-hidden="true">group</span>${/^descuento/.test(c.premio_tipo || '') ? 'Plazas con descuento' : 'Plazas disponibles'}</p>
      <div class="pf-cajas"><div class="pf-caja"><b>${esc(c.quedan)}</b>
        <span>${c.quedan === 1 ? 'queda' : 'quedan'}</span></div></div>
    </div>`;
  }
  const q = falta(fin);
  const caja = (u, n, nombre) => `<div class="pf-caja" data-u="${u}"><b>${dos(n)}</b><span>${nombre}</span></div>`;
  return `<div class="pf-reloj" role="group" aria-label="La oferta termina el ${esc(fechaLarga(fin))}">
    ${t.insignia ? `<span class="pf-reloj-insignia" aria-hidden="true">${esc(t.insignia)}</span>` : ''}
    <p class="pf-reloj-tit" aria-hidden="true"><span class="material-symbols-outlined">hourglass_top</span>La oferta termina en</p>
    <div class="pf-cajas" aria-hidden="true">
      ${q.d > 0 ? caja('d', q.d, q.d === 1 ? 'día' : 'días') : ''}
      ${caja('h', q.h, 'horas')}${caja('m', q.m, 'minutos')}${caja('s', q.s, 'segundos')}
    </div>
    <p class="pf-reloj-pie">Hasta el ${esc(fechaLarga(fin))}</p>
    ${plazas}
  </div>`;
}

/**
 * La franja de una campaña. Devuelve el elemento, sin meterlo en la página.
 * @param {object} c  lo que devuelve cem_campana_para (o el formulario de Campañas)
 * @param {{ previa?: boolean, pantalla?: string }} op
 */
export function franja(c, { previa = false, pantalla = '' } = {}) {
  const t = textos(c);
  const sec = document.createElement('section');
  sec.className = 'promo-franja' + (previa ? ' es-previa' : '');
  if (!previa) sec.id = 'cemPromo';
  sec.setAttribute('aria-label', 'Promoción');
  sec.innerHTML = `
    <div class="pf-cinta">
      <span class="pf-cinta-tag"><span class="material-symbols-outlined" aria-hidden="true">sell</span>${esc(t.cinta)}</span>
      ${t.limite ? `<span class="pf-cinta-limite">${esc(t.limite)}</span>` : ''}
      <button type="button" class="pf-x" aria-label="Cerrar la promoción" ${previa ? 'tabindex="-1"' : ''}>
        <span class="material-symbols-outlined" aria-hidden="true">close</span></button>
    </div>
    <div class="pf-cuerpo">
      <div class="pf-texto">
        <span class="pf-sello"><span class="material-symbols-outlined" aria-hidden="true">sell</span>${esc(t.sello)}</span>
        <p class="pf-titular"><span class="pf-l1">${esc(t.l1)}</span>${t.l2 ? `<span class="pf-l2">${esc(t.l2)}</span>` : ''}</p>
        ${c.explicacion ? `<p class="pf-linea">${esc(c.explicacion)}</p>` : ''}
        <div class="pf-accion">
          <button type="button" class="pf-btn" ${previa ? 'tabindex="-1"' : ''}>
            <span class="material-symbols-outlined" aria-hidden="true">redeem</span>${esc(c.boton || 'Lo quiero')}</button>
          <form class="pf-forma" hidden novalidate>
            <input type="email" name="correo" required autocomplete="email"
              placeholder="Tu correo" aria-label="Tu correo">
            <button type="submit" class="pf-btn">${esc(c.boton || 'Lo quiero')}</button>
            <p class="pf-error" role="alert" hidden></p>
          </form>
          <p class="pf-pie">Te mandamos el código por correo. No lo usamos para nada más.</p>
        </div>
      </div>
      ${relojHTML(c, t)}
    </div>`;

  arrancarReloj(sec, c);
  if (previa) return sec;

  const forma = sec.querySelector('.pf-forma');
  const abrir = sec.querySelector('.pf-accion > .pf-btn');
  abrir.onclick = () => {
    abrir.hidden = true;
    forma.hidden = false;
    forma.querySelector('input').focus();
  };
  sec.querySelector('.pf-x').onclick = () => {
    try { localStorage.setItem(llave(c.codigo), JSON.stringify({ cuando: Date.now() })); } catch {}
    sec.remove();
  };
  forma.onsubmit = (e) => pedir(e, sec, c, pantalla);
  return sec;
}

/* El reloj late cada segundo mientras la franja esté en la página. Cuando
   llega a cero, la oferta ya no existe: la franja se va en vez de quedarse
   enseñando ceros, que es peor que no enseñar nada. */
function arrancarReloj(sec, c) {
  if (!c.termina_en) return;
  const fin = new Date(c.termina_en);
  if (Number.isNaN(fin.getTime())) return;
  let conDias = falta(fin).d > 0;
  const id = setInterval(() => {
    if (!sec.isConnected) { clearInterval(id); return; }
    const q = falta(fin);
    if (fin - Date.now() <= 0) {
      clearInterval(id);
      if (!sec.classList.contains('es-previa')) sec.remove();
      return;
    }
    /* Al pasar de «1 día» a «0 días» cambia el número de cajas: se repinta
       el reloj entero en vez de dejar una caja de días con 00. */
    if (conDias !== q.d > 0) {
      conDias = q.d > 0;
      const reloj = sec.querySelector('.pf-reloj');
      if (reloj) reloj.outerHTML = relojHTML(c, textos(c));
      return;
    }
    for (const [u, n] of [['d', q.d], ['h', q.h], ['m', q.m], ['s', q.s]]) {
      const b = sec.querySelector(`.pf-caja[data-u="${u}"] b`);
      if (b) b.textContent = dos(n);
    }
    const nombreDias = sec.querySelector('.pf-caja[data-u="d"] span');
    if (nombreDias) nombreDias.textContent = q.d === 1 ? 'día' : 'días';
  }, 1000);
}

async function pedir(e, sec, c, pantalla) {
  e.preventDefault();
  const forma = e.target;
  const input = forma.querySelector('input');
  const boton = forma.querySelector('button[type="submit"]');
  const error = forma.querySelector('.pf-error');
  const correo = input.value.trim();
  error.hidden = true;
  if (!input.checkValidity()) {
    error.textContent = 'Escribe un correo válido: es a donde te mandamos el código.';
    error.hidden = false;
    input.focus();
    return;
  }
  boton.disabled = true;
  let data;
  try {
    const ref = new URLSearchParams(location.search).get('ref');
    data = await rpc('cem_campana_pedir', {
      p_codigo: c.codigo, p_email: correo,
      p_referido: ref || null, p_origen: `promo:${pantalla || 'web'}`,
    });
  } catch (err) {
    boton.disabled = false;
    error.textContent = err.message;
    error.hidden = false;
    return;
  }
  medir('promo', { campana: c.codigo });

  /* Un correo, un código, y decirlo cuando se repite: enseñar «tu código» sin
     más a quien lo pide por segunda vez le hace creer que ahora tiene dos. */
  const sesion = haySesion();
  const accion = sec.querySelector('.pf-accion');
  accion.innerHTML = `
    <div class="pf-hecho" role="status">
      <p class="pf-hecho-tit"><span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
        ${data.repetido ? 'Ya tenías tu código' : '¡Listo! Éste es tuyo'}</p>
      <p class="pf-linea">${data.repetido
        ? 'Con este correo ya lo pediste, así que es el mismo de antes: es uno por persona.'
        : esc(data.gracias || 'Guárdalo: se usa una sola vez.')}</p>
      <div class="pf-codigo-caja">
        <code class="pf-codigo">${esc(data.codigo)}</code>
        <button type="button" class="pf-copiar">
          <span class="material-symbols-outlined" aria-hidden="true">content_copy</span>Copiar</button>
      </div>
      ${data.caduca_en ? `<p class="pf-pie">Vale hasta el ${esc(fechaLarga(data.caduca_en))}.</p>` : ''}
      ${sesion
        ? `<a class="pf-enlace" href="${PORTAL}estudiante/cupones.html">
             <span class="material-symbols-outlined" aria-hidden="true">confirmation_number</span>Verlo en Mis cupones</a>`
        /* Quien acaba de dar su correo por un código está más dispuesto que
           nunca a terminar el registro. Con cuenta, el código queda guardado
           en «Mis cupones» el día que decida inscribirse. */
        : `<a class="pf-enlace" href="${PORTAL}index.html?registro=1&correo=${encodeURIComponent(correo)}">
             <span class="material-symbols-outlined" aria-hidden="true">bookmark_added</span>Guardarlo en mi cuenta</a>`}
    </div>`;
  const copiar = accion.querySelector('.pf-copiar');
  copiar.onclick = async () => {
    try {
      await navigator.clipboard.writeText(data.codigo);
      copiar.lastChild.textContent = 'Copiado';
    } catch {
      copiar.lastChild.textContent = 'Cópialo a mano';
    }
  };
}

/**
 * Pregunta si hay campaña para esta pantalla y, si la hay, pinta la franja
 * debajo de la cabecera. Nunca lanza: una promoción que no sale no puede
 * romper la página.
 * @param {{ pantalla: string }} op  la clave de «Dónde sale» de Campañas
 */
export async function montarPromocion({ pantalla } = {}) {
  try {
    if (!pantalla || document.getElementById('cemPromo')) return;
    const c = await rpc('cem_campana_para', { p_pantalla: pantalla });
    if (!c || !c.codigo) return;

    const forzada = new URLSearchParams(location.search).get('promo') === 'ver';
    if (!forzada) {
      try {
        const cerrada = JSON.parse(localStorage.getItem(llave(c.codigo)) || 'null');
        if (cerrada && Date.now() - cerrada.cuando < DIAS_CERRADA * 86400 * 1000) return;
      } catch { /* navegación privada: se enseña */ }
    }

    const sec = franja(c, { pantalla });
    const cabecera = document.querySelector('.pub-header');
    if (cabecera) cabecera.after(sec); else document.body.prepend(sec);
  } catch { /* sin promoción, la página sigue igual */ }
}
