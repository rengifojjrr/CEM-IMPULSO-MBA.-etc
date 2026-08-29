# El esquema de la base, en el repositorio

Hasta ahora la plataforma vivía a medias: las pantallas estaban aquí, y el motor
que hay debajo —las tablas, las 383 funciones, las 243 reglas de quién puede ver
qué— sólo dentro de Supabase. Si ese proyecto se perdía, no había de dónde
reconstruirlo. Esto cierra ese hueco.

## Qué hay aquí

| Archivo | Qué trae |
|---|---|
| `…_extensiones.sql` | Las extensiones de Postgres |
| `…_tipos.sql` | 22 tipos propios (los enums) |
| `…_tablas.sql` | 106 tablas con sus columnas y valores por omisión |
| `…_funciones.sql` | 401 funciones — aquí vive el trabajo de verdad |
| `…_restricciones.sql` | 369 claves, unicidades, comprobaciones y relaciones |
| `…_indices.sql` | 265 índices |
| `…_disparadores.sql` | 18 disparadores |
| `…_rls.sql` | 244 políticas: quién puede ver cada fila |
| `…_permisos.sql` | Permisos de tabla, **de columna** y de función |
| `…_almacen.sql` | 6 depósitos de archivos y sus 18 reglas |
| `…_tareas.sql` | Las 10 cosas que se ejecutan solas |

Las cifras se comprueban solas: `herramientas/probar-migraciones.sh` las cuenta
al terminar de reconstruir. Si no coinciden con las de aquí, o falta algo en el
volcado o esta tabla se quedó vieja.

**No se editan a mano.** Se generan leyendo la base; un cambio escrito aquí se
perdería en la siguiente regeneración. Los cambios se hacen en la base y luego
se vuelve a generar esto.

## El orden no es alfabético, y es a propósito

Las **funciones van antes que las restricciones**, porque hay una comprobación
que llama a `cem_reparto_valido(jsonb)`: con el orden de siempre, la tabla se
creaba antes que la función y fallaba. Y el archivo de funciones abre con
`check_function_bodies = false`, igual que hace `pg_dump`, porque las funciones
salen en orden alfabético y una puede llamar a otra que empieza por una letra
posterior.

Las dos cosas las descubrió la prueba de reconstrucción, no la lectura. La
primera vez fallaban 32 funciones, una restricción y 90 permisos.

## Cómo se regenera

```
psql "$CADENA_DE_CONEXION" -f herramientas/volcar-esquema.sql   # crea el volcador
CEM_VOLCADO_USUARIO=… CEM_VOLCADO_CLAVE=… node herramientas/volcar-esquema.mjs
psql "$CADENA_DE_CONEXION" -c "drop function public.cem_volcado(text), public.cem_volcado2(text), public.cem_volcador_fuente();"
```

El volcador pide rol de dirección mientras existe, y aun así se borra: una
función que sabe leer el esquema entero no tiene por qué vivir en producción.

## Cómo se comprueba que sirve

```
herramientas/probar-migraciones.sh
```

Levanta un Postgres vacío, le pone el andamiaje mínimo de Supabase y aplica todo
en orden. Si sale un solo error, el volcado no sirve para reconstruir.

**Esto es lo que hay que correr después de cada regeneración.** Un volcado que no
se aplica es peor que no tener volcado: el día que haga falta, no se descubre que
estaba roto — se descubre que no hay copia.

## Lo que NO hay aquí

- **Los datos.** Esto es el molde, no lo que hay dentro. Las cuotas, las
  personas y los certificados se respaldan aparte; está en
  `docs/respaldo-y-restauracion.md`.
- **Las cuentas** (`auth.users`). Las gestiona Supabase.
- **Los secretos.** Las claves viven en la configuración de Supabase, no en
  ninguna tabla. Se comprobó antes de publicar esto: ni una clave dentro de
  ninguna función ni de ninguna tarea.
