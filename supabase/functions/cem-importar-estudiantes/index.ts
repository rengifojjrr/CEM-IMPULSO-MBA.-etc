// CEM · Carga masiva de estudiantes desde una planilla.
//
// Para inscribir una cohorte había que cargar a la gente de a uno. Esta
// función recibe las filas ya leídas del Excel en el navegador y, por cada
// una, crea la cuenta si no existe, completa el perfil, inscribe en el curso
// y arma el plan de cuotas.
//
// Es idempotente por correo: volver a subir la misma planilla no duplica
// cuentas ni inscripciones, sólo completa lo que falte. Eso importa porque
// una importación se repite casi siempre (se corrige una fila y se resube).
//
// Sólo la puede llamar personal autorizado: se comprueba el rol real contra
// la base con el token de quien llama, no con lo que diga el cuerpo.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const MAX_FILAS = 500;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

type Fila = {
  nombre?: string; apellido?: string; email?: string;
  documento?: string; documento_tipo?: string;
  telefono?: string; pais?: string; ciudad?: string;
};

const limpio = (v: unknown) => String(v ?? '').trim();
const CORREO_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Usa POST.' }, 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json({ error: 'Falta la sesión.' }, 401);

  // Quién llama, según la base — no según lo que venga en el cuerpo.
  const comoUsuario = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
  });
  const { data: perfil } = await comoUsuario.rpc('cem_my_profile');
  const yo = Array.isArray(perfil) ? perfil[0] : perfil;
  if (!yo?.id || !yo.activo || !['coordinador', 'admin', 'superadmin'].includes(yo.rol)) {
    return json({ error: 'Sólo el personal autorizado puede importar estudiantes.' }, 403);
  }

  let cuerpo: { filas?: Fila[]; course_id?: string; cohort_id?: string; cuotas?: number; simular?: boolean };
  try { cuerpo = await req.json(); } catch { return json({ error: 'El cuerpo no es JSON válido.' }, 400); }

  const filas = cuerpo.filas ?? [];
  const cursoId = cuerpo.course_id;
  const cohorteId = cuerpo.cohort_id || null;
  const cuotas = [1, 3, 6].includes(Number(cuerpo.cuotas)) ? Number(cuerpo.cuotas) : 1;
  const simular = cuerpo.simular === true;

  if (!filas.length) return json({ error: 'La planilla no trae ninguna fila.' }, 400);
  if (filas.length > MAX_FILAS) {
    return json({ error: `Son ${filas.length} filas y el tope por tanda es ${MAX_FILAS}. Pártela en varias.` }, 400);
  }
  if (!cursoId) return json({ error: 'Falta elegir el programa al que se inscriben.' }, 400);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: curso } = await sb.from('cem_courses')
    .select('id, nombre, precio, moneda, cuotas_habilitadas').eq('id', cursoId).maybeSingle();
  if (!curso) return json({ error: 'Ese programa no existe.' }, 400);

  const resultados: Array<{ fila: number; email: string; estado: string; detalle: string }> = [];
  const vistos = new Set<string>();

  for (let i = 0; i < filas.length; i++) {
    const f = filas[i];
    const email = limpio(f.email).toLowerCase();
    const nombre = limpio(f.nombre);
    const apellido = limpio(f.apellido);
    const anotar = (estado: string, detalle: string) =>
      resultados.push({ fila: i + 2, email: email || '(sin correo)', estado, detalle });

    if (!email) { anotar('error', 'Falta el correo: es lo que identifica a cada persona.'); continue; }
    if (!CORREO_OK.test(email)) { anotar('error', 'El correo está mal escrito.'); continue; }
    if (!nombre) { anotar('error', 'Falta el nombre.'); continue; }
    if (vistos.has(email)) { anotar('omitida', 'Ese correo aparece dos veces en la misma planilla.'); continue; }
    vistos.add(email);

    if (simular) { anotar('lista', 'Se va a crear o completar.'); continue; }

    try {
      // 1) ¿ya tiene perfil?
      const { data: existente } = await sb.from('cem_profiles')
        .select('id, nombre, apellido').eq('email', email).maybeSingle();

      let profileId = existente?.id as string | undefined;
      let creada = false;

      if (!profileId) {
        // Contraseña provisional aleatoria: nadie la conoce ni la necesita.
        // La persona entra usando "Olvidé mi contraseña" con este correo.
        const provisional = crypto.randomUUID() + crypto.randomUUID().slice(0, 8);
        const { data: nuevo, error: eAuth } = await sb.auth.admin.createUser({
          email,
          password: provisional,
          email_confirm: true,
          user_metadata: {
            cem_signup: 'true', nombre, apellido,
            documento: limpio(f.documento), documento_tipo: limpio(f.documento_tipo) || 'Cédula',
            telefono: limpio(f.telefono), pais: limpio(f.pais),
          },
        });
        if (eAuth) {
          // Puede existir la cuenta sin perfil (registro a medias): se busca.
          const { data: lista } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
          const encontrado = lista?.users?.find((u) => u.email?.toLowerCase() === email);
          if (!encontrado) { anotar('error', `No se pudo crear la cuenta: ${eAuth.message}`); continue; }
          profileId = encontrado.id;
        } else {
          profileId = nuevo.user!.id;
          creada = true;
        }
      }

      // 2) perfil al día. Sólo se mandan los campos que la planilla trae con
      //    algo escrito: una celda vacía no debe borrar un dato ya cargado.
      const conValor: Record<string, unknown> = { id: profileId, email };
      if (nombre) conValor.nombre = nombre;
      if (apellido) conValor.apellido = apellido;
      if (limpio(f.documento)) conValor.documento = limpio(f.documento);
      if (limpio(f.documento_tipo)) conValor.documento_tipo = limpio(f.documento_tipo);
      if (limpio(f.telefono)) conValor.telefono = limpio(f.telefono);
      if (limpio(f.pais)) conValor.pais = limpio(f.pais);
      if (limpio(f.ciudad)) conValor.ciudad = limpio(f.ciudad);

      // El rol y el estado sólo se fijan al crear: si alguien ya es docente o
      // está desactivado a propósito, una importación no debe revertirlo.
      if (!existente) { conValor.rol = 'estudiante'; conValor.activo = true; }

      const { error: ePerfil } = await sb.from('cem_profiles')
        .upsert(conValor, { onConflict: 'id' });
      if (ePerfil) { anotar('error', `No se pudo guardar el perfil: ${ePerfil.message}`); continue; }

      // 3) inscripción (una sola por persona y programa)
      const { data: yaInscrito } = await sb.from('cem_enrollments')
        .select('id').eq('profile_id', profileId).eq('course_id', cursoId).maybeSingle();

      if (yaInscrito) {
        anotar('omitida', creada ? 'Cuenta creada; ya estaba inscrito en este programa.' : 'Ya estaba inscrito en este programa.');
        continue;
      }

      const precio = Number(curso.precio ?? 0);
      const { data: insc, error: eInsc } = await sb.from('cem_enrollments').insert({
        profile_id: profileId, course_id: cursoId, cohort_id: cohorteId,
        precio_lista: precio, descuento: 0, precio_final: precio,
        moneda: curso.moneda ?? 'USD', estado: 'activa', fuente: 'importacion',
      }).select('id').single();
      if (eInsc) { anotar('error', `No se pudo inscribir: ${eInsc.message}`); continue; }

      // 4) cuotas — el último ajuste lleva la diferencia para que sumen exacto
      const n = curso.cuotas_habilitadas === false ? 1 : cuotas;
      const base = Math.round((precio / n) * 100) / 100;
      const hoy = new Date();
      const cuotasFilas = Array.from({ length: n }, (_, k) => {
        const venc = new Date(hoy);
        venc.setMonth(venc.getMonth() + k);
        const monto = k === n - 1 ? Math.round((precio - base * (n - 1)) * 100) / 100 : base;
        return {
          enrollment_id: insc.id, numero: k + 1, monto, saldo: monto,
          moneda: curso.moneda ?? 'USD',
          fecha_vencimiento: venc.toISOString().slice(0, 10),
          estado: 'pendiente',
        };
      });
      const { error: eCuotas } = await sb.from('cem_installments').insert(cuotasFilas);
      if (eCuotas) { anotar('error', `Se inscribió pero fallaron las cuotas: ${eCuotas.message}`); continue; }

      anotar('creada', creada
        ? `Cuenta nueva, inscrito en ${curso.nombre}, ${n} cuota(s).`
        : `Ya tenía cuenta; inscrito en ${curso.nombre}, ${n} cuota(s).`);
    } catch (e) {
      anotar('error', String((e as Error).message).slice(0, 200));
    }
  }

  const resumen = {
    total: filas.length,
    creadas: resultados.filter((r) => r.estado === 'creada').length,
    omitidas: resultados.filter((r) => r.estado === 'omitida').length,
    errores: resultados.filter((r) => r.estado === 'error').length,
    listas: resultados.filter((r) => r.estado === 'lista').length,
  };

  if (!simular) {
    await sb.from('cem_audit_events').insert({
      actor_id: yo.id, actor_email: yo.email, accion: 'importacion_estudiantes',
      entidad: 'cem_enrollments', riesgo: 'alto',
      detalle: { curso: curso.nombre, cohorte: cohorteId, cuotas, ...resumen },
    });
  }

  return json({ ok: true, simulacion: simular, resumen, resultados });
});
