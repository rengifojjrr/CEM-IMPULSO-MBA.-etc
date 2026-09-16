import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Herramienta de diagnóstico temporal: prueba cada combinación de host emisor
// del token contra un servicio, para aislar si el 900908 viene de que el token
// se pide en un gateway distinto al que expone las APIs.
// No forma parte del flujo normal de la plataforma.

const JSON_HEADERS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

Deno.serve(async (req: Request) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data: rows } = await caller.rpc("cem_my_profile");
  const perfil = Array.isArray(rows) ? rows[0] : rows;
  if (!perfil?.id || !["admin", "superadmin"].includes(perfil.rol)) {
    return new Response(JSON.stringify({ error: "solo admin" }), { status: 403, headers: JSON_HEADERS });
  }

  const { data: fila } = await admin.from("cem_integraciones").select("datos").eq("id", "bancaribe").maybeSingle();
  const cfg = fila!.datos;
  const basic = btoa(`${cfg.consumer_key}:${cfg.consumer_secret}`);
  const resultados: any[] = [];

  for (const tokenUrl of cfg.token_urls_alternativas as string[]) {
    const fila: any = { token_url: tokenUrl };
    try {
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
      const texto = await res.text();
      let j: any = {};
      try { j = JSON.parse(texto); } catch { /* puede venir HTML */ }
      fila.token_http = res.status;
      fila.token_ok = !!j.access_token;
      fila.scope = j.scope ?? null;
      if (!j.access_token) {
        fila.token_error = texto.slice(0, 160);
        resultados.push(fila);
        continue;
      }
      // Con ese token, probamos Tasa BCV (el servicio más simple).
      const r2 = await fetch(cfg.endpoints.tasa_bcv, {
        method: "POST",
        headers: { Authorization: `Bearer ${j.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ hash: cfg.hashes.tasa_bcv, idTasa: "", ClienteRIF: cfg.rif, fechaInicio: "", fechaFin: "" }),
      });
      const t2 = await r2.text();
      let j2: any = null;
      try { j2 = JSON.parse(t2); } catch { /* ignore */ }
      fila.tasa_http = r2.status;
      fila.tasa_codigo = j2?.code ?? j2?.codigoError ?? null;
      fila.tasa_mensaje = (j2?.message ?? j2?.description ?? t2 ?? "").toString().slice(0, 160);
    } catch (e) {
      fila.error = String(e).slice(0, 160);
    }
    resultados.push(fila);
  }

  return new Response(JSON.stringify({ resultados }, null, 2), { headers: JSON_HEADERS });
});
