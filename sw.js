/* sw.js — offline support.
   Online: every request goes to the network with cache:'no-store', so phones
   never reuse a stale copy (GitHub Pages lets browsers keep files ~10 min).
   Each good response is saved; offline (e.g. the dugout) the saved copy is used.
   The deploy script stamps the build id below, so each publish installs a new
   worker and the app reloads itself onto the new version. */
const VERSION = 'lmu-1106-1206';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/core.js', 'js/engine.js', 'js/charts.js',
  'js/views.js', 'js/app.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png',
  'img/mark.png', 'img/wordmark.png', 'data/lmu.json' , 'img/teams/AND_TRO.png', 'img/teams/BFS_BBS.png', 'img/teams/CAR_EAG.png', 'img/teams/CAT_IND.png', 'img/teams/CED_UNI.png', 'img/teams/COK_COB.png', 'img/teams/EMO_HEN.png', 'img/teams/HIL_COL2.png', 'img/teams/KEN_STA1.png', 'img/teams/LEE_UNI.png', 'img/teams/LEN_BEA.png', 'img/teams/MAR_LIO.png', 'img/teams/NOR_GRE.png', 'img/teams/THO_MOR.png', 'img/teams/TNU.png', 'img/teams/TUS_PIO.png', 'img/teams/VIR_WIS.png', 'img/teams/WIN_BUL.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => Promise.all(SHELL.map(u => fetch(u, { cache: 'no-store' }).then(r => r.ok && c.put(u, r)).catch(() => {}))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // cache key = path relative to the app (e.g. "js/app.js"), same as SHELL
  const key = url.pathname.slice(new URL(self.registration.scope).pathname.length) || './';
  e.respondWith(fetch(e.request, { cache: 'no-store' }).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(key, copy)); }
    return res;
  }).catch(() => caches.match(key, { ignoreSearch: true }).then(hit => hit || caches.match(e.request, { ignoreSearch: true }))));
});
