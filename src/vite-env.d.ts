import type { MetricsSnapshot } from '../shared/types'

export {}

declare global {
  interface Window {
    watchx: {
      subscribe: (callback: (snapshot: MetricsSnapshot) => void) => () => void
      restoreMain?: () => void
      quitApp?: () => void
    }
  }
}
