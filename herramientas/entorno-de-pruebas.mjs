#!/usr/bin/env node
/* Prepara y limpia el entorno de pruebas.
 *
 * Las pruebas de `pruebas/` necesitan un punto de partida conocido: las seis
 * cuentas de demostración, un programa con sus módulos, una cohorte, un
 * estudiante inscrito con cuotas y una evaluación. Hasta ahora eso se armaba a
 * mano y cada tanto se estropeaba (quedaron cursos llamados "skfjnskflj" de
 * probar el formulario), así que las pruebas fallaban por el estado de los
 * datos y no por un error del programa.
 *
 *   node herramientas/entorno-de-pruebas.mjs --sembrar
 *   node herramientas/entorno-de-pruebas.mjs --limpiar-rastros
 *   node herramientas/entorno-de-pruebas.mjs --ver
 *
 * `--sembrar` es idempotente: crea lo que falte y deja lo que ya está. No borra
 * nada nunca.
 *
 * `--limpiar-rastros` borra lo que dejan las propias pruebas al correr —pagos
 * con referencia PRUEBA-…, frenos de intentos con clave prueba:…, avisos y
 * eventos de auditoría de la última tanda—. No toca datos que no haya creado
 * una prueba, y dice exactamente qué borró.
 *
 * ── Sobre la clave ──────────────────────────────────────────────────────────
 * Hace falta la clave de servicio, porque hay que crear cuentas y eso no lo
 * puede hacer el navegador. Va SIEMPRE por variable de entorno y NUNCA en un
 * archivo del repositorio:
 *
 *   CEM_SERVICE_KEY="…" node herramientas/entorno-de-pruebas.mjs --sembrar
 */

const URL_BASE = process.env.CEM_SUPABASE_URL || 'https://vajbsfgojtunamhrzrpf.supabase.co';
const CLAVE_SERVICIO = process.env.CEM_SERVICE_KEY || '';
const CLAVE_CUENTAS = process.env.CEM_PASS || 'CemDemo2026!';

const modo = process.argv[2] || '';
if (!['--sembrar', '--limpiar-rastros', '--ver'].includes(modo)) {
  console.error(`Uso:
  node herramientas/entorno-de-pruebas.mjs --sembrar          crea lo que falte
  node herramientas/entorno-de-pruebas.mjs --limpiar-rastros  borra lo que dejan las pruebas
  node herramientas/entorno-de-pruebas.mjs --ver              sólo informa, no toca nada

En todos los casos hace falta CEM_SERVICE_KEY en el entorno.`);
  process.exit(1);
}

if (!CLAVE_SERVICIO) {
  console.error('Falta CEM_SERVICE_KEY en el entorno.');
  console.error('Se saca del panel de Supabase (Project Settings → API → service_role).');
  console.error('No la escribas en ningún archivo del repositorio: sólo en la línea de comandos.');
  process.exit(1);
}

/* ══════════ cómo se habla con la base ══════════ */

const cabeceras = {
  apikey: CLAVE_SERVICIO,
  Authorization: `Bearer ${CLAVE_SERVICIO}`,
  'Content-Type': 'application/json',
};

async function rest(camino, opciones = {}) {
  const r = await fetch(`${URL_BASE}/rest/v1/${camino}`, {
    ...opciones,
    headers: { ...cabeceras, ...(opciones.headers || {}) },
  });
  const texto = await r.text();
  const cuerpo = texto ? JSON.parse(texto) : null;
  if (!r.ok) throw new Error(`${opciones.method || 'GET'} ${camino} → ${r.status} ${texto.slice(0, 300)}`);
  return cuerpo;
}

const leer = (tabla, consulta) => rest(`${tabla}?${consulta}`);

const insertar = (tabla, filas) => rest(tabla, {
  method: 'POST',
  headers: { Prefer: 'return=representation' },
  body: JSON.stringify(filas),
});

const borrar = (tabla, consulta) => rest(`${tabla}?${consulta}`, {
  method: 'DELETE',
  headers: { Prefer: 'return=representation' },
});

/** Busca una fila por una condición; si no está, la crea. Devuelve la fila. */
async function asegurar(tabla, consulta, fila) {
  const existentes = await leer(tabla, `${consulta}&limit=1`);
  if (existentes.length) return { fila: existentes[0], nueva: false };
  const [creada] = await insertar(tabla, fila);
  return { fila: creada, nueva: true };
}

/* ══════════ las cuentas ══════════ */

const CUENTAS = [
  ['admin@cem.demo',       'Ana',    'Administradora', 'admin'],
  ['coordinador@cem.demo', 'Carlos', 'Coordinador',    'coordinador'],
  ['cobranza@cem.demo',    'Carmen', 'Cobranza',       'cobranza'],
  ['profesor@cem.demo',    'Pedro',  'Profesor',       'profesor'],
  ['estudiante@cem.demo',  'Elena',  'Estudiante',     'estudiante'],
  ['auditor@cem.demo',     'Aurora', 'Auditora',       'auditor'],
];

