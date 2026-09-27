import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { RoutePlannerPage } from '../RoutePlannerPage'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
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
  RoutePlanner: () => <div data-testid="route-planner">Route planner ready</div>,
}))
vi.mock('../../components/common/Header', () => ({ Header: () => <header>Header</header> }))
vi.mock('../../components/PlannerGuestPreview', () => ({
  PlannerGuestPreview: () => <main>Guest preview</main>,
}))
vi.mock('../../components/auth/UserMenu', () => ({ UserMenu: () => <div>User menu</div> }))

describe('RoutePlannerPage public beta access', () => {
  it('renders the planner immediately for a Google-authenticated user', () => {
    const html = renderToStaticMarkup(<RoutePlannerPage />)

    expect(html).toContain('Route planner ready')
    expect(html).not.toContain('Request')
  })

  it('gives the language and theme buttons localized accessible names', () => {
    const html = renderToStaticMarkup(<RoutePlannerPage />)

    expect(html).toContain('aria-label="UA: common.switchLanguage"')
    expect(html).toMatch(/aria-label="common\.theme\.to(Light|Dark)"/)
  })

  it('shows the guest sample-trip preview instead of the planner for a logged-out visitor', () => {
    mockUseAuth.mockReturnValueOnce({ user: null, loading: false } as unknown as ReturnType<typeof mockUseAuth>)

    const html = renderToStaticMarkup(<RoutePlannerPage />)

    expect(html).toContain('Guest preview')
    expect(html).not.toContain('Route planner ready')
  })
})
