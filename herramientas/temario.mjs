/* Lo que el CEM enseña de verdad, para escribir las páginas que lee Google.
   ═══════════════════════════════════════════════════════════════════════════
   El problema, medido antes de escribir una línea: el sitio tenía CUATRO
   direcciones indexables y ninguna decía qué se enseña. `cem_courses` está
   vacío —hay un solo curso y está pausado—, así que el generador de páginas no
   tenía nada que generar y `/programas/` salía diciendo «ahora mismo no hay
   ninguno». Un buscador no puede posicionar lo que no existe.

   Pero la escuela SÍ tiene temario: dos diplomados de ocho módulos cada uno,
   521 certificados emitidos, 56 personas graduadas, seis promociones. Eso está
   en la base, en los certificados, y es comprobable uno a uno por su código.

   De ahí sale el contenido. Y de ahí y de ningún otro sitio: este archivo NO
   inventa precios, ni horarios, ni fechas de la próxima convocatoria, ni
   promesas de lo que aprenderás. Lo que dice de cada módulo es lo que se puede
   comprobar —su sitio en el diplomado, cuánta gente tiene ese certificado, en
   cuántas promociones se ha dado— más una definición de la materia, que es
   describir de qué trata el oficio, no prometer un temario que no conozco.

   La distinción importa: «el community management es llevar las cuentas de una
   marca» es cierto siempre. «En este módulo aprenderás a llevar las cuentas de
   una marca» sería inventarme su programa.
*/

const BASE = 'https://vajbsfgojtunamhrzrpf.supabase.co';
const CLAVE = 'sb_publishable_Xljd7Ep1GxBXSPp5F4A1hg_Qg-iESzl';

/* Los nombres, escritos como se escriben.
   ───────────────────────────────────────────────────────────────────────────
   En la base viven en mayúsculas y sin tildes, porque así se imprimen en el
   certificado: «GRABACION DE VIDEOS». Las tildes no se pueden deducir de un
   texto sin ellas —«PLANIFICACION» podría ser cualquier cosa—, así que la
   correspondencia va escrita a mano, una vez, aquí.

   La clave es EXACTAMENTE el nombre de la plantilla en la base. Si un día
   cambia, el generador se para y lo dice, en vez de publicar una página con el
   nombre en mayúsculas. */
/* Un icono y un color por módulo.
   ═══════════════════════════════════════════════════════════════════════════
   Las páginas de programa eran texto y nada más: dieciocho páginas idénticas
   en gris que no se parecían al resto de la casa. Y no había foto de ninguno
   —no existen—, así que la portada de cada módulo se dibuja: su icono sobre su
   color.

   Los colores no son decoración al azar. El logotipo de la escuela es un
   birrete con un degradado de arcoíris, y la propia hoja de estilos dice, a
   propósito de las tarjetas de valores: «en el brand board los cinco valores
   son cinco estrellas de cinco colores distintos; una rejilla de cinco iconos
   todos del mismo azul no se parece a eso». Ocho módulos en ocho colores del
   mismo arcoíris sí.

   Están elegidos para leerse en claro y en oscuro: el amarillo puro del
   logotipo desaparece sobre blanco, así que el sitio que le tocaría lo ocupa
   un ámbar. El icono viene de Material Symbols, que la casa ya carga. */
export const PALETA = [
  '#E5484D', '#E93D82', '#8E4EC6', '#5B5BD6',
  '#0091FF', '#12A594', '#46A758', '#F76B15',
];

