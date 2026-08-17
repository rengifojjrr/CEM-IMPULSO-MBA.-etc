#!/usr/bin/env node
/* Revisión automática del repositorio, sin navegador y sin base de datos.
 *
 * Las pruebas de `pruebas/` son las que valen, pero necesitan un Supabase vivo
 * y las cuentas de demostración, así que no se pueden correr en cualquier
 * momento. Esto sí: son comprobaciones que sólo miran los archivos, tardan
 * segundos y atajan la clase de error que más veces se coló — una llave sin
 * cerrar en un `<script>` que deja una pantalla en blanco, un enlace a un
 * archivo que se renombró, una clave pegada por descuido.
 *
 *   node herramientas/revisar.mjs
 *
 * Devuelve código 1 si algo está mal, para que la revisión al subir cambios
 * se entere.
 */

import { readFile, writeFile, mkdtemp, rm, access, glob } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';

const ejecutar = promisify(execFile);
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

const problemas = [];
const fallo = (donde, que) => problemas.push({ donde, que });
let comprobaciones = 0;

function titulo(t) { console.log(`\n━━ ${t} ━━`); }
function bien(m) { comprobaciones++; console.log(`  ✓ ${m}`); }
function mal(donde, m) { comprobaciones++; console.log(`  ✗ ${m}`); fallo(donde, m); }

async function archivos(...patrones) {
  const salida = [];
  for (const patron of patrones) {
    for await (const p of glob(patron, { cwd: RAIZ })) {
      if (!p.includes('node_modules')) salida.push(p);
    }
  }
  return salida.sort();
}

const existe = (p) => access(p).then(() => true, () => false);

/* ══════════ 1. Todo el JavaScript se puede leer ══════════ */
/* Un error de sintaxis en un `<script type="module">` no rompe la página al
   guardarla ni al subirla: rompe la pantalla en el navegador de quien entre,
   y en blanco. Es exactamente lo que pasó con un `</div>` colocado fuera de
   una plantilla de texto. Aquí se detecta antes de publicar. */
titulo('El JavaScript se puede leer');

const temporal = await mkdtemp(join(tmpdir(), 'cem-revision-'));

async function seLee(codigo, nombre) {
  const ruta = join(temporal, nombre.replace(/[^\w.-]/g, '_') + '.mjs');
  await writeFile(ruta, codigo);
  try {
    await ejecutar(process.execPath, ['--check', ruta]);
    return null;
  } catch (e) {
    const m = String(e.stderr || e.message).match(/SyntaxError:.*/);
    return m ? m[0] : 'no se pudo interpretar';
  }
}

const sueltos = await archivos('**/*.mjs', '**/*.js');
for (const f of sueltos) {
  const error = await seLee(await readFile(join(RAIZ, f), 'utf8'), f);
  if (error) mal(f, `${f}: ${error}`);
}
if (sueltos.length && !problemas.length) bien(`Los ${sueltos.length} archivos .js/.mjs se leen sin errores`);

