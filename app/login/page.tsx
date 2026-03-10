'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, KeyRound } from 'lucide-react'
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
    <div className="flex min-h-[calc(100vh-2.5rem)] flex-col justify-center">
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => history.back()} className="btn-ghost !px-3" type="button">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-accent">Acceso</p>
          <h1 className="mt-1 text-2xl font-semibold text-textpri">Ingresar con codigo</h1>
        </div>
      </div>

      <div className="card overflow-hidden p-6">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/12 text-accent">
          <KeyRound className="h-7 w-7" />
        </div>

        <form onSubmit={signIn} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm text-textsec">Codigo de acceso</label>
            <input
              className="input text-center text-lg font-semibold uppercase tracking-[0.35em]"
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

          {error && <p className="text-sm text-danger">{error}</p>}

          <button disabled={loading} className="btn w-full" type="submit">
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-textsec">
          Usa el codigo de acceso entregado por la academia.
        </p>
      </div>
    </div>
  )
}
