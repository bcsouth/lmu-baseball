/* core.js — data loading, row model, formatting, colors, date presets.
   Everything hangs off the global `L` namespace (no build step, no deps). */
'use strict';
window.L = window.L || {};

/* Bit order MUST match FLAG_COLS in export_mobile_data.R */
L.FLAG = {
  FB: 0, OS: 1, Early: 2, Ahead: 3, Zone: 4, Strike: 5, Whiff: 6, Swing: 7,
  AB: 8, Hit: 9, FP: 10, PA: 11, HBP: 12, Walk: 13, BIP: 14, HH: 15,
  biphh: 16, FBstrike: 17, OSstrike: 18, FPS: 19, Zwhiff: 20, Zswing: 21,
  GB: 22, Chase: 23, OutOfZone: 24, OnBase: 25
};
L.has = (r, bit) => (r.f >>> bit) & 1;
L.TEAM = 'LIN_MEM';
/* Hitter-side only: never shown as hitters (lists, game pages, reports,
   leaderboards, compare). They stay on the pitching side.
   Dempsey = test / extra-reps placeholder; Poulter + Remkus are pitchers
   logged as batters; "BULLPEN, BULLPEN" = a bullpen thrown on the game mound. */
L.HIDE_BATTERS = new Set(['Dempsey, Jackson', 'Poulter, Mason', 'Remkus, Justin', 'BULLPEN, BULLPEN']);
L.HITS = new Set(['Single', 'Double', 'Triple', 'HomeRun']);

/* ── Load + materialize rows ─────────────────────────────────────────────── */
L.load = async function () {
  const res = await fetch('data/lmu.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Could not load data (' + res.status + ')');
  const j = await res.json();
  const c = j.cols, D = j.dict, n = j.meta.n;
  const s = (k, i) => (c[k][i] < 0 ? null : D[k][c[k][i]]);
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    rows[i] = {
      i, date: j.dates[c.d[i]], gid: s('g', i), game: (c.gk && s('gk', i)) || s('g', i),
      pitcher: s('p', i), batter: s('b', i), pteam: s('pt', i), bteam: s('bt', i),
      pthrows: s('pth', i), bside: s('bs', i), ptype: s('tpt', i), pcall: s('pc', i),
      korbb: s('kb', i), hittype: s('tht', i), result: s('pr', i), half: s('tb', i),
      catcher: s('c', i),
      no: c.no[i], inn: c.inn[i], pa: c.pa[i], pp: c.pp[i], outs: c.o[i],
      balls: c.ba[i], strikes: c.st[i], oop: c.oop[i], runs: c.rs[i],
      velo: c.v[i], spin: c.sp[i], ivb: c.ivb[i], hb: c.hb[i], relh: c.rh[i], rels: c.rsd[i],
      ext: c.ext[i], vaa: c.vaa[i], y: c.y[i], x: c.x[i], ev: c.ev[i], la: c.la[i],
      bearing: c.br[i], dist: c.ds[i], xba: c.xba[i], xslg: c.xslg[i], xw: c.xw[i], f: c.f[i]
    };
  }
  L.meta = j.meta; L.rows = rows; L.dates = j.dates; L.pools = j.pools || {};
  L.official = { bat: {}, pit: {} };
  (j.official && j.official.bat || []).forEach(o => { L.official.bat[o.Batter] = o; });
  (j.official && j.official.pit || []).forEach(o => { L.official.pit[o.Pitcher] = o; });
  L.PS = j.meta.point_system; L.W = j.meta.woba_w;
  // coaches' stat sheet (QAB%, SF, SH, SB, R...) keyed by TrackMan batter name
  L.qab = null;
  if (j.qab && Array.isArray(j.qab.rows) && j.qab.rows.length) {
    const by = {}; j.qab.rows.forEach(o => { by[o.batter] = o; });
    const ranked = j.qab.rows.filter(o => o.PA > 0).sort((a, b) => b.QABpct - a.QABpct);
    ranked.forEach((o, i) => { o.rank = i + 1; });
    const PA = j.qab.rows.reduce((a, o) => a + (o.PA || 0), 0), Q = j.qab.rows.reduce((a, o) => a + (o.QAB || 0), 0);
    L.qab = { title: j.qab.title, file: j.qab.file, modified: j.qab.modified, by, n: ranked.length, teamPct: PA ? Q / PA : NaN };
  }
  // Games (one per GameID, TrackMan restarts merged), oldest first, numbered
  // within a date by first pitch -> "Game 1" / "Game 2" on doubleheaders.
  L.games = j.games || [];
  L.gameMap = {}; L.games.forEach((g, k) => { g.order = k; L.gameMap[g.key] = g; });
  L.lmuPitching = rows.filter(r => r.pteam === L.TEAM);
  L.lmuBatting = rows.filter(r => r.bteam === L.TEAM && !L.HIDE_BATTERS.has(r.batter));
  L.buildPresets();
  return j.meta;
};

