import type { ProgressLink } from './studentProgress'

export const ACADEMY_COMPETITIONS_CONTRACT = 'te-academy-individual-progress-v1' as const
export const ACADEMY_COMPETITION_HISTORY_CONTRACT =
  'te-academy-individual-progress-history-v1' as const
export const ACADEMY_ENGINE_IDENTITY_CONTRACT = 'te-academy-identity-v1' as const

export type CompetitionQualification = {
  qualification_id: string
  participation_id: string
  data_level?: string | null
  score: number | null
  arrow_count: number | null
  rank: number | null
  ten_count: number | null
  x_count: number | null
  distance_m?: number | null
  target_face_cm?: number | null
  segments: Array<{
    qualification_segment_id: string
    segment_order: number
    distance_m: number | null
    target_face_cm: number | null
    score: number | null
    arrow_count: number | null
  }>
}
export type AcademyCompetitionSnapshot = {
  contract_version: typeof ACADEMY_COMPETITIONS_CONTRACT
  complete: true
  checked_at: string
  dataset_id: string
  dataset_version_id: string
  dataset_version: number
  consumer_subject: {
    namespace: 'academy_reservas_student'
    external_id: string
    link_status: 'confirmed'
  }
  competitor: { competitor_id: string; display_name: string }
  tournament: {
    tournament_id: string
    name: string
    start_date: string | null
    end_date: string | null
  }
  competitive_classes: Array<{
    competitive_class_id: string
    label: string
    event_type: 'individual'
    division: string | null
    age_class: string | null
    gender: string | null
    competition_scope?: 'national' | 'open' | 'unknown'
    source_category_code?: string
  }>
  participations: Array<{
    participation_id: string
    tournament_id: string
    competitor_id: string
    competitive_class_id: string
    status: string
  }>
  qualifications: CompetitionQualification[]
  final_results: Array<{
    final_result_id: string
    participation_id: string
    final_position: number | null
    result_status: string
    source_kind: string
  }>
  ranking_entries: Array<{
    ranking_entry_id: string
    participation_id: string
    ranking_type: string
    position: number | null
    source_kind: string
  }>
  tombstones: Array<{
    entity_type: string
    entity_id: string
    replacement_entity_id: string | null
    effective_dataset_version_id: string
  }>
}
export type CompetitionsProgressResponse = {
  state: 'pending_link' | 'empty' | 'ready' | 'partial' | 'unavailable'
  student_id: string
  checked_at: string | null
  link_revisions: Array<{ id: string; revision: number }>
  datasets: AcademyCompetitionSnapshot[]
  failures: number
}
export type EngineCandidate = {
  competitor_id: string
  display_name: string
  identity_status: string
}
export type EngineIdentityPreview = {
  candidate: EngineCandidate
  published_individual_datasets: number
  recent_events: Array<{ name: string; start_date: string | null; category_labels: string[] }>
}
export type EngineLinkOperation = {
  id: string
  link_id: string
  student_id: string
  external_id: string
  action: 'confirm' | 'revoke'
  state: 'pending' | 'completed' | 'superseded'
  generation: number
  last_error_code: null | 'remote_unavailable' | 'identity_conflict' | 'invalid_source'
  requested_at: string
  updated_at: string
}
export type EngineLinksContext = {
  student_id: string
  links: ProgressLink[]
  operations: EngineLinkOperation[]
}
