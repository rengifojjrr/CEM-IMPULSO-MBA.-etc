#!/usr/bin/env node
/* Dibuja la mascota del CEM y la deja en plataforma/assets/mascota.svg
   ═══════════════════════════════════════════════════════════════════════════

   Por qué hay un programa para esto y no un archivo dibujado a mano
   ---------------------------------------------------------------------------
   El bicho es peludo, y el pelo es la mitad de su carácter. Un contorno peludo
   dibujado a mano son doscientas curvas escritas una por una: nadie lo vuelve a
   tocar nunca, y en cuanto haya que cambiarle el tamaño de la cara o subirle
   el gorro, se rompe. Aquí el contorno sale de una fórmula —una elipse con el
   radio modulado por tres senos de frecuencias distintas— así que se puede
   ajustar cambiando un número.

   Tres senos y no uno: con una sola frecuencia el contorno parece un engranaje.
   Se ve el patrón y deja de parecer pelo.

   Esto NO sustituye al render de verdad
   ---------------------------------------------------------------------------
   La lámina que mandó la casa es una imagen tridimensional con pelo real,
   sombras y tela. Un SVG no llega ahí y fingir que sí sería mentir. Esto es lo
   que se ve mientras no esté subido el render: en cuanto alguien suba el PNG
   desde Configuración, la plataforma usa ese y esto deja de aparecer.

   Se ejecuta:  node herramientas/dibujar-mascota.mjs
*/
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SALIDA = resolve(AQUI, '..', 'plataforma', 'assets', 'mascota.svg');

const r = (n) => Math.round(n * 10) / 10;

/* ── El contorno peludo ──────────────────────────────────────────────────── */
function peludo({ cx, cy, rx, ry, puntos = 168, amplitud = 1, aplanarAbajo = 0.02 }) {
  const pt = [];
  for (let i = 0; i < puntos; i++) {
    const t = (i / puntos) * Math.PI * 2;
    const m = 1
      + amplitud * 0.030 * Math.sin(19 * t + 0.4)
      + amplitud * 0.018 * Math.sin(31 * t + 2.1)
      + amplitud * 0.012 * Math.sin(47 * t + 4.7);
    // Abajo el pelo cuelga menos: el bicho se apoya en el suelo.
    const k = m - aplanarAbajo * Math.max(0, Math.sin(t - Math.PI / 2));
    pt.push([cx + rx * k * Math.cos(t), cy + ry * k * Math.sin(t)]);
  }
  const n = pt.length;
  let d = `M${r(pt[0][0])} ${r(pt[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pt[(i - 1 + n) % n], p1 = pt[i], p2 = pt[(i + 1) % n], p3 = pt[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r(c1[0])} ${r(c1[1])} ${r(c2[0])} ${r(c2[1])} ${r(p2[0])} ${r(p2[1])}`;
  }
  return d + 'Z';
}

/* ── Mechones sueltos ────────────────────────────────────────────────────── */
/* El contorno solo da una silueta ondulada. Lo que la lee como PELO son los
   mechones que se despegan del borde, sobre todo arriba, donde la luz pega. */
function mechones({ cx, cy, rx, ry, desde, hasta, cuantos, largo }) {
  const p = [];
  for (let i = 0; i < cuantos; i++) {
    const t = desde + (hasta - desde) * (i / (cuantos - 1));
    const x = cx + rx * Math.cos(t);
    const y = cy + ry * Math.sin(t);
    const l = largo * (0.6 + 0.4 * Math.abs(Math.sin(i * 2.7)));
    const inc = t + 0.16 * Math.sin(i * 1.9);   // no todos apuntan igual
    const px = x + l * Math.cos(inc), py = y + l * Math.sin(inc);
    const ancho = 4.2 + 2.2 * Math.abs(Math.sin(i * 3.3));   // ni uno igual al de al lado
    const ax = x + Math.cos(t + Math.PI / 2) * ancho, ay = y + Math.sin(t + Math.PI / 2) * ancho;
    const bx = x - Math.cos(t + Math.PI / 2) * ancho, by = y - Math.sin(t + Math.PI / 2) * ancho;
    p.push(`M${r(ax)} ${r(ay)}Q${r(px)} ${r(py)} ${r(bx)} ${r(by)}Z`);
  }
  return p.join('');
}

