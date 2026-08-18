# Conectar YouTube — paso a paso

Los videos de los cursos no se guardan en la plataforma: se suben a un canal de
YouTube en modo **«no listado»**, y la plataforma guarda sólo el enlace. Nadie
los encuentra buscando en YouTube, pero quien tiene el enlace los ve — y el
enlace sólo se lo damos al estudiante que pagó.

Se hace así por una razón de dinero. Un curso de 30 lecciones en HD son unos
15 GB. En Supabase Storage eso son unos 300 € al año sólo de almacenamiento, más
el ancho de banda cada vez que alguien le da al play. En YouTube son 0 €, sin
límite práctico, con reproductor que ajusta la calidad a la conexión de cada uno
—que en Venezuela no es un detalle menor— y sin que los bytes del video pasen
nunca por nuestro servidor: el navegador de quien sube habla directo con Google.

Son **tres partes**: crear la app en Google (una vez, 15 minutos), guardarla en
la plataforma (un minuto) y conectar el canal (dos clics). Sólo la primera tiene
enjundia.

---

## Antes de empezar

Necesitas dos cosas:

1. **Una cuenta de Google que sea dueña del canal** donde van a vivir los
   videos. Recomendación: crea un canal dedicado —«CEM Formación», por ejemplo—
   en lugar de usar uno personal. Si algún día cambia quién administra la
   escuela, se entrega el canal y ya; no hay que desenredar una cuenta personal.
2. **Entrar en la plataforma como administrador**, en
   **Configuración → Integración con YouTube**.

Ten esa pantalla abierta en una pestaña: en el paso 4 vas a copiar una dirección
de ahí.

---

## Parte 1 · Crear la app en Google Cloud

Esto se hace **una sola vez**. Le estás diciendo a Google: «existe una
aplicación llamada CEM que va a pedir permiso para subir videos».

### 1. Crear el proyecto

Entra en <https://console.cloud.google.com/> con la cuenta dueña del canal.

Arriba a la izquierda, junto al logo, hay un selector de proyecto. Pulsa
**Proyecto nuevo**, ponle un nombre reconocible —`CEM Plataforma`— y crea.
Espera a que el selector muestre ese proyecto: **todo lo demás tiene que
hacerse con él seleccionado**, y es el fallo más común de este proceso.

### 2. Habilitar la API de YouTube

Busca arriba **«YouTube Data API v3»** y entra en el resultado del Marketplace.
Pulsa **Habilitar**.

Sin esto, todo lo demás se configura bien y las subidas fallan con un error que
no explica nada.

### 3. La pantalla de consentimiento

Menú lateral → **APIs y servicios → Pantalla de consentimiento de OAuth**.

- **Tipo de usuario: Externo.** «Interno» sólo existe si tienes Google
  Workspace, y aun teniéndolo, «Externo» va bien.
- **Nombre de la aplicación:** `CEM International`. Es lo que va a leer quien
  dé el permiso, así que que se entienda.
- **Correo de asistencia** y **datos de contacto del desarrollador:** tu correo.
- **Permisos (scopes):** puedes dejarlo vacío aquí; los pedimos desde la
  plataforma. Si insiste, añade `youtube.upload`.
- **Usuarios de prueba:** añade la dirección de Gmail de la cuenta dueña del
  canal. **Si no la añades, Google te va a rechazar la conexión** aunque todo
  lo demás esté bien.

Guarda.

> **Lo de los 7 días.** Mientras la app esté en modo «Prueba», Google caduca el
> acceso **cada 7 días** y hay que volver a pulsar «Conectar». No es un fallo:
> es la política de Google para apps sin verificar. Para quitarlo hay que
> mandar la app a verificación, que tarda semanas y pide un dominio verificado —
> no vale la pena hasta que la escuela tenga su dominio propio funcionando. Con
> reconectar una vez por semana se vive bien; y cuando se pasa, la pantalla lo
> dice con esas palabras en vez de dar un error críptico.

### 4. Crear las credenciales

**APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth.**

- **Tipo de aplicación: Aplicación web.** No «Escritorio», no «Otro».
- **Nombre:** `Plataforma CEM`.
- **URI de redirección autorizados** → *Añadir URI*, y pega **exactamente**
  esto:

  ```
  https://rengifojjrr.github.io/CEM-IMPULSO-MBA.-etc/plataforma/admin/youtube-conectar.html
  ```

  No lo teclees. La pantalla de la plataforma te la enseña con un botón
  **Copiar** justamente para esto: si sobra una barra al final, o falta una
  letra, Google rechaza la conexión con `redirect_uri_mismatch` y no dice dónde
  está la diferencia. Cuando la escuela tenga dominio propio habrá que añadir
  también la URL nueva (se pueden tener las dos a la vez).

Pulsa **Crear**. Google enseña un cuadro con dos datos:

