import React, { cloneElement, isValidElement } from 'react';

export function DialogTrigger({
  children,
  asChild = false,
  onClick
}: {
  children: React.ReactNode;
  asChild?: boolean;
  onClick?: () => void;
}) {
  if (asChild && isValidElement(children)) {
    const child = children as React.ReactElement<any>;
    return cloneElement(child, {
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        onClick?.();
        // Call original onClick if it exists
        const originalOnClick = child.props.onClick;
        originalOnClick?.(e);
      }
    } as any);
  }

  return (
    <button onClick={onClick} type="button">
      {children}
    </button>
  );
}

export function Dialog({
  open,
  onOpenChange,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  // Separate trigger from content
  const childArray = React.Children.toArray(children);
  const trigger = childArray.find(
    (child) => isValidElement(child) && child.type === DialogTrigger
  );
  const content = childArray.filter(
    (child) => !isValidElement(child) || child.type !== DialogTrigger
  );

  // Clone trigger with onClick handler
  const triggerWithHandler = trigger && isValidElement(trigger)
    ? cloneElement(trigger as React.ReactElement<any>, {
        onClick: () => onOpenChange(true)
      } as any)
    : null;

  return (
    <>
      {/* Always render the trigger */}
      {triggerWithHandler}

      {/* Only render dialog content when open */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />
          <div className="relative z-50">
            {content}
          </div>
        </div>
      )}
    </>
  );
}

export function DialogContent({
  children,
  className = ''
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-lg w-full ${className}`}>
      {children}
    </div>
  );
}

export function DialogHeader({
  children,
  className = ''
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col space-y-1.5 text-center sm:text-left ${className}`}>
      {children}
    </div>
  );
}

export function DialogTitle({
  children,
  className = ''
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2 className={`text-lg font-semibold leading-none tracking-tight ${className}`}>
      {children}
    </h2>
  );
}

export function DialogDescription({
  children,
  className = ''
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <p className={`text-sm text-gray-500 dark:text-gray-400 ${className}`}>
      {children}
    </p>
  );
}

export function DialogFooter({
  children,
  className = ''
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 mt-4 ${className}`}>
      {children}
    </div>
  );
}
