# La mascota, y cómo hacer que quede fiel de verdad

Ahora mismo en la plataforma se ve un **dibujo vectorial** que hice a partir de
tus dos láminas. Se le parece —el bicho gris peludo, el birrete de arcoíris, la
sudadera azul, los dos colmillos— pero no es tu render, y conviene decir por
qué antes de hablar de cómo arreglarlo.

## Por qué el dibujo nunca va a ser igual

Tu lámina es una imagen tridimensional: pelo con miles de hebras, sombras
suaves, la textura de la tela del algodón, el brillo del plástico del birrete.
Un SVG dibuja formas planas con bordes limpios. **Eso no se puede convertir sin
perder justo lo que la hace buena.** Cualquiera que te diga que «vectoriza» un
render peludo te va a dar una mancha gris con picos.

Así que la respuesta a «que se vea exactamente igual» no es mejorar el dibujo.
Es **usar tu imagen**. El dibujo existe sólo para que la plataforma no se vea
vacía mientras tanto.

---

## Lo que hay que hacer (2 minutos)

**El asistente → Ajustes → Su cara → Subir y usar esta.**

Sube el PNG de la mascota. En cuanto esté:

- se usa en el botón del chat, en cada respuesta, y en la pantalla del
  asistente;
- el dibujo vectorial deja de aparecer en todas partes;
- no hay que tocar código ni volver a subir nada.

**Cómo tiene que ser el archivo:**

| | |
|---|---|
| Formato | PNG **con fondo transparente**. Si tiene el fondo blanco se verá un cuadrado blanco sobre el botón redondo. |
| Encuadre | El bicho **entero y centrado**, con poco aire alrededor. |
| Tamaño | Entre 600 y 1200 px de lado. Más no hace falta y tarda en cargar. |
| Pose | La de frente, la primera de arriba a la izquierda de tu lámina. |

Si sólo tienes la lámina con las cuatro poses juntas, **súbemela al repositorio
tal cual** (ver abajo) y yo la recorto: hago la de frente para el chat y guardo
las otras tres.

---

## Cómo hacérmela llegar, si quieres que la trabaje yo

Las imágenes que pegas en el chat las veo, pero **no llegan al disco de esta
sesión**: no puedo abrirlas como archivo, ni recortarlas, ni medirlas. Por eso
tuve que dibujarla en vez de usarla.

Tres formas, de más fácil a menos:

**1. Arrastrarla al repositorio desde GitHub (lo más rápido).**
Entra a `github.com/rengifojjrr/CEM-IMPULSO-MBA.-etc`, ve a la carpeta
`plataforma/assets/`, pulsa **Add file → Upload files**, arrastra el PNG y
confirma. Me dices que ya está y yo la recojo.

**2. Ponerla en tu Google Drive.**
Súbela a Drive con un nombre reconocible (`mascota-cem.png`) y dime cómo se
llama. Tengo acceso a tu Drive desde aquí y la bajo.

**3. Mandármela por correo a ti mismo.** Igual: la busco y la saco del adjunto.

### Qué haría yo con el archivo, que tú no puedes hacer a mano

- **Recortar las cuatro poses** de la lámina en cuatro archivos limpios.
- **Quitar el fondo blanco** de verdad, dejando el borde del pelo suave y no
  recortado a hachazos.
- **Sacar los tamaños que hacen falta**: el del botón (88 px), el de la pantalla
  (240 px) y el de la portada, cada uno en WebP, que pesa la mitad que el PNG.
- **Hacer el favicon** —el iconito de la pestaña del navegador— con la cara.
  Ahí sí hace falta un vector simplificado, porque a 32 píxeles el render se
  convierte en una mancha; ese es el único sitio donde el dibujo es mejor que
  la foto.
- Usar **la pose que toca en cada sitio**: la de frente en el chat, la de
  espaldas —la que lleva el logo del CEM— en el pie de los correos.

---

## Lo que sí puede mejorar de verdad: más poses

Esto es lo que separa una mascota de un logotipo. Tienes cuatro vistas del
mismo bicho quieto; lo que hace que una mascota se sienta viva son **cuatro
gestos distintos** apareciendo donde toca:

