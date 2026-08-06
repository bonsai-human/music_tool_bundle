/**
 * Service Worker の登録。
 * import.meta.url を基準に解決するので、どの階層のページから読んでも
 * サイトルートの sw.js（= スコープがサイト全体）を登録できる。
 */

export function registerServiceWorker() {
  // isSecureContext は https / localhost / 127.0.0.1 のいずれでも true になる
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

  const url = new URL('../../sw.js', import.meta.url);
  const scope = new URL('../../', import.meta.url);

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(url, { scope }).catch(() => {
      /* 登録に失敗してもオンラインでは普通に動く */
    });
  });
}
