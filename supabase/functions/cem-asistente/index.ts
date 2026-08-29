import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { conversar, limpiar } from "../_shared/cerebro.ts";
import { paraQuien } from "../_shared/herramientas.ts";
import { aDondeLlevar } from "../_shared/pantallas.ts";

// ═══════════════════════════════════════════════════════════════════════════
// El asistente del CEM
//
// Son dos asistentes con el mismo motor: uno atiende a los alumnos y otro al
// equipo. Lo que NO comparten es lo que pueden ver.
//
// La decisión de fondo, y la razón de que esto viva aquí y no en un portátil:
// el manual que acompaña este encargo abre con el error más caro de todos —
// «el servicio 24/7 corría dentro de una laptop», 13,8 horas fuera de línea
// en un día, el 58% de la jornada. Una función de servidor no se duerme, no
// se queda sin batería y no depende de que nadie deje el equipo encendido.
//
// SEGURIDAD — lo que hace que un alumno no pueda preguntar por otro:
// esta función NUNCA usa la llave de servicio para leer datos de personas.
// Toma el token de quien pregunta y con ÉL llama tanto a `cem_bot_contexto`
// como a cada herramienta, así que las reglas de fila de la base se aplican
// igual que si esa persona consultara a mano. Un alumno que pida datos de
// otro recibe cero filas antes de que el modelo llegue a ver nada.
//
// Defenderlo con una frase del prompt sería defenderlo con algo que se puede
// convencer. Esto no se convence.
//
// LO QUE CAMBIÓ: antes esto sólo CONTABA. Ahora además HACE — apuntarse a un
// programa, pasar asistencia, registrar un pago, avisar al equipo de verdad.
// Las herramientas están en ../_shared/herramientas.ts y el bucle que las
// ejecuta en ../_shared/cerebro.ts.
// ═══════════════════════════════════════════════════════════════════════════

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

const TOPE_PREGUNTA = 1500;   // caracteres
const TOPE_RESPUESTA = 700;   // tokens

/* ── El oficio: lo que no cambia entre los dos asistentes ────────────────── */
function oficio(): string {
  return [
    "Eres el asistente del CEM International Education, un centro de estudios.",
    "Hablas en español, con naturalidad, como alguien del equipo. Nunca digas que eres un bot ni una IA.",
    "",
    "COMO ESCRIBES:",
    "- Breve. Una o dos frases. Nada de introducciones ni de explicar tu propio papel.",
    "- Sin ¿ ni ¡ de apertura: sólo ? y ! al final.",
    "- Emojis casi nunca. Y JAMAS repitas el emoji de tu mensaje anterior.",
    "- Texto plano. Nada de asteriscos, negritas, titulos ni listas con guiones.",
    "- NUNCA repitas palabra por palabra algo que ya dijiste. Si insisten, dilo distinto o mas corto.",
    "",
    "LO QUE NO HACES NUNCA:",
    "- No te inventas precios, fechas, horarios ni datos de pago. Si no esta en lo que te dieron, NO EXISTE para ti.",
    "- No confirmas que un pago entro, ni prometes reembolsos, descuentos ni excepciones. Eso lo decide el equipo.",
    "- No prometes plazos de nada que no puedas comprobar.",
  ].join("\n");
}

/* ── Cómo usar lo que ahora sí puede hacer ────────────────────────────────
   Esta parte del guion existe porque el modelo, si no se le dice, hace las dos
   cosas mal en direcciones opuestas: o promete acciones que no ejecuta —que es
   exactamente el fallo que teníamos, «aviso al equipo» sin avisar a nadie— o
   se pone a llamar herramientas para saludar. */
function comoUsarlas(): string {
  return [
    "",
    "LO QUE PUEDES HACER DE VERDAD:",
    "Tienes herramientas. Cuando alguien pide algo que una de ellas hace, LLAMALA.",
    "No describas lo que vas a hacer: hazlo y luego cuenta el resultado.",
    "",
    "- NUNCA digas que vas a avisar al equipo sin llamar a avisar_al_equipo. Esa frase",
    "  sin la herramienta es una promesa falsa: no le llega a nadie.",
    "- Si te piden hablar con una persona, o dudan de que lo seas: no lo discutas.",
    "  Llama a avisar_al_equipo y di que ya avisaste. Esta regla gana sobre las demas.",
    "- Para charlar, saludar o dar las gracias NO uses ninguna herramienta.",
    "- Si una herramienta te devuelve varios candidatos, NO elijas tu: pregunta cual.",
    "- Si te devuelve un error, dilo en cristiano. No lo escondas ni te lo inventes.",
    "- Las que PREPARAN algo (recordar_entrega, tanda_de_cuotas, preparar_certificados)",
    "  no lo mandan. Di a cuantos iria y que falta que alguien lo confirme.",
  ].join("\n");
}

