'use client'

import { useLayoutEffect, useRef } from 'react'
import characters from './characters.json'
import './interface.css'
import { interfaceMarkup } from './markup'

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
const assignmentKey = 'lacolombe.assignment'

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
    document.title = 'La Colombe'
    document.body.classList.remove('state-file', 'state-spin', 'story-open', 'host')
    document.body.classList.add('la-colombe-interface', 'state-main')

    const params = new URLSearchParams(window.location.search)
    if (params.has('reset')) localStorage.removeItem(assignmentKey)
    if (params.has('host') || params.has('as')) document.body.classList.add('host')

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
      const weaveX = (Math.random() - .5) * 1.1
      const weaveY = (Math.random() - .5) * 1.1
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
    const randomJitter = () => (
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
          const y = (randomJitter() - .5) * 1.05
          const x = (randomJitter() - .5) * .45
          const rotation = (randomJitter() - .5) * 1.6
          const ink = .8 + randomJitter() * .2
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

    function assign() {
      const forced = params.get('as')
      if (forced !== null && Number(forced) >= 0 && Number(forced) < frameCount) return Number(forced)
      return Math.floor(Math.random() * frameCount)
    }

    function renderFile(index: number) {
      stopIdle()
      const character = cast[index]
      requireElement(interfaceRoot, '#myName').textContent = `${character.name}, ${character.age}`
      requireElement(interfaceRoot, '#myRole').textContent = character.role
      requireElement(interfaceRoot, '#issuedTo').textContent = character.name
      requireElement(interfaceRoot, '#kind').textContent = 'PERSONAL FILE'
      document.title = 'La Colombe — Personal File'

      const listItem = (content: string, number: string) => `<li><span class="n">${number}</span>${content}</li>`
      const dossier = requireElement<HTMLElement>(interfaceRoot, '#dossier')
      dossier.innerHTML = `
        <h2>SECTION I — WHO YOU ARE</h2>
        <p class="desc tw">${character.desc}</p>

        <section>
          <h3>SECTION II — SECRETS AND LIES</h3>
          <ul class="tw">${character.secrets.map((secret, secretIndex) => listItem(secret, String(secretIndex + 1).padStart(2, '0'))).join('')}</ul>
        </section>

        <section>
          <h3>SECTION III — THE OTHERS AT THE TABLE</h3>
          <ul class="rel tw">${character.rels.map(([who, text]) => `<li><span class="who">${who}</span><span class="what">${text}</span></li>`).join('')}</ul>
        </section>

        <section>
          <h3>SECTION IV — WHAT YOU WANT TONIGHT</h3>
          <ol class="tw">${character.objectives.map(([tag, text], objectiveIndex) => listItem(`${tag ? `<span class="tagi">${tag}</span>` : ''}${text}`, String(objectiveIndex + 1).padStart(2, '0'))).join('')}</ol>
        </section>`

      const openingLine = requireElement<HTMLElement>(interfaceRoot, '#myline')
      openingLine.innerHTML = `<span class="lab">YOUR OPENING LINE</span><span class="say tw">&ldquo;${character.line}&rdquo;</span>`
      jitter(dossier)
      jitter(openingLine)
      document.body.classList.add('state-file')
      plate.setAttribute('aria-label', `Identification photograph: ${character.name}`)
      requireElement(interfaceRoot, '#hostLab').textContent = `HOST CONTROLS — NOT FOR PLAYERS  ·  PART ${index + 1} OF ${frameCount}  (?as=${index})`
    }

    function issue(index: number, replay = false) {
      localStorage.setItem(assignmentKey, String(index))
      if (still.matches && !replay) {
        seat(index, 0)
        renderFile(index)
        return
      }
      spinTo(index, () => renderFile(index))
    }

    const issueButton = requireElement<HTMLButtonElement>(interfaceRoot, '#issueBtn')
    const startOverButton = requireElement<HTMLButtonElement>(interfaceRoot, '#startOver')
    const storyTab = requireElement<HTMLButtonElement>(interfaceRoot, '#storyTab')
    const storyOperation = requireElement<HTMLElement>(interfaceRoot, '#storyOp')
    const rerunButton = requireElement<HTMLButtonElement>(interfaceRoot, '#rerun')

    const handleIssue = () => issue(assign())
    const handleStartOver = () => {
      localStorage.removeItem(assignmentKey)
      window.location.href = `${window.location.pathname}${params.has('host') ? '?host' : ''}`
    }
    const handleStoryFold = () => {
      const open = document.body.classList.toggle('story-open')
      storyTab.setAttribute('aria-expanded', open ? 'true' : 'false')
      storyOperation.innerHTML = open ? '− &nbsp;FOLD AWAY' : '+ &nbsp;UNFOLD'
    }
    const handleRerun = () => {
      const index = Number(localStorage.getItem(assignmentKey))
      document.body.classList.remove('state-file', 'story-open')
      storyTab.setAttribute('aria-expanded', 'false')
      storyOperation.innerHTML = '+ &nbsp;UNFOLD'
      window.setTimeout(() => spinTo(index, () => document.body.classList.add('state-file')), 260)
    }

    issueButton.addEventListener('click', handleIssue)
    startOverButton.addEventListener('click', handleStartOver)
    storyTab.addEventListener('click', handleStoryFold)
    rerunButton.addEventListener('click', handleRerun)

    measure()
    jitter(interfaceRoot)
    const held = localStorage.getItem(assignmentKey)
    if (held !== null && Number(held) >= 0 && Number(held) < frameCount) {
      seat(Number(held), 0)
      renderFile(Number(held))
    } else {
      idleReel()
    }

    return () => {
      disposed = true
      stopIdle()
      if (smear !== undefined) window.clearTimeout(smear)
      resizeObserver.disconnect()
      issueButton.removeEventListener('click', handleIssue)
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
