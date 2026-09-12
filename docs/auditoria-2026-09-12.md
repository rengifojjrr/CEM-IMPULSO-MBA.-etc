# Auditoría de la plataforma · 12 de septiembre de 2026

Qué se probó, qué se encontró y en qué orden conviene arreglarlo. Todo lo que
dice este documento se comprobó de verdad —abriendo las pantallas en un
navegador, llamando a las funciones del servidor como lo haría un desconocido
desde la calle, y leyendo la base de datos—, no leyendo el código y suponiendo.
Cuando algo no se pudo comprobar, se dice.

La versión con diagrama y flujograma está publicada como página aparte; este
archivo es la referencia que queda en el repositorio.

---

## En una página

**La máquina está bien construida y sana. Lo que no tiene es combustible.**

- 115 pantallas abiertas en Chromium: **0 errores de JavaScript, 0 recursos
  locales rotos salvo uno, 0 enlaces internos rotos, 0 desbordes en el
  teléfono**. Las 76 pantallas privadas mandan a la entrada como deben.
- 19 comprobaciones estáticas y 8 de SEO en verde; la revisión automática de
  GitHub lleva 395 ejecuciones y las últimas están todas en verde.
- Base de datos: RLS encendida en las 131 tablas; 381 funciones del CEM, todas
  con `search_path` fijado; las 88 que puede llamar un anónimo se protegen por
  dentro (se probó llamándolas sin sesión: devuelven vacío o «no autorizado»).
- 13 tareas programadas, 6.029 ejecuciones en las últimas 24 h, **0 fallos**.
- 33 cuentas, **30 entraron en los últimos 30 días**. 658 certificados
  verificables. 24 diplomas en físico esperando imprenta.

Y lo que frena todo:

- **No hay nada que comprar.** Un solo curso en la base (el de ensayo, pausado),
  0 publicados, sin fecha de próxima convocatoria. La portada de la plataforma
  enseña «0 programas abiertos» como cifra de orgullo. Todo el circuito de
  venta —comprar, cuotas, Stripe, recibos— está construido y parado.
- **La plataforma está vacía por dentro:** 1 módulo, 2 lecciones sin vídeo,
  0 evaluaciones, 0 cortos, 1 cohorte. El aula, las evaluaciones y el
  Express existen como pantallas, no como contenido.
- **437 visitas en septiembre → 4 contactos en toda la vida.** Sin ningún
  píxel ni analítica externa, así que no se puede pautar con conversión ni
  saber de dónde viene quien sí escribe.
- **Cemi no está donde cae el tráfico** (portada, páginas de programa,
  contacto: 224 de las 437 visitas). Ahí sólo hay un botón «¿Tienes dudas?»
  que lleva a un formulario.
- **El puente de WhatsApp lleva caído desde el 27 de agosto** y el modo está
  en «apagada». Verónica no contesta a nadie.
- **Un solo método de pago:** tarjeta en euros por Stripe. Para un público de
  Caracas no hay pago móvil, ni Zelle, ni transferencia con destino.

### Las tres cosas primero

1. **Abrir la convocatoria**: publicar los dos diplomados como cursos con
   precio, fecha y cohorte, y poner `proxima_convocatoria` en la
   configuración. Sin esto, ninguna mejora de captación tiene a dónde llevar.
2. **Cerrar los tres agujeros de permisos** (una hora de SQL, más abajo) y
   **rotar las tres claves** que siguen pendientes desde agosto (Resend,
   Stripe secreta, secreto del webhook). Esto es del dueño.
3. **Poner un píxel y a Cemi en las páginas donde llega la gente**, y un botón
   de WhatsApp de verdad. Es una tarde de trabajo y es lo único que convierte
   visitas en conversaciones.

---

## 1 · Cómo se probó

