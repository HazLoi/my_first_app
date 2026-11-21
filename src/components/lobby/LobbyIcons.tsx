import type { TableKind } from '@/lib/lobbyLogic';

export function QuickIcon() {
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="100" cy="100" r="86" fill="rgba(255,255,255,0.18)" stroke="#eaffee" strokeWidth="6" />
      <circle cx="100" cy="100" r="68" fill="rgba(0,70,30,0.35)" />
      <path d="M116 26 62 112h34l-12 62 56-90h-36z" fill="#fff6b0" stroke="#f59e0b" strokeWidth="6" strokeLinejoin="round" />
    </svg>
  );
}

export function FriendIcon() {
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <circle cx="68" cy="70" r="28" fill="#fff7d6" stroke="#b45309" strokeWidth="6" />
      <path d="M18 160c0-30 22-48 50-48s50 18 50 48z" fill="#fde68a" stroke="#b45309" strokeWidth="6" strokeLinejoin="round" />
      <circle cx="136" cy="82" r="24" fill="#ffffff" stroke="#b45309" strokeWidth="6" />
      <path d="M96 164c0-26 18-42 40-42s44 16 44 42z" fill="#fff3c4" stroke="#b45309" strokeWidth="6" strokeLinejoin="round" />
      <path d="M150 30c8-12 24-6 20 8-3 9-20 18-20 18s-17-9-20-18c-4-14 12-20 20-8z" transform="translate(-8 -6) scale(.8)" fill="#ef4444" stroke="#7f1d1d" strokeWidth="6" />
    </svg>
  );
}

export function PickIcon() {
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <ellipse cx="100" cy="112" rx="84" ry="52" fill="#0f766e" stroke="#fcd34d" strokeWidth="8" />
      <ellipse cx="100" cy="112" rx="62" ry="34" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="3" />
      {[
        [100, 46],
        [26, 112],
        [174, 112],
        [100, 178],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="15" fill="#fde68a" stroke="#7c2d12" strokeWidth="5" />
      ))}
      <rect x="78" y="86" width="26" height="36" rx="5" fill="#fff" stroke="#1e1b4b" strokeWidth="3" transform="rotate(-14 91 104)" />
      <rect x="98" y="86" width="26" height="36" rx="5" fill="#fff" stroke="#1e1b4b" strokeWidth="3" transform="rotate(12 111 104)" />
      <text x="111" y="112" fontSize="22" textAnchor="middle" fill="#dc2626" transform="rotate(12 111 104)">♥</text>
    </svg>
  );
}

export function OtherIcon() {
  return (
    <svg viewBox="0 0 200 200" aria-hidden="true">
      <rect x="34" y="40" width="112" height="112" rx="24" fill="#fff" stroke="#312e81" strokeWidth="7" transform="rotate(-10 90 96)" />
      {[
        [66, 72],
        [112, 72],
        [89, 98],
        [66, 124],
        [112, 124],
      ].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="9" fill="#4c1d95" transform="rotate(-10 90 96)" />
      ))}
      <rect x="100" y="88" width="76" height="76" rx="18" fill="#ddd6fe" stroke="#312e81" strokeWidth="7" transform="rotate(14 138 126)" />
      <circle cx="124" cy="112" r="7" fill="#4c1d95" transform="rotate(14 138 126)" />
      <circle cx="152" cy="140" r="7" fill="#4c1d95" transform="rotate(14 138 126)" />
    </svg>
  );
}

const TABLE_COLORS: Record<TableKind, { felt: string; rim: string }> = {
  open: { felt: '#22c55e', rim: '#bbf7d0' },
  playing: { felt: '#92400e', rim: '#e7b27a' },
  high: { felt: '#2563eb', rim: '#bfdbfe' },
};

/** Icon bàn nhìn từ trên xuống; ghế đã có người sáng màu. */
export function TableIcon({ kind, players, maxPlayers }: { kind: TableKind; players: number; maxPlayers: number }) {
  const color = TABLE_COLORS[kind];
  const seats: Array<[number, number]> = [
    [50, 74],
    [10, 40],
    [90, 40],
    [50, 6],
  ];
  const order = maxPlayers === 2 ? [0, 3] : maxPlayers === 3 ? [0, 1, 2] : [0, 1, 3, 2];
  return (
    <svg viewBox="0 0 100 80" aria-hidden="true">
      <ellipse cx="50" cy="42" rx="36" ry="24" fill={color.felt} stroke={color.rim} strokeWidth="4" />
      <ellipse cx="50" cy="42" rx="24" ry="14" fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" />
      {order.map((seat, index) => {
        const [x, y] = seats[seat] as [number, number];
        const taken = index < players;
        return (
          <circle
            key={seat}
            cx={x}
            cy={y}
            r="7"
            fill={taken ? '#fde68a' : 'rgba(255,255,255,0.18)'}
            stroke={taken ? '#92400e' : 'rgba(255,255,255,0.5)'}
            strokeWidth="2"
          />
        );
      })}
    </svg>
  );
}
