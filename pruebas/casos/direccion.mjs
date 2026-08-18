/* Dirección: el embudo, los canales y la auditoría legible.
   ==========================================================================
   Mejoras 36, 38 y 39 de docs/40-mejoras-por-rol.md.

   Lo que hay que vigilar en un informe no es que salga un número: es que el
   número diga la verdad. Aquí se comprueban las tres formas conocidas de que
   un informe mienta sin que nadie lo note:

   · Un embudo cuyos escalones no se contienen. Si «dejaron sus datos» es más
     pequeño que «crearon cuenta», dibujarlos juntos da barras que crecen hacia
     abajo — una figura que dice lo contrario de lo que pasa.
   · Dos cifras de lo mismo que no cuadran en la misma pantalla. Obligan a
     averiguar cuál miente, y normalmente no miente ninguna: cuentan cosas
     distintas sin decirlo.
   · Atribuir el mismo dinero a tres canales porque la persona rellenó el
     formulario tres veces. */

import { acta, nuevaPestana, entrar, BASE, conLaBase } from '../entorno.mjs';

export default async function correr(navegador) {
  const a = acta('dirección');

  const A = await nuevaPestana(navegador, { ancho: 1400, alto: 1100 });
  await entrar(A, 'admin', 'admin/reportes.html');
  await A.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await A.waitForTimeout(4200);

  a.comprobar(A.errores.length === 0, `Reportes abre sin errores ${JSON.stringify(A.errores.slice(0, 2))}`);

  /* ============ 1 · el embudo (mejora 39) ============ */
  const datos = await conLaBase(A, async (sb) => ({
    embudo: (await sb.rpc('cem_embudo', { p_dias: 3650 })).data,
    canales: (await sb.rpc('cem_por_canal', { p_dias: 3650 })).data,
  }));

  const pasos = datos.embudo?.pasos || [];
  a.comprobar(pasos.length >= 4, `El embudo tiene sus escalones (${pasos.length})`);

  // LA comprobación: cada escalón contiene al siguiente. Si esto se cae, el
  // dibujo está mintiendo aunque los números sean correctos por separado.
  const encajan = pasos.every((p, i) => i === 0 || Number(pasos[i - 1].n) >= Number(p.n));
  a.comprobar(encajan,
    `Y cada uno contiene al siguiente, que es lo único que hace válido un embudo (${pasos.map((p) => p.n).join(' ≥ ')})`);

  a.comprobar(datos.embudo?.contexto && 'contactos' in datos.embudo.contexto,
    'Los contactos de la web van como contexto, no como escalón: son otra población');

  const dibujado = await A.evaluate(() => ({
    escalones: [...document.querySelectorAll('#gEmbudo .gr-escalon')].map((e) => Number(e.textContent.trim())),
    etiquetas: [...document.querySelectorAll('#gEmbudo .gr-paso-etq')].map((e) => e.textContent.trim()),
  }));
  a.comprobar(dibujado.etiquetas.length === pasos.length,
    `Se dibuja entero (${dibujado.etiquetas.length} escalones en pantalla)`);
  a.comprobar(dibujado.escalones.every((n, i) => i === 0 || dibujado.escalones[i - 1] >= n),
    'Y en pantalla tampoco crece hacia abajo');

  /* ============ 2 · los canales (mejora 38) ============ */
  const canales = datos.canales || [];
  a.comprobar(Array.isArray(canales), 'Se puede preguntar qué trae cada canal');

  // Cada canal cuenta lo que cobró; la suma no puede pasarse de lo cobrado
  // de verdad en el mismo periodo. Si se pasa, alguien está contando dos veces.
  const cobradoPorCanal = canales.reduce((t, c) => t + Number(c.cobrado || 0), 0);
  const cobradoDeVerdad = await conLaBase(A, async (sb) => {
    const { data } = await sb.from('cem_payments')
      .select('monto,monto_base,estado').eq('estado', 'confirmado').limit(1000);
    return (data || []).reduce((t, x) => t + Number(x.monto_base ?? x.monto ?? 0), 0);
  });
  a.comprobar(cobradoPorCanal <= cobradoDeVerdad + 0.01,
    `Lo repartido entre canales no se pasa de lo cobrado de verdad (${cobradoPorCanal.toFixed(2)} de ${cobradoDeVerdad.toFixed(2)})`);

  // Y el mismo criterio en las dos cifras de la misma pantalla.
  const inscritosCanales = canales.reduce((t, c) => t + Number(c.inscritos || 0), 0);
  const inscritosEmbudo = Number(pasos.find((p) => /inscribieron/i.test(p.etq))?.n || 0);
  a.comprobar(inscritosCanales <= inscritosEmbudo,
    `Las inscripciones cuadran entre el embudo y los canales (${inscritosCanales} contra ${inscritosEmbudo})`);

  a.comprobar(canales.every((c) => c.contactos > 0 ? c.conversion != null : c.conversion == null),
    'La conversión sólo se calcula donde hay contactos que convertir');

  /* ============ 3 · la auditoría legible (mejora 36) ============ */
  await A.goto(`${BASE}/plataforma/admin/auditoria.html`, { waitUntil: 'domcontentloaded' });
  await A.waitForSelector('#page:not(.hidden)', { timeout: 40000 });
  await A.waitForTimeout(3200);

  const filtros = await A.evaluate(() => ({
    persona: !!document.querySelector('#fUser'),
    riesgo: !!document.querySelector('#fRiesgo'),
    tipo: !!document.querySelector('#fAccion'),
    tiposCargados: document.querySelectorAll('#fAccion option').length,
  }));
  a.comprobar(filtros.persona && filtros.riesgo && filtros.tipo,
    'La auditoría se filtra por persona, por riesgo y por tipo, que es como se investiga algo');
  a.comprobar(filtros.tiposCargados > 2,
    `Y los tipos salen de lo que hay, no de una lista escrita a mano (${filtros.tiposCargados})`);

  // Filtrar por un tipo deja sólo ese tipo. Un filtro que no filtra es peor
  // que ningún filtro: hace creer que se ha mirado.
  const filtrado = await A.evaluate(async () => {
    const sel = document.querySelector('#fAccion');
    const opciones = [...sel.options].filter((o) => o.value);
    if (!opciones.length) return null;
    sel.value = opciones[0].value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 400));
    const filas = [...document.querySelectorAll('#tb tr')];
    const acciones = filas.map((tr) => tr.children[2]?.textContent.trim()).filter(Boolean);
    return { pedido: opciones[0].value.replace(/_/g, ' '), acciones };
  });
  a.comprobar(filtrado && filtrado.acciones.length > 0
    && filtrado.acciones.every((x) => x === filtrado.pedido),
    `Filtrar por un tipo deja sólo ese tipo (${filtrado?.pedido}: ${filtrado?.acciones.length} fila(s))`);

  const alertas = await A.evaluate(() =>
    !!document.querySelector('#alertas .card'));
  a.comprobar(alertas, 'Y lo que no debería pasar sale arriba, sin ir a buscarlo');

  /* ============ 4 · quien no dirige, no ve ============ */
  const E = await nuevaPestana(navegador, { ancho: 1200, alto: 900 });
  await entrar(E, 'estudiante');
  const negado = await E.silenciarMientras(() => conLaBase(E, async (sb) => ({
    embudo: (await sb.rpc('cem_embudo', { p_dias: 90 })).data,
    canales: (await sb.rpc('cem_por_canal', { p_dias: 90 })).data,
  })));
  a.comprobar(!(negado.embudo?.pasos || []).length,
    'Un estudiante no recibe el embudo del negocio');
  a.comprobar(Array.isArray(negado.canales) && negado.canales.length === 0,
    'Ni de dónde viene la gente');
  await E.close();

  a.comprobar(A.errores.length === 0, `Sin errores ${JSON.stringify(A.errores.slice(0, 2))}`);
  await A.close();
  return a;
}
