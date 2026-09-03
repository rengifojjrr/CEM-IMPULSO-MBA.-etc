#!/usr/bin/env node
/* ¿Están bien las páginas que lee Google?
   ═══════════════════════════════════════════════════════════════════════════
   El SEO tiene una trampa: cuando se hace mal, no falla nada. La página carga,
   se ve bien y nadie se entera hasta que meses después sigue sin aparecer en
   ningún sitio. No hay pantalla roja, no hay error en consola. Por eso hace
   falta medirlo, y por eso esto existe.

   Comprueba, sobre los archivos ya escritos:

     1 · Cada página tiene UN <h1>. Ninguno o dos es la señal más vieja de que
         el HTML se armó mal, y Google usa el h1 para saber de qué va.
     2 · Ningún <title> se repite, y ninguno se pasa de largo. Dos páginas con
         el mismo título compiten por la misma búsqueda y gana la que menos te
         interesa —pasó de verdad: «/programas/» y la portada tenían el MISMO,
         palabra por palabra. Y un título de más de 60 caracteres se corta justo
         por el final, que es donde va «| CEM».
     3 · Ninguna <meta description> se repite, y todas caben en lo que Google
         enseña (unos 160 caracteres).
     4 · El canonical de cada página apunta a su propia dirección. Un canonical
         mal puesto le dice al buscador «no me indexes a mí, indexa a ese otro»,
         y es la manera más rápida de desaparecer sin enterarse.
     5 · El JSON-LD es JSON válido y declara @context y @type. Un dato
         estructurado roto no da error: simplemente se ignora, y con él se
         pierde la ficha enriquecida.
     6 · Cada dirección del sitemap existe como archivo, y cada página del
         sitio está en el sitemap. Un mapa que menciona páginas que no existen
         gasta el presupuesto de rastreo en 404.
     7 · Existe /favicon.ico en la raíz, es un .ico de verdad, todas las páginas
         lo declaran, y la organización declara además su `logo` en mapa de
         bits. Sin lo primero Google enseña el sitio con un cuadrito y la
         inicial del dominio —que es lo que estaba pasando—; sin lo segundo se
         queda sin logotipo de marca, que es otra imagen por otro camino.
     8 · Ninguna página que se quiere indexar lleva `noindex` por descuido.

   Uso:  node herramientas/revisar-seo.mjs
*/
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SITIO = 'https://escuelacem.com';

let problemas = 0;
const mal = (q) => { console.log(`  ✗ ${q}`); problemas++; };
const bien = (q) => console.log(`  ✓ ${q}`);
const titulo = (t) => console.log(`\n━━ ${t} ━━`);

/* Las páginas que se quieren en Google. Las de /programas/ se descubren solas
   porque las escribe el generador y su número cambia. */
const PAGINAS = [
  'index.html', 'preguntas-frecuentes.html',
  'plataforma/inicio.html', 'plataforma/nosotros.html', 'plataforma/verificar.html',
  ...(existsSync(join(RAIZ, 'programas'))
    ? readdirSync(join(RAIZ, 'programas')).filter((f) => f.endsWith('.html')).map((f) => `programas/${f}`)
    : []),
];

const leer = (f) => readFileSync(join(RAIZ, f), 'utf8');
const saca = (html, re) => (html.match(re) || [])[1];

/** La dirección pública que le corresponde a un archivo del repositorio. */
function direccionDe(f) {
  if (f === 'index.html') return `${SITIO}/`;
  if (f === 'programas/index.html') return `${SITIO}/programas/`;
  return `${SITIO}/${f}`;
}

const paginas = PAGINAS.filter((f) => existsSync(join(RAIZ, f))).map((f) => {
  const html = leer(f);
  return {
    f, html,
    titulo: saca(html, /<title>([^<]*)<\/title>/),
    descripcion: saca(html, /<meta name="description" content="([^"]*)"/),
    canonical: saca(html, /<link rel="canonical" href="([^"]*)"/),
    h1: (html.match(/<h1[\s>]/g) || []).length,
    noindex: /<meta name="robots"[^>]*content="[^"]*noindex/i.test(html),
    jsonLd: [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]),
  };
});

