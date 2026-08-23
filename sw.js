'use strict';
/*
 * Service worker : l'application elle-même est mise en cache pour fonctionner
 * hors ligne. Les données du carnet, elles, sont dans IndexedDB et ne passent
 * jamais par ici.
 *
 * Stratégie « réseau d'abord, cache en secours » : les mises à jour arrivent
 * dès qu'elles existent, et l'application reste utilisable sans réseau. Les
 * tuiles du fond de carte ne sont pas pré-cachées — pré-charger la France
 * entière représenterait des centaines de méga-octets ; elles restent gérées
 * par le cache HTTP du navigateur, donc consultables dans les zones déjà
 * parcourues.
 */
const VERSION = 'v1.1.1';
const CACHE = 'envies-de-voyage-' + VERSION;
const ASSETS = [
  './',
  'index.html',
  'confidentialite.html',
  'manifest.webmanifest',
  'css/app.css',
  'css/page.css',
  'js/app.js',
  'js/categories.js',
  'js/circuits.js',
  'js/demarrage.js',
  'js/exif.js',
  'js/fiches.js',
  'js/photos.js',
  'js/reglages.js',
  'js/store.js',
  'js/zip.js',
  'vendor/leaflet/leaflet.js',
  'vendor/leaflet/leaflet.css',
  'vendor/maplibre/maplibre-gl.js',
  'vendor/maplibre/maplibre-gl.css',
  'vendor/maplibre/leaflet-maplibre-gl.js',
  'vendor/leaflet/images/layers.png',
  'vendor/leaflet/images/layers-2x.png',
  'vendor/leaflet/images/marker-icon.png',
  'vendor/leaflet/images/marker-icon-2x.png',
  'vendor/leaflet/images/marker-shadow.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];

self.addEventListener('install', (e) => {
  /* `cache: 'reload'` contourne le cache HTTP du navigateur : sans lui,
   * addAll() remplirait le cache neuf avec les réponses périmées encore
   * détenues par le navigateur, et le nouveau service worker figerait la
   * version précédente (GitHub Pages sert les fichiers avec max-age=600). */
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  /* Réseau d'abord, cache en secours — et « secours » veut dire les deux
   * façons dont le réseau manque :
   *
   *   il ne répond pas      → fetch() rejette
   *   il répond mal         → fetch() résout, avec un statut d'erreur
   *
   * Ne rattraper que le premier cas laissait passer le second : la réponse en
   * erreur était renvoyée telle quelle à la page, qui se retrouvait sans son
   * JavaScript. Cela arrive derrière un portail captif d'hôtel, un proxy
   * d'entreprise, un réseau qui filtre — c'est-à-dire précisément là où une
   * application hors ligne doit tenir.
   *
   * `cache: 'no-cache'` force la revalidation HTTP (304 si rien n'a changé) :
   * les mises à jour arrivent dès qu'elles existent.
   */
  e.respondWith((async () => {
    try {
      const resp = await fetch(e.request.url, { cache: 'no-cache' });
      if (resp.ok) {
        const copie = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copie));
        return resp;
      }
      return (await caches.match(e.request, { ignoreSearch: true })) || resp;
    } catch (erreur) {
      const enCache = await caches.match(e.request, { ignoreSearch: true });
      if (enCache) return enCache;
      throw erreur;
    }
  })());
});
