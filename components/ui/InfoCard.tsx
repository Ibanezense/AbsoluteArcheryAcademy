// Contenido para: components/ui/InfoCard.tsx
import React from 'react'

interface InfoCardProps {
  title: string
  children: React.ReactNode
}

export function InfoCard({ title, children }: InfoCardProps) {
  return (
    <div className="card p-5">
      <h3 className="text-sm font-semibold text-textsec mb-4 uppercase tracking-wide">
        {title}
      </h3>
      <div className="space-y-3">
        {children}
      </div>
    </div>
  )
}
