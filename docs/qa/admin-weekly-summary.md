# Resumen semanal del inicio

Validado el 19/10/2026 en `codex/admin-ux-audit`. Las cinco tarjetas solicitadas usan semana calendario lunes–domingo en America/Lima, con rango visible y etiqueta Semana. No se eliminan registros al cambiar de periodo.

## Criterios

- Reservas: sesiones de la semana, sin reservas ni sesiones canceladas; incluye reserved, attended y no_show. No usa la agenda limitada a 80 filas.
- Clases programadas: sesiones scheduled del periodo completo.
- Cupos libres: sesiones scheduled de la semana que aún no comenzaron, según capacidad configurada por distancias. La falta de capacidad se muestra como N/D; semana sin sesiones pendientes tiene cero. Se limita a cero por sesión antes de sumar para evitar que una sobreocupación reste cupos libres de otra clase.
- Pendientes de confirmar: reservas de prueba reserved del periodo completo, conservando la definición previa de este indicador.
- Asistencias por marcar: reservas reserved del periodo completo, incluidas futuras; el texto lo aclara.

Consulta nueva admin-only, aditiva, sin cambiar el resumen diario antiguo ni las alertas, agenda, retención y conversión. Errores semanales muestran reintento específico sin fabricar ceros. Clave de caché semanal bajo el prefijo de invalidación del dashboard; refresco cada minuto, al recuperar foco y al lunes siguiente mediante temporizador. Limpieza de temporizador y listeners al desmontar.

## Verificaciones

10 pruebas nuevas: límites domingo/lunes hasta milisegundo, UTC distinto al día de Lima, cambio de año, rechazo de respuestas incompletas/negativas y cohortes obsoletas, servicio y propagación de errores, cambio de clave sin recargar y recuperación de pestaña dormida. Suite completa: 149 archivos / 787 pruebas aprobadas. TypeScript, lint de compilación y build de producción aprobados.

SQL ejecutado en PostgreSQL desechable mediante PGlite con `adminTrialConversion.bootstrap.sql`, migración semanal y `adminWeeklySummary.integration.sql`. Prueba intervalo cerrado/abierto, estados cancelados, sesiones pasadas, semana vacía, capacidad desconocida y sobreocupada, 86 reservas sin truncado de agenda, roles no administradores y ejecución anónima denegada. El bootstrap usa esquema mínimo, nunca se ejecuta en la base real.

Revisión independiente sin hallazgos accionables. Migración aplicada con autorización expresa del usuario: `20261019145239_admin_weekly_dashboard_summary.sql`, mismo identificador registrado por Supabase. Solo añade una función de consulta; no escribe reservas ni otros datos de negocio.

Contraste real: periodo 19–25 octubre 2026, 8 reservas, 18 clases, 392 cupos restantes configurados, 0 pruebas pendientes y 8 asistencias pendientes. Conteo independiente de reservas y sesiones coincide con el RPC y el navegador autenticado. Ejecución anónima no concedida. Los valores pueden cambiar con nuevas reservas, horarios o asistencias.

Navegador localhost:3100 con compilación de producción: cinco tarjetas y fechas verificadas. A 1440 px, documento de 1425 px; a 390 px, documento de 375 px, sin desbordamiento horizontal. Evidencia privada `output/admin-ux-after/weekly-summary-desktop.png` y `weekly-summary-mobile.png`, excluida de Git. La interfaz permanece local, sin publicación.
