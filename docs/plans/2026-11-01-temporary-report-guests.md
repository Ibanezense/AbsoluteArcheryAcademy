# Invitados temporales en el PDF del club — Implementation Plan

> Ejecutar con la skill executing-plans, respetando los datos y cambios ajenos.

**Objetivo:** Añadir invitados únicamente al PDF actual, sin registros de alumnos, reservas ni escrituras remotas.
**Arquitectura:** Estado local por fecha/sede; formulario de nombre completo y DNI; combinación de filas solo al previsualizar y exportar. Reutilizar jsPDF y el reporte existente.
**Stack:** React, TypeScript, Tailwind, Vitest/Testing Library y jsPDF.

Decisión del usuario: solo descarga actual. Los invitados se identifican como «Invitado», pueden editarse/quitarse y se limpian al cambiar fecha/sede, abandonar pantalla o iniciar correctamente la descarga. Un error de generación conserva el borrador. Nombre obligatorio (2–120 caracteres), DNI obligatorio de 8 dígitos como texto, sin duplicados por DNI entre invitados o filas del reporte. No se requiere crear/seleccionar un alumno.

1. Pruebas rojas: validación/deduplicación, edición y combinación sin modificar alumnos/pruebas/admins; prueba montada de pantalla para PDF, cambio de contexto, error y vaciado después de descarga.
2. Implementar helpers en lib/reports/dailyClubEntryReport.ts y editor accesible components/admin/TemporaryClubGuests.tsx.
3. Integrar app/admin/ajustes/reportes/page.tsx: mantener consulta y filas originales; borrador ligado a fecha/sede y vista previa consistente con PDF. Revalidar DNI contra filas actualizadas antes de exportar. No localStorage ni RPC de escritura. Etiquetas según type, no inferir «Admin» por DNI faltante.
4. Verificar pruebas de helpers, pantalla y PDF multipágina, lint y compilación. Generar PDF con fixtures y renderizar para revisar paginación, nombres y DNI sin recortes. Revisar móvil/escritorio con fixtures.
5. Revisión de código y commit en rama de trabajo. No hay migraciones. La publicación no está solicitada en esta tarea; informar resultado local y pedir autorización concreta antes de desplegar.

Criterios: invitado visible una sola vez en vista previa/PDF con DNI correcto, alumnos y pruebas preservados; edición/quitar funcionan; duplicados y datos inválidos no se exportan; borradores no cruzan fechas/sedes ni se conservan tras descarga correcta; un fallo no los pierde; sin llamadas de escritura ni datos reales usados para QA.
