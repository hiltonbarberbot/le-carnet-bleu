import type { SettingReference } from '../../definition/contract.js'
import type {
  CharacterObjective,
  CharacterRelationship,
  CharacterSecret,
  EveningStage,
  EvidenceProvenance,
  OpeningExecution,
  OpeningStep,
  PublicEvidence,
  SolutionStep,
} from '../../types.js'
import { defineSchema, isRecord, requireOneOf, requireRecord, requireStringList, requireText } from './validator.js'

const settingResourceKinds = [
  'playableSpaces',
  'routes',
  'usableFeatures',
  'availableProps',
  'safetyConstraints',
  'accessibilityNeeds',
  'contentBoundaries',
] as const satisfies readonly SettingReference['kind'][]

function validateSettingReference(value: unknown, path: string): string[] {
  const errors = requireRecord(value, path)
  if (!isRecord(value)) return errors
  return [
    ...errors,
    ...requireOneOf(value.kind, settingResourceKinds, `${path}.kind`),
    ...requireText(value.id, `${path}.id`),
  ]
}

/** 1/8: a scored, phase-aware player goal. */
export const objectiveSchema = defineSchema<CharacterObjective>('character objective', (value, path) => {
  const errors = requireRecord(value, path)
  if (!isRecord(value)) return errors
  return [
    ...errors,
    ...requireText(value.id, `${path}.id`),
    ...requireText(value.title, `${path}.title`),
    ...requireText(value.text, `${path}.text`),
    ...requireOneOf(value.phase, ['investigation', 'any'], `${path}.phase`),
    ...Number.isInteger(value.points) && [1, 2, 3].includes(value.points as number)
      ? []
      : [`${path}.points must be 1, 2, or 3`],
  ]
})

/** 2/8: a directed social link to another role. */
export const relationshipSchema = defineSchema<CharacterRelationship>('character relationship', (value, path) => {
  const errors = requireRecord(value, path)
  if (!isRecord(value)) return errors
  return [
    ...errors,
    ...requireText(value.roleId, `${path}.roleId`),
    ...requireText(value.text, `${path}.text`),
  ]
})

/** 3/8: the independently checkable origin of a fact. */
export const provenanceSchema = defineSchema<EvidenceProvenance>('evidence provenance', (value, path) => {
  const errors = requireRecord(value, path)
  if (!isRecord(value)) return errors
  errors.push(...requireText(value.independenceGroup, `${path}.independenceGroup`))
  errors.push(...requireRecord(value.source, `${path}.source`))
  if (!isRecord(value.source)) return errors

  errors.push(...requireOneOf(value.source.kind, ['role', 'public', 'setting'], `${path}.source.kind`))
  if (value.source.kind === 'role') errors.push(...requireText(value.source.roleId, `${path}.source.roleId`))
  if (value.source.kind === 'public') errors.push(...requireText(value.source.openingStepId, `${path}.source.openingStepId`))
  if (value.source.kind === 'setting') errors.push(...validateSettingReference(value.source.settingRef, `${path}.source.settingRef`))
  return errors
})

/** 4/8: a public or role-held fact, optionally linked to roles and provenance. */
export const evidenceSchema = defineSchema<CharacterSecret | PublicEvidence>('authored evidence', (value, path) => {
  const errors = requireRecord(value, path)
  if (!isRecord(value)) return errors
  errors.push(...requireText(value.id, `${path}.id`))
  errors.push(...requireText(value.text, `${path}.text`))
  if (value.kind !== undefined) errors.push(...requireOneOf(value.kind, ['evidence', 'secret', 'colour'], `${path}.kind`))
  if (value.aboutRoleIds !== undefined) errors.push(...requireStringList(value.aboutRoleIds, `${path}.aboutRoleIds`, { allowEmpty: true }))
  if (value.provenance !== undefined) errors.push(...provenanceSchema.validate(value.provenance, `${path}.provenance`))
  return errors
})

/** 5/8: one ordered truth claim and the evidence that proves it. */
export const solutionStepSchema = defineSchema<SolutionStep>('solution step', (value, path) => {
  const errors = requireRecord(value, path)
  if (!isRecord(value)) return errors
  return [
    ...errors,
    ...requireText(value.id, `${path}.id`),
    ...requireText(value.title, `${path}.title`),
    ...requireText(value.truth, `${path}.truth`),
    ...requireStringList(value.evidence, `${path}.evidence`),
  ]
})

