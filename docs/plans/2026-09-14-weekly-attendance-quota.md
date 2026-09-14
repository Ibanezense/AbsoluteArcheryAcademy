# Weekly Attendance Quota Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Calcular y registrar cada domingo las inasistencias faltantes según la frecuencia semanal contratada por cada alumno.

**Architecture:** Se añadirán frecuencias explícitas al plan y a la membresía, con backfill automático y un trigger que toma la instantánea al asignar. Una migración redefinirá la revisión y el registro dominical para calcular el déficit real, insertar una fila auditable por clase y consumir el crédito FIFO dentro de una transacción. La interfaz mostrará el desglose y permitirá confirmar una inasistencia por vez.

**Tech Stack:** Next.js 14, React, TypeScript, Supabase/PostgreSQL, PL/pgSQL, React Query, Vitest.

---

### Task 1: Frecuencia semanal persistente

**Files:**
- Create: `tests/supabase/weeklyAttendanceQuota.test.ts`
- Create: `supabase/migrations/<timestamp>_weekly_attendance_quota.sql`

**Step 1: Write the failing schema test**

Comprobar que la migración:

- añade `weekly_class_target` con rango `0..4` a `membership_plans` y `student_memberships`;
- clasifica por nombre los planes actuales aprobados y deja el resto en `0`;
- copia la frecuencia a todas las membresías existentes;
- instala un trigger que copia el valor del plan al insertar una membresía y al cambiar su plan, sin modificar instantáneas antiguas cuando solo cambia el plan maestro.

**Step 2: Run test to verify RED**

Run: `npx vitest run tests/supabase/weeklyAttendanceQuota.test.ts`

Expected: FAIL porque la migración no existe.

**Step 3: Create the migration**

Run: `npx supabase migration new weekly_attendance_quota`

Implementar columnas, restricciones, backfill y `set_student_membership_weekly_class_target()` con `SET search_path = public`.

**Step 4: Run test to verify GREEN**

Run: `npx vitest run tests/supabase/weeklyAttendanceQuota.test.ts`

Expected: PASS.

**Step 5: Commit**

Run: `git add tests/supabase/weeklyAttendanceQuota.test.ts supabase/migrations/*_weekly_attendance_quota.sql && git commit -m "feat(attendance): persist weekly class targets"`

### Task 2: Déficit dominical y consumo individual

**Files:**
- Modify: `tests/supabase/weeklyAttendanceQuota.test.ts`
- Modify: `supabase/migrations/<timestamp>_weekly_attendance_quota.sql`

**Step 1: Write failing behavior tests**

Exigir que `get_weekly_attendance_review(date)` devuelva por candidato:

- `weekly_class_target`;
- `attended_count`;
- `booking_no_show_count`;
- `weekly_no_show_count`;
- `completed_count`;
- `missing_count` limitado al crédito no comprometido;
- la membresía FIFO disponible para el próximo consumo.

Exigir que cuente `attended` y `no_show` de reservas entre jueves y domingo, sume las filas ya confirmadas y excluya candidatos con déficit cero o frecuencia cero.

Exigir que `admin_mark_weekly_no_show(uuid, date)` vuelva a calcular el déficit, bloquee las filas necesarias, seleccione el crédito FIFO sin invadir reservas futuras, cree el siguiente `occurrence_index`, guarde una nota dinámica, descuente exactamente una clase y cree un movimiento de crédito vinculado.

**Step 2: Run test to verify RED**

Run: `npx vitest run tests/supabase/weeklyAttendanceQuota.test.ts tests/supabase/weeklyAttendanceReview.test.ts tests/supabase/multipleActiveMemberships.test.ts`

Expected: FAIL por campos y reglas todavía ausentes.

**Step 3: Extend the attendance table**

En la misma migración:

- añadir `occurrence_index smallint`, `note text` y sus restricciones;
- numerar filas existentes con `1`;
- reemplazar la unicidad `(student_id, week_start)` por `(student_id, week_start, occurrence_index)`;
- reemplazar el índice único del ledger para que siga habiendo un movimiento por fila semanal.

**Step 4: Redefine the two RPCs**

Mantener validación admin, domingo no futuro, zona `America/Lima`, estados protegidos, `SECURITY DEFINER`, `search_path` fijo y revocación anónima. La nota tendrá el formato:

`El alumno asistió {attended_count} de las {weekly_class_target} clases requeridas esta semana. Esta clase se considera inasistida.`

Una llamada sin déficit o sin crédito libre devolverá `already_marked: true` sin escribir.

**Step 5: Run test to verify GREEN**

Run: `npx vitest run tests/supabase/weeklyAttendanceQuota.test.ts tests/supabase/weeklyAttendanceReview.test.ts tests/supabase/multipleActiveMemberships.test.ts`

Expected: PASS.

**Step 6: Commit**

Run: `git add tests/supabase/weeklyAttendanceQuota.test.ts supabase/migrations/*_weekly_attendance_quota.sql && git commit -m "feat(attendance): calculate weekly attendance deficits"`

### Task 3: Contrato del servicio y tarjeta dominical

**Files:**
- Modify: `lib/services/adminWeeklyAttendanceService.ts`
- Modify: `lib/services/adminWeeklyAttendanceService.test.ts`
- Modify: `components/admin/WeeklyAttendanceReview.tsx`
- Modify: `tests/app/adminWeeklyAttendanceAlert.test.ts`
- Modify: `app/admin/asistencia/page.tsx`

**Step 1: Write failing service and UI tests**

