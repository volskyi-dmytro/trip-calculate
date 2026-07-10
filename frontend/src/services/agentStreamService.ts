import * as agentService from './agentService'
import {
  mapAgentRouteResponse,
  getCsrfToken,
  type AgentParseResult,
  type AgentRouteResponse,
  type CurrentRouteWaypoint,
} from './agentService'
import type { FuelType } from './fuelPriceService'

const STREAM_ENDPOINT = '/api/ai/insights/stream'
const STREAM_TIMEOUT_MS = 80_000

export type AgentStage = 'supervisor' | 'route' | 'geocoding' | 'fuel' | 'compose'
const STAGES: readonly AgentStage[] = ['supervisor', 'route', 'geocoding', 'fuel', 'compose']

/** Stateful SSE frame parser: frames may split across chunks or arrive
 * several per chunk; comment lines (": keepalive") are ignored. */
export function createSseParser() {
  let buffer = ''
  return {
    push(chunk: string): { event: string; data: string }[] {
      buffer += chunk
      const frames: { event: string; data: string }[] = []
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        let event = ''
        const data: string[] = []
        for (const line of block.split('\n')) {
          if (line.startsWith('event: ')) event = line.slice(7).trim()
          else if (line.startsWith('data: ')) data.push(line.slice(6))
        }
        if (event) frames.push({ event, data: data.join('\n') })
      }
      return frames
    },
  }
}

/**
 * Streams route creation, firing onStage per completed agent stage.
 * Fallback contract: ONLY a transport failure before a result frame falls
 * back (once) to the sync endpoint. error frames and success=false results
 * are real answers and resolve normally.
 *
 * Rate-limit errors thrown by the sync fallback propagate to the caller
 * exactly like the sync client's (parseRouteWithAgent re-throws rate limits
 * by convention so the UI can show reset timing). The fallback request itself
 * has no client-side timeout, matching sync behavior.
 */
export const streamRouteWithAgent = async (
  query: string,
  language: string,
  currentRoute: CurrentRouteWaypoint[],
  settingsContext: { fuel_type: FuelType; currency: string } | undefined,
  onStage: (stage: AgentStage) => void,
  onDegraded?: () => void,
): Promise<AgentParseResult> => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS)
  try {
    const csrfToken = getCsrfToken()
    const headers: HeadersInit = { 'Content-Type': 'application/json' }
    if (csrfToken) headers['X-XSRF-TOKEN'] = csrfToken

    const response = await fetch(STREAM_ENDPOINT, {
      method: 'POST',
      headers,
      credentials: 'include',
      signal: controller.signal,
      body: JSON.stringify({
        message: query,
        language,
        ...(currentRoute.length > 0 ? { currentRoute } : {}),
        ...(settingsContext ? { settingsContext } : {}),
      }),
    })
    if (!response.ok || !response.body) {
      throw new Error(`stream unavailable: ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    const parser = createSseParser()

    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        decoder.decode() // flush any trailing bytes from an unterminated partial frame
        break
      }
      for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
        if (frame.event === 'stage') {
          let validStage: AgentStage | null = null
          try {
            const payload = JSON.parse(frame.data) as { stage: string; status: string }
            if (payload.status === 'done' && (STAGES as readonly string[]).includes(payload.stage)) {
              validStage = payload.stage as AgentStage
            }
          } catch { /* malformed stage frame — progress only, never fatal */ }
          if (validStage) {
            // The catch above only handles transport/parse failures; a throwing onStage callback
            // is a real bug that must surface, not be swallowed as a malformed frame.
            onStage(validStage)
          }
        } else if (frame.event === 'result') {
          try {
            return mapAgentRouteResponse(JSON.parse(frame.data) as AgentRouteResponse)
          } catch (err) {
            // A corrupt result frame is transport-equivalent (truncation is the likely cause),
            // so we deliberately fall back to sync rather than surface parse/mapping errors.
            // Log for visibility on systematic parse bugs client-side.
            console.error('AI stream result frame could not be interpreted; falling back to sync', err)
            throw err
          }
        } else if (frame.event === 'error') {
          // Real answer from the streaming layer — no fallback, no leak of
          // internals; the caller shows its default localized error text
          return { data: null }
        }
      }
    }
    throw new Error('stream ended without result')
  } catch {
    // Transport failure before a result frame: one silent sync retry —
    // the worst case is exactly the pre-SP2 UX. onDegraded lets the
    // progress UI keep its last honest state with a shimmer meanwhile.
    onDegraded?.()
    return agentService.parseRouteWithAgent(query, language, currentRoute, settingsContext)
  } finally {
    clearTimeout(timeout)
  }
}
