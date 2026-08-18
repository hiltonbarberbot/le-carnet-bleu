import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { generateAiPerformance, readAiGatewayStatus } from '../game/ai/gateway'
import { createDemoGame } from '../game/demo'
import { createGameDefinition } from '../game/definition/create'
import type { GameDefinition, GameDefinitionInput } from '../game/definition/contract'
import { getKnownMemories } from '../game/dossier/knowledge'
import {
  abortGame,
  advanceAct,
  beginDelivery,
  completeGame,
  confirmRunBeat,
  createGame,
  createIdleState,
  getRevealBlockers,
  getSetupBlockers,
  getStartBlockers,
  prepareGame,
  recordAiPerformance,
  recordDeliveryOutcome,
  requestDelivery,
  resetGame,
  revealToTable,
  startGame,
  toggleEvidence,
  togglePause,
  undoRunBeat,
  updateAccusation,
  updateEnrolment,
} from '../game/session/lifecycle'
import { restoreGameSession, serializeGameState } from '../game/session/storage'
import type { ActiveGameState, Character, GameState, PreparedGameState, RuntimeCapabilities, SetupDraft, Story } from '../game/types'
import { AuthoringStudio } from './authoring/studio'
import { StoryReader } from './story/reader'

type Mode = 'choose' | 'author' | 'rules' | 'story' | 'host' | 'player'
type GatewayConnection = { state: 'checking' | 'available' | 'unavailable'; model?: string }
type AiPerformance = { text?: string; pending?: boolean; error?: string }

const GAME_KEY = 'le-carnet-bleu:game:v4'

export function getHostScreen(state: GameState) {
  if (state.phase === 'active') return `active:${state.playPhase}` as const
  return state.phase
}

function readStored(fallback: GameDefinition): { definition: GameDefinition; state: GameState; error: string } {
  const raw = localStorage.getItem(GAME_KEY)
  if (!raw) return { definition: fallback, state: createIdleState(fallback), error: '' }
  try {
    const restored = restoreGameSession(raw)
    return { ...restored, error: '' }
  } catch (error) {
    return { definition: fallback, state: createIdleState(fallback), error: error instanceof Error ? error.message : String(error) }
  }
}

export function StartScreen({ definition, game, importError, onCreate, onRules, onStory, onDossier, onImport, onExport }: {
  definition: GameDefinition
  game: GameState
  importError: string
  onCreate: () => void
  onRules: () => void
  onStory: () => void
  onDossier: () => void
  onImport: (event: ChangeEvent<HTMLInputElement>) => void
  onExport: () => void
}) {
  const { story } = definition
  const hasGame = game.phase !== 'idle'
  return <main className="chooser">
    <span className="kicker">LE CARNET BLEU · {definition.setting.venueName}</span>
    <h1>{story.title}</h1>
    <p className="chooser-summary">{story.subtitle}</p>
    <div className="start-actions">
      <button className="create-game" onClick={onCreate}>
        <span>{hasGame ? 'HOST' : 'START HERE'}</span>
        <b>{hasGame ? 'Continue game' : 'Create game'}</b>
        <small>{hasGame ? `Return to the ${getHostScreen(game)} game.` : 'Describe your setting and let AI draft the mystery.'}</small>
        <strong aria-hidden="true">→</strong>
      </button>
      <div className="secondary-actions">
        <button onClick={onRules}>How to play</button>
      </div>
    </div>
    {importError && <section className="hard-errors compact"><span>IMPORT FAILED</span><pre>{importError}</pre></section>}
    <details className="advanced-game-tools">
      <summary>Advanced</summary>
      <p>Import or export the authored game definition.</p>
      <div className="case-seed">
        <label className="definition-file"><input type="file" accept="application/json,.json" disabled={hasGame} onChange={onImport} /><span>Import definition</span></label>
        <button onClick={onExport}>Export definition</button>
        <button onClick={onStory}>Author view (spoilers)</button>
        <button onClick={onDossier}>Preview player card</button>
      </div>
      <small>{definition.setting.era} · {definition.setting.tone} · definition {definition.fingerprint.slice(0, 12)}</small>
    </details>
  </main>
}

