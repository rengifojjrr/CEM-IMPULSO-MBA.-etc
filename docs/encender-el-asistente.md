# Encender el asistente · paso a paso

Todo está construido y subido. Faltan **tres cosas**, y ninguna se puede hacer
desde aquí porque todas piden entrar con tu cuenta: la clave del modelo, subir
las dos funciones y (si quieres WhatsApp) dar de alta el número.

Calcula **20 minutos** para los pasos 1 y 2, que es lo que hace falta para que
el asistente hable en la página. WhatsApp es un rato más y se puede dejar para
otro día: son independientes.

Al final de cada paso hay un **«cómo sé que salió bien»**. Si uno falla, para
ahí y dímelo — seguir con el siguiente sólo esconde dónde se rompió.

---

## Paso 1 · La clave del modelo (5 min)

El asistente necesita un modelo de lenguaje. Usamos **Groq** porque es rápido y
tiene una capa gratuita de verdad, sin tarjeta.

1. Entra en **console.groq.com** y crea la cuenta (vale con Google).
2. En el menú de la izquierda, **API Keys** → **Create API Key**.
3. Ponle de nombre `CEM asistente`. Copia la clave que sale — **empieza por
   `gsk_`** y sólo se enseña una vez. Si la pierdes, se borra y se hace otra.

**No me la pegues aquí.** Con la de Resend lo hicimos así y acabaste teniendo
que revocarla. Va directa al paso 2, donde se guarda cifrada del lado del
servidor, y yo compruebo desde aquí que funciona sin verla nunca.

### Lo que da gratis, y cuándo se queda corto

La capa gratuita de Groq va por organización, no por clave: hacer más claves no
sube el límite. Para el modelo que usamos (`llama-3.3-70b-versatile`) son
aproximadamente **30 peticiones por minuto, 1.000 al día y 12.000 tokens por
minuto**.

En la práctica: cada pregunta del asistente gasta unos 2.000 tokens, así que el
límite real que se toca primero es el de tokens por minuto — unas **6 preguntas
seguidas por minuto**. Para un centro que empieza sobra. El día que no sobre,
se pasa a la capa de pago de Groq (céntimos por millón de tokens) o se añade
otro proveedor a la cadena, y eso no toca ni una línea de código: es cambiar un
secreto.

Cuando se pasa del límite, Groq devuelve un 429 y el asistente contesta la
frase de cortesía con el aviso de avería. No miente ni se inventa nada.

---

## Paso 2 · Subir las dos funciones (15 min)

Se puede sin instalar nada, desde el navegador.

### 2.1 · Guardar la clave

1. Abre
   `https://supabase.com/dashboard/project/vajbsfgojtunamhrzrpf/functions/secrets`
2. **Add new secret**:
   - Key: `GROQ_API_KEY`
   - Value: la clave `gsk_…` del paso 1
3. **Save**.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` **no hay que
ponerlos**: Supabase se los da solo a las funciones.

> Los secretos se aplican al momento, sin volver a subir nada. Si algún día hay
> que cambiar la clave, se cambia aquí y ya está.

### 2.2 · Subir `cem-asistente` — el que habla en la página

1. Ve a
   `https://supabase.com/dashboard/project/vajbsfgojtunamhrzrpf/functions`
2. **Deploy a new function** → **Via Editor**.
3. Nombre exacto, sin cambiar ni una letra: **`cem-asistente`**
4. Borra el código de ejemplo y pega el nuestro. Está en el repositorio:

   `supabase/functions/cem-asistente/index.ts`

   En GitHub: entra al archivo, pulsa el botón de **copiar el contenido** (el
   icono de dos hojas, arriba a la derecha del código) y pégalo entero.
5. **Deploy function**.

**Cómo sé que salió bien:** en la lista de funciones aparece `cem-asistente`
con estado *Active*.

### 2.3 · Subir `cem-whatsapp` — sólo si vas a hacer WhatsApp

Igual que el anterior, con dos diferencias que **importan**:

- Nombre: **`cem-whatsapp`**
- Archivo: `supabase/functions/cem-whatsapp/index.ts`
- Y esto es lo que se olvida: hay que **desactivar «Verify JWT»** en los
  ajustes de esa función. WhatsApp no manda sesiones de Supabase; con esa
  casilla puesta, Meta recibe un 401 y el webhook nunca llega. La otra función
  sí la lleva activada, y así tiene que quedarse.

### 2.4 · Probarlo

Entra a la plataforma, abre cualquier pantalla y pulsa el botón de **Cemi**
abajo a la derecha. Escríbele *«qué programas hay»*.

**Cómo sé que salió bien:** contesta algo con sentido sobre el catálogo real.

**Cómo sé que NO salió bien:** contesta *«Ahorita no te puedo responder»* con
un aviso naranja debajo. Eso significa que la función está subida pero algo
falla — casi siempre la clave. Ve a **El asistente → Conversaciones**, abre la
conversación y ahí verás el error técnico exacto escrito debajo del mensaje.
Mándame esa línea.

