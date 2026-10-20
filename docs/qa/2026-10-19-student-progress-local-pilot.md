# Controles: piloto local real

Fecha: 19 octubre 2026, America/Lima. Autorizar la migración y la conexión local no autoriza despliegues públicos. La confirmación de identidad se solicitó por separado y el usuario la dio expresamente antes de guardar el vínculo.

## Estado comprobado

- Migración aplicada con éxito en el proyecto Supabase de la academia. Versión real generada: `20261020033416`. Archivo local alineado con esa versión; mismo SQL revisado y probado.
- RLS habilitado en vínculos e historial. Las tres funciones nuevas tienen `search_path` fijado y ejecución anónima denegada. El aviso del asesor sobre ejecución autenticada de funciones definidoras corresponde al diseño intencional: comprueban perfil activo, acceso al alumno y rol administrador para mutaciones. No se añadió un permiso abierto por ese aviso.
- Conexión exclusiva entre PWA local y lector local de Controles. Token fuera de Git, nunca en variables públicas ni URLs. Ambos servidores escuchan exclusivamente en loopback: PWA puerto 3100 y lector puerto 3102.
- PWA activada solo en desarrollo del worktree mediante `.env.development.local`. El checkout original y las variables de publicación permanecen intactos.
- Lector sin credencial: 401, privado sin caché. Con credencial: 200 y contrato correcto, sin truncamiento.
- Antes de confirmar, la cuenta del alumno mostraba pendiente sin puntajes. Búsqueda y vista previa administrativas funcionaron sobre la fuente real.
- Una identidad confirmada por el usuario, un vínculo confirmado de revisión 1 y una entrada de auditoría. Actor administrativo y evidencia comprobados. No se vincularon las demás coincidencias.
- Navegador del alumno → API PWA → permisos/vínculo Supabase → lector privado → Controles: tres intentos reales contrastados individualmente con el origen.
- Dos controles a la distancia asignada, en formatos diferentes; el tercero histórico en otra distancia. Formatos separados, selección automática del único formato histórico disponible y resumen sin cambiar al explorar otra distancia.
- Entrada desde Inicio verificada; cuatro accesos inferiores conservados. Regreso a la sección con revalidación de acceso y sin duplicados. Sin errores de consola observados en el recorrido.

Las identidades, capturas y puntajes del piloto se conservan únicamente en la conversación y en `output/`, fuera del repositorio. El vínculo de negocio y su auditoría sí residen en las tablas autorizadas de Supabase; los puntajes permanecen en Controles.

## Comprobaciones posteriores a la migración

- Diez pruebas de referencia de migración y protección de destinos: aprobadas.
- Veintiséis comprobaciones SQL aisladas: aprobadas después de alinear el nombre del archivo.
- La suite completa de 891 pruebas, lint, tipos y compilación ya estaba aprobada para el código funcional desplegado localmente; esta activación cambió configuración privada y metadatos de migración, sin cambiar los cálculos.

Controles queda verificado para el piloto local. Competencias y la publicación pública de ambas entregas mantienen sus pasos y autorizaciones del plan.