/* ── Hebras de pelo por dentro ───────────────────────────────────────────── */
function hebras(lista) {
  return lista.map(([x, y, l, giro]) => {
    const dx = l * Math.sin(giro), dy = l * Math.cos(giro);
    return `M${r(x)} ${r(y)}q${r(dx * 0.35)} ${r(dy * 0.5)} ${r(dx)} ${r(dy)}`;
  }).join('');
}

/* Las medidas salen de medir la lámina, no de inventarlas.
   ───────────────────────────────────────────────────────────────────────────
   En la vista de frente, sobre una altura total de 460: el birrete ocupa de 60
   a 150, el cuerpo empieza en 120, los ojos están en 190, la boca en 235, los
   hombros en 258, la sudadera acaba en 372 y las patas asoman hasta 432.

   El primer intento puso el birrete cuarenta puntos más abajo y la tabla le
   tapaba media cara: el vértice de delante bajaba hasta entre los ojos. En la
   lámina el birrete se ve casi de canto —muy aplastado— y por eso cabe encima
   de la cabeza sin comérsela. Aplastarlo es lo que lo arregla, no encogerlo. */
const CY = 255, RX = 130, RY = 135;

/* La amplitud va baja y los mechones son cortos y muchos.
   ───────────────────────────────────────────────────────────────────────────
   Con la amplitud a 1 y mechones de 14 el contorno salía como un engranaje:
   picos altos, todos iguales, separados a la misma distancia. El pelo de la
   lámina es lo contrario — mucho, corto y desordenado. Bajar la amplitud y
   subir la cantidad es lo que lo convierte de rueda dentada en pelaje. */
const CUERPO = peludo({ cx: 200, cy: CY, rx: RX, ry: RY, amplitud: 0.55 });
const MECHONES_ARRIBA = mechones({
  cx: 200, cy: CY, rx: RX, ry: RY,
  desde: Math.PI * 1.02, hasta: Math.PI * 1.98, cuantos: 46, largo: 8.5,
});
const MECHONES_LADOS = mechones({
  cx: 200, cy: CY, rx: RX, ry: RY,
  desde: Math.PI * 0.02, hasta: Math.PI * 0.46, cuantos: 18, largo: 7,
}) + mechones({
  cx: 200, cy: CY, rx: RX, ry: RY,
  desde: Math.PI * 0.54, hasta: Math.PI * 0.98, cuantos: 18, largo: 7,
});

// Hebras del pecho: van en abanico desde el cuello hacia abajo, que es como
// cae el pelo de verdad. Si todas fueran verticales parecería un felpudo.
const HEBRAS = hebras([
  [182, 272, 46, 0.10], [192, 264, 58, 0.03], [206, 264, 58, -0.03],
  [216, 272, 46, -0.10], [174, 292, 40, 0.15], [226, 292, 40, -0.15],
  [188, 306, 48, 0.05], [212, 306, 48, -0.05], [200, 322, 44, 0.0],
  [180, 334, 30, 0.12], [220, 334, 30, -0.12], [162, 256, 28, 0.22],
  [238, 256, 28, -0.22], [196, 172, 22, 0.05], [206, 170, 22, -0.05],
  [150, 292, 24, 0.2], [250, 292, 24, -0.2],
]);

/* ── Una pata ────────────────────────────────────────────────────────────── */
/* Van dibujadas ANTES del cuerpo, así que sólo se ve lo que asoma por debajo:
   dos patas rechonchas con tres deditos. En la lámina apenas sobresalen. */
const pata = (x) => `
    <g>
      <path d="M${x - 30} 344 q-8 34 -2 56 q5 16 32 16 q27 0 32 -16 q6 -22 -2 -56 Z"
            fill="url(#gPata)"/>
      <ellipse cx="${x - 17}" cy="${407}" rx="8"   ry="6.2" fill="#c3c7ce" opacity=".9"/>
      <ellipse cx="${x}"      cy="${410}" rx="8.6" ry="6.6" fill="#c3c7ce" opacity=".9"/>
      <ellipse cx="${x + 17}" cy="${407}" rx="8"   ry="6.2" fill="#c3c7ce" opacity=".9"/>
    </g>`;

