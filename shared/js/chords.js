/**
 * 和音の判定。
 *
 * コード名は本質的に「ピッチクラスの集合」と「ベース音」だけで決まる
 * （どのオクターブでどう積むかは名前を変えない）ので、
 * 0〜11 の集合を入力にとる。
 *
 * intervals はルートからの半音数、degrees はそれぞれの度数表記で、
 * 添字が対応している。
 */

export const PITCH_SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const PITCH_FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

/** ♭系で書いたほうが自然なルート（F, B♭, E♭, A♭, D♭, G♭）。 */
const FLAT_ROOTS = new Set([5, 10, 3, 8, 1, 6]);

export function pitchName(pc, useFlat = false) {
  return (useFlat ? PITCH_FLAT : PITCH_SHARP)[((pc % 12) + 12) % 12];
}

/**
 * コード辞書。weight は小さいほど「ありふれた解釈」として優先する。
 * 11th系は3度を、13th系は11度を省くのが慣習なので、その形で登録している。
 */
export const CHORD_TYPES = [
  // 三和音
  { suffix: '', intervals: [0, 4, 7], degrees: ['R', '3', '5'], weight: 0 },
  { suffix: 'm', intervals: [0, 3, 7], degrees: ['R', '♭3', '5'], weight: 0 },
  { suffix: 'sus4', intervals: [0, 5, 7], degrees: ['R', '4', '5'], weight: 2 },
  { suffix: 'sus2', intervals: [0, 2, 7], degrees: ['R', '2', '5'], weight: 2 },
  { suffix: 'dim', intervals: [0, 3, 6], degrees: ['R', '♭3', '♭5'], weight: 2 },
  { suffix: 'aug', intervals: [0, 4, 8], degrees: ['R', '3', '♯5'], weight: 2 },
  { suffix: '5', intervals: [0, 7], degrees: ['R', '5'], weight: 6 },

  // 6thと付加音
  { suffix: '6', intervals: [0, 4, 7, 9], degrees: ['R', '3', '5', '6'], weight: 2 },
  { suffix: 'm6', intervals: [0, 3, 7, 9], degrees: ['R', '♭3', '5', '6'], weight: 3 },
  { suffix: 'add9', intervals: [0, 2, 4, 7], degrees: ['R', '9', '3', '5'], weight: 3 },
  { suffix: 'madd9', intervals: [0, 2, 3, 7], degrees: ['R', '9', '♭3', '5'], weight: 3 },
  { suffix: 'add11', intervals: [0, 4, 5, 7], degrees: ['R', '3', '11', '5'], weight: 5 },
  { suffix: '6/9', intervals: [0, 2, 4, 7, 9], degrees: ['R', '9', '3', '5', '6'], weight: 3 },
  { suffix: 'm6/9', intervals: [0, 2, 3, 7, 9], degrees: ['R', '9', '♭3', '5', '6'], weight: 5 },

  // 七の和音
  { suffix: 'maj7', intervals: [0, 4, 7, 11], degrees: ['R', '3', '5', '7'], weight: 1 },
  { suffix: '7', intervals: [0, 4, 7, 10], degrees: ['R', '3', '5', '♭7'], weight: 1 },
  { suffix: 'm7', intervals: [0, 3, 7, 10], degrees: ['R', '♭3', '5', '♭7'], weight: 1 },
  { suffix: 'mmaj7', intervals: [0, 3, 7, 11], degrees: ['R', '♭3', '5', '7'], weight: 5 },
  // ハーフディミニッシュ。短調の ii として頻出するので m6 より優先する
  // （{C,E♭,G♭,B♭} は Cm7♭5 とも E♭m6 とも読めるが、前者が普通）
  { suffix: 'm7♭5', intervals: [0, 3, 6, 10], degrees: ['R', '♭3', '♭5', '♭7'], weight: 2 },
  { suffix: 'dim7', intervals: [0, 3, 6, 9], degrees: ['R', '♭3', '♭5', '♭♭7'], weight: 3 },
  { suffix: '7sus4', intervals: [0, 5, 7, 10], degrees: ['R', '4', '5', '♭7'], weight: 4 },
  { suffix: '7♯5', intervals: [0, 4, 8, 10], degrees: ['R', '3', '♯5', '♭7'], weight: 5 },
  { suffix: '7♭5', intervals: [0, 4, 6, 10], degrees: ['R', '3', '♭5', '♭7'], weight: 5 },
  { suffix: 'maj7♯5', intervals: [0, 4, 8, 11], degrees: ['R', '3', '♯5', '7'], weight: 5 },

  // 九の和音
  { suffix: 'maj9', intervals: [0, 2, 4, 7, 11], degrees: ['R', '9', '3', '5', '7'], weight: 3 },
  { suffix: '9', intervals: [0, 2, 4, 7, 10], degrees: ['R', '9', '3', '5', '♭7'], weight: 3 },
  { suffix: 'm9', intervals: [0, 2, 3, 7, 10], degrees: ['R', '9', '♭3', '5', '♭7'], weight: 3 },
  { suffix: 'mmaj9', intervals: [0, 2, 3, 7, 11], degrees: ['R', '9', '♭3', '5', '7'], weight: 5 },
  { suffix: '7♭9', intervals: [0, 1, 4, 7, 10], degrees: ['R', '♭9', '3', '5', '♭7'], weight: 5 },
  { suffix: '7♯9', intervals: [0, 3, 4, 7, 10], degrees: ['R', '♯9', '3', '5', '♭7'], weight: 5 },
  { suffix: 'm9♭5', intervals: [0, 2, 3, 6, 10], degrees: ['R', '9', '♭3', '♭5', '♭7'], weight: 5 },

  // 十一・十三の和音
  { suffix: '11', intervals: [0, 2, 5, 7, 10], degrees: ['R', '9', '11', '5', '♭7'], weight: 4 },
  { suffix: 'm11', intervals: [0, 2, 3, 5, 7, 10], degrees: ['R', '9', '♭3', '11', '5', '♭7'], weight: 4 },
  { suffix: '7♯11', intervals: [0, 4, 6, 7, 10], degrees: ['R', '3', '♯11', '5', '♭7'], weight: 5 },
  { suffix: 'maj7♯11', intervals: [0, 4, 6, 7, 11], degrees: ['R', '3', '♯11', '5', '7'], weight: 5 },
  { suffix: '9♯11', intervals: [0, 2, 4, 6, 7, 10], degrees: ['R', '9', '3', '♯11', '5', '♭7'], weight: 5 },
  { suffix: '13', intervals: [0, 2, 4, 7, 9, 10], degrees: ['R', '9', '3', '5', '13', '♭7'], weight: 4 },
  { suffix: 'maj13', intervals: [0, 2, 4, 7, 9, 11], degrees: ['R', '9', '3', '5', '13', '7'], weight: 4 },
  { suffix: 'm13', intervals: [0, 2, 3, 7, 9, 10], degrees: ['R', '9', '♭3', '5', '13', '♭7'], weight: 4 },
  { suffix: '13♭9', intervals: [0, 1, 4, 7, 9, 10], degrees: ['R', '♭9', '3', '5', '13', '♭7'], weight: 6 },
];

