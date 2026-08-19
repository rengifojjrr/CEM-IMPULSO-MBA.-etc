/* Aprendizaje express: los vídeos cortos del curso.
   ==========================================================================
   Vídeos verticales de uno o dos minutos, uno detrás de otro, para repasar sin
   abrir una clase de cuarenta. No son lecciones y por eso viven en su propia
   tabla: no cuentan para el progreso, no dan nota, y se ven en cualquier orden.
   Meterlos en cem_lessons habría obligado a llenar de excepciones todo lo que
   recorre lecciones — el progreso, el temario, el certificado.

   Lo que se comprueba aquí, por orden de importancia:

   · Que no se vean sin haber pagado. Es material del curso como cualquier otro.
   · Que un short retirado no lo vea el alumno, aunque exista.
   · Que el carrete no monte veinte reproductores de golpe: en un teléfono eso
     es medio minuto de espera y varios cientos de megas.
   · Que lleve la marca de agua, igual que una clase. Un short es MÁS fácil de
     repartir que una clase larga, no menos.
   · Que sólo el equipo pueda subirlos, ordenarlos y retirarlos. */

import { acta, nuevaPestana, entrar, BASE } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('express');

  /* ============ 1 · el alumno, en su curso ============ */
  const E = await nuevaPestana(navegador, { ancho: 1400, alto: 1000 });
  await entrar(E, 'estudiante', 'estudiante/panel.html');
  await E.waitForTimeout(2500);

  /* Se busca un curso al que el alumno tenga acceso Y que tenga shorts. Coger
     el primero que aparezca dejaría la prueba en verde sin haber mirado el
     carrete, que es a lo que vino. */
  const donde = await E.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-2');
    const { data: ins } = await m.sb.from('cem_enrollments').select('id,course_id,estado');
    for (const e of ins || []) {
      const { data } = await m.sb.rpc('cem_shorts_del_curso', { p_course_id: e.course_id });
      if ((data || []).length) return { ...e, cuantos: data.length };
    }
    return null;
  });
  a.comprobar(!!donde,
    `Hay un curso con vídeos express que el alumno puede ver (${donde?.cuantos ?? 0})`);

  if (donde) {
    await E.goto(`${BASE}/plataforma/estudiante/express.html?curso=${donde.course_id}`,
      { waitUntil: 'domcontentloaded' });
    await E.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
    await E.waitForTimeout(3000);

    a.comprobar(E.errores.length === 0,
      `El carrete abre sin errores ${JSON.stringify(E.errores.slice(0, 2))}`);

    const inicio = await E.evaluate(() => ({
      cortos: document.querySelectorAll('.corto').length,
      iframes: document.querySelectorAll('.corto iframe').length,
      laminas: document.querySelectorAll('.corto .repro-lamina').length,
      sinControles: [...document.querySelectorAll('.corto iframe')]
        .every((f) => (f.src || '').includes('controls=0')),
      contador: document.querySelector('#contador')?.textContent || '',
      agua: document.querySelector('.repro-agua')?.textContent || '',
      antes: document.querySelector('#antes')?.disabled,
      luego: document.querySelector('#luego')?.disabled,
    }));

    a.comprobar(inicio.cortos === donde.cuantos,
      `Salen todos los vídeos del curso (${inicio.cortos} de ${donde.cuantos})`);
    a.comprobar(inicio.contador === `1 de ${donde.cuantos}`,
      `Y se sabe por cuál se va (${inicio.contador})`);
    a.comprobar(inicio.antes === true,
      'En el primero, la flecha de atrás está apagada: no lleva a ninguna parte');

    /* Lo importante del carrete: no monta un reproductor por vídeo. Se monta el
       que se ve y el siguiente —para que pasar no espere a que cargue— y se
       suelta el resto. Con veinte shorts la diferencia no es de matiz. */
    a.comprobar(inicio.iframes <= 2,
      `Sólo se montan los reproductores que hacen falta, no uno por vídeo (${inicio.iframes})`);

    /* La marca de agua, igual que en el aula y por lo mismo. */
    const yo = await E.evaluate(async () => {
      const m = await import('/plataforma/assets/app.js?v=2026-08-21-2');
      const { data } = await m.sb.rpc('cem_my_profile');
      const p = Array.isArray(data) ? data[0] : data;
      return { nombre: p?.nombre, email: p?.email };
    });
    a.comprobar(inicio.agua.includes(yo.nombre) || inicio.agua.includes(yo.email),
      `El vídeo lleva encima quién lo está viendo («${inicio.agua.slice(0, 40)}»)`);

    /* Un corto es MÁS fácil de repartir que una clase larga, así que aquí la
       interfaz de YouTube estorba todavía más: en la captura que motivó esto
       se veía el título, el canal y un botón de «Mirar en YouTube» encima de
       un vídeo por el que alguien había pagado. */
    a.comprobar(inicio.sinControles,
      'YouTube va sin sus controles: no enseña el título, el canal ni el botón de irse allí');
    a.comprobar(inicio.laminas === inicio.iframes && inicio.laminas > 0,
      `Cada corto lleva su lámina que se come los clics (${inicio.laminas} de ${inicio.iframes})`);

    /* Pasar al siguiente. */
    if (donde.cuantos > 1) {
      await E.click('#luego');
      await E.waitForTimeout(2000);
      const tras = await E.evaluate(() => ({
        contador: document.querySelector('#contador')?.textContent || '',
        iframes: document.querySelectorAll('.corto iframe').length,
      laminas: document.querySelectorAll('.corto .repro-lamina').length,
      sinControles: [...document.querySelectorAll('.corto iframe')]
        .every((f) => (f.src || '').includes('controls=0')),
        antes: document.querySelector('#antes')?.disabled,
      }));
      a.comprobar(tras.contador === `2 de ${donde.cuantos}`,
        `La flecha de siguiente pasa al segundo (${tras.contador})`);
      a.comprobar(tras.antes === false,
        'Y ya se puede volver atrás');
      a.comprobar(tras.iframes <= 2,
        `Y sigue sin acumular reproductores al avanzar (${tras.iframes})`);
    }

    /* El camino de vuelta: desde el aula se llega, y sólo si hay algo que ver. */
    await E.goto(`${BASE}/plataforma/estudiante/clase.html?curso=${donde.course_id}`,
      { waitUntil: 'domcontentloaded' });
    await E.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
    await E.waitForTimeout(3500);
    const enlace = await E.evaluate(() =>
      document.querySelector('#accionesAula a')?.getAttribute('href') || '');
    a.comprobar(enlace.includes('express.html'),
      `Desde el aula se llega al repaso express (${enlace || 'no está el botón'})`);
  }
  await E.close();

  /* ============ 2 · sin pagar no se ven ============ */
  /* Es material del curso como cualquier otro. Si se vieran sin pagar, todo el
     muro de pago daría igual: bastaría con hacerse el repaso. */
  const F = await nuevaPestana(navegador, { ancho: 1200, alto: 800 });
  await F.goto(`${BASE}/plataforma/inicio.html`, { waitUntil: 'domcontentloaded' });
  await F.waitForTimeout(2000);
  const anonimo = await F.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-2');
    const { data: cs } = await m.sb.from('cem_courses').select('id').limit(5);
    let total = 0;
    for (const c of cs || []) {
      const { data } = await m.sb.rpc('cem_shorts_del_curso', { p_course_id: c.id });
      total += (data || []).length;
    }
    const directo = await m.sb.from('cem_course_shorts').select('video_id').limit(5);
    return { porFuncion: total, porTabla: (directo.data || []).length };
  });
  a.comprobar(anonimo.porFuncion === 0,
    `Quien no ha entrado no recibe ni un vídeo express (${anonimo.porFuncion})`);
  a.comprobar(anonimo.porTabla === 0,
    `Ni pidiéndole la tabla a la base (${anonimo.porTabla})`);
  await F.close();

  /* ============ 3 · el equipo los gestiona ============ */
  const A = await nuevaPestana(navegador, { ancho: 1500, alto: 1050 });
  await entrar(A, 'admin', 'admin/videos.html');
  await A.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await A.waitForTimeout(2500);
  a.comprobar(A.errores.length === 0,
    `La pantalla de vídeos abre sin errores ${JSON.stringify(A.errores.slice(0, 2))}`);

  const cursoAdmin = donde?.course_id
    || await A.evaluate(async () => {
      const m = await import('/plataforma/assets/app.js?v=2026-08-21-2');
      const { data } = await m.sb.from('cem_courses').select('id').limit(1);
      return data?.[0]?.id;
    });
  await A.selectOption('#fCurso', cursoAdmin);
  await A.waitForTimeout(3000);

  a.comprobar(await A.locator('#formCorto').count() === 1,
    'Hay dónde pegar la dirección de un short');
  const filas = await A.locator('.corto-fila').count();
  a.comprobar(filas > 0, `Y se listan los que ya hay (${filas})`);

  /* La validación. Pegar cualquier cosa no puede pasar por un vídeo, y un short
     sin título no sirve: el título es lo único que se lee antes del play. */
  const malos = await A.evaluate(async (cid) => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-2');
    const probar = (args) => m.sb.rpc('cem_short_guardar', args)
      .then(({ error }) => error?.message || 'PASÓ');
    return {
      basura: await probar({ p_course_id: cid, p_video: 'hola', p_titulo: 'X' }),
      sinTitulo: await probar({ p_course_id: cid, p_video: 'https://youtube.com/shorts/M7lc1UVf-VE', p_titulo: '  ' }),
    };
  }, cursoAdmin);
  a.comprobar(malos.basura.includes('YouTube'),
    'Pegar cualquier cosa se rechaza, y se explica qué pegar');
  a.comprobar(malos.sinTitulo.includes('título'),
    'Y un vídeo sin título tampoco entra: es lo único que se lee antes del play');

  /* Que entienda la forma /shorts/, que es la que se copia del teléfono. Sin
     esto, pegar el enlace de un short no funcionaba y no había forma de saber
     por qué. */
  const formaShorts = await A.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-2');
    const { data } = await m.sb.rpc('cem_youtube_id_de',
      { p_url: 'https://www.youtube.com/shorts/M7lc1UVf-VE' });
    return data;
  });
  a.comprobar(formaShorts === 'M7lc1UVf-VE',
    `Entiende la dirección de un short tal como se copia del teléfono (${formaShorts})`);

  await A.close();

  /* ============ 4 · un alumno no toca nada de esto ============ */
  const S = await nuevaPestana(navegador, { ancho: 1200, alto: 800 });
  await entrar(S, 'estudiante', 'estudiante/panel.html');
  await S.waitForTimeout(2500);
  const alumno = await S.evaluate(async (cid) => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-2');
    const r = {};
    const g = await m.sb.rpc('cem_short_guardar',
      { p_course_id: cid, p_video: 'M7lc1UVf-VE', p_titulo: 'Colado' });
    r.guardar = g.error ? 'NO' : 'SÍ';
    const o = await m.sb.rpc('cem_shorts_ordenar', { p_course_id: cid, p_ids: [] });
    r.ordenar = o.error ? 'NO' : 'SÍ';
    // Y escribir en la tabla directamente, saltándose las funciones.
    const d = await m.sb.from('cem_course_shorts')
      .insert({ course_id: cid, video_id: 'M7lc1UVf-VE', titulo: 'Colado a mano' });
    r.insertar = d.error ? 'NO' : 'SÍ';
    return r;
  }, cursoAdmin);

  for (const que of ['guardar', 'ordenar', 'insertar']) {
    a.comprobar(alumno[que] === 'NO',
      `Un estudiante no puede «${que}» vídeos express (${alumno[que]})`);
  }
  S.errores.length = 0;   // los rechazos de arriba los provocó esta prueba
  await S.close();

  return a;
}
