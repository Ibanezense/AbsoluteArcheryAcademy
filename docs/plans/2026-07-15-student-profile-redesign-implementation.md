# Student Profile Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convertir el detalle administrativo del alumno en un perfil modular con las pestañas Perfil, Datos deportivos, Asistencias, Membresía, Pagos y Reservas, usando datos reales y conservando las operaciones existentes.

**Architecture:** La ruta seguirá siendo un cliente de React Query, pero el archivo monolítico se dividirá en un shell y componentes de pestaña bajo `components/admin/student-profile`. La lógica de estado, filtros y proyecciones de tablas se moverá a utilidades puras probadas; Supabase solo se ampliará con el campo aditivo `dominant_hand`, sin introducir todavía documentos fiscales ni acciones financieras simuladas.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, TanStack Query, Supabase/Postgres, Vitest, Lucide React.

---

## Reglas de ejecución

- Trabajar en `D:\PROGRAMACION\archery-reservas-pwa\.worktrees\compact-student-list`.
- Aplicar @test-driven-development en cada cambio de comportamiento.
- Aplicar @archery-pwa-v2 para migraciones, consultas y mutaciones de dominio.
- Aplicar @frontend-design al construir los componentes visuales.
- No modificar el menú lateral ni rutas públicas.
- No crear números de documento, descuentos, congelamientos ni fechas de facturación ficticias.
- Mantener el servidor de producción en segundo plano al finalizar.

### Task 1: Unificar el cálculo de estado del alumno

**Files:**
- Create: `lib/utils/studentOperationalStatus.ts`
- Create: `lib/utils/studentOperationalStatus.test.ts`
- Modify: `lib/utils/adminStudentList.ts`
- Modify: `app/admin/alumnos/[id]/page.tsx`

**Step 1: Write the failing lifecycle tests**

Crear casos para activo, por vencer a siete días, vencido entre los días 0 y 14, pausa entre 15 y 60 e inactivo desde el día 61:

```ts
expect(getStudentOperationalStatus({
  membershipStatus: 'expired',
  classesRemaining: 0,
  membershipExpiredAt: '2026-05-15T10:00:00-05:00',
  membershipEnd: '2026-05-14',
  effectiveStatus: 'paused',
}, now)).toBe('inactive')
```

Añadir también el caso de estado protegido `blocked`, que debe presentarse como `inactive`.

**Step 2: Run the test to verify it fails**

Run: `npm test -- lib/utils/studentOperationalStatus.test.ts`

Expected: FAIL porque `getStudentOperationalStatus` todavía no existe.

**Step 3: Implement the shared pure function**

Definir:

```ts
export type StudentOperationalStatus = 'active' | 'expiring' | 'expired' | 'paused' | 'inactive'

export type StudentStatusFacts = {
  membershipStatus: string | null
  classesRemaining: number
  membershipEnd: string | null
  membershipExpiredAt: string | null
  effectiveStatus: string | null
  hasMembership: boolean
}

export function getStudentOperationalStatus(
  facts: StudentStatusFacts,
  now = new Date(),
): StudentOperationalStatus
```

Mover a esta función las reglas ya aprobadas. Hacer que `getAdminStudentStatus` solo adapte `StudentListRow` a `StudentStatusFacts`. En el perfil, sustituir `getOperationalStatus` por la utilidad compartida y seleccionar `expired_at` para la membresía.

**Step 4: Run focused tests**

Run: `npm test -- lib/utils/studentOperationalStatus.test.ts lib/utils/adminStudentList.test.ts`

Expected: ambos archivos PASS.

**Step 5: Commit**

```powershell
git add lib/utils/studentOperationalStatus.ts lib/utils/studentOperationalStatus.test.ts lib/utils/adminStudentList.ts app/admin/alumnos/[id]/page.tsx
git commit -m "refactor(admin): share student status lifecycle"
```

### Task 2: Persistir la mano dominante

