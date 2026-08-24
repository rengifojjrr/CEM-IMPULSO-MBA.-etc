# «Comenta IA y te mando la clase»

Cómo funciona el embudo que trae gente de redes a la plataforma, qué hace cada
pieza y por qué está hecha así.

## Para qué

El CEM publica en Instagram o TikTok, alguien comenta una palabra, ManyChat le
contesta con un enlace, y ese enlace hace dos cosas a la vez:

1. Le entrega lo prometido —un documento, un vídeo, una asesoría— en el acto.
2. Deja a esa persona registrada como contacto, que es para lo que se hizo la
   publicación.

## Cómo se monta uno

**Admin → Enseñar → Recursos para redes → Nuevo recurso.**

| Campo | Qué es |
|---|---|
| **Título** | Lo que se lee arriba cuando alguien abre el enlace. |
| **Código del enlace** | Lo que va al final de la dirección: `clase-ia`. Se rellena solo desde el título mientras creas, y se puede cambiar. |
| **De qué va** | Dos líneas, para que sepa qué va a recibir antes de dejar sus datos. |
| **Palabra que se comenta** | `IA`. No la usa el programa: sirve para saber, dentro de seis meses, qué publicación trajo a esta gente. |
| **Qué se entrega** | Un documento, un vídeo de YouTube (puede ser oculto) o un enlace a otro sitio. |

Al guardar, la tabla enseña el enlace con un botón de **Copiar**. Eso es lo que
se pega en el flujo de ManyChat.

### Saber de qué publicación viene cada uno

Al enlace se le puede añadir `&o=` con lo que quieras:

```
https://escuelacem.com/plataforma/recurso.html?c=clase-ia&o=instagram-septiembre
```

Eso queda apuntado en el contacto, así que con dos flujos distintos apuntando al
mismo recurso se puede ver cuál funcionó.

## Qué pasa cuando alguien lo reclama

1. Abre el enlace y ve el título y de qué va. **Nada más**: ni la ruta del
   documento ni el identificador del vídeo llegan al navegador todavía.
2. Deja nombre, apellido, correo y teléfono. Nada de contraseña ni de confirmar
   el correo.
3. El servidor comprueba los datos, lo anota como contacto y devuelve lo
   prometido.
4. Le llega un correo con lo que pidió y un enlace para **terminar su cuenta**,
   con su dirección ya puesta en el formulario.

Quien vuelve a pedir el mismo recurso no se apunta dos veces: se le entrega
otra vez —se le caducó el enlace, cambió de móvil— y el recuento sigue diciendo
cuántas **personas** lo pidieron.

## Por qué no se crea una cuenta de verdad

Se decidió a propósito. Pedirle contraseña y confirmación de correo a alguien
que viene de comentar una palabra en Instagram es donde se cae la mitad de la
gente, y lo que se buscaba era justamente traerla. Queda como contacto en
**Contactos de la web**, con el recurso que pidió apuntado como interés, y se
le invita después.

Si termina su cuenta, entra por el registro normal como cualquiera. El contacto
y la cuenta se relacionan por el correo.

## Por qué el archivo no está donde el resto

Los materiales de curso viven en un cubo **público**: su dirección funciona para
cualquiera que la tenga, y da igual, porque el valor está en el curso entero.

Un regalo de captación es lo contrario: **su valor es que hay que dejar unos
datos para conseguirlo**. Si el archivo tuviera dirección pública, el primero
que lo recibiera podría publicar el enlace directo y el formulario quedaría de
adorno — se seguirían entregando documentos y ya no entraría ni un contacto.

Así que los regalos van al cubo privado `cem-regalos` y se entregan con un
enlace firmado que **caduca a la hora**. Se puede reenviar dentro de esa hora,
pero no sirve para siempre ni se puede publicar. Es lo proporcionado: se está
protegiendo un regalo, no un secreto.

La página avisa de la caducidad con una cuenta atrás, porque un enlace que
caduca en silencio produce un error sin explicación al día siguiente.

## Las piezas

| Dónde | Qué hace |
|---|---|
| `plataforma/admin/recursos.html` | Crear, editar, apagar y ver quién lo pidió. |
| `plataforma/recurso.html` | La página pública del enlace, con el muro de datos. |
| `supabase/functions/cem-recurso` | Comprueba, anota el contacto, firma el enlace y encola el correo. |
| `cem_recursos` · `cem_recurso_entregas` | Los recursos y quién reclamó cada uno. |
| `cem_recurso_ficha(codigo)` | Lo único abierto a un desconocido: título y descripción. |
| `cem_recurso_entregar(...)` | Sólo la llama el servidor. A `anon` le da 404. |

### Una cosa que ya falló una vez

Al crear estas funciones se hizo `revoke execute … from public` dando por hecho
que con eso `anon` quedaba fuera. **No**: en esta base `anon` tiene permisos
propios sobre las funciones del esquema, no heredados de `public`, así que
`cem_recursos_listar` contestaba 200 a un desconocido.

No había fuga —todas comprueban el rol por dentro— pero una función que no
debería poder llamarse y se puede llamar es una que un día alguien edita
quitándole el guardia de dentro, convencido de que el de fuera existe.

Se cierra con `revoke … from anon` explícito, y la migración **comprueba
después** que surtió efecto, en vez de dar por bueno lo que ya se dio por bueno
una vez.

## Qué falta para que funcione

La función `cem-recurso` tiene que estar desplegada en Supabase. Sin ella, la
página enseña la ficha y el formulario pero al enviar dice que no se pudo
preparar el material — y **el contacto tampoco se anota**, porque es la misma
función la que lo hace.

Desde el repositorio:

```bash
supabase functions deploy cem-recurso --no-verify-jwt
```

El `--no-verify-jwt` no es opcional ni un descuido: quien llama a esta función
no tiene cuenta, que es justamente el punto del embudo. Lo que la protege es
que no se cree nada de lo que llega —los datos se validan en la base y el
recurso se busca por su código— y que nunca devuelve dónde está el archivo,
sólo un enlace firmado que caduca.

La pantalla de **Recursos para redes** lo comprueba al abrirse y avisa en rojo
si no está puesta, para no descubrirlo porque alguien escriba diciendo que el
enlace no le dio nada.
