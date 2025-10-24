'use client'

import { useState, useEffect } from 'react'

export function Topbar() {
  const [currentDateTime, setCurrentDateTime] = useState('')

  useEffect(() => {
    const updateDateTime = () => {
      const now = new Date()
      const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }
      setCurrentDateTime(now.toLocaleDateString('es-ES', options))
    }

    updateDateTime()
    const interval = setInterval(updateDateTime, 60000) // Update every minute

    return () => clearInterval(interval)
  }, [])

  return (
  <header className="bg-[#0e1116] border-b border-white/10 px-8 py-4">
      <div className="flex items-center justify-between">
        {/* Búsqueda */}
        <div className="flex-1 max-w-md">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Buscar..."
              className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-10 pr-4 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Fecha/Hora y Acciones */}
        <div className="flex items-center gap-6">
          {/* Fecha/Hora Actual */}
          <div className="text-slate-300 text-sm font-medium">
            {currentDateTime}
          </div>

          {/* Notificaciones */}
          <button className="hover-accent relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors">
            <svg className="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14V9a6 6 0 10-12 0v5c0 .538-.106 1.063-.595 1.595L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
          </button>

          {/* Avatar del Usuario */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center">
              <span className="text-white font-semibold text-sm">A</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Topbar