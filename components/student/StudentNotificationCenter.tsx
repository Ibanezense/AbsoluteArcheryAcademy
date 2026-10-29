"use client"

import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { useBirthdayFreshness } from '@/lib/hooks/useBirthdayFreshness'
import { getPreparedStudentNotificationFeed, getStudentNotificationFeed, notificationRpc } from '@/lib/services/academyNotificationService'
import { dismissStudentBirthday } from '@/lib/services/studentBirthdayService'
import type { StudentBirthdayNotice } from '@/lib/contracts/studentBirthday'
import { nextStudentNotice } from '@/lib/utils/academyNotifications'
import { openMembershipRenewalPrompt } from '@/lib/utils/membershipRenewal'
import AcademyNoticeDialog from './AcademyNoticeDialog'
import MembershipRenewalPrompt from '@/components/MembershipRenewalPrompt'

type PendingBirthday = {
  studentId: string
  scope: string
  notice: StudentBirthdayNotice
  attempts: number
  timer?: ReturnType<typeof setTimeout>
  running?: boolean
}

export default function StudentNotificationCenter() {
  const { account, activeStudentId, loading } = useStudentContext()
  const [opening, setOpening] = useState(0)
  const [closedExpirations, setClosedExpirations] = useState<string[]>([])
  const [closedNotices, setClosedNotices] = useState<string[]>([])
  const [closedBirthdays, setClosedBirthdays] = useState<string[]>([])
  const [renewalOpen, setRenewalOpen] = useState(false)
  const [openingNotices, setOpeningNotices] = useState<{ scope: string; ids: string[] } | null>(null)
  const pending = useRef(new Map<string, PendingBirthday>())
  const mounted = useRef(true)
  const allowed = !loading && !!account && account.role !== 'admin' && !!activeStudentId
  const scope = `${account?.id}:${activeStudentId}`
  const currentScope = useRef(scope)
  currentScope.current = scope
  const openingScope = `${scope}:${opening}`
  const feed = useQuery({
    queryKey: ['student-notifications', account?.id, activeStudentId, opening],
    queryFn: () => getPreparedStudentNotificationFeed(supabase, activeStudentId!),
    enabled: allowed, staleTime: 0, gcTime: 0, retry: 1,
    refetchOnWindowFocus: true, refetchInterval: 30000,
  })
  const refetch = useRef(feed.refetch)
  refetch.current = feed.refetch
  const birthdayFresh = useBirthdayFreshness(scope, feed.data?.birthday_snapshot, () => { void refetch.current() })
  useEffect(() => {
    if (!feed.data) return
    setOpeningNotices(previous => previous?.scope === openingScope ? previous : { scope: openingScope, ids: feed.data.notices.map(item => item.id) })
  }, [feed.data, openingScope])
  const attemptBirthday = useRef<(key: string, revalidate: boolean) => Promise<void>>(async () => {})
  attemptBirthday.current = async (key, revalidate) => {
    const item = pending.current.get(key)
    if (!item || item.running || item.scope !== currentScope.current || !mounted.current) return
    item.running = true
    try {
      if (revalidate) {
        const latest = await getStudentNotificationFeed(supabase, item.studentId)
        if (item.scope !== currentScope.current || !mounted.current) return
        if (!latest.birthday || latest.birthday.id !== item.notice.id || latest.birthday.celebration_on !== item.notice.celebration_on) {
          pending.current.delete(key)
          return
        }
      }
      await dismissStudentBirthday(supabase, item.studentId, item.notice)
      pending.current.delete(key)
      if (item.scope === currentScope.current && mounted.current) void refetch.current()
    } catch (error) {
      const failure = error as { code?: string; message?: string }
      if (failure.code === '42501' || failure.code === '22023' || failure.message?.includes('BIRTHDAY_NOT_CURRENT')) {
        pending.current.delete(key)
        return
      }
      const delay = [1000, 5000, 15000][item.attempts++]
      if (delay !== undefined && mounted.current) {
        item.timer = setTimeout(() => { void attemptBirthday.current(key, true) }, delay)
      }
    } finally {
      item.running = false
    }
  }
  useEffect(() => {
    mounted.current = true
    const pendingItems = pending.current
    let hidden = document.visibilityState === 'hidden'
    function retryPending() {
      for (const [key, item] of pending.current) {
        if (item.scope === currentScope.current) {
          clearTimeout(item.timer)
          void attemptBirthday.current(key, true)
        }
      }
    }
    function visibility() {
      if (document.visibilityState === 'hidden') hidden = true
      else if (hidden) { hidden = false; setOpening(value => value + 1); retryPending() }
    }
    function pageRestored(event: PageTransitionEvent) { if (event.persisted) {setOpening(value => value + 1); retryPending()} }
    function online() { retryPending(); void refetch.current() }
    function focus() { void refetch.current() }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pageshow', pageRestored)
    window.addEventListener('online', online)
    window.addEventListener('focus', focus)
    return () => {
      mounted.current = false
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('pageshow', pageRestored)
      window.removeEventListener('online', online)
      window.removeEventListener('focus', focus)
      for (const item of pendingItems.values()) clearTimeout(item.timer)
    }
  }, [])
  const openingReady = openingNotices?.scope === openingScope
  const openingFeed = feed.data && openingReady ? {
    ...feed.data,
    birthday: birthdayFresh ? feed.data.birthday : null,
    notices: feed.data.notices.filter(item => openingNotices.ids.includes(item.id)),
  } : undefined
  const notice = allowed && !feed.error ? nextStudentNotice(openingFeed, closedExpirations,
    closedNotices.filter(key => key.startsWith(`${openingScope}:`)).map(key => key.slice(openingScope.length + 1)), openingScope,
    closedBirthdays.filter(key => key.startsWith(`${scope}:`)).map(key => key.slice(scope.length + 1))) : null
  function closeNotice() {
    if (!notice || !activeStudentId) return
    if (notice.kind === 'expired') setClosedExpirations(previous => [...previous, notice.key])
    else if (notice.kind === 'birthday') {
      const key = `${scope}:${notice.key}`
      setClosedBirthdays(previous => previous.includes(key) ? previous : [...previous, key])
      if (!pending.current.has(key)) {
        pending.current.set(key, { studentId: activeStudentId, scope, notice, attempts: 0 })
        void attemptBirthday.current(key, false)
      }
    } else {
      setClosedNotices(previous => [...previous, `${openingScope}:${notice.id}`])
      // Closing remains possible offline; failed persistence is retried by showing the notice on the next opening.
      void notificationRpc(supabase, 'dismiss_academy_notification', { p_student_id: activeStudentId, p_notification_id: notice.id }).then(() => feed.refetch()).catch(() => undefined)
    }
  }
  return <>
    {notice && !renewalOpen && <AcademyNoticeDialog title={notice.title} body={notice.body} actionLabel={notice.kind === 'birthday' ? 'Gracias' : undefined} expired={notice.kind === 'expired'} onClose={closeNotice} onRenew={() => { closeNotice(); setRenewalOpen(true); openMembershipRenewalPrompt() }} />}
    <MembershipRenewalPrompt suppressAutomatic={!!notice || (allowed && (feed.isLoading || (!!feed.data && !openingReady)))} onOpenChange={setRenewalOpen} />
  </>
}
