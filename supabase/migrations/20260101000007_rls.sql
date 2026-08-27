-- Quién puede ver cada fila. La seguridad de la casa
-- ═══════════════════════════════════════════════════════════════════════════
-- Generado por herramientas/volcar-esquema.sql. NO se edita a mano: se
-- vuelve a generar y se perdería lo escrito. Los cambios se hacen en la
-- base y luego se regenera esto.

alter table public.cem_announcements enable row level security;
alter table public.cem_aportes enable row level security;
alter table public.cem_appeals enable row level security;
alter table public.cem_assessment_questions enable row level security;
alter table public.cem_assessments enable row level security;
alter table public.cem_attendance enable row level security;
alter table public.cem_audit_events enable row level security;
alter table public.cem_badge_awards enable row level security;
alter table public.cem_badges enable row level security;
alter table public.cem_bancaribe_notificaciones enable row level security;
alter table public.cem_bot_borradores enable row level security;
alter table public.cem_bot_conocimiento enable row level security;
alter table public.cem_bot_conversaciones enable row level security;
alter table public.cem_bot_escuchado enable row level security;
alter table public.cem_bot_mensajes enable row level security;
alter table public.cem_bot_numeros enable row level security;
alter table public.cem_bot_recordatorios enable row level security;
alter table public.cem_carteras enable row level security;
alter table public.cem_categorias enable row level security;
alter table public.cem_certificate_templates enable row level security;
alter table public.cem_certificates enable row level security;
alter table public.cem_classes enable row level security;
alter table public.cem_clave_pendiente enable row level security;
alter table public.cem_cohorts enable row level security;
alter table public.cem_comentarios_guardados enable row level security;
alter table public.cem_compras_invitado enable row level security;
alter table public.cem_content_reviews enable row level security;
alter table public.cem_conversiones enable row level security;
alter table public.cem_correo_cola enable row level security;
alter table public.cem_course_shorts enable row level security;
alter table public.cem_courses enable row level security;
alter table public.cem_datos_de_prueba enable row level security;
alter table public.cem_duda_respuestas enable row level security;
alter table public.cem_dudas enable row level security;
alter table public.cem_enrollments enable row level security;
alter table public.cem_gastos enable row level security;
alter table public.cem_identidad enable row level security;
alter table public.cem_installments enable row level security;
alter table public.cem_integraciones enable row level security;
alter table public.cem_inversores enable row level security;
alter table public.cem_invitaciones enable row level security;
alter table public.cem_invitaciones_equipo enable row level security;
alter table public.cem_lead_envios enable row level security;
alter table public.cem_leads enable row level security;
alter table public.cem_leccion_valoraciones enable row level security;
alter table public.cem_lesson_progress enable row level security;
alter table public.cem_lessons enable row level security;
alter table public.cem_liquidaciones enable row level security;
alter table public.cem_media enable row level security;
alter table public.cem_mensajes_plantilla enable row level security;
alter table public.cem_metodos_pago enable row level security;
alter table public.cem_modules enable row level security;
alter table public.cem_muro enable row level security;
alter table public.cem_muro_comentarios enable row level security;
alter table public.cem_notificaciones enable row level security;
alter table public.cem_payments enable row level security;
alter table public.cem_permissions enable row level security;
alter table public.cem_plantillas_mensaje enable row level security;
alter table public.cem_portafolio enable row level security;
alter table public.cem_profiles enable row level security;
alter table public.cem_puente_estado enable row level security;
alter table public.cem_questions enable row level security;
alter table public.cem_rate_limit enable row level security;
alter table public.cem_recurso_entregas enable row level security;
alter table public.cem_recursos enable row level security;
alter table public.cem_reproducciones enable row level security;
alter table public.cem_ronda_partes enable row level security;
alter table public.cem_rondas enable row level security;
alter table public.cem_settings enable row level security;
alter table public.cem_solicitudes_inscripcion enable row level security;
alter table public.cem_solicitudes_perfil enable row level security;
alter table public.cem_stripe_sesiones enable row level security;
alter table public.cem_submissions enable row level security;
alter table public.cem_tasa_peticiones enable row level security;
alter table public.cem_tasas_bcv enable row level security;
alter table public.cem_teacher_assignments enable row level security;
alter table public.cem_ticket_messages enable row level security;
alter table public.cem_tickets enable row level security;
alter table public.cem_turnos enable row level security;
alter table public.cem_valoraciones enable row level security;
alter table public.cert_carpetas enable row level security;
alter table public.cert_certificates enable row level security;
alter table public.cert_lotes enable row level security;
alter table public.cert_settings enable row level security;
alter table public.cert_templates enable row level security;
alter table public.forest_ai_predictions enable row level security;
alter table public.forest_audit_events enable row level security;
alter table public.forest_code_sequences enable row level security;
alter table public.forest_profiles enable row level security;
alter table public.forest_projects enable row level security;
alter table public.forest_public_content enable row level security;
alter table public.forest_public_templates enable row level security;
alter table public.forest_push_subscriptions enable row level security;
alter table public.forest_qr_batches enable row level security;
alter table public.forest_qr_counter enable row level security;
alter table public.forest_qr_tags enable row level security;
alter table public.forest_reviews enable row level security;
alter table public.forest_secrets enable row level security;
alter table public.forest_species_catalog enable row level security;
alter table public.forest_species_requests enable row level security;
alter table public.forest_tree_photos enable row level security;
alter table public.forest_trees enable row level security;
alter table public.pm_project_events enable row level security;
alter table public.pm_projects enable row level security;
alter table public.quote_events enable row level security;
alter table public.quotes enable row level security;

