/* El globo de la portada.
   ═══════════════════════════════════════════════════════════════════════════
   Un mapamundi de puntos que gira, con los países donde damos clase
   encendidos y unidos por arcos de luz. Es la imagen de «presencia en nueve
   países» que pidió el dueño en lugar del mapa de Venezuela.

   Lo dibuja un <canvas> en proyección ortográfica —la de una esfera vista
   desde lejos—, sin librerías: son tres fórmulas. Los puntos vienen ya
   calculados en globo-datos.js (herramientas/globo-de-puntos.mjs), así que
   aquí no se descarga ningún atlas.

   Los colores NO están aquí: salen de las variables --globo-* del lienzo, y
   así la versión clara y la oscura de la portada usan el mismo código.

   No da la vuelta entera: va y viene entre los países encendidos, como un
   péndulo, frenando en cada extremo antes de regresar (22 de octubre de
   2026, a petición del dueño). Dando vueltas, la mitad del tiempo se veían
   Asia y África, donde no damos clase, y la presencia que se quería enseñar
   desaparecía. Si algún día los países están repartidos por todo el mundo
   —más de 200° entre el más oriental y el más occidental— vuelve a girar.

   Para no gastar batería: se para cuando el globo sale de la pantalla o la
   pestaña no está a la vista, y con «reducir movimiento» se queda quieto
   (se puede girar con el dedo igual). */
