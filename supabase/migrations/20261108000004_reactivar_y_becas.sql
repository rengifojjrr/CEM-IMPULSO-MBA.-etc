-- Reactivar devuelve la inscripción a como estaba, y la beca se va con quien se retira.
--
-- LOS FALLOS
-- 1. Desde Mi perfil no se podía pedir nada. En la base había dos
--    cem_solicitar_cambio_inscripcion: la vieja, de cuatro parámetros, y la de
--    cinco (la del cambio de plan, con p_cuotas opcional). Mi perfil manda
--    cuatro con nombre, que encajan en las dos, y PostgREST no elige: contesta
--    PGRST203. Congelar, retirarse y reactivar fallaban siempre; el cambio de
--    plan, que manda p_cuotas, no.
-- 2. Reactivar dejaba «activa» sin mirar nada (lo-que-falta §3.10). Una
--    pendiente sin pagar pedía la pausa, después la reactivación, y salía
--    activa; la regla del aula (cem_inscripcion_abierta) se fía de «activa»,
--    así que se abría sin un solo pago. Pasaba por dos manos del equipo, pero
--    entraba. Y se podía pedir «reactivar» una pendiente que nunca estuvo en
--    pausa: aprobada, quedaba activa igual.
-- 3. Una suspendida podía pedir la pausa, y aprobar miraba la solicitud, no la
--    inscripción: lo pedido estando activa se congelaba aunque el equipo la
--    hubiera suspendido entre medias. Con la reactivación después, la
--    suspensión salía «activa» por la otra puerta.
-- 4. La beca no se iba con quien se retiraba (§3.10): la inscripción se
--    cancelaba, pero la beca seguía «otorgada» y el fondo no recuperaba lo
--    apartado. Sólo lo hacía cem_beca_revocar, que es de admin; las retiradas
--    las aprueba también coordinación, y hay dos caminos más a «cancelada»:
--    cem_cancelar_inscripcion y el estado puesto a mano en Admin → Estudiante.
--
-- EL ARREGLO
-- 1. Se borra la de cuatro. La de cinco hace lo mismo y además el cambio de
--    plan, y la llamada de Mi perfil encaja ya en una sola.
-- 2. Al aprobar una pausa se apunta en la solicitud el estado que tenía
--    (datos.estado_previo), y la reactivación la devuelve a él, tomándolo del
--    último congelamiento aprobado: activa vuelve activa; pendiente vuelve
--    pendiente, salvo que mientras tanto haya entrado un pago o ya no cueste
--    nada, y entonces activa, que es lo que habría hecho el pago sin la pausa
--    (cem_activar_al_pagar sólo activa pendientes). Sin apunte —lo congelado
--    antes de esto, o a mano—: activa si no cuesta nada o tiene un pago
--    confirmado; si no, pendiente.
-- 3. Suspendida no pide pausa ni reactivación: se le dice que escriba al
--    equipo. La pausa se pide de una activa o pendiente; la reactivación, de
--    una congelada. Y al aprobar se mira el estado de AHORA, con la
--    inscripción bloqueada: congelar sólo una activa o pendiente, reactivar
--    sólo una congelada, retirar lo que no esté ya cancelado o terminado. Si
--    no, un error para el equipo, que rechaza la solicitud explicando por qué.
-- 4. Un disparador en cem_enrollments (cem_becas_al_cancelar): cuando una
--    inscripción pasa a cancelada, por el camino que sea, sus becas otorgadas
--    se revocan («Se retiró del programa») y lo apartado vuelve al fondo, con
--    su apunte en la auditoría. No mira quién cancela: coordinación aprueba
--    retiradas, el estudiante se da de baja, y el servidor también cancela.
--    cem_beca_revocar revoca y devuelve el dinero ANTES de cancelar la
--    inscripción: así el disparador la encuentra ya revocada y no hace nada,
--    y lo que contesta (vuelve_al_fondo) sigue siendo lo que volvió.
--
-- LO QUE NO CAMBIA
-- Los avisos y la auditoría de las solicitudes (la auditoría lleva además el
-- estado de antes y el de después). Las cuotas: la pausa congela las
-- pendientes, la reactivación las devuelve a pendiente, la retirada anula las
-- pendientes y las congeladas. cem_beca_revocar sigue devolviéndole su precio
-- a la inscripción. Una beca anterior al sistema no se toca. Volver a activar
-- a mano una cancelada no devuelve la beca: se da otra.
--
-- LOS PERMISOS
-- Los de la casa. Las que llaman las pantallas, sin PUBLIC ni anon: sólo
-- authenticated (y service_role, el servidor), como estaban. Las dos nuevas
-- son internas y no las ejecuta nadie, ni service_role. El disparador corre
-- como su dueño, así que funciona aunque quien cancela no pueda ni leer
-- cem_becas: Admin → Estudiante cancela con un update directo, como
-- authenticated.
--
-- El 6 de noviembre no había ninguna solicitud ni ninguna beca en la base, así
-- que no hay nada que corregir hacia atrás. El último bloque lo haría si lo
-- hubiera.
--
-- La prueba: pruebas/sql/reactivar-y-becas.sql (antes de esto, 20 fallos de 46).

