/**
 * 基数2の反復型 FFT（Cooley–Tukey）。
 *
 * ピッチ検出では自己相関を求めるのに使う。素朴に自己相関を計算すると
 * O(窓長 × 最大ラグ) になり、低音まで見るために窓を大きくすると
 * スマホでは間に合わない。FFT 経由なら O(N log N) で同じ結果が出る。
 *
 * 回転因子とビット反転表は生成時に一度だけ作り、以降は使い回す。
 */

export function createFFT(size) {
  if (size < 2 || (size & (size - 1)) !== 0) {
    throw new Error('FFT のサイズは2の冪でなければならない');
  }

  const levels = Math.log2(size);
  const half = size >> 1;

  const cosTable = new Float64Array(half);
  const sinTable = new Float64Array(half);
  for (let i = 0; i < half; i += 1) {
    cosTable[i] = Math.cos((2 * Math.PI * i) / size);
    sinTable[i] = Math.sin((2 * Math.PI * i) / size);
  }

  const reversed = new Uint32Array(size);
  for (let i = 0; i < size; i += 1) {
    let r = 0;
    for (let bit = 0; bit < levels; bit += 1) {
      r |= ((i >> bit) & 1) << (levels - 1 - bit);
    }
    reversed[i] = r;
  }

  /** その場で複素 FFT を行う。 */
  function transform(re, im) {
    for (let i = 0; i < size; i += 1) {
      const j = reversed[i];
      if (j > i) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }

    for (let len = 2; len <= size; len <<= 1) {
      const halfLen = len >> 1;
      const step = size / len;
      for (let start = 0; start < size; start += len) {
        for (let j = 0, k = 0; j < halfLen; j += 1, k += step) {
          const a = start + j;
          const b = a + halfLen;
          const tre = re[b] * cosTable[k] + im[b] * sinTable[k];
          const tim = -re[b] * sinTable[k] + im[b] * cosTable[k];
          re[b] = re[a] - tre;
          im[b] = im[a] - tim;
          re[a] += tre;
          im[a] += tim;
        }
      }
    }
  }

  return {
    size,
    forward: transform,

    /** 実部と虚部を入れ替えて順変換し、N で割ると逆変換になる。 */
    inverse(re, im) {
      transform(im, re);
      for (let i = 0; i < size; i += 1) {
        re[i] /= size;
        im[i] /= size;
      }
    },
  };
}
