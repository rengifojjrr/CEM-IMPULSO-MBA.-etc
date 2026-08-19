# Los vídeos y quién puede copiarlos

Este documento existe para responder una pregunta concreta y no dejarla a medias:
**¿qué impide que alguien que pagó el curso se lleve los vídeos y los reparta?**

La respuesta honesta tiene tres partes: lo que ya está hecho, lo que no se puede
hacer mientras los vídeos vivan en YouTube, y qué habría que cambiar el día que
eso importe de verdad. Está en ese orden a propósito.

---

## 1 · Lo que ya está hecho

### El reproductor es de la casa, no de YouTube

Un `<iframe>` de YouTube normal trae encima **su** interfaz: el título del vídeo,
el nombre del canal, el botón «Mirar en YouTube», el menú de compartir y el de
copiar el enlace. Eso no es un detalle estético — es una invitación, puesta por
Google, a salirse de la plataforma. Y fuera de la plataforma no hay marca de
agua, no hay registro de quién vio qué, y no hay ninguna razón para haber pagado.

`plataforma/assets/reproductor.js` hace lo contrario. Le quita a YouTube todos
sus controles (`controls: 0`, `disablekb: 1`, `fs: 0`, `modestbranding: 1`) y
—esto es lo que de verdad importa— deja su marco **sin recibir un solo evento de
ratón** (`pointer-events: none`). YouTube dibuja su interfaz cuando detecta el
ratón encima del vídeo; si no le llega ningún evento, no se entera de que hay
nadie y no dibuja nada. No es un parche que tape: es que no llega a existir. Y su
menú del clic derecho —el que ofrece «Copiar vínculo»— tampoco, porque el clic
derecho no llega hasta él.

Encima va además una lámina transparente, pero ya sólo para recoger el clic de
reproducir y pausar.

> **Cómo se aprendió esto.** Al principio la defensa era la lámina, y se paraba
> justo antes de la franja de los mandos para no pelearse con la barra de
> tiempo. Entre su borde y el de los mandos quedaba **un píxel** de vídeo al
> descubierto, a todo lo ancho — y se cruzaba cada vez que alguien bajaba el
> ratón hacia los controles. Un píxel bastaba para que saliera el título, el
> canal, el logo de YouTube y el menú de copiar el enlace. Tapar con un
> rectángulo es un argumento de geometría, y la geometría se rompe sola en
> cuanto alguien cambia un alto. La prueba de `pruebas/casos/video.mjs` recorre
> ahora el recuadro **píxel a píxel**, precisamente porque un muestreo cómodo
> pasaba por encima de esa fila y devolvía verde.

Encima de la lámina van los mandos de la casa —reproducir, barra de tiempo,
±10 segundos, silenciar, ajustes y pantalla completa— hablando con el
reproductor por su API. Para quien mira, el vídeo se comporta como cualquier
reproductor. Lo que no aparece por ningún lado es el camino a YouTube.

Detrás de la rueda dentada están **velocidad** (de 0,25× a 2×), **calidad**,
**subtítulos** y **volumen**. Estaban en el menú de YouTube que se quitó, y
quitarlos no era el objetivo: el objetivo era el botón que llevaba a YouTube.
Lo que se elige se recuerda en el navegador, así que quien estudia a 1,25× no
tiene que volver a ponerlo en cada lección.

Dos decisiones ahí que conviene saber:

- **La calidad es una petición, no una orden.** YouTube sirve el vídeo por
  tramos y elige el tramo según la conexión de cada uno; si no da, la baja por
  su cuenta y no avisa. Por eso el panel enseña la calidad que hay puesta de
  verdad y no la que se pidió, y lo dice con palabras. Un selector que jurara
  «1080p» mientras se ve 480p sería peor que no tener selector. Si YouTube no
  ofrece ninguna calidad todavía —porque el vídeo aún no ha empezado a
  cargar—, la sección no aparece en vez de aparecer vacía.
- **Los subtítulos no se apagan solos.** Quien los lleva puestos en YouTube
  puede necesitarlos, y apagárselos de oficio sería quitarle una ayuda sin
  preguntarle. Hay tres opciones —como los tenga en YouTube, activados,
  desactivados— y sólo mandamos sobre YouTube cuando alguien elige.

