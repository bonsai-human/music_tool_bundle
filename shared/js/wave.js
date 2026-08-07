/**
 * 倍音構成を連続的に変化させられる PeriodicWave の生成。
 *
 * 基本波形ごとの理想倍音列に対して指数状の傾き（スペクトルチルト）を掛け、
 * 「高調波 0% = 純正弦波 〜 100% = その波形そのもの」を無段階でつなぐ。
 */

export const WAVEFORMS = [
  { id: 'sine', label: '正弦波' },
  { id: 'triangle', label: '三角波' },
  { id: 'sawtooth', label: 'のこぎり波' },
  { id: 'square', label: '矩形波' },
];

const MAX_PARTIALS = 64;

/** 第 n 倍音の理想振幅（符号込み）。倍音を持たない次数は 0。 */
function idealAmplitude(type, n) {
  switch (type) {
    case 'sine':
      return n === 1 ? 1 : 0;
    case 'triangle':
      if (n % 2 === 0) return 0;
      return ((8 / Math.PI ** 2) * (-1) ** ((n - 1) / 2)) / (n * n);
    case 'sawtooth':
      return ((2 / Math.PI) * (-1) ** (n + 1)) / n;
    case 'square':
      return n % 2 === 0 ? 0 : (4 / Math.PI) / n;
    default:
      return n === 1 ? 1 : 0;
  }
}

/**
 * 高調波量 (0..1) → 減衰係数。
 * 1 で減衰なし（元の波形）、0 で基音のみ（正弦波）。
 */
function tiltFactor(harmonics) {
  const h = Math.min(1, Math.max(0, harmonics));
  if (h <= 0) return Infinity;
  if (h >= 1) return 0;
  return 1 / h - 1;
}

/**
 * PeriodicWave を生成する。
 * @param {BaseAudioContext} ctx
 * @param {string} type            WAVEFORMS の id
 * @param {number} harmonics       0..1
 * @param {number} fundamental     基音周波数(Hz)。ナイキスト周波数を超える倍音を落とすのに使う。
 */
export function createHarmonicWave(ctx, type, harmonics, fundamental) {
  const nyquistLimit = Math.floor((ctx.sampleRate * 0.45) / Math.max(1, fundamental));
  const count = Math.max(1, Math.min(MAX_PARTIALS, nyquistLimit));
  const decay = tiltFactor(harmonics);

  const real = new Float32Array(count + 1);
  const imag = new Float32Array(count + 1);

  for (let n = 1; n <= count; n += 1) {
    const base = idealAmplitude(type, n);
    if (base === 0) continue;
    const gain = n === 1 ? 1 : Number.isFinite(decay) ? Math.exp(-decay * (n - 1)) : 0;
    imag[n] = base * gain;
  }

  // 正規化は既定のまま（ピーク振幅が揃うので音量差が出にくい）。
  return ctx.createPeriodicWave(real, imag);
}

/** 同じ波形を作り直さないための簡易キャッシュ。 */
export function createWaveCache(ctx) {
  const cache = new Map();
  return function getWave(type, harmonics, fundamental) {
    const bucket = Math.round(harmonics * 200) / 200;
    const octave = Math.round(Math.log2(Math.max(1, fundamental)) * 4);
    const key = `${type}|${bucket}|${octave}`;
    let wave = cache.get(key);
    if (!wave) {
      wave = createHarmonicWave(ctx, type, bucket, fundamental);
      cache.set(key, wave);
    }
    return wave;
  };
}