create policy cem_ann_read on public.cem_announcements as permissive for select to authenticated
  using (true);
create policy cem_ann_write on public.cem_announcements as permissive for all to authenticated
  using ((cem_is_staff() OR cem_is_teacher()))
  with check ((cem_is_staff() OR cem_is_teacher()));
create policy cem_auditor_no_delete_cem_announcements on public.cem_announcements as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_announcements on public.cem_announcements as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_announcements on public.cem_announcements as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_aportes_escribe_admin on public.cem_aportes as permissive for all to authenticated
  using (cem_es_admin())
  with check (cem_es_admin());
create policy cem_aportes_lee_direccion on public.cem_aportes as permissive for select to authenticated
  using ((cem_es_admin() OR cem_es_auditor()));
create policy cem_appeal_insert on public.cem_appeals as permissive for insert to authenticated
  with check (((profile_id = auth.uid()) OR cem_is_staff()));
create policy cem_appeal_read on public.cem_appeals as permissive for select to authenticated
  using (((profile_id = auth.uid()) OR cem_can_read_all()));
create policy cem_appeal_update on public.cem_appeals as permissive for update to authenticated
  using ((cem_is_staff() OR cem_is_teacher()))
  with check ((cem_is_staff() OR cem_is_teacher()));
create policy cem_auditor_no_delete_cem_appeals on public.cem_appeals as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_appeals on public.cem_appeals as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_appeals on public.cem_appeals as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_aq_staff on public.cem_assessment_questions as permissive for all to public
  using ((cem_can_read_all() OR (EXISTS ( SELECT 1
   FROM cem_assessments a
  WHERE ((a.id = cem_assessment_questions.assessment_id) AND cem_is_teacher() AND cem_docente_de_curso(a.course_id))))))
  with check ((cem_is_staff() OR (EXISTS ( SELECT 1
   FROM cem_assessments a
  WHERE ((a.id = cem_assessment_questions.assessment_id) AND cem_is_teacher() AND cem_docente_de_curso(a.course_id))))));
create policy cem_auditor_no_delete_cem_assessment_questions on public.cem_assessment_questions as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_assessment_questions on public.cem_assessment_questions as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_assessment_questions on public.cem_assessment_questions as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_assess_read on public.cem_assessments as permissive for select to authenticated
  using (true);
create policy cem_assess_write on public.cem_assessments as permissive for all to public
  using ((cem_is_staff() OR (cem_is_teacher() AND cem_docente_de_curso(course_id))))
  with check ((cem_is_staff() OR (cem_is_teacher() AND cem_docente_de_curso(course_id))));
create policy cem_auditor_no_delete_cem_assessments on public.cem_assessments as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_assessments on public.cem_assessments as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_assessments on public.cem_assessments as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_att_read on public.cem_attendance as permissive for select to authenticated
  using ((cem_owns_enrollment(enrollment_id) OR cem_can_read_all()));
create policy cem_att_write on public.cem_attendance as permissive for all to public
  using ((cem_is_staff() OR (EXISTS ( SELECT 1
   FROM cem_classes c
  WHERE ((c.id = cem_attendance.class_id) AND cem_is_teacher() AND cem_docente_de_cohorte(c.cohort_id))))))
  with check ((cem_is_staff() OR (EXISTS ( SELECT 1
   FROM cem_classes c
  WHERE ((c.id = cem_attendance.class_id) AND cem_is_teacher() AND cem_docente_de_cohorte(c.cohort_id))))));
