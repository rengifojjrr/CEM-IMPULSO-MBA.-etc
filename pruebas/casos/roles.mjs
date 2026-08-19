/* Qué puede y qué NO puede cada rol.
   Estas comprobaciones no miran botones escondidos: le piden a la base que
   haga la operación prohibida y verifican que no ocurra. Una pantalla puede
   olvidarse de esconder un botón; la base no. */

import { acta, nuevaPestana, entrar, conLaBase, BASE } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('roles');

  /* ============ cobranza: dinero sí, académico no ============ */
  const C = await nuevaPestana(navegador);
  await entrar(C, 'cobranza');
  a.comprobar(/pagos-verificar/.test(C.url()),
    'Cobranza entra directo a su bandeja de pagos');

  const menu = await C.locator('.sidebar').textContent();
  a.comprobar(/Verificar pagos/.test(menu) && /Cobranza/.test(menu),
    'Su menú se titula "Cobranza" y trae lo suyo');
  a.comprobar(!/Evaluaciones|Banco de preguntas|Usuarios y roles|Contenidos/.test(menu),
    'Y NO le aparecen cursos, notas ni usuarios');

  await C.silenciarMientras(async () => {
    // Una política de acceso no lanza error en un UPDATE: simplemente no
    // encuentra ninguna fila que a esa persona se le permita tocar.
    const filas = await conLaBase(C, async (sb) => {
      const { data: curso } = await sb.from('cem_courses').select('id,nombre').limit(1).single();
      const { data } = await sb.from('cem_courses')
        .update({ nombre: curso.nombre + ' (tocado)' }).eq('id', curso.id).select();
      return data?.length ?? 0;
    });
    a.comprobar(filas === 0, 'Cobranza no puede renombrar un curso');
  });

  const cursoIntacto = await conLaBase(C, async (sb) =>
    (await sb.from('cem_courses').select('nombre').limit(1).single()).data?.nombre || '');
  a.comprobar(!/\(tocado\)/.test(cursoIntacto), 'Y el curso quedó tal cual estaba');

  /* ============ auditor: sólo lectura, garantizado por la base ============ */
  const A = await nuevaPestana(navegador);
  await entrar(A, 'auditor');
  a.comprobar(/auditoria/.test(A.url()), 'El auditor entra a su registro de auditoría');

  await A.silenciarMientras(async () => {
    const r = await conLaBase(A, async (sb) => {
      const crear = (await sb.from('cem_courses')
        .insert({ nombre: 'Curso del auditor', codigo: 'AUD-PRUEBA' })).error?.message || 'SE CREÓ';
      const borrar = (await sb.from('cem_payments').delete()
        .neq('id', '00000000-0000-0000-0000-000000000000').select()).data?.length ?? 'error';
      const leer = (await sb.from('cem_courses').select('id').limit(3)).data?.length ?? 0;
      return { crear, borrar, leer };
    });
    a.comprobar(r.crear !== 'SE CREÓ', 'El auditor no puede crear un curso');
    a.comprobar(r.borrar === 0 || typeof r.borrar === 'string', 'Ni borrar pagos');
    a.comprobar(r.leer > 0, 'Pero sí puede leer todo lo que necesita revisar');
  });

  /* ============ coordinador: no toca roles ni cuentas ============ */
  const Co = await nuevaPestana(navegador);
  await entrar(Co, 'coordinador', 'admin/usuarios.html');
  await Co.waitForTimeout(2500);

  await Co.silenciarMientras(async () => {
    const rol = await conLaBase(Co, async (sb) => {
      const { data: alguien } = await sb.from('cem_profiles')
        .select('id').eq('rol', 'estudiante').limit(1).single();
      return (await sb.from('cem_profiles').update({ rol: 'admin' }).eq('id', alguien.id))
        .error?.message || 'SE CAMBIÓ EL ROL';
    });
    a.comprobar(/administrador/i.test(rol),
      'Un coordinador no puede convertir a alguien en administrador');

    const activo = await conLaBase(Co, async (sb) => {
      const { data: alguien } = await sb.from('cem_profiles')
        .select('id').eq('rol', 'estudiante').limit(1).single();
      return (await sb.from('cem_profiles').update({ activo: false }).eq('id', alguien.id))
        .error?.message || 'SE DESACTIVÓ';
    });
    a.comprobar(/administrador/i.test(activo), 'Ni desactivar una cuenta');
  });

  /* ============ un administrador no se deja el sistema sin administradores ============ */
  const Ad = await nuevaPestana(navegador);
  await entrar(Ad, 'admin', 'admin/permisos.html');
  await Ad.waitForTimeout(2500);

  await Ad.silenciarMientras(async () => {
    const auto = await conLaBase(Ad, async (sb) => {
      const { data: { user } } = await sb.auth.getUser();
      return (await sb.from('cem_profiles').update({ rol: 'estudiante' }).eq('id', user.id))
        .error?.message || 'SE DEGRADÓ SOLO';
    });
    a.comprobar(/a ti mismo/i.test(auto),
      'Un administrador no puede quitarse a sí mismo el rol');
  });

  /* Los roles se muestran con su nombre en castellano, no con el valor que
     guarda la base, así que la comprobación mira lo que lee una persona. */
  const roles = await Ad.locator('#roles').textContent();
  a.comprobar(/cobranza/i.test(roles), 'La matriz de permisos incluye el rol de cobranza');
  a.comprobar(!/_/.test(roles),
    'Y ningún rol se muestra con guion bajo, como lo guarda la base');

  /* ============ la radiografía de la base, sólo para quien debe ============ */
  await Ad.goto(`${BASE}/plataforma/admin/seguridad.html`, { waitUntil: 'domcontentloaded' });
  await Ad.waitForSelector('#estado', { timeout: 25000 });
  await Ad.waitForTimeout(4000);
  a.comprobar(!(await Ad.locator('#cardPoliticas').isHidden()),
    'El administrador ve el estado de las políticas de acceso de la base');
  a.comprobar(/Ninguna tabla queda abierta/.test(await Ad.locator('#resumenPoliticas').textContent()),
    'Y hoy ninguna tabla queda abierta a cualquiera');

  /* ── Cuentas que pueden entrar y no aparecen en ninguna pantalla ─────────
     Esto vigila un fallo que ya pasó: tres cuentas de una siembra vieja
     seguían en `auth.users` sin ficha en `cem_profiles`. Usuarios y roles y la
     matriz leen las fichas, así que no salían por ningún lado — y podían
     iniciar sesión. Una lo hizo seis días antes de que se descubriera, de
     casualidad, mirando otra cosa.

     Lo que se comprueba no es que la lista esté vacía —las que hay quedaron
     bloqueadas a propósito, y borrarlas es decisión de la casa— sino que
     NINGUNA pueda entrar todavía. Exigir la lista vacía convertiría un resto
     inofensivo en una prueba en rojo, y una prueba que llora sin motivo se
     acaba ignorando. */
  a.comprobar(!(await Ad.locator('#cardHuerfanas').isHidden()),
    'El administrador ve si hay cuentas que pueden entrar sin ficha');
  const huerfanas = await conLaBase(Ad, async (sb) => {
    const { data, error } = await sb.rpc('cem_cuentas_sin_ficha');
    if (error) return { error: error.message };
    return {
      total: (data || []).length,
      pueden: (data || []).filter((c) => !c.bloqueada || c.sesiones_vivas > 0)
        .map((c) => c.correo),
    };
  });
  a.comprobar(!huerfanas.error && huerfanas.pueden?.length === 0,
    `Y ninguna de las que hay puede entrar${
      huerfanas.pueden?.length ? `: ${huerfanas.pueden.join(', ')}` : ''} (${
      huerfanas.total ?? '?'} sin ficha, todas bloqueadas)`);

  await C.goto(`${BASE}/plataforma/admin/seguridad.html`, { waitUntil: 'domcontentloaded' });
  await C.waitForSelector('#estado', { timeout: 25000 });
  await C.waitForTimeout(3000);
  a.comprobar(await C.locator('#cardPoliticas').isHidden(),
    'A cobranza no se le muestra');

  await C.silenciarMientras(async () => {
    // Y no basta con no mostrárselo: pedírsela a la base directamente también
    // se rechaza, que es lo que impide averiguar el esquema desde la consola.
    const r = await conLaBase(C, async (sb) => {
      const { error } = await sb.rpc('cem_revisar_politicas');
      return error?.message || 'LA DEVOLVIÓ';
    });
    a.comprobar(/administrador|auditor/i.test(r),
      'Ni pidiéndosela a la base directamente la consigue');

    // Lo mismo con la lista de cuentas sin ficha: son correos de gente.
    const h = await conLaBase(C, async (sb) => {
      const { error } = await sb.rpc('cem_cuentas_sin_ficha');
      return error?.message || 'LA DEVOLVIÓ';
    });
    a.comprobar(/administrador|auditor/i.test(h),
      'Ni la lista de cuentas sin ficha, que son correos de personas');
  });

  for (const [nombre, pagina] of [['cobranza', C], ['auditor', A], ['coordinador', Co], ['administrador', Ad]]) {
    a.comprobar(pagina.errores.length === 0,
      `Las pantallas de ${nombre} no lanzan errores ${JSON.stringify(pagina.errores.slice(0, 2))}`);
  }

  return a;
}
