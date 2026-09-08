-- Que un egresado entre, y sus diplomas estén ahí.
--
-- El problema: hay dos sistemas de certificados que nunca se hablaron. Los de
-- la plataforma (cem_certificates) cuelgan de un profile_id, así que el
-- estudiante los ve. Los del generador (cert_certificates) —los 143 diplomas
-- y los 500 y pico certificados de módulo— sólo guardan la cédula DENTRO de
-- sus datos, sin ninguna relación con una cuenta. Un graduado de 2026 puede
-- registrarse hoy y no ver nada suyo, aunque su diploma esté emitido.
--
-- El puente es la cédula. No hace falta crear cuentas por adelantado: el
-- certificado con su cédula YA es el registro pendiente. Cuando esa persona se
-- registre y ponga su cédula, aparece todo lo suyo —de los dos diplomados si
-- hizo los dos—, sin que nadie tenga que emparejar nada a mano.

-- ── Qué cédula quedó enganchada a qué cuenta ────────────────────────────────
-- No es imprescindible para leer —eso sale de la cédula del perfil— pero deja
-- rastro de quién reclamó qué y cuándo, que es lo que hace falta el día que
-- alguien diga «esos diplomas no son míos».
create table if not exists public.cem_egresado_vinculos (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null references public.cem_profiles(id) on delete cascade,
  cedula        text not null,
  documentos    int  not null default 0,
  vinculado_en  timestamptz not null default now(),
  unique (profile_id, cedula)
);

comment on table public.cem_egresado_vinculos is
  'Cuándo una cuenta reclamó los certificados de una cédula. Se llena solo al entrar.';

create index if not exists cem_egresado_vinculos_cedula_idx
  on public.cem_egresado_vinculos (cedula);

-- Casa: RLS encendida y sin políticas. Todo pasa por funciones.
alter table public.cem_egresado_vinculos enable row level security;
revoke all on public.cem_egresado_vinculos from public, anon, authenticated;

-- Sin este índice, cada visita a «Mis logros» recorre los 650 certificados.
create index if not exists cert_certificates_cedula_idx
  on public.cert_certificates (public.cert_cedula_plana(datos))
  where estado = 'vigente';

-- ── El nombre que se le enseña a la persona ─────────────────────────────────
-- Las plantillas se llaman «8_IA_ILLUSTRATOR» o «DIPLOMAS EDITABLE 2026
-- DIPLOMADO CEM_agosto», que es un nombre de archivo, no algo que enseñarle a
-- un graduado.
create or replace function public.cert_titulo_bonito(p_plantilla text)
returns text
language sql immutable
set search_path to 'public'
as $$
  select case
    when p_plantilla ilike '%DIPLOMAS EDITABLE%INTELIGENCIA ARTIFICIAL'
      then 'Diplomado Internacional de Creación de Contenido e Inteligencia Artificial'
    when p_plantilla ilike '%DIPLOMAS EDITABLE%'
      then 'Diplomado Internacional de Marketing'
    when p_plantilla ilike 'FORMATO_DIPLOMA_EXITUS'
      then 'Diploma Exitus Lab'
    else initcap(replace(regexp_replace(p_plantilla, '^[0-9]+_[A-Za-z]+_', ''), '_', ' '))
  end;
$$;

-- ── Lo que ve el egresado ───────────────────────────────────────────────────
create or replace function public.cem_mis_certificados_de_egresado()
returns table (
  id          uuid,
  titulo      text,
  programa    text,
  es_diploma  boolean,
  nombre      text,
  cedula      text,
  emitido_en  timestamptz,
  plantilla   text
)
language plpgsql
stable security definer
set search_path to 'public'
as $function$
declare v_ced text;
begin
  -- La cédula del perfil, en crudo, con la misma regla que usa el generador
  -- para las suyas: sólo dígitos. Así «V-27.826.482» y «27826482» son la misma.
  select nullif(regexp_replace(coalesce(p.documento, ''), '[^0-9]', '', 'g'), '')
    into v_ced
    from public.cem_profiles p
   where p.id = auth.uid();

  if v_ced is null then return; end if;

  return query
    select c.id,
           public.cert_titulo_bonito(c.plantilla_nombre),
           case when t.config->>'carpeta' in ('iA', 'diplomas editables') then 'IA'
                when t.config->>'carpeta' in ('MKT', '')                 then 'Marketing'
                when t.config->>'carpeta' = 'exitus'                     then 'Exitus'
                else 'Otro' end,
           c.plantilla_nombre ilike '%DIPLOMAS EDITABLE%'
             or c.plantilla_nombre ilike 'FORMATO_DIPLOMA%',
           coalesce(c.datos->>'Nombre', c.datos->>'nombre'),
           coalesce(c.datos->>'Cédula', c.datos->>'cedula', c.datos->>'Cedula'),
           c.created_at,
           c.plantilla_nombre
      from public.cert_certificates c
      left join public.cert_templates t on t.nombre = c.plantilla_nombre
     where c.estado = 'vigente'
       and public.cert_cedula_plana(c.datos) = v_ced
     -- Los diplomas primero: es lo que la gente viene a buscar.
     order by (c.plantilla_nombre ilike '%DIPLOMAS EDITABLE%') desc,
              c.plantilla_nombre;
end;
$function$;

-- ── Dejar rastro de que esta cuenta reclamó esa cédula ──────────────────────
-- Se llama al abrir la pantalla. Aparte porque la de arriba es de sólo lectura.
create or replace function public.cem_vincular_mis_certificados()
returns int
language plpgsql
volatile security definer
set search_path to 'public'
as $function$
declare v_ced text; v_cuantos int;
begin
  select nullif(regexp_replace(coalesce(p.documento, ''), '[^0-9]', '', 'g'), '')
    into v_ced from public.cem_profiles p where p.id = auth.uid();
  if v_ced is null then return 0; end if;

  select count(*) into v_cuantos
    from public.cert_certificates c
   where c.estado = 'vigente' and public.cert_cedula_plana(c.datos) = v_ced;

  if v_cuantos = 0 then return 0; end if;

  insert into public.cem_egresado_vinculos (profile_id, cedula, documentos)
       values (auth.uid(), v_ced, v_cuantos)
  on conflict (profile_id, cedula)
    do update set documentos = excluded.documentos, vinculado_en = now();

  return v_cuantos;
end;
$function$;

-- Sólo para quien ha entrado, y cada uno ve lo suyo: las dos funciones se
-- atienen a auth.uid() y no aceptan que se les diga de quién.
revoke all on function public.cem_mis_certificados_de_egresado() from public, anon;
revoke all on function public.cem_vincular_mis_certificados()    from public, anon;
revoke all on function public.cert_titulo_bonito(text)           from public, anon;
grant execute on function public.cem_mis_certificados_de_egresado() to authenticated;
grant execute on function public.cem_vincular_mis_certificados()    to authenticated;
grant execute on function public.cert_titulo_bonito(text)           to authenticated;
