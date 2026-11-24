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

const TOOL_GROUPS = [
  ['Organize pages', [
    ['merge', 'Merge files', 'Combine PDFs and images', () => $('#fileAdd').click()],
    ['split', 'Split PDF', 'Into several files', splitDialog],
    ['extract', 'Extract pages', 'Save chosen pages as a new PDF', () => rangeDialog('Extract pages', extractPages, 'Extract')],
    ['trash', 'Delete pages', 'Remove a range of pages', () => rangeDialog('Delete pages', deletePages, 'Delete')],
    ['rotr', 'Rotate all pages', '90° clockwise', () => rotatePages(S.pages.map((p) => p.id), 90)],
    ['pageplus', 'Insert blank page', 'After the current page', () => insertBlank(S.current)],
    ['reverse', 'Reverse order', 'Last page first', reversePages],
    ['crop', 'Crop pages', 'Trim margins', cropDialog],
    ['resize', 'Resize pages', 'A4, Letter, Legal…', resizeDialog],
  ]],
  ['Edit & comment', [
    ['edit', 'Edit text', 'Change existing words', () => setTool('edittext')],
    ['text', 'Add text', 'Type anywhere', () => setTool('text')],
    ['image', 'Add image', 'Logos, photos', () => $('#fileImage').click()],
    ['highlight', 'Highlight', 'Mark important parts', () => setTool('highlight')],
    ['note', 'Comment', 'Sticky notes', () => setTool('note')],
    ['eraser', 'White-out', 'Cover content', () => setTool('whiteout')],
    ['redact', 'Redact', 'Permanently remove content', () => setTool('redact')],
    ['compare', 'Compare PDFs', 'Find differences', compareDialog],
  ]],
  ['Sign & fill', [
    ['sign', 'Sign', 'Draw, type or upload', openSignature],
    ['form', 'Fill form', 'Type into form fields', formInfo],
    ['stamp', 'Stamps', 'Approved, paid, ✓, ✗…', openStamps],
    ['calendar', 'Date', "Insert today's date", () => setTool('date')],
    ['form', 'Create form', 'Add fillable fields', () => setTool('field')],
  ]],
  ['Protect', [
    ['lock', 'Protect PDF', 'Add a password', protectDialog],
    ['unlock', 'Unlock PDF', 'Remove a password', unlockInfo],
    ['broom', 'Clean up', 'Remove hidden data', sanitizeDialog],
    ['info', 'Document info', 'Fonts, metadata, security', infoDialog],
  ]],
  ['View', [
    ['present', 'Present', 'Full-screen slideshow', startPresent],
    ['speaker', 'Read aloud', 'Listen from this page', () => startReading(S.current)],
    ['bookmark', 'Bookmarks', 'Table of contents', () => { $('#sidebar').classList.remove('hidden'); $('.side-tabs [data-pane="outline"]').click(); }],
    ['note', 'Comments list', 'All markup in one place', () => { $('#sidebar').classList.remove('hidden'); $('.side-tabs [data-pane="comments"]').click(); }],
  ]],
  ['Enhance & convert', [
    ['ocr', 'OCR', 'Make scans searchable', ocrDialog],
    ['word', 'PDF to Word', 'Editable .docx', () => exportTextDialog('docx')],
    ['txt', 'PDF to text', 'Markdown or plain text', () => exportTextDialog('md')],
    ['header', 'Header & footer', 'Also Bates numbering', headerFooterDialog],
    ['scan', 'Scan to PDF', 'Add pages from photos', scanDialog],
    ['workflow', 'Workflow', 'Batch-process many PDFs', workflowDialog],
    ['hash', 'Page numbers', 'Header or footer numbering', pageNumbersDialog],
    ['water', 'Watermark', 'Diagonal text on every page', watermarkDialog],
    ['compress', 'Compress', 'Reduce file size', compressDialog],
    ['image', 'PDF to images', 'PNG or JPG per page', exportImages],
    ['layers', 'Flatten', 'Lock forms & save', () => doSave({ flatten: true }, `${baseName()}-flattened.pdf`)],
    ['info', 'Properties', 'Title, author, file name', propertiesDialog],
    ['print', 'Print', 'Send to printer', printDoc],
  ]],
];
function openToolsGrid() {
  const flat = TOOL_GROUPS.flatMap(([, items]) => items);
  modal({ title: 'All tools', wide: true, body: `<div class="tool-grid">${TOOL_GROUPS.map(([g, items]) => `<h3>${g}</h3>` + items.map(([ic, t, s]) => `<button data-t="${esc(t)}"><span class="ti">${icon(ic)}</span><span><b>${t}</b><small>${s}</small></span></button>`).join('')).join('')}</div>`,
    onOpen: (m) => m.querySelectorAll('.tool-grid button').forEach((b) => b.onclick = () => { const it = flat.find((x) => x[1] === b.dataset.t); closeModal(null); setTimeout(it[3], 0); }) });
}

