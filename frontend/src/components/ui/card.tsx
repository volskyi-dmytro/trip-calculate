import React from 'react';

export function Card({
  children,
  className = '',
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'className' | 'children'>) {
  return (
    <div {...rest} className={`rounded-lg glass-panel ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className = ''
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col space-y-1.5 p-6 ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className = ''
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h3 className={`text-2xl font-semibold leading-none tracking-tight text-content ${className}`}>
      {children}
    </h3>
  );
}

export function CardContent({
  children,
  className = ''
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`p-6 pt-0 ${className}`}>
      {children}
    </div>
  );
}

export function CardDescription({
  children,
  className = ''
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={`text-sm text-caption ${className}`}>
      {children}
    </p>
  );
}
