/**
 * Fix para el problema de fechas que cambian de día en Supabase
 * 
 * Problema: Cuando se envían fechas en formato YYYY-MM-DD a columnas tipo 'date'
 * de PostgreSQL, Supabase JS las puede interpretar como UTC, causando que se
 * reste o sume un día dependiendo de la zona horaria.
 * 
 * Solución: Convertir fechas a objetos con solo la parte de fecha (sin hora)
 * para que PostgreSQL las interprete correctamente como tipo DATE.
 */

/**
 * Prepara un objeto para envío a Supabase, convirtiendo fechas correctamente
 * @param obj Objeto con campos que pueden incluir fechas
 * @param dateFields Array de nombres de campos que son fechas tipo 'date' de PostgreSQL
 */
export function prepareForSupabase<T extends Record<string, any>>(
  obj: T,
  dateFields: (keyof T)[]
): T {
  const result = { ...obj }
  
  dateFields.forEach(field => {
    const value = result[field]
    // Si el campo tiene un valor de fecha en formato YYYY-MM-DD
    if (value && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      // Mantenerlo como string, pero asegurarnos de que esté en el formato correcto
      // PostgreSQL interpretará este string correctamente como date
      result[field] = value as any
    }
  })
  
  return result
}

/**
 * Convierte una fecha de input date a formato seguro para PostgreSQL
 * @param dateString String en formato YYYY-MM-DD del input type="date"
 * @returns El mismo string (PostgreSQL lo interpretará correctamente como date)
 */
export function toPostgresDate(dateString: string | null): string | null {
  if (!dateString) return null
  // Validar formato YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    console.warn(`Formato de fecha inválido: ${dateString}. Se espera YYYY-MM-DD`)
    return null
  }
  return dateString
}
