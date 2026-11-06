# Becas y donaciones: «Ayuda a alguien a estudiar»

Personas y asociaciones donan dinero a un **fondo de becas**. Con ese fondo
el CEM paga el programa entero a quien lo solicita y el equipo elige. Cada
dólar queda anotado, de la donación a la beca.

## Las páginas

| Para quién | Dirección | Qué hace |
|---|---|---|
| Quien quiere donar | [escuelacem.com/plataforma/becas.html](https://escuelacem.com/plataforma/becas.html) (en inglés: `?lang=en`) | El contador de donaciones, las cifras de becas, los paquetes, el formulario y el pago con tarjeta |
| Quien quiere una beca | [escuelacem.com/plataforma/solicitar-beca.html](https://escuelacem.com/plataforma/solicitar-beca.html) | La encuesta de por qué quiere estudiar |
| Quien recibe una beca | `plataforma/beca.html?t=…` | El enlace personal para activarla. No sale en Google |
| El equipo | Admin → **Becas** | Solicitudes, becas dadas, convocatorias |
| Cobranza y administración | Admin → **Donaciones y fondo** | Donaciones, el libro del fondo, paquetes y ajustes |

La portada lleva una franja nueva, «Ayuda a alguien a estudiar», y la
cabecera y el pie de todas las páginas públicas llevan el enlace «Becas».
Cemi también lo sabe: si alguien le pregunta por becas o por donar, manda a
estas páginas y no promete nada.

## Cómo entra el dinero

**Con tarjeta.** La persona elige un paquete o «otro monto» y paga en Stripe.

- **El nombre y el correo son opcionales.** Quien marca **«Donar de forma
  anónima»** no da su nombre y no sale en ningún sitio público: ni en la
  lista de donantes ni en los correos al equipo.
- **El correo lo pide Stripe** si la persona no lo puso. Se guarda ese, y a
  él llegan el recibo y el aviso de a quién ayudó su aporte. El equipo lo ve
  en el detalle de la donación.

Cuando Stripe confirma el cobro:

1. La donación pasa a confirmada.
2. El importe entra en el fondo.
3. A quien donó le llega el recibo, en su idioma.
4. A cobranza y administración les llega un aviso.

Se apunta lo que Stripe dice que cobró, no lo que se pidió. Si Stripe avisa
dos veces del mismo cobro, entra una sola vez.

**Por Zelle, transferencia, cheque o en efectivo.** Se registra en Admin →
Donaciones y fondo → **Registrar una donación**:

- el monto en dólares, la referencia y la fecha;
- quién donó y su correo, para mandarle el recibo;
- el comprobante.

Entra confirmada en el momento. Pueden registrarla cobranza, coordinación y
administración. Una misma referencia no se puede registrar dos veces. Si quien
dona prefiere no dar su nombre, se marca **«Donación anónima»**.

**Los paquetes** son los cuatro que pediste: $1.000 «Impulsa», $2.300
«Transforma» (el que se sugiere), $5.000 «Multiplica» y $10.000 «Deja
huella». Cada uno tiene su nombre y su texto en español y en inglés, y se
cambian en **Paquetes y ajustes**. «Otro monto» va de $25 a $50.000, también
desde ahí.

**Anular una donación** (solo administración) la quita del fondo con su
motivo, y queda en la lista como anulada. **No se puede anular una donación
que ya pagó becas**: primero hay que revocar esas becas.

## Cómo se da una beca

### Con convocatoria, para las campañas de redes

1. En Admin → Becas → **Convocatorias**, crea una por campaña: el título, el
   código del enlace (por ejemplo `instagram-noviembre`), los programas que
   se pueden pedir, los cupos, las fechas y, si quieres, una pregunta propia.
2. Pulsa el botón de **compartir**. Sale un enlace por red (Instagram, TikTok,
   Facebook, WhatsApp, YouTube, correo, alianza) y un texto para
   acompañarlo. Así se sabe por cuál llegó cada solicitud.
3. La gente rellena la encuesta: quién es, por qué quiere estudiar, qué hará
   con lo que aprenda, su situación y las horas que puede dedicar. Le llega un
   correo de «recibimos tu solicitud» y al equipo un aviso en la campana, no
   más de uno cada seis horas.

Hay una convocatoria general, «Becas CEM», siempre abierta. Es la que usa el
enlace sin código.

### Elegir

En la pestaña **Solicitudes**, cada solicitud se abre con todas sus
respuestas. Se le ponen estrellas (1 a 5), un estado (en revisión,
preseleccionada, en espera, no elegida) y una nota interna. Si no se elige,
se le puede mandar un correo amable.

### Dar la beca (administración)

**Dar la beca** pide el programa, el grupo si lo hay, quién la paga y un
mensaje opcional:

- **El fondo:** se aparta el valor de la beca, el precio de contado del
  programa en dólares, al cambio del día. Si el fondo no alcanza, no deja
  darla.
- **El CEM:** la regala la escuela y el fondo no se toca.

Después:

- **Si la persona ya tiene cuenta con ese correo,** queda inscrita al momento,
  sin nada que pagar, y se le avisa.
- **Si no,** le llega por correo un enlace personal, que vale 30 días. Al
  abrirlo crea su cuenta con ese mismo correo y la beca se activa sola. El
  enlace también se enseña en pantalla una vez, para mandarlo por WhatsApp.

Una beca cubre siempre el **100 %** del programa: sin cuotas y sin pagos.
No entra en lo cobrado, ni en las carteras, ni en el reparto.

### Regalar un curso a alguien concreto

Para el ganador de un sorteo o una alianza, sin convocatoria: Admin → Becas →
**Regalar un curso**. Funciona igual que dar la beca. El correo es opcional:
sin él, solo sale el enlace para mandarlo tú.

### Después

En **Becas dadas**:

- **Enlace nuevo:** si se perdió el correo o venció. El anterior deja de
  funcionar.
- **Revocar:** la persona pierde el acceso y lo que la beca tenía apartado
  vuelve al fondo.
- **En la web:** con su permiso, su nombre de pila, su país y una frase suya
  salen en la página de becas.
- **Registrar una beca anterior:** las que el CEM dio antes de este sistema.
  Suman en las cifras de la página, pero no tocan el fondo.

## El contador

La cabecera de la página de becas enseña cuántas donaciones han entrado y
cuánto suman: «23 donaciones recibidas · Más de $45.000 donados». Cuenta las
confirmadas, con tarjeta y a mano. Las anuladas no cuentan, y mientras no
haya ninguna se lee «Sé de quienes las hacen posibles».

La lista «Lo hacen posible» enseña los nombres de quienes aceptaron salir, y
debajo cuántas personas más donaron sin salir con su nombre.

## La trazabilidad

- **El libro del fondo** (Donaciones y fondo → Movimientos) solo se añade,
  nunca se corrige: cada donación, cada beca, cada devolución y cada anulación,
  con su saldo. Lo disponible es la suma del libro.
- **Cada beca del fondo dice qué donaciones la pagaron,** las más antiguas
  primero. Una beca puede salir de dos donaciones, y una donación puede pagar
  varias becas.
- **A quien donó le llega un correo cuando su dinero paga una beca:** a quién
  ayudó (solo el nombre de pila y el país si la persona lo permitió) y cuánto
  de su aporte se usó.
- **Una donación anónima queda igual de anotada:** su número, su importe, su
  cobro en Stripe y su correo. Lo único que falta es el nombre.
- **Cada acción del equipo queda en auditoría:** dar, revocar, anular,
  cambiar ajustes.

## Los informes

El **cierre de mes** tiene un bloque propio, «Donaciones y becas · aparte de
lo cobrado», con su CSV:

- lo donado y por qué vía;
- las becas que empezaron y lo que valen;
- lo que salió del fondo;
- el saldo a fin de mes.

Nada de esto suma en «Entró» ni en el reparto a inversores.

## Lo que conviene saber

- **No es deducible de impuestos.** La página y el recibo lo dicen. El texto
  del recibo se cambia en ajustes, en español y en inglés.
- **La comisión de Stripe la asume el CEM.** El fondo cuenta la donación
  entera, que es lo que se le promete a quien dona.
- **El dinero con tarjeta llega al saldo de Stripe** de la cuenta elegida en
  ajustes (por defecto, la principal), como cualquier cobro. El fondo es la
  cuenta de control de ese dinero, no una cuenta bancaria aparte.
- **Una beca en enlace sin activar tiene el dinero apartado** hasta que se
  active, se mande un enlace nuevo o se revoque. Nada desaparece solo.

## Probar sin mover dinero

1. En Admin → Cobros con tarjeta → Otras empresas, añade una cuenta de Stripe
   en **modo prueba**.
2. En Donaciones y fondo → Paquetes y ajustes, elígela como cuenta de las
   donaciones.
3. Dona en la página con la tarjeta `4242 4242 4242 4242`, cualquier fecha
   futura y cualquier código.
4. Comprueba que llegó el recibo y que la donación aparece confirmada.
5. Vuelve a poner **la principal** y **anula la donación de prueba**, para que
   no cuente en el fondo.

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Tablas | `cem_becas_ajustes`, `cem_becas_paquetes`, `cem_becas_donaciones`, `cem_becas_convocatorias`, `cem_becas_solicitudes`, `cem_becas`, `cem_becas_fondo` (el libro), `cem_becas_financiacion` |
| Migraciones | `supabase/migrations/20261107000001…05` |
| Abrir el cobro | `supabase/functions/cem-donar` |
| Confirmarlo | `supabase/functions/cem-stripe-webhook` (la rama de `metadata.donacion_id`) |
| Páginas | `plataforma/becas.html`, `solicitar-beca.html`, `beca.html`, `estudiante/beca.html`, `admin/becas.html`, `admin/donaciones.html` |
| Funciones | Ver [funciones-del-servidor.md](funciones-del-servidor.md#becas-y-donaciones) |
