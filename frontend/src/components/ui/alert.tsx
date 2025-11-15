import React from 'react';

interface AlertProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'destructive';
}

export function Alert({ children, className = '', variant = 'default' }: AlertProps) {
  const variantStyles = {
    default: 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-900 dark:text-blue-100',
    destructive: 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700 text-red-900 dark:text-red-100'
  };

  return (
    <div className={`relative w-full rounded-lg border p-4 ${variantStyles[variant]} ${className}`}>
      {children}
    </div>
  );
}

export function AlertDescription({
  children,
  className = ''
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`text-sm ${className}`}>
      {children}
    </div>
  );
}

export function AlertTitle({
  children,
  className = ''
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h5 className={`mb-1 font-medium leading-none tracking-tight ${className}`}>
      {children}
    </h5>
  );
}
