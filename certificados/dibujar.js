/* Dibujar un certificado. Un solo sitio.
   ═══════════════════════════════════════════════════════════════════════════
   Esto vivía dentro de `montarGenerador`, en generador.js, encerrado en su
   ámbito: quinientos y pico certificados que la escuela dibuja para imprimir,
   y ninguna otra pantalla podía dibujar ni uno. Al egresado se le podía enseñar
   una lista de sus diplomas y una tarjeta de texto que decía «válido», pero no
   su diploma.

   Sacarlo aquí no es un adorno de arquitectura: es la única forma de que lo que
   ve el egresado en pantalla sea EL MISMO documento que la escuela le imprime.
   Si hubiera dos dibujantes, tarde o temprano dirían cosas distintas —una
   fecha, un tamaño de letra, un salto de línea— y el primero en enterarse sería
   alguien mirando un diploma que no coincide con el que tiene en la mano.

   El generador importa de aquí y ya no tiene copia propia. Así que si el
   generador sigue imprimiendo bien, la pantalla del egresado también está bien:
   es literalmente el mismo código.

   Necesita dos cosas del entorno:
     · un `document` con canvas — o sea, un navegador;
     · el global `qrcode` de qrcode-generator, que las páginas cargan por
       <script>. Sin él sólo fallan los campos de QR, y se dice por qué.
*/

/* El fondo de una plantilla pesa cerca de un mega y se repite en los ochenta
   certificados de un grupo. Se pide una vez por dirección. */
const fondosEnMemoria = new Map();

/* Las que el editor ofrece. Sólo se piden las que la plantilla use de verdad. */
export const GOOGLE_FONT_FAMILIES = [
  'Playfair Display','Cormorant Garamond','EB Garamond','Merriweather','Lora','PT Serif',
  'Libre Baskerville','Roboto Slab','Cinzel','Marcellus','Montserrat','Open Sans','Lato',
  'Raleway','Poppins','Great Vibes','Dancing Script','Pacifico','Sacramento','Alex Brush',
  'Allura','Parisienne','UnifrakturMaguntia','UnifrakturCook','Pirata One',
];

const fontsLoadedCache = new Set();

/**
 * Pide al navegador las tipografías que ESTA plantilla usa, y espera a que
 * lleguen.
 *
 * Hace falta llamarla antes de dibujar, siempre. `document.fonts.ready` no
 * sirve: una tipografía declarada en el CSS pero que ninguna letra de la página
 * está usando no se descarga nunca, así que «ya está todo listo» es cierto y
 * aun así el lienzo la dibujaría con la letra de reserva. Se vio en un lote
 * real: el primer certificado salió con otra fecha y otro puntaje que los trece
 * siguientes, porque para el primero la fuente aún no había llegado.
 */
export async function ensureFontsLoadedForConfig(cfg){
  const toLoad = new Set();
  for(const f of (cfg?.fields || [])){
    if(f.tipo !== 'texto' || !f.activo) continue;
    const familias = [f.fontFamily, ...(f.resaltados || []).map(r => r.fontFamily)].filter(Boolean);
    for(const familia of familias){
      for(const gf of GOOGLE_FONT_FAMILIES){
        if(familia.includes(gf) && !fontsLoadedCache.has(gf)) toLoad.add(gf);
      }
    }
  }
  if(!toLoad.size) return;
  await Promise.all([...toLoad].flatMap(name => [
    document.fonts.load(`16px "${name}"`).catch(()=>{}),
    document.fonts.load(`700 16px "${name}"`).catch(()=>{}),
  ]));
  toLoad.forEach(name => fontsLoadedCache.add(name));
}

/**
 * El nombre de un campo, sin tildes ni mayúsculas ni espacios sobrantes. Sirve
 * para que «Cédula», «cedula» y «CÉDULA» sean la misma columna en todos lados:
 * al importar el Excel, al armar la lista de variables para insertar y al
 * sustituirlas dentro de un texto compuesto. Sin esto, un campo escrito sin
 * tilde y otro con tilde generan dos columnas separadas con el mismo dato.
 */
