'use client'

import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { ArrowLeft, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'

type MobileStudentHeaderProps = {
  title?: string
  subtitle?: string
  showBack?: boolean
  showLogo?: boolean
}

export function MobileStudentHeader({
  title,
  subtitle,
  showBack = false,
  showLogo = false,
}: MobileStudentHeaderProps) {
  const router = useRouter()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <header className="relative overflow-hidden bg-[#020B14] px-4 pb-5 pt-[calc(env(safe-area-inset-top)+18px)] text-white shadow-[0_10px_24px_rgba(2,11,20,0.22)]">
      <div className="absolute inset-0 opacity-35">
        <div className="absolute -right-14 -top-20 h-44 w-44 rounded-full border border-orange-500/30" />
        <div className="absolute right-8 top-4 h-28 w-28 rounded-full border border-slate-500/20" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_84%_22%,rgba(249,115,22,0.22),transparent_24%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,6,23,0.98))]" />
      </div>

      <div className="relative z-10 flex min-h-[54px] items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {showBack && (
            <button
              type="button"
              onClick={() => router.back()}
              className="-ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/10"
              aria-label="Volver"
            >
              <ArrowLeft className="h-7 w-7" />
            </button>
          )}

          {showLogo ? (
            <div className="flex items-center gap-3">
              <Image
                src="/AA%20ACADEMY%20logo%20blanco.png"
                alt="Absolute Archery Academy"
                width={220}
                height={60}
                priority
                className="h-14 w-auto object-contain"
              />
            </div>
          ) : (
            <div className="min-w-0 flex-1 text-center">
              {title && <h1 className="truncate text-[1.35rem] font-black leading-tight tracking-[-0.03em] text-white">{title}</h1>}
              {subtitle && <p className="mt-0.5 truncate text-sm font-medium text-white/72">{subtitle}</p>}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-white transition hover:bg-white/10"
          aria-label="Cerrar sesión"
        >
          <LogOut className="h-6 w-6" />
        </button>
      </div>
    </header>
  )
}
