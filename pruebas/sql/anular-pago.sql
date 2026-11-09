/* Anular un pago cierra lo que ese pago abrió.
   ==========================================================================
   Aprobar el primer pago de una inscripción pendiente la deja «activa»
   (disparador cem_tg_activar_al_pagar), y una activa abre el aula siempre.
   Hasta la migración 20261109000001, anular ese pago devolvía el saldo a la
   cuota pero dejaba la inscripción activa: quien pagó con una referencia
   falsa que se aprobó por error seguía estudiando. Pasa también con
   «Deshacer» en Verificar pagos, que anula la aprobación de hace segundos.

   Prueba, con inscripciones y pagos de mentira que nunca llegan a guardarse:
     1. Lo abrió ese pago y no queda otro confirmado → vuelve a «pendiente»,
        el aula se cierra y queda en la auditoría.
     2. Queda otro pago confirmado → sigue «activa».
     3. Se activó a mano, no por ese pago → sigue «activa».
     4. Se congeló después de que el pago la abriera → sigue «congelada»,
        pero la pausa ya no dice que estaba activa: reactivarla no la reabre.
     5. cem_anular_pago sigue siendo del equipo: no la ejecuta anon.

   CÓMO SE CORRE
   Entera, de una vez: en Supabase → SQL Editor, o con la herramienta
   execute_sql, como dueño (postgres). Siempre termina en ERROR, a propósito:
   es lo que deshace todo lo que creó (inscripciones, pagos, solicitudes, y
   los avisos y correos en cola). No toca cem_courses: su disparador llama a
   Stripe.
     · «PRUEBA_OK: …»     todo como debe.
     · «PRUEBA_FALLA: …»  la lista de lo que no.
   Cualquier otro error es un fallo de la prueba misma, no de la regla.

   QUÉ NECESITA
   Un programa con precio; cuatro estudiantes activos sin nada en él; una
   forma de pago «directo» activa en la moneda del programa (la tarjeta); y
   un superadmin, que hace de cobranza. Los busca ella. */

do $prueba$
declare
  v_curso   uuid;
  v_moneda  text;
  v_tarjeta text;
  v_staff   uuid;
  v_est     uuid[] := '{}';
  v_enr     uuid;
  v_cuota   uuid;
  v_cuota2  uuid;
  v_pago    cem_payments;
  v_pago2   cem_payments;
  v_sol     uuid;
  v_monto   numeric;
  v_n       integer := 0;
  v_fallos  text[] := '{}';
  r record;
