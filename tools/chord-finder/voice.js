/**
 * 選んだ音を確認するための簡易な鍵盤音。
 * サンプルは持たず、基音＋オクターブ上＋わずかなデチューンを重ねて
 * 減衰させるだけの軽い合成音。和音の響きが分かれば十分なので凝らない。
 */

export function createKeyboardVoice(ctx) {
  const master = ctx.createGain();
  master.gain.value = 0.9;

  // 高次倍音を落として耳あたりを柔らかくする
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 3200;
  tone.Q.value = 0.4;

  master.connect(tone).connect(ctx.destination);

  function note(freq, time, { duration = 1.6, level = 0.16 } = {}) {
    for (const [ratio, gain, detune] of [
      [1, 1, 0],
      [1, 0.5, 4],
      [2, 0.28, -3],
      [3, 0.1, 0],
    ]) {
      const osc = ctx.createOscillator();
      osc.type = ratio === 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq * ratio, time);
      osc.detune.setValueAtTime(detune, time);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, time);
      env.gain.exponentialRampToValueAtTime(level * gain, time + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, time + duration);

      osc.connect(env).connect(master);
      osc.start(time);
      osc.stop(time + duration + 0.05);
    }
  }

  return {
    /**
     * 和音を鳴らす。
     * @param {number[]} midis MIDIノート番号
     * @param {'block'|'arpeggio'} style
     */
    play(midis, style = 'block') {
      const now = ctx.currentTime + 0.03;
      const spread = style === 'arpeggio' ? 0.11 : 0;
      midis.forEach((midi, i) => {
        note(440 * 2 ** ((midi - 69) / 12), now + i * spread, {
          duration: 1.8 - i * 0.04,
        });
      });
    },
  };
}
