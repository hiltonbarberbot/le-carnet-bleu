import { cast, clueDecks, openingSteps, publicEvidence, solutionSteps } from './scenario'
import { compileStory } from './story/compile'
import type { Character, Story } from './types'
import { hashString } from './random/hash'

export const hashSeed = hashString

function randomFrom(seed: string) {
  let state = hashSeed(seed) || 1
  return () => {
    state += 0x6d2b79f5
    let n = state
    n = Math.imul(n ^ (n >>> 15), n | 1)
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61)
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(items: T[], seed: string): T[] {
  const result = [...items]
  const random = randomFrom(seed)
  for (let index = result.length - 1; index > 0; index--) {
    const next = Math.floor(random() * (index + 1))
    ;[result[index], result[next]] = [result[next], result[index]]
  }
  return result
}

export function instantiateStory(story: Story, seed: string, purchasableEvidenceIds: ReadonlySet<string> = new Set()): Story {
  const cleanSeed = seed.trim() || story.seed
  const characters: Character[] = shuffle(story.characters, `${cleanSeed}:cast`).map(character => ({
    ...character,
    secrets: shuffle(character.secrets, `${cleanSeed}:${character.id}:secrets`),
  }))
  return compileStory({ ...structuredClone(story), seed: cleanSeed, characters }, purchasableEvidenceIds)
}

export function generateGame(seed: string): Story {
  const cleanSeed = seed.trim() || 'grambois-bleu'
  return instantiateStory({
    id: 'le-carnet-bleu',
    seed: cleanSeed,
    title: 'The Last Recording',
    subtitle: 'Five restitution packets. One stolen song. A sixth envelope meant to kill.',
    premise: 'Armand Delatour has summoned five people to Maison Bleue under five different promises of restitution. Before midnight, he intends to restore the authorship and royalties of La Dernière Marée, the famous waltz stolen from Anaïs Loret. He displays five sealed packets and the blue notebook that records fifteen years of profit and silence. During Anaïs’s surviving test recording, a sixth envelope addressed privately to Armand appears on the notebook. He opens it, pricks his thumb on the fictional poisoned sliver hidden inside, and collapses before the final refrain.',
    totalPeople: 6,
    host: { id: 'host', name: 'Armand Delatour', title: 'Former impresario, then Game Master' },
    victimRoleId: 'host',
    culpritRoleId: 'solange',
    characters: cast,
    publicEvidence,
    evening: [
      { id: 'briefing', title: 'Private briefing', description: 'Hand out the private dossiers, explain the three rules, and give each suspect ten tokens.', durationMinutes: 10, phase: 'opening' },
      { id: 'incident', title: 'The sixth envelope', description: 'The host runs one short, rehearsed cold open; Armand’s safe staged collapse begins the investigation.', durationMinutes: 10, phase: 'opening' },
      { id: 'free-play', title: 'Open investigation', description: 'For one to three hours, talk, pursue objectives, buy clues, trade, scheme, and call a public accusation whenever the room is ready.', durationMinutes: 90, phase: 'investigation' },
      { id: 'reveal', title: 'Reveal, scoring, and awards', description: 'Read the solution, score objectives and remaining tokens, then award best player, performance, and costume.', durationMinutes: 15, phase: 'reveal' },
    ],
    solutionSteps,
    caseTheory: {
      motiveStepId: 'hidden-publisher',
      meansStepId: 'deliberate-murder',
      opportunityStepId: 'sixth-envelope',
      actStepId: 'fatal-delivery',
      coverUpStepId: 'carbon-fragment',
    },
    openingSteps,
    solutionSummary: 'Anaïs Loret composed La Dernière Marée. Henri Valois disguised the purchase of her working score, registered the waltz in his own name, and became famous; Armand Delatour witnessed the bargain and suppressed questions about it. The largest royalty share still flowed to Éditions du Méridien, secretly owned by Solange Béraud. Armand’s restitution would have transferred the publisher and its royalties to Anaïs’s estate. Before dinner, Solange had Mathilde address an archive label over blue carbon, then kept the duplicate. She trimmed that duplicate into a label for a safe prop envelope fictionally rigged with a poisoned glass sliver and slipped it onto Armand’s notebook while Colette played Anaïs’s test recording. Armand opened the sixth envelope and collapsed. The copied handwriting pointed suspicion at Mathilde, whose separate retrieval of Anaïs’s score occurred only after the collapse. But Rémy had counted only five packets, Gabriel saw Solange at the notebook, and the torn blue corner in her folio fit the address label.',
  }, cleanSeed, new Set(clueDecks.flatMap(deck => deck.clues.map(clue => clue.id))))
}
