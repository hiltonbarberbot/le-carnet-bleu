import { describe, expect, it } from 'vitest'
import {
  advanceAct,
  advanceHearing,
  beginDelivery,
  callAccusation,
  castVote,
  completeGame,
  confirmRunBeat,
  createGame,
  prepareGame,
  recordDeliveryOutcome,
  requestDelivery,
  startGame,
  toggleEvidence,
  updateEnrolment,
} from '../session/lifecycle'
import { restoreGameSession, serializeGameState } from '../session/storage'
import type { Character, Story } from '../types'
import { createDemoGame } from '../demo'
import { createGameDefinition } from './create'

const names = ['Mara Vale', 'Jon Bell', 'Iris Chen', 'Noor Aziz', 'Theo March']

function galleryStory(): Story {
  const characters: Character[] = names.map((name, index) => ({
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
    objectives: [1, 2, 3].map(objective => ({ id: `gallery-objective-${index + 1}-${objective}`, title: `Objective ${objective}`, text: `Complete gallery objective ${objective}.`, phase: 'any', points: objective })),
    relationships: [1, 2].map(offset => ({ roleId: `guest-${((index + offset) % names.length) + 1}`, text: 'A useful connection in the gallery circle.' })),
    secrets: [{
      id: `gallery-evidence-${index + 1}`,
      kind: 'evidence',
      beat: index < 2 ? 1 : 2,
      aboutRoleIds: [`guest-${((index + 1) % names.length) + 1}`],
      text: `You observed gallery evidence ${index + 1}.`,
    }],
    actions: [{
      id: `gallery-action-${index + 1}`,
      text: index < 3 ? 'State your connection to the donated painting.' : 'Reveal the discrepancy you noticed in the catalogue.',
      cue: index < 3 ? 'During the welcome' : 'During the unveiling',
      consequence: 'Places one authored fact into play.',
      essential: true,
      beat: index < 3 ? 1 : 2,
      phase: 'opening',
      physical: false,
      requires: [],
    }],
  }))
  return {
    id: 'gallery-last-label',
    seed: 'gallery-opening',
    title: 'The Last Label',
    subtitle: 'A present-day gallery mystery played entirely in ordinary light.',
    premise: 'Five gallery guests accepted respectable invitations while privately seeking answers about a disputed donation.',
    totalPeople: 6,
    hostRole: 'The gallery curator, then Game Master',
    victim: 'The gallery curator',
    culprit: names[0],
    characters,
    publicEvidence: [],
    evening: [
      { id: 'gallery-briefing', title: 'Private briefing', description: 'Meet the gallery circle and review private dossiers.', durationMinutes: 10, phase: 'opening' },
      { id: 'gallery-incident', title: 'The fatal unveiling', description: 'Read the catalogue and discover the curator.', durationMinutes: 15, phase: 'opening' },
      { id: 'gallery-investigation', title: 'Open investigation', description: 'Trade information, bargain, and call a public accusation hearing.', durationMinutes: 90, phase: 'investigation' },
      { id: 'gallery-solution', title: 'Solution', description: 'Reveal the substitution and its consequences.', durationMinutes: 15, phase: 'reveal' },
    ],
    timeline: [
      { beat: 1, title: 'The substituted work', truth: 'The donated painting was replaced before the opening.', evidence: ['gallery-evidence-1', 'gallery-evidence-2'] },
      { beat: 2, title: 'The fatal exposure', truth: 'The culprit silenced the curator when the catalogue proved the substitution.', evidence: ['gallery-evidence-3', 'gallery-evidence-4'] },
    ],
    runPlan: [
      { id: 'gallery-welcome', phase: 'opening', title: 'Welcome the circle', trigger: 'When everyone is seated', operator: 'Invite the first disclosures without moving anyone.', actionIds: ['gallery-action-1', 'gallery-action-2', 'gallery-action-3'], dependsOn: [], essential: true },
      { id: 'gallery-unveiling', phase: 'opening', title: 'Read the catalogue', trigger: 'After the welcome disclosures', operator: 'Stage the curator’s off-page collapse with a bell, then release the room into free play in ordinary light.', actionIds: ['gallery-action-4', 'gallery-action-5'], dependsOn: ['gallery-welcome'], essential: true },
    ],
    solution: 'Mara substituted the painting and silenced the curator before the catalogue could expose her.',
  }
}

