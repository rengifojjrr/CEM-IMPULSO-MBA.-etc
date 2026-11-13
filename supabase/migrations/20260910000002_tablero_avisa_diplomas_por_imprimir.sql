-- El tablero avisa de los diplomas por imprimir (10 de septiembre de 2026)
-- ═══════════════════════════════════════════════════════════════════════════
-- RECUPERADO, NO ESCRITO. Se aplicó en producción con apply_migration después
-- del volcado del 29 de agosto (los archivos 20260101*) y no dejó archivo en
-- este repositorio. Por eso la reconstrucción desde cero no lo tenía, y por eso
-- 20260924000001_promocion_en_la_web.sql daba 12 errores: tocaba lo que aquí
-- se crea. Se descubrió el 13 de noviembre de 2026.
--
-- Cada bloque es la migración tal cual está en
-- supabase_migrations.schema_migrations de producción, copiada byte a byte
-- entre sus marcas (leída con un select, sin escribir nada allí). La marca de
-- inicio lleva el md5 que calcula producción sobre ese mismo texto, y
-- herramientas/revisar.mjs comprueba que sigue cuadrando. Para cotejarlo:
--
--   select version, md5(array_to_string(statements, E'\n'))
--     from supabase_migrations.schema_migrations where version = '…';
--
-- NO se edita a mano. Si algo de aquí tiene que cambiar, va en una migración
-- nueva, como todo. Los comentarios de dentro son de quien escribió cada
-- migración en septiembre, y hablan de aquel momento.
--
-- En producción se aplicó a las 18:09, un minuto después de
-- pedidos_fisicos_en_lote, que sí está aquí (20260910000001). Ésta se quedó
-- fuera, así que la reconstrucción tenía una versión vieja de
-- cem_pendientes_de_hoy: sin la tarjeta de los diplomas en papel.

-- ┌── producción 20260910180910 · tablero_avisa_diplomas_por_imprimir · md5 26ba106dff8814a5b0d6efe2fd8d0c6c
-- Una tarjeta mas en «lo pendiente»: quien esta esperando su diploma en papel.
-- Sin esto, un pedido nuevo solo se veia entrando a Diplomas en fisico a mirar,
-- y quien lo pidio se quedaba esperando sin que nadie en la escuela lo supiera.
create or replace function public.cem_pendientes_de_hoy()
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select case when not (cem_is_staff() or cem_puede_cobranza()) then '[]'::jsonb else
    jsonb_build_array(
      jsonb_build_object('clave','pagos','que','Pagos por verificar',
        'n', (select count(*) from cem_payments where estado = 'reportado'),
        'url','pagos-verificar.html','icono','fact_check','tono','warn'),

      jsonb_build_object('clave','solicitudes','que','Solicitudes por resolver',
        'n', (select count(*) from cem_solicitudes_inscripcion where estado = 'pendiente')
           + (select count(*) from cem_solicitudes_perfil where estado = 'pendiente'),
        'url','inscripciones.html','icono','assignment_ind','tono','warn'),

      jsonb_build_object('clave','diplomas_fisicos','que','Diplomas en papel por imprimir',
        'n', (select count(*) from cem_diploma_fisico where estado = 'pedido'),
        'url','diplomas-fisicos.html','icono','local_shipping','tono','warn'),

      jsonb_build_object('clave','entregas','que','Entregas sin corregir',
        'n', (select count(*) from cem_submissions where estado = 'entregada'),
        'url','calificar.html','icono','grade','tono','info'),

      jsonb_build_object('clave','dudas','que','Dudas sin responder',
        'n', (select count(*) from cem_dudas d
               where not d.eliminada and not d.resuelta
                 and not exists (select 1 from cem_duda_respuestas r
                                  where r.duda_id = d.id and r.de_docente and not r.eliminada)),
        'url','contenido.html','icono','contact_support','tono','info'),

      jsonb_build_object('clave','contactos','que','Contactos de la web sin atender',
        'n', (select count(*) from cem_leads where estado = 'nuevo'),
        'url','leads.html','icono','contact_phone','tono','info'),

      jsonb_build_object('clave','revision','que','Contenido esperando revisión',
        'n', (select count(*) from cem_content_reviews where estado = 'pendiente'),
        'url','revision.html','icono','fact_check','tono','neutral'),

      jsonb_build_object('clave','apelaciones','que','Apelaciones abiertas',
        'n', (select count(*) from cem_appeals
               where estado in ('recibida','en_analisis','requiere_info')),
        'url','apelaciones.html','icono','gavel','tono','err'),

      jsonb_build_object('clave','soporte','que','Tickets de soporte abiertos',
        'n', (select count(*) from cem_tickets
               where estado in ('abierto','en_proceso','esperando')),
        'url','soporte.html','icono','support_agent','tono','neutral'),

      jsonb_build_object('clave','mora','que','Cuotas con más de 30 días de mora',
        'n', (select count(*) from cem_installments
               where estado in ('vencida','parcial')
                 and coalesce(saldo, monto) > 0
                 and fecha_vencimiento < current_date - 30),
        'url','inscripciones.html','icono','running_with_errors','tono','err')
    ) end;
$function$;
-- └── fin de 20260910180910
