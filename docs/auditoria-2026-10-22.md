# Auditoría de la plataforma · 22 de octubre de 2026

La segunda radiografía, con el mismo método que la del 12 de septiembre
(`docs/auditoria-2026-09-12.md`): abrir las pantallas en un navegador de
verdad, llamar a las funciones del servidor como lo haría un desconocido y
leer la base. Lo que no se pudo comprobar, se dice al final.

---

## En una página

**La plataforma está sana por dentro. Lo que no tiene, otra vez, es nada que
vender ni quien atienda.**

| Lo que se comprobó | Resultado |
|---|---|
| Comprobaciones del repositorio | 19 estáticas y 8 de SEO y versiones: todo en verde |
| JavaScript | 67 archivos compilan, 0 errores |
| Pantallas en Chromium | 114 abiertas: 0 errores de JS, 0 recursos rotos, 0 desbordes a 390 px; las 69 privadas mandan a la entrada |
| Tareas programadas | 14, 0 fallos en 7 días |
| Correo | 175 enviados; los únicos fallos son de agosto |
| GitHub | todas las ejecuciones recientes en verde |

Lo que frena:

- **0 cursos publicados, 0 cohortes abiertas, 0 inscripciones desde el 12 de
  septiembre.** Todo el circuito de venta sigue construido y parado.
- **8 contactos, y los 8 siguen en «nuevo».** Nadie les ha escrito, algunos
  desde agosto. 4 llegaron después de la primera radiografía, 3 pidiendo aviso
  de convocatoria.
- **Sin medición:** GA4, el píxel de Meta y el WhatsApp del CEM siguen vacíos
  en Configuración.
- **WhatsApp:** el puente lleva caído desde el 27 de agosto y el modo está en
  «apagada».
- **Cemi en la web pública: 0 conversaciones de visitantes en cinco semanas**,
  con 261 visitas en 30 días. Cuando contesta, contesta bien (0 errores), y el
  equipo no le ha enseñado ningún guion propio.
- **Promociones:** ninguna en marcha. La del 10 % terminó el 30 de septiembre
  con 2 códigos dados y 0 canjeados.

### Cifras de la base, 22 de octubre

| Dato | Valor |
|---|---|
| Visitas desde el 12 de septiembre | 400 |
| Visitas en los últimos 30 días | 261 (186 directas, 75 desde Google) |
| Páginas más vistas en 30 días | portada 94, verificar 88, programas 23, diplomado de marketing 11 |
| Cuentas activas | 47 (45 estudiantes, 2 superadmin); 8 entraron en 30 días |
| Certificados vigentes | 667 (15 emitidos desde el 12 de septiembre, 136 reemplazados) |
| Diplomas en físico | 38 en imprenta, 1 pedido |
| Formas de pago activas | sólo tarjeta |

---

## 1 · Lo que estaba mal, y qué se hizo

### 1.1 · Arreglado el 22 de octubre

**Quien volvía a escribir recibía un error y su mensaje se perdía.** El hallazgo
más serio, y salió al probar otro arreglo. La tabla de contactos admite un solo
contacto por correo; la ventana «Contacto» / «Avísame» de la plataforma y Cemi
(`cem_lead_publico_crear`) insertaban sin mirar, así que la segunda vez que una
persona escribía con el mismo correo la base contestaba *duplicate key value
violates unique constraint* y el mensaje no llegaba a nadie. Justo la persona
más interesada: la que vuelve. Ahora el mensaje nuevo se suma a su ficha, el
viejo baja a la nota interna con su fecha y el equipo recibe «X volvió a
escribir». «¿Tienes dudas?» ya sumaba el mensaje, pero en silencio; ahora
avisa igual. Migración `20261022000002_contacto_que_vuelve.sql`.

**Los formularios públicos no tenían tope.** Cinco puertas crean contactos
desde fuera («¿Tienes dudas?», la ventana de contacto, las promociones, las
listas de pre-registro y Cemi) y sólo una tenía límite. Cualquiera podía
llamarlas en bucle con correos inventados: Contactos lleno de basura y, peor,
un acuse por correo a cada dirección. Nuestro remitente mandando correos a
desconocidos es como se quema la reputación de un dominio. Ahora hay un tope
único en la tabla —60 contactos nuevos por hora entre todas las puertas, diez
veces lo máximo que ha entrado nunca— que no cuenta lo que mete el equipo
desde Admin. Migración `20261022000001_formularios_con_tope.sql`.

**`cem_stripe_asegurar_forma_de_pago` la podía llamar cualquier sesión.** Vuelve
a activar el pago con tarjeta: un alumno, desde la consola, podía deshacer que
el equipo lo hubiera apagado. Ninguna pantalla la usa; queda sólo para el
servidor.

