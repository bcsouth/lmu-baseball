/* views.js — every screen. Each view returns { title, back, html, actions }.
   Controls use data-key/data-val (handled globally in app.js) so changing a
   filter just updates L.state and re-renders the current route. */
'use strict';
(function () {
  const esc = L.esc, isNum = L.isNum, F = L.FLAG, has = L.has;
  const V = L.views = {};
  const BADGE = '<img class="hbadge" src="img/mark.png" alt="LMU Player Development">';
  const FOOT = t => `<div class="foot"><span class="brandline">LMU Player Development</span>${t}</div>`;

  /* ── shared bits ─────────────────────────────────────────────────────── */
  const chips = (key, opts, cur, cls = '') => `<div class="chips ${cls}">` + opts.map(o =>
    `<button class="chip${o.v === cur ? ' on' : ''}" data-key="${key}" data-val="${esc(o.v)}">${esc(o.l)}</button>`).join('') + '</div>';
  const presetChips = (key = 'preset', cur = L.state.preset) => chips(key, L.presets.map(p => ({ v: p.id, l: p.label })), cur, 'scroll');
  /* Scouting: opponent pitchers use the same pitcher + Shove views as LMU.
     team = null -> LMU; team = TrackMan code -> that opponent's pitchers
     (only pitches they threw against LMU — those are the games we track).
     Opponent pages keep their own date chips (oPreset), defaulting to All. */
  const pitRows = team => team ? (L._oppPit[team] || (L._oppPit[team] = L.rows.filter(r => r.pteam === team))) : L.lmuPitching;
  L._oppPit = {};
  const pitHref = (team, name) => team ? `#/opitcher/${L.slug(team)}/${L.slug(name)}` : `#/pitcher/${L.slug(name)}`;
  const shoveHref = (team, when, name) => team ? `#/oshove/${L.slug(team)}/${L.slug(when)}/${L.slug(name)}` : `#/shove/${L.slug(when)}/${L.slug(name)}`;
  // opponent hitters: their plate appearances against LMU pitching
  const batRows = team => team ? (L._oppBat[team] || (L._oppBat[team] = L.rows.filter(r => r.bteam === team && r.pteam === L.TEAM))) : L.lmuBatting;
  L._oppBat = {};
  const hitHref = (team, name) => team ? `#/ohitter/${L.slug(team)}/${L.slug(name)}` : `#/hitter/${L.slug(name)}`;
  const hitRepHref = (team, d, name) => team ? `#/ohit/${L.slug(team)}/${L.slug(d)}/${L.slug(name)}` : `#/hit/${L.slug(d)}/${L.slug(name)}`;
  const oRange = () => L.presets.find(p => p.id === L.state.oPreset) || L.presets.find(p => p.id === 'all') || L.presets[0];
  const sec = (title, body, extra = '') => `<section class="card"><h2>${title}${extra}</h2>${body}</section>`;
  const empty = msg => `<div class="empty">${msg}</div>`;
  const tile = (label, value, sub, color) =>
    `<div class="tile"${color ? ` style="border-color:${color}"` : ''}><div class="tv"${color ? ` style="color:${color}"` : ''}>${value}</div><div class="tl">${label}</div>${sub ? `<div class="ts">${sub}</div>` : ''}</div>`;
  const stat = (label, value) => `<div class="stat"><b>${value}</b><span>${label}</span></div>`;
  const badge = s => `<span class="badge" style="color:${L.scoreColor(s)};border-color:${L.scoreColor(s)}">${L.f0(s)}</span>`;
  const tbl = (head, rows, opts = {}) => `<div class="tscroll"><table class="tbl${opts.cls ? ' ' + opts.cls : ''}"><thead><tr>${head.map(h => `<th${h.k ? ` data-sort="${h.k}"` : ''}${h.cls ? ` class="${h.cls}"` : ''}>${h.l}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;

  /* Shove metric tiles — 4 + 3 layout, colored by % of goal (report parity) */
  function shoveTiles(s) {
    const PS = L.PS;
    const pgHi = (a, g) => isNum(a) ? 100 * a / g : NaN;
    const pgLo = (a, g) => !isNum(a) ? NaN : a <= 0 ? 200 : 100 * g / a;
    const kp = s.pa > 0 ? 100 * s.k / s.pa : NaN, bp = s.pa > 0 ? 100 * s.bb / s.pa : NaN;
    const kbb = isNum(s.kbb_pct) ? (s.kbb_pct >= 0 ? '+' : '') + Math.round(s.kbb_pct) + '%' : '&mdash;';
    return `<div class="tiles4">
      ${tile('0-0 Win%', L.pct(s.win00), `${s.w00}/${s.n00} 0-0`, L.tileColor(pgHi(s.win00, PS.win00_goal)))}
      ${tile('1-1 Win%', L.pct(s.win11), `${s.w11}/${s.n11} 1-1`, L.tileColor(pgHi(s.win11, PS.win11_goal)))}
      ${tile('Strike%', L.pct(s.strike_pct), `${s.strike_num}/${s.n} P`, L.tileColor(pgHi(s.strike_pct, PS.strike_goal)))}
      ${tile('E+A%', L.pct(s.ea_pct), `${s.ea_num}/${s.pa} PA`, L.tileColor(pgHi(s.ea_pct, PS.ea_goal)))}
    </div><div class="tiles3">
      ${tile('P/Out', L.f2(s.p_out), `${s.n}P / ${s.outs} Out`, L.tileColor(pgLo(s.p_out, PS.pout_goal)))}
      ${tile('K-BB%', kbb, `${L.pct(kp)} K · ${L.pct(bp)} BB`, L.tileColor(pgHi(s.kbb_pct, PS.kbb_goal)))}
      ${tile('xBA', L.f3(s.xba), `${s.xba_ab} AB`, L.tileColor(pgLo(s.xba, PS.xba_goal)))}
    </div>`;
  }

  function arsenalTable(ars, full) {
    const head = [{ l: 'Pitch', cls: 'stick' }, { l: 'Use' }, { l: 'Velo' }, { l: 'Max' }, { l: 'IVB' }, { l: 'HB' }, { l: 'Spin' }, { l: 'Str%' }, { l: 'Zone%' }]
      .concat(full ? [{ l: 'Whiff%' }, { l: 'Ext' }, { l: 'RelH' }, { l: 'VAA' }] : []);
    const rows = ars.map(a => `<tr><td class="stick"><i class="dot" style="background:${L.pc(a.p)}"></i>${esc(a.p)}</td>
      <td>${L.pct(a.usage)}<small> ${a.n}</small></td><td>${L.f1(a.velo)}</td><td>${L.f1(a.max)}</td><td>${L.f1(a.ivb)}</td><td>${L.f1(a.hb)}</td>
      <td>${L.comma(a.spin)}</td><td>${L.pct(a.strike)}</td><td>${L.pct(a.zone)}</td>
      ${full ? `<td>${L.pct(a.whiff)}</td><td>${L.f1(a.ext)}</td><td>${L.f1(a.relh)}</td><td>${L.f1(a.vaa)}</td>` : ''}</tr>`);
    return tbl(head, rows);
  }
  const usageBars = ars => '<div class="ubars">' + ars.map(a => `<div class="ubar"><span>${esc(a.p)}</span><div><i style="width:${a.usage.toFixed(1)}%;background:${L.pc(a.p)}"></i></div><em>${L.pct(a.usage)}</em></div>`).join('') + '</div>';
  const pitchTypes = df => L.PITCH_ORDER.filter(t => df.some(r => r.ptype === t));

  /* Trend card. Two modes, switched by the "Rolling" checkbox:
       off -> one dot per game, joined by a line (that game only)
       on  -> rolling value over the last N games, or season-to-date
              (cumulative). Rolling values are POOLED over those games'
              pitches, not an average of per-game averages. */
  /* gate = { min, pa: rows -> PA, lab }: the line starts at the first game
     where his PA in the date range (cumulative) reaches `min`. Earlier games
     still count toward the rolling / to-date values. */
  function trendCard(games, cfgs, stateKey, w, hrefFn, unit, extraFn, gate) {
    const keys = Object.keys(cfgs), mk = cfgs[L.state[stateKey]] ? L.state[stateKey] : keys[0], c = cfgs[mk];
    const pick = chips(stateKey, keys.map(k => ({ v: k, l: cfgs[k].l })), mk, 'scroll');
    const rollOn = L.state[stateKey + 'R'] === '1';
    const wins = [String(w), String(w + 2), 'all'], wsel = wins.includes(L.state[stateKey + 'W']) ? L.state[stateKey + 'W'] : String(w);
    const winLabel = v => v === 'all' ? 'Season-to-date' : `Last ${v}`;
    const tog = `<div class="rollbar"><label class="rolltog"><input type="checkbox" data-toggle="${stateKey}R"${rollOn ? ' checked' : ''}><span>Rolling</span></label>` +
      (rollOn ? chips(stateKey + 'W', wins.map(v => ({ v, l: winLabel(v) })), wsel, 'mini') : `<span class="rollhint">Per ${unit}</span>`) + '</div>';
    if (games.length < 2) return sec('Trend', pick + tog + empty(`Needs 2+ ${unit}s in this date range.`));
    const N = wsel === 'all' ? Infinity : +wsel;
    // live readout for each point: that game, rolling last-N, and to-date,
    // with whichever one the chart is plotting highlighted
    const Nr = N === Infinity ? w : N;          // "Last N" row when the plot isn't last-N
    const pool = (i, n) => games.slice(n === Infinity ? 0 : Math.max(0, i - n + 1), i + 1).flatMap(g => g[1]);
    const f = v => (isNum(v) ? c.fmt(v) : '&mdash;');
    let start = 0, cumPA = 0;
    if (gate) {
      start = -1;
      for (let i = 0; i < games.length; i++) { cumPA += gate.pa(games[i][1]); if (cumPA >= gate.min) { start = i; break; } }
      if (start < 0) return sec('Trend', pick + tog + empty(`The trend starts once he reaches ${gate.min} ${gate.lab} in this date range (${cumPA} so far).`));
    }
    const pts = games.map(([k, rs], i) => {
      if (i < start) return null;
      const own = c.v(rs), last = c.v(pool(i, Nr)), cum = c.v(pool(i, Infinity));
      const v = !rollOn ? own : N === Infinity ? cum : last;
      const nIn = Math.min(i + 1, Nr);
      const row = (lab, val, on) => `<div class="trow${on ? ' on' : ''}"><em>${lab}</em><b>${f(val)}</b></div>`;
      const tip = `<div class="thead"><b>${L.gameShort(k)}</b> vs ${esc(L.oppFor(L.rows.filter(r => r.game === k)))}</div>` +
        (extraFn ? `<div class="tsub">${extraFn(rs)}</div>` : '') +
        row(`This ${unit}`, own, !rollOn) +
        row(`Last ${nIn} ${unit}${nIn > 1 ? 's' : ''}`, last, rollOn && N !== Infinity) +
        row(`To date (${i + 1} ${unit}${i ? 's' : ''})`, cum, rollOn && N === Infinity) +
        `<a class="tlink" href="${hrefFn(k)}">Open ${unit} report ›</a>`;
      return { v, roll: v, label: L.gameShort(k), href: hrefFn(k), tip };
    }).filter(Boolean);
    const ok = pts.filter(p => isNum(p.v)), first = ok[0], last = ok[ok.length - 1];
    let delta = '';
    if (first && last && first !== last) {
      const dv = last.v - first.v, good = c.hb === undefined ? null : (dv > 0) === c.hb;
      delta = `<small class="${good === null || Math.abs(dv) < 1e-9 ? '' : good ? 'up' : 'down'}">${c.fmt(first.v)} → ${c.fmt(last.v)}</small>`;
    }
    const what = rollOn ? (N === Infinity ? 'season-to-date (every ' + unit + ' so far)' : `rolling, last ${N} ${unit}s pooled`) : `each ${unit} on its own`;
    return sec('Trend', pick + tog + L.trend(pts, { fmt: c.fmt, goal: c.goal, goalLabel: c.goalLabel, lo: c.lo, hi: c.hi, color: c.color, line: rollOn ? 'roll' : 'game' }) +
      `<div class="note">${what} · ${gate ? `starts once he reaches ${gate.min} ${gate.lab}${start ? ` (${L.gameShort(games[start][0])})` : ''} · ` : ''}${c.note ? c.note + ' · ' : ''}hover (or touch and slide) for each ${unit}'s numbers.</div>`, delta);
  }

  /* Hitter game line, e.g. "3-4, HR, 2B, 2 RBI, K, BB": H-AB, then HR / 3B / 2B /
     RBI / K / BB / HBP. A single one shows just the event ("BB"); two or more
     show "count event" ("2 RBI"); zeros are left out. */
  L.gameLine = function (m, rbi) {
    const n2 = m.XBH - m.HR - (m.n3 || 0), parts = [`${m.H}-${m.AB}`];
    const add = (n, lab) => { if (n > 0) parts.push(n > 1 ? `${n} ${lab}` : lab); };
    add(m.HR, 'HR'); add(m.n3 || 0, '3B'); add(n2, '2B');
    add(rbi, 'RBI'); add(m.K, 'K'); add(m.BB, 'BB'); add(m.HBP, 'HBP');
    return parts.join(', ');
  };

  /* ── Game list (home) ────────────────────────────────────────────────── */
  V.games = function () {
    const items = L.byGame(L.rows).map(([k, rows]) => {
      const pit = rows.filter(r => r.pteam === L.TEAM), bat = rows.filter(r => r.bteam === L.TEAM && !L.HIDE_BATTERS.has(r.batter));
      const np = L.uniq(pit.map(r => r.pitcher)).length, nb = L.uniq(bat.map(r => r.batter)).length;
      return { k, d: L.game(k).date, opp: L.oppFor(rows), logo: L.oppLogo(rows), np, nb, ip: pit.length ? L.computeShove(pit).ip : null };
    });
    const byMonth = L.groupBy(items, it => it.d.slice(0, 7));
    let html = `<div class="brandbar"><img src="img/wordmark.png" alt="LMU Player Development"></div>`;
    // W-L vs opponents, one line per season that had opponent games
    const seasons = [...L.groupBy(items.filter(it => !L.game(it.k).intra), it => L.seasonOf(it.d))];
    if (seasons.length) html += '<div class="records">' + seasons.map(([s, its]) => {
      const rec = L.record(its.map(it => it.k));
      return `<div class="rec"><span>${s}-${String(s + 1).slice(2)} vs opponents</span><b>${rec.text}</b>${rec.nt ? `<em>${rec.nt} game${rec.nt > 1 ? 's' : ''} not scored</em>` : ''}</div>`;
    }).join('') + '</div>';
    const nOpp = Object.keys(L.oppIndex()).length;
    if (nOpp) html += `<a class="row staffbtn" href="#/opps"><div class="rmain"><b>Opponents</b><span>${nOpp} teams · record, games, and matchups by school</span></div><i class="chev"></i></a>`;
    html += `<div class="intro">Tap a game for the staff Shove board, pitcher Shove reports, and hitter PA reports.</div>`;
    for (const [m, its] of byMonth) {
      const lbl = new Date(m + '-15T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      const mrec = L.record(its.map(it => it.k));
      html += `<h3 class="month">${lbl}${mrec.n ? `<span class="mrec">${mrec.text}</span>` : ''}</h3><div class="list">` + its.map(it => `
        <a class="row" href="#/game/${L.slug(it.k)}">
          <div class="rmain"><b>${L.gameListTitle(it.k)}</b><span>${esc(it.opp)}${it.ip !== null ? ` · ${it.ip} IP` : ''} · ${it.np} pitchers · ${it.nb} hitters</span></div>
          ${L.scoreChip(it.k)}<img class="tlogo" src="${it.logo.src}" alt="${esc(it.logo.alt)}"><i class="chev"></i></a>`).join('') + '</div>';
    }
    return { title: 'Games', html, root: true };
  };

  /* ── Game day: staff Shove board + hitters ───────────────────────────── */
  V.game = function (k) {
    const rows = L.rows.filter(r => r.game === k);
    if (!rows.length) return { title: 'Game', html: empty('No data for this game.'), back: '#/' };
    const pit = rows.filter(r => r.pteam === L.TEAM), bat = rows.filter(r => r.bteam === L.TEAM && !L.HIDE_BATTERS.has(r.batter));
    // final score line: "Final: LMU 10, Emory & Henry 6 · W" (visitor listed first)
    const res = L.result(k), gm = L.game(k);
    let fin = '';
    if (res.intra) fin = res.known ? `Final: Visitors ${res.vis}, Home ${res.home}` : 'Score not tracked (one side only)';
    else if (res.known) {
      const oppName = L.oppFor(rows), lmuS = `LMU ${res.lmu}`, oppS = `${oppName} ${res.opp}`;
      fin = `Final: ${res.home ? `${oppS}, ${lmuS}` : `${lmuS}, ${oppS}`} <span class="wl ${res.wl === 'W' ? 'win' : res.wl === 'L' ? 'loss' : ''}">${res.wl}</span>`;
    } else fin = 'Score not tracked (only one team\'s at-bats in the file)';
    const where = gm.intra ? '' : (gm.home === L.TEAM ? 'Home' : 'Away') + ' · ';
    let html = `<div class="hero"><div class="hmain"><h1>${L.gameTitle(k)}</h1><div class="sub">${where}vs ${esc(L.oppFor(rows))}</div><div class="final">${fin}</div>${L.oppTeams(rows).length ? `<a class="btn alt" href="#/opp/${L.slug(L.oppTeams(rows)[0])}">All games vs ${esc(L.teamName(L.oppTeams(rows)[0]))}</a>` : ''}</div>${L.oppTeams(rows).some(c => L.TEAMS[c]) ? `<a class="hlink" href="#/opp/${L.slug(L.oppTeams(rows).find(c => L.TEAMS[c]))}"><img class="hbadge" src="${L.oppLogo(rows).src}" alt="${esc(L.oppLogo(rows).alt)}"></a>` : ''}${BADGE}</div>`;
    if (pit.length) {
      const st = L.computeShove(pit);
      const scored = [...L.groupBy(pit, r => r.pitcher)].map(([p, rs]) => ({ p, s: L.computeShove(rs) }))
        .sort((a, b) => b.s.shove - a.s.shove);
      html += `<section class="card"><div class="shead">${L.gauge(st.shove, 110)}<div><div class="kicker">Staff Shove Score</div>
          <div class="line">${st.ip} IP · ${st.h} H · ${st.k} K · ${st.bb} BB · ${st.n} P</div></div></div>
          ${shoveTiles(st)}</section>`;
      html += sec('Pitchers', '<div class="list">' + scored.map((x, i) => `
        <a class="row" href="#/shove/${L.slug(k)}/${L.slug(x.p)}"><span class="rank">${i + 1}</span>
          <div class="rmain"><b>${esc(L.disp(x.p))}</b><span>${x.s.ip} IP · ${x.s.h} H · ${x.s.k} K · ${x.s.bb} BB · ${x.s.n} P</span></div>
          ${badge(x.s.shove)}<i class="chev"></i></a>`).join('') + '</div>');
    }
    if (bat.length) {
      const hs = [...L.groupBy(bat, r => r.batter)].map(([b, rs]) => {
        const pas = L.plateAppearances(rs), m = L.hitterMetrics(rs);
        const rbi = pas.reduce((a, p) => a + p.rbi, 0);
        return { b, m, rbi, prod: m.H + m.TB + rbi + m.BB + m.HBP, maxEv: L.max(rs.filter(r => r.pcall === 'InPlay'), r => r.ev) };
      }).sort((a, b) => b.prod - a.prod || b.m.H - a.m.H);
      html += sec('Hitters', '<div class="list">' + hs.map(x =>
        `<a class="row" href="#/hit/${L.slug(k)}/${L.slug(x.b)}"><div class="rmain"><b>${esc(L.disp(x.b))}</b><span class="gline">${esc(L.gameLine(x.m, x.rbi))}</span></div><i class="chev"></i></a>`
      ).join('') + '</div>');
    }
    return { title: L.gameShort(k), html, back: '#/', print: true, pdf: `Game - ${L.gameShort(k)} vs ${L.oppFor(rows)}` };
  };

  /* ── Shove report (one game, or a date range) ────────────────────────── */
  V.shove = function (when, pitcher, team) {
    let rows, label;
    const src = pitRows(team);
    if (when.startsWith('r:')) {
      const [, from, to] = when.split(':');
      rows = src.filter(r => r.pitcher === pitcher && r.date >= from && r.date <= to);
      const nd = L.nGames(rows);
      label = `${L.fdate(from)} – ${L.fdate(to)} · ${nd} app`;
    } else {
      rows = src.filter(r => r.pitcher === pitcher && r.game === when);
      label = L.gameTitle(when);
    }
    if (!rows.length) return { title: 'Shove', html: empty('No pitches for this selection.'), back: '#/' };
    const s = L.computeShove(rows), ars = L.arsenalRows(rows);
    const opp = when.startsWith('r:') ? '' : ` vs ${esc(L.teamName(s.opp))}`;
    const teamTag = team ? `<div class="sub">${esc(L.teamName(team))} · scouting (vs LMU hitters)</div>` : '';
    const badgeImg = team ? `<img class="hbadge" src="${L.logoFor(team)}" alt="">` : BADGE;
    const html = `
      <div class="hero report"><div class="gwrap">${L.gauge(s.shove, 120)}<div class="kicker">Shove Score</div></div>
        <div class="hmain"><h1>${esc(L.disp(pitcher))}</h1>${teamTag}<div class="sub">${esc(label)}</div>
        <div class="line">${s.ip} IP, ${s.h} H, ${s.k} K, ${s.bb} BB${opp}</div></div>${badgeImg}</div>
      <section class="card">${shoveTiles(s)}</section>
      ${sec('Arsenal', arsenalTable(ars) + usageBars(ars))}
      ${sec("Pitch Locations — Pitcher's View", L.locationFacets(rows))}
      ${sec('Movement &amp; Release', `<div class="two"><div><div class="strip">Movement — HB / IVB</div>${L.movement(rows)}</div><div><div class="strip">Release Point</div>${L.release(rows)}</div></div>` + L.pitchLegend(pitchTypes(rows)))}
      ${FOOT('It Pays to be a Winner')}`;
    return { title: 'Shove Report', html, back: team || when.startsWith('r:') ? pitHref(team, pitcher) : `#/game/${L.slug(when)}`, print: true,
      pdf: `Shove - ${L.disp(pitcher)} - ${when.startsWith('r:') ? label.replace(/\//g, '-') : L.gameShort(when)}` };
  };

  /* ── Hitter post-game PA report (Hitter Reports.R, phone layout) ─────── */
  V.hit = function (d, batter, team) {
    const rows = batRows(team).filter(r => r.batter === batter && r.game === d);
    const hback = team ? hitHref(team, batter) : `#/game/${L.slug(d)}`;
    if (!rows.length) return { title: 'Hitter', html: empty('No pitches for this hitter in this game.'), back: hback };
    const pas = L.plateAppearances(rows), m = L.hitterMetrics(rows);
    const hard = rows.filter(r => r.pcall === 'InPlay' && isNum(r.ev) && r.ev >= 95).length;
    const rbi = pas.reduce((a, p) => a + p.rbi, 0), ob = pas.filter(p => p.onBase).length;
    const opp = L.uniq(rows.map(r => r.pteam)).map(L.teamName).join(', ');
    let html = `<div class="hero report"><div class="hmain"><h1>${esc(L.disp(batter))}</h1>
        <div class="sub">${team ? esc(L.teamName(team)) + ' · ' : ''}vs ${esc(opp)} · ${L.gameTitle(d)}</div></div><div class="bigline">${m.H}-${m.AB}</div>${team ? `<img class="hbadge" src="${L.logoFor(team)}" alt="">` : BADGE}</div>
      <div class="stats4">${stat('On Base', ob)}${stat('Hard Hit', hard)}${stat('Hits', m.H)}${stat('RBI', rbi)}</div>
      ${L.pitchLegend(pitchTypes(rows), L.pcH)}${L.ringLegend()}`;
    html += pas.map(pa => {
      const res = pa.res, cls = res.good === true ? 'good' : res.good === false ? 'bad' : '';
      const bb = isNum(pa.ev) ? `<div class="bbline">${pa.ev.toFixed(0)} mph${isNum(pa.la) ? ` · ${pa.la.toFixed(0)}°` : ''}${isNum(pa.dist) ? ` · ${pa.dist.toFixed(0)} ft` : ''}${isNum(pa.xba) ? ` · xBA ${L.f3(pa.xba)}` : ''}</div>` : '';
      const list = pa.pitches.map(r => `<li><b>${r.pp}</b><span>${esc(L.CALL_ABBR[r.pcall] || r.pcall || '')}</span><em><i class="dot" style="background:${L.pcH(r.ptype)}"></i>${L.abbr(r.ptype)}</em><span>${isNum(r.velo) ? Math.round(r.velo) : ''}</span></li>`).join('');
      return `<section class="card pa"><div class="pahead"><div><b>PA ${pa.num}</b> · Inn ${pa.inn ?? '–'}<div class="vs">vs ${esc(L.disp(pa.pitcher))} (${pa.pthrows === 'Left' ? 'LHP' : 'RHP'})</div></div>
          <span class="res ${cls}">${esc(res.label)}</span></div>${bb}
        <div class="pabody">${L.paZone(pa.pitches)}<ol class="plist">${list}</ol></div></section>`;
    }).join('');
    const bip = rows.filter(r => r.pcall === 'InPlay');
    if (bip.length) {
      const paOf = new Map(); pas.forEach(p => p.pitches.forEach(r => paOf.set(r.i, p.num)));
      html += sec('Spray Chart', L.spray(bip, { label: b => 'PA ' + paOf.get(b.i) }) + L.outcomeLegend());
    }
    html += FOOT("Zones drawn like the PDF hitter report (catcher's view) · white ring = ball in play · yellow ring = swing &amp; miss · It Pays to be a Winner");
    return { title: 'Hitter Report', html, back: hback, print: true, pdf: `${team ? 'Scouting - ' + L.teamName(team) + ' - ' : 'Hitter Report - '}${L.disp(batter)} - ${L.gameShort(d)}` };
  };

  /* ── Player lists ────────────────────────────────────────────────────── */
  function playerList(kind) {
    const rg = L.range(), src = kind === 'p' ? L.lmuPitching : L.lmuBatting, key = kind === 'p' ? 'pitcher' : 'batter';
    const all = L.groupBy(src, r => r[key]);
    const q = (L.state['q' + kind] || '').toLowerCase();
    const items = [...all].map(([n, rs]) => {
      const inr = rs.filter(r => L.inRange(r, rg));
      const last = rs.reduce((a, r) => r.date > a ? r.date : a, '');
      let score = null;
      if (inr.length) score = kind === 'p' ? L.computeShove(inr).shove : L.hitterMetrics(inr);
      return { n, inr, last, score };
    }).filter(x => !q || x.n.toLowerCase().includes(q) || L.disp(x.n).toLowerCase().includes(q))
      .sort((a, b) => (b.inr.length > 0) - (a.inr.length > 0) || (b.last > a.last ? 1 : b.last < a.last ? -1 : 0));
    const active = items.filter(x => x.inr.length), inactive = items.filter(x => !x.inr.length);
    // pitchers: always ranked by Shove Score (range), highest first
    if (kind === 'p') active.sort((a, b) => b.score - a.score);
    // hitters: ranked by OPS (range), highest first; no OPS sinks to the bottom
    else active.sort((a, b) => (isNum(b.score.OPS) ? b.score.OPS : -1) - (isNum(a.score.OPS) ? a.score.OPS : -1));
    const row = x => {
      let right = '', sub;
      if (kind === 'p') {
        sub = x.inr.length ? `${L.nGames(x.inr)} G · ${x.inr.length} P · last ${L.fdateShort(x.last)}` : `last ${L.fdateShort(x.last)}`;
        if (x.score !== null) right = badge(x.score);
      } else {
        const m = x.score;
        // xBA · QAB% (coaches' stat sheet) · OPS — list is ranked by OPS
        const qo = L.qab && L.qab.by[x.n];
        sub = m ? `${m.PA} PA · ${L.f3(m.BA)}/${L.f3(m.OBP)}/${L.f3(m.SLG)}<span class="hstats"><span><b>${L.f3(m.xBA)}</b> xBA</span><span><b>${qo ? L.pct(100 * qo.QABpct) : '&mdash;'}</b> QAB%</span><span><b>${L.f3(m.OPS)}</b> OPS</span></span>` : `last ${L.fdateShort(x.last)}`;
      }
      return `<a class="row${x.inr.length ? '' : ' dim'}" href="#/${kind === 'p' ? 'pitcher' : 'hitter'}/${L.slug(x.n)}">
        <div class="rmain"><b>${esc(L.disp(x.n))}</b><span>${sub}</span></div>${right}<i class="chev"></i></a>`;
    };
    let html = presetChips();
    if (kind === 'p') {   // whole-staff Shove report for the selected range
      const st = src.filter(r => L.inRange(r, rg));
      if (st.length) {
        const s = L.computeShove(st);
        html += `<a class="row staffbtn" href="#/staff"><div class="rmain"><b>Staff Shove Report</b><span>${esc(rg.label)} · ${L.nGames(st)} G · ${s.ip} IP · ${L.uniq(st.map(r => r.pitcher)).length} pitchers</span></div>${badge(s.shove)}<i class="chev"></i></a>`;
      }
    }
    html += `<a class="row cmpbtn" href="#/compare/${kind}"><div class="rmain"><b>Compare ${kind === 'p' ? 'pitchers' : 'hitters'}</b><span>Any two side by side · ${esc(rg.label)}</span></div><i class="chev"></i></a>`;
    html += `<input class="search" type="search" placeholder="Search ${kind === 'p' ? 'pitchers' : 'hitters'}" value="${esc(L.state['q' + kind] || '')}" data-search="q${kind}">`;
    html += '<div class="list">' + active.map(row).join('') + '</div>';
    // players with no data in the selected range are not listed (user request);
    // they're still reachable from Search and Compare
    if (!active.length) html += empty(`No ${kind === 'p' ? 'pitchers' : 'hitters'} with data in ${esc(rg.label)}${q ? ' matching that search' : ''}.`);
    return html;
  }
  V.pitchers = () => ({ title: 'Pitchers', html: playerList('p'), root: true });

  /* ── Staff Shove report for a date range: Shove metrics only ─────────── */
  V.staff = function () {
    const rg = L.range();
    const rows = L.lmuPitching.filter(r => L.inRange(r, rg));
    let html = presetChips();
    if (!rows.length) return { title: 'Staff Report', back: '#/pitchers', html: html + empty('No LMU pitching in this date range.') };
    const s = L.computeShove(rows), nG = L.nGames(rows);
    html += `<div class="hero report"><div class="gwrap">${L.gauge(s.shove, 120)}<div class="kicker">Staff Shove</div></div>
      <div class="hmain"><h1>Staff Report</h1><div class="sub">${esc(rg.label)} · ${L.fdate(L.uniq(rows.map(r => r.date)).sort()[0])} – ${L.fdate(rows.reduce((a, r) => r.date > a ? r.date : a, ''))}</div>
      <div class="line">${nG} G · ${s.ip} IP · ${s.h} H · ${s.k} K · ${s.bb} BB · ${s.n} P</div></div>${BADGE}</div>`;
    html += sec('Staff Process', shoveTiles(s));
    // every pitcher's Shove over the range, ranked high -> low
    const ps = [...L.groupBy(rows, r => r.pitcher)].map(([p, rs]) => ({ p, s: L.computeShove(rs), g: L.nGames(rs) }))
      .sort((a, b) => b.s.shove - a.s.shove);
    html += sec('Pitchers', '<div class="list">' + ps.map((x, i) => `
      <a class="row" href="#/shove/r:${rg.from}:${rg.to}/${L.slug(x.p)}"><span class="rank">${i + 1}</span>
        <div class="rmain"><b>${esc(L.disp(x.p))}</b><span>${x.g} G · ${x.s.ip} IP · ${x.s.k} K · ${x.s.bb} BB · ${x.s.n} P</span></div>
        ${badge(x.s.shove)}<i class="chev"></i></a>`).join('') + '</div>');
    // the same 7 Shove metrics for every pitcher, side by side
    const PS = L.PS;
    const pc = (v, g, lo) => { const p = !isNum(v) ? NaN : lo ? (v <= 0 ? 200 : 100 * g / v) : 100 * v / g; const c = L.tileColor(p); return `style="color:${c}"`; };
    html += sec('Shove Metrics by Pitcher', tbl(
      [{ l: 'Pitcher', cls: 'stick' }, { l: 'Shove' }, { l: '0-0 W%' }, { l: '1-1 W%' }, { l: 'Str%' }, { l: 'E+A%' }, { l: 'P/Out' }, { l: 'K-BB%' }, { l: 'xBA' }],
      ps.map(x => { const t = x.s; return `<tr data-href="#/shove/r:${rg.from}:${rg.to}/${L.slug(x.p)}"><td class="stick">${esc(L.short(x.p))}</td><td>${badge(t.shove)}</td>
        <td ${pc(t.win00, PS.win00_goal)}>${L.pct(t.win00)}</td><td ${pc(t.win11, PS.win11_goal)}>${L.pct(t.win11)}</td>
        <td ${pc(t.strike_pct, PS.strike_goal)}>${L.pct(t.strike_pct)}</td><td ${pc(t.ea_pct, PS.ea_goal)}>${L.pct(t.ea_pct)}</td>
        <td ${pc(t.p_out, PS.pout_goal, true)}>${L.f2(t.p_out)}</td><td ${pc(t.kbb_pct, PS.kbb_goal)}>${isNum(t.kbb_pct) ? (t.kbb_pct >= 0 ? '+' : '') + Math.round(t.kbb_pct) + '%' : '&mdash;'}</td>
        <td ${pc(t.xba, PS.xba_goal, true)}>${L.f3(t.xba)}</td></tr>`; }), { cls: 'click' }) +
      '<div class="note">Colors = % of each Shove goal, same as the tiles. Tap a pitcher for their Shove report over this range.</div>');
    // staff Shove game by game
    const games = L.byGame(rows);
    html += sec('Staff Shove by Game', '<div class="list">' + games.map(([d, rs]) => {
      const g = L.computeShove(rs);
      return `<a class="row" href="#/game/${L.slug(d)}"><div class="rmain"><b>${L.gameTitle(d)}</b><span>vs ${esc(L.oppFor(L.rows.filter(r => r.game === d)))} · ${g.ip} IP · ${g.k} K · ${g.bb} BB</span></div>${badge(g.shove)}<i class="chev"></i></a>`;
    }).join('') + '</div>');
    html += FOOT('It Pays to be a Winner');
    return { title: 'Staff Report', html, back: '#/pitchers', print: true, pdf: `Staff Shove - ${rg.label}` };
  };
  V.hitters = () => ({ title: 'Hitters', html: playerList('h'), root: true });

  /* ── Pitcher page (Pitcher Arsenals tab) ─────────────────────────────── */
  const PIT_KPI = [ // label, key, fmt, lo, hi, higherBetter  (Shiny styleInterval breakpoints)
    ['FB Velo', 'FBv', L.f1, 82, 92, true], ['FB Max', 'FBmax', L.f1, 85, 95, true],
    ['Strike%', 'Strike', L.pct1, 40, 75, true], ['CSW%', 'CSW', L.pct1, 15, 40, true],
    ['FB Str%', 'FBStrike', L.pct1, 46, 76, true], ['OS Str%', 'OSStrike', L.pct1, 40, 74, true],
    ['E+A%', 'EA', L.pct1, 40, 90, true], ['1PK%', 'FPK', L.pct1, 25, 82, true],
    ['Whiff%', 'Whiff', L.pct1, 2, 50, true], ['IZ Whiff%', 'IZWhiff', L.pct1, 0, 40, true],
    ['Chase%', 'Chase', L.pct1, 5, 45, true], ['K%', 'K', L.pct1, 0, 50, true],
    ['BB%', 'BB', L.pct1, 0, 40, false], ['AVG', 'AVG', L.f3, 0, .6, false],
    ['OBP', 'OBP', L.f3, .15, .55, false], ['SLG', 'SLG', L.f3, .1, .9, false],
    ['OPS', 'OPS', L.f3, .3, 1.5, false], ['wOBA', 'wOBA', L.f3, .15, .6, false],
    ['HH%', 'HH', L.pct1, 0, 60, false], ['GB%', 'GB', L.pct1, 0, 100, true]
  ];
  V.pitcher = function (name, team) {
    const rg = team ? oRange() : L.range(), hand = L.state.pHand || 'all';
    const back = team ? `#/opp/${L.slug(team)}` : '#/pitchers';
    const all = pitRows(team).filter(r => r.pitcher === name);
    const rows = all.filter(r => L.inRange(r, rg) && (hand === 'all' || r.bside === hand));
    let html = (team ? presetChips('oPreset', rg.id) : presetChips()) + chips('pHand', [{ v: 'all', l: 'All batters' }, { v: 'Right', l: 'vs RHH' }, { v: 'Left', l: 'vs LHH' }], hand);
    const throws = all[0] ? (all[0].pthrows === 'Left' ? 'LHP' : 'RHP') : '';
    if (!rows.length) return { title: L.short(name), back, html: html + `<div class="hero"><div class="hmain"><h1>${esc(L.disp(name))}</h1><div class="sub">${throws}${team ? ' · ' + esc(L.teamName(team)) : ''}</div></div></div>` + empty('No pitches in this date range / split.') };
    const s = L.computeShove(rows), line = L.pitchLine(rows), ars = L.arsenalRows(rows);
    const nG = L.nGames(rows);
    html += `<div class="hero"><div class="gwrap">${L.gauge(s.shove, 104)}<div class="kicker">Shove</div></div>
      <div class="hmain"><h1>${esc(L.disp(name))}</h1><div class="sub">${throws}${team ? ' · ' + esc(L.teamName(team)) : ''} · ${esc(rg.label)}${hand !== 'all' ? ' · vs ' + (hand === 'Right' ? 'RHH' : 'LHH') : ''}</div>
      <div class="line">${nG} G · ${s.ip} IP · ${s.k} K · ${s.bb} BB · ${s.n} P</div>
      <a class="btn" href="${shoveHref(team, `r:${rg.from}:${rg.to}`, name)}">Shove report for range</a>${team ? '' : ` <a class="btn alt" href="#/compare/p/${L.slug(name)}">Compare</a>`}</div>${team ? `<img class="hbadge" src="${L.logoFor(team)}" alt="">` : ''}</div>`;
    if (team) html += `<div class="intro">Scouting view: only pitches he threw against LMU hitters (the games TrackMan has). Shove uses our goals.</div>`;
    html += sec('Process', shoveTiles(s));
    let trendHtml = '';   // drawn at the very end of the page
    {
      const PS = L.PS, pg = (v, g) => L.tileColor(100 * v / g), pgLo = (v, g) => L.tileColor(v <= 0 ? 200 : 100 * g / v);
      const sv = k => rs => L.computeShove(rs)[k];
      // every metric that goes into the Shove Score, in the report's tile order
      const T = {
        shove: { l: 'Shove', v: sv('shove'), fmt: L.f0, goal: 80, goalLabel: '80+ = green', lo: 0, hi: 100, color: L.scoreColor, hb: true },
        win00: { l: '0-0 Win%', v: sv('win00'), fmt: L.pct, goal: PS.win00_goal, goalLabel: `Goal ${PS.win00_goal}%`, lo: 0, hi: 100, color: v => pg(v, PS.win00_goal), hb: true },
        win11: { l: '1-1 Win%', v: sv('win11'), fmt: L.pct, goal: PS.win11_goal, goalLabel: `Goal ${PS.win11_goal}%`, lo: 0, hi: 100, color: v => pg(v, PS.win11_goal), hb: true },
        strike: { l: 'Strike%', v: sv('strike_pct'), fmt: L.pct, goal: PS.strike_goal, goalLabel: `Goal ${PS.strike_goal}%`, color: v => pg(v, PS.strike_goal), hb: true },
        ea: { l: 'E+A%', v: sv('ea_pct'), fmt: L.pct, goal: PS.ea_goal, goalLabel: `Goal ${PS.ea_goal}%`, color: v => pg(v, PS.ea_goal), hb: true },
        pout: { l: 'P/Out', v: sv('p_out'), fmt: L.f2, goal: PS.pout_goal, goalLabel: `Goal ${PS.pout_goal}`, lo: 0, hi: 12, color: v => pgLo(v, PS.pout_goal), hb: false, note: 'Lower is better; outings above 12 drawn at the top' },
        kbb: { l: 'K-BB%', v: sv('kbb_pct'), fmt: v => (v >= 0 ? '+' : '') + Math.round(v) + '%', goal: PS.kbb_goal, goalLabel: `Goal ${PS.kbb_goal}%`, color: v => pg(v, PS.kbb_goal), hb: true },
        xba: { l: 'xBA', v: sv('xba'), fmt: L.f3, goal: PS.xba_goal, goalLabel: `Goal ${L.f3(PS.xba_goal)}`, lo: 0, hi: 1, color: v => pgLo(v, PS.xba_goal), hb: false, note: 'Lower is better' },
        velo: { l: 'FB Velo', v: rs => L.pitchLine(rs).FBv, fmt: L.f1, hb: true, note: 'Average fastball velo' },
        whiff: { l: 'Whiff%', v: rs => L.pitchLine(rs).Whiff, fmt: L.pct, lo: 0, hb: true }
      };
      const tg = L.byGame(rows).reverse();
      trendHtml = trendCard(tg, T, 'tPit', 3, k => shoveHref(team, k, name), 'outing',
        rs => { const x = L.computeShove(rs); return `${x.ip} IP · ${x.h} H · ${x.k} K · ${x.bb} BB · ${x.n} P · Shove ${L.f0(x.shove)}`; },
        { min: 15, lab: 'PA faced', pa: rs => L.computeShove(rs).pa });
    }
    html += sec('Pitching Line', '<div class="kpis">' + PIT_KPI.map(k => `<div class="kpi" style="${L.scaleBg(line[k[1]], k[3], k[4], k[5])}"><b>${k[2](line[k[1]])}</b><span>${k[0]}</span></div>`).join('') + `</div><div class="note">${line.BF} BF · tint = Shiny leaderboard color scale</div>`);
    // official NCAA line + percentiles
    const o = !team && L.official.pit[name];
    if (o) {
      const pool = L.pools.ncaa_pit || {};
      const cfg = [['K-BB%', 'KBBpct', true, L.pct1], ['K%', 'Kpct', true, L.pct1], ['BB%', 'BBpct', false, L.pct1], ['ERA', 'ERA', false, L.f2],
        ['WHIP', 'WHIP', false, L.f2], ['Opp BA', 'OppBA', false, L.f3], ['K/9', 'K9', true, L.f1], ['BB/9', 'BB9', false, L.f1],
        ['H/9', 'H9', false, L.f1], ['HR/9', 'HR9', false, L.f1], ['GB%', 'GBpct', true, L.pct1]];
      html += sec('Official NCAA Line', `<div class="stats4">${stat('IP', L.f1(o.IP))}${stat('ERA', L.f2(o.ERA))}${stat('WHIP', L.f2(o.WHIP))}${stat('K-BB%', L.pct1(o.KBBpct))}</div>
        <div class="note">${o.App ?? 0} APP · ${o.GS ?? 0} GS · ${o.W ?? 0}-${o.L ?? 0} · ${o.SO ?? 0} SO · ${o.BB ?? 0} BB · full ${'2026'} season</div>
        <h4>Percentile vs D2 (20+ IP)</h4>` + cfg.map(c => L.pctRow(c[0], o[c[1]], pool[c[1]] || [], c[2], c[3])).join(''));
    }
    html += sec('Arsenal', arsenalTable(ars, true) + usageBars(ars));
    html += sec('Movement &amp; Release', `<div class="two"><div><div class="strip">Movement — HB / IVB</div>${L.movement(rows)}</div><div><div class="strip">Release Point</div>${L.release(rows)}</div></div>` + L.pitchLegend(pitchTypes(rows)));
    html += sec("Locations — Pitcher's View", L.locationFacets(rows));
    // game log: Shove from the engine for every outing (unsplit by hand)
    const games = L.byGame(all.filter(r => L.inRange(r, rg)));
    html += sec('Game Log', tbl([{ l: 'Date', cls: 'stick' }, { l: 'Opp' }, { l: 'Shove' }, { l: 'IP' }, { l: 'H' }, { l: 'K' }, { l: 'BB' }, { l: 'P' }, { l: 'Str%' }],
      games.map(([d, rs]) => { const g = L.computeShove(rs); return `<tr data-href="${shoveHref(team, d, name)}"><td class="stick">${L.gameShort(d)}</td><td>${esc(L.teamName(g.opp))}</td><td>${badge(g.shove)}</td><td>${g.ip}</td><td>${g.h}</td><td>${g.k}</td><td>${g.bb}</td><td>${g.n}</td><td>${L.pct(g.strike_pct)}</td></tr>`; }), { cls: 'click' }) + '<div class="note">Tap a game for its Shove report.</div>');
    html += trendHtml;
    return { title: L.short(name), html, back, print: true, pdf: `${team ? 'Scouting - ' + L.teamName(team) + ' - ' : 'Pitcher - '}${L.disp(name)} - ${rg.label}` };
  };

  /* ── Hitter page (Hitter Profile tab) ────────────────────────────────── */
  const GROUP = t => /Four|Fastball|Sinker|Two/.test(t || '') ? 'Fastball' : /Change|Split/.test(t || '') ? 'Offspeed' : /Slider|Curve|Cutter|Sweep|Slurve|Knuck/.test(t || '') ? 'Breaking' : 'Other';
  const HZ = {
    xwoba: { l: 'xwOBA on contact', rows: 'bip', v: r => r.xw, lo: .15, hi: .6, fmt: L.f3 },
    whiff: { l: 'Whiff%', rows: 'swing', v: r => r.pcall === 'StrikeSwinging' ? 1 : 0, lo: 0, hi: .6, fmt: v => Math.round(v * 100) + '%' },
    swing: { l: 'Swing%', rows: 'all', v: r => has(r, F.Swing), lo: .1, hi: .9, fmt: v => Math.round(v * 100) + '%' },
    ev: { l: 'Exit Velo', rows: 'bip', v: r => r.ev, lo: 70, hi: 100, fmt: v => Math.round(v) },
    hh: { l: 'Hard-Hit%', rows: 'bip', v: r => r.ev >= 95 ? 1 : 0, lo: 0, hi: .8, fmt: v => Math.round(v * 100) + '%' }
  };
  /* Quality at-bats + the counting stats TrackMan can't see (R, SB, SF, SH),
     from the coaches' stat sheet. Not tied to the date chips. */
  const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
  function qabCard(name) {
    const Q = L.qab, o = Q && Q.by[name];
    if (!o) return '';
    const pct = 100 * o.QABpct, team = 100 * Q.teamPct, col = L.tileColor(100 * pct / team);
    const fill = Math.max(0, Math.min(100, pct)), tm = Math.max(0, Math.min(100, team));
    const upd = Q.modified ? L.fdateShort(Q.modified.slice(0, 10)) : '';
    return sec(`Quality At-Bats · ${esc(Q.title || 'Stat sheet')}`, `
      <div class="qabtop"><div class="qabbig" style="color:${col}">${L.pct(pct)}<small>QAB%</small></div>
        <div class="qabmeta"><b>${o.QAB} of ${o.PA} PA</b><span>${o.rank ? `${ord(o.rank)} of ${Q.n} on the team` : ''}${o.pos ? ` · ${esc(o.pos)}` : ''}</span>
          <div class="qabbar"><i style="width:${fill.toFixed(1)}%;background:${col}"></i><em style="left:${tm.toFixed(1)}%"></em></div>
          <span class="qabteam">Team ${L.pct(team)}</span></div></div>
      <div class="stats4">${stat('Runs', o.R)}${stat('SB-ATT', `${o.SB}-${o.ATT}`)}${stat('Sac Fly', o.SF)}${stat('Sac Bunt', o.SH)}</div>
      <div class="stats4">${stat('AVG', L.f3(o.AVG))}${stat('OBP', L.f3(o.OBP))}${stat('SLG', L.f3(o.SLG))}${stat('OPS', L.f3(o.OPS))}</div>
      <div class="stats4">${stat('RBI', o.RBI)}${stat('ISO', L.f3(o.ISO))}${stat('wOBA', L.f3(o.wOBA))}${stat('BB-K', `${o.BB}-${o.K}`)}</div>
      <div class="note">From the coaches' stat sheet (${esc(Q.file)}${upd ? `, saved ${upd}` : ''}) — whole ${esc(Q.title || 'sheet')}, not limited by the date chips. Color and the tick on the bar = team QAB%.</div>`);
  }

  V.hitter = function (name, team) {
    const rg = team ? oRange() : L.range(), opp = team ? 'all' : (L.state.hOpp || 'all'), hand = L.state.hHand || 'all', grp = L.state.hGroup || 'all';
    const back = team ? `#/opp/${L.slug(team)}` : '#/hitters';
    const all = batRows(team).filter(r => r.batter === name);
    const base = all.filter(r => L.inRange(r, rg) && (opp === 'all' || r.pteam !== L.TEAM));
    const rows = base.filter(r => (hand === 'all' || r.pthrows === hand) && (grp === 'all' || GROUP(r.ptype) === grp));
    let html = (team ? presetChips('oPreset', rg.id) : presetChips() + chips('hOpp', [{ v: 'all', l: 'All pitchers' }, { v: 'opp', l: 'Opponents only' }], opp))
      + chips('hHand', [{ v: 'all', l: 'Both hands' }, { v: 'Right', l: 'vs RHP' }, { v: 'Left', l: 'vs LHP' }], hand)
      + chips('hGroup', [{ v: 'all', l: 'All pitches' }, { v: 'Fastball', l: 'FB' }, { v: 'Breaking', l: 'BRK' }, { v: 'Offspeed', l: 'OFF' }], grp);
    const sides = L.uniq(all.map(r => r.bside).filter(Boolean));
    const side = sides.length > 1 ? 'S' : all[0] ? (all[0].bside === 'Left' ? 'LHH' : 'RHH') : '';
    const tsub = team ? ' · ' + esc(L.teamName(team)) : '';
    if (!rows.length) return { title: L.short(name), back, html: html + `<div class="hero"><div class="hmain"><h1>${esc(L.disp(name))}</h1><div class="sub">${side === 'S' ? 'Switch' : side}${tsub}</div></div></div>` + empty('No pitches in this date range / split.') };
    const m = L.hitterMetrics(rows);
    html += `<div class="hero"><div class="hmain"><h1>${esc(L.disp(name))}</h1><div class="sub">${side === 'S' ? 'Switch' : side}${tsub} · ${esc(rg.label)} · ${m.PA} PA</div>
      <div class="slash">${L.f3(m.BA)} / ${L.f3(m.OBP)} / ${L.f3(m.SLG)}</div>
      ${team ? '' : `<a class="btn alt" href="#/compare/h/${L.slug(name)}">Compare</a>`}</div>${team ? `<img class="hbadge" src="${L.logoFor(team)}" alt="">` : ''}</div>`;
    if (team) html += `<div class="intro">Scouting view: only his plate appearances against LMU pitching (the games TrackMan has).</div>`;
    else html += qabCard(name);
    html += sec('Slash Line', `<div class="stats4">${stat('xwOBA', L.f3(m.xwOBA))}${stat('xBA', L.f3(m.xBA))}${stat('OPS', L.f3(m.OPS))}${stat('wOBA', L.f3(m.wOBA))}</div>
      <div class="stats4">${stat('K%', L.pct1(m.Kpct))}${stat('BB%', L.pct1(m.BBpct))}${stat('Whiff%', L.pct1(m.Whiff))}${stat('Chase%', L.pct1(m.Chase))}</div>`);
    {
      const T = {
        ops: { l: 'OPS', v: rs => L.hitterMetrics(rs).OPS, fmt: L.f3, lo: 0, hi: 2, hb: true, note: 'Single games above 2.000 are drawn at the top' },
        xba: { l: 'xBA', v: rs => L.hitterMetrics(rs).xBA, fmt: L.f3, lo: 0, hi: 1, hb: true },
        ev: { l: 'Avg EV', v: rs => L.hitterMetrics(rs).AvgEV, fmt: L.f1, hb: true, color: v => v >= 95 ? '#FF8A5B' : '#cbd3de', note: 'Orange = 95+ mph' },
        hh: { l: 'HardHit%', v: rs => L.hitterMetrics(rs).HardHit, fmt: L.pct, lo: 0, hi: 100, hb: true },
        k: { l: 'K%', v: rs => L.hitterMetrics(rs).Kpct, fmt: L.pct, lo: 0, hi: 100, hb: false },
        whiff: { l: 'Whiff%', v: rs => L.hitterMetrics(rs).Whiff, fmt: L.pct, lo: 0, hi: 100, hb: false }
      };
      const tg = L.byGame(rows).reverse();
      html += trendCard(tg, T, 'tHit', 5, k => hitRepHref(team, k, name), 'game',
        rs => esc(L.gameLine(L.hitterMetrics(rs), L.plateAppearances(rs).reduce((a, p) => a + p.rbi, 0))),
        { min: 10, lab: 'PA', pa: rs => L.hitterMetrics(rs).PA });
    }
    html += sec('Batted Ball', m.BIP < 5 ? empty('Not enough batted balls for this split.') :
      `<div class="stats4">${stat('Avg EV', L.f1(m.AvgEV))}${stat('Max EV', L.f1(m.MaxEV))}${stat('90th EV', L.f1(m.EV90))}${stat('BIP', m.BIP)}</div>
       <div class="stats4">${stat('Hard-Hit%', L.pct(m.HardHit))}${stat('Barrel%', L.pct(m.Barrel))}${stat('Sweet-Spot%', L.pct(m.SweetSpot))}${stat('GB%', L.pct(m.GBpct))}</div>`);
    // percentiles: basic (official NCAA line) + advanced (Trackman, honors date + opponent toggle only)
    let pc = '';
    const o = !team && L.official.bat[name], nb = L.pools.ncaa_bat || {};
    if (o) {
      pc += `<h4>Basic — official season vs NCAA D2 (50+ PA)</h4><div class="note">Official: ${o.PA ?? 0} PA · ${L.f3(o.BA)}/${L.f3(o.OBP)}/${L.f3(o.SLG)} · ${o.HR ?? 0} HR · ${o.SB ?? 0} SB</div>` +
        [['BA', 'BA', true, L.f3], ['OBP', 'OBP', true, L.f3], ['SLG', 'SLG', true, L.f3], ['OPS', 'OPS', true, L.f3], ['BB%', 'BBpct', true, L.pct1], ['K%', 'Kpct', false, L.pct1]]
          .map(c => L.pctRow(c[0], o[c[1]], nb[c[1]] || [], c[2], c[3])).join('');
    }
    const d2 = L.pools.d2_hit;
    if (d2) {
      const full = L.hitterMetrics(base);
      const acfg = [['xwOBA', 'xwOBA', true, L.f3, 'PA', 50], ['xBA', 'xBA', true, L.f3, 'PA', 50], ['xSLG', 'xSLG', true, L.f3, 'PA', 50],
        ['Avg EV', 'AvgEV', true, L.f1, 'BIP', 50], ['Barrel%', 'Barrel', true, L.pct1, 'BIP', 50], ['Hard-Hit%', 'HardHit', true, L.pct1, 'BIP', 50],
        ['Sweet-Spot%', 'SweetSpot', true, L.pct1, 'BIP', 50], ['GB%', 'GBpct', false, L.pct1, 'BIP', 50],
        ['Whiff%', 'Whiff', false, L.pct1, 'Swings', 50], ['Chase%', 'Chase', false, L.pct1, 'OZ', 100]];
      pc += `<h4>Advanced — Trackman vs D2 pool</h4>` + acfg.map(c => {
        const pool = d2[c[1]].filter((v, i) => d2[c[4]][i] >= c[5]);
        return L.pctRow(c[0], full[c[1]], pool, c[2], c[3]);
      }).join('');
    }
    if (pc) html += sec('Percentile Rankings vs D2', pc + '<div class="note">Bubble = percentile (red = elite), tick = D2 average. K%/Whiff%/Chase%/GB% inverted. Advanced follows date + opponent filters only.</div>');
    // damage zones
    const mk = L.state.hMetric || 'xwoba', cfg = HZ[mk];
    const loc = rows.filter(r => isNum(r.x) && isNum(r.y));
    const sel = cfg.rows === 'bip' ? loc.filter(r => r.pcall === 'InPlay' && isNum(r.ev) && isNum(r.la) && r.ev >= 40 && isNum(cfg.v(r)))
      : cfg.rows === 'swing' ? loc.filter(r => has(r, F.Swing)) : loc;
    // x mirrored -> pitcher's view, matching the Shiny map's scale_x_reverse
    const hm = L.zoneHeat(sel.map(r => ({ x: -r.x, y: r.y, v: cfg.v(r) })), { lo: cfg.lo, hi: cfg.hi, minN: 15 });
    html += sec('Damage Zones', chips('hMetric', Object.keys(HZ).map(k => ({ v: k, l: HZ[k].l })), mk, 'scroll') +
      (hm.enough ? `<div class="heat">${hm.svg}${L.heatLegend(cfg.lo, cfg.hi, cfg.fmt)}</div><div class="note">Pitcher's view · kernel-smoothed over ${sel.length} ${cfg.rows === 'bip' ? 'batted balls' : cfg.rows === 'swing' ? 'swings' : 'pitches'} · grey = thin sample.</div>` : empty('Not enough data for a zone map (15+ needed).')));
    // contact profile
    const bip = rows.filter(r => r.pcall === 'InPlay' && isNum(r.ev) && isNum(r.la) && r.ev >= 40);
    if (bip.length >= 5) {
      // pull side follows the side he hit from on that pitch (switch hitters)
      const rh = r => (r.bside || (side === 'LHH' ? 'Left' : 'Right')) !== 'Left';
      const pull = bip.filter(r => isNum(r.bearing) && (rh(r) ? r.bearing < -15 : r.bearing > 15)).length;
      const oppo = bip.filter(r => isNum(r.bearing) && (rh(r) ? r.bearing > 15 : r.bearing < -15)).length;
      const withB = bip.filter(r => isNum(r.bearing)).length || 1;
      html += sec('Contact Profile', `<div class="strip">Exit velocity (mph)</div>${L.hist(bip.map(r => r.ev), 40, 115, 5, { tick: 15, color: v => v >= 95 ? '#D7301F' : '#7EC8E3' })}
        <div class="strip">Launch angle (°)</div>${L.hist(bip.map(r => r.la), -60, 75, 7.5, { tick: 30, color: v => v >= 8 && v <= 32 ? '#5FE09A' : '#7EC8E3' })}
        <div class="mixbar"><i style="flex:${m.GBpct || 0};background:#B5853A">GB ${L.pct(m.GBpct)}</i><i style="flex:${m.LDpct || 0};background:#5FE09A">LD ${L.pct(m.LDpct)}</i><i style="flex:${m.FBpct || 0};background:#4FA3FF">FB ${L.pct(m.FBpct)}</i><i style="flex:${m.PUpct || 0};background:#8D9093">PU</i></div>
        <div class="stats4">${stat('Pull%', L.pct(100 * pull / withB))}${stat('Center%', L.pct(100 * (withB - pull - oppo) / withB))}${stat('Oppo%', L.pct(100 * oppo / withB))}${stat('Barrels', m.Barrels)}</div>
        <div class="note">Red EV bars = 95+ (hard-hit). Green LA bars = 8–32° sweet spot. Pull/oppo split at ±15° spray angle.</div>`);
      html += sec('Spray Chart', L.spray(rows.filter(r => r.pcall === 'InPlay')) + L.outcomeLegend());
    }
    // game log -> post-game hitter report
    const games = L.byGame(all.filter(r => L.inRange(r, rg)));
    html += sec('Game Log', tbl([{ l: 'Date', cls: 'stick' }, { l: 'Opp' }, { l: 'H-AB' }, { l: '2B' }, { l: '3B' }, { l: 'HR' }, { l: 'RBI' }, { l: 'BB' }, { l: 'K' }],
      games.map(([d, rs]) => {
        const g = L.hitterMetrics(rs), rbi = L.plateAppearances(rs).reduce((a, p) => a + p.rbi, 0);
        const n2 = g.XBH - g.HR - g.n3, z = v => v || '<span class="zero">0</span>';
        return `<tr data-href="${hitRepHref(team, d, name)}"><td class="stick">${L.gameShort(d)}</td><td>${esc(L.uniq(rs.map(r => L.teamName(r.pteam))).join(','))}</td><td>${g.H}-${g.AB}</td><td>${z(n2)}</td><td>${z(g.n3)}</td><td>${z(g.HR)}</td><td>${z(rbi)}</td><td>${z(g.BB)}</td><td>${z(g.K)}</td></tr>`;
      }), { cls: 'click' }) + '<div class="note">Tap a game for the PA-by-PA report.</div>');
    return { title: L.short(name), html, back, print: true, pdf: `${team ? 'Scouting - ' + L.teamName(team) + ' - ' : 'Hitter - '}${L.disp(name)} - ${rg.label}` };
  };

  /* ── Leaderboards ────────────────────────────────────────────────────── */
  const HIT_COLS = [ // label, key, fmt, lo, hi, higherBetter
    ['PA', 'PA', String, 10, 80, true], ['BA', 'BA', L.f3, .185, .385, true], ['OBP', 'OBP', L.f3, .28, .48, true],
    ['SLG', 'SLG', L.f3, .225, .625, true], ['OPS', 'OPS', L.f3, .6, 1, true], ['wOBA', 'wOBA', L.f3, .15, .6, true],
    ['xwOBA', 'xwOBA', L.f3, .15, .6, true], ['K%', 'Kpct', L.pct1, 10, 28, false], ['BB%', 'BBpct', L.pct1, 4.6, 14.6, true],
    ['Whiff%', 'Whiff', L.pct1, 0, 44, false], ['Z-Whiff%', 'ZWhiff', L.pct1, 0, 30, false], ['Z-Swing%', 'ZSwing', L.pct1, 60, 100, true],
    ['Chase%', 'Chase', L.pct1, 5, 40, false], ['SEAGER', 'SEAGER', L.pct1, 20, 70, true], ['Avg EV', 'AvgEV', L.f1, 75, 95, true],
    ['EV90', 'EV90', L.f1, 90, 100, true], ['Max EV', 'MaxEV', L.f1, 85, 108, true], ['Barrel%', 'Barrel', L.pct1, 0, 30, true],
    ['HardHit%', 'HardHit', L.pct1, 20, 40, true], ['LD%', 'LDpct', L.pct1, 0, 40, true], ['BIP', 'BIP', String, 5, 60, true]
  ];
  V.boards = function () {
    const rg = L.range(), mode = L.state.board || 'pit', sortKey = L.state['sort_' + mode], hand = L.state.bHand || 'all';
    let html = presetChips() + chips('board', [{ v: 'pit', l: 'Pitching' }, { v: 'hit', l: 'Hitting' }], mode)
      + chips('bHand', [{ v: 'all', l: 'All' }, { v: 'Right', l: mode === 'pit' ? 'vs RHH' : 'vs RHP' }, { v: 'Left', l: mode === 'pit' ? 'vs LHH' : 'vs LHP' }], hand)
      + chips('bMin', [{ v: '0', l: 'Everyone' }, { v: '10', l: mode === 'pit' ? '10+ BF' : '10+ PA' }, { v: '25', l: mode === 'pit' ? '25+ BF' : '25+ PA' }], L.state.bMin || '0');
    const minN = +(L.state.bMin || 0);
    let cols, rows, teamRow, nameKey;
    if (mode === 'pit') {
      const src = L.lmuPitching.filter(r => L.inRange(r, rg) && (hand === 'all' || r.bside === hand));
      cols = [['BF', 'BF', String, 10, 80, true], ['Shove', 'Shove', L.f0, 60, 90, true]].concat(PIT_KPI); nameKey = 'pitcher';
      const mk = rs => Object.assign(L.pitchLine(rs), { Shove: L.computeShove(rs).shove });
      rows = [...L.groupBy(src, r => r.pitcher)].map(([n, rs]) => ({ n, v: mk(rs) })).filter(x => x.v.BF >= minN);
      teamRow = src.length ? mk(src) : null;
    } else {
      const src = L.lmuBatting.filter(r => L.inRange(r, rg) && (hand === 'all' || r.pthrows === hand));
      cols = HIT_COLS; nameKey = 'batter';
      rows = [...L.groupBy(src, r => r.batter)].map(([n, rs]) => ({ n, v: L.hitterMetrics(rs) })).filter(x => x.v.PA >= minN);
      teamRow = src.length ? L.hitterMetrics(src) : null;
    }
    if (!rows.length) return { title: 'Leaderboards', html: html + empty('No data for this selection.'), root: true };
    // Pitching board always opens ranked by Shove (high -> low); a header tap
    // re-sorts for that view only. Hitting keeps the last chosen sort.
    const pickedPit = mode === 'pit' && L.tempPitSort && cols.some(c => c[1] === L.tempPitSort.k);
    const sk = mode === 'pit' ? (pickedPit ? L.tempPitSort.k : 'Shove')
      : (sortKey && cols.some(c => c[1] === sortKey) ? sortKey : 'OPS');
    const col = cols.find(c => c[1] === sk);
    const dir = mode === 'pit' ? (pickedPit && L.tempPitSort.dir === 'asc' ? 1 : -1) : (L.state['dir_' + mode] === 'asc' ? 1 : -1);
    rows.sort((a, b) => { const x = a.v[sk], y = b.v[sk]; if (!isNum(x)) return 1; if (!isNum(y)) return -1; return dir * (x - y); });
    const head = [{ l: mode === 'pit' ? 'Pitcher' : 'Hitter', cls: 'stick' }].concat(cols.map(c => ({ l: c[0] + (c[1] === sk ? (dir < 0 ? ' ▾' : ' ▴') : ''), k: c[1], cls: c[1] === sk ? 'sorted' : '' })));
    const cell = (v, c) => `<td style="${c[1] === 'BF' || c[1] === 'PA' || c[1] === 'BIP' || c[1] === 'Shove' ? '' : L.scaleBg(v[c[1]], c[3], c[4], c[5])}">${c[1] === 'Shove' ? badge(v.Shove) : c[2](v[c[1]])}</td>`;
    const body = [];
    if (teamRow) body.push(`<tr class="team"><td class="stick">LMU (team)</td>${cols.map(c => cell(teamRow, c)).join('')}</tr>`);
    rows.forEach(x => body.push(`<tr data-href="#/${mode === 'pit' ? 'pitcher' : 'hitter'}/${L.slug(x.n)}"><td class="stick">${esc(L.short(x.n))}</td>${cols.map(c => cell(x.v, c)).join('')}</tr>`));
    html += `<div class="card flush">${tbl(head, body, { cls: 'board click' })}</div><div class="note">Tap a column to sort (${esc(col[0])}), tap a name for the full page. Tints use the Shiny app's color breakpoints.</div>`;
    return { title: 'Leaderboards', html, root: true };
  };

  /* ── Opponents ───────────────────────────────────────────────────────── */
  const recChip = rec => rec.n ? `<span class="score ${rec.w > rec.l ? 'win' : rec.l > rec.w ? 'loss' : ''}">${rec.text}</span>` : '<span class="score na">no score</span>';
  V.opps = function () {
    const idx = L.oppIndex();
    const items = Object.entries(idx).map(([c, keys]) => ({ c, keys, rec: L.record(keys), last: L.game(keys[0]).date }))
      .sort((a, b) => b.last.localeCompare(a.last) || L.teamName(a.c).localeCompare(L.teamName(b.c)));
    let html = '<div class="intro">Every opponent in the TrackMan files, most recent first. Open a team for its pitching staff and hitters (same views as our players) and our results against them.</div><div class="list">';
    html += items.map(it => `<a class="row" href="#/opp/${L.slug(it.c)}"><img class="tlogo" src="${L.logoFor(it.c)}" alt="">
      <div class="rmain"><b>${esc(L.teamName(it.c))}</b><span>${it.keys.length} game${it.keys.length > 1 ? 's' : ''} · last ${L.fdateShort(it.last)}${it.rec.nt ? ` · ${it.rec.nt} not scored` : ''}</span></div>
      ${recChip(it.rec)}<i class="chev"></i></a>`).join('') + '</div>';
    return { title: 'Scouting', html, root: true };
  };

  V.opp = function (code) {
    const keys = L.oppIndex()[code];
    if (!keys) return { title: 'Opponent', html: empty('No games against this team.'), back: '#/opps' };
    const ks = new Set(keys), rows = L.rows.filter(r => ks.has(r.game)), name = L.teamName(code), rec = L.record(keys);
    const first = L.game(keys[keys.length - 1]).date, last = L.game(keys[0]).date;
    let html = `<div class="hero"><img class="hbadge" src="${L.logoFor(code)}" alt="">
      <div class="hmain"><h1>${esc(name)}</h1><div class="sub">${keys.length} game${keys.length > 1 ? 's' : ''} · ${L.fdate(first)}${first !== last ? ' – ' + L.fdate(last) : ''}</div>
      <div class="final">Record: ${rec.n ? rec.text : '—'}${rec.nt ? ` <small>(${rec.nt} not scored)</small>` : ''}</div></div>${BADGE}</div>`;
    // ── scouting: their pitching staff (same view as our pitchers) ──
    const opit = rows.filter(r => r.pteam === code && r.bteam === L.TEAM);
    if (opit.length) {
      const st = L.computeShove(opit);
      const ps = [...L.groupBy(opit, r => r.pitcher)].map(([p, rs]) => {
        const mix = [...L.groupBy(rs.filter(r => r.ptype), r => r.ptype)].sort((a, b) => b[1].length - a[1].length).slice(0, 4)
          .map(([t, x]) => `<i class="dot" style="background:${L.pc(t)}"></i>${L.abbr(t)} ${Math.round(100 * x.length / rs.length)}%`).join(' ');
        const fb = rs.filter(r => (r.ptype === 'Fastball' || r.ptype === 'Sinker') && isNum(r.velo));
        return { p, n: rs.length, th: rs[0].pthrows, fbv: L.mean(fb, r => r.velo), fbm: L.max(fb, r => r.velo), s: L.computeShove(rs), g: L.nGames(rs), last: rs.reduce((a, r) => r.date > a ? r.date : a, ''), mix };
      }).sort((a, b) => b.n - a.n);
      html += sec(`${esc(name)} Pitching Staff`, `<div class="shead">${L.gauge(st.shove, 96)}<div><div class="kicker">Staff Shove vs LMU</div>
          <div class="line">${ps.length} pitchers · ${st.ip} IP · ${st.k} K · ${st.bb} BB · ${st.n} P</div></div></div>` +
        '<div class="list">' + ps.map(x => `<a class="row" href="${pitHref(code, x.p)}"><div class="rmain"><b>${esc(L.disp(x.p))} <small class="muted">${x.th === 'Left' ? 'LHP' : 'RHP'}</small></b>
          <span>${x.g} G · ${x.s.ip} IP · ${x.n} P · ${x.s.k} K · ${x.s.bb} BB${isNum(x.fbv) ? ` · FB ${L.f1(x.fbv)} (max ${L.f1(x.fbm)})` : ''} · last ${L.fdateShort(x.last)}</span><span class="mix">${x.mix}</span></div>${badge(x.s.shove)}<i class="chev"></i></a>`).join('') + '</div>' +
        '<div class="note">Tap a pitcher for the full pitcher view: arsenal, movement, release, locations, Shove, game log and trend. Most-used first.</div>');
    }
    // games
    html += sec('Games', '<div class="list">' + keys.map(k => {
      const g = L.game(k), pit = L.lmuPitching.filter(r => r.game === k);
      return `<a class="row" href="#/game/${L.slug(k)}"><div class="rmain"><b>${L.gameTitle(k)}</b><span>${g.home === L.TEAM ? 'Home' : g.away === L.TEAM ? 'Away' : ''}${pit.length ? ` · ${L.computeShove(pit).ip} IP` : ''}</span></div>${L.scoreChip(k)}<i class="chev"></i></a>`;
    }).join('') + '</div>');
    // LMU pitching vs them
    const pit = L.lmuPitching.filter(r => ks.has(r.game) && r.bteam === code);
    if (pit.length) {
      const st = L.computeShove(pit);
      const ps = [...L.groupBy(pit, r => r.pitcher)].map(([p, rs]) => ({ p, s: L.computeShove(rs), g: L.nGames(rs) })).sort((a, b) => b.s.shove - a.s.shove);
      html += sec('LMU Pitching vs ' + esc(name), `<div class="shead">${L.gauge(st.shove, 96)}<div><div class="kicker">Staff Shove</div>
        <div class="line">${st.ip} IP · ${st.h} H · ${st.k} K · ${st.bb} BB · ${st.n} P</div></div></div>` +
        '<div class="list">' + ps.map((x, i) => `<a class="row" href="#/pitcher/${L.slug(x.p)}"><span class="rank">${i + 1}</span>
          <div class="rmain"><b>${esc(L.disp(x.p))}</b><span>${x.g} G · ${x.s.ip} IP · ${x.s.h} H · ${x.s.k} K · ${x.s.bb} BB</span></div>${badge(x.s.shove)}<i class="chev"></i></a>`).join('') + '</div>');
    }
    // LMU hitting vs them
    const bat = L.lmuBatting.filter(r => ks.has(r.game) && r.pteam === code);
    if (bat.length) {
      const tm = L.hitterMetrics(bat);
      const hs = [...L.groupBy(bat, r => r.batter)].map(([b, rs]) => ({ b, m: L.hitterMetrics(rs), rbi: L.plateAppearances(rs).reduce((a, p) => a + p.rbi, 0) }))
        .sort((a, b) => (isNum(b.m.OPS) ? b.m.OPS : -1) - (isNum(a.m.OPS) ? a.m.OPS : -1));
      html += sec('LMU Hitting vs ' + esc(name), `<div class="stats4">${stat('AVG', L.f3(tm.BA))}${stat('OBP', L.f3(tm.OBP))}${stat('SLG', L.f3(tm.SLG))}${stat('OPS', L.f3(tm.OPS))}</div>` +
        '<div class="list">' + hs.map(x => `<a class="row" href="#/hitter/${L.slug(x.b)}"><div class="rmain"><b>${esc(L.disp(x.b))}</b><span class="gline">${esc(L.gameLine(x.m, x.rbi))}</span></div>
          ${isNum(x.m.OPS) ? `<span class="ops">${L.f3(x.m.OPS)}<small>OPS</small></span>` : ''}<i class="chev"></i></a>`).join('') + '</div>' +
        '<div class="note">Totals over every game against them. Hitter line = H-AB, extra-base hits, RBI, K, BB.</div>');
    }
    // their hitters vs LMU pitching (scouting a repeat opponent)
    const obat = batRows(code);
    if (obat.length) {
      const tm = L.hitterMetrics(obat);
      const hs = [...L.groupBy(obat, r => r.batter)].map(([b, rs]) => {
        const sd = L.uniq(rs.map(r => r.bside).filter(Boolean));
        return { b, m: L.hitterMetrics(rs), side: sd.length > 1 ? 'S' : sd[0] === 'Left' ? 'L' : 'R', g: L.nGames(rs), last: rs.reduce((a, r) => r.date > a ? r.date : a, '') };
      }).filter(x => x.m.PA > 0).sort((a, b) => b.m.PA - a.m.PA || (isNum(b.m.OPS) ? b.m.OPS : -1) - (isNum(a.m.OPS) ? a.m.OPS : -1));
      if (hs.length) html += sec(`${esc(name)} Hitters`, `<div class="stats4">${stat('AVG', L.f3(tm.BA))}${stat('OBP', L.f3(tm.OBP))}${stat('SLG', L.f3(tm.SLG))}${stat('xBA', L.f3(tm.xBA))}</div>
          <div class="note">${hs.length} hitters · ${tm.PA} PA · ${tm.K} K · ${tm.BB} BB · Avg EV ${L.f1(tm.AvgEV)} against LMU pitching</div>` +
        '<div class="list">' + hs.map(x => `<a class="row" href="${hitHref(code, x.b)}"><div class="rmain"><b>${esc(L.disp(x.b))} <small class="muted">${x.side === 'S' ? 'S' : x.side + 'HH'}</small></b>
          <span>${x.g} G · ${x.m.PA} PA · ${L.f3(x.m.BA)}/${L.f3(x.m.OBP)}/${L.f3(x.m.SLG)} · last ${L.fdateShort(x.last)}<span class="hstats"><span><b>${L.f3(x.m.xBA)}</b> xBA</span><span><b>${L.f1(x.m.AvgEV)}</b> EV</span><span><b>${L.f3(x.m.OPS)}</b> OPS</span></span></span></div><i class="chev"></i></a>`).join('') + '</div>' +
        '<div class="note">Tap a hitter for the full hitter view: damage zones, contact profile, spray chart, game log, trend and PA-by-PA reports. Most PA first.</div>');
    }
    html += FOOT('All games against this opponent (not limited by the date chips)');
    return { title: name, html, back: '#/opps', print: true, pdf: `Scouting - ${name}` };
  };

  /* ── Player comparison ───────────────────────────────────────────────── */
  const cmpRow = (lab, a, b, fmt, hb) => {
    let ca = '', cb = '';
    if (hb !== null && hb !== undefined && isNum(a) && isNum(b) && Math.abs(a - b) > 1e-9) {
      const aw = hb ? a > b : a < b; ca = aw ? ' class="best"' : ''; cb = aw ? '' : ' class="best"';
    }
    const f = v => (typeof v === 'string' ? v : fmt(v));
    return `<tr><td${ca}>${f(a)}</td><th>${lab}</th><td${cb}>${f(b)}</td></tr>`;
  };
  const cmpTable = rows => `<table class="cmp">${rows.join('')}</table>`;
  V.compare = function (kind, pre) {
    /* Each side has its own player AND its own date range, so players from
       different seasons (or one player vs his own earlier season) can be
       compared. A side's range is stored as "presetId|player" and resets to
       automatic when that side's player changes. */
    const P = kind === 'p', ka = P ? 'cmpPA' : 'cmpHA', kb = P ? 'cmpPB' : 'cmpHB', rg = L.range();
    const src = (P ? L.lmuPitching : L.lmuBatting), key = P ? 'pitcher' : 'batter';
    const all = L.groupBy(src, r => r[key]);
    const inr = src.filter(r => L.inRange(r, rg)), groups = L.groupBy(inr, r => r[key]);
    // default picks = top two in the current date range
    const ranked = [...groups].map(([n, rs]) => ({ n, v: P ? L.computeShove(rs).shove : L.hitterMetrics(rs).OPS, k: P ? rs.length : L.hitterMetrics(rs).PA }))
      .filter(x => P ? x.k >= 15 : x.k >= 5).sort((a, b) => (isNum(b.v) ? b.v : -1) - (isNum(a.v) ? a.v : -1));
    if (pre && L._cmpSeed !== L.navId) { L.state[ka] = pre; L._cmpSeed = L.navId; L.save(); }
    let A = L.state[ka], B = L.state[kb];
    if (!A || !all.has(A)) A = (ranked[0] || {}).n || [...all.keys()][0];
    if (!B || !all.has(B)) B = (ranked.find(x => x.n !== A) || {}).n || [...all.keys()].find(n => n !== A);
    if (!A || !B) return { title: 'Compare', back: P ? '#/pitchers' : '#/hitters', html: empty('Need at least two players with data.') };
    // range per side: saved choice for this player, else the current chips if
    // he has data there, else his most recent season with data
    const order = [rg].concat(L.presets.filter(p => p !== rg && p.id !== 'l14' && p.id !== 'all'), L.presets.filter(p => p.id === 'all'));
    const rangeFor = (k, n) => {
      const [id, who] = String(L.state[k + 'r'] || '').split('|');
      const saved = who === n && L.presets.find(p => p.id === id);
      if (saved) return saved;
      return order.find(p => all.get(n).some(r => L.inRange(r, p))) || L.presets[L.presets.length - 1];
    };
    const rA = rangeFor(ka, A), rB = rangeFor(kb, B);
    const names = [...all.entries()].map(([n, rs]) => ({ n, last: rs.reduce((a, r) => r.date > a ? r.date : a, '') }))
      .sort((x, y) => x.n.localeCompare(y.n));
    const sel = (k, cur) => `<select data-key="${k}">${names.map(o => `<option value="${esc(o.n)}"${o.n === cur ? ' selected' : ''}>${esc(L.disp(o.n))}</option>`).join('')}</select>`;
    const rsel = (k, n, cur) => `<select class="rsel" data-key="${k}r">${L.presets.map(p => {
      const has = all.get(n).some(r => L.inRange(r, p));
      return `<option value="${esc(p.id + '|' + n)}"${p === cur ? ' selected' : ''}${has ? '' : ' disabled'}>${esc(p.label)}${has ? '' : ' — no data'}</option>`; }).join('')}</select>`;
    let html = `<div class="cmpsel">${sel(ka, A)}<span>vs</span>${sel(kb, B)}</div>
      <div class="cmpsel">${rsel(ka, A, rA)}<span></span>${rsel(kb, B, rB)}</div>`;
    const ra = all.get(A).filter(r => L.inRange(r, rA)), rb = all.get(B).filter(r => L.inRange(r, rB));
    if (!ra.length || !rb.length) return { title: 'Compare', back: P ? '#/pitchers' : '#/hitters', html: html + empty('No data for one of these players in the chosen range.') };
    const tagA = esc(rA.label), tagB = esc(rB.label);
    if (P) {
      const sa = L.computeShove(ra), sb = L.computeShove(rb), la = L.pitchLine(ra), lb = L.pitchLine(rb);
      const head = (n, s, rs, tag) => `<a class="cmphead" href="#/pitcher/${L.slug(n)}">${L.gauge(s.shove, 84)}<b>${esc(L.disp(n))}</b><em class="cmptag">${tag}</em><span>${L.nGames(rs)} G · ${s.ip} IP · ${s.n} P</span></a>`;
      html += `<div class="cmpheads">${head(A, sa, ra, tagA)}${head(B, sb, rb, tagB)}</div>`;
      const kbbF = v => isNum(v) ? (v >= 0 ? '+' : '') + Math.round(v) + '%' : '&mdash;';
      html += sec('Shove Process', cmpTable([
        cmpRow('Shove', sa.shove, sb.shove, L.f0, true), cmpRow('0-0 Win%', sa.win00, sb.win00, L.pct, true), cmpRow('1-1 Win%', sa.win11, sb.win11, L.pct, true),
        cmpRow('Strike%', sa.strike_pct, sb.strike_pct, L.pct, true), cmpRow('E+A%', sa.ea_pct, sb.ea_pct, L.pct, true), cmpRow('P/Out', sa.p_out, sb.p_out, L.f2, false),
        cmpRow('K-BB%', sa.kbb_pct, sb.kbb_pct, kbbF, true), cmpRow('xBA', sa.xba, sb.xba, L.f3, false)]));
      html += sec('Pitching Line', cmpTable([cmpRow('BF', la.BF, lb.BF, String, null)].concat(
        PIT_KPI.filter(k => k[1] !== 'Strike' && k[1] !== 'EA').map(k => cmpRow(k[0], la[k[1]], lb[k[1]], k[2], k[5])))));
      // arsenal side by side: usage + velo per pitch type
      const aa = L.arsenalRows(ra), ab = L.arsenalRows(rb), types = L.PITCH_ORDER.filter(t => aa.some(x => x.p === t) || ab.some(x => x.p === t));
      const cell = (ars, t, c = '') => { const x = ars.find(y => y.p === t); return x ? `<td class="${c}">${L.pct(x.usage)}</td><td>${L.f1(x.velo)}</td><td>${L.f1(x.ivb)}</td>` : `<td class="zero ${c}">–</td><td></td><td></td>`; };
      html += sec('Arsenal', tbl([{ l: 'Pitch', cls: 'stick' }, { l: 'Use' }, { l: 'Velo' }, { l: 'IVB' }, { l: 'Use', cls: 'bcol' }, { l: 'Velo' }, { l: 'IVB' }],
        types.map(t => `<tr><td class="stick"><i class="dot" style="background:${L.pc(t)}"></i>${esc(t)}</td>${cell(aa, t)}${cell(ab, t, 'bcol')}</tr>`)) +
        `<div class="note">Left = ${esc(L.short(A))}, right = ${esc(L.short(B))}.</div>`);
    } else {
      const ma = L.hitterMetrics(ra), mb = L.hitterMetrics(rb);
      const head = (n, m, tag) => `<a class="cmphead" href="#/hitter/${L.slug(n)}"><div class="bigops">${L.f3(m.OPS)}<small>OPS</small></div><b>${esc(L.disp(n))}</b><em class="cmptag">${tag}</em><span>${m.PA} PA · ${L.f3(m.BA)}/${L.f3(m.OBP)}/${L.f3(m.SLG)}</span></a>`;
      html += `<div class="cmpheads">${head(A, ma, tagA)}${head(B, mb, tagB)}</div>`;
      const c = (l, k, f, hb) => cmpRow(l, ma[k], mb[k], f, hb);
      html += sec('Results', cmpTable([c('PA', 'PA', String, null), c('H', 'H', String, true), c('HR', 'HR', String, true), c('XBH', 'XBH', String, true),
        c('AVG', 'BA', L.f3, true), c('OBP', 'OBP', L.f3, true), c('SLG', 'SLG', L.f3, true), c('OPS', 'OPS', L.f3, true), c('wOBA', 'wOBA', L.f3, true)]));
      const qa = L.qab && L.qab.by[A], qb = L.qab && L.qab.by[B];
      if (qa || qb) {
        const g = (o, k) => o ? o[k] : NaN;
        html += sec(`Quality At-Bats · ${esc(L.qab.title || '')}`, cmpTable([
          cmpRow('QAB%', 100 * g(qa, 'QABpct'), 100 * g(qb, 'QABpct'), L.pct, true), cmpRow('QABs', g(qa, 'QAB'), g(qb, 'QAB'), L.f0, true),
          cmpRow('PA', g(qa, 'PA'), g(qb, 'PA'), L.f0, null), cmpRow('Runs', g(qa, 'R'), g(qb, 'R'), L.f0, true),
          cmpRow('SB', g(qa, 'SB'), g(qb, 'SB'), L.f0, true), cmpRow('Sac Fly', g(qa, 'SF'), g(qb, 'SF'), L.f0, null), cmpRow('Sac Bunt', g(qa, 'SH'), g(qb, 'SH'), L.f0, null)]) +
          '<div class="note">Coaches\' stat sheet — whole sheet, not limited by the date chips.</div>');
      }
      html += sec('Quality of Contact', cmpTable([c('xwOBA', 'xwOBA', L.f3, true), c('xBA', 'xBA', L.f3, true), c('xSLG', 'xSLG', L.f3, true),
        c('Avg EV', 'AvgEV', L.f1, true), c('EV90', 'EV90', L.f1, true), c('Max EV', 'MaxEV', L.f1, true), c('HardHit%', 'HardHit', L.pct1, true),
        c('Barrel%', 'Barrel', L.pct1, true), c('SweetSpot%', 'SweetSpot', L.pct1, true), c('BIP', 'BIP', String, null)]));
      html += sec('Approach', cmpTable([c('K%', 'Kpct', L.pct1, false), c('BB%', 'BBpct', L.pct1, true), c('Whiff%', 'Whiff', L.pct1, false),
        c('Z-Swing%', 'ZSwing', L.pct1, true), c('Chase%', 'Chase', L.pct1, false), c('SEAGER', 'SEAGER', L.pct1, true)]));
    }
    html += `<div class="note">Green = the better of the two. Each side has its own date range (second row of dropdowns) — compare players from different seasons, or one player against his own earlier season.</div>`;
    return { title: 'Compare', html, back: P ? '#/pitchers' : '#/hitters', print: true,
      pdf: `Compare - ${L.disp(A)} (${rA.label}) vs ${L.disp(B)} (${rB.label})` };
  };

  /* ── Search: players, opponents, games ───────────────────────────────── */
  V.search = function () {
    const raw = L.state.gq || '', q = raw.trim().toLowerCase();
    let html = `<input class="search" type="search" placeholder="Player, school, or date (3/14, Mar 14)" value="${esc(raw)}" data-search="gq" autocomplete="off" autocorrect="off" spellcheck="false">`;
    if (!q) return { title: 'Search', back: '#/', focus: true, html: html + '<div class="intro">Find LMU pitchers and hitters, opponents, or a game by school or date — e.g. "Smith", "Catawba", "3/14", "Mar 14".</div>' };
    const hit = s => (s || '').toLowerCase().includes(q);
    const last = rs => rs.reduce((a, r) => r.date > a ? r.date : a, '');
    const pl = [];
    for (const [n, rs] of L.groupBy(L.lmuPitching, r => r.pitcher)) if (hit(n) || hit(L.disp(n))) pl.push({ n, kind: 'Pitcher', href: `#/pitcher/${L.slug(n)}`, last: last(rs), sub: `${L.nGames(rs)} G` });
    for (const [n, rs] of L.groupBy(L.lmuBatting, r => r.batter)) if (hit(n) || hit(L.disp(n))) pl.push({ n, kind: 'Hitter', href: `#/hitter/${L.slug(n)}`, last: last(rs), sub: `${L.nGames(rs)} G` });
    pl.sort((a, b) => b.last.localeCompare(a.last));
    const opps = Object.entries(L.oppIndex()).filter(([c]) => hit(c) || hit(L.teamName(c)));
    const games = L.games.slice().reverse().filter(g => {
      const opp = L.gameOpps(g.key).map(L.teamName).join(' ') || 'intrasquad';
      const [y, m, d] = g.date.split('-').map(Number);
      // dates + school only (weekday names made "sa" match every Saturday)
      const dt = new Date(g.date + 'T12:00:00'), mon = dt.toLocaleDateString('en-US', { month: 'short' }), monL = dt.toLocaleDateString('en-US', { month: 'long' });
      return [`${m}/${d}`, `${m}/${d}/${y}`, g.date, `${mon} ${d}`, `${monL} ${d}`, opp].some(s => s.toLowerCase().startsWith(q)) ||
        opp.toLowerCase().includes(q) || (q.length >= 3 && `${monL} ${y}`.toLowerCase().includes(q));
    }).slice(0, 25);
    if (!pl.length && !opps.length && !games.length) return { title: 'Search', back: '#/', html: html + empty(`Nothing matches "${esc(raw)}".`) };
    if (pl.length) html += `<h3 class="month">Players</h3><div class="list">` + pl.slice(0, 30).map(x => `<a class="row" href="${x.href}"><div class="rmain"><b>${esc(L.disp(x.n))}</b><span>${x.kind} · ${x.sub} · last ${L.fdateShort(x.last)}</span></div><i class="chev"></i></a>`).join('') + '</div>';
    if (opps.length) html += `<h3 class="month">Opponents</h3><div class="list">` + opps.map(([c, keys]) => `<a class="row" href="#/opp/${L.slug(c)}"><img class="tlogo" src="${L.logoFor(c)}" alt=""><div class="rmain"><b>${esc(L.teamName(c))}</b><span>${keys.length} game${keys.length > 1 ? 's' : ''}</span></div>${recChip(L.record(keys))}<i class="chev"></i></a>`).join('') + '</div>';
    if (games.length) html += `<h3 class="month">Games</h3><div class="list">` + games.map(g => `<a class="row" href="#/game/${L.slug(g.key)}"><div class="rmain"><b>${L.gameTitle(g.key)}</b><span>${esc(L.gameOpps(g.key).map(L.teamName).join(', ') || 'Intrasquad')}</span></div>${L.scoreChip(g.key)}<i class="chev"></i></a>`).join('') + '</div>';
    return { title: 'Search', back: '#/', html };
  };
})();