**Files:**
- Create: `supabase/migrations/20260715_230000_add_student_dominant_hand.sql`
- Modify: `app/api/admin/create-student/route.ts`
- Modify: `app/api/admin/create-student/route.test.ts`
- Modify: `app/admin/alumnos/editar/[id]/page.tsx`
- Modify: `lib/hooks/useStudentDetail.ts`

**Step 1: Write failing API tests**

Agregar pruebas que envíen `dominant_hand: 'right'`, comprueben que se persiste y rechacen un valor fuera de `right`, `left` y `ambidextrous`:

```ts
expect(studentsUpdate).toHaveBeenCalledWith(expect.objectContaining({
  dominant_hand: 'right',
}))
```

**Step 2: Run the test to verify it fails**

Run: `npm test -- app/api/admin/create-student/route.test.ts`

Expected: FAIL porque el contrato no acepta ni persiste `dominant_hand`.

**Step 3: Add the additive migration**

```sql
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS dominant_hand text;

ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_dominant_hand_check;

ALTER TABLE public.students
  ADD CONSTRAINT students_dominant_hand_check
  CHECK (dominant_hand IS NULL OR dominant_hand IN ('right', 'left', 'ambidextrous'));
```

La migración no debe modificar ni rellenar otros campos.

**Step 4: Extend create/update and detail contracts**

- Añadir `dominant_hand?: string | null` al cuerpo administrativo.
- Normalizar vacío a `null` y validar el conjunto permitido.
- Persistirlo tanto al crear como al actualizar.
- Seleccionarlo y mapearlo como `dominant_hand: string | null` en `useStudentDetail`.
- Añadir un selector “Derecha / Izquierda / Ambidiestro” al bloque deportivo del editor.

**Step 5: Run focused tests**

Run: `npm test -- app/api/admin/create-student/route.test.ts`

Expected: PASS.

**Step 6: Commit**

```powershell
git add supabase/migrations/20260715_230000_add_student_dominant_hand.sql app/api/admin/create-student/route.ts app/api/admin/create-student/route.test.ts app/admin/alumnos/editar/[id]/page.tsx lib/hooks/useStudentDetail.ts
git commit -m "feat(students): store dominant hand"
```

### Task 3: Crear selectores puros para las pestañas operativas

**Files:**
- Create: `lib/utils/adminStudentProfile.ts`
- Create: `lib/utils/adminStudentProfile.test.ts`

**Step 1: Write failing selector tests**

Cubrir:

- resumen de `attended`, `no_show` y `cancelled`;
- filtro de asistencias por estado y rango de fechas inclusivo;
- reservas visibles únicamente cuando `status === 'reserved'`;
- documentos de pago derivados uno a uno de pagos existentes, con identificador visual estable y sin número fiscal inventado;
- orden descendente por fecha.

Ejemplo:

```ts
expect(selectPendingBookings(bookings).map((row) => row.id)).toEqual(['reserved-1'])
expect(summarizeAttendance(bookings)).toEqual({ attended: 1, noShow: 1, cancelled: 1 })
```

**Step 2: Run the test to verify it fails**

Run: `npm test -- lib/utils/adminStudentProfile.test.ts`

Expected: FAIL porque las funciones aún no existen.

**Step 3: Implement minimal selectors**

Exportar:

```ts
export type AttendanceFilter = 'all' | 'attended' | 'no_show' | 'cancelled'
export function summarizeAttendance(bookings: StudentBookingSummary[]): AttendanceSummary
export function filterAttendance(bookings: StudentBookingSummary[], filter: AttendanceFilter, from?: string, to?: string): StudentBookingSummary[]
export function selectPendingBookings(bookings: StudentBookingSummary[]): StudentBookingSummary[]
export function buildPaymentDocumentRows(payments: StudentPaymentSummary[]): PaymentDocumentRow[]
```

`buildPaymentDocumentRows` debe usar una etiqueta neutral como `Registro de pago` y el ID corto solo como referencia interna; no debe presentarlo como factura o comprobante fiscal.

**Step 4: Run tests**

Run: `npm test -- lib/utils/adminStudentProfile.test.ts`

Expected: PASS.

**Step 5: Commit**

