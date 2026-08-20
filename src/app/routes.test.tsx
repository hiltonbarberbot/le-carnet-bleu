import { describe, expect, it } from 'vitest'
import HomePage from './page'
import IssuePreviewPage from './issue/page'

describe('application routes', () => {
  it('keeps the complete game on the home route', () => {
    const page = HomePage()

    expect(page.props.issuePreview).not.toBe(true)
  })

  it('isolates the standalone designer reel on its preview route', () => {
    const page = IssuePreviewPage()

    expect(page.props.issuePreview).toBe(true)
  })
})