| Dato | Aspecto | ¿Es secreto? |
|---|---|---|
| **ID de cliente** | `1234...-abc....apps.googleusercontent.com` | No: viaja en la URL a la vista de todos |
| **Secreto de cliente** | `GOCSPX-...` | **Sí, y sólo se enseña una vez** |

**Copia el secreto ahora.** Si cierras ese cuadro sin copiarlo, no se puede
recuperar: hay que generar otro.

---

## Parte 2 · Guardar la app en la plataforma

En **Configuración → Integración con YouTube**, en la tarjeta
**«Paso 1 · La app de Google»**:

1. Pega el **ID de cliente**.
2. Pega el **secreto de cliente**.
3. **Guardar**.

La URL de retorno no hay que escribirla: la plataforma usa la de esa misma
página, que es por construcción la correcta.

El secreto se guarda del lado del servidor y **no vuelve a salir**: a partir de
ahí la pantalla enseña sólo los cuatro últimos caracteres, para que puedas
reconocerlo. Guardarlo queda registrado en la auditoría, porque quien puede
cambiar esas credenciales puede subir videos en nombre de la escuela.

---

## Parte 3 · Conectar el canal

En la misma pantalla, tarjeta **«Paso 2 · El canal»** → **Conectar con
YouTube**.

Google te pide iniciar sesión y te avisa de que la app no está verificada:
**Configuración avanzada → Ir a CEM International (no seguro)**. Es tu propia
app; el aviso es porque no pasó la verificación de Google, no porque haya nada
malo.

Acepta los dos permisos (subir videos y ver el canal). Vuelves a la plataforma y
la tarjeta muestra el nombre del canal conectado.

Ya está. En **Contenido**, al añadir una lección de video, aparece la opción de
subir el archivo directamente.

---

## Cuando algo falla

| Lo que dice | Qué pasó |
|---|---|
| `redirect_uri_mismatch` | La URI de Google Cloud no coincide con la de la página. Copia la de la pantalla con el botón y pégala en Google Cloud. Mira que no sobre una barra al final. |
| `access_denied` | La cuenta con la que iniciaste sesión no está en **Usuarios de prueba** de la pantalla de consentimiento. |
| «Google no devolvió un refresh_token» | Ya le habías dado permiso antes. Entra en <https://myaccount.google.com/permissions>, revoca el acceso de «CEM International» y vuelve a conectar. |
| Las subidas fallan de golpe tras una semana | Es el corte de los 7 días del modo «Prueba». Pulsa **Reconectar**. |
| «no_autorizado» al subir | Tu rol no puede subir contenido. Pueden: profesor, coordinador, admin y superadmin. |
| Falla al subir y el canal figura conectado | Comprueba que la **YouTube Data API v3** esté habilitada en el proyecto **correcto** de Google Cloud. |

---

## Qué NO hay que hacer

- **No pongas el secreto de cliente en el repositorio**, ni en un HTML, ni en un
  mensaje. Va sólo por la pantalla, que lo guarda del lado del servidor.
- **No borres el canal de YouTube ni pongas los videos en privado**: la
  plataforma guarda el enlace, no una copia. Si desaparece de YouTube,
  desaparece del curso. «No listado» sí; «Privado» no —privado significa que ni
  con el enlace se ve.
- **No conectes un canal que ya uses para otra cosa** sin pensarlo: quien
  administre la plataforma puede subir a él.

---

## Dónde vive cada cosa

| Pieza | Dónde | Qué hace |
|---|---|---|
| Pantalla | `plataforma/admin/youtube-conectar.html` | Configurar y conectar |
| Guardar/quitar credenciales | `cem_youtube_app_guardar`, `cem_youtube_app_quitar` | Sólo admin, auditado |
| Estado | `cem_youtube_app_estado` | Nunca devuelve el secreto entero |
| Canjear el permiso | Edge Function `cem-youtube-oauth-exchange` | Cambia el código de Google por un permiso duradero |
| Permiso para subir | Edge Function `cem-youtube-upload-token` | Da un permiso de minutos al navegador, para que el video no pase por nuestro servidor |
| Credenciales | Tabla `cem_integraciones`, filas `youtube_oauth_app` y `youtube` | Sólo alcanzables con la cuenta de servicio |


---

## Las listas de reproducción

Ten los vídeos de cada programa en su propia lista de reproducción de YouTube y
la plataforma los empareja con las lecciones.

En **Contenidos → Vídeos del curso**: eliges el programa, pegas la dirección de
la lista y la plataforma se trae sus vídeos con título y miniatura. A la derecha
salen los módulos y las lecciones. Pones cada vídeo en la suya, o pulsas
*«Emparejar por título los que se parezcan»* — que propone, no decide: enseña la
lista de parejas y espera tu visto bueno, porque un vídeo en la lección
equivocada no da ningún error, simplemente está mal y se entera el alumno.

Lo que más sirve del día a día: si subes seis vídeos nuevos a la lista, la
pantalla avisa de que hay **seis vídeos sin asignar**. Enterarse por ahí y no
por la queja de alguien es toda la diferencia.

