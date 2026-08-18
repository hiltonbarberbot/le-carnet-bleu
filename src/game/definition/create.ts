import { hashString } from '../random/hash.js'
import { createSettingBrief } from '../setting/brief.js'
import { compileStory, validateStory } from '../story/compile.js'
import type { GameDefinition, GameDefinitionInput } from './contract.js'

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function fingerprint(input: Omit<GameDefinition, 'fingerprint'>) {
  const serialized = canonical(input)
  return [
    hashString(`definition:a:${serialized}`),
    hashString(`definition:b:${serialized}`),
    hashString(`definition:c:${serialized}`),
    hashString(`definition:d:${serialized}`),
  ].map(value => value.toString(16).padStart(8, '0')).join('')
}

export function validateGameDefinition(input: GameDefinitionInput): string[] {
  const clueIds = new Set(input.clueDecks.flatMap(deck => deck.clues.map(clue => clue.id)))
  const errors = validateStory(input.story, clueIds)
  if (!input.id.trim()) errors.push('definition id is required')
  if (!input.title.trim()) errors.push('definition title is required')
  if (input.story.characters.length !== 5 || input.story.totalPeople !== 6) {
    errors.push('definition requires exactly five suspects and one host')
  }

  if (input.clueDecks.length !== 2) errors.push('definition requires exactly two setting-derived clue decks')
  const deckIds = new Set<string>()
  let clueCount = 0
  for (const deck of input.clueDecks) {
    if (!deck.id.trim() || !deck.label.trim()) errors.push('clue decks require id and label')
    if (deckIds.has(deck.id)) errors.push(`duplicate clue deck ${deck.id}`)
    deckIds.add(deck.id)
    if (!input.setting[deck.settingField].includes(deck.settingValue)) {
      errors.push(`clue deck ${deck.id} references missing ${deck.settingField} value “${deck.settingValue}”`)
    }
    if (!deck.clues.length) errors.push(`clue deck ${deck.id} is empty`)
    for (const clue of deck.clues) {
      clueCount += 1
      if (!clue.id.trim() || !clue.text.trim()) errors.push(`clue deck ${deck.id} contains an incomplete clue`)
      if (!Number.isInteger(clue.beat) || clue.beat < 1 || clue.beat > input.story.timeline.length) errors.push(`clue ${clue.id} references invalid timeline beat ${clue.beat}`)
    }
  }
  if (clueIds.size !== clueCount) errors.push('purchasable clue ids must be unique')
  if (clueCount !== input.story.characters.length) errors.push('definition requires exactly one unique purchasable clue per suspect')

  const actIds = new Set<string>()
  for (const act of input.acts) {
    if (!act.id.trim()) errors.push('act id is required')
    if (actIds.has(act.id)) errors.push(`duplicate act id ${act.id}`)
    actIds.add(act.id)
    if (!act.title.trim() || !act.operatorGoal.trim() || !act.playerGoal.trim() || !act.completionLabel.trim()) {
      errors.push(`act ${act.id || '(missing id)'} requires title, operatorGoal, playerGoal and completionLabel`)
    }
    if (!Number.isFinite(act.durationMinutes) || act.durationMinutes < 1) errors.push(`act ${act.id || '(missing id)'} needs a positive duration`)
  }
  if (!input.acts.length) errors.push('definition requires at least one authored act')

  for (const beat of input.story.runPlan) {
    if (!actIds.has(beat.phase)) errors.push(`run-plan beat ${beat.id} uses undeclared act ${beat.phase}`)
  }
  for (const character of input.story.characters) {
    if (!character.actions.length) errors.push(`character ${character.id} has no authored action`)
    for (const action of character.actions) {
      if (!actIds.has(action.phase)) errors.push(`action ${action.id} uses undeclared act ${action.phase}`)
    }
  }
  for (const act of input.acts) {
    if (!input.story.runPlan.some(beat => beat.phase === act.id && beat.essential)) {
      errors.push(`act ${act.id} has no essential run-plan beat`)
    }
  }

  const requirementIds = new Set<string>()
  if (!input.setupRequirements.length) errors.push('definition requires at least one setting-backed setup requirement')
  for (const requirement of input.setupRequirements) {
    if (requirementIds.has(requirement.id)) errors.push(`duplicate setup requirement ${requirement.id}`)
    requirementIds.add(requirement.id)
    if (!requirement.id.trim() || !requirement.label.trim()) errors.push('setup requirements require id and label')
    const settingValues = input.setting[requirement.settingField]
    if (!settingValues.includes(requirement.settingValue)) {
      errors.push(`setup requirement ${requirement.id} references missing ${requirement.settingField} value “${requirement.settingValue}”`)
    }
  }

  for (const character of input.story.characters) {
    for (const action of character.actions) {
      if (!Array.isArray(action.requires)) {
        errors.push(`action ${action.id} requires an explicit setup requirement list`)
        continue
      }
      for (const requirementId of action.requires) {
        if (!requirementIds.has(requirementId)) errors.push(`action ${action.id} references missing setup requirement ${requirementId}`)
      }
      if (action.physical && action.requires.length === 0) {
        errors.push(`physical action ${action.id} has no verified setup requirement`)
      }
    }
  }
  return [...new Set(errors)]
}

export function createGameDefinition(input: GameDefinitionInput): GameDefinition {
  const normalized: Omit<GameDefinition, 'fingerprint'> = {
    schemaVersion: 2,
    id: input.id.trim(),
    title: input.title.trim(),
    setting: createSettingBrief(input.setting),
    story: compileStory(structuredClone(input.story), new Set(input.clueDecks.flatMap(deck => deck.clues.map(clue => clue.id)))),
    clueDecks: structuredClone(input.clueDecks),
    acts: structuredClone(input.acts),
    setupRequirements: structuredClone(input.setupRequirements),
  }
  const errors = validateGameDefinition({ ...normalized, fingerprint: input.fingerprint })
  if (errors.length) throw new Error(`Invalid game definition:\n${errors.join('\n')}`)
  const expected = fingerprint(normalized)
  if (input.fingerprint && input.fingerprint !== expected) throw new Error('Game definition fingerprint does not match its content.')
  return { ...normalized, fingerprint: expected }
}
