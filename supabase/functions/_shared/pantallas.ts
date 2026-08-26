// ─────────────────────────────────────────────────────────────────────────
//   A DÓNDE LLEVAR A QUIEN PREGUNTA
//
//   Cemi contestaba «los certificados se emiten desde Certificados →
//   Plantillas» y ahí terminaba: quien preguntaba tenía que ir a buscar esa
//   pantalla por el menú, que en administración son veintisiete entradas en
//   siete grupos. La respuesta era correcta y aun así había que trabajar.
//
//   Este archivo es la lista de destinos. Dos reglas que lo gobiernan:
//
//   1) NUNCA se ofrece un botón a una pantalla que la persona no puede abrir.
//      Un enlace que rebota al panel es peor que ningún enlace: parece que la
//      plataforma está rota. Por eso cada destino trae sus roles COPIADOS del
//      `require:` de la propia pantalla, no inventados aquí. Si un día cambia
//      el require de una pantalla, esta lista se queda vieja — la prueba
//      `pruebas/casos` que compara las dos cosas es lo que lo va a cantar.
//
//   2) Esto NO es un permiso. Es una sugerencia de navegación. Aunque alguien
//      forzara el destino, la pantalla vuelve a comprobar el rol al abrirse y
//      la base vuelve a comprobarlo fila por fila. Igual que con las
//      herramientas: la carta no es la cerradura.
// ─────────────────────────────────────────────────────────────────────────

export type Pantalla = {
  /* La ruta desde la raíz del sitio, sin barra inicial. */
  ruta: string;
  /* Lo que dice el botón. Corto: cabe en una burbuja de chat. */
  titulo: string;
  /* Copiados del `require:` de esa pantalla. Vacío = cualquiera con sesión. */
  roles: string[];
  /* Con qué palabras se reconoce de qué está hablando la respuesta. Van sin
     tildes y en minúscula: la comparación normaliza las dos partes. */
  claves: string[];
};

const COORD = ["coordinador", "admin", "superadmin"];
const COBRA = ["cobranza", "coordinador", "admin", "superadmin"];
const ENSENA = ["profesor", "coordinador", "admin", "superadmin"];
const DIRECCION = ["admin", "superadmin"];

