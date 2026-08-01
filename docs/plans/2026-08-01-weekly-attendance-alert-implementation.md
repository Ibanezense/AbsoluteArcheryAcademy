# Weekly Attendance Alert Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mostrar cada domingo los alumnos activos o por vencer sin asistencias entre jueves y domingo, permitir registrar una inasistencia semanal que descuente una clase y reflejarla en el historial del alumno.

**Architecture:** Una migración aditiva crea `student_weekly_attendance`, amplía el ledger y expone una RPC de revisión y otra RPC administrativa transaccional e idempotente. La página `/admin/asistencia` consume esas RPC mediante un servicio tipado y presenta tarjetas rojas; `useStudentDetail` carga los eventos semanales para unirlos cronológicamente al historial existente sin inventar reservas.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Supabase/Postgres, TanStack Query, Day.js, Vitest, Tailwind CSS.

---

### Task 1: Confirmar Supabase actual y preparar la migración

**Files:**
- Create via CLI: `supabase/migrations/<timestamp>_weekly_attendance_review.sql`
- Reference: `docs/plans/2026-08-01-weekly-attendance-alert-design.md`
- Reference: `.codex/skills/archery-pwa-v2/references/domain-model.md`

**Step 1: Revisar cambios y documentación vigentes**

Consultar `https://supabase.com/changelog.md` y la documentación oficial de funciones Postgres, RLS y `SECURITY DEFINER`. Confirmar que no existe un cambio incompatible con Supabase JS `2.44.4` ni con las funciones RPC usadas en el proyecto.

**Step 2: Descubrir la CLI y crear el archivo**

Run:

```powershell
npx supabase --version
npx supabase migration --help
npx supabase migration new weekly_attendance_review
```

Expected: la CLI reporta la ruta exacta de una migración nueva. Usar únicamente esa ruta en los pasos posteriores.

**Step 3: Confirmar que solo se creó el archivo vacío**

Run:

```powershell
git status --short
```

Expected: solo aparece la migración generada además del plan de implementación.

### Task 2: Definir el contrato temporal jueves-domingo con TDD

**Files:**
- Create: `lib/utils/weeklyAttendance.ts`
- Create: `lib/utils/weeklyAttendance.test.ts`

**Step 1: Escribir pruebas fallidas**

Cubrir:

```ts
expect(getWeeklyAttendanceWindow('2026-08-02')).toEqual({
  isSunday: true,
  weekStart: '2026-07-30',
  weekEnd: '2026-08-02',
})

expect(getWeeklyAttendanceWindow('2026-08-01').isSunday).toBe(false)
```

La utilidad debe interpretar cadenas `YYYY-MM-DD` como fechas locales de calendario y no desplazar el resultado por UTC.

**Step 2: Verificar RED**

Run:

```powershell
npm test -- lib/utils/weeklyAttendance.test.ts
```

Expected: FAIL porque `weeklyAttendance.ts` todavía no existe.

**Step 3: Implementar lo mínimo**

Exportar:

```ts
export type WeeklyAttendanceWindow = {
  isSunday: boolean
  weekStart: string
  weekEnd: string
}

export function getWeeklyAttendanceWindow(date: string): WeeklyAttendanceWindow
```

Usar Day.js para validar la fecha, comprobar `day() === 0` y restar tres días cuando sea domingo.

**Step 4: Verificar GREEN**

Run:

```powershell
npm test -- lib/utils/weeklyAttendance.test.ts
```

Expected: PASS.

**Step 5: Commit**

```powershell
git add lib/utils/weeklyAttendance.ts lib/utils/weeklyAttendance.test.ts
git commit -m "test(attendance): define weekly review window"
```

### Task 3: Especificar y crear la persistencia/RPC con TDD

**Files:**
- Create: `tests/supabase/weeklyAttendanceReview.test.ts`
- Modify: `supabase/migrations/<timestamp>_weekly_attendance_review.sql`

**Step 1: Escribir la prueba estructural fallida**

La prueba debe leer la migración generada y exigir:

