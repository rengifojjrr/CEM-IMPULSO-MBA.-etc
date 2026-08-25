# Diez cosas para que al estudiante le cueste menos

No es una lluvia de ideas. Cada una sale de algo que vi en el código o en los
datos mientras trabajaba hoy, y va con el porqué y con cuánto cuesta.

Ordenadas por lo que más duele primero.

---

## 1 · Que se sepa cuándo un guardado no se guardó

**Lo que pasa.** Un `update` que no toca ninguna fila —porque una regla de la
base lo bloquea— **no devuelve error**: devuelve cero filas y se queda tan
tranquilo. Hoy eso hizo que la pantalla dijera «Foto guardada» siete veces
seguidas sin guardar nada.

Lo arreglé en la foto de perfil. Pero `run()`, que usa **toda** la plataforma,
tiene el mismo agujero: cualquier pantalla que haga `run(update)` y luego `ok()`
puede estar mintiendo.

**Qué hacer.** Una variante `runYComprueba()` que exija que vuelva al menos una
fila, y usarla donde se anuncia éxito. No cambiar `run()` de golpe: hay
actualizaciones que legítimamente no tocan nada, y tocar las 82 pantallas a
ciegas rompe más de lo que arregla.

**Esfuerzo:** medio. **Impacto:** alto — es la clase de fallo que hace que la
gente deje de fiarse de la plataforma.

---

## 2 · Los diálogos no se cierran con Escape

`modal()` sólo escucha la X y el clic en el fondo. En un portátil, cerrar con
Escape es un reflejo; que no pase nada se siente como que la página se colgó.

Son tres líneas en un sitio y las heredan las 82 pantallas. Lo dejé fuera hoy
porque tocaba a todas y no quería meterlo escondido en otro cambio.

**Esfuerzo:** bajo. **Impacto:** medio.

---

## 3 · Decir cuánto falta, no sólo cuánto llevas

Hoy el avance dice «45 %». No dice **cuántas lecciones quedan** ni **cuánto
tiempo son**. Las dos cosas están en los datos: `cem_lessons.duracion_min` existe
y casi nadie la usa.

«Te quedan 4 lecciones · unos 38 minutos» mueve mucho más que un 45 %, porque es
una decisión que se puede tomar ahora mismo: *¿me da tiempo antes de cenar?*

**Esfuerzo:** bajo. **Impacto:** alto.

---

## 4 · Un botón de «seguir donde lo dejé» que esté siempre

Ya se guarda el minuto del vídeo y la última lección. Pero para retomar hay que
entrar al panel, encontrar el curso, abrirlo y buscar por dónde ibas.

Un solo botón en la cabecera —«Seguir: lección 7 de Fotografía, min 4:12»— que
esté en todas las pantallas del estudiante. Es lo que hacen Netflix y Duolingo, y
es lo que separa a quien vuelve de quien lo deja.

**Esfuerzo:** medio. **Impacto:** alto.

---

## 5 · Avisar de la cuota ANTES de que venza, no después

El motor de avisos escala cuando la cuota **ya está vencida**. Para entonces la
persona ya está incómoda y la conversación empieza mal.

Un recordatorio amable tres días antes —«el jueves vence tu cuota de 60 €, aquí
tienes el enlace»— cobra más y enfada menos. La infraestructura de correo ya
está; es una consulta y una plantilla, de las que ahora se pueden escribir desde
la pantalla.

**Esfuerzo:** bajo. **Impacto:** alto, y se mide en dinero.

---

## 6 · Que el certificado se pueda enseñar sin explicar nada

Ahora el estudiante puede verlo e imprimirlo. Lo que no puede es **compartirlo
como imagen** en WhatsApp o LinkedIn, que es lo que realmente hace la gente
cuando se gradúa.

Un botón «Compartir mi certificado» que genere el PNG (con marca de agua, que ya
está hecha) y use `navigator.share`. Cada certificado compartido es publicidad
del CEM firmada por alguien que confía en él.

**Esfuerzo:** medio. **Impacto:** alto — es marketing gratis.

---

## 7 · Que la primera semana no dependa de que alguien se acuerde

Quien paga y entra ve un panel con cursos, cifras y un temario. Nadie le dice
qué hacer primero. Existe una tarjeta de bienvenida, pero es estática.

Una secuencia corta de tres correos —día 0, día 2, día 7— con una sola cosa que
hacer en cada uno. Ya hay motor de correo, plantillas y quién recibió qué: es
montar la secuencia, no construir nada.

**Esfuerzo:** medio. **Impacto:** alto — la primera semana decide si termina.

---

## 8 · Buscar dentro de una lección

Con treinta lecciones, «dónde explicaron el punto de equilibrio» se contesta
abriéndolas una a una. Hay buscador de títulos, pero no del contenido.

Guardar la transcripción de cada vídeo (YouTube ya las genera) y buscar en ellas,
saltando al minuto exacto. Convierte el curso en algo que se **consulta** después
de terminarlo, no sólo que se ve una vez.

**Esfuerzo:** alto. **Impacto:** alto, y es de las cosas que se recuerdan.

---

## 9 · Que se pueda estudiar sin datos

Buena parte de los alumnos están en Venezuela. La conexión se cae, y cuando se
cae la plataforma no sirve para nada.

Como mínimo: que el material descargable esté marcado como tal y se pueda
guardar de una vez para el módulo entero. Como máximo, un service worker que
guarde las lecciones ya vistas.

Empezar por lo mínimo: es un día de trabajo y quita un problema real.

**Esfuerzo:** bajo lo mínimo, alto lo máximo. **Impacto:** alto para quien lo sufre.

---

## 10 · Preguntar por qué se van, cuando se van

Hay pantalla para pedir una pausa o dejar un programa. Lo que no hay es la
pregunta: **¿por qué?**

Un campo, opcional, con cuatro motivos frecuentes y un hueco para escribir. En
seis meses eso es la lista de las cosas que hay que arreglar, ordenada por cuánta
gente perdiste por cada una. Ahora mismo esa información se pierde entera.

**Esfuerzo:** muy bajo. **Impacto:** alto a medio plazo.

---

## Si sólo se pueden hacer tres

**5, 3 y 2.** El aviso de cuota antes de vencer se paga solo; «cuánto te falta»
es media hora de trabajo y se nota en cada lección; y Escape cerrando los
diálogos son tres líneas que arreglan una molestia que hoy tiene todo el mundo,
en todas las pantallas.
