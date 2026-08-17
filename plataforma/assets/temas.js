/* CEM · Apariencia
   ═══════════════════════════════════════════════════════════════════════════

   Toda la plataforma pinta con un puñado de tokens. Cambiar de paleta es
   reemplazar sus valores, y eso se puede hacer desde el navegador: aquí están
   las paletas y la maquinaria para aplicarlas.

   Lo delicado es el tema oscuro. Cada paleta trae dos juegos de valores, y no
   se pueden escribir en el elemento con `style.setProperty` porque un estilo
   en línea le gana a TODAS las reglas de la hoja —incluidas las de
   `prefers-color-scheme`—, y la plataforma se quedaría en claro de noche. Por
   eso se genera una hoja de estilo con la misma estructura de tres estados que
   usa `styles.css`:

     :root[data-paleta=X]                              → los valores de día
     @media(prefers-color-scheme:dark) …:not(...light) → los de noche cuando
                                                          el sistema lo pide
     :root[data-paleta=X][data-theme=dark]             → los de noche cuando
                                                          se eligen a mano

   Así la elección de paleta y la de tema son independientes y las dos
   funcionan.                                                                */

/* ── qué se puede elegir ──────────────────────────────────────────────────
   Los colores de estado —verde, ámbar, rojo— no están aquí a propósito: «al
   día», «pendiente» y «vencida» significan lo mismo en todas las paletas, así
   que no son decoración y no cambian. El dorado tampoco: es de las
   credenciales. */
