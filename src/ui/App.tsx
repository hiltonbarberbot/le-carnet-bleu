import { useEffect, useMemo, useState } from 'react'
import { generateGame } from '../game/generate'
import {
  abortGame,
  completeGame,
  confirmRunBeat,
  createSetupDraft,
  getRevealBlockers,
  getSetupBlockers,
  lockRoster,
  revealToTable,
  startBlackout,
  startDinner,
  startInvestigation,
  toggleEvidence,
  togglePause,
  undoRunBeat,
  updateAccusation,
  venueChecks,
} from '../game/session/lifecycle'
import type { Character, GameSession, SetupDraft, Story } from '../game/types'

type Mode = 'choose' | 'rules' | 'host' | 'player'

const SESSION_KEY = 'le-carnet-bleu:session:v2'
const SETUP_KEY = 'le-carnet-bleu:setup:v2'

function readStored<T>(key: string): { value: T | null; error: string } {
  const raw = localStorage.getItem(key)
  if (!raw) return { value: null, error: '' }
  try {
    return { value: JSON.parse(raw) as T, error: '' }
  } catch {
    return { value: null, error: `Stored game data at ${key} is invalid.` }
  }
}

function Rules({ onExit }: { onExit: () => void }) {
  return <main className="rules-page">
    <button className="rules-back" onClick={onExit}>← Back</button>
    <header><span className="kicker">HOW TO PLAY</span><h1>A murder mystery that happens around your dinner table.</h1><p>Six people play: one host performs Le Maître Concierge and becomes Game Master after the murder; five guests each play one suspect.</p></header>
    <section className="rules-summary"><article><b>PEOPLE</b><strong>6 total</strong></article><article><b>TIME</b><strong>2–3 hours</strong></article><article><b>YOU NEED</b><strong>Dinner, five costumes, jackets, a notebook and safe light control</strong></article></section>
    <section className="rules-block"><span>BEFORE THE NIGHT</span><h2>1. Lock the roster and stage the room</h2><ol><li>The host opens God mode and assigns all five guest roles.</li><li>Everyone reads only their private dossier.</li><li>The host completes every venue requirement and rehearses the no-contact blackout sequence.</li></ol></section>
    <section className="rules-block"><span>ACT ONE · DINNER</span><h2>2. Follow the live actions</h2><p>Memories are facts your character knows. Actions are things you perform only when their cue occurs. The host runs the ordered sequence from God mode.</p><div className="rule-pair"><article><h3>You may</h3><ul><li>Share or conceal a memory</li><li>Lie about motives and secrets</li><li>Question anyone</li></ul></article><article><h3>You may not</h3><ul><li>Invent evidence</li><li>Change a written memory</li><li>Skip an essential action</li><li>Use real physical force</li></ul></article></div></section>
    <section className="rules-block"><span>THE TURN</span><h2>3. Stage the blackout safely</h2><p>Amélie gives the in-fiction signal. The host controls the real lights, cues the no-contact confrontation, stages the fall, and restores the lights only after the false-suspect tableau is ready.</p></section>
    <section className="rules-block"><span>ACT TWO · INVESTIGATION</span><h2>4. Reconstruct what happened</h2><p>Question one another, disclose memories, order events, and agree on the culprit, motive and causal chain. The host tracks which evidence has actually entered play.</p></section>
    <section className="rules-block final-rule"><span>ENDING THE GAME</span><h2>5. Lock one accusation</h2><p>The host records the group’s accusation, reveals the canonical timeline to the table, and compares the theory with what actually happened.</p></section>
    <button className="rules-start" onClick={onExit}>Understood — return →</button>
  </main>
}

