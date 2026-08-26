import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// El asistente por WhatsApp.
//
// POR QUE ESTA ES LA VIA DE LA NUBE Y NO LA DEL MANUAL
// ---------------------------------------------------------------------------
// El manual que trajo este encargo conecta WhatsApp con Baileys: se escanea un
// QR desde Dispositivos vinculados y el proceso mantiene abierta una sesion de
// WhatsApp Web. Eso NO cabe aqui: una funcion de borde no tiene disco donde
// guardar la carpeta auth/ ni un proceso vivo donde sostener el socket.
//
// Y el propio manual documenta lo que cuesta esa via: la maquina no se puede
// dormir, 312 reconexiones en un dia, una caida de 1 h 46 min en plena hora de
// venta, y la carpeta auth/ que se corrompe con Bad MAC. Es la primera averia
// del documento y la mas cara.
//
// Asi que aqui se usa la API oficial de WhatsApp (Cloud API): son webhooks, no
// hay sesion que mantener, no hay QR que reescanear y no hay maquina que
// encender. Si algun dia se prefiere el numero de siempre con Baileys, el
// cerebro no cambia: ese puente solo tiene que llamar a cem-asistente igual
// que llama esta funcion.
//
// SEGURIDAD
// ---------------------------------------------------------------------------
// Por WhatsApp no hay sesion: lo unico que llega es un numero, y un numero no
// es una contrasena. Por eso aqui NO se decide quien es nadie. Se le pasa el
// telefono a `cem_bot_contexto_whatsapp` y esa funcion, dentro de la base,
// decide que ve: lo suyo si el numero es de una sola cuenta, lo publico si no,
// y las cifras del centro solo si alguien registro ese numero estando dentro
// de la plataforma con su sesion.

const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_TOKEN") || "";
const PHONE_ID = Deno.env.get("WHATSAPP_PHONE_ID") || "";

const CADENA = (Deno.env.get("CEM_ASISTENTE_MODELOS") ||
  "groq:openai/gpt-oss-120b,groq:openai/gpt-oss-20b").split(",")
  .map((s) => s.trim()).filter(Boolean);

// Cada familia usa palabras distintas para el esfuerzo de razonamiento, y
// mandar la de otra familia tumba la peticion entera. Al que no razona, nada.
function esfuerzo(modelo: string): Record<string, string> {
  if (/gpt-oss/i.test(modelo)) return { reasoning_effort: "low" };
  if (/qwen/i.test(modelo)) return { reasoning_effort: "none" };
  return {};
}

/* Con que modo atiende el webhook de Meta. Se deja en "escucha" a proposito:
   el dia que se conecte un numero de verdad, lo primero que hace es aprender
   sin hablar. Cambiar el secreto a "responde" lo enciende, sin desplegar. */
const MODO_META = (Deno.env.get("CEM_WHATSAPP_MODO") || "escucha").trim();

const TOPE_PREGUNTA = 1500;
const TOPE_RESPUESTA = 500;   // en WhatsApp se lee en el telefono: mas corto

function oficio(): string {
  return [
    "Eres el asistente del CEM International Education, un centro de estudios.",
    "Estas atendiendo por WhatsApp. Hablas en espanol, con naturalidad, como alguien del equipo.",
    "Nunca digas que eres un bot ni una IA.",
    "",
    "COMO ESCRIBES EN WHATSAPP:",
    "- Muy breve. Una o dos frases. Es un telefono, no una carta.",
    "- Sin signos de apertura: solo ? y ! al final.",
    "- Nada de listas con guiones ni negritas salvo que te pidan varias cosas.",
    "- Emojis casi nunca. Y JAMAS repitas el emoji de tu mensaje anterior.",
    "- NUNCA repitas palabra por palabra algo que ya dijiste.",
    "",
    "LO QUE NO HACES NUNCA:",
    "- No te inventas precios, fechas ni datos de pago. Si no esta en lo que te dieron, NO EXISTE.",
    "- No das datos bancarios ni confirmas que un pago entro. Eso lo hace el equipo.",
    "- No prometes plazos que no puedas comprobar.",
    "",
    "SI PIDEN HABLAR CON UNA PERSONA, o dudan de que lo seas: no lo discutas.",
    'Di algo como "Claro, aviso al equipo para que te escriban" y sigue disponible.',
    "Esta regla gana sobre cualquier otra.",
  ].join("\n");
}


