/* Escribe supabase/migrations/ leyendo la base.
   ═══════════════════════════════════════════════════════════════════════════
   Antes de correr esto hay que aplicar herramientas/volcar-esquema.sql, que
   crea las funciones que hacen el trabajo. Al terminar, se borran.

   Hace falta una cuenta con rol de dirección: pon el correo y la clave en
   CEM_VOLCADO_USUARIO y CEM_VOLCADO_CLAVE.

     node herramientas/volcar-esquema.mjs

   Y despues, SIEMPRE, comprobar que lo escrito sirve para reconstruir:

     herramientas/probar-migraciones.sh

   Trae cada parte del esquema y la escribe en su archivo. El contenido va de
   Postgres al disco sin pasar por ningun sitio que pueda reescribirlo: los
   cuerpos de funcion llevan comillas, barras y $function$, y copiarlos a mano
   es la forma segura de romperlos. */
import { writeFileSync } from 'node:fs';

const URL_BASE = 'https://vajbsfgojtunamhrzrpf.supabase.co';
const CLAVE = 'sb_publishable_Xljd7Ep1GxBXSPp5F4A1hg_Qg-iESzl';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const DESTINO = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');

const USUARIO = process.env.CEM_VOLCADO_USUARIO;
const CLAVE_USUARIO = process.env.CEM_VOLCADO_CLAVE;
if (!USUARIO || !CLAVE_USUARIO) {
  console.error('\nFaltan CEM_VOLCADO_USUARIO y CEM_VOLCADO_CLAVE: una cuenta con rol'
    + '\nde direccion. Se para aqui en vez de fallar con un error de permisos.\n');
  process.exit(1);
}

const r = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: CLAVE, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: USUARIO, password: CLAVE_USUARIO }),
});
const ses = await r.json();
if (!ses.access_token) { console.log('no entró:', JSON.stringify(ses).slice(0,200)); process.exit(1); }

async function pedir(fn, parte) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: CLAVE, Authorization: `Bearer ${ses.access_token}`,
               'Content-Type': 'application/json' },
    body: JSON.stringify({ p_parte: parte }),
  });
  if (!res.ok) throw new Error(`${parte}: HTTP ${res.status} ${(await res.text()).slice(0,200)}`);
  return await res.json();          // devuelve el texto
}

/* El ORDEN importa y costó una prueba descubrirlo:
   · Las funciones van ANTES que las restricciones, porque hay una comprobación
     (`check`) que llama a `cem_reparto_valido(jsonb)`. Con el orden alfabético
     de siempre, la tabla se creaba antes que la función y fallaba.
   · Y el archivo de funciones abre con `check_function_bodies = false`, que es
     lo mismo que emite `pg_dump`: las funciones salen en orden alfabético y una
     que llame a otra que empieza por una letra posterior no puede validarse
     todavía. Sin esa línea se caían 32. */
const PARTES = [
  ['cem_volcado',  'extensiones',   '20260101000000_extensiones.sql',   'Extensiones de Postgres'],
  ['cem_volcado',  'tipos',         '20260101000001_tipos.sql',         'Tipos propios (enums)'],
  ['cem_volcado',  'tablas',        '20260101000002_tablas.sql',        'Las tablas, con sus columnas y valores por omisión'],
  ['cem_volcado',  'funciones',     '20260101000003_funciones.sql',     'Las funciones: aquí vive el trabajo de verdad'],
  ['cem_volcado',  'restricciones', '20260101000004_restricciones.sql', 'Claves, unicidad, comprobaciones y relaciones'],
  ['cem_volcado',  'indices',       '20260101000005_indices.sql',       'Índices'],
  ['cem_volcado2', 'disparadores',  '20260101000006_disparadores.sql',  'Disparadores'],
  ['cem_volcado2', 'rls',           '20260101000007_rls.sql',           'Quién puede ver cada fila. La seguridad de la casa'],
  ['cem_volcado2', 'permisos',      '20260101000008_permisos.sql',      'Permisos de tabla, de columna y de función'],
  ['cem_volcado2', 'almacen',       '20260101000009_almacen.sql',       'Depósitos de archivos y sus reglas'],
  ['cem_volcado2', 'tareas',        '20260101000010_tareas.sql',        'Lo que se ejecuta solo, y cuándo'],
];

let total = 0;
for (const [fn, parte, archivo, titulo] of PARTES) {
  const sql = await pedir(fn, parte);
  const cabecera = `-- ${titulo}\n`
    + `-- ═══════════════════════════════════════════════════════════════════════════\n`
    + `-- Generado por herramientas/volcar-esquema.sql. NO se edita a mano: se\n`
    + `-- vuelve a generar y se perdería lo escrito. Los cambios se hacen en la\n`
    + `-- base y luego se regenera esto.\n\n`;
  const antes = parte === 'funciones'
    ? '-- Las funciones salen en orden alfabético, así que una puede llamar a otra\n'
    + '-- que todavía no existe. Es lo mismo que hace pg_dump y por la misma razón.\n'
    + 'set check_function_bodies = false;\n\n'
    : '';
  writeFileSync(`${DESTINO}/${archivo}`, cabecera + antes + (sql || '-- (vacío)\n'));
  const n = (sql || '').length;
  total += n;
  console.log(`  ${archivo.padEnd(38)} ${String(n).padStart(8)} caracteres`);
}
console.log(`\ntotal: ${(total/1024).toFixed(0)} KB`);
