# El documento de identidad

El dato más sensible que guarda esta plataforma. Este archivo existe para que,
el día que alguien pregunte «¿dónde están las cédulas de tus estudiantes y quién
las ha visto?», haya una respuesta escrita y no una reconstrucción.

## Qué se decidió, y quién lo decidió

Se planteó al dueño con tres opciones: verificar y borrar, guardar mientras dure
la inscripción, o guardar siempre. **Eligió guardar siempre, como archivo.**

Se le dijo entonces, con esas palabras, que era la opción que más riesgo le crea:
si alguien entra a la base, se lleva los documentos de todos. La decisión es
suya y está tomada con esa información delante.

Lo que **no** es opinable, y por eso no se preguntó, es cómo se custodian.

## Dónde están

En el depósito **`cem-identidad`**, que es privado, con límite de 8 MB por
archivo y sólo imágenes o PDF.

No en `cem-assets`. Ese es el depósito de las fotos de los cursos y **es
público**: cualquiera con la dirección lee lo que haya dentro, sin cuenta y sin
dejar rastro. Un documento de identidad ahí sería el fallo entero, y no daría
ningún síntoma — se sube, se ve, funciona.

Cada persona escribe dentro de una carpeta con su propio identificador
(`<uuid>/frente-….jpg`), y la política del depósito no deja escribir fuera de
ella. Sin eso, cualquiera con cuenta podría pisar el documento de otro.

## Qué se guarda en la base, y qué no

`cem_identidad` guarda **la ruta**, no una dirección. En un depósito privado una
dirección o no funciona o caduca; la ruta es lo que sirve para pedir un enlace
firmado en el momento, a quien tenga derecho y por unos minutos.

| Columna | Para qué |
|---|---|
| `frente_ruta`, `dorso_ruta` | dónde está cada cara dentro del depósito |
| `estado` | `pendiente` · `aprobado` · `rechazado` |
| `revisado_por`, `revisado_en` | quién lo resolvió y cuándo |
| `motivo` | por qué se rechazó — obligatorio al rechazar |

## Quién puede verlo

- **La persona**, lo suyo y sólo lo suyo.
- **El equipo** (`admin`, `superadmin`), a través de
  `cem_identidad_para_revisar(profile_id)`.
- **Nadie más.** Ni un profesor, ni cobranza, ni el auditor.

La función no es un adorno: **apunta la consulta en `cem_audit_events`** con
riesgo alto antes de devolver nada. Guardar documentos sin poder decir quién los
ha abierto es lo que convierte una decisión defendible en una que no lo es.

`cem_identidad_resolver(...)` aprueba o rechaza, y **exige un motivo al
rechazar**. Sin el motivo delante, lo normal es que la persona vuelva a subir
exactamente lo mismo.

## Dos cosas que no se pueden hacer, y por qué

**Nadie se aprueba a sí mismo.** La política deja a la persona corregir su
propia fila —tiene que poder volver a subir una foto que salió movida—, pero un
disparador devuelve el estado a `pendiente` en cuanto la toca alguien que no es
del equipo. Sin eso la revisión sería decorativa: bastaría con escribir
`aprobado` desde la consola del navegador.

**El nombre del certificado no se cambia por la puerta de atrás.** Esto apareció
construyendo lo anterior. `cem_actualizar_mi_perfil` manda el cambio de nombre a
aprobación cuando ya hay certificados emitidos, pero la política
`cem_profiles_update_own` deja escribir en la fila propia — y las políticas de
Postgres son **por fila, no por columna**. Bastaba con llamar a la tabla
directamente en vez de a la función para saltarse la aprobación entera.

Un estudiante sólo podía tocar lo suyo, así que no era grave. Pero dejaba sin
efecto justo el control que protege un documento firmado. Se cerró donde tenía
que cerrarse: en la tabla, con un disparador.

## Qué pasa si no lo sube

**Entra igual.** Se decidió así: alguien que pagó a medianoche no puede quedarse
fuera esperando a que mañana alguien revise una foto. El documento se pide para
poder **emitir el certificado**, y mientras falta se avisa en el panel — sin
bloquear nada.

El aviso desaparece solo en cuanto está completo. Un aviso que sigue ahí después
de resolverlo enseña a ignorar todos los avisos.

## Cómo se comprueba que sigue cerrado

`pruebas/casos/identidad.mjs`, 15 comprobaciones. Las que importan:

- Con el identificador de otra persona **delante**, un estudiante choca contra
  la tabla, contra la función de revisión, contra la de aprobar y contra la
  carpeta del depósito.
- Escribir `aprobado` sobre el propio documento no cuela.
- Con certificados emitidos, el nombre no se cambia llamando a la tabla.
- El equipo sí puede abrirlo, **y queda apuntado**.

> La primera versión de esta prueba buscaba el identificador ajeno desde la
> pestaña del estudiante, no lo encontraba —porque un estudiante no puede ni
> listar los perfiles de los demás— y **se saltaba las tres comprobaciones que
> importaban, saliendo en verde**. Ahora el identificador se toma desde la
> sesión del equipo y se le pone delante, que es la situación real de alguien
> que lo copie de una dirección.

## Lo que queda sin resolver

- **No hay borrado.** Se eligió conservar siempre, así que no existe una
  pantalla para eliminar un documento. Si algún día alguien lo pide —y en varios
  países puede pedirlo—, hay que construirla.
- **El equipo puede saltarse el registro.** La política del depósito deja a
  `admin` leer los archivos directamente, sin pasar por la función que apunta.
  El registro cubre el camino normal, no a alguien del equipo decidido a
  evitarlo.
