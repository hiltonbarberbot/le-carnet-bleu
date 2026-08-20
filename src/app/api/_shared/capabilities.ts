import type { RuntimeCapabilities } from '../../../game/types'

export function serverRuntimeCapabilities(): RuntimeCapabilities {
  return {
    // Gateway access can author/review a story, but there is not yet a live
    // autonomous player loop. Never advertise a controller that cannot act.
    aiControllers: false,
  }
}