function galleryDefinition() {
  return createGameDefinition({
    id: 'gallery-opening',
    title: 'Gallery opening',
    setting: {
      venueName: 'North Room Gallery',
      location: 'A street-level contemporary gallery in Lyon',
      era: 'Present day',
      playableSpaces: ['Main gallery', 'Seated supper area'],
      routes: ['A level, public route connects both areas'],
      usableFeatures: ['A service bell', 'Printed wall labels'],
      availableProps: ['Printed catalogues'],
      tone: 'Elegant contemporary intrigue',
      safetyConstraints: ['Keep the lights on', 'No physical contact', 'No player leaves the public gallery floor'],
      accessibilityNeeds: ['All essential actions are playable while seated'],
      contentBoundaries: ['No weapons', 'No graphic violence'],
    },
    story: galleryStory(),
    acts: [
      { id: 'opening', title: 'The fatal unveiling', operatorGoal: 'Establish the relationships, expose the catalogue discrepancy, and stage the discovery.', playerGoal: 'Meet the circle, share one fact, and follow the opening cue until the curator is discovered.', durationMinutes: 15, completionLabel: 'Open the investigation →' },
    ],
    clueDecks: [
      {
        id: 'gallery-labels',
        label: 'Gallery labels',
        settingField: 'playableSpaces',
        settingValue: 'Main gallery',
        clues: [1, 2, 3].map(index => ({ id: `gallery-clue-${index}`, beat: index < 3 ? 1 : 2, text: `A label reveals discrepancy ${index}.` })),
      },
      {
        id: 'supper-notes',
        label: 'Supper notes',
        settingField: 'playableSpaces',
        settingValue: 'Seated supper area',
        clues: [4, 5].map(index => ({ id: `gallery-clue-${index}`, beat: 2, text: `A supper note reveals discrepancy ${index}.` })),
      },
    ],
    setupRequirements: [
      { id: 'public-floor', label: 'Keep all play on the public gallery floor.', settingField: 'safetyConstraints', settingValue: 'No player leaves the public gallery floor' },
      { id: 'seated-actions', label: 'Confirm every essential action can be performed seated.', settingField: 'accessibilityNeeds', settingValue: 'All essential actions are playable while seated' },
    ],
  })
}

describe('setting-specific game definitions', () => {
  it('binds every clue source and physical dependency to the validated setting', () => {
    const definition = galleryDefinition()
    expect(definition.clueDecks).toHaveLength(2)
    expect(definition.clueDecks.flatMap(deck => deck.clues)).toHaveLength(5)
    for (const deck of definition.clueDecks) expect(definition.setting[deck.settingField]).toContain(deck.settingValue)

    const physicalDefinition = createDemoGame('setting-dependencies')
    const requirements = new Map(physicalDefinition.setupRequirements.map(requirement => [requirement.id, requirement]))
    for (const action of physicalDefinition.story.characters.flatMap(character => character.actions).filter(action => action.physical)) {
      expect(action.requires.length).toBeGreaterThan(0)
      for (const requirementId of action.requires) {
        const requirement = requirements.get(requirementId)!
        expect(physicalDefinition.setting[requirement.settingField]).toContain(requirement.settingValue)
      }
    }
  })

  it('rejects undeclared acts and unverified physical requirements', () => {
    const input = galleryDefinition()
    const broken = structuredClone(input)
    broken.story.characters[0].actions[0].phase = 'blackout'
    broken.story.characters[0].actions[0].physical = true
    expect(() => createGameDefinition(broken)).toThrow(/undeclared act blackout/)
  })

  it('rejects a guided second act or a shortened free-play window', () => {
    const guided = structuredClone(createDemoGame('guided-after-body'))
    guided.acts.push({
      id: 'interrogation',
      title: 'Guided interrogation',
      operatorGoal: 'Direct every conversation.',
      playerGoal: 'Wait for the next prompt.',
      durationMinutes: 10,
      completionLabel: 'Continue',
    })
    expect(() => createGameDefinition(guided)).toThrow(/exactly one short authored opening/)

    const rushed = structuredClone(createDemoGame('rushed-free-play'))
    rushed.story.evening.find(stage => stage.phase === 'investigation')!.durationMinutes = 45
    expect(() => createGameDefinition(rushed)).toThrow(/one to three hours/)
  })

  it('plays and restores a complete non-blackout definition without demo assumptions', () => {
    const definition = galleryDefinition()
    expect(JSON.stringify(definition.story)).not.toMatch(/blackout|terrace|study|paper knife|weapon/i)
    expect(definition.setting.safetyConstraints).toContain('Keep the lights on')

    let enrolling = createGame(definition, new Date('2026-08-18T17:00:00Z'), 'gallery-session')
    enrolling = updateEnrolment(enrolling, {
      peoplePlaying: 6,
      hostName: 'Host',
      seats: enrolling.setup.seats.map((seat, index) => ({
        ...seat,
        participantId: `gallery-human-${index}`,
        humanName: `Player ${index + 1}`,
        privateAddress: `private:gallery:${index}`,
        ready: true,
      })),
      venue: Object.fromEntries(definition.setupRequirements.map(requirement => [requirement.id, true])),
    })
    let prepared = prepareGame(definition, enrolling, { aiControllers: false })
    for (const roleId of Object.keys(prepared.deliveries)) {
      prepared = requestDelivery(prepared, roleId)
      prepared = beginDelivery(prepared, roleId)
      prepared = recordDeliveryOutcome(prepared, roleId, { ok: true, receipt: `gallery:${roleId}` })
    }
    let active = startGame(definition, prepared)
    expect(active.playPhase).toBe('opening')
    active = confirmRunBeat(definition, active, 'gallery-welcome')
    active = confirmRunBeat(definition, active, 'gallery-unveiling')
    active = advanceAct(definition, active)
    expect(active.playPhase).toBe('investigation')
    active = toggleEvidence(active, 'gallery-evidence-1')
    active = toggleEvidence(active, 'gallery-evidence-3')
    active = callAccusation(active, 'guest-2', 'guest-1', 'The catalogue and donation records expose the substitution.')
    active = advanceHearing(active)
    active = advanceHearing(active)
    active = advanceHearing(active)
    for (const character of definition.story.characters) active = castVote(definition, active, character.id, 'convict')
    const completed = completeGame(definition, active)
    const restored = restoreGameSession(serializeGameState(definition, completed))
    expect(restored).toEqual({ definition, state: completed })
  })
})
