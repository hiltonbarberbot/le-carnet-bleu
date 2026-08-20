import type { OpeningInstruction, OpeningStep, Story } from '../types.js'

export function openingInstructionForRole(step: OpeningStep, roleId: string): OpeningInstruction | undefined {
  return step.instructions.find(instruction => instruction.recipientRoleId === roleId)
}

export function openingInstructionsForRole(story: Story, roleId: string) {
  return story.openingSteps.flatMap(step => {
    const instruction = openingInstructionForRole(step, roleId)
    return instruction ? [{ stepId: step.id, stepTitle: step.title, text: instruction.text }] : []
  })
}
