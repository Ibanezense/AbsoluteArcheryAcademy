# Consulta administrativa de progreso y búsqueda de competencias

Diseño aprobado por el usuario el 20/10/2026.

**Objetivo:** consultar el mismo progreso del alumno desde su ficha administrativa y encontrar candidatos de Tournament Engine sin depender del orden del nombre ni de sus tildes.

**Arquitectura:** añadir una pestaña Progreso en la ficha, con una consulta por alumno explícito y los componentes existentes de controles y competencias. Reutilizar las API privadas y su autorización normal; no suplantar al alumno ni introducir claves de servicio. Los vínculos conservan su gestión actual y confirmación humana. En TE, buscar todas las palabras de la consulta sobre el nombre normalizado, manteniendo el límite, los filtros de publicación vigente y participación individual.

**Tecnologías:** Next.js, React Query, Supabase, libSQL y pruebas Vitest/Node existentes.

## 1. Pruebas antes del cambio

- `tests/app/adminStudentProgress.test.ts`: vista administrativa con el alumno explícito, mismas fuentes, aislamiento de caché y ausencia de acciones de vinculación en el visor.
- `lib/server/studentProgress/auth.test.ts`: acceso de administrador activo mediante JWT normal y rechazo de administrador inactivo; conservar casos de alumno y tutor no autorizados.
- `D:/Tournament Engine/tests/integration/academy-identity.test.mjs`: candidato publicado individual encontrado con nombres en orden inverso, mayúsculas/minúsculas, tildes y consulta parcial; exclusión de borradores/equipos y ausencia de escrituras durante búsqueda.
- Ejecutar primero los casos nuevos y comprobar el fallo correspondiente.

## 2. Implementación

- Crear `components/admin/AdminStudentProgress.tsx`: selección Controles/Competencias, consulta usando `studentId` de la ficha y `accountId` del administrador; limpiar datos ante error/cambio de sujeto y montar solo la fuente visible.
- Modificar `app/admin/alumnos/[id]/page.tsx`: pestaña Progreso visible con la funcionalidad habilitada, componente con clave por alumno. Mantener gestión de vínculos en Perfil.
- Modificar `D:/Tournament Engine/src/infrastructure/queries/academy-identity.mjs`: normalizar consulta y expresión SQL, comparar cada palabra con parámetros enlazados; nunca confirmar identidades por similitud.
- No modificar resultados deportivos, alumnos, vínculos ni migraciones.

## 3. Verificación y publicación

- Ejecutar pruebas dirigidas y suite PWA, lint/tipos y compilación. Revisar accesibilidad, cambio de alumno y estados sin vínculo/error.
- Recuperar la entrega TE aislada de la última publicación y aplicar solo el cambio de búsqueda y sus pruebas; ejecutar pruebas TE completas y comprobar búsqueda real del candidato conocido.
- Publicar las correcciones dentro de la autorización de la entrega en curso; comprobar administrador y alumno en navegador. Conservar evidencia privada sin credenciales y documentar límites de verificación.

No vincular el registro de Alejandro automáticamente. La identidad debe revisarse y confirmarse en el flujo administrativo.
