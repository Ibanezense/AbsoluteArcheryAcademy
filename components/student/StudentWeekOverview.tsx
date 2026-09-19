'use client'

import { useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { CalendarDays, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { StudentCard, StudentNotice } from './StudentCard'

type WeekClass = {
  booking_id: string
  start_at: string
  end_at: string
  distance_m: number | null
  status: string
  booking_source: 'recurring_fixed' | 'flexible' | 'admin_replacement'
  credit_kind: 'normal' | 'recovery'
  location_name: string
  location_address: string | null
}

type WeekOverview = {
  weekly_target: number
  weekly_completed: number
  normal_classes_remaining: number
  recovery_classes_remaining: number
  pending_cancellations: number
  classes: WeekClass[]
}

function sourceLabel(item: WeekClass) {
  if (item.booking_source === 'recurring_fixed') return 'Horario fijo'
  if (item.credit_kind === 'recovery') return 'Recuperación'
  return 'Reserva flexible'
}

export function StudentWeekOverview({ studentId }: { studentId: string }) {
  const [overview, setOverview] = useState<WeekOverview | null>(null)

  useEffect(() => {
    let active = true
    const load = async () => {
      const { data, error } = await supabase.rpc('get_student_week_overview', {
        p_student_id: studentId,
        p_reference_date: dayjs().format('YYYY-MM-DD'),
      })
      if (active && !error) setOverview(data as WeekOverview)
    }
    void load()
    return () => { active = false }
  }, [studentId])

  if (!overview) return null

  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-black tracking-[-0.03em]">Mi semana</h2>
          <p className="text-xs text-textsec">{overview.weekly_completed} de {overview.weekly_target || '—'} clases programadas</p>
        </div>
        <p className="text-right text-xs font-bold text-textsec">
          {overview.normal_classes_remaining} normales · {overview.recovery_classes_remaining} recuperación
        </p>
      </div>

      {overview.pending_cancellations > 0 && (
        <StudentNotice>Cancelación pendiente de revisión: {overview.pending_cancellations}</StudentNotice>
      )}

      <StudentCard className="divide-y divide-line overflow-hidden">
        {overview.classes.length === 0 && (
          <div className="p-5 text-sm text-textsec">Todavía no tienes clases programadas esta semana.</div>
        )}
        {overview.classes.map((item) => (
          <div key={item.booking_id} className="flex gap-3 p-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-accent"><CalendarDays className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-black capitalize">{dayjs(item.start_at).format('ddd D MMM · HH:mm')}</p>
              <p className="mt-1 text-xs font-bold text-accent">{sourceLabel(item)}</p>
              <p className="mt-1 flex items-center gap-1 text-xs text-textsec">
                <MapPin className="h-3.5 w-3.5" /> {item.location_name}{item.location_address ? ` · ${item.location_address}` : ''}
              </p>
              <p className="mt-1 text-xs text-textsec">{item.distance_m ? `${item.distance_m} m · ` : ''}{item.credit_kind === 'recovery' ? 'Crédito de recuperación' : 'Clase normal'}</p>
            </div>
          </div>
        ))}
      </StudentCard>
    </section>
  )
}
