import type {
  AcademyControl,
  TrainingFilter,
  TrainingSummary,
} from '@/lib/contracts/studentProgress'

function latest(rows: AcademyControl[]) {
  if (!rows.length)
    return { control: null, uncertain: false, distances: [] as number[], date: null }
  const date = rows.reduce(
    (value, row) => (row.performed_date > value ? row.performed_date : value),
    ''
  )
  const day = rows.filter((row) => row.performed_date === date)
  const unknown = day.some((row) => row.performed_time === null)
  const candidates = unknown
    ? day
    : day.filter(
        (row) =>
          row.performed_time ===
          day.reduce(
            (time, item) => (item.performed_time! > time ? item.performed_time! : time),
            ''
          )
      )
  const ordered = [...candidates].sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)
  )
  return {
    control: ordered[0],
    uncertain: candidates.length > 1,
    distances: Array.from(new Set(candidates.map((row) => row.distance))).sort((a, b) => a - b),
    date,
  }
}

function best(rows: AcademyControl[], arrows: 36 | 72) {
  return (
    [...rows]
      .filter((row) => row.arrows === arrows)
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.performed_date.localeCompare(b.performed_date) ||
          a.created_at.localeCompare(b.created_at) ||
          a.id.localeCompare(b.id)
      )[0] || null
  )
}

export function summarizeTrainingControls(
  controls: AcademyControl[],
  assignedDistance: number | null
): TrainingSummary {
  const valid = controls.filter((row) => row.status === 'valid')
  const global = latest(valid)
  const assigned = valid.filter((row) => row.distance === assignedDistance)
  const last = assignedDistance === null ? global : latest(assigned)
  const kind =
    assignedDistance === null
      ? 'pending'
      : !global.control
        ? 'assigned'
        : global.distances.length > 1
          ? 'uncertain'
          : global.distances[0] !== assignedDistance
            ? 'discrepant'
            : 'current'
  return {
    reference: {
      kind,
      assigned_distance_m: assignedDistance,
      latest_distances_m: global.distances,
      latest_date: global.date,
    },
    last_control: last.control,
    last_order_uncertain: last.uncertain,
    best_36: best(assigned, 36),
    best_72: best(assigned, 72),
  }
}

export function filterTrainingControls(
  controls: AcademyControl[],
  filter: TrainingFilter
): AcademyControl[] {
  const unknownDays = new Set(
    controls.filter((row) => row.performed_time === null).map((row) => row.performed_date)
  )
  return controls
    .filter(
      (row) =>
        (filter.distance === null || row.distance === filter.distance) &&
        (filter.format === 'all' || row.arrows === filter.format) &&
        (!filter.from || row.performed_date >= filter.from) &&
        (!filter.to || row.performed_date <= filter.to)
    )
    .sort(
      (a, b) =>
        b.performed_date.localeCompare(a.performed_date) ||
        (unknownDays.has(a.performed_date)
          ? 0
          : (b.performed_time || '').localeCompare(a.performed_time || '')) ||
        b.created_at.localeCompare(a.created_at) ||
        b.id.localeCompare(a.id)
    )
}

export function selectInitialTrainingFormat(
  controls: AcademyControl[],
  distance: number | null
): 36 | 72 {
  const valid = controls.filter((row) => row.status === 'valid' && row.distance === distance)
  return !valid.some((row) => row.arrows === 36) && valid.some((row) => row.arrows === 72) ? 72 : 36
}
