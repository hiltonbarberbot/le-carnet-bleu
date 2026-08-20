import { describe, expect, it } from 'vitest'
import { normalizeSettingDraft } from './draft'

describe('setting draft normalization', () => {
  it('preserves route, feature, and prop metadata supplied by the agent', () => {
    const draft = normalizeSettingDraft({
      routes: [{ id: 'hall-to-garden', label: 'Hall to garden', spaceIds: ['hall', 'garden'], accessibilityNotes: ['One shallow step'] }],
      usableFeatures: [{ id: 'blue-door', label: 'Blue door', spaceIds: ['hall'] }],
      availableProps: [{ id: 'letters', label: 'Paper letters', quantity: 5, safetyNotes: ['No sealed envelopes'] }],
    })

    expect(draft.routes).toEqual([expect.objectContaining({ spaceIds: ['hall', 'garden'], accessibilityNotes: ['One shallow step'] })])
    expect(draft.usableFeatures).toEqual([expect.objectContaining({ spaceIds: ['hall'] })])
    expect(draft.availableProps).toEqual([expect.objectContaining({ quantity: 5, safetyNotes: ['No sealed envelopes'] })])
  })
})
