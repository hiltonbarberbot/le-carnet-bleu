import { describe, expect, it } from 'vitest'
import {
  advanceAct,
  advanceHearing,
  callAccusation,
  castVote,
  completeGame,
  completeOpeningStep,
  createGame,
  prepareGame,
  startGame,
  toggleEvidence,
  updateEnrolment,
} from '../session/lifecycle'
import { restoreGameSession, serializeGameState } from '../session/storage'
import { createDemoGame } from '../demo'
import { createGameDefinition } from './create'

const names = ['Mara Vale', 'Jon Bell', 'Iris Chen', 'Noor Aziz', 'Theo March']

function galleryInput() {
  return {
    id: 'gallery-opening',
    title: 'Gallery opening',
    setting: {
      venueName: 'North Room Gallery',
      location: 'A street-level contemporary gallery in Lyon',
      era: 'Present day',
      playableSpaces: ['Main gallery', 'Seated supper area'],
      routes: ['A level, public route connects both areas'],
      usableFeatures: ['A service bell', 'Printed wall labels'],
      availableProps: [{ id: 'catalogues', label: 'Printed catalogues', quantity: 6, description: 'One host copy and five player copies.', safetyNotes: [] }],
      tone: 'Elegant contemporary intrigue',
      safetyConstraints: ['Keep the lights on', 'No physical contact', 'No player leaves the public gallery floor'],
      accessibilityNeeds: ['All essential staging is playable while seated'],
      contentBoundaries: ['No weapons', 'No graphic violence'],
    },
    story: {
      id: 'gallery-last-label',
      seed: 'gallery-opening',
      title: 'The Last Label',
      subtitle: 'A present-day gallery mystery played entirely in ordinary light.',
      premise: 'Five gallery guests accepted respectable invitations while privately seeking answers about a disputed donation.',
      totalPeople: 6,
      hostRole: 'The gallery curator, then Game Master',
      victim: 'The gallery curator',
      culprit: names[0],
      characters: names.map((name, index) => ({
        id: `guest-${index + 1}`,
        name,
        title: `Gallery guest ${index + 1}`,
        costume: 'Contemporary evening wear',
        publicFace: 'A composed member of the gallery circle.',
        invitationPretext: 'You were invited to celebrate the gallery donation.',
        invitationPromise: 'The curator promised to settle one private question about the donated painting.',
        privateIdentity: `You secretly witnessed part ${index + 1} of the forgery scandal.`,
        privateObjective: 'Learn who substituted the donated painting without exposing your own involvement.',
        privateSecret: index === 0 ? 'You replaced the original painting and caused the curator’s death.' : `You concealed part ${index + 1} of the forgery scandal.`,
        traits: ['Composed in public', 'Attentive to detail'],
        objectives: [1, 2, 3].map(points => ({ id: `gallery-objective-${index + 1}-${points}`, title: `Objective ${points}`, text: `Complete gallery objective ${points}.`, phase: 'any', points })),
        relationships: [1, 2].map(offset => ({ roleId: `guest-${((index + offset) % names.length) + 1}`, text: 'A useful connection in the gallery circle.' })),
        secrets: [{ id: `gallery-evidence-${index + 1}`, kind: 'evidence', aboutRoleIds: [`guest-${((index + 1) % names.length) + 1}`], text: `You observed gallery evidence ${index + 1}.` }],
      })),
      publicEvidence: [],
      evening: [
        { id: 'gallery-briefing', title: 'Private briefing', description: 'Meet the gallery circle and review private dossiers.', durationMinutes: 10, phase: 'opening' },
        { id: 'gallery-incident', title: 'The fatal unveiling', description: 'Read the catalogue and discover the curator.', durationMinutes: 15, phase: 'opening' },
        { id: 'gallery-investigation', title: 'Open investigation', description: 'Trade information, bargain, and call a public accusation hearing.', durationMinutes: 90, phase: 'investigation' },
        { id: 'gallery-solution', title: 'Solution', description: 'Reveal the substitution and its consequences.', durationMinutes: 15, phase: 'reveal' },
      ],
      solutionSteps: [
        { title: 'The substituted work', truth: 'The donated painting was replaced before the opening.', evidence: ['gallery-evidence-1', 'gallery-evidence-2'] },
        { title: 'The fatal exposure', truth: 'The culprit silenced the curator when the catalogue proved the substitution.', evidence: ['gallery-evidence-3', 'gallery-evidence-4'] },
      ],
      openingSteps: [
        { id: 'gallery-welcome', title: 'Welcome the circle', trigger: 'When everyone is seated', instruction: 'Invite the first disclosures without moving anyone.', propIds: [] },
        { id: 'gallery-unveiling', title: 'Read the catalogue', trigger: 'After the welcome disclosures', instruction: 'Stage the curator’s off-page collapse with a bell, then release the room into free play in ordinary light.', propIds: [] },
      ],
      solution: 'Mara substituted the painting and silenced the curator before the catalogue could expose her.',
    },
    acts: [{ id: 'opening', title: 'The fatal unveiling', operatorGoal: 'Stage the discovery.', playerGoal: 'Meet the circle before free play.', durationMinutes: 15, completionLabel: 'Open the investigation →' }],
    clueDecks: [
      { id: 'gallery-labels', label: 'Gallery labels', settingField: 'playableSpaces', settingValue: 'Main gallery', clues: [1, 2, 3].map(index => ({ id: `gallery-clue-${index}`, text: `A label reveals discrepancy ${index}.` })) },
      { id: 'supper-notes', label: 'Supper notes', settingField: 'playableSpaces', settingValue: 'Seated supper area', clues: [4, 5].map(index => ({ id: `gallery-clue-${index}`, text: `A supper note reveals discrepancy ${index}.` })) },
    ],
    setupRequirements: [
      { id: 'public-floor', label: 'Keep all play on the public gallery floor.', settingField: 'safetyConstraints', settingValue: 'No player leaves the public gallery floor' },
      { id: 'seated-staging', label: 'Confirm the opening can be staged while seated.', settingField: 'accessibilityNeeds', settingValue: 'All essential staging is playable while seated' },
    ],
  }
}

