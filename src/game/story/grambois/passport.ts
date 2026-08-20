import type { StorylineDefinition } from '../../definition/contract'
import {
  simulateStorylinePlaythrough,
  type StorylinePlayabilityReport,
} from '../../playability'
import {
  storylineReadinessPassed,
  validateStorylineReadinessVerdict,
  type StorylineReadinessVerdict,
} from '../review/readiness'
import { createGramboisCatalog } from './catalog'

const classicCatalogId = 'grambois-classics-v1'
const classicPublishedAt = '2026-08-18T00:00:00.000Z'
const classicCatalog = createGramboisCatalog()

export type BundledStorylinePassport = {
  schemaVersion: 1
  kind: 'bundled_classic'
  catalogId: typeof classicCatalogId
  definitionFingerprint: string
  publishedAt: string
  playthrough: StorylinePlayabilityReport
}

export type StorylinePlayabilityPassport = StorylineReadinessVerdict | BundledStorylinePassport

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function classicStoryline(fingerprint: string) {
  return classicCatalog.find(storyline => storyline.fingerprint === fingerprint)
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}

export function isBundledStorylinePassport(value: unknown): value is BundledStorylinePassport {
  return isRecord(value) && value.kind === 'bundled_classic'
}

export function createBundledStorylinePassport(
  storyline: StorylineDefinition,
): BundledStorylinePassport {
  if (!classicStoryline(storyline.fingerprint)) {
    throw new Error('Only a version-controlled classic storyline can receive a bundled passport.')
  }
  const playthrough = simulateStorylinePlaythrough(storyline)
  if (playthrough.verdict !== 'pass') {
    throw new Error(`Classic storyline ${storyline.story.title} does not complete its deterministic playthrough.`)
  }
  return {
    schemaVersion: 1,
    kind: 'bundled_classic',
    catalogId: classicCatalogId,
    definitionFingerprint: storyline.fingerprint,
    publishedAt: classicPublishedAt,
    playthrough,
  }
}

export function validateStorylinePlayabilityPassport(
  storyline: StorylineDefinition,
  value: unknown,
): string[] {
  if (!isBundledStorylinePassport(value)) {
    return validateStorylineReadinessVerdict(storyline, value)
  }

  const errors: string[] = []
  if (value.schemaVersion !== 1) errors.push('bundled passport has an unsupported schema version')
  if (value.catalogId !== classicCatalogId) errors.push('bundled passport has an unknown catalog')
  if (value.definitionFingerprint !== storyline.fingerprint) errors.push('bundled passport fingerprint does not match the storyline')
  if (value.publishedAt !== classicPublishedAt) errors.push('bundled passport has an unknown publication')
  if (!classicStoryline(storyline.fingerprint)) errors.push('bundled passport does not identify a version-controlled classic storyline')

  const expectedPlaythrough = simulateStorylinePlaythrough(storyline)
  if (expectedPlaythrough.verdict !== 'pass'
    || canonicalJson(value.playthrough) !== canonicalJson(expectedPlaythrough)) {
    errors.push('bundled passport does not contain the canonical successful playthrough')
  }
  return errors
}

export function storylinePlayabilityPassportPassed(
  storyline: StorylineDefinition,
  passport: StorylinePlayabilityPassport,
) {
  if (validateStorylinePlayabilityPassport(storyline, passport).length) return false
  return isBundledStorylinePassport(passport)
    ? passport.playthrough.verdict === 'pass'
    : storylineReadinessPassed(passport)
}

export function storylinePassportIssuedAt(passport: StorylinePlayabilityPassport) {
  return isBundledStorylinePassport(passport) ? passport.publishedAt : passport.evaluatedAt
}
