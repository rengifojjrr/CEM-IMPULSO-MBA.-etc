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
