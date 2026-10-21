# Participaciones de competencias fragmentadas

## Causa comprobada

La consulta privada de Tournament Engine devuelve tres identidades/participaciones diferentes de la misma alumna dentro del mismo dataset, versión y torneo de la Segunda Fecha del 1–2 de mayo de 2026. El registro de final documenta oro oficial y clasificación 2; el de clasificación documenta 557 puntos, 72 flechas y dos segmentos a 40 m; el tercero solo registra participación. La proyección anterior usaba `dataset_id:participation_id` como tarjeta y mostraba las tres por separado.

## Corrección

La proyección de lectura reúne fases de la misma identidad ya autorizada, dentro del mismo torneo, dataset y versión. Conserva los IDs originales como trazabilidad y no modifica los snapshots ni los datos de Tournament Engine.

Se exige coincidencia del nombre completo normalizado y del alumno autorizado. Las categorías canónicas documentadas diferentes quedan separadas. Una categoría desconocida solo se incorpora a una categoría documentada si existe una única opción. Si un competidor canónico tiene varias participaciones, no se elige una asociación por el orden de sus IDs. Ante datos ambiguos se conservan los registros separados.

Los puntajes de distintos formatos no se suman. La clasificación explícita de otra fase se aplica solo cuando hay una única clasificación correspondiente. Las posiciones contradictorias siguen marcadas para revisión y no producen medalla. Se respetan retiradas y anulaciones del origen. La separación por torneo y versión no se sustituye por comparar fechas o títulos.

## Verificación

- Regresión inicial: tres pruebas fallan mostrando tres tarjetas antes de la corrección; guardado en `output/competition-fragments-red.log`.
- Regresión adicional de ambigüedad: dos pruebas fallan antes del guard; pasan después.
- **35 pruebas dirigidas** aprobadas de proyección/presentación, incluyendo conflictos, categorías, autorizaciones, formatos, determinismo y retiradas.
- **1036 pruebas completas**, cero fallos (`output/competition-fragments-tests-final.json`).
- Compilación de producción correcta, con ESLint y chequeo de tipos (`output/competition-fragments-build-final.log`). Revisión independiente aprobada.
- Lectura real: 20 snapshots autorizados producen 10 participaciones; la Segunda Fecha 2026 produce una única tarjeta con 557 puntos / 72 flechas / 40 m, clasificación 2 y final 1 oficial. Los registros históricos con categorías o asociaciones ambiguas permanecen separados; no se fuerza una conciliación sin evidencia.
- Navegador real en `http://localhost:3101/mi-progreso`: una sola tarjeta de la Segunda Fecha de mayo de 2026 contiene tanto «Medalla de oro» como «557». Captura privada: `output/camila-second-date-complete.png`.

No hubo escrituras en bases reales, cambios de resultados, nuevas vinculaciones ni despliegue. La corrección local conserva el rediseño anterior y comparte la proyección entre alumno y administración.
