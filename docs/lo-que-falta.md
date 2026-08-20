# Lo que falta

Estado a **19 de agosto de 2026**. Las cifras salen de mirar la base, no de
memoria; si algo aquí no cuadra con lo que ves, gana lo que ves.

Está ordenado por lo que cuesta que salga mal, no por lo que cuesta hacerlo.

---

## 1 · Lo que sólo puedes hacer tú

Nada de esto lo arregla el código: hacen falta cuentas, dinero o material.

### 1.1 · El correo no sale — **26 avisos parados**

No hay proveedor de correo configurado. Los avisos se encolan y **no se pierden**,
pero tampoco salen: ahora mismo hay 26 esperando.

Esto es lo primero de la lista por una razón concreta: la escalera de cobro
—aviso a −3 días, el día del vencimiento, +3, +15, +30, y a los 60 pasa a
cobranza— se construyó entera este mes y **depende de que el correo salga**. Sin
proveedor, es un motor girando en vacío.

→ **Hablar con la gente → Envío de correo**, dar de alta Resend y pegar la clave.

### 1.2 · Dos formas de pago activas sin dónde pagar

Se le ofrecen al estudiante y no le dicen a dónde mandar el dinero:

| Método | Qué le falta |
|---|---|
| **Zelle** | titular y correo/teléfono de destino |
| **PayPal** | la cuenta de destino |

Las otras cinco —efectivo en dólares, efectivo en euros, pago móvil,
transferencia y tarjeta— están completas.

→ **Cobrar → Formas de pago**. Un método sin destino es peor que un método
apagado: el estudiante lo elige y se queda parado.

### 1.3 · Stripe — falta un despliegue

**Hecho el 19 de agosto de 2026:** cuenta activada (`charges_enabled`), claves
de **prueba** guardadas en `cem_integraciones`, webhook creado
(`we_1U6FEZFkx2xaEpJdWfRom5u4` → `checkout.session.completed`) y su secreto
guardado. La verificación de firma se comprobó de punta a punta: acepta la firma
buena y rechaza la falsificada, la ausente y una legítima reenviada una hora
después.

**Lo que falta, y bloquea el primer cobro:**

```bash
supabase functions deploy cem-stripe-checkout --project-ref vajbsfgojtunamhrzrpf
```

La función viva es la versión 1 y envía `payment_method_types`, que las cuentas
con **Managed Payments** —activado por defecto en las nuevas— rechazan en vez de
ignorar. El primer «pagar con tarjeta» daría un 502. La corrección está en el
repositorio desde el commit `a36bcf4`, sin desplegar.

Después: un cobro de prueba de punta a punta con la tarjeta
`4242 4242 4242 4242`, y comprobar que la cuota queda pagada sola.

Y cuando se vaya a cobrar de verdad: claves `pk_live_`/`sk_live_`, un webhook
nuevo en modo real —el secreto es distinto— y pasar el modo a `real` desde la
pantalla, que comprueba que la clave y el modo coincidan.

**Ojo con el catálogo al pasar a real:** los productos de Stripe viven en un
modo o en el otro. Los ocho de ahora son de prueba; en real hay que volver a
reflejarlos. Se hace de una vez:

```sql
update cem_courses set stripe_product_id = null;   -- olvida los de prueba
select cem_stripe_producto_reflejar(id) from cem_courses;
```

### 1.4 · 17 lecciones con vídeo de mentira

De las 53 lecciones que hay, **17 llevan identificadores de relleno** (`DEMO…`)
del catálogo de ejemplo: MBA, los Diplomados. No rompen nada —el aula enseña un
aviso limpio en vez de romperse— pero quien entre ahí no verá ningún vídeo.

Hay dos caminos, y son decisión tuya:

- **Subir el material de verdad** y emparejarlo en *Dar clase → Vídeos del
  curso*, que ya empareja por título y propone.
- **Dejarlos en blanco**, para que se note que están pendientes en vez de
  parecer contenido roto.

Si quieres lo segundo, es una orden de una línea; dímelo y lo hago.

---

## 2 · Lo que falta en el producto

Cosas que sí son trabajo de código, ordenadas por lo que cambian.

