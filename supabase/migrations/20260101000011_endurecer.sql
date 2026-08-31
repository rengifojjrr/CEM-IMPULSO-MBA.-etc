-- Endurecer lo que los avisos de Supabase señalaban, y sólo donde procedía.
-- ═══════════════════════════════════════════════════════════════════════════
-- El panel del proyecto daba 439 avisos de seguridad y 306 de rendimiento. Se
-- miraron todos. Este archivo aplica los que resultaron ciertos y ÚTILES; los
-- que no, quedan explicados aquí para que nadie los vuelva a «arreglar» sin
-- medir, porque dos de ellos habrían tumbado el sitio público.
--
-- Va en su propio archivo y al final, en vez de retocar el volcado del
-- esquema, para que se lea como lo que es: un cambio con fecha y con motivo.

-- ── 1 · search_path fijo en las funciones que lo tenían suelto ──────────────
-- Ninguna de las dieciséis es SECURITY DEFINER —se comprobó antes de tocarlas,
-- así que no había escalada de privilegios que cerrar—. Se fija igualmente
-- porque una función sin search_path depende de quién la llame para resolver
-- los nombres, y eso es un resultado distinto según el día.
--
-- pg_temp va nombrado y el ÚLTIMO. Si no se nombra, Postgres lo pone el
-- primero, y entonces una tabla temporal puede suplantar a una de verdad
-- dentro de la función.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
      join pg_language l on l.oid = p.prolang
     where ns.nspname = 'public'
       and l.lanname in ('sql','plpgsql')
       and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c
                        where c like 'search_path=%')
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.f);
  end loop;
end $$;


-- ── 2 · quitar de la vista pública seis funciones que devuelven datos ───────
-- Las seis tienen su guardia dentro y a quien no debe se le devuelven vacías
-- —se comprobó llamándolas con la clave publicable—, así que esto es la
-- segunda cerradura, no la primera.
--
-- OJO con el REVOKE: el permiso no viene de `anon`, viene de PUBLIC, que
-- Postgres concede solo al crear cualquier función. Retirárselo a anon a secas
-- no quita nada; hay que retirar el de PUBLIC y devolver el de quien sí debe
-- tenerlo, o se cierra también para el equipo.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('cem_a_quien_llamo_hoy',            -- a quién llamar hoy: cobranza
                         'cem_de_donde_vienen',              -- de dónde llegan los alumnos
                         'cem_docente_quien_se_esta_yendo',  -- quién abandona: nombre y correo
                         'cem_compras_invitado_pendientes',  -- compras por confirmar
                         'cem_compra_invitado_rechazar',     -- rechazar una compra
                         'cem_mi_siguiente_paso')            -- el panel del estudiante
  loop
    execute format('revoke execute on function %s from public', r.f);
    execute format('revoke execute on function %s from anon',   r.f);
    execute format('grant  execute on function %s to authenticated', r.f);
    execute format('grant  execute on function %s to service_role',  r.f);
  end loop;
end $$;

-- LO QUE NO SE TOCA, Y POR QUÉ.
-- El aviso señala 47 funciones ejecutables por `anon`. Once de ellas son los
-- predicados de permiso —cem_is_staff, cem_can_read_all, cem_es_auditor…— y
-- retirarles el permiso parecía lo obvio. No lo es: se miró qué políticas los
-- llaman, contando también las concedidas a PUBLIC, que alcanzan a anon aunque
-- no lo nombren. cem_es_auditor sale en 123 de ellas; cem_can_read_all, en
-- siete, entre ellas `cem_courses_read` — la política con la que el catálogo
-- público lee los cursos.
--
-- Sin permiso de ejecución, esa consulta no devolvería cero filas: daría un
-- error de permisos. El catálogo se caería para todo el que no haya entrado.
-- Los predicados no filtran nada por sí solos —a anon le devuelven falso—, así
-- que dejarlos abiertos no expone ningún dato. Se quedan.
--
-- Tampoco se tocan las de otros proyectos que comparten esta base
-- (quotes, pm_*, forest_*): son la API de un producto ajeno en marcha.


-- ── 3 · que las políticas no pregunten «quién eres» una vez por fila ────────
-- Escrito `auth.uid() = profile_id`, Postgres llama a auth.uid() para CADA
-- fila que examina. Envuelto en un select se calcula una vez y se compara
-- contra todas. El resultado es idéntico, letra por letra.
--
-- Se hace con un recorrido y no a mano por dos razones: eran 48 políticas en
-- 31 tablas, y así vuelve a pasar solo sobre cualquier política nueva que
-- alguien escriba de la manera lenta.
do $$
declare r record; nq text; nw text; sql text;
begin
  for r in
    select p.polname, p.polrelid::regclass as tabla,
           pg_get_expr(p.polqual, p.polrelid)      as usando,
           pg_get_expr(p.polwithcheck, p.polrelid) as comprobando
      from pg_policy p
      join pg_class c on c.oid = p.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and coalesce(pg_get_expr(p.polqual,p.polrelid),'')
        || coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'')
           ~* '(?<!SELECT )auth\.(uid|role|jwt)\(\)'
  loop
    -- La «i» del final importa: ya reescrita, Postgres la vuelve a enseñar
    -- como «( SELECT auth.uid() AS uid)», en mayúsculas. Sin ignorarlas, el
    -- guardia no la reconocería y la envolvería una segunda vez.
    nq := regexp_replace(r.usando,      '(?<!SELECT )auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'gi');
    nw := regexp_replace(r.comprobando, '(?<!SELECT )auth\.(uid|role|jwt)\(\)', '(select auth.\1())', 'gi');
    sql := format('alter policy %I on %s', r.polname, r.tabla);
    if nq is not null then sql := sql || format(' using (%s)', nq); end if;
    if nw is not null then sql := sql || format(' with check (%s)', nw); end if;
    begin
      execute sql;
    exception when others then
      raise warning 'No se pudo reescribir %.%: %', r.tabla, r.polname, sqlerrm;
    end;
  end loop;
end $$;
