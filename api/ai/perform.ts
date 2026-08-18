import { generateText } from 'ai'
import { getMemoriesBeforeAction } from '../../src/game/dossier/knowledge'
import { generateGame } from '../../src/game/generate'

const model = process.env.AI_GATEWAY_MODEL || 'anthropic/claude-sonnet-4.6'

type PerformanceInput = {
  sessionId: string
  seed: string
  roleId: string
  actionId: string
}

function isConfigured() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN)
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'no-store' },
  })
}

function readInput(value: unknown): PerformanceInput | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Partial<PerformanceInput>
  if (
    typeof input.sessionId !== 'string' || input.sessionId.length < 1 || input.sessionId.length > 100
    || typeof input.seed !== 'string' || input.seed.length > 100
    || typeof input.roleId !== 'string' || input.roleId.length > 100
    || typeof input.actionId !== 'string' || input.actionId.length > 100
  ) return null
  return input as PerformanceInput
}

function hasAllowedOrigin(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return true
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
  if (!host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

export function GET() {
  const available = isConfigured()
  return json({ available, model: available ? model : undefined })
}

export async function POST(request: Request) {
  if (!hasAllowedOrigin(request)) return json({ error: 'Cross-origin AI requests are not allowed.' }, 403)
  if (!isConfigured()) return json({ error: 'Vercel AI Gateway is not configured.' }, 503)

  let input: PerformanceInput | null = null
  try {
    input = readInput(await request.json())
  } catch {
    return json({ error: 'Request body must be valid JSON.' }, 400)
  }
  if (!input) return json({ error: 'A valid session, seed, role and action are required.' }, 400)

  const story = generateGame(input.seed)
  const character = story.characters.find(item => item.id === input.roleId)
  const action = character?.actions.find(item => item.id === input.actionId)
  if (!character || !action) return json({ error: 'That role or action does not exist in this case.' }, 404)
  const memories = getMemoriesBeforeAction(story, character, action.id)

  try {
    const result = await generateText({
      model,
      system: [
        `You are performing ${character.name}, ${character.title}, in a live dinner-party murder mystery.`,
        `Public face: ${character.publicFace}`,
        `Private secret: ${character.privateSecret}`,
        `Your memories: ${memories.map(memory => memory.text).join(' | ')}`,
        'Stay inside this dossier. Never reveal facts the character does not know or explain the canonical solution.',
        'Write only one short line the character says aloud. Do not add labels, quotation marks, narration, or stage directions.',
      ].join('\n'),
      prompt: [
        `Cue: ${action.cue}`,
        `Required action: ${action.text}`,
        `Intended consequence: ${action.consequence}`,
        action.physical
          ? 'A human proxy handles the physical staging. Supply a spoken line that naturally accompanies it without claiming the action is already complete.'
          : 'Supply the spoken line that performs this action.',
      ].join('\n'),
      maxOutputTokens: 120,
      providerOptions: {
        gateway: {
          user: input.sessionId,
          tags: ['le-carnet-bleu', 'ai-player'],
        },
      },
    })

    const text = result.text.trim()
    if (!text) return json({ error: 'The model returned an empty performance.' }, 502)
    return json({ text, model })
  } catch (error) {
    console.error('AI Gateway performance failed', error)
    return json({ error: 'The AI player could not answer. Try again before continuing.' }, 502)
  }
}