export const PALETAS = {
  cem: {
    nombre: 'CEM institucional',
    resumen: 'El azul de la casa. Sobrio y con más peso que color.',
    muestra: ['#0d2440', '#0b7268', '#f7f8fa'],
    dia: {
      '--fondo': '#f7f8fa', '--papel': '#ffffff', '--hueco': '#eef0f3',
      '--tinta': '#15181c', '--tinta-2': '#5a616b', '--tinta-3': '#6c7179',
      '--filete': '#dfe3e8', '--filete-fuerte': '#c2c8d0',
      '--primary': '#0d2440', '--primary-suave': '#e8edf5', '--on-primary': '#ffffff',
      '--secondary': '#0b7268', '--secondary-container': '#d6f2ee',
    },
    noche: {
      '--fondo': '#111418', '--papel': '#181b20', '--hueco': '#212630',
      '--tinta': '#e9ecef', '--tinta-2': '#a6adb8', '--tinta-3': '#88909a',
      '--filete': '#2a2f38', '--filete-fuerte': '#3d4450',
      '--primary': '#a9c6ec', '--primary-suave': '#1c2634', '--on-primary': '#0d2440',
      '--secondary': '#5ecfc2', '--secondary-container': '#12332f',
    },
  },

  /* La del brand board del CEM, tal cual.
     ======================================================================
     Diez colores, y ocho de ellos son cromáticos: verde, amarillo, naranja,
     rosa, púrpura, azul y turquesa. Eso no es decoración, es la identidad —el
     birrete del logo es un arcoíris y las cinco estrellas de los valores son
     cada una de un color distinto. Una plataforma que los reduce a un azul y
     pinta doce gráficos del mismo azul no se parece a esta marca.

     Así que los ocho van enteros a las series de los gráficos, y el azul
     #3E7BFF hace de cromo porque es el único que se lee como texto sin
     retocarlo mucho. El carbón #1F1F1F y el gris #E9ECEF del board son la
     tinta y los huecos.

     El board pide además glassmorphism y gradientes suaves. Eso no se decide
     aquí —es el eje `data-estilo`, que ya tiene siete estilos— pero sí se deja
     el fondo claro que pide, y los colores aguantan el vidrio encima. */
  cemMarca: {
    nombre: 'CEM · marca oficial',
    resumen: 'Los diez colores del brand board, con Poppins. Es la de la empresa.',
    muestra: ['#3E7BFF', '#7EFF72', '#FF45A6', '#9B5CFF'],
    fuente: 'Poppins',
    dia: {
      // Blanco #FFFFFF, Gris Claro #E9ECEF y Carbón #1F1F1F, del board.
      /* «Gradientes suaves» y «efectos de luz», que es lo que pide el board.
         Seis manchas de color muy diluidas, una por cada color cromático de la
         marca, repartidas por las esquinas. No es un degradado de dos colores
         girado 135° —eso se ve en cualquier plantilla—: son luces sueltas, como
         las del board, y desde cualquier sitio de la pantalla se ven tres o
         cuatro colores distintos a la vez.
         Van al 12-30 % y no más: el fondo tiene que ser fondo. Cada punto de
         esta capa está debajo de texto que hay que poder leer, y las tarjetas
         encima son casi opacas. */
      '--luz': "radial-gradient(1200px 780px at 88% -10%, rgba(126,255,114,.30), transparent 62%)," +
        "radial-gradient(1000px 760px at -8% 12%, rgba(62,123,255,.22), transparent 64%)," +
        "radial-gradient(900px 700px at 8% 112%, rgba(155,92,255,.22), transparent 62%)," +
        "radial-gradient(820px 620px at 100% 88%, rgba(255,69,166,.18), transparent 62%)," +
        "radial-gradient(760px 600px at 52% 46%, rgba(0,224,209,.12), transparent 70%)," +
        "radial-gradient(680px 520px at 68% 118%, rgba(255,138,0,.12), transparent 64%)",
      '--fondo': '#f4f6f9', '--papel': '#ffffff', '--hueco': '#e9ecef',
      '--tinta': '#1f1f1f', '--tinta-2': '#54585f', '--tinta-3': '#696e77',
      '--filete': '#e2e6ea', '--filete-fuerte': '#c8ced6',
      /* El azul del board es #3E7BFF. Sobre blanco, con texto blanco encima,
         se queda a 3,3 de contraste: no llega. Se oscurece lo justo para que
         un botón se pueda leer, y el #3E7BFF entero se guarda para rellenos,
         que es donde el board lo usa. */
      '--primary': '#2c62e0', '--primary-suave': '#e7eeff', '--on-primary': '#ffffff',
      '--secondary': '#7c3ff0', '--secondary-container': '#f0e8ff',
      /* Los colores con significado también salen del board: el verde para
         «bien», el naranja para «ojo», el rosa para «mal». Oscurecidos, porque
         aquí hacen de TEXTO y a tamaño de letra el #7EFF72 no se ve.
         El dorado deja de ser dorado: esta marca no tiene oro, tiene naranja. */
      '--ok': '#1f7a34', '--ok-suave': '#e4f9e6',
      '--warn': '#9a5200', '--warn-suave': '#fff0dc',
      '--error': '#c8195e', '--error-suave': '#ffe7f1',
      /* El board no tiene oro. Las credenciales toman el púrpura, que es el
         color más «premium» de la paleta y además el único que aguanta letra
         blanca con holgura: el naranja #c96a00 se quedaba en 3,79 de contraste,
         por debajo del mínimo, y encima se confundía con el aviso. */
      '--gold': '#6b2fd0', '--gold-suave': '#f0e8ff', '--on-gold': '#ffffff',
      /* Las ocho series: los ocho cromáticos del board, sin retocar y en el
         orden en que el board los enseña. Aquí sí van enteros — una barra de
         color no tiene texto encima, así que puede brillar. */
      '--serie-1': '#3E7BFF', '--serie-2': '#7EFF72', '--serie-3': '#FF45A6',
      '--serie-4': '#FF8A00', '--serie-5': '#9B5CFF', '--serie-6': '#00E0D1',
      '--serie-7': '#FFE45E', '--serie-8': '#1F1F1F',
    },
    noche: {
      // De noche la misma luz, más apagada: sobre negro cualquier color grita.
      '--luz': "radial-gradient(1200px 780px at 88% -10%, rgba(126,255,114,.16), transparent 62%)," +
        "radial-gradient(1000px 760px at -8% 12%, rgba(62,123,255,.20), transparent 64%)," +
        "radial-gradient(900px 700px at 8% 112%, rgba(155,92,255,.20), transparent 62%)," +
        "radial-gradient(820px 620px at 100% 88%, rgba(255,69,166,.14), transparent 62%)," +
        "radial-gradient(760px 600px at 52% 46%, rgba(0,224,209,.10), transparent 70%)," +
        "radial-gradient(680px 520px at 68% 118%, rgba(255,138,0,.10), transparent 64%)",
      '--fondo': '#141416', '--papel': '#1d1d20', '--hueco': '#26262b',
      '--tinta': '#f2f3f5', '--tinta-2': '#b0b4bd', '--tinta-3': '#9398a2',
      '--filete': '#2e2e34', '--filete-fuerte': '#43444c',
      // De noche los colores del board se leen tal cual: para eso son luminosos.
      '--primary': '#8FB4FF', '--primary-suave': '#1a2033', '--on-primary': '#0b1428',
      '--secondary': '#C4A0FF', '--secondary-container': '#241a38',
      '--ok': '#7EFF72', '--ok-suave': '#14251a',
      '--warn': '#FFB55C', '--warn-suave': '#2b1e0e',
      '--error': '#FF7FB8', '--error-suave': '#2e1522',
      '--gold': '#C4A0FF', '--gold-suave': '#241a38', '--on-gold': '#180a2e',
      '--serie-1': '#6E9DFF', '--serie-2': '#7EFF72', '--serie-3': '#FF6EB8',
      '--serie-4': '#FFA33D', '--serie-5': '#B98BFF', '--serie-6': '#3DEBDE',
      '--serie-7': '#FFE45E', '--serie-8': '#E9ECEF',
    },
  },

  indigo: {
    nombre: 'Índigo y mandarina',
    resumen: 'Institucional pero despierta. La mandarina aparece poco y se ve.',
    muestra: ['#4338ca', '#ea580c', '#f7f7fb'],
    dia: {
      '--fondo': '#f7f7fb', '--papel': '#ffffff', '--hueco': '#eeeef6',
      '--tinta': '#1a1a2e', '--tinta-2': '#55556e', '--tinta-3': '#68687a',
      '--filete': '#e3e3ee', '--filete-fuerte': '#c9c9dc',
      '--primary': '#4338ca', '--primary-suave': '#eae8fb', '--on-primary': '#ffffff',
      '--secondary': '#c2410c', '--secondary-container': '#fdeade',
    },
    noche: {
      '--fondo': '#131320', '--papel': '#1b1b2c', '--hueco': '#242438',
      '--tinta': '#eceaf6', '--tinta-2': '#a5a3bd', '--tinta-3': '#8e8da2',
      '--filete': '#2c2c42', '--filete-fuerte': '#403f5c',
      '--primary': '#a5b4fc', '--primary-suave': '#232241', '--on-primary': '#1a1a2e',
      '--secondary': '#fdba74', '--secondary-container': '#33200f',
    },
  },

  caribe: {
    nombre: 'Turquesa Caribe',
    resumen: 'La más luminosa y la que menos cansa en pantallas llenas de datos.',
    muestra: ['#0f766e', '#f0653a', '#f4faf9'],
    dia: {
      '--fondo': '#f4faf9', '--papel': '#ffffff', '--hueco': '#e6f4f2',
      '--tinta': '#10201e', '--tinta-2': '#4a625f', '--tinta-3': '#5b6f6d',
      '--filete': '#d8ebe8', '--filete-fuerte': '#b6d6d1',
      '--primary': '#0f766e', '--primary-suave': '#def2ef', '--on-primary': '#ffffff',
      '--secondary': '#c2410c', '--secondary-container': '#fde5dc',
    },
    noche: {
      '--fondo': '#0e1a19', '--papel': '#152524', '--hueco': '#1d302e',
      '--tinta': '#e6f2f0', '--tinta-2': '#9ab5b1', '--tinta-3': '#819a96',
      '--filete': '#233735', '--filete-fuerte': '#345048',
      '--primary': '#5eead4', '--primary-suave': '#123330', '--on-primary': '#062b27',
      '--secondary': '#fdba8f', '--secondary-container': '#32180e',
    },
  },

  violeta: {
    nombre: 'Violeta y lima',
    resumen: 'La más joven. No se parece a ninguna otra plataforma educativa.',
    muestra: ['#7c3aed', '#65a30d', '#faf8fe'],
    dia: {
      '--fondo': '#faf8fe', '--papel': '#ffffff', '--hueco': '#f1ecfb',
      '--tinta': '#1e1633', '--tinta-2': '#5b4e75', '--tinta-3': '#6f6680',
      '--filete': '#e9e2f6', '--filete-fuerte': '#cfc3e6',
      '--primary': '#7c3aed', '--primary-suave': '#f0e9fe', '--on-primary': '#ffffff',
      '--secondary': '#4d7c0f', '--secondary-container': '#e8f4d5',
    },
    noche: {
      '--fondo': '#15111f', '--papel': '#1e192b', '--hueco': '#272138',
      '--tinta': '#eee9f8', '--tinta-2': '#a99cc4', '--tinta-3': '#9d94b0',
      '--filete': '#2e2740', '--filete-fuerte': '#443a5c',
      '--primary': '#c4b5fd', '--primary-suave': '#26203a', '--on-primary': '#20143d',
      '--secondary': '#bef264', '--secondary-container': '#1f2c0a',
    },
  },

  electrico: {
    nombre: 'Azul eléctrico',
    resumen: 'La más sobria de las vivas: un solo acento hace todo el trabajo.',
    muestra: ['#2563eb', '#0891b2', '#f5f8ff'],
    dia: {
      '--fondo': '#f5f8ff', '--papel': '#ffffff', '--hueco': '#e8effc',
      '--tinta': '#10192b', '--tinta-2': '#4c5a73', '--tinta-3': '#606a7e',
      '--filete': '#dee7f7', '--filete-fuerte': '#bfcde8',
      '--primary': '#2563eb', '--primary-suave': '#e4edfd', '--on-primary': '#ffffff',
      '--secondary': '#0e7490', '--secondary-container': '#dcf0f7',
    },
    noche: {
      '--fondo': '#0f1420', '--papel': '#171d2b', '--hueco': '#1f2739',
      '--tinta': '#e8edf7', '--tinta-2': '#9fadc4', '--tinta-3': '#8d99ad',
      '--filete': '#252d3f', '--filete-fuerte': '#374257',
      '--primary': '#93b4fd', '--primary-suave': '#1a2440', '--on-primary': '#0b1730',
      '--secondary': '#7dd3fc', '--secondary-container': '#06242f',
    },
  },

  magenta: {
    nombre: 'Magenta y ámbar',
    resumen: 'La más cálida. Ninguna institución educativa usa magenta.',
    muestra: ['#be185d', '#d97706', '#fef7fa'],
    dia: {
      '--fondo': '#fef7fa', '--papel': '#ffffff', '--hueco': '#fbebf2',
      '--tinta': '#2b0f1c', '--tinta-2': '#6b4657', '--tinta-3': '#7c636e',
      '--filete': '#f5dde8', '--filete-fuerte': '#e6bccf',
      '--primary': '#be185d', '--primary-suave': '#fbe6ef', '--on-primary': '#ffffff',
      '--secondary': '#b45309', '--secondary-container': '#fbeed8',
    },
    noche: {
      '--fondo': '#1a1016', '--papel': '#241820', '--hueco': '#2e1f29',
      '--tinta': '#f6e9ef', '--tinta-2': '#c09dad', '--tinta-3': '#a48390',
      '--filete': '#38242e', '--filete-fuerte': '#523640',
      '--primary': '#f9a8d4', '--primary-suave': '#331c28', '--on-primary': '#3d0a24',
      '--secondary': '#fcd34d', '--secondary-container': '#2f2408',
    },
  },
};

