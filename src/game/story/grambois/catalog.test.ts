import { describe, expect, it } from 'vitest'
import { createGramboisCatalog } from './catalog'
import { gramboisSetting } from './setting'

describe('Grambois storyline catalog', () => {
  it('contains La Colombe and seven distinct companion mysteries for the verified house', () => {
    const catalog = createGramboisCatalog()

    expect(catalog).toHaveLength(8)
    expect(catalog[0].story.title).toBe('La Colombe')
    expect(new Set(catalog.map(storyline => storyline.fingerprint)).size).toBe(8)
    expect(new Set(catalog.map(storyline => storyline.story.culprit)).size).toBe(8)
    for (const storyline of catalog) {
      expect(storyline.setting.venueName).toBe(gramboisSetting.venueName)
      expect(storyline.setting.location).toBe(gramboisSetting.location)
      expect(storyline.setting.playableSpaces).toEqual(gramboisSetting.playableSpaces)
      expect(storyline.setting.routes).toEqual(gramboisSetting.routes)
      expect(storyline.story.characters).toHaveLength(5)
      expect(storyline.story.premise).not.toContain('real occasion')
      expect(storyline.clueDecks.flatMap(deck => deck.clues)).toHaveLength(5)
    }
  })
})
