# El asistente del CEM

Son **dos asistentes con el mismo motor**. Uno atiende a los alumnos y otro al
equipo. Lo único que no comparten es lo que pueden ver, y eso no lo decide una
frase del guion: lo decide la base de datos.

Este documento explica cómo está montado, qué falta para encenderlo y qué
decisiones se tomaron a propósito —incluidas las que salieron del manual que
acompañó el encargo, que documenta 143 averías de un bot que ya está en
producción en otro negocio.

---

## 1 · Lo primero: la avería más cara del manual

El manual abre con esto: el servicio de atención 24/7 corría **dentro de un
portátil**. La máquina se dormía, la sesión de WhatsApp moría, y se midieron
**312 reconexiones en un día** y una caída de **1 h 46 min en plena hora de
venta** — el 58 % de la jornada fuera de línea.

Por eso aquí el asistente vive en una **función de servidor** (`cem-asistente`).
No se duerme, no se queda sin batería y no depende de que nadie deje el equipo
encendido. Es la primera decisión y condiciona todas las demás.

---

## 2 · Por qué un alumno no puede preguntar por otro

Esta es la parte que importa, y conviene entender por qué está montada así.

La forma fácil habría sido escribir en el guion «no des datos de otras
personas». Eso es defender el sistema con algo que **se puede convencer**: al
modelo se le insiste, se le da lástima, se le dice que es una emergencia, y a
la cuarta vez lo suelta. El manual documenta ese fallo exacto.

Aquí, en cambio:

- `cem-asistente` **nunca** usa la llave de servicio para leer datos de
  personas. Coge el token de quien pregunta y llama a `cem_bot_contexto` **con
  él**.
- `cem_bot_contexto` está declarada **sin** `security definer` — es la única
  función de la plataforma que lo está a propósito. Corre con los permisos de
  quien la llama, así que las reglas de fila se aplican igual que si esa
  persona consultara a mano.
- Un alumno que pida datos de otro recibe **cero filas antes de que el modelo
  vea nada**. No hay nada que convencer.

Y pedir «equipo» tampoco sirve: la función devuelve el ámbito que corresponde
al rol de quien pregunta, no el que se le pida. Un estudiante que escriba
`ambito: 'equipo'` desde la consola del navegador recibe el de alumno.

> Comprobado con las cuentas reales: Juan (alumno) ve su inscripción y ninguna
> cifra del centro; pidiendo `'equipo'` se le degrada a `'estudiante'`; Hillary
> no ve nada de Juan; el administrador sí ve las cifras.

---

## 3 · Las piezas

| Pieza | Qué hace |
|---|---|
| `cem-asistente` | El cerebro. Recibe la pregunta, arma el guion y llama al modelo. |
| `cem-whatsapp` | La puerta de WhatsApp. Mismo cerebro, otro canal. |
| `cem_bot_contexto(ambito)` | Qué puede ver quien pregunta. **Sin** `security definer`. |
| `cem_bot_conocimiento` | Lo que sabe: fichas de catálogo y lo que le enseñó el equipo. |
| `cem_bot_refrescar()` | El botón de «Actualizar lo que sabe». |
| `cem_bot_refrescar_ahora()` | Lo mismo sin comprobar rol — la llaman los disparadores. |
| `cem_bot_conversaciones` / `_mensajes` | La memoria y el registro de todo lo dicho. |
| `plataforma/assets/asistente.js` | La ventana de chat. Se monta desde `mount()`. |
| `plataforma/admin/asistente.html` | La sección del panel. |
| `plataforma/assets/mascota.svg` | La mascota, dibujada por `herramientas/dibujar-mascota.mjs`. |

Las tres tablas tienen RLS encendido y **cero políticas**: no se llega a ellas
más que por las funciones, y cada función comprueba primero quién llama.

---

## 4 · Que se entere solo cuando subimos un curso

Están las dos vías que se pidieron:

**Sola.** Hay disparadores en `cem_courses`, `cem_modules`, `cem_cohorts` y
`cem_metodos_pago`. Al publicar, cambiar el precio, añadir un módulo o abrir un
grupo, las fichas se regeneran en el acto.