**Las visitas cortaban la página a 40 caracteres**
(«programas/diplomado-inteligencia-artific»): dos programas de nombre largo
parecido se contaban como uno. Ahora a 80.

**Cemi se ofrece en las páginas de programa.** A los 20 segundos de lectura,
un globo encima de su botón: «¿Dudas sobre este programa? Pregúntale a Cemi:
te contesta aquí mismo.» Una vez por pestaña, nunca si ya hay conversación o
la ventana está abierta, y se cierra con la X. Es la apuesta para el «0
conversaciones de visitantes»: el botón se lee como adorno; un globo que
habla, no. Si en un mes sigue en cero, el problema no es que no se vea.

### 1.2 · Sigue pendiente, y es decisión o cuenta tuya

**Seguridad**

- **El proyecto SEM sigue abierto** (`upsert_quote`, `upsert_pm_project`,
  `log_quote_event`, `log_pm_project_event`, `cq_*`): un anónimo puede escribir
  en sus tablas. Ya estaba en septiembre como decisión tuya.
- **Protección de contraseñas filtradas: apagada** (aviso de Supabase).
- Menores: `btree_gist` instalado en `public`; la función de diagnóstico
  `cem-bancaribe-probe` sigue desplegada (sólo admin; se marcó como temporal);
  `forest-ai-recognize`, `forest-admin-users` y `fb360` son de otros proyectos
  y viven en este.

**Datos**

- **Periodo activo «Otoño 2024»** en Configuración.

---

## 2 · Lo que sólo puedes hacer tú, por orden

1. **Abrir la convocatoria:** publicar los dos diplomados con precio, fecha y
   cohorte. Sin esto nada de lo demás convierte.
2. **Escribir a los 8 contactos en «nuevo»** (Admin → Contactos de la web) y
   marcarlos. Desde hoy, si vuelven a escribir, llega aviso.
3. **Pegar GA4, el píxel de Meta y el WhatsApp** en Configuración → «Medir y
   que nos escriban».
4. **Reconectar el puente de WhatsApp** (QR) y pasar el modo a «responde», o
   decidir dejarlo apagado.
5. **Activar la protección de contraseñas filtradas** en Supabase →
   Authentication.
6. **Rotar las claves** de Resend, Stripe y el webhook (pendiente desde agosto).
7. **Formas de pago locales** (pago móvil, Zelle, transferencia).
8. **Periodo activo** en Configuración.
9. **Proyecto SEM:** separarlo o ponerle clave.
10. **Groq en plan Developer** y **el canje automático de los códigos de
    campaña** (pendientes de septiembre, `docs/lo-que-falta.md` §0, 3b y 3c).

---

## 3 · Cómo se probó

- **Repositorio:** `herramientas/revisar.mjs`, `revisar-seo.mjs` y
  `versionar-assets.mjs --revisar`; `node --check` sobre los 67 archivos de
  JavaScript.
- **Pantallas:** las 114 páginas HTML del repositorio en Chromium, a 1280 y a
  390 px, con las llamadas a la base relevadas de verdad pero **sin ninguna
  escritura**: se bloquearon las funciones que escriben y no se contó ninguna
  visita. Se miraron errores de JavaScript, recursos que dan 404, enlaces a
  archivos que no existen y desbordes horizontales.
- **Base:** avisos de seguridad y rendimiento de Supabase, permisos de cada
  función pública para `anon` y `authenticated`, las 14 tareas programadas y
  sus últimas ejecuciones, la cola de correo y las cifras de negocio.
- **Los arreglos:** probados dentro de una transacción que se deshace sola, así
  que no quedó ninguna fila de prueba. Con el tope lleno, un anónimo recibe
  «Estamos recibiendo muchos mensajes ahora mismo» y el equipo entra igual. Un
  mismo correo escribiendo por la ventana de contacto, por Cemi y por «¿Tienes
  dudas?»: un solo contacto, los mensajes viejos en la nota, un aviso al
  equipo por cada mensaje nuevo, el doble clic sin efecto y un solo acuse.
- **El globo de Cemi:** Chromium a 1280 y 390 px. No sale antes de 20 s, sale
  después, se cierra, no vuelve al recargar, abre el chat. No sale en la
  portada ni en la lista de programas.

## 4 · Lo que no se pudo comprobar

- **Las pantallas con sesión** por dentro: no hay cuentas de prueba sembradas
  (`@pruebas.local`) ni `CEM_PASS` en este entorno. Se comprobó que las 69
  privadas mandan a la entrada y que su JavaScript compila, no lo que enseñan.
- **El puente de WhatsApp:** está apagado; no hay nada que probar hasta que se
  reconecte.
