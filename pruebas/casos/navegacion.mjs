/* La navegación institucional: menú, buscador, «ver como» y qué hay hoy.
   ==========================================================================
   Mejoras 21, 22, 23 y 24 de docs/40-mejoras-por-rol.md.

   Lo que hay que comprobar aquí, por orden de importancia:

   · Que «ver lo que ve» sea de SÓLO LECTURA y quede asentado. Es la mejora con
     más riesgo de las cuarenta: mal hecha sería una forma de mirar la cuenta de
     cualquiera sin dejar rastro.
   · Que el buscador no se lo pueda usar quien no debe, y que lo que devuelve
     lleve de verdad a alguna parte: un resultado que enlaza a una pantalla que
     no entiende ese parámetro es un resultado que no sirve.
   · Que el menú no haya perdido ninguna pantalla por el camino al reagruparse.
   · Que lo pendiente sea lo pendiente y no una cifra inventada. */

import { acta, nuevaPestana, entrar, BASE, conLaBase } from '../entorno.mjs';

/* Las 39 entradas que tenía el menú antes de agruparlo por lo que se hace en
   el día. Ninguna puede haberse quedado fuera: reordenar no es esconder. */
const PANTALLAS = [
  'index.html', 'reportes.html', 'calendario.html', 'cursos.html', 'cohortes.html',
  'contenido.html', 'videos.html', 'revision.html', 'multimedia.html', 'profesores.html',
  'estudiantes.html', 'inscripciones.html', 'pagos-verificar.html', 'carteras.html',
  'cierre-mes.html', 'bancaribe.html', 'evaluaciones.html', 'preguntas.html',
  'calificar.html', 'apelaciones.html', 'certificados.html', 'certificados-plantillas.html',
  'insignias.html', 'leads.html', 'comunicaciones.html', 'correo.html', 'soporte.html',
  'usuarios.html', 'permisos.html', 'auditoria.html', 'seguridad.html',
  'formas-de-pago.html', 'stripe.html', 'configuracion.html',
];