| Capa | Cómo | Alcance |
|---|---|---|
| Código | `revisar.mjs` (19 comprobaciones), `revisar-seo.mjs` (8), sintaxis de los 30 `.js/.mjs` y de los 165 `<script>` en línea | todo el repositorio |
| Pantallas | Chromium abre cada HTML servido en local; los dominios externos se relevan por `curl` porque este entorno no sale a la red desde el navegador. Se anotan errores de JS, consola, 404 locales, enlaces internos, redirección a la entrada, desborde horizontal en 390 px, y captura en escritorio y teléfono de las públicas | 115 pantallas (37 públicas, 76 con sesión) |
| Base | Advisors de seguridad y rendimiento de Supabase; permisos función por función; cuerpo de cada función que un anónimo o un usuario con sesión puede ejecutar; RLS y políticas de las 131 tablas; `pg_cron`; registros de PostgREST y de las funciones del servidor de las últimas 24 h | proyecto `vajbsfgojtunamhrzrpf` |
| Desde la calle | Llamadas reales con la clave publicable, sin sesión, a las funciones expuestas y a las tablas | 13 funciones, 12 tablas |
| Integraciones | Estado en `cem_integraciones`, colas y latidos en la base, respuesta HTTP de las 9 funciones del servidor del repositorio, y de las 16 desplegadas | Resend, Stripe, YouTube, Bancaribe, WhatsApp, Cemi, tasa BCV, GitHub Actions |
| Captación | Recorrido visitante → contacto con las capturas; formularios, botones, píxeles, cifras, copy; visitas y contactos reales de la base | portada, programas, contacto, inicio, catálogo |

Lo que **no** se pudo probar: las pantallas con sesión por dentro (las cuentas
de prueba `@pruebas.local` no están sembradas y no hay `CEM_PASS` aquí), y que
Cemi conteste de verdad (hace falta una sesión y la clave del modelo). Las 32
pruebas de navegador del repositorio (`pruebas/`) tampoco pueden correr por
lo mismo — ni aquí ni en GitHub, donde `CORRER_PRUEBAS_E2E` sigue sin
activarse.

---

## 2 · Lo que está roto o mal puesto

Ordenado por lo que más importa. 🔴 roto o riesgo · 🟠 frena el uso o la
captación · 🟡 mejora · 🔵 decisión del dueño.

### 2.1 · Seguridad y permisos

| | Qué | Prueba | Arreglo |
|---|---|---|---|
| 🔴 | **Seis tareas programadas las puede disparar cualquier usuario con sesión**: `cem_correo_recoger`, `cem_tasa_bcv_recoger`, `cem_stripe_sync_revisar`, `cem_compras_rescatar`, `cem_bot_resumen_semanal_enviar`, `cem_alertas_gobierno_avisar`. Y **`cem_alertas_gobierno` devuelve las alertas de gobierno** —quién aprobó y anuló pagos, con su correo— a cualquier sesión, sin mirar el rol. | Cuerpo de las funciones: ninguna comprueba rol. Grants: `authenticated` tiene EXECUTE. | `revoke execute … from authenticated` en las siete. El cron corre como `postgres` y no las necesita. 20 minutos. |
| 🔴 | **Claves pendientes de rotar** desde agosto: la de Resend, la secreta de Stripe (modo real) y el secreto del webhook. | Anotado en sesiones anteriores; siguen las mismas. | Rotar en Resend y Stripe, pegar en `cem_integraciones` desde Admin → Cobros con tarjeta y Admin → Correo. Sólo el dueño. |
| 🟠 | **Cuatro funciones de otro proyecto escriben y leen sin ninguna comprobación**, y las puede llamar un anónimo: `upsert_quote` (×2), `upsert_pm_project`, `get_quote`, `get_pm_project`. Son del gestor de proyectos «SEM» (`proyectos.html`), no del CEM, pero viven en la misma base. | Cuerpo: `insert … on conflict do update` sin `auth`, `SECURITY DEFINER`, EXECUTE para `anon`. | Revocar a `anon` y `authenticated`, o llevarse ese proyecto a su propia base. |
| 🟠 | **Una sola base para cuatro aplicaciones.** 30 tablas y 3 funciones del servidor son de otros proyectos (`cq_*`, `forest_*`, `fb360_*`, `pm_*`, `quotes`). Un fallo o una fuga en cualquiera de ellos es un fallo en el CEM. | `pg_class`, `list_edge_functions`. | Separar proyectos de Supabase. No urge, pero cada mes que pasa cuesta más. |
| 🟠 | **Siete funciones desplegadas no están en el repositorio**: `cem-bancaribe`, `cem-bancaribe-probe`, `cem-youtube-oauth-exchange`, `cem-youtube-upload-token`, `forest-ai-recognize`, `forest-admin-users`, `fb360`. No se pueden auditar ni volver a desplegar si se pierden. | Repo: 9 carpetas. Desplegadas: 16. | Bajar el código de las cuatro del CEM al repositorio; las tres ajenas, a su proyecto. |
| 🟡 | Protección contra contraseñas filtradas **desactivada** en Auth. | Advisor de seguridad. | Un interruptor en Supabase → Authentication → Settings. |
| 🟡 | `cem_cohorts` la lee cualquiera desde la calle: nombre, código, horario, salón, cupos. No es grave, pero tampoco hace falta. | `select` anónimo devuelve filas. | Política de lectura sólo para autenticados, o una función pública que devuelva lo justo. |
| ✓ | Las 88 funciones públicas `SECURITY DEFINER` del CEM se protegen por dentro (`cem_is_staff()`, tokens, `auth.uid()`). Se llamaron sin sesión: campañas, formularios y respuestas devuelven `[]`; las de administración, «unauthorized». `cem_settings` ya **no** se lee desde la calle (el §3.6 de *lo-que-falta* está desactualizado). | | |