/* ------------------------------------------------------------------ wiring */
/* home screen: every tool is a card; it asks for the file(s), then opens the editor with that tool ready */
let pendingAfter = null;
function pickFiles({ after = null, images = false } = {}) {
  pendingAfter = after;
  const inp = $('#fileOpen'); inp.accept = images ? 'image/*' : 'application/pdf,.pdf,image/*'; inp.multiple = true; inp.click();
}
const sidebarHint = () => { $('#sidebar').classList.remove('hidden'); toast('Drag page thumbnails to reorder. Hover a page to rotate, duplicate or delete it.', false, 6000); };
const HOME_GROUPS = [
  ['Read & edit', [
    ['open', 'Open & read', 'View, zoom, search, thumbnails', {}],
    ['edit', 'Edit text', 'Change existing words, same font', { after: () => setTool('edittext') }],
    ['text', 'Add text', 'Type anywhere on the page', { after: () => setTool('text') }],
    ['image', 'Add image', 'Logos, photos, pictures', { after: () => toast('Click “Image” in the toolbar to choose a picture.', false, 5000) }],
    ['eraser', 'White-out', 'Cover up content', { after: () => setTool('whiteout') }],
  ]],
  ['Comment', [
    ['highlight', 'Highlight', 'Straight highlighter', { after: () => setTool('highlight') }],
    ['pen', 'Draw', 'Freehand pen', { after: () => setTool('draw') }],
    ['rect', 'Shapes', 'Boxes and circles', { after: () => setTool('rect') }],
    ['arrow', 'Arrows & lines', 'Point things out', { after: () => setTool('arrow') }],
    ['note', 'Sticky notes', 'Add comments', { after: () => setTool('note') }],
    ['stamp', 'Stamps', 'Approved, Paid, ✓, ✗…', { after: openStamps }],
  ]],
  ['Sign & fill', [
    ['sign', 'Sign', 'Draw, type or upload a signature', { after: openSignature }],
    ['form', 'Fill form', 'Type into form fields', { after: formInfo }],
    ['calendar', 'Add date', "Insert today's date", { after: () => setTool('date') }],
    ['form', 'Create form', 'Add fillable fields', { after: () => setTool('field') }],
  ]],
  ['Organize pages', [
    ['merge', 'Merge files', 'Select 2 or more PDFs/images', { after: () => { sidebarHint(); } }],
    ['split', 'Split PDF', 'Into several files', { after: splitDialog }],
    ['extract', 'Extract pages', 'Save chosen pages as new PDF', { after: () => rangeDialog('Extract pages', extractPages, 'Extract') }],
    ['trash', 'Delete pages', 'Remove pages', { after: () => rangeDialog('Delete pages', deletePages, 'Delete') }],
    ['rotr', 'Rotate & reorder', 'Organize pages', { after: sidebarHint }],
    ['crop', 'Crop pages', 'Trim margins', { after: cropDialog }],
    ['resize', 'Resize pages', 'A4, Letter, Legal…', { after: resizeDialog }],
  ]],
  ['Protect', [
    ['lock', 'Protect PDF', 'Add a password', { after: protectDialog }],
    ['unlock', 'Unlock PDF', 'Remove a password', { after: unlockInfo }],
    ['redact', 'Redact', 'Permanently remove content', { after: () => setTool('redact') }],
    ['broom', 'Clean up', 'Remove hidden data', { after: sanitizeDialog }],
    ['layers', 'Flatten', 'Lock forms & annotations', { after: () => doSave({ flatten: true }, `${baseName()}-flattened.pdf`) }],
  ]],
  ['View & review', [
    ['present', 'Present', 'Full-screen slideshow', { after: startPresent }],
    ['speaker', 'Read aloud', 'Listen to the document', { after: () => startReading(0) }],
    ['compare', 'Compare PDFs', 'Find differences', { after: compareDialog }],
    ['info', 'Document info', 'Fonts, metadata, security', { after: infoDialog }],
  ]],
  ['Convert & enhance', [
    ['ocr', 'OCR', 'Make scans searchable', { after: ocrDialog }],
    ['word', 'PDF to Word', 'Editable .docx', { after: () => exportTextDialog('docx') }],
    ['txt', 'PDF to text', 'Markdown or plain text', { after: () => exportTextDialog('md') }],
    ['scan', 'Scan to PDF', 'Use your phone camera', { scan: true }],
    ['image', 'Images to PDF', 'JPG, PNG → PDF', { images: true, after: () => toast('Your images are now a PDF. Click Download to save it.', false, 5000) }],
    ['download', 'PDF to images', 'Save pages as PNG/JPG', { after: exportImages }],
    ['compress', 'Compress', 'Reduce file size', { after: compressDialog }],
    ['hash', 'Page numbers', 'Number every page', { after: pageNumbersDialog }],
    ['header', 'Header & footer', 'Also Bates numbering', { after: headerFooterDialog }],
    ['water', 'Watermark', 'Text across every page', { after: watermarkDialog }],
    ['info', 'Properties', 'Title, author, file name', { after: propertiesDialog }],
    ['pageplus', 'Blank PDF', 'Start from an empty page', { blank: true }],
    ['workflow', 'Workflow', 'Batch-process many PDFs', { workflow: true }],
  ]],
];
$('#homeTools').innerHTML = HOME_GROUPS.map(([g, items], gi) => `<h3>${g}</h3>` + items.map(([ic, t, sub], i) => `<button data-g="${gi}" data-i="${i}"><span class="ti">${icon(ic)}</span><span><b>${esc(t)}</b><small>${esc(sub)}</small></span></button>`).join('')).join('');
$('#homeTools').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-g]'); if (!b) return;
  const opt = HOME_GROUPS[+b.dataset.g][1][+b.dataset.i][3];
  if (opt.blank) return newBlank();
  if (opt.scan) return scanDialog();
  if (opt.workflow) return workflowDialog();
  pickFiles({ after: opt.after || null, images: !!opt.images });
});
async function goHome() {
  finishEdit();
  if (S.dirty && !(await askConfirm('You have unsaved changes. Leave this document and go back to all tools?', 'Leave without saving'))) return;
  closeModal(null); if (S.placing) stopPlacing();
  resetDoc([]); S.pages = []; S.dirty = false; S.fileName = 'document.pdf';
  $('#thumbs').innerHTML = ''; $('#statusFile').textContent = ''; $('#statusHint').textContent = '';
  document.body.classList.remove('has-doc'); viewer.className = 'viewer'; viewer.scrollTop = 0;
}
$('#btnHome').onclick = goHome;
$('.brand').onclick = () => { if (S.pages.length) goHome(); };
$('#btnOpen').onclick = () => pickFiles(); $('#wOpen').onclick = () => pickFiles();
$('#wImages').onclick = () => pickFiles({ images: true }); $('#wBlank').onclick = newBlank;
$('#btnAdd').onclick = () => $('#fileAdd').click();
$('#fileOpen').onchange = async (e) => {
  const f = [...e.target.files]; e.target.value = ''; const after = pendingAfter; pendingAfter = null;
  if (!f.length) return;
  const before = S.sources.size; await loadFiles(f, true);
  if (after && S.pages.length && document.body.classList.contains('has-doc')) setTimeout(after, 150);
};
$('#fileOpen').addEventListener('cancel', () => { pendingAfter = null; });
$('#fileAdd').onchange = (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) loadFiles(f, false); };
$('#btnUndo').onclick = undo; $('#btnRedo').onclick = redo;
$('#btnZoomIn').onclick = () => zoomStep(1); $('#btnZoomOut').onclick = () => zoomStep(-1);
$('#zoomSelect').onchange = (e) => setZoom(isNaN(+e.target.value) ? e.target.value : +e.target.value);
$('#pageInput').addEventListener('change', (e) => scrollToPage(clamp((parseInt(e.target.value) || 1) - 1, 0, S.pages.length - 1)));
$('#btnTools').onclick = openToolsGrid;
$('#btnDownload').onclick = () => doSave();
const dm = $('#downloadMenu');
$('#btnDownloadMenu').onclick = (e) => { e.stopPropagation(); $$('.menu.open').forEach((m) => m !== dm && m.classList.remove('open')); const r = $('#btnDownloadMenu').getBoundingClientRect(); dm.style.top = r.bottom + 6 + 'px'; dm.style.right = innerWidth - r.right + 'px'; dm.classList.toggle('open'); };
document.addEventListener('click', () => dm.classList.remove('open'));
dm.onclick = (e) => { const a = e.target.dataset.act; dm.classList.remove('open'); if (a === 'protect') protectDialog(); if (a === 'save') doSave(); if (a === 'saveFlat') doSave({ flatten: true }, `${baseName()}-flattened.pdf`); if (a === 'images') exportImages(); if (a === 'print') printDoc(); };

