-- ═══════════════════════════════════════════════════════════════════════════
-- La próxima convocatoria, legible desde fuera
-- ═══════════════════════════════════════════════════════════════════════════
-- Configuración tiene desde hace tiempo un campo «Próxima convocatoria» cuya
-- ayuda dice: «Sale publicada en la portada y en el catálogo mientras la fecha
-- no haya pasado». Se guardaba en cem_settings y NO LO LEÍA NADIE: ni el
-- generador de páginas, ni app.js. Un administrador podía rellenarlo, guardar,
-- y no pasaba nada.
--
-- Es también la «urgencia legítima» que pide el punto 3.4 de la auditoría del
-- 3 de septiembre de 2026: no un reloj que se reinicia, sino una fecha real
-- que aguanta que alguien llame a preguntar.
--
-- Esta función es la mitad que faltaba. Sigue el molde de
-- cem_paises_de_la_portada: SECURITY DEFINER para poder leer cem_settings, que
-- va con RLS y sin políticas, y ejecutable por anon porque el dato es público
-- por definición — es lo que se quiere publicar. La otra mitad está en
-- herramientas/temario.mjs (traerConvocatoria) y en generar-seo.mjs
-- (lineaConvocatoria), que la pintan en la portada y en la ficha de cada
-- diplomado.
--
-- Devuelve NULL si no hay fecha o si la fecha ya pasó. Ese segundo caso es la
-- razón de que el filtro esté aquí y no en quien la pinta: una convocatoria
-- vencida en la portada es peor que no poner nada —dice que aquí no mira
-- nadie—, y las páginas generadas se regeneran cada día, así que se apaga sola
-- a la mañana siguiente sin que nadie tenga que acordarse.
create or replace function public.cem_convocatoria_publica()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select case
    when (valor->>'fecha') is null or (valor->>'fecha') = '' then null
    when (valor->>'fecha')::date < current_date then null
    else jsonb_build_object(
      'fecha',  valor->>'fecha',
      'titulo', nullif(trim(coalesce(valor->>'titulo', '')), ''),
      'nota',   nullif(trim(coalesce(valor->>'nota', '')), ''))
  end
  from cem_settings where clave = 'proxima_convocatoria';
$$;

revoke all on function public.cem_convocatoria_publica() from public;
grant execute on function public.cem_convocatoria_publica() to anon, authenticated;

comment on function public.cem_convocatoria_publica() is
  'La próxima convocatoria de Configuración, o NULL si no hay fecha o ya pasó. Pública.';

-- ── De paso: el ajuste «moneda base» decía USD ─────────────────────────────
-- La moneda base de la plataforma es el euro (MONEDA_BASE en app.js) y todos
-- los importes guardados están en euros. El desplegable de Configuración salía
-- en USD y nadie leía el valor, así que era inerte; pero la pantalla decía una
-- cosa y el sistema hacía otra. El campo pasa a ser de sólo lectura y el dato
-- guardado se corrige aquí, para que la base y el código digan lo mismo.
update public.cem_settings
   set valor = jsonb_set(valor, '{moneda_base}', '"EUR"')
 where clave = 'institucion' and valor->>'moneda_base' is distinct from 'EUR';
