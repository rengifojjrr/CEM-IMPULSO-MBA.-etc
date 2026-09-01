/* Las páginas que Google puede leer.
   ═══════════════════════════════════════════════════════════════════════════
   El problema que resuelve esto, medido antes de escribir una línea:

     · `plataforma/curso.html` tenía TREINTA caracteres de texto en el HTML.
       Todo lo demás lo pintaba JavaScript leyendo la base. Un buscador que no
       ejecuta JavaScript —y aunque lo ejecute, lo hace más tarde y peor— veía
       «Temario Profesor Certificación» y nada más.
     · Las direcciones eran `curso.html?id=3943e5b1-41ae-4866-…`. Ni una
       palabra de lo que se enseña, y la misma dirección base para los ocho
       programas, con el mismo <title> y la misma descripción.
     · No había sitemap ni robots.txt. En vivo daban 404.

   Un sitio en GitHub Pages no puede armar la página en el servidor, porque no
   hay servidor. Así que se arma ANTES: este programa lee los cursos publicados
   y escribe un archivo HTML por cada uno, con el texto dentro. Nada de trucos:
   la página que ve el buscador es exactamente la que ve una persona.

   Se ejecuta con:  node herramientas/generar-seo.mjs

   No necesita ninguna clave secreta. Un anónimo ya puede leer los cursos
   publicados —está comprobado contra la base, no supuesto— porque son
   justamente lo que el catálogo público enseña a quien no ha entrado. Por eso
   la tarea automática no pide configurar nada.

   Lo que escribe, todo dentro del repositorio:
     /programas/index.html      el catálogo, enlazando cada programa
     /programas/<nombre>.html   una página por programa
     /sitemap.xml               con su fecha de última modificación
     /robots.txt
*/

import { writeFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { traerTemario } from './temario.mjs';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITIO = 'https://escuelacem.com';

/* La tarjeta que se ve cuando alguien pega un enlace en WhatsApp o en X.
   Va absoluta porque quien la pide no es el navegador de nadie: es un robot
   que recibe el HTML suelto y no sabe desde dónde resolver una ruta relativa.
   Antes, un programa sin portada propia salía sin imagen y con la tarjeta
   pequeña; ahora al menos sale la de la escuela. */
const TARJETA = `${SITIO}/plataforma/assets/compartir.png`;
const BASE = 'https://vajbsfgojtunamhrzrpf.supabase.co';
const CLAVE = 'sb_publishable_Xljd7Ep1GxBXSPp5F4A1hg_Qg-iESzl';

/* La versión de los archivos compartidos se LEE de una pantalla que ya existe,
   no se escribe aquí.
   ───────────────────────────────────────────────────────────────────────────
   La escribí a mano primero y estaba mal: `versionar-assets.mjs` recorre las
   pantallas y les cambia el número, pero una constante en este archivo no la
   toca nadie. La primera vez que se versionara, las páginas generadas se
   quedarían pidiendo una hoja de estilos vieja —y la comprobación de que todas
   las pantallas van con la misma versión empezaría a fallar sin que la causa
   se pareciera al efecto. */
const VERSION_ASSETS = (() => {
  const donde = join(RAIZ, 'plataforma', 'inicio.html');
  const hallado = readFileSync(donde, 'utf8').match(/styles\.css\?v=([\w.-]+)/);
  if (!hallado) throw new Error(`No encuentro la versión de los assets en ${donde}.`);
  return hallado[1];
})();

/* La escuela, una vez, para no repetirla en cada página ni que se separen. */
const ESCUELA = {
  nombre: 'CEM International',
  nombreLargo: 'CEM · Centro de Estudios de Marketing',
  descripcion: 'Centro de estudios de marketing, negocios, inteligencia artificial y '
    + 'tecnología. Formación práctica con certificado verificable, para todas las edades.',
  fundada: '2016',
  ciudad: 'Caracas',
  pais: 'VE',
};

const HOY = new Date().toISOString().slice(0, 10);

// ── utilidades ────────────────────────────────────────────────────────────

const esc = (t) => String(t ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#39;');

/** El texto de un párrafo, sin etiquetas y de un solo renglón. */
const plano = (t) => String(t ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** Recorta sin cortar una palabra por la mitad. Las descripciones que Google
 *  enseña se cortan sobre los 155 caracteres; cortar a mitad de palabra se ve. */
function recortar(t, tope = 155) {
  const s = plano(t);
  if (s.length <= tope) return s;
  const corte = s.slice(0, tope - 1);
  return corte.slice(0, corte.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '') + '…';
}

/** «Marketing Digital Avanzado» → «marketing-digital-avanzado».
 *  Sin tildes ni eñes: una dirección con caracteres escapados (%C3%B1) se ve
 *  fea al compartirla y se rompe al copiarla a mano. */
function apodo(texto) {
  return String(texto ?? '')
    .replace(/[ñÑ]/g, 'n')
    // Se separa la letra de su tilde y se tira la tilde. El rango va escrito
    // en escapes y no con los caracteres sueltos: son invisibles en un editor
    // y cualquier copiado los pierde sin que se note.
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'programa';
}

async function traer(ruta) {
  const res = await fetch(`${BASE}/rest/v1/${ruta}`, {
    headers: { apikey: CLAVE, Authorization: `Bearer ${CLAVE}` },
  });
  if (!res.ok) throw new Error(`La base contestó ${res.status} a ${ruta}: ${await res.text()}`);
  return res.json();
}

// ── cómo se lee cada campo ────────────────────────────────────────────────

const MODALIDAD = {
  online: 'En línea, a tu ritmo',
  en_vivo: 'Clases en vivo',
  presencial: 'Presencial',
  hibrido: 'Híbrido: en vivo y grabado',
};
/* Lo que entiende schema.org, que no es lo mismo que lo que entiende una
   persona. «en_vivo» es en línea para Google —el alumno no se desplaza— y eso
   es lo que hay que decirle, aunque en la página se lea «clases en vivo». */
const MODALIDAD_SCHEMA = {
  online: 'Online', en_vivo: 'Online', presencial: 'Onsite', hibrido: 'Blended',
};
const NIVEL = { basico: 'Básico', intermedio: 'Intermedio', avanzado: 'Avanzado' };
const TIPO = {
  masterclass: 'Masterclass', curso: 'Curso', programa: 'Programa',
  diplomado: 'Diplomado', maestria: 'Maestría',
};

const dinero = (n, moneda) => {
  const v = Number(n) || 0;
  const simbolo = { EUR: '€', USD: '$', VES: 'Bs.' }[moneda] || moneda || '';
  return `${v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${simbolo}`.trim();
};

// ── el esqueleto compartido ───────────────────────────────────────────────

/* La cabecera se escribe AQUÍ, en el HTML, y no la pinta JavaScript como en el
   resto del sitio. Es a propósito: son los enlaces por los que un buscador
   recorre el sitio, y unos enlaces que sólo existen después de ejecutar
   JavaScript son enlaces que puede no llegar a ver. */
const cabecera = (activa) => `
<header class="pub-header estatica">
  <div class="pub-inner">
    ${/* La marca y «Inicio» apuntan a «/», no a /plataforma/inicio.html. Estos
          son los enlaces por los que un buscador recorre el sitio y por los que
          reparte autoridad: mandarlos a la dirección larga era regalarle la
          fuerza de la portada a una subcarpeta. */''}
    ${/* El birrete, y no un icono de la tipografía de Google.
          Los iconos de esta casa son ligaduras: si esa fuente tarda o no
          llega, en el sitio de la marca se lee la palabra «account_balance».
          En una página cualquiera es feo; en la portada del dominio, y encima
          la primera vez que alguien llega desde Google, es otra cosa. El
          favicon es un SVG de la casa, pesa nada y no depende de nadie. */''}
    <a class="pub-brand" href="${SITIO}/">
      ${/* `fetchpriority="high"` y NO `loading="lazy"`: esta imagen está en lo
            primero que se ve, y diferir algo que está arriba del todo retrasa
            justo lo que Google mide como Largest Contentful Paint. El lazy es
            para lo que hay que bajar a buscar. Lleva sus medidas para que el
            texto de al lado no dé un salto cuando llega. */''}
      <img src="${SITIO}/plataforma/assets/favicon.svg" alt="" width="22" height="22"
           style="vertical-align:-4px" decoding="async" fetchpriority="high"> ${ESCUELA.nombre}</a>
    <nav>
      <a href="${SITIO}/"${activa === 'inicio' ? ' class="on"' : ''}>Inicio</a>
      <a href="${SITIO}/programas/"${activa === 'programas' ? ' class="on"' : ''}>Programas</a>
      <a href="${SITIO}/plataforma/nosotros.html">Quiénes somos</a>
      <a href="${SITIO}/plataforma/verificar.html">Verificar certificado</a>
      <a href="${SITIO}/preguntas-frecuentes.html"${activa === 'preguntas' ? ' class="on"' : ''}>Preguntas</a>
    </nav>
    <div class="pub-cta">
      <a class="btn outline sm" href="${SITIO}/plataforma/index.html">Iniciar sesión</a>
      <a class="btn sm" href="${SITIO}/plataforma/index.html?registro=1">Registrarse</a>
    </div>
  </div>
</header>`;

const pie = () => `
<footer class="franja tenue" style="margin-top:var(--e4)">
  <div class="dentro" style="display:flex;flex-wrap:wrap;gap:var(--e3);justify-content:space-between">
    <div>
      <b>${ESCUELA.nombre}</b>
      <p class="tiny muted" style="max-width:46ch">${esc(ESCUELA.descripcion)}</p>
    </div>
    <nav class="tiny" style="display:flex;flex-direction:column;gap:6px">
      <a href="${SITIO}/programas/">Todos los programas</a>
      <a href="${SITIO}/plataforma/nosotros.html">Quiénes somos</a>
      <a href="${SITIO}/plataforma/verificar.html">Verificar un certificado</a>
      <a href="${SITIO}/plataforma/index.html?registro=1">Crear mi cuenta</a>
    </nav>
  </div>
</footer>`;

/**
 * Envuelve el contenido con todo lo que una página necesita para existir en un
 * buscador y al compartirla: título propio, descripción propia, canonical,
 * Open Graph, tarjeta de Twitter y los datos estructurados.
 */
/* Lo mínimo para que la página se vea mientras baja el resto.
   ═══════════════════════════════════════════════════════════════════════════
   `styles.css` pesa 216 KB y hasta que llega el navegador no pinta nada: eso
   es la pantalla en blanco que mide Google como «Largest Contentful Paint», y
   es factor de posicionamiento desde 2021. Aquí va sólo lo que ocupa el primer
   pantallazo —los colores, la tipografía, el ancho de la columna, la
   cabecera—, en línea, para que el texto esté en pantalla antes de que el CSS
   grande termine de bajar. Cuando llega, manda él: esto no lleva !important ni
   pelea con nada, sólo llega antes. */
const CSS_CRITICO = `
:root{--fondo:#f4f6f8;--papel:#fff;--tinta:#1f2937;--tinta-2:#6b7280;
  --filete:#dde3ea;--primary:#132743;--on-primary:#fff;--secondary:#1b7f76;}
@media (prefers-color-scheme:dark){:root{--fondo:#111418;--papel:#181b20;
  --tinta:#e9ecef;--tinta-2:#a6adb8;--filete:#2a2f38;--primary:#a9c6ec;
  --on-primary:#0d2440;--secondary:#5ecfc2;}}
body{margin:0;background:var(--fondo);color:var(--tinta);
  font-family:'Hanken Grotesk',-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
  line-height:1.6;}
.pub-header{background:var(--papel);border-bottom:1px solid var(--filete);}
.pub-inner{max-width:1080px;margin:0 auto;padding:12px 20px;display:flex;
  flex-wrap:wrap;align-items:center;gap:16px;}
.pub-brand{font-weight:700;color:var(--tinta);text-decoration:none;}
.pub-main{max-width:1080px;margin:0 auto;padding:24px 20px 64px;}
h1{font-size:clamp(26px,5vw,40px);line-height:1.15;margin:0 0 12px;}
h2{font-size:22px;margin:32px 0 10px;}
h3{font-size:17px;margin:0 0 6px;}
a{color:var(--secondary);}
.entrada{font-size:18px;color:var(--tinta-2);max-width:62ch;}
.caja{background:var(--papel);border:1px solid var(--filete);border-radius:10px;}
.migas{font-size:13px;color:var(--tinta-2);margin:0 0 14px;}
.migas a{color:var(--tinta-2);}
.tiny{font-size:13px;}
.muted{color:var(--tinta-2);}`.replace(/\n\s*/g, '');

/* El rastro de migas, que sirve para dos cosas a la vez: una persona sabe
   dónde está, y Google enseña «escuelacem.com › Programas › Marketing Digital»
   en vez de la dirección cruda. Lo segundo necesita además el BreadcrumbList
   de los datos estructurados, que se arma con esta misma lista. */
const migas = (pasos) => `
  <nav class="migas" aria-label="Dónde estás">
    ${pasos.map((p, i) => (i === pasos.length - 1
      ? `<span aria-current="page">${esc(p.nombre)}</span>`
      : `<a href="${esc(p.url)}">${esc(p.nombre)}</a> ›`)).join(' ')}
  </nav>`;

const migasJsonLd = (pasos) => ({
  '@type': 'BreadcrumbList',
  itemListElement: pasos.map((p, i) => ({
    '@type': 'ListItem', position: i + 1, name: plano(p.nombre),
    ...(p.url ? { item: p.url } : {}),
  })),
});

function pagina({ titulo, descripcion, url, cuerpo, jsonLd, imagen, activa, profundidad }) {
  const arriba = '../'.repeat(profundidad);
  return `<!doctype html>
<html lang="es" data-publico="si">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descripcion)}">
<link rel="canonical" href="${esc(url)}">
${/* El .ico va con dirección absoluta y el primero. Google lo busca en la raíz
      del dominio ANTES de leer esta línea, y mientras no estuvo enseñaba en el
      resultado de búsqueda un cuadrito negro con la inicial del dominio.
      Ver herramientas/iconos.mjs. */''}
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" type="image/png" sizes="96x96" href="${arriba}plataforma/assets/favicon-96.png">
<link rel="icon" type="image/svg+xml" href="${arriba}plataforma/assets/favicon.svg">
<link rel="apple-touch-icon" href="${arriba}plataforma/assets/icono-180.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#0d2440">

<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(ESCUELA.nombre)}">
<meta property="og:locale" content="es_ES">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descripcion)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(imagen || TARJETA)}">
<meta property="og:image:alt" content="${esc(titulo)}">
${/* Las medidas van declaradas. Sin ellas, WhatsApp y X no saben si la imagen
      es grande o pequeña hasta bajarla, y por si acaso pintan la tarjeta
      chica —la de una línea— en vez de la grande con foto. */''}
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(descripcion)}">
<meta name="twitter:image" content="${esc(imagen || TARJETA)}">
<meta name="twitter:image:alt" content="${esc(titulo)}">
${/* En qué idioma y para quién. El sitio está sólo en castellano, así que el
      hreflang se apunta a sí mismo y declara «x-default»: sin eso, un buscador
      que ve una página en español y a alguien buscando en español desde México
      no tiene forma de saber que ésta es LA versión, no una de varias. */''}
<link rel="alternate" hreflang="es" href="${esc(url)}">
<link rel="alternate" hreflang="x-default" href="${esc(url)}">
<meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1">

<!-- Los servidores de fuera, avisados de golpe y no en fila.
     Sin esto el navegador descubre cada uno cuando le toca y paga el DNS y el
     saludo TLS de cada cual por separado, con la pantalla en blanco mientras
     tanto. El de fonts.gstatic.com estaba DESPUÉS de la hoja que lo dispara,
     o sea llegando tarde a su propia fiesta.

     Esto vive aquí y no en el HTML generado, y esa distinción costó una
     regresión: herramientas/acelerar-cabeceras.mjs arregló las 75 pantallas
     escritas a mano Y las de /programas/, pero éstas se regeneran solas cada
     noche desde esta plantilla — así que a la mañana siguiente volvían atrás.
     Lo que se genera se arregla en el generador. -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<style>${CSS_CRITICO}</style>
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block" rel="stylesheet">
<link rel="stylesheet" href="${arriba}plataforma/assets/styles.css?v=${VERSION_ASSETS}">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="cem-publico">
${cabecera(activa)}
${cuerpo}
${pie()}
</body>
</html>
`;
}

// ── una página por programa ───────────────────────────────────────────────

function paginaDelPrograma(c, modulos, lecciones, cohortes) {
  const url = `${SITIO}/programas/${c.apodo}.html`;
  const tipo = TIPO[c.tipo] || 'Programa';
  const modalidad = MODALIDAD[c.modalidad] || '';
  const nivel = NIVEL[c.nivel] || '';

  /* El título es lo que se lee en el resultado de Google, y ahí caben unos 60
     caracteres antes de que lo corte con puntos suspensivos.
     ─────────────────────────────────────────────────────────────────────────
     Va primero el nombre del programa —que es lo que la persona escribió en el
     buscador— y las coletillas después, en orden de menos a más prescindible.
     Si el nombre ya es largo, se sueltan por la cola en vez de dejar que Google
     corte por donde le toque: perder «CEM» al final es barato, perder la mitad
     del nombre del programa no. */
  const nombre = plano(c.nombre);
  const donde = c.modalidad === 'presencial' ? 'presencial' : 'online';
  const titulo = [
    `${nombre} · ${tipo} ${donde} | ${ESCUELA.nombre}`,
    `${nombre} · ${tipo} ${donde} | CEM`,
    `${nombre} | ${ESCUELA.nombre}`,
    `${nombre} | CEM`,
    nombre,
  ].find((t) => t.length <= 60) || nombre;

  const descripcion = recortar(
    c.descripcion_corta || c.subtitulo || c.descripcion
    || `${tipo} de ${ESCUELA.nombre}${c.horas ? ` de ${c.horas} horas` : ''}`
       + `${modalidad ? `, ${modalidad.toLowerCase()}` : ''}, con certificado verificable.`);

  const mios = modulos.filter((m) => m.course_id === c.id)
    .sort((a, b) => (a.orden || 0) - (b.orden || 0));
  const proxima = cohortes
    .filter((h) => h.course_id === c.id && h.fecha_inicio)
    .sort((a, b) => String(a.fecha_inicio).localeCompare(String(b.fecha_inicio)))[0];

  /* Los datos estructurados. Es lo que convierte un resultado normal en uno
     con el precio, la duración y la modalidad a la vista. Google exige que un
     Course lleve al menos una instancia con su modalidad y su carga de
     trabajo; sin eso lo ignora en silencio, que es la forma más fácil de
     creer que se hizo y no haber hecho nada. */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Course',
        '@id': `${url}#curso`,
        name: plano(c.nombre),
        description: plano(c.descripcion || c.descripcion_corta || descripcion),
        url,
        inLanguage: 'es',
        ...(c.imagen_url ? { image: c.imagen_url } : {}),
        ...(c.categoria ? { about: plano(c.categoria) } : {}),
        ...(nivel ? { educationalLevel: nivel } : {}),
        ...(c.certificado_nombre
          ? { educationalCredentialAwarded: plano(c.certificado_nombre) } : {}),
        ...(mios.length ? { syllabusSections: mios.map((m, i) => ({
          '@type': 'Syllabus',
          name: plano(m.titulo),
          position: i + 1,
          ...(m.descripcion ? { description: plano(m.descripcion) } : {}),
        })) } : {}),
        provider: { '@type': 'EducationalOrganization', name: ESCUELA.nombre, url: SITIO },
        offers: [{
          '@type': 'Offer',
          category: Number(c.precio) > 0 ? 'Paid' : 'Free',
          price: Number(c.precio) || 0,
          priceCurrency: c.moneda || 'EUR',
          availability: 'https://schema.org/InStock',
          url,
        }],
        hasCourseInstance: [{
          '@type': 'CourseInstance',
          courseMode: MODALIDAD_SCHEMA[c.modalidad] || 'Online',
          ...(c.horas ? { courseWorkload: `PT${Number(c.horas)}H` } : {}),
          ...(proxima ? { startDate: proxima.fecha_inicio } : {}),
          inLanguage: 'es',
          courseSchedule: {
            '@type': 'Schedule',
            repeatFrequency: 'Weekly',
            repeatCount: Math.max(1, mios.length || 4),
          },
        }],
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Inicio', item: `${SITIO}/plataforma/inicio.html` },
          { '@type': 'ListItem', position: 2, name: 'Programas', item: `${SITIO}/programas/` },
          { '@type': 'ListItem', position: 3, name: plano(c.nombre), item: url },
        ],
      },
    ],
  };

  const ficha = [
    ['schedule', 'Duración', c.duracion_texto
      || (c.horas ? `${c.horas} ${Number(c.horas) === 1 ? 'hora' : 'horas'}` : null)],
    ['devices', 'Modalidad', modalidad],
    ['stairs', 'Nivel', nivel],
    ['category', 'Área', c.categoria],
    ['workspace_premium', 'Certificado', c.certificado_nombre || 'Certificado verificable'],
    ['event', 'Próximo inicio', proxima?.fecha_inicio
      ? new Date(proxima.fecha_inicio + 'T00:00:00').toLocaleDateString('es-ES',
          { day: 'numeric', month: 'long', year: 'numeric' })
      : 'Inscripción abierta'],
  ].filter(([, , v]) => v);

  const cuerpo = `
<main class="pub-main" style="max-width:1080px">
  <nav class="tiny muted" aria-label="Dónde estás" style="margin-bottom:var(--e2)">
    <a href="${SITIO}/plataforma/inicio.html">Inicio</a> ›
    <a href="${SITIO}/programas/">Programas</a> ›
    <span>${esc(plano(c.nombre))}</span>
  </nav>

  <article>
    <p class="ojal">${esc(tipo)}${c.categoria ? ` · ${esc(plano(c.categoria))}` : ''}</p>
    <h1>${esc(plano(c.nombre))}</h1>
    ${c.subtitulo ? `<p class="entrada">${esc(plano(c.subtitulo))}</p>` : ''}

    <div class="row sep" style="gap:12px;align-items:center;flex-wrap:wrap">
      <span class="cuota-monto">${esc(dinero(c.precio, c.moneda))}</span>
      ${/* A `comprar.html`, no a la inscripción de siempre. Estas páginas son
            justo las que encuentra alguien que llega de Google y no nos
            conoce: mandarlo a una pantalla que exige sesión es pedirle que se
            registre antes de dejarle comprar. `comprar.html` pide nombre y
            correo y va a la pasarela; si resulta que ya tenía sesión abierta,
            ella misma lo devuelve al camino de siempre. */''}
      <a class="btn gold" href="${SITIO}/plataforma/comprar.html?curso=${esc(c.id)}">
        Inscribirme <span class="material-symbols-outlined">arrow_forward</span></a>
      <a class="btn outline" href="${SITIO}/plataforma/curso.html?id=${esc(c.id)}">Ver la ficha completa</a>
    </div>

    <dl class="grid" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr));
        gap:var(--e2);margin:var(--e3) 0">
      ${ficha.map(([ico, k, v]) => `<div class="caja" style="padding:14px">
        <dt class="tiny muted" style="display:flex;align-items:center;gap:6px">
          <span class="material-symbols-outlined" style="font-size:17px">${ico}</span>${esc(k)}</dt>
        <dd style="margin:4px 0 0;font-weight:600">${esc(plano(v))}</dd></div>`).join('')}
    </dl>

    ${c.descripcion ? `<section>
      <h2>De qué va</h2>
      ${plano(c.descripcion).split(/\n{2,}|(?<=\.)\s{2,}/).filter(Boolean)
        .map((p) => `<p>${esc(p)}</p>`).join('')}
    </section>` : ''}

    ${mios.length ? `<section>
      <h2>Temario</h2>
      <ol class="hilo">
        ${mios.map((m) => {
          const suyas = lecciones.filter((l) => l.module_id === m.id)
            .sort((a, b) => (a.orden || 0) - (b.orden || 0));
          return `<li>
            <h3>${esc(plano(m.titulo))}</h3>
            ${m.descripcion ? `<p class="tiny muted">${esc(plano(m.descripcion))}</p>` : ''}
            ${suyas.length ? `<ul class="tiny muted">${suyas
              .map((l) => `<li>${esc(plano(l.titulo))}</li>`).join('')}</ul>` : ''}
          </li>`;
        }).join('')}
      </ol>
    </section>` : ''}

    <section class="caja" style="padding:var(--e3);margin-top:var(--e3)">
      <h2 style="margin-top:0">¿Te apuntas?</h2>
      <p>Puedes pagar de una vez con un 10 % de descuento, o repartirlo en 3 o 6 cuotas.
        Al terminar recibes tu ${esc(plano(c.certificado_nombre || 'certificado'))}, con un
        código que cualquiera puede comprobar en nuestra web.</p>
      <a class="btn gold" href="${SITIO}/plataforma/comprar.html?curso=${esc(c.id)}">
        Inscribirme en ${esc(plano(c.nombre))}</a>
    </section>
  </article>
</main>`;

  return pagina({
    titulo, descripcion, url, cuerpo, jsonLd,
    imagen: c.imagen_url || null, activa: 'programas', profundidad: 1,
  });
}

