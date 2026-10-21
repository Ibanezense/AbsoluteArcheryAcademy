# Avisos al abrir la app — verificación

## Alcance implementado

- `/admin/notificaciones`: creación, vista previa, borrador, publicación y desactivación; todos o alumnos elegidos; finalización al terminar el día de Perú.
- Popup accesible con X, Escape, control de foco, desplazamiento en pantallas pequeñas y botón de acción.
- Cola por alumno: recordatorio de membresía vencida primero, después comunicados pendientes; sin ventanas superpuestas.
- Cierre de comunicados persistido por alumno, compartido entre sus cuentas autorizadas. Si falla la persistencia, el cierre funciona durante esta apertura y se reintenta la presentación en la próxima.
- Vencimiento reaparece después de regreso desde segundo plano, restauración de página o una nueva carga, sin reaparecer por navegar. Actualización de membresía activa retira el recordatorio; sondeo cada 30 segundos y actualización al recuperar el foco.
- Renovar abre el flujo existente, sin solicitar ni registrar automáticamente pagos. Se conserva el aviso previo de última clase con su frecuencia diaria.

## Evidencias

- Vitest completo: **1010 pruebas**, cero fallos (`output/academy-notification-tests-final.json`).
- Seis pruebas montadas con React Query y los componentes reales de popup y renovación: cierre/navegación/reapertura, membresía activada, renovación con una sola ventana, cierre sin conexión, cola con cierres persistidos y comunicados nuevos que esperan a la próxima apertura.
- **28 comprobaciones PostgreSQL** en PGlite desechable: RLS, anónimo, alumno propio/ajeno, tutor propio/ajeno, administrador, cuentas desactivadas, destinos, borradores, finalización, desactivación, idempotencia y membresía activa. Runner: `node tests/supabase/runAcademyNotifications.mjs`. Requiere el runtime opcional aislado ya utilizado por el proyecto en `output/postgres-test`.
- TypeScript y ESLint sin errores. Compilación de producción correcta.
- Revisión independiente aprobada; ejecución independiente de 20 pruebas dirigidas y las 28 comprobaciones SQL.
- Ajuste final de la cola aprobado en segunda revisión, con ocho pruebas de componentes reejecutadas independientemente.
- Vista previa real en navegador móvil: contraste de título y X comprobado, cierre correcto con retorno de foco, comunicado genérico y aviso de vencimiento. Capturas privadas: `output/academy-notification-expired-preview.png` y `output/academy-notification-announcement-preview.png`. El texto de ejemplo solo se previsualizó; no se guardó ni publicó.
- Referencia revisada: [RLS de Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Activación pendiente

La migración aditiva `20261021024214_academy_notifications.sql` está preparada y probada, **sin aplicar a la base real**. No se publicaron comunicados de prueba ni se cambiaron membresías, reservas o pagos. La nueva aplicación no se ha desplegado a producción mientras falta la activación.

Tras autorización: aplicar la migración, verificar sus permisos y consultas con cuentas reales, publicar el código y comprobar producción. Para probar un comunicado real hace falta contenido y destinatario aprobados; no publicar un mensaje masivo de prueba.
