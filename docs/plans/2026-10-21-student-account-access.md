# Acceso de alumnos y estado de membresía

Regla confirmada: `active`, `expired` y `paused` permiten entrar. `inactive`, bajas y estados protegidos lo impiden. El bloqueo administrativo explícito siempre prevalece. Habilitar una cuenta no habilita reservas ni modifica créditos.

Causa: editar la ficha copiaba `students.is_active`, que representa disponibilidad académica, sobre `profiles.is_active`, que controla el inicio de sesión y las consultas privadas. Mariana estaba `expired`, sin bloqueo explícito, pero tenía el perfil deshabilitado.

Cambios:

- Editar datos personales conserva el estado de acceso. Crear un alumno explícitamente inactivo también guarda ese estado operativo.
- El login comprueba la cuenta y el estado operativo del alumno antes de generar la sesión. Las cuentas de admin y tutor mantienen su flujo.
- El estado operativo, los bloqueos y los cambios de cuenta vinculada sincronizan el acceso mediante un trigger privado. Inactivo deshabilita la cuenta; quitar ese estado respeta los bloqueos independientes.
- El RPC administrativo no permite reactivar el acceso mientras exista un estado inactivo/protegido.
- La edición deja de mostrar el indicador académico como un selector Activo/Inactivo. Esa operación se realiza desde la ficha con el aviso correcto.
- El inicio del alumno muestra el estado de su membresía sin convertir el indicador de disponibilidad para reservas en una etiqueta «Inactivo».

La migración `20261021191039_student_account_access_policy.sql` se aplicó con autorización expresa. Habilitó 4 cuentas vencidas/en pausa inconsistentes y deshabilitó 3 inactivas que conservaban acceso. La verificación posterior devuelve cero inconsistencias y ningún inactivo/bloqueado habilitado. Los hashes de las membresías y los pagos coinciden antes y después.

Validación: pruebas del login y de edición, PostgreSQL local con PGlite (reconciliación, cambios de estado, bloqueo explícito, permisos e idempotencia), suite completa de 1.059 pruebas, lint y build de producción aprobados. Revisión independiente aprobada. La prueba real de Mariana devuelve login 200 y `membership.expired=true` en el feed de notificaciones, manteniendo su membresía vencida.