| Dónde | Qué gesto | Por qué |
|---|---|---|
| El botón del chat | de frente, sonriendo | es el que ya tienes |
| Cuando está pensando | mirando arriba, la pata en la barbilla | ocupa esos 3 segundos de espera |
| Al emitir un certificado | los brazos arriba, celebrando | es el momento bueno del alumno |
| Cuando algo falla | encogido de hombros, disculpándose | un error con cara pide menos perdón |

Para que salgan **del mismo bicho** y no de cuatro parecidos, hay que darle al
generador la descripción exacta del personaje. La tienes escrita abajo: cópiala
tal cual y cambia sólo la última línea, la de la pose.

---

## La ficha del personaje, para generar más poses

Copia todo lo que hay entre las líneas y pégalo en el generador de imágenes que
usaste para la lámina. **Cambia únicamente la línea que empieza por `POSE:`.**

─────────────────────────────────────────────────────────────────────────────

3D character render, Pixar-style, single character, plain white background,
soft studio lighting, subtle contact shadow on the ground, full body visible.

CHARACTER: a small, round, friendly fluffy monster. Body is one single
egg-shaped mass — no neck, no separate head — covered in soft shaggy white and
light-grey fur, slightly longer around the outline so the silhouette reads as
fuzzy. Short stubby legs with three small rounded toes each. Small paws, no
visible hands.

FACE: two very large white eyes side by side, almost touching, with big dark
blue-grey irises and bright round highlights, looking slightly toward the
viewer. Wide open friendly smile, dark interior, with two small white fangs
hanging from the upper corners of the mouth. No nose, no eyebrows.

HAT: a graduation mortarboard sitting flat on top of the head, small relative
to the body and seen almost edge-on so it does not cover the eyes. The square
board is a smooth rainbow gradient going left to right: blue, cyan, green,
yellow, orange, red. Small red button at the centre, with a cord running to the
right corner and a red-and-gold tassel hanging down beside the face.

CLOTHES: an open royal-blue zip hoodie, worn loose. The hood rests behind the
shoulders. The jacket is open wide so a broad strip of the fluffy chest shows
down the middle. Two small zipped chest pockets. The back of the hoodie carries
the CEM logo in black: the letters C and M with a small rainbow mortarboard as
the mark between them, and "CENTRO DE ESTUDIOS DE MARKETING" in thin spaced
capitals underneath.

STYLE: warm, friendly, for a school. Not scary, not sharp. Rounded everywhere.

POSE: standing straight, facing the viewer, smiling.

─────────────────────────────────────────────────────────────────────────────

Para las otras tres, sustituye la última línea por:

- **Pensando** — `POSE: looking up and to the side, one paw raised to the chin, thoughtful expression, mouth closed in a small smile.`
- **Celebrando** — `POSE: both arms raised high in celebration, eyes closed happily, mouth wide open in a cheer, one foot slightly off the ground.`
- **Disculpándose** — `POSE: shoulders shrugged, both paws turned palms-up at its sides, head tilted, apologetic half-smile, eyes looking slightly down.`

Genera las cuatro **en la misma sesión y con la misma semilla** si el generador
lo permite: es lo que hace que sean el mismo bicho y no cuatro primos. Súbelas
al repositorio y las conecto.

---

## Y si prefieres mejorar el dibujo vectorial

Se puede, y no es tiempo perdido: el dibujo va a seguir siendo el que se vea en
el favicon y en los sitios diminutos. Sale de un programa,
`herramientas/dibujar-mascota.mjs`, así que se ajusta cambiando números, no
redibujando curvas.

Lo que ya sé que le falta comparado con tu lámina:

- el pelo es plano; el tuyo tiene volumen y mechones que se cruzan;
- la sudadera no tiene la textura del tejido ni el brillo del cierre;
- falta el logo del CEM (sólo se ve en la vista de espaldas de tu lámina);
- las patas asoman poco.

Dime cuál te chirría más al verlo y lo corrijo. Pero que quede claro: **por ese
camino se llega a un dibujo bueno, no a tu render.** Para «exactamente igual»,
el camino es subir la imagen.
