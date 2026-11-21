import { useState } from 'react';
import { Modal } from '@/components/Modal';
import { t } from '@/i18n';

interface SharedCodeModalProps {
  code: string;
  onEnter(): void;
}

/** Hiện mã bàn riêng tư vừa tạo. Người chơi đã ở trong bàn nên chỉ có nút "Vào bàn". */
export function SharedCodeModal({ code, onEnter }: SharedCodeModalProps) {
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    void navigator.clipboard?.writeText(code).then(
      () => setCopied(true),
      () => undefined,
    );
  };
  return (
    <Modal title={t('lobby.shared.title')} width={820}>
      <p className="modal-text">{t('lobby.shared.text')}</p>
      <div className="share-code" aria-label={code}>
        {code}
      </div>
      <div style={{ display: 'flex', gap: 20 }}>
        <button type="button" className="btn modal-btn" style={{ flex: 1 }} onClick={copy}>
          {copied ? t('lobby.shared.copied') : t('lobby.shared.copy')}
        </button>
        <button type="button" className="btn btn-green modal-btn" style={{ flex: 1 }} onClick={onEnter}>
          {t('lobby.shared.enter')}
        </button>
      </div>
    </Modal>
  );
}
