import { getDossierIssueRepository } from '../../../../../game/issue/postgres'
import { apiError, json, resolveRequestOwner } from '../../../_shared/http'

type RouteContext = { params: Promise<{ gameId: string }> | { gameId: string } }

export async function GET(request: Request, context: RouteContext) {
  const owner = resolveRequestOwner(request)
  try {
    const { gameId } = await context.params
    const issueCode = await getDossierIssueRepository().findOrCreateIssueCode(owner.scope.ownerId, gameId)
    if (!issueCode) return json(owner, { error: 'Game not found.', code: 'not_found' }, 404)
    return json(owner, { issueCode })
  } catch (error) {
    return apiError(owner, error, 500)
  }
}
