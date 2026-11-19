/* pdf.js — "Save as PDF" that works in the iPhone home-screen app.
   iOS ignores window.print() in home-screen web apps, so the PDF is built on
   the device instead: the current screen is copied into a fixed-width (phone
   layout) sheet, drawn with html2canvas, cut into pages at card boundaries,
   and written with jsPDF. The finished file goes to the Share sheet
   (iPhone: "Save to Files", AirDrop, Messages...) or downloads on a computer.
   The two libraries load from cdnjs the first time a PDF is made. */
'use strict';
(function () {
  const LIBS = [
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
  ];
  const SHEET_W = 430;                 // CSS px — phone layout in the PDF
  const PAGE_H = Math.round(SHEET_W * 1.75);      // tall, phone-shaped pages
  const BG = '#0b1220';
  // never in the PDF: controls and buttons
  const DROP = '.pdfbtn, .pdfnote, .chips, .search, .btn, .cmpbtn, .staffbtn, .rollbar, .cmpsel, .ttip, .tguide, .thl';

  let libsP = null;
  const loadScript = src => new Promise((ok, bad) => {
    const s = document.createElement('script'); s.src = src; s.async = true; s.crossOrigin = 'anonymous';
    s.onload = ok; s.onerror = () => bad(new Error('Could not load ' + src.split('/').pop() + ' (are you online?)'));
    document.head.appendChild(s);
  });
  const loadLibs = () => libsP || (libsP = Promise.all(LIBS.map(loadScript)).catch(e => { libsP = null; throw e; }));

  /* overlay: progress, then the Share / Save button (sharing needs a fresh tap) */
  function overlay(html) {
    let o = document.getElementById('pdfov');
    if (!o) { o = document.createElement('div'); o.id = 'pdfov'; document.body.appendChild(o); }
    o.innerHTML = `<div class="pdfbox">${html}</div>`;
    return o;
  }
  const closeOverlay = () => { const o = document.getElementById('pdfov'); if (o) o.remove(); };

  /* SVG text/marks styled by CSS classes lose those styles when html2canvas
     draws the SVG as an image, so copy the computed styles inline first. */
  function inlineSvgStyles(root) {
    root.querySelectorAll('svg [class], svg text').forEach(el => {
      const cs = getComputedStyle(el);
      const st = ['fill', 'stroke', 'stroke-width', 'font-size', 'font-weight', 'font-family', 'paint-order', 'opacity']
        .map(p => `${p}:${cs.getPropertyValue(p)}`).join(';');
      el.setAttribute('style', st + ';' + (el.getAttribute('style') || ''));
    });
  }

  /* page breaks: fill each page, cutting just above a card that would overflow */
  function pageCuts(sheet, total) {
    const top0 = sheet.getBoundingClientRect().top, y = el => el.getBoundingClientRect().top - top0;
    const tops = [];   // preferred break points: above a whole card
    const inner = [];  // fallback: between rows inside a long card
    for (const c of sheet.children) {
      tops.push(y(c));
      if (c.getBoundingClientRect().height > PAGE_H * 0.6)
        c.querySelectorAll(':scope > *:not(h2), .list > *, tbody > tr, .prow, .kpis > *:nth-child(4n+1), .facet').forEach(e => {
          const t = y(e);
          // keep a card's heading (and a table's header row) with real content
          if (t - y(c) > 90) inner.push(t);
        });
    }
    const heads = [];
    const cuts = []; let start = 0;
    while (total - start > PAGE_H) {
      const lim = start + PAGE_H;
      const pick = arr => arr.filter(t => t > start + PAGE_H * 0.35 && t <= lim && !heads.includes(t));
      const ok = pick(tops), ok2 = pick(inner);
      const cut = ok.length ? Math.max(...ok) - 4 : ok2.length ? Math.max(...ok2) - 3 : lim;
      cuts.push([start, cut]); start = cut;
    }
    cuts.push([start, total]);
    return cuts;
  }

  async function build(name) {
    overlay('<div class="pdfspin"></div><b>Building PDF…</b><span>This takes a few seconds.</span>');
    await loadLibs();
    // phone-width copy of the current screen
    const sheet = document.createElement('div');
    sheet.id = 'pdfsheet';
    sheet.style.cssText = `position:fixed;left:0;top:0;width:${SHEET_W}px;padding:14px 16px 10px;background:${BG};z-index:998;`;
    sheet.innerHTML = document.getElementById('view').innerHTML;
    sheet.querySelectorAll(DROP).forEach(e => e.remove());
    sheet.querySelectorAll('.tscroll').forEach(e => { e.style.overflow = 'visible'; });
    sheet.insertAdjacentHTML('beforeend', `<div class="foot">Generated ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })} · LMU Player Development</div>`);
    document.body.appendChild(sheet);
    try {
      await Promise.all([...sheet.querySelectorAll('img')].map(im => im.complete ? 0 : new Promise(r => { im.onload = im.onerror = r; })));
      inlineSvgStyles(sheet);
      const total = Math.ceil(sheet.scrollHeight);
      // stay under iOS's canvas size limit (~16.7M px)
      const scale = Math.max(1, Math.min(2, Math.sqrt(15e6 / (SHEET_W * total))));
      const canvas = await window.html2canvas(sheet, { backgroundColor: BG, scale, useCORS: true, logging: false, // same window size as the live page, so CSS media queries give the clone the exact layout the page breaks were measured on
        windowWidth: window.innerWidth, windowHeight: Math.max(window.innerHeight, total), width: SHEET_W, height: total, x: 0, y: 0, scrollX: 0, scrollY: 0 });
      const cuts = pageCuts(sheet, total);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ unit: 'pt', format: [SHEET_W, PAGE_H], orientation: 'portrait', compress: true });
      const k = canvas.width / SHEET_W;
      cuts.forEach(([a, b], i) => {
        if (i) pdf.addPage([SHEET_W, PAGE_H], 'portrait');
        pdf.setFillColor(BG); pdf.rect(0, 0, SHEET_W, PAGE_H, 'F');
        const c = document.createElement('canvas');
        c.width = canvas.width; c.height = Math.max(1, Math.round((b - a) * k));
        const g = c.getContext('2d'); g.fillStyle = BG; g.fillRect(0, 0, c.width, c.height);
        g.drawImage(canvas, 0, Math.round(a * k), canvas.width, c.height, 0, 0, c.width, c.height);
        pdf.addImage(c.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, SHEET_W, b - a);
        pdf.setFontSize(7); pdf.setTextColor(110, 120, 135);
        if (cuts.length > 1) pdf.text(`${i + 1} / ${cuts.length}`, SHEET_W - 14, PAGE_H - 8, { align: 'right' });
      });
      return new File([pdf.output('blob')], name + '.pdf', { type: 'application/pdf' });
    } finally { sheet.remove(); }
  }

  function deliver(file) {
    const url = URL.createObjectURL(file);
    const canShare = navigator.canShare && navigator.canShare({ files: [file] });
    overlay(`<b>PDF ready</b><span>${L.esc(file.name)} · ${Math.max(1, Math.round(file.size / 1024))} KB</span>
      ${canShare ? '<button class="pdfgo" data-pdf="share">Share / Save to Files</button>' : ''}
      <a class="pdfgo${canShare ? ' alt' : ''}" href="${url}" download="${L.esc(file.name)}" target="_blank" rel="noopener">${canShare ? 'Open PDF' : 'Download PDF'}</a>
      <button class="pdfx" data-pdf="close">Close</button>`);
    const o = document.getElementById('pdfov');
    o.onclick = async e => {
      const b = e.target.closest('[data-pdf]'); if (!b) return;
      if (b.dataset.pdf === 'close') { closeOverlay(); URL.revokeObjectURL(url); return; }
      try { await navigator.share({ files: [file], title: file.name.replace(/\.pdf$/, '') }); closeOverlay(); }
      catch (err) { if (err && err.name !== 'AbortError') alert('Sharing failed: ' + err.message); }
    };
  }

  L.savePdf = async function (name) {
    const safe = (name || 'LMU Report').replace(/[\\/:*?"<>|]+/g, '-').trim();
    try { deliver(await build(safe)); }
    catch (err) {
      overlay(`<b>Couldn't make the PDF</b><span>${L.esc(err.message || String(err))}</span><button class="pdfx" data-pdf="close">Close</button>`);
      document.getElementById('pdfov').onclick = e => { if (e.target.closest('[data-pdf="close"]')) closeOverlay(); };
    }
  };
})();
