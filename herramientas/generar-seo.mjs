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

import { writeFile, readFile, mkdir, readdir, rm } from 'node:fs/promises';
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
/* El código de Search Console. Vacío hasta que lo den; en cuanto esté, se pega
   aquí y sale solo en la portada.
   ═══════════════════════════════════════════════════════════════════════════
   Qué es: una cadena que Google entrega para comprobar que quien dice ser dueño
   del dominio lo es. Se enseña, Google la lee, y a partir de ahí deja ver qué
   páginas tiene indexadas, por qué búsquedas sale el sitio y qué errores
   encuentra al rastrear. Sin eso no hay forma de saberlo: sólo buscar a mano y
   suponer.

   NO es un secreto, y por eso vive aquí y no en las variables de entorno: va
   escrita en el HTML de la portada, a la vista de cualquiera que mire el
   código fuente. Es lo contrario de una clave —sirve para identificar, no para
   dar acceso—, así que puede ir en un repositorio público sin problema.

   Sólo hace falta en la portada: la propiedad que se verifica es
   https://escuelacem.com/, y es ahí donde Google la busca. */
const VERIFICACION_GOOGLE = '';

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
    + 'tecnología en Caracas, Venezuela. Formación práctica con certificado verificable.',
  fundada: '2016',
  ciudad: 'Caracas',
  /* Miranda, no Distrito Capital. Aquí había una suposición mía y estaba mal.
     ─────────────────────────────────────────────────────────────────────────
     Caracas está repartida entre dos entidades: el municipio Libertador es
     Distrito Capital, y Chacao, Baruta, El Hatillo y Sucre son estado Miranda.
     Yo había puesto Distrito Capital por ser lo más común, sin que nadie me lo
     hubiera dicho. El dato de la casa es Miranda, y cuadra con el código
     postal: el 1060 cae del lado de Miranda. */
  region: 'Miranda',
  codigoPostal: '1060',
  pais: 'VE',
  paisNombre: 'Venezuela',
  /* Hasta dónde se afina la dirección: ciudad, código postal y estado. Calle no.
     ─────────────────────────────────────────────────────────────────────────
     «Caracas 1060, Miranda, Venezuela» es localidad + código postal + estado.
     Es un dato real y se pone entero. Lo que NO es, es una dirección de calle:
     no dice avenida, ni edificio, ni piso. Así que `streetAddress` sigue sin
     ponerse, porque rellenarlo con «Caracas 1060» sería meter la localidad en
     el campo de la calle y eso Google lo lee como una dirección mal formada.

     Tampoco va `geo` con coordenadas: un código postal cubre un barrio entero,
     y sacar de ahí una latitud y una longitud exactas sería fingir precisión
     que no tengo. Para una ficha de Google Business —la del mapa, con el
     alfiler— hace falta la calle; con esto no se puede abrir todavía.

     Lo que sí es cierto y comprobable está además en cada certificado emitido:
     los 521 llevan escrito «Caracas» como lugar de emisión. */
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

/** El primer título de la lista que quepa entero, en vez de recortar el último.
 *  ───────────────────────────────────────────────────────────────────────────
 *  `recortar` está bien para una descripción, donde lo que sobra es relleno.
 *  Para un título no: lo que va al final es «| CEM», y recortar se come justo
 *  eso — la marca, que es lo único que no se puede perder. «Instagram y TikTok
 *  para negocios en Caracas · Módulo 4 de 8 | CEM» son 64 caracteres y salía
 *  «…Módulo 4 de 8…», sin CEM y con puntos suspensivos.
 *
 *  Así que en lugar de cortar por donde caiga, se dan varias formas del mismo
 *  título de más larga a más corta y se coge la primera que entre. Lo que se
 *  suelta primero es lo prescindible («de 8»), y sólo al final lo que se
 *  teclea de verdad («en Caracas»). Si ni la más corta cabe —un nombre de
 *  módulo larguísimo—, entonces sí se recorta, pero eso ya es el último cartucho. */
