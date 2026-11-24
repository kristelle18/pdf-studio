/* ------------------------------------------------------------------ PDF to Word / Markdown / text */
async function exportTextDialog(fmt = 'docx') {
  const r = await modal({
    title: 'Convert PDF to Word or text', body: `<label class="f">Format<select id="etF"><option value="docx" ${fmt === 'docx' ? 'selected' : ''}>Word document (.docx)</option><option value="md" ${fmt === 'md' ? 'selected' : ''}>Markdown (.md)</option><option value="txt" ${fmt === 'txt' ? 'selected' : ''}>Plain text (.txt)</option></select></label>
      <label class="f">Pages (blank = all)<input type="text" id="etR" placeholder="e.g. 1-3, 5"></label>
      <p class="note">Text, headings, paragraphs and lists are kept. Complex layouts (columns, tables, images) are simplified. Scanned pages need OCR first.</p>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Convert', primary: true, onClick: (m) => { try { return { fmt: m.querySelector('#etF').value, idx: pagesFromRange(m.querySelector('#etR').value) }; } catch (e) { toast(e.message, true); return false; } } }],
  });
  if (!r) return; busy(true, 'Reading text…');
  try {
    const pages = []; for (const i of r.idx) { busy(true, `Reading page ${i + 1}…`); pages.push(await pageLines(S.pages[i])); }
    const body = bodySize(pages.flat()); const blocks = pages.map((ls) => linesToBlocks(ls, body));
    if (!blocks.some((b) => b.length)) { busy(false); return toast('No text found. If these are scanned pages, run OCR first.', true, 6000); }
    if (r.fmt === 'txt') download(new Blob([blocks.map((bs) => bs.map((b) => b.text).join('\n\n')).join('\n\n\f\n\n')], { type: 'text/plain' }), `${baseName()}.txt`, 'text/plain');
    else if (r.fmt === 'md') download(new Blob([blocks.map((bs) => bs.map((b) => (b.level ? '#'.repeat(b.level) + ' ' : '') + (b.bullet ? b.text.replace(/^([•●▪◦‣\-–*])\s+/, '- ') : b.text.replace(/^([#>*_`])/, '\\$1'))).join('\n\n')).join('\n\n---\n\n')], { type: 'text/markdown' }), `${baseName()}.md`, 'text/markdown');
    else download(await buildDocx(blocks, body), `${baseName()}.docx`);
    toast('Converted.');
  } catch (e) { console.error(e); toast('Conversion failed: ' + e.message, true); } finally { busy(false); }
}
async function buildDocx(pages, body) {
  const run = (t, size, bold) => `<w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${Math.round(size * 2)}"/><w:szCs w:val="${Math.round(size * 2)}"/></w:rPr><w:t xml:space="preserve">${xmlEsc(t)}</w:t></w:r>`;
  const bodySz = clamp(Math.round(body), 9, 14);
  const paras = pages.map((bs, pi) => bs.map((b) => {
    const size = b.level ? clamp(Math.round(b.size), bodySz + 2, 28) : bodySz;
    const ppr = b.level ? `<w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr>` : b.bullet ? `<w:pPr><w:ind w:left="360" w:hanging="240"/><w:spacing w:after="80"/></w:pPr>` : '<w:pPr><w:spacing w:after="160"/></w:pPr>';
    return `<w:p>${ppr}${run(b.text, size, !!b.level)}</w:p>`;
  }).join('') + (pi < pages.length - 1 ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : '')).join('');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/* ------------------------------------------------------------------ compare two PDFs */
function myersDiff(a, b) {
  let s = 0; while (s < a.length && s < b.length && a[s] === b[s]) s++;
  let ea = a.length, eb = b.length; while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; }
  const A = a.slice(s, ea), B = b.slice(s, eb), n = A.length, m = B.length, max = n + m;
  const ops = []; for (let i = 0; i < s; i++) ops.push({ t: '=', a: i, b: i });
  const tail = []; for (let i = 0; i < a.length - ea; i++) tail.push({ t: '=', a: ea + i, b: eb + i });
  if (!n || !m) { for (let i = 0; i < n; i++) ops.push({ t: '-', a: s + i }); for (let j = 0; j < m; j++) ops.push({ t: '+', b: s + j }); return ops.concat(tail); }
  const off = max + 1; const v = new Int32Array(2 * max + 3); const trace = []; let D = -1;
  outer: for (let d = 0; d <= max; d++) {
    if (d > 4000) throw new Error('The documents are too different to compare line by line.');
    trace.push(v.slice(off - d - 1, off + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1; let y = x - k;
      while (x < n && y < m && A[x] === B[y]) { x++; y++; }
      v[off + k] = x; if (x >= n && y >= m) { D = d; break outer; }
    }
  }
  const mid = []; let x = n, y = m;
  for (let d = D; d > 0; d--) {
    const vv = trace[d]; const get = (k) => vv[k + d + 1]; const k = x - y;
    const pk = k === -d || (k !== d && get(k - 1) < get(k + 1)) ? k + 1 : k - 1; const px = get(pk), py = px - pk;
    while (x > px && y > py) { mid.push({ t: '=', a: s + x - 1, b: s + y - 1 }); x--; y--; }
    if (x === px) mid.push({ t: '+', b: s + y - 1 }); else mid.push({ t: '-', a: s + x - 1 });
    x = px; y = py;
  }
  while (x > 0 && y > 0) { mid.push({ t: '=', a: s + x - 1, b: s + y - 1 }); x--; y--; }
  return ops.concat(mid.reverse(), tail);
}
function wordDiffHtml(a, b) {
  const wa = a.split(/(\s+)/), wb = b.split(/(\s+)/); let ops; try { ops = myersDiff(wa, wb); } catch { return [`<del>${esc(a)}</del>`, `<ins>${esc(b)}</ins>`]; }
  let ha = '', hb = '';
  for (const o of ops) { if (o.t === '=') { ha += esc(wa[o.a]); hb += esc(wb[o.b]); } else if (o.t === '-') ha += `<del>${esc(wa[o.a])}</del>`; else hb += `<ins>${esc(wb[o.b])}</ins>`; }
  return [ha, hb];
}
async function compareDialog() {
  const r = await modal({
    title: 'Compare PDFs', body: `<p class="note" style="margin-top:0">Compares the text of this document (<b>A</b>) with another PDF (<b>B</b>) and lists every difference, page by page.</p>
      <label class="f">Second PDF (B)<input type="file" id="cmpF" accept="application/pdf,.pdf"></label>
      <label class="check"><input type="checkbox" id="cmpM" checked> Highlight the differing lines in this document</label>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Compare', primary: true, onClick: (m) => { const f = m.querySelector('#cmpF').files[0]; if (!f) { toast('Choose the PDF to compare with.', true); return false; } return { f, mark: m.querySelector('#cmpM').checked }; } }],
  });
  if (!r) return; busy(true, 'Comparing…'); let other;
  try {
    other = await pdfjsLib.getDocument({ ...PDF_OPTS, data: new Uint8Array(await r.f.arrayBuffer()) }).promise;
    const A = []; for (const [i, p] of S.pages.entries()) for (const l of await pageLines(p)) A.push({ ...l, page: i, pageId: p.id });
    const B = [];
    for (let i = 1; i <= other.numPages; i++) { busy(true, `Reading ${r.f.name}, page ${i}…`); const page = await other.getPage(i); B.push(...linesFromItems(await extractItems(page, page.rotate || 0)).map((l) => ({ ...l, page: i - 1 }))); }
    const norm = (t) => t.replace(/\s+/g, ' ').trim();
    busy(true, 'Finding differences…'); const ops = myersDiff(A.map((l) => norm(l.text)), B.map((l) => norm(l.text)));
    const hunks = []; let cur = null;
    ops.forEach((o, i) => { if (o.t === '=') { cur = null; return; } if (!cur) { cur = { del: [], add: [] }; hunks.push(cur); } (o.t === '-' ? cur.del : cur.add).push(o.t === '-' ? A[o.a] : B[o.b]); });
    busy(false);
    if (r.mark) {
      const before = snap(); let n = 0;
      for (const h of hunks) for (const l of h.del) if (l.rect) { S.annots.push({ id: uid(), pageId: l.pageId, type: 'highlight', x: l.rect.x - 1, y: l.rect.y, w: l.rect.w + 2, h: l.rect.h, color: '#f87171', opacity: 0.35 }); n++; }
      if (n) { commit(before); rebuildViewer(); }
    }
    const nd = hunks.reduce((s, h) => s + h.del.length, 0), na = hunks.reduce((s, h) => s + h.add.length, 0);
    const html = hunks.slice(0, 400).map((h) => {
      const pa = h.del[0] ? `A p.${h.del[0].page + 1}` : '', pb = h.add[0] ? `B p.${h.add[0].page + 1}` : '';
      const rows = []; const n = Math.max(h.del.length, h.add.length);
      for (let i = 0; i < n; i++) {
        const a = h.del[i], b = h.add[i];
        if (a && b) { const [x, y] = wordDiffHtml(norm(a.text), norm(b.text)); rows.push(`<div class="df-row"><div class="df-a">${x}</div><div class="df-b">${y}</div></div>`); }
        else rows.push(`<div class="df-row"><div class="df-a">${a ? `<del>${esc(norm(a.text))}</del>` : ''}</div><div class="df-b">${b ? `<ins>${esc(norm(b.text))}</ins>` : ''}</div></div>`);
      }
      return `<div class="df-h"><div class="df-loc">${[pa, pb].filter(Boolean).join(' · ')}</div>${rows.join('')}</div>`;
    }).join('');
    await modal({
      title: 'Comparison results', wide: true,
      body: hunks.length ? `<p class="note" style="margin-top:0"><b>${hunks.length}</b> change${hunks.length > 1 ? 's' : ''}: ${nd} line${nd === 1 ? '' : 's'} only in A (this document), ${na} only in B (${esc(r.f.name)}).${r.mark && nd ? ' Lines that differ are highlighted in red in this document.' : ''}</p>
        <div class="df-head"><div>A — ${esc(S.fileName)}</div><div>B — ${esc(r.f.name)}</div></div><div class="diff">${html}</div>${hunks.length > 400 ? '<p class="note">Showing the first 400 changes.</p>' : ''}`
        : '<p style="margin:0">No text differences found — the two documents contain the same text.</p>',
      actions: [{ label: 'Close', primary: true, value: null }],
    });
  } catch (e) { console.error(e); busy(false); toast('Compare failed: ' + e.message, true, 6000); }
  finally { busy(false); safe(() => other && other.destroy()); }
}

/* ------------------------------------------------------------------ scan to PDF */
function enhanceCanvas(src, mode) {
  const sc = Math.min(1, 2200 / Math.max(src.width, src.height));
  const c = document.createElement('canvas'); c.width = Math.round(src.width * sc); c.height = Math.round(src.height * sc);
  const ctx = c.getContext('2d', { willReadFrequently: true }); ctx.drawImage(src, 0, 0, c.width, c.height);
  if (mode === 'original') return c;
  const img = ctx.getImageData(0, 0, c.width, c.height); const d = img.data; const n = c.width * c.height;
  const lum = new Uint8ClampedArray(n); const hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) { const l = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000; lum[i] = l; hist[lum[i]]++; }
  let lo = 0, hi = 255, acc = 0; for (; lo < 255; lo++) { acc += hist[lo]; if (acc > n * 0.01) break; } acc = 0; for (; hi > 0; hi--) { acc += hist[hi]; if (acc > n * 0.05) break; }
  const span = Math.max(30, hi - lo); const st = (v) => clamp((v - lo) * 255 / span, 0, 255);
  if (mode === 'color') { for (let i = 0; i < n; i++) { d[i * 4] = st(d[i * 4]); d[i * 4 + 1] = st(d[i * 4 + 1]); d[i * 4 + 2] = st(d[i * 4 + 2]); } }
  else if (mode === 'gray') { for (let i = 0; i < n; i++) { const v = st(lum[i]); d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; } }
  else { // black & white: adaptive threshold (Bradley) on the stretched image
    const W = c.width, H = c.height, I = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += st(lum[y * W + x]); I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; } }
    const s2 = Math.max(8, Math.round(W / 32)); const t = 0.15;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const x1 = Math.max(0, x - s2), x2 = Math.min(W - 1, x + s2), y1 = Math.max(0, y - s2), y2 = Math.min(H - 1, y + s2);
      const cnt = (x2 - x1 + 1) * (y2 - y1 + 1); const sum = I[(y2 + 1) * (W + 1) + x2 + 1] - I[y1 * (W + 1) + x2 + 1] - I[(y2 + 1) * (W + 1) + x1] + I[y1 * (W + 1) + x1];
      const v = st(lum[y * W + x]) * cnt <= sum * (1 - t) ? 0 : 255; const i = (y * W + x) * 4; d[i] = d[i + 1] = d[i + 2] = v;
    }
  }
  ctx.putImageData(img, 0, 0); return c;
}
async function scanDialog() {
  const shots = []; let mode = 'color';
  const res = await modal({
    title: 'Scan to PDF', wide: true,
    body: `<p class="note" style="margin-top:0">Take photos of paper documents (or pick existing photos). They are cleaned up and turned into PDF pages.</p>
      <div class="scan-btns"><label class="btn primary">📷 Take photo<input type="file" accept="image/*" capture="environment" id="scCam" hidden></label><label class="btn">Add photos<input type="file" accept="image/*" multiple id="scAdd" hidden></label></div>
      <div class="row2" style="margin-top:12px"><label class="f">Look<select id="scMode"><option value="color">Enhanced color</option><option value="gray">Grayscale</option><option value="bw">Black & white (text documents)</option><option value="original">Original photo</option></select></label>
      <label class="f">Page size<select id="scSize"><option value="A4">A4</option><option value="Letter">Letter</option><option value="photo">Same as photo</option></select></label></div>
      <div class="scan-grid" id="scGrid"><p class="note">No pages yet.</p></div>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Create PDF', primary: true, onClick: (m) => { if (!shots.length) { toast('Add at least one photo.', true); return false; } return { size: m.querySelector('#scSize').value }; } }],
    onOpen: (m) => {
      const grid = m.querySelector('#scGrid');
      const redraw = () => {
        grid.innerHTML = shots.length ? '' : '<p class="note">No pages yet.</p>';
        shots.forEach((s, i) => { const d = document.createElement('div'); d.className = 'scan-it'; const pv = enhanceCanvas(s.bmpSmall, mode); pv.className = 'scan-pv'; d.appendChild(pv); d.insertAdjacentHTML('beforeend', `<span>${i + 1}</span><button data-x="${i}" title="Remove">×</button>`); grid.appendChild(d); });
      };
      grid.onclick = (e) => { const x = e.target.closest('[data-x]'); if (x) { shots.splice(+x.dataset.x, 1); redraw(); } };
      const add = async (files) => { for (const f of files) { try { const bmp = await createImageBitmap(f); const sc = Math.min(1, 260 / bmp.width); const sm = document.createElement('canvas'); sm.width = bmp.width * sc; sm.height = bmp.height * sc; sm.getContext('2d').drawImage(bmp, 0, 0, sm.width, sm.height); shots.push({ bmp, bmpSmall: sm }); } catch { toast(`Could not read ${f.name}.`, true); } } redraw(); };
      m.querySelector('#scCam').onchange = (e) => { add([...e.target.files]); e.target.value = ''; };
      m.querySelector('#scAdd').onchange = (e) => { add([...e.target.files]); e.target.value = ''; };
      m.querySelector('#scMode').onchange = (e) => { mode = e.target.value; redraw(); };
    },
  });
  if (!res) return; busy(true, 'Creating PDF…');
  try {
    const doc = await L.PDFDocument.create();
    for (const [i, s] of shots.entries()) {
      busy(true, `Processing page ${i + 1} of ${shots.length}…`);
      const c = enhanceCanvas(s.bmp, mode); const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', mode === 'bw' ? 0.8 : 0.85));
      const img = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      if (res.size === 'photo') { const pw = c.width * 72 / 200, ph = c.height * 72 / 200; doc.addPage([pw, ph]).drawImage(img, { x: 0, y: 0, width: pw, height: ph }); }
      else { let [pw, ph] = PAPER[res.size]; if (c.width > c.height) [pw, ph] = [ph, pw]; const m = 18, k = Math.min((pw - 2 * m) / c.width, (ph - 2 * m) / c.height); doc.addPage([pw, ph]).drawImage(img, { x: (pw - c.width * k) / 2, y: (ph - c.height * k) / 2, width: c.width * k, height: c.height * k }); }
    }
    await openGenerated(await doc.save(), 'scan.pdf', !S.pages.length);
    toast('Scan added. Tip: run OCR to make the text searchable.', false, 5000);
  } catch (e) { console.error(e); toast('Scan failed: ' + e.message, true); } finally { busy(false); }
}
async function openGenerated(bytes, name, replace) {
  const { pages } = await openPdfBytes(bytes, name);
  if (replace) { resetDoc(pages); S.fileName = name; S.pages = pages; S.dirty = true; startDoc(); }
  else { const before = snap(); S.pages.push(...pages); commit(before); rebuildViewer(); renderThumbs(); scrollToPage(S.pages.length - pages.length); }
}

/* ------------------------------------------------------------------ batch workflow */
async function workflowDialog() {
  const r = await modal({
    title: 'Workflow — process many PDFs at once', wide: true,
    body: `<label class="f">PDF files<input type="file" id="wfF" accept="application/pdf,.pdf" multiple></label>
      <label class="f">Steps (applied in this order)</label>
      <div class="wf">
        <label class="check"><input type="checkbox" id="wfPN"> Add page numbers <input type="text" id="wfPNv" value="Page {n} of {total}"></label>
        <label class="check"><input type="checkbox" id="wfBT"> Add Bates numbers, prefix <input type="text" id="wfBTv" value="DOC-" style="width:90px"></label>
        <label class="check"><input type="checkbox" id="wfWM"> Add watermark <input type="text" id="wfWMv" value="CONFIDENTIAL"></label>
        <label class="check"><input type="checkbox" id="wfCL"> Remove metadata, scripts and attachments</label>
        <label class="check"><input type="checkbox" id="wfFL"> Flatten form fields</label>
        <label class="check"><input type="checkbox" id="wfCP"> Compress <select id="wfCPv"><option value="110,0.7">Balanced</option><option value="72,0.6">Smallest</option><option value="150,0.8">Good</option></select></label>
        <label class="check"><input type="checkbox" id="wfPW"> Protect with password <input type="password" id="wfPWv" autocomplete="new-password"></label>
      </div>
      <label class="f">Output<select id="wfO"><option value="each">One file per PDF (downloaded as a ZIP)</option><option value="merge">Merge everything into one PDF</option></select></label>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Run workflow', primary: true, onClick: (m) => {
      const files = [...m.querySelector('#wfF').files].filter(isPdf); if (!files.length) { toast('Choose the PDF files to process.', true); return false; }
      const g = (id) => m.querySelector(id); const c = (id) => g(id).checked;
      const cfg = { files, pn: c('#wfPN') && g('#wfPNv').value, bates: c('#wfBT') ? g('#wfBTv').value : false, wm: c('#wfWM') && g('#wfWMv').value, clean: c('#wfCL'), flatten: c('#wfFL'), compress: c('#wfCP') && g('#wfCPv').value.split(',').map(Number), password: c('#wfPW') && g('#wfPWv').value, merge: g('#wfO').value === 'merge' };
      if (c('#wfPW') && !cfg.password) { toast('Enter the password to use.', true); return false; }
      if (![cfg.pn, cfg.bates !== false, cfg.wm, cfg.clean, cfg.flatten, cfg.compress, cfg.password].some(Boolean) && !cfg.merge) { toast('Pick at least one step.', true); return false; }
      return cfg;
    } }],
  });
  if (!r) return; await runWorkflow(r);
}
async function runWorkflow(cfg) {
  if (S.pages.length && S.dirty && !(await askConfirm('Running a workflow closes the document you have open. Discard its unsaved changes?', 'Discard & run'))) return;
  const results = []; const groups = cfg.merge ? [cfg.files] : cfg.files.map((f) => [f]);
  busy(true, 'Starting…');
  try {
    for (const [gi, g] of groups.entries()) {
      resetDoc([]); S.pages = [];
      for (const f of g) { busy(true, `Opening ${f.name}…`); const { pages } = await openPdfBytes(new Uint8Array(await f.arrayBuffer()), f.name); S.pages.push(...pages); }
      S.fileName = g.length === 1 ? g[0].name : 'merged.pdf';
      S.docOps = { pageNumbers: cfg.pn ? { format: cfg.pn, pos: 'bc', size: 10, margin: 28, start: 1, color: '#374151', skipFirst: false } : null,
        watermark: cfg.wm ? { text: cfg.wm, size: 60, color: '#dc2626', opacity: 0.18, angle: 45 } : null, meta: null,
        hf: cfg.bates !== false ? { hl: '', hc: '', hr: '', fl: '', fc: '', fr: '{bates}', size: 9, margin: 20, start: 1, color: '#111827', skipFirst: false, bates: { prefix: cfg.bates || '', start: 1, digits: 6 } } : null,
        sanitize: cfg.clean ? { meta: true, js: true, attachments: true } : null };
      busy(true, `Processing ${S.fileName} (${gi + 1} of ${groups.length})…`);
      let bytes = await buildPdf({ flatten: cfg.flatten, raster: cfg.compress ? { dpi: cfg.compress[0], quality: cfg.compress[1] } : null });
      if (cfg.password) { busy(true, 'Encrypting…'); bytes = await qpdfEncrypt(bytes, { user: cfg.password, print: true, copy: true, modify: true }); }
      results.push({ name: S.fileName.replace(/\.pdf$/i, '') + '-processed.pdf', bytes });
    }
    busy(false);
    if (results.length === 1) await download(results[0].bytes, results[0].name);
    else { const zip = new JSZip(); const used = new Set(); for (const r of results) { let n = r.name, k = 2; while (used.has(n)) n = r.name.replace(/\.pdf$/, `-${k++}.pdf`); used.add(n); zip.file(n, r.bytes); } await download(await zip.generateAsync({ type: 'blob' }), 'workflow-results.zip', 'application/zip'); }
    toast(`Workflow finished: ${results.length} file${results.length > 1 ? 's' : ''}.`);
  } catch (e) { console.error(e); toast('Workflow failed: ' + e.message, true, 7000); }
  finally { busy(false); resetDoc([]); S.pages = []; S.dirty = false; S.fileName = 'document.pdf'; $('#thumbs').innerHTML = ''; document.body.classList.remove('has-doc'); viewer.className = 'viewer'; }
}


updUndo();
window.__pdfstudio = { S, buildPdf, loadFiles, setTool, pdfjsLib }; // handy for debugging in the console
