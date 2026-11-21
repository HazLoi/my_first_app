// Tham số luật — PHẢI khớp với api_zingplay/php/rules.php (PHP là nguồn sự thật).
// Bản TypeScript chỉ dùng cho giao diện (nhãn, kiểm tra lủng, gợi ý, bot, chế độ mock).

export const STAKES = [50, 100, 200, 500, 1000] as const;
export const MIN_BALANCE_MULTIPLIER = 20;
export const STARTING_BALANCE = 10_000;

export const RULES = {
  /** Điểm thắng một chi theo loại bài thắng (chi, loại bài → điểm). Mặc định là 1. */
  chiPoints: {
    front: { THREE: 3 },
    middle: { FULL_HOUSE: 2, FOUR: 8, STRAIGHT_FLUSH: 10 },
    back: { FOUR: 4, STRAIGHT_FLUSH: 5 },
  } as Record<'front' | 'middle' | 'back', Partial<Record<string, number>>>,
  sapHamMultiplier: 2,
  sapLangMultiplier: 2,
  /** Sập làng chỉ xét khi có từ 3 người. */
  sapLangMinPlayers: 3,
  /** Người thua chỉ mất tối đa số xu đang có; tiền thắng chia lại theo tỷ lệ. */
  capByBalance: true,
  /** Binh lủng bị chặn khi nộp bài (giống PHP). */
  allowFoul: false,
  white: {
    enabled: true,
    /** rank cao hơn thắng; points = điểm mỗi đối thủ. */
    types: {
      rong_cuon: { rank: 7, points: 36, label: 'Rồng cuốn' },
      sanh_rong: { rank: 6, points: 24, label: 'Sảnh rồng' },
      cung_mau_13: { rank: 5, points: 20, label: '13 lá cùng màu' },
      cung_mau_12: { rank: 4, points: 16, label: '12 lá cùng màu' },
      sau_doi: { rank: 3, points: 12, label: 'Sáu đôi' },
      ba_sanh: { rank: 2, points: 10, label: 'Ba sảnh' },
      ba_thung: { rank: 1, points: 8, label: 'Ba thùng' },
    },
  },
  /** Trọng số chấm điểm gợi ý xếp bài. */
  suggest: {
    weights: { back: 3, middle: 2, front: 1 },
    strategies: {
      strongBack: { back: 4, middle: 2, front: 0.5 },
      balanced: { back: 3, middle: 2, front: 1 },
      winFront: { back: 1.5, middle: 2, front: 3 },
    },
  },
  /** Thời lượng từng phase (giây) cho MockGateway; PHP dùng giá trị tương ứng. */
  phaseSeconds: {
    dealing: 3,
    arranging: 60,
    revealing: 9,
    scoring: 3,
    summary: 5,
    next: 3,
  },
  autoStartDelaySeconds: 3,
} as const;

export type WhiteKey = keyof typeof RULES.white.types;
