"use client"

import { useEffect } from 'react'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Aplicar tema y color de acento guardados
    const savedTheme = localStorage.getItem('theme') || 'dark'
    const savedAccent = localStorage.getItem('accent-color') || 'orange'
    
    const root = document.documentElement
    
    // Aplicar tema
    if (savedTheme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      root.classList.toggle('dark', systemTheme === 'dark')
    } else {
      root.classList.toggle('dark', savedTheme === 'dark')
    }
    
    // Aplicar color de acento
    const accentColors = ['blue', 'slate', 'gray', 'red', 'green', 'orange']
    accentColors.forEach(color => {
      root.classList.remove(`accent-${color}`)
    })
    root.classList.add(`accent-${savedAccent}`)
    
    // Configurar CSS custom property
    const colorMap: Record<string, string> = {
      blue: '#3b82f6',
      slate: '#64748b', 
      gray: '#6b7280',
      red: '#ef4444',
      green: '#22c55e',
      orange: '#f97316'
    }
    
    root.style.setProperty('--accent-color', colorMap[savedAccent] || colorMap.orange)
    
    // Escuchar cambios en preferencias del sistema
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => {
      if (localStorage.getItem('theme') === 'system') {
        root.classList.toggle('dark', mediaQuery.matches)
      }
    }
    
    mediaQuery.addEventListener('change', handleChange)
    
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  return <>{children}</>
}