/* ── El ojo ──────────────────────────────────────────────────────────────── */
/* El iris NO va centrado. En la lámina los dos miran ligeramente hacia dentro
   y hacia abajo, y eso es lo que hace que parezca que te mira a ti y no al
   infinito. Centrarlos lo vuelve un muñeco. */
const ojo = (cx, cy, rr, mirax, miray) => `
    <g>
      <ellipse cx="${cx}" cy="${cy}" rx="${rr}" ry="${rr * 1.06}" fill="#fff"/>
      <ellipse cx="${cx}" cy="${cy}" rx="${rr}" ry="${rr * 1.06}" fill="none"
               stroke="#c2c6cd" stroke-width="1.2" opacity=".7"/>
      <circle cx="${cx + mirax}" cy="${cy + miray}" r="${rr * 0.60}" fill="#3a4048"/>
      <circle cx="${cx + mirax}" cy="${cy + miray}" r="${rr * 0.30}" fill="#12161c"/>
      <circle cx="${cx + mirax - rr * 0.22}" cy="${cy + miray - rr * 0.26}" r="${rr * 0.19}" fill="#fff"/>
      <circle cx="${cx + mirax + rr * 0.20}" cy="${cy + miray + rr * 0.18}" r="${rr * 0.09}" fill="#fff" opacity=".65"/>
    </g>`;

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 460" role="img"
     aria-labelledby="tituloMascota" width="400" height="460">
  <title id="tituloMascota">La mascota del CEM: un monstruito peludo con birrete y sudadera azul</title>
  <defs>
    <linearGradient id="gPelo" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"   stop-color="#fbfbfc"/>
      <stop offset=".45" stop-color="#e9eaec"/>
      <stop offset="1"   stop-color="#cfd2d7"/>
    </linearGradient>
    <linearGradient id="gPata" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#e4e6e9"/><stop offset="1" stop-color="#c8ccd2"/>
    </linearGradient>
    <linearGradient id="gAzul" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2f6fd0"/>
      <stop offset=".55" stop-color="#1f57b4"/>
      <stop offset="1" stop-color="#164493"/>
    </linearGradient>
    <linearGradient id="gAzulOscuro" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1c4fa5"/><stop offset="1" stop-color="#123c86"/>
    </linearGradient>
    <!-- El arcoíris del birrete va de azul a rojo por la diagonal, como en la
         lámina: el vértice de la izquierda es azul y el de la derecha, rojo. -->
    <!-- De izquierda a derecha y no en diagonal: en la lámina el pico de la
         izquierda es azul franco y el de la derecha, rojo. En diagonal el pico
         izquierdo salía verde azulado y se perdía el azul del principio. -->
    <linearGradient id="gArco" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0"   stop-color="#2a54d4"/>
      <stop offset=".18" stop-color="#1f8fe0"/>
      <stop offset=".36" stop-color="#17b5a8"/>
      <stop offset=".52" stop-color="#4cc04e"/>
      <stop offset=".68" stop-color="#f2c30d"/>
      <stop offset=".85" stop-color="#f0801a"/>
      <stop offset="1"   stop-color="#e5342c"/>
    </linearGradient>
    <linearGradient id="gArcoBanda" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0"   stop-color="#1b63cf"/>
      <stop offset=".3"  stop-color="#16a8bd"/>
      <stop offset=".55" stop-color="#3fbf5a"/>
      <stop offset=".78" stop-color="#e9b90c"/>
      <stop offset="1"   stop-color="#e0522a"/>
    </linearGradient>
    <linearGradient id="gBorla" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fdd535"/><stop offset="1" stop-color="#eda211"/>
    </linearGradient>
    <radialGradient id="gSombra" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#0d1b33" stop-opacity=".26"/>
      <stop offset="1" stop-color="#0d1b33" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="cCuerpo"><path d="${CUERPO}"/></clipPath>
  </defs>

  <ellipse cx="200" cy="424" rx="128" ry="24" fill="url(#gSombra)"/>

  ${pata(157)}
  ${pata(243)}

  <!-- CUERPO -->
  <g>
    <path d="${MECHONES_ARRIBA}${MECHONES_LADOS}" fill="#e8eaec"/>
    <path d="${CUERPO}" fill="url(#gPelo)"/>
    <g clip-path="url(#cCuerpo)">
      <!-- Sombra propia por los lados: sin esto el cuerpo se ve plano. -->
      <ellipse cx="200" cy="${CY}" rx="${RX}" ry="${RY}" fill="none"
               stroke="#b7bbc2" stroke-width="30" opacity=".22"/>
      <!-- Las hebras van muy suaves: subidas de opacidad se leen como rayas
           blancas pintadas encima, no como pelo. -->
      <path d="${HEBRAS}" fill="none" stroke="#ffffff" stroke-width="3.2"
            stroke-linecap="round" opacity=".4"/>
      <path d="${HEBRAS}" fill="none" stroke="#c4c8ce" stroke-width="1.1"
            stroke-linecap="round" opacity=".28" transform="translate(3.5,0)"/>
    </g>
  </g>

  <!-- SUDADERA
       ─────────────────────────────────────────────────────────────────────
       Va abierta y sólo cubre los lados: por el centro se ve una franja ancha
       de pelo, que es lo que hace que siga leyéndose como un bicho peludo con
       chaqueta y no como un muñeco vestido de azul. El primer intento la puso
       cerrada y empezando bajo la boca, y se comió el cuerpo entero.

       La capucha va DETRÁS del cuello y sólo asoma por los hombros. Cruzarla
       por delante le tapaba la barbilla. -->
  <g>
    <path d="M146 270 q54 -20 108 0 q-4 -20 -54 -20 q-50 0 -54 20 Z" fill="url(#gAzulOscuro)"/>

    <!-- mangas: se quedan DENTRO de la silueta del pelo. Al salirse parecían
         una falda azul y el bicho dejaba de tener cuerpo. -->
    <path d="M146 270 q-40 16 -48 56 q-6 34 0 52 q19 8 36 1 q-5 -54 12 -84 Z"
          fill="url(#gAzul)"/>
    <path d="M254 270 q40 16 48 56 q6 34 0 52 q-19 8 -36 1 q5 -54 -12 -84 Z"
          fill="url(#gAzul)"/>

    <!-- delanteros: dos tiras estrechas. La chaqueta va MUY abierta, y por el
         centro se ve una franja ancha de barriga peluda: es lo que hace que
         siga leyéndose como un bicho con chaqueta. -->
    <path d="M146 270 q-9 44 -5 76 q2 20 8 32 q24 7 36 -1 q-8 -58 -3 -108 Z"
          fill="url(#gAzul)"/>
    <path d="M254 270 q9 44 5 76 q-2 20 -8 32 q-24 7 -36 -1 q8 -58 3 -108 Z"
          fill="url(#gAzul)"/>

    <!-- cremallera del borde, bolsillos y costura -->
    <path d="M181 274 q-6 52 2 104" fill="none" stroke="#0f3a80" stroke-width="2.6"
          stroke-linecap="round" opacity=".75"/>
    <path d="M219 274 q6 52 -2 104" fill="none" stroke="#0f3a80" stroke-width="2.6"
          stroke-linecap="round" opacity=".75"/>
    <rect x="148" y="318" width="26" height="3.6" rx="1.8" fill="#0f3a80" opacity=".6"/>
    <rect x="226" y="318" width="26" height="3.6" rx="1.8" fill="#0f3a80" opacity=".6"/>
    <path d="M150 340 h24" stroke="#0f3a80" stroke-width="2" opacity=".4"/>
    <path d="M226 340 h24" stroke="#0f3a80" stroke-width="2" opacity=".4"/>
    <path d="M144 278 q-24 20 -30 50" fill="none" stroke="#5b96ea" stroke-width="5"
          stroke-linecap="round" opacity=".4"/>
    <path d="M256 278 q24 20 30 50" fill="none" stroke="#5b96ea" stroke-width="5"
          stroke-linecap="round" opacity=".4"/>
  </g>

  <!-- CARA -->
  ${ojo(168, 190, 34, 4, 3)}
  ${ojo(236, 190, 34, -4, 3)}

  <!-- La boca: una sonrisa ancha con dos colmillos colgando de arriba.
       Los colmillos son la firma del bicho; sin ellos es un peluche cualquiera. -->
  <path d="M156 231 q44 12 88 0 q-4 46 -44 46 q-40 0 -44 -46 Z" fill="#3a3230"/>
  <path d="M170 253 q30 22 60 0 q-6 20 -30 20 q-24 0 -30 -20 Z" fill="#8d4a4f" opacity=".75"/>
  <path d="M170 236 l11 1.6 l-2 16 q-8 0 -9 -17.6 Z" fill="#fbfbf7"/>
  <path d="M230 236 l-11 1.6 l2 16 q8 0 9 -17.6 Z" fill="#fbfbf7"/>

  <!-- BIRRETE
       ─────────────────────────────────────────────────────────────────────
       Muy aplastado a propósito: en la lámina se ve casi de canto. Un rombo
       alto le baja el vértice de delante hasta entre los ojos y le tapa media
       cara, que es exactamente lo que pasó al primer intento.
       El orden es: banda que se hunde en el pelo, tabla encima, borla al final. -->
  <g>
    <path d="M152 124 q48 -17 96 0 q3 19 -3 25 q-45 15 -90 0 q-6 -6 -3 -25 Z"
          fill="url(#gArcoBanda)"/>
    <path d="M152 128 q48 -15 96 0" fill="none" stroke="#ffffff" stroke-width="2" opacity=".3"/>
    <path d="M200 98 L314 120 L200 142 L86 120 Z" fill="url(#gArco)"/>
    <path d="M200 98 L314 120 L200 142 L86 120 Z" fill="none" stroke="#ffffff"
          stroke-width="1.6" opacity=".4"/>
    <path d="M200 142 L314 120 L314 126 L200 148 Z" fill="#1b1f26" opacity=".2"/>
    <path d="M200 142 L86 120 L86 126 L200 148 Z" fill="#1b1f26" opacity=".28"/>
    <circle cx="200" cy="120" r="6.5" fill="#e5342c"/>
    <circle cx="198" cy="118" r="2.4" fill="#ff8a80" opacity=".8"/>
    <!-- la borla sale del botón, cruza hasta el pico derecho y cae al lado de la cara -->
    <path d="M200 120 q44 -3 80 4" fill="none" stroke="#e5342c" stroke-width="4.5"
          stroke-linecap="round"/>
    <circle cx="282" cy="125" r="8.5" fill="#e5342c"/>
    <circle cx="279" cy="122" r="2.8" fill="#ff8a80" opacity=".75"/>
    <path d="M273 131 q9 6 18 0 q5 46 -3 66 q-6 5 -12 0 q-8 -20 -3 -66 Z" fill="url(#gBorla)"/>
    <path d="M277 135 v60 M282 135 v62 M287 135 v60" stroke="#c8880c"
          stroke-width="1.2" opacity=".5"/>
  </g>
