/** 楽器ごとの開放弦（MIDIノート番号）。null はクロマチック（最寄りの半音に合わせる）。 */

export const INSTRUMENTS = [
  { id: 'chromatic', label: 'クロマチック', strings: null },
  { id: 'guitar', label: 'ギター', strings: [40, 45, 50, 55, 59, 64] },
  { id: 'guitar-drop-d', label: 'ギター(Drop D)', strings: [38, 45, 50, 55, 59, 64] },
  { id: 'bass', label: 'ベース', strings: [28, 33, 38, 43] },
  { id: 'bass-5', label: 'ベース(5弦)', strings: [23, 28, 33, 38, 43] },
  { id: 'ukulele', label: 'ウクレレ', strings: [67, 60, 64, 69] },
  { id: 'violin', label: 'バイオリン', strings: [55, 62, 69, 76] },
];

export function findInstrument(id) {
  return INSTRUMENTS.find((instrument) => instrument.id === id) || INSTRUMENTS[0];
}

/** 実測の音高に最も近い開放弦を返す。 */
export function nearestString(strings, midi) {
  let best = strings[0];
  let bestDistance = Infinity;
  for (const string of strings) {
    const distance = Math.abs(string - midi);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = string;
    }
  }
  return best;
}
