/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextTripBanner } from '../NextTripBanner'

const navigate = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }))
vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'uk', t: (k: string) => k }),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<() => void> = []
afterEach(() => {
  for (const cleanup of mounted.splice(0)) cleanup()
  vi.clearAllMocks()
})

function render() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(<NextTripBanner />)
  })
  mounted.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  return container
}

describe('NextTripBanner', () => {
  it('shows the required copy and a decorative, dimensioned illustration', () => {
    const container = render()
    expect(container.querySelector('h2')?.textContent).toBe('dashboard.banner.heading')
    expect(container.textContent).toContain('dashboard.banner.body')

    const img = container.querySelector('img')!
    expect(img.getAttribute('alt')).toBe('')
    expect(img.getAttribute('src')).toBe('/images/dashboard-v1/next-trip.webp')
    expect(img.getAttribute('width')).toBe('640')
    expect(img.getAttribute('height')).toBe('427')
  })

  it('navigates to the locale-prefixed planner without creating a route', () => {
    const container = render()
    const cta = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === 'dashboard.banner.cta',
    )!
    act(() => cta.click())

    expect(navigate).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith('/uk/route-planner')
  })
})
