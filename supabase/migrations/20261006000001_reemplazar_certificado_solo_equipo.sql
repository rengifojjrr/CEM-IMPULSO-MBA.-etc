-- Reemplazar un certificado es cosa del equipo.
--
-- `replace_cert_certificate` marca un certificado como «reemplazado» y emite
-- otro con los datos que reciba. Es SECURITY DEFINER y la podía ejecutar
-- cualquiera con sesión: un alumno, desde la consola del navegador, podía
-- anular el certificado de otra persona y emitir uno nuevo con el nombre y la
-- nota que quisiera, con su QR verificable. La pantalla que la usa sólo la
-- abren coordinación, administración y superadministración, pero eso lo decide
-- la pantalla, no la base.
--
-- Se vio el 6 de octubre de 2026, al añadir la tipografía por certificado al
-- diálogo de «Editar». Ahora la función comprueba ella misma quién llama, con
-- las dos llaves que ya usa el resto de lo de certificados: el equipo del
-- portal (cem_is_staff) y la cuenta administradora del generador
-- (is_cert_admin). Nada más cambia.
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

  return nueva;
end;
$$;
revoke all on function public.replace_cert_certificate(uuid, jsonb) from public, anon;
grant execute on function public.replace_cert_certificate(uuid, jsonb) to authenticated;
