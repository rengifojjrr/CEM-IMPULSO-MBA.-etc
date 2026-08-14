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

  await A.fill('#inpTasa', '45.75');
  await A.click('#btnTasa');
  await A.waitForTimeout(2000);
  a.comprobar((await A.locator('#tasaActual').textContent()).includes('45.75'),
    'El equipo puede cargar la tasa del día a mano');

  /* ============ el estudiante reporta un pago ============ */
  const E = await nuevaPestana(navegador, { ancho: 1300 });
  await entrar(E, 'estudiante', 'estudiante/pagos.html');
  await E.waitForSelector('#cuotas', { timeout: 25000 });
  await E.waitForFunction(() => !/Cargando/.test(document.querySelector('#cuotas')?.textContent || ''),
    null, { timeout: 25000 });

  const porReportar = await E.locator('[data-reportar]').count();
  a.comprobar(porReportar >= 1, 'El estudiante ve sus cuotas pendientes con "Reportar pago"');

  if (porReportar) {
    await E.locator('[data-reportar]').first().click();
    await E.waitForSelector('#rMonto', { timeout: 10000 });
    await E.selectOption('#rMoneda', 'VES');
    await E.fill('#rMonto', '4575');
    await E.waitForTimeout(700);
    a.comprobar(/100/.test(await E.locator('#rEquivalente').textContent()),
      'Calcula el equivalente en dólares en vivo con la tasa cargada');

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
  }

  /* ============ estado de cuenta y recibo ============ */
  await E.goto(`${BASE}/plataforma/estudiante/pagos.html`, { waitUntil: 'domcontentloaded' });
  await E.waitForSelector('#btnEstadoCuenta', { timeout: 25000 });
  await E.waitForFunction(() => !/Cargando/.test(document.querySelector('#cuotas')?.textContent || ''),
    null, { timeout: 25000 });
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

  a.comprobar(A.errores.length === 0,
    `La bandeja de pagos no lanza errores ${JSON.stringify(A.errores.slice(0, 2))}`);
  a.comprobar(E.errores.length === 0,
    `La pantalla de pagos del estudiante tampoco ${JSON.stringify(E.errores.slice(0, 2))}`);

  return a;
}
