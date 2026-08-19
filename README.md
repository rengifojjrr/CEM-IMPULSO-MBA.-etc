# CEM · Plataforma

Portal académico del CEM: inscripciones, cuotas y pagos, contenidos, evaluación,
certificados verificables y el gobierno de todo eso (roles, auditoría,
integración con el banco).

Son páginas HTML con módulos de JavaScript, sin paso de compilación. Se abren
tal cual: no hay nada que construir antes de publicar. Supabase pone la base de
datos, las cuentas, el almacenamiento y las funciones del servidor.

## El mapa

| Carpeta | Qué hay |
|---|---|
| `plataforma/` | El portal: 51 pantallas para estudiantes, docentes y equipo |
| `plataforma/assets/` | `app.js` y `styles.css`, compartidos por todas |
| `certificados/` | El generador por lotes y la verificación pública del QR |
| `certificados/generador.js` | El motor del generador, que comparten dos pantallas |
| `supabase/functions/` | Las funciones de borde (banco, correo, importaciones) |
| `pruebas/` | Las pruebas con navegador |
| `herramientas/` | Guiones de mantenimiento |
| `docs/` | Cómo funciona esto por dentro |

## Correr el sitio

Cualquier servidor estático sobre la raíz del repositorio:

```bash
npx http-server -p 8125 -c-1 .
```

Y abrir <http://localhost:8125/plataforma/index.html>.

## Antes de subir un cambio

```bash
node herramientas/revisar.mjs      # segundos, no necesita base ni navegador
cd pruebas && npm test             # unos minutos, con navegador y base de verdad
```

La primera es la que corre sola en cada empujón al repositorio
(`.github/workflows/revision.yml`). Comprueba que todo el JavaScript se pueda
leer —incluido el que va dentro de cada `<script type="module">`—, que no se
haya colado ninguna clave, que no queden enlaces rotos, que los archivos
compartidos vayan todos con la misma versión, que ningún `update`/`delete` lleve
paginación colgada y que toda pantalla privada llame a `mount()`.

### Al tocar `assets/app.js`, `assets/styles.css` o `certificados/generador.js`

Hay que volver a marcarlos, o quien ya entró antes seguirá usando la copia vieja
que tiene guardada:

```bash
node herramientas/versionar-assets.mjs
```

La revisión automática falla si alguna pantalla queda con una marca distinta.

## Documentación

- [Qué hace cada función del servidor](docs/funciones-del-servidor.md) — el
  inventario de dónde se toma cada decisión, y las reglas para agregar una
  función nueva sin abrir un agujero.
- [Quién puede ver y tocar qué](docs/politicas-de-acceso.md) — los roles y cómo
  se revisan las políticas de acceso desde la propia plataforma.
- [Los vídeos y quién puede copiarlos](docs/videos-y-copia.md) — qué impide el
  reproductor de la casa, qué **no** impide mientras los vídeos vivan en
  YouTube, y qué haría falta para que un enlace filtrado no sirviera de nada.
- [Respaldo y restauración](docs/respaldo-y-restauracion.md) — cómo se respalda,
  cómo se restaura y **cómo se comprueba** que la restauración quedó completa.
- [El entorno de pruebas](docs/entorno-de-pruebas.md) — cómo dejar los datos en
  un punto conocido.
- [`pruebas/README.md`](pruebas/README.md) — qué protege cada prueba.
- `plataforma/manual.html` — el manual para quien usa la plataforma, no para
  quien la programa.

## Lo que nunca va en este repositorio

La clave **pública** de Supabase (`sb_publishable_…`) sí va escrita en el HTML:
está pensada para vivir en el navegador y sólo puede hacer lo que las políticas
de acceso permiten.

No van, nunca, en ningún archivo:

- la clave de servicio (`service_role`), que se salta todas las políticas;
- las credenciales del banco — viven en la tabla `cem_integraciones`, a la que
  sólo llega el servidor;
- la ApiKey del webhook.

La revisión automática busca esos patrones en cada cambio y falla si aparecen.
