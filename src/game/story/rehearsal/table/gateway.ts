import { generateText, jsonSchema, Output } from 'ai'
import { productNaming } from '../../../../product/naming'
import { createAiCallOptions } from '../../../ai/server/deadline'
import type { StorylineDefinition } from '../../../definition/contract'
import type { TableRehearsalReport, TableTurnAction, TableTurnView } from './contract'
import { createTableTurnPrompt } from './prompt'
import { simulateRoundTable } from './simulate'

const actionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'factId', 'targetRoleId', 'deckId', 'accusedRoleId', 'caseFactIds', 'words'],
  properties: {
    action: { enum: ['share_fact', 'ask', 'buy_clue', 'accuse', 'pass'] },
    factId: { type: 'string' },
    targetRoleId: { type: 'string' },
    deckId: { type: 'string' },
    accusedRoleId: { type: 'string' },
    caseFactIds: { type: 'array', items: { type: 'string' } },
    words: { type: 'string', minLength: 1 },
  },
} as const

export const defaultTableRehearsalModel = 'google/gemini-3.7-flash'

export async function playTableTurnWithGateway(definition: StorylineDefinition, roleIndex: number, view: TableTurnView, model: string) {
  const result = await generateText({
    model,
    system: 'You are one isolated player in a live social mystery. Take one legal concrete turn from only your visible information. Return only the requested structured action.',
    prompt: createTableTurnPrompt(definition, roleIndex, view),
    output: Output.object({ schema: jsonSchema<TableTurnAction>(actionSchema) }),
    ...createAiCallOptions(),
    temperature: 0.2,
    providerOptions: { gateway: { tags: [productNaming.telemetryTag, 'table-rehearsal'] } },
  })
  return result.output
}

export async function rehearseRoundTableWithGateway(
  definition: StorylineDefinition,
  options: { model?: string; rounds?: number } = {},
): Promise<TableRehearsalReport> {
  const model = options.model ?? process.env.AI_GATEWAY_REHEARSAL_TABLE_MODEL ?? defaultTableRehearsalModel
  return simulateRoundTable(definition, {
    model,
    rounds: options.rounds,
    runTurn: (roleIndex, view) => playTableTurnWithGateway(definition, roleIndex, view, model),
  })
}
