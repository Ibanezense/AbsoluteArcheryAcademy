
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) { setError(error.message); return }
    router.replace('/')
  }

  return (
    <div className="p-5 flex-1">
      <header className="flex items-center gap-2">
        <button onClick={() => history.back()} className="text-textsec">←</button>
        <h1 className="text-lg font-semibold">Iniciar sesión</h1>
      </header>

      <div className="mt-8 card p-5">
        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-gray-800 grid place-items-center text-2xl">👤</div>
        <form onSubmit={signIn} className="space-y-4">
          <input className="input" placeholder="Correo electrónico" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} required />
          <input className="input" placeholder="Contraseña" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} required />
          {error && <p className="text-danger text-sm">{error}</p>}
          <button disabled={loading} className="btn w-full">{loading ? 'Ingresando...' : 'Ingresar'}</button>
        </form>
        <p className="mt-4 text-center text-sm text-textsec">
          ¿Olvidaste tu contraseña?{' '}
          <button className="underline" onClick={async()=>{
            if(!email){ alert('Ingresa tu correo en el campo de arriba y vuelve a intentar.'); return }
            const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset' })
            if(error) alert(error.message); else alert('Revisa tu correo para restablecer la contraseña.')
          }}>Restablécela</button>
        </p>
      </div>
    </div>
  )
}
