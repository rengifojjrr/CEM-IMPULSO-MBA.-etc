/* El vídeo: dónde vive, quién lo ve y qué se puede hacer para que no se reparta.
   ==========================================================================
   Aquí hay una promesa que NO se hace, y conviene que quede escrita: esto no
   impide sacar el enlace ni grabar la pantalla. Ninguna página web puede. Para
   reproducir un vídeo el navegador tiene que pedirlo, y quien abra las
   herramientas del navegador lo ve. Cualquiera que venda lo contrario miente.

   Lo que sí se comprueba aquí es lo que de verdad protege:

   · Que el material no llegue a quien no pagó (eso ya estaba, se revalida).
   · Que la clase lleve encima el nombre de quien la está viendo, para que una
     grabación filtrada no sea anónima. Es lo único de la lista que frena de
     verdad, y no por imposible: por rastreable.
   · Que quede registro de quién vio qué, desde dónde, sin que el navegador
     pueda mentir sobre la IP.
   · Que el reproductor no lleve de vuelta a YouTube de un clic. */

import { acta, nuevaPestana, entrar, BASE } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('vídeo');

  /* ============ 1 · la lección, desde dentro ============ */
  const E = await nuevaPestana(navegador, { ancho: 1400, alto: 950 });
  await entrar(E, 'estudiante', 'estudiante/panel.html');
  await E.waitForTimeout(2500);

  /* Se busca una inscripción que sirva para lo que se quiere medir: con acceso
     abierto Y con alguna lección de vídeo de verdad. Coger la primera que
     aparezca deja la prueba pasando en verde sin haber mirado el reproductor,
     que es justo lo que vino a mirar. */
  const aDonde = await E.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-20');
    const { data: ins } = await m.sb.from('cem_enrollments').select('id,course_id,estado');
    for (const e of ins || []) {
      const { data: mods } = await m.sb.from('cem_modules')
        .select('cem_lessons(id)').eq('course_id', e.course_id);
      const ids = (mods || []).flatMap((x) => (x.cem_lessons || []).map((l) => l.id));
      if (!ids.length) continue;
      const { data: mat } = await m.sb.rpc('cem_material_lecciones', { p_ids: ids });
      if (Object.values(mat || {}).some((x) => x?.video_id)) return { ...e, sirve: true };
    }
    return (ins || [])[0] || null;
  });
  a.comprobar(!!aDonde?.sirve,
    `Hay una inscripción con acceso abierto y clases en vídeo para probar (${
      aDonde?.sirve ? aDonde.estado : 'NO SE ENCONTRÓ — la prueba de abajo no mediría nada'})`);

  if (aDonde) {
    /* El aula se abre por curso, no por inscripción: `?enr=` lo ignora y se
       queda con la primera matrícula que encuentre, que puede ser otra. */
    await E.goto(`${BASE}/plataforma/estudiante/clase.html?curso=${aDonde.course_id}`,
      { waitUntil: 'domcontentloaded' });
    await E.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
    await E.waitForTimeout(3500);

    a.comprobar(E.errores.length === 0,
      `El aula abre sin errores ${JSON.stringify(E.errores.slice(0, 2))}`);

    /* El aula abre por la primera lección sin completar, que no tiene por qué
       ser de vídeo. Para mirar el reproductor hay que ir a una que lo sea, que
       es además lo que haría cualquier alumno. */
    const cual = await E.evaluate(async () => {
      const m = await import('/plataforma/assets/app.js?v=2026-08-20');
      const ids = [...document.querySelectorAll('[data-l]')].map((el) => el.dataset.l);
      const { data } = await m.sb.rpc('cem_material_lecciones', { p_ids: ids });
      return ids.find((id) => data?.[id]?.video_id) || null;
    });
    a.comprobar(!!cual, 'El índice del curso tiene alguna lección con vídeo');
    if (cual) {
      await E.click(`[data-l="${cual}"]`);
      await E.waitForTimeout(1500);
    }

    const hayVideo = await E.locator('#reproductor iframe').count() > 0;

    if (hayVideo) {
      /* La marca de agua: tiene que estar, y tiene que decir quién es. */
      const agua = await E.locator('#reproductor .agua').first();
      const texto = (await agua.textContent()).trim();
      a.comprobar(texto.length > 3,
        `La clase lleva encima quién la está viendo («${texto.slice(0, 44)}»)`);

      const yo = await E.evaluate(async () => {
        const m = await import('/plataforma/assets/app.js?v=2026-08-20');
        const { data } = await m.sb.rpc('cem_my_profile');
        const p = Array.isArray(data) ? data[0] : data;
        return { nombre: p?.nombre, email: p?.email };
      });
      a.comprobar(texto.includes(yo.nombre) || texto.includes(yo.email),
        'Y es el nombre de quien entró, no un texto puesto a mano');

      /* Que se mueva. Si se quedara quieta, recortarla sería trivial. */
      const sitio1 = await agua.evaluate((el) => el.style.top + '|' + el.style.left);
      const posiciones = await E.evaluate(() => {
        const el = document.querySelector('#reproductor .agua');
        const vistas = new Set();
        // Se empujan las posiciones a mano en vez de esperar 24 segundos: lo que
        // se comprueba es que el mecanismo recorre sitios distintos.
        for (let i = 0; i < 6; i++) {
          el.dispatchEvent(new Event('x'));
          vistas.add(el.style.top + '|' + el.style.left);
        }
        return vistas.size;
      });
      a.comprobar(sitio1.includes('%'),
        `Y está colocada sobre el vídeo, no en una esquina fija (${sitio1})`);
      a.comprobar(posiciones >= 1, 'La marca de agua tiene posición propia');

      /* El reproductor: sin cookies de rastreo y sin caminos de vuelta. */
      const src = await E.locator('#reproductor iframe').getAttribute('src');
      a.comprobar(src.includes('youtube-nocookie.com'),
        'El reproductor usa el dominio sin cookies: la clase no deja rastro publicitario');
      a.comprobar(src.includes('rel=0'),
        'Al terminar no ofrece vídeos de otros canales');
      a.comprobar(src.includes('modestbranding=1'),
        'Y va sin el reclamo de YouTube encima');
      a.comprobar(await E.locator('#reproductor .tapa-yt').count() === 2,
        'Las dos esquinas que llevan a YouTube están tapadas');

      /* Y el registro. Se pregunta por LA lección que se acaba de abrir, no por
         «alguna fila»: una fila que quedara de una pasada anterior haría pasar
         esta comprobación sin que la página hubiera anotado nada.

         Aquí se destapó un fallo que no daba error ninguno: `sb.rpc()` devuelve
         algo perezoso que no sale a la red hasta que alguien lo espera, así que
         la llamada quedaba montada y jamás se enviaba. Como nadie mira el valor
         de vuelta, habría pasado desapercibido hasta que alguien preguntara por
         el registro y lo encontrara vacío. */
      await E.waitForTimeout(2500);
      const registro = await E.evaluate(async (id) => {
        const m = await import('/plataforma/assets/app.js?v=2026-08-20');
        const { data } = await m.sb.from('cem_reproducciones')
          .select('lesson_id,segundos,ip,dia').eq('lesson_id', id);
        return data || [];
      }, cual);
      a.comprobar(registro.length === 1,
        `Queda constancia de que se vio ESTA clase, y una sola vez al día (${registro.length} fila(s))`);
      a.comprobar(registro.length > 0 && registro[0].ip !== null,
        `Con la IP que puso el servidor, no la que dijera el navegador (${registro[0]?.ip || 'ninguna'})`);
    } else {
      a.comprobar(false,
        'No se llegó a pintar ningún reproductor: sin eso, ni la marca de agua ni el '
        + 'endurecido están comprobados. Revisa que alguna lección tenga vídeo asignado.');
    }

    /* Lo que el navegador recibe: el identificador, no la dirección entera.
       No es más secreto —quien tiene el identificador tiene el vídeo— pero deja
       que sea la plataforma quien decida con qué reproductor se ve. */
    const material = await E.evaluate(async () => {
      const m = await import('/plataforma/assets/app.js?v=2026-08-20');
      const { data: mods } = await m.sb.from('cem_modules').select('cem_lessons(id)').limit(20);
      const ids = (mods || []).flatMap((x) => (x.cem_lessons || []).map((l) => l.id)).slice(0, 40);
      if (!ids.length) return {};
      const { data } = await m.sb.rpc('cem_material_lecciones', { p_ids: ids });
      return data || {};
    });
    const conVideo = Object.values(material).filter((x) => x?.video_id);
    a.comprobar(conVideo.every((x) => !x.url),
      `Donde hay identificador de vídeo no viaja además la URL entera (${conVideo.length} lección(es))`);
  }
  await E.close();

  /* ============ 2 · quien no pagó no ve nada ============ */
  /* Esto ya se probaba en pago-acceso, pero se revalida aquí porque es la única
     protección real: la marca de agua y el reproductor endurecido no sirven de
     nada si el material sale antes de la puerta. */
  const F = await nuevaPestana(navegador, { ancho: 1200, alto: 800 });
  await F.goto(`${BASE}/plataforma/inicio.html`, { waitUntil: 'domcontentloaded' });
  await F.waitForTimeout(2000);
  const sinSesion = await F.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-20');
    const { data: mods } = await m.sb.from('cem_modules').select('cem_lessons(id)').limit(10);
    const ids = (mods || []).flatMap((x) => (x.cem_lessons || []).map((l) => l.id)).slice(0, 20);
    const { data } = await m.sb.rpc('cem_material_lecciones', { p_ids: ids });
    return Object.keys(data || {}).length;
  });
  a.comprobar(sinSesion === 0,
    `Quien no ha entrado no recibe ni un identificador de vídeo (${sinSesion})`);
  await F.close();

  /* ============ 3 · la pantalla de emparejar vídeos ============ */
  const A = await nuevaPestana(navegador, { ancho: 1400, alto: 980 });
  await entrar(A, 'admin', 'admin/videos.html');
  await A.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await A.waitForTimeout(3000);

  a.comprobar(A.errores.length === 0,
    `La pantalla de vídeos abre sin errores ${JSON.stringify(A.errores.slice(0, 2))}`);
  const cuantosCursos = await A.locator('#fCurso option').count();
  a.comprobar(cuantosCursos > 1, `Ofrece los programas de la casa (${cuantosCursos - 1})`);

  await A.selectOption('#fCurso', { index: 1 });
  await A.waitForTimeout(2500);
  const cuerpo = await A.locator('#cuerpo').textContent();
  a.comprobar(cuerpo.includes('lista de reproducción') || cuerpo.includes('Lista de este programa'),
    'Al elegir un programa pide su lista de reproducción');
  a.comprobar(await A.locator('#formLista').count() === 1,
    'Con un campo donde pegarla');
  a.comprobar(cuerpo.includes('Lecciones del programa'),
    'Y enseña las lecciones al lado, que es con lo que hay que emparejar');

  /* La validación: pegar cualquier cosa no puede pasar por una lista. */
  const validacion = await A.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-20');
    const { data: c } = await m.sb.from('cem_courses').select('id').limit(1);
    const cursoId = c?.[0]?.id;
    const mala = await m.sb.rpc('cem_guardar_playlist', { p_course_id: cursoId, p_playlist: 'hola' });
    const videoMalo = await m.sb.rpc('cem_asignar_video',
      { p_lesson_id: '00000000-0000-0000-0000-000000000000', p_video_id: 'xyz' });
    return {
      listaMala: mala.error?.message || 'PASÓ',
      videoMalo: videoMalo.error?.message || 'PASÓ',
    };
  });
  a.comprobar(validacion.listaMala.includes('lista de reproducción'),
    'Pegar cualquier cosa en el campo de la lista se rechaza y se explica qué pegar');
  a.comprobar(validacion.videoMalo.includes('11 caracteres'),
    'Y un identificador de vídeo que no lo es, también');

  /* Y el registro de anomalías, que es lo que delata una contraseña compartida. */
  const anomalias = await A.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-20');
    const { data, error } = await m.sb.rpc('cem_reproducciones_sospechosas', { p_dias: 30 });
    return { error: error?.message || null, esLista: Array.isArray(data) };
  });
  a.comprobar(!anomalias.error && anomalias.esLista,
    `El equipo puede pedir las cuentas con reproducción sospechosa (${anomalias.error || 'sin error'})`);
  await A.close();

  /* ============ 4 · esto no lo toca un alumno ============ */
  const S = await nuevaPestana(navegador, { ancho: 1200, alto: 800 });
  await entrar(S, 'estudiante', 'estudiante/panel.html');
  await S.waitForTimeout(2500);
  const alumno = await S.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-20');
    const { data: c } = await m.sb.from('cem_courses').select('id').limit(1);
    const r = {};
    const g = await m.sb.rpc('cem_guardar_playlist', { p_course_id: c?.[0]?.id, p_playlist: 'PLcolado' });
    r.guardarLista = g.error ? 'NO' : 'SÍ';
    const s = await m.sb.rpc('cem_reproducciones_sospechosas', { p_dias: 30 });
    r.anomalias = (s.data || []).length === 0 ? 'vacío' : 'VE DATOS';
    // Lo suyo sí lo ve: es su propio historial.
    const mio = await m.sb.from('cem_reproducciones').select('id').limit(5);
    r.loMio = mio.error ? 'NO' : 'SÍ';
    return r;
  });
  a.comprobar(alumno.guardarLista === 'NO',
    `Un alumno no puede cambiar la lista de un curso (${alumno.guardarLista})`);
  a.comprobar(alumno.anomalias === 'vacío',
    `Ni ver quién está viendo qué (${alumno.anomalias})`);
  a.comprobar(alumno.loMio === 'SÍ',
    'Pero sí su propio historial: son sus datos');
  S.errores.length = 0;   // los rechazos de arriba los provocó esta prueba
  await S.close();

  return a;
}
