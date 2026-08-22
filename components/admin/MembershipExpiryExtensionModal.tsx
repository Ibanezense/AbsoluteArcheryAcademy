'use client'

import React, { useEffect, useId, useRef } from 'react'
import { CalendarClock, Loader2, ShieldCheck, X } from 'lucide-react'
import type { MembershipExpiryExtensionPreview } from '@/lib/services/adminMembershipExpiryExtensionService'

interface MembershipExpiryExtensionModalProps {
  isOpen: boolean
  preview: MembershipExpiryExtensionPreview
  reason: string
  isLoading: boolean
  isApplying: boolean
  confirmOpen: boolean
  error: string | null
  onReasonChange: (reason: string) => void
  onCancel: () => void
  onApply: () => void
}

function affectedLabel(count: number) {
  return count === 1 ? '1 membresía afectada' : `${count} membresías afectadas`
}

export function MembershipExpiryExtensionModal({
  isOpen,
  preview,
  reason,
  isLoading,
  isApplying,
  confirmOpen,
  error,
  onReasonChange,
  onCancel,
  onApply,
}: MembershipExpiryExtensionModalProps) {
  const titleId = useId()
  const descriptionId = useId()
  const reasonId = useId()
  const dialogRef = useRef<HTMLElement | null>(null)
  const previousActiveElementRef = useRef<HTMLElement | null>(null)
  const isBusy = isLoading || isApplying
  const canApply = !isBusy && preview.affected_count > 0 && reason.trim().length > 0

  useEffect(() => {
    if (!isOpen || confirmOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isApplying) onCancel()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [confirmOpen, isApplying, isOpen, onCancel])

  useEffect(() => {
    if (!isOpen) return

    previousActiveElementRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    return () => {
      previousActiveElementRef.current?.focus()
      previousActiveElementRef.current = null
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || confirmOpen) return

    const dialog = dialogRef.current
    dialogRef.current?.focus()

    function trapFocus(event: KeyboardEvent) {
      if (event.key !== 'Tab' || !dialog) return

      const focusableElements = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ))

      if (focusableElements.length === 0) {
        event.preventDefault()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (event.shiftKey && (document.activeElement === firstElement || document.activeElement === dialog)) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', trapFocus)
    return () => document.removeEventListener('keydown', trapFocus)
  }, [confirmOpen, isOpen])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isApplying) onCancel()
      }}
    >
      <section
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        aria-busy={isBusy}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[1.75rem] border border-white/10 bg-white shadow-[0_28px_80px_rgba(2,6,23,0.35)] sm:rounded-[1.75rem]"
      >
        <header className="relative overflow-hidden bg-[#07111d] px-5 py-5 text-white sm:px-6">
          <div className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-accent/25 blur-3xl" />
          <div className="relative flex items-start gap-4">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-orange-300/20 bg-orange-400/10 text-orange-300">
              <CalendarClock className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-300">Acción masiva</p>
              <h2 id={titleId} className="mt-1 font-heading text-2xl font-black tracking-[-0.04em] sm:text-3xl">
                Retrasar vencimientos 7 días
              </h2>
              <p id={descriptionId} className="mt-2 text-sm leading-6 text-slate-300">
                Se sumarán exactamente 7 días a la última membresía elegible de cada alumno. Las clases, pagos y fechas de inicio no cambiarán.
              </p>
            </div>
            <button
              type="button"
              onClick={onCancel}
              disabled={isApplying}
              aria-label="Cerrar"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-slate-300 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
          <div className="flex flex-col gap-3 rounded-2xl border border-orange-100 bg-orange-50/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-accent" aria-hidden="true" />
              <div>
                <p className="text-sm font-black text-slate-950">Vista previa de la operación</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">Solo incluye membresías activas, no vencidas y con clases restantes.</p>
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-black text-accent ring-1 ring-orange-200">
              {affectedLabel(preview.affected_count)}
            </span>
          </div>

          {isLoading ? (
            <div className="flex min-h-36 items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm font-bold text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin text-accent" aria-hidden="true" />
              Preparando vista previa…
            </div>
          ) : preview.extensions.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center">
              <p className="text-sm font-black text-slate-800">No hay membresías elegibles</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">No se realizará ningún cambio.</p>
            </div>
          ) : (
            <ul className="max-h-56 space-y-2 overflow-y-auto pr-1" aria-label="Membresías que se modificarán">
              {preview.extensions.map((extension) => (
                <li key={extension.membership_id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-950">{extension.student_name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{extension.membership_name}</p>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-black tabular-nums">
                      <time dateTime={extension.current_end_date} className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-600">
                        {extension.current_end_date}
                      </time>
                      <span className="text-accent" aria-hidden="true">→</span>
                      <time dateTime={extension.new_end_date} className="rounded-lg bg-emerald-50 px-2.5 py-1.5 text-emerald-700">
                        {extension.new_end_date}
                      </time>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <label htmlFor={reasonId} className="block">
            <span className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Motivo obligatorio</span>
            <textarea
              id={reasonId}
              required
              rows={3}
              value={reason}
              disabled={isBusy}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Ej. Cierre institucional por mantenimiento"
              className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-accent/40 focus:bg-white focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-70"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">
              {error}
            </p>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={isApplying}
            className="min-h-11 rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-600 transition hover:border-slate-300 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={!canApply}
            className="min-h-11 rounded-2xl bg-accent px-5 text-sm font-black text-white shadow-[0_12px_25px_rgba(249,115,22,0.22)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
          >Aplicar retraso de 7 días</button>
        </footer>
      </section>
    </div>
  )
}
