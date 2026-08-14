/* Corredor de las pruebas.
 *
 * Levanta un servidor estático si no hay ninguno, abre un navegador, ejecuta
 * cada caso y al final dice qué pasó. Devuelve código 1 si algo falló, para
 * que la comprobación automática al subir cambios se entere.
 *
 *   node correr.mjs            todas
 *   node correr.mjs dinero     sólo las que contengan "dinero" en el nombre
 */

import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { abrirNavegador, BASE } from './entorno.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const filtro = process.argv[2] || '';

async function sitioEnPie() {
  try {
    const r = await fetch(`${BASE}/plataforma/index.html`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch { return false; }
}

/** Levanta un servidor estático sobre la raíz del repositorio. */
async function levantarSitio() {
  const puerto = new URL(BASE).port || '8125';
  console.log(`· No hay nada sirviendo ${BASE}; levantando uno en el puerto ${puerto}…`);
  const proc = spawn('npx', ['--yes', 'http-server', '-p', puerto, '-c-1', '--silent', RAIZ],
    { stdio: 'ignore', detached: true });
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await sitioEnPie()) return proc;
  }
  proc.kill();
  throw new Error(`No se pudo levantar el sitio en ${BASE}.`);
}

const casos = (await readdir(join(AQUI, 'casos')))
  .filter((f) => f.endsWith('.mjs'))
  .filter((f) => !filtro || f.includes(filtro))
  .sort();

if (!casos.length) {
  console.error(filtro ? `No hay ningún caso que contenga "${filtro}".` : 'No hay casos que correr.');
  process.exit(1);
}

let servidor = null;
if (!(await sitioEnPie())) servidor = await levantarSitio();

const navegador = await abrirNavegador();
const actas = [];

for (const archivo of casos) {
  console.log(`\n━━ ${archivo.replace('.mjs', '')} ━━`);
  const { default: correr } = await import(join(AQUI, 'casos', archivo));
  try {
    actas.push((await correr(navegador)).resumen());
  } catch (e) {
    console.log(`  ✗ La prueba se cayó: ${e.message}`);
    actas.push({ titulo: archivo, total: 0, fallos: [`se cayó: ${e.message}`] });
  }
}

await navegador.close();
if (servidor) process.kill(-servidor.pid);

const totalFallos = actas.reduce((n, a) => n + a.fallos.length, 0);
const totalComprobaciones = actas.reduce((n, a) => n + a.total, 0);

console.log('\n' + '═'.repeat(58));
for (const a of actas) {
  console.log(`${a.fallos.length ? '✗' : '✓'} ${a.titulo}: ` +
    `${a.total - a.fallos.length} de ${a.total}`);
  a.fallos.forEach((f) => console.log(`    · ${f}`));
}
console.log('═'.repeat(58));
console.log(totalFallos
  ? `${totalFallos} comprobación(es) fallaron de ${totalComprobaciones}.`
  : `Las ${totalComprobaciones} comprobaciones pasaron.`);

process.exit(totalFallos ? 1 : 0);
