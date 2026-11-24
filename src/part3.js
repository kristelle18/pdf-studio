function onOverlayDown(e, p) {
  if (e.button !== 0 || !p) return;
  const pe = pageEls.get(p.id); const pt = evtPt(e, pe.overlay);
  if (S.placing) { e.preventDefault(); placeAsset(p, pt); return; }
  if (editing) { finishEdit(); if (S.tool === 'select') return; }
  const t = S.tool;
  switch (t) {
    case 'select': deselect(); return;
    case 'text': e.preventDefault(); createText(p, pt, ''); return;
    case 'date': e.preventDefault(); createText(p, pt, new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })); return;
    case 'note': e.preventDefault(); createNote(p, pt); return;
    case 'highlight': e.preventDefault(); dragHighlight(e, p, pe); return;
    case 'rect': case 'ellipse': case 'whiteout': case 'redact': e.preventDefault(); dragRect(e, p, pe, t); return;
    case 'line': case 'arrow': e.preventDefault(); dragLine(e, p, pe, t); return;
    case 'draw': e.preventDefault(); drawInk(e, p, pe); return;
  }
}
function tempSvg(pe, p) {
  const d = dispSize(p); const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', `0 0 ${d.w} ${d.h}`); s.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible';
  pe.overlay.appendChild(s); return s;
}
function dragRect(e, p, pe, kind) {
  const start = evtPt(e, pe.overlay); let cur = start;
  const rub = document.createElement('div'); rub.className = 'rubber'; pe.overlay.appendChild(rub);
  if (kind === 'highlight') rub.style.background = S.td.highlight.color + '80';
  if (kind === 'redact') rub.style.background = 'rgba(0,0,0,.6)';
  const mv = (ev) => { cur = evtPt(ev, pe.overlay); const r = normRect(start, cur); const z = S.zoom; Object.assign(rub.style, { left: r.x * z + 'px', top: r.y * z + 'px', width: r.w * z + 'px', height: r.h * z + 'px' }); };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', () => {
    window.removeEventListener('pointermove', mv); rub.remove();
    const r = normRect(start, cur); if (r.w < 3 || r.h < 3) return;
    const a = { id: uid(), pageId: p.id, type: kind, ...r };
    if (kind === 'highlight') Object.assign(a, S.td.highlight);
    if (kind === 'rect' || kind === 'ellipse') Object.assign(a, S.td[kind]);
    addAnnot(a, snap()); if (kind === 'redact') toast('Redaction marked. It is applied permanently when you save.');
  }, { once: true });
}
// Highlighter: a straight horizontal stroke. Starting on a line of text snaps the stroke to that line's height.
function dragHighlight(e, p, pe) {
  const st = S.td.highlight; const start = evtPt(e, pe.overlay);
  let top = start.y - st.width / 2, h = st.width;
  const items = textResolved.get(textKey(p)) || [];
  const hit = items.map((it) => itemRect(it)).find((r) => Math.abs(r.h) > 0 && start.x >= r.x - 4 && start.x <= r.x + r.w + 4 && start.y >= r.y && start.y <= r.y + r.h);
  if (hit) { top = hit.y + hit.h * 0.06; h = hit.h * 0.9; }
  let x0 = start.x, x1 = start.x;
  const rub = document.createElement('div'); rub.className = 'annot a-highlight';
  Object.assign(rub.style, { background: st.color, opacity: st.opacity, pointerEvents: 'none' }); pe.overlay.appendChild(rub);
  const draw = () => { const z = S.zoom; Object.assign(rub.style, { left: Math.min(x0, x1) * z + 'px', top: top * z + 'px', width: Math.abs(x1 - x0) * z + 'px', height: h * z + 'px' }); };
  draw();
  const mv = (ev) => { x1 = evtPt(ev, pe.overlay).x; draw(); };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', () => {
    window.removeEventListener('pointermove', mv); rub.remove();
    const w = Math.abs(x1 - x0); if (w < 2) return;
    addAnnot({ id: uid(), pageId: p.id, type: 'highlight', x: Math.min(x0, x1), y: top, w, h, color: st.color, opacity: st.opacity }, snap());
  }, { once: true });
}
function dragLine(e, p, pe, kind) {
  const start = evtPt(e, pe.overlay); let cur = start; const st = S.td[kind];
  const svg = tempSvg(pe, p); const ln = document.createElementNS(svg.namespaceURI, 'line');
  ln.setAttribute('stroke', st.color); ln.setAttribute('stroke-width', st.width); ln.setAttribute('stroke-linecap', 'round'); svg.appendChild(ln);
  const mv = (ev) => {
    cur = evtPt(ev, pe.overlay);
    if (ev.shiftKey) { const dx = cur.x - start.x, dy = cur.y - start.y, ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(dx, dy); cur = { x: start.x + len * Math.cos(ang), y: start.y + len * Math.sin(ang) }; }
    ln.setAttribute('x1', start.x); ln.setAttribute('y1', start.y); ln.setAttribute('x2', cur.x); ln.setAttribute('y2', cur.y);
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', () => {
    window.removeEventListener('pointermove', mv); svg.remove();
    if (Math.hypot(cur.x - start.x, cur.y - start.y) < 3) return;
    addAnnot({ id: uid(), pageId: p.id, type: kind, x1: start.x, y1: start.y, x2: cur.x, y2: cur.y, ...st }, snap());
  }, { once: true });
}
function drawInk(e, p, pe) {
  const st = S.td.draw; const pts = [[evtPt(e, pe.overlay).x, evtPt(e, pe.overlay).y]];
  const svg = tempSvg(pe, p); const path = document.createElementNS(svg.namespaceURI, 'path');
  Object.entries({ fill: 'none', stroke: st.color, 'stroke-width': st.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: st.opacity }).forEach(([k, v]) => path.setAttribute(k, v));
  svg.appendChild(path); path.setAttribute('d', inkPath(pts));
  const mv = (ev) => {
    for (const ce of (ev.getCoalescedEvents ? ev.getCoalescedEvents() : [ev])) {
      const q = evtPt(ce, pe.overlay); const l = pts[pts.length - 1];
      if (Math.hypot(q.x - l[0], q.y - l[1]) > 0.6 / S.zoom + 0.3) pts.push([q.x, q.y]);
    }
    path.setAttribute('d', inkPath(pts));
  };
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', () => {
    window.removeEventListener('pointermove', mv); svg.remove();
    addAnnot({ id: uid(), pageId: p.id, type: 'ink', points: simplify(pts, 0.25), ...st }, snap());
  }, { once: true });
}
function simplify(pts, tol) { // Ramer–Douglas–Peucker
  if (pts.length < 3) return pts;
  const dist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1]; const l = dx * dx + dy * dy; if (!l) return Math.hypot(p[0] - a[0], p[1] - a[1]); const t = clamp(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l, 0, 1); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  let md = 0, mi = 0; for (let i = 1; i < pts.length - 1; i++) { const d = dist(pts[i], pts[0], pts[pts.length - 1]); if (d > md) { md = d; mi = i; } }
  if (md <= tol) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, mi + 1), tol).slice(0, -1), ...simplify(pts.slice(mi), tol)];
}

