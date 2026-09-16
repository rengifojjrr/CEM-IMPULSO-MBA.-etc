# Lo que falta

Estado a **23 de agosto de 2026**, con lo que cambió el **15 de septiembre**
marcado donde corresponde. Las cifras salen de mirar la base, no de memoria;
si algo aquí no cuadra con lo que ves, gana lo que ves.

Está ordenado por lo que cuesta que salga mal, no por lo que cuesta hacerlo.

---

## 0 · Lo que queda después de la radiografía (15 de septiembre)

La radiografía del 12 de septiembre (`docs/auditoria-2026-09-12.md`) dejó dos
listas. La de código se hizo entera el día 15: permisos, la cara de Cemi en el
QR, las cifras, los flotantes, el píxel, Cemi y WhatsApp en las páginas
públicas, el flujo de contactos, las previsualizaciones y los atajos. Esto es
lo que **sólo puedes hacer tú**, en el orden en que duele:

1. **Rotar tres claves** que siguen desde agosto: la de Resend, la secreta de
   Stripe (modo real) y el secreto del webhook. Se generan en cada proveedor y
   se pegan en Admin → Correo y Admin → Cobros con tarjeta.
2. **Abrir la convocatoria**: publicar los dos diplomados como cursos con
   precio, fecha y cohorte, y poner la fecha en Configuración → Próxima
   convocatoria. Hoy hay 0 cursos publicados; todo lo demás espera esto.
3. **Pegar los identificadores de medición y el WhatsApp** en Configuración →
   «Medir y que nos escriban»: el ID de Google Analytics 4, el del píxel de
   Meta y el número de WhatsApp. El código ya los usa; sin ellos no se mide
   nada y no sale el botón verde.
3b. **Subir Groq al plan Developer** (console.groq.com → Settings → Billing).
   El plan gratuito da 8.000 tokens por minuto y por modelo, y un turno de
   Cemi pesa unos 2.000: cuatro turnos por minuto por modelo. Con tres
   personas escribiéndole a la vez en la web, la tercera recibe la frase de
   avería. La cadena ya tiene tres modelos y espera cuando puede (16 de
   septiembre), pero eso estira el límite, no lo quita. Cuesta lo que se use;
   con el tráfico de hoy, centavos.
4. **Reconectar el puente de WhatsApp** (escanear el QR desde la máquina donde
   corre) y pasar `asistente_whatsapp_modo` a «responde». Lleva caído desde
   el 27 de agosto.
5. **Decidir las formas de pago locales** (pago móvil, Zelle, transferencia) y
   ponerles destino en Admin → Formas de pago. Hoy sólo hay tarjeta por Stripe.
6. **Activar la protección contra contraseñas filtradas** en el panel de
   Supabase: Authentication → Settings. Es un interruptor.
7. **Poner al día el periodo activo** en Configuración: dice «Otoño 2024».
8. **Imprimir los 24 diplomas en físico** que esperan, y **leer las 9 alertas
   de gobierno** sin leer.
9. **El proyecto SEM** (`admin.html`, `proyectos.html` y las funciones
   `upsert_quote`, `upsert_pm_project`, `get_quote`, `get_pm_project`) sigue en
   uso y comparte la base con el CEM sin ninguna comprobación. Decide si se
   lleva a su propio proyecto de Supabase o si se le pone una clave. Las
   páginas y funciones no se tocaron porque están en uso.
10. **Separar los cuatro proyectos** que comparten la base (`cq_*`,
    `forest_*`, `fb360_*`, `pm_*`). No urge; cada mes cuesta más.
11. **Sembrar las cuentas de prueba** `@pruebas.local`, poner `CEM_PASS` como
    secreto del repositorio y activar `CORRER_PRUEBAS_E2E=si`, para que las
    32 pruebas de navegador corran en GitHub.
12. **Decidir el texto**: «2.500+ estudiantes formados» frente a los 126
    graduados de la base; «desde Caracas» frente a «nueve países». Una sola
    historia, y las cifras de una sola fuente.
13. **Casos sueltos**: la cuenta duplicada de Oscar, los 12 diplomas de G12 y
    los egresados con certificado pero sin inscripción.

