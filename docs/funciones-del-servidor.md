# Qué hace cada función del servidor

Casi nada de lo que importa en esta plataforma ocurre en el navegador. El
navegador pinta pantallas; quien decide si un pago se abona, si un certificado
se emite o si alguien puede ver una nota es el servidor. Este documento es el
inventario de esas decisiones, para que quien venga después no tenga que
deducirlas leyendo SQL.

Hay tres clases de código en el servidor:

1. **Funciones de la base** (`rpc`), que corren dentro de Postgres.
2. **Funciones de borde** (*Edge Functions*), que corren fuera y hablan con
   servicios de terceros: el banco, el correo.
3. **Una tarea programada**, que corre sola todos los días.

---

## 1. Funciones de la base

### Por qué son `security definer`

Casi todas están declaradas `security definer`: corren con los permisos de quien
las creó, no de quien las llama. Eso es a propósito. Si `cem_aprobar_pago`
corriera con los permisos de quien la llama, habría que darle a esa persona
permiso de escritura sobre la tabla de pagos — y entonces también podría
escribir cualquier otra cosa en esa tabla, saltándose las reglas. Así, en
cambio, la única forma de tocar un pago es pasando por la función, y la función
comprueba primero quién llama.

> **La trampa que ya nos costó una vez.** Postgres le concede `EXECUTE` a
> `PUBLIC` a toda función nueva. `PUBLIC` incluye a `anon`, o sea a cualquiera
> que tenga la clave pública — que va escrita en el HTML. Revocar sólo de `anon`
> **no hace nada**, porque la concesión a `PUBLIC` sigue en pie. La fórmula
> correcta, y la que hay que repetir en cada función nueva, es:
>
> ```sql
> revoke all on function public.mi_funcion() from public, anon;
> grant execute on function public.mi_funcion() to authenticated, service_role;
> ```

### Quién es quién

Estas cuatro devuelven un booleano y las usan tanto las políticas de las tablas
como las demás funciones. Son el vocabulario de permisos de todo el sistema:

| Función | Cierto para |
|---|---|
| `cem_role()` | (devuelve el rol como texto) |
| `cem_es_admin()` | `admin`, `superadmin` |
| `cem_es_auditor()` | `auditor` — sólo lectura, garantizado por políticas restrictivas |
| `cem_puede_cobranza()` | `cobranza`, `coordinador`, `admin`, `superadmin` |
| `cem_is_staff()` | el equipo, sin estudiantes |
| `cem_is_teacher()` | quien dicta algo |
| `cem_can_read_all()` | quien puede leer todo, incluidos los profesores |
| `cem_docente_de_curso(curso)` | quien tiene ese curso asignado, directo o por cohorte |
| `cem_docente_de_cohorte(cohorte)` | idem, para una cohorte |
| `cem_owns_enrollment(inscripcion)` | la propia persona inscrita |
| `cert_puede_gestionar()` | quien puede diseñar plantillas y emitir certificados |

### Dinero

