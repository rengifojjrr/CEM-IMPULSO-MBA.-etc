# Qué le falta a la experiencia del estudiante

Este documento no es una lista de ideas bonitas. Sale de haber recorrido la
plataforma entera buscando lo que se rompe, y está ordenado por lo que cuesta
dinero o estudiantes, no por lo que es más fácil de hacer.

Cada punto dice **qué pasa hoy** (comprobado, con cifras cuando las hay), **qué
debería pasar** y **cuánto trabajo es**. Lo que ya está arreglado no aparece:
esto es lo que queda.

---

## 0 · Lo que se encontró roto, y qué dice del conjunto

Cuatro fallos de esta madrugada, puestos juntos, cuentan una historia:

| Lo que estaba mal | Cuánto llevaba así | Por qué nadie lo vio |
|---|---|---|
| El catálogo público no cargaba **sin sesión** | desde siempre | Con sesión abierta funciona. Nadie miró la web como la mira un desconocido. |
| El enlace del vídeo se podía pedir **sin pagar** | desde siempre | La puerta estaba en la pantalla, no en la base. |
| La cuadrícula de notas enseñaba **un intento cualquiera** | desde que alguien tuvo dos intentos | Con un intento por estudiante da el resultado correcto por casualidad. |
| Los ocho campos del registro **sin rótulo asociado** | desde siempre | Con ratón se puede rellenar igual. Con el dedo o con lector de pantalla, no. |

El patrón: **todo lo que falla, falla del lado de fuera**. Sin sesión, sin
pagar, sin ratón, con datos que un desarrollador no genera al probar. La
plataforma está bien construida por dentro y no se había mirado nunca desde la
acera. Las pruebas nuevas de esta noche cubren justo eso, y por eso la primera
de ellas es la que parece más tonta: *que alguien que no ha entrado vea cursos*.

---

## 1 · CRÍTICO · Nadie recibe ningún correo

Hay **323 correos en la cola sin enviar**, el más viejo del 14 de agosto. Entre
ellos:

| Asunto | Cuántos |
|---|---|
| Solicitud de congelamiento por resolver | 180 |
| Tu solicitud de congelamiento fue rechazada | 60 |
| **Tu pago fue aprobado** | **53** |
| Se anuló un pago de tu cuenta | 28 |
| Avisos de cuota que vence o está vencida | 2 |

Cincuenta y tres personas pagaron, la plataforma decidió avisarles, redactó el
correo, y el correo sigue ahí. Sesenta recibieron un «no» a una solicitud que
nunca leyeron.

**Esto no es un fallo de programación.** El diseño es a propósito: la plataforma
nunca envía directamente, deja los correos en `cem_correo_cola` y la función
`cem-correo` los saca de a tandas de 25. Así el aviso dentro de la plataforma
funciona aunque no haya proveedor de correo. Lo que falta son dos cosas
concretas:

1. **Contratar un proveedor** (Resend, Postmark, Amazon SES) y guardar la clave
   en `cem_integraciones` con `id = 'correo'`:
   ```json
   { "proveedor": "resend", "api_key": "re_…", "remitente": "CEM <no-responder@tudominio>" }
   ```
   Sin esta fila la función no tiene con qué enviar. Hoy la tabla sólo tiene
   `bancaribe`.

2. **Programar que la cola se vacíe.** La función está desplegada pero **nadie
   la llama**: en `pg_cron` hay una sola tarea, y es la de revisar cuotas. Hace
   falta una segunda, cada 5 o 10 minutos. La extensión `pg_net` está disponible
   pero no instalada.

**Por qué es lo primero de la lista, por encima de cualquier pantalla nueva:**
un estudiante que paga y no recibe confirmación escribe por WhatsApp preguntando
si llegó. Un estudiante que no sabe que su cuota vence mañana la paga tarde. Un
estudiante que aprobó y no se enteró no vuelve a entrar. Todo el trabajo de
retención de la plataforma —los avisos, los recordatorios, los estados— está
escrito y funcionando y **no sale de la base de datos**.

