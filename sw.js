/* Service worker web HKO: membuat web bisa dipasang sebagai aplikasi
   dan tetap terbuka saat sinyal lemah/offline.
   Naikkan VERSI setiap kali file kode (html/js/css) diubah. */
var VERSI = 'hko-v2';
var SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/style.css',
  'assets/config.js',
  'assets/data-cadangan.js',
  'assets/app.js',
  'assets/logo.png',
  'assets/icons/icon-192.png',
  'assets/icons/favicon-48.png'
];
var CDN = /^(https:\/\/(cdn\.tailwindcss\.com|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com))/;

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSI).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSI; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = req.url;

  // Halaman: ambil terbaru dari internet, bila gagal pakai simpanan
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (res) {
      var copy = res.clone(); caches.open(VERSI).then(function (c) { c.put('index.html', copy); });
      return res;
    }).catch(function () { return caches.match('index.html'); }));
    return;
  }

  // Pustaka CDN (versinya terkunci): pakai simpanan dulu
  if (CDN.test(url)) {
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        var copy = res.clone(); caches.open(VERSI).then(function (c) { c.put(req, copy); });
        return res;
      });
    }));
    return;
  }

  // File web sendiri: tampilkan simpanan, perbarui di belakang layar
  if (url.indexOf(self.location.origin) === 0) {
    e.respondWith(caches.open(VERSI).then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) { if (res.ok) c.put(req, res.clone()); return res; }).catch(function () { return hit; });
        return hit || net;
      });
    }));
  }
  // Google Sheet & statistik: selalu langsung ke internet (tidak disimpan)
});
