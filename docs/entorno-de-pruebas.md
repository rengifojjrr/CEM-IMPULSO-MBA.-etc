# El entorno de pruebas

Las pruebas de `pruebas/` entran con cuentas de verdad y trabajan contra la base
de verdad. Eso las hace valiosas —encuentran lo que un simulacro no— y a la vez
frágiles: si los datos de partida cambian, fallan por el estado de la base y no
porque el programa se haya roto.

Este documento explica cómo se deja el entorno en un punto conocido.

## La herramienta

```bash
CEM_SERVICE_KEY="…" node herramientas/entorno-de-pruebas.mjs --ver
CEM_SERVICE_KEY="…" node herramientas/entorno-de-pruebas.mjs --sembrar
CEM_SERVICE_KEY="…" node herramientas/entorno-de-pruebas.mjs --limpiar-rastros
```

No tiene dependencias: es Node pelado. No hay que instalar nada.

### `--ver`

No toca nada. Dice si las seis cuentas existen y con qué rol, y cuenta cuántos
programas, cohortes, inscripciones, cuotas, pagos y certificados hay. Es lo
primero que conviene correr cuando una prueba falla y no se entiende por qué.

### `--sembrar`

Crea lo que falte y deja lo que ya está. **Nunca borra nada.** Correrlo dos
veces seguidas no duplica nada: cada cosa se busca antes de crearla.

Deja en pie:

- las seis cuentas (`admin@`, `coordinador@`, `cobranza@`, `profesor@`,
  `estudiante@` y `auditor@` en `cem.demo`), con la contraseña de `CEM_PASS`;
- el programa `DEMO-MBA-001` con tres módulos y sus lecciones;
- la cohorte `DEMO-C1`, con el profesor asignado y dos clases (una pasada y una
  próxima);
- la estudiante inscrita, con cuatro cuotas: la primera vencida, la segunda al
  caer y dos por delante — así hay algo que cobrar, algo que reportar y algo que
  todavía no toca;
- una evaluación abierta;
- la tasa del día.

### `--limpiar-rastros`

Borra lo que dejan las propias pruebas al correr, y nada más:

| Qué borra | Cómo lo reconoce |
|---|---|
| Los pagos de prueba | la referencia empieza por `PRUEBA-` |
| Los frenos por intentos | la clave empieza por `prueba:` |
| Las solicitudes de congelamiento | el motivo es el que escribe la prueba |
| Las evaluaciones «Prueba automática» | por ese nombre exacto |
| Los avisos que generaron | por ese mismo texto |

Además devuelve a *pendiente* las cuotas que esos pagos hubieran abonado, para
que la próxima corrida encuentre la misma situación de partida.

**Lo que no toca:** ningún dato que no haya creado una prueba. Si en la base hay
cursos de haber probado el formulario a mano —a nosotros nos quedaron un
`skfjnskflj` y un `TEST-EX`— esta herramienta no los borra. Distinguir un curso
de prueba de uno real no es cosa de un guion: eso se mira y se decide.

## Sobre la clave de servicio

Hace falta `CEM_SERVICE_KEY` porque crear cuentas no lo puede hacer el
navegador. Se saca del panel de Supabase (Project Settings → API → `service_role`).

**Va siempre por línea de comandos o variable de entorno y nunca escrita en un
archivo de este repositorio.** Esa clave se salta todas las políticas de acceso:
quien la tenga puede leer y escribir cualquier cosa, incluidas las credenciales
del banco. Si alguna vez se filtra, hay que rotarla desde el panel el mismo día.

## Un aviso que vale la pena leer

Hoy hay **un solo proyecto de Supabase**: el mismo que usa la plataforma de
verdad. O sea que sembrar y limpiar escriben sobre datos reales. Por eso:

- `--sembrar` sólo crea, nunca borra;
- `--limpiar-rastros` sólo borra lo que reconoce como propio de una prueba;
- las pruebas usan referencias con marca de tiempo (`PRUEBA-1786…`), que no
  pueden coincidir con una referencia bancaria de verdad.

Lo correcto sería un segundo proyecto de Supabase sólo para pruebas, con los
mismos esquemas y datos de mentira. Mientras no exista, esas tres reglas son lo
que evita un accidente.