function tituloQueQuepa(variantes, tope = 60) {
  for (const v of variantes) if (plano(v).length <= tope) return plano(v);
  return recortar(variantes[variantes.length - 1], tope + 2);
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
      ${/* Con marca de versión, como los <link rel="icon">. Sin ella el navegador
            seguía enseñando el logotipo VIEJO en la cabecera —la «E» sobre negro—
            aunque el archivo del servidor ya fuera el birrete: una imagen guardada
            sólo se vuelve a pedir si cambia su dirección. Se vio en pantalla. */''}
      <img src="${SITIO}/plataforma/assets/favicon.svg?v=${VERSION_ICONO}" alt=""
           width="22" height="22"
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

/* El botón de contacto, también en las páginas generadas.
   ═══════════════════════════════════════════════════════════════════════════
   Las pantallas de /plataforma/ montan `montarContactoPublico()` y llevan su
   botón flotante desde hace tiempo. Éstas no: no cargan app.js. O sea que las
   24 páginas que más visitas reciben —la portada, las dos fichas de diplomado,
   los dieciséis módulos— eran justamente las que NO tenían por dónde
   preguntar. Quien llegaba de Google a un módulo y quería saber el precio no
   tenía a quién escribir.

   Aquí es un enlace, no un botón: sin JavaScript no hay diálogo que abrir, así
   que lleva al formulario de nosotros.html, que es el mismo sitio donde acaba
   el diálogo de las otras. Con `#contacto` para aterrizar en el formulario y
   no en lo alto de la página.

   Reutiliza las clases del flotante de app.js para que sea el mismo botón en
   los dos sitios: si un día cambia el estilo, cambia en ambos. */
const botonContacto = () => `
<div class="contacto-flotante">
  <a class="btn contacto-btn" href="${SITIO}/plataforma/nosotros.html#contacto">
    <span class="material-symbols-outlined" aria-hidden="true">forum</span>
    <span class="contacto-txt">¿Tienes dudas?</span></a>
</div>`;

const pie = () => `${botonContacto()}
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
      <a href="${SITIO}/preguntas-frecuentes.html">Preguntas frecuentes</a>
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
/* Aquí NO hay modo oscuro, y quitarlo fue arreglar una pantalla rota.
   ═══════════════════════════════════════════════════════════════════════════
   Lo había, y hacía esto: estas páginas llevan todas `data-publico="si"`, y en
   styles.css el escaparate fija el fondo en blanco sin condiciones —los colores
   vivos de la portada sólo se leen como color sobre blanco—. Con el bloque
   oscuro puesto, quien tuviera el sistema en modo noche recibía la tinta clara
   (#e9ecef) escrita sobre ese blanco: titulares invisibles y cajas oscuras
   flotando en una página clara. Era la portada del dominio, la primera pantalla
   que ve quien llega de Google.

   Ninguna de estas páginas carga app.js, así que temas.js —que es quien pone
   `data-theme="light"` en lo público— no llega nunca aquí. El escaparate es de
   un solo tema a propósito; esto lo dice también en el CSS que va en línea, que
   es el que manda durante el primer pantallazo.

   `color-scheme:light` para que las barras de desplazamiento y los controles
   del navegador, que no leen tokens, tampoco se pinten de noche. */
/* La misma marca de versión del icono que usa herramientas/iconos.mjs, y por
   la misma razón: el navegador guarda los iconos en una caché aparte cuya
   única llave es la dirección, y sin cambiarla seguía saliendo la «E» vieja en
   la pestaña aunque el servidor ya diera el birrete. Se sube a mano y sólo
   cuando el dibujo cambie; las dos herramientas tienen que decir lo mismo. */
const VERSION_ICONO = '2026-09-03';

const CSS_CRITICO = `
:root{color-scheme:light;
  --fondo:#f4f6f8;--papel:#fff;--tinta:#1f2937;--tinta-2:#6b7280;
  --filete:#dde3ea;--primary:#132743;--on-primary:#fff;--secondary:#1b7f76;}
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
<link rel="icon" href="/favicon.ico?v=${VERSION_ICONO}" sizes="32x32">
<link rel="icon" type="image/png" sizes="96x96" href="${arriba}plataforma/assets/favicon-96.png?v=${VERSION_ICONO}">
<link rel="icon" type="image/svg+xml" href="${arriba}plataforma/assets/favicon.svg?v=${VERSION_ICONO}">
<link rel="apple-touch-icon" href="${arriba}plataforma/assets/icono-180.png?v=${VERSION_ICONO}">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#0d2440">

<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(ESCUELA.nombre)}">
${/* es_VE y no es_ES. El sitio declaraba español DE ESPAÑA en las 25
      páginas, y esto es una escuela de Caracas: le estaba diciendo a
      Facebook, a WhatsApp y a LinkedIn que su público está a ocho mil
      kilómetros de donde está. */''}
<meta property="og:locale" content="es_VE">
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
<link rel="alternate" hreflang="es-VE" href="${esc(url)}">
<link rel="alternate" hreflang="x-default" href="${esc(url)}">
${/* Y en qué región se enseña, que es distinto del idioma: hay mucha gente
      buscando en castellano a la que esta escuela no le sirve porque está en
      otro continente, y mucha en Caracas a la que sí. */''}
${/* «VE-M» es Miranda en ISO 3166-2, que es lo que dice la dirección de la
      casa. Estaba puesto «VE-A», que es Distrito Capital: suposición mía de
      cuando no sabía el estado, y contradecía al `addressRegion`. */''}
<meta name="geo.region" content="VE-M">
<meta name="geo.placename" content="Caracas ${ESCUELA.codigoPostal}, ${ESCUELA.paisNombre}">
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
${contarLaVisita(url)}
</body>
</html>
`;
}

/* Contar la visita, sin traerse `app.js` por delante.
   ═══════════════════════════════════════════════════════════════════════════
   `cem_visitas` llevaba meses vacía, y no era porque faltara nada en la base:
   la función `cem_visita_anotar` existe, su índice único existe, y las
   pantallas de la plataforma que llaman a `mount({pub:true})` la llaman bien.
   Vacía estaba porque LAS PÁGINAS QUE RECIBEN LA VISITA no la llamaban: éstas,
   las veinticuatro que genera este archivo, que son justamente a las que manda
   Google y para las que se hizo todo el trabajo de SEO. No cargan `app.js`, y
   por tanto no cargaban nada.

   Va suelto y a mano en lugar de importar `app.js` a propósito: esa es la
   diferencia entre 4 KB y 190 KB de JavaScript en una página cuya única virtud
   es abrir rápido. Aquí sólo hace falta una llamada.

   Y va con `keepalive`, que es lo que permite que la petición sobreviva a que
   la persona se vaya de la página en el mismo segundo. Sin eso se pierde justo
   la visita más corta, que es la mayoría. Si falla, no pasa nada: contar
   visitas no puede romperle la página a nadie. */
const contarLaVisita = (url) => `
<script>
(function () {
  try {
    var pantalla = ${JSON.stringify(new URL(url).pathname.replace(/\.html$/, '').replace(/^\/|\/$/g, '') || 'inicio')};
    /* Una vez por pestaña y pantalla: recargar diez veces no son diez visitas. */
    if (sessionStorage.getItem('cemVisto:' + pantalla)) return;
    sessionStorage.setItem('cemVisto:' + pantalla, '1');
    var p = new URLSearchParams(location.search);
    var canal = p.get('utm_source') || p.get('origen') || p.get('ref') || '';
    if (!canal && document.referrer) {
      var h = new URL(document.referrer).hostname;
      if (h && h !== location.hostname) canal = h.replace(/^www\\./, '');
    }
    fetch('${BASE}/rest/v1/rpc/cem_visita_anotar', {
      method: 'POST', keepalive: true,
      headers: { 'apikey': '${CLAVE}', 'Authorization': 'Bearer ${CLAVE}',
                 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_pantalla: pantalla, p_canal: canal || null,
                             p_campana: p.get('utm_campaign') || null }),
    }).catch(function () {});
  } catch (e) { /* almacenamiento bloqueado o navegación privada: da igual */ }
})();
</script>`;

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
  const titulo = `Diplomados y cursos en Caracas · ${nModulos} certificaciones | CEM`;
  const descripcion = recortar(
    `Los ${temario.diplomados.length} diplomados del CEM en Caracas y sus ${nModulos} módulos, `
    + `cada uno con certificado propio y verificable: marketing digital, inteligencia `
    + `artificial, video, Photoshop, Illustrator y branding.`);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      /* Antes había aquí una copia a mano de la escuela, y ya había divergido de
         la de verdad: sin `areaServed`, sin `inLanguage`, sin región — y sin el
         logotipo cuando se añadió. Dos nodos con el MISMO `@id` diciendo cosas
         distintas es de lo peor que se le puede dar a Google, porque resuelve el
         `@id` de forma global y acaba sin saber a cuál creer. Una sola fuente. */
      escuelaJsonLd(),
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

${/* La portada de cada diplomado, y nada más. Los módulos, al entrar.
     ═══════════════════════════════════════════════════════════════════════
     Antes esta página listaba los DIECISÉIS módulos de los dos diplomados,
     con su tarjeta cada uno. Quien llegaba buscando «qué ofrece el CEM» se
     encontraba dieciséis cosas y ninguna manera de saber cuáles van juntas:
     la decisión que se toma aquí es entre dos diplomados, no entre dieciséis
     módulos, y la página la estaba enterrando bajo el detalle.

     Ahora se ve una portada por diplomado —qué es, para quién, cuánta gente
     lo ha cursado, cuántos módulos y certificados tiene— y se entra a ver el
     temario. Lo de dentro no desaparece: cada módulo conserva su página, su
     certificado y su sitio en el mapa del sitio, y la tira de colores de
     abajo los enseña todos de un vistazo sin ocupar media pantalla. */''}
${temario.diplomados.map((d, i) => `
<section class="franja${i % 2 === 0 ? ' tenue' : ''}">
  <div class="dentro">
    <article class="portada-programa" style="--mod-color:${d.modulos[0]?.color || 'var(--primary)'}">
      <div class="pp-tira" aria-hidden="true">
        ${d.modulos.map((m) => `<i style="background:${m.color}"></i>`).join('')}
      </div>
      <div class="pp-cuerpo">
        <span class="ojal">Diplomado · ${d.modulos.length} módulos</span>
        <h2><a href="${SITIO}/programas/${d.apodo}.html">${esc(d.nombre)}</a></h2>
        <p class="entrada">${esc(d.que)}</p>

        <ul class="pp-datos">
          <li><b>${d.modulos.length}</b><span>módulos</span></li>
          <li><b>${d.modulos.length}</b><span>certificados</span></li>
          <li><b>${d.personas}</b><span>lo han cursado</span></li>
          <li><b>${d.diplomas}</b><span>diplomas emitidos</span></li>
        </ul>

        <p class="avala"><span class="punto"></span>
          ${d.personas} personas en ${d.promociones}
          promoci${d.promociones === 1 ? 'ón' : 'ones'} · cada módulo se certifica por separado</p>

        <div class="portada-manos" style="margin-bottom:0">
          <a class="btn" href="${SITIO}/programas/${d.apodo}.html">
            Ver el temario y los ${d.modulos.length} certificados</a>
        </div>
      </div>
    </article>
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
  /* Los tres nombres por los que de verdad se busca esto. «Centro de Estudios de
     Marketing» a secas es el que teclea quien no se acuerda de la sigla. */
  alternateName: [ESCUELA.nombreLargo, 'Centro de Estudios de Marketing'],
  description: ESCUELA.descripcion,
  url: SITIO,
  foundingDate: ESCUELA.fundada,
  /* De qué sabe la casa. No es palabrería: es lo que se imparte de verdad,
     sacado de los dieciséis módulos que existen y tienen certificado emitido. */
  knowsAbout: [
    'Marketing digital', 'Community management', 'Gestión de anuncios',
    'Inteligencia artificial aplicada', 'Producción y edición de video',
    'Fotografía', 'Diseño gráfico', 'Branding',
  ],
  /* El logotipo, DICHO. Y es distinto del favicon, aunque salgan del mismo dibujo.
     ───────────────────────────────────────────────────────────────────────────
     Faltaba, y es la última pieza del problema del cuadrito con la «E». Google
     usa dos imágenes de marca por caminos separados:

       · el favicon (/favicon.ico y los <link rel="icon">) va al lado del
         resultado de búsqueda. Ése ya está.
       · `logo` de la organización va a la ficha de marca, y NO se deduce del
         favicon: si no se declara, Google no tiene logotipo del CEM y punto.

     Se declara el PNG de 512 y no el SVG a propósito: Google pide un mapa de
     bits (PNG, JPG o GIF) para `logo`, y descarta un SVG sin decir nada — el
     mismo silencio que ya costó encontrar lo del `viewBox`. El de 512 vale
     porque el birrete entra entero en su cuadrado, con su margen, sobre el navy
     de la casa; un logotipo recortado por los bordes Google lo rechaza.

     `image` es otra cosa: la tarjeta apaisada de 1200×630, la misma que sale al
     pegar un enlace en WhatsApp. Van las dos porque sirven a sitios distintos. */
  logo: {
    '@type': 'ImageObject',
    url: `${SITIO}/plataforma/assets/icono-512.png`,
    width: 512,
    height: 512,
    caption: `Logotipo de ${ESCUELA.nombre}`,
  },
  image: TARJETA,
  address: {
    '@type': 'PostalAddress',
    addressLocality: ESCUELA.ciudad,
    postalCode: ESCUELA.codigoPostal,
    addressRegion: ESCUELA.region,
    addressCountry: ESCUELA.pais,
  },
  areaServed: [
    { '@type': 'City', name: 'Caracas' },
    { '@type': 'Country', name: ESCUELA.paisNombre },
  ],
  inLanguage: 'es',
});

