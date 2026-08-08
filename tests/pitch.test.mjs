/**
 * 音高検出の精度検証。DOM に依存しないので node だけで走る。
 *   node tests/pitch.test.mjs
 */

import { createFFT } from '../shared/js/fft.js';
import { createPitchDetector, freqToMidi } from '../shared/js/pitch.js';

const SR = 48000;
const SIZE = 4096;

let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `   ${detail}` : ''}`);
}

/* ---------------------------------------------------------------- FFT */

{
  const size = 64;
  const fft = createFFT(size);
  const re = new Float64Array(size);
  const im = new Float64Array(size);
  const original = new Float64Array(size);
  for (let i = 0; i < size; i += 1) {
    original[i] = Math.sin((2 * Math.PI * 5 * i) / size) + 0.3 * Math.cos((2 * Math.PI * 11 * i) / size);
    re[i] = original[i];
  }
  fft.forward(re, im);
  fft.inverse(re, im);
  let maxError = 0;
  for (let i = 0; i < size; i += 1) maxError = Math.max(maxError, Math.abs(re[i] - original[i]));
  check('FFT 往復の誤差 < 1e-12', maxError < 1e-12, `最大 ${maxError.toExponential(2)}`);
}

/* ------------------------------------------------------------- 波形生成 */

function synth(freq, { wave = 'sine', length = SIZE, amp = 0.4, noise = 0, vibrato = 0, phase = 0.3 } = {}) {
  const buffer = new Float32Array(length);
  let angle = phase;
  for (let i = 0; i < length; i += 1) {
    const t = i / SR;
    const f = vibrato ? freq * 2 ** ((vibrato * Math.sin(2 * Math.PI * 5 * t)) / 1200) : freq;
    angle += (2 * Math.PI * f) / SR;
    let value;
    if (wave === 'sine') {
      value = Math.sin(angle);
    } else if (wave === 'saw') {
      // 倍音を明示的に重ねる（実楽器に近い、基音より倍音が強い場合もある形）
      value = 0;
      for (let h = 1; h <= 12 && h * f < SR / 2; h += 1) value += Math.sin(angle * h) / h;
      value *= 0.6;
    } else if (wave === 'square') {
      value = 0;
      for (let h = 1; h <= 15 && h * f < SR / 2; h += 2) value += Math.sin(angle * h) / h;
      value *= 0.8;
    } else if (wave === 'weakFundamental') {
      // 基音が弱く倍音が強い（低音弦やリード楽器で起こる）
      value = 0.15 * Math.sin(angle) + Math.sin(angle * 2) + 0.8 * Math.sin(angle * 3);
      value *= 0.5;
    }
    if (noise) value += (Math.random() * 2 - 1) * noise;
    buffer[i] = value * amp;
  }
  return buffer;
}

const detector = createPitchDetector({ sampleRate: SR, size: SIZE });
const centsError = (freq, detected) => Math.abs(freqToMidi(detected) - freqToMidi(freq)) * 100;

/* -------------------------------------------------------- 半音刻みの精度 */

for (const wave of ['sine', 'saw', 'square']) {
  let worst = 0;
  let worstFreq = 0;
  let misses = 0;
  // E2 (82.41Hz) 〜 D6 (1174.66Hz) を半音刻みで
  for (let midi = 40; midi <= 86; midi += 1) {
    const freq = 440 * 2 ** ((midi - 69) / 12);
    const result = detector.detect(synth(freq, { wave }));
    if (!result) {
      misses += 1;
      continue;
    }
    const error = centsError(freq, result.freq);
    if (error > worst) {
      worst = error;
      worstFreq = freq;
    }
  }
  check(
    `${wave.padEnd(6)} E2〜D6 47音 の最大セント誤差 < 1.0`,
    worst < 1 && misses === 0,
    `最大 ${worst.toFixed(3)}¢ (${worstFreq.toFixed(1)}Hz), 検出漏れ ${misses}`
  );
}

/* --------------------------------------------------- 低音とオクターブ誤り */

{
  // 5弦ベースの B0 (30.87Hz) まで見えるか
  const detectorLow = createPitchDetector({ sampleRate: SR, size: SIZE, minFreq: 25 });
  const result = detectorLow.detect(synth(30.87, { wave: 'saw' }));
  check(
    'B0 30.87Hz を検出できる',
    result !== null && centsError(30.87, result.freq) < 5,
    result ? `${result.freq.toFixed(2)}Hz (${centsError(30.87, result.freq).toFixed(2)}¢)` : '検出できず'
  );
}

{
  // 基音が弱くても倍音側（オクターブ上）に飛ばないか
  let octaveErrors = 0;
  for (let midi = 40; midi <= 76; midi += 1) {
    const freq = 440 * 2 ** ((midi - 69) / 12);
    const result = detector.detect(synth(freq, { wave: 'weakFundamental' }));
    if (!result || centsError(freq, result.freq) > 30) octaveErrors += 1;
  }
  check('基音が弱い波形37音でオクターブ誤りなし', octaveErrors === 0, `誤り ${octaveErrors}件`);
}

/* ------------------------------------------------------------- 頑健性 */

{
  // 窓は85msあり、5Hzのビブラート約0.4周期ぶんを含む。中心へ戻ることは
  // 期待できないので、揺れの範囲内の値を安定して返すことを確かめる。
  let worst = 0;
  let misses = 0;
  for (let phase = 0; phase < 2 * Math.PI; phase += Math.PI / 4) {
    const result = detector.detect(synth(440, { wave: 'saw', vibrato: 50, phase }));
    if (!result) {
      misses += 1;
      continue;
    }
    worst = Math.max(worst, centsError(440, result.freq));
  }
  check(
    'ビブラート±50¢: 揺れの範囲内を返し検出も落ちない',
    worst < 55 && misses === 0,
    `最大 ${worst.toFixed(1)}¢, 検出漏れ ${misses}`
  );
}

{
  let worst = 0;
  for (const freq of [110, 220, 440, 880]) {
    const result = detector.detect(synth(freq, { wave: 'saw', noise: 0.05 }));
    if (!result) {
      worst = Infinity;
      break;
    }
    worst = Math.max(worst, centsError(freq, result.freq));
  }
  check('ノイズ混入(S/N約18dB)でも誤差 < 5¢', worst < 5, `最大 ${worst.toFixed(2)}¢`);
}

{
  const result = detector.detect(synth(196, { wave: 'saw', amp: 0.004 }));
  check(
    '小音量(振幅0.004)でも検出できる',
    result !== null && centsError(196, result.freq) < 2,
    result ? `${centsError(196, result.freq).toFixed(2)}¢` : '検出できず'
  );
}

{
  const silence = new Float32Array(SIZE);
  check('無音では null を返す', detector.detect(silence) === null);

  const noise = new Float32Array(SIZE);
  for (let i = 0; i < SIZE; i += 1) noise[i] = (Math.random() * 2 - 1) * 0.2;
  const result = detector.detect(noise);
  check('ホワイトノイズを音程として拾わない', result === null, result ? `${result.freq.toFixed(1)}Hz を返した` : '');
}

/* ------------------------------------------------------------- 実行速度 */

{
  const buffer = synth(440, { wave: 'saw' });
  const started = process.hrtime.bigint();
  const runs = 200;
  for (let i = 0; i < runs; i += 1) detector.detect(buffer);
  const ms = Number(process.hrtime.bigint() - started) / 1e6 / runs;
  check(`1フレームの解析時間 < 5ms`, ms < 5, `${ms.toFixed(2)}ms/フレーム`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
