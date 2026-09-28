/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StatsCard } from '../StatsCard'
import type { UserStats } from '../../../services/dashboardService'

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (k: string) => k }),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<() => void> = []
afterEach(() => { for (const cleanup of mounted.splice(0)) cleanup() })

function render(stats: UserStats) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(<StatsCard stats={stats} />))
  mounted.push(() => { act(() => root.unmount()); container.remove() })
  return container
}

const base: UserStats = {
  totalRoutes: 3, totalWaypoints: 9, totalDistance: 1200, totalFuelCost: 882.45,
  accountAgeDays: 260, mostUsedCurrency: 'UAH',
}

describe('StatsCard fuel cost', () => {
  it('lists each currency separately instead of one mixed sum', () => {
    const text = render({ ...base, fuelCostByCurrency: { UAH: 812.45, EUR: 70 } }).textContent!
    expect(text).toContain('UAH')
    expect(text).toContain('€70.00')
    expect(text).not.toContain('882.45')
  })

  it('falls back to the single total, formatted as money, for older backends', () => {
    const text = render(base).textContent!
    expect(text).toMatch(/UAH\s?882\.45/)
  })

  it('does not present account age as a travel statistic', () => {
    expect(render(base).textContent).not.toContain('dashboard.stats.accountAge')
  })
})
