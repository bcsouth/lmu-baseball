/* engine.js — stat engines, ported line-for-line from the R sources:
     computeShove   <- Post-Game Reports/shove_engine.R  compute_shove()
     hitterMetrics  <- SplittersData/hitter_metrics.R    hitter_metrics()
     pitchLine      <- SplittersData/Splitter_app.R      processed_data() (Pitching Leaderboard)
     arsenalRows    <- Post-Game Reports/generate_postgame_report.R arsenal_rows()
   Constants (POINT_SYSTEM, wOBA weights) come from the exported JSON, so they
   can never drift from the R side. */
'use strict';
(function () {
  const F = L.FLAG, has = L.has, isNum = L.isNum;

  /* ── Shove Score ─────────────────────────────────────────────────────── */
  const ptsHi = (a, goal, max) => (!isNum(a) ? 0 : Math.min(max, Math.max(0, max * a / goal)));
  const ptsLo = (a, goal, max) => { if (!isNum(a)) return 0; if (a <= 0) return max; return Math.min(max, Math.max(0, max * goal / a)); };
  const ptsKbb = (a, goal, max) => (!isNum(a) ? 0 : Math.max(-max, Math.min(max, max * a / goal)));

  L.computeShove = function (df) {
    const PS = L.PS;
    let outs = 0, k = 0, bb = 0, h = 0, n00 = 0, w00 = 0, n11 = 0, w11 = 0;
    let strikeNum = 0, paN = 0, eaNum = 0, xbaAb = 0, xbaSum = 0, opp = null;
    for (const r of df) {
      if (isNum(r.oop)) outs += r.oop;
      if (r.korbb === 'Strikeout') k++;
      if (r.korbb === 'Walk') bb++;
      const hit = L.HITS.has(r.result);
      if (hit) h++;
      if (opp === null && r.bteam) opp = r.bteam;
      const win = !(r.pcall === 'BallCalled' || r.pcall === 'HitByPitch') && !(r.pcall === 'InPlay' && hit);
      if (r.balls === 0 && r.strikes === 0) { n00++; if (win) w00++; }
      if (r.balls === 1 && r.strikes === 1) { n11++; if (win) w11++; }
      strikeNum += has(r, F.Strike);
      paN += has(r, F.PA);
      eaNum += has(r, F.Early) + has(r, F.Ahead);
      xbaAb += has(r, F.AB);
      if (isNum(r.xba)) xbaSum += r.xba;
    }
    outs += k;
    const nP = df.length;
    const strikePct = 100 * strikeNum / Math.max(nP, 1);
    const eaPct = 100 * eaNum / Math.max(paN, 1);
    const kbbPct = (100 * k - 100 * bb) / Math.max(paN, 1);
    const win00 = n00 >= 1 ? 100 * w00 / n00 : NaN;
    const win11 = n11 >= 1 ? 100 * w11 / n11 : NaN;
    const pOut = outs > 0 ? nP / outs : NaN;
    const xba = xbaAb >= 1 ? xbaSum / xbaAb : NaN;
    const score =
      Math.min(PS.strike_max, Math.max(0, strikePct * PS.strike_max / PS.strike_goal)) +
      ptsHi(eaPct, PS.ea_goal, PS.other_max) +
      ptsHi(win00, PS.win00_goal, PS.other_max) +
      ptsHi(win11, PS.win11_goal, PS.other_max) +
      ptsKbb(kbbPct, PS.kbb_goal, PS.other_max) +
      ptsLo(pOut, PS.pout_goal, PS.other_max) +
      ptsLo(xba, PS.xba_goal, PS.other_max);
    return {
      shove: score, ip: L.ip(outs), h, k, bb, outs, opp,
      n: nP, pa: paN, strike_pct: strikePct, strike_num: strikeNum,
      ea_pct: eaPct, ea_num: eaNum, win00, w00, n00, win11, w11, n11,
      kbb_pct: kbbPct, p_out: pOut, xba, xba_ab: xbaAb
    };
  };

  /* ── Hitter metrics ──────────────────────────────────────────────────── */
  const barrel = (ev, la) => {
    const evc = Math.min(Math.max(ev, 95), 116);
    return ev >= 95 && la >= (7 + (evc - 95) * (8 - 7) / 21) && la <= (22 + (evc - 95) * (50 - 22) / 21);
  };
  L.isBarrel = barrel;
  const quantile7 = (arr, p) => { // R quantile type 7
    const a = arr.slice().sort((x, y) => x - y), n = a.length;
    if (!n) return NaN;
    const hh = (n - 1) * p, lo = Math.floor(hh), hi = Math.min(lo + 1, n - 1);
    return a[lo] + (hh - lo) * (a[hi] - a[lo]);
  };
  const SWING = new Set(['StrikeSwinging', 'FoulBall', 'FoulBallNotFieldable', 'InPlay']);
  const ABRES = new Set(['Single', 'Double', 'Triple', 'HomeRun', 'Out', 'Error', 'FieldersChoice']);
  const TERM = new Set(['InPlay', 'HitByPitch', 'CatchersInterference']);
  const BBE = new Set(['GroundBall', 'LineDrive', 'FlyBall', 'Popup']);

  L.hitterMetrics = function (df, w) {
    w = w || L.W;
    let PA = 0, K = 0, BB = 0, HBP = 0, SF = 0, AB = 0, n1 = 0, n2 = 0, n3 = 0, nhr = 0;
    let nsw = 0, nwh = 0, noz = 0, niz = 0, izSw = 0, izWh = 0, ozSw = 0;
    let nbbe = 0, gb = 0, ld = 0, fb = 0, pu = 0, xbaS = 0, xslgS = 0, xwcS = 0;
    const evs = [], las = [];
    for (const r of df) {
      const pc = r.pcall, pr = r.result, kb = r.korbb;
      const hasloc = isNum(r.x) && isNum(r.y);
      const inz = hasloc && Math.abs(r.x) <= 1 && r.y >= 1.59 && r.y <= 3.41;
      const sw = SWING.has(pc), wh = pc === 'StrikeSwinging';
      if (TERM.has(pc) || kb === 'Walk' || kb === 'Strikeout') PA++;
      if (kb === 'Strikeout') K++;
      if (kb === 'Walk') BB++;
      if (pc === 'HitByPitch') HBP++;
      if (pr === 'Sacrifice') SF++;
      if (ABRES.has(pr) || kb === 'Strikeout') AB++;
      if (pr === 'Single') n1++; else if (pr === 'Double') n2++; else if (pr === 'Triple') n3++; else if (pr === 'HomeRun') nhr++;
      if (pc === 'InPlay' && isNum(r.ev) && isNum(r.la) && r.ev >= 40) {
        evs.push(r.ev); las.push(r.la);
        if (isNum(r.xba)) xbaS += r.xba;
        if (isNum(r.xslg)) xslgS += r.xslg;
        if (isNum(r.xw)) xwcS += r.xw;
      }
      if (pc === 'InPlay' && BBE.has(r.hittype)) {
        nbbe++;
        if (r.hittype === 'GroundBall') gb++; else if (r.hittype === 'LineDrive') ld++;
        else if (r.hittype === 'FlyBall') fb++; else pu++;
      }
      if (sw) nsw++;
      if (wh) nwh++;
      if (hasloc && !inz) { noz++; if (sw) ozSw++; }
      if (inz) { niz++; if (sw) izSw++; if (wh) izWh++; }
    }
    const H = n1 + n2 + n3 + nhr, TB = n1 + 2 * n2 + 3 * n3 + 4 * nhr;
    const obDen = AB + BB + HBP + SF, nbip = evs.length;
    let barrels = 0; for (let i = 0; i < nbip; i++) if (barrel(evs[i], las[i])) barrels++;
    const ba = AB > 0 ? H / AB : NaN, slg = AB > 0 ? TB / AB : NaN;
    const obp = obDen > 0 ? (H + BB + HBP) / obDen : NaN;
    const zsw = niz > 0 ? 100 * izSw / niz : NaN, chs = noz > 0 ? 100 * ozSw / noz : NaN;
    return {
      xwOBA: obDen > 0 ? (BB * w.wBB + HBP * w.wHBP + xwcS) / obDen : NaN,
      xBA: AB > 0 ? xbaS / AB : NaN, xSLG: AB > 0 ? xslgS / AB : NaN,
      BA: ba, OBP: obp, SLG: slg, OPS: (isNum(obp) && isNum(slg)) ? obp + slg : NaN,
      wOBA: obDen > 0 ? (BB * w.wBB + HBP * w.wHBP + n1 * w.w1B + n2 * w.w2B + n3 * w.w3B + nhr * w.wHR) / obDen : NaN,
      AvgEV: nbip ? evs.reduce((a, b) => a + b, 0) / nbip : NaN,
      MaxEV: nbip ? Math.max(...evs) : NaN,
      EV90: nbip ? quantile7(evs, 0.9) : NaN,
      HardHit: nbip ? 100 * evs.filter(e => e >= 95).length / nbip : NaN,
      Barrel: nbip ? 100 * barrels / nbip : NaN,
      SweetSpot: nbip ? 100 * las.filter(a => a >= 8 && a <= 32).length / nbip : NaN,
      Kpct: PA > 0 ? 100 * K / PA : NaN, BBpct: PA > 0 ? 100 * BB / PA : NaN,
      Whiff: nsw > 0 ? 100 * nwh / nsw : NaN,
      ZWhiff: izSw > 0 ? 100 * izWh / izSw : NaN,
      ZSwing: zsw, Chase: chs,
      SwingPct: df.length ? 100 * nsw / df.length : NaN,
      SEAGER: (isNum(zsw) && isNum(chs)) ? zsw - chs : NaN,
      GBpct: nbbe ? 100 * gb / nbbe : NaN, LDpct: nbbe ? 100 * ld / nbbe : NaN,
      FBpct: nbbe ? 100 * fb / nbbe : NaN, PUpct: nbbe ? 100 * pu / nbbe : NaN,
      PA, AB, H, TB, BB, K, HBP, SF, HR: nhr, n3, XBH: n2 + n3 + nhr,
      Barrels: barrels, BIP: nbip, Swings: nsw, OZ: noz
    };
  };

  /* ── Pitching leaderboard line (Splitter_app.R processed_data) ───────── */
  L.pitchLine = function (df) {
    const S = bit => L.sum(df, r => has(r, bit));
    const n = df.length;
    const fbv = df.filter(r => r.ptype === 'Fastball' || r.ptype === 'Sinker');
    const pa = S(F.PA), ab = S(F.AB);
    const walks = L.sum(df, r => r.korbb === 'Walk' ? 1 : 0);
    const hbp = L.sum(df, r => r.pcall === 'HitByPitch' ? 1 : 0);
    const cnt = res => L.sum(df, r => r.result === res ? 1 : 0);
    const obp = S(F.OnBase) / Math.max(pa, 1), slg = L.sum(df, r => tb(r)) / Math.max(ab, 1);
    // BF counts distinct (game, inning, batter, PA) — the Shiny version omitted
    // the game, which merged PAs across outings; including it is the fix.
    const bf = new Set(df.map(r => r.gid + '|' + r.inn + '|' + r.batter + '|' + r.pa)).size;
    return {
      BF: bf, P: n,
      FBv: L.mean(fbv, r => r.velo), FBmax: L.max(fbv, r => r.velo),
      Strike: 100 * S(F.Strike) / Math.max(n, 1),
      CSW: 100 * L.sum(df, r => (r.pcall === 'StrikeCalled' || r.pcall === 'StrikeSwinging') ? 1 : 0) / Math.max(n, 1),
      FBStrike: 100 * S(F.FBstrike) / Math.max(S(F.FB), 1),
      OSStrike: 100 * S(F.OSstrike) / Math.max(S(F.OS), 1),
      EA: 100 * (S(F.Early) + S(F.Ahead)) / Math.max(pa, 1),
      FPK: 100 * S(F.FPS) / Math.max(S(F.FP), 1),
      Whiff: 100 * S(F.Whiff) / Math.max(S(F.Swing), 1),
      IZWhiff: 100 * S(F.Zwhiff) / Math.max(S(F.Zswing), 1),
      Chase: 100 * S(F.Chase) / Math.max(S(F.OutOfZone), 1),
      K: 100 * L.sum(df, r => r.korbb === 'Strikeout' ? 1 : 0) / Math.max(pa, 1),
      BB: 100 * S(F.Walk) / Math.max(pa, 1),
      AVG: S(F.Hit) / Math.max(ab, 1), SLG: slg, OBP: obp, OPS: obp + slg,
      wOBA: (walks * .755929 + hbp * .792564 + cnt('Single') * .941949 + cnt('Double') * 1.364940 +
        cnt('Triple') * 1.726750 + cnt('HomeRun') * 2.015240) / Math.max(ab + walks + cnt('Sacrifice') + hbp, 1),
      HH: 100 * S(F.HH) / Math.max(S(F.biphh), 1),
      GB: 100 * S(F.GB) / Math.max(S(F.BIP), 1)
    };
  };
  const tb = r => r.result === 'Single' ? 1 : r.result === 'Double' ? 2 : r.result === 'Triple' ? 3 : r.result === 'HomeRun' ? 4 : 0;
  L.tb = tb;

  /* ── Arsenal rows (post-game report arsenal_rows + app movement table) ── */
  const BALL_R = (2.9 / 2) / 12;
  L.ZONE = { l: -0.85, r: 0.85, b: 1.5, t: 40.5 / 12, ball: BALL_R };
  L.zoneTouch = (x, y) => {
    if (!isNum(x) || !isNum(y)) return null;
    const Z = L.ZONE;
    const dx = Math.max(Z.l - x, 0, x - Z.r), dy = Math.max(Z.b - y, 0, y - Z.t);
    return Math.sqrt(dx * dx + dy * dy) <= BALL_R;
  };
  L.arsenalRows = function (df) {
    const g = L.groupBy(df.filter(r => r.ptype), r => r.ptype);
    const tot = [...g.values()].reduce((a, v) => a + v.length, 0);
    const out = [];
    for (const [p, rs] of g) {
      const z = rs.map(r => L.zoneTouch(r.x, r.y)).filter(v => v !== null);
      const sw = L.sum(rs, r => has(r, F.Swing));
      out.push({
        p, n: rs.length, usage: 100 * rs.length / tot,
        strike: 100 * L.sum(rs, r => has(r, F.Strike)) / rs.length,
        zone: z.length ? 100 * z.filter(Boolean).length / z.length : NaN,
        whiff: sw ? 100 * L.sum(rs, r => has(r, F.Whiff)) / sw : NaN,
        velo: L.mean(rs, r => r.velo), max: L.max(rs, r => r.velo),
        ivb: L.mean(rs, r => r.ivb), hb: L.mean(rs, r => r.hb), spin: L.mean(rs, r => r.spin),
        relh: L.mean(rs, r => r.relh), rels: L.mean(rs, r => r.rels), ext: L.mean(rs, r => r.ext),
        vaa: L.mean(rs, r => r.vaa)
      });
    }
    return out.sort((a, b) => b.n - a.n);
  };

  /* ── Percentile vs a pool (Splitter_app.R pct_row) ───────────────────── */
  L.percentile = (val, pool, higher) => {
    const p = pool.filter(isNum);
    if (!isNum(val) || p.length < 10) return null;
    const pct = higher ? 100 * p.filter(v => v <= val).length / p.length : 100 * p.filter(v => v >= val).length / p.length;
    const mn = p.reduce((a, b) => a + b, 0) / p.length;
    const mnPct = higher ? 100 * p.filter(v => v <= mn).length / p.length : 100 * p.filter(v => v >= mn).length / p.length;
    return { pct, mnPct, n: p.length, mean: mn };
  };

  /* ── Plate appearances for one hitter's game (Hitter Reports.R) ──────── */
  L.plateAppearances = function (df) {
    const rows = df.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.no - b.no)));
    const pas = []; let cur = null;
    for (const r of rows) {
      if (r.pp === 1 || !cur) { cur = { pitches: [] }; pas.push(cur); }
      cur.pitches.push(r);
    }
    pas.forEach((pa, i) => {
      const last = pa.pitches[pa.pitches.length - 1];
      pa.num = i + 1; pa.last = last; pa.pitcher = pa.pitches[0].pitcher; pa.pthrows = pa.pitches[0].pthrows;
      pa.pteam = pa.pitches[0].pteam; pa.inn = pa.pitches[0].inn;
      pa.res = paResult(last);
      pa.rbi = isNum(last.runs) ? last.runs : 0;
      pa.onBase = pa.pitches.some(r => L.HITS.has(r.result) || r.korbb === 'Walk' || r.pcall === 'HitByPitch');
      pa.ev = last.pcall === 'InPlay' ? last.ev : null;
      pa.la = last.pcall === 'InPlay' ? last.la : null;
      pa.dist = last.pcall === 'InPlay' ? last.dist : null;
      pa.xba = last.pcall === 'InPlay' ? last.xba : null;
    });
    return pas;
  };
  const RES = { Single: '1B', Double: '2B', Triple: '3B', HomeRun: 'HR', Out: 'Out', Error: 'ROE', FieldersChoice: 'FC', Sacrifice: 'SAC' };
  function paResult(last) {
    if (last.korbb === 'Strikeout') return { code: 'K', label: last.pcall === 'StrikeCalled' ? 'K (looking)' : 'K (swinging)', good: false };
    if (last.korbb === 'Walk') return { code: 'BB', label: 'Walk', good: true };
    if (last.pcall === 'HitByPitch') return { code: 'HBP', label: 'Hit by pitch', good: true };
    if (last.pcall === 'InPlay') {
      const c = RES[last.result] || last.result || 'In play';
      const hitType = { GroundBall: 'GB', LineDrive: 'LD', FlyBall: 'FB', Popup: 'PU', Bunt: 'Bunt' }[last.hittype];
      return { code: c, label: c + (hitType ? ' · ' + hitType : ''), good: L.HITS.has(last.result) };
    }
    return { code: '—', label: 'PA continued', good: null };
  }
  L.CALL_ABBR = { BallCalled: 'Ball', BallIntentional: 'IBB', StrikeCalled: 'Called K', StrikeSwinging: 'Whiff',
    FoulBall: 'Foul', FoulBallNotFieldable: 'Foul', FoulBallFieldable: 'Foul', FoulTip: 'Foul tip', InPlay: 'In play', HitByPitch: 'HBP' };
})();
