# Sacar a Verónica del portátil

Hoy el puente de WhatsApp corre en un MacBook. Si se cierra la tapa, el CEM
deja de contestar por WhatsApp. La plataforma avisa al equipo a los quince
minutos de silencio —eso ya está—, pero avisar de una caída no es lo mismo que
no caerse: en esos quince minutos hay gente escribiendo a un número que no
contesta ni anota nada.

Esto es lo que falta para moverlo, y por qué está aquí escrito en vez de hecho:
**hay que crear una cuenta y poner una tarjeta**, y eso no lo puede hacer el
código. Lo demás está listo en el repositorio.

---

## Lo único que de verdad importa entender

**La sesión de WhatsApp es una carpeta, no una contraseña.**

Baileys guarda en `./auth` las claves de la vinculación. Si esa carpeta no
sobrevive al reinicio, cada despliegue obliga a escanear el QR otra vez desde
*Dispositivos vinculados*, y WhatsApp empieza a mirar mal tantas vinculaciones
seguidas del mismo número.

Por eso el servicio que se elija tiene que dar un **volumen persistente**. Un
alojamiento que sólo ofrezca variables de entorno no sirve, por barato que sea.
Ésa es la razón de que aquí haya un `fly.toml` y no un `railway.json`.

---

## Los comandos

Con la cuenta de Fly ya creada y `flyctl` instalado:

```sh
cd puente-whatsapp

# 1 · Crear la aplicación sin desplegar todavía.
fly launch --no-deploy --copy-config --name cem-veronica --region mia

# 2 · El volumen donde vivirá la sesión. 1 GB sobra: son unos kilobytes.
fly volumes create datos --size 1 --region mia

# 3 · Los secretos. NO van en el fly.toml: eso está en el repositorio, que es
#     público. El secreto del puente es el mismo que hay en Supabase, en la
#     variable CEM_PUENTE_SECRETO de la función cem-whatsapp.
fly secrets set \
  CEM_CEREBRO_URL="https://vajbsfgojtunamhrzrpf.supabase.co/functions/v1/cem-whatsapp" \
  CEM_PUENTE_SECRETO="el-mismo-que-en-supabase"

# 4 · Desplegar y ver el QR.
fly deploy
fly logs
```

El QR sale en los registros. Se escanea desde el WhatsApp del CEM, en
**Dispositivos vinculados → Vincular un dispositivo**, y a partir de ahí la
carpeta del volumen recuerda la sesión: no hay que volver a escanear aunque se
reinicie o se despliegue.

---

## Cómo saber que salió bien

Sin entrar a los registros:

1. En la plataforma, **Ajustes → WhatsApp**: tiene que decir *conectado*, con
   el número y la hora del último latido. El latido llega cada dos minutos.
2. Escribirle al número desde otro teléfono. En modo `escucha` no contesta,
   pero la conversación aparece en **Asistente → Conversaciones**.
3. Encenderla desde el panel cuando toque. El modo lo manda la plataforma, no
   el servidor: cambiarlo no necesita desplegar nada.

Si el panel sigue diciendo *caído* con el despliegue arriba, casi siempre es el
secreto: el de Fly y el de Supabase no coinciden. El puente lo comprueba al
arrancar y lo dice en los registros con todas las letras, justo para no tener
que averiguarlo mensaje a mensaje.

---

## Lo que NO cambia al moverlo

- **El cerebro sigue en Supabase.** Esto es un cable: no lleva el guion del
  asistente, ni claves de modelo, ni acceso a la base. Si el servidor se pierde,
  se cambia el secreto del puente y no se ha filtrado nada más. Ésa es la
  misma razón por la que se podía tener en un portátil sin que fuera temerario.
- **El interruptor sigue en el panel.** Encender, apagar y el modo se mandan
  desde la plataforma.
- **Los avisos que Verónica manda** —el recordatorio de clase, por ejemplo—
  siguen saliendo de la cola que vacía el latido. No hay que abrir ningún
  puerto hacia el servidor.

---

## Y si no se quiere pagar nada

El portátil sigue siendo una opción válida y está documentada en
`puente-whatsapp/LEEME.md`. Lo que hace que se sostenga es lo de arriba: la
plataforma se entera de la caída y avisa. Si el CEM va a usar WhatsApp como
canal de verdad —con recordatorios de clase saliendo solos— la tapa cerrada
deja de ser un inconveniente y pasa a ser una avería, y entonces sí toca mover.
