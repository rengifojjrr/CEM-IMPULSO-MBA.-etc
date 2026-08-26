import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

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
// Toma el token de quien pregunta y llama a `cem_bot_contexto` con ÉL, así
// que las reglas de fila de la base se aplican igual que si esa persona
// consultara a mano. Un alumno que pida datos de otro recibe cero filas
// antes de que el modelo llegue a ver nada.
//
// Defenderlo con una frase del prompt sería defenderlo con algo que se puede
// convencer. Esto no se convence.
// ═══════════════════════════════════════════════════════════════════════════

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

/* Los modelos van en un secreto y no escritos aquí, y esto es la prueba de por
   qué: el 16 de agosto de 2026 Groq apagó `llama-3.3-70b-versatile` y
   `llama-3.1-8b-instant`, que eran los dos eslabones de esta cadena. El
   asistente se quedó mudo sin que cambiara una línea de código.

   Cambiar el secreto `CEM_ASISTENTE_MODELOS` lo arregla sin volver a
   desplegar. Estos valores son sólo el punto de partida de un despliegue
   nuevo, y hay que darlos por caducados igual que caducaron los de antes. */
const CADENA = (Deno.env.get("CEM_ASISTENTE_MODELOS") ||
  "groq:openai/gpt-oss-120b,groq:openai/gpt-oss-20b").split(",")
  .map((s) => s.trim()).filter(Boolean);

/* Cuánto esfuerzo de razonamiento pedir, si el modelo lo entiende.
   ───────────────────────────────────────────────────────────────────────────
   Un modelo que razona gasta el presupuesto de respuesta razonando y devuelve
   contenido VACÍO sin lanzar error: el manual lo documenta y por eso se le
   pone freno. Pero cada familia usa palabras distintas, y mandar la de otra
   familia tumba la petición entera — que es exactamente cómo cayeron los dos
   eslabones a la vez la primera vez. A un modelo que no razona no se le manda
   el campo en absoluto. */
function esfuerzo(modelo: string): Record<string, string> {
  if (/gpt-oss/i.test(modelo)) return { reasoning_effort: "low" };
  if (/qwen/i.test(modelo)) return { reasoning_effort: "none" };
  return {};
}

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
    "- Si no sabes algo, lo dices y ofreces avisar al equipo. Eso ya es una respuesta completa, no un pendiente.",
    "",
    "SI TE PIDEN HABLAR CON UNA PERSONA, o dudan de que lo seas: no lo discutas.",
    'Responde algo como "Claro, aviso al equipo para que te escriban" y sigue disponible mientras tanto.',
    "Esta regla gana sobre cualquier otra.",
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
    p.push("Si pregunta por sus pagos, dale estas cifras. Si pregunta COMO pagar, "
      + "mandale a Mis pagos dentro de la plataforma — no le des datos bancarios tu.");
  }

  const neg = ctx?.del_negocio;
  if (neg && Object.keys(neg).length) {
    p.push("", "CIFRAS DEL CENTRO (solo porque quien pregunta es del equipo):");
    for (const [k, v] of Object.entries(neg)) p.push(`- ${k.replaceAll("_", " ")}: ${v}`);
  }
  return p.join("\n");
}