create policy cem_auditor_no_delete_cem_attendance on public.cem_attendance as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_attendance on public.cem_attendance as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_attendance on public.cem_attendance as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_audit_insert on public.cem_audit_events as permissive for insert to authenticated
  with check (((auth.uid() IS NOT NULL) AND (actor_id = auth.uid())));
create policy cem_audit_read on public.cem_audit_events as permissive for select to authenticated
  using (cem_can_read_all());
create policy cem_auditor_no_delete_cem_audit_events on public.cem_audit_events as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_audit_events on public.cem_audit_events as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_audit_events on public.cem_audit_events as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_delete_cem_badge_awards on public.cem_badge_awards as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_badge_awards on public.cem_badge_awards as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_badge_awards on public.cem_badge_awards as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_ba_read on public.cem_badge_awards as permissive for select to authenticated
  using (((profile_id = auth.uid()) OR cem_can_read_all()));
create policy cem_ba_write on public.cem_badge_awards as permissive for all to authenticated
  using (cem_is_staff())
  with check (cem_is_staff());
create policy cem_auditor_no_delete_cem_badges on public.cem_badges as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_badges on public.cem_badges as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_badges on public.cem_badges as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_badges_read on public.cem_badges as permissive for select to authenticated
  using (true);
create policy cem_badges_write on public.cem_badges as permissive for all to authenticated
  using (cem_is_staff())
  with check (cem_is_staff());
create policy cem_auditor_no_delete_cem_bancaribe_notificaciones on public.cem_bancaribe_notificaciones as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_bancaribe_notificaciones on public.cem_bancaribe_notificaciones as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_bancaribe_notificaciones on public.cem_bancaribe_notificaciones as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_bancaribe_notif_select on public.cem_bancaribe_notificaciones as permissive for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM cem_profiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = ANY (ARRAY['cobranza'::cem_role, 'coordinador'::cem_role, 'admin'::cem_role, 'superadmin'::cem_role, 'auditor'::cem_role]))))));
create policy cem_bancaribe_notif_update on public.cem_bancaribe_notificaciones as permissive for update to authenticated
  using ((EXISTS ( SELECT 1
   FROM cem_profiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = ANY (ARRAY['cobranza'::cem_role, 'coordinador'::cem_role, 'admin'::cem_role, 'superadmin'::cem_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM cem_profiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = ANY (ARRAY['cobranza'::cem_role, 'coordinador'::cem_role, 'admin'::cem_role, 'superadmin'::cem_role]))))));
create policy cem_borrador_crear on public.cem_bot_borradores as permissive for insert to authenticated
  with check ((creado_por = auth.uid()));
create policy cem_borrador_resolver on public.cem_bot_borradores as permissive for update to authenticated
  using (((creado_por = auth.uid()) OR cem_is_staff()))
  with check (((creado_por = auth.uid()) OR cem_is_staff()));
create policy cem_borrador_ver on public.cem_bot_borradores as permissive for select to authenticated
  using (((creado_por = auth.uid()) OR cem_is_staff()));
create policy cem_recordatorio_propio on public.cem_bot_recordatorios as permissive for all to authenticated
  using (((profile_id = auth.uid()) OR cem_can_read_all()))
  with check ((profile_id = auth.uid()));
create policy cem_carteras_escribe_admin on public.cem_carteras as permissive for all to public
  using (cem_es_admin())
  with check (cem_es_admin());
create policy cem_carteras_lee_personal on public.cem_carteras as permissive for select to public
  using (cem_is_staff());
create policy cem_auditor_no_delete_cem_categorias on public.cem_categorias as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_categorias on public.cem_categorias as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_categorias on public.cem_categorias as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_categorias_select_auth on public.cem_categorias as permissive for select to authenticated
  using (true);
create policy cem_categorias_write_staff on public.cem_categorias as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM cem_profiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = ANY (ARRAY['coordinador'::cem_role, 'admin'::cem_role, 'superadmin'::cem_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM cem_profiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = ANY (ARRAY['coordinador'::cem_role, 'admin'::cem_role, 'superadmin'::cem_role]))))));
create policy cem_auditor_no_delete_cem_certificate_templates on public.cem_certificate_templates as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_certificate_templates on public.cem_certificate_templates as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_certificate_templates on public.cem_certificate_templates as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_ctpl_read on public.cem_certificate_templates as permissive for select to authenticated
  using (true);
create policy cem_ctpl_write on public.cem_certificate_templates as permissive for all to authenticated
  using (cem_is_staff())
  with check (cem_is_staff());
