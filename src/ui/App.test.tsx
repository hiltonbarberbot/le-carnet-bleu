import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { createDemoGame } from '../game/demo'
import {
  advanceAct,
  confirmRunBeat,
  createGame,
  createIdleState,
  prepareGame,
  resetGame,
  startGame,
  updateEnrolment,
} from '../game/session/lifecycle'
import type { ExistingGameState, GameState } from '../game/types'
import { bindGameToStoryline } from './library/storage'
import { ActiveGameBar, getHostScreen, HostWorkspace, PlayerProfile, StartScreen } from './App'
import { GodView } from './story/reader'

const definition = createDemoGame('ui')
const story = definition.story
const noAi = { aiControllers: false }

function enrolling() {
  let state = createGame(definition, new Date('2026-08-18T10:00:00Z'), 'ui-game')
  state = updateEnrolment(state, {
    hostName: 'Host',
    seats: state.setup.seats.map((seat, index) => ({ ...seat, humanName: `Player ${index}` })),
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

describe('host lifecycle projection', () => {
  it('renders first load as idle with create but no reset action', () => {
    const html = render(createIdleState(definition))
    expect(html).toContain('READY FOR MAISON BLEUE DEMO HOUSE')
    expect(html).toContain('Assign names, then open the dossiers')
    expect(html).toContain('No assumed headcount')
    expect(html).not.toContain('Reset game')
  })

  it('asks only for optional assignment labels before showing dossier links', () => {
    const html = render(createGame(definition, new Date('2026-08-18T10:00:00Z'), 'partial'))
    expect(html).toContain('ROLE ASSIGNMENTS')
    expect(html).toContain('Assigned name (optional)')
    expect(html).toContain('Open dossier / PDF')
    expect(html).not.toContain('Private handoff')
    expect(html).not.toContain('How many people')
  })

  it('links assignment labels directly to dossiers without delivery claims', () => {
    const prepared = prepareGame(definition, enrolling(), noAi)
    const html = render(prepared)
    expect(html).toContain('Player 0')
    expect(html).toContain('Open / save PDF')
    expect(html).not.toContain('waiting')
    expect(html).not.toContain('Mark received')
  })

  it('renders active play and reset-to-idle as separate states', () => {
    const active = startGame(definition, prepareGame(definition, enrolling(), noAi))
    expect(getHostScreen(active)).toBe('active:opening')
    expect(render(active)).toContain('The last recording')
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
        ? { ...seat, humanName: '', allowAiFallback: true }
        : seat),
    })
    const active = startGame(definition, prepareGame(definition, withVacancy, { aiControllers: true }))
    const html = render(active, { aiControllers: true })
    expect(html).toContain('Generate AI line')
    expect(html).toContain('AI performance required')
  })

  it('turns investigation into three visible social steps without private ballots', () => {
    let active = startGame(definition, prepareGame(definition, enrolling(), noAi))
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
    expect(html).toContain(character.secrets.find(secret => !secret.availableAfter)!.text)
    expect(html).not.toContain(story.characters[1].privateSecret)
    expect(html).not.toContain(story.solution)
    expect(html).not.toContain('THE SOLUTION')
    expect(html).not.toContain('Use each ability')
  })
})

describe('start screen', () => {
  const renderStart = (states: ExistingGameState[] = []) => renderToStaticMarkup(<StartScreen
    storylines={[definition]}
    games={states.map(state => bindGameToStoryline(definition, state))}
    importError=""
    onCreateStoryline={() => undefined}
    onCreateGame={() => undefined}
    onContinueGame={() => undefined}
    onRules={() => undefined}
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
    expect(html).not.toContain('Read (spoilers)')
    expect(html).not.toContain('Preview player card')
    expect(html).toContain('Full story and private dossiers become available to the host after creating a game')
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

describe('privileged game views', () => {
  it('exposes god view only from a concrete game bound to its storyline', () => {
    const state = createGame(definition, new Date('2026-08-18T10:00:00Z'), 'god-view-game')
    const game = bindGameToStoryline(definition, state)
    const bar = renderToStaticMarkup(<ActiveGameBar game={game} onGodView={() => undefined} onExit={() => undefined} />)
    const view = renderToStaticMarkup(<GodView game={game} onExit={() => undefined} />)

    expect(bar).toContain('God view · spoilers')
    expect(bar).toContain('Maison Bleue demo')
    expect(bar).toContain('enrolling')
    expect(view).toContain('EDITORIAL VIEW · COMPLETE SPOILERS')
    expect(view).toContain('Finished reading — return to the game')
  })
})
