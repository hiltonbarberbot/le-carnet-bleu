import type { Character } from '../types'

export function getKnownSecrets(character: Character) {
  return character.secrets
}
