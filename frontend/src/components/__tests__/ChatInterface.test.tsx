/** @vitest-environment jsdom */

import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChatInterface } from '../ChatInterface'

vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ language: 'uk' }),
}))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true

Element.prototype.scrollIntoView = vi.fn()

const mounted: Array<() => void> = []

afterEach(() => {
  for (const cleanup of mounted.splice(0)) cleanup()
})

describe('ChatInterface submission', () => {
  it('uses native form submission and reads the current DOM value', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onSendMessage = vi.fn()

    act(() => {
      root.render(
        <ChatInterface
          messages={[]}
          chatInput=""
          onChatInputChange={vi.fn()}
          onSendMessage={onSendMessage}
          isProcessing={false}
        />,
      )
    })
    mounted.push(() => {
      act(() => root.unmount())
      container.remove()
    })

    const input = container.querySelector('input')
    const form = container.querySelector('form')
    expect(input).not.toBeNull()
    expect(form).not.toBeNull()

    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set
    valueSetter?.call(input, 'Нововолинськ - Лісабон, 2 пасажира')

    act(() => {
      form?.dispatchEvent(new SubmitEvent('submit', {
        bubbles: true,
        cancelable: true,
      }))
    })

    expect(onSendMessage).toHaveBeenCalledWith(
      'Нововолинськ - Лісабон, 2 пасажира',
    )
  })

  it('does not submit when Enter only confirms an IME composition', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    const onSendMessage = vi.fn()

    act(() => {
      root.render(
        <ChatInterface
          messages={[]}
          chatInput="Нововолинськ"
          onChatInputChange={vi.fn()}
          onSendMessage={onSendMessage}
          isProcessing={false}
        />,
      )
    })
    mounted.push(() => {
      act(() => root.unmount())
      container.remove()
    })

    const input = container.querySelector('input')
    expect(input).not.toBeNull()

    act(() => {
      input?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        isComposing: true,
      }))
    })

    expect(onSendMessage).not.toHaveBeenCalled()
  })
})
