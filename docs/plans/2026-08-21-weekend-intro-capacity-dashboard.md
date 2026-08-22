# Weekend Intro Capacity Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mostrar en la parte superior del dashboard administrativo los cuatro turnos del sábado y los tres del domingo de la semana actual, con los cupos reales disponibles para clases de prueba usando únicamente seis arcos de academia de 20 lb y dos arcos exclusivos de 18 lb.

**Architecture:** Añadir un RPC administrativo de solo lectura que reutilice `get_session_equipment_availability` y devuelva todos los turnos del fin de semana, incluidos los llenos. Un servicio y hook React Query tipados normalizarán los datos; una utilidad pura compondrá siempre siete posiciones, y un componente compacto renderizará el bloque antes de `Hoy`. Las mutaciones que cambian la ocupación invalidarán una clave compartida para refrescar el bloque sin F5.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, TanStack React Query, Supabase/PostgreSQL, Tailwind CSS, Vitest.

---

### Task 1: RPC administrativo de disponibilidad del fin de semana

**Files:**
- Create: `tests/supabase/adminWeekendIntroCapacity.test.ts`
- Create: `supabase/migrations/20260821235500_admin_weekend_intro_capacity.sql`

**Step 1: Write the failing SQL contract test**

Crear una prueba que cargue la última migración y exija:

```ts
expect(sql).toContain('admin_get_weekend_intro_capacity')
expect(sql).toContain("AT TIME ZONE 'America/Lima'")
expect(sql).toContain("date_trunc('week'")
expect(sql).toContain("+ 5")
expect(sql).toContain('get_session_equipment_availability(s.id)')
expect(sql).toContain("s.status = 'scheduled'")
expect(sql).not.toContain("intro_spots_remaining')::integer > 0")
expect(sql).toContain('is_admin_user()')
expect(sql).toContain('SECURITY DEFINER')
expect(sql).toContain('SET search_path = public')
expect(sql).toContain('REVOKE ALL ON FUNCTION')
expect(sql).toContain('TO authenticated, service_role')
```

