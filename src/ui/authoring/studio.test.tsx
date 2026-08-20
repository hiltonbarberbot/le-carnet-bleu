import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createDemoStoryline } from '../../game/demo'
import { AuthoringStudio, followCertificationJob } from './studio'

describe('AI authoring studio', () => {
  it('starts with fact extraction before the required host questionnaire', () => {
    const html = renderToStaticMarkup(<AuthoringStudio gateway={{ state: 'available', model: 'test/model' }} onExit={() => undefined} onSave={async () => undefined} />)
    expect(html).toContain('CREATE WITH AI')
    expect(html).toContain('Start with what you know')
    expect(html).toContain('extract only the facts')
    expect(html).toContain('Shape the setting')
    expect(html).not.toContain('SYSTEM VERIFIED')
    expect(html).not.toContain('Playable spaces')
    expect(html).not.toContain('Comfort &amp; boundaries')
  })

  it('lets an aborted Strict Mode poll finish without clearing or surfacing stale state', async () => {
    const controller = new AbortController()
    let rejectResume!: (error: unknown) => void
    const resume = vi.fn((_jobId: string, _options?: { signal?: AbortSignal }) => new Promise<never>((_resolve, reject) => {
      rejectResume = reject
    }))
    const clearPersistedJob = vi.fn()
    const onReady = vi.fn()
    const onFailure = vi.fn()
    const onSettled = vi.fn()

    const following = followCertificationJob('job-1', controller.signal, {
      resume,
      clearPersistedJob,
      onReady,
      onFailure,
      onSettled,
    })
    controller.abort()
    rejectResume(new Error('The disposed poll failed after its replacement started.'))
    await following

    expect(resume).toHaveBeenCalledWith('job-1', { signal: controller.signal })
    expect(clearPersistedJob).not.toHaveBeenCalled()
    expect(onReady).not.toHaveBeenCalled()
    expect(onFailure).not.toHaveBeenCalled()
    expect(onSettled).not.toHaveBeenCalled()
  })

  it('still clears a completed persisted job and publishes its certified story', async () => {
    const definition = createDemoStoryline('resumed-certification')
    const controller = new AbortController()
    const clearPersistedJob = vi.fn()
    const onReady = vi.fn()
    const onFailure = vi.fn()
    const onSettled = vi.fn()

    await followCertificationJob('job-2', controller.signal, {
      resume: vi.fn().mockResolvedValue(definition),
      clearPersistedJob,
      onReady,
      onFailure,
      onSettled,
    })

    expect(onReady).toHaveBeenCalledWith(definition)
    expect(clearPersistedJob).toHaveBeenCalledOnce()
    expect(onFailure).not.toHaveBeenCalled()
    expect(onSettled).toHaveBeenCalledOnce()
  })
})
