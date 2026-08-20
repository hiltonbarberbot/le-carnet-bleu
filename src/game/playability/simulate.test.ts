import { describe, expect, it } from 'vitest'
import { createDemoStoryline } from '../demo'
import { assertStorylinePlayable, simulateStorylinePlaythrough } from './simulate'

describe('deterministic storyline playability', () => {
  it('exercises every authored asset and reaches completion through both resolution routes', () => {
    const definition = createDemoStoryline('deterministic-playability')
    const report = simulateStorylinePlaythrough(definition)

    expect(report.verdict).toBe('pass')
    expect(report.failure).toBeNull()
    expect(report.coverage.openingStepIds).toEqual(definition.story.openingSteps.map(step => step.id))
    expect(new Set(report.coverage.evidenceIds)).toEqual(new Set([
      ...definition.story.publicEvidence.map(evidence => evidence.id),
      ...definition.story.characters.flatMap(character => character.secrets.map(secret => secret.id)),
    ]))
    expect(new Set(report.coverage.clueIds)).toEqual(new Set(definition.clueDecks.flatMap(deck => deck.clues.map(clue => clue.id))))
    expect(new Set(report.coverage.objectiveIds)).toEqual(new Set(definition.story.characters.flatMap(character => character.objectives.map(objective => objective.id))))
    expect(report.coverage.resolutionKinds).toEqual(['time_expired', 'conviction'])
    expect(report.trace.at(-1)).toMatchObject({ checkpoint: 'completion', command: 'complete', phase: 'completed' })
  })

  it('reports the exact unreachable transition without losing the successful trace', () => {
    const definition = structuredClone(createDemoStoryline('broken-transition'))
    definition.acts = []

    const report = simulateStorylinePlaythrough(definition)

    expect(report).toMatchObject({
      verdict: 'fail',
      failure: {
        checkpoint: 'start_game',
        command: 'start',
      },
    })
    expect(report.failure?.message).toBeTruthy()
    expect(report.trace.map(entry => entry.command)).toEqual(['create', 'replace_enrolment', 'prepare'])
    expect(() => assertStorylinePlayable(definition)).toThrow(/start_game \(start\)/)
  })

  it('fails explicitly when a storyline has no opening to perform', () => {
    const definition = structuredClone(createDemoStoryline('missing-opening'))
    definition.story.openingSteps = []

    const report = simulateStorylinePlaythrough(definition)

    expect(report).toMatchObject({
      verdict: 'fail',
      failure: {
        checkpoint: 'opening',
        message: 'The storyline has no opening steps to execute.',
      },
    })
  })
})
