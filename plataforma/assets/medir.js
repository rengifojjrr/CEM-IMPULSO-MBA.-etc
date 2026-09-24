/* Medir y dejar que nos escriban: los píxeles y el botón de WhatsApp.
   ═══════════════════════════════════════════════════════════════════════════
   Hasta septiembre de 2026 el sitio no tenía ningún píxel conectado. Se sabía
   cuánta gente entraba (cem_visitas) pero no se podía ni medir una campaña de
   Instagram ni volver a enseñarle un anuncio a quien miró un programa y se
   fue. Y el WhatsApp del CEM no estaba en ninguna página pública.

   Este módulo no lleva nada escrito a mano: los identificadores y el número
   salen de Configuración (`analitica`, `contacto_publico`) por la función
   `cem_sitio_publico()`, así que el día que se peguen ahí, todas las páginas
   —las generadas y las de la plataforma— los cogen solas, sin tocar código ni
   esperar a la regeneración de la noche.

   Va SIN el cliente de Supabase a propósito: lo cargan la portada y las
   páginas de programa, donde cada kilobyte que se baja antes de pintar es un
   visitante que se va. Un `fetch` a la función pública basta.

     arrancarMedicion({ whatsapp })   pide la configuración, monta los píxeles
                                      y, si se pide, el botón de WhatsApp
     medir(evento, datos)             manda una conversión a los píxeles que
                                      haya (y a ninguno, si no hay ninguno)

   `medir` también queda en `window.cemMedir` para el código que no es módulo. */

const URL_BASE = 'https://vajbsfgojtunamhrzrpf.supabase.co';
const CLAVE = 'sb_publishable_Xljd7Ep1GxBXSPp5F4A1hg_Qg-iESzl';

let configuracion = null;
let pidiendo = null;

/** La configuración pública, una vez por página. Vacía si algo falla. */
export function configuracionPublica() {
  if (configuracion) return Promise.resolve(configuracion);
  if (pidiendo) return pidiendo;
  pidiendo = fetch(`${URL_BASE}/rest/v1/rpc/cem_sitio_publico`, {
    method: 'POST',
    headers: { apikey: CLAVE, Authorization: `Bearer ${CLAVE}`, 'Content-Type': 'application/json' },
    body: '{}',
  }).then(r => r.ok ? r.json() : null)
    .then(d => (configuracion = {
      analitica: d?.analitica || {}, contacto: d?.contacto || {}, asistente: d?.asistente || {} }))
    .catch(() => (configuracion = { analitica: {}, contacto: {}, asistente: {} }));
  return pidiendo;
}

/* ── los píxeles ─────────────────────────────────────────────────────────── */
/* Los identificadores se validan antes de meterlos en un <script>: los escribe
   el equipo desde Configuración, pero un error al pegar no puede convertirse
   en código que corre en la página de todo el mundo. */
const ID_GA4 = /^G-[A-Z0-9]{4,20}$/;
const ID_META = /^[0-9]{5,20}$/;

function montarGA4(id) {
  if (!ID_GA4.test(id) || window.__cemGA4) return;
  window.__cemGA4 = id;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', id, { anonymize_ip: true });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(s);
}

function montarMeta(id) {
  if (!ID_META.test(id) || window.__cemMeta) return;
  window.__cemMeta = id;
  if (!window.fbq) {
    const n = window.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!window._fbq) window._fbq = n;
    n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
  }
  window.fbq('init', id);
  window.fbq('track', 'PageView');
}

/* Un evento de la casa, dicho en el idioma de cada píxel. Los nombres de la
   izquierda son los que usa el código; los de la derecha, los que Google y
   Meta ya saben contar como conversión sin configurar nada. */
