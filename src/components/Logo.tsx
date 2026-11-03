export function Logo() {
  return (
    <span className="logo">
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <rect x="0" y="6" width="2.6" height="6" rx="1.3" fill="#9B82FF" />
        <rect x="4.3" y="2" width="2.6" height="14" rx="1.3" fill="#9B82FF" />
        <rect x="8.6" y="4.5" width="2.6" height="9" rx="1.3" fill="#2DD4A7" />
        <rect x="12.9" y="7.5" width="2.6" height="3" rx="1.3" fill="#2DD4A7" />
      </svg>
      <span className="wordmark">
        Lyri<b>Sync</b>
      </span>
    </span>
  );
}
