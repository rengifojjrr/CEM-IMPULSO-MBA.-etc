# Empezar de cero: el borrado, las invitaciones y los datos de prueba

23 de agosto de 2026.

El dueño pidió vaciar la plataforma y quedarse con una sola cuenta desde la que
invitar al resto. Este documento explica qué se borró, qué no, dónde está lo
borrado, y las tres piezas que se construyeron para que eso fuera viable.

Se escribe porque las decisiones de aquí no son obvias a partir del código, y
porque dos de ellas casi salen mal.


## 1 · Qué se borró y qué se conservó

Se borró todo lo que es **dato**: personas, programas, temarios, evaluaciones,
inscripciones, pagos, certificados, avisos, la cola de correo y el registro de
auditoría. En total 4.056 filas y once cuentas de acceso.

Se conservó lo que es **configuración**, que no es lo mismo aunque viva en
tablas iguales:

| Tabla | Por qué se queda |
|---|---|
| `cem_permissions` | 385 reglas de qué puede hacer cada rol. Describen la plataforma, no a personas. Sin ellas se queda sin permisos. |
| `cem_settings` | Cómo se recoge la tasa, qué países salen en la portada, la dirección del sitio. |
| `cem_integraciones` | Las claves de Stripe, YouTube y el banco. |
| `cem_categorias` | Las diez categorías del catálogo. Sin ellas, crear un programa no ofrece nada que elegir. |
| `cem_tasas_bcv` | Las tasas oficiales publicadas. Son un hecho del mundo, no un dato de la escuela, y sin ellas no hay conversión de moneda. |

### Dónde está lo borrado

En el esquema `respaldo_20260823`: 65 tablas, 4.478 filas, copiadas **antes** de
tocar nada. Incluye las cuentas de acceso (`respaldo_20260823.auth_users`).

Para recuperar algo:

```sql
insert into public.cem_lessons select * from respaldo_20260823.cem_lessons;
```

Para tirarlo cuando ya no haga falta:

```sql
drop schema respaldo_20260823 cascade;
```

Lo que **no** se copió son los archivos: las 38 fotos del depósito
`cem-assets`. Supabase no deja borrar objetos del almacenamiento por SQL —lo
impide a propósito, para que nadie deje huérfanos— así que se quitan por la API.
Si un día se restaura el respaldo, las rutas guardadas apuntarán a archivos que
ya no están.


## 2 · Dos cosas que casi salen mal

### En esta base vive más de una aplicación

`delete from auth.users` falló con una clave ajena de `forest_reviews`. Resulta
que el CEM y la aplicación de los árboles (`forest_*`) **comparten la tabla de
cuentas**. Un borrado que en el CEM parecía limpio le habría dejado la otra
aplicación sin nadie dentro.

Se salvó porque una migración es una transacción y se deshizo entera. La versión
buena borra sólo las once cuentas que tenían ficha en `cem_profiles` y no en
`forest_profiles`.

**Regla para el futuro: en esta base, nada que empiece por «borra todas las».**

### El orden importaba

Borrar las cuentas primero arrastra los perfiles por cascada, y a esos perfiles
todavía los apuntan los pagos y media docena de tablas más. Pero para saber
*qué* cuentas son del CEM hace falta `cem_profiles`, que es justo lo que se va a
vaciar. Se resuelve apuntando la lista en una tabla temporal antes de tocar
nada.


## 3 · La clave que hay que cambiar, y que no se puede saltar

La primera cuenta (`cemadmin@escuelacem.com`) nace con `admin123`. Es cómoda
para arrancar y pésima para dejarla: esa cuenta ve la cédula de cada estudiante,
mueve dinero y reparte roles.

La forma fácil de obligar a cambiarla sería una casilla `debe_cambiar_clave` que
la propia pantalla apaga al terminar. **Eso no es una puerta, es un cartel**: se
apaga desde la consola del navegador sin cambiar la clave.

Lo que se hizo:

- `cem_clave_pendiente` guarda el **hash** de la clave inicial (bcrypt, no se
  deshace, y no se guarda ninguna clave en claro).
- `cem_debe_cambiar_clave()` compara ese hash con el que tiene la cuenta *ahora*.
- Mientras coincidan, la clave sigue siendo la de fábrica lo diga quien lo diga.
- En cuanto cambia de verdad, el hash cambia y el aviso desaparece solo.

No hay nada que apagar a mano, así que no hay nada que saltarse. `mount()` mira
esto después de comprobar la sesión y **antes** de comprobar el rol: alguien con
la clave de fábrica no debería llegar ni al mensaje de «sin acceso», que ya
cuenta cosas de la plataforma.

Sirve igual para cualquier cuenta que se cree con una clave de un solo uso.


## 4 · Las invitaciones

Desde **Usuarios y roles → Invitar a alguien**: correo, rol y un mensaje. La
persona recibe un enlace, elige su clave y sus datos, y queda dentro con ese rol.

### El rol vive en la invitación, no en la petición

`cem_invitacion_aceptar()` recibe la clave y los datos de quien acepta, pero el
**correo y el rol los lee de la fila de la invitación**. Si viajaran en la
llamada, cualquiera con una invitación de estudiante cambiaría una palabra y
entraría de superadministrador.

