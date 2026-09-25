import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Language } from '../../types'

let language: Language = 'uk'
vi.mock('../../contexts/LanguageContext', () => ({ useLanguage: () => ({ language }) }))
vi.mock('react-router-dom', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}))

const { AiPrivacyNote } = await import('../AiPrivacyNote')

describe('AiPrivacyNote', () => {
  it('tells Ukrainian users where their chat goes and links the policy section', () => {
    language = 'uk'
    const html = renderToStaticMarkup(<AiPrivacyNote />)
    expect(html).toContain('OpenAI')
    expect(html).toContain('href="/uk/privacy#what-we-collect"')
    expect(html).toContain('Політика конфіденційності')
  })

  it('speaks English on English pages', () => {
    language = 'en'
    const html = renderToStaticMarkup(<AiPrivacyNote />)
    expect(html).toContain('href="/en/privacy#what-we-collect"')
    expect(html).toContain('Privacy Policy')
  })

  it('explains where a car description goes on the car picker', () => {
    language = 'uk'
    const html = renderToStaticMarkup(<AiPrivacyNote kind="car" />)
    expect(html).toContain('Опис авто надсилається до OpenAI')
    expect(html).toContain('href="/uk/privacy#what-we-collect"')
  })
})