```powershell
git add lib/utils/adminStudentProfile.ts lib/utils/adminStudentProfile.test.ts
git commit -m "feat(admin): add student profile selectors"
```

### Task 4: Ampliar la consulta de detalle sin truncar historiales

**Files:**
- Modify: `lib/hooks/useStudentDetail.ts`
- Modify: `lib/hooks/useStudentDetail.test.ts` (create if absent)

**Step 1: Write the failing mapping test**

Simular la respuesta de Supabase y comprobar que:

- `dominant_hand` y `expired_at` se conservan;
- cada pago incluye la membresía relacionada o su nombre disponible;
- las reservas no se limitan artificialmente a las últimas 12;
- los campos nulos se mapean de forma estable.

**Step 2: Run the test to verify it fails**

Run: `npm test -- lib/hooks/useStudentDetail.test.ts`

Expected: FAIL con campos ausentes o límite incorrecto.

**Step 3: Update types and query**

- Añadir `expired_at` a `StudentMembershipSummary`.
- Añadir `dominant_hand` a `StudentDetailData`.
- Seleccionar esos campos.
- Elevar los límites de pagos, movimientos y reservas a un máximo operativo explícito de 250 filas, evitando una consulta ilimitada.
- Conservar el orden descendente del servidor.

**Step 4: Run the test**

Run: `npm test -- lib/hooks/useStudentDetail.test.ts`

Expected: PASS.

**Step 5: Commit**

```powershell
git add lib/hooks/useStudentDetail.ts lib/hooks/useStudentDetail.test.ts
git commit -m "refactor(admin): load complete student profile history"
```

### Task 5: Construir el shell y la navegación accesible

**Files:**
- Create: `components/admin/student-profile/StudentProfileShell.tsx`
- Create: `components/admin/student-profile/StudentProfileTabs.tsx`
- Modify: `app/admin/alumnos/[id]/page.tsx`

**Step 1: Define the six-tab contract**

Usar exactamente:

```ts
export type StudentProfileTab =
  | 'profile'
  | 'sports'
  | 'attendance'
  | 'membership'
  | 'payments'
  | 'bookings'
```

La lista visual debe ser Perfil, Datos deportivos, Asistencias, Membresía, Pagos y Reservas.

**Step 2: Implement the accessible tabs**

- `role="tablist"` en el contenedor.
- `role="tab"`, `aria-selected` y `aria-controls` en cada botón.
- `role="tabpanel"` e ID asociado en el contenido.
- desplazamiento horizontal en móvil;
- foco visible y estado activo por texto, color y borde.

**Step 3: Implement the identity header**

Mostrar avatar, nombre, etiqueta de estado compartida, código oculto inicialmente, copiar código y enlace `Editar perfil`. Mantener el retorno a `/admin/alumnos`.

**Step 4: Reduce the route to orchestration**

La página debe conservar carga, error, refetch y mutaciones comunes, delegando presentación al shell y a las pestañas. Eliminar Resumen y Notas de la navegación solicitada; las notas clínicas o administrativas permanecen accesibles desde el editor existente.

**Step 5: Run static checks**

Run: `npx eslint "app/admin/alumnos/[id]/page.tsx" "components/admin/student-profile/*.tsx"`

Expected: exit 0.

**Step 6: Commit**

```powershell
git add app/admin/alumnos/[id]/page.tsx components/admin/student-profile/StudentProfileShell.tsx components/admin/student-profile/StudentProfileTabs.tsx
git commit -m "refactor(admin): add modular student profile shell"
```

### Task 6: Implementar Perfil y Datos deportivos

**Files:**
- Create: `components/admin/student-profile/ProfileTab.tsx`
- Create: `components/admin/student-profile/SportsTab.tsx`
- Modify: `app/admin/alumnos/[id]/page.tsx`

**Step 1: Build the Profile tab**

Crear una tarjeta de identidad y una cuadrícula de información general con nombre, género, correo, teléfono, DNI, nacimiento y edad calculada. Añadir un único CTA hacia `/admin/alumnos/editar/[id]`.

**Step 2: Build the Sports tab**

