-- Quien ya nos había dejado sus datos y vuelve a escribir.
--
-- `cem_leads` admite un solo contacto por correo (cem_leads_un_correo_una_persona),
-- y `cem_lead_publico_crear` —la ventana «Contacto» / «Avísame» de la
-- plataforma, y Cemi a través de cem_bot_dejar_contacto— insertaba sin mirar.
-- Resultado: la segunda vez que alguien escribía con el mismo correo, la base
-- contestaba «duplicate key value violates unique constraint» y su mensaje no
-- llegaba a nadie. Justo la persona más interesada: la que vuelve. Se vio en
-- la radiografía del 22 de octubre de 2026, al probar el tope de 20261022000001.
--
-- «¿Tienes dudas?» (cem_dejar_contacto) sí lo manejaba: sumaba el mensaje
-- nuevo a la ficha y bajaba el viejo a la nota interna. Pero en silencio: el
-- equipo no se enteraba de que esa persona había vuelto a escribir.
--
-- Ahora las dos hacen lo mismo, en un solo sitio (cem_lead_sumar_mensaje), y
-- cuando trae un mensaje nuevo el equipo recibe «X volvió a escribir».

-- 1. SUMAR UN MENSAJE A UN CONTACTO QUE YA EXISTE
--    Es lo que hacía cem_dejar_contacto, sacado a una función para que lo
--    usen las dos puertas, más el aviso. Interna: no la llama nadie de fuera.
create or replace function public.cem_lead_sumar_mensaje(
  p_lead uuid, p_nombre text, p_telefono text, p_mensaje text,
  p_interes text default null, p_course_id uuid default null,
  p_como_nos_conocio text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_lead cem_leads;
  v_msj  text := nullif(left(trim(coalesce(p_mensaje, '')), 2000), '');
begin
  select * into v_lead from cem_leads where id = p_lead;
  if v_lead.id is null then return; end if;

  /* Lo nuevo va a `mensaje` —que es lo primero que se lee al abrir la ficha—
     y lo viejo baja a la nota interna con su fecha. Machacarlo sin más
     perdería la consulta anterior, que a veces es la que explica de qué va la
     conversación. */
  update cem_leads set
    nombre   = case when coalesce(trim(nombre), '') = ''
                    then coalesce(nullif(left(trim(coalesce(p_nombre, '')), 120), ''), nombre)
                    else nombre end,
    telefono = coalesce(telefono, nullif(left(trim(coalesce(p_telefono, '')), 40), '')),
    interes  = coalesce(interes, nullif(left(trim(coalesce(p_interes, '')), 120), '')),
    course_id = coalesce(course_id, p_course_id),
    como_nos_conocio = coalesce(como_nos_conocio,
      nullif(left(trim(coalesce(p_como_nos_conocio, '')), 60), '')),
    mensaje = coalesce(v_msj, mensaje),
    nota_interna = case
      when v_msj is null or v_lead.mensaje is null then nota_interna
      else nullif(trim(both E'\n' from concat_ws(E'\n\n', nota_interna,
        to_char(v_lead.created_at, 'DD/MM/YYYY') || ' · escribió antes: ' || v_lead.mensaje)), '')
    end
   where id = v_lead.id;

  if v_msj is not null then
    perform cem_avisar_equipo('lead_nuevo',
      format('%s volvió a escribir',
             coalesce(nullif(trim(coalesce(v_lead.nombre, '') || ' ' || coalesce(v_lead.apellido, '')), ''),
                      'Un contacto')),
      E'«' || left(v_msj, 400) || '»',
      'admin/leads.html?id=' || v_lead.id::text,
      array['cobranza','coordinador','admin','superadmin']);
  end if;
end $$;
revoke all on function public.cem_lead_sumar_mensaje(uuid, text, text, text, text, uuid, text)
  from public, anon, authenticated;

-- 2. LA VENTANA «CONTACTO» Y CEMI
--    Si el correo ya es de un contacto: el mismo mensaje dos veces es un
--    doble clic (no hace nada); uno distinto se suma a su ficha. Como mucho
--    cinco por hora y correo, que era el tope que ya tenía. Lo demás, igual.
create or replace function public.cem_lead_publico_crear(
  p_nombre text, p_email text, p_telefono text default null, p_mensaje text default null,
  p_interes text default null, p_course_id uuid default null, p_origen text default 'web')
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_nombre text := nullif(trim(coalesce(p_nombre,'')), '');
  v_email text := lower(nullif(trim(coalesce(p_email,'')), ''));
  v_msj   text := nullif(left(trim(coalesce(p_mensaje, '')), 2000), '');
  v_lead  cem_leads;
  v_id uuid;
  v_ultima_hora int;
begin
  if v_nombre is null or length(v_nombre) < 2 then
    raise exception 'Hace falta tu nombre.';
  end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then
    raise exception 'Ese correo no parece un correo.';
  end if;

  select * into v_lead from cem_leads where lower(trim(email)) = v_email limit 1;
  if v_lead.id is not null then
    if v_msj is null or v_lead.mensaje is not distinct from v_msj then
      return jsonb_build_object('ok', true, 'id', v_lead.id, 'yaTeniamos', true);
    end if;
    if not cem_rate_limit_consumir('lead-vuelve:' || v_email, 5, 3600, 3600) then
      raise exception 'Ya recibimos tus mensajes. Te escribimos enseguida.';
    end if;
    perform cem_lead_sumar_mensaje(v_lead.id, v_nombre, p_telefono, v_msj, p_interes, p_course_id, null);
    return jsonb_build_object('ok', true, 'id', v_lead.id, 'yaTeniamos', true);
  end if;

  select count(*) into v_ultima_hora from cem_leads
   where created_at > now() - interval '1 hour' and origen = coalesce(p_origen, 'web');
  if v_ultima_hora >= 200 then
    raise exception 'Estamos recibiendo muchos mensajes ahora mismo. Prueba en un rato.';
  end if;

  insert into cem_leads (nombre, email, telefono, mensaje, interes, course_id, origen, estado)
  values (v_nombre, v_email, nullif(trim(coalesce(p_telefono,'')), ''),
          nullif(trim(coalesce(p_mensaje,'')), ''),
          nullif(trim(coalesce(p_interes,'')), ''),
          p_course_id, coalesce(nullif(trim(p_origen),''), 'web'), 'nuevo')
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end $$;

-- 3. «¿TIENES DUDAS?»
--    Igual que antes, pero el contacto que vuelve pasa por la misma función
--    (y por tanto avisa al equipo) y con el mismo tope de cinco por hora.
create or replace function public.cem_dejar_contacto(
  p_nombre text, p_email text default null, p_telefono text default null,
  p_mensaje text default null, p_interes text default null, p_course_id uuid default null,
  p_como_nos_conocio text default null, p_origen text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_nombre text := left(trim(coalesce(p_nombre, '')), 120);
  v_email  text := nullif(lower(left(trim(coalesce(p_email, '')), 200)), '');
  v_tel    text := nullif(left(trim(coalesce(p_telefono, '')), 40), '');
  v_msj    text := nullif(left(trim(coalesce(p_mensaje, '')), 2000), '');
  v_lead   cem_leads;
begin
  if v_nombre = '' then
    raise exception 'Hace falta un nombre para poder responderte.';
  end if;
  if v_email is null and v_tel is null then
    raise exception 'Déjanos un correo o un teléfono, o no podremos contestarte.';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]{2,}$' then
    raise exception 'Ese correo no parece una dirección válida.';
  end if;

  if v_email is not null then
    select * into v_lead from cem_leads where lower(trim(email)) = v_email limit 1;
  end if;

  if v_lead.id is null then
    insert into cem_leads(nombre, email, telefono, mensaje, interes, course_id,
                          como_nos_conocio, origen)
    values (v_nombre, v_email, v_tel, v_msj,
            nullif(left(trim(coalesce(p_interes, '')), 120), ''),
            p_course_id,
            nullif(left(trim(coalesce(p_como_nos_conocio, '')), 60), ''),
            nullif(left(trim(coalesce(p_origen, '')), 120), ''));
    return jsonb_build_object('ok', true);
  end if;

  -- Escribir dos veces lo mismo es un doble clic, no dos consultas.
  if v_msj is not null and v_lead.mensaje is not distinct from v_msj then
    return jsonb_build_object('ok', true, 'yaTeniamos', true);
  end if;

  if not cem_rate_limit_consumir('lead-vuelve:' || v_email, 5, 3600, 3600) then
    raise exception 'Ya recibimos tus mensajes. Te escribimos enseguida.';
  end if;
  perform cem_lead_sumar_mensaje(v_lead.id, v_nombre, v_tel, v_msj, p_interes, p_course_id,
                                 p_como_nos_conocio);

  return jsonb_build_object('ok', true, 'yaTeniamos', true);
end; $$;