| Función | Qué decide |
|---|---|
| `cem_reportar_pago(...)` | El estudiante avisa que pagó. Rechaza una referencia repetida: dos reportes del mismo pago abonarían dos veces la cuota. |
| `cem_stripe_producto_reflejar(curso)` | Manda el curso a Stripe como **producto**, no como precio. Se llama sola al guardar el curso. El identificador lo elegimos nosotros (`cem_<uuid>`), así no hay que esperar la respuesta para saber qué producto es cada curso. |
| `cem_stripe_sync_revisar()` | Recoge lo que Stripe contestó a cada reflejo, cada minuto. Sin esto la pantalla diría «sincronizado» por haber mandado la petición. Se cura sola: si crear falló porque ya existía, lo apunta; si actualizar falló porque no existe, lo vuelve a crear. |
| `cem_stripe_codigo_fiscal(modalidad)` | El código fiscal que Stripe exige, deducido de la modalidad. Un desplegable más es un desplegable que se rellena mal. |
| `cem_aprobar_pago(pago, nota)` | Da el pago por bueno y abona la cuota. Sólo cobranza para arriba. |
| `cem_aprobar_pago_multi(pago, nota)` | Igual, cuando el pago cubre varias cuotas. |
| `cem_rechazar_pago(pago, motivo)` | Exige motivo: el estudiante lo va a leer. |
| `cem_anular_pago(pago, motivo)` | Deshace un pago ya aprobado y devuelve la cuota a su estado anterior. |
| `cem_register_payment(...)` | Carga un pago desde el lado del equipo, sin reporte previo. |
| `cem_recibo_pago(pago)` | Los datos del comprobante, con su número. |
| `cem_estado_de_cuenta(inscripcion)` | Cuotas, pagos y saldo de una inscripción. |
| `cem_cartera_por_cobrar()` | Lo que falta cobrar, para conciliar. |
| `cem_cierre_de_mes(mes)` | Las cuatro cifras del cierre —facturado, cobrado, vencido y por revisar— con su detalle. Se calculan aquí, en un solo sitio, para que no dependan de qué pantalla se mire. |
| `cem_tasa_vigente()` | La última tasa cargada. |
| `cem_guardar_tasa_manual(valor, fecha)` | Cargar la tasa a mano. Sólo cobranza para arriba. |
| `cem_self_enroll(...)` | La inscripción por cuenta propia. **El precio lo pone el servidor**, no el formulario: si viniera del navegador, cualquiera se inscribiría por un dólar. |
| `cem_cancelar_inscripcion(inscripcion, motivo)` | Dar de baja lo que nunca se pagó, a petición del propio estudiante o del equipo. Con un solo pago confirmado se niega: eso ya no es cancelar, es devolver, y lo decide quien cobra. |
| `cem_invitar_a_curso(persona, curso, cohorte, descuento, cuotas, mensaje, vence)` | La casa **propone** un precio. No crea inscripción ni cuotas: sólo la oferta y el aviso. Sólo equipo. Aplica el mismo recargo por plan que `cem_self_enroll` —si no, invitar sería una tarifa paralela— y rechaza el programa sin publicar, la cohorte de otro curso y a quien ya está inscrito. |
| `cem_mis_invitaciones()` | Las que tiene sin contestar quien pregunta, ya sin las caducadas. |
| `cem_responder_invitacion(invitación, aceptar)` | Aceptar crea la inscripción y emite el plan con el precio **de la invitación**, no con el que mande el navegador. Comprueba que la invitación sea de quien contesta: si no, contestar por otro sería inscribir a otro. |
| `cem_invitaciones_listar()` / `cem_retirar_invitacion(id)` | Lo que el equipo mandó, y deshacerlo mientras nadie lo haya contestado. |
| `cem_evaluar_insignias(persona)` | Aplica las reglas de las insignias activas a una persona. Cada quien puede evaluarse a sí misma; para evaluar a otra hace falta ser del equipo. Los números de cada regla —el promedio, el porcentaje de asistencia, cuántas entregas— salen de la propia insignia, no del código: cambiar «promedio 90» por «85» es una decisión de la escuela. |
| `cem_evaluar_insignias_todos()` | Lo mismo para todo el mundo, y devuelve a cuántos alcanzó. Es lo que se pulsa el día que se cambia un criterio, para no esperar a que cada persona entre. Sólo equipo. |
| `cem_insignia_alcance(regla, valor, curso)` | A cuántas personas alcanzaría una regla **antes** de guardarla. Bajar un umbral puede otorgar la insignia a media institución de golpe. |

### Primero se paga, después se entra

La regla del negocio: sin pago confirmado no hay curso. Vive en **una sola
función**, para que la clase, el examen y el progreso no puedan opinar distinto.

| Función | Qué decide |
|---|---|
| `cem_acceso_abierto(inscripcion)` | La única definición de «tiene acceso»: es del equipo, o el curso es gratis, o la inscripción está activa o finalizada, o hay un pago confirmado. Todo lo demás la consulta; nadie la reimplementa. |
| `cem_mi_acceso()` | Para cada inscripción de quien pregunta: si está abierta, su estado, y cuánto es la primera cuota. Es lo que deja a la pantalla explicar por qué está bloqueada en vez de dejar chocar contra un error en cada clic. Las canceladas no salen. |
| `cem_material_lecciones(ids[])` | El enlace y el cuerpo de las lecciones pedidas, sólo para el equipo, el docente del curso, o quien pagó. Existe porque `cem_lessons.url` y `.contenido` ya no se leen por consulta directa — ver [politicas-de-acceso.md](politicas-de-acceso.md). Al **estudiante**, si la lección tiene vídeo asignado, se le entrega el identificador y no la URL entera; a **quien edita** se le entrega siempre la URL, que para eso la escribió. Esconderla también al que edita fue un fallo real: el editor enseñaba el campo vacío y al guardar escribía el vacío encima. |