create policy cem_auditor_no_delete_cem_certificates on public.cem_certificates as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_certificates on public.cem_certificates as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_certificates on public.cem_certificates as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_cert_read on public.cem_certificates as permissive for select to authenticated
  using (((profile_id = auth.uid()) OR cem_can_read_all()));
create policy cem_cert_write on public.cem_certificates as permissive for all to authenticated
  using (cem_is_staff())
  with check (cem_is_staff());
create policy cem_auditor_no_delete_cem_classes on public.cem_classes as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_classes on public.cem_classes as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_classes on public.cem_classes as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_classes_read on public.cem_classes as permissive for select to authenticated
  using (true);
create policy cem_classes_write on public.cem_classes as permissive for all to public
  using ((cem_is_staff() OR (cem_is_teacher() AND cem_docente_de_cohorte(cohort_id))))
  with check ((cem_is_staff() OR (cem_is_teacher() AND cem_docente_de_cohorte(cohort_id))));
create policy cem_auditor_no_delete_cem_cohorts on public.cem_cohorts as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_cohorts on public.cem_cohorts as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_cohorts on public.cem_cohorts as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_cohorts_read on public.cem_cohorts as permissive for select to anon, authenticated
  using (true);
create policy cem_cohorts_write on public.cem_cohorts as permissive for all to authenticated
  using (cem_is_staff())
  with check (cem_is_staff());
create policy cem_comentarios_propios on public.cem_comentarios_guardados as permissive for all to authenticated
  using ((profile_id = auth.uid()))
  with check ((profile_id = auth.uid()));
create policy cem_auditor_no_delete_cem_content_reviews on public.cem_content_reviews as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_content_reviews on public.cem_content_reviews as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_content_reviews on public.cem_content_reviews as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_cr_all on public.cem_content_reviews as permissive for all to authenticated
  using (cem_can_read_all())
  with check ((cem_is_staff() OR cem_is_teacher()));
create policy cem_conversiones_cobranza on public.cem_conversiones as permissive for all to public
  using ((cem_puede_cobranza() OR cem_es_auditor()))
  with check (cem_puede_cobranza());
create policy cem_auditor_no_delete_cem_correo_cola on public.cem_correo_cola as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_correo_cola on public.cem_correo_cola as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_correo_cola on public.cem_correo_cola as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_course_shorts_escribir on public.cem_course_shorts as permissive for all to public
  using ((cem_is_staff() OR (cem_is_teacher() AND cem_docente_de_curso(course_id))))
  with check ((cem_is_staff() OR (cem_is_teacher() AND cem_docente_de_curso(course_id))));
create policy cem_course_shorts_leer on public.cem_course_shorts as permissive for select to public
  using ((cem_can_read_all() OR (publicado AND (EXISTS ( SELECT 1
   FROM cem_enrollments e
  WHERE ((e.profile_id = auth.uid()) AND (e.course_id = cem_course_shorts.course_id) AND cem_acceso_abierto(e.id)))))));
create policy cem_auditor_no_delete_cem_courses on public.cem_courses as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_courses on public.cem_courses as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_courses on public.cem_courses as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_courses_borrar on public.cem_courses as permissive for delete to public
  using (cem_es_admin());
create policy cem_courses_crear on public.cem_courses as permissive for insert to public
  with check (cem_is_staff());
create policy cem_courses_editar on public.cem_courses as permissive for update to public
  using (cem_is_staff())
  with check (cem_is_staff());
create policy cem_courses_read on public.cem_courses as permissive for select to anon, authenticated
  using (((estado = 'publicado'::cem_pub_estado) OR cem_can_read_all()));
create policy cem_auditor_no_delete_cem_enrollments on public.cem_enrollments as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_enrollments on public.cem_enrollments as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_enrollments on public.cem_enrollments as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_enroll_insert on public.cem_enrollments as permissive for insert to authenticated
  with check (((profile_id = auth.uid()) OR cem_is_staff()));
create policy cem_enroll_read on public.cem_enrollments as permissive for select to authenticated
  using (((profile_id = auth.uid()) OR cem_can_read_all()));
create policy cem_enroll_update on public.cem_enrollments as permissive for update to authenticated
  using (cem_is_staff())
  with check (cem_is_staff());
create policy cem_gastos_cobranza on public.cem_gastos as permissive for all to public
  using ((cem_puede_cobranza() OR cem_es_auditor()))
  with check (cem_puede_cobranza());
create policy identidad_corrige_lo_suyo on public.cem_identidad as permissive for update to authenticated
  using (((profile_id = auth.uid()) OR cem_es_admin()))
  with check (((profile_id = auth.uid()) OR cem_es_admin()));
