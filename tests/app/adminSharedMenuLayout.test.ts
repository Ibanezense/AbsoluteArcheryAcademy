import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it, vi } from 'vitest'
const route = vi.hoisted(() => ({ pathname: '/admin' }))
vi.mock('next/navigation', () => ({ usePathname: () => route.pathname }))
vi.mock('next/image', () => ({ default: () => null }))
vi.mock('next/link', () => ({ default: ({ children, href, ...props }: any) => createElement('a', { href, ...props }, children) }))
vi.mock('@/components/AdminGuard', () => ({ default: ({ children }: any) => children }))
vi.mock('@/components/AdminSidebar', () => ({ default: () => createElement('aside') }))
vi.mock('@/components/AdminBottomNav', () => ({ default: () => createElement('nav') }))
import AdminLayout from '@/app/admin/layout'

it.each(['/admin', '/admin/sesiones', '/admin/alumnos', '/admin/asistencia', '/admin/finanzas', '/admin/ajustes'])('keeps the same admin masthead and sidebar theme on %s', pathname => {
  route.pathname = pathname
  const html = renderToStaticMarkup(createElement(AdminLayout, null, createElement('p', null, 'Contenido')))
  expect(html).toContain('academy-admin-home')
  expect(html).toContain('academy-admin-masthead')
  expect(html).toContain('aria-label="Notificaciones"')
})
