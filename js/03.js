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
    const out = await extractItems(page, totalRot(p));
    out.push(...ocrItems(p));
    textResolved.set(key, out);
    return out;
  })());
  return textCache.get(key);
}
async function extractItems(page, rotation) {
  const vp = page.getViewport({ scale: 1, rotation });
  const tc = await page.getTextContent();
  const out = [];
  for (const it of tc.items) {
    if (it.str === undefined) continue;
    const tx = pdfjsLib.Util.transform(vp.transform, it.transform);
    const fh = Math.hypot(tx[2], tx[3]); if (!fh) continue;
    const dl = Math.hypot(tx[0], tx[1]) || fh;
    out.push({ str: it.str, eol: it.hasEOL, o: [tx[4], tx[5]], dir: [tx[0] / dl, tx[1] / dl], up: [tx[2] / fh, tx[3] / fh], fh, width: it.width, fontName: it.fontName, family: tc.styles[it.fontName]?.fontFamily || '' });
  }
  return out;
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

/* ------------------------------------------------------------------ tools & properties */
function setTool(t) {
  finishEdit();
  if (S.placing && t !== S.tool) stopPlacing();
  S.tool = t;
  $$('#toolButtons .tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  viewer.className = 'viewer tool-' + t + (S.placing ? ' placing' : '');
  const drawing = ['highlight', 'rect', 'ellipse', 'line', 'arrow', 'draw', 'whiteout', 'redact', 'crop', 'field'].includes(t);
  $$('.overlay').forEach((o) => { o.classList.toggle('drawing', drawing); o.classList.toggle('texting', ['text', 'date', 'note'].includes(t)); });
  if (t !== 'select') deselect();
  $('#statusHint').textContent = HINTS[t] || '';
  S.pages.forEach((p) => { const pe = pageEls.get(p.id); if (!pe) return; if (t === 'edittext') renderTextLayer(p); else pe.tl.innerHTML = ''; if (t === 'highlight') textItems(p).catch(() => {}); });
  updateProps();
}
function currentStyle() {
  const a = S.sel && annotById(S.sel);
  if (a && TYPE_TOOL[a.type]) return { a, key: TYPE_TOOL[a.type], st: a };
  const key = ['date', 'edittext'].includes(S.tool) ? 'text' : S.tool;
  return { a: null, key, st: S.td[key] };
}
function updateProps() {
  const { a, key, st } = currentStyle();
  const show = new Set(a ? (PROPS_FOR[key] || []) : (PROPS_FOR[S.tool] || []));
  if (a) show.add('delete'); else if (S.sel) show.add('delete');
  $$('#props .prop').forEach((el) => el.classList.toggle('show', show.has(el.dataset.prop)));
  if (!st) return;
  if (st.color) $('#propColor').value = st.color;
  if ('fill' in st) { $('#propFillOn').checked = !!st.fill; if (st.fill) $('#propFill').value = st.fill; }
  const pfo = $('#propFont option[value="__orig"]'); const pfi = a && a.pdfFont && S.pdfFonts[a.pdfFont];
  if (pfi) { const o = pfo || new Option('', '__orig'); o.textContent = 'Original: ' + (pfi.psName || 'embedded font').slice(0, 24); if (!pfo) $('#propFont').add(o, 0); $('#propFont').value = '__orig'; }
  else { pfo && pfo.remove(); if (st.font) $('#propFont').value = st.font; }
  if (st.size) $('#propSize').value = Math.round(st.size * 10) / 10;
  $('#propBold').classList.toggle('on', !!st.bold); $('#propItalic').classList.toggle('on', !!st.italic);
  if (st.width !== undefined) $('#propStroke').value = st.width;
  if (st.opacity !== undefined) $('#propOpacity').value = st.opacity;
}
let propBefore = null;
function applyProp(k, v, final) {
  const { a, key } = currentStyle();
  if (S.td[key]) S.td[key][k] = v;
  if (a) {
    if (!propBefore) propBefore = snap();
    a[k] = v; updateAnnotEl(a);
    if (final) { commit(propBefore); propBefore = null; }
  }
}
$('#propColor').addEventListener('input', (e) => applyProp('color', e.target.value));
$('#propColor').addEventListener('change', (e) => applyProp('color', e.target.value, true));
$('#propFill').addEventListener('input', (e) => { $('#propFillOn').checked = true; applyProp('fill', e.target.value); });
$('#propFill').addEventListener('change', (e) => applyProp('fill', e.target.value, true));
$('#propFillOn').addEventListener('change', (e) => applyProp('fill', e.target.checked ? $('#propFill').value : null, true));
$('#propFont').addEventListener('change', (e) => { if (e.target.value === '__orig') return; const { a } = currentStyle(); if (a && a.pdfFont) { propBefore = snap(); delete a.pdfFont; } applyProp('font', e.target.value, true); updateProps(); });
$('#propSize').addEventListener('change', (e) => applyProp('size', clamp(+e.target.value || 12, 4, 300), true));
$('#propStroke').addEventListener('input', (e) => applyProp('width', +e.target.value));
$('#propStroke').addEventListener('change', (e) => applyProp('width', +e.target.value, true));
$('#propOpacity').addEventListener('input', (e) => applyProp('opacity', +e.target.value));
$('#propOpacity').addEventListener('change', (e) => applyProp('opacity', +e.target.value, true));
$('#propBold').addEventListener('click', () => { const { a } = currentStyle(); if (a && a.pdfFont) { propBefore = snap(); const pf = S.pdfFonts[a.pdfFont]; delete a.pdfFont; a.bold = !pf.bold; a.italic = pf.italic; applyProp('bold', a.bold, true); } else applyProp('bold', !currentStyle().st.bold, true); updateProps(); });
$('#propItalic').addEventListener('click', () => { const { a } = currentStyle(); if (a && a.pdfFont) { propBefore = snap(); const pf = S.pdfFonts[a.pdfFont]; delete a.pdfFont; a.bold = pf.bold; a.italic = !pf.italic; applyProp('italic', a.italic, true); } else applyProp('italic', !currentStyle().st.italic, true); updateProps(); });
$('#propDelete').addEventListener('click', deleteSelected);
$('#props').addEventListener('pointerdown', (e) => { if (editing && e.target.closest('button')) e.preventDefault(); });

$$('#toolButtons .tool').forEach((b) => b.addEventListener('click', () => {
  const t = b.dataset.tool;
  if (t === 'sign') return openSignature();
  if (t === 'image') return $('#fileImage').click();
  if (t === 'stamp') return openStamps();
  setTool(t);
}));
$('#fileImage').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const im = await normalizeImage(f); const id = addAsset(im.dataUrl, im.type, im.w, im.h); startPlacing(id, Math.min(220, im.w * 0.75), 'image'); }
  catch { toast('That image format is not supported by your browser.', true); }
});

