import { resumeContext } from '../../shared/js/audio.js';
import { detectChords, intervalName, pitchName } from '../../shared/js/chords.js';
import { createPrefs } from '../../shared/js/prefs.js';
import { registerServiceWorker } from '../../shared/js/pwa.js';
import { createKeyboardVoice } from './voice.js';

const WHITE = [0, 2, 4, 5, 7, 9, 11];
const BLACK = [1, 3, 6, 8, 10];
/** 黒鍵を白鍵何個ぶんの位置に置くか。 */
const BLACK_POSITION = { 1: 1, 3: 2, 6: 4, 8: 5, 10: 6 };

const prefs = createPrefs('chord-finder', {
  // ピッチクラスの選択状態を12桁のビット文字列で持つ（prefs は素の値のみ扱う）
  selection: '000000000000',
  bass: -1,
});

const state = prefs.load();
let selected = new Set(
  [...state.selection].flatMap((bit, pc) => (bit === '1' ? [pc] : []))
);
let bass = state.bass >= 0 && state.bass <= 11 ? state.bass : null;
let candidates = [];
let chosen = 0;

const el = (id) => document.getElementById(id);
const ui = {
  keyboard: el('keyboard'),
  chordName: el('chord-name'),
  chordNote: el('chord-note'),
  tones: el('tones'),
  alts: el('alts'),
  altsSection: el('alts-section'),
  bass: el('bass'),
  clear: el('clear'),
  play: el('play'),
  hint: el('hint'),
  infoButton: el('info-button'),
  infoDialog: el('info-dialog'),
  infoClose: el('info-close'),
};

let ctx = null;
let voice = null;

/* ------------------------------------------------------------- 鍵盤 */

function buildKeyboard() {
  const keys = [];

  for (const pc of WHITE) {
    const key = document.createElement('button');
    key.type = 'button';
    key.className = 'key key--white';
    key.dataset.pc = String(pc);
    key.innerHTML = `<span class="key__degree"></span><span class="key__name"></span>`;
    keys.push(key);
  }

  for (const pc of BLACK) {
    const key = document.createElement('button');
    key.type = 'button';
    key.className = 'key key--black';
    key.dataset.pc = String(pc);
    // 白鍵の境目に中心を合わせる
    key.style.left = `calc(${BLACK_POSITION[pc]} * 100% / 7)`;
    key.innerHTML = `<span class="key__degree"></span><span class="key__name"></span>`;
    keys.push(key);
  }

  ui.keyboard.replaceChildren(...keys);
  ui.keyboard.addEventListener('click', (event) => {
    const key = event.target.closest('.key');
    if (!key) return;
    toggle(Number(key.dataset.pc));
  });
}

function toggle(pc) {
  if (selected.has(pc)) {
    selected.delete(pc);
    if (bass === pc) bass = null;
  } else {
    selected.add(pc);
  }
  chosen = 0;
  update();
}

/* ------------------------------------------------------------- 表示 */

/** 表示中の候補。無ければ null。 */
const current = () => candidates[chosen] || null;

function useFlat() {
  const candidate = current();
  return candidate ? candidate.useFlat : false;
}

function update() {
  const pcs = [...selected].sort((a, b) => a - b);
  candidates = detectChords(pcs, bass);
  if (chosen >= candidates.length) chosen = 0;

  renderResult(pcs);
  renderKeys(pcs);
  renderBassOptions(pcs);

  ui.play.disabled = pcs.length === 0;
  ui.clear.disabled = pcs.length === 0;

  prefs.save({
    selection: Array.from({ length: 12 }, (_, pc) => (selected.has(pc) ? '1' : '0')).join(''),
    bass: bass ?? -1,
  });
}

