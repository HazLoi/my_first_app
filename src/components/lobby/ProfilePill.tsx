import { Avatar } from '@/components/Avatar';
import { formatChips, t } from '@/i18n';
import type { UserProfile } from '@/services/authTypes';

interface ProfilePillProps {
  user: UserProfile;
  /** Chỉ truyền khi gateway cho phép nạp xu giả (mock). */
  onTopUp?: () => void;
  topUpBusy?: boolean;
}

export function ProfilePill({ user, onTopUp, topUpBusy }: ProfilePillProps) {
  return (
    <div className="lobby-profile glass">
      <Avatar seed={user.id} avatar={user.avatar} size={104} />
      <div className="lobby-profile-info">
        <span className="lobby-profile-name">{user.displayName}</span>
        <span className="lobby-profile-level">
          <span className="lobby-star" aria-hidden="true">★</span>
          {t('common.level', { level: user.level ?? 1 })}
        </span>
        <span className="lobby-coins">
          <span className="lobby-coin" aria-hidden="true">$</span>
          <span className="lobby-coins-value">{formatChips(user.balance)}</span>
          {onTopUp ? (
            <button
              type="button"
              className="lobby-plus"
              onClick={onTopUp}
              disabled={topUpBusy}
              aria-label={t('lobby.topUp')}
              title={t('lobby.topUp')}
            >
              +
            </button>
          ) : null}
        </span>
      </div>
    </div>
  );
}