```ts
expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.student_weekly_attendance')
expect(sql).toContain('UNIQUE (student_id, week_start)')
expect(sql).toContain("CHECK (status = 'no_show')")
expect(sql).toContain('weekly_attendance_id uuid')
expect(sql).toContain("'weekly_no_show_consumed'")
expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_weekly_attendance_review')
expect(sql).toContain('CREATE OR REPLACE FUNCTION public.admin_mark_weekly_no_show')
expect(sql).toContain("EXTRACT(DOW FROM p_sunday) <> 0")
expect(sql).toContain("AT TIME ZONE 'America/Lima'")
expect(sql).toContain("b.status = 'attended'")
expect(sql).toContain("b.status = 'reserved'")
expect(sql).toContain('FOR UPDATE')
expect(sql).toContain("ON CONFLICT (student_id, week_start) DO NOTHING")
expect(sql).toContain('REVOKE ALL ON FUNCTION public.admin_mark_weekly_no_show')
expect(sql).toContain('FROM anon')
```

También comprobar que la función de revisión filtra membresías activas, `classes_remaining > 0`, vigencia hasta el domingo y estados protegidos del alumno.

**Step 2: Verificar RED**

Run:

```powershell
npm test -- tests/supabase/weeklyAttendanceReview.test.ts
```

Expected: FAIL porque la migración aún está vacía.

**Step 3: Implementar la tabla y seguridad**

Crear `student_weekly_attendance` con UUID, referencias a `students`, `student_memberships` y `profiles`, fechas jueves/domingo, estado `no_show`, una clase consumida y timestamps. Añadir índices por alumno/fecha, habilitar RLS y políticas de lectura con `can_access_student(student_id)`; no crear políticas directas de escritura para clientes.

Alterar `student_credit_ledger` para:

- añadir `weekly_attendance_id uuid REFERENCES public.student_weekly_attendance(id) ON DELETE SET NULL`;
- ampliar `student_credit_ledger_movement_type_check` con `weekly_no_show_consumed` sin retirar tipos existentes.

**Step 4: Implementar `get_weekly_attendance_review(date)`**

Retornar `jsonb` con:

```json
{
  "is_sunday": true,
  "week_start": "2026-07-30",
  "week_end": "2026-08-02",
  "pending_count": 0,
  "candidates": []
}
```

La función debe:

- validar autenticación y rol admin;
- rechazar días distintos de domingo con `is_sunday = false` y candidatos vacíos;
- calcular jueves-domingo;
- contar todas las reservas `reserved` del periodo;
- devolver candidatos solo si `pending_count = 0`;
- seleccionar `students.id`, nunca `profiles.id`;
- exigir membresía activa/vigente/con saldo;
- excluir estados `retired`, `withdrawn`, `blocked`, `suspended`;
- excluir cualquier alumno con al menos un `attended` durante el periodo;
- excluir eventos semanales ya registrados;
- etiquetar como `expiring` si `end_date <= p_sunday + 7`.

**Step 5: Implementar `admin_mark_weekly_no_show(uuid, date)`**

La RPC debe repetir validaciones, bloquear la membresía con `FOR UPDATE`, comprobar idempotencia, insertar el evento con `ON CONFLICT ... DO NOTHING`, descontar una clase e insertar el ledger en una sola transacción. Devolver JSON con `success`, `already_marked`, `weekly_attendance_id` y `classes_remaining`.

Revocar ejecución de `PUBLIC` y `anon`; conceder solo a `authenticated` y `service_role`. Incluir comprobaciones explícitas `auth.uid()` e `is_admin_user()` dentro de ambas funciones privilegiadas.

**Step 6: Verificar GREEN**

Run:

```powershell
npm test -- tests/supabase/weeklyAttendanceReview.test.ts
```

Expected: PASS.

**Step 7: Commit**

```powershell
git add tests/supabase/weeklyAttendanceReview.test.ts supabase/migrations/<timestamp>_weekly_attendance_review.sql
git commit -m "feat(attendance): add weekly no-show persistence"
```

### Task 4: Crear el servicio tipado con TDD

**Files:**
- Create: `lib/services/adminWeeklyAttendanceService.ts`
- Create: `lib/services/adminWeeklyAttendanceService.test.ts`

**Step 1: Escribir pruebas fallidas**

Usar un cliente RPC mínimo para comprobar:

