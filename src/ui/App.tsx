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

type Mode = 'choose' | 'rules' | 'host' | 'player'
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

function Rules({ onExit }: { onExit: () => void }) {
  return <main className="rules-page">
    <button className="rules-back" onClick={onExit}>← Back</button>
    <header><span className="kicker">HOW TO PLAY</span><h1>A murder mystery authored for the place where it happens.</h1><p>Six people play: one host performs the victim and becomes Game Master after the staged incident; five guests each play one suspect.</p></header>
    <section className="rules-summary"><article><b>PEOPLE</b><strong>6 total</strong></article><article><b>TIME</b><strong>2–3 hours</strong></article><article><b>YOU NEED</b><strong>The verified spaces, props and safety setup listed by this authored game</strong></article></section>
    <section className="rules-block"><span>BEFORE THE NIGHT</span><h2>1. Create, enrol, then prepare</h2><ol><li>The host creates a game and enrols all five guest roles with private delivery addresses.</li><li>Preparation locks the assignments without claiming any dossier was sent.</li><li>Every human confirms receipt before the game may start.</li></ol></section>
    <section className="rules-block"><span>AUTHORED ACTS</span><h2>2. Follow the live actions</h2><p>Your dossier begins with facts your character already knows. New observations appear only after the host confirms that their event happened. Actions are things you perform only when their cue occurs.</p><div className="rule-pair"><article><h3>You may</h3><ul><li>Share or conceal what you know</li><li>Lie about motives and secrets</li><li>Question anyone</li></ul></article><article><h3>You may not</h3><ul><li>Invent evidence</li><li>Change a confirmed observation</li><li>Skip an essential action</li><li>Use real physical force</li></ul></article></div></section>
    <section className="rules-block"><span>THE STAGED INCIDENT</span><h2>3. Follow the host’s safe run plan</h2><p>The exact acts, movements and transitions come from the authored definition. Physical beats are no-contact, use only verified spaces and props, and remain under host control.</p></section>
    <section className="rules-block"><span>ACT TWO · INVESTIGATION</span><h2>4. Reconstruct what happened</h2><p>Question one another, disclose memories, order events, and agree on the culprit, motive and causal chain. The host tracks which evidence has actually entered play.</p></section>
    <section className="rules-block final-rule"><span>ENDING THE GAME</span><h2>5. Lock one accusation</h2><p>The host records the group’s accusation, reveals the canonical timeline to the table, and compares the theory with what actually happened.</p></section>
    <button className="rules-start" onClick={onExit}>Understood — return →</button>
  </main>
}

export function PlayerProfile({ character, completedBeatIds = [], onExit }: { character: Character; completedBeatIds?: readonly string[]; onExit?: () => void }) {
  const memories = getKnownMemories(character, completedBeatIds)
  return <>
    <div className="mode-bar player-mode"><div><span>PLAYER PROFILE</span><b>You are viewing only {character.name}’s information</b></div><div className="mode-actions"><button onClick={() => window.print()}>Print / save PDF</button>{onExit && <button className="quiet" onClick={onExit}>Exit profile</button>}</div></div>
    <article className="profile">
      <header><div><span className="label">YOUR CHARACTER</span><p>{character.title}</p><h1>{character.name}</h1></div><span className="stamp">PRIVATE</span></header>
      <section className="start-here"><span className="number">1</span><div><h2>Why you came</h2><p><b>What you tell the table:</b> {character.invitationPretext}</p><p><b>Armand’s private promise:</b> {character.invitationPromise}</p><p><b>Who you really are:</b> {character.privateIdentity}</p><p><b>What you need tonight:</b> {character.privateObjective}</p><p><b>The secret beneath it:</b> {character.privateSecret}</p><p><b>How you appear:</b> {character.publicFace}</p><p><b>Wear:</b> {character.costume}</p></div></section>
      <section><div className="profile-heading"><span className="number">2</span><div><h2>What you know now</h2><p>Only established facts and events the host has confirmed appear here. Share, hide or lie about them as you wish.</p></div></div><div className="plain-list">{memories.map(memory => <div key={memory.id}>{memory.text}</div>)}</div></section>
      <section><div className="profile-heading"><span className="number red">3</span><div><h2>What you must do</h2><p>Perform these only when the cue happens. Physical conflict is always mimed without contact.</p></div></div><div className="task-list">{character.actions.map(action => <article key={action.id}><b>WHEN: {action.cue}</b><p>{action.text}</p></article>)}</div></section>
    </article>
  </>
}

