const model = process.env.AI_GATEWAY_MODEL || 'anthropic/claude-sonnet-4.6'

function isConfigured() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN || process.env.VERCEL)
}

export function GET() {
  const available = isConfigured()
  return Response.json(
    { available, model: available ? model : undefined },
    { headers: { 'cache-control': 'no-store' } },
  )
}
