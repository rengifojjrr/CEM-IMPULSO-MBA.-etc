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
# Y lo que encontró en noviembre: 13 errores de migraciones que se aplicaron en
# producción sin dejar archivo aquí (supabase/migrations/README.md). Desde
# entonces también cuenta como fallo lo que antes pasaba en silencio: el propio
# andamiaje, los FATAL, los WARNING y los cuerpos de función que no se validan.
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

# Qué cuenta como fallo. «ERROR:» solo no basta: si el servidor se cae a mitad,
# psql escribe «FATAL:» o «psql: error:» (en minúscula) y todo lo que venía
# detrás salía ✓. Y un WARNING suele ser un error que alguien decidió no parar
# (`raise warning`, `exception when others`): también cuenta.
FALLO='ERROR:|FATAL:|PANIC:|psql: error|WARNING:'

echo "Poniendo el andamiaje de Supabase…"
# Antes su salida iba a /dev/null: si fallaba, no se enteraba nadie, y lo de
# abajo se medía sobre un andamiaje a medias.
if ! $P -v ON_ERROR_STOP=1 -f "$RAIZ/herramientas/andamio-supabase.sql" >"$D/andamio.txt" 2>&1; then
  echo "✗ El andamiaje no se aplica, y sin él lo demás no significa nada:"
  sed 's/^/    /' "$D/andamio.txt"
  exit 1
fi

echo "Aplicando las migraciones:"
TOTAL=0
# Se salta la de extensiones: pg_cron, pg_net y supabase_vault no existen fuera
# de Supabase y el andamiaje ya pone equivalentes vacíos.
for f in "$RAIZ"/supabase/migrations/*.sql; do
  case "$f" in *_extensiones.sql) continue ;; esac
  C=0; $P -f "$f" >"$D/salida.txt" 2>&1 || C=$?
  E=$(grep -cE "$FALLO" "$D/salida.txt" || true)
  # Sin ON_ERROR_STOP, psql devuelve 0 aunque falle una sentencia. Si devuelve
  # otra cosa es que se cayó él (archivo, conexión), diga lo que diga la salida.
  if [ "$C" != "0" ] && [ "$E" = "0" ]; then
    E=1; echo "psql terminó con el código $C" >>"$D/salida.txt"
  fi
  TOTAL=$((TOTAL + E))
  if [ "$E" = "0" ]; then
    printf '  ✓ %s\n' "$(basename "$f")"
  else
    printf '  ✗ %s — %s error(es)\n' "$(basename "$f")" "$E"
    grep -E "$FALLO|psql terminó" "$D/salida.txt" | sed 's/^/      /' | head -5
  fi
done

# Las funciones del volcado se crean con check_function_bodies = false, como
# hace pg_dump, así que nadie comprueba sus cuerpos: una función SQL que lee una
# tabla que no existe se crea igual y revienta el día que alguien la llama. Aquí
# se validan todas al final, con todo ya creado. De las plpgsql, Postgres sólo
# sabe comprobar la sintaxis antes de ejecutarlas.
echo
echo "Validando el cuerpo de cada función:"
C=0
$P -v ON_ERROR_STOP=1 >"$D/validar.txt" 2>&1 <<'SQL' || C=$?
set check_function_bodies = on;
do $$
declare r record; n int := 0;
begin
  for r in select p.oid, p.oid::regprocedure as fn, l.lanname
             from pg_proc p join pg_namespace s on s.oid = p.pronamespace
             join pg_language l on l.oid = p.prolang
            where s.nspname = 'public' and l.lanname in ('sql', 'plpgsql')
              and not exists (select 1 from pg_depend d where d.objid = p.oid
                                and d.deptype = 'e' and d.classid = 'pg_proc'::regclass)
            order by 2
  loop
    begin
      if r.lanname = 'sql' then perform fmgr_sql_validator(r.oid);
      else perform plpgsql_validator(r.oid); end if;
      n := n + 1;
    exception when others then
      raise warning 'no se valida %: %', r.fn, sqlerrm;
    end;
  end loop;
  raise notice 'validadas: %', n;
end $$;
SQL
V=$(grep -cE "$FALLO" "$D/validar.txt" || true)
if [ "$C" != "0" ] && [ "$V" = "0" ]; then V=1; fi
TOTAL=$((TOTAL + V))
if [ "$V" = "0" ]; then
  printf '  ✓ %s funciones con el cuerpo en regla\n' "$(sed -n 's/.*validadas: //p' "$D/validar.txt")"
else
  printf '  ✗ %s función(es) no se validan\n' "$V"
  grep -E "$FALLO" "$D/validar.txt" | sed 's/^/      /' | head -10
fi

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

# «Sin un solo error» no quiere decir «igual que producción»: eso sólo lo dice
# comparar objeto por objeto (supabase/migrations/README.md). Con CEM_HUELLA,
# la huella de lo reconstruido queda en ese archivo antes de apagar la base.
if [ -n "${CEM_HUELLA:-}" ]; then
  $P -tA -v ON_ERROR_STOP=1 -f "$RAIZ/herramientas/huella-esquema.sql" >"$CEM_HUELLA"
  echo
  echo "Huella de lo reconstruido: $CEM_HUELLA ($(wc -l <"$CEM_HUELLA") objetos)."
fi

echo
if [ "$TOTAL" = "0" ]; then
  echo "✓ Las migraciones reconstruyen la plataforma sin un solo error."
  echo "  Compara las cifras de arriba con las de la base de verdad."
else
  echo "✗ $TOTAL error(es). El volcado NO sirve para reconstruir hasta arreglarlos."
  exit 1
fi
