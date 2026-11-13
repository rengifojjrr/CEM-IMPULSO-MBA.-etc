-- Andamiaje mínimo de Supabase para poder probar el volcado en una base vacía.
-- No es Supabase: es lo justo para que el volcado tenga dónde apoyarse.
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
create role authenticator noinherit login;
create role supabase_admin superuser;
create role supabase_auth_admin;
create role supabase_storage_admin;
grant anon, authenticated, service_role to authenticator;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
create schema if not exists vault;
create schema if not exists cron;
create schema if not exists net;
create schema if not exists graphql;
create schema if not exists realtime;
grant usage on schema auth, storage, extensions, public to anon, authenticated, service_role;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;
create extension if not exists btree_gist with schema public;

-- Las que aquí no existen (las pone Supabase). Se dejan como huecos para que
-- el volcado no se caiga por ellas.
create table if not exists auth.users (
  id uuid primary key,
  instance_id uuid, aud varchar(255), role varchar(255),
  email varchar(255), encrypted_password varchar(255),
  email_confirmed_at timestamptz, invited_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  last_sign_in_at timestamptz, phone text, deleted_at timestamptz,
  banned_until timestamptz, is_super_admin boolean,
  confirmation_token varchar(255), recovery_token varchar(255),
  email_change_token_new varchar(255), email_change varchar(255)
);
create table if not exists auth.identities (
  id uuid primary key, user_id uuid references auth.users(id) on delete cascade,
  provider_id text, identity_data jsonb, provider text,
  created_at timestamptz, updated_at timestamptz, last_sign_in_at timestamptz
);
create or replace function auth.uid() returns uuid language sql stable as
  $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
create or replace function auth.role() returns text language sql stable as
  $f$ select nullif(current_setting('request.jwt.claim.role', true), '') $f$;
create or replace function auth.email() returns text language sql stable as
  $f$ select nullif(current_setting('request.jwt.claim.email', true), '') $f$;
create or replace function auth.jwt() returns jsonb language sql stable as
  $f$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $f$;

create table if not exists storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now()
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id),
  name text, owner uuid, metadata jsonb, created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[]
  language sql immutable as $f$ select string_to_array(name, '/') $f$;
create or replace function storage.filename(name text) returns text
  language sql immutable as $f$ select (string_to_array(name, '/'))[array_length(string_to_array(name,'/'),1)] $f$;
create or replace function storage.extension(name text) returns text
  language sql immutable as $f$ select split_part(name, '.', -1) $f$;

-- pg_cron y pg_net, de mentira, pero con las firmas y el comportamiento de los
-- de verdad. Un andamio más blando que Supabase da verdes falsos: lo que pasa
-- aquí tiene que pasar allí.
--   · schedule con un nombre que ya existe ACTUALIZA ese trabajo, como pg_cron
--     desde la 1.3; no crea un segundo.
--   · unschedule tiene las dos firmas de pg_cron, por nombre y por número
--     (jobid, bigint), y las dos fallan si el trabajo no existe. Faltaba la del
--     número, y 20260915000001 la usa: era 1 de los 13 errores de noviembre.
create table if not exists cron.job (
  jobid bigserial primary key, jobname text, schedule text, command text, active boolean default true);
create or replace function cron.schedule(job_name text, schedule text, command text)
  returns bigint language plpgsql as $f$
#variable_conflict use_column
declare v_id bigint;
begin
  update cron.job set schedule = $2, command = $3 where jobname = $1 returning jobid into v_id;
  if v_id is null then
    insert into cron.job (jobname, schedule, command) values ($1, $2, $3) returning jobid into v_id;
  end if;
  return v_id;
end $f$;
create or replace function cron.unschedule(job_name text) returns boolean language plpgsql as $f$
begin
  delete from cron.job where jobname = $1;
  if not found then raise exception 'could not find valid entry for job ''%''', $1; end if;
  return true;
end $f$;
create or replace function cron.unschedule(job_id bigint) returns boolean language plpgsql as $f$
begin
  delete from cron.job where jobid = $1;
  if not found then raise exception 'could not find valid entry for job %', $1; end if;
  return true;
end $f$;
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint
  language sql as $f$ select 0::bigint $f$;
create or replace function net.http_get(url text, params jsonb default '{}',
  headers jsonb default '{}', timeout_milliseconds int default 5000) returns bigint
  language sql as $f$ select 0::bigint $f$;

-- Los permisos por omisión de Supabase, al final para que no toquen lo de
-- arriba. En un proyecto de Supabase, todo lo que se crea en public nace con
-- ALL para anon, authenticated y service_role: es lo que dice pg_default_acl en
-- producción, para postgres y para supabase_admin. Sin esto el andamio era más
-- cerrado que Supabase y escondía dos cosas a la vez: que lo creado después del
-- volcado tiene service_role (y aquí no), y que el volcado, restaurado en un
-- proyecto de verdad, abría de más lo que producción tiene cerrado. Eso último
-- lo cierran las migraciones 20251231000000 y 20260101000012.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
