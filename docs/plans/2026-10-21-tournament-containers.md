# Tarjeta única por torneo

## Problema y criterio

Las importaciones históricas pueden separar inscripción, clasificación y finales mediante distintos identificadores de competidor, participación y categoría. Además, Nacional y Open son resultados distintos: no se debe elegir un puesto entre ambos ni presentarlos como torneos independientes.

Mostrar un contenedor por alumno autorizado, dataset, versión vigente y torneo canónico. Conservar dentro sus participaciones, puntajes, categorías y ámbitos. El título y la fecha no bastan para unir registros. No modificar históricos ni sumar puntajes. Las posiciones contradictorias siguen pendientes de revisión.

## Implementación y verificación

1. Reproducir con pruebas el patrón de 2025: clasificación, inscripción vacía, Nacional y Open. Comprobar separación entre alumnos, versiones y torneos, e independencia del orden de entrada.
2. Ampliar el lector privado de Tournament Engine: `class_context=scope-v1` permite enviar `competition_scope` y `source_category_code`. Sin el parámetro, la respuesta conserva el contrato anterior. Mantener la autorización y los campos mínimos.
3. Agrupar visualmente las participaciones ya proyectadas, sin cambiar su asociación deportiva. Identificar cada clasificación y resultado por categoría y ámbito cuando corresponde. Paginar y contar torneos.
4. Verificar la presentación, validación del contrato, suite completa, lint, build y casos reales de lectura: Camila, Joyse y Alejandro. Revisar con un agente independiente.

## Publicación

Publicar primero el lector de Tournament Engine y después la PWA: la versión antigua del lector rechaza el nuevo parámetro. No requiere migración ni escritura de resultados, vínculos o membresías. La corrección de este turno se verifica localmente; la publicación se realiza cuando se solicite.

## Evidencia local

Lectura autorizada de 25 snapshots: Camila, 20 registros en 7 torneos; Joyse, 4 en 2; Alejandro, 1 en 1. En la tercera fecha de 2025 de Camila, conservar 544 puntos, Open 4 y Nacional 6. En Joyse, conservar 227 puntos y Nacional 2 en el torneo de 2025. Datos y diagnósticos privados en `output/`, fuera de Git.

Validación: 1.046 pruebas de la PWA y 59 de Tournament Engine aprobadas; lint de ambos proyectos y compilación de producción de la PWA aprobados. Revisión independiente sin hallazgos pendientes. El typecheck global de Tournament Engine conserva errores preexistentes en scripts de publicación, configuración del cliente e integración; no se declara limpio ni se amplía el alcance para corregirlos.
