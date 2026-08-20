import { useEffect, useRef, useState } from 'react'
import { draftStorylineFromSetting, resumeStorylineCertification } from '../../game/ai/author'
import { createSettingFromSeed } from '../../game/ai/setting'
import type { StorylineDefinition } from '../../game/definition/contract'
import { createSettingBrief, settingQuestions } from '../../game/setting/brief'
import type { SettingBrief, SettingBriefInput } from '../../game/setting/contract'
import { describeDraftFailure, type DraftFailure, type DraftingStage } from './failure'
import './studio.css'
import './confirmation.css'

type AuthoringStudioProps = {
  gateway: { state: 'checking' | 'available' | 'unavailable'; model?: string }
  onExit: () => void
  onSave: (storyline: StorylineDefinition) => Promise<void>
  saveError?: string
}

type StudioStage = 'idle' | DraftingStage

const certificationJobKey = 'mystery.story-certification.v1'

const textSettingFields = new Set<keyof SettingBriefInput>(['venueName', 'location', 'era', 'tone'])

function settingFieldText(value: SettingBriefInput[keyof SettingBriefInput]) {
  if (typeof value === 'string') return value
  return (value ?? []).map(item => typeof item === 'string' ? item : item.label).join('\n')
}

function settingFieldValue(id: keyof SettingBriefInput, value: string) {
  return textSettingFields.has(id)
    ? value
    : value.split(/\n|,/).map(item => item.trim()).filter(Boolean)
}

type CertificationFollowupEffects = {
  resume?: typeof resumeStorylineCertification
  clearPersistedJob: () => void
  onReady: (storyline: StorylineDefinition) => void
  onFailure: (error: unknown) => void
  onSettled: () => void
}

export async function followCertificationJob(
  jobId: string,
  signal: AbortSignal,
  effects: CertificationFollowupEffects,
) {
  try {
    const storyline = await (effects.resume ?? resumeStorylineCertification)(jobId, { signal })
    if (signal.aborted) return
    effects.onReady(storyline)
    effects.clearPersistedJob()
  } catch (error) {
    if (signal.aborted) return
    effects.clearPersistedJob()
    effects.onFailure(error)
  } finally {
    if (!signal.aborted) effects.onSettled()
  }
}

