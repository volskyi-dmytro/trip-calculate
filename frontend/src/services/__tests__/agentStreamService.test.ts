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
})

describe('streamRouteWithAgent fallback discipline', () => {
  it('falls back once and signals degraded on transport failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const fallback = vi.spyOn(agentService, 'parseRouteWithAgent')
      .mockResolvedValue({ data: null, error: 'sync answered' })
    const onDegraded = vi.fn()
    const { streamRouteWithAgent } = await import('../agentStreamService')
    const result = await streamRouteWithAgent('Kyiv to Lviv', 'en', [], undefined, () => {}, onDegraded)
    expect(onDegraded).toHaveBeenCalledTimes(1)
    expect(fallback).toHaveBeenCalledTimes(1)
    expect(result.error).toBe('sync answered')
    vi.unstubAllGlobals()
    fallback.mockRestore()
  })
})
