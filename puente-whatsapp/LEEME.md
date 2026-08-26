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

## Por WhatsApp se llama Verónica

En la plataforma el asistente es **Cemi**: se ve la mascota y se sabe que habla
la casa. Por WhatsApp entra en la agenda de la persona como un nombre de pila,
así que ahí se llama **Verónica**.

El nombre **no está escrito en el código**: sale de **Configuración**, en la
clave `asistente_nombre_whatsapp`. Cambiarlo no necesita desplegar nada. Si un
día se borra, se cae al nombre de la web.

Conviene tener claro lo que eso implica: quien escriba a Verónica va a creer,
razonablemente, que hay una persona al otro lado. Lo que sostiene esa decisión
es que **en cuanto alguien pida hablar con una persona —o dude—, el asistente no
lo discute: avisa al equipo de verdad** (no dice que va a avisar: llama a la
herramienta, y si la llamada falla, el servidor la cumple igual). Y que por este
canal el asistente **no puede consultar ni cambiar los datos de nadie**: sólo
hablar de los programas y avisar.

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
cd puente-whatsapp
cp .env.ejemplo .env      # y rellenas CEM_PUENTE_SECRETO
npm install
npx pm2 start index.mjs --name cem-puente
npx pm2 logs cem-puente
```

Nada más arrancar, los registros dicen si el secreto coincide. Si sale
`EL SECRETO NO COINCIDE`, párate ahí: el puente se conectaría a WhatsApp y no
anotaría nada.

### 3. Escanear el QR

Abre **`http://127.0.0.1:3000/qr`**: ahí sale el código dibujado, y la página se
recarga sola porque WhatsApp lo caduca cada pocos segundos. Se escanea desde el
teléfono del negocio: **WhatsApp → Dispositivos vinculados → Vincular
dispositivo**.

En un servidor sin navegador, un túnel desde tu máquina:

```
ssh -L 3000:127.0.0.1:3000 usuario@servidor
```

y abres esa dirección en tu propio navegador.

El QR también sale pintado en `npx pm2 logs cem-puente`, pero **es el último
recurso**: con caracteres de bloque, según la fuente y los colores del terminal
el teléfono no lo lee.

Cuando diga `Conectado como +XXXX`, está.

### 4. Comprobarlo

```
curl -s http://127.0.0.1:3000/ | head -20
```

Debe decir `"conectado": true` y `"secreto": "bien"`. Escríbele al número desde
otro teléfono: en `escucha` **no** debe contestar, y la pregunta debe aparecer
en **El asistente → Lo que preguntan**.

### 5. Encenderlo, cuando lleve unos días escuchando

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
- **El QR se dibuja de verdad** en `/qr`, no se escupe el texto para que lo
  pegues en otro sitio. El de la terminal queda de último recurso: con
  caracteres de bloque, muchos terminales lo dejan ilegible.
- **Se instala lo que se probó.** El `package-lock.json` está subido. Sin él,
  `npm install` traía la última de Baileys y el puente moría al arrancar con
  «useMultiFileAuthState is not a function» — pasó de verdad, con la 6.7.24.
  Para actualizar a propósito: `npm update && npx pm2 restart cem-puente`.

## Cuando algo va mal

**«Bad MAC» en los registros.** La carpeta `auth/` se corrompió. Se borra y se
vuelve a escanear: se pierde la sesión, no los datos.

```
npx pm2 stop cem-puente
node index.mjs --reiniciar-sesion
```

**«La sesión se cerró desde el teléfono».** Alguien desvinculó el dispositivo.
Mismo arreglo.

**Conecta pero no anota nada.** El secreto no coincide entre `.env` y Supabase.
Ahora se avisa al arrancar (`EL SECRETO NO COINCIDE`) y se ve en
`curl http://127.0.0.1:3000/`, en el campo `secreto`. Ojo: desde aquí no se
distingue «mal puesto» de «no puesto en Supabase» — los dos dan 403, y tienen
que estar los dos lados.

**«useMultiFileAuthState is not a function», o algo parecido, al arrancar.**
Baileys cambió de forma en una actualización. Pasó con la 6.7.24. Los `import`
de arriba del archivo son la forma documentada; si vuelve a cambiar, el puente
lo dice con todas las letras en vez de reventar a mitad.

**Pide el QR cada vez que arranca.** La carpeta `auth/` no es la misma entre
arranques. Ahora se crea siempre junto al archivo, no donde estuvieras al
lanzarlo, así que esto sólo debería pasar si cambiaste `CEM_PUENTE_AUTH`.

**Contesta cuando no debía.** Mira `CEM_PUENTE_MODO` en `.env`. Después de
cambiarlo hay que reiniciar.

---

## Lo que NUNCA se sube al repositorio

La carpeta `auth/` y el archivo `.env`. La primera es el equivalente a tener el
teléfono del negocio en la mano: con esos archivos se puede leer y escribir como
el CEM. Están en el `.gitignore`, y ahí se quedan.