---

## 1 · Lo que sólo puedes hacer tú

Nada de esto lo arregla el código: hacen falta cuentas, dinero o material.

### 1.0 · La rama por defecto es una rama de trabajo

El repositorio tiene como rama por defecto
`claude/automatizar-certificados-graduacion-ycz2kv`, no `main`. Quien entre a
GitHub ve esa, y es la que usan por omisión los lanzamientos manuales de un
workflow. Lo que publica el sitio es `main`, y la tarea de las páginas para
Google hace `checkout` de `main` de forma explícita, así que hoy no rompe nada
— pero es una trampa esperando: el día que alguien añada un workflow sin fijar
la rama, correrá sobre la de trabajo.

Se cambia en **Settings → General → Default branch** del repositorio.

> **Nota sobre las ejecuciones «en cola» de Pages, para que nadie vuelva a dar
> la falsa alarma que di yo.** La API de GitHub deja ejecuciones de
> `pages build and deployment` marcadas como `queued` indefinidamente —una hora,
> dos— **aunque el despliegue haya ocurrido**. Comprobé el 26 de agosto que tres
> ejecuciones seguían en cola mientras el sitio ya servía ese mismo commit.
>
> La forma fiable de saber si algo está publicado NO es mirar Actions: es pedir
> el archivo y comparar.
>
> ```
> curl -s https://escuelacem.com/plataforma/inicio.html | grep -o 'styles.css?v=[^"]*'
> ```
>
> Si coincide con lo que hay en el repositorio, está publicado.
>
> Aparte de eso, `desplegar-funciones.yml` falló una vez con `startup_failure` y
> cero trabajos creados —el YAML es válido, comprobado— y al relanzarlo una hora
> después desplegó sin tocar nada. Si vuelve a pasar: relanzar antes de buscar
> la causa en el código.

### 1.1 · ~~El correo no sale~~ — resuelto: el correo sale

Resend quedó configurado y la cola se vacía sola cada minuto desde la propia
base (`cem_correo_empujar` / `cem_correo_recoger`). A 12 de septiembre: 67
correos enviados, cola vacía, y los que iban a direcciones de prueba se
descartaron a propósito. Lo único que queda de aquí es **rotar la clave de
Resend**, que es la misma desde agosto (ver §0).

### 1.2 · Un solo método de pago: tarjeta en euros por Stripe

Lo de agosto (Zelle y PayPal activos sin destino) se cerró apagándolos. Lo que
hay hoy es lo contrario: **un solo método activo**, tarjeta por Stripe en
euros, para un público que en su mayoría paga desde Caracas. Sin pago móvil,
sin Zelle, sin transferencia con destino.

→ **Cobrar → Formas de pago**. Decide cuáles se ofrecen y ponles el destino.
Un método sin destino es peor que un método apagado.

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

### 1.5 · Verónica está lista y no puede arrancar sin ti

El asistente ya atiende WhatsApp con el número de siempre, por QR, mientras se
resuelve el alta en Meta. El código está hecho y probado —conecta con WhatsApp,
saca el QR y lo dibuja en `/qr`— pero **dos cosas no las puedo hacer yo**:

**a) El secreto, en los dos lados.** Te inventas una frase larga y va idéntica
en Supabase → *Edge Functions → Secrets*, como `CEM_PUENTE_SECRETO`, y en el
`.env` del puente. Yo no puedo escribir secretos en Supabase.

Y hay algo que **desde fuera no se puede distinguir**: si el secreto está mal
puesto y si no está puesto en Supabase dan exactamente lo mismo, un 403. El
puente ahora lo comprueba al arrancar y lo dice, pero no puede decirte cuál de
los dos es. Si sale `EL SECRETO NO COINCIDE`, mira **los dos** sitios.

**b) Una máquina encendida y despierta.** No hace falta pagar nada todavía: sirve
un Android viejo con Termux, un PC de la oficina que no se apague, o tu propio
portátil para empezar. Lo único que hay que hacer sí o sí es **impedir que se
duerma** — está medido en el manual: 312 reconexiones en un día y 1 h 46 min de
caída en plena hora de venta, por una máquina que se suspendía. Los comandos
para cada sistema están en `puente-whatsapp/LEEME.md`.

