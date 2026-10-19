import { useEffect, type RefObject } from 'react'

export function useDialogFocus(open: boolean, container: RefObject<HTMLElement>) {
  useEffect(() => {
    if (!open || !container.current) return
    const previousFocus = document.activeElement as HTMLElement | null
    const dialog = container.current
    const selector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]'
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(selector)).filter((element) => element.getClientRects().length > 0)
    ;(focusable()[0] || dialog).focus()
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function trapTab(event: KeyboardEvent) {
      if (event.key !== 'Tab') return
      const items = focusable()
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) { event.preventDefault(); dialog.focus(); return }
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault(); first.focus()
      }
    }
    document.addEventListener('keydown', trapTab)
    return () => {
      document.removeEventListener('keydown', trapTab)
      document.body.style.overflow = oldOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [open, container])
}
