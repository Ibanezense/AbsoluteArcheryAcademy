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
  const data = await notificationRpc(client, 'get_student_notification_feed', { p_student_id: studentId }) as StudentNotificationFeed | null
  if (!data || !Array.isArray(data.notices) || typeof data.membership?.expired !== 'boolean' || typeof data.membership?.state_key !== 'string'
    || !data.notices.every(n => n && typeof n.id === 'string' && typeof n.title === 'string' && typeof n.body === 'string')) {
    throw new Error('No se pudieron leer los avisos de la academia.')
  }
  return data
}