/* text */
function createText(p, pt, text, style) {
  const st = { ...S.td.text, ...(style || {}) };
  const a = { id: uid(), pageId: p.id, type: 'text', x: pt.x, y: pt.y - st.size * 0.6, text, ...st };
  const before = snap(); S.annots.push(a); updateAnnotEl(a); select(a.id);
  startEdit(a.id, before, true);
  return a;
}
function startEdit(id, before, isNew = false) {
  const a = annotById(id); if (!a) return;
  if (editing && editing.id !== id) finishEdit();
  const el = $(`.annot[data-id="${id}"]`); if (!el) return;
  editing = { id, before: before || snap(), isNew, orig: a.text };
  select(id);
  try { el.contentEditable = 'plaintext-only'; } catch { el.contentEditable = 'true'; }
  if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
  el.classList.add('editing'); el.querySelectorAll('.handle,.annot-del').forEach((h) => h.remove());
  el.focus();
  const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  el.oninput = () => { a.text = el.innerText.replace(/\n$/, ''); a.w = el.offsetWidth * (a.sx || 1) / S.zoom; a.h = el.offsetHeight / S.zoom; };
  el.onpaste = (ev) => { ev.preventDefault(); document.execCommand('insertText', false, ev.clipboardData.getData('text/plain')); };
  el.onblur = () => setTimeout(() => { if (editing?.id === id && document.activeElement !== el) finishEdit(); }, 0);
  el.onkeydown = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); el.blur(); } ev.stopPropagation(); };
}
function finishEdit() {
  if (!editing) return; const ed = editing; editing = null;
  const a = annotById(ed.id); const el = $(`.annot[data-id="${ed.id}"]`);
  if (el) { el.contentEditable = 'false'; el.classList.remove('editing'); el.oninput = el.onblur = el.onkeydown = el.onpaste = null; }
  if (!a) return;
  if (el) a.text = el.innerText.replace(/\n$/, '');
  if (!a.text.trim()) {
    S.annots = S.annots.filter((x) => x.id !== a.id); if (S.sel === a.id) S.sel = null;
    if (!ed.isNew) commit(ed.before);
    el && el.remove(); updateProps(); return;
  }
  if (ed.isNew || a.text !== ed.orig) commit(ed.before);
  updateAnnotEl(a);
}

