# El reparto a los socios

Quién puso capital, qué porcentaje le toca de cada línea y cuánto se le debe
hoy. Pantalla: **Gobierno → Inversionistas**.

Este módulo se rompe distinto a los demás. Cuando falla no sale un error: sale
un socio convencido de que le pagaron de menos. Y esa discusión no se gana
explicando, se gana enseñando de dónde sale cada número.

---

## 1. La regla que manda sobre todas

**El reparto se calcula. Nunca se guarda.**

No existe ninguna columna «ganancia de fulano». Cada vez que se abre la
pantalla, `cem_reparto()` vuelve a sumar los pagos confirmados y a restar los
gastos, desde cero.

Por qué:

- Los datos de atrás cambian. Se anula un pago, aparece un gasto de hace dos
  semanas, se corrige una fecha. Una cifra congelada quedaría mintiendo y nadie
  se enteraría.
- Cualquier número tiene que poder abrirse hasta los pagos que lo componen. Un
  socio acepta una cifra que puede auditar; no acepta una que sale de una
  columna.

Lo único que **sí** se guarda es lo que ya se pagó. Eso es un hecho.

## 2. Las cinco tablas

| Tabla | Qué es |
|---|---|
| `cem_inversores` | Los socios. El color no es adorno: con seis en pantalla, es cómo se lee de un vistazo de quién es cada cifra. |
| `cem_rondas` | Un período con **sus propias** reglas de reparto. |
| `cem_ronda_partes` | Una fila por socio × línea × ronda. La que hace todo el trabajo. |
| `cem_liquidaciones` | Cada pago a cuenta. Lo único que se guarda de verdad. |
| `cem_aportes` | El capital que entra, distinguiendo de dónde salió. |

Y dos columnas nuevas en `cem_gastos`: `linea` y `reparto`.

## 3. Las rondas no se editan: se cierran

Cuando cambian los porcentajes o entra un socio nuevo, **no se tocan los
porcentajes viejos**. Se cierra la ronda y se abre otra.

Editar el pasado reescribiría lo que ya se le pagó a alguien.

Dos cosas lo sostienen sin depender de que nadie se acuerde:

- No hay columna `activa`. Activa es `hasta is null`. Guardar las dos cosas es
  invitar a que se contradigan, y de esa contradicción sale un número mal.
- Una restricción de exclusión impide que dos rondas se solapen. Solapadas, las
  mismas ventas se cuentan dos veces y el reparto sale al doble. Al abrir una
  ronda nueva, `cem_ronda_guardar` cierra la anterior el día anterior.

Ojo con una consecuencia que sorprende: una ronda sin cerrar se extiende hasta
el infinito por arriba, así que no se puede abrir otra después sin cerrarla.
Eso es lo correcto, y es también por qué el cierre automático existe.

## 4. Cómo sale la ganancia

Por ronda y **por cada línea de negocio por separado**:

```
ganancia_de_la_linea = ingresos − gastos
```

La línea de negocio aquí es `cem_courses.tipo`: masterclass, curso, programa,
diplomado, maestría.

**No hay término de coste, y no es un olvido.** En un negocio de inventario se
resta lo que costó traer las unidades vendidas. Una escuela no tiene eso:
vender un cupo más de un curso ya grabado no cuesta nada. Lo que sí cuesta —los
honorarios del profesor de un diplomado concreto— es un **gasto con su línea
puesta**, y por ahí entra. El término no se inventó: se mudó de sitio.

Y después, por socio:

```
le_toca = ganancia_de_la_linea × su_porcentaje / 100
le_debo = le_toca − lo_ya_liquidado
```

### Cuatro reglas que parecen detalles

1. **Sólo pagos confirmados.** Un pago reportado y sin verificar no es ganancia
   de nadie. Repartir sobre lo reportado es prometer plata que no entró.

2. **El nombre de la línea se compara exacto.** Agrupar «lo parecido» —los
   programas con los cursos, por ejemplo— le acredita a unos socios lo que
   generaron otros, y no lo nota nadie hasta que uno saca la cuenta a mano.
   Agrupar es aceptable en un gráfico; jamás para repartir dinero.

3. **El último día cuenta entero.** `cem_payments.fecha` lleva hora. El rango es
   `fecha >= desde and fecha < hasta + 1`, no `<= hasta`: eso último cortaría a
   medianoche y perdería en silencio los pagos de la última jornada.

4. **`le_debo` nunca es negativo.** Lo pagado de más sale como `a_favor`, en su
   propio campo, y **jamás** restándose de otra línea. Cruzar líneas es
   exactamente lo que hace imposible auditar.

El redondeo va al final, no en cada paso. Lo que la suma de las partes no
alcance del total se ve en la columna **«se queda la casa»**: ahí van tanto el
porcentaje que nadie tiene asignado como los céntimos que el redondeo deja
sueltos. No se esconde.

## 5. Los gastos: tres estados, y el tercero es el importante

| `linea` | `reparto` | Qué pasa |
|---|---|---|
| puesta | vacío | El gasto es entero de esa línea. |
| vacía | puesto | Compartido de verdad —el alquiler, la publicidad general—. Se divide según **ese** mapa, que tiene que sumar 100. |
| vacía | vacío | **Sin clasificar.** No se reparte a nadie y sale en un informe aparte. |

