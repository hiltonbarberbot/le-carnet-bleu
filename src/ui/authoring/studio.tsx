import { useState } from 'react'
import { draftStorylineFromSetting } from '../../game/ai/author'
import { shapeSettingFromPrompt } from '../../game/ai/setting'
import type { StorylineDefinition } from '../../game/definition/contract'
import { createSettingBrief, getSettingBriefBlockers } from '../../game/setting/brief'
import type { SettingBriefInput } from '../../game/setting/contract'
import { StoryReader } from '../story/reader'
import './studio.css'

type ListField = 'playableSpaces' | 'routes' | 'usableFeatures' | 'availableProps' | 'safetyConstraints' | 'accessibilityNeeds' | 'contentBoundaries'

type AuthoringStudioProps = {
  gateway: { state: 'checking' | 'available' | 'unavailable'; model?: string }
  onExit: () => void
  onSave: (storyline: StorylineDefinition) => void
}

const steps = ['The spark', 'Reality check', 'Comfort & boundaries']

const listFields: ListField[] = ['playableSpaces', 'routes', 'usableFeatures', 'availableProps', 'safetyConstraints', 'accessibilityNeeds', 'contentBoundaries']

function emptyListDrafts(): Record<ListField, string> {
  return Object.fromEntries(listFields.map(field => [field, ''])) as Record<ListField, string>
}

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

