import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createDemoGame } from '../game/demo'
import {
  advanceAct,
  beginDelivery,
  confirmRunBeat,
  createGame,
  createIdleState,
  prepareGame,
  recordDeliveryOutcome,
  requestDelivery,
  resetGame,
  startGame,
  updateEnrolment,
} from '../game/session/lifecycle'
import type { ExistingGameState, GameState, PreparedGameState } from '../game/types'
import { getHostScreen, HostWorkspace, PlayerProfile, StartScreen } from './App'

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

describe('host lifecycle projection', () => {
  it('renders first load as idle with create but no reset action', () => {
    const html = render(createIdleState(definition))
    expect(html).toContain('READY FOR MAISON BLEUE DEMO HOUSE')
    expect(html).toContain('Set up this game')
    expect(html).not.toContain('Reset game')
  })

  it('renders partial enrolment as blocked', () => {
    const html = render(createGame(definition, new Date('2026-08-18T10:00:00Z'), 'partial'))
    expect(html).toContain('SETUP')
    expect(html).toContain('things left before roles are ready')
    expect(html).toContain('disabled')
  })

  it('renders prepared-but-unsent and failed delivery distinctly', () => {
    let prepared = prepareGame(definition, enrolling(), noAi)
    expect(render(prepared)).toContain('waiting')
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
    expect(getHostScreen(active)).toBe('active:opening')
    expect(render(active)).toContain('The murder at Maison Bleue')
    const idle = resetGame(definition, active, true)
    expect(getHostScreen(idle)).toBe('idle')
    expect(render(idle)).toContain('READY FOR MAISON BLEUE DEMO HOUSE')
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

  it('turns investigation into three visible social steps without private ballots', () => {
    let active = startGame(definition, deliverAll(prepareGame(definition, enrolling(), noAi)))
    for (const act of definition.acts) {
      for (const beat of story.runPlan.filter(item => item.phase === act.id && item.essential)) active = confirmRunBeat(definition, active, beat.id)
      active = advanceAct(definition, active)
    }
    const html = render(active)
    expect(html).toContain('Talk, trade, accuse')
    expect(html).toContain('PRIVATE CLUE DESK')
    expect(html).toContain('Nobody else dies or leaves play')
    expect(html).toContain('Begin the public hearing')
    expect(html).not.toContain('PRIVATE BALLOT')
  })
})

describe('private player card', () => {
  it('shows traits, relationships, secrets, and three scored objectives', () => {
    const character = story.characters[0]
    const html = renderToStaticMarkup(<PlayerProfile character={character} />)
    expect(html).toContain('Your three objectives')
    expect(html).toContain(character.traits[0])
    expect(html).toContain(character.relationships[0].text)
    expect(html).toContain(character.secrets[0].text)
    expect(html).not.toContain(story.characters[1].privateSecret)
    expect(html).not.toContain(story.solution)
    expect(html).not.toContain('THE SOLUTION')
    expect(html).not.toContain('Use each ability')
  })
})

describe('start screen', () => {
  const renderStart = (states: ExistingGameState[] = []) => renderToStaticMarkup(<StartScreen
    storylines={[definition]}
    games={states.map(state => ({ storyline: definition, state }))}
    importError=""
    onCreateStoryline={() => undefined}
    onCreateGame={() => undefined}
    onContinueGame={() => undefined}
    onRules={() => undefined}
    onStory={() => undefined}
    onDossier={() => undefined}
    onImport={() => undefined}
    onExport={() => undefined}
  />)

  it('shows storyline creation and game creation as separate actions', () => {
    const html = renderStart()
    expect(html).toContain('Your storylines')
    expect(html).toContain('EXISTING STORYLINES')
    expect(html).toContain('Create storyline')
    expect(html).toContain('Create game from this storyline')
    expect(html).toContain(story.title)
    expect(html).not.toContain('God mode')
  })

  it('lists several games created from the same storyline', () => {
    const html = renderStart([
      createGame(definition, new Date('2026-08-18T10:00:00Z'), 'first-game'),
      createGame(definition, new Date('2026-08-19T10:00:00Z'), 'second-game'),
    ])
    expect(html).toContain('2 GAMES')
    expect(html).toContain('Game first-ga')
    expect(html).toContain('Game second-g')
    expect(html.match(/Continue →/g)).toHaveLength(2)
  })
})
