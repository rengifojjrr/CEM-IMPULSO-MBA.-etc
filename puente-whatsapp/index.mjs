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
 *   npx pm2 start index.mjs --name cem-puente
 *   npx pm2 logs cem-puente          ← aquí sale el QR
 */

import { readFileSync, existsSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import baileys from '@whiskeysockets/baileys';
import qr from 'qrcode-terminal';

const {
  default: crearSocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion,
} = baileys;

/* ── Configuración ────────────────────────────────────────────────────────── */
/* Se lee de .env sin librería: son cinco valores y una dependencia menos es
   una cosa menos que actualizar en una máquina a la que nadie va a entrar. */
if (existsSync('.env')) {
  for (const linea of readFileSync('.env', 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const CEREBRO = process.env.CEM_CEREBRO_URL
  || 'https://vajbsfgojtunamhrzrpf.supabase.co/functions/v1/cem-whatsapp';
const SECRETO = process.env.CEM_PUENTE_SECRETO || '';
const MODO = (process.env.CEM_PUENTE_MODO || 'escucha').trim();
const PUERTO = Number(process.env.CEM_PUENTE_PUERTO || 3000);
const CARPETA_AUTH = process.env.CEM_PUENTE_AUTH || './auth';

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
const estado = {
  conectado: false, numero: null, qr: null,
  desde: ahora(), mensajes: 0, respondidos: 0, fallos: 0, ultimo: null,
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

/* ── El enlace con WhatsApp ───────────────────────────────────────────────── */
let reintentos = 0;

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

  sock.ev.on('connection.update', (u) => {
    const { connection, lastDisconnect, qr: codigo } = u;

    if (codigo) {
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
    }

    if (connection === 'close') {
      estado.conectado = false;
      const codigoSalida = lastDisconnect?.error?.output?.statusCode;
      const cerroSesion = codigoSalida === DisconnectReason.loggedOut;

      if (cerroSesion) {
        // Alguien desvinculó el dispositivo desde el teléfono. Reintentar es
        // inútil: hay que volver a escanear, y decirlo claro ahorra media hora.
        log('La sesión se cerró desde el teléfono. Borra la carpeta auth/ y vuelve a escanear.');
        process.exit(1);
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

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;   // 'append' es historial, no gente escribiendo ahora

    for (const m of messages) {
      try {
        if (!seAtiende(m)) continue;
        const id = m.key?.id;
        if (id && yaVisto(id)) continue;

        const texto = textoDe(m);
        if (!texto) continue;

        const jid = m.key.remoteJid;
        const telefono = jid.split('@')[0];
        estado.mensajes++;
        estado.ultimo = ahora();
        log(`← +${telefono}: ${texto.slice(0, 80)}`);

        const r = await preguntarAlCerebro(telefono, texto);

        if (r?.respuesta) {
          // «Escribiendo…» antes de contestar. Sin esto la respuesta aparece de
          // golpe medio segundo después y se nota que no hay nadie al otro lado.
          await sock.sendPresenceUpdate('composing', jid);
          await new Promise((s) => setTimeout(s, Math.min(2500, 400 + texto.length * 25)));
          await sock.sendMessage(jid, { text: r.respuesta });
          await sock.sendPresenceUpdate('paused', jid);
          estado.respondidos++;
          log(`→ +${telefono}: ${r.respuesta.slice(0, 80)}${r.degradado ? '  [DEGRADADO]' : ''}`);
        }
      } catch (e) {
        estado.fallos++;
        // Se traga el fallo de UN mensaje: que uno reviente no puede tumbar el
        // puente y dejar a todos los demás sin atender.
        log('!! no se pudo atender un mensaje:', String(e).slice(0, 200));
      }
    }
  });

  return sock;
}

/* ── Una página para saber si está vivo ───────────────────────────────────── */
/* El manual insiste en esto: sin una forma de mirar, la única señal de que el
   bot está caído es que un cliente se queja. */
createServer((req, res) => {
  if (req.url === '/qr') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(estado.qr
      ? `<pre style="font:12px monospace">Pega este código en un generador de QR,
o mira la terminal, que lo pinta dibujado:

${estado.qr}</pre>`
      : `<p style="font:16px system-ui">${estado.conectado
          ? `Conectado como +${estado.numero}. No hay QR que escanear.`
          : 'Todavía no hay QR. Espera unos segundos y recarga.'}</p>`);
    return;
  }
  res.writeHead(estado.conectado ? 200 : 503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ...estado, modo: MODO, qr: estado.qr ? '(hay uno, mira /qr)' : null }, null, 1));
}).listen(PUERTO, () => log(`Salud en http://127.0.0.1:${PUERTO}/  ·  QR en /qr`));

/* ── Arrancar ─────────────────────────────────────────────────────────────── */
log(`Puente del CEM. Modo: ${MODO}. Cerebro: ${CEREBRO}`);
if (process.argv.includes('--reiniciar-sesion')) {
  rmSync(CARPETA_AUTH, { recursive: true, force: true });
  log('Carpeta auth/ borrada: va a pedir el QR otra vez.');
}
conectar().catch((e) => {
  console.error('No se pudo arrancar:', e);
  process.exit(1);
});
