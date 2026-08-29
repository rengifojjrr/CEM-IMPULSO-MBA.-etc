/* El puente de WhatsApp del CEM.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * QUÉ ES Y QUÉ NO ES
 * ---------------------------------------------------------------------------
 * Esto es un cable, no un cerebro. Se enlaza con un número de WhatsApp
 * escaneando un QR, y cada mensaje que llega se lo pasa a la función
 * `cem-whatsapp`, que es la que piensa. La respuesta —si la hay— la manda de
 * vuelta por WhatsApp.
 *
 * Aquí NO hay guion del asistente, ni claves de modelo, ni acceso a la base de
 * datos. A propósito: esto corre en una máquina que no controlamos del todo, y
 * lo único que sabe es el secreto del puente. Si esta máquina se pierde, se
 * cambia ese secreto y no se ha filtrado nada más.
 *
 * LOS DOS MODOS
 * ---------------------------------------------------------------------------
 *   escucha   — anota lo que pregunta la gente y NO contesta nada.
 *   responde  — anota y contesta.
 *
 * Empieza en «escucha», y eso no es prudencia decorativa: así el asistente
 * aprende de las preguntas reales desde el primer día mientras el equipo sigue
 * contestando a mano, y cuando se encienda ya sabrá de qué se le habla.
 *
 * LO QUE EL MANUAL AVISA Y AQUÍ SE RESPETA
 * ---------------------------------------------------------------------------
 * · La máquina no se puede dormir. Se midieron 312 reconexiones en un día y
 *   1 h 46 min de caída en plena hora de venta por un portátil que se
 *   suspendía. Esto va en un servidor encendido, no en un escritorio.
 * · La carpeta `auth/` se corrompe («Bad MAC»). Cuando pasa, se borra y se
 *   vuelve a escanear: se pierde la sesión, no los datos.
 * · Si contesta a un grupo, o se contesta a sí mismo, hace el ridículo en
 *   público. Los dos casos están cortados abajo.
 *
 * SE ARRANCA ASÍ
 * ---------------------------------------------------------------------------
 *   cp .env.ejemplo .env     y se rellena
 *   npm install
 *   node index.mjs --vincular-con 584121234567   ← da un código de 8 caracteres
 *   npx pm2 start index.mjs --name cem-puente    ← y ya queda vinculado
 *
 * El QR sigue estando (en la terminal y en /qr) para quien esté delante de la
 * máquina. A distancia no sirve: caduca en veinte segundos.
 */

