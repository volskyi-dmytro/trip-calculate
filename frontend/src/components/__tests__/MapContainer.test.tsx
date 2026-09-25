/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

const created: Array<Record<string, unknown>> = []

vi.mock('mapbox-gl', () => {
  // Any method call on the fake map (on, addControl, getStyle, ...) is a no-op.
  const inert = (): unknown => new Proxy(function () {}, { get: () => inert(), apply: () => inert() })
  class FakeMap {
    constructor(options: Record<string, unknown>) {
      created.push(options)
      return new Proxy(this, { get: () => inert() })
    }
  }
  return { default: { Map: FakeMap, NavigationControl: class {}, Marker: class {}, accessToken: '' } }
})
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('MapContainer', () => {
  it('turns off Mapbox performance metrics collection', async () => {
    vi.stubEnv('VITE_MAPBOX_TOKEN', 'pk.test')
    const { MapContainer } = await import('../MapContainer')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => root.render(<MapContainer waypoints={[]} routeGeometry={[]} onAddWaypoint={() => {}} onUpdateWaypoint={() => {}} onDeleteWaypoint={() => {}} />))

    expect(created).toHaveLength(1)
    expect(created[0].performanceMetricsCollection).toBe(false)
    act(() => root.unmount())
    vi.unstubAllEnvs()
  })
})
