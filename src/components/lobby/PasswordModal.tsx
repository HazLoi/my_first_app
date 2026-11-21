import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/Modal';
import { t } from '@/i18n';
import { PASSWORD_MAX } from '@/lib/lobbyLogic';

interface PasswordModalProps {
  busy: boolean;
  onSubmit(password: string): void;
  onReturnToTable(): void;
  onClose(): void;
}

export function PasswordModal({ busy, onSubmit, onReturnToTable, onClose }: PasswordModalProps) {
  const [password, setPassword] = useState('');
  const submit = (event: FormEvent): void => {
    event.preventDefault();
    onSubmit(password);
  };
  return (
    <Modal title={t('lobby.password.title')} onClose={onClose} width={800}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div>
          <label className="modal-label" htmlFor="table-password">
            {t('lobby.password.label')}
          </label>
          <input
            id="table-password"
            className="modal-field"
            type="password"
            autoFocus
            autoComplete="off"
            maxLength={PASSWORD_MAX}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-green modal-btn" disabled={busy}>
          {t('lobby.password.submit')}
        </button>
        <button type="button" className="btn modal-btn" disabled={busy} onClick={onReturnToTable}>
          {t('lobby.returnToTable')}
        </button>
      </form>
    </Modal>
  );
}
