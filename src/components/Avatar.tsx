const GLYPHS = ['🦊', '🐯', '🐼', '🦁', '🐸', '🐙', '🦄', '🐲', '🐧', '🦉', '🐵', '🐺'];
const GRADIENTS = [
  ['#38bdf8', '#6366f1'],
  ['#f472b6', '#a855f7'],
  ['#34d399', '#0ea5e9'],
  ['#fbbf24', '#f97316'],
  ['#a78bfa', '#ec4899'],
  ['#2dd4bf', '#22c55e'],
];

function hash(text: string): number {
  let value = 0;
  for (let i = 0; i < text.length; i++) value = (value * 31 + text.charCodeAt(i)) >>> 0;
  return value;
}

interface AvatarProps {
  /** Dùng để chọn hình/màu ổn định khi không có chỉ số avatar. */
  seed: string;
  avatar?: number;
  size?: number;
  /** Viền vàng đồng kiểu khung avatar ở bàn chơi. */
  ring?: boolean;
  dim?: boolean;
  className?: string;
}

/** Avatar tròn tự tạo (emoji trên nền gradient) — không dùng tài nguyên ngoài. */
export function Avatar({ seed, avatar, size = 64, ring = true, dim = false, className = '' }: AvatarProps) {
  const index = avatar ?? hash(seed);
  const [from, to] = GRADIENTS[index % GRADIENTS.length] as [string, string];
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        fontSize: size * 0.54,
        lineHeight: 1,
        background: `linear-gradient(135deg, ${from}, ${to})`,
        border: ring ? `${Math.max(3, size * 0.05)}px solid #f5c451` : undefined,
        boxShadow: ring ? '0 0 0 2px #7a4b00, 0 4px 14px rgba(0,0,0,.5)' : undefined,
        opacity: dim ? 0.55 : 1,
        flex: 'none',
      }}
      aria-hidden="true"
    >
      {GLYPHS[index % GLYPHS.length]}
    </div>
  );
}
