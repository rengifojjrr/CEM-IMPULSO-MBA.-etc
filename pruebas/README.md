# Pruebas de la plataforma CEM

Las pruebas que verifican los flujos que **no pueden romperse** —los que mueven
dinero, los que ponen notas y los que deciden quién puede hacer qué— viven aquí,
dentro del repositorio. Antes se escribían fuera y se perdían con cada sesión.

## Cómo correrlas

```bash
cd pruebas
npm install          # sólo la primera vez
npm test             # todas
npm test -- cobranza # sólo las que coincidan con ese nombre
```

Las pruebas abren un navegador de verdad, entran con las cuentas de prueba y
comprueban lo que ve una persona. No se burla nada: si una pantalla no carga o
la base rechaza algo que debería permitir, la prueba falla.

## Qué hace falta

- **Node 20 o superior.**
- **Un servidor estático** sirviendo la raíz del repositorio. El script lo
  levanta solo en el puerto 8125 si no lo encuentra corriendo.
- **Chromium.** Se usa el que traiga Playwright (`npx playwright install
  chromium` la primera vez), o el que indique `CEM_CHROMIUM`.
- **Las cuentas de prueba** creadas en la base: `admin@`, `coordinador@`,
  `profesor@`, `cobranza@`, `estudiante@` y `auditor@` en `cem.demo`, todas con
  la contraseña que indique `CEM_PASS` (por omisión `CemDemo2026!`).

Variables opcionales:

| Variable | Para qué | Por omisión |
|---|---|---|
| `CEM_BASE` | dónde está servido el sitio | `http://localhost:8125` |
| `CEM_PASS` | contraseña de las cuentas de prueba | `CemDemo2026!` |
| `CEM_CHROMIUM` | ruta a un Chromium concreto | el de Playwright |
| `CEM_PROXY` | proxy de salida, si hace falta | ninguno |
| `CEM_SERVICE_KEY` | clave de servicio, sólo para sembrar datos | ninguna |

`CEM_SERVICE_KEY` **nunca** se escribe en un archivo del repositorio. Sin ella
las pruebas que necesitan sembrar algo se saltan ese paso y lo dicen.

## Qué cubre cada archivo

| Archivo | Qué protege |
|---|---|
| `casos/acceso.mjs` | entrar, recuperar la contraseña, sesión vencida, avisos |
| `casos/dinero.mjs` | reportar un pago, verificarlo, estado de cuenta, recibo, cartera |
| `casos/roles.mjs` | qué puede y qué no puede cada rol, contra la base |
| `casos/academico.mjs` | perfil, congelamiento, requisitos antes de certificar |
| `casos/docente.mjs` | aula, asistencia y resumen del grupo |
| `casos/certificados.mjs` | el generador compartido y la generación de un lote |

Hoy son **106 comprobaciones** repartidas en esos seis archivos, y las 106
pasan. Ese número es la referencia: si baja, algo se dejó de comprobar.

## Cuando una prueba falla

El resultado dice qué se esperaba en castellano, no un `expected true to be
false`. Si falla, léela: el mensaje está escrito para que se entienda sin abrir
el código.
