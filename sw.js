/* ===== KODAK SERVICE WORKER ===== */
const CACHE_NAME = 'kodak-v1';
const OFFLINE_URL = '/offline.html';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&family=Cairo:wght@400;600;700;900&display=swap'
];

/* ===== تثبيت Service Worker وتخزين الملفات ===== */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] تخزين الملفات الأساسية...');
      return cache.addAll(ASSETS_TO_CACHE.filter(url => !url.startsWith('http')));
    }).then(() => self.skipWaiting())
  );
});

/* ===== تفعيل وحذف الكاش القديم ===== */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => {
          console.log('[SW] حذف كاش قديم:', key);
          return caches.delete(key);
        })
      )
    ).then(() => self.clients.claim())
  );
});

/* ===== اعتراض الطلبات ===== */
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // تجاهل الطلبات غير الـ HTTP
  if (!request.url.startsWith('http')) return;

  // تجاهل طلبات Chrome Extensions
  if (url.protocol === 'chrome-extension:') return;

  // تجاهل الـ API calls (translate, anthropic)
  if (
    url.hostname.includes('translate.googleapis.com') ||
    url.hostname.includes('anthropic.com') ||
    url.hostname.includes('api.')
  ) {
    return;
  }

  event.respondWith(handleFetch(request));
});

async function handleFetch(request) {
  const url = new URL(request.url);

  // استراتيجية Cache First للـ assets الثابتة (خطوط، صور)
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com') ||
    request.destination === 'image' ||
    request.destination === 'font'
  ) {
    return cacheFirst(request);
  }

  // استراتيجية Network First للصفحات
  if (request.mode === 'navigate') {
    return networkFirst(request);
  }

  // Network First للباقي
  return networkFirst(request);
}

/* ===== Cache First: من الكاش أولاً ===== */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 408 });
  }
}

/* ===== Network First: من الشبكة أولاً ===== */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // لو مفيش نت — رجّع من الكاش
    const cached = await caches.match(request);
    if (cached) return cached;

    // لو مفيش كاش — رجّع صفحة offline
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('/index.html');
      if (offlinePage) return offlinePage;
    }

    return new Response(
      JSON.stringify({ error: 'offline', message: 'لا يوجد اتصال بالإنترنت' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/* ===== استقبال رسائل من الصفحة ===== */
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});