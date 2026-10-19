# Retención y conversión de pruebas

Validación del 19/10/2026, America/Lima. Rama `codex/admin-ux-audit`. Sustituye los criterios anteriores de siete días y tres series.

## Definición y contraste

Cinco series: nuevos, renovaron, pendientes, perdidos y reactivados. Los vencimientos se agrupan por su mes; el plazo comprende 30 días exactos, incluido el día 30. El día 31 confirma la pérdida. Un regreso posterior conserva la pérdida y suma reactivación en su mes de inicio. Se ignoran ciclos contenidos y duplicados; cada alumno tiene una sola clasificación por mes de vencimiento, usando el último vencimiento efectivo de ciclos iniciados. Nuevos usa la primera membresía no obsequio. La tasa agrega renovados/denominador de meses completamente cerrados, sin promediar porcentajes mensuales.

Una consulta SQL independiente de lectura, con ventanas, exclusión de ciclos contenidos y último vencimiento mensual, coincide con la tabla del navegador:

| Mes 2026 | Vencimientos | Renovaron | Pendientes | Perdidos |
| --- | ---: | ---: | ---: | ---: |
| Mayo | 5 | 1 | 0 | 4 |
| Junio | 15 | 10 | 0 | 5 |
| Julio | 27 | 22 | 0 | 5 |
| Agosto | 31 | 25 | 0 | 6 |
| Setiembre | 30 | 23 | 3 | 4 |
| Octubre | 31 | 12 | 19 | 0 |

Últimos seis meses: 27 nuevos, 93 renovaciones, 22 pendientes, 24 pérdidas y 9 reactivaciones. Tasa cerrada mayo–agosto: 58/78 = 74,4 %. Setiembre y octubre son provisionales. Son sumas mensuales, no alumnos únicos del periodo ni un saldo de alumnos activos. Las cifras cambian con nuevos registros o correcciones.

Se mantiene una advertencia por un alumno excluido: su ciclo comienza el 01/08/2026 y termina el 07/07/2026. Se aísla toda su historia, sin corregir datos ni inventar fechas.

## Conversión de pruebas

Sección independiente del gráfico. Denominador: personas registradas distintas con primera prueba asistida en el periodo, según día de Lima. Reservas, canceladas e inasistencias no cuentan. Numerador: vínculos confirmados por administrador con primera membresía no obsequio desde la prueba hasta la fecha de referencia. Sin vínculo no equivale a no inscrito.

Navegador: 118 asistentes en todo el historial; 15 en setiembre y 14 en octubre. Búsqueda `ZUNIGA EDUARDO` encuentra un resultado ignorando acentos y orden, sin cambiar el denominador. Se verificó búsqueda de candidatos, filtro cronológico y paso explícito de confirmación; se canceló antes de guardar. No se crearon vínculos reales para probar.

Migración `20261019143009_admin_trial_student_conversions.sql` aplicada a `xgjmgsuggybvsxosgfqi` con autorización expresa del usuario. El archivo local coincide con la versión registrada por Supabase. Añade registro y eventos, lectura admin con RLS, RPC con autorización, locks, unicidad por alumno/persona, validaciones cronológicas y revocación con versión esperada. Eliminar alumnos conserva instantánea de nombre y eventos, sin bloquear el flujo previo de eliminación.

Verificación posterior en la base: ambas tablas con RLS habilitado, sin ejecución anónima de confirmación ni INSERT directo del rol autenticado; cero vínculos y cero eventos. El 0 % inicial corresponde a conversiones confirmadas, no a una afirmación sobre las inscripciones históricas. Antes de habilitar el registro, la interfaz mostró tasa desconocida en lugar de cero supuesto.

## Pruebas y límites

- Suite completa: 146 archivos y 777 pruebas aprobadas.
- ESLint, TypeScript y compilación de producción aprobados.
- SQL real de la migración ejecutado sobre PostgreSQL desechable mediante PGlite 0.5.10, con `adminTrialConversion.bootstrap.sql` y `adminTrialConversion.integration.sql`. Cubre roles, RLS, escrituras directas, idempotencia, unicidad, cronología, obsequios, borradores, canceladas, futuro, auditoría, revocación obsoleta y eliminación de alumnos. Las fixtures mínimas verifican este contrato, no reproducen todo el esquema remoto. Nunca ejecutar el bootstrap sobre la base real.
- Revisión independiente completada; corregida FK que bloqueaba eliminación de alumnos. Sin otros hallazgos accionables.
- Navegador autenticado: interfaz compilada en localhost:3100, consulta real de lectura, selector 6/12 meses, tabla, filtro mensual y búsqueda. A 390 px documento de 375 px; a 1440 px documento de 1440 px. Tabla horizontal interna, sin desbordamiento de página.
- Evidencia privada en `output/admin-ux-after/retention-desktop.png`, `retention-mobile.png`, `conversion-desktop.png`, `conversion-mobile.png`; excluida de Git.

El guardado y revocación se comprobaron con fixtures aisladas, sin alterar identidades de la academia. La migración está aplicada; la interfaz sigue local y no se ha desplegado.
