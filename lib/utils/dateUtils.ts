/**
 * Formato de hora HH:MM desde ISO string
 */
export function formatTime(dateISO: string): string {
  const d = new Date(dateISO)
  return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

/**
 * Formato de fecha y hora completo
 */
export function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('es-ES', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Formato de fecha simple DD/MM/YYYY
 */
export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
}

/**
 * Convierte Date a string local YYYY-MM-DD
 */
export function toLocalYMD(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Convierte un string YYYY-MM-DD de input date a formato que PostgreSQL 
 * interprete correctamente como date (sin conversión de zona horaria)
 * Esto previene el problema de que PostgreSQL reste/sume un día
 */
export function toPostgresDate(dateString: string): string {
  // Si está vacío, retornar vacío
  if (!dateString) return ''
  
  // Asegurarnos de que el formato sea YYYY-MM-DD
  // Si viene de un input type="date", ya está en este formato
  // Simplemente lo retornamos tal cual para que PostgreSQL lo interprete como date
  return dateString
}

/**
 * Convierte una fecha que viene de Supabase (puede ser Date, ISO string, o YYYY-MM-DD)
 * a formato YYYY-MM-DD para usar en inputs type="date"
 * 
 * Problema: Supabase devuelve fechas tipo 'date' de PostgreSQL como strings,
 * pero pueden venir con timestamp "2025-10-24T00:00:00Z" lo que causa que
 * JavaScript las interprete en zona horaria local y se reste/sume un día.
 */
export function parseDateFromSupabase(value: string | Date | null | undefined): string {
  if (!value) return ''
  
  // Si ya es un string en formato YYYY-MM-DD (sin hora), retornarlo
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value
  }
  
  // Si viene con timestamp o es un objeto Date
  let dateObj: Date
  if (typeof value === 'string') {
    // Parse la fecha SIN usar el constructor Date() que interpreta timezone
    // Extraer año, mes, día manualmente
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) {
      const [, year, month, day] = match
      return `${year}-${month}-${day}`
    }
    // Si no coincide el patrón, intentar parsear normalmente
    dateObj = new Date(value)
  } else {
    dateObj = value
  }
  
  // Convertir a YYYY-MM-DD usando la fecha local (no UTC)
  const year = dateObj.getFullYear()
  const month = String(dateObj.getMonth() + 1).padStart(2, '0')
  const day = String(dateObj.getDate()).padStart(2, '0')
  
  return `${year}-${month}-${day}`
}

/**
 * Parsea YYYY-MM-DD string a Date local (sin timezone issues)
 */
export function parseLocalYMD(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/**
 * Inicio del día en ISO string (medianoche local)
 */
export function startOfDayISO(d: Date = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
  return x.toISOString()
}

/**
 * Fin del día en ISO string (23:59:59.999 local)
 */
export function endOfDayISO(d: Date = new Date()): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
  return x.toISOString()
}

/**
 * Verifica si una fecha es hoy
 */
export function isToday(date: Date): boolean {
  const today = new Date()
  return date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
}

/**
 * Verifica si una fecha es en el futuro
 */
export function isFuture(dateISO: string): boolean {
  return new Date(dateISO) > new Date()
}

/**
 * Verifica si una fecha es en el pasado
 */
export function isPast(dateISO: string): boolean {
  return new Date(dateISO) < new Date()
}

/**
 * Formatea una fecha YYYY-MM-DD (date de PostgreSQL) sin problemas de timezone
 * Uso: Para mostrar membership_start, membership_end, etc.
 */
export function formatDateOnly(dateString: string | null | undefined): string {
  if (!dateString) return ''
  
  // Si es YYYY-MM-DD, parsear manualmente sin timezone
  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (match) {
    const [, year, month, day] = match
    // Crear fecha local sin conversión de timezone
    const date = new Date(Number(year), Number(month) - 1, Number(day))
    return date.toLocaleDateString('es', { 
      day: 'numeric', 
      month: 'short', 
      year: 'numeric' 
    })
  }
  
  // Fallback para otros formatos
  return new Date(dateString).toLocaleDateString('es', { 
    day: 'numeric', 
    month: 'short', 
    year: 'numeric' 
  })
}

/**
 * Convierte un ISO timestamp de Supabase a formato datetime-local para input
 * Ejemplo: "2025-11-01T16:00:00+00:00" → "2025-11-01T11:00" (si estás en UTC-5)
 */
export function toLocalDateTimeInput(isoString: string): string {
  const d = new Date(isoString)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

/**
 * Convierte un datetime-local de input a ISO string para Supabase
 * Ejemplo: "2025-11-01T11:00" → "2025-11-01T16:00:00.000Z" (si estás en UTC-5)
 * Preserva la hora local del usuario al convertir a UTC
 */
export function fromLocalDateTimeInput(localString: string): string {
  // El input datetime-local da formato "YYYY-MM-DDTHH:mm"
  // Agregamos segundos y creamos Date que interpreta como hora local
  const d = new Date(localString + ':00')
  return d.toISOString()
}
