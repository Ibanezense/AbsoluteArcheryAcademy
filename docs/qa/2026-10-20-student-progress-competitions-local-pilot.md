# Competencias: piloto local real

Fecha: 20 octubre 2026, America/Lima. El usuario autorizó aplicar las dos migraciones y configurar la conexión local; después confirmó por separado un registro exacto y autorizó vincular únicamente ese ID. No se publicaron servicios ni se enlazaron las demás coincidencias.

## Activación y conservación

- Preflight Supabase: un vínculo de Controles confirmado, revisión 1, sin operaciones TE existentes. Respaldo privado de vínculos, auditoría, funciones e índices.
- Migración Supabase aplicada con versión real `20261020202314`; nombre local y referencias de runners alineados sin cambiar SQL. Tabla de operaciones con RLS. Ninguna función nueva es ejecutable por anon; el finalizador tampoco es ejecutable por authenticated y sí por service_role. Todas fijan search_path.
- Preflight TE: solo faltaba `0006_academy_identity`, sin conflictos de namespace ni discrepancias de checksum. Respaldo de metadatos, bridges e inventario antes del cambio.
- Se aplicó exclusivamente `0006_academy_identity`, mediante un directorio con esa única migración. Ninguna migración ajena entró en el lote. El token lector fue rechazado para escritura; se usó la conexión de migración existente, comprobando antes que apunta a la misma base.
- Tras migrar se conservaron los recuentos de versiones, torneos, competidores, participaciones, clasificaciones, resultados y rankings. Los bridges existentes permanecieron idénticos.
- Credenciales HTTP lector/identidad nuevas y distintas, guardadas fuera de Git. Ambas se rechazan en el canal contrario. El adaptador local expone únicamente las dos rutas academy y escucha en `127.0.0.1:3103`; no expone AS/AP. Conserva la conexión de lectura separada del canal de identidad.
- PWA habilitada únicamente en `.env.development.local` del worktree; checkout original y configuración pública sin cambios.

## Registro autorizado y recorrido real

Una decisión humana, un vínculo TE confirmado de revisión 1 y una operación completada sin error. Supabase conserva auditoría request/confirm y TE una confirmación aplicada de generación 1. Solo existe un bridge nuevo en `academy_reservas_student`; los tres de AS permanecen intactos.

La decisión se ejecutó por la API administrativa real, con sesión del administrador activo que había confirmado el piloto de Controles. Se usó el ingreso normal por código, sin atribuir permisos con service_role ni fabricar JWT. Las credenciales no se imprimieron; la sesión auxiliar se cerró solo en su propio ámbito y el archivo temporal se eliminó. El finalizador privado de servidor verificó el recibo TE antes de confirmar.

La sesión habitual del navegador conservaba recursos de la versión anterior. La comprobación final se realizó en una sesión limpia del mismo servidor local, con el código de acceso que el usuario había facilitado. No se alteraron perfiles del navegador, datos deportivos ni permisos para resolver esa caché. Queda pendiente reproducir el panel administrativo actualizado en la sesión habitual tras renovar sus recursos; la mutación por API sí quedó comprobada de extremo a extremo.

Navegador del alumno → API PWA → autorización/vínculo Supabase → lector privado TE: una participación publicada visible. Puntaje, flechas, distancia por segmentos, posición de clasificación y posición final coinciden con los registros canónicos consultados en lectura. El resultado conserva su estado oficial documentado. Las demás coincidencias por nombre no aparecen.

Al alternar a Controles, su distancia asignada, último control y mejores marcas permanecen iguales. La competencia histórica en otra distancia no cambia el resumen de entrenamiento. Antes de vincular se comprobó pendiente sin puntajes.

Identidades, puntuaciones, respuestas y capturas reales se conservan en la conversación y `output/progress-competitions-activation/`, fuera de Git. No se incluyen en este documento.

## Verificación posterior

- 36 comprobaciones SQL efímeras aprobadas después de alinear la versión real de migración.
- 20 pruebas de transporte, permisos, referencias y protección de destinos aprobadas.
- 12 pruebas de paneles administrativos aprobadas tras ajustar el texto para identificar ambas fuentes.
- La versión funcional previa ya tenía 949 pruebas, lint, tipos, compilación y revisión independiente aprobados. Esta activación modifica configuración privada, referencia de versión y una descripción del panel.
- Asesor de seguridad ejecutado: en las funciones nuevas solo señala EXECUTE autenticado de funciones definidoras, intencional y protegido por actor/rol/contexto/lease. El finalizador de servidor mantiene ejecución autenticada y anónima denegadas. No se ampliaron permisos para eliminar avisos.

El piloto real de Competencias queda verificado para el único registro autorizado. La publicación pública y la incorporación de los demás registros requieren su autorización correspondiente.
