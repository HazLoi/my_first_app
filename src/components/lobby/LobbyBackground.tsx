/** Nền sảnh: gradient neon + hình quân bài/ký hiệu trôi chậm (CSS thuần, tắt animation khi lowGraphics). */
const SYMBOLS = [
  { ch: '♠', x: 6, y: 78, size: 150, delay: 0 },
  { ch: '♥', x: 20, y: 18, size: 110, delay: -4 },
  { ch: '♦', x: 44, y: 86, size: 130, delay: -8 },
  { ch: '♣', x: 62, y: 10, size: 120, delay: -2 },
  { ch: '♥', x: 80, y: 80, size: 160, delay: -6 },
  { ch: '♠', x: 93, y: 26, size: 100, delay: -10 },
];

export function LobbyBackground() {
  return (
    <div className="lobby-bg" aria-hidden="true">
      <div className="lobby-bg-glow lobby-bg-glow-a" />
      <div className="lobby-bg-glow lobby-bg-glow-b" />
      <div className="lobby-bg-table" />
      {SYMBOLS.map((symbol, index) => (
        <span
          key={index}
          className="lobby-bg-suit"
          style={{
            left: `${symbol.x}%`,
            top: `${symbol.y}%`,
            fontSize: symbol.size,
            animationDelay: `${symbol.delay}s`,
            color: symbol.ch === '♥' || symbol.ch === '♦' ? 'rgba(255, 90, 140, 0.14)' : 'rgba(140, 170, 255, 0.14)',
          }}
        >
          {symbol.ch}
        </span>
      ))}
    </div>
  );
}