function PlayerProfile({ character, onExit }: { character: Character; onExit?: () => void }) {
  return <>
    <div className="mode-bar player-mode">
      <div><span>PLAYER PROFILE</span><b>You are viewing only {character.name}’s information</b></div>
      <div className="mode-actions">
        <button onClick={() => window.print()}>Print / save PDF</button>
        {onExit && <button className="quiet" onClick={onExit}>Exit profile</button>}
      </div>
    </div>
    <article className="profile">
      <header><div><span className="label">YOUR CHARACTER</span><p>{character.title}</p><h1>{character.name}</h1></div><span className="stamp">PRIVATE</span></header>
      <section className="start-here"><span className="number">1</span><div><h2>Who you are</h2><p>{character.publicFace}</p><p><b>Your secret:</b> {character.privateSecret}</p><p><b>Wear:</b> {character.costume}</p></div></section>
      <section><div className="profile-heading"><span className="number">2</span><div><h2>What you know</h2><p>These are facts your character knows. Share, hide or lie about them as you wish.</p></div></div><div className="plain-list">{character.memories.map(memory => <div key={memory.id}>{memory.text}</div>)}</div></section>
      <section><div className="profile-heading"><span className="number red">3</span><div><h2>What you must do</h2><p>Perform these only when the cue happens. Physical conflict is always mimed without contact.</p></div></div><div className="task-list">{character.actions.map(action => <article key={action.id}><b>WHEN: {action.cue}</b><p>{action.text}</p></article>)}</div></section>
    </article>
  </>
}

function CanonicalTruth({ story }: { story: Story }) {
  return <details className="canonical-truth" open>
    <summary><span>GOD MODE TRUTH</span><b>{story.culprit}</b></summary>
    <p>{story.solution}</p>
    <div className="truth-grid">{story.timeline.map(beat => <article key={beat.beat}><span>{beat.beat}</span><div><b>{beat.title}</b><p>{beat.truth}</p><small>{beat.evidence.join(' · ')}</small></div></article>)}</div>
  </details>
}

