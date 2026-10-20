import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  competitionSnapshot as snapshot,
  competitionQualification as qualification,
} from '@/tests/fixtures/studentCompetitions'
import { CompetitionHistory } from '@/components/student/progress/CompetitionHistory'
import { CompetitionSourceState } from '@/components/student/progress/CompetitionSourceState'

describe('competition results presentation', () => {
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
    const html = renderToStaticMarkup(createElement(CompetitionHistory, { datasets: [snapshot()] }))
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
