# El registro y el correo de confirmación

## El problema que trae aquí

Alguien se registra, recibe el correo, pulsa el enlace y acaba en esto:

```
http://localhost:3000/#error=access_denied&error_code=otp_expired
```

Una dirección que no existe, con una cola incomprensible, y una cuenta que sigue
sin confirmar. **Esto no se arregla desde el código**: `localhost:3000` es el
«Site URL» guardado en la configuración de Supabase, y es a donde el servidor de
autenticación manda todo lo que sale por correo cuando nadie le dice otra cosa.

Lo que sí se arregló desde el código está más abajo. Lo primero es el ajuste del
panel, porque sin él lo demás no llega a usarse.

---

## 1 · Lo que hay que cambiar a mano (una vez)

En **Supabase → Authentication → URL Configuration**:

| Ajuste | Qué poner |
|---|---|
| **Site URL** | La dirección real de la plataforma publicada, terminada en `/plataforma/`. Es a donde va cualquier enlace de correo que no diga otra cosa. |
| **Redirect URLs** | Una línea por cada sitio desde el que se entra. Sin estar en esta lista, el `emailRedirectTo` que manda la aplicación **se ignora en silencio** y se usa el Site URL. |

En `Redirect URLs` hacen falta, como mínimo:

```
https://<usuario>.github.io/CEM-IMPULSO-MBA.-etc/plataforma/confirmar.html
https://<usuario>.github.io/CEM-IMPULSO-MBA.-etc/plataforma/nueva-clave.html
https://<usuario>.github.io/CEM-IMPULSO-MBA.-etc/plataforma/**
```

Y, mientras se trabaje en local, también:

```
http://127.0.0.1:8125/plataforma/**
http://localhost:8125/plataforma/**
```

Sustituye `<usuario>` y el nombre del repositorio por los de verdad, o por el
dominio propio cuando lo haya. Si un día se cambia el dominio, esta lista es lo
primero que hay que actualizar: los enlaces de correo dejarán de funcionar sin
ningún aviso en ninguna pantalla.

> El comodín `**` cubre las pantallas de dentro. No sirve para hosts distintos:
> cada dominio va en su línea.

### Mientras se prueba: quitar la confirmación de en medio

En **Authentication → Providers → Email**, la opción *Confirm email* se puede
apagar. Con ella apagada la cuenta queda usable al instante y no hace falta
correo. Es cómodo para probar y **no** es aceptable en producción: sin
confirmación cualquiera se registra con el correo de otra persona.

### Por qué caduca

`otp_expired` no siempre es que haya pasado mucho tiempo. Un enlace de
confirmación **vale una sola vez**, y hay clientes de correo y antivirus que lo
abren solos para comprobar si es peligroso. Con eso ya lo gastaron, y cuando la
persona pulsa, el enlace está usado. Por eso lo importante no es que el enlace
no caduque —va a caducar— sino que haya un botón de pedir otro. Ahora lo hay.

---

## 2 · Lo que ya está hecho en el código

### `plataforma/confirmar.html` — la pantalla que faltaba

El registro le dice a Supabase, en cada envío, a dónde volver:

```js
options: { emailRedirectTo: AQUI + 'confirmar.html' }
```

`AQUI` sale de `location.href`, no está escrito a mano: en local resuelve a
`127.0.0.1:8125` y publicado al dominio de verdad, sin tocar nada.

Esa pantalla resuelve los cuatro casos posibles, los cuatro con palabras:

| Llega con | Qué hace |
|---|---|
| sesión válida (`#access_token=…`) | «¡Cuenta confirmada!» y entra al panel del rol |
| `?token_hash=…&type=signup` | lo canjea con `verifyOtp` y entra |
| `#error=…&error_code=otp_expired` | explica que caducó y ofrece pedir otro |
| nada | explica que hay que abrir el correo, y ofrece pedir otro |

### La raíz también entiende la queja

Si el Site URL todavía apunta a la raíz de la plataforma, el error llega a
`index.html`. Antes se quedaba la cola pegada a la dirección y la pantalla de
entrada como si nada. Ahora se lee, se explica en castellano y se limpia la
dirección para que al recargar no vuelva a salir el mismo aviso.

### Reenviar

Está en dos sitios: en la tarjeta de «Revisa tu correo» justo después de
registrarse, y en `confirmar.html`. Sin esto, la única salida era registrarse
otra vez —que falla, porque el correo ya existe— y ahí se acababa el camino.

El límite de envíos del servidor de correo se distingue de una caída y se dice
que espere, en vez de un «error» a secas que invita a reintentar en el momento
y volver a fallar.

---

## 3 · Qué pregunta el registro, y por qué

| Campo | Obligatorio | Para qué |
|---|---|---|
| Nombre y apellido | sí | Van en el certificado tal como se escriban aquí |
| Tipo y número de documento | sí | Identifica a la persona en el expediente y en el título |
| Fecha de nacimiento | sí | El CEM es multigeneracional a propósito. Sin la fecha no se puede armar un grupo por edad ni saber a quién se está llegando |
| Correo | sí | Por donde llega la confirmación y todo lo demás |
| Contraseña, dos veces | sí | Mínimo 8 caracteres, con medidor mientras se escribe |
| Aceptar el uso de los datos | sí | Consentimiento explícito, no dado por supuesto |
| Teléfono, país, ciudad | no | Para poder contactar y para saber de dónde es la gente |
| A qué te dedicas | no | Separa formación de pasatiempo a la hora de armar el programa |
| Cómo nos conociste | no | La única medida de si la publicidad sirve |

Los nueve primeros los guarda `cem_handle_new_user()` en `cem_profiles` al
crearse la cuenta. Lo que el formulario no manda se pierde sin que nadie se
entere: si añades un campo a la pantalla, añádelo también al disparador.

### Los errores de HTML que había

Los ocho campos del registro tenían el rótulo sin `for`, sin `name` y sin
`autocomplete`. No es cosmético:

- Sin `for`, el rótulo no es un rótulo. Al tocarlo no pasa nada — y en un
  teléfono se toca el rótulo constantemente, porque es lo más grande de la
  fila. Un lector de pantalla no anuncia nada.
- Sin `name`, el navegador no ofrece autocompletar.
- El propio navegador lo reporta como error en la consola. Eran esos.

Y diez `<button>` sin `type`. El valor por omisión es «enviar»: mientras estén
fuera del formulario no pasa nada, pero basta mover uno dentro para que empiece
a enviarlo y nadie entienda por qué.

---

## Cuando cambie el dominio

1. Site URL y Redirect URLs, arriba.
2. Nada más en el código: `AQUI` sale de la dirección de la propia página.
3. Probar de verdad un registro nuevo, con un correo real, y pulsar el enlace.
   Es la única forma de saber que la lista quedó bien: cuando falla, falla en
   silencio.
