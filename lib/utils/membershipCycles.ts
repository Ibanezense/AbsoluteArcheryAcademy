export type MembershipOrigin = 'paid' | 'gift'

export type MembershipDisplayStatus =
  | 'current'
  | 'scheduled'
  | 'queued'
  | 'consumed'
  | 'expired'
  | 'cancelled'
  | 'historical'

export type MembershipStatus =
  | 'active'
  | 'consumed'
  | 'expired'
  | 'cancelled'
  | 'historical'

export interface MembershipLike {
  id: string
  start_date: string
  end_date: string | null
  status: MembershipStatus
  classes_remaining: number
  created_at: string
  membership_origin?: MembershipOrigin
}

interface PaidCyclePreviewInput {
  origin: 'paid'
  startDate: string
  periodCount: number
  durationDays: number
  classesPerPeriod: number
  amountPerPeriod: number
}

interface GiftCyclePreviewInput {
  origin: 'gift'
  startDate: string
  giftEndDate: string
  giftClasses: number
}

export type CyclePreviewInput =
  | PaidCyclePreviewInput
  | GiftCyclePreviewInput

export interface MembershipCyclePreview {
  cycleNumber: number
  origin: MembershipOrigin
  startDate: string
  endDate: string
  classes: number
  amount: number
}

export interface MembershipSummary {
  usableClasses: number
  totalOpenClasses: number
  openCount: number
  currentMembershipId: string | null
  bookableMembershipId: string | null
  availableClassesById: Record<string, number>
  statusesById: Record<string, MembershipDisplayStatus>
}

export const MEMBERSHIP_TIMEZONE = 'America/Lima'

