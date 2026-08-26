// ═══════════════════════════════════════════════════════════════════════════
// Las herramientas de Cemi
//
// Hasta ahora el asistente sólo sabía CONTAR: se le metía un resumen en el
// prompt y hablaba de él. Cuando le preguntaban «puedes hacer cambios en el
// programa?» contestaba que no y prometía avisar al equipo — y ni hacía ni
// avisaba, porque no tenía con qué.
//
// Esto es el con qué. Cada herramienta es una función de la base de datos, y
// TODAS las de datos son SECURITY INVOKER: corren con el permiso de quien
// pregunta.
//
// ─────────────────────────────────────────────────────────────────────────
// LO MÁS IMPORTANTE DE ESTE ARCHIVO, y si sólo se lee una cosa que sea ésta:
//
//   La lista `roles` de cada herramienta NO es el sistema de permisos.
//   Es la carta del restaurante: decide qué se le OFRECE a cada quien para
//   que el modelo no pierda el tiempo ni se confunda.
//
//   Quién puede de verdad lo decide la base, fila por fila, y lo decide otra
//   vez aunque el modelo llame a una herramienta que no le tocaba. Un profesor
//   al que se le colara `a_quien_llamo_hoy` recibiría una lista vacía; no
//   porque este archivo se lo impida, sino porque cem_installments no le da
//   las filas.
//
//   Defender esto con una lista de JavaScript sería defenderlo con algo que se
//   puede convencer, y a un modelo se le convence. Esto no se convence.
// ─────────────────────────────────────────────────────────────────────────

export type Herramienta = {
  nombre: string;
  rpc: string;
  descripcion: string;
  /* Los parámetros que el MODELO puede rellenar. */
  parametros: Record<string, unknown>;
  obligatorios?: string[];
  /* Los que pone el servidor y el modelo no ve nunca. Es la diferencia entre
     escalar la conversación de quien escribe y escalar la que le apetezca. */
  delServidor?: string[];
  /* Dónde se ofrece. Ver la nota de arriba: esto es la carta, no la cerradura. */
  ambito: "estudiante" | "equipo" | "ambos";
  roles?: string[];
  /* Si escribe, se anota en auditoría y se puede deshacer. */
  escribe?: boolean;
  entidad?: string;
  /* De dónde sacar el identificador de lo escrito, para poder deshacerlo. */
  idEnRespuesta?: string;
};

const TODOS = ["profesor", "cobranza", "coordinador", "admin", "superadmin", "auditor"];
const COBRA = ["cobranza", "coordinador", "admin", "superadmin"];
const COORD = ["coordinador", "admin", "superadmin"];
const ENSENA = ["profesor", "coordinador", "admin", "superadmin"];

