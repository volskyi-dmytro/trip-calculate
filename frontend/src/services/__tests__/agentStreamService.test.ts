import { describe, it, expect, vi } from 'vitest'
import { createSseParser } from '../agentStreamService'
import * as agentService from '../agentService'

describe('createSseParser', () => {
  it('parses complete frames', () => {
    const p = createSseParser()
    const frames = p.push('event: stage\ndata: {"stage":"route","status":"done"}\n\n')
    expect(frames).toEqual([{ event: 'stage', data: '{"stage":"route","status":"done"}' }])
  })

  it('handles frames split across chunks', () => {
    const p = createSseParser()
    expect(p.push('event: sta')).toEqual([])
    expect(p.push('ge\ndata: {"stage":"fuel","st')).toEqual([])
    const frames = p.push('atus":"done"}\n\n')
    expect(frames).toEqual([{ event: 'stage', data: '{"stage":"fuel","status":"done"}' }])
  })

  it('handles multiple frames in one chunk', () => {
    const p = createSseParser()
    const frames = p.push(
      'event: stage\ndata: {"stage":"route","status":"done"}\n\n' +
      'event: result\ndata: {"success":true}\n\n',
    )
    expect(frames.map(f => f.event)).toEqual(['stage', 'result'])
  })

  it('ignores comment/keepalive lines', () => {
    const p = createSseParser()
    expect(p.push(': keepalive\n\n')).toEqual([])
  })

  it('joins multiple data lines with newline per SSE spec', () => {
    const p = createSseParser()
    const frames = p.push('event: stage\ndata: a\ndata: b\n\n')
    expect(frames).toEqual([{ event: 'stage', data: 'a\nb' }])
  })
})

describe('streamRouteWithAgent fallback discipline', () => {
  it('falls back once and signals degraded on transport failure', async () => {
    // vitest runs without a DOM; getCsrfToken reads document.cookie, so stub
    // it — otherwise the fallback triggers from the missing DOM before fetch
    // even runs, and the test passes for the wrong reason
    vi.stubGlobal('document', { cookie: '' })
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'))
    vi.stubGlobal('fetch', fetchMock)
    const fallback = vi.spyOn(agentService, 'parseRouteWithAgent')
      .mockResolvedValue({ data: null, error: 'sync answered' })
    const onDegraded = vi.fn()
    const { streamRouteWithAgent } = await import('../agentStreamService')
    const result = await streamRouteWithAgent('Kyiv to Lviv', 'en', [], undefined, () => {}, onDegraded)
    expect(fetchMock).toHaveBeenCalledTimes(1)   // failure genuinely came from transport
    expect(onDegraded).toHaveBeenCalledTimes(1)
    expect(fallback).toHaveBeenCalledTimes(1)
    expect(result.error).toBe('sync answered')
    vi.unstubAllGlobals()
    fallback.mockRestore()
  })

})

describe('streamRouteWithAgent caller-callback bugs', () => {
  it('a throwing onStage bypasses the fallback and surfaces', async () => {
    const sse =
      'event: stage\ndata: {"stage":"route","status":"done"}\n\n' +
      'event: result\ndata: {"success":true,"route":{"waypoints":[],"settings":{}}}\n\n'
    vi.stubGlobal('document', { cookie: '' })
    const fetchMock = vi.fn().mockResolvedValue(new Response(sse, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const fallback = vi.spyOn(agentService, 'parseRouteWithAgent')
      .mockResolvedValue({ data: null, error: 'should not be called' })
    const { streamRouteWithAgent } = await import('../agentStreamService')

    await expect(
      streamRouteWithAgent('Kyiv to Lviv', 'en', [], undefined, () => {
        throw new Error('ui bug')
      }),
    ).rejects.toThrow('ui bug')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fallback).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
    fallback.mockRestore()
  })
})

describe('createSseParser — spaceless field format (Spring SseEmitter)', () => {
  it('parses "event:stage" without a space after the colon', () => {
    const p = createSseParser()
    const frames = p.push('event:stage\ndata:{"stage":"route","status":"done"}\n\n')
    expect(frames).toEqual([{ event: 'stage', data: '{"stage":"route","status":"done"}' }])
  })

  it('preserves value-leading spaces beyond the first (spec)', () => {
    const p = createSseParser()
    const frames = p.push('event: result\ndata:  padded\n\n')
    expect(frames).toEqual([{ event: 'result', data: ' padded' }])
  })
})

describe('weather stage (SP3)', () => {
  it('recognizes a weather stage frame and fires onStage', async () => {
    const sse =
      'event: stage\ndata: {"stage":"weather","status":"done"}\n\n' +
      'event: result\ndata: {"success":true,"route":{"waypoints":[],"settings":{}}}\n\n'
    vi.stubGlobal('document', { cookie: '' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(sse, { status: 200 })))
    const { streamRouteWithAgent } = await import('../agentStreamService')
    const stages: string[] = []
    await streamRouteWithAgent('Kyiv to Lviv', 'en', [], undefined,
      (s) => stages.push(s))
    expect(stages).toContain('weather')
    vi.unstubAllGlobals()
  })
})
