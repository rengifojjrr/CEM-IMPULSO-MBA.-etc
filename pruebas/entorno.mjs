/* Lo compartido por todas las pruebas: cómo se abre el navegador, cómo se
   entra con cada cuenta y cómo se informa lo que pasó.

   La idea de fondo: una prueba dice, en castellano, qué debería poder hacer
   una persona. Si falla, el mensaje solo ya explica qué se rompió — sin tener
   que abrir el archivo. */

import { chromium } from 'playwright';

export const BASE = process.env.CEM_BASE || 'http://localhost:8125';

/* La contraseña de las cuentas de prueba NO se escribe aquí.
   ═══════════════════════════════════════════════════════════════════════════
   Este repositorio es público. Durante meses el valor por omisión de esta
   constante fue una contraseña que funcionaba de verdad, y además la pantalla
   de entrar la enseñaba en negrita a cualquiera que abriera el sitio. Mientras
   las cuentas existieran, ahí había seis accesos —uno de ellos de
   administrador— publicados en dos sitios a la vez.

   Ahora sale del entorno. Se ve una vez, al sembrar los datos de prueba, y
   quien vaya a correr la suite la pone al lanzarla:

     CEM_PASS='…' node pruebas/correr.mjs

   Si falta, esto se para en seco en vez de intentarlo con una contraseña
   inventada y hacer creer que lo que falla es el inicio de sesión. */
export const CLAVE = process.env.CEM_PASS;
if (!CLAVE) {
  console.error(
    '\nFalta CEM_PASS: es la contraseña de las cuentas @pruebas.local.\n'
    + 'La devuelve cem_sembrar_datos_de_prueba() al sembrarlas, y la enseña\n'
    + 'una vez la pantalla de Configuración → Datos de prueba.\n\n'
    + "  CEM_PASS='…' node pruebas/correr.mjs\n");
  process.exit(1);
}

/* Las cuentas con las que entran las pruebas.
   ═══════════════════════════════════════════════════════════════════════════
   El dominio es «pruebas.local» a propósito, y no un dominio de verdad: está
   reservado y no existe, así que si un día se escapa un correo a una de estas
   direcciones rebota en vez de llegarle a un desconocido.

   Estas cuentas NO están siempre. Viven mientras estén sembrados los datos de
   prueba, que se ponen y se quitan desde Configuración → Datos de prueba, o
   llamando a cem_sembrar_datos_de_prueba(). Si toda la suite falla en el
   inicio de sesión, es que no están sembrados: es lo primero que hay que
   mirar antes de buscar el fallo en otra parte. */
export const CUENTAS = {
  admin: 'admin@pruebas.local',
  coordinador: 'coordinador@pruebas.local',
  cobranza: 'cobranza@pruebas.local',
  profesor: 'profesor@pruebas.local',
  estudiante: 'estudiante@pruebas.local',
  auditor: 'auditor@pruebas.local',
};

/** Resultados de una prueba, para que el corredor los junte todos. */
export function acta(titulo) {
  const fallos = [];
  let total = 0;
  return {
    titulo,
    /** Anota una comprobación. `bien` es el resultado; `que` es qué se esperaba. */
    comprobar(bien, que) {
      total++;
      console.log(`  ${bien ? '✓' : '✗'} ${que}`);
      if (!bien) fallos.push(que);
    },
    resumen: () => ({ titulo, total, fallos }),
  };
}

export async function abrirNavegador() {
  return chromium.launch({
    executablePath: process.env.CEM_CHROMIUM || undefined,
    proxy: process.env.CEM_PROXY
      ? { server: process.env.CEM_PROXY, bypass: 'localhost,127.0.0.1' }
      : undefined,
    args: [
      /* Sin esto no se puede probar que un vídeo se reproduce. Chromium exige
         un gesto de la persona antes de arrancar cualquier reproducción, y
         desde fuera de un <iframe> de otro dominio no hay forma de pulsar su
         botón de play. No cambia lo que se prueba: sólo permite pedirle al
         reproductor que arranque, que es lo que hace un alumno con el ratón. */
      '--autoplay-policy=no-user-gesture-required',
      ...(process.env.CEM_PROXY ? ['--ignore-certificate-errors'] : []),
    ],
  });
}