const paginas = await archivos('**/*.html');
let scriptsRevisados = 0;
const antesDeScripts = problemas.length;
for (const f of paginas) {
  const html = await readFile(join(RAIZ, f), 'utf8');
  const bloques = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const [i, b] of bloques.entries()) {
    const atributos = b[1];
    const cuerpo = b[2];
    if (/\bsrc\s*=/.test(atributos) || !cuerpo.trim()) continue;   // script externo
    if (!/type\s*=\s*["']module["']/.test(atributos)) continue;    // sólo módulos
    scriptsRevisados++;
    const error = await seLee(cuerpo, `${f}-${i}`);
    if (error) mal(f, `${f}: el script #${i + 1} no se puede leer → ${error}`);
  }
}
if (problemas.length === antesDeScripts) {
  bien(`Los ${scriptsRevisados} <script type="module"> de las ${paginas.length} pantallas también`);
}

await rm(temporal, { recursive: true, force: true });

/* ══════════ 2. Ninguna clave secreta en el repositorio ══════════ */
/* Lo que puede ir al repositorio es la clave pública (`sb_publishable_…`): está
   pensada para vivir en el navegador y sólo puede hacer lo que las políticas de
   la base permiten. Lo que NUNCA puede ir es la clave de servicio, que se salta
   todas las políticas, ni las credenciales del banco: ésas viven en
   `cem_integraciones` y sólo las lee el servidor. */
titulo('Ninguna clave secreta en el repositorio');

const PELIGROSOS = [
  [/sb_secret_[A-Za-z0-9_-]{10,}/, 'clave de servicio de Supabase'],
  [/service_role[^\n]{0,40}(key|clave)[^\n]{0,10}[:=][^\n]{0,10}["'][A-Za-z0-9._-]{20,}/i,
    'clave de rol de servicio'],
  [/eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\./, 'un token JWT completo'],
  [/consumer_secret\s*[:=]\s*["'][^"'\s]{8,}/i, 'el consumer_secret del banco'],
  [/\b(extracto|notificacion)_api_key\s*[:=]\s*["'][^"'\s]{8,}/i, 'una ApiKey del banco'],
];

const todosLosArchivos = await archivos('**/*.{js,mjs,ts,html,json,md,sql,yml,yaml}');
const antesDeClaves = problemas.length;
for (const f of todosLosArchivos) {
  const texto = await readFile(join(RAIZ, f), 'utf8');
  for (const [patron, que] of PELIGROSOS) {
    const m = texto.match(patron);
    if (m) {
      const linea = texto.slice(0, m.index).split('\n').length;
      mal(f, `${f}:${linea} parece traer ${que}`);
    }
  }
}
if (problemas.length === antesDeClaves) {
  bien(`Ninguno de los ${todosLosArchivos.length} archivos revisados trae una clave secreta`);
}

/* ══════════ 3. Los enlaces internos apuntan a algo que existe ══════════ */
/* Renombrar una pantalla y olvidarse de un enlace deja un 404 que nadie ve
   hasta que alguien lo pulsa. */
titulo('Los enlaces internos apuntan a algo que existe');

const rotos = [];
for (const f of paginas) {
  const html = await readFile(join(RAIZ, f), 'utf8');
  const carpeta = dirname(join(RAIZ, f));
  const refs = [...html.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1])
    .concat([...html.matchAll(/from\s+["'](\.[^"']+)["']/g)].map((m) => m[1]));

  for (const ref of refs) {
    if (/^(https?:|data:|mailto:|tel:|blob:|#|\/\/)/.test(ref)) continue;
    if (ref.includes('${')) continue;   // se arma en el momento con datos de la base
    const limpia = ref.split('?')[0].split('#')[0];
    if (!limpia) continue;
    const destino = limpia.startsWith('/')
      ? join(RAIZ, limpia.slice(1))
      : resolve(carpeta, limpia);
    if (!(await existe(destino))) rotos.push(`${f} → ${ref}`);
  }
}
if (rotos.length) rotos.forEach((r) => mal(r.split(' → ')[0], `Enlace roto: ${r}`));
else bien('Todos los enlaces y las importaciones locales resuelven a un archivo real');

/* ══════════ 4. Los archivos compartidos van todos con la misma versión ══════════ */
titulo('Los archivos compartidos van todos con la misma versión');
try {
  const { stdout } = await ejecutar(process.execPath,
    [join(RAIZ, 'herramientas', 'versionar-assets.mjs'), '--revisar']);
  bien(stdout.trim().replace(/^✓\s*/, ''));
} catch (e) {
  mal('herramientas/versionar-assets.mjs',
    String(e.stdout || '').trim() + String(e.stderr || '').trim());
}

/* ══════════ 5. Ninguna consulta de escritura lleva paginación ══════════ */
/* Un `.limit()` o un `.range()` colgado de un `update`/`delete` no da error:
   silenciosamente toca menos filas de las que debía. Ya pasó una vez, cuando
   un reemplazo automático los agregó a todas las consultas por igual. */
titulo('Ninguna consulta de escritura lleva paginación');

const ESCRITURAS = /\.(?:update|upsert|insert|delete)\s*\(/;
const sospechosas = [];
for (const f of await archivos('**/*.html', '**/*.js', '**/*.mjs', '**/*.ts')) {
  const texto = await readFile(join(RAIZ, f), 'utf8');
  texto.split('\n').forEach((linea, i) => {
    if (ESCRITURAS.test(linea) && /\.(?:limit|range)\s*\(/.test(linea)) {
      sospechosas.push(`${f}:${i + 1} → ${linea.trim().slice(0, 90)}`);
    }
  });
}
if (sospechosas.length) sospechosas.forEach((s) => mal(s.split(':')[0], `Escritura paginada: ${s}`));
else bien('Ningún update/insert/delete lleva .limit() ni .range() colgado');

/* ══════════ 6. Toda pantalla del portal comprueba quién entra ══════════ */
/* `mount()` es lo que verifica sesión, cuenta activa y rol. Una pantalla del
   portal que no lo llame se abre para cualquiera que sepa la dirección. */
titulo('Toda pantalla del portal comprueba quién entra');

const PUBLICAS = new Set([
  'plataforma/index.html',        // la propia entrada
  'plataforma/nueva-clave.html',  // se llega desde el correo, sin sesión
  // Igual: se llega desde el enlace de confirmación, y justo antes de que exista
  // la sesión. Exigirla aquí haría imposible confirmar una cuenta.
  'plataforma/confirmar.html',
  'plataforma/verificar.html',    // verificación pública de un certificado
  // El perfil de un graduado es público a propósito: se llega escaneando el QR
  // de un título y no puede exigir cuenta. Sólo enseña lo que la propia persona
  // autorizó, y lo filtra el servidor en `cem_perfil_publico`, no el navegador.
  'plataforma/perfil-publico.html',
  'plataforma/manual.html',       // documentación
]);

const sinControl = [];
for (const f of await archivos('plataforma/**/*.html')) {
  if (PUBLICAS.has(f)) continue;
  const texto = await readFile(join(RAIZ, f), 'utf8');
  if (!/\bmount\s*\(/.test(texto)) sinControl.push(f);
}
if (sinControl.length) sinControl.forEach((f) => mal(f, `${f} no llama a mount(): no comprueba el rol`));
else bien('Todas las pantallas privadas llaman a mount() antes de mostrar nada');

/* ══════════ resumen ══════════ */
console.log('\n' + '═'.repeat(58));
if (problemas.length) {
  console.log(`✗ ${problemas.length} problema(s) de ${comprobaciones} comprobaciones:`);
  for (const p of problemas) console.log(`    · ${p.que}`);
  console.log('═'.repeat(58));
  process.exit(1);
}
console.log(`✓ Las ${comprobaciones} comprobaciones estáticas pasaron.`);
console.log(`  (Las pruebas con navegador van aparte: cd ${relative(process.cwd(), join(RAIZ, 'pruebas')) || 'pruebas'} && npm test)`);
console.log('═'.repeat(58));
