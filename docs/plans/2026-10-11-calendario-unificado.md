# Calendario unificado de pruebas

Objetivo: mostrar Tiabaya y Umacollo dentro de una sola semana, como solicita el usuario.

Diseño: una cuadrícula de siete días; los turnos de ambas sedes se ordenan por hora en cada día. Las tarjetas y los turnos disponibles identifican la sede mediante un encabezado azul para Tiabaya y violeta para Umacollo. El nombre siempre acompaña al color. El filtro existente conserva la selección por sede.

Implementación: eliminar las secciones por sede en IntroWeekCalendar, conservar cada destino de arrastre por session_id y usar un encabezado compartido en IntroSessionSlot e IntroAppointmentCard. Mantener el selector de día móvil y los controles de disponibilidad.

Verificación: pruebas existentes del calendario, lint y compilación; revisar la cuadrícula y el filtro en el navegador local sin modificar citas reales.
