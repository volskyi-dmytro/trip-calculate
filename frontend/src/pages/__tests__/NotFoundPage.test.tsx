import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'uk', t: (k: string) => k }) }))
vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))
vi.mock('../../components/common/Header', () => ({ Header: () => <header>header</header> }))
vi.mock('../../components/common/Footer', () => ({ Footer: () => <footer>footer</footer> }))

const { NotFoundPage } = await import('../NotFoundPage')

describe('NotFoundPage', () => {
  it('says the page does not exist and links home in the current language', () => {
    const html = renderToStaticMarkup(<NotFoundPage />)

    expect(html).toContain('<h1>notFound.title</h1>')
    expect(html).toContain('<a href="/uk">notFound.cta</a>')
  })
})