> Mientras no haya proveedor, conviene decirlo en la pantalla de soporte: «los
> avisos por correo están en pausa, revisa la campana». Hoy la plataforma se
> comporta como si los mandara.

---

## 2 · ALTO · El estudiante no puede preguntar nada

Hay tablón de la cohorte (`cem_muro`) con comentarios, y tickets de soporte
(`cem_tickets`). No hay **la duda concreta sobre la lección concreta**: «en el
minuto 14 de Finanzas II no entendí de dónde sale el WACC».

Hoy esa pregunta acaba en WhatsApp del profesor, o no se hace. Las dos opciones
son malas: la primera no queda registrada y se responde una vez a una persona;
la segunda es alguien que se atasca y abandona.

**Qué debería pasar:** un hilo por lección, visible para toda la cohorte, donde
el docente responde una vez y lo leen los treinta. Es la diferencia entre
soporte y material: la respuesta a una buena duda es contenido.

**Trabajo:** medio. La tabla `cem_muro` ya tiene comentarios y RLS por cohorte;
haría falta colgarla también de `lesson_id`, y un panel de «dudas sin responder»
en el aula del docente. Reutiliza `pintarMuro()`, que ya existe.

---

## 3 · ALTO · No se puede encontrar nada dentro de un curso

Una Maestría de 24 semanas tiene decenas de lecciones. Un estudiante que
recuerda que «lo del flujo de caja descontado estaba en algún módulo» tiene que
abrirlos uno por uno.

**Qué debería pasar:** un buscador dentro del curso, sobre el título y la
descripción de cada lección, y sobre el nombre de los documentos adjuntos.

**Trabajo:** bajo si se busca sobre lo que ya está en la base (títulos,
descripciones, nombres de archivo). Alto si se quiere buscar dentro de los
vídeos, que necesita transcripciones. Empezar por lo bajo: resuelve el 80 %.

> `pg_trgm` y `unaccent` están disponibles en el proyecto. Con eso, «flujo de
> caja» encuentra «Flujo de Caja» y «flujos de caja».

---

## 4 · ALTO · Nada dice si vas bien o vas tarde

El panel enseña «26 % de progreso general». Ese número no significa nada sin
referencia: puede ser excelente en la semana 2 y desastroso en la semana 20.

**Qué debería pasar:** comparar contra el calendario de la cohorte. «Vas por el
módulo 2 y la cohorte va por el 4» es una frase sobre la que se puede actuar;
«26 %» no lo es. Y para el docente, la lista de quién se está descolgando
**antes** de que abandone.

**Trabajo:** bajo-medio. Los datos están todos: `cem_classes` tiene fechas,
`cem_lesson_progress` tiene qué vio cada uno, y el aula ya calcula retención.
Es sobre todo redactar bien el mensaje.

---

## 5 · MEDIO · No hay nada que hacer con una conexión mala

Todo el contenido es en línea y en directo desde una URL externa. En Venezuela
—donde está la sede— eso significa que un corte de luz o de datos es una clase
perdida.

**Qué debería pasar, por orden de esfuerzo:**

1. **Recordar por dónde iba el vídeo.** Hoy, si se cierra la pestaña en el
   minuto 20, se vuelve al minuto 0. Es lo más barato de la lista y lo que más
   se agradece.
2. **Descargar los documentos** para leerlos sin conexión. Los PDF ya están en
   el almacén; falta el botón y decir cuánto pesa.
3. **Marcar una lección «para después»**, una lista propia.
4. Vídeo descargable: depende de acuerdos con los docentes sobre su material.

---

## 6 · MEDIO · El estudiante no puede resolver nada de dinero solo

Puede pagar y puede pedir congelamiento o retiro
(`cem_solicitar_cambio_inscripcion`). No puede:

- **Cambiar de plan de cuotas** (de 1 a 3, de 3 a 6). Hoy eso es un mensaje a
  administración, y administración lo hace a mano.
