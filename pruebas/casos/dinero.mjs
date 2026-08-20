/* Todo lo que toca dinero: reportar un pago, verificarlo, el estado de cuenta,
   el recibo y la cartera por cobrar.

   Es el caso más delicado del sistema: un fallo aquí no se ve, se cobra mal. */

import { acta, nuevaPestana, entrar, conLaBase, BASE } from '../entorno.mjs';

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

  /* ── lo que esta prueba pisa, y que hay que devolver ──────────────────────
     Esto escribe una tasa a mano en la tabla de verdad. Durante meses no la
     devolvió, y como la tasa cargada a mano manda sobre la del banco, la
     plataforma se quedó cobrando a 48,90 Bs/€ cuando el BCV publicaba 906,83:
     un factor de casi veinte, puesto ahí por la suite de pruebas y por nadie
     más. Una prueba que deja el sistema peor de como lo encontró no es una
     prueba, es un fallo con horario.

     Se apunta lo que había y al final se devuelve. */
  const tasaPrevia = await conLaBase(A, async (sb) => {
    const leer = async (m) => (await sb.rpc('cem_tasa_vigente', { p_moneda: m })).data?.[0] || null;
    return { EUR: await leer('EUR'), USD: await leer('USD') };
  });

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
      const m = await import('/plataforma/assets/app.js?v=2026-08-21-44');
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
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-44');
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
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-44');
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

  /* ============ los pagos de la ficha, por programa ============ */
  /* items 38 y 41 · quien cobra abre una ficha para preguntar «¿cuánto lleva
     pagado de esto?». Con las cuotas de todos los programas en una sola lista
     la respuesta había que sacarla contando filas. */
  const idFicha = (aLaFicha || '').match(/id=([0-9a-f-]{36})/)?.[1];
  await A.goto(`${BASE}/plataforma/admin/estudiante.html?id=${idFicha}`);
  await A.waitForSelector('#hero h1', { timeout: 25000 });
  await A.waitForSelector('#panel .kpi');
  await A.click('#tabs button[data-t="pagos"]');
  await A.waitForTimeout(1200);

  const grupos = await A.$$eval('#panel details[data-prog]', (ds) => ds.map((d) => ({
    programa: d.querySelector('.t')?.textContent.trim() || '',
    avance: d.querySelector('.avance-programa')?.textContent.replace(/\s+/g, ' ').trim() || '',
    estado: d.querySelector('summary .chip')?.textContent.trim() || '',
    vencidas: /vencida/.test(d.querySelector('summary .chip')?.textContent || ''),
    tablas: d.querySelectorAll('table').length,
  })));
  a.comprobar(grupos.length > 0 && grupos.every((g) => g.programa),
    `Los pagos de la ficha van agrupados por programa (${grupos.length})`);

  const conPorcentaje = grupos.filter((g) => /\d+%/.test(g.avance)).length;
  a.comprobar(conPorcentaje > 0 && conPorcentaje === grupos.filter((g) => g.estado !== 'sin importe').length,
    `Cada programa dice cuánto lleva pagado en porcentaje (${conPorcentaje} de ${grupos.length})`);

  a.comprobar(grupos.every((g) => g.tablas === 2),
    'Y al abrirlo están sus cuotas y sus pagos, sólo los suyos');

  /* Lo vencido arriba: es la lista de a quién hay que llamar hoy. */
  const primerAlDia = grupos.findIndex((g) => !g.vencidas);
  const ultimoVencido = grupos.map((g) => g.vencidas).lastIndexOf(true);
  a.comprobar(ultimoVencido === -1 || primerAlDia === -1 || ultimoVencido < primerAlDia,
    'Lo que tiene cuotas vencidas sale primero');

  /* Un programa sin un solo pago no puede llamarse «al día»: es justo el que
     se está buscando. */
  const mentira = grupos.filter((g) => g.estado === 'al día' && /^0[,.]/.test(g.avance)).length;
  a.comprobar(mentira === 0, 'Un programa sin cobrar nada no se anuncia como «al día»');

  /* ============ invitar a otro programa, en vez de matricular a la fuerza ============
     item 22 · el buscador de personas, el descuento en % o en dinero, y que la
     inscripción no exista hasta que la persona diga que sí. */
  await A.goto(`${BASE}/plataforma/admin/inscripciones.html`);
  await A.waitForSelector('#btnNueva', { timeout: 25000 });
  await A.waitForTimeout(2500);

  /* A qué programa se puede invitar: uno publicado donde el estudiante de
     demostración no esté ya. Preguntándoselo a la base y no fijando un
     identificador, que cambia con cada juego de datos. */
  const destino = await conLaBase(A, async (sb) => {
    const { data: yo } = await sb.from('cem_profiles').select('id').eq('email', 'estudiante@cem.demo').maybeSingle();
    const { data: mios } = await sb.from('cem_enrollments').select('course_id')
      .eq('profile_id', yo.id).not('estado', 'in', '("cancelada","finalizada")');
    const tomados = new Set((mios || []).map((x) => x.course_id));
    const { data: cursos } = await sb.from('cem_courses').select('id,nombre,precio')
      .eq('estado', 'publicado').order('nombre');
    const libre = (cursos || []).find((c) => !tomados.has(c.id) && Number(c.precio) > 0);
    return { perfil: yo.id, curso: libre || null };
  });

  if (!destino.curso) {
    a.comprobar(false, 'Hay algún programa publicado al que invitar al estudiante de prueba');
  } else {
    await A.click('#btnNueva');
    await A.waitForSelector('#nEst', { timeout: 10000 });

    await A.fill('#nEst', 'estudiante@cem');
    await A.waitForTimeout(1500);
    const encontrados = await A.$$eval('#nEstLista li[data-k]', (ls) => ls.length);
    a.comprobar(encontrados >= 1,
      `Se busca a la persona escribiendo, en vez de bajar por una lista (${encontrados} resultado(s))`);

    await A.click('#nEstLista li[data-k="0"]');
    await A.waitForTimeout(400);
    a.comprobar(await A.locator('#nEstElegido').isVisible(),
      'Al elegirla queda a la vista quién es, no un desplegable sin abrir');

    await A.selectOption('#nCurso', destino.curso.id);
    await A.selectOption('#nCuotas', '1');
    await A.waitForTimeout(400);

    /* El mismo «10» significa dos cosas distintas, y la pantalla tiene que
       decir cuál. Sobre 162 € son 152 € o 145,80 €. */
    await A.fill('#nDesc', '10');
    await A.waitForTimeout(300);
    const enDinero = (await A.locator('#nDescNota').textContent()).trim();
    await A.click('#nDescPct');
    await A.waitForTimeout(300);
    const enPorciento = (await A.locator('#nDescNota').textContent()).trim();
    a.comprobar(enDinero !== enPorciento && /queda en/.test(enDinero) && /queda en/.test(enPorciento),
      `El descuento se dice en % o en dinero, y se ve el precio que queda (${enPorciento})`);

    await A.click('[data-inv]');
    await A.waitForTimeout(3500);

    const enviadas = await A.$$eval('#tbInv tr', (rs) => rs.map((r) => r.innerText.replace(/\s+/g, ' ')));
    a.comprobar(enviadas.some((t) => t.includes(destino.curso.nombre) && /endiente/.test(t)),
      'La invitación queda a la vista del equipo, sin contestar');

    /* Y lo que importa: todavía NO está inscrito. Invitar no es matricular. */
    const antes = await conLaBase(A, async (sb, cursoId, perfil) => {
      const { count } = await sb.from('cem_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', perfil).eq('course_id', cursoId)
        .not('estado', 'in', '("cancelada","finalizada")');
      return count;
    }, destino.curso.id, destino.perfil);
    a.comprobar(antes === 0, `Invitar no matricula a nadie: sigue sin inscripción (${antes})`);

    // ── la persona la ve y la acepta
    await E.goto(`${BASE}/plataforma/estudiante/panel.html`);
    await E.waitForSelector('#cursos', { timeout: 25000 });
    await E.waitForTimeout(3000);
    const suya = await E.$$eval('#invitaciones .card.invitacion', (cs) =>
      cs.map((c) => c.innerText.replace(/\s+/g, ' ')));
    a.comprobar(suya.some((t) => t.includes(destino.curso.nombre)),
      'Le llega a su panel, con el precio que se le ofreció');

    await E.click('#invitaciones [data-si]');
    await E.waitForTimeout(4000);

    const despues = await conLaBase(E, async (sb, cursoId) => {
      const { data } = await sb.from('cem_enrollments').select('id,precio_final,estado')
        .eq('course_id', cursoId).not('estado', 'in', '("cancelada","finalizada")');
      const { data: cuotas } = await sb.from('cem_installments').select('id,monto')
        .in('enrollment_id', (data || []).map((x) => x.id));
      return { ins: data || [], cuotas: cuotas || [] };
    }, destino.curso.id);
    a.comprobar(despues.ins.length === 1 && despues.cuotas.length === 1,
      `Aceptar sí la crea, con su plan de pago (${despues.ins.length} inscripción, ${despues.cuotas.length} cuota)`);

    const cuadra = despues.ins[0] && despues.cuotas[0] &&
      Math.abs(Number(despues.cuotas[0].monto) - Number(despues.ins[0].precio_final)) < 0.01;
    a.comprobar(!!cuadra,
      `Y la cuota suma exactamente el precio aceptado (${despues.cuotas[0]?.monto} de ${despues.ins[0]?.precio_final})`);

    /* Se deja el escenario como estaba: si no, la siguiente corrida encuentra
       al estudiante ya inscrito y la prueba no vuelve a pasar nunca. */
    await conLaBase(E, async (sb, enrId) => sb.rpc('cem_cancelar_inscripcion',
      { p_enrollment_id: enrId, p_motivo: 'Limpieza de la prueba de invitaciones.' }),
      despues.ins[0]?.id);
  }

  /* ============ la tasa se trae sola del BCV ============
     Hasta ahora la tabla de tasas sólo tenía filas cargadas a mano: la columna
     que dice de dónde viene cada una nunca dijo otra cosa. */
  await A.goto(`${BASE}/plataforma/admin/pagos-verificar.html`);
  await A.waitForSelector('#btnTraerBcv', { timeout: 25000 });
  await A.waitForTimeout(2500);

  await A.click('#btnTraerBcv');
  await A.waitForTimeout(7000);
  const traida = await conLaBase(A, async (sb) => {
    const { data } = await sb.from('cem_tasas_bcv')
      .select('moneda,valor,fecha,id_tasa').eq('id_tasa', 'BCV')
      .order('fecha', { ascending: false }).limit(4);
    return data || [];
  });
  a.comprobar(traida.length > 0 && traida.every((t) => Number(t.valor) > 0),
    `La tasa se trae del BCV sin que nadie la escriba (${traida.map((t) => `${t.moneda} ${t.valor}`).join(' · ') || 'ninguna'})`);

  /* La jerarquía: lo que escribió la casa manda sobre lo que trajo el banco.
     Sin esto, la tarea automática pisaría en silencio la decisión del dueño a
     la mañana siguiente — que es justo el sistema en el que se deja de confiar. */
  const mandaLaDeLaCasa = await conLaBase(A, async (sb) => {
    const { data } = await sb.rpc('cem_tasa_vigente', { p_moneda: 'EUR' });
    return data?.[0] || null;
  });
  const hayBcvEur = traida.some((t) => t.moneda === 'EUR');
  a.comprobar(!hayBcvEur || mandaLaDeLaCasa?.id_tasa === 'MANUAL',
    `Con las dos puestas el mismo día, manda la cargada a mano (${mandaLaDeLaCasa?.id_tasa} ${mandaLaDeLaCasa?.valor})`);

  /* Y la pantalla lo dice, en vez de dejar que una tasa escrita por error tape
     la del banco todo el día sin que nadie se entere. */
  const avisa = await A.locator('#avisoTasa').textContent();
  a.comprobar(!hayBcvEur || /cargada a mano/i.test(avisa || ''),
    'Y la pantalla avisa de que una tasa a mano está tapando la del BCV');

  /* ── devolver la tasa a como estaba ──────────────────────────────────── */
  await conLaBase(A, async (sb, previa) => {
    for (const m of ['EUR', 'USD']) {
      // Se quita la que puso esta prueba…
      await sb.rpc('cem_tasa_soltar_manual', { p_moneda: m });
      // …y si antes había una a mano de hoy, se vuelve a poner tal cual.
      const antes = previa[m];
      if (antes && antes.id_tasa === 'MANUAL' && antes.fecha === new Date().toISOString().slice(0, 10)) {
        await sb.rpc('cem_guardar_tasa_manual', { p_valor: antes.valor, p_moneda: m });
      }
    }
  }, tasaPrevia);

  a.comprobar(A.errores.length === 0,
    `La bandeja de pagos no lanza errores ${JSON.stringify(A.errores.slice(0, 2))}`);
  a.comprobar(E.errores.length === 0,
    `La pantalla de pagos del estudiante tampoco ${JSON.stringify(E.errores.slice(0, 2))}`);

  return a;
}