// ── el catálogo estático ──────────────────────────────────────────────────

function paginaDelCatalogo(cursos, temario) {
  const url = `${SITIO}/programas/`;
  const nModulos = temario.diplomados.reduce((a, d) => a + d.modulos.length, 0);
  /* El título era palabra por palabra el mismo que el de la portada. Dos
     páginas con el mismo <title> compiten entre ellas por la misma búsqueda y
     Google acaba escogiendo una —normalmente la que no quieres—. */
  const titulo = `Diplomados y módulos del CEM · ${nModulos} certificaciones | ${ESCUELA.nombre}`;
  const descripcion = recortar(
    `Los ${temario.diplomados.length} diplomados del CEM y sus ${nModulos} módulos, cada uno `
    + `con certificado propio y verificable: marketing digital, inteligencia artificial, `
    + `video, Photoshop, Illustrator, branding y más.`);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'EducationalOrganization',
        '@id': `${SITIO}#escuela`,
        name: ESCUELA.nombre,
        alternateName: ESCUELA.nombreLargo,
        description: ESCUELA.descripcion,
        url: SITIO,
        foundingDate: ESCUELA.fundada,
        address: { '@type': 'PostalAddress', addressLocality: ESCUELA.ciudad, addressCountry: ESCUELA.pais },
      },
      {
        '@type': 'ItemList',
        name: 'Programas del CEM',
        numberOfItems: cursos.length,
        itemListElement: cursos.map((c, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: plano(c.nombre),
          url: `${SITIO}/programas/${c.apodo}.html`,
        })),
      },
    ],
  };

  /* Agrupados por área. Un listado de veinte cosas seguidas no lo lee nadie, y
     los encabezados de cada grupo son además las palabras por las que se
     busca: «marketing digital», «inteligencia artificial». */
  const areas = [...new Set(cursos.map((c) => plano(c.categoria) || 'Otros programas'))].sort();

  const pasos = [{ nombre: 'Inicio', url: `${SITIO}/` }, { nombre: 'Programas' }];
  jsonLd['@graph'].push(migasJsonLd(pasos));
  jsonLd['@graph'].push({
    '@type': 'ItemList',
    name: 'Diplomados y módulos del CEM',
    numberOfItems: temario.diplomados.length + nModulos,
    itemListElement: [
      ...temario.diplomados.map((d, i) => ({
        '@type': 'ListItem', position: i + 1, name: d.nombre,
        url: `${SITIO}/programas/${d.apodo}.html`,
      })),
      ...temario.diplomados.flatMap((d) => d.modulos).map((m, i) => ({
        '@type': 'ListItem', position: temario.diplomados.length + i + 1, name: m.nombre,
        url: `${SITIO}/programas/${m.apodo}.html`,
      })),
    ],
  });

  const cuerpo = `
<section class="portada-cem centrada">
  <div class="dentro">
    ${migas(pasos)}
    <span class="ojal">${temario.diplomados.length} diplomados · ${nModulos} certificaciones</span>
    <h1>Programas del CEM</h1>
    <p class="lema">Dos diplomados de ocho módulos cada uno. Cada módulo se certifica por
      separado, con su propio código de verificación.</p>
  </div>
</section>

${temario.diplomados.map((d, i) => `
<section class="franja${i % 2 === 0 ? ' tenue' : ''}">
  <div class="dentro">
    <span class="ojal">Diplomado</span>
    <h2 style="margin-top:0"><a href="${SITIO}/programas/${d.apodo}.html">${esc(d.nombre)}</a></h2>
    <p class="entrada">${esc(d.que)}</p>
    <p class="avala" style="--mod-color:${d.modulos[0]?.color || 'var(--primary)'}">
      <span class="punto"></span>
      ${d.personas} personas lo han cursado en ${d.promociones}
      promoci${d.promociones === 1 ? 'ón' : 'ones'} · ${d.diplomas} diplomas de cierre emitidos</p>
    <div class="rejilla-modulos" style="margin-top:var(--e3)">
      ${d.modulos.map((m) => tarjetaModulo(m, d)).join('')}
    </div>
  </div>
