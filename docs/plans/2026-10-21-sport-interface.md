# Interfaz deportiva — diseño y plan de implementación

**Objetivo:** aplicar el estilo moderno, deportivo y profesional pedido por el usuario a las superficies compartidas de alumnos y administración.

**Dirección:** extender el diseño deportivo elegante ya aprobado: azul noche para navegación y bloques destacados, naranja de marca para acciones, blanco y gris frío para contenido. Tipografía Barlow Condensed para titulares y cifras; Manrope para lectura y formularios. Bloques precisos, contraste alto, líneas de pista discretas, espacios coherentes y navegación reconocible. Frente a oscurecer toda la aplicación o cambiar únicamente colores, se elige una interfaz clara con contraste oscuro reservado para jerarquía y logros.

**Fuentes:** UI UX Pro Max (consultas `sports academy dashboard professional`, `sports management dashboard` y `responsive navigation safe area`), componentes reales, diseño de progreso ya aprobado. El generador recomienda un patrón promocional; ese patrón no se aplica al producto operativo. Se conservan sus pautas de accesibilidad y se adapta la dirección a la marca existente.

**Arquitectura:** presentación en componentes actuales y tokens CSS/Tailwind. Mantener servicios, cálculos, permisos, vínculos, membresías y notificaciones. Sin cambios en datos ni migraciones. Reutilizar el worktree adjunto `codex/admin-ux-audit`.

**Tecnologías:** Next.js 14, React 18, Tailwind 3, Lucide y Vitest existentes. Sin nuevas dependencias de interfaz.

## Tareas

1. **Fundación visual:** `app/globals.css`, `tailwind.config.js`, `app/layout.tsx`, `components/ui/button.tsx` y `card.tsx`. Tokens de superficie/tinta/acento, controles accesibles, fuentes y movimiento reducido. Conservar compatibilidad con componentes heredados; no reemplazar clases utilitarias semánticas globalmente.
2. **Alumno:** `app/page.tsx`, `components/StudentBottomNav.tsx`, `components/student/MobileStudentHeader.tsx`, `StudentCard.tsx`, `app/LayoutWrapper.tsx` y login. Resumen deportivo, acción de reserva visible, tarjetas ordenadas, menú inferior de cinco accesos y zonas seguras. Mantener todos los estados y acciones existentes.
3. **Administración:** `components/AdminSidebar.tsx`, `components/admin/AdminVisualSystem.tsx`, `app/admin/page.tsx` y `app/admin/layout.tsx`. Cabeceras con jerarquía, indicadores numéricos legibles, navegación activa clara, paneles coherentes. Conservar significado de los KPI semanales y financieros.
4. **Verificación:** lint, TypeScript, pruebas existentes y compilación. Navegador real con sesión administrativa local: inicio, alumnos, finanzas y notificaciones. Vista alumno móvil y escritorio, perfil, progreso y reserva; solo navegación, sin crear ventas ni reservas de prueba. Capturas antes/después. Revisar foco, contraste, 375 px, escritorio y zona segura inferior.

## Completado

Diseño implementado y compilado, sin cambios de comportamiento de negocio, pantallas principales revisadas en navegador y evidencias guardadas. Entregar una vista local revisable; este cambio visual no exige modificar bases reales.
