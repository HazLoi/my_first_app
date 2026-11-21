import { t } from '@/i18n';

interface SideMenuProps {
  soundOn: boolean;
  onFriends(): void;
  onLeaderboard(): void;
  onGifts(): void;
  onToggleSound(): void;
  onSettings(): void;
}

/** Cột nút bên trái sảnh. Bạn bè / xếp hạng / quà là placeholder "Sắp ra mắt". */
export function SideMenu({ soundOn, onFriends, onLeaderboard, onGifts, onToggleSound, onSettings }: SideMenuProps) {
  const items = [
    { key: 'friends', icon: '👥', label: t('lobby.friends'), onClick: onFriends },
    { key: 'rank', icon: '🏆', label: t('lobby.leaderboard'), onClick: onLeaderboard },
    { key: 'gifts', icon: '🎁', label: t('lobby.gifts'), onClick: onGifts },
    { key: 'sound', icon: soundOn ? '🔊' : '🔇', label: t('common.sound'), onClick: onToggleSound, pressed: soundOn },
    { key: 'settings', icon: '⚙️', label: t('common.settings'), onClick: onSettings },
  ];
  return (
    <nav className="lobby-side">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className="lobby-side-btn"
          onClick={item.onClick}
          aria-label={item.label}
          aria-pressed={item.pressed}
        >
          <span className="lobby-side-icon" aria-hidden="true">{item.icon}</span>
          <span className="lobby-side-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
