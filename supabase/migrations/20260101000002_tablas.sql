-- Las tablas, con sus columnas y valores por omisión
-- ═══════════════════════════════════════════════════════════════════════════
-- Generado por herramientas/volcar-esquema.sql. NO se edita a mano: se
-- vuelve a generar y se perdería lo escrito. Los cambios se hacen en la
-- base y luego se regenera esto.

create table if not exists public.cem_announcements (
  id uuid not null default gen_random_uuid(),
  titulo text not null,
  cuerpo text,
  audiencia text default 'todos'::text,
  cohort_id uuid,
  course_id uuid,
  canal text default 'plataforma'::text,
  estado text default 'borrador'::text,
  programado_para timestamp with time zone,
  enviado_en timestamp with time zone,
  autor_id uuid,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_aportes (
  id uuid not null default gen_random_uuid(),
  fecha date not null default CURRENT_DATE,
  inversor_id uuid,
  concepto text not null,
  linea cem_course_tipo,
  tipo_capital text not null,
  monto numeric(14,2) not null,
  moneda text not null default 'EUR'::text,
  tasa numeric(18,6),
  monto_base numeric(14,2) not null,
  cartera_id text,
  nota text,
  creado_por uuid,
  creado_en timestamp with time zone not null default now(),
  eliminado boolean not null default false
);

create table if not exists public.cem_appeals (
  id uuid not null default gen_random_uuid(),
  submission_id uuid not null,
  profile_id uuid not null,
  motivo text not null,
  estado cem_apelacion_estado not null default 'recibida'::cem_apelacion_estado,
  resolucion text,
  resuelto_por uuid,
  resuelto_en timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_assessment_questions (
  id uuid not null default gen_random_uuid(),
  assessment_id uuid not null,
  question_id uuid not null,
  orden integer default 0,
  puntaje numeric(6,2) default 1,
  seccion text,
  seccion_desc text
);

create table if not exists public.cem_assessments (
  id uuid not null default gen_random_uuid(),
  course_id uuid not null,
  module_id uuid,
  nombre text not null,
  descripcion text,
  tipo cem_evaluacion_tipo not null default 'examen'::cem_evaluacion_tipo,
  puntaje_max numeric(6,2) default 100,
  tiempo_min integer,
  intentos integer default 1,
  barajar boolean default false,
  nota_aprobatoria numeric(6,2) default 70,
  estado cem_pub_estado not null default 'borrador'::cem_pub_estado,
  created_at timestamp with time zone not null default now(),
  abre_en timestamp with time zone,
  cierra_en timestamp with time zone,
  una_por_pagina boolean not null default false,
  mostrar_correctas boolean not null default false,
  mensaje_final text,
  rubrica jsonb not null default '[]'::jsonb
);

create table if not exists public.cem_attendance (
  id uuid not null default gen_random_uuid(),
  class_id uuid not null,
  enrollment_id uuid not null,
  presente boolean default false,
  minutos integer default 0,
  registrado_en timestamp with time zone not null default now()
);

create table if not exists public.cem_audit_events (
  id uuid not null default gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  accion text not null,
  entidad text,
  entidad_id uuid,
  riesgo text default 'bajo'::text,
  detalle jsonb default '{}'::jsonb,
  ip text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_badge_awards (
  id uuid not null default gen_random_uuid(),
  badge_id uuid not null,
  profile_id uuid not null,
  otorgado_en timestamp with time zone not null default now(),
  otorgado_por uuid
);

create table if not exists public.cem_badges (
  id uuid not null default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  competencia text,
  nivel text,
  icono text default 'military_tech'::text,
  color text default '#c9a227'::text,
  criterio text,
  activo boolean default true,
  created_at timestamp with time zone not null default now(),
  regla text,
  regla_valor numeric,
  regla_curso uuid
);

create table if not exists public.cem_bancaribe_notificaciones (
  id uuid not null default gen_random_uuid(),
  amount numeric,
  currency_code text,
  bank_name text,
  client_phone text,
  commerce_phone text,
  creditor_account text,
  debtor_account text,
  debtor_id text,
  destiny_bank_reference text,
  origin_bank_reference text,
  origin_bank_code text,
  payment_type text,
  fecha_banco text,
  hora_banco text,
  udf1 text,
  udf2 text,
  udf3 text,
  payload jsonb not null,
  estado text not null default 'pendiente'::text,
  payment_id uuid,
  enrollment_id uuid,
  conciliado_por uuid,
  conciliado_en timestamp with time zone,
  nota text,
  recibido_en timestamp with time zone not null default now()
);

create table if not exists public.cem_bot_borradores (
  id uuid not null default gen_random_uuid(),
  tipo text not null,
  creado_por uuid not null,
  conversacion uuid,
  resumen text not null,
  cuerpo text,
  a_quien jsonb not null default '[]'::jsonb,
  ids jsonb not null default '[]'::jsonb,
  estado text not null default 'pendiente'::text,
  resuelto_por uuid,
  resuelto_en timestamp with time zone,
  resultado jsonb,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_bot_conocimiento (
  id uuid not null default gen_random_uuid(),
  ambito text not null default 'ambos'::text,
  titulo text not null,
  contenido text not null,
  etiquetas text[] not null default '{}'::text[],
  origen text not null default 'manual'::text,
  clave text,
  activo boolean not null default true,
  creado_por uuid,
  created_at timestamp with time zone not null default now(),
  actualizado_en timestamp with time zone not null default now()
);

create table if not exists public.cem_bot_conversaciones (
  id uuid not null default gen_random_uuid(),
  profile_id uuid,
  ambito text not null,
  canal text not null default 'web'::text,
  telefono text,
  titulo text,
  pausado_hasta timestamp with time zone,
  pausado_por uuid,
  escalado_en timestamp with time zone,
  escalado_motivo text,
  created_at timestamp with time zone not null default now(),
  ultimo_en timestamp with time zone not null default now(),
  huella text
);

create table if not exists public.cem_bot_escuchado (
  id uuid not null default gen_random_uuid(),
  canal text not null default 'whatsapp'::text,
  quien_huella text,
  texto text not null,
  ficha_id uuid,
  descartada boolean not null default false,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_bot_mensajes (
  id uuid not null default gen_random_uuid(),
  conversacion_id uuid not null,
  quien text not null,
  texto text not null,
  modelo text,
  tokens_entrada integer,
  tokens_salida integer,
  ms integer,
  error text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_bot_numeros (
  telefono text not null,
  profile_id uuid not null,
  ambito text not null default 'equipo'::text,
  activo boolean not null default true,
  creado_por uuid,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_bot_recordatorios (
  profile_id uuid not null,
  dias_antes integer not null default 3,
  activo boolean not null default true,
  puesto_en timestamp with time zone not null default now()
);

create table if not exists public.cem_carteras (
  id text not null,
  nombre text not null,
  moneda text not null,
  tipo text not null default 'banco'::text,
  orden integer not null default 0,
  activa boolean not null default true,
  nota text
);
comment on table public.cem_carteras is 'Los bolsillos donde está el dinero. Dos cuentas en la misma moneda son dos carteras: el dinero de una no está en la otra hasta que alguien lo mueva de verdad.';

create table if not exists public.cem_categorias (
  id uuid not null default gen_random_uuid(),
  nombre text not null,
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_certificate_templates (
  id uuid not null default gen_random_uuid(),
  nombre text not null,
  orientacion text default 'horizontal'::text,
  logo_url text,
  firma_url text,
  firma_nombre text,
  incluir_qr boolean default true,
  fondo_url text,
  campos jsonb default '[]'::jsonb,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_certificates (
  id uuid not null default gen_random_uuid(),
  enrollment_id uuid,
  profile_id uuid not null,
  course_id uuid,
  template_id uuid,
  codigo text not null,
  titulo text not null,
  tipo text default 'certificado'::text,
  estado text default 'emitido'::text,
  emitido_en timestamp with time zone not null default now(),
  pdf_url text,
  datos jsonb default '{}'::jsonb,
  anulado_en timestamp with time zone,
  anulado_por uuid,
  anulado_motivo text,
  module_id uuid
);

create table if not exists public.cem_classes (
  id uuid not null default gen_random_uuid(),
  cohort_id uuid not null,
  titulo text not null,
  descripcion text,
  fecha date not null,
  hora_inicio time without time zone,
  hora_fin time without time zone,
  modalidad cem_modalidad default 'online'::cem_modalidad,
  salon text,
  url_sesion text,
  grabacion_url text,
  teacher_id uuid,
  estado text default 'programada'::text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_clave_pendiente (
  profile_id uuid not null,
  hash_inicial text not null,
  creada_en timestamp with time zone not null default now()
);

create table if not exists public.cem_cohorts (
  id uuid not null default gen_random_uuid(),
  course_id uuid not null,
  codigo text not null,
  nombre text not null,
  modalidad cem_modalidad not null default 'online'::cem_modalidad,
  turno text,
  horario text,
  salon text,
  fecha_inicio date,
  fecha_fin date,
  cupos integer default 30,
  estado cem_cohorte_estado not null default 'planificada'::cem_cohorte_estado,
  created_at timestamp with time zone not null default now(),
  horario_dias text[],
  horario_hora_inicio time without time zone,
  horario_hora_fin time without time zone
);

create table if not exists public.cem_comentarios_guardados (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  texto text not null,
  usos integer not null default 0,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_compras_invitado (
  id uuid not null default gen_random_uuid(),
  course_id uuid not null,
  cohort_id uuid,
  nombre text not null,
  email text not null,
  cuotas integer not null default 1,
  monto numeric not null,
  moneda text not null default 'USD'::text,
  session_id text,
  estado text not null default 'abierta'::text,
  profile_id uuid,
  enrollment_id uuid,
  cuenta_nueva boolean,
  ip text,
  creada_en timestamp with time zone not null default now(),
  pagada_en timestamp with time zone,
  rescatada_en timestamp with time zone
);
comment on table public.cem_compras_invitado is 'Compras empezadas por gente sin cuenta. La cuenta y la inscripción se crean sólo cuando el pago entra.';

create table if not exists public.cem_content_reviews (
  id uuid not null default gen_random_uuid(),
  lesson_id uuid,
  course_id uuid,
  titulo text not null,
  tipo text default 'leccion'::text,
  autor_id uuid,
  revisor_id uuid,
  version text default 'v1'::text,
  estado text default 'pendiente'::text,
  comentario text,
  created_at timestamp with time zone not null default now(),
  actualizado_en timestamp with time zone not null default now()
);

create table if not exists public.cem_conversiones (
  id uuid not null default gen_random_uuid(),
  fecha date not null default CURRENT_DATE,
  cartera_origen text,
  cartera_destino text,
  monto_origen numeric,
  monto_destino numeric,
  tasa numeric,
  estado text not null default 'completada'::text,
  nota text,
  eliminado boolean not null default false,
  creado_por uuid,
  creado_en timestamp with time zone not null default now()
);
comment on table public.cem_conversiones is 'Dinero que se mueve entre carteras. monto_origen y monto_destino se guardan por separado a propósito: lo que llega casi nunca es origen × tasa —hay comisiones, redondeos, y el cambista se queda con algo—, y el saldo tiene que reflejar lo que pasó, no la teoría. La tasa queda como dato histórico para auditar, no para calcular.';

create table if not exists public.cem_correo_cola (
  id uuid not null default gen_random_uuid(),
  para text not null,
  asunto text not null,
  cuerpo text not null,
  estado text not null default 'pendiente'::text,
  intentos integer not null default 0,
  error text,
  enviado_en timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  clave text not null,
  proximo_intento_en timestamp with time zone not null default now(),
  request_id bigint,
  proveedor_id text
);
comment on table public.cem_correo_cola is 'Correos por enviar. Sin políticas de acceso a propósito: sólo el servidor la lee.';

create table if not exists public.cem_course_shorts (
  id uuid not null default gen_random_uuid(),
  course_id uuid not null,
  video_id text not null,
  titulo text not null,
  descripcion text,
  duracion_seg integer,
  orden integer not null default 0,
  publicado boolean not null default true,
  creado_por uuid,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_courses (
  id uuid not null default gen_random_uuid(),
  codigo text,
  nombre text not null,
  subtitulo text,
  descripcion_corta text,
  descripcion text,
  tipo cem_course_tipo not null default 'curso'::cem_course_tipo,
  categoria text,
  modalidad cem_modalidad not null default 'online'::cem_modalidad,
  nivel cem_nivel not null default 'basico'::cem_nivel,
  horas integer default 0,
  duracion_texto text,
  precio numeric(12,2) default 0,
  moneda text default 'EUR'::text,
  imagen_url text,
  destacado boolean default false,
  estado cem_pub_estado not null default 'borrador'::cem_pub_estado,
  certificado_nombre text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  descuento_pct numeric,
  descuento_nota text,
  cuotas_habilitadas boolean not null default false,
  cuotas_cantidad integer,
  metodos_pago text[],
  codigo_descuento text,
  peso_evaluaciones numeric not null default 30,
  youtube_playlist text,
  stripe_product_id text,
  stripe_sync_en timestamp with time zone,
  stripe_sync_error text,
  stripe_sync_peticion bigint,
  video_intro text
);

create table if not exists public.cem_datos_de_prueba (
  tabla text not null,
  fila_id text not null,
  sembrado_en timestamp with time zone not null default now()
);
comment on table public.cem_datos_de_prueba is 'Qué filas metió la siembra de pruebas. El borrado usa esto y sólo esto, para que no pueda tocar un dato real ni equivocándose.';

create table if not exists public.cem_duda_respuestas (
  id uuid not null default gen_random_uuid(),
  duda_id uuid not null,
  autor_id uuid not null,
  cuerpo text not null,
  de_docente boolean not null default false,
  eliminada boolean not null default false,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_dudas (
  id uuid not null default gen_random_uuid(),
  lesson_id uuid not null,
  course_id uuid not null,
  cohort_id uuid,
  autor_id uuid not null,
  cuerpo text not null,
  segundo integer,
  resuelta boolean not null default false,
  eliminada boolean not null default false,
  created_at timestamp with time zone not null default now()
);
comment on table public.cem_dudas is 'Preguntas sobre una lección concreta. Las ve toda la cohorte a propósito: una duda respondida en privado se vuelve a preguntar diez veces.';

create table if not exists public.cem_enrollments (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  course_id uuid not null,
  cohort_id uuid,
  precio_lista numeric(12,2) default 0,
  descuento numeric(12,2) default 0,
  precio_final numeric(12,2) default 0,
  moneda text default 'EUR'::text,
  promocion text,
  vendedor_id uuid,
  fuente text,
  referido_por text,
  estado cem_inscripcion_estado not null default 'pendiente'::cem_inscripcion_estado,
  progreso numeric(5,2) default 0,
  nota_final numeric(5,2),
  fecha_inscripcion timestamp with time zone not null default now(),
  ultimo_acceso timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_gastos (
  id uuid not null default gen_random_uuid(),
  fecha date not null default CURRENT_DATE,
  concepto text not null,
  categoria text,
  monto numeric not null,
  moneda text not null,
  cartera_id text,
  referencia text,
  comprobante_url text,
  nota text,
  eliminado boolean not null default false,
  creado_por uuid,
  creado_en timestamp with time zone not null default now(),
  linea cem_course_tipo,
  reparto jsonb,
  tasa numeric(18,6),
  monto_base numeric(14,2)
);
comment on table public.cem_gastos is 'Todo lo que sale de una cartera y no es una conversión: honorarios, servicios, comisiones del banco.';

create table if not exists public.cem_identidad (
  profile_id uuid not null,
  frente_ruta text,
  dorso_ruta text,
  subido_en timestamp with time zone,
  estado text not null default 'pendiente'::text,
  revisado_por uuid,
  revisado_en timestamp with time zone,
  motivo text,
  created_at timestamp with time zone not null default now()
);
comment on table public.cem_identidad is 'Documento de identidad del estudiante. Las imágenes viven en el depósito privado cem-identidad; aquí sólo la ruta y el estado de revisión.';

create table if not exists public.cem_installments (
  id uuid not null default gen_random_uuid(),
  enrollment_id uuid not null,
  numero integer not null,
  monto numeric(12,2) not null,
  moneda text default 'EUR'::text,
  fecha_vencimiento date,
  estado cem_cuota_estado not null default 'pendiente'::cem_cuota_estado,
  saldo numeric(12,2) default 0,
  nota text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_integraciones (
  id text not null,
  datos jsonb not null default '{}'::jsonb,
  actualizado_en timestamp with time zone not null default now()
);
comment on table public.cem_integraciones is 'Credenciales y estado de integraciones externas (YouTube, etc.). Sin políticas: sólo accesible vía service_role desde Edge Functions, nunca desde el cliente.';

create table if not exists public.cem_inversores (
  id uuid not null default gen_random_uuid(),
  nombre text not null,
  color text not null default '#3b82f6'::text,
  nota text,
  activo boolean not null default true,
  creado_en timestamp with time zone not null default now()
);

create table if not exists public.cem_invitaciones (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  course_id uuid not null,
  cohort_id uuid,
  precio_lista numeric not null default 0,
  descuento numeric not null default 0,
  precio_final numeric not null default 0,
  moneda text not null default 'EUR'::text,
  cuotas integer not null default 1,
  mensaje text,
  vence date,
  estado text not null default 'pendiente'::text,
  enrollment_id uuid,
  creada_por uuid,
  created_at timestamp with time zone not null default now(),
  resuelta_en timestamp with time zone
);

create table if not exists public.cem_invitaciones_equipo (
  id uuid not null default gen_random_uuid(),
  email text not null,
  rol cem_role not null,
  nombre text,
  apellido text,
  token text not null,
  mensaje text,
  invitada_por uuid,
  creada_en timestamp with time zone not null default now(),
  vence_en timestamp with time zone not null,
  usada_en timestamp with time zone,
  usada_por uuid,
  anulada_en timestamp with time zone,
  anulada_por uuid
);

create table if not exists public.cem_lead_envios (
  id uuid not null default gen_random_uuid(),
  lead_id uuid not null,
  plantilla_id uuid,
  plantilla_clave text not null,
  plantilla_nombre text not null,
  asunto text not null,
  para text not null,
  enviado_por uuid,
  enviado_en timestamp with time zone not null default now()
);

create table if not exists public.cem_leads (
  id uuid not null default gen_random_uuid(),
  nombre text not null,
  email text,
  telefono text,
  mensaje text,
  interes text,
  course_id uuid,
  como_nos_conocio text,
  origen text,
  estado text not null default 'nuevo'::text,
  nota_interna text,
  atendido_por uuid,
  atendido_en timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  apellido text
);
comment on table public.cem_leads is 'Quien dejó sus datos desde la web pública sin llegar a crear cuenta.';

create table if not exists public.cem_leccion_valoraciones (
  id uuid not null default gen_random_uuid(),
  lesson_id uuid not null,
  profile_id uuid not null,
  util integer not null,
  comentario text,
  created_at timestamp with time zone not null default now(),
  actualizado_en timestamp with time zone not null default now()
);
comment on table public.cem_leccion_valoraciones is 'Qué le pareció cada lección a cada estudiante. Una por persona y lección.';

create table if not exists public.cem_lesson_progress (
  id uuid not null default gen_random_uuid(),
  enrollment_id uuid not null,
  lesson_id uuid not null,
  completado boolean default false,
  segundos_vistos integer default 0,
  notas text,
  actualizado_en timestamp with time zone not null default now(),
  para_despues boolean not null default false
);

create table if not exists public.cem_lessons (
  id uuid not null default gen_random_uuid(),
  module_id uuid not null,
  titulo text not null,
  descripcion text,
  tipo cem_leccion_tipo not null default 'video'::cem_leccion_tipo,
  contenido text,
  url text,
  duracion_min integer default 0,
  orden integer not null default 0,
  obligatorio boolean default true,
  estado cem_pub_estado not null default 'borrador'::cem_pub_estado,
  created_at timestamp with time zone not null default now(),
  video_id text
);

create table if not exists public.cem_liquidaciones (
  id uuid not null default gen_random_uuid(),
  fecha date not null default CURRENT_DATE,
  ronda_id uuid not null,
  inversor_id uuid not null,
  linea cem_course_tipo not null,
  monto numeric(14,2) not null,
  moneda text not null default 'EUR'::text,
  tasa numeric(18,6),
  monto_base numeric(14,2) not null,
  cartera_id text,
  nota text,
  lote uuid not null default gen_random_uuid(),
  creado_por uuid,
  creado_en timestamp with time zone not null default now(),
  eliminado boolean not null default false,
  eliminado_por uuid,
  eliminado_en timestamp with time zone
);

create table if not exists public.cem_media (
  id uuid not null default gen_random_uuid(),
  nombre text not null,
  descripcion text,
  tipo text default 'pdf'::text,
  url text,
  storage_path text,
  tamano_bytes bigint default 0,
  course_id uuid,
  module_id uuid,
  publico boolean default false,
  requiere_modulo text,
  subido_por uuid,
  created_at timestamp with time zone not null default now(),
  lesson_id uuid
);

create table if not exists public.cem_mensajes_plantilla (
  id uuid not null default gen_random_uuid(),
  clave text not null,
  nombre text not null,
  tipo text not null default 'otro'::text,
  asunto text not null,
  cuerpo text not null,
  activa boolean not null default true,
  orden integer not null default 0,
  creada_por uuid,
  created_at timestamp with time zone not null default now(),
  actualizada_en timestamp with time zone not null default now()
);

create table if not exists public.cem_metodos_pago (
  metodo text not null,
  moneda text not null,
  regla text not null,
  tasa_moneda text,
  activo boolean not null default true,
  orden integer not null default 0,
  nota text,
  cartera_id text,
  titular text,
  destino text,
  destino_etiqueta text,
  datos jsonb not null default '{}'::jsonb,
  instrucciones text
);
comment on table public.cem_metodos_pago is 'Cómo se convierte cada forma de pago a la moneda de la casa (EUR). directo = ya viene en euros; uno_a_uno = un dólar vale un euro; tasa_bcv = se divide entre la tasa BCV de tasa_moneda.';

create table if not exists public.cem_modules (
  id uuid not null default gen_random_uuid(),
  course_id uuid not null,
  titulo text not null,
  descripcion text,
  orden integer not null default 0,
  created_at timestamp with time zone not null default now(),
  imagen_url text,
  profesor_id uuid,
  certifica boolean not null default false,
  horas integer,
  certificado_nombre text
);

create table if not exists public.cem_muro (
  id uuid not null default gen_random_uuid(),
  cohort_id uuid not null,
  autor_id uuid,
  cuerpo text not null,
  lesson_id uuid,
  assessment_id uuid,
  adjuntos jsonb not null default '[]'::jsonb,
  fijado boolean not null default false,
  editado_en timestamp with time zone,
  eliminado boolean not null default false,
  created_at timestamp with time zone not null default now()
);
comment on table public.cem_muro is 'El tablón de una cohorte: avisos del profesor y lo que se comenta ahí. Cada fila puede colgar de una lección o una evaluación para enlazarla en vez de repetirla.';

create table if not exists public.cem_muro_comentarios (
  id uuid not null default gen_random_uuid(),
  post_id uuid not null,
  autor_id uuid,
  cuerpo text not null,
  eliminado boolean not null default false,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_notificaciones (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  tipo text not null,
  titulo text not null,
  cuerpo text,
  url text,
  leida_en timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_payments (
  id uuid not null default gen_random_uuid(),
  enrollment_id uuid not null,
  installment_id uuid,
  monto numeric(12,2) not null,
  moneda text default 'USD'::text,
  tasa numeric(14,6) default 1,
  monto_base numeric(12,2),
  metodo text,
  cuenta text,
  referencia text,
  comprobante_url text,
  estado text default 'registrado'::text,
  conciliado boolean default false,
  registrado_por uuid,
  fecha timestamp with time zone not null default now(),
  nota text,
  cartera_id text,
  tasa_moneda text,
  tasa_cruce numeric,
  concesion_base numeric
);

create table if not exists public.cem_permissions (
  id uuid not null default gen_random_uuid(),
  rol cem_role not null,
  modulo text not null,
  accion text not null,
  permitido boolean not null default false
);

create table if not exists public.cem_plantillas_mensaje (
  id uuid not null default gen_random_uuid(),
  nombre text not null,
  asunto text not null,
  cuerpo text not null,
  usos integer not null default 0,
  creada_por uuid,
  created_at timestamp with time zone not null default now()
);
comment on table public.cem_plantillas_mensaje is 'Puntos de partida para los avisos que se repiten. Se pegan y se editan; no se envían tal cual.';

create table if not exists public.cem_portafolio (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  titulo text not null,
  descripcion text,
  enlace text,
  imagen_url text,
  orden integer not null default 0,
  created_at timestamp with time zone not null default now()
);
comment on table public.cem_portafolio is 'Lo que cada persona quiere enseñar de su trabajo. Se ve en su perfil público, y sólo si lo encendió.';

create table if not exists public.cem_profiles (
  id uuid not null,
  nombre text not null,
  apellido text,
  email text not null,
  rol cem_role not null default 'estudiante'::cem_role,
  telefono text,
  documento_tipo text,
  documento text,
  pais text,
  ciudad text,
  avatar_url text,
  bio text,
  activo boolean not null default true,
  created_at timestamp with time zone not null default now(),
  perfil_publico boolean not null default false,
  perfil_slug text,
  perfil_muestra jsonb not null default '{"notas": false, "insignias": true, "programas": true}'::jsonb,
  fecha_nacimiento date,
  ocupacion text,
  como_nos_conocio text,
  portada_url text,
  intereses text[]
);

create table if not exists public.cem_puente_estado (
  id boolean not null default true,
  conectado boolean not null default false,
  numero text,
  modo text,
  version text,
  ultimo_latido timestamp with time zone,
  arrancado timestamp with time zone,
  mensajes integer not null default 0,
  respondidos integer not null default 0,
  fallos integer not null default 0,
  avisado_caida timestamp with time zone,
  actualizado timestamp with time zone not null default now(),
  avisado_sin_vincular timestamp with time zone
);
comment on table public.cem_puente_estado is 'Una fila: el estado del puente de WhatsApp. La escribe el propio puente por medio de cem-whatsapp.';

create table if not exists public.cem_questions (
  id uuid not null default gen_random_uuid(),
  course_id uuid,
  enunciado text not null,
  ayuda text,
  tipo cem_pregunta_tipo not null default 'multiple'::cem_pregunta_tipo,
  dificultad cem_dificultad not null default 'media'::cem_dificultad,
  opciones jsonb default '[]'::jsonb,
  respuesta_correcta jsonb,
  explicacion text,
  usos integer default 0,
  aciertos integer default 0,
  created_at timestamp with time zone not null default now(),
  module_id uuid,
  carpeta text,
  config jsonb not null default '{}'::jsonb,
  obligatoria boolean not null default true,
  barajar_opciones boolean not null default false
);

create table if not exists public.cem_rate_limit (
  clave text not null,
  ventana_en timestamp with time zone not null default now(),
  intentos integer not null default 0,
  bloqueado_hasta timestamp with time zone
);

create table if not exists public.cem_recurso_entregas (
  id uuid not null default gen_random_uuid(),
  recurso_id uuid not null,
  lead_id uuid,
  email text,
  origen text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_recursos (
  id uuid not null default gen_random_uuid(),
  codigo text not null,
  titulo text not null,
  descripcion text,
  tipo text not null,
  storage_path text,
  archivo_nombre text,
  video_id text,
  url text,
  gancho text,
  activo boolean not null default true,
  creado_por uuid,
  created_at timestamp with time zone not null default now(),
  actualizado_en timestamp with time zone not null default now()
);
comment on table public.cem_recursos is 'Lo que se regala en redes a cambio de un contacto. El código es lo que va en el enlace de ManyChat.';

create table if not exists public.cem_reproducciones (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  lesson_id uuid not null,
  course_id uuid,
  dia date not null default ((now() AT TIME ZONE 'UTC'::text))::date,
  empezado_en timestamp with time zone not null default now(),
  ultimo_en timestamp with time zone not null default now(),
  segundos integer not null default 0,
  ip text,
  navegador text
);

create table if not exists public.cem_ronda_partes (
  id uuid not null default gen_random_uuid(),
  ronda_id uuid not null,
  inversor_id uuid not null,
  linea cem_course_tipo not null,
  pct numeric(7,4) not null,
  aporte numeric(14,2) not null default 0
);

create table if not exists public.cem_rondas (
  id uuid not null default gen_random_uuid(),
  nombre text not null,
  desde date not null,
  hasta date,
  nota text,
  creado_en timestamp with time zone not null default now()
);

create table if not exists public.cem_settings (
  clave text not null,
  valor jsonb not null default '{}'::jsonb,
  descripcion text,
  actualizado_en timestamp with time zone not null default now()
);

create table if not exists public.cem_solicitudes_inscripcion (
  id uuid not null default gen_random_uuid(),
  enrollment_id uuid not null,
  profile_id uuid not null,
  tipo text not null,
  motivo text not null,
  hasta date,
  estado text not null default 'pendiente'::text,
  resolucion text,
  resuelto_por uuid,
  resuelto_en timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  datos jsonb not null default '{}'::jsonb
);

create table if not exists public.cem_solicitudes_perfil (
  id uuid not null default gen_random_uuid(),
  profile_id uuid not null,
  campos jsonb not null,
  motivo text,
  estado text not null default 'pendiente'::text,
  resolucion text,
  resuelto_por uuid,
  resuelto_en timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_stripe_sesiones (
  id uuid not null default gen_random_uuid(),
  session_id text not null,
  installment_id uuid not null,
  profile_id uuid not null,
  monto_centimos integer not null,
  moneda text not null default 'eur'::text,
  estado text not null default 'abierta'::text,
  payment_intent text,
  created_at timestamp with time zone not null default now(),
  pagado_en timestamp with time zone
);

create table if not exists public.cem_submissions (
  id uuid not null default gen_random_uuid(),
  assessment_id uuid not null,
  enrollment_id uuid not null,
  intento integer default 1,
  respuestas jsonb default '{}'::jsonb,
  archivo_url text,
  puntaje numeric(6,2),
  estado cem_entrega_estado not null default 'en_progreso'::cem_entrega_estado,
  tarde boolean default false,
  feedback text,
  calificado_por uuid,
  iniciado_en timestamp with time zone default now(),
  entregado_en timestamp with time zone,
  calificado_en timestamp with time zone,
  puntaje_objetivo numeric,
  peso_objetivo numeric,
  requiere_revision boolean not null default false,
  rubrica_puntos jsonb
);

create table if not exists public.cem_tasa_peticiones (
  id uuid not null default gen_random_uuid(),
  moneda text not null,
  request_id bigint not null,
  estado text not null default 'pidiendo'::text,
  error text,
  pedido_en timestamp with time zone not null default now(),
  resuelto_en timestamp with time zone
);

create table if not exists public.cem_tasas_bcv (
  id uuid not null default gen_random_uuid(),
  id_tasa text not null,
  valor numeric not null,
  descripcion text,
  fecha date not null,
  actualizado_en timestamp with time zone not null default now(),
  moneda text not null default 'USD'::text
);

create table if not exists public.cem_teacher_assignments (
  id uuid not null default gen_random_uuid(),
  teacher_id uuid not null,
  cohort_id uuid,
  course_id uuid,
  rol_docente text default 'titular'::text,
  tarifa_hora numeric(12,2),
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_ticket_messages (
  id uuid not null default gen_random_uuid(),
  ticket_id uuid not null,
  autor_id uuid,
  cuerpo text not null,
  interno boolean default false,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_tickets (
  id uuid not null default gen_random_uuid(),
  codigo text,
  profile_id uuid not null,
  categoria text default 'general'::text,
  prioridad cem_prioridad default 'media'::cem_prioridad,
  asunto text not null,
  descripcion text,
  estado cem_ticket_estado not null default 'abierto'::cem_ticket_estado,
  asignado_a uuid,
  created_at timestamp with time zone not null default now(),
  actualizado_en timestamp with time zone not null default now()
);

create table if not exists public.cem_turnos (
  id uuid not null default gen_random_uuid(),
  nombre text not null,
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cem_valoraciones (
  id uuid not null default gen_random_uuid(),
  class_id uuid,
  cohort_id uuid not null,
  profile_id uuid not null,
  claridad integer,
  utilidad integer,
  ritmo integer,
  comentario text,
  created_at timestamp with time zone not null default now()
);
comment on table public.cem_valoraciones is 'Lo que opina un estudiante de una clase. El profesor y la coordinación ven los promedios y los comentarios SIN NOMBRE: si se supiera quién dijo qué, nadie diría nada útil.';

create table if not exists public.cert_carpetas (
  ruta text not null,
  creada_en timestamp with time zone not null default now(),
  creada_por uuid
);
comment on table public.cert_carpetas is 'Carpetas del generador de certificados creadas a mano y todavía sin plantillas dentro. Las que tienen plantillas se deducen del campo "carpeta" de cada plantilla.';

create table if not exists public.cert_certificates (
  id uuid not null default gen_random_uuid(),
  entidad_emisora text not null default 'SEM'::text,
  estado text not null default 'vigente'::text,
  reemplaza_a uuid,
  lote_id uuid,
  motivo_revocacion text,
  created_by text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  datos jsonb not null default '{}'::jsonb,
  plantilla_nombre text
);

create table if not exists public.cert_lotes (
  id uuid not null default gen_random_uuid(),
  nombre text not null,
  entidad text not null default 'CEM'::text,
  nota text,
  creado_por text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.cert_settings (
  id integer not null default 1,
  config jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.cert_templates (
  id uuid not null default gen_random_uuid(),
  nombre text not null default 'Sin nombre'::text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.forest_ai_predictions (
  id uuid not null default gen_random_uuid(),
  tree_id uuid not null,
  provider text not null,
  model_version text,
  common_name text,
  scientific_name text,
  confidence numeric,
  alternatives jsonb not null default '[]'::jsonb,
  visible_characteristics jsonb not null default '[]'::jsonb,
  requires_human_review boolean not null default true,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.forest_audit_events (
  id uuid not null default gen_random_uuid(),
  tree_id uuid,
  actor_id uuid,
  accion text not null,
  estado_anterior text,
  estado_nuevo text,
  comentario text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.forest_code_sequences (
  project_id uuid not null,
  anio integer not null,
  ultimo_numero integer not null default 0
);

create table if not exists public.forest_profiles (
  id uuid not null,
  nombre text not null,
  email text not null,
  rol forest_role not null,
  activo boolean not null default true,
  created_at timestamp with time zone not null default now(),
  cedula text,
  telefono text
);

create table if not exists public.forest_projects (
  id uuid not null default gen_random_uuid(),
  nombre text not null,
  prefijo text not null,
  area_piloto text,
  anio_activo integer not null default (EXTRACT(year FROM now()))::integer,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.forest_public_content (
  tree_id uuid not null,
  titulo text,
  resumen text,
  bloques jsonb not null default '[]'::jsonb,
  publicado boolean not null default true,
  actualizado_por uuid,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.forest_public_templates (
  ambito forest_tree_tipo not null,
  bloques_antes jsonb not null default '[]'::jsonb,
  bloques_despues jsonb not null default '[]'::jsonb,
  publicado boolean not null default true,
  actualizado_por uuid,
  updated_at timestamp with time zone not null default now()
);
comment on table public.forest_public_templates is 'Contenido que se muestra en TODAS las fichas publicas de un tipo de arbol. Se edita una vez y aplica a todo el parque.';

create table if not exists public.forest_push_subscriptions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null,
  p256dh text not null,
  auth_key text not null,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.forest_qr_batches (
  id uuid not null default gen_random_uuid(),
  nombre text not null,
  prefijo_etiqueta text not null default 'Árbol'::text,
  cantidad integer not null,
  numero_desde integer not null,
  numero_hasta integer not null,
  tipo_previsto forest_tree_tipo not null default 'PUBLICO'::forest_tree_tipo,
  notas text,
  creado_por uuid,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.forest_qr_counter (
  id integer not null default 1,
  ultimo_numero integer not null default 0
);

create table if not exists public.forest_qr_tags (
  id uuid not null default gen_random_uuid(),
  token text not null,
  numero integer not null,
  etiqueta_visible text not null,
  batch_id uuid,
  tipo_previsto forest_tree_tipo not null default 'PUBLICO'::forest_tree_tipo,
  estado text not null default 'disponible'::text,
  tree_id uuid,
  asignada_por uuid,
  asignada_en timestamp with time zone,
  colocada_en timestamp with time zone,
  reemplaza_a uuid,
  notas text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.forest_reviews (
  id uuid not null default gen_random_uuid(),
  tree_id uuid not null,
  supervisor_id uuid not null,
  decision forest_decision not null,
  comentario text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.forest_secrets (
  key text not null,
  value text not null,
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.forest_species_catalog (
  id uuid not null default gen_random_uuid(),
  nombre_comun text not null,
  nombre_cientifico text,
  sinonimos jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone not null default now(),
  descripcion text,
  fotos jsonb not null default '[]'::jsonb
);

create table if not exists public.forest_species_requests (
  id uuid not null default gen_random_uuid(),
  tree_id uuid,
  supervisor_id uuid,
  nombre_comun_propuesto text not null,
  nombre_cientifico_propuesto text,
  comentario text,
  estado text not null default 'pendiente'::text,
  especie_creada_id uuid,
  resuelto_por uuid,
  resuelto_en timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.forest_tree_photos (
  id uuid not null default gen_random_uuid(),
  tree_id uuid not null,
  tipo forest_photo_tipo not null,
  storage_path text not null,
  hash text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.forest_trees (
  id uuid not null default gen_random_uuid(),
  codigo_visible text not null,
  project_id uuid not null,
  registrador_id uuid not null,
  estado forest_tree_estado not null default 'BORRADOR'::forest_tree_estado,
  lat double precision,
  lng double precision,
  precision_m numeric,
  ubicacion_fuente text default 'gps_navegador'::text,
  capturado_en timestamp with time zone,
  altura_m numeric,
  dap_cm numeric,
  diametro_copa_m numeric,
  condicion forest_condicion,
  observaciones text,
  nombre_comun_declarado text,
  nombre_cientifico_tentativo text,
  especie_confirmada_id uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  asignado_a uuid,
  client_id uuid,
  tipo forest_tree_tipo not null default 'PUBLICO'::forest_tree_tipo
);

create table if not exists public.pm_project_events (
  id bigint not null,
  project_id uuid,
  event_type text not null,
  summary text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.pm_projects (
  id uuid not null default gen_random_uuid(),
  meta jsonb not null default '{}'::jsonb,
  project_state jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create table if not exists public.quote_events (
  id bigint not null,
  quote_id uuid not null,
  event_type text not null,
  summary text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.quotes (
  id uuid not null default gen_random_uuid(),
  client jsonb not null default '{}'::jsonb,
  quote_state jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

