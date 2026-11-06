-- Becas y donaciones: «Ayuda a alguien a estudiar». 1 de 4: las tablas.
--
-- QUÉ ES
-- Personas y asociaciones (muchas en EE. UU.) aportan dinero a un fondo de
-- becas. La gente que quiere estudiar lo solicita —cuenta por qué— desde las
-- campañas de redes, el equipo elige, y a quien elige le regala el programa
-- entero, pagado con ese fondo. Y se puede regalar un curso directamente, sin
-- convocatoria: el ganador de un sorteo, una alianza.
--
-- LO QUE SE DECIDIÓ (el dueño, 6 de noviembre de 2026)
-- · Se dona con tarjeta (Stripe); lo que llegue por Zelle, transferencia o
--   cheque lo registra el equipo a mano, con su comprobante.
-- · Una beca cubre siempre el 100 % del programa.
-- · Donaciones y becas van APARTE: no son cem_payments, así que no entran en
--   «cobrado», ni en el reparto a inversores, ni en las carteras. Salen en el
--   cierre de mes en un bloque propio.
-- · La página de donar y el recibo, en español e inglés.
-- · No se promete deducción de impuestos: es un «aporte al fondo de becas».
--
-- CÓMO SE SIGUE CADA DÓLAR
-- · cem_becas_fondo es el libro del fondo: sólo se le AÑADEN movimientos
--   (entra una donación, sale una beca, vuelve una beca revocada). Lo
--   disponible es la suma del libro. No se corrige: se compensa.
-- · cem_becas_financiacion dice qué donaciones pagaron cada beca, la más
--   antigua primero. Así a quien donó se le puede decir qué becas pagó.
-- · Cada beca es una inscripción con precio_final = 0 (se activa sola), con su
--   número BEC-… en cem_enrollments.promocion. Sin cuotas y sin pago.
--
-- Patrón de la casa: RLS encendida, cero políticas, y todo por funciones
-- security definer (están en 20261107000003 y 20261107000004).

-- 1. AJUSTES (una sola fila)
create table if not exists public.cem_becas_ajustes (
  id smallint primary key default 1 check (id = 1),
  -- Dónde se cobran las donaciones con tarjeta: la clave de una cuenta de
  -- «Otras empresas» (stripe:<clave>), o vacío para la principal del CEM.
  stripe_cuenta text,
  otro_monto boolean not null default true,
  -- Un mínimo de verdad: las páginas de donar con montos sueltos son el sitio
  -- favorito de quien prueba tarjetas robadas con cargos pequeños.
  otro_monto_minimo numeric(12,2) not null default 25 check (otro_monto_minimo > 0),
  otro_monto_maximo numeric(12,2) not null default 50000,
  texto_recibo_es text not null default
    'Este recibo confirma tu aporte al fondo de becas del Centro Educativo Multigeneracional (CEM). El fondo paga programas completos a personas que no podrían pagarlos. No es un recibo fiscal: el aporte no es deducible de impuestos.',
  texto_recibo_en text not null default
    'This receipt confirms your contribution to the scholarship fund of the Centro Educativo Multigeneracional (CEM). The fund pays for full programs for people who could not otherwise afford them. This is not a tax receipt: the contribution is not tax-deductible.',
  mostrar_donantes boolean not null default true,
  mostrar_historias boolean not null default true,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references public.cem_profiles(id) on delete set null,
  check (otro_monto_maximo >= otro_monto_minimo)
);
insert into public.cem_becas_ajustes (id) values (1) on conflict (id) do nothing;

