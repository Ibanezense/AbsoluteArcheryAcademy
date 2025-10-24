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
    return null
  }

  return <>{children}</>
}
