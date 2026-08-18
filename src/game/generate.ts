import { cast, publicEvidence, runPlan, timeline } from './scenario.js'
import { compileStory } from './story/compile.js'
import type { Character, Story } from './types.js'

export function hashSeed(value: string) {
  let hash = 2166136261
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return hash >>> 0
}

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

export function generateGame(seed: string): Story {
  const cleanSeed = seed.trim() || 'grambois-bleu'
  const characters: Character[] = shuffle(cast, `${cleanSeed}:cast`).map(character => ({
    ...character,
    memories: shuffle(character.memories, `${cleanSeed}:${character.id}:memories`),
  }))

  return compileStory({
    id: 'le-carnet-bleu',
    seed: cleanSeed,
    title: 'Le Carnet Bleu',
    subtitle: 'A ridiculous French espionage murder mystery, played completely straight.',
    totalPeople: 6,
    hostRole: 'Le Maître Concierge, then Game Master',
    victim: 'Le Maître Concierge',
    culprit: 'Jacques Fromage',
    characters,
    publicEvidence,
    timeline,
    runPlan,
    solution: 'Jacques accidentally killed the Concierge during a blackout after a jacket switch made him believe Le Carnet Bleu had been planted on him. Madame Très-Bien then contaminated the scene while searching for the book.',
  })
}