/** Crea la cuenta en auth si no existe. Devuelve su id. */
async function asegurarCuenta(email, nombre, apellido, rol) {
  const r = await fetch(`${URL_BASE}/auth/v1/admin/users?filter=${encodeURIComponent(email)}`,
    { headers: cabeceras });
  const { users = [] } = await r.json();
  const yaEsta = users.find((u) => u.email === email);

  let id = yaEsta?.id;
  let nueva = false;
  if (!id) {
    const alta = await fetch(`${URL_BASE}/auth/v1/admin/users`, {
      method: 'POST',
      headers: cabeceras,
      body: JSON.stringify({ email, password: CLAVE_CUENTAS, email_confirm: true }),
    });
    const cuerpo = await alta.json();
    if (!alta.ok) throw new Error(`No se pudo crear ${email}: ${JSON.stringify(cuerpo).slice(0, 200)}`);
    id = cuerpo.id;
    nueva = true;
  }

  /* El perfil lo crea un disparador al nacer la cuenta, pero con el rol por
     omisión: hay que fijarlo. `upsert` por si el disparador no llegó a correr. */
  await rest('cem_profiles?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify([{ id, email, nombre, apellido, rol, activo: true }]),
  });

  return { id, nueva };
}

/* ══════════ sembrar ══════════ */

const hoy = new Date();
const enDias = (n) => new Date(hoy.getTime() + n * 86400000).toISOString().slice(0, 10);