export function readSettingList(value: string) {
  return value
    .split(/\r?\n|;/)
    .map(item => item.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
}

export function AuthoringStudio({ gateway, onExit, onSave }: AuthoringStudioProps) {
  const [step, setStep] = useState(0)
  const [prompt, setPrompt] = useState('')
  const [setting, setSetting] = useState<SettingBriefInput>({})
  const [listDrafts, setListDrafts] = useState<Record<ListField, string>>(emptyListDrafts)
  const [errors, setErrors] = useState<string[]>([])
  const [requestError, setRequestError] = useState('')
  const [shaping, setShaping] = useState(false)
  const [promptWasShaped, setPromptWasShaped] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [draft, setDraft] = useState<StorylineDefinition>()
  const [reviewing, setReviewing] = useState(false)

  function updateText(field: keyof SettingBriefInput, value: string) {
    setSetting(current => ({ ...current, [field]: value }))
  }

  function updateList(field: ListField, value: string) {
    // Keep the exact editing buffer separate from its normalized value. Normalizing
    // the controlled textarea itself makes trailing spaces and new lines disappear.
    setListDrafts(current => ({ ...current, [field]: value }))
    setSetting(current => ({ ...current, [field]: readSettingList(value) }))
  }

  function applySettingDraft(next: SettingBriefInput) {
    setSetting(next)
    setListDrafts(Object.fromEntries(listFields.map(field => [field, listValue(next, field)])) as Record<ListField, string>)
  }

  async function shapePrompt() {
    if (!prompt.trim()) {
      setRequestError('Give us a few lines about the evening first.')
      return
    }
    setRequestError('')
    if (gateway.state !== 'available') {
      applySettingDraft({ occasion: prompt.trim() })
      setPromptWasShaped(false)
      setStep(1)
      return
    }

    setShaping(true)
    try {
      applySettingDraft(await shapeSettingFromPrompt(prompt))
      setPromptWasShaped(true)
      setStep(1)
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error))
    } finally {
      setShaping(false)
    }
  }

  async function createDraft() {
    const blockers = getSettingBriefBlockers(setting)
    setErrors(blockers)
    setRequestError('')
    if (blockers.length) return
    setDrafting(true)
    try {
      const definition = await draftStorylineFromSetting(createSettingBrief(setting))
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
      <span className="kicker">STORYLINE DRAFT · READY TO REVIEW</span>
      <h1>{draft.title}</h1>
      <p>{draft.story.premise}</p>
      <div className="draft-facts"><span><b>{draft.story.characters.length}</b> suspects</span><span><b>{draft.story.runPlan.length}</b> live beats</span><span><b>{draft.story.timeline.length}</b> truth beats</span></div>
      <div className="draft-actions"><button onClick={() => setReviewing(true)}>Review the full storyline</button><button className="use-draft" onClick={() => onSave(draft)}>Save storyline to library →</button></div>
    </section>
  </main>

  return <main className="author-studio">
    <header className="author-head"><button className="author-back" onClick={onExit}>← Back</button><div><span className="kicker">CREATE WITH AI</span><h1>Tell us about your evening.</h1><p>Start with the feeling, the place, or the people. We’ll pull out the practical details together afterwards.</p></div></header>
    <nav className="author-progress" aria-label="Story setup progress">{steps.map((label, index) => <span key={label} className={index === step ? 'active' : index < step ? 'done' : ''}><b>{index + 1}</b>{label}</span>)}</nav>

    {step === 0 && <section className="author-prompt-step">
      <div className="author-prompt-copy"><span>THE OPENING PAGE</span><h2>What do you have in mind?</h2><p>Loose notes are perfect. Mention whatever you already know and leave the rest for later.</p></div>
      <label className="author-prompt"><span className="sr-only">Describe the evening</span><textarea autoFocus spellCheck value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={'A slightly decadent birthday dinner in our old apartment in Lyon. Six friends, present day, funny and elegant rather than grim. We can use the dining room and little winter garden…'} /></label>
      <div className="author-prompt-meta"><span>Write naturally. Spaces, paragraphs, and bullet points all work.</span><span>{prompt.trim().length ? `${prompt.trim().length} characters` : 'Start anywhere'}</span></div>
      {requestError && <section className="author-errors compact"><b>Not quite yet</b><p>{requestError}</p></section>}
      <button className="author-shape" disabled={shaping} onClick={shapePrompt}>{shaping ? 'Finding the shape of it…' : gateway.state === 'available' ? 'Shape this into a brief →' : 'Continue with these notes →'}</button>
    </section>}

    {step === 1 && <section className="author-step"><div className="author-step-copy"><span>STEP 2 OF 3</span><h2>Make it true to the real place.</h2><p>{promptWasShaped ? 'We pulled out only what you told us. Correct anything that landed wrong and fill the genuine gaps.' : 'Add the concrete facts the story is not allowed to invent.'}</p></div><div className="author-fields">
      <TextField label="Venue" hint="My apartment, a family farmhouse, a small hotel…" value={setting.venueName ?? ''} onChange={value => updateText('venueName', value)} />
      <TextField label="Location and useful local flavour" hint="Lyon; old building near the river; rainy November evening…" value={setting.location ?? ''} onChange={value => updateText('location', value)} multiline />
      <TextField label="What is really happening" hint="A birthday dinner for six; drinks at 7, dinner at 8…" value={setting.occasion ?? ''} onChange={value => updateText('occasion', value)} multiline />
      <div className="author-pair"><TextField label="Fictional era" hint="Present day, 1920s, timeless…" value={setting.era ?? ''} onChange={value => updateText('era', value)} /><TextField label="Tone" hint="Elegant, funny, gothic…" value={setting.tone ?? ''} onChange={value => updateText('tone', value)} /></div>
      <TextField label="Playable spaces" hint={'Dining room\nLiving room\nCovered balcony'} value={listDrafts.playableSpaces} onChange={value => updateList('playableSpaces', value)} multiline />
      <TextField label="Safe routes between them" hint={'Step-free hall between dining and living rooms\nBalcony only with host present'} value={listDrafts.routes} onChange={value => updateList('routes', value)} multiline />
      <TextField label="Features worth using (optional)" hint={'Old fireplace\nRecord player\nView of the church clock'} value={listDrafts.usableFeatures} onChange={value => updateList('usableFeatures', value)} multiline />
      <TextField label="Easy props and costumes (optional)" hint={'Sealed envelopes\nCostume jewellery\nBattery candles'} value={listDrafts.availableProps} onChange={value => updateList('availableProps', value)} multiline />
    </div></section>}

    {step === 2 && <section className="author-step"><div className="author-step-copy"><span>STEP 3 OF 3</span><h2>Keep it fun for the actual group.</h2><p>These answers are hard rules for the generated story, not suggestions.</p></div><div className="author-fields">
      <TextField label="Safety, privacy, timing, or venue rules" hint={'No darkness\nNo physical contact\nFinish within three hours'} value={listDrafts.safetyConstraints} onChange={value => updateList('safetyConstraints', value)} multiline />
      <TextField label="Accessibility needs (optional)" hint={'All essential play must work seated\nAvoid small printed text'} value={listDrafts.accessibilityNeeds} onChange={value => updateList('accessibilityNeeds', value)} multiline />
      <TextField label="Themes or content to avoid" hint={'No harm to children\nNo sexual violence\nNo real family secrets'} value={listDrafts.contentBoundaries} onChange={value => updateList('contentBoundaries', value)} multiline />
      {errors.length > 0 && <section className="author-errors"><b>Please finish the setting first</b><ul>{errors.map(error => <li key={error}>{error}</li>)}</ul></section>}
      {requestError && <section className="author-errors"><b>The draft failed</b><p>{requestError}</p></section>}
      <div className={`author-ai-status ${gateway.state}`}>{gateway.state === 'available' ? `AI ready${gateway.model ? ` · ${gateway.model}` : ''}` : gateway.state === 'checking' ? 'Checking AI…' : 'AI drafting is not configured on this deployment.'}</div>
    </div></section>}

    {step > 0 && <footer className="author-footer"><button className="author-secondary" disabled={drafting} onClick={() => { setErrors([]); setRequestError(''); setStep(current => current - 1) }}>Back</button>{step < steps.length - 1
      ? <button className="author-next" onClick={() => { setErrors([]); setStep(current => current + 1) }}>Continue →</button>
      : <button className="author-next" disabled={drafting || gateway.state !== 'available'} onClick={createDraft}>{drafting ? 'Writing your mystery…' : 'Draft my story with AI →'}</button>}</footer>}
  </main>
}