### 2.2 · Código y pantallas

| | Qué | Prueba | Arreglo |
|---|---|---|---|
| 🔴 | **La cara de Cemi da 404 en el verificador público del QR** (`certificados/verificar.html`): `asistente.js` arma la ruta con `raizAssets()`, que para una pantalla fuera de `plataforma/` apunta a `certificados/assets/`, que no existe. Es la pantalla que abre quien recibe un diploma. | Único 404 local de la pasada. | Que `raizAssets()` resuelva contra `/plataforma/assets/` en vez de contra la carpeta actual. |
| 🟠 | **`cem_tasa_vigente` tiene dos firmas** (sin parámetro y con `p_moneda`) y PostgREST no sabe cuál elegir cuando se llama sin argumentos: devuelve `PGRST203`. Hoy las dos pantallas que la usan pasan la moneda, así que no rompe; la próxima llamada que no lo haga, sí. | Llamada sin parámetros desde la calle. | Borrar la firma sin parámetro. |
| 🟠 | **`plataforma/inicio.html` enseña «0 programas abiertos»** en la fila de cifras de la portada. | Captura. | Ocultar la cifra cuando sea cero, y en su lugar mostrar la próxima convocatoria. |
| 🟠 | **Las cifras se contradicen entre páginas**: «2.500+ estudiantes formados» (escrito a mano en `inicio.html`) frente a «125/126 personas graduadas» (contadas de la base) en la portada y en programas; «desde Caracas… cualquier parte de Venezuela» frente a «hoy damos clase en nueve países». Quien compare pierde la confianza. | Capturas de `index.html`, `plataforma/inicio.html`, `programas/`. | Decidir una sola historia y sacarla de un solo sitio (`cem_vitrina_publica`). |
| 🟡 | **Notificaciones lentas**: `cem_mis_notificaciones` se llama 836 veces al día (cada pestaña abierta, cada 2 minutos), tarda 518 ms de media y 5,7 s en el peor caso, con **21 errores 5xx en 24 h**. PostgREST registró 732 hilos matados por tiempo en el mismo periodo. | Registros de `edge_logs` y `postgrest_logs`. | Medir con `EXPLAIN ANALYZE` con un usuario real; probablemente `cem_notificacion_categoria()` fila a fila y el `count` de no leídas repetido por fila. Y bajar el sondeo a 5 minutos. |
| 🟡 | **Los botones flotantes se pisan**: en el catálogo y en `inicio.html` conviven «10% OFF» (izquierda), «¿Tienes dudas?» y «Cemi» (derecha); en el teléfono «¿Tienes dudas?» tapa el desplegable de contacto y en escritorio los tres pisan la fila de cifras y el pie. | Capturas. | Una sola burbuja que agrupe promo y ayuda, o esconder la promo cuando Cemi está abierto. |
| 🟡 | En `contacto.html` en el teléfono, la lista «Otras formas de llegar a nosotros» se parte en dos columnas y las frases quedan cortadas («se verifica solo, con su código» en otra columna). | Captura móvil. | Quitar `columns`/grid de `.contacto-lista` por debajo de 640 px. |
| 🟡 | `cem_visita_anotar` borra las barras del nombre de pantalla: `programas/branding` se guarda como `programasbranding`. Las métricas por página siguen siendo distinguibles, pero ilegibles. | Filas de `cem_visitas`. | Permitir `/` en la limpieza. |
| 🟡 | `periodo_activo` en la configuración dice **2024-09-01 → 2024-12-15**. | `cem_settings`. | Ponerlo al día o dejar de usarlo. |
| 🟡 | **Higiene del repositorio público**: `Archivo.zip`, `Archivo 2.zip`, `Archivo 3.zip` (50 MB de capturas de pantalla de agosto) se sirven en escuelacem.com y pesan en cada clon; `admin.html`, `proyectos.html` y `mejorasparaelCEM.html` son restos del proyecto SEM (bloqueados en robots, pero públicos; `mejorasparaelCEM.html` tarda 12 s y pide tipografías a Google Docs); y `index.html` arrastra un `location.replace('proyectos.html')` para direcciones con `?p=`. | `git ls-files`, pasada por navegador. | Borrarlos. Las capturas, si hacen falta, a un almacenamiento aparte. |
| 🟡 | **Documentos desactualizados**: *lo-que-falta* §1.1 dice «138 correos parados» (el correo funciona: 67 enviados, último el 11 de septiembre), §1.2 habla de dos métodos sin destino (hoy hay uno), §3.6 dice que `cem_settings` se lee desde la calle (ya no). El README de `pruebas/` dice 7 archivos y 146 comprobaciones; hay 32 archivos y unas 900. | Base y repositorio. | Reescribir esos apartados. |

