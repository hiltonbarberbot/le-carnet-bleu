import { generateGame } from './generate.js'
import { createAuthoredGame } from './story/authoring.js'

export const demoSetting = {
  venueName: 'Maison Bleue demo house',
  location: 'A fictional house on the Provençal coast',
  occasion: 'A formal six-person dinner arranged to demonstrate the game runtime',
  era: 'Interwar-inspired, without strict historical simulation',
  playableSpaces: ['Dining room', 'Staged study'],
  routes: ['A host-verified, step-free route connects the dining room and staged study'],
  usableFeatures: ['Controllable dining-room lights', 'Desk with a drawer'],
  availableProps: ['Blue notebook', 'Blunt prop paper knife', 'Replica letters', 'Paper notes and envelopes', 'Timer or gramophone track'],
  tone: 'Serious Golden Age mystery with restrained wit',
  safetyConstraints: ['No sharp objects', 'No physical contact', 'Only the host controls the lights'],
  accessibilityNeeds: ['All essential beats can be performed seated or by a named human proxy'],
  contentBoundaries: ['No graphic violence', 'No harm to children during play'],
}

export function createDemoGame(seed = 'maison-bleue-demo') {
  return createAuthoredGame({
    id: 'maison-bleue-demo',
    title: 'Maison Bleue demo',
    setting: demoSetting,
    story: generateGame(seed),
    acts: [
      {
        id: 'dinner',
        title: 'Dinner and the old accusation',
        operatorGoal: 'Establish the old injustice, expose the notebook, and prepare the reconstruction.',
        completionLabel: 'Begin the reconstruction →',
      },
      {
        id: 'blackout',
        title: 'The reconstructed minute',
        operatorGoal: 'Stage the murder and false-suspect discovery under safe host control.',
        completionLabel: 'End the reconstruction and investigate →',
      },
    ],
    setupRequirements: [
      { id: 'notebook', label: 'Prepare the blue notebook with its removable replica page.', settingField: 'availableProps', settingValue: 'Blue notebook' },
      { id: 'paper-knife', label: 'Prepare only the blunt prop paper knife.', settingField: 'availableProps', settingValue: 'Blunt prop paper knife' },
      { id: 'replica-letters', label: 'Place the replica letters where the host can retrieve them.', settingField: 'availableProps', settingValue: 'Replica letters' },
      { id: 'paper-notes', label: 'Prepare the private note and envelope.', settingField: 'availableProps', settingValue: 'Paper notes and envelopes' },
      { id: 'safe-route', label: 'Verify the route between the dining room and staged area.', settingField: 'routes', settingValue: 'A host-verified, step-free route connects the dining room and staged study' },
      { id: 'controlled-lights', label: 'Verify the host-controlled lighting and timer.', settingField: 'usableFeatures', settingValue: 'Controllable dining-room lights' },
      { id: 'staged-area', label: 'Clear the staged study area and desk.', settingField: 'playableSpaces', settingValue: 'Staged study' },
      { id: 'no-contact', label: 'Rehearse every physical beat without contact.', settingField: 'safetyConstraints', settingValue: 'No physical contact' },
    ],
  })
}