/* La marca es la de la marca: quien entra por primera vez ve los colores del
   CEM, no un azul institucional genérico. La antigua «CEM institucional» sigue
   en el catálogo para quien la prefiera — sobria, de un solo color— pero deja
   de ser la de fábrica.
   Ojo si se cambia: hojaDe() no escribe hoja para la paleta por defecto porque
   asume que está en styles.css, y la del board NO lo está. Por eso ahora se
   escribe siempre. */
export const PALETA_POR_DEFECTO = 'cemMarca';

/* ── cómo son los recuadros ───────────────────────────────────────────────
   Las recetas viven en styles.css bajo :root[data-estilo="…"]; aquí sólo
   están los nombres, para poder pintar el selector y validar lo guardado.

   `desenfoque` no es un adorno del texto: dice si el estilo usa
   backdrop-filter en las tarjetas, que es lo que cuesta al desplazar. Los
   dos que no lo usan son los únicos que pueden llegar hasta una tabla
   larga, y eso hay que poder leerlo antes de elegir. */
export const ESTILOS = {
  plano: {
    nombre: 'Plano',
    resumen: 'Sin caja: la cifra descansa sobre el fondo y un filete la separa.',
    desenfoque: false,
  },
  escarcha: {
    nombre: 'Escarcha',
    resumen: 'Vidrio esmerilado: translúcido, difuminado y un filete de un píxel.',
    desenfoque: true,
  },
  marco: {
    nombre: 'Marco de vidrio',
    resumen: 'Aro grueso translúcido y dentro un panel más claro con el canto difuso.',
    desenfoque: true,
  },
  bisel: {
    nombre: 'Bisel',
    resumen: 'Luz arriba, sombra abajo: el canto parece tener grosor.',
    desenfoque: true,
  },
  canto: {
    nombre: 'Canto tallado',
    resumen: 'Marco de degradado que brilla arriba y se tiñe de la paleta abajo.',
    desenfoque: false,
  },
  halo: {
    nombre: 'Halo',
    resumen: 'Sin marco: un resplandor de la paleta se escapa por detrás.',
    desenfoque: true,
  },
  tintado: {
    nombre: 'Vidrio tintado',
    resumen: 'Cada cifra con su color: lo que sube en verde, lo que baja en rojo.',
    desenfoque: true,
  },
};
export const ESTILO_POR_DEFECTO = 'plano';