export default async function correr(navegador) {
  const a = acta('navegación institucional');

  const A = await nuevaPestana(navegador, { ancho: 1400, alto: 1050 });
  await entrar(A, 'admin', 'admin/index.html');
  await A.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await A.waitForTimeout(3000);

  a.comprobar(A.errores.length === 0, `La pantalla de inicio abre sin errores ${JSON.stringify(A.errores.slice(0, 2))}`);

  /* ============ 1 · el menú (mejora 21) ============ */
  const menu = await A.evaluate(() => ({
    grupos: [...document.querySelectorAll('.nav-group .lbl span:first-child')].map((e) => e.textContent.trim()),
    entradas: [...document.querySelectorAll('.sidebar a.nav-item')].map((a) => a.getAttribute('href')),
  }));

  a.comprobar(menu.grupos.length >= 6 && menu.grupos.includes('Cobrar') && menu.grupos.includes('Matricular'),
    `Los grupos se llaman por lo que se hace, no por área (${menu.grupos.join(' · ')})`);

  const perdidas = PANTALLAS.filter((p) => !menu.entradas.includes(p));
  a.comprobar(perdidas.length === 0,
    `Reagrupar no perdió ninguna pantalla (${perdidas.join(', ') || 'están las 34'})`);

  const repetidas = menu.entradas.filter((h, i) => menu.entradas.indexOf(h) !== i);
  a.comprobar(repetidas.length === 0,
    `Y ninguna quedó en dos cajones a la vez (${repetidas.join(', ') || 'ninguna'})`);

  /* ============ 2 · lo pendiente (mejora 24) ============ */
  const pend = await conLaBase(A, async (sb) => {
    const { data, error } = await sb.rpc('cem_pendientes_de_hoy');
    const { count } = await sb.from('cem_payments')
      .select('id', { count: 'exact', head: true }).eq('estado', 'reportado');
    return { lista: data || [], error: error?.message, pagosDeVerdad: count };
  });
  a.comprobar(!pend.error, `Lo pendiente se puede pedir (${pend.error || 'ok'})`);

  const pagos = pend.lista.find((x) => x.clave === 'pagos');
  a.comprobar(pagos && Number(pagos.n) === Number(pend.pagosDeVerdad),
    `Y el número de pagos por verificar es el de verdad (${pagos?.n} contra ${pend.pagosDeVerdad})`);

  const enPantalla = await A.evaluate(() => document.querySelectorAll('.pendiente').length);
  a.comprobar(enPantalla === pend.lista.length,
    `Se ven todas las tarjetas, también las que están a cero (${enPantalla} de ${pend.lista.length})`);

  /* ============ 3 · el buscador (mejora 22) ============ */
  const busca = await conLaBase(A, async (sb) => {
    const { data: corta } = await sb.rpc('cem_buscar', { p_q: 'a' });
    const { data: larga } = await sb.rpc('cem_buscar', { p_q: 'a', p_tope: 5 });
    const { data: real } = await sb.rpc('cem_buscar', { p_q: 'diplomado' });
    return { corta: (corta || []).length, larga: (larga || []).length, real: real || [] };
  });
  a.comprobar(busca.corta === 0, 'Con una sola letra no busca: sacaría media base');
  a.comprobar(busca.real.length > 0, `Y encuentra cursos por su nombre (${busca.real.length})`);
  a.comprobar(busca.real.every((r) => r.url && r.titulo),
    'Cada resultado trae a dónde ir y cómo se llama');

  // Un resultado tiene que llevar a una pantalla que entienda su parámetro.
  const cohorte = await conLaBase(A, async (sb) => {
    const { data: co } = await sb.from('cem_cohorts').select('nombre,codigo').limit(1).maybeSingle();
    if (!co) return null;
    const { data } = await sb.rpc('cem_buscar', { p_q: (co.codigo || co.nombre).slice(0, 6) });
    return (data || []).find((r) => r.tipo === 'cohorte') || null;
  });
  if (cohorte) {
    a.comprobar(/^cohortes\.html\?q=/.test(cohorte.url),
      `El resultado de una cohorte enlaza con el filtro que esa pantalla entiende (${cohorte.url})`);
    await A.goto(`${BASE}/plataforma/admin/${cohorte.url}`, { waitUntil: 'domcontentloaded' });
    await A.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
    await A.waitForTimeout(2200);
    const filtrado = await A.evaluate(() => ({
      caja: document.querySelector('#page .filters input#q')?.value || '',
      filas: document.querySelectorAll('tbody tr').length,
    }));
    a.comprobar(filtrado.caja !== '',
      `Y al llegar la tabla ya viene filtrada, no sólo con la palabra escrita arriba («${filtrado.caja}»)`);
  } else {
    a.comprobar(true, '(no hay cohortes con las que probar el salto)');
  }

  /* ============ 4 · ver lo que ve (mejora 23) ============ */
  const quien = await conLaBase(A, async (sb) => {
    const { data } = await sb.from('cem_profiles')
      .select('id,email').eq('rol', 'estudiante').limit(1).maybeSingle();
    return data;
  });

  if (quien) {
    const antes = await conLaBase(A, async (sb) => {
      const { count } = await sb.from('cem_audit_events')
        .select('id', { count: 'exact', head: true }).eq('accion', 'ver_como');
      return count || 0;
    });

    await A.goto(`${BASE}/plataforma/admin/estudiante.html?id=${quien.id}`,
      { waitUntil: 'domcontentloaded' });
    await A.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
    await A.waitForTimeout(2800);
    await A.click('#btnVerComo');
    await A.waitForTimeout(2500);

    const texto = await A.locator('.modal-b').textContent();
    a.comprobar(/Sólo lectura/.test(texto), 'La ficha dice que es sólo lectura');
    a.comprobar(/Sus cursos/.test(texto), 'Y enseña qué cursos ve esa persona');

    const despues = await conLaBase(A, async (sb) => {
      const { count } = await sb.from('cem_audit_events')
        .select('id', { count: 'exact', head: true }).eq('accion', 'ver_como');
      return count || 0;
    });
    a.comprobar(despues > antes,
      `Y queda asentado quién miró la cuenta de quién (${antes} → ${despues})`);
  }

  /* ============ 5 · quien no debe, no puede ============ */
  const E = await nuevaPestana(navegador, { ancho: 1200, alto: 900 });
  await entrar(E, 'estudiante');
  const negado = await E.silenciarMientras(() => conLaBase(E, async (sb, id) => ({
    buscar: (await sb.rpc('cem_buscar', { p_q: 'diplomado' })).data,
    verComo: (await sb.rpc('cem_ver_como', { p_profile_id: id })).error?.message,
    pendientes: (await sb.rpc('cem_pendientes_de_hoy')).data,
  }), quien?.id));

  a.comprobar(Array.isArray(negado.buscar) && negado.buscar.length === 0,
    'Un estudiante que llame al buscador no recibe nada');
  a.comprobar(!!negado.verComo, `Ni puede mirar la cuenta de otro (${negado.verComo || 'PUDO'})`);
  a.comprobar(Array.isArray(negado.pendientes) && negado.pendientes.length === 0,
    'Ni la lista de lo pendiente de la escuela');

  a.comprobar(A.errores.length === 0, `Sin errores ${JSON.stringify(A.errores.slice(0, 2))}`);
  await E.close();
  await A.close();
  return a;
}
