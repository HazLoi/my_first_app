import { rankLabel, SUIT_ORDER, type Card, type Suit } from '@/game-logic';

/** Kích thước viewBox của mặt bài SVG (tỉ lệ 5:7 như bài thật). */
export const CARD_VIEW_W = 200;
export const CARD_VIEW_H = 280;
export const CARD_ASPECT = CARD_VIEW_W / CARD_VIEW_H;

const RED = '#d62839';
const BLACK = '#18202f';

const SUIT_PATHS: Record<Suit, string> = {
  '♦': 'M50 3 L91 50 L50 97 L9 50 Z',
  '♥': 'M50 94 C12 62 2 41 2 28 C2 12 15 3 28 3 C38 3 46 9 50 18 C54 9 62 3 72 3 C85 3 98 12 98 28 C98 41 88 62 50 94 Z',
  '♠': 'M50 3 C88 34 98 53 98 67 C98 82 87 90 75 90 C65 90 57 85 52 77 C53 87 56 93 63 98 L37 98 C44 93 47 87 48 77 C43 85 35 90 25 90 C13 90 2 82 2 67 C2 53 12 34 50 3 Z',
  '♣': 'M50 56 L38 98 L62 98 Z',
};

const isRedSuit = (suit: Suit): boolean => suit === '♦' || suit === '♥';

/** Vẽ một chất (ô 100×100) tại (cx, cy) với cạnh `size`, tùy chọn lật ngược. */
function suitShape(suit: Suit, cx: number, cy: number, size: number, flip = false): string {
  const color = isRedSuit(suit) ? RED : BLACK;
  const s = size / 100;
  const rotate = flip ? ' rotate(180 50 50)' : '';
  const body =
    suit === '♣'
      ? `<circle cx="50" cy="27" r="23"/><circle cx="25" cy="62" r="23"/><circle cx="75" cy="62" r="23"/><path d="${SUIT_PATHS['♣']}"/>`
      : `<path d="${SUIT_PATHS[suit]}"/>`;
  return `<g fill="${color}" transform="translate(${cx - size / 2} ${cy - size / 2}) scale(${s})${rotate}">${body}</g>`;
}

// Vị trí hoa (cột 0..2, y) cho lá số 2–10, trong vùng giữa lá.
const PIP_X = [62, 100, 138] as const;
const TOP = 80;
const MID = 140;
const BOTTOM = 200;
const PIPS: Record<number, [number, number][]> = {
  2: [[1, TOP], [1, BOTTOM]],
  3: [[1, TOP], [1, MID], [1, BOTTOM]],
  4: [[0, TOP], [2, TOP], [0, BOTTOM], [2, BOTTOM]],
  5: [[0, TOP], [2, TOP], [1, MID], [0, BOTTOM], [2, BOTTOM]],
  6: [[0, TOP], [2, TOP], [0, MID], [2, MID], [0, BOTTOM], [2, BOTTOM]],
  7: [[0, TOP], [2, TOP], [1, 110], [0, MID], [2, MID], [0, BOTTOM], [2, BOTTOM]],
  8: [[0, TOP], [2, TOP], [1, 110], [0, MID], [2, MID], [1, 170], [0, BOTTOM], [2, BOTTOM]],
  9: [[0, TOP], [2, TOP], [0, 113], [2, 113], [1, MID], [0, 167], [2, 167], [0, BOTTOM], [2, BOTTOM]],
  10: [[0, TOP], [2, TOP], [1, 97], [0, 120], [2, 120], [0, 160], [2, 160], [1, 183], [0, BOTTOM], [2, BOTTOM]],
};

function courtDecoration(card: Card, color: string): string {
  const letter = rankLabel(card.value);
  const crown =
    card.value === 13
      ? `<path d="M68 100 L74 70 L88 90 L100 64 L112 90 L126 70 L132 100 Z" fill="#f5c451" stroke="#7a4b00" stroke-width="3" stroke-linejoin="round"/><circle cx="100" cy="58" r="5" fill="#d62839"/>`
      : card.value === 12
        ? `<path d="M70 100 Q100 58 130 100 Z" fill="#f5c451" stroke="#7a4b00" stroke-width="3" stroke-linejoin="round"/><circle cx="100" cy="72" r="6" fill="#38bdf8" stroke="#7a4b00" stroke-width="2"/>`
        : `<path d="M66 100 L76 74 Q100 56 128 66 L134 100 Z" fill="#38bdf8" stroke="#0b3b57" stroke-width="3" stroke-linejoin="round"/><path d="M108 66 Q138 44 148 76" fill="none" stroke="#f5c451" stroke-width="5" stroke-linecap="round"/>`;
  return (
    `<rect x="44" y="42" width="112" height="196" rx="10" fill="url(#court)" stroke="${color}" stroke-width="3"/>` +
    `<rect x="52" y="50" width="96" height="180" rx="6" fill="none" stroke="${color}" stroke-opacity=".35" stroke-width="2"/>` +
    crown +
    `<text x="100" y="172" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="80" font-weight="700" fill="${color}">${letter}</text>` +
    suitShape(card.suit, 100, 204, 36)
  );
}