### 2.3 · Datos y operación

| | Qué | Detalle |
|---|---|---|
| 🔵 | **24 diplomas en físico en estado «pedido»**, ninguno impreso ni enviado. | Es la pantalla nueva de *Diplomas en físico*; el lote está listo para bajar en un solo PDF. |
| 🔵 | **7 alertas de gobierno y 2 avisos de mora de 15 días sin leer** (el más reciente del 11 de septiembre). | `cem_notificaciones`. |
| 🔵 | Cuentas: **28 estudiantes, 2 superadministradores, y ningún docente, coordinador, cobranza ni auditor.** Los paneles de esos cuatro roles no los ha usado nunca una persona real. | `cem_profiles`. |
| 🔵 | Oscar Beltrán sigue con dos cuentas (una de estudiante con documento sospechoso). Anotado en sesiones anteriores, sin decidir. | |
| 🔵 | Los 12 diplomas de Marketing · Noche · Grupo 12 siguen sin emitir (decisión tomada: «mejor no emitirlos aún»). | *lo-que-falta* §1.9 |
| 🔵 | Egresados de la tanda con 0 inscripciones (p. ej. Dylan Becerra: 0 inscripciones, 9 diplomas). Crear inscripciones es un dato académico; queda a decisión. | |

---

## 3 · Integraciones: estado real hoy