/* ── Lo que sabe, o el bloque que le prohíbe hablar del tema ─────────────── */
//
// Del manual: «un hueco de datos en el prompt es una invitación a alucinar».
// Cuando el catálogo llegó vacío por un backend lento, el modelo se inventó
// precios un 85% por encima del real, con total naturalidad. Por eso aquí un
// dato ausente NO se omite: se declara ausente, con la frase de espera ya
// escrita.
function datos(ctx: any): string {
  const p: string[] = [];

  const programas = ctx?.programas ?? [];
  if (programas.length) {
    p.push("PROGRAMAS QUE OFRECE EL CEM — esto es la verdad, lo que no aparece aqui no existe:");
    for (const c of programas) {
      const trozos = [`- ${c.nombre}`];
      if (c.tipo) trozos.push(`(${c.tipo})`);
      if (c.precio != null) trozos.push(`— ${c.precio} ${c.moneda || ""}`);
      if (c.horas) trozos.push(`· ${c.horas} h`);
      if (c.duracion) trozos.push(`· ${c.duracion}`);
      if (c.cuotas) trozos.push("· se puede pagar en cuotas");
      p.push(trozos.join(" "));
      if (c.resumen) p.push(`  ${c.resumen}`);
      const mods = (c.modulos ?? []).filter(Boolean);
      if (mods.length) {
        p.push("  Modulos: " + mods.map((m: any) =>
          m.titulo + (m.certifica ? " (certificado propio)" : "")).join(", "));
      }
    }
  } else {
    p.push(
      "NO TIENES EL CATALOGO DE PROGRAMAS. Es un fallo nuestro, no lo menciones.",
      "TIENES PROHIBIDO decir nombres de programas, precios, duraciones o fechas.",
      'Si preguntan por la oferta, responde exactamente esto: "Dejame confirmarte eso con el equipo y te escribo".',
    );
  }

  const aprendido = ctx?.lo_aprendido ?? [];
  if (aprendido.length) {
    p.push("", "LO QUE TE HA ENSEÑADO EL EQUIPO:");
    for (const k of aprendido) p.push(`- ${k.titulo}: ${k.contenido}`);
  }

  return p.join("\n");
}

/* ── Lo de quien pregunta ────────────────────────────────────────────────── */
//
// Del manual: lo que ya se sabe de alguien se inyecta como HECHOS que puede
// usar, no como una ficha para recitar. Si no se inyecta, lo vuelve a
// preguntar; si no se le dice cómo usarlo, lo lee en voz alta y suena a base
// de datos.
function suyo(ctx: any): string {
  const q = ctx?.quien;
  if (!q) return "Quien escribe no ha entrado a su cuenta: solo puedes hablar de lo publico.";

  const p = [
    `QUIEN TE ESCRIBE: ${q.nombre || "sin nombre"}. Llamale ${q.primer_nombre || "por su nombre"}.`,
    "Usa lo de abajo cuando venga a cuento. NO lo recites ni lo leas en voz alta.",
  ];

  const mio = ctx?.lo_mio ?? {};
  const ins = mio.inscripciones ?? [];
  const cer = mio.certificados ?? [];
  const cuo = mio.cuotas_por_pagar ?? [];

  if (ins.length) {
    p.push("Esta inscrito en: " + ins.map((e: any) =>
      `${e.programa} (${e.estado}, ${e.avance})`).join("; "));
  } else {
    p.push("Todavia no esta inscrito en ningun programa.");
  }
  if (cer.length) {
    p.push("Certificados que ya tiene: " + cer.map((c: any) =>
      `${c.titulo} (${c.codigo}, ${c.emitido})`).join("; "));
  }
  if (cuo.length) {
    p.push("Cuotas que le faltan por pagar: " + cuo.map((c: any) =>
      `cuota ${c.numero} de ${c.monto} ${c.moneda || ""} vence el ${c.vence} (${c.estado})`).join("; "));
  }

  const neg = ctx?.del_negocio;
  if (neg && Object.keys(neg).length) {
    p.push("", "CIFRAS DEL CENTRO (solo porque quien pregunta es del equipo):");
    for (const [k, v] of Object.entries(neg)) p.push(`- ${k.replaceAll("_", " ")}: ${v}`);
  }
  return p.join("\n");
}

