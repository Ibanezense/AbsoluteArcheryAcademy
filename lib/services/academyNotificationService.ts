import { birthdayDeadline, isBirthdayCalendar, isStudentBirthdayNotice } from '@/lib/contracts/studentBirthday'
import { prepareStudentBirthdayDay } from './studentBirthdayService'
import { validateNotification, type NotificationInput, type StudentNotificationFeed } from '@/lib/utils/academyNotifications'

type RpcClient = { rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }> }
export type AdminAcademyNotice = {
  id: string; title: string; body: string; audience: 'all' | 'selected'
  status: 'draft' | 'published' | 'inactive'; expires_at: string | null
  created_at: string; published_at: string | null; recipient_count: number; closed_count: number
}
export async function notificationRpc(client: RpcClient, name: string, args?: Record<string, unknown>) {
  const { data, error } = await client.rpc(name, args)
  if (error) throw new Error(error.message || 'No se pudo completar la operación.')
  return data
}
export async function createAcademyNotification(client: RpcClient, input: NotificationInput, publish: boolean) {
  const notice = validateNotification(input)
  return notificationRpc(client, 'admin_create_academy_notification', {
    p_title: notice.title, p_body: notice.body, p_audience: notice.audience,
    p_student_ids: notice.studentIds, p_expires_at: notice.expiresAt, p_publish: publish,
  })
}
export async function getStudentNotificationFeed(client: RpcClient, studentId: string): Promise<StudentNotificationFeed> {
  const requestStartedAt = performance.now()
  const data = await notificationRpc(client, 'get_student_notification_feed', { p_student_id: studentId }) as StudentNotificationFeed | null
  if (!data || !Array.isArray(data.notices) || typeof data.membership?.expired !== 'boolean' || typeof data.membership?.state_key !== 'string'
    || !data.notices.every(n => n && typeof n.id === 'string' && typeof n.title === 'string' && typeof n.body === 'string')) {
    throw new Error('No se pudieron leer los avisos de la academia.')
  }
  // Optional birthday data fails closed without suppressing existing notices.
  if (data.birthday_version === 1 && typeof data.birthday_ready === 'boolean' && isBirthdayCalendar(data.calendar)
    && (data.birthday === null || isStudentBirthdayNotice(data.birthday, data.calendar, studentId))) {
    return { ...data, birthday_snapshot: { received_at_monotonic: performance.now(), request_started_at_monotonic: requestStartedAt, deadline_monotonic: birthdayDeadline(data.calendar, requestStartedAt) } }
  }
  return { notices: data.notices, membership: data.membership }
}

export async function getPreparedStudentNotificationFeed(client: RpcClient, studentId: string): Promise<StudentNotificationFeed> {
  // Preparation is explicit; the feed reader remains STABLE. Older schemas still deliver manual notices.
  let ready = false
  try { ready = (await prepareStudentBirthdayDay(client, studentId)).ready } catch { /* birthday unavailable */ }
  const feed = await getStudentNotificationFeed(client, studentId)
  return ready ? feed : { ...feed, birthday_ready: false, birthday: null }
}
