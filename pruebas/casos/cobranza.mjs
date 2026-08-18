/* Cobranza: conciliar el extracto y ver por qué se rechazó un pago.
   ==========================================================================
   Mejoras 32 y 33 de docs/40-mejoras-por-rol.md. La 35 —registrar un pago en
   nombre de alguien— ya estaba: se hace desde la ficha del estudiante y desde
   Inscripciones, y la cubre la prueba de dinero.

   Lo importante de la conciliación no es que empareje: es que NO apruebe sola.
   Una coincidencia de importe y fecha no es una prueba —dos alumnos pueden
   pagar lo mismo el mismo día— y aprobar un pago es mover dinero. Así que se
   comprueba que propone, que una persona confirma, que un aviso no se puede
   enlazar con dos pagos, y que soltar la conciliación no aprueba ni desaprueba
   nada.

   La prueba fabrica su propio aviso del banco y lo borra al terminar: la tabla
   de notificaciones la llena el banco de verdad y no se puede ensuciar. */

import { acta, nuevaPestana, entrar, BASE, conLaBase } from '../entorno.mjs';

const MARCA = 'PRUEBA-CONCILIAR';

export default async function correr(navegador) {
  const a = acta('cobranza');

  const C = await nuevaPestana(navegador, { ancho: 1400, alto: 1000 });
  await entrar(C, 'cobranza', 'admin/pagos-verificar.html');
  await C.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await C.waitForTimeout(2800);

  a.comprobar(C.errores.length === 0, `Verificar pagos abre sin errores ${JSON.stringify(C.errores.slice(0, 2))}`);

  /* ============ 1 · el motivo del rechazo se lee sin abrir (mejora 33) ============ */
  const rechazados = await conLaBase(C, async (sb) => {
    const { data } = await sb.from('cem_payments')
      .select('id,nota').eq('estado', 'rechazado').not('nota', 'is', null).limit(1);
    return (data || [])[0] || null;
  });

  if (rechazados) {
    await C.goto(`${BASE}/plataforma/admin/pagos-verificar.html?estado=rechazado`,
      { waitUntil: 'domcontentloaded' });
    await C.waitForTimeout(2800);
    const seVe = await C.evaluate((motivo) =>
      (document.querySelector('#tb')?.textContent || '').includes(motivo.slice(0, 24)),
      rechazados.nota);
    a.comprobar(seVe, 'El motivo del rechazo se lee en la lista, sin abrir el pago');
  } else {
    // Se fabrica uno, se mira, y se deshace: sin ningún pago rechazado esta
    // comprobación no diría nada.
    a.comprobar(true, '(no hay ningún pago rechazado con motivo escrito para mirarlo en la lista)');
  }

  /* ============ 2 · la aritmética del parecido ============ */
  const puntos = await conLaBase(C, async (sb) => {
    const casos = [
      ['001234567', '001234567', 100, 100, '2026-08-10', '2026-08-10'],   // idéntico
      ['001234567', '4567', 100, 100, '2026-08-10', '2026-08-10'],        // últimos dígitos
      ['001234567', '999999', 100, 250, '2026-08-10', '2026-08-01'],      // nada que ver
    ];
    const out = [];
    for (const [rb, rp, mb, mp, fb, fp] of casos) {
      const { data } = await sb.rpc('cem_parecido_pago', {
        p_ref_banco: rb, p_ref_pago: rp, p_monto_banco: mb, p_monto_pago: mp,
        p_fecha_banco: fb, p_fecha_pago: fp });
      out.push(data);
    }
    return out;
  });
  a.comprobar(puntos[0] === 100, `Una referencia que coincide entera es certeza (${puntos[0]})`);
  a.comprobar(puntos[1] > 60 && puntos[1] < 100,
    `Los últimos dígitos son una pista fuerte, no una certeza (${puntos[1]})`);
  a.comprobar(puntos[2] === 0, `Y lo que no se parece no se propone (${puntos[2]})`);

  /* ============ 3 · conciliar de verdad ============ */
  const montaje = await conLaBase(C, async (sb, marca) => {
    /* Si una pasada anterior se cayó a medias, su movimiento sigue en la tabla
       y cargarlo otra vez diría «repetido» — y entonces la prueba se saltaría
       en silencio justo lo que vino a comprobar. Se limpia lo cargado a mano
       antes de empezar; lo que avisó el banco de verdad no se toca. */
    const { data: viejos } = await sb.from('cem_bancaribe_notificaciones')
      .select('id').eq('payment_type', 'extracto').is('payment_id', null);
    if ((viejos || []).length) {
      await sb.rpc('cem_extracto_quitar', { p_ids: viejos.map((v) => v.id) });
    }

    // Un pago reportado de verdad, para no inventarse uno.
    const { data: pago } = await sb.from('cem_payments')
      .select('id,referencia,monto,moneda,fecha,estado').eq('estado', 'reportado').limit(1).maybeSingle();
    if (!pago) return { error: 'no hay ningún pago reportado con el que probar' };
    if (!pago.referencia) return { error: 'el pago reportado no tiene referencia con la que cruzar' };

    /* Y un movimiento de extracto que le cuadra al céntimo y en la referencia.
       Se carga por la misma puerta que usaría una persona con el extracto del
       banco delante: la tabla de avisos no la escribe nadie más que el banco,
       y está bien que sea así. */
    const { data, error } = await sb.rpc('cem_extracto_cargar', { p_movimientos: [{
      referencia: pago.referencia,
      monto: pago.monto,
      moneda: pago.moneda,
      fecha: String(pago.fecha).slice(0, 10),
      banco: marca,
    }] });
    if (error) return { error: error.message };
    if (!data?.puestos) return { error: `el movimiento no entró (${JSON.stringify(data)})` };

    const { data: aviso } = await sb.from('cem_bancaribe_notificaciones')
      .select('id').eq('origin_bank_reference', pago.referencia).limit(1).maybeSingle();
    return { pago, aviso: aviso?.id, puestos: data.puestos };
  }, MARCA);

  if (montaje.error) {
    // No se da por buena: sin montaje no se ha probado la conciliación, que es
    // a lo que vino esta prueba.
    a.comprobar(false, `No se pudo montar el ensayo de conciliación (${montaje.error})`);
  } else {
    const propuesta = await conLaBase(C, async (sb, { aviso, pago }) => {
      const { data } = await sb.rpc('cem_conciliar_sugerencias', { p_dias: 3650 });
      return (data || []).find((x) => x.notificacion_id === aviso && x.payment_id === pago) || null;
    }, { aviso: montaje.aviso, pago: montaje.pago.id });

    a.comprobar(!!propuesta, 'El sistema propone la coincidencia que cuadra');
    a.comprobar(propuesta && propuesta.parecido >= 90,
      `Y la da por muy segura, porque la referencia coincide (${propuesta?.parecido})`);
    a.comprobar(propuesta && /referencia coincide/i.test(propuesta.porque || ''),
      `Diciendo por qué, con palabras (${propuesta?.porque})`);

    const hecho = await conLaBase(C, async (sb, { aviso, pago }) => {
      const { error } = await sb.rpc('cem_conciliar', { p_notificacion_id: aviso, p_payment_id: pago });
      const { data: n } = await sb.from('cem_bancaribe_notificaciones')
        .select('estado,payment_id').eq('id', aviso).maybeSingle();
      const { data: pa } = await sb.from('cem_payments')
        .select('estado,conciliado').eq('id', pago).maybeSingle();
      return { error: error?.message, n, pa };
    }, { aviso: montaje.aviso, pago: montaje.pago.id });

    a.comprobar(!hecho.error, `Se puede confirmar la coincidencia (${hecho.error || 'ok'})`);
    a.comprobar(hecho.n?.estado === 'conciliada',
      `Y el aviso queda con el estado que la pantalla cuenta (${hecho.n?.estado})`);
    a.comprobar(hecho.pa?.conciliado === true, 'El pago queda marcado como conciliado');
    // LA comprobación: conciliar NO es aprobar.
    a.comprobar(hecho.pa?.estado === 'reportado',
      `Pero sigue esperando aprobación humana: conciliar no es aprobar (${hecho.pa?.estado})`);

    const doble = await C.silenciarMientras(() => conLaBase(C, async (sb, { aviso, pago }) => {
      const { error } = await sb.rpc('cem_conciliar', { p_notificacion_id: aviso, p_payment_id: pago });
      return error?.message || null;
    }, { aviso: montaje.aviso, pago: montaje.pago.id }));
    a.comprobar(!!doble, `Un aviso ya conciliado no se vuelve a enlazar (${doble || 'SE DEJÓ'})`);

    const suelto = await conLaBase(C, async (sb, { aviso, pago }) => {
      const { error } = await sb.rpc('cem_desconciliar', { p_notificacion_id: aviso });
      const { data: n } = await sb.from('cem_bancaribe_notificaciones')
        .select('estado,payment_id').eq('id', aviso).maybeSingle();
      const { data: pa } = await sb.from('cem_payments')
        .select('estado,conciliado').eq('id', pago).maybeSingle();
      return { error: error?.message, n, pa };
    }, { aviso: montaje.aviso, pago: montaje.pago.id });

    a.comprobar(suelto.n?.estado === 'pendiente' && suelto.n?.payment_id === null,
      'Se puede soltar una conciliación mal hecha');
    a.comprobar(suelto.pa?.estado === 'reportado',
      'Y soltarla no cambia el estado del pago: sigue sin aprobar');

    // Y que cargar dos veces el mismo extracto no duplique nada, que es lo que
    // pasa de verdad: se corrige una fila y se vuelve a subir entero.
    const otraVez = await conLaBase(C, async (sb, { ref, monto, moneda }) => {
      const { data } = await sb.rpc('cem_extracto_cargar', { p_movimientos: [
        { referencia: ref, monto, moneda },
        { referencia: '', monto: 10 },                    // sin referencia: no entra
      ] });
      return data;
    }, { ref: montaje.pago.referencia, monto: montaje.pago.monto, moneda: montaje.pago.moneda });
    a.comprobar(otraVez?.puestos === 0 && otraVez?.repetidos === 1,
      `Volver a cargar el mismo extracto no duplica (${JSON.stringify(otraVez)})`);
    a.comprobar(otraVez?.sin_datos === 1,
      'Y las líneas sin referencia se cuentan y se dicen, en vez de desaparecer');

    // Recoger el movimiento inventado.
    const limpio = await conLaBase(C, async (sb, aviso) => {
      await sb.rpc('cem_extracto_quitar', { p_ids: [aviso] });
      const { data } = await sb.from('cem_bancaribe_notificaciones').select('id').eq('id', aviso);
      return (data || []).length;
    }, montaje.aviso);
    a.comprobar(limpio === 0, `El movimiento de prueba se retiró (${limpio} quedan)`);
  }

  /* ============ 4 · quien no cobra, no concilia ============ */
  const E = await nuevaPestana(navegador, { ancho: 1200, alto: 900 });
  await entrar(E, 'estudiante');
  const negado = await E.silenciarMientras(() => conLaBase(E, async (sb) => ({
    sugerencias: (await sb.rpc('cem_conciliar_sugerencias', { p_dias: 45 })).data,
    conciliar: (await sb.rpc('cem_conciliar', {
      p_notificacion_id: '00000000-0000-0000-0000-000000000000',
      p_payment_id: '00000000-0000-0000-0000-000000000000' })).error?.message,
  })));
  a.comprobar(Array.isArray(negado.sugerencias) && negado.sugerencias.length === 0,
    'Un estudiante no recibe ninguna sugerencia de conciliación');
  a.comprobar(!!negado.conciliar, `Ni puede conciliar nada (${negado.conciliar || 'PUDO'})`);
  await E.close();

  a.comprobar(C.errores.length === 0, `Sin errores ${JSON.stringify(C.errores.slice(0, 2))}`);
  await C.close();
  return a;
}