/* notes */
function createNote(p, pt) {
  const a = { id: uid(), pageId: p.id, type: 'note', x: pt.x - 10, y: pt.y - 10, text: '' };
  addAnnot(a, snap()); select(a.id); openNote(a.id, true);
}
function openNote(id, isNew) {
  $$('.note-pop').forEach((n) => n.remove());
  const a = annotById(id); if (!a) return; const pe = pageEls.get(a.pageId); const z = S.zoom;
  const pop = document.createElement('div'); pop.className = 'note-pop';
  pop.innerHTML = `<textarea placeholder="Write a comment…">${esc(a.text)}</textarea><div class="row"><span>Comment</span><span><button data-d style="background:#ef4444">Delete</button> <button data-ok>Done</button></span></div>`;
  Object.assign(pop.style, { left: (a.x + 26) * z + 'px', top: a.y * z + 'px' });
  pe.overlay.appendChild(pop);
  pop.addEventListener('pointerdown', (e) => e.stopPropagation());
  const ta = pop.querySelector('textarea'); ta.focus();
  const before = snap();
  const close = () => { if (ta.value !== a.text) { a.text = ta.value; commit(before); } pop.remove(); updateAnnotEl(a); };
  pop.querySelector('[data-ok]').onclick = close;
  pop.querySelector('[data-d]').onclick = () => { pop.remove(); S.sel = a.id; deleteSelected(); };
  ta.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });
}

/* assets / placing */
function addAsset(dataUrl, type, w, h) { const id = uid(); S.assets[id] = { dataUrl, type, w, h }; return id; }
function startPlacing(assetId, widthPt, label) {
  const as = S.assets[assetId]; const w = widthPt, h = widthPt * as.h / as.w;
  S.placing = { assetId, w, h }; finishEdit(); deselect();
  viewer.classList.add('placing'); $$('.overlay').forEach((o) => o.classList.add('placing'));
  $('#statusHint').textContent = `Click on a page to place the ${label}. Press Esc to cancel.`;
  toast(`Click on the page where you want the ${label}.`);
}
function stopPlacing() { S.placing = null; viewer.classList.remove('placing'); $$('.overlay').forEach((o) => o.classList.remove('placing')); setTool(S.tool); }
function placeAsset(p, pt) {
  const { assetId, w, h } = S.placing; const d = dispSize(p);
  const a = { id: uid(), pageId: p.id, type: 'image', assetId, x: clamp(pt.x - w / 2, 0, Math.max(0, d.w - w)), y: clamp(pt.y - h / 2, 0, Math.max(0, d.h - h)), w, h, opacity: 1 };
  stopPlacing(); setTool('select'); addAnnot(a, snap()); select(a.id);
}

