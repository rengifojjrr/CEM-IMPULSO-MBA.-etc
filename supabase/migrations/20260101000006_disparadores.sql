-- Disparadores
-- ═══════════════════════════════════════════════════════════════════════════
-- Generado por herramientas/volcar-esquema.sql. NO se edita a mano: se
-- vuelve a generar y se perdería lo escrito. Los cambios se hacen en la
-- base y luego se regenera esto.

CREATE TRIGGER cem_notificar_apelacion_trg AFTER INSERT OR UPDATE OF estado ON public.cem_appeals FOR EACH ROW EXECUTE FUNCTION cem_notificar_apelacion();
CREATE TRIGGER cem_notificar_certificado_trg AFTER INSERT ON public.cem_certificates FOR EACH ROW EXECUTE FUNCTION cem_notificar_certificado();
CREATE TRIGGER cem_bot_catalogo_cohortes AFTER INSERT OR DELETE OR UPDATE OF estado, nombre, fecha_inicio ON public.cem_cohorts FOR EACH STATEMENT EXECUTE FUNCTION cem_bot_al_cambiar_catalogo();
CREATE TRIGGER cem_bot_catalogo_cursos AFTER INSERT OR DELETE OR UPDATE OF estado, nombre, precio, moneda, horas, duracion_texto, descripcion_corta, tipo, cuotas_habilitadas, cuotas_cantidad ON public.cem_courses FOR EACH STATEMENT EXECUTE FUNCTION cem_bot_al_cambiar_catalogo();
CREATE TRIGGER cem_stripe_reflejar_curso AFTER INSERT OR UPDATE ON public.cem_courses FOR EACH ROW EXECUTE FUNCTION cem_tg_stripe_reflejar_curso();
CREATE TRIGGER cem_tg_activar_si_es_gratis BEFORE INSERT ON public.cem_enrollments FOR EACH ROW EXECUTE FUNCTION cem_activar_si_es_gratis();
CREATE TRIGGER cem_gastos_completar_tr BEFORE INSERT OR UPDATE OF monto, moneda, fecha ON public.cem_gastos FOR EACH ROW EXECUTE FUNCTION cem_gastos_completar();
CREATE TRIGGER cem_identidad_sin_autoaprobarse BEFORE UPDATE ON public.cem_identidad FOR EACH ROW EXECUTE FUNCTION cem_identidad_sin_autoaprobarse();
CREATE TRIGGER cem_bot_catalogo_pagos AFTER INSERT OR DELETE OR UPDATE OF metodo, moneda, activo, orden ON public.cem_metodos_pago FOR EACH STATEMENT EXECUTE FUNCTION cem_bot_al_cambiar_catalogo();
CREATE TRIGGER cem_bot_catalogo_modulos AFTER INSERT OR DELETE OR UPDATE OF titulo, orden, certifica ON public.cem_modules FOR EACH STATEMENT EXECUTE FUNCTION cem_bot_al_cambiar_catalogo();
CREATE TRIGGER cem_anotar_concesion BEFORE INSERT OR UPDATE OF monto, metodo, fecha ON public.cem_payments FOR EACH ROW EXECUTE FUNCTION cem_tg_anotar_concesion();
CREATE TRIGGER cem_notificar_pago_trg AFTER INSERT OR UPDATE OF estado ON public.cem_payments FOR EACH ROW EXECUTE FUNCTION cem_notificar_pago();
CREATE TRIGGER cem_tg_activar_al_pagar AFTER INSERT OR UPDATE OF estado ON public.cem_payments FOR EACH ROW EXECUTE FUNCTION cem_activar_al_pagar();
CREATE TRIGGER cem_audit_perfil_sensible_trg AFTER UPDATE ON public.cem_profiles FOR EACH ROW EXECUTE FUNCTION cem_audit_perfil_sensible();
CREATE TRIGGER cem_bloquear_cambio_rol_trg BEFORE UPDATE OF rol, activo ON public.cem_profiles FOR EACH ROW EXECUTE FUNCTION cem_bloquear_cambio_rol_no_admin();
CREATE TRIGGER cem_perfil_nombre_bajo_llave BEFORE UPDATE ON public.cem_profiles FOR EACH ROW EXECUTE FUNCTION cem_perfil_nombre_bajo_llave();
CREATE TRIGGER cem_profiles_fecha_creible BEFORE INSERT OR UPDATE OF fecha_nacimiento ON public.cem_profiles FOR EACH ROW EXECUTE FUNCTION cem_fecha_nacimiento_creible();
CREATE TRIGGER cem_notificar_ticket_trg AFTER INSERT ON public.cem_ticket_messages FOR EACH ROW EXECUTE FUNCTION cem_notificar_ticket();