</section>`).join('')}

${!cursos.length ? '' : `
<section class="franja">
  <div class="dentro">
    <h2>Convocatorias abiertas</h2>
    <p class="entrada">${cursos.length === 1 ? 'Un programa' : `${cursos.length} programas`}
      con inscripción abierta ahora mismo.</p>
    ${areas.map((area) => {
      const suyos = cursos.filter((c) => (plano(c.categoria) || 'Otros programas') === area);
      return `<h3>${esc(area)}</h3>
      <div class="rejilla-modulos">
        ${suyos.map((c) => `<a class="mod" style="--mod-color:var(--primary)"
          href="${SITIO}/programas/${esc(c.apodo)}.html">
          <div class="mod-cubierta"><span class="material-symbols-outlined"
            aria-hidden="true">school</span></div>
          <div class="mod-cuerpo"><h3>${esc(plano(c.nombre))}</h3>
            <p>${esc(recortar(c.descripcion_corta || c.subtitulo || '', 96))}</p>
            <p class="mod-pie">${esc(dinero(c.precio, c.moneda))}</p></div></a>`).join('')}
      </div>`;
    }).join('')}
  </div>
</section>`}

${bloqueCertificado(temario, `
    <p class="tiny muted" style="margin-top:var(--e3)">Si no tienes claro cuál de los dos te
      sirve, o quieres cursar un módulo suelto,
      <a href="${SITIO}/plataforma/nosotros.html">escríbenos</a>. Las
      <a href="${SITIO}/preguntas-frecuentes.html">preguntas frecuentes</a> contestan lo que más
      nos preguntan.</p>`)}`;

  return pagina({ titulo, descripcion, url, cuerpo, jsonLd, activa: 'programas', profundidad: 1 });
}

// ── el temario: dos diplomados y dieciséis módulos ────────────────────────
/* Todo lo de aquí abajo se escribe con lo que la base SABE —cuánta gente tiene
   cada certificado, en cuántas promociones se dio— y con las definiciones de
   herramientas/temario.mjs. Ni un precio, ni un horario, ni una fecha de la
   próxima convocatoria: eso no lo sé, y una página que lo invente es una
   página que miente en el primer resultado de Google. */