Van `for each statement`, no por fila: publicar diez cursos de golpe regenera
una vez, no diez. Y van envueltos en su propio manejador de errores — **si la
ficha no se puede regenerar, el curso se publica igual**. Que el asistente se
quede con el catálogo de ayer es un problema pequeño; que no se pueda publicar
un programa por culpa del asistente sería grande, y de los que nadie relaciona
con su causa.

**A mano.** El botón «Actualizar lo que sabe», arriba a la derecha de su
pantalla.

### Lo que se escribe a mano no se pisa

Una ficha que genera la plataforma se puede editar. Al hacerlo pasa a ser
«escrita a mano» y los disparadores dejan de tocarla — si no, el siguiente
cambio de precio se llevaría por delante un texto que alguien afinó a
propósito, y nadie entendería por qué se perdió. La pantalla avisa antes de
editar, porque desde fuera parece que sólo se está corrigiendo una errata.

> Comprobado en los dos sentidos: se ensució una ficha automática y el
> disparador la reescribió; se editó a mano y el disparador la respetó.

---

## 5 · Lo que hay que hacer para encenderlo

Ahora mismo el asistente **está montado y no responde**: le falta desplegar la
función y darle una clave de modelo. Hasta entonces contesta con la frase de
cortesía y la pantalla marca el aviso de que algo va mal —que es exactamente lo
que tiene que hacer, pero no es estar encendido.

### a) Desplegar las funciones

Desde el panel de Supabase → Edge Functions, o con la CLI:

```
supabase functions deploy cem-asistente
supabase functions deploy cem-whatsapp
```

El código está en `supabase/functions/`.

### b) La clave del modelo

En Supabase → Edge Functions → Secrets:

| Secreto | Para qué |
|---|---|
| `GROQ_API_KEY` | La clave del proveedor del modelo. **Sin esto no habla.** |
| `CEM_ASISTENTE_MODELOS` | Opcional. La cadena de modelos, separados por coma. |

**No la pegues en el chat.** Se pone en esa pantalla, que la guarda cifrada del
lado del servidor, y desde aquí se puede comprobar que funciona sin verla.

Los modelos van en configuración y no escritos en el código porque el manual
documenta que el proveedor **retiró dos modelos sin avisar** y el bot se quedó
mudo con gente escribiendo. El valor por omisión es:

```
groq:llama-3.3-70b-versatile,groq:llama-3.1-8b-instant
```

Cuando haya un segundo proveedor, conviene mezclar familias: una cadena cuyos
eslabones son todos de la misma casa se cae entera el mismo día.

### c) WhatsApp

Hace falta decidir por dónde:

**La vía de la nube (la que está montada).** WhatsApp Cloud API, de Meta. Son
webhooks: no hay sesión que mantener, no hay QR que reescanear y no hay máquina
que encender. Requiere dar de alta un número en Meta Business y poner tres
secretos: `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_ID`. La
dirección del webhook es la de `cem-whatsapp`.

**La vía del manual (Baileys).** Es la que usa el bot que ya funciona: se
escanea un QR desde «Dispositivos vinculados» y un proceso mantiene abierta una
sesión de WhatsApp Web. Tiene una ventaja real —sirve con el número de siempre,
sin dar de alta nada— y dos costes que el propio manual documenta: la máquina
no se puede dormir, y la carpeta `auth/` se corrompe cada tanto y hay que
volver a escanear.

Si se elige ésa, **el cerebro no cambia**: ese puente sólo tiene que llamar a
`cem-asistente` igual que lo hace `cem-whatsapp`. Pero necesita un servidor
encendido siempre, no un portátil.

---

## 6 · Quién es quién por WhatsApp

Por WhatsApp no hay sesión. Lo único que llega es un número, y **un número no
es una contraseña**: Meta garantiza que el mensaje salió de esa línea, y nada
más. Quien tenga el teléfono en la mano *es* esa línea.

Así que la regla es:

1. **El número está registrado** → esa persona, con el ámbito con que se
   registró.
2. **El número casa con una sola cuenta activa** → esa persona, y siempre como
   alumno, aunque sea del equipo.
3. **Cualquier otra cosa** → anónimo: sólo catálogo y cómo inscribirse.

