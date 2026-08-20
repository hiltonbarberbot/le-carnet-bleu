import { describe, expect, it } from 'vitest'
import manifest from '../../../game.manifest.json'
import { createDemoStoryline, demoSetting } from '../demo'
import { createSettingBrief, getSettingBriefBlockers, settingQuestions } from '../setting/brief'
import { createAuthoredStoryline, createStoryAuthoringBrief } from './authoring'
import { productNaming } from '../../product/naming'

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
    expect(brief).toContain(`# ${productNaming.name} authoring brief`)
    expect(brief).toContain('Maison Bleue demo house')
    expect(brief).toContain('Do not invent rooms, routes, props')
    expect(brief).toContain('Invent a compelling fictional gathering')
    expect(brief).toContain('No sharp objects')
    expect(brief).toContain('Default to no physical props')
    expect(brief).toContain('At most one ordinary, ready-to-hand prop')
  })

  it('keeps the fictional gathering out of the real setting brief', () => {
    expect(settingQuestions.map(question => question.id)).not.toContain('occasion')
    expect(createSettingBrief(demoSetting)).not.toHaveProperty('occasion')
  })

  it('normalizes legacy prop strings into stable structured inventory records', () => {
    const setting = createSettingBrief({
      ...demoSetting,
      availableProps: ['Blue ledger'],
    })
    expect(setting.availableProps).toEqual([{
      id: 'blue-ledger',
      label: 'Blue ledger',
      description: '',
      quantity: 1,
      safetyNotes: [],
    }])
  })

  it('packages a compiled story with the setting required by the runtime', () => {
    const demo = createDemoStoryline('authored')
    const authored = createAuthoredStoryline({
      id: demo.id,
      title: demo.title,
      setting: demo.setting,
      story: demo.story,
      clueDecks: demo.clueDecks,
      acts: demo.acts,
      setupRequirements: demo.setupRequirements,
    })
    expect(authored).toEqual(demo)
    expect(authored.setting.playableSpaces).toHaveLength(2)
    expect(authored.story.characters).toHaveLength(5)
  })
})
