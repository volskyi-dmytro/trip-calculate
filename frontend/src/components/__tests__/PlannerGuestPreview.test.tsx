/** @vitest-environment jsdom */

import { act } from 'react'
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
vi.mock('../../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }))

const login = vi.fn()
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ login }) }))

describe('PlannerGuestPreview', () => {
  it('shows a finished sample trip and a sign-in call to action, without hitting the AI endpoint', async () => {
    const { PlannerGuestPreview } = await import('../PlannerGuestPreview')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => root.render(<PlannerGuestPreview />))

    const html = container.innerHTML
    expect(html).toContain('362 km')
    expect(html).toContain('Sign in with Google to plan your own trip')
    expect(html).not.toContain('0.00')

    act(() => root.unmount())
  })
})
