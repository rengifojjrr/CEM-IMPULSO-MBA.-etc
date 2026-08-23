/* Las puertas: qué se puede llamar y quién puede llamarlo.
   ==========================================================================
   Por qué existe esta prueba.

   La base tenía unas noventa funciones que respondían a cualquiera con la
   clave publicable, que es la que va escrita en el código del sitio y por
   tanto la tiene cualquiera que abra la portada. Se habían intentado cerrar
   tres veces. Las tres fallaron por lo mismo: se hacía
   `revoke execute ... from anon`, y eso no cierra nada, porque Postgres le
   concede EXECUTE a PUBLIC al crear la función y anon hereda de PUBLIC. El
   permiso seguía llegando por la otra puerta y la tabla de permisos parecía
   correcta.

   Lo que hace que esta prueba sirva y las revisiones de antes no: aquí no se
   lee ninguna tabla de permisos. Se llama a las funciones desde una pestaña
   SIN SESIÓN, con el mismo cliente que usa el sitio, que es exactamente lo que
   haría alguien de fuera. Si contesta, está abierta, diga lo que diga el
   catálogo.

   Y comprueba las dos direcciones. Una prueba que sólo mirara que lo cerrado
   está cerrado pasaría en verde con el sitio público roto entero, porque la
   forma más fácil de cerrarlo todo es cerrarlo TODO. Por eso la segunda mitad
   afirma que la portada, el catálogo y el verificador de certificados siguen
   funcionando sin cuenta. */

import { acta, nuevaPestana, entrar, BASE, conLaBase } from '../entorno.mjs';

/* Funciones del equipo. Ninguna tiene por qué contestarle a un desconocido:
   unas guardan claves de Stripe o del proveedor de correo, otras mueven
   dinero, otras listan a la gente que ha dejado su contacto. */
const DEL_EQUIPO = [
  ['cem_stripe_guardar',           { p_publishable_key: 'x', p_modo: 'test' }],
  ['cem_stripe_quitar',            {}],
  ['cem_correo_proveedor_guardar', { p_proveedor: 'resend', p_remitente: 'a@b.com', p_api_key: 'x' }],
  ['cem_youtube_app_guardar',      { p_client_id: 'x', p_redirect_uri: 'x' }],
  ['cem_metodo_pago_guardar',      { p_metodo: 'zelle', p_titular: 'x', p_destino: 'x' }],
  ['cem_carteras_saldos',          {}],
  ['cem_leads_listar',             {}],
  ['cem_correo_vaciar_ahora',      { p_tanda: 1 }],
  ['cem_correo_estado',            {}],
  ['cem_guardar_tasa_manual',      { p_valor: 1, p_moneda: 'VES' }],
  ['cem_aporte_guardar',           { p_concepto: 'x', p_monto: 1, p_tipo_capital: 'x' }],
  ['cem_invitaciones_listar',      {}],
  ['cem_metricas_estudiantes',     { p_dias: 365 }],
  ['cem_reproducciones_sospechosas', { p_dias: 30 }],
  ['cem_notas_cohorte',            { p_cohort: '00000000-0000-0000-0000-000000000000' }],
  ['cem_exam_questions',           { p_assessment_id: '00000000-0000-0000-0000-000000000000' }],
];

/* Y las que el sitio SÍ necesita sin cuenta. Si alguna de éstas se cierra, la
   portada deja de pintarse y nadie se entera hasta que llama un cliente. */
const DEL_SITIO = [
  ['cem_paises_de_la_portada',  {}],
  ['cem_valoracion_cursos',     { p_minimo: 1 }],
  ['cem_verify_certificate',    { p_codigo: 'NO-EXISTE-000' }],
  ['cem_tasa_vigente',          { p_moneda: 'VES' }],
  ['cem_perfil_publico',        { p_slug: 'no-existe-000' }],
  ['cem_slug_de_certificado',   { p_codigo: 'NO-EXISTE-000' }],
];

