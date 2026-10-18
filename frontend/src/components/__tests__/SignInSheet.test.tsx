/** @vitest-environment jsdom */

import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en', t: (k: string) => k }),
}))
vi.mock('../../services/api', () => ({ API_BASE_URL: '' }))
const login = vi.fn()
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false, login }) }))

const { SignInSheet } = await import('../auth/SignInSheet')

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanups: Array<() => void> = []
afterEach(() => { for (const c of cleanups.splice(0)) c() })

function Host(props: { returnTo?: string; onBeforeLogin?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button id="opener" onClick={() => setOpen(true)}>Create a trip</button>
      <SignInSheet open={open} onOpenChange={setOpen} {...props} />
    </>
  )
}

function setup(props: { returnTo?: string; onBeforeLogin?: () => void } = {}) {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  act(() => root.render(<Host {...props} />))
  cleanups.push(() => { act(() => root.unmount()); container.remove() })
  const opener = container.querySelector<HTMLButtonElement>('#opener')!
  opener.focus()
  act(() => opener.click())
  return opener
}

const key = (k: string, init: KeyboardEventInit = {}) =>
  act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init })) })

describe('SignInSheet', () => {
  it('opens as a labelled modal dialog', () => {
    setup()
    const dialog = document.querySelector('[role="dialog"]')!
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toContain('signInSheet.title')
    expect(document.getElementById(dialog.getAttribute('aria-describedby')!)?.textContent).toBe('signInSheet.text')
  })

  it('"Continue with Google" goes to the OAuth endpoint', () => {
    setup()
    const link = Array.from(document.querySelectorAll('a')).find((a) => a.textContent === 'signInSheet.continue')!
    expect(link.getAttribute('href')).toBe('/oauth2/authorization/google')
  })

  it('carries the page to come back to, and stashes work before leaving for Google', () => {
    const onBeforeLogin = vi.fn()
    setup({ returnTo: '/en/route-planner?resume=save', onBeforeLogin })
    const link = Array.from(document.querySelectorAll('a')).find((a) => a.textContent === 'signInSheet.continue')!
    expect(link.getAttribute('href')).toBe('/oauth2/authorization/google?returnTo=%2Fen%2Froute-planner%3Fresume%3Dsave')
    login.mockClear()
    act(() => link.click())
    expect(onBeforeLogin).toHaveBeenCalledTimes(1)
    expect(login).toHaveBeenCalledWith('/en/route-planner?resume=save', 'unknown')
  })

  it('moves focus in and traps Tab in both directions', () => {
    setup()
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    const [first, last] = [dialog.querySelector('button')!, dialog.querySelector('a')!]
    expect(document.activeElement).toBe(first)
    last.focus()
    key('Tab')
    expect(document.activeElement).toBe(first)
    key('Tab', { shiftKey: true })
    expect(document.activeElement).toBe(last)
  })

  it('Escape closes and returns focus to the trigger', () => {
    const opener = setup()
    key('Escape')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('"Not now" closes and returns focus to the trigger', () => {
    const opener = setup()
    const notNow = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'signInSheet.notNow')!
    act(() => notNow.click())
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })
})