export function EveningTimeline({ definition, phase }: { definition: GameDefinition; phase?: string }) {
  const elapsed = definition.story.evening.reduce((total, stage) => total + stage.durationMinutes, 0)
  return <section className="evening-timeline">
    <div className="timeline-heading"><div><span className="kicker">THE EVENING</span><h2>One simple path through the night</h2></div><b>About {elapsed} minutes</b></div>
    <ol>{definition.story.evening.map((stage, index) => <li key={stage.id} className={stage.phase === phase ? 'current' : ''}>
      <span>{index + 1}</span><div><b>{stage.title}</b><small>{stage.durationMinutes} min · {stage.description}</small></div>
    </li>)}</ol>
  </section>
}

function Rules({ definition, onExit }: { definition: GameDefinition; onExit: () => void }) {
  return <main className="rules-page">
    <button className="rules-back" onClick={onExit}>← Back</button>
    <header><span className="kicker">HOW TO PLAY</span><h1>A murder mystery authored for the place where it happens.</h1><p>Six people play: one host performs the victim and becomes Game Master after the staged incident; five guests each play one suspect.</p></header>
    <section className="rules-summary"><article><b>PEOPLE</b><strong>6 total</strong></article><article><b>TIME</b><strong>About 2 hours</strong></article><article><b>YOU NEED</b><strong>Your private card, the prepared props, and a willingness to ask questions</strong></article></section>
    <EveningTimeline definition={definition} />
    <section className="rules-block"><span>THREE RULES</span><h2>Everything players need to remember</h2><ol><li>Pursue your three goals in any order.</li><li>You may dodge and misdirect, but never invent evidence.</li><li>Use each ability only once and follow physical cues exactly.</li></ol></section>
    <section className="rules-block"><span>WHEN IN DOUBT</span><h2>Talk to the people on your card</h2><p>Show an item, ask a direct question, offer a bargain, or use an ability. The host moves the evening forward when the room is ready.</p></section>
    <button className="rules-start" onClick={onExit}>Understood — return →</button>
  </main>
}

export function PlayerProfile({ character, completedBeatIds = [], onExit }: { character: Character; completedBeatIds?: readonly string[]; onExit?: () => void }) {
  const memories = getKnownMemories(character, completedBeatIds)
  return <>
    <div className="mode-bar player-mode"><div><span>PLAYER PROFILE</span><b>You are viewing only {character.name}’s information</b></div><div className="mode-actions"><button onClick={() => window.print()}>Print / save PDF</button>{onExit && <button className="quiet" onClick={onExit}>Exit profile</button>}</div></div>
    <article className="profile">
      <header><div><span className="label">YOUR CHARACTER</span><p>{character.title}</p><h1>{character.name}</h1></div><span className="stamp">PRIVATE</span></header>
      <section className="start-here"><span className="number">1</span><div><h2>Your role in thirty seconds</h2><p><b>Tell everyone:</b> {character.invitationPretext}</p><p><b>Armand promised you:</b> {character.invitationPromise}</p><p><b>Your private truth:</b> {character.privateIdentity}</p><p><b>Your secret:</b> {character.privateSecret}</p><p><b>Play them as:</b> {character.publicFace}</p></div></section>
      <section><div className="profile-heading"><span className="number">2</span><div><h2>Your three goals</h2><p>Attempt them in any order. Tick them at the end; each is worth the shown points.</p></div></div><div className="goal-list">{character.goals.map(goal => <label key={goal.id}><input type="checkbox" /><span><b>{goal.title} · {goal.points} {goal.points === 1 ? 'point' : 'points'}</b><small>{goal.text}</small></span></label>)}</div></section>
      <section><div className="profile-heading"><span className="number">3</span><div><h2>Your leverage</h2><p>Start with the item. Cross out each ability after using it.</p></div></div><div className="leverage-grid"><article><span>YOUR ITEM</span><h3>{character.item.title}</h3><p>{character.item.text}</p></article>{character.abilities.map(ability => <article key={ability.id}><span>USE ONCE</span><h3>□ {ability.title}</h3><p>{ability.text}</p></article>)}</div><div className="relationship-grid">{character.relationships.map(relationship => <article key={`${relationship.kind}-${relationship.roleId}`}><b>{relationship.kind === 'approach' ? 'APPROACH FIRST' : 'KEEP WATCH'}</b><p>{relationship.text}</p></article>)}</div><div className="dilemma"><b>YOUR CHOICE TONIGHT</b><p>{character.dilemma}</p></div></section>
      <section><div className="profile-heading"><span className="number">4</span><div><h2>What you know now</h2><p>These are true from your point of view. New observations appear after the staged incident.</p></div></div><div className="plain-list">{memories.map(memory => <div key={memory.id}>{memory.text}</div>)}</div></section>
      <section><div className="profile-heading"><span className="number red">5</span><div><h2>Only when the host cues you</h2><p>Do not memorize this. Follow the cue exactly; all physical conflict is mimed without contact.</p></div></div><div className="task-list">{character.actions.map(action => <article key={action.id}><b>WHEN: {action.cue}</b><p>{action.text}</p></article>)}</div></section>
    </article>
  </>
}

