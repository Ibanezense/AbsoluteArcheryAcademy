# Membership Renewal Alerts Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Permitir el acceso normal con membresía vencida, avisar una vez al día cuando quede una clase o ninguna, y ofrecer al administrador mensajes de WhatsApp coherentes con el estado real de todas las membresías.

**Architecture:** Una RPC segura y por lote calculará `none`, `last_class` o `expired` a partir de los ciclos vigentes/programados y del saldo consumido por asistencia. Un hook compartido distribuirá ese estado a la app del alumno y al panel admin; utilidades puras controlarán la frecuencia diaria Lima y construirán los enlaces de WhatsApp, mientras límites de error locales impedirán que red o renovación derriben la app.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Supabase/Postgres, TanStack Query, Vitest, Tailwind CSS.

---

### Task 1: Definir el contrato puro del aviso con TDD

**Files:**
- Modify: `lib/utils/membershipRenewal.ts`
- Modify: `lib/utils/membershipRenewal.test.ts`

**Step 1: Escribir pruebas fallidas**

Agregar casos para:

```ts
expect(getRenewalPromptCopy('last_class')).toEqual({
  title: 'Te queda una sola clase',
  message: 'Te queda 1 clase disponible de tu membresía. Puedes renovarla ahora para continuar tus entrenamientos sin interrupciones.',
})

expect(getRenewalPromptCopy('expired').title).toBe('Renueva tu membresía')
expect(getLimaRenewalDismissalKey('student-1', 'last_class', 'cycle-a', now))
  .toContain('2026-08-20')
```

Cubrir que `none` no abre el popup, que la misma clave queda oculta durante el mismo día y que un nuevo día, estado o ciclo crea una clave diferente.

**Step 2: Verificar RED**

Run: `npm test -- lib/utils/membershipRenewal.test.ts`

Expected: FAIL porque los nuevos tipos y funciones no existen.

**Step 3: Implementar lo mínimo**

Exportar:

```ts
export type MembershipRenewalAlertState = 'none' | 'last_class' | 'expired'
export function getRenewalPromptCopy(state: Exclude<MembershipRenewalAlertState, 'none'>): { title: string; message: string }
export function getLimaRenewalDismissalKey(studentId: string, state: string, stateKey: string, now?: Date): string
```

Usar `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' })` para la fecha diaria. Retirar la inferencia local antigua basada solo en `membership_end` y `classes_remaining`; el popup dependerá del contrato canónico.

**Step 4: Verificar GREEN**

Run: `npm test -- lib/utils/membershipRenewal.test.ts`

Expected: PASS.

**Step 5: Commit**

```powershell
git add lib/utils/membershipRenewal.ts lib/utils/membershipRenewal.test.ts
git commit -m "test(memberships): define renewal alert states"
```

### Task 2: Crear el cálculo canónico en Supabase con TDD

**Files:**
- Create: `supabase/migrations/20260820110000_membership_renewal_alert_states.sql`
- Create: `tests/supabase/membershipRenewalAlertStates.test.ts`

**Step 1: Escribir la prueba estructural fallida**

La prueba debe exigir una RPC `get_membership_renewal_alert_states(uuid[])` y comprobar:

```ts
expect(sql).toContain("'last_class'")
expect(sql).toContain("'expired'")
expect(sql).toContain("AT TIME ZONE 'America/Lima'")
expect(sql).toContain('public.can_access_student')
expect(sql).toContain('SECURITY DEFINER')
expect(sql).toContain('SET search_path = public')
expect(sql).toContain('REVOKE ALL ON FUNCTION')
expect(sql).toContain('FROM anon')
```

También verificar que el SQL usa `student_memberships.classes_remaining`, filtra fechas vigentes/programadas, no descuenta reservas `reserved` y agrega todos los ciclos del alumno.

**Step 2: Verificar RED**

Run: `npm test -- tests/supabase/membershipRenewalAlertStates.test.ts`

Expected: FAIL porque la migración no existe.

**Step 3: Implementar la RPC**

Retornar por alumno:

```sql
student_id uuid,
alert_state text,
remaining_unconsumed_classes integer,
has_current_membership boolean,
has_scheduled_membership boolean,
state_key text
```

Reglas mínimas:

- sumar saldo de ciclos `active` no vencidos, incluyendo los programados;
- exigir un ciclo vigente hoy para `last_class`;
- devolver `last_class` cuando el total sea exactamente `1`;
- devolver `none` cuando el total sea mayor que `1` o exista saldo programado que evita renovación;
- devolver `expired` si el alumno tiene historial de membresía pero ningún ciclo vigente/programado con saldo;
- devolver `none` para un alumno que nunca tuvo membresía;
- mantener saldo de una clase aunque esté reservado, porque solo `attended`/`no_show` consumen;
- crear `state_key` determinista con estado e IDs/fechas relevantes.

