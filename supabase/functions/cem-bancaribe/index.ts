import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Proxy autenticado hacia las APIs de Bancaribe (Open Banking / API Manager).
//
// Por qué existe: el consumer_key/secret y los hashes por servicio NUNCA pueden
// salir al navegador (el repositorio de la plataforma es público). Esta función
// es el único punto donde viven: el cliente pide "la tasa del día" o "el saldo"
// y aquí adentro se resuelve la autenticación contra el banco.
//
// Acciones (POST { accion, ...params }):
//   estado       -> qué hay configurado (la ApiKey del webhook, sólo para admin)
//   diagnostico  -> prueba token + cada servicio y reporta qué responde cada uno
//   tasa-bcv     -> consulta tasas BCV (y las cachea en cem_tasas_bcv)
//   saldo        -> saldo disponible de la(s) cuenta(s)
//   operaciones  -> verifica un pago concreto (Consulta de Operaciones PLUS)
//   extracto     -> movimientos de la cuenta en un rango de fechas

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const JSON_HEADERS = { ...CORS_HEADERS, "Content-Type": "application/json" };

// Quien verifica pagos necesita consultar el banco — esa es su tarea — pero
// configurar la integración y ver la ApiKey del webhook es otra cosa, y queda
// reservado a administradores.
const ROLES_CONSULTA = ["cobranza", "coordinador", "admin", "superadmin"];
const ROLES_ADMIN = ["admin", "superadmin"];
const ACCIONES_DE_ADMIN = ["estado", "diagnostico"];

// El token del API Manager dura horas; pedir uno nuevo en cada llamada es
// innecesario y el banco lo penaliza. Se cachea en memoria del isolate.
let tokenCache: { token: string; expiraEn: number } | null = null;

