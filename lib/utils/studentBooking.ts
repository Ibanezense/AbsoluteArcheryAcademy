import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import 'dayjs/locale/es'
dayjs.extend(utc)
dayjs.extend(timezone)

export function limaBookingDate(value?: string | Date) {
  return dayjs(value).tz('America/Lima').locale('es')
}

export function bookingEligibilityMessage(reason: string, serverMessage?: string | null): string {
  const messages: Record<string, string> = {
    available: 'Puedes reservar este turno.', already_reserved: 'Ya reservaste este turno.',
    membership_dates: 'Necesitas renovar o contar con una membresía vigente para esta fecha.',
    weekly_limit: 'Ya alcanzaste el límite semanal de tu plan.',
    no_balance: 'No quedan clases disponibles: el saldo está utilizado o comprometido en otras reservas.',
    frozen: 'Tu membresía está congelada para esta fecha.',
    student_inactive: 'Tu cuenta no está habilitada para reservar. Consulta con la academia.',
    distance_missing: 'La academia debe configurar tu distancia antes de reservar.',
    cutoff: 'Las reservas cierran 2 horas antes del inicio de cada turno.',
    past: 'Este turno ya comenzó.', capacity: 'No quedan cupos o equipo compatible para este turno.',
  }
  return reason === 'capacity' && serverMessage ? serverMessage : messages[reason] || 'Este turno no está disponible para reservar.'
}

export function bookingModeLabel(mode: string | null): string {
  return ({ ownbow: 'Clase con arco propio', assigned: 'Clase con arco asignado', children: 'Clase infantil', youth: 'Clase juvenil', adult: 'Clase de adultos', flexible: 'Horario flexible', fixed: 'Horario fijo' } as Record<string, string>)[mode || ''] || 'Clase regular'
}

export function bookingConfirmationText(input: { fullName: string; locationName: string; locationAddress: string | null; startAt: string; endAt: string; creditKind: 'normal' | 'recovery' | null }): string {
  const start = limaBookingDate(input.startAt)
  return `${input.fullName}\n${start.format('dddd D [de] MMMM [de] YYYY')} · ${start.format('HH:mm')}–${limaBookingDate(input.endAt).format('HH:mm')}\n${input.locationName}${input.locationAddress ? ` · ${input.locationAddress}` : ''}\nCrédito: ${input.creditKind === 'recovery' ? 'recuperación existente' : 'clase de tu membresía'}.\nLa reserva compromete una clase; se descuenta al registrar tu asistencia.`
}

export function bookingCancellationLabel(source: string | null, resolution: string | null): string | null {
  if (resolution === 'no_show') return 'Inasistencia registrada en el historial'
  return ({ student: 'Cancelación del alumno', academy: 'Cancelación de academia', membership_freeze: 'Cancelación por congelamiento', day_end: 'Cancelación al cerrar el día: asistencia no registrada', membership_expiry: 'Cancelación por vencimiento de membresía' } as Record<string, string>)[source || ''] || null
}