/* edit existing text */
const textCache = new Map();
const textResolved = new Map();
const textKey = (p) => `${p.srcId}:${p.index}:${totalRot(p)}`;
function textItems(p) {
  const key = textKey(p);
  if (!textCache.has(key)) textCache.set(key, (async () => {
    const page = await S.sources.get(p.srcId).pdf.getPage(p.index + 1);
    const vp = page.getViewport({ scale: 1, rotation: totalRot(p) });
    const tc = await page.getTextContent();
    const out = [];
    for (const it of tc.items) {
      if (it.str === undefined) continue;
      const tx = pdfjsLib.Util.transform(vp.transform, it.transform);
      const fh = Math.hypot(tx[2], tx[3]); if (!fh) continue;
      const dl = Math.hypot(tx[0], tx[1]) || fh;
      out.push({ str: it.str, eol: it.hasEOL, o: [tx[4], tx[5]], dir: [tx[0] / dl, tx[1] / dl], up: [tx[2] / fh, tx[3] / fh], fh, width: it.width, fontName: it.fontName, family: tc.styles[it.fontName]?.fontFamily || '' });
    }
    textResolved.set(key, out);
    return out;
  })());
  return textCache.get(key);
}
function itemRect(it, s = 0, e = it.str.length) {
  const n = it.str.length || 1, a = it.width * s / n, b = it.width * e / n;
  const pts = [];
  for (const t of [a, b]) for (const u of [0.92, -0.24]) pts.push([it.o[0] + it.dir[0] * t + it.up[0] * u * it.fh, it.o[1] + it.dir[1] * t + it.up[1] * u * it.fh]);
  const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
async function renderTextLayer(p) {
  if (!p) return; const pe = pageEls.get(p.id); if (!pe) return;
  const items = await textItems(p); if (S.tool !== 'edittext') return;
  pe.tl.innerHTML = ''; const z = S.zoom;
  const covers = annotsOf(p.id).filter((a) => a.type === 'whiteout' || a.type === 'redact');
  items.forEach((it) => {
    if (!it.str.trim() || Math.abs(it.dir[1]) > 0.02 || it.dir[0] <= 0) return;
    const r = itemRect(it); const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    if (covers.some((c) => cx > c.x && cx < c.x + c.w && cy > c.y && cy < c.y + c.h)) return;
    const d = document.createElement('div'); d.className = 'tl-item'; d.title = 'Click to edit this text';
    Object.assign(d.style, { left: r.x * z + 'px', top: r.y * z + 'px', width: r.w * z + 'px', height: r.h * z + 'px' });
    d.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); convertItem(p, it, r); });
    pe.tl.appendChild(d);
  });
}
/* Reuse the PDF's own embedded fonts so edited text keeps its original look. */
S.pdfFonts = {}; // key -> { family, bytes, fk, psName, bold, italic, bl }
const pdfFontJobs = new Map();
function baselineRatio(cssFamily) {
  const box = document.createElement('div');
  box.style.cssText = `position:absolute;left:-9999px;top:0;font:100px/1.2 ${cssFamily};white-space:pre;visibility:hidden`;
  box.innerHTML = 'Hg<span style="display:inline-block;width:1px;height:0;vertical-align:baseline"></span>';
  document.body.appendChild(box); const r = box.lastChild.offsetTop / 100; box.remove(); return r || 0.93;
}
function getPdfFont(p, fontName) {
  const key = `${p.srcId}:${fontName}`;
  if (!pdfFontJobs.has(key)) pdfFontJobs.set(key, (async () => {
    try {
      const page = await S.sources.get(p.srcId).pdf.getPage(p.index + 1);
      if (!page.commonObjs.has(fontName)) await page.getOperatorList();
      const f = page.commonObjs.get(fontName);
      if (!f || typeof f !== 'object') return null;
      const psName = String(f.name || '').replace(/^[A-Z]{6}\+/, '');
      const serifName = /serif|times|roman|georgia|garamond|cambria|minion|palatino|book|baskerville/i.test(psName) && !/sans/i.test(psName);
      const info = { key, psName, std: /mono|courier|consol/i.test(psName) ? 'Courier' : serifName ? 'Times' : null, bold: !!f.bold || /bold|black|heavy|semibold|demi/i.test(psName), italic: !!f.italic || /italic|oblique/i.test(psName) };
      if (f.data && !f.isType3Font && !f.missingFile) {
        const bytes = new Uint8Array(f.data);
        const family = 'pdffont-' + key.replace(/[^a-z0-9]/gi, '_');
        const face = new FontFace(family, bytes.slice().buffer, { weight: info.bold ? '700' : '400', style: info.italic ? 'italic' : 'normal' }); await face.load(); document.fonts.add(face);
        Object.assign(info, { family, bytes, fk: window.fontkit ? safe(() => window.fontkit.create(bytes), null) : null });
        info.bl = baselineRatio(`"${family}"`);
      }
      S.pdfFonts[key] = info; return info;
    } catch (e) { console.warn('font', e); return null; }
  })());
  return pdfFontJobs.get(key);
}
const fontCss = (a) => { const pf = a.pdfFont && S.pdfFonts[a.pdfFont]; return pf?.family ? `"${pf.family}", ${FONT_CSS[a.font]}` : FONT_CSS[a.font]; };
const textBold = (a) => (a.pdfFont && S.pdfFonts[a.pdfFont] ? S.pdfFonts[a.pdfFont].bold : a.bold);
const textItalic = (a) => (a.pdfFont && S.pdfFonts[a.pdfFont] ? S.pdfFonts[a.pdfFont].italic : a.italic);
const textBaseline = (a) => (a.pdfFont && S.pdfFonts[a.pdfFont]?.bl) || BASELINE[a.font];
// Read the original text and background colors from the rendered page.
function sampleColors(p, r) {
  const pe = pageEls.get(p.id); const c = pe?.canvas; const d = dispSize(p);
  if (!c || !c.width) return { fg: '#000000', bg: '#ffffff' };
  const k = c.width / d.w; const x0 = Math.max(0, Math.floor(r.x * k)), y0 = Math.max(0, Math.floor(r.y * k));
  const w = Math.min(c.width - x0, Math.ceil(r.w * k)), h = Math.min(c.height - y0, Math.ceil(r.h * k));
  if (w < 2 || h < 2) return { fg: '#000000', bg: '#ffffff' };
  const px = safe(() => c.getContext('2d', { willReadFrequently: true }).getImageData(x0, y0, w, h).data, null); if (!px) return { fg: '#000000', bg: '#ffffff' };
  const counts = new Map(); const at = (i) => [px[i], px[i + 1], px[i + 2]];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!(y === 0 || y === h - 1 || x === 0 || x === w - 1)) continue;
    const [R, G, B] = at((y * w + x) * 4); const q = `${R >> 3},${G >> 3},${B >> 3}`; counts.set(q, (counts.get(q) || 0) + 1);
  }
  let bgq = '31,31,31', best = 0; for (const [q, n] of counts) if (n > best) { best = n; bgq = q; }
  const bg = bgq.split(',').map((v) => (+v << 3) + 4).map((v) => Math.min(255, v));
  let fg = [0, 0, 0], far = -1;
  for (let i = 0; i < px.length; i += 4) { const dd = Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]); if (dd > far) { far = dd; fg = at(i); } }
  const hex = (a) => '#' + a.map((v) => v.toString(16).padStart(2, '0')).join('');
  const isWhite = bg.every((v) => v > 244);
  return { fg: far > 60 ? hex(fg) : '#000000', bg: isWhite ? '#ffffff' : hex(bg) };
}
async function convertItem(p, it, r) {
  finishEdit();
  const before = snap();
  const fam = /mono|courier/i.test(it.family) ? 'Courier' : (/serif|times/i.test(it.family) && !/sans/i.test(it.family)) ? 'Times' : 'Helvetica';
  const { fg, bg } = sampleColors(p, r);
  const pf = await getPdfFont(p, it.fontName);
  const size = Math.round(it.fh * 100) / 100;
  const text = it.str.replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/ﬀ/g, 'ff');
  const a = { id: uid(), pageId: p.id, type: 'text', text, x: it.o[0], size, font: fam, bold: false, italic: false, color: fg, opacity: 1 };
  if (pf?.std) a.font = pf.std;
  if (pf?.family) a.pdfFont = pf.key; else if (pf) { a.bold = pf.bold; a.italic = pf.italic; }
  a.y = it.o[1] - size * textBaseline(a);
  // Keep the original line width: squeeze/stretch slightly if our rendering differs.
  const mc = (convertItem.c ||= document.createElement('canvas').getContext('2d'));
  mc.font = `${textItalic(a) ? 'italic ' : ''}${textBold(a) ? 'bold ' : ''}${size}px ${fontCss(a)}`; const natural = mc.measureText(text).width;
  let sx = natural > 0 && it.width > 0 ? it.width / natural : 1; a.sx = Math.abs(sx - 1) < 0.02 ? 1 : clamp(sx, 0.6, 1.4);
  S.annots.push({ id: uid(), pageId: p.id, type: 'whiteout', x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2, ...(bg !== '#ffffff' ? { fill: bg } : {}) });
  S.annots.push(a); renderOverlay(p); renderTextLayer(p);
  startEdit(a.id, before, true);
}

