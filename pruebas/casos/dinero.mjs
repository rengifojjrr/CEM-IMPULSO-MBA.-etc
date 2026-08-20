/* Todo lo que toca dinero: reportar un pago, verificarlo, el estado de cuenta,
   el recibo y la cartera por cobrar.

   Es el caso más delicado del sistema: un fallo aquí no se ve, se cobra mal. */

import { acta, nuevaPestana, entrar, BASE } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('dinero');
  const REFERENCIA = 'PRUEBA-' + Date.now();

  /* ============ el equipo carga la tasa del día ============ */
  const A = await nuevaPestana(navegador, { ancho: 1400 });
  await entrar(A, 'admin', 'admin/pagos-verificar.html');
  await A.waitForSelector('#tasaActual', { timeout: 25000 });
  await A.waitForTimeout(2500);
  a.comprobar((await A.locator('#tasaActual').textContent()).length > 0,
    'La bandeja muestra la tasa vigente');

  /* Son dos tasas y hacen cosas distintas: la del EURO convierte los bolívares
     que entran —es la que cobra— y la del DÓLAR es de referencia. Si se
     confundieran, cada pago en bolívares se cobraría con el número equivocado
     y nadie lo notaría hasta cuadrar el mes. */
  await A.fill('#inpTasa', '48.90');
  await A.click('#btnTasa');
  await A.waitForTimeout(2000);
  a.comprobar((await A.locator('#tasaActual').textContent()).includes('48.9'),
    'El equipo puede cargar la tasa del euro a mano');

  await A.fill('#inpTasaUsd', '45.75');
  await A.click('#btnTasaUsd');
  await A.waitForTimeout(2000);
  const dosTasas = await A.evaluate(() => ({
    eur: document.querySelector('#tasaActual').textContent,
    usd: document.querySelector('#tasaActualUsd').textContent,
  }));
  a.comprobar(/48\.9/.test(dosTasas.eur) && /45\.75/.test(dosTasas.usd),
    `Y la del dólar por separado, sin pisar la del euro (${dosTasas.eur.trim()} · ${dosTasas.usd.trim()})`);

  /* ============ el estudiante reporta un pago ============ */
  const E = await nuevaPestana(navegador, { ancho: 1300 });
  await entrar(E, 'estudiante', 'estudiante/pagos.html');
  await E.waitForSelector('#cuotas', { timeout: 25000 });
  // El hueco de carga ya no dice «Cargando…»: es un esqueleto sin texto, así
  // que lo que hay que esperar es a que desaparezca.
  await E.waitForFunction(() => {
    const c = document.querySelector('#cuotas');
    return c && !c.querySelector('.cargando') && c.textContent.trim().length > 0;
  }, null, { timeout: 25000 });

  /* Esta comprobación se caía sin que hubiera nada roto: corridas anteriores
     habían aprobado todas las cuotas del estudiante de prueba, así que no le
     quedaba ninguna pendiente que reportar. El mensaje dice qué encontró, para
     que la próxima vez se vea en el acto que es el dato y no la pantalla. */
  const cuotas = await E.locator('#cuotas .li, #cuotas tr').count();
  const porReportar = await E.locator('[data-reportar]').count();
  a.comprobar(porReportar >= 1,
    `El estudiante ve sus cuotas pendientes con "Reportar pago" (${porReportar} de ${cuotas} cuota(s))`);

  if (porReportar) {
    await E.locator('[data-reportar]').first().click();
    await E.waitForSelector('#rMonto', { timeout: 10000 });

    /* La forma de pago decide la moneda y la tasa: ya no hay un desplegable de
       moneda que pueda contradecirla. Se comprueban las dos reglas de la casa,
       que son lo que de verdad cobra. */
    await E.selectOption('#rMetodo', 'Pago móvil');
    await E.fill('#rMonto', '4890');
    await E.waitForTimeout(700);
    const enBolivares = await E.locator('#rEquivalente').textContent();
    a.comprobar(/100,00\s*€/.test(enBolivares) && /48,9/.test(enBolivares),
      `Bolívares: 4.890 Bs se convierten a 100 € con la tasa BCV del euro (${enBolivares.trim()})`);

    await E.selectOption('#rMetodo', 'Efectivo');
    await E.fill('#rMonto', '100');
    await E.waitForTimeout(700);
    const enEfectivo = await E.locator('#rEquivalente').textContent();
    a.comprobar(/100,00\s*€/.test(enEfectivo) && /par/i.test(enEfectivo),
      `Efectivo: 100 US$ saldan 100 € — a la par, sin tasa (${enEfectivo.trim()})`);

    await E.selectOption('#rMetodo', 'Pago móvil');
    await E.fill('#rMonto', '4575');
    await E.waitForTimeout(700);

    // Sin referencia no se envía: es el dato con el que se verifica en el banco.
    await E.fill('#rRef', '');
    await E.click('#rEnviar');
    await E.waitForTimeout(700);
    a.comprobar(/referencia/i.test(await E.locator('#rMsg').textContent()),
      'Sin número de referencia el formulario avisa y no envía');

    await E.fill('#rRef', REFERENCIA);
    await E.click('#rEnviar');
    await E.waitForTimeout(3500);
    const reportados = await E.locator('#tbPagos').textContent();
    a.comprobar(reportados.includes(REFERENCIA), 'El pago reportado aparece en su lista');
    a.comprobar(/en revisi/i.test(reportados), 'Marcado como "en revisión"');

    // Reportar la MISMA referencia otra vez se rechaza: dos reportes del mismo
    // pago abonarían dos veces la cuota.
    await E.silenciarMientras(async () => {
      await E.locator('[data-reportar]').first().click();
      await E.waitForSelector('#rMonto', { timeout: 10000 });
      await E.fill('#rMonto', '4575');
      await E.fill('#rRef', REFERENCIA);
      await E.click('#rEnviar');
      await E.waitForTimeout(3000);
      a.comprobar(/[Yy]a hay un pago/.test(await E.locator('#rMsg').textContent()),
        'La misma referencia dos veces se rechaza con un mensaje claro');
    });
    await E.locator('.modal [data-x]').first().click();
    await E.waitForTimeout(500);

    /* ============ el equipo lo verifica y lo aprueba ============ */
    await A.reload({ waitUntil: 'domcontentloaded' });
    await A.waitForSelector('#tb', { timeout: 25000 });
    await A.waitForTimeout(3000);
    const bandeja = await A.locator('#tb').textContent();
    a.comprobar(bandeja.includes(REFERENCIA), 'El pago reportado le llega a quien lo verifica');

    const fila = A.locator('tr', { hasText: REFERENCIA }).first();
    await fila.locator('[data-ver]').click();
    await A.waitForTimeout(1500);
    a.comprobar((await A.locator('.modal-b').textContent()).length > 0,
      'El detalle abre con los datos del pago');
    a.comprobar((await A.locator('#dVerificar').count()) === 1,
      'Y ofrece verificar la referencia contra el banco sin salir de la pantalla');
    await A.locator('.modal [data-x]').first().click();
    await A.waitForTimeout(600);

    await fila.locator('[data-ok]').click();
    await A.waitForSelector('[data-si]', { timeout: 10000 });
    const confirmacion = await A.locator('.modal-b').textContent();
    a.comprobar(/abonar/i.test(confirmacion) && /pagada|saldo/i.test(confirmacion),
      'Antes de aprobar explica el efecto exacto sobre la cuota');
    await A.locator('[data-si]').click();
    await A.waitForTimeout(3500);
    a.comprobar(!(await A.locator('#tb').textContent()).includes(REFERENCIA),
      'Tras aprobar sale de la bandeja "Por revisar"');

    /* ============ y se puede deshacer ============
       Aparte de comprobar que anular devuelve el saldo a la cuota —que es lo
       que hace `cem_anular_pago`—, esto deja el escenario como estaba. Sin
       ello cada corrida se comía la única cuota pendiente del estudiante de
       demostración y la siguiente fallaba sin que nadie hubiera tocado nada:
       una prueba que sólo pasa la primera vez no es una prueba. */
    const devuelto = await A.evaluate(async (ref) => {
      const m = await import('/plataforma/assets/app.js?v=2026-08-21-12');
      const { data: pagos } = await m.sb.from('cem_payments')
        .select('id, installment_id').eq('referencia', ref).eq('estado', 'confirmado');
      if (!pagos?.length) return { ok: false, motivo: 'no se encontró el pago aprobado' };
      const { error } = await m.sb.rpc('cem_anular_pago', {
        p_payment_id: pagos[0].id,
        p_motivo: 'Prueba automática: se deshace para dejar la cuota como estaba.',
      });
      if (error) return { ok: false, motivo: error.message };
      const { data: cuota } = await m.sb.from('cem_installments')
        .select('estado, saldo').eq('id', pagos[0].installment_id).single();
      return { ok: true, estado: cuota?.estado, saldo: Number(cuota?.saldo) };
    }, REFERENCIA);
    a.comprobar(devuelto.ok && devuelto.saldo > 0 && devuelto.estado !== 'pagada',
      `Anular el pago le devuelve el saldo a la cuota (${JSON.stringify(devuelto)})`);
  }

  /* ============ estado de cuenta y recibo ============ */
  await E.goto(`${BASE}/plataforma/estudiante/pagos.html`, { waitUntil: 'domcontentloaded' });
  await E.waitForSelector('#btnEstadoCuenta', { timeout: 25000 });
  await E.waitForFunction(() => {
    const c = document.querySelector('#cuotas');
    return c && !c.querySelector('.cargando') && c.textContent.trim().length > 0;
  }, null, { timeout: 25000 });
  await E.waitForTimeout(1500);

  const ventanaEstado = E.waitForEvent('popup', { timeout: 20000 });
  await E.click('#btnEstadoCuenta');
  await E.waitForTimeout(1200);
  if (await E.locator('#ecEnr').count()) await E.locator('.modal [data-s]').click();
  const estado = await ventanaEstado.catch(() => null);
  if (estado) {
    await estado.waitForLoadState('domcontentloaded');
    const texto = await estado.locator('body').textContent();
    a.comprobar(/Estado de cuenta/i.test(texto), 'El estado de cuenta se abre listo para imprimir');
    a.comprobar(/Cuotas/i.test(texto) && /Pagos recibidos/i.test(texto) && /Saldo pendiente/i.test(texto),
      'Trae cuotas, pagos y saldo — que es lo que se pregunta');
    await estado.close();
  } else a.comprobar(false, 'El estado de cuenta abre su ventana');

  const conRecibo = await E.locator('[data-recibo]').count();
  a.comprobar(conRecibo >= 1, 'Los pagos aprobados ofrecen recibo descargable');
  if (conRecibo) {
    const ventanaRecibo = E.waitForEvent('popup', { timeout: 20000 });
    await E.locator('[data-recibo]').first().click();
    const recibo = await ventanaRecibo.catch(() => null);
    if (recibo) {
      await recibo.waitForLoadState('domcontentloaded');
      const t = await recibo.locator('body').textContent();
      a.comprobar(/Recibo de pago/i.test(t) && /REC-/.test(t),
        'El recibo trae su número de comprobante');
      await recibo.close();
    } else a.comprobar(false, 'El recibo abre su ventana');
  }

  /* ============ la cartera por cobrar, para conciliar ============ */
  await A.goto(`${BASE}/plataforma/admin/pagos-verificar.html`, { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('#btnCartera', { timeout: 25000 });
  await A.waitForTimeout(2500);
  const descarga = A.waitForEvent('download', { timeout: 20000 }).catch(() => null);
  await A.click('#btnCartera');
  const archivo = await descarga;
  a.comprobar(!!archivo, 'La cartera por cobrar se exporta a CSV');

  /* ============ el cierre de mes (item 52) ============
     Antes había que armarlo juntando tres pantallas y un Excel. Se comprueba
     que las cuatro cifras salen y que cada una explica qué cuenta. */
  await A.goto(`${BASE}/plataforma/admin/cierre-mes.html`, { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('#cuadros', { timeout: 25000 });
  await A.waitForFunction(() => (document.querySelector('#cuadros')?.children.length || 0) >= 4,
    null, { timeout: 25000 });

  const cierre = await A.locator('#cuadros').textContent();
  a.comprobar(/Se facturó/.test(cierre) && /Entró/.test(cierre)
           && /Quedó debiéndose/.test(cierre) && /Por revisar/.test(cierre),
    'El cierre de mes trae las cuatro cifras: facturado, cobrado, vencido y por revisar');
  /* Y una quinta: lo que se concedió por recibir dólares a la par del euro.
     Va aparte de «entró» a propósito — entró es lo que saldó cuotas, y esto es
     dinero que se decidió no pedir. Sin esta cifra la paridad es invisible. */
  a.comprobar(/concedió por paridad/i.test(cierre),
    'Y la quinta: cuánto se concedió por cobrar los dólares a la par');
  a.comprobar(await A.locator('#cuadros .ayuda-btn').count() === 5,
    'Y cada una explica qué está contando');

  // El mes que se ofrece al entrar es el que acaba de cerrar, no el que corre.
  const mesElegido = await A.locator('#mes').inputValue();
  const anterior = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1);
  a.comprobar(mesElegido === `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, '0')}`,
    'Y arranca en el mes que acaba de terminar, que es el que se cierra');

  /* ============ la historia de una cuota (item 55) ============ */
  await A.goto(`${BASE}/plataforma/admin/inscripciones.html`, { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('#tabs', { timeout: 25000 });
  await A.locator('#tabs button[data-t="cuotas"]').click();
  await A.waitForTimeout(2500);
  const conHistoria = await A.locator('[data-hist]').count();
  a.comprobar(conHistoria >= 1, 'Cada cuota ofrece ver su historia');
  if (conHistoria) {
    await A.locator('[data-hist]').first().click();
    await A.waitForSelector('.modal', { timeout: 10000 });
    const historia = await A.locator('.modal').textContent();
    a.comprobar(/Abonado/.test(historia) && /Queda debiendo/.test(historia),
      'Y dice cuánto se abonó, en cuántos pagos y cuánto queda debiendo');
    await A.keyboard.press('Escape');
  }

  /* ============ las carteras ============
     Lo que importa comprobar aquí es la regla que sostiene todo el módulo: el
     saldo NO está guardado en ninguna columna, se calcula sumando movimientos.
     Así que si se mueve dinero, el saldo tiene que cambiar solo —sin que nadie
     recalcule nada— y volver atrás al mandar el movimiento a la papelera. */
  await A.goto(`${BASE}/plataforma/admin/carteras.html`, { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('.bolsillo', { timeout: 25000 });
  await A.waitForTimeout(1500);

  const bolsillos = await A.locator('.bolsillo').count();
  a.comprobar(bolsillos >= 3, `Hay una tarjeta por cartera con su saldo (${bolsillos})`);

  const leerSaldo = () => A.evaluate(() => {
    const b = [...document.querySelectorAll('.bolsillo')]
      .find((x) => x.dataset.cartera === 'efectivo_usd');
    return b ? b.querySelector('.cifra').textContent : '';
  });
  const antes = await leerSaldo();

  // Un ajuste: la salida de emergencia para cuadrar con lo que hay de verdad.
  await A.click('#btnAjuste');
  await A.waitForSelector('#cMontoD', { timeout: 10000 });
  await A.selectOption('#cDestino', 'efectivo_usd');
  await A.fill('#cMontoD', '25');
  await A.click('#cGo');
  await A.waitForTimeout(1200);
  a.comprobar(await A.locator('#cMsg .nota').count() > 0,
    'Un ajuste sin explicar por qué se hace no se deja guardar');

  await A.fill('#cNota', 'Prueba automática: al contar la caja sobraban 25.');
  await A.click('#cGo');
  await A.waitForTimeout(3000);
  const despues = await leerSaldo();
  a.comprobar(antes !== despues && /25/.test(despues.replace(/\./g, '')),
    `El saldo se recalcula solo al registrar el movimiento (${antes.trim()} → ${despues.trim()})`);

  // Y el historial dice de qué está hecho: sin eso, un saldo que no cuadra no
  // se puede investigar.
  await A.locator('[data-cartera="efectivo_usd"]').click();
  await A.waitForSelector('#hist', { timeout: 10000 });
  await A.waitForTimeout(1500);
  const historial = await A.locator('#hist').textContent();
  a.comprobar(/Ajuste/.test(historial) && /sobraban 25/.test(historial),
    'Y el historial explica cada línea del saldo, con su motivo');
  await A.locator('.modal [data-x]').first().click();
  await A.waitForTimeout(600);

  // A la papelera: el saldo vuelve atrás y el movimiento se puede recuperar.
  await A.locator('#tbConv [data-borrar]').first().click();
  await A.waitForSelector('[data-borrar]:not(#tbConv [data-borrar])', { timeout: 10000 }).catch(() => {});
  await A.locator('.modal [data-borrar]').click();
  await A.waitForTimeout(3000);
  const vuelto = await leerSaldo();
  a.comprobar(vuelto === antes,
    `Mandarlo a la papelera devuelve el saldo a como estaba (${vuelto.trim()})`);

  /* ============ pagar con tarjeta se ofrece de verdad ============
     El fallo que esto vigila fue real y desconcertante: Stripe estaba
     conectado, las claves puestas y el webhook funcionando, y la pantalla del
     estudiante le decía «por ahora no puedes pagar por Tarjeta de
     crédito/débito desde aquí». Falso, y encima el botón de pagar existía más
     abajo, fuera de la vista.

     La causa: el selector de «¿cómo quieres pagar?» descarta lo que no tenga
     destino —una cuenta, una dirección—, y la tarjeta no tiene ninguno de los
     dos porque su destino es la pasarela. */
  await E.goto(`${BASE}/plataforma/estudiante/pagos.html`, { waitUntil: 'domcontentloaded' });
  await E.waitForSelector('#page:not(.hidden)', { timeout: 30000 });
  await E.waitForTimeout(4000);

  const conTarjeta = await E.evaluate(() => {
    /* Las formas de pago son botones, no un desplegable: un desplegable las
       iguala, y aquí no valen lo mismo —una cobra sola y las otras empiezan un
       trámite—. */
    const botones = [...document.querySelectorAll('.metodo')];
    const opciones = botones.map((b) => b.innerText.replace(/\s+/g, ' ').trim());
    return {
      opciones,
      primera: opciones[0] || '',
      /* Que se pueda recorrer con el teclado. Cambiar algo accesible por algo
         bonito sería un mal negocio. */
      conTeclado: botones.length > 0 && botones.every((b) => b.getAttribute('role') === 'radio'),
      diceCuando: opciones[0]?.includes('Se cobra al momento') || false,
      /* Se mira SÓLO la frase del aviso, no el bloque entero: ahora la palabra
         «tarjeta» aparece ahí porque la tarjeta sí se ofrece, y buscarla en
         todo el texto daría por roto justo lo que se acaba de arreglar. */
      dice_que_no: ((document.querySelector('#dondePagar')?.innerText || '')
        .split('\n').find((l) => l.includes('no puedes pagar por')) || ''),
    };
  });
  const hayTarjeta = conTarjeta.opciones.some((o) => /tarjeta/i.test(o));
  a.comprobar(hayTarjeta,
    `La tarjeta se ofrece entre las formas de pago (${conTarjeta.opciones.join(' · ') || 'ninguna'})`);
  /* Y va la primera: es la única que se paga sin salir de la pantalla ni
     esperar a que nadie verifique nada. */
  a.comprobar(/tarjeta/i.test(conTarjeta.primera),
    `Y es la primera, que es la que se cobra sola (${conTarjeta.primera})`);
  a.comprobar(conTarjeta.conTeclado,
    'Las formas de pago son botones que se recorren con el teclado, no un desplegable');
  a.comprobar(conTarjeta.diceCuando,
    'Y la tarjeta dice que se cobra al momento, que es lo que la distingue de las demás');
  a.comprobar(!/tarjeta/i.test(conTarjeta.dice_que_no),
    `Y no se le dice que no puede pagar con tarjeta teniéndola disponible («${
      conTarjeta.dice_que_no.trim().slice(0, 80) || 'no se le dice nada de eso'}»)`);

  /* ============ el catálogo reflejado en Stripe ============
     Cada programa se refleja como PRODUCTO en Stripe al guardarlo. Producto y
     no precio: lo que alguien debe sale de aquí —descuentos, cuotas, lo ya
     abonado, la tasa BCV— y un precio en Stripe sería una segunda verdad sobre
     el dinero. Lo que se comprueba entonces no es que los importes coincidan
     (no tienen por qué) sino que el reflejo exista y no se haya quedado a
     medias. */
  const stripe = await A.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-12');
    const { data, error } = await m.sb.from('cem_courses')
      .select('nombre,estado,stripe_product_id,stripe_sync_en,stripe_sync_error')
      .limit(200);
    if (error) return { error: error.message };
    const pub = (data || []).filter((c) => c.estado === 'publicado');
    return {
      publicados: pub.length,
      sinProducto: pub.filter((c) => !c.stripe_product_id).map((c) => c.nombre),
      conError: (data || []).filter((c) => c.stripe_sync_error)
        .map((c) => `${c.nombre}: ${c.stripe_sync_error}`),
    };
  });
  a.comprobar(!stripe.error && stripe.publicados > 0,
    `Hay programas publicados que reflejar (${stripe.publicados ?? stripe.error})`);
  a.comprobar(stripe.sinProducto?.length === 0,
    `Todo programa publicado tiene su producto en Stripe${
      stripe.sinProducto?.length ? `: falta ${stripe.sinProducto.slice(0, 3).join(', ')}` : ''}`);
  /* El error se enseña, no se traga: si Stripe rechazó algo —una imagen que no
     es pública, un nombre vacío— tiene que salir por aquí y no descubrirse el
     día que alguien intente cobrar. */
  a.comprobar(stripe.conError?.length === 0,
    `Y ninguno se quedó con un error de Stripe sin resolver${
      stripe.conError?.length ? `: ${stripe.conError.slice(0, 2).join(' · ')}` : ''}`);

  /* El código fiscal sale de la modalidad, no de un campo que alguien rellena.
     Sin él, Stripe rechaza el cobro en las cuentas con «Managed Payments». */
  const fiscales = await A.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-12');
    const { data, error } = await m.sb.rpc('cem_stripe_codigo_fiscal', { p_modalidad: 'en_vivo' });
    return { data, error: error?.message };
  });
  a.comprobar(fiscales.data === 'txcd_20060045',
    `Una clase en vivo se declara como formación en directo, no como curso grabado (${
      fiscales.data ?? fiscales.error})`);

  /* ============ acotar cien pagos ============
     Una lista de cien pagos seguidos no se lee. Se busca por cuándo entró el
     dinero y por cómo entró —«las transferencias de octubre»—, y desde la
     fila se entra a la persona a ver todo lo suyo. */
  await A.goto(`${BASE}/plataforma/admin/inscripciones.html`, { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('#tb tr', { timeout: 40000 });
  await A.click('[data-t=pagos]');
  await A.waitForTimeout(900);
  await A.evaluate(() => { document.querySelector('#masFiltros').open = true; });

  const todos = await A.locator('#tb tr').count();
  const metodos = await A.$$eval('#fMetodo option', (o) => o.map((x) => x.value).filter(Boolean));
  await A.selectOption('#fMetodo', metodos[0]);
  await A.waitForTimeout(700);
  const unMetodo = await A.$$eval('#tb tr td[data-col="Método"]',
    (t) => [...new Set(t.map((x) => x.textContent.trim()))]);
  a.comprobar(metodos.length > 1 && unMetodo.length === 1,
    `Filtrar por método deja sólo ese método (${unMetodo.join(', ')} de ${metodos.length} posibles)`);

  await A.selectOption('#fMetodo', '');
  await A.fill('#fDesde', '2026-10-01');
  await A.waitForTimeout(700);
  const acotado = await A.locator('#tb tr').count();
  const fueraDeRango = await A.$$eval('#tb tr td[data-col="Fecha"]',
    (t) => t.map((x) => x.textContent.trim()).filter((f) => !/oct|nov|dic/.test(f)).length);
  a.comprobar(acotado < todos && fueraDeRango === 0,
    `Y una fecha desde deja fuera lo anterior (${acotado} de ${todos}, ${fueraDeRango} fuera de rango)`);

  const aLaFicha = await A.getAttribute('#tb tr a[href^="estudiante.html"]', 'href');
  a.comprobar(/estudiante\.html\?id=[0-9a-f-]{36}/.test(aLaFicha || ''),
    `Desde un pago se entra a la ficha de quien lo hizo (${aLaFicha})`);

  // «Limpiar» tiene que limpiar también los que están plegados, o la lista
  // sigue acotada y nadie entiende por qué.
  await A.click('#btnClear');
  await A.waitForTimeout(700);
  a.comprobar(await A.locator('#tb tr').count() === todos,
    'Y «Limpiar» devuelve la lista entera, también lo que estaba plegado');

  a.comprobar(A.errores.length === 0,
    `La bandeja de pagos no lanza errores ${JSON.stringify(A.errores.slice(0, 2))}`);
  a.comprobar(E.errores.length === 0,
    `La pantalla de pagos del estudiante tampoco ${JSON.stringify(E.errores.slice(0, 2))}`);

  return a;
}
