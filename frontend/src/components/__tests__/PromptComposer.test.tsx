/** @vitest-environment jsdom */

import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WelcomeScreen } from '../WelcomeScreen'
import { LimitBanner } from '../LimitBanner'
import { PromptComposer } from '../PromptComposer'
import { AgentProgress } from '../AgentProgress'

vi.mock('../AiPrivacyNote', () => ({ AiPrivacyNote: () => null }))
vi.mock('../../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'en' }) }))
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { name: 'Dana Example' } }) }))
;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const cleanups: Array<() => void> = []
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
  vi.useRealTimers()
})

function mount(node: React.ReactNode) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(node))
  cleanups.push(() => { act(() => root.unmount()); container.remove() })
  return container
}

const setValue = (el: HTMLTextAreaElement, v: string) => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, v)
  act(() => { el.dispatchEvent(new Event('input', { bubbles: true })) })
}

/** Parent that behaves like RoutePlanner: a 429 keeps the draft and shows the banner. */
function Harness({ retryAt }: { retryAt: Date | null }) {
  const [draft, setDraft] = useState('')
  const [limit, setLimit] = useState<{ retryAt: Date | null } | null>(null)
  return (
    <WelcomeScreen
      chatInput={draft}
      onChatInputChange={setDraft}
      onSendMessage={() => setLimit({ retryAt })}
      isProcessing={false}
      onManualClick={() => {}}
      limit={limit}
      onLimitExpire={() => setLimit(null)}
    />
  )
}

describe('AI composer', () => {
  it('keeps the draft after a rate limit, shows a live countdown and re-enables send at zero', () => {
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'))
    const container = mount(<Harness retryAt={new Date('2026-01-01T12:01:30Z')} />)
    const ta = container.querySelector('textarea')!
    setValue(ta, 'Kyiv to Lviv')
    act(() => { container.querySelector('form')!.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true })) })

    expect(ta.value).toBe('Kyiv to Lviv')
    const banner = container.querySelector('[role="status"]')!
    expect(banner.textContent).toContain('in 2 minutes')
    expect(banner.querySelector('time')!.getAttribute('datetime')).toBe('2026-01-01T12:01:30.000Z')
    const send = container.querySelector<HTMLButtonElement>('button[type="submit"]')!
    expect(send.disabled).toBe(true)
    expect(ta.disabled).toBe(false) // still editable

    act(() => { vi.advanceTimersByTime(40_000) })
    expect(container.querySelector('[role="status"]')!.textContent).toContain('in 50 seconds')

    act(() => { vi.advanceTimersByTime(50_000) })
    expect(container.querySelector('[role="status"]')).toBeNull()
    expect(send.disabled).toBe(false)
    expect(ta.value).toBe('Kyiv to Lviv')
  })

  it('falls back to copy without a countdown when retryAt is unknown', () => {
    const container = mount(<LimitBanner retryAt={null} onExpire={() => {}} />)
    expect(container.querySelector('time')).toBeNull()
    expect(container.textContent).toContain('try the AI again')
  })

  it('Enter sends, Shift+Enter does not', () => {
    const onSubmit = vi.fn()
    const container = mount(<PromptComposer value="hi" onChange={() => {}} onSubmit={onSubmit} placeholder="p" isProcessing={false} />)
    const ta = container.querySelector('textarea')!
    expect(ta.getAttribute('enterkeyhint')).toBe('send')
    act(() => { ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true })) })
    expect(onSubmit).not.toHaveBeenCalled()
    act(() => { ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })) })
    expect(onSubmit).toHaveBeenCalledWith('hi')
  })

  it('example chip fills the full wrapped sentence, focuses the textarea and does not send', () => {
    const onSend = vi.fn()
    const Wrap = () => {
      const [v, setV] = useState('')
      return <WelcomeScreen chatInput={v} onChatInputChange={setV} onSendMessage={onSend} isProcessing={false} onManualClick={() => {}} />
    }
    const container = mount(<Wrap />)
    const chip = [...container.querySelectorAll('button')].find(b => b.textContent === 'Kyiv to Lviv, 2 passengers')!
    act(() => chip.click())
    const ta = container.querySelector('textarea')!
    expect(ta.value).toBe('A trip from Kyiv to Lviv for 2 passengers')
    expect(document.activeElement).toBe(ta)
    expect(onSend).not.toHaveBeenCalled()
  })

  it('shows progress as a labelled status region with state text and a skeleton', () => {
    const container = mount(<AgentProgress doneStages={['route']} degraded={false} />)
    const status = container.querySelector('[role="status"]')!
    expect(status.getAttribute('aria-live')).toBe('polite')
    expect(status.textContent).toContain('(done)')
    expect(status.textContent).toContain('(in progress)')
    expect(status.querySelector('.agent-progress-skeleton')).not.toBeNull()
  })

  it('welcome screen has exactly one h1', () => {
    const container = mount(<WelcomeScreen chatInput="" onChatInputChange={() => {}} onSendMessage={() => {}} isProcessing={false} onManualClick={() => {}} />)
    expect(container.querySelectorAll('h1')).toHaveLength(1)
  })
})
