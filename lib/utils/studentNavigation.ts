export type StudentTab = 'inicio' | 'reservar' | 'reservas' | 'membresias'

export function getStudentTab(pathname: string): StudentTab {
  if (pathname.startsWith('/reservar')) return 'reservar'
  if (pathname.startsWith('/mis-reservas') || pathname.startsWith('/reserva/')) return 'reservas'
  if (pathname.startsWith('/membresias')) return 'membresias'
  return 'inicio'
}
