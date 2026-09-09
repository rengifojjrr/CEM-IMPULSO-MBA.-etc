/* ============================================================================
   El perfil, uno solo para toda la casa
   ============================================================================
   Hasta ahora el perfil era una pantalla del estudiante y de nadie más.
   `/plataforma/admin/perfil.html` y `/plataforma/docente/perfil.html` no
   existían —daban 404— y aun así el menú de todo el mundo llevaba un avatar
   arriba a la derecha: al estudiante lo mandaba a su perfil y a los demás les
   abría el diálogo de la foto, porque no había ningún sitio a donde ir.

   Eso deja a la mitad de la escuela sin una página donde decir quién es. Y
   hace falta para lo más simple: que alguien que ve un mensaje, una nota o una
   corrección pueda pulsar el nombre y saber con quién está hablando.

   Duplicar las ochocientas líneas en tres carpetas era la manera segura de que
   dentro de un mes fueran tres perfiles distintos. Así que el perfil vive aquí,
   entero, y cada carpeta tiene una página de diez líneas que lo monta. Es el
   mismo camino que se siguió con el dibujante de los diplomas.

   Qué cambia según quién entra
   ----------------------------
   La identidad, la foto, la portada, el perfil público y el trabajo son de
   cualquiera: un profesor también tiene obra que enseñar, y el enlace público
   sirve igual para un currículum que para una firma de correo.

   Lo que es del estudiante y sólo suyo son las inscripciones y sus solicitudes
   —congelar, retirarse, reactivar—: un administrador no está inscrito en nada
   y esa tarjeta le diría «todavía no tienes inscripciones» para siempre. Y el
   botón de editar cambia de forma, porque «Mis datos» es una pantalla que sólo
   existe en la carpeta del estudiante: para el resto, el mismo formulario se
   abre en una ventana aquí mismo.
   ========================================================================= */

import { sb, $, $$, esc, chip, bar, pct, num, fdate, modal, ok, fail,
         mensajeError, confirmDialog, chipEstado, avisar, vacio, ocupado,
         campoArchivo, compartir, encogerImagen, recortarCuadrado,
         TIPOS_ARCHIVO, ROLES_SIN_FOTO } from './app.js?v=2026-09-04-4';
import { lienzoCertificado } from './certificado.js?v=2026-09-04-4';
import { paisConBandera, opcionesDePais } from './paises.js?v=2026-09-04-4';

/* Lo que se lee bajo el nombre cuando la persona no ha escrito a qué se
   dedica. Sale también en la página pública, así que dice de qué casa es y no
   cuánto manda: «Administrador general» en un enlace que se reparte por ahí no
   le hace ningún favor a nadie. */
const TITULAR_POR_ROL = {
  estudiante: 'Estudiante de CEM',
  profesor: 'Profesor del CEM',
  coordinador: 'Equipo del CEM',
  cobranza: 'Equipo del CEM',
  admin: 'Equipo del CEM',
  superadmin: 'Equipo del CEM',
  auditor: 'Equipo del CEM',
};

/* El armazón de la pantalla. Se pinta dentro del `#page` que trae cada página.
   ═══════════════════════════════════════════════════════════════════════════
   Sin comentarios dentro del texto que se devuelve: esto entra por `innerHTML`
   y todo lo que lleve acaba en la página de verdad, así que lo que hay que
   explicar se explica aquí fuera. Tarjeta por tarjeta, y en orden:

   · La cabecera es la misma que ve quien abra el enlace público. Enseñar aquí
     otra cosa sería enseñar una que no es.
   · Los certificados: el botón «Ver todos» lleva a una pantalla que sólo existe
     en la carpeta del estudiante, así que para el resto no se pone.
   · Los datos se MIRAN, y el botón lleva a cambiarlos: del estudiante a su
     pantalla entera, del resto a una ventana aquí mismo.
   · El perfil público no se publica solo —sería un problema de privacidad—: lo
     enciende la persona y decide qué se ve.
   · El trabajo, porque quien enseña aquí también tiene obra que repartir.
   · Las inscripciones y sus solicitudes son del estudiante y de nadie más: a
     quien no está inscrito en nada esa tarjeta le diría «todavía no tienes
     inscripciones» para siempre. */