/** La escuela, en datos estructurados. Una sola vez, referenciada por @id. */
const escuelaJsonLd = () => ({
  '@type': 'EducationalOrganization',
  '@id': `${SITIO}#escuela`,
  name: ESCUELA.nombre,
  alternateName: ESCUELA.nombreLargo,
  description: ESCUELA.descripcion,
  url: SITIO,
  foundingDate: ESCUELA.fundada,
  address: { '@type': 'PostalAddress', addressLocality: ESCUELA.ciudad, addressCountry: ESCUELA.pais },
  areaServed: { '@type': 'Country', name: 'Venezuela' },
  inLanguage: 'es',
});

/** Un módulo o un diplomado, como `Course` de schema.org. */
function cursoJsonLd({ nombre, que, url, esParteDe }) {
  return {
    '@type': 'Course',
    '@id': `${url}#curso`,
    name: nombre,
    description: recortar(que, 300),
    url,
    inLanguage: 'es',
    provider: { '@id': `${SITIO}#escuela` },
    /* `hasCourseInstance` es obligatorio para que Google lo tome como curso, y
       aquí sólo se declara lo que es cierto: se imparte en línea y en
       castellano. NO se pone precio ni fecha de inicio: no los sé, y un dato
       inventado en los datos estructurados es exactamente lo que hace que
       Google deje de fiarse del sitio entero. */
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: 'Online',
      inLanguage: 'es',
      courseWorkload: 'PT0H',
    },
    ...(esParteDe ? { isPartOf: { '@type': 'Course', '@id': `${esParteDe}#curso` } } : {}),
  };
}

/** «48 personas ya tienen este certificado, de 4 promociones». */
function loQueAvala(m) {
  const p = m.personas === 1 ? '1 persona tiene' : `${m.personas} personas tienen`;
  const q = m.promociones === 1 ? 'una promoción' : `${m.promociones} promociones`;
  return `${p} este certificado, de ${q}.`;
}

/* ── las piezas visuales, compartidas por las cuatro páginas ───────────────
   Se escriben una vez y se usan en la portada, en el índice, en la página del
   diplomado y en la del módulo. Así el mismo módulo se ve igual en los cuatro
   sitios, que es lo que hace que un sitio parezca uno y no cuatro. */

/** La tarjeta de un módulo: su cubierta de color, su nombre y su definición. */
const tarjetaModulo = (m, dip, { conDiplomado = false } = {}) => `
  <a class="mod" style="--mod-color:${m.color}" href="${SITIO}/programas/${m.apodo}.html">
    <div class="mod-cubierta">
      <span class="mod-numero">Módulo ${m.orden}${conDiplomado ? ` · ${esc(dip.corto)}` : ''}</span>
      <span class="mod-cifra">${String(m.orden).padStart(2, '0')}</span>
      <span class="material-symbols-outlined" aria-hidden="true">${m.icono}</span>
    </div>
    <div class="mod-cuerpo">
      <h3>${esc(m.nombre)}</h3>
      <p>${esc(recortar(m.que, 96))}</p>
      <p class="mod-pie">${m.personas} con este certificado</p>
    </div>
  </a>`;

/** Los ocho módulos como puntos de color. `aqui` marca en cuál estás. */
const tiraDeModulos = (dip, aqui) => `
  <nav class="tira-modulos" aria-label="Los ocho módulos del ${esc(dip.corto)}">
    ${dip.modulos.map((m) => `<a style="--p:${m.color}" href="${SITIO}/programas/${m.apodo}.html"
      title="Módulo ${m.orden} · ${esc(m.nombre)}"${m.apodo === aqui ? ' aria-current="page"' : ''}
      >${m.orden}</a>`).join('')}
  </nav>`;

/** El bloque del certificado, que es el argumento de venta que sí es cierto. */
const bloqueCertificado = (temario, dentro) => `
<section class="franja tenue">
  <div class="dentro estrecho" style="text-align:center">
    <span class="ojal">Lo que te llevas</span>
    <h2>Un certificado que cualquiera puede comprobar</h2>
    <p class="entrada" style="margin-left:auto;margin-right:auto">Cada certificado del CEM lleva
      un código único y un QR. Quien lo reciba —una empresa que va a contratar, un cliente—
      escribe ese código o la cédula y ve ahí mismo si es auténtico, a nombre de quién está y de
      qué es. Sin crear ninguna cuenta.</p>
    <div class="cifras-casa" style="margin:var(--e3) 0">
      <div><b>${esc(temario.totales.certificados)}</b><span>certificados comprobables</span></div>
      <div><b>${esc(temario.totales.personas)}</b><span>personas graduadas</span></div>
      <div><b>${esc(temario.totales.promociones)}</b><span>promociones</span></div>
    </div>
    <a class="btn" href="${SITIO}/plataforma/verificar.html">
      <span class="material-symbols-outlined" aria-hidden="true">verified</span>
      Verificar un certificado</a>
    ${dentro || ''}
  </div>
</section>`;

function paginaDelModulo(mod, dip, temario) {
  const url = `${SITIO}/programas/${mod.apodo}.html`;
  const urlDip = `${SITIO}/programas/${dip.apodo}.html`;
  const titulo = `${mod.nombre} · Módulo ${mod.orden} del ${dip.nombre} | ${ESCUELA.nombre}`;
  const descripcion = recortar(`${mod.que} Módulo ${mod.orden} de 8 del ${dip.nombre} `
    + `del CEM, con certificado propio y verificable. ${loQueAvala(mod)}`);
  const pasos = [
    { nombre: 'Inicio', url: `${SITIO}/` },
    { nombre: 'Programas', url: `${SITIO}/programas/` },
    { nombre: dip.corto, url: urlDip },
    { nombre: mod.nombre },
  ];
  const hermanos = dip.modulos.filter((x) => x.apodo !== mod.apodo);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [escuelaJsonLd(), migasJsonLd(pasos),
      cursoJsonLd({ nombre: mod.nombre, que: mod.que, url, esParteDe: urlDip })],
  };

  const cuerpo = `
<section class="portada-cem cabecera-tema" style="--mod-color:${mod.color}">
  <div class="dentro">
    ${migas(pasos)}
    <div class="medallon-tema"><span class="material-symbols-outlined" aria-hidden="true"
      >${mod.icono}</span></div>
    <span class="ojal" style="color:${mod.color}">Módulo ${mod.orden} de 8 · ${esc(dip.corto)}</span>
    <h1 class="titular-largo">${esc(mod.nombre)}</h1>
    <p class="lema">${esc(mod.que)}</p>
    ${tiraDeModulos(dip, mod.apodo)}
    <p class="avala"><span class="punto"></span> ${esc(loQueAvala(mod))}</p>
    <div class="portada-manos" style="margin-top:var(--e3)">
      <a class="btn" href="${urlDip}">Ver el ${esc(dip.corto)} completo</a>
      <a class="btn outline" href="${SITIO}/plataforma/verificar.html">Verificar un certificado</a>
    </div>
  </div>
</section>

<section class="franja">
  <div class="dentro estrecho">
    <h2>Se certifica por separado</h2>
    <p>Este módulo forma parte del <a href="${urlDip}">${esc(dip.nombre)}</a>, pero no hay que
      hacer el diplomado entero para tenerlo: al terminarlo se emite un certificado a nombre de
      la persona, con su propio código. Quien completa los ocho recibe además el diploma de
      cierre.</p>
    <p class="tiny muted">El CEM lleva ${esc(temario.totales.certificados)} certificados emitidos
      y ${esc(temario.totales.personas)} personas graduadas desde ${ESCUELA.fundada}. Todos se
      pueden comprobar uno a uno.</p>
  </div>
</section>

<section class="franja tenue">
  <div class="dentro">
    <h2>Los otros módulos del ${esc(dip.corto)}</h2>
    <p class="entrada">Cada uno con su certificado, y en este orden.</p>
    <div class="rejilla-modulos">
      ${hermanos.map((h) => tarjetaModulo(h, dip)).join('')}
    </div>
  </div>
</section>

<section class="franja">
  <div class="dentro estrecho" style="text-align:center">
    <h2>¿Cuándo abre la próxima promoción?</h2>
    <p class="entrada" style="margin-left:auto;margin-right:auto">Las fechas y el precio cambian
      con cada convocatoria, así que no los dejamos escritos aquí para no darte un dato viejo.
      Escríbenos y te decimos los de la que está abierta.</p>
    <div class="portada-manos" style="justify-content:center">
      <a class="btn" href="${SITIO}/plataforma/nosotros.html">Escribirnos</a>
      <a class="btn outline" href="${SITIO}/plataforma/index.html?registro=1">Crear mi cuenta</a>
    </div>
  </div>
</section>`;

  return pagina({ titulo, descripcion, url, cuerpo, jsonLd, activa: 'programas', profundidad: 1 });
}