| Integración | Estado | Evidencia |
|---|---|---|
| **Correo (Resend)** | ✓ funciona | 67 enviados, último 11-sep; 50 descartados a propósito (direcciones de prueba); 6 fallos por límite de envío (429) el 27-ago. La cola está vacía. |
| **Tasa BCV** | ✓ al día | EUR 968,07 · USD 832,49 del 11-sep; se pide dos veces al día. |
| **Stripe** | ✓ listo, sin uso | Modo real, claves vivas, firma del webhook verificada (responde 401 a una firma falsa). 1 sesión pagada (24-ago), 1 abierta. |
| **Bancaribe** | ⚠ en pruebas | Ambiente `qa`; el endpoint de notificación pide clave y frena intentos. Nunca se ha conciliado un extracto real (§3.2). |
| **WhatsApp / Verónica** | ✗ caído | Puente `conectado=false`, último latido **27-ago 03:03**; modo `apagada`; 9 mensajes atendidos en su vida. La función `cem-whatsapp` sí responde (`ok`, y 403 a un reto sin token). |
| **Cemi (web)** | ⚠ vivo, casi sin uso | La función responde (400 «No llegó ninguna pregunta» sin sesión). 23 herramientas repartidas por rol. **5 conversaciones en total; 3 fichas en «Lo que sabe».** Sólo se monta en las pantallas con `app.js` (inicio, catálogo, nosotros, plataforma); no en portada, programas ni contacto. No se pudo comprobar que conteste: hace falta sesión y `GROQ_API_KEY`. La cadena de modelos son dos de Groq; si Groq cae, cae todo (lo dice el propio manual). |
| **YouTube** | ✓ conectado | `refresh_token` guardado, canal conectado el 18-ago. Pero 0 lecciones con vídeo. |
| **GitHub Actions** | ✓ verde | Revisión en cada push (395 ejecuciones), páginas SEO regeneradas a diario, Pages publicando. Las pruebas de navegador **nunca** corren (`CORRER_PRUEBAS_E2E` sin activar, cuentas sin sembrar). |
| **Tareas programadas** | ✓ | 13 tareas, 6.029 ejecuciones en 24 h, 0 fallos: cuotas, correo, alertas, informe mensual, Stripe, tasa, resumen semanal, vigilancia del puente, rescate de compras, certificados, recordatorios de clase. |

---

## 4 · Captación: por qué no entra gente

### Los números

- **437 visitas en septiembre** (423 directas, 14 desde buscadores).
  Portada 155 · programas 45 · diplomado de marketing 24 · verificador 66 ·
  catálogo 21 · contacto 2.
- **4 contactos en toda la vida** (2 por un recurso descargable, 1 por la
  promo del catálogo, 1 «avísame» el 10 de septiembre). Ningún correo de
  seguimiento enviado nunca (`cem_lead_envios` = 0, plantillas = 0).
- **0 cursos publicados, sin fecha de convocatoria.** `cem_vitrina_publica`
  dice `programas: 0`; el catálogo dice «Ahora mismo no hay inscripciones
  abiertas».

### Lo que hay que hacer, en orden

1. **Abrir la convocatoria.** Publicar los dos diplomados como cursos (precio,
   modalidad, cohorte con fecha) y poner `proxima_convocatoria` en
   configuración. Cada página de programa ya tiene la caja «Próxima
   convocatoria» y el botón «Inscribirme»; hoy dicen «todavía sin fecha».
2. **Medir.** Instalar un píxel (GA4 y/o Meta) con eventos: «avísame»,
   «contacto», «verificar», «inscribirme». Sin esto no se puede pautar ni saber
   qué página convierte. Hoy: nada.
3. **Cemi y WhatsApp donde cae la gente.** Montar el asistente en modo
   visitante en `index.html`, `programas/*` y `contacto.html` (224 de las 437
   visitas), y cambiar «¿Tienes dudas?» → formulario por un botón de WhatsApp
   directo. Reconectar el puente y poner el modo en «responde».
4. **Formas de pago del sitio.** Añadir pago móvil, Zelle y transferencia con
   sus destinos en *Formas de pago*; hoy sólo hay tarjeta en euros.
5. **Seguimiento automático.** Al «avísame» y al contacto: un correo el mismo
   día, otro a los 3 días con el temario, otro al abrir la convocatoria. Las
   piezas existen (`cem_lead_envios`, plantillas); están vacías.
6. **Una sola historia y una sola fuente de cifras.** Quitar «0 programas
   abiertos», decidir «Caracas» o «nueve países», y que «estudiantes formados»
   salga del mismo sitio que «graduados».
7. **Prueba social.** 658 certificados y 126 graduados es el activo más fuerte
   y ya se enseña; falta ponerle cara: tres testimonios y los perfiles públicos
   de egresados (`perfil-publico.html` existe) en la portada.
