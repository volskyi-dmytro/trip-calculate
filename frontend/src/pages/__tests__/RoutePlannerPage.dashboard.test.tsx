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

const render = (url: string) =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={[url]}>
      <LanguageProvider>
        <ThemeProvider>
          <RoutePlannerPage />
        </ThemeProvider>
      </LanguageProvider>
    </MemoryRouter>,
  )

describe('planner page heading/landmark structure', () => {
  it('dashboard (?routeId skips the welcome screen): one sr-only h1, one main', () => {
    const html = render('/en/route-planner?routeId=1')

    // Unique to the dashboard branch: the sr-only h1 and the route-inputs h2; none of the welcome art.
    expect(html).toContain('<h2 class="sr-only">')
    expect(html).not.toContain('ai-welcome.webp')
    expect(html.match(/<h1[ >]/g)).toHaveLength(1)
    expect(html.match(/<h1 class="sr-only"/g)).toHaveLength(1)
    expect(html.match(/<main[ >]/g)).toHaveLength(1)
  })

  it('welcome screen: one visible h1, one main', () => {
    const html = render('/en/route-planner')

    expect(html).toContain('ai-welcome.webp')
    expect(html).not.toContain('<h2 class="sr-only">')
    expect(html.match(/<h1[ >]/g)).toHaveLength(1)
    expect(html).not.toContain('<h1 class="sr-only"')
    expect(html.match(/<main[ >]/g)).toHaveLength(1)
  })
})
