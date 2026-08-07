import { resumeContext, volumeToGain, createWakeLock } from '../../shared/js/audio.js';
import { midiToFreq, midiToName } from '../../shared/js/note.js';
import { WAVEFORMS, createWaveCache } from '../../shared/js/wave.js';
import { createPrefs } from '../../shared/js/prefs.js';
import { registerServiceWorker } from '../../shared/js/pwa.js';

const MIN_MIDI = 33; // A1
const MAX_MIDI = 96; // C7
const A_TICKS = [33, 45, 57, 69, 81, 93]; // A1〜A6
const C_TICKS = [36, 48, 60, 72, 84, 96]; // C2〜C7
const CALIBRATION_TICKS = [415, 440, 466];
const FADE_IN = 0.03;
const FADE_OUT = 0.08;

const prefs = createPrefs('tuning-fork', {
  midi: 69,
  a4: 440,
  volume: 0.7,
  harmonics: 0.35,
  waveform: 'sine',
});

const state = prefs.load();

const el = {
  toggle: document.getElementById('toggle'),
  toggleLabel: document.getElementById('toggle-label'),
  noteName: document.getElementById('note-name'),
  frequency: document.getElementById('frequency'),
  calibrationReadout: document.getElementById('calibration-readout'),
  hint: document.getElementById('hint'),
  note: document.getElementById('note'),
  calibration: document.getElementById('calibration'),
  volume: document.getElementById('volume'),
  harmonics: document.getElementById('harmonics'),
  harmonicsControl: document.getElementById('harmonics-control'),
  waveforms: document.getElementById('waveforms'),
  ticksA: document.getElementById('ticks-a'),
  ticksC: document.getElementById('ticks-c'),
  ticksCalibration: document.getElementById('ticks-calibration'),
  infoButton: document.getElementById('info-button'),
  infoDialog: document.getElementById('info-dialog'),
  infoClose: document.getElementById('info-close'),
};

const wakeLock = createWakeLock();

/** 発音中のノード一式。停止中は null。 */
/** @type {{ctx: AudioContext, osc: OscillatorNode, gain: GainNode} | null} */
let voice = null;
let getWave = null;

const currentFrequency = () => midiToFreq(state.midi, state.a4);
const isSine = () => state.waveform === 'sine';

/* ------------------------------------------------------------------ 音 */

async function startTone() {
  const ctx = await resumeContext();
  if (!getWave) {
    getWave = createWaveCache(ctx);
    // 着信やスリープで AudioContext が止められたら表示を停止状態に戻す
    ctx.addEventListener('statechange', () => {
      if (ctx.state !== 'running' && voice) {
        stopTone();
        render();
      }
    });
  }

  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.frequency.value = currentFrequency();
  osc.setPeriodicWave(getWave(state.waveform, state.harmonics, currentFrequency()));
  osc.connect(gain);
  osc.start();

  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volumeToGain(state.volume), now + FADE_IN);

  voice = { ctx, osc, gain };
  wakeLock.set(true);
}

function stopTone() {
  if (!voice) return;
  const { ctx, osc, gain } = voice;
  voice = null;

  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + FADE_OUT);
  osc.stop(now + FADE_OUT + 0.02);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };

  wakeLock.set(false);
}

/** 発音中なら現在の設定を音へ反映する。 */
function applyToVoice() {
  if (!voice) return;
  const { ctx, osc, gain } = voice;
  const freq = currentFrequency();
  osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.008);
  osc.setPeriodicWave(getWave(state.waveform, state.harmonics, freq));
  gain.gain.setTargetAtTime(volumeToGain(state.volume), ctx.currentTime, 0.02);
}

async function toggle() {
  if (voice) {
    stopTone();
  } else {
    try {
      await startTone();
    } catch (error) {
      el.hint.textContent = `音を再生できませんでした：${error.message}`;
      return;
    }
  }
  render();
}

/* ------------------------------------------------------------- 画面更新 */

/** 目盛りを一度だけ組み立て、以降は data-active の付け替えだけを行う。 */
function buildTicks(container, [min, max], values, toLabel) {
  container.replaceChildren(
    ...values.map((value) => {
      const span = document.createElement('span');
      span.className = 'ticks__item';
      span.style.setProperty('--pos', String((value - min) / (max - min)));
      span.dataset.value = String(value);
      span.textContent = toLabel(value);
      return span;
    })
  );
}

function highlightTicks(container, activeValue) {
  for (const item of container.children) {
    item.dataset.active = String(Math.abs(Number(item.dataset.value) - activeValue) < 1e-6);
  }
}

function setFill(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  const pos = (Number(input.value) - min) / (max - min);
  input.style.setProperty('--fill', `${(pos * 100).toFixed(2)}%`);
}