El caso 3 incluye a propósito que el número case con **dos** cuentas. Dos
cuentas con el mismo teléfono es un dato sucio, no una identidad, y ante la
duda no se enseña nada de nadie.

> Comprobado con los tres casos: número único → reconoce a la persona; número
> repetido → no reconoce a nadie y la conversación no le apunta a ninguno;
> número desconocido → sólo catálogo.

Las cifras del centro por WhatsApp **no se dan por tener un rol**. Hace falta
que esa persona, ya dentro de la plataforma y con su sesión abierta, registre
su número en El asistente → Ajustes → Mi WhatsApp. Es la diferencia entre «este
número parece de fulano» y «fulano dijo que es suyo».

---

## 7 · La mascota

El bicho de la lámina —gris, peludo, con birrete de arcoíris y sudadera azul—
está dibujado en `plataforma/assets/mascota.svg`, y sale de un programa:
`herramientas/dibujar-mascota.mjs`. El contorno peludo es una elipse con el
radio modulado por tres senos de frecuencias distintas; con una sola frecuencia
parece un engranaje.

Hay dos archivos del mismo dibujo: el bicho entero y la cara recortada, que es
lo que se ve en el botón del chat. A 44 píxeles el cuerpo entero es una mancha
gris con una raya azul; lo que se reconoce a ese tamaño son los ojos, la
sonrisa y el birrete.

**Pero no es el render.** La lámina de la casa es una imagen tridimensional con
pelo real, sombras y tela. Un SVG no llega ahí, y fingir que sí sería mentir.
El dibujo es lo que se ve **mientras no esté subido el original**.

Para que se vea exactamente igual hay que subir el PNG: El asistente → Ajustes
→ Su cara. En cuanto esté, la plataforma lo usa en el botón, en cada respuesta
y en su pantalla, y el dibujo deja de aparecer.

---

## 8 · Decisiones que parecen detalles y no lo son

**El hueco de datos se declara, no se omite.** Si el catálogo llega vacío, el
guion no se queda corto: dice explícitamente «no tienes el catálogo, tienes
prohibido decir precios» y le da la frase de espera ya escrita. El manual
documenta que con el catálogo vacío el modelo se inventó precios **un 85 % por
encima** del real, con total naturalidad.

**El filtro de salida existe aparte del guion.** El guion es una preferencia;
el filtro es la garantía. Todo lo que se prohíbe y se puede detectar por texto
—los signos de apertura, las frases que delatan al modelo— se limpia también en
código antes de enviar.

**`reasoning_effort: 'low'`.** Los modelos que razonan gastan el presupuesto de
respuesta razonando y devuelven contenido **vacío sin lanzar error**. El cliente
no recibe nada y el bot parece colgado.

**La cadena nunca termina en silencio.** Si se agotan todos los modelos, se
manda una frase de cortesía y **se marca la respuesta como degradada**. La
pantalla enseña ese aviso. Sin él, la única señal de que el asistente está
caído sería que empieza a contestar raro, y eso se descubre tarde y por un
cliente.

**Se guarda después de responder, nunca antes.** Confirmar antes de completar
convierte cualquier caída en pérdida definitiva.

**No hay botón de borrar conversaciones.** Lo que dijo el asistente es la única
prueba de lo que dijo el asistente.

**El hilo no se recorta para ahorrar.** Para eso está el tope de la pregunta.
Recortar el hilo degrada la conversación en silencio: el asistente vuelve a
preguntar lo que le acaban de decir.

---

## 9 · Lo que todavía no está

- **Desplegar las dos funciones** y poner `GROQ_API_KEY`. Sin esto no habla.
- **Decidir la vía de WhatsApp** y dar de alta el número.
- **Subir el render de la mascota**, para que se vea exactamente igual.
- **Alimentarlo poco a poco**, que era el plan: cada cosa que el equipo se
  cansa de explicar es una ficha en «Lo que sabe».
- Las pruebas de navegador (`pruebas/casos/asistente.mjs`) están escritas pero
  **no se han podido correr**: necesitan las cuentas `@pruebas.local`, que
  ahora mismo no están sembradas.
