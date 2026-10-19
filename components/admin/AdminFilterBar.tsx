'use client'

import { useId, useState, type ReactNode } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'

export function AdminFilterBar({ children, activeCount = 0, onClear, title = 'Filtros' }: {
  children: ReactNode; activeCount?: number; onClear?: () => void; title?: string;
}) {
  const [expanded, setExpanded] = useState(false)
  const contentId = useId()
  return (
    <section className="admin-filter-bar rounded-xl border border-slate-200 bg-white p-3 sm:p-4" aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <span className="hidden items-center gap-2 text-sm font-semibold text-slate-700 lg:inline-flex"><SlidersHorizontal className="h-4 w-4" />{title}{activeCount > 0 && <span className="rounded-md bg-orange-50 px-2 py-0.5 text-xs text-orange-800">{activeCount}</span>}</span>
        <button type="button" className="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-700 lg:hidden" aria-controls={contentId} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          <SlidersHorizontal className="h-4 w-4" />{title}
          {activeCount > 0 && <span className="rounded-md bg-orange-50 px-2 py-0.5 text-xs text-orange-800">{activeCount}</span>}
          <ChevronDown className={`h-4 w-4 transition lg:hidden ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {onClear && activeCount > 0 && <button type="button" onClick={onClear} className="min-h-11 px-2 text-sm font-medium text-slate-600 underline underline-offset-4">Limpiar</button>}
      </div>
      <div id={contentId} className={`${expanded ? 'grid' : 'hidden'} mt-3 gap-3 lg:grid`}>{children}</div>
    </section>
  )
}
