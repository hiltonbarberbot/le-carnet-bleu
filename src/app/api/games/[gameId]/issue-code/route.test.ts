import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDossierIssueRepository } from '../../../../../game/issue/postgres'
import { GET } from './route'

vi.mock('../../../../../game/issue/postgres', () => ({ getDossierIssueRepository: vi.fn() }))

const ownerId = '11111111-1111-4111-8111-111111111111'
const gameId = '22222222-2222-4222-8222-222222222222'
const issueCode = '33333333-3333-4333-8333-333333333333'

function request() {
  return new Request(`https://example.test/api/games/${gameId}/issue-code`, {
    headers: { cookie: `mystery_owner=${ownerId}` },
  })
}

afterEach(() => vi.clearAllMocks())

describe('host dossier issue code', () => {
  it('returns the central code for the owner-scoped game', async () => {
    const findOrCreateIssueCode = vi.fn().mockResolvedValue(issueCode)
    vi.mocked(getDossierIssueRepository).mockReturnValue({ findOrCreateIssueCode } as never)

    const response = await GET(request(), { params: Promise.resolve({ gameId }) })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ issueCode })
    expect(findOrCreateIssueCode).toHaveBeenCalledWith(ownerId, gameId)
  })

  it('does not mint a code for another owner’s game', async () => {
    vi.mocked(getDossierIssueRepository).mockReturnValue({ findOrCreateIssueCode: vi.fn().mockResolvedValue(undefined) } as never)

    const response = await GET(request(), { params: Promise.resolve({ gameId }) })

    expect(response.status).toBe(404)
  })
})
