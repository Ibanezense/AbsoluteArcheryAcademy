# Reactivate Account on Membership Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reactivar atómicamente la cuenta individual de un alumno cuando administración le asigna una membresía utilizable, sin levantar estados protegidos.

**Architecture:** Una función de trigger PostgreSQL observará nuevas membresías activas con saldo. Desprotegerá únicamente `inactive`, sincronizará el estado académico y habilitará solo `students.self_profile_id`; los estados de seguridad o baja se excluyen explícitamente.

**Tech Stack:** PostgreSQL/Supabase migrations, PL/pgSQL, Vitest, Next.js 14.

---

### Task 1: Contrato de reactivación

**Files:**
- Create: `tests/supabase/reactivateAccountOnMembership.test.ts`
- Create: `supabase/migrations/<timestamp>_reactivate_account_on_membership.sql`

**Step 1: Write the failing test**

Comprobar que la migración crea una función y trigger para inserciones en `student_memberships`, filtra membresías activas con saldo, habilita únicamente `self_profile_id`, retira `inactive`, sincroniza el alumno y excluye `retired`, `withdrawn`, `blocked` y `suspended`.

**Step 2: Run test to verify it fails**

Run: `npx vitest run tests/supabase/reactivateAccountOnMembership.test.ts`

Expected: FAIL porque la migración todavía no existe.

**Step 3: Create the migration**

Run: `npx supabase migration new reactivate_account_on_membership`

Implementar `public.reactivate_student_account_after_membership_insert()` con `SECURITY DEFINER`, `SET search_path = public`, revocación de `PUBLIC`/`anon`/`authenticated` y un trigger `AFTER INSERT`.

**Step 4: Run the focused test**

Run: `npx vitest run tests/supabase/reactivateAccountOnMembership.test.ts tests/supabase/adminManualStudentInactive.test.ts tests/supabase/multipleActiveMemberships.test.ts`

Expected: PASS.

**Step 5: Commit**

Run: `git add tests/supabase/reactivateAccountOnMembership.test.ts supabase/migrations/*_reactivate_account_on_membership.sql && git commit -m "fix(memberships): reactivate student account on assignment"`

### Task 2: Verificación y reparación en Supabase

**Files:**
- Temporary: `supabase/.temp/verify_reactivate_account_on_membership.sql`

**Step 1: Apply only the new migration**

Run: `npx supabase db query --linked --file supabase/migrations/<timestamp>_reactivate_account_on_membership.sql`

Expected: exit 0.

**Step 2: Verify transactionally**

Ejecutar pruebas dentro de `BEGIN ... ROLLBACK` para un alumno normal con cuenta inactiva y para cada estado protegido. Confirmar acceso habilitado solo en el caso normal y estado académico sincronizado.

**Step 3: Repair the confirmed production row**

Actualizar únicamente `profiles.is_active` mediante una consulta con precondiciones sobre la membresía vigente, el alumno activo y la ausencia de estados protegidos. Verificar después que el perfil, alumno y membresía sean coherentes.

### Task 3: Gate de entrega

**Files:**
- Verify all changed files.

**Step 1: Run verification**

Run: `npm test -- --run`

Run: `npm run lint`

Run: `npx tsc --noEmit --incremental false`

Run: `npm run build`

Expected: todos con exit 0.

**Step 2: Review**

Solicitar revisión independiente del diff y corregir cualquier hallazgo crítico o importante.

**Step 3: Merge and deploy**

Integrar por fast-forward en `main`, repetir el gate, hacer push, esperar el despliegue Git de Vercel y verificar `READY`, SHA exacto, HTTP 200 y logs sin errores.