export const FORMAS = {
  recta:   { nombre: 'Rectas',   resumen: 'Esquinas de 3 px. Lo más serio.' },
  suave:   { nombre: 'Suaves',   resumen: 'Esquinas de 10 px. Lo de siempre.' },
  redonda: { nombre: 'Redondas', resumen: 'Esquinas de 18 px. Lo más amable.' },
};
export const FORMA_POR_DEFECTO = 'suave';

export const DENSIDADES = {
  compacta: { nombre: 'Compacta', resumen: 'Diez filas más por pantalla. Para quien revisa todo el día.' },
  normal:   { nombre: 'Normal',   resumen: 'El equilibrio de siempre.' },
  amplia:   { nombre: 'Amplia',   resumen: 'Más aire. Para pantallas grandes y sesiones cortas.' },
};
export const DENSIDAD_POR_DEFECTO = 'normal';

/* Dónde se recuerda. Es una preferencia de quien mira, no de la institución:
   va en el navegador de cada quien y no toca la base. */
const LLAVE = {
  paleta: 'cemPaleta', tema: 'cemTema', estilo: 'cemEstilo',
  forma: 'cemForma', densidad: 'cemDensidad',
  vidrio: 'cemVidrio',   // sólo para leer lo que quedó guardado antes
};
const leer = (k, porDefecto) => {
  try { return localStorage.getItem(k) ?? porDefecto; } catch { return porDefecto; }
};
const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin sitio: se pierde al salir */ } };