### Quién puede invitar a qué

| Quien invita | A quién puede invitar |
|---|---|
| `admin`, `superadmin` | a cualquiera |
| `coordinador` | `profesor` y `estudiante` |
| el resto | a nadie |

Repartir administraciones, auditoría o cobranza decide quién ve el dinero y
quién ve las cédulas: eso lo hace el dueño.

### El enlace es la credencial

64 caracteres al azar, **un solo uso**, y caduca (7 días por omisión). Se enseña
**una sola vez**, al crearla, y no vuelve a aparecer en la lista: una pantalla
que lo tenga siempre a la vista es una pantalla donde quien pase por detrás con
el móvil se lleva una cuenta de profesor. Si se pierde, se invita otra vez y el
anterior se anula solo.

### Por qué la cuenta se crea a mano

El alta normal de Supabase manda un correo de confirmación. **No hay proveedor
de correo configurado**, así que la cuenta quedaría creada y sin poder entrar
nunca. Quien llega por el enlace ya demostró que tiene el correo —o que alguien
de dentro se lo dio— así que nace confirmada.

Por lo mismo, la invitación se encola *y además* la pantalla devuelve el enlace
para mandarlo a mano. Sin eso, con la base recién vaciada, no se podría meter a
nadie.


## 5 · Los datos de prueba

Las 889 comprobaciones automáticas entran a la plataforma como seis personas
distintas, abren programas y pagan cuotas: necesitan datos. Y **el banco de
pruebas se conecta a esta base**, no a una aparte.

Hasta ahora eso se resolvía solo, porque los datos de ensayo vivían mezclados
con los reales — por eso nueve de once cuentas eran `@cem.demo`. Al vaciar la
base, las 889 comprobaciones se quedaron sin nada contra lo que correr.

La solución tiene tres piezas:

**El vivero** (esquema `semilla`): una copia congelada de los datos contra los
que esas comprobaciones ya pasaban. Vive aparte, la aplicación no lo ve, y es
independiente del respaldo: se puede tirar `respaldo_20260823` sin romperlo.

**El registro** (`cem_datos_de_prueba`): se apunta, fila por fila, todo lo que se
siembra. El borrado no busca «lo que parezca de mentira»: borra exactamente los
identificadores que sembró. Aunque un alumno de verdad se llamara igual, tuviera
el mismo correo y se hubiera inscrito al mismo programa, no está en el registro
y no se toca.

**Las marcas**: los correos son `@pruebas.local` —un dominio reservado que no
existe, así que un correo que se escape rebota en vez de llegarle a un
desconocido— y los programas llevan `[PRUEBA]` delante del nombre.

### Cómo se usan

Desde **Configuración → Datos de prueba**, o:

```sql
select cem_sembrar_datos_de_prueba();   -- ~4.056 filas, 11 cuentas
select cem_borrar_datos_de_prueba();
select cem_hay_datos_de_prueba();
```

La clave de todas las cuentas sembradas es `CemDemo2026!`, que es la que espera
`pruebas/entorno.mjs`.

**Si toda la suite falla en el inicio de sesión, es que no están sembrados.** Es
lo primero que hay que mirar antes de buscar el fallo en otra parte.

### Por qué la siembra va por rondas

`disable trigger all` no vale: entre esos disparadores están los que Postgres usa
para las claves ajenas, y apagarlos es cosa de superusuario. El `postgres` de
Supabase no lo es, y está bien que no lo sea.

Sí se puede `disable trigger user`, que son los nuestros —la auditoría, el
guardia del cambio de rol—, y conviene apagarlos: sembrar no es una acción de
nadie y no tiene por qué dejar cien entradas en la auditoría.

Pero entonces las claves ajenas siguen vivas y el orden de inserción importa. En
vez de mantener a mano una lista de sesenta tablas ordenadas por dependencias
—que se rompe el día que alguien añade la sesenta y una—, se inserta por rondas:
lo que falla por no tener todavía a su padre se deja para la vuelta siguiente. En
cuatro vueltas está todo. El borrado hace lo mismo al revés.

### Dos tropiezos que quedaron por el camino

`auth.users` no es de `postgres` sino del servicio de autenticación: no se le
pueden apagar los disparadores. No hace falta pelearse — se deja que el
disparador de alta cree la ficha con rol de estudiante y luego se pisa con la
buena.

Y `insert ... select *` falló con `confirmed_at`, que es una columna calculada.
Copiar «todas las columnas» con un asterisco no distingue las que se calculan de
las que se guardan; hay que enumerarlas saltando las de `attgenerated <> ''`.
`cem_columnas_copiables()` hace eso para cualquier tabla.


## 6 · Lo que queda pendiente y por qué

- **Los correos siguen sin salir.** Falta la clave de Resend y tres registros DNS
  en GoDaddy. Mientras tanto, las invitaciones funcionan por enlace copiable.
- **Las formas de pago se fueron con el borrado** y las que hay ahora son de
  ensayo. Hay que crear las reales con su destino.
- **Stripe sigue en modo de prueba** (`sk_test_`).
- **Las 38 fotos de `cem-assets`** siguen ahí, huérfanas. No estorban, pero
  conviene limpiarlas.
