-- Becas y donaciones. 2 de 4: lo de dentro y lo que ve el público.
--
-- Las de dentro (cem_becas_*) no las llama nadie desde fuera: sólo otras
-- funciones. Las públicas (cem_becas_publico, cem_beca_convocatoria,
-- cem_beca_solicitar, cem_beca_enlace_ver, cem_beca_donacion_estado) no
-- devuelven nunca datos de nadie: cifras, textos, y lo que la propia persona
-- acaba de escribir.

-- ═══ 1. DE DENTRO ═══════════════════════════════════════════════════════════

-- Cuántos dólares vale una unidad de la moneda del programa. Los precios están
-- en euros y el fondo en dólares; el cruce sale de las dos tasas BCV del día
-- (bolívares por euro ÷ bolívares por dólar), las mismas que usa el resto de la
-- plataforma. Sin tasa no se inventa un cambio: se dice.
create or replace function public.cem_becas_cambio_usd(p_moneda text)
returns numeric
language plpgsql stable security definer set search_path = public as $$
declare v_m numeric; v_usd numeric; v_moneda text := upper(coalesce(nullif(btrim(p_moneda), ''), 'EUR'));
begin
  if v_moneda = 'USD' then return 1; end if;
  select t.valor into v_usd from cem_tasa_vigente('USD') t;
  if coalesce(v_usd, 0) <= 0 then
    raise exception 'No hay tasa del día para pasar % a dólares, así que no se puede saber cuánto vale la beca.', v_moneda;
  end if;
  if v_moneda = 'VES' then return round(1 / v_usd, 6); end if;
  select t.valor into v_m from cem_tasa_vigente(v_moneda) t;
  if coalesce(v_m, 0) <= 0 then
    raise exception 'No hay tasa del día para pasar % a dólares, así que no se puede saber cuánto vale la beca.', v_moneda;
  end if;
  return round(v_m / v_usd, 6);
end $$;

create or replace function public.cem_becas_cambio_usd_seguro(p_moneda text)
returns numeric
language plpgsql stable security definer set search_path = public as $$
begin
  return cem_becas_cambio_usd(p_moneda);
exception when others then
  return null;
end $$;

