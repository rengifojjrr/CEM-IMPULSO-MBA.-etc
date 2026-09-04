-- ═══════════════════════════════════════════════════════════════════════════
-- La convocatoria que se publica: precio, fecha y cupos
-- ═══════════════════════════════════════════════════════════════════════════
-- Punto 1.1 del documento de diseño del 4 de septiembre. Hoy el precio y las
-- fechas NO se publican a propósito —la propia FAQ lo dice— por miedo a dejar
-- un dato viejo. El miedo es legítimo; la solución elegida era la más cara
-- posible, porque obliga a cada interesado a pedir permiso para saber cuánto
-- cuestas. Ninguna de las seis plataformas de referencia esconde el precio.
--
-- El miedo se resuelve solo si el precio no es un texto escrito a mano sino un
-- dato que se pinta desde aquí: la convocatoria da el precio en euros y la
-- fecha, y la tasa del BCV del día —que ya se recoge sola desde hace semanas—
-- lo pasa a bolívares. Así no puede quedarse viejo.
--
-- POR QUÉ UNA TABLA NUEVA Y NO cem_cohorts, que es lo que sugiere el documento:
-- course_id es obligatorio ahí y los dos diplomados NO son cursos —viven en el
-- registro de certificados—, así que una convocatoria suya no tiene curso al
-- que agarrarse. Aflojar esa restricción tocaba seis funciones que unen
-- cohortes con cursos por dentro, y un INNER JOIN con NULL descarta la fila en
-- silencio: el fallo que no da error y se descubre tarde. Y mirándolo bien son
-- dos cosas distintas: una cohorte es un grupo de gente matriculada, con su
-- aula y sus notas; una convocatoria es un ANUNCIO, lo que se promete en la web
-- antes de que exista nadie matriculado. Separadas, las dos quedan simples.

create table if not exists public.cem_convocatorias (
  id           uuid primary key default gen_random_uuid(),
  diplomado    text        not null,
  titulo       text,
  fecha_inicio date        not null,
  precio_eur   numeric(12,2) check (precio_eur is null or precio_eur >= 0),
  cupos        integer       check (cupos is null or cupos > 0),
  ocupados     integer     not null default 0 check (ocupados >= 0),
  horario      text,
  modalidad    text,
  nota         text,
  abierta      boolean     not null default true,
  cohort_id    uuid        references public.cem_cohorts(id) on delete set null,
  creada_en    timestamptz not null default now(),
  actualizada  timestamptz not null default now()
);

comment on table public.cem_convocatorias is
  'Lo que se anuncia en la web: cuándo empieza un diplomado, cuánto cuesta y cuántas plazas quedan.';
comment on column public.cem_convocatorias.diplomado is
  'Apodo del diplomado tal y como lo nombra el generador: diplomado-marketing-digital.';
comment on column public.cem_convocatorias.cohort_id is
  'La cohorte de matrícula, cuando llegue a existir. Opcional: el anuncio va antes que el grupo.';

-- La casa: RLS encendida y CERO políticas. Todo pasa por funciones.
alter table public.cem_convocatorias enable row level security;
revoke all on table public.cem_convocatorias from anon, authenticated;

create index if not exists cem_convocatorias_abierta_idx
  on public.cem_convocatorias (diplomado, fecha_inicio) where abierta;

-- ── La que se publica, con el precio en tres monedas ──────────────────────
-- Devuelve NULL si no hay ninguna abierta con fecha de hoy en adelante. Quien
-- la pinta no decide nada: si viene, se pinta; si no, sale el estado vacío,
-- que dice que todavía no hay fecha y recoge un correo. Nunca un hueco en
-- blanco y nunca volver a esconder el dato.
--
-- La conversión va aquí y no en la página por lo que avisa el documento
-- anterior: la tasa del EURO del BCV va un 15 % por encima de la del DÓLAR, así
-- que el equivalente en dólares es bolívares ÷ tasa_usd, y NUNCA el precio en
-- euros enseñado como dólares. Hoy 100 € son Bs 93.280,80 y $115,90, no $100.
-- En un solo sitio, para que no se equivoque nadie.
create or replace function public.cem_convocatoria_de(p_diplomado text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  with abierta as (
    select * from cem_convocatorias
     where diplomado = p_diplomado and abierta and fecha_inicio >= current_date
     order by fecha_inicio asc limit 1
  ), t as (
    select max(valor) filter (where moneda = 'EUR') as eur,
           max(valor) filter (where moneda = 'USD') as usd,
           max(fecha) as fecha
      from cem_tasas_bcv where fecha = (select max(fecha) from cem_tasas_bcv)
  )
  select case when a.id is null then null else jsonb_strip_nulls(jsonb_build_object(
    'fecha',      a.fecha_inicio,
    'titulo',     a.titulo,
    'horario',    a.horario,
    'modalidad',  a.modalidad,
    'nota',       a.nota,
    'precio_eur', a.precio_eur,
    -- Sólo si hay precio Y hay tasa: media conversión es peor que ninguna.
    'precio_bs',  case when a.precio_eur is not null and t.eur is not null
                       then round(a.precio_eur * t.eur, 2) end,
    'precio_usd', case when a.precio_eur is not null and t.eur is not null and t.usd > 0
                       then round(a.precio_eur * t.eur / t.usd, 2) end,
    'tasa_eur',   t.eur,
    'tasa_fecha', t.fecha,
    'cupos',      a.cupos,
    -- Las plazas que quedan sólo se anuncian si el cupo es un número real: el
    -- documento es explícito en que la escasez inventada no se construye.
    'quedan',     case when a.cupos is not null then greatest(a.cupos - a.ocupados, 0) end
  )) end
  from abierta a cross join t;
$$;

revoke all on function public.cem_convocatoria_de(text) from public;
grant execute on function public.cem_convocatoria_de(text) to anon, authenticated;

comment on function public.cem_convocatoria_de(text) is
  'La convocatoria abierta de un diplomado con su precio en EUR, Bs y USD a la tasa del día. Pública.';
