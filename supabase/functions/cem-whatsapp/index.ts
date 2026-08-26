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
  "groq:llama-3.3-70b-versatile,groq:llama-3.1-8b-instant").split(",")
  .map((s) => s.trim()).filter(Boolean);

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
        // Solo donde existe: es un parametro de los modelos que razonan.
        // Mandarselo a un llama es mandar un campo inexistente y la API
        // rechaza la peticion entera, en los dos eslabones a la vez.
        ...(/gpt-oss|qwen/i.test(modelo) ? { reasoning_effort: "low" } : {}),
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
    .replace(/^¿/gm, "").replace(/^¡/gm, "")
    .replace(/\s¿/g, " ").replace(/\s¡/g, " ")
    .replace(/\b(como (una? )?(IA|inteligencia artificial|modelo de lenguaje)|soy una IA|no tengo acceso a)\b[^.]*\.?/gi, "")
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

  const t0 = Date.now();
  let de = "";
  try {
    const cuerpo = await req.json().catch(() => ({}));
    const valor = cuerpo?.entry?.[0]?.changes?.[0]?.value;
    const msg = valor?.messages?.[0];

    // Meta manda tambien acuses de recibo y de lectura. No son preguntas.
    // Y siempre se contesta 200: si no, Meta reintenta el mismo mensaje una y
    // otra vez, y la persona recibe la misma respuesta cuatro veces.
    if (!msg || msg.type !== "text") return new Response("ok", { status: 200 });

    de = String(msg.from || "");
    const pregunta = String(msg.text?.body ?? "").trim().slice(0, TOPE_PREGUNTA);
    if (!de || !pregunta) return new Response("ok", { status: 200 });

    // La llave de servicio, y AQUI SI, porque quien escribe no tiene sesion.
    // Lo que la contiene es que esta funcion no consulta ni una tabla de
    // personas: solo llama a funciones que deciden ellas que se puede ver.
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: ctx } = await sb.rpc("cem_bot_contexto_whatsapp", { p_telefono: de });
    const { data: conv } = await sb.rpc("cem_bot_abrir_whatsapp", { p_telefono: de });

    let hilo: any[] = [];
    if (conv) {
      const { data: h } = await sb.rpc("cem_bot_historial_whatsapp",
        { p_conversacion: conv, p_tope: 20 });
      hilo = (h ?? []).map((m: any) => ({
        role: m.quien === "persona" ? "user" : "assistant", content: m.texto,
      }));
    }

    const sistema = [oficio(), "", datos(ctx), "", suyo(ctx)].join("\n");
    const mensajes = [{ role: "system", content: sistema }, ...hilo,
                      { role: "user", content: pregunta }];

    let texto = "", modelo = "", uso: any = {}, fallo: string | null = null;
    try {
      const r = await preguntar(mensajes);
      texto = limpiar(r.texto); modelo = r.modelo; uso = r.uso;
      if (!texto) throw new Error("quedo vacio tras limpiar");
    } catch (e) {
      fallo = String(e).slice(0, 300);
      texto = "Ahorita no te puedo responder bien. Ya aviso al equipo para que te escriban.";
    }

    await responder(de, texto);

    if (conv) {
      try {
        await sb.rpc("cem_bot_guardar_whatsapp", {
          p_conversacion: conv, p_pregunta: pregunta, p_respuesta: texto,
          p_modelo: modelo || null,
          p_tokens_in: uso?.prompt_tokens ?? null,
          p_tokens_out: uso?.completion_tokens ?? null,
          p_ms: Date.now() - t0, p_error: fallo,
        });
      } catch (e) {
        console.error("[whatsapp] no se pudo guardar el turno:", e);
      }
    }
    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error("[whatsapp]", err);
    // 200 igual: un 500 hace que Meta reintente, y el reintento no arregla
    // nada que no arreglara el primero.
    return new Response("ok", { status: 200 });
  }
});
