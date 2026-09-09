-- La constancia de fe de erratas, al lado del diploma de quien la necesita.
--
-- Los diplomas impresos dicen «Titular de la cédula de indentidad». La errata
-- se corrigió en las plantillas, así que lo que se dibuja hoy está bien y lo
-- que está mal es el PAPEL que 143 personas ya tienen en la mano. Un papel
-- impreso no se corrige con un despliegue.
--
-- La escuela emitió una constancia oficial que explica el error y ratifica que
-- no afecta a la validez del título. Esto decide a quién se le enseña.
--
-- La regla es por fecha y no una lista de nombres, por dos razones. Una: una
-- lista de 143 identificadores metida en el código envejece mal y nadie se
-- acuerda de por qué está. Dos: lo que de verdad separa a quien necesita la
-- constancia de quien no es CUÁNDO se imprimió su diploma — los que se emitan a
-- partir de ahora salen ya con «identidad» y no les hace falta ninguna
-- constancia. Una fecha dice eso exactamente; una lista sólo lo dice hoy.

insert into public.cem_settings (clave, valor, descripcion) values
  ('fe_erratas_diplomas_hasta', '"2026-09-08"'::jsonb,
   'Los diplomas emitidos hasta este día (inclusive) se imprimieron con la errata «indentidad» y llevan la constancia. Los posteriores ya no.'),
  ('fe_erratas_fecha', '"2026-09-09"'::jsonb,
   'La fecha con la que se extiende la constancia de fe de erratas. Es un acto institucional único: la misma para todos, no la del día en que cada quien la descarga.')
on conflict (clave) do nothing;

-- Cambia el tipo devuelto (una columna más), y eso CREATE OR REPLACE no lo
-- admite: hay que quitarla y volver a crearla.
drop function if exists public.cem_mis_certificados_de_egresado();

create function public.cem_mis_certificados_de_egresado()
returns table (
  id          uuid,
  titulo      text,
  programa    text,
  es_diploma  boolean,
  nombre      text,
  cedula      text,
  emitido_en  timestamptz,
  plantilla   text,
  fe_erratas  boolean
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_ced text; v_hasta date;
begin
  select nullif(regexp_replace(coalesce(p.documento, ''), '[^0-9]', '', 'g'), '')
    into v_ced
    from public.cem_profiles p
   where p.id = auth.uid();

  if v_ced is null then return; end if;

  select coalesce((select (valor #>> '{}')::date from cem_settings
                    where clave = 'fe_erratas_diplomas_hasta'),
                  '1900-01-01'::date)
    into v_hasta;

  return query
    select c.id,
           public.cert_titulo_bonito(c.plantilla_nombre),
           case when t.config->>'carpeta' in ('iA', 'diplomas editables') then 'IA'
                when t.config->>'carpeta' in ('MKT', '')                 then 'Marketing'
                when t.config->>'carpeta' = 'exitus'                     then 'Exitus'
                else 'Otro' end,
           c.plantilla_nombre ilike '%DIPLOMAS EDITABLE%'
             or c.plantilla_nombre ilike 'FORMATO_DIPLOMA%',
           coalesce(c.datos->>'Nombre', c.datos->>'nombre'),
           coalesce(c.datos->>'Cédula', c.datos->>'cedula', c.datos->>'Cedula'),
           c.created_at,
           c.plantilla_nombre,
           -- Sólo los diplomas, y sólo los que ya estaban impresos.
           (c.plantilla_nombre ilike '%DIPLOMAS EDITABLE%'
             or c.plantilla_nombre ilike 'FORMATO_DIPLOMA%')
             and c.created_at::date <= v_hasta
      from public.cert_certificates c
      left join public.cert_templates t on t.nombre = c.plantilla_nombre
     where c.estado = 'vigente'
       and public.cert_cedula_plana(c.datos) = v_ced
     order by (c.plantilla_nombre ilike '%DIPLOMAS EDITABLE%') desc,
              c.plantilla_nombre;
end;
$function$;

revoke all on function public.cem_mis_certificados_de_egresado() from public, anon;
grant execute on function public.cem_mis_certificados_de_egresado() to authenticated;

-- La fecha de la constancia, para que la pantalla no tenga que leer la tabla de
-- ajustes entera —que la puede leer cualquiera— sólo para saber un día.
create or replace function public.cem_fecha_fe_de_erratas()
returns date
language sql stable security definer set search_path to 'public'
as $$
  select coalesce((select (valor #>> '{}')::date from cem_settings
                    where clave = 'fe_erratas_fecha'), current_date);
$$;

revoke all on function public.cem_fecha_fe_de_erratas() from public, anon;
grant execute on function public.cem_fecha_fe_de_erratas() to authenticated;
