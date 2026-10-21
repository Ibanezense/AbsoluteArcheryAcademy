# Avisos al abrir la app

Diseño aprobado por el usuario el 20/10/2026.

Administración dispone de Notificaciones: título, mensaje, todos o alumnos elegidos, fecha final opcional, vista previa, publicación y desactivación. Un aviso publicado es inmutable; una corrección requiere otro aviso para no cambiar silenciosamente lo ya leído. No se envían mensajes ni push fuera de la app.

Cada alumno ve sus avisos vigentes una sola vez, incluso desde otro dispositivo. La lectura se registra al cerrar o pulsar Entendido. Los tutores usan el contexto del alumno elegido. Nunca se muestran dos ventanas simultáneamente.

El recordatorio automático de membresía vencida tiene prioridad. Se muestra en cada apertura o regreso desde segundo plano, admite X y Escape, y no se repite por navegar. Deja de aparecer si existe una membresía activa; no interpreta una clase restante como vencimiento. Renovar abre el flujo existente. El aviso anterior de última clase se conserva después de la cola de avisos.

Las nuevas tablas almacenan avisos, destinatarios y cierres por alumno. RPC con autorización explícita valida al administrador activo o la relación de acceso al alumno. RLS y revocación de escrituras directas protegen las tablas. El historial conserva autor y fechas. La consulta no cambia membresías, reservas ni pagos.

Verificación: reglas de cola y validación, aislamiento entre alumnos/tutores, anonimato y cuenta desactivada, publicaciones no vigentes, idempotencia de cierres, renovación activa, navegación y reapertura, accesibilidad y móvil. Probar SQL en PostgreSQL desechable; reservar activación en base real para autorización concreta, según el alcance previo.
