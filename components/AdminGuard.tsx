'use client'
import { useRequireAdmin } from '@/lib/hooks/useAuth'

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { isAdmin, checking } = useRequireAdmin()

  if (checking) {
    return (
      <div className="min-h-screen grid place-items-center">
        <p className="text-textsec">Verificando acceso...</p>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="rounded-2xl border border-line bg-card p-6 text-center shadow-card">
          <p className="font-semibold text-textpri">Acceso administrativo requerido</p>
          <p className="mt-2 text-sm text-textsec">Redirigiendo a tu area correspondiente...</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
