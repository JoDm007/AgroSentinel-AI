/**
 * AgroSentinel AI - Service Worker
 *
 * Objectif : rendre l'application pleinement utilisable SANS RÉSEAU.
 * C'est ce qui permet la démo terrain (et le pitch) même sans wifi.
 *
 * Stratégie :
 *   - App shell (HTML/CSS/JS/polices) : pré-caché à l'installation.
 *   - Poids des modèles IA (~23 Mo) : mis en cache à la première utilisation,
 *     puis servis depuis le cache. Ouvrir l'app une fois avec du réseau
 *     suffit à la rendre autonome définitivement.
 *   - Tout le reste en même origine : cache-first, réseau en secours.
 */

const VERSION = 'agrosentinel-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const SHELL_ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/config.js',
  './js/models/objectDetector.js',
  './js/models/leafClassifier.js',
  './js/models/imagenetClasses.js',
  './js/views/diagnostic.js',
  './dashboard.html',
  './js/views/dashboard.js',
  './js/security/crypto.js',
  './js/security/journal.js',
  './js/utils/audioSynth.js',
  './js/utils/telemetry.js',
  './vendor/tf.min.js',
  './vendor/coco-ssd.min.js',
  './vendor/fonts/fonts.css',
  './vendor/fontawesome/css/all.min.css',
  './vendor/fontawesome/webfonts/fa-solid-900.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ─── Installation : pré-cache de l'app shell ────────────────────────────────

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(SHELL_CACHE);
      // addAll() échoue en bloc si une seule ressource manque : on tolère
      // les absences pour que le SW s'installe malgré tout.
      await Promise.all(SHELL_ASSETS.map(async url => {
        try {
          await cache.add(new Request(url, { cache: 'reload' }));
        } catch (err) {
          console.warn('[SW] Ressource non mise en cache :', url, err);
        }
      }));
    } catch (err) {
      // CacheStorage indisponible (mode privé, quota, profil restreint) :
      // le SW s'installe quand même et se contentera de relayer le réseau.
      console.warn('[SW] Pré-cache impossible :', err);
    }
    await self.skipWaiting();
  })());
});

// ─── Activation : purge des anciennes versions ──────────────────────────────

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))
      );
    } catch (err) {
      console.warn('[SW] Purge des anciens caches impossible :', err);
    }
    await self.clients.claim();
  })());
});

// ─── Interception réseau ────────────────────────────────────────────────────

self.addEventListener('fetch', event => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    // Le cache est une optimisation, jamais un point de panne : toute
    // défaillance de CacheStorage doit se solder par un simple passage
    // réseau, pas par une page d'erreur.
    try {
      const cached = await caches.match(request, { ignoreSearch: true });
      if (cached) return cached;
    } catch (err) {
      console.warn('[SW] Lecture du cache impossible :', err);
      return fetch(request);
    }

    try {
      const response = await fetch(request);

      // Seules les réponses complètes et valides sont mises en cache.
      // Le put est concurrent avec le préchauffage piloté par la page :
      // un doublon n'est pas une erreur, on l'ignore.
      if (response.ok && response.status === 200 && response.type === 'basic') {
        caches.open(RUNTIME_CACHE)
          .then(cache => cache.put(request, response.clone()))
          .catch(() => {});
      }
      return response;
    } catch (err) {
      // Hors ligne et absent du cache : pour une navigation, on retombe
      // sur la page d'accueil déjà mise en cache.
      if (request.mode === 'navigate') {
        try {
          const fallback = await caches.match('./index.html');
          if (fallback) return fallback;
        } catch { /* cache indisponible : on propage l'erreur réseau */ }
      }
      throw err;
    }
  })());
});
