'use client'

import type { ReactNode } from 'react'

type StudentPageSkeletonProps = {
  variant?: 'home' | 'membership' | 'reservations' | 'booking'
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`rounded-full bg-line ${className}`} />
}

function SkeletonCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-card shadow-soft ${className}`}>
      {children}
    </div>
  )
}

export function StudentPageSkeleton({ variant = 'home' }: StudentPageSkeletonProps) {
  const showCalendar = variant === 'booking'
  const showHistory = variant === 'membership' || variant === 'reservations'

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-24 text-textpri">
      <div className="h-24 bg-[#020B14] px-4 pt-6">
        <div className="mx-auto flex max-w-[430px] items-center justify-between">
          <div className="h-10 w-44 rounded-full bg-white/10" />
          <div className="h-10 w-10 rounded-full bg-white/10" />
        </div>
      </div>
      <div
        className="mx-auto w-full max-w-[430px] space-y-4 px-4 py-5 animate-pulse"
        aria-label="Cargando contenido del alumno"
      >
        <div className="space-y-2">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-7 w-56" />
        </div>

        {variant === 'home' && (
          <>
            <SkeletonCard className="overflow-hidden pb-6">
              <div className="h-28 bg-gradient-to-r from-line to-line/40" />
              <div className="-mt-10 flex justify-center">
                <div className="h-24 w-24 rounded-full border-4 border-card bg-line" />
              </div>
              <div className="mt-4 flex flex-col items-center gap-3 px-6">
                <SkeletonBlock className="h-6 w-40" />
                <SkeletonBlock className="h-4 w-32" />
                <div className="grid w-full grid-cols-2 gap-3 pt-3">
                  <div className="h-20 rounded-xl bg-line/80" />
                  <div className="h-20 rounded-xl bg-line/80" />
                </div>
              </div>
            </SkeletonCard>

            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((item) => (
                <SkeletonCard key={item} className="flex flex-col items-center gap-3 p-4">
                  <div className="h-12 w-12 rounded-full bg-line" />
                  <SkeletonBlock className="h-3 w-16" />
                </SkeletonCard>
              ))}
            </div>
          </>
        )}

        {variant === 'membership' && (
          <>
            <SkeletonCard className="p-5">
              <SkeletonBlock className="h-4 w-36" />
              <div className="mt-5 flex items-end gap-3">
                <div className="h-16 w-20 rounded-2xl bg-line" />
                <SkeletonBlock className="mb-2 h-4 w-28" />
              </div>
              <div className="mt-5 h-3 rounded-full bg-line" />
            </SkeletonCard>
            <SkeletonCard className="space-y-4 p-5">
              <SkeletonBlock className="h-5 w-36" />
              <SkeletonBlock className="h-4 w-full" />
              <SkeletonBlock className="h-4 w-5/6" />
              <SkeletonBlock className="h-4 w-3/4" />
            </SkeletonCard>
          </>
        )}

        {showCalendar && (
          <>
            <SkeletonCard className="p-5">
              <div className="grid grid-cols-2 gap-3 min-[390px]:grid-cols-4">
                {[0, 1, 2, 3].map((item) => (
                  <div key={item} className="h-28 rounded-2xl bg-line" />
                ))}
              </div>
            </SkeletonCard>
            <SkeletonCard className="p-4">
              <div className="grid grid-cols-7 gap-2">
                {Array.from({ length: 35 }).map((_, index) => (
                  <div key={index} className="h-10 rounded-xl bg-line/80" />
                ))}
              </div>
            </SkeletonCard>
          </>
        )}

        {showHistory && (
          <div className="space-y-3">
            {[0, 1, 2].map((item) => (
              <SkeletonCard key={item} className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-2">
                    <SkeletonBlock className="h-5 w-40" />
                    <SkeletonBlock className="h-4 w-28" />
                  </div>
                  <div className="h-8 w-20 rounded-full bg-line" />
                </div>
              </SkeletonCard>
            ))}
          </div>
        )}

        {variant === 'reservations' && (
          <div className="space-y-3">
            {[0, 1, 2].map((item) => (
              <SkeletonCard key={`reservation-${item}`} className="p-4">
                <SkeletonBlock className="h-5 w-48" />
                <SkeletonBlock className="mt-3 h-4 w-32" />
                <div className="mt-4 flex gap-2">
                  <div className="h-9 w-16 rounded-xl bg-line" />
                  <div className="h-9 w-24 rounded-xl bg-line" />
                </div>
              </SkeletonCard>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
