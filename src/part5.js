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
  const total = pages.length;
  for (let i = 0; i < outPages.length; i++) {
    const { pg, p, vp } = outPages[i];
    await drawAnnots(out, pg, vp, annotsOf(p.id), getFont, getImg);
    await drawDocOps(pg, vp, i, total, getFont);
  }
  const meta = S.docOps.meta;
  if (meta) { if (meta.title) out.setTitle(meta.title); if (meta.author) out.setAuthor(meta.author); if (meta.subject) out.setSubject(meta.subject); if (meta.keywords) out.setKeywords(meta.keywords.split(',').map((s) => s.trim()).filter(Boolean)); }
  out.setProducer('PDF Studio (pdf-lib)'); out.setModificationDate(new Date());
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
async function drawDocOps(pg, vp, i, total, getFont) {
  const wm = S.docOps.watermark, pn = S.docOps.pageNumbers;
  if (!(wm && wm.text) && !(pn && !(pn.skipFirst && i === 0))) return;
  const d = dispSize(vp);
  pg.pushOperators(L.pushGraphicsState(), L.concatTransformationMatrix(...matrixFor(vp)));
  if (wm && wm.text) {
    const f = await getFont('HelveticaBold'); const lines = wm.text.split('\n'); const ang = wm.angle * Math.PI / 180;
    lines.forEach((ln, k) => {
      const s = sanitize(f, ln); const tw = f.widthOfTextAtSize(s, wm.size); const th = wm.size * 0.7;
      const off = (k - (lines.length - 1) / 2) * wm.size; // stack lines perpendicular to the text direction
      const cx = d.w / 2 + Math.sin(ang) * off, cy = d.h / 2 - Math.cos(ang) * off;
      pg.drawText(s, { x: cx - (Math.cos(ang) * tw / 2 - Math.sin(ang) * th / 2), y: cy - (Math.sin(ang) * tw / 2 + Math.cos(ang) * th / 2), size: wm.size, font: f, color: hex2rgb(wm.color), opacity: wm.opacity, rotate: L.degrees(wm.angle) });
    });
  }
  if (pn && !(pn.skipFirst && i === 0)) {
    const f = await getFont('Helvetica'); const s = sanitize(f, pn.format.replace(/\{n\}/g, i + pn.start).replace(/\{total\}/g, total + pn.start - 1));
    const tw = f.widthOfTextAtSize(s, pn.size); const m = pn.margin;
    const x = pn.pos[1] === 'l' ? m : pn.pos[1] === 'r' ? d.w - m - tw : (d.w - tw) / 2;
    const y = pn.pos[0] === 'b' ? m : d.h - m - pn.size * 0.95;
    pg.drawText(s, { x, y, size: pn.size, font: f, color: hex2rgb(pn.color) });
  }
  pg.pushOperators(L.popGraphicsState());
}

