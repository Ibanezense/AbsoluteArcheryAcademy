# Asistencia y vencimiento de clases

Diseño aprobado por el usuario el 11 de octubre de 2026.

- Solo la asistencia registrada consume un crédito. Se bloquean las faltas manuales, semanales y las cancelaciones reclasificadas como faltas.
- Las reservas de alumnos sin asistencia se cancelan después de terminar su día en America/Lima. No se modifican saldos ni asistencias anteriores. Se liberan recursos y compromisos.
- Las membresías nuevas y las que están vigentes adoptan la regla. Los ciclos ya vencidos mantienen su historial.
- Al terminar la fecha final, los créditos normales y recuperaciones pendientes vencen definitivamente. Se guarda un evento por ciclo con cantidades originales y auditoría; el historial muestra cada clase como No asistida · No recuperable, con su membresía y sin una sesión ficticia.
- La fecha final sigue siendo utilizable hasta terminar ese día. Las renovaciones crean sus propios créditos, sin recuperación del ciclo anterior. Las recuperaciones concedidas antes del cambio se respetan dentro de su ciclo vigente.
- El cierre y el vencimiento son transaccionales e idempotentes, con límites de acceso. La programación se ejecuta en la base de datos aun cuando no haya usuarios conectados.
- Verificación: pruebas de historial y pantallas, ejecución SQL con fixtures y rollback, suite, lint y build.
