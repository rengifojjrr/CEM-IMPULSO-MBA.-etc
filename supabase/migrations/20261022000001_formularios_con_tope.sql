-- Radiografía del 22 de octubre de 2026: topes, acuses y dos permisos.

-- 1. UN TOPE PARA TODO LO QUE ENTRA A CONTACTOS DESDE FUERA
--    Cinco puertas públicas crean contactos: «¿Tienes dudas?»
--    (cem_dejar_contacto), el formulario de contacto (cem_lead_publico_crear),
--    las promociones (cem_campana_pedir), las listas de pre-registro
--    (cem_formulario_enviar) y Cemi (cem_bot_dejar_contacto). Sólo una tenía
--    tope. Con las demás, cualquiera podía llamar en bucle con correos
--    inventados: Contactos lleno de basura y, peor, un acuse por correo a cada
--    dirección — nuestro remitente mandando correos a desconocidos, que es como
--    se quema la reputación de un dominio.
--
--    Va en la tabla y no en cada puerta: así cubre las cinco y la que venga.
--    Sólo cuenta lo que no mete el equipo; importar o crear contactos a mano
--    desde Admin no tiene tope. Sesenta por hora es diez veces lo más que ha
--    entrado nunca en un día (8 contactos en tres meses).
create or replace function public.cem_leads_tope_publico()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if cem_is_staff() then return new; end if;
  if not cem_rate_limit_consumir('leads-publicos', 60, 3600, 900) then
    raise exception 'Estamos recibiendo muchos mensajes ahora mismo. Prueba en un rato.'
      using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.cem_leads_tope_publico() from public, anon, authenticated;

drop trigger if exists cem_leads_tope_publico on public.cem_leads;
create trigger cem_leads_tope_publico
  before insert on public.cem_leads
  for each row execute function public.cem_leads_tope_publico();

-- 2. EL ACUSE, COMO MUCHO UNO AL DÍA POR DIRECCIÓN
--    Un seguro, no un arreglo: hoy cada correo es un solo contacto (índice
--    cem_leads_un_correo_una_persona), así que el acuse ya sale una vez por
--    persona. Esto sólo actúa si un contacto se borra y la misma persona
--    vuelve a escribir el mismo día, y evita que un fallo futuro en esa regla
--    se convierta en una ráfaga de «Recibimos tu mensaje» a la misma
--    dirección. El aviso al equipo sale siempre.
create or replace function public.cem_lead_al_entrar()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nombre text := coalesce(nullif(trim(coalesce(new.nombre, '') || ' ' || coalesce(new.apellido, '')), ''), 'Alguien');
  v_pila   text := coalesce(nullif(split_part(trim(coalesce(new.nombre, '')), ' ', 1), ''), 'hola');
  v_interes text := coalesce(nullif(trim(coalesce(new.interes, '')), ''),
                             (select c.nombre from cem_courses c where c.id = new.course_id),
                             'nuestra formación');
  v_cuerpo text;
begin
  perform cem_avisar_equipo('lead_nuevo',
    format('%s quiere información', v_nombre),
    format('%s · llegó por %s.%s',
           v_interes, coalesce(nullif(trim(coalesce(new.origen, '')), ''), 'la web'),
           case when nullif(trim(coalesce(new.mensaje, '')), '') is not null
                then E'\n\n«' || left(trim(new.mensaje), 400) || '»' else '' end),
    'admin/leads.html?id=' || new.id::text,
    array['cobranza','coordinador','admin','superadmin']);

  if nullif(trim(coalesce(new.email, '')), '') is not null
     and not cem_correo_es_de_mentira(new.email)
     and not exists (select 1 from cem_correo_cola q
                      where q.para = lower(trim(new.email))
                        and q.clave like 'lead-acuse:%'
                        and q.created_at > now() - interval '1 day') then
    v_cuerpo := format(E'Hola %s:\n\n'
      'Recibimos tu mensaje sobre %s. Una persona del equipo te escribe en menos de un día hábil; '
      'si prefieres que te llamemos, responde a este correo con tu número y una hora buena.\n\n'
      'Mientras tanto, puedes ver los programas abiertos en https://escuelacem.com/programas/\n\n'
      'Un saludo,\nEquipo CEM International', v_pila, v_interes);
    insert into cem_correo_cola (para, asunto, cuerpo, clave)
    values (lower(trim(new.email)), 'Recibimos tu mensaje', v_cuerpo, 'lead-acuse:' || new.id::text)
    on conflict (clave) where estado = 'pendiente' do nothing;
  end if;

  return new;