```ts
await getWeeklyAttendanceReview(client, '2026-08-02')
expect(client.rpc).toHaveBeenCalledWith('get_weekly_attendance_review', {
  p_sunday: '2026-08-02',
})

await markWeeklyNoShow(client, { studentId: 'student-1', sunday: '2026-08-02' })
expect(client.rpc).toHaveBeenCalledWith('admin_mark_weekly_no_show', {
  p_student_id: 'student-1',
  p_sunday: '2026-08-02',
})
```

Cubrir además errores RPC y respuestas `success: false`.

**Step 2: Verificar RED**

Run:

```powershell
npm test -- lib/services/adminWeeklyAttendanceService.test.ts
```

Expected: FAIL por módulo inexistente.

**Step 3: Implementar tipos y funciones**

Definir `WeeklyAttendanceCandidate`, `WeeklyAttendanceReview`, `getWeeklyAttendanceReview` y `markWeeklyNoShow`. Mantener el cliente inyectable para pruebas y usar `supabase` desde la página.

**Step 4: Verificar GREEN y commit**

```powershell
npm test -- lib/services/adminWeeklyAttendanceService.test.ts
git add lib/services/adminWeeklyAttendanceService.ts lib/services/adminWeeklyAttendanceService.test.ts
git commit -m "feat(attendance): add weekly review service"
```

### Task 5: Implementar la alerta dominical con TDD

**Files:**
- Modify: `app/admin/asistencia/page.tsx`
- Create: `components/admin/WeeklyAttendanceReview.tsx`
- Create: `tests/app/adminWeeklyAttendanceAlert.test.ts`

**Step 1: Escribir prueba de superficie fallida**

La prueba debe exigir en los archivos de interfaz:

- cálculo con `getWeeklyAttendanceWindow(selectedDate)`;
- carga con `getWeeklyAttendanceReview` solo en domingo;
- aviso de reservas pendientes;
- texto `Alumnos sin asistencia esta semana`;
- clases Tailwind de contorno rojo;
- texto sobre campeonato nacional;
- botón `Marcar no asistió esta semana`;
- confirmación que mencione el descuento de una clase;
- llamada `markWeeklyNoShow`;
- invalidación de `studentKeys.all` y recarga de la revisión.

**Step 2: Verificar RED**

Run:

```powershell
npm test -- tests/app/adminWeeklyAttendanceAlert.test.ts
```

Expected: FAIL porque el componente no existe.

**Step 3: Implementar el componente**

`WeeklyAttendanceReview` recibirá la revisión, loading/error, ID en proceso y callbacks. Renderizará:

- nada fuera del domingo;
- skeleton durante carga;
- aviso ámbar si `pending_count > 0`;
- estado satisfactorio si no hay candidatos;
- tarjetas rojas por candidato con avatar, plan, saldo, estado y explicación;
- botón individual deshabilitado solo durante su operación.

**Step 4: Integrar la página**

En `AsistenciaContent`:

- mantener estado de revisión semanal;
- cargarla después del roster solo en domingo;
- pedir confirmación antes de marcar;
- invocar la RPC;
- recargar roster/revisión y `queryClient.invalidateQueries({ queryKey: studentKeys.all })`;
- mostrar toast de éxito/error.

**Step 5: Verificar GREEN y commit**

```powershell
npm test -- tests/app/adminWeeklyAttendanceAlert.test.ts
git add app/admin/asistencia/page.tsx components/admin/WeeklyAttendanceReview.tsx tests/app/adminWeeklyAttendanceAlert.test.ts
git commit -m "feat(attendance): show Sunday no-show alerts"
```

### Task 6: Incorporar la inasistencia semanal al historial con TDD

**Files:**
- Modify: `lib/hooks/useStudentDetail.ts`
- Modify: `app/admin/alumnos/[id]/page.tsx`
- Create: `lib/utils/studentAttendanceHistory.ts`
- Create: `lib/utils/studentAttendanceHistory.test.ts`
- Create: `tests/app/studentWeeklyAttendanceHistory.test.ts`

**Step 1: Escribir pruebas fallidas del modelo de presentación**

Crear casos que combinen reservas y eventos semanales y esperen orden cronológico descendente. El evento semanal debe producir:

```ts
{
  kind: 'weekly_no_show',
  status: 'no_show',
  date: '2026-08-02',
  note: 'Inasistencia semanal (jueves a domingo)',
  time: null,
}
```

**Step 2: Verificar RED**