También comprobar que la firma devuelve `equipment_capacity`, `equipment_reserved` y `spots_remaining`.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/supabase/adminWeekendIntroCapacity.test.ts`

Expected: FAIL porque la migración y el RPC todavía no existen.

**Step 3: Implement the minimal migration**

Crear una función con esta forma:

```sql
CREATE OR REPLACE FUNCTION public.admin_get_weekend_intro_capacity(
  p_reference_date date DEFAULT NULL
)
RETURNS TABLE (
  session_id uuid,
  start_at timestamptz,
  end_at timestamptz,
  equipment_capacity integer,
  equipment_reserved integer,
  spots_remaining integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reference_date date := COALESCE(
    p_reference_date,
    (now() AT TIME ZONE 'America/Lima')::date
  );
  v_saturday date;
  v_sunday date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;
  IF NOT public.is_admin_user() THEN RAISE EXCEPTION 'No autorizado'; END IF;

  v_saturday := date_trunc('week', v_reference_date)::date + 5;
  v_sunday := v_saturday + 1;

  RETURN QUERY
  SELECT
    s.id,
    s.start_at,
    s.end_at,
    (2 + COALESCE((availability.data->>'academy_capacity')::integer, 0))::integer,
    (
      COALESCE((availability.data->>'intro_reserved')::integer, 0)
      + COALESCE((availability.data->>'academy_students_reserved')::integer, 0)
    )::integer,
    COALESCE((availability.data->>'intro_spots_remaining')::integer, 0)::integer
  FROM public.sessions s
  CROSS JOIN LATERAL (
    SELECT public.get_session_equipment_availability(s.id) AS data
  ) availability
  WHERE s.status = 'scheduled'
    AND (s.start_at AT TIME ZONE 'America/Lima')::date BETWEEN v_saturday AND v_sunday
  ORDER BY s.start_at;
END;
$$;
```

Revocar `PUBLIC` y `anon`; conceder solo a `authenticated` y `service_role`. Añadir comentarios que documenten que los dos arcos de 18 lb son adicionales al inventario activo de 20 lb y que no se filtran turnos llenos.

**Step 4: Run the focused tests**

Run: `npm test -- tests/supabase/adminWeekendIntroCapacity.test.ts tests/supabase/equipmentBasedCapacity.test.ts`

Expected: PASS, manteniendo intacta la regla canónica existente.

**Step 5: Commit**

```bash
git add tests/supabase/adminWeekendIntroCapacity.test.ts supabase/migrations/20260821235500_admin_weekend_intro_capacity.sql
git commit -m "feat(dashboard): add weekend intro capacity RPC"
```

### Task 2: Composición determinista de siete posiciones

**Files:**
- Create: `lib/utils/weekendIntroCapacity.test.ts`
- Create: `lib/utils/weekendIntroCapacity.ts`

**Step 1: Write failing utility tests**

Definir datos de entrada tipados y probar por separado:

```ts
expect(getLimaReferenceDate(new Date('2026-08-17T05:00:00Z'))).toBe('2026-08-17')

const slots = buildWeekendIntroSlots(rows, new Date('2026-08-20T15:00:00Z'))
expect(slots.filter((slot) => slot.day === 'saturday')).toHaveLength(4)
expect(slots.filter((slot) => slot.day === 'sunday')).toHaveLength(3)
expect(slots.map((slot) => slot.session?.sessionId ?? null)).toEqual([
  'sat-1', 'sat-2', 'sat-3', 'sat-4', 'sun-1', 'sun-2', 'sun-3',
])
```

Agregar casos para:

- posiciones faltantes con `session: null` y estado `not_scheduled`;
- `full` cuando `spotsRemaining === 0`;
- `last_spot` cuando queda uno;
- `available` cuando quedan dos o más;
- `finished` cuando `startAt <= now`;
- cambio de semana basado en lunes y zona `America/Lima`.

**Step 2: Run test to verify it fails**

Run: `npm test -- lib/utils/weekendIntroCapacity.test.ts`

Expected: FAIL por módulo inexistente.

**Step 3: Implement minimal pure helpers**

Crear:

```ts
export const WEEKEND_INTRO_CAPACITY_QUERY_KEY = ['admin-weekend-intro-capacity'] as const

export type WeekendIntroCapacityStatus =
  | 'available'
  | 'last_spot'
  | 'full'
  | 'finished'
  | 'not_scheduled'

export function getLimaReferenceDate(now: Date): string
export function buildWeekendIntroSlots(
  sessions: WeekendIntroCapacitySession[],
  now: Date,
): WeekendIntroCapacitySlot[]
```

Usar `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' })` para fecha y día. Ordenar por `startAt`, separar sábado/domingo y completar al final hasta 4/3. El estado `finished` tiene prioridad sobre disponibilidad para impedir que una tarjeta pasada aparente ser reservable.

**Step 4: Run test to verify it passes**

Run: `npm test -- lib/utils/weekendIntroCapacity.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add lib/utils/weekendIntroCapacity.ts lib/utils/weekendIntroCapacity.test.ts
git commit -m "feat(dashboard): compose weekend intro slots"
```

### Task 3: Servicio tipado y hook React Query

**Files:**
- Create: `lib/services/adminWeekendIntroCapacityService.test.ts`
- Create: `lib/services/adminWeekendIntroCapacityService.ts`
- Modify: `lib/hooks/useAdminDashboardData.ts`

**Step 1: Write the failing service test**

Con un cliente Supabase simulado, exigir la llamada y el mapeo exactos:

```ts
expect(rpc).toHaveBeenCalledWith('admin_get_weekend_intro_capacity', {
  p_reference_date: '2026-08-17',
})

expect(result).toEqual([{
  sessionId: 'session-1',
  startAt: '2026-08-22T14:00:00Z',
  endAt: '2026-08-22T15:30:00Z',
  equipmentCapacity: 8,
  equipmentReserved: 5,
  spotsRemaining: 3,
}])
```

Probar también error RPC y rechazo de valores numéricos negativos o inconsistentes (`spots_remaining > equipment_capacity`).

**Step 2: Run test to verify it fails**

Run: `npm test -- lib/services/adminWeekendIntroCapacityService.test.ts`

Expected: FAIL por servicio inexistente.

**Step 3: Implement the service**

Crear `fetchAdminWeekendIntroCapacity(client, referenceDate)` con tipos explícitos, validación de filas y errores en español. No consultar directamente `sessions` ni `bookings` desde el navegador.

**Step 4: Run the service test**

Run: `npm test -- lib/services/adminWeekendIntroCapacityService.test.ts`

Expected: PASS.

**Step 5: Add the hook**

En `useAdminDashboardData.ts` exportar:

```ts
export function useAdminWeekendIntroCapacity(now: Date = new Date()) {
  const referenceDate = getLimaReferenceDate(now)
  return useQuery({
    queryKey: [...WEEKEND_INTRO_CAPACITY_QUERY_KEY, referenceDate],
    queryFn: () => fetchAdminWeekendIntroCapacity(supabase, referenceDate),
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
  })
}
```

El hook debe exponer datos, carga, actualización, error y `refetch` sin mezclar el fallo con el RPC general del dashboard.

**Step 6: Run focused tests and typecheck**

Run: `npm test -- lib/services/adminWeekendIntroCapacityService.test.ts lib/hooks/useDashboardStats.test.ts`

Run: `npx tsc --noEmit --incremental false`

Expected: PASS.

**Step 7: Commit**

```bash
git add lib/services/adminWeekendIntroCapacityService.ts lib/services/adminWeekendIntroCapacityService.test.ts lib/hooks/useAdminDashboardData.ts
git commit -m "feat(dashboard): query weekend intro capacity"
```

### Task 4: Bloque visual en la parte superior del dashboard

**Files:**
- Create: `tests/app/adminWeekendIntroCapacityDashboard.test.ts`
- Create: `components/admin/WeekendIntroCapacity.tsx`
- Modify: `app/admin/page.tsx`

**Step 1: Write the failing dashboard contract test**

Comprobar que:

```ts
expect(page.indexOf('<WeekendIntroCapacity')).toBeLessThan(page.indexOf('title="Hoy"'))
expect(component).toContain('Disponibilidad para clases de prueba')
expect(component).toContain('Sábado')
expect(component).toContain('Domingo')
expect(component).toContain('Último cupo')
expect(component).toContain('Lleno')
expect(component).toContain('Finalizado')
expect(component).toContain('No programado')
expect(component).toContain('Reintentar')
expect(component).toContain('href="/admin/intro"')
```

Exigir además que el componente use `buildWeekendIntroSlots` y renderice siete tarjetas desde esa salida, no mediante números hardcodeados independientes.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/app/adminWeekendIntroCapacityDashboard.test.ts`

Expected: FAIL porque componente y montaje no existen.

**Step 3: Implement the component**

Crear un bloque con:

- encabezado `Disponibilidad para clases de prueba`;
- subtítulo con fechas del sábado y domingo;
- grilla responsive: una columna móvil, dos grupos en tablet, siete tarjetas compactas en escritorio cuando haya ancho;
- icono de arco/objetivo coherente con el dashboard;
- texto `N de {capacity} cupos libres`;
- verde para `available`, ámbar para `last_spot`, rojo y contorno reforzado para `full`, gris para `finished` y borde discontinuo para `not_scheduled`;
- `aria-label` descriptivo por turno;
- skeleton de siete posiciones durante carga;
- error aislado con botón `Reintentar`;
- enlace a `/admin/intro` solo para `available` y `last_spot`.

Mantener el sistema visual existente (`rounded-[1.4rem]`, bordes slate, fondo blanco, `font-heading`, acento naranja) y evitar introducir una estética ajena al admin.

**Step 4: Mount it before Today**

En `app/admin/page.tsx`, renderizar `<WeekendIntroCapacity />` después del encabezado/buscador y del error general, pero antes de la sección cuyo título es `Hoy`.

**Step 5: Run focused tests**

Run: `npm test -- tests/app/adminWeekendIntroCapacityDashboard.test.ts lib/utils/weekendIntroCapacity.test.ts`

Expected: PASS.

**Step 6: Commit**

```bash
git add tests/app/adminWeekendIntroCapacityDashboard.test.ts components/admin/WeekendIntroCapacity.tsx app/admin/page.tsx
git commit -m "feat(admin): show weekend intro availability"
```

### Task 5: Sincronización sin F5 después de cambios de reservas

**Files:**
- Create: `tests/app/adminWeekendIntroCapacityInvalidation.test.ts`
- Modify: `lib/adminBookingQueries.ts`
- Modify: `app/admin/intro/IntroClient.tsx`

**Step 1: Write the failing invalidation test**

Exigir que la clave compartida se invalide después de:

- reservar una clase regular desde `useAdminBookSession`;
- cancelar una reserva desde `useAdminCancelBooking`;
- crear una clase intro;
- editar o mover una clase intro.

La prueba debe buscar el uso de `WEEKEND_INTRO_CAPACITY_QUERY_KEY`, no un arreglo literal duplicado.

**Step 2: Run test to verify it fails**

Run: `npm test -- tests/app/adminWeekendIntroCapacityInvalidation.test.ts`

Expected: FAIL porque las mutaciones todavía no invalidan esa consulta.

**Step 3: Implement shared invalidation**

En `lib/adminBookingQueries.ts`, añadir en ambos `onSuccess`:

```ts
queryClient.invalidateQueries({ queryKey: WEEKEND_INTRO_CAPACITY_QUERY_KEY })
```

En `IntroClient.tsx`, usar `useQueryClient()` y llamar a la misma invalidación en `handleCreated` y `handleUpdated` antes de cerrar/recargar el listado local.

**Step 4: Run focused tests**

Run: `npm test -- tests/app/adminWeekendIntroCapacityInvalidation.test.ts tests/app/adminQuickBookingRedesign.test.ts lib/services/IntroClassesService.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/app/adminWeekendIntroCapacityInvalidation.test.ts lib/adminBookingQueries.ts app/admin/intro/IntroClient.tsx
git commit -m "fix(admin): refresh weekend capacity after bookings"
```

### Task 6: Revisión y verificación integral

**Files:**
- Modify only if review finds an in-scope issue.

**Step 1: Run database contract tests**

Run: `npm test -- tests/supabase/adminWeekendIntroCapacity.test.ts tests/supabase/equipmentBasedCapacity.test.ts tests/supabase/atomicIntroAndSessionRpcs.test.ts`

Expected: PASS.

**Step 2: Run all tests**

Run: `npm test -- --reporter=dot`

Expected: 89 archivos base más los nuevos; cero fallos.

**Step 3: Run static verification**

Run: `npm run lint`

Run: `npx tsc --noEmit --incremental false`

Expected: ambos comandos terminan con código 0.

**Step 4: Build production output**

Run: `npm run build`

Expected: build de Next.js exitoso y ruta `/admin` generada.

**Step 5: Visual verification**

Iniciar el servidor y comprobar `/admin` en escritorio y móvil con una sesión administrativa disponible. Verificar:

- bloque antes de `Hoy`;
- exactamente cuatro posiciones el sábado y tres el domingo;
- horarios ordenados;
- contraste de verde/ámbar/rojo/gris;
- tarjetas llenas y finalizadas no clicables;
- enlace disponible abre `/admin/intro`;
- error del bloque no rompe el dashboard.

Si no hay credenciales de navegador, documentar la limitación y respaldar el resultado con pruebas de componente, TypeScript y build.

**Step 6: Apply the migration safely**

Antes de aplicar, revisar `supabase migration list --linked`. Si existe drift histórico, no usar `migration repair` ni `--include-all`; aplicar únicamente el SQL nuevo de forma controlada y verificar en lectura que la función exista. No ejecutar mutaciones de reservas para probarla.

**Step 7: Request code review and fix findings**

Usar `@requesting-code-review` sobre el diff completo. Corregir observaciones Critical/Important mediante ciclos TDD y repetir la verificación afectada.

**Step 8: Final commit if review required fixes**

```bash
git add <only-in-scope-files>
git commit -m "fix(dashboard): address weekend capacity review"
```

**Step 9: Prepare branch completion**

Usar `@verification-before-completion` y `@finishing-a-development-branch`. No hacer merge, push ni deploy salvo autorización explícita del usuario para esta entrega.
