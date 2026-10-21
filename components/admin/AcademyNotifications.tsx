'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell, CalendarClock, Eye, Megaphone, Plus, Send, Users } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAuth } from '@/lib/hooks/useAuth'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { createAcademyNotification, notificationRpc, type AdminAcademyNotice } from '@/lib/services/academyNotificationService'
import { validateNotification, type NotificationInput } from '@/lib/utils/academyNotifications'
import AcademyNoticeDialog from '@/components/student/AcademyNoticeDialog'

const empty: NotificationInput = { title: '', body: '', audience: 'all', studentIds: [], endDate: '' }
const field = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500 focus:ring-2 focus:ring-orange-100 disabled:opacity-60'
const secondary = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'

function formatDate(value: string) { return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) }

export default function AcademyNotifications() {
  const { profile } = useAuth()
  const confirm = useConfirm()
  const [input, setInput] = useState<NotificationInput>(empty)
  const [search, setSearch] = useState('')
  const [preview, setPreview] = useState<{ title: string; body: string; expired?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const students = useQuery({
    queryKey: ['notification-recipient-options', profile?.id],
    enabled: profile?.role === 'admin' && input.audience === 'selected',
    queryFn: async () => {
      const { data, error } = await supabase.from('students').select('id,full_name').order('full_name')
      if (error) throw new Error('No se pudieron cargar los alumnos.')
      return (data || []) as { id: string; full_name: string }[]
    },
  })
  const query = useQuery({
    queryKey: ['admin-notifications', profile?.id],
    enabled: profile?.role === 'admin',
    queryFn: async () => {
      const result = await notificationRpc(supabase, 'admin_list_academy_notifications')
      if (!Array.isArray(result)) throw new Error('No se pudo leer la lista de avisos.')
      return result as AdminAcademyNotice[]
    }, retry: false,
  })
  const notices = query.data || []
  const activeCount = notices.filter(n => n.status === 'published' && (!n.expires_at || new Date(n.expires_at).getTime() > Date.now())).length
  const selectedNames = students.data?.filter(s => input.studentIds.includes(s.id)).map(s => s.full_name) || []
  function change<K extends keyof NotificationInput>(key: K, value: NotificationInput[K]) { setInput(previous => ({ ...previous, [key]: value })); setSuccess('') }
  function showPreview() {
    try { const valid = validateNotification(input); setError(''); setPreview(valid) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Revisa el aviso.') }
  }
  async function create(publish: boolean) {
    setError(''); setSuccess('')
    try {
      validateNotification(input)
      if (publish && !await confirm(`«${input.title.trim()}» aparecerá al abrir la app de ${input.audience === 'all' ? 'todos los alumnos' : `${input.studentIds.length} alumnos seleccionados`}.`, { title: 'Publicar notificación', confirmLabel: 'Publicar aviso', description: 'Cada alumno lo verá una sola vez. Podrás desactivarlo cuando lo necesites.' })) return
      setBusy(true)
      await createAcademyNotification(supabase, input, publish)
      setInput(empty); setSearch('')
      setSuccess(publish ? 'Aviso publicado. Se mostrará cuando los alumnos abran su app.' : 'Borrador guardado. Todavía no es visible para los alumnos.')
      await query.refetch()
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo guardar el aviso.') }
    finally { setBusy(false) }
  }
  async function status(notice: AdminAcademyNotice, next: 'published' | 'inactive') {
    if (!await confirm(next === 'published' ? `Publicar «${notice.title}» para ${notice.audience === 'all' ? 'todos los alumnos' : `${notice.recipient_count} alumnos seleccionados`}.` : `«${notice.title}» dejará de aparecer para los alumnos.`, { title: next === 'published' ? 'Publicar aviso' : 'Desactivar aviso', confirmLabel: next === 'published' ? 'Publicar' : 'Desactivar' })) return
    setBusy(true); setError(''); setSuccess('')
    try {
      await notificationRpc(supabase, 'admin_set_academy_notification_status', { p_notification_id: notice.id, p_status: next })
      await query.refetch()
      setSuccess(next === 'published' ? 'Aviso publicado.' : 'Aviso desactivado.')
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo cambiar el aviso.') }
    finally { setBusy(false) }
  }
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-700">Comunicación con alumnos</p><h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-slate-900">Notificaciones</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Avisos que aparecen al abrir la app. Informa novedades y acompaña a tus alumnos en su regreso a entrenar.</p></div>
      <span className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"><Bell size={16} className="text-orange-600" />{activeCount} avisos vigentes</span>
    </div>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {success && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{success}</div>}
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,1fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
        <div className="mb-6 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-orange-50 text-orange-700"><Plus size={22} /></span><div><h2 className="text-lg font-semibold text-slate-900">Crear un aviso</h2><p className="text-xs text-slate-500">Revisa cómo se verá antes de publicarlo.</p></div></div>
        <form onSubmit={event => { event.preventDefault(); void create(true) }} className="space-y-5">
          <label className="block space-y-2 text-sm font-semibold text-slate-700"><span>Título</span><input className={field} value={input.title} maxLength={100} onChange={e => change('title', e.target.value)} placeholder="Por ejemplo: Entrenamiento especial este sábado" required /></label>
          <label className="block space-y-2 text-sm font-semibold text-slate-700"><span>Mensaje</span><textarea className={`${field} min-h-36 resize-y font-normal leading-6`} value={input.body} maxLength={2000} onChange={e => change('body', e.target.value)} placeholder="Escribe lo que tus alumnos necesitan saber…" required /><span className="block text-right text-xs font-normal text-slate-400">{input.body.length} / 2000</span></label>
          <fieldset><legend className="mb-2 text-sm font-semibold text-slate-700">Destinatarios</legend><div className="grid gap-2 sm:grid-cols-2">{(['all', 'selected'] as const).map(audience => <label key={audience} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm ${input.audience === audience ? 'border-orange-300 bg-orange-50 text-orange-900' : 'border-slate-200 text-slate-600'}`}><input type="radio" name="audience" value={audience} checked={input.audience === audience} onChange={() => change('audience', audience)} className="accent-orange-600" />{audience === 'all' ? 'Todos los alumnos' : 'Alumnos seleccionados'}</label>)}</div></fieldset>
          {input.audience === 'selected' && <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <label className="block text-xs font-semibold text-slate-600" htmlFor="notice-student-search">Buscar por nombre o apellido</label><input id="notice-student-search" className={field} value={search} onChange={e => setSearch(e.target.value)} />
            {students.isLoading ? <p className="text-sm text-slate-500">Cargando alumnos…</p> : students.error ? <p role="alert" className="text-sm text-red-700">No se pudieron cargar los alumnos. <button type="button" onClick={() => void students.refetch()} className="underline">Reintentar</button></p> : <div className="max-h-52 overflow-y-auto">{students.data?.filter(s => s.full_name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(search.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())).map(student => <label key={student.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg p-2 text-sm text-slate-700 hover:bg-slate-50"><input type="checkbox" className="accent-orange-600" checked={input.studentIds.includes(student.id)} onChange={event => change('studentIds', event.target.checked ? [...input.studentIds, student.id] : input.studentIds.filter(id => id !== student.id))} />{student.full_name}</label>)}</div>}
            <p className="text-xs leading-5 text-slate-500">{selectedNames.length ? `Seleccionados: ${selectedNames.join(', ')}` : 'Selecciona al menos un alumno.'}</p>
          </div>}
          <label className="block space-y-2 text-sm font-semibold text-slate-700"><span>Mostrar hasta <span className="font-normal text-slate-400">· Opcional</span></span><input type="date" className={field} value={input.endDate} onChange={e => change('endDate', e.target.value)} /><span className="block text-xs font-normal leading-5 text-slate-500">Incluye todo ese día, según la hora de Perú. Sin fecha, seguirá vigente hasta que lo desactives.</span></label>
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-5"><button type="button" className={secondary} onClick={showPreview}><Eye size={17} />Vista previa</button><button type="button" disabled={busy || !!query.error || query.isLoading} className={secondary} onClick={() => void create(false)}>Guardar borrador</button><button type="submit" disabled={busy || !!query.error || query.isLoading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-2 text-sm font-bold text-white hover:bg-orange-700 disabled:opacity-50"><Send size={16} />{busy ? 'Guardando…' : 'Publicar aviso'}</button></div>
        </form>
      </section>
      <div className="space-y-5">
        <section className="overflow-hidden rounded-2xl bg-[#101b28] p-6 text-white"><div className="mb-4 flex items-center justify-between"><CalendarClock className="text-orange-300" size={25} /><span className="rounded-full bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold text-emerald-300">Automático</span></div><h2 className="font-heading text-lg font-semibold text-white">Membresía vencida</h2><p className="mt-2 text-sm leading-6 text-slate-300">Recuerda renovar en cada apertura. El alumno puede cerrarlo y seguir usando su app. Desaparece cuando tiene una membresía activa.</p><button type="button" className="mt-4 flex min-h-11 items-center gap-2 text-sm font-semibold text-orange-300 hover:text-orange-200" onClick={() => setPreview({ title: 'Tu membresía está vencida', body: 'Renueva tu membresía para continuar entrenando y reservar tus próximas clases.', expired: true })}><Eye size={16} />Ver recordatorio</button></section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="mb-4 flex items-center gap-2"><Megaphone size={19} className="text-orange-600" /><h2 className="text-lg font-semibold text-slate-900">Tus avisos</h2></div>
          {query.isLoading ? <p className="py-5 text-sm text-slate-500">Cargando avisos…</p> : query.error ? <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">No se pudo cargar el servicio de notificaciones. <button type="button" className="font-semibold underline" onClick={() => void query.refetch()}>Reintentar</button></div> : !notices.length ? <div className="rounded-xl border border-dashed border-slate-200 px-5 py-8 text-center"><Users size={28} className="mx-auto mb-3 text-slate-300" /><p className="text-sm font-semibold text-slate-700">Tu primer aviso empieza aquí</p><p className="mt-1 text-xs leading-5 text-slate-500">Crea un mensaje y revisa su vista previa.</p></div> : <div className="space-y-3">{notices.map(notice => {
            const ended = !!notice.expires_at && new Date(notice.expires_at).getTime() <= Date.now()
            const label = notice.status === 'draft' ? 'Borrador' : notice.status === 'inactive' ? 'Desactivado' : ended ? 'Finalizado' : 'Publicado'
            return <article key={notice.id} className="rounded-xl border border-slate-200 p-4"><div className="mb-2 flex items-start justify-between gap-3"><h3 className="break-words text-sm font-semibold leading-6 text-slate-900">{notice.title}</h3><span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${label === 'Publicado' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{label}</span></div><p className="line-clamp-2 whitespace-pre-wrap break-words text-xs leading-5 text-slate-500">{notice.body}</p><p className="mt-3 text-[11px] leading-5 text-slate-500">{notice.audience === 'all' ? 'Todos los alumnos' : `${notice.recipient_count} alumnos`} · {notice.closed_count} cerraron el aviso{notice.expires_at ? ` · Hasta ${formatDate(new Date(new Date(notice.expires_at).getTime() - 1).toISOString())}` : ''}</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className={secondary} onClick={() => setPreview(notice)}>Ver aviso</button>{notice.status === 'draft' && !ended && <button type="button" disabled={busy} className={secondary} onClick={() => void status(notice, 'published')}>Publicar</button>}{notice.status !== 'inactive' && <button type="button" disabled={busy} className="min-h-11 rounded-xl px-3 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50" onClick={() => void status(notice, 'inactive')}>Desactivar</button>}</div></article>
          })}</div>}
        </section>
      </div>
    </div>
    {preview && <AcademyNoticeDialog title={preview.title} body={preview.body} expired={preview.expired} preview onClose={() => setPreview(null)} />}
  </div>
}
