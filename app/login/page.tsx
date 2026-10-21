'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, KeyRound, Target } from 'lucide-react'
import Image from 'next/image'
import { supabase } from '@/lib/supabaseClient'

function getRoleRedirect(role?: string | null) {
  if (role === 'admin') return '/admin'
  if (role === 'guardian') return '/hub'
  return '/'
}

export default function LoginPage() {
  const [accessCode, setAccessCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    const restoreSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!session?.user) {
          if (!cancelled) setCheckingSession(false)
          return
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .maybeSingle()

        router.replace(getRoleRedirect(profile?.role))
      } finally {
        if (!cancelled) setCheckingSession(false)
      }
    }

    restoreSession()

    return () => {
      cancelled = true
    }
  }, [router])

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await fetch('/api/auth/access-code/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessCode: accessCode.trim().toUpperCase(),
        }),
      })

      const payload = await response.json()

      if (!response.ok) {
        setError(payload?.error || 'No se pudo iniciar sesion.')
        return
      }

      const { error: sessionError } = await supabase.auth.setSession(payload.session)
      if (sessionError) {
        setError(sessionError.message)
        return
      }

      await supabase.auth.getUser()
      router.replace(payload.redirectTo || getRoleRedirect(payload.role))
    } catch (requestError: any) {
      setError(requestError?.message || 'No se pudo iniciar sesion.')
    } finally {
      setLoading(false)
    }
  }

  if (checkingSession) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <p className="text-textsec">Verificando acceso...</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100dvh-2.5rem)] flex-col justify-center py-6 sm:py-10">
      <div className="sport-dark relative isolate overflow-hidden rounded-t-[1.5rem] bg-navy px-6 pb-8 pt-5 text-white sm:px-8">
        <Target aria-hidden="true" className="pointer-events-none absolute -right-12 bottom-0 -z-10 h-64 w-64 text-white/[0.05]" strokeWidth={0.8} />
        <button aria-label="Volver" onClick={() => history.back()} className="mb-6 grid h-11 w-11 place-items-center rounded-xl border border-white/20 text-white transition-colors hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-300" type="button">
          <ArrowLeft aria-hidden="true" className="h-5 w-5" />
        </button>
        <Image src="/AA%20ACADEMY%20logo%20blanco.png" alt="Absolute Archery Academy" width={220} height={60} priority className="mb-8 h-12 w-auto max-w-full object-contain" />
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-orange-300">Acceso</p>
        <h1 className="mt-2 font-heading text-4xl font-bold leading-tight tracking-tight text-white">Ingresar con codigo</h1>
      </div>

      <div className="rounded-b-[1.5rem] border border-t-0 border-line bg-white p-6 shadow-soft sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-50 text-accent">
            <KeyRound aria-hidden="true" className="h-5 w-5" />
          </span>
          <p id="access-code-help" className="text-sm leading-relaxed text-textsec">Usa el codigo de acceso entregado por la academia.</p>
        </div>

        <form onSubmit={signIn} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="access-code" className="text-sm font-bold text-textpri">Código de acceso</label>
            <input
              className="input !min-h-[60px] !rounded-xl !border-slate-300 !bg-slate-50 text-center font-heading !text-3xl font-semibold uppercase tracking-[0.25em]"
              id="access-code"
              aria-describedby={error ? "access-code-help access-code-error" : "access-code-help"}
              aria-invalid={Boolean(error)}
              placeholder="ABC123"
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              maxLength={8}
              required
            />
          </div>

          {error && <p id="access-code-error" role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-danger">{error}</p>}

          <button disabled={loading} className="btn !min-h-[52px] w-full !rounded-xl" type="submit">
            {loading ? 'Ingresando...' : 'Ingresar'}
            {!loading && <ArrowRight aria-hidden="true" className="h-5 w-5" />}
          </button>
        </form>

      </div>
    </div>
  )
}
