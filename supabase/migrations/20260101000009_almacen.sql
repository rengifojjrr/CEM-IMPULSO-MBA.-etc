-- Depósitos de archivos y sus reglas
-- ═══════════════════════════════════════════════════════════════════════════
-- Generado por herramientas/volcar-esquema.sql. NO se edita a mano: se
-- vuelve a generar y se perdería lo escrito. Los cambios se hacen en la
-- base y luego se regenera esto.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('cem-assets', 'cem-assets', 't', null, NULL) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('cem-comprobantes', 'cem-comprobantes', 'f', 5242880, '{image/png,image/jpeg,image/webp,application/pdf}') on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('cem-identidad', 'cem-identidad', 'f', 8388608, '{image/png,image/jpeg,image/webp,application/pdf}') on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('cem-regalos', 'cem-regalos', 'f', 52428800, '{application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/zip}') on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('forest-photos', 'forest-photos', 'f', null, NULL) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('forest-species-photos', 'forest-species-photos', 't', null, NULL) on conflict (id) do nothing;

create policy cem_assets_actualizar on storage.objects for update to authenticated
  using (((bucket_id = 'cem-assets'::text) AND cem_is_staff()));
create policy cem_assets_borrado on storage.objects for delete to authenticated
  using (((bucket_id = 'cem-assets'::text) AND cem_is_staff()));
create policy cem_assets_borrado_perfil on storage.objects for delete to authenticated
  using (((bucket_id = 'cem-assets'::text) AND ((storage.foldername(name))[1] = 'perfiles'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));
create policy cem_assets_escritura on storage.objects for insert to authenticated
  with check (((bucket_id = 'cem-assets'::text) AND cem_is_staff()));
create policy cem_assets_escritura_perfil on storage.objects for insert to authenticated
  with check (((bucket_id = 'cem-assets'::text) AND ((storage.foldername(name))[1] = 'perfiles'::text) AND ((storage.foldername(name))[2] = (auth.uid())::text)));
create policy cem_assets_lectura on storage.objects for select to public
  using ((bucket_id = 'cem-assets'::text));
create policy cem_comprobantes_delete on storage.objects for delete to authenticated
  using (((bucket_id = 'cem-comprobantes'::text) AND cem_is_staff()));
create policy cem_comprobantes_insert on storage.objects for insert to authenticated
  with check (((bucket_id = 'cem-comprobantes'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
create policy cem_comprobantes_select on storage.objects for select to authenticated
  using (((bucket_id = 'cem-comprobantes'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR cem_is_staff())));
create policy forest_photos_insert_owner on storage.objects for insert to authenticated
  with check (((bucket_id = 'forest-photos'::text) AND forest_can_upload_photo(((storage.foldername(name))[1])::uuid)));
create policy forest_photos_select_owner_or_staff on storage.objects for select to authenticated
  using (((bucket_id = 'forest-photos'::text) AND forest_can_view_photo(((storage.foldername(name))[1])::uuid)));
create policy forest_photos_select_public_if_approved on storage.objects for select to anon
  using (((bucket_id = 'forest-photos'::text) AND forest_is_tree_approved(((storage.foldername(name))[1])::uuid)));
create policy forest_species_photos_delete_admin on storage.objects for delete to authenticated
  using (((bucket_id = 'forest-species-photos'::text) AND forest_is_admin()));
create policy forest_species_photos_insert_admin on storage.objects for insert to authenticated
  with check (((bucket_id = 'forest-species-photos'::text) AND forest_is_admin()));
create policy forest_species_photos_select_public on storage.objects for select to public
  using ((bucket_id = 'forest-species-photos'::text));
create policy forest_species_photos_update_admin on storage.objects for update to authenticated
  using (((bucket_id = 'forest-species-photos'::text) AND forest_is_admin()));
create policy identidad_archivo_suyo on storage.objects for all to authenticated
  using (((bucket_id = 'cem-identidad'::text) AND (cem_es_admin() OR ((storage.foldername(name))[1] = (auth.uid())::text))))
  with check (((bucket_id = 'cem-identidad'::text) AND (cem_es_admin() OR ((storage.foldername(name))[1] = (auth.uid())::text))));
create policy "regalos: el equipo los gestiona" on storage.objects for all to authenticated
  using (((bucket_id = 'cem-regalos'::text) AND cem_is_staff()))
  with check (((bucket_id = 'cem-regalos'::text) AND cem_is_staff()));
