/* El reparto a los socios: lo que no se puede negociar.
   ==========================================================================
   Este módulo se rompe distinto a los demás. Cuando falla no sale un error en
   pantalla: sale un socio convencido de que le pagaron de menos. Y esa
   discusión no se gana explicando, se gana mostrando de dónde sale cada
   número — así que lo que hay que probar no es que la pantalla cargue, sino
   que las cifras aguanten que alguien las revise con una calculadora.

   Dos decisiones sobre CÓMO se prueba, que son la mitad del trabajo:

   · No se inventan pagos. Insertar un pago confirmado dispara tres cosas: se
     le activa la inscripción a un estudiante de verdad y se le encola un
     correo. Una prueba no puede escribirle a nadie. Así que la ronda se monta
     sobre los pagos que YA existen y lo que se espera se calcula a partir de
     ellos, no a partir de un número escrito a mano que envejecería mal.

   · Sí se inventan gastos, socios y rondas, porque no disparan nada — y se
     borran al final, pase lo que pase. Restos de una prueba en la base de
     verdad son números falsos en la pantalla de alguien.

   Las reglas que se comprueban:

   1 · Sólo cuentan los pagos CONFIRMADOS. Repartir sobre lo reportado y sin
       verificar es prometer plata que no entró.
   2 · Las líneas se comparan por nombre EXACTO. Agrupar «lo parecido» le
       acredita a unos socios lo que generaron otros, y no lo nota nadie hasta
       que uno saca la cuenta a mano.
   3 · El último día del rango cuenta ENTERO. `fecha` lleva hora: comparar con
       «menor o igual» la corta a medianoche y se pierden en silencio los
       pagos de la última jornada.
   4 · Lo que se debe NUNCA es negativo, y lo pagado de más no se cruza de una
       línea a otra.
   5 · Eliminar un pago devuelve el saldo solo. Es la ventaja de calcular en
       vez de guardar.
   6 · Dos rondas no se solapan: solapadas, las mismas ventas se cuentan dos
       veces y el reparto sale al doble.
   7 · Una reinversión no tiene dueño.
*/

import { acta, nuevaPestana, entrar, conLaBase } from '../entorno.mjs';

const REF = 'PRUEBA-REPARTO';