function paginaDelDiplomado(dip, temario) {
  const url = `${SITIO}/programas/${dip.apodo}.html`;
  const titulo = `${dip.nombre} | ${ESCUELA.nombre}`;
  const descripcion = recortar(`${dip.que} ${dip.personas} personas lo han cursado en `
    + `${dip.promociones} promociones. Certificado verificable por cada módulo.`);
  const pasos = [
    { nombre: 'Inicio', url: `${SITIO}/` },
    { nombre: 'Programas', url: `${SITIO}/programas/` },
    { nombre: dip.corto },
  ];

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      escuelaJsonLd(), migasJsonLd(pasos),
      cursoJsonLd({ nombre: dip.nombre, que: dip.que, url }),
      {
        '@type': 'ItemList',
        name: `Módulos del ${dip.nombre}`,
        numberOfItems: dip.modulos.length,
        itemListElement: dip.modulos.map((m) => ({
          '@type': 'ListItem', position: m.orden, name: m.nombre,
          url: `${SITIO}/programas/${m.apodo}.html`,
        })),
      },
    ],
  };

  const color = dip.modulos[0]?.color || '#0091FF';
  const cuerpo = `
<section class="portada-cem cabecera-tema" style="--mod-color:${color}">
  <div class="dentro">
    ${migas(pasos)}
    <span class="ojal">Diplomado · 8 módulos · certificado por módulo</span>
    <h1 class="titular-largo">${esc(dip.nombre)}</h1>
    <p class="lema">${esc(dip.que)}</p>
    ${tiraDeModulos(dip)}
    <div class="portada-manos" style="margin-top:var(--e3)">
      <a class="btn" href="${SITIO}/plataforma/nosotros.html">Preguntar por la próxima promoción</a>
      <a class="btn outline" href="${SITIO}/plataforma/verificar.html">Verificar un certificado</a>
    </div>
  </div>
</section>

<section class="franja tenue">
  <div class="dentro">
    <div class="cifras-casa">
      <div><b>8</b><span>módulos, cada uno con su certificado</span></div>
      <div><b>${dip.personas}</b><span>personas lo han cursado</span></div>
      <div><b>${dip.promociones}</b><span>promociones impartidas</span></div>
      <div><b>${dip.diplomas}</b><span>diplomas de cierre emitidos</span></div>
    </div>
  </div>
</section>

<section class="franja">
  <div class="dentro">
    <h2>Los ocho módulos</h2>
    <p class="entrada">En este orden. Cada uno se certifica por separado, así que se puede
      cursar suelto; quien los completa todos recibe además el diploma del diplomado.</p>
    <div class="rejilla-modulos">
      ${dip.modulos.map((m) => tarjetaModulo(m, dip)).join('')}
    </div>
  </div>
</section>

${bloqueCertificado(temario)}`;

  return pagina({ titulo, descripcion, url, cuerpo, jsonLd, activa: 'programas', profundidad: 1 });
}

/* Las preguntas que de verdad se hacen, con las respuestas que de verdad sé.
   Ninguna inventa precios ni fechas: cuando la respuesta honesta es «escríbenos»,
   dice «escríbenos». */
const PREGUNTAS = (t) => [
  ['¿El certificado del CEM se puede verificar?',
   'Sí. Cada certificado lleva un código único y un código QR. Cualquiera puede comprobar '
   + `en escuelacem.com/plataforma/verificar.html que es auténtico, a nombre de quién está y `
   + `de qué es, sin necesidad de crear una cuenta. Ahora mismo hay ${t.totales.certificados} `
   + 'certificados emitidos y comprobables.'],
  ['¿Puedo cursar un solo módulo o tengo que hacer el diplomado entero?',
   'Cada uno de los ocho módulos de cada diplomado se certifica por separado. Quien hace un '
   + 'solo módulo se lleva igualmente su certificado, con su propio código. Quien los completa '
   + 'todos recibe además el diploma del diplomado.'],
  ['¿Qué diplomados imparte el CEM?',
   'Dos: el Diplomado en Marketing Digital y el Diplomado en Inteligencia Artificial y '
   + 'Producción Digital, de ocho módulos cada uno.'],
  ['¿Desde cuándo existe el CEM?',
   `Desde ${ESCUELA.fundada}. Hasta hoy ha emitido ${t.totales.certificados} certificados a `
   + `${t.totales.personas} personas, en ${t.totales.promociones} promociones.`],
  ['¿Las clases son en línea o presenciales?',
   'Las promociones se imparten con clases en vivo y el material queda disponible en la '
   + 'plataforma. Para saber el horario de la próxima convocatoria, escríbenos.'],
  ['¿Cuánto cuesta y cuándo empieza la próxima promoción?',
   'El precio y las fechas cambian con cada convocatoria, así que no los publicamos aquí para '
   + 'no dejar un dato viejo. Escríbenos desde la página de contacto y te decimos los de la '
   + 'convocatoria abierta.'],
  ['Perdí mi certificado. ¿Me lo pueden volver a dar?',
   'Sí. El certificado no vive sólo en el papel: está registrado con su código. Escríbenos con '
   + 'tu nombre y tu cédula y te lo volvemos a emitir con el mismo código.'],
];

function paginaDePreguntas(temario) {
  const url = `${SITIO}/preguntas-frecuentes.html`;
  const titulo = `Preguntas frecuentes | ${ESCUELA.nombre}`;
  const descripcion = recortar('Cómo se verifica un certificado del CEM, si se puede cursar un '
    + 'módulo suelto, qué diplomados hay y desde cuándo existe la escuela.');
  const pasos = [{ nombre: 'Inicio', url: `${SITIO}/` }, { nombre: 'Preguntas frecuentes' }];
  const qa = PREGUNTAS(temario);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [escuelaJsonLd(), migasJsonLd(pasos), {
      '@type': 'FAQPage',
      mainEntity: qa.map(([p, r]) => ({
        '@type': 'Question', name: p,
        acceptedAnswer: { '@type': 'Answer', text: r },
      })),
    }],
  };

  const cuerpo = `
<main class="pub-main" style="max-width:760px">
  ${migas(pasos)}
  <h1>Preguntas frecuentes</h1>
  <p class="entrada">Lo que más nos preguntan, contestado sin rodeos.</p>
  ${qa.map(([p, r]) => `<section style="margin-top:26px">
    <h2 style="font-size:19px">${esc(p)}</h2>
    <p>${esc(r)}</p>
  </section>`).join('')}
  <section class="caja" style="padding:20px;margin-top:32px">
    <h2 style="margin-top:0">¿No está tu pregunta?</h2>
    <p>Escríbenos desde <a href="${SITIO}/plataforma/nosotros.html">la página de contacto</a>.</p>
  </section>
</main>`;

  return pagina({ titulo, descripcion, url, cuerpo, jsonLd, profundidad: 0 });
}

