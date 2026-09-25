import React, { cloneElement, createContext, isValidElement, useContext, useEffect, useId, useRef } from 'react';

// Title/description ids flow from Dialog to its parts, so the dialog is
// announced with its name and description without every caller wiring ids.
const DialogIdsContext = createContext<{ titleId: string; descriptionId: string } | null>(null);

type Clickable = { onClick?: (e: React.MouseEvent) => void };

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
    const child = children as React.ReactElement<Clickable>;
    return cloneElement(child, {
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        onClick?.();
        // Call original onClick if it exists
        const originalOnClick = child.props.onClick;
        originalOnClick?.(e);
      }
    });
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

  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  // Modal behavior: focus moves in on open, Escape closes, Tab cycles inside,
  // and focus returns to whatever opened the dialog.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () =>
      panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    (focusables()[0] ?? panel)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onOpenChangeRef.current(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panel?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  // Clone trigger with onClick handler
  const triggerWithHandler = trigger && isValidElement(trigger)
    ? cloneElement(trigger as React.ReactElement<Clickable>, {
        onClick: () => onOpenChange(true)
      })
    : null;

  return (
    <>
      {/* Always render the trigger */}
      {triggerWithHandler}

      {/* Only render dialog content when open */}
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descriptionId}
            tabIndex={-1}
            className="relative z-[100] outline-none"
          >
            <DialogIdsContext.Provider value={{ titleId, descriptionId }}>
              {content}
            </DialogIdsContext.Provider>
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
    <div className={`glass-modal rounded-lg p-6 max-w-lg w-full ${className}`}>
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
  const ids = useContext(DialogIdsContext);
  return (
    <h2 id={ids?.titleId} className={`text-lg font-semibold leading-none tracking-tight ${className}`}>
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
  const ids = useContext(DialogIdsContext);
  return (
    <p id={ids?.descriptionId} className={`text-sm text-gray-500 dark:text-gray-400 ${className}`}>
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