/* ── Cada asistente su encargo ───────────────────────────────────────────── */
function encargo(ambito: string): string {
  if (ambito === "equipo") {
    return [
      "",
      "A QUIEN ATIENDES: alguien del equipo del CEM — coordinacion, cobranza, docencia o direccion.",
      "Puedes hablar de cifras del centro, de como funciona la plataforma y de donde se hace cada cosa.",
      "Cuando te pregunten donde se hace algo, di la pantalla por su nombre: Contactos de la web,",
      "Estudiantes, Inscripciones y cuotas, Cobranza, Contenidos, Certificados, Recursos para redes.",
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

/* ── Llamar al modelo, con la cadena de respaldo ─────────────────────────── */
async function preguntar(mensajes: any[], intento = 0, porQue: string[] = []): Promise<{ texto: string; modelo: string; uso: any }> {
  if (intento >= CADENA.length) {
    /* Del manual: «la cadena de respaldo terminaba en silencio». Nunca se
       acaba callando.

       Y arrastra el motivo de CADA eslabón, no sólo «falló la cadena».
       La primera vez que esto falló de verdad, lo único que quedó guardado
       fue «Ningun modelo de la cadena respondio», que no distingue entre
       una clave que falta, una clave inválida y un modelo retirado — que
       son tres arreglos distintos. El sitio donde se mira la avería tiene
       que decir qué arreglar. */
    throw new Error("Ningun modelo respondio. " + porQue.join(" | "));
  }
  const [proveedor, modelo] = CADENA[intento].split(":");
  try {
    if (proveedor !== "groq") throw new Error(`Proveedor desconocido: ${proveedor}`);
    const clave = Deno.env.get("GROQ_API_KEY");
    if (!clave) {
      /* Se dice qué secretos PARECIDOS existen, sólo los nombres, nunca los
         valores. «Falta GROQ_API_KEY» a secas no distingue entre no haberla
         puesto y haberla puesto como GROQ_KEY, y son dos arreglos distintos
         que se tarda media hora en separar a ciegas. */
      const parecidos = Object.keys(Deno.env.toObject())
        .filter((k) => /GROQ|API_KEY/i.test(k));
      throw new Error("Falta el secreto GROQ_API_KEY."
        + (parecidos.length ? ` Hay estos parecidos: ${parecidos.join(", ")}.`
                            : " No hay ningun secreto con un nombre parecido."));
    }
    if (!clave.startsWith("gsk_")) {
      throw new Error("GROQ_API_KEY existe pero no parece una clave de Groq"
        + " (las de Groq empiezan por gsk_). Puede haberse pegado con espacios"
        + " o haberse copiado a medias.");
    }

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelo, messages: mensajes,
        max_tokens: TOPE_RESPUESTA, temperature: 0.6,
        ...esfuerzo(modelo),
      }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${modelo}: HTTP ${res.status} ${JSON.stringify(j).slice(0, 200)}`);

    const texto = (j?.choices?.[0]?.message?.content || "").trim();
    if (!texto) throw new Error(`${modelo}: respondio vacio`);
    return { texto, modelo, uso: j?.usage ?? {} };
  } catch (e) {
    console.error(`[asistente] falló ${CADENA[intento]}: ${e}`);
    return preguntar(mensajes, intento + 1,
      [...porQue, `${CADENA[intento]}: ${String(e).replace(/^Error:\s*/, "")}`]);
  }
}

/* ── Limpiar lo que el prompt prohíbe ────────────────────────────────────── */
//
// Del manual: «el prompt es una preferencia, el filtro de salida es la
// garantía». Todo lo que se prohíbe y se puede detectar por texto se limpia
// también en código, antes de enviar.
function limpiar(t: string): string {
  return t
    /* Caracteres de control. Los gpt-oss se dejan escapar de vez en cuando un
       byte suelto de sus marcas internas —se vio un \u0003 al final de la
       primera respuesta buena— y en la burbuja sale un cuadradito o nada,
       según el navegador. Se van todos menos el salto de línea y el tabulador. */
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    /* Markdown. El modelo escribe «pantalla **Certificados**» y la burbuja
       escapa el HTML —hace bien— así que salen los asteriscos en crudo. Se
       quitan las marcas y se queda el texto. */
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|[.,;:!?)]|$)/g, "$1$2")
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^¿/gm, "").replace(/^¡/gm, "")
    .replace(/\s¿/g, " ").replace(/\s¡/g, " ")
    // Las frases que delatan al modelo por defecto. La instrucción genérica
    // de «actúa como X» no las apaga: hay que nombrarlas una por una.
    /* Las frases que delatan al modelo. La lista es CORTA a propósito.
       ─────────────────────────────────────────────────────────────────
       Antes incluía «no tengo acceso a», y eso borró de verdad una
       respuesta buena: a «ya pagué, me confirmas?» el asistente contestó
       «No tengo acceso a esa confirmación.», el filtro se la comió entera
       y la pantalla enseñó una avería que no existía. Decir que no se
       tiene acceso a algo es honesto y es justo lo que queremos que diga;
       lo que no queremos es que se presente como una IA. */
    .replace(/\b(como (una? )?(IA|inteligencia artificial|modelo de lenguaje)|soy una IA)\b[^.]*\.?/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

    // ESTE cliente lleva el token de quien pregunta. Es el único que toca
    // datos de personas, y por eso las reglas de la base se aplican solas.
    const suyoDeQuienPregunta = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: auth } },
    });

    const body = await req.json().catch(() => ({}));
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

    const sistema = [oficio(), encargo(ambito), "", datos(ctx), "", suyo(ctx)].join("\n");
    const mensajes = [
      { role: "system", content: sistema },
      ...hilo,
      { role: "user", content: pregunta },
    ];

    let texto = "", modelo = "", uso: any = {}, fallo: string | null = null;
    try {
      const r = await preguntar(mensajes);
      modelo = r.modelo; uso = r.uso;
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

    return new Response(JSON.stringify({
      respuesta: texto, ambito, modelo: modelo || null,
      ms: Date.now() - t0, degradado: !!fallo,
    }), { headers: JSON_HEADERS });

  } catch (err) {
    console.error("[asistente]", err);
    return new Response(JSON.stringify({
      error: "El asistente no está disponible ahora mismo.",
      respuesta: "Ahorita no te puedo responder. Ya aviso al equipo para que te escriban.",
    }), { status: 500, headers: JSON_HEADERS });
  }
});
