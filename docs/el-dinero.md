# El dinero

Cómo se guarda un precio, cómo se convierte y qué se congela al cobrar. Son
cuatro reglas, y las cuatro se rompen del mismo modo: guardando algo que debería
calcularse, o calculando algo que debería estar guardado.

---

## 1. Un precio, una moneda

`cem_courses.precio` está en **euros** y es el único precio que existe. El
importe en bolívares **no se guarda en ninguna parte**: se calcula al enseñarlo.

Por qué no se guarda:

- Guardar los dos obliga a reescribir el catálogo entero cada vez que se mueve
  la tasa, y un fallo a mitad deja precios que no concuerdan entre sí.
- El precio en euros es el que define lo que gana la casa. Es el dato; el otro
  es una vista de ese dato.

La excepción es el cobro, y está en el punto 3.

## 2. Qué tasa manda

Tres sitios, en este orden:

| | De dónde | Por qué existe |
|---|---|---|
| 1 | La que escribió la casa (`id_tasa = 'MANUAL'`) | Es la única que refleja una decisión del negocio. A veces se cobra a una tasa distinta de la oficial, y eso lo decide una persona. |
| 2 | La del BCV, traída sola (`id_tasa = 'BCV'`) | El caso normal: dos veces al día, sin que nadie escriba nada. |
| — | Nada | **No hay tercer nivel.** Ver el punto 4. |

La regla dura: **lo que escribió la casa le gana al banco, y sólo por ese día.**
Vive en el `order by` de `cem_tasa_vigente`:

```sql
order by t.fecha desc, (t.id_tasa = 'MANUAL') desc, t.actualizado_en desc
```

Las dos mitades importan. Sin la segunda, la tarea automática pisaría en
silencio la decisión del dueño a la mañana siguiente. Y sin la primera, un
número escrito una vez mandaría para siempre; una tasa a mano vale para el día
en que se puso, y al siguiente vuelve a mandar el banco, que es lo que se
espera.

Cuando las dos existen el mismo día, la pantalla de cobranza lo dice y ofrece
volver a la del BCV de un clic. No es un aviso de error: es que ese estado es
correcto y a la vez indistinguible de haber tecleado el número mal.

**Cuál tasa, no da igual.** El BCV publica una por moneda, y entre la del dólar
y la del euro hay diferencia. La casa cobra en euros, así que convierte con la
del **euro**. La del dólar se lleva sólo para cuadrar contra el banco y no
convierte ningún cobro. Qué tasa usa cada forma de pago está escrito en
`cem_metodos_pago.tasa_moneda`, no deducido en el código de ninguna pantalla.

## 3. Al cobrar, la tasa se congela

Esta es la parte que más se rompe en otros sitios.

Cada pago guarda `monto` (lo que llegó, en su moneda), `tasa` (la de ese día) y
`monto_base` (ya convertido). Una vez guardado **no se recalcula nunca**. Está
escrito en `enBase()`, en `app.js`:

> La conversión la hace el servidor al reportar el pago y se guarda con la tasa
> de ESE día. Aquí no se recalcula nunca: un pago de hace un mes no vale hoy lo
> que valía entonces, y volver a dividir por la tasa de hoy sería reescribir la
> historia.

Los saldos se suman con `monto_base`, nunca con `sum(monto) × tasa_de_hoy`. Un
cobro de hace un mes no aportó lo mismo que uno de hoy, y recalcular el
histórico con la tasa de hoy hace que la contabilidad mienta.

Además, quien registra el pago escribe **el monto que entró**, no la tasa: la
persona que cobra sabe cuánto le llegó, no a qué tasa se lo calcularon. La tasa
la deduce `cem_equivalente_en_base`.

## 4. Sin tasa no se convierte

`cem_equivalente_en_base` **levanta un error** en vez de convertir cuando no hay
tasa para el día del pago. No hay valor de respaldo escrito en la configuración,
a propósito: un número fijo envejece y nadie se entera, y un precio equivocado
se convierte en una discusión con un estudiante. En la pantalla del estudiante,
cuando no hay tasa se dice que no la hay y se le pide que escriba antes de
pagar.

---

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| La tabla de tasas, con su origen | `cem_tasas_bcv (moneda, fecha, id_tasa)` |
| Cuál manda | `cem_tasa_vigente(moneda)` |
| Traerla del BCV | `cem_tasa_bcv_pedir` / `cem_tasa_bcv_recoger`, dos veces al día |
| De dónde se trae | `cem_settings.tasa_automatica` — no dentro de la función |
| Convertir un cobro | `cem_equivalente_en_base(monto, metodo, fecha)` |
| No recalcular la historia | `enBase()` en `assets/app.js` |
| Enseñar un importe | `money()` en `assets/app.js` — una sola función, un solo formato |
| La caché del navegador | `tasaVigente()`, 30 minutos en `sessionStorage` |

## Lo que pasó una vez, para que no vuelva a pasar

La suite de pruebas cargaba una tasa a mano —48,90 Bs/€— para comprobar que
cargarla a mano funciona, y **no la devolvía**. Como la tasa a mano manda sobre
la del banco, la plataforma se quedaba con ese número: 48,90 cuando el BCV
publicaba 906,83. Casi veinte veces, puesto ahí por las pruebas y por nadie más,
y sin ninguna pantalla donde eso se viera raro.

Ahora la prueba apunta lo que había antes de tocar nada y lo devuelve al
terminar. Y la pantalla de cobranza enseña la del banco al lado de la de la
casa cuando no coinciden, que es lo que habría delatado esto el primer día.
