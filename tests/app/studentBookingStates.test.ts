import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ data: undefined as unknown, error: null as unknown, isLoading: false, rpc: vi.fn() }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: state.data, error: state.error, isLoading: state.isLoading, refetch: vi.fn() }), useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock('next/navigation', () => ({ useParams: () => ({ id: '00000000-0000-0000-0000-000000000001' }), useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/components/student/MobileStudentHeader', () => ({ MobileStudentHeader: ({ title }: { title: string }) => createElement('header', null, createElement('h1', null, title)) }))
vi.mock('@/lib/hooks/useStudentContext', () => ({ useStudentContext: () => ({ activeStudentId: 'student', activeStudent: { full_name: 'Alumno de prueba' }, account: { role: 'student' }, loading: false }) }))
vi.mock('@/lib/hooks/useStudentDashboard', () => ({ useStudentDashboard: () => ({ dashboard: null }) }))
vi.mock('@/components/ui/ToastProvider', () => ({ useToast: () => ({ push: vi.fn() }) }))
vi.mock('@/components/ui/ConfirmDialog', () => ({ useConfirm: () => vi.fn() }))
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc: state.rpc } }))
import DetailPage from '@/app/reserva/[id]/page'
import AgendaPage from '@/app/reservar/page'

describe('student booking visible states', () => {
  beforeEach(() => { state.data = undefined; state.error = null; state.isLoading = false; state.rpc.mockReset() })
  it('shows a recoverable not-found instead of an endless skeleton', () => {
    state.data = null
    const html = renderToStaticMarkup(createElement(DetailPage))
    expect(html).toContain('Reserva no encontrada')
    expect(html).toContain('Volver a Mis reservas')
    expect(html).not.toContain('Cargando contenido')
    expect(state.rpc).not.toHaveBeenCalled()
  })
  it('offers retry on a failed detail request', () => {
    state.error = new Error('network')
    const html = renderToStaticMarkup(createElement(DetailPage))
    expect(html).toContain('No pudimos cargar la reserva')
    expect(html).toContain('Reintentar')
    expect(html).not.toContain('Reserva no encontrada')
  })
  it('shows real site, translated mode and readable cancellation source', () => {
    state.data = { booking_id: 'booking', status: 'cancelled', student_name: 'Alumno de prueba', start_at: '2026-10-15T15:00:00Z', end_at: '2026-10-15T16:00:00Z', group_type: 'ownbow', location_name: 'Tiabaya', location_address: 'Dirección confirmada', cancellation_source: 'day_end' }
    const html = renderToStaticMarkup(createElement(DetailPage))
    expect(html).toContain('Tiabaya · Dirección confirmada')
    expect(html).toContain('Clase con arco propio')
    expect(html).toContain('Cancelación al cerrar el día')
    expect(html).not.toContain('ownbow')
    expect(html.match(/<h1/g)).toHaveLength(1)
  })
  it('keeps an uncovered future turn disabled and offers renewal without writes', () => {
    state.data = [{ session_id: 'turn', start_at: new Date().toISOString(), end_at: new Date().toISOString(), can_book: false, eligibility_reason: 'membership_dates', location_name: 'Tiabaya', spots_for_student: 5 }]
    const html = renderToStaticMarkup(createElement(AgendaPage))
    expect(html).toContain('Necesitas renovar')
    expect(html).toContain('/membresias#renovacion')
    expect(html).toMatch(/disabled=""[^>]*>No disponible para reservar/)
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).not.toContain('<main')
    expect(state.rpc).not.toHaveBeenCalled()
  })
  it('does not show stale actionable agenda when its query fails', () => {
    state.data = []
    state.error = new Error('permission')
    const html = renderToStaticMarkup(createElement(AgendaPage))
    expect(html).toContain('No pudimos consultar')
    expect(html).toContain('Reintentar')
    expect(html).not.toContain('Reservar este turno')
  })
})
