/* El globo de la portada.
   ═══════════════════════════════════════════════════════════════════════════
   Un mapamundi de puntos con los países donde damos clase encendidos y unidos
   por arcos de luz. Es la imagen de «presencia en nueve países» que pidió el
   dueño en lugar del mapa de Venezuela.

   Lo dibuja un <canvas> en proyección ortográfica —la de una esfera vista
   desde lejos—, sin librerías. Los puntos vienen ya calculados en
   globo-datos.js (herramientas/globo-de-puntos.mjs), así que aquí no se
   descarga ningún atlas.

   Los colores NO están aquí: salen de las variables --globo-* del lienzo, y
   así la versión clara y la oscura de la portada usan el mismo código. Al
   cambiar de versión se vuelven a leer en el acto (MutationObserver).

   No da la vuelta entera: va y viene entre los países encendidos, como un
   péndulo, frenando en cada extremo antes de regresar (22 de octubre de
   2026, a petición del dueño). Dando vueltas, la mitad del tiempo se veían
   Asia y África, donde no damos clase, y la presencia que se quería enseñar
   desaparecía. Si algún día los países están repartidos por todo el mundo
   —más de 200° entre el más oriental y el más occidental— vuelve a girar.

   Fluido, que fue lo segundo que pidió. La primera versión daba 24 cuadros
   por segundo en una pantalla de alta resolución, y se notaban los tirones.
   Dos cosas lo pagaban:
     · cada punto, en cada cuadro, calculaba senos y cosenos. Ahora cada
       punto guarda su vector una vez, y por cuadro sólo hay sumas y
       productos con el seno y el coseno del giro, que son dos números;
     · el resplandor era `shadowBlur`, que el navegador recalcula píxel a
       píxel. Ahora el borde de la esfera se pinta una sola vez en una capa
       aparte, y el brillo de puntos, arcos y marcas es un trazo ancho y
       tenue debajo del fino, que se ve igual y cuesta casi nada.

   Para no gastar batería: se para cuando el globo sale de la pantalla o la
   pestaña no está a la vista, y con «reducir movimiento» se queda quieto
   (se puede girar con el dedo igual). */
import { PUNTOS, CODIGOS, CENTROS } from './globo-datos.js?v=2026-10-22-5';

const RAD = Math.PI / 180;
const INCLINACION = 10 * RAD;     // la cámara, un poco por encima del ecuador
const VELOCIDAD = 5 * RAD;        // si gira entero: una vuelta en 72 s
const INICIO = -62 * RAD;         // si gira entero: empieza mirando a América
const PERIODO = 27000;            // ida y vuelta, en ms. Múltiplo de 2,7 s y de 1,8 s
                                  // (la luz de los arcos y la onda de las marcas):
                                  // así cada vaivén empieza igual que el anterior.