export const MODULOS = {
  // ── Diplomado en Marketing Digital ──
  'PLANIFICACION Y NEGOCIOS': {
    icono: 'strategy',
    nombre: 'Planificación y negocios',
    que: 'Planificar un negocio es decidir a quién se le vende, con qué dinero y en '
      + 'qué orden. Es la parte del marketing que se hace antes de publicar nada.',
    busca: 'plan de negocios, planificación estratégica, modelo de negocio',
  },
  'COMMUNITY MANAGEMENT': {
    icono: 'forum',
    nombre: 'Community management',
    que: 'El community management es llevar las cuentas de una marca en redes: '
      + 'publicar, responder a quien escribe y sostener una conversación pública '
      + 'que dura años.',
    busca: 'community manager, gestión de comunidades, atención en redes',
  },
  'SOCIAL MEDIA MANAGEMENT': {
    icono: 'calendar_month',
    nombre: 'Social media management',
    que: 'El social media management es la capa de arriba: qué se publica, cuándo, '
      + 'en qué red y por qué, con un calendario y unos números detrás.',
    busca: 'social media manager, estrategia de redes sociales, calendario de contenidos',
  },
  'INSTAGRAM Y TIKTOK PARA NEGOCIOS': {
    icono: 'smartphone',
    nombre: 'Instagram y TikTok para negocios',
    que: 'Las dos redes donde hoy se descubre a una marca pequeña. Cada una tiene su '
      + 'formato, su ritmo y su manera de repartir alcance.',
    busca: 'Instagram para negocios, TikTok para negocios, reels, contenido vertical',
  },
  'RAMAS DEL MARKETING': {
    icono: 'account_tree',
    nombre: 'Ramas del marketing',
    que: 'El mapa del oficio: qué es marketing de contenidos, de resultados, de marca, '
      + 'relacional o de producto, y en qué se diferencia el trabajo de cada uno.',
    busca: 'tipos de marketing, ramas del marketing, especialidades de marketing',
  },
  'GESTION DE ADS': {
    icono: 'campaign',
    nombre: 'Gestión de anuncios',
    que: 'Pagar por alcance sin tirar el dinero: cómo se arma una campaña, a quién se '
      + 'le enseña y cómo se lee si funcionó.',
    busca: 'Meta Ads, Facebook Ads, publicidad en redes, campañas pagadas',
  },
  'GRABACION Y EDICION DE VIDEOS': {
    icono: 'movie',
    nombre: 'Grabación y edición de videos',
    que: 'Grabar con lo que se tiene —casi siempre un teléfono— y montarlo hasta que '
      + 'se pueda publicar.',
    busca: 'edición de video, grabación con celular, video para redes',
  },
  'CREACION DE CONTENIDO + IA': {
    icono: 'auto_awesome',
    nombre: 'Creación de contenido con IA',
    que: 'Usar herramientas de inteligencia artificial como parte del trabajo de '
      + 'producir contenido, sin que se note que las usaste.',
    busca: 'contenido con inteligencia artificial, IA para marketing, ChatGPT para contenido',
  },

  // ── Diplomado en Inteligencia Artificial y Producción Digital ──
  FOTOGRAFIA: {
    icono: 'photo_camera',
    nombre: 'Fotografía',
    que: 'La imagen fija: luz, encuadre y las decisiones que hacen que una foto de '
      + 'producto se vea profesional o se vea casera.',
    busca: 'curso de fotografía, fotografía de producto, fotografía digital',
  },
  'GRABACION DE VIDEOS': {
    icono: 'videocam',
    nombre: 'Grabación de videos',
    que: 'Lo que pasa antes de editar: qué se graba, con qué luz, con qué sonido y en '
      + 'qué orden, para no tener que arreglarlo después.',
    busca: 'grabación de video, producción audiovisual, video con celular',
  },
  'EDICION DE VIDEO EN PC': {
    icono: 'video_settings',
    nombre: 'Edición de video en PC',
    que: 'El montaje en computadora, que es donde un material bruto se convierte en '
      + 'algo que alguien mira hasta el final.',
    busca: 'edición de video en PC, montaje de video, postproducción',
  },
  IA1: {
    icono: 'neurology',
    nombre: 'Inteligencia artificial I',
    que: 'La primera mitad de la inteligencia artificial aplicada: qué hacen de verdad '
      + 'estas herramientas y para qué trabajos sirven hoy.',
    busca: 'curso de inteligencia artificial, IA aplicada, herramientas de IA',
  },
  IA2: {
    icono: 'smart_toy',
    nombre: 'Inteligencia artificial II',
    que: 'La segunda mitad, donde la IA deja de ser una curiosidad y se mete en el '
      + 'flujo de trabajo de todos los días.',
    busca: 'inteligencia artificial avanzada, IA para profesionales, automatización con IA',
  },
  PHOTOSHOP: {
    icono: 'brush',
    nombre: 'Photoshop',
    que: 'El programa con el que se retoca y se compone una imagen, y que sigue siendo '
      + 'el estándar de la industria treinta años después.',
    busca: 'curso de Photoshop, retoque fotográfico, Adobe Photoshop',
  },
  BRANDING: {
    icono: 'palette',
    nombre: 'Branding',
    que: 'La identidad de una marca: cómo se llama, cómo se ve, cómo suena y por qué '
      + 'alguien la reconoce sin leer el nombre.',
    busca: 'branding, identidad de marca, diseño de marca, manual de marca',
  },
  ILLUSTRATOR: {
    icono: 'draw',
    nombre: 'Illustrator',
    que: 'El dibujo vectorial: logotipos, iconos y todo lo que tiene que verse igual de '
      + 'nítido en una tarjeta y en una valla.',
    busca: 'curso de Illustrator, diseño vectorial, Adobe Illustrator, diseño de logos',
  },
};

