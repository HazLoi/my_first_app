import { useState } from 'react';
import { Modal } from '@/components/Modal';
import { STAKES } from '@/config/rules';
import { formatChips, t } from '@/i18n';
import { PASSWORD_MAX, canAfford, minBalanceFor, quickPlayStake } from '@/lib/lobbyLogic';
import type { CreateTableOptions } from '@/services/types';

interface CreateTableModalProps {
  balance: number;
  initialPublic?: boolean;
  busy: boolean;
  onSubmit(options: CreateTableOptions): void;
  onClose(): void;
}

const PLAYER_OPTIONS = [2, 3, 4] as const;

export function CreateTableModal({ balance, initialPublic = true, busy, onSubmit, onClose }: CreateTableModalProps) {
  const [stake, setStake] = useState<number>(() => quickPlayStake(balance) ?? STAKES[0]);
  const [maxPlayers, setMaxPlayers] = useState<2 | 3 | 4>(4);
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [password, setPassword] = useState('');
  const poor = !canAfford(balance, stake);

  return (
    <Modal title={t('lobby.create.title')} onClose={onClose} width={1000}>
      <div>
        <span className="modal-label">{t('lobby.create.stake')}</span>
        <div className="chip-row">
          {STAKES.map((value) => (
            <button key={value} type="button" className="chip" aria-pressed={stake === value} onClick={() => setStake(value)}>
              {formatChips(value)}
            </button>
          ))}
        </div>
        {poor ? <p className="modal-error" style={{ marginTop: 12 }}>{t('lobby.create.min', { amount: formatChips(minBalanceFor(stake)) })}</p> : null}
      </div>
      <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap' }}>
        <div>
          <span className="modal-label">{t('lobby.create.players')}</span>
          <div className="chip-row">
            {PLAYER_OPTIONS.map((count) => (
              <button key={count} type="button" className="chip" aria-pressed={maxPlayers === count} onClick={() => setMaxPlayers(count)}>
                {t('lobby.create.people', { count })}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className="modal-label">{t('lobby.create.visibility')}</span>
          <div className="chip-row">
            <button type="button" className="chip" aria-pressed={isPublic} onClick={() => setIsPublic(true)}>
              {t('lobby.create.public')}
            </button>
            <button type="button" className="chip" aria-pressed={!isPublic} onClick={() => setIsPublic(false)}>
              {t('lobby.create.private')}
            </button>
          </div>
        </div>
      </div>
      <div>
        <label className="modal-label" htmlFor="create-password">
          {t('lobby.create.password')}
        </label>
        <input
          id="create-password"
          className="modal-field"
          type="password"
          autoComplete="new-password"
          maxLength={PASSWORD_MAX}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <button
        type="button"
        className="btn btn-green modal-btn"
        disabled={busy}
        onClick={() => onSubmit({ stake, maxPlayers, isPublic, password: password || undefined })}
      >
        {t('lobby.create.submit')}
      </button>
    </Modal>
  );
}
