'use client'
import React from 'react'

interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div
      // Fondo oscuro semi-transparente
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
      onClick={onClose} // Cierra el modal al hacer clic en el fondo
    >
      <div
        // Contenedor del modal
        className="bg-card rounded-2xl border border-white/10 max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()} // Evita que el clic en el modal cierre el fondo
      >
        {/* Header del Modal */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-xl font-semibold text-textpri">{title}</h2>
          <button
            onClick={onClose}
            className="text-textsec hover:text-textpri transition-colors text-2xl leading-none"
            aria-label="Cerrar modal"
          >
            ×
          </button>
        </div>

        {/* Contenido (con scroll si es necesario) */}
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </div>
  )
}