-- 2. PAQUETES DE DONACIÓN
create table if not exists public.cem_becas_paquetes (
  id uuid primary key default gen_random_uuid(),
  monto numeric(12,2) not null check (monto > 0),
  nombre_es text not null,
  nombre_en text not null,
  descripcion_es text not null default '',
  descripcion_en text not null default '',
  orden integer not null default 0,
  activo boolean not null default true,
  destacado boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

-- Los cuatro que pidió el dueño. Los textos no prometen «un diplomado»: los
-- precios cambian, y lo que alcanza cada paquete lo calcula la página con el
-- precio medio de los programas publicados.
insert into public.cem_becas_paquetes (monto, nombre_es, nombre_en, descripcion_es, descripcion_en, orden, destacado)
select v.* from (values
  (1000::numeric, 'Impulsa', 'Spark',
   'Pone en marcha una beca: alguien que hoy no podría pagarlo empieza a estudiar.',
   'Starts a scholarship: someone who couldn''t afford it today begins to study.', 1, false),
  (2300::numeric, 'Transforma', 'Transform',
   'Acompaña a una persona durante todo su programa, de la primera clase al certificado.',
   'Carries one person through their whole program, from the first class to the certificate.', 2, true),
  (5000::numeric, 'Multiplica', 'Multiply',
   'Varias becas a la vez: un grupo de personas estudiando gracias a ti.',
   'Several scholarships at once: a group of people studying thanks to you.', 3, false),
  (10000::numeric, 'Deja huella', 'Leave a legacy',
   'Una promoción entera de becados, y lo que aprenden se queda en su comunidad.',
   'A whole cohort of scholars, and what they learn stays in their community.', 4, false)
) as v(monto, nombre_es, nombre_en, descripcion_es, descripcion_en, orden, destacado)
where not exists (select 1 from public.cem_becas_paquetes);

-- 3. DONACIONES
create sequence if not exists public.cem_becas_donaciones_numero_seq;
create table if not exists public.cem_becas_donaciones (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.cem_becas_donaciones_numero_seq'),
  paquete_id uuid references public.cem_becas_paquetes(id) on delete set null,
  monto numeric(12,2) not null check (monto > 0),
  moneda text not null default 'USD' check (moneda = 'USD'),
  donante_nombre text not null,
  donante_email text,
  donante_pais text,
  organizacion text,
  mensaje text,
  publica boolean not null default false,
  idioma text not null default 'es' check (idioma in ('es','en')),
  metodo text not null check (metodo in ('tarjeta','zelle','transferencia','cheque','efectivo','otro')),
  estado text not null default 'iniciada' check (estado in ('iniciada','confirmada','fallida','anulada')),
  stripe_cuenta text,
  stripe_session_id text unique,
  stripe_payment_intent text,
  referencia text,
  comprobante text,
  fecha date not null default current_date,
  origen text,
  campana text,
  ip text,
  nota text,
  registrada_por uuid references public.cem_profiles(id) on delete set null,
  confirmada_en timestamptz,
  confirmada_por uuid references public.cem_profiles(id) on delete set null,
  anulada_en timestamptz,
  anulada_por uuid references public.cem_profiles(id) on delete set null,
  motivo_anulacion text,
  creada_en timestamptz not null default now()
);
-- La misma transferencia no se registra dos veces.
create unique index if not exists cem_becas_donaciones_referencia_unica
  on public.cem_becas_donaciones (metodo, lower(referencia))
  where referencia is not null and estado <> 'anulada';
create index if not exists cem_becas_donaciones_estado
  on public.cem_becas_donaciones (estado, confirmada_en);

-- 4. CONVOCATORIAS DE BECAS
-- «De becas»: las convocatorias que ya existen (cem_convocatorias) son otra
-- cosa, las fechas de inicio de los cursos.
create table if not exists public.cem_becas_convocatorias (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  titulo text not null,
  descripcion text not null default '',
  -- Programas que se pueden pedir. Vacío = cualquiera de los publicados.
  cursos uuid[] not null default '{}',
  cupos integer check (cupos is null or cupos > 0),
  abre_en timestamptz,
  cierra_en timestamptz,
  activa boolean not null default true,
  pregunta_extra text,
  gracias text,
  creada_por uuid references public.cem_profiles(id) on delete set null,
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);

-- La general, abierta desde el primer día: el formulario funciona aunque
-- todavía no se haya lanzado ninguna campaña.
insert into public.cem_becas_convocatorias (codigo, titulo, descripcion, gracias)
values ('becas-cem', 'Becas CEM',
  'Hay personas que quieren pagarle los estudios a quien no puede. Si ese es tu caso, cuéntanos quién eres y por qué quieres estudiar: el equipo lee cada solicitud.',
  'Recibimos tu solicitud. El equipo la va a leer con calma; si te eligen, te escribimos a tu correo.')
on conflict (codigo) do nothing;

-- 5. SOLICITUDES
create sequence if not exists public.cem_becas_solicitudes_numero_seq;
create table if not exists public.cem_becas_solicitudes (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.cem_becas_solicitudes_numero_seq'),
  convocatoria_id uuid not null references public.cem_becas_convocatorias(id),
  course_id uuid references public.cem_courses(id) on delete set null,
  -- Lo que escribió, si todavía no había programas publicados para elegir.
  programa_texto text,
  nombre text not null,
  apellido text,
  email text not null,
  telefono text,
  pais text not null,
  ciudad text,
  edad integer check (edad is null or edad between 10 and 110),
  ocupacion text,
  -- {por_que, para_que, situacion, horas, extra}
  respuestas jsonb not null default '{}'::jsonb,
  redes text,
  como_nos_conocio text,
  origen text,
  campana text,
  -- Si le dan la beca: ¿se puede publicar su nombre de pila y su país?
  acepta_publicar boolean not null default false,
  estado text not null default 'recibida' check (estado in
    ('recibida','en_revision','preseleccionada','en_espera','aprobada','rechazada','retirada')),
  puntaje smallint check (puntaje between 1 and 5),
  nota_interna text,
  revisada_por uuid references public.cem_profiles(id) on delete set null,
  revisada_en timestamptz,
  avisada_en timestamptz,
  beca_id uuid,
  ip text,
  creada_en timestamptz not null default now(),
  actualizada_en timestamptz not null default now()
);
-- Una por persona y convocatoria: la segunda vez se le dice que ya llegó.
create unique index if not exists cem_becas_solicitudes_una_por_persona
  on public.cem_becas_solicitudes (convocatoria_id, lower(email));
create index if not exists cem_becas_solicitudes_estado
  on public.cem_becas_solicitudes (estado, creada_en desc);

-- 6. BECAS
create sequence if not exists public.cem_becas_numero_seq;
create table if not exists public.cem_becas (
  id uuid primary key default gen_random_uuid(),
  numero bigint not null unique default nextval('public.cem_becas_numero_seq'),
  -- fondo: la paga el fondo de donaciones · cem: la regala el CEM, sin tocar
  -- el fondo · anterior: dada antes de este sistema (sólo suma en las cifras).
  tipo text not null check (tipo in ('fondo','cem','anterior')),
  solicitud_id uuid references public.cem_becas_solicitudes(id) on delete set null,
  convocatoria_id uuid references public.cem_becas_convocatorias(id) on delete set null,
  course_id uuid references public.cem_courses(id) on delete set null,
  curso_texto text,
  cohort_id uuid references public.cem_cohorts(id) on delete set null,
  profile_id uuid references public.cem_profiles(id) on delete set null,
  enrollment_id uuid references public.cem_enrollments(id) on delete set null,
  nombre text not null,
  email text,
  pais text,
  -- Lo que vale: el precio de contado del programa (precio × 0,9), en su
  -- moneda, y en dólares para el fondo, con el cambio que se usó.
  valor numeric(12,2) not null default 0 check (valor >= 0),
  moneda text not null default 'EUR',
  valor_usd numeric(12,2) not null check (valor_usd >= 0),
  cambio numeric(14,6),
  -- por_activar: hay un enlace pendiente y el dinero está reservado. Un
  -- enlace vencido sigue aquí, con el dinero reservado, hasta que el equipo
  -- mande uno nuevo o revoque la beca (y el dinero vuelve al fondo): así
  -- ninguna beca desaparece sola sin que nadie lo decida.
  estado text not null check (estado in ('por_activar','otorgada','revocada')),
  token_hash text unique,
  vence_en timestamptz,
  activada_en timestamptz,
  publicable boolean not null default false,
  historia text,
  mensaje text,
  fecha date not null default current_date,
  otorgada_por uuid references public.cem_profiles(id) on delete set null,
  creada_en timestamptz not null default now(),
  revocada_en timestamptz,
  revocada_por uuid references public.cem_profiles(id) on delete set null,
  motivo text
);
create index if not exists cem_becas_estado on public.cem_becas (estado, creada_en desc);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'cem_becas_solicitudes_beca_fk') then
    alter table public.cem_becas_solicitudes
      add constraint cem_becas_solicitudes_beca_fk foreign key (beca_id)
      references public.cem_becas(id) on delete set null;
  end if;