export default async function correr(navegador) {
  const a = acta('inversionistas');

  const D = await nuevaPestana(navegador, { ancho: 1340, alto: 1000 });
  await entrar(D, 'admin', 'admin/inversionistas.html');
  await D.waitForSelector('#page:not(.hidden)', { timeout: 40000 });

  const limpiar = () => conLaBase(D, async (sb, ref) => {
    const { data: inv } = await sb.from('cem_inversores').select('id').like('nota', `${ref}%`);
    const ids = (inv || []).map((x) => x.id);
    if (ids.length) {
      await sb.from('cem_liquidaciones').delete().in('inversor_id', ids);
      await sb.from('cem_aportes').delete().in('inversor_id', ids);
      await sb.from('cem_ronda_partes').delete().in('inversor_id', ids);
    }
    await sb.from('cem_aportes').delete().like('nota', `${ref}%`);
    await sb.from('cem_rondas').delete().like('nota', `${ref}%`);
    if (ids.length) await sb.from('cem_inversores').delete().in('id', ids);
    await sb.from('cem_gastos').delete().like('referencia', `${ref}%`);
  }, REF);

  await limpiar();

  try {
    /* ============ qué hay de verdad en la casa ============
       Se mira ANTES de tocar nada, y de aquí salen las fechas de la ronda y
       los números que se van a exigir. Escritos a mano envejecerían: en cuanto
       entrara un pago más, la prueba fallaría sin que nada estuviera roto. */
    const real = await conLaBase(D, async (sb) => {
      const { data } = await sb.from('cem_payments')
        .select('fecha, monto_base, estado, cem_enrollments(cem_courses(tipo))')
        .eq('estado', 'confirmado').not('monto_base', 'is', null);
      const filas = (data || []).map((p) => ({
        dia: String(p.fecha).slice(0, 10),
        base: Number(p.monto_base),
        linea: p.cem_enrollments?.cem_courses?.tipo,
      })).filter((x) => x.linea);
      if (!filas.length) return { vacio: true };
      const dias = filas.map((x) => x.dia).sort();
      const desde = dias[0], hasta = dias[dias.length - 1];
      const porLinea = {};
      for (const f of filas) porLinea[f.linea] = (porLinea[f.linea] || 0) + f.base;
      return {
        desde, hasta,
        total: Number(filas.reduce((s, x) => s + x.base, 0).toFixed(2)),
        // Lo del último día: es exactamente lo que se perdería si el rango
        // cortara a medianoche en vez de abarcar el día entero.
        ultimoDia: Number(filas.filter((x) => x.dia === hasta)
          .reduce((s, x) => s + x.base, 0).toFixed(2)),
        porLinea,
        lineas: Object.keys(porLinea),
      };
    });

    if (real.vacio) {
      a.comprobar(false, 'Hacen falta pagos confirmados para poder probar el reparto');
      return a;
    }

    const laLinea = real.lineas[0];           // una que sí tiene ingresos
    const otraLinea = real.lineas[1] || null; // otra distinta, para el gasto compartido

    /* ============ el montaje ============ */
    const montaje = await conLaBase(D, async (sb, { ref, desde, hasta, linea }) => {
      const { data: ana } = await sb.from('cem_inversores')
        .insert({ nombre: 'Ana (prueba)', color: '#e11d48', nota: `${ref} socia` })
        .select('id').single();
      const { data: beto } = await sb.from('cem_inversores')
        .insert({ nombre: 'Beto (prueba)', color: '#0ea5e9', nota: `${ref} socio` })
        .select('id').single();
      const { data: ronda } = await sb.from('cem_rondas')
        .insert({ nombre: 'Ronda de prueba', desde, hasta, nota: `${ref} ronda` })
        .select('id').single();
      await sb.from('cem_ronda_partes').insert([
        { ronda_id: ronda.id, inversor_id: ana.id, linea, pct: 50, aporte: 1000 },
        { ronda_id: ronda.id, inversor_id: beto.id, linea, pct: 30, aporte: 600 },
      ]);
      return { ana: ana.id, beto: beto.id, ronda: ronda.id };
    }, { ref: REF, desde: real.desde, hasta: real.hasta, linea: laLinea });

    const pedir = async () => {
      const r = await conLaBase(D, async (sb, ronda) => {
        const { data, error } = await sb.rpc('cem_reparto', { p_ronda: ronda });
        return error ? { error: error.message, rondas: [] } : data;
      }, montaje.ronda);
      return (r.rondas || [])[0];
    };
    const deLinea = (ronda, linea) => (ronda?.lineas || []).find((l) => l.linea === linea);
    const deSocio = (linea, id) => (linea?.partes || []).find((p) => p.inversor_id === id);

    /* ============ 1 y 3 · qué entra en la ronda ============ */
    let r = await pedir();
    const sumaIngresos = Number((r?.lineas || [])
      .reduce((s, l) => s + Number(l.ingreso), 0).toFixed(2));
    a.comprobar(sumaIngresos === real.total,
      `Entra todo lo confirmado del período y nada más (${sumaIngresos} de ${real.total})`);

    /* La regla que se pierde en silencio. Los pagos llevan hora, así que un
       rango que cortara a medianoche perdería el último día entero. Si ese día
       no tuviera pagos, esta comprobación no distinguiría nada — y una prueba
       que no puede fallar no prueba: por eso se dice. */
    a.comprobar(real.ultimoDia > 0,
      `El último día del período tiene pagos, así que la comprobación del borde sirve (${real.ultimoDia})`);
    a.comprobar(sumaIngresos === real.total && real.ultimoDia > 0,
      `El último día cuenta entero: sin él faltarían ${real.ultimoDia}`);

    const conIngreso = deLinea(r, laLinea);
    a.comprobar(Number(conIngreso?.ingreso) === Number(real.porLinea[laLinea].toFixed(2)),
      `Cada línea se queda con lo suyo, comparando el nombre exacto (${laLinea}: ${conIngreso?.ingreso})`);

    const reportadoCuenta = await conLaBase(D, async (sb) => {
      const { count } = await sb.from('cem_payments')
        .select('id', { count: 'exact', head: true }).eq('estado', 'reportado');
      return count || 0;
    });
    a.comprobar(sumaIngresos === real.total,
      `Lo reportado y sin verificar no es ganancia de nadie (${reportadoCuenta} pago(s) fuera)`);

    /* ============ 2 · el gasto compartido se parte según su mapa ============ */
    if (otraLinea) {
      await conLaBase(D, async (sb, { ref, dia, a: l1, b: l2 }) => {
        await sb.from('cem_gastos').insert([
          { fecha: dia, concepto: 'Profesor (prueba)', monto: 100, moneda: 'EUR',
            referencia: `${ref}-1`, linea: l1 },
          { fecha: dia, concepto: 'Publicidad (prueba)', monto: 200, moneda: 'EUR',
            referencia: `${ref}-2`, reparto: { [l1]: 50, [l2]: 50 } },
        ]);
      }, { ref: REF, dia: real.desde, a: laLinea, b: otraLinea });

      r = await pedir();
      const l1 = deLinea(r, laLinea), l2 = deLinea(r, otraLinea);
      a.comprobar(Number(l1?.gastos) === 200,
        `El gasto propio y la mitad del compartido caen en su línea (${l1?.gastos} de 300)`);
      a.comprobar(Number(l2?.gastos) === 100,
        `Y la otra mitad en la otra, exacta y no a ojo (${l2?.gastos})`);
      a.comprobar(Number(l1?.ganancia) === Number((Number(l1.ingreso) - 200).toFixed(2)),
        `La ganancia es lo que entró menos lo que costó esa línea (${l1?.ganancia})`);
    }

    /* Un gasto sin clasificar no se reparte a nadie: sale en su informe. */
    await conLaBase(D, async (sb, { ref, dia }) => sb.from('cem_gastos').insert(
      { fecha: dia, concepto: 'Sin clasificar (prueba)', monto: 999, moneda: 'EUR',
        referencia: `${ref}-3` }), { ref: REF, dia: real.desde });
    r = await pedir();
    const conGastoSuelto = deLinea(r, laLinea);
    a.comprobar(Number(conGastoSuelto?.gastos) === (otraLinea ? 200 : 0),
      `Un gasto sin línea no se le carga a nadie: se queda fuera (${conGastoSuelto?.gastos})`);
    const suelto = await conLaBase(D, async (sb) => {
      const { data } = await sb.rpc('cem_reparto_sin_clasificar');
      return (data?.gastos || []).some((g) => g.concepto === 'Sin clasificar (prueba)');
    });
    a.comprobar(suelto === true, 'Pero aparece en la lista de lo que falta por clasificar');

    /* ============ los porcentajes ============ */
    r = await pedir();
    const linea = deLinea(r, laLinea);
    const ganancia = Number(linea.ganancia);
    const ana = deSocio(linea, montaje.ana), beto = deSocio(linea, montaje.beto);
    a.comprobar(Number(ana.le_toca) === Number((ganancia * 0.5).toFixed(2)),
      `A Ana le toca su 50% (${ana.le_toca} de ${ganancia})`);
    a.comprobar(Number(beto.le_toca) === Number((ganancia * 0.3).toFixed(2)),
      `A Beto su 30% (${beto.le_toca})`);
    a.comprobar(Number(linea.casa) === Number((ganancia - Number(ana.le_toca) - Number(beto.le_toca)).toFixed(2)),
      `Y lo que no se reparte se lo queda la casa, a la vista (${linea.casa})`);

    /* ============ 4 y 5 · pagar, pasarse y deshacer ============ */
    if (ganancia > 20) {
      const mitad = Number((Number(ana.le_toca) / 2).toFixed(2));
      const pago1 = await conLaBase(D, async (sb, { m, linea: l, monto }) => {
        const { data, error } = await sb.rpc('cem_liquidacion_guardar', {
          p_pagos: [{ ronda_id: m.ronda, inversor_id: m.ana, linea: l, monto,
                      moneda: 'EUR', cartera_id: 'efectivo_eur' }],
          p_nota: 'Prueba a cuenta',
        });
        return error ? { error: error.message } : data;
      }, { m: montaje, linea: laLinea, monto: mitad });
      a.comprobar(pago1.ok === true, `Se puede pagar a cuenta, sin cerrar la deuda ${pago1.error || ''}`);

      r = await pedir();
      const l = deLinea(r, laLinea);
      a.comprobar(Number(deSocio(l, montaje.ana).le_debo) === Number((Number(ana.le_toca) - mitad).toFixed(2)),
        `Lo pendiente baja por lo pagado y sólo por eso (${deSocio(l, montaje.ana).le_debo})`);
      a.comprobar(Number(deSocio(l, montaje.beto).le_debo) === Number(beto.le_toca),
        'Y lo del otro socio no se mueve');

      // Pasarse: se avisa, se deja, y sale como saldo a favor sin cruzar líneas.
      const pago2 = await conLaBase(D, async (sb, { m, linea: lin, monto }) => {
        const { data, error } = await sb.rpc('cem_liquidacion_guardar', {
          p_pagos: [{ ronda_id: m.ronda, inversor_id: m.ana, linea: lin, monto,
                      moneda: 'EUR', cartera_id: 'efectivo_eur' }],
          p_nota: 'Prueba de más',
        });
        return error ? { error: error.message } : data;
      }, { m: montaje, linea: laLinea, monto: Number((Number(ana.le_toca) - mitad + 50).toFixed(2)) });
      a.comprobar((pago2.avisos || []).some((x) => x.tipo === 'de_mas'),
        'Pagar de más avisa, pero deja hacerlo: a veces es a propósito');

      r = await pedir();
      const l2 = deLinea(r, laLinea);
      a.comprobar(Number(deSocio(l2, montaje.ana).le_debo) === 0,
        `Lo que se debe nunca baja de cero (${deSocio(l2, montaje.ana).le_debo})`);
      a.comprobar(Number(deSocio(l2, montaje.ana).a_favor) === 50,
        `Lo pagado de más sale aparte, como saldo a favor (${deSocio(l2, montaje.ana).a_favor})`);
      a.comprobar(Number(deSocio(l2, montaje.beto).le_debo) === Number(beto.le_toca),
        'Y el saldo a favor de una NO se resta de lo que se le debe al otro');

      // Regla 5: al eliminar, el saldo vuelve solo.
      const idPago = await conLaBase(D, async (sb, lote) => {
        const { data } = await sb.from('cem_liquidaciones').select('id').eq('lote', lote).limit(1);
        return data?.[0]?.id;
      }, pago2.lote);
      const borrado = await conLaBase(D, async (sb, id) => {
        const { error } = await sb.rpc('cem_liquidacion_eliminar', { p_id: id });
        return error ? error.message : null;
      }, idPago);
      a.comprobar(!borrado, `Un pago cargado mal se puede eliminar ${borrado || ''}`);

      r = await pedir();
      const l3 = deLinea(r, laLinea);
      a.comprobar(Number(deSocio(l3, montaje.ana).le_debo) === Number((Number(ana.le_toca) - mitad).toFixed(2)),
        `Y lo pendiente vuelve a subir solo (${deSocio(l3, montaje.ana).le_debo})`);
      a.comprobar(Number(deSocio(l3, montaje.ana).a_favor) === 0,
        'Con el saldo a favor desapareciendo con él');
    } else {
      a.comprobar(false, `Hace falta una línea con ganancia para probar los pagos (${ganancia})`);
    }

    /* ============ 6 · dos rondas no se solapan ============ */
    const solape = await conLaBase(D, async (sb, { ref, desde, hasta }) => {
      const { error } = await sb.from('cem_rondas').insert({
        nombre: 'Solapada', desde, hasta, nota: `${ref} solape` });
      return error ? error.message : null;
    }, { ref: REF, desde: real.desde, hasta: real.hasta });
    a.comprobar(!!solape,
      `Una ronda que pisa a otra no se puede guardar (${solape ? 'rechazada' : 'SE GUARDÓ'})`);

    /* Y abrir una nueva cierra la anterior el día antes, sin que haya que
       acordarse. Las fechas van MUY por delante de todo lo demás a propósito:
       una ronda sin cerrar se extiende hasta el infinito por arriba, así que
       una abierta en el pasado chocaría con la ronda de prueba de más arriba
       —que es justo lo que debe pasar, pero aquí no es lo que se mide—. */
    const cierre = await conLaBase(D, async (sb, ref) => {
      /* Abrir una ronda cierra TODAS las que estuvieran abiertas, que es lo
         correcto y también un peligro para esta prueba: si la casa tuviera una
         ronda de verdad abierta, se la cerraría. Se anotan antes y se
         devuelven a como estaban al terminar. */
      const { data: ajenas } = await sb.from('cem_rondas')
        .select('id').is('hasta', null).not('nota', 'like', `${ref}%`);

      const { data: abierta, error: alAbrir } = await sb.from('cem_rondas')
        .insert({ nombre: 'Abierta de prueba', desde: '2029-06-01', nota: `${ref} abierta` })
        .select('id').single();
      if (alAbrir) return { error: alAbrir.message, ajenas: (ajenas || []).length };

      const { error } = await sb.rpc('cem_ronda_guardar', {
        p_nombre: 'Siguiente de prueba', p_desde: '2029-09-01',
        p_nota: `${ref} siguiente`, p_partes: [] });
      const { data: antes } = await sb.from('cem_rondas').select('hasta').eq('id', abierta.id).single();

      let devueltas = 0;
      for (const x of (ajenas || [])) {
        const { error: alDevolver } = await sb.from('cem_rondas')
          .update({ hasta: null }).eq('id', x.id);
        if (!alDevolver) devueltas++;
      }
      return { error: error?.message, hasta: antes?.hasta,
               ajenas: (ajenas || []).length, devueltas };
    }, REF);
    a.comprobar(cierre.ajenas === cierre.devueltas || !cierre.ajenas,
      `Las rondas de la casa quedaron como estaban (${cierre.devueltas || 0} de ${cierre.ajenas || 0})`);
    a.comprobar(cierre.hasta === '2029-08-31',
      `Al abrir una ronda, la anterior se cierra el día antes (${cierre.hasta}) ${cierre.error || ''}`);

    /* ============ 7 · una reinversión no tiene dueño ============ */
    const malCapital = await conLaBase(D, async (sb, m) => {
      const { error } = await sb.rpc('cem_aporte_guardar', {
        p_concepto: 'Reinversión con dueño (prueba)', p_monto: 500,
        p_tipo_capital: 'reinversion', p_inversor_id: m.ana, p_moneda: 'EUR' });
      return error ? error.message : null;
    }, montaje);
    a.comprobar(!!malCapital,
      `Una reinversión no se le puede acreditar a un socio (${malCapital ? 'rechazada' : 'SE GUARDÓ'})`);

    const capital = await conLaBase(D, async (sb, { m, ref }) => {
      await sb.rpc('cem_aporte_guardar', { p_concepto: 'Capital de prueba', p_monto: 1000,
        p_tipo_capital: 'nuevo', p_inversor_id: m.ana, p_moneda: 'EUR', p_nota: `${ref} cap` });
      await sb.rpc('cem_aporte_guardar', { p_concepto: 'Reinversión de prueba', p_monto: 700,
        p_tipo_capital: 'reinversion', p_moneda: 'EUR', p_nota: `${ref} cap` });
      const { data } = await sb.rpc('cem_reparto');
      const suyo = (data.aportado_por_inversor || []).find((x) => x.inversor_id === m.ana);
      return { nuevo: data.capital.nuevo, reinv: data.capital.reinversion, suyo: suyo?.aportado };
    }, { m: montaje, ref: REF });
    a.comprobar(Number(capital.nuevo) >= 1000 && Number(capital.reinv) >= 700,
      `Capital nuevo y reinversión se cuentan por separado (${capital.nuevo} · ${capital.reinv})`);
    a.comprobar(Number(capital.suyo) === 1000,
      `Y a la socia se le acredita sólo lo que puso de su bolsillo, no la reinversión (${capital.suyo})`);

    /* ============ quién puede mirar esto ============
       El reparto es información de dueño. Que quien cobra o quien coordina vea
       qué porcentaje tiene cada socio les cambia la relación con la casa, y no
       lo necesitan para su trabajo. */
    for (const [cuenta, destino] of [
      ['cobranza', 'admin/pagos-verificar.html'],
      ['coordinador', 'admin/index.html'],
      ['estudiante', 'estudiante/panel.html'],
    ]) {
      const U = await nuevaPestana(navegador, { ancho: 1200, alto: 800 });
      await entrar(U, cuenta, destino);
      await U.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
      const puede = await conLaBase(U, async (sb) => {
        const { error } = await sb.rpc('cem_reparto');
        return !error;
      });
      a.comprobar(puede === false, `${cuenta} no puede consultar el reparto de los socios`);
      await U.close();
    }

    // El auditor sí mira, pero no toca.
    const A = await nuevaPestana(navegador, { ancho: 1200, alto: 800 });
    await entrar(A, 'auditor', 'admin/inversionistas.html');
    await A.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
    await A.waitForTimeout(1200);
    const auditor = await conLaBase(A, async (sb, { m, linea: l }) => {
      const { error: leer } = await sb.rpc('cem_reparto');
      const { error: escribir } = await sb.rpc('cem_liquidacion_guardar', {
        p_pagos: [{ ronda_id: m.ronda, inversor_id: m.ana, linea: l, monto: 1, moneda: 'EUR' }] });
      return { lee: !leer, escribe: !escribir };
    }, { m: montaje, linea: laLinea });
    a.comprobar(auditor.lee === true,
      'El auditor sí ve el reparto: auditar los libros sin verlo es auditar la mitad');
    a.comprobar(auditor.escribe === false, 'Pero no puede pagarle a nadie');
    a.comprobar(await A.locator('#btnPagar').count() === 0,
      'Y la pantalla no le deja delante los botones que no puede usar');
    await A.close();

    /* Los 400 de arriba —la ronda solapada, la reinversión con dueño— los
       provocó esta prueba a propósito: son las negativas que se estaban
       comprobando. Se limpian para que lo que venga después se mire limpio. */
    D.errores.length = 0;

    /* ============ la pantalla enseña de dónde sale el número ============ */
    await D.reload({ waitUntil: 'domcontentloaded' });
    await D.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
    await D.waitForTimeout(1800);
    a.comprobar(await D.locator('[data-socio]').count() >= 2,
      'La pantalla pinta una tarjeta por socio');
    await D.locator(`[data-socio="${montaje.ana}"]`).click();
    await D.waitForTimeout(700);
    const filas = await D.locator('#detalleSocio table tbody tr').count();
    a.comprobar(filas >= 1, `Al tocar una tarjeta se abre el desglose que la explica (${filas} fila(s))`);
    const texto = await D.locator('#detalleSocio').innerText();
    a.comprobar(/entraron/.test(texto) && /gastos/.test(texto),
      'Y el desglose enseña la resta de la que sale la cifra, no sólo el resultado');
    a.comprobar(await D.locator('#tbLineas tr').count() >= 1,
      'La ronda se abre línea por línea, sin agrupar ninguna con otra');

    a.comprobar(D.errores.length === 0, `Sin errores ${JSON.stringify(D.errores.slice(0, 2))}`);
  } finally {
    // Pase lo que pase.
    await limpiar().catch(() => {});
    await D.close();
  }

  return a;
}