create policy identidad_sube_lo_suyo on public.cem_identidad as permissive for insert to authenticated
  with check ((profile_id = auth.uid()));
create policy identidad_ve_lo_suyo on public.cem_identidad as permissive for select to authenticated
  using (((profile_id = auth.uid()) OR cem_es_admin()));
create policy cem_auditor_no_delete_cem_installments on public.cem_installments as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_installments on public.cem_installments as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_installments on public.cem_installments as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_inst_read on public.cem_installments as permissive for select to public
  using ((cem_owns_enrollment(enrollment_id) OR cem_puede_cobranza() OR cem_es_auditor()));
create policy cem_inst_write on public.cem_installments as permissive for all to public
  using (cem_puede_cobranza())
  with check (cem_puede_cobranza());
create policy cem_auditor_no_delete_cem_integraciones on public.cem_integraciones as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_integraciones on public.cem_integraciones as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_integraciones on public.cem_integraciones as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_inversores_escribe_admin on public.cem_inversores as permissive for all to authenticated
  using (cem_es_admin())
  with check (cem_es_admin());
create policy cem_inversores_lee_direccion on public.cem_inversores as permissive for select to authenticated
  using ((cem_es_admin() OR cem_es_auditor()));
create policy cem_inv_read on public.cem_invitaciones as permissive for select to public
  using (((profile_id = auth.uid()) OR cem_is_staff() OR cem_es_auditor()));
create policy cem_inv_eq_equipo on public.cem_invitaciones_equipo as permissive for select to public
  using (cem_es_admin());
create policy cem_lval_equipo on public.cem_leccion_valoraciones as permissive for select to authenticated
  using (cem_can_read_all());
create policy cem_lval_propia on public.cem_leccion_valoraciones as permissive for all to authenticated
  using ((profile_id = auth.uid()))
  with check (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM ((cem_lessons l
     JOIN cem_modules m ON ((m.id = l.module_id)))
     JOIN cem_enrollments e ON ((e.course_id = m.course_id)))
  WHERE ((l.id = cem_leccion_valoraciones.lesson_id) AND (e.profile_id = auth.uid()))))));
create policy cem_auditor_no_delete_cem_lesson_progress on public.cem_lesson_progress as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_lesson_progress on public.cem_lesson_progress as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_lesson_progress on public.cem_lesson_progress as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_progress_all on public.cem_lesson_progress as permissive for all to public
  using ((cem_owns_enrollment(enrollment_id) OR cem_can_read_all()))
  with check ((cem_can_read_all() OR (cem_owns_enrollment(enrollment_id) AND cem_acceso_abierto(enrollment_id))));
create policy cem_auditor_no_delete_cem_lessons on public.cem_lessons as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_lessons on public.cem_lessons as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_lessons on public.cem_lessons as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_lessons_read on public.cem_lessons as permissive for select to anon, authenticated
  using (true);
create policy cem_lessons_write on public.cem_lessons as permissive for all to public
  using ((cem_is_staff() OR (EXISTS ( SELECT 1
   FROM cem_modules m
  WHERE ((m.id = cem_lessons.module_id) AND cem_is_teacher() AND cem_docente_de_curso(m.course_id))))))
  with check ((cem_is_staff() OR (EXISTS ( SELECT 1
   FROM cem_modules m
  WHERE ((m.id = cem_lessons.module_id) AND cem_is_teacher() AND cem_docente_de_curso(m.course_id))))));
create policy cem_liquidaciones_escribe_admin on public.cem_liquidaciones as permissive for all to authenticated
  using (cem_es_admin())
  with check (cem_es_admin());
create policy cem_liquidaciones_lee_direccion on public.cem_liquidaciones as permissive for select to authenticated
  using ((cem_es_admin() OR cem_es_auditor()));
create policy cem_auditor_no_delete_cem_media on public.cem_media as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_media on public.cem_media as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_media on public.cem_media as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_media_read on public.cem_media as permissive for select to authenticated
  using (true);
create policy cem_media_write on public.cem_media as permissive for all to authenticated
  using ((cem_is_staff() OR cem_is_teacher()))
  with check ((cem_is_staff() OR cem_is_teacher()));
create policy cem_metodos_escribe_admin on public.cem_metodos_pago as permissive for all to public
  using (cem_es_admin())
  with check (cem_es_admin());
create policy cem_metodos_lee_todo_el_mundo on public.cem_metodos_pago as permissive for select to public
  using (true);
