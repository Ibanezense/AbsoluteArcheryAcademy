'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function AjustesPage() {
    const router = useRouter()

    useEffect(() => {
        router.replace('/admin/ajustes/infraestructura')
    }, [router])

    return (
        <div className="card p-8 text-center text-textsec">Redirigiendo a Infraestructura...</div>
    )
}
