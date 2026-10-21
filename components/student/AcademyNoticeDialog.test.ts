import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AcademyNoticeDialog from './AcademyNoticeDialog'

describe('student notification dialog', () => {
  it('renders safe text, an accessible close button and a single acknowledgement', () => {
    const html = renderToStaticMarkup(createElement(AcademyNoticeDialog, { title: 'Aviso', body: '<script>unsafe</script>', onClose() {} }))
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-label="Cerrar notificación"')
    expect(html).toContain('h-11 w-11')
    expect(html).toContain('&lt;script&gt;unsafe&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('Entendido')
    expect(html).not.toContain('Renovar membresía')
  })
  it('clearly explains expiration and provides both renewal and dismissal actions', () => {
    const html = renderToStaticMarkup(createElement(AcademyNoticeDialog, { title: 'Tu membresía está vencida', body: 'Renueva', expired: true, preview: true, onClose() {} }))
    expect(html).toContain('Renovar membresía')
    expect(html).toContain('Ahora no')
    expect(html).toContain('cuando tengas una membresía activa')
    expect(html).toContain('Vista previa')
  })
})
