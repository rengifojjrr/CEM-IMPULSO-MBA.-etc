# Las cuarenta, hechas

Qué se construyó para cada una de las mejoras de
[`40-mejoras-por-rol.md`](40-mejoras-por-rol.md), y con qué prueba se comprueba
que sigue funcionando.

Se agruparon por **lo que tocan**, no por rol: ocho tandas, cada una con su
migración y su caso de prueba. Nueve de las cuarenta ya estaban hechas antes de
esta ronda y se marcan como tales — comprobarlo era parte del trabajo, y
rehacerlas habría sido peor que no tocarlas.

Para correr una prueba concreta:

```
cd pruebas && npm test -- <nombre>
```

---

## Estudiante

| # | Mejora | Qué se hizo | Prueba |
|---|---|---|---|
| 1 | Preguntar sobre la lección | `cem_dudas` + `cem_duda_respuestas`, hilo por lección con el minuto del vídeo, visible para toda la cohorte | `leccion` |
| 2 | Bienvenida al entrar | Tarjeta que existe un solo día y desaparece al ver la primera lección | `acompanar` |
| 3 | Buscar dentro del curso | Buscador sobre el temario ya cargado, con filtros de «sin ver» y «para después» | `leccion` |
| 4 | Seguir por donde iba | Se guarda el segundo real del reproductor y se ofrece «continuar desde 20:14» | `leccion` |
| 5 | Recordatorio antes de vencer | Ya existía; ahora es el primer peldaño de una escalera de cinco | `—` (motor de avisos) |
| 6 | Cuánto falta para el certificado | Una frase en cada tarjeta de curso: «te falta el 40% del contenido y 2 evaluaciones» | `acompanar` |
| 7 | Material sin conexión | Los adjuntos de cada lección llegan al aula desde `cem_media`, y el temario se imprime | `leccion` |
| 8 | Apuntes propios | Ya existían; se les añadió poder bajarlos todos en un archivo | `leccion` |
| 9 | «Para después» | Marca por lección, visible en el índice | `leccion` |
| 10 | Ritmo contra la cohorte | `cem_mi_ritmo`, con **mediana** y silencio si el grupo es de menos de cuatro | `acompanar` |
| 11 | Cambiar de plan de pago | Se pide desde Mis pagos con la cuenta hecha delante; al aprobarlo se reparte sólo lo que queda | `acompanar` |
| 12 | Ver el temario antes de que abra | Ya existía en la pantalla de espera y en la tarjeta del curso | `acompanar` |
| 13 | Avisar cuando responden | `cem_responder_duda` avisa a quien preguntó | `leccion` |

## Docente

| # | Mejora | Qué se hizo | Prueba |
|---|---|---|---|
| 14 | Escribirle a un estudiante | `cem_mensaje_a_estudiante`: aviso + correo, registrado, y sólo a los suyos | `docente-herramientas` |
| 15 | Cola de corrección priorizada | `cem_cola_de_correccion`: primero lo que bloquea un certificado, después lo que lleva más esperando | `docente-herramientas` |
| 16 | Avisar de una clase en vivo | Mover la hora y avisar a la cohorte desde su propio panel | `docente-herramientas` |
| 17 | Riesgo con el porqué | **Ya estaba**: `cem_resumen_grupo` distingue no entrar, no entregar y suspender | `docente` |
| 18 | Corregir con la rúbrica | `cem_assessments.rubrica`, criterios al lado del trabajo, puntos que se suman solos | `docente-herramientas` |
| 19 | Comentarios frecuentes | `cem_comentarios_guardados`, ordenados por uso | `docente-herramientas` |
| 20 | Ver el aula como un estudiante | Vista previa de sólo lectura: ni progreso, ni apuntes, ni registro de reproducción | `docente-herramientas` |

## Coordinación y administración

