import type { IssuedDossier, IssueLobby } from '../../game/issue/claim'

async function issueJson<Result>(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, { ...init, headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}), ...init?.headers } })
  const payload = await response.json().catch(() => ({})) as Result & { error?: string }
  if (!response.ok) throw new Error(payload.error || `Dossier issue failed (${response.status}).`)
  return payload
}

export async function readIssueLobby(issueCode: string) {
  return (await issueJson<{ lobby: IssueLobby }>(`/api/issue?game=${encodeURIComponent(issueCode)}`)).lobby
}

export async function claimDossier(issueCode: string, participantId: string) {
  return (await issueJson<{ dossier: IssuedDossier }>('/api/issue', { method: 'POST', body: JSON.stringify({ issueCode, participantId }) })).dossier
}
