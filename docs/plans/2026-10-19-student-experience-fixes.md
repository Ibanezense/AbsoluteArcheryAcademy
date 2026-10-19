# Correcciones de experiencia del alumno

Diseño aprobado: aplicar las recomendaciones de docs/qa/student-experience-audit-2026-10-19.md. Conservar colores/tipografía de la academia y reglas de membresías, saldo, cuotas, cortes, cancelación y aprobación. No crear datos de negocio durante QA. Mantener checkout original sin cambios; trabajar en la rama aislada existente.

## Arquitectura y contratos

- Historial: agregar RPC de lectura protegidos por resolve_accessible_student_id para resumen del plan vigente y filas filtradas/paginadas en servidor. No calcular totales a partir de una página. Filtros coherentes, estado de error explícito y separación entre plan actual e historial completo. Reutilizar contratos anteriores donde sea viable sin romper consumidores admin.
- Agenda: elegibilidad por fecha en servidor, coherente con book_session_multisite para plan, congelación, cuota, compromisos, tipo de crédito y cupos/corte. No ejecutar una reserva como prueba de elegibilidad. Añadir confirmación breve y actualizar caché de alumno/agenda después de la operación real.
- Detalle: carga, error y no encontrado separados; sede/dirección y modalidad traducida. Mantener autorización y acciones previas de cancelación.
- Renovación/contacto: acción persistente reutiliza RPC existente de opciones/solicitud; no compra automática ni envío durante QA. Mostrar solicitud pendiente. Root provee StudentRenewalActions(studentId) para integrarlo en la membresía. Contacto solo con datos verificados/confirmados de academia; enlaces abren canal, no envían mensajes.
- UI: Mis reservas en navegación con estado activo correcto; fechas sin recorte y plan ancho completo. Inicio compacto con acción de reservar/próxima clase arriba. Contenedor adaptable en escritorio, sin alterar vistas admin/auth/hub. Mejoras de nombres accesibles y estructura de encabezados.

## Tareas y propiedad

1. Historial y membresía: app/membresias/page.tsx, app/mis-reservas/page.tsx, nuevos servicio/hook/helpers de historial, migración/fixtures y tests asociados. Agente de historial también ajusta lectura móvil/escritorio de esas páginas e integra StudentRenewalActions.
2. Agenda y detalle: app/reservar/page.tsx, app/reserva/[id]/page.tsx, nuevos servicio/helpers, migración/fixtures y tests asociados. Agente de reservas prepara consulta elegible sin escrituras y diálogo de confirmación.
3. Root: app/page.tsx, app/LayoutWrapper.tsx, componentes de header/nav/semana, app/login/page.tsx, renovación/contacto y pruebas de estos componentes. No editar archivos propiedad de agentes.
4. Revisión de especificación y código, pruebas unitarias/SQL aislado con roles y límites, suite/lint/TypeScript/build. Probar navegador con cuenta autorizada en móvil y escritorio sin confirmar acciones de negocio.
5. Aplicar consultas/migraciones reales solamente una vez preparadas, probadas, revisadas y autorizadas. Registrar evidencia de no modificación de reservas/membresías. Mantener frontend local, sin publicación.

Definición de completado: contadores estables al paginar; turnos no elegibles identificados sin botón accionable; reserva requiere confirmar; estado no encontrado recuperable; sede y textos correctos; renovación/contacto accesibles; historial filtrado antes de paginar; lectura y navegación verificadas; validaciones apropiadas aprobadas y límites informados.
