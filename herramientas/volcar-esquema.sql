-- Volcar el esquema al repositorio
-- ═══════════════════════════════════════════════════════════════════════════
-- Esto CREA las dos funciones que escriben supabase/migrations/. Se aplican a
-- la base, se corre `node herramientas/volcar-esquema.mjs`, y se borran:
--
--   drop function if exists public.cem_volcado(text);
--   drop function if exists public.cem_volcado2(text);
--   drop function if exists public.cem_volcador_fuente();
--
-- Por qué son temporales: una función que sabe leer el esquema entero no tiene
-- por qué vivir en producción. Exige rol de dirección mientras existe, y aun
-- así se quita.
--
-- Lo que aprendió esta herramienta a base de fallar, y está en su código:
--   · Las funciones van ANTES que las restricciones — hay un `check` que llama
--     a cem_reparto_valido(jsonb).
--   · El archivo de funciones abre con check_function_bodies = false, igual que
--     pg_dump: salen en orden alfabético y una puede llamar a otra posterior.
--   · Las restricciones EXCLUDE (contype 'x') hay que pedirlas aparte. Se
--     olvidaron la primera vez y se perdía una regla sin ruido.
--   · El volcador se excluye a sí mismo del volcado.

CREATE OR REPLACE FUNCTION public.cem_volcado(p_parte text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_out text := ''; v_cols text; r record;
begin
  if not exists (select 1 from public.cem_profiles
                  where id = auth.uid() and activo and rol in ('admin','superadmin')) then
    raise exception 'Sólo dirección puede volcar el esquema.';
  end if;

  if p_parte = 'extensiones' then
    for r in select extname, n.nspname as esq from pg_extension e
             join pg_namespace n on n.oid = e.extnamespace
             where extname <> 'plpgsql' order by extname loop
      v_out := v_out || format('create extension if not exists %I with schema %I;', r.extname, r.esq) || E'\n';
    end loop;

  elsif p_parte = 'tipos' then
    for r in select t.typname, string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) as et
             from pg_type t join pg_enum e on e.enumtypid = t.oid
             join pg_namespace n on n.oid = t.typnamespace
             where n.nspname='public' group by t.typname order by t.typname loop
      v_out := v_out || format('create type public.%I as enum (%s);', r.typname, r.et) || E'\n';
    end loop;

  elsif p_parte = 'tablas' then
    for r in select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname='public' and c.relkind='r' order by c.relname loop
      select string_agg(format('  %I %s%s%s', a.attname, format_type(a.atttypid, a.atttypmod),
               case when a.attnotnull then ' not null' else '' end,
               case when ad.adbin is not null then ' default ' || pg_get_expr(ad.adbin, ad.adrelid) else '' end),
             E',\n' order by a.attnum) into v_cols
        from pg_attribute a left join pg_attrdef ad on ad.adrelid = a.attrelid and ad.adnum = a.attnum
       where a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped;
      v_out := v_out || format('create table if not exists public.%I (', r.relname) || E'\n' || v_cols || E'\n);\n';
      if obj_description(r.oid, 'pg_class') is not null then
        v_out := v_out || format('comment on table public.%I is %L;', r.relname, obj_description(r.oid,'pg_class')) || E'\n';
      end if;
      v_out := v_out || E'\n';
    end loop;

  elsif p_parte = 'restricciones' then
    -- 'x' son las EXCLUDE. Faltaban, y con ellas se perdía la que impide que
    -- dos cosas se solapen. Una restricción que no se recrea es una regla de
    -- negocio que desaparece sin ruido.
    for r in select cl.relname, c.conname, pg_get_constraintdef(c.oid) as def
             from pg_constraint c join pg_class cl on cl.oid = c.conrelid
             join pg_namespace n on n.oid = cl.relnamespace
             where n.nspname='public' and c.contype in ('p','u','c','f','x')
             order by case c.contype when 'p' then 1 when 'u' then 2 when 'c' then 3
                                     when 'x' then 4 else 5 end, cl.relname, c.conname loop
      v_out := v_out || format('alter table public.%I add constraint %I %s;', r.relname, r.conname, r.def) || E'\n';
    end loop;

  elsif p_parte = 'indices' then
    for r in select indexdef from pg_indexes where schemaname='public'
             and indexname not in (select conname from pg_constraint
                                   where contype in ('p','u','x') and connamespace =
                                     (select oid from pg_namespace where nspname='public'))
             order by tablename, indexname loop
      v_out := v_out || replace(replace(r.indexdef, 'CREATE INDEX ', 'create index if not exists '),
                 'CREATE UNIQUE INDEX ', 'create unique index if not exists ') || E';\n';
    end loop;

  elsif p_parte = 'funciones' then
    -- El volcador NO se vuelca a sí mismo: es una herramienta temporal, no
    -- parte del esquema. Se borra en cuanto termina la exportación.
    for r in select p.oid, p.proname, pg_get_functiondef(p.oid) as def
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname='public' and p.prokind in ('f','p')
               and p.proname not in ('cem_volcado','cem_volcado2')
             order by p.proname, p.oid loop
      v_out := v_out || r.def || E';\n';
      if obj_description(r.oid, 'pg_proc') is not null then
        v_out := v_out || format('comment on function public.%s is %L;',
                   (select p2.proname || '(' || pg_get_function_identity_arguments(p2.oid) || ')'
                      from pg_proc p2 where p2.oid = r.oid), obj_description(r.oid,'pg_proc')) || E'\n';
      end if;
      v_out := v_out || E'\n';
    end loop;
  end if;
  return v_out;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cem_volcado2(p_parte text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_out text := ''; r record;
begin
  if not exists (select 1 from public.cem_profiles
                  where id = auth.uid() and activo and rol in ('admin','superadmin')) then
    raise exception 'Sólo dirección puede volcar el esquema.';
  end if;

  if p_parte = 'rls' then
    for r in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='public' and c.relkind='r' and c.relrowsecurity order by c.relname loop
      v_out := v_out || format('alter table public.%I enable row level security;', r.relname) || E'\n';
    end loop;
    v_out := v_out || E'\n';
    for r in select tablename, policyname, permissive, roles, cmd, qual, with_check
             from pg_policies where schemaname='public' order by tablename, policyname loop
      v_out := v_out || format('create policy %I on public.%I as %s for %s to %s',
                 r.policyname, r.tablename, lower(r.permissive), lower(r.cmd),
                 array_to_string(r.roles, ', '));
      if r.qual is not null then v_out := v_out || E'\n  using (' || r.qual || ')'; end if;
      if r.with_check is not null then v_out := v_out || E'\n  with check (' || r.with_check || ')'; end if;
      v_out := v_out || E';\n';
    end loop;

  elsif p_parte = 'permisos' then
    for r in select grantee, privilege_type, table_name from information_schema.role_table_grants
             where table_schema='public' and grantee in ('anon','authenticated','service_role','PUBLIC')
             order by table_name, grantee, privilege_type loop
      v_out := v_out || format('grant %s on public.%I to %s;', lower(r.privilege_type), r.table_name, r.grantee) || E'\n';
    end loop;
    v_out := v_out || E'\n-- Permisos por COLUMNA: esto es lo que esconde los enlaces de YouTube.\n';
    for r in select grantee, privilege_type, table_name,
                    string_agg(quote_ident(column_name), ', ' order by column_name) as cols
             from information_schema.column_privileges
             where table_schema='public' and grantee in ('anon','authenticated')
               and not exists (select 1 from information_schema.role_table_grants g
                               where g.table_schema='public' and g.table_name=column_privileges.table_name
                                 and g.grantee=column_privileges.grantee
                                 and g.privilege_type=column_privileges.privilege_type)
             group by grantee, privilege_type, table_name order by table_name, grantee loop
      v_out := v_out || format('grant %s (%s) on public.%I to %s;', lower(r.privilege_type), r.cols, r.table_name, r.grantee) || E'\n';
    end loop;
    v_out := v_out || E'\n-- Funciones\n';
    for r in select p.proname, pg_get_function_identity_arguments(p.oid) as args,
                    coalesce(array_to_string(p.proacl, E'\n'), '') as acl
             from pg_proc p join pg_namespace n on n.oid=p.pronamespace
             where n.nspname='public' and p.prokind in ('f','p')
               and p.proname not in ('cem_volcado','cem_volcado2')
             order by p.proname, p.oid loop
      v_out := v_out || format('revoke all on function public.%I(%s) from public, anon;', r.proname, r.args) || E'\n';
      if r.acl like '%anon=X%' then
        v_out := v_out || format('grant execute on function public.%I(%s) to anon;', r.proname, r.args) || E'\n'; end if;
      if r.acl like '%authenticated=X%' then
        v_out := v_out || format('grant execute on function public.%I(%s) to authenticated;', r.proname, r.args) || E'\n'; end if;
      if r.acl like '%service_role=X%' then
        v_out := v_out || format('grant execute on function public.%I(%s) to service_role;', r.proname, r.args) || E'\n'; end if;
    end loop;

  elsif p_parte = 'disparadores' then
    for r in select pg_get_triggerdef(t.oid) as def from pg_trigger t
             join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
             where n.nspname='public' and not t.tgisinternal order by c.relname, t.tgname loop
      v_out := v_out || r.def || E';\n';
    end loop;

  elsif p_parte = 'tareas' then
    for r in select jobname, schedule, command, active from cron.job order by jobid loop
      v_out := v_out || format('select cron.schedule(%L, %L, %L);', r.jobname, r.schedule, r.command) || E'\n';
      if not r.active then
        v_out := v_out || format('-- estaba desactivada: select cron.unschedule(%L);', r.jobname) || E'\n'; end if;
    end loop;

  elsif p_parte = 'almacen' then
    for r in select id, name, public, file_size_limit, allowed_mime_types from storage.buckets order by id loop
      v_out := v_out || format(
        'insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values (%L, %L, %L, %s, %L) on conflict (id) do nothing;',
        r.id, r.name, r.public, coalesce(r.file_size_limit::text,'null'), r.allowed_mime_types) || E'\n';
    end loop;
    v_out := v_out || E'\n';
    for r in select policyname, cmd, roles, qual, with_check from pg_policies
             where schemaname='storage' and tablename='objects' order by policyname loop
      v_out := v_out || format('create policy %I on storage.objects for %s to %s',
                 r.policyname, lower(r.cmd), array_to_string(r.roles, ', '));
      if r.qual is not null then v_out := v_out || E'\n  using (' || r.qual || ')'; end if;
      if r.with_check is not null then v_out := v_out || E'\n  with check (' || r.with_check || ')'; end if;
      v_out := v_out || E';\n';
    end loop;
  end if;
  return v_out;
end;
$function$
;

