/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from '../HomePage'
import { cityRouteService } from '../../services/cityRouteService'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'uk', t: (key: string) => key }),
}))
vi.mock('../../components/common/Header', () => ({ Header: () => <header>Header</header> }))
vi.mock('../../components/common/Footer', () => ({ Footer: () => <footer>Footer</footer> }))
vi.mock('../../components/QuickCalculator', () => ({ QuickCalculator: () => <div /> }))
vi.mock('../../components/calculator/CalculatorModal', () => ({ CalculatorModal: () => null }))
vi.mock('../../services/cityRouteService', () => ({ cityRouteService: { list: vi.fn() } }))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const route = { slug: 'kyiv-lviv', from: { uk: 'Київ', en: 'Kyiv' }, to: { uk: 'Львів', en: 'Lviv' } }
const cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
  vi.mocked(cityRouteService.list).mockReset()
  document.getElementById('city-routes-data')?.remove()
})

async function renderPage() {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  await act(async () => {
    root.render(<HomePage />)
    await new Promise((r) => setTimeout(r, 0))
  })
  cleanups.push(() => act(() => root.unmount()))
  return container
}

describe('HomePage popular routes', () => {
  it('renders crawlable links from the server-embedded list without calling the API', async () => {
    const island = document.head.appendChild(document.createElement('script'))
    island.type = 'application/json'
    island.id = 'city-routes-data'
    island.textContent = JSON.stringify([route])

    const container = await renderPage()

    expect(cityRouteService.list).not.toHaveBeenCalled()
    expect(container.querySelector('a[href="/uk/route/kyiv-lviv"]')?.textContent).toBe('Київ → Львів')
  })

  it('falls back to the API after a client-side arrival', async () => {
    vi.mocked(cityRouteService.list).mockResolvedValue([route])

    const container = await renderPage()

    expect(cityRouteService.list).toHaveBeenCalledOnce()
    expect(container.querySelector('a[href="/uk/route/kyiv-lviv"]')).not.toBeNull()
  })
})