export const PANTALLAS: Pantalla[] = [
  // ── del equipo ────────────────────────────────────────────────────────
  { ruta: "plataforma/admin/certificados-plantillas.html",
    titulo: "Certificados y plantillas", roles: COORD,
    claves: ["certificado", "certificados", "diploma", "diplomas", "plantilla de certificado",
             "emitir certificado", "graduacion", "graduados", "birrete"] },
  { ruta: "plataforma/admin/pagos-verificar.html",
    titulo: "Verificar pagos", roles: [...COBRA, "auditor"],
    claves: ["verificar pago", "pago por verificar", "comprobante", "pago pendiente",
             "confirmar pago", "reportar pago"] },
  { ruta: "plataforma/admin/carteras.html",
    titulo: "Carteras y cobranza", roles: [...COBRA, "auditor"],
    claves: ["cartera", "carteras", "cuota vencida", "cuotas vencidas", "mora", "moroso",
             "cobranza", "deuda", "a quien llamo", "vencido"] },
  { ruta: "plataforma/admin/inscripciones.html",
    titulo: "Inscripciones y pagos", roles: [...COBRA, "auditor"],
    claves: ["inscripcion", "inscripciones", "inscribir", "plan de pago", "cuotas"] },
  { ruta: "plataforma/admin/estudiantes.html",
    titulo: "Estudiantes", roles: [...COBRA, "auditor"],
    claves: ["estudiante", "estudiantes", "alumno", "alumnos", "matricular", "matricula",
             "expediente"] },
  { ruta: "plataforma/admin/cohortes.html",
    titulo: "Cohortes", roles: [...COORD, "auditor"],
    claves: ["cohorte", "cohortes", "grupo", "grupos", "seccion", "horario"] },
  { ruta: "plataforma/admin/cursos.html",
    titulo: "Cursos y programas", roles: [...COORD, "auditor"],
    claves: ["curso", "cursos", "programa", "programas", "catalogo", "temario"] },
  { ruta: "plataforma/admin/calificar.html",
    titulo: "Calificar entregas", roles: [...ENSENA, "auditor"],
    claves: ["calificar", "corregir", "correccion", "entrega", "entregas", "nota", "notas"] },
  { ruta: "plataforma/admin/evaluaciones.html",
    titulo: "Evaluaciones", roles: [...ENSENA, "auditor"],
    claves: ["evaluacion", "evaluaciones", "examen", "examenes", "quiz", "prueba"] },
  { ruta: "plataforma/admin/cierre-mes.html",
    titulo: "Cierre de mes", roles: [...COBRA, "auditor"],
    claves: ["cierre de mes", "cerrar el mes", "cierre mensual", "ingresos del mes",
             "cuanto entro", "facturacion"] },
  { ruta: "plataforma/admin/reportes.html",
    titulo: "Reportes", roles: [...COORD, "auditor"],
    claves: ["reporte", "reportes", "informe", "informes", "exportar", "excel", "estadistica"] },
  { ruta: "plataforma/admin/leads.html",
    titulo: "Contactos de la web", roles: COBRA,
    claves: ["contacto", "contactos", "lead", "leads", "interesado", "interesados",
             "sin atender"] },
  { ruta: "plataforma/admin/comunicaciones.html",
    titulo: "Comunicaciones", roles: [...ENSENA, "coordinador", "auditor"],
    claves: ["mensaje", "mensajes", "comunicado", "comunicacion", "avisar a", "escribirle a",
             "whatsapp", "correo masivo"] },
  { ruta: "plataforma/admin/asistente.html",
    titulo: "El asistente", roles: [...COORD, "auditor"],
    claves: ["asistente", "cemi", "lo que sabe", "fichas del bot", "por confirmar",
             "borrador", "borradores"] },
  { ruta: "plataforma/admin/auditoria.html",
    titulo: "Registro de auditoría", roles: [...DIRECCION, "auditor"],
    claves: ["auditoria", "registro de auditoria", "quien hizo", "historial", "rastro"] },
  { ruta: "plataforma/admin/usuarios.html",
    titulo: "Usuarios y roles", roles: [...DIRECCION, "auditor"],
    claves: ["usuario", "usuarios", "rol", "roles", "permiso", "permisos", "dar de alta",
             "invitar al equipo"] },
  { ruta: "plataforma/admin/formas-de-pago.html",
    titulo: "Formas de pago", roles: DIRECCION,
    claves: ["forma de pago", "formas de pago", "donde pagar", "datos bancarios",
             "cuenta bancaria", "pago movil", "zelle"] },
  { ruta: "plataforma/admin/insignias.html",
    titulo: "Insignias", roles: [...COORD, "auditor"],
    claves: ["insignia", "insignias", "medalla", "logro"] },
  { ruta: "plataforma/admin/soporte.html",
    titulo: "Soporte", roles: [...COORD, "auditor"],
    claves: ["ticket", "tickets", "soporte", "reclamo", "incidencia"] },
  { ruta: "plataforma/admin/profesores.html",
    titulo: "Profesores", roles: [...COORD, "auditor"],
    claves: ["profesor", "profesores", "docente", "docentes", "asignar profesor"] },
  { ruta: "plataforma/docente/aula.html",
    titulo: "Mi aula", roles: ENSENA,
    claves: ["mi aula", "dar clase", "clase en vivo", "asistencia"] },

  // ── del estudiante ────────────────────────────────────────────────────
  { ruta: "plataforma/estudiante/panel.html",
    titulo: "Mi panel", roles: ["estudiante"],
    claves: ["mi panel", "mis cursos", "como voy", "mi progreso", "seguir estudiando",
             "donde me quede"] },
  { ruta: "plataforma/estudiante/pagos.html",
    titulo: "Mis pagos", roles: ["estudiante"],
    claves: ["mi pago", "mis pagos", "mi cuota", "mis cuotas", "cuanto debo", "vence",
             "vencimiento", "reportar mi pago", "como pago"] },
  { ruta: "plataforma/estudiante/certificados.html",
    titulo: "Mis logros", roles: ["estudiante"],
    claves: ["mi certificado", "mis certificados", "mi diploma", "mis logros",
             "mis insignias", "descargar mi certificado"] },
  { ruta: "plataforma/estudiante/evaluaciones.html",
    titulo: "Mis evaluaciones", roles: ["estudiante"],
    claves: ["mi evaluacion", "mis evaluaciones", "mi examen", "mis examenes", "mi nota",
             "mis notas"] },
  { ruta: "plataforma/estudiante/calendario.html",
    titulo: "Mi calendario", roles: ["estudiante"],
    claves: ["mi calendario", "cuando es", "proxima clase", "horario de clase"] },
  { ruta: "plataforma/estudiante/biblioteca.html",
    titulo: "Biblioteca", roles: ["estudiante"],
    claves: ["biblioteca", "material", "materiales", "recurso", "recursos", "descargable"] },
  { ruta: "plataforma/estudiante/ayuda.html",
    titulo: "Ayuda", roles: ["estudiante"],
    claves: ["ayuda", "no puedo entrar", "tengo un problema", "soporte", "escribir al equipo"] },
  { ruta: "plataforma/estudiante/perfil.html",
    titulo: "Mi perfil", roles: ["estudiante"],
    claves: ["mi perfil", "mi foto", "mis datos", "cambiar mi", "perfil publico"] },
  { ruta: "plataforma/catalogo.html",
    titulo: "Los programas", roles: [],
    claves: ["que programas hay", "que cursos hay", "catalogo", "inscribirme", "apuntarme",
             "precio", "cuanto cuesta"] },
];

