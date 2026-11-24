/* ------------------------------------------------------------------ forms */
function detectFields(src) {
  const doc = src.lib; let form;
  try { form = doc.getForm(); } catch { return; }
  const fields = safe(() => form.getFields(), []); if (!fields.length) return;
  const pages = doc.getPages(); const refToIdx = new Map(); const annotToPage = new Map();
  pages.forEach((pg, i) => {
    refToIdx.set(pg.ref.toString(), i);
    const an = safe(() => pg.node.Annots(), null);
    if (an) for (let k = 0; k < an.size(); k++) { const r = an.get(k); if (r instanceof L.PDFRef) annotToPage.set(r.toString(), i); }
  });
  for (const f of fields) {
    const type = f instanceof L.PDFTextField ? 'text' : f instanceof L.PDFCheckBox ? 'check' : f instanceof L.PDFRadioGroup ? 'radio'
      : f instanceof L.PDFDropdown ? 'dropdown' : f instanceof L.PDFOptionList ? 'list' : null;
    if (!type) continue;
    const name = f.getName(); const key = src.id + '::' + name;
    let val = '';
    try {
      if (type === 'text') val = f.getText() || ''; else if (type === 'check') val = f.isChecked();
      else if (type === 'radio') val = f.getSelected() || ''; else val = (f.getSelected() || [])[0] || '';
    } catch { }
    S.formInit[key] = val; S.form[key] = val;
    const opts = ['radio', 'dropdown', 'list'].includes(type) ? safe(() => f.getOptions(), []) : null;
    const widgets = safe(() => f.acroField.getWidgets(), []);
    widgets.forEach((w, wi) => {
      let pi; const P = safe(() => w.P(), null); if (P) pi = refToIdx.get(P.toString());
      if (pi === undefined) { const ref = safe(() => doc.context.getObjectRef(w.dict), null); if (ref) pi = annotToPage.get(ref.toString()); }
      if (pi === undefined) return;
      const r = safe(() => w.getRectangle(), null); if (!r || r.width < 2 || r.height < 2) return;
      let onValue = null;
      if (type === 'radio') { const ov = safe(() => w.getOnValue(), null); onValue = opts[wi] ?? (ov ? ov.decodeText() : null); }
      S.fields.push({
        key, srcId: src.id, name, type, pageIndex: pi, rect: r, options: opts, onValue,
        multiline: type === 'text' && safe(() => f.isMultiline(), false), readOnly: safe(() => f.isReadOnly(), false),
        maxLen: type === 'text' ? safe(() => f.getMaxLength(), undefined) : undefined,
      });
    });
  }
}
function formChanged(srcId) { return Object.keys(S.form).some((k) => k.startsWith(srcId + '::') && S.form[k] !== S.formInit[k]); }
function applyForm(doc, srcId, flatten) {
  let form; try { form = doc.getForm(); } catch { return; }
  for (const f of safe(() => form.getFields(), [])) {
    const key = srcId + '::' + f.getName();
    if (!(key in S.form) || S.form[key] === S.formInit[key]) continue;
    const v = S.form[key];
    try {
      if (f instanceof L.PDFTextField) f.setText(v || undefined);
      else if (f instanceof L.PDFCheckBox) v ? f.check() : f.uncheck();
      else if (f instanceof L.PDFRadioGroup) { if (v) f.select(v); else f.clear(); }
      else if (f instanceof L.PDFDropdown || f instanceof L.PDFOptionList) { if (v) f.select(v); else f.clear(); }
    } catch (e) { console.warn('field', key, e); }
  }
  if (flatten && safe(() => form.getFields().length, 0)) {
    try { form.flatten({ updateFieldAppearances: true }); } catch (e) { console.warn('flatten failed', e); }
    // pdf-lib can leave references to deleted widgets in page /Annots — drop them.
    for (const pg of doc.getPages()) {
      const an = safe(() => pg.node.Annots(), null); if (!an) continue;
      for (let k = an.size() - 1; k >= 0; k--) { const r = an.get(k); if (r instanceof L.PDFRef && !doc.context.lookup(r)) an.remove(k); }
    }
  }
}
function setForm(key, v, before) {
  if (S.form[key] === v) return;
  S.form[key] = v; commit(before);
  $$(`.ff[data-key="${CSS.escape(key)}"]`).forEach((el) => syncFieldEl(el));
}
function syncFieldEl(el) {
  const f = S.fields[+el.dataset.fi]; const v = S.form[f.key];
  if (f.type === 'check') el.textContent = v ? '✓' : '';
  else if (f.type === 'radio') el.textContent = v && v === f.onValue ? '●' : '';
  else if (document.activeElement !== el) el.value = v ?? '';
}
function renderForms(p) {
  const pe = pageEls.get(p.id); if (!pe) return; pe.forms.innerHTML = '';
  const z = S.zoom;
  S.fields.forEach((f, fi) => {
    if (f.srcId !== p.srcId || f.pageIndex !== p.index) return;
    const r = pageRectToDisp(p, f.rect); let el;
    if (f.type === 'text') { el = document.createElement(f.multiline ? 'textarea' : 'input'); if (f.maxLen) el.maxLength = f.maxLen; }
    else if (f.type === 'check' || f.type === 'radio') { el = document.createElement('div'); el.className = 'chk' + (f.type === 'radio' ? ' rad' : ''); el.tabIndex = 0; }
    else { el = document.createElement('select'); el.innerHTML = '<option value=""></option>' + (f.options || []).map((o) => `<option>${esc(o)}</option>`).join(''); if (f.type === 'list') el.size = 1; }
    el.classList.add('ff'); el.dataset.key = f.key; el.dataset.fi = fi; el.title = f.name;
    Object.assign(el.style, { left: r.x * z + 'px', top: r.y * z + 'px', width: r.w * z + 'px', height: r.h * z + 'px', fontSize: clamp(r.h * 0.62, 6, 13) * z + 'px' });
    if (f.type === 'check' || f.type === 'radio') el.style.fontSize = Math.min(r.w, r.h) * 0.8 * z + 'px';
    if (f.readOnly) { el.disabled = true; el.style.pointerEvents = 'none'; }
    syncFieldEl(el);
    if (f.type === 'text') {
      let before = null;
      el.addEventListener('focus', () => { before = snap(); });
      el.addEventListener('input', () => { S.form[f.key] = el.value; S.dirty = true; $$(`.ff[data-key="${CSS.escape(f.key)}"]`).forEach((o) => o !== el && syncFieldEl(o)); });
      el.addEventListener('blur', () => { if (before && JSON.parse(before).form[f.key] !== el.value) commit(before); before = null; });
    } else if (f.type === 'check' || f.type === 'radio') {
      const toggle = () => { const b = snap(); setForm(f.key, f.type === 'check' ? !S.form[f.key] : (S.form[f.key] === f.onValue ? '' : f.onValue), b); };
      el.addEventListener('click', toggle);
      el.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); } });
    } else el.addEventListener('change', () => setForm(f.key, el.value, snap()));
    pe.forms.appendChild(el);
  });
}

