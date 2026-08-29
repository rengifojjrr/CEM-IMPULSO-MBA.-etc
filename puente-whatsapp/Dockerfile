# El puente, empaquetado para correr fuera del portátil.
# ─────────────────────────────────────────────────────────────────────────────
# Hoy esto corre en un MacBook. Si se cierra la tapa, el CEM deja de contestar
# por WhatsApp y nadie se entera hasta que alguien se queja — el latido avisa al
# equipo a los quince minutos, pero avisar de una caída no es lo mismo que no
# caerse.
#
# Lo que hay que entender antes de subirlo a ningún sitio: la sesión de WhatsApp
# vive en una CARPETA, no en una variable de entorno. Si esa carpeta no
# sobrevive al reinicio, cada despliegue obliga a escanear el QR otra vez, y a
# los pocos días WhatsApp empieza a mirar raro tantas vinculaciones. Por eso el
# volumen de /datos no es un detalle de despliegue: es el requisito.
#
# Ver docs/veronica-fuera-del-portatil.md.

FROM node:22-alpine

WORKDIR /app

# Primero las dependencias y luego el código: así un cambio en index.mjs no
# obliga a volver a bajarse Baileys entero.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY index.mjs ./

# La sesión de WhatsApp, en el volumen. Si esto apunta a un directorio que se
# borra al reiniciar, hay que escanear el QR en cada despliegue.
ENV CEM_PUENTE_AUTH=/datos/auth
ENV CEM_PUENTE_PUERTO=3000
ENV NODE_ENV=production

# Ni CEM_CEREBRO_URL ni CEM_PUENTE_SECRETO van aquí: el secreto se pone como
# secreto del servidor, no en una imagen que se puede descargar.

EXPOSE 3000
CMD ["node", "index.mjs"]