console.log(`Revisando ${paginas.length} páginas públicas.`);

titulo('Cada página tiene un solo <h1>');
const h1malos = paginas.filter((p) => p.h1 !== 1);
if (h1malos.length) h1malos.forEach((p) => mal(`${p.f} tiene ${p.h1} <h1>`));
else bien(`Las ${paginas.length} llevan exactamente uno`);

titulo('Ningún título se repite, y todos caben en el resultado');
const porTitulo = new Map();
/* El corte real de Google no se mide en caracteres sino en píxeles —unos 580 en
   escritorio—, y eso no se puede contar desde aquí. 60 caracteres es la
   equivalencia que se usa en la práctica, y 65 el punto a partir del cual seguro
   que se corta. Se avisa a partir de 62 para dejar margen a las mayúsculas y a
   las palabras anchas, que ocupan más píxeles con el mismo número de letras.

   Y esto importa más de lo que parece porque lo que va al final del título es
   «| CEM»: cuando se pasa, lo que Google se come es justamente la marca. */
const TOPE_TITULO = 62;
let titulosLargos = 0;
for (const p of paginas) {
  if (!p.titulo) { mal(`${p.f} no tiene <title>`); continue; }
  if (p.titulo.length > TOPE_TITULO) {
    titulosLargos++;
    mal(`${p.f} tiene ${p.titulo.length} caracteres de título; Google enseña unos 60`
      + ` y se comería «${p.titulo.slice(TOPE_TITULO - 6)}»`);
  }
  if (!porTitulo.has(p.titulo)) porTitulo.set(p.titulo, []);
  porTitulo.get(p.titulo).push(p.f);
}
const repes = [...porTitulo].filter(([, v]) => v.length > 1);
if (repes.length) repes.forEach(([t, v]) => mal(`«${t.slice(0, 54)}…» se repite en ${v.join(' y ')}`));
else if (!titulosLargos) bien(`Los ${porTitulo.size} títulos son distintos y caben en el resultado`);

titulo('Las descripciones son propias y caben');
const porDesc = new Map();
let largas = 0;
for (const p of paginas) {
  if (!p.descripcion) { mal(`${p.f} no tiene descripción`); continue; }
  if (p.descripcion.length > 165) { largas++; mal(`${p.f} tiene ${p.descripcion.length} caracteres de descripción; Google corta sobre 160`); }
  if (!porDesc.has(p.descripcion)) porDesc.set(p.descripcion, []);
  porDesc.get(p.descripcion).push(p.f);
}
const descRepes = [...porDesc].filter(([, v]) => v.length > 1);
if (descRepes.length) descRepes.forEach(([, v]) => mal(`La misma descripción en ${v.join(' y ')}`));
else if (!largas) bien(`Las ${porDesc.size} descripciones son distintas y caben en el resultado`);

titulo('El canonical de cada página apunta a sí misma');
const canonMal = paginas.filter((p) => p.canonical && p.canonical !== direccionDe(p.f));
/* inicio.html es la excepción a propósito: apunta a «/», que enseña lo mismo y
   es la dirección que la gente teclea. Se comprueba que apunte AHÍ y no a
   cualquier otro sitio. */
const permitido = { 'plataforma/inicio.html': `${SITIO}/` };
const rotos = canonMal.filter((p) => permitido[p.f] !== p.canonical);
const sinCanon = paginas.filter((p) => !p.canonical);
sinCanon.forEach((p) => mal(`${p.f} no declara canonical`));
if (rotos.length) rotos.forEach((p) => mal(`${p.f} dice que la buena es ${p.canonical}`));
else if (!sinCanon.length) bien('Todas se declaran a sí mismas, salvo inicio.html que cede a «/» a propósito');

