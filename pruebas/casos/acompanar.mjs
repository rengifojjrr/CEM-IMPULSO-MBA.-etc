/* Lo que rodea al curso: bienvenida, certificado, ritmo y plan de pago.
   ==========================================================================
   Mejoras 2, 6, 10, 11 y 12 de docs/40-mejoras-por-rol.md.

   De las cinco, la única que mueve dinero es el cambio de plan, y por eso es
   la que más se comprueba aquí. Lo importante no es que se pueda pedir: es que
   al aplicarlo la suma de las cuotas nuevas sea EXACTAMENTE lo que se debía.
   Un céntimo perdido al dividir entre tres es un céntimo que alguien tiene que
   buscar a mano en el cierre de mes.

   Y que no se pueda replanificar una cuota que ya tiene un pago detrás: eso es
   lo que evita que un pago quede apuntando a una cuota que ya no existe.

   La prueba trabaja sobre una inscripción de mentira, marcada y cancelada, que
   reutiliza en cada pasada; al terminar la deja sin cuotas ni pagos. */

import { acta, nuevaPestana, entrar, BASE, conLaBase } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('acompañar al estudiante');

  /* ============ 1 · el panel del estudiante ============ */
  const E = await nuevaPestana(navegador, { ancho: 1400, alto: 1100 });
  await entrar(E, 'estudiante', 'estudiante/panel.html');
  await E.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await E.waitForTimeout(3800);

  a.comprobar(E.errores.length === 0, `El panel abre sin errores ${JSON.stringify(E.errores.slice(0, 2))}`);

  // Mejora 6: «te falta el 40% del contenido y 2 evaluaciones» en vez de un
  // certificado que aparece cuando aparece.
  const pistas = await E.evaluate(() =>
    [...document.querySelectorAll('.pista')].map((p) => p.textContent.replace(/\s+/g, ' ').trim()));
  a.comprobar(pistas.length > 0, `Cada curso dice qué le falta para el certificado (${pistas.length} pista(s))`);
  a.comprobar(pistas.some((t) => /certificado/i.test(t)),
    'Y lo dice en una frase, no en un porcentaje suelto');
  a.comprobar(!pistas.some((t) => /evaluaciónes/i.test(t)),
    'Y escrito en castellano correcto («evaluaciones», no «evaluaciónes»)');

  // Mejora 10: el ritmo calla cuando el grupo es demasiado pequeño para hablar
  // de «la mayoría» sin señalar a alguien.
  const ritmos = await conLaBase(E, async (sb) => {
    const { data: ens } = await sb.from('cem_enrollments').select('id');
    const salida = [];
    for (const e of ens || []) {
      const { data, error } = await sb.rpc('cem_mi_ritmo', { p_enrollment_id: e.id });
      salida.push({ ...(data || {}), error: error?.message });
    }
    return salida;
  });
  a.comprobar(ritmos.length > 0 && ritmos.every((r) => !r.error),
    `El ritmo contra el grupo se puede preguntar (${ritmos.length} inscripción(es))`);
  a.comprobar(ritmos.every((r) => r.companeros >= 3 || r.donde === 'sin_grupo'),
    'Y con menos de tres compañeros calla, en vez de señalar a alguien');
  a.comprobar(ritmos.every((r) => r.donde !== 'sin_grupo' ? r.mediana != null : r.mediana == null),
    'Cuando sí habla, trae la mediana del grupo');

  // Mejora 12: quien espera verificación puede ir leyendo el temario.
  const conPuerta = await conLaBase(E, async (sb) => {
    const { data } = await sb.rpc('cem_mi_acceso');
    return Object.entries(data || {}).filter(([, v]) => v.abierto === false).length;
  });
  const enlacesPrograma = await E.evaluate(() =>
    [...document.querySelectorAll('#cursos a')].filter((x) => /Ver programa/i.test(x.textContent)).length);
  a.comprobar(enlacesPrograma > 0 || conPuerta === 0,
    `Se puede ver el temario desde la tarjeta del curso (${enlacesPrograma} enlace(s))`);

  /* ============ 2 · el estudiante pide cambiar su plan ============ */
  const conSaldo = await conLaBase(E, async (sb) => {
    const { data: cs } = await sb.from('cem_installments').select('id,enrollment_id,estado,monto,saldo');
    const { data: ps } = await sb.from('cem_payments').select('installment_id');
    const conPago = new Set((ps || []).map((x) => x.installment_id));
    const porEnr = {};
    for (const c of cs || []) {
      if (!['pendiente', 'vencida', 'congelada'].includes(c.estado)) continue;
      porEnr[c.enrollment_id] ??= { n: 0, sucio: false };
      porEnr[c.enrollment_id].n++;
      if (conPago.has(c.id)) porEnr[c.enrollment_id].sucio = true;
    }
    const e = Object.entries(porEnr).find(([, v]) => !v.sucio);
    return e ? e[0] : null;
  });

  const A = await nuevaPestana(navegador, { ancho: 1400, alto: 1000 });
  await entrar(A, 'admin', 'admin/inscripciones.html');
  await A.waitForTimeout(2200);

  /* Si una pasada anterior se cayó a medias pudo dejar su solicitud abierta, y
     la base —con razón— no deja tener dos a la vez sobre la misma inscripción.
     No se borra: una solicitud no se puede borrar de la base, se resuelve. Que
     es además lo que haría una persona, y de paso prueba el camino del rechazo. */
  const restos = await conLaBase(A, async (sb) => {
    const { data } = await sb.from('cem_solicitudes_inscripcion')
      .select('id').eq('estado', 'pendiente').like('motivo', 'Prueba automática%');
    for (const s of data || []) {
      await sb.rpc('cem_resolver_solicitud_inscripcion',
        { p_solicitud_id: s.id, p_aprobar: false, p_resolucion: 'Resto de una prueba anterior.' });
    }
    return (data || []).length;
  });
  if (restos) console.log(`    (se cerraron ${restos} solicitud(es) de una pasada anterior)`);

  let solicitud = null;
  if (conSaldo) {
    const r = await conLaBase(E, async (sb, enr) => {
      const { data, error } = await sb.rpc('cem_solicitar_cambio_inscripcion', {
        p_enrollment_id: enr, p_tipo: 'plan_de_pago',
        p_motivo: 'Prueba automática de cambio de plan.', p_cuotas: 4 });
      return { id: data, error: error?.message };
    }, conSaldo);
    solicitud = r.id || null;
    a.comprobar(!!solicitud, `El estudiante puede pedir cambiar su plan sin escribirle a nadie (${r.error || 'ok'})`);

    // Y no puede pedir dos a la vez, ni un número de cuotas absurdo.
    const abusos = await E.silenciarMientras(() => conLaBase(E, async (sb, enr) => ({
      repetida: (await sb.rpc('cem_solicitar_cambio_inscripcion', {
        p_enrollment_id: enr, p_tipo: 'plan_de_pago', p_motivo: 'otra', p_cuotas: 2 })).error?.message,
      absurda: (await sb.rpc('cem_solicitar_cambio_inscripcion', {
        p_enrollment_id: enr, p_tipo: 'plan_de_pago', p_motivo: 'otra', p_cuotas: 99 })).error?.message,
    }), conSaldo));
    a.comprobar(!!abusos.repetida, `Dos solicitudes a la vez sobre lo mismo se rechazan (${abusos.repetida || 'NO'})`);
    a.comprobar(!!abusos.absurda, `Y noventa y nueve cuotas también (${abusos.absurda || 'NO'})`);
  } else {
    a.comprobar(true, '(este alumno no tiene ninguna cuota limpia con la que probar el cambio de plan)');
  }

  /* ============ 3 · la aritmética del reparto ============ */
  /* Una inscripción de mentira con una cuota de 1.000,01 — un número que NO se
     divide en tres sin dejar céntimo, que es exactamente el caso que interesa.

     Es SIEMPRE la misma, marcada con `promocion = 'PRUEBA-PLAN'` y cancelada:
     una inscripción no se puede borrar de la base a propósito —arrastra el
     historial del dinero— así que crear una nueva en cada pasada iría dejando
     basura. Se reutiliza el cascarón y sólo se rehacen sus cuotas. */
  const ensayo = await conLaBase(A, async (sb) => {
    const MARCA = 'PRUEBA-PLAN';
    let { data: e } = await sb.from('cem_enrollments')
      .select('id').eq('promocion', MARCA).limit(1).maybeSingle();

    if (!e) {
      const { data: curso } = await sb.from('cem_courses').select('id').limit(1).maybeSingle();
      const { data: quien } = await sb.from('cem_profiles')
        .select('id').eq('rol', 'estudiante').limit(1).maybeSingle();
      if (!curso || !quien) return null;
      const { data: nueva, error } = await sb.from('cem_enrollments').insert({
        profile_id: quien.id, course_id: curso.id, estado: 'cancelada',
        promocion: MARCA, precio_final: 1000.01, moneda: 'EUR' }).select('id').maybeSingle();
      if (error) return { error: error.message };
      e = nueva;
    }

    await sb.from('cem_payments').delete().eq('enrollment_id', e.id);
    await sb.from('cem_installments').delete().eq('enrollment_id', e.id);
    const { error: eCuota } = await sb.from('cem_installments').insert({
      enrollment_id: e.id, numero: 1, monto: 1000.01, saldo: 1000.01,
      moneda: 'EUR', fecha_vencimiento: '2026-12-01', estado: 'pendiente' });
    if (eCuota) return { error: eCuota.message };
    return { enr: e.id };
  });

  if (ensayo?.enr) {
    const partido = await conLaBase(A, async (sb, enr) => {
      const { data, error } = await sb.rpc('cem_replanificar_cuotas', { p_enrollment_id: enr, p_cuotas: 3 });
      const { data: cs } = await sb.from('cem_installments')
        .select('numero,monto,saldo,fecha_vencimiento,estado').eq('enrollment_id', enr).order('numero');
      return { data, error: error?.message, cuotas: cs || [] };
    }, ensayo.enr);

    a.comprobar(!partido.error, `Se puede repartir lo que queda en otras cuotas (${partido.error || 'ok'})`);
    a.comprobar(partido.cuotas.length === 3, `Quedan tres cuotas (${partido.cuotas.length})`);

    const suma = partido.cuotas.reduce((t, c) => t + Number(c.monto), 0);
    a.comprobar(Math.abs(suma - 1000.01) < 0.005,
      `Y suman exactamente lo que se debía: ${suma.toFixed(2)} de 1000.01`);

    const mensuales = partido.cuotas.map((c) => c.fecha_vencimiento).sort();
    const distintas = new Set(mensuales).size === 3;
    a.comprobar(distintas, `Con una fecha distinta cada una (${mensuales.join(', ')})`);
    a.comprobar(mensuales[0] > new Date().toISOString().slice(0, 10),
      'Y ninguna vence antes de hoy: cambiar de plan no puede adelantar lo que estaba más lejos');

    /* La protección que de verdad importa: una cuota con un pago detrás no se
       toca. Se le cuelga un pago reportado y se comprueba que se planta. */
    const protegido = await A.silenciarMientras(() => conLaBase(A, async (sb, enr) => {
      const { data: c } = await sb.from('cem_installments')
        .select('id').eq('enrollment_id', enr).limit(1).maybeSingle();
      const { error: ePago } = await sb.from('cem_payments').insert({
        enrollment_id: enr, installment_id: c.id, monto: 10, moneda: 'EUR',
        estado: 'reportado', referencia: 'PRUEBA-PLAN', metodo: 'Zelle',
        fecha: new Date().toISOString() });
      const { error } = await sb.rpc('cem_replanificar_cuotas', { p_enrollment_id: enr, p_cuotas: 5 });
      return { rechazo: error?.message, ePago: ePago?.message };
    }, ensayo.enr));

    a.comprobar(!!protegido.rechazo || !!protegido.ePago,
      `Una cuota con un pago detrás no se replanifica (${protegido.rechazo || protegido.ePago || 'SE DEJÓ'})`);

    // Recoger: las cuotas y los pagos del ensayo. El cascarón se queda —está
    // cancelado y marcado— para que la siguiente pasada lo reutilice.
    const limpio = await conLaBase(A, async (sb, enr) => {
      await sb.from('cem_payments').delete().eq('enrollment_id', enr);
      await sb.from('cem_installments').delete().eq('enrollment_id', enr);
      const { data: cs } = await sb.from('cem_installments').select('id').eq('enrollment_id', enr);
      const { data: ps } = await sb.from('cem_payments').select('id').eq('enrollment_id', enr);
      return { cuotas: (cs || []).length, pagos: (ps || []).length };
    }, ensayo.enr);
    a.comprobar(limpio.cuotas === 0 && limpio.pagos === 0,
      `El ensayo no deja cuotas ni pagos detrás (${limpio.cuotas} cuota(s), ${limpio.pagos} pago(s))`);
  } else {
    a.comprobar(false, `No se pudo montar la inscripción de ensayo (${ensayo?.error || 'sin curso o sin alumno'})`);
  }

  /* ============ 4 · recoger la solicitud ============ */
  if (solicitud) {
    // Se rechaza, que es como se cierra una solicitud de verdad: borrarla no se
    // puede y tampoco debería poderse — es el rastro de algo que alguien pidió.
    const cerrada = await conLaBase(A, async (sb, id) => {
      const { error } = await sb.rpc('cem_resolver_solicitud_inscripcion',
        { p_solicitud_id: id, p_aprobar: false, p_resolucion: 'Prueba automática: se deshace.' });
      const { data } = await sb.from('cem_solicitudes_inscripcion')
        .select('estado').eq('id', id).maybeSingle();
      return { error: error?.message, estado: data?.estado };
    }, solicitud);
    a.comprobar(cerrada.estado === 'rechazada',
      `La solicitud de prueba queda cerrada (${cerrada.error || cerrada.estado})`);
  }

  /* ============ tres puertas que faltaban en el menú ============
     Las evaluaciones vivían dentro del panel; el calendario no existía —había
     que abrir cada curso para juntar las clases de cabeza—; y para preguntar
     algo no había ningún sitio dentro de la plataforma. */
  const N = await nuevaPestana(navegador, { ancho: 1340, alto: 1000 });
  await entrar(N, 'estudiante');
  // El armazón lo monta un módulo asíncrono: `entrar` vuelve con la página
  // cargada, no con el menú puesto. Sin esperarlo se lee una lista vacía y la
  // comprobación se pone roja por el arnés, no por la aplicación.
  await N.waitForSelector('.sidebar a.nav-item', { timeout: 30000 });
  const menu = await N.evaluate(() => [...document.querySelectorAll('.sidebar a.nav-item')]
    .map((x) => x.getAttribute('href')));
  ['evaluaciones.html', 'calendario.html', 'ayuda.html'].forEach((h) => {
    a.comprobar(menu.includes(h), `El menú del estudiante lleva a ${h}`);
  });

  // Mis evaluaciones: todas, y lo urgente primero.
  await N.goto(`${BASE}/plataforma/estudiante/evaluaciones.html`, { waitUntil: 'domcontentloaded' });
  await N.waitForSelector('#page:not(.hidden)', { timeout: 30000 });
  await N.waitForTimeout(2500);
  const evs = await N.evaluate(() => {
    const filas = [...document.querySelectorAll('#lista .list-item')];
    const estado = (t) => /a medias/.test(t) ? 0 : /sin empezar/.test(t) ? 1
      : /en revisión/.test(t) ? 2 : 3;
    const orden = filas.map((f) => estado(f.textContent));
    return {
      n: filas.length,
      ordenadas: orden.every((v, i) => i === 0 || orden[i - 1] <= v),
      // Cada una dice de qué programa es: la lista junta varios.
      conPrograma: filas.filter((f) => f.querySelectorAll('.s').length >= 2).length,
    };
  });
  a.comprobar(evs.n > 0, `Sus evaluaciones salen todas juntas (${evs.n})`);
  a.comprobar(evs.ordenadas,
    'Y en el orden en que hay que ocuparse de ellas: lo empezado, lo pendiente, lo entregado, lo calificado');
  a.comprobar(evs.conPrograma === evs.n, 'Cada una dice a qué programa pertenece');

  // El calendario: el mes, el día y la clase entera.
  await N.goto(`${BASE}/plataforma/estudiante/calendario.html`, { waitUntil: 'domcontentloaded' });
  await N.waitForSelector('#cal .day', { timeout: 30000 });
  await N.waitForTimeout(2000);
  const clases = await N.locator('#cal [data-clase]').count();
  a.comprobar(await N.locator('#cal .day[data-dia]').count() >= 28,
    'El calendario pinta el mes entero');
  if (clases) {
    await N.locator('#cal [data-clase]').first().click();
    await N.waitForSelector('.modal', { timeout: 10000 });
    await N.waitForTimeout(800);
    const ficha = await N.evaluate(() => {
      const t = document.querySelector('.modal').textContent.replace(/\s+/g, ' ');
      return {
        cuando: /Cuándo/.test(t), programa: /Programa/.test(t),
        // A una presencial se va y a una en línea se entra: tiene que decir
        // una de las dos cosas, o la clase no sirve para presentarse.
        donde: /Dónde|Para entrar|Grabación/.test(t),
      };
    });
    a.comprobar(ficha.cuando && ficha.programa && ficha.donde,
      `Abrir una clase dice cuándo es, de qué programa y dónde o cómo entrar (${JSON.stringify(ficha)})`);
    await N.evaluate(() => document.querySelectorAll('.modal-bg').forEach((x) => x.remove()));
  } else {
    a.comprobar(true, 'Esta cuenta no tiene clases programadas que abrir');
  }

  // La ayuda: preguntas frecuentes que se buscan, y un sitio donde escribir.
  await N.goto(`${BASE}/plataforma/estudiante/ayuda.html`, { waitUntil: 'domcontentloaded' });
  await N.waitForSelector('#faqs .faq', { timeout: 30000 });
  await N.waitForTimeout(800);
  const todas = await N.locator('#faqs .faq').count();
  await N.fill('#q', 'certificado');
  await N.waitForTimeout(400);
  const filtradas = await N.locator('#faqs .faq').count();
  a.comprobar(todas > 4 && filtradas > 0 && filtradas < todas,
    `Las preguntas frecuentes se buscan (${filtradas} de ${todas} hablan de certificados)`);
  a.comprobar(await N.locator('#fNuevo #tDesc').count() === 1,
    'Y si eso no resuelve su caso, puede escribirnos sin salir de la plataforma');

  /* Lo que el equipo se escribe entre sí NO llega al estudiante. La política de
     la base dejaba leer todos los mensajes del ticket propio, incluidas las
     notas marcadas «interno», y el equipo las escribe dando por hecho lo
     contrario. Se comprueba contra la base, no contra la pantalla: esconderlo
     en el navegador no serviría de nada. */
  const notas = await conLaBase(N, async (sb) => {
    const { data } = await sb.from('cem_ticket_messages').select('interno').limit(200);
    return { total: (data || []).length, internas: (data || []).filter((x) => x.interno).length };
  });
  a.comprobar(notas.internas === 0,
    `Una nota interna del equipo no la lee quien abrió la consulta (${notas.internas} de ${notas.total} visibles)`);

  a.comprobar(N.errores.length === 0,
    `Las pantallas nuevas del estudiante no lanzan errores ${JSON.stringify(N.errores.slice(0, 2))}`);

  a.comprobar(A.errores.length === 0, `Sin errores en administración ${JSON.stringify(A.errores.slice(0, 2))}`);
  await A.close();
  await E.close();
  await N.close();
  return a;
}
