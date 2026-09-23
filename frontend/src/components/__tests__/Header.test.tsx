/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Header } from '../common/Header'

let currentPathname = '/uk/route-planner'
let currentLanguage: 'en' | 'uk' = 'uk'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to, ...rest }: { children: ReactNode; to: string } & Record<string, unknown>) => (
    <a href={to} {...rest}>{children}</a>
  ),
  useLocation: () => ({ pathname: currentPathname, search: '' }),
}))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: null, loading: false }),
}))
vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}))
vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: currentLanguage, t: (key: string) => key }),
}))
vi.mock('../auth/LoginButton', () => ({ LoginButton: () => <a href="/login">Login</a> }))
vi.mock('../auth/UserMenu', () => ({ UserMenu: () => <div>User menu</div> }))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<() => void> = []
afterEach(() => {
  for (const cleanup of mounted.splice(0)) cleanup()
})

function renderWithLocale(pathname: string, language: 'en' | 'uk') {
  currentPathname = pathname
  currentLanguage = language

  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(<Header />)
  })
  mounted.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  return container
}

describe('Header language switcher', () => {
  it('links the EN toggle to the same page in English, with hrefLang', () => {
    const container = renderWithLocale('/uk/route-planner', 'uk')
    const enLink = container.querySelector('a[href="/en/route-planner"]')

    expect(enLink).not.toBeNull()
    expect(enLink?.getAttribute('hreflang')).toBe('en')
  })

  it('links the UA toggle to the same page (including a route slug) in Ukrainian', () => {
    const container = renderWithLocale('/en/route/kyiv-lviv', 'en')
    const ukLink = container.querySelector('a[href="/uk/route/kyiv-lviv"]')

    expect(ukLink).not.toBeNull()
    expect(ukLink?.getAttribute('hreflang')).toBe('uk')
  })

  it('renders the brand as a real link to the localized home page', () => {
    const container = renderWithLocale('/en/route-planner', 'en')

    expect(container.querySelector('a.brand[href="/en"]')).not.toBeNull()
  })
})
