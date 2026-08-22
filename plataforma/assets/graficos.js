/* Los gráficos de la plataforma.
   ==========================================================================
   Tres decisiones que explican todo lo demás:

   1 · NINGÚN COLOR ESCRITO AQUÍ. Cada barra pinta con var(--serie-1),
       var(--ok), var(--primary)… Los tokens los define la paleta que cada
       quien eligió en Configuración, así que los gráficos cambian de color
       con el resto de la aplicación sin que nadie los toque. Lo mismo con las
       esquinas (--r, la forma) y con el aire (--aire, la densidad).

   2 · TODO TROZO ES UN ENLACE cuando se le da un `href`. Un gráfico que no se
       puede pulsar es un póster: se mira, se dice «ajá» y no cambia nada. El
       enlace lleva el filtro puesto y aterriza en la lista ya filtrada, así
       que el gráfico y la tabla nunca se contradicen.

   3 · DEBAJO DE CADA GRÁFICO, SU TABLA, plegada. Un lector de pantalla no ve
       un dibujo, y además es de donde la gente copia los números para
       pegarlos en un correo, que es lo que termina pasando siempre.

   Sin librería: son barras, y una librería de gráficos son doscientos
   kilobytes para dibujar rectángulos. El sitio se publica como archivos
   estáticos y no hay paso de compilación donde meterla. */

import { esc, num } from './app.js?v=2026-08-22-5';

/* ============ utilidades ============ */

const noEsNada = (v) => v == null || v === '' || Number.isNaN(Number(v));
const n = (v) => (noEsNada(v) ? 0 : Number(v));

/** El techo de la escala. Si todo vale cero, 1: dividir entre cero pinta NaN. */
const techo = (valores) => Math.max(...valores.map(n), 0) || 1;

const fmt = (v, formato) => {
  if (typeof formato === 'function') return formato(v);
  if (formato === 'pct') return `${Math.round(n(v))}%`;
  return num(v);
};

/** Un trozo pulsable si tiene a dónde ir, y un trozo a secas si no. */
function trozo(href, clases, estilo, dentro, titulo) {
  const t = titulo ? ` title="${esc(titulo)}"` : '';
  return href
    ? `<a class="${clases}" style="${estilo}" href="${esc(href)}"${t}>${dentro}</a>`
    : `<span class="${clases}" style="${estilo}"${t}>${dentro}</span>`;
}

/**
 * El marco común: título, el dibujo, el pie y la tabla plegada.
 * @param {object} o
 * @param {string} o.titulo     lo que responde el gráfico
 * @param {string} [o.pie]      la lectura: qué hay que mirar aquí
 * @param {string} o.cuerpo     el HTML del dibujo
 * @param {Array}  o.datos      para la tabla de debajo
 * @param {string} [o.col]      cómo se llama la columna de la etiqueta
 * @param {string} [o.colN]     cómo se llama la columna del número
 */
export function marco({ titulo, pie, cuerpo, datos = [], col = 'Concepto', colN = 'Cantidad',
                        formato, hay = null, vacio = 'Todavía no hay datos que enseñar aquí.' }) {
  // Por defecto «hay algo» es que alguna cifra no sea cero. Los gráficos cuyo
  // valor no es un número —la línea de hitos lleva fechas— lo dicen ellos, que
  // si no Number('20/09/2026') da NaN y el gráfico se declara vacío teniendo
  // seis cuotas dentro.
  const hayAlgo = hay != null ? hay : datos.some((d) => n(d.n) !== 0);
  return `<figure class="gr">
    <figcaption class="gr-tit">${esc(titulo)}</figcaption>
    ${hayAlgo ? cuerpo : `<p class="gr-vacio">${esc(vacio)}</p>`}
    ${pie && hayAlgo ? `<p class="gr-pie">${pie}</p>` : ''}
    ${hayAlgo && datos.length ? `<details class="gr-tabla">
      <summary>Ver los números</summary>
      <div class="table-wrap"><table>
        <thead><tr><th>${esc(col)}</th><th class="num">${esc(colN)}</th></tr></thead>
        <tbody>${datos.map((d) => `<tr><td class="wrap">${esc(d.etq)}</td>
          <td class="num">${fmt(d.n, formato)}</td></tr>`).join('')}</tbody>
      </table></div></details>` : ''}
  </figure>`;
}

