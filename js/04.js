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
  if (p.crop) { const c = p.crop; const [cx, cy] = map(c.x + c.w / 2, c.y + c.h / 2); const q = Math.abs(delta) === 90; const w = q ? c.h : c.w, h = q ? c.w : c.h; p.crop = { x: cx - w / 2, y: cy - h / 2, w, h }; }
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

function parseRanges(str, total) {
  const groups = [];
  for (const part of str.split(/[,;]+/)) {
    const s = part.trim().toLowerCase(); if (!s) continue;
    const m = s.match(/^(\d+|end)?\s*(?:-\s*(\d+|end)?)?$/); if (!m) throw new Error(`"${part.trim()}" is not a valid page range`);
    const num = (x, d) => x === undefined ? d : x === 'end' ? total : +x;
    const a = num(m[1], 1), b = s.includes('-') ? num(m[2], total) : a;
    if (a < 1 || b > total || a > b) throw new Error(`"${part.trim()}" is outside 1–${total}`);
    groups.push(Array.from({ length: b - a + 1 }, (_, i) => a + i - 1));
  }
  if (!groups.length) throw new Error('Enter at least one page');
  return groups;
}

/* ------------------------------------------------------------------ export engine */
async function rasterPage(pdf, p, dpi, quality, redacts) {
  const page = await pdf.getPage(p.index + 1);
  const vp = page.getViewport({ scale: dpi / 72, rotation: totalRot(p) });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  const s = dpi / 72; ctx.fillStyle = '#000'; for (const r of redacts) ctx.fillRect(r.x * s, r.y * s, r.w * s, r.h * s);
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', quality));
  return new Uint8Array(await blob.arrayBuffer());
}
async function buildPdf({ pageIds = null, flatten = false, raster = null } = {}) {
  finishEdit();
  const pages = pageIds ? S.pages.filter((p) => pageIds.includes(p.id)) : S.pages.slice();
  const base = S.sources.get(pages[0].srcId);
  const redactPage = (p) => S.annots.some((a) => a.pageId === p.id && a.type === 'redact');
  const inPlace = !raster && !base.rasterOnly && pages.length === base.numPages && pages.every((p, i) => p.srcId === base.id && p.index === i && !redactPage(p));
  const libs = new Map();
  const getLib = async (src) => {
    if (!libs.has(src.id)) { const d = await L.PDFDocument.load(src.bytes, { updateMetadata: false }); applyForm(d, src.id, flatten || !inPlace); libs.set(src.id, d); }
    return libs.get(src.id);
  };
  const renderDocs = new Map();
  const getRenderDoc = async (src) => {
    if (src.rasterOnly || !formChanged(src.id)) return src.pdf;
    if (!renderDocs.has(src.id)) { const d = await L.PDFDocument.load(src.bytes, { updateMetadata: false }); applyForm(d, src.id, true); renderDocs.set(src.id, await pdfjsLib.getDocument({ ...PDF_OPTS, data: await d.save() }).promise); }
    return renderDocs.get(src.id);
  };

  let out; const outPages = [];
  if (inPlace) {
    out = await getLib(base);
    out.getPages().forEach((pg, i) => { pg.setRotation(L.degrees(totalRot(pages[i]))); outPages.push({ pg, p: pages[i], vp: pages[i] }); });
  } else {
    out = await L.PDFDocument.create();
    // copy vector pages per source in batches (duplicates get their own copy)
    const plan = pages.map((p) => ({ p, raster: !!raster || S.sources.get(p.srcId).rasterOnly || redactPage(p) }));
    const copied = new Map(); // plan index -> PDFPage
    const bySrc = new Map(); plan.forEach((it, i) => { if (!it.raster) { if (!bySrc.has(it.p.srcId)) bySrc.set(it.p.srcId, []); bySrc.get(it.p.srcId).push(i); } });
    for (const [srcId, idxs] of bySrc) {
      const lib = await getLib(S.sources.get(srcId)); let rest = idxs;
      while (rest.length) {
        const seen = new Set(), batch = [], later = [];
        rest.forEach((i) => (seen.has(plan[i].p.index) ? later : (seen.add(plan[i].p.index), batch)).push(i));
        const cps = await out.copyPages(lib, batch.map((i) => plan[i].p.index)); batch.forEach((i, k) => copied.set(i, cps[k])); rest = later;
      }
    }
    for (let i = 0; i < plan.length; i++) {
      const { p } = plan[i];
      if (plan[i].raster) {
        busy(true, `Processing page ${i + 1} of ${plan.length}…`);
        const src = S.sources.get(p.srcId); const d = dispSize(p);
        const dpi = raster?.dpi || 150, q = raster?.quality || 0.85;
        const jpg = await rasterPage(await getRenderDoc(src), p, dpi, q, S.annots.filter((a) => a.pageId === p.id && a.type === 'redact'));
        const img = await out.embedJpg(jpg); const pg = out.addPage([d.w, d.h]);
        pg.drawImage(img, { x: 0, y: 0, width: d.w, height: d.h });
        outPages.push({ pg, p, vp: { x0: 0, y0: 0, w: d.w, h: d.h, baseRot: 0, rot: 0 } });
      } else {
        const pg = out.addPage(copied.get(i)); pg.setRotation(L.degrees(totalRot(p))); outPages.push({ pg, p, vp: p });
      }
    }
  }

  const fonts = {}; const getFont = async (k) => (fonts[k] ||= await out.embedFont(L.StandardFonts[k]));
  const origFonts = {}; getOrigFont = async (pf) => {
    if (!window.fontkit) return null;
    if (!(pf.key in origFonts)) { try { out.registerFontkit(window.fontkit); origFonts[pf.key] = await out.embedFont(pf.bytes, { subset: false }); } catch (e) { console.warn('embed original font failed', e); origFonts[pf.key] = null; } }
    return origFonts[pf.key];
  };
  const imgs = {}; const getImg = async (id) => (imgs[id] ||= await (S.assets[id].type === 'jpg' ? out.embedJpg(dataUrlBytes(S.assets[id].dataUrl)) : out.embedPng(dataUrlBytes(S.assets[id].dataUrl))));
  const total = pages.length; const san = S.docOps.sanitize; const pageMap = new Map();
  for (let i = 0; i < outPages.length; i++) {
    const { pg, p, vp } = outPages[i];
    if (san) sanitizePage(pg, san);
    await drawAnnots(out, pg, vp, annotsOf(p.id), getFont, getImg);
    await drawDocOps(pg, vp, i, total, getFont, p);
    await drawHeaderFooter(pg, vp, i, total, getFont, p);
    await drawOcrLayer(pg, p, vp, getFont);
    if (!flatten) createFormFields(out, pg, vp, annotsOf(p.id));
    const mapY = applyCropResize(out, pg, p, vp);
    pageMap.set(p.id, { pg, p, vp, mapY });
  }
  if (S.bookmarks.length || inPlace) writeOutline(out, pageMap);
  const meta = S.docOps.meta;
  if (meta) { if (meta.title) out.setTitle(meta.title); if (meta.author) out.setAuthor(meta.author); if (meta.subject) out.setSubject(meta.subject); if (meta.keywords) out.setKeywords(meta.keywords.split(',').map((s) => s.trim()).filter(Boolean)); }
  if (!san?.meta) { out.setProducer('PDF Studio (pdf-lib)'); out.setModificationDate(new Date()); }
  if (san) sanitizeDoc(out, san);
  for (const d of renderDocs.values()) safe(() => d.destroy());
  return out.save();
}
const sanitizeCache = new WeakMap();
function sanitize(font, s) {
  s = s.replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/\t/g, '    ');
  let m = sanitizeCache.get(font); if (!m) sanitizeCache.set(font, (m = new Map()));
  let r = '';
  for (const ch of s) { if (!m.has(ch)) m.set(ch, safe(() => (font.encodeText(ch), true), false)); r += m.get(ch) ? ch : '?'; }
  return r;
}
let getOrigFont = async () => null;
async function drawAnnots(out, pg, vp, list, getFont, getImg) {
  if (!list.length) return;
  const Hd = dispSize(vp).h; const notes = [];
  pg.pushOperators(L.pushGraphicsState(), L.concatTransformationMatrix(...matrixFor(vp)));
  for (const a of list) {
    const op = a.opacity ?? 1;
    switch (a.type) {
      case 'text': {
        const f = await getFont(fontKey(a.font, textBold(a), textItalic(a))); const sx = a.sx || 1;
        const pf = a.pdfFont && S.pdfFonts[a.pdfFont]; const of = pf?.bytes ? await getOrigFont(pf) : null;
        if (sx !== 1) pg.pushOperators(L.pushGraphicsState(), L.concatTransformationMatrix(sx, 0, 0, 1, a.x * (1 - sx), 0));
        const bl = textBaseline(a);
        a.text.split('\n').forEach((ln, i) => {
          const y = Hd - (a.y + a.size * (1.2 * i + bl)); const o = { size: a.size, color: hex2rgb(a.color), opacity: op };
          if (!of) { const s = sanitize(f, ln); if (s) pg.drawText(s, { ...o, x: a.x, y, font: f }); return; }
          // Characters the embedded (usually subset) font lacks fall back to the standard font, run by run.
          let x = a.x; const runs = [];
          for (const ch of ln) { const own = !!pf.fk?.hasGlyphForCodePoint(ch.codePointAt(0)) || (ch === ' ' && !!pf.fk?.hasGlyphForCodePoint(160)); const last = runs[runs.length - 1]; if (last && last.own === own) last.t += ch; else runs.push({ own, t: ch }); }
          for (const r of runs) {
            const font = r.own ? of : f; const t = r.own ? r.t : sanitize(f, r.t); if (!t) continue;
            try { pg.drawText(t, { ...o, x, y, font }); x += font.widthOfTextAtSize(t, a.size); }
            catch { const t2 = sanitize(f, r.t); pg.drawText(t2, { ...o, x, y, font: f }); x += f.widthOfTextAtSize(t2, a.size); }
          }
        });
        if (sx !== 1) pg.pushOperators(L.popGraphicsState());
        break;
      }
      case 'highlight': pg.drawRectangle({ x: a.x, y: Hd - a.y - a.h, width: a.w, height: a.h, color: hex2rgb(a.color), opacity: op, blendMode: L.BlendMode.Multiply }); break;
      case 'whiteout': pg.drawRectangle({ x: a.x, y: Hd - a.y - a.h, width: a.w, height: a.h, color: a.fill ? hex2rgb(a.fill) : L.rgb(1, 1, 1) }); break;
      case 'redact': pg.drawRectangle({ x: a.x, y: Hd - a.y - a.h, width: a.w, height: a.h, color: L.rgb(0, 0, 0) }); break;
      case 'rect': case 'ellipse': {
        const sw = a.width; const o = { opacity: op, borderOpacity: op };
        if (a.fill) o.color = hex2rgb(a.fill); if (sw > 0) { o.borderColor = hex2rgb(a.color); o.borderWidth = sw; }
        if (a.type === 'rect') pg.drawRectangle({ ...o, x: a.x + sw / 2, y: Hd - a.y - a.h + sw / 2, width: Math.max(0, a.w - sw), height: Math.max(0, a.h - sw) });
        else pg.drawEllipse({ ...o, x: a.x + a.w / 2, y: Hd - a.y - a.h / 2, xScale: Math.max(0.1, a.w / 2 - sw / 2), yScale: Math.max(0.1, a.h / 2 - sw / 2) });
        break;
      }
      case 'line': case 'arrow': {
        let ex = a.x2, ey = a.y2;
        if (a.type === 'arrow') { const h = arrowHead(a.x1, a.y1, a.x2, a.y2, a.width); ex = h.base[0]; ey = h.base[1]; pg.drawSvgPath(h.path, { x: 0, y: Hd, color: hex2rgb(a.color), opacity: op }); }
        pg.drawLine({ start: { x: a.x1, y: Hd - a.y1 }, end: { x: ex, y: Hd - ey }, thickness: a.width, color: hex2rgb(a.color), opacity: op, lineCap: L.LineCapStyle.Round });
        break;
      }
      case 'ink': pg.drawSvgPath(inkPath(a.points), { x: 0, y: Hd, borderColor: hex2rgb(a.color), borderWidth: a.width, borderOpacity: op, borderLineCap: L.LineCapStyle.Round }); break;
      case 'image': if (S.assets[a.assetId]) pg.drawImage(await getImg(a.assetId), { x: a.x, y: Hd - a.y - a.h, width: a.w, height: a.h, opacity: op }); break;
      case 'note': notes.push(a); break;
    }
  }
  pg.pushOperators(L.popGraphicsState());
  for (const a of notes) {
    const c1 = dispToPage(vp, a.x, a.y), c2 = dispToPage(vp, a.x + 20, a.y + 20);
    const dict = out.context.obj({
      Type: 'Annot', Subtype: 'Text', Rect: [Math.min(c1.x, c2.x), Math.min(c1.y, c2.y), Math.max(c1.x, c2.x), Math.max(c1.y, c2.y)],
      Contents: L.PDFHexString.fromText(a.text || ''), Name: 'Comment', C: [1, 0.8, 0.2], F: 4, Open: false, T: L.PDFHexString.fromText('Comment'),
      M: L.PDFString.fromDate(new Date()),
    });
    pg.node.addAnnot(out.context.register(dict));
  }
}
async function drawDocOps(pg, vp, i, total, getFont, p = vp) {
  const wm = S.docOps.watermark, pn = S.docOps.pageNumbers;
  if (!(wm && wm.text) && !(pn && !(pn.skipFirst && i === 0))) return;
  const d = dispSize(vp); const bx = contentBox(p); const H = d.h;
  pg.pushOperators(L.pushGraphicsState(), L.concatTransformationMatrix(...matrixFor(vp)));
  if (wm && wm.text) {
    const f = await getFont('HelveticaBold'); const lines = wm.text.split('\n'); const ang = wm.angle * Math.PI / 180;
    lines.forEach((ln, k) => {
      const s = sanitize(f, ln); const tw = f.widthOfTextAtSize(s, wm.size); const th = wm.size * 0.7;
      const off = (k - (lines.length - 1) / 2) * wm.size; // stack lines perpendicular to the text direction
      const cx = bx.x + bx.w / 2 + Math.sin(ang) * off, cy = H - (bx.y + bx.h / 2) - Math.cos(ang) * off;
      pg.drawText(s, { x: cx - (Math.cos(ang) * tw / 2 - Math.sin(ang) * th / 2), y: cy - (Math.sin(ang) * tw / 2 + Math.cos(ang) * th / 2), size: wm.size, font: f, color: hex2rgb(wm.color), opacity: wm.opacity, rotate: L.degrees(wm.angle) });
    });
  }
  if (pn && !(pn.skipFirst && i === 0)) {
    const f = await getFont('Helvetica'); const s = sanitize(f, pn.format.replace(/\{n\}/g, i + pn.start).replace(/\{total\}/g, total + pn.start - 1));
    const tw = f.widthOfTextAtSize(s, pn.size); const m = pn.margin;
    const x = pn.pos[1] === 'l' ? bx.x + m : pn.pos[1] === 'r' ? bx.x + bx.w - m - tw : bx.x + (bx.w - tw) / 2;
    const y = pn.pos[0] === 'b' ? H - (bx.y + bx.h) + m : H - bx.y - m - pn.size * 0.95;
    pg.drawText(s, { x, y, size: pn.size, font: f, color: hex2rgb(pn.color) });
  }
  pg.pushOperators(L.popGraphicsState());
}

