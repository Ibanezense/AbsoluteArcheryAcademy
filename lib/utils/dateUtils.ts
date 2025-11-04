// Contenido para: lib/utils/dateUtils.ts

import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import 'dayjs/locale/es' // Importar el idioma español

// --- CONFIGURACIÓN CRÍTICA ---
// Extender dayjs con los plugins
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.extend(localizedFormat)

// Establecer el idioma español globalmente
dayjs.locale('es') 

// Establecer la zona horaria por defecto para toda la app
// (Esto asegura que "dayjs()" siempre signifique "ahora en Arequipa")
dayjs.tz.setDefault("America/Lima");
// ------------------------------


/**
 * Formatea una fecha (string) al formato DD/MM/YYYY.
 * Devuelve '—' si la fecha es nula o inválida.
 */
export function formatDateOnly(dateString: string | null | undefined): string {
  if (!dateString) {
    return '—'
  }
  
  const date = dayjs(dateString)
  if (!date.isValid()) {
    return '—'
  }
  
  // Usamos el .tz() para asegurar que interprete la fecha en la zona horaria local
  return date.tz().format('DD/MM/YYYY')
}

/**
 * Parsea una fecha desde Supabase (que puede venir en formato ISO o date)
 * y la convierte a formato YYYY-MM-DD para uso en inputs de tipo date.
 * Devuelve cadena vacía si la fecha es nula o inválida.
 */
export function parseDateFromSupabase(dateString: string | null | undefined): string {
  if (!dateString) {
    return ''
  }
  
  const date = dayjs(dateString)
  if (!date.isValid()) {
    return ''
  }
  
  return date.format('YYYY-MM-DD')
}

/**
 * Formatea una hora desde un timestamp o fecha ISO al formato HH:mm
 */
export function formatTime(dateString: string | null | undefined): string {
  if (!dateString) {
    return '—'
  }
  
  const date = dayjs(dateString)
  if (!date.isValid()) {
    return '—'
  }
  
  return date.format('HH:mm')
}

/**
 * Convierte una fecha a formato YYYY-MM-DD (local)
 */
export function toLocalYMD(date: Date | string): string {
  return dayjs(date).format('YYYY-MM-DD')
}

/**
 * Parsea una fecha en formato YYYY-MM-DD y retorna un objeto Date
 */
export function parseLocalYMD(ymd: string): Date {
  return dayjs(ymd).toDate()
}

/**
 * Obtiene el inicio del día en formato ISO para una fecha dada
 */
export function startOfDayISO(date: Date | string): string {
  return dayjs(date).startOf('day').toISOString()
}

/**
 * Obtiene el final del día en formato ISO para una fecha dada
 */
export function endOfDayISO(date: Date | string): string {
  return dayjs(date).endOf('day').toISOString()
}

/**
 * Convierte un datetime local a formato para input datetime-local (YYYY-MM-DDTHH:mm)
 */
export function toLocalDateTimeInput(dateString: string | null | undefined): string {
  if (!dateString) {
    return ''
  }
  
  const date = dayjs(dateString)
  if (!date.isValid()) {
    return ''
  }
  
  return date.format('YYYY-MM-DDTHH:mm')
}

/**
 * Convierte un valor de input datetime-local a formato ISO
 */
export function fromLocalDateTimeInput(datetimeLocal: string): string {
  if (!datetimeLocal) {
    return ''
  }
  
  return dayjs(datetimeLocal).toISOString()
}