/* Cada herramienta apunta a la pantalla donde se ve lo mismo con las manos.
   Se declara aquí y no en `herramientas.ts` para no engordar la carta que se
   le manda al modelo: esto no lo ve el modelo, lo usa el servidor después. */
export const PANTALLA_DE_LA_HERRAMIENTA: Record<string, string> = {
  donde_me_quede: "plataforma/estudiante/panel.html",
  mis_certificados: "plataforma/estudiante/certificados.html",
  como_pago: "plataforma/estudiante/pagos.html",
  avisame_antes: "plataforma/estudiante/pagos.html",
  buscar_en_lecciones: "plataforma/estudiante/panel.html",
  apuntarme: "plataforma/catalogo.html",
  quien_no_ha_entregado: "plataforma/admin/calificar.html",
  recordar_entrega: "plataforma/admin/calificar.html",
  pasar_asistencia: "plataforma/docente/aula.html",
  cola_de_correccion: "plataforma/admin/calificar.html",
  a_quien_llamo_hoy: "plataforma/admin/carteras.html",
  tanda_de_cuotas: "plataforma/admin/carteras.html",
  registrar_pago: "plataforma/admin/pagos-verificar.html",
  cuanto_entro: "plataforma/admin/cierre-mes.html",
  quien_esta_en_riesgo: "plataforma/admin/estudiantes.html",
  que_falta_para_cerrar: "plataforma/admin/cierre-mes.html",
  preparar_certificados: "plataforma/admin/certificados-plantillas.html",
  matricular: "plataforma/admin/estudiantes.html",
  resumen_semana: "plataforma/admin/reportes.html",
  por_que_bajo: "plataforma/admin/reportes.html",
  lo_que_hice: "plataforma/admin/asistente.html",
  por_confirmar: "plataforma/admin/asistente.html",
};

const sinTildes = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function puedeAbrirla(p: Pantalla, rol: string): boolean {
  return p.roles.length === 0 || p.roles.includes(rol);
}

/**
 * Elige a dónde llevar a quien preguntó, o null si no hay un sitio claro.
 *
 * Primero manda la herramienta que se usó: si Cemi acaba de mirar la cartera,
 * el botón lleva a la cartera y no hay nada que adivinar. Sólo cuando no se
 * usó ninguna se buscan palabras, y ahí se exige que la coincidencia sea de
 * una frase reconocible —no de una palabra suelta— para no ofrecer un botón
 * equivocado, que es peor que no ofrecer ninguno.
 */
export function aDondeLlevar(
  { pregunta, respuesta, herramientasUsadas, rol }:
  { pregunta: string; respuesta: string; herramientasUsadas: string[]; rol: string },
): { ruta: string; titulo: string } | null {
  const r = String(rol || "").toLowerCase();
  const porRuta = (ruta: string) => PANTALLAS.find((p) => p.ruta === ruta);

  for (const usada of herramientasUsadas) {
    const ruta = PANTALLA_DE_LA_HERRAMIENTA[usada];
    const p = ruta ? porRuta(ruta) : null;
    if (p && puedeAbrirla(p, r)) return { ruta: p.ruta, titulo: p.titulo };
  }

  /* El texto donde buscar: la pregunta pesa más que la respuesta, porque la
     respuesta puede nombrar de pasada tres pantallas distintas. */
  const enPregunta = sinTildes(pregunta || "");
  const enRespuesta = sinTildes(respuesta || "");

  let mejor: { p: Pantalla; puntos: number } | null = null;
  for (const p of PANTALLAS) {
    if (!puedeAbrirla(p, r)) continue;
    let puntos = 0;
    for (const clave of p.claves) {
      const k = sinTildes(clave);
      /* Una frase de dos palabras o más es una señal fuerte; una palabra
         suelta, floja — «pago» sale en media plataforma. */
      const peso = k.includes(" ") ? 3 : 1;
      if (enPregunta.includes(k)) puntos += peso * 2;
      else if (enRespuesta.includes(k)) puntos += peso;
    }
    if (puntos && (!mejor || puntos > mejor.puntos)) mejor = { p, puntos };
  }

  // Por debajo de esto la coincidencia es una palabra suelta perdida en la
  // respuesta, y el botón acertaría por casualidad.
  if (!mejor || mejor.puntos < 3) return null;
  return { ruta: mejor.p.ruta, titulo: mejor.p.titulo };
}