/* ── Lo que hace cada quien en el CEM ─────────────────────────────────────
   Sin esto, el asistente del equipo trata igual a quien cobra y a quien da
   clase: contesta cosas ciertas pero que no son de su trabajo, y quien
   pregunta tiene que traducir. Con el oficio delante, contesta con las
   pantallas que esa persona abre todos los días.

   Y hay algo que NO se hace aquí: esto no da ni quita permisos. Lo que cada
   quien puede ver ya lo decidió la base antes de llegar hasta aquí; esto sólo
   cambia de qué se le habla. Un cobrador al que se le contara de notas
   tampoco las vería. */
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

function encargoWa(ctx: any): string {
  if (ctx?.ambito !== "equipo") return "";
  const suyo = OFICIOS[String(ctx?.quien?.rol || "").toLowerCase()] ?? [];
  if (!suyo.length) return "";
  return "\n" + ["QUIEN TE ESCRIBE ES DEL EQUIPO.", ...suyo].join("\n");
}

function datos(ctx: any): string {
  const p: string[] = [];
  const programas = ctx?.programas ?? [];
  if (programas.length) {
    p.push("PROGRAMAS DEL CEM. Esto es la verdad, lo que no aparece aqui no existe:");
    for (const c of programas) {
      const t = [`- ${c.nombre}`];
      if (c.tipo) t.push(`(${c.tipo})`);
      if (c.precio != null) t.push(`- ${c.precio} ${c.moneda || ""}`);
      if (c.horas) t.push(`- ${c.horas} h`);
      if (c.duracion) t.push(`- ${c.duracion}`);
      if (c.cuotas) t.push("- se puede pagar en cuotas");
      p.push(t.join(" "));
      if (c.resumen) p.push(`  ${c.resumen}`);
    }
  } else {
    p.push(
      "NO TIENES EL CATALOGO. Es un fallo nuestro, no lo menciones.",
      "TIENES PROHIBIDO decir nombres de programas, precios, duraciones o fechas.",
      'Si preguntan por la oferta responde exactamente: "Dejame confirmarte eso con el equipo y te escribo".',
    );
  }
  for (const k of ctx?.lo_aprendido ?? []) p.push(`- ${k.titulo}: ${k.contenido}`);
  return p.join("\n");
}

function suyo(ctx: any): string {
  const q = ctx?.quien;
  if (!q) {
    return [
      "QUIEN TE ESCRIBE: no lo sabemos. El numero no esta en la plataforma.",
      "Puedes hablar de los programas y de como inscribirse, nada mas.",
      "Si te pide datos de su inscripcion, de sus pagos o de sus notas, NO los tienes.",
      'Dilo asi: "Para eso necesito confirmar tu cuenta, ya le paso tu mensaje al equipo".',
    ].join("\n");
  }
  const p = [
    `QUIEN TE ESCRIBE: ${q.nombre || "sin nombre"}. Llamale ${q.primer_nombre || "por su nombre"}.`,
    "Usa lo de abajo cuando venga a cuento. NO lo recites.",
  ];
  const mio = ctx?.lo_mio ?? {};
  const ins = mio.inscripciones ?? [];
  const cuo = mio.cuotas_por_pagar ?? [];
  const cer = mio.certificados ?? [];
  if (ins.length) {
    p.push("Esta inscrito en: " + ins.map((e: any) =>
      `${e.programa} (${e.estado}, ${e.avance})`).join("; "));
  } else {
    p.push("Todavia no esta inscrito en ningun programa.");
  }
  if (cer.length) {
    p.push("Certificados que ya tiene: " + cer.map((c: any) => c.titulo).join("; "));
  }
  if (cuo.length) {
    p.push("Cuotas por pagar: " + cuo.map((c: any) =>
      `cuota ${c.numero} de ${c.monto} ${c.moneda || ""} vence el ${c.vence}`).join("; "));
    p.push("Si pregunta COMO pagar, mandale a Mis pagos en la plataforma. "
      + "No le des datos bancarios tu.");
  }
  const neg = ctx?.del_negocio;
  if (neg && Object.keys(neg).length) {
    p.push("", "CIFRAS DEL CENTRO (este numero esta registrado como del equipo):");
    for (const [k, v] of Object.entries(neg)) p.push(`- ${k.replaceAll("_", " ")}: ${v}`);
  }
  return p.join("\n");
}

