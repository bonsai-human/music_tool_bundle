/**
 * 単音の音高検出。
 *
 * 方式は MPM（McLeod Pitch Method）系:
 *   1. FFT 経由で自己相関を求める
 *   2. NSDF（正規化二乗差関数）に直す。0〜1 に収まるので閾値を決めやすい
 *   3. 「最初の十分に高い山」を選ぶ。単純な最大値を採るとオクターブを
 *      間違えるが、この選び方だと基音を掴みやすい
 *   4. 山の頂点を放物線で補間してサブサンプル精度を得る
 *
 * 素朴な自己相関ではオクターブ誤りが多く、YIN は精度は良いものの
 * O(窓長 × 最大ラグ) で低音まで見ると重い。FFT 経由なら O(N log N)。
 */

import { createFFT } from './fft.js';

const A4_MIDI = 69;

export function freqToMidi(freq, a4 = 440) {
  return A4_MIDI + 12 * Math.log2(freq / a4);
}

export function midiToFreq(midi, a4 = 440) {
  return a4 * 2 ** ((midi - A4_MIDI) / 12);
}

/** 実測周波数と、最も近い半音とのずれ（セント）。 */
export function centsOff(freq, a4 = 440) {
  const midi = freqToMidi(freq, a4);
  const nearest = Math.round(midi);
  return { midi, nearest, cents: (midi - nearest) * 100 };
}

export function createPitchDetector({
  sampleRate,
  size = 4096,
  minFreq = 27.5, // A0
  maxFreq = 2000,
  clarityThreshold = 0.5,
} = {}) {
  // 循環畳み込みを避けるため、窓の2倍以上に零詰めする
  let fftSize = 2;
  while (fftSize < size * 2) fftSize *= 2;

  const fft = createFFT(fftSize);
  const re = new Float64Array(fftSize);
  const im = new Float64Array(fftSize);
  const windowed = new Float64Array(size);
  const prefixPower = new Float64Array(size + 1);
  const nsdf = new Float64Array(size);

  const minLag = Math.max(2, Math.floor(sampleRate / maxFreq));
  const maxLag = Math.min(size - 1, Math.ceil(sampleRate / minFreq));

  /**
   * @param {Float32Array} input 長さ size 以上の時間波形
   * @returns {{freq:number, clarity:number, rms:number}|null} 検出できなければ null
   */
  function detect(input) {
    // 直流成分を抜く。マイクのオフセットが乗ると自己相関が歪む
    let mean = 0;
    for (let i = 0; i < size; i += 1) mean += input[i];
    mean /= size;

    let energy = 0;
    for (let i = 0; i < size; i += 1) {
      const value = input[i] - mean;
      windowed[i] = value;
      energy += value * value;
    }

    const rms = Math.sqrt(energy / size);
    if (rms === 0) return null;

    // 自己相関 = IFFT(|FFT(x)|^2)
    re.fill(0);
    im.fill(0);
    for (let i = 0; i < size; i += 1) re[i] = windowed[i];
    fft.forward(re, im);
    for (let i = 0; i < fftSize; i += 1) {
      re[i] = re[i] * re[i] + im[i] * im[i];
      im[i] = 0;
    }
    fft.inverse(re, im);

    // x^2 の累積和。NSDF の分母を O(1) で引けるようにする
    prefixPower[0] = 0;
    for (let i = 0; i < size; i += 1) {
      prefixPower[i + 1] = prefixPower[i] + windowed[i] * windowed[i];
    }

    // NSDF: 2r[τ] / (前半のパワー + 後半のパワー)
    nsdf.fill(0);
    for (let lag = 0; lag <= maxLag; lag += 1) {
      const power = prefixPower[size - lag] + (prefixPower[size] - prefixPower[lag]);
      nsdf[lag] = power > 0 ? (2 * re[lag]) / power : 0;
    }

    // 山を集める。負→正の交差から次の正→負の交差までの最大値が1つの山
    let bestValue = -1;
    const peaks = [];
    let lag = minLag;
    while (lag < maxLag && nsdf[lag] > 0) lag += 1; // 最初の谷まで進む

    while (lag < maxLag) {
      if (nsdf[lag] > 0 && nsdf[lag] > nsdf[lag - 1]) {
        let peak = lag;
        while (lag + 1 <= maxLag && nsdf[lag + 1] >= nsdf[lag]) {
          lag += 1;
          peak = lag;
        }
        peaks.push(peak);
        if (nsdf[peak] > bestValue) bestValue = nsdf[peak];
        while (lag + 1 <= maxLag && nsdf[lag + 1] <= 0) lag += 1;
      }
      lag += 1;
    }

    if (!peaks.length || bestValue < clarityThreshold) return null;

    // 最大値の 0.9 倍を超える「最初の」山を採る。これがオクターブ誤りを防ぐ要点
    const cutoff = bestValue * 0.9;
    let chosen = peaks[peaks.length - 1];
    for (const peak of peaks) {
      if (nsdf[peak] >= cutoff) {
        chosen = peak;
        break;
      }
    }

    // 頂点を放物線で補間する（整数ラグのままだと高音側で誤差が大きい）
    const y0 = nsdf[chosen - 1] ?? nsdf[chosen];
    const y1 = nsdf[chosen];
    const y2 = nsdf[chosen + 1] ?? nsdf[chosen];
    const denominator = 2 * (2 * y1 - y0 - y2);
    const shift = denominator !== 0 ? (y2 - y0) / denominator : 0;
    const refined = chosen + Math.max(-1, Math.min(1, shift));

    // 高音ほど1周期のサンプル数が少なく（1100Hz で 43サンプル）、頂点補間だけでは
    // 分解能が足りない。NSDF は周期の整数倍にも山を持つので、窓に収まる倍数の山で
    // 測り直すと相対分解能がその倍数ぶん上がる。
    let period = refined;
    const multiple = Math.min(8, Math.floor(maxLag / refined));
    if (multiple >= 2) {
      const target = refined * multiple;
      const search = Math.max(2, Math.round(refined / 4));
      const from = Math.max(1, Math.round(target - search));
      const to = Math.min(maxLag - 1, Math.round(target + search));

      let peakValue = -1;
      let peakLag = -1;
      for (let l = from; l <= to; l += 1) {
        if (nsdf[l] > peakValue) {
          peakValue = nsdf[l];
          peakLag = l;
        }
      }

      // 倍数側の山が十分はっきりしているときだけ採用する
      if (peakLag > 0 && peakLag < maxLag && peakValue >= y1 * 0.8) {
        const a = nsdf[peakLag - 1];
        const b = nsdf[peakLag];
        const c = nsdf[peakLag + 1];
        const d = 2 * (2 * b - a - c);
        const s = d !== 0 ? (c - a) / d : 0;
        period = (peakLag + Math.max(-1, Math.min(1, s))) / multiple;
      }
    }

    const freq = sampleRate / period;
    if (!Number.isFinite(freq) || freq < minFreq || freq > maxFreq) return null;

    return { freq, clarity: y1, rms };
  }

  return { detect, size, minLag, maxLag, fftSize };
}