export function normalizarNombreCampo(s){
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Caja vertical de un campo de texto (arriba/abajo en %). */
export function cajaV(f){
  if(typeof f.topPct === 'number' && typeof f.botPct === 'number'){
    return { topPct: f.topPct, botPct: f.botPct };
  }
  const c = f.yPct ?? 50;
  return { topPct: c - 3, botPct: c + 3 };
}

/** Centro vertical: es lo que mantiene alineadas todas las palabras. */
export function centroV(f){ const v = cajaV(f); return (v.topPct + v.botPct) / 2; }

/** Opacidad de un campo, tolerando plantillas guardadas antes de existir esta opción. */
export function opacityOf(f){
  const v = Number(f.opacity);
  return (isFinite(v) && v >= 0 && v <= 1) ? v : 1;
}

/**
 * Cédula al estilo 12.345.678, conservando el prefijo de nacionalidad
 * (V-12345678 → V-12.345.678). Un documento sin dígitos se respeta tal cual.
 */
export function formatearCedula(valor){
  const v = String(valor ?? '').trim();
  if(!v) return '';
  const prefijo = (v.match(/^[^0-9]*/) || [''])[0].trim();
  const digitos = v.replace(/[^0-9]/g, '');
  if(!digitos) return v;
  const conPuntos = digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return prefijo ? `${prefijo}${/[-\s]$/.test(prefijo) ? '' : '-'}${conPuntos}`.replace(/--/g,'-') : conPuntos;
}

/** Aplica el formato elegido para el campo al valor que viene del Excel. */
export function aplicarFormato(valor, formato){
  if(formato === 'cedula') return formatearCedula(valor);
  if(formato === 'mayusculas') return String(valor ?? '').toUpperCase();
  return String(valor ?? '');
}

/** Caja horizontal de un campo (izquierda/derecha en %). */
export function boxOf(f){
  if(typeof f.leftPct === 'number' && typeof f.rightPct === 'number') return { leftPct: f.leftPct, rightPct: f.rightPct };
  const center = typeof f.xPct === 'number' ? f.xPct : 50;
  return { leftPct: Math.max(0, center - 25), rightPct: Math.min(100, center + 25) };
}

/** Sustituye las {{variables}} de un texto compuesto por los datos de la fila. */
export function resolverPlantillaTexto(plantilla, rowData){
  const porNombreNormalizado = new Map();
  for(const clave of Object.keys(rowData || {})) porNombreNormalizado.set(normalizarNombreCampo(clave), rowData[clave]);
  return String(plantilla || '').replace(/\{\{([^{}]+)\}\}/g, (m, nombre) => {
    const val = porNombreNormalizado.get(normalizarNombreCampo(nombre));
    return (val === undefined || val === null) ? '' : String(val);
  });
}

/**
 * Para cada carácter, a qué palabra pertenece (contando palabras separadas por
 * espacios) y qué posición ocupa dentro de esa palabra (0-based). Los espacios
 * devuelven null. Es la MISMA función que usa el editor (para saber qué letra
 * se seleccionó) y el render (para pintarla), así que «la 1ª letra de la 1ª
 * palabra» significa lo mismo en los dos lados, sin importar el nombre real de
 * cada persona ni cuánto mida.
 */
export function posicionesPorPalabra(text){
  const out = new Array(text.length).fill(null);
  let palabra = -1, letra = 0, enPalabra = false;
  for(let i = 0; i < text.length; i++){
    if(/\s/.test(text[i])){ enPalabra = false; continue; }
    if(!enPalabra){ palabra++; letra = 0; enPalabra = true; }
    out[i] = { palabra, letra };
    letra++;
  }
  return out;
}

/** Color y tipografía de cada carácter de `text` según los resaltados del campo `f`, o null si no tiene ninguno (camino rápido). */
export function estilosPorCaracter(text, f){
  if(!f.resaltados || !f.resaltados.length) return null;
  const posiciones = posicionesPorPalabra(text);
  const base = { color: f.color, fontFamily: f.fontFamily || 'Georgia, serif' };
  return text.split('').map((ch, i) => {
    const pos = posiciones[i];
    if(!pos) return base;
    const r = f.resaltados.find(r => r.palabra === pos.palabra && r.letra === pos.letra);
    if(!r) return base;
    return { color: r.color || base.color, fontFamily: r.fontFamily || base.fontFamily };
  });
}

/** El cuerpo de letra más grande, hasta `maxSize`, con el que `text` cabe en una línea. */
export function fitFontSize(ctx, text, fontFamily, bold, maxSize, minSize, maxWidthPx){
  let size = maxSize;
  for(; size > minSize; size--){
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${fontFamily}`;
    if(ctx.measureText(text).width <= maxWidthPx) break;
  }
  return size;
}

/** Ancho de `text` a un tamaño dado cuando cada carácter puede tener su propia tipografía (letras con estilo distinto). */
export function anchoMixto(ctx, text, estilos, bold, size){
  let w = 0;
  for(let i = 0; i < text.length; i++){
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${estilos[i].fontFamily}`;
    w += ctx.measureText(text[i]).width;
  }
  return w;
}

/** Igual que fitFontSize, pero cuando el campo tiene letras con tipografía propia (distinta a la del resto). */
export function fitFontSizeMixto(ctx, text, estilos, bold, maxSize, minSize, maxWidthPx){
  let size = maxSize;
  for(; size > minSize; size--){
    if(anchoMixto(ctx, text, estilos, bold, size) <= maxWidthPx) break;
  }
  return size;
}

/** Ancho de `text` (que empieza en `startIdx` dentro del texto completo) a un tamaño dado, con o sin letras de estilo propio. */
export function medirAncho(ctx, text, estilos, startIdx, bold, fontFamily, size){
  if(!estilos){ ctx.font = `${bold ? 'bold ' : ''}${size}px ${fontFamily}`; return ctx.measureText(text).width; }
  return anchoMixto(ctx, text, estilos.slice(startIdx, startIdx + text.length), bold, size);
}

/**
 * Reparte `text` en líneas que quepan en `maxWidthPx`, cortando sólo entre
 * palabras (nunca a mitad de una palabra: si una sola palabra ya es más
 * ancha que la caja, se deja sola en su línea aunque se salga un poco —
 * no hay forma de partirla). Se usa cuando ni el tamaño mínimo de letra
 * alcanza para que el texto quepa entero en una sola línea.
 */
export function envolverLineas(ctx, text, estilos, bold, fontFamily, size, maxWidthPx){
  const palabras = [];
  const re = /\S+/g;
  let m;
  while((m = re.exec(text))) palabras.push({ inicio: m.index, fin: m.index + m[0].length });
  if(!palabras.length) return [{ texto: text, inicio: 0, fin: text.length }];
  const lineas = [];
  let actual = { inicio: palabras[0].inicio, fin: palabras[0].fin };
  for(let i = 1; i < palabras.length; i++){
    const p = palabras[i];
    const ancho = medirAncho(ctx, text.slice(actual.inicio, p.fin), estilos, actual.inicio, bold, fontFamily, size);
    if(ancho <= maxWidthPx){ actual.fin = p.fin; continue; }
    lineas.push(actual);
    actual = { inicio: p.inicio, fin: p.fin };
  }
  lineas.push(actual);
  return lineas.map(l => ({ texto: text.slice(l.inicio, l.fin), inicio: l.inicio, fin: l.fin }));
}

/**
 * Igual que envolverLineas, pero reparte las palabras de forma más pareja
 * entre las líneas en vez de llenar la primera al tope y dejar la última
 * cortita (lo típico de un salto de línea "codicioso"). Prueba anchos cada
 * vez más angostos —sin aumentar la cantidad de líneas que ya hacían falta—
 * hasta encontrar el más chico que sigue funcionando; con ese ancho las
 * líneas quedan más equilibradas entre sí, igual que el balanceo de texto
 * de un procesador de texto. El texto se sigue dibujando al ancho real de
 * la caja: sólo cambia DÓNDE se corta cada línea.
 */
export function envolverLineasBalanceado(ctx, text, estilos, bold, fontFamily, size, maxWidthPx){
  const base = envolverLineas(ctx, text, estilos, bold, fontFamily, size, maxWidthPx);
  if(base.length <= 1) return base;
  let mejor = base, lo = maxWidthPx * 0.5, hi = maxWidthPx;
  for(let i = 0; i < 10; i++){
    const medio = (lo + hi) / 2;
    const candidata = envolverLineas(ctx, text, estilos, bold, fontFamily, size, medio);
    if(candidata.length === base.length){ mejor = candidata; hi = medio; }
    else { lo = medio; }
  }
  return mejor;
}

/** El fondo de la plantilla, ya decodificado y listo para dibujar. */
export function fondoDecodificado(url){
  if (!url) return Promise.reject(new Error('La plantilla no tiene fondo.'));
  let pendiente = fondosEnMemoria.get(url);
  if (pendiente) return pendiente;
  pendiente = new Promise((res, rej) => {
    const i = new Image();
    // El fondo vive en el almacenamiento, o sea en otro dominio. Sin pedirlo
    // con CORS el lienzo queda "contaminado" y toDataURL() lanza un error de
    // seguridad: la vista previa se vería bien y la descarga fallaría.
    if (!url.startsWith('data:')) i.crossOrigin = 'anonymous';
    i.onload = () => res(i);
    i.onerror = () => {
      // Un fallo no debe quedar cacheado: la próxima vez se reintenta.
      fondosEnMemoria.delete(url);
      rej(new Error('No se pudo cargar el fondo de la plantilla.'));
    };
    i.src = url;
  });
  fondosEnMemoria.set(url, pendiente);
  return pendiente;
}

/**
 * Dibuja un certificado.
 * `ajustes` son las correcciones manuales de ESTE certificado concreto
 * (ver sección "Ajustar"): { [nombreCampo]: {texto, dSize, dxPct, dyPct} }.
 */
export async function renderCertificateCanvas(rowData, verifyUrl, cfg, ajustes){
  const bgImg = await fondoDecodificado(cfg.background);
  const canvas = document.createElement('canvas');
  canvas.width = cfg.bgWidth; canvas.height = cfg.bgHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

  // Se dibuja de abajo arriba: el último de la lista queda al fondo y el
  // primero encima. Así el orden de la lista es el orden de las capas y no
  // importa cuál se creó antes.
  for(let iCapa = cfg.fields.length - 1; iCapa >= 0; iCapa--){
    const f = cfg.fields[iCapa];
    if(!f.activo) continue;
    const aj = (ajustes && ajustes[f.nombre]) || {};
    const dx = (Number(aj.dxPct) || 0), dy = (Number(aj.dyPct) || 0);

    if(f.tipo === 'qr'){
      // El QR lo dibuja qrcode-generator, que llega por <script> y no por
      // import. Si la página no lo cargó, se dice cuál es el arreglo en vez de
      // reventar con «qrcode is not defined» a mitad del lienzo.
      if(typeof qrcode !== 'function'){
        throw new Error('Falta qrcode-generator: la página que dibuja tiene que cargarlo por <script>.');
      }
      const qr = qrcode(0, 'M');
      qr.addData(verifyUrl);
      qr.make();
      const qrDataUrl = qr.createDataURL(8, 2);
      const qrImg = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = qrDataUrl; });
      ctx.save();
      ctx.globalAlpha = opacityOf(f);
      ctx.drawImage(qrImg, ((f.xPct+dx)/100)*canvas.width - f.size/2, ((f.yPct+dy)/100)*canvas.height - f.size/2, f.size, f.size);
      ctx.restore();
      continue;
    }

    if(f.tipo === 'imagen'){
      if(!f.dataUrl) continue;
      const im = await new Promise(res => {
        const i = new Image();
        if (!String(f.dataUrl).startsWith('data:')) i.crossOrigin = 'anonymous';
        i.onload = () => res(i); i.onerror = () => res(null); i.src = f.dataUrl;
      });
      if(!im) continue;
      const wPx = ((f.widthPct ?? 18)/100) * canvas.width;
      const hPx = wPx * (im.naturalHeight / im.naturalWidth);   // se cuadra sin deformar
      ctx.save();
      ctx.globalAlpha = opacityOf(f);
      ctx.drawImage(im, ((f.xPct+dx)/100)*canvas.width - wPx/2, ((f.yPct+dy)/100)*canvas.height - hPx/2, wPx, hPx);
      ctx.restore();
      continue;
    }

    // texto: gana el ajuste manual de ESTE certificado; si no hay, el texto
    // con variables incrustadas (si está activado); si no, el valor fijo de
    // la plantilla (mismo para todas las personas); si no, el Excel
    const fijo = cfg.overrides && cfg.overrides[f.nombre];
    const bruto = (aj.texto !== undefined && aj.texto !== null && aj.texto !== '')
      ? aj.texto
      : f.usarPlantillaTexto ? resolverPlantillaTexto(f.plantillaTexto, rowData)
      : (fijo !== undefined && fijo !== null && fijo !== '') ? fijo : rowData[f.nombre];
    if(bruto === undefined || bruto === null || bruto === '') continue;
    const text = aplicarFormato(bruto, f.formato);
    if(!text) continue;

    const fontFamily = f.fontFamily || 'Georgia, serif';
    const box = boxOf(f);
    const leftPx = ((box.leftPct + dx)/100) * canvas.width;
    const rightPx = ((box.rightPct + dx)/100) * canvas.width;
    const boxWidthPx = Math.max(10, rightPx - leftPx);
    // El alto de la caja también limita la letra: así ninguna palabra se sale
    // por arriba o por abajo y todas quedan alineadas entre sí.
    const v = cajaV(f);
    const altoCajaPx = Math.max(6, ((v.botPct - v.topPct)/100) * canvas.height);
    const topeAlto = altoCajaPx / 1.25;
    const maxSize = Math.max(4, Math.min((f.maxFontSize || f.fontSize || 32) + (Number(aj.dSize) || 0), topeAlto));
    // "Ajustar tamaño al margen": la letra se encoge todo lo que haga falta
    // —incluso por debajo del mínimo configurado— para que el texto quepa
    // siempre en una sola línea, sin invadir nunca lo que haya arriba o abajo
    // de la caja. "Seguir hacia abajo" respeta el mínimo configurado; si ni
    // así cabe en una línea, se reparte en varias (ver más abajo).
    const minSize = f.desborde === 'ajustar' ? Math.min(4, maxSize) : Math.min(f.minFontSize || 12, maxSize);
    const estilos = estilosPorCaracter(text, f);
    const fitSize = estilos
      ? fitFontSizeMixto(ctx, text, estilos, f.bold, maxSize, minSize, boxWidthPx)
      : fitFontSize(ctx, text, fontFamily, f.bold, maxSize, minSize, boxWidthPx);
    ctx.save();
    ctx.globalAlpha = opacityOf(f);
    ctx.font = `${f.bold ? 'bold ' : ''}${fitSize}px ${fontFamily}`;
    ctx.fillStyle = f.color;
    ctx.textBaseline = 'middle';
    let drawX;
    if(f.align === 'left'){ ctx.textAlign = 'left'; drawX = leftPx; }
    else if(f.align === 'right'){ ctx.textAlign = 'right'; drawX = rightPx; }
    else { ctx.textAlign = 'center'; drawX = (leftPx + rightPx) / 2; }
    // El texto se ancla al CENTRO de la caja, no a una línea suelta: por eso
    // dos campos con la misma caja quedan alineados aunque cambie el cuerpo.
    const yPx = ((centroV(f) + dy)/100) * canvas.height;
    const topPx = ((v.topPct + dy)/100) * canvas.height;
    const anchoTextoCompleto = medirAncho(ctx, text, estilos, 0, f.bold, fontFamily, fitSize);

    if(anchoTextoCompleto <= boxWidthPx){
      // cabe entero en una sola línea: se dibuja igual que siempre.
      ctx.beginPath();
      ctx.rect(leftPx, topPx, boxWidthPx, altoCajaPx);
      ctx.clip();
      if(!estilos){
        ctx.fillText(text, drawX, yPx);
      } else {
        // con letras de color/tipografía distinta hay que pintar carácter por
        // carácter; se usa el ancho total ya medido para que el bloque
        // completo quede anclado igual que antes (izquierda/centro/derecha).
        let x;
        if(f.align === 'left') x = leftPx;
        else if(f.align === 'right') x = rightPx - anchoTextoCompleto;
        else x = (leftPx + rightPx)/2 - anchoTextoCompleto/2;
        ctx.textAlign = 'left';
        for(let i = 0; i < text.length; i++){
          ctx.font = `${f.bold ? 'bold ' : ''}${fitSize}px ${estilos[i].fontFamily}`;
          ctx.fillStyle = estilos[i].color;
          ctx.fillText(text[i], x, yPx);
          x += ctx.measureText(text[i]).width;
        }
      }
    } else {
      // ni al tamaño mínimo cabe en una sola línea (esto sólo puede pasar en
      // modo "seguir hacia abajo": en "ajustar tamaño al margen" la letra ya
      // se encogió lo necesario para no llegar aquí). Se reparte en varias
      // líneas, cortando sólo entre palabras y respetando los mismos
      // márgenes izquierdo/derecho. El bloque arranca en el borde SUPERIOR
      // de la caja y crece sólo hacia abajo —nunca hacia arriba— para no
      // superponerse con lo que haya encima (p.ej. un encabezado del diseño).
      const lineas = envolverLineasBalanceado(ctx, text, estilos, f.bold, fontFamily, fitSize, boxWidthPx);
      const lineHeight = fitSize * 1.22;
      const altoBloque = lineas.length * lineHeight;
      ctx.beginPath();
      ctx.rect(leftPx, topPx, boxWidthPx, Math.max(altoCajaPx, altoBloque));
      ctx.clip();
      lineas.forEach((linea, li) => {
        const yLinea = topPx + lineHeight * (li + 0.5);
        if(!estilos){
          ctx.font = `${f.bold ? 'bold ' : ''}${fitSize}px ${fontFamily}`;
          ctx.fillText(linea.texto, drawX, yLinea);
        } else {
          const anchoLinea = medirAncho(ctx, linea.texto, estilos, linea.inicio, f.bold, fontFamily, fitSize);
          let x;
          if(f.align === 'left') x = leftPx;
          else if(f.align === 'right') x = rightPx - anchoLinea;
          else x = (leftPx + rightPx)/2 - anchoLinea/2;
          ctx.textAlign = 'left';
          for(let k = 0; k < linea.texto.length; k++){
            const e = estilos[linea.inicio + k];
            ctx.font = `${f.bold ? 'bold ' : ''}${fitSize}px ${e.fontFamily}`;
            ctx.fillStyle = e.color;
            ctx.fillText(linea.texto[k], x, yLinea);
            x += ctx.measureText(linea.texto[k]).width;
          }
        }
      });
    }
    ctx.restore();
  }
  return canvas;
}