async function obtenerToken(cfg: any, forzar = false): Promise<{ token: string; info: any }> {
  if (!forzar && tokenCache && Date.now() < tokenCache.expiraEn) {
    return { token: tokenCache.token, info: { origen: "caché" } };
  }

  const basic = btoa(`${cfg.consumer_key}:${cfg.consumer_secret}`);
  const res = await fetch(cfg.token_url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const texto = await res.text();
  let json: any = {};
  try { json = JSON.parse(texto); } catch { /* el banco a veces responde HTML en error */ }

  if (!res.ok || !json.access_token) {
    throw new Error(
      `No se pudo obtener el token del API Manager (HTTP ${res.status}). ` +
      `Respuesta: ${texto.slice(0, 300)}`,
    );
  }

  const duracionMs = Math.max((Number(json.expires_in) || 3600) - 60, 60) * 1000;
  tokenCache = { token: json.access_token, expiraEn: Date.now() + duracionMs };
  return {
    token: json.access_token,
    info: {
      origen: "nuevo",
      http: res.status,
      scope: json.scope,
      token_type: json.token_type,
      expires_in: json.expires_in,
    },
  };
}

async function llamarBanco(url: string, token: string, cuerpo: unknown, extraHeaders: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(cuerpo),
  });
  const texto = await res.text();
  let json: any = null;
  try { json = JSON.parse(texto); } catch { /* respuesta no-JSON */ }
  return { ok: res.ok, status: res.status, json, texto };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";

  try {
    const callerClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: perfilRows, error: perfilErr } = await callerClient.rpc("cem_my_profile");
    const perfil = Array.isArray(perfilRows) ? perfilRows[0] : perfilRows;

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const accion = body?.accion || "estado";
    const necesitaAdmin = ACCIONES_DE_ADMIN.includes(accion);
    const permitidos = necesitaAdmin ? ROLES_ADMIN : ROLES_CONSULTA;

    if (perfilErr || !perfil?.id || !perfil.activo || !permitidos.includes(perfil.rol)) {
      return new Response(
        JSON.stringify({
          error: necesitaAdmin
            ? "Configurar la integración bancaria está reservado a los administradores."
            : "No tienes permiso para consultar los servicios del banco.",
        }),
        { status: 403, headers: JSON_HEADERS },
      );
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: fila } = await adminClient
      .from("cem_integraciones").select("datos").eq("id", "bancaribe").maybeSingle();
    const cfg = fila?.datos;

    if (!cfg?.consumer_key) {
      return new Response(
        JSON.stringify({ error: "La integración con Bancaribe todavía no está configurada." }),
        { status: 400, headers: JSON_HEADERS },
      );
    }

    if (accion === "estado") {
      return new Response(JSON.stringify({
        configurado: true,
        ambiente: cfg.ambiente,
        rif: cfg.rif,
        cuenta: cfg.cuenta,
        servicios: Object.keys(cfg.endpoints || {}),
        webhook_url: `${SUPABASE_URL}/functions/v1/cem-bancaribe-notificacion`,
        webhook_api_key: cfg.notificacion_api_key,
        webhook_api_key_rotada_en: cfg.notificacion_api_key_rotada_en ?? null,
        webhook_clave_anterior_vence: cfg.notificacion_api_key_anterior_vence ?? null,
      }), { headers: JSON_HEADERS });
    }

    const hoy = new Date();
    const ddmmaaaa = (d: Date) =>
      `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
    const mmddaaaa = (d: Date) =>
      `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;

    // --- diagnóstico: separa "la credencial sirve" de "el API está habilitado" ---
    // Sirve para llegar a la sesión técnica con evidencia concreta de dónde se corta.
    if (accion === "diagnostico") {
      const resultado: any = { token: null, servicios: [] };
      let token = "";
      try {
        const t = await obtenerToken(cfg, true);
        token = t.token;
        resultado.token = { ok: true, ...t.info };
      } catch (e) {
        resultado.token = { ok: false, error: String(e) };
        return new Response(JSON.stringify(resultado), { headers: JSON_HEADERS });
      }

      const pruebas: Array<[string, string, any, Record<string, string>?]> = [
        ["Tasa BCV", cfg.endpoints.tasa_bcv,
          { hash: cfg.hashes.tasa_bcv, idTasa: "", ClienteRIF: cfg.rif, fechaInicio: "", fechaFin: "" }],
        ["Consulta de Saldo", cfg.endpoints.saldo,
          { Canal: "API", ClienteRIF: cfg.rif, clienteHash: cfg.hashes.saldo, requestIP: "10.100.0.01", numeroCuenta: cfg.cuenta }],
        ["Consulta Operaciones PLUS", cfg.endpoints.operaciones,
          { rif: cfg.rif, hash: cfg.hashes.operaciones, tipoTrx: "PM", numCuenta: cfg.cuenta, IO: "I" }],
        ["Extracto Bancario", cfg.endpoints.extracto,
          { hash: cfg.hashes.extracto, rif: cfg.rif, numeroCuenta: cfg.cuenta, fechaInicio: ddmmaaaa(new Date(hoy.getTime() - 7 * 864e5)), fechaFin: ddmmaaaa(hoy) },
          { "x-api-key": cfg.extracto_api_key }],
        ["Transferencia Inmediata (consulta)", cfg.endpoints.ti_consultar,
          { hash: cfg.hashes.ti, rif: cfg.rif }],
      ];

      for (const [nombre, url, cuerpo, extra] of pruebas) {
        try {
          const r = await llamarBanco(url, token, cuerpo, extra || {});
          resultado.servicios.push({
            servicio: nombre,
            url,
            http: r.status,
            codigo: r.json?.code ?? r.json?.codigoError ?? r.json?.ejecucion ?? null,
            mensaje: r.json?.message ?? r.json?.description ?? r.json?.descripcionError ?? (r.texto || "").slice(0, 200),
          });
        } catch (e) {
          resultado.servicios.push({ servicio: nombre, url, http: null, error: String(e).slice(0, 200) });
        }
      }
      return new Response(JSON.stringify(resultado), { headers: JSON_HEADERS });
    }

    const { token } = await obtenerToken(cfg);

    if (accion === "tasa-bcv") {
      const r = await llamarBanco(cfg.endpoints.tasa_bcv, token, {
        hash: cfg.hashes.tasa_bcv,
        idTasa: body.idTasa ?? "",
        ClienteRIF: cfg.rif,
        fechaInicio: body.fechaInicio ?? "",
        fechaFin: body.fechaFin ?? "",
      });

      const lista = r.json?.listTasasActuales || r.json?.listTasaHistorico || [];
      if (Array.isArray(lista) && lista.length) {
        const filas = lista
          .filter((t: any) => t?.valor != null)
          .map((t: any) => ({
            id_tasa: t.idTasa || t.descripcion || "TAVENTDOLAR",
            valor: Number(String(t.valor).replace(",", ".")),
            descripcion: t.descripcion ?? null,
            fecha: t.fechaArch ? String(t.fechaArch).slice(0, 10) : hoy.toISOString().slice(0, 10),
            actualizado_en: new Date().toISOString(),
          }))
          .filter((f: any) => Number.isFinite(f.valor));
        if (filas.length) {
          await adminClient.from("cem_tasas_bcv").upsert(filas, { onConflict: "id_tasa,fecha" });
        }
      }
      return new Response(JSON.stringify({ ok: r.ok, status: r.status, datos: r.json ?? r.texto }), { headers: JSON_HEADERS });
    }

    if (accion === "saldo") {
      const r = await llamarBanco(cfg.endpoints.saldo, token, {
        Canal: "API",
        ClienteRIF: cfg.rif,
        clienteHash: cfg.hashes.saldo,
        requestIP: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "10.100.0.01",
        numeroCuenta: body.numeroCuenta ?? cfg.cuenta ?? null,
      });
      return new Response(JSON.stringify({ ok: r.ok, status: r.status, datos: r.json ?? r.texto }), { headers: JSON_HEADERS });
    }

    if (accion === "operaciones") {
      const r = await llamarBanco(cfg.endpoints.operaciones, token, {
        rif: cfg.rif,
        hash: cfg.hashes.operaciones,
        identificadorPersona: body.documento ?? null,
        telefonoDebito: body.telefono ?? "",
        montoTransaccion: body.monto != null ? String(body.monto) : null,
        referencia: body.referencia ?? null,
        factura: body.factura ?? null,
        tipoTrx: body.tipoTrx ?? "PM",
        fecha: body.fecha ?? mmddaaaa(hoy),
        numCuenta: body.numCuenta ?? cfg.cuenta ?? null,
        IO: body.IO ?? "I",
      });

      // Queda constancia de quién consultó qué referencia: es la verificación
      // que respalda haber aprobado (o rechazado) un pago.
      await adminClient.from("cem_audit_events").insert({
        actor_id: perfil.id, actor_email: perfil.email,
        accion: "pago_verificado_contra_banco", entidad: "cem_payments", riesgo: "medio",
        detalle: { referencia: body.referencia ?? null, monto: body.monto ?? null, http: r.status },
      });

      return new Response(JSON.stringify({ ok: r.ok, status: r.status, datos: r.json ?? r.texto }), { headers: JSON_HEADERS });
    }

    if (accion === "extracto") {
      const desde = body.desde ?? ddmmaaaa(new Date(hoy.getTime() - 7 * 864e5));
      const hasta = body.hasta ?? ddmmaaaa(hoy);
      const r = await llamarBanco(
        cfg.endpoints.extracto,
        token,
        {
          hash: cfg.hashes.extracto,
          rif: cfg.rif,
          numeroCuenta: body.numeroCuenta ?? cfg.cuenta,
          fechaInicio: desde,
          fechaFin: hasta,
        },
        { "x-api-key": cfg.extracto_api_key },
      );
      return new Response(JSON.stringify({ ok: r.ok, status: r.status, datos: r.json ?? r.texto }), { headers: JSON_HEADERS });
    }

    return new Response(JSON.stringify({ error: `Acción no reconocida: ${accion}` }), { status: 400, headers: JSON_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: JSON_HEADERS });
  }
});