/* ------------------------------------------------------------------ viewer */
const pageEls = new Map();
const viewer = $('#viewer');
const io = new IntersectionObserver((ents) => {
  for (const en of ents) { const pe = pageEls.get(en.target.dataset.id); if (!pe) continue; pe.visible = en.isIntersecting; if (en.isIntersecting) renderCanvas(pe.page()); }
}, { root: viewer, rootMargin: '800px 0px' });

function createPageEl(p) {
  const pageDiv = document.createElement('div'); pageDiv.className = 'page'; pageDiv.dataset.id = p.id;
  pageDiv.innerHTML = `<span class="plabel"></span><canvas class="pcanvas"></canvas><div class="layer preview-layer"></div><div class="layer hits"></div>
    <div class="layer overlay"></div><div class="layer forms"></div><div class="layer tl"></div>`;
  const pe = {
    wrap: pageDiv, pageDiv, label: pageDiv.querySelector('.plabel'), canvas: pageDiv.querySelector('canvas'), preview: pageDiv.querySelector('.preview-layer'),
    hits: pageDiv.querySelector('.hits'), overlay: pageDiv.querySelector('.overlay'), forms: pageDiv.querySelector('.forms'), tl: pageDiv.querySelector('.tl'),
    renderedKey: null, rendering: null, task: null, visible: false, page: () => S.pages.find((x) => x.id === p.id),
  };
  pe.overlay.addEventListener('pointerdown', (e) => onOverlayDown(e, pe.page()));
  io.observe(pageDiv);
  return pe;
}
function rebuildViewer() {
  const cont = $('#pages'); const keep = new Set(S.pages.map((p) => p.id));
  for (const [id, pe] of pageEls) if (!keep.has(id)) { io.unobserve(pe.wrap); pe.wrap.remove(); pageEls.delete(id); }
  S.pages.forEach((p, i) => {
    let pe = pageEls.get(p.id); if (!pe) { pe = createPageEl(p); pageEls.set(p.id, pe); }
    if (cont.children[i] !== pe.wrap) cont.insertBefore(pe.wrap, cont.children[i] || null);
    layoutPage(p, pe, i);
  });
  $('#pageCount').textContent = '/ ' + S.pages.length; $('#sideCount').textContent = `(${S.pages.length})`;
  S.current = clamp(S.current, 0, S.pages.length - 1);
}
function layoutPage(p, pe, i) {
  const d = dispSize(p);
  pe.pageDiv.style.width = d.w * S.zoom + 'px'; pe.pageDiv.style.height = d.h * S.zoom + 'px';
  pe.label.textContent = `${i + 1}`;
  if (pe.renderedKey !== `${totalRot(p)}|${S.zoom}`) { pe.renderedKey = null; if (pe.visible) renderCanvas(p); }
  renderOverlay(p); renderForms(p); renderPreview(p, i); renderHits(p);
  if (S.tool === 'edittext') renderTextLayer(p); else pe.tl.innerHTML = '';
}
async function renderCanvas(p) {
  const pe = pageEls.get(p?.id); if (!pe) return;
  const key = `${totalRot(p)}|${S.zoom}`;
  if (pe.renderedKey === key || pe.rendering === key) return;
  pe.rendering = key;
  if (pe.task) safe(() => pe.task.cancel());
  const src = S.sources.get(p.srcId);
  try {
    const page = await src.pdf.getPage(p.index + 1);
    const d = dispSize(p);
    let scale = S.zoom * Math.min(window.devicePixelRatio || 1, 2);
    const maxPx = 16e6; if (d.w * d.h * scale * scale > maxPx) scale = Math.sqrt(maxPx / (d.w * d.h));
    const vp = page.getViewport({ scale, rotation: totalRot(p) });
    const canvas = document.createElement('canvas'); canvas.className = 'pcanvas';
    canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
    const task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
    pe.task = task; await task.promise;
    if (pe.rendering !== key) return;
    pe.canvas.replaceWith(canvas); pe.canvas = canvas; pe.renderedKey = key; pe.rendering = null;
  } catch (e) { if (e?.name !== 'RenderingCancelledException') { console.error(e); pe.rendering = null; } }
}
function computeZoom() {
  if (!S.pages.length) return;
  const maxW = Math.max(...S.pages.map((p) => dispSize(p).w));
  const availW = viewer.clientWidth - 48;
  if (S.zoomMode === 'fit') S.zoom = clamp(availW / maxW, 0.25, 4);
  else if (S.zoomMode === 'page') { const p = S.pages[S.current] || S.pages[0]; const d = dispSize(p); S.zoom = clamp(Math.min(availW / d.w, (viewer.clientHeight - 60) / d.h), 0.1, 4); }
  S.zoom = Math.round(S.zoom * 1000) / 1000;
  const sel = $('#zoomSelect');
  if (S.zoomMode === 'fit' || S.zoomMode === 'page') sel.value = S.zoomMode;
  else {
    let opt = [...sel.options].find((o) => o.dataset.custom);
    if (![...sel.options].some((o) => +o.value === S.zoom)) { if (!opt) { opt = new Option(); opt.dataset.custom = 1; sel.add(opt); } opt.value = S.zoom; opt.text = Math.round(S.zoom * 100) + '%'; }
    sel.value = String(S.zoom);
  }
}
function setZoom(mode) {
  const frac = viewer.scrollTop / Math.max(1, viewer.scrollHeight);
  S.zoomMode = typeof mode === 'number' ? 'custom' : mode;
  if (typeof mode === 'number') S.zoom = clamp(mode, 0.1, 5);
  computeZoom(); finishEdit(); rebuildViewer();
  viewer.scrollTop = frac * viewer.scrollHeight;
}
const ZSTEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
const zoomStep = (dir) => setZoom(dir > 0 ? (ZSTEPS.find((z) => z > S.zoom + 0.001) || 5) : ([...ZSTEPS].reverse().find((z) => z < S.zoom - 0.001) || 0.25));
function scrollToPage(i) { const p = S.pages[i]; if (!p) return; const pe = pageEls.get(p.id); viewer.scrollTop = pe.wrap.offsetTop - 24; S.current = i; updateCurrent(); }
function updateCurrent() {
  $('#pageInput').value = S.current + 1;
  $$('.thumb').forEach((t, i) => t.classList.toggle('current', i === S.current));
}
let scrollRaf = 0;
viewer.addEventListener('scroll', () => {
  if (scrollRaf) return;
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0; const mid = viewer.scrollTop + viewer.clientHeight * 0.35;
    let idx = 0; S.pages.forEach((p, i) => { const pe = pageEls.get(p.id); if (pe && pe.wrap.offsetTop <= mid) idx = i; });
    if (idx !== S.current) { S.current = idx; updateCurrent(); const t = $$('.thumb')[idx]; t && t.scrollIntoView({ block: 'nearest' }); }
  });
});
window.addEventListener('resize', () => { if (S.pages.length && (S.zoomMode === 'fit' || S.zoomMode === 'page')) setZoom(S.zoomMode); });
viewer.addEventListener('wheel', (e) => { if ((e.ctrlKey || e.metaKey) && S.pages.length) { e.preventDefault(); zoomStep(e.deltaY < 0 ? 1 : -1); } }, { passive: false });