/** El sitio, en datos estructurados. Comparte `@id` con el que declaraba
 *  `plataforma/inicio.html`, así que tiene que ser LITERALMENTE el mismo nodo:
 *  de ahí que viva aquí y no escrito dos veces.
 *
 *  `WebSite` con `SearchAction` es lo que puede hacer que Google enseñe una caja
 *  de búsqueda propia debajo del resultado. Apunta al verificador, que es la
 *  única búsqueda real que tiene este sitio: quien busca en el CEM busca un
 *  certificado. (La copia de inicio.html apuntaba al catálogo; ya no.) */
const sitioJsonLd = () => ({
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

/** El bloque del certificado, que es el argumento de venta que sí es cierto.
 *
 *  `sinCifras` existe por la portada. Desde que las cifras subieron al titular,
 *  repetirlas aquí abajo sería decir el mismo número dos veces en la misma
 *  página, y un dato repetido pesa menos que dicho una sola vez. En las demás
 *  páginas —las de módulo, las de diplomado— no hay banda arriba, así que
 *  siguen apareciendo. */
const bloqueCertificado = (temario, dentro, sinCifras) => `
<section class="franja tenue">
  <div class="dentro estrecho centrado" style="text-align:center">
    <span class="ojal">Lo que te llevas</span>
    <h2>Un certificado que cualquiera puede comprobar</h2>
    <p class="entrada" style="margin-left:auto;margin-right:auto">Cada certificado del CEM lleva
      un código único y un QR. Quien lo reciba —una empresa que va a contratar, un cliente—
      escribe ese código o la cédula y ve ahí mismo si es auténtico, a nombre de quién está y de
      qué es. Sin crear ninguna cuenta.</p>
    ${sinCifras ? '' : `<div class="cifras-casa" style="margin:var(--e3) 0">
      <div><b>${esc(temario.totales.certificados)}</b><span>certificados comprobables</span></div>
      <div><b>${esc(temario.totales.personas)}</b><span>personas graduadas</span></div>
      <div><b>${esc(temario.totales.promociones)}</b><span>promociones</span></div>
    </div>`}

    <!-- Que se pueda comprobar AQUÍ, y no que se prometa que se puede.
         ═══════════════════════════════════════════════════════════════════
         Esto era un botón que llevaba a otra pantalla. Y «nuestros
         certificados son verificables» lo escribe cualquiera en su web: es
         exactamente el tipo de frase que no prueba nada porque no cuesta nada
         decirla. Lo que no puede copiar quien no lo tiene es el campo: se
         escribe un código —o una cédula— y sale el nombre, el programa y la
         fecha, de la base, delante de quien mira.

         Es lo único de esta página que FUNCIONA en vez de contar. Por eso se
         sube desde el final hasta aquí, y por eso lleva su propio ejemplo:
         quien no tiene un código a mano puede probar igual.

         Funciona sin JavaScript propio: el formulario va por GET a la pantalla
         de verificar, que ya sabe leer «?codigo=» y consultar sola. Estas
         páginas no cargan app.js, así que un campo que necesitara JS aquí
         sería un campo muerto.

         Sin comillas invertidas en este comentario: está DENTRO de una
         plantilla de JavaScript, y una sola cierra la cadena a mitad. -->
    <form class="verificar-aqui" action="${SITIO}/plataforma/verificar.html" method="get">
      <label for="codigoPortada" class="ojal" style="margin-bottom:var(--e0)">
        Compruébalo ahora</label>
      <div class="verificar-fila">
        <!-- El marcador es corto porque en un móvil de 390 px el campo mide
             225 y «Código del certificado o cédula» se cortaba en «…o». El
             nombre largo sigue entero en el aria-label, que es lo que oye
             quien usa lector de pantalla, y en el pie de debajo. -->
        <input type="search" id="codigoPortada" name="codigo" required
          placeholder="Código o cédula"
          aria-label="Código del certificado o cédula">
        <button class="btn" type="submit">
          <span class="material-symbols-outlined" aria-hidden="true">verified</span>
          Verificar</button>
      </div>
      <p class="tiny muted" style="margin:var(--e0) 0 0">Sin crear cuenta. Con la cédula salen
        todos los títulos de esa persona.</p>
    </form>
    ${dentro || ''}
  </div>
</section>`;

function paginaDelModulo(mod, dip, temario) {
  const url = `${SITIO}/programas/${mod.apodo}.html`;
  const urlDip = `${SITIO}/programas/${dip.apodo}.html`;
  /* Antes: «Instagram y TikTok para negocios · Módulo 4 del Diplomado en
     Marketing Digital | CEM International» — CIEN caracteres, de los que
     Google enseña sesenta. Se quedaba en «…Módulo 4 del Diplo». */
  const titulo = tituloQueQuepa([
    `${mod.nombre} en Caracas · Módulo ${mod.orden} de 8 | CEM`,
    `${mod.nombre} en Caracas · Módulo ${mod.orden} | CEM`,
    `${mod.nombre} en Caracas | CEM`,
    `${mod.nombre} · Módulo ${mod.orden} | CEM`,
  ]);
  const descripcion = recortar(`${mod.que} Módulo ${mod.orden} de 8 del ${dip.nombre} del CEM `
    + `en Caracas, con certificado propio y verificable. ${loQueAvala(mod)}`);
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
      <a class="btn" href="${urlDip}">Ver el diplomado de ${esc(dip.corto)}</a>
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
  <div class="dentro estrecho centrado" style="text-align:center">
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
  /* «en Caracas» dentro del título y no al final: es lo que se teclea —«curso
     de marketing digital en Caracas»— y si va al final, se corta. El nombre
     largo del diplomado de IA medía 78 caracteres él solo. */
  const titulo = recortar(`${dip.corto === 'Marketing Digital'
    ? 'Diplomado en Marketing Digital en Caracas'
    : 'Diplomado en Inteligencia Artificial en Caracas'} | CEM`, 62);
  const descripcion = recortar(`${dip.que} Se imparte en Caracas. ${dip.personas} personas lo `
    + `han cursado en ${dip.promociones} promociones, con certificado verificable por módulo.`);
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
      <!-- Con «#contacto», que es lo que el botón promete.
           Sin el fragmento, «Preguntar por la próxima promoción» dejaba a la
           persona en la cabecera de una página de filosofía institucional, con
           el formulario al 89 % del desplazamiento. El ancla ya existía en
           nosotros.html; lo que faltaba eran nueve caracteres aquí. -->
      <a class="btn" href="${SITIO}/plataforma/nosotros.html#contacto">Preguntar por la próxima
        promoción</a>
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
  /* Dos preguntas de sitio, y las dos primeras a propósito: «dónde» y «cómo son
     las clases» son lo que se pregunta antes que el precio cuando se busca un
     curso en una ciudad concreta, y son las que Google lee para entender que
     esto es un centro de Caracas y no un sitio de cursos de cualquier parte.

     Lo que se afirma aquí está medido, no supuesto: los 521 certificados
     emitidos llevan «Caracas» como lugar de expedición. De ahí no se sigue una
     dirección de calle, así que no se pone ninguna —ni aquí ni en el
     `streetAddress` de los datos estructurados. Una dirección inventada es peor
     que ninguna: Google la contrasta con el mapa y deja de fiarse del resto. */
  ['¿Dónde está el CEM?',
   `En Caracas ${ESCUELA.codigoPostal}, estado ${ESCUELA.region}, ${ESCUELA.paisNombre}. Desde `
   + `${ESCUELA.fundada} expide desde aquí sus certificados: los ${t.totales.certificados} `
   + 'emitidos hasta hoy llevan Caracas como lugar de expedición. Para la dirección exacta de '
   + 'la sede y el horario de atención, escríbenos desde la página de contacto.'],
  ['¿Las clases son presenciales en Caracas o se pueden seguir a distancia?',
   'Las promociones se imparten con clases en vivo, y todo el material queda grabado y '
   + 'disponible en la plataforma, así que se puede seguir el diplomado desde cualquier parte '
   + 'de Venezuela sin perder ninguna clase. El certificado es el mismo en los dos casos. '
   + 'Escríbenos para saber el horario de la convocatoria abierta.'],
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
  /* Aquí estaba «¿Las clases son en línea o presenciales?», que ahora es la
     segunda de la lista y con la respuesta ampliada. Dos preguntas distintas
     con la misma respuesta le dicen a Google que la página se repite. */
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
  const titulo = 'Preguntas frecuentes · Diplomados del CEM en Caracas';
  const descripcion = recortar('Dónde está el CEM, cómo se verifica un certificado, si se puede '
    + 'cursar un módulo suelto y qué diplomados se imparten en Caracas.');
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

  /* Un acordeón sobre papel, y no ocho bloques sueltos sobre el fondo.
     ═══════════════════════════════════════════════════════════════════════
     Antes eran ocho `<section>` con un h2 y un párrafo, uno detrás de otro,
     flotando directamente sobre la luz de color del fondo. Sin nada debajo que
     los sostuviera se leía como un documento pegado encima de la página, y con
     las ocho respuestas abiertas a la vez había que recorrer toda la pantalla
     para encontrar la que uno venía a leer.

     Ahora es el acordeón que ya existe en la casa —`.pregunta`, el mismo de la
     portada—: se lee la lista de preguntas de un vistazo y se abre la que
     interesa. La primera va abierta para que se entienda que se abren.

     Va dentro de una `.caja` con su relleno: papel debajo del texto. Y la
     medida se queda en 760, que es la de lectura. */
  const cuerpo = `
<main class="pub-main" style="max-width:820px">
  ${migas(pasos)}
  <h1>Preguntas frecuentes</h1>
  <p class="entrada">Lo que más nos preguntan, contestado sin rodeos. Pulsa la que
    te interese.</p>

  <div class="caja" style="padding:var(--e1) var(--e3);margin-top:var(--e3)">
    ${qa.map(([p, r], i) => `<details class="pregunta"${i === 0 ? ' open' : ''}>
      <summary>${esc(p)}</summary>
      <p>${esc(r)}</p>
    </details>`).join('')}
  </div>

  <!-- El cierre no es un aviso, es una puerta.
       ─────────────────────────────────────────────────────────────────────
       Decía «Escríbenos desde la página de contacto» y dejaba el trabajo de
       encontrarla a quien acababa de no encontrar su respuesta. Quien llega
       hasta el final de las preguntas frecuentes es justo quien tiene una
       duda que no está resuelta: es el momento de más intención de toda la
       página, y hasta hoy lo único que había era un enlace en medio de una
       frase. Ahora hay un botón que lleva derecho al formulario. -->
  <div class="caja" style="padding:var(--e3);margin-top:var(--e3);text-align:center">
    <h2 style="margin-top:0">¿No está tu pregunta?</h2>
    <p class="entrada" style="margin-inline:auto">Escríbenos y te contestamos con el
      precio, las fechas y el horario de la convocatoria que esté abierta.</p>
    <div class="portada-manos" style="justify-content:center;margin-bottom:0">
      <a class="btn" href="${SITIO}/plataforma/nosotros.html#contacto">
        Pedir información</a>
      <a class="btn outline" href="${SITIO}/programas/">Ver los programas</a>
    </div>
  </div>
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
  /* El título, por debajo de los 60 caracteres que enseña Google.
     ─────────────────────────────────────────────────────────────────────────
     Éste medía 77 y se cortaba justo donde iba «en Venezuela»: la palabra por
     la que más falta hace que aparezca era la que desaparecía. */
  const titulo = 'Diplomados en marketing digital e IA en Caracas | CEM';
  const descripcion = recortar(`Centro de estudios de marketing en Caracas, Venezuela, desde `
    + `${ESCUELA.fundada}. Diplomados en marketing digital e inteligencia artificial, de ocho `
    + `módulos, con certificado verificable. ${temario.totales.certificados} emitidos.`);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      escuelaJsonLd(),
      sitioJsonLd(),
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
      <p class="lema">Dos diplomados de ocho módulos cada uno, impartidos desde Caracas. Cada
        módulo se certifica por separado, y cualquiera puede verificar ese certificado con su
        código.</p>

      <!-- Un solo botón, y esto era lo que sobraba.
           ═══════════════════════════════════════════════════════════════════
           Al lado de «Ver los dos diplomados» había un «Verificar un
           certificado», y le estaba robando la atención al único botón que
           importa aquí. Además sirve a OTRA persona: verificar lo usa un
           empleador comprobando a alguien, o un egresado que perdió su papel —
           no quien está decidiendo si estudiar. Sigue en el menú de arriba,
           que es su sitio, y más abajo hay un bloque entero dedicado. -->
      <div class="portada-manos">
        <a class="btn" href="${SITIO}/programas/">Ver los dos diplomados</a>
      </div>

      <!-- Lo que hacía falta saber y no estaba en ninguna parte.
           ─────────────────────────────────────────────────────────────────
           Ni la duración, ni si las clases son en vivo, ni si hay que estar en
           Caracas. Estaba contestado en las preguntas frecuentes, o sea a dos
           pantallas de distancia de donde se decide. El precio y las fechas
           siguen sin publicarse —cambian con cada convocatoria y un dato viejo
           es peor que ninguno—, pero esto no cambia nunca. -->
      <ul class="portada-hechos">
        <li><span class="material-symbols-outlined" aria-hidden="true">videocam</span>
          Clases en vivo, y quedan grabadas</li>
        <li><span class="material-symbols-outlined" aria-hidden="true">public</span>
          Desde cualquier parte de Venezuela</li>
        <li><span class="material-symbols-outlined" aria-hidden="true">workspace_premium</span>
          Un certificado por módulo, verificable</li>
      </ul>

      <!-- Las cifras, pegadas al titular y no en una franja aparte.
           ─────────────────────────────────────────────────────────────────
           Estaban solas en una banda de 178 px para decir ocho palabras, tan
           lejos del titular que no probaban nada de lo que el titular afirma.
           Aquí, debajo, son lo que sostiene la frase de arriba.

           Son TRES y no cuatro. La cuarta era «${ESCUELA.fundada} · desde», que ya
           está dicha en el ojal de arriba —«desde ${ESCUELA.fundada}»— y encima se
           leía al revés, con el año encima de la palabra. Repetida partía la
           rejilla en 3+1 y dejaba una cifra suelta en una segunda fila. -->
      <div class="cifras-casa cifras-heroe">
        <div><b>${esc(temario.totales.certificados)}</b><span>certificados emitidos</span></div>
        <div><b>${esc(temario.totales.personas)}</b><span>personas graduadas</span></div>
        <div><b>${esc(temario.totales.promociones)}</b><span>promociones</span></div>
      </div>
    </div>
  </div>
</section>

<!-- Dónde está esto, dicho en el cuerpo de la página y no sólo en el <title>.
     ═══════════════════════════════════════════════════════════════════════════
     Google no se fía de una ciudad que sólo aparece en la etiqueta del título:
     eso lo escribe cualquiera. Lo que le da peso local es que la ciudad esté en
     el texto que lee una persona, con algo comprobable al lado —aquí, que los
     certificados emitidos llevan Caracas como lugar de expedición.

     Y por eso mismo no hay dirección de calle ni teléfono inventados: son el
     tipo de dato que Google contrasta, y uno falso hace que deje de creerse
     también lo que sí es verdad. Cuando la sede tenga ficha, va aquí y en el
     «streetAddress» de los datos estructurados, los dos a la vez. -->
<section class="franja">
  <div class="dentro estrecho">
    <span class="ojal">Caracas ${ESCUELA.codigoPostal} · Estado ${esc(ESCUELA.region)}</span>
    <h2 style="margin-top:0">Un centro de estudios de Caracas</h2>
    <p class="entrada">El CEM lleva desde ${ESCUELA.fundada} formando en marketing digital e
      inteligencia artificial desde Caracas ${ESCUELA.codigoPostal}, estado
      ${esc(ESCUELA.region)}, y desde aquí expide sus certificados: los
      ${esc(temario.totales.certificados)} emitidos hasta hoy llevan Caracas como lugar de
      expedición. Las clases son en vivo y quedan grabadas, así que el diplomado se puede seguir
      desde cualquier parte de Venezuela sin perder ninguna.</p>
    <p><a href="${SITIO}/preguntas-frecuentes.html">Dónde está el CEM y cómo son las clases →</a></p>
  </div>
</section>

${/* La portada del dominio, igual que el índice de programas: la portada de
     cada diplomado y no sus dieciséis módulos. Aquí pesa todavía más — es la
     primera pantalla de quien llega de Google, y le contestaba «qué hay» con
     dieciséis tarjetas antes de haber dicho qué son las dos cosas que se
     estudian. Se entra al temario desde el botón. */''}
${temario.diplomados.map((d, i) => `
<section class="franja${i % 2 ? ' tenue' : ''}">
  <div class="dentro">
    <article class="portada-programa" style="--mod-color:${d.modulos[0]?.color || 'var(--primary)'}">
      <div class="pp-tira" aria-hidden="true">
        ${d.modulos.map((m) => `<i style="background:${m.color}"></i>`).join('')}
      </div>
      <div class="pp-cuerpo">
        <span class="ojal">Diplomado · ${d.modulos.length} módulos</span>
        <h2><a href="${SITIO}/programas/${d.apodo}.html">${esc(d.nombre)}</a></h2>
        <p class="entrada">${esc(d.que)}</p>

        <ul class="pp-datos">
          <li><b>${d.modulos.length}</b><span>módulos</span></li>
          <li><b>${d.modulos.length}</b><span>certificados</span></li>
          <li><b>${d.personas}</b><span>lo han cursado</span></li>
          <li><b>${d.diplomas}</b><span>diplomas emitidos</span></li>
        </ul>

        <!-- «Ver el diplomado de X», no «Ver el X completo».
             El nombre corto es «Marketing Digital» o «Inteligencia
             Artificial», así que la plantilla vieja producía «Ver el
             Inteligencia Artificial completo»: el artículo no concuerda y
             «completo» se queda colgando de un nombre que no es un sustantivo
             contable. Con «el diplomado de» delante, el nombre entra como
             complemento y concuerda siempre, venga el que venga. -->
        <div class="portada-manos" style="margin-bottom:0">
          <a class="btn" href="${SITIO}/programas/${d.apodo}.html">
            Ver el diplomado de ${esc(d.corto)}</a>
        </div>
      </div>
    </article>
  </div>
</section>`).join('')}

${bloqueCertificado(temario, `
    <p class="tiny muted" style="margin-top:var(--e3)">¿Otra duda? Las
      <a href="${SITIO}/preguntas-frecuentes.html">preguntas frecuentes</a> contestan si se puede
      cursar un módulo suelto, qué pasa si perdiste tu certificado y qué diplomados hay.</p>`,
  true)}`;

  let html = pagina({ titulo, descripcion, url, cuerpo, jsonLd, profundidad: 0 });

  /* La verificación de Search Console, si ya la hay. Va sólo aquí porque la
     propiedad que se verifica es la portada del dominio. */
  if (VERIFICACION_GOOGLE) {
    html = html.replace('</head>',
      `<meta name="google-site-verification" content="${esc(VERIFICACION_GOOGLE)}">\n</head>`);
  }

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

  await sincronizarEscuelaEn('plataforma/inicio.html');

  const nModulos = temario.diplomados.reduce((a, d) => a + d.modulos.length, 0);
  const enElMapa = 6 + temario.diplomados.length + nModulos + cursos.length;
  console.log(`\n${temario.diplomados.length} diplomado(s) y ${nModulos} módulo(s) con página`
    + ` propia, más ${cursos.length} programa(s) del catálogo.`);
  console.log(`${enElMapa} direcciones en el sitemap (antes eran 4).`);
}

/** La escuela, dicha igual en una pantalla escrita a mano.
 *  ───────────────────────────────────────────────────────────────────────────
 *  Esta herramienta escribe páginas enteras; ésta es la única excepción, y va
 *  acotada a UN bloque por un motivo concreto.
 *
 *  `plataforma/inicio.html` llevaba su propia copia de la escuela en datos
 *  estructurados, escrita a mano hace meses, y había divergido de la buena:
 *  decía que atiende «Latinoamérica y España» cuando el resto del sitio dice
 *  Caracas y Venezuela, no traía región, y su `SearchAction` apuntaba al
 *  catálogo mientras la portada apunta al verificador. Las dos con el MISMO
 *  `@id`. Google resuelve el `@id` de forma global: dos nodos que se
 *  contradicen no es que valga uno, es que no se cree ninguno del todo.
 *
 *  Arreglarlo a mano lo habría dejado bien un día y roto al siguiente cambio,
 *  que es exactamente lo que ya pasó. Así que se sincroniza: se reemplaza sólo
 *  el bloque de datos estructurados, y todo lo demás de la pantalla —que es
 *  escrita a mano y sigue siéndolo— se deja intacto. */
async function sincronizarEscuelaEn(ruta) {
  const donde = join(RAIZ, ruta);
  const antes = await readFile(donde, 'utf8');
  const bloque = /<script type="application\/ld\+json">[\s\S]*?<\/script>/;
  if (!bloque.test(antes)) {
    console.log(`  · ${ruta} no tiene bloque de datos estructurados; no se toca`);
    return;
  }
  /* El mismo `WebSite` que la portada, no otro: comparten `@id`. */
  const nuevo = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [escuelaJsonLd(), sitioJsonLd()],
  });
  const t = antes.replace(bloque, `<script type="application/ld+json">${nuevo}</script>`);
  if (t === antes) { console.log(`  = ${ruta} ya decía lo mismo`); return; }
  await writeFile(donde, t, 'utf8');
  console.log(`  ✓ ${ruta} (sólo su bloque de datos estructurados)`);
}

main().catch((e) => { console.error('\n✗', e.message, '\n'); process.exit(1); });
