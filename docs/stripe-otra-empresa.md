# Cobrar con tarjeta en la cuenta de Stripe de otra empresa

Algunos programas tienen como beneficiaria a **otra empresa**, no al CEM. Para
esos programas, lo que se pague con tarjeta tiene que entrar en la cuenta de
Stripe de esa empresa. Esta guía explica cómo se conecta esa cuenta, paso a
paso.

## Qué hace y qué no hace

- **Hay dos cuentas de Stripe independientes:** la del CEM, que sigue como
  está, y la de la otra empresa. No es Stripe Connect y no hay comisión del
  CEM: lo que se cobra en la cuenta de la empresa es **entero de ella** y llega
  a **su** banco.
- **Cada programa dice en cuál cobra.** Por defecto, en la del CEM. Se cambia
  programa por programa, y solo puede cambiarlo un administrador.
- **Solo cambia la tarjeta.** Si alguien paga uno de esos programas por
  transferencia, pago móvil o en efectivo, ese dinero sigue entrando en las
  cuentas del CEM, como hoy.
- **Lo cobrado se apunta aparte.** Cada empresa tiene:
  - su cartera, «Stripe · Empresa»;
  - su método de pago, «Tarjeta de crédito/débito (Empresa)».

  Así se ve qué entró en cada sitio.
- **Para el estudiante no cambia nada:** pulsa «Pagar con tarjeta», paga en la
  pantalla de Stripe y el curso se abre solo. Lo único distinto es que en el
  extracto de su tarjeta sale el nombre de la otra empresa.

> **Antes de empezar, una decisión.** El **cierre de mes** y el **reparto a
> inversores** suman hoy *todos* los pagos confirmados, sin mirar en qué
> cartera entraron. Lo que pague un estudiante con tarjeta en un programa de
> otra empresa contaría como ingreso del CEM en esos dos informes, aunque el
> dinero esté en la cuenta de esa empresa. Si esos programas deben quedar
> fuera, hay que decirlo antes del primer reparto en el que entren.

## Paso 1 · La cuenta de Stripe de la empresa

La abre **la propia empresa**, no el CEM. Es su cuenta, a su nombre, y el dinero
va a su banco.

