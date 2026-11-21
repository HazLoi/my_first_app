import { t } from '@/i18n';

/** Logo ZingPlay / Xập Xám tự vẽ bằng SVG (3 lá bài xòe + chữ). */
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`auth-logo ${compact ? 'is-compact' : ''}`}>
      <svg viewBox="0 0 200 150" className="auth-logo-mark" aria-hidden="true">
        <defs>
          <linearGradient id="zp-gold" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff3b0" />
            <stop offset="0.55" stopColor="#f5c451" />
            <stop offset="1" stopColor="#c27a0a" />
          </linearGradient>
          <linearGradient id="zp-card" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#d9e2ff" />
          </linearGradient>
          <radialGradient id="zp-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#7c5cff" stopOpacity="0.75" />
            <stop offset="1" stopColor="#7c5cff" stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="100" cy="80" rx="98" ry="70" fill="url(#zp-glow)" />
        <g transform="translate(100 88)">
          <g transform="rotate(-24) translate(-34 -62)">
            <rect width="68" height="96" rx="9" fill="url(#zp-card)" stroke="#1e1b4b" strokeWidth="3" />
            <text x="9" y="30" fontSize="26" fontWeight="800" fill="#dc2626" fontFamily="sans-serif">♥</text>
            <text x="34" y="74" fontSize="38" textAnchor="middle" fill="#dc2626" fontFamily="sans-serif">♥</text>
          </g>
          <g transform="rotate(24) translate(-34 -62)">
            <rect width="68" height="96" rx="9" fill="url(#zp-card)" stroke="#1e1b4b" strokeWidth="3" />
            <text x="9" y="30" fontSize="26" fontWeight="800" fill="#0f172a" fontFamily="sans-serif">♣</text>
            <text x="34" y="74" fontSize="38" textAnchor="middle" fill="#0f172a" fontFamily="sans-serif">♣</text>
          </g>
          <g transform="translate(-36 -70)">
            <rect width="72" height="102" rx="10" fill="url(#zp-card)" stroke="#f5c451" strokeWidth="4" />
            <text x="10" y="32" fontSize="28" fontWeight="800" fill="#0f172a" fontFamily="sans-serif">♠</text>
            <text x="36" y="76" fontSize="48" textAnchor="middle" fill="#0f172a" fontFamily="sans-serif">♠</text>
          </g>
        </g>
        <path d="M30 128h140" stroke="url(#zp-gold)" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <div className="auth-logo-text">
        <span className="auth-logo-name">{t('app.name')}</span>
        <span className="auth-logo-title">{t('app.title')}</span>
        <span className="auth-logo-tag">{t('auth.tagline')}</span>
      </div>
    </div>
  );
}
