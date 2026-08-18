/* Las herramientas del docente.
   ==========================================================================
   Mejoras 14, 15, 16, 18, 19 y 20 de docs/40-mejoras-por-rol.md.

   Es el rol más desatendido de la plataforma: da la clase, corrige y es quien
   primero nota que alguien se está yendo, pero su única forma de escribirle a
   un alumno era pedirle el teléfono a administración.

   Lo que hay que comprobar antes que nada es el límite: un profesor puede
   escribirle a SUS alumnos y sólo a ellos, y puede avisar de SUS clases y sólo
   de ellas. Si eso se cae, lo que se ha construido no es una herramienta sino
   una lista de correos abierta.

   Después, que la vista previa sea de verdad sólo lectura. Si escribiera —si
   marcara progreso o publicara una duda— estaría ensuciando el expediente de
   un alumno con lo que hizo otra persona. */

import { acta, nuevaPestana, entrar, BASE, conLaBase } from '../entorno.mjs';

/* Cuidado al leer quién soy: `cem_my_profile()` devuelve UNA fila, no un
   conjunto, y según por dónde se pida llega como objeto o como array de uno.
   Leerlo mal daba `undefined`, y entonces `.eq('teacher_id', undefined)` pedía
   la tabla ENTERA — un 400 en la consola y, peor, una prueba que decía que el
   profesor podía escribirle a cualquiera cuando lo que fallaba era la prueba.

   Los bloques de abajo corren DENTRO del navegador, así que no pueden llamar a
   una función de este archivo: cada uno lo resuelve en sus dos líneas. */

