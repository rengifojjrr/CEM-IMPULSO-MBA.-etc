-- La ficha «Grupos con inscripción abierta» sólo puede hablar de lo publicado.
--
-- Se construye sola cada día desde las cohortes con estado
-- inscripciones_abiertas o planificada. Le faltaban dos filtros, y el 16 de
-- septiembre se vio la consecuencia: el Cemi de la web tenía en sus fichas
-- «[ENSAYO] Cómo funciona el CEM en 10 minutos: Cohorte de ensayo, empieza
-- el 24/08/2026» — un curso PAUSADO, con una fecha ya pasada. Lo que no está
-- publicado no existe para el asistente, y un grupo que ya empezó no tiene
-- la inscripción abierta para quien pregunta hoy.
create or replace function public.cem_bot_refrescar_ahora()
returns integer
language plpgsql security definer set search_path = public as $$
declare v_n int := 0; v_texto text; r record;
begin
  for r in select c.* from cem_courses c where c.estado = 'publicado' loop
    v_texto := format('Programa: %s (%s).', r.nombre, coalesce(r.tipo, 'curso'));
    if r.descripcion_corta is not null then v_texto := v_texto || ' ' || r.descripcion_corta; end if;
    if r.horas is not null then v_texto := v_texto || format(' Dura %s horas.', r.horas); end if;
    if r.duracion_texto is not null then v_texto := v_texto || ' ' || r.duracion_texto || '.'; end if;
    if r.precio is not null then
      v_texto := v_texto || format(' Precio: %s %s.', r.precio, coalesce(r.moneda, 'EUR'));
    end if;
    if r.cuotas_habilitadas then
      v_texto := v_texto || format(' Se puede pagar en %s cuotas.', coalesce(r.cuotas_cantidad, 3));
    end if;
    v_texto := v_texto || coalesce((
      select ' Módulos: ' || string_agg(m.titulo
               || case when m.certifica then ' (con certificado propio)' else '' end,
               ', ' order by m.orden) || '.'
        from cem_modules m where m.course_id = r.id), '');

    insert into cem_bot_conocimiento (ambito, titulo, contenido, origen, clave, etiquetas)
    values ('ambos', 'Programa · ' || r.nombre, v_texto, 'plataforma',
            'programa:' || r.id::text, array['catalogo','precios'])
    on conflict (clave) do update
      set titulo = excluded.titulo, contenido = excluded.contenido,
          activo = true, actualizado_en = now()
      -- Si alguien reescribió la ficha a mano, su texto manda: por eso sólo se
      -- pisan las que siguen siendo de la plataforma.
      where cem_bot_conocimiento.origen = 'plataforma';
    v_n := v_n + 1;
  end loop;

  update cem_bot_conocimiento set activo = false, actualizado_en = now()
   where origen = 'plataforma' and clave like 'programa:%' and activo
     and not exists (select 1 from cem_courses c
                      where 'programa:' || c.id::text = cem_bot_conocimiento.clave
                        and c.estado = 'publicado');

  select string_agg(format('%s (%s)', m.metodo, m.moneda), ', ' order by m.orden, m.metodo)
    into v_texto from cem_metodos_pago m where m.activo;
  insert into cem_bot_conocimiento (ambito, titulo, contenido, origen, clave, etiquetas)
  values ('ambos', 'Formas de pago',
          case when coalesce(v_texto, '') = ''
            then 'Todavía no hay formas de pago configuradas. Si preguntan cómo pagar, '
                 || 'di que el equipo se lo confirma — NO inventes ninguna.'
            else 'Se puede pagar con: ' || v_texto
                 || '. Los datos concretos de cada método los da el equipo al momento de cobrar; '
                 || 'nunca los inventes ni los des tú.' end,
          'plataforma', 'pagos', array['pagos'])
  on conflict (clave) do update
    set contenido = excluded.contenido, activo = true, actualizado_en = now()
    where cem_bot_conocimiento.origen = 'plataforma';
  v_n := v_n + 1;

  /* Sólo cohortes de cursos PUBLICADOS y que todavía no hayan empezado. */
  select string_agg(format('%s: %s, empieza el %s',
           cu.nombre, co.nombre, to_char(co.fecha_inicio, 'DD/MM/YYYY')), E'\n' order by co.fecha_inicio)
    into v_texto
    from cem_cohorts co join cem_courses cu on cu.id = co.course_id
   where co.estado in ('inscripciones_abiertas','planificada')
     and co.fecha_inicio is not null
     and co.fecha_inicio >= current_date
     and cu.estado = 'publicado';
  insert into cem_bot_conocimiento (ambito, titulo, contenido, origen, clave, etiquetas)
  values ('ambos', 'Grupos con inscripción abierta',
          coalesce(v_texto,
            'Ahora mismo no hay ningún grupo con fecha publicada. Si preguntan cuándo empieza, '
            || 'di que el equipo confirma la fecha — no des ninguna.'),
          'plataforma', 'cohortes', array['fechas'])
  on conflict (clave) do update
    set contenido = excluded.contenido, activo = true, actualizado_en = now()
    where cem_bot_conocimiento.origen = 'plataforma';
  v_n := v_n + 1;

  return v_n;
end $$;