/* ============ columnas ============
   Para el tiempo: doce meses, treinta días. Se leen de izquierda a derecha
   porque así se lee el tiempo, y por eso no se ordenan por tamaño. */
export function columnas({ titulo, pie, datos, formato, alto = 150, resaltar = () => false }) {
  const max = techo(datos.map((d) => d.n));
  // Doce meses en media pantalla son doce columnas de cincuenta puntos: un
  // importe encima de cada una se pisa con el de al lado y no se lee ninguno.
  // A partir de ocho, el número se queda sólo en el tooltip y en la tabla.
  const cifras = datos.length <= 8;
  const cuerpo = `<div class="gr-cols" style="--gr-alto:${alto}px" role="img"
      aria-label="${esc(titulo)}: ${datos.map((d) => `${d.etq} ${fmt(d.n, formato)}`).join(', ')}">
    ${datos.map((d) => trozo(d.href, `gr-col${resaltar(d) ? ' ojo' : ''}`, '',
      `${cifras ? `<span class="v">${fmt(d.n, formato)}</span>` : ''}
       <span class="palo" style="height:${Math.max(2, Math.round(100 * n(d.n) / max))}%"></span>
       <span class="etq">${esc(d.etq)}</span>`,
      `${d.etq}: ${fmt(d.n, formato)}`)).join('')}
  </div>`;
  return marco({ titulo, pie, cuerpo, datos, formato, col: 'Periodo' });
}

/* ============ barras horizontales ============
   Para comparar cosas con nombre. Los programas del CEM se llaman «Maestría
   en Dirección de Negocios (MBA Ejecutivo)»: girado 90° no lo lee nadie. */
export function barras({ titulo, pie, datos, formato, col = 'Concepto', colN = 'Cantidad',
                         tope = 0, ordenar = true, marcar = () => null }) {
  let lista = ordenar ? [...datos].sort((a, b) => n(b.n) - n(a.n)) : [...datos];
  const sobran = tope && lista.length > tope ? lista.length - tope : 0;
  if (sobran) lista = lista.slice(0, tope);
  const max = techo(lista.map((d) => d.n));
  const total = datos.reduce((t, d) => t + n(d.n), 0);

  const cuerpo = `<div class="gr-barras" role="img"
      aria-label="${esc(titulo)}: ${lista.map((d) => `${d.etq} ${fmt(d.n, formato)}`).join(', ')}">
    ${lista.map((d) => {
      const senal = marcar(d);          // 'ok' | 'warn' | 'err' | null
      return `<div class="gr-fila${senal ? ` ${senal}` : ''}">
        <span class="gr-etq">${esc(d.etq)}</span>
        ${trozo(d.href, 'gr-pista', '',
          `<span class="gr-relleno" style="width:${Math.max(1.5, 100 * n(d.n) / max)}%"></span>`,
          `${d.etq}: ${fmt(d.n, formato)}`)}
        <span class="gr-cifra">${fmt(d.n, formato)}${
          total && formato !== 'pct' ? `<small>${Math.round(100 * n(d.n) / total)}%</small>` : ''}</span>
      </div>`;
    }).join('')}
    ${sobran ? `<p class="gr-mas">Y ${sobran} más. Están todas en la tabla de abajo.</p>` : ''}
  </div>`;
  return marco({ titulo, pie, cuerpo, datos, formato, col, colN });
}

/* ============ una barra apilada ============
   De qué se compone un total. Una sola barra, porque lo que se quiere saber
   es la proporción; con una torta hay que comparar ángulos, que es justo lo
   que el ojo hace peor. */
export function apilada({ titulo, pie, partes, formato }) {
  const total = partes.reduce((t, p) => t + n(p.n), 0) || 1;
  const cuerpo = `<div role="img"
      aria-label="${esc(titulo)}: ${partes.map((p) => `${p.etq} ${fmt(p.n, formato)}`).join(', ')}">
    <div class="gr-apilada">
      ${partes.map((p) => trozo(p.href, `gr-parte ${p.tono || ''}`,
        `width:${(100 * n(p.n) / total).toFixed(2)}%`, '',
        `${p.etq}: ${fmt(p.n, formato)} (${Math.round(100 * n(p.n) / total)}%)`)).join('')}
    </div>
    <div class="gr-leyenda">
      ${partes.map((p) => `<span class="gr-clave">
        <i class="gr-punto ${p.tono || ''}"></i>${esc(p.etq)}
        <b>${fmt(p.n, formato)}</b>
        <small>${Math.round(100 * n(p.n) / total)}%</small></span>`).join('')}
    </div></div>`;
  return marco({ titulo, pie, cuerpo, datos: partes, formato, col: 'Parte' });
}

