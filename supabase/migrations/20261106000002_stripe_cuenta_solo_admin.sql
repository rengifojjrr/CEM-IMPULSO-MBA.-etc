-- Cambiar en qué cuenta de Stripe cobra un programa: sólo un administrador.
--
-- La ficha del programa la edita también coordinación, y eso está bien para el
-- nombre, el temario o el precio. Pero decir en qué cuenta se cobra es decir a
-- qué empresa va el dinero, y eso es de la misma familia que «tocar la
-- integración bancaria», que es sólo de admin y superadmin (ver el comentario
-- de cem_es_admin).
--
-- Se comprueba aquí y no sólo en la pantalla: la ficha guarda con un update
-- directo a cem_courses, y una regla que sólo vive en el navegador no es una
-- regla.
--
-- Sin sesión (auth.uid() vacío) es el propio servidor —una migración, una
-- tarea programada—, y eso sí puede.

create or replace function public.cem_tg_curso_cuenta_stripe()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.stripe_cuenta := nullif(lower(trim(coalesce(new.stripe_cuenta, ''))), '');

  if (tg_op = 'INSERT' and new.stripe_cuenta is not null
      or tg_op = 'UPDATE' and new.stripe_cuenta is distinct from old.stripe_cuenta)
     and auth.uid() is not null and not cem_es_admin() then
    raise exception 'Sólo un administrador puede cambiar en qué cuenta de Stripe se cobra un programa.'
      using errcode = '42501';
  end if;

  if new.stripe_cuenta is not null and not exists (
       select 1 from cem_integraciones
        where id = 'stripe:' || new.stripe_cuenta
          and nullif(datos->>'secret_key', '') is not null
          and nullif(datos->>'publishable_key', '') is not null) then
    raise exception 'La cuenta de Stripe «%» no existe o le faltan las claves. Configúrala antes en Admin → Cobros con tarjeta → Otras empresas.',
      new.stripe_cuenta;
  end if;

  if tg_op = 'UPDATE' and new.stripe_cuenta is distinct from old.stripe_cuenta then
    new.stripe_product_id := null;
    new.stripe_sync_error := null;
    new.stripe_sync_peticion := null;
  end if;
  return new;
end $$;
revoke all on function public.cem_tg_curso_cuenta_stripe() from public, anon, authenticated;