/**
 * Abre una pestaña que va anotando los errores del navegador. Una pantalla que
 * lanza errores en la consola está rota aunque a simple vista se vea bien.
 *
 * `silenciarMientras` permite apagar la anotación durante los bloques que
 * provocan rechazos a propósito (probar que un rol NO puede hacer algo).
 */
/* ── lo que viene de fuera ────────────────────────────────────────────────
   Nada de esto es culpa de la plataforma, y conviene dejarlo escrito para
   que nadie vuelva a perder una tarde con ello.

   La plataforma pide cuatro cosas a internet: el cliente de Supabase (de
   esm.sh), la tipografía, los iconos y la base de datos. En una máquina con
   salida directa se resuelven solas. Detrás del proxy de un entorno cerrado,
   el túnel que abre el navegador se cierra a media conversación —los GET a
   la base pasan, los POST no—, así que iniciar sesión devolvía «Failed to
   fetch» y las cuarenta y una pantallas fallaban por algo que en el
   navegador de una persona funciona perfectamente.

   Node sí sabe salir por ese proxy. Así que aquí toda petición que salga
   fuera se resuelve desde Node y se le devuelve al navegador ya hecha,
   cabeceras incluidas —hacen falta las de CORS, o el navegador rechazaría la
   respuesta que él mismo pidió—. Lo que no cambia es qué se prueba: la base
   de datos es la de verdad, las respuestas son las de verdad; sólo cambia
   quién sostiene el cable.

   Lo que no varía nunca —el cliente, la tipografía— se guarda en memoria:
   son cuarenta y una pantallas pidiendo los mismos ocho archivos. */
const CACHE_EXTERNO = new Map();
/* Se guarda lo que no cambia: el cliente de Supabase, la tipografía, los
   iconos y los archivos públicos del almacén —los fondos de los
   certificados, que pesan y se piden una vez por cada diploma del lote—.
   Nunca la API: sus respuestas son justo lo que se está comprobando. */
const SE_PUEDE_GUARDAR = (url, metodo) =>
  metodo === 'GET' && !/\/(rest|auth|functions|realtime)\/v1\//.test(url);

async function traerDeFuera(peticion) {
  const url = peticion.url();
  const metodo = peticion.method();
  if (SE_PUEDE_GUARDAR(url, metodo) && CACHE_EXTERNO.has(url)) return CACHE_EXTERNO.get(url);

  const cabeceras = { ...(await peticion.allHeaders()) };
  // Las que pone el navegador y no le corresponde reenviar.
  ['host', 'connection', 'content-length', 'accept-encoding'].forEach((k) => delete cabeceras[k]);

  const res = await fetch(url, {
    method: metodo,
    headers: cabeceras,
    body: ['GET', 'HEAD'].includes(metodo) ? undefined : (peticion.postDataBuffer() ?? undefined),
    redirect: 'follow',
  });

  const devuelve = {};
  res.headers.forEach((v, k) => {
    // La codificación y la longitud las recalcula Playwright al entregar el
    // cuerpo ya descomprimido; reenviarlas deja al navegador esperando bytes
    // que no van a llegar.
    if (!['content-encoding', 'content-length', 'transfer-encoding'].includes(k)) devuelve[k] = v;
  });
  const guardado = { status: res.status, headers: devuelve, body: Buffer.from(await res.arrayBuffer()) };
  if (SE_PUEDE_GUARDAR(url, metodo)) CACHE_EXTERNO.set(url, guardado);
  return guardado;
}

/* Interceptar apaga la caché del navegador: lo que antes se pedía una vez y
   luego salía de la caché, ahora aparece como una petición cada vez. Las
   pruebas que cuentan descargas quedarían midiendo el arnés en vez de la
   aplicación, así que lo servido de memoria se marca y ellas lo descuentan. */
export const DESDE_MEMORIA = 'x-cem-de-memoria';

