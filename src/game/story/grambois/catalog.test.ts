import { describe, expect, it } from 'vitest'
import { createGramboisCatalog } from './catalog'
import { gramboisSetting } from './setting'

describe('Grambois storyline catalog', () => {
  it('contains seven distinct validated mysteries for the verified house', () => {
    const catalog = createGramboisCatalog()

    expect(catalog).toHaveLength(7)
    expect(new Set(catalog.map(storyline => storyline.fingerprint)).size).toBe(7)
    expect(new Set(catalog.map(storyline => storyline.story.culprit)).size).toBe(7)
    for (const storyline of catalog) {
      expect(storyline.setting).toEqual(gramboisSetting)
      expect(storyline.story.characters).toHaveLength(5)
      expect(storyline.story.premise).not.toContain('real occasion')
      expect(storyline.clueDecks.flatMap(deck => deck.clues)).toHaveLength(5)
    }
  })
})
