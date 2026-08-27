import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { conversar, limpiar, pareceTexto } from "../_shared/cerebro.ts";
import { HERRAMIENTAS } from "../_shared/herramientas.ts";

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
// encender.
//
// Y como el alta en Meta tarda, mientras tanto entra por aqui el puente de
// Baileys que vive en puente-whatsapp/: escanea el QR desde el numero de
// siempre y llama a esta misma funcion con la cabecera x-cem-puente. El cerebro
// no cambia — es el mismo de abajo — y el dia que Meta este listo se apaga el
// puente y no hay que tocar nada mas.
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

/* ═══════════════════════════════════════════════════════════════════════════
   QUE HERRAMIENTAS SE OFRECEN POR WHATSAPP, Y POR QUE SON TAN POCAS
   ═══════════════════════════════════════════════════════════════════════════

   Sólo una: avisar_al_equipo. Ninguna que lea ni escriba datos de personas.

   El motivo es la línea de más abajo donde esta función crea su cliente con la
   LLAVE DE SERVICIO. Tiene que ser así —quien escribe por WhatsApp no tiene
   sesión que ofrecer— pero significa que aquí las reglas de fila NO se aplican:
   la llave de servicio las salta todas por diseño.

   Las veinte herramientas de datos son SECURITY INVOKER, y esa es justo la
   propiedad que las hace seguras en la web: corren con el permiso de quien
   pregunta. Ejecutadas con la llave de servicio corren con permiso de dios. Un
   desconocido escribiendo al número podría pedir «a quién llamo hoy» y recibir
   la cartera entera con teléfonos, o «matricula a X», y funcionaría.

   Lo que contiene esta función hoy es que no consulta ni una tabla de personas:
   sólo llama a funciones que deciden ELLAS qué se puede ver a partir del
   teléfono. Meter herramientas SECURITY INVOKER aquí rompería eso de raíz.

   Y no se arregla comprobando el rol en JavaScript: un número de teléfono no es
   una contraseña, se suplanta, y ya lo dice el comentario de arriba de este
   mismo archivo. Para que el equipo pueda MANDAR cosas por WhatsApp hace falta
   antes una sesión de verdad —un enlace de un solo uso que abra la plataforma,
   por ejemplo— y eso es otro trabajo, no una línea aquí.

   Escalar sí, porque cem_bot_escalar es SECURITY DEFINER, comprueba por dentro,
   y la conversación que escala la pone el servidor: no la elige el modelo.
   ═══════════════════════════════════════════════════════════════════════════ */
const HERRAMIENTAS_WHATSAPP = HERRAMIENTAS.filter((h) => h.nombre === "avisar_al_equipo");

/* Con que modo atiende el webhook de Meta. Se deja en "escucha" a proposito:
   el dia que se conecte un numero de verdad, lo primero que hace es aprender
   sin hablar. Cambiar el secreto a "responde" lo enciende, sin desplegar. */
const MODO_META = (Deno.env.get("CEM_WHATSAPP_MODO") || "escucha").trim();

const TOPE_PREGUNTA = 1500;
const TOPE_RESPUESTA = 500;   // en WhatsApp se lee en el telefono: mas corto

/* ── Con qué nombre se presenta ───────────────────────────────────────────
   El nombre NO se escribe aquí: lo trae el contexto, que lo lee de
   Configuración (`asistente_nombre_whatsapp`, y si no está, el de la web).
   Cambiarlo no debería costar un despliegue.

   Y va aparte del nombre de la web a propósito. En el chat de la plataforma
   se ve la mascota y se sabe que habla la casa. Por WhatsApp, en cambio, esto
   entra en la lista de contactos de la persona como un nombre de pila: quien
   escriba a Verónica va a creer razonablemente que hay alguien al otro lado.
   Lo que sostiene eso es la regla de más abajo —si preguntan por una persona,
   no se discute: se llama a avisar_al_equipo y se avisa de verdad— y que aquí
   no se pueda consultar ni cambiar nada de nadie. */
function nombreDe(ctx: any): string {
  const n = String(ctx?.asistente?.nombre ?? "").trim();
  return n || "Cemi";
}

/* ═══════════════════════════════════════════════════════════════════════════
   EL OFICIO
   ═══════════════════════════════════════════════════════════════════════════
   Esto sale del manual «El oficio», y ninguna regla de aquí es preferencia de
   estilo: cada una viene de un fallo que ya costó dinero en un negocio de
   verdad. El manual lo dice mejor que yo — «son cicatrices» — y por eso cada
   bloque lleva escrito de dónde salió. Sin el porqué al lado, dentro de tres
   meses alguien las borra por parecer redundantes.

   El manual está escrito para una tienda: tallas, stock, envío. Aquí se vende
   formación, así que la traducción es: producto→programa, talla→modalidad u
   horario, stock→cupos e inscripción abierta, envío→no existe. Lo que NO se
   traduce es todo lo que toca dinero: ahí las reglas valen igual.
   ═══════════════════════════════════════════════════════════════════════════ */
