-- Los permisos por omisión de Supabase, de vuelta tras el volcado
-- ═══════════════════════════════════════════════════════════════════════════
-- 20251231000000 los quitó para que el volcado naciera sólo con sus permisos.
-- Todo lo que viene después se creó en producción con ellos puestos —y cada
-- migración quita lo que no quiere, con su revoke—, así que se devuelven tal
-- cual los tiene producción en pg_default_acl: ALL a anon, authenticated y
-- service_role sobre lo que se cree en public.
--
-- Sin esto, lo posterior al volcado nacería más cerrado que en producción:
-- service_role, por ejemplo, se quedaría sin permiso en 117 funciones y 20
-- tablas que en producción sí lo tienen.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
