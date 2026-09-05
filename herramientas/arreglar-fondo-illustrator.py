#!/usr/bin/env python3
"""Corrige la falta de ortografía del fondo del certificado 8_IA_ILLUSTRATOR.

El diseño original —hecho fuera de este repositorio, con una tipografía de
pago que no tenemos— decía «Illustator» en los dos sitios donde aparece el
nombre del curso: el título grande en granate sobre el papel blanco, y el
texto blanco de la pestaña roja de la esquina inferior derecha. El nombre
del curso está pintado dentro del JPG, no es un dato, así que no bastaba con
corregir la base: había que retocar la imagen.

Cómo se corrige, sin tener la tipografía:
la palabra mal escrita ya contiene la letra que falta. «Illustator» acaba en
«r», y esa «r» es exactamente la misma que hay que meter entre «Illust» y
«ator». Copiándola de ahí, la letra nueva sale con la misma tipografía, el
mismo cuerpo, el mismo color y el mismo suavizado que el resto de la palabra;
no hay forma de que desentone porque no es una imitación, es la letra.

Sólo hacen falta dos medidas: cuánto blanco dejar entre la «t» y la «r»
nueva, y cuánto entre esa «r» y la «a». El segundo se midió sobre el
certificado hermano 7_IA_BRANDING, que tiene «ra» seguidas en su título con
el mismo cuerpo (la «r» mide 49 px en los dos). El primero se dedujo de los
espacios laterales del resto de letras de la palabra y se comprobó a ojo.

La pestaña roja lleva el texto en blanco sobre un degradado, así que ahí no
se puede copiar el rectángulo tal cual: se separa la letra de su fondo
(sacando su transparencia) y se vuelve a componer sobre el degradado que le
toca en su posición nueva. El degradado se reconstruye interpolando entre
una fila limpia de encima y otra de debajo, que para un degradado suave es
exacto.

Uso:
    python3 herramientas/arreglar-fondo-illustrator.py origen.jpg destino.jpg

Necesita Pillow. El resultado ya está guardado en el repositorio, en
certificados/fondos/8_IA_ILLUSTRATOR.jpg, así que esto sólo hace falta si
algún día hay que rehacerlo desde el diseño original.
"""

import sys

import numpy as np
from PIL import Image

# --- el título grande, granate sobre papel blanco -------------------------
TITULO_FILAS = (1364, 1466)   # banda que contiene los glifos enteros
TITULO_FIN_ILLUST = 520       # última columna de «Illust»
TITULO_INI_ATOR = 526         # primera columna de «ator»
TITULO_R = (756, 805)         # la «r» final, que es la que se copia
TITULO_HUECO_TR = 12          # blanco entre la «t» y la «r» nueva
TITULO_HUECO_RA = 3           # blanco entre la «r» y la «a», medido en Branding

# --- la pestaña roja, texto blanco sobre degradado ------------------------
PESTANA_FILAS = (2205, 2285)
PESTANA_COLS = (2930, 3290)
PESTANA_FIN_ILLUST = 3101
PESTANA_INI_ATOR = 3106
PESTANA_R = (3211, 3230)
PESTANA_HUECO_TR = 5
PESTANA_HUECO_RA = 1


def arreglar_titulo(a):
    """Mete la «r» que falta en el título, sobre papel blanco."""
    y0, y1 = TITULO_FILAS
    banda = a[y0:y1]
    glifo_r = banda[:, TITULO_R[0]:TITULO_R[1]].copy()
    ancho_r = TITULO_R[1] - TITULO_R[0]
    ator = banda[:, TITULO_INI_ATOR:TITULO_R[1]].copy()

    r_en = TITULO_FIN_ILLUST + 1 + TITULO_HUECO_TR
    ator_en = r_en + ancho_r + TITULO_HUECO_RA
    fin = ator_en + ator.shape[1]

    # El fondo aquí es papel blanco liso, así que basta con dejarlo limpio y
    # pegar encima cada trozo quedándose con lo más oscuro de los dos: el
    # suavizado de los bordes viene ya bien hecho desde el original.
    banda[:, TITULO_FIN_ILLUST + 1:fin + 10] = 255
    destino = banda[:, r_en:r_en + ancho_r]
    np.minimum(destino, glifo_r, out=destino)
    destino = banda[:, ator_en:ator_en + ator.shape[1]]
    np.minimum(destino, ator, out=destino)
    return fin - 1


def arreglar_pestana(a):
    """Lo mismo en la pestaña roja, pero componiendo sobre el degradado."""
    y0, y1 = PESTANA_FILAS
    x0, x1 = PESTANA_COLS

    # El degradado que hay debajo del texto se reconstruye interpolando entre
    # una fila limpia de encima y otra de debajo.
    arriba = a[y0 - 6, x0:x1].astype(np.float64)
    abajo = a[y1 + 6, x0:x1].astype(np.float64)
    t = np.linspace(0, 1, y1 - y0)[:, None, None]
    fondo = arriba[None] * (1 - t) + abajo[None] * t

    trozo = a[y0:y1, x0:x1].astype(np.float64)
    # Cuánto de blanco tiene cada píxel respecto al rojo que tendría detrás.
    alfa = np.clip((trozo - fondo) / np.maximum(255.0 - fondo, 1e-6), 0, 1).mean(axis=2)

    def cols(desde, hasta):
        return slice(desde - x0, hasta - x0)

    ancho_r = PESTANA_R[1] - PESTANA_R[0]
    alfa_r = alfa[:, cols(*PESTANA_R)].copy()
    alfa_ator = alfa[:, cols(PESTANA_INI_ATOR, PESTANA_R[1])].copy()

    r_en = PESTANA_FIN_ILLUST + 1 + PESTANA_HUECO_TR
    ator_en = r_en + ancho_r + PESTANA_HUECO_RA
    fin = ator_en + alfa_ator.shape[1]

    nueva = np.zeros_like(alfa)
    hasta_illust = cols(x0, PESTANA_FIN_ILLUST + 1).stop
    nueva[:, :hasta_illust] = alfa[:, :hasta_illust]
    hueco = cols(r_en, r_en + ancho_r)
    np.maximum(nueva[:, hueco], alfa_r, out=nueva[:, hueco])
    hueco = cols(ator_en, ator_en + alfa_ator.shape[1])
    np.maximum(nueva[:, hueco], alfa_ator, out=nueva[:, hueco])

    compuesto = fondo * (1 - nueva[:, :, None]) + 255.0 * nueva[:, :, None]
    # De «Illust» hacia la izquierda no se toca nada: se queda el original.
    desde = cols(PESTANA_FIN_ILLUST + 1, x1).start
    a[y0:y1, x0 + desde:x1] = np.clip(compuesto[:, desde:], 0, 255).astype(a.dtype)
    return fin - 1


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        return 1
    origen, destino = sys.argv[1], sys.argv[2]
    a = np.asarray(Image.open(origen).convert('RGB')).astype(np.int16).copy()
    if a.shape[:2] != (2400, 3300):
        print(f'El fondo debería medir 3300x2400 y mide {a.shape[1]}x{a.shape[0]}.')
        return 1
    print(f'título:  la palabra acaba ahora en x={arreglar_titulo(a)} (antes 804)')
    print(f'pestaña: la palabra acaba ahora en x={arreglar_pestana(a)} (antes 3229)')
    # Calidad alta y sin submuestreo de color: el certificado se imprime.
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(
        destino, quality=95, subsampling=0)
    print('escrito', destino)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