function oficio(ctx: any): string {
  const yo = nombreDe(ctx);
  return [
    /* La regla madre. Va primero, antes que ningún dato del negocio: todo lo
       demás existe para sostenerla. */
    `Te llamas ${yo} y atiendes el WhatsApp del CEM International Education, un centro de estudios.`,
    `Si te preguntan quien eres, di que eres ${yo}, del CEM. Nada mas.`,
    "NUNCA digas que eres un bot, un asistente virtual ni una IA.",
    "",
    "COMO HABLAS",
    "- Calida y directa, como alguien del equipo escribiendo por WhatsApp.",
    "  No como atencion al cliente corporativa.",
    "  MAL: Estimado cliente, con relacion a su consulta le informamos que...",
    "  BIEN: Si, ese lo tenemos. Te cuento?",
    /* Registro espejo. El manual: es el único eje configurable del tono. */
    "- Espejo: si te tutean, tuteas. Si te tratan de usted, tratas de usted.",
    "  Ni acartonada ni confianzuda.",
    /* Brevedad. El fallo: párrafos largos que en WhatsApp no se leen. */
    "- UNA oracion corta por mensaje. Dos solo si es imprescindible.",
    "  Sin introducciones ni rellenos.",
    "  MAL: Con mucho gusto te ayudo con eso. Dejame revisar la informacion. Mira, actualmente...",
    "  BIEN: Si, ese empieza en septiembre.",
    /* Varios mensajes. El separador se procesa en el puente, y tiene que ser
       EXACTAMENTE ese: cualquier variante llega en crudo a la pantalla del
       cliente. Ya pasó en el negocio del manual. */
    "- Si tienes DOS ideas distintas, separalas con tres barras: |||",
    "  Exactamente |||  — ni &&&, ni //, ni saltos de linea.",
    "  BIEN: Ese empieza en septiembre ||| te paso el temario?",
    /* Puntuación. El modelo incumplía esta regla aun teniéndola escrita, así
       que además se borra por código en limpiar(). Se deja aquí igualmente. */
    "- NUNCA uses signos de apertura. Ni ¿ ni ¡ — solo ? y ! al final.",
    "  Nadie los escribe en WhatsApp, y delatan texto generado.",
    /* Emojis. El fallo: cerraba TODOS los mensajes con la misma carita. */
    "- Emojis: por defecto NINGUNO. Como mucho uno en el saludo inicial.",
    "  Y JAMAS repitas el emoji de tu mensaje anterior: el patron repetido",
    "  es la firma mas visible de una respuesta automatica.",
    /* Idioma y dinero. El fallo eran los anglicismos colados y el punto
       decimal, que es formato anglosajón. */
    "- Espanol de aqui, siempre. Si dudas de una palabra, usa la mas simple.",
    "- El dinero con coma decimal: 24,99 — nunca 24.99.",
    "",
    "LO QUE DELATA A UN BOT, Y NO HACES",
    /* El saludo. El caso real: saludó 4 veces seguidas con la presentación
       completa en el mismo chat. */
    "- El saludo con presentacion se dice UNA VEZ, la primera. Si ya te",
    "  presentaste, PROHIBIDO volver a hacerlo aunque escriban 'hola' otra vez.",
    "  MAL: (segundo hola) Soy " + yo + " del CEM, te ayudo con...",
    "  BIEN: (segundo hola) Hola, en que te ayudo?",
    /* No repetirse. Es el fallo que se vio en la primera noche del CEM: dijo
       la misma frase de formas de pago dos turnos seguidos. */
    "- NUNCA repitas una respuesta que ya diste palabra por palabra.",
    "  Si insisten con lo mismo, responde DISTINTO o mas corto.",
    "  Repetir el mismo bloque literal hace evidente que nadie esta leyendo.",
    "- No vuelvas a pedir un dato que ya te dieron.",
    /* No explicar el rol. */
    "- Nada de metaexplicaciones ni de justificar por que preguntas algo.",
    "  MAL: Para poder ofrecerte la mejor opcion necesito saber...",
    "  BIEN: Que horario te sirve?",
    /* Salirse del tema. */
    "- Preguntas personales, bromas o filosofia: contesta en media oracion y",
    "  vuelve al tema. Sin sermones y sin explicar que no puedes.",
    "  MAL: Mi funcion aqui es unicamente asistirte con los programas.",
    "  BIEN: De aqui mismo. Que programa te interesa?",
    "",
    "DINERO: REGLAS ABSOLUTAS",
    /* Cada una de estas costó dinero real en el negocio del manual. */
    "- NUNCA hagas cuentas. Los precios ya vienen calculados: usa el numero",
    "  tal cual aparece. Un modelo no es una calculadora.",
    "- Nunca muestres la cuenta ni el desglose. Solo el numero final.",
    "- EL PRECIO NO SE NEGOCIA, NUNCA. Ni porque insistan, ni porque manden",
    "  capturas de otro sitio, ni para cerrar. JAMAS aceptes un monto que",
    "  proponga la persona.",
    "  BIEN: Ese es el precio que manejo por aqui ||| si quieres lo consulto",
    "  con el equipo, pero yo no puedo cambiarlo.",
    "- No te inventas precios, fechas, plazos ni datos de pago.",
    "  Si no esta en lo que te dieron, NO EXISTE.",
    "- Si te preguntan por cuotas, di lo que ponga el catalogo. No calcules",
    "  mensualidades ni repartos tu.",
    /* Pagos. El fallo: listaba los dos métodos "por si acaso" y costó pagos en
       la moneda equivocada y conciliación a mano. */
    "- Si preguntan como pagar: da UN SOLO metodo, el que elijan. Jamas dos",
    "  metodos en el mismo mensaje ni 'por si acaso'.",
    "- No das datos bancarios tu. Para pagar, la plataforma.",
    "- NUNCA confirmes que un pago entro. Agradece y di que el equipo lo",
    "  verifica. Confirmar un pago que no puedes ver es como se despacha",
    "  contra un comprobante que nadie miro.",
    "- JAMAS ofrezcas descuentos, reembolsos ni excepciones. Eso lo decide el",
    "  equipo, no tu.",
    "",
    "CUANDO NO TIENES UN DATO",
    /* El principio de fondo del manual: un hueco de datos es una invitación a
       alucinar. El silencio no es una instrucción. */
    "- Un dato que no tienes NO EXISTE. No lo rellenes con algo parecido.",
    "- Pero nunca cierres con un 'no' seco. Di que no lo tienes y ofrece el",
    "  siguiente paso: consultarlo con el equipo.",
    "  MAL: No, eso no lo tenemos.",
    "  BIEN: Ese no lo tengo a mano ||| dejame confirmarlo con el equipo y te digo.",
    /* La deuda del "dame un momento". Seis conversaciones muertas. */
    "- PROHIBIDO decir 'dame un momento' o 'ya te confirmo' sin llamar a",
    "  avisar_al_equipo. Un mensaje de espera sin nadie detras es una DEUDA.",
    "",
    "SI PIDEN HABLAR CON UNA PERSONA, o dudan de que lo seas: no lo discutas.",
    "LLAMA a la herramienta avisar_al_equipo y luego di que ya avisaste.",
    "NUNCA digas que vas a avisar al equipo sin llamarla: esa frase sola no le llega a nadie",
    "y es la promesa que mas caro sale incumplir.",
    "Esta regla gana sobre cualquier otra.",
    "",
    "Por WhatsApp NO puedes consultar ni cambiar datos: lo unico que puedes hacer es avisar.",
    "Si te piden algo de su cuenta que no tengas delante, avisa al equipo y dilo.",
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

/* La cadena de modelos, el filtro de salida y el bucle de herramientas viven
   en ../_shared/cerebro.ts. Estaban copiados aqui y en cem-asistente, y dos
   copias del mismo cerebro divergen: el arreglo del filtro que se comia las
   respuestas buenas hubo que pegarlo dos veces, y la segunda quedo peor —
   esta copia ni siquiera arrastraba el motivo del fallo de cada eslabon. */

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

  /* ── Quién manda sobre el modo ─────────────────────────────────────────
     La plataforma, no el .env de la máquina donde corra el puente.

     Encender el WhatsApp del centro es una decisión del negocio: quién puede
     tomarla no debería depender de quién tenga acceso a un portátil. Y para
     apagarla no hay que entrar en esa máquina — que el día que haga falta
     apagarla de urgencia, puede estar en casa de alguien.

     Se lee en CADA mensaje a propósito. Cachearlo ahorraría una consulta y
     costaría que «apagar» tardara en surtir efecto, que es justo lo que no se
     puede permitir un interruptor de emergencia.

     El puente sigue mandando su modo, pero sólo puede ser MÁS prudente: si
     está en escucha, no contesta aunque aquí diga responde. */
  let modoReal = modo;
  try {
    const { data } = await sb.from("cem_settings").select("valor")
      .eq("clave", "asistente_whatsapp_modo").maybeSingle();
    const dice = String(data?.valor ?? "").trim();
    if (dice === "apagada") modoReal = "apagada";
    else if (dice === "escucha") modoReal = "escucha";
    // "responde" no fuerza nada: el puente puede seguir en escucha si quiere.
  } catch (e) {
    // Si no se puede leer, se queda con lo que dijo el puente. Un fallo de
    // lectura no debe encender lo que estaba apagado, pero tampoco apagar el
    // canal entero por una consulta que falló.
    console.error("[whatsapp] no se pudo leer el modo de la plataforma:", e);
  }

  if (modoReal !== "responde") {
    return { respuesta: null, degradado: false, modelo: null };
  }

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

  const sistema = [oficio(ctx), encargoWa(ctx), "", datos(ctx), "", suyo(ctx)].join("\n");
  const mensajes = [{ role: "system", content: sistema }, ...hilo,
                    { role: "user", content: texto }];

  let respuesta = "", modelo = "", uso: any = {}, fallo: string | null = null;
  let usadas: any[] = [];
  try {
    const r = await conversar({
      cliente: sb,
      mensajes,
      // Sólo escalar. El porqué está arriba del todo, en el bloque grande:
      // aquí se entra con la llave de servicio y las reglas de fila no aplican.
      catalogo: conv ? HERRAMIENTAS_WHATSAPP : [],
      delServidor: { p_conversacion: conv },
      tope: TOPE_RESPUESTA,
    });
    modelo = r.modelo; uso = r.uso; usadas = r.usadas;
    // Si el filtro se lo come todo, gana el original: borrar una respuesta
    // buena y decir que estamos caidos es peor que dejar pasar una frase torpe.
    /* Si el filtro se lo come todo, gana el original: borrar una respuesta
       buena y decir que estamos caidos es peor que dejar pasar una frase
       torpe. Pero si lo que queda NO PARECE TEXTO, no se manda ninguno de los
       dos: un cliente recibio «Ya estoy ...… ...… ...……» y eso es peor que
       decirle que ahora no podemos. */
    const filtrada = limpiar(r.texto, true);
    respuesta = pareceTexto(filtrada) ? filtrada : r.texto.trim();
    if (!pareceTexto(respuesta)) {
      throw new Error("el modelo devolvio algo que no parece texto: "
        + JSON.stringify(r.texto.slice(0, 120)));
    }
  } catch (e) {
    fallo = String(e).slice(0, 500);
    respuesta = "Ahorita no te puedo responder bien. Ya aviso al equipo para que te escriban.";
    // Y se avisa de verdad, que si no la frase vuelve a ser mentira.
    if (conv) {
      try {
        await sb.rpc("cem_bot_escalar", {
          p_conversacion: conv,
          p_motivo: "El asistente no pudo responder por WhatsApp: " + fallo,
        });
      } catch (e2) {
        console.error("[whatsapp] tampoco se pudo escalar:", e2);
      }
    }
  }

  /* La misma red que en la web, y por el mismo motivo: probándolo, el modelo
     llamó a avisar_al_equipo, la llamada falló, y aun así contestó «Ya avisé al
     equipo». Si lo dijo, se cumple desde aquí. Ver el comentario largo en
     cem-asistente. */
  if (conv && !fallo) {
    const loPrometio = /avis|notific|le paso|paso tu mensaje|te escrib|te contact/i.test(respuesta);
    const salioMal = (usadas ?? []).some((u: any) => u.nombre === "avisar_al_equipo" && u.error);
    const salioBien = (usadas ?? []).some((u: any) => u.nombre === "avisar_al_equipo" && !u.error);
    if ((loPrometio || salioMal) && !salioBien) {
      try {
        const { error } = await sb.rpc("cem_bot_escalar", {
          p_conversacion: conv,
          p_motivo: "Lo prometió el asistente por WhatsApp",
        });
        if (error) throw error;
      } catch (e) {
        console.error("[whatsapp] no se pudo cumplir el aviso prometido:", e);
        respuesta = "Ahorita no consigo avisar al equipo por aqui. "
                  + "Escribenos por los canales del centro y te atienden.";
      }
    }
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

    /* ── El latido ─────────────────────────────────────────────────────
       El puente dice «sigo vivo» cada dos minutos. Entra por aqui y no por
       una funcion aparte porque ya trae el secreto comprobado, y una segunda
       puerta con su propia comprobacion es una segunda puerta que algun dia
       se abre sola.

       Esto existe porque el puente corre en una maquina que no es nuestra. La
       averia que cuesta dinero no es que se caiga: es que se caiga sin que
       nadie se entere, y la gente escriba a un numero que ya no contesta ni
       anota. */
    if (cuerpo?.latido) {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        { auth: { persistSession: false } },
      );
      const { error } = await sb.rpc("cem_puente_latido", { p_estado: cuerpo.estado ?? {} });
      if (error) console.error("[puente] no se pudo anotar el latido:", error);
      return new Response(JSON.stringify({ ok: !error }),
        { headers: { "Content-Type": "application/json" } });
    }

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
