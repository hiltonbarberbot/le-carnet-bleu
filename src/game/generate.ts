import { cast, clueDecks, publicEvidence, runPlan, timeline } from './scenario.js'
import { compileStory } from './story/compile.js'
import type { Character, Story } from './types.js'
import { hashString } from './random/hash.js'

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
    title: 'Le Carnet Bleu',
    subtitle: 'Five guests came to recover five different secrets. Only one was willing to kill for theirs.',
    premise: 'Armand Valère has summoned five people to Maison Bleue, each under a respectable pretext and each with a different private promise: before midnight, he will return what he took from them. As soon as they assemble, Armand turns those private settlements into a shared reckoning and recreates the one minute of darkness that condemned Luc Bellande. When the lights return, Armand is dead and every guest has a motive, a secret, and unfinished business with the others.',
    totalPeople: 6,
    hostRole: 'Armand Valère, keeper of Le Carnet Bleu, then Game Master',
    victim: 'Armand Valère',
    culprit: 'Jacques Vallon',
    characters: cast,
    publicEvidence,
    evening: [
      { id: 'briefing', title: 'Private briefing', description: 'Hand out the private dossiers, explain the three rules, and give each suspect ten tokens.', durationMinutes: 10, phase: 'opening' },
      { id: 'incident', title: 'The murder', description: 'The host runs one short, rehearsed cold open; the body is discovered before free play begins.', durationMinutes: 10, phase: 'opening' },
      { id: 'free-play', title: 'Open investigation', description: 'For one to three hours, talk, pursue objectives, buy clues, trade, scheme, and call a public accusation whenever the room is ready.', durationMinutes: 90, phase: 'investigation' },
      { id: 'reveal', title: 'Reveal, scoring, and awards', description: 'Read the solution, score objectives and remaining tokens, then award best player, performance, and costume.', durationMinutes: 15, phase: 'reveal' },
    ],
    timeline,
    runPlan,
    solution: 'Armand lured every guest to Maison Bleue with a different private promise, then revealed that the supposed settlements were one shared reckoning. Jacques Vallon deliberately murdered him during the reconstructed blackout. Sixteen years earlier, Jacques had stolen the Saint-Auban sapphire and allowed Luc Bellande to die in prison for it. Armand recorded the truth on page forty-seven of Le Carnet Bleu and blackmailed everyone who helped suppress it. Jacques borrowed Hélène’s silver paper knife in advance, used the host-verified passage to reach the staged study, killed Armand, tore out the page naming him, and left the weapon to frame Hélène. She was found beside the body only because she had entered moments later to recover Luc’s love letters.',
  }, cleanSeed, new Set(clueDecks.flatMap(deck => deck.clues.map(clue => clue.id))))
}
