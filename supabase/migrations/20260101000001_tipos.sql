-- Tipos propios (enums)
-- ═══════════════════════════════════════════════════════════════════════════
-- Generado por herramientas/volcar-esquema.sql. NO se edita a mano: se
-- vuelve a generar y se perdería lo escrito. Los cambios se hacen en la
-- base y luego se regenera esto.

create type public.cem_apelacion_estado as enum ('recibida', 'en_analisis', 'requiere_info', 'aceptada', 'rechazada');
create type public.cem_cohorte_estado as enum ('planificada', 'inscripciones_abiertas', 'en_curso', 'finalizada', 'cancelada');
create type public.cem_course_tipo as enum ('masterclass', 'curso', 'programa', 'diplomado', 'maestria');
create type public.cem_cuota_estado as enum ('pendiente', 'parcial', 'pagada', 'vencida', 'congelada', 'anulada', 'reembolsada');
create type public.cem_dificultad as enum ('baja', 'media', 'alta');
create type public.cem_entrega_estado as enum ('en_progreso', 'entregada', 'calificada', 'tarde', 'anulada');
create type public.cem_evaluacion_tipo as enum ('examen', 'quiz', 'practica', 'ensayo');
create type public.cem_inscripcion_estado as enum ('pendiente', 'activa', 'suspendida', 'congelada', 'finalizada', 'cancelada');
create type public.cem_leccion_tipo as enum ('video', 'pdf', 'texto', 'enlace', 'quiz', 'tarea', 'en_vivo');
create type public.cem_modalidad as enum ('online', 'en_vivo', 'presencial', 'hibrido');
create type public.cem_nivel as enum ('basico', 'intermedio', 'avanzado');
create type public.cem_pregunta_tipo as enum ('multiple', 'verdadero_falso', 'corta', 'ensayo', 'casillas', 'desplegable', 'escala', 'cuadricula', 'cuadricula_casillas', 'fecha', 'hora', 'archivo');
create type public.cem_prioridad as enum ('baja', 'media', 'alta', 'urgente');
create type public.cem_pub_estado as enum ('borrador', 'en_revision', 'publicado', 'pausado', 'archivado');
create type public.cem_role as enum ('estudiante', 'profesor', 'coordinador', 'cobranza', 'admin', 'auditor', 'superadmin');
create type public.cem_ticket_estado as enum ('abierto', 'en_proceso', 'esperando', 'resuelto', 'cerrado');
create type public.forest_condicion as enum ('sano', 'danado', 'seco', 'muerto', 'no_determinado');
create type public.forest_decision as enum ('aprobado', 'rechazado', 'devuelto', 'requiere_especialista');
create type public.forest_photo_tipo as enum ('arbol_completo', 'hoja', 'corteza', 'flor_fruto');
create type public.forest_role as enum ('registrador', 'supervisor', 'administrador');
create type public.forest_tree_estado as enum ('BORRADOR', 'ENVIADO', 'EN_REVISION', 'REQUIERE_CORRECCION', 'REQUIERE_ESPECIALISTA', 'APROBADO', 'RECHAZADO', 'ARCHIVADO');
create type public.forest_tree_tipo as enum ('PUBLICO', 'MANEJO');