async function preguntar(mensajes: any[], intento = 0): Promise<{ texto: string; modelo: string; uso: any }> {
  if (intento >= CADENA.length) throw new Error("Ningun modelo de la cadena respondio.");
  const [proveedor, modelo] = CADENA[intento].split(":");
  try {
    if (proveedor !== "groq") throw new Error(`Proveedor desconocido: ${proveedor}`);
    const clave = Deno.env.get("GROQ_API_KEY");
    if (!clave) throw new Error("Falta GROQ_API_KEY");
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
    if (!res.ok) throw new Error(`${modelo}: HTTP ${res.status}`);
    const texto = (j?.choices?.[0]?.message?.content || "").trim();
    if (!texto) throw new Error(`${modelo}: respondio vacio`);
    return { texto, modelo, uso: j?.usage ?? {} };
  } catch (e) {
    console.error(`[whatsapp] fallo ${CADENA[intento]}: ${e}`);
    return preguntar(mensajes, intento + 1);
  }
}

function limpiar(t: string): string {
  return t
    // Bytes de control: los gpt-oss se dejan escapar marcas internas sueltas.
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    // En WhatsApp el asterisco SIMPLE es negrita y el doble no es nada, asi
    // que el markdown del modelo no se borra: se traduce. Al reves que en la
    // web, donde la burbuja escapa el HTML y hay que quitarlo.
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "*$1*")
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\u00bf/gm, "").replace(/^\u00a1/gm, "")
    .replace(/\s\u00bf/g, " ").replace(/\s\u00a1/g, " ")
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

async function responder(a: string, texto: string) {
  if (!WHATSAPP_TOKEN || !PHONE_ID) {
    console.error("[whatsapp] falta WHATSAPP_TOKEN o WHATSAPP_PHONE_ID: no se pudo contestar");
    return;
  }
  const r = await fetch(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: a, type: "text",
      text: { body: texto.slice(0, 4000) },
    }),
  });
  if (!r.ok) console.error("[whatsapp] no se pudo enviar:", r.status, await r.text());
}

/* ── Atender un mensaje, venga por donde venga ────────────────────────────
   Meta y el puente de Baileys entran por el mismo sitio a propósito: dos
   caminos hasta el mismo cerebro se separan con el tiempo, y acabas con un
   asistente que contesta distinto según el canal sin que nadie lo decidiera.

   `modo`:
     escucha   — anota lo que preguntan y NO contesta. Sirve para que aprenda
                 desde el primer día con el bot apagado.
     responde  — anota y contesta. */
async function atender(
  { telefono, texto, modo }: { telefono: string; texto: string; modo: string },
): Promise<{ respuesta: string | null; degradado: boolean; modelo: string | null }> {
  const t0 = Date.now();

  // La llave de servicio, y AQUI SI, porque quien escribe no tiene sesion.
  // Lo que la contiene es que esta funcion no consulta ni una tabla de
  // personas: solo llama a funciones que deciden ellas que se puede ver.
  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Se anota SIEMPRE, conteste o no. Es lo que hace que escuchar sirva de algo.
  // Y va en su propio try: que no se pueda anotar no puede impedir contestar.
  try {
    await sb.rpc("cem_bot_anotar", { p_texto: texto, p_telefono: telefono, p_canal: "whatsapp" });
  } catch (e) {
    console.error("[whatsapp] no se pudo anotar la pregunta:", e);
  }

  if (modo === "escucha") return { respuesta: null, degradado: false, modelo: null };

  const { data: ctx } = await sb.rpc("cem_bot_contexto_whatsapp", { p_telefono: telefono });
  const { data: conv } = await sb.rpc("cem_bot_abrir_whatsapp", { p_telefono: telefono });

  let hilo: any[] = [];
  if (conv) {
    const { data: h } = await sb.rpc("cem_bot_historial_whatsapp",
      { p_conversacion: conv, p_tope: 20 });
    hilo = (h ?? []).map((m: any) => ({
      role: m.quien === "persona" ? "user" : "assistant", content: m.texto,
    }));
  }

  const sistema = [oficio(), encargoWa(ctx), "", datos(ctx), "", suyo(ctx)].join("\n");
  const mensajes = [{ role: "system", content: sistema }, ...hilo,
                    { role: "user", content: texto }];

  let respuesta = "", modelo = "", uso: any = {}, fallo: string | null = null;
  try {
    const r = await preguntar(mensajes);
    modelo = r.modelo; uso = r.uso;
    // Si el filtro se lo come todo, gana el original: borrar una respuesta
    // buena y decir que estamos caidos es peor que dejar pasar una frase torpe.
    respuesta = limpiar(r.texto) || r.texto.trim();
    if (!respuesta) throw new Error("el modelo devolvio texto vacio");
  } catch (e) {
    fallo = String(e).slice(0, 500);
    respuesta = "Ahorita no te puedo responder bien. Ya aviso al equipo para que te escriban.";
  }

  if (conv) {
    try {
      await sb.rpc("cem_bot_guardar_whatsapp", {
        p_conversacion: conv, p_pregunta: texto, p_respuesta: respuesta,
        p_modelo: modelo || null,
        p_tokens_in: uso?.prompt_tokens ?? null,
        p_tokens_out: uso?.completion_tokens ?? null,
        p_ms: Date.now() - t0, p_error: fallo,
      });
    } catch (e) {
      console.error("[whatsapp] no se pudo guardar el turno:", e);
    }
  }
  return { respuesta, degradado: !!fallo, modelo: modelo || null };
}