function armazon(esEstudiante, sinFoto) {
  return `
  <div class="card perfil-cabeza">
    <div class="perfil-portada" id="portada"></div>
    <div class="perfil-identidad">
      <button type="button" class="retrato-perfil${sinFoto ? '' : ' retrato-editable'}" id="miFoto"
        aria-label="${sinFoto ? 'Tu foto de perfil' : 'Cambiar mi foto de perfil'}"></button>
      <div class="quien">
        <h1 id="nombreGrande">…</h1>
        <div class="titular" id="titularPerfil"></div>
        <div class="credenciales" id="credencialesPerfil" hidden>
          <span class="material-symbols-outlined">verified</span>
          <span id="credencialesTxt"></span></div>
      </div>
      <div class="manos" id="manosPerfil"></div>
    </div>
    <div class="perfil-cifras" id="cifrasPerfil"></div>
  </div>

  <div class="card" id="avisoCert" hidden>
    <div class="row between" style="align-items:flex-start;gap:10px">
      <h2 class="sec sin-margen"><span class="material-symbols-outlined"
        style="color:var(--gold,#C9A227);vertical-align:-4px">workspace_premium</span>
        Mis certificados</h2>
      ${esEstudiante ? '<a class="btn outline sm" href="certificados.html">Ver todos</a>' : ''}
    </div>
    <div id="misDiplomas" class="sep"></div>
    <p class="tiny muted sep-poco">
      Al tener certificados emitidos, cambiar tu nombre o tu documento pasa antes por el
      equipo: esos datos ya están impresos en un documento firmado. El resto lo cambias tú.</p>
  </div>

  <div class="card">
    <div class="row between" style="align-items:flex-start;gap:10px">
      <h2 class="sec sin-margen">Mis datos
        <button type="button" class="ayuda-btn" data-ayuda="Tu nombre y tu documento salen impresos en los certificados tal como los escribas. Si ya tienes alguno emitido, cambiarlos pasa antes por aprobación del equipo.">?</button></h2>
      ${esEstudiante
        ? `<a class="btn outline" href="mis-datos.html">
             <span class="material-symbols-outlined" aria-hidden="true">edit</span> Editar mis datos</a>`
        : sinFoto ? ''
        : `<button class="btn outline" id="btnEditarDatos">
             <span class="material-symbols-outlined" aria-hidden="true">edit</span> Editar mis datos</button>`}
    </div>
    <p class="tiny muted" style="margin-top:-2px">Esto no se publica nunca: tu cédula, tu
      teléfono y tu correo no salen en el perfil que compartes.</p>
    ${sinFoto ? `<p class="nota">${sinFoto}</p>` : ''}
    <dl class="datos-mirar" id="datosMirar"></dl>
    <div id="faltaAlgo"></div>
  </div>

  <div class="card" id="cardSolPerfil" hidden>
    <h2 class="sec">Cambios que pediste</h2>
    <div class="table-wrap"><table>
      <thead><tr><th>Pedido</th><th>Qué cambia</th><th>Estado</th><th>Respuesta</th></tr></thead>
      <tbody id="tbSolPerfil"></tbody></table></div>
  </div>

  <div class="card">
    <div class="row between"><h2 class="sec">Mi perfil público</h2>
      <span class="chip neutral" id="estadoPerfil">…</span></div>
    <p class="tiny muted sin-margen">Una página con tus credenciales de CEM que puedes poner en tu
      currículum o en LinkedIn. La abre cualquiera sin necesidad de cuenta, y el QR de los títulos
      lleva a ella. <b>Nunca se muestran tu cédula, tu teléfono, tu correo ni nada de pagos.</b></p>

    <div class="row sep" id="accionesPerfil"></div>
    <div id="enlacePerfil" class="sep-poco"></div>

    <div class="sep" id="queSeVe" hidden>
      <div class="sub-perfil">Qué quieres que se vea</div>
      <div class="row" id="opcionesPerfil"></div>
    </div>
  </div>

  <div class="card">
    <div class="row between"><h2 class="sec">Mi trabajo</h2>
      <button class="btn outline sm" id="btnNuevaObra">
        <span class="material-symbols-outlined" aria-hidden="true">add</span> Añadir</button></div>
    <p class="tiny muted sin-margen">Productos, servicios o cosas que hayas hecho. Se ven en tu
      perfil público, con la foto y el enlace que pongas — así quien lo abra puede escribirte.
      <b>Sólo se publica si tu perfil está publicado.</b></p>
    <div id="portafolio" class="sep"></div>
  </div>

  ${esEstudiante ? `
  <div class="card">
    <h2 class="sec">Mis inscripciones</h2>
    <p class="tiny muted" style="margin-top:-6px">
      Si necesitas parar un tiempo o dejar un programa, pídelo acá y el equipo lo resuelve.</p>
    <div id="inscripciones"></div>
  </div>

  <details class="card" id="cardSolInsc" hidden>
    <summary class="sec" style="cursor:pointer;list-style:none;display:flex;align-items:center;gap:8px">
      <span class="material-symbols-outlined">expand_more</span>
      Solicitudes sobre mis inscripciones
      <span class="chip neutral" id="contSolInsc"></span>
    </summary>
    <div class="table-wrap sep-poco"><table>
      <thead><tr><th>Pedido</th><th>Tipo</th><th>Motivo</th><th>Estado</th><th>Respuesta</th></tr></thead>
      <tbody id="tbSolInsc"></tbody></table></div>
  </details>` : ''}`;
}

/**
 * Monta el perfil de quien entró dentro del `#page` de la pantalla.
 * @param {object} p El perfil que devolvió `mount()`.
 */
