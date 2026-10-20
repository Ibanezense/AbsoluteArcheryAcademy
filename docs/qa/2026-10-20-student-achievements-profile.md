# Mi perfil y logros deportivos: verificación

Diseño aprobado expresamente el 20/10/2026: estilo deportivo elegante, récords oscuros con cifras protagonistas, podio oficial con medalla y quinto acceso Mi perfil. Implementado en el worktree `codex/admin-ux-audit`; sin publicación ni migraciones nuevas.

## Comportamiento y presentación

- Récords de 36 y 72 flechas separados, con sello de récord personal, máximo secundario, distancia y fecha. Solo usan las mejores marcas válidas existentes a la distancia asignada. No afirman que el récord acaba de superarse. Último control mantiene su función con menor jerarquía; vacíos no reciben trofeo ni cero ficticio.
- El resultado final precede a clasificación. Podio documentado 1/2/3, participación finalizada, estado exclusivamente oficial y posición sin conflicto: medalla oro/plata/bronce y puesto destacado. Provisionales, DNS, DNF, descalificación, conflictos y posiciones ausentes no reciben medalla. Clasificación mantiene su propia posición independiente.
- Mi perfil reúne avatar, datos personales y deportivos de lectura, acceso a progreso y soporte para solicitar cambios. Apoderados conservan selección/cambio de alumno; administradores conservan acceso a su panel.
- Cinco destinos inferiores. Perfil y progreso activan Mi perfil. El atajo de Inicio abre la nueva ficha. La lectura personal no expone DNI, claves, campos financieros o tablas personales de tutores.

## Permisos y revisión

API nueva con JWT normal del usuario, whitelist, filtro exacto por alumno, respuesta `private, no-store`, autorización de cuenta activa y comprobación de relación antes y después. Query por cuenta/alumno, cancelación y borrado al cambiar autenticación, datos ocultos ante error o identidad incoherente.

La revisión detectó un efecto secundario en `get_my_children`: sincroniza estados operativos. Se sustituyó su uso dentro de la nueva API por `resolve_accessible_student_id`, comprobado como STABLE y ejecutable por authenticated en la base vigente. Se mantienen las consultas del contexto de cuenta que ya utilizaba la app; no se refactorizó ese flujo global. No se añadieron mutadores ni se amplió ningún permiso.

Pruebas rojas/verdes de elegibilidad de medalla, presentación semántica y nueva API. La corrección de acceso tiene pruebas de rechazo antes de leer filas, pérdida de relación y desactivación de cuenta durante la consulta. Revisiones independientes de presentación y de perfil/permisos cerradas sin hallazgos materiales.

## Evidencia

- Suite final: 984 pruebas, 181 archivos, aprobadas.
- ESLint, TypeScript y compilación de producción aprobados. Sin dependencias nuevas.
- Cuenta del piloto real: datos de perfil visibles, acceso desde quinto botón, transición a progreso y ambas fuentes. Los resultados y la distancia de entrenamiento conservan los valores verificados anteriormente.
- Comprobación visual de podio a 320/360/390 px y récords en móvil; sin desbordamiento horizontal. Medallón, puesto y textos ajustados para no partir el puesto a 320 px. Etiquetas del menú en cinco celdas, con controles de 68 px.
- Capturas reales privadas en `output/student-achievements-ui/`, excluidas localmente de Git. No se incluyen datos personales ni fotos en documentación versionada.

El servidor local vuelve a escuchar en loopback 3100 después de compilar. Controles y Competencias conservan sus conexiones y permisos previamente autorizados. La publicación pública sigue fuera del alcance autorizado.
