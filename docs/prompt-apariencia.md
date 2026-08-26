# Prompt portátil · Sistema de apariencia

Para pegarle a **cualquier proyecto**. Copia todo lo que hay entre las líneas
`─────` y pégalo tal cual; no hace falta editar nada.

Lo que pide construir es lo que esta plataforma tiene en *Configuración →
Apariencia* y en el pie del menú lateral: cinco ejes independientes que se
combinan, aplicados al instante y recordados por navegador.

---

─────────────────────────────────────────────────────────────────────────────

Quiero que añadas a la configuración de este proyecto un **sistema de
apariencia** completo: que cada persona pueda elegir cómo se ve la aplicación y
que su elección se aplique al instante y se recuerde.

No quiero un interruptor de modo oscuro. Quiero **cinco ejes independientes que
se combinan sin estorbarse**, un panel donde elegirlos, y —lo más importante— la
maquinaria de tokens que hace que todo eso sea posible sin tocar una sola
pantalla.

Adapta todo lo que sigue al stack de este proyecto (React, Vue, Svelte, HTML
plano, lo que sea) y al idioma en que esté escrita su interfaz. Las decisiones
de fondo no cambian; los nombres de archivo y la forma de montar el panel, sí.

## Por qué así, antes de cómo

Tres cosas que determinan si esto sale bien o sale mal:

1. **La apariencia no es una decisión institucional.** Es de quien mira. Se
   guarda en su navegador, no en la base de datos, no afecta a nadie más y no
   necesita permisos. De ahí se sigue que el panel **no puede vivir sólo en una
   pantalla de administrador**: quien pasa ocho horas al día trabajando aquí
   tiene que poder cambiarlo, sea cual sea su rol.

2. **Nada se pinta con un color escrito a mano.** Todo sale de un puñado de
   tokens CSS. Si queda un `#3b82f6` suelto en una pantalla, esa pantalla se
   rompe en cuanto alguien cambie de paleta, y no se va a enterar nadie hasta
   que un usuario lo diga. Cambiar de paleta = reemplazar los valores de los
   tokens; nada más.

3. **No hay botón de «Guardar».** El cambio se ve en el acto. Es la única forma
   de elegir un aspecto con criterio: nadie puede juzgar «Bisel» leyendo la
   palabra «Bisel».

## Los cinco ejes

Son independientes: cualquier combinación tiene que funcionar.

| Eje | Qué controla | Opciones de arranque |
|---|---|---|
| **Paleta** | los colores | 3–6 paletas con nombre y una frase que diga a qué suenan |
| **Claro / oscuro** | el tema | `auto` (lo que diga el sistema), `claro`, `oscuro` |
| **Estilo de superficie** | cómo se dibujan las tarjetas | plano, vidrio esmerilado, marco, bisel, halo… |
| **Esquinas** | el radio | rectas (3 px), suaves (10 px), redondas (18 px) |
| **Densidad** | el aire entre bloques | compacta, normal, amplia |

Detalles que importan:

- **La densidad mueve el hueco ENTRE tarjetas, no la escala de espaciado
  entera.** Si encoges todo a la vez, el texto se apelmaza y no ganas filas.
  Un solo token —llámalo `--aire`— es el que cambia.
- **Cada estilo de superficie lleva una etiqueta honesta de coste.** Los que
  difuminan el fondo (`backdrop-filter`) van marcados como *pesado*; el resto,
  *ligero*. En un equipo modesto con una tabla de cientos de filas se nota, y
  quien elige tiene derecho a saberlo antes.
- **`auto` es el valor de fábrica del tema**, no «claro». Respetar lo que la
  persona ya configuró en su sistema es el comportamiento correcto.

## Los tokens

Define el juego completo en `:root`. Como mínimo:

```
superficies   --fondo  --papel  --hueco
texto         --tinta  --tinta-2  --tinta-3
líneas        --filete  --filete-fuerte
marca         --primary  --primary-suave  --on-primary
              --secondary  --on-secondary
estado        --ok  --warn  --error  (+ sus versiones suaves)
gráficos      --serie-1 … --serie-8
forma         --r  --r-full
espaciado     --e0 … --e5  y  --aire
tipografía    --t-xs … --t-2xl  --peso  --peso-fuerte
```

**Todo color que sirva de fondo necesita su pareja de encima.** Por cada
`--x` sobre el que se escriba, un `--on-x`. Suena obvio y es justo lo que se
olvida: de noche un color de marca se aclara para verse sobre fondo oscuro, y
la letra blanca que llevaba encima —escrita a mano, hace meses, cuando ese
color era oscuro— se queda en 1,4:1. Aquí pasó dos veces, con el dorado y con
el teal, y la segunda estaba en la línea de al lado de la primera. Si una
pareja `--on-x` no existe todavía, decláratela apuntando a la que sí:
`--on-secondary:var(--on-primary)` resuelve sola en todas las paletas donde el
secundario sigue la misma polaridad que el primario.

**Los colores de estado NO cambian con la paleta.** «Correcto», «atención» y
«error» significan lo mismo siempre: no son decoración, son señales. Una paleta
que vuelve el error morado porque queda bonito está rompiendo información. Lo
mismo con cualquier color que tenga significado propio en el dominio (el dorado
de un certificado, el color de una marca ajena).

## El tema oscuro: los tres estados

Aquí es donde falla todo el mundo, así que hazlo exactamente así.

Hay **tres** estados, no dos. La preferencia del sistema no deja marca en el
DOM; sólo una elección explícita la deja. Entonces:

