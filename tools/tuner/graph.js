/**
 * ピッチ履歴グラフ。横軸が時間、縦軸が音高。
 * 縦位置は直近の音高の中央値をゆっくり追いかけるので、
 * どの音域を吹いても弾いても勝手に画面に収まる。
 */

const GUTTER = 34; // 音名を書く左端の幅（CSS px）

export function createPitchGraph(canvas, { windowMs = 8000, span = 25 } = {}) {
  const context = canvas.getContext('2d');
  const samples = []; // { time, midi } midi が null なら無音
  let center = 60; // 表示の中心となる MIDI ノート番号
  let centerReady = false;

  function push(time, midi) {
    samples.push({ time, midi });
    const limit = time - windowMs - 500;
    while (samples.length && samples[0].time < limit) samples.shift();
  }

  function reset() {
    samples.length = 0;
    centerReady = false;
  }

  /** 直近の音高の中央値。無音しかなければ null。 */
  function recentMedian() {
    const values = samples.filter((s) => s.midi !== null).map((s) => s.midi);
    if (!values.length) return null;
    values.sort((a, b) => a - b);
    return values[values.length >> 1];
  }

  function draw(now, { nameFor, accent = '#5aa9ff', targetMidi = null }) {
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;

    if (canvas.width !== Math.round(width * ratio)) canvas.width = Math.round(width * ratio);
    if (canvas.height !== Math.round(height * ratio)) canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);

    // 縦位置の追従。急に飛ばないよう少しずつ寄せる
    const median = recentMedian();
    if (median !== null) {
      if (!centerReady) {
        center = median;
        centerReady = true;
      } else {
        center += (median - center) * 0.06;
      }
    }

    const top = center + span / 2;
    const yOf = (midi) => ((top - midi) / span) * height;
    const xOf = (time) => GUTTER + ((time - (now - windowMs)) / windowMs) * (width - GUTTER);

    // 目標音の帯
    if (targetMidi !== null) {
      const y = yOf(targetMidi);
      const halfStep = height / span / 2;
      context.fillStyle = `${accent}1f`;
      context.fillRect(GUTTER, y - halfStep, width - GUTTER, halfStep * 2);
      context.strokeStyle = `${accent}66`;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(GUTTER, Math.round(y) + 0.5);
      context.lineTo(width, Math.round(y) + 0.5);
      context.stroke();
    }

    // 半音ごとの線と、C の音名
    const lowest = Math.ceil(center - span / 2);
    const highest = Math.floor(top);
    context.font = '10px -apple-system, sans-serif';
    context.textBaseline = 'middle';
    for (let midi = lowest; midi <= highest; midi += 1) {
      const y = Math.round(yOf(midi)) + 0.5;
      const isC = ((midi % 12) + 12) % 12 === 0;
      context.strokeStyle = isC ? '#ffffff22' : '#ffffff0d';
      context.beginPath();
      context.moveTo(GUTTER, y);
      context.lineTo(width, y);
      context.stroke();
      if (isC) {
        context.fillStyle = '#8b8b96';
        context.fillText(nameFor(midi), 2, y);
      }
    }

    // ピッチの線。無音や飛びのところでは切る
    context.strokeStyle = accent;
    context.lineWidth = 2;
    context.lineJoin = 'round';
    context.lineCap = 'round';
    context.beginPath();
    let drawing = false;
    let previousTime = 0;
    for (const sample of samples) {
      if (sample.midi === null || sample.time - previousTime > 200) {
        drawing = false;
      }
      if (sample.midi !== null) {
        const x = xOf(sample.time);
        const y = yOf(sample.midi);
        if (!drawing) {
          context.moveTo(x, y);
          drawing = true;
        } else {
          context.lineTo(x, y);
        }
        previousTime = sample.time;
      }
    }
    context.stroke();

    // 現在値
    const last = samples[samples.length - 1];
    if (last && last.midi !== null && now - last.time < 200) {
      context.fillStyle = accent;
      context.beginPath();
      context.arc(xOf(last.time), yOf(last.midi), 3.5, 0, Math.PI * 2);
      context.fill();
    }

    // 左端の音名帯と本体の境目
    context.strokeStyle = '#ffffff14';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(GUTTER + 0.5, 0);
    context.lineTo(GUTTER + 0.5, height);
    context.stroke();
  }

  return { push, reset, draw };
}