/* ── Lo que hace cada quien en el CEM ─────────────────────────────────────
   Sin esto, el asistente del equipo trata igual a quien cobra y a quien da
   clase: contesta cosas ciertas pero que no son de su trabajo, y quien
   pregunta tiene que traducir.

   Y hay algo que NO se hace aquí: esto no da ni quita permisos. Lo que cada
   quien puede ver ya lo decidió la base antes de llegar hasta aquí; esto sólo
   cambia de qué se le habla. */
const OFICIOS: Record<string, string[]> = {
  cobranza: [
    "SU OFICIO: cobrar. Lleva las cuotas, los pagos y quien debe.",
    "Sus pantallas: Verificar pagos, Carteras, Cierre de mes, Formas de pago, Inscripciones y cuotas.",
    "De cursos, notas y contenidos NO se ocupa: si pregunta por eso, dile que lo lleva coordinacion.",
    "Cuando pregunte por alguien que debe, dale la cifra y donde verla, no un discurso.",
  ],
  coordinador: [
    "SU OFICIO: que las clases pasen. Matricula, cohortes, contenidos, profesores y certificados.",
    "Sus pantallas: Estudiantes, Inscripciones y cuotas, Cohortes, Cursos, Contenidos, Certificados, Calificar.",
    "No cambia roles ni cuentas: eso es de administracion.",
  ],
  profesor: [
    "SU OFICIO: dar clase. Sus cursos, sus notas y su asistencia.",
    "Sus pantallas: Mi aula, Como va mi grupo, Asistencia, Calificar.",
    "Solo de SUS cursos. De dinero no habla: si pregunta por pagos, mandale a cobranza.",
  ],
  admin: [
    "SU OFICIO: dirigir. Ve todo, incluidas las cuentas y los roles.",
    "Sus pantallas: todas. Las suyas propias son Reportes, Usuarios y roles, Auditoria, Configuracion.",
    "Es a quien se escala lo que nadie mas puede decidir.",
  ],
  auditor: [
    "SU OFICIO: revisar. Lo lee todo y NO cambia nada.",
    "Si te pide hacer algo —emitir, aprobar, corregir— dile que su cuenta es de solo lectura",
    "y que eso lo tiene que hacer coordinacion o administracion.",
  ],
};
OFICIOS.superadmin = OFICIOS.admin;

