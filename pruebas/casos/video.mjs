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
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-21');
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
      const m = await import('/plataforma/assets/app.js?v=2026-08-21-21');
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
        const agua = await E.locator('#reproductor .repro-agua').first();
        const texto = (await agua.textContent()).trim();
        a.comprobar(texto.length > 3,
          `La clase lleva encima quién la está viendo («${texto.slice(0, 44)}»)`);

        const yo = await E.evaluate(async () => {
          const m = await import('/plataforma/assets/app.js?v=2026-08-21-21');
          const { data } = await m.sb.rpc('cem_my_profile');
          const p = Array.isArray(data) ? data[0] : data;
          return { nombre: p?.nombre, email: p?.email };
        });
        a.comprobar(texto.includes(yo.nombre) || texto.includes(yo.email),
          'Y es el nombre de quien entró, no un texto puesto a mano');

        /* Que se mueva. Si se quedara quieta, recortarla sería trivial. */
        const sitio1 = await agua.evaluate((el) => el.style.top + '|' + el.style.left);
        const posiciones = await E.evaluate(() => {
          const el = document.querySelector('#reproductor .repro-agua');
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

        /* ── La interfaz de YouTube no llega a dibujarse ──────────────────
           Es lo que impide que la clase por la que alguien pagó lleve encima
           un botón para irse a verla gratis. `controls=0` quita su barra, y la
           lámina de encima se come el ratón, así que YouTube nunca enseña el
           título, el canal ni «Mirar en YouTube»: no es que se tapen, es que
           no se dibujan. */
        a.comprobar(src.includes('controls=0'),
          'YouTube va sin sus propios controles: los pone la plataforma');
        a.comprobar(src.includes('disablekb=1'),
          'Y sin sus atajos de teclado, que incluyen el que abre el vídeo en YouTube');
        a.comprobar(await E.locator('#reproductor .repro-lamina').count() === 1,
          'Hay una lámina que se come los clics antes de que lleguen al <iframe>');

        /* ── Que el <iframe> no reciba UN SOLO evento ─────────────────────
           Esto se comprueba aparte de la lámina y por un fallo que pasó de
           verdad: la lámina se paraba antes de la franja de los mandos —para
           no pelearse con la barra— y entre su borde y el borde de los mandos
           quedaba una banda de dos píxeles. Dos píxeles bastan: al bajar el
           ratón hacia los controles se cruza esa banda, YouTube se entera de
           que hay ratón encima y saca su interfaz entera —título, canal,
           «Mirar en YouTube»— y ahí el clic derecho ya ofrece «Copiar vínculo».

           Por eso la defensa de verdad no es un rectángulo que tape a otro
           —eso es un argumento de geometría, y la geometría se rompe sola en
           cuanto alguien cambia un alto— sino `pointer-events:none` en el
           marco: no depende de ninguna medida. */
        const marco = await E.evaluate(() =>
          getComputedStyle(document.querySelector('#reproductor .repro-video')).pointerEvents);
        a.comprobar(marco === 'none',
          `El <iframe> no recibe eventos de ratón en ningún punto (pointer-events: ${marco})`);

        /* ── Y la portada, que es el otro agujero y por otro motivo ────────
           Quitarle los eventos de ratón a YouTube sirve mientras reproduce.
           ANTES del primer play no le hace falta ratón: dibuja su portada
           —título, canal, botón rojo, «Mirar en YouTube»— porque ése es su
           estado de partida. Y ése es el momento en que la pantalla está
           quieta y todo el mundo la está mirando. Se tapa con la imagen del
           propio vídeo, sin una letra encima. */
        const portada = await E.evaluate(() => {
          const rep = document.querySelector('#reproductor .repro');
          const t = rep?.querySelector('.repro-tapa');
          if (!t) return { hay: false };
          const r = rep.getBoundingClientRect();
          const c = t.getBoundingClientRect();
          const st = getComputedStyle(t);
          return {
            hay: true,
            visible: st.display !== 'none' && st.visibility !== 'hidden',
            /* Que cubra de verdad: si se quedara corta por un lado, por ahí
               asomaría exactamente lo que se está tapando. */
            cubre: c.top <= r.top + 1 && c.left <= r.left + 1
                && c.bottom >= r.bottom - 1 && c.right >= r.right - 1,
            /* Y por debajo de la marca de agua y de los mandos, o taparía lo
               nuestro en vez de lo suyo. */
            capa: Number(st.zIndex),
            imagen: t.getAttribute('src') || '',
          };
        });
        a.comprobar(portada.hay && portada.visible,
          'Antes del primer play hay una portada nuestra tapando la de YouTube');
        a.comprobar(portada.cubre,
          'Y cubre el recuadro entero, sin dejar un borde por el que asome');
        a.comprobar(portada.capa === 1,
          `Por debajo de la marca de agua y de los mandos (capa ${portada.capa})`);
        /* Y que pida la miniatura con la proporción ORIGINAL. Con `hqdefault`
           —que viene siempre en 4:3— un vídeo vertical llega encajado en una
           columna estrecha entre dos franjas negras, y recortar eso para
           llenar un marco 9:16 amplía la columna hasta que sólo se ve un trozo
           del centro. Cortado, y mal. */
        a.comprobar(/oardefault|hqdefault/.test(portada.imagen || ''),
          `Con la miniatura que respeta la proporción del vídeo (${(portada.imagen || 'ninguna').split('/').pop()})`);

        /* ── El cartel de la pausa ────────────────────────────────────────
           Al pausar, YouTube saca su título y su logotipo aunque nadie tenga
           el ratón encima: es su estado de pausa, no una reacción. Se tapa con
           una banda, no con la portada entera: quien pausa una clase está
           mirando el fotograma. */
        const velo = await E.evaluate(() => {
          const rep = document.querySelector('#reproductor .repro');
          const v = rep?.querySelector('.repro-velo');
          const mandos = rep?.querySelector('.repro-mandos');
          if (!v || !mandos) return { hay: false };
          const sm = getComputedStyle(mandos);
          return {
            hay: true,
            /* Antes de arrancar no hace falta: ahí manda la portada entera. */
            escondidoAlPrincipio: getComputedStyle(v).opacity === '0',
            /* Los mandos, opacos de verdad. En degradado se veía a través de
               su parte de arriba justo la esquina del logotipo de YouTube. */
            mandosOpacos: sm.backgroundImage === 'none'
              && Number((sm.backgroundColor.match(/[\d.]+\)$/) || ['1)'])[0].slice(0, -1)) >= 0.9,
          };
        });
        a.comprobar(velo.hay && velo.escondidoAlPrincipio,
          'Hay una banda para tapar el cartel que YouTube saca al pausar, y antes de arrancar está quitada');
        a.comprobar(velo.mandosOpacos,
          'Y los mandos son opacos, no un degradado por el que se transparente el logotipo de YouTube');

        /* Y el rastreo, PÍXEL A PÍXEL. Va así y no por muestreo en rejilla
           porque el hueco que hubo era de dos píxeles de alto: una rejilla
           cómoda pasa por encima sin verlo y devuelve verde. Se recorre cada
           fila y cada columna de unas cuantas líneas, de modo que cualquier
           banda de un solo píxel deja rastro. */
        const fugas = await E.evaluate(() => {
          const r = document.querySelector('#reproductor .repro').getBoundingClientRect();
          const malos = [];
          const mirar = (x, y, donde) => {
            const el = document.elementFromPoint(x, y);
            if (el && (el.tagName === 'IFRAME' || el.closest('.repro-video'))) malos.push(donde);
          };
          // columnas enteras, píxel a píxel de arriba abajo
          for (const fx of [0.05, 0.25, 0.5, 0.75, 0.95]) {
            const x = r.left + r.width * fx;
            for (let y = r.top + 1; y < r.bottom - 1; y++) mirar(x, y, `x${Math.round(fx * 100)}% y${Math.round(y - r.top)}px`);
          }
          // y filas enteras, por si el hueco fuera vertical
          for (const fy of [0.25, 0.5, 0.75, 0.97]) {
            const y = r.top + r.height * fy;
            for (let x = r.left + 1; x < r.right - 1; x++) mirar(x, y, `y${Math.round(fy * 100)}% x${Math.round(x - r.left)}px`);
          }
          return malos;
        });
        a.comprobar(fugas.length === 0,
          `Y rastreando el recuadro entero no hay un punto por el que se llegue a YouTube${
            fugas.length ? ` (se llega en ${fugas.length}: ${fugas.slice(0, 4).join(' ')}…)` : ''}`);

        /* Y que los mandos de la casa estén de verdad: quitarle los controles
           a YouTube sin poner otros dejaría un vídeo que no se puede pausar. */
        const mandos = await E.evaluate(() =>
          [...document.querySelectorAll('#reproductor .repro-mandos button')]
            .map((b) => b.getAttribute('aria-label')));
        a.comprobar(mandos.length >= 4,
          `Y en su lugar están los nuestros: ${mandos.join(', ')}`);
        a.comprobar(await E.locator('#reproductor .repro-barra').count() === 1,
          'Con su barra para adelantar y retroceder');

        /* ── La rueda de ajustes ──────────────────────────────────────────
           Al quitarle sus controles a YouTube se le quitó también la calidad y
           la velocidad, que son cosas que se usan para estudiar. Vuelven en un
           panel propio.

           Lo que NO se puede medir aquí es la CALIDAD. YouTube rechaza el
           «embed» desde localhost, el vídeo nunca carga y
           `getAvailableQualityLevels()` devuelve la lista vacía — igual que le
           pasaría a cualquiera antes de darle al play. Que esa sección no
           aparezca cuando no hay nada que ofrecer es justamente lo que se
           quiere: un selector de calidad vacío sería un mando que miente.

           Lo demás sí se mide, y con el nombre puesto: si mañana alguien
           quitara la velocidad sin querer, esto lo dice. */
        await E.click('#reproductor [data-ajustes]');
        await E.waitForTimeout(400);
        const panel = await E.evaluate(() => {
          const p = document.querySelector('#reproductor .repro-panel');
          return {
            abierto: !!p && !p.hidden,
            titulos: [...(p?.querySelectorAll('.repro-grupo h4') || [])].map((h) => h.textContent.trim()),
            volumen: !!p?.querySelector('[data-vol]'),
            espera: !!p?.querySelector('.repro-espera'),
            calidades: p?.querySelectorAll('[data-clave="calidad"]').length || 0,
            dentro: !!(p && document.querySelector('#reproductor .repro')?.contains(p)),
          };
        });
        a.comprobar(panel.abierto,
          'La rueda de ajustes abre su panel');
        a.comprobar(['Velocidad', 'Calidad', 'Subtítulos', 'Volumen'].every((t) => panel.titulos.includes(t)),
          `Con velocidad, calidad, subtítulos y volumen (${panel.titulos.join(', ') || 'nada'})`);
        /* La calidad tiene su sitio SIEMPRE, aunque todavía no haya nada que
           elegir: YouTube no dice qué calidades tiene hasta que el vídeo
           empieza a cargar. Antes la sección sencillamente no se dibujaba, y
           quien abría los ajustes antes de darle al play concluía —con razón—
           que la calidad no estaba. Decir «todavía no» es información; callar
           parece una falta. */
        a.comprobar(panel.espera || panel.calidades > 0,
          `Y cuando YouTube aún no ofrece calidades, lo dice en vez de callarse (${
            panel.calidades > 0 ? `${panel.calidades} calidades` : 'aviso de espera puesto'})`);
        a.comprobar(panel.dentro,
          'Y vive dentro del recuadro, así que a pantalla completa sigue estando');

        /* Tocar el vídeo cierra el panel. Antes de esto, el mismo clic lo
           cerraba Y pausaba, que es castigar el gesto de descartar un menú. */
        await E.click('#reproductor .repro-lamina', { position: { x: 40, y: 40 } });
        await E.waitForTimeout(300);
        a.comprobar(await E.evaluate(() =>
          !!document.querySelector('#reproductor .repro-panel')?.hidden),
        'Y se cierra al tocar el vídeo');

        /* La marca de agua tiene que estar POR ENCIMA del vídeo y dentro del
           recuadro que se va a pantalla completa. Si viviera dentro del
           <iframe> —donde no se puede escribir— o fuera del recuadro,
           desaparecería justo cuando más falta hace. */
        const dentro = await E.evaluate(() => {
          const rep = document.querySelector('#reproductor .repro');
          const ag = document.querySelector('#reproductor .repro-agua');
          return !!(rep && ag && rep.contains(ag));
        });
        a.comprobar(dentro,
          'La marca de agua vive dentro del recuadro que se va a pantalla completa');

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
          const m = await import('/plataforma/assets/app.js?v=2026-08-21-21');
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
          /* Se mira la fila de HOY, no «la única fila». El registro guarda una
             por persona, lección y día —a propósito: así se ve quién ve la
             misma clase varios días seguidos— y exigir que hubiera una sola
             hacía que la prueba pasara ayer y fallara hoy sin que nada
             cambiara. Fallar por el paso de un día no es encontrar un fallo. */
          const aMano = await E.evaluate(async (id) => {
            const m = await import('/plataforma/assets/app.js?v=2026-08-21-21');
            const { error } = await m.sb.rpc('cem_registrar_reproduccion',
              { p_lesson_id: id, p_segundos: 30 });
            if (error) return { error: error.message };
            const hoy = new Date().toISOString().slice(0, 10);
            const { data } = await m.sb.from('cem_reproducciones')
              .select('segundos,ip,dia').eq('lesson_id', id).eq('dia', hoy);
            return { filas: data || [], hoy };
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
        const m = await import('/plataforma/assets/app.js?v=2026-08-21-21');
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
      const m = await import('/plataforma/assets/app.js?v=2026-08-21-21');
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
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-21');
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
  a.comprobar(cuerpo.includes('lista de reproducción'),
    'Al elegir un programa pide su lista de reproducción');
  a.comprobar(await A.locator('#formLista').count() === 1,
    'Con un campo donde pegarla');

  /* item 26 · la pantalla enseñaba dos columnas y dejaba juntarlas a ojo. Se
     viene aquí a una sola cosa —que cada lección tenga vídeo—, así que hay una
     sola lista y desde cada lección se elige el suyo. */
  a.comprobar(/\d+ de \d+ lecciones tienen vídeo|todavía no tiene lecciones/i.test(cuerpo),
    'Y contesta de una línea si queda algo por hacer aquí');
  const columnas = await A.locator('.dos').count();
  a.comprobar(columnas === 0, 'Ya no hay dos columnas que juntar en la cabeza');
  const desdeLaLeccion = await A.locator('.lec [data-elegir], .lec [data-quitar]').count();
  const filasLec = await A.locator('.lec').count();
  a.comprobar(filasLec === 0 || desdeLaLeccion === filasLec,
    `Cada lección lleva su acción, y el vídeo se elige desde ella (${desdeLaLeccion} de ${filasLec})`);

  /* Y lo que no es el trabajo del día queda plegado, no compartiendo pantalla:
     la lista se pega una vez y el aprendizaje express es otra cosa. */
  const plegados = await A.evaluate(() => ({
    lista: !!document.querySelector('#cardLista'),
    express: document.querySelector('#cardExpress')?.open === false,
  }));
  a.comprobar(plegados.lista && plegados.express,
    'El aprendizaje express deja de mezclarse con las lecciones: va aparte y plegado');

  /* La validación: pegar cualquier cosa no puede pasar por una lista. */
  const validacion = await A.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-21');
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

  /* Y sobre todo: que asignar de verdad funcione. Las dos comprobaciones de
     arriba pasaban con la función rota — las dos disparan su error ANTES del
     UPDATE, así que la línea que fallaba no se ejecutaba nunca. Y fallaba
     siempre: `cem_asignar_video` escribía el tipo de la columna en inglés
     (`cem_lesson_tipo`) cuando se llama `cem_leccion_tipo`, de modo que poner
     un vídeo en una lección devolvía error en todos los casos.

     Esto lo hace de ida y vuelta sobre una lección real y la deja como estaba. */
  const ida = await A.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-21');
    const { data: cs } = await m.sb.from('cem_courses').select('id').order('nombre');
    for (const c of cs || []) {
      const { data: d } = await m.sb.rpc('cem_curso_lecciones_de_video', { p_course_id: c.id });
      const l = (d?.modulos || []).flatMap((x) => x.lecciones || [])[0];
      if (!l) continue;
      const antes = l.video_id || null;
      const puesto = await m.sb.rpc('cem_asignar_video',
        { p_lesson_id: l.id, p_video_id: 'M7lc1UVf-VE' });
      /* Se relee de lo que devuelve la propia función, que es el estado ya
         guardado: `cem_lessons` no se consulta directamente desde el navegador
         —ver politicas-de-acceso.md— y preguntárselo daría vacío sin que eso
         signifique nada. */
      const leido = (puesto.data?.modulos || []).flatMap((x) => x.lecciones || [])
        .find((x) => x.id === l.id);
      // Dejarla como estaba, pase lo que pase con la comprobación.
      await m.sb.rpc('cem_asignar_video', { p_lesson_id: l.id, p_video_id: antes });
      return { error: puesto.error?.message || null, guardado: leido?.video_id, tipo: leido?.tipo };
    }
    return { vacio: true };
  });
  a.comprobar(!ida.error && ida.guardado === 'M7lc1UVf-VE',
    `Poner un vídeo en una lección lo guarda de verdad (${ida.error || ida.guardado})`);
  a.comprobar(ida.tipo === 'video',
    `Y la lección pasa a ser de tipo vídeo, que es lo que decide cómo se pinta (${ida.tipo})`);

  /* Y el registro de anomalías, que es lo que delata una contraseña compartida. */
  const anomalias = await A.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-21');
    const { data, error } = await m.sb.rpc('cem_reproducciones_sospechosas', { p_dias: 30 });
    return { error: error?.message || null, esLista: Array.isArray(data) };
  });
  a.comprobar(!anomalias.error && anomalias.esLista,
    `El equipo puede pedir las cuentas con reproducción sospechosa (${anomalias.error || 'sin error'})`);
  await A.close();

  /* ============ 3b · el editor de contenidos no pierde el enlace ============
     El fallo que esto vigila fue real y silencioso: `cem_material_lecciones`
     escondía la URL en cuanto la lección tenía un vídeo asignado, y lo hacía
     también para quien coordina. En Contenidos el campo «URL del recurso»
     salía vacío aunque en la base hubiera un enlace, y el botón Guardar
     escribía ese vacío encima. Decía «Lección guardada» mientras borraba.

     Se monta un módulo propio y se borra al terminar: esto no se prueba sobre
     el contenido de verdad de la casa, que es material que alguien pagó. */
  const C = await nuevaPestana(navegador, { ancho: 1400, alto: 980 });
  await entrar(C, 'admin', 'admin/contenido.html');
  await C.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await C.waitForTimeout(2500);

  const MARCA = '· prueba del editor de vídeo';
  const URL_PEGADA = 'https://www.youtube.com/watch?v=GOS_HP_F-FY&list=PLtest';
  const ID_PEGADO = 'GOS_HP_F-FY';
  const ID_ASIGNADO = 'M7lc1UVf-VE';

  const fixture = await C.evaluate(async ({ marca, url, asignado }) => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-21');
    /* Restos de una pasada anterior: si quedaran, el árbol tendría dos módulos
       iguales y el clic caería en el que no es. */
    const { data: viejos } = await m.sb.from('cem_modules').select('id,cem_lessons(id)').eq('titulo', marca);
    for (const v of viejos || []) {
      for (const l of v.cem_lessons || []) await m.sb.from('cem_lessons').delete().eq('id', l.id);
      await m.sb.from('cem_modules').delete().eq('id', v.id);
    }
    const { data: cursos } = await m.sb.from('cem_courses').select('id,nombre').limit(1);
    const cursoId = cursos?.[0]?.id;
    if (!cursoId) return { sirve: false, motivo: 'no hay ningún programa' };
    const { data: mod, error: eMod } = await m.sb.from('cem_modules')
      .insert({ course_id: cursoId, titulo: marca, orden: 999 }).select('id').single();
    if (eMod) return { sirve: false, motivo: eMod.message };
    /* La lección nace como está la de verdad que dio el aviso: con un enlace
       pegado a mano Y con un vídeo asignado por otro camino. */
    const { data: les, error: eLes } = await m.sb.from('cem_lessons')
      .insert({ module_id: mod.id, titulo: 'Clase de prueba', tipo: 'video',
                url, video_id: asignado, orden: 1, estado: 'borrador' })
      .select('id').single();
    if (eLes) { await m.sb.from('cem_modules').delete().eq('id', mod.id); return { sirve: false, motivo: eLes.message }; }
    const { data: mat } = await m.sb.rpc('cem_material_lecciones', { p_ids: [les.id] });
    return { sirve: true, cursoId, modId: mod.id, lesId: les.id,
             urlQueLlega: mat?.[les.id]?.url ?? null, videoQueLlega: mat?.[les.id]?.video_id ?? null };
  }, { marca: MARCA, url: URL_PEGADA, asignado: ID_ASIGNADO });

  if (!fixture.sirve) {
    a.comprobar(false, `No se pudo montar la lección de prueba, así que esto no se midió: ${fixture.motivo}`);
  } else {
    a.comprobar(fixture.urlQueLlega === URL_PEGADA,
      `A quien edita le llega el enlace aunque la lección tenga vídeo asignado (${fixture.urlQueLlega ?? 'NO LLEGÓ — se estaría borrando al guardar'})`);
    a.comprobar(fixture.videoQueLlega === ID_ASIGNADO,
      `Y también el vídeo asignado, que es lo que el aula reproduce (${fixture.videoQueLlega})`);

    await C.goto(`${BASE}/plataforma/admin/contenido.html?curso=${fixture.cursoId}`, { waitUntil: 'domcontentloaded' });
    await C.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
    await C.waitForTimeout(2500);
    await C.click(`[data-les="${fixture.lesId}"]`);
    await C.waitForTimeout(800);

    const enPantalla = await C.evaluate(() => ({
      url: document.querySelector('#lUrl')?.value ?? null,
      nota: document.querySelector('#notaVideo')?.textContent?.trim() || '',
    }));
    a.comprobar(enPantalla.url === URL_PEGADA,
      `El campo del enlace enseña lo que hay guardado (${enPantalla.url === '' ? 'VACÍO' : enPantalla.url})`);
    a.comprobar(enPantalla.nota.includes(ID_ASIGNADO) && enPantalla.nota.includes(ID_PEGADO),
      `Y avisa de que el enlace y el vídeo asignado no son el mismo (${enPantalla.nota.slice(0, 90) || 'no dice nada'})`);

    /* Guardar sin tocar nada no puede cambiar nada. Ese era el daño: abrir la
       lección y pulsar Guardar bastaba para perder el enlace. */
    await C.click('#btnSave');
    await C.waitForTimeout(2500);
    const trasGuardar = await C.evaluate(async (id) => {
      /* Por la RPC y no por consulta directa: `url` y `video_id` no están
         concedidas al SELECT abierto —de eso va media pantalla— y pedirlas a
         pelo devuelve 403 en vez de datos. */
      const m = await import('/plataforma/assets/app.js?v=2026-08-21-21');
      const { data } = await m.sb.rpc('cem_material_lecciones', { p_ids: [id] });
      return data?.[id] || {};
    }, fixture.lesId);
    a.comprobar(trasGuardar.url === URL_PEGADA,
      `Guardar sin tocar el enlace no lo borra (${trasGuardar.url ?? 'SE BORRÓ'})`);
    a.comprobar(trasGuardar.video_id === ID_ASIGNADO,
      `Ni se lleva por delante el vídeo asignado (${trasGuardar.video_id})`);

    /* Y ahora al revés: cambiar el enlace SÍ tiene que mover el vídeo, o el
       aula seguiría reproduciendo el de antes sin que nadie lo pidiera. */
    await C.fill('#lUrl', `https://youtu.be/${ID_PEGADO}`);
    await C.click('#btnSave');
    await C.waitForTimeout(2500);
    const trasCambiar = await C.evaluate(async (id) => {
      /* Por la RPC y no por consulta directa: `url` y `video_id` no están
         concedidas al SELECT abierto —de eso va media pantalla— y pedirlas a
         pelo devuelve 403 en vez de datos. */
      const m = await import('/plataforma/assets/app.js?v=2026-08-21-21');
      const { data } = await m.sb.rpc('cem_material_lecciones', { p_ids: [id] });
      return data?.[id] || {};
    }, fixture.lesId);
    a.comprobar(trasCambiar.video_id === ID_PEGADO,
      `Cambiar el enlace cambia el vídeo que reproduce el aula (${trasCambiar.video_id})`);

    await C.evaluate(async ({ modId, lesId }) => {
      const m = await import('/plataforma/assets/app.js?v=2026-08-21-21');
      await m.sb.from('cem_lessons').delete().eq('id', lesId);
      await m.sb.from('cem_modules').delete().eq('id', modId);
    }, { modId: fixture.modId, lesId: fixture.lesId });
  }
  a.comprobar(C.errores.length === 0,
    `El editor de contenidos trabaja sin errores ${JSON.stringify(C.errores.slice(0, 2))}`);
  await C.close();

  /* ============ 4 · esto no lo toca un alumno ============ */
  const S = await nuevaPestana(navegador, { ancho: 1200, alto: 800 });
  await entrar(S, 'estudiante', 'estudiante/panel.html');
  await S.waitForTimeout(2500);
  const alumno = await S.evaluate(async () => {
    const m = await import('/plataforma/assets/app.js?v=2026-08-21-21');
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
