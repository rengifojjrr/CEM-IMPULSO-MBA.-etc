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
  /* La página de un recurso de captación. Es pública por definición: se llega
     desde un mensaje de ManyChat después de comentar una palabra en Instagram,
     y quien llega no tiene cuenta —ni se le pide, que es justamente el punto—.
     Lo que hay que proteger no es la pantalla sino el archivo, y eso lo hace el
     servidor: la ficha que se pide al abrir sólo trae el título, y la ruta del
     documento no viaja nunca al navegador. */
  'plataforma/recurso.html',
  /* La lista de pre-registro, hermana de la anterior y pública por lo mismo:
     se llega desde una historia de Instagram y no se pide cuenta —pedirla
     vaciaría la lista, que es justo lo que se viene a llenar—. Lo que se
     protege no es la pantalla: la ficha que se pide al abrir sólo trae lo que
     hace falta para dibujar el formulario, sin decir cuánta gente hay
     apuntada, y la escritura pasa por `cem_formulario_enviar`, que valida
     obligatorios y descarta cualquier campo que la lista no haya declarado. */
  'plataforma/formulario.html',
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

/* ══════════ 6b. …y tienen el `#page` que mount() va a buscar ══════════
   `mount()` no dibuja la pantalla donde está: la ARRANCA de su sitio y la mete
   dentro del armazón que acaba de construir, buscándola por `id="page"`. Una
   pantalla sin ese id se queda fuera, el armazón la tapa entera, y lo que se ve
   es un panel en blanco — sin error de consola, sin nada roto en la consulta,
   sin ninguna pista de por dónde empezar a mirar.

   Pasó de verdad con `admin/formularios.html`: llamaba a `mount()`, cargaba sus
   datos, no daba un solo error, y estaba en blanco. La otra mitad —`hidden`—
   también hace falta: sin ella la pantalla parpadea sin menú antes de que
   `mount()` la mueva. */
titulo('Toda pantalla del portal trae el «page» que mount() va a buscar');
const sinPage = [];
for (const f of await archivos('plataforma/**/*.html')) {
  const texto = await readFile(join(RAIZ, f), 'utf8');
  /* Se busca la llamada con `area:`, no la palabra «mount».
     ─────────────────────────────────────────────────────────────────────────
     La primera versión buscaba `/\bmount\s*\(/` y señalaba cuatro pantallas
     que estaban perfectamente. Dos de ellas —cambiar-clave e invitacion— sólo
     NOMBRAN a mount() dentro de un comentario, para explicar por qué no lo
     llaman; la regla leía el comentario como si fuera código. Las otras dos
     usan `mount({ pub:true })`, que monta la cabecera pública y no el armazón,
     así que no mueven nada y no necesitan `#page`.

     `area:` es la marca correcta porque es la que lleva al armazón, y lo
     lleva SIEMPRE: las 52 llamadas de armazón que hay la pasan, y ninguna de
     las públicas. Casi «arreglo» cuatro pantallas buenas por fiarme de una
     comprobación que no había comprobado. */
  if (!/\bmount\s*\(\s*\{[^}]*\barea\s*:/.test(texto)) continue;
  const etiqueta = texto.match(/<[a-z]+[^>]*\bid="page"[^>]*>/);
  if (!etiqueta) { sinPage.push(`${f} no tiene ningún elemento con id="page": mount() no encuentra qué mover y la pantalla sale en blanco`); continue; }
  if (!/\bclass="[^"]*\bhidden\b/.test(etiqueta[0])) {
    sinPage.push(`${f} tiene id="page" pero sin «hidden»: se verá un instante sin menú antes de que mount() la coloque`);
  }
}
if (sinPage.length) sinPage.forEach((q) => mal(q.split(' ')[0], q));
else bien('Todas las pantallas del portal traen su «page» oculto, listo para que mount() lo coloque');

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
/* Y la regla que de verdad los caza.
   ─────────────────────────────────────────────────────────────────────────
   La cuenta de caracteres de arriba dejó pasar veintidós casos, y el fallo
   llegó hasta el dominio en producción: el aviso de «ya salió el enlace»
   asomando por los dos lados de la tarjeta de recuperar contraseña.

   ¿Por qué no los vio? Porque el texto no estaba en el HTML: se armaba en
   JavaScript a partir de un dato —`${esc(correo)}`, `${mensajeError(error)}`—
   y esta comprobación borra los `${…}` antes de medir, así que veía una frase
   de diez caracteres donde había una de ciento veinte.

   La regla que no depende del texto: **un chip nunca es un `<div>`**. Un chip
   es una etiqueta que va dentro de una línea; un `<div class="chip">` es
   siempre alguien usando una píldora como bloque de mensaje. Eso se ve en el
   marcado, venga el texto de donde venga.

   Se nota además en los remiendos que dejó: tres de los veintidós llevaban
   `white-space:normal;height:auto` a mano, o sea que ya le habían quitado al
   chip lo que lo hace chip para que el mensaje cupiera. */
