/* charts.js — inline-SVG charts. Geometry mirrors the R post-game reports
   (generate_postgame_report.R svg_*), so phone and PDF look alike. All charts
   use viewBox + width:100% so they scale to the phone's width. */
'use strict';
(function () {
  const isNum = L.isNum, esc = L.esc, Z = L.ZONE;

  /* ── Shove ring gauge ────────────────────────────────────────────────── */
  L.gauge = function (score, size = 132) {
    const col = L.scoreColor(score), r = size / 2 - 11, c = size / 2, circ = 2 * Math.PI * r;
    const frac = isNum(score) ? Math.max(0, Math.min(1, score / 100)) : 0;
    return `<svg class="gauge" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Shove Score ${L.f0(score)}">
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="#1E2D4A" stroke-width="11"/>
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${col}" stroke-width="11" stroke-linecap="round"
        stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${(circ * (1 - frac)).toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>
      <text x="${c}" y="${c}" text-anchor="middle" dominant-baseline="central" font-size="${Math.round(size * 0.3)}" font-weight="800" fill="${col}">${L.f0(score)}</text></svg>`;
  };

  /* ── Strike-zone frame (pitcher's view) ──────────────────────────────── */
  function zoneFrame(px, py, opts = {}) {
    const zx1 = px(Z.l), zx2 = px(Z.r), zy1 = py(Z.t), zy2 = py(Z.b);
    const gv1 = px(Z.l / 3), gv2 = px(Z.r / 3);
    const gh1 = py(Z.b + (Z.t - Z.b) / 3), gh2 = py(Z.b + 2 * (Z.t - Z.b) / 3);
    const grid = opts.grid === false ? '' : [
      [gv1, zy1, gv1, zy2], [gv2, zy1, gv2, zy2], [zx1, gh1, zx2, gh1], [zx1, gh2, zx2, gh2]
    ].map(a => `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${a[2].toFixed(1)}" y2="${a[3].toFixed(1)}" stroke="${opts.gridCol || '#5a6d92'}" stroke-width="0.8" stroke-dasharray="3 3"/>`).join('');
    const hx = [0, .85, .85, 0, -.85, -.85], hy = [.15, .15, .3, .5, .3, .15];
    const hxe = [.85, .85, 0, -.85, -.85, 0], hye = [.15, .3, .5, .3, .15, .15];
    const plate = hx.map((_, i) => `<line x1="${px(hx[i]).toFixed(1)}" y1="${py(hy[i]).toFixed(1)}" x2="${px(hxe[i]).toFixed(1)}" y2="${py(hye[i]).toFixed(1)}" stroke="${opts.plateCol || '#c3ccd8'}" stroke-width="1.3"/>`).join('');
    return grid + `<rect x="${zx1.toFixed(1)}" y="${zy1.toFixed(1)}" width="${(zx2 - zx1).toFixed(1)}" height="${(zy2 - zy1).toFixed(1)}" fill="none" stroke="${opts.zoneCol || '#e6e9ef'}" stroke-width="1.8"/>` + plate;
  }
  L.zoneFrame = zoneFrame;

  /* Pitch locations — one panel per pitch type, ordered by usage */
  L.locationFacets = function (df, W = 150, H = 188) {
    const d = df.filter(r => r.ptype && r.ptype !== 'Other' && isNum(r.x) && isNum(r.y));
    if (!d.length) return '<div class="empty">No located pitches.</div>';
    const g = [...L.groupBy(d, r => r.ptype)].sort((a, b) => b[1].length - a[1].length);
    const px = s => (s + 2) / 4 * W, py = h => H * (1 - h / 5);
    const ballR = Z.ball * ((W / 4 + H / 5) / 2);
    const frame = zoneFrame(px, py);
    return '<div class="facets">' + g.map(([p, rs]) => `
      <div class="facet"><div class="strip">${esc(p)}</div>
        <svg viewBox="0 0 ${W} ${H}" class="loc-svg">${frame}${rs.map(r =>
          `<circle cx="${px(r.x).toFixed(1)}" cy="${py(r.y).toFixed(1)}" r="${ballR.toFixed(2)}" fill="${L.pc(p)}" fill-opacity="0.55" stroke="#0b1220" stroke-width="0.5"/>`).join('')}</svg>
        <div class="facet-n">${rs.length} P</div></div>`).join('') + '</div>';
  };

  /* ── Movement (HB/IVB, 60% ellipses) + Release ───────────────────────── */
  // 60% normal ellipse, matching ggplot stat_ellipse(type="norm"):
  // rad = sqrt(2*qf(level,2,n-1)); qf for df1=2 has a closed form.
  function ellipse(xs, ys, level = 0.6, seg = 56) {
    const n = xs.length; if (n < 4) return null;
    const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxx = 0, syy = 0, sxy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    sxx /= n - 1; syy /= n - 1; sxy /= n - 1;
    if (sxx * syy - sxy * sxy <= 1e-8) return null;
    // Cholesky (upper) of [[sxx,sxy],[sxy,syy]]: R = [[a,b],[0,c]]
    const a = Math.sqrt(sxx), b = sxy / a, c = Math.sqrt(syy - b * b);
    const d2 = n - 1, qf = (d2 / 2) * (Math.pow(1 - level, -2 / d2) - 1);
    const rad = Math.sqrt(2 * qf), pts = [];
    for (let k = 0; k <= seg; k++) {
      const t = 2 * Math.PI * k / seg, u = Math.cos(t), v = Math.sin(t);
      pts.push([mx + rad * (u * a), my + rad * (u * b + v * c)]);
    }
    return pts;
  }
  L.movement = function (df, S = 260) {
    const d = df.filter(r => r.ptype && r.ptype !== 'Other' && isNum(r.hb) && isNum(r.ivb));
    if (!d.length) return '';
    const lim = 25, px = x => (x + lim) / (2 * lim) * S, py = y => S - (y + lim) / (2 * lim) * S;
    let s = '';
    for (let gg = -20; gg <= 20; gg += 5) s += `<line x1="${px(gg)}" y1="0" x2="${px(gg)}" y2="${S}" stroke="#2c4d74" stroke-width="0.4"/><line x1="0" y1="${py(gg)}" x2="${S}" y2="${py(gg)}" stroke="#2c4d74" stroke-width="0.4"/>`;
    for (const [p, rs] of L.groupBy(d, r => r.ptype)) {
      const e = ellipse(rs.map(r => r.hb), rs.map(r => r.ivb));
      if (e) s += `<polygon points="${e.map(q => px(q[0]).toFixed(1) + ',' + py(q[1]).toFixed(1)).join(' ')}" fill="${L.pc(p)}" fill-opacity="0.13" stroke="${L.pc(p)}" stroke-opacity="0.55"/>`;
    }
    s += `<line x1="${px(0)}" y1="0" x2="${px(0)}" y2="${S}" stroke="#93a7c6"/><line x1="0" y1="${py(0)}" x2="${S}" y2="${py(0)}" stroke="#93a7c6"/>`;
    s += d.map(r => `<circle cx="${px(r.hb).toFixed(1)}" cy="${py(r.ivb).toFixed(1)}" r="3.4" fill="${L.pc(r.ptype)}" fill-opacity="0.9" stroke="#0b1220" stroke-width="0.5"/>`).join('');
    s += `<text x="${S - 4}" y="${py(0) - 4}" text-anchor="end" class="ax">HB</text><text x="${px(0) + 4}" y="12" class="ax">IVB</text>`;
    return `<svg viewBox="0 0 ${S} ${S}" class="sq-svg">${s}</svg>`;
  };
  L.release = function (df, S = 260) {
    const d = df.filter(r => r.ptype && r.ptype !== 'Other' && isNum(r.rels) && isNum(r.relh));
    if (!d.length) return '';
    const ax = L.mean(d, r => r.rels), ay = L.mean(d, r => r.relh), half = 0.5;
    const px = x => (x - (ax - half)) / (2 * half) * S, py = y => S - (y - (ay - half)) / (2 * half) * S;
    let s = `<circle cx="${px(ax)}" cy="${py(ay)}" r="${(0.333 / (2 * half) * S).toFixed(1)}" fill="none" stroke="#cdd6e5" stroke-dasharray="4 3"/>`;
    for (const [p, rs] of L.groupBy(d, r => r.ptype))
      s += `<circle cx="${px(L.mean(rs, r => r.rels)).toFixed(1)}" cy="${py(L.mean(rs, r => r.relh)).toFixed(1)}" r="9" fill="${L.pc(p)}" stroke="#0b1220"/>`;
    s += `<text x="6" y="${S - 6}" class="ax">${ay.toFixed(2)} ft ht · ${ax.toFixed(2)} ft side</text>`;
    return `<svg viewBox="0 0 ${S} ${S}" class="sq-svg">${s}</svg>`;
  };
  L.pitchLegend = (types, pcf) => '<div class="legend">' + types.map(t => `<span><i style="background:${(pcf || L.pc)(t)}"></i>${esc(t)}</span>`).join('') + '</div>';
  L.outcomeLegend = () => `<div class="legend"><span><i style="background:${L.HIT_COL}"></i>Hit</span><span><i style="background:${L.OUT_COL}"></i>Out</span><span>Line = ground ball</span></div>`;

  /* ── Hitter PA zone: numbered pitches, true-scale ball (Hitter Reports.R colors) ── */
  L.paZone = function (pitches, W = 170, H = 212) {
    const px = s => (s + 2) / 4 * W, py = h => H * (1 - (h + 0.25) / 5.5);
    const ballR = Z.ball * ((W / 4 + H / 5.5) / 2);
    let s = zoneFrame(px, py, { gridCol: '#3d5172' });
    for (const r of pitches) {
      if (!isNum(r.x) || !isNum(r.y)) continue;
      const cx = px(r.x), cy = py(r.y), sw = r.pcall === 'StrikeSwinging';
      s += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${Math.max(ballR, 7.5).toFixed(1)}" fill="${L.pcH(r.ptype)}" fill-opacity="0.92" stroke="${sw ? '#ffffff' : '#0b1220'}" stroke-width="${sw ? 1.6 : 0.8}"/>
            <text x="${cx.toFixed(1)}" y="${(cy + 0.5).toFixed(1)}" text-anchor="middle" dominant-baseline="central" class="pnum">${r.pp}</text>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" class="pa-svg">${s}</svg>`;
  };

  /* ── Spray chart ─────────────────────────────────────────────────────── */
  // Field drawn from approximate standard dimensions (330 / 375 / 400).
  L.spray = function (balls, opts = {}) {
    const S = opts.size || 300, R = 420;
    const px = x => S / 2 + x / R * (S / 2) * 0.98, py = y => S - 8 - y / R * (S - 16);
    const pt = (dist, deg) => { const t = deg * Math.PI / 180; return [px(dist * Math.sin(t)), py(dist * Math.cos(t))]; };
    const wall = [[330, -45], [360, -33], [375, -22], [395, -10], [400, 0], [395, 10], [375, 22], [360, 33], [330, 45]];
    let s = `<path d="M${pt(0, 0).join(',')} L${pt(330, -45).join(',')} ${wall.map(w => 'L' + pt(w[0], w[1]).join(',')).join(' ')} Z" fill="#163a2a" stroke="#2f6b4e" stroke-width="1.2"/>`;
    const inf = []; for (let a = -45; a <= 45; a += 5) inf.push(pt(155, a));
    s += `<path d="M${pt(0, 0).join(',')} ${inf.map(q => 'L' + q.join(',')).join(' ')} Z" fill="#5a4630" fill-opacity="0.55" stroke="none"/>`;
    s += `<path d="M${pt(90, -45).join(',')} L${pt(127.3, 0).join(',')} L${pt(90, 45).join(',')} L${pt(0, 0).join(',')} Z" fill="#1f5a3d" stroke="#d9d9d9" stroke-width="0.8"/>`;
    s += `<line x1="${pt(0, 0)[0]}" y1="${pt(0, 0)[1]}" x2="${pt(330, -45)[0]}" y2="${pt(330, -45)[1]}" stroke="#e6e9ef" stroke-width="1"/><line x1="${pt(0, 0)[0]}" y1="${pt(0, 0)[1]}" x2="${pt(330, 45)[0]}" y2="${pt(330, 45)[1]}" stroke="#e6e9ef" stroke-width="1"/>`;
    for (const b of balls) {
      if (!isNum(b.bearing)) continue;
      // Hit = blue, Out = red (the reports' outcome_type_colors); a thin white
      // edge keeps pure blue readable on the dark field without changing the fill.
      const hit = L.HITS.has(b.result), col = hit ? L.HIT_COL : L.OUT_COL;
      if (b.hittype === 'GroundBall') {
        const e = pt(150, b.bearing);
        s += `<line x1="${pt(0, 0)[0]}" y1="${pt(0, 0)[1]}" x2="${e[0].toFixed(1)}" y2="${e[1].toFixed(1)}" stroke="#ffffff" stroke-width="3.6" stroke-opacity="0.55"/><line x1="${pt(0, 0)[0]}" y1="${pt(0, 0)[1]}" x2="${e[0].toFixed(1)}" y2="${e[1].toFixed(1)}" stroke="${col}" stroke-width="2"/>`;
      } else if (isNum(b.dist)) {
        const q = pt(b.dist, b.bearing);
        const lab = opts.label ? `<text x="${q[0].toFixed(1)}" y="${(q[1] - 9).toFixed(1)}" text-anchor="middle" class="sp-lab">${esc(opts.label(b))}</text>` : '';
        s += `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="5" fill="${col}" stroke="#ffffff" stroke-width="1.2"/>${lab}`;
      }
    }
    return `<svg viewBox="0 0 ${S} ${S}" class="spray-svg">${s}</svg>`;
  };

  /* ── Kernel-smoothed zone map (phone stand-in for the app's GAM map) ─── */
  // Nadaraya–Watson Gaussian smoother over a grid; cells with too little
  // effective sample are greyed, like the app's coverage mask.
  L.zoneHeat = function (pts, opts) {
    const W = 220, H = 260, x0 = -1.6, x1 = 1.6, y0 = 0.9, y1 = 4.2, nx = 32, ny = 34, bw = opts.bw || 0.32;
    const px = x => (x - x0) / (x1 - x0) * W, py = y => H - (y - y0) / (y1 - y0) * H;
    const cw = W / nx, ch = H / ny; let s = '';
    if (pts.length < (opts.minN || 15)) return { svg: '', enough: false };
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const gx = x0 + (i + 0.5) * (x1 - x0) / nx, gy = y0 + (j + 0.5) * (y1 - y0) / ny;
      let wsum = 0, vsum = 0;
      for (const p of pts) { const dx = p.x - gx, dy = p.y - gy; const w = Math.exp(-(dx * dx + dy * dy) / (2 * bw * bw)); wsum += w; vsum += w * p.v; }
      const v = wsum > 0 ? vsum / wsum : NaN;
      const col = wsum < (opts.minW || 2.5) || !isNum(v) ? '#26324a' : heatCol((v - opts.lo) / (opts.hi - opts.lo));
      s += `<rect x="${(i * cw).toFixed(1)}" y="${(H - (j + 1) * ch).toFixed(1)}" width="${(cw + 0.4).toFixed(1)}" height="${(ch + 0.4).toFixed(1)}" fill="${col}"/>`;
    }
    s += zoneFrame(px, py, { zoneCol: '#0b1220', gridCol: '#0b1220', plateCol: '#0b1220' });
    return { svg: `<svg viewBox="0 0 ${W} ${H}" class="heat-svg">${s}</svg>`, enough: true };
  };
  function heatCol(t) { // blue -> white -> red
    t = Math.max(0, Math.min(1, t));
    return t < 0.5 ? L.mix('#2C66C9', '#F2F2F2', t / 0.5) : L.mix('#F2F2F2', '#D7301F', (t - 0.5) / 0.5);
  }
  L.heatLegend = (lo, hi, fmt) => `<div class="heat-leg"><span>${fmt(lo)}</span><i></i><span>${fmt(hi)}</span></div>`;

  /* ── Histogram (EV / LA distributions) ───────────────────────────────── */
  L.hist = function (vals, lo, hi, step, opts = {}) {
    const W = 320, H = 120, nb = Math.round((hi - lo) / step), bins = new Array(nb).fill(0);
    vals.forEach(v => { if (!isNum(v)) return; const k = Math.floor((Math.min(Math.max(v, lo), hi - 1e-9) - lo) / step); bins[k]++; });
    const mx = Math.max(1, ...bins), bw = W / nb;
    let s = bins.map((c, k) => {
      const h = c / mx * (H - 18), x = k * bw, mid = lo + (k + 0.5) * step;
      const col = opts.color ? opts.color(mid) : '#7EC8E3';
      return `<rect x="${(x + 1).toFixed(1)}" y="${(H - 14 - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${col}"/>`;
    }).join('');
    for (let t = lo; t <= hi; t += (opts.tick || step * 2)) s += `<text x="${((t - lo) / (hi - lo) * W).toFixed(1)}" y="${H - 2}" text-anchor="middle" class="ax">${t}</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="hist-svg">${s}</svg>`;
  };

  /* ── Percentile row (bubble on a track) ──────────────────────────────── */
  L.pctRow = function (label, val, pool, higher, fmt) {
    const r = L.percentile(val, pool, higher);
    if (!r) return `<div class="prow"><div class="pl">${label}</div><div class="pt none">${isNum(val) ? 'small pool' : 'no data'}</div><div class="pv">${isNum(val) ? fmt(val) : '&mdash;'}</div></div>`;
    const p = Math.round(r.pct);
    return `<div class="prow"><div class="pl">${label}</div>
      <div class="pt"><i class="avg" style="left:${r.mnPct.toFixed(1)}%"></i><b style="left:${r.pct.toFixed(1)}%;background:${L.pctColor(r.pct)}">${p}</b></div>
      <div class="pv">${fmt(val)}</div></div>`;
  };

  /* ── Trend line: one dot per game + rolling line ─────────────────────────
     pts: chronological [{ v, roll, label, href, tip }]
     o:   { fmt, goal, goalLabel, lo, hi (clamp bounds), color(v) for dots } */
  L.trend = function (pts, o = {}) {
    const W = 340, H = 172, l = 40, r = 12, t = 14, b = 26, n = pts.length;
    const vals = pts.flatMap(p => [p.v, p.roll]).filter(isNum);
    if (!vals.length) return '<div class="empty">No data for this metric yet.</div>';
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (isNum(o.goal)) { lo = Math.min(lo, o.goal); hi = Math.max(hi, o.goal); }
    if (isNum(o.lo)) lo = Math.max(lo, o.lo);
    if (isNum(o.hi)) hi = Math.min(hi, o.hi);
    if (hi - lo < 1e-9) { const s = Math.abs(hi) * 0.1 || 1; hi += s; lo -= s; }
    const ticks = [lo, (lo + hi) / 2, hi];
    const pad = (hi - lo) * 0.1; const lo2 = lo - pad, hi2 = hi + pad;
    const fmt = o.fmt || (v => v.toFixed(1));
    const X = i => n === 1 ? (l + W - r) / 2 : l + i * (W - l - r) / (n - 1);
    const Y = v => t + (1 - (Math.max(lo2, Math.min(hi2, v)) - lo2) / (hi2 - lo2)) * (H - t - b);
    let s = ticks.map(v => `<line x1="${l}" x2="${W - r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="#1E2D4A" stroke-width="1"/>
      <text x="${l - 5}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" class="ax">${fmt(v)}</text>`).join('');
    if (isNum(o.goal)) {
      const gy = Y(o.goal).toFixed(1);
      s += `<line x1="${l}" x2="${W - r}" y1="${gy}" y2="${gy}" stroke="#5FE09A" stroke-width="1.3" stroke-dasharray="5 4" opacity=".8"/>
        <text x="${W - r}" y="${(+gy - 4).toFixed(1)}" text-anchor="end" class="ax" fill="#5FE09A" style="fill:#5FE09A">${esc(o.goalLabel || 'Goal')}</text>`;
    }
    // rolling line (breaks where the rolling value is missing)
    let d = '', pen = false;
    pts.forEach((p, i) => { if (isNum(p.roll)) { d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p.roll).toFixed(1); pen = true; } else pen = false; });
    if (d) s += o.line === 'game'
      ? `<path d="${d}" fill="none" stroke="#5a6d92" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`
      : `<path d="${d}" fill="none" stroke="#7EC8E3" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/>`;
    // dots (tap target bigger than the dot)
    const rad = n > 30 ? 3 : 4.2;
    pts.forEach((p, i) => {
      if (!isNum(p.v)) return;
      const cx = X(i).toFixed(1), cy = Y(p.v).toFixed(1), col = o.color ? o.color(p.v) : '#cbd3de';
      const dot = `<circle cx="${cx}" cy="${cy}" r="11" fill="transparent"/><circle cx="${cx}" cy="${cy}" r="${rad}" fill="${col}" stroke="#0b1220" stroke-width="1.3"><title>${esc(p.tip || (p.label + ': ' + fmt(p.v)))}</title></circle>`;
      s += p.href ? `<a href="${p.href}">${dot}</a>` : dot;
    });
    // x labels: ~5 spread evenly, always first + last
    const step = Math.max(1, Math.ceil(n / 5));
    pts.forEach((p, i) => {
      if (i % step && i !== n - 1) return;
      if (i !== n - 1 && X(n - 1) - X(i) < 56) return;   // avoid crowding the last label
      const anchor = n === 1 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      s += `<text x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="${anchor}" class="ax">${esc(p.label)}</text>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" class="trend-svg" role="img" aria-label="Trend chart">${s}</svg>`;
  };
})();
