// CEM · Lo que Stripe nos cuenta cuando alguien paga.
//
// Esta es la pieza que hace que pagar con tarjeta abra el curso solo. Sin ella,
// la persona paga, Stripe cobra, y aquí nadie se entera — la cuota seguiría
// pendiente y el curso cerrado.
//
// NO confía en quien llama. Cualquiera puede mandar un POST aquí diciendo «esta
// cuota está pagada»; lo que lo impide es la firma que Stripe pone en cada
// aviso, comprobada abajo contra el secreto del webhook. Sin firma válida no se
// toca nada.
//
// Va sin verify_jwt: quien llama es Stripe, que no tiene sesión de Supabase.
// Por eso la firma no es un detalle de seguridad, es LA seguridad.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

/** La firma de Stripe: `t=<segundos>,v1=<hmac>`. Se rehace el hmac con el
 *  secreto y se compara. Es HMAC-SHA256 sobre «timestamp.cuerpo». */
async function firmaValida(cuerpo: string, cabecera: string, secreto: string): Promise<boolean> {
  const partes = Object.fromEntries(
    cabecera.split(',').map((p) => p.split('=').map((x) => x.trim())) as [string, string][],
  );
  const t = partes['t'];
  const v1 = partes['v1'];
  if (!t || !v1) return false;

  // Un aviso de hace horas es un aviso repetido por alguien que lo capturó.
  // Cinco minutos es la tolerancia que recomienda Stripe.
  const edad = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(edad) || edad > 300) return false;

  const clave = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(`${t}.${cuerpo}`));
  const esperado = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');

  // Comparación de tiempo constante: comparar con === filtra el secreto poco a
  // poco a quien mida cuánto tarda en fallar.
  if (esperado.length !== v1.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ v1.charCodeAt(i);
  return dif === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Sólo POST.' }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const cuerpo = await req.text();

  const { data: cfg } = await admin.from('cem_integraciones')
    .select('datos').eq('id', 'stripe').maybeSingle();
  const secreto = cfg?.datos?.webhook_secret;
  if (!secreto) return json({ error: 'Sin secreto de webhook configurado.' }, 409);

  const cabecera = req.headers.get('stripe-signature') || '';
  if (!(await firmaValida(cuerpo, cabecera, secreto))) {
    return json({ error: 'Firma inválida.' }, 401);
  }

  const evento = JSON.parse(cuerpo);
  // Sólo interesa una cosa: que una sesión de pago se completó.
  if (evento.type !== 'checkout.session.completed') return json({ ok: true, ignorado: evento.type });

  const sesion = evento.data?.object || {};
  const sessionId = sesion.id;

  /* ── Compró alguien que no tenía cuenta ────────────────────────────────
     Aquí es donde nace la cuenta, y no antes: si se creara al pulsar
     «comprar», cualquiera podría llenar la plataforma de cuentas con correos
     ajenos sin pagar un céntimo.

     A partir de aquí el camino vuelve a ser el de siempre — se crea la
     inscripción, sale una primera cuota, y ese cobro se registra con la misma
     función que cualquier otro pago. Dos caminos hasta la cartera con reglas
     distintas es como acaban sin cuadrar las cuentas. */
  const compraInvitado = sesion.metadata?.compra_invitado_id;
  if (compraInvitado) {
    const r = await cerrarCompraInvitado(admin, compraInvitado, sesion);
    if (r.error) return json({ error: r.error }, r.status ?? 500);
    return json(r.cuerpo);
  }

  const cuotaId = sesion.metadata?.installment_id || sesion.client_reference_id;
  if (!sessionId || !cuotaId) return json({ ok: true, sin_datos: true });

  // Idempotencia: Stripe reintenta un aviso hasta que le respondemos bien, y
  // repetirlo NO puede cobrar dos veces la misma cuota. Si esta sesión ya se
  // marcó pagada, se contesta que sí y no se toca nada más.
  const { data: yaEstaba } = await admin.from('cem_stripe_sesiones')
    .select('estado').eq('session_id', sessionId).maybeSingle();
  if (yaEstaba?.estado === 'pagada') return json({ ok: true, repetido: true });

  const centimos = Number(sesion.amount_total || 0);
  const monto = Math.round(centimos) / 100;

  // Se registra el pago por la misma puerta que un pago declarado a mano
  // —`cem_reportar_pago` y su aprobación— para que no haya dos caminos que
  // acaben en la cartera con reglas distintas.
  const referencia = String(sesion.payment_intent || sessionId).slice(0, 40);
  const { data: pago, error: eReportar } = await admin.rpc('cem_reportar_pago_servidor', {
    p_installment_id: cuotaId,
    p_monto: monto,
    p_moneda: String(sesion.currency || 'eur').toUpperCase(),
    p_referencia: referencia,
    p_metodo: 'Tarjeta de crédito/débito',
    p_profile_id: sesion.metadata?.profile_id || null,
  });

  if (eReportar) {
    // «Ya hay un pago con esa referencia» NO es un fallo aquí: significa que
    // este cobro ya se registró y Stripe está reintentando el aviso. Hay que
    // contestarle que sí — si se le devuelve un error, reintenta durante días.
    //
    // Esto ocurre cuando la fila de la sesión no está (por ejemplo, si el aviso
    // llega antes de que termine de guardarse), así que el guardia de más
    // arriba no lo atrapó. La referencia es la segunda red, y la que de verdad
    // impide cobrar dos veces la misma cuota.
    const yaRegistrado = /ya hay un pago registrado/i.test(eReportar.message || '');
    if (!yaRegistrado) return json({ error: eReportar.message }, 500);

    await admin.from('cem_stripe_sesiones').update({
      estado: 'pagada',
      payment_intent: sesion.payment_intent || null,
      pagado_en: new Date().toISOString(),
    }).eq('session_id', sessionId);
    return json({ ok: true, repetido: true, referencia });
  }

  await admin.from('cem_stripe_sesiones').update({
    estado: 'pagada',
    payment_intent: sesion.payment_intent || null,
    pagado_en: new Date().toISOString(),
  }).eq('session_id', sessionId);

  return json({ ok: true, pago });
});

