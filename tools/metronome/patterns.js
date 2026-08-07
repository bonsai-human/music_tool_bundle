/**
 * 拍子・リズムパターンの定義。
 *
 * 1小節のモデル:
 *   1小節 = beats 拍、1拍 = subdivision スロット。
 *   各スロットの鳴らし方は slots 文字列で決まる。
 *     'B' … その拍のアクセント設定（強／弱／休）に従う
 *     's' … 分割の音（弱めのクリック）
 *     '-' … 鳴らさない
 *   accents は拍ごとに 'S'（強）/ 'W'（弱）/ 'R'（休）の文字列。
 */

/** 拍子プリセット（分子/分母）。 */
export const METERS = [
  [1, 4], [2, 4], [3, 4], [4, 4],
  [5, 4], [6, 4], [3, 8], [5, 8],
  [6, 8], [7, 8], [9, 8], [12, 8],
];

export const MAX_BEATS = 16;

/** リズムパターン。subdivision と 1拍あたりのスロット構成を持つ。 */
export const PATTERNS = [
  { id: 'basic', label: '基本', subdivision: 1, slots: 'B' },
  { id: 'eighth', label: '8分', subdivision: 2, slots: 'Bs' },
  { id: 'triplet', label: '3連', subdivision: 3, slots: 'Bss' },
  { id: 'sixteenth', label: '16分', subdivision: 4, slots: 'Bsss' },
  { id: 'swing', label: 'スウィング', subdivision: 3, slots: 'B-s' },
  { id: 'dotted', label: '付点', subdivision: 4, slots: 'B--s' },
];

export function findPattern(id) {
  return PATTERNS.find((p) => p.id === id) || PATTERNS[0];
}

/**
 * 拍子に対する既定のアクセント。
 * 8分の複合拍子（6/8, 9/8, 12/8）は3拍ずつまとめて強拍を置く。
 */
export function defaultAccents(beats, unit) {
  const group = unit === 8 && beats % 3 === 0 && beats > 3 ? 3 : 0;
  let out = '';
  for (let i = 0; i < beats; i += 1) {
    const strong = group ? i % group === 0 : i === 0;
    out += strong ? 'S' : 'W';
  }
  return out;
}

/** 拍数が変わったときにアクセント文字列を伸縮させる（既存の指定は残す）。 */
export function resizeAccents(accents, beats) {
  const base = accents.slice(0, beats);
  return base + 'W'.repeat(Math.max(0, beats - base.length));
}

/** 速度標語。BPM から該当する語を返す。 */
const TEMPO_TERMS = [
  [40, 'Grave'],
  [60, 'Largo'],
  [66, 'Larghetto'],
  [76, 'Adagio'],
  [108, 'Andante'],
  [120, 'Moderato'],
  [156, 'Allegro'],
  [176, 'Vivace'],
  [200, 'Presto'],
  [Infinity, 'Prestissimo'],
];

export function tempoTerm(bpm) {
  for (const [limit, term] of TEMPO_TERMS) {
    if (bpm < limit) return term;
  }
  return 'Prestissimo';
}