import { PUNTOS, CODIGOS, CENTROS } from './globo-datos.js?v=2026-10-22';

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

  /* ── los puntos, desempaquetados una vez ─────────────────────────────── */
  const crudo = atob(PUNTOS);
  const bytes = new Uint8Array(crudo.length);
  for (let i = 0; i < crudo.length; i++) bytes[i] = crudo.charCodeAt(i);
  const vista = new DataView(bytes.buffer);
  const n = bytes.length / 5;
  const elegidos = new Set(paises);
  const sinLat = new Float32Array(n), cosLat = new Float32Array(n);
  const lon = new Float32Array(n), encendido = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const la = (vista.getInt16(i * 5, true) / 100) * RAD;
    sinLat[i] = Math.sin(la); cosLat[i] = Math.cos(la);
    lon[i] = (vista.getInt16(i * 5 + 2, true) / 100) * RAD;
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

  /* ── tamaño y colores ────────────────────────────────────────────────── */
  let ancho = 0, alto = 0, escala = 1, colores = {};
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
  };
  const medir = () => {
    const r = lienzo.getBoundingClientRect();
    escala = Math.min(window.devicePixelRatio || 1, 2);
    ancho = Math.max(1, Math.round(r.width * escala));
    alto = Math.max(1, Math.round(r.height * escala));
    lienzo.width = ancho; lienzo.height = alto;
    leerColores();
  };

  /* ── la proyección ───────────────────────────────────────────────────────
     Para un punto de latitud φ y longitud λ, con la cámara en (φ0, λ0):
       z = sin φ0 · sin φ + cos φ0 · cos φ · cos(λ − λ0)   (si es > 0, se ve)
       x = cos φ · sin(λ − λ0)
       y = cos φ0 · sin φ − sin φ0 · cos φ · cos(λ − λ0)                      */
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

  function proyectarVector([vx, vy, vz], k = 1) {
    const sl = vy, cl = Math.hypot(vx, vz), lo = Math.atan2(vz, vx);
    const d = lo - giro, cd = Math.cos(d);
    return { x: cl * Math.sin(d) * k, y: (c0 * sl - s0 * cl * cd) * k, z: s0 * sl + c0 * cl * cd };
  }

  function pintar(t) {
    const R = Math.min(ancho, alto) * 0.44;
    const cx = ancho / 2, cy = alto / 2;
    ctx.clearRect(0, 0, ancho, alto);

    /* La esfera: un relleno apenas visible y un halo en el borde. */
    const g = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.1, cx, cy, R);
    g.addColorStop(0, colores.esfera); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.save();
    ctx.strokeStyle = colores.borde; ctx.lineWidth = 1.2 * escala;
    ctx.shadowColor = colores.borde; ctx.shadowBlur = 18 * escala;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    /* Los puntos, por capas de profundidad: un solo trazo por capa es lo que
       deja pintar casi cinco mil círculos sesenta veces por segundo. */
    const capas = [[], [], [], []], luces = [];
    for (let i = 0; i < n; i++) {
      const d = lon[i] - giro, cd = Math.cos(d);
      const z = s0 * sinLat[i] + c0 * cosLat[i] * cd;
      if (z <= 0.02) continue;
      const x = cx + R * cosLat[i] * Math.sin(d);
      const y = cy - R * (c0 * sinLat[i] - s0 * cosLat[i] * cd);
      if (encendido[i]) luces.push(x, y, z);
      else capas[Math.min(3, (z * 4) | 0)].push(x, y, z);
    }
    const radio = Math.max(0.8, R / 230);
    ctx.fillStyle = colores.punto;
    capas.forEach((capa, k) => {
      ctx.globalAlpha = 0.36 + k * 0.21;
      ctx.beginPath();
      for (let j = 0; j < capa.length; j += 3) {
        const r = radio * (0.55 + 0.45 * capa[j + 2]);
        ctx.moveTo(capa[j] + r, capa[j + 1]);
        ctx.arc(capa[j], capa[j + 1], r, 0, Math.PI * 2);
      }
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    ctx.save();
    ctx.fillStyle = colores.activo; ctx.shadowColor = colores.activo; ctx.shadowBlur = 6 * escala;
    ctx.beginPath();
    for (let j = 0; j < luces.length; j += 3) {
      const r = radio * 1.25 * (0.6 + 0.4 * luces[j + 2]);
      ctx.moveTo(luces[j] + r, luces[j + 1]);
      ctx.arc(luces[j], luces[j + 1], r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.restore();

    /* Los arcos y la luz que viaja por ellos. */
    ctx.save();
    ctx.lineWidth = 1.3 * escala; ctx.strokeStyle = colores.arco;
    ctx.shadowColor = colores.arco; ctx.shadowBlur = 8 * escala;
    for (const a of arcos) {
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      let dentro = false;
      for (const p of a.puntos) {
        const q = proyectarVector(p.v, p.k);
        if (q.z < -0.05) { dentro = false; continue; }
        const X = cx + R * q.x, Y = cy - R * q.y;
        if (dentro) ctx.lineTo(X, Y); else ctx.moveTo(X, Y);
        dentro = true;
      }
      ctx.stroke();
      const f = ((t / 2700) + a.desfase) % 1;
      const p = a.puntos[Math.round(f * (a.puntos.length - 1))];
      const q = proyectarVector(p.v, p.k);
      if (q.z > 0) {
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(cx + R * q.x, cy - R * q.y, 2 * escala, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();

    /* Las marcas de cada país, con su onda. */
    ctx.save();
    for (const m of marcas) {
      const q = proyectarVector(m.v);
      if (q.z <= 0.05) continue;
      const X = cx + R * q.x, Y = cy - R * q.y;
      const onda = ((t / 1800) + m.c.charCodeAt(0) / 26) % 1;
      ctx.globalAlpha = (1 - onda) * q.z;
      ctx.strokeStyle = colores.activo; ctx.lineWidth = 1.2 * escala;
      ctx.beginPath(); ctx.arc(X, Y, (3 + onda * 14) * escala, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = q.z;
      ctx.fillStyle = colores.activo; ctx.shadowColor = colores.activo; ctx.shadowBlur = 12 * escala;
      ctx.beginPath(); ctx.arc(X, Y, 3.2 * escala, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  /* ── el movimiento ───────────────────────────────────────────────────── */
  const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let visible = true, anterior = 0, pedido = 0, arrastre = null, cuadros = 0;
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
    if (++cuadros % 90 === 0) leerColores();
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
