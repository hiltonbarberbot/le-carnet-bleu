import { issueDossier, readIssueLobby } from '../../../game/issue/claim'
import { DossierIssueError } from '../../../game/issue/identity'
import { getDossierIssueRepository } from '../../../game/issue/postgres'

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'private, no-store' } })

function issueCode(value: unknown) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new DossierIssueError('invalid_issue_code', 'Enter the complete issue code supplied by the host.')
  }
  return value
}

function issueError(error: unknown) {
  if (error instanceof DossierIssueError) {
    const status = error.code === 'invalid_issue_code' ? 404 : error.code === 'invalid_participant_id' ? 400 : 409
    return json({ error: error.message, code: error.code }, status)
  }
  return json({ error: error instanceof Error ? error.message : String(error), code: 'server_error' }, 500)
}

export async function GET(request: Request) {
  try {
    return json({ lobby: await readIssueLobby(getDossierIssueRepository(), issueCode(new URL(request.url).searchParams.get('game'))) })
  } catch (error) {
    return issueError(error)
  }
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Request body must be a JSON object.')
    const input = body as Record<string, unknown>
    if (typeof input.participantId !== 'string') throw new DossierIssueError('invalid_participant_id', 'Your name or handle is required.')
    return json({ dossier: await issueDossier(getDossierIssueRepository(), { issueCode: issueCode(input.issueCode), participantId: input.participantId }) })
  } catch (error) {
    return issueError(error)
  }
}