Dos disparadores lo sostienen sin que nadie tenga que acordarse:
`cem_tg_activar_al_pagar` pone la inscripción en activa cuando un pago pasa a
confirmado, y `cem_tg_activar_si_es_gratis` abre en el acto lo que no cuesta
nada.

### Académico

| Función | Qué decide |
|---|---|
| `cem_iniciar_intento(evaluacion)` | Abre un intento, respetando el máximo permitido y las fechas. |
| `cem_exam_questions(evaluacion)` | Las preguntas **sin las respuestas correctas**: si viajaran al navegador, estarían en el código de la página. |
| `cem_submit_assessment(entrega, respuestas)` | Corrige y guarda la nota. |
| `cem_grade_submission(entrega, puntaje, feedback)` | Calificación a mano del docente. |
| `cem_reabrir_entrega(entrega, motivo)` | Devuelve una entrega ya calificada. Queda en auditoría. |
| `cem_recalc_progress(inscripcion)` | Recalcula el avance contando lecciones **y** evaluaciones. |
| `cem_mi_desempeno(persona)` | Promedio, evaluaciones y qué falta, por programa. |
| `cem_resumen_grupo(cohorte)` | Lo mismo para todo un grupo: lo que ve el docente. |
| `cem_requisitos_certificado(inscripcion)` | Qué le falta a alguien para poder certificarse. **No comprueba de quién es la inscripción**, así que sólo la alcanza el servidor: desde el navegador se llama la envoltura de abajo. |
| `cem_mis_requisitos_certificado(inscripcion)` | Lo mismo, pero comprobando antes que la inscripción sea de quien pregunta (o que quien pregunta sea del equipo). Es la que llaman las pantallas. |
| `cem_evaluar_insignias(persona)` | Otorga las insignias cuyo criterio ya cumple. |
| `cem_solicitar_cambio_inscripcion(...)` | Congelamiento o retiro pedidos por el estudiante. |
| `cem_resolver_solicitud_inscripcion(...)` | La respuesta del equipo. Rechazar exige explicación. |
| `cem_actualizar_mi_perfil(datos)` | Guarda el perfil. Nombre y documento pasan por aprobación **sólo si ya hay certificados emitidos** con los datos viejos. |
| `cem_resolver_solicitud_perfil(...)` | La respuesta del equipo a eso. |

### Certificados

Hay dos familias y conviene no confundirlas:

- **`cem_*`** — los certificados del portal, atados a una inscripción real.
  `cem_issue_certificate(...)` comprueba los requisitos y sólo emite sin ellos si
  se le pasa un motivo de excepción, que queda registrado.
  `cem_update_certificate(...)` corrige uno emitido, dejando rastro.
  `cem_verify_certificate(codigo)` es **pública**: la usa el QR.
- **`cert_*`** — el generador por lotes, que trabaja desde una planilla.
  `list_cert_templates_light`, `get_cert_template`, `save_cert_template`,
  `delete_cert_template`, `issue_certificate`, `revoke_certificate`,
  `replace_cert_certificate`, `regenerate_certificate`,
  `delete_all_cert_certificates`, `get_cert_settings`, `save_cert_settings`.
  `get_certificado_publico(id)` es **pública**: la usa el QR de esta familia.

> **Agujero cerrado (agosto de 2026).** Toda la familia `cert_*` estaba en
> `security definer` y con permiso de ejecución para `anon`, y ninguna
> comprobaba quién llamaba. Con la sola clave pública —la que va escrita en el
> HTML, como corresponde— cualquiera podía leer los datos personales de todos
> los certificados emitidos, emitir uno nuevo verificable a nombre de quien
> quisiera, revocar el de un graduado real o borrarlos todos de un golpe con
> `delete_all_cert_certificates()`. Existía `is_cert_admin()`, pero no la
> llamaba ninguna. Se comprobó contra el servidor antes de tocar nada: la
> llamada anónima devolvía la lista completa, con nombres y cédulas.
>
> Ahora todas pasan por `cert_exigir_gestor()` y ninguna acepta a `anon`. La
> consecuencia visible: **`certificados/generar.html` pide entrar**. Es la misma
> herramienta que `plataforma/admin/certificados-plantillas.html` y comparte la
> sesión con el portal, así que quien ya entró allí la abre directo.

### Gobierno y avisos

