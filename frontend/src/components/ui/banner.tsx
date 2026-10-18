import type { ReactNode } from 'react'
import { AlertCircle, AlertTriangle, Info } from 'lucide-react'

type Variant = 'info' | 'warning' | 'error'

const STYLE: Record<Variant, { bg: string; fg: string; Icon: typeof Info }> = {
  info: { bg: 'var(--info-soft)', fg: 'var(--info)', Icon: Info },
  warning: { bg: 'var(--warning-soft)', fg: 'var(--warning)', Icon: AlertTriangle },
  error: { bg: 'var(--danger-soft)', fg: 'var(--danger)', Icon: AlertCircle },
}

/** Inline, non-blocking message. Text stays --text; only the icon carries the variant color. */
export function Banner({ variant = 'info', role, className = '', children }: {
  variant?: Variant
  role?: 'status' | 'alert'
  className?: string
  children: ReactNode
}) {
  const { bg, fg, Icon } = STYLE[variant]
  return (
    <div
      role={role ?? (variant === 'error' ? 'alert' : 'status')}
      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${className}`}
      style={{ background: bg, color: 'var(--text)' }}
    >
      <Icon className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: fg }} aria-hidden="true" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
