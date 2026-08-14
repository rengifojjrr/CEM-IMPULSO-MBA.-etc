/* Qué puede y qué NO puede cada rol.
   Estas comprobaciones no miran botones escondidos: le piden a la base que
   haga la operación prohibida y verifican que no ocurra. Una pantalla puede
   olvidarse de esconder un botón; la base no. */

import { acta, nuevaPestana, entrar, conLaBase } from '../entorno.mjs';

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

  const roles = await Ad.locator('#roles').textContent();
  a.comprobar(/cobranza/.test(roles), 'La matriz de permisos incluye el rol de cobranza');

  for (const [nombre, pagina] of [['cobranza', C], ['auditor', A], ['coordinador', Co], ['administrador', Ad]]) {
    a.comprobar(pagina.errores.length === 0,
      `Las pantallas de ${nombre} no lanzan errores ${JSON.stringify(pagina.errores.slice(0, 2))}`);
  }

  return a;
}
