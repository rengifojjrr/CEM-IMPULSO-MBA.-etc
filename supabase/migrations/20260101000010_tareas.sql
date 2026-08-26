-- Lo que se ejecuta solo, y cuándo
-- ═══════════════════════════════════════════════════════════════════════════
-- Generado por herramientas/volcar-esquema.sql. NO se edita a mano: se
-- vuelve a generar y se perdería lo escrito. Los cambios se hacen en la
-- base y luego se regenera esto.

select cron.schedule('cem_revisar_cuotas_diario', '0 11 * * *', ' select public.cem_revisar_cuotas(3); ');
select cron.schedule('cem-correo-empujar', '* * * * *', 'select public.cem_correo_empujar(25)');
select cron.schedule('cem-correo-recoger', '* * * * *', 'select public.cem_correo_recoger()');
select cron.schedule('cem_alertas_gobierno_diario', '30 11 * * *', ' select public.cem_alertas_gobierno_avisar(); ');
select cron.schedule('cem_informe_mensual', '0 8 1 * *', ' select public.cem_informe_mensual_enviar(); ');
select cron.schedule('cem-stripe-sync-recoger', '* * * * *', 'select public.cem_stripe_sync_revisar()');
select cron.schedule('cem-tasa-bcv-pedir', '15 11,23 * * *', 'select public.cem_tasa_bcv_pedir()');
select cron.schedule('cem-tasa-bcv-recoger', '* * * * *', 'select public.cem_tasa_bcv_recoger()');
select cron.schedule('cem_resumen_semanal_lunes', '0 12 * * 1', 'select public.cem_bot_resumen_semanal_enviar()');
select cron.schedule('cem-puente-vigilar', '*/10 * * * *', 'select public.cem_puente_vigilar()');
