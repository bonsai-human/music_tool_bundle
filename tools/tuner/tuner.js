import { resumeContext, createWakeLock } from '../../shared/js/audio.js';
import { createPitchDetector, freqToMidi, midiToFreq } from '../../shared/js/pitch.js';
import { midiToName, midiToSolfege } from '../../shared/js/note.js';
import { createPrefs } from '../../shared/js/prefs.js';
import { registerServiceWorker } from '../../shared/js/pwa.js';
import { INSTRUMENTS, findInstrument, nearestString } from './instruments.js';
import { createPitchGraph } from './graph.js';

const ACCENT = '#5aa9ff';
const IN_TUNE_CENTS = 5;
const ANALYSIS_INTERVAL = 33; // ms。30回/秒あれば表示は十分なめらか
const SMOOTHING = 5; // 中央値をとるフレーム数
const HOLD_MS = 250; // これ以上音が途切れたら表示を消す
const STABLE_FRAMES = 3; // 音域の記録に必要な連続検出数

const prefs = createPrefs('tuner', {
  instrument: 'chromatic',
  a4: 440,
  sensitivity: 70,
  naming: 'en',
  rangeLow: -1,
  rangeHigh: -1,
});

const state = prefs.load();

const el = (id) => document.getElementById(id);
const ui = {
  readout: el('readout'),
  note: el('note'),
  solfege: el('solfege'),
  freq: el('freq'),
  target: el('target'),
  cents: el('cents'),
  needle: el('needle'),
  mic: el('mic'),
  status: el('status'),
  graph: el('graph'),
  instrument: el('instrument'),
  strings: el('strings'),
  rangeChip: el('range-chip'),
  rangeLow: el('range-low'),
  rangeHigh: el('range-high'),
  rangeSpan: el('range-span'),
  rangeReset: el('range-reset'),
  a4: el('a4'),
  a4Value: el('a4-value'),
  sensitivity: el('sensitivity'),
  sensitivityValue: el('sensitivity-value'),
  naming: el('naming'),
  infoButton: el('info-button'),
  infoDialog: el('info-dialog'),
  infoClose: el('info-close'),
};

const wakeLock = createWakeLock();
const graph = createPitchGraph(ui.graph);

let ctx = null;
let stream = null;
let analyser = null;
let detector = null;
let samples = null;
let listening = false;
let rafId = null;
let lastAnalysis = 0;

const history = [];
let lastGoodAt = 0;
let stableCount = 0;
let currentTargetMidi = null;

/* --------------------------------------------------------------- 表示名 */

const noteName = (midi) => midiToName(midi).replace('#', '♯');

function fullName(midi) {
  return state.naming === 'jp' ? `${noteName(midi)} ${midiToSolfege(midi)}` : noteName(midi);
}

/** 感度スライダー(0〜100) → 無音とみなす RMS のしきい値。 */
function noiseGate() {
  return 10 ** (-1.6 - (state.sensitivity / 100) * 1.6);
}

/* --------------------------------------------------------------- マイク */

async function startListening() {
  if (!navigator.mediaDevices?.getUserMedia) {
    ui.status.textContent = 'このブラウザはマイク入力に対応していません';
    return;
  }

  ui.status.textContent = 'マイクの許可を待っています…';
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // これらが有効だと音程が歪んで正しく測れない。iOS では既定で入る
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
  } catch (error) {
    ui.status.textContent =
      error.name === 'NotAllowedError'
        ? 'マイクの使用が許可されませんでした'
        : `マイクを使えません（${error.name}）`;
    return;
  }

  ctx = await resumeContext();
  analyser = ctx.createAnalyser();
  analyser.fftSize = 4096;
  analyser.smoothingTimeConstant = 0;
  ctx.createMediaStreamSource(stream).connect(analyser);
  // 出力へはつながない（つなぐとハウリングする）

  samples = new Float32Array(analyser.fftSize);
  detector = createPitchDetector({
    sampleRate: ctx.sampleRate,
    size: analyser.fftSize,
    minFreq: 27.5,
    maxFreq: 2200,
  });

  listening = true;
  history.length = 0;
  graph.reset();
  wakeLock.set(true);
  ui.status.textContent = '音を鳴らしてください';
  ui.mic.textContent = 'マイクを停止';
  rafId = requestAnimationFrame(loop);
}

function stopListening() {
  listening = false;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (stream) for (const track of stream.getTracks()) track.stop();
  stream = null;
  analyser = null;
  wakeLock.set(false);
  ui.mic.textContent = 'マイクを開始';
  ui.status.textContent = '停止中';
  showPitch(null);
}

/* --------------------------------------------------------------- 解析 */

function loop(timestamp) {
  if (!listening) return;

  if (timestamp - lastAnalysis >= ANALYSIS_INTERVAL) {
    lastAnalysis = timestamp;
    analyser.getFloatTimeDomainData(samples);

    const result = detector.detect(samples);
    const accepted = result && result.rms >= noiseGate() ? result : null;

    if (accepted) {
      history.push(accepted.freq);
      if (history.length > SMOOTHING) history.shift();
      lastGoodAt = timestamp;
      stableCount += 1;
    } else {
      stableCount = 0;
      if (timestamp - lastGoodAt > HOLD_MS) history.length = 0;
    }

    const freq = history.length ? median(history) : null;
    showPitch(freq);
    graph.push(timestamp, freq === null ? null : freqToMidi(freq, state.a4));

    if (freq !== null && stableCount >= STABLE_FRAMES) recordRange(freqToMidi(freq, state.a4));
  }

  graph.draw(timestamp, {
    nameFor: noteName,
    accent: ACCENT,
    targetMidi: currentTargetMidi,
  });

  rafId = requestAnimationFrame(loop);
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
}