- **Pedir prórroga de una cuota** con un motivo. Hoy: se vence, entra en cartera
  vencida, y alguien llama.
- **Ver el recibo** de un pago ya aprobado sin pedirlo. La función
  `cem_recibo_pago()` existe y devuelve los datos con su número; falta el botón.

El tercero es media hora de trabajo y quita llamadas. Los dos primeros son
decisiones de negocio antes que de programación: hay que decidir qué se permite
y con qué recargo.

---

## 7 · MEDIO · Después de pagar, nadie te dice qué hacer

Se paga, se abre el curso, y aparece un aula con cinco pestañas. No hay primer
paso señalado, ni «empieza por aquí», ni nada que diga cómo funciona la
evaluación o cuándo es la primera clase en directo.

**Qué debería pasar:** una pantalla de bienvenida la primera vez, con tres
frases y un botón a la primera lección. Y un correo de bienvenida — que hoy no
llegaría, ver el punto 1.

**Trabajo:** bajo. El dato de «es su primera visita» sale de que no haya ninguna
fila en `cem_lesson_progress`.

---

## 8 · MEDIO · Accesibilidad, que no se ha barrido nunca

Que los ocho campos del registro no tuvieran rótulo asociado no es un descuido
aislado: es que nadie ha pasado por aquí con esa lente. Esta madrugada hubo que
**crear** la clase `.visually-hidden`, que no existía en 1.800 líneas de CSS.

Lo que hay que revisar, en orden:

1. **Rótulos y `name` en los formularios de las 58 pantallas.** El registro ya
   está; el resto no se ha mirado.
2. **Recorrido con teclado.** ¿Se puede rellenar una evaluación entera sin
   ratón? Con doce tipos de pregunta, es una pregunta real.
3. **Foco visible** en todo lo pulsable. Hay `:focus-visible` en algunos sitios.
4. **Contraste**, que sí está cubierto: la prueba recorre las siete paletas en
   los dos temas.
5. **Tamaño del área pulsable** en teléfono: 44 px es el mínimo cómodo.

Esto no es caridad. El CEM se dirige explícitamente a **adultos mayores** — está
en el manual de marca, en las cinco preguntas. Una plataforma que exige buena
vista y pulso fino excluye a un cuarto de su público declarado.

---

## 9 · BAJO pero visible · Detalles que se notan

- **Portadas de los cursos** sólo en el panel del estudiante. `admin/cursos.html`
  y el panel del docente siguen sin ellas.
- **Certificado a LinkedIn.** Hay perfil público y verificación por QR; falta el
  botón que publica el logro. Es publicidad gratis hecha por el graduado.
- **Racha de estudio.** Hay insignias (`cem_badges`), no hay «llevas 5 días
  seguidos». Barato y funciona, con cuidado: una racha que se rompe por estar
  enfermo desmotiva.
- **Valoraciones.** La tabla `cem_valoraciones` existe y el aula enseña lo que
  opina la clase. No se enseña en el catálogo, que es donde ayudaría a decidir.
- **Asistencia.** `cem_attendance` se llena pero el estudiante no ve su propio
  registro.

---

## 10 · La pregunta que sigue sin respuesta

**Zelle, PayPal y tarjeta: ¿liquidan a la par o al cambio real EUR/USD?**

Se preguntó y no se respondió, y afecta a cada pago que entra en dólares. Si se
cobra a la par un euro que vale 1,08 dólares, la escuela pierde el 8 % de cada
pago en esas vías y no aparece en ningún informe: los importes cuadran, el
margen no. Cuanto más tarde se decida, más pagos hay que revisar hacia atrás.

---

## Si sólo se puede hacer una cosa

**El correo.** No es la más vistosa ni la que más código lleva —es contratar un
proveedor, guardar una clave y programar una tarea— pero es la única que hace
que todo lo demás se entere. Ahora mismo la plataforma tiene 323 cosas que
decirle a sus estudiantes y ninguna forma de decírselas.
