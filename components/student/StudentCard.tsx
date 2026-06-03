import type { ReactNode } from 'react'

type StudentCardVariant = 'default' | 'info' | 'warning' | 'success' | 'danger'

const variantClasses: Record<StudentCardVariant, string> = {
  default: 'border-line bg-white shadow-card',
  info: 'border-blue-200 bg-blue-50/45 shadow-card',
  warning: 'border-orange-200 bg-orange-50/60 shadow-card',
  success: 'border-green-200 bg-green-50/55 shadow-card',
  danger: 'border-red-200 bg-red-50/55 shadow-card',
}

type StudentCardProps = {
  children: ReactNode
  className?: string
  variant?: StudentCardVariant
}

export function StudentCard({ children, className = '', variant = 'default' }: StudentCardProps) {
  return (
    <div className={`rounded-[1.35rem] border ${variantClasses[variant]} ${className}`}>
      {children}
    </div>
  )
}

export function StudentNotice({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <StudentCard variant="info" className={`px-4 py-3 ${className}`}>
      <div className="flex items-center gap-3 text-sm font-medium text-slate-700">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-blue-300 text-base font-black text-blue-600">
          i
        </span>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </StudentCard>
  )
}
