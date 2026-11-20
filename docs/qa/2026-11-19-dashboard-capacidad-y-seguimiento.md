# Dashboard: cupos y seguimiento

Trabajo local en `codex/archery-dashboard-profesional`. No se han aplicado las migraciones ni publicado la interfaz.

## Alcance

- Resumen de horarios de los próximos siete días. El filtro de la cabecera también actualiza las cifras del día y de la semana, el gráfico, la agenda, las próximas pruebas, los cumpleaños y los vencimientos.
- Los alumnos asignados a las dos sedes aparecen en ambos filtros de cumpleaños y vencimientos. En el resumen general aparecen una vez. Pagos pendientes y los indicadores históricos del bloque «Toda la academia» conservan su alcance general.
- Umacollo: cuatro espacios compartidos. Tiabaya: seis cupos para arcos de academia; los arcos propios no consumen ese límite.
- Se cuentan juntas todas las reservas de horarios superpuestos. El resultado es conservador: dos reservas que coinciden con partes distintas del mismo turno pueden contarse ambas, aunque no se solapen entre sí. No representa confirmación de disponibilidad por tipo de arco.
- Las reservas sin clasificación de uso de arco en Tiabaya muestran que está pendiente de confirmar. Para Umacollo se muestra capacidad física, sin garantizar un arco compatible.
- Cumpleaños hoy/mañana y seguimiento de membresías con estados activo, pausado y vencido; se excluyen alumnos inactivos. Hay enlaces para saludar por WhatsApp sin enviar mensajes automáticamente.
- Seguimiento separado para vencimientos hasta siete días y vencimientos de los últimos 30 días, tomando la membresía vigente o futura con fecha de finalización más lejana. La renovación futura evita alertar por el ciclo anterior. La membresía sin fecha final excluye al alumno de la lista.

## Verificación de datos

Lecturas agregadas del 19/11/2026 confirmaron las dos sedes, el registro de la migración de cupos compartidos de Umacollo y que el inventario `academy_bows` no tiene sede. Las reservas futuras consultadas no presentaban tipos de arco desconocidos. No se detectaron sesiones solapadas en los próximos siete días; la prueba aislada sí cubre ese caso y la salida es conservadora. Una consulta agregada independiente aplicando el criterio local obtuvo cuatro alertas por vencer y cinco vencidas en ese momento; esos valores pueden variar y aún falta revisar los casos particulares de pausas y ciclos. Por eso el tablero comunica límites operativos, no una garantía de que haya equipo compatible en la sede.

Se preparó una página temporal de desarrollo `/vista-previa-academia` con datos ficticios y componentes reales del tablero. Se inspeccionó a 390 y 1440 píxeles y se comprobó el selector de sede. No representa la pantalla completa ni conecta datos reales; la página temporal no debe incluirse en una publicación.

Se verificó el selector de la cabecera en el panel local con sesión administrativa y la base real. Las reservas de hoy sumaron 5 en el general, 4 en Tiabaya y 1 en Umacollo. Para la semana se obtuvieron 10, 8 y 2, respectivamente. En las tres vistas, el gráfico diario suma el mismo total que el resumen semanal. Las cifras corresponden al momento de la prueba y pueden cambiar con nuevas reservas.

## Pendiente antes de publicar

- Revisar con datos reales los horarios, la atribución y disponibilidad de arcos por sede, incluidos turnos parcialmente solapados.
- Verificar que las reglas de membresías cubren ciclos especiales, pausas y renovaciones en los datos reales sin modificar registros.
- Revisar visualmente escritorio y móvil con las migraciones en un entorno aislado. Las pruebas de base de datos usan fixtures PGlite, no una copia completa de producción.
- Las tres migraciones nuevas son necesarias para mostrar las secciones. Preparar y probar su despliegue; solicitar aprobación antes de aplicar a producción y publicar, conforme a lo acordado.
