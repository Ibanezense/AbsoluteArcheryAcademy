# Interfaz deportiva — verificación

## Resultado

Rediseño de presentación en la base compartida, acceso, inicio de alumnos, navegación, perfil, progreso, agenda de reserva y superficies administrativas. Manrope para lectura y Barlow Condensed para titulares/cifras; azul noche y naranja de marca con superficies claras. Sistema mantenible en `design-system/absolute-archery-academy/MASTER.md`.

No se cambiaron servicios, cálculos, reglas de membresía, pagos, identidad ni permisos. No se aplicaron migraciones ni se crearon reservas, ventas, pagos o notificaciones de prueba.

## Comprobaciones

- Suite completa: **1022 pruebas aprobadas, cero fallos** (`output/sports-tests-final.json`).
- Tras los últimos ajustes visuales de agenda, podio y nombres largos: **23 pruebas de presentación/logros aprobadas** (`output/sports-final-presentation-tests.log`).
- ESLint final correcto (`output/sports-lint-complete.log`).
- Compilación final de producción correcta, incluido chequeo de tipos (`output/sports-build-complete.log`).
- Revisión independiente: sin hallazgos P1/P2 tras corregir hover de navegación, contraste de confirmación y codificación UTF-8.
- Lectura estricta UTF-8 y escaneo de mojibake en fuentes modificadas correctos.
- Navegador real: administrador en inicio, finanzas y notificaciones; alumna en inicio, reserva, perfil, controles y competencias. Solo navegación y consulta.
- Vista móvil 375×812, escritorio 1280/1440 y orientación horizontal 768×375. Sin desbordamiento horizontal observado. Los cinco accesos del alumno miden 64 px de alto y más de 65 px de ancho en móvil.
- Menú administrativo móvil: apertura desde Más, Escape cierra y devuelve foco al botón.
- Agenda semanal: título blanco comprobado (`rgb(255,255,255)`, 24 px) sobre azul noche; sin crear una reserva.
- Récords separados por formato, distancia y fecha; podio con medalla y posición como elemento principal. Nombres largos de planes usan texto de lectura, sin inflar la cuadrícula de indicadores.
- Movimiento reducido implementado en CSS global. No se simularon las preferencias del sistema ni el tamaño de texto del sistema; esa comprobación física queda fuera de estas evidencias.

## Evidencias privadas

- `output/sports-student-desktop-final.png`
- `output/sports-student-mobile.png`
- `output/sports-admin-desktop-final.png`
- `output/sports-admin-mobile.png`
- `output/sports-progress-mobile.png`
- `output/sports-reservations-mobile-final.png`

Versión local revisable en puertos 3100 (administración) y 3101 (alumno), con sesiones separadas. Este rediseño se conserva en la rama `codex/admin-ux-audit`; no se ha publicado a producción.
