# Diplomados por módulos, con su profesor y su certificado

Un diplomado de Marketing no es un bloque. Dentro hay Fotografía y vídeo, IA, Ads…
Cada uno lo da alguien distinto y cada uno vale un certificado propio — que es
lo que la persona va a enseñar cuando busque trabajo *de eso*.

Los módulos ya existían como forma de ordenar las lecciones. Lo que faltaba era
que fueran una **unidad con nombre propio**: quién la da, cuántas horas son, y si
al terminarla se emite un título.

---

## Cómo se monta

En **Contenidos**, al editar un módulo hay tres campos nuevos:

| Campo | Para qué |
|---|---|
| **Quién da este módulo** | El profesor. Sale en los datos del certificado. |
| **Horas** | Salen impresas en el diploma. |
| **Este módulo da su propio certificado** | Lo enciende. Apagado, el módulo sólo ordena lecciones, como siempre. |
| **Cómo se llama en el diploma** | Sólo aparece si certifica. Vacío = el título del módulo. |

## Cómo se emite

**Solo, al terminarlo.** Enganchado a `cem_recalc_progress`, que ya se ejecuta cada
vez que alguien marca una lección. En cuanto el módulo llega al 100 %, sale el
título sin que nadie tenga que acordarse.

**A mano, si no lo terminó.** En la ficha del estudiante → pestaña *Certificados* →
*Títulos por módulo*. Pide el motivo y **queda asentado con riesgo alto**.

> Eso no es burocracia. Un título emitido sin cumplir es la decisión de una
> persona concreta, y dentro de dos años alguien va a querer saber quién y por
> qué. El asiento distingue `certificado_modulo_emitido` (riesgo medio, el motor)
> de `certificado_modulo_emitido_excepcion` (riesgo alto, con nombre y motivo).

## Decisiones que no son obvias

### Lo ya guardado no cambia

`certifica` nace en `false`. Los cursos que hay hoy siguen dando un solo
certificado al final, exactamente como antes. Quien quiera partir uno en títulos
lo enciende módulo a módulo.

### El avance del módulo cuenta lecciones, no evaluaciones

Las evaluaciones cuelgan del **curso entero**, no del módulo. Meterlas en el
cálculo sería inventarse una relación que no existe en los datos. Así que
`cem_modulo_avance` dice lo que sabe: qué parte del material ha visto.

Si algún día las evaluaciones se atan a un módulo, esto hay que revisarlo.

### Un módulo, un certificado — garantizado por índice

```sql
create unique index cem_certificates_un_modulo_por_inscripcion
  on cem_certificates (enrollment_id, module_id)
  where module_id is not null and anulado_en is null;
```

Sin esto, dos pulsaciones del botón dejan a la misma persona con dos diplomas del
mismo módulo. Y como `cem_recalc_progress` corre en cada lección marcada, el
riesgo no era teórico: sin el índice habría emitido uno por cada clic a partir
del 100 %.

Además, `cem_emitir_certificado_modulo` **devuelve el que ya hay** en vez de
reventar: quien pulsa dos veces quiere el certificado, no un error.

### Emitir no puede llevarse por delante el avance

Tanto `cem_certificar_modulos_terminados` como su llamada desde
`cem_recalc_progress` van dentro de `begin … exception when others then null`.
Misma razón que las insignias: **el avance ya quedó guardado**, y si emitir
fallara y se levantara la excepción, se perdería que la lección estaba vista.

Un módulo que falle tampoco se lleva por delante a los otros del mismo curso.

### Quién puede ver qué

`cem_modulos_de_la_inscripcion` filtra por
`cem_is_staff() or cem_puede_cobranza() or e.profile_id = auth.uid()`.

Comprobado: **otro alumno recibe 0 filas** al pedir los módulos de una
inscripción ajena. Importa recordarlo cuando llegue el bot: cualquier cosa que
consulte por cuenta de un estudiante tiene que pasar por funciones así, no
saltárselas con la llave de servicio.

## Lo que arreglé por el camino

- `round(100.0 * hechas, 2) / total` redondeaba **antes** de dividir, así que no
  redondeaba nada y el avance salía con veinte decimales.
- En la ficha del estudiante, recargar tras emitir te devolvía siempre a
  *Resumen*. Ahora se queda en la pestaña donde estabas.
- `avisar()` se usaba sin importarla en `admin/estudiante.html` — el mismo fallo
  que había en Contactos. Un barrido buscando ese patrón en toda la plataforma
  dio 7 avisos más, **todos falsos** (dos definen su propia función local, dos
  eran texto de una etiqueta seguido de paréntesis, dos aparecían en comentarios
  explicando por qué NO se llama a `mount()`, y uno estaba importado en una línea
  aparte). No dejo el barrido como comprobación fija por lo mismo de siempre: una
  alarma que miente es peor que no tenerla.

## Pendiente, a sabiendas

- El diploma de un módulo **no imprime todavía el profesor ni las horas** en el
  dibujo: los datos se guardan en `cem_certificates.datos` pero
  `assets/certificado.js` sólo pinta `programa` y `horas`. Falta añadir la firma
  del profesor del módulo.
- No hay pantalla que liste «todos los títulos de módulo emitidos» de un vistazo;
  se ven por estudiante.
