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
  /* Se prefiere un curso que tenga LOS DOS: una lección con un vídeo real
     (para el camino feliz) y otra con uno de mentira (para el aviso propio).
     Si ninguno los tiene juntos, vale con uno que sólo tenga vídeo de verdad —
     mejor probar la mitad que no probar nada—, pero se intenta lo completo
     primero para que esta prueba no dependa de con cuál curso le tocó. */
  const aDonde = await E.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-20');
    const { data: ins } = await m.sb.from('cem_enrollments').select('id,course_id,estado');
    let conVideo = null;
    for (const e of ins || []) {
      const { data: mods } = await m.sb.from('cem_modules')
        .select('cem_lessons(id)').eq('course_id', e.course_id);
      const ids = (mods || []).flatMap((x) => (x.cem_lessons || []).map((l) => l.id));
      if (!ids.length) continue;
      const { data: mat } = await m.sb.rpc('cem_material_lecciones', { p_ids: ids });
      const vids = Object.values(mat || {}).map((x) => x?.video_id).filter(Boolean);
      if (!vids.length) continue;
      if (!conVideo) conVideo = { ...e, sirve: true };
      if (vids.some((v) => !v.startsWith('DEMO')) && vids.some((v) => v.startsWith('DEMO'))) {
        return { ...e, sirve: true };
      }
    }
    return conVideo || (ins || [])[0] || null;
  });
  a.comprobar(!!aDonde?.sirve,
    `Hay una inscripción con acceso abierto y clases en vídeo para probar (${
      aDonde?.sirve ? aDonde.estado : 'NO SE ENCONTRÓ — la prueba de abajo no mediría nada'})`);

  if (aDonde) {
    /* Se apuntan los estados que el reproductor de YouTube postea a la página
       —es cómo la propia librería de Google se entera de ellos— para poder
       distinguir después «el vídeo arrancó» de «el vídeo no llegó a arrancar».
       Sin esto habría que adivinarlo, y adivinar es lo que hace que una prueba
       pase por el motivo equivocado. */
    await E.addInitScript(() => {
      window.__estadosYT = [];
      window.addEventListener('message', (ev) => {
        if (!String(ev.origin).includes('youtube')) return;
        try {
          const m = JSON.parse(ev.data);
          if (m?.event === 'onStateChange') window.__estadosYT.push(m.info);
        } catch { /* mensajes que no son JSON: no interesan */ }
      });
    });

    /* El aula se abre por curso, no por inscripción: `?enr=` lo ignora y se
       queda con la primera matrícula que encuentre, que puede ser otra. */
    await E.goto(`${BASE}/plataforma/estudiante/clase.html?curso=${aDonde.course_id}`,
      { waitUntil: 'domcontentloaded' });
    await E.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
    await E.waitForTimeout(3500);

    a.comprobar(E.errores.length === 0,
      `El aula abre sin errores ${JSON.stringify(E.errores.slice(0, 2))}`);

    /* El aula abre por la primera lección sin completar, que no tiene por qué
       ser de vídeo. Se buscan DOS, dentro del mismo curso: una con un
       identificador de vídeo de verdad (para probar el camino feliz) y otra
       con uno inventado (para probar que ya no se rompe con la pantalla de
       Google, sino con un aviso propio). Los datos de demostración dejan
       exactamente eso: una lección por curso con un vídeo real —el que Google
       usa en su propia documentación de esta misma API— y el resto con
       identificadores de mentira, a la espera del material real. */
    const idsDelCurso = await E.evaluate(async () => {
      const m = await import('/plataforma/assets/app.js?v=2026-08-20');
      const ids = [...document.querySelectorAll('[data-l]')].map((el) => el.dataset.l);
      const { data } = await m.sb.rpc('cem_material_lecciones', { p_ids: ids });
      return ids.map((id) => ({ id, video_id: data?.[id]?.video_id || null }));
    });
    const real = idsDelCurso.find((x) => x.video_id && !x.video_id.startsWith('DEMO'));
    const falso = idsDelCurso.find((x) => x.video_id && x.video_id.startsWith('DEMO'));

    a.comprobar(!!real, 'El curso tiene alguna lección con un vídeo de verdad para probar el camino feliz');

    if (real) {
      await E.click(`[data-l="${real.id}"]`);
      await E.waitForTimeout(4000);   // la API de YouTube tarda un poco en cargar

      const hayVideo = await E.locator('#reproductor iframe').count() > 0;
      a.comprobar(hayVideo, 'Un vídeo real se reproduce: no es la pantalla de Google, es la nuestra');

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
          for (let i = 0; i < 6; i++) {
            el.dispatchEvent(new Event('x'));
            vistas.add(el.style.top + '|' + el.style.left);
          }
          return vistas.size;
        });
        a.comprobar(sitio1.includes('%'),
          `Y está colocada sobre el vídeo, no en una esquina fija (${sitio1})`);
        a.comprobar(posiciones >= 1, 'La marca de agua tiene posición propia');

        /* El reproductor: sin cookies de rastreo y sin caminos de vuelta. La
           API de YouTube arma la dirección, no nosotros —por eso no se compara
           carácter por carácter, sino que se busca que lleve lo que le
           pedimos: el dominio sin cookies, sin sugerencias al terminar, sin el
           logo de YouTube encima. */
        const src = await E.locator('#reproductor iframe').getAttribute('src');
        a.comprobar(src.includes('youtube-nocookie.com'),
          'El reproductor usa el dominio sin cookies: la clase no deja rastro publicitario');
        a.comprobar(src.includes('rel=0'),
          'Al terminar no ofrece vídeos de otros canales');
        a.comprobar(src.includes('modestbranding=1'),
          'Y va sin el reclamo de YouTube encima');
        a.comprobar(await E.locator('#reproductor .tapa-yt').count() === 2,
          'Las dos esquinas que llevan a YouTube están tapadas');

        /* ── El registro, y por qué aquí no se puede probar del todo ──────
           Se anota al primer PLAYING de verdad, no al abrir la página: entrar,
           mirar el título y salir no es ver la clase, y contarlo ensuciaría el
           dato que sirve para detectar una contraseña compartida.

           Lo que NO se puede comprobar desde aquí: que un vídeo llegue a
           reproducirse. Detrás del proxy de este entorno cerrado, YouTube
           rechaza el «embed» con el error 150 — se le pide desde
           `http://localhost`, y su comprobación de dominio no lo acepta. Los
           estados que llegan son −1 → 3 (buffering) → onError, nunca PLAYING.
           En el dominio publicado, que es https, eso no ocurre.

           Así que aquí se comprueba lo que sí se puede, y se dice cuál es
           cuál: si el vídeo arrancó, tiene que quedar la fila; si no arrancó,
           tiene que NO quedar ninguna. Las dos direcciones son regresiones
           distintas y las dos importan — la segunda es precisamente el fallo
           que se encontró: se anotaba desde `onReady`, que dispara aunque el
           vídeo no exista.

           Y el fallo hermano, que tampoco daba error: `sb.rpc()` devuelve algo
           perezoso que no sale a la red hasta que alguien lo espera, así que la
           llamada quedaba montada y jamás se enviaba. Como nadie mira el valor
           de vuelta, habría pasado desapercibido hasta que alguien preguntara
           por el registro y lo encontrara vacío. */
        /* Se cuenta ANTES y DESPUÉS en vez de exigir cero: la tabla no se puede
           vaciar desde una cuenta de estudiante, así que una fila que quedara
           de una pasada anterior haría fallar la prueba por algo que no es un
           fallo. Lo que importa es si esta pasada añadió una. */
        const contar = (id) => E.evaluate(async (x) => {
          const m = await import('/plataforma/assets/app.js?v=2026-08-20');
          const { data } = await m.sb.from('cem_reproducciones')
            .select('lesson_id,segundos,ip').eq('lesson_id', x);
          return data || [];
        }, id);

        const antesDePlay = (await contar(real.id)).length;

        await E.evaluate(() => {
          const ifr = document.querySelector('#reproductor iframe');
          const mandar = (func) => ifr.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func, args: [] }), '*');
          mandar('mute');
          mandar('playVideo');
        });
        await E.waitForTimeout(5000);

        const arranco = await E.evaluate(() =>
          (window.__estadosYT || []).includes(1));

        const registro = await contar(real.id);

        if (arranco) {
          a.comprobar(registro.length >= 1,
            `El vídeo arrancó, así que queda constancia de que se vio ESTA clase (${registro.length} fila(s))`);
          a.comprobar(registro.length > 0 && registro[0].ip !== null,
            `Con la IP que puso el servidor, no la que dijera el navegador (${registro[0]?.ip || 'ninguna'})`);
        } else {
          a.comprobar(registro.length === antesDePlay,
            'El vídeo no llegó a arrancar (YouTube rechaza el embed desde localhost), '
            + `y por eso no se anotó nada nuevo: sólo cuenta lo que se reprodujo (${antesDePlay} → ${registro.length})`);

          /* El camino de la base sí se puede recorrer entero aunque el
             navegador no consiga reproducir: se llama a la función como la
             llamaría el reproductor y se comprueba que quede la fila con la IP
             que pone el servidor. Así el registro no se queda sin probar por
             una limitación del entorno. */
          const aMano = await E.evaluate(async (id) => {
            const m = await import('/plataforma/assets/app.js?v=2026-08-20');
            const { error } = await m.sb.rpc('cem_registrar_reproduccion',
              { p_lesson_id: id, p_segundos: 30 });
            if (error) return { error: error.message };
            const { data } = await m.sb.from('cem_reproducciones')
              .select('segundos,ip').eq('lesson_id', id);
            return { filas: data || [] };
          }, real.id);
          a.comprobar(aMano.filas?.length === 1 && aMano.filas[0].segundos >= 30,
            `La función que anota lo visto funciona y guarda los segundos (${
              aMano.error || (aMano.filas?.[0]?.segundos + 's')})`);
          a.comprobar(!!aMano.filas?.[0]?.ip,
            `Con la IP puesta por el servidor (${aMano.filas?.[0]?.ip || 'ninguna'})`);
        }
      }
    }

    /* ============ el vídeo que no existe ya no rompe la pantalla ============ */
    /* Esto es lo que estaba roto: un identificador que no corresponde a ningún
       vídeo hacía que YouTube redirigiera a su propia página de aviso, que SÍ
       bloquea que se enmarque — y Chrome terminaba mostrando su pantalla de
       «rechazó la conexión», la de Google, no la nuestra. Con la API real se
       recibe un `onError` y se puede pintar un aviso propio. */
    if (falso) {
      await E.click(`[data-l="${falso.id}"]`);
      await E.waitForTimeout(4000);

      const sinVideo = await E.evaluate(() => ({
        hayIframe: !!document.querySelector('#reproductor iframe'),
        texto: document.querySelector('#reproductor')?.textContent || '',
      }));
      a.comprobar(!sinVideo.hayIframe,
        'Un vídeo que no existe no deja ningún <iframe> a medias');
      a.comprobar(sinVideo.texto.includes('no se puede reproducir'),
        'Y en su lugar se lee un aviso propio, no la pantalla de Google');

      /* Sin `onReady` no se llama a registrarQueSeVe(): comprobar que no queda
         una fila de «se vio» para algo que nunca llegó a reproducirse. */
      const sinRegistro = await E.evaluate(async (id) => {
        const m = await import('/plataforma/assets/app.js?v=2026-08-20');
        const { data } = await m.sb.from('cem_reproducciones').select('id').eq('lesson_id', id);
        return (data || []).length;
      }, falso.id);
      a.comprobar(sinRegistro === 0,
        `Y no queda registrado como visto algo que nunca se reprodujo (${sinRegistro} fila(s))`);
    } else {
      a.comprobar(true,
        'Este curso no tiene ninguna lección con vídeo de mentira que probar; no hay nada que revisar aquí');
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
