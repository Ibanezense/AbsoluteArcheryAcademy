'use client'

import type { ReactNode } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
} from 'recharts'

type Tone = 'orange' | 'green' | 'blue' | 'red' | 'amber' | 'purple' | 'teal' | 'slate'
type DonutDatum = {
  name: string
  value: number
  color: string
}

function toneClasses(tone: Tone) {
  switch (tone) {
    case 'green':
      return 'border-emerald-200 bg-emerald-50 text-emerald-600'
    case 'blue':
      return 'border-blue-200 bg-blue-50 text-blue-600'
    case 'red':
      return 'border-rose-200 bg-rose-50 text-rose-600'
    case 'amber':
      return 'border-amber-200 bg-amber-50 text-amber-600'
    case 'purple':
      return 'border-violet-200 bg-violet-50 text-violet-600'
    case 'teal':
      return 'border-teal-200 bg-teal-50 text-teal-600'
    case 'slate':
      return 'border-slate-200 bg-slate-50 text-slate-600'
    default:
      return 'border-orange-200 bg-orange-50 text-accent'
  }
}

export function adminTodayLabel() {
  return new Intl.DateTimeFormat('es-PE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Lima',
  }).format(new Date())
}

export function AdminPageHeader({
  title,
  description,
  eyebrow,
  actions,
}: {
  title: string
  description: string
  eyebrow?: string
  actions?: ReactNode
}) {
  return (
    <section className="border-b border-slate-200/80 pb-6">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold capitalize text-slate-500">{eyebrow || adminTodayLabel()}</p>
          <h1 className="mt-1 font-heading text-3xl font-black tracking-[-0.055em] text-slate-950 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-base text-slate-500">{description}</p>
        </div>
        {actions && <div className="flex flex-col gap-3 lg:flex-row lg:items-center">{actions}</div>}
      </div>
    </section>
  )
}

export function AdminContentPanel({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-[1.4rem] border border-slate-200/80 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.06)] ${className}`}>
      {children}
    </section>
  )
}

export function AdminSparkline({ tone = 'orange' }: { tone?: Tone }) {
  const color = toneColor(tone)
  const data = [18, 22, 20, 29, 23, 25, 21, 32].map((value, index) => ({
    name: `${index + 1}`,
    value,
  }))

  return <AdminMiniBarChart data={data} tone={tone} color={color} />
}

function toneColor(tone: Tone) {
  return (
    tone === 'green'
      ? '#10b981'
      : tone === 'blue'
        ? '#3b82f6'
        : tone === 'red'
          ? '#f43f5e'
          : tone === 'amber'
            ? '#f59e0b'
            : tone === 'purple'
              ? '#8b5cf6'
              : tone === 'teal'
                ? '#14b8a6'
                : tone === 'slate'
                  ? '#64748b'
                  : '#f97316'
  )
}

export function AdminMiniBarChart({
  data,
  tone = 'orange',
  color,
  className = '',
}: {
  data: Array<{ name: string; value: number }>
  tone?: Tone
  color?: string
  className?: string
}) {
  const fill = color || toneColor(tone)
  return (
    <div className={`h-12 w-28 max-w-full overflow-hidden rounded-xl ${className}`} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap={5}>
          <Bar dataKey="value" radius={[7, 7, 3, 3]} maxBarSize={12}>
            {data.map((_, index) => (
              <Cell key={index} fill={fill} fillOpacity={index % 2 === 0 ? 0.58 : 0.95} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function AdminDonutChart({
  data,
  total,
  label = 'Total',
  className = '',
}: {
  data: DonutDatum[]
  total: number
  label?: string
  className?: string
}) {
  const safeData = data.some((entry) => entry.value > 0)
    ? data
    : [{ name: 'Sin datos', value: 1, color: '#e2e8f0' }]

  return (
    <div className={`relative h-44 min-h-44 w-full overflow-hidden rounded-2xl ${className}`}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart margin={{ top: 6, right: 6, bottom: 6, left: 6 }}>
          <Pie
            data={safeData}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="86%"
            paddingAngle={3}
            stroke="#ffffff"
            strokeWidth={3}
          >
            {safeData.map((entry, index) => (
              <Cell key={`${entry.name}-${index}`} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="text-center">
          <p className="font-heading text-3xl font-black leading-none tracking-[-0.05em] text-slate-950">{total}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">{label}</p>
        </div>
      </div>
    </div>
  )
}

export function AdminStatCard({
  label,
  value,
  helper,
  icon,
  tone = 'orange',
}: {
  label: string
  value: string | number
  helper: string
  icon: ReactNode
  tone?: Tone
}) {
  return (
    <article className="rounded-[1.35rem] border border-slate-200 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.055)]">
      <div className="flex items-start justify-between gap-4">
        <div className={`grid h-11 w-11 place-items-center rounded-2xl border ${toneClasses(tone)}`}>
          {icon}
        </div>
        <AdminSparkline tone={tone} />
      </div>
      <p className="mt-4 max-w-[11rem] text-sm font-bold leading-5 text-slate-700">{label}</p>
      <p className="mt-2 font-heading text-4xl font-black leading-none tracking-[-0.055em] text-slate-950">{value}</p>
      <p className="mt-2 text-xs leading-5 text-slate-500">{helper}</p>
    </article>
  )
}
