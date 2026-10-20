export type StudentTab =
  | 'inicio'
  | 'reservar'
  | 'reservas'
  | 'membresias'
  | 'perfil'

export function getStudentTab(pathname: string): StudentTab | null {
  if (pathname.startsWith('/mi-progreso') || pathname.startsWith('/perfil'))
    return 'perfil'
  if (pathname.startsWith('/reservar')) return 'reservar'
  if (pathname.startsWith('/mis-reservas') || pathname.startsWith('/reserva/'))
    return 'reservas'
  if (pathname.startsWith('/membresias')) return 'membresias'
  return 'inicio'
}
