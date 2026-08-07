import { resumeContext, createWakeLock } from '../../shared/js/audio.js';
import { createScheduler } from '../../shared/js/scheduler.js';
import { createPrefs } from '../../shared/js/prefs.js';
import { registerServiceWorker } from '../../shared/js/pwa.js';
import { createEngine, VOICES } from './engine.js';
import {
  METERS,
  MAX_BEATS,
  PATTERNS,
  findPattern,
  defaultAccents,
  resizeAccents,
  tempoTerm,
} from './patterns.js';

const MIN_BPM = 20;
const MAX_BPM = 300;

const prefs = createPrefs('metronome', {
  bpm: 100,
  beats: 4,
  unit: 4,
  pattern: 'basic',
  accents: 'SWWW',
  voice: 'click',
  volume: 0.8,
  muted: false,
  programOn: false,
  programStart: 90,
  programGoal: 120,
  programStep: 4,
  programBars: 4,
  programRepeats: 2,
  programCountIn: true,
  programBell: true,
});

const state = prefs.load();
state.accents = resizeAccents(state.accents, state.beats);

const el = (id) => document.getElementById(id);
const ui = {
  ring: el('ring'),
  markers: el('markers'),
  transport: el('transport'),
  transportLabel: el('transport-label'),
  bpm: el('bpm'),
  term: el('term'),
  position: el('position'),
  elapsed: el('elapsed'),
  rewind: el('rewind'),
  bpmDown: el('bpm-down'),
  bpmUp: el('bpm-up'),
  tap: el('tap'),
  meterOpen: el('meter-open'),
  meterLabel: el('meter-label'),
  meterDialog: el('meter-dialog'),
  meterGrid: el('meter-grid'),
  meterClose: el('meter-close'),
  beats: el('beats'),
  unit: el('unit'),
  pattern: el('pattern'),
  accents: el('accents'),
  voice: el('voice'),
  volume: el('volume'),
  keypadOpen: el('keypad-open'),
  keypadDialog: el('keypad-dialog'),
  keypad: el('keypad'),
  keypadDisplay: el('keypad-display'),
  mute: el('mute'),
  infoButton: el('info-button'),
  infoDialog: el('info-dialog'),
  infoClose: el('info-close'),
  programOn: el('program-on'),
  programState: el('program-state'),
  programPlan: el('program-plan'),
};

const PROGRAM_FIELDS = {
  programStart: el('program-start'),
  programGoal: el('program-goal'),
  programStep: el('program-step'),
  programBars: el('program-bars'),
  programRepeats: el('program-repeats'),
  programCountIn: el('program-countin'),
  programBell: el('program-bell'),
};

const wakeLock = createWakeLock();
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let ctx = null;
let engine = null;
let scheduler = null;
let running = false;

// 再生位置（次に予約するイベント）
const pos = { beat: 0, slot: 0 };
let barNumber = 1;
let countingIn = false;
let barsAtStep = 0;
let programDone = false;
let pendingStop = null;

const visualQueue = [];
let rafId = null;
let startedAt = 0;
let elapsedMs = 0;

const subdivision = () => findPattern(state.pattern).subdivision;
const slotMap = () => findPattern(state.pattern).slots;

/* ------------------------------------------------------------- 再生 */

/** そのスロットで鳴らす音の種類。鳴らさないなら null。 */
function slotKind(beat, slot) {
  const char = slotMap()[slot] ?? 's';
  if (char === '-') return null;
  if (char === 'B') {
    const accent = state.accents[beat];
    if (accent === 'S') return 'accent';
    if (accent === 'W') return 'normal';
    return null; // 'R' = 休
  }
  return 'sub';
}

function onEvent(time) {
  if (programDone) return 0.05;

  if (countingIn) {
    if (pos.slot === 0) engine.play(time, pos.beat === 0 ? 'accent' : 'normal');
  } else {
    const kind = slotKind(pos.beat, pos.slot);
    if (kind) engine.play(time, kind);
  }

  visualQueue.push({ time, beat: pos.beat, slot: pos.slot, bar: barNumber, countIn: countingIn });

  advance(time);
  return 60 / state.bpm / subdivision();
}

