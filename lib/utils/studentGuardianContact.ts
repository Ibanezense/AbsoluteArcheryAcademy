export type StudentGuardianContact = { full_name: string; email: string | null; phone: string | null; dni: string | null }

export function normalizeGuardianContact(value: unknown): StudentGuardianContact | null | undefined {
  if (value === undefined || value === null) return value
  if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Los datos del tutor son inválidos.')
  const input = value as Record<string, unknown>
  const field = (name: string) => {
    const item = input[name]
    if (item !== undefined && item !== null && typeof item !== 'string') throw new Error('Los datos del tutor son inválidos.')
    return typeof item === 'string' ? item.trim() : ''
  }
  const full_name = field('full_name'), email = field('email'), phone = field('phone'), dni = field('dni')
  if ((email || phone || dni) && !full_name) throw new Error('Completa el nombre del tutor.')
  if (dni && !/^\d{8}$/.test(dni)) throw new Error('El DNI del tutor debe tener exactamente 8 dígitos.')
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('El email del tutor es inválido.')
  return { full_name, email: email || null, phone: phone || null, dni: dni || null }
}

export function resolveGuardianContact(saved?: StudentGuardianContact | null, account?: { full_name: string | null; email: string | null; phone: string | null; dni: string | null } | null): StudentGuardianContact {
  return saved || { full_name: account?.full_name || '', email: account?.email || null, phone: account?.phone || null, dni: account?.dni || null }
}

export function guardianAccessPayload(contact: StudentGuardianContact, account?: { full_name: string | null; email: string | null; phone: string | null; dni: string | null } | null, accessEmail = '', relationship = 'Tutor') {
  const source = account || contact
  return { full_name: source.full_name, email: account ? account.email : accessEmail || contact.email, phone: source.phone, dni: source.dni, relationship }
}

export function apiErrorMessage(value: unknown, fallback: string): string {
  let current = value
  for (let depth = 0; depth < 4; depth++) {
    if (typeof current === 'string') return current.trim() && current !== '[object Object]' ? current : fallback
    if (!current || typeof current !== 'object') return fallback
    const item = current as { message?: unknown; error?: unknown }
    current = typeof item.message === 'string' ? item.message : item.error
  }
  return fallback
}
