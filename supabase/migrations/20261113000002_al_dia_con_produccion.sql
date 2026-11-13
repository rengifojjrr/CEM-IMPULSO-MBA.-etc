-- Al día con producción (13 de noviembre de 2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- Lo que producción tiene y la reconstrucción no, sin que lo traiga ninguna
-- migración: se hizo con SQL suelto (sin apply_migration, así que tampoco está
-- en el historial de producción) o el volcador lo dejó fuera. Salió al comparar
-- objeto por objeto la reconstrucción con producción, sólo leyendo. Lo de aquí
-- es lo que producción tiene HOY, sacado de su catálogo.
--
-- Lo que NO está, a propósito (detalle en docs/lo-que-falta.md):
--   · El añadido que cem_handle_new_user lleva en producción desde el 26 de
--     septiembre (kkg_separar_de_cem): lee public.kkg_administradores, una
--     tabla de OTRO proyecto. Copiado aquí, cada alta reventaría en una base
--     sin ese proyecto.
--   · Las 35 funciones cuyo cuerpo sólo difiere en comentarios, espacios o el
--     texto de un mensaje (tildes): la lógica es la misma, y la versión del
--     repo es la buena.

-- 1. cem_temario_publico — se creó el 1 de septiembre (commit ddcf3c5) con SQL
--    suelto, así que no está en el historial. Es su definición de hoy, tal cual
--    la devuelve pg_get_functiondef en producción. La usa herramientas/temario.mjs
--    para las páginas de programa.
CREATE OR REPLACE FUNCTION public.cem_temario_publico()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  /* El temario que la escuela ha impartido de verdad, en cifras y sin una sola
     persona dentro.
     ═════════════════════════════════════════════════════════════════════════
     Existe para que las páginas que lee Google se escriban con lo que la base
     SABE, y no con lo que a alguien le parezca. De cada módulo sale su
     diplomado, su orden, cuánta gente tiene ese certificado y en cuántas
     promociones se dio. Nada de esto identifica a nadie: son recuentos.

     Los certificados son públicos por definición —cualquiera puede verificar
     uno con su código—, así que agregarlos no descubre nada que no estuviera
     ya a la vista. */
  with m as (
    select split_part(plantilla_nombre,'_',1)::int as orden,
           split_part(plantilla_nombre,'_',2)      as familia,
           substring(plantilla_nombre from length(split_part(plantilla_nombre,'_',1))
                     + length(split_part(plantilla_nombre,'_',2)) + 3) as titulo,
           cert_cedula_plana(datos) as cedula,
           lote_id
      from cert_certificates
     where estado = 'vigente' and plantilla_nombre ~ '^[0-9]_(IA|MKT)_'
  ),
  modulos as (
    select familia, orden, titulo,
           count(distinct cedula)  as personas,
           count(distinct lote_id) as promociones
      from m group by 1,2,3
  ),
  dip as (
    select familia,
           jsonb_agg(jsonb_build_object('orden',orden,'titulo',titulo,
                                        'personas',personas,'promociones',promociones)
                     order by orden) as modulos,
           max(personas) as personas, max(promociones) as promociones
      from modulos group by familia
  )
  select jsonb_build_object(
    'diplomados', (select jsonb_agg(to_jsonb(dip) order by familia) from dip),
    'diplomas', (select jsonb_object_agg(k, n) from (
        select case when plantilla_nombre like '%INTELIGENCIA ARTIFICIAL%' then 'IA' else 'MKT' end as k,
               count(distinct cert_cedula_plana(datos)) as n
          from cert_certificates
         where estado='vigente' and plantilla_nombre like 'DIPLOMAS%'
         group by 1) t),
    'totales', jsonb_build_object(
        'certificados', (select count(*) from cert_certificates where estado='vigente'),
        'personas',     (select count(distinct cert_cedula_plana(datos))
                           from cert_certificates where estado='vigente'),
        'promociones',  (select count(distinct lote_id) from cert_certificates
                          where estado='vigente' and lote_id is not null))
  );
$function$;
revoke all on function public.cem_temario_publico() from public;
grant execute on function public.cem_temario_publico() to anon, authenticated, service_role;
comment on function public.cem_temario_publico() is
  'El temario impartido, en cifras agregadas y sin datos personales. Lo usa herramientas/generar-seo.mjs para escribir las páginas que lee Google.';

-- 2. El disparador que crea el perfil de cada cuenta nueva. Vive en auth.users,
--    y el volcador sólo lee public: nunca lo recogió. Sin él, en una
--    reconstrucción nadie que se registrara tendría perfil.
drop trigger if exists cem_on_auth_user_created on auth.users;
create trigger cem_on_auth_user_created
  after insert on auth.users
  for each row execute function public.cem_handle_new_user();

-- 3. Ocho funciones que producción deja ejecutar también a PUBLIC. El volcador
--    sólo escribe los permisos de anon, authenticated y service_role, así que
--    éste se perdía. No abre nada a quien llega por la API —anon ya las
--    ejecuta—: es para que la reconstrucción cuadre con producción.
grant execute on function public.cem_dicta_cohorte(uuid) to public;
grant execute on function public.cem_donde_pagar_publico() to public;
grant execute on function public.cem_esta_en_cohorte(uuid) to public;
grant execute on function public.cem_fecha_nacimiento_creible() to public;
grant execute on function public.cem_recibo_compra_invitado(uuid) to public;
grant execute on function public.cem_tasa_vigente(text) to public;
grant execute on function public.cem_verificar(text) to public;
grant execute on function public.cem_visita_anotar(text, uuid, text, text) to public;

-- 4. El comentario de cem_docente_quien_se_esta_yendo, que producción tiene y
--    ningún archivo traía.
comment on function public.cem_docente_quien_se_esta_yendo(integer) is
  'Estudiantes que llevan días sin entrar. Sólo profesorado (y sólo de SUS cohortes) o equipo.';
