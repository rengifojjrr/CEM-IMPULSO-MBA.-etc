# Registro Forestal Beta — Identidad digital y supervisión de árboles

MVP funcional del piloto "Parque del Este". Registro individual de árboles con
fotos, GPS y mediciones; sugerencia de especie por IA (mock o Gemini);
revisión y aprobación por un supervisor; panel de administración con mapa,
métricas reales, usuarios, auditoría y exportaciones; ficha digital pública
con QR para árboles aprobados.

## Enlaces

- Registrador: `registrador.html`
- Supervisor: `supervisor.html`
- Administrador: `administrador.html`
- Ficha pública (destino del QR): `arbol.html?codigo=PDE-2026-000001`

## Cuentas de demostración

| Rol | Correo | Contraseña |
|---|---|---|
| Registrador | `registrador@demo.local` | `ForestalDemo2026!` |
| Supervisor | `supervisor@demo.local` | `ForestalDemo2026!` |
| Administrador | `administrador@demo.local` | `ForestalDemo2026!` |

Son cuentas reales de Supabase Auth (no un atajo de demo) — cambia estas
contraseñas o crea cuentas nuevas desde el panel de administrador antes de
usar el sistema con datos reales.

## Arquitectura

Tres páginas HTML independientes (una por rol), sin build ni framework,
publicadas como archivos estáticos. Backend 100% en Supabase (mismo proyecto
que ya usa el resto de este repositorio, con prefijo de tablas `forest_`):

- **Auth**: Supabase Auth (email + contraseña), sin registro público — los
  usuarios los crea el administrador.
- **Base de datos**: Postgres con RLS activado en todas las tablas. No hay
  políticas públicas: todo acceso pasa por funciones `SECURITY DEFINER`
  (`forest_*`), que verifican el rol del usuario contra `forest_profiles`
  antes de leer o escribir. Esto es lo que impide, por ejemplo, que un
  registrador apruebe su propio árbol o que alguien edite un registro ya
  aprobado.
- **Storage**: bucket privado `forest-photos`. Las fotos solo las puede subir
  el registrador dueño del árbol; verlas pueden el dueño, supervisor y
  administrador siempre, y cualquier persona (anónimo) solo si el árbol está
  `APROBADO` — así la ficha pública puede mostrar fotos sin exponer el resto.
- **IA**: función Edge `forest-ai-recognize`, con un adaptador
  intercambiable controlado por la variable de entorno
  `TREE_RECOGNITION_PROVIDER` (`mock` por defecto, o `gemini`). La IA nunca
  bloquea el registro: si falla o no hay clave configurada, se guarda el
  registro igual y se muestra "Reconocimiento no disponible".
- **Creación de usuarios**: función Edge `forest-admin-users`, la única
  pieza que usa la `service_role key` (nunca sale del servidor); verifica
  que quien llama sea administrador antes de crear la cuenta.
- **Numeración**: código visible tipo `PDE-2026-000001` generado con una
  secuencia en base de datos (`forest_next_codigo`), no contando filas desde
  el cliente — evita colisiones bajo uso concurrente.
- **Auditoría**: cada cambio de estado escribe un evento en
  `forest_audit_events` (usuario, fecha, estado anterior/nuevo, comentario).
  No existe ninguna función que borre auditoría.

## Activar Gemini (opcional)

Por defecto el sistema usa el proveedor **mock**: sugiere especies de forma
realista sin depender de ninguna cuenta externa, para que la demo funcione
siempre. Para usar Gemini de verdad:

1. Consigue una API key de Gemini (Google AI Studio).
2. En el proyecto de Supabase, configura los secretos de la función Edge
   `forest-ai-recognize`:
   - `TREE_RECOGNITION_PROVIDER=gemini`
   - `GEMINI_API_KEY=<tu clave>`
   - `GEMINI_MODEL=gemini-2.5-flash` (opcional, ese es el valor por defecto)
3. No hay que tocar ningún HTML — el adaptador es el mismo endpoint, solo
   cambia de proveedor puertas adentro. Si Gemini falla por cualquier razón,
   cae automáticamente a una sugerencia de respaldo sin interrumpir el
   registro.

## Matriz de permisos (resumen)

| Acción | Registrador | Supervisor | Administrador |
|---|---|---|---|
| Crear árbol | Sí | No | No |
| Editar borrador/devuelto propio | Sí | No | No |
| Ver todos los árboles | No (solo propios) | Pendientes/revisados | Sí |
| Aprobar/rechazar/devolver | No | Sí (no los propios) | No vía UI |
| Gestionar usuarios | No | No | Sí |
| Exportar | Solo propios (vista) | — | Todos (CSV/JSON) |
| Borrar auditoría | No | No | No (nadie puede) |

## Limitaciones conocidas de esta beta

- El reconocimiento por IA usa fotos comprimidas en el navegador (se
  eliminan metadatos EXIF al re-codificarlas en canvas antes de subirlas o
  enviarlas); no hay modelo propio entrenado con especies venezolanas.
- No incluye: créditos de carbono, bonos verdes, trazabilidad de madera,
  drones/satélites, ni permisos forestales — están fuera de alcance de esta
  beta a propósito.
- La detección de duplicados cercanos es manual (el supervisor la revisa
  por ubicación/fotos); no hay una alerta automática todavía.
- El PWA (manifiesto + ícono + service worker) cachea solo el cascarón de
  la app para instalación en el teléfono; no hay funcionamiento offline
  real de la captura (los datos siempre se guardan contra Supabase en vivo).
- No se generó suite de pruebas automatizadas dentro del repo (sí se probó
  manualmente el flujo completo extremo a extremo contra el backend real).

## Exportar / migrar datos

Desde "Administrador → Exportaciones" se descarga CSV o JSON de todos los
árboles, y JSON de la auditoría completa. Como la base es Postgres estándar
con IDs propios (UUID) y fotos organizadas por carpeta de árbol en Storage,
migrar a un Postgres autogestionado en el futuro no requiere cambiar el
identificador de ningún árbol ni su historial.
