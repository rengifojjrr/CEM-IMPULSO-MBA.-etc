-- La promoción, en grande y donde llega la gente.
--
-- 1. LO QUE NECESITA LA FRANJA
--    La franja nueva de las páginas públicas (plataforma/assets/promo.js) dice
--    «10 % OFF en todos los programas» o «… en el Diplomado de Marketing
--    Digital». Para lo segundo hace falta el nombre del programa, que
--    cem_campana_para no devolvía. Todo lo demás, igual: sólo campañas
--    encendidas, dentro de fechas, con cupo, y para la pantalla que pregunta.
create or replace function public.cem_campana_para(p_pantalla text default null)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when c.id is null then null else jsonb_build_object(
    'codigo', c.codigo, 'tipo', c.tipo,
    'titular', c.titular, 'explicacion', c.explicacion,
    'boton', coalesce(nullif(btrim(c.boton), ''), 'Lo quiero'),
    'premio_tipo', c.premio_tipo, 'premio_valor', c.premio_valor,
    'premio_texto', c.premio_texto,
    'empieza_en', c.empieza_en,
    'termina_en', c.termina_en,
    /* El programa, si la campaña es de uno. Sin él, es de todos. */
    'programa', (select k.nombre from cem_courses k where k.id = c.course_id),
    /* Plazas restantes, sólo si hay cupo. Nunca un número inventado. */
    'quedan', case when c.cupo is null then null
      else greatest(c.cupo - (select count(*) from cem_premios p
                               where p.campana_id = c.id and p.estado <> 'anulado'), 0) end
  ) end
  from cem_campanas c
  where c.activa
    and (c.empieza_en is null or c.empieza_en <= now())
    and (c.termina_en is null or c.termina_en > now())
    and (cardinality(c.pantallas) = 0
         or coalesce(btrim(p_pantalla), '') = any(c.pantallas))
    /* Con el cupo agotado deja de ofrecerse sola. Prometer una plaza que ya
       no existe es la manera más rápida de que no te crean la siguiente. */
    and (c.cupo is null
         or (select count(*) from cem_premios p
              where p.campana_id = c.id and p.estado <> 'anulado') < c.cupo)
  order by c.created_at desc
  limit 1;
$$;
-- Pública a propósito: la lee cualquier visitante para saber si hay oferta.
grant execute on function public.cem_campana_para(text) to anon, authenticated;

-- 2. LAS DEL EQUIPO, SÓLO CON SESIÓN
--    Todas comprueban por dentro que quien llama es del equipo, así que no
--    había agujero. Pero el patrón de la casa es que lo del equipo ni siquiera
--    se pueda llamar sin sesión: una comprobación de menos el día que alguien
--    reescriba una de éstas no puede convertirse en una puerta abierta.
revoke all on function public.cem_campana_guardar(uuid, text, text, text, text, numeric, text, text, text, text, text, integer, text[], uuid, timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.cem_campana_guardar(uuid, text, text, text, text, numeric, text, text, text, text, text, integer, text[], uuid, timestamptz, timestamptz, boolean) to authenticated;

revoke all on function public.cem_campana_borrar(uuid) from public, anon;
grant execute on function public.cem_campana_borrar(uuid) to authenticated;

revoke all on function public.cem_campanas_listar() from public, anon;
grant execute on function public.cem_campanas_listar() to authenticated;

revoke all on function public.cem_premios_listar(uuid) from public, anon;
grant execute on function public.cem_premios_listar(uuid) to authenticated;

revoke all on function public.cem_premio_canjear(text, text) from public, anon;
grant execute on function public.cem_premio_canjear(text, text) to authenticated;