async function resolverDesdeNode(contexto) {
  await contexto.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, async (ruta) => {
    const peticion = ruta.request();
    const eraConocido = SE_PUEDE_GUARDAR(peticion.url(), peticion.method())
      && CACHE_EXTERNO.has(peticion.url());
    try {
      const r = await traerDeFuera(peticion);
      await ruta.fulfill({
        status: r.status,
        headers: { ...r.headers, [DESDE_MEMORIA]: eraConocido ? 'si' : 'no' },
        body: r.body,
      });
    } catch {
      // Si Node tampoco puede, que lo intente el navegador: en una máquina
      // con salida directa este camino es el normal.
      await ruta.continue().catch(() => ruta.abort().catch(() => {}));
    }
  });
}

/**
 * Un contexto nuevo —para probar lo que se ve sin sesión— con la misma
 * resolución de red que las pestañas normales. Abrir `newContext()` a pelo se
 * queda sin salida en un entorno cerrado y la página no llega a pintar nada.
 */
export async function nuevoContexto(navegador, opciones = {}) {
  const contexto = await navegador.newContext(opciones);
  await resolverDesdeNode(contexto);
  return contexto;
}

export async function nuevaPestana(navegador, { ancho = 1340, alto = 1050, oscuro = false } = {}) {
  const contexto = await navegador.newContext({
    viewport: { width: ancho, height: alto },
    colorScheme: oscuro ? 'dark' : 'light',
  });
  await resolverDesdeNode(contexto);
  const pagina = await contexto.newPage();
  const errores = [];
  let silencio = false;

  pagina.on('pageerror', (e) => { if (!silencio) errores.push('ERROR DE PÁGINA: ' + e.message); });
  /* Ruido que NO es nuestro y que no podemos quitar.
     ─────────────────────────────────────────────────────────────────────────
     `compute-pressure` lo emite Chromium por una política de permisos que pide
     el reproductor de YouTube dentro de su propio <iframe>. No sale de nuestro
     código, no hay nada que arreglar y aparece o no según la versión del
     navegador: dejarlo puesto convierte la prueba en una que se pone roja sola
     y a la que se deja de hacer caso.

     La lista se queda corta a propósito. Cada línea de aquí es una cosa que la
     suite ya no vigila, así que sólo entra lo que es de un tercero Y no
     podemos cambiar. Ante la duda, no se añade. */
  const RUIDO_AJENO = /compute-pressure|Permissions policy violation/i;

  pagina.on('console', (m) => {
    const url = m.location()?.url || '';
    if (silencio || m.type() !== 'error' || /favicon|fonts\.g/.test(url)) return;
    if (RUIDO_AJENO.test(m.text())) return;
    errores.push('CONSOLA: ' + m.text().slice(0, 170));
  });

  pagina.errores = errores;
  pagina.silenciarMientras = async (fn) => {
    silencio = true;
    try { return await fn(); } finally { silencio = false; }
  };
  return pagina;
}

/** Entra con una de las cuentas de prueba y, si se pide, va a una pantalla. */
export async function entrar(pagina, cuenta, destino) {
  const correo = CUENTAS[cuenta] || cuenta;
  await pagina.goto(`${BASE}/plataforma/index.html`, { waitUntil: 'domcontentloaded' });
  await pagina.fill('#email', correo);
  await pagina.fill('#pass', CLAVE);
  await pagina.click('#formLogin button[type=submit]');
  await pagina.waitForURL(/\/(admin|estudiante|docente)\//,
    { timeout: 30000, waitUntil: 'domcontentloaded' });
  if (destino) await pagina.goto(`${BASE}/plataforma/${destino}`, { waitUntil: 'domcontentloaded' });
  return pagina;
}

/** El cliente de Supabase de la propia página, para comprobar contra la base. */
export function conLaBase(pagina, fn, ...args) {
  return pagina.evaluate(
    async ({ cuerpo, args }) => {
      const modulo = await import('/plataforma/assets/app.js?v=2026-09-04');
      // eslint-disable-next-line no-new-func
      return new Function('sb', 'args', `return (${cuerpo})(sb, ...args)`)(modulo.sb, args);
    },
    { cuerpo: fn.toString(), args },
  );
}
