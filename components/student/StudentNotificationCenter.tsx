'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabaseClient'
import { useStudentContext } from '@/lib/hooks/useStudentContext'
import { getStudentNotificationFeed, notificationRpc } from '@/lib/services/academyNotificationService'
import { nextStudentNotice } from '@/lib/utils/academyNotifications'
import { openMembershipRenewalPrompt } from '@/lib/utils/membershipRenewal'
import AcademyNoticeDialog from './AcademyNoticeDialog'
import MembershipRenewalPrompt from '@/components/MembershipRenewalPrompt'

export default function StudentNotificationCenter() {
  const { account, activeStudentId, loading } = useStudentContext()
  const [opening, setOpening] = useState(0)
  const [closedExpirations, setClosedExpirations] = useState<string[]>([])
  const [closedNotices, setClosedNotices] = useState<string[]>([])
  const [renewalOpen, setRenewalOpen] = useState(false)
  const [openingNotices, setOpeningNotices] = useState<{ scope: string; ids: string[] } | null>(null)
  const allowed = !loading && !!account && account.role !== 'admin' && !!activeStudentId
  const scope = `${account?.id}:${activeStudentId}`
  const openingScope = `${scope}:${opening}`
  const feed = useQuery({
    queryKey: ['student-notifications', account?.id, activeStudentId, opening],
    queryFn: () => getStudentNotificationFeed(supabase, activeStudentId!),
    enabled: allowed, staleTime: 0, gcTime: 0, retry: 1,
    refetchOnWindowFocus: true, refetchInterval: 30000,
  })
  useEffect(() => {
    if (!feed.data) return
    setOpeningNotices(previous => previous?.scope === openingScope ? previous : { scope: openingScope, ids: feed.data.notices.map(item => item.id) })
  }, [feed.data, openingScope])
  useEffect(() => {
    let hidden = document.visibilityState === 'hidden'
    function visibility() {
      if (document.visibilityState === 'hidden') hidden = true
      else if (hidden) { hidden = false; setOpening(value => value + 1) }
    }
    function pageRestored(event: PageTransitionEvent) { if (event.persisted) setOpening(value => value + 1) }
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('pageshow', pageRestored)
    return () => { document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pageshow', pageRestored) }
  }, [])
  const openingReady = openingNotices?.scope === openingScope
  const openingFeed = feed.data && openingReady ? { ...feed.data, notices: feed.data.notices.filter(item => openingNotices.ids.includes(item.id)) } : undefined
  const notice = allowed && !feed.error ? nextStudentNotice(openingFeed, closedExpirations, closedNotices.filter(key => key.startsWith(`${openingScope}:`)).map(key => key.slice(openingScope.length + 1)), openingScope) : null
  function closeNotice() {
    if (!notice || !activeStudentId) return
    if (notice.kind === 'expired') setClosedExpirations(previous => [...previous, notice.key])
    else {
      setClosedNotices(previous => [...previous, `${openingScope}:${notice.id}`])
      // Closing remains possible offline; failed persistence is retried by showing the notice on the next opening.
      void notificationRpc(supabase, 'dismiss_academy_notification', { p_student_id: activeStudentId, p_notification_id: notice.id }).then(() => feed.refetch()).catch(() => undefined)
    }
  }
  return <>
    {notice && !renewalOpen && <AcademyNoticeDialog title={notice.title} body={notice.body} expired={notice.kind === 'expired'} onClose={closeNotice} onRenew={() => { closeNotice(); setRenewalOpen(true); openMembershipRenewalPrompt() }} />}
    <MembershipRenewalPrompt suppressAutomatic={!!notice || (allowed && (feed.isLoading || (!!feed.data && !openingReady)))} onOpenChange={setRenewalOpen} />
  </>
}