/**
 * Un certificado ya emitido, dibujado como se imprime.
 * ═══════════════════════════════════════════════════════════════════════════
 * Esto es la RECETA, y por eso está aquí y no repetida en cada pantalla: pedir
 * las tipografías, armar la dirección de verificación del QR, y —lo que más
 * cuesta acordarse— dejar que la fecha guardada en este certificado gane a la
 * fija de la plantilla.
 *
 * Lo de la fecha no es un detalle. El valor fijo de la plantilla es el mismo
 * para todo el mundo, y la fecha no lo es: dos promociones hacen el mismo
 * módulo en meses distintos. Sin esto, volver a dibujar un certificado de abril
 * lo saca con la fecha que la plantilla tenga hoy — un documento con una fecha
 * que no ocurrió, en manos de un graduado.
 *
 * Va acotado a la fecha a propósito. Los demás valores fijos (el nombre del
 * módulo, la firma) sí son iguales para todos y deben seguir saliendo de la
 * plantilla, que es donde se corrigen de una vez para todos. Y sólo actúa si el
 * certificado trae fecha: los emitidos antes de esto la tienen vacía y siguen
 * comportándose igual que siempre.
 *
 * @param {{id:string, datos:object}} certificado  fila de cert_certificates
 * @param {object} config                          config de su plantilla
 * @param {string} verifyUrl                       la que va dentro del QR
 */
export async function dibujarCertificadoEmitido(certificado, config, verifyUrl){
  await ensureFontsLoadedForConfig(config);
  const datos = certificado?.datos || {};
  const suFecha = datos.fecha ? String(datos.fecha).trim() : '';
  const ajustes = suFecha ? { fecha: { texto: suFecha } } : undefined;
  return renderCertificateCanvas(datos, verifyUrl, config, ajustes);
}