export function montarPerfil(p) {
  const me = p;
  const esEstudiante = p.rol === 'estudiante';
  const sinFoto = ROLES_SIN_FOTO[p.rol] || '';
  const page = $('#page');
  if (!page) return;
  page.innerHTML = armazon(esEstudiante, sinFoto);

  let CERTIFICADOS = [];
  let obras = [];
  let cabecera = { nombre:'', apellido:'', avatar_url:'', portada_url:'', ocupacion:'',
                   pais:'', certs:0, insignias:0, obras:0 };
  let perfilPub = { publico:false, slug:null,
                    muestra:{ programas:true, insignias:true, notas:false } };

  cargar();

  async function cargar(){
    /* Las dos tablas de solicitudes se filtran por `profile_id` a mano, y no
       es de adorno: sus reglas dicen «la tuya O eres del equipo», así que sin
       el filtro un coordinador vería aquí, bajo el título «Cambios que
       pediste», los cambios que pidió TODA la escuela. Al estudiante la regla
       ya le acotaba lo suyo y por eso no se notaba. */
    const [{ data: perfil }, { data: misCerts }, { count: vigentes }, { count: medallas },
           { data: ens }, { data: solP }, { data: solI }] = await Promise.all([
      sb.from('cem_profiles').select('*').eq('id', p.id).single(),
      sb.from('cem_certificates')
        .select('id,codigo,titulo,emitido_en,anulado_en,cem_courses(nombre)')
        .eq('profile_id', p.id).order('emitido_en', { ascending:false }).limit(200),
      /* Para la cabecera sólo cuentan los que siguen en pie, porque es lo que
         enseña la página pública. Para el aviso de más abajo cuentan todos: un
         certificado anulado también se imprimió, y por eso el nombre sigue
         pasando por aprobación. */
      sb.from('cem_certificates').select('id', { count:'exact', head:true })
        .eq('profile_id', p.id).is('anulado_en', null),
      sb.from('cem_badge_awards').select('id', { count:'exact', head:true }).eq('profile_id', p.id),
      esEstudiante
        ? sb.from('cem_enrollments')
            .select('id,estado,progreso,fecha_inscripcion,cem_courses(nombre)')
            .eq('profile_id', p.id).order('fecha_inscripcion', { ascending:false }).limit(500)
        : { data: [] },
      sb.from('cem_solicitudes_perfil').select('*').eq('profile_id', p.id)
        .order('created_at', { ascending:false }),
      esEstudiante
        ? sb.from('cem_solicitudes_inscripcion')
            .select('*,cem_enrollments(cem_courses(nombre))').eq('profile_id', p.id)
            .order('created_at', { ascending:false })
        : { data: [] },
    ]);

    CERTIFICADOS = misCerts || [];

    cabecera = {
      nombre: perfil?.nombre || '', apellido: perfil?.apellido || '',
      avatar_url: perfil?.avatar_url || '', portada_url: perfil?.portada_url || '',
      ocupacion: perfil?.ocupacion || '', pais: perfil?.pais || '',
      certs: vigentes || 0, insignias: medallas || 0, obras: cabecera.obras || 0,
    };
    pintarCabecera();

    perfilPub = {
      publico: !!perfil?.perfil_publico,
      slug: perfil?.perfil_slug,
      muestra: perfil?.perfil_muestra || { programas:true, insignias:true, notas:false },
    };
    pintarPerfilPublico();
    $('#avisoCert').hidden = !CERTIFICADOS.length;
    pintarMisCertificados();

    pintarDatosParaMirar(perfil);
    pintarSolicitudesPerfil(solP || []);
    if (esEstudiante) {
      pintarInscripciones(ens || []);
      pintarSolicitudesInscripcion(solI || []);
    }
    cargarPortafolio();
  }

  /* ============ los datos, para mirarlos ============
     Lo que falta se dice sin rodeos: un hueco vacío en una lista pasa
     desapercibido, pero «Documento — falta» no. Es lo mismo que sale impreso en
     el certificado, así que enterarse de que falta cuando ya está emitido es
     tarde. Ese aviso es del estudiante: a quien no va a recibir un diploma no
     hay que apurarle la cédula. */
  function pintarDatosParaMirar(perfil){
    const p2 = perfil || {};
    const campos = [
      ['Nombre', [p2.nombre, p2.apellido].filter(Boolean).join(' '), true],
      ['Documento', p2.documento ? `${p2.documento_tipo || 'Doc'} ${p2.documento}` : '', true],
      ['Fecha de nacimiento', p2.fecha_nacimiento ? fdate(p2.fecha_nacimiento) : '', true],
      ['Teléfono', p2.telefono || '', false],
      ['Dónde vives', [p2.ciudad, p2.pais ? paisConBandera(p2.pais) : ''].filter(Boolean).join(' · '), false],
      ['Correo', p2.email || '', true],
    ];

    $('#datosMirar').innerHTML = campos.map(([que, valor]) => `
      <div class="dato">
        <dt>${esc(que)}</dt>
        <dd${valor ? '' : ' class="falta"'}>${valor ? esc(valor) : 'falta'}</dd>
      </div>`).join('');

    const faltan = esEstudiante
      ? campos.filter(([, v, obligatorio]) => obligatorio && !v).map(([q]) => q.toLowerCase())
      : [];
    $('#faltaAlgo').innerHTML = faltan.length
      ? `<div class="nota warn">Para poder emitirte el certificado falta ${
          esc(faltan.join(', ').replace(/, ([^,]*)$/, ' y $1'))}.
          <br><a class="btn" href="mis-datos.html">
            <span class="material-symbols-outlined" aria-hidden="true">edit_note</span> Completarlo ahora</a></div>`
      : '';
  }

  /* Editar los datos sin salir de aquí.
     ─────────────────────────────────────────────────────────────────────────
     Sólo para quien no es estudiante: el estudiante tiene su pantalla entera,
     con los intereses y el resto. Esto es el mismo formulario reducido a lo que
     una ficha del equipo necesita, y guarda por la MISMA función del servidor,
     que ya sabe lo suyo — si esta persona tiene certificados emitidos, el
     cambio de nombre o documento sale como solicitud en vez de aplicarse. */
  function editarMisDatos(){
    const d = cabecera;
    const m = modal({ title:'Editar mis datos', body:`
      <div class="row">
        <div class="field medio"><label for="edNombre">Nombre *</label>
          <input id="edNombre" required value="${esc(d.nombre)}"></div>
        <div class="field medio"><label for="edApellido">Apellido *</label>
          <input id="edApellido" required value="${esc(d.apellido)}"></div>
      </div>
      <div class="row">
        <div class="field medio"><label for="edDocTipo">Tipo de documento</label>
          <select id="edDocTipo">
            <option value="V">V — Venezolano</option>
            <option value="E">E — Extranjero</option>
            <option value="P">P — Pasaporte</option>
            <option value="J">J — Jurídico</option></select></div>
        <div class="field medio"><label for="edDoc">Documento</label>
          <input id="edDoc" placeholder="12345678"></div>
      </div>
      <div class="row">
        <div class="field medio"><label for="edTel">Teléfono</label>
          <input id="edTel" placeholder="+58 412 1234567"></div>
        <div class="field medio"><label for="edNac">Fecha de nacimiento</label>
          <input id="edNac" type="date"></div>
      </div>
      <div class="row">
        <div class="field medio"><label for="edPais">País</label>
          <select id="edPais"></select></div>
        <div class="field medio"><label for="edCiudad">Ciudad</label>
          <input id="edCiudad"></div>
      </div>
      <div class="field"><label for="edOcupacion">A qué te dedicas</label>
        <input id="edOcupacion" maxlength="90"
          placeholder="Sale bajo tu nombre si lo enciendes en el perfil público."></div>
      <div id="edMsg"></div>`,
      footer:`<button class="btn outline" data-x>Cancelar</button>
              <button class="btn" data-s>Guardar</button>` });

    /* Los valores se ponen desde JS y no en el HTML de arriba: el país es una
       lista larga, y el resto viene de la fila recién traída de la base —no de
       la cabecera, que sólo guarda lo que se enseña. */
    (async () => {
      const { data: fila, error } = await sb.from('cem_profiles')
        .select('*').eq('id', me.id).single();
      if (error) { avisar($('#edMsg', m), mensajeError(error), 'err'); return; }
      const f = fila || {};
      $('#edPais', m).innerHTML = opcionesDePais(f.pais || '');
      $('#edDocTipo', m).value = f.documento_tipo || 'V';
      $('#edDoc', m).value = f.documento || '';
      $('#edTel', m).value = f.telefono || '';
      $('#edNac', m).value = f.fecha_nacimiento || '';
      $('#edCiudad', m).value = f.ciudad || '';
      $('#edOcupacion', m).value = f.ocupacion || '';
    })();

    $('[data-s]', m).onclick = () => ocupado($('[data-s]', m), 'Guardando…', async () => {
      const nombre = $('#edNombre', m).value.trim();
      const apellido = $('#edApellido', m).value.trim();
      if (!nombre || !apellido) {
        avisar($('#edMsg', m), 'Hacen falta tu nombre y tu apellido.', 'err');
        return;
      }
      const datos = {
        nombre, apellido,
        documento_tipo: $('#edDocTipo', m).value,
        documento: $('#edDoc', m).value.trim(),
        telefono: $('#edTel', m).value.trim(),
        fecha_nacimiento: $('#edNac', m).value,
        pais: $('#edPais', m).value,
        ciudad: $('#edCiudad', m).value.trim(),
      };
      const { data, error } = await sb.rpc('cem_actualizar_mi_perfil', { p_datos: datos });
      if (error) { avisar($('#edMsg', m), mensajeError(error), 'err'); return; }

      /* La ocupación no pasa por esa función —es de la cara pública, no de lo
         que se imprime—, así que se guarda aparte y sólo si cambió. */
      const ocupacion = $('#edOcupacion', m).value.trim();
      if (ocupacion !== (cabecera.ocupacion || '')) {
        const { error: e2 } = await sb.from('cem_profiles')
          .update({ ocupacion: ocupacion || null }).eq('id', me.id).select('id');
        if (e2) { avisar($('#edMsg', m), mensajeError(e2), 'err'); return; }
      }

      m.close();
      ok(data?.requiere_aprobacion
        ? 'Guardado. El cambio de nombre o documento lo revisa el equipo antes de aplicarse.'
        : 'Datos guardados.');
      cargar();
    });
  }

  function pintarSolicitudesPerfil(lista){
    $('#cardSolPerfil').hidden = lista.length === 0;
    if (!lista.length) return;
    $('#tbSolPerfil').innerHTML = lista.map(s => `<tr>
      <td class="muted">${fdate(s.created_at)}</td>
      <td class="wrap">${esc(Object.entries(s.campos || {})
          .map(([k, v]) => `${k.replace('documento_tipo','tipo de documento')}: ${v}`).join(', '))}</td>
      <td>${chip(s.estado === 'pendiente' ? 'en revisión' : s.estado)}</td>
      <td class="wrap muted">${esc(s.resolucion || '—')}</td></tr>`).join('');
  }

  function pintarInscripciones(lista){
    $('#inscripciones').innerHTML = lista.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Programa</th><th>Avance</th><th>Estado</th><th>Desde</th><th></th></tr></thead>
      <tbody>${lista.map(e => `<tr>
        <td class="wrap">${esc(e.cem_courses?.nombre || '—')}</td>
        <td style="min-width:110px">${bar(e.progreso)}<span class="tiny muted">${pct(e.progreso)}</span></td>
        <td>${chipEstado(e.estado)}</td>
        <td class="muted">${fdate(e.fecha_inscripcion)}</td>
        <td class="nowrap">${botonesDe(e)}</td></tr>`).join('')}</tbody></table></div>`
      : vacio({ icono:'school', titulo:'Todavía no tienes inscripciones',
          accion:{ texto:'Ver el catálogo', href:'catalogo.html' } });

    $$('[data-sol]').forEach(b => b.onclick = () => pedirCambio(b.dataset.sol, b.dataset.tipo));
  }

  function botonesDe(e){
    if (e.estado === 'activa' || e.estado === 'pendiente') {
      return `<button class="btn ghost sm" data-sol="${e.id}" data-tipo="congelamiento">Congelar</button>
              <button class="btn ghost sm" data-sol="${e.id}" data-tipo="retiro" style="color:var(--error)">Retirarme</button>`;
    }
    if (e.estado === 'congelada') {
      return `<button class="btn ghost sm" data-sol="${e.id}" data-tipo="reactivacion">Reactivar</button>`;
    }
    return '<span class="tiny muted">—</span>';
  }

  const EXPLICACION = {
    congelamiento: 'Tu inscripción queda en pausa y las cuotas que todavía no vencieron se congelan. Lo que ya venció se sigue debiendo.',
    retiro: 'Dejas el programa. Las cuotas pendientes se anulan, pero lo ya pagado no se devuelve automáticamente: eso se conversa aparte.',
    reactivacion: 'Vuelves a cursar y las cuotas congeladas se reactivan desde donde quedaron.',
  };

  function pedirCambio(enrollmentId, tipo){
    const m = modal({ title: `Pedir ${tipo === 'reactivacion' ? 'reactivación' : tipo}`, body: `
      <p>${esc(EXPLICACION[tipo])}</p>
      <div class="field"><label>Cuéntanos el motivo *</label>
        <textarea id="solMotivo" rows="3" placeholder="Lo lee quien resuelve tu solicitud." required></textarea></div>
      ${tipo === 'congelamiento' ? `<div class="field"><label>¿Hasta cuándo, más o menos?</label>
        <input type="date" id="solHasta"></div>` : ''}
      <div id="solMsg"></div>`,
      footer: `<button class="btn outline" data-x>Cancelar</button>
               <button class="btn" data-s>Enviar solicitud</button>` });
    $('[data-s]', m).onclick = async () => {
      const motivo = $('#solMotivo', m).value.trim();
      if (motivo.length < 10) {
        avisar($('#solMsg', m), 'Escribe el motivo con una frase completa.', 'err');
        return;
      }
      const { error } = await sb.rpc('cem_solicitar_cambio_inscripcion', {
        p_enrollment_id: enrollmentId, p_tipo: tipo, p_motivo: motivo,
        p_hasta: $('#solHasta', m)?.value || null,
      });
      if (error) {
        avisar($('#solMsg', m), mensajeError(error), 'err');
        return;
      }
      m.close();
      ok('Solicitud enviada. Te avisamos cuando la resuelvan.');
      cargar();
    };
  }

  /* ============ el perfil público ============
     Lo enciende y lo apaga la persona, y decide qué se ve. Por omisión sólo el
     nombre y los certificados: las notas son de quien las sacó y no tienen por
     qué estar en un enlace que se reparte. */
  const OPCIONES_PERFIL = [
    ['programas', 'Los programas que cursé'],
    ['insignias', 'Mis insignias'],
    ['trabajo',   'Mi trabajo'],
    /* La ocupación se preguntó al registrarse, para saber quién estudia aquí.
       Publicarla sin más sería usar para una cosa un dato que se dio para otra,
       así que entra apagada y hay que encenderla. */
    ['ocupacion', 'A qué me dedico', false],
    ['notas',     'Mis notas', false],
  ];

  /** La dirección del perfil, o vacío si todavía no tiene una. */
  const urlDelPerfil = () => perfilPub.slug
    ? new URL(`../perfil-publico.html?p=${encodeURIComponent(perfilPub.slug)}`, location.href).href
    : '';

  function pintarPerfilPublico(){
    const { publico, muestra } = perfilPub;
    const url = urlDelPerfil();
    $('#estadoPerfil').textContent = publico ? 'publicado' : 'sin publicar';
    $('#estadoPerfil').className = 'chip ' + (publico ? 'ok' : 'neutral');

    /* Compartir arriba, en la cabecera, y siempre: es lo que se viene a hacer.
       Si el perfil todavía no está publicado no se esconde el botón —esconderlo
       deja a la persona buscando— sino que al pulsarlo se ofrece publicarlo. */
    $('#manosPerfil').innerHTML = `
      <button class="btn" id="btnCompartir">
        <span class="material-symbols-outlined" aria-hidden="true">share</span> Compartir perfil</button>
      ${publico ? `<a class="btn outline" id="verPerfilArriba" target="_blank" rel="noopener" href="${esc(url)}">
        <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span> Ver cómo lo ven</a>` : ''}`;
    $('#btnCompartir').onclick = compartirPerfil;

    $('#accionesPerfil').innerHTML = publico
      ? `<button class="btn outline" id="btnDespublicar">
           <span class="material-symbols-outlined" aria-hidden="true">visibility_off</span> Dejar de publicarlo</button>
         <a class="btn outline" id="verPerfil" target="_blank" rel="noopener">
           <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span> Verlo</a>`
      : `<button class="btn" id="btnPublicar">
           <span class="material-symbols-outlined" aria-hidden="true">public</span> Publicar mi perfil</button>`;

    $('#enlacePerfil').innerHTML = publico && url
      ? `<div class="enlace-compartir caja"><span class="crece">${esc(url)}</span>
           <button class="btn ghost sm" id="btnCopiarPerfil"
             aria-label="Copiar el enlace de mi perfil">
             <span class="material-symbols-outlined" aria-hidden="true">content_copy</span> Copiar</button></div>`
      : '';

    $('#queSeVe').hidden = !publico;
    /* Cada opción trae su valor de partida: las que faltan en lo guardado no
       valen todas lo mismo. Si el botón dijera «encendido» y el servidor lo
       tratara como apagado, la persona creería estar enseñando algo que no
       enseña — o al revés, que es peor. */
    $('#opcionesPerfil').innerHTML = OPCIONES_PERFIL.map(([clave, txt, porOmision]) => {
      const on = muestra?.[clave] ?? porOmision;
      return `<button type="button" class="btn ${on ? '' : 'outline'} sm" data-muestra="${clave}"
        aria-pressed="${on}">
        <span class="material-symbols-outlined" aria-hidden="true">${on ? 'check' : 'close'}</span> ${esc(txt)}</button>`;
    }).join('');

    const guardar = (publicar, muestraNueva) => ocupado(
      $('#btnPublicar') || $('#btnDespublicar'), 'Guardando…', async () => {
        const { data, error } = await sb.rpc('cem_publicar_perfil',
          { p_publicar: publicar, p_muestra: muestraNueva || null });
        if (error) { fail(mensajeError(error)); return; }
        perfilPub = { publico: data.publico, slug: data.slug, muestra: data.muestra };
        pintarPerfilPublico();
        ok(publicar ? 'Tu perfil ya es público.' : 'Tu perfil dejó de ser público.');
      });

    if ($('#btnPublicar'))    $('#btnPublicar').onclick    = () => guardar(true);
    if ($('#btnDespublicar')) $('#btnDespublicar').onclick = () => guardar(false);
    if ($('#verPerfil'))      $('#verPerfil').href = url;
    if ($('#btnCopiarPerfil')) $('#btnCopiarPerfil').onclick = async () => {
      try { await navigator.clipboard.writeText(url); ok('Enlace copiado.'); }
      catch { fail('No se pudo copiar. Selecciona el enlace y cópialo a mano.'); }
    };
    $$('[data-muestra]').forEach(b => b.onclick = () => {
      /* Lo contrario de lo que el botón está diciendo, no lo contrario de lo que
         hay guardado. No es lo mismo para las opciones que vienen apagadas: al
         no estar guardadas, el primer clic las dejaba apagadas otra vez y
         parecía que el botón no hacía nada. */
      const nueva = { ...perfilPub.muestra,
                      [b.dataset.muestra]: b.getAttribute('aria-pressed') !== 'true' };
      guardar(true, nueva);
    });
  }

  /* Compartir el perfil.
     ─────────────────────────────────────────────────────────────────────────
     Si todavía no está publicado, el enlace existe pero le enseña al otro un
     «este perfil no está publicado». Repartir eso es peor que no tener botón,
     así que primero se ofrece publicarlo — con lo que se va a ver dicho antes,
     no después. */
  async function compartirPerfil(){
    if (!perfilPub.publico) {
      const m = modal({ title:'Tu perfil todavía no es público', body:`
        <p>Para que otras personas puedan abrir tu perfil, primero hay que publicarlo.</p>
        <p class="tiny muted">Se verá tu nombre, tu foto, tus certificados de CEM y lo que dejes
          encendido más abajo. <b>Nunca tu cédula, tu teléfono, tu correo ni nada de pagos.</b>
          Puedes dejar de publicarlo cuando quieras.</p>`,
        footer:`<button class="btn outline" data-x>Ahora no</button>
                <button class="btn" id="pubYa">Publicarlo y compartir</button>` });
      $('#pubYa', m).onclick = () => ocupado('#pubYa', 'Publicando…', async () => {
        const { data, error } = await sb.rpc('cem_publicar_perfil', { p_publicar:true, p_muestra:null });
        if (error) { fail(mensajeError(error)); return; }
        perfilPub = { publico: data.publico, slug: data.slug, muestra: data.muestra };
        m.close();
        pintarPerfilPublico();
        await compartir({ url: urlDelPerfil(), titulo: tituloParaCompartir(),
                          texto: textoParaCompartir() });
      });
      return;
    }
    await compartir({ url: urlDelPerfil(), titulo: tituloParaCompartir(),
                      texto: textoParaCompartir() });
  }

  const tituloParaCompartir = () =>
    `${[cabecera.nombre, cabecera.apellido].filter(Boolean).join(' ')} · Credenciales CEM`;
  const textoParaCompartir = () => cabecera.certs
    ? `Mira mis ${cabecera.certs === 1 ? 'credencial' : `${cabecera.certs} credenciales`} de CEM:`
    : 'Mi perfil en CEM:';

  /* ============ la foto y el trabajo ============
     Las dos suben al mismo sitio: `perfiles/<mi uid>/…` dentro del almacén
     compartido. Esa carpeta es la única donde una cuenta puede escribir —lo
     dice la política del almacén, no esta pantalla—, así que nadie puede tocar
     la de otro ni aunque se salte la interfaz. */
  async function subirMia(file){
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const ruta = `perfiles/${me.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await sb.storage.from('cem-assets')
      .upload(ruta, file, { contentType: file.type || 'image/*' });
    if (error) throw new Error(error.message || 'No se pudo subir la imagen.');
    return sb.storage.from('cem-assets').getPublicUrl(ruta).data.publicUrl;
  }

  /* Tocar la imagen la cambia. Antes había que bajar a otra tarjeta a buscar el
     botón, que es justo donde nadie mira: la foto se quedaba sin poner y el
     perfil que se repartía salía sin cara. */
  function elegirImagen(ladoMax, alSubir, { encuadrar = false } = {}){
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = TIPOS_ARCHIVO.imagen.accept;
    inp.onchange = async () => {
      const file = inp.files?.[0];
      if (!file) return;
      try {
        /* La foto de perfil pasa por el encuadre; la portada no, porque es
           ancha y el recorte cuadrado no le sirve de nada. Si se cancela el
           encuadre no se sube nada: cancelar tiene que cancelar de verdad. */
        const elegida = encuadrar ? await recortarCuadrado(file, ladoMax) : file;
        if (!elegida) return;

        const listo = await encogerImagen(elegida, ladoMax);
        const max = TIPOS_ARCHIVO.imagen.maxMB * 1024 * 1024;
        if (listo.size > max) {
          fail(`La imagen pesa ${(listo.size / 1048576).toFixed(1)} MB y el máximo son ${
            TIPOS_ARCHIVO.imagen.maxMB} MB.`);
          return;
        }
        await alSubir(await subirMia(listo));
      } catch (e) { fail(mensajeError(e, 'No se pudo subir la imagen.')); }
    };
    inp.click();
  }

  /* ============ la cabecera ============
     Lo que ve quien abre el perfil, y lo mismo que verá quien reciba el enlace.
     Se pinta con lo que hay guardado, no con lo que se está escribiendo en el
     formulario: si alguien teclea un nombre y no lo guarda, la cabecera no puede
     decir que ése es su nombre. */
  function pintarCabecera(){
    const { avatar_url, portada_url, ocupacion, pais, certs, insignias } = cabecera;
    const nombre = [cabecera.nombre, cabecera.apellido].filter(Boolean).join(' ') || 'Sin nombre';

    $('#portada').innerHTML = `
      ${portada_url ? `<img src="${esc(portada_url)}" alt="">` : ''}
      <div class="encima">
        <button type="button" class="btn sm" id="btnPortada"
          aria-label="${portada_url ? 'Cambiar la portada' : 'Poner una portada'}">
          <span class="material-symbols-outlined" aria-hidden="true">photo_camera</span>
          <span class="solo-ancho">${portada_url ? 'Cambiar portada' : 'Poner una portada'}</span></button>
        ${portada_url ? `<button type="button" class="btn outline sm" id="btnQuitarPortada"
          aria-label="Quitar la portada"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>` : ''}
      </div>`;

    $('#miFoto').innerHTML = `${avatar_url
      ? `<img src="${esc(avatar_url)}" alt="Tu foto de perfil">`
      : '<span class="material-symbols-outlined">person</span>'}
      ${sinFoto ? '' : '<span class="lapiz"><span class="material-symbols-outlined">photo_camera</span></span>'}`;

    $('#nombreGrande').textContent = nombre;
    /* Ocupación y país, separados por un punto, igual que en la página pública.
       Si no hay ninguna de las dos cosas, de qué casa es esta persona: es verdad
       y evita un hueco debajo del nombre. */
    $('#titularPerfil').textContent =
      [ocupacion, pais ? paisConBandera(pais) : ''].filter(Boolean).join(' · ')
      || TITULAR_POR_ROL[p.rol] || 'Equipo del CEM';
    $('#credencialesPerfil').hidden = !certs;
    $('#credencialesTxt').textContent = certs === 1
      ? '1 credencial verificada' : `${certs} credenciales verificadas`;

    /* Las mismas tres que la página pública, y contando lo mismo. Un rato
       contaron cosas distintas —aquí los programas cursados, allí los trabajos—
       y la cabecera dejaba de servir para lo único que tiene que servir: saber
       qué va a ver el otro sin tener que pedirle el enlace a nadie. */
    $('#cifrasPerfil').innerHTML = [
      [certs, 'Certificados'],
      [insignias, 'Insignias'],
      [cabecera.obras, 'Trabajos'],
    ].map(([n, txt]) => `<div><b>${num(n)}</b><span>${esc(txt)}</span></div>`).join('');

    /* Al auditor la base le prohíbe TODA escritura sobre los perfiles —para que
       quien revisa no cambie lo revisado—, así que ofrecerle el botón de la
       foto sería ofrecerle un error de permisos con otro nombre. Se le dice con
       las mismas palabras que ya usa el resto de la casa. */
    if (sinFoto) {
      $('#miFoto').disabled = true;
      $('#miFoto').setAttribute('aria-label', sinFoto);
      $('#miFoto').title = sinFoto;
      $('#btnPortada').remove();
      if ($('#btnQuitarPortada')) $('#btnQuitarPortada').remove();
      return;
    }

    $('#miFoto').onclick = () => elegirImagen(600, async (url) => {
      await guardarImagen({ avatar_url: url }, 'Foto guardada.');
    }, { encuadrar: true });
    $('#btnPortada').onclick = () => elegirImagen(1600, async (url) => {
      await guardarImagen({ portada_url: url }, 'Portada guardada.');
    });
    if ($('#btnQuitarPortada')) $('#btnQuitarPortada').onclick = () =>
      guardarImagen({ portada_url: null }, 'Portada quitada.');
  }

  /* ============ mis certificados, en pequeño ============
     Una fila por diploma con lo justo para reconocerlo, y al tocarla se abre
     entero. Los anulados se enseñan igual, marcados: esconderlos haría que
     alguien creyera que se le perdió, y lo que pasó es otra cosa. */
  function pintarMisCertificados(){
    const host = $('#misDiplomas');
    if (!host) return;
    if (!CERTIFICADOS.length) { host.innerHTML = ''; return; }

    host.innerHTML = `<div class="lista-diplomas">${CERTIFICADOS.map((c, i) => `
      <button type="button" class="fila-diploma" data-diploma="${i}">
        <span class="material-symbols-outlined" aria-hidden="true">workspace_premium</span>
        <span class="crece">
          <b>${esc(c.titulo || c.cem_courses?.nombre || 'Certificado')}</b>
          <span class="tiny muted">${esc(c.codigo)} · ${fdate(c.emitido_en)}</span>
        </span>
        ${c.anulado_en ? '<span class="chip err">Anulado</span>'
                       : '<span class="chip ok">Vigente</span>'}
        <span class="material-symbols-outlined flecha">chevron_right</span>
      </button>`).join('')}</div>`;

    $$('[data-diploma]', host).forEach((b) => b.onclick = () => {
      const c = CERTIFICADOS[Number(b.dataset.diploma)];
      if (!c) return;
      /* Sin marca de agua: es su certificado y ésta es su cuenta. La marca sólo
         aparece en el perfil público, que lo abre cualquiera. */
      const m = modal({
        title: c.titulo || 'Certificado', wide: true,
        body: lienzoCertificado(c, `${cabecera.nombre} ${cabecera.apellido || ''}`.trim(),
                                { id: 'diplomaAqui', qr: window.qrcode })
          + (c.anulado_en ? '<p class="nota err sep">Este certificado está anulado. '
              + 'Si crees que es un error, escríbenos por soporte.</p>' : ''),
        footer: `<button class="btn outline" data-x>Cerrar</button>
          <button class="btn" data-imprimir>
            <span class="material-symbols-outlined" aria-hidden="true">print</span> Imprimir o guardar en PDF</button>`,
      });
      $('[data-x]', m).onclick = m.close;
      $('[data-imprimir]', m).onclick = () => imprimirDiploma($('#diplomaAqui', m), c.codigo);
    });
  }

  /* Imprimir se lleva el mismo dibujo y la misma hoja de estilos. Antes se
     copiaba el HTML a una ventana en blanco con dos reglas escritas a mano, y
     salía sin bordes ni tipografía: un folio con texto suelto. */
  function imprimirDiploma(nodo, codigo){
    if (!nodo) return;
    const w = window.open('', '_blank');
    if (!w) { fail('El navegador bloqueó la ventana. Permite las ventanas emergentes y vuelve a intentarlo.'); return; }
    const hojas = [...document.querySelectorAll('link[rel=stylesheet]')]
      .map((l) => `<link rel="stylesheet" href="${l.href}">`).join('');
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
      <title>${esc(codigo || 'Certificado')}</title>${hojas}
      <style>body{margin:0;padding:24px;background:#fff}
        @page{size:A4 landscape;margin:12mm}</style></head>
      <body>${nodo.outerHTML}
      <script>addEventListener('load',()=>setTimeout(()=>print(),400))<\/script></body></html>`);
    w.document.close();
  }

  /* Guardar de verdad, y sólo cantar victoria si de verdad se guardó.
     ═══════════════════════════════════════════════════════════════════════════
     Un `update` que no encuentra ninguna fila —porque una regla de la base lo
     bloquea, o porque el id no cuadra— NO devuelve error: devuelve cero filas y
     se queda tan tranquilo. Así que esto decía «Foto guardada» aunque no se
     hubiera guardado nada, y quien lo veía volvía a intentarlo. Pasó de verdad:
     siete fotos subidas al almacén en medio minuto, y el perfil sin foto.

     El `.select()` obliga a que la base devuelva la fila que tocó. Si vuelve
     vacía, no se guardó, y hay que decirlo en vez de felicitar a nadie. */
  async function guardarImagen(campos, mensaje){
    const { data, error } = await sb.from('cem_profiles')
      .update(campos).eq('id', me.id).select('id');
    if (error) { fail(mensajeError(error)); return; }
    if (!data || !data.length) {
      fail('No se pudo guardar en tu perfil. La imagen sí se subió: vuelve a intentarlo '
         + 'y, si sigue igual, avísanos — es cosa nuestra, no tuya.');
      return;
    }
    Object.assign(cabecera, campos);
    pintarCabecera();
    ok(mensaje);
  }

  async function cargarPortafolio(){
    const { data, error } = await sb.from('cem_portafolio')
      .select('*').eq('profile_id', me.id).order('orden').order('created_at');
    if (error) { $('#portafolio').innerHTML = `<p class="tiny muted">${esc(mensajeError(error))}</p>`; return; }
    obras = data || [];
    pintarPortafolio();
    // La cabecera cuenta los trabajos, y llegan después que ella.
    cabecera.obras = obras.length;
    pintarCabecera();
  }

  function pintarPortafolio(){
    if (!obras.length){
      $('#portafolio').innerHTML = `<p class="tiny muted">Todavía no has añadido nada.
        Empieza por lo que mejor te represente: una foto, un título corto y, si tienes, el enlace
        donde se ve o se compra.</p>`;
      return;
    }
    $('#portafolio').innerHTML = `<div class="rejilla-material">${obras.map(o => `
      <div class="card sin-margen">
        ${o.imagen_url
          ? `<div class="previa" style="height:130px"><img src="${esc(o.imagen_url)}" alt="${esc(o.titulo)}" loading="lazy"></div>`
          : `<div class="previa sin-previa" style="height:130px"><span class="material-symbols-outlined">work</span></div>`}
        <div class="negrita" style="font-size:13.5px">${esc(o.titulo)}</div>
        ${o.descripcion ? `<div class="tiny muted">${esc(o.descripcion)}</div>` : ''}
        ${o.enlace ? `<div class="tiny muted recorta">${esc(o.enlace)}</div>` : ''}
        <div class="row sep-poco">
          <button class="btn ghost sm" data-obra="${esc(o.id)}" title="Editar" aria-label="Editar">
            <span class="material-symbols-outlined" aria-hidden="true">edit</span></button>
          <button class="btn ghost sm" data-borrar="${esc(o.id)}" style="color:var(--error)" title="Quitar" aria-label="Quitar">
            <span class="material-symbols-outlined" aria-hidden="true">delete</span></button>
        </div>
      </div>`).join('')}</div>`;

    $$('[data-obra]').forEach(b => b.onclick = () => formObra(obras.find(o => o.id === b.dataset.obra)));
    $$('[data-borrar]').forEach(b => b.onclick = async () => {
      const o = obras.find(x => x.id === b.dataset.borrar);
      if (!await confirmDialog(`¿Quitar «${o?.titulo || ''}» de tu perfil?`)) return;
      const { error } = await sb.from('cem_portafolio').delete().eq('id', b.dataset.borrar);
      if (error) { fail(mensajeError(error)); return; }
      ok('Quitado.'); cargarPortafolio();
    });
  }

  function formObra(o){
    const nueva = !o;
    const m = modal({ title: nueva ? 'Añadir a mi trabajo' : 'Editar', body: `
      <div class="field"><label for="oTitulo">Qué es *</label>
        <input id="oTitulo" required maxlength="90" value="${esc(o?.titulo || '')}"
          placeholder="Sesión de fotos para marcas"></div>
      <div class="field"><label for="oDesc">Cuéntalo en una línea o dos</label>
        <textarea id="oDesc" rows="2" maxlength="280"
          placeholder="Qué haces, para quién y qué incluye.">${esc(o?.descripcion || '')}</textarea></div>
      <div class="field"><label for="oEnlace">Enlace (opcional)</label>
        <input id="oEnlace" type="url" value="${esc(o?.enlace || '')}"
          placeholder="https://…"></div>
      <div class="field"><label>Foto</label><div id="oFoto"></div></div>
      <div id="oMsg"></div>`,
      footer: `<button class="btn outline" data-x>Cancelar</button>
               <button class="btn" data-s>${nueva ? 'Añadir' : 'Guardar'}</button>` });

    const campo = campoArchivo({ id: 'oImg', tipo: 'imagen', valor: o?.imagen_url || '',
      subir: subirMia, etiquetaSubir: 'Elegir una foto', permitirEnlace: true });
    $('#oFoto', m).innerHTML = campo.html;
    campo.conectar($('#oFoto', m));

    $('[data-s]', m).onclick = async () => {
      const titulo = $('#oTitulo', m).value.trim();
      if (titulo.length < 3){ avisar($('#oMsg', m), 'Ponle un título, aunque sea corto.', 'err'); return; }
      const fila = { titulo, descripcion: $('#oDesc', m).value.trim() || null,
        enlace: $('#oEnlace', m).value.trim() || null, imagen_url: campo.valor() || null };
      const { error } = nueva
        ? await sb.from('cem_portafolio').insert({ ...fila, profile_id: me.id, orden: obras.length })
        : await sb.from('cem_portafolio').update(fila).eq('id', o.id);
      if (error){ avisar($('#oMsg', m), mensajeError(error), 'err'); return; }
      m.close(); ok(nueva ? 'Añadido a tu perfil.' : 'Guardado.'); cargarPortafolio();
    };
  }

  function pintarSolicitudesInscripcion(lista){
    $('#cardSolInsc').hidden = lista.length === 0;
    if (!lista.length) return;

    /* Lo que espera respuesta se dice en la línea plegada y la abre sola: es la
       única de las cinco filas que le importa a alguien hoy. Lo resuelto puede
       quedarse guardado. */
    const enEspera = lista.filter(s => s.estado === 'pendiente').length;
    const señal = $('#contSolInsc');
    señal.textContent = enEspera
      ? `${enEspera} esperando respuesta`
      : `${lista.length} en total`;
    señal.className = enEspera ? 'chip warn' : 'chip neutral';
    if (enEspera) $('#cardSolInsc').open = true;

    $('#tbSolInsc').innerHTML = lista.map(s => `<tr>
      <td class="muted">${fdate(s.created_at)}</td>
      <td>${esc(s.tipo)}</td>
      <td class="wrap">${esc(s.motivo)}</td>
      <td>${chip(s.estado === 'pendiente' ? 'en revisión' : s.estado)}</td>
      <td class="wrap muted">${esc(s.resolucion || '—')}</td></tr>`).join('');
  }

  $('#btnNuevaObra').onclick = () => formObra(null);
  if ($('#btnEditarDatos')) $('#btnEditarDatos').onclick = editarMisDatos;
}
