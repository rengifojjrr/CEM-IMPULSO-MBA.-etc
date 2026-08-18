# Quién puede ver y tocar qué

Lo que decide si alguien puede ver una nota o mover un pago **no son los botones
de las pantallas**. Una pantalla puede olvidarse de esconder un botón; eso pasa.
Quien decide de verdad son las políticas de la base, que se aplican a cada
consulta venga de donde venga — de una pantalla, de la consola del navegador o
de una llamada a mano.

## Cómo se revisa

No hace falta abrir el panel de Supabase ni escribir SQL. Está en la propia
plataforma:

> **Seguridad de mi cuenta** → *Políticas de acceso de la base*

Lo ven `admin`, `superadmin` y `auditor`. Se recalcula cada vez que se abre la
pantalla, así que una tabla nueva mal configurada aparece ahí en cuanto se crea,
y no dentro de un año.

Por debajo llama a `cem_revisar_politicas()`, que clasifica cada tabla del
esquema `public` en cuatro estados:

| Estado | Qué significa | ¿Hay que hacer algo? |
|---|---|---|
| **con políticas** | Tiene RLS encendido y políticas que deciden fila por fila. | No. Es lo normal. |
| **abierta a cualquiera** | Tiene permisos para el navegador y RLS **apagado**. Cualquiera con la clave pública la lee y la escribe. | **Sí, corriendo.** |
| **cerrada, sin políticas** | RLS encendido y ninguna política: no devuelve ni acepta nada desde el navegador. | No urge, pero conviene limpiar. |
| **sólo del servidor** | Sin RLS pero tampoco sin permisos para el cliente: sólo la alcanza el rol de servicio. | No. |

## Cómo está hoy (14 de agosto de 2026)

- **44 tablas con políticas.** Son todas las que usan las pantallas: las `cem_*`
  de la plataforma, las `cert_*` del generador de certificados y las `pm_*` del
  tablero de proyecto.
- **0 tablas abiertas.** Ninguna queda expuesta.
- **19 tablas cerradas y sin políticas.** Son las de otras herramientas que
  comparten esta misma base de datos: el registro forestal (`forest_*`, 17
  tablas) y el cotizador (`quotes`, `quote_events`). Están todas vacías y
  ninguna pantalla de CEM las toca.

### Sobre esas 19

Con RLS encendido y cero políticas, Postgres no devuelve ni acepta ninguna fila
desde el navegador: **están cerradas, no expuestas**. Aun así conservan permisos
de `SELECT/INSERT/UPDATE/DELETE` para `anon` y `authenticated`, y eso es lo que
conviene arreglar algún día: hoy las protege sólo el RLS, y basta con que
alguien les agregue una política permisiva de más para que se abran enteras.

No se les tocó nada en esta revisión a propósito: son de otros proyectos y
cambiarles los permisos podría romper algo que no se ve desde aquí. Si alguna se
va a volver a usar, lo primero es escribirle políticas.

## Una fila entera no es la unidad correcta: `cem_lessons`

Las políticas de RLS deciden por fila, y hay un caso donde eso no alcanza. El
**título** de una lección es el catálogo: tiene que verse sin haber pagado nada,
porque es lo que convence de comprar. El **enlace del vídeo** y el **cuerpo del
texto** son el curso: si se leen sin pagar, la puerta de la inscripción es un
cartel. Es la misma fila, y hacen falta las dos cosas.

Se resolvió por columna, que es el otro instrumento que da Postgres:

```sql
revoke select on public.cem_lessons from anon, authenticated;
grant select (id, module_id, titulo, descripcion, tipo,
              duracion_min, orden, obligatorio, estado, created_at)
  on public.cem_lessons to anon, authenticated;
```

`url` y `contenido` no están en esa lista, así que `select url from cem_lessons`
devuelve *permission denied* desde el navegador, con clave pública o con sesión.
Quien tiene derecho a ellas las pide por `cem_material_lecciones(uuid[])`, que
mira si es personal de la escuela, el docente del curso, o alguien con una
inscripción abierta según `cem_acceso_abierto()`.

Dos cosas que hay que saber si tocas esta tabla:

