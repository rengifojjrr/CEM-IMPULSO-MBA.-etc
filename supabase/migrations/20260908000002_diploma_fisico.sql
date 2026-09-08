-- Pedir el diploma en físico, gratis durante un plazo.
--
-- La idea: quien lo quiera impreso que lo pida ya. Durante un mes la imprenta
-- y el envío los pone la escuela; pasado el plazo, los paga quien lo pide.
-- El plazo empuja a que la gente conteste ahora, que es cuando la escuela
-- puede juntar los pedidos en una sola tirada y le sale a cuenta.
--
-- Dos decisiones que importan:
--
-- 1. Si el pedido entra gratis o no lo decide el SERVIDOR, mirando su reloj,
--    en el momento de guardar. Nunca el navegador. Si el precio dependiera de
--    lo que diga el cliente, bastaría con cambiar la fecha del ordenador.
--
-- 2. La condición se guarda EN EL PEDIDO, no se recalcula al leerlo. Quien
--    pidió dentro del plazo lo pidió gratis para siempre, aunque el pedido se
--    imprima dos meses después o alguien mueva la fecha límite.

insert into public.cem_settings (clave, valor, descripcion) values
  ('diploma_fisico_gratis_hasta', to_jsonb((current_date + 30)::text),
   'Hasta qué día (inclusive) se puede pedir el diploma impreso sin pagar. Después, el pedido queda marcado como de pago.'),
  ('diploma_fisico_precio', '"Imprenta y envío según destino"'::jsonb,
   'Lo que se le dice a quien pide fuera de plazo. Texto libre: puede ser un precio o «te lo cotizamos».')
on conflict (clave) do nothing;

create table if not exists public.cem_diploma_fisico (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.cem_profiles(id) on delete cascade,
  certificado_id  uuid not null,          -- el de cert_certificates que se quiere en papel
  cedula          text not null,
  nombre          text not null,
  titulo          text not null,          -- copiado, para que el pedido se lea sin más consultas
  telefono        text not null,
  direccion       text not null,
  ciudad          text,
  pais            text,
  -- Lo decide el servidor al guardar, y ya no cambia.
  gratis          boolean not null,
  gratis_hasta    date,                   -- el plazo que regía ese día, para poder explicarlo después
  estado          text not null default 'pedido'
                  check (estado in ('pedido','en imprenta','enviado','entregado','anulado')),
  nota            text,
  pedido_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),
  unique (profile_id, certificado_id)     -- que no se pida dos veces lo mismo
);

comment on table public.cem_diploma_fisico is
  'Pedidos de diploma o certificado impreso. «gratis» lo fija el servidor al guardar y no se recalcula.';

create index if not exists cem_diploma_fisico_estado_idx on public.cem_diploma_fisico (estado, pedido_en desc);

alter table public.cem_diploma_fisico enable row level security;
revoke all on public.cem_diploma_fisico from public, anon, authenticated;

