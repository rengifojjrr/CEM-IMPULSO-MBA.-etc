# El certificado de Illustrator decía «Illustator»

## Qué pasaba

El fondo del certificado del módulo 8 del diplomado de IA tenía una falta de
ortografía en el nombre del curso: le faltaba la `r` de «Illust**r**ator». Y
salía dos veces en la misma hoja:

- el título grande en granate, debajo de «con éxito el curso de:»;
- el texto blanco de la pestaña roja de la esquina inferior derecha.

Afectaba a los **19 certificados** emitidos con esa plantilla: 6 que ya
estaban marcados como reemplazados y **13 vigentes**, repartidos en dos
grupos —«IA · Mañana 11:00 AM–1:30 PM · Grupo 2 · 2026» (7 personas) y
«IA · Sábado 1:00–5:00 PM · Grupo 2 · 2026» (6 personas)—.

## Por qué no bastaba con corregir un dato

El nombre del curso no es un campo: va **pintado dentro del JPG** del fondo.
En la base sólo se guardan el nombre de la persona, su cédula y la fecha. Así
que no había nada que corregir en ningún registro: había que retocar la
imagen.

## Cómo se corrigió, sin tener la tipografía

El diseño se hizo fuera de este repositorio con una tipografía de pago que no
tenemos. Se probaron 26 tipografías libres parecidas y la que más se acercaba
coincidía sólo en un 81 % de los píxeles: se habría notado.

La solución estaba dentro de la propia palabra. «Illustator» **acaba en `r`**,
y esa `r` es exactamente la que hay que meter entre «Illust» y «ator».
Copiándola de ahí, la letra nueva no es una imitación: es la letra, con su
tipografía, su cuerpo, su color y su suavizado.

Sólo hacían falta dos medidas, el blanco que va antes y después de la letra
nueva:

- **`r` → `a`: 3 px.** Medido en el certificado hermano `7_IA_BRANDING`, que
  tiene «ra» seguidas en su título y con la misma `r` de 49 px de ancho.
- **`t` → `r`: 12 px.** Deducido de los espacios laterales del resto de letras
  de la palabra y comprobado a ojo con el resultado ampliado.

En la pestaña roja el texto es blanco sobre un degradado, así que ahí no se
puede copiar el rectángulo tal cual: se separa la letra de su fondo y se
vuelve a componer sobre el degradado que le toca en su sitio nuevo. El
degradado se reconstruye interpolando entre una fila limpia de encima y otra
de debajo, que para un degradado suave sale exacto.

El resultado toca **16 052 píxeles** y ninguno fuera de esas dos zonas.

Todo esto está en `herramientas/arreglar-fondo-illustrator.py`, con las
medidas escritas, por si algún día hay que rehacerlo desde el diseño original.

## Dónde está el fondo bueno

En el repositorio: `certificados/fondos/8_IA_ILLUSTRATOR.jpg`. Se sirve desde
el propio sitio, así que la dirección definitiva es

    https://escuelacem.com/certificados/fondos/8_IA_ILLUSTRATOR.jpg

El fondo viejo sigue en el almacenamiento de Supabase, intacto, por si alguna
vez hace falta comparar.

## Lo que queda por hacer, y en qué orden

Los certificados **se dibujan al vuelo** a partir de la plantilla: nadie
guarda un PDF. Por eso, en cuanto la plantilla apunte al fondo bueno, quedan
bien los 19 de golpe —los ya emitidos también—, sin tocar ni un registro y
sin cambiar ningún código de verificación. Sólo hay que volver a
descargarlos y reenviarlos.

El cambio de la plantilla está escrito en
`supabase/migrations/20260905000001_fondo_illustrator.sql`, pero **no se ha
aplicado todavía, a propósito**: GitHub Pages publica desde `main`, así que
el archivo no existe en esa dirección hasta que esta rama esté fusionada.
Aplicarlo antes dejaría los certificados sin fondo, que es peor que la falta
de ortografía.

Así que:

1. Fusionar esta rama en `main` y esperar a que Pages publique.
2. Comprobar que el archivo está:
   `curl -sI https://escuelacem.com/certificados/fondos/8_IA_ILLUSTRATOR.jpg`
   tiene que devolver `200`.
3. Aplicar la migración.
4. En el generador, Certificados emitidos → los dos grupos de arriba →
   «Descargar grupo». Esa carpeta ya son los certificados buenos.

### Si no quieres esperar a la fusión

Hay un atajo, porque el generador ya sabe hacerlo solo: si a una plantilla le
pones el fondo **incrustado**, al guardarla lo sube al almacenamiento y deja
la dirección puesta (`externalizarFondo`, en `certificados/generador.js`).
Basta con abrir la plantilla `8_IA_ILLUSTRATOR`, cambiarle el fondo por el
archivo corregido y guardar. Con eso queda arreglado en el momento, y luego
la migración ya no hace falta.