Validar actor y cada alumno solicitado. Admin puede consultar el lote; student/guardian solo IDs permitidos. Revocar `PUBLIC`/`anon` y conceder únicamente `authenticated, service_role`.

**Step 4: Verificar GREEN**

Run: `npm test -- tests/supabase/membershipRenewalAlertStates.test.ts`

Expected: PASS.

**Step 5: Commit**

```powershell
git add supabase/migrations/20260820110000_membership_renewal_alert_states.sql tests/supabase/membershipRenewalAlertStates.test.ts
git commit -m "feat(memberships): add canonical renewal alert states"
```

### Task 3: Añadir servicio y hook por lote con TDD

**Files:**
- Create: `lib/services/membershipRenewalAlertService.ts`
- Create: `lib/services/membershipRenewalAlertService.test.ts`
- Create: `lib/hooks/useMembershipRenewalAlerts.ts`
- Modify: `lib/hooks/useMembershipRenewal.ts`

**Step 1: Escribir pruebas fallidas del servicio**

Comprobar:

```ts
await getMembershipRenewalAlerts(client, ['student-1', 'student-2'])
expect(client.rpc).toHaveBeenCalledWith('get_membership_renewal_alert_states', {
  p_student_ids: ['student-1', 'student-2'],
})
```

Cubrir respuesta vacía, error RPC y normalización de filas a un mapa por `student_id`.

**Step 2: Verificar RED**

Run: `npm test -- lib/services/membershipRenewalAlertService.test.ts`

Expected: FAIL por módulo inexistente.

**Step 3: Implementar servicio y hook**

Crear los tipos `MembershipRenewalAlert` y `MembershipRenewalAlertMap`. El hook usará la clave:

```ts
['membership-renewal-alerts', [...studentIds].sort()]
```

No ejecutará la RPC para una lista vacía. Exportar una función de invalidación o una clave base reutilizable y ampliar las mutaciones de renovación para invalidar `membership-renewal-alerts`, `studentKeys.all` y `student-dashboard`.

**Step 4: Verificar GREEN**

Run: `npm test -- lib/services/membershipRenewalAlertService.test.ts`

Expected: PASS.

**Step 5: Commit**

```powershell
git add lib/services/membershipRenewalAlertService.ts lib/services/membershipRenewalAlertService.test.ts lib/hooks/useMembershipRenewalAlerts.ts lib/hooks/useMembershipRenewal.ts
git commit -m "feat(memberships): load renewal alerts consistently"
```

### Task 4: Actualizar el popup del alumno sin bloquear la app

**Files:**
- Modify: `components/MembershipRenewalPrompt.tsx`
- Modify: `app/LayoutWrapper.tsx`
- Create: `tests/app/studentMembershipRenewalPrompt.test.ts`

**Step 1: Escribir prueba de superficie fallida**

Exigir que el componente:

- use `useMembershipRenewalAlerts([activeStudentId])`;
- renderice los dos títulos y mensajes aprobados;
- guarde `getLimaRenewalDismissalKey(...)` en `localStorage`;
- no use la clave antigua de `sessionStorage`;
- mantenga las consultas de planes dentro del modal;
- muestre error local de opciones y no lance excepciones.

**Step 2: Verificar RED**

Run: `npm test -- tests/app/studentMembershipRenewalPrompt.test.ts`

Expected: FAIL con la implementación antigua.

**Step 3: Implementar las variantes**

Obtener la alerta por alumno y abrir solo para `last_class`/`expired`. Calcular la clave diaria después de disponer del estado canónico. Cerrar el modal escribe esa clave; un cambio de día/estado/ciclo vuelve a abrirlo.

Normalizar defensivamente las opciones con `Array.isArray` antes de iterarlas. Los errores de opciones se renderizan dentro del modal. Mantener el flujo actual de solicitud de renovación para ambas variantes.

**Step 4: Verificar GREEN**

Run: `npm test -- tests/app/studentMembershipRenewalPrompt.test.ts lib/utils/membershipRenewal.test.ts`

Expected: PASS.

**Step 5: Commit**

```powershell
git add components/MembershipRenewalPrompt.tsx app/LayoutWrapper.tsx tests/app/studentMembershipRenewalPrompt.test.ts
git commit -m "feat(students): show daily membership renewal prompts"
```

