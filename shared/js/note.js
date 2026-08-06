/**
 * 音名 / MIDIノート番号 / 周波数 の相互変換。
 * 中央ハ = C4 = MIDI 60（科学的音高表記）を採用する。
 */

export const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** MIDIノート番号 → 周波数(Hz)。a4 は A4 の基準周波数。 */
export function midiToFreq(midi, a4 = 440) {
  return a4 * Math.pow(2, (midi - 69) / 12);
}

/** 周波数(Hz) → MIDIノート番号（小数を含む）。 */
export function freqToMidi(freq, a4 = 440) {
  return 69 + 12 * Math.log2(freq / a4);
}

/** MIDIノート番号 → 'A4' のような音名。 */
export function midiToName(midi, { flat = false } = {}) {
  const n = Math.round(midi);
  const names = flat ? FLAT_NAMES : SHARP_NAMES;
  return names[((n % 12) + 12) % 12] + (Math.floor(n / 12) - 1);
}

/** 音名の「文字部分」と「オクターブ部分」を分けて返す（表示の字送りを変えたいとき用）。 */
export function midiToNameParts(midi, options) {
  const name = midiToName(midi, options);
  const match = /^([A-G][#b]?)(-?\d+)$/.exec(name);
  return match ? { pitch: match[1], octave: match[2] } : { pitch: name, octave: '' };
}

/** 2つの周波数の差をセントで返す。 */
export function centsBetween(from, to) {
  return 1200 * Math.log2(to / from);
}
