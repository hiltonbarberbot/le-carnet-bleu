import type { Character, TimelineBeat } from './types'

export const timeline: TimelineBeat[] = [
  { beat: 1, title: 'The old secret', truth: 'Le Maître Concierge kept Le Carnet Bleu, despite claiming it vanished years ago.', evidence: ['concierge-ledger', 'amelie-rumour'] },
  { beat: 2, title: 'The hiding place', truth: 'He hid the notebook inside Claude de la Piscine’s blue dinner jacket.', evidence: ['claude-pocket', 'madame-glimpse'] },
  { beat: 3, title: 'The switch', truth: 'François switched Claude and Jacques’s jackets as a secret dinner task.', evidence: ['francois-switch', 'pierre-witness'] },
  { beat: 4, title: 'The discovery', truth: 'Jacques found the notebook in what he believed was his own jacket and concluded the Concierge had framed him.', evidence: ['jacques-find', 'claude-label'] },
  { beat: 5, title: 'The route opens', truth: 'Pierre opened the terrace door as an innocent secret action.', evidence: ['pierre-door', 'amelie-draught'] },
  { beat: 6, title: 'Sixty seconds', truth: 'Amélie cut the electricity for sixty seconds, believing she was helping a harmless coded exchange.', evidence: ['amelie-blackout', 'francois-clock'] },
  { beat: 7, title: 'The confrontation', truth: 'Jacques entered the study through the terrace and demanded an explanation. The Concierge realised the jackets had been switched and laughed.', evidence: ['jacques-confronts', 'concierge-laugh'] },
  { beat: 8, title: 'The fatal shove', truth: 'Humiliated and furious, Jacques shoved him. The Concierge struck his head on the desk. It was not planned murder.', evidence: ['jacques-shove', 'doctor-wound'] },
  { beat: 9, title: 'The panic', truth: 'Jacques fled with Le Carnet Bleu before the lights returned.', evidence: ['jacques-flight', 'pierre-shadow'] },
  { beat: 10, title: 'The false culprit', truth: 'Madame Très-Bien found the dying Concierge and searched his desk for the notebook instead of helping him. Claude saw her over the body.', evidence: ['madame-search', 'claude-sees'] },
]

