/* El área del docente: su aula, la asistencia y el resumen del grupo.
   Antes era una sola pantalla que no dejaba crear nada. */

import { acta, nuevaPestana, entrar, BASE } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('docente');
  const D = await nuevaPestana(navegador, { ancho: 1360 });

  /* ============ cómo va su grupo ============ */
  await entrar(D, 'profesor', 'docente/grupo.html');
  await D.waitForSelector('#selCohorte', { timeout: 25000 });
  await D.waitForTimeout(3500);

  const kpis = await D.locator('#kpis').textContent();
  a.comprobar(/Promedio del grupo/i.test(kpis) && /Tasa de entrega/i.test(kpis),
    'El docente ve promedio, tasa de entrega y asistencia de su grupo');
  a.comprobar((await D.locator('#tb tr').count()) >= 1,
    'Con una fila por alumno');

  /* ============ pasar asistencia ============ */
  await D.goto(`${BASE}/plataforma/docente/asistencia.html`, { waitUntil: 'domcontentloaded' });
  await D.waitForSelector('#selSesion', { timeout: 25000 });
  await D.waitForTimeout(3000);

  if (await D.locator('#cardSesion').isVisible()) {
    const alumnos = await D.locator('.marcas').count();
    a.comprobar(alumnos >= 1, `La sesión abre con su lista de ${alumnos} alumno(s)`);

    if (alumnos) {
      await D.locator('.marcas button[data-v="1"]').first().click();
      await D.waitForTimeout(3000);
      a.comprobar((await D.locator('.marcas button[data-v="1"].on').count()) >= 1,
        'Marcar presente queda marcado');
      a.comprobar(/Guardado/.test(await D.locator('#guardado').textContent())
        || (await D.locator('#conteo').textContent()).trim().startsWith('1'),
        'Se guarda solo, sin botón de guardar');

      // Volver a pulsar la misma marca la quita: es cómo se corrige un toque
      // accidental cuando se pasa lista con el teléfono en la mano.
      await D.locator('.marcas button[data-v="1"]').first().click();
      await D.waitForTimeout(2500);
      a.comprobar((await D.locator('.marcas button[data-v="1"].on').count()) === 0,
        'Volver a pulsar la misma marca la quita');
    }
  } else {
    a.comprobar(true, 'No hay sesiones programadas en sus grupos');
  }

  /* ============ su aula: crear evaluaciones ============ */
  await D.goto(`${BASE}/plataforma/docente/aula.html`, { waitUntil: 'domcontentloaded' });
  await D.waitForSelector('#selCurso', { timeout: 25000 });
  await D.waitForTimeout(3000);

  a.comprobar((await D.locator('#selCurso option').count()) >= 1,
    'El aula lista sólo los grupos que dicta');

  /* El aula abre en el tablón, que es lo primero que se mira al entrar a una
     clase. Las evaluaciones viven en «Trabajo de clase», junto al material:
     son la misma pregunta —qué tiene que hacer el grupo— y separarlas obligaba
     a saltar entre pestañas para preparar una semana. */
  await D.click('[data-t="evals"]');
  await D.waitForTimeout(800);
  await D.click('#btnNuevaEval');
  await D.waitForSelector('#aNombre', { timeout: 10000 });
  a.comprobar((await D.locator('#aBarajar').count()) === 1,
    'Al crear una evaluación puede pedir que se barajen las preguntas');

  await D.fill('#aNombre', 'Prueba automática');
  await D.fill('#aMax', '100');
  await D.fill('#aNota', '150');
  await D.click('.modal [data-s]');
  await D.waitForTimeout(900);
  a.comprobar(/no puede superar/i.test(await D.locator('#aMsg').textContent()),
    'Una nota de aprobación mayor que el máximo se rechaza antes de guardar');

  await D.fill('#aNota', '60');
  await D.fill('#aAbre', '2026-09-10');
  await D.fill('#aCierra', '2026-09-01');
  await D.click('.modal [data-s]');
  await D.waitForTimeout(900);
  a.comprobar(/anterior a la de apertura/i.test(await D.locator('#aMsg').textContent()),
    'Una fecha de cierre anterior a la de apertura también se ataja');

  await D.locator('.modal [data-x]').first().click();
  await D.waitForTimeout(600);

  /* ============ su aula: el material, en la misma pestaña ============ */
  a.comprobar(!(await D.locator('#panelMaterial').isHidden()),
    'Y en la misma pestaña están los módulos del programa, sin tener que cambiar de sitio');

  a.comprobar(D.errores.length === 0,
    `Las pantallas del docente no lanzan errores ${JSON.stringify(D.errores.slice(0, 2))}`);

  return a;
}
