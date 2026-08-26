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
| `supabase/functions/_shared/cerebro.ts` | La cadena de modelos, el filtro de salida y el bucle de herramientas. Uno solo para los dos. |
| `supabase/functions/_shared/herramientas.ts` | El catálogo de lo que Cemi puede hacer. |

Las tres tablas tienen RLS encendido y **cero políticas**: no se llega a ellas
más que por las funciones, y cada función comprueba primero quién llama.

---

## 3 bis · Las veinte cosas que puede hacer

Hasta hace poco el asistente sólo **contaba**: se le metía un resumen en el
guion y hablaba de él. Ahora además **hace**, y lo hace llamando a herramientas.

Cada herramienta es una función de la base **sin `security definer`**, así que
corre con el permiso de quien pregunta. Eso significa que no hay ni un control
de permisos escrito a mano en las veinte: si a alguien no le toca ver algo, la
base no le da las filas. Está comprobado ejecutándolo — la misma función, en el
mismo instante, le devuelve al admin la cuota vencida de una persona con su
teléfono, y a otro alumno una lista vacía.

Van en tres niveles, y el nivel dice lo que cuesta:

| Nivel | Qué implica |
|---|---|
| **Cuenta** | Sólo lee. La seguridad ya está resuelta. |
| **Prepara** | Redacta la acción y una persona la confirma en *Asistente → Por confirmar*. |
| **Hace** | Escribe en la base. Queda en Auditoría como `asistente.*` y se puede deshacer. |

**El alumno**

| # | Dice | Herramienta | Nivel |
|---|---|---|---|
| 01 | «por dónde iba» | `cem_bot_donde_me_quede` | Cuenta |
| 02 | «mándame mi certificado» | `cem_bot_mis_certificados` | Cuenta |
| 03 | «cuánto debo, cómo pago» | `cem_bot_como_pago` | Cuenta |
| 04 | «avísame antes de que venza» | `cem_bot_avisame_antes` | Hace |
| 05 | «dónde explicaron X» | `cem_bot_buscar_en_lecciones` | Cuenta |
| 06 | «apúntame en ese diplomado» | `cem_bot_apuntarme` | Hace |

**El profesor**

| # | Dice | Herramienta | Nivel |
|---|---|---|---|
| 07 | «quién no ha entregado» | `cem_bot_quien_no_ha_entregado` | Cuenta |
| 08 | «recuérdales que entreguen» | `cem_bot_redactar_recordatorio_entrega` | Prepara |
| 09 | «hoy faltaron Ana y Luis» | `cem_bot_pasar_asistencia` | Hace |
| 10 | «qué tengo por corregir» | `cem_bot_mi_cola_de_correccion` | Cuenta |

**Cobranza**

| # | Dice | Herramienta | Nivel |
|---|---|---|---|
| 11 | «a quién llamo hoy» | `cem_bot_a_quien_llamo_hoy` | Cuenta |
| 12 | «manda el recordatorio de los que vencen» | `cem_bot_redactar_tanda_cuotas` | Prepara |
| 13 | «registra este pago» | `cem_bot_registrar_pago` | Hace |
| 14 | «cuánto entró y por qué método» | `cem_bot_cuanto_entro` | Cuenta |

**Coordinación**

| # | Dice | Herramienta | Nivel |
|---|---|---|---|
| 15 | «quién está en riesgo de dejarlo» | `cem_bot_quien_esta_en_riesgo` | Cuenta |
| 16 | «qué falta para cerrar el mes» | `cem_bot_que_falta_para_cerrar` | Cuenta |
| 17 | «emite los certificados» | `cem_bot_preparar_certificados` | Prepara |
| 18 | «matricula a Fulano» | `cem_bot_matricular` | Hace |

**Dirección**

| # | Dice | Herramienta | Nivel |
|---|---|---|---|
| 19 | «resúmeme la semana» | `cem_bot_resumen_semana` | Cuenta |
| 20 | «por qué bajó la matrícula» | `cem_bot_por_que_bajo` | Cuenta |

La 19 además se manda sola los lunes a las 8:00 de Caracas
(`cem_bot_resumen_semanal_enviar`, en el reloj de la base).

### Lo que estas herramientas encuentran menos de lo que suena

- **La 05 no busca dentro de los vídeos.** Busca por título, descripción y
  nombre del módulo. La columna `cem_lessons.contenido` está cerrada **por
  columna** junto con `url` y `video_id` — es lo que impide que alguien se baje
  la lista de enlaces de YouTube con una consulta. Para buscar dentro de lo que
  se dijo en clase hacen falta transcripciones guardadas en su propia tabla.
