import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  competitionSnapshot as snapshot,
  competitionQualification as qualification,
  fragmentedCompetitionSnapshots,
} from '@/tests/fixtures/studentCompetitions'
import { CompetitionHistory } from '@/components/student/progress/CompetitionHistory'
import { CompetitionSourceState } from '@/components/student/progress/CompetitionSourceState'
import { historicalTournament } from '@/tests/fixtures/studentCompetitions'

describe('competition results presentation', () => {
  it('renders one historical tournament with one score and labeled National and Open results', () => {
    const html = renderToStaticMarkup(createElement(CompetitionHistory, { datasets: historicalTournament() }))
    expect((html.match(/<article/g) || [])).toHaveLength(1)
    expect(html).toContain('Nacional')
    expect(html).toContain('Open')
    expect(html).toContain('6.º puesto')
    expect(html).toContain('4.º puesto')
    expect((html.match(/>544</g) || [])).toHaveLength(1)
    expect(html).not.toContain('Sin puntaje de clasificación publicado')
    expect(html).not.toContain('Posición por revisar')
    expect(html).not.toContain('\uFFFD')
  })
  it('labels every score when the same tournament has different legitimate categories', () => {
    const first = snapshot(), second = snapshot()
    second.participations[0].participation_id = 'compound-participation'
    second.participations[0].competitive_class_id = 'compound-class'
    second.competitive_classes[0] = { ...second.competitive_classes[0], competitive_class_id: 'compound-class', label: 'Compuesto', division: 'compound', competition_scope: 'open' }
    second.qualifications[0] = { ...second.qualifications[0], participation_id: 'compound-participation', qualification_id: 'compound-score', score: 650 }
    const html = renderToStaticMarkup(createElement(CompetitionHistory, { datasets: [first, second] }))
    expect((html.match(/<article/g) || [])).toHaveLength(1)
    expect(html).toMatch(/Recurvo individual[^<]*Registro \d/)
    expect(html).toMatch(/Compuesto[^<]*Open/)
    expect(html).toContain('493')
    expect(html).toContain('650')
  })
  it('renders one complete result when classification and final arrive under separate source IDs', () => {
    const html = renderToStaticMarkup(createElement(CompetitionHistory, { datasets: fragmentedCompetitionSnapshots() }))
    expect((html.match(/<article/g) || [])).toHaveLength(1)
    expect(html).toContain('1 torneo verificado')
    expect(html).toContain('Medalla de oro')
    expect(html).toContain('1.º puesto')
    expect(html).toContain('557')
    expect(html).toContain('72 flechas')
    expect(html).toContain('40 m')
    expect(html).not.toContain('Sin puntaje de clasificación publicado')
    expect(html).not.toContain('Estado no documentado')
  })
  it('celebrates an official final silver without turning qualification rank into the final place', () => {
    const html = renderToStaticMarkup(
      createElement(CompetitionHistory, {
        datasets: [
          snapshot({
            qualifications: [qualification({ rank: 5 })],
            final_results: [
              {
                final_result_id: 'final-silver',
                participation_id: 'participation-a',
                final_position: 2,
                result_status: 'official',
                source_kind: 'supplied',
              },
            ],
          }),
        ],
      })
    )
    expect(html).toContain('Medalla de plata')
    expect(html).toContain('2.º puesto')
    expect(html).toContain('Posición de clasificación')
    expect(html).toContain('>5<')
  })
  it('keeps a provisional podium visibly provisional without claiming a medal', () => {
    const html = renderToStaticMarkup(
      createElement(CompetitionHistory, {
        datasets: [
          snapshot({
            final_results: [
              {
                final_result_id: 'final-pending',
                participation_id: 'participation-a',
                final_position: 2,
                result_status: 'provisional',
                source_kind: 'supplied',
              },
            ],
          }),
        ],
      })
    )
    expect(html).toContain('Provisional')
    expect(html).not.toContain('Medalla de plata')
  })
  it('shows DNS participation independently of an undocumented final result', () => {
    const base = snapshot()
    const html = renderToStaticMarkup(
      createElement(CompetitionHistory, {
        datasets: [
          snapshot({
            participations: [{ ...base.participations[0], status: 'dns' }],
            qualifications: [],
          }),
        ],
      })
    )
    expect(html).toContain('Participación: No tomó la salida')
    expect(html).toContain('Estado no documentado')
    expect(html).not.toContain('Oficial')
  })
  it('explains empty current results after a withdrawal without claiming a source failure', () => {
    const html = renderToStaticMarkup(
      createElement(CompetitionHistory, {
        datasets: [
          snapshot({
            tombstones: [
              {
                entity_type: 'competitor',
                entity_id: 'competitor-a',
                replacement_entity_id: null,
                effective_dataset_version_id: 'version-a-1',
              },
            ],
          }),
        ],
      })
    )
    expect(html).toContain('No hay participaciones vigentes entre los registros verificados')
    expect(html).not.toContain('493')
  })
  it('shows qualification score and format without inventing a maximum or an origin URL', () => {
    const html = renderToStaticMarkup(
      createElement(CompetitionHistory, { datasets: [snapshot()] })
    )
    expect(html).toContain('493')
    expect(html).toContain('72 flechas')
    expect(html).toContain('60 m')
    expect(html).toContain('Fecha del evento')
    expect(html).not.toContain('/ 720')
    expect(html).not.toContain('href="https:')
  })
  it('does not turn a final-only participation into a qualification or official result', () => {
    const html = renderToStaticMarkup(
      createElement(CompetitionHistory, {
        datasets: [
          snapshot({
            qualifications: [],
            ranking_entries: [
              {
                ranking_entry_id: 'r',
                participation_id: 'participation-a',
                ranking_type: 'final',
                position: 2,
                source_kind: 'supplied',
              },
            ],
          }),
        ],
      })
    )
    expect(html).toContain('Sin puntaje de clasificación publicado')
    expect(html).toContain('Posición final')
    expect(html).toContain('Estado no documentado')
    expect(html).not.toContain('Oficial')
  })
  it('keeps missing arrows and contradictory positions explicit', () => {
    const html = renderToStaticMarkup(
      createElement(CompetitionHistory, {
        datasets: [
          snapshot({
            qualifications: [qualification({ arrow_count: 0, rank: 2 })],
            ranking_entries: [
              {
                ranking_entry_id: 'r',
                participation_id: 'participation-a',
                ranking_type: 'qualification',
                position: 3,
                source_kind: 'supplied',
              },
            ],
          }),
        ],
      })
    )
    expect(html).toContain('Cantidad de flechas no documentada')
    expect(html).toContain('Posición por revisar')
    expect(html).not.toContain('0 flechas')
  })
  it('separates partial, unavailable, pending and complete-empty source states', () => {
    const render = (state: 'partial' | 'unavailable' | 'pending_link' | 'empty') =>
      renderToStaticMarkup(
        createElement(CompetitionSourceState, {
          state,
          failures: 1,
          busy: false,
          onRetry: () => undefined,
        })
      )
    expect(render('partial')).toContain('Consulta incompleta')
    expect(render('unavailable')).toContain('No pudimos consultar tus competencias')
    expect(render('pending_link')).toContain('pendientes de vinculación')
    expect(render('empty')).toContain('Sin resultados de competencias publicados')
    expect(render('unavailable')).not.toContain('Sin resultados de competencias publicados')
  })
})
