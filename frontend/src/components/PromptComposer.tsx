import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { Loader2, Send } from 'lucide-react'
import { useLanguage } from '../contexts/LanguageContext'
import { getTranslation, type Language } from '../i18n/routePlanner'

const LINE = 24 // px, matches leading-6
const MAX_HEIGHT = LINE * 5 + 24 // 5 lines + vertical padding

interface PromptComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: (text: string) => void
  placeholder: string
  /** Request in flight: field and button locked, spinner shown. */
  isProcessing: boolean
  /** Rate limited: typing stays possible, sending does not. */
  sendDisabled?: boolean
  autoFocus?: boolean
  /** Draws attention to the send button (e.g. after an example filled the box). */
  emphasizeSend?: boolean
}

/** Auto-growing 2-5 line prompt box. Enter sends, Shift+Enter inserts a newline. */
export const PromptComposer = forwardRef<HTMLTextAreaElement, PromptComposerProps>(function PromptComposer(
  { value, onChange, onSubmit, placeholder, isProcessing, sendDisabled = false, autoFocus, emphasizeSend = false },
  ref,
) {
  const { language } = useLanguage()
  const tr = getTranslation(language as Language)
  const area = useRef<HTMLTextAreaElement>(null)
  useImperativeHandle(ref, () => area.current!)

  useLayoutEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`
  }, [value])

  // Keep the field above the on-screen keyboard (visualViewport shrinks when it opens).
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const keep = () => {
      if (document.activeElement === area.current) area.current?.scrollIntoView?.({ block: 'nearest' })
    }
    vv.addEventListener('resize', keep)
    return () => vv.removeEventListener('resize', keep)
  }, [])

  const submit = () => {
    if (isProcessing || sendDisabled) return
    // Read the DOM value, not state: autofill/IME can update the field without a React change event.
    onSubmit(area.current?.value ?? value)
  }

  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => { e.preventDefault(); submit() }}
    >
      <label htmlFor="ai-prompt" className="sr-only">{tr.chat.inputLabel}</label>
      <textarea
        id="ai-prompt"
        ref={area}
        name="aiPrompt"
        rows={2}
        value={value}
        placeholder={placeholder}
        enterKeyHint="send"
        autoFocus={autoFocus}
        disabled={isProcessing}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
        className="flex-1 min-w-0 resize-none text-base leading-6 disabled:opacity-60"
        style={{
          minHeight: 88,
          maxHeight: MAX_HEIGHT,
          padding: '12px 14px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--glass-input)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
        }}
      />
      <button
        type="submit"
        aria-label={tr.planner.sendMessage}
        disabled={isProcessing || sendDisabled}
        className={`h-11 w-11 flex items-center justify-center rounded-lg flex-shrink-0 disabled:opacity-40${emphasizeSend ? ' prompt-send-emphasis' : ''}`}
        style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}
      >
        {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
      </button>
    </form>
  )
})
