import { useState, type FormEvent } from 'react';
import { Modal } from '@/components/Modal';
import { t } from '@/i18n';
import { PASSWORD_MAX, ROOM_CODE_LENGTH, isValidRoomCode, normalizeRoomCode } from '@/lib/lobbyLogic';

interface JoinFriendModalProps {
  busy: boolean;
  onJoin(code: string, password?: string): void;
  onCreatePrivate(): void;
  onReturnToTable(): void;
  onClose(): void;
}

/** "Chơi với bạn": nhập mã bàn (+ mật khẩu nếu có) hoặc tạo bàn riêng tư. */
export function JoinFriendModal({ busy, onJoin, onCreatePrivate, onReturnToTable, onClose }: JoinFriendModalProps) {
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [invalid, setInvalid] = useState(false);

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!isValidRoomCode(code)) {
      setInvalid(true);
      return;
    }
    onJoin(code, password || undefined);
  };

  return (
    <Modal title={t('lobby.joinFriend.title')} onClose={onClose} width={900}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div>
          <label className="modal-label" htmlFor="join-code">
            {t('lobby.joinFriend.code')}
          </label>
          <input
            id="join-code"
            className="modal-field"
            style={{ letterSpacing: '0.4em', textTransform: 'uppercase', fontWeight: 800, textAlign: 'center' }}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={ROOM_CODE_LENGTH}
            value={code}
            onChange={(event) => {
              setCode(normalizeRoomCode(event.target.value));
              setInvalid(false);
            }}
          />
          {invalid ? <p className="modal-error" style={{ marginTop: 10 }}>{t('lobby.joinFriend.codeInvalid')}</p> : null}
        </div>
        <div>
          <label className="modal-label" htmlFor="join-password">
            {t('lobby.joinFriend.password')}
          </label>
          <input
            id="join-password"
            className="modal-field"
            type="password"
            autoComplete="off"
            maxLength={PASSWORD_MAX}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-gold modal-btn" disabled={busy}>
          {t('lobby.joinFriend.join')}
        </button>
      </form>
      <div className="modal-or">{t('lobby.joinFriend.or')}</div>
      <button type="button" className="btn btn-orange modal-btn" disabled={busy} onClick={onCreatePrivate}>
        {t('lobby.joinFriend.create')}
      </button>
      <button type="button" className="btn modal-btn" disabled={busy} onClick={onReturnToTable}>
        {t('lobby.returnToTable')}
      </button>
    </Modal>
  );
}
