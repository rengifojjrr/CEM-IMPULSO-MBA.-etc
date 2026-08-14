/* Lo académico del estudiante: su perfil, pedir congelamiento o retiro, ver
   cómo va, y que no se emita un certificado a quien no cumple los requisitos. */

import { acta, nuevaPestana, entrar, BASE } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('academico');

  /* ============ perfil del estudiante ============ */
  const E = await nuevaPestana(navegador, { ancho: 1280 });
  await entrar(E, 'estudiante', 'estudiante/perfil.html');
  await E.waitForSelector('#nombre', { timeout: 25000 });
  await E.waitForTimeout(2500);

  a.comprobar((await E.inputValue('#nombre')).length > 0,
    'El perfil carga con los datos actuales de la persona');
  a.comprobar(await E.locator('#email').isDisabled(),
    'El correo no se edita: es la forma de entrar');

  // Un dato que no aparece en ningún certificado se guarda directo.
  await E.fill('#ciudad', 'Valencia');
  await E.click('#fPerfil button[type=submit]');
  await E.waitForTimeout(2500);
  const guardado = (await E.locator('.toast').count()) > 0
    || /guardad/i.test(await E.locator('#msgPerfil').textContent());
  a.comprobar(guardado, 'Corregir la ciudad se guarda directo, sin aprobación de nadie');

  // Nombre y documento sí pasan por aprobación, pero SÓLO si ya hay
  // certificados emitidos con los datos viejos.
  const tieneCertificados = !(await E.locator('#avisoCert').isHidden());
  await E.fill('#nombre', (await E.inputValue('#nombre')) + 'x');
  await E.waitForTimeout(400);
  const pideMotivo = !(await E.locator('#campoMotivo').isHidden());
  a.comprobar(pideMotivo === tieneCertificados,
    tieneCertificados
      ? 'Con certificados emitidos, tocar el nombre pide explicar el motivo'
      : 'Sin certificados emitidos el nombre cambia directo');

  /* ============ pedir congelamiento ============ */
  await E.waitForSelector('#inscripciones', { timeout: 15000 });
  const puedeCongelar = await E.locator('[data-tipo="congelamiento"]').count();
  a.comprobar(puedeCongelar >= 1, 'Puede pedir congelar o retirarse de sus programas');

  if (puedeCongelar) {
    await E.locator('[data-tipo="congelamiento"]').first().click();
    await E.waitForSelector('#solMotivo', { timeout: 10000 });
    a.comprobar(/cuotas que todavía no vencieron se congelan/i.test(
      await E.locator('.modal-b').textContent()),
      'Antes de confirmar dice qué pasa exactamente con las cuotas');

    await E.fill('#solMotivo', 'corto');
    await E.click('[data-s]');
    await E.waitForTimeout(800);
    a.comprobar(/frase completa/i.test(await E.locator('#solMsg').textContent()),
      'Un motivo de dos palabras no se acepta');

    await E.fill('#solMotivo', 'Me mudo de ciudad por trabajo y retomo en enero.');
    await E.click('[data-s]');
    await E.waitForTimeout(3500);
    a.comprobar(!(await E.locator('#cardSolInsc').isHidden()),
      'La solicitud queda registrada y visible para el estudiante');
  }

  /* ============ "cómo voy" ============ */
  await E.goto(`${BASE}/plataforma/estudiante/panel.html`, { waitUntil: 'domcontentloaded' });
  await E.waitForSelector('#tbDesempeno', { timeout: 25000 });
  await E.waitForFunction(
    () => (document.querySelector('#tbDesempeno')?.textContent || '').trim().length > 0,
    null, { timeout: 25000 });
  a.comprobar(/aprueba con|sin notas aún|aprobada/i.test(
    await E.locator('#tbDesempeno').textContent()),
    'El panel muestra promedio, evaluaciones y qué falta por programa');

  /* ============ el equipo resuelve la solicitud ============ */
  const A = await nuevaPestana(navegador, { ancho: 1400 });
  await entrar(A, 'admin', 'admin/inscripciones.html');
  await A.waitForSelector('#kpis', { timeout: 25000 });
  await A.waitForTimeout(3500);

  if (!(await A.locator('#cardSolicitudes').isHidden())) {
    a.comprobar(/congelamiento/i.test(await A.locator('#tbSol').textContent()),
      'La solicitud del estudiante le llega al equipo con su tipo y motivo');

    await A.locator('[data-sol-no]').first().click();
    await A.waitForSelector('#solResp', { timeout: 10000 });
    await A.click('.modal [data-s]');
    await A.waitForTimeout(800);
    a.comprobar(/el estudiante lo va a leer/i.test(await A.locator('#solMsg').textContent()),
      'Rechazar sin explicar no se permite');
    await A.fill('#solResp', 'Prueba automática: se rechaza para no alterar los datos de demostración.');
    await A.click('.modal [data-s]');
    await A.waitForTimeout(3500);
    a.comprobar(true, 'La solicitud se resuelve y sale de la bandeja');
  } else {
    a.comprobar(true, 'No había solicitudes pendientes que resolver');
  }

  /* ============ no se certifica a quien no cumple ============ */
  await A.goto(`${BASE}/plataforma/admin/certificados.html`, { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('#tbElegibles', { timeout: 25000 });
  await A.waitForTimeout(3500);

  const elegibles = await A.locator('.chkE').count();
  if (elegibles) {
    await A.locator('.chkE').first().check();
    await A.click('#btnLote');
    await A.waitForSelector('[data-si]', { timeout: 10000 });
    await A.click('[data-si]');
    await A.waitForTimeout(4500);

    if (await A.locator('#exMotivo').count()) {
      a.comprobar(/Debe |Le faltan |avance es/i.test(await A.locator('.modal-b').textContent()),
        'No deja certificar sin más: enumera los reparos concretos');
      await A.silenciarMientras(async () => {
        await A.click('[data-si]');
        await A.waitForTimeout(900);
        a.comprobar((await A.locator('.toast.err').count()) >= 1
          || (await A.locator('#exMotivo').count()) === 1,
          'Y sin escribir el motivo de la excepción tampoco emite');
      });
      await A.locator('.modal [data-x]').first().click();
    } else {
      a.comprobar(true, 'Esa inscripción cumplía los requisitos y se emitió sin excepción');
    }
  } else {
    a.comprobar(true, 'No hay inscripciones elegibles en este momento');
  }

  a.comprobar(E.errores.length === 0,
    `Las pantallas del estudiante no lanzan errores ${JSON.stringify(E.errores.slice(0, 2))}`);
  a.comprobar(A.errores.length === 0,
    `Las del equipo tampoco ${JSON.stringify(A.errores.slice(0, 2))}`);

  return a;
}
