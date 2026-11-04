/** Small line icons (16 px grid, currentColor). Decorative: always aria-hidden. */
interface IconProps {
  size?: number;
  className?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export function SunIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="8" cy="8" r="3" />
      <path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" />
    </svg>
  );
}

export function MoonIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1Z" />
    </svg>
  );
}

export function CheckIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={2}>
      <path d="M3.5 8.4 6.6 11.4 12.5 4.8" />
    </svg>
  );
}

export function MusicIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M6 12.4V3.6l7-1.4v8.4" />
      <circle cx="4.3" cy="12.4" r="1.7" fill="currentColor" stroke="none" />
      <circle cx="11.3" cy="10.6" r="1.7" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function UploadIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M8 10.5V2.5M5 5.4 8 2.5l3 2.9M2.5 10.5v1.6c0 .8.7 1.4 1.5 1.4h8c.8 0 1.5-.6 1.5-1.4v-1.6" />
    </svg>
  );
}

export function LockIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="3" y="7" width="10" height="7" rx="1.6" />
      <path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7" />
    </svg>
  );
}

export function InfinityIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M8 8c-1.3-1.7-2.4-2.6-3.6-2.6a2.6 2.6 0 0 0 0 5.2C5.6 10.6 6.7 9.7 8 8Zm0 0c1.3 1.7 2.4 2.6 3.6 2.6a2.6 2.6 0 0 0 0-5.2C10.4 5.4 9.3 6.3 8 8Z" />
    </svg>
  );
}

export function GlobeIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c1.7 1.7 2.5 3.7 2.5 6S9.7 12.3 8 14C6.3 12.3 5.5 10.3 5.5 8S6.3 3.7 8 2Z" />
    </svg>
  );
}

export function DownloadIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M8 2.5v8M5 7.6 8 10.5l3-2.9M2.5 10.5v1.6c0 .8.7 1.4 1.5 1.4h8c.8 0 1.5-.6 1.5-1.4v-1.6" />
    </svg>
  );
}

export function ChipIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <rect x="4" y="4" width="8" height="8" rx="1.4" />
      <path d="M6.5 1.8V4M9.5 1.8V4M6.5 12v2.2M9.5 12v2.2M1.8 6.5H4M1.8 9.5H4M12 6.5h2.2M12 9.5h2.2" />
    </svg>
  );
}

export function TargetIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <circle cx="8" cy="8" r="5.5" />
      <circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none" />
      <path d="M8 1v2.2M8 12.8V15M1 8h2.2M12.8 8H15" />
    </svg>
  );
}

export function PlayIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5 3.2v9.6L12.6 8Z" fill="currentColor" />
    </svg>
  );
}

export function UndoIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M5.5 4 2.5 7l3 3" />
      <path d="M2.8 7h6.7a4 4 0 0 1 0 8H7" />
    </svg>
  );
}

export function FileIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M9.5 1.8H4.6c-.8 0-1.4.6-1.4 1.4v9.6c0 .8.6 1.4 1.4 1.4h6.8c.8 0 1.4-.6 1.4-1.4V5.1Z" />
      <path d="M9.4 1.9v3.3h3.3" />
    </svg>
  );
}

export function PrevLineIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M3.5 3v10" />
      <path d="M12.5 3.4v9.2L5.8 8Z" fill="currentColor" />
    </svg>
  );
}

export function NextLineIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M12.5 3v10" />
      <path d="M3.5 3.4v9.2L10.2 8Z" fill="currentColor" />
    </svg>
  );
}

export function PencilIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M10.6 2.9a1.6 1.6 0 0 1 2.3 0l.2.2a1.6 1.6 0 0 1 0 2.3L6.2 12.3 3 13l.7-3.2Z" />
      <path d="M9.4 4.1l2.5 2.5" />
    </svg>
  );
}

export function PlusIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

export function TrashIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base(size)} className={className}>
      <path d="M2.8 4.3h10.4" />
      <path d="M6.3 4.3V3c0-.5.4-.9.9-.9h1.6c.5 0 .9.4.9.9v1.3" />
      <path d="M4.2 4.3l.6 8.3c.1.8.7 1.4 1.5 1.4h3.4c.8 0 1.4-.6 1.5-1.4l.6-8.3" />
      <path d="M6.7 7v4.2M9.3 7v4.2" />
    </svg>
  );
}
