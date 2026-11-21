import type { CSSProperties } from 'react';

export function CoinIcon({ size = 28, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={{ flex: 'none', ...style }}>
      <circle cx="16" cy="16" r="14" fill="#f5c451" stroke="#8a5a00" strokeWidth="2" />
      <circle cx="16" cy="16" r="9.5" fill="none" stroke="#b7791f" strokeWidth="1.8" />
      <path d="M16 9v14M12 12.5c0-1.7 1.8-2.5 4-2.5s4 .8 4 2.4-2 2.2-4 2.6-4 1-4 2.8 1.8 2.5 4 2.5 4-.9 4-2.4" fill="none" stroke="#8a5a00" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function CrownIcon({ size = 32, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={{ flex: 'none', ...style }}>
      <path d="M3 24 L1.5 9 L10 15 L16 4 L22 15 L30.5 9 L29 24 Z" fill="#ffd75e" stroke="#7a4b00" strokeWidth="2" strokeLinejoin="round" />
      <rect x="3" y="24.5" width="26" height="4" rx="1.5" fill="#f5c451" stroke="#7a4b00" strokeWidth="2" />
      <circle cx="16" cy="19" r="2" fill="#d62839" />
    </svg>
  );
}
