-- Una visita con un curso que no existe no es un error: es una visita.
--
-- `cem_visita_anotar` recibía como curso lo que la página tuviera en `?id=`,
-- y en verificar.html eso es el identificador de un certificado. La base
-- rechazaba la fila entera por la clave ajena (409 en la consola) y las
-- visitas a los certificados —gente comprobando un título, que es el
-- visitante más valioso— no se contaban. Ahora un curso que no exista se
-- anota como «sin curso» en vez de tirar la visita.
create or replace function public.cem_visita_anotar(
  p_pantalla text, p_course_id uuid default null, p_canal text default null, p_campana text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_canal text; v_pantalla text; v_campana text; v_curso uuid;
begin
  v_pantalla := lower(left(regexp_replace(coalesce(p_pantalla, 'web'), '[^a-zA-Z0-9_/-]', '', 'g'), 40));
  v_pantalla := trim(both '/' from v_pantalla);
  if v_pantalla = '' then v_pantalla := 'web'; end if;

  v_curso := case when p_course_id is not null
                   and exists (select 1 from cem_courses c where c.id = p_course_id)
                  then p_course_id end;

  v_canal := lower(btrim(coalesce(p_canal, '')));
  v_canal := case
    when v_canal = '' then 'directo'
    when v_canal ~ 'google|bing|duckduck' then 'buscador'
    when v_canal ~ 'instagram|^ig$' then 'instagram'
    when v_canal ~ 'facebook|^fb$' then 'facebook'
    when v_canal ~ 'tiktok' then 'tiktok'
    when v_canal ~ 'whatsapp|^wa$' then 'whatsapp'
    when v_canal ~ 'youtube' then 'youtube'
    when v_canal ~ 'linkedin' then 'linkedin'
    when v_canal ~ 'mail|correo|newsletter' then 'correo'
    when v_canal ~ 'manychat|recurso' then 'recurso'
    else left(regexp_replace(v_canal, '[^a-z0-9_-]', '', 'g'), 24)
  end;
  if v_canal = '' then v_canal := 'directo'; end if;

  v_campana := nullif(left(regexp_replace(coalesce(p_campana,''), '[^a-zA-Z0-9_ -]', '', 'g'), 40), '');

  /* Un tope por si alguien decide inflar el contador. No protege de mucho
     —es un contador público— pero evita que una sola fuente escriba millones
     de filas y deje la tabla inservible para leerla. */
  if not cem_rate_limit_consumir('visita:' || v_pantalla, 600, 60, 60) then
    return;
  end if;

  insert into cem_visitas as v (dia, pantalla, course_id, canal, campana, cuantas)
  values (current_date, v_pantalla, v_curso, v_canal, v_campana, 1)
  on conflict (dia, pantalla, canal,
               coalesce(course_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(campana, ''))
    do update set cuantas = v.cuantas + 1;
end;
$$;