const chipsDeBloque = [];
for (const f of paginas) {
  const html = await readFile(join(RAIZ, f), 'utf8');
  for (const m of html.matchAll(/<div class=(["'`])(?:\$\{[^}]*\}\s*)?chip[\s"'`]/g)) {
    const linea = html.slice(0, m.index).split('\n').length;
    chipsDeBloque.push(`${f}:${linea} usa un chip como bloque (<div class="chip">). `
      + 'Un chip es una etiqueta en línea; un mensaje va en .nota');
  }
}
if (chiposos.length || chipsDeBloque.length) {
  [...chiposos, ...chipsDeBloque].forEach((c) => mal(c.split(':')[0], c));
} else {
  bien(`Ninguno de los chips de las ${paginas.length} pantallas lleva un mensaje dentro`);
}

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

/* ══════════ 11. Ningún botón de icono se queda sin nombre ══════════
   Los iconos de esta casa son una tipografía de ligaduras: en el HTML no hay
   un dibujo, hay la palabra. Un botón cuyo único contenido es
   `<span class="material-symbols-outlined">delete</span>` se anuncia, para
   quien navega escuchando, como «botón delete» — en inglés y en jerga.

   El `title` que casi todos llevan NO sirve para esto: como nombre accesible
   va el último de la lista y el contenido del botón le gana. Hace falta
   `aria-label`, que manda sobre todo lo demás.

   Se arreglaron 124 de golpe con herramientas/etiquetar-iconos.mjs. Esta
   comprobación existe porque arreglar 124 a mano dura exactamente hasta que
   alguien escriba el 125: es la diferencia entre limpiar y dejar de ensuciar. */
titulo('Ningún botón de icono se queda sin nombre');

const SOLO_ICONO = /<(button|a)((?:(?!aria-label)[^>])*?)>\s*<span class="material-symbols-outlined"[^>]*>[a-z_]+<\/span>\s*<\/\1>/g;
const mudos = [];
for (const f of await archivos('**/*.html', '**/*.js')) {
  const texto = await readFile(join(RAIZ, f), 'utf8');
  if (!texto.includes('material-symbols-outlined')) continue;
  for (const m of texto.matchAll(SOLO_ICONO)) {
    const linea = texto.slice(0, m.index).split('\n').length;
    mudos.push(`${f}:${linea} tiene un <${m[1]}> que es sólo un icono y no dice cómo se llama`
      + '. Ponle title y pasa herramientas/etiquetar-iconos.mjs');
  }
}
if (mudos.length) mudos.forEach((s) => mal(s.split(':')[0], s));
else bien('Todos los botones y enlaces de sólo icono llevan su nombre en castellano');

/* ══════════ 12. Una pantalla pública no cambia de tema ══════════
   El escaparate es de un solo tema, y a propósito: el fondo va blanco fijo
   —`:root[data-publico="si"] body{background:#fff}` en styles.css— porque los
   colores vivos de la portada sólo se leen como color sobre blanco.

   Lo que estuvo roto meses: la portada del dominio y las páginas de programa
   llevaban ADEMÁS su propio `@media (prefers-color-scheme:dark)` en el CSS que
   va en línea. Resultado para quien tiene el sistema en modo noche: tinta clara
   (#e9ecef) sobre ese blanco fijo. Titulares invisibles y cajas oscuras en una
   página clara — la primera pantalla que ve quien llega de Google.

   No lo salvaba temas.js, que es quien pone `data-theme="light"` en lo público:
   estas páginas no cargan app.js, así que ese módulo no llega nunca. Por eso la
   regla se comprueba en el HTML y no en el navegador.

   Se mira sólo el `<style>` en línea. La hoja grande sí lleva su bloque
   nocturno —lo necesita el portal— y ya se protege del escaparate con
   `:root[data-publico="si"]`. */
titulo('Una pantalla pública no cambia de tema con el sistema');

const conTemaDoble = [];
for (const f of await archivos('**/*.html')) {
  const html = await readFile(join(RAIZ, f), 'utf8');
  if (!/<html[^>]*\bdata-publico="si"/.test(html)) continue;
  for (const m of html.matchAll(/<style>([\s\S]*?)<\/style>/g)) {
    if (!/prefers-color-scheme\s*:\s*dark/.test(m[1])) continue;
    const linea = html.slice(0, m.index).split('\n').length;
    conTemaDoble.push(`${f}:${linea} es pública —fondo blanco fijo— y trae un bloque `
      + 'de modo oscuro en línea: de noche pinta tinta clara sobre blanco. '
      + 'Si viene del generador, quítalo en herramientas/generar-seo.mjs');
  }
}
if (conTemaDoble.length) conTemaDoble.forEach((s) => mal(s.split(':')[0], s));
else bien('Ninguna pantalla pública se pinta de noche sobre su fondo blanco');

/* ══════════ 13. Una «caja» sin relleno es texto pegado al filete ══════════
   `.caja` promete fondo, filete y esquinas. NO promete relleno —a propósito:
   se le añade a la clase propia de la pantalla, que es la que sabe si dentro
   va un texto (que necesita aire) o una tabla (que va a ras)—. Las dieciocho
   pantallas que la usan lo hacen así: `.met` en Formas de pago, `.cuota` en
   Pagos, `.socio` en Inversionistas.

   Dos pantallas nuevas se saltaron el paso, y se veía: en Campañas y en
   Listas de pre-registro el título salía tocando el borde. Nadie lo avisó
   porque un relleno que falta no da error, sólo queda feo.

   Se mira: las otras clases del elemento, ¿le dan relleno en el `<style>` de
   la pantalla? ¿Hay un `style="padding…"` a mano? Si no hay ninguna de las
   dos, esa caja se está pintando sin relleno. Para el caso legítimo —una caja
   cuyo relleno ponen sus hijos— se escribe `caja-sin-relleno: porque…` en un
   comentario cerca, igual que `sin-caja:` en la comprobación 10. */
titulo('Ninguna «caja» se queda sin relleno');

const cajasSinAire = [];
for (const f of await archivos('**/*.html')) {
  const html = await readFile(join(RAIZ, f), 'utf8');
  if (!/\bcaja\b/.test(html)) continue;
  const hoja = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  /* ¿Esta clase recibe la propiedad `padding` en el <style> de la pantalla? */
  const daRelleno = (clase) => {
    const seguro = clase.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
    const bloques = hoja.matchAll(new RegExp(`\\.${seguro}(?![\\w-])[^{]*\\{([^}]*)\\}`, 'g'));
    return [...bloques].some((b) => /(^|[;\s])padding\s*:/.test(b[1]));
  };
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    const clases = m[1].split(/[\s${}'"?:]+/).filter((c) => /^[a-z][\w-]*$/.test(c));
    if (!clases.includes('caja')) continue;
    /* `.card` sí trae relleno de fábrica: una caja que además es card ya lo tiene. */
    if (clases.includes('card')) continue;
    if (clases.some((c) => c !== 'caja' && daRelleno(c))) continue;
    // Un `style="padding:…"` escrito a mano en la misma etiqueta.
    const etiqueta = html.slice(Math.max(0, m.index - 300), m.index + m[0].length + 200);
    if (/style="[^"]*padding/.test(etiqueta)) continue;
    // La salida declarada, por si el relleno lo ponen los hijos.
    if (/caja-sin-relleno\s*:/.test(html.slice(Math.max(0, m.index - 400), m.index))) continue;
    const linea = html.slice(0, m.index).split('\n').length;
    cajasSinAire.push(`${f}:${linea} pinta una «caja» sin relleno («${m[1].trim()}»): el texto `
      + 'sale pegado al filete. Ponle padding a su clase, o escribe '
      + '«caja-sin-relleno: porque…» si el relleno lo ponen los hijos');
  }
}
if (cajasSinAire.length) cajasSinAire.forEach((s) => mal(s.split(':')[0], s));
else bien('Todas las «caja» reciben su relleno de la clase de su pantalla');

/* ══════════ 15. La promoción sólo se ofrece donde cabe ══════════
   La barra de promoción la monta `mount({pub:true})`, así que sólo puede salir
   en una pantalla que lo llame, y se identifica por el nombre de su archivo.

   La pantalla de Campañas ofrece una lista de «dónde sale». Esa lista estuvo
   ofreciendo cinco sitios de los que sólo dos funcionaban: «programas» no era
   el nombre de ninguna pantalla —el catálogo es `catalogo.html`— y «verificar»
   y «preguntas-frecuentes» no montan el armazón público. Se marcaban tres
   casillas y la promoción aparecía en una, sin decir nada.

   Nadie lo iba a notar: una campaña que no aparece no da error. Por eso hay
   que comprobarlo aquí, comparando la lista con los archivos de verdad. */
titulo('La promoción sólo se ofrece donde de verdad cabe');

const camp = await readFile(join(RAIZ, 'plataforma/admin/campanas.html'), 'utf8');
const bloquePantallas = camp.match(/const PANTALLAS = \[([\s\S]*?)\];/)?.[1] || '';
const ofrecidas = [...bloquePantallas.matchAll(/\[\s*'([^']+)'/g)].map((m) => m[1]);

/* Las que montan el armazón público, por el nombre de su archivo. */
const conBarra = new Set();
for (const f of await archivos('plataforma/*.html')) {
  const html = await readFile(join(RAIZ, f), 'utf8');
  if (!/mount\s*\(\s*\{[^}]*\bpub\s*:\s*true/.test(html)) continue;
  conBarra.add(f.split('/').pop().replace('.html', ''));
}

const imposibles = ofrecidas.filter((p) => !conBarra.has(p));
if (!ofrecidas.length) {
  mal('plataforma/admin/campanas.html', 'No se pudo leer la lista PANTALLAS de campanas.html');
} else if (imposibles.length) {
  imposibles.forEach((p) => mal('plataforma/admin/campanas.html',
    `Campañas ofrece «${p}» como sitio donde sale la promoción, y ahí no puede salir: `
    + `no hay plataforma/${p}.html que llame a mount({pub:true}). `
    + `Las que sí lo llaman: ${[...conBarra].sort().join(', ')}`));
} else {
  bien(`Las ${ofrecidas.length} pantallas que ofrece Campañas montan todas la barra`);
}

/* ══════════ 16. Los tres sitios que versionan el logotipo dicen lo mismo ══════════
   El navegador guarda las imágenes con la dirección como única llave: mientras
   no cambie, sigue enseñando la que tiene aunque el servidor ya sirva otra. Por
   eso el logotipo lleva `?v=…`, y por eso ese número vive en tres archivos —el
   que declara los iconos de las pantallas escritas a mano, el que genera las
   públicas, y el que dibuja la cabecera del portal.

   Tres copias del mismo número es una trampa: se sube una, se olvidan dos, y
   media casa sigue enseñando el logotipo viejo sin que nada avise. */
titulo('El logotipo se versiona igual en los tres sitios');

const VERSIONES = [
  ['herramientas/iconos.mjs', /const VERSION_ICONO = '([^']+)'/],
  ['herramientas/generar-seo.mjs', /const VERSION_ICONO = '([^']+)'/],
  ['plataforma/assets/app.js', /const VERSION_ICONO = '([^']+)'/],
];
const leidas = [];
for (const [f, re] of VERSIONES) {
  const v = (await readFile(join(RAIZ, f), 'utf8')).match(re)?.[1];
  if (!v) mal(f, `${f} no declara VERSION_ICONO: el logotipo se serviría sin marca de versión`);
  else leidas.push([f, v]);
}
const distintas = new Set(leidas.map(([, v]) => v));
if (leidas.length === VERSIONES.length && distintas.size > 1) {
  mal('herramientas/iconos.mjs', 'La versión del logotipo no coincide: '
    + leidas.map(([f, v]) => `${f} dice ${v}`).join(' · ')
    + '. Con dos números distintos, parte de la casa enseña el logotipo viejo');
} else if (leidas.length === VERSIONES.length) {
  bien(`Los tres archivos versionan el logotipo con ${[...distintas][0]}`);
}

/* Y que no quede NINGUNA referencia al logotipo sin marca. Contar que los tres
   números coincidan no basta: la primera vez se versionaron los <link> y la
   marca del portal, y se quedó fuera la de la cabecera pública. Resultado
   visible: las páginas generadas enseñaban el birrete e inicio.html seguía con
   la «E» vieja de la caché. Dos logotipos en el mismo sitio. */
const sinMarca = [];
for (const f of ['plataforma/assets/app.js', 'herramientas/generar-seo.mjs',
                 'herramientas/iconos.mjs']) {
  const texto = await readFile(join(RAIZ, f), 'utf8');
  for (const m of texto.matchAll(/(?:src|href)\s*=\s*["'`][^"'`]*favicon\.svg(?!\?v=)/g)) {
    const linea = texto.slice(0, m.index).split('\n').length;
    sinMarca.push(`${f}:${linea} pinta el logotipo sin «?v=»: el navegador seguirá `
      + 'enseñando el que tenga guardado');
  }
}
if (sinMarca.length) sinMarca.forEach((x) => mal(x.split(':')[0], x));
else bien('Ninguna referencia al logotipo se sirve sin marca de versión');

/* ══════════ 17. La hoja de estilos no tiene comentarios mal cerrados ══════════
   CSS no anida comentarios: el primer cierre que aparece cierra, y lo que
   venga detrás —hasta el siguiente cierre— es basura que el navegador se traga
   en silencio, con las reglas que hubiera en medio.

   Pasó al escribir esta misma tanda: se añadió un párrafo a un comentario que
   ya estaba cerrado, quedó una marca de cierre suelta, y las dos reglas que
   venían después desaparecieron. Lo peor no fue eso: fue que la pantalla
   PARECÍA correcta, porque lo que se perdía era justo lo que se estaba
   arreglando. Se cazó midiendo, no mirando.

   (Y la primera versión de esta comprobación se rompió igual, porque el
   comentario que la explicaba escribía la marca de cierre con todas sus
   letras. De ahí que aquí se nombren y no se dibujen.)

   Se cuentan aperturas y cierres y se comprueba que ninguno quede descolocado. */
titulo('Ningún comentario mal cerrado en la hoja de estilos');

const hojaCss = await readFile(join(RAIZ, 'plataforma/assets/styles.css'), 'utf8');
let prof = 0, descolocados = 0, lineaSuelta = 0;
for (let i = 0; i < hojaCss.length - 1; i++) {
  if (hojaCss[i] === '/' && hojaCss[i + 1] === '*') {
    if (prof > 0) { descolocados++; lineaSuelta ||= hojaCss.slice(0, i).split('\n').length; }
    prof = 1; i++;
  } else if (hojaCss[i] === '*' && hojaCss[i + 1] === '/') {
    if (prof === 0) { descolocados++; lineaSuelta ||= hojaCss.slice(0, i).split('\n').length; }
    prof = 0; i++;
  }
}
if (prof !== 0) {
  mal('plataforma/assets/styles.css',
    'styles.css termina con un comentario sin cerrar: todo lo que venga después se pierde');
} else if (descolocados) {
  mal('plataforma/assets/styles.css',
    `styles.css tiene ${descolocados} apertura/cierre de comentario descolocado (el primero, `
    + `hacia la línea ${lineaSuelta}): CSS no anida comentarios, y las reglas que queden `
    + 'en medio desaparecen sin dar error');
} else {
  bien('Todos los comentarios de styles.css abren y cierran donde deben');
}

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