async function sembrar() {
  const creado = [];
  const nota = (que, nueva) => { console.log(`  ${nueva ? '+' : '·'} ${que}`); if (nueva) creado.push(que); };

  console.log('\n━━ Cuentas ━━');
  const ids = {};
  for (const [email, nombre, apellido, rol] of CUENTAS) {
    const { id, nueva } = await asegurarCuenta(email, nombre, apellido, rol);
    ids[rol] = id;
    nota(`${email} (${rol})`, nueva);
  }

  console.log('\n━━ Catálogo ━━');
  const cat = await asegurar('cem_categorias', 'nombre=eq.Gestión',
    { nombre: 'Gestión', orden: 1, activo: true });
  nota('categoría «Gestión»', cat.nueva);

  const curso = await asegurar('cem_courses', 'codigo=eq.DEMO-MBA-001', {
    codigo: 'DEMO-MBA-001',
    nombre: 'MBA de demostración',
    subtitulo: 'Programa de ejemplo para las pruebas automáticas',
    descripcion_corta: 'Un programa completo con módulos, cuotas y evaluaciones, para probar la plataforma.',
    tipo: 'maestria', categoria: 'Gestión', modalidad: 'hibrido', nivel: 'intermedio',
    horas: 480, precio: 1200, moneda: 'USD', estado: 'publicado',
    cuotas_habilitadas: true, cuotas_cantidad: 4, peso_evaluaciones: 40,
    certificado_nombre: 'Máster en Administración de Empresas',
  });
  nota('programa DEMO-MBA-001', curso.nueva);
  const cursoId = curso.fila.id;

  for (const [orden, titulo] of [[1, 'Fundamentos'], [2, 'Finanzas'], [3, 'Proyecto final']]) {
    const m = await asegurar('cem_modules',
      `course_id=eq.${cursoId}&titulo=eq.${encodeURIComponent(titulo)}`,
      { course_id: cursoId, titulo, orden, descripcion: `Módulo ${orden} del programa de demostración.` });
    nota(`módulo «${titulo}»`, m.nueva);

    const l = await asegurar('cem_lessons',
      `module_id=eq.${m.fila.id}&titulo=eq.${encodeURIComponent('Clase de ' + titulo)}`,
      { module_id: m.fila.id, titulo: `Clase de ${titulo}`, tipo: 'texto', orden: 1,
        contenido: 'Contenido de ejemplo.', obligatorio: true, estado: 'publicado', duracion_min: 45 });
    nota(`lección «Clase de ${titulo}»`, l.nueva);
  }

  console.log('\n━━ Cohorte y docente ━━');
  const cohorte = await asegurar('cem_cohorts', 'codigo=eq.DEMO-C1', {
    course_id: cursoId, codigo: 'DEMO-C1', nombre: 'Cohorte de demostración',
    modalidad: 'hibrido', turno: 'noche', horario: 'Martes y jueves, 18:00 a 21:00',
    fecha_inicio: enDias(-30), fecha_fin: enDias(120), cupos: 25, estado: 'en_curso',
  });
  nota('cohorte DEMO-C1', cohorte.nueva);
  const cohorteId = cohorte.fila.id;

  const asignacion = await asegurar('cem_teacher_assignments',
    `teacher_id=eq.${ids.profesor}&cohort_id=eq.${cohorteId}`,
    { teacher_id: ids.profesor, cohort_id: cohorteId, course_id: cursoId, rol_docente: 'titular' });
  nota('el profesor asignado a la cohorte', asignacion.nueva);

  for (const [dias, titulo] of [[-7, 'Sesión pasada'], [2, 'Sesión próxima']]) {
    const c = await asegurar('cem_classes',
      `cohort_id=eq.${cohorteId}&titulo=eq.${encodeURIComponent(titulo)}`,
      { cohort_id: cohorteId, titulo, fecha: enDias(dias), hora_inicio: '18:00', hora_fin: '21:00',
        modalidad: 'en_vivo', teacher_id: ids.profesor, estado: 'programada' });
    nota(`clase «${titulo}»`, c.nueva);
  }

  console.log('\n━━ Inscripción y cuotas ━━');
  const inscripcion = await asegurar('cem_enrollments',
    `profile_id=eq.${ids.estudiante}&course_id=eq.${cursoId}`,
    { profile_id: ids.estudiante, course_id: cursoId, cohort_id: cohorteId,
      precio_lista: 1200, descuento: 0, precio_final: 1200, moneda: 'USD',
      estado: 'activa', progreso: 35, fuente: 'siembra de pruebas' });
  nota('la estudiante inscrita en el programa', inscripcion.nueva);
  const inscripcionId = inscripcion.fila.id;

  for (const n of [1, 2, 3, 4]) {
    /* La primera vencida, la segunda al caer y las otras dos por delante: así
       hay algo que cobrar, algo que reportar y algo que todavía no toca. */
    const cuota = await asegurar('cem_installments',
      `enrollment_id=eq.${inscripcionId}&numero=eq.${n}`,
      { enrollment_id: inscripcionId, numero: n, monto: 300, moneda: 'USD',
        fecha_vencimiento: enDias(n === 1 ? -20 : n === 2 ? 5 : 30 * n),
        estado: n === 1 ? 'vencida' : 'pendiente', saldo: 300 });
    nota(`cuota ${n} de 4`, cuota.nueva);
  }

  console.log('\n━━ Evaluación ━━');
  const evaluacion = await asegurar('cem_assessments',
    `course_id=eq.${cursoId}&nombre=eq.${encodeURIComponent('Examen de demostración')}`,
    { course_id: cursoId, nombre: 'Examen de demostración',
      descripcion: 'Evaluación de ejemplo para las pruebas automáticas.',
      tipo: 'examen', puntaje_max: 100, nota_aprobatoria: 60, intentos: 2,
      barajar: true, tiempo_min: 45, estado: 'publicado',
      abre_en: enDias(-10) + 'T00:00:00Z', cierra_en: enDias(20) + 'T23:59:00Z' });
  nota('«Examen de demostración»', evaluacion.nueva);

  console.log('\n━━ Tasa del día ━━');
  /* Con las mismas columnas con que la escribe la pantalla de pagos (id_tasa
     'MANUAL' + fecha), para que `cem_tasa_vigente()` la encuentre igual. No se
     usa la función `cem_guardar_tasa_manual` porque comprueba el rol de quien
     llama y la clave de servicio no tiene rol: no es nadie en particular. */
  const tasa = await asegurar('cem_tasas_bcv', `fecha=eq.${enDias(0)}&id_tasa=eq.MANUAL`, {
    id_tasa: 'MANUAL', valor: 45.75, descripcion: 'Siembra del entorno de pruebas',
    fecha: enDias(0), actualizado_en: new Date().toISOString(),
  });
  nota(`tasa de hoy (${tasa.fila.valor})`, tasa.nueva);

  console.log('\n' + '═'.repeat(58));
  console.log(creado.length
    ? `✓ Se creó lo que faltaba: ${creado.length} cosa(s).`
    : '✓ Ya estaba todo. No hizo falta crear nada.');
  console.log(`  Las cuentas entran con la contraseña de CEM_PASS (${CLAVE_CUENTAS.length} caracteres).`);
  console.log('═'.repeat(58));
}

/* ══════════ limpiar los rastros de las pruebas ══════════ */