export function getLimaDateKey(value: Date = new Date()): string {
  if (Number.isNaN(value.getTime())) throw new Error('Invalid date for Lima business day')

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MEMBERSHIP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function normalizeMembershipCommitments(value: unknown): Map<string, number> {
  const commitments = new Map<string, number>()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return commitments

  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  for (const [membershipId, rawCount] of Object.entries(value)) {
    const count = typeof rawCount === 'number' || typeof rawCount === 'string'
      ? Number(rawCount)
      : Number.NaN
    if (!uuidPattern.test(membershipId) || !Number.isInteger(count) || count < 0) continue
    commitments.set(membershipId, count)
  }

  return commitments
}

export function buildMembershipCyclePreview(
  input: CyclePreviewInput,
): MembershipCyclePreview[] {
  assertIsoDate(input.startDate)

  if (input.origin === 'gift') {
    assertIsoDate(input.giftEndDate)

    if (input.giftEndDate < input.startDate) {
      throw new Error('Gift end date must not be before its start date')
    }
    if (!Number.isInteger(input.giftClasses) || input.giftClasses <= 0) {
      throw new Error('Gift classes must be a positive integer')
    }

    return [
      {
        cycleNumber: 1,
        origin: 'gift',
        startDate: input.startDate,
        endDate: input.giftEndDate,
        classes: input.giftClasses,
        amount: 0,
      },
    ]
  }

  if (
    !Number.isInteger(input.periodCount) ||
    input.periodCount < 1 ||
    input.periodCount > 12
  ) {
    throw new Error('Period count must be between 1 and 12')
  }
  if (!Number.isInteger(input.durationDays) || input.durationDays <= 0) {
    throw new Error('Duration must be a positive integer')
  }
  if (!Number.isInteger(input.classesPerPeriod) || input.classesPerPeriod <= 0) {
    throw new Error('Classes per period must be a positive integer')
  }
  if (!Number.isFinite(input.amountPerPeriod) || input.amountPerPeriod < 0) {
    throw new Error('Amount per period must not be negative')
  }

  const cycles: MembershipCyclePreview[] = []
  let startDate = input.startDate

  for (let index = 0; index < input.periodCount; index += 1) {
    const endDate = addUtcDays(startDate, input.durationDays - 1)

    cycles.push({
      cycleNumber: index + 1,
      origin: 'paid',
      startDate,
      endDate,
      classes: input.classesPerPeriod,
      amount: input.amountPerPeriod,
    })

    startDate = addUtcDays(endDate, 1)
  }

  return cycles
}

export function suggestNextMembershipStart(
  memberships: MembershipLike[],
  today: string,
): string {
  assertIsoDate(today)

  const latestFiniteEnd = memberships
    .filter(isOpenMembership)
    .map((membership) => membership.end_date)
    .filter((endDate): endDate is string => endDate !== null)
    .sort((left, right) => right.localeCompare(left))[0]

  if (!latestFiniteEnd) return today

  const dayAfterLatestEnd = addUtcDays(latestFiniteEnd, 1)
  return dayAfterLatestEnd > today ? dayAfterLatestEnd : today
}

export function summarizeMemberships(
  memberships: MembershipLike[],
  serviceDate: string,
  committedByMembershipId: ReadonlyMap<string, number> = new Map(),
): MembershipSummary {
  assertIsoDate(serviceDate)

  for (const membership of memberships) {
    validateMembershipDates(membership)
  }

  const ordered = [...memberships].sort(compareMembershipsFifo)
  const openMemberships = ordered.filter(
    (membership) =>
      isOpenMembership(membership) &&
      (membership.end_date === null || membership.end_date >= serviceDate),
  )
  const eligibleMemberships = openMemberships.filter(
    (membership) => membership.start_date <= serviceDate,
  )
  const bookableMemberships = eligibleMemberships.filter(
    (membership) =>
      availableClasses(membership, committedByMembershipId) > 0,
  )
  const currentMembershipId = eligibleMemberships[0]?.id ?? null
  const bookableMembershipId = bookableMemberships[0]?.id ?? null
  const eligibleIds = new Set(eligibleMemberships.map((membership) => membership.id))
  const availableClassesById: Record<string, number> = {}
  const statusesById: Record<string, MembershipDisplayStatus> = {}

  for (const membership of ordered) {
    availableClassesById[membership.id] = eligibleIds.has(membership.id)
      ? availableClasses(membership, committedByMembershipId)
      : 0
    statusesById[membership.id] = displayStatus(
      membership,
      serviceDate,
      currentMembershipId,
      eligibleIds,
    )
  }

  return {
    usableClasses: bookableMemberships.reduce(
      (total, membership) => total + availableClasses(membership, committedByMembershipId),
      0,
    ),
    totalOpenClasses: openMemberships.reduce(
      (total, membership) => total + membership.classes_remaining,
      0,
    ),
    openCount: openMemberships.length,
    currentMembershipId,
    bookableMembershipId,
    availableClassesById,
    statusesById,
  }
}

function availableClasses(
  membership: MembershipLike,
  committedByMembershipId: ReadonlyMap<string, number>,
): number {
  const committedValue = committedByMembershipId.get(membership.id) || 0
  const committed = Number.isFinite(committedValue) ? Math.max(committedValue, 0) : 0
  return Math.max(membership.classes_remaining - committed, 0)
}

function validateMembershipDates(membership: MembershipLike): void {
  try {
    assertIsoDate(membership.start_date)
  } catch {
    throw new Error(`Invalid membership start_date for ${membership.id}`)
  }

  if (membership.end_date !== null) {
    try {
      assertIsoDate(membership.end_date)
    } catch {
      throw new Error(`Invalid membership end_date for ${membership.id}`)
    }
  }

  if (!Number.isFinite(Date.parse(membership.created_at))) {
    throw new Error(`Invalid membership created_at for ${membership.id}`)
  }
}

function displayStatus(
  membership: MembershipLike,
  serviceDate: string,
  currentMembershipId: string | null,
  eligibleIds: Set<string>,
): MembershipDisplayStatus {
  if (membership.status === 'cancelled') return 'cancelled'
  if (membership.status === 'historical') return 'historical'
  if (membership.status === 'expired') return 'expired'
  if (membership.status === 'consumed' || membership.classes_remaining <= 0) {
    return 'consumed'
  }
  if (membership.end_date !== null && membership.end_date < serviceDate) {
    return 'expired'
  }
  if (membership.start_date > serviceDate) return 'scheduled'
  if (membership.id === currentMembershipId) return 'current'
  if (eligibleIds.has(membership.id)) return 'queued'

  return 'historical'
}

function isOpenMembership(membership: MembershipLike): boolean {
  return membership.status === 'active' && membership.classes_remaining > 0
}

function compareMembershipsFifo(
  left: MembershipLike,
  right: MembershipLike,
): number {
  return (
    left.start_date.localeCompare(right.start_date) ||
    Date.parse(left.created_at) - Date.parse(right.created_at) ||
    left.id.localeCompare(right.id)
  )
}

function addUtcDays(dateOnly: string, days: number): string {
  const date = parseIsoDate(dateOnly)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function assertIsoDate(dateOnly: string): void {
  parseIsoDate(dateOnly)
}

function parseIsoDate(dateOnly: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly)

  if (!match) throw new Error(`Invalid ISO date: ${dateOnly}`)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error(`Invalid ISO date: ${dateOnly}`)
  }

  return date
}