8. **Tráfico orgánico.** El SEO técnico está sano (19 páginas de programa,
   sitemap, canonical, datos estructurados) pero sólo trae 14 visitas al mes:
   no hay contenido que buscar. Un artículo quincenal por módulo («qué hace un
   community manager en Caracas») y enlaces desde redes.

---

## 5 · Previsualizaciones y atajos que faltan

Revisado leyendo cada pantalla (no se pudo entrar con sesión).

### Previsualizaciones

| Pantalla | Qué falta |
|---|---|
| Admin → Envío de correo | Ver el correo como lo verá quien lo recibe antes de enviarlo. Hoy se envía a ciegas. |
| Admin → Comunicaciones | Igual: el anuncio no se ve montado antes de publicarlo. |
| Admin → Insignias | Ver la insignia (imagen y texto) como la verá el estudiante en *Mis logros*. |
| Admin → Campañas y premios | Ver el cupón/premio como lo verá quien lo reciba. |
| Admin → Listas de pre-registro | Sólo «abrir en otra pestaña»; falta la previa del formulario público al lado del editor. |
| Admin → Crear programa | Previa de la página pública del programa antes de publicar. |
| Estudiante → Mis evaluaciones | Ver de qué va una evaluación (preguntas, tiempo, intentos) antes de empezarla. |
| *lo-que-falta* §2.6 | Un PDF no enseña su primera página (Biblioteca ya tiene previa; queda el resto). |

Ya tienen previa: multimedia, biblioteca, recursos, constructor de contenido,
vídeos, certificados (miniatura + abrir), diplomas en físico, plantillas.

### Atajos

| Pantalla | Qué falta |
|---|---|
| Admin → Estudiantes | Selección múltiple: mandar un mensaje, asignar cohorte o exportar sólo los marcados. Hoy no hay ni una casilla. |
| Admin → Cohortes | Exportar la lista, mandar un mensaje a todo el grupo, duplicar cohorte para la siguiente convocatoria. Hoy no hay nada de eso. |
| Docente → Mi grupo | Acciones en lote (marcar asistencia de todos, recordar entrega a los que faltan). |
| Admin → Contactos de la web | Ya tiene WhatsApp y correo en un clic ✓. Falta «marcar como atendido» en la misma fila. |
| Admin → Verificar pagos | Ya tiene aprobar en un clic ✓. |
| Diplomas en físico | Ya tiene selección, PDF del lote y cambio de estado en lote ✓ (esta semana). |

---

## 6 · Plan de trabajo

**Tarde 1 (código, sin decisiones):** revocar las siete funciones a
`authenticated` y las cuatro del SEM a `anon`; activar la protección de
contraseñas; arreglar `raizAssets()`; borrar la firma sin parámetro de
`cem_tasa_vigente`; permitir `/` en `cem_visita_anotar`; esconder «0 programas
abiertos»; borrar zips y páginas del SEM; poner al día *lo-que-falta* y el
README de pruebas.

**Dueño, esta semana:** rotar las tres claves; reconectar el puente de
WhatsApp (QR) y pasar el modo a «responde»; decidir la convocatoria (fecha,
precio, cohorte); decidir las formas de pago locales; imprimir los 24 diplomas
pedidos; leer las 9 alertas sin leer.

**Semana 2 (captación):** publicar los cursos y la convocatoria; píxel y
eventos; Cemi + WhatsApp en portada, programas y contacto; formas de pago;
secuencia de seguimiento a contactos; una sola historia en el copy.

**Semana 3 (producto):** previsualizaciones de correo, comunicaciones,
insignias y campañas; selección múltiple en Estudiantes y acciones de grupo en
Cohortes; rendimiento de notificaciones; traer al repositorio las cuatro
funciones del CEM que sólo existen desplegadas; sembrar las cuentas de prueba y
activar `CORRER_PRUEBAS_E2E` para que las 32 pruebas corran en cada push.

**Cuando toque:** separar los cuatro proyectos de Supabase; alimentar «Lo que
sabe» de Cemi; contenido de los cursos (hoy 2 lecciones sin vídeo).
