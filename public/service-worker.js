const CACHE_NAME = 'gamchat-v7';
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/install.css',
  '/runtime-config.js',
  '/app.js',
  '/chat-navigation.js',
  '/install.js',
  '/crypto.js',
  '/manifest.webmanifest',
  '/apps/',
  '/apps/index.html',
  '/apps/apps.css',
  '/icons/gamchat.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then((cached) => cached ?? caches.match('/index.html')))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (existing) return existing.focus();
      return self.clients.openWindow('/');
    })
  );
});
