/* La constancia de fe de erratas, rellenada con los datos de cada quien.
   ═══════════════════════════════════════════════════════════════════════════
   Los 143 diplomas que ya están impresos dicen «Titular de la cédula de
   indentidad». La errata se corrigió en las plantillas —lo que se dibuja hoy
   está bien— pero el papel que la gente tiene en la mano no se arregla con un
   despliegue. La escuela emitió una constancia oficial que explica el error y
   ratifica que no afecta a la validez del título.

   Aquí NO se vuelve a maquetar ese documento. Se coge el .docx original, tal
   como lo entregó la Dirección Académica, y se le sustituyen las siete marcas
   que trae entre corchetes. Todo lo demás —el membrete, las dos imágenes, los
   pies, las tipografías, los márgenes, el sello— viaja intacto porque nunca se
   toca: un .docx es un zip, y de ese zip sólo se reescribe `word/document.xml`.

   Las siete marcas están enteras dentro del XML, cada una una sola vez —está
   comprobado—, así que basta con sustituir texto. Ojo con eso: Word parte las
   frases en «runs» cuando se ha editado mucho, y una marca partida en dos runs
   no la encontraría ninguna búsqueda. Si algún día se cambia la plantilla y
   deja de sustituirse, es casi seguro esto; se arregla volviendo a escribir la
   marca de un tirón en Word.

   Necesita JSZip, que la página carga por <script> —el mismo que ya usa el
   generador para armar los ZIP de cada grupo—.
*/

const RUTA_PLANTILLA = 'documentos/constancia-fe-de-erratas.docx';

/* Se pide una vez y se guarda: son casi 500 KB y no cambia entre descargas. */
let plantillaEnMemoria = null;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/* Lo que va dentro de un XML tiene que ir escapado. Un apellido con «&» —o un
   nombre escrito con comillas— rompería el documento entero, y Word no diría
   «falta un escape»: diría que el archivo está dañado. */
const escXml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/**
 * El nombre del diplomado como lo pide la frase del documento.
 *
 * La línea dice «Acreditación: Diplomado en [Nombre Exacto del Diplomado]», así
 * que meter ahí el título completo daría «Diplomado en Diplomado Internacional
 * de Marketing». Se le quita el arranque para que la frase quede en pie.
 */
export function nombreDelDiplomado(titulo){
  return String(titulo || '')
    .replace(/^Diplomado\s+Internacional\s+de\s+/i, '')
    .replace(/^Diplomado\s+(en|de)\s+/i, '')
    .trim() || 'el programa cursado';
}

/**
 * Los siete valores que rellenan la constancia, en un solo sitio.
 *
 * Los usan las dos salidas —el documento que se descarga y el texto que se lee
 * en pantalla— justamente para que no puedan decir cosas distintas.
 *
 * @param {{titulo:string, nombre:string, cedula:string, id:string}} d
 * @param {Date|string} fecha  la fecha con la que se extiende la constancia
 */
export function valoresDeLaConstancia(d, fecha){
  const f = fecha instanceof Date ? fecha : new Date(String(fecha) + 'T12:00:00');
  return {
    '[Nombres y Apellidos del Estudiante]': d.nombre || '',
    '[Número de Documento]': d.cedula || '',
    '[Nombre Exacto del Diplomado]': nombreDelDiplomado(d.titulo),
    '[Código del Diploma]': d.id || '',
    '[Día]': String(f.getDate()),
    '[Mes]': MESES[f.getMonth()] || '',
    '[Año]': String(f.getFullYear()),
  };
}

/**
 * El .docx original con las siete marcas sustituidas. Devuelve un Blob listo
 * para descargar.
 *
 * @param {object} datos   ver `valoresDeLaConstancia`
 * @param {Date|string} fecha
 * @param {string} [base]  desde dónde se pide la plantilla, si no es esta carpeta
 */