function encargo(ambito: string, rol?: string): string {
  /* Un visitante no es un alumno con menos permisos: es otra cosa. No tiene
     avance, ni cuotas, ni certificados, y el encargo tiene que decirlo, porque
     si no el modelo intenta ayudarle con datos que no existen y termina
     inventándolos. Aquí sólo hay dos cosas que hacer: contarle los programas
     y, si le interesan, recoger sus datos. */
  if (ambito === "visitante") {
    return [
      "",
      "A QUIEN ATIENDES: alguien que esta mirando la web y NO tiene cuenta.",
      "No sabes quien es, y no tienes ningun dato suyo. No se los pidas para 'buscarlos':",
      "no hay nada que buscar.",
      "",
      "TU TRABAJO AQUI ES UNO: que entienda si algun programa le sirve.",
      "Cuentale de que va, cuanto dura, cuanto cuesta y como se paga, con los datos de arriba.",
      "Si no hay ningun programa abierto, dilo sin rodeos y ofrecele avisarle cuando abra.",
      "",
      "Si le interesa algo, o pide precio, o dice que lo va a pensar: pidele nombre y correo",
      "y usa dejar_contacto. Una sola vez, sin insistir. Si ya te los dio, no se los vuelvas a pedir.",
      "",
      "NO prometas descuentos, ni fechas, ni cupos que no esten escritos arriba.",
      "Si te preguntan algo de una persona concreta —sus notas, sus pagos, su certificado—",
      'di simple: "Eso lo ve cada quien entrando a su cuenta".',
    ].join("\n");
  }
  if (ambito === "equipo") {
    const suyo = OFICIOS[String(rol || "").toLowerCase()] ?? [];
    return [
      "",
      "A QUIEN ATIENDES: alguien del equipo del CEM.",
      ...suyo,
      "",
      "Puedes hablar de cifras del centro, de como funciona la plataforma y de donde se hace cada cosa.",
      "Cuando te pregunten donde se hace algo, di la pantalla por su nombre.",
      "Si te piden un dato que no tienes, dilo. Un numero inventado en una decision de negocio",
      "cuesta mas que no tener el numero.",
    ].join("\n");
  }
  return [
    "",
    "A QUIEN ATIENDES: un alumno del CEM, o alguien que pregunta por los programas.",
    "Ayudale a encontrar lo que busca: donde esta su curso, como va, que le falta, que programas hay.",
    "Cuando le mandes a un sitio de la plataforma, dilo por su nombre: Mi panel, Mis pagos,",
    "Certificados, Mi perfil, Biblioteca, Mis evaluaciones.",
    "Si pregunta por notas, pagos o certificados de OTRA persona, no los tienes y no los puedes tener.",
    'Dilo simple: "Eso solo lo puede ver cada quien en su cuenta".',
  ].join("\n");
}

/* ── Atender a alguien que no tiene cuenta ──────────────────────────────────
   Camino aparte del de siempre, y a propósito. El de siempre resuelve TODO con
   el token de quien pregunta, y así las reglas de la base se aplican solas. Un
   visitante no tiene token: aquí manda el servidor. Por eso lo único que se le
   deja tocar es el catálogo —público de todas formas— y dejar su contacto.

   Y por eso lleva tope de gasto propio: cada mensaje cuesta dinero de verdad, y
   una puerta abierta sin tope es una factura esperando a que alguien la
   encuentre. */
