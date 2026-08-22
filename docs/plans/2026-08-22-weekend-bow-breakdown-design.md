# Desglose de arcos por libraje en el dashboard

**Fecha:** 2026-08-22
**Estado:** Aprobado

## Objetivo

Añadir a cada turno del resumen semanal dos indicadores de ocupación: `20 lb: ocupados/6` y `18 lb: ocupados/2`. Así administración puede identificar qué tipo de arco continúa libre para una clase de prueba.

## Fuente de datos

El RPC administrativo reutilizará `get_session_equipment_availability` y expondrá sin recalcular:

- `academy_capacity` y `academy_bows_used` para los arcos de 20 lb;
- capacidad fija `2` e `intro_bows_used` para los arcos exclusivos de 18 lb.

Las primeras dos clases de prueba ocupan los arcos de 18 lb. Las adicionales ocupan los de 20 lb. Los alumnos regulares con inventario compartido ocupan 20 lb; arcos propios o asignados no se cuentan.

## Interfaz

Cada tarjeta real mostrará dos chips compactos debajo del estado general:

- `20 lb · 6/6`
- `18 lb · 1/2`

Los valores significan `ocupados/total`. Un chip completo tendrá tono neutro/rojo según el estado; uno con disponibilidad mantendrá tono verde. Turnos finalizados conservan el desglose como referencia, y posiciones no programadas no muestran chips.

## Seguridad y actualización

La migración reemplazará de forma idempotente el RPC existente, manteniendo autenticación administrativa, `SECURITY DEFINER`, `search_path` fijo y los mismos permisos. La clave React Query existente seguirá actualizando el desglose después de reservas, cancelaciones y cambios de clases intro.

## Verificación

Pruebas contractuales cubrirán los cuatro campos SQL, mapeo/validación del servicio y los dos indicadores UI. Se verificará el caso aprobado `20 lb: 6/6` y `18 lb: 1/2`, suite completa, lint, TypeScript, build, smoke SQL, merge y Vercel.