function CanonicalTruth({ story }: { story: Story }) {
  return <details className="canonical-truth" open><summary><span>GOD MODE TRUTH</span><b>{story.culprit}</b></summary><h3>The premise</h3><p>{story.premise}</p><h3>The solution</h3><p>{story.solution}</p><div className="truth-grid">{story.timeline.map(beat => <article key={beat.beat}><span>{beat.beat}</span><div><b>{beat.title}</b><p>{beat.truth}</p><small>{beat.evidence.join(' · ')}</small></div></article>)}</div></details>
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
    <section className="setup-hero"><span className="kicker">ENROLLING</span><h1>The game exists. Nobody is assigned or briefed yet.</h1><p>Enter distinct humans and private delivery addresses. Vacant seats can use AI only when Gateway is connected.</p><p className={`gateway-status ${gateway.state}`}>{gateway.state === 'available' ? `Vercel AI Gateway ready · ${gateway.model}` : gateway.state === 'checking' ? 'Checking Vercel AI Gateway…' : 'Vercel AI Gateway unavailable · AI seats fail closed'}</p></section>
    <section className="setup-section"><div className="setup-heading"><span>1</span><div><h2>Name the host</h2><p>The host plays {story.hostRole}, controls the run plan, then becomes Game Master.</p></div></div><label className="field"><span>Host name</span><input value={setup.hostName} onChange={event => onChange({ ...setup, hostName: event.target.value })} placeholder="Host" /></label></section>
    <section className="setup-section"><div className="setup-heading"><span>2</span><div><h2>Enrol the five guest seats</h2><p>Identity and private address must be distinct. Ready means this human accepted the role, not that their dossier was delivered.</p></div></div><div className="seat-grid">{story.characters.map(character => {
      const seat = setup.seats.find(item => item.roleId === character.id)!
      return <article key={character.id} className="seat-card"><header><div><b>{character.name}</b><small>{character.title}</small></div><button onClick={() => onPreview(character.id)}>Dossier</button></header><label className="field"><span>Human player</span><input value={seat.humanName} onChange={event => updateSeat(character.id, { humanName: event.target.value, participantId: event.target.value.trim().toLowerCase().replace(/\s+/g, '-'), ready: false })} placeholder="Name" /></label><label className="field"><span>Private delivery address</span><input value={seat.privateAddress} onChange={event => updateSeat(character.id, { privateAddress: event.target.value })} placeholder="Phone, chat address, or in-person handoff ID" /></label><label className="check-row"><input type="checkbox" checked={seat.ready} onChange={event => updateSeat(character.id, { ready: event.target.checked })} /><span>Human accepted this role</span></label><label className="check-row"><input type="checkbox" checked={seat.allowAiFallback} onChange={event => updateSeat(character.id, { allowAiFallback: event.target.checked })} /><span>Allow AI only if vacant at roster lock</span></label></article>
    })}</div></section>
    <section className="setup-section"><div className="setup-heading"><span>3</span><div><h2>Prove the setting can perform this story</h2><p>These requirements come from the authored definition for {definition.setting.venueName}.</p></div></div><div className="venue-list">{definition.setupRequirements.map(check => <label key={check.id}><input type="checkbox" checked={Boolean(setup.venue[check.id])} onChange={event => onChange({ ...setup, venue: { ...setup.venue, [check.id]: event.target.checked } })} /><span>{check.label}</span></label>)}</div></section>
    {blockers.length > 0 && <section className="hard-errors"><span>PREPARATION FAILED</span><h2>{blockers.length} hard {blockers.length === 1 ? 'blocker' : 'blockers'}</h2><ul>{blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></section>}
    <button className="primary-action" disabled={blockers.length > 0} onClick={onPrepare}>Lock assignments and prepare dossiers →</button>
  </>
}

function Roster({ story, state, onPreview }: { story: Story; state: PreparedGameState | ActiveGameState; onPreview: (roleId: string) => void }) {
  return <section className="roster-strip">{story.characters.map(character => <button key={character.id} onClick={() => onPreview(character.id)}><span>{character.name}</span><b>{state.roster[character.id]?.displayName}</b><small>{state.roster[character.id]?.kind} · dossier →</small></button>)}</section>
}

function DeliveryDesk({ definition, state, onState, run }: { definition: GameDefinition; state: PreparedGameState; onState: (state: GameState) => void; run: (command: () => GameState) => void }) {
  const { story } = definition
  const blockers = getStartBlockers(definition, state)
  function confirm(roleId: string) {
    const receipt = window.prompt('Enter the real delivery receipt or the player’s confirmation reference:')
    if (receipt?.trim()) run(() => recordDeliveryOutcome(state, roleId, { ok: true, receipt }))
  }
  function fail(roleId: string) {
    const error = window.prompt('What actually failed?')
    if (error?.trim()) run(() => recordDeliveryOutcome(state, roleId, { ok: false, error }))
  }
  return <section className="phase-panel delivery-desk"><span className="kicker">PREPARED · NOT STARTED</span><h2>Assignments are locked. Delivery is still evidence, not optimism.</h2><p>Move each dossier through the real attempt. “Delivered” requires an operator-entered receipt from the actual handoff or messaging result.</p><div className="delivery-list">{story.characters.map(character => {
    const delivery = state.deliveries[character.id]
    return <article key={character.id} data-status={delivery.status}><div><b>{character.name}</b><small>{state.roster[character.id].displayName} · {delivery.address || 'AI controller'}</small></div><strong>{delivery.status.replace('_', ' ')}</strong><div className="delivery-actions">{(delivery.status === 'not_requested' || delivery.status === 'failed') && <button onClick={() => run(() => requestDelivery(state, character.id))}>{delivery.status === 'failed' ? 'Retry' : 'Queue'}</button>}{delivery.status === 'queued' && <button onClick={() => run(() => beginDelivery(state, character.id))}>Begin attempt</button>}{delivery.status === 'sending' && <><button onClick={() => confirm(character.id)}>Confirm received</button><button className="danger-button" onClick={() => fail(character.id)}>Record failure</button></>}{delivery.receipt && <small>Receipt: {delivery.receipt}</small>}{delivery.error && <small>Error: {delivery.error}</small>}</div></article>
  })}</div>{blockers.length > 0 && <section className="hard-errors compact"><span>START BLOCKED</span><ul>{blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></section>}<button className="primary-action" disabled={blockers.length > 0} onClick={() => onState(startGame(definition, state))}>Start the game deliberately →</button></section>
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
  return <><div className="page-title"><div><span className="kicker">INVESTIGATION</span><h2>Track what has actually entered play.</h2></div><b>{state.revealedEvidenceIds.length}/{evidence.length} surfaced</b></div><div className="evidence-list">{evidence.sort((a, b) => a.beat - b.beat).map(item => <label key={item.id}><input type="checkbox" checked={state.revealedEvidenceIds.includes(item.id)} onChange={() => onState(toggleEvidence(state, item.id))} /><span><small>BEAT {item.beat} · {item.owner}</small><b>{item.text}</b></span></label>)}</div><section className="accusation"><span className="kicker">ONE GROUP ACCUSATION</span><label className="field"><span>Who caused the death?</span><input value={state.accusation.culprit} onChange={event => onState(updateAccusation(state, { ...state.accusation, culprit: event.target.value }))} /></label><label className="field"><span>What was the motive?</span><textarea value={state.accusation.motive} onChange={event => onState(updateAccusation(state, { ...state.accusation, motive: event.target.value }))} /></label><label className="field"><span>How did the authored actions make it possible?</span><textarea value={state.accusation.chain} onChange={event => onState(updateAccusation(state, { ...state.accusation, chain: event.target.value }))} /></label></section>{blockers.length > 0 && <section className="hard-errors compact"><span>REVEAL BLOCKED</span><ul>{blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></section>}<button className="primary-action" disabled={state.paused || blockers.length > 0} onClick={() => onState(revealToTable(definition, state))}>Lock accusation and reveal to table →</button></>
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
    {active && <><Roster story={story} state={active} onPreview={onPreview} />{definition.acts.some(act => act.id === active.playPhase) && <section className="phase-panel"><div className="page-title"><div><span className="kicker">{active.playPhase}</span><h2>{definition.acts.find(act => act.id === active.playPhase)?.title}</h2><p>{definition.acts.find(act => act.id === active.playPhase)?.operatorGoal}</p></div></div><RunSheet story={story} state={active} performances={Object.fromEntries(Object.entries({ ...active.aiPerformances, ...performanceRequests }).map(([id, performance]) => [id, { ...performance, text: active.aiPerformances[id]?.text }]))} onPerform={perform} onConfirm={beatId => run(() => confirmRunBeat(definition, active, beatId))} onUndo={beatId => run(() => undoRunBeat(definition, active, beatId))} /><button className="primary-action" disabled={active.paused || !story.runPlan.filter(beat => beat.phase === active.playPhase && beat.essential).every(beat => active.completedBeatIds.includes(beat.id))} onClick={() => run(() => advanceAct(definition, active))}>{definition.acts.find(act => act.id === active.playPhase)?.completionLabel}</button></section>}{active.playPhase === 'investigation' && <section className="phase-panel"><Investigation definition={definition} state={active} onState={setState} /></section>}{active.playPhase === 'reveal' && <section className="phase-panel reveal-panel"><span className="kicker">TABLE REVEAL</span><h2>Read the canonical timeline aloud.</h2><div className="theory"><h3>The group accused</h3><p><b>{active.accusation.culprit}</b></p><p>{active.accusation.motive}</p><p>{active.accusation.chain}</p></div><CanonicalTruth story={story} /><button className="primary-action" disabled={active.paused} onClick={() => run(() => completeGame(active))}>Complete the game →</button></section>}</>}
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

  if (storageError) return <main className="fatal-screen"><span className="kicker danger">BOOT FAILED</span><h1>Stored game state is invalid.</h1><pre>{storageError}</pre><button onClick={discardInvalidState}>Discard invalid state</button></main>
  if (mode === 'rules') return <Rules onExit={() => setMode('choose')} />
  if (mode === 'player') return <main className="page player-page"><div className="profile-picker"><label>Choose your character</label><select value={selected} onChange={event => setSelected(event.target.value)}>{story.characters.map(character => <option value={character.id} key={character.id}>{character.name}</option>)}</select></div><PlayerProfile character={player} completedBeatIds={completedBeatIds} onExit={() => setMode('choose')} /></main>
  if (previewing) return <main className="page player-page host-preview"><div className="preview-parent"><button onClick={() => setPreviewing(false)}>← Back to God mode</button><span>HOST PREVIEW · {player.name}</span></div><PlayerProfile character={player} completedBeatIds={completedBeatIds} onExit={() => setPreviewing(false)} /></main>
  if (mode === 'host') return <><header className="mode-bar host-mode"><div><span>GOD MODE · COMPLETE OPERATOR TRUTH</span><b>{definition.title} · {story.totalPeople} people · lifecycle {getHostScreen(game)}</b></div><div className="mode-actions"><button className="quiet" onClick={() => setMode('choose')}>Exit God mode</button></div></header><HostWorkspace definition={definition} state={game} setState={setGame} capabilities={capabilities} gateway={gateway} onPreview={preview} /></>
  return <main className="chooser"><span className="kicker">LE CARNET BLEU · {definition.setting.venueName}</span><h1>{story.title}</h1><p>{story.subtitle}</p><p>Authored definition <code>{definition.fingerprint.slice(0, 12)}</code> · {definition.setting.era} · {definition.setting.tone}</p><button className="rules-link" onClick={() => setMode('rules')}>Read the complete rules →</button><div className="mode-cards"><button onClick={() => setMode('host')}><span>HOST ONLY</span><b>Enter God mode</b><small>Create, enrol, deliver, gate and run the night.</small></button><button onClick={() => setMode('player')}><span>ONE PLAYER</span><b>Open a dossier</b><small>See one suspect’s private facts and live actions.</small></button></div>{importError && <section className="hard-errors compact"><span>IMPORT FAILED</span><pre>{importError}</pre></section>}<div className="case-seed"><label>Authored game</label><label className="quiet"><input type="file" accept="application/json,.json" disabled={game.phase !== 'idle'} onChange={importDefinition} /> Import definition</label><button onClick={exportDefinition}>Export definition</button></div></main>
}