function renderResult(pcs) {
  const candidate = current();
  const flat = useFlat();

  if (pcs.length === 0) {
    ui.chordName.textContent = '音を選んでください';
    ui.chordName.dataset.empty = 'true';
    ui.chordNote.textContent = '鍵盤を2つ以上タップします';
    ui.hint.textContent = 'ベース音の指定で転回形も判定します';
    ui.tones.replaceChildren();
    ui.altsSection.dataset.visible = 'false';
    return;
  }

  ui.chordName.dataset.empty = 'false';

  if (pcs.length === 1) {
    ui.chordName.textContent = pitchName(pcs[0]);
    ui.chordNote.textContent = '単音（もう1音選ぶと和音を判定します）';
  } else if (!candidate) {
    ui.chordName.textContent = '該当なし';
    ui.chordNote.textContent =
      pcs.length === 2
        ? `2音の音程：${intervalName(pcs[0], pcs[1])}`
        : '辞書にある和音と一致しませんでした';
  } else {
    ui.chordName.textContent = candidate.name;
    const parts = [];
    if (candidate.omitted.length) parts.push(`${candidate.omitted.join('・')}th省略`);
    if (pcs.length === 2) parts.push(intervalName(pcs[0], pcs[1]));
    ui.chordNote.textContent = parts.join(' ／ ') || `${candidate.tones.length}音`;
  }

  // 構成音（コード上の並び順、度数つき）
  const tones = candidate
    ? candidate.tones
    : pcs.map((pc) => ({ pc, degree: '', name: pitchName(pc, flat) }));
  ui.tones.replaceChildren(
    ...tones.map((tone) => {
      const li = document.createElement('li');
      li.className = 'tone';
      if (bass === tone.pc) li.dataset.bass = 'true';
      li.innerHTML = `<span class="tone__degree">${tone.degree || '&nbsp;'}</span>
        <span class="tone__name">${tone.name}</span>`;
      return li;
    })
  );

  // ほかの解釈
  const others = candidates.slice(0, 6);
  ui.altsSection.dataset.visible = String(others.length >= 2);
  ui.alts.replaceChildren(
    ...others.map((alt, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'alt';
      button.setAttribute('aria-current', String(index === chosen));
      button.textContent = alt.name + (alt.omitted.length ? ' (om5)' : '');
      button.addEventListener('click', () => {
        chosen = index;
        update();
      });
      return button;
    })
  );
}

function renderKeys(pcs) {
  const candidate = current();
  const flat = useFlat();
  const chordTones = new Map((candidate?.tones ?? []).map((tone) => [tone.pc, tone]));

  for (const key of ui.keyboard.children) {
    const pc = Number(key.dataset.pc);
    const on = selected.has(pc);
    const tone = chordTones.get(pc);
    key.dataset.on = String(on);
    key.dataset.bass = String(bass === pc);
    key.setAttribute('aria-pressed', String(on));
    key.querySelector('.key__name').textContent = tone ? tone.name : pitchName(pc, flat);
    key.querySelector('.key__degree').textContent = on && tone ? tone.degree : '';
  }

  // どちらも 320px 幅で1行に収まる長さにしている（高さが変わると鍵盤が動くため）
  ui.hint.textContent =
    pcs.length >= 3 && candidates.length >= 2
      ? '複数の読み方はベース音で絞り込めます'
      : 'ベース音の指定で転回形も判定します';
}

function renderBassOptions(pcs) {
  const flat = useFlat();
  const names = new Map((current()?.tones ?? []).map((tone) => [tone.pc, tone.name]));
  const options = [new Option('自動', '-1')];
  for (const pc of pcs) options.push(new Option(names.get(pc) ?? pitchName(pc, flat), String(pc)));
  ui.bass.replaceChildren(...options);
  ui.bass.value = String(bass ?? -1);
  ui.bass.disabled = pcs.length === 0;
}

/* ------------------------------------------------------------- 再生 */

/** ベース（無ければ最初の構成音）を C3〜B3 に置き、上へ積み上げる。 */
function voicing(pcs) {
  if (!pcs.length) return [];
  const candidate = current();
  const ordered = candidate ? candidate.tones.map((tone) => tone.pc) : pcs;
  const root = bass ?? ordered[0];

  const rest = ordered.filter((pc) => pc !== root);
  const midis = [48 + root];
  let previous = midis[0];
  for (const pc of rest) {
    let midi = 48 + pc;
    while (midi <= previous) midi += 12;
    midis.push(midi);
    previous = midi;
  }
  return midis;
}

async function play() {
  const pcs = [...selected].sort((a, b) => a - b);
  if (!pcs.length) return;
  ctx = await resumeContext();
  if (!voice) voice = createKeyboardVoice(ctx);
  voice.play(voicing(pcs), 'block');
}

/* ------------------------------------------------------------- 入力 */

ui.bass.addEventListener('change', () => {
  const value = Number(ui.bass.value);
  bass = value < 0 ? null : value;
  chosen = 0;
  update();
});

ui.clear.addEventListener('click', () => {
  selected = new Set();
  bass = null;
  chosen = 0;
  update();
});

ui.play.addEventListener('click', play);
ui.infoButton.addEventListener('click', () => ui.infoDialog.showModal());
ui.infoClose.addEventListener('click', () => ui.infoDialog.close());

buildKeyboard();
update();
registerServiceWorker();
