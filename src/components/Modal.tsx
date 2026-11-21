import { useEffect, type ReactNode } from 'react';
import { t } from '@/i18n';
import './overlay.css';

interface ModalProps {
  title: string;
  children: ReactNode;
  /** Không truyền = hộp thoại bắt buộc (không có nút đóng, bấm nền/Esc không đóng). */
  onClose?: () => void;
  width?: number;
}

/** Hộp thoại dùng chung (đặt trong khung có position:relative/absolute, ví dụ HUD của Stage). */
export function Modal({ title, children, onClose, width = 760 }: ModalProps) {
  useEffect(() => {
    if (!onClose) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="hud-interactive modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="glass modal-card" style={{ width }} onClick={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          {onClose ? (
            <button type="button" className="btn btn-round modal-x" onClick={onClose} aria-label={t('common.close')}>
              ✕
            </button>
          ) : null}
        </div>
        {children}
      </div>
    </div>
  );
}