/* ── Convertir una compra de invitado en alumno ───────────────────────────
   Tres pasos, en este orden y no en otro:

     1. La cuenta. Si ya hay una con ese correo, se usa esa — comprar dos
        veces no puede partir a una persona en dos alumnos.
     2. La inscripción y sus cuotas.
     3. El pago, por la MISMA puerta que cualquier otro.

   Es idempotente de punta a punta porque Stripe reintenta el aviso hasta que
   se le contesta bien, y un reintento no puede crear una segunda cuenta, una
   segunda inscripción ni un segundo pago. */
async function cerrarCompraInvitado(
  admin: ReturnType<typeof createClient>,
  compraId: string,
  sesion: Record<string, any>,
): Promise<{ error?: string; status?: number; cuerpo?: unknown }> {
  const { data: compra } = await admin.from('cem_compras_invitado')
    .select('*').eq('id', compraId).maybeSingle();
  if (!compra) return { error: 'Esa compra no existe.', status: 404 };

  const email = String(compra.email).toLowerCase().trim();

  /* 1 · La cuenta. Se busca por correo en los perfiles, que es donde vive el
     correo de verdad de la plataforma. Si no hay, se crea la cuenta de acceso
     con el correo YA confirmado: el pago con tarjeta a ese correo demuestra
     bastante más que un clic en un enlace de verificación, y hacerle verificar
     después de haber pagado es una puerta cerrada en la cara. */
  let profileId: string | null = null;
  let cuentaNueva = false;

  const { data: perfil } = await admin.from('cem_profiles')
    .select('id').ilike('email', email).maybeSingle();

  if (perfil?.id) {
    profileId = perfil.id;
  } else {
    const partes = String(compra.nombre).trim().split(/\s+/);
    const { data: creado, error: eCrear } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        nombre: partes[0] ?? '',
        apellido: partes.slice(1).join(' '),
      },
    });
    if (eCrear) {
      /* Puede existir la cuenta de acceso sin perfil todavía (registro a
         medias). No es un fallo: se busca y se sigue. Devolverle un error a
         Stripe aquí lo haría reintentar durante días por algo que no se
         arregla solo. */
      const { data: lista } = await admin.auth.admin.listUsers();
      const ya = lista?.users?.find((u) => (u.email ?? '').toLowerCase() === email);
      if (!ya) return { error: `No se pudo crear la cuenta: ${eCrear.message}`, status: 500 };
      profileId = ya.id;
    } else {
      profileId = creado.user!.id;
      cuentaNueva = true;
    }
  }

  // El perfil puede no existir aún: el disparador que lo crea corre al dar de
  // alta la cuenta, pero si el registro quedó a medias hay que asegurarlo.
  await admin.from('cem_profiles').upsert({
    id: profileId,
    email,
    nombre: String(compra.nombre).trim().split(/\s+/)[0] ?? '',
    apellido: String(compra.nombre).trim().split(/\s+/).slice(1).join(' '),
    rol: 'estudiante',
    activo: true,
  }, { onConflict: 'id', ignoreDuplicates: true });

  // 2 · La inscripción. La base decide y es idempotente.
  const { data: cierre, error: eCerrar } = await admin.rpc('cem_compra_invitado_cerrar', {
    p_compra_id: compraId,
    p_profile_id: profileId,
    p_cuenta_nueva: cuentaNueva,
  });
  if (eCerrar) return { error: eCerrar.message, status: 500 };
  if (cierre?.repetido) return { cuerpo: { ok: true, repetido: true } };

  // 3 · El pago, por la puerta de siempre.
  const monto = Math.round(Number(sesion.amount_total || 0)) / 100;
  const referencia = String(sesion.payment_intent || sesion.id).slice(0, 40);
  const { error: ePago } = await admin.rpc('cem_reportar_pago_servidor', {
    p_installment_id: cierre.installment_id,
    p_monto: monto,
    p_moneda: String(sesion.currency || 'usd').toUpperCase(),
    p_referencia: referencia,
    p_metodo: 'Tarjeta de crédito/débito',
    p_profile_id: profileId,
  });
  // «Ya hay un pago con esa referencia» es un reintento de Stripe, no un fallo.
  if (ePago && !/ya hay un pago registrado/i.test(ePago.message || '')) {
    return { error: ePago.message, status: 500 };
  }

  /* Y el correo para poner la clave. Va DESPUÉS de que todo lo demás salió
     bien: mandarle a alguien «ya estás dentro» y que al entrar no encuentre su
     inscripción es peor que tardar un minuto más. */
  if (cuentaNueva) {
    try {
      await admin.auth.admin.generateLink({ type: 'recovery', email });
    } catch (e) {
      console.error('[compra] no se pudo generar el enlace de clave:', e);
    }
  }

  return {
    cuerpo: {
      ok: true, compra: compraId, profile_id: profileId,
      enrollment_id: cierre.enrollment_id, cuenta_nueva: cuentaNueva,
    },
  };
}
