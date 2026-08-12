import { useMemo, useState } from 'react'
import { generateGame } from '../game/generate'
import type { Character } from '../game/types'

type Mode = 'choose' | 'host' | 'player'

function PlayerProfile({ character, onExit }: { character: Character; onExit?: () => void }) {
  return <>
    <div className="mode-bar player-mode">
      <div><span>PLAYER PROFILE</span><b>You are viewing only {character.name}’s information</b></div>
      <div className="mode-actions">
        <button onClick={() => window.print()}>Download / print PDF</button>
        {onExit && <button className="quiet" onClick={onExit}>Exit profile</button>}
      </div>
    </div>
    <article className="profile">
      <header>
        <div><span className="label">YOUR CHARACTER</span><p>{character.title}</p><h1>{character.name}</h1></div>
        <span className="stamp">PRIVATE</span>
      </header>

      <section className="start-here">
        <span className="number">1</span><div><h2>Who you are</h2><p>{character.publicFace}</p><p><b>Your secret:</b> {character.privateSecret}</p><p><b>Wear:</b> {character.costume}</p></div>
      </section>

      <section>
        <div className="profile-heading"><span className="number">2</span><div><h2>What you know</h2><p>These are your memories. Share, hide or lie about them as you wish.</p></div></div>
        <div className="plain-list">{character.memories.map(memory => <div key={memory.id}>{memory.text}</div>)}</div>
      </section>

      <section>
        <div className="profile-heading"><span className="number red">3</span><div><h2>What you must do</h2><p>Do these naturally when the cue happens. Do not explain why.</p></div></div>
        <div className="task-list">{character.actions.map(action => <article key={action.id}><b>WHEN: {action.cue}</b><p>{action.text}</p></article>)}</div>
      </section>
    </article>
  </>
}

export function App() {
  const params = new URLSearchParams(location.search)
  const [seed, setSeed] = useState(params.get('seed') || 'grambois-bleu')
  const [mode, setMode] = useState<Mode>('choose')
  const [previewing, setPreviewing] = useState(false)
  const [truthOpen, setTruthOpen] = useState(false)
  const [selected, setSelected] = useState('jacques')
  const [completed, setCompleted] = useState<string[]>([])
  const game = useMemo(() => generateGame(seed), [seed])
  const player = game.characters.find(item => item.id === selected) || game.characters[0]
  const actions = game.characters.flatMap(character => character.actions.map(action => ({ ...action, owner: character.name })))

  function copyGameLink() {
    const url = new URL(location.href)
    url.searchParams.set('seed', seed)
    navigator.clipboard.writeText(url.toString())
  }

  if (mode === 'choose') return <main className="chooser">
    <span className="kicker">LE CARNET BLEU</span>
    <h1>Who is using this screen?</h1>
    <p>Choose carefully. Host mode contains the solution.</p>
    <div className="mode-cards">
      <button onClick={() => setMode('host')}><span>HOST ONLY</span><b>Enter god mode</b><small>Run the night, see every action and reveal the truth.</small></button>
      <button onClick={() => setMode('player')}><span>ONE PLAYER</span><b>Open a profile</b><small>See exactly what one character needs to know and do.</small></button>
    </div>
    <div className="case-seed"><label>Game seed</label><input value={seed} onChange={event => setSeed(event.target.value)} /><button onClick={copyGameLink}>Copy game link</button></div>
  </main>

  if (mode === 'player') return <main className="page player-page">
    <div className="profile-picker"><label>Choose your character</label><select value={selected} onChange={event => setSelected(event.target.value)}>{game.characters.map(character => <option value={character.id} key={character.id}>{character.name}</option>)}</select></div>
    <PlayerProfile character={player} onExit={() => setMode('choose')} />
  </main>

  if (previewing) return <main className="page player-page host-preview">
    <div className="preview-parent"><button onClick={() => setPreviewing(false)}>← Back to god mode</button><span>HOST PREVIEW · this is what {player.name} receives</span></div>
    <div className="profile-picker"><label>Preview another dossier</label><select value={selected} onChange={event => setSelected(event.target.value)}>{game.characters.map(character => <option value={character.id} key={character.id}>{character.name}</option>)}</select></div>
    <PlayerProfile character={player} onExit={() => setPreviewing(false)} />
  </main>

  return <>
    <header className="mode-bar host-mode">
      <div><span>GOD MODE · HOST EYES ONLY</span><b>You can see every secret and the full solution</b></div>
      <div className="mode-actions"><button className="quiet" onClick={() => setMode('choose')}>Exit god mode</button></div>
    </header>
    <main className="page host-page">
      <div className="host-intro"><span className="kicker">YOUR CONTROL ROOM</span><h1>Run the night from top to bottom.</h1><p>Prepare the guests, run the actions, then reveal the truth.</p></div>
      <section className="host-phase"><div className="phase-marker"><b>1</b><span>BEFORE GUESTS ARRIVE</span></div><div className="phase-content"><h2>Send each guest their dossier</h2><p>Open a card to preview and export that player’s private PDF. You always return here.</p><div className="dossier-grid">{game.characters.map(character => <button key={character.id} onClick={() => { setSelected(character.id); setPreviewing(true) }}><span>PRIVATE DOSSIER</span><b>{character.name}</b><small>{character.title}</small><em>Open dossier →</em></button>)}</div></div></section>
      <section className="host-phase"><div className="phase-marker"><b>2</b><span>DURING DINNER</span></div><div className="phase-content">
        <div className="page-title"><div><h2>Make these actions happen</h2><p>Stay as the Concierge. Cue each player and tick it off.</p></div><b>{completed.length}/{actions.length} done</b></div>
        <div className="run-list">{actions.map(action => <label className={action.essential ? 'essential' : ''} key={action.id}><input type="checkbox" checked={completed.includes(action.id)} onChange={() => setCompleted(list => list.includes(action.id) ? list.filter(id => id !== action.id) : [...list, action.id])}/><div><small>{action.cue}</small><h3>{action.owner}</h3><p>{action.text}</p><em>What it causes: {action.consequence}</em></div></label>)}</div>
        <div className="blackout"><span>FINAL HOST ACTION</span><b>Kill the lights for 60 seconds</b><small>When they return, the Concierge is dead. Become game master.</small></div>
      </div></section>
      <section className="host-phase"><div className="phase-marker"><b>3</b><span>AFTER THE MURDER</span></div><div className="phase-content"><h2>Let them investigate. Reveal when ready.</h2><p>The solution stays sealed until you deliberately open it.</p>{!truthOpen ? <button className="truth-seal" onClick={() => setTruthOpen(true)}><span>HOST EYES ONLY</span><b>Reveal the solution</b><small>Show the culprit and canonical timeline →</small></button> : <div className="truth"><div className="page-title"><div><span className="kicker danger">SPOILERS</span><h2>What actually happened</h2></div><b className="culprit">CULPRIT: {game.culprit}</b></div><p className="solution">{game.solution}</p><div className="timeline">{game.timeline.map(item => <article key={item.beat}><span>{item.beat}</span><div><h3>{item.title}</h3><p>{item.truth}</p><small>Proof: {item.evidence.join(' · ')}</small></div></article>)}</div></div>}</div></section>
    </main>
  </>
}