Y lo que hace que lo gratis se aguante: el puente manda una señal cada dos
minutos y, si pasa un cuarto de hora en silencio, **la plataforma avisa al equipo
sola**. Que la máquina de casa se apague deja de ser una avería invisible. Se ve
en **El asistente → Cómo va**, y también avisa del caso que peor se diagnostica:
el puente encendido pero sin ninguna sesión de WhatsApp enlazada.

Mudarlo a un VPS el día que toque es copiar la carpeta: se lleva la sesión y no
hay que escanear el QR otra vez.

Los pasos están en `puente-whatsapp/LEEME.md`. Arranca en modo `escucha`, que es
lo que viene puesto: anota las preguntas reales sin contestar ninguna. Déjalo
unos días así, mira lo que ha escuchado en **El asistente → Lo que preguntan**,
escribe las fichas de las cinco o seis que más se repitan, y entonces lo
enciendes. Es la diferencia entre un asistente que ya sabe de qué le hablan y
uno que se estrena delante de un cliente.

> **Y una cosa que decides tú, no el código.** Por WhatsApp el asistente se
> presenta como **Verónica** —un nombre de pila, en la agenda de la persona—, no
> como Cemi. Quien le escriba va a creer razonablemente que hay alguien al otro
> lado. Lo que sostiene eso es que en cuanto pidan hablar con una persona, o
> duden, el asistente no lo discute: avisa al equipo de verdad. Si prefieres que
> se llame de otro modo, se cambia en **Configuración**, clave
> `asistente_nombre_whatsapp`, sin desplegar nada.

### 1.9 · Los 12 diplomas de Marketing · Noche · Grupo 12

Ese grupo tiene **12 personas con sus 8 módulos completos y ningún diploma**.
No es que se anularan: nunca se emitieron, no hay ni una fila en ningún
estado. Es el único grupo terminado al que le falta.

Comparado con los demás, se ve solo:

| Grupo | Personas | Módulos | Diplomas |
|---|---|---|---|
| Marketing · Viernes 9:00 AM · Grupo 12 | 10 | 9 | 10 |
| Marketing · Matutino 8:30–11:00 · Grupo 14 | 10 | 9 | 10 |
| IA · Mañana 11:00 · Grupo 2 | 8 | 9 | 8 |
| IA · Sábado 1:00–5:00 · Grupo 2 | 6 | 9 | 6 |
| **Marketing · Noche 4:30–6:30 · Grupo 12** | **12** | **8** | **0** |
| Exitus Lab · Agosto | 2 | 4 | — sin diploma, por indicación expresa |

Por eso al buscar «diploma» en Certificados emitidos salen 34 y no 46. La
pantalla no recorta nada: 34 son todos los que existen.

**Lo que falta para poder emitirlos: la fecha.** Los certificados de módulo de
Marketing no guardan fecha en sus datos —va dibujada en el fondo—, y el único
que la lleva es el diploma. El del grupo hermano (Viernes · Grupo 12) dice
*14 de Agosto de 2026*, pero eso es una suposición, no un dato de este grupo,
y no conviene estampar 12 diplomas oficiales con una fecha adivinada.

**Cómo hacerlo cuando se sepa la fecha.** Ojo al orden, porque «completar
módulo» copia la fecha de un compañero y aquí no hay ninguno de quien copiar
—la función lo dice con todas las letras y se niega—:

1. En el generador, emitir el diploma **de una sola persona** del grupo, con
   la fecha buena, y **registrarlo**.
2. Ya con ese modelo dentro, usar **«dar este módulo al resto del grupo»**
   (`cert_lote_completar_modulo`) y salen los 11 restantes heredando esa
   misma fecha.

El `puntaje` sale en blanco a propósito, igual que en los demás grupos: es de
cada quien y más vale que se vea que falta a que salga con el de otro.

### 1.10 · El diploma, y por qué la fecha y el puntaje no son de cada quien

Al rehacer los 34 diplomas salieron cuatro cosas. Las cuatro están arregladas,
pero la última conviene entenderla porque va a volver a aparecer.

