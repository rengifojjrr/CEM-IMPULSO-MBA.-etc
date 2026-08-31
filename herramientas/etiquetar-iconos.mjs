#!/usr/bin/env node
/* Que la plataforma se pueda usar sin verla.
   ═══════════════════════════════════════════════════════════════════════════
   Los iconos de esta casa son una tipografía de ligaduras: dentro del HTML no
   hay un dibujo, hay la PALABRA. `<span class="material-symbols-outlined">
   delete</span>` es, para cualquier cosa que lea el documento en vez de
   mirarlo, el texto «delete».

   Eso rompe la plataforma de dos maneras distintas, y las dos se arreglan
   aquí:

   1 · UN BOTÓN QUE SÓLO LLEVA UN ICONO SE ANUNCIA EN INGLÉS. Los de borrar,
       editar, cerrar, copiar. Quien navega escuchando oye «botón delete», no
       «botón Borrar». Son 125 controles entre botones y enlaces.

       Casi todos —103 de 105 botones— ya llevan un `title` en castellano,
       escrito por quien hizo la pantalla: «Borrar el recurso», «Ver la
       historia de esta cuota», «Pasar la asistencia». El `title` sale en el
       globito al pasar el ratón, pero como nombre accesible va el ÚLTIMO de
       la lista: el contenido del botón gana, y el contenido es «delete».
       Así que se copia ese mismo texto a `aria-label`, que sí manda.

   2 · UN BOTÓN CON ICONO Y TEXTO SE ANUNCIA DOS VECES. «Verificar search»,
       «Guardar save», «Volver arrow_back». Son 629 iconos en la casa y sólo
       6 estaban ocultos al lector. El icono ahí es decoración —lo que
       significa ya está escrito al lado—, así que se marca `aria-hidden`.

   Lo que NO toca, a propósito
   ─────────────────────────────────────────────────────────────────────────
   · Un icono que NO está dentro de un botón o un enlace. Ahí puede estar
     diciendo algo por su cuenta —un check verde en una celda que significa
     «pagada»— y esconderlo borraría el dato. Los cuenta y los enumera con
     `--mirar` para poder revisarlos con calma, pero no los cambia.
   · Un control de sólo icono SIN `title` y SIN `aria-label`. Ocultarle el
     icono lo dejaría sin ningún nombre, que es peor que el nombre en inglés.
     Los canta y se paran a mano. Al escribir esto quedaban cinco; están
     arreglados.

   Es una herramienta y no un parche escrito a mano por lo de siempre: son 125
   sitios donde olvidarse, y el que se olvide no da error — simplemente deja a
   alguien fuera sin que nadie se entere.

   Uso:  node herramientas/etiquetar-iconos.mjs           (aplica)
         node herramientas/etiquetar-iconos.mjs --mirar   (sólo dice qué haría)
*/
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const SOLO_MIRAR = process.argv.includes('--mirar');

function fuentes(dir, acc = []) {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre === '.git') continue;
    const p = join(dir, nombre);
    if (statSync(p).isDirectory()) fuentes(p, acc);
    else if (nombre.endsWith('.html') || nombre.endsWith('.js')) acc.push(p);
  }
  return acc;
}

/* Un control cuyo ÚNICO contenido es un icono. El `[^>]*?` de la etiqueta no
   cruza el `>`, así que no se come el control siguiente. */
const SOLO_ICONO = /<(button|a)((?:(?!aria-label)[^>])*?)>(\s*)<span class="material-symbols-outlined"([^>]*)>([a-z_]+)<\/span>(\s*)<\/\1>/g;
const TITULO = /\stitle="([^"]*)"/;
const ICONO = /<span class="material-symbols-outlined"((?:(?!aria-hidden)[^>])*?)>/g;

let etiquetados = 0, ocultados = 0;
const sinNombre = [];
const sueltos = [];

for (const archivo of fuentes(RAIZ)) {
  const antes = readFileSync(archivo, 'utf8');
  if (!antes.includes('material-symbols-outlined')) continue;
  const corto = archivo.slice(RAIZ.length + 1);
  let t = antes;

  /* 1 · el nombre del control, copiado de su propio `title`. */
  t = t.replace(SOLO_ICONO, (todo, etiqueta, atributos, e1, atrIcono, nombre, e2) => {
    const tit = atributos.match(TITULO);
    if (!tit) {
      /* Sin `title` no hay de dónde sacar el nombre. Se canta y se deja igual:
         inventarlo aquí sería adivinar, y adivinar mal el nombre de un botón
         que borra cosas es peor que dejarlo en inglés. */
      sinNombre.push(`${corto} · <${etiqueta}> con el icono «${nombre}»`);
      return todo;
    }
    etiquetados++;
    return `<${etiqueta}${atributos} aria-label="${tit[1]}">${e1}`
      + `<span class="material-symbols-outlined"${atrIcono}>${nombre}</span>${e2}</${etiqueta}>`;
  });

  /* 2 · los iconos que son decoración, callados.
     Sólo los que van DENTRO de un botón o un enlace: ahí el nombre lo pone el
     control, y el icono repite. Fuera de un control puede ser el dato. */
  t = t.replace(/<(button|a)\b[^>]*>[\s\S]*?<\/\1>/g, (control) =>
    control.replace(ICONO, (todo, atr) => {
      ocultados++;
      return `<span class="material-symbols-outlined"${atr} aria-hidden="true">`;
    }));

  if (t !== antes && !SOLO_MIRAR) writeFileSync(archivo, t);
}

/* Los que quedan fuera de un control, para poder mirarlos. */
for (const archivo of fuentes(RAIZ)) {
  const t = readFileSync(archivo, 'utf8');
  if (!t.includes('material-symbols-outlined')) continue;
  const dentro = new Set();
  for (const c of t.matchAll(/<(button|a)\b[^>]*>[\s\S]*?<\/\1>/g))
    for (const i of c[0].matchAll(/<span class="material-symbols-outlined"/g))
      dentro.add(c.index + i.index);
  for (const i of t.matchAll(/<span class="material-symbols-outlined"((?:(?!aria-hidden)[^>])*?)>([a-z_]*)/g))
    if (!dentro.has(i.index)) sueltos.push(`${archivo.slice(RAIZ.length + 1)} · «${i[2]}»`);
}

console.log(`${SOLO_MIRAR ? 'Pondría' : 'Puestos'} ${etiquetados} nombres`
  + ` · ${SOLO_MIRAR ? 'callaría' : 'callados'} ${ocultados} iconos de adorno`);

if (sinNombre.length) {
  console.log(`\n✗ ${sinNombre.length} control(es) de sólo icono sin «title» del que copiar.`);
  console.log('  Ponles un title en castellano y vuelve a pasar esto:');
  sinNombre.forEach((s) => console.log('   ·', s));
}

if (sueltos.length) {
  console.log(`\n· ${sueltos.length} icono(s) fuera de un botón o enlace, sin tocar.`);
  console.log('  Si alguno significa algo por sí solo, necesita texto al lado.');
  sueltos.slice(0, 12).forEach((s) => console.log('   ·', s));
  if (sueltos.length > 12) console.log(`   · … y ${sueltos.length - 12} más`);
}

process.exit(sinNombre.length ? 1 : 0);