function advance(time) {
  pos.slot += 1;
  if (pos.slot < subdivision()) return;
  pos.slot = 0;

  pos.beat += 1;
  if (pos.beat < state.beats) return;
  pos.beat = 0;

  onBarComplete(time);
}

function onBarComplete(time) {
  if (countingIn) {
    countingIn = false;
    barNumber = 1;
    return;
  }

  barNumber += 1;
  if (!state.programOn) return;

  barsAtStep += 1;
  if (barsAtStep < state.programBars * state.programRepeats) return;

  barsAtStep = 0;
  if (state.bpm >= state.programGoal) {
    programDone = true;
    pendingStop = time;
    return;
  }
  setBpm(Math.min(state.bpm + state.programStep, state.programGoal), { fromProgram: true });
  if (state.programBell) engine.play(time, 'bell');
}

async function start() {
  ctx = await resumeContext();
  if (!engine) engine = createEngine(ctx);
  engine.setVoice(state.voice);
  engine.setVolume(state.volume, state.muted);

  if (state.programOn) {
    setBpm(clampBpm(state.programStart), { fromProgram: true });
  }

  pos.beat = 0;
  pos.slot = 0;
  barNumber = state.programOn && state.programCountIn ? 0 : 1;
  countingIn = state.programOn && state.programCountIn;
  barsAtStep = 0;
  programDone = false;
  pendingStop = null;
  visualQueue.length = 0;
  elapsedMs = 0;
  startedAt = performance.now();

  scheduler = createScheduler(ctx, onEvent);
  scheduler.start();
  running = true;
  wakeLock.set(true);
  rafId = requestAnimationFrame(frame);
  render();
}

function stop() {
  if (scheduler) scheduler.stop();
  running = false;
  pendingStop = null;
  visualQueue.length = 0;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  if (engine) engine.setVolume(state.volume, true);
  wakeLock.set(false);
  clearBeatHighlight();
  render();
}

async function toggle() {
  if (running) {
    stop();
  } else {
    try {
      await start();
    } catch (error) {
      ui.position.textContent = `再生できませんでした：${error.message}`;
    }
  }
}

/* ----------------------------------------------------------- 画面更新 */

function frame() {
  const now = ctx.currentTime;

  while (visualQueue.length && visualQueue[0].time <= now) {
    const ev = visualQueue.shift();
    if (ev.slot === 0) showBeat(ev);
  }

  if (pendingStop !== null && now >= pendingStop) {
    stop();
    ui.position.textContent = '目標テンポに到達しました';
    return;
  }

  elapsedMs = performance.now() - startedAt;
  ui.elapsed.textContent = formatTime(elapsedMs);

  if (running) rafId = requestAnimationFrame(frame);
}

function showBeat({ beat, bar, countIn }) {
  clearBeatHighlight();
  const marker = ui.markers.children[beat];
  if (marker) {
    marker.dataset.current = 'true';
    if (!reduceMotion) {
      marker.animate(
        [{ transform: 'scale(1.9)' }, { transform: 'scale(1)' }],
        { duration: 260, easing: 'cubic-bezier(.2,.7,.3,1)' }
      );
    }
  }
  ui.position.textContent = countIn
    ? `カウント ${beat + 1}`
    : `小節 ${bar} ・ 拍 ${beat + 1}`;
}

function clearBeatHighlight() {
  for (const marker of ui.markers.children) delete marker.dataset.current;
}

function formatTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function buildMarkers() {
  const nodes = [];
  for (let i = 0; i < state.beats; i += 1) {
    const angle = (i / state.beats) * Math.PI * 2 - Math.PI / 2;
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    marker.setAttribute('class', 'marker');
    marker.setAttribute('cx', (150 + Math.cos(angle) * 120).toFixed(2));
    marker.setAttribute('cy', (150 + Math.sin(angle) * 120).toFixed(2));
    marker.setAttribute('r', state.accents[i] === 'S' ? 11 : state.accents[i] === 'W' ? 7 : 4);
    marker.dataset.accent = state.accents[i];
    nodes.push(marker);
  }
  ui.markers.replaceChildren(...nodes);
}

const ACCENT_LABEL = { S: '強', W: '弱', R: '休' };

function buildAccents() {
  ui.accents.replaceChildren(
    ...Array.from({ length: state.beats }, (_, i) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'accent';
      button.dataset.accent = state.accents[i];
      button.innerHTML = `<span class="accent__beat">${i + 1}</span>
        <span class="accent__mark">${ACCENT_LABEL[state.accents[i]]}</span>`;
      button.setAttribute('aria-label', `${i + 1}拍目 ${ACCENT_LABEL[state.accents[i]]}`);
      button.addEventListener('click', () => {
        const order = 'SWR';
        const next = order[(order.indexOf(state.accents[i]) + 1) % 3];
        state.accents = state.accents.slice(0, i) + next + state.accents.slice(i + 1);
        commit();
      });
      return button;
    })
  );
}

function programPlanText() {
  const span = Math.max(0, state.programGoal - state.programStart);
  const steps = Math.floor(span / state.programStep) + 1;
  const bars = state.programBars * state.programRepeats;
  return `${state.programStart} → ${state.programGoal} BPM ／ ${state.programBars}小節 × ${state.programRepeats}回 = ${bars}小節ごとに +${state.programStep} BPM ／ 全${steps}段`;
}

function render() {
  ui.bpm.textContent = String(state.bpm);
  ui.term.textContent = tempoTerm(state.bpm);
  ui.ring.setAttribute('aria-valuenow', String(state.bpm));
  ui.ring.setAttribute('aria-valuetext', `${state.bpm} BPM`);

  ui.transport.setAttribute('aria-pressed', String(running));
  ui.transportLabel.textContent = running ? '停止' : '開始';

  ui.meterLabel.textContent = `${state.beats}/${state.unit}`;
  ui.beats.value = String(state.beats);
  ui.unit.value = String(state.unit);
  ui.pattern.value = state.pattern;
  ui.voice.value = state.voice;
  ui.volume.value = String(Math.round(state.volume * 100));
  setFill(ui.volume);

  ui.mute.setAttribute('aria-pressed', String(state.muted));
  ui.mute.dataset.muted = String(state.muted);

  ui.programOn.checked = state.programOn;
  for (const [key, node] of Object.entries(PROGRAM_FIELDS)) {
    if (node.type === 'checkbox') node.checked = state[key];
    else node.value = String(state[key]);
  }
  ui.programState.textContent = state.programOn ? `${state.programStart}→${state.programGoal}` : 'オフ';
  ui.programPlan.textContent = programPlanText();

  for (const [i, marker] of [...ui.markers.children].entries()) {
    marker.setAttribute('r', state.accents[i] === 'S' ? 11 : state.accents[i] === 'W' ? 7 : 4);
    marker.dataset.accent = state.accents[i];
  }

  if (!running) {
    ui.position.textContent = `小節 1 ・ 拍 1`;
    ui.elapsed.textContent = formatTime(elapsedMs);
  }

  if (engine) {
    engine.setVoice(state.voice);
    engine.setVolume(state.volume, state.muted || !running);
  }
}

function setFill(input) {
  const min = Number(input.min);
  const max = Number(input.max);
  input.style.setProperty('--fill', `${(((Number(input.value) - min) / (max - min)) * 100).toFixed(2)}%`);
}

function commit({ rebuild = true } = {}) {
  if (rebuild) {
    buildMarkers();
    buildAccents();
  }
  prefs.save(state);
  render();
}

/* --------------------------------------------------------------- 操作 */

const clampBpm = (value) => Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(value)));