**Tres faltas en la misma frase**, la de la cédula. Quedó así:

    Titular de la cédula de identidad V: {{cedula}} quien ha culminado con éxito el

Sobraba una `n` en «indentidad», faltaba la `h` de «ha» y la tilde de «éxito».
Corregido en las dos plantillas que se usan, en `FORMATO_DIPLOMA_EXITUS` —que
la tenía viva y no había salido en ningún diploma sólo porque Exitus todavía
no lleva— y en la copia dormida de `overrides` de la de Marketing, que habría
reaparecido en cuanto alguien desmarcara la casilla de plantilla de texto.

**El mes, que en Marketing decía julio.** Los dos diplomas dicen ahora «En
Caracas en el mes de agosto del 2026». En minúscula, que es como se escriben
los meses en castellano y como ya estaba en el de IA.

> **Lo que hay que saber, porque no es evidente:** la fecha y el puntaje del
> diploma **no salen de la ficha de cada persona**. Salen de un valor fijo de
> la plantilla, en `overrides`, y ese valor gana. El orden en
> `renderCertificateCanvas` es ajuste manual → plantilla de texto → **valor
> fijo** → dato de la persona, así que mientras haya algo escrito en
> `overrides` para un campo, lo que traiga cada certificado no se ve.
>
> Hoy eso es lo que se quiere: los 34 llevan «agosto» y puntaje **99** a
> propósito. Pero significa que la fecha del grupo que guarda cada certificado
> —27 de junio, 7 de septiembre, 14 de agosto, 10 de septiembre— no se imprime
> en el diploma. Si algún día se quiere la fecha real de cada promoción, hay
> que **vaciar** `overrides.Fecha`, no rellenar el dato.

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

### 3.1 · ~~88 funciones del servidor abiertas~~ — cerrado el 23 de agosto

**Quedan 19, y las 19 tienen que estar abiertas.** Conviene dejar escrito cómo se
cerró, porque el mismo error se cometió tres veces antes.

Lo que fallaba: se hacía `revoke execute … from anon`, y **eso no cierra nada**.
Postgres le concede EXECUTE a PUBLIC al crear cada función, y `anon` hereda de
PUBLIC, así que el permiso seguía llegando por la otra puerta. La tabla de
permisos se veía bien y las funciones seguían contestando. Hay que revocar
`from public, anon` y volver a conceder a `authenticated`, que también heredaba
de PUBLIC y si no se queda fuera el equipo entero.

Lo que se hizo ahora, y es lo que hay que mantener: **se invirtió la regla**. En
vez de ir tapando agujeros uno a uno, se cerraron todas y se abrieron sólo las
que se comprobó que hacen falta:

- **13 predicados** que viven dentro de las políticas RLS (`cem_is_staff`,
  `cem_can_read_all`, `cem_owns_enrollment`…). Una política se evalúa con los
  permisos de **quien consulta**, no de quien creó la tabla: si a `anon` le
  quitas EXECUTE ahí, el catálogo público deja de leerse entero.
- **6 que llaman las páginas públicas**: los países de la portada, las estrellas
  del catálogo, verificar un certificado, la tasa del día, el perfil que se
  comparte por enlace y el formulario de contacto.

Y se cambió el permiso **por omisión** (`alter default privileges`), para que la
próxima función nazca cerrada y haya que abrirla a propósito. Si algún día una
pantalla pública falla con «permission denied for function …», la respuesta no es
volver a abrirlo todo: es añadir esa función a la lista, después de mirar si de
verdad tiene que verla alguien sin sesión.

Dos avisos de lo que costó:

1. Al conceder `authenticated` en bloque se **reabrieron** funciones que estaban
   cerradas a todo el mundo a propósito: `cem_correo_config`, que lee la clave
   del proveedor de correo, y las catorce de disparador. Lo cazó la prueba de
   correo. Una función que sólo llaman otras funciones no necesita que nadie
   tenga EXECUTE: al llamarse desde dentro de una `security definer`, el permiso
   se comprueba contra su dueño. Están otra vez cerradas a todos.
