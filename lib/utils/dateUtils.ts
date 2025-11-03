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