/* ── Small utils ─────────────────────────────────────────────────────────── */
L.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
L.isNum = v => typeof v === 'number' && isFinite(v);
L.sum = (a, fn) => { let t = 0; for (const x of a) { const v = fn(x); if (L.isNum(v)) t += v; } return t; };
L.mean = (a, fn) => { let t = 0, k = 0; for (const x of a) { const v = fn(x); if (L.isNum(v)) { t += v; k++; } } return k ? t / k : NaN; };
L.max = (a, fn) => { let m = -Infinity; for (const x of a) { const v = fn(x); if (L.isNum(v) && v > m) m = v; } return m === -Infinity ? NaN : m; };
L.groupBy = (a, fn) => { const m = new Map(); for (const x of a) { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
L.uniq = a => [...new Set(a)];
L.slug = s => encodeURIComponent(s);
L.unslug = s => decodeURIComponent(s);

/* "Last, First" -> "First Last" */
L.disp = n => { if (!n) return ''; const p = n.split(','); return p.length > 1 ? (p[1].trim() + ' ' + p[0].trim()) : n; };
L.short = n => { if (!n) return ''; const p = n.split(','); return p.length > 1 ? (p[1].trim()[0] + '. ' + p[0].trim()) : n; };
L.teamName = t => (t === L.TEAM ? 'LMU' : ((L.TEAMS && L.TEAMS[t]) || t || '—'));

/* ── Formatting (mirrors the R reports' fmt_* helpers) ───────────────────── */
const DASH = '&mdash;';
L.f0 = v => L.isNum(v) ? String(Math.round(v)) : DASH;
L.f1 = v => L.isNum(v) ? v.toFixed(1) : DASH;
L.f2 = v => L.isNum(v) ? v.toFixed(2) : DASH;
L.f3 = v => L.isNum(v) ? v.toFixed(3).replace(/^(-?)0\./, '$1.') : DASH;
L.pct = v => L.isNum(v) ? Math.round(v) + '%' : DASH;
L.pct1 = v => L.isNum(v) ? v.toFixed(1) + '%' : DASH;
L.ip = outs => Math.floor(outs / 3) + '.' + (outs % 3);
L.comma = v => L.isNum(v) ? Math.round(v).toLocaleString('en-US') : DASH;
L.fdate = iso => { const [y, m, d] = iso.split('-').map(Number); return m + '/' + d + '/' + y; };
L.fdateLong = iso => {
  const dt = new Date(iso + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
};
L.fdateShort = iso => { const dt = new Date(iso + 'T12:00:00'); return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); };

/* ── Colors ──────────────────────────────────────────────────────────────── */
const hex2rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = a => '#' + a.map(v => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
L.mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A.map((v, i) => v + (B[i] - v) * t)); };
const cf01 = x => Math.max(0, Math.min(1, x));

/* Final Shove Score color (shove_engine.R score_color) */
L.scoreColor = s => {
  if (!L.isNum(s)) return '#8D9093';
  if (s >= 80) return L.mix('#6FD98A', '#0B7A3E', cf01((s - 80) / 20));
  if (s >= 70) return L.mix('#CF6A14', '#F7B34D', cf01((s - 70) / 10));
  return L.mix('#B5342E', '#F0837A', cf01(s / 70));
};
/* Metric tile color by % of goal (generate_postgame_report.R tile_color) */
L.tileColor = p => {
  if (!L.isNum(p)) return '#8D9093';
  if (p >= 100) return L.mix('#5FE09A', '#17915A', cf01((p - 100) / 50));
  if (p >= 70) return L.mix('#D9731A', '#F8C877', cf01((p - 70) / 30));
  return L.mix('#B5342E', '#F0837A', cf01(p / 70));
};
/* Percentile bubble: blue(0) -> grey(50) -> red(100) (Splitter_app.R hc_pct_color) */
L.pctColor = p => {
  p = Math.max(0, Math.min(100, p)) / 100;
  let r, g, b;
  if (p < 0.5) { const t = p / 0.5; r = 54 + (201 - 54) * t; g = 97 + (205 - 97) * t; b = 166 + (212 - 166) * t; }
  else { const t = (p - 0.5) / 0.5; r = 201 + (198 - 201) * t; g = 205 + (48 - 205) * t; b = 212 + (59 - 212) * t; }
  return rgb2hex([r, g, b]);
};
/* Leaderboard cell tint — same breakpoints as the Shiny DT styleInterval scales,
   rendered as a translucent red/green wash that reads on the dark theme. */
L.scaleBg = (v, lo, hi, higherBetter = true) => {
  if (!L.isNum(v)) return '';
  let t = cf01((v - lo) / (hi - lo)); if (!higherBetter) t = 1 - t;
  const d = (t - 0.5) * 2; // -1 .. 1
  const a = Math.min(0.75, Math.abs(d) * 0.75);
  return d >= 0 ? `background:rgba(0,170,40,${a.toFixed(2)})` : `background:rgba(225,70,62,${a.toFixed(2)})`;
};

/* Pitch colors — EXACTLY the Scrimmage Reports.R runner's report palettes.
   PITCH_COLORS  = shove_engine.R / Looped Reports.R pitch_colors (Shove reports,
                   TrackMan PDFs) -> every pitcher screen + leaderboards.
   HITTER_COLORS = Hitter Reports.R pitch_colors -> the hitter PA report.
   R color names resolved to hex (orange, gold, blue, darkgreen, ...).
   Unknown types fall back to #8D9093, like the reports' pc(). */
L.PITCH_COLORS = {
  Fastball: '#d7191c', '4 Seam Fastball': '#FF0000', '4-Seam Fastball': '#FF0000', 'Four-Seam': '#FF0000',
  'Two-Seam': '#FFA500', 'Two Seam': '#FFA500', Sinker: '#FFA500', Slider: '#FFD700', Sweeper: '#FF00FF',
  Curveball: '#0000FF', Changeup: '#006400', ChangeUp: '#006400', 'Split-Finger': '#ADD8E6', Splitter: '#ADD8E6',
  Cutter: '#FF1493', 'Knuckle Curve': '#800080', Other: '#000000', Knuckleball: '#000000'
};
L.HITTER_COLORS = Object.assign({}, L.PITCH_COLORS, {
  'Two-Seam': '#fdae61', 'Two Seam': '#fdae61', Sinker: '#fdae61', 'Fastball Low Slot': '#8B0000'
});
L.pc = t => L.PITCH_COLORS[t] || '#8D9093';
L.pcH = t => L.HITTER_COLORS[t] || '#8D9093';
/* Batted-ball outcome colors (Looped Reports.R / Hitter Reports.R outcome_type_colors) */
L.HIT_COL = '#0000FF'; L.OUT_COL = '#FF0000';
L.PITCH_ABBR = { Fastball: 'FB', Sinker: 'SI', Cutter: 'CT', Curveball: 'CB', Slider: 'SL', ChangeUp: 'CH', Splitter: 'SPL', Knuckleball: 'KN', Other: 'OTH' };
L.abbr = t => L.PITCH_ABBR[t] || t || '?';
L.PITCH_ORDER = ['Fastball', 'Sinker', 'Cutter', 'Curveball', 'Slider', 'ChangeUp', 'Splitter', 'Knuckleball', 'Other'];

/* ── Date presets (season = Aug 1 -> Jul 31, like OPENING_DAY in the app) ── */
L.seasonOf = iso => { const [y, m] = iso.split('-').map(Number); return m >= 8 ? y : y - 1; };
L.buildPresets = function () {
  const last = L.dates[L.dates.length - 1];
  const seasons = L.uniq(L.dates.map(L.seasonOf)).sort((a, b) => b - a);
  const P = [];
  const cur = seasons[0];
  P.push({ id: 'season', label: `${cur}-${String(cur + 1).slice(2)}`, from: `${cur}-08-01`, to: `${cur + 1}-07-31` });
  const hasFall = s => L.dates.some(d => d >= `${s}-08-01` && d <= `${s}-12-31`);
  const hasSpring = s => L.dates.some(d => d >= `${s + 1}-01-01` && d <= `${s + 1}-07-31`);
  for (const s of seasons) {
    if (hasSpring(s)) P.push({ id: 'sp' + (s + 1), label: `Spring ${s + 1}`, from: `${s + 1}-01-01`, to: `${s + 1}-07-31` });
    if (hasFall(s)) P.push({ id: 'fa' + s, label: `Fall ${s}`, from: `${s}-08-01`, to: `${s}-12-31` });
  }
  const back = n => { const d = new Date(last + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  P.push({ id: 'l14', label: 'Last 14d', from: back(14), to: last });
  P.push({ id: 'all', label: 'All', from: L.dates[0], to: last });
  // sort: season first, then chronological newest-first for the rest
  L.presets = P;
  L.state.preset = L.state.preset && P.find(p => p.id === L.state.preset) ? L.state.preset : 'season';
};
L.range = () => L.presets.find(p => p.id === L.state.preset) || L.presets[0];
L.inRange = (r, rg) => r.date >= rg.from && r.date <= rg.to;

/* Game helpers */
L.game = key => L.gameMap[key] || { key, date: (L.rows.find(r => r.game === key) || {}).date || '', num: 1, of: 1, order: 0 };
L.gameNo = key => { const g = L.game(key); return g.of > 1 ? `Game ${g.num}` : ''; };
L.gameTitle = key => { const g = L.game(key); return L.fdateLong(g.date) + (g.of > 1 ? ` · Game ${g.num}` : ''); };
/* list title without the year (the month header carries it): "Sat, Mar 14 · Game 1" */
L.gameListTitle = key => {
  const g = L.game(key), dt = new Date(g.date + 'T12:00:00');
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + (g.of > 1 ? ` · Game ${g.num}` : '');
};
L.gameShort = key => { const g = L.game(key); return L.fdateShort(g.date) + (g.of > 1 ? ` G${g.num}` : ''); };
/* Final score + result for a game (from the exporter's RunsScored totals).
   Opponent games -> { known, lmu, opp, wl: 'W'|'L'|'T', text: 'W 10-6' } (LMU first)
   Intrasquad     -> { known, intra, vis, home, text: '8-7' } (visitors/top first) */
L.result = key => {
  const g = L.game(key), known = L.isNum(g.hr) && L.isNum(g.ar);
  if (g.intra) return { known, intra: true, vis: g.ar, home: g.hr, text: known ? `${g.ar}-${g.hr}` : '' };
  if (!known) return { known: false };
  const lmuHome = g.home === L.TEAM, lmu = lmuHome ? g.hr : g.ar, opp = lmuHome ? g.ar : g.hr;
  const wl = lmu > opp ? 'W' : lmu < opp ? 'L' : 'T';
  return { known, lmu, opp, wl, home: lmuHome, text: `${wl} ${lmu}-${opp}` };
};
/* W-L(-T) record over a set of game keys (opponent games only) */
L.record = keys => {
  let w = 0, l = 0, t = 0, nt = 0;
  for (const k of keys) {
    if (L.game(k).intra) continue;
    const r = L.result(k);
    if (!r.known) { nt++; continue; }
    if (r.wl === 'W') w++; else if (r.wl === 'L') l++; else t++;
  }
  return { w, l, t, nt, text: `${w}-${l}${t ? '-' + t : ''}`, n: w + l + t };
};
L.scoreChip = key => {
  const r = L.result(key);
  if (r.intra) return r.known ? `<span class="score">${r.text}</span>` : '<span class="score na">no score</span>';
  if (!r.known) return '<span class="score na">no score</span>';
  return `<span class="score ${r.wl === 'W' ? 'win' : r.wl === 'L' ? 'loss' : ''}">${r.text}</span>`;
};

/* rows -> [[gameKey, rows], ...] newest game first */
L.byGame = rows => [...L.groupBy(rows, r => r.game)].sort((a, b) => L.game(b[0]).order - L.game(a[0]).order);
L.nGames = rows => L.uniq(rows.map(r => r.game)).length;

/* Persisted per-viewer UI state (preset, toggles). Storage may be unavailable. */
L.state = (() => { try { return JSON.parse(localStorage.getItem('lmu-state') || '{}'); } catch (e) { return {}; } })();
L.save = () => { try { localStorage.setItem('lmu-state', JSON.stringify(L.state)); } catch (e) { /* ignore */ } };

/* Opponents: TrackMan team code -> school name. Each has a logo at
   img/teams/<CODE>.png (from NCAA.com, 2026-11-05). Add new opponents here and
   drop a 96x96 PNG named after the code into img/teams/. */
L.TEAMS = {
  AND_TRO: 'Anderson (SC)', BFS_BBS: 'Bluefield State', CAR_EAG: 'Carson-Newman', CAT_IND: 'Catawba',
  CED_UNI: 'Cedarville', COK_COB: 'Coker', EMO_HEN: 'Emory & Henry', HIL_COL2: 'Hillsdale',
  KEN_STA1: 'Kentucky State', LEE_UNI: 'Lee', LEN_BEA: 'Lenoir-Rhyne', MAR_LIO: 'Mars Hill',
  NOR_GRE: 'North Greenville', THO_MOR: 'Thomas More', TNU: 'Trevecca Nazarene', TUS_PIO: 'Tusculum',
  VIR_WIS: 'UVA Wise', WIN_BUL: 'Wingate'
};
L.oppTeams = rows => L.uniq(rows.flatMap(r => [r.pteam, r.bteam]).filter(x => x && x !== L.TEAM));
/* Opponent label for a date's games */
L.oppFor = rows => {
  const t = L.oppTeams(rows);
  return t.length ? t.map(c => L.TEAMS[c] || c).join(', ') : 'Intrasquad';
};
/* Logo for a date: the opponent's, or the LMU mark for intrasquad / unknown */
L.oppLogo = rows => {
  const t = L.oppTeams(rows), c = t.find(x => L.TEAMS[x]);
  return c ? { src: `img/teams/${c}.png`, alt: L.TEAMS[c] }
    : { src: 'img/mark.png', alt: t.length ? (t[0]) : 'LMU intrasquad' };
};
L.logoFor = c => (L.TEAMS[c] ? `img/teams/${c}.png` : 'img/mark.png');
/* Opponent index (built once): team code -> game keys newest first,
   and game key -> opponent codes. */
L.oppIndex = () => {
  if (L._oppIdx) return L._oppIdx;
  const m = {}, g = {};
  for (const r of L.rows) for (const t of [r.pteam, r.bteam]) {
    if (!t || t === L.TEAM) continue;
    (m[t] || (m[t] = new Set())).add(r.game);
    (g[r.game] || (g[r.game] = new Set())).add(t);
  }
  const out = {};
  for (const [c, s] of Object.entries(m)) out[c] = [...s].sort((a, b) => L.game(b).order - L.game(a).order);
  L._gameOpps = {}; for (const [k, s] of Object.entries(g)) L._gameOpps[k] = [...s];
  return (L._oppIdx = out);
};
L.gameOpps = key => { L.oppIndex(); return L._gameOpps[key] || []; };
