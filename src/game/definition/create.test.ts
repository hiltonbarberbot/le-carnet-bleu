import { describe, expect, it } from 'vitest'
import {
  advanceAct,
  beginDelivery,
  completeGame,
  confirmRunBeat,
  createGame,
  prepareGame,
  recordDeliveryOutcome,
  requestDelivery,
  revealToTable,
  startGame,
  toggleEvidence,
  updateAccusation,
  updateEnrolment,
} from '../session/lifecycle'
import { restoreGameSession, serializeGameState } from '../session/storage'
import type { Character, Story } from '../types'
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
    goals: [1, 2, 3].map(goal => ({ id: `gallery-goal-${index + 1}-${goal}`, title: `Goal ${goal}`, text: `Complete gallery objective ${goal}.`, phase: 'any', points: 1 })),
    abilities: [1, 2].map(ability => ({ id: `gallery-ability-${index + 1}-${ability}`, title: `Ability ${ability}`, text: `Use gallery ability ${ability} once.`, uses: 1 as const })),
    item: { title: `Gallery item ${index + 1}`, text: 'A playable object connected to the disputed donation.' },
    relationships: [1, 2].map(offset => ({ roleId: `guest-${((index + offset) % names.length) + 1}`, kind: offset === 1 ? 'approach' as const : 'watch' as const, text: 'A useful connection in the gallery circle.' })),
    dilemma: 'Choose between protecting your reputation and telling the truth about the donation.',
    memories: [{
      id: `gallery-evidence-${index + 1}`,
      kind: 'evidence',
      beat: index < 2 ? 1 : 2,
      text: `You observed gallery evidence ${index + 1}.`,
    }],
    actions: [{
      id: `gallery-action-${index + 1}`,
      text: index < 3 ? 'State your connection to the donated painting.' : 'Reveal the discrepancy you noticed in the catalogue.',
      cue: index < 3 ? 'During the welcome' : 'During the unveiling',
      consequence: 'Places one authored fact into play.',
      essential: true,
      beat: index < 3 ? 1 : 2,
      phase: index < 3 ? 'welcome' : 'unveiling',
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
      { id: 'gallery-arrival', title: 'Arrival', description: 'Meet the gallery circle.', durationMinutes: 15, phase: 'welcome' },
      { id: 'gallery-reveal', title: 'Unveiling', description: 'Read the catalogue and investigate.', durationMinutes: 30, phase: 'unveiling' },
      { id: 'gallery-investigation', title: 'Investigation', description: 'Compare evidence and make private accusations.', durationMinutes: 35, phase: 'investigation' },
      { id: 'gallery-solution', title: 'Solution', description: 'Reveal the substitution and its consequences.', durationMinutes: 15, phase: 'reveal' },
    ],
    timeline: [
      { beat: 1, title: 'The substituted work', truth: 'The donated painting was replaced before the opening.', evidence: ['gallery-evidence-1', 'gallery-evidence-2'] },
      { beat: 2, title: 'The fatal exposure', truth: 'The culprit silenced the curator when the catalogue proved the substitution.', evidence: ['gallery-evidence-3', 'gallery-evidence-4'] },
    ],
    runPlan: [
      { id: 'gallery-welcome', phase: 'welcome', title: 'Welcome the circle', trigger: 'When everyone is seated', operator: 'Invite the first disclosures without moving anyone.', actionIds: ['gallery-action-1', 'gallery-action-2', 'gallery-action-3'], dependsOn: [], essential: true },
      { id: 'gallery-unveiling', phase: 'unveiling', title: 'Read the catalogue', trigger: 'After the welcome disclosures', operator: 'Stage the curator’s off-page collapse with a bell, then continue in ordinary light.', actionIds: ['gallery-action-4', 'gallery-action-5'], dependsOn: ['gallery-welcome'], essential: true },
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
      occasion: 'A private exhibition opening with a seated supper',
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
      { id: 'welcome', title: 'The welcome', operatorGoal: 'Establish the relationships around the donation.', playerGoal: 'Meet the circle and share one fact.', durationMinutes: 15, completionLabel: 'Begin the unveiling →' },
      { id: 'unveiling', title: 'The unveiling', operatorGoal: 'Expose the catalogue discrepancy and stage the discovery.', playerGoal: 'Compare the catalogue with what you know.', durationMinutes: 30, completionLabel: 'Begin the investigation →' },
    ],
    setupRequirements: [
      { id: 'public-floor', label: 'Keep all play on the public gallery floor.', settingField: 'safetyConstraints', settingValue: 'No player leaves the public gallery floor' },
      { id: 'seated-actions', label: 'Confirm every essential action can be performed seated.', settingField: 'accessibilityNeeds', settingValue: 'All essential actions are playable while seated' },
    ],
  })
}

describe('setting-specific game definitions', () => {
  it('rejects undeclared acts and unverified physical requirements', () => {
    const input = galleryDefinition()
    const broken = structuredClone(input)
    broken.story.characters[0].actions[0].phase = 'blackout'
    broken.story.characters[0].actions[0].physical = true
    expect(() => createGameDefinition(broken)).toThrow(/undeclared act blackout/)
  })

  it('plays and restores a complete non-blackout definition without demo assumptions', () => {
    const definition = galleryDefinition()
    expect(JSON.stringify(definition.story)).not.toMatch(/blackout|terrace|study|paper knife|weapon/i)
    expect(definition.setting.safetyConstraints).toContain('Keep the lights on')

    let enrolling = createGame(definition, new Date('2026-08-18T17:00:00Z'), 'gallery-session')
    enrolling = updateEnrolment(enrolling, {
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
    expect(active.playPhase).toBe('welcome')
    active = confirmRunBeat(definition, active, 'gallery-welcome')
    active = advanceAct(definition, active)
    expect(active.playPhase).toBe('unveiling')
    active = confirmRunBeat(definition, active, 'gallery-unveiling')
    active = advanceAct(definition, active)
    expect(active.playPhase).toBe('investigation')
    active = toggleEvidence(active, 'gallery-evidence-1')
    active = toggleEvidence(active, 'gallery-evidence-3')
    for (const character of definition.story.characters) active = updateAccusation(active, character.id, { culprit: names[0], motive: 'Conceal the substitution.', chain: 'Donation, catalogue, exposure.' })
    active = revealToTable(definition, active)
    const completed = completeGame(active)
    const restored = restoreGameSession(serializeGameState(definition, completed))
    expect(restored).toEqual({ definition, state: completed })
  })
})
