'use client'

import { usePathname } from 'next/navigation'
import AdminBottomNav, { type Tab } from '@/components/AdminBottomNav'
import Providers from '@/components/Providers'
import { useMemo } from 'react'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const active: Tab = useMemo(() => {
    if (pathname.startsWith('/admin/sesiones'))    return 'turnos'
    if (pathname.startsWith('/admin/alumnos'))     return 'alumnos'
    if (pathname.startsWith('/admin/membresias'))  return 'membresias'
    if (pathname.startsWith('/admin/ajustes'))     return 'ajustes'
    return 'dashboard'
  }, [pathname])

  return (
    <Providers>
      <>
      {/* Ocultar SIEMPRE la barra pública dentro de /admin (CSS + refuerzo JS) */}
      <style jsx global>{`
        #global-nav { display: none !important; }
      `}</style>

      {/* Refuerzo: si por algún motivo el nav público sigue en el DOM, ocultarlo y marcar aria-hidden */}
      <script suppressHydrationWarning>
        {`(function(){try{const el=document.getElementById('global-nav');if(el){el.style.display='none';el.setAttribute('aria-hidden','true');}}catch(e){}})()`}
      </script>

      {/* Contenido del admin con ancho móvil y padding para la barra */}
        <div className="mx-auto w-full max-w-[480px] px-4 pb-24">
          {children}
        </div>

        <AdminBottomNav active={active} />
      </>
    </Providers>
  )
}
