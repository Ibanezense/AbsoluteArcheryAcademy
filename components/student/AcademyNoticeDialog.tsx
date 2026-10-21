'use client'

import { useEffect, useId, useRef } from 'react'
import { BellRing, CalendarClock, ChevronRight, X } from 'lucide-react'
import { useDialogFocus } from '@/lib/hooks/useDialogFocus'

type Props = { title: string; body: string; expired?: boolean; preview?: boolean; onClose: () => void; onRenew?: () => void }

export default function AcademyNoticeDialog({ title, body, expired = false, preview = false, onClose, onRenew }: Props) {
  const titleId = useId(), descriptionId = useId()
  const dialog = useRef<HTMLDivElement>(null)
  useDialogFocus(true, dialog)
  useEffect(() => {
    function escape(event: KeyboardEvent) { if (event.key === 'Escape') { event.preventDefault(); onClose() } }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [onClose])
  const Icon = expired ? CalendarClock : BellRing
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} className="relative flex max-h-[calc(100dvh-32px)] w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-white/15 bg-white shadow-2xl">
        <div className="relative shrink-0 overflow-hidden bg-[#101b28] px-7 pb-7 pt-8 text-white">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-12 h-56 w-56 rounded-full border-[24px] border-white/[0.04]" />
          <button type="button" onClick={onClose} aria-label="Cerrar notificación" className="absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-[#273441] text-white transition hover:bg-[#364655] focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-400"><X size={20} /></button>
          <span className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-300/25 bg-orange-400/15 text-orange-300"><Icon size={28} strokeWidth={1.7} /></span>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-orange-300">{preview ? 'Vista previa · Solo tú' : expired ? 'Es momento de volver' : 'Absolute Archery Academy'}</p>
          <h2 id={titleId} className="relative break-words pr-2 font-heading text-[27px] font-semibold leading-tight tracking-tight text-white">{title}</h2>
        </div>
        <div className="min-h-0 overflow-y-auto px-7 py-6">
          <p id={descriptionId} className="whitespace-pre-wrap break-words text-[15px] leading-7 text-slate-600">{body}</p>
          {expired && <p className="mt-4 rounded-xl bg-orange-50 p-3 text-xs leading-5 text-orange-900">Este recordatorio dejará de aparecer cuando tengas una membresía activa.</p>}
        </div>
        <div className="shrink-0 px-7 pb-7">
          <button type="button" onClick={expired && onRenew ? onRenew : onClose} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-orange-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500">{expired ? 'Renovar membresía' : 'Entendido'}<ChevronRight size={17} /></button>
          {expired && <button type="button" onClick={onClose} className="mt-2 min-h-11 w-full rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50">Ahora no</button>}
        </div>
      </div>
    </div>
  )
}
