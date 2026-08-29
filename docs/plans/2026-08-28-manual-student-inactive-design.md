# Estado inactivo manual del alumno

## Objetivo

Permitir que un administrador marque manualmente como inactivo a un alumno desde el menú `Acciones` de su perfil, sin deshabilitar su cuenta autenticada y sin que la sincronización automática lo devuelva a `Pausa`.

## Decisiones aprobadas

- `Inactivo` será un estado operativo persistido en `students.operational_status`.
- La acción no modificará `profiles.is_active`; el alumno conservará acceso a su cuenta.
- El alumno inactivo no tendrá disponibilidad para reservar bajo las reglas vigentes de membresía y saldo.
- El estado manual será protegido frente a `sync_student_membership_operational_status`.
- Desde el mismo menú se podrá retirar el estado manual. Al reactivar, el sistema recalculará el estado efectivo desde sus membresías; no regalará clases ni creará una membresía.
- La ficha y el listado se refrescarán mediante la clave compartida `studentKeys.all`, sin F5.

## Arquitectura

Una migración agregará `inactive` al contrato de estados operativos protegidos y expondrá un RPC `SECURITY DEFINER` exclusivamente administrativo. El RPC validará autenticación y rol, bloqueará la fila del alumno y cambiará únicamente campos operativos de `students`; no actualizará `profiles`.

El cliente encapsulará el RPC en un servicio validado. El menú `Acciones` mostrará `Marcar como inactivo` o `Quitar estado inactivo`, solicitará confirmación y, tras éxito, invalidará las consultas globales de alumnos y avisos de renovación.

## Seguridad y errores

- El RPC comprobará `auth.uid()` y `public.is_admin_user()`.
- Se revocará ejecución a `PUBLIC` y `anon`; solo `authenticated` y `service_role` podrán invocarlo.
- Un alumno inexistente producirá un error explícito.
- La UI evitará dobles envíos, mostrará toast de éxito/error y cerrará el menú al completar.

## Verificación

- Contrato SQL, permisos, estado protegido y no modificación de perfiles.
- Servicio: payload exacto, errores y respuesta válida.
- UI: ambas etiquetas, confirmación, bloqueo durante guardado e invalidación global.
- Suite completa, lint, TypeScript, build, consulta real en Supabase sin alterar alumnos y despliegue de `main` verificado en Vercel.