-- ── Cuánto queda de plazo ───────────────────────────────────────────────────
create or replace function public.cem_plazo_diploma_fisico()
returns table (gratis_hasta date, dias_restantes int, aun_gratis boolean, precio text)
language sql stable security definer set search_path to 'public'
as $$
  select h.d,
         greatest(0, (h.d - current_date))::int,
         current_date <= h.d,
         coalesce((select valor #>> '{}' from cem_settings where clave = 'diploma_fisico_precio'),
                  'Imprenta y envío según destino')
    from (select coalesce(
            (select (valor #>> '{}')::date from cem_settings where clave = 'diploma_fisico_gratis_hasta'),
            current_date - 1) as d) h;
$$;

-- ── Pedirlo ─────────────────────────────────────────────────────────────────
create or replace function public.cem_pedir_diploma_fisico(
  p_certificado_id uuid, p_telefono text, p_direccion text,
  p_ciudad text default null, p_pais text default null)
returns public.cem_diploma_fisico
language plpgsql volatile security definer set search_path to 'public'
as $function$
declare
  v_ced text; v_cert record; v_hasta date; v_gratis boolean; v_fila cem_diploma_fisico;
begin
  select nullif(regexp_replace(coalesce(p.documento, ''), '[^0-9]', '', 'g'), '')
    into v_ced from cem_profiles p where p.id = auth.uid();
  if v_ced is null then
    raise exception 'Para pedirlo en físico hace falta tener tu cédula puesta en Mis datos.';
  end if;
  if nullif(trim(coalesce(p_telefono,'')), '') is null
     or nullif(trim(coalesce(p_direccion,'')), '') is null then
    raise exception 'Hacen falta un teléfono y una dirección para poder enviarlo.';
  end if;

  -- Que el certificado sea suyo de verdad: se comprueba contra su cédula, no
  -- contra lo que diga el navegador.
  select c.id,
         coalesce(c.datos->>'Nombre', c.datos->>'nombre') as nombre,
         cert_titulo_bonito(c.plantilla_nombre) as titulo
    into v_cert
    from cert_certificates c
   where c.id = p_certificado_id
     and c.estado = 'vigente'
     and cert_cedula_plana(c.datos) = v_ced;
  if v_cert.id is null then
    raise exception 'Ese documento no está a tu nombre.';
  end if;

  -- El reloj es el del servidor. Aquí se decide, y ya no se vuelve a mirar.
  select gratis_hasta, aun_gratis into v_hasta, v_gratis from cem_plazo_diploma_fisico();

  insert into cem_diploma_fisico (profile_id, certificado_id, cedula, nombre, titulo,
                                  telefono, direccion, ciudad, pais, gratis, gratis_hasta)
       values (auth.uid(), p_certificado_id, v_ced, v_cert.nombre, v_cert.titulo,
               trim(p_telefono), trim(p_direccion), nullif(trim(coalesce(p_ciudad,'')),''),
               nullif(trim(coalesce(p_pais,'')),''), v_gratis, v_hasta)
  on conflict (profile_id, certificado_id) do update
       set telefono = excluded.telefono, direccion = excluded.direccion,
           ciudad = excluded.ciudad, pais = excluded.pais,
           actualizado_en = now()
       -- Ojo: «gratis» NO se toca al corregir la dirección. Quien pidió dentro
       -- de plazo lo tiene ganado aunque corrija sus datos un mes después.
    returning * into v_fila;
  return v_fila;
end;
$function$;

-- ── Lo que ya pedí ──────────────────────────────────────────────────────────
create or replace function public.cem_mis_pedidos_fisicos()
returns setof public.cem_diploma_fisico
language sql stable security definer set search_path to 'public'
as $$ select * from cem_diploma_fisico where profile_id = auth.uid() order by pedido_en desc; $$;

-- ── Lo que ve el equipo ─────────────────────────────────────────────────────
create or replace function public.cem_admin_pedidos_fisicos()
returns setof public.cem_diploma_fisico
language plpgsql stable security definer set search_path to 'public'
as $function$
begin
  perform cert_exigir_gestor();
  return query select * from cem_diploma_fisico order by (estado = 'pedido') desc, pedido_en;
end;
$function$;

create or replace function public.cem_pedido_fisico_estado(p_id uuid, p_estado text, p_nota text default null)
returns public.cem_diploma_fisico
language plpgsql volatile security definer set search_path to 'public'
as $function$
declare v_fila cem_diploma_fisico;
begin
  perform cert_exigir_gestor();
  update cem_diploma_fisico
     set estado = p_estado, nota = coalesce(p_nota, nota), actualizado_en = now()
   where id = p_id returning * into v_fila;
  if v_fila.id is null then raise exception 'Ese pedido no existe.'; end if;
  return v_fila;
end;
$function$;

revoke all on function public.cem_plazo_diploma_fisico()                    from public, anon;
revoke all on function public.cem_pedir_diploma_fisico(uuid,text,text,text,text) from public, anon;
revoke all on function public.cem_mis_pedidos_fisicos()                     from public, anon;
revoke all on function public.cem_admin_pedidos_fisicos()                   from public, anon;
revoke all on function public.cem_pedido_fisico_estado(uuid,text,text)      from public, anon;
grant execute on function public.cem_plazo_diploma_fisico()                    to authenticated;
grant execute on function public.cem_pedir_diploma_fisico(uuid,text,text,text,text) to authenticated;
grant execute on function public.cem_mis_pedidos_fisicos()                     to authenticated;
grant execute on function public.cem_admin_pedidos_fisicos()                   to authenticated;
grant execute on function public.cem_pedido_fisico_estado(uuid,text,text)      to authenticated;