end $$;

-- 7. EL LIBRO DEL FONDO
create table if not exists public.cem_becas_fondo (
  id bigserial primary key,
  fecha timestamptz not null default now(),
  tipo text not null check (tipo in ('donacion','anulacion','beca','devolucion')),
  monto numeric(12,2) not null,
  donacion_id uuid references public.cem_becas_donaciones(id),
  beca_id uuid references public.cem_becas(id),
  nota text,
  actor_id uuid references public.cem_profiles(id) on delete set null,
  check ((tipo in ('donacion','anulacion') and donacion_id is not null)
      or (tipo in ('beca','devolucion') and beca_id is not null)),
  check ((tipo in ('donacion','devolucion') and monto > 0)
      or (tipo in ('anulacion','beca') and monto < 0))
);
create index if not exists cem_becas_fondo_fecha on public.cem_becas_fondo (fecha);
-- Una donación entra una sola vez y una beca sale una sola vez: si Stripe
-- repite el aviso, o dos personas pulsan a la vez, el segundo choca aquí.
create unique index if not exists cem_becas_fondo_una_entrada
  on public.cem_becas_fondo (donacion_id) where tipo = 'donacion';
create unique index if not exists cem_becas_fondo_una_salida
  on public.cem_becas_fondo (beca_id) where tipo = 'beca';