---

## Paso 3 · WhatsApp (opcional, otro día)

Dos caminos. **Elige uno**, no hacen falta los dos.

### Camino A · La API oficial de Meta (es la que está montada)

**Ventajas:** no hay máquina que encender, no hay QR que reescanear, no se cae.
**Coste:** hay que dar de alta un número en Meta Business, y el número **no
puede ser uno que ya esté usando WhatsApp normal o WhatsApp Business en un
teléfono** — es la pega grande.

1. **developers.facebook.com** → **My Apps** → **Create App** → tipo
   **Business**.
2. Dentro de la app: **Add Product** → **WhatsApp** → **Set up**.
3. En **API Setup**, Meta te da un número de pruebas gratis. Copia el
   **Phone number ID** — es el que va en `WHATSAPP_PHONE_ID`.
4. En esa misma pantalla, en *«To»*, añade tu móvil como destinatario de
   pruebas y mete el código que te llega.
5. Copia el **token temporal** (dura 24 h; sirve para probar).
6. Vuelve a los secretos de Supabase y añade:

   | Secreto | De dónde sale |
   |---|---|
   | `WHATSAPP_TOKEN` | el token del punto 5 |
   | `WHATSAPP_PHONE_ID` | el Phone number ID del punto 3 |
   | `WHATSAPP_VERIFY_TOKEN` | **te lo inventas tú**: una palabra larga cualquiera. Sólo sirve para que Meta y nosotros nos reconozcamos |

7. En Meta: **WhatsApp → Configuration → Webhook → Edit**:
   - Callback URL:
     `https://vajbsfgojtunamhrzrpf.supabase.co/functions/v1/cem-whatsapp`
   - Verify token: la palabra que te inventaste
   - **Verify and save**
8. Debajo, en **Webhook fields**, suscríbete a **`messages`**. Sin eso Meta
   guarda el webhook pero no te manda nada, y parece que no funciona.

**Cómo sé que salió bien:** el paso 7 no da error. Si Meta dice *«The callback
URL couldn't be validated»*, es casi seguro que se quedó puesto el «Verify JWT»
del paso 2.3.

**Prueba:** escribe al número de pruebas desde tu móvil. Debe contestar.

**Para producción**, dos cosas más: cambiar el token temporal por uno
permanente (System User en Meta Business), y pasar la app de *Development* a
*Live*.

### Camino B · El número de siempre (Baileys)

Es lo que hace el bot del manual: se escanea un QR desde *Dispositivos
vinculados* y un programa mantiene abierta una sesión de WhatsApp Web.

**Ventaja:** sirve con el número que ya usas, sin dar de alta nada en Meta.
**Coste:** necesita una máquina encendida siempre. El manual lo documenta con
números: la laptop se dormía, **312 reconexiones en un día** y **1 h 46 min de
caída en plena hora de venta**. Y la carpeta de sesión se corrompe cada tanto y
hay que reescanear.

Si eliges éste, **no hay que reescribir el asistente**: ese puente sólo tiene
que llamar a `cem-asistente` igual que lo hace `cem-whatsapp`. Pero hay que
alquilar un servidor pequeño (5 €/mes basta) y montarlo ahí, nunca en un
portátil. Dímelo y lo preparo.

### Antes de encender WhatsApp: registra tu número

Si no, el asistente te tratará como a un desconocido y sólo te hablará del
catálogo. Entra a **El asistente → Ajustes → Mi WhatsApp** y registra tu
número. Eso es lo que le dice a la plataforma «esta línea es mía», y es lo
único que abre las cifras del centro por WhatsApp.

---

## Paso 4 · Que sepa cosas (para siempre, poco a poco)

Del catálogo se entera solo. De lo demás, no.

**El asistente → Lo que sabe → Enseñarle algo.** La regla para saber qué meter:
*cada cosa que el equipo se cansa de explicar por quinta vez es una ficha.*
Cómo se pide una constancia, qué pasa si alguien se atrasa con una cuota, si se
puede pagar en dos partes, dónde se ven las clases grabadas.

Escríbelo como se lo dirías a alguien nuevo del equipo, corto y concreto. **Lo
que no esté ahí, para el asistente no existe** — y eso es a propósito: es lo
que impide que se invente cosas.

---

## Resumen de lo que hay que tener a mano

| Qué | Dónde se consigue | Dónde se pone |
|---|---|---|
| `GROQ_API_KEY` | console.groq.com → API Keys | Supabase → Functions → Secrets |
| `WHATSAPP_TOKEN` | Meta → WhatsApp → API Setup | ídem |
| `WHATSAPP_PHONE_ID` | Meta → WhatsApp → API Setup | ídem |
| `WHATSAPP_VERIFY_TOKEN` | te la inventas | ídem, y la misma en Meta |

Y lo que sigue pendiente de antes, que no tiene que ver con el asistente pero
tampoco se ha hecho: **rotar la clave de Resend, la secreta de Stripe y la del
webhook de Stripe**.