export const cast: Character[] = [
  {
    id: 'jacques', name: 'Jacques Fromage', title: 'Disgraced attaché for dairy intelligence', costume: 'Cream dinner jacket, medals of uncertain origin',
    publicFace: 'Smooth, vain, and offended by any cheese served below room temperature.', privateSecret: 'Years ago you sold one name from Le Carnet Bleu to clear a gambling debt. The Concierge knew.',
    memories: [
      { id: 'jacques-find', kind: 'chain', beat: 4, text: 'Tonight you found Le Carnet Bleu inside the jacket you believed was yours.' },
      { id: 'jacques-confronts', kind: 'chain', beat: 7, text: 'During the blackout you entered the study through the terrace. The Concierge laughed when you accused him of planting the book.' },
      { id: 'jacques-shove', kind: 'chain', beat: 8, text: 'You shoved him once. He fell against the desk. You did not mean to kill him.' },
      { id: 'jacques-flight', kind: 'chain', beat: 9, text: 'You took the notebook and fled before the lights returned.' },
      { id: 'jacques-duel', kind: 'colour', text: 'Claude once challenged you to a duel with cocktail umbrellas. You lost.' },
    ], actions: [{ id: 'jacques-toast', text: 'Insist on a toast to “the glorious ambiguity of loyalty”.', cue: 'After the first drink', consequence: 'Makes Jacques look theatrical and unstable.', essential: false }]
  },
  {
    id: 'madame', name: 'Madame Très-Bien', title: 'Widowed patroness of elegant treason', costume: 'Black silk, enormous sunglasses, one red glove',
    publicFace: 'Perfectly composed. Treats scandal as a seating-plan problem.', privateSecret: 'You have spent years trying to recover Le Carnet Bleu because your late husband appears inside it.',
    memories: [
      { id: 'madame-glimpse', kind: 'chain', beat: 2, text: 'Before dinner you glimpsed the Concierge slip something blue into Claude’s jacket.' },
      { id: 'madame-search', kind: 'chain', beat: 10, text: 'After the blackout you found him breathing faintly and searched the desk instead of helping.' },
      { id: 'madame-argument', kind: 'secret', text: 'You argued with the Concierge this afternoon and threatened to ruin him.' },
      { id: 'madame-ring', kind: 'colour', text: 'Amélie’s emerald ring belonged to your late husband.' },
      { id: 'madame-perfume', kind: 'colour', text: 'You deliberately wear the perfume the Concierge hated.' },
    ], actions: [{ id: 'madame-message', text: 'Pass Claude a note reading “The peacock remembers Nice.” Refuse to explain.', cue: 'Before the main course', consequence: 'Creates an apparently sinister link.', essential: false }]
  },
  {
    id: 'claude', name: 'Claude de la Piscine', title: 'Aquatic counter-intelligence aristocrat', costume: 'Blue dinner jacket, silk scarf, swimming goggles in pocket',
    publicFace: 'Claims to have invented underwater diplomacy.', privateSecret: 'You are not aristocratic. You inherited the title from a stolen hotel reservation.',
    memories: [
      { id: 'claude-pocket', kind: 'chain', beat: 2, text: 'Before dinner, your blue jacket felt oddly heavy at the inner pocket.' },
      { id: 'claude-label', kind: 'chain', beat: 4, text: 'Your jacket has a hand-sewn label: “C. de la Piscine”. Jacques’s does not.' },
      { id: 'claude-sees', kind: 'chain', beat: 10, text: 'When you reached the study, Madame Très-Bien stood over the body with his desk open.' },
      { id: 'claude-debt', kind: 'secret', text: 'You owe the Concierge twelve thousand francs and a trained flamingo.' },
      { id: 'claude-fear', kind: 'colour', text: 'Despite your title, you cannot swim.' },
    ], actions: [{ id: 'claude-napkin', text: 'Steal Jacques’s napkin and conceal it in your sleeve.', cue: 'When soup is served', consequence: 'A visible, suspicious piece of nonsense.', essential: false }]
  },
  {
    id: 'francois', name: 'François Croissant', title: 'Pastry magnate and occasional courier', costume: 'White tuxedo, flour-dusted carnation',
    publicFace: 'Cheerful, indiscreet, and constantly checking his watch.', privateSecret: 'Your bakery is a dead-drop network. Tonight’s tasks arrived through it.',
    memories: [
      { id: 'francois-switch', kind: 'chain', beat: 3, text: 'You were instructed to switch Jacques and Claude’s jackets. You did it, assuming it was a joke.' },
      { id: 'francois-clock', kind: 'chain', beat: 6, text: 'The blackout lasted almost exactly sixty seconds; you timed it by habit.' },
      { id: 'francois-letter', kind: 'secret', text: 'The instruction envelope bore Madame’s family crest, probably forged.' },
      { id: 'francois-kiss', kind: 'colour', text: 'Pierre kissed you at Cannes and has denied it ever since.' },
      { id: 'francois-recipe', kind: 'colour', text: 'The Concierge stole your recipe for diplomatic brioche.' },
    ], actions: [{ id: 'francois-action', text: 'Switch Jacques and Claude’s jackets without being seen.', cue: 'Once both have removed them', consequence: 'Moves the notebook from Claude to Jacques.', essential: true, beat: 3 }]
  },
  {
    id: 'pierre', name: 'Pierre Escargot', title: 'Retired field agent with suspiciously quick reflexes', costume: 'Green velvet, silver snail pin',
    publicFace: 'Slow-speaking observer who notices every exit.', privateSecret: 'You once worked for the Concierge and stole the study key for Amélie tonight.',
    memories: [
      { id: 'pierre-witness', kind: 'chain', beat: 3, text: 'You saw François carrying two dinner jackets near the hall.' },
      { id: 'pierre-door', kind: 'chain', beat: 5, text: 'You opened the terrace door because your secret instruction demanded it.' },
      { id: 'pierre-shadow', kind: 'chain', beat: 9, text: 'Near the end of the blackout, a man shaped like Jacques passed from the study toward the hall.' },
      { id: 'pierre-key', kind: 'secret', text: 'You stole the study key and gave it to Amélie before dinner.' },
      { id: 'pierre-cannes', kind: 'colour', text: 'François has mistaken your Cannes resuscitation training for a kiss.' },
    ], actions: [{ id: 'pierre-action', text: 'Open the terrace door and leave it open.', cue: 'When Marseille is mentioned', consequence: 'Creates Jacques’s unseen route to the study.', essential: true, beat: 5 }]
  },
  {
    id: 'amelie', name: 'Amélie Voulez-Vous', title: 'Cabaret cryptographer', costume: 'Sequins, opera gloves, emerald ring',
    publicFace: 'Speaks in questions and treats every sentence as a code.', privateSecret: 'You stole the study key, but only to copy the Concierge’s private radio frequencies.',
    memories: [
      { id: 'amelie-rumour', kind: 'chain', beat: 1, text: 'The Concierge once drunkenly admitted Le Carnet Bleu never left this house.' },
      { id: 'amelie-draught', kind: 'chain', beat: 5, text: 'Just before the blackout you felt a strong draught from the terrace.' },
      { id: 'amelie-blackout', kind: 'chain', beat: 6, text: 'You cut the electricity for sixty seconds because a coded message told you it would protect an exchange.' },
      { id: 'amelie-key', kind: 'secret', text: 'You stole the study key with Pierre’s help, but returned it before dinner.' },
      { id: 'amelie-song', kind: 'colour', text: 'Claude’s memoir is largely copied from your cabaret lyrics.' },
    ], actions: [{ id: 'amelie-action', text: 'Cut the electricity for exactly sixty seconds.', cue: 'Immediately after the coded toast', consequence: 'Provides cover for the confrontation and death.', essential: true, beat: 6 }]
  },
]