create unique index if not exists cem_becas_fondo_una_vuelta
  on public.cem_becas_fondo (beca_id) where tipo = 'devolucion';
create unique index if not exists cem_becas_fondo_una_anulacion
  on public.cem_becas_fondo (donacion_id) where tipo = 'anulacion';

-- No se corrige: se compensa con otro movimiento. La única excepción es quien
-- administra la base, a mano y a propósito, para limpiar una prueba.
create or replace function public.cem_tg_becas_fondo_inmutable()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('postgres', 'supabase_admin')
     and coalesce(current_setting('cem.limpieza', true), '') = 'si' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'El libro del fondo de becas no se corrige: se añade un movimiento que lo compense.'
    using errcode = '42501';
end $$;

drop trigger if exists cem_becas_fondo_inmutable on public.cem_becas_fondo;
create trigger cem_becas_fondo_inmutable
  before update or delete on public.cem_becas_fondo
  for each row execute function public.cem_tg_becas_fondo_inmutable();

-- 8. QUÉ DONACIONES PAGARON CADA BECA
create table if not exists public.cem_becas_financiacion (
  beca_id uuid not null references public.cem_becas(id),
  donacion_id uuid not null references public.cem_becas_donaciones(id),
  monto numeric(12,2) not null check (monto > 0),
  asignada_en timestamptz not null default now(),
  liberada_en timestamptz,
  primary key (beca_id, donacion_id)
);
create index if not exists cem_becas_financiacion_donacion
  on public.cem_becas_financiacion (donacion_id) where liberada_en is null;

-- 9. CERRADAS: nadie las toca si no es por sus funciones
alter table public.cem_becas_ajustes      enable row level security;
alter table public.cem_becas_paquetes     enable row level security;
alter table public.cem_becas_donaciones   enable row level security;
alter table public.cem_becas_convocatorias enable row level security;
alter table public.cem_becas_solicitudes  enable row level security;
alter table public.cem_becas              enable row level security;
alter table public.cem_becas_fondo        enable row level security;
alter table public.cem_becas_financiacion enable row level security;

revoke all on table public.cem_becas_ajustes, public.cem_becas_paquetes, public.cem_becas_donaciones,
  public.cem_becas_convocatorias, public.cem_becas_solicitudes, public.cem_becas,
  public.cem_becas_fondo, public.cem_becas_financiacion
  from public, anon, authenticated;
revoke all on sequence public.cem_becas_donaciones_numero_seq, public.cem_becas_solicitudes_numero_seq,
  public.cem_becas_numero_seq, public.cem_becas_fondo_id_seq
  from public, anon, authenticated;
revoke all on function public.cem_tg_becas_fondo_inmutable() from public, anon, authenticated;
