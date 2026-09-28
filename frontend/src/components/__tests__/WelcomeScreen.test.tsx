/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WelcomeScreen } from '../WelcomeScreen'

vi.mock('../AiPrivacyNote', () => ({ AiPrivacyNote: () => null }))
vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'en' }),
}))
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Dana Example' } }),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

const mounted: Array<() => void> = []
afterEach(() => {
  for (const cleanup of mounted.splice(0)) cleanup()
  vi.restoreAllMocks()
})

function render(props: Partial<React.ComponentProps<typeof WelcomeScreen>> = {}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const handlers = {
    onChatInputChange: vi.fn(),
    onSendMessage: vi.fn(),
    onManualClick: vi.fn(),
  }
  act(() => {
    root.render(
      <WelcomeScreen chatInput="" isProcessing={false} {...handlers} {...props} />,
    )
  })
  mounted.push(() => {
    act(() => root.unmount())
    container.remove()
  })
  return { container, ...handlers }
}

const exampleButton = (container: HTMLElement) =>
  [...container.querySelectorAll('button')].find(b => b.textContent === 'Kyiv to Lviv, 2 passengers')!

describe('WelcomeScreen', () => {
  it('shows the illustration as decoration and keeps the personalised greeting', () => {
    const { container } = render()
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('/images/planner-v1/ai-welcome.webp')
    expect(img.getAttribute('alt')).toBe('')
    expect(container.querySelector('h1')?.textContent).toBe('Where to next, Dana?')
  })

  it('uses native form submission and reads the current DOM value', () => {
    const { container, onSendMessage } = render()
    const input = container.querySelector('input')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      ?.call(input, 'Нововолинськ - Лісабон, 2 пасажира')
    act(() => {
      container.querySelector('form')!.dispatchEvent(
        new SubmitEvent('submit', { bubbles: true, cancelable: true }),
      )
    })
    expect(onSendMessage).toHaveBeenCalledWith('Нововолинськ - Лісабон, 2 пасажира')
  })

  it('fills an empty composer from an example without sending', () => {
    const { container, onChatInputChange, onSendMessage } = render()
    act(() => exampleButton(container).click())
    expect(onChatInputChange).toHaveBeenCalledWith('A trip from Kyiv to Lviv for 2 passengers')
    expect(onSendMessage).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(container.querySelector('input'))
  })

  it('keeps a non-empty draft unless the user confirms replacing it', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { container, onChatInputChange } = render({ chatInput: 'my own trip' })
    act(() => exampleButton(container).click())
    expect(confirm).toHaveBeenCalledOnce()
    expect(onChatInputChange).not.toHaveBeenCalled()

    confirm.mockReturnValue(true)
    act(() => exampleButton(container).click())
    expect(onChatInputChange).toHaveBeenCalledWith('A trip from Kyiv to Lviv for 2 passengers')
  })

  it('offers manual setup without sending a message', () => {
    const { container, onManualClick, onSendMessage } = render()
    const manual = [...container.querySelectorAll('button')].find(b => b.textContent === 'Or set it up manually')!
    act(() => manual.click())
    expect(onManualClick).toHaveBeenCalledOnce()
    expect(onSendMessage).not.toHaveBeenCalled()
  })
})