En los cortos del Aprendizaje Express los mandos van reducidos —sólo
reproducir, barra y tiempo— igual que ya iban sin silenciar ni pantalla
completa: son clips de un minuto en vertical y la barra no da para más.

Resultado, punto por punto:

| | |
|---|---|
| Título del vídeo | no se ve |
| Nombre del canal | no se ve |
| Botón «Mirar en YouTube» | no se ve |
| Menú de compartir / copiar enlace | no existe |
| Clic derecho | no ofrece nada |
| Atajos de teclado de YouTube | desactivados |
| Marca de agua a pantalla completa | **sigue puesta** |

Lo de la pantalla completa merece una línea. El que se pone a pantalla completa
es **nuestro** recuadro, no el `<iframe>`. Si fuera el `<iframe>`, la marca de
agua se quedaría fuera de la pantalla y el momento de mayor riesgo —vídeo grande,
grabando— sería justo el único sin firmar.

### La marca de agua

Sobre cada vídeo va el nombre y el correo de quien está mirando. No impide
grabar la pantalla: **impide grabarla sin firmarla**. Un vídeo que aparece
repartido lleva escrito de qué cuenta salió, y eso convierte un problema técnico
sin solución en un problema disciplinario con nombre y apellido.

Es, con diferencia, la medida más eficaz de todo este documento — precisamente
porque no intenta impedir nada.

### El registro de reproducción

`cem_reproducciones` guarda quién reprodujo qué y qué día. Sirve para el
progreso, pero también para lo otro: una cuenta que reproduce el curso entero en
una tarde no está estudiando.

---

## 2 · Lo que NO se consigue, y hay que decirlo

**Quien abra las herramientas de su navegador va a encontrar el identificador del
vídeo.** No hay manera de evitarlo mientras el vídeo esté en YouTube: el
navegador tiene que pedirle el vídeo a Google, así que tiene que saber cuál es.
Está en la petición, esté donde esté escrito.

Y con ese identificador, cualquiera arma el enlace de YouTube a mano y ve el
vídeo fuera de la plataforma, sin marca de agua y sin registro.

Conviene ser claro sobre qué significa eso:

- **Detiene** a quien se despista, a quien comparte por comodidad y a quien lo
  intentaría si fuera un clic.
- **No detiene** a quien sabe lo que hace y quiere hacerlo.

Los vídeos están en YouTube como **no listados**, así que nadie los encuentra
buscando. Pero «no listado» significa exactamente eso: quien tiene el enlace,
entra. No hay contraseña, no hay comprobación de quién eres, y un enlace no
listado que se filtra ya no se puede «desfiltrar» — sólo se puede borrar el
vídeo y volver a subirlo con otro identificador.

Tampoco hay nada —aquí ni en ninguna plataforma del mundo, con DRM o sin él— que
impida grabar la pantalla o apuntar un teléfono a un monitor. Por eso la marca de
agua no es un premio de consolación: es la única respuesta real que existe a ese
caso concreto.

### Lo que no se hizo, a propósito

Hay una familia de trucos que parecen seguridad y no lo son. Ninguno está puesto,
y no conviene ponerlos:

- **Bloquear F12 o el clic derecho «de verdad»** (más allá de que el menú no
  ofrezca nada). Se salta desde el menú del navegador, y molesta a gente honesta.
- **Ofuscar el identificador en el JavaScript.** Está igualmente en la petición
  de red. Añade complicación al código y cero dificultad al que mira.
- **Trocear el vídeo o servirlo «por partes» desde la plataforma.** Con YouTube
  de por medio no cambia nada, y sin YouTube ya hay servicios que lo hacen mejor
  (abajo).

Poner cualquiera de esas cosas tiene un coste peor que su beneficio: da la
sensación de que el problema está resuelto. No lo está, y quien decida sobre el
negocio tiene que saberlo.

---

## 3 · Lo que sí lo arregla, el día que importe

La única forma de que un enlace filtrado **no sirva** es que el vídeo no viva en
YouTube, sino en un servicio que sepa decir *«este vídeo sólo se reproduce dentro
de nuestro dominio, y sólo con un permiso que caduca»*.

