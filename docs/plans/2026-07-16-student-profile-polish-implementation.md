# Student Profile Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Convertir Perfil y Datos deportivos en formularios editables, corregir el modelo visual de arcos y rehacer la gestión de membresías dentro de la ficha del alumno.

**Architecture:** Mantener `useStudentDetail` como fuente de lectura, extraer transformaciones puras a utilidades probadas y reutilizar los RPC V2 para escrituras. Ampliar `student_memberships` de forma aditiva y encapsular en la página del alumno el panel lateral de asignación y los menús de acciones.

**Tech Stack:** Next.js 14 App Router, React, TypeScript, Tailwind CSS, TanStack Query, Supabase/Postgres, Vitest.

---

### Task 1: Normalización de textos y tipo de arco

**Files:**
- Modify: `lib/utils/adminStudentProfile.ts`
- Modify: `lib/utils/adminStudentProfile.test.ts`
- Modify: `app/admin/alumnos/[id]/page.tsx`

**Steps:**
1. Escribir pruebas fallidas para la selección exclusiva `own`, `assigned` y `academy`, incluyendo el caso sin indicadores y con libraje.
2. Ejecutar `npm test -- lib/utils/adminStudentProfile.test.ts` y confirmar el fallo esperado.
3. Implementar las transformaciones puras y corregir todos los textos visibles con acentos y caracteres UTF-8 válidos.
4. Ejecutar nuevamente la prueba y confirmar que pasa.

### Task 2: Formularios editables de perfil y datos deportivos

**Files:**
- Modify: `app/admin/alumnos/[id]/page.tsx`
- Modify: `app/api/admin/create-student/route.ts`
- Modify: `tests/app/adminStudentProfileOperationalRedesign.test.ts`

**Steps:**
1. Añadir pruebas estructurales fallidas para controles editables, campos permanentes del tutor y botón Guardar cambios.
2. Confirmar el fallo con `npm test -- tests/app/adminStudentProfileOperationalRedesign.test.ts`.
3. Implementar estados de formulario sincronizados, validación y guardado mediante el endpoint administrativo existente.
4. Diseñar Perfil y Datos deportivos como tarjetas de formulario con agrupación semántica y estados de guardado/error.
5. Ejecutar las pruebas específicas hasta obtener verde.

### Task 3: Modelo ampliado de membresías

**Files:**
- Create: `supabase/migrations/20260716_090000_extend_student_membership_operations.sql`
- Modify: `lib/hooks/useStudentDetail.ts`
- Modify: `lib/utils/adminStudentProfile.ts`
- Modify: `lib/utils/adminStudentProfile.test.ts`

**Steps:**
1. Añadir pruebas fallidas para documento, tipo de pago, facturación, descuento y congelamiento con compatibilidad histórica.
2. Confirmar el fallo de las pruebas específicas.
3. Crear una migración idempotente con columnas aditivas y RPC administrativos para asignar/actualizar las nuevas propiedades.
4. Exponer los campos desde el hook y mapear valores históricos de forma segura.
5. Ejecutar nuevamente las pruebas específicas.

### Task 4: Tabla, panel lateral y acciones de membresía

**Files:**
- Modify: `app/admin/alumnos/[id]/page.tsx`
- Modify: `tests/app/adminStudentProfileOperationalRedesign.test.ts`

**Steps:**
1. Añadir pruebas estructurales fallidas para las siete columnas, el botón Asignar membresía, el panel lateral y ambos menús de acciones.
2. Confirmar el fallo esperado.
3. Implementar el panel lateral de asignación con plan, fechas, tipo de pago, pago recibido, descuento y resumen.
4. Implementar el menú de tres puntos y los diálogos funcionales de información, cancelación, edición, facturación, descuento y congelamiento.
5. Implementar el menú general Acciones en la cabecera.
6. Ejecutar las pruebas específicas hasta obtener verde.

### Task 5: Migración y verificación integral

**Files:**
- Verify: `supabase/migrations/20260716_090000_extend_student_membership_operations.sql`
- Verify: all modified files

**Steps:**
1. Revisar el diff y ejecutar la migración aditiva contra el proyecto vinculado sin usar `db push` sobre el historial divergente.
2. Verificar las columnas y funciones creadas mediante una consulta de solo lectura.
3. Ejecutar `npm test`.
4. Ejecutar ESLint completo con la configuración local del worktree.
5. Detener el servidor sólo durante `npm run build`, cargar el entorno local sin copiar secretos y generar el build de producción.
6. Iniciar `npm run start -- -p 3000` oculto, comprobar HTTP 200 y realizar una revisión visual cuando la sesión lo permita.
7. Ejecutar `git diff --check`, revisar alcance, confirmar los cambios y dejar la rama y el servidor disponibles.
