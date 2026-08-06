/**
 * ツール間で共有する AudioContext。
 * ブラウザは 1 ページあたりの AudioContext 数に制限があるため、
 * 各ツールはこのシングルトンを使い回す。
 */

let context = null;

/** AudioContext を取得（未生成なら生成）。ユーザー操作の中で呼ぶこと。 */
export function getContext() {
  if (!context) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) throw new Error('このブラウザは Web Audio API に対応していません。');
    context = new Ctor();
  }
  return context;
}

/**
 * 自動再生ポリシー対策。必ずユーザー操作（click / touch / keydown）の
 * ハンドラ内から呼び出す。
 */
export async function resumeContext() {
  const ctx = getContext();
  if (ctx.state !== 'running') {
    try {
      await ctx.resume();
    } catch {
      /* ユーザー操作外から呼ばれた場合は握りつぶす */
    }
  }
  return ctx;
}

/** 0..1 のスライダー値を聴感上リニアなゲインへ変換する。 */
export function volumeToGain(value, max = 0.7) {
  const v = Math.min(1, Math.max(0, value));
  return v * v * max;
}

/**
 * 画面スリープ抑止。音を鳴らしている間だけ確保する。
 * 非対応ブラウザでは黙って何もしない。
 */
export function createWakeLock() {
  let sentinel = null;
  let wantsLock = false;

  async function acquire() {
    if (!('wakeLock' in navigator) || sentinel) return;
    try {
      sentinel = await navigator.wakeLock.request('screen');
      sentinel.addEventListener('release', () => {
        sentinel = null;
      });
    } catch {
      sentinel = null;
    }
  }

  function release() {
    if (!sentinel) return;
    sentinel.release().catch(() => {});
    sentinel = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && sentinel === null && wantsLock) acquire();
  });

  return {
    set(on) {
      wantsLock = on;
      if (on) acquire();
      else release();
    },
  };
}
