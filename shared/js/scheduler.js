/**
 * 先読みスケジューラ。
 *
 * setInterval や setTimeout で直接音を鳴らすと、タイマーの揺れがそのまま
 * リズムの揺れになる（タブが非アクティブだと数百ms単位でずれる）。
 * そこで「粗いタイマーで定期的に起き、AudioContext の正確な時刻軸へ
 * 少し先の音を予約する」方式をとる。実際の発音時刻はオーディオ
 * スレッドが保証するので、UI スレッドが多少詰まってもテンポは狂わない。
 *
 * onEvent(time) は「その時刻に鳴らす音を予約」し、
 * 「次の音までの秒数」を返す。テンポを途中で変えたい場合は、
 * 返す間隔を変えるだけでよい。
 */

export function createScheduler(ctx, onEvent, { lookahead = 0.12, tickMs = 25 } = {}) {
  let timer = null;
  let nextTime = 0;

  function pump() {
    // 破綻防止: 1回の pump で予約しすぎない
    let guard = 0;
    while (nextTime < ctx.currentTime + lookahead && guard < 128) {
      const interval = onEvent(nextTime);
      nextTime += Math.max(0.01, interval);
      guard += 1;
    }
  }

  return {
    start() {
      if (timer !== null) return;
      // 最初の音は少し先に置く（予約が間に合わず音が欠けるのを防ぐ）
      nextTime = ctx.currentTime + 0.08;
      pump();
      timer = setInterval(pump, tickMs);
    },

    stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    },

    get running() {
      return timer !== null;
    },

    /** 次に予約される音の時刻（AudioContext 時間軸）。 */
    get nextTime() {
      return nextTime;
    },
  };
}
