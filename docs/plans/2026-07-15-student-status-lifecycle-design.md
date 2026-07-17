# Ciclo de estados de alumnos

## Objetivo

Representar en la lista administrativa el estado comercial real de cada alumno a partir de su membresía vigente o de la fecha exacta en que la membresía venció o agotó sus clases.

## Fuente de verdad

La lista utilizará `membership_expired_at`, ya disponible en `StudentListRow`. Este valor registra tanto el vencimiento por fecha como el agotamiento de clases. Si no estuviera disponible para un registro histórico, se usará como respaldo el día posterior a `membership_end`.

No se modifica el esquema ni se persisten nuevas transiciones. Los estados protegidos `retired`, `withdrawn`, `blocked` y `suspended` continúan prevaleciendo como inactivos.

## Estados visibles

- **Activo:** membresía activa, con clases disponibles y más de siete días de vigencia.
- **Por vencer:** membresía activa, con clases disponibles y entre cero y siete días de vigencia.
- **Vencido:** membresía vencida o sin clases durante los primeros catorce días desde `membership_expired_at`.
- **En pausa:** entre los días quince y sesenta desde `membership_expired_at`.
- **Inactivo:** desde el día sesenta y uno, o cuando existe un estado operativo protegido.

Los límites se calculan por día calendario para evitar variaciones por la hora de ejecución.

## Orden y filtros

La lista se ordenará siempre por la prioridad:

1. Activo
2. Por vencer
3. Vencido
4. En pausa
5. Inactivo

Dentro de cada grupo se utilizará el nombre completo en orden alfabético. El filtro incorporará la opción `Vencidos`; la búsqueda seguirá aplicándose antes de mostrar el conjunto ordenado.

## Verificación

Las pruebas cubrirán agotamiento de clases, vencimiento por fecha, los límites de los días 14, 15, 60 y 61, precedencia de estados protegidos, filtros y orden estable por estado y nombre. Después se ejecutarán pruebas completas, build de producción y una comprobación HTTP con `next start` en segundo plano.