export async function construirConstancia(datos, fecha, base = import.meta.url){
  if (typeof JSZip !== 'function' && typeof JSZip !== 'object') {
    throw new Error('Falta JSZip: la página tiene que cargarlo por <script>.');
  }
  if (!plantillaEnMemoria) {
    /* La base se resuelve antes contra la dirección de la página. `new URL` no
       admite una base relativa —«/certificados/» a secas revienta con «Invalid
       base URL»— y quien llame a esto desde otra carpeta va a pasar justamente
       eso. Con `import.meta.url`, que ya es absoluta, este paso no cambia nada. */
    const r = await fetch(new URL(RUTA_PLANTILLA, new URL(base, location.href)));
    if (!r.ok) throw new Error('No se pudo traer la constancia oficial.');
    plantillaEnMemoria = await r.arrayBuffer();
  }

  const zip = await JSZip.loadAsync(plantillaEnMemoria);
  let xml = await zip.file('word/document.xml').async('string');

  const valores = valoresDeLaConstancia(datos, fecha);
  for (const [marca, valor] of Object.entries(valores)) {
    if (!xml.includes(marca)) {
      /* Callar aquí sería entregar una constancia con «[Día]» impreso dentro,
         que es peor que no entregar ninguna. */
      throw new Error(`La plantilla ya no trae la marca ${marca}.`);
    }
    xml = xml.split(marca).join(escXml(valor));
  }

  zip.file('word/document.xml', xml);
  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    /* Igual que lo comprime Word. Sin esto sale un archivo válido pero mucho
       más gordo, y las dos imágenes del membrete ya pesan lo suyo. */
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

/** Cómo se llama el archivo que se baja. */
export function nombreDeArchivo(datos){
  const quien = String(datos.nombre || 'constancia')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  return `Constancia_fe_de_erratas_${quien}.docx`;
}

/**
 * El texto de la constancia, para leerlo en pantalla sin descargar nada.
 *
 * Va transcrito del documento y con los mismos valores, porque quien abre esto
 * lo que quiere es ENTENDER que su título sigue valiendo; obligarle a bajarse un
 * Word y abrirlo para enterarse sería ponerle una puerta a la tranquilidad.
 * Los párrafos son los del original, en su orden.
 */
export function textoDeLaConstancia(datos, fecha){
  const v = valoresDeLaConstancia(datos, fecha);
  return {
    entidad: 'Centro Educativo Multigeneracional · Dirección Académica',
    titulo: 'Constancia oficial de fe de erratas',
    entrada: 'Por medio de la presente, la Dirección Académica del Centro Educativo '
      + 'Multigeneracional hace constar de manera formal e institucional la corrección de un '
      + 'error material de transcripción involuntario detectado en la impresión del documento '
      + 'físico adjunto.',
    datos: [
      ['Titular', v['[Nombres y Apellidos del Estudiante]']],
      ['Cédula de identidad', v['[Número de Documento]']],
      ['Acreditación', 'Diplomado en ' + v['[Nombre Exacto del Diplomado]']],
      ['Código único de verificación', v['[Código del Diploma]']],
    ],
    donde_dice: '…Titular de la cédula de indentidad…',
    debe_decir: '…Titular de la cédula de identidad…',
    validez: [
      'El Centro Educativo Multigeneracional certifica que este error de tipeo gramatical no '
      + 'altera, disminuye ni anula bajo ninguna circunstancia la validez legal, académica ni '
      + 'el valor de los conocimientos acreditados en el respectivo diploma, el cual fue '
      + 'impreso bajo estándares de alta calidad en pergamino italiano de 200 gramos.',
      'Asimismo, se ratifica que dicha certificación mantiene plenamente vigente su validez '
      + 'internacional brindada por Marketing & Business Academy, siendo un documento '
      + 'auténtico, legítimo y verificable en nuestro portal oficial www.escuelacem.com.',
    ],
    cierre: 'Se extiende la presente constancia para el resguardo del titular y como respaldo '
      + 'institucional ante cualquier departamento de recursos humanos, empresa, institución '
      + 'académica u organismo nacional o internacional que requiera su validación, en la '
      + `ciudad de Caracas, a los ${v['[Día]']} días del mes de ${v['[Mes]']} de ${v['[Año]']}.`,
    firma: 'Oscar Beltrán · Dirección Académica · Centro Educativo Multigeneracional',
  };
}
