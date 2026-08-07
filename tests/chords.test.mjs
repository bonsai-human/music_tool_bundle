import { detectChords, intervalName, pitchName } from '../shared/js/chords.js';

const N = { C:0,'C#':1,D:2,'D#':3,E:4,F:5,'F#':6,G:7,'G#':8,A:9,'A#':10,B:11,
  Db:1, Eb:3, Gb:6, Ab:8, Bb:10 };
const pcs = (...names) => names.map((n) => N[n]);

let pass = 0, fail = 0;
function check(label, got, want) {
  const ok = got === want;
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label.padEnd(34)} → ${got}${ok ? '' : `   (期待: ${want})`}`);
}

// 基本三和音
check('C E G',            detectChords(pcs('C','E','G'))[0].name, 'C');
check('C Eb G',           detectChords(pcs('C','Eb','G'))[0].name, 'Cm');
check('C Eb Gb',          detectChords(pcs('C','Eb','Gb'))[0].name, 'Cdim');
check('C E G#',           detectChords(pcs('C','E','G#'))[0].name, 'Caug');
check('C F G',            detectChords(pcs('C','F','G'))[0].name, 'Csus4');

// 七の和音
check('C E G B',          detectChords(pcs('C','E','G','B'))[0].name, 'Cmaj7');
check('C E G Bb',         detectChords(pcs('C','E','G','Bb'))[0].name, 'C7');
check('C Eb G Bb',        detectChords(pcs('C','Eb','G','Bb'))[0].name, 'Cm7');
check('C Eb Gb Bb',       detectChords(pcs('C','Eb','Gb','Bb'))[0].name, 'Cm7♭5');
check('C Eb Gb A',        detectChords(pcs('C','Eb','Gb','A'))[0].name, 'Cdim7');

// テンション
check('C D E G B',        detectChords(pcs('C','D','E','G','B'))[0].name, 'Cmaj9');
check('C D E G Bb',       detectChords(pcs('C','D','E','G','Bb'))[0].name, 'C9');
check('C D E G A Bb',     detectChords(pcs('C','D','E','G','A','Bb'))[0].name, 'C13');
check('F A C E G',        detectChords(pcs('F','A','C','E','G'))[0].name, 'Fmaj9');
check('C E G A の第1候補',  detectChords(pcs('C','E','G','A'))[0].name, 'Am7');
check('C E G A に C6 も出る', detectChords(pcs('C','E','G','A')).some((c)=>c.name==='C6'), true);

// 転回形はベース指定で分離できるか
check('C E G / bass E',   detectChords(pcs('C','E','G'), N.E)[0].name, 'C/E');
check('C E G / bass G',   detectChords(pcs('C','E','G'), N.G)[0].name, 'C/G');
check('C E G A / bass A', detectChords(pcs('C','E','G','A'), N.A)[0].name, 'Am7');

// 曖昧な集合は複数候補が出るか
const amb = detectChords(pcs('C','E','G','A'));
check('C E G A の候補数 ≥2', amb.length >= 2, true);
console.log('     候補:', amb.map((c) => c.name).join(' / '));

// 5度省略
const omit = detectChords(pcs('C','E','Bb'));
check('C E Bb (5度省略)',  omit[0].name, 'C7');
check('  省略表示',        omit[0].omitted.join(','), '5');

// 度数
const c9 = detectChords(pcs('C','D','E','G','Bb'))[0];
check('C9 の度数',         c9.tones.map((t) => t.degree).join(' '), 'R 9 3 5 ♭7');

// 異名同音の綴り
check('F A C の綴り',      detectChords(pcs('F','A','C'))[0].tones.map((t) => pitchName(t.pc, true)).join(' '), 'F A C');
check('Eb G Bb はフラット', detectChords(pcs('Eb','G','Bb'))[0].name, 'E♭');
check('D F# A はシャープ',  detectChords(pcs('D','F#','A'))[0].name, 'D');

// 音程名
check('C→G の音程',        intervalName(N.C, N.G), '完全5度');
check('C→Eb の音程',       intervalName(N.C, N.Eb), '短3度');

// 判定できない集合
check('C C# D の候補数',    detectChords(pcs('C','C#','D')).length, 0);
check('単音は候補なし',      detectChords(pcs('C')).length, 0);

// 綴りは度数に従う（ルート基準ではなく）
check('Cm7♭5 の構成音',    detectChords(pcs('C','Eb','Gb','Bb'))[0].tones.map((t)=>t.name).join(' '), 'C E♭ G♭ B♭');
check('Cm7♭5/E♭ の表記',   detectChords(pcs('C','Eb','Gb','Bb'), N.Eb).find((c)=>c.suffix==='m7♭5').name, 'Cm7♭5/E♭');
check('C7♯9 の♯9は D♯',   detectChords(pcs('C','D#','E','G','Bb'))[0].tones.map((t)=>t.name).join(' '), 'C D♯ E G B♭');
check('Caug の♯5は G♯',   detectChords(pcs('C','E','G#'))[0].tones.map((t)=>t.name).join(' '), 'C E G♯');
check('C7♭9 の♭9は D♭',   detectChords(pcs('C','Db','E','G','Bb'))[0].tones.map((t)=>t.name).join(' '), 'C D♭ E G B♭');
check('Cmaj9 の9は D',    detectChords(pcs('C','D','E','G','B'))[0].tones.map((t)=>t.name).join(' '), 'C D E G B');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
