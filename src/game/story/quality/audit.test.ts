import { describe, expect, it } from 'vitest'
import { createDemoStoryline } from '../../demo'
import { auditStorylineLogicStatically } from '../review/static'
import { auditStorylineQuality, countNarrativeWords } from './audit'
import { storyQualityBudgets } from './budgets'

function words(count: number, stem = 'word') {
  return Array.from({ length: count }, (_, index) => `${stem}${index}`).join(' ')
}

describe('story quality budgets', () => {
  it('counts prose deterministically across punctuation and apostrophes', () => {
    expect(countNarrativeWords("One well-made clue — l’affaire's hinge.")).toBe(5)
  })

  it('keeps the established narrative within budget once its opening is compact', () => {
    const definition = createDemoStoryline('quality-baseline')
    definition.story.openingSteps = definition.story.openingSteps.slice(0, storyQualityBudgets.openingSteps.maximum)
    expect(auditStorylineQuality(definition)).toEqual([])
  })

  it('blocks an oversized player packet and identifies the exact role', () => {
    const definition = structuredClone(createDemoStoryline('oversized-packet'))
    const role = definition.story.characters[0]
    role.privateIdentity = words(storyQualityBudgets.playerPacketWords, 'history')

    expect(auditStorylineQuality(definition)).toEqual(expect.arrayContaining([
      expect.stringMatching(new RegExp(`^quality budget: character ${role.id} player packet is \\d+ words; maximum 450$`)),
      `quality budget: character ${role.id} private identity is 450 words; maximum 60`,
    ]))
  })

  it('blocks excessive facts, relationships, objectives, and opening choreography', () => {
    const definition = structuredClone(createDemoStoryline('excessive-load'))
    const role = definition.story.characters[0]
    role.secrets.push(structuredClone(role.secrets[0]))
    role.secrets.at(-1)!.id = 'too-many-facts'
    role.relationships.push({ roleId: definition.story.characters[1].id, text: 'A fourth relationship the player must remember.' })
    role.relationships.push({ roleId: definition.story.characters[2].id, text: 'A fifth relationship the player must remember.' })
    role.objectives.push({ id: 'too-many-objectives', title: 'Another task', text: 'Obtain one more promise.', phase: 'any', points: 1 })
    definition.story.openingSteps[0].instructions.push({ recipientRoleId: role.id, text: 'Remember yet another private opening cue.' })

    expect(auditStorylineQuality(definition)).toEqual(expect.arrayContaining([
      `quality budget: character ${role.id} has 7 starting facts; maximum 6`,
      `quality budget: character ${role.id} has 5 relationships; maximum 4`,
      `quality budget: character ${role.id} has 4 objectives; maximum 3`,
      `quality budget: character ${role.id} has 3 private opening cues; maximum 2`,
    ]))
  })

  it('rejects duplicated narrative instead of counting repeated prose as depth', () => {
    const definition = structuredClone(createDemoStoryline('duplicate-prose'))
    const [first, second] = definition.story.characters[0].objectives
    second.text = first.text

    expect(auditStorylineQuality(definition)).toContain(`quality budget: objective ${second.id} duplicates objective ${first.id}`)
  })

  it('runs the quality gate as part of deterministic static review', () => {
    const definition = structuredClone(createDemoStoryline('static-quality'))
    definition.story.premise = words(storyQualityBudgets.textWords.premise + 1, 'premise')

    expect(auditStorylineLogicStatically(definition)).toContain('quality budget: story premise is 141 words; maximum 140')
  })
})