/** 実測の音高を、クロマチックか選択中の楽器の弦に当てはめる。 */
function targetFor(midi) {
  const instrument = findInstrument(state.instrument);
  return instrument.strings ? nearestString(instrument.strings, midi) : Math.round(midi);
}

function showPitch(freq) {
  if (freq === null) {
    ui.readout.dataset.state = listening ? 'waiting' : 'idle';
    ui.note.textContent = '—';
    ui.solfege.textContent = '';
    ui.freq.textContent = '—';
    ui.target.textContent = '';
    ui.cents.textContent = '—';
    ui.needle.style.setProperty('--offset', '0');
    currentTargetMidi = null;
    highlightStrings(null);
    return;
  }

  const midi = freqToMidi(freq, state.a4);
  const target = targetFor(midi);
  const cents = (midi - target) * 100;
  const clamped = Math.max(-50, Math.min(50, cents));

  currentTargetMidi = target;
  ui.readout.dataset.state = Math.abs(cents) <= IN_TUNE_CENTS ? 'in-tune' : 'off';
  ui.note.textContent = noteName(target);
  ui.solfege.textContent = state.naming === 'jp' ? midiToSolfege(target) : '';
  ui.freq.textContent = freq.toFixed(1);
  ui.target.textContent = `目標 ${midiToFreq(target, state.a4).toFixed(1)}Hz`;
  ui.cents.textContent = (cents > 0 ? '+' : '') + cents.toFixed(0);
  ui.needle.style.setProperty('--offset', String(clamped / 50));
  highlightStrings(target);
}

/* --------------------------------------------------------------- 音域 */

function recordRange(midi) {
  const rounded = Math.round(midi);
  let changed = false;
  if (state.rangeLow < 0 || rounded < state.rangeLow) {
    state.rangeLow = rounded;
    changed = true;
  }
  if (state.rangeHigh < 0 || rounded > state.rangeHigh) {
    state.rangeHigh = rounded;
    changed = true;
  }
  if (changed) {
    prefs.save(state);
    renderRange();
  }
}

function renderRange() {
  const has = state.rangeLow >= 0 && state.rangeHigh >= 0;
  ui.rangeLow.textContent = has ? fullName(state.rangeLow) : '—';
  ui.rangeHigh.textContent = has ? fullName(state.rangeHigh) : '—';
  const span = has ? state.rangeHigh - state.rangeLow : 0;
  ui.rangeSpan.textContent = has
    ? `${span}半音（${Math.floor(span / 12)}オクターブ+${span % 12}）`
    : '—';
  ui.rangeChip.textContent = has ? `${noteName(state.rangeLow)}〜${noteName(state.rangeHigh)}` : '—';
}

/* --------------------------------------------------------------- 楽器 */

function renderStrings() {
  const instrument = findInstrument(state.instrument);
  if (!instrument.strings) {
    ui.strings.replaceChildren();
    ui.strings.dataset.empty = 'true';
    return;
  }
  ui.strings.dataset.empty = 'false';
  ui.strings.replaceChildren(
    ...instrument.strings.map((midi) => {
      const chip = document.createElement('span');
      chip.className = 'string';
      chip.dataset.midi = String(midi);
      chip.textContent = noteName(midi);
      return chip;
    })
  );
}

function highlightStrings(target) {
  for (const chip of ui.strings.children) {
    chip.dataset.active = String(Number(chip.dataset.midi) === target);
  }
}

/* --------------------------------------------------------------- 入力 */

function setFill(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  input.style.setProperty(
    '--fill',
    `${(((Number(input.value) - min) / (max - min)) * 100).toFixed(2)}%`
  );
}

function renderSettings() {
  ui.instrument.value = state.instrument;
  ui.a4.value = String(state.a4);
  ui.a4Value.textContent = `${state.a4.toFixed(1)}Hz`;
  ui.sensitivity.value = String(state.sensitivity);
  ui.sensitivityValue.textContent = `${state.sensitivity}%`;
  ui.naming.value = state.naming;
  setFill(ui.a4);
  setFill(ui.sensitivity);
}

ui.instrument.replaceChildren(...INSTRUMENTS.map((i) => new Option(i.label, i.id)));
ui.instrument.addEventListener('change', () => {
  state.instrument = ui.instrument.value;
  prefs.save(state);
  renderStrings();
});

ui.a4.addEventListener('input', () => {
  state.a4 = Number(ui.a4.value);
  prefs.save(state);
  renderSettings();
});

ui.sensitivity.addEventListener('input', () => {
  state.sensitivity = Number(ui.sensitivity.value);
  prefs.save(state);
  renderSettings();
});

ui.naming.addEventListener('change', () => {
  state.naming = ui.naming.value;
  prefs.save(state);
  renderRange();
});

ui.rangeReset.addEventListener('click', () => {
  state.rangeLow = -1;
  state.rangeHigh = -1;
  prefs.save(state);
  renderRange();
});

ui.mic.addEventListener('click', () => {
  if (listening) stopListening();
  else startListening();
});

ui.infoButton.addEventListener('click', () => ui.infoDialog.showModal());
ui.infoClose.addEventListener('click', () => ui.infoDialog.close());

// タブを離れたらマイクを掴んだままにしない
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && listening) stopListening();
});

if (!window.isSecureContext) {
  ui.mic.disabled = true;
  ui.status.textContent = 'マイクを使うには https の接続が必要です';
}

renderSettings();
renderStrings();
renderRange();
showPitch(null);
registerServiceWorker();