- **La 13 no lee la imagen del comprobante.** Recibe los datos ya leídos y los
  escribe como pago *registrado*, nunca *confirmado*. Que el dinero entró lo
  dice quien mira la cuenta.
- **La 07 filtra a mano por `cem_docente_de_curso`, y no es redundante.**
  `cem_can_read_all()` incluye al rol profesor, así que hoy, por las reglas de
  fila, un profesor puede leer entregas de cursos que no son suyos. Es el único
  sitio de las veinte donde el permiso no basta.

### Por WhatsApp sólo se puede avisar

`cem-whatsapp` entra con la **llave de servicio**, porque quien escribe no tiene
sesión. Ahí las reglas de fila no se aplican, así que ejecutar herramientas
`SECURITY INVOKER` correría con permiso de dios: un desconocido podría pedir la
cartera entera. Por eso allí sólo se ofrece `avisar_al_equipo`, que es
`SECURITY DEFINER` y comprueba por dentro.

Para que el equipo pueda **mandar** cosas por WhatsApp hace falta antes una
sesión de verdad. Un número de teléfono no es una contraseña.

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

El asistente **ya está encendido y responde**. Esta sección queda como receta
para montarlo de cero en otro sitio, o para cuando haya que rehacerlo.

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
| `CEM_ASISTENTE_MODELOS` | La cadena de modelos, separados por coma. **No es opcional en la práctica**: los modelos se retiran. |

**No la pegues en el chat.** Se pone en esa pantalla, que la guarda cifrada del
lado del servidor, y desde aquí se puede comprobar que funciona sin verla.

Los modelos van en configuración y no escritos en el código porque el manual
documenta que el proveedor **retiró dos modelos sin avisar** y el bot se quedó
mudo con gente escribiendo. Nos pasó el primer día: la cadena apuntaba a
`llama-3.3-70b-versatile` y `llama-3.1-8b-instant`, y Groq apagó los dos el
**16 de agosto de 2026**. El valor de ahora es:

```
groq:openai/gpt-oss-120b,groq:openai/gpt-oss-20b
```

Dalo por caducado también. Cuando el asistente empiece a contestar la frase de
cortesía sin motivo, mira en **Conversaciones** si el error dice
`model_not_found` y cambia el secreto. **No hace falta volver a desplegar.**

Y una debilidad que sigue ahí: los dos eslabones son de la misma casa, así que
cayeron juntos. Una cadena de respaldo de verdad mezcla proveedores.

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
—los signos de apertura, el markdown, los bytes de control, las frases que
delatan al modelo— se limpia también en código antes de enviar.

**Y el filtro NUNCA puede dejar la respuesta vacía.** Si al limpiar no queda
nada, gana el texto original. Esto salió de una avería de verdad: la lista de
frases prohibidas incluía «no tengo acceso a», y a la pregunta «ya pagué, me
confirmas?» el asistente contestó «No tengo acceso a esa confirmación» —una
respuesta honesta y correcta— que el filtro se comió entera. La pantalla
enseñó una avería que no existía. Un filtro demasiado ancho no sólo censura de
más: convierte una respuesta buena en una mentira sobre el estado del sistema.

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
- **Transcripciones de las lecciones**, para que la 05 encuentre lo que se dijo
  dentro de un vídeo y no sólo lo que hay escrito alrededor.
- **Lectura del comprobante** en la 13. Hoy la herramienta escribe el pago; leer
  el monto y la referencia de una foto es un modelo con vista, y es un trabajo
  aparte.
- **Los dos eslabones de la cadena de modelos son del mismo proveedor.** Cuando
  Groq apagó los dos modelos que había, cayeron a la vez. Una cadena de verdad
  mezcla proveedores.

---

## 10 · «Aviso al equipo»: por qué hay tres capas para una frase

Es la promesa que más caro sale incumplir, y costó tres intentos que fuera
verdad. Vale la pena dejar escrito el porqué de cada capa, porque las tres
parecen redundantes y ninguna lo es.

**Capa 1 — que la función haga algo.** `cem_bot_escalar` existía desde el primer
día y sólo ponía una marca de tiempo en la conversación. Para enterarse había
que entrar al panel y mirar. Ahora notifica y encola correo a coordinación y
dirección, más cobranza si el motivo huele a dinero, con enlace a la
conversación y sin repetir dentro de seis horas.