/* La portada del dominio, que hasta hoy no existía.
   ═══════════════════════════════════════════════════════════════════════════
   `escuelacem.com/` era un redirector de JavaScript: 3 KB, sin un <h1>, con un
   canonical apuntando a /plataforma/inicio.html. Y ésa es LA dirección del
   sitio —la que se teclea, la que se pone en una tarjeta, la que enlaza
   cualquiera que hable de la escuela—. Toda esa fuerza llegaba a una página de
   paso y se quedaba ahí, porque una redirección de JavaScript no la traslada.

   Ahora `/` es la portada de verdad, con el texto dentro del HTML, y es
   `/plataforma/inicio.html` la que apunta aquí con su canonical. La dirección
   corta se queda con la autoridad, que es como debe ser.

   Lo que NO cambia: los tableros guardados. El tablero de proyectos se guarda
   como `escuelacem.com/?p=<identificador>` y el propio tablero le dice a la
   gente «guarda esta URL». Ese desvío sigue igual, sólo que ahora únicamente
   se dispara cuando viene un `?p=`; sin él, se ve la portada en vez de un
   parpadeo. */
function paginaDeInicio(temario) {
  const url = `${SITIO}/`;
  const titulo = `CEM · Diplomados en marketing digital e inteligencia artificial en Venezuela`;
  const descripcion = recortar(`Centro de Estudios de Marketing, desde ${ESCUELA.fundada}. `
    + `Diplomados en marketing digital e inteligencia artificial, de ocho módulos cada uno, `
    + `con certificado verificable. ${temario.totales.certificados} certificados emitidos.`);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      escuelaJsonLd(),
      /* `WebSite` con `SearchAction` es lo que puede hacer que Google enseñe una
         caja de búsqueda propia debajo del resultado. Apunta al verificador,
         que es la única búsqueda real que tiene este sitio: quien busca en el
         CEM busca un certificado. */
      {
        '@type': 'WebSite',
        '@id': `${SITIO}#sitio`,
        url: SITIO,
        name: ESCUELA.nombre,
        inLanguage: 'es',
        publisher: { '@id': `${SITIO}#escuela` },
        potentialAction: {
          '@type': 'SearchAction',
          target: {
            '@type': 'EntryPoint',
            urlTemplate: `${SITIO}/plataforma/verificar.html?codigo={search_term_string}`,
          },
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'ItemList',
        name: 'Diplomados del CEM',
        numberOfItems: temario.diplomados.length,
        itemListElement: temario.diplomados.map((d, i) => ({
          '@type': 'ListItem', position: i + 1, name: d.nombre,
          url: `${SITIO}/programas/${d.apodo}.html`,
        })),
      },
    ],
  };

  const cuerpo = `
<section class="portada-cem portada-una">
  <div class="dentro portada-una">
    <div class="portada-dicho">
      <span class="ojal">Centro de Estudios de Marketing · Caracas, desde ${ESCUELA.fundada}</span>
      <h1 class="titular-largo">Diplomados en marketing digital e inteligencia artificial,
        con certificado verificable</h1>
      <p class="lema">Dos diplomados de ocho módulos cada uno. Cada módulo se certifica por
        separado, y cualquiera puede verificar ese certificado con su código.</p>
      <div class="portada-manos">
        <a class="btn" href="${SITIO}/programas/">Ver los dos diplomados</a>
        <a class="btn outline" href="${SITIO}/plataforma/verificar.html">Verificar un certificado</a>
      </div>
    </div>
  </div>
</section>

<section class="franja tenue">
  <div class="dentro">
    <div class="cifras-casa">
      <div><b>${esc(temario.totales.certificados)}</b><span>certificados emitidos</span></div>
      <div><b>${esc(temario.totales.personas)}</b><span>personas graduadas</span></div>
      <div><b>${esc(temario.totales.promociones)}</b><span>promociones</span></div>
      <div><b>${ESCUELA.fundada}</b><span>en funcionamiento desde</span></div>
    </div>
  </div>
</section>

${temario.diplomados.map((d, i) => `
<section class="franja${i % 2 ? ' tenue' : ''}">
  <div class="dentro">
    <span class="ojal">Diplomado · 8 módulos</span>
    <h2 style="margin-top:0"><a href="${SITIO}/programas/${d.apodo}.html">${esc(d.nombre)}</a></h2>
    <p class="entrada">${esc(d.que)}</p>
    <div class="rejilla-modulos">
      ${d.modulos.map((m) => tarjetaModulo(m, d)).join('')}
    </div>
    <p style="margin-top:var(--e3)">
      <a class="btn outline" href="${SITIO}/programas/${d.apodo}.html">
        Ver el ${esc(d.corto)} completo</a></p>
  </div>
</section>`).join('')}

${bloqueCertificado(temario, `
    <p class="tiny muted" style="margin-top:var(--e3)">¿Otra duda? Las
      <a href="${SITIO}/preguntas-frecuentes.html">preguntas frecuentes</a> contestan si se puede
      cursar un módulo suelto, qué pasa si perdiste tu certificado y qué diplomados hay.</p>`)}`;

  const html = pagina({ titulo, descripcion, url, cuerpo, jsonLd, profundidad: 0 });

  /* El desvío de los tableros guardados, intacto. Va al final del <head> para
     que un `?p=` salga de aquí cuanto antes, y para que quien llegue sin él no
     note nada: no se ejecuta. */
  return html.replace('</head>', `
<script>
  /* Sólo los enlaces guardados del tablero de proyectos —escuelacem.com/?p=…—
     se desvían. Antes se desviaba TODO el mundo, y por eso esta dirección no
     tenía contenido que un buscador pudiera leer. */
  (function () {
    var busca = location.search || '';
    if (/[?&]p=/.test(busca)) location.replace('proyectos.html' + busca);
  })();
</script>
</head>`);
}

function pagina404() {
  const url = `${SITIO}/404.html`;
  const jsonLd = { '@context': 'https://schema.org', '@graph': [escuelaJsonLd()] };
  const cuerpo = `
<main class="pub-main" style="max-width:640px">
  <h1>Esta página no existe</h1>
  <p class="entrada">Puede que el enlace esté viejo o que tenga una letra de más.
    Desde aquí se llega a lo de siempre.</p>
  <nav style="display:flex;flex-direction:column;gap:10px;margin-top:24px">
    <a class="caja" style="padding:14px;text-decoration:none" href="${SITIO}/">
      <b>Inicio</b><br><span class="tiny muted">Qué es el CEM y qué se estudia</span></a>
    <a class="caja" style="padding:14px;text-decoration:none" href="${SITIO}/programas/">
      <b>Programas</b><br><span class="tiny muted">Los dos diplomados y sus dieciséis módulos</span></a>
    <a class="caja" style="padding:14px;text-decoration:none" href="${SITIO}/plataforma/verificar.html">
      <b>Verificar un certificado</b><br><span class="tiny muted">Con el código o la cédula, sin cuenta</span></a>
    <a class="caja" style="padding:14px;text-decoration:none" href="${SITIO}/plataforma/index.html">
      <b>Entrar a la plataforma</b><br><span class="tiny muted">Si ya eres estudiante del CEM</span></a>
  </nav>
</main>`;
  /* `noindex` en el 404 y en ningún otro sitio: GitHub Pages sirve este archivo
     con código 404 de verdad, así que el buscador ya sabe que no debe
     indexarlo; la etiqueta es el cinturón por si alguien lo abre directo. */
  return pagina({ titulo: `Página no encontrada | ${ESCUELA.nombre}`,
    descripcion: 'La página que buscas no existe. Desde aquí se llega al inicio, '
      + 'a los programas y a la verificación de certificados.',
    url, cuerpo, jsonLd, profundidad: 0 })
    .replace('<meta name="robots" content="index, follow',
             '<meta name="robots" content="noindex, follow');
}

// ── sitemap y robots ──────────────────────────────────────────────────────