-- ═══ 1. UNA SOLA FUNCIÓN PARA PEDIR ════════════════════════════════════════

drop function if exists public.cem_solicitar_cambio_inscripcion(uuid, text, text, date);

create or replace function public.cem_solicitar_cambio_inscripcion(
  p_enrollment_id uuid, p_tipo text, p_motivo text,
  p_hasta date default null, p_cuotas integer default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_yo uuid := auth.uid(); v_dueno uuid; v_estado cem_inscripcion_estado; v_id uuid;
begin
  if p_tipo not in ('congelamiento','retiro','reactivacion','plan_de_pago') then
    raise exception 'Tipo de solicitud no reconocido.';
  end if;
  if coalesce(trim(p_motivo), '') = '' then
    raise exception 'Cuéntanos el motivo: es lo que va a leer quien lo resuelva.';
  end if;
  if p_tipo = 'plan_de_pago' and coalesce(p_cuotas, 0) not between 1 and 24 then
    raise exception 'Di en cuántas cuotas quieres pagarlo, entre 1 y 24.';
  end if;

  select profile_id, estado into v_dueno, v_estado
    from cem_enrollments where id = p_enrollment_id;
  if v_dueno is null then raise exception 'No encontramos esa inscripción.'; end if;
  if v_dueno <> v_yo and not cem_is_staff() then
    raise exception 'Sólo puedes pedir cambios sobre tus propias inscripciones.';
  end if;
  if v_estado in ('cancelada','finalizada') then
    raise exception 'Esa inscripción ya está %; no admite cambios.', v_estado;
  end if;
  -- Una suspensión la levanta el equipo. Si se pudiera pedir la pausa, la
  -- reactivación la devolvería abierta: saldría por la otra puerta.
  if v_estado = 'suspendida' and p_tipo in ('congelamiento','reactivacion') then
    raise exception 'Tu inscripción está suspendida, y una pausa no la levanta: escríbenos desde Mensajes y lo resolvemos.';
  end if;
  if p_tipo = 'congelamiento' and v_estado = 'congelada' then
    raise exception 'Esa inscripción ya está en pausa.';
  end if;
  if p_tipo = 'reactivacion' and v_estado <> 'congelada' then
    raise exception 'Sólo se reactiva una inscripción en pausa, y ésta no lo está.';
  end if;
  if exists (select 1 from cem_solicitudes_inscripcion
              where enrollment_id = p_enrollment_id and estado = 'pendiente') then
    raise exception 'Ya tienes una solicitud pendiente sobre esta inscripción.';
  end if;

  insert into cem_solicitudes_inscripcion (enrollment_id, profile_id, tipo, motivo, hasta, datos)
  values (p_enrollment_id, v_dueno, p_tipo, trim(p_motivo), p_hasta,
          case when p_tipo = 'plan_de_pago'
               then jsonb_build_object('cuotas', p_cuotas) else '{}'::jsonb end)
  returning id into v_id;

  -- al equipo le llega que hay algo por resolver
  perform cem_notificar(p.id, 'solicitud_inscripcion',
            format('Solicitud de %s por resolver', replace(p_tipo, '_', ' ')),
            trim(p_motivo), 'admin/inscripciones.html')
     from cem_profiles p
    where p.rol in ('coordinador','admin','superadmin') and p.activo;

  return v_id;
end $$;

comment on function public.cem_solicitar_cambio_inscripcion(uuid, text, text, date, integer) is
  'El estudiante (o el equipo por él) pide congelar, retirarse, reactivar o cambiar el plan de pago. La pausa se pide de una inscripción activa o pendiente, y la reactivación de una congelada; una suspendida no pide ninguna de las dos: la suspensión la levanta el equipo. Una sola solicitud pendiente por inscripción. Es la única versión: con la de cuatro parámetros al lado, la llamada de Mi perfil no encajaba en ninguna (PGRST203).';

-- ═══ 2 y 3. RESOLVER MIRANDO LA INSCRIPCIÓN DE AHORA ═══════════════════════

create or replace function public.cem_resolver_solicitud_inscripcion(
  p_solicitud_id uuid, p_aprobar boolean, p_resolucion text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s cem_solicitudes_inscripcion;
  e cem_enrollments;
  v_nuevo cem_inscripcion_estado;
  v_previo text;
begin
  if not cem_is_staff() then raise exception 'Sólo el personal autorizado resuelve estas solicitudes.'; end if;
  -- Bloqueadas la solicitud y su inscripción: dos personas del equipo a la vez
  -- no la aplican dos veces, y nadie cambia el estado mientras se decide.
  select * into s from cem_solicitudes_inscripcion
   where id = p_solicitud_id and estado = 'pendiente' for update;
  if s.id is null then raise exception 'Esa solicitud no existe o ya fue resuelta.'; end if;
  select * into e from cem_enrollments where id = s.enrollment_id for update;
  v_nuevo := e.estado;

  if p_aprobar then
    -- Se mira el estado de AHORA, no el de cuando se pidió: entre medias el
    -- equipo pudo suspenderla, cancelarla o cambiarla a mano.
    if s.tipo = 'congelamiento' then
      if e.estado not in ('activa', 'pendiente') then
        raise exception 'Esta pausa ya no se puede aprobar: desde que la pidió, la inscripción pasó a «%». Recházala y explícale por qué.', e.estado;
      end if;
      v_nuevo := 'congelada';
      update cem_enrollments set estado = v_nuevo where id = e.id;
      -- las cuotas que todavía no vencieron se congelan; lo ya vencido se sigue debiendo
      update cem_installments set estado = 'congelada'
       where enrollment_id = e.id and estado = 'pendiente';
      -- De dónde viene: la reactivación la devuelve ahí, no a «activa».
      s.datos := coalesce(s.datos, '{}'::jsonb) || jsonb_build_object('estado_previo', e.estado::text);
    elsif s.tipo = 'retiro' then
      if e.estado in ('cancelada', 'finalizada') then
        raise exception 'Este retiro ya no se puede aprobar: la inscripción ya está «%». Recházalo y explícale por qué.', e.estado;
      end if;
      -- Si tenía beca, al pasar a cancelada el disparador cem_becas_al_cancelar
      -- la revoca y devuelve al fondo lo apartado.
      v_nuevo := 'cancelada';
      update cem_enrollments set estado = v_nuevo where id = e.id;
      update cem_installments set estado = 'anulada'
       where enrollment_id = e.id and estado in ('pendiente','congelada');
    elsif s.tipo = 'plan_de_pago' then
      perform cem_replanificar_cuotas(s.enrollment_id, (s.datos ->> 'cuotas')::int);
    else  -- reactivacion
      if e.estado <> 'congelada' then
        raise exception 'Esta reactivación ya no se puede aprobar: la inscripción no está en pausa, está «%». Recházala y explícale por qué.', e.estado;
      end if;
      -- Vuelve a como estaba antes de la pausa, que lo apuntó la aprobación del
      -- último congelamiento. Activa vuelve activa. Pendiente vuelve pendiente,
      -- salvo que mientras tanto haya entrado un pago o ya no cueste nada:
      -- entonces activa, que es lo que habría hecho el pago sin la pausa. Sin
      -- apunte (congelada antes de este cambio, o a mano) decide lo mismo: el
      -- dinero.
      select x.datos ->> 'estado_previo' into v_previo
        from cem_solicitudes_inscripcion x
       where x.enrollment_id = e.id and x.tipo = 'congelamiento' and x.estado = 'aprobada'
       order by x.resuelto_en desc nulls last, x.created_at desc
       limit 1;
      v_nuevo := case
        when v_previo = 'activa' then 'activa'::cem_inscripcion_estado
        when coalesce(e.precio_final, 0) <= 0
          or exists (select 1 from cem_payments p
                      where p.enrollment_id = e.id and p.estado = 'confirmado')
          then 'activa'::cem_inscripcion_estado
        else 'pendiente'::cem_inscripcion_estado end;
      update cem_enrollments set estado = v_nuevo where id = e.id;
      update cem_installments set estado = 'pendiente'
       where enrollment_id = e.id and estado = 'congelada';
    end if;
  end if;

  update cem_solicitudes_inscripcion
     set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
         resolucion = p_resolucion, resuelto_por = auth.uid(), resuelto_en = now(),
         datos = s.datos
   where id = p_solicitud_id;

  perform cem_notificar(s.profile_id, 'solicitud_inscripcion',
    format('Tu solicitud de %s fue %s', replace(s.tipo, '_', ' '),
           case when p_aprobar then 'aprobada' else 'rechazada' end),
    coalesce(nullif(p_resolucion, ''), 'Entra a tu panel para ver el detalle.'),
    case when s.tipo = 'plan_de_pago' then 'estudiante/pagos.html' else 'estudiante/panel.html' end);

  insert into cem_audit_events (actor_id, accion, entidad, entidad_id, riesgo, detalle)
  values (auth.uid(), 'solicitud_' || s.tipo || '_' || case when p_aprobar then 'aprobada' else 'rechazada' end,
          'cem_enrollments', s.enrollment_id, 'alto',
          jsonb_build_object('motivo', s.motivo, 'resolucion', p_resolucion, 'datos', s.datos,
                             'estado_antes', e.estado, 'estado_despues', v_nuevo));
end $$;

comment on function public.cem_resolver_solicitud_inscripcion(uuid, boolean, text) is
  'El equipo aprueba o rechaza una solicitud de inscripción. Aprobar mira el estado de la inscripción en ese momento, no el de cuando se pidió: congela sólo una activa o pendiente, reactiva sólo una congelada y retira lo que no esté ya cancelado o terminado. La pausa apunta el estado que tenía (datos.estado_previo) y la reactivación la devuelve a él: una pendiente sin pagar vuelve pendiente. La retirada cancela, y el disparador cem_becas_al_cancelar revoca la beca si la había.';

-- ═══ 4. LA BECA SE VA CON QUIEN SE RETIRA ══════════════════════════════════

-- Lo que busca el disparador cada vez que se cancela una inscripción.
create index if not exists cem_becas_inscripcion
  on public.cem_becas (enrollment_id) where enrollment_id is not null;

-- Revocar las becas otorgadas de una inscripción que se canceló. La llama el
-- disparador de abajo; no mira quién cancela, sólo qué se canceló.
create or replace function public.cem_becas_al_cancelar(p_enrollment_id uuid, p_estado_previo text default null)
returns integer
language plpgsql volatile security definer set search_path = public as $$
declare
  b cem_becas;
  v_n integer := 0;
  v_vuelve numeric;
  -- Quien cancela, si es una cuenta: el servidor y las tareas programadas no lo
  -- son, y revocada_por, el libro del fondo y la auditoría apuntan a cem_profiles.
  v_actor uuid := (select id from cem_profiles where id = auth.uid());
  v_motivo constant text := 'Se retiró del programa: su inscripción se canceló.';
begin
  -- Sólo las otorgadas: una revocada ya devolvió lo suyo (cem_beca_revocar la
  -- revoca antes de cancelar), y una anterior al sistema no se toca.
  for b in
    select * from cem_becas
     where enrollment_id = p_enrollment_id and estado = 'otorgada' and tipo in ('fondo', 'cem')
     order by numero
       for update
  loop
    v_vuelve := 0;
    if b.tipo = 'fondo' then
      v_vuelve := cem_becas_liberar(b.id, v_actor, 'Beca revocada: ' || v_motivo);
    end if;
    update cem_becas
       set estado = 'revocada', revocada_en = now(), revocada_por = v_actor, motivo = v_motivo
     where id = b.id;

    insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
    values (v_actor, (select email from cem_profiles where id = v_actor),
            'beca.revocada', 'cem_becas', b.id, 'alto',
            jsonb_build_object('beca', cem_becas_numero('BEC', b.numero), 'motivo', v_motivo,
                               'estaba', b.estado, 'vuelve_al_fondo', v_vuelve,
                               'inscripcion', p_enrollment_id, 'inscripcion_estaba', p_estado_previo));
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

comment on function public.cem_becas_al_cancelar(uuid, text) is
  'Interna: revoca las becas otorgadas de una inscripción que se canceló («Se retiró del programa») y devuelve al fondo lo apartado, con su apunte en la auditoría. La llama el disparador cem_becas_al_cancelar de cem_enrollments. Repetirla no hace nada: sólo mira las otorgadas.';

create or replace function public.cem_tg_becas_al_cancelar()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform cem_becas_al_cancelar(new.id, old.estado::text);
  return null;
end $$;

comment on function public.cem_tg_becas_al_cancelar() is
  'Disparador: cuando una inscripción pasa a cancelada, por el camino que sea, revoca sus becas otorgadas (cem_becas_al_cancelar). Corre como su dueño: quien cancela no necesita poder tocar cem_becas.';

drop trigger if exists cem_becas_al_cancelar on public.cem_enrollments;
create trigger cem_becas_al_cancelar
  after update of estado on public.cem_enrollments
  for each row
  when (new.estado = 'cancelada' and old.estado is distinct from 'cancelada')
  execute function public.cem_tg_becas_al_cancelar();

-- Revocar a mano: primero la beca y el dinero, después la inscripción.
create or replace function public.cem_beca_revocar(p_beca_id uuid, p_motivo text)
returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare b cem_becas; v_vuelve numeric := 0;
begin
  if not cem_es_admin() then
    raise exception 'Sólo un administrador puede revocar una beca.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then raise exception 'Escribe por qué se revoca.'; end if;
  select * into b from cem_becas where id = p_beca_id for update;
  if b.id is null then raise exception 'Esa beca no existe.'; end if;
  if b.estado = 'revocada' then raise exception 'Esa beca ya está revocada.'; end if;
  if b.tipo = 'anterior' then raise exception 'Una beca anterior no se revoca: si se registró por error, avisa a quien administra la plataforma.'; end if;

  -- En este orden. Al revés, cancelar dispararía cem_becas_al_cancelar con la
  -- beca todavía otorgada: la revocaría él, con su motivo, y aquí ya no
  -- volvería nada (vuelve_al_fondo saldría 0).
  if b.tipo = 'fondo' then
    v_vuelve := cem_becas_liberar(b.id, auth.uid(), 'Beca revocada: ' || btrim(p_motivo));
  end if;
  update cem_becas
     set estado = 'revocada', revocada_en = now(), revocada_por = auth.uid(), motivo = btrim(p_motivo)
   where id = b.id;

  if b.enrollment_id is not null then
    update cem_enrollments
       set estado = 'cancelada', precio_final = precio_lista, descuento = 0
     where id = b.enrollment_id and fuente = 'beca';
  end if;

  insert into cem_audit_events (actor_id, actor_email, accion, entidad, entidad_id, riesgo, detalle)
  select auth.uid(), x.email, 'beca.revocada', 'cem_becas', b.id, 'alto',
         jsonb_build_object('beca', cem_becas_numero('BEC', b.numero), 'motivo', btrim(p_motivo),
                            'estaba', b.estado, 'vuelve_al_fondo', v_vuelve)
    from cem_profiles x where x.id = auth.uid();
  return jsonb_build_object('ok', true, 'vuelve_al_fondo', v_vuelve);
end $$;

comment on function public.cem_beca_revocar(uuid, text) is
  'Admin: revoca una beca. Primero la revoca y devuelve al fondo lo reservado; después cancela la inscripción y le devuelve su precio, para que deje de contar como beca. En ese orden, el disparador cem_becas_al_cancelar la encuentra ya revocada y no hace nada. Cerrar el aula ya lo hace la cancelación: cem_acceso_abierto no abre nada cancelado.';

-- ═══ LOS PERMISOS ══════════════════════════════════════════════════════════

revoke all on function public.cem_solicitar_cambio_inscripcion(uuid, text, text, date, integer) from public, anon;
grant execute on function public.cem_solicitar_cambio_inscripcion(uuid, text, text, date, integer) to authenticated, service_role;
revoke all on function public.cem_resolver_solicitud_inscripcion(uuid, boolean, text) from public, anon;
grant execute on function public.cem_resolver_solicitud_inscripcion(uuid, boolean, text) to authenticated, service_role;
revoke all on function public.cem_beca_revocar(uuid, text) from public, anon;
grant execute on function public.cem_beca_revocar(uuid, text) to authenticated, service_role;
revoke all on function public.cem_becas_al_cancelar(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.cem_tg_becas_al_cancelar() from public, anon, authenticated, service_role;

-- ═══ HACIA ATRÁS ═══════════════════════════════════════════════════════════

-- Becas otorgadas de una inscripción que ya estaba cancelada antes de esto. El
-- 6 de noviembre no había ninguna; si las hubiera, aquí se revocan y su dinero
-- vuelve al fondo, igual que lo haría el disparador.
select public.cem_becas_al_cancelar(e.id, null)
  from public.cem_enrollments e
 where e.estado = 'cancelada'
   and exists (select 1 from public.cem_becas b
                where b.enrollment_id = e.id and b.estado = 'otorgada' and b.tipo in ('fondo', 'cem'));
