# Attendance-only Membership Expiry Implementation Plan

**Goal:** Aplicar el diseño aprobado de asistencia, cierre diario y pérdida definitiva del saldo al vencer.

**Architecture:** Supabase conserva saldos, auditoría y cierres transaccionales; Next.js refleja las reglas en asistencia, creación e historial. Una marca por ciclo evita cambiar membresías históricas y una tabla de vencimiento conserva las cantidades sin inventar reservas.

**Tech Stack:** Next.js, TypeScript, PostgreSQL/Supabase, pg_cron, Vitest.

## 1. Escribir pruebas que fallen
Modificar tests/app/adminWeeklyAttendanceAlert.test.ts para exigir ausencia de controles manuales y semanales; añadir pruebas de vencimientos en lib/utils/studentAttendanceHistory.test.ts. Ejecutar con npm test -- <archivos>.

## 2. Base de datos
Crear migración con supabase migration new attendance_only_membership_expiry. Añadir marca de política, evento de vencimiento con RLS y auditoría, cierre diario, protección contra recuperar saldo vencido, bloqueo de nuevos no_show y programación cron. Conservar firmas y relaciones actuales. Añadir supabase/tests/attendance_only_transactional.sql y ejecutar dentro de BEGIN/ROLLBACK antes de aplicar.

## 3. Interfaz
Modificar app/admin/asistencia/page.tsx y components/admin/AdminOperationalComponents.tsx para registrar solo asistencia. Retirar recuperación del ciclo anterior en app/admin/membresias/page.tsx. Añadir eventos de vencimiento al detalle y al historial del alumno; mostrar membresía, clase no recuperable y fecha de vencimiento sin enlace a una reserva ficticia.

## 4. Verificar e integrar
Ejecutar pruebas enfocadas, suite, npm run lint y npm run build. Revisar el diff, accesos y comportamiento SQL real. Aplicar migración y verificar programación/saldos sin duplicados. Informar con precisión el estado local y publicado.
