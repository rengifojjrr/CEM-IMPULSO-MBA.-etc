import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Endpoint que BANCARIBE llama cuando entra un pago a la cuenta de CEM
// (Servicio de Notificación de Transacciones).
//
// Es público a propósito: el banco no maneja JWT de Supabase. La autenticación
// es la que el banco define en su especificación: una ApiKey fija en el header
//   Authorization: ApiKey <clave>
// que nosotros le entregamos a ellos durante la afiliación.
//
// Además de registrar la notificación, intenta conciliarla sola contra las
// cuotas pendientes: si el monto y la cédula del pagador cuadran con una única
// cuota por cobrar, la marca pagada. Si hay ambigüedad, la deja pendiente para
// que una persona decida (nunca adivina).

const JSON_HEADERS = { "Content-Type": "application/json" };

// Freno de intentos: el endpoint es público y con la clave equivocada
// responde 401, pero sin esto nada impedía probar claves en volumen.
//
// Se cuenta en dos niveles a propósito. Limitar sólo por IP se esquiva
// repartiendo los intentos entre muchas direcciones — lo comprobé: el
// tráfico de una sola prueba salió por seis IPs distintas y ninguna llegó
// al tope. Por eso, además del freno por origen, hay un contador global de
// intentos FALLIDOS: el banco acierta la clave siempre, así que ese contador
// sólo sube cuando alguien está probando a ver si pega.
const TOPE_POR_MINUTO = 60;      // el banco no manda ni de cerca tantas
const VENTANA_SEG = 60;
const CASTIGO_SEG = 900;         // 15 minutos de bloqueo al pasarse

const TOPE_FALLOS_GLOBAL = 10;   // fallos de clave por minuto, sumando todos los orígenes
const CASTIGO_FALLOS_SEG = 1800; // media hora