titulo('Los datos estructurados son legibles');
let bloques = 0, tipos = new Set();
for (const p of paginas) {
  for (const bruto of p.jsonLd) {
    bloques++;
    try {
      const d = JSON.parse(bruto);
      if (!d['@context']) mal(`${p.f}: un bloque JSON-LD sin @context`);
      const nodos = d['@graph'] || [d];
      for (const n of nodos) {
        if (!n['@type']) mal(`${p.f}: un nodo sin @type`);
        else tipos.add(n['@type']);
      }
    } catch (e) { mal(`${p.f}: el JSON-LD no se puede leer — ${e.message}`); }
  }
}
if (!bloques) mal('Ninguna página trae datos estructurados');
else bien(`${bloques} bloques válidos, con ${tipos.size} tipos: ${[...tipos].sort().join(', ')}`);

titulo('El sitemap y el sitio dicen lo mismo');
const mapa = existsSync(join(RAIZ, 'sitemap.xml')) ? leer('sitemap.xml') : '';
const enMapa = [...mapa.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (!enMapa.length) mal('El sitemap está vacío o no existe');
else {
  const faltanArchivo = enMapa.filter((u) => {
    const ruta = u.replace(SITIO, '').replace(/^\//, '') || 'index.html';
    const f = ruta.endsWith('/') ? `${ruta}index.html` : ruta;
    return !existsSync(join(RAIZ, f));
  });
  faltanArchivo.forEach((u) => mal(`El sitemap ofrece ${u} y ese archivo no existe`));

  /* Una página que cede su canonical a otra NO debe estar en el sitemap: sería
     ofrecerle a Google una dirección y decirle dentro «la buena es aquélla».
     Dos señales que se contradicen, y cuando se contradicen decide él. */
  const cede = (p) => p.canonical && p.canonical !== direccionDe(p.f);
  const fuera = paginas.filter((p) => !p.noindex && !cede(p) && !enMapa.includes(direccionDe(p.f)));
  fuera.forEach((p) => mal(`${p.f} se quiere indexar y no está en el sitemap`));

  const cedeYestá = paginas.filter((p) => cede(p) && enMapa.includes(direccionDe(p.f)));
  cedeYestá.forEach((p) => mal(
    `${p.f} está en el sitemap y a la vez dice que la buena es ${p.canonical}`));

  if (!faltanArchivo.length && !fuera.length && !cedeYestá.length) {
    const cedidas = paginas.filter(cede).length;
    bien(`Las ${enMapa.length} direcciones del sitemap existen, ninguna página indexable se`
      + ` queda fuera, y ${cedidas === 1 ? 'la que cede' : `las ${cedidas} que ceden`}`
      + ' su canonical no se ofrece por duplicado');
  }
}

titulo('El logotipo llega a quien lo pide');
/* Google enseñaba el sitio con un cuadrito negro y una «E»: su sustituto para
   cuando no encuentra favicon. Buscaba /favicon.ico en la raíz del dominio
   —lo hace ANTES de leer el HTML— y ahí había un 404. Lo único declarado era
   un SVG, que admite pero recoge peor. */
/* El `?v=…` es opcional en el patrón, y tiene que serlo: los iconos llevan
   marca de versión desde que se vio que el navegador guarda los favicon en una
   caché aparte, con la dirección como única llave, y seguía enseñando la «E»
   vieja aunque el servidor ya diera el birrete. Ver VERSION_ICONO en
   herramientas/iconos.mjs. Lo que esta comprobación exige es que la página
   DECLARE el .ico de la raíz, no que lo declare sin versión. */
const sinIco = paginas.filter((p) =>
  !/<link rel="icon" href="\/favicon\.ico(?:\?[^"]*)?"/.test(p.html));
const hayIco = existsSync(join(RAIZ, 'favicon.ico'));
if (!hayIco) mal('No existe /favicon.ico en la raíz: Google pondrá la inicial del dominio');
sinIco.forEach((p) => mal(`${p.f} no declara /favicon.ico`));
/* Y que el SVG tenga tamaño propio.
   ───────────────────────────────────────────────────────────────────────────
   Un SVG con sólo `viewBox` se dibuja bien dentro de un <img> que le dé
   medidas, pero como favicon no hay ningún <img>: el navegador tiene que
   deducir el tamaño del archivo, no lo encuentra, y descarta el icono. Eso
   pasó de verdad, y no se ve en ninguna parte salvo mirando la pestaña. */
const svg = join(RAIZ, 'plataforma', 'assets', 'favicon.svg');
if (existsSync(svg)) {
  const raiz = readFileSync(svg, 'utf8').match(/<svg[^>]*>/)?.[0] || '';
  if (!/\swidth=/.test(raiz) || !/\sheight=/.test(raiz)) {
    mal('favicon.svg no declara width y height en su etiqueta raíz: como icono'
      + ' el navegador no sabe a qué tamaño dibujarlo y pone la inicial del dominio');
  }
}

/* Y el OTRO logotipo, que no es el favicon aunque salga del mismo dibujo.
   ───────────────────────────────────────────────────────────────────────────
   El favicon va al lado del resultado de búsqueda; el `logo` de la organización
   va a la ficha de marca, y Google NO lo deduce del favicon: sin declarar, no
   hay logotipo y punto. Faltaba, y por eso se comprueba ahora.

   Se exige mapa de bits porque Google descarta un SVG en `logo` sin decir nada
   —el mismo silencio del `viewBox`— y se exige que el archivo exista de verdad:
   un `logo` que apunta a un 404 es igual de inútil que no ponerlo. */
let logosMal = 0, conLogo = 0;
for (const p of paginas) {
  for (const bloque of p.jsonLd) {
    let dato; try { dato = JSON.parse(bloque); } catch { continue; }
    const nodos = [dato, ...(dato['@graph'] || [])];
    const org = nodos.find((n) => n && /Organization/.test(String(n['@type'] || '')));
    if (!org) continue;
    const logo = typeof org.logo === 'string' ? org.logo : org.logo?.url;
    if (!logo) { logosMal++; mal(`${p.f} declara la organización sin «logo»: Google se queda sin logotipo de marca`); continue; }
    if (/\.svg(\?|$)/i.test(logo)) { logosMal++; mal(`${p.f} declara un SVG como «logo»; Google sólo acepta PNG, JPG o GIF ahí`); continue; }
    const enDisco = join(RAIZ, logo.replace(SITIO, '').replace(/^\//, ''));
    if (!existsSync(enDisco)) { logosMal++; mal(`${p.f} declara «logo» en ${logo}, que no existe en el repositorio`); continue; }
    conLogo++;
  }
}

if (hayIco && !sinIco.length && !logosMal) {
  const bytes = readFileSync(join(RAIZ, 'favicon.ico'));
  /* Que sea un .ico de verdad y no un PNG renombrado, que es el error clásico:
     los dos primeros campos son reservado=0 y tipo=1. */
  const esIco = bytes.readUInt16LE(0) === 0 && bytes.readUInt16LE(2) === 1;
  const cuantos = esIco ? bytes.readUInt16LE(4) : 0;
  if (!esIco) mal('/favicon.ico existe pero no tiene la cabecera de un .ico');
  else bien(`/favicon.ico está en la raíz con ${cuantos} tamaño(s) dentro, las`
    + ` ${paginas.length} páginas lo declaran, y las ${conLogo} que describen la`
    + ' escuela traen además su logotipo de marca en mapa de bits');
}

titulo('Nadie lleva un «noindex» puesto por descuido');
/* Las que SÍ deben llevarlo: el 404, y las pantallas que enseñan lo mismo que
   una página generada pero pintado con JavaScript. */
const CON_NOINDEX_A_PROPOSITO = new Set(['404.html']);
const indeseados = paginas.filter((p) => p.noindex && !CON_NOINDEX_A_PROPOSITO.has(p.f));
if (indeseados.length) indeseados.forEach((p) => mal(`${p.f} lleva noindex: no va a aparecer en Google`));
else bien('Ninguna página que se quiere posicionar se está escondiendo');

console.log('\n' + '═'.repeat(58));
if (problemas) {
  console.log(`✗ ${problemas} problema(s) de SEO.`);
  console.log('═'.repeat(58));
  process.exit(1);
}
console.log("✓ Las 8 comprobaciones de SEO pasaron.");
console.log('═'.repeat(58));
