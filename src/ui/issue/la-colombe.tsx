'use client'

import { useLayoutEffect, useRef } from 'react'
import characters from './characters.json'
import './interface.css'
import { claimDossier, readIssueLobby } from './api'
import { interfaceMarkup } from './markup'
import type { IssuedDossier } from '../../game/issue/claim'

type DesignerCharacter = {
  code: string
  name: string
  age: number
  role: string
  photo: string
  desc: string
  secrets: string[]
  rels: [string, string][]
  objectives: [string, string][]
  line: string
}

const cast = characters as DesignerCharacter[]
const plates = cast.map(character => `/la-colombe/${character.photo}`)
const identityKey = 'mystery.issue.identities.v1'

function readIdentities() {
  try { return JSON.parse(localStorage.getItem(identityKey) ?? '{}') as Record<string, string> } catch { return {} }
}

function saveIdentity(issueCode: string, participantId: string) {
  localStorage.setItem(identityKey, JSON.stringify({ ...readIdentities(), [issueCode]: participantId }))
}

function forgetIdentity(issueCode: string) {
  const identities = readIdentities()
  delete identities[issueCode]
  localStorage.setItem(identityKey, JSON.stringify(identities))
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[character]!)
}

function requireElement<T extends Element>(root: ParentNode, selector: string) {
  const element = root.querySelector<T>(selector)
  if (!element) throw new Error(`Designer interface is missing ${selector}`)
  return element
}

