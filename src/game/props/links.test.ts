import { describe, expect, it } from 'vitest'
import { createDemoStoryline } from '../demo'
import { getPropBacklinks } from './links'
import { getSettingBacklinks } from '../setting/links'

describe('prop backlinks', () => {
  it('indexes setup and host-run uses from one stable prop id', () => {
    const definition = createDemoStoryline('prop-links')
    const notebook = getPropBacklinks(definition).find(entry => entry.prop.id === 'notebook')!

    expect(notebook.prop.label).toBe('Blue notebook')
    expect(notebook.setupRequirements.map(requirement => requirement.id)).toContain('notebook')
    expect(notebook.openingSteps.map(step => step.id)).toEqual(expect.arrayContaining([
      'seat-the-claimants',
      'open-the-account',
      'play-the-recording',
    ]))
  })

  it('backlinks every used setting resource to setup, clue decks, and opening steps', () => {
    const definition = createDemoStoryline('setting-links')
    const study = getSettingBacklinks(definition).find(entry => entry.reference.kind === 'playableSpaces' && entry.reference.id === 'staged-study')!

    expect(study.setupRequirements.map(item => item.id)).toContain('staged-area')
    expect(study.clueDecks.map(item => item.id)).toContain('study-archive')
    expect(study.openingSteps.map(item => item.id)).toContain('recover-score')
  })
})
