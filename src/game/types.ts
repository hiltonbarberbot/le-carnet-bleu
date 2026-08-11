export type Memory = { id: string; text: string; kind: 'chain' | 'secret' | 'colour'; beat?: number }
export type Action = { id: string; text: string; cue: string; consequence: string; essential: boolean; beat?: number }
export type Character = {
  id: string; name: string; title: string; costume: string; publicFace: string; privateSecret: string
  memories: Memory[]; actions: Action[]
}
export type TimelineBeat = { beat: number; title: string; truth: string; evidence: string[] }
export type Game = {
  seed: string; title: string; subtitle: string; victim: string; culprit: string
  characters: Character[]; timeline: TimelineBeat[]; solution: string
}
