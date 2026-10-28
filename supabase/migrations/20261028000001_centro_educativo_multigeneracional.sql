-- CEM es Centro Educativo Multigeneracional.
--
-- Hasta hoy, la cabecera y el pie de todos los correos, y lo que Cemi sabe de
-- la escuela, decían «Centro de Estudios de Marketing». No es lo que significa
-- la sigla. Lo vio el dueño en un correo el 28 de octubre de 2026.
--
-- Y de paso, ese mismo correo: «Se anulo tu pedido del diploma en fisico».
-- Los avisos del diploma en físico salían sin tildes —«Tu diploma ya esta en la
-- imprenta» se mandó 38 veces así—. En el repositorio la función las tiene
-- (20260910000001_pedidos_fisicos_en_lote.sql); en la base había quedado otra
-- versión. Se vuelve a poner la del repositorio.

-- 1. LA CABECERA Y EL PIE DE TODOS LOS CORREOS
CREATE OR REPLACE FUNCTION public.cem_correo_html(p_asunto text, p_cuerpo text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select '<!doctype html><html lang="es"><body style="margin:0;background:#E9ECEF;'
    || 'font-family:Poppins,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1F1F1F">'
    || '<div style="max-width:560px;margin:0 auto;padding:28px 20px">'
    || '<div style="font-weight:700;letter-spacing:.04em;color:#3E7BFF;margin-bottom:18px">'
    || 'CENTRO EDUCATIVO MULTIGENERACIONAL</div>'
    || '<div style="background:#FFFFFF;border:1px solid #E9ECEF;border-radius:14px;padding:24px">'
    || '<h1 style="margin:0 0 16px;font-size:19px;line-height:1.35">'
    || replace(replace(replace(p_asunto, '&', '&amp;'), '<', '&lt;'), '>', '&gt;') || '</h1>'
    || (select string_agg('<p style="margin:0 0 14px;line-height:1.6">'
          || replace(replace(replace(replace(parrafo, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
                     chr(10), '<br>') || '</p>', '')
        from regexp_split_to_table(p_cuerpo, '\n{2,}') as parrafo)
    || '</div>'
    || '<p style="margin:18px 0 0;font-size:12px;color:#6b6b6b;line-height:1.5">'
    || 'Educamos hoy, lideras mañana. · Este mensaje se envió automáticamente desde la '
    || 'plataforma del Centro Educativo Multigeneracional. No respondas a esta dirección; '
    || 'escríbenos desde tu panel si necesitas ayuda.</p></div></body></html>';
$function$
;

-- 2. LO QUE CEMI SABE DE LA ESCUELA
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
    'donde_inscribirse', '/plataforma/comprar.html?curso=<id del programa>');
$$;

-- El guion «Qué es el CEM», que lo explicaba con el nombre viejo.
update public.cem_bot_guiones
   set guion = replace(guion, 'el Centro de Estudios de Marketing', 'el Centro Educativo Multigeneracional'),
       actualizado_en = now()
 where guion like '%el Centro de Estudios de Marketing%';

-- 3. LOS AVISOS DEL DIPLOMA EN FÍSICO, CON SUS TILDES
create or replace function public.cem_aviso_pedido_fisico(p_estado text, p_titulo text)
returns jsonb
language sql
immutable
set search_path to 'public'
as $function$
  select case p_estado
    when 'en imprenta' then jsonb_build_object(
      'titulo', 'Tu diploma ya está en la imprenta',
      'cuerpo', format('Tu %s se está imprimiendo. Te avisamos en cuanto salga hacia tu dirección.',
                       lower(coalesce(p_titulo, 'diploma'))),
      'correo', false)
    when 'enviado' then jsonb_build_object(
      'titulo', 'Tu diploma va en camino',
      'cuerpo', format('Tu %s salió hacia la dirección que nos diste. Si no llega en unos días, escríbenos.',
                       lower(coalesce(p_titulo, 'diploma'))),
      'correo', true)
    when 'entregado' then jsonb_build_object(
      'titulo', 'Tu diploma fue entregado',
      'cuerpo', format('Consta que tu %s llegó a su destino. Si no lo recibiste, dínoslo y lo revisamos.',
                       lower(coalesce(p_titulo, 'diploma'))),
      'correo', true)
    when 'anulado' then jsonb_build_object(
      'titulo', 'Se anuló tu pedido del diploma en físico',
      'cuerpo', 'Tu diploma digital sigue intacto y lo puedes descargar cuando quieras. Si esto es un error, escríbenos.',
      'correo', true)
    else null
  end;
$function$;
