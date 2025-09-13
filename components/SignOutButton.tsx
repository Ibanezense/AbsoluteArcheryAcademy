"use client"
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { useToast } from './ui/ToastProvider'

export default function SignOutButton(){
  const router = useRouter()
  const toast = useToast()

  const handle = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      toast.push({ message: error.message, type: 'error' })
      return
    }
    router.replace('/login')
  }

  return (
    <button
      onClick={handle}
      className="absolute top-4 right-4 btn-ghost px-3 py-1 text-sm"
      aria-label="Cerrar sesión"
    >Cerrar sesión</button>
  )
}