/** 6/8: a safe spoken or physical instruction contract. */
export const openingExecutionSchema = defineSchema<OpeningExecution>('opening execution', (value, path) => {
  const errors = requireRecord(value, path)
  if (!isRecord(value)) return errors
  errors.push(...requireOneOf(value.kind, ['spoken', 'physical'], `${path}.kind`))
  if (value.kind === 'physical') {
    if (value.contact !== 'none') errors.push(`${path}.contact must be none`)
    if (value.reversible !== true) errors.push(`${path}.reversible must be true`)
    if (value.hostCued !== true) errors.push(`${path}.hostCued must be true`)
    errors.push(...requireOneOf(value.proxy, ['player', 'host'], `${path}.proxy`))
  }
  return errors
})

/** 7/8: one host-run beat with explicit physical and setting dependencies. */
export const openingStepSchema = defineSchema<OpeningStep>('opening step', (value, path) => {
  const errors = requireRecord(value, path)
  if (!isRecord(value)) return errors
  errors.push(...requireText(value.id, `${path}.id`))
  errors.push(...requireText(value.title, `${path}.title`))
  errors.push(...requireText(value.trigger, `${path}.trigger`))
  if (!Array.isArray(value.instructions)) {
    errors.push(`${path}.instructions must be a list`)
  } else {
    const recipients: string[] = []
    for (const [index, instruction] of value.instructions.entries()) {
      const instructionPath = `${path}.instructions[${index}]`
      errors.push(...requireRecord(instruction, instructionPath))
      if (!isRecord(instruction)) continue
      errors.push(...requireText(instruction.recipientRoleId, `${instructionPath}.recipientRoleId`))
      errors.push(...requireText(instruction.text, `${instructionPath}.text`))
      if (typeof instruction.recipientRoleId === 'string') recipients.push(instruction.recipientRoleId)
    }
    if (!value.instructions.length) errors.push(`${path}.instructions must not be empty`)
    if (new Set(recipients).size !== recipients.length) errors.push(`${path}.instructions must have unique recipients`)
  }
  errors.push(...openingExecutionSchema.validate(value.execution, `${path}.execution`))
  errors.push(...requireStringList(value.setupRequirementIds, `${path}.setupRequirementIds`, { allowEmpty: true }))
  errors.push(...requireStringList(value.propIds, `${path}.propIds`, { allowEmpty: true }))
  if (!Array.isArray(value.settingRefs)) {
    errors.push(`${path}.settingRefs must be a list`)
  } else {
    for (const [index, reference] of value.settingRefs.entries()) {
      errors.push(...validateSettingReference(reference, `${path}.settingRefs[${index}]`))
    }
    const keys = value.settingRefs.filter(isRecord).map(reference => `${String(reference.kind)}:${String(reference.id)}`)
    if (new Set(keys).size !== keys.length) errors.push(`${path}.settingRefs must not contain duplicate references`)
  }
  return errors
})

/** 8/8: a timed, explicitly phased segment of the evening. */
export const eveningStageSchema = defineSchema<EveningStage>('evening stage', (value, path) => {
  const errors = requireRecord(value, path)
  if (!isRecord(value)) return errors
  return [
    ...errors,
    ...requireText(value.id, `${path}.id`),
    ...requireText(value.title, `${path}.title`),
    ...requireText(value.description, `${path}.description`),
    ...Number.isInteger(value.durationMinutes) && (value.durationMinutes as number) > 0
      ? []
      : [`${path}.durationMinutes must be a positive whole number`],
    ...requireOneOf(value.phase, ['opening', 'investigation', 'reveal'], `${path}.phase`),
  ]
})

export const authoredStorySchemas = {
  objective: objectiveSchema,
  relationship: relationshipSchema,
  provenance: provenanceSchema,
  evidence: evidenceSchema,
  solutionStep: solutionStepSchema,
  openingExecution: openingExecutionSchema,
  openingStep: openingStepSchema,
  eveningStage: eveningStageSchema,
} as const
