-- Que el verificador diga el nombre del título y no el del archivo.
--
-- La pantalla de comprobación enseñaba, en la fila «Certificado»,
-- «DIPLOMAS EDITABLE 2026 DIPLOMADO CEM_agosto». Eso es el nombre de la
-- plantilla en el disco: sirve para el equipo y no significa nada para quien
-- está comprobando un título — que muchas veces es una empresa mirando a un
-- candidato. `cert_titulo_bonito` existe justo para traducirlo y no se estaba
-- usando aquí.
--
-- Se cambia en las dos ramas que devuelven certificados del generador —la que
-- busca por código y la que busca por cédula— y se añade `plantilla` con el
-- nombre real, que la pantalla del equipo sí puede querer.
--
-- Comprobado con los 10 certificados de una persona: antes salían ocho nombres
-- de archivo del tipo «8_IA_ILLUSTRATOR»; ahora salen «Illustrator»,
-- «Photoshop», «Branding» y los dos diplomados por su nombre completo.

create or replace function public.cem_verificar(p_texto text)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $function$
declare
  v_q text := btrim(coalesce(p_texto, ''));
  v_uno jsonb; v_lista jsonb; v_ced text;
begin
  if v_q = '' then return jsonb_build_object('hay', false); end if;

  -- 1 · ¿Un código de la plataforma?
  select cem_verify_certificate(v_q) into v_uno;
  if v_uno is not null and (v_uno ->> 'codigo') is not null then
    return jsonb_build_object('hay', true, 'de', 'plataforma',
                              'certificados', jsonb_build_array(v_uno));
  end if;

  -- 2 · ¿El identificador de un certificado del generador?
  if v_q ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select jsonb_build_array(jsonb_build_object(
             'codigo', c.id,
             -- El nombre que se le enseña a una persona, no el del archivo.
             'titulo', cert_titulo_bonito(c.plantilla_nombre),
             'plantilla', c.plantilla_nombre,
             'estudiante', cert_nombre_de(c.datos),
             'cedula', cert_cedula_bonita(cert_cedula_plana(c.datos)),
             'curso', coalesce(l.nombre, c.entidad_emisora),
             'emitido_en', c.created_at,
             'estado', c.estado,
             'anulado', c.estado not in ('vigente', 'reemplazado'),
             'reemplazado', c.estado = 'reemplazado',
             -- Cuál es el que vale ahora, para poder ir a él.
             'sustituto', (select n.id from cert_certificates n
                            where n.reemplaza_a = c.id and n.estado = 'vigente' limit 1),
             'anulado_motivo', c.motivo_revocacion))
      into v_lista
      from cert_certificates c
      left join cert_lotes l on l.id = c.lote_id
     where c.id = v_q::uuid;
    if v_lista is not null then
      return jsonb_build_object('hay', true, 'de', 'generador', 'certificados', v_lista);
    end if;
  end if;

  -- 3 · ¿Una cédula? Se compara sin puntos ni guiones ni la letra de delante,
  --     porque nadie la escribe dos veces igual.
  v_ced := regexp_replace(upper(v_q), '[^0-9]', '', 'g');
  if length(v_ced) between 6 and 12 then
    select jsonb_agg(jsonb_build_object(
             'codigo', c.id,
             'titulo', cert_titulo_bonito(c.plantilla_nombre),
             'plantilla', c.plantilla_nombre,
             'estudiante', cert_nombre_de(c.datos),
             'cedula', cert_cedula_bonita(cert_cedula_plana(c.datos)),
             'curso', coalesce(l.nombre, c.entidad_emisora),
             'emitido_en', c.created_at,
             'estado', c.estado,
             'anulado', c.estado <> 'vigente',
             'anulado_motivo', c.motivo_revocacion)
           order by c.created_at desc)
      into v_lista
      from cert_certificates c
      left join cert_lotes l on l.id = c.lote_id
     where cert_cedula_plana(c.datos) = v_ced
       /* Los reemplazados fuera: el que los sustituye ya sale en esta misma
          lista, y enseñar los dos hace pensar en un problema donde no lo hay. */
       and c.estado <> 'reemplazado';
    if v_lista is not null then
      return jsonb_build_object('hay', true, 'de', 'generador',
                                'por_cedula', true, 'certificados', v_lista);
    end if;
  end if;

  return jsonb_build_object('hay', false);
end;
$function$;
