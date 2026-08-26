#!/bin/sh
# ¿Sirven de verdad las migraciones para reconstruir la plataforma?
# ═══════════════════════════════════════════════════════════════════════════
# Un volcado que no se aplica es PEOR que no tener volcado, porque da confianza
# falsa: el día que haga falta, no se descubre que estaba roto — se descubre
# que no hay copia.
#
# Esto levanta un Postgres vacío, le pone el andamiaje mínimo de Supabase
# (roles, esquema auth, auth.uid(), storage, cron y pg_net de mentira) y aplica
# las migraciones en orden. Cuenta los errores y compara el resultado.
#
#   herramientas/probar-migraciones.sh
#
# Lo que encontró la primera vez que se corrió, y que leer los archivos no
# habría encontrado nunca:
#   · 32 funciones no se creaban por el orden alfabético
#   · una comprobación llamaba a una función que aún no existía
#   · faltaba una restricción EXCLUDE entera
#
# Necesita postgresql instalado (initdb, pg_ctl, psql). No toca nada en vivo:
# todo ocurre en un directorio temporal que se borra al terminar.
set -e

RAIZ=$(cd "$(dirname "$0")/.." && pwd)
BIN=$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | tail -1)
[ -n "$BIN" ] && PATH="$BIN:$PATH"
export PATH

command -v initdb >/dev/null 2>&1 || {
  echo "Falta postgresql. En Debian/Ubuntu:  apt-get install -y postgresql"; exit 1; }

# El socket de Postgres no puede pasar de 107 caracteres, así que la carpeta
# va corta a propósito y no en el temporal de la sesión.
D=/var/tmp/cem-prueba-migraciones
rm -rf "$D"; mkdir -p "$D"

USUARIO=postgres
if [ "$(id -u)" = "0" ]; then
  id pgtest >/dev/null 2>&1 || useradd -m pgtest
  chown -R pgtest "$D"
  COMO="su pgtest -c"
else
  COMO="sh -c"
fi

# Un puerto libre. Fijarlo a 5433 falla en cuanto alguien deja otra instancia
# levantada, y el mensaje que da entonces no dice que sea eso.
PUERTO=5433
while netstat -ltn 2>/dev/null | grep -q ":$PUERTO " || ss -ltn 2>/dev/null | grep -q ":$PUERTO "; do
  PUERTO=$((PUERTO + 1))
done

echo "Levantando un Postgres vacío en el puerto $PUERTO…"
$COMO "PATH=$PATH initdb -D $D/datos -U postgres --auth=trust" >"$D/init.log" 2>&1
$COMO "PATH=$PATH pg_ctl -D $D/datos -l $D/pg.log -o '-p $PUERTO -k $D' -w start" >/dev/null

limpiar() { $COMO "PATH=$PATH pg_ctl -D $D/datos -m immediate stop" >/dev/null 2>&1 || true; }
trap limpiar EXIT

P="psql -h $D -p $PUERTO -U postgres -q"

echo "Poniendo el andamiaje de Supabase…"
$P -f "$RAIZ/herramientas/andamio-supabase.sql" >/dev/null 2>&1

echo "Aplicando las migraciones:"
TOTAL=0
# Se salta la de extensiones: pg_cron, pg_net y supabase_vault no existen fuera
# de Supabase y el andamiaje ya pone equivalentes vacíos.
for f in "$RAIZ"/supabase/migrations/*.sql; do
  case "$f" in *_extensiones.sql) continue ;; esac
  $P -f "$f" >"$D/salida.txt" 2>&1 || true
  E=$(grep -c "ERROR:" "$D/salida.txt" || true)
  TOTAL=$((TOTAL + E))
  if [ "$E" = "0" ]; then
    printf '  ✓ %s\n' "$(basename "$f")"
  else
    printf '  ✗ %s — %s error(es)\n' "$(basename "$f")" "$E"
    grep "ERROR:" "$D/salida.txt" | sed 's/^/      /' | head -5
  fi
done

echo
echo "Lo que quedó construido:"
$P -tAF'|' -c "
select 'funciones propias', count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.prokind in ('f','p')
    and p.oid not in (select objid from pg_depend where deptype='e' and classid='pg_proc'::regclass)
union all select 'tablas', count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'
union all select 'tablas con RLS', count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relrowsecurity
union all select 'politicas RLS', count(*) from pg_policies where schemaname='public'
union all select 'restricciones', count(*) from pg_constraint c join pg_class cl on cl.oid=c.conrelid join pg_namespace n on n.oid=cl.relnamespace where n.nspname='public'
union all select 'indices', count(*) from pg_indexes where schemaname='public'
union all select 'disparadores', count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal
union all select 'tipos propios', count(*) from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public' and t.typtype='e'
union all select 'tareas programadas', count(*) from cron.job
union all select 'depositos de archivos', count(*) from storage.buckets
union all select 'politicas del almacen', count(*) from pg_policies where schemaname='storage'
order by 1;" | awk -F'|' '{ printf "  %-24s %s\n", $1, $2 }'

echo
if [ "$TOTAL" = "0" ]; then
  echo "✓ Las migraciones reconstruyen la plataforma sin un solo error."
  echo "  Compara las cifras de arriba con las de la base de verdad."
else
  echo "✗ $TOTAL error(es). El volcado NO sirve para reconstruir hasta arreglarlos."
  exit 1
fi
