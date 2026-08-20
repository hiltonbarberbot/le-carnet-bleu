import { generateText, jsonSchema, Output } from 'ai'
import { createAiCallOptions } from '../../ai/server/deadline'
import type { StorylineDefinition } from '../../definition/contract'
import { productNaming } from '../../../product/naming'
import {
  rehearsalJudgeReviewJsonSchema,
  hostRehearsalReportJsonSchema,
  roleRehearsalReportJsonSchema,
  validateRehearsalJudgeReview,
  validateHostRehearsalReport,
  validateRoleRehearsalReport,
  type RehearsalJudgeReview,
  type HostRehearsalReport,
  type RoleRehearsalReport,
} from './contract'
import { createHostRehearsalPrompt, createRehearsalJudgePrompt, createRoleRehearsalPrompt } from './packets'

export const defaultRoleRehearsalModel = 'google/gemini-3.7-flash'
export const defaultHostRehearsalModel = 'google/gemini-3.7-flash'
export const defaultRehearsalJudgeModel = 'anthropic/claude-sonnet-5'

export async function rehearseRoleWithGateway(
  definition: StorylineDefinition,
  roleIndex: number,
  options: { model?: string } = {},
): Promise<RoleRehearsalReport> {
  const participantRef = `player-${roleIndex + 1}`
  const result = await generateText({
    model: options.model ?? process.env.AI_GATEWAY_REHEARSAL_ROLE_MODEL ?? defaultRoleRehearsalModel,
    system: 'You are an isolated mystery-game player. Reason only from your supplied public material and private dossier. Return only the requested structured report.',
    prompt: createRoleRehearsalPrompt(definition, roleIndex),
    output: Output.object({ schema: jsonSchema<RoleRehearsalReport>(roleRehearsalReportJsonSchema(participantRef)) }),
    ...createAiCallOptions(),
    temperature: 0,
    providerOptions: { gateway: { tags: [productNaming.telemetryTag, 'role-rehearsal'] } },
  })
  const errors = validateRoleRehearsalReport(definition, roleIndex, result.output)
  if (errors.length) throw new Error(`Invalid isolated-player rehearsal:\n${errors.join('\n')}`)
  return result.output
}

export async function rehearseHostWithGateway(
  definition: StorylineDefinition,
  options: { model?: string } = {},
): Promise<HostRehearsalReport> {
  const result = await generateText({
    model: options.model ?? process.env.AI_GATEWAY_REHEARSAL_HOST_MODEL ?? defaultHostRehearsalModel,
    system: 'You are an isolated live-mystery host. Verify exact physical and runtime execution from the supplied host packet. Return only the requested structured report.',
    prompt: createHostRehearsalPrompt(definition),
    output: Output.object({ schema: jsonSchema<HostRehearsalReport>(hostRehearsalReportJsonSchema) }),
    ...createAiCallOptions(),
    temperature: 0,
    providerOptions: { gateway: { tags: [productNaming.telemetryTag, 'host-rehearsal'] } },
  })
  const errors = validateHostRehearsalReport(definition, result.output)
  if (errors.length) throw new Error(`Invalid isolated-host rehearsal:\n${errors.join('\n')}`)
  return result.output
}

export async function judgeRehearsalWithGateway(
  definition: StorylineDefinition,
  roleReports: RoleRehearsalReport[],
  hostReport: HostRehearsalReport,
  options: { model?: string } = {},
): Promise<RehearsalJudgeReview> {
  const result = await generateText({
    model: options.model ?? process.env.AI_GATEWAY_REHEARSAL_JUDGE_MODEL ?? defaultRehearsalJudgeModel,
    system: 'You are a severe spoiler-aware playtest judge. Treat every missing, uncertain, or inaccessible route as blocking. Return only the requested structured review.',
    prompt: createRehearsalJudgePrompt(definition, roleReports, hostReport),
    output: Output.object({ schema: jsonSchema<RehearsalJudgeReview>(rehearsalJudgeReviewJsonSchema) }),
    ...createAiCallOptions(),
    temperature: 0,
    providerOptions: { gateway: { tags: [productNaming.telemetryTag, 'rehearsal-judge'] } },
  })
  const errors = validateRehearsalJudgeReview(definition, result.output)
  if (errors.length) throw new Error(`Invalid rehearsal judge review:\n${errors.join('\n')}`)
  return result.output
}
