import { describe, expect, it } from 'vitest'
import { defaultAiCallTimeoutMs, resolveAiCallTimeoutMs } from './deadline'

describe('AI call deadline', () => {
  it('finishes before Vercel can terminate the workflow step', () => {
    expect(defaultAiCallTimeoutMs).toBe(300_000)
    expect(defaultAiCallTimeoutMs).toBeLessThan(800_000)
  })

  it('accepts bounded overrides and rejects unsafe values', () => {
    expect(resolveAiCallTimeoutMs('120000')).toBe(120_000)
    expect(resolveAiCallTimeoutMs('900000')).toBe(defaultAiCallTimeoutMs)
    expect(resolveAiCallTimeoutMs('not-a-number')).toBe(defaultAiCallTimeoutMs)
  })
})