Presentar disciplina, categoría, nivel, mano dominante, distancia, tipo de arco y potencia. Traducir valores técnicos:

```ts
const dominantHandLabels = {
  right: 'Derecha',
  left: 'Izquierda',
  ambidextrous: 'Ambidiestro',
}
```

Resolver arco con prioridad: propio, asignado, academia. No mostrar simultáneamente tres respuestas contradictorias.

**Step 3: Add empty-state copy**

Usar “No definido” para campos individuales y un llamado a completar el perfil cuando falten todos los datos deportivos.

**Step 4: Run static checks**

Run: `npx eslint "components/admin/student-profile/ProfileTab.tsx" "components/admin/student-profile/SportsTab.tsx" "app/admin/alumnos/[id]/page.tsx"`

Expected: exit 0.

**Step 5: Commit**

```powershell
git add components/admin/student-profile/ProfileTab.tsx components/admin/student-profile/SportsTab.tsx app/admin/alumnos/[id]/page.tsx
git commit -m "feat(admin): redesign student profile information"
```

### Task 7: Implementar Asistencias y Reservas

**Files:**
- Create: `components/admin/student-profile/AttendanceTab.tsx`
- Create: `components/admin/student-profile/BookingsTab.tsx`
- Modify: `app/admin/alumnos/[id]/page.tsx`

**Step 1: Build attendance KPIs and filters**

Mostrar tres contadores y controles para estado, fecha inicial y fecha final. Calcular los resultados mediante `summarizeAttendance` y `filterAttendance`, no dentro del JSX.

**Step 2: Build the attendance table**

Columnas: fecha, horario, distancia, resultado y nota. Agrupar visualmente por mes con encabezados discretos. Mostrar estado vacío específico cuando un filtro no tenga resultados.

**Step 3: Build the pending bookings table**

Consumir `selectPendingBookings(data.bookings)` y mostrar fecha, horario, distancia, arco y estado. No incluir `attended`, `cancelled` ni `no_show`.

**Step 4: Run focused and static checks**

Run: `npm test -- lib/utils/adminStudentProfile.test.ts`

Run: `npx eslint "components/admin/student-profile/AttendanceTab.tsx" "components/admin/student-profile/BookingsTab.tsx"`

Expected: ambos comandos exit 0.

**Step 5: Commit**

```powershell
git add components/admin/student-profile/AttendanceTab.tsx components/admin/student-profile/BookingsTab.tsx app/admin/alumnos/[id]/page.tsx
git commit -m "feat(admin): organize attendance and pending bookings"
```

### Task 8: Reorganizar Membresía conservando las mutaciones reales

**Files:**
- Create: `components/admin/student-profile/MembershipTab.tsx`
- Create: `components/admin/student-profile/MembershipActionsMenu.tsx`
- Modify: `app/admin/alumnos/[id]/page.tsx`

**Step 1: Move the existing editor without changing RPC semantics**

Extraer el estado y formulario de edición actuales. Conservar `admin_update_student_membership`, la invalidación de `studentKeys.detail(id)` y la protección de eliminación vigente.

**Step 2: Build the compact membership table**

Columnas: Membresía, Inicio, Finalización, Estado, Importe, Tipo de pago y Acciones. El tipo de pago se obtiene del pago más reciente relacionado; si no existe, mostrar “Sin registro”.

**Step 3: Limit the action menu to supported operations**

Mostrar:

- Ver información / editar;
- cambiar fechas mediante el editor existente;
- cambiar estado mediante el editor existente;
- ajustar clases, importe, moneda y notas;
- eliminar únicamente si `canDeleteExpiredMembership` lo permite.

No renderizar cambio formal de plan, descuento, facturación ni congelamiento.

**Step 4: Run focused checks**

Run: `npm test -- lib/utils/adminMembershipDeletion.test.ts`

Run: `npx eslint "components/admin/student-profile/MembershipTab.tsx" "components/admin/student-profile/MembershipActionsMenu.tsx" "app/admin/alumnos/[id]/page.tsx"`

Expected: exit 0.

**Step 5: Commit**