describe('setting-specific game definitions', () => {
  it('uses objectives as the only player task model', () => {
    const definition = createGameDefinition(galleryInput())
    expect(definition.story.characters.every(character => character.objectives.length === 3)).toBe(true)
    expect(JSON.stringify(definition.story.characters)).not.toContain('"actions"')
    expect(JSON.stringify(definition.story.openingSteps)).not.toContain('actionIds')
    expect(definition.story.openingSteps).toHaveLength(2)
  })

  it('keeps physical setup links on host opening steps', () => {
    const definition = createDemoGame('setting-dependencies')
    for (const step of definition.story.openingSteps.filter(step => step.execution.kind === 'physical')) {
      expect(step.setupRequirementIds.length).toBeGreaterThan(0)
      expect(step.settingRefs.length).toBeGreaterThan(0)
    }
  })

  it('rejects a guided second act or a shortened free-play window', () => {
    const guided = structuredClone(createDemoGame('guided-after-body')) as any
    guided.acts.push({ id: 'interrogation', title: 'Guided interrogation', operatorGoal: 'Direct every conversation.', playerGoal: 'Wait.', durationMinutes: 10, completionLabel: 'Continue' })
    expect(() => createGameDefinition(guided)).toThrow(/exactly one short authored opening/)
    const rushed = structuredClone(createDemoGame('rushed-free-play'))
    rushed.story.evening.find(stage => stage.phase === 'investigation')!.durationMinutes = 45
    expect(() => createGameDefinition(rushed)).toThrow(/one to three hours/)
  })

  it('plays and restores a complete non-blackout definition', () => {
    const definition = createGameDefinition(galleryInput())
    let enrolling = createGame(definition, new Date('2026-08-18T17:00:00Z'), 'gallery-session')
    enrolling = updateEnrolment(enrolling, {
      hostName: 'Host',
      seats: enrolling.setup.seats.map((seat, index) => ({ ...seat, humanName: `Player ${index + 1}` })),
      venue: Object.fromEntries(definition.setupRequirements.map(requirement => [requirement.id, true])),
    })
    let active = startGame(definition, prepareGame(definition, enrolling, { aiControllers: false }))
    for (const step of definition.story.openingSteps) active = completeOpeningStep(definition, active, step.id)
    active = advanceAct(definition, active)
    active = toggleEvidence(definition, active, 'gallery-evidence-1')
    active = toggleEvidence(definition, active, 'gallery-evidence-3')
    active = callAccusation(active, 'guest-2', 'guest-1', 'The catalogue and donation records expose the substitution.')
    active = advanceHearing(active)
    active = advanceHearing(active)
    active = advanceHearing(active)
    for (const character of definition.story.characters) active = castVote(definition, active, character.id, 'convict')
    const completed = completeGame(definition, active)
    expect(restoreGameSession(serializeGameState(definition, completed))).toEqual({ definition, state: completed })
  })
})
