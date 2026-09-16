-- Cemi por WhatsApp sabe lo mismo que Cemi en la web.
--
-- 1. EL CONTEXTO DE UN NÚMERO DESCONOCIDO
--    Hasta hoy, a quien escribía por WhatsApp sin estar en la plataforma se le
--    daba el catálogo y las fichas, y nada más: ni qué es la escuela, ni cómo
--    se paga, ni la próxima convocatoria, ni el correo. En la web todo eso
--    sale de cem_bot_contexto_publico(). Aquí se usa la misma función, para
--    que no haya dos definiciones de «lo público» que se separen con el
--    tiempo. Lo identificado no cambia.
create or replace function public.cem_bot_contexto_whatsapp(p_telefono text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tel text := cem_tel_normal(p_telefono);
  v_id uuid; v_ambito text; v_cuantos int;
  v_ctx jsonb;
  v_nombre text;
begin
  -- Con qué nombre se presenta por este canal. Se lee de Configuración y no se
  -- escribe en la función de borde a propósito: cambiarlo no debería exigir un
  -- despliegue. Si no está puesto, se cae al nombre de siempre.
  select coalesce(
           (select s.valor #>> '{}' from cem_settings s where s.clave = 'asistente_nombre_whatsapp'),
           (select s.valor #>> '{}' from cem_settings s where s.clave = 'asistente_nombre'),
           'Cemi')
    into v_nombre;

  select n.profile_id, n.ambito into v_id, v_ambito
    from cem_bot_numeros n
   where n.telefono = v_tel and n.activo;

  if v_id is null then
    select count(*) into v_cuantos from cem_profiles p
     where p.activo and cem_tel_normal(p.telefono) = v_tel and length(v_tel) = 10;
    if v_cuantos = 1 then
      select p.id into v_id from cem_profiles p
       where p.activo and cem_tel_normal(p.telefono) = v_tel;
      -- Aunque sea del equipo: por un número sin registrar, ámbito de alumno.
      v_ambito := 'estudiante';
    end if;
  end if;

  if v_id is null then
    -- Nadie identificado: lo público, lo MISMO que ve la web (la escuela,
    -- cómo se paga, la convocatoria, las fichas, el correo).
    return cem_bot_contexto_publico() || jsonb_build_object(
      'ambito', 'estudiante',
      'canal', 'whatsapp',
      'asistente', jsonb_build_object('nombre', v_nombre),
      'quien', null);
  end if;

  -- Identificado: se le pide el contexto a la MISMA función que usa la web,
  -- ejecutándola como esa persona. Así no hay dos definiciones de «lo que
  -- puede ver fulano» que se puedan separar con el tiempo.
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_id::text, 'role', 'authenticated')::text, true);
  begin
    v_ctx := cem_bot_contexto(v_ambito);
  exception when others then
    v_ctx := jsonb_build_object('ambito', 'estudiante', 'quien', null);
  end;
  perform set_config('request.jwt.claims', null, true);

  return coalesce(v_ctx, '{}'::jsonb) || jsonb_build_object(
    'canal', 'whatsapp',
    'asistente', jsonb_build_object('nombre', v_nombre));
end $$;

-- 2. DOS GUIONES QUE SÓLO PASAN POR WHATSAPP
--    Lo que se escribe por WhatsApp y no por la web: mandar el comprobante y
--    pedir que «me mandes la info por aquí». Ninguno confirma un pago ni da un
--    precio: eso sigue saliendo de la base y del equipo. Se siembran si no hay
--    otro con el mismo tema.
insert into public.cem_bot_guiones (ambito, tema, disparadores, guion, notas, origen)
select 'ambos', 'Ya pagué, te mando el comprobante',
  array['ya pague','te mando el comprobante','aqui esta el pago','hice la transferencia','hice el pago movil','pago movil','comprobante','captura del pago','ya transferi','ya deposite','te mande el pago'],
$g$Persona: ya pagué, te mando el comprobante
Cemi: Gracias! Se lo paso al equipo para que lo verifique y te confirmen por aquí. [usa avisar_al_equipo]
Cemi: Recibido. Yo no puedo confirmar pagos, eso lo revisa el equipo; te escriben en cuanto lo vean. [usa avisar_al_equipo]
Si dice «pero ya está pagado, actívame ya» → Cemi: Te entiendo. La activación la hace el equipo cuando verifica el pago, y ya les avisé. No suele tardar.
Si dice «cuánto tarda?» → Cemi: Normalmente el mismo día. Si no te escriben, me dices y vuelvo a avisar.
Si manda una imagen sin texto → Cemi: Vi que mandaste una imagen. Si es un comprobante, ya le aviso al equipo para que lo revise.$g$,
  'Por WhatsApp llegan comprobantes. Nunca confirma el pago: avisa al equipo y lo dice.',
  'semilla'
where not exists (select 1 from public.cem_bot_guiones where tema = 'Ya pagué, te mando el comprobante');

insert into public.cem_bot_guiones (ambito, tema, disparadores, guion, notas, origen)
select 'ambos', 'Mándame la info por aquí: temario, precios, un audio',
  array['mandame la info','pasame la info','mandame informacion','el temario','enviame','un pdf','folleto','brochure','me mandas','un audio','nota de voz','por aqui mismo','mandame los precios'],
$g$Persona: mándame la info por aquí
Cemi: Claro. Dime cuál te interesa y te paso lo esencial: de qué va, cuánto dura y cómo se paga.
Cemi: Te cuento lo principal de [programa]: [duración], [precio]. Qué parte quieres con más detalle?
Si dice «mándame el temario» → Cemi: Los módulos son: [módulos del programa]. Si quieres el detalle completo en PDF, se lo pido al equipo. [usa avisar_al_equipo]
Si dice «mándame un audio» → Cemi: Por aquí te escribo, que queda claro y lo puedes releer. Qué quieres saber primero?
Si manda un audio → Cemi: Los audios no los puedo escuchar por aquí. Me lo escribes en dos líneas y te contesto al momento.
Si dice «mándame los precios» → Cemi: [precio del programa]. Se paga [cómo se paga]. Te sirve ese?$g$,
  'Por WhatsApp piden que se lo manden todo por el chat. Lo esencial lo da; lo largo (PDF) lo manda el equipo.',
  'semilla'
where not exists (select 1 from public.cem_bot_guiones where tema = 'Mándame la info por aquí: temario, precios, un audio');
