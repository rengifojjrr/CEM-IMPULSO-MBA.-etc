# Prompt para hacer una radiografía de cualquier proyecto

Es el método con el que se hizo `docs/auditoria-2026-09-12.md`, escrito como
encargo para pegarlo tal cual en el chat de otro proyecto. Va en dos partes:
la radiografía (sólo mirar y contar) y, si convence, aplicar lo que salió.

---

## Prompt 1 · La radiografía

```
Quiero una radiografía completa de este proyecto: qué está bien, qué está roto,
qué falta, y en qué orden conviene arreglarlo. En esta fase NO CAMBIES NADA:
sólo mira, prueba y cuenta. Trabaja sin preguntarme; si algo no se puede
comprobar, dilo en el informe en vez de suponerlo.

REGLA DE ORO: todo lo que afirmes tiene que estar comprobado de verdad
—abriendo las pantallas, llamando a las funciones como lo haría un
desconocido, leyendo la base de datos, mirando los registros—, no leyendo el
código y deduciendo. Cada hallazgo lleva su evidencia: archivo y línea,
consulta y resultado, captura o respuesta HTTP. Las cifras salen de la base o
de los registros, nunca de memoria.

QUÉ MIRAR, POR CAPAS

0. Inventario. Qué es el proyecto, para quién, con qué está hecho, dónde se
   despliega y cómo (qué rama publica, qué tareas automáticas hay), qué
   documentación tiene y si está al día. Qué hay desplegado que no esté en el
   repositorio y al revés. Si hay algo secreto escrito en el código o en el
   historial (claves, contraseñas, correos), dilo sin copiar el valor.

1. Código. Corre lo que el proyecto ya tenga (linters, pruebas,
   comprobaciones propias). Sintaxis de todos los scripts y de los <script>
   en línea. Enlaces internos, recursos locales que no existen, archivos
   generados editados a mano, archivos enormes o basura en el repositorio.

2. Pantallas. Abre CADA página en un navegador (Chromium), en escritorio y
   en un teléfono de 390 px: errores de JavaScript, mensajes en consola,
   recursos 404, enlaces rotos, desborde horizontal, botones sin nombre
   accesible, pantallas privadas que no mandan a la entrada. Captura de las
   públicas. Si hay cuentas de prueba, entra con cada rol y recorre lo suyo.

3. Base de datos y seguridad. Qué tablas tienen filas y cuáles están vacías.
   RLS y políticas tabla por tabla. Permisos de cada función: cuáles puede
   ejecutar un anónimo y qué devuelven si las llamas sin sesión (llámalas de
   verdad con la clave pública). search_path fijado. Tareas programadas y sus
   fallos. Los avisos de seguridad y rendimiento del proveedor. Los registros
   de las últimas 24 horas: errores, 4xx/5xx, lentitud.

4. Integraciones. Para cada servicio externo (correo, pagos, mensajería,
   analítica, vídeo, bancos, IA): si está configurado, si tiene clave, cuándo
   fue su último evento real, si hay colas atascadas o latidos caídos, qué
   responde hoy cada función del servidor. Estado real, no el que dice la
   documentación.

5. El negocio. Recorre el camino de una persona desde que llega hasta que
   paga o se registra: qué la frena, qué está construido pero apagado (0
   productos, sin fecha, sin método de pago local), qué se mide y qué no
   (píxeles, analítica, eventos), dónde cae el tráfico y si ahí hay con quién
   hablar (chat, WhatsApp, formulario), si el texto público cuenta una sola
   historia con cifras de una sola fuente. Visitas y contactos reales de la
   base, no estimados.

6. Fricción por rol. Para cada tipo de persona que usa el sistema: qué hace
   todos los días y cuántos pasos le cuesta; qué le falta ver antes de
   confirmar (previsualizaciones); qué atajo le ahorraría un viaje.

QUÉ ENTREGAR

Un archivo docs/auditoria-<fecha>.md con esta estructura, en este orden:
- «En una página»: el estado en cinco líneas, con cifras, y luego lo que frena
  todo. Empieza con la frase que resume el diagnóstico.
- «Las tres cosas primero».
- «Cómo se probó»: una tabla capa / cómo / alcance, y aparte lo que NO se
  pudo probar y por qué.
- «Lo que está roto o mal puesto», ordenado por lo que cuesta si sale mal
  (no por lo que cuesta arreglarlo), separando seguridad, código y datos.
- «Integraciones: estado real hoy».
- «El negocio: por qué no entra (o no cobra)».
- «Fricción y atajos», por rol.
- «Plan de trabajo», en dos listas separadas: lo que puede hacer el agente
  sin decisiones tuyas, y lo que SÓLO puede hacer el dueño (cuentas, claves,
  dinero, decisiones de negocio). Cada punto con su tarde/semana estimada.

Además, una página aparte (artefacto) con el mismo informe en limpio, un
diagrama de cómo está montado el sistema y un flujograma del camino de la
persona, para poder leerlo y compartirlo sin abrir el repositorio.

REGLAS
- No arregles nada durante la radiografía, ni «de paso».
- No crees ni borres datos, salvo filas de prueba que tú mismo hayas creado,
  y bórralas por su id al terminar. Nunca borres tablas «para limpiar».
- No escribas ningún secreto en el informe ni en el chat.
- Comprueba lo publicado pidiendo el archivo en vivo, no mirando el estado de
  la integración continua.
- Si algo te parece bien construido, dilo también: una radiografía es un
  diagnóstico, no una lista de quejas.
```

## Prompt 2 · Aplicar lo que salió

```
Tomando la radiografía que acabas de hacer, aplica TODAS las correcciones que
puedas hacer tú, sin preguntarme, en el orden del informe. Lo que sólo pueda
hacer yo, déjamelo en una lista aparte, ordenada por lo que duele, con dónde
se hace cada cosa. Antes de dar algo por hecho, compruébalo en vivo. Cuando
termines, actualiza el informe con una sección «Qué se hizo con esto» y la
fecha, y dime en el chat qué cambió para las personas que usan el sistema.
```

---

Lo que conviene adaptar al pegarlo: el nombre de la carpeta de documentos si
no es `docs/`, y las cuentas de prueba si las hay (dónde están, cómo se
entra). Todo lo demás vale para cualquier proyecto con pantallas, una base y
servicios externos.
