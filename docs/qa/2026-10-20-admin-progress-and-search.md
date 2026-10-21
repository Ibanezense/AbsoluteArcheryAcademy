# Progreso administrativo y búsqueda de competencias

Corrección aprobada por el usuario el 20/10/2026.

## Causa y comportamiento

La ficha administrativa mostraba herramientas de vinculación, pero no un visor del progreso del alumno. Se añadió Progreso junto a Datos deportivos: consulta el alumno explícito de la ficha mediante las API privadas existentes y reutiliza los componentes de controles, gráfica, historial y competencias. La gestión de vínculos permanece en Perfil y tiene acceso directo desde el visor.

La búsqueda de Tournament Engine exigía una subcadena contigua con las mismas tildes. Un nombre almacenado como apellidos seguidos de nombres no aparecía al buscar nombres seguidos de apellidos. Se compara ahora cada palabra sin depender del orden, mayúsculas ni diacríticos españoles, incluidos los caracteres Unicode descompuestos de algunas importaciones. No se cambian los nombres originales ni se infieren identidades.

Los filtros siguen exigiendo una participación individual en una versión publicada y vigente. Los parámetros permanecen enlazados, los caracteres especiales de LIKE se escapan y la respuesta conserva el límite de 20 candidatos. El registro conocido del caso comunicado aparece con su identificador exacto; no se creó un vínculo.

## Verificación

- PWA: 991 pruebas en 182 archivos aprobadas; ESLint y compilación de producción, incluidos tipos, aprobados.
- Visor: rechazo de datos almacenados de otro alumno, sesión ausente y errores de consulta. Cuenta y alumno incluidos en las claves existentes. JWT normal; ningún permiso nuevo ni clave de servicio para la lectura.
- TE: 56 pruebas aprobadas en el paquete aislado de Vercel. Prueba roja/verde de orden y tildes; revisión detectó Unicode descompuesto y su regresión también se comprobó roja/verde. Casos de borrador, versión antigua, equipos, comodines literales y ausencia de escrituras durante búsqueda.
- Revisión independiente cerrada sin hallazgos materiales pendientes.
- Navegador con sesión administrativa iniciada por el usuario: pestaña Progreso visible y controles reales consultados, con las mismas marcas, distancia y fechas que ve el alumno. Cambio a Competencias comprobado: participación verificada, clasificación y medalla oficial coincidentes con la vista del alumno.
- Búsqueda comprobada en el paquete de Vercel y después en el dominio de producción, con nombre completo en orden habitual y sin tildes: devuelve el único candidato esperado.

La publicación TE se preparó sobre la entrega anterior aislada, sin añadir el resto del checkout original. Fuentes de publicación preservadas fuera del árbol de pruebas en `C:/Users/OMEN/.codex/release-artifacts/academy-2026-10-20/te`. Evidencia privada en `output/`; no versionar credenciales, imágenes ni datos personales. Sin migraciones, vínculos nuevos ni cambios de resultados deportivos.
