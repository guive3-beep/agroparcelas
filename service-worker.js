/* AgroParcelas PWA · caché de la estructura de la aplicación */
'use strict';

const CACHE_PREFIX = 'agroparcelas-shell-';
const CACHE_NAME = CACHE_PREFIX + 'v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/styles.css',
  './vendor/leaflet.css',
  './vendor/leaflet.js',
  './vendor/xlsx.full.min.js',
  './js/config.js',
  './js/geo.js',
  './js/store.js',
  './js/map.js',
  './js/ui.js',
  './js/files.js',
  './js/forms.js',
  './js/dashboard.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // No interceptar mapas satelitales, teselas ni otros recursos de terceros.
  if (url.origin !== self.location.origin) return;

  // Para la navegación: intentar la versión de red y usar la copia guardada
  // cuando no haya conexión.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Recursos propios de la aplicación: caché primero y red como respaldo.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