/* ============ columnas apiladas ============
   Composición a lo largo del tiempo: por dónde entró el dinero cada mes,
   cuántos comprobantes llegaron y en qué estado quedaron. */
export function apiladas({ titulo, pie, periodos, series, formato, alto = 160 }) {
  const totales = periodos.map((p) => series.reduce((t, s) => t + n(p.valores[s.clave]), 0));
  const max = techo(totales);
  // Lo mismo que en las columnas sueltas: con treinta días, ni los importes ni
  // las fechas caben encima de una columna de veinte puntos. Los importes se
  // van al tooltip y de las fechas se deja una de cada tantas.
  const cifras = periodos.length <= 8;
  const cadaCuantas = Math.ceil(periodos.length / 8);
  const cuerpo = `<div class="gr-cols apiladas" style="--gr-alto:${alto}px" role="img"
      aria-label="${esc(titulo)}">
    ${periodos.map((p, i) => `<span class="gr-col">
      ${cifras ? `<span class="v">${fmt(totales[i], formato)}</span>` : ''}
      <span class="palo pila" style="height:${Math.max(2, Math.round(100 * totales[i] / max))}%">
        ${series.map((s) => {
          const v = n(p.valores[s.clave]);
          if (!v) return '';
          return trozo(p.href ? `${p.href}&serie=${encodeURIComponent(s.clave)}` : null,
            `gr-parte ${s.tono || ''}`,
            `height:${(100 * v / (totales[i] || 1)).toFixed(2)}%`, '',
            `${p.etq} · ${s.etq}: ${fmt(v, formato)}`);
        }).join('')}
      </span>
      <span class="etq${i % cadaCuantas ? ' salta' : ''}">${esc(p.etq)}</span></span>`).join('')}
  </div>
  <div class="gr-leyenda">${series.map((s) =>
    `<span class="gr-clave"><i class="gr-punto ${s.tono || ''}"></i>${esc(s.etq)}</span>`).join('')}</div>`;
  return marco({ titulo, pie, cuerpo, formato,
    datos: periodos.map((p, i) => ({ etq: p.etq, n: totales[i] })), col: 'Periodo' });
}

/* ============ línea ============
   Muchos puntos seguidos. Lleva una línea de referencia opcional —la nota
   aprobatoria, la meta del mes— porque una curva sin su umbral no dice si va
   bien o mal, sólo si sube o baja. */
export function linea({ titulo, pie, datos, formato, referencia = null, etqRef = '', alto = 170 }) {
  const vals = datos.map((d) => n(d.n));
  const max = Math.max(techo(vals), referencia != null ? Number(referencia) : 0);
  const ancho = 100, altoV = 100;
  const x = (i) => (datos.length === 1 ? ancho / 2 : (i * ancho) / (datos.length - 1));
  const y = (v) => altoV - (n(v) / max) * altoV;
  const puntos = datos.map((d, i) => `${x(i).toFixed(2)},${y(d.n).toFixed(2)}`).join(' ');
  // Con un solo dato no hay curva que trazar. El área lo unía con las dos
  // esquinas de abajo y salía un triángulo enorme que no quería decir nada.
  const hayCurva = datos.length > 1;
  const area = hayCurva
    ? `M0,${altoV} L${datos.map((d, i) => `${x(i).toFixed(2)},${y(d.n).toFixed(2)}`).join(' L')} L${ancho},${altoV} Z`
    : '';

  const cuerpo = `<div class="gr-linea" style="--gr-alto:${alto}px">
    <svg viewBox="0 0 ${ancho} ${altoV}" preserveAspectRatio="none" role="img"
         aria-label="${esc(titulo)}: ${datos.map((d) => `${d.etq} ${fmt(d.n, formato)}`).join(', ')}">
      ${[0.25, 0.5, 0.75].map((f) => `<line class="rejilla" x1="0" x2="${ancho}"
        y1="${(altoV * f).toFixed(1)}" y2="${(altoV * f).toFixed(1)}"/>`).join('')}
      ${referencia != null ? `<line class="referencia" x1="0" x2="${ancho}"
        y1="${y(referencia).toFixed(2)}" y2="${y(referencia).toFixed(2)}"/>` : ''}
      ${hayCurva ? `<path class="area" d="${area}"/>
      <polyline class="trazo" points="${puntos}"/>` : ''}
    </svg>
    <div class="gr-puntos">
      ${datos.map((d, i) => trozo(d.href, 'gr-punto-dato',
        `left:${x(i).toFixed(2)}%;bottom:${(100 - y(d.n)).toFixed(2)}%`, '',
        `${d.etq}: ${fmt(d.n, formato)}`)).join('')}
    </div>
    <div class="gr-eje">${datos.map((d, i) =>
      // Con doce meses en un teléfono, doce etiquetas se solapan: una sí y una no.
      `<span class="${i % Math.ceil(datos.length / 6) ? 'salta' : ''}">${esc(d.etq)}</span>`).join('')}</div>
    ${referencia != null && etqRef ? `<div class="gr-ref-etq">${esc(etqRef)}</div>` : ''}
  </div>`;
  return marco({ titulo, pie, cuerpo, datos, formato, col: 'Periodo' });
}

