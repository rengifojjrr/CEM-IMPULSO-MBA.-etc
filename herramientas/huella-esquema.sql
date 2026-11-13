-- La huella del esquema: una línea por objeto, para comparar dos bases
-- ═══════════════════════════════════════════════════════════════════════════
-- Sólo lee. Saca, de cada función, tabla, restricción, índice, política,
-- disparador, permiso, tarea, depósito, tipo, vista y secuencia, una línea
--   categoría|nombre|huella
-- donde la huella es lo que importa de ese objeto (el md5 del cuerpo de la
-- función, sus atributos, quién puede ejecutarla, su comentario…). La misma
-- consulta en dos bases da dos listas que se comparan con `diff`.
--
-- Para qué: «sin un solo error» no quiere decir «igual que producción». El 13
-- de noviembre de 2026 la reconstrucción daba cero errores y aun así le
-- faltaban el temario público y el disparador que crea el perfil de cada
-- cuenta nueva, y habría abierto de más 29 funciones y 7 tablas en una
-- restauración real. Sólo lo dijo esta comparación.
--
-- Cómo (supabase/migrations/README.md, «Comparar con producción»):
--   1. Lo reconstruido:  CEM_HUELLA=/tmp/local.txt herramientas/probar-migraciones.sh
--   2. Producción: esta misma consulta, entera, en el editor SQL de Supabase (o
--      con execute_sql), y el resultado a /tmp/prod.txt, una línea por fila.
--   3. diff <(sort /tmp/local.txt) <(sort /tmp/prod.txt)
--
-- Las funciones se comparan por su cuerpo (prosrc) y no por su texto
-- deparseado, para que Postgres 16 aquí y 17 allí no difieran por formato. Los
-- permisos se escriben ordenados con collate "C", para que las dos bases los
-- pongan en el mismo orden; MAINTAIN, que sólo existe desde la 17, no cuenta.
set search_path to public;

with
roles_ok(r) as (values ('anon'), ('authenticated'), ('service_role')),
fn as (
  select p.oid, p.oid::regprocedure::text as clave, p.prosrc, l.lanname,
         p.prosecdef::text || p.provolatile::text || p.proisstrict::text || p.proretset::text
           || p.prorettype::regtype::text || '|' || coalesce(array_to_string(p.proconfig, ','), '') as attr,
         case when p.proacl is null then 'por-omision' else coalesce((
           select string_agg(x, ',' order by x collate "C") from (
             select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end || '=' || a.privilege_type as x
               from aclexplode(p.proacl) a
              where a.grantee = 0 or a.grantee::regrole::text in (select r from roles_ok)) s), '') end as acl,
         coalesce(obj_description(p.oid, 'pg_proc'), '') as com
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
   where n.nspname = 'public' and p.prokind in ('f', 'p')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e' and d.classid = 'pg_proc'::regclass)
),
tb as (
  select c.oid, c.relname,
         coalesce((select string_agg(a.attname || ' ' || format_type(a.atttypid, a.atttypmod)
                     || case when a.attnotnull then ' nn' else '' end
                     || coalesce(' d=' || pg_get_expr(ad.adbin, ad.adrelid), '')
                     || case when a.attidentity <> '' then ' id' else '' end
                     || case when a.attgenerated <> '' then ' gen' else '' end, ', ' order by a.attname)
                    from pg_attribute a left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
                   where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped), '') as cols,
         c.relrowsecurity::text || c.relforcerowsecurity::text as rls,
         coalesce(obj_description(c.oid, 'pg_class'), '') as com
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p')
),
filas(l) as (
  select 'funcion|' || clave || '|' || md5(prosrc) || '|' || lanname || ':' || md5(attr) || '|' || acl || '|' || md5(com) from fn
  union all
  select 'tabla|' || relname || '|' || md5(cols) || '|' || rls || '|' || md5(com) from tb
  union all
  select 'restriccion|' || cl.relname || '.' || c.conname || '|' || md5(pg_get_constraintdef(c.oid))
    from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace
   where n.nspname = 'public'
  union all
  select 'indice|' || tablename || '.' || indexname || '|' || md5(indexdef) from pg_indexes where schemaname = 'public'
  union all
  select 'politica|' || schemaname || '.' || tablename || '.' || policyname || '|'
         || md5(permissive || cmd || array_to_string(roles, ',') || '|' || coalesce(qual, '') || '|' || coalesce(with_check, ''))
    from pg_policies where schemaname in ('public', 'storage')
  union all
  select 'disparador|' || tn.nspname || '.' || c.relname || '.' || t.tgname || '|' || md5(pg_get_triggerdef(t.oid)) || '|' || t.tgenabled::text
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace tn on tn.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid join pg_namespace pn on pn.oid = p.pronamespace
   where not t.tgisinternal and (tn.nspname = 'public' or pn.nspname = 'public')
  union all
  select 'permiso_tabla|' || c.relname || '|' || coalesce((
           select string_agg(x, ',' order by x collate "C") from (
             select case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end || '=' || a.privilege_type as x
               from aclexplode(c.relacl) a
              where (a.grantee = 0 or a.grantee::regrole::text in (select r from roles_ok))
                and a.privilege_type <> 'MAINTAIN') s), '')
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm')
  union all
  select 'permiso_columna|' || c.relname || '.' || a.attname || '|' || coalesce((
           select string_agg(x, ',' order by x collate "C") from (
             select case when g.grantee = 0 then 'PUBLIC' else g.grantee::regrole::text end || '=' || g.privilege_type as x
               from aclexplode(a.attacl) g
              where g.grantee = 0 or g.grantee::regrole::text in (select r from roles_ok)) s), '')
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and a.attnum > 0 and not a.attisdropped and a.attacl is not null
  union all
  select 'tarea|' || jobname || '|' || md5(schedule || '|' || command || '|' || active::text) from cron.job
  union all
  select 'deposito|' || id || '|' || public::text || '|' || coalesce(file_size_limit::text, '') || '|'
         || coalesce(array_to_string(allowed_mime_types, ','), '') from storage.buckets
  union all
  select 'tipo|' || t.typname || '|' || md5(string_agg(e.enumlabel, ',' order by e.enumsortorder))
    from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public' group by t.typname
  union all
  select 'vista|' || c.relname || '|' || md5(pg_get_viewdef(c.oid))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('v', 'm')
  union all
  select 'secuencia|' || c.relname || '|'
    from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'S'
)
select l from filas order by l collate "C";