function sitemap(cursos, temario) {
  /* `plataforma/inicio.html` ya NO encabeza el mapa: ahora la portada es «/»
     —la dirección corta, la que se teclea y la que enlaza todo el mundo— y la
     otra apunta aquí con su canonical. Poner las dos con prioridad alta sería
     pedirle a Google que elija entre dos copias de lo mismo.

     `catalogo.html` y `curso.html` tampoco: son la misma información pintada
     con JavaScript, y ya llevan su noindex y su canonical. */
  const fijas = [
    ['/', '1.0', 'weekly'],
    ['/programas/', '0.9', 'weekly'],
    ['/preguntas-frecuentes.html', '0.7', 'monthly'],
    ['/plataforma/verificar.html', '0.7', 'monthly'],
    ['/plataforma/nosotros.html', '0.6', 'monthly'],
  ];
  /* `plataforma/inicio.html` NO va en el mapa, y es a propósito: cede su
     canonical a «/». Ofrecerle a Google una dirección y decirle en la propia
     página «la buena es otra» son dos señales que se contradicen, y cuando se
     contradicen decide él. */
  const entrada = (ruta, prio, cada, fecha) => `  <url>
    <loc>${SITIO}${ruta}</loc>
    <lastmod>${fecha || HOY}</lastmod>
    <changefreq>${cada}</changefreq>
    <priority>${prio}</priority>
  </url>`;

  const modulos = temario.diplomados.flatMap((d) => d.modulos);
  const todas = [
    ...fijas.map(([r, p, c]) => entrada(r, p, c)),
    /* Los diplomados por encima de sus módulos: son la página que se quiere
       que salga cuando alguien busca «diplomado en marketing digital». */
    ...temario.diplomados.map((d) => entrada(`/programas/${d.apodo}.html`, '0.9', 'weekly')),
    ...modulos.map((m) => entrada(`/programas/${m.apodo}.html`, '0.7', 'monthly')),
    ...cursos.map((c) => entrada(`/programas/${c.apodo}.html`, '0.8', 'weekly',
      String(c.updated_at || c.created_at || '').slice(0, 10) || HOY)),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generado por herramientas/generar-seo.mjs. No se edita a mano: se
     regenera cada día y se perdería lo escrito. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${todas.join('\n')}
</urlset>
`;
}

const robots = () => `# ${ESCUELA.nombre} — ${SITIO}

User-agent: *
Allow: /

# Las pantallas privadas no tienen nada que buscar y además rebotan a quien no
# ha entrado: dejarlas abiertas gasta el presupuesto de rastreo en 404 lógicos.
Disallow: /plataforma/admin/
Disallow: /plataforma/docente/
Disallow: /plataforma/estudiante/
Disallow: /plataforma/cambiar-clave.html
Disallow: /plataforma/nueva-clave.html
Disallow: /plataforma/invitacion.html
Disallow: /plataforma/confirmar.html

# catalogo.html y curso.html NO se bloquean aquí, y es a propósito.
# ─────────────────────────────────────────────────────────────────────────────
# Enseñan lo mismo que /programas/ pero pintado con JavaScript, así que no
# deben competir con ellas. Eso ya se resuelve DENTRO de cada página: el
# catálogo lleva un canonical hacia /programas/ y la ficha lleva noindex.
#
# Bloquearlas además sería contraproducente: una página que no se puede
# rastrear tampoco se puede leer, así que el buscador nunca vería ni el
# canonical ni el noindex — y acabaría indexándolas a ciegas, sólo por los
# enlaces que apuntan a ellas. Prohibir y etiquetar son excluyentes.

# Restos de cuando esto era un repositorio de herramientas sueltas.
Disallow: /proyectos.html
Disallow: /mejorasparaelCEM.html
Disallow: /admin.html

Sitemap: ${SITIO}/sitemap.xml
`;

// ── el trabajo ────────────────────────────────────────────────────────────

async function main() {
  console.log('Leyendo el temario y los programas publicados…');
  const temario = await traerTemario();
  const [cursosCrudos, modulos, lecciones, cohortes] = await Promise.all([
    traer('cem_courses?select=*&estado=eq.publicado&order=destacado.desc,nombre.asc'),
    traer('cem_modules?select=id,course_id,titulo,descripcion,orden'),
    traer('cem_lessons?select=id,module_id,titulo,orden'),
    traer('cem_cohorts?select=course_id,fecha_inicio,estado'),
  ]);

  /* Aquí NO se sale antes de tiempo cuando no hay ninguno publicado.
     ─────────────────────────────────────────────────────────────────────────
     Eso hacía antes, y era justo al revés de lo que hace falta: el día que se
     despublica el último programa es el día en que MÁS importa pasar por aquí,
     porque hay que borrar su página. Al plantarse, la página vieja se quedaba
     publicada en el sitio —con su precio, su botón de inscribirse y su sitio
     en el mapa que lee Google— anunciando algo que ya no se vende.

     Con la lista vacía el resto del guion funciona: no escribe ninguna página
     de programa, deja el catálogo diciendo que ahora mismo no hay ninguno, y
     el mapa se queda con las cuatro direcciones fijas. */
  if (!cursosCrudos.length) {
    console.log('\nNo hay ningún programa publicado. Se limpia lo que quedaba de la vez');
    console.log('anterior para que no siga anunciándose algo que ya no se ofrece.\n');
  }

  /* Dos programas con el mismo nombre darían el mismo archivo y uno pisaría al
     otro en silencio. Se le pega el código —y si tampoco lo hay, un número—
     sólo a partir del segundo, para que el primero conserve su dirección
     limpia y no se rompan los enlaces ya compartidos. */
  const usados = new Set();
  const cursos = cursosCrudos.map((c, i) => {
    let a = apodo(c.nombre);
    if (usados.has(a)) a = `${a}-${apodo(c.codigo) || i + 1}`;
    while (usados.has(a)) a = `${a}-${i + 1}`;
    usados.add(a);
    return { ...c, apodo: a };
  });

  const dir = join(RAIZ, 'programas');
  await mkdir(dir, { recursive: true });

  /* Se borran las páginas de la vez anterior. Un programa que se despublica
     tiene que desaparecer del sitio, no quedarse colgando con su precio viejo
     y su botón de inscribirse. */
  if (existsSync(dir)) {
    for (const f of await readdir(dir)) {
      if (f.endsWith('.html')) await rm(join(dir, f));
    }
  }

  /* El temario primero: es el contenido que de verdad tiene la escuela, y el
     que hace que este sitio tenga algo que posicionar. */
  for (const d of temario.diplomados) {
    await writeFile(join(dir, `${d.apodo}.html`), paginaDelDiplomado(d, temario), 'utf8');
    console.log(`  ✓ /programas/${d.apodo}.html`);
    for (const m of d.modulos) {
      await writeFile(join(dir, `${m.apodo}.html`), paginaDelModulo(m, d, temario), 'utf8');
      console.log(`  ✓ /programas/${m.apodo}.html`);
    }
  }

  for (const c of cursos) {
    await writeFile(join(dir, `${c.apodo}.html`),
      paginaDelPrograma(c, modulos, lecciones, cohortes), 'utf8');
    console.log(`  ✓ /programas/${c.apodo}.html`);
  }

  await writeFile(join(dir, 'index.html'), paginaDelCatalogo(cursos, temario), 'utf8');
  console.log('  ✓ /programas/index.html');

  await writeFile(join(RAIZ, 'index.html'), paginaDeInicio(temario), 'utf8');
  console.log('  ✓ / (la portada del dominio)');
  await writeFile(join(RAIZ, 'preguntas-frecuentes.html'), paginaDePreguntas(temario), 'utf8');
  console.log('  ✓ /preguntas-frecuentes.html');
  await writeFile(join(RAIZ, '404.html'), pagina404(), 'utf8');
  console.log('  ✓ /404.html');

  await writeFile(join(RAIZ, 'sitemap.xml'), sitemap(cursos, temario), 'utf8');
  await writeFile(join(RAIZ, 'robots.txt'), robots(), 'utf8');
  console.log('  ✓ /sitemap.xml\n  ✓ /robots.txt');

  const nModulos = temario.diplomados.reduce((a, d) => a + d.modulos.length, 0);
  const enElMapa = 6 + temario.diplomados.length + nModulos + cursos.length;
  console.log(`\n${temario.diplomados.length} diplomado(s) y ${nModulos} módulo(s) con página`
    + ` propia, más ${cursos.length} programa(s) del catálogo.`);
  console.log(`${enElMapa} direcciones en el sitemap (antes eran 4).`);
}

main().catch((e) => { console.error('\n✗', e.message, '\n'); process.exit(1); });