import { readFileSync, existsSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
/* Importación con nombre, no destructurando el `default`.
   ─────────────────────────────────────────────────────────────────────────
   Aquí ponía `import baileys from …` y luego sacaba las cuatro funciones de
   dentro. Dejó de funcionar sin que nadie tocara nada: el rango ^6.7.9 trajo
   la 6.7.24, donde el `default` es el propio makeWASocket y ya no lleva nada
   dentro. El puente moría al arrancar con «useMultiFileAuthState is not a
   function», que no dice ni de lejos que el problema sea ese.

   Con nombre es la forma documentada y la que no cambia. Y además se subió el
   package-lock.json: así lo que se instala en el servidor es exactamente lo que
   se probó, en vez de lo que hubiera salido ese día. El rango del package.json
   se deja abierto igualmente —WhatsApp cambia su protocolo y un Baileys viejo
   deja de conectar— pero actualizar pasa a ser una decisión (`npm update`), no
   una sorpresa en el primer arranque. */
import makeWASocket, {
  useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import qr from 'qrcode-terminal';
import QR from 'qrcode';

const crearSocket = makeWASocket;

/* Y si aun así vuelve a cambiar, que lo diga con todas las letras en vez de
   reventar a mitad con un error que manda a mirar donde no es. */
for (const [nombre, cosa] of Object.entries({
  makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion,
})) {
  if (typeof cosa !== 'function') {
    console.error(`\nBaileys cambió de forma: ya no exporta ${nombre} como función.`
      + `\nEs lo que pasó con la 6.7.24. Mira los ejemplos de la versión instalada`
      + `\n(node_modules/@whiskeysockets/baileys) y ajusta los imports de arriba.\n`);
    process.exit(1);
  }
}

/* ── Dónde está todo ──────────────────────────────────────────────────────── */
/* Junto al archivo, NO en el directorio desde el que se arrancó. Con rutas
   relativas al cwd, un `pm2 start puente-whatsapp/index.mjs` desde la raíz del
   repositorio no encuentra el .env —y eso al menos falla ruidoso— pero además
   crea la carpeta auth/ en otro sitio: la sesión de WhatsApp se «pierde» en
   cada arranque y pide QR otra vez sin que nada explique por qué. */
const AQUI = dirname(fileURLToPath(import.meta.url));
const junto = (p) => (isAbsolute(p) ? p : join(AQUI, p));

/* ── Configuración ────────────────────────────────────────────────────────── */
/* Se lee de .env sin librería: son cinco valores y una dependencia menos es
   una cosa menos que actualizar en una máquina a la que nadie va a entrar. */
const ARCHIVO_ENV = junto('.env');
if (existsSync(ARCHIVO_ENV)) {
  for (const linea of readFileSync(ARCHIVO_ENV, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const CEREBRO = process.env.CEM_CEREBRO_URL
  || 'https://vajbsfgojtunamhrzrpf.supabase.co/functions/v1/cem-whatsapp';
const SECRETO = process.env.CEM_PUENTE_SECRETO || '';
const MODO = (process.env.CEM_PUENTE_MODO || 'escucha').trim();
const PUERTO = Number(process.env.CEM_PUENTE_PUERTO || 3000);
const CARPETA_AUTH = junto(process.env.CEM_PUENTE_AUTH || './auth');

/* ── Vincular con un código en vez de con el QR ───────────────────────────
   El QR de WhatsApp caduca en unos veinte segundos. Eso está bien delante de
   la máquina, y no sirve de nada cuando quien la monta no está sentado en
   ella: para cuando la imagen llega por chat o por correo, ya caducó.

   WhatsApp tiene la otra vía: un código de ocho caracteres que se teclea en
   el teléfono, y que dura minutos en vez de segundos. Se pide así, con el
   número del negocio y su código de país, sin signos:

     node index.mjs --vincular-con 584121234567

   El código sale en pantalla. En el teléfono: WhatsApp → Dispositivos
   vinculados → Vincular dispositivo → **Vincular con número de teléfono**.

   Sólo hace falta la primera vez. Después la sesión vive en auth/ y el puente
   reconecta solo. */
const iVincular = process.argv.indexOf('--vincular-con');
const NUMERO_A_VINCULAR = iVincular > -1
  ? String(process.argv[iVincular + 1] ?? '').replace(/[^0-9]/g, '')
  : '';
if (iVincular > -1 && NUMERO_A_VINCULAR.length < 8) {
  console.error('\n--vincular-con necesita el número con código de país y sin signos.'
    + '\nPor ejemplo:  node index.mjs --vincular-con 584121234567\n');
  process.exit(1);
}

if (!SECRETO) {
  console.error(`
No hay CEM_PUENTE_SECRETO.

Sin él la función del cerebro rechaza la llamada, así que el puente se
conectaría a WhatsApp y no serviría para nada — que es peor que no arrancar,
porque parece que funciona.

Se inventa una frase larga cualquiera y se pone en LOS DOS sitios:
  · aquí, en el archivo .env
  · en Supabase → Edge Functions → Secrets, con el mismo nombre
`);
  process.exit(1);
}
if (!['escucha', 'responde'].includes(MODO)) {
  console.error(`CEM_PUENTE_MODO tiene que ser "escucha" o "responde", no "${MODO}".`);
  process.exit(1);
}

const ahora = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
const log = (...a) => console.log(ahora(), ...a);

/* ── Estado, para la página de salud ──────────────────────────────────────── */
const arrancadoISO = new Date().toISOString();
const VERSION = '1.1.0';

const estado = {
  conectado: false, numero: null, qr: null, codigo: null, secreto: 'sin comprobar',
  desde: ahora(), mensajes: 0, respondidos: 0, fallos: 0, ultimo: null,
  ultimo_latido: null,
};

/* ── Hablar con el cerebro ────────────────────────────────────────────────── */
async function preguntarAlCerebro(telefono, texto) {
  const r = await fetch(CEREBRO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cem-puente': SECRETO },
    body: JSON.stringify({ telefono, texto, modo: MODO }),
  });
  if (!r.ok) throw new Error(`el cerebro respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

/* ── El latido ────────────────────────────────────────────────────────────
   «Sigo vivo», cada dos minutos. Sin esto, que esta máquina se apague no lo
   nota nadie: el número deja de contestar Y de anotar, y la primera señal es
   un cliente quejándose días después.

   Con esto, la base avisa al equipo a los quince minutos de silencio, y en la
   plataforma se ve si está conectado sin entrar aquí a mirar. Importa
   especialmente mientras esto corra en una máquina de casa y no en un
   servidor.

   Los fallos se anotan y no se gritan: perder un latido porque se cayó el wifi
   diez segundos es normal, y llenar el registro de eso esconde lo que sí
   importa. Quien decide que hay una caída es la base, contando el silencio. */
const LATIDO_CADA = 2 * 60 * 1000;
let quejaDeLatido = 0;

async function mandarLatido() {
  try {
    const r = await fetch(CEREBRO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cem-puente': SECRETO },
      body: JSON.stringify({
        latido: true,
        estado: {
          conectado: estado.conectado,
          numero: estado.numero,
          modo: MODO,
          version: VERSION,
          arrancado: arrancadoISO,
          mensajes: estado.mensajes,
          respondidos: estado.respondidos,
          fallos: estado.fallos,
        },
      }),
    });
    if (!r.ok) throw new Error(`el cerebro respondió ${r.status}`);
    estado.ultimo_latido = ahora();
    quejaDeLatido = 0;

    const respuesta = await r.json().catch(() => ({}));
    if (Array.isArray(respuesta?.mandar) && respuesta.mandar.length) {
      await repartir(respuesta.mandar);
    }
  } catch (e) {
    // Una queja cada diez intentos fallidos: ni silencio total ni un renglón
    // cada dos minutos durante toda la noche.
    if (quejaDeLatido++ % 10 === 0) {
      log('!! no se pudo mandar el latido:', String(e).slice(0, 120));
    }
  }
}

/* ── Lo que la plataforma quiere decir ────────────────────────────────────
   Verónica sabía contestar y no sabía avisar. Ahora la plataforma deja en una
   cola lo que quiere mandar —el recordatorio de una clase, por ejemplo— y
   vuelve en la respuesta del latido, sin un segundo viaje y sin abrir ningún
   puerto hacia esta máquina, que es de casa.

   Tres cuidados, y los tres tienen su motivo:

     · En serie y con pausa. WhatsApp corta los números que disparan ráfagas, y
       perder el número es perder el canal entero, no un mensaje.
     · Sólo si está conectada. Mandar con la sesión caída no da error: se queda
       encolado dentro de Baileys y sale más tarde, cuando ya no viene a cuento.
     · Un fallo no para los demás. Se anota y se sigue.

   Lo que NO hace, a propósito: reintentar. La base ya marcó el mensaje como
   entregado al dárselo; si esta máquina se cae justo aquí se pierde un aviso.
   Es preferible a la otra opción —marcar después—, que con un puente que se
   reinicia manda el mismo mensaje tres veces, y eso sí lo nota quien lo
   recibe. */
const PAUSA_ENTRE_AVISOS = 4000;

async function repartir(mensajes) {
  if (!estado.conectado || !sockActual) {
    log(`~~ ${mensajes.length} aviso(s) pendientes, pero la sesión no está conectada.`);
    return;
  }
  let bien = 0;
  for (const m of mensajes) {
    const numero = String(m?.telefono ?? '').replace(/\D/g, '');
    const texto = String(m?.texto ?? '').trim();
    if (!numero || !texto) continue;
    try {
      await sockActual.sendMessage(`${numero}@s.whatsapp.net`, { text: texto });
      bien++;
    } catch (e) {
      log(`!! no se pudo avisar a +${numero}:`, String(e).slice(0, 120));
    }
    await new Promise((r) => setTimeout(r, PAUSA_ENTRE_AVISOS));
  }
  if (bien) log(`→  ${bien} aviso(s) mandados desde la plataforma.`);
}

/* ── ¿Coincide el secreto? Se comprueba al arrancar, no al primer cliente ──
   Es la avería más común de montar esto: el puente se conecta, todo parece
   bien, y no anota nada porque el secreto de aquí y el de Supabase no son el
   mismo. Sin esta comprobación lo descubre el primero que escriba al número.

   Se manda el cuerpo vacío a propósito: con el secreto bueno la función
   contesta 400 («falta telefono o texto») y con el malo 403. Así se distingue
   sin escribir ni una pregunta falsa en el registro. */
async function comprobarSecreto() {
  try {
    const r = await fetch(CEREBRO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-cem-puente': SECRETO },
      body: '{}',
    });
    if (r.status === 400) { estado.secreto = 'bien'; log('El secreto del puente coincide.'); return; }
    if (r.status === 403) {
      estado.secreto = 'mal';
      log('!! EL SECRETO NO COINCIDE. El puente va a conectar y NO va a anotar nada.');
      log('   CEM_PUENTE_SECRETO del .env tiene que ser idéntico al de');
      log('   Supabase → Edge Functions → Secrets. Si allí no está puesto, el modo');
      log('   puente ni siquiera existe: se cierra, no se abre.');
      return;
    }
    estado.secreto = `raro (${r.status})`;
    log(`!! el cerebro contestó ${r.status} a la comprobación. Revisa CEM_CEREBRO_URL.`);
  } catch (e) {
    estado.secreto = 'no se pudo comprobar';
    log('!! no se pudo hablar con el cerebro:', String(e).slice(0, 160));
  }
}

/* ── Lo que NO se atiende ─────────────────────────────────────────────────── */
/* Cada línea de aquí es un ridículo en público que no va a pasar. */
function seAtiende(m) {
  const jid = m.key?.remoteJid || '';
  if (m.key?.fromMe) return false;                 // lo que escribe el propio negocio
  if (jid === 'status@broadcast') return false;    // los estados de la gente
  if (jid.endsWith('@g.us')) return false;         // grupos: nunca
  if (jid.endsWith('@newsletter')) return false;   // canales
  if (m.message?.protocolMessage) return false;    // borrados, ediciones, etc.
  return true;
}

/* El texto de un mensaje, venga en la forma que venga. Un mensaje citado, uno
   con foto y pie, o uno enviado desde la web tienen el texto en sitios
   distintos, y mirar sólo `conversation` deja fuera a media WhatsApp. */
function textoDe(m) {
  const c = m.message || {};
  return (
    c.conversation
    || c.extendedTextMessage?.text
    || c.imageMessage?.caption
    || c.videoMessage?.caption
    || c.documentMessage?.caption
    || c.buttonsResponseMessage?.selectedDisplayText
    || c.listResponseMessage?.title
    || ''
  ).trim();
}

/* ── Dos ideas, dos globos ────────────────────────────────────────────────
   Un solo mensaje largo y perfecto es la señal más obvia de que hay un bot.
   El guion le pide al modelo que separe ideas distintas con ||| y aquí se
   corta por ahí.

   Pero NO sólo por ahí, y esa es la parte que se aprende a base de verlo: por
   más que el guion insista en el separador exacto, el modelo sigue separando
   ideas con salto de línea doble, o inventándose variantes (&&&, //, ||). Si
   sólo se cortara por |||, esas variantes llegarían EN CRUDO a la pantalla de
   un cliente. Así que se corta por todas y se limpia lo que quede.

   Tope de tres. El manual dice dos o tres globos; más no es conversación, es
   ráfaga — y en WhatsApp una ráfaga de seis mensajes seguidos se parece mucho
   a un número que conviene bloquear. */
const TOPE_GLOBOS = 3;

function enGlobos(texto) {
  /* Las barras y los ampersands piden ESPACIO A LOS DOS LADOS; el ||| no.
     Sin eso, `https://escuelacem.com/programas` se parte en «Te paso el
     catalogo: https:» y «escuelacem.com/programas», y al cliente le llega un
     enlace roto en dos globos. Probado: pasaba.

     El ||| se deja pegado-permisivo porque es el separador que pedimos
     nosotros y no aparece dentro de una URL. */
  const trozos = String(texto)
    .split(/\s*\|{2,}\s*|\s+&{2,}\s+|\s+\/{2,}\s+|\n{2,}/)
    .map((t) => t.replace(/^[\s|]+|[\s|]+$/g, '').trim())
    .filter(Boolean);

  if (!trozos.length) return [String(texto).trim()].filter(Boolean);
  if (trozos.length <= TOPE_GLOBOS) return trozos;

  /* Si salieron más de tres, el resto se pega al último en vez de tirarse:
     perder media respuesta es peor que mandar un globo largo. */
  return [
    ...trozos.slice(0, TOPE_GLOBOS - 1),
    trozos.slice(TOPE_GLOBOS - 1).join(' '),
  ];
}

/* ═══════════════════════════════════════════════════════════════════════════
   LOS MECANISMOS INVISIBLES
   ═══════════════════════════════════════════════════════════════════════════
   Nada de esto se le dice al modelo. Es lo que hace que no se note que hay uno.
   Sección 4 del manual del oficio, y las tres piezas vienen de fallos medidos.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── 1 · Esperar a que termine de escribir ────────────────────────────────
   La gente manda «Hola» / «Soy de Caracas» / «El audio no me abrió» en tres
   globos seguidos. Sin esperar, salen TRES respuestas, cada una con su saludo
   completo, porque ninguna vio a las otras.

   El manual lo midió: a 2,5 segundos se quedaba corto y seguían saliendo
   tres. Seis segundos no se sienten lentos —nadie contesta en dos— y juntan
   la ráfaga en un solo mensaje para el cerebro. */
const ESPERA_RAFAGA = 6000;
const rafagas = new Map();   // jid -> { textos: [], reloj }

/* ── 2 · Un candado por conversación ──────────────────────────────────────
   Impide dos generaciones a la vez para el mismo chat. El caso real: alguien
   mandó tres mensajes y recibió tres saludos casi idénticos.

   La razón de fondo es que el historial sólo se actualiza cuando la respuesta
   ya salió: sin candado, las tres generaciones leen el mismo historial vacío,
   y CUALQUIER regla de «no te repitas» es inaplicable, porque para cada una
   es la primera vez. Si está ocupado, el texto nuevo espera; no se descarta. */
const enCurso = new Set();

/* ── 3 · Callarse cuando entra una persona ────────────────────────────────
   Si alguien del equipo contesta desde el mismo teléfono, la asistente se
   calla EN ESE CHAT. Sin esto entran las dos voces a la vez y el cliente ve
   dos versiones de lo mismo.

   Vence sola a las 24 h: en el negocio del manual, un «apagar» manual olvidado
   dejaba chats mudos para siempre. Y cada mensaje del equipo refresca el
   reloj, para que no vuelva a hablar a mitad de una conversación humana. */
const SILENCIO_HUMANO = 24 * 60 * 60 * 1000;
const silenciados = new Map();   // jid -> hasta cuándo

/* Los identificadores de lo que mandamos NOSOTROS. Sin esto, la propia
   respuesta de la asistente vuelve marcada como `fromMe` y se toma por un
   humano interviniendo: se silenciaría sola en cuanto contestara una vez. */
/* El socket VIVO. Los temporizadores de la ráfaga pueden dispararse después
   de una reconexión, y `conectar()` crea un socket nuevo: si se quedaran con
   el de su closure, intentarían mandar por uno ya muerto y el mensaje se
   perdería en silencio justo después de una caída — cuando más gente escribe. */
let sockActual = null;

const mios = new Set();
function anotarMio(id) {
  if (!id) return;
  mios.add(id);
  if (mios.size > 500) mios.delete(mios.values().next().value);
}

function callarPorHumano(jid) {
  const yaEstaba = (silenciados.get(jid) ?? 0) > Date.now();
  silenciados.set(jid, Date.now() + SILENCIO_HUMANO);
  if (!yaEstaba) log(`⏸  contestó una persona en +${jid.split('@')[0]}: me callo 24 h ahí.`);
}

function estaCallada(jid) {
  const hasta = silenciados.get(jid);
  if (!hasta) return false;
  if (hasta > Date.now()) return true;
  silenciados.delete(jid);
  return false;
}

/* ── Que no se conteste dos veces lo mismo ────────────────────────────────── */
/* Baileys reentrega mensajes al reconectar, y el manual documenta 312
   reconexiones en un día. Sin esto, cada caída significa contestarle otra vez
   a todo el mundo. */
const vistos = new Map();
function yaVisto(id) {
  const t = Date.now();
  for (const [k, v] of vistos) if (t - v > 10 * 60 * 1000) vistos.delete(k);
  if (vistos.has(id)) return true;
  vistos.set(id, t);
  return false;
}

/* Atender una ráfaga ya juntada. Sale del temporizador, no del evento. */
async function atenderRafaga(jid) {
  const r = rafagas.get(jid);
  if (!r) return;
  rafagas.delete(jid);

  /* Si hay otra generación viva para este chat, lo nuevo NO se descarta: se
     vuelve a encolar y sale cuando la anterior termine. Descartarlo dejaría
     a alguien sin respuesta por haber escrito rápido. */
  if (enCurso.has(jid)) {
    encolar(jid, r.textos.join('\n'));
    return;
  }
  if (estaCallada(jid)) return;

  const telefono = jid.split('@')[0];
  const texto = r.textos.join('\n').slice(0, 1500);
  enCurso.add(jid);
  try {
    estado.mensajes++;
    estado.ultimo = ahora();
    log(`← +${telefono}${r.textos.length > 1 ? ` [${r.textos.length} seguidos]` : ''}: `
      + texto.replace(/\n/g, ' / ').slice(0, 80));

    const res = await preguntarAlCerebro(telefono, texto);

    /* Se vuelve a mirar DESPUÉS de pensar: el modelo tarda unos segundos, y
       en ese rato puede haber entrado una persona del equipo. Contestar
       encima de ella es justo lo que este mecanismo viene a evitar. */
    if (estaCallada(jid)) {
      log(`⏸  entró una persona mientras pensaba: no mando nada a +${telefono}.`);
      return;
    }

    if (res?.respuesta) {
      const globos = enGlobos(res.respuesta);
      for (let i = 0; i < globos.length; i++) {
        /* «Escribiendo…» antes de cada globo. Sin esto la respuesta aparece
           de golpe medio segundo después y se nota que no hay nadie al otro
           lado; y con varios globos sin pausa llegan los tres en el mismo
           segundo, que queda peor que un mensaje único. */
        await sockActual.sendPresenceUpdate('composing', jid);
        const escribiendo = i === 0
          ? Math.min(2500, 400 + texto.length * 25)
          : Math.min(2200, 500 + globos[i].length * 30);
        await new Promise((s) => setTimeout(s, escribiendo));
        const enviado = await sockActual.sendMessage(jid, { text: globos[i] });
        anotarMio(enviado?.key?.id);
      }
      await sockActual.sendPresenceUpdate('paused', jid);
      estado.respondidos++;
      log(`→ +${telefono}: ${res.respuesta.slice(0, 80)}`
        + `${globos.length > 1 ? `  [${globos.length} globos]` : ''}`
        + `${res.degradado ? '  [DEGRADADO]' : ''}`);
    }
  } catch (e) {
    estado.fallos++;
    // Se traga el fallo de UNA conversación: que una reviente no puede tumbar
    // el puente y dejar a todas las demás sin atender.
    log('!! no se pudo atender un mensaje:', String(e).slice(0, 200));
  } finally {
    enCurso.delete(jid);
  }
}

function encolar(jid, texto) {
  const r = rafagas.get(jid) ?? { textos: [], reloj: null };
  r.textos.push(texto);
  // Cada mensaje nuevo reinicia la espera: se contesta cuando de verdad paró
  // de escribir, no seis segundos después del primero.
  if (r.reloj) clearTimeout(r.reloj);
  r.reloj = setTimeout(() => atenderRafaga(jid), ESPERA_RAFAGA);
  rafagas.set(jid, r);
}

/* ── El enlace con WhatsApp ───────────────────────────────────────────────── */
let reintentos = 0;
let yaPedidoElCodigo = false;

async function conectar() {
  const { state, saveCreds } = await useMultiFileAuthState(CARPETA_AUTH);
  const { version } = await fetchLatestBaileysVersion();

  const sock = crearSocket({
    version,
    auth: state,
    printQRInTerminal: false,   // lo pintamos nosotros, y también por web
    // Sin esto WhatsApp marca todo como leído en el teléfono del negocio y
    // el equipo pierde de vista lo que aún no ha atendido nadie.
    markOnlineOnConnect: false,
    browser: ['CEM', 'Chrome', '1.0.0'],
  });

  sock.ev.on('creds.update', saveCreds);

  /* ── Pedir el código de vinculación ────────────────────────────────────
     CUÁNDO se pide es todo el asunto, y costó una vinculación fallida
     descubrirlo. Aquí había una espera fija de cuatro segundos tras abrir el
     socket. En una conexión lenta no basta: se midió un arranque donde
     WhatsApp tardó DIECIOCHO segundos en decir «connected to WA», así que el
     código se pedía a un socket que todavía no existía y volvía
     «Connection Closed» — un error que no dice ni de lejos que el problema
     sea el momento.

     Una espera más larga sería el mismo error con otro número. Lo correcto es
     no adivinar: WhatsApp avisa de que está listo para registrar un
     dispositivo emitiendo el primer QR. Ese es el momento exacto, venga a los
     dos segundos o a los treinta. */
  async function pedirCodigo() {
    try {
      const codigo = String(await sock.requestPairingCode(NUMERO_A_VINCULAR));
      estado.codigo = codigo;
      /* El código va TAL CUAL, sin guión en medio.
         Aquí se pintaba como P9CM-HTWQ, «para que se lea mejor». La primera
         persona que lo usó tecleó el guión y WhatsApp lo rechazó: son ocho
         caracteres, y el adorno se leía como parte del código. Un formato
         bonito que hace fallar la única cosa que había que hacer con él no es
         bonito. */
      console.log(`
╔══════════════════════════════════════════════════════╗
║  CÓDIGO DE VINCULACIÓN:  ${codigo.padEnd(28)}║
╚══════════════════════════════════════════════════════╝

Son esos ${codigo.length} caracteres SEGUIDOS, sin guiones ni espacios.

En el teléfono +${NUMERO_A_VINCULAR}:
  WhatsApp → Dispositivos vinculados → Vincular dispositivo
  → «Vincular con número de teléfono» → teclea el código.

Caduca en un par de minutos. Si no llegas, se corta con Ctrl+C y se vuelve a
lanzar el mismo comando: sale otro.
`);
    } catch (e) {
      console.error('\nNo se pudo pedir el código de vinculación:', String(e).slice(0, 200));
      console.error('Comprueba que el número lleve código de país y vaya sin signos.\n');
    }
  }

  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr: codigo } = u;

    /* El primer QR es la señal de que el socket está listo y sin registrar.
       Con --vincular-con no se pinta —quien espera ocho caracteres no quiere
       un QR delante— pero se aprovecha el aviso. */
    if (codigo && NUMERO_A_VINCULAR && !yaPedidoElCodigo) {
      yaPedidoElCodigo = true;
      pedirCodigo();
    }

    if (codigo && !NUMERO_A_VINCULAR) {
      estado.qr = codigo;
      console.log('\nEscanea este QR desde el teléfono del negocio:');
      console.log('WhatsApp → Dispositivos vinculados → Vincular dispositivo\n');
      qr.generate(codigo, { small: true });
      console.log(`\nTambién en http://127.0.0.1:${PUERTO}/qr\n`);
    }

    if (connection === 'open') {
      reintentos = 0;
      estado.conectado = true;
      estado.qr = null;
      estado.numero = sock.user?.id?.split(':')[0] || null;
      log(`Conectado como +${estado.numero}. Modo: ${MODO.toUpperCase()}.`);
      if (MODO === 'escucha') {
        log('En ESCUCHA: anota lo que preguntan y no contesta. Nadie nota que está.');
      }
      mandarLatido();   // que la plataforma lo sepa ya, sin esperar dos minutos
    }

    if (connection === 'close') {
      estado.conectado = false;
      mandarLatido();   // decir que se cortó, en vez de dejar de latir sin más
      const codigoSalida = lastDisconnect?.error?.output?.statusCode;
      const cerroSesion = codigoSalida === DisconnectReason.loggedOut;

      if (cerroSesion) {
        /* El mismo código de salida (401) significa dos cosas MUY distintas, y
           confundirlas manda a arreglar lo que no está roto:

           · Había sesión y alguien desvinculó el dispositivo desde el teléfono.
           · No había ninguna: el intento de vincular no llegó a cuajar.

           La primera vez que pasó lo segundo, el mensaje decía «la sesión se
           cerró desde el teléfono, borra auth/ y vuelve a escanear» — sobre una
           sesión que nunca existió. */
        if (state.creds.registered) {
          log('La sesión se cerró desde el teléfono. Borra la carpeta auth/ y vuelve a vincular.');
        } else {
          log('No se llegó a vincular. No hay sesión que borrar: vuelve a lanzarlo.');
          if (NUMERO_A_VINCULAR) {
            log(`  node index.mjs --vincular-con ${NUMERO_A_VINCULAR}`);
            log('Comprueba que el número sea el del teléfono donde vas a teclear el código.');
          }
        }
        process.exit(1);
      }

      /* ── 515: acaba de vincularse, hay que reconectar YA ───────────────
         Esto NO es una caída, es el último paso de la vinculación. WhatsApp
         lo dice con todas las letras justo antes: «pairing configured
         successfully, expect to restart the connection».

         Aquí caía en la espera creciente de abajo y se quedaba sesenta
         segundos sin volver. Y el teléfono, que espera ver reaparecer el
         dispositivo en unos segundos, daba el enlace por fallido: se vinculó
         de verdad y la persona vio «no funcionó». Costó tres intentos y una
         cuenta de WhatsApp descubrirlo.

         Se reconecta al momento y sin contar el intento: no hay nada
         estropeado que espaciar. */
      if (codigoSalida === DisconnectReason.restartRequired) {
        log('Vinculado. Reconectando para terminar…');
        setTimeout(conectar, 500);
        return;
      }

      /* Espera creciente. El manual mide 312 reconexiones en un día: reintentar
         cada segundo contra un WhatsApp que no está sólo hace que te bloqueen
         antes. Se sube hasta un minuto y ahí se queda. */
      reintentos++;
      const espera = Math.min(60_000, 2000 * Math.pow(1.6, Math.min(reintentos, 8)));
      log(`Se cortó (${codigoSalida}). Reintento en ${Math.round(espera / 1000)} s.`);
      setTimeout(conectar, espera);
    }
  });

  sockActual = sock;

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;   // 'append' es historial, no gente escribiendo ahora

    for (const m of messages) {
      try {
        const jid = m.key?.remoteJid || '';

        /* Lo que sale de ESTE teléfono. Puede ser de dos manos muy distintas:
           la nuestra, o la de alguien del equipo escribiendo a mano. Sólo lo
           segundo es motivo para callarse. */
        if (m.key?.fromMe) {
          if (!mios.has(m.key.id) && jid && !jid.endsWith('@g.us')
              && jid !== 'status@broadcast' && textoDe(m)) {
            callarPorHumano(jid);
          }
          continue;
        }

        if (!seAtiende(m)) continue;
        const id = m.key?.id;
        if (id && yaVisto(id)) continue;

        const texto = textoDe(m);
        if (!texto) continue;

        // Si una persona tomó el chat, ni se encola: no hay nada que pensar.
        if (estaCallada(jid)) continue;

        encolar(jid, texto);
      } catch (e) {
        estado.fallos++;
        log('!! no se pudo encolar un mensaje:', String(e).slice(0, 200));
      }
    }
  });

  return sock;
}