/** Los dos diplomados, con lo que se puede decir de ellos sin inventar nada. */
export const DIPLOMADOS = {
  MKT: {
    clave: 'MKT',
    apodo: 'diplomado-marketing-digital',
    nombre: 'Diplomado en Marketing Digital',
    corto: 'Marketing Digital',
    que: 'Ocho módulos que recorren el oficio completo del marketing digital, desde '
      + 'planificar un negocio hasta grabar, pautar y medir. Cada módulo se certifica '
      + 'por separado, y al terminarlos todos se emite el diploma del diplomado.',
    busca: 'diplomado en marketing digital, curso de marketing digital en Venezuela, '
      + 'marketing digital Caracas',
  },
  IA: {
    clave: 'IA',
    apodo: 'diplomado-inteligencia-artificial',
    nombre: 'Diplomado en Inteligencia Artificial y Producción Digital',
    corto: 'Inteligencia Artificial',
    que: 'Ocho módulos que combinan producción visual —fotografía, video, Photoshop, '
      + 'Illustrator, branding— con dos módulos dedicados a la inteligencia artificial '
      + 'aplicada al trabajo. Cada módulo se certifica por separado.',
    busca: 'diplomado en inteligencia artificial, curso de IA en Venezuela, '
      + 'producción digital, diseño gráfico Caracas',
  },
};

/** «Community management» → «community-management», para la dirección. */
export function apodoDe(texto) {
  return String(texto ?? '')
    .replace(/[ñÑ]/g, 'n')
    // En escapes, no con los caracteres sueltos: son invisibles en un editor y
    // cualquier copiado los pierde sin que se note.
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Trae el temario de la base y lo cruza con los nombres de aquí.
 *
 * Si aparece un módulo que no está en MODULOS, SE PARA. Publicar una página
 * titulada «GRABACION DE VIDEOS» en mayúsculas y sin tildes es peor que no
 * publicarla: sale así en el resultado de búsqueda y ahí se queda.
 */
/**
 * La próxima convocatoria que el equipo escribió en Configuración, o null.
 *
 * Es la mitad que faltaba de ese campo: se guardaba y no lo leía nadie. La
 * función de la base ya devuelve null si no hay fecha o si ya pasó, así que
 * aquí no hay que decidir nada: si viene algo, se pinta; si no, no.
 *
 * Si la base no contesta, se devuelve null y la página sale sin la línea. Una
 * portada sin convocatoria es normal; una portada que no se genera porque la
 * convocatoria no cargó, no.
 */
export async function traerConvocatoria() {
  try {
    const res = await fetch(`${BASE}/rest/v1/rpc/cem_convocatoria_publica`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: CLAVE, Authorization: `Bearer ${CLAVE}` },
      body: '{}',
    });
    if (!res.ok) return null;
    const c = await res.json();
    return c && c.fecha ? c : null;
  } catch {
    return null;
  }
}

