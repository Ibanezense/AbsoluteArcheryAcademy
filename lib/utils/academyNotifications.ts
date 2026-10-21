export type AcademyNotice = { id: string; title: string; body: string }
export type StudentNotificationFeed = {
  notices: AcademyNotice[]
  membership: { expired: boolean; state_key: string }
}
export type NotificationInput = {
  title: string; body: string; audience: 'all' | 'selected'; studentIds: string[]; endDate: string
}

export function notificationExpiry(date: string): string | null {
  if (!date) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Selecciona una fecha válida.')
  const parsed = new Date(`${date}T00:00:00.000Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('Selecciona una fecha válida.')
  return new Date(parsed.getTime() + 29 * 3600000).toISOString()
}

export function validateNotification(input: NotificationInput) {
  const title = input.title.trim(), body = input.body.trim()
  if (!title || title.length > 100) throw new Error('Escribe un título de hasta 100 caracteres.')
  if (!body || body.length > 2000) throw new Error('Escribe un mensaje de hasta 2000 caracteres.')
  if (!['all', 'selected'].includes(input.audience)) throw new Error('Selecciona los destinatarios.')
  const studentIds = [...new Set(input.studentIds)]
  if (input.audience === 'selected' && !studentIds.length) throw new Error('Selecciona al menos un alumno.')
  const expiresAt = notificationExpiry(input.endDate)
  return { title, body, audience: input.audience, studentIds: input.audience === 'all' ? [] : studentIds, expiresAt }
}

export function nextStudentNotice(feed: StudentNotificationFeed | undefined, dismissedExpirations: readonly string[], dismissedNotices: readonly string[], opening: string) {
  if (!feed) return null
  const key = `${opening}:${feed.membership.state_key}`
  if (feed.membership.expired && !dismissedExpirations.includes(key)) {
    return { kind: 'expired' as const, key, title: 'Tu membresía está vencida', body: 'Renueva tu membresía para continuar entrenando y reservar tus próximas clases.' }
  }
  const notice = feed.notices.find(item => !dismissedNotices.includes(item.id))
  return notice ? { ...notice, kind: 'announcement' as const, key: notice.id } : null
}