const TRADUCCION = {
  contacto:   { ga4: 'generate_lead',   meta: 'Lead' },
  avisame:    { ga4: 'generate_lead',   meta: 'Lead' },
  whatsapp:   { ga4: 'contact',         meta: 'Contact' },
  recurso:    { ga4: 'generate_lead',   meta: 'Lead' },
  promo:      { ga4: 'generate_lead',   meta: 'Lead' },
  inscribirme:{ ga4: 'begin_checkout',  meta: 'InitiateCheckout' },
  comprar:    { ga4: 'begin_checkout',  meta: 'InitiateCheckout' },
  pagado:     { ga4: 'purchase',        meta: 'Purchase' },
  registro:   { ga4: 'sign_up',         meta: 'CompleteRegistration' },
  verificar:  { ga4: 'verificar_certificado', meta: null },
  ver_programa:{ ga4: 'view_item',      meta: 'ViewContent' },
};

/**
 * Manda una conversión. Nunca lanza: si no hay píxeles, no pasa nada.
 * @param {string} evento  una clave de TRADUCCION (o un nombre libre para GA4)
 * @param {object} datos   lo que se quiera adjuntar: programa, valor, moneda…
 */
export function medir(evento, datos = {}) {
  try {
    const t = TRADUCCION[evento] || { ga4: String(evento).replace(/[^a-z0-9_]/gi, '_'), meta: null };
    if (window.__cemGA4 && typeof window.gtag === 'function') {
      window.gtag('event', t.ga4, { ...datos, evento_cem: evento });
    }
    if (window.__cemMeta && typeof window.fbq === 'function') {
      const carga = {};
      if (datos.programa) carga.content_name = datos.programa;
      if (datos.valor != null) { carga.value = datos.valor; carga.currency = datos.moneda || 'EUR'; }
      if (t.meta) window.fbq('track', t.meta, carga);
      else window.fbq('trackCustom', evento, carga);
    }
  } catch { /* medir nunca puede romper lo que se está midiendo */ }
}
window.cemMedir = medir;

/* ── el botón de WhatsApp ───────────────────────────────────────────────── */
export function numeroWhatsApp(cfg) {
  const crudo = String(cfg?.contacto?.whatsapp || '').replace(/[^0-9]/g, '');
  return crudo.length >= 8 && crudo.length <= 15 ? crudo : null;
}

/** El enlace a WhatsApp con el mensaje ya escrito, o null si no hay número. */
export function enlaceWhatsApp(cfg, programa = '') {
  const numero = numeroWhatsApp(cfg);
  if (!numero) return null;
  const texto = programa
    ? `Hola, vengo de escuelacem.com y quiero información sobre ${programa}.`
    : 'Hola, vengo de escuelacem.com y quiero información sobre los programas.';
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

function montarBotonWhatsApp(cfg, programa) {
  const href = enlaceWhatsApp(cfg, programa);
  if (!href || document.getElementById('cemWhatsApp')) return;
  const caja = document.createElement('div');
  caja.id = 'cemWhatsApp';
  caja.className = 'contacto-flotante whatsapp-flotante';
  const a = document.createElement('a');
  a.className = 'btn contacto-btn';
  a.href = href; a.target = '_blank'; a.rel = 'noopener';
  a.setAttribute('aria-label', 'Escribirnos por WhatsApp');
  a.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">chat</span>'
    + '<span class="contacto-txt">WhatsApp</span>';
  a.addEventListener('click', () => medir('whatsapp', { programa }));
  caja.appendChild(a);
  document.body.appendChild(caja);
}

/**
 * Arranca: pide la configuración, monta los píxeles que haya y, si se pide,
 * el botón de WhatsApp. Se puede llamar varias veces; sólo hace cada cosa una.
 * @param {{ whatsapp?: boolean, programa?: string }} opciones
 */
export async function arrancarMedicion({ whatsapp = false, programa = '' } = {}) {
  const cfg = await configuracionPublica();
  if (cfg.analitica.ga4) montarGA4(String(cfg.analitica.ga4).trim());
  if (cfg.analitica.meta) montarMeta(String(cfg.analitica.meta).trim());
  if (whatsapp) {
    const nombre = programa || document.querySelector('h1')?.textContent?.trim().slice(0, 80) || '';
    montarBotonWhatsApp(cfg, nombre);
  }
  return cfg;
}