function CanonicalTruth({ story }: { story: Story }) {
  return <details className="canonical-truth" open><summary><span>REVEAL · DO NOT SHOW EARLY</span><b>{story.culprit}</b></summary><h3>The premise</h3><p>{story.premise}</p><h3>The solution</h3><p>{story.solution}</p><div className="truth-grid">{story.timeline.map(beat => <article key={beat.beat}><span>{beat.beat}</span><div><b>{beat.title}</b><p>{beat.truth}</p></div></article>)}</div></details>
}

function SetupPanel({ definition, setup, capabilities, gateway, onChange, onPrepare, onPreview }: {
  definition: GameDefinition
  setup: SetupDraft
  capabilities: RuntimeCapabilities
  gateway: GatewayConnection
  onChange: (setup: SetupDraft) => void
  onPrepare: () => void
  onPreview: (roleId: string) => void
}) {
  const { story } = definition
  const blockers = getSetupBlockers(definition, setup, capabilities)
  function updateSeat(roleId: string, patch: Partial<SetupDraft['seats'][number]>) {
    onChange({ ...setup, seats: setup.seats.map(seat => seat.roleId === roleId ? { ...seat, ...patch } : seat) })
  }
  return <>
    <section className="setup-hero"><span className="kicker">SETUP</span><h1>Assign one person to each role.</h1><p>Enter five names and private handoff addresses, then check the small prop list. The game will guide the rest.</p></section>
    <section className="setup-section"><div className="setup-heading"><span>1</span><div><h2>Name the host</h2><p>The host plays {story.hostRole}, controls the run plan, then becomes Game Master.</p></div></div><label className="field"><span>Host name</span><input value={setup.hostName} onChange={event => onChange({ ...setup, hostName: event.target.value })} placeholder="Host" /></label></section>
    <section className="setup-section"><div className="setup-heading"><span>2</span><div><h2>Enrol the five guest seats</h2><p>Identity and private address must be distinct. Ready means this human accepted the role, not that their dossier was delivered.</p></div></div><div className="seat-grid">{story.characters.map(character => {
      const seat = setup.seats.find(item => item.roleId === character.id)!
      return <article key={character.id} className="seat-card"><header><div><b>{character.name}</b><small>{character.title}</small></div><button onClick={() => onPreview(character.id)}>Preview card</button></header><label className="field"><span>Player name</span><input value={seat.humanName} onChange={event => updateSeat(character.id, { humanName: event.target.value, participantId: event.target.value.trim().toLowerCase().replace(/\s+/g, '-'), ready: false })} placeholder="Name" /></label><label className="field"><span>Private handoff</span><input value={seat.privateAddress} onChange={event => updateSeat(character.id, { privateAddress: event.target.value })} placeholder="Phone, chat, email, or printed envelope" /></label><label className="check-row"><input type="checkbox" checked={seat.ready} onChange={event => updateSeat(character.id, { ready: event.target.checked })} /><span>This person has accepted the role</span></label></article>
    })}</div></section>
    <section className="setup-section"><div className="setup-heading"><span>3</span><div><h2>Prove the setting can perform this story</h2><p>These requirements come from the authored definition for {definition.setting.venueName}.</p></div></div><div className="venue-list">{definition.setupRequirements.map(check => <label key={check.id}><input type="checkbox" checked={Boolean(setup.venue[check.id])} onChange={event => onChange({ ...setup, venue: { ...setup.venue, [check.id]: event.target.checked } })} /><span>{check.label}</span></label>)}</div></section>
    {blockers.length > 0 && <details className="setup-left"><summary>{blockers.length} {blockers.length === 1 ? 'thing' : 'things'} left before roles are ready</summary><ul>{blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></details>}
    <button className="primary-action" disabled={blockers.length > 0} onClick={onPrepare}>Prepare the five private cards →</button>
  </>
}

function Roster({ story, state, onPreview }: { story: Story; state: PreparedGameState | ActiveGameState; onPreview: (roleId: string) => void }) {
  return <section className="roster-strip">{story.characters.map(character => <button key={character.id} onClick={() => onPreview(character.id)}><span>{character.name}</span><b>{state.roster[character.id]?.displayName}</b><small>{state.roster[character.id]?.kind} · dossier →</small></button>)}</section>
}

function DeliveryDesk({ definition, state, onState, run }: { definition: GameDefinition; state: PreparedGameState; onState: (state: GameState) => void; run: (command: () => GameState) => void }) {
  const { story } = definition
  const blockers = getStartBlockers(definition, state)
  function markReceived(roleId: string) {
    run(() => {
      let next = state
      const status = next.deliveries[roleId]?.status
      if (status === 'not_requested' || status === 'failed') next = requestDelivery(next, roleId)
      if (next.deliveries[roleId].status === 'queued') next = beginDelivery(next, roleId)
      if (next.deliveries[roleId].status === 'sending') next = recordDeliveryOutcome(next, roleId, { ok: true, receipt: `Confirmed by ${state.hostName}` })
      return next
    })
  }
  return <section className="phase-panel delivery-desk"><span className="kicker">PRIVATE CARDS</span><h2>Make sure each player has only their own role.</h2><p>Send the card privately or place a printed copy in a named envelope. Mark it received when the player has it.</p><div className="delivery-list">{story.characters.map(character => {
    const delivery = state.deliveries[character.id]
    return <article key={character.id} data-status={delivery.status}><div><b>{character.name}</b><small>{state.roster[character.id].displayName} · {delivery.address || 'private card'}</small>{delivery.error && <small className="danger">{delivery.error}</small>}</div><strong>{delivery.status === 'delivered' || delivery.status === 'not_required' ? 'ready' : delivery.status === 'failed' ? 'failed' : 'waiting'}</strong><div className="delivery-actions">{delivery.status !== 'delivered' && delivery.status !== 'not_required' && <button onClick={() => markReceived(character.id)}>Mark received</button>}</div></article>
  })}</div>{blockers.length > 0 && <details className="setup-left"><summary>START BLOCKED · {blockers.length} private {blockers.length === 1 ? 'card' : 'cards'} left</summary><ul>{blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></details>}<button className="primary-action" disabled={blockers.length > 0} onClick={() => onState(startGame(definition, state))}>Everyone is ready — begin the evening →</button></section>
}

function RunSheet({ story, state, performances, onPerform, onConfirm, onUndo }: {
  story: Story
  state: ActiveGameState
  performances: Record<string, AiPerformance>
  onPerform: (roleId: string, actionId: string) => void
  onConfirm: (beatId: string) => void
  onUndo: (beatId: string) => void
}) {
  const beats = story.runPlan.filter(beat => beat.phase === state.playPhase)
  return <div className="run-sheet">{beats.map(beat => {
    const done = state.completedBeatIds.includes(beat.id)
    const blockedBy = beat.dependsOn.filter(id => !state.completedBeatIds.includes(id))
    const actions = beat.actionIds.map(id => story.characters.flatMap(character => character.actions.map(action => ({ ...action, owner: character.name, roleId: character.id }))).find(action => action.id === id)!)
    const missingAiLines = actions.filter(action => state.roster[action.roleId]?.kind === 'ai' && !performances[action.id]?.text)
    return <article key={beat.id} className={`${done ? 'done' : ''} ${beat.essential ? 'essential' : ''}`}><header><div><small>{beat.trigger}</small><h3>{beat.title}</h3></div><b>{beat.essential ? 'REQUIRED' : 'OPTIONAL'}</b></header><p className="operator-copy">{beat.operator}</p>{actions.map(action => {
      const controller = state.roster[action.roleId]
      const proxy = controller?.kind === 'ai' && action.physical ? ` · Physical proxy: ${controller.physicalProxy}` : ''
      const performance = performances[action.id]
      return <div className={`beat-action ${controller?.kind === 'ai' ? 'ai-action' : ''}`} key={action.id}><b>{action.owner}</b><p>{action.text}</p><small>{action.consequence}{proxy}</small>{controller?.kind === 'ai' && <div className="ai-performance">{performance?.text && <blockquote>{performance.text}</blockquote>}{performance?.error && <p>{performance.error}</p>}<button disabled={state.paused || performance?.pending} onClick={() => onPerform(action.roleId, action.id)}>{performance?.pending ? 'Asking Gateway…' : performance?.text ? 'Regenerate AI line' : 'Generate AI line'}</button></div>}</div>
    })}{blockedBy.length > 0 && <p className="blocked-copy">Blocked by: {blockedBy.map(id => story.runPlan.find(item => item.id === id)?.title).join(', ')}</p>}{!done && missingAiLines.length > 0 && <p className="blocked-copy">AI performance required for: {missingAiLines.map(action => action.owner).join(', ')}.</p>}<button disabled={state.paused || blockedBy.length > 0 || (!done && missingAiLines.length > 0)} onClick={() => done ? onUndo(beat.id) : onConfirm(beat.id)}>{done ? 'Undo confirmation' : 'Confirm this beat happened'}</button></article>
  })}</div>
}

function Investigation({ definition, state, onState }: { definition: GameDefinition; state: ActiveGameState; onState: (state: ActiveGameState) => void }) {
  const { story } = definition
  const evidence = [...story.publicEvidence.map(item => ({ ...item, owner: 'Crime scene' })), ...story.characters.flatMap(character => character.memories.filter(memory => memory.beat).map(memory => ({ id: memory.id, text: memory.text, beat: memory.beat!, owner: character.name })))].filter(item => story.timeline.some(beat => beat.evidence.includes(item.id)))
  const blockers = getRevealBlockers(definition, state)
  return <><div className="page-title"><div><span className="kicker">INVESTIGATION</span><h2>Track what has actually entered play.</h2></div><b>{state.revealedEvidenceIds.length}/{evidence.length} surfaced</b></div><div className="evidence-list">{evidence.sort((a, b) => a.beat - b.beat).map(item => <label key={item.id}><input type="checkbox" checked={state.revealedEvidenceIds.includes(item.id)} onChange={() => onState(toggleEvidence(state, item.id))} /><span><small>BEAT {item.beat} · {item.owner}</small><b>{item.text}</b></span></label>)}</div><div className="ballot-list">{story.characters.map(character => {
    const ballot = state.accusations[character.id] ?? { culprit: '', motive: '', chain: '' }
    return <section className="accusation" key={character.id}><span className="kicker">{character.name.toUpperCase()} · FINAL ACCUSATION</span><label className="field"><span>Who caused the death?</span><input value={ballot.culprit} onChange={event => onState(updateAccusation(state, character.id, { ...ballot, culprit: event.target.value }))} /></label><label className="field"><span>What was the motive?</span><textarea value={ballot.motive} onChange={event => onState(updateAccusation(state, character.id, { ...ballot, motive: event.target.value }))} /></label><label className="field"><span>What is your strongest clue?</span><textarea value={ballot.chain} onChange={event => onState(updateAccusation(state, character.id, { ...ballot, chain: event.target.value }))} /></label></section>
  })}</div>{blockers.length > 0 && <section className="hard-errors compact"><span>REVEAL BLOCKED</span><ul>{blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></section>}<button className="primary-action" disabled={state.paused || blockers.length > 0} onClick={() => onState(revealToTable(definition, state))}>Lock accusations and reveal to table →</button></>
}

export function HostWorkspace({ definition, state, setState, capabilities, gateway, onPreview }: {
  definition: GameDefinition
  state: GameState
  setState: (state: GameState) => void
  capabilities: RuntimeCapabilities
  gateway: GatewayConnection
  onPreview: (roleId: string) => void
}) {
  const { story } = definition
  const [commandError, setCommandError] = useState('')
  const [performanceRequests, setPerformanceRequests] = useState<Record<string, AiPerformance>>({})
  const gameId = state.phase === 'idle' ? '' : state.id
  useEffect(() => setPerformanceRequests({}), [gameId])
  function run<T extends GameState>(command: () => T) { try { setCommandError(''); setState(command()) } catch (error) { setCommandError(error instanceof Error ? error.message : String(error)) } }
  function reset() { if (window.confirm('Reset this game to idle? All enrolment, delivery, and play state will be discarded.')) run(() => resetGame(definition, state, true)) }
  async function perform(roleId: string, actionId: string) {
    if (state.phase !== 'active') return
    setPerformanceRequests(current => ({ ...current, [actionId]: { pending: true } }))
    try {
      const text = await generateAiPerformance({ definition, sessionId: state.id, roleId, actionId })
      setState(recordAiPerformance(definition, state, roleId, actionId, text))
      setPerformanceRequests(current => ({ ...current, [actionId]: {} }))
    } catch (error) {
      setPerformanceRequests(current => ({ ...current, [actionId]: { pending: false, error: error instanceof Error ? error.message : String(error) } }))
    }
  }

  if (state.phase === 'idle') return <main className="page host-page"><CanonicalTruth story={story} /><section className="setup-hero idle-hero"><span className="kicker">IDLE · AUTHORED FOR {definition.setting.venueName.toUpperCase()}</span><h1>Nothing has been created, assigned, sent, or started.</h1><p>This exact definition is locked by fingerprint {definition.fingerprint.slice(0, 12)}. Create a game to begin enrolment.</p><button className="primary-action" onClick={() => setState(createGame(definition))}>Create game and begin enrolment →</button></section></main>

  const active = state.phase === 'active' ? state : null
  const hostName = state.phase === 'enrolling' ? state.setup.hostName : state.hostName
  return <main className="page host-page">
    <section className="session-head"><div><span className="kicker">GAME {state.id.slice(0, 8)}</span><h1>{active ? `${active.paused ? 'paused · ' : ''}${active.playPhase}` : state.phase}</h1><p>{state.phase === 'enrolling' ? 'Assignments are still editable.' : `${'roster' in state ? Object.keys(state.roster).length : 0} guest seats · ${hostName} host`}</p></div><div className="session-actions">{active && <button onClick={() => setState(togglePause(active))}>{active.paused ? 'Resume' : 'Pause'}</button>}{state.phase !== 'completed' && state.phase !== 'aborted' && <button className="danger-button" onClick={() => run(() => abortGame(state))}>Abort</button>}<button className="danger-button" onClick={reset}>Reset game</button></div></section>
    {commandError && <section className="hard-errors compact"><span>COMMAND FAILED</span><pre>{commandError}</pre></section>}
    <CanonicalTruth story={story} />
    {state.phase === 'enrolling' && <SetupPanel definition={definition} setup={state.setup} capabilities={capabilities} gateway={gateway} onChange={setup => setState(updateEnrolment(state, setup))} onPreview={onPreview} onPrepare={() => run(() => prepareGame(definition, state, capabilities))} />}
    {state.phase === 'prepared' && <><Roster story={story} state={state} onPreview={onPreview} /><DeliveryDesk definition={definition} state={state} onState={setState} run={run} /></>}
    {active && <><Roster story={story} state={active} onPreview={onPreview} />{definition.acts.some(act => act.id === active.playPhase) && <section className="phase-panel"><div className="page-title"><div><span className="kicker">{active.playPhase}</span><h2>{definition.acts.find(act => act.id === active.playPhase)?.title}</h2><p>{definition.acts.find(act => act.id === active.playPhase)?.operatorGoal}</p></div></div><RunSheet story={story} state={active} performances={Object.fromEntries(Object.entries({ ...active.aiPerformances, ...performanceRequests }).map(([id, performance]) => [id, { ...performance, text: active.aiPerformances[id]?.text }]))} onPerform={perform} onConfirm={beatId => run(() => confirmRunBeat(definition, active, beatId))} onUndo={beatId => run(() => undoRunBeat(definition, active, beatId))} /><button className="primary-action" disabled={active.paused || !story.runPlan.filter(beat => beat.phase === active.playPhase && beat.essential).every(beat => active.completedBeatIds.includes(beat.id))} onClick={() => run(() => advanceAct(definition, active))}>{definition.acts.find(act => act.id === active.playPhase)?.completionLabel}</button></section>}{active.playPhase === 'investigation' && <section className="phase-panel"><Investigation definition={definition} state={active} onState={setState} /></section>}{active.playPhase === 'reveal' && <section className="phase-panel reveal-panel"><span className="kicker">TABLE REVEAL</span><h2>Read the canonical timeline aloud.</h2><div className="ballot-list">{story.characters.map(character => { const ballot = active.accusations[character.id]; return <div className="theory" key={character.id}><h3>{character.name} accused</h3><p><b>{ballot.culprit}</b></p><p>{ballot.motive}</p><p>{ballot.chain}</p></div> })}</div><CanonicalTruth story={story} /><button className="primary-action" disabled={active.paused} onClick={() => run(() => completeGame(active))}>Complete the game →</button></section>}</>}
    {state.phase === 'completed' && <section className="phase-panel terminal"><span className="kicker">CASE CLOSED</span><h2>The game completed successfully.</h2><p>The exact roster, delivery receipts, performed beats, surfaced evidence and accusation remain stored.</p></section>}
    {state.phase === 'aborted' && <section className="phase-panel terminal"><span className="kicker danger">GAME ABORTED</span><h2>No further commands can run.</h2><p>Reset explicitly to return to idle.</p></section>}
  </main>
}

export function App() {
  const fallbackDefinition = useMemo(() => createDemoGame('browser-demo'), [])
  const initial = useMemo(() => readStored(fallbackDefinition), [fallbackDefinition])
  const [definition, setDefinition] = useState<GameDefinition>(initial.definition)
  const [mode, setMode] = useState<Mode>('choose')
  const [previewing, setPreviewing] = useState(false)
  const [selected, setSelected] = useState(initial.definition.story.characters[0].id)
  const story = definition.story
  const [storageError, setStorageError] = useState(initial.error)
  const [importError, setImportError] = useState('')
  const [game, setGame] = useState<GameState>(initial.state)
  const [gateway, setGateway] = useState<GatewayConnection>({ state: 'checking' })
  const capabilities = useMemo<RuntimeCapabilities>(() => ({ aiControllers: gateway.state === 'available' }), [gateway.state])
  const player = story.characters.find(item => item.id === selected) || story.characters[0]
  const completedBeatIds = 'completedBeatIds' in game ? game.completedBeatIds : []

  useEffect(() => {
    const controller = new AbortController()
    readAiGatewayStatus(controller.signal)
      .then(status => setGateway(status.available ? { state: 'available', model: status.model } : { state: 'unavailable' }))
      .catch(error => { if (!(error instanceof DOMException && error.name === 'AbortError')) setGateway({ state: 'unavailable' }) })
    return () => controller.abort()
  }, [])
  useEffect(() => { if (!storageError) localStorage.setItem(GAME_KEY, serializeGameState(definition, game)) }, [definition, game, storageError])

  function discardInvalidState() { localStorage.removeItem(GAME_KEY); setDefinition(fallbackDefinition); setStorageError(''); setGame(createIdleState(fallbackDefinition)) }
  function preview(roleId: string) { setSelected(roleId); setPreviewing(true) }
  async function importDefinition(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file || game.phase !== 'idle') return
    try {
      const next = createGameDefinition(JSON.parse(await file.text()) as GameDefinitionInput)
      setDefinition(next)
      setGame(createIdleState(next))
      setSelected(next.story.characters[0].id)
      setImportError('')
    } catch (error) {
      setImportError(error instanceof Error ? error.message : String(error))
    } finally {
      event.target.value = ''
    }
  }
  function exportDefinition() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(definition, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${definition.id}.json`
    link.click()
    URL.revokeObjectURL(url)
  }
  function openHost() {
    setMode(game.phase === 'idle' ? 'author' : 'host')
  }
  function useAuthoredGame(next: GameDefinition) {
    setDefinition(next)
    setSelected(next.story.characters[0].id)
    setGame(createGame(next))
    setMode('host')
  }

  if (storageError) return <main className="fatal-screen"><span className="kicker danger">BOOT FAILED</span><h1>Stored game state is invalid.</h1><pre>{storageError}</pre><button onClick={discardInvalidState}>Discard invalid state</button></main>
  if (mode === 'author') return <AuthoringStudio gateway={gateway} onExit={() => setMode('choose')} onUse={useAuthoredGame} />
  if (mode === 'rules') return <Rules definition={definition} onExit={() => setMode('choose')} />
  if (mode === 'story') return <StoryReader definition={definition} onExit={() => setMode('choose')} />
  if (mode === 'player') return <main className="page player-page"><div className="profile-picker"><label>Choose your character</label><select value={selected} onChange={event => setSelected(event.target.value)}>{story.characters.map(character => <option value={character.id} key={character.id}>{character.name}</option>)}</select></div><PlayerProfile character={player} completedBeatIds={completedBeatIds} onExit={() => setMode('choose')} /></main>
  if (previewing) return <main className="page player-page host-preview"><div className="preview-parent"><button onClick={() => setPreviewing(false)}>← Back to host dashboard</button><span>HOST PREVIEW · {player.name}</span></div><PlayerProfile character={player} completedBeatIds={completedBeatIds} onExit={() => setPreviewing(false)} /></main>
  if (mode === 'host') return <><header className="mode-bar host-mode"><div><span>HOST DASHBOARD · PRIVATE</span><b>{definition.title} · {story.totalPeople} people · {getHostScreen(game)}</b></div><div className="mode-actions"><button className="quiet" onClick={() => setMode('choose')}>Back to home</button></div></header><HostWorkspace definition={definition} state={game} setState={setGame} capabilities={capabilities} gateway={gateway} onPreview={preview} /></>
  return <StartScreen definition={definition} game={game} importError={importError} onCreate={openHost} onRules={() => setMode('rules')} onStory={() => setMode('story')} onDossier={() => setMode('player')} onImport={importDefinition} onExport={exportDefinition} />
}
