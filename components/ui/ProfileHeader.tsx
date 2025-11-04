import Link from 'next/link'
import Avatar from '@/components/ui/Avatar'
import type { Profile } from '@/lib/hooks/useProfile'

type ProfileHeaderProps = {
  profile: Profile
  isAdmin: boolean
  onBack?: () => void
}

export function ProfileHeader({ profile, isAdmin, onBack }: ProfileHeaderProps) {
  return (
    <>
      {/* Header sticky solo para admin */}
      {isAdmin && (
        <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur border-b border-white/10">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            <button 
              onClick={onBack} 
              className="btn-ghost !px-3"
              aria-label="Volver"
            >
              ←
            </button>
            <h1 className="flex-1 text-center font-semibold">Perfil del Estudiante</h1>
            <Link 
              href={`/admin/alumnos/editar/${profile.id}`} 
              className="btn-ghost !px-3"
              title="Editar perfil"
            >
              ✏️
            </Link>
          </div>
        </div>
      )}

      {/* Header con avatar */}
      <div className={`relative ${isAdmin ? 'pt-16 pb-20' : 'pt-20 pb-24'}`}>
        <div className="relative max-w-4xl mx-auto px-5">
          <div className="flex flex-col items-center text-center">
            <Avatar 
              name={profile.full_name || 'Usuario'} 
              url={profile.avatar_url} 
              size="lg"
            />
            <h2 className={`mt-4 font-bold ${isAdmin ? 'text-2xl' : 'text-3xl'}`}>
              {profile.full_name || 'Arquero'}
            </h2>
            {profile.email && (
              <p className="mt-1 text-sm text-textsec">{profile.email}</p>
            )}
            {isAdmin && profile.phone && (
              <p className="text-sm text-textsec">{profile.phone}</p>
            )}
            <div className="mt-3 flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                profile.is_active 
                  ? 'bg-success/20 text-success' 
                  : 'bg-danger/20 text-danger'
              }`}>
                <span className={`h-2 w-2 rounded-full ${profile.is_active ? 'bg-success' : 'bg-danger'}`}></span>
                {profile.is_active ? 'Activo' : 'Inactivo'}
              </span>
              {profile.membership_type && (
                <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-info/20 text-info">
                  {profile.membership_type}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
