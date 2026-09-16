-- Cemi web no tenía memoria, y los guiones fijos pesaban demasiado.
--
-- 1. LA MEMORIA DEL VISITANTE
--    `cem_bot_conversacion_visitante` abre la conversación con canal
--    'visitante', pero la tabla sólo admitía 'web' y 'whatsapp'. El insert se
--    rechazaba, la función de borde se tragaba el error y devolvía
--    conversación nula, y cada mensaje del visitante se contestaba como si
--    fuera el primero. En la base: cero conversaciones de canal 'visitante'
--    desde que Cemi salió a las páginas públicas. Es la razón de fondo de la
--    captura del 15 de septiembre («soy del equipo» dos veces seguidas): no
--    era que insistiera, es que no recordaba haberlo dicho.
alter table public.cem_bot_conversaciones
  drop constraint if exists cem_bot_conversaciones_canal_check;
alter table public.cem_bot_conversaciones
  add constraint cem_bot_conversaciones_canal_check
  check (canal in ('web', 'whatsapp', 'visitante'));

-- 2. GUIONES FIJOS: SÓLO UNO
--    Tres guiones iban marcados «siempre» y entraban en todos los turnos:
--    unos 2.600 caracteres, unos 700 tokens, en cada pregunta. Con el plan
--    gratuito de Groq (8.000 tokens por minuto y modelo) eso se paga en
--    turnos. «Quién eres» y «Saludos» entran ahora por disparador, que es como
--    llegan de todas formas cuando hacen falta — y el nombre va, además, fijo
--    en el oficio del asistente. El único que no se puede disparar por
--    palabras es «Fuera de tema», porque no se sabe con qué palabras llega.
--
--    Sólo se tocan los de semilla: uno que el equipo haya editado es suyo.
update public.cem_bot_guiones
   set siempre = false,
       disparadores = (
         select array_agg(distinct d) from unnest(disparadores || array[
           'tu nombre', 'sin nombre', 'te llamas', 'llamarte', 'un bot', 'robot',
           'humano', 'persona real', 'que eres', 'quien te', 'inteligencia artificial',
           'chatgpt', 'maquina', 'que haces'
         ]) d
       ),
       notas = 'Entra cuando preguntan quién es o dudan de que sea una persona. El nombre va además fijo en el oficio, así que aquí lo que se enseña es el tono.'
 where tema = 'Quién eres y cómo te llamas' and origen = 'semilla';

update public.cem_bot_guiones
   set siempre = false,
       notas = 'Entra con los saludos, las gracias y las despedidas. Corto, cálido, sin fórmulas de atención al cliente.'
 where tema = 'Saludos, gracias y despedidas' and origen = 'semilla';
