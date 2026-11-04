import { useEffect, type KeyboardEvent as ReactKeyboardEvent } from 'react';

/** True when a key press should be left to the focused element (typing, buttons, sliders). */
export function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'SUMMARY', 'A'].includes(target.tagName);
}

/**
 * True when keys go to a field (text, number, slider…), so letter and arrow shortcuts must
 * stay out of the way. Checkboxes and buttons are not fields: after ticking a line, the
 * shortcuts still work.
 */
export function isTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLInputElement) return !['checkbox', 'button', 'submit', 'reset'].includes(target.type);
  return target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

/** Space plays/pauses, unless the user is typing or on a control. */
export function useSpaceToggle(toggle: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isInteractiveTarget(e.target)) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);
}

/**
 * Props for a container (a line list) in which Space stays play/pause even when one of its
 * buttons has the focus, instead of clicking that button again. Fields and checkboxes keep
 * their own Space.
 */
export function spaceToggleProps(toggle: () => void) {
  const handles = (e: ReactKeyboardEvent) => e.code === 'Space' && !(e.target instanceof HTMLInputElement) && !isTextField(e.target);
  return {
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (!handles(e)) return;
      e.preventDefault();
      if (!e.repeat) toggle();
    },
    onKeyUp: (e: ReactKeyboardEvent) => {
      if (handles(e)) e.preventDefault();
    },
  };
}
