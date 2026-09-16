import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// GET: devuelve si la app de Google ya está configurada en el servidor, su
// client_id (público, no es secreto) y si ya hay un canal conectado.
// POST { code }: intercambia el "code" que Google devuelve tras el
// consentimiento OAuth por un refresh_token, y lo guarda (junto al nombre
// del canal) en cem_integraciones. Sólo un administrador autenticado puede
// invocarla; el client_secret y el refresh_token nunca salen de este
// entorno de servidor.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

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
    if (profileErr || !profile?.id || !["admin", "superadmin"].includes(profile.rol)) {
      return new Response(JSON.stringify({ error: "Sólo un administrador puede gestionar esta integración." }), {
        status: 403,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (req.method === "GET") {
      const [{ data: appRow }, { data: ytRow }] = await Promise.all([
        adminClient.from("cem_integraciones").select("datos").eq("id", "youtube_oauth_app").maybeSingle(),
        adminClient.from("cem_integraciones").select("datos").eq("id", "youtube").maybeSingle(),
      ]);
      const { client_id, redirect_uri } = appRow?.datos || {};
      return new Response(JSON.stringify({
        configured: !!(appRow?.datos?.client_id && appRow?.datos?.client_secret),
        client_id: client_id || null,
        redirect_uri: redirect_uri || null,
        connected: !!ytRow?.datos?.refresh_token,
        channel_title: ytRow?.datos?.channel_title || null,
        conectado_por: ytRow?.datos?.conectado_por || null,
        conectado_en: ytRow?.datos?.conectado_en || null,
      }), { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({}));
    const code = body?.code;
    if (!code) {
      return new Response(JSON.stringify({ error: "Falta el código de autorización." }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { data: appRow } = await adminClient.from("cem_integraciones").select("datos").eq("id", "youtube_oauth_app").maybeSingle();
    const { client_id, client_secret, redirect_uri } = appRow?.datos || {};
    if (!client_id || !client_secret || !redirect_uri) {
      return new Response(JSON.stringify({ error: "La app de Google todavía no está configurada en el servidor." }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code, client_id, client_secret, redirect_uri, grant_type: "authorization_code" }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.refresh_token) {
      return new Response(JSON.stringify({
        error: tokenJson.error_description || tokenJson.error ||
          "Google no devolvió un refresh_token. Revoca el acceso previo en https://myaccount.google.com/permissions y vuelve a intentar.",
      }), { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } });
    }

    let channelTitle: string | null = null;
    try {
      const chRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
      const chJson = await chRes.json();
      channelTitle = chJson?.items?.[0]?.snippet?.title || null;
    } catch { /* no bloquea la conexión si falla sólo esta consulta informativa */ }

    await adminClient.from("cem_integraciones").upsert({
      id: "youtube",
      datos: {
        refresh_token: tokenJson.refresh_token,
        channel_title: channelTitle,
        conectado_por: profile.email,
        conectado_en: new Date().toISOString(),
      },
      actualizado_en: new Date().toISOString(),
    });

    return new Response(JSON.stringify({ ok: true, channel_title: channelTitle }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
