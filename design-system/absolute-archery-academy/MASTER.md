# Absolute Archery Academy — sistema visual

Dirección: deportivo, moderno y profesional. Aplicación de entrenamiento y gestión; se priorizan lectura de datos y acciones frecuentes.

## Fundamentos

- Fondo `#f3f6f8`; superficies blancas; bordes `#dbe3e9`.
- Tinta y navegación azul noche `#101e2a`.
- Acción principal naranja `#c2410c` con texto blanco. Hover más oscuro `orange-800`.
- Naranja claro `#fb923c` para iconos y énfasis sobre azul noche, nunca para texto pequeño sobre blanco.
- Estados: verde `#15803d`, advertencia `#b45309`, error `#b91c1c`, información `#0369a1`; combinar icono/etiqueta con color.
- Manrope para lectura, formularios, nombres de planes y etiquetas. Barlow Condensed para títulos y cifras deportivas. `next/font`, archivos servidos por la app.
- Espaciado 4/8 px. Radios 12 px en controles, 18 px en paneles. Sombras discretas.

## Jerarquía

- Un bloque oscuro principal por vista cuando aporte contexto; superficies claras para contenido operativo.
- Alumno: identidad y reserva destacadas, métricas, accesos y agenda. Récords en panel oscuro con cifras grandes; medallas y posición final al frente.
- Administración: título, acciones, indicadores semanales y tareas. No añadir gráficas decorativas ni cifras ficticias.
- Nombres de planes largos usan cuerpo legible, no el tamaño reservado a cifras.
- Cinco destinos en el menú inferior del alumno. Estado activo con fondo, indicador y `aria-current`, sin depender solo del color.

## Accesibilidad y adaptación

- Contraste normal mínimo 4.5:1; controles de 44 px o más; navegación inferior del alumno 64 px.
- Foco visible; menú móvil con Escape y retorno de foco. Iconos Lucide decorativos con `aria-hidden`.
- Incluir `safe-area-inset-*` en navegación y contenido; no ocultar últimas acciones detrás del menú.
- Respetar movimiento reducido. Sin autoplay, parpadeos ni animaciones que desplacen acciones.
- Revisión móvil 375 px, escritorio y orientación horizontal; conservar todas las acciones y estados.

## Aplicación

Tokens en `app/globals.css` y `tailwind.config.js`. `surface-panel` vive en la capa de componentes y permite variantes utilitarias. `sport-dark` identifica superficies oscuras y mantiene transparencias reales sin romper compatibilidad con estilos heredados.

UI UX Pro Max informó contraste, jerarquía, navegación y adaptación. Su patrón automático de landing promocional se descartó para este producto operativo; esta es la adaptación concreta a la marca aprobada.
