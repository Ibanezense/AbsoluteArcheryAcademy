export type StudentTab = 'inicio' | 'reservar' | 'reservas' | 'membresias'

export function getStudentTab(pathname: string): StudentTab | null {
  if (pathname.startsWith('/mi-progreso')) return null
  if (pathname.startsWith('/reservar')) return 'reservar'
  if (pathname.startsWith('/mis-reservas') || pathname.startsWith('/reserva/')) return 'reservas'
  if (pathname.startsWith('/membresias')) return 'membresias'
  return 'inicio'
}
