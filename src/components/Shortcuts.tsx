export interface Shortcut {
  keys: string[];
  label: string;
}

/** Keyboard shortcuts as key caps. Hidden on touch screens (see .hint--keyboard). */
export function Shortcuts({ items }: { items: Shortcut[] }) {
  return (
    <ul className="shortcuts hint--keyboard">
      {items.map((item) => (
        <li key={item.label}>
          {item.keys.map((k) => (
            <kbd key={k}>{k}</kbd>
          ))}
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

/** "⌘" on Apple platforms, "Ctrl" elsewhere. */
export function modKey(ctrlLabel: string): string {
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? '';
  return /mac|iphone|ipad/i.test(platform) ? '⌘' : ctrlLabel;
}