1. En [stripe.com](https://stripe.com), **Start now**, con **un correo de la
   empresa**: no el del CEM ni el de una persona que mañana puede no estar.
2. **El país es aquel donde la empresa está constituida.** Tiene que ser uno
   donde Stripe opere: Stripe no está en Venezuela. La lista está en
   [stripe.com/global](https://stripe.com/global).
3. **Activar la cuenta** (*Settings → Business* o el aviso «Activate
   payments»). Pide:
   - el tipo de empresa y su identificación fiscal;
   - los datos de la persona que la representa;
   - **la cuenta bancaria donde Stripe deposita lo cobrado**;
   - el **nombre que sale en el extracto de la tarjeta**. Conviene que el
     estudiante lo reconozca: un nombre que no conoce acaba en reclamación;
   - un correo y un teléfono de soporte.
4. En *Settings → Business → Branding*: **el logo y los colores**. Es lo que ve
   el estudiante en la pantalla de pago.
5. Activar la **verificación en dos pasos** para entrar en esa cuenta.

Mientras la cuenta no esté activada, se puede trabajar en **modo prueba**, que
es como se hacen los pasos que siguen.

## Paso 2 · Las claves, en modo prueba

En la cuenta de Stripe **de esa empresa**, con el interruptor **Test mode**
encendido: **Developers → API keys**. Hay dos claves:

- **La clave pública:** empieza por `pk_test_…`.
- **La clave secreta:** empieza por `sk_test_…`. Se pulsa *Reveal* para verla.

Si se prefiere una clave **restringida** (`rk_test_…`) en vez de la secreta
entera, necesita permiso de **escritura** en *Checkout Sessions*, *Products* y
*Prices*.

**La clave secreta cobra.** Solo se pega en la pantalla de la plataforma: no
se manda por correo ni por chat, ni se guarda en ningún documento.

## Paso 3 · Añadirla en la plataforma

**Admin → Cobrar → Cobros con tarjeta → Otras empresas → Añadir una empresa.**

| Campo | Qué va |
|---|---|
| Nombre de la empresa | Como se quiera ver en la cartera y en el método de pago. |
| Identificador | Se sugiere solo a partir del nombre, por ejemplo `empresa-b`. Va en la dirección del webhook, así que **después no se cambia**. |
| Modo | **Prueba**. |
| Clave pública | La `pk_test_…`. |
| Clave secreta | La `sk_test_…`. |
| Secreto del webhook | Todavía vacío: sale del paso 4. |

Al guardar, la empresa aparece en la lista con el aviso **«Falta el webhook»**
y, debajo, **la dirección de su webhook**, con un botón para copiarla.
Terminará en `?cuenta=<identificador>`.

La plataforma rechaza las claves que ya sean de otra cuenta configurada. Es la
equivocación más fácil: pegar las claves del CEM en la de otra empresa. Se
cobraría, pero el dinero iría al CEM.

## Paso 4 · El webhook: que Stripe avise cuando alguien paga

Sin esto, la persona paga, Stripe cobra, y en la plataforma nadie se entera:
la cuota sigue pendiente y el curso cerrado.

En la cuenta de Stripe **de esa empresa**, todavía en modo prueba:
**Developers → Webhooks → Add endpoint**. En el panel nuevo de Stripe se llama
*Workbench → Webhooks → Create an event destination*, con *Your account*.

1. **Endpoint URL:** la dirección que enseña la plataforma bajo el nombre de la
   empresa, **completa, con el final `?cuenta=…`**.
2. **Los eventos:** `checkout.session.completed`. Si esta cuenta es también
   la de las donaciones de becas (Donaciones y fondo → Paquetes y ajustes),
   añade los de los pagos por ACH y la ayuda recurrente:
   `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `invoice.paid`,
   `invoice.payment_failed`, `customer.subscription.updated` y
   `customer.subscription.deleted`. Sin ellos, un ACH no entraría nunca y
   los cobros mensuales no llegarían al fondo.
3. Guardar, y en el webhook recién creado, **Signing secret → Reveal**: un
   `whsec_…`.
4. En la plataforma: **Editar** la empresa, pegarlo en **Secreto del
   webhook** y guardar. El aviso pasa de «Falta el webhook» a **«En
   pruebas»**.

## Paso 5 · Decir qué programas cobran en esa cuenta

**Admin → Dar clase → Cursos →** el lápiz del programa **→ Descuentos y
facilidades de pago → Cobro con tarjeta en →** la empresa → **Guardar el
programa**.

- La plataforma pide confirmación, porque a partir de ese momento el dinero de
  la tarjeta de ese programa va a otra empresa.
- En la lista de cursos, el programa lleva la etiqueta **«Tarjeta: Empresa»**.
- El programa se crea solo como producto en la cuenta de Stripe de la empresa.
  Tarda un minuto; mientras tanto se cobra con el nombre del programa, que
  funciona igual.
- **Solo un administrador** puede cambiar este desplegable. La coordinación lo
  ve, pero no lo puede tocar.

## Paso 6 · Una compra de prueba

Con la empresa en modo prueba, no se mueve dinero de verdad.

1. En una ventana de incógnito, la ficha pública del programa → **Inscribirme**
   → pagar con tarjeta, con la tarjeta de prueba `4242 4242 4242 4242`, una
   fecha futura cualquiera y un CVC cualquiera.
2. Hay que comprobar cuatro cosas:
   - **el curso se abre** y llega el correo de bienvenida;
   - en **Admin → Verificar pagos**, el pago sale con el método **«Tarjeta de
     crédito/débito (Empresa)»**;
   - en **Admin → Carteras**, entra en **«Stripe · Empresa»**, no en «Stripe
     (tarjetas)»;
   - en la cuenta de Stripe **de la empresa**:
     - en *Payments* está el cobro;
     - en *Webhooks*, el aviso salió con respuesta **200**.
3. Esa compra de prueba creó un alumno de prueba: se borra a mano después.

## Paso 7 · Pasar a modo real

Cuando la cuenta de la empresa esté **activada** y la compra de prueba haya
salido bien:

1. En su cuenta de Stripe, se apaga **Test mode**. Las claves y los webhooks del
   modo real son **otros**.
2. **Developers → API keys:** copiar `pk_live_…` y `sk_live_…`.
3. **Developers → Webhooks:** crear el webhook **otra vez**, ahora en modo
   real, con la misma dirección y el mismo evento. Copiar su nuevo `whsec_…`.
4. En la plataforma, **Editar** la empresa:
   - **Modo:** Real;
   - pegar las tres claves nuevas;
   - guardar. La plataforma pide confirmación, porque desde ese momento se
     cobra dinero de verdad.

El aviso pasa a **«Cobrando»**.

## Si algo falla

| Lo que pasa | Por qué, y qué hacer |
|---|---|
| Al pagar: «El cobro con tarjeta de este programa no está configurado todavía» | A la cuenta de la empresa le faltan claves. Revisa el paso 3. |
| La persona pagó y el curso no se abrió | Casi siempre es el webhook. En Stripe, *Developers → Webhooks →* el endpoint, *Event deliveries*, y mira qué respondió (filas siguientes). En modo real, Stripe reintenta durante tres días (en prueba, unas horas): basta con arreglarlo y el pago entra solo con el siguiente reintento, o pulsando *Resend* en ese aviso. |
| El webhook responde **401** | El *signing secret* pegado en la plataforma no es el de ese webhook. O es el del modo prueba y el webhook es del modo real, o al revés. Vuelve a copiarlo. |
| El webhook responde **404** | La dirección no lleva bien el `?cuenta=…`, o esa empresa ya no está configurada. Cópiala otra vez de la plataforma. |
| El webhook responde **409** | La empresa no tiene secreto del webhook guardado. |
| El webhook responde **400**, «se abrió en la cuenta…» | El webhook de una cuenta apunta a la dirección de otra. Cada cuenta, su dirección. |
| En la lista de cursos sale **«Stripe: falló»** | No se pudo crear el programa como producto en esa cuenta. Si es una clave restringida, le falta permiso en *Products*. El cobro sigue funcionando con el nombre del programa. |
| No deja quitar una empresa | Todavía hay programas que cobran en ella. Pásalos antes a otra cuenta, en Cursos. |

## Para quien mantenga el código

- **Las cuentas:** la principal es la fila `stripe` de `cem_integraciones`, la
  de siempre. Las demás son filas `stripe:<clave>`, con `nombre`, `modo`, las
  claves y `metodo`.
- **Dónde cobra cada programa:** `cem_courses.stripe_cuenta`, vacío para la
  principal.
  - El disparador `cem_curso_cuenta_stripe` normaliza el valor y exige que la
    cuenta exista y esté completa.
  - Solo deja cambiarlo a un admin; sin sesión, también al servidor.
  - Al cambiarlo, borra `stripe_product_id` para que el producto se cree en la
    cuenta nueva.
- **Las funciones de servidor:** `supabase/functions/_shared/stripe-cuentas.ts`
  resuelve la cuenta de cada programa. La usan:
  - **`cem-stripe-checkout`** (las cuotas) y **`cem-comprar`** (la compra sin
    cuenta): cobran con la clave de esa cuenta, ponen `metadata[cuenta]` y
    guardan la cuenta en `cem_stripe_sesiones.cuenta`.
  - **`cem-stripe-webhook`:**
    - comprueba la firma con el secreto de la cuenta de `?cuenta=`. Sin ese
      parámetro, prueba primero el de la principal y luego el de las demás;
    - rechaza el aviso si `metadata.cuenta` no coincide con la cuenta que
      firmó;
    - registra el pago con el método de esa cuenta.
- **Las migraciones:** `20261106000001_stripe_varias_cuentas.sql` y
  `20261106000002_stripe_cuenta_solo_admin.sql`.
