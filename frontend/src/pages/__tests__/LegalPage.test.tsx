import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Language } from '../../types'

let language: Language = 'en'
vi.mock('../../contexts/LanguageContext', () => ({ useLanguage: () => ({ language, t: (k: string) => k }) }))
vi.mock('react-router-dom', () => ({ useLocation: () => ({ hash: '' }) }))
vi.mock('../../components/common/Header', () => ({ Header: () => <header>header</header> }))
vi.mock('../../components/common/Footer', () => ({ Footer: () => <footer>footer</footer> }))

const { LegalPage } = await import('../LegalPage')

const render = (lang: Language, page: 'privacy' | 'terms') => {
  language = lang
  return renderToStaticMarkup(<LegalPage page={page} />)
}

describe('LegalPage', () => {
  it('renders the English privacy policy with one h1 and linkable sections', () => {
    const html = render('en', 'privacy')
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html).toContain('<h1>Privacy Policy</h1>')
    expect(html).toContain('id="cookies"')
    expect(html).toContain('href="#cookies"')
  })

  it('turns {email} into a mailto link and **text** into <strong>', () => {
    const html = render('en', 'privacy')
    expect(html).toContain('<a href="mailto:volskyi.dmytro@gmail.com">volskyi.dmytro@gmail.com</a>')
    expect(html).toContain('<strong>Dmytro Volskyi</strong>')
    expect(html).not.toContain('{email}')
    expect(html).not.toContain('**')
  })

  it('renders the Ukrainian terms with a localized effective date', () => {
    const html = render('uk', 'terms')
    expect(html).toContain('<h1>Умови користування</h1>')
    expect(html).toContain('Дата набрання чинності')
    expect(html).toContain('<time dateTime="2026-09-25">')
  })

  it('renders tables with header cells', () => {
    const html = render('uk', 'privacy')
    expect(html).toContain('<th scope="col">Постачальник</th>')
  })
})