/* ============ histograma ============
   Cómo se reparte. Es el único que contesta «¿todos sacaron 70, o mitad 90 y
   mitad 50?», y esas dos clases no se parecen en nada. */
export function histograma({ titulo, pie, tramos, corte = null, alto = 130 }) {
  const max = techo(tramos.map((t) => t.n));
  const cuerpo = `<div class="gr-cols histograma" style="--gr-alto:${alto}px" role="img"
      aria-label="${esc(titulo)}">
    ${tramos.map((t) => trozo(t.href,
      `gr-col${corte != null && Number(t.hasta) < Number(corte) ? ' bajo' : ''}`, '',
      `<span class="v">${t.n ? num(t.n) : ''}</span>
       <span class="palo" style="height:${Math.max(2, Math.round(100 * n(t.n) / max))}%"></span>
       <span class="etq">${esc(t.desde)}</span>`,
      `${t.desde}–${t.hasta}: ${num(t.n)}`)).join('')}
  </div>`;
  return marco({ titulo, pie, cuerpo, col: 'Tramo',
    datos: tramos.map((t) => ({ etq: `${t.desde} – ${t.hasta}`, n: t.n })) });
}

/* ============ embudo ============
   Dónde se cae la gente. Sólo vale cuando cada escalón es de verdad un
   subconjunto del anterior; si no, es una barra disfrazada. */
export function embudo({ titulo, pie, pasos, formato }) {
  const primero = techo([pasos[0]?.n]);
  const cuerpo = `<div class="gr-embudo" role="img" aria-label="${esc(titulo)}">
    ${pasos.map((p, i) => {
      const anterior = i ? n(pasos[i - 1].n) : n(p.n);
      const cae = anterior ? Math.round(100 * (anterior - n(p.n)) / anterior) : 0;
      // La etiqueta va FUERA de la barra: dentro, los escalones estrechos la
      // recortaban y quedaban cuatro barras sin decir de qué eran.
      return `<div class="gr-paso">
        ${trozo(p.href, 'gr-escalon', `width:${Math.max(8, 100 * n(p.n) / primero).toFixed(1)}%`,
          `<b>${fmt(p.n, formato)}</b>`, `${p.etq}: ${fmt(p.n, formato)}`)}
        <span class="gr-paso-etq">${esc(p.etq)}</span>
        ${i && cae > 0 ? `<span class="gr-caida">−${cae}%</span>` : ''}
      </div>`;
    }).join('')}
  </div>`;
  return marco({ titulo, pie, cuerpo, datos: pasos, formato, col: 'Etapa' });
}

/* ============ anillo ============
   El único de la plataforma, y se gana el sitio: un número contra su meta.
   Para comparar varias cosas están las barras. */