// Comparación en tiempo constante: evita que alguien deduzca la ApiKey
// midiendo cuánto tarda en responder.
function igualSeguro(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

// El banco manda la cédula como '411823643' o 'V12340114'; en la plataforma
// puede estar guardada como 'V-4118236' o '4118236'. Comparamos solo dígitos.
const soloDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** De quién viene la llamada, para contarle los intentos. */
function quienLlama(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return "webhook:" + (fwd.split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "desconocido");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, message: "Método no permitido" }), { status: 405, headers: JSON_HEADERS });
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // 1) Freno de intentos, antes de tocar la base para nada más.
    const clave = quienLlama(req);
    const { data: permitido } = await adminClient.rpc("cem_rate_limit_consumir", {
      p_clave: clave,
      p_tope: TOPE_POR_MINUTO,
      p_ventana_seg: VENTANA_SEG,
      p_castigo_seg: CASTIGO_SEG,
    });
    if (permitido === false) {
      return new Response(
        JSON.stringify({ success: false, message: "Demasiadas solicitudes" }),
        { status: 429, headers: { ...JSON_HEADERS, "Retry-After": String(CASTIGO_SEG) } },
      );
    }

    const { data: fila } = await adminClient
      .from("cem_integraciones").select("datos").eq("id", "bancaribe").maybeSingle();
    const claveEsperada = fila?.datos?.notificacion_api_key;
    if (!claveEsperada) {
      return new Response(JSON.stringify({ success: false, message: "Servicio no configurado" }), { status: 503, headers: JSON_HEADERS });
    }

    // La clave anterior sigue sirviendo durante su ventana de gracia: si no,
    // rotarla cortaría al banco justo en el momento del cambio.
    const claveAnterior = fila?.datos?.notificacion_api_key_anterior;
    const venceAnterior = fila?.datos?.notificacion_api_key_anterior_vence;
    const anteriorVigente = Boolean(
      claveAnterior && venceAnterior && new Date(venceAnterior).getTime() > Date.now(),
    );

    // El banco envía 'Authorization: ApiKey xxxx'.
    const cabecera = req.headers.get("Authorization") || "";
    const claveRecibida = cabecera.replace(/^ApiKey\s+/i, "").trim();

    const conLaNueva = Boolean(claveRecibida) && igualSeguro(claveRecibida, claveEsperada);
    const conLaVieja = !conLaNueva && anteriorVigente && igualSeguro(claveRecibida, claveAnterior);

    if (!conLaNueva && !conLaVieja) {
      // Contador global de fallos: no se esquiva cambiando de IP.
      const { data: quedanIntentos } = await adminClient.rpc("cem_rate_limit_consumir", {
        p_clave: "webhook:fallos-de-clave",
        p_tope: TOPE_FALLOS_GLOBAL,
        p_ventana_seg: VENTANA_SEG,
        p_castigo_seg: CASTIGO_FALLOS_SEG,
      });

      // Queda registro del intento fallido: sirve para notar si alguien está
      // probando claves, y para descubrir que el banco quedó con una vieja.
      await adminClient.from("cem_audit_events").insert({
        accion: "webhook_clave_invalida", entidad: "cem_bancaribe_notificaciones",
        riesgo: "alto",
        detalle: { origen: clave, largo_recibido: claveRecibida.length,
                   corte_por_volumen: quedanIntentos === false },
      });

      if (quedanIntentos === false) {
        return new Response(
          JSON.stringify({ success: false, message: "Demasiados intentos fallidos" }),
          { status: 429, headers: { ...JSON_HEADERS, "Retry-After": String(CASTIGO_FALLOS_SEG) } },
        );
      }
      return new Response(JSON.stringify({ success: false, message: "No autorizado" }), { status: 401, headers: JSON_HEADERS });
    }

    if (conLaVieja) {
      // Se acepta, pero se avisa: el banco todavía está usando la clave que
      // se rotó y hay que actualizarla antes de que expire la gracia.
      await adminClient.from("cem_audit_events").insert({
        accion: "webhook_clave_anterior_en_uso", entidad: "cem_integraciones",
        riesgo: "medio",
        detalle: { vence: venceAnterior, origen: clave },
      });
    }

    const p = await req.json().catch(() => null);
    if (!p || typeof p !== "object") {
      return new Response(JSON.stringify({ success: false, message: "Cuerpo inválido" }), { status: 400, headers: JSON_HEADERS });
    }

    const monto = Number(String(p.amount ?? "").replace(",", "."));
    const registro = {
      amount: Number.isFinite(monto) ? monto : null,
      currency_code: p.currencyCode ?? null,
      bank_name: p.bankName ?? null,
      client_phone: p.clientPhone ?? null,
      commerce_phone: p.commercePhone ?? null,
      creditor_account: p.creditorAccount ?? null,
      debtor_account: p.debtorAccount ?? null,
      debtor_id: p.debtorID ?? null,
      destiny_bank_reference: p.destinyBankReference ?? null,
      origin_bank_reference: p.originBankReference ?? null,
      origin_bank_code: p.originBankCode ?? null,
      payment_type: p.paymentType ?? null,
      fecha_banco: p.date ?? null,
      hora_banco: p.time ?? null,
      udf1: p.Udf1 ?? p.udf1 ?? null,
      udf2: p.Udf2 ?? p.udf2 ?? null,
      udf3: p.Udf3 ?? p.udf3 ?? null,
      payload: p,
    };

    const { data: insertada, error: errInsert } = await adminClient
      .from("cem_bancaribe_notificaciones").insert(registro).select().single();

    if (errInsert) {
      // 23505 = ya existía esa referencia. El banco reintenta los envíos y no
      // debe verlo como error, o seguirá reintentando indefinidamente.
      if (errInsert.code === "23505") {
        return new Response(JSON.stringify({ success: true, message: "Notificación ya registrada" }), { headers: JSON_HEADERS });
      }
      throw errInsert;
    }

    // --- intento de conciliación automática ---
    // Solo concilia si NO hay ambigüedad: una única cuota pendiente cuyo monto
    // coincide y que pertenece al estudiante con esa cédula.
    try {
      const cedula = soloDigitos(registro.debtor_id);
      if (cedula && registro.amount) {
        const { data: perfiles } = await adminClient
          .from("cem_profiles").select("id, documento").not("documento", "is", null);
        const candidatos = (perfiles || []).filter((x: any) => soloDigitos(x.documento) === cedula);

        if (candidatos.length === 1) {
          const perfilId = candidatos[0].id;
          const { data: cuotas } = await adminClient
            .from("cem_installments")
            .select("id, monto, saldo, estado, enrollment_id, cem_enrollments!inner(id, profile_id)")
            .eq("cem_enrollments.profile_id", perfilId)
            .in("estado", ["pendiente", "vencida", "parcial"]);

          // El pago llega en bolívares y la cuota puede estar en USD, así que
          // solo damos por buena la coincidencia exacta de monto. Cualquier
          // otra cosa la revisa una persona.
          const coincidencias = (cuotas || []).filter(
            (c: any) => Math.abs(Number(c.saldo ?? c.monto) - registro.amount!) < 0.01,
          );

          if (coincidencias.length === 1) {
            const cuota = coincidencias[0];
            const { data: pago } = await adminClient.from("cem_payments").insert({
              enrollment_id: cuota.enrollment_id,
              installment_id: cuota.id,
              monto: registro.amount,
              moneda: registro.currency_code || "VES",
              metodo: registro.payment_type === "P2P" ? "Pago móvil" : "Transferencia bancaria",
              cuenta: registro.creditor_account,
              referencia: registro.origin_bank_reference,
              estado: "confirmado",
              conciliado: true,
              nota: "Conciliado automáticamente desde la notificación de Bancaribe",
            }).select().single();

            await adminClient.from("cem_installments")
              .update({ estado: "pagada", saldo: 0 }).eq("id", cuota.id);

            await adminClient.from("cem_bancaribe_notificaciones").update({
              estado: "conciliada",
              payment_id: pago?.id ?? null,
              enrollment_id: cuota.enrollment_id,
              conciliado_en: new Date().toISOString(),
              nota: "Conciliación automática: cédula y monto coincidieron con una sola cuota pendiente",
            }).eq("id", insertada.id);

            await adminClient.from("cem_audit_events").insert({
              accion: "pago_conciliado_automatico",
              entidad: "cem_payments",
              entidad_id: pago?.id ?? null,
              riesgo: "medio",
              detalle: {
                origen: "bancaribe_notificacion",
                referencia: registro.origin_bank_reference,
                monto: registro.amount,
              },
            });
          }
        }
      }
    } catch (errConciliacion) {
      // Que falle la conciliación no puede hacer fallar la recepción: la
      // notificación ya quedó guardada y se concilia a mano desde el panel.
      await adminClient.from("cem_bancaribe_notificaciones")
        .update({ nota: `No se pudo conciliar automáticamente: ${String(errConciliacion).slice(0, 200)}` })
        .eq("id", insertada.id);
    }

    // El banco espera HTTP 200 con un cuerpo JSON de confirmación.
    return new Response(JSON.stringify({ success: true, message: "Notificación recibida" }), { headers: JSON_HEADERS });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, message: String(err) }), { status: 500, headers: JSON_HEADERS });
  }
});
