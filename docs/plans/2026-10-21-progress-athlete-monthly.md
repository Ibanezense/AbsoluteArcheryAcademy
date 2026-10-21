# Progress fallback, athlete identity and monthly validity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mostrar marcas previas hasta debutar en la distancia asignada, confirmar al arquero una sola vez y conservar el día de vencimiento del mes siguiente.

**Architecture:** El resumen elige una única distancia de referencia válida sin mezclar formatos. Tournament Engine conserva un nombre completo confirmado por vínculo y autoriza su grupo exacto de participaciones presentes/futuras; sus datos fuente permanecen intactos. Los planes regulares de duración 30 usan un cálculo mensual, alineado entre formularios y PostgreSQL.

**Tech Stack:** Next.js/React, TypeScript, Vitest, Supabase PostgreSQL, Tournament Engine/libSQL.

## Diseño aprobado y precisión del usuario

- Joyse asignada a 50 m sin controles válidos allí conserva récords a 40 m, etiquetados como referencia anterior; el primer control válido a 50 m cambia el resumen a 50 m.
- Una confirmación del nombre completo habilita todos sus torneos. Se normalizan tildes, espacios, mayúsculas y orden de nombres/apellidos; no se aceptan nombres parciales. Un conflicto con otro alumno bloquea la agrupación. Las revocaciones siguen siendo inmediatas y verificables.
- La precisión «20 de octubre → 20 de noviembre» prevalece sobre la frase anterior «30 días»: vigencia mensual por calendario, con ajuste al último día en meses cortos. No recortar prórrogas ni reescribir historia. Los planes especiales de un día y obsequios conservan sus fechas.
- Notificaciones siguen preparadas en commits previos; no confundir aprobación de este diseño con activación de su migración pendiente.

## Ejecución

1. Escribir pruebas fallidas de referencia 40→50, controles anulados y orden incierto. Modificar `lib/utils/studentTrainingProgress.ts`, contrato `TrainingSummary` y componentes compartidos de alumno/admin; abrir filtros en la referencia efectiva.
2. Escribir pruebas fallidas de 20/10→20/11, años bisiestos y ciclos múltiples en `membershipCycles.test.ts`. Implementar helper compartido mensual y usarlo en ambos formularios. Preparar migración con helper PostgreSQL y actualizar los puntos de asignación sin cambiar datos existentes. Probar en PostgreSQL desechable.
3. Trabajar únicamente en el release aislado de TE (el proyecto original tiene cambios ajenos). Añadir pruebas SQLite de grupo exacto, futuras participaciones, exclusividad y revocación. Añadir migración de nombre confirmado, consulta de integrantes autorizados y agrupación de búsqueda/vista previa. Mantener lectores de resultados individuales y contratos existentes.
4. Conectar el catálogo autorizado de integrantes al lector PWA, verificando sujeto y pertenencia de cada resultado y deduplicando participaciones. Preservar permisos, concurrencia y finalización de vínculos.
5. Ejecutar tests completos, SQL/SQLite, TypeScript, lint, build y revisión independiente. Verificar UI sin publicar resultados o alterar datos reales. Preparar activación concreta de migraciones reservada al usuario.
