/* El núcleo: lo poco que TODO necesita y que no debe arrastrar nada más.
   ═══════════════════════════════════════════════════════════════════════════
   `app.js` son cuatro mil líneas: cabecera, menús, temas, avisos, pagos,
   calendario. Está bien que las pantallas de la plataforma lo carguen entero,
   porque lo usan entero. Pero el asistente no: lo único que le hace falta es
   el cliente de la base, dos ayudas para escribir HTML y saber quién es la
   persona (si es alguien). Mientras eso vivía dentro de `app.js`, montar a Cemi
   en una página generada —la portada, el catálogo, contacto— obligaba a
   cargar las cuatro mil líneas, con sus efectos al arrancar, para pintar un
   botón. Y por eso Cemi no estaba justo en las páginas donde llega la gente
   desde Google.

   Esto es lo que se sacó. `app.js` lo importa de aquí y lo vuelve a exportar,
   así que para las 80 pantallas no cambia nada: siguen escribiendo
   `import { sb, esc } from './assets/app.js?v=2026-09-15'` y reciben LO MISMO —el mismo
   cliente, la misma caché del perfil—, porque un módulo se evalúa una sola
   vez por página. */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://vajbsfgojtunamhrzrpf.supabase.co';
/* La clave publicable. Es pública a propósito: lo que protege los datos son
   las funciones del servidor y las políticas de la base, no esconder esto. */
export const SUPABASE_KEY = 'sb_publishable_Xljd7Ep1GxBXSPp5F4A1hg_Qg-iESzl';
export const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ============ utilidades mínimas ============ */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ============ quién es la persona ============ */
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
/** Para cuando la persona cambia sus datos: la próxima vez se vuelve a pedir. */
export function olvidarPerfil() { _profile = null; }

/* ============ lo que el sitio sabe de la casa sin tener cuenta ============
   Los píxeles de analítica, el WhatsApp y el correo públicos, y el nombre y la
   cara del asistente. Sale por `cem_sitio_publico()`, que devuelve SÓLO eso
   —la tabla de ajustes guarda además cosas que no son para enseñar—, y se pide
   una vez por página aunque lo llamen varios. Si falla, se devuelve vacío y
   cada quien se queda con su valor de casa: una página nunca se rompe por esto. */
let sitioPublicoPromesa = null;
export function sitioPublico() {
  if (!sitioPublicoPromesa) {
    sitioPublicoPromesa = sb.rpc('cem_sitio_publico')
      .then(({ data }) => ({
        analitica: data?.analitica || {},
        contacto:  data?.contacto  || {},
        asistente: data?.asistente || {},
      }))
      .catch(() => ({ analitica: {}, contacto: {}, asistente: {} }));
  }
  return sitioPublicoPromesa;
}