### 2.1 · El vídeo se puede seguir sacando (lo grande)

Todo lo que se hizo estas semanas —quitarle a YouTube su interfaz, la portada
propia, la banda de la pausa, la marca de agua— **cierra el camino fácil**. No
cierra el otro: quien abra las herramientas del navegador encuentra el
identificador del vídeo, y con él lo ve fuera de la plataforma.

Eso no se arregla con más reproductor. Se arregla mudando los vídeos a un
servicio que sepa decir «esto sólo se reproduce dentro de nuestro dominio».
Está todo calculado —opciones, precios y el trabajo que costaría— en
[`videos-y-copia.md`](videos-y-copia.md). Resumen: **Bunny Stream, unos $8 por
cohorte de 100 alumnos**, y el cambio es una tarde porque `reproductor.js` es la
única costura.

**Recomendación: no antes de ver que se está filtrando.** Pero ten el número a
mano, porque el día que pase la pregunta será «¿cuánto tarda?».

### 2.2 · Los cortos del Express van con mandos de menos

En el Aprendizaje Express la barra sólo trae reproducir, la barra de tiempo y el
reloj. No hay silenciar, ni pantalla completa, ni la rueda de ajustes con
velocidad y calidad. Se decidió así cuando eran clips de un minuto en vertical y
la barra no daba para más.

Ahora que los usas de verdad, puede que la calidad sí haga falta ahí. Es un
cambio pequeño.

### 2.3 · Un corto apaisado se ve con franjas

El marco del Express es 9:16 fijo. Un vídeo vertical entra perfecto; uno
apaisado entra encajado entre dos franjas negras. La plataforma **no puede saber
la proporción de un vídeo antes de reproducirlo** —YouTube no la dice por la
API—, así que hoy no hay forma de adaptarse solo.

Se arregla guardando la proporción al añadir el corto (una casilla
«vertical / apaisado» en la pantalla de vídeos express). Media hora.

### 2.4 · Los subtítulos no dejan elegir idioma

Hay tres opciones —como los tengas en YouTube, activados, desactivados— pero si
un vídeo trae varias pistas no se puede escoger cuál. Para un curso en un solo
idioma no importa; el día que haya material en dos, sí.

### 2.5 · Nadie prueba que un vídeo se reproduzca de verdad

Las 625 comprobaciones automáticas miran el reproductor entero —los mandos, la
lámina, la portada, la marca de agua, el registro— pero **no pueden ver un vídeo
reproduciéndose**: YouTube rechaza el «embed» desde `localhost`, así que en el
entorno de pruebas ningún vídeo arranca nunca.

Consecuencia práctica: lo que sólo ocurre con el vídeo sonando —la lista de
calidades, el cartel de la pausa, el registro de reproducción real— se comprueba
mirando, no automáticamente. Es la razón por la que estos días varios fallos los
viste tú antes que la suite.

Se arregla publicando el entorno de pruebas en un dominio de verdad, o
autorizando `localhost` en el canal. No es gratis ni inmediato, pero es el
agujero de cobertura más grande que hay.

### 2.6 · Un PDF no enseña su primera página

La biblioteca ya es un catálogo: una imagen enseña la imagen y un vídeo enseña
su miniatura con el triángulo encima. **Un PDF y una hoja de cálculo no**: salen
con el icono de su tipo sobre un fondo tenue.

Se intentó incrustar el PDF en la ficha y dejar que lo pintara el navegador.
Suelto funciona; dentro de la cuadrícula sale un rectángulo gris. El visor de
PDF fija su escala en el momento en que carga, y ahí la ficha todavía no tiene
su tamaño final, así que el resultado depende de la versión del navegador y del
orden en que se pinte la pantalla. Una miniatura que sale bien unas veces y no
otras es peor que ninguna, así que se quitó.

La forma correcta es **generar la miniatura una sola vez, al subir el archivo**:
se dibuja la primera página en un lienzo, se guarda como imagen junto al
documento y la ficha pasa a enseñar un `<img>` como todas las demás. Sale más
rápido —no hay un visor por ficha—, se ve igual en todos los navegadores y
funciona también en el móvil.

