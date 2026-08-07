/**
 * クリック音の合成。
 *
 * 音源ファイルは持たず、すべて Web Audio のノードで作る。
 * 依存ゼロ・完全オフライン動作を保ちたいのと、音色ごとに
 * 数十KBのサンプルを抱えるとバンドル全体が重くなるため。
 *
 * kind は 'accent'（強拍）/ 'normal'（弱拍）/ 'sub'（分割音）/ 'bell'（合図）。
 */

export const VOICES = [
  { id: 'click', label: 'メトロノーム' },
  { id: 'wood', label: 'ウッドブロック' },
  { id: 'digital', label: '電子音' },
  { id: 'drums', label: 'ドラム' },
  { id: 'taiko', label: '和太鼓' },
];

let noise = null;

function getNoise(ctx) {
  if (!noise || noise.sampleRate !== ctx.sampleRate) {
    const length = Math.floor(ctx.sampleRate * 0.3);
    noise = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  return noise;
}

/** 減衰するゲイン段を作って返す。 */
function envelope(ctx, dest, time, peak, decay, attack = 0.001) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), time + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
  gain.connect(dest);
  return gain;
}

function burst(ctx, dest, time, { freq, q, peak, decay, type = 'bandpass' }) {
  const src = ctx.createBufferSource();
  src.buffer = getNoise(ctx);
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(freq, time);
  filter.Q.setValueAtTime(q, time);
  src.connect(filter).connect(envelope(ctx, dest, time, peak, decay));
  src.start(time);
  src.stop(time + decay + 0.02);
}

function tone(ctx, dest, time, { freq, endFreq, peak, decay, type = 'sine' }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, time);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, time + decay);
  osc.connect(envelope(ctx, dest, time, peak, decay, 0.002));
  osc.start(time);
  osc.stop(time + decay + 0.02);
}

/** kind ごとの相対音量。 */
const LEVEL = { accent: 1, normal: 0.58, sub: 0.26 };

const IMPL = {
  // 機械式メトロノームのような硬いチック音
  click(ctx, dest, time, kind) {
    const level = LEVEL[kind];
    const freq = kind === 'accent' ? 2600 : kind === 'normal' ? 1750 : 1200;
    burst(ctx, dest, time, { freq, q: 6, peak: level * 0.9, decay: 0.028 });
    tone(ctx, dest, time, { freq: freq * 0.5, peak: level * 0.35, decay: 0.022, type: 'triangle' });
  },

  // 木の共鳴を持たせた柔らかいクリック
  wood(ctx, dest, time, kind) {
    const level = LEVEL[kind];
    const freq = kind === 'accent' ? 1250 : kind === 'normal' ? 940 : 720;
    burst(ctx, dest, time, { freq, q: 2, peak: level * 0.5, decay: 0.012 });
    tone(ctx, dest, time, { freq, peak: level * 0.8, decay: 0.085 });
    tone(ctx, dest, time, { freq: freq * 2.7, peak: level * 0.22, decay: 0.045 });
  },

  // 電子ブザー的な純音
  digital(ctx, dest, time, kind) {
    const level = LEVEL[kind];
    const freq = kind === 'accent' ? 1760 : kind === 'normal' ? 1175 : 880;
    tone(ctx, dest, time, { freq, peak: level * 0.55, decay: 0.055, type: 'square' });
  },

  // 強拍=キック、弱拍=スネア、分割=ハイハット
  drums(ctx, dest, time, kind) {
    if (kind === 'accent') {
      tone(ctx, dest, time, { freq: 160, endFreq: 48, peak: 1.1, decay: 0.17 });
      burst(ctx, dest, time, { freq: 1800, q: 1, peak: 0.2, decay: 0.012 });
    } else if (kind === 'normal') {
      burst(ctx, dest, time, { freq: 1900, q: 0.8, peak: 0.5, decay: 0.09 });
      tone(ctx, dest, time, { freq: 195, peak: 0.28, decay: 0.06, type: 'triangle' });
    } else {
      burst(ctx, dest, time, { freq: 8000, q: 0.7, peak: 0.22, decay: 0.028, type: 'highpass' });
    }
  },

  // 和太鼓：低い胴鳴りとふちを打つ音
  taiko(ctx, dest, time, kind) {
    if (kind === 'sub') {
      burst(ctx, dest, time, { freq: 2600, q: 3, peak: 0.55, decay: 0.035 });
      return;
    }
    const accent = kind === 'accent';
    tone(ctx, dest, time, {
      freq: accent ? 150 : 205,
      endFreq: accent ? 54 : 78,
      peak: accent ? 1.1 : 0.6,
      decay: accent ? 0.24 : 0.16,
    });
    burst(ctx, dest, time, { freq: 900, q: 1.2, peak: accent ? 0.28 : 0.16, decay: 0.02 });
  },
};

/**
 * 音色ごとの音量差をならす係数。
 * 実際にオフラインレンダリングして測ったピークから逆算している
 * （素の状態では機械式クリック 0.26 に対し和太鼓 0.95 と4倍近い開きがある）。
 */
const VOICE_GAIN = { click: 2.2, wood: 1, digital: 1.7, drums: 0.9, taiko: 0.85 };

/** 段が切り替わったことを知らせるベル。 */
function bell(ctx, dest, time) {
  tone(ctx, dest, time, { freq: 1568, peak: 0.5, decay: 0.5 });
  tone(ctx, dest, time, { freq: 2093, peak: 0.3, decay: 0.38 });
  tone(ctx, dest, time, { freq: 3136, peak: 0.14, decay: 0.22 });
}

export function createEngine(ctx) {
  // 分割が細かいと打点が重なるので、頭を潰さない程度のリミッタを挟む
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 0;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(limiter);

  // 音色ごとの音量差をならす段
  const voiceGain = ctx.createGain();
  voiceGain.connect(master);

  let voice = 'click';
  voiceGain.gain.value = VOICE_GAIN[voice];

  return {
    get master() {
      return master;
    },

    setVoice(id) {
      voice = IMPL[id] ? id : 'click';
      voiceGain.gain.value = VOICE_GAIN[voice];
    },

    /** 0..1 の値を master ゲインへ。muted なら無音。 */
    setVolume(value, muted) {
      const target = muted ? 0 : Math.min(1, Math.max(0, value)) ** 2 * 0.9;
      master.gain.setTargetAtTime(target, ctx.currentTime, 0.02);
    },

    play(time, kind) {
      if (kind === 'bell') bell(ctx, master, time);
      else IMPL[voice](ctx, voiceGain, time, kind);
    },
  };
}
