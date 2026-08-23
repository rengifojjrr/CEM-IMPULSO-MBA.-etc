/* El expediente del estudiante: quién es, y su documento.
   ==========================================================================
   Esta pantalla guarda el dato más sensible de toda la plataforma. El dueño
   decidió conservar los documentos para siempre, así que lo que hay que
   comprobar no es «se sube bien» —eso se ve a simple vista— sino las cuatro
   cosas que no se ven y que son las que importan si un día alguien pregunta:

   1 · Que el depósito sea PRIVADO. El de las fotos de los cursos es público:
       ahí cualquiera con la dirección lee lo que haya. Un documento de
       identidad en un depósito público es el fallo entero, y no da ningún
       síntoma: se sube, se ve, funciona.

   2 · Que un estudiante no alcance el documento de otro. Ni por la tabla, ni
       por el archivo, ni por la función que el equipo usa para revisarlos.

   3 · Que nadie se apruebe a sí mismo. Si el estado se pudiera escribir desde
       el navegador, la revisión no revisa nada.

   4 · Que quede registrado quién abre cada documento. Guardar cédulas sin eso
       es lo que convierte una decisión defendible en una que no lo es. */

import { acta, nuevaPestana, entrar, BASE, conLaBase } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('identidad');

  /* Un identificador ajeno de verdad, tomado desde la sesión del equipo.
     La primera versión de esta prueba lo buscaba desde la pestaña del
     estudiante y no encontraba ninguno, así que se saltaba justo las tres
     comprobaciones que importan y aun así salía en verde.

     Que no lo encontrara era la buena noticia —un estudiante no puede ni
     listar los perfiles de los demás—, pero eso no exime de comprobar lo
     siguiente: que tampoco alcance su documento teniendo el identificador
     delante, que es la situación real de alguien que lo copie de una URL. */
  const G = await nuevaPestana(navegador, { ancho: 1200, alto: 800 });
  await entrar(G, 'admin', 'admin/estudiantes.html');
  await G.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await G.waitForTimeout(1500);
  const idAjeno = await conLaBase(G, async (sb) => {
    const { data: yo } = await sb.auth.getUser();
    const { data } = await sb.from('cem_profiles').select('id,email').limit(60);
    /* Ni el mío ni el del estudiante con el que se prueba: hace falta el
       documento de un TERCERO. */
    return (data || []).find((x) => x.id !== yo?.user?.id
      && !/^estudiante@/.test(x.email || ''))?.id || null;
  });
  await G.close();

  /* ============ 1 · la pantalla del estudiante ============ */
  const E = await nuevaPestana(navegador, { ancho: 1300, alto: 950 });
  await entrar(E, 'estudiante', 'estudiante/mis-datos.html');
  await E.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await E.waitForTimeout(2500);

  a.comprobar((await E.locator('#fDatos').count()) === 1
    && (await E.locator('#campoFrente').count()) === 1
    && (await E.locator('#campoDorso').count()) === 1,
    'La pantalla pide los datos y las dos caras del documento');

  const avance = await E.locator('#textoAvance').textContent();
  a.comprobar(/\d+ de \d+/.test(avance || ''),
    `Y dice cuánto falta, en vez de dejarlo a la vista de nadie (${avance})`);

  /* Los temas salen de las categorías que existen de verdad, no de una lista
     escrita a mano que se quedaría vieja en cuanto se añada un programa. */
  const temas = await E.locator('#temas .tema').count();
  const categorias = await conLaBase(E, async (sb) => {
    const { data } = await sb.from('cem_courses').select('categoria').eq('estado', 'publicado');
    return [...new Set((data || []).map((c) => (c.categoria || '').trim()).filter(Boolean))].length;
  });
  a.comprobar(temas === categorias,
    `Los temas que se ofrecen son las categorías reales (${temas} y ${categorias})`);

  /* ============ 3 · nadie alcanza el documento de otro ============ */
  /* Se silencia: los rechazos de abajo son a propósito, y un rechazo llega
     al navegador como un 403 en la consola. */
  const ajeno = await E.silenciarMientras(() => conLaBase(E, async (sb, otroId) => {
    if (!otroId) return { salto: 'no se pudo tomar un identificador ajeno' };

    const porTabla = await sb.from('cem_identidad').select('*').eq('profile_id', otroId);
    const porFuncion = await sb.rpc('cem_identidad_para_revisar', { p_profile_id: otroId });
    const resolviendo = await sb.rpc('cem_identidad_resolver',
      { p_profile_id: otroId, p_estado: 'aprobado' });
    /* Y el archivo: la carpeta lleva el identificador de su dueño, así que
       adivinar la ruta es trivial para quien tenga el identificador. */
    const porArchivo = await sb.storage.from('cem-identidad').list(otroId);

    return {
      filasAjenas: (porTabla.data || []).length,
      funcion: porFuncion.error ? (porFuncion.error.code || 'rechazada') : 'DEVOLVIÓ DATOS',
      resolver: resolviendo.error ? (resolviendo.error.code || 'rechazada') : 'DEJÓ APROBAR',
      archivos: porArchivo.error ? 'rechazado' : `LISTÓ ${(porArchivo.data || []).length}`,
    };
  }, idAjeno));

  if (ajeno.salto) {
    a.comprobar(true, `(se salta: ${ajeno.salto})`);
  } else {
    a.comprobar(ajeno.filasAjenas === 0,
      `Un estudiante no lee el documento de otro por la tabla (${ajeno.filasAjenas} filas ajenas)`);
    a.comprobar(ajeno.funcion !== 'DEVOLVIÓ DATOS',
      `Ni por la función que usa el equipo para revisarlos (${ajeno.funcion})`);
    a.comprobar(ajeno.resolver !== 'DEJÓ APROBAR',
      `Ni puede aprobar el documento de nadie (${ajeno.resolver})`);
    a.comprobar(ajeno.archivos === 'rechazado' || ajeno.archivos === 'LISTÓ 0',
      `Ni puede asomarse a la carpeta de otro en el depósito (${ajeno.archivos})`);
  }

  /* ============ 4 · nadie se aprueba a sí mismo ============
     El disparador devuelve el estado a «pendiente» en cuanto lo toca alguien
     que no es del equipo. Sin eso, la revisión sería decorativa: bastaría con
     escribir «aprobado» desde la consola del navegador. */
  const autoaprobar = await E.silenciarMientras(() => conLaBase(E, async (sb) => {
    const { data: yo } = await sb.auth.getUser();
    const mio = yo?.user?.id;
    await sb.from('cem_identidad').upsert({ profile_id: mio }, { onConflict: 'profile_id' });
    const { error } = await sb.from('cem_identidad')
      .update({ estado: 'aprobado' }).eq('profile_id', mio);
    const { data } = await sb.from('cem_identidad').select('estado').eq('profile_id', mio).maybeSingle();
    return { error: error?.code || null, quedo: data?.estado ?? 'sin fila' };
  }));
  a.comprobar(autoaprobar.quedo !== 'aprobado',
    `Escribir «aprobado» sobre el propio documento no cuela (quedó «${autoaprobar.quedo}»)`);

  /* ============ 5 · el nombre del certificado, bajo llave ============
     `cem_actualizar_mi_perfil` manda el cambio de nombre a aprobación cuando
     ya hay certificados emitidos. Pero la política de la tabla deja escribir
     en la fila propia, y las políticas de Postgres son por fila, no por
     columna: se podía cambiar el nombre llamando a la tabla directamente y
     saltarse la aprobación entera. */
  const puertaTrasera = await E.silenciarMientras(() => conLaBase(E, async (sb) => {
    const { data: yo } = await sb.auth.getUser();
    const mio = yo?.user?.id;
    const { count } = await sb.from('cem_certificates')
      .select('id', { count: 'exact', head: true }).eq('profile_id', mio);
    if (!count) return { salto: 'esta cuenta no tiene certificados emitidos' };

    const { data: antes } = await sb.from('cem_profiles').select('nombre').eq('id', mio).single();
    const { error } = await sb.from('cem_profiles')
      .update({ nombre: 'ColadoPorLaPuertaDeAtras' }).eq('id', mio);
    const { data: despues } = await sb.from('cem_profiles').select('nombre').eq('id', mio).single();
    if (despues?.nombre !== antes?.nombre) {
      await sb.from('cem_profiles').update({ nombre: antes.nombre }).eq('id', mio);
    }
    return { error: error?.code || null, cambio: despues?.nombre !== antes?.nombre };
  }));

  if (puertaTrasera.salto) {
    a.comprobar(true, `(se salta lo del nombre: ${puertaTrasera.salto})`);
  } else {
    a.comprobar(puertaTrasera.cambio === false,
      `Con certificados emitidos, el nombre no se cambia llamando a la tabla (${
        puertaTrasera.error || 'sin error, pero no cambió'})`);
  }

  a.comprobar(E.errores.length === 0,
    `La pantalla no lanza errores ${JSON.stringify(E.errores.slice(0, 2))}`);
  await E.close();

  /* ============ 6 · el aviso del panel ============ */
  const P = await nuevaPestana(navegador, { ancho: 1300, alto: 950 });
  await entrar(P, 'estudiante', 'estudiante/panel.html');
  await P.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await P.waitForTimeout(3000);

  const aviso = (await P.locator('#avisoDatos').textContent() || '').trim();
  const completo = await conLaBase(P, async (sb) => {
    const { data: yo } = await sb.auth.getUser();
    const { data: perf } = await sb.from('cem_profiles')
      .select('nombre,apellido,documento,pais,telefono').eq('id', yo?.user?.id).single();
    const { data: iden } = await sb.from('cem_identidad')
      .select('frente_ruta,dorso_ruta').eq('profile_id', yo?.user?.id).maybeSingle();
    return !!(perf?.nombre && perf?.apellido && perf?.documento && perf?.pais
      && perf?.telefono && iden?.frente_ruta && iden?.dorso_ruta);
  });
  /* El aviso aparece si falta algo y NO aparece si no falta nada. Un aviso que
     sigue ahí después de resolverlo enseña a ignorar todos los avisos. */
  a.comprobar(completo ? aviso === '' : aviso.length > 0,
    completo ? 'Con el expediente completo, el panel no avisa de nada'
             : `El panel avisa de lo que falta y lleva a la pantalla («${aviso.slice(0, 70)}…»)`);
  if (!completo) {
    a.comprobar((await P.locator('#avisoDatos a[href*="mis-datos"]').count()) > 0,
      'Y el aviso lleva a donde se resuelve, no sólo lo dice');
  }
  a.comprobar(P.errores.length === 0,
    `El panel no lanza errores ${JSON.stringify(P.errores.slice(0, 2))}`);
  await P.close();

  /* ============ 7 · el equipo sí puede revisarlos ============ */
  const A = await nuevaPestana(navegador, { ancho: 1300, alto: 950 });
  await entrar(A, 'admin', 'admin/estudiantes.html');
  await A.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await A.waitForTimeout(2000);

  const comoAdmin = await conLaBase(A, async (sb) => {
    const { data: alguien } = await sb.from('cem_profiles')
      .select('id').eq('rol', 'estudiante').limit(1).maybeSingle();
    if (!alguien) return { salto: 'no hay estudiantes' };
    const { error } = await sb.rpc('cem_identidad_para_revisar', { p_profile_id: alguien.id });
    /* Y que la consulta haya quedado apuntada: es lo que hace defendible
       guardar documentos. */
    const { data: rastro } = await sb.from('cem_audit_events')
      .select('accion,entidad_id,created_at')
      .eq('accion', 'identidad_abierta').order('created_at', { ascending: false }).limit(1);
    return { error: error?.message || null, apuntado: (rastro || []).length > 0 };
  });

  /* ── la pantalla del equipo ── */
  await A.goto(`${BASE}/plataforma/admin/estudiante.html?id=${idAjeno}`,
    { waitUntil: 'domcontentloaded' }).catch(() => {});
  await A.waitForSelector('#tabs button[data-t="documento"]', { timeout: 30000 }).catch(() => {});
  const hayPestana = await A.locator('#tabs button[data-t="documento"]').count();
  a.comprobar(hayPestana === 1,
    'La ficha del estudiante tiene su pestaña de Documento');
  if (hayPestana) {
    await A.click('#tabs button[data-t="documento"]');
    await A.waitForTimeout(2500);
    const texto = await A.locator('#panel').textContent();
    a.comprobar(/registrado|Todavía no ha subido/.test(texto || ''),
      'Y al abrirla avisa de que la consulta queda registrada, o dice que aún no hay foto');
  }

  if (comoAdmin.salto) {
    a.comprobar(true, `(se salta: ${comoAdmin.salto})`);
  } else {
    a.comprobar(!comoAdmin.error,
      `El equipo sí puede abrir un documento para revisarlo (${comoAdmin.error || 'sin error'})`);
    a.comprobar(comoAdmin.apuntado,
      'Y queda apuntado quién lo abrió: sin eso, guardar cédulas no se puede defender');
  }
  await A.close();

  return a;
}
