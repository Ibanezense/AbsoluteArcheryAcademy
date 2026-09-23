# Attendance Reversal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permitir que administración revierta cualquiera de los dos orígenes de inasistencia, devuelva el crédito a la membresía debitada y muestre el mes de esa membresía en cada fila del historial.

**Architecture:** Conservar `bookings` y `student_weekly_attendance` como fuentes históricas, pero exponer una única acción administrativa respaldada por `attendance_reversals` y el RPC transaccional `admin_reverse_no_show`. El cliente combinará ambas fuentes en un único historial, excluirá las reversiones y resolverá el nombre del mes desde la membresía que consumió la clase.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, TanStack Query, Supabase/PostgreSQL, Vitest, Tailwind CSS.

---

### Task 1: Definir el contrato transaccional de reversión

**Files:**
- Create: `tests/supabase/adminAttendanceReversal.test.ts`
- Create: `supabase/migrations/<generated>_admin_attendance_reversal.sql`

**Step 1: Write the failing test**

Crear una prueba que localice la nueva migración y exija:

```ts
expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.attendance_reversals')
expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_reverse_no_show')
expect(sql).toContain("movement_type = 'attendance_consumed'")
expect(sql).toContain("movement_type = 'weekly_no_show_consumed'")
expect(sql).toContain("'no_show_reversal_refund'")
expect(sql).toContain('IF NOT public.is_admin_user()')
expect(sql).toContain('FOR UPDATE')
expect(sql).toContain('p_request_id')
```

