import type {
  AcademyCompetitionSnapshot,
  CompetitionQualification,
} from '@/lib/contracts/studentCompetitions'

export function competitionQualification(
  overrides: Partial<CompetitionQualification> = {}
): CompetitionQualification {
  return {
    qualification_id: 'qualification-a',
    participation_id: 'participation-a',
    data_level: 'total_only',
    score: 493,
    arrow_count: 72,
    rank: null,
    ten_count: 4,
    x_count: 1,
    distance_m: 60,
    target_face_cm: null,
    segments: [],
    ...overrides,
  }
}
export function competitionSnapshot(
  overrides: Partial<AcademyCompetitionSnapshot> = {}
): AcademyCompetitionSnapshot {
  return {
    contract_version: 'te-academy-individual-progress-v1',
    complete: true,
    checked_at: '2026-10-20T15:00:00Z',
    dataset_id: 'dataset-a',
    dataset_version_id: 'version-a-1',
    dataset_version: 1,
    consumer_subject: {
      namespace: 'academy_reservas_student',
      external_id: 'student-a',
      link_status: 'confirmed',
    },
    competitor: { competitor_id: 'competitor-a', display_name: 'Atleta de prueba' },
    tournament: {
      tournament_id: 'event-a',
      name: 'Evento de prueba',
      start_date: '2026-10-03',
      end_date: '2026-10-04',
    },
    competitive_classes: [
      {
        competitive_class_id: 'class-a',
        label: 'Recurvo individual',
        event_type: 'individual',
        division: 'recurve',
        age_class: null,
        gender: null,
      },
    ],
    participations: [
      {
        participation_id: 'participation-a',
        tournament_id: 'event-a',
        competitor_id: 'competitor-a',
        competitive_class_id: 'class-a',
        status: 'finished',
      },
    ],
    qualifications: [competitionQualification()],
    final_results: [],
    ranking_entries: [],
    tombstones: [],
    ...overrides,
  }
}

// A source tournament can import registration, qualification and finals with
// separate competitor IDs even though all belong to one authorized athlete.
export function fragmentedCompetitionSnapshots(): AcademyCompetitionSnapshot[] {
  return ['final', 'qualification', 'registration'].map((stage) => {
    const id = `participation-${stage}`
    const known = stage === 'final'
    return competitionSnapshot({
      competitor: { competitor_id: `competitor-${stage}`, display_name: stage === 'qualification' ? 'DE PRUEBA Atleta' : 'Atleta de prueba' },
      competitive_classes: known ? competitionSnapshot().competitive_classes : [{ competitive_class_id: 'class-unknown', label: 'Unknown', event_type: 'individual', division: 'Unknown', age_class: 'Unknown', gender: 'unknown' }],
      participations: [{ participation_id: id, tournament_id: 'event-a', competitor_id: `competitor-${stage}`, competitive_class_id: known ? 'class-a' : 'class-unknown', status: 'finished' }],
      qualifications: stage === 'qualification' ? [competitionQualification({ qualification_id: 'qualification-stage', participation_id: id, score: 557, distance_m: 40 })] : [],
      final_results: known ? [{ final_result_id: 'final-stage', participation_id: id, final_position: 1, result_status: 'official', source_kind: 'supplied' }] : [],
      ranking_entries: known ? [{ ranking_entry_id: 'rank-qualification-stage', participation_id: id, ranking_type: 'qualification', position: 2, source_kind: 'supplied' }] : [],
    })
  })
}
