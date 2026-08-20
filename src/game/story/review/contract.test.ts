import { describe, expect, it } from 'vitest'
import { createDemoStoryline } from '../../demo'
import {
  createStoryLogicReviewPrompt,
  formatLogicReviewFailure,
  logicCheckIds,
  logicReviewPassed,
  validateStoryLogicReview,
  type StoryLogicReview,
} from './contract'
import { auditStorylineLogicStatically } from './static'

function passingReview(fingerprint: string): StoryLogicReview {
  return {
    schemaVersion: 1,
    definitionFingerprint: fingerprint,
    verdict: 'pass',
    summary: 'Every causal claim is independently supported.',
    checks: logicCheckIds.map(id => ({ id, verdict: 'pass', explanation: `${id} is supported.`, relatedIds: [] })),
    findings: [],
  }
}

describe('story logic review contract', () => {
  it('requires the final reviewer to address every semantic risk exactly once', () => {
    const definition = createDemoStoryline('logic-review')
    const review = passingReview(definition.fingerprint)
    review.checks = review.checks.filter(check => check.id !== 'means')

    expect(validateStoryLogicReview(definition, review)).toContain('logic review must contain exactly one means check')
  })

  it('binds a review to the exact definition fingerprint', () => {
    const definition = createDemoStoryline('logic-review')
    const review = passingReview('stale-fingerprint')

    expect(validateStoryLogicReview(definition, review)).toContain('logic review fingerprint does not match the reviewed definition')
  })

  it('fails if a nominal pass contains a failed check or blocking finding', () => {
    const definition = createDemoStoryline('logic-review')
    const review = passingReview(definition.fingerprint)
    review.checks.find(check => check.id === 'opportunity')!.verdict = 'fail'
    review.findings.push({ severity: 'blocking', code: 'missing_opportunity', message: 'Nobody places the culprit at the scene.', relatedIds: [] })

    expect(logicReviewPassed(review)).toBe(false)
    expect(validateStoryLogicReview(definition, review)).toContain('logic review pass contradicts a failed check or blocking finding')
    expect(formatLogicReviewFailure(review)).toContain('missing_opportunity')
  })

  it('sends private objectives and information paths to the independent reviewer', () => {
    const definition = createDemoStoryline('logic-review-packet')
    const character = definition.story.characters[0]
    const prompt = createStoryLogicReviewPrompt(definition)

    expect(prompt).toContain(character.privateIdentity)
    expect(prompt).toContain(character.objectives[0].text)
    expect(prompt).toContain(character.relationships[0].text)
    expect(logicCheckIds).toEqual(expect.arrayContaining(['production_simplicity', 'objective_achievability', 'information_flow', 'endgame']))
    expect(prompt).toContain('combined setup burden rather than failing on prop count')
    expect(prompt).toContain('several ready-to-hand items may pass while one elaborate dependency must fail')
  })

  it('rejects culprit-owned facts before spending a reviewer call', () => {
    const definition = structuredClone(createDemoStoryline('logic-review'))
    const culprit = definition.story.characters.find(character => character.id === definition.story.culpritRoleId)!
    definition.story.solutionSteps[0].evidence = [culprit.secrets[0].id, definition.story.solutionSteps[0].evidence[0]]

    expect(auditStorylineLogicStatically(definition)).toEqual(expect.arrayContaining([
      expect.stringContaining('cites culprit-only evidence as proof'),
      expect.stringContaining('needs two independent non-culprit proof sources'),
    ]))
  })
})