El tercer caso es la decisión de diseño, no un hueco: adivinar aquí es cobrarle
a un socio un gasto que no era suyo. `cem_reparto_sin_clasificar()` los lista
para que una persona los asigne, y la pantalla los pone arriba del todo.

### Los gastos también van en euros

`cem_gastos` guardaba el importe sólo en la moneda de la cartera. Restar 2 000
bolívares de 2 100 euros deja la ganancia en 100 y a los socios sin cobrar, por
un factor de novecientos. Ahora un disparador rellena `monto_base` con la tasa
del día, congelada, igual que en los pagos.

Un gasto en dólares **no** se pasa a la par. La paridad es una concesión de
precio que se le hace al estudiante al cobrar, no una verdad contable: si la
casa giró cien dólares, salieron cien dólares. Por eso `cem_a_base()` convierte
por moneda y no por método de pago.

## 6. Capital nuevo frente a reinversión

- **Capital nuevo**: alguien puso dinero de su bolsillo. Aumenta lo aportado y
  su derecho a participar.
- **Reinversión**: se pagó con ganancias del propio negocio. **No** aumenta el
  capital de nadie.

Tratarlas igual infla el capital aportado mes a mes hasta mostrar que los socios
pusieron el triple de lo que pusieron — y sobre ese número inflado se discuten
porcentajes.

La regla no se le deja a la pantalla. Una restricción de la tabla obliga a que
una reinversión **no tenga dueño**, así que acreditársela a un socio es
imposible aunque se intente desde la consola.

En el balance van siempre por separado. No se suman nunca.

## 7. Lo que ya se pagó

- Se guarda con su fecha, su línea y **de qué cartera salió**. Un pago que no
  descuenta de ninguna cuenta infla los saldos del negocio; si se deja sin
  decir, sale en la lista de movimientos sin clasificar.
- Si se pagó en otra moneda, con la tasa de ese día.
- Se agrupa por `lote`. El consejo habitual es agrupar el historial por
  inversor + fecha + nota, pero eso es adivinar: dos pagos distintos el mismo
  día con la misma nota se fundirían en uno. Un identificador de lote es exacto
  y cuesta una columna.
- **Se borra en falso.** El saldo vuelve a subir solo —esa es la ventaja de
  calcular en vez de guardar— y queda el rastro de que alguien lo cargó mal, que
  en dinero hace falta.

### El doble camino

Hay dos formas de registrar el mismo hecho: liquidar a un socio, y cuadrar a
mano el saldo de una cartera. Alguien va a usar las dos para el mismo pago y el
código no puede saber que se refieren a lo mismo.

`cem_liquidacion_guardar` avisa cuando encuentra un ajuste de cartera por un
importe parecido en fechas parecidas. Es un aviso, no un bloqueo: la persona
sabe lo que el código no puede saber.

## 8. Quién lo ve

| | Ver | Escribir |
|---|---|---|
| admin, superadmin | sí | sí |
| auditor | sí | no |
| coordinador, cobranza, profesor, estudiante | no | no |

Qué porcentaje tiene cada socio no es información de operación. Quien cobra y
quien coordina no la necesitan para su trabajo, y verla les cambia la relación
con la casa. El auditor sí entra, porque auditar los libros sin ver el reparto
es auditar la mitad.

Si algún día un socio tiene que ver **lo suyo** desde la plataforma, eso es otra
política y otra pantalla. No se resuelve abriendo ésta.

## 9. Las funciones

| Función | Para qué |
|---|---|
| `cem_reparto(p_ronda)` | El desglose completo, no los totales: la pantalla tiene que poder enseñar de dónde sale cada cifra sin volver a preguntar. |
| `cem_reparto_calc(p_ronda)` | El cálculo sin la guardia, para poder comprobarlo. No se concede a nadie. |
| `cem_ronda_guardar(...)` | Abre o edita una ronda con sus partes, cerrando la anterior. |
| `cem_liquidacion_guardar(pagos, fecha, nota)` | Registra un pago a varios socios de una vez y devuelve los avisos. |
| `cem_liquidacion_eliminar(id)` | Borrado en falso. |
| `cem_liquidaciones_listar(limite)` | El historial agrupado por evento. |
| `cem_aporte_guardar(...)` / `cem_aporte_eliminar(id)` | El capital que entra. |
| `cem_reparto_sin_clasificar()` | Lo que nadie asignó todavía. |
| `cem_gasto_clasificar(id, linea, reparto)` | Ponerle línea a un gasto ya cargado. |
| `cem_a_base(monto, moneda, fecha)` | Pasa un importe a euros con la tasa real, y dice de qué día era esa tasa. |

## 10. Lo que la prueba comprueba

`pruebas/casos/inversionistas.mjs`, 40 comprobaciones. Dos decisiones sobre
cómo se prueba, que son la mitad del trabajo:

- **No se inventan pagos.** Insertar un pago confirmado le activa la
  inscripción a un estudiante de verdad y le encola un correo. Una prueba no
  puede escribirle a nadie. La ronda se monta sobre los pagos que ya existen y
  lo esperado se calcula a partir de ellos, no de un número escrito a mano que
  envejecería mal.
- **Todo lo que crea, lo borra**, pase lo que pase. Y si al abrir una ronda
  cierra alguna de la casa, se la devuelve como estaba. Restos de una prueba en
  la base de verdad son números falsos en la pantalla de alguien.