/** Mặt bài SVG (chuỗi) tự vẽ — dùng chung cho DOM (CardFace) và texture 3D. */
export function cardSvg(card: Card): string {
  const color = isRedSuit(card.suit) ? RED : BLACK;
  const letter = rankLabel(card.value);
  const fontSize = letter.length > 1 ? 40 : 46;
  const corner = (flip: boolean): string => {
    const transform = flip ? 'rotate(180 100 140)' : '';
    return (
      `<g transform="${transform}">` +
      `<text x="26" y="50" text-anchor="middle" font-family="'Be Vietnam Pro', Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="${color}">${letter}</text>` +
      suitShape(card.suit, 26, 72, 26) +
      `</g>`
    );
  };
  let center: string;
  if (card.value === 14) center = suitShape(card.suit, 100, 140, 92);
  else if (card.value >= 11) center = courtDecoration(card, color);
  else {
    center = (PIPS[card.value] ?? [])
      .map(([column, y]) => suitShape(card.suit, PIP_X[column] as number, y, 36, y > MID))
      .join('');
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_VIEW_W} ${CARD_VIEW_H}" width="${CARD_VIEW_W}" height="${CARD_VIEW_H}">` +
    `<defs><linearGradient id="court" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff7df"/><stop offset="1" stop-color="#f1dfae"/></linearGradient></defs>` +
    `<rect x="2" y="2" width="196" height="276" rx="16" fill="#fffdf6" stroke="#b9b4a3" stroke-width="3"/>` +
    corner(false) +
    corner(true) +
    center +
    `</svg>`
  );
}

/** Lưng bài: nền xanh–tím đậm, viền vàng và họa tiết kim cương. */
export function cardBackSvg(): string {
  let pattern = '';
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 5; col++) {
      const cx = 40 + col * 30 + (row % 2 ? 15 : 0);
      const cy = 50 + row * 30;
      if (cx > 168) continue;
      pattern += `<path d="M${cx} ${cy - 11} L${cx + 9} ${cy} L${cx} ${cy + 11} L${cx - 9} ${cy} Z" fill="#f5c451" fill-opacity=".35"/>`;
    }
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD_VIEW_W} ${CARD_VIEW_H}" width="${CARD_VIEW_W}" height="${CARD_VIEW_H}">` +
    `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#312e81"/><stop offset=".55" stop-color="#1e1b4b"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs>` +
    `<rect x="2" y="2" width="196" height="276" rx="16" fill="url(#bg)" stroke="#f5c451" stroke-width="4"/>` +
    `<rect x="16" y="16" width="168" height="248" rx="9" fill="none" stroke="#f5c451" stroke-opacity=".8" stroke-width="2.5"/>` +
    pattern +
    `<circle cx="100" cy="140" r="30" fill="#0f172a" stroke="#f5c451" stroke-width="3"/>` +
    `<path d="M100 120 L108 140 L100 160 L92 140 Z" fill="#f5c451"/>` +
    `</svg>`
  );
}

const urlCache = new Map<string, string>();
const toUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** data URL của mặt bài (cache theo id) cho thẻ <img> trong DOM. */
export function cardSvgUrl(card: Card): string {
  let url = urlCache.get(card.id);
  if (!url) {
    url = toUrl(cardSvg(card));
    urlCache.set(card.id, url);
  }
  return url;
}

export function cardBackUrl(): string {
  let url = urlCache.get('back');
  if (!url) {
    url = toUrl(cardBackSvg());
    urlCache.set('back', url);
  }
  return url;
}

/** Atlas texture 3D: 52 lá theo thứ tự createDeck() (chuồn, rô, cơ, bích), ô cuối (52) là lưng bài. */
export const ATLAS_COLS = 13;
export const ATLAS_ROWS = 5;
export const BACK_CELL = 52;

export function cardCell(card: Card): number {
  const suit = SUIT_ORDER.findIndex((entry) => entry.symbol === card.suit);
  return suit * 13 + (card.value - 2);
}