export default async function correr(navegador) {
  const a = acta('puertas');

  /* ============ 1 · sin sesión ============ */
  const P = await nuevaPestana(navegador, { ancho: 1200, alto: 800 });
  await P.goto(`${BASE}/plataforma/inicio.html`, { waitUntil: 'domcontentloaded' });
  await P.waitForTimeout(1200);

  /* Las llamadas que se esperan rechazadas escriben en la consola; sin esto,
     el capturador de errores de la pestaña las contaría como fallos del sitio. */
  /* Lo que se exige aquí es el código 42501, «permission denied for function»,
     y no vale cualquier error. La primera versión daba por buena una función
     con tal de que fallara, y así pasaba en verde con la puerta abierta: casi
     todas comprueban el rol por dentro y se niegan solas, de modo que un
     `revoke` deshecho por error no cambiaba nada de lo que la prueba veía.

     Se comprobó a propósito: se le volvió a conceder EXECUTE a anon sobre
     cem_carteras_saldos y la prueba siguió en verde. Con el 42501 la caza.

     La diferencia importa aunque la de dentro también frene. Una función que
     se puede llamar se ejecuta: entra en la base, consulta, y su mensaje de
     rechazo suele decir si algo existe. Cerrarla es que ni llegue a correr. */
  const abiertas = await P.silenciarMientras(() => conLaBase(P, async (sb, lista) => {
    const malas = [];
    for (const [fn, args] of lista) {
      const { error } = await sb.rpc(fn, args);
      if (String(error?.code) !== '42501') {
        malas.push(`${fn} (${error ? 'se niega ella sola, pero corre' : 'contesta'})`);
      }
    }
    return malas;
  }, DEL_EQUIPO));

  a.comprobar(abiertas.length === 0,
    abiertas.length
      ? `Sin sesión no deberían ni poder llamarse, y ${abiertas.length} sí: ${abiertas.join('; ')}`
      : `Sin sesión, las ${DEL_EQUIPO.length} funciones del equipo ni llegan a correr`);

  const cerradas = await conLaBase(P, async (sb, lista) => {
    const malas = [];
    for (const [fn, args] of lista) {
      const { error } = await sb.rpc(fn, args);
      /* Un «no existe ese certificado» es una respuesta: la función corrió.
         Lo que delata una puerta cerrada de más es el 42501 de permisos. */
      if (error && String(error.code) === '42501') malas.push(fn);
    }
    return malas;
  }, DEL_SITIO);

  a.comprobar(cerradas.length === 0,
    cerradas.length
      ? `Se cerró de más: el sitio público necesita ${cerradas.join(', ')}`
      : `Y las ${DEL_SITIO.length} que el sitio usa sin cuenta siguen abiertas`);

  /* Cerrar funciones no vale de nada si las tablas se leen directamente. */
  const fugas = await conLaBase(P, async (sb) => {
    const salida = {};
    for (const t of ['cem_profiles', 'cem_payments', 'cem_identidad',
                     'cem_integraciones', 'cem_settings', 'cem_audit_events']) {
      const { data, error } = await sb.from(t).select('*').limit(1);
      salida[t] = error ? 'niega' : `${(data || []).length} fila(s)`;
    }
    return salida;
  });
  const conFilas = Object.entries(fugas).filter(([, v]) => /^[1-9]/.test(v)).map(([k]) => k);
  a.comprobar(conFilas.length === 0,
    conFilas.length
      ? `Sin sesión se leen filas de: ${conFilas.join(', ')}`
      : 'Y por la puerta de las tablas tampoco sale ni una fila');

  /* La otra dirección otra vez: que el catálogo se siga leyendo sin cuenta. */
  const cursos = await conLaBase(P, async (sb) => {
    const { data, error } = await sb.from('cem_courses')
      .select('id,nombre').eq('estado', 'publicado').limit(5);
    return error ? -1 : (data || []).length;
  });
  a.comprobar(cursos > 0,
    cursos > 0
      ? `El catálogo se sigue leyendo sin cuenta (${cursos} curso(s) publicado(s))`
      : 'El catálogo dejó de leerse sin cuenta: la portada está rota');
  await P.close();

  /* ============ 2 · con sesión de estudiante ============ */
  const E = await nuevaPestana(navegador, { ancho: 1200, alto: 800 });
  await entrar(E, 'estudiante', 'estudiante/panel.html');
  await E.waitForSelector('#page:not(.hidden)', { timeout: 40000 });

  /* Una comprobación por función, no las tres juntas: la primera versión las
     mezclaba con un «y», y cuando falló no se sabía cuál de las tres era.

     Y lo que se mira no es «da error». Esta base tiene dos formas legítimas de
     decir que algo no es tuyo: negar la llamada, o devolverla filtrada y vacía.
     cem_leads_listar usa la segunda —lleva el permiso en el `where`—, así que
     exigirle un error habría dado por rota una función que funciona bien. Lo
     que importa en las dos formas es lo mismo: que no salga ni una fila. */
  const alumno = await E.silenciarMientras(() => conLaBase(E, async (sb) => {
    const mirar = async (fn, args) => {
      const { data, error } = await sb.rpc(fn, args);
      if (error) return { ok: true, como: 'la niega' };
      const filas = Array.isArray(data) ? data.length
                  : (data == null ? 0 : 1);
      return { ok: filas === 0, como: filas === 0 ? 'devuelve vacío' : `¡${filas} fila(s)!` };
    };
    return {
      metricas: await mirar('cem_metricas_estudiantes', { p_dias: 365 }),
      leads:    await mirar('cem_leads_listar', {}),
      carteras: await mirar('cem_carteras_saldos', {}),
    };
  }));
  for (const [que, r] of Object.entries(alumno)) {
    a.comprobar(r.ok, `Un estudiante con sesión no saca nada de «${que}» (${r.como})`);
  }
  await E.close();

  /* ============ 3 · con sesión del equipo ============ */
  const A = await nuevaPestana(navegador, { ancho: 1340, alto: 1000 });
  await entrar(A, 'admin', 'admin/index.html');
  await A.waitForSelector('#page:not(.hidden)', { timeout: 40000 });

  /* La clave del proveedor de correo no la lee NADIE por RPC, ni el admin.
     Sólo la usan por dentro las funciones que mandan el correo. */
  const jefe = await A.silenciarMientras(() => conLaBase(A, async (sb) => {
    const { data: met, error: eMet } = await sb.rpc('cem_metricas_estudiantes', { p_dias: 3650 });
    const { error: eCfg } = await sb.rpc('cem_correo_config');
    return {
      metricasOk: !eMet && met && typeof met === 'object',
      alumnos: met?.alumnos ?? null,
      tieneCobertura: !!met?.cobertura,
      claveNegada: !!eCfg,
    };
  }));

  a.comprobar(jefe.metricasOk,
    `El equipo sí ve las métricas de estudiantes (${jefe.alumnos ?? '—'} alumno(s))`);
  a.comprobar(jefe.tieneCobertura,
    'Y vienen con la cobertura: cuánta gente ha rellenado cada dato, para no '
    + 'dibujar un gráfico de tres respuestas como si hablara de todos');
  a.comprobar(jefe.claveNegada,
    'La clave del proveedor de correo no se la da ni al admin');
  await A.close();

  return a;
}
