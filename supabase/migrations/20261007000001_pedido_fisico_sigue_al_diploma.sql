-- El pedido de diploma en físico va con el diploma, no con una versión de él.
--
-- Corregir un certificado (un nombre mal escrito, la tipografía) no lo cambia:
-- marca el de antes como «reemplazado» y emite uno nuevo con su propio QR. Los
-- pedidos de diploma en físico seguían apuntando al de antes, y como sólo se
-- dibuja lo vigente, en «Diplomas en físico» salía «Ese documento ya no está
-- vigente, así que no se dibuja» — justo en pedidos que estaban en imprenta.
-- Se vio el 7 de octubre de 2026 con dos pedidos, los dos con una versión
-- vigente más nueva.

-- 1. Desde ahora, reemplazar un certificado mueve también su pedido. Se
--    conserva la comprobación de que sólo el equipo reemplaza (20261006000001).
create or replace function public.replace_cert_certificate(p_id uuid, p_datos jsonb)
returns public.cert_certificates
language plpgsql security definer set search_path = public as $$
declare
  vieja public.cert_certificates;
  nueva public.cert_certificates;
begin
  if not (cem_is_staff() or is_cert_admin()) then
    raise exception 'Sólo el equipo puede reemplazar un certificado.' using errcode = '42501';
  end if;

  select * into vieja from public.cert_certificates where id = p_id;
  if vieja.id is null then
    raise exception 'Certificado no encontrado';
  end if;
  if vieja.estado = 'reemplazado' then
    raise exception 'Este certificado ya fue reemplazado antes';
  end if;

  update public.cert_certificates
    set estado = 'reemplazado', updated_at = now()
    where id = p_id;

  insert into public.cert_certificates
    (id, datos, entidad_emisora, lote_id, created_by, plantilla_nombre, reemplaza_a, estado)
  values
    (gen_random_uuid(), coalesce(p_datos, vieja.datos), vieja.entidad_emisora, vieja.lote_id,
     coalesce(auth.jwt() ->> 'email', 'sin-login'), vieja.plantilla_nombre, p_id, 'vigente')
  returning * into nueva;

  /* El pedido en físico, si lo hay, pasa a la versión nueva: lo que se
     imprime es el diploma corregido. No se toca nada más del pedido —ni su
     estado, ni su nota, ni la fecha de su última anotación—. */
  update public.cem_diploma_fisico d
     set certificado_id = nueva.id
   where d.certificado_id = p_id
     and not exists (select 1 from public.cem_diploma_fisico o
                      where o.profile_id = d.profile_id and o.certificado_id = nueva.id);

  return nueva;
end;
$$;
revoke all on function public.replace_cert_certificate(uuid, jsonb) from public, anon;
grant execute on function public.replace_cert_certificate(uuid, jsonb) to authenticated;

-- 2. Los pedidos que ya se quedaron atrás: cada uno pasa a la última versión
--    vigente de su diploma, siguiendo la cadena de reemplazos. Los de un
--    certificado anulado (no reemplazado) no se tocan: ésos no tienen versión
--    buena a la que ir, y que lo diga la pantalla es lo correcto.
with recursive cadena as (
  select d.id as pedido, d.profile_id, d.certificado_id as actual, 0 as saltos
    from public.cem_diploma_fisico d
    join public.cert_certificates c on c.id = d.certificado_id
   where c.estado = 'reemplazado'
  union all
  select k.pedido, k.profile_id, n.id, k.saltos + 1
    from cadena k
    join public.cert_certificates n on n.reemplaza_a = k.actual
   where k.saltos < 50
), destino as (
  select distinct on (k.pedido) k.pedido, k.profile_id, k.actual
    from cadena k
    join public.cert_certificates z on z.id = k.actual
   where z.estado = 'vigente' and k.saltos > 0
   order by k.pedido, k.saltos desc
)
update public.cem_diploma_fisico d
   set certificado_id = x.actual
  from destino x
 where d.id = x.pedido
   and not exists (select 1 from public.cem_diploma_fisico o
                    where o.profile_id = x.profile_id and o.certificado_id = x.actual);

-- 3. `regenerate_certificate` hacía lo mismo que replace_cert_certificate, sin
--    comprobar quién llama (el agujero que se cerró en 20261006000001) y sin
--    mover el pedido en físico. Ninguna pantalla ni función la usa ya: se
--    queda sólo para el servidor, no para cualquier sesión.
revoke all on function public.regenerate_certificate(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.regenerate_certificate(uuid, jsonb) to service_role;
