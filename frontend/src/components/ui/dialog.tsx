import React, { cloneElement, createContext, isValidElement, useContext, useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';

// Title/description ids flow from Dialog to its parts, so the dialog is
// announced with its name and description without every caller wiring ids.
const DialogIdsContext = createContext<{ titleId: string; descriptionId: string } | null>(null);

type Clickable = { onClick?: (e: React.MouseEvent) => void };

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Open order determines which modal owns keyboard handling and focus restoration.
const dialogStack: Array<{ panel: HTMLDivElement; restoreTarget: HTMLElement | null }> = [];

// Ref-counted so nested/multiple open dialogs keep the page locked until the last closes.
let scrollLocks = 0
let savedOverflow = ''
function lockScroll() {
  if (scrollLocks++ === 0) {
    savedOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  return () => {
    if (--scrollLocks === 0) document.body.style.overflow = savedOverflow
  }
}

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
  children,
  role = 'dialog'
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  /** 'alertdialog' for messages that interrupt the user and need a response. */
  role?: 'dialog' | 'alertdialog';
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

  useEffect(() => (open ? lockScroll() : undefined), [open]);

  // Modal behavior: focus moves in on open, Escape closes, Tab cycles inside,
  // and focus returns to whatever opened the dialog.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (!panel) return;
    const entry = { panel, restoreTarget: previouslyFocused };
    dialogStack.push(entry);
    const focusables = () =>
      panel ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
    (focusables()[0] ?? panel)?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (dialogStack[dialogStack.length - 1] !== entry) return;
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
      const index = dialogStack.indexOf(entry);
      const wasTopmost = index === dialogStack.length - 1;
      if (index !== -1) {
        // If a lower layer disappears first, its opener is the surviving
        // destination for upper layers whose own opener was inside that layer.
        for (const above of dialogStack.slice(index + 1)) {
          if (above.restoreTarget && (panel.contains(above.restoreTarget) || !above.restoreTarget.isConnected)) {
            above.restoreTarget = entry.restoreTarget;
          }
        }
        dialogStack.splice(index, 1);
      }
      if (wasTopmost && entry.restoreTarget?.isConnected) entry.restoreTarget.focus();
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

      {/* Only render dialog content when open. Portaled to <body> so a
          "fixed" overlay isn't confined to an ancestor with a transform or
          backdrop-filter (our .glass-panel cards set one), which would
          otherwise clip the dialog to the card instead of the viewport. */}
      {open && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />
          <div
            ref={panelRef}
            role={role}
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
        </div>,
        document.body,
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
