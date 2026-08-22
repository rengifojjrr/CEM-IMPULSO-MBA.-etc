/* Operación: deshacer, plantillas, exportar y el teléfono.
   ==========================================================================
   Mejoras 26, 27, 29 y 30 de docs/40-mejoras-por-rol.md. Las otras dos del
   bloque ya estaban hechas antes de esta tanda —la matrícula en lote la hace
   `cem-importar-estudiantes` desde la pantalla de Estudiantes, y el expediente
   completo lo trae `cem_expediente` en la ficha— y tienen sus propias pruebas.

   Lo que se comprueba aquí es sobre todo el teléfono, porque es lo que no se
   ve trabajando en un portátil: una tabla que en pantalla grande se lee
   perfectamente puede estar obligando a arrastrar de lado en un móvil, y quien
   coordina no siempre está delante de un ordenador. */

import { acta, nuevaPestana, entrar, BASE, conLaBase } from '../entorno.mjs';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export default async function correr(navegador) {
  const a = acta('operación');

  /* ============ 1 · el teléfono (mejora 30) ============ */
  const M = await nuevaPestana(navegador, { ancho: 390, alto: 844 });
  await entrar(M, 'admin');

  const pantallas = readdirSync(join(RAIZ, 'plataforma', 'admin')).filter((f) => f.endsWith('.html'));
  const malas = [];
  for (const f of pantallas) {
    await M.goto(`${BASE}/plataforma/admin/${f}`, { waitUntil: 'domcontentloaded' });
    await M.waitForTimeout(1800);
    const r = await M.evaluate(() => ({
      desborde: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      arrastran: [...document.querySelectorAll('table')].filter((t) =>
        t.querySelectorAll('tbody tr').length
        && t.scrollWidth > (t.closest('.table-wrap')?.clientWidth ?? t.clientWidth) + 4).length,
    }));
    if (r.desborde > 2 || r.arrastran) malas.push(`${f}(+${r.desborde}px, ${r.arrastran} tabla)`);
  }
  a.comprobar(malas.length === 0,
    `En un teléfono de 390 puntos ninguna pantalla obliga a arrastrar de lado (${malas.join(' ') || `${pantallas.length} revisadas`})`);

  // Y que apilar no sea sólo poner la clase: las celdas tienen que llevar el
  // nombre de su columna delante, o la tarjeta es una lista de datos sueltos.
  await M.goto(`${BASE}/plataforma/admin/inscripciones.html`, { waitUntil: 'domcontentloaded' });
  await M.waitForTimeout(2600);
  const apilada = await M.evaluate(() => {
    const t = document.querySelector('table.tarjetas');
    if (!t) return null;
    const td = t.querySelector('tbody tr td:nth-child(2)');
    return { etiqueta: td?.dataset.col || '', fila: getComputedStyle(t.querySelector('tbody tr')).display };
  });
  a.comprobar(apilada && apilada.fila === 'block' && apilada.etiqueta !== '',
    `Cada celda apilada lleva el nombre de su columna («${apilada?.etiqueta}»)`);
  await M.close();

  /* ============ 2 · exportar (mejora 29) ============ */
  const A = await nuevaPestana(navegador, { ancho: 1400, alto: 1000 });
  await entrar(A, 'admin');

  const sinExportar = [];
  for (const f of ['leads.html', 'profesores.html', 'carteras.html', 'insignias.html', 'cohortes.html']) {
    await A.goto(`${BASE}/plataforma/admin/${f}`, { waitUntil: 'domcontentloaded' });
    /* Se espera a que la cosa ESTÉ, no a que pasen 2,4 segundos. Con la máquina
       cargada —la suite entera corriendo— ese plazo no llegaba y la prueba
       señalaba carteras.html como pantalla sin exportar cuando el botón sí
       aparecía, medio segundo más tarde. Una prueba que falla a veces es una
       prueba que se deja de creer, y entonces ya no protege nada.
       Los `catch` son a propósito: si algo no llega, la comprobación de abajo
       lo dice con su propio mensaje, que explica mejor que un plantón. */
    await A.waitForFunction(() => [...document.querySelectorAll('#page .card table')]
      .some((t) => t.querySelectorAll('thead th').length >= 2), null, { timeout: 20000 })
      .catch(() => {});
    await A.waitForFunction(() =>
      document.querySelectorAll('[data-exportar], #page [id*="xport"]').length > 0,
    null, { timeout: 8000 }).catch(() => {});
    const r = await A.evaluate(() => ({
      tablas: [...document.querySelectorAll('#page .card table')]
        .filter((t) => t.querySelectorAll('thead th').length >= 2).length,
      salidas: document.querySelectorAll('[data-exportar], #page [id*="xport"]').length,
    }));
    if (r.tablas && !r.salidas) sinExportar.push(f);
  }
  a.comprobar(sinExportar.length === 0,
    `Toda tabla con datos se puede sacar a Excel (${sinExportar.join(', ') || 'ninguna se quedó fuera'})`);

  // Y que lo que baja sea lo que se está viendo, con los filtros puestos.
  await A.goto(`${BASE}/plataforma/admin/leads.html`, { waitUntil: 'domcontentloaded' });
  await A.waitForTimeout(2600);
  const csv = await A.evaluate(() => {
    let nombre = null, contenido = null;
    const crear = document.createElement.bind(document);
    document.createElement = function (t) {
      const el = crear(t);
      if (t === 'a') {
        const clickOriginal = el.click.bind(el);
        el.click = () => { nombre = el.download; contenido = el.href; };
        void clickOriginal;
      }
      return el;
    };
    document.querySelector('[data-exportar]')?.click();
    document.createElement = crear;
    return { nombre, tieneCuerpo: (contenido || '').length > 40 };
  });
  a.comprobar(/\.csv$/.test(csv.nombre || ''), `El archivo se llama por la pantalla (${csv.nombre})`);
  a.comprobar(csv.tieneCuerpo, 'Y lleva contenido, no un archivo vacío');

  /* ============ 3 · plantillas de comunicación (mejora 27) ============ */
  await A.goto(`${BASE}/plataforma/admin/comunicaciones.html`, { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await A.waitForTimeout(2400);
  await A.click('#btnNuevo');
  await A.waitForTimeout(2200);

  const plantillas = await A.evaluate(() =>
    [...document.querySelectorAll('[data-plantilla]')].map((e) => e.textContent.trim()));
  a.comprobar(plantillas.length >= 3, `Hay plantillas para los mensajes que se repiten (${plantillas.length})`);

  await A.click('[data-plantilla]');
  await A.waitForTimeout(900);
  const pegado = await A.evaluate(() => ({
    titulo: document.querySelector('#aT').value,
    cuerpo: document.querySelector('#aB').value,
  }));
  a.comprobar(pegado.titulo && pegado.cuerpo.length > 40, 'Pegar una rellena el título y el mensaje');
  a.comprobar(/\{[a-z]+\}/.test(pegado.titulo + pegado.cuerpo),
    'Y deja marcados con llaves los huecos que hay que rellenar a mano');

  // Usar una plantilla la sube en la lista: así, a los dos meses, las primeras
  // son las que de verdad se mandan.
  const contada = await conLaBase(A, async (sb) => {
    const { data } = await sb.from('cem_plantillas_mensaje')
      .select('usos').order('usos', { ascending: false }).limit(1).maybeSingle();
    return Number(data?.usos || 0);
  });
  a.comprobar(contada > 0, `Se cuenta cuántas veces se usa cada una (${contada})`);

  /* ============ 4 · deshacer (mejora 26) ============ */
  // No se ensaya deshaciendo de verdad —eso movería notas y matrículas reales—
  // sino comprobando que las tres pantallas que faltaban ya lo tienen puesto.
  const conDeshacer = [];
  for (const [f, patron] of [
    ['calificar.html', 'okDeshacer'],
    ['estudiante.html', 'okDeshacer'],
    ['certificados.html', 'okDeshacer'],
    ['pagos-verificar.html', 'okDeshacer'],
  ]) {
    const res = await fetch(`${BASE}/plataforma/admin/${f}`);
    const texto = await res.text();
    if (texto.includes(patron)) conDeshacer.push(f);
  }
  a.comprobar(conDeshacer.length === 4,
    `Deshacer llega a pagos, certificados, notas y matrículas (${conDeshacer.join(', ')})`);

  const enNotas = await (await fetch(`${BASE}/plataforma/assets/aula.js`)).text();
  a.comprobar(enNotas.includes('okDeshacer'),
    'Y también a la cuadrícula de notas, donde se escribe en la casilla de al lado');

  a.comprobar(A.errores.length === 0, `Sin errores ${JSON.stringify(A.errores.slice(0, 2))}`);
  await A.close();
  return a;
}