-- Lo que vale la beca de un programa: su precio de contado (el de quien paga
-- de una vez, × 0,9, el mismo factor que cem_inscribir_a), en su moneda y en
-- dólares.
create or replace function public.cem_becas_valor(p_course_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c cem_courses; v_valor numeric; v_cambio numeric; v_moneda text;
begin
  select * into c from cem_courses where id = p_course_id;
  if c.id is null then raise exception 'Ese programa no existe.'; end if;
  v_moneda := upper(coalesce(nullif(btrim(c.moneda), ''), 'EUR'));
  v_valor := round(coalesce(c.precio, 0) * 0.9, 2);
  v_cambio := cem_becas_cambio_usd(v_moneda);
  return jsonb_build_object('curso', c.nombre, 'estado', c.estado::text,
    'valor', v_valor, 'moneda', v_moneda, 'cambio', v_cambio,
    'valor_usd', round(v_valor * v_cambio, 2));
end $$;

-- Lo que hay en el fondo: la suma del libro.
create or replace function public.cem_becas_disponible()
returns numeric
language sql stable security definer set search_path = public as $$
  select coalesce(sum(monto), 0)::numeric from cem_becas_fondo;
$$;

-- Lo que queda sin usar de una donación confirmada.
create or replace function public.cem_becas_queda(p_donacion_id uuid)
returns numeric
language sql stable security definer set search_path = public as $$
  select case when d.estado = 'confirmada'
              then d.monto - coalesce((select sum(f.monto) from cem_becas_financiacion f
                                        where f.donacion_id = d.id and f.liberada_en is null), 0)
              else 0 end
    from cem_becas_donaciones d where d.id = p_donacion_id;
$$;

-- El enlace para activar una beca: 24 bytes al azar (32 caracteres). En la
-- base sólo se guarda su huella; el enlace se enseña una vez al crearlo.
create or replace function public.cem_becas_token_nuevo()
returns text
language sql volatile security definer set search_path = public, extensions as $$
  select translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/=', '-_');
$$;

create or replace function public.cem_becas_hash(p_token text)
returns text
language sql immutable security definer set search_path = public, extensions as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

create or replace function public.cem_becas_enlace(p_token text)
returns text
language sql immutable as $$
  select 'https://escuelacem.com/plataforma/beca.html?t=' || p_token;
$$;

-- La dirección de quien llama, si PostgREST la pasa. Sirve para frenar, no
-- para identificar a nadie: se puede falsear, por eso hay también un freno
-- global.
create or replace function public.cem_becas_ip()
returns text
language plpgsql stable set search_path = public as $$
declare v text;
begin
  begin
    v := current_setting('request.headers', true)::json->>'x-forwarded-for';
  exception when others then return null; end;
  return nullif(left(btrim(split_part(coalesce(v, ''), ',', 1)), 64), '');
end $$;

-- Dólares escritos como se leen en cada idioma: 1.000,00 USD / USD 1,000.00.
create or replace function public.cem_becas_usd(p numeric, p_idioma text default 'es')
returns text
language sql immutable as $$
  select case when p_idioma = 'en' then 'USD ' || to_char(coalesce(p, 0), 'FM999,999,990.00')
         else translate(to_char(coalesce(p, 0), 'FM999,999,990.00'), ',.', '.,') || ' USD' end;
$$;

create or replace function public.cem_becas_numero(p_prefijo text, p_numero bigint)
returns text
language sql immutable as $$
  select p_prefijo || '-' || lpad(p_numero::text, 6, '0');
$$;

-- Un correo a la cola, si hay a quién. La clave impide repetirlo.
create or replace function public.cem_becas_correo(p_para text, p_asunto text, p_cuerpo text, p_clave text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if nullif(btrim(coalesce(p_para, '')), '') is null then return; end if;
  insert into cem_correo_cola (para, asunto, cuerpo, clave)
  values (lower(btrim(p_para)), p_asunto, p_cuerpo, p_clave)
  on conflict (clave) where estado = 'pendiente' do nothing;
end $$;

-- Reservar el dinero de una beca del fondo, tomándolo de las donaciones más
-- antiguas primero, y apuntar de cuáles salió. Todo lo que mueve el fondo toma
-- antes el mismo candado: dos becas a la vez no pueden gastar el mismo dólar.
create or replace function public.cem_becas_reservar(p_beca_id uuid, p_valor_usd numeric, p_actor uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_disp numeric; v_resto numeric := p_valor_usd; d record; v_toma numeric;
begin
  perform pg_advisory_xact_lock(hashtext('cem_becas_fondo'));
  v_disp := cem_becas_disponible();
  if p_valor_usd <= 0 then raise exception 'Una beca del fondo tiene que valer algo.'; end if;
  if v_disp < p_valor_usd then
    raise exception 'El fondo no alcanza: hay % disponibles y esta beca vale %. Puedes darla como regalo del CEM, que no toca el fondo.',
      cem_becas_usd(v_disp), cem_becas_usd(p_valor_usd);
  end if;

  insert into cem_becas_fondo (tipo, monto, beca_id, actor_id)
  values ('beca', -p_valor_usd, p_beca_id, p_actor);

  for d in
    select x.id, cem_becas_queda(x.id) as queda
      from cem_becas_donaciones x
     where x.estado = 'confirmada'
     order by x.confirmada_en, x.numero
  loop
    exit when v_resto <= 0;
    continue when d.queda <= 0;
    v_toma := least(d.queda, v_resto);
    insert into cem_becas_financiacion (beca_id, donacion_id, monto)
    values (p_beca_id, d.id, v_toma);
    v_resto := v_resto - v_toma;
  end loop;

  if v_resto > 0.004 then
    raise exception 'El libro del fondo y las donaciones no cuadran (faltan %). No se ha dado la beca: avisa a quien administra la plataforma.',
      cem_becas_usd(v_resto);
  end if;
end $$;

-- Devolver al fondo el dinero de una beca que no se usó.
create or replace function public.cem_becas_liberar(p_beca_id uuid, p_actor uuid, p_nota text)
returns numeric
language plpgsql security definer set search_path = public as $$
declare v numeric;
begin
  perform pg_advisory_xact_lock(hashtext('cem_becas_fondo'));
  select -coalesce(sum(monto), 0) into v from cem_becas_fondo where beca_id = p_beca_id;
  if v > 0 then
    insert into cem_becas_fondo (tipo, monto, beca_id, nota, actor_id)
    values ('devolucion', v, p_beca_id, p_nota, p_actor);
  end if;
  update cem_becas_financiacion set liberada_en = now()
   where beca_id = p_beca_id and liberada_en is null;
  return greatest(coalesce(v, 0), 0);
end $$;

-- Convertir una beca en inscripción: precio_final 0 (se activa sola), sin
-- cuotas y sin pago, con su número en promocion para encontrarla. Si la
-- persona ya tenía una inscripción pendiente de pago en ese programa, se
-- convierte en becada y sus cuotas se anulan; si ya había pagado algo, no.
create or replace function public.cem_becas_inscribir(p_beca_id uuid, p_profile_id uuid, p_avisar boolean default true)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  b cem_becas; c cem_courses; p cem_profiles; e cem_enrollments; v_enr uuid;
  v_codigo text; v_quien text; v_en boolean; r record; v_asunto text; v_cuerpo text;
begin
  select * into b from cem_becas where id = p_beca_id for update;
  if b.id is null then raise exception 'Esa beca no existe.'; end if;
  if b.estado <> 'por_activar' then raise exception 'Esa beca ya está %.', b.estado; end if;
  select * into c from cem_courses where id = b.course_id;
  if c.id is null then raise exception 'El programa de esa beca ya no existe.'; end if;
  select * into p from cem_profiles where id = p_profile_id;
  if p.id is null or not p.activo then raise exception 'Esa cuenta no existe o está desactivada.'; end if;

  v_codigo := cem_becas_numero('BEC', b.numero);

  select * into e from cem_enrollments
   where profile_id = p_profile_id and course_id = b.course_id
     and estado not in ('cancelada', 'finalizada')
   order by created_at desc limit 1;

  if e.id is not null then
    if exists (select 1 from cem_payments where enrollment_id = e.id and estado = 'confirmado') then
      raise exception 'Esa persona ya está inscrita en % y pagó parte. Una beca no se aplica a medias: habla con cobranza.', c.nombre;
    end if;
    -- Un pago reportado y sin revisar: si luego se aprobara, abonaría cuotas
    -- que la beca acaba de anular.
    if exists (select 1 from cem_payments where enrollment_id = e.id and estado in ('registrado', 'reportado')) then
      raise exception 'Hay un pago de % sin revisar en esa inscripción. Cobranza tiene que aprobarlo o rechazarlo antes de aplicar la beca.', c.nombre;
    end if;
    if coalesce(e.precio_final, 0) <= 0 then
      raise exception 'Esa persona ya tiene % sin coste.', c.nombre;
    end if;
    update cem_enrollments
       set precio_lista = coalesce(c.precio, 0), descuento = coalesce(c.precio, 0), precio_final = 0,
           estado = 'activa', fuente = 'beca', promocion = v_codigo,
           cohort_id = coalesce(b.cohort_id, cohort_id)
     where id = e.id;
    update cem_installments
       set estado = 'anulada', saldo = 0,
           nota = trim(both ' ' from coalesce(nota, '') || ' Anulada: el programa pasó a beca ' || v_codigo || '.')
     where enrollment_id = e.id and estado in ('pendiente', 'vencida');
    v_enr := e.id;
  else
    insert into cem_enrollments (profile_id, course_id, cohort_id, precio_lista, descuento, precio_final,
                                 moneda, estado, fuente, promocion)
    values (p_profile_id, b.course_id, b.cohort_id, coalesce(c.precio, 0), coalesce(c.precio, 0), 0,
            coalesce(nullif(btrim(c.moneda), ''), 'EUR'), 'activa', 'beca', v_codigo)
    returning id into v_enr;
  end if;

  update cem_becas
     set estado = 'otorgada', profile_id = p_profile_id, enrollment_id = v_enr, activada_en = now(),
         email = coalesce(email, lower(p.email)),
         nombre = coalesce(nullif(btrim(nombre), ''), btrim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, ''))),
         pais = coalesce(nullif(btrim(pais), ''), p.pais)
   where id = b.id
  returning * into b;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), (select email from cem_profiles where id = auth.uid()),
          'beca.activada', 'cem_becas', b.id, 'medio',
          jsonb_build_object('beca', v_codigo, 'tipo', b.tipo, 'curso', c.nombre,
                             'persona', p_profile_id, 'inscripcion', v_enr, 'valor_usd', b.valor_usd));

  -- A la persona: con correo si se la acaba de becar sin que ella hiciera
  -- nada; sólo en la campana si viene de activar su enlace (ya lo sabe).
  perform cem_notificar(p_profile_id, 'beca_otorgada',
    'Tienes una beca para ' || c.nombre,
    format(E'El CEM te da una beca completa para %s: ya está en tu panel y no tienes que pagar nada.%s\n\nEntra cuando quieras: https://escuelacem.com/plataforma/estudiante/panel.html',
           c.nombre, coalesce(E'\n\n' || nullif(btrim(b.mensaje), ''), '')),
    'estudiante/panel.html', p_avisar);

  -- A quien la pagó: en qué se convirtió su aporte.
  if b.tipo = 'fondo' then
    v_quien := split_part(btrim(b.nombre), ' ', 1);
    for r in
      select d.id, d.numero, d.donante_nombre, d.donante_email, d.idioma, f.monto as parte,
             cem_becas_queda(d.id) as queda
        from cem_becas_financiacion f
        join cem_becas_donaciones d on d.id = f.donacion_id
       where f.beca_id = b.id and f.liberada_en is null and d.donante_email is not null
    loop
      v_en := r.idioma = 'en';
      if v_en then
        v_asunto := 'Your gift is now paying for a scholarship';
        v_cuerpo := format(E'Hi %s,\n\nWe wanted to tell you what your gift %s became: it just paid for %s to study %s.\n\n%s of your gift went to it.%s\n\nThank you for making it possible.\n\nThe CEM team',
          split_part(btrim(r.donante_nombre), ' ', 1), cem_becas_numero('DON', r.numero),
          case when b.publicable and v_quien <> '' then v_quien || '''s scholarship' || coalesce(', from ' || nullif(btrim(b.pais), ''), '')
               else 'a scholarship for someone' || coalesce(' from ' || nullif(btrim(b.pais), ''), '') end,
          c.nombre, cem_becas_usd(r.parte, 'en'),
          case when r.queda > 0 then ' What remains stays in the fund for the next scholarship.' else '' end);
      else
        v_asunto := 'Tu aporte ya está pagando una beca';
        v_cuerpo := format(E'Hola %s:\n\nTe escribimos para contarte en qué se convirtió tu aporte %s: acaba de pagar %s, que va a estudiar %s.\n\nDe tu aporte se usaron %s.%s\n\nGracias por hacerlo posible.\n\nEquipo CEM',
          split_part(btrim(r.donante_nombre), ' ', 1), cem_becas_numero('DON', r.numero),
          case when b.publicable and v_quien <> '' then 'la beca de ' || v_quien || coalesce(', de ' || nullif(btrim(b.pais), ''), '')
               else 'la beca de una persona' || coalesce(' de ' || nullif(btrim(b.pais), ''), '') end,
          c.nombre, cem_becas_usd(r.parte, 'es'),
          case when r.queda > 0 then ' Lo que queda sigue en el fondo para la próxima beca.' else '' end);
      end if;
      perform cem_becas_correo(r.donante_email, v_asunto, v_cuerpo, 'beca-impacto:' || b.id || ':' || r.id);
    end loop;
  end if;

  return v_enr;
end $$;

revoke all on function public.cem_becas_cambio_usd(text) from public, anon, authenticated;
revoke all on function public.cem_becas_cambio_usd_seguro(text) from public, anon, authenticated;
revoke all on function public.cem_becas_valor(uuid) from public, anon, authenticated;
revoke all on function public.cem_becas_disponible() from public, anon, authenticated;
revoke all on function public.cem_becas_queda(uuid) from public, anon, authenticated;
revoke all on function public.cem_becas_token_nuevo() from public, anon, authenticated;
revoke all on function public.cem_becas_hash(text) from public, anon, authenticated;
revoke all on function public.cem_becas_enlace(text) from public, anon, authenticated;
revoke all on function public.cem_becas_ip() from public, anon, authenticated;
revoke all on function public.cem_becas_usd(numeric, text) from public, anon, authenticated;
revoke all on function public.cem_becas_numero(text, bigint) from public, anon, authenticated;
revoke all on function public.cem_becas_correo(text, text, text, text) from public, anon, authenticated;
revoke all on function public.cem_becas_reservar(uuid, numeric, uuid) from public, anon, authenticated;
revoke all on function public.cem_becas_liberar(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.cem_becas_inscribir(uuid, uuid, boolean) from public, anon, authenticated;

-- ═══ 2. LO QUE VE EL PÚBLICO ════════════════════════════════════════════════

-- Todo lo que pinta la página «Ayuda a alguien a estudiar». Cifras reales: si
-- todavía no se ha dado ninguna beca, dice cero, y la página decide no
-- enseñar ceros.
create or replace function public.cem_becas_publico(p_idioma text default 'es')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a cem_becas_ajustes; v_en boolean := lower(coalesce(p_idioma, 'es')) = 'en';
begin
  select * into a from cem_becas_ajustes where id = 1;
  return jsonb_build_object(
    'cifras', (select jsonb_build_object(
        'becas', count(*),
        'valor_usd', coalesce(sum(b.valor_usd), 0),
        'paises', count(distinct lower(btrim(b.pais))) filter (where nullif(btrim(b.pais), '') is not null))
       from cem_becas b where b.estado = 'otorgada'),
    'donantes', (select count(distinct lower(coalesce(nullif(btrim(d.donante_email), ''), btrim(d.donante_nombre))))
                   from cem_becas_donaciones d where d.estado = 'confirmada'),
    'paquetes', coalesce((select jsonb_agg(jsonb_build_object(
          'id', k.id, 'monto', k.monto, 'destacado', k.destacado,
          'nombre', case when v_en then k.nombre_en else k.nombre_es end,
          'descripcion', case when v_en then k.descripcion_en else k.descripcion_es end)
        order by k.orden, k.monto)
       from cem_becas_paquetes k where k.activo), '[]'::jsonb),
    'otro_monto', jsonb_build_object('permitido', coalesce(a.otro_monto, false),
                                     'minimo', a.otro_monto_minimo, 'maximo', a.otro_monto_maximo),
    'convocatorias', coalesce((select jsonb_agg(jsonb_build_object(
          'codigo', v.codigo, 'titulo', v.titulo, 'descripcion', v.descripcion, 'cierra_en', v.cierra_en,
          'quedan', case when v.cupos is null then null
                         else greatest(v.cupos - (select count(*) from cem_becas b
                                                   where b.convocatoria_id = v.id
                                                     and b.estado in ('por_activar', 'otorgada')), 0) end)
        order by (v.codigo = 'becas-cem'), v.creada_en desc)
       from cem_becas_convocatorias v
      where v.activa and (v.abre_en is null or v.abre_en <= now())
        and (v.cierra_en is null or v.cierra_en > now())
        and (v.cupos is null or v.cupos > (select count(*) from cem_becas b
                                            where b.convocatoria_id = v.id
                                              and b.estado in ('por_activar', 'otorgada')))), '[]'::jsonb),
    'historias', case when coalesce(a.mostrar_historias, false) then coalesce((select jsonb_agg(x.h order by x.cuando desc) from (
          select jsonb_build_object('nombre', split_part(btrim(b.nombre), ' ', 1), 'pais', b.pais,
                                    'programa', coalesce(c.nombre, b.curso_texto), 'historia', b.historia) as h,
                 coalesce(b.activada_en, b.creada_en) as cuando
            from cem_becas b left join cem_courses c on c.id = b.course_id
           where b.estado = 'otorgada' and b.publicable
           order by coalesce(b.activada_en, b.creada_en) desc limit 6) x), '[]'::jsonb)
      else '[]'::jsonb end,
    'lista_donantes', case when coalesce(a.mostrar_donantes, false) then coalesce((select jsonb_agg(x.quien order by x.cuando desc) from (
          select coalesce(nullif(btrim(d.organizacion), ''), btrim(d.donante_nombre)) as quien, max(d.confirmada_en) as cuando
            from cem_becas_donaciones d
           where d.estado = 'confirmada' and d.publica
           group by 1 order by 2 desc limit 40) x), '[]'::jsonb)
      else '[]'::jsonb end,
    'precio_medio_usd', (select round(avg(round(c.precio * 0.9, 2) * cem_becas_cambio_usd_seguro(c.moneda)), 2)
                           from cem_courses c where c.estado = 'publicado' and coalesce(c.precio, 0) > 0));
end $$;

-- La convocatoria de un enlace (?c=…), o la general si no viene ninguno.
create or replace function public.cem_beca_convocatoria(p_codigo text default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v cem_becas_convocatorias; v_dadas integer; v_motivo text;
begin
  select * into v from cem_becas_convocatorias
   where codigo = coalesce(nullif(lower(btrim(p_codigo)), ''), 'becas-cem');
  if v.id is null then return jsonb_build_object('existe', false); end if;
  select count(*) into v_dadas from cem_becas
   where convocatoria_id = v.id and estado in ('por_activar', 'otorgada');
  v_motivo := case
    when not v.activa then 'cerrada'
    when v.abre_en is not null and v.abre_en > now() then 'aun_no'
    when v.cierra_en is not null and v.cierra_en <= now() then 'terminada'
    when v.cupos is not null and v_dadas >= v.cupos then 'sin_cupos'
    else null end;
  return jsonb_build_object(
    'existe', true, 'codigo', v.codigo, 'titulo', v.titulo, 'descripcion', v.descripcion,
    'pregunta_extra', v.pregunta_extra, 'abre_en', v.abre_en, 'cierra_en', v.cierra_en,
    'quedan', case when v.cupos is null then null else greatest(v.cupos - v_dadas, 0) end,
    'abierta', v_motivo is null, 'motivo', v_motivo,
    'cursos', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'nombre', c.nombre,
                 'tipo', c.tipo, 'modalidad', c.modalidad, 'horas', c.horas) order by c.nombre)
        from cem_courses c
       where c.estado = 'publicado'
         and (cardinality(v.cursos) = 0 or c.id = any(v.cursos))), '[]'::jsonb));
end $$;

-- Solicitar una beca. Pública: el formulario de las campañas de redes.
create or replace function public.cem_beca_solicitar(p_codigo text, p_datos jsonb)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v cem_becas_convocatorias; f jsonb := coalesce(p_datos, '{}'::jsonb);
  v_gracias text; v_email text; v_nombre text; v_apellido text; v_pais text;
  v_por_que text; v_para_que text; v_curso uuid; v_prog text; v_edad integer;
  v_ip text := cem_becas_ip(); v_id uuid; v_num bigint; v_dadas integer; r record;
begin
  select * into v from cem_becas_convocatorias
   where codigo = coalesce(nullif(lower(btrim(p_codigo)), ''), 'becas-cem');
  if v.id is null then raise exception 'Esa convocatoria no existe.'; end if;
  v_gracias := coalesce(nullif(btrim(v.gracias), ''),
    'Recibimos tu solicitud. El equipo la va a leer con calma; si te eligen, te escribimos a tu correo.');

  -- El campo trampa lo rellena un robot, nunca una persona. Se le contesta
  -- que fue bien, para que no aprenda nada.
  if nullif(btrim(coalesce(f->>'website', '')), '') is not null then
    return jsonb_build_object('ok', true, 'gracias', v_gracias);
  end if;

  if not v.activa or (v.abre_en is not null and v.abre_en > now())
     or (v.cierra_en is not null and v.cierra_en <= now()) then
    raise exception 'Esta convocatoria no está recibiendo solicitudes ahora.';
  end if;
  select count(*) into v_dadas from cem_becas
   where convocatoria_id = v.id and estado in ('por_activar', 'otorgada');
  if v.cupos is not null and v_dadas >= v.cupos then
    raise exception 'Ya se dieron todas las becas de esta convocatoria. Atento a la próxima.';
  end if;

  v_email    := lower(btrim(coalesce(f->>'email', '')));
  v_nombre   := left(btrim(coalesce(f->>'nombre', '')), 80);
  v_apellido := nullif(left(btrim(coalesce(f->>'apellido', '')), 80), '');
  v_pais     := left(btrim(coalesce(f->>'pais', '')), 60);
  v_por_que  := left(btrim(coalesce(f->>'por_que', '')), 3000);
  v_para_que := left(btrim(coalesce(f->>'para_que', '')), 3000);

  if length(v_nombre) < 2 then raise exception 'Hace falta tu nombre.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then raise exception 'Ese correo no parece un correo.'; end if;
  if length(v_pais) < 2 then raise exception 'Dinos en qué país vives.'; end if;
  if length(v_por_que) < 40 then
    raise exception 'Cuéntanos un poco más por qué quieres estudiar: con dos o tres frases basta.';
  end if;
  if length(v_para_que) < 15 then raise exception 'Cuéntanos qué harás con lo que aprendas.'; end if;
  if lower(coalesce(f->>'confirma', '')) not in ('true', 'si', 'sí', '1') then
    raise exception 'Confirma que lo que nos cuentas es cierto.';
  end if;

  begin v_edad := nullif(btrim(coalesce(f->>'edad', '')), '')::integer;
  exception when others then v_edad := null; end;
  if v_edad is not null and (v_edad < 10 or v_edad > 110) then v_edad := null; end if;

  begin v_curso := nullif(btrim(coalesce(f->>'curso_id', '')), '')::uuid;
  exception when others then v_curso := null; end;
  if v_curso is not null and not exists (
       select 1 from cem_courses c where c.id = v_curso and c.estado = 'publicado'
          and (cardinality(v.cursos) = 0 or c.id = any(v.cursos))) then
    raise exception 'Ese programa no está en esta convocatoria.';
  end if;
  v_prog := nullif(left(btrim(coalesce(f->>'programa_texto', '')), 160), '');
  if v_curso is null and v_prog is null then raise exception 'Dinos qué programa quieres estudiar.'; end if;

  -- Frenos: por correo, por dirección (si se sabe) y en total.
  if not cem_rate_limit_consumir('beca-solicitud:' || v_email, 3, 3600, 3600)
     or (v_ip is not null and not cem_rate_limit_consumir('beca-solicitud-ip:' || v_ip, 15, 3600, 3600))
     or not cem_rate_limit_consumir('becas-solicitudes', 400, 3600, 900) then
    raise exception 'Llegaron demasiadas solicitudes seguidas. Prueba otra vez en un rato.';
  end if;

  -- La misma persona otra vez: no se guarda de nuevo, y se le contesta lo
  -- mismo que a todos. No se dice quién ha solicitado y quién no.
  if exists (select 1 from cem_becas_solicitudes
              where convocatoria_id = v.id and lower(email) = v_email) then
    return jsonb_build_object('ok', true, 'gracias', v_gracias);
  end if;

  insert into cem_becas_solicitudes (
    convocatoria_id, course_id, programa_texto, nombre, apellido, email, telefono, pais, ciudad,
    edad, ocupacion, respuestas, redes, como_nos_conocio, origen, campana, acepta_publicar, ip)
  values (
    v.id, v_curso, case when v_curso is null then v_prog end, v_nombre, v_apellido, v_email,
    nullif(left(btrim(coalesce(f->>'telefono', '')), 40), ''), v_pais,
    nullif(left(btrim(coalesce(f->>'ciudad', '')), 80), ''), v_edad,
    nullif(left(btrim(coalesce(f->>'ocupacion', '')), 120), ''),
    jsonb_strip_nulls(jsonb_build_object(
      'por_que', v_por_que, 'para_que', v_para_que,
      'situacion', nullif(left(btrim(coalesce(f->>'situacion', '')), 120), ''),
      'horas', nullif(left(btrim(coalesce(f->>'horas', '')), 60), ''),
      'extra', nullif(left(btrim(coalesce(f->>'extra', '')), 2000), ''))),
    nullif(left(btrim(coalesce(f->>'redes', '')), 120), ''),
    nullif(left(btrim(coalesce(f->>'como_nos_conocio', '')), 120), ''),
    nullif(left(regexp_replace(lower(coalesce(f->>'origen', '')), '[^a-z0-9_.-]', '', 'g'), 40), ''),
    nullif(left(regexp_replace(coalesce(f->>'campana', ''), '[^a-zA-Z0-9_ -]', '', 'g'), 60), ''),
    lower(coalesce(f->>'acepta_publicar', '')) in ('true', 'si', 'sí', '1'),
    v_ip)
  on conflict (convocatoria_id, (lower(email))) do nothing
  returning id, numero into v_id, v_num;

  if v_id is null then
    return jsonb_build_object('ok', true, 'gracias', v_gracias);
  end if;

  perform cem_becas_correo(v_email, 'Recibimos tu solicitud de beca',
    format(E'Hola %s:\n\nRecibimos tu solicitud de beca para %s. Gracias por contarnos tu historia.\n\nEl equipo lee cada solicitud con calma. Si te eligen, te escribimos a este correo con los pasos para empezar: mientras tanto no tienes que hacer nada más.\n\nTu número de solicitud es %s.\n\nMientras esperas, puedes conocer los programas aquí: https://escuelacem.com/programas/\n\nEquipo CEM',
           split_part(v_nombre, ' ', 1),
           coalesce((select nombre from cem_courses where id = v_curso), v_prog),
           cem_becas_numero('SOL', v_num)),
    'beca-solicitud:' || v_id);

  -- Al equipo, en la campana y sin correo: una campaña que funciona trae
  -- cientos. Un aviso cada seis horas basta para saber que hay que mirar.
  for r in select p.id from cem_profiles p
            where p.activo and p.rol in ('coordinador', 'admin', 'superadmin')
  loop
    if not exists (select 1 from cem_notificaciones n
                    where n.profile_id = r.id and n.tipo = 'beca_solicitud'
                      and n.leida_en is null and n.created_at > now() - interval '6 hours') then
      perform cem_notificar(r.id, 'beca_solicitud', 'Hay solicitudes de beca nuevas',
        format('La última: %s, desde %s.', v_nombre, v_pais),
        'admin/becas.html?pestana=solicitudes', false);
    end if;
  end loop;

  return jsonb_build_object('ok', true, 'gracias', v_gracias);
end $$;

-- Lo que enseña la página de un enlace de beca, para que la persona sepa qué
-- le regalan y qué tiene que hacer (crear su cuenta o entrar con la suya).
create or replace function public.cem_beca_enlace_ver(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare b cem_becas; v_programa text;
begin
  if coalesce(length(p_token), 0) < 20 then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  select * into b from cem_becas where token_hash = cem_becas_hash(p_token);
  if b.id is null then return jsonb_build_object('ok', false, 'motivo', 'no_existe'); end if;
  select nombre into v_programa from cem_courses where id = b.course_id;
  if b.estado = 'otorgada' then
    return jsonb_build_object('ok', false, 'motivo', 'usada', 'programa', v_programa);
  elsif b.estado = 'revocada' then
    return jsonb_build_object('ok', false, 'motivo', 'anulada');
  elsif b.vence_en is not null and b.vence_en < now() then
    return jsonb_build_object('ok', false, 'motivo', 'caducada', 'programa', v_programa);
  end if;
  return jsonb_build_object(
    'ok', true, 'programa', v_programa, 'nombre', split_part(btrim(b.nombre), ' ', 1),
    'email', b.email,
    'tiene_cuenta', b.email is not null and exists (select 1 from cem_profiles p where lower(p.email) = lower(b.email)),
    'vence', b.vence_en, 'mensaje', b.mensaje);
end $$;

-- Activar la beca con la sesión ya abierta (estudiante/beca.html). Si la beca
-- iba a un correo, tiene que ser el de esa cuenta: el correo lo verificó el
-- registro normal, que es lo que demuestra que la dirección es suya.
create or replace function public.cem_beca_activar_con_sesion(p_token text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare b cem_becas; p cem_profiles; v_enr uuid; v_programa text;
begin
  if auth.uid() is null then
    raise exception 'Entra con tu cuenta para activar la beca.' using errcode = '42501';
  end if;
  select * into b from cem_becas where token_hash = cem_becas_hash(coalesce(p_token, '')) for update;
  if b.id is null then raise exception 'Ese enlace de beca no existe.'; end if;
  select nombre into v_programa from cem_courses where id = b.course_id;
  if b.estado = 'otorgada' then
    if b.profile_id = auth.uid() then
      return jsonb_build_object('ok', true, 'ya', true, 'programa', v_programa, 'course_id', b.course_id);
    end if;
    raise exception 'Esta beca ya la activó otra persona.';
  end if;
  if b.estado <> 'por_activar' then raise exception 'Esta beca ya no está disponible.'; end if;
  if b.vence_en is not null and b.vence_en < now() then
    raise exception 'Este enlace venció. Pide uno nuevo a quien te lo dio.';
  end if;
  select * into p from cem_profiles where id = auth.uid();
  if b.email is not null and lower(b.email) <> lower(coalesce(p.email, '')) then
    raise exception 'Esta beca es para otra dirección de correo. Entra con la cuenta de esa dirección.'
      using errcode = '42501';
  end if;
  v_enr := cem_becas_inscribir(b.id, auth.uid(), false);
  return jsonb_build_object('ok', true, 'programa', v_programa, 'course_id', b.course_id,
                            'enrollment_id', v_enr);
end $$;

-- Para la página de gracias de una donación. Sin el nombre: el identificador
-- viaja en la dirección de una página con medición.
create or replace function public.cem_beca_donacion_estado(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('hay', true, 'estado', d.estado,
                          'numero', cem_becas_numero('DON', d.numero),
                          'monto', d.monto, 'moneda', d.moneda, 'idioma', d.idioma)
                     from cem_becas_donaciones d where d.id = p_id),
                  jsonb_build_object('hay', false));
$$;

revoke all on function public.cem_becas_publico(text) from public, anon;
grant execute on function public.cem_becas_publico(text) to anon, authenticated, service_role;
revoke all on function public.cem_beca_convocatoria(text) from public, anon;
grant execute on function public.cem_beca_convocatoria(text) to anon, authenticated, service_role;
revoke all on function public.cem_beca_solicitar(text, jsonb) from public, anon;
grant execute on function public.cem_beca_solicitar(text, jsonb) to anon, authenticated;
revoke all on function public.cem_beca_enlace_ver(text) from public, anon;
grant execute on function public.cem_beca_enlace_ver(text) to anon, authenticated;
revoke all on function public.cem_beca_activar_con_sesion(text) from public, anon;
grant execute on function public.cem_beca_activar_con_sesion(text) to authenticated;
revoke all on function public.cem_beca_donacion_estado(uuid) from public, anon;
grant execute on function public.cem_beca_donacion_estado(uuid) to anon, authenticated;

comment on function public.cem_becas_publico(text) is 'Pública a propósito: cifras de becas, paquetes y convocatorias abiertas para la página «Ayuda a alguien a estudiar». Ningún dato personal salvo el nombre de pila y el país de quien aceptó publicarlos, y el nombre de quien donó y pidió salir.';
comment on function public.cem_beca_solicitar(text, jsonb) is 'Pública a propósito: el formulario de solicitud de beca. Valida, frena por correo, por dirección y en total, y contesta lo mismo sea la primera vez o no.';
comment on function public.cem_beca_enlace_ver(text) is 'Pública: lo que enseña un enlace de beca a quien lo tiene. El enlace es la llave.';
comment on function public.cem_beca_donacion_estado(uuid) is 'Pública: el estado de una donación para su página de gracias, sin datos de quien donó.';
comment on function public.cem_beca_convocatoria(text) is 'Pública: la ficha de una convocatoria de becas (sin código, la general) y si está abierta.';
comment on function public.cem_beca_activar_con_sesion(text) is 'Con sesión: activa la beca del enlace en la cuenta de quien entra. Si la beca iba a un correo, tiene que ser el de esa cuenta.';
