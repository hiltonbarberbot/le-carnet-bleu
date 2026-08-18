import { describe, expect, it } from 'vitest'
import manifest from '../../../game.manifest.json'
import { createDemoGame, demoSetting } from '../demo'
import { createSettingBrief, getSettingBriefBlockers, settingQuestions } from '../setting/brief'
import { createAuthoredGame, createStoryAuthoringBrief } from './authoring'

describe('setting-first story authoring', () => {
  it('keeps the portable manifest questions synchronized with the code contract', () => {
    expect(manifest.authoring.settingQuestions).toEqual(settingQuestions.map(({ id, prompt, required }) => ({ id, prompt, required })))
  })

  it('blocks story work until the physical setting is complete', () => {
    expect(getSettingBriefBlockers({ venueName: 'A house' })).toEqual(expect.arrayContaining([
      expect.stringContaining('Where is the venue'),
      expect.stringContaining('Which rooms or outdoor areas'),
      expect.stringContaining('What physical, privacy, timing, or venue rules'),
    ]))
    expect(() => createSettingBrief({ venueName: 'A house' })).toThrow(/Setting brief is incomplete/)
  })

  it('turns a validated setting into a bounded agent authoring brief', () => {
    const brief = createStoryAuthoringBrief(demoSetting)
    expect(brief).toContain('Maison Bleue demo house')
    expect(brief).toContain('Do not invent rooms, routes, props')
    expect(brief).toContain('No sharp objects')
  })

  it('packages a compiled story with the setting required by the runtime', () => {
    const demo = createDemoGame('authored')
    const authored = createAuthoredGame({
      id: demo.id,
      title: demo.title,
      setting: demo.setting,
      story: demo.story,
      acts: demo.acts,
      setupRequirements: demo.setupRequirements,
    })
    expect(authored).toEqual(demo)
    expect(authored.setting.playableSpaces).toHaveLength(2)
    expect(authored.story.characters).toHaveLength(5)
  })
})
