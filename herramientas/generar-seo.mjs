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
<header class="pub-head">
  <div class="pub-inner">
    <a class="pub-brand" href="${SITIO}/plataforma/inicio.html">
      <span class="material-symbols-outlined">account_balance</span> ${ESCUELA.nombre}</a>
    <nav>
      <a href="${SITIO}/plataforma/inicio.html">Inicio</a>
      <a href="${SITIO}/programas/"${activa === 'programas' ? ' class="on"' : ''}>Programas</a>
      <a href="${SITIO}/plataforma/nosotros.html">Quiénes somos</a>
      <a href="${SITIO}/plataforma/verificar.html">Verificar certificado</a>
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
<link rel="icon" href="${arriba}plataforma/assets/favicon.svg" type="image/svg+xml">
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
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(titulo)}">
<meta name="twitter:description" content="${esc(descripcion)}">
<meta name="twitter:image" content="${esc(imagen || TARJETA)}">

<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
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
      <a class="btn gold" href="${SITIO}/plataforma/estudiante/inscripcion.html?curso=${esc(c.id)}">
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
      <a class="btn gold" href="${SITIO}/plataforma/estudiante/inscripcion.html?curso=${esc(c.id)}">
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

function paginaDelCatalogo(cursos) {
  const url = `${SITIO}/programas/`;
  const titulo = `Cursos de marketing, negocios e IA online | ${ESCUELA.nombre}`;
  const descripcion = recortar(
    `${cursos.length} programas de marketing digital, negocios, inteligencia artificial y `
    + 'tecnología, en línea y con certificado verificable. Para niños, adolescentes, '
    + 'adultos y emprendedores.');

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

  const cuerpo = `
<main class="pub-main" style="max-width:1080px">
  <h1>Programas del CEM</h1>
  <p class="entrada">Formación práctica en marketing digital, negocios, inteligencia
    artificial y tecnología. ${cursos.length === 1 ? 'Un programa' : `${cursos.length} programas`},
    con certificado verificable, y planes de pago de 1, 3 o 6 cuotas.</p>

  ${areas.map((area) => {
    const suyos = cursos.filter((c) => (plano(c.categoria) || 'Otros programas') === area);
    return `<section>
      <h2>${esc(area)}</h2>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:var(--e2)">
        ${suyos.map((c) => `<article class="caja" style="padding:16px">
          <p class="tiny muted" style="margin:0 0 4px">${esc(TIPO[c.tipo] || 'Programa')}${
            c.horas ? ` · ${c.horas} h` : ''}${
            MODALIDAD[c.modalidad] ? ` · ${esc(MODALIDAD[c.modalidad])}` : ''}</p>
          <h3 style="margin:0 0 6px"><a href="${SITIO}/programas/${esc(c.apodo)}.html">${
            esc(plano(c.nombre))}</a></h3>
          <p class="tiny">${esc(recortar(c.descripcion_corta || c.subtitulo || '', 120))}</p>
          <p style="margin:8px 0 0"><b>${esc(dinero(c.precio, c.moneda))}</b></p>
        </article>`).join('')}
      </div>
    </section>`;
  }).join('')}

  <section class="caja" style="padding:var(--e3);margin-top:var(--e3)">
    <h2 style="margin-top:0">¿No sabes por dónde empezar?</h2>
    <p>El catálogo con filtros por modalidad, nivel y tipo está en la plataforma, y
      se puede mirar sin crear cuenta.</p>
    <a class="btn" href="${SITIO}/plataforma/catalogo.html">Ver el catálogo con filtros</a>
  </section>
</main>`;

  return pagina({ titulo, descripcion, url, cuerpo, jsonLd, activa: 'programas', profundidad: 1 });
}

// ── sitemap y robots ──────────────────────────────────────────────────────

function sitemap(cursos) {
  /* Las pantallas de la aplicación no van aquí: son la MISMA información que
     las páginas de programa pero sin texto en el HTML. Ofrecérselas a un
     buscador es pedirle que elija entre dos versiones de lo mismo y quedarse
     con la peor. */
  const fijas = [
    ['/plataforma/inicio.html', '1.0', 'weekly'],
    ['/programas/', '0.9', 'daily'],
    ['/plataforma/nosotros.html', '0.6', 'monthly'],
    ['/plataforma/verificar.html', '0.5', 'yearly'],
  ];
  const entrada = (ruta, prio, cada, fecha) => `  <url>
    <loc>${SITIO}${ruta}</loc>
    <lastmod>${fecha || HOY}</lastmod>
    <changefreq>${cada}</changefreq>
    <priority>${prio}</priority>
  </url>`;

  const todas = [
    ...fijas.map(([r, p, c]) => entrada(r, p, c)),
    ...cursos.map((c) => entrada(`/programas/${c.apodo}.html`, '0.8', 'weekly',
      String(c.updated_at || c.created_at || '').slice(0, 10) || HOY)),
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generado por herramientas/generar-seo.mjs. No se edita a mano: se
     regenera cada día y se perdería lo escrito. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
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
  console.log('Leyendo los programas publicados…');
  const [cursosCrudos, modulos, lecciones, cohortes] = await Promise.all([
    traer('cem_courses?select=*&estado=eq.publicado&order=destacado.desc,nombre.asc'),
    traer('cem_modules?select=id,course_id,titulo,descripcion,orden'),
    traer('cem_lessons?select=id,module_id,titulo,orden'),
    traer('cem_cohorts?select=course_id,fecha_inicio,estado'),
  ]);

  if (!cursosCrudos.length) {
    console.log('\nNo hay ningún programa publicado, así que no hay nada que generar.');
    console.log('Publica al menos uno en Admin → Cursos y vuelve a ejecutar esto.\n');
    return;
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

  for (const c of cursos) {
    await writeFile(join(dir, `${c.apodo}.html`),
      paginaDelPrograma(c, modulos, lecciones, cohortes), 'utf8');
    console.log(`  ✓ /programas/${c.apodo}.html`);
  }

  await writeFile(join(dir, 'index.html'), paginaDelCatalogo(cursos), 'utf8');
  console.log('  ✓ /programas/index.html');

  await writeFile(join(RAIZ, 'sitemap.xml'), sitemap(cursos), 'utf8');
  await writeFile(join(RAIZ, 'robots.txt'), robots(), 'utf8');
  console.log('  ✓ /sitemap.xml\n  ✓ /robots.txt');

  console.log(`\n${cursos.length} programa(s) con página propia, `
    + `${cursos.length + 4} direcciones en el sitemap.`);
}

main().catch((e) => { console.error('\n✗', e.message, '\n'); process.exit(1); });
