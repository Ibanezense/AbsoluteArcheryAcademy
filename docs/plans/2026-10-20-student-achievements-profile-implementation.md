# Mi perfil y logros deportivos — Implementation Plan

> **For Codex:** Use executing-plans and subagent-driven-development for the approved independent tasks and review checkpoints.

**Goal:** dar protagonismo a récords y podios e incorporar Mi perfil como quinto destino del alumno.

**Architecture:** conservar cálculo y fuentes de progreso; mejorar presentación con una regla de medalla estricta. Ficha de alumno en lectura con API privada, JWT y relación vigente, sin cambios de base. Reutilizar contexto y estilo existentes.

**Tech Stack:** Next.js, React, Tailwind, Lucide, React Query, Supabase y Vitest existentes.

## 1. Perfil, datos y navegación (subtarea independiente)

- Crear `lib/contracts/studentProfile.ts`, `app/api/student-profile/route.ts`, `lib/services/studentProfileService.ts`, `lib/hooks/useStudentProfile.ts`, `components/student/profile/StudentProfilePage.tsx` y pruebas junto a fuentes.
- Reemplazar redirección legacy de `app/perfil/page.tsx` por la nueva ficha de alumno; conservar tratamiento de admin/login sin usar campos legacy de membresía.
- Modificar `components/StudentBottomNav.tsx` y `lib/utils/studentNavigation.ts`: quinto destino Mi perfil; perfil/progreso activan ese destino. Verificar cinco etiquetas en 360 px.
- Antes del código, pruebas rojas de ruta propia/ajena/JWT y de navegación. Datos personales permitidos: nombre, avatar, nacimiento, email/teléfono; deportivos: división, género/categoría derivada existente, nivel, distancia, arco propio/potencia si disponibles. Sin códigos, DNI, datos de tutores, finanzas ni select(*).
- Autorizar con cliente del usuario y `get_my_children` antes/después de la consulta concreta en students, comprobar identidad de respuesta, sin cliente privilegiado. Caché por cuenta/alumno; desactivada hasta contexto y cuenta coherentes, ocultar datos cuando error/cambio de identidad.
- Vista con cabecera deportiva, tres accesos/secciones personales, deportivos y progreso. Enlaces de ayuda; datos en lectura, no prometer edición. Mantener navegación y guardas existentes.
- Sustituir test legacy por pruebas del contrato V2 real, mantener regresiones de rutas/reservas. No tocar progreso ni estilos globales.

## 2. Récords y podio (integrador)

- `ProgressSummary.tsx`: dos tarjetas de récord destacado con sello/medallón, grandes cifras y máximo secundario, distancia/formato/fecha explícitos; último control claro y compacto; vacíos sin celebración.
- Crear helper de logro y tests semánticos: oficial 1/2/3, provisional, conflicto, clasificación sola, DNS/DNF/descalificación y vacío. Ejecutar rojo antes de implementar.
- `CompetitionHistory.tsx`: resultado final antes de clasificación, medallón oro/plata/bronce y puesto en gran formato; oficial/provisional explícitos. Mantener clasificación aparte y tratamiento de datos ausentes.
- No cambiar cálculos/filtros/orden deportivo ni llamadas de identidad.

## 3. Integración y revisión

- Revisiones independientes de requisitos, privacidad y calidad; corregir hallazgos antes de cerrar.
- Pruebas de ambas subtareas, suite apropiada completa, lint y tipos; compilar al cerrar integración sin servidores dev concurrentes.
- Navegador real piloto: Inicio → Mi perfil → Mi progreso → Controles/Competencias; móvil 390/360 px y escritorio, teclado y contraste. Capturas privadas con datos reales, nunca versionadas.
- Probar cuentas/selección/caché por tests y consultas en lectura; no crear datos ficticios en base real. Sin migraciones ni publicación en esta entrega.
