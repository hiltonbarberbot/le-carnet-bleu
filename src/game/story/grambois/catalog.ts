import type { StorylineDefinitionInput } from '../../definition/contract'
import { createStorylineDefinition } from '../../definition/create'
import blueCicada from '../../../../story/runs/blue-cicada/story.json'
import cottageAtMidnight from '../../../../story/runs/cottage-at-midnight/story.json'
import glassEmbassy from '../../../../story/runs/glass-embassy/story.json'
import lastOrphicSummer from '../../../../story/runs/last-orphic-summer/story.json'
import mistralCipher from '../../../../story/runs/mistral-cipher/story.json'
import saintTropezDouble from '../../../../story/runs/saint-tropez-double/story.json'
import velvetConsul from '../../../../story/runs/velvet-consul/story.json'
import griefOfTheDove from '../../../../story/runs/grief-of-the-dove/story.json'

const storylines = [
  griefOfTheDove,
  glassEmbassy,
  blueCicada,
  velvetConsul,
  mistralCipher,
  saintTropezDouble,
  cottageAtMidnight,
  lastOrphicSummer,
] as unknown as StorylineDefinitionInput[]

export function createGramboisCatalog() {
  return storylines.map(createStorylineDefinition)
}
