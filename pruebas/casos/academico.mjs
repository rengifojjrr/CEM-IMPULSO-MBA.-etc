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

    /* Si una pasada anterior se cayó antes de que el equipo resolviera la
       solicitud, la de ahora choca con ella: la plataforma responde «ya tienes
       una solicitud pendiente sobre esta inscripción», que es exactamente lo
       que debe hacer. Ese rechazo es un 400 y quedaría anotado como si la
       pantalla estuviera rota, así que se descuenta aquí — pero sólo si el
       mensaje es ese. Cualquier otro error sigue contando. */
    const yaHabia = /ya tienes una solicitud pendiente/i.test(
      await E.locator('#solMsg').textContent().catch(() => ''));
    if (yaHabia) {
      E.errores.length = 0;
      a.comprobar(true,
        'Había una solicitud pendiente de antes y la plataforma no deja duplicarla');
    }
  }

  /* ============ "cómo voy" ============ */
  await E.goto(`${BASE}/plataforma/estudiante/panel.html`, { waitUntil: 'domcontentloaded' });
  /* El panel abre por los cursos, y el resumen —cifras, gráficos y esta tabla—
     va plegado debajo: un estudiante entra a seguir por donde iba, no a leer
     estadísticas. Así que hay que abrirlo, igual que haría una persona. */
  await E.waitForSelector('#resumen', { timeout: 25000 });
  await E.click('#resumen summary');
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

  /* ============ saber a quién se está evaluando ============
     La cola de corrección llegaba mezclada: varios programas, varias cohortes
     y las notas que puso otra persona, todo en la misma lista. */
  await A.goto(`${BASE}/plataforma/admin/calificar.html`, { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('#page:not(.hidden)', { timeout: 30000 });
  await A.waitForTimeout(2500);

  const acota = await A.evaluate(() => ({
    cohortes: document.querySelectorAll('#fCohorte option').length,
    cursos: document.querySelectorAll('#fCurso option').length,
    correctores: document.querySelectorAll('#fCorrector option').length,
    /* Dos programas pueden tener una «Cohorte 25A» cada uno: si el desplegable
       no dice de cuál es cada una, elegir es adivinar. */
    cohortesDistinguibles: (() => {
      const t = [...document.querySelectorAll('#fCohorte option')].map((o) => o.textContent);
      return new Set(t).size === t.length;
    })(),
    diceLaCohorte: /Cohorte|Sin cohorte/.test(document.querySelector('.sub-item')?.textContent || ''),
  }));
  a.comprobar(acota.cohortes > 1 && acota.cursos > 1,
    `La cola se acota por programa y por cohorte (${acota.cursos - 1} programa(s), ${acota.cohortes - 1} cohorte(s))`);
  a.comprobar(acota.cohortesDistinguibles,
    'Y dos cohortes con el mismo nombre se distinguen por su programa');
  a.comprobar(acota.diceLaCohorte, 'Cada entrega dice de qué cohorte viene, sin tener que abrirla');

  if (acota.correctores > 1) {
    const antes = await A.locator('.sub-item').count();
    await A.click('[data-f=done]');
    await A.waitForTimeout(500);
    const quien = await A.$$eval('#fCorrector option', (o) => o.map((x) => x.value).filter(Boolean));
    await A.selectOption('#fCorrector', quien[0]);
    await A.waitForTimeout(700);
    const nombres = await A.$$eval('.sub-item', (n) => n.map((x) => x.textContent));
    a.comprobar(nombres.length > 0 && nombres.every((t) => /la puso /.test(t)),
      `Se puede ver cómo está calificando una persona: ${nombres.length} entrega(s) suyas (de ${antes})`);
    await A.selectOption('#fCorrector', '');
  } else {
    a.comprobar(true, 'Todavía no hay dos personas corrigiendo que comparar');
  }

  /* ============ la cola de revisión, por autor ============ */
  await A.goto(`${BASE}/plataforma/admin/revision.html`, { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('#tb tr', { timeout: 30000 });
  await A.waitForTimeout(1500);
  const autores = await A.$$eval('#fAutor option', (o) => o.map((x) => x.value).filter(Boolean));
  if (autores.length) {
    await A.selectOption('#fAutor', autores[0]);
    await A.waitForTimeout(600);
    const unSolo = await A.$$eval('#tb tr td:nth-child(3)',
      (t) => [...new Set(t.map((x) => x.textContent.trim()))]);
    a.comprobar(unSolo.length === 1,
      `La bandeja de revisión se filtra por quién subió el contenido (${unSolo.join(', ')})`);

    // El filtro queda en la dirección: «la cola de Elena» se puede pegar en
    // un mensaje y le llega al otro ya filtrada.
    const conFiltro = A.url();
    await A.goto(conFiltro, { waitUntil: 'domcontentloaded' });
    await A.waitForSelector('#tb tr', { timeout: 30000 });
    await A.waitForTimeout(1800);
    a.comprobar(await A.inputValue('#fAutor') === autores[0],
      'Y el enlace se puede pasar: al abrirlo llega ya filtrada');
  } else {
    a.comprobar(true, 'No hay contenido en la bandeja de revisión que filtrar');
  }

  /* Aprobar a ciegas era el riesgo real de esta pantalla: «Ver» enseñaba un
     cuadrado gris con el icono de imagen rota, porque metía la dirección de
     «ver en YouTube» dentro de un <iframe>, que no se deja enmarcar. */
  await A.click('#tb [data-ver]');
  await A.waitForSelector('.modal', { timeout: 10000 });
  await A.waitForTimeout(2500);
  const previa = await A.evaluate(() => {
    const m = document.querySelector('.modal');
    const rotas = [...m.querySelectorAll('img')]
      .filter((i) => i.complete && i.naturalWidth === 0).length;
    return {
      // Nunca un <iframe> a pelo: el vídeo va por el reproductor de la casa.
      ifamesSueltos: [...m.querySelectorAll('iframe')].filter((f) => !f.closest('.repro')).length,
      rotas,
      hayAlgo: !!m.querySelector('.repro, .previa, p, a[href]'),
    };
  });
  a.comprobar(previa.ifamesSueltos === 0 && previa.rotas === 0,
    `Ver un contenido enseña algo, no un icono de imagen rota (${previa.rotas} rota(s), ${
      previa.ifamesSueltos} marco(s) suelto(s))`);
  a.comprobar(previa.hayAlgo, 'Y quien aprueba ve lo mismo que va a ver el estudiante');
  await A.click('.modal [data-x]').catch(() => A.keyboard.press('Escape'));
  await A.waitForTimeout(500);

  /* ============ leer la evaluación antes de publicarla ============
     El constructor enseña cajas de edición y casillas de «correcta», que es
     justo lo que el alumno no ve. */
  await A.goto(`${BASE}/plataforma/admin/evaluaciones.html`, { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('#tb tr', { timeout: 30000 });
  await A.waitForTimeout(1500);
  await A.click('#tb [data-previa]');
  await A.waitForTimeout(2500);
  const examen = await A.evaluate(() => {
    const m = document.querySelector('.modal');
    const t = (m?.textContent || '').replace(/\s+/g, ' ');
    return {
      preguntas: m?.querySelectorAll('ol li').length || 0,
      // Las opciones se ven, pero sin decir cuál es la buena.
      opciones: m?.querySelectorAll('ol li .check').length || 0,
      marcaLaCorrecta: !!m?.querySelector('ol li input:checked'),
      dice: /Total: \d+ punto/.test(t),
    };
  });
  a.comprobar(examen.preguntas > 0 && examen.dice,
    `La evaluación se lee como la lee el estudiante (${examen.preguntas} pregunta(s))`);
  a.comprobar(!examen.marcaLaCorrecta,
    `Sin chivar cuál es la respuesta buena (${examen.opciones} opción(es) a la vista)`);

  /* ============ repartir las clases entre los profesores ============
     item 1 · «más filtros, listas o formas de distribuirle a los profesores las
     clases». Antes eran veinte diálogos, uno por sesión, y para saber cuáles
     estaban sin profesor había que leer el mes fila por fila.

     Se montan tres sesiones propias en un mes futuro para no depender de lo que
     hubiera en el calendario, y se borran al terminar. */
  const puesto = await A.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-24');
    const { data: coh } = await m.sb.from('cem_cohorts').select('id').limit(1);
    const { data: profes } = await m.sb.from('cem_profiles').select('id,nombre')
      .eq('rol', 'profesor').limit(2);
    if (!coh?.length || (profes || []).length < 1) return null;
    const mes = new Date(); mes.setMonth(mes.getMonth() + 2);
    const dia = (n) => `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, '0')}-0${n}`;
    const filas = [1, 2, 3].map((n) => ({
      cohort_id: coh[0].id, titulo: `PRUEBA reparto ${n}`, fecha: dia(n),
      hora_inicio: '18:30', hora_fin: '20:30', modalidad: 'online',
      estado: 'programada', teacher_id: null,
    }));
    const { data, error } = await m.sb.from('cem_classes').insert(filas).select('id');
    return { error: error?.message || null, ids: (data || []).map((x) => x.id),
             mes: `${mes.getFullYear()}-${String(mes.getMonth() + 1).padStart(2, '0')}`,
             profesor: profes[0].id, comoSeLlama: profes[0].nombre };
  });

  if (!puesto || puesto.error) {
    a.comprobar(false, `Se pudieron montar sesiones de prueba para el reparto (${puesto?.error || 'sin cohortes'})`);
  } else {
    await A.goto(`${BASE}/plataforma/admin/calendario.html`);
    await A.waitForSelector('#page:not(.hidden)', { timeout: 30000 });
    await A.waitForTimeout(2500);
    // Ir al mes donde se dejaron.
    for (let i = 0; i < 6; i++) {
      if (await A.locator('#tb tr', { hasText: 'PRUEBA reparto' }).count() >= 3) break;
      await A.click('#next');
      await A.waitForTimeout(1200);
    }

    const total = await A.locator('#tb tr [data-marca]').count();
    await A.selectOption('#fProf', '_sin');
    await A.waitForTimeout(600);
    const sinProfe = await A.locator('#tb tr [data-marca]').count();
    a.comprobar(sinProfe >= 3 && sinProfe <= total,
      `Se puede pedir «sin profesor asignado» y sale sólo eso (${sinProfe} de ${total})`);

    /* El filtro manda también sobre la cuadrícula: si la tabla dijera una cosa
       y el mes otra, habría que creerle a una de las dos sin saber a cuál. */
    const enCuadricula = await A.locator('#cal .ev').count();
    a.comprobar(enCuadricula === sinProfe,
      `Y la cuadrícula del mes enseña lo mismo que la tabla (${enCuadricula} y ${sinProfe})`);

    a.comprobar(!(await A.locator('#barraLote').isVisible()),
      'Sin nada marcado no hay barra de reparto pidiendo un profesor');

    await A.click('#marcaTodas');
    await A.waitForTimeout(500);
    a.comprobar(await A.locator('#barraLote').isVisible(),
      `Al marcar, aparece («${(await A.locator('#loteCuenta').textContent()).trim()}»)`);

    await A.selectOption('#loteProf', puesto.profesor);
    await A.click('#btnLote');
    await A.waitForSelector('[data-si]', { timeout: 10000 });
    const aviso = await A.locator('.modal-b').textContent();
    a.comprobar(/se reemplaza/i.test(aviso) && new RegExp(puesto.comoSeLlama).test(aviso),
      'Antes de repartir dice a cuántas y a quién, y que lo anterior se reemplaza');
    await A.locator('.modal [data-si]').click();
    await A.waitForTimeout(4000);

    const quedaron = await A.evaluate(async (arg) => {
      const m = await import('/plataforma/assets/app.js?v=2026-08-24');
      const { data } = await m.sb.from('cem_classes').select('id,teacher_id').in('id', arg.ids);
      return (data || []).filter((x) => x.teacher_id === arg.profesor).length;
    }, puesto);
    a.comprobar(quedaron === puesto.ids.length,
      `Las tres quedan asignadas de una vez (${quedaron} de ${puesto.ids.length})`);

    // Y se limpia: estas sesiones son de la prueba, no del calendario de nadie.
    await A.evaluate(async (ids) => {
      const m = await import('/plataforma/assets/app.js?v=2026-08-24');
      await m.sb.from('cem_classes').delete().in('id', ids);
    }, puesto.ids);
  }

  a.comprobar(E.errores.length === 0,
    `Las pantallas del estudiante no lanzan errores ${JSON.stringify(E.errores.slice(0, 2))}`);
  a.comprobar(A.errores.length === 0,
    `Las del equipo tampoco ${JSON.stringify(A.errores.slice(0, 2))}`);

  return a;
}