export function anillo({ titulo, pie, valor, meta, formato, etq = '', href = null }) {
  const p = meta ? Math.min(100, Math.round((100 * n(valor)) / n(meta))) : 0;
  const r = 42, c = 2 * Math.PI * r;
  const dentro = `<svg viewBox="0 0 100 100" role="img"
      aria-label="${esc(titulo)}: ${fmt(valor, formato)} de ${fmt(meta, formato)}, ${p}%">
      <circle class="pista" cx="50" cy="50" r="${r}"/>
      <circle class="avance" cx="50" cy="50" r="${r}"
        stroke-dasharray="${((c * p) / 100).toFixed(1)} ${c.toFixed(1)}"/>
    </svg>
    <div class="gr-anillo-centro"><b>${p}%</b><span>${esc(etq)}</span></div>`;
  const cuerpo = `<div class="gr-anillo">
    ${trozo(href, 'gr-anillo-dibujo', '', dentro, `${fmt(valor, formato)} de ${fmt(meta, formato)}`)}
    <div class="gr-anillo-cifras">
      <div><b>${fmt(valor, formato)}</b><span>llevamos</span></div>
      <div><b>${fmt(meta, formato)}</b><span>la meta</span></div>
    </div></div>`;
  return marco({ titulo, pie, cuerpo, formato,
    datos: [{ etq: 'Llevamos', n: valor }, { etq: 'Meta', n: meta }], col: 'Concepto' });
}

/* ============ línea de tiempo ============
   Hitos con fecha: las cuotas de alguien, sus entregas. No es una serie —no
   se suman ni se comparan alturas— así que no es un gráfico de barras. */
export function hitos({ titulo, pie, puntos }) {
  const cuerpo = `<ol class="gr-hitos">
    ${puntos.map((p) => `<li class="${p.tono || ''}">
      ${trozo(p.href, 'gr-hito', '',
        `<i class="gr-marca"></i>
         <span class="gr-hito-t">${esc(p.etq)}</span>
         <span class="gr-hito-f">${esc(p.cuando || '')}</span>
         ${p.detalle ? `<span class="gr-hito-d">${esc(p.detalle)}</span>` : ''}`, p.titulo)}
    </li>`).join('')}
  </ol>`;
  return marco({ titulo, pie, cuerpo, col: 'Hito', colN: 'Cuándo',
    hay: puntos.length > 0,
    datos: puntos.map((p) => ({ etq: p.etq, n: p.cuando })),
    formato: (v) => String(v ?? '—') });
}

/* ============ ayudas para armar las series ============ */

/** Los últimos `meses` meses en orden, con su clave AAAA-MM y su etiqueta. */
export function ultimosMeses(meses = 12, desde = new Date()) {
  const out = [];
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(desde.getFullYear(), desde.getMonth() - i, 1);
    out.push({
      clave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      etq: d.toLocaleDateString('es-ES', { month: 'short' })
        + (d.getMonth() === 0 || i === meses - 1 ? ` ${String(d.getFullYear()).slice(2)}` : ''),
    });
  }
  return out;
}

/** Agrupa filas por mes a partir de una columna de fecha, sumando lo que se pida. */
export function porMes(filas, campoFecha, sumar = () => 1, meses = 12) {
  const cubos = new Map(ultimosMeses(meses).map((m) => [m.clave, 0]));
  for (const f of filas) {
    const v = f[campoFecha];
    if (!v) continue;
    const clave = String(v).slice(0, 7);
    if (cubos.has(clave)) cubos.set(clave, cubos.get(clave) + Number(sumar(f) || 0));
  }
  return ultimosMeses(meses).map((m) => ({ ...m, n: cubos.get(m.clave) || 0 }));
}

/** Los tramos de antigüedad que usa cobranza. Devuelve los cubos ya contados. */
export const TRAMOS_DEUDA = [
  { etq: 'Al día', desde: -1e9, hasta: 0 },
  { etq: '1 a 30 días', desde: 1, hasta: 30 },
  { etq: '31 a 60', desde: 31, hasta: 60 },
  { etq: '61 a 90', desde: 61, hasta: 90 },
  { etq: 'Más de 90', desde: 91, hasta: 1e9 },
];

export function porAntiguedad(filas, campoVence, sumar = () => 1, hoy = new Date()) {
  const dias = (f) => Math.floor((hoy - new Date(f)) / 86400000);
  return TRAMOS_DEUDA.map((t) => ({
    etq: t.etq, desde: t.desde, hasta: t.hasta,
    n: filas.filter((f) => {
      if (!f[campoVence]) return false;
      const d = dias(f[campoVence]);
      return d >= t.desde && d <= t.hasta;
    }).reduce((a, f) => a + Number(sumar(f) || 0), 0),
  }));
}
