# Respaldo y restauración

Un respaldo que nunca se restauró no es un respaldo: es una carpeta. Este
documento describe cómo se respalda esta plataforma, cómo se restaura y —lo que
faltaba— **cómo se comprueba que la restauración quedó completa**.

## Qué hay que respaldar

Tres cosas distintas, en tres sitios distintos. Un respaldo que sólo cubra la
primera deja la plataforma sin poder emitir un certificado ni verificar uno.

| Qué | Dónde vive | Se pierde si… |
|---|---|---|
| **Los datos** | Postgres, tablas `cem_*` y `cert_*` | se borra o corrompe la base |
| **Los archivos** | Storage, cubos `cem-assets` (fondos de certificados) y los comprobantes de pago | se borra el cubo |
| **Las cuentas** | el esquema `auth` de Supabase | igual que los datos, pero se restaura aparte |

El código está en este repositorio y en GitHub, así que no hace falta
respaldarlo: se vuelve a clonar.

## Los respaldos automáticos de Supabase

El proyecto está en un plan con respaldos diarios administrados. Se ven y se
restauran desde el panel:

> Supabase → el proyecto → **Database** → **Backups**

Restaurar desde ahí devuelve la base entera a un momento dado. Es lo que hay que
usar ante un desastre real. Tiene dos límites que conviene saber **antes** de
necesitarlo:

1. **Restaura todo o nada.** No se puede recuperar una sola tabla. Si el
   problema es "alguien borró los pagos de agosto", restaurar el respaldo
   completo también deshace todo lo demás que pasó desde entonces.
2. **No incluye Storage.** Los fondos de los certificados y los comprobantes de
   pago se respaldan aparte.

Por eso, además de los automáticos, conviene el respaldo manual de abajo antes
de cualquier cambio grande (una migración pesada, una importación masiva, una
limpieza de datos).

## Respaldo manual, antes de tocar algo grande

Con la CLI de Supabase, desde una máquina con acceso:

```bash
# 1) datos + esquema de la aplicación
supabase db dump --db-url "$CEM_DB_URL" -f respaldo-datos.sql --data-only
supabase db dump --db-url "$CEM_DB_URL" -f respaldo-esquema.sql

# 2) las cuentas
supabase db dump --db-url "$CEM_DB_URL" -f respaldo-auth.sql --schema auth

# 3) los archivos
supabase storage download --recursive ss://cem-assets ./respaldo-archivos/
```

`CEM_DB_URL` sale del panel (Project Settings → Database → Connection string).
**Va siempre por variable de entorno y nunca escrita en un archivo del
repositorio**, igual que la clave de servicio.

## Cómo comprobar que la restauración quedó completa

Esta es la parte que faltaba. "Parece que están todos" no es una comprobación.

La función `cem_manifiesto_de_respaldo()` devuelve, por cada tabla `cem_*`,
cuántas filas tiene y una **huella md5 de su contenido**. La huella se calcula
sobre las filas ordenadas por su propio contenido, así que no cambia porque la
restauración las haya guardado en otro orden físico — sólo cambia si cambió un
dato.

**Antes** de restaurar (o antes del cambio grande), guarda el manifiesto:

```sql
select tabla, filas, huella from public.cem_manifiesto_de_respaldo();
```

**Después** de restaurar, sácalo otra vez y compara. Si las dos listas coinciden
línea por línea, la restauración quedó idéntica. Si alguna huella difiere, esa
tabla no se restauró bien — y sabes cuál, que es la mitad del trabajo.

Sólo la pueden llamar `admin`, `superadmin` y `auditor`.

### El simulacro, hecho de verdad

El procedimiento se probó contra la base real el 14 de agosto de 2026, dentro de
una transacción que termina abortando para no dejar nada a medias:

```
antes:   20 filas, huella 565bbb60abdb47c6a4fa3c3b285b7e0a
vacía:    0 filas          ← se borró la tabla entera a propósito
después: 20 filas, huella 565bbb60abdb47c6a4fa3c3b285b7e0a
```

Se sacó el manifiesto de `cem_installments`, se copió la tabla, se **borró
entera**, se restauró desde la copia y se volvió a sacar el manifiesto. Las
huellas coinciden. El procedimiento funciona y la forma de comprobarlo detecta
tanto la falta de filas como el cambio de contenido.

Conviene repetir el simulacro cada vez que cambie el esquema de forma
importante. El bloque completo está en el historial de este repositorio, en el
mismo cambio que agregó esta página.

## Qué hacer ante un desastre, en orden

1. **No restaures todavía.** Primero saca el manifiesto del estado actual y
   guárdalo. Aunque la base esté mal, es la única foto de lo que había, y si la
   restauración sale peor te vas a querer volver.
2. Averigua **qué** se perdió y **desde cuándo**. El registro de auditoría
   (`cem_audit_events`) suele decirlo: quién hizo qué y a qué hora.
3. Si se perdieron datos de una sola tabla y tienes un respaldo manual reciente,
   restaura sólo esa tabla desde el volcado. Es mucho menos invasivo que volver
   la base entera atrás.
4. Si el daño es general, restaura el respaldo automático desde el panel,
   eligiendo el momento inmediatamente anterior al problema.
5. Restaura los archivos de Storage aparte si también se vieron afectados.
6. Saca el manifiesto y compáralo con el que corresponda.
7. Corre las pruebas: `cd pruebas && npm test`. Comprueban entrar, cobrar,
   calificar y certificar contra la base de verdad, así que si algo quedó a
   medias lo van a encontrar.
8. Anota en el registro de auditoría qué pasó y qué se hizo.

## Lo que todavía no está automatizado

Para ser honestos sobre el estado actual:

- El respaldo manual y la descarga de Storage se hacen a mano. No hay una tarea
  que los corra sola y los deje en otro sitio.
- No hay copia fuera de Supabase. Si se perdiera la cuenta entera, se perdería
  todo. Un volcado semanal a otro proveedor cerraría ese hueco.
- El simulacro es manual: no hay nada que lo corra periódicamente y avise si
  dejó de funcionar.

Ninguna de las tres es difícil; están escritas aquí para que se sepa que faltan,
en vez de descubrirlo el día que hagan falta.
