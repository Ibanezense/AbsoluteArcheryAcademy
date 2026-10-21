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
    <header className="sport-dark relative border-b border-white/10 bg-navy px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)] text-white sm:px-6 md:px-8">
      <div className="relative z-10 flex min-h-[52px] items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {showBack && (
            <button
              type="button"
              onClick={() => router.back()}
              className="-ml-1 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300"
              aria-label="Volver"
            >
              <ArrowLeft aria-hidden="true" className="h-5 w-5" />
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
                className="h-10 w-auto max-w-[220px] object-contain sm:h-11"
              />
            </div>
          ) : (
            <div className="min-w-0 flex-1 text-left">
              {title && <h1 className="truncate font-heading text-2xl font-bold leading-tight tracking-tight text-white">{title}</h1>}
              {subtitle && <p className="mt-0.5 truncate text-sm font-medium text-slate-300">{subtitle}</p>}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300"
          aria-label="Cerrar sesión"
        >
          <LogOut aria-hidden="true" className="h-5 w-5" />
        </button>
      </div>
    </header>
  )
}
