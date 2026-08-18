import { useState } from 'react'
import { draftGameFromSetting } from '../../game/ai/author'
import type { GameDefinition } from '../../game/definition/contract'
import { createSettingBrief, getSettingBriefBlockers } from '../../game/setting/brief'
import type { SettingBriefInput } from '../../game/setting/contract'
import { StoryReader } from '../story/reader'
import './studio.css'

type ListField = 'playableSpaces' | 'routes' | 'usableFeatures' | 'availableProps' | 'safetyConstraints' | 'accessibilityNeeds' | 'contentBoundaries'

type AuthoringStudioProps = {
  gateway: { state: 'checking' | 'available' | 'unavailable'; model?: string }
  onExit: () => void
  onUse: (definition: GameDefinition) => void
}

const steps = ['Your evening', 'The real place', 'Comfort & boundaries']

function TextField({ label, hint, value, onChange, multiline = false }: {
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
}) {
  return <label className="author-field"><span>{label}</span>{multiline
    ? <textarea value={value} onChange={event => onChange(event.target.value)} placeholder={hint} />
    : <input value={value} onChange={event => onChange(event.target.value)} placeholder={hint} />}</label>
}

function listValue(setting: SettingBriefInput, field: ListField) {
  return (setting[field] ?? []).join('\n')
}

function readList(value: string) {
  return value.split('\n').map(item => item.trim()).filter(Boolean)
}

