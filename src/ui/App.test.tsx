import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createDemoGame } from '../game/demo'
import {
  beginDelivery,
  createGame,
  createIdleState,
  prepareGame,
  recordDeliveryOutcome,
  requestDelivery,
  resetGame,
  startGame,
  updateEnrolment,
} from '../game/session/lifecycle'
import type { GameState, PreparedGameState } from '../game/types'
import { getHostScreen, HostWorkspace } from './App'

const definition = createDemoGame('ui')
const story = definition.story
const noAi = { aiControllers: false }

function enrolling() {
  let state = createGame(definition, new Date('2026-08-18T10:00:00Z'), 'ui-game')
  state = updateEnrolment(state, {
    hostName: 'Host',
    seats: state.setup.seats.map((seat, index) => ({ ...seat, participantId: `p${index}`, humanName: `Player ${index}`, privateAddress: `private:${index}`, ready: true })),
    venue: Object.fromEntries(definition.setupRequirements.map(check => [check.id, true])),
  })
  return state
}

function render(state: GameState, capabilities = noAi) {
  return renderToStaticMarkup(<HostWorkspace
    definition={definition}
    state={state}
    setState={() => undefined}
    capabilities={capabilities}
    gateway={capabilities.aiControllers ? { state: 'available', model: 'anthropic/claude-sonnet-4.6' } : { state: 'unavailable' }}
    onPreview={() => undefined}
  />)
}

function deliverAll(state: PreparedGameState) {
  let next = state
  for (const roleId of Object.keys(next.deliveries)) {
    if (next.deliveries[roleId].status === 'not_required') continue
    next = requestDelivery(next, roleId)
    next = beginDelivery(next, roleId)
    next = recordDeliveryOutcome(next, roleId, { ok: true, receipt: `receipt:${roleId}` })
  }
  return next
}

describe('God mode lifecycle projection', () => {
  it('renders first load as idle with create but no reset action', () => {
    const html = render(createIdleState(definition))
    expect(html).toContain('IDLE · AUTHORED FOR')
    expect(html).toContain('Create game and begin enrolment')
    expect(html).not.toContain('Reset game')
  })

  it('renders partial enrolment as blocked', () => {
    const html = render(createGame(definition, new Date('2026-08-18T10:00:00Z'), 'partial'))
    expect(html).toContain('ENROLLING')
    expect(html).toContain('PREPARATION FAILED')
    expect(html).toContain('disabled')
  })

  it('renders prepared-but-unsent and failed delivery distinctly', () => {
    let prepared = prepareGame(definition, enrolling(), noAi)
    expect(render(prepared)).toContain('not requested')
    const roleId = story.characters[0].id
    prepared = requestDelivery(prepared, roleId)
    prepared = beginDelivery(prepared, roleId)
    prepared = recordDeliveryOutcome(prepared, roleId, { ok: false, error: 'No route' })
    const failed = render(prepared)
    expect(failed).toContain('failed')
    expect(failed).toContain('No route')
    expect(failed).toContain('START BLOCKED')
  })

  it('renders active play and reset-to-idle as separate states', () => {
    const active = startGame(definition, deliverAll(prepareGame(definition, enrolling(), noAi)))
    expect(getHostScreen(active)).toBe('active:dinner')
    expect(render(active)).toContain('Dinner and the reckoning')
    const idle = resetGame(definition, active, true)
    expect(getHostScreen(idle)).toBe('idle')
    expect(render(idle)).toContain('IDLE · AUTHORED FOR')
  })

  it('exposes Gateway performances for an active AI seat', () => {
    const state = enrolling()
    const aiRole = story.characters[0].id
    const withVacancy = updateEnrolment(state, {
      ...state.setup,
      seats: state.setup.seats.map(seat => seat.roleId === aiRole
        ? { ...seat, participantId: '', humanName: '', privateAddress: '', ready: false, allowAiFallback: true }
        : seat),
    })
    const active = startGame(definition, deliverAll(prepareGame(definition, withVacancy, { aiControllers: true })))
    const html = render(active, { aiControllers: true })
    expect(html).toContain('Generate AI line')
    expect(html).toContain('AI performance required')
  })
})