function SetupPanel({ story, setup, onChange, onLock, onPreview }: {
  story: Story
  setup: SetupDraft
  onChange: (setup: SetupDraft) => void
  onLock: () => void
  onPreview: (roleId: string) => void
}) {
  const blockers = getSetupBlockers(story, setup)

  function updateSeat(roleId: string, patch: Partial<SetupDraft['seats'][number]>) {
    onChange({ ...setup, seats: setup.seats.map(seat => seat.roleId === roleId ? { ...seat, ...patch } : seat) })
  }

  return <>
    <section className="setup-hero">
      <span className="kicker">GAME NOT READY</span>
      <h1>Prepare all six people before God mode can run the night.</h1>
      <p>One host plus five guest roles. AI remains a last-moment fallback policy, but this build correctly refuses it because no AI runtime is connected.</p>
    </section>

    <section className="setup-section">
      <div className="setup-heading"><span>1</span><div><h2>Name the host</h2><p>The host plays the Concierge, controls the room, then becomes Game Master.</p></div></div>
      <label className="field"><span>Host name</span><input value={setup.hostName} onChange={event => onChange({ ...setup, hostName: event.target.value })} placeholder="Host / Concierge" /></label>
    </section>

    <section className="setup-section">
      <div className="setup-heading"><span>2</span><div><h2>Fill the five guest seats</h2><p>A human keeps the reservation until roster lock. If they are not ready then, fallback is considered—not before.</p></div></div>
      <div className="seat-grid">{story.characters.map(character => {
        const seat = setup.seats.find(item => item.roleId === character.id)!
        return <article key={character.id} className="seat-card">
          <header><div><b>{character.name}</b><small>{character.title}</small></div><button onClick={() => onPreview(character.id)}>Dossier</button></header>
          <label className="field"><span>Human player</span><input value={seat.humanName} onChange={event => updateSeat(character.id, { humanName: event.target.value, ready: false })} placeholder="Name" /></label>
          <label className="check-row"><input type="checkbox" checked={seat.ready} onChange={event => updateSeat(character.id, { ready: event.target.checked })} /><span>Human confirmed and has read the dossier</span></label>
          <label className="check-row"><input type="checkbox" checked={seat.allowAiFallback} onChange={event => updateSeat(character.id, { allowAiFallback: event.target.checked })} /><span>Allow AI fallback at roster lock</span></label>
        </article>
      })}</div>
    </section>

    <section className="setup-section">
      <div className="setup-heading"><span>3</span><div><h2>Prove the room can perform the story</h2><p>These are game dependencies, not optional production polish.</p></div></div>
      <div className="venue-list">{venueChecks.map(check => <label key={check.id}><input type="checkbox" checked={Boolean(setup.venue[check.id])} onChange={event => onChange({ ...setup, venue: { ...setup.venue, [check.id]: event.target.checked } })} /><span>{check.label}</span></label>)}</div>
    </section>

    {blockers.length > 0 && <section className="hard-errors"><span>ROSTER LOCK FAILED</span><h2>{blockers.length} hard {blockers.length === 1 ? 'blocker' : 'blockers'}</h2><ul>{blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></section>}
    <button className="primary-action" disabled={blockers.length > 0} onClick={onLock}>Lock roster and enter lobby →</button>
  </>
}

function RunSheet({ story, session, onConfirm, onUndo }: {
  story: Story
  session: GameSession
  onConfirm: (beatId: string) => void
  onUndo: (beatId: string) => void
}) {
  const beats = story.runPlan.filter(beat => beat.phase === session.phase)
  return <div className="run-sheet">{beats.map(beat => {
    const done = session.completedBeatIds.includes(beat.id)
    const blockedBy = beat.dependsOn.filter(id => !session.completedBeatIds.includes(id))
    const actions = beat.actionIds.map(id => story.characters.flatMap(character => character.actions.map(action => ({ ...action, owner: character.name, roleId: character.id }))).find(action => action.id === id)!)
    return <article key={beat.id} className={`${done ? 'done' : ''} ${beat.essential ? 'essential' : ''}`}>
      <header><div><small>{beat.trigger}</small><h3>{beat.title}</h3></div><b>{beat.essential ? 'REQUIRED' : 'OPTIONAL'}</b></header>
      <p className="operator-copy">{beat.operator}</p>
      {actions.map(action => {
        const controller = session.roster[action.roleId]
        const proxy = controller?.kind === 'ai' && action.physical ? ` · Physical proxy: ${controller.physicalProxy}` : ''
        return <div className="beat-action" key={action.id}><b>{action.owner}</b><p>{action.text}</p><small>{action.consequence}{proxy}</small></div>
      })}
      {blockedBy.length > 0 && <p className="blocked-copy">Blocked by: {blockedBy.map(id => story.runPlan.find(item => item.id === id)?.title).join(', ')}</p>}
      <button disabled={session.paused || blockedBy.length > 0} onClick={() => done ? onUndo(beat.id) : onConfirm(beat.id)}>{done ? 'Undo confirmation' : 'Confirm this beat happened'}</button>
    </article>
  })}</div>
}

function Investigation({ story, session, onSession }: { story: Story; session: GameSession; onSession: (session: GameSession) => void }) {
  const evidence = [
    ...story.publicEvidence.map(item => ({ ...item, owner: 'Crime scene' })),
    ...story.characters.flatMap(character => character.memories.filter(memory => memory.beat).map(memory => ({ id: memory.id, text: memory.text, beat: memory.beat!, owner: character.name }))),
  ].filter(item => story.timeline.some(beat => beat.evidence.includes(item.id)))
  const blockers = getRevealBlockers(story, session)

  return <>
    <div className="page-title"><div><span className="kicker">INVESTIGATION</span><h2>Track what has actually entered play.</h2></div><b>{session.revealedEvidenceIds.length}/{evidence.length} surfaced</b></div>
    <div className="evidence-list">{evidence.sort((a, b) => a.beat - b.beat).map(item => <label key={item.id}><input type="checkbox" checked={session.revealedEvidenceIds.includes(item.id)} onChange={() => onSession(toggleEvidence(session, item.id))} /><span><small>BEAT {item.beat} · {item.owner}</small><b>{item.text}</b></span></label>)}</div>
    <section className="accusation"><span className="kicker">ONE GROUP ACCUSATION</span><label className="field"><span>Who caused the death?</span><input value={session.accusation.culprit} onChange={event => onSession(updateAccusation(session, { ...session.accusation, culprit: event.target.value }))} /></label><label className="field"><span>Why did they confront the Concierge?</span><textarea value={session.accusation.motive} onChange={event => onSession(updateAccusation(session, { ...session.accusation, motive: event.target.value }))} /></label><label className="field"><span>How did the dinner actions make it possible?</span><textarea value={session.accusation.chain} onChange={event => onSession(updateAccusation(session, { ...session.accusation, chain: event.target.value }))} /></label></section>
    {blockers.length > 0 && <section className="hard-errors compact"><span>REVEAL BLOCKED</span><ul>{blockers.map(blocker => <li key={blocker}>{blocker}</li>)}</ul></section>}
    <button className="primary-action" disabled={session.paused || blockers.length > 0} onClick={() => onSession(revealToTable(story, session))}>Lock accusation and reveal to table →</button>
  </>
}

function HostWorkspace({ story, setup, setSetup, session, setSession, onPreview, onClear }: {
  story: Story
  setup: SetupDraft
  setSetup: (setup: SetupDraft) => void
  session: GameSession | null
  setSession: (session: GameSession | null) => void
  onPreview: (roleId: string) => void
  onClear: () => void
}) {
  const [commandError, setCommandError] = useState('')

  function run(command: () => GameSession) {
    try {
      setCommandError('')
      setSession(command())
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
    }
  }

  if (!session) return <main className="page host-page"><CanonicalTruth story={story} /><SetupPanel story={story} setup={setup} onChange={setSetup} onPreview={onPreview} onLock={() => run(() => lockRoster(story, setup))} /></main>

  const essentialDinnerDone = story.runPlan.filter(beat => beat.phase === 'dinner' && beat.essential).every(beat => session.completedBeatIds.includes(beat.id))
  const essentialBlackoutDone = story.runPlan.filter(beat => beat.phase === 'blackout' && beat.essential).every(beat => session.completedBeatIds.includes(beat.id))

  return <main className="page host-page">
    <section className="session-head"><div><span className="kicker">LIVE SESSION</span><h1>{session.paused ? 'Paused' : session.phase}</h1><p>{story.characters.length} guests + {session.hostName} as host</p></div><div className="session-actions"><button onClick={() => setSession(togglePause(session))}>{session.paused ? 'Resume' : 'Pause'}</button><button className="danger-button" onClick={() => run(() => abortGame(session))}>Abort</button></div></section>
    {commandError && <section className="hard-errors compact"><span>COMMAND FAILED</span><pre>{commandError}</pre></section>}
    <CanonicalTruth story={story} />

    <section className="roster-strip">{story.characters.map(character => <button key={character.id} onClick={() => onPreview(character.id)}><span>{character.name}</span><b>{session.roster[character.id]?.displayName}</b><small>{session.roster[character.id]?.kind} · dossier →</small></button>)}</section>

    {session.phase === 'lobby' && <section className="phase-panel"><span className="kicker">LOBBY</span><h2>The roster and room are locked.</h2><p>Seat the five guests, confirm everyone is in character, and begin when the first drink can be served.</p><button className="primary-action" disabled={session.paused} onClick={() => run(() => startDinner(session))}>Start dinner →</button></section>}

    {(session.phase === 'dinner' || session.phase === 'blackout') && <section className="phase-panel"><div className="page-title"><div><span className="kicker">{session.phase}</span><h2>{session.phase === 'dinner' ? 'Run the causal chain.' : 'Stage the murder safely.'}</h2></div></div><RunSheet story={story} session={session} onConfirm={beatId => run(() => confirmRunBeat(story, session, beatId))} onUndo={beatId => run(() => undoRunBeat(story, session, beatId))} />{session.phase === 'dinner' ? <button className="primary-action" disabled={session.paused || !essentialDinnerDone} onClick={() => run(() => startBlackout(story, session))}>Begin blackout sequence →</button> : <button className="primary-action" disabled={session.paused || !essentialBlackoutDone} onClick={() => run(() => startInvestigation(story, session))}>Restore lights and begin investigation →</button>}</section>}

    {session.phase === 'investigation' && <section className="phase-panel"><Investigation story={story} session={session} onSession={setSession} /></section>}

    {session.phase === 'reveal' && <section className="phase-panel reveal-panel"><span className="kicker">TABLE REVEAL</span><h2>Read the canonical timeline aloud.</h2><div className="theory"><h3>The group accused</h3><p><b>{session.accusation.culprit}</b></p><p>{session.accusation.motive}</p><p>{session.accusation.chain}</p></div><CanonicalTruth story={story} /><button className="primary-action" disabled={session.paused} onClick={() => run(() => completeGame(session))}>Complete the game →</button></section>}

    {session.phase === 'complete' && <section className="phase-panel terminal"><span className="kicker">CASE CLOSED</span><h2>The game completed successfully.</h2><p>The roster, performed beats, surfaced evidence and accusation remain recorded in this browser.</p><button onClick={onClear}>Discard this finished game</button></section>}
    {session.phase === 'aborted' && <section className="phase-panel terminal"><span className="kicker danger">GAME ABORTED</span><h2>No further commands can run.</h2><button onClick={onClear}>Discard and prepare a new game</button></section>}
  </main>
}

export function App() {
  const params = new URLSearchParams(location.search)
  const [seed, setSeed] = useState(params.get('seed') || 'grambois-bleu')
  const [mode, setMode] = useState<Mode>('choose')
  const [previewing, setPreviewing] = useState(false)
  const [selected, setSelected] = useState('jacques')
  const story = useMemo(() => generateGame(seed), [seed])
  const initialSession = useMemo(() => readStored<GameSession>(SESSION_KEY), [])
  const initialSetup = useMemo(() => readStored<SetupDraft>(SETUP_KEY), [])
  const [storageError, setStorageError] = useState(initialSession.error || initialSetup.error)
  const [setup, setSetup] = useState<SetupDraft>(() => initialSetup.value || createSetupDraft(story))
  const [session, setSession] = useState<GameSession | null>(() => initialSession.value?.storyId === story.id && initialSession.value.seed === story.seed ? initialSession.value : null)
  const player = story.characters.find(item => item.id === selected) || story.characters[0]

  useEffect(() => { localStorage.setItem(SETUP_KEY, JSON.stringify(setup)) }, [setup])
  useEffect(() => {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else localStorage.removeItem(SESSION_KEY)
  }, [session])

  function clearStoredGame() {
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(SETUP_KEY)
    setStorageError('')
    setSession(null)
    setSetup(createSetupDraft(story))
  }

  function preview(roleId: string) {
    setSelected(roleId)
    setPreviewing(true)
  }

  function copyGameLink() {
    const url = new URL(location.href)
    url.searchParams.set('seed', seed)
    navigator.clipboard.writeText(url.toString())
  }

  if (storageError) return <main className="fatal-screen"><span className="kicker danger">BOOT FAILED</span><h1>Stored game state is invalid.</h1><pre>{storageError}</pre><button onClick={clearStoredGame}>Discard invalid state</button></main>
  if (mode === 'rules') return <Rules onExit={() => setMode('choose')} />
  if (mode === 'player') return <main className="page player-page"><div className="profile-picker"><label>Choose your character</label><select value={selected} onChange={event => setSelected(event.target.value)}>{story.characters.map(character => <option value={character.id} key={character.id}>{character.name}</option>)}</select></div><PlayerProfile character={player} onExit={() => setMode('choose')} /></main>
  if (previewing) return <main className="page player-page host-preview"><div className="preview-parent"><button onClick={() => setPreviewing(false)}>← Back to God mode</button><span>HOST PREVIEW · {player.name}</span></div><PlayerProfile character={player} onExit={() => setPreviewing(false)} /></main>
  if (mode === 'host') return <><header className="mode-bar host-mode"><div><span>GOD MODE · COMPLETE OPERATOR TRUTH</span><b>{story.totalPeople} people total · {story.characters.length} guests + 1 host</b></div><div className="mode-actions"><button className="quiet" onClick={() => setMode('choose')}>Exit God mode</button></div></header><HostWorkspace story={story} setup={setup} setSetup={setSetup} session={session} setSession={setSession} onPreview={preview} onClear={clearStoredGame} /></>

  return <main className="chooser">
    <span className="kicker">LE CARNET BLEU</span>
    <h1>Six people. One host. Five suspects.</h1>
    <p>God mode now refuses to run until the roster, dossiers and physical room are genuinely ready.</p>
    <button className="rules-link" onClick={() => setMode('rules')}>Read the complete rules →</button>
    <div className="mode-cards"><button onClick={() => setMode('host')}><span>HOST ONLY</span><b>Enter God mode</b><small>Prepare, gate and run the complete night.</small></button><button onClick={() => setMode('player')}><span>ONE PLAYER</span><b>Open a dossier</b><small>See one suspect’s private facts and live actions.</small></button></div>
    <div className="case-seed"><label>Case code</label><input value={seed} disabled={Boolean(session)} onChange={event => setSeed(event.target.value)} /><button onClick={copyGameLink}>Copy case link</button></div>
  </main>
}