export function AuthoringStudio({ gateway, onExit, onUse }: AuthoringStudioProps) {
  const [step, setStep] = useState(0)
  const [setting, setSetting] = useState<SettingBriefInput>({})
  const [errors, setErrors] = useState<string[]>([])
  const [requestError, setRequestError] = useState('')
  const [drafting, setDrafting] = useState(false)
  const [draft, setDraft] = useState<GameDefinition>()
  const [reviewing, setReviewing] = useState(false)

  function updateText(field: keyof SettingBriefInput, value: string) {
    setSetting(current => ({ ...current, [field]: value }))
  }

  function updateList(field: ListField, value: string) {
    setSetting(current => ({ ...current, [field]: readList(value) }))
  }

  async function createDraft() {
    const blockers = getSettingBriefBlockers(setting)
    setErrors(blockers)
    setRequestError('')
    if (blockers.length) return
    setDrafting(true)
    try {
      const definition = await draftGameFromSetting(createSettingBrief(setting))
      setDraft(definition)
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error))
    } finally {
      setDrafting(false)
    }
  }

  if (reviewing && draft) return <StoryReader definition={draft} onExit={() => setReviewing(false)} />

  if (draft) return <main className="author-studio draft-ready">
    <button className="author-back" onClick={() => setDraft(undefined)}>← Change the setting</button>
    <section className="draft-card">
      <span className="kicker">AI DRAFT · READY TO REVIEW</span>
      <h1>{draft.title}</h1>
      <p>{draft.story.premise}</p>
      <div className="draft-facts"><span><b>{draft.story.characters.length}</b> suspects</span><span><b>{draft.story.runPlan.length}</b> live beats</span><span><b>{draft.story.timeline.length}</b> truth beats</span></div>
      <div className="draft-actions"><button onClick={() => setReviewing(true)}>Review the full story</button><button className="use-draft" onClick={() => onUse(draft)}>Use this story and set up players →</button></div>
    </section>
  </main>

  return <main className="author-studio">
    <header className="author-head"><button className="author-back" onClick={onExit}>← Back</button><div><span className="kicker">CREATE WITH AI</span><h1>Tell us about your evening.</h1><p>The mystery will be written around your real venue, your people, and your boundaries.</p></div></header>
    <nav className="author-progress" aria-label="Story setup progress">{steps.map((label, index) => <span key={label} className={index === step ? 'active' : index < step ? 'done' : ''}><b>{index + 1}</b>{label}</span>)}</nav>

    {step === 0 && <section className="author-step"><div className="author-step-copy"><span>STEP 1 OF 3</span><h2>What are we creating this for?</h2><p>Give the AI enough social context to make the invitation and tone feel natural.</p></div><div className="author-fields">
      <TextField label="Venue" hint="My apartment, a family farmhouse, a small hotel…" value={setting.venueName ?? ''} onChange={value => updateText('venueName', value)} />
      <TextField label="Location and useful local flavour" hint="Paris; old building near the canal; rainy November evening…" value={setting.location ?? ''} onChange={value => updateText('location', value)} multiline />
      <TextField label="Real occasion" hint="A birthday dinner for six; drinks at 7, dinner at 8…" value={setting.occasion ?? ''} onChange={value => updateText('occasion', value)} multiline />
      <div className="author-pair"><TextField label="Fictional era" hint="Present day, 1920s, timeless…" value={setting.era ?? ''} onChange={value => updateText('era', value)} /><TextField label="Tone" hint="Elegant, funny, gothic…" value={setting.tone ?? ''} onChange={value => updateText('tone', value)} /></div>
    </div></section>}

    {step === 1 && <section className="author-step"><div className="author-step-copy"><span>STEP 2 OF 3</span><h2>What can the story actually use?</h2><p>One item per line. The AI is not allowed to invent a secret passage, terrace, prop, or lighting trick.</p></div><div className="author-fields">
      <TextField label="Playable spaces" hint={'Dining room\nLiving room\nCovered balcony'} value={listValue(setting, 'playableSpaces')} onChange={value => updateList('playableSpaces', value)} multiline />
      <TextField label="Safe routes between them" hint={'Step-free hall between dining and living rooms\nBalcony only with host present'} value={listValue(setting, 'routes')} onChange={value => updateList('routes', value)} multiline />
      <TextField label="Features worth using (optional)" hint={'Old fireplace\nRecord player\nView of the church clock'} value={listValue(setting, 'usableFeatures')} onChange={value => updateList('usableFeatures', value)} multiline />
      <TextField label="Easy props and costumes (optional)" hint={'Sealed envelopes\nCostume jewellery\nBattery candles'} value={listValue(setting, 'availableProps')} onChange={value => updateList('availableProps', value)} multiline />
    </div></section>}

    {step === 2 && <section className="author-step"><div className="author-step-copy"><span>STEP 3 OF 3</span><h2>Keep it fun for the actual group.</h2><p>These answers are hard rules for the generated story, not suggestions.</p></div><div className="author-fields">
      <TextField label="Safety, privacy, timing, or venue rules" hint={'No darkness\nNo physical contact\nFinish within three hours'} value={listValue(setting, 'safetyConstraints')} onChange={value => updateList('safetyConstraints', value)} multiline />
      <TextField label="Accessibility needs (optional)" hint={'All essential play must work seated\nAvoid small printed text'} value={listValue(setting, 'accessibilityNeeds')} onChange={value => updateList('accessibilityNeeds', value)} multiline />
      <TextField label="Themes or content to avoid" hint={'No harm to children\nNo sexual violence\nNo real family secrets'} value={listValue(setting, 'contentBoundaries')} onChange={value => updateList('contentBoundaries', value)} multiline />
      {errors.length > 0 && <section className="author-errors"><b>Please finish the setting first</b><ul>{errors.map(error => <li key={error}>{error}</li>)}</ul></section>}
      {requestError && <section className="author-errors"><b>The draft failed</b><p>{requestError}</p></section>}
      <div className={`author-ai-status ${gateway.state}`}>{gateway.state === 'available' ? `AI ready${gateway.model ? ` · ${gateway.model}` : ''}` : gateway.state === 'checking' ? 'Checking AI…' : 'AI drafting is not configured on this deployment.'}</div>
    </div></section>}

    <footer className="author-footer"><button className="author-secondary" disabled={step === 0 || drafting} onClick={() => { setErrors([]); setStep(current => current - 1) }}>Back</button>{step < steps.length - 1
      ? <button className="author-next" onClick={() => { setErrors([]); setStep(current => current + 1) }}>Continue →</button>
      : <button className="author-next" disabled={drafting || gateway.state !== 'available'} onClick={createDraft}>{drafting ? 'Writing your mystery…' : 'Draft my story with AI →'}</button>}</footer>
  </main>
}
