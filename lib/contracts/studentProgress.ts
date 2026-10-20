export const ACADEMY_CONTROLS_CONTRACT = 'academy-student-controls-v1' as const
export const ACADEMY_DIRECTORY_CONTRACT = 'academy-student-directory-v1' as const

export type AcademyControl = {
  id: string
  student_id: string
  distance: number
  arrows: 36 | 72
  score: number
  performed_date: string
  performed_time: string | null
  status: 'valid' | 'annulled'
  revision: number
  created_at: string
  updated_at: string
}
export type AcademyIdentity = { id: string; name: string; active: 0 | 1 }
export type AcademyControlsSnapshot = {
  contract_version: typeof ACADEMY_CONTROLS_CONTRACT
  complete: true
  checked_at: string
  student: AcademyIdentity
  controls: AcademyControl[]
}
export type ProgressReference = {
  kind: 'current' | 'assigned' | 'pending' | 'discrepant' | 'uncertain'
  assigned_distance_m: number | null
  latest_distances_m: number[]
  latest_date: string | null
}
export type TrainingSummary = {
  reference: ProgressReference
  last_control: AcademyControl | null
  last_order_uncertain: boolean
  best_36: AcademyControl | null
  best_72: AcademyControl | null
}
export type ProgressLink = {
  id: string
  student_id: string
  source: 'academy_controls' | 'tournament_engine'
  external_id: string
  status: 'pending' | 'confirmed' | 'revoked'
  revision: number
  evidence_reference: string
  confirmed_at: string | null
  updated_at: string
}
export type TrainingProgressResponse = {
  state: 'pending_link' | 'empty' | 'ready' | 'unavailable'
  student_id: string
  assigned_distance_m: number | null
  assignment_checked_at: string
  link_revision: number | null
  checked_at: string | null
  controls: AcademyControl[]
  summary: TrainingSummary | null
}
export type TrainingFilter = {
  distance: number | null
  format: 36 | 72 | 'all'
  from: string
  to: string
}
