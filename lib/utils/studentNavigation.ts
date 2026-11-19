export type StudentTab =
  | 'inicio'
  | 'reservas'
  | 'progreso'
  | 'membresias'
  | 'perfil'

export function getStudentTab(pathname: string): StudentTab | null {
  if (pathname.startsWith('/mi-progreso')) return 'progreso'
  if (pathname.startsWith('/perfil')) return 'perfil'
  if (pathname.startsWith('/mis-reservas') || pathname.startsWith('/reserva/') || pathname === '/reservar')
    return 'reservas'
  if (pathname.startsWith('/membresias')) return 'membresias'
  return 'inicio'
}