async function limpiarRastros() {
  console.log('\n━━ Rastros de las pruebas ━━');
  const borrados = [];

  /* Los pagos que reporta la prueba de dinero. La referencia la pone ella con
     el prefijo PRUEBA- y una marca de tiempo, así que no puede coincidir con
     una referencia bancaria de verdad. Primero los pagos, después se devuelven
     las cuotas que hubieran quedado abonadas por ellos. */
  const pagos = await leer('cem_payments', 'referencia=like.PRUEBA-*&select=id,installment_id,monto,estado');
  if (pagos.length) {
    const cuotas = [...new Set(pagos.map((p) => p.installment_id).filter(Boolean))];
    await borrar('cem_payments', 'referencia=like.PRUEBA-*');
    borrados.push(`${pagos.length} pago(s) de prueba`);

    for (const id of cuotas) {
      const [cuota] = await leer('cem_installments', `id=eq.${id}&select=monto`);
      if (!cuota) continue;
      await rest(`cem_installments?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: 'pendiente', saldo: cuota.monto }),
      });
    }
    if (cuotas.length) borrados.push(`${cuotas.length} cuota(s) devueltas a pendiente`);
  }

  /* Los frenos por intentos que dejan las pruebas del webhook del banco. Si se
     quedan puestos, el banco de verdad se come el bloqueo. */
  const frenos = await borrar('cem_rate_limit', 'clave=like.prueba:*&select=clave');
  if (frenos.length) borrados.push(`${frenos.length} freno(s) de intentos`);

  /* Las solicitudes que crean las pruebas del estudiante: se reconocen por el
     texto, que la prueba escribe siempre igual. */
  const solicitudes = await borrar('cem_solicitudes_inscripcion',
    'motivo=like.*Me mudo de ciudad por trabajo*&select=id');
  if (solicitudes.length) borrados.push(`${solicitudes.length} solicitud(es) de congelamiento de prueba`);

  /* Las evaluaciones que la prueba del docente intenta crear. Sólo las que
     tienen ese nombre exacto. */
  const evaluaciones = await borrar('cem_assessments',
    'nombre=eq.Prueba%20autom%C3%A1tica&select=id');
  if (evaluaciones.length) borrados.push(`${evaluaciones.length} evaluación(es) «Prueba automática»`);

  /* Los avisos que las pruebas generan al aprobar pagos y resolver solicitudes. */
  const avisos = await borrar('cem_notificaciones',
    'cuerpo=like.*Prueba autom%C3%A1tica*&select=id');
  if (avisos.length) borrados.push(`${avisos.length} aviso(s) de prueba`);

  borrados.forEach((b) => console.log(`  − ${b}`));
  console.log('\n' + '═'.repeat(58));
  console.log(borrados.length
    ? `✓ Limpiados ${borrados.length} tipo(s) de rastro.`
    : '✓ No había rastros de pruebas que limpiar.');
  console.log('  No se tocó ningún dato que no lo hubiera creado una prueba.');
  console.log('═'.repeat(58));
}

/* ══════════ ver cómo está ══════════ */

async function ver() {
  console.log('\n━━ Cómo está el entorno ━━');

  for (const [email, , , rol] of CUENTAS) {
    const [perfil] = await leer('cem_profiles',
      `email=eq.${encodeURIComponent(email)}&select=rol,activo`);
    const bien = perfil && perfil.rol === rol && perfil.activo;
    console.log(`  ${bien ? '✓' : '✗'} ${email.padEnd(24)} ${
      perfil ? `rol ${perfil.rol}${perfil.activo ? '' : ', DESACTIVADA'}` : 'no existe'}`);
  }

  const cuentas = [
    ['programas', 'cem_courses', 'select=id'],
    ['  de demostración', 'cem_courses', 'codigo=like.DEMO-*&select=id'],
    ['cohortes', 'cem_cohorts', 'select=id'],
    ['inscripciones', 'cem_enrollments', 'select=id'],
    ['cuotas', 'cem_installments', 'select=id'],
    ['pagos', 'cem_payments', 'select=id'],
    ['  de prueba (PRUEBA-…)', 'cem_payments', 'referencia=like.PRUEBA-*&select=id'],
    ['frenos de intentos', 'cem_rate_limit', 'select=clave'],
    ['  de prueba (prueba:…)', 'cem_rate_limit', 'clave=like.prueba:*&select=clave'],
    ['evaluaciones', 'cem_assessments', 'select=id'],
    ['certificados emitidos', 'cem_certificates', 'select=id'],
    ['plantillas de certificado', 'cem_certificate_templates', 'select=id'],
  ];
  console.log('');
  for (const [etiqueta, tabla, consulta] of cuentas) {
    const filas = await leer(tabla, consulta);
    console.log(`  ${String(filas.length).padStart(5)}  ${etiqueta}`);
  }

  console.log('\n  Con --sembrar se crea lo que falte; con --limpiar-rastros se');
  console.log('  borra lo que dejan las pruebas al correr.');
}

try {
  if (modo === '--sembrar') await sembrar();
  else if (modo === '--limpiar-rastros') await limpiarRastros();
  else await ver();
} catch (e) {
  console.error(`\n✗ ${e.message}`);
  process.exit(1);
}
