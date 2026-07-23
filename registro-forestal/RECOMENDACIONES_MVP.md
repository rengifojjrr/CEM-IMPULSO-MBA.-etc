# Recomendaciones para presentar el MVP — Registro Forestal Beta

Este documento reúne sugerencias de mejora adicionales, organizadas por
perfil, pensadas para la conversación con el equipo/patrocinadores al
presentar esta beta como producto mínimo viable. Ninguna de estas es
necesaria para que el MVP funcione hoy — el sistema ya es funcional de
punta a punta (registro → IA → revisión → aprobación → ficha pública) — son
ideas para la siguiente iteración, priorizadas por impacto.

## Registrador (voluntario de campo)

1. **Modo sin conexión (offline-first)**: hoy cada foto y captura GPS se
   guarda contra Supabase en vivo. En zonas del parque con mala señal, valdría
   la pena encolar localmente (IndexedDB) y sincronizar cuando vuelva la
   conexión, para no perder un registro a mitad de jornada.
2. **Sesión de captura por lotes**: permitir registrar varios árboles
   seguidos sin volver a "Inicio" entre cada uno, pensando en una ronda de
   campo de una tarde con 10-20 árboles.
3. **Alerta de posible duplicado por cercanía**: antes de enviar, comparar la
   ubicación GPS contra árboles ya registrados cercanos y avisar ("ya hay un
   árbol a 3 m de aquí, ¿es el mismo?"). Hoy la detección de duplicados es
   manual, a cargo del supervisor.
4. **Notificación cuando un registro es devuelto**: hoy el voluntario se
   entera solo si vuelve a abrir la app. Un correo o push simple ("tu
   registro PDE-2026-000012 necesita corrección") mejoraría el tiempo de
   respuesta.
5. **Reconocimiento de progreso**: contador de árboles registrados por
   semana/mes, insignias o un ranking simple — ayuda a mantener motivados a
   voluntarios que no reciben pago por su tiempo.

## Supervisor

1. **Comparación visual directa con el catálogo**: ahora que el catálogo de
   especies admite fotos de referencia, la pantalla de revisión podría
   mostrarlas junto a las fotos del árbol en el mismo panel de comparación
   (hoy están una al lado de la otra como texto: especie declarada vs.
   sugerencia IA, sin fotos de catálogo todavía).
2. **Asignación/reparto de expedientes**: hoy cualquier cuenta con rol
   supervisor ve la bandeja completa de pendientes de todos los
   registradores. Para un piloto con un solo supervisor esto es correcto,
   pero si el equipo crece conviene poder asignar zonas o lotes por
   supervisor para evitar revisión duplicada.
3. **Indicador de antigüedad/SLA**: mostrar hace cuánto está pendiente cada
   expediente (y resaltar los que llevan más de X días) para priorizar la
   bandeja en vez de solo ordenarla por fecha.
4. **Acciones en lote**: aprobar varios árboles de alta confianza de la IA de
   una sola vez, para revisiones de rutina donde no hay dudas.
5. **Uso en campo**: la interfaz de supervisor está pensada para escritorio;
   si el supervisor también revisa en campo (tablet), valdría la pena un
   layout intermedio entre el bottom-nav del registrador y el sidebar actual.

## Administrador

1. **Proveedor de correo propio (SMTP)**: durante las pruebas de este ciclo
   encontramos el límite de envío de correo por defecto de Supabase ("email
   rate limit exceeded") al probar el autorregistro varias veces seguidas.
   Para producción real (más de un puñado de altas por hora) conviene
   configurar un proveedor SMTP propio (SendGrid, Postmark, Resend, etc.)
   desde el panel de Supabase — no requiere cambios en este código.
2. **Importación masiva del catálogo de especies**: hoy se agrega una especie
   a la vez desde el formulario. Si ya existe una lista de especies típicas
   del área piloto, un importador de CSV ahorraría carga manual repetitiva.
3. **Reportes exportables en PDF**: las exportaciones CSV/JSON ya cubren la
   migración de datos; para presentar avances a patrocinadores o aliados
   institucionales, un reporte PDF con gráficos (árboles por estado, por
   especie, línea de tiempo) sería más presentable que una hoja de cálculo.
4. **Analítica por zona/registrador**: dashboards segmentados (quién registró
   más, qué zonas tienen más rechazos) — útil tanto para reconocer
   voluntarios activos como para detectar zonas con problemas de calidad de
   datos.
5. **Flujo de apelación**: hoy un rechazo es una decisión final desde la UI
   (no hay forma de que el registrador pida una segunda revisión). Podría
   valer la pena un botón "solicitar reconsideración" para casos límite.
6. **Búsqueda y filtros en Auditoría**: la tabla de auditoría puede crecer
   rápido; hoy solo se puede recorrer visualmente (con scroll independiente
   ya corregido). Un filtro por acción, usuario o rango de fechas ayudaría
   cuando haya cientos de eventos.

## Transversal (todos los perfiles)

1. **Suite de pruebas automatizadas**: esta ronda se verificó con pruebas
   end-to-end reales contra el backend en producción (Playwright), pero no
   quedaron guardadas en el repositorio. Automatizar y versionar esas
   pruebas evitaría regresiones en futuras iteraciones.
2. **Prueba en dispositivos reales**: se probó en navegador de escritorio y
   emulación móvil; antes de un despliegue más amplio conviene una pasada en
   un teléfono Android y un iPhone reales (cámara, GPS, PWA instalada).
3. **Accesibilidad**: revisar contraste de color en las 8 insignias de
   estado y navegación por teclado en los formularios — no evaluado a fondo
   en esta ronda.
4. **Política de respaldo**: documentar (aunque sea en una línea del README)
   cada cuánto se respalda el proyecto de Supabase, para tranquilidad de
   quien reciba el sistema en producción.

---

*Ninguna de estas recomendaciones bloquea la presentación del MVP actual —
el flujo completo (registro con foto+GPS, IA real con Gemini, revisión y
aprobación por supervisor, panel de administración con mapa/usuarios/
especies/auditoría/exportaciones, y ficha pública con QR) ya es funcional de
principio a fin contra el backend real.*