Añadir casos que validen los nuevos contadores, textos del desglose, botón `Marcar 1 inasistencia`, confirmación dinámica y actualización del candidato después de cada registro.

**Step 2: Run tests to verify RED**

Run: `npx vitest run lib/services/adminWeeklyAttendanceService.test.ts tests/app/adminWeeklyAttendanceAlert.test.ts`

Expected: FAIL por tipos y contenido inexistentes.

**Step 3: Extend the service types**

Incorporar los seis contadores nuevos a `WeeklyAttendanceCandidate` y devolver en el resultado `remaining_missing_count`, además del identificador semanal y saldo.

**Step 4: Update the card and confirmation**

Mostrar la frecuencia, asistencias, inasistencias registradas y pendientes. La confirmación debe explicar que se descontará una clase y usar singular o plural correctamente. Al terminar, recargar el roster, la revisión y las consultas de alumnos/membresías ya invalidadas por la página.

**Step 5: Run tests to verify GREEN**

Run: `npx vitest run lib/services/adminWeeklyAttendanceService.test.ts tests/app/adminWeeklyAttendanceAlert.test.ts`

Expected: PASS.

**Step 6: Commit**

Run: `git add lib/services/adminWeeklyAttendanceService.ts lib/services/adminWeeklyAttendanceService.test.ts components/admin/WeeklyAttendanceReview.tsx tests/app/adminWeeklyAttendanceAlert.test.ts app/admin/asistencia/page.tsx && git commit -m "feat(admin): show weekly attendance deficits"`

### Task 4: Campo editable en planes

**Files:**
- Modify: `lib/hooks/useMembershipPlans.ts`
- Modify: `app/admin/membresias/page.tsx`
- Modify: `tests/app/adminMembershipsActiveAndPlans.test.ts`

**Step 1: Write the failing UI test**

Comprobar que el editor carga, valida y guarda `weekly_class_target`, acepta `0..4` y explica que `0` desactiva el control dominical.

**Step 2: Run test to verify RED**

Run: `npx vitest run tests/app/adminMembershipsActiveAndPlans.test.ts`

Expected: FAIL por el campo ausente.

**Step 3: Implement the plan field**

Extender tipos, normalización, formulario y payload de inserción/actualización. Mostrar la frecuencia en las tarjetas de planes.

**Step 4: Run test to verify GREEN**

Run: `npx vitest run tests/app/adminMembershipsActiveAndPlans.test.ts`

Expected: PASS.

**Step 5: Commit**

Run: `git add lib/hooks/useMembershipPlans.ts app/admin/membresias/page.tsx tests/app/adminMembershipsActiveAndPlans.test.ts && git commit -m "feat(memberships): configure weekly class targets"`

### Task 5: Nota visible en el historial

**Files:**
- Modify: `lib/hooks/useStudentDetail.ts`
- Modify: `lib/utils/studentAttendanceHistory.ts`
- Modify: `lib/utils/studentAttendanceHistory.test.ts`
- Modify: `app/admin/alumnos/[id]/page.tsx`
- Modify: `tests/app/studentWeeklyAttendanceHistory.test.ts`

**Step 1: Write failing history tests**

Comprobar que las múltiples filas semanales se cargan en orden, no colisionan por identificador y muestran la nota persistida en lugar del texto fijo.

**Step 2: Run tests to verify RED**

Run: `npx vitest run lib/utils/studentAttendanceHistory.test.ts tests/app/studentWeeklyAttendanceHistory.test.ts`

Expected: FAIL por falta de `note`.

**Step 3: Implement history rendering**

Seleccionar `note`, transportarla al modelo combinado y presentarla en la tabla administrativa. Mantener el texto anterior como fallback para filas históricas.

**Step 4: Run tests to verify GREEN**

Run: `npx vitest run lib/utils/studentAttendanceHistory.test.ts tests/app/studentWeeklyAttendanceHistory.test.ts`

Expected: PASS.

**Step 5: Commit**

Run: `git add lib/hooks/useStudentDetail.ts lib/utils/studentAttendanceHistory.ts lib/utils/studentAttendanceHistory.test.ts app/admin/alumnos/[id]/page.tsx tests/app/studentWeeklyAttendanceHistory.test.ts && git commit -m "feat(attendance): show weekly absence notes"`

### Task 6: Verificación integral

**Files:**
- Verify all changed files.

**Step 1: Run focused suite**

Run: `npx vitest run tests/supabase/weeklyAttendanceQuota.test.ts tests/supabase/weeklyAttendanceReview.test.ts tests/supabase/multipleActiveMemberships.test.ts lib/services/adminWeeklyAttendanceService.test.ts tests/app/adminWeeklyAttendanceAlert.test.ts tests/app/adminMembershipsActiveAndPlans.test.ts lib/utils/studentAttendanceHistory.test.ts tests/app/studentWeeklyAttendanceHistory.test.ts`

Expected: PASS.

**Step 2: Run repository gate**

Run: `npm test -- --run`

Run: `npm run lint`

Run: `npx tsc --noEmit --incremental false`

Run: `npm run build`

Expected: todos con exit `0`.

**Step 3: Review SQL and code**

Solicitar una revisión independiente centrada en dobles descuentos, concurrencia, FIFO, reservas comprometidas, backfill y seguridad de RPC. Corregir cualquier hallazgo crítico o importante y repetir las pruebas.

**Step 4: Delivery boundary**

Dejar la rama limpia y lista. Aplicar la migración, integrar en `main` y desplegar únicamente si el usuario lo solicita para esta entrega.
