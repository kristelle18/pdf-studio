/* ------------------------------------------------------------------ tools & properties */
function setTool(t) {
  finishEdit();
  if (S.placing && t !== S.tool) stopPlacing();
  S.tool = t;
  $$('#toolButtons .tool').forEach((b) => b.classList.toggle('active', b.dataset.tool === t));
  viewer.className = 'viewer tool-' + t + (S.placing ? ' placing' : '');
  const drawing = ['highlight', 'rect', 'ellipse', 'line', 'arrow', 'draw', 'whiteout', 'redact'].includes(t);
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

/* stamps */
function stampCanvas(kind, text, color) {
  const c = document.createElement('canvas'); const ctx = c.getContext('2d');
  if (kind === 'check' || kind === 'cross' || kind === 'dot') {
    c.width = c.height = 128; ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = 16; ctx.lineCap = ctx.lineJoin = 'round';
    if (kind === 'check') { ctx.beginPath(); ctx.moveTo(18, 68); ctx.lineTo(50, 102); ctx.lineTo(110, 26); ctx.stroke(); }
    if (kind === 'cross') { ctx.beginPath(); ctx.moveTo(24, 24); ctx.lineTo(104, 104); ctx.moveTo(104, 24); ctx.lineTo(24, 104); ctx.stroke(); }
    if (kind === 'dot') { ctx.beginPath(); ctx.arc(64, 64, 34, 0, 7); ctx.fill(); }
    return c;
  }
  const fs = 64, sub = kind === 'dated' ? new Date().toLocaleDateString() : '';
  ctx.font = `bold ${fs}px Arial`; const tw = ctx.measureText(text).width; ctx.font = `bold 30px Arial`; const sw = ctx.measureText(sub).width;
  c.width = Math.ceil(Math.max(tw, sw) + 72); c.height = sub ? 150 : 110;
  ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = 7; ctx.globalAlpha = 0.9;
  const r = 18, w = c.width - 8, h = c.height - 8; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(4, 4, w, h, r) : ctx.rect(4, 4, w, h); ctx.stroke();
  ctx.lineWidth = 2.5; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(13, 13, w - 18, h - 18, r - 8) : ctx.rect(13, 13, w - 18, h - 18); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `bold ${fs}px Arial`; ctx.fillText(text, c.width / 2, sub ? 62 : c.height / 2 + 3);
  if (sub) { ctx.font = 'bold 30px Arial'; ctx.fillText(sub, c.width / 2, 112); }
  return c;
}
const STAMPS = [['APPROVED', '#15803d'], ['REJECTED', '#b91c1c'], ['DRAFT', '#1d4ed8'], ['CONFIDENTIAL', '#b91c1c'], ['FINAL', '#15803d'], ['PAID', '#15803d'], ['RECEIVED', '#1d4ed8'], ['FOR REVIEW', '#c2410c'], ['VOID', '#b91c1c'], ['COPY', '#6b7280']];
async function openStamps() {
  const items = [...STAMPS.map(([t, c]) => ({ kind: 'text', text: t, color: c })), ...[['check', '#15803d'], ['cross', '#b91c1c'], ['dot', '#111827']].map(([k, c]) => ({ kind: k, color: c }))];
  const urls = items.map((it) => stampCanvas(it.kind, it.text, it.color));
  const res = await modal({
    title: 'Stamps & marks', wide: true,
    body: `<div class="stamps">${urls.map((c, i) => `<button data-i="${i}"><img src="${c.toDataURL()}"></button>`).join('')}</div>
      <h3 style="font-size:14px;margin:18px 0 8px">Custom stamp</h3>
      <div class="row2"><label class="f">Text<input type="text" id="stTxt" value="REVIEWED"></label><label class="f">Color<select id="stCol"><option value="#b91c1c">Red</option><option value="#15803d">Green</option><option value="#1d4ed8">Blue</option><option value="#111827">Black</option></select></label></div>
      <label class="check"><input type="checkbox" id="stDate" checked> Include today's date</label>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Use custom stamp', primary: true, onClick: (m) => { const t = m.querySelector('#stTxt').value.trim().toUpperCase(); if (!t) return false; return { c: stampCanvas(m.querySelector('#stDate').checked ? 'dated' : 'text', t, m.querySelector('#stCol').value), mark: false }; } }],
    onOpen: (m) => m.querySelectorAll('.stamps button').forEach((b) => b.onclick = () => { const i = +b.dataset.i; closeModal({ c: urls[i], mark: items[i].kind !== 'text' }); }),
  });
  if (!res) return;
  const id = addAsset(res.c.toDataURL('image/png'), 'png', res.c.width, res.c.height);
  startPlacing(id, res.mark ? 16 : Math.min(170, res.c.width * 0.45), res.mark ? 'mark' : 'stamp');
}

/* ------------------------------------------------------------------ thumbnails & page organization */
const thumbCache = new Map();
const thumbIO = new IntersectionObserver((ents) => ents.forEach((en) => { if (en.isIntersecting) { thumbIO.unobserve(en.target); renderThumb(en.target); } }), { root: $('#thumbs'), rootMargin: '300px' });
function renderThumbs() {
  const box = $('#thumbs'); box.innerHTML = '';
  S.selPages = new Set([...S.selPages].filter((id) => S.pages.some((p) => p.id === id)));
  S.pages.forEach((p, i) => {
    const t = document.createElement('div'); t.className = 'thumb' + (i === S.current ? ' current' : '') + (S.selPages.has(p.id) ? ' selected' : '');
    t.dataset.id = p.id; t.draggable = true;
    const d = dispSize(p); const tw = 140, th = Math.round(tw * d.h / d.w);
    t.innerHTML = `<div class="tcanvas"><img alt="Page ${i + 1}" width="${tw}" height="${Math.min(th, 200)}" style="width:${th > 200 ? Math.round(200 * d.w / d.h) : tw}px;height:${Math.min(th, 200)}px"></div><span class="tnum">${i + 1}</span>
      <input type="checkbox" class="tchk" title="Select page" ${S.selPages.has(p.id) ? 'checked' : ''}>
      <div class="tbar"><button data-a="rotl" title="Rotate left">${icon('rotl')}</button><button data-a="rotr" title="Rotate right">${icon('rotr')}</button><button data-a="dup" title="Duplicate">${icon('copy')}</button><button data-a="del" title="Delete">${icon('trash')}</button></div>`;
    t.addEventListener('click', (e) => {
      if (e.target.closest('.tbar')) { const a = e.target.closest('button')?.dataset.a; if (a === 'rotl') rotatePages([p.id], -90); if (a === 'rotr') rotatePages([p.id], 90); if (a === 'dup') duplicatePage(p.id); if (a === 'del') deletePages([p.id]); return; }
      if (e.target.classList.contains('tchk') || e.ctrlKey || e.metaKey) { if (!e.target.classList.contains('tchk')) e.preventDefault(); S.selPages.has(p.id) ? S.selPages.delete(p.id) : S.selPages.add(p.id); t.classList.toggle('selected', S.selPages.has(p.id)); t.querySelector('.tchk').checked = S.selPages.has(p.id); return; }
      scrollToPage(S.pages.indexOf(p));
    });
    t.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-page', p.id); e.dataTransfer.effectAllowed = 'move'; t.classList.add('dragging'); });
    t.addEventListener('dragend', () => t.classList.remove('dragging'));
    t.addEventListener('dragover', (e) => { if (!e.dataTransfer.types.includes('text/x-page')) return; e.preventDefault(); const r = t.getBoundingClientRect(); const after = e.clientY > r.top + r.height / 2; t.classList.toggle('drag-over-after', after); t.classList.toggle('drag-over-before', !after); });
    t.addEventListener('dragleave', () => t.classList.remove('drag-over-after', 'drag-over-before'));
    t.addEventListener('drop', (e) => {
      const id = e.dataTransfer.getData('text/x-page'); if (!id) return; e.preventDefault(); e.stopPropagation();
      const after = t.classList.contains('drag-over-after'); t.classList.remove('drag-over-after', 'drag-over-before');
      if (id === p.id) return; const before = snap();
      const moving = S.pages.find((x) => x.id === id); S.pages = S.pages.filter((x) => x.id !== id);
      let idx = S.pages.findIndex((x) => x.id === p.id) + (after ? 1 : 0); S.pages.splice(idx, 0, moving);
      commit(before); rebuildViewer(); renderThumbs();
    });
    box.appendChild(t); thumbIO.observe(t);
  });
}
async function renderThumb(t) {
  const p = S.pages.find((x) => x.id === t.dataset.id); if (!p) return;
  const key = `${p.srcId}:${p.index}:${totalRot(p)}`; const img = t.querySelector('img');
  if (!thumbCache.has(key)) thumbCache.set(key, (async () => {
    const page = await S.sources.get(p.srcId).pdf.getPage(p.index + 1);
    const vp0 = page.getViewport({ scale: 1, rotation: totalRot(p) }); const vp = page.getViewport({ scale: 280 / vp0.width, rotation: totalRot(p) });
    const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
    return c.toDataURL('image/jpeg', 0.75);
  })());
  img.src = await thumbCache.get(key);
}
function rotateAnnotsForPage(p, delta) {
  const d = dispSize(p); // size before rotation
  const map = delta === 90 ? (u, v) => [d.h - v, u] : delta === -90 ? (u, v) => [v, d.w - u] : (u, v) => [d.w - u, d.h - v];
  for (const a of annotsOf(p.id)) {
    if (a.type === 'line' || a.type === 'arrow') { [a.x1, a.y1] = map(a.x1, a.y1); [a.x2, a.y2] = map(a.x2, a.y2); }
    else if (a.type === 'ink') a.points = a.points.map(([x, y]) => map(x, y));
    else {
      const b = bbox(a); const [cx, cy] = map(b.x + b.w / 2, b.y + b.h / 2);
      const swap = ['rect', 'ellipse', 'highlight', 'whiteout', 'redact'].includes(a.type) && Math.abs(delta) === 90;
      const w = swap ? b.h : b.w, h = swap ? b.w : b.h;
      a.x = cx - w / 2; a.y = cy - h / 2; if (swap) { a.w = w; a.h = h; }
    }
  }
}
function rotatePages(ids, delta) {
  if (!ids.length) return toast('Select pages first (tick the boxes on the thumbnails).');
  finishEdit(); const before = snap();
  S.pages.filter((p) => ids.includes(p.id)).forEach((p) => { rotateAnnotsForPage(p, delta); p.rot = ((p.rot + delta) % 360 + 360) % 360; });
  commit(before); if (S.zoomMode === 'fit') computeZoom(); rebuildViewer(); renderThumbs();
}
function deletePages(ids) {
  if (!ids.length) return toast('Select pages first (tick the boxes on the thumbnails).');
  if (ids.length >= S.pages.length) return toast('A PDF needs at least one page.', true);
  finishEdit(); const before = snap();
  S.pages = S.pages.filter((p) => !ids.includes(p.id)); S.annots = S.annots.filter((a) => !ids.includes(a.pageId));
  ids.forEach((id) => S.selPages.delete(id)); commit(before); rebuildViewer(); renderThumbs();
  toast(`Deleted ${ids.length} page${ids.length > 1 ? 's' : ''}.`);
}
function duplicatePage(id) {
  const before = snap(); const i = S.pages.findIndex((p) => p.id === id); const np = { ...S.pages[i], id: uid() };
  S.pages.splice(i + 1, 0, np);
  annotsOf(id).forEach((a) => S.annots.push({ ...JSON.parse(JSON.stringify(a)), id: uid(), pageId: np.id }));
  commit(before); rebuildViewer(); renderThumbs();
}
async function insertBlank(afterIndex) {
  const ref = S.pages[afterIndex] || S.pages[0]; const d = ref ? dispSize(ref) : { w: 595.28, h: 841.89 };
  const { pages } = await openPdfBytes(await blankPdfBytes(d.w, d.h), 'blank.pdf');
  const before = snap(); S.pages.splice(afterIndex + 1, 0, ...pages); commit(before); rebuildViewer(); renderThumbs(); scrollToPage(afterIndex + 1);
}
const selectedOrCurrent = () => S.selPages.size ? S.pages.filter((p) => S.selPages.has(p.id)).map((p) => p.id) : [S.pages[S.current]?.id].filter(Boolean);
$('#pgSelectAll').onclick = () => { if (S.selPages.size === S.pages.length) S.selPages.clear(); else S.pages.forEach((p) => S.selPages.add(p.id)); renderThumbs(); };
$('#pgRotL').onclick = () => rotatePages(selectedOrCurrent(), -90);
$('#pgRotR').onclick = () => rotatePages(selectedOrCurrent(), 90);
$('#pgBlank').onclick = () => insertBlank(S.current);
$('#pgDelete').onclick = async () => { const ids = selectedOrCurrent(); if (await askConfirm(`Delete ${ids.length} page${ids.length > 1 ? 's' : ''}?`, 'Delete')) deletePages(ids); };
$('#pgExtract').onclick = () => extractPages(selectedOrCurrent());
$('#btnSideToggle').onclick = () => { $('#sidebar').classList.add('hidden'); setTimeout(() => S.zoomMode === 'fit' && setZoom('fit')); };
$('#btnSideOpen').onclick = () => { $('#sidebar').classList.remove('hidden'); setTimeout(() => S.zoomMode === 'fit' && setZoom('fit')); };

