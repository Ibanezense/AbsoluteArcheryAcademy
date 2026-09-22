# Reversión de inasistencias y membresía en el historial

## Objetivo

Permitir que un administrador revierta una inasistencia justificada, devuelva exactamente una clase a la membresía que fue debitada y retire la inasistencia del historial visible del alumno. La misma operación debe funcionar para una reserva marcada como `no_show` y para una inasistencia semanal creada cuando el alumno no reservó.

La pestaña **Asistencias** también mostrará la membresía asociada a cada clase mediante el mes de inicio del ciclo, por ejemplo `Setiembre` u `Octubre`.

## Decisión de arquitectura

Las dos fuentes actuales se conservarán para no migrar ni perder el historial:

- `bookings` representa una clase que sí tuvo reserva.
- `student_weekly_attendance` representa una obligación semanal que nunca tuvo reserva.

Ambas se presentarán como un solo concepto funcional: **Inasistencia**. El origen seguirá disponible internamente para ejecutar la reversión correcta y mantener trazabilidad.

Una sola función transaccional `admin_reverse_no_show` recibirá el tipo de origen, el identificador del evento, el motivo y una clave de idempotencia. La interfaz no expondrá la diferencia al administrador.

## Datos y auditoría

Crear `attendance_reversals` con:

- Alumno y membresía afectados.
- Reserva o inasistencia semanal de origen; exactamente uno será obligatorio.
- Movimiento original de consumo y movimiento compensatorio.
- Motivo obligatorio.
- Administrador responsable.
- Fecha y clave de idempotencia.

Los registros originales no se eliminarán. Una reversión los excluirá del historial visible y de los indicadores de inasistencia, pero conservará la evidencia necesaria para auditoría y para impedir una segunda devolución.

El ledger añadirá el movimiento positivo `no_show_reversal_refund`. La devolución se aplicará a `student_memberships.classes_used` y `classes_remaining` de la misma membresía registrada en el consumo original. No se buscará ni modificará la membresía activa actual.

## Reglas de la operación

La función deberá:

1. Exigir una sesión autenticada y rol administrador.
2. Exigir un motivo no vacío.
3. Bloquear el evento, la membresía y el movimiento original.
4. Confirmar que el evento sigue siendo una inasistencia y consumió exactamente una clase.
5. Rechazar fuentes o alumnos inconsistentes.
6. Impedir una segunda reversión mediante restricciones únicas e idempotencia.
7. Incrementar `classes_remaining` y reducir `classes_used` sin bajar de cero.
8. Insertar el movimiento positivo en `student_credit_ledger`.
9. Insertar la auditoría en `attendance_reversals`.
10. Confirmar todo dentro de una sola transacción o revertirlo por completo.

La reversión resolverá la obligación semanal: no deberá reaparecer en la revisión dominical como una falta pendiente. Solo desaparecerá de las superficies visibles de inasistencia.

## Historial y membresía

Cada fila del historial tendrá un identificador real de membresía:

- Reservas: `bookings.active_membership_id`.
- Faltas semanales: `student_weekly_attendance.student_membership_id`.

El mes se obtendrá de `student_memberships.start_date` y se mostrará en español con mayúscula inicial. Si un dato histórico no tiene membresía relacionada se mostrará `Sin membresía`.

La tabla tendrá las columnas:

- Fecha.
- Hora.
- Distancia.
- Membresía.
- Resultado.
- Nota.
- Acción.

Solo las filas `No asistió` mostrarán `Revertir inasistencia`. Al pulsarlo se solicitará un motivo obligatorio y una confirmación. Tras completarse, se actualizarán el historial, el saldo de membresía, la revisión semanal y los indicadores administrativos.

## Seguridad

- La escritura estará encapsulada en un RPC `SECURITY DEFINER` con comprobación explícita de `auth.uid()` e `is_admin_user()`.
- Se revocará ejecución a `PUBLIC` y `anon`.
- Solo `authenticated` y `service_role` podrán invocarlo; la función rechazará cualquier usuario autenticado que no sea administrador.
- La interfaz nunca modificará directamente membresías, ledger ni auditorías.

## Pruebas

- Reversión de reserva `no_show` y devolución a su membresía original.
- Reversión de falta semanal y devolución a su membresía original.
- Motivo obligatorio, rol administrador y evento válido.
- Idempotencia y rechazo de doble devolución.
- Auditoría con movimiento original y compensatorio.
- Exclusión de reversiones del historial visible.
- Asociación correcta de membresía para ambos orígenes.
- Formato de mes `Setiembre`/`Octubre` y fallback `Sin membresía`.
- Actualización de cachés administrativas después de revertir.
- Suite completa, lint y compilación de producción.