/* ── Una página para saber si está vivo ───────────────────────────────────── */
/* El manual insiste en esto: sin una forma de mirar, la única señal de que el
   bot está caído es que un cliente se queja. */
/* El QR se DIBUJA aquí, no se escupe el texto crudo.
   ─────────────────────────────────────────────────────────────────────────
   Antes esta página mostraba la cadena de Baileys y decía «pégala en un
   generador de QR». Eso no vale para lo único que hace falta hacer con ella:
   apuntarle el teléfono. Y el QR de la terminal tampoco es de fiar en un
   servidor por SSH — sale con caracteres de bloque y, según la fuente y los
   colores, el teléfono no lo lee.

   Va como SVG y se recarga sola: WhatsApp caduca cada QR en unos veinte
   segundos y genera otro. */
/* Nada de lo que se pinta aquí lo escribe un desconocido, pero el número y el
   código vienen de fuera de este proceso y acaban dentro de HTML. Escapar sale
   gratis; acordarse de por qué no hacía falta, no. */
const esc = (s) => String(s).replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pagina = (cuerpo, recarga) =>
  `<!doctype html><meta charset="utf-8"><title>Vincular el WhatsApp del CEM</title>`
  + (recarga ? `<meta http-equiv="refresh" content="5">` : '')
  + `<style>
      :root{color-scheme:light dark}
      body{font:16px/1.5 system-ui,sans-serif;margin:0;min-height:100vh;
           display:grid;place-items:center;text-align:center;padding:24px}
      .caja{max-width:420px}
      svg{width:min(340px,80vw);height:auto;background:#fff;padding:12px;border-radius:12px}
      h1{font-size:20px;margin:0 0 4px} p{margin:12px 0;opacity:.85}
      code{background:rgba(128,128,128,.2);padding:2px 6px;border-radius:4px}
     </style><div class="caja">${cuerpo}</div>`;

