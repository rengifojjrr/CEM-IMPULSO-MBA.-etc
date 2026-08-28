/* ============================================================
   CEM · Motor del generador de certificados.

   Este archivo existía por duplicado: `certificados/generar.html` y
   `plataforma/admin/certificados-plantillas.html` eran el mismo programa de
   ~3.500 líneas, de las que sólo diferían unas cincuenta (el título, la
   tipografía y cómo se obtiene la sesión). Cada mejora había que hacerla dos
   veces y probarla dos veces — y eso es exactamente lo que pasó con las
   carpetas anidadas, el arrastre de archivos y el ajuste de márgenes.

   Ahora el motor vive acá una sola vez y las dos páginas son envoltorios:
   ponen su propia cabecera y le pasan el cliente de Supabase que corresponda.

   Uso:
     import { montarGenerador, ESTILOS_GENERADOR, CONTROLES_GENERADOR } from './generador.js';
     montarGenerador({ supabase, contenedor, rutaVerificar: 'verificar.html' });
   ============================================================ */

export const ESTILOS_GENERADOR = String.raw`  :root{
    /* El generador nació como herramienta suelta y traía su propia paleta,
       escrita a mano y sólo en claro. Metido dentro del portal eso se veía:
       los paneles seguían blancos mientras los campos, que sí heredaban los
       tokens, se ponían oscuros de noche. Media pantalla de cada tema.

       Ahora cada color se pide primero al portal y sólo si no está —cuando
       esta herramienta se abre por su cuenta, sin la hoja compartida— cae al
       valor de repuesto. Así el generador cambia de tema y de paleta con el
       resto de la plataforma sin tener que tocarlo. */
    --navy:var(--primary, #132743);
    --navy-2:var(--primary, #1c3a5e);
    --teal:var(--secondary, #1b7f76);
    /* Nombre propio: escribir --gold a partir de --gold sería referirse a sí
       mismo, y CSS anula toda la declaración cuando detecta el ciclo. */
    --dorado:var(--gold, #c9a227);
    --bg:var(--fondo, #f4f6f8);
    --card:var(--papel, #ffffff);
    --hundido:var(--hueco, #f3f5f7);
    --border:var(--filete, #dde3ea);
    --text:var(--tinta, #1f2937);
    --muted:var(--tinta-2, #6b7280);
    --sobre-marca:var(--on-primary, #ffffff);
    --border-fuerte:var(--filete-fuerte, #c2c8d0);
    --sobre-dorado:var(--on-gold, #20200a);
    --teal-suave:var(--secondary-container, #e7f7f0);
    --peligro:var(--error, #b91c1c);
    --peligro-suave:var(--error-suave, #fdecec);
    --bien:var(--ok, #065f46);
    --bien-suave:var(--ok-suave, #e7f7f0);
    --ojo:var(--warn, #92400e);
    --ojo-suave:var(--warn-suave, #fef3c7);
  }

  /* Los controles que dibuja el navegador —«Elegir archivo», las casillas, la
     barra de desplazamiento— no leen esta hoja: leen color-scheme, y esa va
     en la raíz del documento, no aquí. La declara cada página anfitriona
     (styles.css del portal y el estilo propio de certificados/generar.html).
     Ponerla
     también acá, acotada al generador, dejaría los controles de un tema y el
     resto de la página del otro en cuanto alguien montara el motor en una
     pantalla clara. */
  *{box-sizing:border-box;}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--text);}
  header{background:var(--navy);color:var(--sobre-marca);padding:14px 18px;}
  header h1{font-size:16px;margin:0;}
  header p{margin:4px 0 0;font-size:12.5px;color:var(--sobre-marca);opacity:.78;}
  main{max-width:1150px;margin:0 auto;padding:20px 16px 60px;}
  .panel{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:18px 20px;margin-bottom:18px;}
  .panel h2{margin-top:0;font-size:15px;color:var(--navy);}
  .panel-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;}
  .panel-head h2{margin:0;flex:1 1 auto;min-width:0;}
  .panel-head .btn{flex:0 0 auto;}
  .panel-body.collapsed{display:none;}
  .gen-entry{border:1px solid var(--border);border-radius:8px;margin-bottom:10px;overflow:hidden;}
  .gen-entry-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0;padding:10px 12px;background:var(--hundido);cursor:pointer;}
  .gen-entry-body{padding:10px 12px;border-top:1px solid var(--border);}
  .btn{cursor:pointer;border:1px solid var(--navy);background:var(--navy);color:var(--sobre-marca);border-radius:6px;padding:8px 14px;font-size:13px;}
  .btn.outline{background:var(--card);color:var(--navy);}
  .btn.teal{background:var(--teal);border-color:var(--teal);}
  .btn.gold{background:var(--dorado);border-color:var(--dorado);color:var(--sobre-dorado);}
  .btn.danger{background:var(--card);color:var(--peligro);border-color:var(--peligro);}
  .btn:disabled{cursor:not-allowed;opacity:1;background:var(--hundido);
    color:var(--muted);border-color:var(--border);}
  .btn.small{padding:4px 9px;font-size:11.5px;}
  input[type=email], input[type=text], input[type=number], input[type=date], input[type=color], select, textarea{
    padding:7px 9px;border:1px solid var(--border);border-radius:6px;font-size:13px;font-family:inherit;
    background:var(--card);color:var(--text);}
  textarea{width:100%;min-height:110px;font-family:ui-monospace,monospace;font-size:12px;}
  table{width:100%;border-collapse:collapse;font-size:12.5px;}
  th,td{border-bottom:1px solid var(--border);padding:6px 8px;text-align:left;}
  th{color:var(--muted);text-transform:uppercase;font-size:10.5px;}
  .msg{padding:10px 12px;border-radius:8px;font-size:13px;margin-top:10px;}
  .msg.ok{background:var(--bien-suave);color:var(--bien);}
  .msg.err{background:var(--peligro-suave);color:var(--peligro);}
  .msg.warn{background:var(--ojo-suave);color:var(--ojo);}
  .row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px;}
  /* ---- reglas y guías, al estilo de un procesador de textos ---- */
  .lienzo-con-reglas{display:grid;grid-template-columns:20px auto;grid-template-rows:20px auto;
    width:max-content;max-width:100%;}
  .regla-esquina{background:var(--hundido);border:1px solid var(--border);border-radius:4px 0 0 0;
    display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted);
    cursor:pointer;user-select:none;}
  .regla-esquina:hover{background:var(--border);color:var(--peligro);}
  .regla{position:relative;background:var(--hundido);border:1px solid var(--border);overflow:hidden;
    touch-action:none;user-select:none;}
  .regla-h{grid-column:2;grid-row:1;cursor:col-resize;}
  .regla-v{grid-column:1;grid-row:2;cursor:row-resize;}
  .regla .marca{position:absolute;background:var(--border-fuerte);}
  .regla-h .marca{bottom:0;width:1px;}
  .regla-v .marca{right:0;height:1px;}
  .regla .num{position:absolute;font-size:8.5px;color:var(--muted);line-height:1;}
  .regla-h .num{top:3px;transform:translateX(-50%);}
  .regla-v .num{left:3px;transform:translateY(-50%) rotate(-90deg);transform-origin:center;}
  .regla .fantasma{position:absolute;background:var(--teal);opacity:.55;}
  .regla-h .fantasma{top:0;bottom:0;width:2px;}
  .regla-v .fantasma{left:0;right:0;height:2px;}

  /* Ojo con lo que viene de aquí a la caja de los campos: etiquetas, marcas,
     guías y recuadros van pintados ENCIMA de la lámina del certificado, que es
     arte claro tanto de día como de noche. Sus colores están escritos a mano a
     propósito: si siguieran el tema, de noche se volverían claros sobre claro
     y desaparecerían justo sobre el papel que hay que colocar. */

  /* Por debajo de las etiquetas y las marcas de los campos (z 3-5): una guía
     nunca debe impedir agarrar un campo que quede justo encima de ella. */
  .guia{position:absolute;z-index:100;touch-action:none;}
  .guia.v{top:0;bottom:0;width:11px;margin-left:-5px;cursor:ew-resize;}
  .guia.h{left:0;right:0;height:11px;margin-top:-5px;cursor:ns-resize;}
  .guia::after{content:'';position:absolute;background:#12b3a6;}
  .guia.v::after{left:5px;top:0;bottom:0;width:1px;}
  .guia.h::after{top:5px;left:0;right:0;height:1px;}
  .guia:hover::after,.guia.arrastrando::after{background:#0d8177;box-shadow:0 0 0 1px rgba(18,179,166,.35);}
  /* Elegida con un clic: se engorda para que se vea cuál se va a borrar con Supr. */
  .guia.sel::after{background:#0d8177;box-shadow:0 0 0 2px rgba(18,179,166,.45);}
  .guia.sel.v::after{width:3px;left:4px;}
  .guia.sel.h::after{height:3px;top:4px;}
  .guia.borrar::after{background:#dc2626;}

  #tplPreviewWrap{position:relative;display:block;grid-column:2;grid-row:2;max-width:100%;border:1px solid var(--border);border-radius:6px;overflow:hidden;touch-action:none;}
  #tplPreviewWrap img{display:block;max-width:900px;width:100%;height:auto;}
  .field-chip{position:absolute;transform:translate(-50%,-50%);background:rgba(19,39,67,.85);color:#fff;font-size:10px;padding:3px 7px;border-radius:10px;cursor:grab;user-select:none;white-space:nowrap;border:1px solid var(--dorado);z-index:400;touch-action:none;}
  .field-chip:active{cursor:grabbing;}
  .field-chip.inactive{opacity:.4;border-style:dashed;}

  /* Caja del campo: reglillas de los cuatro lados. El texto se centra en
     vertical, así todas las palabras quedan alineadas arriba y abajo. */
  .field-box{position:absolute;border:1px dashed rgba(19,39,67,.55);background:rgba(19,39,67,.04);
    z-index:1;pointer-events:none;display:flex;align-items:center;overflow:hidden;}
  .field-box.inactive{border-color:rgba(107,114,128,.45);background:transparent;}
  .field-box.sel{border-color:var(--teal);border-width:2px;background:rgba(27,127,118,.07);}
  .field-box span{width:100%;white-space:nowrap;line-height:1;}
  .field-box.inactive span{opacity:.35;}

  /* La etiqueta flotante es el asa para mover todo el campo. */
  .field-label{position:absolute;transform:translate(-50%,-100%);background:rgba(19,39,67,.9);color:#fff;
    font-size:10px;padding:3px 8px;border-radius:8px;white-space:nowrap;z-index:400;border:1px solid var(--dorado);
    cursor:move;user-select:none;touch-action:none;}
  .field-label:active{cursor:grabbing;}
  .field-label.inactive{opacity:.45;}
  .field-label.sel{background:var(--teal);border-color:var(--navy);}

  .field-handle{position:absolute;background:var(--dorado);border:1px solid var(--navy);border-radius:3px;
    z-index:300;touch-action:none;transform:translate(-50%,-50%);}
  .field-handle.h{width:9px;height:22px;cursor:ew-resize;}
  .field-handle.v{width:22px;height:9px;cursor:ns-resize;}
  .field-handle.c{width:13px;height:13px;border-radius:50%;z-index:310;}
  .field-handle.inactive{opacity:.4;}
  .img-box{position:absolute;transform:translate(-50%,-50%);cursor:grab;z-index:1;touch-action:none;outline:1px dashed rgba(19,39,67,.5);}
  .img-box:active{cursor:grabbing;}
  .img-box.inactive{opacity:.35 !important;}
  .img-box.sel{outline:2px solid var(--teal);outline-offset:2px;}
  .field-chip.sel{background:var(--teal);border-color:var(--navy);}
  .img-box img{display:block;width:100%;height:auto;pointer-events:none;}
  .img-vacia{padding:10px 6px;text-align:center;font-size:10px;color:var(--muted);background:rgba(255,255,255,.75);}
  .img-handle{position:absolute;width:14px;height:14px;border-radius:50%;background:var(--teal);border:2px solid #fff;
    box-shadow:0 1px 3px rgba(0,0,0,.35);transform:translate(-50%,-50%);cursor:ew-resize;z-index:400;touch-action:none;}
  .img-handle.inactive{opacity:.4;}
  .modal-fondo{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:100;display:flex;align-items:flex-start;
    justify-content:center;padding:24px 12px;overflow-y:auto;}
  .modal-caja{background:var(--card);border-radius:10px;max-width:760px;width:100%;box-shadow:0 12px 40px rgba(0,0,0,.3);}
  .modal-cab{display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border);flex-wrap:wrap;}
  .modal-cab b{flex:1;min-width:0;}
  .modal-cuerpo{padding:14px 16px 18px;}
  .field-settings{display:flex;gap:7px;align-items:center;flex-wrap:wrap;padding:8px 8px;border-bottom:1px solid var(--border);font-size:12px;}
  .field-settings label{color:var(--muted);display:flex;align-items:center;gap:4px;white-space:nowrap;}

  /* ---- lista de campos ---- */
  .campo{border:1px solid var(--border);border-radius:8px;margin-bottom:7px;background:var(--card);}
  .campo.abierto{border-color:var(--teal);box-shadow:0 1px 6px rgba(27,127,118,.12);}
  .campo.apagado{background:var(--hundido);}
  .campo-cab{display:flex;align-items:center;gap:9px;padding:8px 11px;cursor:pointer;}
  .campo-cab:hover{background:var(--hundido);}
  .campo-orden{display:flex;flex-direction:column;gap:1px;}
  .campo-orden .mini{width:20px;height:15px;line-height:1;padding:0;font-size:9px;border:1px solid var(--border);
    background:var(--card);border-radius:3px;color:var(--muted);cursor:pointer;}
  .campo-orden .mini:disabled{opacity:1;cursor:default;color:var(--muted);
    background:var(--hundido);border-color:var(--border);}
  .campo-nombre{flex:1;min-width:90px;font-weight:600;}
  .campo-tipo{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);
    border:1px solid var(--border);border-radius:10px;padding:2px 8px;white-space:nowrap;}
  .campo-resumen{font-size:11px;color:var(--muted);}
  .campo-flecha{color:var(--navy);font-size:11px;background:var(--hundido);border:1px solid var(--border);
    border-radius:6px;padding:4px 9px;cursor:pointer;white-space:nowrap;flex-shrink:0;}
  .campo-flecha:hover{background:var(--border);}
  .campo-cuerpo{padding:4px 11px 11px;border-top:1px solid var(--border);}
  .campo-fila{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:9px;font-size:12.5px;}
  .campo-fila label{color:var(--muted);display:flex;align-items:center;gap:5px;white-space:nowrap;}
  .campo-pie{margin-top:11px;padding-top:9px;border-top:1px dashed var(--border);}
  /* fondo a cuadros: deja ver una imagen blanca o transparente */
  .img-muestra{width:56px;height:38px;border:1px solid var(--border);border-radius:5px;flex-shrink:0;
    display:flex;align-items:center;justify-content:center;overflow:hidden;
    background-image:linear-gradient(45deg,var(--border) 25%,transparent 25%,transparent 75%,var(--border) 75%),
                     linear-gradient(45deg,var(--border) 25%,transparent 25%,transparent 75%,var(--border) 75%);
    background-size:10px 10px;background-position:0 0,5px 5px;background-color:var(--card);}
  .img-muestra img{max-width:100%;max-height:100%;object-fit:contain;}
  .img-muestra i{font-size:10px;color:var(--muted);}
  @media (max-width:640px){ .campo-fila{gap:8px;} .campo-nombre{min-width:0;} }
  .resaltado-muestra{border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:18px;
    background:var(--card);cursor:text;user-select:text;line-height:1.5;word-break:break-word;}
  .resaltado-muestra span{white-space:pre;}
  .plantilla-editor{border:1px solid var(--border);border-radius:6px;padding:8px 10px;font-size:14px;
    background:var(--card);min-height:36px;line-height:1.6;white-space:pre-wrap;word-break:break-word;}
  .plantilla-editor:focus{outline:2px solid var(--teal);outline-offset:1px;}
  .var-chip{display:inline-block;background:var(--dorado);color:var(--sobre-dorado);border-radius:10px;padding:1px 8px;
    margin:0 1px;font-size:12.5px;font-weight:600;cursor:pointer;user-select:none;}
  .var-chip:hover{filter:brightness(.9);}
  .badge{display:inline-block;font-size:10px;padding:2px 7px;border-radius:10px;color:#fff;}
  .badge.vigente{background:#16a34a;}
  .badge.revocado{background:#dc2626;}
  .badge.reemplazado{background:#6b7280;}
  tr.fila-marcada{background:rgba(27,127,118,.08);}

  /* ---- el día como encabezado dentro de la tabla ----
     Una tanda de graduación se emite de una sentada, así que la fecha es lo que
     de verdad separa un grupo de otro. Es una fila y no una caja: meter cada día
     en su propio recuadro rompería la alineación de las columnas. */
  tr.grupo-fecha td{background:var(--hundido);border-bottom:1px solid var(--border);padding:7px 8px;}
  tr.grupo-fecha .dia{font-weight:700;color:var(--navy);}
  tr.grupo-fecha .row{margin-bottom:0;gap:8px;}
  td.hora{color:var(--muted);white-space:nowrap;font-variant-numeric:tabular-nums;}

  /* La previa de un grupo: un diploma por módulo, con su fecha debajo.
     Se mira para comprobar que cada módulo lleva su diseño y su fecha ANTES de
     ponerse a dibujar doscientos PDF, que son varios minutos. */
  td.previa-lote{background:var(--hundido);padding:12px;}
  /* Un desplegable metido en el texto de una fila.
     ─────────────────────────────────────────────────────────────────────────
     La hoja del portal declara select{width:100%}, pensada para los campos
     de un formulario, que ocupan su columna entera. Dentro de una fila
     flexible eso convierte este desplegable en una caja de 215px que se sale
     de su etiqueta y se dibuja ENCIMA del texto de al lado: en la pantalla se
     veía un recuadro pálido tragándose «10 graduados en el grupo».

     Aquí no ocupa una columna: va incrustado en una frase. Así que se le dice
     que mida lo que mida su contenido, con un mínimo para que quepa un nombre
     y un máximo para que un nombre larguísimo no vuelva a empujar la fila. */
  .row label.en-linea{display:inline-flex;align-items:center;gap:6px;}
  .row label.en-linea select{width:auto;min-width:170px;max-width:100%;}
  /* minmax(240px,…) reserva 240px por columna aunque la pantalla no los
     tenga: en un móvil la rejilla salía 130px más ancha que el panel y
     arrastraba la página entera hacia la derecha. Con min(240px,100%) es la
     misma rejilla cuando hay sitio, y una sola columna cuando no. */
  .previa-rejilla{display:grid;gap:14px;
    grid-template-columns:repeat(auto-fill,minmax(min(240px,100%),1fr));}
  .previa-uno{margin:0;min-width:0;background:var(--card);border:1px solid var(--border);border-radius:8px;
    padding:8px;display:flex;flex-direction:column;gap:6px;}
  /* Los nombres de plantilla son una sola palabra larguísima
     («4_MKT_INSTAGRAM…»). Sin esto empujan su columna y desbordan la tarjeta. */
  .previa-uno figcaption b{overflow-wrap:anywhere;}
  .previa-uno img{width:100%;height:auto;display:block;border-radius:4px;
    border:1px solid var(--border);}
  .previa-uno figcaption{font-size:12px;line-height:1.35;}

  /* Cartel de «esto está tardando a propósito». Abajo a la derecha, sin tapar
     la tabla y sin robar el foco: no hay nada que decidir mientras dura. */
  .aviso-progreso{position:fixed;right:18px;bottom:18px;z-index:60;
    background:var(--navy);color:var(--sobre-marca);border-radius:10px;padding:12px 16px;
    box-shadow:0 8px 24px rgba(0,0,0,.22);display:flex;flex-direction:column;gap:2px;
    font-size:13px;}
  .aviso-progreso .hint{color:var(--sobre-marca);opacity:.78;}
  .badge.borrador{background:var(--dorado);color:var(--sobre-dorado);}
  .carpeta-chip{display:inline-block;font-size:10px;padding:1px 7px;border-radius:8px;background:var(--hundido);color:var(--muted);margin-top:2px;}

  /* ---- botón de ayuda "?": reemplaza los párrafos largos de explicación ---- */
  .ayuda-btn{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;
    border-radius:50%;border:1px solid var(--border);background:var(--hundido);color:var(--muted);
    font-size:11px;font-weight:700;cursor:help;flex:none;padding:0;line-height:1;}
  .ayuda-btn:hover{background:var(--navy);color:var(--sobre-marca);border-color:var(--navy);}
  .ayuda-pop{position:absolute;z-index:500;max-width:320px;background:var(--navy);color:var(--sobre-marca);font-size:12.5px;
    line-height:1.45;padding:10px 12px;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.25);}

  /* ---- tablero visual de carpetas: arrastrar y soltar para organizar ---- */
  .carpetas-board{display:flex;flex-wrap:wrap;gap:10px;margin:6px 0 14px;align-items:flex-start;}
  .carpeta-card{border:1px solid var(--border);border-radius:10px;background:var(--hundido);min-width:230px;
    flex:1 1 230px;max-width:460px;}
  .carpeta-card.sin-carpeta{background:transparent;border-style:dashed;}
  .carpeta-card-head{font-size:12.5px;font-weight:600;padding:7px 10px;border-bottom:1px solid var(--border);
    display:flex;align-items:center;justify-content:space-between;gap:6px;cursor:pointer;user-select:none;}
  .carpeta-card-head:hover{background:var(--border);}
  .carpeta-flecha{display:inline-block;width:10px;color:var(--muted);}
  .carpeta-card-acciones{display:flex;align-items:center;gap:3px;}
  .carpeta-accion{border:none;background:transparent;color:var(--muted);cursor:pointer;font-size:12px;
    padding:2px 4px;border-radius:4px;line-height:1;}
  .carpeta-accion:hover{background:rgba(0,0,0,.08);color:var(--navy);}
  .carpeta-card-body{padding:8px;display:flex;flex-wrap:wrap;gap:8px;min-height:38px;align-content:flex-start;}
  .carpeta-card-body.drag-over{background:var(--teal-suave);outline:2px dashed var(--teal);outline-offset:-2px;}
  /* carpetas dentro de carpetas: la subcarpeta ocupa todo el ancho de su padre,
     apiladas verticalmente, con una guía punteada que marca el nivel */
  .carpeta-subcarpetas{display:flex;flex-direction:column;gap:8px;margin:8px 0 0;padding:8px 0 0 12px;border-left:2px dashed var(--border);}
  .carpeta-card--anidada{width:100%;max-width:none;min-width:0;flex:none;}
  .plantilla-chip{position:relative;display:flex;flex-direction:column;gap:4px;border:1px solid var(--border);
    background:var(--card);border-radius:7px;padding:5px;font-size:11px;cursor:grab;width:104px;}
  .plantilla-chip-img{width:100%;height:60px;object-fit:cover;border-radius:4px;background:var(--hundido);
    border:1px solid var(--border);display:block;}
  .plantilla-chip-nombre{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;}
  .plantilla-chip:hover{border-color:var(--teal);}
  .plantilla-chip.sel{border-color:var(--teal);background:rgba(27,127,118,.08);font-weight:600;}
  .plantilla-chip.marcada{border-color:var(--peligro);background:rgba(220,38,38,.12);}
  .plantilla-chip-check{position:absolute;top:3px;left:3px;width:15px;height:15px;cursor:pointer;z-index:2;}
  .plantilla-chip:active{cursor:grabbing;}
  progress{width:100%;height:14px;}
  .hint{font-size:12px;color:var(--muted);}
  .matrix-wrap{overflow-x:auto;}
  .matrix-wrap table{white-space:nowrap;}
  .matrix-wrap th, .matrix-wrap td{text-align:center;}
  .matrix-wrap td:first-child, .matrix-wrap th:first-child{text-align:left;position:sticky;left:0;background:var(--card);}
  .gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-top:12px;}
  .gallery figure{margin:0;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--hundido);}
  .gallery img{width:100%;display:block;}
  .gallery figcaption{padding:6px 8px;font-size:11px;color:var(--muted);}
  .gallery figcaption b{color:var(--text);display:block;font-size:11.5px;}
  .font-picker{position:relative;display:inline-block;}
  .font-picker-btn{padding:7px 9px;border:1px solid var(--border);border-radius:6px;background:var(--card);color:var(--text);font-size:13px;cursor:pointer;min-width:150px;max-width:220px;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .font-picker-list{position:absolute;top:100%;left:0;z-index:20;background:var(--card);border:1px solid var(--border);border-radius:6px;box-shadow:0 8px 20px rgba(0,0,0,.15);max-height:260px;overflow-y:auto;min-width:230px;margin-top:2px;}
  .font-picker-opt{padding:9px 12px;font-size:15px;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  .font-picker-opt:hover, .font-picker-opt:active{background:var(--hundido);}
  @media (max-width:640px){
    .btn{width:100%;}
    .row{flex-direction:column;align-items:stretch;}
    .panel-head .btn{width:auto;}
    .field-handle{width:18px;height:34px;}
    .field-handle.c{width:20px;height:20px;border-radius:50%;}
    .field-chip{font-size:12px;padding:5px 9px;}
    .font-picker{display:block;width:100%;}
    .font-picker-btn{min-width:0;max-width:none;width:100%;}
    .font-picker-list{left:0;right:0;min-width:0;}
  }`;

export const CONTROLES_GENERADOR = String.raw`  <div id="appContent">

    <div class="panel">
      <div class="panel-head">
        <h2>1. Plantillas de certificado</h2>
        <button class="btn outline small" data-collapse-toggle="secPlantillasBody">Minimizar</button>
      </div>
      <div class="panel-body" id="secPlantillasBody">
      <div class="row" style="align-items:center;">
        <span class="hint">Guarda tantos formatos de certificado como necesites.</span>
        <button type="button" class="ayuda-btn" data-ayuda-texto="Uno por diplomado o curso, por ejemplo. Cada plantilla tiene su propio diseño, campos y márgenes.">?</button>
      </div>
      <div class="row">
        <select id="selPlantilla" style="min-width:220px;"></select>
        <input type="text" id="nombrePlantilla" placeholder="Nombre de esta plantilla" style="min-width:200px;">
        <button class="btn outline" id="btnNuevaPlantilla">+ Nueva plantilla</button>
        <button class="btn outline" id="btnDuplicarPlantilla">Duplicar</button>
        <button class="btn danger" id="btnEliminarPlantilla">Eliminar</button>
      </div>

      <div class="row" style="align-items:center;margin:12px 0 4px;">
        <b style="font-size:13px;">Carpetas</b>
        <button type="button" class="ayuda-btn" data-ayuda-texto="Agrupa varias plantillas que van juntas, por ejemplo los 8 certificados de un mismo diplomado. Arrastra una plantilla a la carpeta donde quieras que quede, o suéltala entre dos para ubicarla ahí — ese es el orden en que sale en el selector, en la Matriz y en el ZIP de cada estudiante. También puedes arrastrar un archivo PNG, JPG o PDF directo desde tu computadora y soltarlo encima de una carpeta ya creada: se crea la plantilla ahí mismo, sin tener que escribir antes el nombre de la carpeta. Haz clic en una plantilla para abrirla y editarla, y en la cabecera de una carpeta para plegarla. Con ✎ le cambias el nombre (o la ruta completa, para moverla) y con 🗑 la eliminas: las plantillas que tenía NO se borran, sólo quedan sin carpeta. Con 📁+ creas una subcarpeta dentro. También puedes escribir rutas con / para anidar, por ejemplo «Diplomados/Cohorte 2026/Módulo 1». Marca la casilla de una o varias fichas para borrarlas de verdad de una sola vez con «Eliminar seleccionadas».">?</button>
        <span style="flex:1;"></span>
        <input type="text" id="carpetaPlantilla" list="listaCarpetas" placeholder="Carpeta de la plantilla abierta (usa / para anidar)" style="min-width:220px;">
        <datalist id="listaCarpetas"></datalist>
        <span class="campo-orden" id="ordenCarpetaWrap" title="Orden dentro de la carpeta">
          <button class="mini" type="button" id="btnSubirCarpeta">&#9650;</button>
          <button class="mini" type="button" id="btnBajarCarpeta">&#9660;</button>
        </span>
        <input type="text" id="nuevaCarpetaNombre" list="listaCarpetas" placeholder="Carpeta nueva o existente (usa / para anidar)" style="max-width:220px;">
        <button class="btn outline small" id="btnNuevaCarpeta">+ Crear vacía</button>
      </div>
      <div class="row" style="align-items:center;margin:0 0 6px;">
        <span class="hint">Con el nombre de arriba puesto, subir diseños los crea directo como plantillas ahí dentro (el nombre de cada archivo es el nombre de la plantilla):</span>
        <button class="btn outline small" id="btnSubirDisenos">📤 Subir diseños</button>
        <input type="file" id="inputSubirDisenos" accept="image/png,image/jpeg,application/pdf" multiple hidden>
        <button class="btn outline small" id="btnSubirCarpetaCompleta">📁 Subir carpeta de la computadora</button>
        <input type="file" id="inputSubirCarpetaCompleta" webkitdirectory directory multiple hidden>
        <button type="button" class="ayuda-btn" data-ayuda-texto="«Subir diseños» crea una plantilla por cada PNG, JPG o PDF que elijas, todas dentro de la carpeta que hayas escrito arriba (si no existe, se crea). «Subir carpeta de la computadora» hace lo mismo pero de una vez con todos los archivos de una carpeta de tu equipo, usando el nombre de esa carpeta como carpeta aquí. Cada plantilla nueva sale con los campos por defecto; usa después «Copiar a TODA una carpeta» para aplicarles a todas el diseño de campos que quieras.">?</button>
      </div>
      <div id="carpetasSeleccionBar" class="row" style="display:none;align-items:center;background:var(--peligro-suave);
        border:1px solid var(--peligro);border-radius:8px;padding:8px 12px;margin-bottom:8px;"></div>
      <div id="carpetasMsg" class="hint" style="min-height:18px;margin-bottom:4px;"></div>
      <div class="carpetas-board" id="carpetasBoard"></div>

      <div class="row" style="background:var(--ojo-suave);border:1px solid var(--gold);border-radius:8px;padding:10px 12px;align-items:center;">
        <label class="hint" style="min-width:150px;">Copiar a TODA una carpeta:</label>
        <select id="selCarpetaDestinoMasivo" style="min-width:170px;"></select>
        <span class="hint">desde</span>
        <select id="selOrigenMasivo" style="flex:1;min-width:180px;"></select>
        <button class="btn gold" id="btnCopiarEstiloMasivo">Copiar a toda la carpeta</button>
        <button type="button" class="ayuda-btn" data-ayuda-texto="Aplica de una sola vez los mismos campos —textos, imágenes con su archivo, códigos QR, márgenes, tipografías y opacidades— de la plantilla elegida a TODAS las plantillas de la carpeta que selecciones, y las guarda de una vez. Útil recién creaste varias plantillas para un diplomado y quieres arrancarlas todas desde el mismo diseño. El fondo de cada certificado no se toca. Además te pregunta aparte si también quieres copiar los valores fijos de esa plantilla (por ejemplo una Fecha puesta a mano) a las demás, o si cada una debe conservar los suyos.">?</button>
      </div>

      <div class="row" style="background:var(--hundido);border:1px solid var(--border);border-radius:8px;padding:10px 12px;align-items:center;">
        <label class="hint" style="min-width:150px;">Copiar todos los campos de:</label>
        <select id="selCopiarEstilo" style="flex:1;min-width:180px;"></select>
        <button class="btn outline" id="btnCopiarEstilo">Copiar a esta plantilla</button>
        <button type="button" class="ayuda-btn" data-ayuda-texto="Trae los campos completos de la otra plantilla —textos, imágenes con su archivo y códigos QR— con sus posiciones, márgenes, tipografías y opacidades, y reemplaza los campos que haya aquí. El fondo de este certificado no se toca.">?</button>
      </div>

      <div class="row" style="align-items:center;">
        <span class="hint">Sube el diseño exportado de tu Canva (PDF, PNG o JPG).</span>
        <button type="button" class="ayuda-btn" data-ayuda-texto="Cada campo tiene un cuadro de márgenes (dos marcas doradas): arrastra la marca izquierda para fijar dónde empieza el texto y la derecha dónde termina. El tamaño de letra se ajusta solo para que el texto de cada estudiante quepa ahí, entre el máximo y el mínimo que definas.">?</button>
      </div>
      <div class="row">
        <input type="file" id="inputBg" accept="image/png,image/jpeg,application/pdf">
        <button class="btn outline" id="btnResetBg">Usar plantilla de ejemplo</button>
      </div>
      <div id="bgMsg"></div>
      <div class="lienzo-con-reglas">
        <div class="regla-esquina" id="btnLimpiarGuias" title="Quitar todas las guías">✕</div>
        <div class="regla regla-h" id="reglaH" title="Arrastra desde aquí para crear una guía vertical"></div>
        <div class="regla regla-v" id="reglaV" title="Arrastra desde aquí para crear una guía horizontal"></div>
        <div id="tplPreviewWrap">
          <img loading="lazy" decoding="async" id="tplImg" alt="Plantilla">
        </div>
      </div>
      <div class="row" style="align-items:center;margin:7px 0 0;">
        <span class="hint">Arrastra la etiqueta de un campo para moverlo, o sus marcas doradas para ajustar los márgenes. Con el campo elegido, <b>Supr</b> lo quita.</span>
        <button type="button" class="ayuda-btn" data-ayuda-texto="Reglas y guías: arrastra desde la regla de arriba o de la izquierda para soltar una guía; para quitarla, púlsala y dale a Supr, arrástrala de vuelta a la regla, o haz doble clic. Los campos se pegan a las guías al moverlos. La esquina ✕ las borra todas.

Capas: el orden de la lista de abajo es el orden de las capas — el primero se dibuja por delante y el último al fondo. Súbelo o bájalo con ▲▼ para decidir qué tapa a qué.">?</button>
      </div>

      <div class="row" style="margin-top:14px;">
        <input type="text" id="nuevoCampoNombre" placeholder="Nombre del nuevo campo (ej. Cédula)" style="flex:1;min-width:180px;">
        <select id="nuevoCampoTipo">
          <option value="texto">Texto</option>
          <option value="qr">Código QR</option>
          <option value="imagen">Imagen (PNG/JPG)</option>
        </select>
        <button class="btn outline" id="btnAgregarCampo">+ Agregar campo</button>
      </div>
      <div id="fieldSettings"></div>

      <div class="row" style="margin-top:10px;">
        <button class="btn teal" id="btnGuardarPlantilla">Guardar plantilla</button>
        <button class="btn outline" id="btnVistaPrevia">Vista previa (con XXXX)</button>
        <button class="btn outline" id="btnVistaPreviaTodas">Vista previa de todas mis plantillas</button>
        <span id="tplMsg" class="hint"></span>
      </div>
      <div id="previewSingleWrap" style="display:none;margin-top:10px;">
        <img loading="lazy" decoding="async" id="previewSingleImg" style="max-width:500px;width:100%;border:1px solid var(--border);border-radius:6px;">
        <div><button class="btn outline small" id="btnCerrarPreview" style="margin-top:6px;">Cerrar vista previa</button></div>
      </div>
      <div id="galeriaPlantillasWrap"></div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>2. Importar graduados</h2>
        <button class="btn outline small" data-collapse-toggle="secImportarBody">Minimizar</button>
      </div>
      <div class="panel-body" id="secImportarBody">
      <p class="hint">Tres formas de traer los datos — el nombre de cada columna debe coincidir con el nombre de un campo de alguna de tus plantillas (sin importar mayúsculas/minúsculas).</p>
      <div class="row">
        <button class="btn outline" id="btnDescargarExcel">Descargar Excel en blanco para llenar</button>
        <span class="hint">Trae las columnas de los campos activos de tus plantillas (si agregas campos nuevos, descárgalo de nuevo).</span>
      </div>
      <div class="row">
        <label class="hint" style="min-width:170px;">1. Subir archivo Excel (.xlsx)</label>
        <input type="file" id="inputXlsx" accept=".xlsx,.xls">
      </div>
      <label class="hint">2. Pegar datos (CSV o TSV, copiados directo de tu Google Sheet)</label>
      <textarea id="pasteData" placeholder="Nombre	Apellido	Curso	Fecha	Horas
Juan	Pérez	Diplomado en Gestión de Proyectos	2026-07-15	120"></textarea>
      <div class="row">
        <input type="text" id="sheetUrl" placeholder="3. o URL de Google Sheet publicado como CSV" style="flex:1;min-width:220px;">
        <button class="btn outline" id="btnImportarUrl">Importar desde URL</button>
        <button class="btn outline" id="btnParsePaste">Previsualizar datos pegados</button>
      </div>
      <div class="row">
        <label class="hint">Entidad emisora:</label>
        <input type="text" id="entidadEmisora" value="CEM">
      </div>
      <div id="previewTableWrap"></div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>3. Asignar certificados a cada estudiante</h2>
        <button class="btn outline small" data-collapse-toggle="secAsignarBody">Minimizar</button>
      </div>
      <div class="panel-body" id="secAsignarBody">
      <p class="hint">Primero elige qué plantillas participan en esta generación; luego marca qué aplican a todos (encabezado de cada columna) y ajusta casos puntuales fila por fila — por ejemplo, un estudiante que además de su diplomado principal se graduó de otro curso extra.</p>
      <div id="matrixTplSelector"></div>
      <div id="matrixWrap"><p class="hint">Importa graduados arriba para poder asignarles certificados.</p></div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>4. Generar y registrar</h2>
        <button class="btn outline small" data-collapse-toggle="secGenerarBody">Minimizar</button>
      </div>
      <div class="panel-body" id="secGenerarBody">
      <div class="row" style="align-items:center;">
        <button class="btn gold" id="btnGenerar" disabled>Generar vista previa</button>
        <button type="button" class="ayuda-btn" data-ayuda-texto="Genera vista previa arma los PDF y los muestra abajo, pero no guarda nada todavía — puedes revisarlos con calma. Cuando estén bien, pulsa Registrar certificados en ese mismo lote para que queden oficiales y sus códigos QR empiecen a verificar. Si algo está mal, descarta la vista previa y vuelve a generar.">?</button>
      </div>
      <progress id="progressBar" value="0" max="1" style="display:none;"></progress>
      <div id="genMsg"></div>
      <p class="hint" style="margin-top:14px;">Historial de generaciones (todas quedan aquí, listas para descargar, hasta que recargues la página):</p>
      <div id="generationHistoryWrap"><p class="hint">Todavía no has generado ningún lote de certificados.</p></div>
      </div>
    </div>

    <!-- Grupos de graduación.
         ═══════════════════════════════════════════════════════════════════
         La lista de emitidos agrupa POR DÍA, y eso funcionaba mientras cada
         promoción se generaba un día distinto. En cuanto se registran cuatro
         grupos la misma tarde, los cuatro caen en un solo montón de
         doscientos y pico y no hay forma de bajar uno solo.

         Aquí cada grupo tiene nombre y su propio botón. Y va por su propia
         puerta —list_cert_lotes— porque la lista de emitidos trae sólo los
         últimos 300: registrar una promoción grande empujaba fuera justo a
         los grupos viejos que uno quiere poder volver a descargar. -->
    <div class="panel">
      <div class="panel-head">
        <h2>Grupos de graduación</h2>
        <button class="btn outline small" data-collapse-toggle="secLotesBody">Minimizar</button>
      </div>
      <div class="panel-body" id="secLotesBody">
        <p class="hint">Cada promoción, con su nombre. Descargar un grupo lo vuelve a
          dibujar entero con la fecha que tenía cuando se emitió, aunque la plantilla
          haya cambiado desde entonces.</p>
        ${/* La fila de un grupo lleva cuatro botones largos («⬇ Un solo PDF ·
              81 págs.») que en una pantalla estrecha no caben: la tabla se
              salía del recuadro y empujaba la página. Que ruede ella sola
              dentro de su caja, y no la página entera. */''}
        <div id="listaLotesWrap" style="overflow-x:auto;">Cargando…</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <h2>Certificados emitidos</h2>
        <button class="btn outline small" data-collapse-toggle="secEmitidosBody">Minimizar</button>
      </div>
      <div class="panel-body" id="secEmitidosBody">
      <div class="row" style="align-items:center;">
        <input type="text" id="buscarEmitidos" placeholder="Buscar por cualquier dato (nombre, cédula, curso…)" style="flex:1;">
        <button class="btn outline" id="btnDescargarFiltrados">⬇ Descargar los que se ven</button>
        <button class="btn outline" id="btnRefrescarLista">Refrescar</button>
        <button class="btn danger" id="btnBorrarHistorial">Borrar todo el historial</button>
        <button type="button" class="ayuda-btn" data-ayuda-texto="Marca uno o varios certificados con su casilla para editar sus datos (por ejemplo, corregir una cédula mal escrita) y volver a descargarlos listos para imprimir. Editar NO borra el certificado original: lo marca como «reemplazado» y crea uno nuevo con los datos corregidos y su propio código QR. También puedes descargar de nuevo sin cambiar nada, uno o varios a la vez.">?</button>
      </div>
      <div id="emitidosSeleccionBar" class="row" style="display:none;align-items:center;background:var(--hundido);
        border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:8px;"></div>
      <div id="listaEmitidosWrap">Cargando…</div>
      </div>
    </div>

  </div>`;