create policy cem_auditor_no_delete_cem_modules on public.cem_modules as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_modules on public.cem_modules as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_modules on public.cem_modules as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_modules_read on public.cem_modules as permissive for select to anon, authenticated
  using (true);
create policy cem_modules_write on public.cem_modules as permissive for all to authenticated
  using (cem_is_staff())
  with check (cem_is_staff());
create policy cem_muro_edita_su_autor on public.cem_muro as permissive for update to public
  using (((autor_id = auth.uid()) OR cem_es_admin()))
  with check (((autor_id = auth.uid()) OR cem_es_admin()));
create policy cem_muro_escribe_quien_dicta on public.cem_muro as permissive for insert to public
  with check ((cem_dicta_cohorte(cohort_id) AND (autor_id = auth.uid())));
create policy cem_muro_lee_la_cohorte on public.cem_muro as permissive for select to public
  using (((NOT eliminado) AND cem_esta_en_cohorte(cohort_id)));
create policy cem_muro_com_borra on public.cem_muro_comentarios as permissive for update to public
  using (((autor_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM cem_muro m
  WHERE ((m.id = cem_muro_comentarios.post_id) AND cem_dicta_cohorte(m.cohort_id))))));
create policy cem_muro_com_escribe on public.cem_muro_comentarios as permissive for insert to public
  with check (((autor_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM cem_muro m
  WHERE ((m.id = cem_muro_comentarios.post_id) AND cem_esta_en_cohorte(m.cohort_id))))));
create policy cem_muro_com_lee on public.cem_muro_comentarios as permissive for select to public
  using (((NOT eliminado) AND (EXISTS ( SELECT 1
   FROM cem_muro m
  WHERE ((m.id = cem_muro_comentarios.post_id) AND cem_esta_en_cohorte(m.cohort_id))))));
create policy cem_auditor_no_delete_cem_notificaciones on public.cem_notificaciones as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_notificaciones on public.cem_notificaciones as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_notificaciones on public.cem_notificaciones as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_notif_leer_propias on public.cem_notificaciones as permissive for select to public
  using ((profile_id = auth.uid()));
create policy cem_notif_marcar_propias on public.cem_notificaciones as permissive for update to public
  using ((profile_id = auth.uid()))
  with check ((profile_id = auth.uid()));
create policy cem_auditor_no_delete_cem_payments on public.cem_payments as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_payments on public.cem_payments as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_payments on public.cem_payments as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_pay_read on public.cem_payments as permissive for select to public
  using ((cem_owns_enrollment(enrollment_id) OR cem_puede_cobranza() OR cem_es_auditor()));
create policy cem_pay_write on public.cem_payments as permissive for all to public
  using (cem_puede_cobranza())
  with check (cem_puede_cobranza());
create policy cem_auditor_no_delete_cem_permissions on public.cem_permissions as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_permissions on public.cem_permissions as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_permissions on public.cem_permissions as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_perm_read on public.cem_permissions as permissive for select to authenticated
  using (true);
create policy cem_perm_write on public.cem_permissions as permissive for all to authenticated
  using (cem_is_staff())
  with check (cem_is_staff());
create policy cem_plantillas_escribe on public.cem_plantillas_mensaje as permissive for all to authenticated
  using (cem_is_staff())
  with check (cem_is_staff());
create policy cem_plantillas_lee on public.cem_plantillas_mensaje as permissive for select to authenticated
  using ((cem_is_staff() OR cem_is_teacher()));
create policy cem_portafolio_propio on public.cem_portafolio as permissive for all to authenticated
  using (((profile_id = auth.uid()) OR cem_can_read_all()))
  with check ((profile_id = auth.uid()));
create policy cem_portafolio_publico on public.cem_portafolio as permissive for select to anon, authenticated
  using ((EXISTS ( SELECT 1
   FROM cem_profiles p
  WHERE ((p.id = cem_portafolio.profile_id) AND COALESCE(p.perfil_publico, false)))));
create policy cem_auditor_no_delete_cem_profiles on public.cem_profiles as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_profiles on public.cem_profiles as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_profiles on public.cem_profiles as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_profiles_insert_staff on public.cem_profiles as permissive for insert to authenticated
  with check (cem_is_staff());
create policy cem_profiles_select on public.cem_profiles as permissive for select to authenticated
  using (((id = auth.uid()) OR cem_can_read_all()));
create policy cem_profiles_update_own on public.cem_profiles as permissive for update to authenticated
  using (((id = auth.uid()) OR cem_is_staff()))
  with check (((id = auth.uid()) OR cem_is_staff()));
