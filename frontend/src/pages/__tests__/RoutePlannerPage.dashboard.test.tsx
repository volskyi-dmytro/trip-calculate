// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../../contexts/LanguageContext'
import { ThemeProvider } from '../../contexts/ThemeContext'
import { RoutePlannerPage } from '../RoutePlannerPage'

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: '1', name: 'Dmytro', email: 'user@example.com', authenticated: true },
    loading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
}))
// Leaflet needs a real DOM; the map is not part of the heading/landmark structure.
vi.mock('../../components/MapContainer', () => ({ MapContainer: () => <div /> }))

describe('planner dashboard view (real RoutePlanner, ?routeId skips the welcome screen)', () => {
  it('has exactly one h1 and one main landmark', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/en/route-planner?routeId=1']}>
        <LanguageProvider>
          <ThemeProvider>
            <RoutePlannerPage />
          </ThemeProvider>
        </LanguageProvider>
      </MemoryRouter>,
    )

    expect(html.match(/<h1[ >]/g)).toHaveLength(1)
    expect(html.match(/<main[ >]/g)).toHaveLength(1)
  })
})