export function LaColombeIssue() {
  const mountRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const interfaceRoot: HTMLDivElement = mount

    const previousTitle = document.title
    document.title = 'Dossier issue'
    document.body.classList.remove('state-file', 'state-spin', 'story-open', 'host')
    document.body.classList.add('la-colombe-interface', 'state-main')

    const params = new URLSearchParams(window.location.search)
    const requestedIssueCode = params.get('game')?.trim() ?? ''
    if (params.has('reset') && requestedIssueCode) forgetIdentity(requestedIssueCode)
    if (params.has('host')) document.body.classList.add('host')

    const plate = requireElement<HTMLDivElement>(interfaceRoot, '#plate')
    const strip = document.createElement('div')
    strip.className = 'strip'
    strip.innerHTML = plates.concat(plates[0]).map((src, index) => (
      `<div class="frame"><img src="${src}" alt="" decoding="async" fetchpriority="${index ? 'low' : 'high'}"></div>`
    )).join('')
    plate.appendChild(strip)

    const frameCount = plates.length
    const styles = getComputedStyle(document.documentElement)
    const gap = Number.parseFloat(styles.getPropertyValue('--gap')) || 9
    const pull = Number.parseFloat(styles.getPropertyValue('--pull')) || 460
    const dwell = Number.parseFloat(styles.getPropertyValue('--dwell')) || 2900
    const still = matchMedia('(prefers-reduced-motion:reduce)')

    let pitch = 0
    let cursor = 0
    let idle: number | undefined
    let smear: number | undefined
    let spinning = false
    let disposed = false

    function seat(frame: number, milliseconds: number, easing?: string) {
      cursor = frame
      const weaveX = ((((frame * 37) + 11) % 23) / 22 - .5) * 1.1
      const weaveY = ((((frame * 17) + 7) % 19) / 18 - .5) * 1.1
      strip.style.transition = milliseconds ? `transform ${milliseconds}ms ${easing || 'linear'}` : 'none'
      strip.style.transform = `translate3d(${weaveX}px, ${-(frame * pitch) + weaveY}px, 0)`
      if (!milliseconds) void strip.offsetHeight
    }

    function measure() {
      const height = plate.clientHeight
      if (!height) return
      plate.style.setProperty('--frameH', `${height}px`)
      pitch = height + gap
      seat(cursor, 0)
    }

    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(plate)

    function step(milliseconds: number, easing: string, className: string | null, after?: () => void) {
      if (smear !== undefined) window.clearTimeout(smear)
      const destination = cursor + 1
      const duration = still.matches ? 0 : milliseconds
      if (className) plate.classList.add(className)
      seat(destination, duration, easing)
      smear = window.setTimeout(() => {
        if (disposed) return
        if (className) plate.classList.remove(className)
        if (destination === frameCount) seat(0, 0)
        after?.()
      }, duration + 8)
    }

    function idleReel() {
      if (idle !== undefined) window.clearInterval(idle)
      if (still.matches || spinning) return
      idle = window.setInterval(() => step(pull, 'cubic-bezier(.26,.86,.28,1.03)', 'is-pulling'), dwell)
    }

    function stopIdle() {
      if (idle !== undefined) window.clearInterval(idle)
      idle = undefined
    }

    function spinTo(target: number, done: () => void) {
      stopIdle()
      spinning = true
      document.body.classList.add('state-spin')

      if (still.matches) {
        seat(target, 0)
        spinning = false
        document.body.classList.remove('state-spin')
        done()
        return
      }

      let steps = 22
      while ((cursor + steps) % frameCount !== target % frameCount) steps++
      plate.classList.add('is-spinning')

      let index = 0
      function next() {
        if (disposed) return
        if (index >= steps) {
          plate.classList.remove('is-spinning')
          seat(target, 0)
          spinning = false
          document.body.classList.remove('state-spin')
          done()
          return
        }

        const progress = steps > 1 ? index / (steps - 1) : 1
        const milliseconds = 84 + (470 - 84) * Math.pow(progress, 3.2)
        const isLast = index === steps - 1
        index++
        if (isLast) {
          plate.classList.remove('is-spinning')
          step(milliseconds, 'cubic-bezier(.26,.86,.28,1.03)', 'is-pulling', next)
        } else {
          step(milliseconds, 'linear', null, next)
        }
      }
      next()
    }

    let jitterSeed = 19620815
    const nextJitter = () => (
      jitterSeed = (jitterSeed * 1103515245 + 12345) & 0x7fffffff
    ) / 0x7fffffff

    function jitter(root: ParentNode) {
      function strike(word: string) {
        const wrapper = document.createElement('span')
        wrapper.className = 'w'
        for (const character of word) {
          const glyph = document.createElement('span')
          glyph.className = 'g'
          glyph.textContent = character
          const y = (nextJitter() - .5) * 1.05
          const x = (nextJitter() - .5) * .45
          const rotation = (nextJitter() - .5) * 1.6
          const ink = .8 + nextJitter() * .2
          glyph.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) rotate(${rotation.toFixed(2)}deg)`
          glyph.style.opacity = ink.toFixed(2)
          if (ink > .97) glyph.style.textShadow = '0 0 .9px currentColor'
          wrapper.appendChild(glyph)
        }
        return wrapper
      }

      function walk(node: ParentNode) {
        for (const child of [...node.childNodes]) {
          if (child.nodeType === Node.TEXT_NODE) {
            const text = (child.nodeValue ?? '').replace(/\s+/g, ' ')
            if (!/\S/.test(text)) {
              child.nodeValue = text
              continue
            }
            const fragment = document.createDocumentFragment()
            for (const token of text.split(' ')) {
              if (token === '') {
                fragment.appendChild(document.createTextNode(' '))
                continue
              }
              fragment.appendChild(strike(token))
              fragment.appendChild(document.createTextNode(' '))
            }
            if (!text.endsWith(' ')) fragment.lastChild?.remove()
            child.parentNode?.replaceChild(fragment, child)
          } else if (child instanceof Element && !child.classList.contains('w')) {
            walk(child)
          }
        }
      }

      root.querySelectorAll('.tw').forEach(element => walk(element))
    }

    function visualIndex(issued: IssuedDossier) {
      const matchingPortrait = cast.findIndex(character => character.name === issued.packet.yourDossier.name)
      return matchingPortrait >= 0 ? matchingPortrait : issued.roleIndex % frameCount
    }

    function renderFile(issued: IssuedDossier) {
      stopIdle()
      const role = issued.packet.yourDossier
      const names = new Map(issued.packet.publicContext.cast.map(character => [character.id, character.name]))
      requireElement(interfaceRoot, '#myName').textContent = role.name
      requireElement(interfaceRoot, '#myRole').textContent = role.title
      requireElement(interfaceRoot, '#issuedTo').textContent = `${issued.participantName} · ID ${issued.participantId}`
      requireElement(interfaceRoot, '#kind').textContent = 'PERSONAL FILE'
      document.title = `${role.name} — Personal File`

      const listItem = (content: string, number: string) => `<li><span class="n">${number}</span>${content}</li>`
      const dossier = requireElement<HTMLElement>(interfaceRoot, '#dossier')
      dossier.innerHTML = `
        <h2>SECTION I — WHO YOU ARE</h2>
        <p class="desc tw">${escapeHtml(role.privateIdentity || role.publicFace)}</p>

        <section>
          <h3>SECTION II — SECRETS AND LIES</h3>
          <ul class="tw">${[role.privateSecret, ...role.secrets.map(secret => secret.text)].filter((secret, index, all) => secret && all.indexOf(secret) === index).map((secret, index) => listItem(escapeHtml(secret), String(index + 1).padStart(2, '0'))).join('')}</ul>
        </section>

        <section>
          <h3>SECTION III — THE OTHERS AT THE TABLE</h3>
          <ul class="rel tw">${role.relationships.map(relationship => `<li><span class="who">${escapeHtml(names.get(relationship.roleId) ?? relationship.roleId)}</span><span class="what">${escapeHtml(relationship.text)}</span></li>`).join('')}</ul>
        </section>

        <section>
          <h3>SECTION IV — WHAT YOU WANT TONIGHT</h3>
          <ol class="tw">${role.objectives.map((objective, index) => listItem(`<span class="tagi">${escapeHtml(objective.title)}</span>${escapeHtml(objective.text)} <b>${objective.points} PT</b>`, String(index + 1).padStart(2, '0'))).join('')}</ol>
        </section>`

      const openingLine = requireElement<HTMLElement>(interfaceRoot, '#myline')
      openingLine.innerHTML = `<span class="lab">YOUR OPENING CUE</span><span class="say tw">${escapeHtml(issued.packet.publicContext.opening.map(cue => cue.text).join(' ') || role.invitationPromise)}</span>`
      jitter(dossier)
      jitter(openingLine)
      document.body.classList.add('state-file')
      plate.setAttribute('aria-label', `Identification photograph: ${role.name}`)
      requireElement(interfaceRoot, '#hostLab').textContent = `CENTRAL ISSUE · ${issued.participantId} · ROLE ${role.id}`
    }

    let currentDossier: IssuedDossier | undefined
    function issue(issued: IssuedDossier, replay = false) {
      currentDossier = issued
      const index = visualIndex(issued)
      if (still.matches && !replay) {
        seat(index, 0)
        renderFile(issued)
        return
      }
      spinTo(index, () => renderFile(issued))
    }

    const issueForm = requireElement<HTMLFormElement>(interfaceRoot, '#issue')
    const issueButton = requireElement<HTMLButtonElement>(interfaceRoot, '#issueBtn')
    const issueError = requireElement<HTMLElement>(interfaceRoot, '#issueError')
    const gameCodeField = requireElement<HTMLElement>(interfaceRoot, '#gameCodeField')
    const gameCodeInput = requireElement<HTMLInputElement>(interfaceRoot, '#gameCode')
    const participantInput = requireElement<HTMLInputElement>(interfaceRoot, '#participantId')
    const startOverButton = requireElement<HTMLButtonElement>(interfaceRoot, '#startOver')
    const storyTab = requireElement<HTMLButtonElement>(interfaceRoot, '#storyTab')
    const storyOperation = requireElement<HTMLElement>(interfaceRoot, '#storyOp')
    const rerunButton = requireElement<HTMLButtonElement>(interfaceRoot, '#rerun')

    if (requestedIssueCode) {
      gameCodeInput.value = requestedIssueCode
      gameCodeField.hidden = true
      participantInput.value = readIdentities()[requestedIssueCode] ?? ''
    }

    const handleIssue = async (event: SubmitEvent) => {
      event.preventDefault()
      const code = gameCodeInput.value.trim()
      const participantId = participantInput.value.trim()
      issueButton.disabled = true
      issueError.textContent = ''
      try {
        const claimed = await claimDossier(code, participantId)
        if (disposed) return
        saveIdentity(code, participantId)
        issue(claimed)
      } catch (error) {
        if (!disposed) issueError.textContent = error instanceof Error ? error.message : String(error)
      } finally {
        if (!disposed) issueButton.disabled = false
      }
    }
    const handleStartOver = () => {
      const code = gameCodeInput.value.trim()
      if (code) forgetIdentity(code)
      window.location.href = code ? `${window.location.pathname}?game=${encodeURIComponent(code)}` : window.location.pathname
    }
    const handleStoryFold = () => {
      const open = document.body.classList.toggle('story-open')
      storyTab.setAttribute('aria-expanded', open ? 'true' : 'false')
      storyOperation.innerHTML = open ? '− &nbsp;FOLD AWAY' : '+ &nbsp;UNFOLD'
    }
    const handleRerun = () => {
      if (!currentDossier) return
      document.body.classList.remove('state-file', 'story-open')
      storyTab.setAttribute('aria-expanded', 'false')
      storyOperation.innerHTML = '+ &nbsp;UNFOLD'
      window.setTimeout(() => issue(currentDossier!, true), 260)
    }

    issueForm.addEventListener('submit', handleIssue)
    startOverButton.addEventListener('click', handleStartOver)
    storyTab.addEventListener('click', handleStoryFold)
    rerunButton.addEventListener('click', handleRerun)

    measure()
    jitter(interfaceRoot)
    idleReel()
    if (requestedIssueCode) {
      void readIssueLobby(requestedIssueCode).then(lobby => {
        if (disposed) return
        document.title = `${lobby.title} — Dossier issue`
        requireElement(interfaceRoot, '#kind').textContent = lobby.title
        requireElement(interfaceRoot, '#publicPremise').textContent = lobby.premise
        requireElement(interfaceRoot, '#publicMeta').textContent = `${lobby.totalDossiers} PLAYERS · ${lobby.venue} · ${lobby.era}`
        requireElement(interfaceRoot, '#withheld').innerHTML = `${lobby.totalDossiers} PARTIES PRESENT<br>${lobby.availableDossiers} FILES AVAILABLE<br>NAMES WITHHELD UNTIL ISSUE`
        requireElement(interfaceRoot, '#synopsisText').textContent = lobby.premise
        if (participantInput.value) issueForm.requestSubmit()
      }).catch(error => {
        if (!disposed) {
          gameCodeField.hidden = false
          issueError.textContent = error instanceof Error ? error.message : String(error)
        }
      })
    }

    return () => {
      disposed = true
      stopIdle()
      if (smear !== undefined) window.clearTimeout(smear)
      resizeObserver.disconnect()
      issueForm.removeEventListener('submit', handleIssue)
      startOverButton.removeEventListener('click', handleStartOver)
      storyTab.removeEventListener('click', handleStoryFold)
      rerunButton.removeEventListener('click', handleRerun)
      strip.remove()
      document.body.classList.remove('la-colombe-interface', 'state-main', 'state-file', 'state-spin', 'story-open', 'host')
      document.title = previousTitle
    }
  }, [])

  return <div className="la-colombe-mount" ref={mountRef} dangerouslySetInnerHTML={{ __html: interfaceMarkup }} />
}
