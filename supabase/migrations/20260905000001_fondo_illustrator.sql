-- El certificado de Illustrator decía «Illustator».
--
-- El nombre del curso va pintado dentro del JPG del fondo, no es un dato, así
-- que la falta salía en los 19 certificados emitidos con esa plantilla y en
-- los dos sitios donde aparece: el título grande y la pestaña roja de la
-- esquina. El fondo corregido está en el repositorio, en
-- certificados/fondos/8_IA_ILLUSTRATOR.jpg, y se sirve desde el propio sitio.
--
-- IMPORTANTE — el orden importa. Esta migración sólo debe aplicarse cuando el
-- archivo ya esté publicado, es decir, cuando esta rama esté fusionada en main
-- y GitHub Pages lo haya subido. Comprobación de un vistazo:
--
--   curl -sI https://escuelacem.com/certificados/fondos/8_IA_ILLUSTRATOR.jpg
--
-- Si eso no devuelve 200, aplicarla dejaría los certificados sin fondo, que es
-- peor que la falta de ortografía. En ese caso, esperar.
--
-- Los certificados se dibujan al vuelo a partir de la plantilla, así que con
-- cambiar esta dirección quedan bien los 19 de golpe —los ya emitidos y los
-- que se emitan— sin tocar ni un solo registro ni cambiar ningún código de
-- verificación. Sólo hay que volver a descargarlos y reenviarlos.
--
-- Para deshacerlo, el fondo viejo sigue en el almacenamiento, intacto:
--   https://vajbsfgojtunamhrzrpf.supabase.co/storage/v1/object/public/cem-assets/fondos/b4d1db24-b7b3-4a69-b7c3-ac1ebd76d167.jpg

update public.cert_templates
   set config = jsonb_set(
         config,
         '{background}',
         to_jsonb('https://escuelacem.com/certificados/fondos/8_IA_ILLUSTRATOR.jpg'::text)
       ),
       updated_at = now()
 where nombre = '8_IA_ILLUSTRATOR'
   and config->>'background' <> 'https://escuelacem.com/certificados/fondos/8_IA_ILLUSTRATOR.jpg';
