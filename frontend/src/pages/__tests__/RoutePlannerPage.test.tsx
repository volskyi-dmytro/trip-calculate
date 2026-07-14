import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { RoutePlannerPage } from '../RoutePlannerPage'

vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '1', name: 'Dmytro', email: 'user@example.com', authenticated: true },
    loading: false,
  }),
}))
vi.mock('../../contexts/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }),
}))
vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', setLanguage: vi.fn() }),
}))
vi.mock('../../components/RoutePlanner', () => ({
  RoutePlanner: () => <div data-testid="route-planner">Route planner ready</div>,
}))
vi.mock('../../components/common/Header', () => ({ Header: () => <header>Header</header> }))
vi.mock('../../components/LandingView', () => ({ LandingView: () => <main>Landing</main> }))
vi.mock('../../components/auth/UserMenu', () => ({ UserMenu: () => <div>User menu</div> }))

describe('RoutePlannerPage public beta access', () => {
  it('renders the planner immediately for a Google-authenticated user', () => {
    const html = renderToStaticMarkup(<RoutePlannerPage />)

    expect(html).toContain('Route planner ready')
    expect(html).not.toContain('Request')
  })
})