function setBpm(value, { fromProgram = false } = {}) {
  const next = clampBpm(value);
  if (next === state.bpm) return;
  state.bpm = next;
  if (!fromProgram) prefs.save(state);
  ui.bpm.textContent = String(next);
  ui.term.textContent = tempoTerm(next);
  ui.ring.setAttribute('aria-valuenow', String(next));
  ui.ring.setAttribute('aria-valuetext', `${next} BPM`);
}

function setMeter(beats, unit, { applyDefaultAccents = true } = {}) {
  state.beats = Math.min(MAX_BEATS, Math.max(1, beats));
  state.unit = unit;
  state.accents = applyDefaultAccents
    ? defaultAccents(state.beats, state.unit)
    : resizeAccents(state.accents, state.beats);
  commit();
}

// ± ボタン（押しっぱなしで連続）
function holdRepeat(button, action) {
  let timer = null;
  let interval = null;

  const stopRepeat = () => {
    clearTimeout(timer);
    clearInterval(interval);
    timer = null;
    interval = null;
  };

  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    action();
    timer = setTimeout(() => {
      interval = setInterval(action, 70);
    }, 420);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) {
    button.addEventListener(type, stopRepeat);
  }
}

holdRepeat(ui.bpmDown, () => setBpm(state.bpm - 1));
holdRepeat(ui.bpmUp, () => setBpm(state.bpm + 1));

// リングのドラッグでテンポ調整（角度の変化量で相対的に動かす）
{
  let dragging = false;
  let lastAngle = 0;
  let residue = 0;

  const angleAt = (event, rect) =>
    Math.atan2(event.clientY - (rect.top + rect.height / 2), event.clientX - (rect.left + rect.width / 2));

  ui.ring.addEventListener('pointerdown', (event) => {
    const rect = ui.ring.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const distance = Math.hypot(dx, dy) / (rect.width / 2);
    if (distance < 0.5 || distance > 1.05) return; // リングの帯の上だけ反応
    dragging = true;
    residue = 0;
    lastAngle = angleAt(event, rect);
    ui.ring.setPointerCapture(event.pointerId);
  });

  ui.ring.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    const rect = ui.ring.getBoundingClientRect();
    const angle = angleAt(event, rect);
    let delta = angle - lastAngle;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    lastAngle = angle;

    // 1周（360°）でおよそ100BPM動く
    residue += (delta / (Math.PI * 2)) * 100;
    const steps = Math.trunc(residue);
    if (steps) {
      residue -= steps;
      setBpm(state.bpm + steps);
    }
  });

  for (const type of ['pointerup', 'pointercancel']) {
    ui.ring.addEventListener(type, () => {
      if (!dragging) return;
      dragging = false;
      prefs.save(state);
    });
  }

  ui.ring.addEventListener('keydown', (event) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[event.key];
    if (step) {
      event.preventDefault();
      setBpm(state.bpm + step * (event.shiftKey ? 10 : 1));
      prefs.save(state);
    } else if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      toggle();
    }
  });
}

// TAP テンポ
{
  let taps = [];
  ui.tap.addEventListener('click', () => {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2200) taps = [];
    taps.push(now);
    if (taps.length > 6) taps.shift();
    if (taps.length < 2) return;

    let total = 0;
    for (let i = 1; i < taps.length; i += 1) total += taps[i] - taps[i - 1];
    setBpm(60000 / (total / (taps.length - 1)));
    prefs.save(state);
  });
}

