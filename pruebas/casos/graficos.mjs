/* Los gráficos.
   ==========================================================================
   Dos cosas se comprueban aquí, y la segunda es la que cuesta.

   La primera es que pinten y que se puedan pulsar: un gráfico que no lleva a
   ninguna parte se mira, se dice «ajá» y no cambia nada.

   La segunda es que sigan la apariencia elegida en Configuración. Es fácil
   escribir «#0d2440» dentro de un gráfico y que se vea perfecto —hasta que
   alguien elige la paleta violeta y le aparece una barra azul marino en medio
   de su pantalla, o pasa a modo noche y la barra sigue clara. Por eso la
   comprobación cambia la paleta de verdad y mira el color RENDERIZADO de una
   barra: si no se mueve, es que estaba escrito a mano en alguna parte. */

import { acta, nuevaPestana, entrar, BASE } from '../entorno.mjs';

/** El color de fondo de un elemento, tal como lo pinta el navegador. */
const colorDe = (pagina, sel) => pagina.evaluate((s) => {
  const el = document.querySelector(s);
  return el ? getComputedStyle(el).backgroundColor : null;
}, sel);

export default async function correr(navegador) {
  const a = acta('gráficos');
  const D = await nuevaPestana(navegador, { ancho: 1400, alto: 1100 });
  await entrar(D, 'admin', 'admin/index.html');
  await D.waitForSelector('#graficos .gr', { timeout: 30000 });
  await D.waitForTimeout(2500);

  /* ============ que estén y digan algo ============ */
  const cuantos = await D.locator('#graficos .gr').count();
  a.comprobar(cuantos >= 4,
    `El resumen abre con ${cuantos} gráficos, no sólo con cifras sueltas`);

  const titulos = await D.evaluate(() =>
    [...document.querySelectorAll('#graficos .gr-tit')].map((t) => t.textContent.trim()));
  a.comprobar(titulos.every((t) => t.length > 12),
    `Cada uno dice qué pregunta contesta: «${titulos[0]}»`);

  const conPie = await D.locator('#graficos .gr-pie').count();
  a.comprobar(conPie >= 3,
    'Y lleva debajo cómo se lee, que es lo que separa un gráfico de un adorno');

  /* ============ que se puedan pulsar ============ */
  const enlaces = await D.locator('#graficos a[href]').count();
  a.comprobar(enlaces >= 6,
    `Los trozos son enlaces con el filtro puesto (${enlaces}), no dibujos muertos`);

  const destino = await D.locator('#graficos .gr-parte').first().getAttribute('href');
  a.comprobar(!!destino && destino.includes('?'),
    `Y el enlace lleva el filtro en la dirección: ${destino}`);

  /* ============ la tabla de debajo ============ */
  const conTabla = await D.locator('#graficos .gr-tabla').count();
  a.comprobar(conTabla >= 3,
    'Debajo de cada gráfico van sus números, plegados: un lector de pantalla no ve un dibujo');
  await D.locator('#graficos .gr-tabla summary').first().click();
  await D.waitForTimeout(400);
  a.comprobar(await D.locator('#graficos .gr-tabla table tbody tr').count() > 0,
    'Y al desplegarla salen de verdad, con la misma cifra que la barra');

  /* ============ el embudo no puede crecer ============ */
  const escalones = await D.evaluate(() =>
    [...document.querySelectorAll('.gr-embudo .gr-escalon b')].map((b) => Number(b.textContent.replace(/\D/g, ''))));
  const creceAlguno = escalones.some((v, i) => i && v > escalones[i - 1]);
  a.comprobar(!creceAlguno,
    `Ningún escalón del embudo es mayor que el de arriba (${escalones.join(' → ')}); si lo fuera, el dibujo estaría mintiendo`);

  /* ============ LA PRUEBA: siguen la apariencia elegida ============ */
  const antes = await colorDe(D, '#graficos .gr-relleno');
  a.comprobar(!!antes, `Una barra pinta con un color (${antes})`);

  /* Se espera a que el color CAMBIE, no un número de milisegundos.
     ─────────────────────────────────────────────────────────────────────────
     Aquí había dos esperas de 700 ms. Corriendo este caso solo bastaban; en la
     tanda de 889, con veintitantos navegadores que han pasado antes, no
     siempre. Y entonces la prueba decía «el modo noche no cambia el color»
     cuando lo que pasaba es que aún no le había dado tiempo: un fallo que
     acusa al programa de algo que no hizo es peor que no tener la prueba.

     Con un tope, para que si de verdad dejara de cambiar siguiera fallando. */
  const cambiarYEsperar = async (ajuste, distintoDe) => {
    await D.evaluate(async (a2) => {
      const t = await import('/plataforma/assets/temas.js?v=2026-08-29-2');
      t.aplicarApariencia(a2);
    }, ajuste);
    await D.waitForFunction((previo) => {
      const el = document.querySelector('#graficos .gr-relleno');
      if (!el) return false;
      const c = getComputedStyle(el).backgroundColor;
      return c && c !== previo;
    }, distintoDe, { timeout: 8000 }).catch(() => {});
    return colorDe(D, '#graficos .gr-relleno');
  };

  // Paleta violeta: si la barra estuviera pintada a mano, no se movería.
  const conVioleta = await cambiarYEsperar({ paleta: 'violeta' }, antes);
  a.comprobar(conVioleta && conVioleta !== antes,
    `Al cambiar la paleta en Configuración, la barra cambia con ella (${antes} → ${conVioleta})`);

  // Modo noche: mismo asunto, otra dimensión.
  const deNoche = await cambiarYEsperar({ tema: 'oscuro' }, conVioleta);
  a.comprobar(deNoche && deNoche !== conVioleta,
    `Y en modo noche también (${conVioleta} → ${deNoche})`);

  // La forma manda en las esquinas de las barras.
  await D.evaluate(async () => {
    const t = await import('/plataforma/assets/temas.js?v=2026-08-29-2');
    t.aplicarApariencia({ forma: 'recta' });
  });
  await D.waitForTimeout(500);
  const recto = await D.evaluate(() =>
    getComputedStyle(document.querySelector('#graficos .gr-relleno')).borderTopLeftRadius);
  await D.evaluate(async () => {
    const t = await import('/plataforma/assets/temas.js?v=2026-08-29-2');
    t.aplicarApariencia({ forma: 'redonda' });
  });
  await D.waitForTimeout(500);
  const redondo = await D.evaluate(() =>
    getComputedStyle(document.querySelector('#graficos .gr-relleno')).borderTopLeftRadius);
  a.comprobar(recto !== redondo,
    `Y las esquinas siguen la forma elegida (recta ${recto} · redonda ${redondo})`);

  // Dejarlo como estaba: si esta prueba le cambia la apariencia a la siguiente,
  // la siguiente falla por algo que no es suyo.
  await D.evaluate(async () => {
    const t = await import('/plataforma/assets/temas.js?v=2026-08-29-2');
    t.aplicarApariencia(t.aparienciaDeFabrica());
  });
  await D.waitForTimeout(400);

  /* ============ en el teléfono ============ */
  const M = await nuevaPestana(navegador, { ancho: 390, alto: 844 });
  await entrar(M, 'admin', 'admin/index.html');
  await M.waitForSelector('#graficos .gr', { timeout: 30000 });
  await M.waitForTimeout(2500);
  const desborda = await M.evaluate(() =>
    document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  a.comprobar(!desborda,
    'En el teléfono los gráficos no empujan la página de lado');
  a.comprobar(await M.locator('#graficos .gr').count() >= 4,
    'Y siguen estando los cuatro, apilados');

  a.comprobar(D.errores.length === 0, `Sin errores ${JSON.stringify(D.errores.slice(0, 2))}`);
  a.comprobar(M.errores.length === 0, `Ni en el teléfono ${JSON.stringify(M.errores.slice(0, 2))}`);
  return a;
}