/* ------------------------------------------------------------------ search */
const search = { q: '', hits: [], cur: -1, token: 0 };
async function runSearch(q) {
  const tok = ++search.token; search.q = q; search.hits = []; search.cur = -1;
  S.pages.forEach(renderHits);
  if (!q) { $('#searchCount').textContent = ''; return; }
  const ql = q.toLowerCase();
  for (const p of S.pages) {
    const items = await textItems(p); if (tok !== search.token) return;
    let str = ''; const offs = [];
    items.forEach((it, i) => { offs.push(str.length); str += it.str + (it.eol ? ' ' : ''); });
    const low = str.toLowerCase(); let i = low.indexOf(ql);
    while (i >= 0) {
      const end = i + ql.length; const rects = [];
      items.forEach((it, k) => { const s = offs[k], e = s + it.str.length; if (e <= i || s >= end || !it.str.length) return; rects.push(itemRect(it, Math.max(0, i - s), Math.min(it.str.length, end - s))); });
      if (rects.length) search.hits.push({ pageId: p.id, rects });
      i = low.indexOf(ql, end);
    }
  }
  if (tok !== search.token) return;
  $('#searchCount').textContent = search.hits.length ? `0/${search.hits.length}` : '0';
  if (search.hits.length) gotoHit(0); else toast(`No matches for "${q}".`);
}
function gotoHit(i) {
  if (!search.hits.length) return;
  search.cur = (i + search.hits.length) % search.hits.length;
  S.pages.forEach(renderHits);
  const h = search.hits[search.cur]; const pe = pageEls.get(h.pageId);
  $('#searchCount').textContent = `${search.cur + 1}/${search.hits.length}`;
  if (pe) viewer.scrollTop = pe.wrap.offsetTop + h.rects[0].y * S.zoom - viewer.clientHeight / 3;
}
function renderHits(p) {
  const pe = pageEls.get(p.id); if (!pe) return; pe.hits.innerHTML = ''; const z = S.zoom;
  search.hits.forEach((h, i) => { if (h.pageId !== p.id) return; h.rects.forEach((r) => { const d = document.createElement('div'); d.className = 'hit' + (i === search.cur ? ' cur' : ''); Object.assign(d.style, { left: r.x * z + 'px', top: r.y * z + 'px', width: r.w * z + 'px', height: r.h * z + 'px' }); pe.hits.appendChild(d); }); });
}
let sTimer;
$('#searchInput').addEventListener('input', (e) => { clearTimeout(sTimer); sTimer = setTimeout(() => runSearch(e.target.value.trim()), 300); });
$('#searchInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); if (search.q !== e.target.value.trim()) runSearch(e.target.value.trim()); else gotoHit(search.cur + (e.shiftKey ? -1 : 1)); } });
$('#searchNext').onclick = () => gotoHit(search.cur + 1); $('#searchPrev').onclick = () => gotoHit(search.cur - 1);

