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
  // El catálogo y la ficha del programa: públicos, y en la raíz por eso mismo.
  'plataforma/catalogo.html',
  'plataforma/curso.html',
  // Y los dos reenvíos que dejaron en su sitio viejo. No tienen script ninguno.
  'plataforma/estudiante/catalogo.html',
  'plataforma/estudiante/curso.html',
]);

const sinControl = [];
for (const f of await archivos('plataforma/**/*.html')) {
  if (PUBLICAS.has(f)) continue;
  const texto = await readFile(join(RAIZ, f), 'utf8');
  if (!/\bmount\s*\(/.test(texto)) sinControl.push(f);
}
if (sinControl.length) sinControl.forEach((f) => mal(f, `${f} no llama a mount(): no comprueba el rol`));
else bien('Todas las pantallas privadas llaman a mount() antes de mostrar nada');

/* ══════════ 7. El menú ofrece lo que se puede abrir, ni más ni menos ══════════
   El menú del portal lleva, en cada entrada, los roles que la pueden abrir; la
   pantalla lleva los suyos en `mount({ require })`. Son dos listas que dicen lo
   mismo y viven en archivos distintos, así que se separan solas en cuanto
   alguien cambia una. Aquí se comparan.

   Que sobre en el menú es lo que se pidió arreglar: un coordinador veía siete
   pantallas que le rebotaban. Que falte es peor y más silencioso: una pantalla
   a la que se tiene derecho y que nadie encuentra. Se avisa de las dos. */
titulo('El menú no ofrece pantallas que luego rebotan');

const NAV_ADMIN = (await readFile(join(RAIZ, 'plataforma/assets/app.js'), 'utf8'))
  .match(/const ADMIN_NAV = \[[\s\S]*?\n\];/)?.[0] || '';
const entradasNav = [...NAV_ADMIN.matchAll(/\['([\w.-]+\.html)',\s*'[^']*',\s*'[^']*',\s*\[([^\]]*)\]\]/g)]
  .map((m) => [m[1], m[2].split(',').map((r) => r.trim().replace(/'/g, '')).filter(Boolean).sort()]);

const desacuerdos = [];
for (const [pagina, rolesMenu] of entradasNav) {
  const ruta = `plataforma/admin/${pagina}`;
  let texto;
  try { texto = await readFile(join(RAIZ, ruta), 'utf8'); }
  catch { desacuerdos.push(`El menú ofrece ${pagina}, que no existe`); continue; }
  const crudo = texto.match(/require:\s*\[([^\]]*)\]/)?.[1];
  if (!crudo) { desacuerdos.push(`${pagina} no declara require: el menú no puede saber quién la abre`); continue; }
  const rolesPagina = crudo.split(',').map((r) => r.trim().replace(/['"]/g, '')).filter(Boolean).sort();
  const sobran = rolesMenu.filter((r) => !rolesPagina.includes(r));
  const faltan = rolesPagina.filter((r) => !rolesMenu.includes(r));
  if (sobran.length) desacuerdos.push(`${pagina}: el menú se la ofrece a ${sobran.join(', ')} y la pantalla los rechaza`);
  if (faltan.length) desacuerdos.push(`${pagina}: ${faltan.join(', ')} puede abrirla pero no la ve en el menú`);
}

if (!entradasNav.length) mal('plataforma/assets/app.js', 'No se pudo leer ADMIN_NAV con sus roles');
else if (desacuerdos.length) desacuerdos.forEach((d) => mal('plataforma/assets/app.js', d));
else bien(`Las ${entradasNav.length} entradas del menú coinciden con lo que exige cada pantalla`);

/* ══════════ 9. Ningún chip lleva una frase dentro ══════════
   Un chip es una etiqueta de estado —«Al día», «3 cuotas»— y por eso lleva
   `white-space:nowrap`: una columna de estados no puede partirse de línea.

   Metido dentro de un chip, un mensaje de dos frases no se parte tampoco: se
   sale de la tarjeta por los dos lados y empuja la página a lo ancho. Pasó en
   la portada, con el aviso de sesión vencida asomando fuera del recuadro
   blanco, y estaba igual en otros cinco sitios.

   Para eso está `.nota`, que es de bloque y parte donde toque. Aquí sólo se
   comprueba que nadie vuelva a confundirlas. */
titulo('Ningún chip lleva una frase dentro');

const LARGO_DE_CHIP = 40;   // «inscripciones_abiertas» son 22; una frase pasa de 40
const chiposos = [];
for (const f of paginas) {
  const html = await readFile(join(RAIZ, f), 'utf8');
  for (const m of html.matchAll(/class="chip[^"]*"[^>]*>([^<]+)</g)) {
    // Lo que se arma con datos de la base no se puede medir aquí.
    const texto = m[1].replace(/\$\{[^}]*\}/g, '').trim();
    if (texto.length <= LARGO_DE_CHIP) continue;
    const linea = html.slice(0, m.index).split('\n').length;
    chiposos.push(`${f}:${linea} mete ${texto.length} caracteres en un chip: «${texto.slice(0, 46)}…». Un mensaje va en .nota`);
  }
}
if (chiposos.length) chiposos.forEach((c) => mal(c.split(':')[0], c));
else bien(`Ninguno de los chips de las ${paginas.length} pantallas lleva un mensaje dentro`);

/* ══════════ 10. Ningún recuadro se dibuja por su cuenta ══════════
   Los ocho estilos de la plataforma no son ocho hojas de CSS: son ocho juegos
   de cuatro variables puestas en `:root`. Lo que decide si algo cambia de
   aspecto al cambiar de estilo no es en qué pantalla esté, sino si consume
   esas variables — o sea, si lleva `caja` o `card` en su clase.

   Una pantalla que se dibuja su propio recuadro en su `<style>` local queda
   fuera del sistema sin que nada lo diga: se cambia de estilo y esa pantalla
   no se entera. Pasaba en Formas de pago, que no usaba `.card` ni una vez, y
   en una docena más.

   Aquí se busca lo que tiene forma de recuadro —filete y esquinas— y se
   comprueba que en el HTML aparezca junto a `caja` o `card`. Las burbujas de
   chat, los interruptores y los iconos redondos no llevan filete, así que no
   entran solos en la cuenta. */
titulo('Ningún recuadro se dibuja por su cuenta');

const cajasSueltas = [];
for (const f of paginas) {
  const html = await readFile(join(RAIZ, f), 'utf8');
  /* Sólo las pantallas del portal. La portada suelta, el panel viejo y el
     manual no cargan la hoja compartida: tienen su propio sistema de estilos
     y el de la plataforma no les llega ni tiene por qué. */
  if (!/assets\/styles\.css/.test(html)) continue;
  const hoja = html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
  if (!hoja) continue;
  for (const m of hoja.matchAll(/^\s*\.([a-z][\w-]*)\s*\{([^}]*)\}/gm)) {
    const [, clase, cuerpo] = m;
    if (!/border\s*:\s*[^;]*(solid|dashed)/.test(cuerpo)) continue;
    if (!/border-radius\s*:/.test(cuerpo)) continue;
    /* La salida, y hay que escribirla a mano: no todo lo que tiene filete y
       esquinas es un panel. Una miniatura, una imagen enmarcada o el tirador
       de un editor no deben cambiar con el estilo, y decirlo cuesta una línea
       —`sin-caja: porque…`— que además explica por qué a quien lo lea. */
    const antes = hoja.slice(Math.max(0, m.index - 220), m.index);
    if (/sin-caja\s*:/.test(antes)) continue;
    // ¿Se usa en el HTML junto a `caja` o `card`?
    const usos = [...html.matchAll(new RegExp(`class="([^"]*\\b${clase}\\b[^"]*)"`, 'g'))];
    if (!usos.length) continue;   // definida y no usada: no es asunto de esta regla
    if (usos.some((u) => /\b(caja|card)\b/.test(u[1]))) continue;
    cajasSueltas.push(`${f}: .${clase} dibuja un recuadro propio y no lleva «caja», así que ningún estilo le llega`);
  }
}
if (cajasSueltas.length) cajasSueltas.forEach((s) => mal(s.split(':')[0], s));
else bien(`Todos los recuadros propios de las ${paginas.length} pantallas declaran «caja»`);

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