/* ------------------------------------------------------------------ signatures */
const LS = { get: (k, d) => safe(() => JSON.parse(localStorage.getItem(k)) ?? d, d), set: (k, v) => safe(() => localStorage.setItem(k, JSON.stringify(v))) };
function trimCanvas(c, pad = 8) {
  const ctx = c.getContext('2d'); const { width: w, height: h } = c; const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1; o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return o;
}
const SIG_FONTS = ['Great Vibes', 'Dancing Script', 'Homemade Apple', 'Caveat'];
const SIG_COLORS = ['#111827', '#1e3a8a', '#0f766e'];
async function openSignature() {
  let mode = 'draw', color = SIG_COLORS[0], fontSel = SIG_FONTS[0], uploadCanvas = null;
  const saved = LS.get('pdfstudio.sigs', []);
  const body = `
    <div class="tabs">${['draw', 'type', 'upload', 'saved'].map((t) => `<button data-tab="${t}" class="${t === 'draw' ? 'on' : ''}">${{ draw: 'Draw', type: 'Type', upload: 'Upload image', saved: `Saved (${saved.length})` }[t]}</button>`).join('')}</div>
    <div data-pane="draw"><canvas class="sigpad" id="sigPad"></canvas>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px"><div class="colors" id="sigColors">${SIG_COLORS.map((c, i) => `<button style="background:${c}" data-c="${c}" class="${i ? '' : 'on'}"></button>`).join('')}</div><button class="btn" id="sigClear">Clear</button></div></div>
    <div data-pane="type" hidden><label class="f">Your name<input type="text" id="sigName" value="${esc(LS.get('pdfstudio.name', ''))}" placeholder="Type your full name or initials"></label><div class="sig-opts" id="sigFonts"></div></div>
    <div data-pane="upload" hidden><label class="f">Image of your signature<input type="file" accept="image/*" id="sigFile"></label>
      <label class="check"><input type="checkbox" id="sigRmBg" checked> Remove white background</label><div id="sigUpPrev" style="text-align:center;min-height:60px"></div></div>
    <div data-pane="saved" hidden><div class="saved-sigs" id="sigSaved"></div><p class="note" id="sigNone">${saved.length ? 'Click a signature to use it.' : 'No saved signatures yet. Tick “Save for next time” when you create one.'}</p></div>
    <label class="check" id="sigSaveRow"><input type="checkbox" id="sigSave" checked> Save for next time (stored only in this browser)</label>`;
  const res = await modal({
    title: 'Add signature or initials', body, wide: true,
    actions: [{ label: 'Cancel', value: null }, { label: 'Use signature', primary: true, onClick: async (m) => {
      let c = null;
      if (mode === 'draw') c = trimCanvas(m.querySelector('#sigPad'));
      else if (mode === 'type') c = await typedSig(m.querySelector('#sigName').value.trim(), fontSel, color);
      else if (mode === 'upload') c = uploadCanvas;
      if (!c) { toast('Please create a signature first.', true); return false; }
      const url = c.toDataURL('image/png');
      if (m.querySelector('#sigSave').checked) LS.set('pdfstudio.sigs', [url, ...saved.filter((s) => s !== url)].slice(0, 8));
      if (mode === 'type') LS.set('pdfstudio.name', m.querySelector('#sigName').value.trim());
      return { url, w: c.width, h: c.height };
    } }],
    onOpen: (m) => {
      const pad = m.querySelector('#sigPad'); const ctx = pad.getContext('2d');
      const fit = () => { pad.width = pad.clientWidth * 2; pad.height = pad.clientHeight * 2; };
      requestAnimationFrame(fit);
      let last = null;
      pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); const r = pad.getBoundingClientRect(); last = [(e.clientX - r.left) * 2, (e.clientY - r.top) * 2]; ctx.beginPath(); ctx.arc(last[0], last[1], 2.4, 0, 7); ctx.fillStyle = color; ctx.fill(); });
      pad.addEventListener('pointermove', (e) => {
        if (!last) return; const r = pad.getBoundingClientRect();
        for (const ce of (e.getCoalescedEvents ? e.getCoalescedEvents() : [e])) {
          const p = [(ce.clientX - r.left) * 2, (ce.clientY - r.top) * 2];
          ctx.strokeStyle = color; ctx.lineWidth = 4.8; ctx.lineCap = ctx.lineJoin = 'round';
          ctx.beginPath(); ctx.moveTo(...last); ctx.lineTo(...p); ctx.stroke(); last = p;
        }
      });
      pad.addEventListener('pointerup', () => (last = null));
      m.querySelector('#sigClear').onclick = () => ctx.clearRect(0, 0, pad.width, pad.height);
      m.querySelectorAll('#sigColors button').forEach((b) => b.onclick = () => { color = b.dataset.c; m.querySelectorAll('#sigColors button').forEach((x) => x.classList.toggle('on', x === b)); renderFonts(); });
      const renderFonts = () => {
        const name = m.querySelector('#sigName').value || 'Your Name';
        m.querySelector('#sigFonts').innerHTML = SIG_FONTS.map((f) => `<div class="sig-opt ${f === fontSel ? 'on' : ''}" data-f="${f}" style="font-family:'${f}',cursive;color:${color}">${esc(name)}</div>`).join('');
        m.querySelectorAll('.sig-opt').forEach((o) => o.onclick = () => { fontSel = o.dataset.f; renderFonts(); });
      };
      m.querySelector('#sigName').addEventListener('input', renderFonts); renderFonts();
      const doUpload = async () => {
        const f = m.querySelector('#sigFile').files[0]; if (!f) return;
        const bmp = await createImageBitmap(f); const sc = Math.min(1, 1200 / bmp.width);
        const c = document.createElement('canvas'); c.width = bmp.width * sc; c.height = bmp.height * sc; const cx = c.getContext('2d'); cx.drawImage(bmp, 0, 0, c.width, c.height);
        if (m.querySelector('#sigRmBg').checked) { const id = cx.getImageData(0, 0, c.width, c.height); const d = id.data; for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; if (l > 215) d[i + 3] = 0; else if (l > 160) d[i + 3] = Math.round(d[i + 3] * (215 - l) / 55); } cx.putImageData(id, 0, 0); }
        uploadCanvas = trimCanvas(c, 4) || c;
        m.querySelector('#sigUpPrev').innerHTML = ''; const im = new Image(); im.src = uploadCanvas.toDataURL(); im.style.cssText = 'max-width:100%;max-height:140px;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/16px 16px';
        m.querySelector('#sigUpPrev').appendChild(im);
      };
      m.querySelector('#sigFile').addEventListener('change', doUpload); m.querySelector('#sigRmBg').addEventListener('change', doUpload);
      const sv = m.querySelector('#sigSaved');
      const renderSaved = () => {
        const list = LS.get('pdfstudio.sigs', []);
        sv.innerHTML = list.map((u, i) => `<div class="saved-sig" data-i="${i}"><img src="${u}"><button class="x" data-x="${i}" title="Remove">×</button></div>`).join('');
        sv.querySelectorAll('.saved-sig').forEach((d) => d.onclick = (e) => {
          if (e.target.dataset.x !== undefined) { list.splice(+e.target.dataset.x, 1); LS.set('pdfstudio.sigs', list); saved.splice(0, saved.length, ...list); renderSaved(); return; }
          const img = d.querySelector('img'); closeModal({ url: img.src, w: img.naturalWidth, h: img.naturalHeight });
        });
      };
      renderSaved();
      m.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => {
        mode = b.dataset.tab; m.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
        m.querySelectorAll('[data-pane]').forEach((p) => p.hidden = p.dataset.pane !== mode);
        m.querySelector('#sigSaveRow').hidden = mode === 'saved';
        if (mode === 'draw') requestAnimationFrame(() => { if (!pad.width || pad.width !== pad.clientWidth * 2) fit(); });
      });
    },
  });
  if (!res) return;
  const id = addAsset(res.url, 'png', res.w, res.h);
  startPlacing(id, clamp(res.w / 4, 60, 180), 'signature');
}
async function typedSig(name, font, color) {
  if (!name) return null;
  await safe(() => document.fonts.load(`96px "${font}"`), null);
  const c = document.createElement('canvas'); const ctx = c.getContext('2d');
  ctx.font = `96px "${font}", cursive`; const w = ctx.measureText(name).width;
  c.width = Math.ceil(w + 80); c.height = 200; ctx.font = `96px "${font}", cursive`; ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(name, 40, 105);
  return trimCanvas(c, 6);
}