También comprobar restricciones únicas para `booking_id`, `weekly_attendance_id` e `idempotency_key`, motivo obligatorio, grants restringidos y RLS de auditoría.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/supabase/adminAttendanceReversal.test.ts`

Expected: FAIL porque la migración y el RPC aún no existen.

**Step 3: Generate the migration**

Run: `npx supabase migration new admin_attendance_reversal`

Expected: un archivo nuevo bajo `supabase/migrations/` con timestamp generado por la CLI.

**Step 4: Implement the schema and RPC**

La migración debe:

```sql
CREATE TABLE IF NOT EXISTS public.attendance_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE RESTRICT,
  student_membership_id uuid NOT NULL REFERENCES public.student_memberships(id) ON DELETE RESTRICT,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE RESTRICT,
  weekly_attendance_id uuid REFERENCES public.student_weekly_attendance(id) ON DELETE RESTRICT,
  original_ledger_id uuid NOT NULL REFERENCES public.student_credit_ledger(id) ON DELETE RESTRICT,
  refund_ledger_id uuid UNIQUE REFERENCES public.student_credit_ledger(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (btrim(reason) <> ''),
  reversed_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL UNIQUE,
  reversed_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((booking_id IS NOT NULL)::int + (weekly_attendance_id IS NOT NULL)::int = 1)
);
```

Agregar índices únicos parciales por fuente, RLS y una política de lectura exclusiva para administradores. Ampliar el `CHECK` de `student_credit_ledger.movement_type` con `no_show_reversal_refund`.

Implementar:

```sql
public.admin_reverse_no_show(
  p_source text,
  p_event_id uuid,
  p_reason text,
  p_request_id uuid
) RETURNS jsonb
```

La función debe validar administrador, bloquear evento/membresía/ledger, resolver el consumo original según la fuente, devolver una clase en la membresía original, crear el movimiento positivo, guardar auditoría y retornar de forma idempotente el mismo resultado para la misma clave. Una segunda reversión con otra clave debe rechazarse sin devolver otro crédito.

No modificar ni borrar la fila histórica original. La revisión semanal seguirá considerándola resuelta internamente y las superficies visibles la excluirán mediante `attendance_reversals`.

**Step 5: Run test to verify it passes**

Run: `npm test -- --run tests/supabase/adminAttendanceReversal.test.ts`

Expected: PASS.

**Step 6: Commit**

```bash
git add tests/supabase/adminAttendanceReversal.test.ts supabase/migrations/*_admin_attendance_reversal.sql
git commit -m "feat(attendance): add atomic no-show reversal"
```

### Task 2: Crear el servicio administrativo idempotente

**Files:**
- Create: `lib/services/adminAttendanceReversalService.test.ts`
- Create: `lib/services/adminAttendanceReversalService.ts`

**Step 1: Write the failing test**

Probar que el servicio envía exactamente:

```ts
expect(client.rpc).toHaveBeenCalledWith('admin_reverse_no_show', {
  p_source: 'booking',
  p_event_id: 'booking-1',
  p_reason: 'Justificada por enfermedad',
  p_request_id: requestId,
})
```

Repetir para `weekly`, comprobar normalización de respuesta y propagación de errores.

**Step 2: Run test to verify it fails**

Run: `npm test -- --run lib/services/adminAttendanceReversalService.test.ts`

Expected: FAIL porque el servicio no existe.

**Step 3: Implement the minimal service**

Crear los tipos:

```ts
export type AttendanceReversalSource = 'booking' | 'weekly'
export type AttendanceReversalResult = {
  success: boolean
  already_reversed: boolean
  membership_id: string
  classes_remaining: number
}
```

Exportar `reverseStudentNoShow(client, input)` y validar que el servidor devuelva un resultado exitoso.

**Step 4: Run test to verify it passes**

Run: `npm test -- --run lib/services/adminAttendanceReversalService.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/services/adminAttendanceReversalService.ts lib/services/adminAttendanceReversalService.test.ts
git commit -m "feat(attendance): add reversal service"
```

### Task 3: Unificar el historial visible y asociar su membresía

**Files:**
- Modify: `lib/hooks/useStudentDetail.ts`
- Modify: `lib/utils/studentAttendanceHistory.ts`
- Modify: `lib/utils/studentAttendanceHistory.test.ts`
- Modify: `lib/utils/adminStudentProfile.test.ts`

**Step 1: Write the failing history tests**

Agregar casos que prueben:

- Una reserva conserva `active_membership_id`.
- Una falta semanal usa `student_membership_id` como membresía de la fila unificada.
- Una reserva o falta semanal con reversión no aparece en el resultado.
- `summarizeAttendance` no cuenta eventos revertidos porque ya fueron excluidos.
- El mes se obtiene desde `membership.start_date` y devuelve `Setiembre`, `Octubre` o `Sin membresía`.

API deseada:

```ts
buildStudentAttendanceHistory(bookings, weeklyAttendance, reversals)
formatAttendanceMembershipMonth(membershipId, memberships)
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run lib/utils/studentAttendanceHistory.test.ts lib/utils/adminStudentProfile.test.ts`

Expected: FAIL por campos y funciones inexistentes.

**Step 3: Extend the student detail query**

En `useStudentDetail.ts`:

- Añadir `student_membership_id` a `StudentWeeklyAttendanceSummary` y a su `select`.
- Consultar `attendance_reversals` por `student_id` con `booking_id` y `weekly_attendance_id`.
- Añadir el tipo `StudentAttendanceReversalSummary` y el campo `attendance_reversals` al resultado.
- Mantener el identificador real de la falta semanal separado del ID de presentación `weekly-*`.

**Step 4: Implement the unified history helpers**

Excluir las fuentes con reversión y asignar a cada fila:

```ts
source: 'booking' | 'weekly'
source_event_id: string
active_membership_id: string | null
```

Formatear el mes desde `start_date` con una lista española estable, sin depender del locale del navegador.

**Step 5: Run tests to verify they pass**

Run: `npm test -- --run lib/utils/studentAttendanceHistory.test.ts lib/utils/adminStudentProfile.test.ts`

Expected: PASS.

**Step 6: Commit**

```bash
git add lib/hooks/useStudentDetail.ts lib/utils/studentAttendanceHistory.ts lib/utils/studentAttendanceHistory.test.ts lib/utils/adminStudentProfile.test.ts
git commit -m "feat(attendance): unify history membership data"
```

### Task 4: Añadir la reversión al perfil administrativo

**Files:**
- Modify: `tests/app/adminStudentProfileOperationalRedesign.test.ts`
- Create: `tests/app/adminStudentAttendanceReversal.test.ts`
- Modify: `app/admin/alumnos/[id]/page.tsx`

**Step 1: Write the failing UI tests**

Comprobar que la pestaña contiene:

```ts
expect(page).toContain('Membresía')
expect(page).toContain('Revertir inasistencia')
expect(page).toContain('Motivo de la reversión')
expect(page).toContain('reverseStudentNoShow')
expect(page).toContain("['weekly-attendance-review']")
```

Verificar además que el botón solo se renderiza para `status === 'no_show'` y que la solicitud utiliza `crypto.randomUUID()` una sola vez por intento.

**Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/app/adminStudentAttendanceReversal.test.ts tests/app/adminStudentProfileOperationalRedesign.test.ts`

Expected: FAIL porque la columna, diálogo y acción no existen.

**Step 3: Implement the UI**

Actualizar `AttendanceTab` para recibir `studentId`, `memberships`, `reversals` y una función de refresco. Añadir:

- Columna `Membresía` con solo el mes.
- Columna `Acción`.
- Botón `Revertir inasistencia` únicamente para no-shows visibles.
- Diálogo accesible con textarea obligatorio, cancelar y confirmar.
- Estado de envío para impedir doble clic.
- Toast de éxito/error.

Después del RPC invalidar:

```ts
studentKeys.all
['weekly-attendance-review']
['admin-dashboard-operational']
['admin-bookings']
```

y ejecutar `refreshStudentData()` para actualizar inmediatamente historial y saldo.

**Step 4: Run tests to verify they pass**

Run: `npm test -- --run tests/app/adminStudentAttendanceReversal.test.ts tests/app/adminStudentProfileOperationalRedesign.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add app/admin/alumnos/[id]/page.tsx tests/app/adminStudentAttendanceReversal.test.ts tests/app/adminStudentProfileOperationalRedesign.test.ts
git commit -m "feat(admin): reverse student no-shows"
```

### Task 5: Aplicar la migración y verificar el flujo completo

**Files:**
- Modify only if verification reveals a defect in files from Tasks 1–4.

**Step 1: Run focused tests**

Run:

```bash
npm test -- --run tests/supabase/adminAttendanceReversal.test.ts lib/services/adminAttendanceReversalService.test.ts lib/utils/studentAttendanceHistory.test.ts tests/app/adminStudentAttendanceReversal.test.ts
```

Expected: todos PASS.

**Step 2: Run the full local gate**

Run:

```bash
npm test -- --run
npm run lint
npm run build
git diff --check
```

Expected: cero fallos y compilación de producción exitosa.

**Step 3: Apply the migration to the linked Supabase project**

Aplicar el SQL completo mediante el mecanismo de migración configurado. No ejecutar fragmentos parciales.

Expected: migración registrada una vez.

**Step 4: Verify transactionally in production data**

Usar una transacción que se revierta para comprobar:

- Un no-show de reserva devuelve una clase y crea auditoría/ledger.
- Un no-show semanal devuelve una clase y crea auditoría/ledger.
- La segunda reversión no devuelve otra clase.
- Un usuario no administrador es rechazado.

Finalizar con `ROLLBACK` para no modificar datos reales.

**Step 5: Run database advisors**

Ejecutar los advisors de seguridad y rendimiento de Supabase. Revisar cualquier aviso nuevo relacionado con `attendance_reversals` o `admin_reverse_no_show`.

**Step 6: Commit verification fixes if needed**

```bash
git add <affected-files>
git commit -m "fix(attendance): harden no-show reversal"
```

### Task 6: Integrar, desplegar y validar producción

**Files:**
- No expected source changes.

**Step 1: Review branch state**

Run: `git status --short --branch && git log --oneline main..HEAD`

Expected: solo commits de esta función y worktree limpio.

**Step 2: Merge into main and push**

Desde el checkout principal:

```bash
git merge --no-ff codex/attendance-reversal -m "merge: attendance reversal and membership labels"
git push origin main
```

**Step 3: Deploy production**

Run: `npx vercel deploy --prod --yes`

Expected: estado `READY` y alias de producción actualizado.

**Step 4: Verify production**

Comprobar HTTP 200, abrir el perfil administrativo y verificar:

- La columna Membresía muestra el mes correcto.
- Una inasistencia de cada origen ofrece la acción de reversión.
- El motivo es obligatorio.
- La reversión retira la fila y actualiza el saldo sin refresco manual.
- La persistencia se mantiene después de recargar.

**Step 5: Final report**

Entregar commit de `main`, URL/estado de Vercel, migración aplicada, conteo de pruebas y resultado de las verificaciones de ambos orígenes.
