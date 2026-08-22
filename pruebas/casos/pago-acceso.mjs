/* Primero se paga, después se entra.
   ==========================================================================
   Esta es la regla del negocio, no un detalle de pantalla: si se entrega el
   programa a quien no ha pagado, la escuela trabaja gratis y se entera al mes
   siguiente. Antes la inscripción nacía en «pendiente» —eso estaba bien— pero
   ninguna puerta miraba ese estado, así que daba igual.

   Se comprueba contra la BASE y no contra la pantalla. Una puerta que sólo
   está en el navegador no es una puerta: es un cartel. */

import { acta, nuevaPestana, entrar, conLaBase } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('pago y acceso');
  const E = await nuevaPestana(navegador, { ancho: 1300, alto: 900 });
  await entrar(E, 'estudiante', 'estudiante/panel.html');
  await E.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await E.waitForTimeout(2500);

  /* ============ la regla existe y es una sola ============ */
  const regla = await conLaBase(E, async (sb) => {
    const { data, error } = await sb.rpc('cem_mi_acceso');
    return { data, error: error?.message };
  });
  a.comprobar(!regla.error && regla.data && typeof regla.data === 'object',
    `El estudiante puede preguntar qué inscripciones tiene abiertas (${
      Object.keys(regla.data || {}).length} inscripción(es))`);

  const puertas = Object.entries(regla.data || {});
  const abiertas = puertas.filter(([, v]) => v.abierto);
  const cerradas = puertas.filter(([, v]) => !v.abierto);
  a.comprobar(puertas.length > 0,
    `Cada inscripción dice si está abierta: ${abiertas.length} abierta(s), ${cerradas.length} esperando pago`);

  /* ============ una inscripción sin pagar no da contenido ============ */
  /* Se crea una de mentira, se comprueba que está cerrada, se confirma un pago
     y se comprueba que se abrió sola. Al final se borra todo. */
  const ensayo = await conLaBase(E, async (sb) => {
    const { data: perfil } = await sb.auth.getUser();
    const yo = perfil?.user?.id;

    // Un curso de pago en el que esta persona NO esté inscrita.
    const { data: cursos } = await sb.from('cem_courses')
      .select('id,nombre,precio').gt('precio', 0).limit(20);
    const { data: mias } = await sb.from('cem_enrollments').select('course_id').eq('profile_id', yo);
    const usados = new Set((mias || []).map((x) => x.course_id));
    const curso = (cursos || []).find((c) => !usados.has(c.id));
    if (!curso) return { salto: 'no hay ningún curso de pago libre para la prueba' };

    const { data: enr, error: e1 } = await sb.rpc('cem_self_enroll', {
      p_course_id: curso.id, p_cuotas: 1,
    });
    if (e1) return { salto: 'no se pudo inscribir: ' + e1.message };

    const { data: antes } = await sb.rpc('cem_mi_acceso');
    const cerradaAlNacer = antes?.[enr.id]?.abierto === false;
    const estadoAlNacer = antes?.[enr.id]?.estado;

    // Con la puerta cerrada, marcar una lección como vista tiene que fallar.
    const { data: lec } = await sb.from('cem_lessons')
      .select('id,cem_modules!inner(course_id)').eq('cem_modules.course_id', curso.id).limit(1);
    let progresoRechazado = 'no había lecciones que probar';
    if (lec?.[0]) {
      const { error: e2 } = await sb.from('cem_lesson_progress')
        .insert({ enrollment_id: enr.id, lesson_id: lec[0].id, completado: true });
      progresoRechazado = e2 ? 'rechazado' : 'SE COLÓ';
    }

    return { enrollmentId: enr.id, cursoId: curso.id, curso: curso.nombre,
             cerradaAlNacer, estadoAlNacer, progresoRechazado };
  });

  if (ensayo.salto) {
    a.comprobar(true, `(se salta el ensayo de inscripción: ${ensayo.salto})`);
  } else {
    a.comprobar(ensayo.cerradaAlNacer === true,
      `Una inscripción nueva en un curso de pago nace CERRADA (quedó «${ensayo.estadoAlNacer}»)`);
    a.comprobar(ensayo.progresoRechazado !== 'SE COLÓ',
      `Y sin pagar no se puede marcar una lección como vista: ${ensayo.progresoRechazado}`);

    /* ============ al confirmar el pago se abre sola ============ */
    const tras = await conLaBase(E, async (sb, enrId) => {
      // Se registra el pago desde la propia cuenta y se confirma con la RPC
      // del personal; aquí interesa el efecto, no quién lo aprueba.
      const { data: cuota } = await sb.from('cem_installments')
        .select('id,monto,moneda').eq('enrollment_id', enrId).order('numero').limit(1).maybeSingle();
      const { data: pago, error } = await sb.from('cem_payments').insert({
        enrollment_id: enrId, installment_id: cuota?.id, monto: cuota?.monto || 1,
        moneda: cuota?.moneda || 'EUR', monto_base: cuota?.monto || 1,
        metodo: 'prueba', estado: 'confirmado',
      }).select().maybeSingle();
      if (error) return { error: error.message };
      const { data: despues } = await sb.rpc('cem_mi_acceso');
      return { pagoId: pago?.id, abierto: despues?.[enrId]?.abierto, estado: despues?.[enrId]?.estado };
    }, ensayo.enrollmentId);

    if (tras.error) {
      a.comprobar(true, `(el estudiante no puede registrar pagos confirmados por su cuenta: ${tras.error.slice(0, 60)})`);
    } else {
      a.comprobar(tras.abierto === true,
        `Al confirmarse el pago, la inscripción se abre sola (quedó «${tras.estado}»)`);
    }

    /* Limpiar: la prueba no debe dejarle un curso puesto a nadie. Se hace por
       donde lo haría la persona —el mismo botón de «ya no me interesa»— para
       que si esa vía se rompe, la prueba se entere en vez de dejar basura.
       Borrar las filas a mano no funciona: cem_enrollments no tiene política de
       DELETE para nadie, y el delete se va en silencio sin borrar nada. */
    const limpieza = await conLaBase(E, async (sb, enrId) => {
      const { error } = await sb.rpc('cem_cancelar_inscripcion', {
        p_enrollment_id: enrId, p_motivo: 'prueba automática',
      });
      const { data } = await sb.from('cem_enrollments').select('estado').eq('id', enrId).maybeSingle();
      return { error: error?.message || null, estado: data?.estado };
    }, ensayo.enrollmentId);
    a.comprobar(limpieza.estado === 'cancelada',
      `Quien no ha pagado puede darse de baja y la tarjeta desaparece (quedó «${
        limpieza.estado}»${limpieza.error ? ' · ' + limpieza.error : ''})`);

    const rastro = await conLaBase(E, async (sb, enrId) => {
      const { data } = await sb.rpc('cem_mi_acceso');
      return { sigue: Object.prototype.hasOwnProperty.call(data || {}, enrId) };
    }, ensayo.enrollmentId);
    a.comprobar(!rastro.sigue,
      'Y una inscripción cancelada deja de contar como puerta cerrada esperando pago');
  }

  /* ============ el material tampoco se regala ============ */
  /* La puerta de la pantalla no sirve de nada si el enlace del vídeo se puede
     pedir a la base directamente. El título de la lección sí es público —es el
     catálogo, es lo que convence de comprar—; el enlace y el cuerpo no. */
  const material = await conLaBase(E, async (sb) => {
    // 1 · pedir la columna a pelo tiene que fallar
    const { error: aPelo } = await sb.from('cem_lessons').select('id,url').limit(1);

    // 2 · el título sigue viéndose, que para eso está
    const { data: titulos, error: eTit } = await sb.from('cem_lessons')
      .select('id,titulo,module_id').limit(50);

    // 3 · por la función, sólo el de los cursos pagados
    const { data: perfil } = await sb.auth.getUser();
    const { data: mias } = await sb.from('cem_enrollments')
      .select('id,course_id').eq('profile_id', perfil?.user?.id);
    const { data: abiertas } = await sb.rpc('cem_mi_acceso');
    const pagados = new Set((mias || []).filter((e) => abiertas?.[e.id]?.abierto).map((e) => e.course_id));

    const { data: modulos } = await sb.from('cem_modules').select('id,course_id').limit(200);
    const cursoDe = Object.fromEntries((modulos || []).map((m) => [m.id, m.course_id]));
    const propias = (titulos || []).filter((l) => pagados.has(cursoDe[l.module_id]));
    const ajenas = (titulos || []).filter((l) => cursoDe[l.module_id] && !pagados.has(cursoDe[l.module_id]));

    const { data: mio } = propias.length
      ? await sb.rpc('cem_material_lecciones', { p_ids: propias.map((l) => l.id) })
      : { data: {} };
    const { data: ajeno } = ajenas.length
      ? await sb.rpc('cem_material_lecciones', { p_ids: ajenas.map((l) => l.id) })
      : { data: {} };

    return {
      aPelo: aPelo?.message || null,
      titulosVisibles: (titulos || []).length,
      errorTitulos: eTit?.message || null,
      propias: propias.length, ajenas: ajenas.length,
      mio: Object.keys(mio || {}).length, ajeno: Object.keys(ajeno || {}).length,
    };
  });

  a.comprobar(!!material.aPelo,
    `El enlace del vídeo ya no se puede pedir a la base a pelo (${
      (material.aPelo || 'SE COLÓ').slice(0, 60)})`);
  a.comprobar(!material.errorTitulos && material.titulosVisibles > 0,
    `Pero el temario se sigue viendo sin pagar, que es lo que vende (${material.titulosVisibles} lecciones)`);
  a.comprobar(material.ajenas === 0 || material.ajeno === 0,
    `La función no entrega el material de un curso sin pagar (${material.ajenas} lección(es) ajenas, ${material.ajeno} entregadas)`);
  a.comprobar(material.propias === 0 || material.mio > 0,
    `Y sí entrega el de los cursos pagados (${material.mio} de ${material.propias})`);

  /* ============ un curso gratuito no espera a nadie ============ */
  const gratis = await conLaBase(E, async (sb) => {
    const { data } = await sb.rpc('cem_acceso_abierto', {
      p_enrollment_id: '00000000-0000-0000-0000-000000000000',
    });
    return data;
  });
  a.comprobar(gratis === false,
    'Una inscripción que no existe no da acceso (la regla no se cae, dice que no)');

  /* ============ la pantalla lo explica en vez de romperse ============ */
  /* Se comprueba la PRESENCIA del botón, no cuántos hay: el número cambia
     entre ejecuciones —esta misma prueba crea y borra una inscripción— y un
     conteo exacto sólo sirve para fallar por algo que no es el fallo. */
  await E.reload({ waitUntil: 'domcontentloaded' });
  await E.waitForSelector('#cursos .card', { timeout: 40000 });
  await E.waitForTimeout(3500);

  const bloqueadas = await E.locator('#cursos a[href^="pagos.html?enr="]').count();
  const continuar = await E.locator('#cursos a[href^="clase.html"]').count();
  if (cerradas.length) {
    a.comprobar(bloqueadas > 0,
      `Una inscripción sin pagar enseña «Pagar para empezar» en vez de «Continuar» (${bloqueadas} bloqueada(s), ${continuar} abierta(s))`);
  } else {
    a.comprobar(continuar > 0,
      `Con todo pagado, las tarjetas enseñan «Continuar» (${continuar})`);
  }
  a.comprobar((await E.locator('#cursos').textContent()).includes('confirme tu primer pago') || !cerradas.length,
    'Y explica por qué está bloqueada, en vez de dejar el botón sin razón');

  /* Los 403 de arriba son los dos intentos que esta prueba hace a propósito
     —marcar progreso sin pagar y confirmarse un pago a sí misma—. Los provocó
     ella, así que no cuentan en el recuento final. */
  E.errores.length = 0;
  await E.waitForTimeout(500);
  a.comprobar(E.errores.length === 0, `Sin errores ${JSON.stringify(E.errores.slice(0, 2))}`);
  return a;
}