/* pan tool */
viewer.addEventListener('pointerdown', (e) => {
  if (S.tool !== 'hand' || e.button !== 0) return;
  const sx = e.clientX, sy = e.clientY, st = viewer.scrollTop, sl = viewer.scrollLeft;
  const mv = (ev) => { viewer.scrollTop = st - (ev.clientY - sy); viewer.scrollLeft = sl - (ev.clientX - sx); };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', () => window.removeEventListener('pointermove', mv), { once: true });
});

/* ------------------------------------------------------------------ preview of page numbers / watermark */
function renderPreview(p, i) {
  const pe = pageEls.get(p.id); if (!pe) return; pe.preview.innerHTML = '';
  const z = S.zoom; const d = dispSize(p);
  const wm = S.docOps.watermark;
  if (wm && wm.text) {
    const el = document.createElement('div');
    Object.assign(el.style, { position: 'absolute', left: d.w * z / 2 + 'px', top: d.h * z / 2 + 'px', transform: `translate(-50%,-50%) rotate(${-wm.angle}deg)`, whiteSpace: 'pre', fontFamily: FONT_CSS.Helvetica, fontWeight: 700, fontSize: wm.size * z + 'px', color: wm.color, opacity: wm.opacity, lineHeight: 1 });
    el.textContent = wm.text; pe.preview.appendChild(el);
  }
  const pn = S.docOps.pageNumbers;
  if (pn && !(pn.skipFirst && i === 0)) {
    const el = document.createElement('div'); const txt = pageNumberText(pn, i);
    const m = pn.margin * z; const pos = pn.pos;
    Object.assign(el.style, { position: 'absolute', left: m + 'px', right: m + 'px', textAlign: pos[1] === 'c' ? 'center' : pos[1] === 'r' ? 'right' : 'left', fontFamily: FONT_CSS.Helvetica, fontSize: pn.size * z + 'px', color: pn.color, lineHeight: 1.2, whiteSpace: 'pre' });
    if (pos[0] === 't') el.style.top = (pn.margin - pn.size * 0.25) * z + 'px';
    else el.style.top = (d.h - pn.margin - pn.size * BASELINE.Helvetica) * z + 'px';
    el.textContent = txt; pe.preview.appendChild(el);
  }
}
const pageNumberText = (pn, i) => pn.format.replace(/\{n\}/g, i + pn.start).replace(/\{total\}/g, S.pages.length + pn.start - 1);

