/* app.js — router, app shell, global control handlers, offline SW.
   Two hosting modes:
     standalone (own URL / Add to Home Screen): routes live in location.hash,
       print + service worker enabled.
     framed (private claude.ai page): the frame only passes plain #names and
       blocks print + service workers, so routes are kept in memory. */
'use strict';
(function () {
  const $ = s => document.querySelector(s);
  const view = $('#view'), title = $('#title'), backBtn = $('#back'), printBtn = $('#print'), findBtn = $('#find');
  const FRAMED = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  L.FRAMED = FRAMED;
  if (FRAMED) document.documentElement.classList.add('framed');
  const scrollMem = {};
  let cur = FRAMED ? '#/' : (location.hash || '#/'), lastRoute = null;

  const ROUTES = [
    [/^#?\/?$/, () => L.views.games(), 'games'],
    [/^#\/game\/([^/]+)$/, m => L.views.game(L.unslug(m[1])), 'games'],
    [/^#\/shove\/([^/]+)\/(.+)$/, m => L.views.shove(L.unslug(m[1]), L.unslug(m[2])), 'games'],
    [/^#\/hit\/([^/]+)\/(.+)$/, m => L.views.hit(L.unslug(m[1]), L.unslug(m[2])), 'games'],
    [/^#\/pitchers$/, () => L.views.pitchers(), 'pitchers'],
    [/^#\/staff$/, () => L.views.staff(), 'pitchers'],
    [/^#\/pitcher\/(.+)$/, m => L.views.pitcher(L.unslug(m[1])), 'pitchers'],
    [/^#\/hitters$/, () => L.views.hitters(), 'hitters'],
    [/^#\/hitter\/(.+)$/, m => L.views.hitter(L.unslug(m[1])), 'hitters'],
    [/^#\/boards$/, () => L.views.boards(), 'boards'],
    [/^#\/opps$/, () => L.views.opps(), 'games'],
    [/^#\/opp\/(.+)$/, m => L.views.opp(L.unslug(m[1])), 'games'],
    [/^#\/compare\/([ph])(?:\/(.+))?$/, m => L.views.compare(m[1], m[2] ? L.unslug(m[2]) : null), ''],
    [/^#\/search$/, () => L.views.search(), '']
  ];
  L.navId = 0;

  /* Save as PDF: the print sheet (iPhone: Print -> Share -> Save to Files).
     The page title becomes the PDF's file name. */
  function savePdf() {
    const old = document.title;
    document.title = (L.pdfName || 'LMU Report').replace(/[\\/:*?"<>|]+/g, '-');
    const restore = () => { document.title = old; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore);
    window.print();
  }

  function render(keepScroll) {
    const h = cur;
    if (lastRoute && !keepScroll) scrollMem[lastRoute] = window.scrollY;
    let out, tab = 'games';
    for (const [re, fn, t] of ROUTES) { const m = h.match(re); if (m) { out = fn(m); tab = t; break; } }
    if (!out) out = L.views.games();
    view.innerHTML = out.html + (out.print ? (FRAMED
      ? '<div class="pdfnote">Save as PDF works in the home-screen app (bcsouth.github.io/lmu-baseball).</div>'
      : '<button class="pdfbtn" data-action="pdf"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 3v12M7 10l5 5 5-5M5 21h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>Save as PDF</button>') : '');
    L.pdfName = out.pdf || out.title || 'LMU Report';
    title.textContent = out.title || 'LMU';
    if (!FRAMED) document.title = (out.title ? out.title + ' · ' : '') + 'LMU Player Development';
    backBtn.hidden = !!out.root || !out.back;
    $('#brand').hidden = !backBtn.hidden;      // logo badge where there's no back arrow
    backBtn.dataset.href = out.back || '#/';
    printBtn.hidden = !out.print || FRAMED;
    if (findBtn) findBtn.hidden = !out.root;
    if (out.focus && !keepScroll) { const s = view.querySelector('[data-search]'); if (s && !s.value) try { s.focus(); } catch (e) { /* ignore */ } }
    document.querySelectorAll('.tabbar a').forEach(a => a.classList.toggle('on', a.dataset.tab === tab));
    if (!keepScroll) window.scrollTo(0, h in scrollMem && h !== lastRoute ? scrollMem[h] : 0);
    lastRoute = h;
  }
  L.render = render;

  /* Navigation + in-app back stack (no browser back button in either mode). */
  const stack = []; let goingBack = false;
  function nav(route, isBack) {
    if (route === cur) return;
    if (route === '#/boards' && !isBack) L.tempPitSort = null;   // fresh visit -> Shove order
    L.navId++;
    if (!isBack) { stack.push(cur); if (stack.length > 50) stack.shift(); }
    if (FRAMED) { cur = route; render(false); }
    else { goingBack = !!isBack; location.hash = route; }
  }
  L.nav = nav;
  window.addEventListener('hashchange', () => {
    if (FRAMED) return;
    const h = location.hash || '#/';
    if (h === cur) return;
    if (!goingBack && stack[stack.length - 1] !== cur) stack.push(cur); // URL typed / external
    goingBack = false; cur = h; render(false);
  });
  backBtn.addEventListener('click', () => nav(stack.length ? stack.pop() : backBtn.dataset.href, true));
  printBtn.addEventListener('click', savePdf);
  if (findBtn) findBtn.addEventListener('click', () => nav('#/search'));
  /* dropdowns (player comparison) */
  document.addEventListener('change', e => {
    const cb = e.target.closest('input[type="checkbox"][data-toggle]');
    if (cb) { L.state[cb.dataset.toggle] = cb.checked ? '1' : '0'; L.save(); render(true); return; }
    const el = e.target.closest('select[data-key]'); if (!el) return;
    L.state[el.dataset.key] = el.value; L.save(); render(true);
  });

  /* Global controls: links, chips, sortable headers, clickable table rows */
  document.addEventListener('click', e => {
    if (e.target.closest('[data-action="pdf"]')) { savePdf(); return; }
    const a = e.target.closest('a[href^="#"]');
    if (a) { e.preventDefault(); const h = a.getAttribute('href'); if (a.closest('.tabbar')) stack.length = 0; nav(h); return; }
    const chip = e.target.closest('button[data-key]');
    if (chip) {
      L.state[chip.dataset.key] = chip.dataset.val; L.save();
      const sx = chip.parentElement.scrollLeft, key = chip.dataset.key;
      render(true);
      const again = document.querySelector(`[data-key="${key}"]`);
      if (again) again.parentElement.scrollLeft = sx;
      return;
    }
    const th = e.target.closest('th[data-sort]');
    if (th) {
      const mode = L.state.board || 'pit', k = th.dataset.sort;
      if (mode === 'pit') {           // temporary: pitching board re-opens on Shove
        const t = L.tempPitSort;
        L.tempPitSort = t && t.k === k ? { k, dir: t.dir === 'asc' ? 'desc' : 'asc' } : { k, dir: 'desc' };
        render(true); return;
      }
      if (L.state['sort_' + mode] === k) L.state['dir_' + mode] = L.state['dir_' + mode] === 'asc' ? 'desc' : 'asc';
      else { L.state['sort_' + mode] = k; L.state['dir_' + mode] = 'desc'; }
      L.save(); render(true); return;
    }
    const tr = e.target.closest('tr[data-href]');
    if (tr) nav(tr.dataset.href);
  });
  let searchT;
  document.addEventListener('input', e => {
    const el = e.target; if (!el.dataset.search) return;
    clearTimeout(searchT);
    searchT = setTimeout(() => {
      L.state[el.dataset.search] = el.value; L.save(); render(true);
      const s = document.querySelector('[data-search]'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
    }, 180);
  });

  /* Boot */
  L.load().then(meta => {
    // App version is stamped by deploy_github.py at publish time ("dev" locally).
    const build = '1106-1206'.startsWith('__') ? 'dev' : '1106-1206';
    $('#stamp').textContent = 'Data through ' + L.fdate(L.dates[L.dates.length - 1]) + ' · exported ' + meta.generated + ' · app ' + build;
    render(false);
  }).catch(err => {
    view.innerHTML = `<div class="empty">Couldn't load the TrackMan data file.<br><small>${L.esc(err.message)}</small></div>`;
  });

  /* Offline worker + auto-update. The worker script is never taken from the
     HTTP cache, it's re-checked every time the app is opened or brought back
     to the front, and when a newly published version takes over the page
     reloads itself onto it (once). */
  if (!FRAMED && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    const reloadOnce = () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } };
    navigator.serviceWorker.addEventListener('controllerchange', reloadOnce);
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => {
      // a newly published version finished installing -> switch to it
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (nw) nw.addEventListener('statechange', () => { if (nw.state === 'activated') reloadOnce(); });
      });
      const check = () => reg.update().catch(() => {});
      check();
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
    }).catch(() => { /* offline cache is optional */ });
  }
})();
