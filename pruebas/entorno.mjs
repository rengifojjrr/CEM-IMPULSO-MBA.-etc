/* Lo compartido por todas las pruebas: cómo se abre el navegador, cómo se
   entra con cada cuenta y cómo se informa lo que pasó.

   La idea de fondo: una prueba dice, en castellano, qué debería poder hacer
   una persona. Si falla, el mensaje solo ya explica qué se rompió — sin tener
   que abrir el archivo. */

import { chromium } from 'playwright';

export const BASE = process.env.CEM_BASE || 'http://localhost:8125';
export const CLAVE = process.env.CEM_PASS || 'CemDemo2026!';

export const CUENTAS = {
  admin: 'admin@cem.demo',
  coordinador: 'coordinador@cem.demo',
  cobranza: 'cobranza@cem.demo',
  profesor: 'profesor@cem.demo',
  estudiante: 'estudiante@cem.demo',
  auditor: 'auditor@cem.demo',
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
    args: process.env.CEM_PROXY ? ['--ignore-certificate-errors'] : [],
  });
}

/**
 * Abre una pestaña que va anotando los errores del navegador. Una pantalla que
 * lanza errores en la consola está rota aunque a simple vista se vea bien.
 *
 * `silenciarMientras` permite apagar la anotación durante los bloques que
 * provocan rechazos a propósito (probar que un rol NO puede hacer algo).
 */
export async function nuevaPestana(navegador, { ancho = 1340, alto = 1050, oscuro = false } = {}) {
  const contexto = await navegador.newContext({
    viewport: { width: ancho, height: alto },
    colorScheme: oscuro ? 'dark' : 'light',
  });
  const pagina = await contexto.newPage();
  const errores = [];
  let silencio = false;

  pagina.on('pageerror', (e) => { if (!silencio) errores.push('ERROR DE PÁGINA: ' + e.message); });
  pagina.on('console', (m) => {
    const url = m.location()?.url || '';
    if (silencio || m.type() !== 'error' || /favicon|fonts\.g/.test(url)) return;
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
      const modulo = await import('/plataforma/assets/app.js');
      // eslint-disable-next-line no-new-func
      return new Function('sb', 'args', `return (${cuerpo})(sb, ...args)`)(modulo.sb, args);
    },
    { cuerpo: fn.toString(), args },
  );
}
