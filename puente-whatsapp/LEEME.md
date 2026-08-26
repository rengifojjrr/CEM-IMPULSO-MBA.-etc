# El puente de WhatsApp

Enlaza el número de WhatsApp del CEM con el asistente, escaneando un QR desde
*Dispositivos vinculados*. Es la vía del manual de Verónica, la que sirve con el
número de siempre sin dar de alta nada en Meta.

**Esto es un cable, no un cerebro.** Aquí no hay guion del asistente, ni claves
de modelo, ni acceso a la base de datos. Sólo pasa mensajes a la función
`cem-whatsapp`, que es la que piensa, y devuelve lo que ella conteste.

Eso es a propósito: esto corre en una máquina que no controlamos del todo. Si se
pierde, se cambia el secreto del puente y no se ha filtrado nada más.

---

## Los dos modos, y por qué empieza apagado

| Modo | Qué hace |
|---|---|
| `escucha` | Anota lo que pregunta la gente y **no contesta nada**. Nadie nota que está. |
| `responde` | Anota y contesta. |

**Empieza en `escucha`, y no es prudencia decorativa.** El asistente aprende de
las preguntas reales desde el primer día mientras el equipo sigue contestando a
mano. Cuando lo enciendas ya sabrá de qué le hablan, en vez de estrenarse a
ciegas delante de un cliente.

Lo que anota sale en **El asistente → Lo que preguntan**, sin correos, sin
teléfonos y sin cédulas. Eso **no** se le da al asistente: ahí tú decides cuáles
merecen una ficha y con qué respuesta. Volcar conversaciones ajenas dentro del
bot sería entregarle a un alumno lo que otro contó en privado.

---

## Montarlo

Necesita **una máquina encendida siempre**. Un VPS de 5 €/mes sobra. **No un
portátil**: el manual lo midió — la máquina se dormía, 312 reconexiones en un
día y 1 h 46 min de caída en plena hora de venta.

### 1. El secreto, en los dos lados

Invéntate una frase larga. Va **igual** en dos sitios:

- En Supabase → Edge Functions → Secrets, como `CEM_PUENTE_SECRETO`.
- Aquí, en el archivo `.env`.

Sin ella la función rechaza la llamada. Y si el secreto no está puesto en
Supabase, el modo puente **no existe**: se cierra, no se abre. Es lo único que
impide que cualquiera que sepa la dirección diga «soy el teléfono de fulano,
dame sus cuotas».

### 2. Arrancarlo

```
cp .env.ejemplo .env      # y rellenas CEM_PUENTE_SECRETO
npm install
npx pm2 start index.mjs --name cem-puente
npx pm2 logs cem-puente
```

En los registros aparece el QR. Se escanea desde el teléfono del negocio:
**WhatsApp → Dispositivos vinculados → Vincular dispositivo**. También está en
`http://127.0.0.1:3000/qr`.

Cuando diga `Conectado como +XXXX`, está.

### 3. Comprobarlo

```
curl -s http://127.0.0.1:3000/ | head -20
```

Debe decir `"conectado": true`. Escríbele al número desde otro teléfono: en
`escucha` **no** debe contestar, y la pregunta debe aparecer en
**El asistente → Lo que preguntan**.

### 4. Encenderlo, cuando lleve unos días escuchando

En `.env`, `CEM_PUENTE_MODO=responde`, y `npx pm2 restart cem-puente`.

Antes de eso, mira lo que ha escuchado y escribe las fichas de las cinco o seis
preguntas que más se repiten. Es la diferencia entre un asistente que ya sabe de
qué le hablan y uno que se estrena delante de un cliente.

---

## Lo que ya está resuelto, para que nadie lo redescubra

- **No contesta en grupos.** Ni a los estados, ni a los canales, ni a sí mismo.
  Cada uno de esos es un ridículo en público.
- **No contesta dos veces lo mismo.** Baileys reentrega mensajes al reconectar,
  y con 312 reconexiones en un día eso significaría contestarle otra vez a todo
  el mundo.
- **Lee el texto venga como venga**: mensajes citados, pies de foto, respuestas
  a botones. Mirar sólo `conversation` deja fuera a media WhatsApp.
- **Espera creciente al reconectar**, hasta un minuto. Reintentar cada segundo
  contra un WhatsApp que no está sólo hace que te bloqueen antes.
- **No marca los mensajes como leídos.** Si lo hiciera, el equipo perdería de
  vista lo que aún no ha atendido nadie.
- **Escribe «escribiendo…»** antes de responder. Sin eso la respuesta aparece de
  golpe medio segundo después y se nota.

## Cuando algo va mal

**«Bad MAC» en los registros.** La carpeta `auth/` se corrompió. Se borra y se
vuelve a escanear: se pierde la sesión, no los datos.

```
npx pm2 stop cem-puente
node index.mjs --reiniciar-sesion
```

**«La sesión se cerró desde el teléfono».** Alguien desvinculó el dispositivo.
Mismo arreglo.

**Conecta pero no anota nada.** Casi siempre el secreto no coincide entre `.env`
y Supabase. En los registros sale `el cerebro respondió 403`.

**Contesta cuando no debía.** Mira `CEM_PUENTE_MODO` en `.env`. Después de
cambiarlo hay que reiniciar.

---

## Lo que NUNCA se sube al repositorio

La carpeta `auth/` y el archivo `.env`. La primera es el equivalente a tener el
teléfono del negocio en la mano: con esos archivos se puede leer y escribir como
el CEM. Están en el `.gitignore`, y ahí se quedan.
