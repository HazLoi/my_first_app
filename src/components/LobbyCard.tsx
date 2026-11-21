import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import './overlay.css';

export type CardTheme = 'green' | 'gold' | 'red' | 'violet';

interface LobbyCardProps {
  title: string;
  subtitle: string;
  theme: CardTheme;
  icon: ReactNode;
  /** Góc nghiêng mặc định (độ) khi chưa tương tác. */
  restTilt?: number;
  badge?: string;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
}

const MAX_TILT = 14;

/** Thẻ lớn ở sảnh, nghiêng 3D theo con trỏ/ngón tay (hover hoặc chạm). */
export function LobbyCard({ title, subtitle, theme, icon, restTilt = 0, badge, disabled, busy, onClick }: LobbyCardProps) {
  const ref = useRef<HTMLButtonElement>(null);

  const setTilt = (rx: number, ry: number, mx: number, my: number): void => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--rx', `${rx}deg`);
    el.style.setProperty('--ry', `${ry}deg`);
    el.style.setProperty('--mx', `${mx}%`);
    el.style.setProperty('--my', `${my}%`);
    el.style.setProperty('--px', `${(mx - 50) / 50}`);
    el.style.setProperty('--py', `${(my - 50) / 50}`);
  };

  const onMove = (event: PointerEvent<HTMLButtonElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    setTilt((0.5 - y) * 2 * MAX_TILT, (x - 0.5) * 2 * MAX_TILT, x * 100, y * 100);
    ref.current?.classList.add('is-active');
  };

  const reset = (): void => {
    ref.current?.classList.remove('is-active');
    setTilt(0, 0, 50, 30);
  };

  return (
    <button
      ref={ref}
      type="button"
      className={`lobby-card lobby-card-${theme} ${disabled ? 'is-disabled' : ''}`}
      style={{ '--rest': `${restTilt}deg` } as CSSProperties}
      disabled={disabled || busy}
      onPointerMove={onMove}
      onPointerDown={onMove}
      onPointerLeave={reset}
      onPointerCancel={reset}
      onPointerUp={(event) => {
        if (event.pointerType !== 'mouse') reset();
      }}
      onClick={onClick}
    >
      <span className="lobby-card-sheen" aria-hidden="true" />
      <span className="lobby-card-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="lobby-card-title">{title}</span>
      <span className="lobby-card-sub">{subtitle}</span>
      {badge ? <span className="lobby-card-badge">{badge}</span> : null}
      {busy ? <span className="lobby-card-busy" aria-hidden="true" /> : null}
    </button>
  );
}