begin
  select id, coalesce(moneda, 'EUR') into v_curso, v_moneda
    from cem_courses where coalesce(precio, 0) > 0
   order by (estado = 'publicado') desc, created_at limit 1;
  select metodo into v_tarjeta from cem_metodos_pago
   where activo and regla = 'directo' and moneda = v_moneda order by orden limit 1;
  select id into v_staff from cem_profiles
   where activo and rol::text = 'superadmin' order by created_at limit 1;
  for r in
    select p.id from cem_profiles p
     where p.rol = 'estudiante' and p.activo
       and not exists (select 1 from cem_enrollments e
                        where e.profile_id = p.id and e.course_id = v_curso)
     order by p.created_at
     limit 4
  loop
    v_est := v_est || r.id;
  end loop;

  if v_curso is null or v_tarjeta is null or v_staff is null or coalesce(cardinality(v_est), 0) < 4 then
    raise exception 'PRUEBA_FALLA: faltan datos para probar (programa %, tarjeta %, superadmin %, estudiantes %)',
      v_curso, v_tarjeta, v_staff, cardinality(v_est);
  end if;

  -- Cobranza: el superadmin, con su sesión.
  perform set_config('request.jwt.claim.sub', v_staff::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_staff, 'role', 'authenticated')::text, true);
  if auth.uid() is distinct from v_staff then
    raise exception 'PRUEBA_FALLA: no consigo ser alguien del equipo';
  end if;

  /* ── 1 · Lo abrió ese pago, y no queda otro ─────────────────────────────── */
  v_enr := (public.cem_inscribir_a(v_est[1], v_curso, null, 1, null)).id;
  select id, monto into v_cuota, v_monto from cem_installments where enrollment_id = v_enr order by numero limit 1;
  v_pago := public.cem_reportar_pago(v_cuota, v_monto, null, 'REF-ANULAR-1-' || left(v_enr::text, 8),
                                     v_tarjeta, now(), null, null);
  perform public.cem_aprobar_pago(v_pago.id, null);
  if (select estado::text from cem_enrollments where id = v_enr) is distinct from 'activa' then
    raise exception 'PRUEBA_FALLA: aprobar el primer pago no activó la inscripción; la prueba parte de otro supuesto';
  end if;
  perform public.cem_anular_pago(v_pago.id, 'Prueba: el pago no aparece en el banco.');
  v_n := v_n + 4;
  if (select estado::text from cem_enrollments where id = v_enr) is distinct from 'pendiente' then
    v_fallos := v_fallos || format('anular el pago que la abrió la dejó «%s»: tenía que volver a pendiente',
      (select estado::text from cem_enrollments where id = v_enr));
  end if;
  if public.cem_inscripcion_abierta(v_enr) then
    v_fallos := v_fallos || 'tras anular el único pago, el aula sigue abierta'::text;
  end if;
  if (select estado::text from cem_installments where id = v_cuota) is distinct from 'pendiente' then
    v_fallos := v_fallos || 'la cuota no volvió a pendiente'::text;
  end if;
  if not exists (select 1 from cem_audit_events
                  where accion = 'inscripcion_cerrada_por_anulacion' and entidad_id = v_enr
                    and detalle ->> 'pago' = v_pago.id::text) then
    v_fallos := v_fallos || 'que se cerró al anular no quedó en la auditoría'::text;
  end if;

  /* ── 2 · Queda otro pago confirmado ─────────────────────────────────────── */
  v_enr := (public.cem_inscribir_a(v_est[2], v_curso, null, 3, null)).id;
  select id into v_cuota from cem_installments where enrollment_id = v_enr and numero = 1;
  select id into v_cuota2 from cem_installments where enrollment_id = v_enr and numero = 2;
  v_pago := public.cem_reportar_pago(v_cuota, (select monto from cem_installments where id = v_cuota), null,
                                     'REF-ANULAR-2A-' || left(v_enr::text, 8), v_tarjeta, now(), null, null);
  perform public.cem_aprobar_pago(v_pago.id, null);
  v_pago2 := public.cem_reportar_pago(v_cuota2, (select monto from cem_installments where id = v_cuota2), null,
                                      'REF-ANULAR-2B-' || left(v_enr::text, 8), v_tarjeta, now(), null, null);
  perform public.cem_aprobar_pago(v_pago2.id, null);
  perform public.cem_anular_pago(v_pago.id, 'Prueba: el primer pago estaba duplicado.');
  v_n := v_n + 1;
  if (select estado::text from cem_enrollments where id = v_enr) is distinct from 'activa' then
    v_fallos := v_fallos || format('con otro pago confirmado, anular el primero la dejó «%s»',
      (select estado::text from cem_enrollments where id = v_enr));
  end if;

  /* ── 3 · Activada a mano ────────────────────────────────────────────────── */
  v_enr := (public.cem_inscribir_a(v_est[3], v_curso, null, 1, null)).id;
  update cem_enrollments set estado = 'activa' where id = v_enr;
  select id, monto into v_cuota, v_monto from cem_installments where enrollment_id = v_enr order by numero limit 1;
  v_pago := public.cem_reportar_pago(v_cuota, v_monto, null, 'REF-ANULAR-3-' || left(v_enr::text, 8),
                                     v_tarjeta, now(), null, null);
  perform public.cem_aprobar_pago(v_pago.id, null);
  perform public.cem_anular_pago(v_pago.id, 'Prueba: se apuntó en la inscripción equivocada.');
  v_n := v_n + 1;
  if (select estado::text from cem_enrollments where id = v_enr) is distinct from 'activa' then
    v_fallos := v_fallos || 'una inscripción activada a mano se cerró al anular un pago que no la abrió'::text;
  end if;

  /* ── 4 · Congelada después de que el pago la abriera ────────────────────── */
  v_enr := (public.cem_inscribir_a(v_est[4], v_curso, null, 1, null)).id;
  select id, monto into v_cuota, v_monto from cem_installments where enrollment_id = v_enr order by numero limit 1;
  v_pago := public.cem_reportar_pago(v_cuota, v_monto, null, 'REF-ANULAR-4-' || left(v_enr::text, 8),
                                     v_tarjeta, now(), null, null);
  perform public.cem_aprobar_pago(v_pago.id, null);
  -- La pausa, como la deja cem_resolver_solicitud_inscripcion al aprobarla.
  update cem_enrollments set estado = 'congelada' where id = v_enr;
  insert into cem_solicitudes_inscripcion (enrollment_id, profile_id, tipo, motivo, estado,
                                           resuelto_por, resuelto_en, datos)
  values (v_enr, v_est[4], 'congelamiento', 'Prueba: viaje', 'aprobada', v_staff, now(),
          jsonb_build_object('estado_previo', 'activa'))
  returning id into v_sol;
  perform public.cem_anular_pago(v_pago.id, 'Prueba: el pago no aparece en el banco.');
  v_n := v_n + 2;
  if (select estado::text from cem_enrollments where id = v_enr) is distinct from 'congelada' then
    v_fallos := v_fallos || format('anular le cambió el estado a una congelada: quedó «%s»',
      (select estado::text from cem_enrollments where id = v_enr));
  end if;
  if (select datos ->> 'estado_previo' from cem_solicitudes_inscripcion where id = v_sol) is distinct from 'pendiente' then
    v_fallos := v_fallos || 'la pausa sigue diciendo que estaba activa: reactivarla la reabriría sin ningún pago'::text;
  end if;

  /* ── 5 · Permisos ───────────────────────────────────────────────────────── */
  v_n := v_n + 1;
  if has_function_privilege('anon', 'public.cem_anular_pago(uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.cem_anular_pago(uuid,text)', 'execute') then
    v_fallos := v_fallos || 'cem_anular_pago: la tiene que ejecutar el equipo con su sesión, y anon no'::text;
  end if;

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);

  if cardinality(v_fallos) > 0 then
    raise exception 'PRUEBA_FALLA: % de % comprobaciones: %',
      cardinality(v_fallos), v_n, array_to_string(v_fallos, ' | ');
  end if;
  raise exception 'PRUEBA_OK: % comprobaciones', v_n;
end
$prueba$;
