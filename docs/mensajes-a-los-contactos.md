# Mensajes guardados para los contactos de la web

Escribir una vez y mandar muchas veces, sabiendo siempre a quién ya se le mandó.

Vive en **Contactos de la web** (`plataforma/admin/leads.html`).

---

## Por qué el historial es una tabla y no una nota

Antes, contestar a un contacto dejaba una línea de prosa dentro de `nota_interna`:

```
24/08 22:07 · Juan le escribió: Sobre tu consulta
```

Eso se lee, pero **no se filtra**. Y como no se filtra, «¿a quién le falta el primer
contacto?» sólo se podía contestar abriendo las fichas de una en una — que es
justo lo que hace imposible mandar nada en tanda.

Así que el historial pasó a ser `cem_lead_envios`, **una fila por envío**. La prosa
se mantiene además, porque leer la ficha sigue teniendo que contar la historia;
pero lo que manda para filtrar es la tabla.

## Las piezas

| Qué | Dónde |
|---|---|
| Los mensajes | `cem_mensajes_plantilla` |
| Quién recibió qué | `cem_lead_envios` |
| Rellenar los huecos | `cem_mensaje_pintar(texto, lead)` |
| Mandar a uno | `cem_lead_enviar_plantilla(lead, plantilla, forzar)` |
| Mandar a una tanda | `cem_leads_enviar_masivo(plantilla, ids[], forzar, solo_contar)` |

Las dos tablas tienen RLS **sin políticas**: nadie llega a ellas por PostgREST.
Todo pasa por las funciones, que comprueban el permiso una vez y en un sitio.

## Decisiones que no son obvias

### La tanda va a los ids que hay en pantalla

La primera versión repetía los filtros en SQL (estado, origen, búsqueda). Pero la
pantalla busca además por teléfono y por el mensaje que escribieron. Dos filtros
parecidos y distintos significa que el día que alguien busque un teléfono, la lista
enseña 5 personas y el aviso dice 7 — y de las dos cifras, la que manda es la que
envía, no la que se ve.

Ahora la función recibe `p_ids uuid[]`: **lo que ves es lo que sale**. El servidor
sigue mandando en lo suyo (permiso, quién ya lo recibió, quién no dejó correo, el
tope de 400), pero ya no vuelve a decidir a quién.

### `p_solo_contar` existe para que el aviso no mienta

La pantalla pregunta «¿a cuántos va esto?» con la **misma función** que luego
enviará. Un número calculado aparte del envío es un número que algún día dejará de
cuadrar, y aquí cuadrar importa: lo que sale por correo no se puede recoger.

### Un envío que no salió no se apunta

`cem_correo_cola` tiene un índice único sobre `clave` mientras el correo esté
pendiente. Si ya hay una copia igual esperando, el `insert ... on conflict do nothing`
la descarta y devuelve `null`. **Ese caso no escribe fila en el historial**: apuntar
un envío que no salió es exactamente la mentira que esta tabla existe para evitar.
La función devuelve `{enviado: false, motivo: 'ya_en_cola'}`.

### Borrar un mensaje no reescribe la historia

`cem_lead_envios` copia `plantilla_clave` y `plantilla_nombre` además de guardar el
`plantilla_id`. La clave ajena es `on delete set null`. Si mañana se borra una
plantilla, el historial sigue diciendo qué recibió cada persona.

Por lo mismo, **al editar no se cambia la clave**: el historial ya la tiene apuntada.

### Los huecos llevan relleno de reserva

`{nombre}`, `{nombre_completo}`, `{interes}`, `{origen}`. Cada uno tiene un valor por
defecto porque un contacto que no dijo qué le interesa no puede recibir «Gracias por
preguntar por .» — se nota a un kilómetro que lo mandó una máquina.

El relleno de `{interes}` es **«nuestra formación», en singular**. Con «nuestros
programas» salía *«Vimos que te interesa nuestros programas»*: los verbos de
alrededor van en singular y no concordaba. Se arregló en el relleno y no en las
cuatro plantillas.

> Si se añade un hueco nuevo hay que añadirlo **en los dos sitios**: en
> `cem_mensaje_pintar()` y en `pintarHuecos()` de `leads.html`. Mientras la vista
> previa y lo que sale no coincidan, la vista previa no sirve para nada.

### Dos caminos al escribir, a propósito

- **Con un mensaje guardado** → `cem_lead_enviar_plantilla`, que apunta el envío.
  Es lo que hace que el filtro de «ya lo recibió» diga la verdad.
- **A mano** → `cem_lead_responder`, la de siempre. No se apunta como plantilla:
  hacerlo sería mentir sobre qué se mandó.

Se puede retocar el texto antes de mandarlo; los cambios valen para ese envío y no
tocan el mensaje guardado.

### El tope de 400

Está para que un clic de más no se convierta en un correo masivo sin querer. Si la
lista pasa de ahí, la función se niega y dice que se afinen los filtros.

## Lo que encontró la prueba con navegador y no las estáticas

Dos cosas, las dos invisibles leyendo el código:

1. **Los filtros se reiniciaban solos después de enviar.** `cargar()` rehace los dos
   desplegables con lo que hay en la base, y rehacerlos borra lo elegido. Justo
   después de una tanda la pantalla se recarga sola: la lista pasaba de las 3
   personas que acababas de mirar a las 300 de siempre, sin avisar. Se guarda la
   elección antes y se devuelve después.

2. **El botón de abrir la ficha quedaba fuera de la pantalla.** Con «Qué le
   interesa» en su propia columna la tabla medía 1120px y no cabía ni en un monitor
   de 1440. El interés se metió bajo el nombre y dos columnas se afinaron con
   `min-width` propio, porque el `td.wrap{min-width:180px}` de toda la plataforma
   reserva más de lo que hace falta para una fecha.

## Pendiente, a sabiendas

- **Los diálogos no se cierran con Escape.** `modal()` sólo escucha la X y el fondo.
  Se puede arreglar en un sitio para las 82 pantallas, pero es un cambio que toca a
  todas y no pintaba meterlo aquí.