De la lista sólo se guarda a qué lección corresponde cada vídeo. Los vídeos
siguen viviendo en YouTube.

---

## Qué protege el vídeo, y qué no

Conviene tenerlo claro antes de prometer nada a nadie.

**Lo que NO se puede hacer, aquí ni en ninguna web:**

- **Esconder el enlace del vídeo.** Para reproducirlo, el navegador tiene que
  pedirlo; quien abra las herramientas del navegador lo ve. Pasa igual en
  Netflix, Udemy y Hotmart.
- **Impedir que graben la pantalla.** No existe forma de bloquearlo desde una
  página, y aunque existiera, ahí está el teléfono apuntando a la pantalla.

Con YouTube hay además un agujero concreto: **un vídeo «no listado» lo puede ver
cualquiera que tenga el identificador**, entrando directo a youtube.com. YouTube
no permite restringir la reproducción a un dominio. El identificador es la
llave, y si se filtra, se filtró para siempre.

**Lo que sí se hace, de más a menos eficaz:**

| | Qué es | Contra qué sirve |
|---|---|---|
| **Marca de agua** | El nombre y el documento del alumno, encima del vídeo, cambiando de sitio cada 8 segundos | Lo único que frena de verdad: la grabación filtrada lleva el nombre de quien la hizo |
| **Registro de reproducción** | Quién vio qué, cuándo y desde qué IP | Delata contraseñas compartidas: una cuenta desde seis IPs en un día no es una persona estudiando |
| **El muro de pago** | El identificador del vídeo sólo se entrega a quien pagó, y a nivel de columna en la base | Que el material no salga antes de la puerta |
| **Reproductor endurecido** | Dominio sin cookies, sin sugerencias al terminar, sin clic derecho, tapadas las esquinas que llevan a YouTube | El despiste del 90% que no es técnico. Contra alguien decidido, nada |

La marca de agua va sobre el reproductor, no dentro, así que **desaparece a
pantalla completa** — es una limitación real del `<iframe>` de YouTube. Por eso
el registro de reproducción no es un extra: es lo que cubre ese hueco.

En **Auditoría** está la lista de cuentas con reproducción sospechosa: las que
aparecen desde tres o más direcciones distintas en el último mes.

### Si algún día hace falta más

La salida es dejar YouTube por **Cloudflare Stream**: enlaces firmados que
caducan en minutos y DRM de verdad. Cuesta dinero — del orden de $5 por cada
1.000 minutos almacenados al mes y $1 por cada 1.000 servidos; un curso de 10
horas con 100 alumnos viéndolo entero anda por los $60-70 al mes, frente a $0
ahora.

**Recomendación: no antes de ver que se está filtrando.** El DRM impide
descargar pero no impide una cámara, y se paga todos los meses desde el primer
día. La marca de agua ataca el problema real —alguien que reparte el curso— y
sale gratis.


---

## Aprendizaje express (shorts verticales)

Vídeos de uno o dos minutos, verticales, uno detrás de otro. Para repasar antes
de un examen, refrescar una definición o picar algo suelto sin abrir una clase
de cuarenta minutos.

**Cómo se sube.** Subes el short a YouTube como **no listado**, igual que las
clases. En **Contenidos → Vídeos del curso**, al final de la pantalla, pegas su
dirección —la de `youtube.com/shorts/…`, tal cual la copia el teléfono— y le
pones un título. El título importa: es lo único que se lee antes de darle al
play.

Desde ahí se ordenan (las flechas), se retiran sin borrarlos —«retirado» deja de
verse pero no se pierde— y se quitan del curso. Quitar uno del curso **no** lo
borra de YouTube.

**Cómo lo ve el alumno.** Un botón «Repaso express» en su aula, que sólo aparece
si el curso tiene alguno. Se desliza como en el teléfono, o con las flechas, o
con el teclado.

### Por qué no son lecciones

Van en su propia tabla, no en `cem_lessons`. Son cosas distintas: una lección
pertenece a un módulo, cuenta para el progreso y puede tener evaluación; un
short es material suelto que se ve en cualquier orden y no cuenta para aprobar
nada. Meterlos en `cem_lessons` habría obligado a llenar de excepciones todo lo
que recorre lecciones — el progreso, el temario, el certificado.

### Dos decisiones que se notan en el teléfono

**No se montan todos los reproductores a la vez.** Con veinte shorts, veinte
`<iframe>` de YouTube son medio minuto de espera y varios cientos de megas de
memoria. Se monta el que se está viendo y el siguiente —para que pasar no espere
a que cargue— y se suelta el resto.

**Llevan la misma marca de agua que las clases.** Un short es *más* fácil de
repartir que una clase de cuarenta minutos, no menos.

Y el muro de pago es el mismo: sin haber pagado no se ve ninguno, ni pidiéndole
la tabla a la base directamente.
