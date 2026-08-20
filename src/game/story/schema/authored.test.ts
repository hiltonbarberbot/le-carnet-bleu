import { describe, expect, it } from 'vitest'
import { createDemoGame } from '../../demo.js'
import { validateStory } from '../compile.js'
import {
  authoredStorySchemas,
  eveningStageSchema,
  evidenceSchema,
  objectiveSchema,
  openingExecutionSchema,
  openingStepSchema,
  provenanceSchema,
  relationshipSchema,
  solutionStepSchema,
} from './authored.js'

describe('authored story data schemas', () => {
  it('formalises exactly eight reusable authored concepts', () => {
    expect(Object.keys(authoredStorySchemas)).toEqual([
      'objective',
      'relationship',
      'provenance',
      'evidence',
      'solutionStep',
      'openingExecution',
      'openingStep',
      'eveningStage',
    ])
  })

  it('validates scored objectives', () => {
    const valid = { id: 'win-trust', title: 'Win trust', text: 'Gain one ally.', phase: 'investigation', points: 2 }
    expect(objectiveSchema.parse(valid)).toBe(valid)
    expect(objectiveSchema.validate({ ...valid, phase: 'opening', points: 4 })).toEqual(expect.arrayContaining([
      expect.stringContaining('phase must be one of investigation, any'),
      expect.stringContaining('points must be 1, 2, or 3'),
    ]))
  })

  it('validates directed relationships', () => {
    expect(relationshipSchema.is({ roleId: 'guest-2', text: 'You owe them a favour.' })).toBe(true)
    expect(relationshipSchema.validate({ roleId: '', text: '' })).toHaveLength(2)
  })

  it('validates evidence provenance variants', () => {
    expect(provenanceSchema.is({ source: { kind: 'role', roleId: 'guest-1' }, independenceGroup: 'role:guest-1' })).toBe(true)
    expect(provenanceSchema.validate({ source: { kind: 'setting', settingRef: { kind: 'inventedRooms', id: '' } }, independenceGroup: '' })).toEqual(expect.arrayContaining([
      expect.stringContaining('independenceGroup'),
      expect.stringContaining('settingRef.kind'),
      expect.stringContaining('settingRef.id'),
    ]))
  })

  it('validates evidence facts and their role links', () => {
    expect(evidenceSchema.is({ id: 'ledger', kind: 'evidence', text: 'The ledger is signed.', aboutRoleIds: ['guest-2'] })).toBe(true)
    expect(evidenceSchema.validate({ id: 'ledger', kind: 'rumour', text: '', aboutRoleIds: ['guest-2', 'guest-2'] })).toEqual(expect.arrayContaining([
      expect.stringContaining('kind must be one of evidence, secret, colour'),
      expect.stringContaining('text must be non-empty'),
      expect.stringContaining('duplicate ids'),
    ]))
  })

  it('validates solution claims and unique evidence routes', () => {
    expect(solutionStepSchema.is({ id: 'method', title: 'The method', truth: 'The letter was swapped.', evidence: ['ink', 'seal'] })).toBe(true)
    expect(solutionStepSchema.validate({ id: 'method', title: 'The method', truth: 'The letter was swapped.', evidence: ['ink', 'ink'] })).toContain('solution step.evidence must not contain duplicate ids')
  })

  it('rejects unsafe physical opening execution', () => {
    expect(openingExecutionSchema.is({ kind: 'spoken' })).toBe(true)
    expect(openingExecutionSchema.validate({ kind: 'physical', contact: 'allowed', reversible: false, hostCued: false, proxy: 'machine' })).toEqual(expect.arrayContaining([
      expect.stringContaining('contact must be none'),
      expect.stringContaining('reversible must be true'),
      expect.stringContaining('hostCued must be true'),
      expect.stringContaining('proxy must be one of player, host'),
    ]))
  })

  it('validates addressed opening steps and setting links', () => {
    const valid = {
      id: 'welcome',
      title: 'Welcome',
      trigger: 'When seated',
      instructions: [{ recipientRoleId: 'host', text: 'Welcome the guests.' }],
      execution: { kind: 'spoken' },
      setupRequirementIds: [],
      settingRefs: [],
      propIds: [],
    }
    expect(openingStepSchema.is(valid)).toBe(true)
    expect(openingStepSchema.validate({
      ...valid,
      instructions: [...valid.instructions, ...valid.instructions],
      settingRefs: [{ kind: 'playableSpaces', id: 'salon' }, { kind: 'playableSpaces', id: 'salon' }],
    })).toEqual(expect.arrayContaining([
      expect.stringContaining('unique recipients'),
      expect.stringContaining('duplicate references'),
    ]))
  })

  it('validates timed evening stages', () => {
    expect(eveningStageSchema.is({ id: 'free-play', title: 'Investigation', description: 'Talk freely.', durationMinutes: 90, phase: 'investigation' })).toBe(true)
    expect(eveningStageSchema.validate({ id: 'free-play', title: 'Investigation', description: 'Talk freely.', durationMinutes: 2.5, phase: 'dinner' })).toEqual(expect.arrayContaining([
      expect.stringContaining('positive whole number'),
      expect.stringContaining('phase must be one of opening, investigation, reveal'),
    ]))
  })

  it('composes the schemas at the authored story boundary without throwing on bad leaf values', () => {
    const story = structuredClone(createDemoGame('schema-boundary').story) as any
    story.characters[0].objectives[0].phase = 'opening'
    story.characters[0].secrets[0].provenance = { source: 42, independenceGroup: 42 }
    story.solutionSteps[0].evidence = 'not-a-list'
    story.openingSteps[0].instructions[0].recipientRoleId = 42
    story.evening[0].durationMinutes = 1.5

    expect(validateStory(story)).toEqual(expect.arrayContaining([
      expect.stringContaining('phase must be one of investigation, any'),
      expect.stringContaining('provenance.independenceGroup'),
      expect.stringContaining('evidence must be a list'),
      expect.stringContaining('recipientRoleId must be non-empty text'),
      expect.stringContaining('durationMinutes must be a positive whole number'),
    ]))
  })
})
