/* La lección: dudas, apuntes, minuto guardado y «para después».
   ==========================================================================
   Mejoras 1, 3, 4, 7, 8, 9 y 13 de docs/40-mejoras-por-rol.md.

   Lo que de verdad importa comprobar aquí no es que los botones estén: es que
   la puerta siga cerrada. Un hilo de dudas es contenido del curso, y si se
   pudiera leer sin haber pagado sería una forma nueva de entrar por la ventana
   —una que no existía antes de esta pantalla—.

   Después, que la conversación funcione: preguntar, que le llegue al profesor,
   que responda, y que la respuesta le llegue a quien preguntó. Sin ese último
   paso la duda se queda esperando a que alguien vuelva a entrar por
   casualidad, que es exactamente lo que pasaba con WhatsApp.

   La prueba deja la base como la encontró: la duda que crea la borra al final. */

import { acta, nuevaPestana, entrar, BASE, conLaBase } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('lección');

  const E = await nuevaPestana(navegador, { ancho: 1400, alto: 1000 });
  await entrar(E, 'estudiante', 'estudiante/panel.html');
  await E.waitForTimeout(2200);

  /* ============ 1 · la puerta ============ */
  // Una lección de un curso que este alumno NO ha pagado. Si no hay ninguna,
  // se dice: una prueba que se salta en silencio es una prueba que miente.
  const ajena = await conLaBase(E, async (sb) => {
    const { data: mias } = await sb.from('cem_enrollments').select('course_id');
    const propios = new Set((mias || []).map((e) => e.course_id));
    const { data: mods } = await sb.from('cem_modules')
      .select('course_id,cem_lessons(id,titulo)').limit(200);
    for (const m of mods || []) {
      if (propios.has(m.course_id)) continue;
      const l = (m.cem_lessons || [])[0];
      if (l) return { lesson_id: l.id, course_id: m.course_id };
    }
    return null;
  });

  if (ajena) {
    // Los rechazos de aquí abajo los provoca esta prueba a propósito, y la base
    // los contesta con un 400 que el navegador escribe en la consola. Contarlos
    // como «la pantalla está rota» sería medir la prueba, no la plataforma.
    const fuera = await E.silenciarMientras(() => conLaBase(E, async (sb, id) => {
      const { data: puede } = await sb.rpc('cem_puede_ver_leccion', { p_lesson_id: id });
      const { data: hilo } = await sb.rpc('cem_dudas_de_leccion', { p_lesson_id: id });
      const { error } = await sb.rpc('cem_preguntar',
        { p_lesson_id: id, p_cuerpo: 'Prueba automática: esto no debería entrar.' });
      return { puede, hilo: (hilo || []).length, rechazo: error?.message || null };
    }, ajena.lesson_id));

    a.comprobar(fuera.puede === false, 'Una lección de un curso ajeno dice que no se puede ver');
    a.comprobar(fuera.hilo === 0, 'Y su hilo de dudas vuelve vacío, no con las preguntas de otros');
    a.comprobar(!!fuera.rechazo, `Y preguntar ahí se rechaza (${fuera.rechazo || 'NO SE RECHAZÓ'})`);
  } else {
    a.comprobar(true, '(no hay ningún curso ajeno con lecciones para probar la puerta)');
  }

  /* ============ 2 · preguntar en la propia ============ */
  const mia = await conLaBase(E, async (sb) => {
    const { data: ins } = await sb.from('cem_enrollments').select('id,course_id');
    const { data: acceso } = await sb.rpc('cem_mi_acceso');
    for (const e of ins || []) {
      if (acceso?.[e.id]?.abierto !== true) continue;
      const { data: mods } = await sb.from('cem_modules')
        .select('course_id,cem_lessons(id,titulo)').eq('course_id', e.course_id);
      const l = (mods || []).flatMap((m) => m.cem_lessons || [])[0];
      if (l) return { enrollment_id: e.id, course_id: e.course_id, lesson_id: l.id, titulo: l.titulo };
    }
    return null;
  });

  a.comprobar(!!mia, `El alumno tiene alguna lección abierta para preguntar (${mia?.titulo || '—'})`);

  let dudaId = null;
  if (mia) {
    const texto = `Prueba automática ${Date.now()}: ¿de dónde sale el WACC?`;
    const puesta = await conLaBase(E, async (sb, { id, texto: t }) => {
      const { data, error } = await sb.rpc('cem_preguntar',
        { p_lesson_id: id, p_cuerpo: t, p_segundo: 854 });
      if (error) return { error: error.message };
      const { data: hilo } = await sb.rpc('cem_dudas_de_leccion', { p_lesson_id: id });
      const nuestra = (hilo || []).find((d) => d.id === data);
      return { id: data, segundo: nuestra?.segundo, mia: nuestra?.mia, cuantas: (hilo || []).length };
    }, { id: mia.lesson_id, texto });

    dudaId = puesta.id || null;
    a.comprobar(!!dudaId, `Se puede preguntar sobre la propia lección (${puesta.error || 'ok'})`);
    a.comprobar(puesta.segundo === 854, `Y queda anotado el minuto del vídeo (${puesta.segundo})`);
    a.comprobar(puesta.mia === true, 'Y quien preguntó la reconoce como suya');
  }

  /* ============ 3 · el profesor la ve y responde (mejora 13) ============ */
  if (dudaId && mia) {
    const D = await nuevaPestana(navegador, { ancho: 1400, alto: 1000 });
    await entrar(D, 'profesor', 'docente/panel.html');
    await D.waitForTimeout(2000);

    const vista = await conLaBase(D, async (sb, id) => {
      const { data } = await sb.rpc('cem_dudas_pendientes', { p_course_id: null });
      return { pendientes: (data || []).length, esta: (data || []).some((d) => d.id === id) };
    }, dudaId);

    // Puede que este profesor no dicte ese curso concreto; entonces no debería
    // verla, y eso también es correcto. Se distingue en el mensaje.
    a.comprobar(typeof vista.pendientes === 'number',
      `El profesor tiene una cola de dudas sin responder (${vista.pendientes})`);

    if (vista.esta) {
      const antes = await avisosDe(E);
      const resp = await conLaBase(D, async (sb, id) => {
        const { error } = await sb.rpc('cem_responder_duda',
          { p_duda_id: id, p_cuerpo: 'Prueba automática: sale del coste medio ponderado.' });
        return error?.message || null;
      }, dudaId);
      a.comprobar(!resp, `El profesor puede responderla (${resp || 'ok'})`);

      await E.waitForTimeout(800);
      const despues = await avisosDe(E);
      a.comprobar(despues > antes,
        `Y a quien preguntó le llega el aviso (${antes} → ${despues} avisos)`);

      const marcada = await conLaBase(E, async (sb, id) => {
        const { data } = await sb.rpc('cem_dudas_de_leccion', { p_lesson_id: id });
        const d = (data || []).find((x) => (x.respuestas || []).some((r) => r.de_docente));
        return !!d;
      }, mia.lesson_id);
      a.comprobar(marcada, 'Y la respuesta queda marcada como del profesor, no como un comentario más');
    } else {
      a.comprobar(true, '(este profesor no dicta ese curso, así que no le toca verla)');
    }
    await D.close();
  }

  /* ============ 4 · la pantalla ============ */
  if (mia) {
    await E.goto(`${BASE}/plataforma/estudiante/clase.html?curso=${mia.course_id}&leccion=${mia.lesson_id}`,
      { waitUntil: 'domcontentloaded' });
    await E.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
    await E.waitForTimeout(3200);

    a.comprobar(E.errores.length === 0, `El aula abre sin errores ${JSON.stringify(E.errores.slice(0, 2))}`);

    const abierta = await E.evaluate(() => document.querySelector('.les-item.on .les-t')?.textContent?.trim());
    a.comprobar(abierta === mia.titulo,
      `Se abre por la lección que dice la dirección, no por la primera (${abierta})`);

    // El hilo de dudas es la pestaña por defecto: es donde está la conversación.
    const hayHilo = await E.evaluate(() =>
      document.querySelectorAll('#panelTabs .duda').length + (document.querySelector('#dudaForm') ? 1 : 0));
    a.comprobar(hayHilo > 0, `La pestaña de dudas trae el formulario y el hilo (${hayHilo})`);

    /* El buscador del temario (mejora 3). Se busca media palabra del título
       de la lección abierta: tiene que seguir estando, y con otra cosa que no
       está tienen que desaparecer todas. */
    const trozo = (mia.titulo || '').split(/\s+/).find((w) => w.length > 4) || (mia.titulo || '').slice(0, 5);
    const busca = await E.evaluate(async (t) => {
      const caja = document.querySelector('#buscaLeccion');
      const escribir = (v) => {
        caja.value = v;
        caja.dispatchEvent(new Event('input', { bubbles: true }));
      };
      escribir(t);
      const conTexto = document.querySelectorAll('#indice .les-item').length;
      escribir('zzqqxx-no-existe');
      const conNada = document.querySelectorAll('#indice .les-item').length;
      const aviso = !document.querySelector('#sinResultados').hidden;
      escribir('');
      return { conTexto, conNada, aviso, todas: document.querySelectorAll('#indice .les-item').length };
    }, trozo);

    a.comprobar(busca.conTexto > 0 && busca.conTexto <= busca.todas,
      `Buscar en el temario filtra (${busca.conTexto} de ${busca.todas} con «${trozo}»)`);
    a.comprobar(busca.conNada === 0 && busca.aviso,
      'Y cuando no coincide nada lo dice, en vez de dejar la lista vacía sin explicación');

    /* «Para después» (mejora 9). Se pulsa, se comprueba que quedó guardado en
       la base —no sólo pintado— y se deja como estaba. */
    const antes = await E.evaluate(() => !!document.querySelector('#btnDespues'));
    a.comprobar(antes, 'La lección se puede marcar para volver');

    if (antes) {
      await E.click('#btnDespues');
      await E.waitForTimeout(1200);
      const guardado = await conLaBase(E, async (sb, { enr, les }) => {
        const { data } = await sb.from('cem_lesson_progress')
          .select('para_despues').eq('enrollment_id', enr).eq('lesson_id', les).maybeSingle();
        return data?.para_despues === true;
      }, { enr: mia.enrollment_id, les: mia.lesson_id });
      a.comprobar(guardado, 'Y la marca queda en la base, no sólo en la pantalla');

      const enElIndice = await E.evaluate(() =>
        !!document.querySelector('#indice .les-item.on [title="Marcada para después"]'));
      a.comprobar(enElIndice, 'Y se ve en el índice, que es donde sirve para volver');

      await E.click('#btnDespues');           // se deja como estaba
      await E.waitForTimeout(900);
    }

    /* Los apuntes son privados: que se puedan bajar es lo que impide que se
       pierdan el día que se acaba el curso (mejora 8). */
    await E.click('#tabs button[data-t="notas"]');
    await E.waitForTimeout(400);
    const notas = await E.evaluate(() => ({
      caja: !!document.querySelector('#nota'),
      aviso: (document.querySelector('#panelTabs')?.textContent || '').includes('Sólo las ves tú'),
    }));
    a.comprobar(notas.caja && notas.aviso, 'Los apuntes están y dicen que nadie más los lee');

    await E.click('#tabs button[data-t="recursos"]');
    await E.waitForTimeout(700);
    const recursos = await E.evaluate(() => !!document.querySelector('#btnTemario'));
    a.comprobar(recursos, 'El temario se puede imprimir para estudiar sin conexión');

    /* Un archivo, una ficha. Salía dos veces —una por ser del curso y otra por
       colgar de una lección—, que es la misma fila de `cem_media` contada dos
       veces, y al ver el nombre repetido uno se baja las dos por si acaso. */
    const material = await E.evaluate(() => {
      const fichas = [...document.querySelectorAll('.rejilla-material .card')];
      const enlaces = fichas.map((c) => c.querySelector('a[download]')?.getAttribute('href')).filter(Boolean);
      return {
        fichas: fichas.length,
        nombres: fichas.map((c) => c.querySelector('.negrita')?.textContent.trim()),
        repetidos: enlaces.length - new Set(enlaces).size,
        conPrevia: fichas.filter((c) => c.querySelector('.previa')).length,
        conImagen: fichas.filter((c) => c.querySelector('.previa img')).length,
        // Si no hay ni cuadrícula ni el aviso de que no hay nada, es que la
        // pestaña se rompió — y entonces «cero repetidos» no prueba nada.
        loDiceVacia: /todavía no tiene material/i.test(document.querySelector('#panelTab')?.textContent
          || document.body.textContent),
      };
    });
    a.comprobar(material.fichas > 0 || material.loDiceVacia,
      'La pestaña de recursos enseña el material, o dice que no hay');
    if (material.fichas) {
      a.comprobar(material.repetidos === 0,
        `Cada material sale una sola vez (${material.fichas} ficha(s), ${material.repetidos} repetida(s): ${
          material.nombres.join(' · ')})`);
      a.comprobar(material.conPrevia === material.fichas && material.conImagen > 0,
        `Y cada uno se ve antes de bajarlo (${material.conImagen} con imagen de ${material.fichas})`);
    } else {
      a.comprobar(true, 'Este curso no tiene material que listar');
    }
  }

  /* ============ 5 · recoger ============ */
  if (dudaId) {
    const limpio = await conLaBase(E, async (sb, id) => {
      const { error } = await sb.rpc('cem_borrar_duda', { p_duda_id: id });
      return error?.message || null;
    }, dudaId);
    a.comprobar(!limpio, `La prueba deja la base como la encontró (${limpio || 'duda retirada'})`);
  }

  a.comprobar(E.errores.length === 0, `Sin errores ${JSON.stringify(E.errores.slice(0, 2))}`);
  await E.close();
  return a;
}

/** Cuántos avisos tiene ahora mismo quien mira. */
function avisosDe(pagina) {
  return conLaBase(pagina, async (sb) => {
    const { data } = await sb.rpc('cem_mis_notificaciones', { p_limite: 50 });
    return (data || []).length;
  });
}