export default async function correr(navegador) {
  const a = acta('herramientas del docente');

  const D = await nuevaPestana(navegador, { ancho: 1400, alto: 1050 });
  await entrar(D, 'profesor', 'docente/panel.html');
  await D.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await D.waitForTimeout(3200);

  a.comprobar(D.errores.length === 0, `El panel abre sin errores ${JSON.stringify(D.errores.slice(0, 2))}`);

  /* ============ 1 · la cola de corrección (mejora 15) ============ */
  const cola = await conLaBase(D, async (sb) => {
    const { data, error } = await sb.rpc('cem_cola_de_correccion');
    return { lista: data || [], error: error?.message };
  });
  a.comprobar(!cola.error, `La cola de corrección se puede pedir (${cola.error || 'ok'})`);

  // Lo que bloquea un certificado va primero; a igualdad, lo que lleva más
  // esperando. Se comprueba el orden, no que haya datos: puede no haber nada
  // pendiente y eso está bien.
  const bienOrdenada = cola.lista.every((c, i) => {
    if (i === 0) return true;
    const ant = cola.lista[i - 1];
    if (ant.bloquea !== c.bloquea) return ant.bloquea === true;
    return Number(ant.dias) >= Number(c.dias);
  });
  a.comprobar(bienOrdenada,
    `Y viene ordenada por urgencia real, no por fecha (${cola.lista.length} entrega(s))`);

  /* ============ 2 · escribirle a un alumno, y sólo a los suyos ============ */
  const gente = await conLaBase(D, async (sb) => {
    const { data: pr } = await sb.rpc('cem_my_profile');
    const yo = (Array.isArray(pr) ? pr[0] : pr)?.id;
    const { data: tas } = await sb.from('cem_teacher_assignments')
      .select('cohort_id,course_id').eq('teacher_id', yo);
    const cohortes = (tas || []).map((t) => t.cohort_id).filter(Boolean);
    const cursos = (tas || []).map((t) => t.course_id).filter(Boolean);

    // Alguien de mis grupos.
    let mio = null;
    if (cohortes.length) {
      const { data } = await sb.from('cem_enrollments')
        .select('profile_id').in('cohort_id', cohortes).limit(1).maybeSingle();
      mio = data?.profile_id || null;
    }

    /* Y alguien que NO lo es. En los datos de demostración este profesor
       alcanza a los cuatro estudiantes que hay, así que el caso ajeno se busca
       entre todos los perfiles: una cuenta sin ninguna inscripción en sus
       grupos ni en sus cursos es exactamente lo que la regla tiene que
       rechazar, sea cual sea su rol. */
    const { data: alcanzables } = (cohortes.length || cursos.length)
      ? await sb.from('cem_enrollments').select('profile_id,cohort_id,course_id')
      : { data: [] };
    const suyos = new Set((alcanzables || [])
      .filter((e) => cohortes.includes(e.cohort_id) || cursos.includes(e.course_id))
      .map((e) => e.profile_id));
    const { data: todos } = await sb.from('cem_profiles').select('id').limit(200);
    const ajeno = (todos || []).map((x) => x.id).find((id) => !suyos.has(id) && id !== yo) || null;
    return { mio, ajeno, suyos: suyos.size };
  });

  if (gente.ajeno) {
    const fuera = await D.silenciarMientras(() => conLaBase(D, async (sb, id) => {
      const { error } = await sb.rpc('cem_mensaje_a_estudiante', {
        p_profile_id: id, p_asunto: 'Prueba automática',
        p_cuerpo: 'Esto no debería llegar a nadie.' });
      return error?.message || null;
    }, gente.ajeno));
    a.comprobar(!!fuera, `Un profesor NO puede escribirle a un alumno que no es suyo (${fuera || 'PUDO'})`);
  } else {
    a.comprobar(true, '(todos los estudiantes son de este profesor: no hay caso ajeno que probar)');
  }

  if (gente.mio) {
    const antes = await avisosDe(navegador, gente.mio);
    const envio = await conLaBase(D, async (sb, id) => {
      const { error } = await sb.rpc('cem_mensaje_a_estudiante', {
        p_profile_id: id, p_asunto: 'Prueba automática: te echo de menos en clase',
        p_cuerpo: 'Prueba automática. Si ves esto, el mensaje del profesor funciona.' });
      return error?.message || null;
    }, gente.mio);
    a.comprobar(!envio, `Y sí a los suyos (${envio || 'ok'})`);

    const registrado = await conLaBase(D, async (sb) => {
      const { data } = await sb.from('cem_audit_events')
        .select('accion,created_at').eq('accion', 'mensaje_a_estudiante')
        .order('created_at', { ascending: false }).limit(1);
      return (data || []).length > 0;
    });
    a.comprobar(registrado, 'Y queda registrado: no es una conversación privada, es la escuela escribiendo');
  } else {
    a.comprobar(true, '(este profesor no tiene alumnos asignados con los que probar el mensaje)');
  }

  /* ============ 3 · avisar de una clase (mejora 16) ============ */
  const clase = await conLaBase(D, async (sb) => {
    const { data: pr } = await sb.rpc('cem_my_profile');
    const yo = (Array.isArray(pr) ? pr[0] : pr)?.id;
    const { data: tas } = await sb.from('cem_teacher_assignments')
      .select('cohort_id').eq('teacher_id', yo);
    const cohortes = (tas || []).map((t) => t.cohort_id).filter(Boolean);
    if (!cohortes.length) return { mia: null, ajena: null };
    const { data: mia } = await sb.from('cem_classes')
      .select('id').in('cohort_id', cohortes).limit(1).maybeSingle();
    const { data: otras } = await sb.from('cem_classes').select('id,cohort_id').limit(50);
    const ajena = (otras || []).find((c) => !cohortes.includes(c.cohort_id))?.id || null;
    return { mia: mia?.id || null, ajena };
  });

  if (clase.ajena) {
    const no = await D.silenciarMientras(() => conLaBase(D, async (sb, id) => {
      const { error } = await sb.rpc('cem_avisar_de_clase', { p_class_id: id, p_nota: null });
      return error?.message || null;
    }, clase.ajena));
    a.comprobar(!!no, `No puede avisar de una clase que no dicta (${no || 'PUDO'})`);
  } else {
    a.comprobar(true, '(no hay clases de otros grupos con las que probar el límite)');
  }

  if (clase.mia) {
    const si = await conLaBase(D, async (sb, id) => {
      const { data, error } = await sb.rpc('cem_avisar_de_clase',
        { p_class_id: id, p_nota: 'Prueba automática: la movemos.' });
      return { n: data, error: error?.message };
    }, clase.mia);
    a.comprobar(!si.error, `Y sí de las suyas (${si.error || `${si.n} avisado(s)`})`);
  } else {
    a.comprobar(true, '(este profesor no tiene sesiones programadas que avisar)');
  }

  /* ============ 4 · comentarios guardados (mejora 19) ============ */
  const cajon = await conLaBase(D, async (sb) => {
    const texto = 'Prueba automática: falta la bibliografía.';
    await sb.rpc('cem_comentario_usar', { p_texto: texto });
    await sb.rpc('cem_comentario_usar', { p_texto: texto });   // usarlo dos veces
    const { data } = await sb.from('cem_comentarios_guardados')
      .select('id,texto,usos').eq('texto', texto).maybeSingle();
    const fin = data ? (await sb.from('cem_comentarios_guardados').delete().eq('id', data.id)).error : null;
    return { usos: data?.usos, unaSola: !!data, error: fin?.message };
  });
  a.comprobar(cajon.unaSola, 'Un comentario repetido no se guarda dos veces');
  a.comprobar(cajon.usos === 2, `Se cuenta cuántas veces se usa, para ordenar el cajón (${cajon.usos})`);

  /* ============ 5 · la vista previa del aula (mejora 20) ============ */
  const curso = await conLaBase(D, async (sb) => {
    const { data } = await sb.from('cem_courses').select('id,nombre').limit(1).maybeSingle();
    return data;
  });

  if (curso) {
    await D.goto(`${BASE}/plataforma/estudiante/clase.html?curso=${curso.id}`,
      { waitUntil: 'domcontentloaded' });
    await D.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
    await D.waitForTimeout(3500);

    const vista = await D.evaluate(() => ({
      aviso: !!document.querySelector('#avisoVista'),
      lecciones: document.querySelectorAll('#indice .les-item').length,
      escribibles: document.querySelectorAll('#visor .actions:not([hidden]) #btnDone').length,
      menu: document.querySelector('.sidebar .brand span')?.textContent || '',
    }));
    a.comprobar(vista.aviso, 'La vista previa dice claramente que lo es');
    a.comprobar(vista.lecciones > 0, `Y enseña el temario de verdad (${vista.lecciones} lección(es))`);
    a.comprobar(vista.escribibles === 0, 'Sin ningún botón que escriba en el expediente de nadie');
    a.comprobar(/docente/i.test(vista.menu),
      `Y el profesor conserva su propio menú (${vista.menu})`);

    // La comprobación que de verdad importa: que no haya quedado rastro.
    const rastro = await conLaBase(D, async (sb, cursoId) => {
      const { data: pr } = await sb.rpc('cem_my_profile');
      const yo = (Array.isArray(pr) ? pr[0] : pr)?.id;
      const { data } = await sb.from('cem_reproducciones')
        .select('id').eq('profile_id', yo).eq('course_id', cursoId);
      return (data || []).length;
    }, curso.id);
    a.comprobar(rastro === 0, `Mirar en vista previa no queda registrado como una clase vista (${rastro})`);

    a.comprobar(D.errores.length === 0, `Y abre sin errores ${JSON.stringify(D.errores.slice(0, 2))}`);
  }

  await D.close();
  return a;
}

/** Cuántos avisos tiene ese perfil, mirando desde una sesión de administración. */
async function avisosDe(navegador, profileId) {
  const A = await nuevaPestana(navegador);
  await entrar(A, 'admin');
  const n = await conLaBase(A, async (sb, id) => {
    const { data } = await sb.from('cem_notificaciones').select('id').eq('profile_id', id);
    return (data || []).length;
  }, profileId);
  await A.close();
  return n;
}
