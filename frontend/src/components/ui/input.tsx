import React from 'react';

// ComponentProps (not InputHTMLAttributes) so React 19's ref-as-prop reaches <input>.
type InputProps = React.ComponentProps<'input'>;

export function Input({ className = '', ...props }: InputProps) {
  return (
    <input
      className={`flex h-11 md:h-10 w-full rounded-md border border-edge bg-[var(--glass-input)] text-content px-3 py-2 text-sm ring-offset-surface file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-caption focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}