```powershell
npm test -- lib/utils/studentAttendanceHistory.test.ts tests/app/studentWeeklyAttendanceHistory.test.ts
```

Expected: FAIL por utilitario y consulta inexistentes.

**Step 3: Extender `useStudentDetail`**

Agregar `StudentWeeklyAttendanceSummary`, consultar `student_weekly_attendance` por `student_id`, ordenar por `week_end DESC` y devolver `weekly_attendance` dentro de `StudentDetailData`.

**Step 4: Unificar y renderizar el historial**

Implementar `buildStudentAttendanceHistory` y actualizar `AttendanceTab` para recibir reservas y eventos semanales. Mostrar la fila semanal como `No asistió`, con fecha del domingo, sin horario ficticio y con la nota del periodo.

**Step 5: Verificar GREEN y commit**

```powershell
npm test -- lib/utils/studentAttendanceHistory.test.ts tests/app/studentWeeklyAttendanceHistory.test.ts
git add lib/hooks/useStudentDetail.ts app/admin/alumnos/[id]/page.tsx lib/utils/studentAttendanceHistory.ts lib/utils/studentAttendanceHistory.test.ts tests/app/studentWeeklyAttendanceHistory.test.ts
git commit -m "feat(attendance): show weekly no-shows in student history"
```

### Task 7: Aplicar y validar Supabase real

**Files:**
- Verify: `supabase/migrations/<timestamp>_weekly_attendance_review.sql`

**Step 1: Inspeccionar configuración y estado remoto**

Confirmar proyecto enlazado, variables reales y ayuda CLI antes de ejecutar comandos. No registrar secretos en salida.

**Step 2: Aplicar la migración usando el mecanismo existente del repositorio**

Descubrir primero:

```powershell
npx supabase db --help
npx supabase migration --help
```

Aplicar solo después de confirmar el proyecto correcto y el diff exacto.

**Step 3: Ejecutar pruebas SQL reales**

Validar con transacción reversible o datos de prueba controlados:

- sábado devuelve `is_sunday = false`;
- domingo calcula jueves-domingo;
- candidato activo sin asistencia aparece;
- candidato por vencer aparece;
- alumno con asistencia se excluye;
- reservas pendientes bloquean candidatos/acción;
- marcado descuenta exactamente una clase;
- segundo marcado no descuenta otra clase;
- evento y ledger quedan vinculados;
- `anon` no puede ejecutar RPC privilegiadas.

**Step 4: Ejecutar advisors**

Run mediante CLI/MCP según disponibilidad:

```powershell
npx supabase db advisors
```

Expected: sin nuevos hallazgos de seguridad o rendimiento atribuibles a la migración.

### Task 8: Verificación integral y cierre

**Files:**
- Verify all modified files

**Step 1: Ejecutar pruebas específicas**

```powershell
npm test -- lib/utils/weeklyAttendance.test.ts tests/supabase/weeklyAttendanceReview.test.ts lib/services/adminWeeklyAttendanceService.test.ts tests/app/adminWeeklyAttendanceAlert.test.ts lib/utils/studentAttendanceHistory.test.ts tests/app/studentWeeklyAttendanceHistory.test.ts
```

Expected: todas PASS.

**Step 2: Ejecutar gate completo**

```powershell
npm test
npm run lint
npm run build
git diff --check
```

Expected: 0 fallos, lint limpio, build exitoso y sin errores de whitespace.

**Step 3: Verificación visual autenticada**

Levantar la aplicación y comprobar `/admin/asistencia?date=<domingo>` con sesión admin:

- el panel no aparece el sábado;
- el domingo pendiente muestra aviso ámbar;
- el domingo cerrado muestra tarjetas rojas correctas;
- confirmar un candidato descuenta una clase, elimina la tarjeta y actualiza el historial sin F5;
- no hay errores de consola ni overlays.

**Step 4: Auditoría requisito por requisito**

Releer el objetivo y este diseño. Vincular cada requisito con evidencia actual: prueba, SQL real, captura/estado visual o salida de comando. No declarar completado si falta la validación autenticada o la prueba real de idempotencia.

**Step 5: Commit final de ajustes de verificación**

```powershell
git status --short
git add <solo archivos del alcance>
git commit -m "test(attendance): verify weekly no-show workflow"
```