| # | Mejora | Qué se hizo | Prueba |
|---|---|---|---|
| 21 | El menú de 39 entradas | Agrupado por lo que se hace: Matricular, Cobrar, Dar clase, Evaluar, Certificar | `navegacion` |
| 22 | El buscador de arriba | `cem_buscar`: personas, cursos y cohortes, con teclado y salto al resultado | `navegacion` |
| 23 | Ver como | `cem_ver_como`: foto de sólo lectura de lo que ve esa persona, asentada en auditoría | `navegacion` |
| 24 | Qué hay que hacer hoy | `cem_pendientes_de_hoy` arriba del todo; las cifras del negocio, debajo | `navegacion` |
| 25 | Matricular a varios | **Ya estaba**: `cem-importar-estudiantes`, desde la pantalla de Estudiantes | `registro` |
| 26 | Deshacer | Extendido a notas, calificaciones y matrículas | `operacion` |
| 27 | Plantillas de comunicación | `cem_plantillas_mensaje`, cinco de arranque, ordenadas por uso | `operacion` |
| 28 | Expediente en una pantalla | **Ya estaba**: `cem_expediente` en la ficha del estudiante | `expediente` |
| 29 | Sacar las tablas a Excel | Genérico: cualquier tabla con encabezado gana su botón, y exporta con los filtros puestos | `operacion` |
| 30 | El móvil | Arreglado de raíz: se vigilan las tablas que nacen después de montar, el umbral baja a tres columnas y las celdas apiladas se parten | `operacion` |

## Cobranza

| # | Mejora | Qué se hizo | Prueba |
|---|---|---|---|
| 31 | Recordatorios escalonados | Cinco peldaños (−3, el día, +3, +15, +30) y aviso a cobranza a los 60 | `—` (motor de avisos) |
| 32 | Conciliar el extracto | `cem_conciliar_sugerencias` propone y una persona confirma; y se puede pegar el extracto a mano | `cobranza` |
| 33 | Por qué se rechazó un pago | El motivo se lee en la lista, sin abrir cada pago | `cobranza` |
| 34 | Mora larga | A los 60 días deja de ser un aviso al estudiante y pasa a ser trabajo de quien cobra | `—` (motor de avisos) |
| 35 | Registrar un pago por alguien | **Ya estaba**: desde la ficha del estudiante y desde Inscripciones | `dinero` |

## Auditoría y dirección

| # | Mejora | Qué se hizo | Prueba |
|---|---|---|---|
| 36 | Auditoría legible | Filtro por tipo de acción, los enlaces del gráfico ya filtran, y las alertas arriba | `direccion` |
| 37 | Lo que no debería pasar | `cem_alertas_gobierno`: pago aprobado y anulado el mismo día, certificado con excepción, cuenta de cobro cambiada, rol repartido | `direccion` |
| 38 | Coste por canal | `cem_por_canal`, atribuido al primer contacto | `direccion` |
| 39 | Por dónde se cae la gente | `cem_embudo`, sobre las inscripciones, donde cada escalón sí contiene al siguiente | `direccion` |
| 40 | Informe mensual solo | Se manda el día 1 a las 8:00 UTC | `—` (motor de avisos) |

---

## Lo que hubo que decidir por el camino

**El embudo no podía ser el que pedía el enunciado.** «Del catálogo a la
inscripción, de ahí al pago» suena bien, pero con datos reales daba 1 → 4 → 10:
la mayoría se inscribe sin dejar antes sus datos, así que los escalones no se
contenían y el dibujo eran barras creciendo hacia abajo. Se construyó sobre las
inscripciones, que sí son una población encajable, y los contactos quedaron como
contexto al pie. Del catálogo a la inscripción no se puede medir sin contar
visitas, y no se cuentan.

**El ritmo se compara con la mediana, no con el promedio.** En un grupo donde
tres personas abandonaron, el promedio dice que todos van fatal y el dato deja
de servir. Y calla si hay menos de tres compañeros: ahí «la mayoría va por la 8»
es señalar a alguien con el dedo.

**La conciliación no aprueba sola.** Dos alumnos pueden pagar lo mismo el mismo
día, y aprobar un pago es mover dinero. Propone, dice por qué con palabras, y
una persona confirma.

**Cobranza entra al banco, pero no a la llave.** Conciliar referencias y tener
la clave con la que el banco se identifica no son el mismo permiso.

**El menú se reagrupó sin perder nada.** La prueba comprueba que las 34 entradas
siguen estando y que ninguna quedó en dos cajones.

## Lo que sigue siendo de la casa

Tres cosas no dependen del código:

1. **Abrir la cuenta de Stripe** y pegar las dos claves en Operación → Cobros
   con tarjeta.
2. **Rellenar los destinos** de Zelle, PayPal, bancos y cripto en Cobrar →
   Formas de pago. Los métodos sin destino no se le enseñan a nadie.
3. **El proveedor de correo (Resend)**, en Hablar con la gente → Envío de
   correo. Mientras esté en pausa, los avisos se acumulan sin perderse pero no
   salen — y la escalera de cobro es justamente lo que más depende de que
   salgan.
