// CEM · Convertir una compra de invitado en alumno.
//
// POR QUE VIVE AQUI Y NO EN UNA FUNCION SOLA
// ---------------------------------------------------------------------------
// Lo llaman dos puertas distintas y tienen que hacer EXACTAMENTE lo mismo:
//
//   · cem-stripe-webhook, cuando Stripe avisa de que la tarjeta paso.
//   · cem-comprar, cuando el equipo confirma un pago movil o una
//     transferencia que ya vio en el banco.
//
// Duplicarlo era garantizar que un dia una de las dos creara la cuenta y la
// otra no, o que una registrara el pago con otro metodo, y que nadie se
// enterara hasta que un alumno pagara y no pudiera entrar.
//
// EL COBRO NO SE COMPRUEBA AQUI
// ---------------------------------------------------------------------------
// Esta funcion da por hecho que el dinero entro. Quien la llama es el
// responsable de saberlo: el webhook porque lo firma Stripe, y la confirmacion
// manual porque una persona con permiso de cobranza lo vio en el extracto.

import { createClient } from 'jsr:@supabase/supabase-js@2';

export type ResultadoCierre = { error?: string; status?: number; cuerpo?: unknown };

/* ── Convertir una compra de invitado en alumno ───────────────────────────
   Tres pasos, en este orden y no en otro:

     1. La cuenta. Si ya hay una con ese correo, se usa esa — comprar dos
        veces no puede partir a una persona en dos alumnos.
     2. La inscripción y sus cuotas.
     3. El pago, por la MISMA puerta que cualquier otro.

   Es idempotente de punta a punta porque Stripe reintenta el aviso hasta que
   se le contesta bien, y un reintento no puede crear una segunda cuenta, una
   segunda inscripción ni un segundo pago. */
export async function cerrarCompraInvitado(
  admin: ReturnType<typeof createClient>,
  compraId: string,
  cobro: { monto: number; moneda: string; referencia: string; metodo: string },
): Promise<ResultadoCierre> {
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

  // 3 · El pago, por la puerta de siempre. El importe, la moneda, la
  //     referencia y el método los trae quien llama, porque cada puerta los
  //     sabe de un sitio distinto: Stripe de su sesión, el equipo del banco.
  const { error: ePago } = await admin.rpc('cem_reportar_pago_servidor', {
    p_installment_id: cierre.installment_id,
    p_monto: cobro.monto,
    p_moneda: cobro.moneda,
    p_referencia: cobro.referencia.slice(0, 40),
    p_metodo: cobro.metodo,
    p_profile_id: profileId,
  });
  // «Ya hay un pago con esa referencia» es un reintento, no un fallo.
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
