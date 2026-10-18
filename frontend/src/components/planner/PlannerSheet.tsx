import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { ChevronDown, ChevronUp, Maximize2, Minimize2 } from 'lucide-react'

export type SheetSnap = 'peek' | 'half' | 'full'

const HEIGHT: Record<SheetSnap, string> = {
  peek: '140px',
  half: '65vh',
  full: '92vh',
}

interface PlannerSheetProps {
  snap: SheetSnap
  onSnapChange: (snap: SheetSnap) => void
  labels: { region: string; expand: string; collapse: string; full: string; half: string }
  /** Shown when collapsed (summary line, or quick search). */
  peek: ReactNode
  /** Pinned under the scrolling body when expanded (the AI composer). */
  footer?: ReactNode
  children: ReactNode
}

/**
 * Mobile bottom sheet with three snap points (peek / half / full). Esc collapses
 * it and returns focus to the trigger; the bottom safe-area inset is respected.
 * Drag-to-resize is intentionally not implemented: the buttons are the keyboard
 * and screen-reader path, and a drag gesture can be layered on later.
 */
export function PlannerSheet({ snap, onSnapChange, labels, peek, footer, children }: PlannerSheetProps) {
  const contentId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const expanded = snap !== 'peek'

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    // Portaled dialogs bubble through React; only react to keys from inside the sheet.
    if (e.key !== 'Escape' || !expanded || e.defaultPrevented) return
    if (!e.currentTarget.contains(e.target as Node)) return
    e.stopPropagation()
    onSnapChange('peek')
    triggerRef.current?.focus()
  }

  return (
    <section
      role="region"
      aria-label={labels.region}
      onKeyDown={onKeyDown}
      className="glass-sheet absolute bottom-0 left-0 right-0 flex flex-col transition-[height] duration-300 ease-in-out"
      style={{ height: HEIGHT[snap], zIndex: 40, boxSizing: 'content-box', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex flex-shrink-0 items-center gap-1 px-2">
        <button
          ref={triggerRef}
          type="button"
          onClick={() => onSnapChange(expanded ? 'peek' : 'half')}
          className="flex min-h-11 flex-1 flex-col items-center justify-center pt-1.5 pb-1"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          aria-expanded={expanded}
          aria-controls={contentId}
        >
          <span className="mb-1 h-1 w-10 rounded-full" style={{ background: 'var(--nav-border)' }} aria-hidden="true" />
          <span className="sheet-trigger-pill flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold shadow-lg">
            {expanded ? (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronUp className="h-4 w-4 sheet-chevron" aria-hidden="true" />
            )}
            {expanded ? labels.collapse : labels.expand}
          </span>
        </button>
        {expanded && (
          <button
            type="button"
            onClick={() => onSnapChange(snap === 'full' ? 'half' : 'full')}
            aria-label={snap === 'full' ? labels.half : labels.full}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full"
            style={{ color: 'var(--nav-text-secondary)' }}
          >
            {snap === 'full' ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
          </button>
        )}
      </div>

      <div id={contentId} className="flex min-h-0 flex-1 flex-col">
        {expanded ? (
          <>
            <div className="flex-1 overflow-y-auto">
              <div className="p-4 space-y-5">{children}</div>
            </div>
            {footer && (
              <div className="flex-shrink-0 p-3" style={{ borderTop: '1px solid var(--nav-border)' }}>
                {footer}
              </div>
            )}
          </>
        ) : (
          peek
        )}
      </div>
    </section>
  )
}
