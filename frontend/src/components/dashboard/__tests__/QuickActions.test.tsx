import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { QuickActions } from '../QuickActions'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (key: string) => key }),
}))

describe('QuickActions', () => {
  it('offers route creation and the calculator', () => {
    const html = renderToStaticMarkup(<QuickActions />)

    expect(html).toContain('dashboard.quickActions.createRoute')
    expect(html).toContain('dashboard.quickActions.calculateTrip')
  })

  it('keeps data export and account deletion out of everyday quick actions', () => {
    const html = renderToStaticMarkup(<QuickActions />)

    expect(html).not.toContain('dashboard.quickActions.downloadData')
    expect(html).not.toContain('dashboard.quickActions.deleteAccount')
  })
})