/** Devuelve lo guardado si está en el catálogo; si no, lo de fábrica. */
const deCatalogo = (catalogo, clave, porDefecto) => {
  const v = leer(clave, porDefecto);
  return catalogo[v] ? v : porDefecto;
};

export const paletaActual = () => deCatalogo(PALETAS, LLAVE.paleta, PALETA_POR_DEFECTO);
export const TEMAS = ['auto', 'claro', 'oscuro'];
/* Guardar un valor de tema que no existe dejaba la página en claro sin decir
   nada: el resto de los ajustes sí se validan contra su catálogo, y éste era
   el único que se creía cualquier cosa. */
export const temaActual = () => {
  const t = leer(LLAVE.tema, 'auto');
  return TEMAS.includes(t) ? t : 'auto';
};
export const formaActual  = () => deCatalogo(FORMAS, LLAVE.forma, FORMA_POR_DEFECTO);
export const densidadActual = () => deCatalogo(DENSIDADES, LLAVE.densidad, DENSIDAD_POR_DEFECTO);

/* Antes esto era un sí/no —`cemVidrio`— y ahora son siete estilos. Quien ya
   había encendido el vidrio se encuentra con «escarcha», que es exactamente
   lo que tenía; quien no, con «plano». Nadie entra y ve otra cosa. */
export const estiloActual = () => {
  const guardado = leer(LLAVE.estilo, null);
  if (guardado && ESTILOS[guardado]) return guardado;
  return leer(LLAVE.vidrio, 'no') === 'si' ? 'escarcha' : ESTILO_POR_DEFECTO;
};
/** Sigue habiendo vidrio si el estilo no es el plano. */
export const vidrioActual = () => estiloActual() !== 'plano';

const declaraciones = (tokens) =>
  Object.entries(tokens).map(([k, v]) => `${k}:${v};`).join('');