**Capa 2 — que alguien la llame.** Nadie lo hacía. Ni una línea del proyecto la
invocaba. Ahora es una herramienta que el modelo puede usar, y el guion le dice
que la use.

**Capa 3 — que el servidor lo compruebe.** Y ésta es la que enseñó lo demás.
Probándolo, el modelo llamó a la herramienta, la llamada **falló**, se le
devolvió el error tal cual, y aun así contestó *«Ya avisé al equipo, pronto te
contactarán»*.

O sea que la capa 2 no basta y no iba a bastar nunca: **un modelo no es un sitio
donde poner una garantía**. Así que ahora, después de cada respuesta, el
servidor mira si el texto dice que se avisó; si lo dice y no está avisado,
escala él mismo — con la conversación que conoce el servidor, no la que eligiera
el modelo. Y si tampoco puede, cambia la frase por una que no promete nada.

Se avisa de más a propósito. Un aviso sobrante le cuesta al equipo mirar una
conversación que no hacía falta; uno que falta le cuesta a una persona que le
dijeron que la iban a llamar y nadie la llamó.

### Lo que apareció debajo

Al empezar a llamar a `cem_avisar_equipo` todos los días, saltó que **estaba
rota desde que se escribió**: comparaba `rol = any(p_roles)`, que es un enum
contra un `text[]`, y Postgres no tiene ese operador. No falla al crear la
función: sólo al ejecutarla, y sólo cuando el bucle llega a correr.

Eso la mantuvo escondida, porque sus cuatro llamadas están en ramas
excepcionales. Y una de ellas es `cem_revisar_cuotas`, que corre **todos los
días a las 11:00 UTC**: el primer día que alguien llegara a 60 días de mora, el
motor de cuotas entero se habría caído —sin marcar vencidas, sin avisos
previos— y en un reloj nadie mira el error.

Está arreglado. La lección es la de siempre en este proyecto: **una avería
latente deja de serlo cuando algo empieza a usar el camino que nadie usaba.**

---

## 11 · El botón que lleva a la pantalla, y por qué lo decide el servidor

Cemi contestaba bien y aun así había que trabajar: «los certificados se emiten
desde Certificados → Plantillas» deja a quien pregunta buscando esa pantalla en
un menú de veintisiete entradas repartidas en siete grupos.

Ahora la respuesta puede traer un botón. La lista de destinos está en
`supabase/functions/_shared/pantallas.ts` y **la decisión se toma en el
servidor**, no en el navegador. Dos razones, y la segunda es la importante:

1. Aquí se sabe qué herramienta se usó de verdad. Si Cemi acaba de mirar la
   cartera, el destino no hay que adivinarlo.
2. Aquí el rol ya está comprobado contra la base. **Un botón que rebota al
   panel es peor que ningún botón**, porque parece que la plataforma está rota,
   y el navegador no es sitio para decidir a qué pantallas entra alguien.

Por eso cada destino trae sus roles **copiados del `require:` de la propia
pantalla**. Si un día cambia el `require:` de una pantalla y esta lista se
queda vieja, empezarán a salir botones que rebotan.

Y sale `null` a menudo, que está bien. La coincidencia por palabras exige una
frase reconocible, no una palabra suelta: «pago» aparece en media plataforma.
Once casos probados, incluidos los dos que importan — que un profesor no acabe
en Formas de pago y que un estudiante no reciba nunca una pantalla de
administración.

## 12 · Por qué el hilo vive en `sessionStorage` y no en otro sitio

Minimizar la ventana y seguir en la misma pantalla ya conservaba la
conversación; cambiar de pantalla la borraba, porque el módulo se vuelve a
cargar y con él las variables. Y eso es justo lo que pasa siempre: se le
pregunta a Cemi dónde se hace algo, se va uno a hacerlo, y al volver el hilo no
está.

- **`sessionStorage` y no `localStorage`**: vive mientras dure la pestaña. Una
  conversación de trabajo de hace tres días reaparecida al abrir el portal no es
  memoria, es ruido.
- **Se guarda el ámbito junto al hilo**: el de equipo no se le enseña a un
  estudiante que entre después en la misma pestaña.
- **El registro de verdad sigue en `cem_bot_mensajes`.** Esto es sólo para no
  perder de vista lo que ya se leyó, y por eso «empezar de nuevo» no borra nada
  de la base: suelta el hilo que se le manda al modelo, que es lo que se pide
  cuando se pide empezar de nuevo.