/* ------------------------------------------------------------------ annotations: rendering */
const annotsOf = (pageId) => S.annots.filter((a) => a.pageId === pageId);
const annotById = (id) => S.annots.find((a) => a.id === id);
const pageOfAnnot = (a) => S.pages.find((p) => p.id === a.pageId);
let editing = null; // { id, before, isNew }

function renderOverlay(p) {
  const pe = pageEls.get(p.id); if (!pe) return;
  if (editing && annotById(editing.id)?.pageId === p.id) return; // don't destroy an active editor
  pe.overlay.innerHTML = '';
  for (const a of annotsOf(p.id)) pe.overlay.appendChild(annotEl(a));
  refreshSelection();
}
function annotEl(a) {
  const z = S.zoom; const el = document.createElement('div'); el.className = 'annot a-' + a.type; el.dataset.id = a.id;
  const pos = (b) => Object.assign(el.style, { left: b.x * z + 'px', top: b.y * z + 'px', width: b.w * z + 'px', height: b.h * z + 'px' });
  const op = a.opacity ?? 1;
  switch (a.type) {
    case 'text':
      el.textContent = a.text; applyTextStyle(el, a);
      requestAnimationFrame(() => { if (el.isConnected) { a.w = el.offsetWidth * (a.sx || 1) / S.zoom; a.h = el.offsetHeight / S.zoom; } });
      break;
    case 'highlight': pos(a); el.style.background = a.color; el.style.opacity = op; break;
    case 'whiteout': pos(a); el.style.background = a.fill || '#fff'; break;
    case 'redact': pos(a); break;
    case 'rect': case 'ellipse': {
      pos(a); const sw = a.width;
      const shape = a.type === 'rect' ? `<rect x="${sw / 2}" y="${sw / 2}" width="${Math.max(0, a.w - sw)}" height="${Math.max(0, a.h - sw)}"/>`
        : `<ellipse cx="${a.w / 2}" cy="${a.h / 2}" rx="${Math.max(0, a.w / 2 - sw / 2)}" ry="${Math.max(0, a.h / 2 - sw / 2)}"/>`;
      el.innerHTML = `<svg viewBox="0 0 ${a.w} ${a.h}" preserveAspectRatio="none" style="opacity:${op}"><g fill="${a.fill || 'none'}" stroke="${sw > 0 ? a.color : 'none'}" stroke-width="${sw}">${shape}</g></svg>`;
      break;
    }
    case 'line': case 'arrow': case 'ink': {
      const b = bbox(a); const pad = a.width * 2 + 6;
      pos({ x: b.x - pad, y: b.y - pad, w: b.w + pad * 2, h: b.h + pad * 2 });
      let inner;
      if (a.type === 'ink') inner = `<path d="${inkPath(a.points)}" fill="none" stroke="${a.color}" stroke-width="${a.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
      else {
        let ex = a.x2, ey = a.y2, head = '';
        if (a.type === 'arrow') { const h = arrowHead(a.x1, a.y1, a.x2, a.y2, a.width); ex = h.base[0]; ey = h.base[1]; head = `<path d="${h.path}" fill="${a.color}"/>`; }
        inner = `<line x1="${a.x1}" y1="${a.y1}" x2="${ex}" y2="${ey}" stroke="${a.color}" stroke-width="${a.width}" stroke-linecap="round"/>${head}`;
      }
      el.innerHTML = `<svg viewBox="${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}" style="opacity:${op}">${inner}</svg>`;
      break;
    }
    case 'image': pos(a); el.innerHTML = `<img alt="" draggable="false" src="${S.assets[a.assetId]?.dataUrl || ''}" style="opacity:${op}">`; break;
    case 'note': pos(bbox(a)); el.innerHTML = `<div class="note-ico">${icon('note')}</div>`; el.title = a.text || 'Comment'; el.querySelector('svg').style.cssText = 'width:13px;height:13px'; break;
  }
  el.addEventListener('pointerdown', (e) => onAnnotDown(e, a.id, el));
  el.addEventListener('dblclick', (e) => { const x = annotById(a.id); if (!x) return; if (x.type === 'text') startEdit(x.id); if (x.type === 'note') openNote(x.id); e.stopPropagation(); });
  return el;
}
function applyTextStyle(el, a) {
  const z = S.zoom;
  Object.assign(el.style, { left: a.x * z + 'px', top: a.y * z + 'px', fontSize: a.size * z + 'px', fontFamily: fontCss(a), fontWeight: textBold(a) ? 700 : 400, fontStyle: textItalic(a) ? 'italic' : 'normal', color: a.color, opacity: a.opacity ?? 1, transformOrigin: '0 0', transform: a.sx && a.sx !== 1 ? `scaleX(${a.sx})` : '' });
}
function updateAnnotEl(a) {
  const pe = pageEls.get(a.pageId); if (!pe) return;
  const old = pe.overlay.querySelector(`.annot[data-id="${a.id}"]`);
  if (old && editing?.id === a.id) { applyTextStyle(old, a); return; }
  const n = annotEl(a); old ? old.replaceWith(n) : pe.overlay.appendChild(n); refreshSelection();
}
function refreshSelection() {
  $$('.annot.sel').forEach((e) => { e.classList.remove('sel'); e.querySelectorAll('.handle,.annot-del').forEach((h) => h.remove()); });
  if (!S.sel) return;
  const el = $(`.annot[data-id="${S.sel}"]`); const a = annotById(S.sel); if (!el || !a) return;
  el.classList.add('sel');
  if (a.type === 'line' || a.type === 'arrow') {
    const b = bbox(a), pad = a.width * 2 + 6, z = S.zoom;
    [['p1', a.x1, a.y1], ['p2', a.x2, a.y2]].forEach(([c, x, y]) => {
      const h = document.createElement('div'); h.className = 'handle ' + c;
      Object.assign(h.style, { left: (x - b.x + pad) * z - 6 + 'px', top: (y - b.y + pad) * z - 6 + 'px' }); el.appendChild(h);
    });
  } else if (a.type !== 'note') { const h = document.createElement('div'); h.className = 'handle br'; el.appendChild(h); }
  const del = document.createElement('button'); del.className = 'annot-del'; del.title = 'Delete'; del.innerHTML = icon('x');
  del.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); deleteSelected(); });
  el.appendChild(del);
}
function select(id) { if (S.sel !== id) { S.sel = id; refreshSelection(); } updateProps(); }
function deselect() { if (S.sel) { S.sel = null; refreshSelection(); updateProps(); } }
function deleteSelected() {
  if (!S.sel) return; const a = annotById(S.sel); if (!a) return;
  if (editing?.id === a.id) { editing = null; }
  const before = snap(); S.annots = S.annots.filter((x) => x.id !== a.id); S.sel = null; commit(before);
  renderOverlay(pageOfAnnot(a) || { id: a.pageId }); updateProps(); if (S.tool === 'edittext') renderTextLayer(pageOfAnnot(a));
}
function addAnnot(a, before) {
  S.annots.push(a); if (before !== undefined) commit(before);
  updateAnnotEl(a);
}

/* ------------------------------------------------------------------ annotations: interaction */
function evtPt(e, el) { const r = el.getBoundingClientRect(); return { x: (e.clientX - r.left) / S.zoom, y: (e.clientY - r.top) / S.zoom }; }

function onAnnotDown(e, id, el) {
  if (S.placing || e.button !== 0) return;
  const a = annotById(id); if (!a) return;
  if (!['select', 'text', 'date', 'note'].includes(S.tool)) return;
  e.stopPropagation();
  if (editing?.id === id) return; // clicking inside the active text editor
  finishEdit();
  const wasSel = S.sel === id;
  select(id);
  const h = e.target.closest('.handle');
  const pe = pageEls.get(a.pageId); const start = evtPt(e, pe.overlay);
  const orig = JSON.parse(JSON.stringify(a)); const ob = bbox(orig); const before = snap();
  let moved = false;
  const mv = (ev) => {
    const pt = evtPt(ev, pe.overlay); const dx = pt.x - start.x, dy = pt.y - start.y;
    if (!moved && Math.hypot(dx, dy) * S.zoom < 3) return; moved = true;
    if (h && h.classList.contains('br')) {
      let w = Math.max(4, ob.w + dx), hh = Math.max(4, ob.h + dy);
      if (a.type === 'image' || a.type === 'text' || ev.shiftKey) { const r = ob.h / ob.w; if (Math.abs(dx) > Math.abs(dy)) hh = w * r; else w = hh / r; }
      scaleTo(a, orig, ob, { x: ob.x, y: ob.y, w, h: hh });
    } else if (h && h.classList.contains('p1')) { a.x1 = orig.x1 + dx; a.y1 = orig.y1 + dy; }
    else if (h && h.classList.contains('p2')) { a.x2 = orig.x2 + dx; a.y2 = orig.y2 + dy; }
    else { Object.assign(a, JSON.parse(JSON.stringify(orig))); translate(a, dx, dy); }
    if (a.type === 'text' && !h) applyTextStyle($(`.annot[data-id="${a.id}"]`), a); else updateAnnotEl(a);
  };
  const up = () => {
    window.removeEventListener('pointermove', mv);
    if (moved) { commit(before); updateAnnotEl(a); }
    else if (a.type === 'text' && (wasSel || S.tool === 'text')) startEdit(a.id);
    else if (a.type === 'note') openNote(a.id);
  };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up, { once: true });
}

