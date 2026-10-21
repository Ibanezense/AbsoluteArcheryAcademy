# Academy Notifications Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publicar avisos administrativos y recordar la renovación en cada apertura mientras la membresía esté vencida.

**Architecture:** Tablas aditivas para avisos, destinatarios y cierres por alumno. RPC autorizadas y un único coordinador de ventanas persistente entre rutas, que reutiliza el flujo de renovación existente.

**Tech Stack:** Next.js, React, Tailwind, React Query, Supabase PostgreSQL, Vitest y PostgreSQL desechable PGlite.

---

### Task 1: Reglas y permisos
1. Añadir `lib/utils/academyNotifications.test.ts` con validación, fechas Lima, prioridad y cierre por apertura; ejecutar `npx vitest run lib/utils/academyNotifications.test.ts` y observar fallos.
2. Implementar `lib/utils/academyNotifications.ts` hasta pasar las pruebas.
3. Añadir bootstrap y runner `tests/supabase/runAcademyNotifications.mjs` con PostgreSQL aislado. Probar creación, publicaciones, destinatarios, cierres e intentos de acceso cruzado antes de implementar la migración generada por CLI.
4. Implementar la migración aditiva `academy_notifications`, ejecutar el runner y comprobar sus permisos y repetibilidad.

### Task 2: Administración
1. Crear `lib/services/academyNotificationService.ts` y pruebas de RPC y errores; verificar rojo y verde.
2. Crear `app/admin/notificaciones/page.tsx` y el formulario en `components/admin/AcademyNotifications.tsx`.
3. Añadir navegación en `components/AdminSidebar.tsx` y selección de ruta en `app/admin/layout.tsx`. Previsualizar el popup antes de publicar. Conservar borrador si hay error; sin publicaciones de prueba a alumnos reales.

### Task 3: Experiencia del alumno
1. Crear popup accesible `components/student/AcademyNoticeDialog.tsx` y coordinador `StudentNotificationCenter.tsx` con apertura/visibilidad, cola y cierres.
2. Reutilizar `MembershipRenewalPrompt` para solicitud manual y última clase; desactivar solo su antigua apertura automática de vencimiento. En `app/LayoutWrapper.tsx` montar un coordinador sin key por ruta.
3. Incluir cuenta y alumno en caché y vaciar datos al cambiar sesión. Nunca usar nombres o datos de otros alumnos en el popup.

### Task 4: Cierre y activación
1. Ejecutar pruebas completas, lint, TypeScript, build, SQL y revisión independiente de permisos/colas.
2. Verificar UI móvil con la cuenta administrativa existente y vista previa sin publicar. Guardar captura privada.
3. Documentar evidencias y preparar la migración real para aprobación; no activar la base real antes de obtenerla. No afirmar que el flujo real de alumno está habilitado mientras falte ese paso.
