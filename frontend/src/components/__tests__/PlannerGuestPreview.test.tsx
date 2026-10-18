/** @vitest-environment jsdom */

import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'

vi.mock('mapbox-gl', () => {
  const inert = (): unknown => new Proxy(function () {}, { get: () => inert(), apply: () => inert() })
  class FakeMap {
    constructor() {
      return new Proxy(this, { get: () => inert() })
    }
  }
  return { default: { Map: FakeMap, NavigationControl: class {}, Marker: class {}, accessToken: '' } }
})
vi.mock('mapbox-gl/dist/mapbox-gl.css', () => ({}))
vi.mock('../../contexts/ThemeContext', () => ({ useTheme: () => ({ theme: 'light' }) }))
vi.mock('../../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'en', t: (k: string) => k }) }))
vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('../../services/fuelPriceService', () => ({ getFuelSuggestion: vi.fn(() => Promise.resolve(null)) }))

const login = vi.fn()
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ login }) }))

describe('PlannerGuestPreview', () => {
  it('shows the request it was planned from, a finished trip and a sign-up CTA, without hitting the AI endpoint', async () => {
    const { PlannerGuestPreview } = await import('../PlannerGuestPreview')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => root.render(<PlannerGuestPreview />))

    const html = container.innerHTML
    expect(html).toContain('362 km')
    expect(html).toContain('Lviv to Kraków, 2 people, petrol')
    expect(html).toContain('Plan my own trip — free')
    expect(html).toContain('href="/en/route-planner"')
    expect(html).toContain('example price')
    expect(html).not.toMatch(/[^\d.,]0\.00/) // no empty 0.00 figures

    act(() => root.unmount())
  })
})