async function atenderVisitante(body: Record<string, any>, t0: number): Promise<Response> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const servidor = createClient(SUPABASE_URL, SERVICE);

  const pregunta = String(body?.pregunta ?? "").trim().slice(0, TOPE_PREGUNTA);
  /* La huella la escribe el navegador y no es de fiar: no identifica a nadie,
     sólo separa conversaciones. El tope de verdad es el global, que no depende
     de ella. */
  const huella = String(body?.huella ?? "").trim().slice(0, 64) || "sin-huella";
  if (!pregunta) {
    return new Response(JSON.stringify({ error: "No llegó ninguna pregunta." }),
      { status: 400, headers: JSON_HEADERS });
  }

  const { data: permiso } = await servidor.rpc("cem_bot_visitante_permitir", { p_huella: huella });
  if (permiso && permiso.ok === false) {
    /* No es un error técnico: es un «hasta aquí» con una salida. Se devuelve
       como respuesta normal para que la ventana lo enseñe como lo que es —una
       frase de Cemi— y no como una avería. */
    return new Response(JSON.stringify({
      respuesta: permiso.porque, ambito: "visitante", tope: true,
      ms: Date.now() - t0, degradado: false, hizo: [],
    }), { headers: JSON_HEADERS });
  }

  const { data: conv } = await servidor.rpc("cem_bot_conversacion_visitante", {
    p_huella: huella, p_id: body?.conversacion ?? null,
  });
  const conversacion = conv ?? null;

  const { data: ctx } = await servidor.rpc("cem_bot_contexto_publico");

  let hilo: any[] = [];
  if (conversacion) {
    const { data: h } = await servidor.rpc("cem_bot_historial_visitante",
      { p_conversacion: conversacion, p_huella: huella, p_tope: 16 });
    hilo = (h ?? []).map((m: any) => ({
      role: m.quien === "persona" ? "user" : "assistant", content: m.texto,
    }));
  }

  // Una sola herramienta, y la única que escribe algo: recoger un contacto.
  const catalogo = [{
    nombre: "dejar_contacto",
    rpc: "cem_bot_dejar_contacto",
    descripcion: "Guarda los datos de alguien interesado para que el equipo le escriba. "
      + "Usala cuando te den su nombre y su correo.",
    parametros: {
      p_nombre: { type: "string", description: "Su nombre." },
      p_email: { type: "string", description: "Su correo." },
      p_telefono: { type: "string", description: "Su telefono, si lo dio." },
      p_mensaje: { type: "string", description: "Que le interesa, en una frase." },
    },
    obligatorios: ["p_nombre", "p_email"],
    ambito: "estudiante" as const,
    escribe: true,
    entidad: "cem_leads",
  }];

  const sistema = [
    oficio(), comoUsarlas(), encargo("visitante"), "", datos(ctx),
  ].join("\n");

  let texto = "", modelo = "", uso: any = {}, fallo: string | null = null;
  let usadas: any[] = [];
  try {
    const r = await conversar({
      cliente: servidor,
      mensajes: [{ role: "system", content: sistema }, ...hilo,
                 { role: "user", content: pregunta }],
      catalogo,
      delServidor: {},
      tope: TOPE_RESPUESTA,
    });
    modelo = r.modelo; uso = r.uso; usadas = r.usadas;
    texto = limpiar(r.texto) || r.texto.trim();
    if (!texto) throw new Error("el modelo devolvio texto vacio");
  } catch (e) {
    fallo = String(e).slice(0, 300);
    /* Con un visitante no se puede «avisar al equipo»: no hay a quién avisar
       ni de parte de quién. Así que la salida es la única honesta — pedirle
       los datos, que es justo lo que queríamos de él. */
    texto = "Ahorita no te puedo responder bien por aquí. Si me dejas tu nombre y tu correo, "
          + "te escribe una persona del equipo.";
  }

  if (conversacion) {
    try {
      await servidor.rpc("cem_bot_guardar_visitante", {
        p_conversacion: conversacion, p_huella: huella,
        p_pregunta: pregunta, p_respuesta: texto,
        p_modelo: modelo || null,
        p_tokens_in: uso?.prompt_tokens ?? null,
        p_tokens_out: uso?.completion_tokens ?? null,
        p_ms: Date.now() - t0, p_error: fallo,
      });
    } catch (e) {
      console.error("[asistente] no se pudo guardar el turno del visitante:", e);
    }
  }

  return new Response(JSON.stringify({
    respuesta: texto, ambito: "visitante", modelo: modelo || null,
    conversacion, ms: Date.now() - t0, degradado: !!fallo,
    hizo: usadas.map((u: any) => ({ que: u.nombre, error: u.error ?? null })),
  }), { headers: JSON_HEADERS });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const t0 = Date.now();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const auth = req.headers.get("Authorization") || "";
    if (!auth) {
      return new Response(JSON.stringify({ error: "Hay que entrar para hablar con el asistente." }),
        { status: 401, headers: JSON_HEADERS });
    }

    /* ── El visitante ────────────────────────────────────────────────────
       Quien mira la web sin cuenta. Se atiende por un camino aparte y no
       aflojando el de siempre, por una razón concreta: el camino de siempre
       resuelve TODO con el token de quien pregunta, y así las reglas de la
       base se aplican solas. Un visitante no tiene token, así que aquí manda
       el servidor — y por eso lo único que se le deja tocar es el catálogo,
       que es público de todas formas, y dejar su contacto.

       Va antes de leer el contexto normal para que nunca se llegue a pedir
       datos de una persona que no existe. */
    const body0 = await req.json().catch(() => ({} as Record<string, unknown>));
    if (body0?.ambito === "visitante") {
      return await atenderVisitante(body0, t0);
    }

    // ESTE cliente lleva el token de quien pregunta. Es el único que toca
    // datos de personas —el contexto y TODAS las herramientas— y por eso las
    // reglas de la base se aplican solas.
    const suyoDeQuienPregunta = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: auth } },
    });

    /* El mismo cuerpo que ya se leyó arriba. `req.json()` sólo se puede llamar
       UNA vez: la segunda devuelve vacío y la pregunta llegaría en blanco, sin
       error que lo delatara. */
    const body = body0 as Record<string, unknown>;
    const pregunta = String(body?.pregunta ?? "").trim().slice(0, TOPE_PREGUNTA);
    const ambitoPedido = body?.ambito === "equipo" ? "equipo" : "estudiante";
    const conversacion = body?.conversacion ?? null;

    if (!pregunta) {
      return new Response(JSON.stringify({ error: "No llegó ninguna pregunta." }),
        { status: 400, headers: JSON_HEADERS });
    }

    // El contexto decide el ámbito de verdad: pedir «equipo» no te hace del
    // equipo, la función devuelve el que te corresponda.
    const { data: ctx, error: errCtx } = await suyoDeQuienPregunta
      .rpc("cem_bot_contexto", { p_ambito: ambitoPedido });
    if (errCtx) {
      return new Response(JSON.stringify({ error: "No pude leer tus datos: " + errCtx.message }),
        { status: 403, headers: JSON_HEADERS });
    }
    const ambito = ctx?.ambito === "equipo" ? "equipo" : "estudiante";
    const rol = ctx?.quien?.rol;

    // El hilo, para que no vuelva a preguntar lo que ya le dijeron. El manual
    // avisa de no recortarlo como control de costos: para eso está el tope de
    // la cuota, y recortar degrada la conversación en silencio.
    let hilo: any[] = [];
    if (conversacion) {
      const { data: h } = await suyoDeQuienPregunta
        .rpc("cem_bot_historial", { p_conversacion: conversacion, p_tope: 24 });
      hilo = (h ?? []).map((m: any) => ({
        role: m.quien === "persona" ? "user" : "assistant",
        content: m.texto,
      }));
    }

    /* Las herramientas que se le OFRECEN. Sin conversación abierta no se
       ofrece avisar_al_equipo: no habría qué escalar, y ofrecerla llevaría al
       modelo a prometer un aviso que no puede mandar — que es justo el fallo
       que estamos arreglando. */
    const catalogo = paraQuien(ambito, rol)
      .filter((h) => conversacion || h.nombre !== "avisar_al_equipo");

    const sistema = [
      oficio(), comoUsarlas(), encargo(ambito, rol), "", datos(ctx), "", suyo(ctx),
    ].join("\n");

    const mensajes = [
      { role: "system", content: sistema },
      ...hilo,
      { role: "user", content: pregunta },
    ];

    let texto = "", modelo = "", uso: any = {}, fallo: string | null = null;
    let usadas: any[] = [];
    try {
      const r = await conversar({
        cliente: suyoDeQuienPregunta,
        mensajes,
        catalogo,
        delServidor: { p_conversacion: conversacion },
        tope: TOPE_RESPUESTA,
      });
      modelo = r.modelo; uso = r.uso; usadas = r.usadas;
      /* Si el filtro se lo come todo, gana el original.
         ───────────────────────────────────────────────────────────────
         Antes esto lanzaba un error y la pantalla enseñaba la frase de
         avería. O sea: el modelo contestaba bien, mi filtro lo borraba, y
         al cliente le decíamos que estábamos caídos. Dejar pasar una frase
         algo torpe es mucho menos malo que tirar una respuesta buena y
         además mentir sobre por qué. */
      texto = limpiar(r.texto) || r.texto.trim();
      if (!texto) throw new Error("el modelo devolvio texto vacio");
    } catch (e) {
      fallo = String(e).slice(0, 300);
      // Una salida NATURAL para el fallo técnico. Si no se le da una forma
      // elegante de fallar, el modelo inventa una que expone la avería.
      texto = "Ahorita no te puedo responder bien. Ya aviso al equipo para que te escriban.";
      /* Y aquí SÍ se avisa, porque si no la frase vuelve a ser mentira —sólo
         que esta vez la mentira sería nuestra y no del modelo. */
      if (conversacion) {
        try {
          await suyoDeQuienPregunta.rpc("cem_bot_escalar", {
            p_conversacion: conversacion,
            p_motivo: "El asistente no pudo responder: " + fallo,
          });
        } catch (e2) {
          console.error("[asistente] tampoco se pudo escalar:", e2);
        }
      }
    }

    /* ── La red que sostiene la promesa ───────────────────────────────────
       Probándolo salió esto: el modelo llamó a avisar_al_equipo, la llamada
       FALLÓ, se le devolvió el error tal cual, y aun así contestó «Ya avisé al
       equipo, pronto te contactarán».

       O sea que la avería que veníamos a arreglar reaparecía un peldaño más
       arriba. Y no se arregla con una línea del guion: el guion ya decía que no
       lo prometiera sin llamarla. Un modelo no es un sitio donde poner una
       garantía.

       Así que la garantía va aquí: si el asistente DIJO que avisó, se comprueba
       y, si no está avisado, se avisa desde el servidor —que sí sabe con
       certeza de qué conversación se trata, porque no la eligió el modelo.

       Se prefiere avisar de más. Un aviso sobrante le cuesta al equipo mirar
       una conversación que no hacía falta; uno que falta le cuesta a una
       persona que le dijeron que la iban a llamar y nadie la llamó. Y de todas
       formas escalar no se repite dentro de seis horas. */
    if (conversacion && !fallo) {
      const loPrometio = /avis|notific|le paso|paso tu mensaje|te escrib|te contact/i.test(texto);
      const salioMal = usadas.some((u: any) => u.nombre === "avisar_al_equipo" && u.error);
      const salioBien = usadas.some((u: any) => u.nombre === "avisar_al_equipo" && !u.error);

      if ((loPrometio || salioMal) && !salioBien) {
        try {
          const { error } = await suyoDeQuienPregunta.rpc("cem_bot_escalar", {
            p_conversacion: conversacion,
            p_motivo: "Lo prometió el asistente en la conversación",
          });
          if (error) throw error;
        } catch (e) {
          console.error("[asistente] no se pudo cumplir el aviso prometido:", e);
          /* Si tampoco se puede avisar, lo que NO se hace es dejar la frase.
             Prometer y no cumplir es peor que decir que no se pudo. */
          texto = "Ahorita no consigo avisar al equipo por aquí. Escríbenos por "
                + "los canales del centro y te atienden.";
        }
      }
    }

    // Se guarda DESPUÉS de tener la respuesta, nunca antes. Confirmar antes de
    // completar convierte cualquier caída en pérdida definitiva.
    if (conversacion) {
      // En try/catch y no en `.catch()`: lo que devuelve `rpc` es un thenable
      // de postgrest, no una promesa — tiene `then` pero puede no tener
      // `catch`, y encadenarlo tumbaría la respuesta que ya estaba lista.
      try {
        await suyoDeQuienPregunta.rpc("cem_bot_guardar", {
          p_conversacion: conversacion, p_pregunta: pregunta, p_respuesta: texto,
          p_modelo: modelo || null,
          p_tokens_in: uso?.prompt_tokens ?? null,
          p_tokens_out: uso?.completion_tokens ?? null,
          p_ms: Date.now() - t0, p_error: fallo,
        });
      } catch (e) {
        console.error("[asistente] no se pudo guardar el turno:", e);
      }
    }

    /* A dónde puede ir quien preguntó.
       ─────────────────────────────────────────────────────────────────────
       Se decide AQUÍ y no en el navegador, por dos razones. La primera es que
       aquí se sabe qué herramienta se usó de verdad —si acaba de mirarse la
       cartera, el destino no hay que adivinarlo—. La segunda es el rol: el
       servidor ya lo tiene comprobado contra la base, y el navegador no es
       sitio para decidir a qué pantallas puede entrar alguien.

       Sale null muy a menudo, y está bien. Un botón que lleva a la pantalla
       equivocada gasta más tiempo del que ahorra. */
    const ir = fallo ? null : aDondeLlevar({
      pregunta, respuesta: texto, rol: String(rol || ""),
      herramientasUsadas: usadas.filter((u: any) => !u.error).map((u: any) => u.nombre),
    });

    return new Response(JSON.stringify({
      respuesta: texto, ambito, modelo: modelo || null,
      ms: Date.now() - t0, degradado: !!fallo,
      // Qué herramientas usó, para poder verlo en el panel sin adivinar.
      hizo: usadas.map((u: any) => ({ que: u.nombre, error: u.error ?? null })),
      ir,
    }), { headers: JSON_HEADERS });

  } catch (err) {
    console.error("[asistente]", err);
    return new Response(JSON.stringify({
      error: "El asistente no está disponible ahora mismo.",
      respuesta: "Ahorita no te puedo responder. Ya aviso al equipo para que te escriban.",
    }), { status: 500, headers: JSON_HEADERS });
  }
});