async function doSave(opts = {}, name) {
  if (S.annots.some((a) => a.type === 'redact')) toast('Pages with redactions are flattened to images so hidden content is truly removed.', false, 5000);
  busy(true, 'Building PDF…');
  try { const bytes = await buildPdf(opts); busy(false); if (await download(bytes, name || S.fileName)) { S.dirty = false; toast(`Saved ${name || S.fileName} (${fmtBytes(bytes.length)})`); } return bytes; }
  catch (e) { console.error(e); toast('Could not save: ' + (e?.message || e), true, 7000); }
  finally { busy(false); }
}
async function extractPages(ids) {
  if (!ids.length) return;
  await doSave({ pageIds: ids }, `${baseName()}-pages.pdf`);
}
async function exportImages() {
  const r = await modal({
    title: 'Save pages as images', body: `<div class="row2"><label class="f">Format<select id="imF"><option value="png">PNG (sharp)</option><option value="jpeg">JPG (smaller)</option></select></label>
    <label class="f">Resolution<select id="imD"><option value="96">96 DPI (screen)</option><option value="150" selected>150 DPI</option><option value="300">300 DPI (print)</option></select></label></div>
    <label class="f">Pages (blank = all)<input type="text" id="imR" placeholder="e.g. 1-3, 5"></label>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Export', primary: true, onClick: (m) => ({ f: m.querySelector('#imF').value, dpi: +m.querySelector('#imD').value, r: m.querySelector('#imR').value }) }],
  });
  if (!r) return;
  let idx; try { idx = r.r.trim() ? parseRanges(r.r, S.pages.length).flat() : S.pages.map((_, i) => i); } catch (e) { return toast(e.message, true); }
  busy(true, 'Rendering pages…');
  try {
    const bytes = await buildPdf(); const pdf = await pdfjsLib.getDocument({ ...PDF_OPTS, data: bytes }).promise;
    const zip = new JSZip(); const ext = r.f === 'png' ? 'png' : 'jpg'; let single = null;
    for (const i of idx) {
      busy(true, `Rendering page ${i + 1}…`);
      const page = await pdf.getPage(i + 1); const vp = page.getViewport({ scale: r.dpi / 72 });
      const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob = await new Promise((res) => c.toBlob(res, 'image/' + r.f, 0.9));
      const name = `${baseName()}-page-${String(i + 1).padStart(3, '0')}.${ext}`; zip.file(name, blob); single = { blob, name };
    }
    pdf.destroy();
    if (idx.length === 1) download(single.blob, single.name);
    else download(await zip.generateAsync({ type: 'blob' }), `${baseName()}-images.zip`, 'application/zip');
  } catch (e) { console.error(e); toast('Export failed: ' + e.message, true); } finally { busy(false); }
}
async function printDoc() {
  if (IN_CLAUDE) { toast('Printing isn\'t available inside Claude. Download the PDF and print it from your PDF viewer.', false, 6000); return; }
  busy(true, 'Preparing to print…');
  try {
    const bytes = await buildPdf(); const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;border:0;right:0;bottom:0'; f.src = url; document.body.appendChild(f);
    f.onload = () => { setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch { window.open(url); } }, 300); };
    setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 120000);
  } catch (e) { toast('Print failed: ' + e.message, true); } finally { busy(false); }
}

/* ------------------------------------------------------------------ tools dialogs */
async function splitDialog() {
  const n = S.pages.length;
  const r = await modal({
    title: 'Split PDF', body: `<label class="f">How to split<select id="spM"><option value="every">Every N pages</option><option value="ranges">By custom ranges</option><option value="each">Every page into its own file</option></select></label>
      <label class="f" id="spNL">Pages per file<input type="number" id="spN" min="1" max="${n}" value="${Math.max(1, Math.ceil(n / 2))}"></label>
      <label class="f" id="spRL" hidden>Ranges — each range becomes a file<input type="text" id="spR" placeholder="e.g. 1-3, 4-6, 7-end"></label>
      <p class="note">The document has ${n} pages. Files are downloaded together in a ZIP.</p>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Split', primary: true, onClick: (m) => {
      const mode = m.querySelector('#spM').value;
      try {
        if (mode === 'each') return S.pages.map((_, i) => [i]);
        if (mode === 'every') { const k = clamp(+m.querySelector('#spN').value || 1, 1, n); const g = []; for (let i = 0; i < n; i += k) g.push(Array.from({ length: Math.min(k, n - i) }, (_, j) => i + j)); return g; }
        return parseRanges(m.querySelector('#spR').value, n);
      } catch (e) { toast(e.message, true); return false; }
    } }],
    onOpen: (m) => m.querySelector('#spM').onchange = (e) => { m.querySelector('#spNL').hidden = e.target.value !== 'every'; m.querySelector('#spRL').hidden = e.target.value !== 'ranges'; },
  });
  if (!r) return;
  busy(true, 'Splitting…');
  try {
    const zip = new JSZip();
    for (let k = 0; k < r.length; k++) {
      busy(true, `Creating file ${k + 1} of ${r.length}…`);
      const g = r[k]; const bytes = await buildPdf({ pageIds: g.map((i) => S.pages[i].id) });
      zip.file(`${baseName()}-${g.length === 1 ? 'page-' + (g[0] + 1) : `pages-${g[0] + 1}-${g[g.length - 1] + 1}`}.pdf`, bytes);
    }
    download(await zip.generateAsync({ type: 'blob' }), `${baseName()}-split.zip`, 'application/zip'); toast(`Split into ${r.length} files.`);
  } catch (e) { console.error(e); toast('Split failed: ' + e.message, true); } finally { busy(false); }
}
async function rangeDialog(title, action, label) {
  const r = await modal({ title, body: `<label class="f">Pages<input type="text" id="rgR" placeholder="e.g. 1, 3-5, 8-end"></label><p class="note">The document has ${S.pages.length} pages.</p>`, actions: [{ label: 'Cancel', value: null }, { label, primary: true, onClick: (m) => { try { return parseRanges(m.querySelector('#rgR').value, S.pages.length).flat(); } catch (e) { toast(e.message, true); return false; } } }] });
  if (r) action([...new Set(r)].map((i) => S.pages[i].id));
}
async function pageNumbersDialog() {
  const cur = S.docOps.pageNumbers || { format: 'Page {n} of {total}', pos: 'bc', size: 10, margin: 28, start: 1, color: '#374151', skipFirst: false };
  const r = await modal({
    title: 'Add page numbers', body: `<label class="f">Format — {n} = page number, {total} = page count<input type="text" id="pnF" value="${esc(cur.format)}"></label>
      <div class="row2"><label class="f">Position<select id="pnP">${[['bc', 'Bottom center'], ['br', 'Bottom right'], ['bl', 'Bottom left'], ['tc', 'Top center'], ['tr', 'Top right'], ['tl', 'Top left']].map(([v, t]) => `<option value="${v}" ${v === cur.pos ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="f">Start at<input type="number" id="pnS" value="${cur.start}" min="0"></label>
      <label class="f">Font size<input type="number" id="pnZ" value="${cur.size}" min="5" max="48"></label>
      <label class="f">Margin (pt)<input type="number" id="pnM" value="${cur.margin}" min="4" max="144"></label></div>
      <label class="check"><input type="checkbox" id="pnK" ${cur.skipFirst ? 'checked' : ''}> Skip the first page (cover)</label>`,
    actions: [...(S.docOps.pageNumbers ? [{ label: 'Remove', value: 'remove' }] : []), { label: 'Cancel', value: null }, { label: 'Apply', primary: true, onClick: (m) => ({ format: m.querySelector('#pnF').value || '{n}', pos: m.querySelector('#pnP').value, start: +m.querySelector('#pnS').value || 1, size: +m.querySelector('#pnZ').value || 10, margin: +m.querySelector('#pnM').value || 28, color: cur.color, skipFirst: m.querySelector('#pnK').checked }) }],
  });
  if (!r) return; const before = snap(); S.docOps.pageNumbers = r === 'remove' ? null : r; commit(before); rebuildViewer();
  toast(r === 'remove' ? 'Page numbers removed.' : 'Page numbers added — they are shown as a preview and written when you save.');
}
async function watermarkDialog() {
  const cur = S.docOps.watermark || { text: 'CONFIDENTIAL', size: 60, color: '#dc2626', opacity: 0.18, angle: 45 };
  const r = await modal({
    title: 'Add watermark', body: `<label class="f">Text<input type="text" id="wmT" value="${esc(cur.text)}"></label>
      <div class="row2"><label class="f">Font size<input type="number" id="wmS" value="${cur.size}" min="8" max="300"></label><label class="f">Angle (°)<input type="number" id="wmA" value="${cur.angle}" min="-90" max="90"></label>
      <label class="f">Color<input type="color" id="wmC" value="${cur.color}" style="height:36px"></label><label class="f">Opacity<input type="range" id="wmO" min="0.05" max="1" step="0.05" value="${cur.opacity}"></label></div>`,
    actions: [...(S.docOps.watermark ? [{ label: 'Remove', value: 'remove' }] : []), { label: 'Cancel', value: null }, { label: 'Apply', primary: true, onClick: (m) => ({ text: m.querySelector('#wmT').value, size: +m.querySelector('#wmS').value || 60, angle: +m.querySelector('#wmA').value || 0, color: m.querySelector('#wmC').value, opacity: +m.querySelector('#wmO').value }) }],
  });
  if (!r) return; const before = snap(); S.docOps.watermark = r === 'remove' || !r.text ? null : r; commit(before); rebuildViewer();
}
async function propertiesDialog() {
  let info = {}; const base = S.sources.get(S.pages[0].srcId);
  try { info = (await base.pdf.getMetadata()).info || {}; } catch { }
  const cur = S.docOps.meta || { title: info.Title || '', author: info.Author || '', subject: info.Subject || '', keywords: info.Keywords || '' };
  const r = await modal({
    title: 'Document properties', body: `<label class="f">File name<input type="text" id="dpN" value="${esc(S.fileName)}"></label>
      <label class="f">Title<input type="text" id="dpT" value="${esc(cur.title)}"></label><label class="f">Author<input type="text" id="dpA" value="${esc(cur.author)}"></label>
      <label class="f">Subject<input type="text" id="dpS" value="${esc(cur.subject)}"></label><label class="f">Keywords (comma-separated)<input type="text" id="dpK" value="${esc(cur.keywords)}"></label>
      <p class="note">${S.pages.length} pages · ${[...new Set(S.pages.map((p) => p.srcId))].length} source file(s) · PDF ${esc(info.PDFFormatVersion || '')} ${info.Producer ? '· produced by ' + esc(info.Producer) : ''}</p>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Save', primary: true, onClick: (m) => ({ name: m.querySelector('#dpN').value.trim(), title: m.querySelector('#dpT').value, author: m.querySelector('#dpA').value, subject: m.querySelector('#dpS').value, keywords: m.querySelector('#dpK').value }) }],
  });
  if (!r) return; if (r.name) { S.fileName = /\.pdf$/i.test(r.name) ? r.name : r.name + '.pdf'; $('#statusFile').textContent = S.fileName; }
  const before = snap(); S.docOps.meta = { title: r.title, author: r.author, subject: r.subject, keywords: r.keywords }; commit(before);
}
async function compressDialog() {
  const r = await modal({
    title: 'Reduce file size', body: `<label class="f">Quality<select id="cq"><option value="72,0.6">Smallest — 72 DPI (screen only)</option><option value="110,0.7" selected>Balanced — 110 DPI</option><option value="150,0.8">Good — 150 DPI</option><option value="200,0.85">High — 200 DPI</option></select></label>
      <p class="note">Each page is converted to a compressed image. This works best for scanned documents and image-heavy PDFs. Text will no longer be selectable or searchable, and form fields become flat.</p>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Compress & download', primary: true, onClick: (m) => m.querySelector('#cq').value.split(',').map(Number) }],
  });
  if (!r) return;
  const orig = [...new Set(S.pages.map((p) => p.srcId))].reduce((n, id) => n + S.sources.get(id).bytes.length, 0);
  const bytes = await doSave({ raster: { dpi: r[0], quality: r[1] } }, `${baseName()}-compressed.pdf`);
  if (bytes) toast(bytes.length < orig ? `Original ${fmtBytes(orig)} → compressed ${fmtBytes(bytes.length)}` : `This PDF is already compact (${fmtBytes(orig)}); compression can't make it smaller. Use the normal Download instead.`, false, 7000);
}
function formInfo() {
  if (!S.fields.length) return toast('This PDF has no fillable form fields. Use the Text tool to type anywhere on the page.', false, 5000);
  setTool('select'); const f = S.fields[0]; const pi = S.pages.findIndex((p) => p.srcId === f.srcId && p.index === f.pageIndex);
  if (pi >= 0) scrollToPage(pi);
  setTimeout(() => $('.ff')?.focus(), 200);
  toast(`${new Set(S.fields.map((x) => x.key)).size} form fields found. Click a highlighted field to fill it in.`);
}
async function reversePages() { const before = snap(); S.pages.reverse(); commit(before); rebuildViewer(); renderThumbs(); toast('Page order reversed.'); }

