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

/* Lo que se apunta. El monto va en la moneda de la FORMA DE PAGO: euros si fue
   la tarjeta, bolívares si fue un pago móvil. La base lo convierte con la tasa
   del día; mandarle aquí el importe en euros de un pago en bolívares hacía que
   45 € se abonaran como 0,04 €.

   confirmadoPor: quien del equipo confirmó un pago local. Sin él, es Stripe. */
export type Cobro = { monto: number; referencia: string; metodo: string; confirmadoPor?: string | null };

/* ── Convertir una compra de invitado en alumno ───────────────────────────
   Dos pasos, en este orden y no en otro:

     1. La cuenta. Si ya hay una con ese correo, se usa esa — comprar dos
        veces no puede partir a una persona en dos alumnos.
     2. La inscripción, sus cuotas y el pago, por la MISMA puerta que
        cualquier otro pago y en UNA sola transacción
        (cem_compra_invitado_asentar).

   Hasta el 9 de noviembre de 2026 el paso 2 eran dos llamadas: una cerraba la
   compra —y la marcaba «pagada»— y otra apuntaba el pago. Si la segunda
   fallaba, Stripe reintentaba, la primera decía «repetido» y aquí se
   contestaba OK: el cobro quedaba sin apuntar para siempre. Ahora, si el pago
   no entra no queda nada, y el reintento lo intenta entero otra vez.

   Es idempotente de punta a punta porque Stripe reintenta el aviso hasta que
   se le contesta bien, y un reintento no puede crear una segunda cuenta, una
   segunda inscripción ni un segundo pago. */
export async function cerrarCompraInvitado(
  admin: ReturnType<typeof createClient>,
  compraId: string,
  cobro: Cobro,
): Promise<ResultadoCierre> {
  const { data: compra } = await admin.from('cem_compras_invitado')
    .select('*').eq('id', compraId).maybeSingle();
  if (!compra) return { error: 'Esa compra no existe.', status: 404 };

  // Ya asentada: es un reintento. Se contesta antes de tocar las cuentas.
  if (compra.estado === 'pagada' && compra.payment_id) {
    return { cuerpo: { ok: true, repetido: true } };
  }

  /* Si no se puede asentar y lo que llama es Stripe, el error queda en la
     compra y el equipo se entera (una vez por cada error distinto): el dinero
     ya está cobrado, y Stripe sólo lo sabe su panel. Se contesta 500 para que
     lo reintente. Cuando confirma alguien del equipo, el error lo ve en su
     pantalla, y no hace falta avisar a nadie más. */
  const fallar = async (mensaje: string): Promise<ResultadoCierre> => {
    if (!cobro.confirmadoPor) {
      try {
        await admin.rpc('cem_compra_invitado_fallo', { p_compra_id: compraId, p_error: mensaje });
      } catch (e) {
        console.error('[compra] no se pudo apuntar el fallo:', e);
      }
    }
    return { error: mensaje, status: 500 };
  };

  const email = String(compra.email).toLowerCase().trim();

  /* 1 · La cuenta, por el correo exacto (cem_cuenta_por_correo, en la base).
     Antes se buscaba con ilike, donde «_» y «%» hacen de comodín —podía dar
     con otra persona—, y si no aparecía, con listUsers, que sólo mira la
     primera página de cuentas.

     Si no hay, se crea con el correo YA confirmado: el pago con tarjeta a ese
     correo demuestra bastante más que un clic en un enlace de verificación, y
     hacerle verificar después de haber pagado es una puerta cerrada en la
     cara. */
  let profileId: string | null = null;
  let cuentaNueva = false;

  const { data: yaTiene, error: eBuscar } = await admin.rpc('cem_cuenta_por_correo', { p_email: email });
  if (eBuscar) return await fallar(`No se pudo buscar la cuenta: ${eBuscar.message}`);

  if (yaTiene) {
    profileId = String(yaTiene);
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
      // Otra entrega del mismo aviso pudo crearla un instante antes.
      const { data: otraVez } = await admin.rpc('cem_cuenta_por_correo', { p_email: email });
      if (!otraVez) return await fallar(`No se pudo crear la cuenta: ${eCrear.message}`);
      profileId = String(otraVez);
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

  // 2 · La inscripción y el pago, en una sola transacción.
  const { data: cierre, error: eAsentar } = await admin.rpc('cem_compra_invitado_asentar', {
    p_compra_id: compraId,
    p_profile_id: profileId,
    p_cuenta_nueva: cuentaNueva,
    p_monto: cobro.monto,
    p_referencia: cobro.referencia,
    p_metodo: cobro.metodo,
    p_confirmado_por: cobro.confirmadoPor ?? null,
  });
  if (eAsentar) return await fallar(eAsentar.message);
  if (cierre?.repetido) return { cuerpo: { ok: true, repetido: true } };

  /* Y el correo para poner la clave. Va DESPUÉS de que todo lo demás salió
     bien: mandarle a alguien «ya estás dentro» y que al entrar no encuentre su
     inscripción es peor que tardar un minuto más.

     Hasta el 23 de octubre de 2026 aquí había `auth.admin.generateLink`, que
     FABRICA el enlace y lo devuelve, pero no lo manda: el resultado se tiraba y
     el correo que prometía bienvenida.html no salía nunca. Ésta es la llamada
     que sí lo envía, la misma de «Olvidé mi contraseña», y lleva a la misma
     pantalla para ponerla. Si falla, la compra no se deshace: en bienvenida.html
     la persona puede pedirlo otra vez. */
  if (cuentaNueva) {
    try {
      const { error: eCorreo } = await admin.auth.resetPasswordForEmail(email, {
        redirectTo: 'https://escuelacem.com/plataforma/nueva-clave.html',
      });
      if (eCorreo) console.error('[compra] no salió el correo para poner la clave:', eCorreo.message);
    } catch (e) {
      console.error('[compra] no salió el correo para poner la clave:', e);
    }
  }

  return {
    cuerpo: {
      ok: true, compra: compraId, profile_id: profileId,
      enrollment_id: cierre.enrollment_id, payment_id: cierre.payment_id,
      cuenta_nueva: cuentaNueva,
    },
  };
}