Qué haría falta: una columna `miniatura_url` en `cem_media`, la generación en el
navegador al subir (con `pdf.js`, que es la única dependencia nueva) y un repaso
de los PDF que ya están subidos. De las hojas de cálculo no hay forma sin un
servidor que las convierta, y ahí el icono es la respuesta correcta.

### 2.7 · Subrayar dentro de un documento

Una lección que no es vídeo ya no se pinta dentro del marco negro del
reproductor: se abre como documento, a una altura de lectura, con «abrir aparte»
y «descargar», y con un recordatorio de que los apuntes van en la pestaña **Mis
notas**.

Lo que **no** está es subrayar dentro del PDF. Para eso hay que dejar de
incrustar el archivo y pasar a dibujarlo con `pdf.js`: sólo así se puede saber
sobre qué palabra cayó el ratón, guardar la marca (página, coordenadas, color) y
volver a pintarla al abrirlo. Es una pieza aparte —visor propio, tabla de
marcas, y decidir si se comparten o son privadas—, no un ajuste.

Mientras tanto los apuntes por lección sí funcionan, y son privados.

---

## 3 · Deuda que conviene mirar, aunque hoy no duela

### 3.1 · 88 funciones del servidor abiertas a quien no ha entrado

De las 176 funciones `cem_*`, **88 las puede llamar un visitante sin cuenta**, y
82 de esas se ejecutan con permisos de dueño (`security definer`).

Eso **no significa que haya un agujero**: casi todas comprueban por dentro quién
llama, o son de cosas públicas —el catálogo, el formulario de contacto— que
tienen que ser abiertas. Postgres las deja abiertas al crearlas, y esa es la
trampa: no es una decisión que alguien tomó, es lo que pasa si nadie decide.

Ya existe la pantalla que las lista (**Gobierno → Seguridad de mi cuenta**) y las
que se crearon este mes se cerraron una a una. Lo que falta es **repasar las
otras**, decidir para cada una si tiene que estar abierta, y cerrar las que no.
Es un rato de trabajo aburrido y sin resultado visible; también es exactamente el
tipo de cosa que aparece en el peor momento.

### 3.2 · La conciliación bancaria no se ha usado con un extracto real

`cem_conciliar_sugerencias` propone y una persona confirma, y está probado con
datos de prueba. **Nunca se ha pasado un extracto de verdad de Bancaribe.** El
día que se haga, espera diferencias de formato en las referencias: es lo que
falla siempre.

### 3.3 · El identificador de vídeo puede quedar en desacuerdo

Una lección puede recibir el vídeo por dos caminos —el enlace pegado en
Contenidos y el vídeo asignado en *Vídeos del curso*—. Ahora el editor avisa
cuando no coinciden y los escribe juntos al guardar, pero **las lecciones
antiguas pueden seguir en desacuerdo** desde antes del arreglo. Se ven abriendo
la lección: sale un aviso amarillo.

---

## 4 · Lo que NO conviene hacer

Por si alguien lo propone:

- **Bloquear F12 o el clic derecho «de verdad»**. Se salta desde el menú del
  navegador y molesta a gente honesta. Da sensación de seguridad, que es peor que
  no tener ninguna.
- **Esconder el identificador del vídeo en el código.** Está igualmente en la
  petición de red. Cero dificultad para quien mira, más complicación para quien
  mantiene.
- **Apagar los subtítulos por defecto.** Quien los lleva puestos puede
  necesitarlos.
- **Poner un selector de calidad que no lea la calidad de verdad.** YouTube
  decide el tramo según la conexión; un menú que jurara «1080p» mientras se ve
  480p sería peor que no tener menú.

---

## Si hay que elegir tres

1. **El correo** (§1.1). Todo lo de cobranza depende de eso y hay 26 avisos
   parados.
2. **Los destinos de Zelle y PayPal** (§1.2). Son dos campos y ahora mismo hay
   estudiantes que eligen y se quedan sin saber a dónde pagar.
3. **Las 17 lecciones sin vídeo** (§1.4), aunque sea dejándolas en blanco para
   que se vea que están pendientes.

Lo demás puede esperar sin que nadie lo note.