```css
/* 1 · claro: la definición completa, sin condiciones */
:root{ --fondo:#f7f8fa; --tinta:#15181c; /* … todos los tokens … */ }

/* 2 · el sistema pide oscuro Y nadie eligió claro a mano */
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){ --fondo:#111418; --tinta:#e9ecef; /* … */ }
}

/* 3 · alguien eligió oscuro a mano: gana sobre el sistema */
:root[data-theme="dark"]{ --fondo:#111418; --tinta:#e9ecef; /* … */ }
```

Tres reglas que se siguen de esto:

- **En esos mismos tres bloques va `color-scheme`** — `light` en el primero,
  `dark` en los otros dos. No es un token: es lo único que lee el navegador
  para dibujar lo que no dibuja tu hoja —barras de desplazamiento, el botón de
  «Elegir archivo», el calendario de un `input[type=date]`, la muestra de un
  `input[type=color]`—. Sin declararlo, esas piezas se quedan claras y salen
  como recortes blancos sueltos en medio de una pantalla oscura. Va en la raíz
  del documento y sólo ahí: una copia acotada a un contenedor deja los
  controles de un tema y el resto de la página del otro.
- **Ningún color puede tener su única definición dentro de un `@media` o de un
  `[data-theme]`.** Si la tiene, en el estado sin marcar no se aplica y acabas
  pintando el texto de un tema sobre el fondo del otro.
- **Nunca escribas la paleta con `element.style.setProperty()`.** Un estilo en
  línea le gana a *todas* las reglas de la hoja, incluidas las de
  `prefers-color-scheme`, y la aplicación se queda en claro de noche para
  siempre. Para aplicar una paleta elegida, **genera una hoja de estilo** con
  la misma estructura de tres estados y métela en un `<style>` del `<head>`:

```
:root[data-paleta=X]                                    → valores de día
@media(prefers-color-scheme:dark) :root[data-paleta=X]:not([data-theme=light])
                                                        → valores de noche
:root[data-paleta=X][data-theme=dark]                   → valores de noche
```

Así la elección de paleta y la de tema quedan independientes y las dos
funcionan.

## Cómo se aplica

Los otros cuatro ejes son atributos en el elemento raíz, y el CSS reacciona:

```
<html data-paleta="…" data-theme="dark|light|(nada)"
      data-estilo="…" data-forma="…" data-densidad="…">
```

- Guarda cada eje en `localStorage`, con su clave, envuelto en `try/catch`
  (modo privado y cuotas llenas existen).
- Al leer, **valida contra el catálogo**: si lo guardado ya no existe —porque
  quitaste una paleta— cae al valor de fábrica en vez de dejar la página sin
  colores.
- **Aplica la apariencia al cargar el módulo, antes de que la página se
  muestre.** Si esperas a que monte la aplicación, se ve un parpadeo con los
  colores de fábrica antes de los elegidos. En un proyecto con SSR o pantalla de
  carga, esto va en un script síncrono en el `<head>`.

Expón una función única:

```js
aplicarApariencia({ paleta, tema, estilo, forma, densidad })
```

Cada campo es opcional: pasar sólo `{ tema: 'oscuro' }` no puede tocar los
demás. Y una `aparienciaDeFabrica()` que lo devuelve todo a los valores por
defecto.

## El panel

- **Cada opción se muestra pintada con su propio aspecto.** Los botones de
  paleta llevan sus tiras de color; los de estilo de superficie llevan dentro
  una tarjeta de muestra dibujada con ese mismo estilo; los de esquinas enseñan
  su radio. Elegir entre siete nombres a ciegas no es elegir.
- Cada opción con **su nombre y una frase corta** de qué consigue.
- Botón de **volver a como viene de fábrica**, y que diga en qué lo dejó.
- Ponlo en **dos sitios**: dentro de la pantalla de configuración, y accesible
  desde la navegación principal (pie del menú, menú de usuario) para todo el
  mundo. El mismo componente, con una variante compacta sin los textos largos
  para cuando va en una ventana modal.
- Marca la opción activa con `aria-pressed`, no sólo con un color.

## Reglas que no se negocian

- **Contraste real en los dos temas.** No inviertas los valores de día y ya:
  revisa que el texto secundario siga leyéndose sobre el fondo oscuro.
- **`prefers-reduced-motion`**: si hay transiciones al cambiar de aspecto, se
  desactivan.
- **Foco visible** en todos los controles del panel, y que sobreviva a las cinco
  combinaciones.
- **El `<body>` pinta su fondo desde un token, explícitamente.** Un fondo
  transparente hereda el del navegador y rompe uno de los dos temas.
- Si una paleta pide una tipografía distinta, cárgala **sólo cuando se elija esa
  paleta**, no siempre.

## Antes de darlo por hecho

Compruébalo tú, no me lo cuentes:

1. Las **cinco combinaciones extremas** se ven bien: paleta más saturada +
   oscuro + estilo pesado + redondas + amplia, y su contraria.
2. **Recargando** la página se mantiene lo elegido, y **sin parpadeo**.
3. Con el sistema en oscuro y **sin haber elegido nada**, la aplicación sale
   oscura. Eligiendo «claro» a mano, se queda clara aunque el sistema pida
   oscuro. Ese es el caso que casi siempre está roto.
4. `grep` de colores escritos a mano (`#`, `rgb(`, `hsl(`) fuera del archivo de
   tokens: **no debería quedar ninguno** en las pantallas. Los que queden,
   conviértelos en tokens o dime por qué no se puede.
5. Los colores de estado son **los mismos en todas las paletas**.
6. Con `localStorage` bloqueado, la aplicación sigue funcionando con los valores
   de fábrica en vez de romperse.

Cuando termines, dime qué tokens tuviste que inventar además de los de la lista
y qué colores escritos a mano encontraste por el camino, porque eso último suele
decir más del proyecto que el resto del trabajo.

─────────────────────────────────────────────────────────────────────────────
