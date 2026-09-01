export interface RefreshContext {
  isCurrent(): boolean
}

export interface RefreshRequest {
  immediate?: boolean
}

export interface RefreshScheduler {
  request(options?: RefreshRequest): Promise<void>
  dispose(): void
}

export function createRefreshScheduler(
  refresh: (context: RefreshContext) => Promise<void>,
  coalesceMs = 40,
): RefreshScheduler {
  let disposed = false
  let running = false
  let trailing = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let waiters: Array<() => void> = []

  const isCurrent = () => !disposed

  const settleIfIdle = () => {
    if (running || trailing || timer !== null) return
    const settled = waiters
    waiters = []
    settled.forEach((resolve) => resolve())
  }

  const execute = async () => {
    timer = null
    if (disposed) {
      settleIfIdle()
      return
    }
    if (running) {
      trailing = true
      return
    }
    running = true
    try {
      await refresh({ isCurrent })
    } finally {
      running = false
      if (!disposed && trailing) {
        trailing = false
        timer = setTimeout(() => void execute(), coalesceMs)
      }
      settleIfIdle()
    }
  }

  const request = ({ immediate = false }: RefreshRequest = {}): Promise<void> => {
    if (disposed) return Promise.resolve()
    const completed = new Promise<void>((resolve) => waiters.push(resolve))
    if (running) {
      trailing = true
      return completed
    }
    if (timer !== null) {
      if (!immediate) return completed
      clearTimeout(timer)
      timer = null
    }
    if (immediate) void execute()
    else timer = setTimeout(() => void execute(), coalesceMs)
    return completed
  }

  return {
    request,
    dispose() {
      disposed = true
      trailing = false
      if (timer !== null) clearTimeout(timer)
      timer = null
      settleIfIdle()
    },
  }
}