```powershell
git add components/admin/student-profile/MembershipTab.tsx components/admin/student-profile/MembershipActionsMenu.tsx app/admin/alumnos/[id]/page.tsx
git commit -m "feat(admin): streamline student membership history"
```

### Task 9: Implementar Pagos sin simular documentos fiscales

**Files:**
- Create: `components/admin/student-profile/PaymentsTab.tsx`
- Modify: `app/admin/alumnos/[id]/page.tsx`

**Step 1: Build payment record section**

Usar `buildPaymentDocumentRows`. Columnas: referencia interna, fecha y estado. El título debe ser “Registros de pago”; añadir la nota “La numeración de documentos se incorporará en el módulo de comprobantes”.

**Step 2: Build transaction section**

Columnas: fecha, cantidad, método de pago, acción/estado y membresía. Formatear moneda con `Intl.NumberFormat('es-PE')` y mostrar etiquetas legibles para estados.

**Step 3: Verify empty and mixed states**

Las dos secciones deben poder mostrar estados vacíos de forma independiente.

**Step 4: Run checks**

Run: `npm test -- lib/utils/adminStudentProfile.test.ts`

Run: `npx eslint "components/admin/student-profile/PaymentsTab.tsx" "app/admin/alumnos/[id]/page.tsx"`

Expected: exit 0.

**Step 5: Commit**

```powershell
git add components/admin/student-profile/PaymentsTab.tsx app/admin/alumnos/[id]/page.tsx
git commit -m "feat(admin): separate student payment records and transactions"
```

### Task 10: Integrar, verificar visualmente y dejar el servidor activo

**Files:**
- Modify as needed: `app/admin/alumnos/[id]/page.tsx`
- Modify as needed: `components/admin/student-profile/*.tsx`
- Modify as needed: `lib/hooks/useStudentDetail.ts`
- Modify as needed: `lib/utils/*.test.ts`

**Step 1: Run the complete test suite**

Run: `npm test`

Expected: todos los archivos y pruebas PASS.

**Step 2: Run lint**

Run: `npm run lint`

Expected: exit 0 sin errores.

**Step 3: Build production**

Run: `npm run build`

Expected: compilación exitosa y ruta `/admin/alumnos/[id]` incluida.

**Step 4: Restart the production server in background**

Detener únicamente el proceso que ocupa el puerto 3000 y pertenece a este proyecto. Iniciar:

```powershell
$process = Start-Process -FilePath npm.cmd -ArgumentList 'run','start','--','-p','3000' -WorkingDirectory (Get-Location) -WindowStyle Hidden -RedirectStandardOutput '.next/start-3000.out.log' -RedirectStandardError '.next/start-3000.err.log' -PassThru
$process.Id
```

Expected: PID nuevo y proceso escuchando en `localhost:3000`.

**Step 5: Verify runtime and visuals**

- Abrir `http://localhost:3000/admin/alumnos/<id-real>` con la sesión administrativa disponible.
- Confirmar las seis pestañas, navegación por teclado y comportamiento móvil/escritorio.
- Confirmar que Perfil y Datos deportivos muestran datos reales.
- Aplicar filtros de Asistencias.
- Abrir/cerrar una acción de Membresía sin modificar datos de prueba.
- Confirmar las dos secciones de Pagos.
- Confirmar que Reservas solo muestra `reserved`.
- Revisar consola del navegador y logs del servidor.

**Step 6: Run final repository checks**

Run: `git diff --check`

Run: `git status --short`

Expected: sin errores de whitespace; solo cambios intencionales antes del commit final.

**Step 7: Commit final polish if needed**

```powershell
git add app/admin/alumnos/[id]/page.tsx app/admin/alumnos/editar/[id]/page.tsx components/admin/student-profile lib/hooks/useStudentDetail.ts lib/utils supabase/migrations
git commit -m "feat(admin): complete student profile workspace"
```

**Step 8: Report runtime evidence**

Entregar URL, PID, resultados de pruebas/lint/build, archivos de log y cualquier limitación que dependa de aplicar la migración local o remota.