end $$;

-- 3. LAS VISITAS, CON EL NOMBRE ENTERO DE LA PÁGINA
--    Se cortaba a 40 caracteres: «programas/diplomado-inteligencia-artific».
--    Dos programas de nombre largo parecido se contaban como uno. A 80.
create or replace function public.cem_visita_anotar(
  p_pantalla text, p_course_id uuid default null, p_canal text default null, p_campana text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare v_canal text; v_pantalla text; v_campana text; v_curso uuid;
begin
  v_pantalla := lower(left(regexp_replace(coalesce(p_pantalla, 'web'), '[^a-zA-Z0-9_/-]', '', 'g'), 80));
  v_pantalla := trim(both '/' from v_pantalla);
  if v_pantalla = '' then v_pantalla := 'web'; end if;

  v_curso := case when p_course_id is not null
                   and exists (select 1 from cem_courses c where c.id = p_course_id)
                  then p_course_id end;

  v_canal := lower(btrim(coalesce(p_canal, '')));
  v_canal := case
    when v_canal = '' then 'directo'
    when v_canal ~ 'google|bing|duckduck' then 'buscador'
    when v_canal ~ 'instagram|^ig$' then 'instagram'
    when v_canal ~ 'facebook|^fb$' then 'facebook'
    when v_canal ~ 'tiktok' then 'tiktok'
    when v_canal ~ 'whatsapp|^wa$' then 'whatsapp'
    when v_canal ~ 'youtube' then 'youtube'
    when v_canal ~ 'linkedin' then 'linkedin'
    when v_canal ~ 'mail|correo|newsletter' then 'correo'
    when v_canal ~ 'manychat|recurso' then 'recurso'
    else left(regexp_replace(v_canal, '[^a-z0-9_-]', '', 'g'), 24)
  end;
  if v_canal = '' then v_canal := 'directo'; end if;

  v_campana := nullif(left(regexp_replace(coalesce(p_campana,''), '[^a-zA-Z0-9_ -]', '', 'g'), 40), '');

  if not cem_rate_limit_consumir('visita:' || v_pantalla, 600, 60, 60) then
    return;
  end if;

  insert into cem_visitas as v (dia, pantalla, course_id, canal, campana, cuantas)
  values (current_date, v_pantalla, v_curso, v_canal, v_campana, 1)
  on conflict (dia, pantalla, canal,
               coalesce(course_id, '00000000-0000-0000-0000-000000000000'::uuid),
               coalesce(campana, ''))
    do update set cuantas = v.cuantas + 1;
end;
$$;

-- 4. ENCENDER EL PAGO CON TARJETA NO ES COSA DE CUALQUIER SESIÓN
--    `cem_stripe_asegurar_forma_de_pago` crea la cartera de Stripe y vuelve a
--    ACTIVAR el método «Tarjeta de crédito/débito». La podía llamar cualquiera
--    con sesión —un alumno, desde la consola— y deshacer que el equipo lo
--    hubiera apagado. Ninguna pantalla la usa: se queda para el servidor.
revoke all on function public.cem_stripe_asegurar_forma_de_pago() from public, anon, authenticated;
grant execute on function public.cem_stripe_asegurar_forma_de_pago() to service_role;
