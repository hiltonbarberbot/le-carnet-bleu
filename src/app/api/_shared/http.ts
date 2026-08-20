import type { LibraryScope } from '../../../game/persistence/repository'

const ownerCookie = 'mystery_owner'

export type RequestOwner = {
  scope: LibraryScope
  setCookie?: string
}

function readCookie(request: Request, name: string) {
  const header = request.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
}

export function resolveRequestOwner(request: Request): RequestOwner {
  const existing = readCookie(request, ownerCookie)
  if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(existing)) {
    return { scope: { ownerId: existing } }
  }
  const ownerId = crypto.randomUUID()
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return {
    scope: { ownerId },
    setCookie: `${ownerCookie}=${encodeURIComponent(ownerId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`,
  }
}

export function json(owner: RequestOwner, body: unknown, status = 200) {
  const headers = new Headers({
    'cache-control': 'private, no-store',
    'content-type': 'application/json',
  })
  if (owner.setCookie) headers.set('set-cookie', owner.setCookie)
  return new Response(JSON.stringify(body), { status, headers })
}

function isInfrastructureError(error: unknown) {
  if (error instanceof AggregateError) return true
  if (!(error instanceof Error)) return false
  const details = error as Error & { code?: unknown; severity?: unknown }
  if (details.name === 'PostgresError' || typeof details.severity === 'string') return true
  if (typeof details.code === 'string' && (/^[0-9A-Z]{5}$/.test(details.code) || details.code.startsWith('ECONN'))) return true
  return error.message.includes('DATABASE_URL is required')
}

export function apiError(owner: RequestOwner, error: unknown, status?: number) {
  const responseStatus = status ?? (isInfrastructureError(error) ? 500 : 400)
  const message = error instanceof Error ? error.message : String(error)
  return json(owner, { error: message, code: responseStatus === 400 ? 'invalid_request' : 'server_error' }, responseStatus)
}

export function stringField(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required.`)
  return value.trim()
}

export function positiveInteger(value: unknown, name: string) {
  if (!Number.isInteger(value) || Number(value) < 1) throw new Error(`${name} must be a positive integer.`)
  return Number(value)
}

export async function jsonObject(request: Request) {
  const value: unknown = await request.json()
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Request body must be a JSON object.')
  return value as Record<string, unknown>
}
