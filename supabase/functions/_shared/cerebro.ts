// ═══════════════════════════════════════════════════════════════════════════
// El cerebro: uno solo para los dos asistentes
//
// Antes esto estaba copiado en cem-asistente y en cem-whatsapp. Dos copias del
// mismo cerebro divergen —siempre— y acabas con un asistente que contesta
// distinto según por dónde le escriban sin que nadie lo decidiera. Ya pasó a
// medias: el arreglo del filtro que se comía las respuestas buenas hubo que
// pegarlo dos veces.
// ═══════════════════════════════════════════════════════════════════════════

import type { Herramienta } from "./herramientas.ts";

/* Los modelos van en un secreto y no escritos aquí, y esto es la prueba de por
   qué: el 16 de agosto de 2026 Groq apagó `llama-3.3-70b-versatile` y
   `llama-3.1-8b-instant`, que eran los dos eslabones de esta cadena, y el
   asistente se quedó mudo sin que cambiara una línea de código.

   Cambiar `CEM_ASISTENTE_MODELOS` lo arregla sin volver a desplegar. Estos
   valores son sólo el punto de partida, y hay que darlos por caducados igual
   que caducaron los de antes. */
export const CADENA = (Deno.env.get("CEM_ASISTENTE_MODELOS") ||
  "groq:openai/gpt-oss-120b,groq:openai/gpt-oss-20b").split(",")
  .map((s) => s.trim()).filter(Boolean);

/* Cuánto esfuerzo de razonamiento pedir, si el modelo lo entiende.
   Un modelo que razona gasta el presupuesto razonando y devuelve contenido
   VACÍO sin lanzar error. Pero cada familia usa palabras distintas y mandar la
   de otra familia tumba la petición entera — que es exactamente cómo cayeron
   los dos eslabones a la vez la primera vez. Al que no razona, nada. */
export function esfuerzo(modelo: string): Record<string, string> {
  if (/gpt-oss/i.test(modelo)) return { reasoning_effort: "low" };
  if (/qwen/i.test(modelo)) return { reasoning_effort: "none" };
  return {};
}

export type Respuesta = {
  texto: string;
  llamadas: any[];      // las herramientas que el modelo quiere usar
  modelo: string;
  uso: any;
};