/** La hoja con los tres estados de la paleta elegida. */
function hojaDe(clave) {
  const p = PALETAS[clave];
  if (!p) return '';
  const sel = `:root[data-paleta="${clave}"]`;
  /* Si la paleta trae tipografía —la del manual de marca la trae—, se declara
     junto a los colores: una identidad son las dos cosas, y separarlas dejaría
     los colores de la empresa con la letra de otra. */
  const conLetra = (tokens) => p.fuente
    ? { ...tokens, '--texto': `'${p.fuente}',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif` }
    : tokens;
  return `${sel}{${declaraciones(conLetra(p.dia))}}
@media (prefers-color-scheme:dark){${sel}:not([data-theme="light"]){${declaraciones(p.noche)}}}
${sel}[data-theme="dark"]{${declaraciones(p.noche)}}`;
}

/* La tipografía se pide sólo si alguien elige una paleta que la use. Cargarla en
   las 58 pantallas por si acaso serían 58 descargas de una letra que casi nadie
   va a ver, y tocar los 58 archivos cada vez que se añada una paleta.
   `display=swap`: primero se lee con la letra del sistema y luego cambia. Con
   `block` la página se quedaría en blanco esperando a Google. */
function pedirLaLetra(familia) {
  const id = 'cemLetraPaleta';
  const puesto = document.getElementById(id);
  if (!familia) { if (puesto) puesto.remove(); return; }
  const href = `https://fonts.googleapis.com/css2?family=${
    encodeURIComponent(familia).replace(/%20/g, '+')}:wght@400;500;600;700&display=swap`;
  if (puesto) { if (puesto.href !== href) puesto.href = href; return; }
  const link = document.createElement('link');
  link.id = id; link.rel = 'stylesheet'; link.href = href;
  document.head.appendChild(link);
}

/**
 * Deja la página con la apariencia que toque. Se llama sola al cargar y cada
 * vez que se cambia algo en Configuración.
 */
export function aplicarApariencia({ paleta, tema, estilo, forma, densidad, vidrio } = {}) {
  const raiz = document.documentElement;

  if (paleta !== undefined) guardar(LLAVE.paleta, PALETAS[paleta] ? paleta : PALETA_POR_DEFECTO);
  if (tema !== undefined) guardar(LLAVE.tema, TEMAS.includes(tema) ? tema : 'auto');
  if (estilo !== undefined) guardar(LLAVE.estilo, ESTILOS[estilo] ? estilo : ESTILO_POR_DEFECTO);
  if (forma !== undefined) guardar(LLAVE.forma, FORMAS[forma] ? forma : FORMA_POR_DEFECTO);
  if (densidad !== undefined) guardar(LLAVE.densidad, DENSIDADES[densidad] ? densidad : DENSIDAD_POR_DEFECTO);
  // El sí/no de antes sigue funcionando para quien lo llame así.
  if (vidrio !== undefined) guardar(LLAVE.estilo, vidrio ? 'escarcha' : 'plano');

  const clave = paletaActual();
  let hoja = document.getElementById('cemPaletaHoja');
  if (!hoja) {
    hoja = document.createElement('style');
    hoja.id = 'cemPaletaHoja';
    document.head.appendChild(hoja);
  }
  // La de la casa ya está escrita en styles.css: no hace falta repetirla.
  /* Se escribe siempre, también la de por defecto. Antes se saltaba la de
     fábrica porque era la que ya venía en styles.css; ahora la de fábrica es la
     del brand board, que vive aquí y no allí, así que saltarla dejaba la
     plataforma con los colores viejos y sin que nada lo dijera. */
  hoja.textContent = hojaDe(clave);
  raiz.dataset.paleta = clave;
  pedirLaLetra(PALETAS[clave]?.fuente);

  const t = temaActual();
  if (t === 'auto') delete raiz.dataset.theme;
  else raiz.dataset.theme = t === 'oscuro' ? 'dark' : 'light';

  raiz.dataset.estilo = estiloActual();
  raiz.dataset.forma = formaActual();
  raiz.dataset.densidad = densidadActual();
  return {
    paleta: clave, tema: t, estilo: estiloActual(),
    forma: formaActual(), densidad: densidadActual(),
  };
}

/** Vuelve todo a como viene de fábrica. */
export function aparienciaDeFabrica() {
  return aplicarApariencia({
    paleta: PALETA_POR_DEFECTO, tema: 'auto', estilo: ESTILO_POR_DEFECTO,
    forma: FORMA_POR_DEFECTO, densidad: DENSIDAD_POR_DEFECTO,
  });
}

/* Se aplica al cargar el módulo, antes de que `mount()` destape la página:
   así no se ve un parpadeo con los colores de la casa antes de los elegidos. */
aplicarApariencia();
