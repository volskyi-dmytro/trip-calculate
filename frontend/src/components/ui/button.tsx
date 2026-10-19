import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'destructive';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

export function Button({
  children,
  variant = 'default',
  size = 'default',
  className = '',
  ...props
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50';

  const variantStyles = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90',
    outline: 'border border-edge bg-transparent hover:bg-inset',
    ghost: 'hover:bg-inset hover:text-content',
    destructive: 'bg-danger-soft text-white hover:bg-danger-soft'
  };

  const sizeStyles = {
    default: 'min-h-11 px-4 py-2',
    sm: 'min-h-11 px-3 text-sm',
    lg: 'h-12 px-8',
    icon: 'h-11 w-11'
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
