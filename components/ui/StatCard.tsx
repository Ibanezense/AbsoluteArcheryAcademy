// Contenido para: components/ui/StatCard.tsx
import React from 'react'

interface StatCardProps {
  title: string
  value: string | number
  icon?: string
  children?: React.ReactNode
}

export function StatCard({ title, value, icon, children }: StatCardProps) {
  return (
    <div className="card p-6">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <p className="text-sm text-textsec mb-1">{title}</p>
          <p className="text-3xl font-bold text-text">{value}</p>
        </div>
        {icon && (
          <div className="text-4xl opacity-30">{icon}</div>
        )}
      </div>
      {children && (
        <div className="mt-3 pt-3 border-t border-white/10">
          {children}
        </div>
      )}
    </div>
  )
}