/* ── Una vuelta al modelo, con su cadena de respaldo ─────────────────────── */
export async function preguntar(
  mensajes: any[],
  opciones: { herramientas?: any[]; tope?: number } = {},
  intento = 0,
  porQue: string[] = [],
): Promise<Respuesta> {
  if (intento >= CADENA.length) {
    /* Nunca se acaba callando, y arrastra el motivo de CADA eslabón.
       La primera vez que esto falló de verdad, lo único que quedó guardado fue
       «Ningun modelo de la cadena respondio», que no distingue entre una clave
       que falta, una clave inválida y un modelo retirado — tres arreglos
       distintos. El sitio donde se mira la avería tiene que decir qué arreglar. */
    throw new Error("Ningun modelo respondio. " + porQue.join(" | "));
  }

  const [proveedor, modelo] = CADENA[intento].split(":");
  try {
    if (proveedor !== "groq") throw new Error(`Proveedor desconocido: ${proveedor}`);

    const clave = Deno.env.get("GROQ_API_KEY");
    if (!clave) {
      /* Se dicen los nombres de secretos PARECIDOS, nunca los valores.
         «Falta GROQ_API_KEY» a secas no distingue entre no haberla puesto y
         haberla puesto como GROQ_KEY, y son dos arreglos distintos que se
         tarda media hora en separar a ciegas. */
      const parecidos = Object.keys(Deno.env.toObject()).filter((k) => /GROQ|API_KEY/i.test(k));
      throw new Error("Falta el secreto GROQ_API_KEY."
        + (parecidos.length ? ` Hay estos parecidos: ${parecidos.join(", ")}.`
                            : " No hay ningun secreto con un nombre parecido."));
    }
    if (!clave.startsWith("gsk_")) {
      throw new Error("GROQ_API_KEY existe pero no parece una clave de Groq"
        + " (las de Groq empiezan por gsk_). Puede haberse pegado con espacios"
        + " o haberse copiado a medias.");
    }

    const cuerpo: Record<string, unknown> = {
      model: modelo,
      messages: mensajes,
      max_tokens: opciones.tope ?? 700,
      temperature: 0.6,
      ...esfuerzo(modelo),
    };
    if (opciones.herramientas?.length) {
      cuerpo.tools = opciones.herramientas;
      cuerpo.tool_choice = "auto";
    }

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${modelo}: HTTP ${res.status} ${JSON.stringify(j).slice(0, 200)}`);

    const m = j?.choices?.[0]?.message ?? {};
    const llamadas = m.tool_calls ?? [];
    const texto = (m.content || "").trim();

    /* Vacío es un fallo SÓLO si tampoco pidió herramientas. Cuando el modelo
       decide usar una, `content` viene vacío a propósito y eso es correcto:
       tratarlo como avería tumbaría la cadena entera justo cuando funciona. */
    if (!texto && !llamadas.length) throw new Error(`${modelo}: respondio vacio`);

    return { texto, llamadas, modelo, uso: j?.usage ?? {} };
  } catch (e) {
    console.error(`[cerebro] falló ${CADENA[intento]}: ${e}`);
    return preguntar(mensajes, opciones, intento + 1,
      [...porQue, `${CADENA[intento]}: ${String(e).replace(/^Error:\s*/, "")}`]);
  }
}

/* ── Ejecutar lo que el modelo pidió ─────────────────────────────────────── */

export type Ejecutada = { nombre: string; argumentos: any; resultado: any; error?: string };

/* Se ejecuta con el CLIENTE DE QUIEN PREGUNTA, y ahí está toda la seguridad:
   las funciones de datos son SECURITY INVOKER, así que la base aplica las
   mismas reglas de fila que si esa persona abriera la pantalla a mano.

   Ningún argumento del modelo se usa para decidir QUIÉN es nadie. Los que
   deciden identidad —la conversación que se escala, por ejemplo— los pone el
   servidor en `delServidor` y el modelo no los ve ni los puede escribir. */
export async function ejecutar(
  cliente: any,
  catalogo: Herramienta[],
  llamadas: any[],
  delServidor: Record<string, unknown>,
): Promise<Ejecutada[]> {
  const hechas: Ejecutada[] = [];

  for (const ll of llamadas.slice(0, 4)) {
    const nombre = ll?.function?.name ?? "";
    const h = catalogo.find((x) => x.nombre === nombre);

    /* Un nombre que no está en la carta no se llama. El modelo puede
       inventarse una herramienta que le vendría bien —lo hacen— y sin esto
       estaríamos pasando ese nombre a `rpc()` tal cual. */
    if (!h) {
      hechas.push({ nombre, argumentos: null, resultado: null,
                    error: "Esa herramienta no existe." });
      continue;
    }

    let args: any = {};
    try {
      args = JSON.parse(ll?.function?.arguments || "{}");
    } catch {
      hechas.push({ nombre, argumentos: null, resultado: null,
                    error: "No entendí los argumentos." });
      continue;
    }

    /* Sólo pasan los parámetros declarados. Si el modelo añade uno de su
       cosecha —`p_profile_id`, por ejemplo— se cae aquí y no llega a la base. */
    const limpios: Record<string, unknown> = {};
    for (const k of Object.keys(h.parametros)) {
      if (args[k] !== undefined && args[k] !== null && args[k] !== "") limpios[k] = args[k];
    }
    for (const k of h.delServidor ?? []) {
      if (delServidor[k] !== undefined) limpios[k] = delServidor[k];
    }

    try {
      const { data, error } = await cliente.rpc(h.rpc, limpios);
      if (error) {
        hechas.push({ nombre, argumentos: limpios, resultado: null,
                      error: error.message ?? String(error) });
      } else {
        hechas.push({ nombre, argumentos: limpios, resultado: data });

        /* Lo que escribe deja rastro. En UN solo sitio y no repartido por las
           veinte funciones: así una herramienta nueva lo hereda sin que nadie
           se acuerde de añadirlo. */
        if (h.escribe && h.entidad) {
          const id = h.idEnRespuesta ? data?.[h.idEnRespuesta] : null;
          try {
            await cliente.rpc("cem_bot_anotar_accion", {
              p_accion: h.nombre,
              p_entidad: h.entidad,
              p_entidad_id: id ?? null,
              p_riesgo: "medio",
              p_detalle: { argumentos: limpios, resultado: data },
            });
          } catch (e) {
            console.error("[cerebro] no se pudo anotar la acción:", e);
          }
        }
      }
    } catch (e) {
      hechas.push({ nombre, argumentos: limpios, resultado: null, error: String(e).slice(0, 200) });
    }
  }

  return hechas;
}

/* ── La conversación entera, con sus vueltas ─────────────────────────────── */
export async function conversar(opciones: {
  cliente: any;
  mensajes: any[];
  catalogo: Herramienta[];
  delServidor: Record<string, unknown>;
  tope?: number;
  vueltas?: number;
}): Promise<{ texto: string; modelo: string; uso: any; usadas: Ejecutada[] }> {
  const { cliente, catalogo, delServidor } = opciones;
  const mensajes = [...opciones.mensajes];
  const usadas: Ejecutada[] = [];
  const maxVueltas = opciones.vueltas ?? 3;

  const { comoLasPideElModelo } = await import("./herramientas.ts");
  const enFormato = catalogo.length ? comoLasPideElModelo(catalogo) : undefined;

  let modelo = "", uso: any = {};

  for (let vuelta = 0; vuelta < maxVueltas; vuelta++) {
    /* En la última vuelta se le quitan las herramientas. Si no, un modelo que
       se ha atascado pidiendo la misma llamada una y otra vez sale del bucle
       sin haber escrito nunca una respuesta, y la persona no ve nada. Sin
       herramientas está obligado a contestar con lo que ya tiene. */
    const ultima = vuelta === maxVueltas - 1;
    const r = await preguntar(mensajes, {
      herramientas: ultima ? undefined : enFormato,
      tope: opciones.tope,
    });
    modelo = r.modelo;
    uso = sumarUso(uso, r.uso);

    if (!r.llamadas.length) return { texto: r.texto, modelo, uso, usadas };

    mensajes.push({ role: "assistant", content: r.texto || null, tool_calls: r.llamadas });

    const hechas = await ejecutar(cliente, catalogo, r.llamadas, delServidor);
    usadas.push(...hechas);

    for (let i = 0; i < r.llamadas.length && i < hechas.length; i++) {
      const h = hechas[i];
      mensajes.push({
        role: "tool",
        tool_call_id: r.llamadas[i].id,
        /* El error se le devuelve al modelo tal cual en vez de tragárselo. Un
           «esa persona no está» tiene que llegarle para que lo diga; si se le
           oculta, se inventa que salió bien. */
        content: JSON.stringify(h.error ? { error: h.error } : (h.resultado ?? null)),
      });
    }
  }

  /* Se agotaron las vueltas sin respuesta. No puede pasar —la última vuelta va
     sin herramientas— pero si algún día pasa, que no se acabe en silencio. */
  return {
    texto: "", modelo, uso, usadas,
  };
}

function sumarUso(a: any, b: any) {
  return {
    prompt_tokens: (a?.prompt_tokens ?? 0) + (b?.prompt_tokens ?? 0),
    completion_tokens: (a?.completion_tokens ?? 0) + (b?.completion_tokens ?? 0),
  };
}

/* ── Limpiar lo que el prompt prohíbe ────────────────────────────────────── */
//
// «El prompt es una preferencia, el filtro de salida es la garantía». Todo lo
// que se prohíbe y se puede detectar por texto se limpia también en código.
export function limpiar(t: string, paraWhatsapp = false): string {
  let x = t
    /* Bytes de control. Los gpt-oss se dejan escapar de vez en cuando un byte
       suelto de sus marcas internas —se vio un  al final de la primera
       respuesta buena— y en la burbuja sale un cuadradito o nada. */
    // deno-lint-ignore no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

  /* El markdown se trata al revés en cada sitio: en WhatsApp el asterisco
     simple ES negrita, así que se traduce; en la web la burbuja escapa el HTML
     —hace bien— y hay que quitarlo o salen los asteriscos en crudo. */
  if (paraWhatsapp) {
    x = x.replace(/\*\*(.+?)\*\*/g, "*$1*").replace(/__(.+?)__/g, "*$1*");
  } else {
    x = x.replace(/\*\*(.+?)\*\*/g, "$1")
         .replace(/__(.+?)__/g, "$1")
         .replace(/(^|\s)\*(\S[^*]*?)\*(?=\s|[.,;:!?)]|$)/g, "$1$2");
  }

  return x
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^¿/gm, "").replace(/^¡/gm, "")
    .replace(/\s¿/g, " ").replace(/\s¡/g, " ")
    /* Las frases que delatan al modelo. La lista es CORTA a propósito.
       ─────────────────────────────────────────────────────────────────
       Antes incluía «no tengo acceso a», y eso borró de verdad una respuesta
       buena: a «ya pagué, me confirmas?» el asistente contestó «No tengo
       acceso a esa confirmación.», el filtro se la comió entera y la pantalla
       enseñó una avería que no existía. Decir que no se tiene acceso a algo es
       honesto y es justo lo que queremos que diga; lo que no queremos es que
       se presente como una IA. */
    .replace(/\b(como (una? )?(IA|inteligencia artificial|modelo de lenguaje)|soy una IA)\b[^.]*\.?/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
