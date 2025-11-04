/**
 * Normaliza un string removiendo acentos y convirtiéndolo a minúsculas.
 * Útil para búsquedas sin distinguir acentos.
 */
export function norm(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}
