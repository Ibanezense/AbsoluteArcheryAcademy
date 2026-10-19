import { shiftDate } from './introCalendar'

export function followUpWindow(mode: string | null, today: string) {
  const type = mode === 'trial' ? 'trial' : 'no_show'
  return {
    type,
    from: shiftDate(today, type === 'trial' ? -30 : -14),
    to: type === 'trial' ? today : shiftDate(today, 1),
    statuses: type === 'trial' ? ['reserved', 'attended', 'no_show'] : ['no_show'],
    title: type === 'trial' ? 'Pruebas pasadas' : 'Inasistencias recientes',
  }
}