create policy cem_puente_estado_leer on public.cem_puente_estado as permissive for select to authenticated
  using (cem_is_staff());
create policy cem_auditor_no_delete_cem_questions on public.cem_questions as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_questions on public.cem_questions as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_questions on public.cem_questions as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_q_staff on public.cem_questions as permissive for all to authenticated
  using (cem_can_read_all())
  with check ((cem_is_staff() OR cem_is_teacher()));
create policy cem_auditor_no_delete_cem_rate_limit on public.cem_rate_limit as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_rate_limit on public.cem_rate_limit as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_rate_limit on public.cem_rate_limit as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy "entregas: las mira el equipo" on public.cem_recurso_entregas as permissive for select to authenticated
  using (cem_is_staff());
create policy "recursos: los ve y los cambia el equipo" on public.cem_recursos as permissive for all to authenticated
  using (cem_is_staff())
  with check (cem_is_staff());
create policy cem_reproducciones_leer on public.cem_reproducciones as permissive for select to public
  using (((profile_id = auth.uid()) OR cem_can_read_all()));
create policy cem_ronda_partes_escribe_admin on public.cem_ronda_partes as permissive for all to authenticated
  using (cem_es_admin())
  with check (cem_es_admin());
create policy cem_ronda_partes_lee_direccion on public.cem_ronda_partes as permissive for select to authenticated
  using ((cem_es_admin() OR cem_es_auditor()));
create policy cem_rondas_escribe_admin on public.cem_rondas as permissive for all to authenticated
  using (cem_es_admin())
  with check (cem_es_admin());
create policy cem_rondas_lee_direccion on public.cem_rondas as permissive for select to authenticated
  using ((cem_es_admin() OR cem_es_auditor()));
create policy cem_auditor_no_delete_cem_settings on public.cem_settings as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_settings on public.cem_settings as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_settings on public.cem_settings as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_set_read on public.cem_settings as permissive for select to authenticated
  using (true);
create policy cem_set_write on public.cem_settings as permissive for all to authenticated
  using (cem_is_staff())
  with check (cem_is_staff());
create policy cem_auditor_no_delete_cem_solicitudes_inscripcion on public.cem_solicitudes_inscripcion as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_solicitudes_inscripcion on public.cem_solicitudes_inscripcion as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_solicitudes_inscripcion on public.cem_solicitudes_inscripcion as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_solinsc_resolver on public.cem_solicitudes_inscripcion as permissive for update to public
  using (cem_is_staff())
  with check (cem_is_staff());
create policy cem_solinsc_ver on public.cem_solicitudes_inscripcion as permissive for select to public
  using (((profile_id = auth.uid()) OR cem_is_staff()));
create policy cem_auditor_no_delete_cem_solicitudes_perfil on public.cem_solicitudes_perfil as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_solicitudes_perfil on public.cem_solicitudes_perfil as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_solicitudes_perfil on public.cem_solicitudes_perfil as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_solperfil_resolver on public.cem_solicitudes_perfil as permissive for update to public
  using (cem_is_staff())
  with check (cem_is_staff());
create policy cem_solperfil_ver on public.cem_solicitudes_perfil as permissive for select to public
  using (((profile_id = auth.uid()) OR cem_is_staff()));
create policy cem_stripe_sesiones_leer on public.cem_stripe_sesiones as permissive for select to public
  using (((profile_id = auth.uid()) OR cem_can_read_all()));
create policy cem_auditor_no_delete_cem_submissions on public.cem_submissions as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_submissions on public.cem_submissions as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_submissions on public.cem_submissions as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_sub_insert on public.cem_submissions as permissive for insert to authenticated
  with check ((cem_owns_enrollment(enrollment_id) OR cem_is_staff()));
create policy cem_sub_read on public.cem_submissions as permissive for select to authenticated
  using ((cem_owns_enrollment(enrollment_id) OR cem_can_read_all()));
create policy cem_sub_update on public.cem_submissions as permissive for update to authenticated
  using ((cem_owns_enrollment(enrollment_id) OR cem_is_staff() OR cem_is_teacher()))
  with check ((cem_owns_enrollment(enrollment_id) OR cem_is_staff() OR cem_is_teacher()));
create policy cem_tasa_pet_read on public.cem_tasa_peticiones as permissive for select to public
  using ((cem_puede_cobranza() OR cem_es_auditor()));
create policy cem_auditor_no_delete_cem_tasas_bcv on public.cem_tasas_bcv as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_tasas_bcv on public.cem_tasas_bcv as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_tasas_bcv on public.cem_tasas_bcv as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_tasas_bcv_select on public.cem_tasas_bcv as permissive for select to authenticated
  using (true);
