import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const runsRoot = new URL('../../story/runs/', import.meta.url)

function slug(label) {
  return label.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function resource(item) {
  if (typeof item !== 'string') return item
  return { id: slug(item), label: item, description: '' }
}

function settingV5(input) {
  const playableSpaces = input.playableSpaces.map(resource)
  const spaceIds = new Map(playableSpaces.map(item => [item.label.toLowerCase(), item.id]))
  const linkedSpaces = label => [...spaceIds].filter(([name]) => label.toLowerCase().includes(name)).map(([, id]) => id)
  return {
    ...input,
    playableSpaces,
    routes: input.routes.map(item => {
      const base = resource(item)
      return { ...base, spaceIds: base.spaceIds ?? linkedSpaces(base.label), accessibilityNotes: base.accessibilityNotes ?? [] }
    }),
    usableFeatures: input.usableFeatures.map(item => {
      const base = resource(item)
      return { ...base, spaceIds: base.spaceIds ?? linkedSpaces(base.label) }
    }),
    safetyConstraints: input.safetyConstraints.map(resource),
    accessibilityNeeds: input.accessibilityNeeds.map(resource),
    contentBoundaries: input.contentBoundaries.map(resource),
  }
}

function reference(setting, item) {
  const kind = item.settingField
  const id = kind === 'availableProps'
    ? item.propId
    : setting[kind].find(resource => resource.label === item.settingValue)?.id
  return { kind, id }
}

function storylineV5(input) {
  const setting = settingV5(input.setting)
  const story = structuredClone(input.story)
  const setupRequirements = input.setupRequirements.map(item => ({ id: item.id, label: item.label, settingRef: reference(setting, item) }))
  const requirementsByProp = new Map(setupRequirements.filter(item => item.settingRef.kind === 'availableProps').map(item => [item.settingRef.id, item.id]))
  const noContact = setupRequirements.find(item => item.settingRef.kind === 'safetyConstraints' && /contact/i.test(item.label))

  story.host = { id: 'host', name: story.victim, title: story.hostRole }
  story.victimRoleId = 'host'
  story.culpritRoleId = story.characters.find(character => character.name === story.culprit)?.id
  story.solutionSummary = story.solution
  delete story.hostRole
  delete story.victim
  delete story.culprit
  delete story.solution

  story.solutionSteps = story.solutionSteps.map((step, index) => ({ ...step, id: step.id ?? `${story.id}-solution-${index + 1}` }))
  const openingInstructions = new Map()
  for (const character of story.characters) {
    for (const secret of character.secrets) secret.provenance = { source: { kind: 'role', roleId: character.id }, independenceGroup: `role:${character.id}` }
    for (const instruction of character.actions ?? []) openingInstructions.set(instruction.id, `${character.name}: ${instruction.text}`)
    delete character.actions
  }
  const finalStepId = story.openingSteps.at(-1)?.id ?? ''
  for (const evidence of story.publicEvidence) evidence.provenance = { source: { kind: 'public', openingStepId: finalStepId }, independenceGroup: `opening:${finalStepId}` }

  story.openingSteps = story.openingSteps.map((step, index) => {
    const inheritedInstructions = (step.actionIds ?? []).map(id => openingInstructions.get(id)).filter(Boolean)
    const propIds = step.propIds ?? []
    const setupRequirementIds = [...new Set([
      ...propIds.map(id => requirementsByProp.get(id)).filter(Boolean),
      ...(index === story.openingSteps.length - 1 && noContact ? [noContact.id] : []),
    ])]
    const settingRefs = [
      ...propIds.map(id => ({ kind: 'availableProps', id })),
      ...setupRequirementIds.map(id => setupRequirements.find(item => item.id === id)?.settingRef).filter(Boolean),
    ].filter((value, position, all) => all.findIndex(item => item.kind === value.kind && item.id === value.id) === position)
    const physical = propIds.length > 0 || index === story.openingSteps.length - 1
    const migrated = {
      ...step,
      instruction: [step.instruction, ...inheritedInstructions].filter(Boolean).join(' '),
      execution: physical ? { kind: 'physical', contact: 'none', reversible: true, hostCued: true, proxy: 'host' } : { kind: 'spoken' },
      setupRequirementIds,
      settingRefs,
      propIds,
    }
    delete migrated.actionIds
    return migrated
  })

  const solutionStepIds = story.solutionSteps.map(step => step.id)
  const clueDecks = input.clueDecks.map(deck => ({
    id: deck.id,
    label: deck.label,
    source: reference(setting, deck),
    clues: deck.clues.map((clue, index) => ({ ...clue, supportsSolutionStepIds: [solutionStepIds[Math.min(index, solutionStepIds.length - 1)]] })),
  }))

  return { schemaVersion: 5, id: input.id, title: input.title, setting, story, clueDecks, acts: input.acts.map(act => ({ ...act, id: 'opening' })), setupRequirements }
}

for (const directory of await readdir(runsRoot)) {
  const storyPath = new URL(`${directory}/story.json`, runsRoot)
  const settingPath = new URL(`${directory}/setting.json`, runsRoot)
  const input = JSON.parse(await readFile(storyPath, 'utf8'))
  if (input.schemaVersion !== 5) await writeFile(storyPath, `${JSON.stringify(storylineV5(input), null, 2)}\n`)
  const setting = JSON.parse(await readFile(settingPath, 'utf8'))
  if (typeof setting.playableSpaces[0] === 'string') await writeFile(settingPath, `${JSON.stringify(settingV5(setting), null, 2)}\n`)
}

console.log(`Migrated story runs in ${join(runsRoot.pathname)}`)