// テンキー
{
  let buffer = '';

  const refresh = () => {
    ui.keypadDisplay.textContent = buffer || String(state.bpm);
    ui.keypadDisplay.dataset.editing = String(buffer.length > 0);
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CL', '0', 'OK'];
  ui.keypad.replaceChildren(
    ...keys.map((key) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = key === 'OK' ? 'key key--ok' : key === 'CL' ? 'key key--clear' : 'key';
      button.textContent = key === 'OK' ? '決定' : key;
      button.addEventListener('click', () => {
        if (key === 'CL') buffer = '';
        else if (key === 'OK') {
          if (buffer) {
            setBpm(Number(buffer));
            prefs.save(state);
          }
          ui.keypadDialog.close();
          return;
        } else if (buffer.length < 3) buffer += key;
        refresh();
      });
      return button;
    })
  );

  ui.keypadOpen.addEventListener('click', () => {
    buffer = '';
    refresh();
    ui.keypadDialog.showModal();
  });
}

// 拍子ダイアログ
{
  ui.meterGrid.replaceChildren(
    ...METERS.map(([beats, unit]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'meter-chip';
      button.dataset.meter = `${beats}/${unit}`;
      button.innerHTML = `<span>${beats}</span><span>${unit}</span>`;
      button.addEventListener('click', () => {
        setMeter(beats, unit);
        syncMeterChips();
      });
      return button;
    })
  );

  ui.beats.replaceChildren(
    ...Array.from({ length: MAX_BEATS }, (_, i) => new Option(String(i + 1), String(i + 1)))
  );

  ui.beats.addEventListener('change', () => {
    setMeter(Number(ui.beats.value), state.unit, { applyDefaultAccents: false });
    syncMeterChips();
  });
  ui.unit.addEventListener('change', () => {
    setMeter(state.beats, Number(ui.unit.value), { applyDefaultAccents: false });
    syncMeterChips();
  });

  ui.meterOpen.addEventListener('click', () => {
    syncMeterChips();
    ui.meterDialog.showModal();
  });
  ui.meterClose.addEventListener('click', () => ui.meterDialog.close());
}

function syncMeterChips() {
  const current = `${state.beats}/${state.unit}`;
  for (const chip of ui.meterGrid.children) {
    chip.setAttribute('aria-current', String(chip.dataset.meter === current));
  }
}

// リズム・音色・音量
ui.pattern.replaceChildren(...PATTERNS.map((p) => new Option(p.label, p.id)));
ui.pattern.addEventListener('change', () => {
  state.pattern = ui.pattern.value;
  commit({ rebuild: false });
});

ui.voice.replaceChildren(...VOICES.map((v) => new Option(v.label, v.id)));
ui.voice.addEventListener('change', () => {
  state.voice = ui.voice.value;
  commit({ rebuild: false });
});

ui.volume.addEventListener('input', () => {
  state.volume = Number(ui.volume.value) / 100;
  commit({ rebuild: false });
});

ui.mute.addEventListener('click', () => {
  state.muted = !state.muted;
  commit({ rebuild: false });
});

// 練習プログラム
ui.programOn.addEventListener('change', () => {
  state.programOn = ui.programOn.checked;
  commit({ rebuild: false });
});

for (const [key, node] of Object.entries(PROGRAM_FIELDS)) {
  node.addEventListener('change', () => {
    if (node.type === 'checkbox') {
      state[key] = node.checked;
    } else {
      const min = Number(node.min);
      const max = Number(node.max);
      const value = Math.min(max, Math.max(min, Math.round(Number(node.value) || min)));
      state[key] = value;
    }
    commit({ rebuild: false });
  });
}

// トランスポート
ui.transport.addEventListener('click', toggle);
ui.rewind.addEventListener('click', async () => {
  if (running) {
    stop();
    await start();
  } else {
    elapsedMs = 0;
    render();
  }
});

ui.infoButton.addEventListener('click', () => ui.infoDialog.showModal());
ui.infoClose.addEventListener('click', () => ui.infoDialog.close());

// タブを離れるとブラウザがタイマーを絞るので、鳴らしっぱなしにしない
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && running) stop();
});

if (!(window.AudioContext || window.webkitAudioContext)) {
  ui.transport.disabled = true;
  ui.position.textContent = 'このブラウザは Web Audio API に対応していません。';
}

buildMarkers();
buildAccents();
syncMeterChips();
render();
registerServiceWorker();
