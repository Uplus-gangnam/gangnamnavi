// ==================================================
// service-worker.js
// 캐시 버전: 배포마다 CACHE_VERSION 값을 올려서 갱신 트리거
// ==================================================
const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `gn-navigator-${CACHE_VERSION}`;

// 최초 설치 시 선캐싱할 앱 셸(App Shell)
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png'
];

// ---------- INSTALL: 앱 셸 캐싱 ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ---------- ACTIVATE: 구버전 캐시 정리 ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('gn-navigator-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// ---------- FETCH: 전략 분기 ----------
// 1) 페이지 이동(navigate) 요청  -> Network First (최신 HTML 우선, 실패 시 캐시)
// 2) 동일 출처(same-origin) 정적 자원 -> Cache First
// 3) 외부 CDN(폰트 등) -> Stale-While-Revalidate
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  // 1) 네비게이션 요청
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  // 2) 동일 출처 정적 자원
  if (isSameOrigin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // 3) 외부 리소스 (Pretendard CDN 등)
  event.respondWith(staleWhileRevalidate(request));
});

// ---------- 전략 구현 ----------
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return cached || Response.error();
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    return cached || caches.match('/index.html');
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request, { mode: 'no-cors' })
    .then((response) => {
      cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || fetchPromise;
}