Eso se llama **reproducción restringida por dominio** con **enlaces firmados**, y
lo tienen varios servicios. Con eso puesto, el identificador del vídeo sigue
estando a la vista en el navegador — y da igual: pegado en otro sitio, no
reproduce nada.

### Las tres opciones razonables

| | Cómo cobra | Restringe por dominio | Notas |
|---|---|---|---|
| **Bunny Stream** | $0,01/GB guardado al mes + $0,005/GB servido | sí (*hotlinking protection* + *token authentication*) | el más barato con diferencia; reproductor propio incluido |
| **Cloudflare Stream** | $5 por 1.000 minutos guardados al mes + $1 por 1.000 minutos servidos | sí (enlaces firmados y dominios permitidos) | cobra por minuto, no por GB: el precio no depende de la calidad |
| **Vimeo Pro** | cuota fija por plan | sí (privacidad por dominio) | el más caro por vídeo servido, pero sin sorpresas en la factura |

*(Tarifas de lista consultadas el 19-08-2026. Confírmalas antes de decidir: son
lo que cambia primero.)*

### Un ejemplo con números

Un curso de **30 lecciones de 20 minutos** (600 minutos, unos 15 GB en HD) que
ven **100 estudiantes enteros**:

- **Bunny** — guardar: 15 GB × $0,01 = **$0,15/mes**. Servir: 100 × 15 GB =
  1.500 GB × $0,005 = **$7,50**, una sola vez por cohorte.
- **Cloudflare** — guardar: 600 min ÷ 1.000 × $5 = **$3/mes**. Servir:
  100 × 600 = 60.000 min ÷ 1.000 × $1 = **$60** por cohorte.
- **YouTube** — **$0**.

Los tres son asumibles. Y ese es el punto: **la decisión no es de dinero**. La
diferencia entre $0 y unos pocos dólares por cohorte no decide nada; lo que
decide es cuánto duele que el curso circule por WhatsApp.

Compárese con la razón por la que se eligió YouTube en su día, que sí era de
dinero: [`youtube.md`](youtube.md) explica que los mismos 15 GB en Supabase
Storage salían por unos 300 € al año, más el ancho de banda. Frente a eso,
YouTube ganaba por goleada. Frente a Bunny, no.

### Cuánto costaría el cambio, en trabajo

Poco, y a propósito. El reproductor se escribió con esta mudanza en mente:

1. **`plataforma/assets/reproductor.js` es la única costura.** Toda la
   plataforma monta vídeo llamando a `crearReproductor(host, {...})`. Cambiar el
   servicio es reescribir el interior de ese archivo respetando lo que devuelve
   (`segundo()`, `duracion()`, `saltarA()`, `jugando()`, `reproducir()`,
   `pausar()`, `destruir()`). Las pantallas no se tocan.
2. **La marca de agua, los mandos, la lámina y el registro no cambian**: son
   nuestros, no de YouTube.
3. **En la base de datos** hay que guardar el identificador del nuevo servicio
   junto al de YouTube, no en su lugar — así conviven durante la mudanza y no
   hay un día en que nada funciona. Hoy el identificador sale de
   `l.video_id || idDeYoutube(l.url)` en el aula.
4. **Los enlaces firmados se firman en el servidor**, nunca en el navegador: una
   función que reciba «esta persona, esta lección» y devuelva un permiso corto
   sólo si esa persona está matriculada y al día. Ahí es donde el control de
   acceso deja de ser decoración y pasa a ser real: el permiso no se emite si no
   se ha pagado.
5. **Subir los vídeos otra vez.** Es lo más lento, y no lo hace el código.

Lo que **no** se resuelve ni así, para que quede dicho una tercera vez: la
grabación de pantalla. Ahí sigue mandando la marca de agua.

---

## 4 · Qué hacer hoy

Nada urgente. La situación actual es defendible:

- el camino fácil a YouTube está cerrado;
- lo que se lleven va firmado con el nombre de quien se lo llevó;
- y queda registro de quién reprodujo qué.

Lo que conviene es **no engañarse**: si algún día aparece una lección del curso
circulando por ahí, la respuesta no es endurecer más el reproductor —ya está
todo lo endurecido que puede estar con YouTube detrás—. La respuesta es la
mudanza del apartado 3, y el trabajo está descrito arriba para que ese día sea
una tarde y no un proyecto.
