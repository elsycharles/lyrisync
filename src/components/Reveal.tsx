import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Closing animation length; matches --dur in tokens.css. */
const CLOSE_MS = 200;

/** True when animations should be skipped (the user asks for less motion, or no CSS media at all). */
export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Shows `children` with a short expand, and collapses them before they go, so the rows
 * below slide instead of jumping. While collapsing, the old content is inert and hidden
 * from assistive technology (the next line's tools are already there).
 */
export function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  const [wasOpen, setWasOpen] = useState(open);
  const [closing, setClosing] = useState(false);
  const last = useRef<ReactNode>(null);
  if (open) last.current = children;

  // Decided while rendering, so the content never disappears for a frame before collapsing.
  if (open !== wasOpen) {
    setWasOpen(open);
    setClosing(!open && !prefersReducedMotion());
  }

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => setClosing(false), CLOSE_MS);
    return () => clearTimeout(timer);
  }, [closing]);

  if (!open && !closing) return null;
  return (
    <div className={`reveal${open ? '' : ' reveal--closing'}`} aria-hidden={open ? undefined : true} {...(open ? {} : { inert: '' })}>
      <div className="reveal__inner">{open ? children : last.current}</div>
    </div>
  );
}
