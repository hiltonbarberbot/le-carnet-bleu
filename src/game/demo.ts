import { generateGame } from './generate.js'
import { createAuthoredStoryline } from './story/authoring.js'
import { clueDecks } from './scenario.js'

export const demoSetting = {
  venueName: 'Maison Bleue demo house',
  location: 'A fictional house on the Provençal coast',
  era: 'Interwar-inspired, without strict historical simulation',
  playableSpaces: ['Dining room', 'Staged study'],
  routes: ['A host-verified, step-free route connects the dining room and staged study'],
  usableFeatures: ['Controllable dining-room lights', 'Desk with a drawer'],
  availableProps: ['Blue notebook', 'Two replica scores', 'Paper notes and envelopes', 'Timer or gramophone track', 'Blue handkerchief', 'Blue document folio'],
  tone: 'Serious Golden Age mystery with restrained wit',
  safetyConstraints: ['No sharp objects', 'No physical contact', 'Only the host controls the lights'],
  accessibilityNeeds: ['All essential beats can be performed seated or by a named human proxy'],
  contentBoundaries: ['No graphic violence', 'No harm to children during play'],
}

export function createDemoStoryline(seed = 'maison-bleue-demo') {
  return createAuthoredStoryline({
    id: 'maison-bleue-demo',
    title: 'Maison Bleue demo',
    setting: demoSetting,
    story: generateGame(seed),
    clueDecks,
    acts: [
      {
        id: 'opening',
        title: 'The last recording',
        operatorGoal: 'Expose the stolen authorship, stage the safe envelope murder, then become Game Master and release the room into free play.',
        playerGoal: 'Introduce your claim, follow only your private host cue, and wait for Armand’s collapse before bargaining begins.',
        durationMinutes: 10,
        completionLabel: 'Open the investigation →',
      },
    ],
    setupRequirements: [
      { id: 'notebook', label: 'Prepare the blue notebook as Armand’s royalty ledger.', settingField: 'availableProps', settingValue: 'Blue notebook' },
      { id: 'replica-scores', label: 'Prepare Mathilde’s working copy and a separate original-score replica for the staged-study drawer.', settingField: 'availableProps', settingValue: 'Two replica scores' },
      { id: 'paper-notes', label: 'Prepare the five authored restitution packets; give Mathilde the retained top archive label; attach its missing-corner carbon duplicate to the host-identifiable safe murder envelope; place the evidence card inside.', settingField: 'availableProps', settingValue: 'Paper notes and envelopes' },
      { id: 'recording-track', label: 'Prepare the gramophone track used for Anaïs’s test recording.', settingField: 'availableProps', settingValue: 'Timer or gramophone track' },
      { id: 'handkerchief', label: 'Give Colette the blue handkerchief used to cue Mathilde after the collapse.', settingField: 'availableProps', settingValue: 'Blue handkerchief' },
      { id: 'solange-folio', label: 'Give Solange the blue document folio with the matching torn label corner protruding from its inner pocket.', settingField: 'availableProps', settingValue: 'Blue document folio' },
      { id: 'staged-area', label: 'Clear the staged study area and desk.', settingField: 'playableSpaces', settingValue: 'Staged study' },
      { id: 'no-contact', label: 'Rehearse the seated collapse and every paper handoff without contact.', settingField: 'safetyConstraints', settingValue: 'No physical contact' },
    ],
  })
}

/** @deprecated Use createDemoStoryline. */
export const createDemoGame = createDemoStoryline
