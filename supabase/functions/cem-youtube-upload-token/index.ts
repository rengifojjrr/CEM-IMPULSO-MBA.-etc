import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Cambia el refresh_token guardado (nunca visible para el cliente) por un
// access_token de corta duración con permiso de subida a YouTube, para que
// el navegador pueda subir el archivo directamente a Google (sin pasar los
// bytes del video por este servidor). Cualquier creador de contenido puede
// invocarla; sólo un administrador puede haber conectado la cuenta.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const ROLES_CONTENIDO = ["coordinador", "admin", "superadmin", "profesor"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";

  try {
    const callerClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: profileRows, error: profileErr } = await callerClient.rpc("cem_my_profile");
    const profile = Array.isArray(profileRows) ? profileRows[0] : profileRows;
    if (profileErr || !profile?.id || !ROLES_CONTENIDO.includes(profile.rol)) {
      return new Response(JSON.stringify({ error: "no_autorizado" }), {
        status: 403,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const [{ data: appRow }, { data: ytRow }] = await Promise.all([
      adminClient.from("cem_integraciones").select("datos").eq("id", "youtube_oauth_app").maybeSingle(),
      adminClient.from("cem_integraciones").select("datos").eq("id", "youtube").maybeSingle(),
    ]);
    const { client_id, client_secret } = appRow?.datos || {};
    const refresh_token = ytRow?.datos?.refresh_token;
    if (!refresh_token || !client_id || !client_secret) {
      return new Response(JSON.stringify({ error: "not_connected" }), {
        status: 409,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id, client_secret, refresh_token, grant_type: "refresh_token" }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) {
      return new Response(JSON.stringify({ error: "reauth_required", detail: tokenJson.error_description || tokenJson.error }), {
        status: 409,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      access_token: tokenJson.access_token,
      expires_in: tokenJson.expires_in,
      channel_title: ytRow?.datos?.channel_title || null,
    }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
