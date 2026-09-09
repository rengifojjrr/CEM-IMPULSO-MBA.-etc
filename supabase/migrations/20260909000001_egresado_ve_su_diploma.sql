-- Que el egresado pueda VER su diploma, no sólo una lista que dice que existe.
--
-- Hasta ahora «Mis logros» le enseñaba el título y un botón «Ver» que llevaba a
-- una tarjeta de texto: «certificado válido», y debajo los datos en una tabla.
-- Correcto para comprobar, inútil para lo que la gente quiere, que es ver su
-- diploma.
--
-- El diploma no está guardado como imagen en ninguna parte: se DIBUJA cada vez,
-- juntando el fondo y las posiciones que guarda cert_templates con los datos que
-- guarda cert_certificates. Es a propósito, y es lo que permitió arreglar de
-- golpe los 19 certificados de Illustrator cambiando una sola dirección. Pero
-- tiene una consecuencia: sin la plantilla no hay diploma que enseñar, y
-- cert_templates sólo la puede leer el equipo.
--
-- Ésta es la puerta estrecha para eso: dado un certificado, devuelve sus datos y
-- la plantilla con la que se dibuja, PERO sólo si ese certificado lleva la
-- cédula de quien pregunta. No hay forma de pedir «dame la plantilla X»: se pide
-- «dame lo que hace falta para dibujar ESTE documento mío», y el servidor
-- comprueba que sea suyo antes de contestar. Quien no tenga cédula en su perfil,
-- o pregunte por un certificado ajeno, no recibe nada — ni siquiera se le dice
-- si existe.

create or replace function public.cem_mi_certificado_para_dibujar(p_id uuid)
returns table (
  id          uuid,
  datos       jsonb,
  plantilla   text,
  titulo      text,
  config      jsonb,
  emitido_en  timestamptz
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_ced text;
begin
  -- La misma regla que en todo lo demás: sólo dígitos, para que «V-27.826.482»
  -- y «27826482» sean la misma cédula.
  select nullif(regexp_replace(coalesce(p.documento, ''), '[^0-9]', '', 'g'), '')
    into v_ced
    from public.cem_profiles p
   where p.id = auth.uid();

  if v_ced is null then return; end if;

  return query
    select c.id,
           c.datos,
           c.plantilla_nombre,
           public.cert_titulo_bonito(c.plantilla_nombre),
           t.config,
           c.created_at
      from public.cert_certificates c
      join public.cert_templates t on t.nombre = c.plantilla_nombre
     where c.id = p_id
       and c.estado = 'vigente'
       -- La condición que lo sostiene todo: el certificado tiene que llevar SU
       -- cédula. No se acepta que el navegador diga de quién es.
       and public.cert_cedula_plana(c.datos) = v_ced;
end;
$function$;

comment on function public.cem_mi_certificado_para_dibujar(uuid) is
  'Datos y plantilla para dibujar un certificado, sólo si su cédula es la del perfil que llama.';

revoke all on function public.cem_mi_certificado_para_dibujar(uuid) from public, anon;
grant execute on function public.cem_mi_certificado_para_dibujar(uuid) to authenticated;