createServer(async (req, res) => {
  if (req.url === '/qr') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    if (estado.conectado) {
      res.end(pagina(`<h1>Ya está vinculado</h1>
        <p>Conectado como <code>+${esc(estado.numero)}</code>. No hay QR que escanear.</p>`, false));
      return;
    }
    if (estado.codigo) {
      res.end(pagina(`<h1>Código de vinculación</h1>
        <p style="font:700 40px/1.2 ui-monospace,monospace;letter-spacing:4px;margin:16px 0">
          ${esc(estado.codigo)}</p>
        <p>Esos caracteres <b>seguidos</b>, sin guiones ni espacios.</p>
        <p>En el teléfono del negocio:<br><b>WhatsApp → Dispositivos vinculados →
        Vincular dispositivo → Vincular con número de teléfono</b></p>`, true));
      return;
    }
    if (!estado.qr) {
      res.end(pagina(`<h1>Todavía no hay QR</h1>
        <p>Se está pidiendo a WhatsApp. Esta página se recarga sola.</p>`, true));
      return;
    }
    try {
      const svg = await QR.toString(estado.qr, { type: 'svg', margin: 1, width: 340 });
      res.end(pagina(`<h1>Vincular el WhatsApp del CEM</h1>
        <p>En el teléfono del negocio:<br><b>WhatsApp → Dispositivos vinculados →
        Vincular dispositivo</b></p>${svg}
        <p>Cada código caduca en unos segundos; esta página se recarga sola.</p>`, true));
    } catch (e) {
      // Que no se pueda dibujar no puede dejar sin QR: queda el texto, que es
      // feo pero sirve de último recurso.
      res.end(pagina(`<h1>No se pudo dibujar el QR</h1>
        <p>${String(e).slice(0, 120)}</p>
        <p>Mira la terminal, o pega esto en un generador de QR:</p>
        <p><code style="word-break:break-all">${esc(estado.qr)}</code></p>`, true));
    }
    return;
  }
  res.writeHead(estado.conectado ? 200 : 503, { 'Content-Type': 'application/json' });
  /* Los chats en pausa se cuentan al pedirlos, no se llevan en un contador:
     vencen solos a las 24 h y un contador se quedaría contando pausas
     caducadas. */
  const enPausa = [...silenciados.values()].filter((h) => h > Date.now()).length;
  res.end(JSON.stringify({
    ...estado, modo: MODO,
    qr: estado.qr ? '(hay uno, mira /qr)' : null,
    chats_tomados_por_una_persona: enPausa,
    rafagas_esperando: rafagas.size,
  }, null, 1));
}).listen(PUERTO, () => log(`Salud en http://127.0.0.1:${PUERTO}/  ·  QR en /qr`));

/* ── Arrancar ─────────────────────────────────────────────────────────────── */
log(`Puente del CEM. Modo: ${MODO}. Cerebro: ${CEREBRO}`);
if (process.argv.includes('--reiniciar-sesion')) {
  rmSync(CARPETA_AUTH, { recursive: true, force: true });
  log('Carpeta auth/ borrada: va a pedir el QR otra vez.');
}
comprobarSecreto();     // sin await: que no retrase el QR

/* Un latido nada más arrancar, antes de que nadie escanee nada. Así la
   plataforma distingue tres cosas que no son la misma: que esto no se ha
   montado, que está en pie esperando el QR, y que está conectado. Sin el
   primer latido, «arrancado sin vincular» y «muerto» se ven igual. */
mandarLatido();

/* El latido va con `unref` para que no sea lo que mantenga vivo el proceso:
   si algún día todo lo demás termina, esto no debe ser el motivo de que el
   puente siga en pie sin hacer nada. */
setInterval(mandarLatido, LATIDO_CADA).unref();

conectar().catch((e) => {
  console.error('No se pudo arrancar:', e);
  process.exit(1);
});
