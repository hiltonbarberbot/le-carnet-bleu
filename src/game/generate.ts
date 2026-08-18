import { cast, publicEvidence, runPlan, timeline } from './scenario.js'
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

export function instantiateStory(story: Story, seed: string): Story {
  const cleanSeed = seed.trim() || story.seed
  const characters: Character[] = shuffle(story.characters, `${cleanSeed}:cast`).map(character => ({
    ...character,
    memories: shuffle(character.memories, `${cleanSeed}:${character.id}:memories`),
  }))
  return compileStory({ ...structuredClone(story), seed: cleanSeed, characters })
}

export function generateGame(seed: string): Story {
  const cleanSeed = seed.trim() || 'grambois-bleu'
  return instantiateStory({
    id: 'le-carnet-bleu',
    seed: cleanSeed,
    title: 'Le Carnet Bleu',
    subtitle: 'A closed-circle mystery of an old injustice, a missing page, and one fatal minute of darkness.',
    totalPeople: 6,
    hostRole: 'Armand Valère, keeper of Le Carnet Bleu, then Game Master',
    victim: 'Armand Valère',
    culprit: 'Jacques Vallon',
    characters: cast,
    publicEvidence,
    timeline,
    runPlan,
    solution: 'Jacques Vallon deliberately murdered Armand Valère during the reconstructed blackout. Sixteen years earlier, Jacques had stolen the Saint-Auban sapphire and allowed Luc Bellande to die in prison for it. Armand recorded the truth on page forty-seven of Le Carnet Bleu and blackmailed everyone who helped suppress it. Jacques borrowed Hélène’s silver paper knife in advance, used the open terrace to reach the study, killed Armand, tore out the page naming him, and left the weapon to frame Hélène. She was found beside the body only because she had entered moments later to recover Luc’s love letters.',
  }, cleanSeed)
}
