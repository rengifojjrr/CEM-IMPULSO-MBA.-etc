-- Que verificar un certificado enseñe el certificado.
--
-- `certificados/verificar.html` es a donde apunta el QR impreso en los 650 y
-- pico documentos que la escuela ha emitido. O sea: es lo que ve una empresa
-- que acaba de escanear el diploma de un candidato. Enseñaba una tabla con los
-- nombres de campo en crudo, y ni una vez el documento.
--
-- Para dibujarlo hace falta la plantilla, y `cert_templates` sólo la lee el
-- equipo. Ésta es la puerta para el caso público, y es estrecha a propósito:
--
--   · Se pide POR EL CÓDIGO DE UN CERTIFICADO, nunca por el nombre de una
--     plantilla. No hay forma de listarlas ni de enumerarlas: el código es un
--     UUID, y el único sitio donde está escrito es el propio documento.
--   · Sólo devuelve los VIGENTES. Un certificado anulado se sigue pudiendo
--     verificar —hace falta, para que quien tenga el papel en la mano se entere
--     de que ya no vale— pero de ése no se entrega imagen: sería darle a
--     cualquiera una copia impecable de un documento que la escuela retiró.
--
-- Lo que queda expuesto es la lámina de un certificado a quien ya tiene su
-- código; es decir, a quien lo tiene delante. Que es exactamente para lo que
-- existe una página de verificación.

create or replace function public.cert_publico_para_dibujar(p_id uuid)
returns table (
  id          uuid,
  datos       jsonb,
  plantilla   text,
  titulo      text,
  config      jsonb,
  emitido_en  timestamptz
)
language sql
stable security definer
set search_path to 'public'
as $function$
  select c.id, c.datos, c.plantilla_nombre,
         public.cert_titulo_bonito(c.plantilla_nombre),
         t.config, c.created_at
    from public.cert_certificates c
    join public.cert_templates t on t.nombre = c.plantilla_nombre
   where c.id = p_id
     and c.estado = 'vigente';
$function$;

comment on function public.cert_publico_para_dibujar(uuid) is
  'Lo necesario para dibujar un certificado vigente, por su código. Público: es a donde lleva el QR impreso.';

revoke all on function public.cert_publico_para_dibujar(uuid) from public;
grant execute on function public.cert_publico_para_dibujar(uuid) to anon, authenticated;