1. **Una columna nueva nace cerrada.** No se verá desde el navegador hasta que le
   agregues su `grant`. Es a propósito: obliga a decidir si se abre.
2. **`select('*')` deja de funcionar** para `anon` y `authenticated` — Postgres
   comprueba el permiso columna por columna al expandir el asterisco. Las
   pantallas que leen lecciones piden columnas por su nombre.

Revocar sólo la columna, dejando el `SELECT` de tabla puesto, **no sirve de
nada**: con el permiso de tabla se leen todas las columnas igual. Hay que quitar
el de tabla y devolver los que sí van.

## El caso que se encontró y se cerró

La revisión que produjo este documento destapó un agujero real, y no estaba en
las tablas sino en las **funciones**: toda la familia `cert_*` corría en
`security definer` con permiso de ejecución para `anon`, y ninguna comprobaba
quién llamaba. Con la sola clave pública se podían leer los datos personales de
todos los certificados emitidos, emitir uno nuevo a nombre de quien fuera,
revocar el de un graduado real o borrarlos todos.

Está cerrado. El detalle, en
[funciones-del-servidor.md](funciones-del-servidor.md).

La moraleja para el futuro: **revisar las tablas no alcanza**. Una función
`security definer` se salta las políticas por diseño — para eso existe — así que
la comprobación de quién llama tiene que estar escrita dentro de ella.

## Los roles

| Rol | Qué puede |
|---|---|
| `estudiante` | Lo suyo y nada más: sus cursos, sus notas, sus pagos, su perfil. |
| `profesor` | Sólo los cursos y cohortes que tiene asignados. Pone notas y pasa asistencia. |
| `coordinador` | Lo académico y lo administrativo. **No** cambia roles ni desactiva cuentas. |
| `cobranza` | Sólo dinero: cuotas, pagos, estudiantes. Ni cursos, ni notas, ni usuarios. |
| `admin` | Todo, incluidos roles y cuentas. |
| `superadmin` | Igual que admin. |
| `auditor` | **Lee todo, no escribe nada.** No es que se le escondan los botones: una política restrictiva en cada tabla `cem_*` le impide escribir aunque lo intente por la consola. |

Estas fronteras están comprobadas en `pruebas/casos/roles.mjs`, y no mirando
botones: las pruebas le piden a la base la operación prohibida y verifican que
no ocurra.

## Las funciones también tienen permisos, y nacen abiertas

Las políticas de arriba protegen **tablas**. Las funciones tienen su propio
permiso, y ahí hay una trampa que conviene tener escrita:

> Al crear una función, Postgres le da `EXECUTE` a `PUBLIC`, y en Supabase el
> rol `anon` —quien no ha entrado— hereda de `PUBLIC`. **Toda función nueva nace
> llamable sin sesión** salvo que alguien se acuerde de revocarlo.

Escribir `grant execute … to authenticated` no arregla eso: añade un permiso,
no quita el que ya venía puesto. Hace falta revocarlo a mano:

```sql
revoke all on function public.mi_funcion(uuid) from public, anon;
grant execute on function public.mi_funcion(uuid) to authenticated, service_role;
```

Ninguna función de la plataforma filtra nada por esto: todas comprueban por
dentro quién llama y devuelven vacío o se plantan. Pero eso es la segunda
cerradura, y una puerta que sólo tiene la de dentro acaba abierta el día que
alguien escriba una función nueva sin acordarse.

`cem_revisar_funciones()` las lista, separando tres casos:

| Veredicto | Qué quiere decir |
|---|---|
| `a_proposito` | La web pública la llama sin sesión y tiene que estar abierta: verificar un certificado, dejar un contacto, el perfil público, las valoraciones del catálogo. |
| `inocua` | No es `security definer`, así que corre con los permisos de quien llama y no da más de lo que ya tiene. |
| `revisar` | Corre con permisos de dueño y la puede llamar cualquiera. Se defiende sola, pero convendría cerrarle también la puerta de fuera. |

Se ve en **Gobierno → Seguridad de mi cuenta**, debajo de las políticas de las
tablas, con la orden exacta de cada una. Se revisa sola cada vez que se abre esa
pantalla, igual que las tablas.