export function AuthoringStudio({ gateway, onExit, onSave, saveError }: AuthoringStudioProps) {
  const [prompt, setPrompt] = useState('')
  const [failure, setFailure] = useState<DraftFailure>()
  const [draftingStage, setDraftingStage] = useState<StudioStage>('idle')
  const [draft, setDraft] = useState<StorylineDefinition>()
  const [settingDraft, setSettingDraft] = useState<SettingBrief>()
  const [settingInput, setSettingInput] = useState<SettingBriefInput>()
  const [saving, setSaving] = useState(false)
  const certificationAbort = useRef<AbortController | undefined>(undefined)

  const drafting = draftingStage !== 'idle'

  function followCertification(jobId: string, signal: AbortSignal) {
    setDraftingStage('story')
    setFailure(undefined)
    return followCertificationJob(jobId, signal, {
      clearPersistedJob: () => localStorage.removeItem(certificationJobKey),
      onReady: setDraft,
      onFailure: error => setFailure(describeDraftFailure(error, 'story')),
      onSettled: () => setDraftingStage('idle'),
    })
  }

  useEffect(() => {
    const controller = new AbortController()
    certificationAbort.current = controller
    const jobId = localStorage.getItem(certificationJobKey)
    if (jobId) void followCertification(jobId, controller.signal)
    return () => {
      controller.abort()
      if (certificationAbort.current === controller) certificationAbort.current = undefined
    }
  }, [])

  async function shapeSetting() {
    if (!prompt.trim()) {
      setFailure({
        title: 'Give us a seed first',
        message: 'One line about the place, mood, or premise is enough.',
        help: 'Your notes can be rough. We’ll shape the rest.',
        stage: 'setting',
        retryable: false,
      })
      return
    }
    if (gateway.state !== 'available') {
      setFailure({
        title: 'Drafting isn’t connected',
        message: 'AI drafting is not available on this deployment.',
        help: 'The deployment owner needs to connect the AI Gateway.',
        stage: 'setting',
        retryable: false,
      })
      return
    }

    setFailure(undefined)
    setDraftingStage('setting')
    try {
      setSettingInput(await createSettingFromSeed(prompt.trim()))
    } catch (error) {
      setFailure(describeDraftFailure(error, 'setting'))
    } finally {
      setDraftingStage('idle')
    }
  }

  async function createDraft() {
    if (!settingDraft) return
    const controller = certificationAbort.current ?? new AbortController()
    certificationAbort.current = controller
    setFailure(undefined)
    setDraftingStage('story')
    try {
      const storyline = await draftStorylineFromSetting(settingDraft, jobId => {
        localStorage.setItem(certificationJobKey, jobId)
      }, { signal: controller.signal })
      if (controller.signal.aborted) return
      setDraft(storyline)
      localStorage.removeItem(certificationJobKey)
    } catch (error) {
      if (controller.signal.aborted) return
      localStorage.removeItem(certificationJobKey)
      setFailure(describeDraftFailure(error, 'story'))
    } finally {
      if (!controller.signal.aborted) setDraftingStage('idle')
    }
  }

  function validateSetting() {
    if (!settingInput) return
    try {
      setSettingDraft(createSettingBrief(settingInput))
      setFailure(undefined)
    } catch (error) {
      setFailure({
        title: 'Setting incomplete',
        message: error instanceof Error ? error.message : 'The setting facts are incomplete.',
        help: 'Fill every required field, including at least two playable areas, then validate again.',
        stage: 'setting',
        retryable: false,
      })
    }
  }

  async function saveDraft() {
    if (!draft || saving) return
    setSaving(true)
    try {
      await onSave(draft)
    } finally {
      setSaving(false)
    }
  }

  if (draft) return <main className="author-studio draft-ready">
    <button className="author-back" onClick={() => { setDraft(undefined); setSettingDraft(undefined); setSettingInput(undefined) }}>← Start over</button>
    <section className="draft-card">
      <span className="kicker">SYSTEM VERIFIED · READY TO PLAY</span>
      <h1>{draft.title}</h1>
      <p>{draft.story.premise}</p>
      <div className="draft-facts"><span><b>{draft.story.characters.length}</b> suspects</span><span><b>{draft.story.openingSteps.length}</b> opening steps</span><span><b>{draft.story.solutionSteps.length}</b> solution steps</span></div>
      {saveError && <section className="author-errors compact" role="alert"><b>SAVE FAILED</b><p>{saveError}</p></section>}
      <div className="draft-actions"><button className="use-draft" disabled={saving} onClick={() => void saveDraft()}>{saving ? 'Opening certified library…' : 'Use this certified storyline →'}</button></div>
    </section>
  </main>

  if (draftingStage === 'story') return <main className="author-studio draft-ready">
    <button className="author-back" onClick={onExit}>← Keep running in the background</button>
    <section className="draft-card setting-confirmation" aria-live="polite">
      <span className="kicker">DURABLE CERTIFICATION IN PROGRESS</span>
      <h1>Writing, testing, and rehearsing your mystery.</h1>
      <p>You can close this page and come back. The system is checking the complete runtime, reviewing the logic independently, and rehearsing every private role before it allows play.</p>
      <button className="author-shape" disabled>Certification is running…</button>
    </section>
  </main>

  if (settingDraft) return <main className="author-studio draft-ready">
    <button className="author-back" onClick={() => { setSettingDraft(undefined); setFailure(undefined) }}>← Edit setting facts</button>
    <section className="draft-card setting-confirmation">
      <span className="kicker">REAL-WORLD SAFETY CHECK</span>
      <h1>Confirm the setting first.</h1>
      <p>The system can verify story logic, but only you can confirm that this describes the real place and its boundaries. Generation then runs independent player and host rehearsals, so it may take a few minutes.</p>
      <dl className="setting-facts">
        <div><dt>Venue</dt><dd>{settingDraft.venueName} · {settingDraft.location}</dd></div>
        <div><dt>Era and tone</dt><dd>{settingDraft.era} · {settingDraft.tone}</dd></div>
        <div><dt>Playable spaces</dt><dd>{settingDraft.playableSpaces.map(item => item.label).join(', ')}</dd></div>
        <div><dt>Safe routes</dt><dd>{settingDraft.routes.map(item => item.label).join(', ')}</dd></div>
        <div><dt>Props</dt><dd>{settingDraft.availableProps.map(item => item.label).join(', ') || 'No physical props assumed'}</dd></div>
        <div><dt>Safety</dt><dd>{settingDraft.safetyConstraints.map(item => item.label).join(', ')}</dd></div>
        <div><dt>Accessibility</dt><dd>{settingDraft.accessibilityNeeds.map(item => item.label).join(', ') || 'No specific needs recorded'}</dd></div>
        <div><dt>Content boundaries</dt><dd>{settingDraft.contentBoundaries.map(item => item.label).join(', ')}</dd></div>
      </dl>
      {failure && <section className="author-errors compact" role="alert"><b>GENERATION FAILED</b><p>{failure.message}</p><p className="author-error-help">{failure.help}</p></section>}
      <button className="author-shape" disabled={drafting} onClick={() => void createDraft()}>{drafting ? 'Writing and validating the mystery…' : 'This is accurate — generate and validate →'}</button>
    </section>
  </main>

  if (settingInput) return <main className="author-studio setting-questionnaire">
    <button className="author-back" onClick={() => { setSettingInput(undefined); setFailure(undefined) }}>← Change the seed</button>
    <section className="setting-question-card">
      <span className="kicker">HOST-VERIFIED SETTING</span>
      <h1>Tell us what’s actually there.</h1>
      <p>We extracted only facts in your seed. Fill the gaps below; one item per line works well. Nothing here will be invented by the system.</p>
      <div className="setting-question-grid">{settingQuestions.map(question => {
        const value = settingFieldText(settingInput[question.id])
        const multiline = !textSettingFields.has(question.id)
        return <label key={question.id} className={multiline ? 'wide' : undefined}>
          <span>{question.prompt}{question.required && <b> REQUIRED</b>}</span>
          {multiline
            ? <textarea rows={3} value={value} onChange={event => setSettingInput(current => ({ ...current, [question.id]: settingFieldValue(question.id, event.target.value) }))} placeholder={question.required ? 'One item per line' : 'Optional — leave blank if none'} />
            : <input value={value} onChange={event => setSettingInput(current => ({ ...current, [question.id]: settingFieldValue(question.id, event.target.value) }))} />}
          <small>{question.why}</small>
        </label>
      })}</div>
      {failure && <section className="author-errors compact" role="alert"><b>SETTING INCOMPLETE</b><p>{failure.message}</p></section>}
      <button className="author-shape" onClick={validateSetting}>Validate these setting facts →</button>
    </section>
  </main>

  const buttonLabel = draftingStage === 'setting'
    ? 'Figuring out the setting…'
    : failure?.retryable ? 'Try again →' : 'Shape the setting →'

  return <main className="author-studio author-seed-studio">
    <button className="author-back" onClick={onExit}>← Back</button>
    <section className="author-seed-card">
      <span className="kicker">CREATE WITH AI</span>
      <h1>Start with what you know.</h1>
      <p>Describe the real place, mood, and premise. We’ll extract only the facts you supplied, then ask you to fill the venue and safety gaps before any story is written.</p>
      <label className="author-prompt">
        <span className="sr-only">Your mystery seed</span>
        <textarea autoFocus spellCheck value={prompt} onChange={event => { setPrompt(event.target.value); setFailure(undefined) }} placeholder="A house in Grambois. 1960s spy mystery, elegant and funny." />
      </label>
      <div className="author-prompt-meta"><span>Messy is fine. Unknown details stay blank.</span><span>{prompt.trim().length ? `${prompt.trim().length} characters` : 'Start anywhere'}</span></div>
      {failure && <section className="author-errors compact" role="alert" aria-live="assertive">
        <div className="author-error-heading"><b>{failure.title}</b><span>{failure.stage === 'setting' ? 'Setting setup' : 'Story writing'}</span></div>
        <p>{failure.message}</p>
        <p className="author-error-help">{failure.help}</p>
        {failure.reference && <small>Reference {failure.reference}</small>}
      </section>}
      <button className="author-shape" disabled={drafting || gateway.state !== 'available'} onClick={() => void shapeSetting()}>{buttonLabel}</button>
      {gateway.state !== 'available' && <p className={`author-ai-note ${gateway.state}`}>{gateway.state === 'checking' ? 'Checking AI…' : 'AI drafting is not configured on this deployment.'}</p>}
    </section>
  </main>
}