function buildWaveforms() {
  const icons = {
    sine: 'M2 12 q3 -9 6 0 t6 0 t6 0 t6 0 t6 0 t6 0',
    triangle: 'M2 20 L8 4 L14 20 L20 4 L26 20 L32 4 L38 20 L42 12',
    sawtooth: 'M2 20 L15 5 L15 20 L28 5 L28 20 L41 5 L41 20',
    square: 'M2 20 L2 4 L10 4 L10 20 L18 20 L18 4 L26 4 L26 20 L34 20 L34 4 L42 4',
  };

  el.waveforms.replaceChildren(
    ...WAVEFORMS.map((wave) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'waveform';
      button.setAttribute('role', 'radio');
      button.dataset.waveform = wave.id;
      button.innerHTML = `
        <svg viewBox="0 0 44 24" fill="none" stroke="currentColor" stroke-width="2.2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="${icons[wave.id]}" />
        </svg>
        <span>${wave.label}</span>`;
      button.addEventListener('click', () => {
        state.waveform = wave.id;
        applyToVoice();
        commit();
      });
      return button;
    })
  );
}

function render() {
  const freq = currentFrequency();
  const playing = Boolean(voice);

  el.noteName.textContent = midiToName(state.midi);
  el.frequency.textContent = freq.toFixed(1);
  el.calibrationReadout.textContent = state.a4.toFixed(1);

  el.note.value = String(state.midi);
  el.calibration.value = String(state.a4);
  el.volume.value = String(Math.round(state.volume * 100));
  el.harmonics.value = String(Math.round(state.harmonics * 100));
  [el.note, el.calibration, el.volume, el.harmonics].forEach(setFill);

  el.note.setAttribute('aria-valuetext', `${midiToName(state.midi)} ${freq.toFixed(1)}Hz`);
  el.calibration.setAttribute('aria-valuetext', `${state.a4.toFixed(1)}Hz`);

  el.harmonics.disabled = isSine();
  el.harmonicsControl.dataset.disabled = String(isSine());

  for (const button of el.waveforms.children) {
    button.setAttribute('aria-checked', String(button.dataset.waveform === state.waveform));
    button.tabIndex = button.dataset.waveform === state.waveform ? 0 : -1;
  }

  el.toggle.setAttribute('aria-pressed', String(playing));
  el.toggleLabel.textContent = playing ? '音を止める' : '音を鳴らす';
  el.hint.textContent = playing
    ? 'もう一度タップで停止'
    : isSine()
      ? '音叉をタップすると鳴ります'
      : `音叉をタップすると鳴ります（${
          WAVEFORMS.find((w) => w.id === state.waveform).label
        }・高調波 ${Math.round(state.harmonics * 100)}%）`;

  highlightTicks(el.ticksA, state.midi);
  highlightTicks(el.ticksC, state.midi);
  highlightTicks(el.ticksCalibration, state.a4);
}

/** 状態を保存してから再描画する。 */
function commit() {
  prefs.save(state);
  render();
}

/* --------------------------------------------------------------- 入力 */

el.toggle.addEventListener('click', toggle);

el.note.addEventListener('input', () => {
  state.midi = Number(el.note.value);
  applyToVoice();
  commit();
});

el.calibration.addEventListener('input', () => {
  state.a4 = Number(el.calibration.value);
  applyToVoice();
  commit();
});

el.volume.addEventListener('input', () => {
  state.volume = Number(el.volume.value) / 100;
  applyToVoice();
  commit();
});

el.harmonics.addEventListener('input', () => {
  state.harmonics = Number(el.harmonics.value) / 100;
  applyToVoice();
  commit();
});

// 波形ボタンは radiogroup なので左右キーで移動できるようにする
el.waveforms.addEventListener('keydown', (event) => {
  const keys = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };
  const step = keys[event.key];
  if (!step) return;
  event.preventDefault();
  const index = WAVEFORMS.findIndex((w) => w.id === state.waveform);
  const next = WAVEFORMS[(index + step + WAVEFORMS.length) % WAVEFORMS.length];
  state.waveform = next.id;
  applyToVoice();
  commit();
  el.waveforms.querySelector(`[data-waveform="${next.id}"]`).focus();
});

el.infoButton.addEventListener('click', () => el.infoDialog.showModal());
el.infoClose.addEventListener('click', () => el.infoDialog.close());

// タブを離れたら鳴らしっぱなしにしない
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && voice) {
    stopTone();
    render();
  }
});

if (!(window.AudioContext || window.webkitAudioContext)) {
  el.toggle.disabled = true;
}

buildTicks(el.ticksA, [MIN_MIDI, MAX_MIDI], A_TICKS, (v) => midiToName(v));
buildTicks(el.ticksC, [MIN_MIDI, MAX_MIDI], C_TICKS, (v) => midiToName(v));
buildTicks(el.ticksCalibration, [415, 466], CALIBRATION_TICKS, (v) => `${v}Hz`);
buildWaveforms();
render();

if (el.toggle.disabled) {
  el.hint.textContent = 'このブラウザは Web Audio API に対応していません。';
}
registerServiceWorker();