/**
 * La convocatoria abierta de cada diplomado, por su apodo.
 *
 * Devuelve un objeto {apodo: convocatoria | null}. La base ya decide qué es
 * «abierta» y ya hace la conversión a bolívares y dólares con la tasa del día,
 * así que aquí no se calcula nada: sólo se pide.
 *
 * Si la base no contesta, todas quedan en null y las páginas salen con su
 * estado vacío, que es una página correcta. Plantarse aquí dejaría el sitio
 * sin regenerar por no poder pintar un precio.
 */
export async function traerConvocatorias(apodos) {
  const salida = {};
  await Promise.all(apodos.map(async (apodo) => {
    salida[apodo] = null;
    try {
      const res = await fetch(`${BASE}/rest/v1/rpc/cem_convocatoria_de`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: CLAVE, Authorization: `Bearer ${CLAVE}` },
        body: JSON.stringify({ p_diplomado: apodo }),
      });
      if (!res.ok) return;
      const c = await res.json();
      if (c && c.fecha) salida[apodo] = c;
    } catch { /* sin convocatoria, la página sale igual */ }
  }));
  return salida;
}

export async function traerTemario() {
  const res = await fetch(`${BASE}/rest/v1/rpc/cem_temario_publico`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: CLAVE, Authorization: `Bearer ${CLAVE}` },
    body: '{}',
  });
  if (!res.ok) throw new Error(`La base contestó ${res.status} al pedir el temario: ${await res.text()}`);
  const datos = await res.json();

  const desconocidos = [];
  const diplomados = (datos.diplomados || []).map((d) => {
    const meta = DIPLOMADOS[d.familia];
    if (!meta) { desconocidos.push(`diplomado «${d.familia}»`); return null; }
    const modulos = (d.modulos || []).map((m) => {
      const mm = MODULOS[m.titulo];
      if (!mm) { desconocidos.push(`módulo «${m.titulo}»`); return null; }
      return {
        ...m, ...mm,
        apodo: apodoDe(mm.nombre),
        diplomado: meta.clave,
        /* El color por su sitio en el diplomado, no al azar: así el módulo 1
           es siempre el mismo rojo en la portada, en el índice y en su propia
           página, y se reconoce de una a otra. Los dos diplomados recorren el
           arcoíris al revés para que no parezcan la misma lista repetida. */
        color: PALETA[(d.familia === 'IA' ? PALETA.length - m.orden : m.orden - 1) % PALETA.length],
      };
    });
    return {
      ...meta,
      modulos: modulos.filter(Boolean),
      personas: d.personas,
      promociones: d.promociones,
      diplomas: (datos.diplomas || {})[d.familia] || 0,
    };
  }).filter(Boolean);

  /* El más cursado primero, en todas partes. Salían por orden alfabético, y
     eso ponía delante el diplomado de IA —13 personas— y detrás el de
     Marketing, que llevan 48. El primero de una lista se lee y el segundo no,
     así que el orden decide cuál de los dos posiciona. */
  diplomados.sort((a, b) => b.personas - a.personas);

  if (desconocidos.length) {
    throw new Error(
      `El temario de la base trae cosas que herramientas/temario.mjs no conoce:\n`
      + desconocidos.map((d) => `   · ${d}`).join('\n')
      + `\n\nAñádelas ahí con su nombre bien escrito —con tildes— y su definición.`
      + `\nSe para a propósito: publicar el nombre tal cual sale de la base significa`
      + `\npublicarlo en mayúsculas y sin tildes, y así queda en Google.`);
  }

  return { diplomados, totales: datos.totales || {} };
}