### Task 5: Crear mensajes y enlaces de WhatsApp con TDD

**Files:**
- Create: `lib/utils/membershipRenewalWhatsApp.ts`
- Create: `lib/utils/membershipRenewalWhatsApp.test.ts`

**Step 1: Escribir pruebas fallidas**

Validar igualdad exacta de ambos mensajes, incluidos emojis, saltos de línea y `**`. Cubrir teléfonos `999 999 999`, `+51 999 999 999`, valores vacíos e inválidos.

```ts
expect(getMembershipRenewalWhatsAppMessage('last_class')).toBe(LAST_CLASS_MESSAGE)
expect(buildMembershipRenewalWhatsAppUrl('999999999', 'last_class'))
  .toBe(`https://wa.me/51999999999?text=${encodeURIComponent(LAST_CLASS_MESSAGE)}`)
```

**Step 2: Verificar RED**

Run: `npm test -- lib/utils/membershipRenewalWhatsApp.test.ts`

Expected: FAIL por módulo inexistente.

**Step 3: Implementar utilidades puras**

Exportar mensajes constantes, normalizador de teléfono y constructor de URL. Retornar `null` para estado `none` o teléfono inválido.

**Step 4: Verificar GREEN y commit**

```powershell
npm test -- lib/utils/membershipRenewalWhatsApp.test.ts
git add lib/utils/membershipRenewalWhatsApp.ts lib/utils/membershipRenewalWhatsApp.test.ts
git commit -m "feat(admin): add membership WhatsApp messages"
```

### Task 6: Integrar alertas y WhatsApp en lista y perfil admin

**Files:**
- Modify: `app/admin/alumnos/page.tsx`
- Modify: `app/admin/alumnos/[id]/page.tsx`
- Modify: `lib/queries/studentQueries.ts`
- Create: `components/admin/MembershipRenewalAlertAction.tsx`
- Create: `tests/app/adminMembershipRenewalWhatsApp.test.ts`

**Step 1: Escribir prueba de superficie fallida**

Exigir:

- carga por lote con todos los IDs visibles en la lista;
- señal visual `Última clase` y `Membresía vencida`;
- uso de `MembershipRenewalAlertAction` en tarjeta y detalle;
- enlace `target="_blank"` con `rel="noreferrer"`;
- estado informativo cuando falta teléfono;
- ninguna acción para `none`.

**Step 2: Verificar RED**

Run: `npm test -- tests/app/adminMembershipRenewalWhatsApp.test.ts`

Expected: FAIL porque el componente no existe.

**Step 3: Implementar el componente compartido**

Recibir `studentName`, `phone` y `alert`. Mostrar borde/etiqueta ámbar para `last_class`, rojo para `expired` y botón `Enviar WhatsApp`. Si la URL es `null`, mostrar `Registra un teléfono para enviar el aviso`.

**Step 4: Integrar lista y detalle**

Solicitar las alertas en un solo lote para la lista y un ID para el detalle. Preservar filtros y paginación existentes. No reemplazar el estado operativo del alumno; la alerta de renovación es complementaria.

**Step 5: Verificar GREEN**

Run: `npm test -- tests/app/adminMembershipRenewalWhatsApp.test.ts lib/utils/membershipRenewalWhatsApp.test.ts`

Expected: PASS.

**Step 6: Commit**

```powershell
git add app/admin/alumnos/page.tsx app/admin/alumnos/[id]/page.tsx lib/queries/studentQueries.ts components/admin/MembershipRenewalAlertAction.tsx tests/app/adminMembershipRenewalWhatsApp.test.ts
git commit -m "feat(admin): add membership renewal WhatsApp actions"
```

### Task 7: Separar falta de conexión de membresía vencida

**Files:**
- Modify: `components/AuthGuard.tsx`
- Modify: `app/error.tsx`
- Create: `lib/utils/networkError.ts`
- Create: `lib/utils/networkError.test.ts`
- Create: `tests/app/studentOfflineErrorState.test.ts`

**Step 1: Escribir pruebas fallidas**

Cubrir la clasificación de errores de red y exigir que:

- `app/error.tsx` use el estado `navigator.onLine`/eventos `online` y `offline`;
- el texto sin conexión indique recuperar Internet y reintentar;
- desaparezca `revisa el log del servidor` de la interfaz del alumno;
- `AuthGuard` consulte primero la sesión local con `getSession()` y no convierta un error transitorio de `getUser()` en una falsa ausencia de membresía.

**Step 2: Verificar RED**

Run: `npm test -- lib/utils/networkError.test.ts tests/app/studentOfflineErrorState.test.ts`

Expected: FAIL con la pantalla genérica actual.

**Step 3: Implementar tolerancia de red**

Crear `isLikelyNetworkError`. En `AuthGuard`, permitir continuar con una sesión local válida mientras se valida remotamente; si no hay sesión, ir a login. Un fallo remoto con sesión existente mostrará contenido y dejará que las consultas presenten sus errores locales.

En `app/error.tsx`, mostrar `Sin conexión a Internet` cuando corresponda y `No pudimos cargar esta sección` para otros errores. Mantener `reset()` como reintento y escuchar el retorno de conexión.

**Step 4: Verificar GREEN y commit**

```powershell
npm test -- lib/utils/networkError.test.ts tests/app/studentOfflineErrorState.test.ts
git add components/AuthGuard.tsx app/error.tsx lib/utils/networkError.ts lib/utils/networkError.test.ts tests/app/studentOfflineErrorState.test.ts
git commit -m "fix(students): keep expired and offline access recoverable"
```

### Task 8: Aplicar y validar la migración real

**Files:**
- Verify: `supabase/migrations/20260820110000_membership_renewal_alert_states.sql`

**Step 1: Confirmar proyecto y diff**

Verificar que `.env.local`/enlace corresponden a `xgjmgsuggybvsxosgfqi` sin imprimir secretos. Comparar migraciones locales/remotas y revisar el SQL completo.

**Step 2: Ejecutar prueba transaccional reversible**

En una transacción de prueba crear o seleccionar casos controlados y validar:

- 2+ clases -> `none`;
- exactamente 1 sin consumir -> `last_class` aunque esté reservada;
- 0 -> `expired`;
- fecha vencida con saldo -> `expired`;
- ciclo futuro con saldo -> no pedir renovación;
- ciclo antiguo con 1 y siguiente con saldo -> `none`;
- alumno sin historial -> `none`;
- guardian/student no acceden a alumnos ajenos.

Finalizar con `ROLLBACK`.

**Step 3: Aplicar la migración**

Usar el mecanismo Supabase configurado para el repositorio y aplicar solo este archivo. No usar reparaciones de historial.

**Step 4: Ejecutar advisors**

Comprobar seguridad y rendimiento; corregir cualquier hallazgo nuevo atribuible a la función antes de continuar.

### Task 9: Verificación integral y entrega

**Files:**
- Verify all modified files

**Step 1: Ejecutar pruebas específicas**

```powershell
npm test -- lib/utils/membershipRenewal.test.ts tests/supabase/membershipRenewalAlertStates.test.ts lib/services/membershipRenewalAlertService.test.ts tests/app/studentMembershipRenewalPrompt.test.ts lib/utils/membershipRenewalWhatsApp.test.ts tests/app/adminMembershipRenewalWhatsApp.test.ts lib/utils/networkError.test.ts tests/app/studentOfflineErrorState.test.ts
```

Expected: todas PASS.

**Step 2: Ejecutar gate completo**

```powershell
npm test
npm run lint
npm run build
git diff --check
```

Expected: 0 fallos, lint sin errores, build exitoso y diff limpio.

**Step 3: Verificación visual autenticada**

Comprobar en móvil/alumno:

- navegación normal con membresía vencida;
- popup `last_class` y `expired`;
- cierre y reapertura el mismo día no repite;
- cambio de estado sí abre el nuevo aviso;
- sin conexión muestra un error recuperable.

Comprobar en admin:

- indicadores correctos en lista y detalle;
- ambos botones abren WhatsApp con texto exacto;
- teléfono faltante no genera enlace;
- asignar una nueva membresía elimina el aviso sin F5.

**Step 4: Validar producción y Camila**

Confirmar que Camila conserva acceso mediante su tutor, que su membresía nueva produce `none` y que ninguna prueba descuenta clases ni modifica su historial.

**Step 5: Auditoría requisito por requisito**

Relacionar cada requisito con prueba, consulta real o verificación visual. No declarar listo si falta el caso de múltiples membresías, la frecuencia diaria Lima o el texto exacto de WhatsApp.

**Step 6: Commit final y entrega autorizada**

```powershell
git status --short
git add <solo archivos del alcance>
git commit -m "test(memberships): verify renewal alert workflow"
```

Si el usuario solicita commit, push y despliegue, ejecutar el flujo de finalización de rama, integrar en `main`, empujar, desplegar y verificar HTTP/flujo de producción.
