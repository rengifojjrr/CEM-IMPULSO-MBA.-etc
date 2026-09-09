-- Los diplomas de la tanda, en la ficha que mira el equipo.
-- ============================================================================
-- Abres la ficha de Dylan Becerra, pestaña Certificados, y dice «Todavía no se
-- le ha emitido ningún certificado». Tiene nueve vigentes.
--
-- No es un dato perdido: es que en la casa hay DOS sistemas de certificados y
-- esa pestaña sólo mira uno.
--
--   · `cem_certificates`  — los de la plataforma. Salen de una inscripción que
--                           se termina, y van atados al `profile_id`.
--   · `cert_certificates` — los del generador. Son los 143 diplomas que se
--                           imprimieron, y NO tienen `profile_id`: se cruzan
--                           por la cédula que lleva el diploma dentro.
--
-- La pestaña consulta el primero por `profile_id`, y de los egresados de la
-- tanda ahí no hay nada. El propio estudiante SÍ los ve en «Mis logros»
-- —`cem_mis_certificados_de_egresado` cruza por su cédula— así que quedaba al
-- revés de como tiene que ser: el egresado veía sus diplomas y quien lo atiende
-- desde el equipo le decía que no tenía ninguno.
--
-- De las tres personas con diplomas en el generador, las tres salían a cero.
--
-- Por qué hace falta una función y no basta con consultar la tabla
-- ---------------------------------------------------------------
-- `cert_certificates` tiene una sola regla de lectura, `is_cert_admin()`, y esa
-- función está clavada a UN correo concreto. Nadie más —ni coordinación, ni
-- cobranza, ni la auditoría— puede leer esa tabla, ni debe poder leerla entera.
-- Así que esto es lo de siempre: una función `SECURITY DEFINER` que comprueba
-- ella misma quién pregunta y devuelve sólo lo de la persona por la que se
-- pregunta.

create or replace function public.cem_diplomas_de(p_profile_id uuid)
returns table (
  id          uuid,
  titulo      text,
  plantilla   text,
  cedula      text,
  nombre      text,
  emitido_en  timestamptz,
  estado      text,
  es_diploma  boolean
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_ced text;
begin
  -- Sólo el equipo. Un estudiante ya tiene lo suyo por otra puerta
  -- (`cem_mis_certificados_de_egresado`), y esa puerta no pregunta por nadie
  -- más: se atiene a `auth.uid()`. Ésta sí recibe de quién son los datos, y por
  -- eso lo primero que hace es comprobar quién está preguntando.
  if not public.cem_can_read_all() then
    raise exception 'No tienes permiso para ver los certificados de otra persona.';
  end if;

  select nullif(regexp_replace(coalesce(p.documento, ''), '[^0-9]', '', 'g'), '')
    into v_ced
    from public.cem_profiles p
   where p.id = p_profile_id;

  -- Sin cédula en la ficha no hay forma de cruzarlo: el diploma se identifica
  -- por la cédula que lleva impresa y por nada más.
  if v_ced is null then return; end if;

  return query
    select c.id,
           public.cert_titulo_bonito(c.plantilla_nombre),
           c.plantilla_nombre,
           coalesce(c.datos->>'Cédula', c.datos->>'cedula', c.datos->>'Cedula'),
           coalesce(c.datos->>'Nombre', c.datos->>'nombre'),
           c.created_at,
           c.estado,
           c.plantilla_nombre ilike '%DIPLOMAS EDITABLE%'
             or c.plantilla_nombre ilike 'FORMATO_DIPLOMA%'
      from public.cert_certificates c
     where public.cert_cedula_plana(c.datos) = v_ced
     -- Los reemplazados no se enseñan: son la versión vieja de un diploma que
     -- se volvió a generar, y enseñarlos haría creer que tiene el doble.
       and c.estado <> 'reemplazado'
     order by (c.plantilla_nombre ilike '%DIPLOMAS EDITABLE%') desc,
              c.plantilla_nombre;
end $function$;

revoke all on function public.cem_diplomas_de(uuid) from public, anon;
grant execute on function public.cem_diplomas_de(uuid) to authenticated;