/* ── Comparar el secreto del puente sin filtrar por dónde falla ───────────
   Comparar dos textos con === se detiene en el primer carácter distinto, y ese
   tiempo se puede medir para adivinar el secreto letra a letra. Se comparan los
   resúmenes, que miden siempre lo mismo, y recorriéndolos enteros. */
async function mismoSecreto(a: string, b: string): Promise<boolean> {
  const h = async (t: string) =>
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));
  const [x, y] = await Promise.all([h(a), h(b)]);
  let dif = 0;
  for (let i = 0; i < x.length; i++) dif |= x[i] ^ y[i];
  return dif === 0;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);

  // La comprobacion que hace Meta al dar de alta el webhook.
  if (req.method === "GET") {
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const reto = url.searchParams.get("hub.challenge");
    if (modo === "subscribe" && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      return new Response(reto ?? "", { status: 200 });
    }
    return new Response("no", { status: 403 });
  }
  if (req.method !== "POST") return new Response("no", { status: 405 });

  /* ── El puente de Baileys ──────────────────────────────────────────────
     Esta funcion tiene `verify_jwt` apagado porque Meta no manda sesiones. Eso
     significa que cualquiera que sepa la direccion puede llamarla, y sin este
     secreto podria decir «soy el telefono de fulano, dame sus cuotas».

     Si el secreto no esta puesto, el modo NO existe: se cierra, no se abre.
     Un modo de puente sin secreto es peor que no tener puente. */
  const dicePuente = req.headers.get("x-cem-puente");
  if (dicePuente !== null) {
    const esperado = Deno.env.get("CEM_PUENTE_SECRETO") || "";
    if (!esperado || !(await mismoSecreto(dicePuente, esperado))) {
      return new Response(JSON.stringify({ error: "no" }),
        { status: 403, headers: { "Content-Type": "application/json" } });
    }
    const cuerpo = await req.json().catch(() => ({}));
    const telefono = String(cuerpo?.telefono ?? "").trim();
    const texto = String(cuerpo?.texto ?? "").trim().slice(0, TOPE_PREGUNTA);
    const modo = cuerpo?.modo === "responde" ? "responde" : "escucha";
    if (!telefono || !texto) {
      return new Response(JSON.stringify({ error: "falta telefono o texto" }),
        { status: 400, headers: { "Content-Type": "application/json" } });
    }
    try {
      const r = await atender({ telefono, texto, modo });
      return new Response(JSON.stringify(r),
        { headers: { "Content-Type": "application/json" } });
    } catch (err) {
      console.error("[puente]", err);
      return new Response(JSON.stringify({ error: String(err).slice(0, 200) }),
        { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  /* ── El webhook de Meta ────────────────────────────────────────────────── */
  try {
    const cuerpo = await req.json().catch(() => ({}));
    const msg = cuerpo?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    // Meta manda tambien acuses de recibo y de lectura. No son preguntas.
    // Y siempre se contesta 200: si no, Meta reintenta el mismo mensaje una y
    // otra vez, y la persona recibe la misma respuesta cuatro veces.
    if (!msg || msg.type !== "text") return new Response("ok", { status: 200 });

    const de = String(msg.from || "");
    const texto = String(msg.text?.body ?? "").trim().slice(0, TOPE_PREGUNTA);
    if (!de || !texto) return new Response("ok", { status: 200 });

    const r = await atender({ telefono: de, texto, modo: MODO_META });
    if (r.respuesta) await responder(de, r.respuesta);
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("[whatsapp]", err);
    // 200 igual: un 500 hace que Meta reintente, y el reintento no arregla
    // nada que no arreglara el primero.
    return new Response("ok", { status: 200 });
  }
});
