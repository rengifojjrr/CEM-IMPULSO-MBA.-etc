-- Becas y donaciones. 4 de 4: correos y Cemi.

-- 1. LA PLANTILLA DE LOS CORREOS, TAMBIÉN EN INGLÉS, Y CON ENLACES QUE SE PULSAN
--    La misma de 20261028000001_centro_educativo_multigeneracional.sql, con
--    dos cambios:
--    · El recibo de quien dona desde EE. UU. va en inglés. Un correo en inglés
--      empieza por «Hi », «Hello » o «Dear »: entonces la cabecera, el pie y
--      el lang van en inglés. La cola no tiene columna de idioma, y no hace
--      falta: el saludo ya lo dice, y los correos en español empiezan por
--      «Hola».
--    · Las direcciones https://… se vuelven enlaces. El de activar una beca
--      tiene que poder pulsarse, y de paso ganan todos los correos.
CREATE OR REPLACE FUNCTION public.cem_correo_html(p_asunto text, p_cuerpo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select '<!doctype html><html lang="' || case when x.en then 'en' else 'es' end || '"><body style="margin:0;background:#E9ECEF;'
    || 'font-family:Poppins,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1F1F1F">'
    || '<div style="max-width:560px;margin:0 auto;padding:28px 20px">'
    || '<div style="font-weight:700;letter-spacing:.04em;color:#3E7BFF;margin-bottom:18px">'
    || 'CENTRO EDUCATIVO MULTIGENERACIONAL</div>'
    || '<div style="background:#FFFFFF;border:1px solid #E9ECEF;border-radius:14px;padding:24px">'
    || '<h1 style="margin:0 0 16px;font-size:19px;line-height:1.35">'
    || replace(replace(replace(p_asunto, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</h1>'
    || (select string_agg('<p style="margin:0 0 14px;line-height:1.6">'
          || regexp_replace(
               replace(replace(replace(replace(parrafo, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
                       chr(10), '<br>'),
               '(https://[^\s<"]*[^\s<".,;:!?)])', '<a href="\1" style="color:#3E7BFF">\1</a>', 'g')
          || '</p>', '')
        from regexp_split_to_table(coalesce(p_cuerpo, ''), '\n{2,}') as parrafo)
    || '</div>'
    || '<p style="margin:18px 0 0;font-size:12px;color:#6b6b6b;line-height:1.5">'
    || case when x.en
         then 'Educating today, leading tomorrow. · This message was sent automatically from the '
              || 'Centro Educativo Multigeneracional platform. Please don''t reply to this address; '
              || 'write to us from escuelacem.com if you need help.'
         else 'Educamos hoy, lideras mañana. · Este mensaje se envió automáticamente desde la '
              || 'plataforma del Centro Educativo Multigeneracional. No respondas a esta dirección; '
              || 'escríbenos desde tu panel si necesitas ayuda.' end
    || '</p></div></body></html>'
  from (select coalesce(p_cuerpo, '') ~ '^(Hi|Hello|Dear)[ ,]' as en) x;
$function$
;

-- 2. LO QUE CEMI SABE DE LA ESCUELA, AHORA CON LAS BECAS
--    La misma de 20261028000001, más la clave «becas».
create or replace function public.cem_bot_contexto_publico()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ambito', 'visitante',
    'asistente', jsonb_build_object(
      'nombre', coalesce(cem_sitio_publico()->'asistente'->>'nombre', 'Cemi')),
    'escuela', jsonb_build_object(
      'nombre', 'CEM International',
      'largo',  'CEM · Centro Educativo Multigeneracional',
      'desde',  2016,
      'ciudad', 'Caracas',
      'que_es', 'Formación práctica en marketing, negocios, inteligencia artificial y '
                || 'tecnología, con certificado verificable.'),
    'vitrina', cem_vitrina_publica(),
    'contacto', cem_sitio_publico()->'contacto',
    'programas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id, 'nombre', c.nombre, 'subtitulo', c.subtitulo,
               'de_que_va', c.descripcion_corta, 'resumen', c.descripcion_corta,
               'precio', c.precio, 'moneda', c.moneda,
               'horas', c.horas, 'duracion', c.duracion_texto,
               'modalidad', c.modalidad, 'cuotas', c.cuotas_habilitadas,
               'modulos', (select jsonb_agg(jsonb_build_object(
                     'titulo', m.titulo, 'horas', m.horas, 'certifica', m.certifica)
                     order by m.orden)
                   from cem_modules m where m.course_id = c.id))
               order by c.destacado desc, c.nombre)
        from cem_courses c where c.estado = 'publicado'), '[]'::jsonb),
    'lo_aprendido', coalesce((
      select jsonb_agg(jsonb_build_object('titulo', k.titulo, 'contenido', k.contenido)
             order by k.origen, k.titulo)
        from cem_bot_conocimiento k
       where k.activo and k.ambito in ('estudiante', 'ambos')), '[]'::jsonb),
    'como_se_paga', 'De una vez con 10% de descuento, o en 3 o 6 cuotas.',
    'donde_inscribirse', '/plataforma/comprar.html?curso=<id del programa>',
    'becas', jsonb_build_object(
      'como_funciona', 'Hay un fondo de becas que pagan personas y asociaciones que quieren ayudar a '
                       || 'otros a estudiar. Quien quiere una beca la solicita contando por qué; el '
                       || 'equipo lee cada solicitud y a quien elige le paga el programa entero. '
                       || 'Nadie puede prometer una beca: decide el equipo.',
      'solicitar', 'https://escuelacem.com/plataforma/solicitar-beca.html',
      'donar', 'https://escuelacem.com/plataforma/becas.html',
      'deducible', false,
      'convocatorias_abiertas', coalesce((
        select jsonb_agg(jsonb_build_object('titulo', v.titulo, 'cierra_en', v.cierra_en,
                 'enlace', 'https://escuelacem.com/plataforma/solicitar-beca.html?c=' || v.codigo))
          from cem_becas_convocatorias v
         where v.activa and (v.abre_en is null or v.abre_en <= now())
           and (v.cierra_en is null or v.cierra_en > now())), '[]'::jsonb)));
$$;

-- 3. EL GUION DE BECAS DE CEMI YA NO DICE QUE NO HAY BECAS
update public.cem_bot_guiones
   set guion = replace(guion,
         'Si dice «tienen becas?» → Cemi: No tenemos un programa de becas fijo. Si tu situación es especial, cuéntaselo al equipo: déjame tus datos y te contactan.',
         'Si dice «tienen becas?» → Cemi: Sí: hay un fondo de becas que pagan personas que quieren ayudar a otros a estudiar. Se solicita aquí, contando por qué quieres estudiar: https://escuelacem.com/plataforma/solicitar-beca.html. El equipo lee cada solicitud y, a quien elige, le paga el programa entero. Yo no puedo prometerte una, pero solicitarla no cuesta nada.'),
       notas = 'No promete descuentos ni becas: el 10% es el único fijo. Las becas se solicitan y las decide el equipo.',
       actualizado_en = now()
 where tema = 'Descuentos, promociones y becas'
   and guion like '%No tenemos un programa de becas fijo%';

-- cem_bot_sembrar_guion ya no existe (se borró al terminar de sembrar los
-- primeros guiones), así que se inserta directamente, con la misma regla:
-- si ya hay uno con ese tema, no se toca.
insert into public.cem_bot_guiones (ambito, tema, disparadores, guion, siempre, notas, origen)
select 'visitante', 'Donar y ayudar a otros a estudiar',
  array['donar','donacion','donación','quiero ayudar','ayudar a alguien','regalar un curso','patrocinar','apadrinar','aportar','colaborar','pagarle el curso a alguien','beca para otra persona'],
$g$Persona: quiero ayudar a alguien a estudiar
Cemi: Qué bonito. Se hace aquí: https://escuelacem.com/plataforma/becas.html. Eliges un aporte (los paquetes empiezan en 1.000 USD, o pones el monto que quieras) y pagas con tarjeta. El dinero va a un fondo aparte que paga programas completos a quien no puede pagarlos.
Cemi: Puedes aportar al fondo de becas desde https://escuelacem.com/plataforma/becas.html. Te llega un recibo por correo, y cuando tu aporte pague una beca te escriben para contarte a quién ayudó.
Si dice «es deducible de impuestos?» → Cemi: Por ahora no: el aporte no es deducible de impuestos. El recibo que te llega no es un recibo fiscal.
Si dice «quiero donar por transferencia o Zelle» → Cemi: Se puede. Déjame tu nombre y tu correo y el equipo te escribe con los datos; cuando llegue, te mandan el recibo.
Si dice «cómo eligen a quién?» → Cemi: Las personas solicitan la beca contando por qué quieren estudiar. El equipo lee cada solicitud y elige, y el fondo le paga el programa entero.
Si dice «quiero regalarle un curso a alguien en concreto» → Cemi: Eso lo hace el equipo directamente. Déjame tu nombre, tu correo y para quién sería, y te escriben.$g$,
  false,
  'Las donaciones van al fondo de becas. No prometer deducción de impuestos ni becas concretas.', 'semilla'
where not exists (select 1 from public.cem_bot_guiones where tema = 'Donar y ayudar a otros a estudiar');
