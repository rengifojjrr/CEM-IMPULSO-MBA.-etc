-- Los pedidos de diploma en físico: mover muchos a la vez, y avisar a quien
-- espera.
-- ============================================================================
-- Dos cosas que faltaban, y la segunda es la que de verdad duele.
--
-- La primera es de trabajo: la tanda se manda a la imprenta entera, vuelve
-- entera y se envía entera. Cambiar el estado de catorce pedidos abriendo
-- catorce ventanas es catorce veces el mismo gesto, y a la décima alguien se
-- salta uno.
--
-- La segunda es de trato. `cem_pedido_fisico_estado` cambiaba el estado y NO
-- avisaba a nadie. Alguien pide su diploma, la escuela lo imprime, lo manda, lo
-- entrega — y quien lo pidió no se entera de nada en ningún momento. Se queda
-- mirando «Por imprimir» durante semanas sin saber si aquello se movió. El
-- motor de avisos existía desde hace tiempo; simplemente nadie lo había
-- enchufado aquí.
--
-- Qué se avisa y qué no
-- ---------------------
-- Sólo cuando el estado CAMBIA de verdad: volver a guardar «en imprenta» sobre
-- «en imprenta» no es una novedad y no tiene por qué sonar el aviso.
--
-- Volver a «pedido» tampoco avisa. No es un paso adelante, es una corrección
-- —alguien se equivocó de fila y lo devuelve— y decirle a una persona «tu
-- diploma vuelve a estar por imprimir» sólo la asusta.
--
-- El correo se manda en los tres estados en los que hay algo que hacer o que
-- saber de verdad: enviado, entregado y anulado. «En imprenta» se queda en el
-- aviso de dentro de la aplicación: es una novedad, sí, pero no una en la que
-- nadie tenga que hacer nada, y una tanda de ciento cuarenta correos para
-- decirlo satura la cola y enseña a la gente a ignorar nuestros correos.

-- Qué se le dice a quien espera, en cada estado. En un solo sitio para que el
-- cambio de uno y el de la tanda digan exactamente lo mismo.
create or replace function public.cem_aviso_pedido_fisico(p_estado text, p_titulo text)
returns jsonb
language sql
immutable
set search_path to 'public'
as $function$
  select case p_estado
    when 'en imprenta' then jsonb_build_object(
      'titulo', 'Tu diploma ya está en la imprenta',
      'cuerpo', format('Tu %s se está imprimiendo. Te avisamos en cuanto salga hacia tu dirección.',
                       lower(coalesce(p_titulo, 'diploma'))),
      'correo', false)
    when 'enviado' then jsonb_build_object(
      'titulo', 'Tu diploma va en camino',
      'cuerpo', format('Tu %s salió hacia la dirección que nos diste. Si no llega en unos días, escríbenos.',
                       lower(coalesce(p_titulo, 'diploma'))),
      'correo', true)
    when 'entregado' then jsonb_build_object(
      'titulo', 'Tu diploma fue entregado',
      'cuerpo', format('Consta que tu %s llegó a su destino. Si no lo recibiste, dínoslo y lo revisamos.',
                       lower(coalesce(p_titulo, 'diploma'))),
      'correo', true)
    when 'anulado' then jsonb_build_object(
      'titulo', 'Se anuló tu pedido del diploma en físico',
      'cuerpo', 'Tu diploma digital sigue intacto y lo puedes descargar cuando quieras. Si esto es un error, escríbenos.',
      'correo', true)
    else null
  end;
$function$;

revoke all on function public.cem_aviso_pedido_fisico(text, text) from public, anon;
grant execute on function public.cem_aviso_pedido_fisico(text, text) to authenticated;


-- Cambiar UN pedido. Lo que había, más el aviso que faltaba.
create or replace function public.cem_pedido_fisico_estado(p_id uuid, p_estado text, p_nota text default null)
returns cem_diploma_fisico
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_fila cem_diploma_fisico; v_antes text; v_aviso jsonb;
begin
  perform cert_exigir_gestor();

  select estado into v_antes from cem_diploma_fisico where id = p_id;

  update cem_diploma_fisico set estado = p_estado, nota = coalesce(p_nota, nota),
         actualizado_en = now()
   where id = p_id returning * into v_fila;
  if v_fila.id is null then raise exception 'Ese pedido no existe.'; end if;

  if v_antes is distinct from p_estado then
    v_aviso := public.cem_aviso_pedido_fisico(p_estado, v_fila.titulo);
    if v_aviso is not null then
      perform cem_notificar(v_fila.profile_id, 'diploma_fisico',
        v_aviso->>'titulo', v_aviso->>'cuerpo', 'estudiante/certificados.html',
        (v_aviso->>'correo')::boolean);
    end if;
  end if;

  return v_fila;
end; $function$;


-- Cambiar MUCHOS de una vez. Devuelve cuántos se movieron y a cuántos se avisó,
-- porque «listo» a secas después de tocar catorce pedidos no dice nada.
create or replace function public.cem_pedidos_fisicos_estado_lote(
  p_ids uuid[], p_estado text, p_nota text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_fila cem_diploma_fisico; v_aviso jsonb;
        v_cambiados int := 0; v_avisados int := 0; v_tocados int := 0;
begin
  perform cert_exigir_gestor();

  if p_ids is null or array_length(p_ids, 1) is null then
    raise exception 'No has seleccionado ningún pedido.';
  end if;
  if p_estado is null or p_estado not in ('pedido','en imprenta','enviado','entregado','anulado') then
    raise exception 'Ese no es un estado de un pedido.';
  end if;
  -- Un tope, no por capricho: cada aviso puede encolar un correo, y una llamada
  -- que dispare mil de golpe es un problema del que uno se entera tarde.
  if array_length(p_ids, 1) > 500 then
    raise exception 'Demasiados pedidos de una vez: como mucho 500.';
  end if;

  for v_fila in
    select * from cem_diploma_fisico where id = any(p_ids) for update
  loop
    v_tocados := v_tocados + 1;
    if v_fila.estado is distinct from p_estado then
      update cem_diploma_fisico
         set estado = p_estado, nota = coalesce(p_nota, nota), actualizado_en = now()
       where id = v_fila.id;
      v_cambiados := v_cambiados + 1;

      v_aviso := public.cem_aviso_pedido_fisico(p_estado, v_fila.titulo);
      if v_aviso is not null and v_fila.profile_id is not null then
        perform cem_notificar(v_fila.profile_id, 'diploma_fisico',
          v_aviso->>'titulo', v_aviso->>'cuerpo', 'estudiante/certificados.html',
          (v_aviso->>'correo')::boolean);
        v_avisados := v_avisados + 1;
      end if;
    end if;
  end loop;

  if v_tocados = 0 then raise exception 'Ninguno de esos pedidos existe.'; end if;

  return jsonb_build_object(
    'pedidos', v_tocados,
    'cambiados', v_cambiados,
    -- Los que ya estaban en ese estado: se dice, para que nadie crea que se
    -- perdieron por el camino.
    'ya_estaban', v_tocados - v_cambiados,
    'avisados', v_avisados);
end; $function$;

revoke all on function public.cem_pedidos_fisicos_estado_lote(uuid[], text, text) from public, anon;
grant execute on function public.cem_pedidos_fisicos_estado_lote(uuid[], text, text) to authenticated;