create policy cem_auditor_no_delete_cem_teacher_assignments on public.cem_teacher_assignments as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_teacher_assignments on public.cem_teacher_assignments as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_teacher_assignments on public.cem_teacher_assignments as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_ta_read on public.cem_teacher_assignments as permissive for select to authenticated
  using (true);
create policy cem_ta_write on public.cem_teacher_assignments as permissive for all to authenticated
  using (cem_is_staff())
  with check (cem_is_staff());
create policy cem_auditor_no_delete_cem_ticket_messages on public.cem_ticket_messages as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_ticket_messages on public.cem_ticket_messages as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_ticket_messages on public.cem_ticket_messages as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_tkm_insert on public.cem_ticket_messages as permissive for insert to authenticated
  with check ((cem_is_staff() OR (EXISTS ( SELECT 1
   FROM cem_tickets t
  WHERE ((t.id = cem_ticket_messages.ticket_id) AND (t.profile_id = auth.uid()))))));
create policy cem_tkm_read on public.cem_ticket_messages as permissive for select to public
  using ((cem_can_read_all() OR ((COALESCE(interno, false) = false) AND (EXISTS ( SELECT 1
   FROM cem_tickets t
  WHERE ((t.id = cem_ticket_messages.ticket_id) AND (t.profile_id = auth.uid())))))));
create policy cem_auditor_no_delete_cem_tickets on public.cem_tickets as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_tickets on public.cem_tickets as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_tickets on public.cem_tickets as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_tk_insert on public.cem_tickets as permissive for insert to authenticated
  with check (((profile_id = auth.uid()) OR cem_is_staff()));
create policy cem_tk_read on public.cem_tickets as permissive for select to authenticated
  using (((profile_id = auth.uid()) OR cem_can_read_all()));
create policy cem_tk_update on public.cem_tickets as permissive for update to authenticated
  using (cem_is_staff())
  with check (cem_is_staff());
create policy cem_auditor_no_delete_cem_turnos on public.cem_turnos as restrictive for delete to public
  using ((NOT cem_es_auditor()));
create policy cem_auditor_no_insert_cem_turnos on public.cem_turnos as restrictive for insert to public
  with check ((NOT cem_es_auditor()));
create policy cem_auditor_no_update_cem_turnos on public.cem_turnos as restrictive for update to public
  using ((NOT cem_es_auditor()))
  with check ((NOT cem_es_auditor()));
create policy cem_turnos_select_auth on public.cem_turnos as permissive for select to authenticated
  using (true);
create policy cem_turnos_write_staff on public.cem_turnos as permissive for all to authenticated
  using ((EXISTS ( SELECT 1
   FROM cem_profiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = ANY (ARRAY['coordinador'::cem_role, 'admin'::cem_role, 'superadmin'::cem_role]))))))
  with check ((EXISTS ( SELECT 1
   FROM cem_profiles p
  WHERE ((p.id = auth.uid()) AND (p.rol = ANY (ARRAY['coordinador'::cem_role, 'admin'::cem_role, 'superadmin'::cem_role]))))));
create policy cem_valoraciones_las_mias on public.cem_valoraciones as permissive for all to authenticated
  using (((profile_id = auth.uid()) OR cem_can_read_all()))
  with check (((profile_id = auth.uid()) AND (EXISTS ( SELECT 1
   FROM (cem_classes c
     JOIN cem_enrollments e ON ((e.cohort_id = c.cohort_id)))
  WHERE ((c.id = cem_valoraciones.class_id) AND (e.profile_id = auth.uid()))))));
create policy admin_can_read_cert_certificates on public.cert_certificates as permissive for select to authenticated
  using (is_cert_admin());
create policy cert_lotes_gestores on public.cert_lotes as permissive for all to authenticated
  using (cert_puede_gestionar())
  with check (cert_puede_gestionar());
create policy admin_can_read_cert_settings on public.cert_settings as permissive for select to authenticated
  using (is_cert_admin());
create policy admin_can_read_cert_templates on public.cert_templates as permissive for select to authenticated
  using (is_cert_admin());
create policy admin_can_read_pm_project_events on public.pm_project_events as permissive for select to authenticated
  using (((auth.jwt() ->> 'email'::text) = ANY (ARRAY['rengifojjrr@gmail.com'::text])));
create policy admin_can_read_pm_projects on public.pm_projects as permissive for select to authenticated
  using (((auth.jwt() ->> 'email'::text) = ANY (ARRAY['rengifojjrr@gmail.com'::text])));
