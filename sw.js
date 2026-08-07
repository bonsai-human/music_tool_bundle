/* music tool bundle – Service Worker
 *
 * ・install で必要なファイルを一括キャッシュ（＝完全オフライン動作）
 * ・fetch は stale-while-revalidate（表示は即座、裏で更新を取得）
 *
 * ツールを追加したら PRECACHE にファイルを足し、CACHE_VERSION を上げること。
 */

const CACHE_VERSION = 'v2';
const CACHE_NAME = `music-tool-bundle-${CACHE_VERSION}`;

const PRECACHE = [
  './',
  './index.html',
  './home.css',
  './manifest.webmanifest',
  './assets/favicon.svg',
  './shared/css/base.css',
  './shared/js/audio.js',
  './shared/js/note.js',
  './shared/js/prefs.js',
  './shared/js/pwa.js',
  './shared/js/registry.js',
  './shared/js/scheduler.js',
  './shared/js/wave.js',
  './tools/tuning-fork/',
  './tools/tuning-fork/index.html',
  './tools/tuning-fork/tuning-fork.css',
  './tools/tuning-fork/tuning-fork.js',
  './tools/metronome/',
  './tools/metronome/index.html',
  './tools/metronome/metronome.css',
  './tools/metronome/metronome.js',
  './tools/metronome/engine.js',
  './tools/metronome/patterns.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request, { ignoreSearch: true });

      const network = fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => null);

      if (cached) return cached;

      const response = await network;
      if (response) return response;

      // オフラインで未キャッシュのページを開いた場合はトップページを返す
      if (request.mode === 'navigate') {
        const fallback = await cache.match('./index.html');
        if (fallback) return fallback;
      }
      return new Response('オフラインです', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    })
  );
});
