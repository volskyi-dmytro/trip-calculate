import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { RoutePlannerPage } from '../RoutePlannerPage'

let currentSearch = ''
vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useLocation: () => ({ pathname: '/en/route-planner', search: currentSearch, hash: '' }),
  useSearchParams: () => [new URLSearchParams(currentSearch)],
}))
const mockUseAuth = vi.fn(() => ({
  user: { id: '1', name: 'Dmytro', email: 'user@example.com', authenticated: true },
  loading: false,
}))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))
vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}))
vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', setLanguage: vi.fn(), t: (key: string) => key }),
}))
vi.mock('../../components/RoutePlanner', () => ({
  // the real RoutePlanner owns the page h1 (WelcomeScreen visible / dashboard sr-only)
  RoutePlanner: () => <div data-testid="route-planner"><h1>Planner title</h1>Route planner ready</div>,
}))
vi.mock('../../components/common/Header', () => ({ Header: () => <header>Header</header> }))
vi.mock('../../components/PlannerGuestPreview', () => ({
  PlannerGuestPreview: () => <div>Guest preview</div>,
}))
vi.mock('../../components/auth/LoginButton', () => ({ LoginButton: () => <a href="/login">Login</a> }))
vi.mock('../../components/auth/UserMenu', () => ({ UserMenu: () => <div>User menu</div> }))

describe('RoutePlannerPage public beta access', () => {
  it('renders the planner immediately for a Google-authenticated user', () => {
    const html = renderToStaticMarkup(<RoutePlannerPage />)

    expect(html).toContain('Route planner ready')
    expect(html).not.toContain('Request')
  })

  it('gives the language and theme buttons localized accessible names', () => {
    const html = renderToStaticMarkup(<RoutePlannerPage />)

    expect(html).toContain('aria-label="common.language"')
    expect(html).toContain('>UA</a>')
    expect(html).toMatch(/aria-label="common\.theme\.to(Light|Dark)"/)
  })

  it('has a skip link, one main landmark and exactly one h1', () => {
    for (const guest of [false, true]) {
      if (guest) mockUseAuth.mockReturnValueOnce({ user: null, loading: false } as unknown as ReturnType<typeof mockUseAuth>)
      const html = renderToStaticMarkup(<RoutePlannerPage />)
      expect(html).toContain('href="#main"')
      expect(html.match(/<main[ >]/g)).toHaveLength(1)
      expect(html).toContain('id="main"')
      if (!guest) expect(html.match(/<h1[ >]/g)).toHaveLength(1)
    }
  })

  it('opens the real planner (manual mode) for a logged-out visitor — no sign-in wall', () => {
    mockUseAuth.mockReturnValueOnce({ user: null, loading: false } as unknown as ReturnType<typeof mockUseAuth>)

    const html = renderToStaticMarkup(<RoutePlannerPage />)

    expect(html).toContain('Route planner ready')
    expect(html).not.toContain('Guest preview')
  })

  it('shows the static sample trip to a logged-out visitor who asks for it (?sample=1)', () => {
    currentSearch = '?sample=1'
    mockUseAuth.mockReturnValueOnce({ user: null, loading: false } as unknown as ReturnType<typeof mockUseAuth>)

    const html = renderToStaticMarkup(<RoutePlannerPage />)
    currentSearch = ''

    expect(html).toContain('Guest preview')
    expect(html).not.toContain('Route planner ready')
  })
})