/** 2音のときの音程名。 */
const INTERVAL_NAMES = [
  '完全1度', '短2度', '長2度', '短3度', '長3度', '完全4度',
  '増4度（三全音）', '完全5度', '短6度', '長6度', '短7度', '長7度',
];

export function intervalName(a, b) {
  return INTERVAL_NAMES[(((b - a) % 12) + 12) % 12];
}

/**
 * 構成音の綴りは度数で決まる。C の♭3は必ず E♭（D♯ ではない）、
 * ♯9 は D♯（E♭ ではない）。度数に増減の指定が無い音だけ、
 * ルートの調号の傾きに合わせる。
 */
function spell(pc, degree, rootPrefersFlat) {
  if (degree.includes('♭')) return pitchName(pc, true);
  if (degree.includes('♯')) return pitchName(pc, false);
  return pitchName(pc, rootPrefersFlat);
}

function buildCandidate(root, type, pcs, bass, omitted) {
  const useFlat = FLAT_ROOTS.has(root);
  const rootName = pitchName(root, useFlat);

  // 選択された音を度数付きで並べる（コード上の並び順）
  const tones = type.intervals
    .map((interval, i) => ({
      pc: (root + interval) % 12,
      degree: type.degrees[i],
      interval,
    }))
    .filter((tone) => pcs.includes(tone.pc))
    .map((tone) => ({ ...tone, name: spell(tone.pc, tone.degree, useFlat) }));

  // 分数コードのベースも、そのコード内での度数に従って綴る
  let slash = '';
  if (bass !== null && bass !== root) {
    const tone = tones.find((t) => t.pc === bass);
    slash = `/${tone ? tone.name : pitchName(bass, useFlat)}`;
  }

  return {
    root,
    rootName,
    suffix: type.suffix,
    name: rootName + type.suffix + slash,
    tones,
    omitted,
    useFlat,
    weight: type.weight,
  };
}

/**
 * ベース音が指定されていればそれがルートの解釈を強く優先する。
 * 指定が無いときは順序の情報が無い（ピッチクラスに上下は無い）ので、
 * 位置で優劣をつけず、コード種類のありふれ具合だけで並べる。
 * C6 と Am7 のように本質的に等価な読みは、どちらも候補として残す。
 */
function scoreOf(candidate, bass) {
  let score = candidate.weight + candidate.omitted.length * 2;
  if (bass !== null) score += candidate.root === bass ? -4 : 3;
  return score;
}

/**
 * ピッチクラスの集合からコード候補を返す（確からしい順）。
 * @param {number[]} pitchClasses 0〜11
 * @param {number|null} bass ベース音のピッチクラス。指定しないなら null
 */
export function detectChords(pitchClasses, bass = null) {
  const pcs = [...new Set(pitchClasses.map((pc) => ((pc % 12) + 12) % 12))].sort((a, b) => a - b);
  if (pcs.length < 2) return [];

  const exact = [];
  const partial = [];

  for (let root = 0; root < 12; root += 1) {
    const relative = new Set(pcs.map((pc) => (pc - root + 12) % 12));

    for (const type of CHORD_TYPES) {
      const target = new Set(type.intervals);

      // 選択音がすべてコード構成音に含まれているか
      let contained = true;
      for (const interval of relative) {
        if (!target.has(interval)) {
          contained = false;
          break;
        }
      }
      if (!contained) continue;

      const missing = type.intervals.filter((interval) => !relative.has(interval));
      if (missing.length === 0) {
        exact.push(buildCandidate(root, type, pcs, bass, []));
      } else if (missing.length === 1 && missing[0] === 7) {
        // 5度の省略はよくあるので、完全一致が無いときの候補として拾う
        partial.push(buildCandidate(root, type, pcs, bass, ['5']));
      }
    }
  }

  const found = exact.length ? exact : partial;
  return found
    .map((candidate) => ({ ...candidate, score: scoreOf(candidate, bass) }))
    .sort((a, b) => a.score - b.score || a.name.length - b.name.length);
}
