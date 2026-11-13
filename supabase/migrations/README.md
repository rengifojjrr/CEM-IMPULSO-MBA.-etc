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
| `…_rls.sql` | 245 políticas: quién puede ver cada fila |
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

**Ojo si se regenera hoy.** Un volcado nuevo ya trae dentro todo lo de las
migraciones posteriores al anterior. Hay que sacar de esta carpeta las que
quedan antes de su fecha (siguen en git), o se aplicarían dos veces. También
hay que quitar las que entonces sean del volcado: las recuperadas y la puesta
al día.

## Lo que no es el volcado

Además de los `20260101000001`–`…10`, que escribe el volcador, aquí hay archivos
escritos o recuperados a mano, cada uno con su cabecera:

| Archivo | Qué es |
|---|---|
| `20251231000000_volcado_sin_permisos_por_omision.sql` | Quita los permisos por omisión de Supabase mientras se crea el volcado |
| `20260101000011_endurecer.sql` | Los avisos de seguridad del panel que resultaron ciertos |
| `20260101000012_permisos_por_omision_de_supabase.sql` | Los devuelve justo después del volcado |
| `20260902000001_…`, `20260903000000_…`, `20260910000002_…` | Migraciones aplicadas en producción sin dejar archivo, **recuperadas byte a byte** de su historial |
| `20261113000002_al_dia_con_produccion.sql` | Lo que producción tiene sin que lo traiga ninguna migración |
| Las demás | Una migración por cambio, como siempre |

**La regla que se rompió en septiembre:** todo cambio en la base deja su archivo
aquí, el mismo día. Vale también si se aplica con `apply_migration` desde el
asistente: que quede en el historial de producción no lo trae al repositorio.
Entre el 29 de agosto y el 3 de septiembre de 2026 entraron así, sin archivo,
las campañas, las listas de pre-registro, Mis cupones y reclamar certificados.
Nadie lo notó en dos meses, porque las pantallas hablaban con producción. Ahora
`herramientas/revisar.mjs` comprueba en cada push que toda función que llama el
código existe en esta carpeta. Si algún día hay que recuperar otra, está en
`supabase_migrations.schema_migrations`.

Los bloques recuperados van entre marcas `┌── producción …` y `└── fin de …`,
con el md5 que calcula producción sobre ese texto. **No se editan a mano**, como
el volcado, y `revisar.mjs` lo vigila.

**Los permisos por omisión de Supabase.** En un proyecto de Supabase, todo lo
que se crea en `public` nace con `ALL` para `anon`, `authenticated` y
`service_role`. El volcado escribe los permisos que quedaron al final, pero sólo
concede: no quita lo que Supabase da al crear. Sin `20251231000000`, una
restauración en un proyecto nuevo dejaba abiertas de más 29 funciones y 7
tablas. Entre ellas estaban `cem_inscribir_a` y `cem_lessons`, cuyo permiso por
columna se anulaba. El andamio de la prueba imita esos permisos, así que la
prueba ya lo vería.

## Cómo se comprueba que sirve

```
herramientas/probar-migraciones.sh
```

Levanta un Postgres vacío, le pone el andamiaje mínimo de Supabase y aplica todo
en orden. Si sale un solo error, el volcado no sirve para reconstruir. Desde
noviembre también cuenta como fallo:
- que el propio andamio no se aplique;
- un `FATAL` o un `WARNING`;
- una función cuyo cuerpo no valida.

**Esto es lo que hay que correr después de cada regeneración.** Un volcado que no
se aplica es peor que no tener volcado: el día que haga falta, no se descubre que
estaba roto — se descubre que no hay copia.

### Comparar con producción

«Sin un solo error» no quiere decir «igual que producción». En noviembre de
2026 la prueba daba cero errores y aun así faltaban el temario público y el
disparador que crea el perfil de cada cuenta nueva. Eso sólo lo dice comparar
objeto por objeto, y sólo leyendo producción:

```
CEM_HUELLA=/tmp/local.txt herramientas/probar-migraciones.sh
```

Después, `herramientas/huella-esquema.sql` entera en el editor SQL de producción,
y el resultado en `/tmp/prod.txt`, una línea por fila. Luego:

```
diff <(sort /tmp/local.txt) <(sort /tmp/prod.txt)
```

La base es compartida, así que en el diff sale lo que no es de CEM (`tm_*`,
`forest_*`, `cq_*`, `fb360_*`, `kkg_*`, `pm_*`, tabaco, pasarelas…), y eso no
cuenta. De CEM quedaban, el 13 de noviembre, 36 funciones distintas, todas
explicadas:
- 35 difieren sólo en comentarios, espacios o el texto de un mensaje;
- `cem_handle_new_user` lleva en producción un añadido que lee una tabla de kkg
  (`docs/lo-que-falta.md` §3.11).

Cualquier otra diferencia de CEM es algo que falta aquí.

## Lo que NO hay aquí

- **Los datos.** Esto es el molde, no lo que hay dentro. Las cuotas, las
  personas y los certificados se respaldan aparte; está en
  `docs/respaldo-y-restauracion.md`.
- **Las cuentas** (`auth.users`). Las gestiona Supabase.
- **Los secretos.** Las claves viven en la configuración de Supabase, no en
  ninguna tabla. Se comprobó antes de publicar esto: ni una clave dentro de
  ninguna función ni de ninguna tarea.