export const HERRAMIENTAS: Herramienta[] = [
  /* ── La que arregla la promesa rota ─────────────────────────────────────
     El guion le hace decir «aviso al equipo» en cuatro sitios. Esta es la que
     hace que sea verdad. Va la primera a propósito. */
  {
    nombre: "avisar_al_equipo",
    rpc: "cem_bot_escalar",
    descripcion:
      "Avisa a una persona del equipo para que le escriban a quien estás atendiendo. "
      + "Úsala SIEMPRE que pidan hablar con alguien, se quejen, insistan en algo que no "
      + "puedes resolver, o digan que ya pagaron y no les aparece. No la anuncies dos "
      + "veces: si ya avisaste en esta conversación, dilo y sigue.",
    parametros: {
      p_motivo: { type: "string", description: "En una frase, qué necesita esa persona." },
    },
    obligatorios: ["p_motivo"],
    delServidor: ["p_conversacion"],
    ambito: "ambos",
  },

  /* ── El alumno ──────────────────────────────────────────────────────── */
  {
    nombre: "donde_me_quede",
    rpc: "cem_bot_donde_me_quede",
    descripcion:
      "Dónde dejó cada uno de sus programas y cuál es la siguiente lección. "
      + "Para «por dónde iba», «sigue donde lo dejé», «qué me toca ahora».",
    parametros: {},
    ambito: "estudiante",
  },
  {
    nombre: "mis_certificados",
    rpc: "cem_bot_mis_certificados",
    descripcion:
      "Los certificados que YA tiene emitidos, con el enlace para descargarlos y el "
      + "código para verificarlos. No emite ninguno nuevo.",
    parametros: {},
    ambito: "estudiante",
  },
  {
    nombre: "como_pago",
    rpc: "cem_bot_como_pago",
    descripcion:
      "Lo que debe y por dónde puede pagarlo. Úsala para «cuánto debo», «cómo pago», "
      + "«cuándo vence». NUNCA digas con esto que un pago entró: eso lo verifica una persona.",
    parametros: {},
    ambito: "estudiante",
  },
  {
    nombre: "avisame_antes",
    rpc: "cem_bot_avisame_antes",
    descripcion:
      "Guarda con cuántos días de antelación quiere que le avisen antes de que "
      + "venza una cuota. Por defecto el centro avisa con 3.",
    parametros: {
      p_dias: { type: "integer", description: "Días de antelación, entre 1 y 30." },
    },
    obligatorios: ["p_dias"],
    ambito: "estudiante",
    escribe: true,
    entidad: "cem_bot_recordatorios",
  },
  {
    nombre: "buscar_en_lecciones",
    rpc: "cem_bot_buscar_en_lecciones",
    descripcion:
      "Busca un tema dentro de las lecciones de SUS programas y devuelve el enlace. "
      + "Para «dónde explicaron X», «en qué clase vieron Y».",
    parametros: {
      p_texto: { type: "string", description: "El tema que busca, en pocas palabras." },
    },
    obligatorios: ["p_texto"],
    ambito: "estudiante",
  },
  {
    nombre: "apuntarme",
    rpc: "cem_bot_apuntarme",
    descripcion:
      "Crea su inscripción a un programa, PENDIENTE de pago. No la activa. "
      + "Si el nombre encaja con varios programas te devuelve la lista: pregúntale cuál.",
    parametros: {
      p_programa: { type: "string", description: "Nombre del programa, o parte de él." },
    },
    obligatorios: ["p_programa"],
    ambito: "estudiante",
    escribe: true,
    entidad: "cem_enrollments",
    idEnRespuesta: "inscripcion",
  },

  /* ── El profesor ────────────────────────────────────────────────────── */
  {
    nombre: "quien_no_ha_entregado",
    rpc: "cem_bot_quien_no_ha_entregado",
    descripcion: "Quiénes de sus grupos no han entregado todavía, con nombres.",
    parametros: {
      p_curso: { type: "string", description: "Acotar a un programa. Opcional." },
    },
    ambito: "equipo",
    roles: ENSENA,
  },
  {
    nombre: "recordar_entrega",
    rpc: "cem_bot_redactar_recordatorio_entrega",
    descripcion:
      "REDACTA un recordatorio para quienes no han entregado y lo deja preparado. "
      + "No lo manda: hace falta que una persona lo confirme. Dile a cuántos iría y que "
      + "falta confirmarlo.",
    parametros: {
      p_evaluacion: { type: "string", description: "Nombre de la evaluación, o parte." },
    },
    obligatorios: ["p_evaluacion"],
    delServidor: ["p_conversacion"],
    ambito: "equipo",
    roles: ENSENA,
  },
  {
    nombre: "pasar_asistencia",
    rpc: "cem_bot_pasar_asistencia",
    descripcion:
      "Registra la asistencia de una clase. Se le dan los AUSENTES; el resto quedan "
      + "presentes. Si algún nombre no lo reconoce te lo devuelve sin tocarlo: dilo.",
    parametros: {
      p_clase: { type: "string", description: "Título de la clase, o parte." },
      p_ausentes: {
        type: "array", items: { type: "string" },
        description: "Nombres de quienes faltaron.",
      },
    },
    obligatorios: ["p_clase"],
    ambito: "equipo",
    roles: ENSENA,
    escribe: true,
    entidad: "cem_attendance",
  },
  {
    nombre: "cola_de_correccion",
    rpc: "cem_bot_mi_cola_de_correccion",
    descripcion:
      "Lo que tiene pendiente de corregir, ordenado por lo que lleva más tiempo esperando.",
    parametros: {},
    ambito: "equipo",
    roles: ENSENA,
  },

  /* ── Cobranza ───────────────────────────────────────────────────────── */
  {
    nombre: "a_quien_llamo_hoy",
    rpc: "cem_bot_a_quien_llamo_hoy",
    descripcion:
      "Los vencidos ordenados por lo que pesan: monto por días de retraso, con teléfono. "
      + "Es la lista de llamar, no la de mirar.",
    parametros: {
      p_cuantos: { type: "integer", description: "Cuántos devolver. Por defecto 12." },
    },
    ambito: "equipo",
    roles: COBRA,
  },
  {
    nombre: "tanda_de_cuotas",
    rpc: "cem_bot_redactar_tanda_cuotas",
    descripcion:
      "PREPARA la tanda de recordatorios de las cuotas que vencen en los próximos días. "
      + "No la manda: la deja para confirmar. Di a cuántos iría y cuánto suma.",
    parametros: {
      p_dias: { type: "integer", description: "Cuántos días por delante mirar. Por defecto 7." },
    },
    delServidor: ["p_conversacion"],
    ambito: "equipo",
    roles: COBRA,
  },
  {
    nombre: "registrar_pago",
    rpc: "cem_bot_registrar_pago",
    descripcion:
      "Registra un pago como PENDIENTE DE VERIFICAR. Nunca digas que el pago entró ni "
      + "que está confirmado: eso lo comprueba una persona mirando la cuenta. "
      + "Si el nombre encaja con varias personas te devuelve la lista: pregunta cuál.",
    parametros: {
      p_quien: { type: "string", description: "Nombre de quien pagó." },
      p_monto: { type: "number", description: "Cuánto." },
      p_moneda: { type: "string", description: "USD, EUR, VES..." },
      p_metodo: { type: "string", description: "Cómo pagó." },
      p_referencia: { type: "string", description: "Referencia del comprobante." },
      p_fecha: { type: "string", description: "Fecha del pago, AAAA-MM-DD." },
    },
    obligatorios: ["p_quien", "p_monto"],
    ambito: "equipo",
    roles: COBRA,
    escribe: true,
    entidad: "cem_payments",
    idEnRespuesta: "pago",
  },
  {
    nombre: "cuanto_entro",
    rpc: "cem_bot_cuanto_entro",
    descripcion:
      "Cuánto se cobró, por método, comparado con el periodo anterior, y cuánto hay "
      + "registrado sin verificar todavía.",
    parametros: {
      p_dias: { type: "integer", description: "Cuántos días atrás. Por defecto 7." },
    },
    ambito: "equipo",
    roles: COBRA,
  },

  /* ── Coordinación ───────────────────────────────────────────────────── */
  {
    nombre: "quien_esta_en_riesgo",
    rpc: "cem_bot_quien_esta_en_riesgo",
    descripcion:
      "Quiénes dan señales de estar dejándolo: semanas sin entrar, cuotas vencidas, "
      + "entregas sin hacer. Devuelve las señales, no un veredicto. Una sola señal no "
      + "dice mucho; dos juntas sí.",
    parametros: {
      p_cuantos: { type: "integer", description: "Cuántos devolver. Por defecto 15." },
    },
    ambito: "equipo",
    roles: COORD,
  },
  {
    nombre: "que_falta_para_cerrar",
    rpc: "cem_bot_que_falta_para_cerrar",
    descripcion:
      "Lo que bloquea el cierre del mes, con el número al lado y a qué pantalla ir.",
    parametros: {},
    ambito: "equipo",
    roles: COORD,
  },
  {
    nombre: "preparar_certificados",
    rpc: "cem_bot_preparar_certificados",
    descripcion:
      "PREPARA el lote de certificados de quienes ya cumplen los requisitos. No los "
      + "emite: hace falta confirmarlo. Di a cuántos y que falta confirmar.",
    parametros: {
      p_programa: { type: "string", description: "Acotar a un programa. Opcional." },
    },
    delServidor: ["p_conversacion"],
    ambito: "equipo",
    roles: COORD,
  },
  {
    nombre: "matricular",
    rpc: "cem_bot_matricular",
    descripcion:
      "Matricula a alguien en un programa y le arma el plan de cuotas. Queda PENDIENTE "
      + "de pago. Si el nombre encaja con varias personas te devuelve la lista: pregunta.",
    parametros: {
      p_quien: { type: "string", description: "Nombre de la persona." },
      p_programa: { type: "string", description: "Nombre del programa, o parte." },
      p_cuotas: { type: "integer", description: "En cuántas cuotas. Opcional." },
    },
    obligatorios: ["p_quien", "p_programa"],
    ambito: "equipo",
    roles: COORD,
    escribe: true,
    entidad: "cem_enrollments",
    idEnRespuesta: "inscripcion",
  },

  /* ── Dirección ──────────────────────────────────────────────────────── */
  {
    nombre: "resumen_semana",
    rpc: "cem_bot_resumen_semana",
    descripcion:
      "Cuánto entró, cuántos entraron, qué se emitió y qué está atascado. "
      + "Esto además se manda solo los lunes a dirección.",
    parametros: {
      p_dias: { type: "integer", description: "Cuántos días. Por defecto 7." },
    },
    ambito: "equipo",
    roles: TODOS,
  },
  {
    nombre: "por_que_bajo",
    rpc: "cem_bot_por_que_bajo",
    descripcion:
      "El embudo comparado con el periodo anterior, para ver en qué PASO se está "
      + "cayendo la gente. No da la respuesta: da dónde mirar. Si te avisa de que las "
      + "cifras son pequeñas, dilo tú también.",
    parametros: {
      p_dias: { type: "integer", description: "Tamaño del periodo. Por defecto 30." },
    },
    ambito: "equipo",
    roles: COORD,
  },

  /* ── Lo que Cemi hizo, y deshacerlo ─────────────────────────────────── */
  {
    nombre: "lo_que_hice",
    rpc: "cem_bot_lo_que_hizo",
    descripcion: "Lo que ha escrito el asistente en los últimos días, para poder revisarlo.",
    parametros: {
      p_dias: { type: "integer", description: "Cuántos días atrás. Por defecto 7." },
    },
    ambito: "equipo",
    roles: TODOS,
  },
  {
    nombre: "por_confirmar",
    rpc: "cem_bot_borradores_listar",
    descripcion:
      "Lo que está preparado esperando que alguien lo confirme. Si hay algo pendiente "
      + "de quien te habla, recuérdaselo.",
    parametros: {},
    ambito: "equipo",
    roles: TODOS,
  },
];

/* ── Qué se le ofrece a quien pregunta ───────────────────────────────────
   Otra vez, porque importa: esto elige qué VE el modelo, no qué PUEDE hacer
   la persona. Lo segundo ya está decidido en la base. */
export function paraQuien(ambito: string, rol?: string): Herramienta[] {
  const r = String(rol || "").toLowerCase();
  return HERRAMIENTAS.filter((h) => {
    if (h.ambito !== "ambos" && h.ambito !== ambito) return false;
    if (ambito === "equipo" && h.roles && !h.roles.includes(r)) return false;
    return true;
  });
}

/* El formato que entiende la API de modelos (el de OpenAI, que es el que
   habla Groq). */
export function comoLasPideElModelo(hs: Herramienta[]) {
  return hs.map((h) => ({
    type: "function",
    function: {
      name: h.nombre,
      description: h.descripcion,
      parameters: {
        type: "object",
        properties: h.parametros,
        required: h.obligatorios ?? [],
        additionalProperties: false,
      },
    },
  }));
}
