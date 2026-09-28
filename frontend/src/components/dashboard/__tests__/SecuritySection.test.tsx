/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (k: string) => k }),
}))
vi.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ logout: vi.fn() }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../../../utils/plannerStorage', () => ({ clearPlannerStorage: vi.fn() }))
// Real Dialog portals to <body> and gates on `open`; inline rendering here
// lets the test reach the confirmation button regardless of open state,
// matching the existing EditProfileModal test's approach.
vi.mock('../../ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

const deleteAccount = vi.fn().mockResolvedValue(undefined)
const exportData = vi.fn().mockResolvedValue(new Blob(['{}']))
vi.mock('../../../services/dashboardService', () => ({
  dashboardService: { deleteAccount, exportData },
}))

const { SecuritySection } = await import('../SecuritySection')

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
    root.render(<SecuritySection />)
  })
  mounted.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  return container
}

const byText = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll('button')].filter((b) => b.textContent?.includes(text))

describe('SecuritySection account settings and danger zone', () => {
  it('offers data export as a plain account-settings action', () => {
    const container = render()
    expect(byText(container, 'dashboard.quickActions.downloadData')).toHaveLength(1)
  })

  it('keeps account deletion behind its existing confirmation dialog', async () => {
    const container = render()
    const [rowButton, confirmButton] = byText(container, 'dashboard.quickActions.deleteAccount')
    expect(rowButton).toBeDefined()
    expect(confirmButton).toBeDefined()

    // Clicking the danger-zone row only opens the dialog; it must not delete.
    act(() => rowButton.click())
    expect(deleteAccount).not.toHaveBeenCalled()

    await act(async () => {
      confirmButton.click()
      await Promise.resolve()
    })
    expect(deleteAccount).toHaveBeenCalledOnce()
  })
})