/* ── El día como criterio de agrupación ──────────────────────────────────────
   Fuera del montaje para poder probarlas sueltas: con fechas inventadas se
   comprueba que una tanda de varios días se parte bien, algo que contra la base
   real no se puede ver porque todos los certificados emitidos hasta hoy salieron
   el mismo día. */

/** El día en la hora de quien mira, no en UTC: si no, un certificado emitido a
    las nueve de la noche en Caracas se agrupa bajo el día siguiente y no
    coincide con la hora que muestra su propia fila. */
export function claveDelDia(iso){
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** «jueves, 14 de agosto de 2026». Se lee de un vistazo, que es de lo que se
    trata cuando lo que buscas es «la tanda del jueves». */
export function diaEnLetras(clave, hoyRef = new Date()){
  const [a, m, d] = clave.split('-').map(Number);
  const fecha = new Date(a, m - 1, d);
  const hoy = new Date(hoyRef); hoy.setHours(0, 0, 0, 0);
  const dias = Math.round((hoy - fecha) / 86400000);
  const largo = fecha.toLocaleDateString('es-ES',
    { weekday:'long', day:'numeric', month:'long', year:'numeric' });
  /* En castellano el día de la semana va en minúscula, pero abre la línea, así
     que sólo se levanta su primera letra. `text-transform:capitalize` no sirve:
     pone mayúscula en cada palabra y deja «Viernes, 14 De Agosto De 2026». */
  const conMayuscula = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  if(dias === 0) return `Hoy · ${largo}`;
  if(dias === 1) return `Ayer · ${largo}`;
  return conMayuscula(largo);
}

/** Corta la lista cada vez que cambia el día. Da por hecho que viene ordenada
    del más nuevo al más viejo, que es como la devuelve la base; así no hace
    falta reordenar nada y el orden de la pantalla manda. */
export function agruparPorDia(certs){
  const dias = [];
  for(const c of certs){
    const clave = claveDelDia(c.created_at);
    if(!dias.length || dias[dias.length - 1].clave !== clave) dias.push({ clave, certs: [] });
    dias[dias.length - 1].certs.push(c);
  }
  return dias;
}

/**
 * Inyecta los controles del generador en `contenedor` y arranca el motor.
 *
 * @param {object}  opciones
 * @param {object}  opciones.supabase      cliente ya autenticado
 * @param {Element} opciones.contenedor    dónde dibujar los controles
 * @param {string}  opciones.rutaVerificar ruta relativa a la página pública de
 *                                         verificación. La usan los QR Y los
 *                                         enlaces «Ver» de la pantalla: decía
 *                                         «para los QR» y por eso los enlaces
 *                                         se quedaron con la ruta escrita a
 *                                         mano y rota desde el panel.
 */
export function montarGenerador({ supabase, contenedor, rutaVerificar = 'verificar.html' }) {
  if (!supabase) throw new Error('El generador necesita un cliente de Supabase.');
  const RUTA_VERIFICAR = rutaVerificar;

  /* La direccion de la pagina publica de un certificado.
     ═══════════════════════════════════════════════════════════════════════
     Existe porque este motor se monta desde DOS sitios: certificados/generar.html
     y plataforma/admin/certificados-plantillas.html. Cada uno pasa su propia
     `rutaVerificar` — y los QR ya la usaban.

     Los enlaces que pulsa una persona, no. Escribian «verificar.html» a pelo,
     que desde el panel resuelve a /plataforma/admin/verificar.html y da un 404.
     El QR del papel iba bien y el boton de la pantalla no, que es la clase de
     fallo que nadie relaciona con nada.

     Se resuelve contra location.href igual que el QR, asi que las dos puertas
     dan la misma direccion. */
  const urlDeVerificar = (id) =>
    new URL(RUTA_VERIFICAR, location.href).href + '?c=' + encodeURIComponent(id);

  // pdf.js se carga por <script> en la página; su worker se configura una vez.
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js';
  }

  if (contenedor && !contenedor.querySelector('#appContent')) {
    contenedor.insertAdjacentHTML('beforeend', CONTROLES_GENERADOR);
  }


  function escapeHtml(s){ return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function sanitizeName(s){ return String(s || '').trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'sin_nombre'; }
  /**
   * Compara nombres de columna sin importar mayúsculas/minúsculas NI tildes, para
   * que «Cédula», «cedula» y «CÉDULA» sean la misma columna en todos lados: al
   * importar el Excel, al armar la lista de variables para insertar y al
   * sustituirlas dentro de un texto compuesto. Sin esto, un campo escrito sin
   * tilde y otro con tilde generan dos columnas separadas con el mismo dato.
   */
  function normalizarNombreCampo(s){
    return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /** Botón "?" para generar dentro de HTML armado en JS (galerías, listas, etc.). */
  function ayuda(texto){
    return `<button type="button" class="ayuda-btn" data-ayuda-texto="${escapeHtml(texto)}">?</button>`;
  }

  /**
   * Un solo botón "?" abierto a la vez: los párrafos largos de explicación se
   * reemplazan por esto, y el texto sólo aparece si se pide. Funciona tanto
   * para los botones fijos del HTML como para los que arma renderChips/etc.
   */
  let ayudaAbierta = null;
  function cerrarAyuda(){ if(ayudaAbierta){ ayudaAbierta.pop.remove(); ayudaAbierta = null; } }
  document.addEventListener('click', e => {
    const btn = e.target.closest('.ayuda-btn');
    const mismoBotonQueYaEstaba = ayudaAbierta && btn === ayudaAbierta.btn;
    cerrarAyuda();
    if(!btn || mismoBotonQueYaEstaba) return;
    const pop = document.createElement('div');
    pop.className = 'ayuda-pop';
    pop.textContent = btn.dataset.ayudaTexto || '';
    document.body.appendChild(pop);
    const r = btn.getBoundingClientRect();
    const izq = Math.min(window.innerWidth - pop.offsetWidth - 12, Math.max(8, r.left));
    pop.style.left = (izq + window.scrollX) + 'px';
    pop.style.top = (r.bottom + window.scrollY + 6) + 'px';
    ayudaAbierta = { btn, pop };
  });
  document.addEventListener('keydown', e => { if(e.key === 'Escape') cerrarAyuda(); });
  document.addEventListener('scroll', cerrarAyuda, true);

  const FONT_OPTIONS = [
    { label: 'Georgia (serif)', value: 'Georgia, serif' },
    { label: "Times New Roman (serif)", value: "'Times New Roman', Times, serif" },
    { label: 'Arial (sans)', value: 'Arial, Helvetica, sans-serif' },
    // Serif elegantes
    { label: 'Playfair Display (elegante)', value: "'Playfair Display', serif" },
    { label: 'Cormorant Garamond (elegante)', value: "'Cormorant Garamond', serif" },
    { label: 'EB Garamond (clásica)', value: "'EB Garamond', serif" },
    { label: 'Merriweather (serif)', value: "'Merriweather', serif" },
    { label: 'Lora (serif)', value: "'Lora', serif" },
    { label: 'PT Serif (serif)', value: "'PT Serif', serif" },
    { label: 'Libre Baskerville (serif)', value: "'Libre Baskerville', serif" },
    { label: 'Roboto Slab (slab serif)', value: "'Roboto Slab', serif" },
    { label: 'Cinzel (títulos, mayúsculas)', value: "'Cinzel', serif" },
    { label: 'Marcellus (elegante)', value: "'Marcellus', serif" },
    // Góticas / blackletter
    { label: 'UnifrakturMaguntia (gótica/blackletter)', value: "'UnifrakturMaguntia', cursive" },
    { label: 'UnifrakturCook (gótica negrita)', value: "'UnifrakturCook', cursive" },
    { label: 'Pirata One (gótica decorativa)', value: "'Pirata One', cursive" },
    // Sans modernas
    { label: 'Montserrat (moderna)', value: "'Montserrat', sans-serif" },
    { label: 'Open Sans (moderna)', value: "'Open Sans', sans-serif" },
    { label: 'Lato (moderna)', value: "'Lato', sans-serif" },
    { label: 'Raleway (moderna)', value: "'Raleway', sans-serif" },
    { label: 'Poppins (moderna)', value: "'Poppins', sans-serif" },
    // Script / firma
    { label: 'Great Vibes (script/firma)', value: "'Great Vibes', cursive" },
    { label: 'Dancing Script (script)', value: "'Dancing Script', cursive" },
    { label: 'Pacifico (script)', value: "'Pacifico', cursive" },
    { label: 'Sacramento (script fino)', value: "'Sacramento', cursive" },
    { label: 'Alex Brush (firma)', value: "'Alex Brush', cursive" },
    { label: 'Allura (script elegante)', value: "'Allura', cursive" },
    { label: 'Parisienne (script)', value: "'Parisienne', cursive" },
  ];
  const GOOGLE_FONT_FAMILIES = [
    'Playfair Display','Cormorant Garamond','EB Garamond','Merriweather','Lora','PT Serif',
    'Libre Baskerville','Roboto Slab','Cinzel','Marcellus','Montserrat','Open Sans','Lato',
    'Raleway','Poppins','Great Vibes','Dancing Script','Pacifico','Sacramento','Alex Brush',
    'Allura','Parisienne','UnifrakturMaguntia','UnifrakturCook','Pirata One',
  ];
  function fontLabelFor(value){
    const found = FONT_OPTIONS.find(o => o.value === value);
    return found ? found.label : (value || 'Georgia (serif)');
  }
  document.addEventListener('click', () => {
    document.querySelectorAll('.font-picker-list').forEach(l => { l.style.display = 'none'; });
  });
  const fontsLoadedCache = new Set();
  async function ensureFontsLoadedForConfig(cfg){
    const toLoad = new Set();
    for(const f of cfg.fields){
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

  let templatesFull = [];  // [{ id, nombre, config }]
  let currentIdx = 0;
  let config = null;       // alias por referencia a templatesFull[currentIdx].config
  let rows = [];
  let assignment = [];     // assignment[rowIdx] = Set(templateIdx)
  let matrixTemplateSelection = new Set(); // qué índices de templatesFull participan en esta generación
  let issued = [];
  let issuedSeleccionados = new Set();  // ids (uuid, string) marcados en «Certificados emitidos»
  let dragging = null;     // { idx, role: 'left'|'right'|'top'|'bot'|'tl'|'tr'|'bl'|'br'|'move'|'point'|'imgW' }
  let campoSel = null;     // campo resaltado en la plantilla y en la lista
  let guiaSel  = null;     // { eje, i } — guía elegida con un clic; Supr la quita
  // Correcciones manuales de un certificado concreto, por si el ajuste automático
  // deja algo mal en un caso puntual: ajustesPorCert['fila:plantilla'] = { campo:{...} }
  let ajustesPorCert = {};
  let generationHistory = []; // [{ timestamp, results, zipUrl, okCount, totalCount, expanded }]

  document.querySelectorAll('[data-collapse-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const body = document.getElementById(btn.dataset.collapseToggle);
      const collapsed = body.classList.toggle('collapsed');
      btn.textContent = collapsed ? 'Mostrar' : 'Minimizar';
    });
  });

  // ---------- Plantilla por defecto (placeholder, hasta que suban su diseño real) ----------
  function defaultBackgroundDataUrl(){
    const c = document.createElement('canvas');
    c.width = 1600; c.height = 1131;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,c.width,c.height);
    ctx.strokeStyle = '#132743'; ctx.lineWidth = 14; ctx.strokeRect(30,30,c.width-60,c.height-60);
    ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 4; ctx.strokeRect(55,55,c.width-110,c.height-110);
    ctx.fillStyle = '#132743'; ctx.textAlign = 'center';
    ctx.font = 'bold 30px Georgia, serif'; ctx.fillText('CEM', c.width/2, 140);
    ctx.font = 'bold 56px Georgia, serif'; ctx.fillText('CERTIFICADO DE GRADUACIÓN', c.width/2, 250);
    ctx.font = '22px Georgia, serif'; ctx.fillStyle = '#555';
    ctx.fillText('Se otorga el presente certificado a', c.width/2, 420);
    ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(c.width*0.25, 640); ctx.lineTo(c.width*0.75, 640); ctx.stroke();
    return c.toDataURL('image/png');
  }

  function defaultConfig(){
    return {
      background: defaultBackgroundDataUrl(),
      bgWidth: 1600, bgHeight: 1131,
      fields: [
        { nombre:'Nombre',    tipo:'texto', activo:true,  leftPct:25, rightPct:75, yPct:44, maxFontSize:48, minFontSize:22, color:'#132743', align:'center', bold:true,  fontFamily:'Georgia, serif', opacity:1, formato:'ninguno' },
        { nombre:'Apellido',  tipo:'texto', activo:true,  leftPct:25, rightPct:75, yPct:52, maxFontSize:48, minFontSize:22, color:'#132743', align:'center', bold:true,  fontFamily:'Georgia, serif', opacity:1, formato:'ninguno' },
        { nombre:'Curso',     tipo:'texto', activo:true,  leftPct:20, rightPct:80, yPct:61, maxFontSize:28, minFontSize:14, color:'#1b7f76', align:'center', bold:false, fontFamily:'Georgia, serif', opacity:1, formato:'ninguno' },
        { nombre:'Fecha',     tipo:'texto', activo:true,  leftPct:30, rightPct:70, yPct:71, maxFontSize:18, minFontSize:12, color:'#333333', align:'center', bold:false, fontFamily:'Georgia, serif', opacity:1, formato:'ninguno' },
        { nombre:'Horas',     tipo:'texto', activo:true,  leftPct:8,  rightPct:32, yPct:88, maxFontSize:14, minFontSize:10, color:'#333333', align:'left',   bold:false, fontFamily:'Georgia, serif', opacity:1, formato:'ninguno' },
        { nombre:'Cédula',    tipo:'texto', activo:false, leftPct:25, rightPct:75, yPct:94, maxFontSize:12, minFontSize:9,  color:'#666666', align:'center', bold:false, fontFamily:'Georgia, serif', opacity:1, formato:'cedula' },
        { nombre:'Código QR', tipo:'qr',    activo:true,  xPct:88, yPct:86, size:110, opacity:1 },
      ]
    };
  }
  /* La plantilla por defecto se crea sin cajas verticales; normalizarConfig las
     deriva de yPct y del tamaño máximo, así que el resultado no cambia. */

  /**
   * Pone al día una plantilla guardada antes de que existieran la opacidad, el
   * formato y las imágenes. No cambia nada de lo que ya estaba definido; sólo
   * rellena lo que falta, y a un campo llamado "Cédula" (o similar) le asigna el
   * formato con puntos, que es lo que se espera de él. Siempre se puede volver a
   * "Tal cual" desde el propio panel del campo.
   */
  function normalizarConfig(cfg){
    if(!cfg || !Array.isArray(cfg.fields)) return cfg;
    // guías de alineación: sólo ayudan a colocar, nunca se imprimen
    if(!cfg.guias || typeof cfg.guias !== 'object') cfg.guias = { v: [], h: [] };
    if(!Array.isArray(cfg.guias.v)) cfg.guias.v = [];
    if(!Array.isArray(cfg.guias.h)) cfg.guias.h = [];
    // valores fijos por plantilla: mismo diseño y mismo Excel, pero una casilla
    // (p.ej. la Fecha) distinta para todas las personas de ESTA plantilla en
    // concreto, sin tocar el Excel ni las demás plantillas que la copiaron.
    if(!cfg.overrides || typeof cfg.overrides !== 'object') cfg.overrides = {};
    // carpeta: agrupa varias plantillas que van juntas (p.ej. los certificados
    // de un mismo diplomado). Es sólo una etiqueta de texto, no una tabla aparte.
    if(typeof cfg.carpeta !== 'string') cfg.carpeta = '';
    // orden dentro de la carpeta: no es la posición en la lista de plantillas,
    // así que moverla no descoloca las asignaciones ya hechas (que apuntan por
    // índice) ni nada que dependa de esa lista.
    if(typeof cfg.orden !== 'number') cfg.orden = 0;
    const altoFondo = cfg.bgHeight || 1131;
    for(const f of cfg.fields){
      if(f.opacity === undefined) f.opacity = 1;
      if(f.tipo === 'texto'){
        if(f.formato === undefined){
          f.formato = /^\s*(c[eé]dula|documento|dni|c\.?i\.?)\s*$/i.test(String(f.nombre||''))
            ? 'cedula' : 'ninguno';
        }
        // Qué hacer cuando el texto no cabe ni al tamaño mínimo de letra:
        // 'ajustar' = seguir achicando la letra hasta que quepa en una sola línea
        // (nunca invade lo de arriba/abajo, pero puede salir muy chica);
        // 'abajo' = repartir en varias líneas que crecen desde el borde superior
        // de la caja hacia abajo (letra más legible, pero necesita espacio libre debajo).
        if(f.desborde !== 'ajustar' && f.desborde !== 'abajo') f.desborde = 'abajo';
        // letras sueltas con un color distinto al del resto (p.ej. las iniciales):
        // se guardan por posición dentro de la palabra, no por texto literal, así
        // sirven igual sin importar el nombre real de cada persona.
        if(!Array.isArray(f.resaltados)) f.resaltados = [];
        // texto con una parte fija y variables incrustadas del Excel, p.ej.
        // "Titular de la cédula {{Cedula}} quien...": reemplaza al valor fijo
        // y a la columna del Excel cuando está activado.
        if(f.usarPlantillaTexto === undefined) f.usarPlantillaTexto = false;
        if(typeof f.plantillaTexto !== 'string') f.plantillaTexto = '';
        // Reglillas de arriba y abajo: antes el campo era una sola línea y el
        // texto crecía hacia los lados. Con una caja, el alto y el centro
        // quedan fijos y todas las palabras se alinean igual.
        if(f.topPct === undefined || f.botPct === undefined){
          const altoCaja = ((f.maxFontSize || 32) * 1.6 / altoFondo) * 100;
          const centro = f.yPct ?? 50;
          f.topPct = Math.max(0, +(centro - altoCaja/2).toFixed(1));
          f.botPct = Math.min(100, +(centro + altoCaja/2).toFixed(1));
        }
      }
      if(f.tipo === 'imagen'){
        if(f.widthPct === undefined) f.widthPct = 18;
        if(f.xPct === undefined) f.xPct = 50;
        if(f.yPct === undefined) f.yPct = 50;
      }
    }
    return cfg;
  }

  /** Caja vertical de un campo de texto (arriba/abajo en %). */
  function cajaV(f){
    if(typeof f.topPct === 'number' && typeof f.botPct === 'number'){
      return { topPct: f.topPct, botPct: f.botPct };
    }
    const c = f.yPct ?? 50;
    return { topPct: c - 3, botPct: c + 3 };
  }
  /** Centro vertical: es lo que mantiene alineadas todas las palabras. */
  function centroV(f){ const v = cajaV(f); return (v.topPct + v.botPct) / 2; }

  /** Opacidad de un campo, tolerando plantillas guardadas antes de existir esta opción. */
  function opacityOf(f){
    const v = Number(f.opacity);
    return (isFinite(v) && v >= 0 && v <= 1) ? v : 1;
  }

  /**
   * Cédula al estilo 12.345.678, conservando el prefijo de nacionalidad
   * (V-12345678 → V-12.345.678). Un documento sin dígitos se respeta tal cual.
   */
  function formatearCedula(valor){
    const v = String(valor ?? '').trim();
    if(!v) return '';
    const prefijo = (v.match(/^[^0-9]*/) || [''])[0].trim();
    const digitos = v.replace(/[^0-9]/g, '');
    if(!digitos) return v;
    const conPuntos = digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return prefijo ? `${prefijo}${/[-\s]$/.test(prefijo) ? '' : '-'}${conPuntos}`.replace(/--/g,'-') : conPuntos;
  }

  /** Aplica el formato elegido para el campo al valor que viene del Excel. */
  function aplicarFormato(valor, formato){
    if(formato === 'cedula') return formatearCedula(valor);
    if(formato === 'mayusculas') return String(valor ?? '').toUpperCase();
    return String(valor ?? '');
  }

  function boxOf(f){
    if(typeof f.leftPct === 'number' && typeof f.rightPct === 'number') return { leftPct: f.leftPct, rightPct: f.rightPct };
    const center = typeof f.xPct === 'number' ? f.xPct : 50;
    return { leftPct: Math.max(0, center - 25), rightPct: Math.min(100, center + 25) };
  }

  // ---------- Arranque ----------
  async function init(){
    try {
      await loadTemplates();
      await loadIssued();
      await loadLotes();
    } catch (e) {
      /* Si el arranque falla, la pantalla no puede quedarse a medias fingiendo
         que está vacía: eso fue lo que hizo creer que se habían borrado 27
         diseños. Se dice qué pasó, se deja claro que nada se perdió y se ofrece
         el único paso que suele resolverlo. */
      contenedor.insertAdjacentHTML('afterbegin', `
        <div style="background:var(--peligro-suave);border:1px solid var(--peligro);border-left:4px solid var(--peligro);
                    border-radius:10px;padding:16px 18px;margin-bottom:16px;">
          <b style="color:#a5281d;">No se pudo cargar tu biblioteca de plantillas</b>
          <p style="margin:6px 0 0;white-space:pre-line;color:#5b2b26;line-height:1.55;">${
            escapeHtml(e.message || String(e))}</p>
          <button class="btn" style="margin-top:12px" onclick="location.reload()">Volver a intentar</button>
        </div>`);
      throw e;
    }
  }

  /* ============ el fondo va al almacenamiento, no dentro del JSON ============
     Cada plantilla guardaba su imagen de fondo incrustada como texto (base64)
     dentro de la configuración. Con 27 plantillas eso eran 15 MB que viajaban
     completos cada vez que se abría la pantalla, y crecía con cada plantilla
     nueva. Ahora la imagen se sube una vez al almacenamiento de archivos y en
     la configuración queda sólo su dirección: unos cien caracteres.

     Las plantillas viejas siguen funcionando tal cual — si el fondo todavía
     viene incrustado se dibuja igual — y se van pasando al almacenamiento a
     medida que se guardan. */
  const BUCKET_FONDOS = 'cem-assets';

  function esFondoIncrustado(v){ return typeof v === 'string' && v.startsWith('data:'); }

  /** Convierte una data URL en Blob sin pasar por fetch (funciona sin red). */
  function dataUrlABlob(dataUrl){
    const [cabecera, datos] = dataUrl.split(',');
    const tipo = (cabecera.match(/data:([^;]+)/) || [, 'image/png'])[1];
    const bin = atob(datos);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: tipo });
  }

  /**
   * Si la configuración trae el fondo incrustado, lo sube y lo reemplaza por
   * su dirección. Si algo falla, se deja como estaba: perder el diseño por no
   * poder subir una imagen sería mucho peor que seguir guardándolo incrustado.
   */
  async function externalizarFondo(cfg){
    if (!esFondoIncrustado(cfg?.background)) return cfg;
    try {
      const blob = dataUrlABlob(cfg.background);
      const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
      const ruta = `fondos/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET_FONDOS)
        .upload(ruta, blob, { contentType: blob.type, upsert: false });
      if (error) throw error;
      const { data } = supabase.storage.from(BUCKET_FONDOS).getPublicUrl(ruta);
      if (!data?.publicUrl) throw new Error('sin URL pública');
      cfg.background = data.publicUrl;
    } catch (e) {
      console.warn('No se pudo subir el fondo al almacenamiento; se guarda incrustado.', e);
    }
    return cfg;
  }

  // ---------- Biblioteca de plantillas ----------
  async function loadTemplates(){
    const { data, error } = await supabase.rpc('list_cert_templates_light');

    /* "No pude cargar la lista" y "no hay ninguna plantilla" son cosas
       distintas y antes se trataban igual: ante un error, la pantalla sembraba
       una plantilla genérica. El resultado era el peor posible — quien tenía 27
       diseños guardados entraba y veía uno solo, recién creado, como si se
       hubieran borrado todos. (No se borraban: sólo no se listaban.)
       Ante un error se avisa y no se escribe NADA. */
    if(error){
      throw new Error('No se pudieron cargar tus plantillas: ' + (error.message || error.code) +
        '\n\nTus diseños NO se han borrado: sólo no se pudieron leer. ' +
        'Lo más habitual es que la sesión haya caducado — vuelve a entrar y recarga.');
    }

    if(!data.length){
      const cfg = normalizarConfig(defaultConfig());
      await externalizarFondo(cfg);
      const { data: saved, error: eSem } = await supabase.rpc('save_cert_template',
        { p_id: null, p_nombre: 'Certificado CEM (genérico)', p_config: cfg });
      if(eSem || !saved) throw new Error('No se pudo crear la primera plantilla: ' + (eSem?.message || ''));
      templatesFull = [{ id: saved.id, nombre: saved.nombre, config: cfg }];
    } else {
      templatesFull = await Promise.all(data.map(async t => {
        const { data: full } = await supabase.rpc('get_cert_template', { p_id: t.id });
        const row = Array.isArray(full) ? full[0] : full;
        return { id: t.id, nombre: t.nombre,
                 config: normalizarConfig((row && row.config && row.config.background) ? row.config : defaultConfig()) };
      }));
    }
    /* Las carpetas creadas a mano y todavía vacías. Se piden aparte porque no
       cuelgan de ninguna plantilla; si algo falla al leerlas se sigue adelante
       sin ellas, que es peor pero no impide trabajar. */
    const { data: vacias } = await supabase.rpc('list_cert_carpetas');
    carpetasVacias = new Set((vacias || []).map(normalizarRutaCarpeta).filter(Boolean));

    currentIdx = 0;
    config = templatesFull[currentIdx].config;
    matrixTemplateSelection = new Set(templatesFull.map((_, i) => i));
    renderTemplateSelector();
    renderTemplatePreview();
    renderMatrixTplSelector();
  }

  /**
   * Carpetas dentro de carpetas: una "carpeta" es sólo texto, y "/" separa
   * niveles ("Diplomados/Cohorte 2026/Módulo 1"). normalizarRutaCarpeta limpia
   * espacios sueltos y barras dobles para que esa ruta sea siempre la misma
   * clave, la escriba quien la escriba a mano o venga de una carpeta real del
   * sistema de archivos.
   */
  function normalizarRutaCarpeta(ruta){
    return String(ruta ?? '').split('/').map(s => s.trim()).filter(Boolean).join('/');
  }

  /**
   * Si `ruta` es exactamente `desde` o vive dentro de esa carpeta, la traslada
   * a `hacia` (conservando lo que tuviera debajo). Si `hacia` es '' y `ruta`
   * era una subcarpeta de `desde`, la sube un nivel en vez de dejarla huérfana
   * (p.ej. borrar "A" deja "A/B" convertida en sólo "B", no la manda a ciegas
   * a "Sin carpeta"). Cualquier otra ruta que no toque `desde` sale intacta.
   * La usan tanto renombrar/mover como eliminar una carpeta.
   */
  function trasladarRuta(ruta, desde, hacia){
    if(ruta === desde) return hacia;
    if(ruta.startsWith(desde + '/')) return hacia ? hacia + ruta.slice(desde.length) : ruta.slice(desde.length + 1);
    return ruta;
  }

  /**
   * Agrupa una lista de plantillas por carpeta (ruta completa exacta, tal cual
   * "Diplomados/2026"). Las que no tienen carpeta van primero, sueltas (así
   * nadie que no use esta función nota ningún cambio); las carpetas van
   * después, en orden alfabético. Para pintar el árbol de carpetas dentro de
   * carpetas ver construirArbolCarpetas(), que arma esto en niveles.
   * `excluirIdx` se usa en el selector de "copiar estilos", que no debe
   * ofrecerse a sí mismo como origen.
   */
  function agruparPorCarpeta(lista, excluirIdx){
    const porCarpeta = new Map();
    const sinCarpeta = [];
    lista.forEach((t, i) => {
      if(i === excluirIdx) return;
      const c = normalizarRutaCarpeta(t.config.carpeta);
      if(!c){ sinCarpeta.push({ t, i }); return; }
      if(!porCarpeta.has(c)) porCarpeta.set(c, []);
      porCarpeta.get(c).push({ t, i });
    });
    // dentro de cada carpeta manda el "orden" que se fija con las flechitas
    // ▲▼; con empates (el caso normal si nunca se han movido) se respeta el
    // orden en que se fueron creando, porque sort() es estable
    const ordenar = arr => arr.slice().sort((a, b) => (a.t.config.orden || 0) - (b.t.config.orden || 0));
    const grupos = [];
    if(sinCarpeta.length) grupos.push({ carpeta: '', items: ordenar(sinCarpeta) });
    [...porCarpeta.keys()].sort((a, b) => a.localeCompare(b, 'es')).forEach(c => grupos.push({ carpeta: c, items: ordenar(porCarpeta.get(c)) }));
    return grupos;
  }

  /**
   * Rutas de carpeta ya usadas, para el autocompletar: incluye tanto las
   * rutas completas ("Diplomados/2026") como cada nivel intermedio
   * ("Diplomados" sola), para poder elegir o escribir un nivel padre aunque
   * ninguna plantilla viva ahí directamente.
   */
  function carpetasExistentes(){
    const set = new Set();
    const registrar = ruta => {
      let acumulado = '';
      for(const seg of normalizarRutaCarpeta(ruta).split('/').filter(Boolean)){
        acumulado = acumulado ? `${acumulado}/${seg}` : seg;
        set.add(acumulado);
      }
    };
    for(const t of templatesFull) registrar(t.config.carpeta);
    for(const c of carpetasVacias) registrar(c);
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
  }

  /** Texto legible de una ruta de carpeta para mostrar en selectores y encabezados. */
  function etiquetaCarpeta(ruta){
    return ruta.split('/').join(' › ');
  }

  /** Próximo valor de "orden" para que una plantilla se sume al final de esa carpeta. */
  function siguienteOrdenEnCarpeta(carpeta){
    const c = (carpeta || '').trim();
    if(!c) return 0;
    const ordenes = templatesFull.filter(t => (t.config.carpeta || '').trim() === c).map(t => t.config.orden || 0);
    return ordenes.length ? Math.max(...ordenes) + 1 : 0;
  }

  /**
   * Pone la plantilla `idx` en la carpeta `carpetaDestino`, en la posición
   * `posInsercion` (0 = primero de esa carpeta; un número muy grande = al
   * final). No toca la posición real de la plantilla en templatesFull —eso
   * rompería las referencias por índice de assignment/matrixTemplateSelection/
   * ajustesPorCert— sino sólo el "orden" de todas las que comparten carpeta.
   * Sirve tanto para las flechitas ▲▼ como para arrastrar y soltar.
   */
  function moverAPosicionEnCarpeta(idx, carpetaDestino, posInsercion){
    const carpeta = (carpetaDestino || '').trim();
    // La carpeta de la que sale: sus hermanas también cambian de orden al
    // quedarse sin ella, así que hay que guardarlas igual.
    const carpetaOrigen = (templatesFull[idx].config.carpeta || '').trim();
    const tocadas = new Set([idx]);
    (agruparPorCarpeta(templatesFull).find(g => g.carpeta === carpetaOrigen)?.items || [])
      .forEach(x => tocadas.add(x.i));

    templatesFull[idx].config.carpeta = carpeta;
    const grupo = agruparPorCarpeta(templatesFull).find(g => g.carpeta === carpeta)?.items || [];
    const sinElMovido = grupo.filter(x => x.i !== idx);
    const pos = Math.max(0, Math.min(posInsercion, sinElMovido.length));
    sinElMovido.splice(pos, 0, { t: templatesFull[idx], i: idx });
    sinElMovido.forEach((x, k) => { x.t.config.orden = k; tocadas.add(x.i); });

    return [...tocadas];   // a quién hay que guardar
  }

  /** Mueve la plantilla `idx` un lugar antes (dir=-1) o después (dir=+1) dentro de su propia carpeta. */
  function moverEnCarpeta(idx, dir){
    const carpeta = (templatesFull[idx].config.carpeta || '').trim();
    if(!carpeta) return null;
    const grupo = agruparPorCarpeta(templatesFull).find(g => g.carpeta === carpeta)?.items;
    if(!grupo) return null;
    const pos = grupo.findIndex(x => x.i === idx);
    const destino = pos + dir;
    if(pos < 0 || destino < 0 || destino >= grupo.length) return null;
    return moverAPosicionEnCarpeta(idx, carpeta, destino);
  }

  /* Carpetas creadas a mano y todavía sin ninguna plantilla dentro.
     Una carpeta con plantillas se deduce del campo "carpeta" de cada una; una
     vacía no tendría dónde existir, así que se guarda su ruta aparte. Antes
     vivía sólo en la memoria de la pestaña: al recargar, la carpeta recién
     creada desaparecía. */
  let carpetasVacias = new Set();

  /* ═══════════ guardar lo que se mueve entre carpetas ═══════════
     Arrastrar una plantilla a otra carpeta, renombrar una carpeta o eliminarla
     cambiaban `templatesFull` en memoria y no llegaban a tocar el servidor. Al
     recargar, todo volvía a como estaba: la plantilla a su carpeta vieja y la
     carpeta nueva, borrada. */

  /* ============ preguntar antes de borrar (item 37) ============
     Los borrados del generador usaban el confirm() del navegador: una caja
     gris del sistema, con el título de la página encima y sin sitio para
     explicar bien qué se pierde. Este pregunta con la misma pinta que el
     resto del generador y deja destacar lo que no tiene vuelta atrás. */
  function preguntar({ titulo, cuerpo, aceptar = 'Sí, continuar', peligro = false }){
    return new Promise((resolver) => {
      const fondo = document.createElement('div');
      fondo.className = 'modal-fondo';
      fondo.innerHTML = `<div class="modal-caja" style="max-width:520px">
        <div class="modal-cab"><b>${escapeHtml(titulo)}</b></div>
        <div class="modal-cuerpo">
          <div style="line-height:1.6">${cuerpo}</div>
          <div class="row" style="margin-top:16px;justify-content:flex-end">
            <button class="btn outline small" data-no>Cancelar</button>
            <button class="btn ${peligro ? 'danger' : 'teal'} small" data-si>${escapeHtml(aceptar)}</button>
          </div>
        </div></div>`;
      document.body.appendChild(fondo);
      const cerrar = (r) => { fondo.remove(); document.removeEventListener('keydown', porTecla); resolver(r); };
      const porTecla = (e) => { if (e.key === 'Escape') cerrar(false); };
      fondo.querySelector('[data-no]').onclick = () => cerrar(false);
      fondo.querySelector('[data-si]').onclick = () => cerrar(true);
      fondo.addEventListener('click', (e) => { if (e.target === fondo) cerrar(false); });
      document.addEventListener('keydown', porTecla);
      fondo.querySelector('[data-si]').focus();
    });
  }

  /** Avisa arriba del tablero mientras se guarda, y cuando termina. */
  function avisoCarpetas(texto, error){
    const el = document.getElementById('carpetasMsg');
    if(!el) return;
    el.textContent = texto;
    el.className = 'hint' + (error ? ' msg err' : '');
  }

  /**
   * Guarda en el servidor las plantillas indicadas (por índice) y la lista de
   * carpetas vacías. Se llama después de cada cambio de carpetas para que lo
   * que se ve sea lo que quedó guardado.
   */
  async function guardarCambioDeCarpetas(indices, queSeHizo){
    const aGuardar = [...new Set(indices)].filter(i => templatesFull[i]);
    avisoCarpetas(`Guardando ${queSeHizo}…`);
    const fallos = [];

    for(const i of aGuardar){
      const t = templatesFull[i];
      const { data, error } = await supabase.rpc('save_cert_template',
        { p_id: t.id, p_nombre: t.nombre, p_config: t.config });
      if(error) fallos.push(`${t.nombre}: ${error.message}`);
      else if(data && data.id) t.id = data.id;
    }

    // Las carpetas que ya tienen plantillas no hace falta guardarlas aparte:
    // se deducen. Sólo se manda la lista de las que quedaron vacías.
    const conPlantillas = new Set(templatesFull
      .map(t => normalizarRutaCarpeta(t.config.carpeta)).filter(Boolean));
    const vaciasDeVerdad = [...carpetasVacias]
      .filter(c => c && ![...conPlantillas].some(p => p === c || p.startsWith(c + '/')));
    const { error: eC } = await supabase.rpc('save_cert_carpetas', { p_rutas: vaciasDeVerdad });
    if(eC) fallos.push('carpetas vacías: ' + eC.message);

    if(fallos.length){
      avisoCarpetas('No se pudo guardar: ' + fallos.join(' · '), true);
      return false;
    }
    avisoCarpetas('Guardado ✓');
    setTimeout(() => avisoCarpetas(''), 2500);
    return true;
  }
  // Carpetas plegadas: por defecto todas abiertas; se recuerda cuáles se cerraron.
  let carpetasColapsadas = new Set();
  // Plantillas marcadas con la casilla de cada ficha, para borrarlas todas juntas.
  let plantillasSeleccionadas = new Set();

  /** Barra que aparece encima del tablero en cuanto hay al menos una ficha marcada. */
  function actualizarBarraSeleccionMasiva(){
    const bar = document.getElementById('carpetasSeleccionBar');
    const n = plantillasSeleccionadas.size;
    if(!n){ bar.style.display = 'none'; bar.innerHTML = ''; return; }
    bar.style.display = 'flex';
    bar.innerHTML = `<b>${n} plantilla(s) marcada(s)</b>
      <button class="btn danger small" id="btnEliminarSeleccionadas">Eliminar seleccionadas</button>
      <button class="btn outline small" id="btnCancelarSeleccion">Cancelar selección</button>`;
    document.getElementById('btnEliminarSeleccionadas').addEventListener('click', eliminarPlantillasSeleccionadas);
    document.getElementById('btnCancelarSeleccion').addEventListener('click', () => {
      plantillasSeleccionadas.clear();
      renderCarpetasBoard();
      actualizarBarraSeleccionMasiva();
    });
  }

  /**
   * Borra de verdad (a diferencia de eliminar una carpeta) todas las
   * plantillas marcadas con la casilla. Se procesan de mayor a menor índice
   * para que reindexTemplateIdxAfterDelete —pensada para un borrado a la
   * vez— siga siendo válida en cada paso.
   */
  async function eliminarPlantillasSeleccionadas(){
    const indices = [...plantillasSeleccionadas].sort((a, b) => b - a);
    if(!indices.length) return;
    if(indices.length >= templatesFull.length){
      alert('Debe quedar al menos una plantilla: deja al menos una sin marcar.');
      return;
    }
    const nombres = indices.slice().sort((a, b) => a - b).map(i => templatesFull[i].nombre);
    if(!await preguntar({
      titulo: `Eliminar ${indices.length} diseño(s)`,
      peligro: true,
      aceptar: `Sí, eliminar ${indices.length}`,
      cuerpo: `<p>Se borran por completo y <b>no se pueden recuperar</b>. Los certificados
        ya emitidos con ellos siguen valiendo; lo que se pierde es el diseño.</p>
        <ul style="margin:8px 0 0;padding-left:18px">${nombres.map(n =>
          `<li>${escapeHtml(n)}</li>`).join('')}</ul>`,
    })) return;

    const configAbierta = templatesFull[currentIdx]?.config;   // referencia, no índice: puede quedar invalidada
    for(const idx of indices){
      const t = templatesFull[idx];
      if(t.id) await supabase.rpc('delete_cert_template', { p_id: t.id });
      reindexTemplateIdxAfterDelete(idx);
      templatesFull.splice(idx, 1);
    }
    plantillasSeleccionadas.clear();
    const nuevoIdx = templatesFull.findIndex(t => t.config === configAbierta);
    currentIdx = nuevoIdx >= 0 ? nuevoIdx : 0;
    config = templatesFull[currentIdx].config;
    renderTemplateSelector();
    renderTemplatePreview();
    renderMatrixTplSelector();
    renderMatrix();
    actualizarBarraSeleccionMasiva();
  }

  /**
   * Arma el árbol de carpetas dentro de carpetas: parte de los grupos por ruta
   * exacta (agruparPorCarpeta) y de las carpetas creadas vacías, y va creando
   * un nodo por cada segmento de la ruta ("Diplomados/2026" crea el nodo
   * "Diplomados" con un hijo "2026" adentro), aunque ese nivel intermedio no
   * tenga ninguna plantilla puesta directamente ahí.
   */
  function construirArbolCarpetas(){
    const raiz = { nombre: '', ruta: '', items: [], hijos: new Map() };
    let sinCarpetaItems = [];
    function nodoEn(ruta){
      let actual = raiz, rutaParcial = '';
      for(const seg of ruta.split('/')){
        rutaParcial = rutaParcial ? `${rutaParcial}/${seg}` : seg;
        if(!actual.hijos.has(seg)) actual.hijos.set(seg, { nombre: seg, ruta: rutaParcial, items: [], hijos: new Map() });
        actual = actual.hijos.get(seg);
      }
      return actual;
    }
    for(const g of agruparPorCarpeta(templatesFull)){
      if(!g.carpeta){ sinCarpetaItems = g.items; continue; }
      nodoEn(g.carpeta).items = g.items;
    }
    for(const c of carpetasVacias) if(c) nodoEn(c);
    return { raiz, sinCarpetaItems };
  }

  /** Total de plantillas de una carpeta MÁS todas sus subcarpetas, para el número del encabezado. */
  function contarItemsSubarbol(nodo){
    let n = nodo.items.length;
    for(const hijo of nodo.hijos.values()) n += contarItemsSubarbol(hijo);
    return n;
  }

  function plantillaChipHtml(t, i){
    return `<div class="plantilla-chip ${i === currentIdx ? 'sel' : ''} ${plantillasSeleccionadas.has(i) ? 'marcada' : ''}" draggable="true"
        data-plantilla-chip="${i}" title="${escapeHtml(t.nombre)}">
        <input type="checkbox" class="plantilla-chip-check" data-plantilla-check="${i}" title="Marcar para eliminar en bloque"
          ${plantillasSeleccionadas.has(i) ? 'checked' : ''}>
        <img class="plantilla-chip-img" loading="lazy" crossorigin="anonymous"
             src="${t.config.background || ''}" alt="">
        <span class="plantilla-chip-nombre">${escapeHtml(t.nombre)}</span>
      </div>`;
  }

  /** Una carpeta del árbol: su propia ficha, con sus subcarpetas anidadas adentro antes de sus propias plantillas. */
  function carpetaNodoHtml(nodo, anidada){
    const colapsada = carpetasColapsadas.has(nodo.ruta);
    const hijos = [...nodo.hijos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    return `
      <div class="carpeta-card ${anidada ? 'carpeta-card--anidada' : ''}">
        <div class="carpeta-card-head" data-carpeta-toggle="${escapeHtml(nodo.ruta)}">
          <span>📁 ${escapeHtml(nodo.nombre)}</span>
          <span class="carpeta-card-acciones">
            <button type="button" class="carpeta-accion" data-carpeta-subcarpeta="${escapeHtml(nodo.ruta)}" title="Crear una subcarpeta aquí dentro">📁+</button>
            <button type="button" class="carpeta-accion" data-carpeta-renombrar="${escapeHtml(nodo.ruta)}" title="Renombrar o mover esta carpeta">✎</button>
            <button type="button" class="carpeta-accion" data-carpeta-eliminar="${escapeHtml(nodo.ruta)}" title="Eliminar esta carpeta">🗑</button>
            <span class="hint">${contarItemsSubarbol(nodo)}</span>
            <span class="carpeta-flecha">${colapsada ? '▸' : '▾'}</span>
          </span>
        </div>
        <div class="carpeta-card-contenido" style="${colapsada ? 'display:none;' : ''}">
          ${hijos.length ? `<div class="carpeta-subcarpetas">${hijos.map(h => carpetaNodoHtml(h, true)).join('')}</div>` : ''}
          <div class="carpeta-card-body" data-carpeta-drop="${escapeHtml(nodo.ruta)}">
            ${nodo.items.map(({ t, i }) => plantillaChipHtml(t, i)).join('')}
            ${!nodo.items.length && !hijos.length ? '<span class="hint">arrastra aquí una plantilla, o suelta un archivo de tu computadora</span>' : ''}
          </div>
        </div>
      </div>`;
  }

  /** Tablero visual de carpetas: cada una es una tarjeta plegable con miniaturas de los certificados, y puede tener subcarpetas adentro. */
  function renderCarpetasBoard(){
    const wrap = document.getElementById('carpetasBoard');
    if(!wrap) return;
    const { raiz, sinCarpetaItems } = construirArbolCarpetas();
    const colapsadaSinCarpeta = carpetasColapsadas.has('');
    const nodosRaiz = [...raiz.hijos.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    wrap.innerHTML = `
      <div class="carpeta-card sin-carpeta">
        <div class="carpeta-card-head" data-carpeta-toggle="">
          <span>Sin carpeta</span>
          <span class="carpeta-card-acciones">
            <span class="hint">${sinCarpetaItems.length}</span>
            <span class="carpeta-flecha">${colapsadaSinCarpeta ? '▸' : '▾'}</span>
          </span>
        </div>
        <div class="carpeta-card-body" data-carpeta-drop="" style="${colapsadaSinCarpeta ? 'display:none;' : ''}">
          ${sinCarpetaItems.map(({ t, i }) => plantillaChipHtml(t, i)).join('')}
          ${!sinCarpetaItems.length ? '<span class="hint">arrastra aquí una plantilla, o suelta un archivo de tu computadora</span>' : ''}
        </div>
      </div>
      ${nodosRaiz.map(n => carpetaNodoHtml(n, false)).join('')}
    `;

    wrap.querySelectorAll('[data-plantilla-check]').forEach(cb => {
      cb.addEventListener('click', e => e.stopPropagation());   // que no abra la plantilla ni arrastre
      cb.addEventListener('change', () => {
        const i = Number(cb.dataset.plantillaCheck);
        if(cb.checked) plantillasSeleccionadas.add(i); else plantillasSeleccionadas.delete(i);
        cb.closest('.plantilla-chip').classList.toggle('marcada', cb.checked);
        actualizarBarraSeleccionMasiva();
      });
    });

    wrap.querySelectorAll('[data-carpeta-toggle]').forEach(head => head.addEventListener('click', () => {
      const c = head.dataset.carpetaToggle;
      if(carpetasColapsadas.has(c)) carpetasColapsadas.delete(c); else carpetasColapsadas.add(c);
      renderCarpetasBoard();
    }));

    wrap.querySelectorAll('[data-carpeta-subcarpeta]').forEach(btn => btn.addEventListener('click', e => {
      e.stopPropagation();
      const padre = btn.dataset.carpetaSubcarpeta;
      const nombre = prompt(`Nombre de la nueva subcarpeta dentro de "${padre}":`);
      if(nombre === null) return;
      const limpio = normalizarRutaCarpeta(nombre);
      if(!limpio) return;
      carpetasVacias.add(`${padre}/${limpio}`);
      carpetasColapsadas.delete(padre);   // para que se vea de una vez la subcarpeta recién creada
      renderCarpetasBoard();
      guardarCambioDeCarpetas([], `la subcarpeta "${limpio}"`);
    }));
    wrap.querySelectorAll('[data-carpeta-renombrar]').forEach(btn => btn.addEventListener('click', async e => {
      e.stopPropagation();   // que no dispare también el plegado de la cabecera
      const actual = btn.dataset.carpetaRenombrar;
      const nuevo = prompt(`Nuevo nombre o ruta para "${actual}" (escribe algo con / para moverla a otro lugar del árbol):`, actual);
      if(nuevo === null) return;
      const limpio = normalizarRutaCarpeta(nuevo);
      if(!limpio || limpio === actual) return;
      if(carpetasExistentes().includes(limpio) && !await preguntar({
        titulo: 'Ya existe una carpeta con ese nombre',
        aceptar: 'Sí, fusionarlas',
        cuerpo: `<p>Ya hay una carpeta «<b>${escapeHtml(limpio)}</b>». Si sigues, todo lo que
          hay en «${escapeHtml(actual)}» —incluidas sus subcarpetas— pasa a vivir dentro de ella.</p>
          <p>Ningún diseño se borra: sólo cambian de sitio.</p>`,
      })) return;
      // Sólo se guardan las que de verdad cambian de ruta, no las 27.
      const tocadas = [];
      templatesFull.forEach((t, i) => {
        const antes = normalizarRutaCarpeta(t.config.carpeta);
        const despues = trasladarRuta(antes, actual, limpio);
        if(antes !== despues){ t.config.carpeta = despues; tocadas.push(i); }
      });
      carpetasVacias = new Set([...carpetasVacias].map(c => trasladarRuta(c, actual, limpio)).filter(Boolean));
      carpetasColapsadas = new Set([...carpetasColapsadas].map(c => trasladarRuta(c, actual, limpio)));
      renderCarpetasBoard(); renderTemplateSelector(); renderMatrixTplSelector(); renderMatrix();
      guardarCambioDeCarpetas(tocadas, `el nuevo nombre de "${limpio}"`);
    }));
    wrap.querySelectorAll('[data-carpeta-eliminar]').forEach(btn => btn.addEventListener('click', async e => {
      e.stopPropagation();
      const nombre = btn.dataset.carpetaEliminar;
      const enSubarbol = templatesFull.filter(t => {
        const c = normalizarRutaCarpeta(t.config.carpeta);
        return c === nombre || c.startsWith(nombre + '/');
      }).length;
      const tieneSubcarpetas = carpetasExistentes().some(c => c !== nombre && c.startsWith(nombre + '/'));
      const aviso = enSubarbol
        ? `¿Eliminar la carpeta "${nombre}"? Sus ${enSubarbol} plantilla(s) NO se borran: las que estaban directo ahí quedan "Sin carpeta"${tieneSubcarpetas ? `, y las de sus subcarpetas suben un nivel (por ejemplo "${nombre}/Módulo 1" pasa a llamarse sólo "Módulo 1")` : ''}. Si además quieres borrar esas plantillas, hazlo una por una con "Eliminar" en el editor de arriba.`
        : tieneSubcarpetas
          ? `¿Eliminar la carpeta vacía "${nombre}"? Sus subcarpetas suben un nivel.`
          : `¿Eliminar la carpeta vacía "${nombre}"?`;
      if(!await preguntar({
        titulo: `Eliminar la carpeta «${nombre}»`,
        peligro: true,
        aceptar: 'Sí, eliminar la carpeta',
        cuerpo: `<p>${escapeHtml(aviso).replace(/^¿[^?]*\? ?/, '')}</p>`,
      })) return;
      const tocadas = [];
      templatesFull.forEach((t, i) => {
        const antes = normalizarRutaCarpeta(t.config.carpeta);
        const despues = trasladarRuta(antes, nombre, '');
        if(antes !== despues){ t.config.carpeta = despues; tocadas.push(i); }
      });
      carpetasVacias = new Set([...carpetasVacias].map(c => trasladarRuta(c, nombre, '')).filter(Boolean));
      carpetasColapsadas = new Set([...carpetasColapsadas].map(c => trasladarRuta(c, nombre, '')).filter(Boolean));
      renderCarpetasBoard(); renderTemplateSelector(); renderMatrixTplSelector(); renderMatrix();
      guardarCambioDeCarpetas(tocadas, `la eliminación de "${nombre}"`);
    }));

    wrap.querySelectorAll('[data-plantilla-chip]').forEach(chip => {
      chip.addEventListener('click', () => {
        const sel = document.getElementById('selPlantilla');
        sel.value = chip.dataset.plantillaChip;
        sel.dispatchEvent(new Event('change'));
      });
      chip.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', chip.dataset.plantillaChip);
        e.dataTransfer.effectAllowed = 'move';
      });
      chip.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
      chip.addEventListener('drop', e => {
        e.preventDefault();
        e.stopPropagation();
        const body = chip.closest('.carpeta-card-body');
        // arrastre desde el escritorio de la computadora (no una ficha ya existente):
        // crea la(s) plantilla(s) directo en esta carpeta, junto a la ficha soltada
        if(e.dataTransfer.files && e.dataTransfer.files.length){
          manejarDropDeArchivosExternos([...e.dataTransfer.files], body.dataset.carpetaDrop);
          return;
        }
        const idxArrastrado = Number(e.dataTransfer.getData('text/plain'));
        if(idxArrastrado === Number(chip.dataset.plantillaChip)) return;
        const otrasChips = [...body.querySelectorAll('.plantilla-chip')].filter(c => Number(c.dataset.plantillaChip) !== idxArrastrado);
        const posChip = otrasChips.indexOf(chip);
        const r = chip.getBoundingClientRect();
        const posInsercion = (e.clientX - r.left) > r.width / 2 ? posChip + 1 : posChip;
        const tocadas = moverAPosicionEnCarpeta(idxArrastrado, body.dataset.carpetaDrop, posInsercion);
        carpetasVacias.delete(body.dataset.carpetaDrop);
        renderCarpetasBoard(); renderTemplateSelector(); renderMatrixTplSelector(); renderMatrix();
        guardarCambioDeCarpetas(tocadas, 'el cambio de carpeta');
      });
    });
    wrap.querySelectorAll('.carpeta-card-body').forEach(body => {
      body.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; body.classList.add('drag-over'); });
      body.addEventListener('dragleave', () => body.classList.remove('drag-over'));
      body.addEventListener('drop', e => {
        e.preventDefault();
        body.classList.remove('drag-over');
        if(e.target.closest('.plantilla-chip')) return;   // ya lo maneja el handler de esa ficha
        // arrastre desde el escritorio de la computadora: crea la(s) plantilla(s) ahí mismo,
        // en esta carpeta (funciona igual en "Sin carpeta" y en cualquier subcarpeta anidada)
        if(e.dataTransfer.files && e.dataTransfer.files.length){
          manejarDropDeArchivosExternos([...e.dataTransfer.files], body.dataset.carpetaDrop);
          return;
        }
        const idxArrastrado = Number(e.dataTransfer.getData('text/plain'));
        const tocadas = moverAPosicionEnCarpeta(idxArrastrado, body.dataset.carpetaDrop, Infinity);
        carpetasVacias.delete(body.dataset.carpetaDrop);
        renderCarpetasBoard(); renderTemplateSelector(); renderMatrixTplSelector(); renderMatrix();
        guardarCambioDeCarpetas(tocadas, 'el cambio de carpeta');
      });
    });
  }

  document.getElementById('btnNuevaCarpeta').addEventListener('click', () => {
    const inp = document.getElementById('nuevaCarpetaNombre');
    const nombre = normalizarRutaCarpeta(inp.value);
    if(!nombre) return;
    carpetasVacias.add(nombre);
    inp.value = '';
    renderCarpetasBoard();
    guardarCambioDeCarpetas([], `la carpeta "${nombre}"`);
  });

  function renderTemplateSelector(){
    const sel = document.getElementById('selPlantilla');
    const grupos = agruparPorCarpeta(templatesFull);
    sel.innerHTML = grupos.map(g => {
      const opts = g.items.map(({ t, i }) => `<option value="${i}">${escapeHtml(t.nombre)}</option>`).join('');
      return g.carpeta ? `<optgroup label="${escapeHtml(etiquetaCarpeta(g.carpeta))}">${opts}</optgroup>` : opts;
    }).join('');
    sel.value = currentIdx;
    document.getElementById('nombrePlantilla').value = templatesFull[currentIdx].nombre;
    document.getElementById('carpetaPlantilla').value = templatesFull[currentIdx].config.carpeta || '';
    document.getElementById('listaCarpetas').innerHTML =
      carpetasExistentes().map(c => `<option value="${escapeHtml(c)}">`).join('');
    actualizarBotonesOrdenCarpeta();
    renderCarpetasBoard();
    renderCopiarEstiloSelector();
    renderCopiaMasivaSelectores();
  }

  /** Habilita/deshabilita ▲▼ según la posición de la plantilla actual dentro de su carpeta. */
  function actualizarBotonesOrdenCarpeta(){
    const btnUp = document.getElementById('btnSubirCarpeta'), btnDown = document.getElementById('btnBajarCarpeta');
    const carpeta = (templatesFull[currentIdx].config.carpeta || '').trim();
    if(!carpeta){
      btnUp.disabled = true; btnDown.disabled = true;
      document.getElementById('ordenCarpetaWrap').style.visibility = 'hidden';
      return;
    }
    document.getElementById('ordenCarpetaWrap').style.visibility = '';
    const grupo = agruparPorCarpeta(templatesFull).find(g => g.carpeta === carpeta).items;
    const pos = grupo.findIndex(x => x.i === currentIdx);
    btnUp.disabled = pos <= 0;
    btnDown.disabled = pos >= grupo.length - 1;
  }

  document.getElementById('btnSubirCarpeta').addEventListener('click', () => {
    const tocadas = moverEnCarpeta(currentIdx, -1);
    renderCarpetasBoard();
    renderTemplateSelector();
    renderMatrixTplSelector();
    renderMatrix();
    if(tocadas) guardarCambioDeCarpetas(tocadas, 'el nuevo orden');
  });
  document.getElementById('btnBajarCarpeta').addEventListener('click', () => {
    const tocadas = moverEnCarpeta(currentIdx, 1);
    renderCarpetasBoard();
    renderTemplateSelector();
    renderMatrixTplSelector();
    renderMatrix();
    if(tocadas) guardarCambioDeCarpetas(tocadas, 'el nuevo orden');
  });

  document.getElementById('selPlantilla').addEventListener('change', e => {
    currentIdx = Number(e.target.value);
    config = templatesFull[currentIdx].config;
    document.getElementById('nombrePlantilla').value = templatesFull[currentIdx].nombre;
    document.getElementById('carpetaPlantilla').value = config.carpeta || '';
    actualizarBotonesOrdenCarpeta();
    renderCarpetasBoard();
    renderCopiarEstiloSelector();
    renderTemplatePreview();
  });

  document.getElementById('nombrePlantilla').addEventListener('input', e => {
    templatesFull[currentIdx].nombre = e.target.value;
    // se actualiza también la ficha del tablero de carpetas sin volver a
    // pintarlo entero, para que el nombre se vea al momento mientras se escribe
    const chip = document.querySelector(`[data-plantilla-chip="${currentIdx}"] .plantilla-chip-nombre`);
    if(chip) chip.textContent = e.target.value;
  });

  document.getElementById('carpetaPlantilla').addEventListener('focus', e => {
    e.target.dataset.previo = e.target.value;   // para saber si de verdad cambió de carpeta
  });
  document.getElementById('carpetaPlantilla').addEventListener('input', e => {
    templatesFull[currentIdx].config.carpeta = e.target.value;
  });
  document.getElementById('carpetaPlantilla').addEventListener('change', e => {
    const t = templatesFull[currentIdx];
    const nueva = normalizarRutaCarpeta(t.config.carpeta);
    const previa = normalizarRutaCarpeta(e.target.dataset.previo);
    t.config.carpeta = nueva;
    e.target.value = nueva;   // refleja la normalización (espacios sueltos, / de más) en el propio campo
    // si de verdad cambió a otra carpeta (o se le puso una nueva), se suma al
    // final de esa carpeta; si sólo se retocó el nombre sin cambiar de carpeta,
    // no se toca el orden que ya tenía
    if(nueva && nueva !== previa) t.config.orden = siguienteOrdenEnCarpeta(nueva);
    renderTemplateSelector();
    renderMatrixTplSelector();
    renderMatrix();
  });

  document.getElementById('btnNuevaPlantilla').addEventListener('click', () => {
    const cfg = normalizarConfig(defaultConfig());
    // hereda la carpeta de la plantilla que estaba abierta: lo normal es que
    // "+ Nueva plantilla" se use para sumar otro certificado al mismo diplomado,
    // y se agrega al final de la carpeta, después de los que ya había
    cfg.carpeta = templatesFull[currentIdx]?.config?.carpeta || '';
    cfg.orden = siguienteOrdenEnCarpeta(cfg.carpeta);
    templatesFull.push({ id: null, nombre: 'Nueva plantilla', config: cfg });
    currentIdx = templatesFull.length - 1;
    config = cfg;
    matrixTemplateSelection.add(currentIdx);
    renderTemplateSelector();
    renderTemplatePreview();
    renderMatrixTplSelector();
  });

  document.getElementById('btnDuplicarPlantilla').addEventListener('click', () => {
    const clone = JSON.parse(JSON.stringify(templatesFull[currentIdx].config));
    clone.orden = siguienteOrdenEnCarpeta(clone.carpeta);   // la copia queda al final de la misma carpeta
    templatesFull.push({ id: null, nombre: templatesFull[currentIdx].nombre + ' (copia)', config: clone });
    currentIdx = templatesFull.length - 1;
    config = clone;
    matrixTemplateSelection.add(currentIdx);
    renderTemplateSelector();
    renderTemplatePreview();
    renderMatrixTplSelector();
  });

  // Al borrar una plantilla, los índices de las plantillas siguientes se recorren
  // una posición; hay que reflejar ese corrimiento en las asignaciones existentes
  // y en la selección de plantillas activas de la matriz, para no dejar referencias
  // apuntando a la plantilla equivocada.
  function reindexTemplateIdxAfterDelete(delIdx){
    for(const set of assignment){
      const shifted = new Set();
      for(const ti of set){
        if(ti === delIdx) continue;
        shifted.add(ti > delIdx ? ti - 1 : ti);
      }
      set.clear();
      for(const ti of shifted) set.add(ti);
    }
    const shiftedSel = new Set();
    for(const ti of matrixTemplateSelection){
      if(ti === delIdx) continue;
      shiftedSel.add(ti > delIdx ? ti - 1 : ti);
    }
    matrixTemplateSelection = shiftedSel;
  }

  document.getElementById('btnEliminarPlantilla').addEventListener('click', async () => {
    if(templatesFull.length <= 1){ alert('Debe quedar al menos una plantilla.'); return; }
    if(!await preguntar({
      titulo: 'Eliminar este diseño',
      peligro: true,
      aceptar: 'Sí, eliminarlo',
      cuerpo: `<p>Se borra «<b>${escapeHtml(templatesFull[currentIdx].nombre)}</b>» por completo y
        <b>no se puede recuperar</b>. Los certificados ya emitidos con él siguen valiendo.</p>`,
    })) return;
    const t = templatesFull[currentIdx];
    if(t.id) await supabase.rpc('delete_cert_template', { p_id: t.id });
    reindexTemplateIdxAfterDelete(currentIdx);
    templatesFull.splice(currentIdx, 1);
    currentIdx = 0;
    config = templatesFull[0].config;
    renderTemplateSelector();
    renderTemplatePreview();
    renderMatrixTplSelector();
    renderMatrix();
  });

  document.getElementById('btnGuardarPlantilla').addEventListener('click', async () => {
    const t = templatesFull[currentIdx];
    await externalizarFondo(t.config);
    const { data, error } = await supabase.rpc('save_cert_template', { p_id: t.id, p_nombre: t.nombre, p_config: t.config });
    const el = document.getElementById('tplMsg');
    if(error){ el.textContent = 'Error: ' + error.message; return; }
    t.id = data.id;
    el.textContent = 'Plantilla guardada ✓';
    renderTemplateSelector();
    renderMatrixTplSelector();
    renderMatrix();
  });

  // ---------- Editor de plantilla ----------
  /** Propiedades de aspecto y colocación que se copian entre plantillas. */
  /**
   * Copia TODOS los campos de otra plantilla a esta: textos, imágenes con su
   * archivo, códigos QR, posiciones, márgenes, tipografías y opacidades.
   * Los campos que hubiera aquí se reemplazan, para que las dos plantillas
   * queden idénticas salvo el fondo, que es lo propio de cada certificado.
   */
  function renderCopiarEstiloSelector(){
    const sel = document.getElementById('selCopiarEstilo');
    if(!sel) return;
    const grupos = agruparPorCarpeta(templatesFull, currentIdx);
    const hayOtras = grupos.some(g => g.items.length);
    sel.innerHTML = hayOtras
      ? grupos.map(g => {
          const opts = g.items.map(({ t, i }) => `<option value="${i}">${escapeHtml(t.nombre)}</option>`).join('');
          return g.carpeta ? `<optgroup label="${escapeHtml(etiquetaCarpeta(g.carpeta))}">${opts}</optgroup>` : opts;
        }).join('')
      : '<option value="">— no hay otra plantilla —</option>';
    sel.disabled = !hayOtras;
    document.getElementById('btnCopiarEstilo').disabled = !hayOtras;
  }

  /** Selectores de "Copiar a TODA una carpeta": carpeta destino y plantilla origen. */
  function renderCopiaMasivaSelectores(){
    const selCarpeta = document.getElementById('selCarpetaDestinoMasivo');
    const selOrigen = document.getElementById('selOrigenMasivo');
    const btn = document.getElementById('btnCopiarEstiloMasivo');
    if(!selCarpeta || !selOrigen) return;
    const carpetas = carpetasExistentes();
    selCarpeta.innerHTML = carpetas.length
      ? carpetas.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(etiquetaCarpeta(c))}</option>`).join('')
      : '<option value="">— crea primero una carpeta —</option>';
    selCarpeta.disabled = !carpetas.length;

    const grupos = agruparPorCarpeta(templatesFull);
    selOrigen.innerHTML = grupos.map(g => {
      const opts = g.items.map(({ t, i }) => `<option value="${i}">${escapeHtml(t.nombre)}</option>`).join('');
      return g.carpeta ? `<optgroup label="${escapeHtml(etiquetaCarpeta(g.carpeta))}">${opts}</optgroup>` : opts;
    }).join('');

    btn.disabled = !carpetas.length;
  }

  document.getElementById('btnCopiarEstiloMasivo').addEventListener('click', async () => {
    const carpetaDestino = document.getElementById('selCarpetaDestinoMasivo').value;
    const origenIdx = Number(document.getElementById('selOrigenMasivo').value);
    const origen = templatesFull[origenIdx];
    if(!origen){ alert('Elige la plantilla de la que quieres copiar.'); return; }
    const destinos = templatesFull.map((t, i) => ({ t, i })).filter(x => (x.t.config.carpeta || '').trim() === carpetaDestino);
    if(!destinos.length){ alert('Esa carpeta todavía no tiene ninguna plantilla.'); return; }
    const nombreCarpeta = carpetaDestino || 'Sin carpeta';
    if(!await preguntar({
      titulo: `Copiar el diseño a ${destinos.length} plantilla(s)`,
      peligro: true,
      aceptar: `Sí, copiar a las ${destinos.length}`,
      cuerpo: `<p>Los campos de las ${destinos.length} plantilla(s) de «<b>${escapeHtml(nombreCarpeta)}</b>»
        se <b>reemplazan</b> por los de «<b>${escapeHtml(origen.nombre)}</b>» y se guardan de una vez.
        Lo que tuvieran ahora se pierde.</p>
        <p>El fondo de cada certificado no se toca.</p>`,
    })) return;

    // Los "valores fijos" (overrides) son aparte del diseño de los campos: p.ej. una
    // Fecha puesta a mano SOLO para esa plantilla, sin tocar el Excel. Como es algo
    // propio de cada plantilla y no del diseño visual, se pregunta por separado en
    // vez de arrastrarlo siempre junto con "copiar estilo".
    const fijosOrigen = origen.config.overrides || {};
    const nFijosOrigen = Object.keys(fijosOrigen).length;
    const detalleFijos = nFijosOrigen
      ? ` Tiene ${nFijosOrigen}: ${Object.entries(fijosOrigen).map(([k, v]) => `${k}=${v}`).join(', ')}.`
      : ' No tiene ninguno puesto.';
    const copiarFijos = await preguntar({
      titulo: 'Copiar también los valores fijos',
      aceptar: 'Sí, copiarlos también',
      cuerpo: `<p>Los valores fijos son los datos puestos a mano en una plantilla —por ejemplo una
        Fecha— sin tocar el Excel.${escapeHtml(detalleFijos)}</p>
        <p><b>Sí</b>: cada plantilla de «${escapeHtml(nombreCarpeta)}» pierde los suyos y toma los de
        «${escapeHtml(origen.nombre)}». <b>Cancelar</b>: cada una conserva los que ya tenía.</p>`,
    });

    const btn = document.getElementById('btnCopiarEstiloMasivo');
    btn.disabled = true;
    let ok = 0, fallos = 0;
    for(const { t } of destinos){
      // copia profunda: cada plantilla debe quedar con sus propios objetos, si
      // no, mover un campo en una movería también el de las demás
      t.config.fields = JSON.parse(JSON.stringify(origen.config.fields || []));
      if(copiarFijos) t.config.overrides = JSON.parse(JSON.stringify(fijosOrigen));
      normalizarConfig(t.config);
      await externalizarFondo(t.config);
      const { data, error } = await supabase.rpc('save_cert_template', { p_id: t.id, p_nombre: t.nombre, p_config: t.config });
      if(error){ fallos++; continue; }
      t.id = data.id;
      ok++;
    }
    btn.disabled = false;
    config = templatesFull[currentIdx].config;   // por si la plantilla abierta estaba entre las tocadas
    renderChips(); renderFieldSettings();
    renderTemplateSelector(); renderMatrixTplSelector(); renderMatrix();
    const el = document.getElementById('tplMsg');
    el.textContent = fallos
      ? `Copiado y guardado en ${ok} de ${destinos.length} plantilla(s) de «${nombreCarpeta}» (${fallos} con error).`
      : `Copiado y guardado en las ${ok} plantilla(s) de «${nombreCarpeta}» ✓.`;
    setTimeout(() => { if(el.textContent.startsWith('Copiado y guardado')) el.textContent = ''; }, 14000);
  });

  document.getElementById('btnCopiarEstilo').addEventListener('click', async () => {
    const sel = document.getElementById('selCopiarEstilo');
    const origen = templatesFull[Number(sel.value)];
    if(!origen){ alert('Elige la plantilla de la que quieres copiar.'); return; }

    const nuevos = origen.config.fields || [];
    const actuales = config.fields || [];
    const aviso = actuales.length
      ? `Se reemplazarán los ${actuales.length} campo(s) de esta plantilla por los ${nuevos.length} de «${origen.nombre}».\n\n` +
        `El fondo de este certificado no se toca.\n¿Continuar?`
      : `Se copiarán los ${nuevos.length} campo(s) de «${origen.nombre}». ¿Continuar?`;
    if(!await preguntar({
      titulo: 'Copiar el diseño de otra plantilla',
      peligro: actuales.length > 0,
      aceptar: 'Sí, copiarlo',
      cuerpo: `<p>${escapeHtml(aviso).split('\n')[0]}</p><p>El fondo de este certificado no se toca.</p>`,
    })) return;

    // copia profunda: cada plantilla debe quedar con sus propios objetos,
    // si no, mover un campo aquí movería también el de la plantilla original
    config.fields = JSON.parse(JSON.stringify(nuevos));
    normalizarConfig(config);
    campoSel = null;
    renderChips(); renderFieldSettings();

    const cuenta = { texto:0, imagen:0, qr:0 };
    for(const f of config.fields) cuenta[f.tipo] = (cuenta[f.tipo] || 0) + 1;
    const conFoto = config.fields.filter(f => f.tipo === 'imagen' && f.dataUrl).length;
    const msg = document.getElementById('tplMsg');
    msg.textContent = `Copiado de «${origen.nombre}»: ${cuenta.texto||0} de texto, ` +
      `${cuenta.imagen||0} imagen(es) (${conFoto} con archivo) y ${cuenta.qr||0} QR. ` +
      `Recuerda guardar la plantilla.`;
    setTimeout(() => { if(msg.textContent.startsWith('Copiado de')) msg.textContent = ''; }, 12000);
  });

  function renderTemplatePreview(){
    renderReglas();
    const img = document.getElementById('tplImg');
    img.crossOrigin = 'anonymous';
    img.onload = () => { renderChips(); renderFieldSettings(); };
    img.src = config.background;
  }

  /* ============================================================
     REGLAS Y GUÍAS
     Las guías son líneas de referencia como las de Word o Google Docs:
     se sueltan arrastrando desde la regla, se mueven, y se quitan
     pulsándolas y dándole a Supr, devolviéndolas a la regla o con doble clic.
     No se imprimen nunca.
     ============================================================ */
  const IMAN = 0.7;        // a menos de este % una arista se pega a la guía

  function guiasDe(){ return (config.guias = config.guias || { v: [], h: [] }); }

  /** Dibuja las marcas y los números de las dos reglas. */
  function renderReglas(){
    const h = document.getElementById('reglaH');
    const v = document.getElementById('reglaV');
    if(!h || !v) return;
    const pintar = (el, horizontal) => {
      let html = '';
      for(let p = 0; p <= 100; p += 2.5){
        const mayor = Math.abs(p % 10) < 0.01;
        const largo = mayor ? 9 : (Math.abs(p % 5) < 0.01 ? 6 : 4);
        html += horizontal
          ? `<span class="marca" style="left:${p}%;height:${largo}px"></span>`
          : `<span class="marca" style="top:${p}%;width:${largo}px"></span>`;
        if(mayor && p > 0 && p < 100){
          html += horizontal
            ? `<span class="num" style="left:${p}%">${p}</span>`
            : `<span class="num" style="top:${p}%">${p}</span>`;
        }
      }
      el.innerHTML = html;
    };
    pintar(h, true);
    pintar(v, false);
  }

  /** Dibuja las guías sobre la plantilla. */
  function renderGuias(){
    const wrap = document.getElementById('tplPreviewWrap');
    if(!wrap) return;
    wrap.querySelectorAll('.guia').forEach(el => el.remove());
    const g = guiasDe();
    // al cambiar de plantilla las guías son otras: una selección que ya no
    // apunta a nada se descarta, si no Supr borraría una guía al azar
    if(guiaSel && g[guiaSel.eje]?.[guiaSel.i] === undefined) guiaSel = null;
    g.v.forEach((pos, i) => wrap.appendChild(crearGuia('v', pos, i)));
    g.h.forEach((pos, i) => wrap.appendChild(crearGuia('h', pos, i)));
  }

  function crearGuia(eje, pos, i){
    const el = document.createElement('div');
    el.className = 'guia ' + eje + (esGuiaSel(eje, i) ? ' sel' : '');
    el.dataset.eje = eje; el.dataset.gi = i;
    if(eje === 'v') el.style.left = pos + '%'; else el.style.top = pos + '%';
    el.title = `Guía en ${pos}% — pulsa y dale a Supr, arrástrala a la regla o haz doble clic para quitarla`;
    el.addEventListener('pointerdown', iniciarArrastreGuia);
    el.addEventListener('dblclick', () => { quitarGuia(eje, i); });
    return el;
  }

  let guiaArrastrada = null;   // { eje, i, nueva }

  function esGuiaSel(eje, i){ return !!guiaSel && guiaSel.eje === eje && guiaSel.i === i; }

  /** Quita una guía y deja limpia la selección, que va por índice. */
  function quitarGuia(eje, i){
    guiasDe()[eje].splice(i, 1);
    guiaSel = null;
    renderGuias();
  }

  function iniciarArrastreGuia(e){
    e.stopPropagation();
    const eje = e.currentTarget.dataset.eje, i = Number(e.currentTarget.dataset.gi);
    guiaArrastrada = { eje, i };
    // elegirla excluye al campo: así Supr no tiene dos candidatos a borrar
    guiaSel = { eje, i };
    if(campoSel !== null && campoSel !== undefined){ campoSel = null; renderChips(); renderFieldSettings(); }
    e.currentTarget.classList.add('arrastrando', 'sel');
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  /** Empezar a arrastrar desde la regla crea una guía nueva y la sigue moviendo. */
  function iniciarGuiaDesdeRegla(eje, e){
    const wrap = document.getElementById('tplPreviewWrap').getBoundingClientRect();
    const pos = eje === 'v'
      ? ((e.clientX - wrap.left) / wrap.width) * 100
      : ((e.clientY - wrap.top) / wrap.height) * 100;
    const g = guiasDe();
    g[eje].push(Math.round(Math.min(100, Math.max(0, pos)) * 10) / 10);
    guiaArrastrada = { eje, i: g[eje].length - 1, nueva: true };
    guiaSel = { eje, i: g[eje].length - 1 };
    if(campoSel !== null && campoSel !== undefined){ campoSel = null; renderChips(); renderFieldSettings(); }
    renderGuias();
    e.preventDefault();
  }

  document.getElementById('reglaH').addEventListener('pointerdown', e => iniciarGuiaDesdeRegla('v', e));
  document.getElementById('reglaV').addEventListener('pointerdown', e => iniciarGuiaDesdeRegla('h', e));

  document.addEventListener('pointermove', e => {
    if(!guiaArrastrada) return;
    const wrap = document.getElementById('tplPreviewWrap').getBoundingClientRect();
    const { eje, i } = guiaArrastrada;
    const dentro = e.clientX >= wrap.left - 4 && e.clientX <= wrap.right + 4 &&
                   e.clientY >= wrap.top - 4 && e.clientY <= wrap.bottom + 4;
    const pos = eje === 'v'
      ? ((e.clientX - wrap.left) / wrap.width) * 100
      : ((e.clientY - wrap.top) / wrap.height) * 100;
    guiasDe()[eje][i] = Math.round(Math.min(100, Math.max(0, pos)) * 10) / 10;
    guiaArrastrada.fuera = !dentro;
    renderGuias();
    const el = document.querySelector(`.guia.${eje}[data-gi="${i}"]`);
    if(el){ el.classList.add('arrastrando'); el.classList.toggle('borrar', !dentro); }
  });

  document.addEventListener('pointerup', () => {
    if(!guiaArrastrada) return;
    const { eje, i, fuera } = guiaArrastrada;
    guiaArrastrada = null;
    // soltarla fuera del lienzo (sobre la regla) equivale a quitarla
    if(fuera){ quitarGuia(eje, i); return; }
    renderGuias();
  });

  document.getElementById('btnLimpiarGuias').addEventListener('click', async () => {
    const g = guiasDe();
    if(!g.v.length && !g.h.length) return;
    if(!await preguntar({
      titulo: 'Quitar las guías',
      aceptar: `Sí, quitar las ${g.v.length + g.h.length}`,
      cuerpo: `<p>Se borran las ${g.v.length + g.h.length} guías de esta plantilla. Los campos
        se quedan donde están: sólo desaparecen las líneas a las que se pegaban.</p>`,
    })) return;
    g.v = []; g.h = [];
    guiaSel = null;
    renderGuias();
  });

  /**
   * Desplazamiento necesario para pegar `valor` a la guía más cercana,
   * o null si no hay ninguna dentro del alcance del imán.
   * Se devuelve el desplazamiento —y no el valor ya pegado— porque al mover
   * una caja hay que comparar sus dos aristas: si se comparasen los valores,
   * la arista que no tiene guía cerca (desplazamiento cero) ganaría siempre.
   */
  function ajusteIman(valor, eje){
    const g = guiasDe()[eje];
    let mejor = null, dist = IMAN;
    for(const p of g){
      const d = Math.abs(p - valor);
      if(d < dist){ dist = d; mejor = p - valor; }
    }
    return mejor;
  }

  /** Pega un valor a la guía más cercana del eje indicado. */
  function iman(valor, eje){
    const g = guiasDe()[eje];
    let mejor = valor, dist = IMAN;
    for(const p of g){
      const d = Math.abs(p - valor);
      if(d < dist){ dist = d; mejor = p; }
    }
    return mejor;
  }

  /**
   * Altura de capa de un campo: el primero de la lista queda por delante.
   * Es el mismo criterio con el que renderCertificateCanvas dibuja, para que
   * lo que se ve aquí sea lo que sale impreso.
   */
  function capaDe(i){ return Math.max(1, Math.min(99, config.fields.length - i)); }

  function renderChips(){
    const wrap = document.getElementById('tplPreviewWrap');
    wrap.querySelectorAll('.field-chip,.field-handle,.field-box,.field-label,.img-box,.img-handle').forEach(el => el.remove());
    config.fields.forEach((f, i) => {
      if(f.tipo === 'qr'){
        const chip = document.createElement('div');
        chip.className = 'field-chip' + (f.activo ? '' : ' inactive') + (campoSel === i ? ' sel' : '');
        chip.textContent = (f.nombre || ('Campo ' + (i+1))) + ' (QR)';
        chip.style.left = f.xPct + '%'; chip.style.top = f.yPct + '%';
        chip.style.zIndex = 400 + capaDe(i);
        chip.dataset.idx = i; chip.dataset.role = 'point';
        chip.addEventListener('pointerdown', onHandlePointerDown);
        wrap.appendChild(chip);
        return;
      }
      if(f.tipo === 'imagen'){
        // La imagen se ve en su sitio y a su tamaño real, para poder cuadrarla.
        const caja = document.createElement('div');
        caja.className = 'img-box' + (f.activo ? '' : ' inactive') + (campoSel === i ? ' sel' : '');
        caja.style.left = f.xPct + '%'; caja.style.top = f.yPct + '%';
        caja.style.width = (f.widthPct ?? 18) + '%';
        caja.style.opacity = opacityOf(f);
        caja.style.zIndex = capaDe(i);
        caja.dataset.idx = i; caja.dataset.role = 'point';
        caja.innerHTML = f.dataUrl
          ? `<img loading="lazy" decoding="async" src="${f.dataUrl}" alt="">`
          : `<div class="img-vacia">${escapeHtml(f.nombre || 'Imagen')}<br><small>sin archivo</small></div>`;
        caja.addEventListener('pointerdown', onHandlePointerDown);
        wrap.appendChild(caja);

        const rot = document.createElement('div');
        rot.className = 'img-handle' + (f.activo ? '' : ' inactive');
        rot.style.left = `calc(${f.xPct}% + ${(f.widthPct ?? 18)/2}%)`;
        rot.style.top = f.yPct + '%';
        rot.dataset.idx = i; rot.dataset.role = 'imgW';
        rot.title = 'Arrastra para cambiar el ancho';
        rot.addEventListener('pointerdown', onHandlePointerDown);
        wrap.appendChild(rot);

        const et = document.createElement('div');
        et.className = 'field-label' + (f.activo ? '' : ' inactive');
        et.textContent = f.nombre || ('Imagen ' + (i+1));
        et.style.left = f.xPct + '%'; et.style.top = f.yPct + '%';
        et.style.zIndex = 400 + capaDe(i);
        wrap.appendChild(et);
        return;
      }
      const box = boxOf(f), v = cajaV(f);
      const sel = (campoSel === i) ? ' sel' : '';
      const anchoImg = wrap.querySelector('#tplImg')?.clientWidth || 900;
      const altoImg  = wrap.querySelector('#tplImg')?.clientHeight || 640;

      // Caja con el texto de muestra, tal como saldrá impreso
      const caja = document.createElement('div');
      caja.className = 'field-box' + (f.activo ? '' : ' inactive') + sel;
      caja.style.left = box.leftPct + '%';
      caja.style.top = v.topPct + '%';
      caja.style.width = (box.rightPct - box.leftPct) + '%';
      caja.style.height = (v.botPct - v.topPct) + '%';
      caja.style.zIndex = capaDe(i);
      const muestra = document.createElement('span');
      muestra.textContent = textoMuestra(f);
      const escalaX = anchoImg / (config.bgWidth || 1600);
      const anchoCajaPx = ((box.rightPct - box.leftPct)/100) * (config.bgWidth || 1600);
      // el alto se mide igual que en el lienzo real, no en píxeles de pantalla,
      // para que el tope de tamaño sea el mismo en la muestra y en la impresión
      const altoCajaPx = ((v.botPct - v.topPct)/100) * (config.bgHeight || 1131);
      const cuerpo = ajustarMuestra(muestra.textContent, f, anchoCajaPx, altoCajaPx);
      muestra.style.cssText = `font-family:${f.fontFamily || 'Georgia, serif'};` +
        `font-weight:${f.bold ? '700' : '400'};color:${f.color};opacity:${opacityOf(f)};` +
        `text-align:${f.align};font-size:${Math.max(6, cuerpo * escalaX)}px;`;
      caja.appendChild(muestra);
      wrap.appendChild(caja);

      // Etiqueta = asa para mover el campo entero
      const label = document.createElement('div');
      label.className = 'field-label' + (f.activo ? '' : ' inactive') + sel;
      label.textContent = f.nombre || ('Campo ' + (i+1));
      label.style.left = ((box.leftPct + box.rightPct)/2) + '%';
      label.style.top = v.topPct + '%';
      label.style.zIndex = 400 + capaDe(i);
      label.dataset.idx = i; label.dataset.role = 'move';
      label.title = 'Arrastra para mover todo el campo';
      label.addEventListener('pointerdown', onHandlePointerDown);
      wrap.appendChild(label);

      const centro = centroV(f);
      const asa = (clase, izq, arriba, rol, titulo, cursor) => {
        const h = document.createElement('div');
        h.className = 'field-handle ' + clase + (f.activo ? '' : ' inactive');
        h.style.left = izq + '%'; h.style.top = arriba + '%';
        if(cursor) h.style.cursor = cursor;
        h.dataset.idx = i; h.dataset.role = rol; h.title = titulo;
        h.addEventListener('pointerdown', onHandlePointerDown);
        wrap.appendChild(h);
      };
      asa('h', box.leftPct,  centro,   'left',  'Margen izquierdo');
      asa('h', box.rightPct, centro,   'right', 'Margen derecho');
      asa('v', (box.leftPct+box.rightPct)/2, v.topPct, 'top', 'Margen superior');
      asa('v', (box.leftPct+box.rightPct)/2, v.botPct, 'bot', 'Margen inferior');
      // esquinas: mueven los dos márgenes de ese lado a la vez (p.ej. derecho + inferior)
      asa('c', box.leftPct,  v.topPct, 'tl', 'Esquina superior izquierda', 'nwse-resize');
      asa('c', box.rightPct, v.topPct, 'tr', 'Esquina superior derecha',   'nesw-resize');
      asa('c', box.leftPct,  v.botPct, 'bl', 'Esquina inferior izquierda', 'nesw-resize');
      asa('c', box.rightPct, v.botPct, 'br', 'Esquina inferior derecha',   'nwse-resize');
    });
    renderGuias();     // se redibujan junto con los campos
  }

  /** Texto de muestra que se ve en la plantilla mientras se ajusta. */
  function textoMuestra(f){
    if(f.usarPlantillaTexto){
      const texto = String(f.plantillaTexto || '').replace(/\{\{[^{}]+\}\}/g, 'XXXXXXXXX');
      return aplicarFormato(texto, f.formato) || 'XXXXXXXXX';
    }
    const fijo = config.overrides && config.overrides[f.nombre];
    if(fijo) return aplicarFormato(fijo, f.formato);
    if(f.formato === 'cedula') return '12.345.678';
    return 'XXXXXXXXX';
  }

  /**
   * Cuerpo de letra que tendría ese texto dentro de la caja, para verlo real.
   * Debe aplicar EXACTAMENTE el mismo tope que renderCertificateCanvas (ancho Y
   * alto de la caja); si sólo se limitara por el ancho, aquí se vería un cuerpo
   * mucho más grande del que sale impreso y la muestra sería incoherente con
   * el certificado final.
   */
  function ajustarMuestra(texto, f, anchoCajaPx, altoCajaPx){
    const cv = ajustarMuestra._cv || (ajustarMuestra._cv = document.createElement('canvas'));
    const ctx = cv.getContext('2d');
    const topeAlto = altoCajaPx / 1.25;
    const maxS = Math.max(4, Math.min(f.maxFontSize || 32, topeAlto));
    // en "ajustar tamaño al margen" la muestra debe verse encogerse de verdad
    // (igual que en el certificado final) en vez de quedar recortada por la
    // caja de la vista previa, que no muestra el salto de línea real
    const minS = f.desborde === 'ajustar' ? Math.min(4, maxS) : Math.min(f.minFontSize || 12, maxS);
    return fitFontSize(ctx, texto, f.fontFamily || 'Georgia, serif', f.bold, maxS, minS, anchoCajaPx);
  }

  function onHandlePointerDown(e){
    const idx = Number(e.currentTarget.dataset.idx);
    const rol = e.currentTarget.dataset.role;
    const wrap = document.getElementById('tplPreviewWrap').getBoundingClientRect();
    const f = config.fields[idx];
    campoSel = idx;
    if(guiaSel){ guiaSel = null; renderGuias(); }   // elegir un campo suelta la guía
    dragging = { idx, role: rol };
    if(rol === 'move'){
      // se guarda el punto de agarre para mover la caja sin saltos
      const b = boxOf(f), v = cajaV(f);
      dragging.orig = { ...b, ...v,
        px: ((e.clientX - wrap.left) / wrap.width) * 100,
        py: ((e.clientY - wrap.top) / wrap.height) * 100 };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    renderFieldSettings();
  }
  document.getElementById('tplPreviewWrap').addEventListener('pointermove', e => {
    if(!dragging) return;
    const wrap = document.getElementById('tplPreviewWrap');
    const rect = wrap.getBoundingClientRect();
    let xPct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    let yPct = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    xPct = Math.round(xPct * 10) / 10; yPct = Math.round(yPct * 10) / 10;
    const f = config.fields[dragging.idx];
    const R = dragging.role;
    if(R === 'imgW'){
      // el tirador va al borde derecho: el ancho es el doble de la distancia al centro
      f.widthPct = Math.max(2, Math.min(100, Math.round((xPct - f.xPct) * 2 * 10) / 10));
    }
    else if(R === 'point'){ f.xPct = iman(xPct,'v'); f.yPct = iman(yPct,'h'); }
    else if(R === 'move'){
      // mueve la caja completa conservando su ancho y su alto
      const o = dragging.orig;
      const dx = xPct - o.px, dy = yPct - o.py;
      const ancho = o.rightPct - o.leftPct, alto = o.botPct - o.topPct;
      let izq = Math.max(0, Math.min(100 - ancho, o.leftPct + dx));
      let arr = Math.max(0, Math.min(100 - alto, o.topPct + dy));
      // el imán mira las dos aristas y aplica el desplazamiento de la que
      // esté más cerca de una guía; si ninguna lo está, no se toca nada
      const dIzq = ajusteIman(izq, 'v'), dDer = ajusteIman(izq + ancho, 'v');
      const dx2 = (dIzq !== null && (dDer === null || Math.abs(dIzq) <= Math.abs(dDer))) ? dIzq : dDer;
      if(dx2 !== null) izq = Math.max(0, Math.min(100 - ancho, izq + dx2));
      const dArr = ajusteIman(arr, 'h'), dAba = ajusteIman(arr + alto, 'h');
      const dy2 = (dArr !== null && (dAba === null || Math.abs(dArr) <= Math.abs(dAba))) ? dArr : dAba;
      if(dy2 !== null) arr = Math.max(0, Math.min(100 - alto, arr + dy2));
      f.leftPct = Math.round(izq * 10) / 10;
      f.rightPct = Math.round((f.leftPct + ancho) * 10) / 10;
      f.topPct = Math.round(arr * 10) / 10;
      f.botPct = Math.round((f.topPct + alto) * 10) / 10;
      f.yPct = centroV(f);
    }
    else if(R === 'left'){ const b = boxOf(f); f.leftPct = Math.min(iman(xPct,'v'), b.rightPct - 2); f.rightPct = b.rightPct; }
    else if(R === 'right'){ const b = boxOf(f); f.rightPct = Math.max(iman(xPct,'v'), b.leftPct + 2); f.leftPct = b.leftPct; }
    else if(R === 'top'){ const v = cajaV(f); f.topPct = Math.min(iman(yPct,'h'), v.botPct - 1); f.botPct = v.botPct; f.yPct = centroV(f); }
    else if(R === 'bot'){ const v = cajaV(f); f.botPct = Math.max(iman(yPct,'h'), v.topPct + 1); f.topPct = v.topPct; f.yPct = centroV(f); }
    // esquinas: la misma lógica de un borde horizontal y uno vertical, juntas,
    // así se ajustan los dos márgenes de ese lado en un solo arrastre
    else if(R === 'tl'){
      const b = boxOf(f), v = cajaV(f);
      f.leftPct = Math.min(iman(xPct,'v'), b.rightPct - 2); f.rightPct = b.rightPct;
      f.topPct = Math.min(iman(yPct,'h'), v.botPct - 1); f.botPct = v.botPct; f.yPct = centroV(f);
    }
    else if(R === 'tr'){
      const b = boxOf(f), v = cajaV(f);
      f.rightPct = Math.max(iman(xPct,'v'), b.leftPct + 2); f.leftPct = b.leftPct;
      f.topPct = Math.min(iman(yPct,'h'), v.botPct - 1); f.botPct = v.botPct; f.yPct = centroV(f);
    }
    else if(R === 'bl'){
      const b = boxOf(f), v = cajaV(f);
      f.leftPct = Math.min(iman(xPct,'v'), b.rightPct - 2); f.rightPct = b.rightPct;
      f.botPct = Math.max(iman(yPct,'h'), v.topPct + 1); f.topPct = v.topPct; f.yPct = centroV(f);
    }
    else if(R === 'br'){
      const b = boxOf(f), v = cajaV(f);
      f.rightPct = Math.max(iman(xPct,'v'), b.leftPct + 2); f.leftPct = b.leftPct;
      f.botPct = Math.max(iman(yPct,'h'), v.topPct + 1); f.topPct = v.topPct; f.yPct = centroV(f);
    }
    renderChips();
  });
  window.addEventListener('pointerup', () => {
    // Se repinta siempre: con un clic simple (sin arrastrar) no pasa por
    // pointermove, y sin esto el campo elegido no se resaltaría en la plantilla.
    if(dragging){ dragging = null; renderChips(); renderFieldSettings(); }
  });

  /**
   * Borrar con Supr o Retroceso lo que esté elegido: una guía si se acaba de
   * pulsar una, y si no el campo resaltado. Sólo actúa si el foco no está en un
   * cuadro de texto, para no borrar nada mientras se escribe un nombre.
   */
  document.addEventListener('keydown', async e => {
    if(e.key !== 'Delete' && e.key !== 'Backspace' && e.key !== 'Escape') return;
    const a = document.activeElement;
    if(a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable)) return;

    if(e.key === 'Escape'){                       // soltar la selección sin borrar
      if(guiaSel){ guiaSel = null; renderGuias(); e.preventDefault(); }
      else if(campoSel !== null && campoSel !== undefined){ campoSel = null; renderChips(); renderFieldSettings(); e.preventDefault(); }
      return;
    }

    // una guía se quita sin preguntar: vuelve a ponerse arrastrando desde la regla
    if(guiaSel){
      const { eje, i } = guiaSel;
      if(guiasDe()[eje][i] !== undefined){ e.preventDefault(); quitarGuia(eje, i); return; }
      guiaSel = null;
    }

    if(campoSel === null || campoSel === undefined) return;
    const f = config.fields[campoSel];
    if(!f) return;
    e.preventDefault();
    if(!await preguntar({
      titulo: 'Quitar este campo',
      peligro: true,
      aceptar: 'Sí, quitarlo',
      cuerpo: `<p>Se quita «<b>${escapeHtml(f.nombre || 'sin nombre')}</b>» de esta plantilla, con
        su posición, sus márgenes y su tipografía. Habría que volver a colocarlo a mano.</p>`,
    })) return;
    config.fields.splice(campoSel, 1);
    campoSel = null;
    renderChips(); renderFieldSettings();
  });

  function bloqueOpacidad(f, i){
    return `<label title="Opacidad">Opacidad <input type="range" data-i="${i}" data-p="opacity" min="0.05" max="1"
      step="0.05" value="${opacityOf(f)}" style="width:96px;vertical-align:middle;">
      <b data-op-lbl="${i}">${Math.round(opacityOf(f)*100)}%</b></label>`;
  }

  function renderFieldSettings(){
    const wrap = document.getElementById('fieldSettings');
    wrap.innerHTML = config.fields.map((f, i) => {
      const abierto = campoSel === i;
      const tipoEt = f.tipo === 'qr' ? 'QR' : f.tipo === 'imagen' ? 'Imagen' : 'Texto';

      // ---- cabecera: siempre visible y corta ----
      const cabecera = `<div class="campo-cab" data-abrir="${i}">
        <span class="campo-orden">
          <button class="mini" data-subir="${i}" title="Subir: queda por delante de los de abajo" ${i===0?'disabled':''}>&#9650;</button>
          <button class="mini" data-bajar="${i}" title="Bajar: queda por detrás de los de arriba" ${i===config.fields.length-1?'disabled':''}>&#9660;</button>
        </span>
        <label onclick="event.stopPropagation()" title="Se imprime en el certificado">
          <input type="checkbox" data-i="${i}" data-p="activo" ${f.activo?'checked':''}></label>
        <input type="text" data-i="${i}" data-p="nombre" value="${escapeHtml(f.nombre)}"
          onclick="event.stopPropagation()" title="Debe coincidir con el encabezado de esa columna en tu Excel"
          placeholder="Nombre de la columna" class="campo-nombre">
        <span class="campo-tipo">${tipoEt}</span>
        <span class="campo-resumen">${[
          !f.activo ? 'oculto' : '',
          (config.overrides && config.overrides[f.nombre]) ? `fijo: ${escapeHtml(String(config.overrides[f.nombre]))}` : '',
        ].filter(Boolean).join(' · ')}</span>
        <button class="campo-flecha" data-toggle="${i}" title="${abierto ? 'Cerrar opciones' : 'Abrir opciones'}"
          onclick="event.stopPropagation()">${abierto ? '&#9650; opciones' : '&#9660; opciones'}</button>
      </div>`;

      if(!abierto) return `<div class="campo ${f.activo?'':'apagado'}">${cabecera}</div>`;

      // ---- cuerpo: sólo del campo elegido ----
      let cuerpo = '';
      if(f.tipo === 'qr'){
        cuerpo = `<div class="campo-fila">
          <label>Tamaño <input type="number" data-i="${i}" data-p="size" value="${f.size}" style="width:66px;"> px</label>
          ${bloqueOpacidad(f, i)}
        </div>`;
      } else if(f.tipo === 'imagen'){
        cuerpo = `<div class="campo-fila">
          <span class="img-muestra">${f.dataUrl ? `<img loading="lazy" decoding="async" src="${f.dataUrl}" alt="">` : '<i>sin archivo</i>'}</span>
          <label class="btn outline small" style="margin:0;">${f.dataUrl ? 'Cambiar imagen' : 'Subir PNG o JPG'}
            <input type="file" accept="image/png,image/jpeg,image/webp" data-img-file="${i}" style="display:none;"></label>
          <label>Ancho <input type="number" data-i="${i}" data-p="widthPct" value="${f.widthPct ?? 18}"
            min="1" max="100" step="0.5" style="width:66px;"> %</label>
          ${bloqueOpacidad(f, i)}
          <button class="btn outline small" data-centrar="${i}">Centrar</button>
        </div>
        <p class="hint" style="margin:6px 0 0;">Arrástrala en la plantilla para colocarla; el punto verde cambia el ancho.</p>`;
      } else {
        cuerpo = `<div class="campo-fila">
          <span class="font-picker" data-font-i="${i}">
            <button type="button" class="font-picker-btn" style="font-family:${escapeHtml(f.fontFamily || 'Georgia, serif')};"
              data-font-btn="${i}">${escapeHtml(fontLabelFor(f.fontFamily))} &#9662;</button>
            <div class="font-picker-list" data-font-list="${i}" style="display:none;">
              ${FONT_OPTIONS.map(o => `<div class="font-picker-opt" data-font-i="${i}" data-font-value="${escapeHtml(o.value)}" style="font-family:${escapeHtml(o.value)};">${escapeHtml(o.label)}</div>`).join('')}
            </div></span>
          <input type="color" data-i="${i}" data-p="color" value="${f.color}" title="Color de la letra">
          <label><input type="checkbox" data-i="${i}" data-p="bold" ${f.bold?'checked':''}> Negrita</label>
          <select data-i="${i}" data-p="align" title="Alineación dentro de la caja">
            <option value="left" ${f.align==='left'?'selected':''}>Izquierda</option>
            <option value="center" ${f.align==='center'?'selected':''}>Centro</option>
            <option value="right" ${f.align==='right'?'selected':''}>Derecha</option>
          </select>
        </div>
        <div class="campo-fila">
          <label title="La letra se achica sola hasta el mínimo si el texto no cabe">
            Letra de <input type="number" data-i="${i}" data-p="maxFontSize" value="${f.maxFontSize}" style="width:58px;">
            a <input type="number" data-i="${i}" data-p="minFontSize" value="${f.minFontSize}" style="width:58px;"> px</label>
          <label>Si un texto no cabe ni al mínimo
            <select data-i="${i}" data-p="desborde">
              <option value="ajustar" ${f.desborde==='ajustar'?'selected':''}>Ajustar tamaño al margen</option>
              <option value="abajo" ${f.desborde==='abajo'?'selected':''}>Seguir hacia abajo</option>
            </select></label>
          <button type="button" class="ayuda-btn" data-ayuda-texto="Qué hacer con un texto tan largo que no cabe ni con la letra al tamaño mínimo. «Ajustar tamaño al margen» sigue achicando la letra —por debajo del mínimo si hace falta— hasta que quepa entera en una sola línea, sin invadir nunca lo que haya arriba o abajo de esta caja: usa esto en campos apretados entre otros textos, como el Nombre. «Seguir hacia abajo» respeta el tamaño mínimo y en vez de achicar más la letra, reparte el texto en varias líneas que arrancan en el borde superior de la caja y crecen hacia abajo: usa esto si quieres letra siempre legible en campos con espacio libre debajo, como un título de curso largo.">?</button>
          <label>Formato
            <select data-i="${i}" data-p="formato">
              <option value="ninguno" ${(f.formato||'ninguno')==='ninguno'?'selected':''}>Tal cual</option>
              <option value="cedula" ${f.formato==='cedula'?'selected':''}>C&eacute;dula 12.345.678</option>
              <option value="mayusculas" ${f.formato==='mayusculas'?'selected':''}>MAY&Uacute;SCULAS</option>
            </select></label>
          ${bloqueOpacidad(f, i)}
        </div>
        <div class="campo-fila">
          <label style="flex:1;min-width:240px;"
            title="Deja vacío para que cada persona use su propio dato del Excel">
            Valor fijo para TODOS los certificados de esta plantilla
            <input type="text" data-valor-fijo="${i}" value="${escapeHtml((config.overrides && config.overrides[f.nombre]) || '')}"
              placeholder="vacío = usa el Excel de cada persona" style="width:100%;" ${f.usarPlantillaTexto ? 'disabled' : ''}>
          </label>
        </div>
        <p class="hint" style="margin:2px 0 0;">${f.usarPlantillaTexto
          ? 'Se ignora mientras esté activo el «texto con una parte fija y una variable» de abajo.'
          : `Si escribes algo aquí, esa palabra reemplaza a la columna
          «${escapeHtml(f.nombre || '')}» del Excel para <b>todas</b> las personas de esta plantilla — sin tocar
          el Excel ni las demás plantillas. Sirve para reutilizar el mismo diseño y el mismo Excel en varias
          sesiones que sólo cambian, por ejemplo, la fecha. El ajuste manual de un certificado puntual (en la
          Matriz) sigue ganando sobre este valor.`}</p>
        <div class="campo-fila" style="flex-direction:column;align-items:stretch;margin-top:10px;">
          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" data-plantilla-activar="${i}" ${f.usarPlantillaTexto ? 'checked' : ''}>
            Texto con una parte fija y una variable dentro (p.ej. «Titular de la cédula XX.XXX.XXX quien…»)
            <button type="button" class="ayuda-btn" data-ayuda-texto="Escribe el texto tal cual debe salir, y usa el selector «+ Insertar variable» para meter en el medio un dato que cambia por persona (una columna de tu Excel, como la Cédula, o el valor de otro campo de esta plantilla). Haz doble clic sobre una variable ya puesta para quitarla; el resto se escribe y se le pone espacios como cualquier texto normal. Mientras esto esté marcado, el valor fijo de arriba y la columna del Excel con el mismo nombre de este campo se ignoran: todo el texto sale de aquí.">?</button>
          </label>
          ${f.usarPlantillaTexto ? `
          <div class="plantilla-editor" data-plantilla-editor="${i}" contenteditable="true" spellcheck="false">${renderPlantillaEditorHtml(f.plantillaTexto)}</div>
          <div class="row" style="margin-top:6px;">
            <select data-plantilla-var-select="${i}">
              <option value="">+ Insertar variable…</option>
              ${variablesDisponibles(f).map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('')}
            </select>
          </div>` : ''}
        </div>
        <div class="campo-fila" style="flex-direction:column;align-items:stretch;margin-top:10px;">
          <label style="display:flex;align-items:center;gap:6px;">Colores y tipografías por letra (por ejemplo, las iniciales)
            <button type="button" class="ayuda-btn" data-ayuda-texto="Selecciona una o varias letras del texto de ejemplo de abajo —arrastra el mouse sobre ellas, o doble clic en una palabra— y pulsa «Aplicar a la selección» con el color y/o la tipografía que quieras (deja la tipografía en «misma del campo» si sólo quieres cambiar el color). Se guarda por posición dentro de la palabra (p.ej. «la 1ª letra de la 1ª palabra»), así que funciona igual sin importar el nombre real de cada persona ni cuánto mida.">?</button>
          </label>
          <div class="resaltado-muestra" data-resaltado-muestra="${i}">${renderMuestraResaltado(f)}</div>
          <div class="row" style="margin-top:6px;">
            <input type="color" data-resaltado-color="${i}"
              value="${escapeHtml((f.resaltados && f.resaltados.length) ? f.resaltados[f.resaltados.length-1].color : '#c0392b')}"
              title="Color a aplicar">
            <select data-resaltado-font="${i}" title="Tipografía a aplicar" style="max-width:190px;">
              <option value="">(misma tipografía del campo)</option>
              ${FONT_OPTIONS.map(o => `<option value="${escapeHtml(o.value)}" style="font-family:${escapeHtml(o.value)};"
                ${((f.resaltados && f.resaltados.length) ? f.resaltados[f.resaltados.length-1].fontFamily : '') === o.value ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
            </select>
            <button type="button" class="btn teal small" data-resaltado-aplicar="${i}">Aplicar a la selección</button>
            <button type="button" class="btn outline small" data-resaltado-quitar="${i}">Quitar de la selección</button>
            ${f.resaltados && f.resaltados.length ? `<button type="button" class="btn outline small" data-resaltado-limpiar="${i}">Quitar todos (${f.resaltados.length})</button>` : ''}
          </div>
        </div>
        <p class="hint" style="margin:6px 0 0;">En la plantilla: arrastra la etiqueta para mover el campo entero
          y las reglillas doradas para fijar los m&aacute;rgenes. El texto siempre queda centrado en la caja.</p>`;
      }

      return `<div class="campo abierto ${f.activo?'':'apagado'}">${cabecera}
        <div class="campo-cuerpo">${cuerpo}
          <div class="campo-pie"><button class="btn danger small" data-remove="${i}">Quitar campo</button></div>
        </div></div>`;
    }).join('');

    wrap.querySelectorAll('input,select').forEach(el => {
      if(!el.dataset.p) return;                       // los file inputs se manejan aparte
      const aplicar = () => {
        const i = Number(el.dataset.i), p = el.dataset.p;
        const val = el.type === 'checkbox' ? el.checked
          : (el.type === 'number' || el.type === 'range') ? Number(el.value) : el.value;
        // el valor fijo va indexado por nombre: al renombrar el campo hay que
        // mudar la llave o quedaría huérfano bajo el nombre anterior
        if(p === 'nombre' && config.overrides){
          const anterior = config.fields[i].nombre;
          if(val !== anterior && Object.prototype.hasOwnProperty.call(config.overrides, anterior)){
            config.overrides[val] = config.overrides[anterior];
            delete config.overrides[anterior];
          }
        }
        config.fields[i][p] = val;
        if(p === 'opacity'){
          const lbl = wrap.querySelector(`[data-op-lbl="${i}"]`);
          if(lbl) lbl.textContent = Math.round(val*100) + '%';
        }
        if(p === 'activo' || p === 'nombre' || p === 'widthPct' || p === 'opacity' || p === 'desborde') renderChips();
      };
      el.addEventListener('change', aplicar);
      if(el.type === 'range') el.addEventListener('input', aplicar);   // realimentación inmediata
    });
    // valor fijo por plantilla: no vive en config.fields[i] sino en config.overrides,
    // indexado por nombre de campo (igual que rowData), no por posición
    wrap.querySelectorAll('[data-valor-fijo]').forEach(inp => inp.addEventListener('change', () => {
      const i = Number(inp.dataset.valorFijo);
      const nombre = config.fields[i].nombre;
      config.overrides = config.overrides || {};
      const val = inp.value.trim();
      if(val) config.overrides[nombre] = val; else delete config.overrides[nombre];
      renderChips(); renderFieldSettings();
      renderMatrix();   // la insignia "✎ N fijos" de la cabecera debe verse al momento
    }));
    // texto con una parte fija y variables incrustadas: prender/apagar,
    // escribir libremente (con espacios y todo) e insertar/quitar variables
    wrap.querySelectorAll('[data-plantilla-activar]').forEach(chk => chk.addEventListener('change', () => {
      const i = Number(chk.dataset.plantillaActivar);
      const f = config.fields[i];
      // un texto compuesto suele ser una frase larga: si se prende por primera
      // vez y la caja todavía es la angosta de un campo de una sola palabra,
      // se ensancha sola para que no se recorte contra el margen
      if(chk.checked && !f.plantillaTexto){
        const b = boxOf(f);
        if(b.rightPct - b.leftPct < 80){ f.leftPct = 4; f.rightPct = 96; }
      }
      f.usarPlantillaTexto = chk.checked;
      renderChips(); renderTemplatePreview(); renderFieldSettings();
    }));
    wrap.querySelectorAll('[data-plantilla-editor]').forEach(cont => {
      cont.addEventListener('keydown', e => { if(e.key === 'Enter') e.preventDefault(); });
      cont.addEventListener('paste', e => {
        e.preventDefault();
        document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
      });
      cont.addEventListener('dblclick', async e => {
        const chip = e.target.closest('.var-chip');
        if(!chip || !cont.contains(chip)) return;
        if(!await preguntar({
          titulo: 'Quitar la variable',
          aceptar: 'Sí, quitarla',
          cuerpo: `<p>Se quita «<b>${escapeHtml(chip.dataset.var)}</b>» de este texto. El resto
            del texto se queda tal cual.</p>`,
        })) return;
        chip.remove();
        const i = Number(cont.dataset.plantillaEditor);
        config.fields[i].plantillaTexto = leerPlantillaEditorHtml(cont);
        renderChips(); renderTemplatePreview(); renderFieldSettings();
      });
      cont.addEventListener('blur', () => {
        const i = Number(cont.dataset.plantillaEditor);
        config.fields[i].plantillaTexto = leerPlantillaEditorHtml(cont);
        renderChips(); renderTemplatePreview(); renderFieldSettings();
      });
    });
    wrap.querySelectorAll('[data-plantilla-var-select]').forEach(sel => sel.addEventListener('change', () => {
      const i = Number(sel.dataset.plantillaVarSelect);
      if(sel.value) insertarVariableEnPlantilla(i, sel.value);
      sel.value = '';
    }));
    // colores y tipografías por letra: aplicar/quitar sobre lo que esté
    // seleccionado en el recuadro de muestra, o borrar todos los de ese campo
    wrap.querySelectorAll('[data-resaltado-aplicar]').forEach(btn => btn.addEventListener('click', () => {
      const i = Number(btn.dataset.resaltadoAplicar);
      const color = wrap.querySelector(`[data-resaltado-color="${i}"]`).value;
      const fontFamily = wrap.querySelector(`[data-resaltado-font="${i}"]`).value;
      aplicarEstiloASeleccion(i, { color, fontFamily: fontFamily || undefined });
    }));
    wrap.querySelectorAll('[data-resaltado-quitar]').forEach(btn => btn.addEventListener('click', () => {
      aplicarEstiloASeleccion(Number(btn.dataset.resaltadoQuitar), null);
    }));
    wrap.querySelectorAll('[data-resaltado-limpiar]').forEach(btn => btn.addEventListener('click', () => {
      config.fields[Number(btn.dataset.resaltadoLimpiar)].resaltados = [];
      renderChips(); renderTemplatePreview(); renderFieldSettings();
    }));
    // subir la imagen de un campo tipo imagen
    wrap.querySelectorAll('[data-img-file]').forEach(inp => inp.addEventListener('change', e => {
      const i = Number(inp.dataset.imgFile);
      const file = e.target.files && e.target.files[0];
      if(!file) return;
      if(!/^image\/(png|jpeg|webp)$/.test(file.type)){ alert('Usa un PNG, JPG o WEBP.'); return; }
      if(file.size > 4*1024*1024){ alert('La imagen supera los 4 MB. Redúcela antes de subirla.'); return; }
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          config.fields[i].dataUrl = reader.result;
          config.fields[i].ratio = img.naturalHeight / img.naturalWidth;   // para cuadrarla sin deformar
          renderChips(); renderFieldSettings();
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    }));
    wrap.querySelectorAll('[data-centrar]').forEach(b => b.addEventListener('click', () => {
      config.fields[Number(b.dataset.centrar)].xPct = 50;
      renderChips(); renderFieldSettings();
    }));
    // abrir / cerrar el campo elegido (y resaltarlo en la plantilla)
    wrap.querySelectorAll('[data-toggle]').forEach(b => b.addEventListener('click', () => {
      const i = Number(b.dataset.toggle);
      campoSel = (campoSel === i) ? null : i;
      if(guiaSel){ guiaSel = null; renderGuias(); }
      renderChips(); renderFieldSettings();
    }));
    wrap.querySelectorAll('[data-abrir]').forEach(el => el.addEventListener('click', () => {
      const i = Number(el.dataset.abrir);
      campoSel = (campoSel === i) ? null : i;
      if(guiaSel){ guiaSel = null; renderGuias(); }
      renderChips(); renderFieldSettings();
    }));
    // reordenar: el orden de esta lista es el orden de las columnas del Excel
    const mover = (i, salto) => {
      const j = i + salto;
      if(j < 0 || j >= config.fields.length) return;
      [config.fields[i], config.fields[j]] = [config.fields[j], config.fields[i]];
      if(campoSel === i) campoSel = j; else if(campoSel === j) campoSel = i;
      renderChips(); renderFieldSettings();
    };
    wrap.querySelectorAll('[data-subir]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); mover(Number(b.dataset.subir), -1);
    }));
    wrap.querySelectorAll('[data-bajar]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); mover(Number(b.dataset.bajar), +1);
    }));
    wrap.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {
      config.fields.splice(Number(b.dataset.remove), 1);
      renderChips();
      renderFieldSettings();
    }));
    wrap.querySelectorAll('[data-font-btn]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const list = wrap.querySelector(`[data-font-list="${btn.dataset.fontBtn}"]`);
        const wasOpen = list.style.display === 'block';
        document.querySelectorAll('.font-picker-list').forEach(l => { l.style.display = 'none'; });
        list.style.display = wasOpen ? 'none' : 'block';
      });
    });
    wrap.querySelectorAll('.font-picker-opt').forEach(opt => {
      opt.addEventListener('click', e => {
        e.stopPropagation();
        const i = Number(opt.dataset.fontI);
        config.fields[i].fontFamily = opt.dataset.fontValue;
        renderFieldSettings();
      });
    });
  }

  document.getElementById('btnAgregarCampo').addEventListener('click', () => {
    const nombre = document.getElementById('nuevoCampoNombre').value.trim();
    const tipo = document.getElementById('nuevoCampoTipo').value;
    if(!nombre){ alert('Ponle un nombre al campo (debe coincidir con el encabezado de esa columna en tu Excel/CSV).'); return; }
    const base = { nombre, tipo, activo: true, opacity: 1 };
    if(tipo === 'qr') Object.assign(base, { xPct: 50, yPct: 50, size: 110 });
    else if(tipo === 'imagen') Object.assign(base, { xPct: 50, yPct: 50, widthPct: 18, dataUrl: null, ratio: 1 });
    else Object.assign(base, { leftPct: 25, rightPct: 75, yPct: 50, maxFontSize: 28, minFontSize: 14, color: '#132743', align: 'center', bold: false, fontFamily: 'Georgia, serif', formato: 'ninguno' });
    config.fields.push(base);
    document.getElementById('nuevoCampoNombre').value = '';
    renderChips();
    renderFieldSettings();
  });

  /**
   * Lee un PNG, JPG o PDF y lo deja listo para usar como fondo de una
   * plantilla: si es PDF, convierte su primera página a imagen con pdf.js.
   * La usan tanto la carga de un solo archivo (más abajo) como la carga
   * masiva de varios diseños o de una carpeta completa de la computadora.
   */
  async function cargarArchivoComoFondo(file){
    if(file.type === 'application/pdf'){
      const buf = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
      const page = await pdf.getPage(1);
      const scale = 1600 / page.getViewport({ scale: 1 }).width;
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      return { background: canvas.toDataURL('image/png'), bgWidth: canvas.width, bgHeight: canvas.height };
    }
    const dataUrl = await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => res(reader.result);
      reader.onerror = () => rej(reader.error || new Error('No se pudo leer el archivo'));
      reader.readAsDataURL(file);
    });
    const img = await new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error('El archivo no es una imagen válida'));
      im.src = dataUrl;
    });
    return { background: dataUrl, bgWidth: img.naturalWidth, bgHeight: img.naturalHeight };
  }

  document.getElementById('inputBg').addEventListener('change', async e => {
    const file = e.target.files[0];
    if(!file) return;
    const bgMsg = document.getElementById('bgMsg');
    const esPdf = file.type === 'application/pdf';
    if(esPdf) bgMsg.innerHTML = '<span class="hint">Convirtiendo PDF…</span>';
    try{
      const { background, bgWidth, bgHeight } = await cargarArchivoComoFondo(file);
      config.background = background;
      config.bgWidth = bgWidth;
      config.bgHeight = bgHeight;
      renderTemplatePreview();
      bgMsg.innerHTML = esPdf ? '<span class="hint">PDF convertido ✓ (se usó la primera página)</span>' : '';
    }catch(err){
      bgMsg.innerHTML = `<div class="msg err">No se pudo leer el archivo: ${escapeHtml(err.message)}</div>`;
    }
  });

  /**
   * Crea una plantilla nueva por cada archivo válido (PNG/JPG/PDF), con el
   * nombre del archivo (sin extensión) como nombre de la plantilla. Salen con
   * los campos por defecto — para eso está "Copiar a TODA una carpeta", que
   * las deja a todas con el mismo diseño de campos de una sola vez.
   * `obtenerCarpeta` puede ser una carpeta fija (texto) para todos los
   * archivos, o una función `file => carpeta` cuando la carpeta de cada
   * archivo depende de en qué subcarpeta venía dentro de la carpeta que se
   * subió desde la computadora (carpetas dentro de carpetas reales).
   */
  async function crearPlantillasDesdeArchivos(archivos, obtenerCarpeta){
    const resolverCarpeta = typeof obtenerCarpeta === 'function' ? obtenerCarpeta : () => obtenerCarpeta;
    const validos = archivos
      .filter(f => /^image\/(png|jpeg)$|^application\/pdf$/.test(f.type))
      .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, 'es', { numeric: true }));
    const indices = [];
    let fallos = 0;
    for(const file of validos){
      try{
        const { background, bgWidth, bgHeight } = await cargarArchivoComoFondo(file);
        const cfg = normalizarConfig(defaultConfig());
        cfg.background = background;
        cfg.bgWidth = bgWidth;
        cfg.bgHeight = bgHeight;
        cfg.carpeta = normalizarRutaCarpeta(resolverCarpeta(file));
        cfg.orden = siguienteOrdenEnCarpeta(cfg.carpeta);
        const nombre = file.name.replace(/\.[^./]+$/, '') || file.name;
        templatesFull.push({ id: null, nombre, config: cfg });
        indices.push(templatesFull.length - 1);
      }catch(e){ fallos++; }
    }
    return { indices, fallos, ignorados: archivos.length - validos.length };
  }

  /** `carpetas` es una ruta (texto) o una lista de rutas, cuando la subida tocó varias subcarpetas a la vez. */
  function despuesDeSubirPlantillas(indices, carpetas){
    for(const i of indices) matrixTemplateSelection.add(i);
    if(indices.length){ currentIdx = indices[indices.length - 1]; config = templatesFull[currentIdx].config; }
    const lista = Array.isArray(carpetas) ? carpetas : [carpetas];
    for(const c of lista) carpetasVacias.delete(normalizarRutaCarpeta(c));
    renderTemplateSelector();
    renderTemplatePreview();
    renderMatrixTplSelector();
    renderMatrix();
  }

  /**
   * Soltar uno o varios archivos del escritorio de la computadora directo
   * encima de una carpeta ya creada en el tablero: los crea como plantillas
   * ahí mismo, sin tener que escribir antes el nombre de la carpeta y usar el
   * botón "Subir diseños". `carpetaDestino` es la ruta exacta de la carpeta
   * (o '' para "Sin carpeta").
   */
  async function manejarDropDeArchivosExternos(archivos, carpetaDestino){
    const etiqueta = carpetaDestino ? etiquetaCarpeta(carpetaDestino) : 'Sin carpeta';
    const el = document.getElementById('tplMsg');
    el.textContent = `Subiendo ${archivos.length} archivo(s) a «${etiqueta}»…`;
    const { indices, fallos, ignorados } = await crearPlantillasDesdeArchivos(archivos, carpetaDestino);
    despuesDeSubirPlantillas(indices, carpetaDestino);
    el.textContent = indices.length
      ? `${indices.length} plantilla(s) creada(s) directo en «${etiqueta}» ✓.` +
        (fallos ? ` ${fallos} archivo(s) con error.` : '') +
        (ignorados ? ` ${ignorados} archivo(s) se ignoraron por no ser PNG, JPG ni PDF.` : '')
      : 'Ninguno de los archivos soltados era un PNG, JPG o PDF válido.';
  }

  // Sin esto, si el arrastre cae fuera de una carpeta (o falla algo), el
  // navegador intenta "abrir" el archivo y navega fuera de la página.
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => e.preventDefault());

  document.getElementById('btnSubirDisenos').addEventListener('click', () => {
    const carpeta = document.getElementById('nuevaCarpetaNombre').value.trim();
    if(!carpeta){ alert('Escribe primero, en el campo de arriba, el nombre de la carpeta donde quieres subir los diseños.'); return; }
    document.getElementById('inputSubirDisenos').click();
  });
  document.getElementById('inputSubirDisenos').addEventListener('change', async e => {
    const carpeta = normalizarRutaCarpeta(document.getElementById('nuevaCarpetaNombre').value);
    const archivos = [...e.target.files];
    e.target.value = '';
    if(!archivos.length || !carpeta) return;
    const el = document.getElementById('tplMsg');
    el.textContent = `Subiendo ${archivos.length} archivo(s)…`;
    const { indices, fallos, ignorados } = await crearPlantillasDesdeArchivos(archivos, carpeta);
    despuesDeSubirPlantillas(indices, carpeta);
    el.textContent = `${indices.length} plantilla(s) creada(s) en «${etiquetaCarpeta(carpeta)}» ✓.` +
      (fallos ? ` ${fallos} archivo(s) con error.` : '') +
      (ignorados ? ` ${ignorados} archivo(s) se ignoraron por no ser PNG, JPG ni PDF.` : '') +
      ` Ahora puedes usar "Copiar a TODA una carpeta" para ponerles a todas el mismo diseño de campos.`;
  });

  document.getElementById('btnSubirCarpetaCompleta').addEventListener('click', () => {
    document.getElementById('inputSubirCarpetaCompleta').click();
  });
  document.getElementById('inputSubirCarpetaCompleta').addEventListener('change', async e => {
    const archivos = [...e.target.files];
    e.target.value = '';
    if(!archivos.length) return;
    // el nombre de la carpeta que se eligió en el explorador de archivos del
    // sistema es la primera parte de la ruta relativa de cualquiera de sus archivos
    const carpetaRaiz = (archivos[0].webkitRelativePath || '').split('/')[0] || 'Carpeta subida';
    // si dentro de esa carpeta hay sub-subcarpetas (p.ej. "Diplomado 2026/Módulo 1/cert.png"),
    // cada archivo hereda TODA su ruta de carpetas, no sólo el nombre de la carpeta raíz que
    // se eligió: así "carpetas dentro de carpetas" del disco se reflejan igual aquí adentro.
    const carpetaDeArchivo = file => {
      const partes = (file.webkitRelativePath || '').split('/');
      partes.pop();   // el último segmento es el nombre del archivo, no una carpeta
      return normalizarRutaCarpeta(partes.join('/')) || normalizarRutaCarpeta(carpetaRaiz);
    };
    const el = document.getElementById('tplMsg');
    el.textContent = `Subiendo ${archivos.length} archivo(s) de "${carpetaRaiz}"…`;
    const { indices, fallos, ignorados } = await crearPlantillasDesdeArchivos(archivos, carpetaDeArchivo);
    const carpetasTocadas = [...new Set(archivos.map(carpetaDeArchivo))];
    despuesDeSubirPlantillas(indices, carpetasTocadas);
    const huboSubcarpetas = carpetasTocadas.some(c => c.includes('/'));
    el.textContent = indices.length
      ? `${indices.length} plantilla(s) creada(s) a partir de "${carpetaRaiz}" de tu computadora` +
        (huboSubcarpetas ? ', respetando sus subcarpetas' : '') + ' ✓.' +
        (fallos ? ` ${fallos} archivo(s) con error.` : '') +
        (ignorados ? ` ${ignorados} archivo(s) se ignoraron por no ser PNG, JPG ni PDF.` : '')
      : `No se encontró ningún PNG, JPG o PDF dentro de "${carpetaRaiz}".`;
  });

  document.getElementById('btnResetBg').addEventListener('click', () => {
    Object.assign(config, normalizarConfig(defaultConfig()));
    renderTemplatePreview();
  });

  document.getElementById('btnVistaPrevia').addEventListener('click', async () => {
    await ensureFontsLoadedForConfig(config);
    const placeholderRow = {};
    for(const f of config.fields) if(f.tipo === 'texto') placeholderRow[f.nombre] = 'XXXXXXXXX';
    const dummyUrl = new URL(RUTA_VERIFICAR, location.href).href + '?c=preview';
    const canvas = await renderCertificateCanvas(placeholderRow, dummyUrl, config);
    document.getElementById('previewSingleImg').src = canvas.toDataURL('image/png');
    document.getElementById('previewSingleWrap').style.display = 'block';
  });
  document.getElementById('btnCerrarPreview').addEventListener('click', () => {
    document.getElementById('previewSingleWrap').style.display = 'none';
  });

  document.getElementById('btnVistaPreviaTodas').addEventListener('click', async () => {
    const wrap = document.getElementById('galeriaPlantillasWrap');
    wrap.innerHTML = '<p class="hint">Generando vista previa de cada plantilla…</p>';
    const items = [];
    for(const t of templatesFull){
      await ensureFontsLoadedForConfig(t.config);
      const placeholderRow = {};
      for(const f of t.config.fields) if(f.tipo === 'texto') placeholderRow[f.nombre] = 'XXXXXXXXX';
      const dummyUrl = new URL(RUTA_VERIFICAR, location.href).href + '?c=preview';
      const canvas = await renderCertificateCanvas(placeholderRow, dummyUrl, t.config);
      items.push({ nombre: t.nombre, dataUrl: canvas.toDataURL('image/jpeg', 0.75) });
    }
    wrap.innerHTML = `
      <div class="row" style="margin-top:6px;">
        <button class="btn outline small" id="btnCerrarGaleriaPlantillas">Ocultar biblioteca de certificados</button>
      </div>
      <div class="gallery">${items.map(it => `
        <figure><img loading="lazy" decoding="async" src="${it.dataUrl}" alt=""><figcaption><b>${escapeHtml(it.nombre)}</b></figcaption></figure>
      `).join('')}</div>`;
    document.getElementById('btnCerrarGaleriaPlantillas').addEventListener('click', () => { wrap.innerHTML = ''; });
  });

  // ---------- Importar datos ----------
  // Cada columna del Excel/CSV se empareja por nombre (sin distinguir mayúsculas)
  // contra los campos de texto activos de TODAS las plantillas guardadas (un
  // estudiante puede necesitar datos para más de un formato de certificado).
  /** Nombres de columna usados como {{variable}} dentro de algún "texto con variables incrustadas", en cualquier plantilla: clave normalizada (sin tildes/mayúsculas) -> nombre tal cual se escribió la primera vez. */
  function variablesUsadasEnPlantillas(){
    const nombres = new Map();
    for(const t of templatesFull){
      for(const f of t.config.fields){
        if(f.tipo === 'texto' && f.usarPlantillaTexto && f.plantillaTexto){
          for(const m of f.plantillaTexto.matchAll(/\{\{([^{}]+)\}\}/g)){
            const nombre = m[1].trim();
            const key = normalizarNombreCampo(nombre);
            if(!nombres.has(key)) nombres.set(key, nombre);
          }
        }
      }
    }
    return nombres;
  }

  function activeTextFieldNamesUnion(){
    // Los nombres se emparejan sin distinguir mayúsculas/minúsculas NI tildes en
    // todo el resto del flujo (importación, matrix, etc.), así que la unión
    // también debe deduplicar así — si no, "Fecha"/"fecha" o "Cédula"/"cedula"
    // en dos plantillas distintas generan dos columnas separadas con el mismo dato.
    const seen = new Map(); // clave normalizada -> primera variante de mayúsculas/tildes vista
    const variablesUsadas = variablesUsadasEnPlantillas();
    for(const t of templatesFull){
      for(const f of t.config.fields){
        // un campo cuenta aunque esté apagado si se usa como variable dentro de
        // un texto compuesto: puede que nunca se imprima "suelto", sólo incrustado
        if(f.tipo === 'texto' && (f.activo || variablesUsadas.has(normalizarNombreCampo(f.nombre)))){
          const key = normalizarNombreCampo(f.nombre);
          if(!seen.has(key)) seen.set(key, f.nombre);
        }
      }
    }
    // columnas usadas como variable que no coinciden con ningún campo definido
    // (p.ej. una columna del Excel que sólo se usa dentro de una frase, sin
    // tener su propia caja en el certificado) también deben poder importarse
    for(const [key, nombre] of variablesUsadas){
      if(!seen.has(key)) seen.set(key, nombre);
    }
    return [...seen.values()];
  }

  document.getElementById('btnDescargarExcel').addEventListener('click', () => {
    const fields = activeTextFieldNamesUnion();
    if(!fields.length){ alert('No hay campos de texto activos en ninguna plantilla todavía.'); return; }
    const aoa = [
      ['Plantilla de graduados — completa una fila por estudiante. No cambies los nombres de columna (fila 2).'],
      fields,
    ];
    for(let i = 0; i < 30; i++) aoa.push(fields.map(() => ''));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: Math.max(0, fields.length - 1) } }];
    ws['!cols'] = fields.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Graduados');
    XLSX.writeFile(wb, 'plantilla_graduados.xlsx');
  });

  function findHeaderRowIndex(lines, fieldNames){
    const normNames = fieldNames.map(normalizarNombreCampo);
    let bestIdx = 0, bestScore = -1;
    const scanLimit = Math.min(lines.length, 15);
    for(let i = 0; i < scanLimit; i++){
      const rowNorm = lines[i].map(c => normalizarNombreCampo(c));
      const score = normNames.filter(n => rowNorm.includes(n)).length;
      if(score > bestScore){ bestScore = score; bestIdx = i; }
    }
    return bestIdx;
  }

  /**
   * Excel/Sheets suele exportar números grandes ya formateados con coma de
   * miles ("14,130,689"), pero acá los números de cédula se escriben con
   * puntos ("14.130.689"). Sólo se toca el valor si tiene exactamente esa
   * forma (dígitos agrupados de a 3 separados por comas, sin nada más), para
   * no alterar texto que use comas por otro motivo (p. ej. una lista de
   * cursos separados por coma).
   */
  function normalizarSeparadorMiles(valor){
    return /^\d{1,3}(,\d{3})+$/.test(valor) ? valor.replace(/,/g, '.') : valor;
  }

  function mapLinesToRows(lines){
    if(!lines.length) return { rows: [], missing: [] };
    const activeTextFields = activeTextFieldNamesUnion();
    const headerIdx = findHeaderRowIndex(lines, activeTextFields);
    const header = lines[headerIdx].map(h => normalizarNombreCampo(h));
    const idxByField = {};
    const missing = [];
    for(const name of activeTextFields){
      const idx = header.findIndex(h => h === normalizarNombreCampo(name));
      idxByField[name] = idx;
      if(idx < 0) missing.push(name);
    }
    const parsedRows = lines.slice(headerIdx + 1).filter(r => r.some(c => String(c ?? '').trim() !== '')).map(r => {
      const row = {};
      for(const name of activeTextFields){
        row[name] = idxByField[name] >= 0 ? normalizarSeparadorMiles(String(r[idxByField[name]] ?? '').trim()) : '';
      }
      return row;
    });
    return { rows: parsedRows, missing };
  }

  function parseDelimited(text){
    text = text.trim();
    if(!text) return { rows: [], missing: [] };
    const firstLine = text.split('\n')[0];
    const delim = (firstLine.split('\t').length > firstLine.split(',').length) ? '\t' : ',';
    const lines = [];
    let cur = '', row = [], inQuotes = false;
    for(let i = 0; i < text.length; i++){
      const c = text[i];
      if(inQuotes){
        if(c === '"'){
          if(text[i+1] === '"'){ cur += '"'; i++; } else inQuotes = false;
        } else cur += c;
      } else {
        if(c === '"') inQuotes = true;
        else if(c === delim){ row.push(cur); cur = ''; }
        else if(c === '\n'){ row.push(cur); lines.push(row); row = []; cur = ''; }
        else if(c === '\r'){ /* skip */ }
        else cur += c;
      }
    }
    row.push(cur); lines.push(row);
    return mapLinesToRows(lines);
  }

  document.getElementById('inputXlsx').addEventListener('change', async e => {
    const file = e.target.files[0];
    if(!file) return;
    try{
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const lines = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
      const { rows: r, missing } = mapLinesToRows(lines);
      rows = r;
      assignment = rows.map(() => new Set());
      renderPreviewTable(missing);
      renderMatrix();
      renderFieldSettings();   // refresca la vista de ejemplo si hay un campo abierto (texto con variables, colores por letra)
    }catch(err){
      alert('No se pudo leer el archivo Excel: ' + err.message);
    }
  });

  function renderPreviewTable(missing){
    const wrap = document.getElementById('previewTableWrap');
    const warn = (missing && missing.length)
      ? `<div class="msg err">No se encontraron estas columnas en tu archivo (el nombre debe coincidir con el del campo en alguna plantilla): ${missing.map(escapeHtml).join(', ')}</div>`
      : '';
    if(!rows.length){
      wrap.innerHTML = warn + '<p class="hint">Sin datos importados todavía.</p>';
      document.getElementById('btnGenerar').disabled = true;
      return;
    }
    const cols = activeTextFieldNamesUnion();
    wrap.innerHTML = warn + `<table><thead><tr>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}<th></th></tr></thead>
    <tbody>${rows.map((r,i) => `<tr>${cols.map(c => `<td>${escapeHtml(r[c])}</td>`).join('')}
      <td><button class="btn outline small" data-del="${i}">Quitar</button></td>
    </tr>`).join('')}</tbody></table>`;
    wrap.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      const idx = Number(b.dataset.del);
      rows.splice(idx, 1);
      assignment.splice(idx, 1);
      renderPreviewTable();
      renderMatrix();
    }));
    document.getElementById('btnGenerar').disabled = rows.length === 0;
  }

  document.getElementById('btnParsePaste').addEventListener('click', () => {
    const { rows: r, missing } = parseDelimited(document.getElementById('pasteData').value);
    rows = r;
    assignment = rows.map(() => new Set());
    renderPreviewTable(missing);
    renderMatrix();
    renderFieldSettings();   // refresca la vista de ejemplo si hay un campo abierto (texto con variables, colores por letra)
  });

  document.getElementById('btnImportarUrl').addEventListener('click', async () => {
    const url = document.getElementById('sheetUrl').value.trim();
    if(!url) return;
    try{
      const res = await fetch(url);
      const text = await res.text();
      const { rows: r, missing } = parseDelimited(text);
      rows = r;
      assignment = rows.map(() => new Set());
      renderPreviewTable(missing);
      renderMatrix();
      renderFieldSettings();   // refresca la vista de ejemplo si hay un campo abierto (texto con variables, colores por letra)
    }catch(e){
      alert('No se pudo importar desde esa URL (revisa que el Sheet esté publicado como CSV). Puedes pegar los datos manualmente.');
    }
  });

  // ---------- Asignación de certificados por estudiante ----------
  function studentDisplayName(row, idx){
    const nombre = row['Nombre'] || row['nombre'];
    const apellido = row['Apellido'] || row['apellido'];
    if(nombre || apellido) return [nombre, apellido].filter(Boolean).join(' ');
    const first = Object.values(row).find(v => v);
    return first || `Estudiante ${idx + 1}`;
  }

  /* De quién es este certificado.
     ═══════════════════════════════════════════════════════════════════════
     Aquí NO se puede usar «el primer valor que tenga algo», que es lo que se
     hacía. Los datos de un certificado emitido vuelven de la base como `jsonb`,
     y jsonb **no guarda el orden en que se escribieron las claves**: las
     reordena por longitud y luego alfabéticamente. Con las claves de estos
     grupos —fecha(5), Nombre(6), Cédula(7)— la primera acaba siendo `fecha`,
     así que el «nombre» con el que se bautizaba cada PDF del ZIP era la fecha
     de graduación repetida en los cuarenta y dos archivos.

     Se busca por el nombre de la columna, y sólo si no hay ninguna reconocible
     se cae al primer valor que no sea uno de los campos que sabemos que no son
     una persona. */
  const CLAVES_DE_NOMBRE = ['nombre', 'nombres', 'nombre completo', 'alumno', 'alumna',
    'estudiante', 'participante', 'graduado', 'graduada', 'titular'];
  const CLAVES_QUE_NO_SON_NOMBRE = ['fecha', 'cedula', 'cédula', 'ci', 'dni', 'documento',
    'puntaje', 'nota', 'horas', 'curso', 'modulo', 'módulo', 'correo', 'email', 'telefono', 'teléfono'];
  const sinTildes = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

  function nombreDelGraduado(datos, respaldo = ''){
    const d = datos || {};
    const entradas = Object.entries(d).filter(([, v]) => String(v ?? '').trim());

    const porClave = (lista) => entradas.find(([k]) => lista.includes(sinTildes(k)));
    const nombre  = porClave(CLAVES_DE_NOMBRE);
    const apellido = entradas.find(([k]) => ['apellido', 'apellidos'].includes(sinTildes(k)));
    if(nombre) return [nombre[1], apellido && apellido[1]].filter(Boolean).join(' ').trim();
    if(apellido) return String(apellido[1]).trim();

    const otro = entradas.find(([k]) => !CLAVES_QUE_NO_SON_NOMBRE.includes(sinTildes(k)));
    return otro ? String(otro[1]).trim() : respaldo;
  }

  function renderMatrixTplSelector(){
    const wrap = document.getElementById('matrixTplSelector');
    if(!templatesFull.length){ wrap.innerHTML = ''; return; }
    const grupos = agruparPorCarpeta(templatesFull);
    wrap.innerHTML = `
      <p class="hint" style="margin-bottom:4px;">¿Qué plantillas quieres usar en esta generación?</p>
      <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">
        ${grupos.map(g => {
          const colapsada = g.carpeta && carpetasColapsadas.has(g.carpeta);
          return `
          <div style="${g.carpeta ? 'border:1px solid var(--border);border-radius:8px;padding:7px 10px;' : ''}">
            ${g.carpeta ? `<div class="hint" style="font-weight:600;margin-bottom:4px;display:flex;align-items:center;gap:6px;cursor:pointer;"
                data-matrix-carpeta-toggle="${escapeHtml(g.carpeta)}">
              <span class="carpeta-flecha">${colapsada ? '▸' : '▾'}</span>
              📁 ${escapeHtml(etiquetaCarpeta(g.carpeta))}
              <span class="hint" style="font-weight:400;">(${g.items.length})</span>
              <label style="font-weight:400;margin-left:8px;" onclick="event.stopPropagation()">
                <input type="checkbox" data-matrix-carpeta="${escapeHtml(g.carpeta)}"
                ${g.items.every(({i}) => matrixTemplateSelection.has(i)) ? 'checked' : ''}> todas</label>
            </div>` : ''}
            <div class="row" style="margin-bottom:0;${colapsada ? 'display:none;' : ''}">
              ${g.items.map(({ t, i }) => `<label class="hint" style="display:flex;align-items:center;gap:5px;">
                <input type="checkbox" data-matrix-tpl="${i}" ${matrixTemplateSelection.has(i) ? 'checked' : ''}> ${escapeHtml(t.nombre)}
              </label>`).join('')}
            </div>
          </div>
        `;
        }).join('')}
      </div>`;
    wrap.querySelectorAll('[data-matrix-carpeta-toggle]').forEach(head => head.addEventListener('click', () => {
      const c = head.dataset.matrixCarpetaToggle;
      if(carpetasColapsadas.has(c)) carpetasColapsadas.delete(c); else carpetasColapsadas.add(c);
      renderMatrixTplSelector();
    }));
    wrap.querySelectorAll('[data-matrix-tpl]').forEach(cb => cb.addEventListener('change', () => {
      const ti = Number(cb.dataset.matrixTpl);
      if(cb.checked){
        matrixTemplateSelection.add(ti);
        // Activar una plantilla para la generación la asigna de una vez a TODOS
        // los estudiantes de la lista (lo mismo que marcar "todos" en su columna
        // de la Matriz): es el caso normal — casi siempre todos reciben el mismo
        // certificado — y evita el doble paso de venir aquí y luego ir a la
        // Matriz a marcar cada columna. Quien quiera dejarla fuera para algún
        // estudiante puntual puede desmarcar esa celda a mano después.
        for(const set of assignment) set.add(ti);
      } else {
        matrixTemplateSelection.delete(ti);
        // Si se quita una plantilla de esta generación, también se limpian las
        // asignaciones puntuales que tuviera para no generarla "a escondidas".
        for(const set of assignment) set.delete(ti);
      }
      // se vuelve a pintar también ESTE selector: si no, la casilla "todas" de
      // su carpeta se queda con el estado de antes de tocar una individual
      renderMatrixTplSelector();
      renderMatrix();
    }));
    wrap.querySelectorAll('[data-matrix-carpeta]').forEach(cb => cb.addEventListener('change', () => {
      const carpeta = cb.dataset.matrixCarpeta;
      templatesFull.forEach((t, i) => {
        if((t.config.carpeta || '').trim() !== carpeta) return;
        if(cb.checked){ matrixTemplateSelection.add(i); for(const set of assignment) set.add(i); }
        else { matrixTemplateSelection.delete(i); for(const set of assignment) set.delete(i); }
      });
      renderMatrixTplSelector();
      renderMatrix();
    }));
  }

  function renderMatrix(){
    const wrap = document.getElementById('matrixWrap');
    // Al marcar una casilla se vuelve a construir toda la tabla desde cero, y
    // con eso el navegador reinicia el scroll horizontal a 0: sin guardar y
    // restaurar aquí, cada clic manda la vista de vuelta al borde izquierdo y
    // hay que volver a desplazarse para ver el resto de las columnas.
    const scrollPrevio = wrap.querySelector('.matrix-wrap')?.scrollLeft || 0;
    if(!rows.length){
      wrap.innerHTML = '<p class="hint">Importa graduados arriba para poder asignarles certificados.</p>';
      return;
    }
    const activeTis = templatesFull.map((_, i) => i).filter(ti => matrixTemplateSelection.has(ti));
    if(!activeTis.length){
      wrap.innerHTML = '<p class="hint">Elige arriba al menos una plantilla para esta generación.</p>';
      return;
    }
    wrap.innerHTML = `<div class="matrix-wrap"><table>
      <thead>
        <tr><th>Estudiante</th>${activeTis.map(ti => {
          const carpeta = (templatesFull[ti].config.carpeta || '').trim();
          const fijos = templatesFull[ti].config.overrides || {};
          const nFijos = Object.keys(fijos).length;
          const tituloFijos = nFijos ? `Valores fijos de esta plantilla: ${Object.entries(fijos).map(([k,v])=>`${k}=${v}`).join(', ')}` : '';
          return `<th>${carpeta ? `<div class="carpeta-chip">📁 ${escapeHtml(etiquetaCarpeta(carpeta))}</div>` : ''}
            ${escapeHtml(templatesFull[ti].nombre)}
            ${nFijos ? `<br><span title="${escapeHtml(tituloFijos)}"
                style="display:inline-block;font-size:10px;padding:1px 7px;border-radius:8px;background:var(--teal);color:#fff;margin-top:2px;">✎ ${nFijos} fijo${nFijos>1?'s':''}</span>` : ''}
            <br><label class="hint" style="justify-content:center;"><input type="checkbox" data-bulk="${ti}" ${rows.length && rows.every((_, ri) => assignment[ri] && assignment[ri].has(ti)) ? 'checked' : ''}> todos</label></th>`;
        }).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map((r, ri) => `<tr>
          <td>${escapeHtml(studentDisplayName(r, ri))}</td>
          ${activeTis.map(ti => {
            const marcado = assignment[ri] && assignment[ri].has(ti);
            const tieneAj = !!ajustesPorCert[`${ri}:${ti}`];
            return `<td><input type="checkbox" data-row="${ri}" data-tpl="${ti}" ${marcado ? 'checked' : ''}>
              ${marcado ? `<button class="btn outline small" data-ajustar="${ri}:${ti}" title="Ajustar este certificado a mano"
                  style="margin-left:4px;padding:2px 6px;">${tieneAj ? '✎ ajustado' : '✎'}</button>` : ''}</td>`;
          }).join('')}
        </tr>`).join('')}
      </tbody>
    </table></div>`;
    wrap.querySelector('.matrix-wrap').scrollLeft = scrollPrevio;
    wrap.querySelectorAll('[data-bulk]').forEach(cb => cb.addEventListener('change', () => {
      const ti = Number(cb.dataset.bulk);
      for(let ri = 0; ri < rows.length; ri++){
        if(cb.checked) assignment[ri].add(ti); else assignment[ri].delete(ti);
      }
      renderMatrix();
    }));
    wrap.querySelectorAll('[data-row]').forEach(cb => cb.addEventListener('change', () => {
      const ri = Number(cb.dataset.row), ti = Number(cb.dataset.tpl);
      if(cb.checked) assignment[ri].add(ti); else assignment[ri].delete(ti);
      renderMatrix();
    }));
    wrap.querySelectorAll('[data-ajustar]').forEach(b => b.addEventListener('click', () => {
      const [ri, ti] = b.dataset.ajustar.split(':').map(Number);
      abrirAjuste(ri, ti);
    }));
  }

  // ---------- Ajuste manual de un certificado concreto ----------
  async function abrirAjuste(ri, ti){
    const clave = `${ri}:${ti}`;
    const row = rows[ri], tpl = templatesFull[ti];
    if(!tpl) return;
    const aj = JSON.parse(JSON.stringify(ajustesPorCert[clave] || {}));
    const campos = tpl.config.fields.filter(f => f.activo && f.tipo === 'texto');

    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = `<div class="modal-caja">
      <div class="modal-cab">
        <b>Ajustar certificado — ${escapeHtml(studentDisplayName(row, ri))}</b>
        <span class="hint">${escapeHtml(tpl.nombre)}</span>
        <button class="btn outline small" data-cerrar>Cerrar</button>
      </div>
      <div class="modal-cuerpo">
        <p class="hint" style="margin-top:0;">Sólo afecta a este certificado. Los demás siguen usando la plantilla tal cual.</p>
        <img loading="lazy" decoding="async" id="ajustePrev" alt="Vista previa" style="width:100%;border:1px solid var(--border);border-radius:6px;background:#fff;">
        <table style="margin-top:12px;">
          <thead><tr><th>Campo</th><th>Texto (vacío = el valor de abajo)</th><th>Letra</th><th>← →</th><th>↑ ↓</th></tr></thead>
          <tbody>
            ${campos.map(f => {
              const a = aj[f.nombre] || {};
              const fijo = tpl.config.overrides && tpl.config.overrides[f.nombre];
              const valorEfectivo = (fijo !== undefined && fijo !== null && fijo !== '') ? fijo : row[f.nombre];
              const origen = (fijo !== undefined && fijo !== null && fijo !== '') ? 'fijo de esta plantilla' : 'del Excel';
              return `<tr>
                <td><b>${escapeHtml(f.nombre)}</b><br><span class="hint">${escapeHtml(String(valorEfectivo ?? '—')).slice(0,28)} (${origen})</span></td>
                <td><input type="text" data-aj="${escapeHtml(f.nombre)}" data-k="texto" value="${escapeHtml(a.texto || '')}"
                      placeholder="${escapeHtml(String(valorEfectivo ?? ''))}" style="width:100%;min-width:130px;"></td>
                <td><input type="number" data-aj="${escapeHtml(f.nombre)}" data-k="dSize" value="${a.dSize ?? 0}" step="1" style="width:62px;" title="Puntos de más o de menos"></td>
                <td><input type="number" data-aj="${escapeHtml(f.nombre)}" data-k="dxPct" value="${a.dxPct ?? 0}" step="0.5" style="width:62px;" title="Desplazamiento horizontal en %"></td>
                <td><input type="number" data-aj="${escapeHtml(f.nombre)}" data-k="dyPct" value="${a.dyPct ?? 0}" step="0.5" style="width:62px;" title="Desplazamiento vertical en %"></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        <div class="row" style="margin-top:12px;">
          <button class="btn teal" data-guardar>Guardar ajuste</button>
          <button class="btn outline" data-limpiar>Quitar ajustes de este certificado</button>
        </div>
      </div>
    </div>`;
    document.body.appendChild(fondo);

    const pintar = async () => {
      await ensureFontsLoadedForConfig(tpl.config);
      const url = new URL(RUTA_VERIFICAR, location.href).href + '?c=preview';
      const c = await renderCertificateCanvas(row, url, tpl.config, aj);
      fondo.querySelector('#ajustePrev').src = c.toDataURL('image/jpeg', 0.8);
    };
    await pintar();

    fondo.querySelectorAll('[data-aj]').forEach(inp => inp.addEventListener('change', async () => {
      const campo = inp.dataset.aj, k = inp.dataset.k;
      const val = inp.type === 'number' ? Number(inp.value) : inp.value;
      aj[campo] = aj[campo] || {};
      if(val === '' || val === 0) delete aj[campo][k]; else aj[campo][k] = val;
      if(!Object.keys(aj[campo]).length) delete aj[campo];
      await pintar();
    }));
    const cerrar = () => fondo.remove();
    fondo.querySelector('[data-cerrar]').addEventListener('click', cerrar);
    fondo.addEventListener('click', e => { if(e.target === fondo) cerrar(); });
    fondo.querySelector('[data-guardar]').addEventListener('click', () => {
      if(Object.keys(aj).length) ajustesPorCert[clave] = aj; else delete ajustesPorCert[clave];
      cerrar(); renderMatrix();
    });
    fondo.querySelector('[data-limpiar]').addEventListener('click', () => {
      delete ajustesPorCert[clave];
      cerrar(); renderMatrix();
    });
  }

  /** Reemplaza cada "{{Columna}}" de `plantilla` por el dato de esa columna en `rowData` (vacío si no existe). Empareja sin tildes/mayúsculas, igual que el resto de la importación. */
  function resolverPlantillaTexto(plantilla, rowData){
    const porNombreNormalizado = new Map();
    for(const clave of Object.keys(rowData || {})) porNombreNormalizado.set(normalizarNombreCampo(clave), rowData[clave]);
    return String(plantilla || '').replace(/\{\{([^{}]+)\}\}/g, (m, nombre) => {
      const val = porNombreNormalizado.get(normalizarNombreCampo(nombre));
      return (val === undefined || val === null) ? '' : String(val);
    });
  }

  /** Nombres de columna que se pueden insertar como variable: las del Excel ya importado y los demás campos de texto de esta plantilla. Sin duplicados por tildes/mayúsculas. */
  function variablesDisponibles(f){
    const vistos = new Map();
    const deExcel = rows.length ? Object.keys(rows[0]) : [];
    const deCampos = config.fields.filter(x => x !== f && x.tipo === 'texto').map(x => x.nombre);
    for(const nombre of [...deExcel, ...deCampos]){
      if(!nombre) continue;
      const key = normalizarNombreCampo(nombre);
      if(!vistos.has(key)) vistos.set(key, nombre);
    }
    return [...vistos.values()];
  }

  /** Arma el HTML editable (texto suelto + una "chip" no editable por cada variable) a partir de una plantilla "...{{Var}}...". */
  function renderPlantillaEditorHtml(plantilla){
    const partes = String(plantilla || '').split(/(\{\{[^{}]+\}\})/g);
    return partes.map(p => {
      const m = p.match(/^\{\{([^{}]+)\}\}$/);
      if(m) return `<span class="var-chip" contenteditable="false" data-var="${escapeHtml(m[1].trim())}">${escapeHtml(m[1].trim())}</span>`;
      return escapeHtml(p);
    }).join('');
  }

  /** Lee el recuadro editable y arma de vuelta la plantilla "...{{Var}}..." a partir de su texto y sus chips. */
  function leerPlantillaEditorHtml(cont){
    let out = '';
    cont.childNodes.forEach(n => {
      if(n.nodeType === Node.TEXT_NODE) out += n.textContent;
      else if(n.classList && n.classList.contains('var-chip')) out += `{{${n.dataset.var}}}`;
      else out += n.textContent;   // por si el navegador mete algún elemento inesperado al escribir
    });
    return out;
  }

  /** Inserta una "chip" de variable en el punto donde estaba el cursor (o al final si no había) y guarda. */
  async function insertarVariableEnPlantilla(i, nombreVar){
    const cont = document.querySelector(`[data-plantilla-editor="${i}"]`);
    if(!cont || !nombreVar) return;
    cont.focus();
    const sel = window.getSelection();
    let range;
    if(sel && sel.rangeCount && cont.contains(sel.getRangeAt(0).commonAncestorContainer)){
      range = sel.getRangeAt(0);
    } else {
      range = document.createRange();
      range.selectNodeContents(cont);
      range.collapse(false);
    }
    range.deleteContents();
    const chip = document.createElement('span');
    chip.className = 'var-chip';
    chip.contentEditable = 'false';
    chip.dataset.var = nombreVar;
    chip.textContent = nombreVar;
    range.insertNode(chip);
    range.setStartAfter(chip);
    range.setEndAfter(chip);
    sel.removeAllRanges();
    sel.addRange(range);
    config.fields[i].plantillaTexto = leerPlantillaEditorHtml(cont);

    // si ese mismo dato ya se imprime aparte, en su propio recuadro, se avisa
    // para poder apagarlo y que no salga repetido dos veces en el certificado
    const key = normalizarNombreCampo(nombreVar);
    const otroIdx = config.fields.findIndex((f, fi) => fi !== i && f.tipo === 'texto' && f.activo && normalizarNombreCampo(f.nombre) === key);
    if(otroIdx >= 0){
      const otro = config.fields[otroIdx];
      if(await preguntar({
        titulo: 'Ese dato saldría dos veces',
        aceptar: `Sí, apagar «${otro.nombre}»`,
        cuerpo: `<p>«<b>${escapeHtml(otro.nombre)}</b>» ya está activo y se imprime aparte, en su
          propio recuadro. Si lo dejas así, «${escapeHtml(nombreVar)}» va a salir <b>dos veces</b> en
          el certificado: aquí dentro del texto y también en ese recuadro.</p>`,
      })){
        otro.activo = false;
        renderChips();
        // no se hace un renderFieldSettings() completo aquí para no perder el
        // cursor en el editor que se está usando ahora mismo; se actualiza sólo
        // lo necesario del otro campo (su casilla y el atenuado de su tarjeta)
        const chkOtro = document.querySelector(`[data-i="${otroIdx}"][data-p="activo"]`);
        if(chkOtro){ chkOtro.checked = false; chkOtro.closest('.campo')?.classList.add('apagado'); }
      }
    }
  }

  /**
   * Recorre `text` y para cada carácter dice a qué palabra pertenece (0-based,
   * separadas por espacios) y qué posición ocupa dentro de esa palabra (0-based).
   * Los espacios devuelven null. Es la MISMA función que usa el editor (para
   * saber qué letra se seleccionó) y el render (para pintarla), así que
   * «la 1ª letra de la 1ª palabra» significa lo mismo en los dos lados, sin
   * importar el nombre real de cada persona ni cuánto mida.
   */
  function posicionesPorPalabra(text){
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
  function estilosPorCaracter(text, f){
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

  /** Texto de muestra para el editor de "colores y tipografías por letra": el dato real si ya hay, si no el valor fijo, si no un ejemplo genérico. */
  function muestraTextoPara(f){
    if(f.usarPlantillaTexto) return resolverPlantillaTexto(f.plantillaTexto, (rows.length && rows[0]) || {}) || 'Nombre Apellido';
    if(rows.length && rows[0][f.nombre]) return String(rows[0][f.nombre]);
    if(config.overrides && config.overrides[f.nombre]) return String(config.overrides[f.nombre]);
    return 'Nombre Apellido';
  }

  /** Arma el HTML del recuadro de muestra: una letra por span, ya pintada con su color/tipografía actual. */
  function renderMuestraResaltado(f){
    const texto = aplicarFormato(muestraTextoPara(f), f.formato) || '';
    const estilos = estilosPorCaracter(texto, f);
    const base = { color: f.color, fontFamily: f.fontFamily || 'Georgia, serif' };
    return texto.split('').map((ch, i) => {
      const e = (estilos && estilos[i]) || base;
      return `<span data-idx="${i}" style="color:${escapeHtml(e.color)};font-family:${escapeHtml(e.fontFamily)};">${ch === ' ' ? '&nbsp;' : escapeHtml(ch)}</span>`;
    }).join('');
  }

  /**
   * Aplica (o, si `estilo` es null, quita) un color y/o tipografía a las letras
   * seleccionadas en el recuadro de muestra del campo `i`. La selección se
   * traduce a posiciones "letra N de la palabra M" con `posicionesPorPalabra`,
   * así que queda válida para cualquier nombre real, no sólo para el texto de
   * ejemplo. `estilo.fontFamily` en `undefined` deja la tipografía del campo.
   */
  function aplicarEstiloASeleccion(i, estilo){
    const cont = document.querySelector(`[data-resaltado-muestra="${i}"]`);
    if(!cont) return;
    const sel = window.getSelection();
    if(!sel || !sel.rangeCount || sel.isCollapsed){
      alert('Primero selecciona una o varias letras del texto de ejemplo (arrastra el mouse sobre ellas, o doble clic en una palabra).');
      return;
    }
    const range = sel.getRangeAt(0);
    if(!cont.contains(range.commonAncestorContainer)){
      alert('Selecciona letras dentro del recuadro de ejemplo de este campo.');
      return;
    }
    const f = config.fields[i];
    const texto = aplicarFormato(muestraTextoPara(f), f.formato) || '';
    const posiciones = posicionesPorPalabra(texto);
    f.resaltados = f.resaltados || [];
    let tocadas = 0;
    cont.querySelectorAll('span[data-idx]').forEach(span => {
      if(!range.intersectsNode(span)) return;
      const pos = posiciones[Number(span.dataset.idx)];
      if(!pos) return;   // los espacios no se colorean
      f.resaltados = f.resaltados.filter(r => !(r.palabra === pos.palabra && r.letra === pos.letra));
      if(estilo) f.resaltados.push({ palabra: pos.palabra, letra: pos.letra, ...estilo });
      tocadas++;
    });
    sel.removeAllRanges();
    if(!tocadas){ alert('La selección no tocó ninguna letra (¿elegiste sólo un espacio?).'); return; }
    ensureFontsLoadedForConfig(config).then(() => { renderChips(); renderTemplatePreview(); renderFieldSettings(); });
  }

  // ---------- Generar ----------
  function fitFontSize(ctx, text, fontFamily, bold, maxSize, minSize, maxWidthPx){
    let size = maxSize;
    for(; size > minSize; size--){
      ctx.font = `${bold ? 'bold ' : ''}${size}px ${fontFamily}`;
      if(ctx.measureText(text).width <= maxWidthPx) break;
    }
    return size;
  }

  /** Ancho de `text` a un tamaño dado cuando cada carácter puede tener su propia tipografía (letras con estilo distinto). */
  function anchoMixto(ctx, text, estilos, bold, size){
    let w = 0;
    for(let i = 0; i < text.length; i++){
      ctx.font = `${bold ? 'bold ' : ''}${size}px ${estilos[i].fontFamily}`;
      w += ctx.measureText(text[i]).width;
    }
    return w;
  }
  /** Igual que fitFontSize, pero cuando el campo tiene letras con tipografía propia (distinta a la del resto). */
  function fitFontSizeMixto(ctx, text, estilos, bold, maxSize, minSize, maxWidthPx){
    let size = maxSize;
    for(; size > minSize; size--){
      if(anchoMixto(ctx, text, estilos, bold, size) <= maxWidthPx) break;
    }
    return size;
  }

  /** Ancho de `text` (que empieza en `startIdx` dentro del texto completo) a un tamaño dado, con o sin letras de estilo propio. */
  function medirAncho(ctx, text, estilos, startIdx, bold, fontFamily, size){
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
  function envolverLineas(ctx, text, estilos, bold, fontFamily, size, maxWidthPx){
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
  function envolverLineasBalanceado(ctx, text, estilos, bold, fontFamily, size, maxWidthPx){
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

  /**
   * Dibuja un certificado.
   * `ajustes` son las correcciones manuales de ESTE certificado concreto
   * (ver sección "Ajustar"): { [nombreCampo]: {texto, dSize, dxPct, dyPct} }.
   */
  /* ============ los fondos se descargan y decodifican una sola vez ============
     Cada certificado volvía a pedir y decodificar la imagen de fondo de su
     plantilla. Generar cien certificados de ocho formatos eran ochocientas
     descargas de la misma media docena de imágenes. Ahora se guardan
     decodificadas en memoria mientras la pestaña esté abierta. */
  const fondosEnMemoria = new Map();

  function fondoDecodificado(url){
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
   * Ejecuta `tareas` de a `ancho` en paralelo, devolviendo los resultados EN EL
   * MISMO ORDEN en que se pidieron. El orden importa: de él dependen el orden
   * de los archivos dentro del ZIP y las páginas del PDF combinado.
   *
   * Se limita el paralelismo a propósito: lanzar cien dibujados de golpe llena
   * la memoria del navegador con cien lienzos de 1600×2263 y lo deja peor que
   * haciéndolos de uno en uno.
   */
  async function enTandas(tareas, ancho, alAvanzar){
    const resultados = new Array(tareas.length);
    let siguiente = 0;
    async function trabajador(){
      while (siguiente < tareas.length) {
        const i = siguiente++;
        try { resultados[i] = { ok: true, valor: await tareas[i]() }; }
        catch (e) { resultados[i] = { ok: false, error: e }; }
        if (alAvanzar) alAvanzar();
      }
    }
    await Promise.all(Array.from({ length: Math.min(ancho, tareas.length) }, trabajador));
    return resultados;
  }

  async function renderCertificateCanvas(rowData, verifyUrl, cfg, ajustes){
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

  function renderGenerationHistory(){
    const wrap = document.getElementById('generationHistoryWrap');
    if(!generationHistory.length){
      wrap.innerHTML = '<p class="hint">Todavía no has generado ningún lote de certificados.</p>';
      return;
    }
    wrap.innerHTML = generationHistory.map((g, gi) => {
      const pendientes = g.results.filter(r => r.ok && !r.registrado).length;
      const todosRegistrados = g.okCount > 0 && pendientes === 0;
      return `
      <div class="gen-entry">
        <div class="gen-entry-head" data-gen-toggle="${gi}">
          <div><b>Generación del ${g.timestamp.toLocaleDateString('es-ES')} · ${g.timestamp.toLocaleTimeString('es-ES')}</b>
            <span class="hint"> — ${g.okCount} de ${g.totalCount} certificados</span>
            ${g.okCount > 0 ? (todosRegistrados
              ? ' <span class="badge vigente">Registrado</span>'
              : ' <span class="badge borrador">Vista previa — sin registrar</span>') : ''}
          </div>
          <span class="hint">${g.expanded ? '▲ ocultar' : '▼ ver'}</span>
        </div>
        ${g.expanded ? `
          <div class="gen-entry-body">
            ${g.okCount > 0 ? `
              <div class="msg ${todosRegistrados ? 'ok' : 'warn'}">
                ${todosRegistrados
                  ? `✓ Estos ${g.okCount} certificados ya están registrados: sus códigos QR verifican y aparecen en «Certificados emitidos».`
                  : `Esto es sólo una <b>vista previa</b> — nada se ha guardado todavía. Revisa los PDF y, cuando
                     estén bien, pulsa "Registrar certificados" para que queden oficiales. Si algo está mal,
                     descarta esta vista previa y vuelve a generar.`}
              </div>
              <div class="row" style="margin-top:8px;">
                ${!todosRegistrados ? `<button class="btn gold" data-gen-registrar="${gi}" ${g.registrando ? 'disabled' : ''}>
                  ${g.registrando ? 'Registrando…' : `Registrar ${pendientes} certificado(s)`}</button>` : ''}
                ${!todosRegistrados && pendientes === g.okCount ? `<button class="btn outline" data-gen-descartar="${gi}">Descartar vista previa</button>` : ''}
              </div>
            ` : ''}
            <div class="row" style="margin-top:8px;">
              ${g.zipUrl ? `<button class="btn outline small" data-gen-zip="${gi}">Descargar ZIP (por estudiante)</button>` : ''}
            </div>
            ${(g.combinedPdfs && g.combinedPdfs.length) ? `
              <p class="hint" style="margin-bottom:4px;">PDF combinado por plantilla (todas las páginas juntas, para imprimir de una vez):</p>
              <div class="row">
                ${g.combinedPdfs.map((c, ci) => `<button class="btn outline small" data-gen-combined="${gi}:${ci}">${escapeHtml(c.templateNombre)} (${c.pageCount} pág.)</button>`).join('')}
              </div>
            ` : ''}
            <div class="gallery">${g.results.filter(r=>r.ok).map(r => `
              <figure><img loading="lazy" decoding="async" src="${r.thumbDataUrl}" alt=""><figcaption><b>${escapeHtml(r.studentName)}</b>${escapeHtml(r.templateNombre)}</figcaption></figure>
            `).join('')}</div>
            <table style="margin-top:10px;"><thead><tr><th>Estudiante</th><th>Plantilla</th><th>Estado</th><th>Descargas</th></tr></thead>
            <tbody>${g.results.map(r => `<tr>
              <td>${escapeHtml(r.studentName)}</td>
              <td>${escapeHtml(r.templateNombre)}</td>
              <td>${!r.ok ? '<span class="badge revocado">Error</span>'
                : r.registrado ? '<span class="badge vigente">Emitido</span>' : '<span class="badge borrador">Vista previa</span>'}</td>
              <td>${r.ok ? `<a href="${r.pdfUrl}" download="${escapeHtml(r.path.split('/').pop())}">Descargar PDF</a> · <a href="${r.verifyUrl}" target="_blank">Verificación</a>` : escapeHtml(r.error)}</td>
            </tr>`).join('')}</tbody></table>
          </div>
        ` : ''}
      </div>
    `;
    }).join('');
    wrap.querySelectorAll('[data-gen-toggle]').forEach(el => el.addEventListener('click', () => {
      const gi = Number(el.dataset.genToggle);
      generationHistory[gi].expanded = !generationHistory[gi].expanded;
      renderGenerationHistory();
    }));
    wrap.querySelectorAll('[data-gen-zip]').forEach(btn => btn.addEventListener('click', () => {
      const gi = Number(btn.dataset.genZip);
      const a = document.createElement('a');
      a.href = generationHistory[gi].zipUrl; a.download = 'certificados_por_estudiante.zip'; a.click();
    }));
    wrap.querySelectorAll('[data-gen-combined]').forEach(btn => btn.addEventListener('click', () => {
      const [gi, ci] = btn.dataset.genCombined.split(':').map(Number);
      const c = generationHistory[gi].combinedPdfs[ci];
      const a = document.createElement('a');
      a.href = c.url; a.download = c.filename; a.click();
    }));
    wrap.querySelectorAll('[data-gen-descartar]').forEach(btn => btn.addEventListener('click', async () => {
      const gi = Number(btn.dataset.genDescartar);
      if(!await preguntar({
        titulo: 'Descartar la vista previa',
        aceptar: 'Sí, descartarla',
        cuerpo: `<p>Se pierden los certificados generados en pantalla. Como todavía no se
          registraron, <b>no queda ningún rastro guardado</b>: nadie los ha recibido y ningún
          código empezó a verificar.</p>
          <p>Se pueden volver a generar cuando quieras.</p>`,
      })) return;
      generationHistory.splice(gi, 1);
      renderGenerationHistory();
    }));
    wrap.querySelectorAll('[data-gen-registrar]').forEach(btn => btn.addEventListener('click', async () => {
      const gi = Number(btn.dataset.genRegistrar);
      const g = generationHistory[gi];
      const pendientes = g.results.filter(r => r.ok && !r.registrado);
      if(!pendientes.length) return;
      if(!await preguntar({
        titulo: `Registrar ${pendientes.length} certificado(s)`,
        aceptar: `Sí, registrar ${pendientes.length}`,
        cuerpo: `<p>Quedan <b>oficiales</b>: sus códigos QR empiezan a verificar y aparecen en
          «Certificados emitidos».</p>
          <p>Después no se quitan descartando la vista previa: hay que revocarlos uno por uno.</p>`,
      })) return;
      g.registrando = true;
      renderGenerationHistory();
      let fallos = 0;
      for(const r of pendientes){
        try{
          const { error } = await supabase.rpc('issue_certificate',
            { p_datos: r.row, p_entidad: g.entidad, p_lote: g.loteId, p_id: r.id, p_plantilla: r.templateNombre });
          if(error) throw error;
          r.registrado = true;
        }catch(e){
          r.registroError = e.message;
          fallos++;
        }
      }
      g.registrando = false;
      renderGenerationHistory();
      await loadIssued();
      await loadLotes();
      if(fallos) alert(`${fallos} certificado(s) no se pudieron registrar. Vuelve a pulsar "Registrar" para reintentar sólo esos.`);
    }));
  }

  document.getElementById('btnGenerar').addEventListener('click', async () => {
    const totalPairs = assignment.reduce((n, s) => n + s.size, 0);
    if(totalPairs === 0){ alert('Marca al menos un certificado para al menos un estudiante en la sección 3.'); return; }

    for(const t of templatesFull) await ensureFontsLoadedForConfig(t.config);

    const entidad = document.getElementById('entidadEmisora').value.trim() || 'CEM';
    const loteId = crypto.randomUUID();
    const progress = document.getElementById('progressBar');
    progress.style.display = 'block'; progress.max = totalPairs; progress.value = 0;
    document.getElementById('btnGenerar').disabled = true;
    const genMsg = document.getElementById('genMsg');
    genMsg.innerHTML = '<p class="hint">Generando…</p>';
    const zip = new JSZip();
    const results = [];
    const { jsPDF } = window.jspdf;
    const mergedByTpl = new Map(); // ti -> { pdf, pageCount, templateNombre }
    // Orden estable de todas las plantillas: agrupadas por carpeta y, dentro de
    // cada una, en el orden que se fijó con las flechitas ▲▼. Con esto el ZIP
    // de cada estudiante y el PDF combinado por plantilla salen en ese mismo
    // orden, no en el orden en que se fueron marcando las casillas.
    const ordenGlobal = agruparPorCarpeta(templatesFull).flatMap(g => g.items).map(x => x.i);

    /* El dibujado de cada certificado es la parte lenta y es independiente del
       resto: se hace de a varios en paralelo. El armado del ZIP y del PDF
       combinado va después, EN ORDEN, porque de ese orden dependen los nombres
       de archivo y las páginas de cada PDF combinado. */
    const porDibujar = [];
    for(let ri = 0; ri < rows.length; ri++){
      const tisAsignados = ordenGlobal.filter(ti => assignment[ri].has(ti));
      tisAsignados.forEach((ti, pos) => {
        if(!templatesFull[ti]) return;
        porDibujar.push({ ri, ti, pos, row: rows[ri], tpl: templatesFull[ti],
                          studentName: studentDisplayName(rows[ri], ri),
                          id: crypto.randomUUID() });
      });
    }

    let hechos = 0;
    const actualizarAvance = () => {
      hechos++;
      progress.value = hechos;
      genMsg.innerHTML = `<p class="hint">Generando… ${hechos} de ${porDibujar.length}</p>`;
    };

    const dibujados = await enTandas(porDibujar.map(item => async () => {
      const verifyUrl = new URL(RUTA_VERIFICAR, location.href).href + '?c=' + item.id;
      // Ojo: aquí SÓLO se dibuja; nada se guarda en la base todavía. El QR ya
      // lleva el id definitivo, así que el PDF generado ahora sigue siendo
      // válido cuando más tarde se pulse "Registrar".
      const canvas = await renderCertificateCanvas(
        item.row, verifyUrl, item.tpl.config, ajustesPorCert[`${item.ri}:${item.ti}`]);
      return {
        verifyUrl,
        thumbDataUrl: canvas.toDataURL('image/jpeg', 0.7),
        jpgDataUrl: canvas.toDataURL('image/jpeg', 0.92),
        widthPt: canvas.width * 72 / 96,
        heightPt: canvas.height * 72 / 96,
      };
    }), 3, actualizarAvance);

    const carpetasPorEstudiante = new Map();
    for(let k = 0; k < porDibujar.length; k++){
      const item = porDibujar[k];
      const r = dibujados[k];
      if(!r.ok){
        results.push({ studentName: item.studentName, templateNombre: item.tpl.nombre,
                       error: r.error?.message || String(r.error), ok: false });
        continue;
      }
      const { verifyUrl, thumbDataUrl, jpgDataUrl, widthPt, heightPt } = r.valor;
      const orientation = widthPt > heightPt ? 'landscape' : 'portrait';

      let studentFolder = carpetasPorEstudiante.get(item.studentName);
      if(!studentFolder){
        studentFolder = zip.folder(sanitizeName(item.studentName));
        carpetasPorEstudiante.set(item.studentName, studentFolder);
      }

      const pdf = new jsPDF({ orientation, unit: 'pt', format: [widthPt, heightPt] });
      pdf.addImage(jpgDataUrl, 'JPEG', 0, 0, widthPt, heightPt);
      const pdfBlob = pdf.output('blob');
      // el número al frente hace que el explorador de archivos ya los
      // muestre en el orden correcto al abrir el ZIP
      const filename = `${String(item.pos + 1).padStart(2, '0')}_${sanitizeName(item.tpl.nombre)}_certificado.pdf`;
      studentFolder.file(filename, pdfBlob);

      results.push({ studentName: item.studentName, templateNombre: item.tpl.nombre, id: item.id,
        verifyUrl, pdfUrl: URL.createObjectURL(pdfBlob), thumbDataUrl,
        path: `${sanitizeName(item.studentName)}/${filename}`, ok: true, row: item.row, registrado: false });

      // Además del PDF individual por estudiante, se arma un PDF combinado por
      // plantilla (una página por estudiante) para poder imprimir de una sola
      // vez todos los certificados de ese mismo formato.
      let merged = mergedByTpl.get(item.ti);
      if(!merged){
        merged = { pdf: new jsPDF({ orientation, unit: 'pt', format: [widthPt, heightPt] }),
                   pageCount: 0, templateNombre: item.tpl.nombre };
        mergedByTpl.set(item.ti, merged);
      } else {
        merged.pdf.addPage([widthPt, heightPt], orientation);
      }
      merged.pdf.addImage(jpgDataUrl, 'JPEG', 0, 0, widthPt, heightPt);
      merged.pageCount++;
    }

    const okCount = results.filter(r => r.ok).length;
    genMsg.innerHTML = '';
    progress.style.display = 'none';

    const combinedPdfs = [];
    for(const merged of mergedByTpl.values()){
      const blob = merged.pdf.output('blob');
      const filename = `${sanitizeName(merged.templateNombre)}_TODOS.pdf`;
      zip.file(filename, blob);
      combinedPdfs.push({ templateNombre: merged.templateNombre, pageCount: merged.pageCount, url: URL.createObjectURL(blob), filename });
    }

    let zipUrl = null;
    if(okCount){
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      zipUrl = URL.createObjectURL(zipBlob);
    }

    generationHistory.unshift({ timestamp: new Date(), results, zipUrl, combinedPdfs, okCount, totalCount: totalPairs,
      expanded: true, entidad, loteId, registrando: false });
    renderGenerationHistory();

    document.getElementById('btnGenerar').disabled = false;
  });

  // ---------- Grupos de graduación ----------
  let lotes = [];

  async function loadLotes(){
    const wrap = document.getElementById('listaLotesWrap');
    const { data, error } = await supabase.rpc('list_cert_lotes');
    if(error){ wrap.innerHTML = `<div class="msg err">${escapeHtml(error.message)}</div>`; return; }
    lotes = data || [];
    renderLotes();
  }

  function renderLotes(){
    const wrap = document.getElementById('listaLotesWrap');
    if(!lotes.length){ wrap.innerHTML = '<p class="hint">Todavía no hay ningún grupo registrado.</p>'; return; }
    wrap.innerHTML = `<table><thead><tr>
      <th>Grupo</th><th>Graduados</th><th>Módulos</th><th>Certificados</th><th>Emitido</th><th>Acciones</th>
    </tr></thead><tbody>${lotes.map(l => `<tr>
      <td><b>${escapeHtml(l.nombre)}</b>
        ${l.nota ? `<br><span class="hint">${escapeHtml(l.nota)}</span>` : ''}</td>
      <td>${l.personas}</td>
      <td>${l.plantillas}</td>
      <td>${l.cuantos}${Number(l.vigentes) !== Number(l.cuantos)
            ? ` <span class="hint">(${l.vigentes} vigentes)</span>` : ''}</td>
      <td class="hora">${new Date(l.emitido_en).toLocaleDateString('es-ES')}</td>
      <td>
        <button class="btn teal small" data-ver-lote="${l.lote_id}"
          data-nombre="${escapeHtml(l.nombre)}"
          title="Ver cómo quedan antes de bajarse los ${l.cuantos}">👁 Ver</button>
        · <button class="btn outline small" data-bajar-lote="${l.lote_id}" data-formato="zip"
          data-nombre="${escapeHtml(l.nombre)}" data-cuantos="${l.cuantos}"
          title="Un archivo PDF por certificado, todos dentro de un ZIP">⬇ ZIP · ${l.cuantos} archivos</button>
        · <button class="btn outline small" data-bajar-lote="${l.lote_id}" data-formato="pdf"
          data-nombre="${escapeHtml(l.nombre)}" data-cuantos="${l.cuantos}"
          title="Un solo archivo con los ${l.cuantos} dentro, uno por página">⬇ Un solo PDF · ${l.cuantos} págs.</button>
        · <button class="btn outline small" data-renombrar-lote="${l.lote_id}"
            data-nombre="${escapeHtml(l.nombre)}">Renombrar</button>
      </td>
    </tr>
    <tr id="previa-${l.lote_id}" style="display:none;"><td colspan="6" class="previa-lote"></td></tr>`).join('')}</tbody></table>`;

    wrap.querySelectorAll('[data-ver-lote]').forEach(b => b.addEventListener('click', () =>
      previsualizarLote(b.dataset.verLote, b.dataset.nombre)));

    wrap.querySelectorAll('[data-bajar-lote]').forEach(b => b.addEventListener('click', () =>
      descargarLote(b.dataset.bajarLote, b.dataset.nombre, Number(b.dataset.cuantos), b.dataset.formato)));

    wrap.querySelectorAll('[data-renombrar-lote]').forEach(b => b.addEventListener('click', async () => {
      const nuevo = prompt('Nombre del grupo:', b.dataset.nombre);
      if(nuevo === null || !nuevo.trim()) return;
      const { error } = await supabase.rpc('cert_lote_guardar',
        { p_id: b.dataset.renombrarLote, p_nombre: nuevo.trim() });
      if(error){ alert('Error: ' + error.message); return; }
      await loadLotes();
    }));
  }

  /* ── Ver cómo queda un grupo antes de bajárselo ──────────────────────────
     Bajarse 266 PDF para descubrir que una fecha está mal es caro: son varios
     minutos de dibujo y luego hay que mirarlos uno a uno. Aquí se dibuja UNO
     por cada módulo del grupo —con los datos de una persona de verdad y la
     fecha que ese grupo guardó— y se ven los siete u ocho de un vistazo.

     Se enseña un diploma por MÓDULO y no uno por persona a propósito: lo que
     cambia entre personas es el nombre, y lo que se está comprobando es que
     cada módulo lleve su diseño y su fecha. Para revisar a alguien concreto
     está el selector. */
  const previasDeLote = new Map();   // loteId -> certificados, para no repedirlos

  async function previsualizarLote(loteId, nombre){
    const fila = document.getElementById(`previa-${loteId}`);
    if(!fila) return;
    const celda = fila.querySelector('.previa-lote');

    if(fila.style.display !== 'none'){ fila.style.display = 'none'; return; }
    fila.style.display = '';
    celda.innerHTML = '<p class="hint">Dibujando…</p>';

    let certs = previasDeLote.get(loteId);
    if(!certs){
      const { data, error } = await supabase.rpc('list_cert_certificates_de_lote', { p_lote: loteId });
      if(error){ celda.innerHTML = `<div class="msg err">${escapeHtml(error.message)}</div>`; return; }
      certs = data || [];
      previasDeLote.set(loteId, certs);
    }
    if(!certs.length){ celda.innerHTML = '<p class="hint">Ese grupo no tiene certificados.</p>'; return; }

    /* Una entrada por CÉDULA, no por nombre. Agrupando por nombre, alguien con
       el apellido escrito de dos formas —siete certificados corregidos y uno
       que se quedó atrás— salía como dos graduados distintos, y el grupo decía
       tener una persona de más. La cédula es lo único que no cambia al
       corregir; el nombre que se enseña es el del certificado más reciente,
       que es el que alguien ya se molestó en arreglar. */
    const porCedula = new Map();
    for(const c of certs){
      if(c.estado === 'reemplazado') continue;
      const ced = cedulaPlana((c.datos || {})['Cédula'] || (c.datos || {}).cedula);
      const nom = (c.datos || {}).Nombre;
      if(!ced || !nom) continue;
      const antes = porCedula.get(ced);
      if(!antes || new Date(c.created_at) > new Date(antes.cuando)) {
        porCedula.set(ced, { ced, nombre: nom, cuando: c.created_at });
      }
    }
    const personas = [...porCedula.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const elegida = personas.find(p => p.ced === celda.dataset.persona) || personas[0];

    /* Los módulos del grupo, en orden y con la fecha que lleva cada uno. Se
       saca de los propios certificados y no de las plantillas: lo que importa
       aquí es la fecha con la que se emitió ESTE grupo, que puede no ser la que
       la plantilla tenga hoy. */
    const modulos = [];
    for(const c of certs){
      if(c.estado !== 'vigente') continue;
      if(modulos.some(m => m.plantilla === c.plantilla_nombre)) continue;
      const d = c.datos || {};
      /* Qué clave guarda la fecha en ESTE módulo. Los certificados la llaman
         «fecha» y el diploma «Fecha»; adivinarlo por el nombre de la plantilla
         funciona hasta que alguien renombra una. Se mira el dato. */
      const campoFecha = ('fecha' in d) ? 'fecha' : ('Fecha' in d) ? 'Fecha' : 'fecha';
      modulos.push({
        plantilla: c.plantilla_nombre, fecha: d[campoFecha] || '', campoFecha,
        // A cuánta gente le falta: es lo que decide si tiene sentido ofrecer
        // «dárselo a los que no lo tienen».
        cuantos: new Set(certs
          .filter(x => x.estado === 'vigente' && x.plantilla_nombre === c.plantilla_nombre)
          .map(x => cedulaPlana((x.datos || {})['Cédula'] || (x.datos || {}).cedula))).size,
      });
    }
    modulos.sort((a, b) => a.plantilla.localeCompare(b.plantilla, 'es'));

    celda.innerHTML = `<div class="row" style="align-items:center;margin-bottom:8px;">
        <b>${escapeHtml(nombre)}</b>
        <label class="en-linea">Con los datos de
          <select data-persona-previa="${loteId}">
            ${personas.map(p => `<option value="${escapeHtml(p.ced)}" ${p === elegida ? 'selected' : ''}
              >${escapeHtml(p.nombre)}</option>`).join('')}
          </select></label>
        <span class="hint">${personas.length} graduado${personas.length === 1 ? '' : 's'} en el grupo</span>
      </div>
      ${/* Los tres arreglos que antes obligaban a abrir los certificados de uno
            en uno. Van aquí, junto a la previa, porque es mirando la previa
            cuando se descubre que algo está mal. */''}
      <div class="row" style="margin-bottom:10px;">
        <button class="btn teal small" data-editar-persona="${loteId}"
          title="Cambiar el nombre o la cédula en TODOS los certificados de esta persona">✎ Corregir a esta persona</button>
        <button class="btn outline small" data-agregar-persona="${loteId}"
          title="Crear los certificados de este grupo para alguien que faltaba">＋ Añadir a alguien que faltaba</button>
        <button class="btn outline small" data-editar-modulo="${loteId}"
          title="Cambiar la fecha de un módulo en los certificados de todo el grupo">✎ Corregir la fecha de un módulo</button>
      </div>
      <div class="previa-rejilla" data-rejilla="${loteId}"><p class="hint">Dibujando…</p></div>`;

    celda.querySelector('[data-persona-previa]').addEventListener('change', (e) => {
      celda.dataset.persona = e.target.value;
      pintarPreviaDe(loteId, e.target.value);
    });

    celda.querySelector('[data-editar-persona]').addEventListener('click', () =>
      abrirCorregirPersona(loteId, nombre, celda.querySelector('[data-persona-previa]').value, certs));
    celda.querySelector('[data-agregar-persona]').addEventListener('click', () =>
      abrirAgregarPersona(loteId, nombre, modulos));
    celda.querySelector('[data-editar-modulo]').addEventListener('click', () =>
      abrirCorregirModulo(loteId, nombre, modulos, personas.length));

    await pintarPreviaDe(loteId, elegida.ced);
  }

  /* ── Corregir, añadir y arreglar un módulo ────────────────────────────────
     Las tres comparten forma: se pregunta lo justo, la base hace el trabajo
     sobre TODOS los certificados que toca, y al terminar se ofrece bajarse lo
     que acaba de cambiar. Ese último paso no es un adorno: quien corrige un
     apellido lo hace porque va a imprimir, y sin él tocaba ir a buscarlos a
     otra lista.

     Todas pasan por `replace_cert_certificate`, así que ninguna borra nada: el
     viejo queda marcado como reemplazado, apuntando al nuevo. */

  /** La cédula sin puntos ni la V de delante, igual que hace la base. */
  function cedulaPlana(v){ return String(v ?? '').replace(/[^0-9]/g, ''); }

  /** Ventana con el mismo esqueleto que las demás del generador. */
  function abrirVentana(titulo, cuerpoHtml){
    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = `<div class="modal-caja">
      <div class="modal-cab"><b>${escapeHtml(titulo)}</b>
        <button class="btn outline small" data-cerrar>Cerrar</button></div>
      <div class="modal-cuerpo">${cuerpoHtml}</div></div>`;
    document.body.appendChild(fondo);
    const cerrar = () => fondo.remove();
    fondo.querySelector('[data-cerrar]').addEventListener('click', cerrar);
    fondo.addEventListener('click', e => { if(e.target === fondo) cerrar(); });
    return { fondo, cerrar };
  }

  /** Refresca todo lo que dejó de ser cierto tras tocar un grupo. */
  async function refrescarTrasCambio(loteId){
    previasDeLote.delete(loteId);
    await loadIssued();
    await loadLotes();
  }

  /** Tras corregir o añadir: enseñar qué cambió y ofrecer el PDF ya mismo. */
  function ofrecerDescarga(caja, nuevos, nombreZip){
    if(!nuevos.length){
      caja.innerHTML = '<div class="msg warn">No hizo falta cambiar nada: ya decía eso.</div>';
      return;
    }
    caja.innerHTML = `<div class="msg ok">${nuevos.length} certificado(s) al día.</div>
      <button class="btn gold" data-bajar>⬇ Descargar los ${nuevos.length} (ZIP)</button>
      <button class="btn outline" data-bajar-pdf>⬇ Un solo PDF · ${nuevos.length} págs.</button>`;
    caja.querySelector('[data-bajar]').addEventListener('click', () =>
      descargarCertificados(nuevos.map(n => n.id), nombreZip));
    caja.querySelector('[data-bajar-pdf]').addEventListener('click', () =>
      descargarCertificados(nuevos.map(n => n.id), nombreZip, { formato: 'pdf' }));
  }

  /** Cambiar el nombre o la cédula de alguien en TODOS sus certificados. */
  /** `cedActual` viene del selector, que ya trabaja por cédula. El nombre es
      justo lo que puede estar mal —y mal de forma desigual: siete certificados
      corregidos y uno que se quedó con el apellido viejo—, así que contar por
      nombre habría prometido «7» mientras la base corregía 8. */
  async function abrirCorregirPersona(loteId, nombreLote, cedActual, certs){
    const suyos = certs.filter(c => c.estado === 'vigente'
      && cedulaPlana((c.datos || {})['Cédula'] || (c.datos || {}).cedula) === cedActual);
    // El nombre que se enseña para editar: el del documento más reciente.
    const personaElegida = suyos
      .slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map(c => (c.datos || {}).Nombre).find(Boolean) || '';

    /* Los campos que no son ni del grupo ni de la persona entera: el puntaje
       del diploma. Se descubren mirando los datos —cualquier clave que no sea
       el nombre, la cédula o la fecha— en vez de llevar una lista escrita, que
       se quedaría vieja en cuanto alguien añada un campo a una plantilla. */
    const DEL_GRUPO = new Set(['Nombre','nombre','NOMBRE','Cédula','cedula','Cedula','CÉDULA','fecha','Fecha']);
    const propios = [];
    for(const c of suyos){
      for(const [campo, valor] of Object.entries(c.datos || {})){
        if(DEL_GRUPO.has(campo)) continue;
        propios.push({ id: c.id, plantilla: c.plantilla_nombre, campo, valor: String(valor ?? '') });
      }
    }

    const { fondo, cerrar } = abrirVentana(`Corregir a ${personaElegida}`, `
      <p class="hint">Lo que escribas aquí se aplica a <b>los ${suyos.length} certificados</b>
        de esta persona en «${escapeHtml(nombreLote)}», diploma incluido. Cada uno conserva
        su módulo y su fecha; sólo cambian el nombre y la cédula.</p>
      <table><tbody>
        <tr><td><b>Nombre</b></td>
          <td><input type="text" id="cpNombre" value="${escapeHtml(personaElegida)}" style="width:100%"></td></tr>
        <tr><td><b>Cédula</b></td>
          <td><input type="text" id="cpCedula" value="${escapeHtml(cedActual)}" style="width:100%"
                placeholder="27687821"></td></tr>
      </tbody></table>
      <p class="hint">Los puntos se ponen solos: da igual escribir 27687821 o V-27.687.821.</p>
      <div class="row" style="margin-top:12px;">
        <button class="btn teal" id="cpGuardar">Corregir sus ${suyos.length} certificados</button>
      </div>
      <div id="cpMsg"></div>

      ${/* Hay campos que no son del grupo ni de la persona entera, sino de UN
            documento suyo: el puntaje del diploma. No pueden ir arriba —se
            aplicarían a los nueve— ni en el corrector de módulos —es distinto
            para cada quien—. Así que van aquí, uno por documento que los
            tenga, y sólo aparecen si existen. */''}
      ${propios.length ? `
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);">
        <p><b>Lo que es distinto en cada documento</b></p>
        <table><thead><tr><th>Documento</th><th>Campo</th><th>Valor</th></tr></thead>
          <tbody>${propios.map((p, i) => `<tr>
            <td>${escapeHtml(p.plantilla)}</td><td><b>${escapeHtml(p.campo)}</b></td>
            <td><input type="text" data-propio="${i}" value="${escapeHtml(p.valor)}" style="width:100%"></td>
          </tr>`).join('')}</tbody></table>
        <div class="row" style="margin-top:10px;">
          <button class="btn outline" id="cpGuardarPropios">Guardar estos</button>
        </div>
        <div id="cpMsgPropios"></div>
      </div>` : ''}`);

    fondo.querySelector('#cpGuardar').addEventListener('click', async () => {
      const caja = fondo.querySelector('#cpMsg');
      const nombreNuevo = fondo.querySelector('#cpNombre').value.trim();
      const cedNueva = cedulaPlana(fondo.querySelector('#cpCedula').value);
      if(!nombreNuevo){ caja.innerHTML = '<div class="msg err">El nombre no puede quedar vacío.</div>'; return; }
      if(!cedNueva){ caja.innerHTML = '<div class="msg err">La cédula no puede quedar vacía.</div>'; return; }
      caja.innerHTML = '<p class="hint">Corrigiendo…</p>';
      const { data, error } = await supabase.rpc('cert_persona_editar', {
        p_lote: loteId, p_cedula: cedActual,
        p_nombre_nuevo: nombreNuevo, p_cedula_nueva: cedNueva });
      if(error){ caja.innerHTML = `<div class="msg err">${escapeHtml(error.message)}</div>`; return; }
      await refrescarTrasCambio(loteId);
      ofrecerDescarga(caja, data || [], `certificados_${sanitizeName(nombreNuevo)}`);
    });

    /* Los campos propios van por la puerta de siempre —editar UN certificado—
       porque eso es lo que son: un cambio en un documento concreto. */
    fondo.querySelector('#cpGuardarPropios')?.addEventListener('click', async () => {
      const caja = fondo.querySelector('#cpMsgPropios');
      const porDocumento = new Map();
      fondo.querySelectorAll('[data-propio]').forEach((inp) => {
        const p = propios[Number(inp.dataset.propio)];
        if(inp.value === p.valor) return;          // sin cambios, no se toca
        if(!porDocumento.has(p.id)) porDocumento.set(p.id, {});
        porDocumento.get(p.id)[p.campo] = inp.value;
      });
      if(!porDocumento.size){
        caja.innerHTML = '<div class="msg warn">No cambiaste ninguno.</div>'; return;
      }
      caja.innerHTML = '<p class="hint">Guardando…</p>';
      const nuevos = [];
      for(const [id, cambios] of porDocumento){
        const viejo = suyos.find(c => c.id === id);
        const { data, error } = await supabase.rpc('replace_cert_certificate',
          { p_id: id, p_datos: { ...(viejo.datos || {}), ...cambios } });
        if(error){ caja.innerHTML = `<div class="msg err">${escapeHtml(error.message)}</div>`; return; }
        nuevos.push(data);
      }
      await refrescarTrasCambio(loteId);
      ofrecerDescarga(caja, nuevos, `certificados_${sanitizeName(personaElegida)}`);
    });
    return cerrar;
  }

  /** Crear de una vez los certificados de todo el grupo para alguien nuevo. */
  async function abrirAgregarPersona(loteId, nombreLote, modulos){
    const { fondo } = abrirVentana(`Añadir a alguien a ${nombreLote}`, `
      <p class="hint">Se le crean <b>${modulos.length} certificados</b>, uno por módulo, cada uno
        con la fecha que ese módulo tiene en este grupo. No hay que volver a generar el grupo.</p>
      <table><thead><tr><th>Módulo</th><th>Fecha que llevará</th></tr></thead>
        <tbody>${modulos.map((m) => `<tr><td>${escapeHtml(m.plantilla)}</td>
          <td class="hint">${escapeHtml(m.fecha || '— sin fecha propia —')}</td></tr>`).join('')}</tbody></table>
      <table style="margin-top:12px;"><tbody>
        <tr><td><b>Nombre</b></td>
          <td><input type="text" id="apNombre" style="width:100%" placeholder="Diberling Mejias"></td></tr>
        <tr><td><b>Cédula</b></td>
          <td><input type="text" id="apCedula" style="width:100%" placeholder="27687821"></td></tr>
      </tbody></table>
      <div class="row" style="margin-top:12px;">
        <button class="btn teal" id="apCrear">Crear sus ${modulos.length} certificados</button>
      </div>
      <div id="apMsg"></div>`);

    fondo.querySelector('#apCrear').addEventListener('click', async () => {
      const caja = fondo.querySelector('#apMsg');
      const nombre = fondo.querySelector('#apNombre').value.trim();
      const ced = cedulaPlana(fondo.querySelector('#apCedula').value);
      if(!nombre){ caja.innerHTML = '<div class="msg err">Falta el nombre.</div>'; return; }
      if(!ced){ caja.innerHTML = '<div class="msg err">Falta la cédula.</div>'; return; }
      caja.innerHTML = '<p class="hint">Creándolos…</p>';
      const { data, error } = await supabase.rpc('cert_lote_agregar_persona',
        { p_lote: loteId, p_nombre: nombre, p_cedula: ced });
      if(error){ caja.innerHTML = `<div class="msg err">${escapeHtml(error.message)}</div>`; return; }
      await refrescarTrasCambio(loteId);
      ofrecerDescarga(caja, data || [], `certificados_${sanitizeName(nombre)}`);
    });
  }

  /** Arreglar la fecha de un módulo en los certificados de TODO el grupo. */
  async function abrirCorregirModulo(loteId, nombreLote, modulos, cuantasPersonas){
    const { fondo } = abrirVentana(`Corregir un módulo de ${nombreLote}`, `
      <p class="hint">Para cuando lo que está mal no es una persona sino un módulo: el curso se
        dio un viernes y el certificado dice otro, y lo dice en los ${cuantasPersonas}.</p>
      <table><tbody>
        <tr><td><b>Módulo</b></td><td><select id="cmModulo" style="width:100%">
          ${modulos.map((m, i) => `<option value="${i}">${escapeHtml(m.plantilla)}</option>`).join('')}
        </select></td></tr>
        <tr><td><b>Fecha</b></td><td><input type="text" id="cmFecha" style="width:100%"></td></tr>
      </tbody></table>
      <p class="hint">Se escribe tal cual va a salir impresa, por ejemplo
        «Caracas, 8 de Mayo de 2026».</p>
      <div class="row" style="margin-top:12px;">
        <button class="btn teal" id="cmGuardar">Corregir la fecha</button>
      </div>
      <div id="cmMsg"></div>

      ${/* Lo que pasó de verdad con los diplomas de una promoción: se generaron,
            se descargaron y nadie pulsó «Registrar». Como no quedaron
            registrados, no se podían ni buscar ni corregir — y desde la
            pantalla no había forma de repararlo sin volver a generar el grupo
            entero. */''}
      <div id="cmFaltan" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border);"></div>`);

    const sel = fondo.querySelector('#cmModulo');
    const campoFecha = fondo.querySelector('#cmFecha');
    const cajaFaltan = fondo.querySelector('#cmFaltan');
    const actual = () => modulos[Number(sel.value)];

    function pintarModulo(){
      const m = actual();
      campoFecha.value = m.fecha || '';
      fondo.querySelector('#cmGuardar').textContent =
        `Corregir la fecha en ${m.cuantos === 1 ? 'el único que lo tiene' : `los ${m.cuantos}`}`;

      const faltan = cuantasPersonas - m.cuantos;
      cajaFaltan.innerHTML = faltan <= 0
        ? '<p class="hint">Todo el grupo tiene este documento.</p>'
        : `<p><b>A ${faltan} de las ${cuantasPersonas} personas les falta este documento.</b></p>
           <p class="hint">Se les crea copiando el de quien sí lo tiene, con su misma fecha.
             Los campos propios de cada quien —el puntaje del diploma— quedan en blanco
             a propósito: mejor que se vea que falta a que salga con el de otra persona.</p>
           <button class="btn outline" id="cmCompletar">Dárselo a ${faltan === 1 ? 'esa persona' : `esas ${faltan}`}</button>`;

      fondo.querySelector('#cmCompletar')?.addEventListener('click', async () => {
        cajaFaltan.innerHTML = '<p class="hint">Creándolos…</p>';
        const { data, error } = await supabase.rpc('cert_lote_completar_modulo',
          { p_lote: loteId, p_plantilla: actual().plantilla });
        if(error){ cajaFaltan.innerHTML = `<div class="msg err">${escapeHtml(error.message)}</div>`; return; }
        await refrescarTrasCambio(loteId);
        ofrecerDescarga(cajaFaltan, data || [], `modulo_${sanitizeName(actual().plantilla)}`);
      });
    }
    pintarModulo();
    sel.addEventListener('change', pintarModulo);

    fondo.querySelector('#cmGuardar').addEventListener('click', async () => {
      const caja = fondo.querySelector('#cmMsg');
      const fecha = campoFecha.value.trim();
      if(!fecha){ caja.innerHTML = '<div class="msg err">Escribe la fecha.</div>'; return; }
      caja.innerHTML = '<p class="hint">Corrigiendo…</p>';
      const m = actual();
      const { data, error } = await supabase.rpc('cert_lote_editar_modulo',
        { p_lote: loteId, p_plantilla: m.plantilla, p_campo: m.campoFecha, p_valor: fecha });
      if(error){ caja.innerHTML = `<div class="msg err">${escapeHtml(error.message)}</div>`; return; }
      await refrescarTrasCambio(loteId);
      ofrecerDescarga(caja, data || [], `modulo_${sanitizeName(m.plantilla)}`);
    });
  }

  /** `persona` es la CÉDULA sin puntos: es lo que no cambia al corregir a
      alguien, y por tanto lo único que reúne todos sus documentos. */
  async function pintarPreviaDe(loteId, persona){
    const rejilla = document.querySelector(`[data-rejilla="${loteId}"]`);
    if(!rejilla) return;
    const certs = previasDeLote.get(loteId) || [];
    const suyos = certs.filter(c => c.estado !== 'reemplazado'
      && cedulaPlana((c.datos || {})['Cédula'] || (c.datos || {}).cedula) === persona);
    if(!suyos.length){ rejilla.innerHTML = '<p class="hint">Sin certificados de esa persona.</p>'; return; }

    rejilla.innerHTML = `<p class="hint">Dibujando ${suyos.length}…</p>`;
    const trozos = [];
    const sinPlantilla = [];
    for(const c of suyos){
      const tpl = tplPorNombreEmitido(c.plantilla_nombre);
      if(!tpl){ sinPlantilla.push(c.plantilla_nombre); continue; }
      await ensureFontsLoadedForConfig(tpl.config);
      const verifyUrl = new URL(RUTA_VERIFICAR, location.href).href + '?c=' + c.id;
      const suFecha = (c.datos && c.datos.fecha) ? String(c.datos.fecha).trim() : '';
      const canvas = await renderCertificateCanvas(
        c.datos || {}, verifyUrl, tpl.config, suFecha ? { fecha: { texto: suFecha } } : undefined);
      trozos.push(`<figure class="previa-uno">
        <img loading="lazy" decoding="async" src="${canvas.toDataURL('image/jpeg', 0.75)}"
             alt="${escapeHtml(c.plantilla_nombre)}">
        <figcaption><b>${escapeHtml(c.plantilla_nombre)}</b>
          <br><span class="hint">${escapeHtml(suFecha || 'sin fecha propia — sale la de la plantilla')}</span>
          <br><a href="${escapeHtml(urlDeVerificar(c.id))}" target="_blank" class="hint">Ver el certificado</a></figcaption>
      </figure>`);
    }
    rejilla.innerHTML = trozos.join('')
      + (sinPlantilla.length
         ? `<div class="msg err">No se pudo dibujar: la plantilla «${escapeHtml(sinPlantilla.join('», «'))}» ya no existe.</div>`
         : '');
  }

  /** Descarga un grupo entero. Se piden sus certificados por su propia puerta,
      sin el tope de 300 de la lista general. */
  async function descargarLote(loteId, nombre, cuantos, formato = 'zip'){
    const unSoloPdf = formato === 'pdf';
    if(cuantos > 40 && !await preguntar({
      titulo: `Descargar ${cuantos} certificados`,
      cuerpo: `<p>Se van a volver a dibujar los <b>${cuantos}</b> certificados de
        «${escapeHtml(nombre)}», uno por uno, para meterlos
        ${unSoloPdf ? `en <b>un solo PDF de ${cuantos} páginas</b>`
                    : `en un ZIP con <b>${cuantos} archivos</b> dentro`}.
        Tardará un rato largo y conviene no cerrar ni recargar la pestaña mientras tanto.</p>`,
      aceptar: `Sí, descargar los ${cuantos}`,
    })) return;

    const { data, error } = await supabase.rpc('list_cert_certificates_de_lote', { p_lote: loteId });
    if(error){ alert('Error: ' + error.message); return; }
    const delLote = data || [];
    if(!delLote.length){ alert('Ese grupo no tiene certificados.'); return; }

    /* Los del grupo pueden no estar en `issued` —la lista general trae sólo los
       últimos 300— así que se añaden a mano antes de dibujar: descargarCertificados
       los busca ahí por id. */
    delLote.forEach(c => { if(!issued.some(x => x.id === c.id)) issued.push(c); });

    /* En un solo documento el orden es lo único que lo hace usable: cada
       graduado con sus módulos seguidos, y los módulos en el orden en que se
       cursaron (que es el número con el que empieza el nombre de la plantilla).
       Así se imprime y se reparte pasando páginas, sin ir a buscar. */
    const ordenados = [...delLote].sort((a, b) =>
      nombreDelGraduado(a.datos).localeCompare(nombreDelGraduado(b.datos), 'es')
      || String(a.plantilla_nombre || '').localeCompare(String(b.plantilla_nombre || ''), 'es', { numeric: true }));

    await descargarCertificados((unSoloPdf ? ordenados : delLote).map(c => c.id),
      sanitizeName(nombre), { saltarAviso: true, formato });
  }

  // ---------- Certificados emitidos ----------
  /* Lo que se está buscando ahora mismo. Vive aquí y no sólo en la casilla
     porque la búsqueda ya no es cosa de la pantalla: la hace la base. */
  let busquedaEmitidos = '';

  async function loadIssued(){
    const { data, error } = await supabase.rpc('list_cert_certificates',
      { p_busca: busquedaEmitidos || null });
    const wrap = document.getElementById('listaEmitidosWrap');
    if(error){ wrap.innerHTML = `<div class="msg err">${escapeHtml(error.message)}</div>`; return; }
    issued = data || [];
    renderIssuedTable();
  }

  function tplPorNombreEmitido(nombre){
    return templatesFull.find(t => t.nombre === nombre);
  }

  function actualizarBarraSeleccionEmitidos(){
    const bar = document.getElementById('emitidosSeleccionBar');
    if(!issuedSeleccionados.size){ bar.style.display = 'none'; bar.innerHTML = ''; return; }
    bar.style.display = 'flex';
    bar.innerHTML = `<b>${issuedSeleccionados.size} certificado(s) marcado(s)</b>
      <button class="btn teal small" id="btnEditarSeleccionEmitidos">✎ Editar</button>
      <button class="btn outline small" id="btnDescargarSeleccionEmitidos"
        title="Un archivo PDF por certificado, todos dentro de un ZIP">⬇ ZIP · ${issuedSeleccionados.size} archivos</button>
      <button class="btn outline small" id="btnDescargarSeleccionEmitidosPdf"
        title="Un solo archivo con los ${issuedSeleccionados.size} dentro, uno por página">⬇ Un solo PDF · ${issuedSeleccionados.size} págs.</button>
      <button class="btn outline small" id="btnCancelarSeleccionEmitidos">Cancelar selección</button>`;
    document.getElementById('btnEditarSeleccionEmitidos').addEventListener('click', editarCertificadosSeleccionados);
    document.getElementById('btnDescargarSeleccionEmitidos').addEventListener('click', () => descargarCertificados([...issuedSeleccionados], 'certificados_marcados'));
    document.getElementById('btnDescargarSeleccionEmitidosPdf').addEventListener('click', () => descargarCertificados([...issuedSeleccionados], 'certificados_marcados', { formato: 'pdf' }));
    document.getElementById('btnCancelarSeleccionEmitidos').addEventListener('click', () => {
      issuedSeleccionados.clear();
      renderIssuedTable();
    });
  }

  /* Lo que se ve ahora mismo en la lista. Lo usan la tabla y el botón de
     descargar en bloque: si cada uno filtrara por su cuenta, el botón podría
     acabar bajando algo distinto de lo que hay en pantalla.

     Ya no filtra nada: lo que hay en `issued` ES el resultado de la búsqueda,
     porque la hace la base. Antes filtraba sobre los últimos 300 traídos, y
     con 491 certificados en la casa eso dejaba 191 imposibles de encontrar
     —entre ellos, cualquier diploma— diciendo «sin certificados que
     coincidan», que suena a que no existe. */
  function certificadosFiltrados(){ return issued; }

  function renderIssuedTable(){
    const wrap = document.getElementById('listaEmitidosWrap');
    const filtered = certificadosFiltrados();
    actualizarBarraSeleccionEmitidos();
    document.getElementById('btnDescargarFiltrados').disabled = !filtered.length;
    document.getElementById('btnDescargarFiltrados').textContent =
      filtered.length ? `⬇ Descargar los ${filtered.length} que se ven` : '⬇ Descargar los que se ven';
    if(!filtered.length){ wrap.innerHTML = '<p class="hint">Sin certificados que coincidan.</p>'; return; }
    const todosMarcados = filtered.every(c => issuedSeleccionados.has(c.id));

    /* Agrupados por el día en que se emitieron. Una tanda de graduación sale de
       una sentada, así que el día es lo que separa una promoción de la
       siguiente; en una lista corrida de doscientas filas eso no se ve. */
    const dias = agruparPorDia(filtered);

    wrap.innerHTML = `<table><thead><tr>
      <th><input type="checkbox" id="chkTodosEmitidos" ${todosMarcados ? 'checked' : ''}></th>
      <th>Datos</th><th>Plantilla</th><th>Estado</th><th>Hora</th><th>Acciones</th></tr></thead>
    <tbody>${dias.map(d => `
    <tr class="grupo-fecha"><td colspan="6"><div class="row">
      <span class="dia">${escapeHtml(diaEnLetras(d.clave))}</span>
      <span class="hint">${d.certs.length} certificado${d.certs.length === 1 ? '' : 's'}</span>
      <button class="btn outline small" data-descargar-dia="${d.clave}" data-formato="zip"
        title="Un archivo PDF por certificado, todos dentro de un ZIP">⬇ ZIP · ${d.certs.length} archivos</button>
      <button class="btn outline small" data-descargar-dia="${d.clave}" data-formato="pdf"
        title="Un solo archivo con los ${d.certs.length} de este día, uno por página">⬇ Un solo PDF · ${d.certs.length} págs.</button>
    </div></td></tr>
    ${d.certs.map(c => {
      const reemplazoPor = c.estado === 'reemplazado' ? issued.find(x => x.reemplaza_a === c.id) : null;
      return `<tr id="emitido-${c.id}" class="${issuedSeleccionados.has(c.id) ? 'fila-marcada' : ''}">
      <td><input type="checkbox" data-emitido-check="${c.id}" ${issuedSeleccionados.has(c.id) ? 'checked' : ''}></td>
      <td>${Object.entries(c.datos || {}).filter(([,v]) => v).map(([k,v]) => `<b>${escapeHtml(k)}:</b> ${escapeHtml(v)}`).join('<br>')}</td>
      <td>${escapeHtml(c.plantilla_nombre || '—')}</td>
      <td><span class="badge ${c.estado}">${c.estado}</span>${reemplazoPor ? `<br><a href="#" data-ir-a="${reemplazoPor.id}" class="hint">→ ver el que lo reemplaza</a>` : ''}</td>
      <td class="hora">${new Date(c.created_at).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })}</td>
      <td>
        <a href="${escapeHtml(urlDeVerificar(c.id))}" target="_blank" class="hint">Ver</a>
        ${c.estado === 'vigente' ? ` · <button data-editar-emitido="${c.id}" class="btn outline small">Editar</button>` : ''}
        ${c.estado === 'vigente' ? ` · <button data-revocar="${c.id}" class="btn danger small">Revocar</button>` : ''}
        ${/* Anular era un camino de ida. Un clic en la fila de al lado dejaba a
              un graduado con el papel invalidado y sin vuelta atrás. El de
              «reemplazado» no lleva botón a propósito: ya tiene otro más nuevo
              ocupando su sitio, y la base lo rechazaría. */''}
        ${c.estado === 'revocado' ? ` · <button data-devolver="${c.id}" class="btn outline small"
            title="Volver a darlo por válido">↩ Devolver a vigente</button>` : ''}
      </td>
    </tr>`;
    }).join('')}`).join('')}</tbody></table>`;

    wrap.querySelectorAll('[data-descargar-dia]').forEach(b => b.addEventListener('click', () => {
      const dia = dias.find(d => d.clave === b.dataset.descargarDia);
      if(dia) descargarCertificados(dia.certs.map(c => c.id), `certificados_${dia.clave}`,
        { formato: b.dataset.formato });
    }));

    document.getElementById('chkTodosEmitidos').addEventListener('change', e => {
      filtered.forEach(c => { if(e.target.checked) issuedSeleccionados.add(c.id); else issuedSeleccionados.delete(c.id); });
      renderIssuedTable();
    });
    wrap.querySelectorAll('[data-emitido-check]').forEach(cb => cb.addEventListener('change', () => {
      if(cb.checked) issuedSeleccionados.add(cb.dataset.emitidoCheck); else issuedSeleccionados.delete(cb.dataset.emitidoCheck);
      cb.closest('tr').classList.toggle('fila-marcada', cb.checked);
      actualizarBarraSeleccionEmitidos();
    }));
    wrap.querySelectorAll('[data-editar-emitido]').forEach(b => b.addEventListener('click', () => {
      const c = issued.find(x => x.id === b.dataset.editarEmitido);
      if(c) abrirEditarCertificado(c);
    }));
    wrap.querySelectorAll('[data-ir-a]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      document.getElementById(`emitido-${a.dataset.irA}`)?.scrollIntoView({ behavior:'smooth', block:'center' });
    }));
    wrap.querySelectorAll('[data-revocar]').forEach(b => b.addEventListener('click', async () => {
      const motivo = prompt('Motivo de revocación:');
      if(motivo === null) return;
      const { error } = await supabase.rpc('revoke_certificate', { p_id: b.dataset.revocar, p_motivo: motivo });
      if(error) alert('Error: ' + error.message);
      await loadIssued();
    }));

    wrap.querySelectorAll('[data-devolver]').forEach(b => b.addEventListener('click', async () => {
      const c = issued.find(x => x.id === b.dataset.devolver);
      if(!await preguntar({
        titulo: 'Devolver el certificado a vigente',
        cuerpo: `<p>Vuelve a darse por válido: quien escanee su QR verá otra vez un
            certificado en regla.</p>
          ${c && c.motivo_revocacion
            ? `<p class="hint">Se había anulado por: «${escapeHtml(c.motivo_revocacion)}».</p>`
            : ''}`,
        aceptar: 'Sí, devolverlo',
      })) return;
      const motivo = prompt('¿Por qué vuelve a estar vigente?\n\nQueda escrito en el registro '
        + 'de auditoría junto al motivo por el que se anuló.');
      if(motivo === null) return;
      const { error } = await supabase.rpc('restore_certificate',
        { p_id: b.dataset.devolver, p_motivo: motivo });
      if(error){ alert('No se pudo devolver: ' + error.message); return; }
      await loadIssued();
      await loadLotes();      // el grupo cuenta cuántos siguen vigentes
    }));
  }

  /* Cuánto puede pesar el documento único antes de tirar la pestaña.
     ─────────────────────────────────────────────────────────────────────────
     Un ZIP guarda cada PDF por separado y el navegador puede soltarlos según
     los arma. Un solo PDF no: jsPDF lo tiene entero en memoria antes de
     entregarlo, y el pico es de más del doble del archivo final. Las láminas
     son de 3.300×2.400 px y cada página pesa alrededor de medio mega, así que
     un grupo normal —cincuenta y tantos certificados— sale por unos 30 MB y
     va bien. Por encima de este tope se para y se dice por qué, en vez de
     dejar la pestaña pensando diez minutos para acabar cayéndose. */
  const TOPE_PDF_UNICO = 200 * 1024 * 1024;

  /** Reconstruye y descarga uno o varios certificados ya emitidos, sin cambiar sus datos.
      `opciones.formato`: 'zip' (un archivo por certificado) o 'pdf' (todos en uno). */
  async function descargarCertificados(ids, nombreZip = 'certificados', opciones = {}){
    const certs = ids.map(id => issued.find(c => c.id === id)).filter(Boolean);
    if(!certs.length) return;
    const unSoloPdf = opciones.formato === 'pdf';

    /* Cada certificado se vuelve a dibujar entero, con sus tipografías y su
       fondo. Doscientos de golpe son varios minutos con el navegador ocupado, y
       si a mitad se cierra la pestaña no queda nada. Se avisa antes, con el
       número delante, porque el botón dice «los 208» pero nadie calcula lo que
       eso tarda hasta que ya está esperando. */
    if(certs.length > 40 && !opciones.saltarAviso && !await preguntar({
      titulo: `Descargar ${certs.length} certificados`,
      cuerpo: `<p>Se van a volver a dibujar <b>${certs.length}</b> certificados, uno por uno, para
        meterlos ${unSoloPdf ? 'en un solo PDF de <b>' + certs.length + ' páginas</b>'
                             : 'en un ZIP'}. Tardará un rato largo y conviene no cerrar ni
        recargar la pestaña mientras tanto.</p>
        <p class="hint">Si sólo querías los de un día, cierra esto y usa el botón de descargar que
        hay en la línea de ese día.</p>`,
      aceptar: `Sí, descargar los ${certs.length}`,
    })) return;

    const { jsPDF } = window.jspdf;
    const listos = [];
    const sinPlantilla = [];
    /* El documento único se va armando página a página, según se dibuja cada
       certificado. Así nunca coexisten los PDF sueltos y el combinado: con un
       grupo entero, tenerlos a la vez es el doble de memoria para nada. */
    let juntos = null, paginas = 0, pesoAcumulado = 0, seCorto = false;
    /* Cada certificado se vuelve a dibujar entero —lienzo, tipografías, QR— y a
       treinta de golpe eso son varios segundos con la pantalla quieta. Sin este
       aviso parece que el botón no hizo nada y se pulsa otra vez. */
    const aviso = avisoDeProgreso(certs.length);
    try{
    for(const c of certs){
      await aviso.paso();
      const tpl = tplPorNombreEmitido(c.plantilla_nombre);
      if(!tpl){ sinPlantilla.push(c); continue; }
      await ensureFontsLoadedForConfig(tpl.config);
      const verifyUrl = new URL(RUTA_VERIFICAR, location.href).href + '?c=' + c.id;
      /* La fecha guardada en ESTE certificado manda sobre la fija de la plantilla.
         ─────────────────────────────────────────────────────────────────────
         El valor fijo de la plantilla es el mismo para todo el mundo, y la fecha
         no lo es: dos promociones hacen el mismo módulo en meses distintos. Sin
         esto, volver a descargar un grupo de abril lo imprime con la fecha que
         la plantilla tenga hoy — un documento con una fecha que no ocurrió, en
         manos de un graduado.

         Va acotado a la fecha a propósito. Los demás valores fijos (el nombre
         del módulo, la firma) sí son iguales para todos y deben seguir saliendo
         de la plantilla, que es donde se corrigen de una vez para todos. Y sólo
         actúa si el certificado trae fecha: los emitidos antes de esto la tienen
         vacía y siguen comportándose igual que siempre. */
      const suFecha = (c.datos && c.datos.fecha) ? String(c.datos.fecha).trim() : '';
      const ajustes = suFecha ? { fecha: { texto: suFecha } } : undefined;
      const canvas = await renderCertificateCanvas(c.datos || {}, verifyUrl, tpl.config, ajustes);
      const jpgDataUrl = canvas.toDataURL('image/jpeg', 0.92);
      const widthPt = canvas.width * 72 / 96, heightPt = canvas.height * 72 / 96;
      const orientation = widthPt > heightPt ? 'landscape' : 'portrait';

      if(unSoloPdf){
        pesoAcumulado += jpgDataUrl.length * 0.75;      // base64 → bytes
        if(pesoAcumulado > TOPE_PDF_UNICO){ seCorto = true; break; }
        if(!juntos){
          juntos = new jsPDF({ orientation, unit:'pt', format:[widthPt, heightPt] });
        } else {
          // Cada página lleva su propio tamaño: en un mismo grupo conviven
          // láminas de 3300×2400 y de 3508×2480, y forzarlas a una sola medida
          // estiraría unas u otras.
          juntos.addPage([widthPt, heightPt], orientation);
        }
        juntos.addImage(jpgDataUrl, 'JPEG', 0, 0, widthPt, heightPt);
        paginas++;
        continue;
      }

      const pdf = new jsPDF({ orientation, unit:'pt', format:[widthPt, heightPt] });
      pdf.addImage(jpgDataUrl, 'JPEG', 0, 0, widthPt, heightPt);
      const nombrePersona = nombreDelGraduado(c.datos, c.id.slice(0, 8));
      listos.push({ blob: pdf.output('blob'), filename: `${sanitizeName(tpl.nombre)}_${sanitizeName(String(nombrePersona))}_${c.id.slice(0,8)}.pdf` });
    }
    } finally { aviso.cerrar(); }
    if(sinPlantilla.length) alert(`${sinPlantilla.length} certificado(s) no se pudieron regenerar: su plantilla («${sinPlantilla.map(c=>c.plantilla_nombre).join('», «')}») ya no existe.`);

    if(unSoloPdf){
      /* Cortado por tamaño: no se entrega un documento incompleto sin decirlo.
         Un PDF con 130 de 266 certificados y nadie avisando es peor que no
         tener PDF, porque parece completo. */
      if(seCorto){
        alert(`Son demasiados para un solo archivo: a las ${paginas} páginas ya iba por
${Math.round(pesoAcumulado / 1024 / 1024)} MB y el navegador no lo aguanta.

Bájalos en ZIP, o marca menos de una vez —por día, o por grupo— y repite.`);
        return;
      }
      if(!paginas) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(juntos.output('blob'));
      a.download = `${sanitizeName(nombreZip)}.pdf`;
      a.click();
      return;
    }

    if(!listos.length) return;
    if(listos.length === 1){
      const a = document.createElement('a');
      a.href = URL.createObjectURL(listos[0].blob); a.download = listos[0].filename; a.click();
      return;
    }
    const zip = new JSZip();
    listos.forEach(l => zip.file(l.filename, l.blob));
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    /* El nombre del ZIP dice qué trae: el día, o a quién se buscó. Antes todos
       salían llamados «certificados_editados», que además era mentira cuando no
       se había editado nada. */
    a.href = URL.createObjectURL(blob); a.download = `${sanitizeName(nombreZip)}.zip`; a.click();
  }

  /** Un cartel fijo mientras se regeneran los PDF, con la cuenta a la vista. */
  function avisoDeProgreso(total){
    const caja = document.createElement('div');
    caja.className = 'aviso-progreso';
    caja.innerHTML = `<b>Preparando los certificados…</b>
      <span class="hint" data-cuenta>0 de ${total}</span>`;
    document.body.appendChild(caja);
    let n = 0;
    return {
      paso(){
        n++;
        caja.querySelector('[data-cuenta]').textContent = `${n} de ${total}`;
        /* Un respiro al navegador: sin él el contador se queda en «0 de 30»
           hasta el final, porque el dibujo ocupa el hilo entero. */
        return new Promise(r => setTimeout(r, 0));
      },
      cerrar(){ caja.remove(); },
    };
  }

  /** Modal para editar los datos de UN certificado ya emitido y, si se quiere, descargarlo de una vez. */
  async function abrirEditarCertificado(c){
    const tpl = tplPorNombreEmitido(c.plantilla_nombre);
    if(!tpl){ alert(`No se encontró la plantilla «${c.plantilla_nombre}». Puede que haya sido renombrada o eliminada; no se puede editar ni volver a generar este certificado sin ella.`); return; }
    await ensureFontsLoadedForConfig(tpl.config);
    const datos = { ...(c.datos || {}) };
    const camposTexto = tpl.config.fields.filter(f => f.tipo === 'texto');

    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = `<div class="modal-caja">
      <div class="modal-cab"><b>Editar certificado — ${escapeHtml(tpl.nombre)}</b><button class="btn outline small" data-cerrar>Cerrar</button></div>
      <div class="modal-cuerpo">
        <img loading="lazy" decoding="async" id="editarPrev" style="max-width:100%;border:1px solid var(--border);border-radius:6px;margin-bottom:12px;">
        <table><thead><tr><th>Campo</th><th>Valor</th></tr></thead><tbody>
          ${camposTexto.map(f => `<tr><td><b>${escapeHtml(f.nombre)}</b></td>
            <td><input type="text" data-campo-editar="${escapeHtml(f.nombre)}" value="${escapeHtml(datos[f.nombre] ?? '')}" style="width:100%;"></td></tr>`).join('')}
        </tbody></table>
        <div class="row" style="margin-top:12px;">
          <button class="btn teal" data-guardar>Guardar cambios</button>
          <button class="btn gold" data-guardar-descargar>Guardar y descargar PDF</button>
        </div>
        <p class="hint" style="margin-top:8px;">Guardar marca el certificado actual como «reemplazado» y crea uno nuevo con estos datos y su propio código QR; el anterior deja de listarse como vigente.</p>
        <div id="editarMsg"></div>
      </div>
    </div>`;
    document.body.appendChild(fondo);

    const verifyUrlPreview = new URL(RUTA_VERIFICAR, location.href).href + '?c=preview';
    const pintar = async () => {
      const canvas = await renderCertificateCanvas(datos, verifyUrlPreview, tpl.config);
      fondo.querySelector('#editarPrev').src = canvas.toDataURL('image/jpeg', 0.85);
    };
    await pintar();

    fondo.querySelectorAll('[data-campo-editar]').forEach(inp => inp.addEventListener('input', () => {
      datos[inp.dataset.campoEditar] = inp.value;
      pintar();
    }));
    const cerrar = () => fondo.remove();
    fondo.querySelector('[data-cerrar]').addEventListener('click', cerrar);
    fondo.addEventListener('click', e => { if(e.target === fondo) cerrar(); });

    async function guardar(){
      const { data, error } = await supabase.rpc('replace_cert_certificate', { p_id: c.id, p_datos: datos });
      if(error){ fondo.querySelector('#editarMsg').innerHTML = `<div class="msg err">${escapeHtml(error.message)}</div>`; return null; }
      issuedSeleccionados.delete(c.id);
      await loadIssued();
      return data;
    }
    fondo.querySelector('[data-guardar]').addEventListener('click', async () => {
      const nuevo = await guardar();
      if(nuevo) cerrar();
    });
    fondo.querySelector('[data-guardar-descargar]').addEventListener('click', async () => {
      const nuevo = await guardar();
      if(!nuevo) return;
      await descargarCertificados([nuevo.id]);
      cerrar();
    });
  }

  /** Modal para editar VARIOS certificados emitidos de golpe, en una tabla, y descargarlos juntos. */
  async function editarCertificadosSeleccionados(){
    const seleccion = [...issuedSeleccionados].map(id => issued.find(c => c.id === id)).filter(Boolean);
    const editables = seleccion.filter(c => c.estado === 'vigente' && tplPorNombreEmitido(c.plantilla_nombre));
    const descartados = seleccion.length - editables.length;
    if(!editables.length){ alert('Ninguno de los certificados marcados se puede editar (deben estar vigentes y su plantilla debe seguir existiendo).'); return; }
    if(editables.length === 1){ await abrirEditarCertificado(editables[0]); return; }

    for(const c of editables) await ensureFontsLoadedForConfig(tplPorNombreEmitido(c.plantilla_nombre).config);
    const camposUnion = [...new Set(editables.flatMap(c => tplPorNombreEmitido(c.plantilla_nombre).config.fields.filter(f => f.tipo === 'texto').map(f => f.nombre)))];
    const cambios = editables.map(c => ({ c, datos: { ...(c.datos || {}) } }));

    const fondo = document.createElement('div');
    fondo.className = 'modal-fondo';
    fondo.innerHTML = `<div class="modal-caja" style="max-width:min(96vw, 1100px);">
      <div class="modal-cab"><b>Editar ${editables.length} certificados${descartados ? ` (${descartados} no se pudieron incluir)` : ''}</b>
        <button class="btn outline small" data-cerrar>Cerrar</button></div>
      <div class="modal-cuerpo">
        <div style="overflow-x:auto;"><table><thead><tr><th>Plantilla</th>${camposUnion.map(n => `<th>${escapeHtml(n)}</th>`).join('')}</tr></thead>
        <tbody>${cambios.map((it, fi) => {
          const tpl = tplPorNombreEmitido(it.c.plantilla_nombre);
          const nombresTpl = new Set(tpl.config.fields.filter(f => f.tipo === 'texto').map(f => f.nombre));
          return `<tr><td>${escapeHtml(tpl.nombre)}</td>${camposUnion.map(n => nombresTpl.has(n)
            ? `<td><input type="text" data-fila="${fi}" data-campo="${escapeHtml(n)}" value="${escapeHtml(it.datos[n] ?? '')}" style="min-width:120px;"></td>`
            : `<td class="hint">—</td>`).join('')}</tr>`;
        }).join('')}</tbody></table></div>
        <div class="row" style="margin-top:12px;">
          <button class="btn teal" data-guardar-todos>Guardar todos los cambios</button>
          <button class="btn gold" data-guardar-descargar-todos>Guardar y descargar todo (ZIP)</button>
        </div>
        <p class="hint" style="margin-top:8px;">Cada certificado editado se marca como «reemplazado» y se crea uno nuevo con estos datos y su propio código QR.</p>
        <div id="editarMasivoMsg"></div>
      </div>
    </div>`;
    document.body.appendChild(fondo);

    fondo.querySelectorAll('[data-fila]').forEach(inp => inp.addEventListener('input', () => {
      cambios[Number(inp.dataset.fila)].datos[inp.dataset.campo] = inp.value;
    }));
    const cerrar = () => fondo.remove();
    fondo.querySelector('[data-cerrar]').addEventListener('click', cerrar);
    fondo.addEventListener('click', e => { if(e.target === fondo) cerrar(); });

    async function guardarTodos(){
      const msg = fondo.querySelector('#editarMasivoMsg');
      msg.innerHTML = '<p class="hint">Guardando…</p>';
      const nuevos = []; let fallos = 0;
      for(const it of cambios){
        const { data, error } = await supabase.rpc('replace_cert_certificate', { p_id: it.c.id, p_datos: it.datos });
        if(error){ fallos++; continue; }
        nuevos.push(data);
        issuedSeleccionados.delete(it.c.id);
      }
      await loadIssued();
      msg.innerHTML = fallos
        ? `<div class="msg warn">${nuevos.length} guardado(s), ${fallos} con error.</div>`
        : `<div class="msg ok">${nuevos.length} certificado(s) actualizados.</div>`;
      return nuevos;
    }
    fondo.querySelector('[data-guardar-todos]').addEventListener('click', () => guardarTodos());
    fondo.querySelector('[data-guardar-descargar-todos]').addEventListener('click', async () => {
      const nuevos = await guardarTodos();
      if(nuevos.length) await descargarCertificados(nuevos.map(n => n.id), 'certificados_corregidos');
      cerrar();
    });
  }

  /* Se espera a que la persona deje de escribir antes de preguntar: sin esto
     son ocho viajes a la base para escribir «Giodeli», y las respuestas pueden
     llegar desordenadas y dejar en pantalla el resultado de «Giodel». */
  let relojBusqueda = null;
  document.getElementById('buscarEmitidos').addEventListener('input', (e) => {
    const q = e.target.value.trim();
    clearTimeout(relojBusqueda);
    relojBusqueda = setTimeout(() => {
      if(q === busquedaEmitidos) return;
      busquedaEmitidos = q;
      loadIssued();
    }, 300);
  });
  document.getElementById('btnRefrescarLista').addEventListener('click', loadIssued);

  /* Descargar lo que hay filtrado en pantalla. Buscas «Orianny» y te llevas sus
     ocho certificados de una vez, sin marcar ocho casillas; el ZIP se llama por
     lo que se buscó, así que en la carpeta de descargas se sabe qué trae. */
  document.getElementById('btnDescargarFiltrados').addEventListener('click', () => {
    const q = document.getElementById('buscarEmitidos').value.trim();
    const filtrados = certificadosFiltrados();
    if(!filtrados.length) return;
    descargarCertificados(filtrados.map(c => c.id),
      q ? `certificados_${q}` : 'certificados_todos');
  });
  document.getElementById('btnBorrarHistorial').addEventListener('click', async () => {
    if(!await preguntar({
      titulo: `Borrar los ${issued.length} certificados emitidos`,
      peligro: true,
      aceptar: 'Entiendo, continuar',
      cuerpo: `<p>Esto borra <b>permanentemente</b> los ${issued.length} certificados emitidos
        hasta ahora.</p>
        <p><b>Los códigos QR ya impresos dejarán de verificar.</b> Si alguno de esos certificados
        está en manos de un estudiante o de un empleador, quedará como no válido.</p>
        <p>Úsalo sólo para limpiar pruebas.</p>`,
    })) return;
    if(!await preguntar({
      titulo: 'Confirma una vez más',
      peligro: true,
      aceptar: 'Sí, borrar todo el historial',
      cuerpo: '<p>No se puede deshacer.</p>',
    })) return;
    const { error } = await supabase.rpc('delete_all_cert_certificates');
    if(error){ alert('Error: ' + error.message); return; }
    issuedSeleccionados.clear();
    await loadIssued();
    await loadLotes();
  });

  init();
}