export function montarGlobo(lienzo, { paises = [] } = {}) {
  const ctx = lienzo.getContext('2d');
  if (!ctx) return;

  /* ── los puntos, desempaquetados una vez ─────────────────────────────────
     De cada punto se guarda su vector sobre la esfera unidad:
       px = cos φ · cos λ,  py = sin φ,  pz = cos φ · sin λ                    */
  const crudo = atob(PUNTOS);
  const bytes = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  const vista = new DataView(bytes.buffer);
  const n = bytes.length / 5;
  const elegidos = new Set(paises);
  const px = new Float32Array(n), py = new Float32Array(n), pz = new Float32Array(n);
  const encendido = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const la = (vista.getInt16(i * 5, true) / 100) * RAD;
    const lo = (vista.getInt16(i * 5 + 2, true) / 100) * RAD;
    px[i] = Math.cos(la) * Math.cos(lo); py[i] = Math.sin(la); pz[i] = Math.cos(la) * Math.sin(lo);
    encendido[i] = elegidos.has(CODIGOS[bytes[i * 5 + 4]]) ? 1 : 0;
  }

  /* ── las marcas y los arcos ──────────────────────────────────────────────
     Cada país se une con sus dos vecinos más cercanos. Una red y no una
     estrella: así no hay un centro del que salga todo, que es justo lo que
     se quería dejar de decir. */
  const vector = ([la, lo]) => [Math.cos(la * RAD) * Math.cos(lo * RAD),
    Math.sin(la * RAD), Math.cos(la * RAD) * Math.sin(lo * RAD)];
  const marcas = paises.filter((c) => CENTROS[c]).map((c) => ({ c, v: vector(CENTROS[c]) }));
  const angulo = (a, b) => Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
  const arcos = [];
  const vistos = new Set();
  for (const m of marcas) {
    marcas.filter((o) => o !== m)
      .sort((a, b) => angulo(m.v, a.v) - angulo(m.v, b.v))
      .slice(0, 2)
      .forEach((o) => {
        const clave = [m.c, o.c].sort().join('-');
        if (vistos.has(clave)) return;
        vistos.add(clave);
        arcos.push(trazarArco(m.v, o.v, angulo(m.v, o.v), arcos.length));
      });
  }

  /* ── tamaño, colores y la esfera de fondo ────────────────────────────── */
  let ancho = 0, alto = 0, escala = 1, colores = {};
  const fondo = document.createElement('canvas');
  const leerColores = () => {
    const css = getComputedStyle(lienzo);
    const v = (k, d) => css.getPropertyValue(k).trim() || d;
    colores = {
      punto: v('--globo-punto', 'rgba(160,190,240,.6)'),
      activo: v('--globo-activo', '#3ee6d2'),
      arco: v('--globo-arco', '#6b9bff'),
      esfera: v('--globo-esfera', 'rgba(62,230,210,.06)'),
      borde: v('--globo-borde', 'rgba(62,230,210,.35)'),
    };
    pintarFondo();
  };
  /* La esfera y su halo no se mueven: se pintan una vez por tamaño o por
     versión, y cada cuadro sólo los copia. Aquí el `shadowBlur` sí vale: se
     calcula una vez, no sesenta por segundo. */
  function pintarFondo() {
    fondo.width = ancho; fondo.height = alto;
    const f = fondo.getContext('2d');
    const R = Math.min(ancho, alto) * 0.44, cx = ancho / 2, cy = alto / 2;
    const g = f.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
    g.addColorStop(0, colores.esfera); g.addColorStop(1, 'rgba(0,0,0,0)');
    f.fillStyle = g;
    f.beginPath(); f.arc(cx, cy, R, 0, Math.PI * 2); f.fill();
    f.save();
    f.strokeStyle = colores.borde; f.lineWidth = 1.2 * escala;
    f.shadowColor = colores.borde; f.shadowBlur = 18 * escala;
    f.beginPath(); f.arc(cx, cy, R, 0, Math.PI * 2); f.stroke();
    f.restore();
  }
  const medir = () => {
    const r = lienzo.getBoundingClientRect();
    escala = Math.min(window.devicePixelRatio || 1, 2);
    ancho = Math.max(1, Math.round(r.width * escala));
    alto = Math.max(1, Math.round(r.height * escala));
    lienzo.width = ancho; lienzo.height = alto;
    leerColores();
  };

  /* ── la proyección ───────────────────────────────────────────────────────
     Con la cámara en latitud φ0 y longitud λ0 (el giro), y un punto (px, py,
     pz) de la esfera:
       c = px · cos λ0 + pz · sin λ0         (cos φ · cos(λ − λ0))
       x = pz · cos λ0 − px · sin λ0         (cos φ · sin(λ − λ0))
       z = sin φ0 · py + cos φ0 · c          (si es > 0, se ve)
       y = cos φ0 · py − sin φ0 · c
     Por cuadro, sólo cos λ0 y sin λ0: el resto son productos. */
  const s0 = Math.sin(INCLINACION), c0 = Math.cos(INCLINACION);
  let giro = INICIO;

  /* El vaivén: centrado entre el país más occidental y el más oriental, y
     con la amplitud justa para que los de cada punta lleguen cerca del centro
     antes de volver. */
  const lons = marcas.map((m) => CENTROS[m.c][1]);
  let vaiven = null;
  if (lons.length && Math.max(...lons) - Math.min(...lons) < 200) {
    const min = Math.min(...lons), max = Math.max(...lons);
    vaiven = { medio: ((min + max) / 2) * RAD, amplitud: Math.max(18, (max - min) / 2 - 20) * RAD };
    giro = vaiven.medio;
  }
  let base = giro, desvio = 0;

  const capas = [new Float32Array(n * 3), new Float32Array(n * 3),
    new Float32Array(n * 3), new Float32Array(n * 3)];
  const luces = new Float32Array(n * 3);

  function pintar(t) {
    const R = Math.min(ancho, alto) * 0.44;
    const cx = ancho / 2, cy = alto / 2;
    const cg = Math.cos(giro), sg = Math.sin(giro);
    const proyectar = (v, k = 1) => {
      const c = v[0] * cg + v[2] * sg;
      return { x: cx + R * k * (v[2] * cg - v[0] * sg), y: cy - R * k * (c0 * v[1] - s0 * c), z: s0 * v[1] + c0 * c };
    };
    ctx.clearRect(0, 0, ancho, alto);
    ctx.drawImage(fondo, 0, 0);

    /* Los puntos, por capas de profundidad: un solo trazo por capa es lo que
       deja pintar casi cinco mil círculos sesenta veces por segundo. */
    const largo = [0, 0, 0, 0];
    let nl = 0;
    for (let i = 0; i < n; i++) {
      const c = px[i] * cg + pz[i] * sg;
      const z = s0 * py[i] + c0 * c;
      if (z <= 0.02) continue;
      const x = cx + R * (pz[i] * cg - px[i] * sg);
      const y = cy - R * (c0 * py[i] - s0 * c);
      if (encendido[i]) { luces[nl++] = x; luces[nl++] = y; luces[nl++] = z; continue; }
      const k = z >= 0.75 ? 3 : (z * 4) | 0;
      const capa = capas[k];
      capa[largo[k]++] = x; capa[largo[k]++] = y; capa[largo[k]++] = z;
    }
    const radio = Math.max(0.8, R / 230);
    ctx.fillStyle = colores.punto;
    for (let k = 0; k < 4; k++) {
      const capa = capas[k];
      ctx.globalAlpha = 0.36 + k * 0.21;
      ctx.beginPath();
      for (let j = 0; j < largo[k]; j += 3) {
        const r = radio * (0.55 + 0.45 * capa[j + 2]);
        ctx.moveTo(capa[j] + r, capa[j + 1]);
        ctx.arc(capa[j], capa[j + 1], r, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    /* Los países encendidos: un halo tenue debajo y el punto encima. */
    ctx.fillStyle = colores.activo;
    for (const [alfa, tam] of [[0.22, 2.6], [1, 1.25]]) {
      ctx.globalAlpha = alfa;
      ctx.beginPath();
      for (let j = 0; j < nl; j += 3) {
        const r = radio * tam * (0.6 + 0.4 * luces[j + 2]);
        ctx.moveTo(luces[j] + r, luces[j + 1]);
        ctx.arc(luces[j], luces[j + 1], r, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    /* Los arcos —un trazo ancho y tenue, y encima el fino— y la luz que
       viaja por ellos. */
    ctx.strokeStyle = colores.arco;
    ctx.lineCap = 'round';
    for (const [alfa, grosor] of [[0.16, 5], [0.75, 1.3]]) {
      ctx.globalAlpha = alfa; ctx.lineWidth = grosor * escala;
      ctx.beginPath();
      for (const a of arcos) {
        let dentro = false;
        for (const p of a.puntos) {
          const q = proyectar(p.v, p.k);
          if (q.z < -0.05) { dentro = false; continue; }
          if (dentro) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
          dentro = true;
        }
      }
      ctx.stroke();
    }
    for (const a of arcos) {
      const f = ((t / 2700) + a.desfase) % 1;
      const p = a.puntos[Math.round(f * (a.puntos.length - 1))];
      const q = proyectar(p.v, p.k);
      if (q.z <= 0) continue;
      ctx.fillStyle = colores.arco; ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(q.x, q.y, 5 * escala, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(q.x, q.y, 2 * escala, 0, Math.PI * 2); ctx.fill();
    }

    /* Las marcas de cada país, con su onda. */
    for (const m of marcas) {
      const q = proyectar(m.v);
      if (q.z <= 0.05) continue;
      const onda = ((t / 1800) + m.c.charCodeAt(0) / 26) % 1;
      ctx.globalAlpha = (1 - onda) * q.z;
      ctx.strokeStyle = colores.activo; ctx.lineWidth = 1.2 * escala;
      ctx.beginPath(); ctx.arc(q.x, q.y, (3 + onda * 14) * escala, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = colores.activo;
      ctx.globalAlpha = 0.3 * q.z;
      ctx.beginPath(); ctx.arc(q.x, q.y, 7 * escala, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = q.z;
      ctx.beginPath(); ctx.arc(q.x, q.y, 3.2 * escala, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /* ── el movimiento ───────────────────────────────────────────────────── */
  const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let visible = true, anterior = 0, pedido = 0, arrastre = null;
  const bucle = (t) => {
    pedido = 0;
    const dt = anterior ? Math.min(64, t - anterior) : 16;
    anterior = t;
    if (!arrastre && !quieto) {
      if (vaiven) {
        /* Por el reloj y no sumando cuadros: en un teléfono lento, que pinta
           a 20 cuadros por segundo, el vaivén dura lo mismo que en uno rápido. */
        base = vaiven.medio + vaiven.amplitud * Math.sin((t / PERIODO) * Math.PI * 2);
        desvio *= Math.exp(-dt / 900);   // lo que se giró con el dedo vuelve solo al vaivén
      } else {
        base -= VELOCIDAD * dt / 1000;   // hacia el este, como la Tierra
      }
    }
    giro = base + desvio;
    pintar(t);
    if (visible && !document.hidden && !quieto) pedido = requestAnimationFrame(bucle);
  };
  const arrancar = () => { if (!pedido) { anterior = 0; pedido = requestAnimationFrame(bucle); } };

  /* Girarlo con el dedo o el ratón, sólo en horizontal: el desplazamiento
     vertical de la página sigue siendo del navegador (touch-action: pan-y). */
  lienzo.addEventListener('pointerdown', (e) => {
    arrastre = { x: e.clientX, desvio };
    lienzo.setPointerCapture?.(e.pointerId);
  });
  lienzo.addEventListener('pointermove', (e) => {
    if (!arrastre) return;
    desvio = arrastre.desvio - (e.clientX - arrastre.x) * 0.006;
    if (quieto) { giro = base + desvio; pintar(performance.now()); }
  });
  const soltar = () => { arrastre = null; };
  lienzo.addEventListener('pointerup', soltar);
  lienzo.addEventListener('pointercancel', soltar);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible) arrancar(); })
      .observe(lienzo);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) arrancar(); });
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => { medir(); if (quieto) pintar(0); }).observe(lienzo);
  }
  /* Al pasar de la versión oscura a la clara (o al revés) cambian las
     variables: se leen otra vez y se repinta la esfera de fondo. */
  new MutationObserver(() => { leerColores(); if (quieto) pintar(0); })
    .observe(document.body, { attributes: true, attributeFilter: ['class'] });
  medir();
  pintar(0);
  arrancar();
  lienzo.classList.add('listo');
}

/* El arco entre dos países: el camino más corto sobre la esfera (slerp),
   levantado en el medio para que se lea como un vuelo y no como una raya
   pegada al suelo. Más alto cuanto más lejos. */
function trazarArco(a, b, ang, i) {
  const pasos = 40, puntos = [];
  const s = Math.sin(ang) || 1;
  for (let k = 0; k <= pasos; k++) {
    const t = k / pasos;
    const wa = Math.sin((1 - t) * ang) / s, wb = Math.sin(t * ang) / s;
    puntos.push({
      v: [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb],
      k: 1 + (0.06 + 0.22 * (ang / Math.PI)) * Math.sin(Math.PI * t),
    });
  }
  return { puntos, desfase: (i * 0.37) % 1 };
}
