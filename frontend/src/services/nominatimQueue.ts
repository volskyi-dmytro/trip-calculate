// One queue per page/module instance, shared by every browser Nominatim caller.
const SPACING_MS = 1000
const REQUEST_TIMEOUT_MS = 10000
let queue: Promise<unknown> = Promise.resolve()
let lastStart = -Infinity

export function nominatimFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const run = queue.then(async () => {
    const wait = lastStart + SPACING_MS - Date.now()
    if (wait > 0) await new Promise(resolve => setTimeout(resolve, wait))
    lastStart = Date.now()
    // A stalled advisory lookup must not indefinitely block interactive searches.
    // Abort the real fetch rather than releasing the queue over an in-flight call.
    const controller = new AbortController()
    const callerSignal = init?.signal ?? (typeof Request !== 'undefined' && input instanceof Request ? input.signal : undefined)
    const abortFromCaller = () => controller.abort(callerSignal?.reason)
    if (callerSignal?.aborted) abortFromCaller()
    else callerSignal?.addEventListener('abort', abortFromCaller, { once: true })
    const deadline = setTimeout(() => controller.abort(new DOMException('Nominatim request timed out', 'TimeoutError')), REQUEST_TIMEOUT_MS)
    try {
      return await fetch(input, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(deadline)
      callerSignal?.removeEventListener('abort', abortFromCaller)
    }
  })
  // A rejected request must not poison subsequent work.
  queue = run.catch(() => undefined)
  return run
}
