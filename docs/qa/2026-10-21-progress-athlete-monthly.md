# Récords previos, identidad por arquero y vigencia mensual

## Decisiones verificadas

El ejemplo final del usuario define vigencia mensual: **20/10 → 20/11**, con último día disponible en meses cortos. Se distingue de la fórmula anterior de 30 días inclusivos, que producía 18/11. Los planes de duración nominal 30 se muestran ahora como un mes calendario. Planes especiales y obsequios conservan su tratamiento.

El SQL preparado actualiza solo las fórmulas de `admin_assign_membership_plan`, `admin_create_student_membership_cycles` y `admin_approve_membership_renewal_request`. Conserva las funciones desplegadas y sus permisos, validaciones, pagos e idempotencia. No edita membresías existentes ni recorta prórrogas. En lotes, los fines se anclan al inicio original y cada ciclo posterior empieza tras el fin anterior, sin solaparse.

Joyse tiene 50 m asignados. El resumen usa la última distancia válida no ambigua si todavía no hay puntajes válidos a la asignada. Indica «Distancia anterior», excluye anulados y separa 36/72 flechas. No se cambia su asignación deportiva. El primer control válido a 50 m sustituye esa referencia.

Tournament Engine conserva un nombre completo aprobado y los identificadores conocidos. El grupo acepta variantes de tildes, mayúsculas, espacios y orden, conservando tokens repetidos; no acepta nombres parciales. Contradicciones de nacimiento/licencia/WA ID, identidades ambiguas y pertenencia a otro alumno bloquean la agrupación. Los nuevos torneos con el mismo nombre se incorporan mediante una lista autorizada del origen. La búsqueda prefiere el vínculo ya confirmado del alumno para evitar repetir la confirmación.

## Validación

- **1022 pruebas PWA**, cero fallos: `output/progress-monthly-all-tests-final.json`.
- **59 pruebas TE**, cero fallos: release aislado `C:/Users/OMEN/.codex/release-artifacts/academy-2026-10-21/te/athlete-group-all-tests-final.log`.
- **11 comprobaciones PostgreSQL desechable**: paridad con meses cortos/bisiestos, tres caminos de asignación, permisos del helper y repetibilidad de la migración.
- TypeScript y ESLint PWA correctos; compilación de producción correcta. ESLint de los archivos TE modificados correcto.
- El chequeo global de tipos TE tiene errores preexistentes en scripts remotos, el adaptador de base y una prueba; se reprodujeron también en el release previo sin estos cambios. No se atribuye una validación global de tipos correcta a TE.
- Revisión independiente de controles/mensualidad aprobada (33 pruebas focalizadas); revisión de identidad/privacidad aprobada (8 pruebas reejecutadas).
- Navegador real local con sesión administrativa: Joyse conserva 290/360 y 504/720 a 40 m, claramente etiquetados como distancia anterior, manteniendo 50 m asignados. Captura privada `output/joyse-progress-previous-distance.png`.
- Formulario real de asignación: inicio 20/10/2026 y plan regular producen «Finalización estimada: 20 nov 2026». Solo se previsualizó y se pulsó Cancelar; no se creó una venta, membresía ni pago. Capturas privadas `output/monthly-membership-start-preview.png` y `output/monthly-membership-end-preview.png`.
- Límite de catálogo probado con 200 registros; 201 exige revisión. Medición de SQLite aislado: 18 ms en la ejecución principal. Esto no mide latencia remota ni la carga completa de 200 torneos.

## Fuentes y activación

Cambios TE desarrollados en un release aislado y trasladados a los nueve archivos correspondientes del proyecto original únicamente después de comprobar que coincidían con el baseline; los cambios locales ajenos se conservaron. El parche reproducible sin líneas de contexto queda en `docs/integrations/tournament-engine-athlete-groups.patch`; se comprobó con `git apply --reverse --check --unidiff-zero` sobre el árbol resultante. Para aplicarlo a otro checkout del mismo baseline, usar `git apply --unidiff-zero`.

El usuario autorizó expresamente las tres migraciones. Activadas el 21/10/2026:

1. Reservas: `supabase/migrations/20261021063651_monthly_membership_validity.sql`.
2. Tournament Engine: `db/migrations/0007_academy_athlete_groups.sql`, que conserva nombres aprobados de los vínculos ya confirmados sin modificar resultados fuente.
3. Reservas: `20261021024214_academy_notifications.sql`.

Verificación posterior: el helper real devuelve 20/11/2026 para inicio 20/10/2026; las tres funciones administrativas usan la nueva fórmula. Las tablas de notificaciones tienen RLS activo y cero avisos creados. El panel administrativo real carga sin errores y permite preparar avisos; no se publicó ningún mensaje de prueba.

TE conservó los conteos de las 33 tablas existentes y creó 27 anclas a partir de vínculos confirmados. Publicado antes de la PWA en `dpl_7JYd3Ug79mZLcGY9CbywxFUQ19n9`, luego de ejecutar sus 59 pruebas en Vercel. Se comprobó `operation=members` tanto en el despliegue preparado como en el dominio público: Joyse devuelve cuatro identidades de torneo y Alejandro una, con el alumno y ancla correctos. No se crearon nuevos vínculos durante esta verificación.
