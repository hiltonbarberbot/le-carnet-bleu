import { generateGame } from './generate.js'
import { createAuthoredGame } from './story/authoring.js'
import { clueDecks } from './scenario.js'

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
    clueDecks,
    acts: [
      {
        id: 'schemes',
        title: 'Arrival and first schemes',
        operatorGoal: 'Welcome the characters, then let them pursue private objectives without directing every conversation.',
        playerGoal: 'Introduce yourself, begin with the people named on your card, and attempt at least one objective.',
        durationMinutes: 20,
        completionLabel: 'Call everyone to the reckoning →',
      },
      {
        id: 'reckoning',
        title: 'The public reckoning',
        operatorGoal: 'Expose the notebook and old case while leaving room for bargains, objections, and accusations.',
        playerGoal: 'Use what you learned, challenge another guest, and decide what truth to reveal before the reconstruction.',
        durationMinutes: 25,
        completionLabel: 'Begin the reconstructed minute →',
      },
      {
        id: 'murder',
        title: 'The reconstructed minute',
        operatorGoal: 'Perform the one short, rehearsed incident and bring everyone immediately back together.',
        playerGoal: 'Follow only your host cue. Everyone else stays at the table and listens.',
        durationMinutes: 5,
        completionLabel: 'Turn on the lights and investigate →',
      },
    ],
    setupRequirements: [
      { id: 'notebook', label: 'Prepare the blue notebook with its removable replica page.', settingField: 'availableProps', settingValue: 'Blue notebook' },
      { id: 'paper-knife', label: 'Prepare only the blunt prop paper knife.', settingField: 'availableProps', settingValue: 'Blunt prop paper knife' },
      { id: 'replica-letters', label: 'Place the replica letters where the host can retrieve them.', settingField: 'availableProps', settingValue: 'Replica letters' },
      { id: 'paper-notes', label: 'Prepare the private note and envelope.', settingField: 'availableProps', settingValue: 'Paper notes and envelopes' },
      { id: 'timer-track', label: 'Prepare the timer or gramophone track used for the reconstructed minute.', settingField: 'availableProps', settingValue: 'Timer or gramophone track' },
      { id: 'safe-route', label: 'Verify the route between the dining room and staged area.', settingField: 'routes', settingValue: 'A host-verified, step-free route connects the dining room and staged study' },
      { id: 'controlled-lights', label: 'Verify the host-controlled lighting and timer.', settingField: 'usableFeatures', settingValue: 'Controllable dining-room lights' },
      { id: 'staged-area', label: 'Clear the staged study area and desk.', settingField: 'playableSpaces', settingValue: 'Staged study' },
      { id: 'no-contact', label: 'Rehearse every physical beat without contact.', settingField: 'safetyConstraints', settingValue: 'No physical contact' },
    ],
  })
}