2. La comprobación que vale **no es leer la tabla de permisos**, es llamar a las
   funciones sin sesión con la clave publicable, que es la que va escrita en el
   código del sitio. Eso es lo que hace `pruebas/casos/puertas.mjs`, y comprueba
   las dos direcciones: que lo cerrado esté cerrado **y que el sitio público siga
   funcionando**. Sin la segunda mitad, la forma más fácil de pasar la prueba
   sería cerrarlo todo y dejar la portada rota.

Sigue pendiente, y no es de esta familia: `/proyectos.html` usa `upsert_quote` y
`upsert_pm_project`, que **sí escriben** y siguen abiertas a cualquiera que sepa
un identificador. Cerrarlas rompe el tablero, que funciona sin cuenta a
propósito. Es una decisión tuya, no un descuido.

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

### 3.4 · Con «Plano», el fondo que se mueve casi no se ve — y no es culpa suya

El fondo animado se subió mucho: en la franja donde asoma, la pantalla pasó de
cambiar 16 sobre 765 a más de 100 en cuatro segundos. Pero hay un techo que no
depende de la animación.

Se midió la pantalla entera en `estudiante/perfil.html`, en una ventana de
1280 px, restando dos fotos tomadas con cuatro segundos de diferencia y
repartiendo el resultado en una rejilla de ocho por cinco. **Las cuatro filas de
arriba dan 0,0 enteras.** Todo el cambio está en la fila de abajo.

La razón está en las medidas: la barra ocupa de 0 a 236, la tarjeta de 276 a
1240. De 1280 px de ancho, el fondo se ve en dos huecos de 40 px y en lo que
quede por debajo del contenido. Con el estilo «Plano» —el de fábrica— las
tarjetas y la barra son opacas, así que **no hay dónde ver el fondo**, por fuerte
que se ponga.

Las salidas, si algún día molesta:

- **Que las tarjetas dejen pasar algo** en «Plano». Un 4 o 5 % basta para que el
  color se mueva por debajo de toda la pantalla. «Plano» deja de ser del todo
  plano.
- **Usar un estilo de vidrio.** Los seis ya están hechos y ahí el fondo se ve a
  través de las tarjetas, que es justo para lo que se diseñaron.

Se preguntó y se eligió no tocar las tarjetas, así que queda anotado y no hecho.

### 3.5 · Los 208 certificados emitidos caen todos el mismo día

La lista de **Certificados emitidos** ya sale agrupada por el día en que se
emitió cada uno, con su cuenta y un botón para descargar los de esa jornada en
un ZIP. Con los datos de hoy eso da **un solo grupo**: los 208 se cargaron de
una sentada el 14 de agosto de 2026, así que el agrupado está bien hecho pero no
se nota, y sigue siendo una lista de doscientas filas seguidas.

Se arregla solo en cuanto se emita una segunda tanda. Si antes de eso hace falta
partir esa lista, el corte natural no es la fecha sino **la persona**: cada
graduado tiene sus ocho módulos seguidos, y buscar su nombre ya deja en pantalla
—y en el botón de descargar— exactamente sus ocho.

El agrupado en sí está probado aparte, con fechas inventadas
(`agruparPorDia`, `claveDelDia` y `diaEnLetras` se exportan de
`certificados/generador.js` justo para poder comprobarlo sin tocar los
certificados reales): tres días, un día partido en horas lejanas, y el caso de
la emisión nocturna en Caracas, que en UTC ya es el día siguiente.

### 3.6 · ~~`cem_settings` la puede leer cualquiera~~ — cerrado el 15 de septiembre

Los dos pasos que pedía este apartado están dados, en el orden que pedía:

1. `plataforma/assets/asistente.js` ya no lee la tabla: pide
   `cem_sitio_publico()`, que devuelve sólo el nombre y la cara del asistente,
   los identificadores de medición y el WhatsApp y correo públicos. Es lo que
   usan también las páginas generadas.
2. La política de lectura de `cem_settings` pasó de «cualquiera con sesión» a
   `cem_can_read_all()`: la lee el equipo (Configuración, Asistente, Diplomas
   en físico) y nadie más. Sin sesión ya no se leía; ahora tampoco un
   estudiante.

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