| Función | Qué decide |
|---|---|
| `cem_notificar(...)` | Crea un aviso y, si se le pide, lo encola para correo. Sólo el servidor. |
| `cem_mis_notificaciones(limite)` | Los avisos de quien pregunta. |
| `cem_marcar_notificaciones_leidas()` | Los da por leídos. |
| `cem_revisar_cuotas(dias)` | Avisa de las cuotas por vencer y marca las vencidas. **La corre la tarea diaria.** |
| `cem_admin_metrics()` | Los números del tablero. |
| `cem_revisar_politicas()` | Radiografía de las políticas de acceso de todas las tablas. Sólo admin, superadmin o auditor. Se ve en *Seguridad de mi cuenta*. |
| `cem_rate_limit_consumir(...)` | El freno por intentos. Sólo el servidor: la usa el webhook del banco. |
| `cem_rotar_clave_webhook(horas)` | Cambia la ApiKey del webhook dejando un período de gracia en el que valen la vieja y la nueva, para no cortarle el paso al banco en mitad del cambio. |

### Disparadores

Corren solos al escribir en una tabla. No se llaman a mano:

`cem_handle_new_user` (crea el perfil al nacer la cuenta),
`cem_bloquear_cambio_rol_no_admin` (impide que alguien se ascienda, y que un
administrador se degrade a sí mismo dejando el sistema sin administradores),
`cem_audit_perfil_sensible` (deja rastro de los cambios delicados),
`cem_notificar_pago`, `cem_notificar_certificado`, `cem_notificar_apelacion`,
`cem_notificar_ticket`.

---

## 2. Funciones de borde

Viven en `supabase/functions/`. Corren en Deno, fuera de la base, porque
necesitan salir a internet.

| Función | Para qué | ¿Pide sesión? |
|---|---|---|
| `cem-bancaribe` | El intermediario con las APIs del banco: consultar un extracto, verificar una referencia, ver el estado de la integración. Guarda las credenciales del banco del lado del servidor y nunca las manda al navegador. Distingue lectura (`ROLES_CONSULTA`) de administración (`ROLES_ADMIN`). | **Sí** |
| `cem-bancaribe-notificacion` | El webhook que llama **el banco** cuando entra un pago. Por eso es la única sin sesión: el banco no tiene cuenta. Se protege con una ApiKey propia, un freno por intentos y un período de gracia al rotar la clave. | **No** — a propósito |
| `cem-correo` | Vacía la cola `cem_correo_cola` mandando los correos por Resend. Si no está configurada, no falla: deja los correos en la cola y lo dice. | **Sí** |
| `cem-importar-estudiantes` | Alta masiva desde una planilla. Es idempotente: correr dos veces el mismo archivo no duplica a nadie. | **Sí** |
| `cem-bancaribe-probe` | Herramienta de diagnóstico de la conexión con el banco. | **Sí** |
| `cem-youtube-oauth-exchange`, `cem-youtube-upload-token` | La conexión con YouTube para las grabaciones. | **Sí** |

Las credenciales del banco (`consumer_key`, `consumer_secret`, los *hashes* por
servicio, `extracto_api_key`, `notificacion_api_key`) viven **sólo** en la tabla
`cem_integraciones`, a la que únicamente llega el rol de servicio. No están en
este repositorio ni llegan nunca al navegador.

---

## 3. La tarea programada

Una sola, con `pg_cron`:

```
cem_revisar_cuotas_diario   ·   0 11 * * *   ·   select public.cem_revisar_cuotas(3);
```

Todos los días a las 11:00 UTC avisa de las cuotas que vencen en los próximos 3
días y marca como vencidas las que ya pasaron. Es lo que hace que un estudiante
se entere antes y no después.

Para verla o cambiarla:

```sql
select jobid, jobname, schedule, command, active from cron.job;
```

---

## Cuando agregues una función nueva

1. `security definer` y `set search_path = public` (sin eso, alguien puede
   colarte otra tabla con el mismo nombre).
2. Comprobar quién llama **dentro** de la función, con las funciones de rol de
   arriba. No confíes en que la pantalla escondió el botón.
3. `revoke all … from public, anon` y después `grant execute … to authenticated`.
   Recuerda que revocar sólo de `anon` no sirve de nada.
4. Ponle un `comment on function` diciendo qué decide y quién puede llamarla.
5. Si es pública a propósito (como la verificación del QR), déjalo escrito ahí
   mismo, para que quien la lea dentro de un año sepa que no es un descuido.