</svg>
`;

/* La misma mascota recortada a la cara.
   ───────────────────────────────────────────────────────────────────────────
   El botón que abre el chat mide 60 píxeles. Ahí el cuerpo entero no se ve:
   se convierte en una mancha gris con una raya azul. Lo que se reconoce a ese
   tamaño son los ojos, la sonrisa y el birrete, así que hay un segundo archivo
   con el mismo dibujo y otro encuadre. Mismo dibujo, no otro: si algún día se
   cambia el bicho, cambian los dos a la vez. */
const CARA = SVG
  .replace('viewBox="0 0 400 460" width="400" height="460"', 'viewBox="72 88 256 186" width="256" height="186"')
  .replace('viewBox="0 0 400 460"', 'viewBox="72 88 256 186"')
  .replace('width="400" height="460"', 'width="256" height="186"')
  .replace('id="tituloMascota"', 'id="tituloMascotaCara"')
  .replace('aria-labelledby="tituloMascota"', 'aria-labelledby="tituloMascotaCara"');

mkdirSync(dirname(SALIDA), { recursive: true });
writeFileSync(SALIDA, SVG);
writeFileSync(SALIDA.replace('mascota.svg', 'mascota-cara.svg'), CARA);
console.log(`Mascota escrita en ${SALIDA} (${SVG.length} bytes)`);
console.log(`Cara escrita en ${SALIDA.replace('mascota.svg', 'mascota-cara.svg')} (${CARA.length} bytes)`);
