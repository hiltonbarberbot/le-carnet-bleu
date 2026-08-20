import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { draftStorylineFromSetting, resumeStorylineCertification } from '../../game/ai/author'
import {
  continueSettingConversation,
  settingConversationOpening,
  type SettingConversationMessage,
} from '../../game/ai/setting/conversation'
import type { StorylineDefinition } from '../../game/definition/contract'
import { createSettingBrief } from '../../game/setting/brief'
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

function FailureReasons({ failure }: { failure: DraftFailure }) {
  if (!failure.blockingReasons?.length) return null
  return <ul className="author-error-reasons">
    {failure.blockingReasons.map(reason => <li key={`${reason.stage}:${reason.code}`}>
      {reason.message}
    </li>)}
  </ul>
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
  const [chatInput, setChatInput] = useState('')
  const [messages, setMessages] = useState<SettingConversationMessage[]>([settingConversationOpening])
  const [failure, setFailure] = useState<DraftFailure>()
  const [draftingStage, setDraftingStage] = useState<StudioStage>('idle')
  const [draft, setDraft] = useState<StorylineDefinition>()
  const [settingDraft, setSettingDraft] = useState<SettingBrief>()
  const [settingInput, setSettingInput] = useState<SettingBriefInput>({})
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

  async function sendSettingMessage(event?: FormEvent) {
    event?.preventDefault()
    const content = chatInput.trim()
    if (!content || drafting) return
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

    const nextMessages: SettingConversationMessage[] = [...messages, { role: 'user', content }]
    setMessages(nextMessages)
    setChatInput('')
    setFailure(undefined)
    setDraftingStage('setting')
    try {
      const turn = await continueSettingConversation(nextMessages, settingInput)
      setSettingInput(turn.draft)
      setMessages(current => [...current, { role: 'assistant', content: turn.message }])
      if (turn.ready) setSettingDraft(createSettingBrief(turn.draft))
    } catch (error) {
      setMessages(messages)
      setChatInput(content)
      setFailure(describeDraftFailure(error, 'setting'))
    } finally {
      setDraftingStage('idle')
    }
  }

  function resetConversation() {
    setDraft(undefined)
    setSettingDraft(undefined)
    setSettingInput({})
    setMessages([settingConversationOpening])
    setChatInput('')
    setFailure(undefined)
  }

  function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey) return
    event.preventDefault()
    void sendSettingMessage()
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
    <button className="author-back" onClick={resetConversation}>← Start over</button>
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
    <button className="author-back" onClick={() => { setSettingDraft(undefined); setFailure(undefined) }}>← Continue the conversation</button>
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
      {failure && <section className="author-errors compact" role="alert"><b>GENERATION FAILED</b><p>{failure.message}</p><FailureReasons failure={failure} /><p className="author-error-help">{failure.help}</p></section>}
      <button className="author-shape" disabled={drafting} onClick={() => void createDraft()}>{drafting ? 'Writing and validating the mystery…' : 'This is accurate — generate and validate →'}</button>
    </section>
  </main>

  return <main className="author-studio setting-conversation-studio">
    <button className="author-back" onClick={onExit}>← Back</button>
    <section className="setting-conversation-card">
      <header className="setting-conversation-head">
        <div><span className="kicker">SETTING AGENT</span><h1>Let’s talk about the place.</h1></div>
        <p>No questionnaire. Tell me what you know in your own words, and I’ll ask only for the details the mystery still needs.</p>
      </header>
      <div className="setting-messages" aria-live="polite">
        {messages.map((message, index) => <article key={`${message.role}-${index}`} className={`setting-message ${message.role}`}>
          <span>{message.role === 'assistant' ? 'SETTING AGENT' : 'YOU'}</span>
          <p>{message.content}</p>
        </article>)}
        {draftingStage === 'setting' && <article className="setting-message assistant thinking"><span>SETTING AGENT</span><p>Working out what I still need…</p></article>}
      </div>
      {failure && <section className="author-errors compact" role="alert" aria-live="assertive">
        <div className="author-error-heading"><b>{failure.title}</b><span>Setting conversation</span></div>
        <p>{failure.message}</p>
        <FailureReasons failure={failure} />
        <p className="author-error-help">{failure.help}</p>
        {failure.reference && <small>Reference {failure.reference}</small>}
      </section>}
      <form className="setting-composer" onSubmit={event => void sendSettingMessage(event)}>
        <label>
          <span className="sr-only">Reply to the setting agent</span>
          <textarea autoFocus rows={2} spellCheck value={chatInput} onKeyDown={submitOnEnter} onChange={event => { setChatInput(event.target.value); setFailure(undefined) }} placeholder="Reply naturally…" />
        </label>
        <button disabled={!chatInput.trim() || drafting || gateway.state !== 'available'} aria-label="Send message">{draftingStage === 'setting' ? '…' : '↑'}</button>
      </form>
      <div className="setting-composer-note"><span>Enter to send · Shift + Enter for a new line</span><span>Unknown details stay unknown until you answer.</span></div>
      {gateway.state !== 'available' && <p className={`author-ai-note ${gateway.state}`}>{gateway.state === 'checking' ? 'Checking AI…' : 'AI drafting is not configured on this deployment.'}</p>}
    </section>
  </main>
}
