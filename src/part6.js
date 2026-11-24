const TOOL_GROUPS = [
  ['Organize pages', [
    ['merge', 'Merge files', 'Combine PDFs and images', () => $('#fileAdd').click()],
    ['split', 'Split PDF', 'Into several files', splitDialog],
    ['extract', 'Extract pages', 'Save chosen pages as a new PDF', () => rangeDialog('Extract pages', extractPages, 'Extract')],
    ['trash', 'Delete pages', 'Remove a range of pages', () => rangeDialog('Delete pages', deletePages, 'Delete')],
    ['rotr', 'Rotate all pages', '90° clockwise', () => rotatePages(S.pages.map((p) => p.id), 90)],
    ['pageplus', 'Insert blank page', 'After the current page', () => insertBlank(S.current)],
    ['reverse', 'Reverse order', 'Last page first', reversePages],
  ]],
  ['Edit & comment', [
    ['edit', 'Edit text', 'Change existing words', () => setTool('edittext')],
    ['text', 'Add text', 'Type anywhere', () => setTool('text')],
    ['image', 'Add image', 'Logos, photos', () => $('#fileImage').click()],
    ['highlight', 'Highlight', 'Mark important parts', () => setTool('highlight')],
    ['note', 'Comment', 'Sticky notes', () => setTool('note')],
    ['eraser', 'White-out', 'Cover content', () => setTool('whiteout')],
    ['redact', 'Redact', 'Permanently remove content', () => setTool('redact')],
  ]],
  ['Sign & fill', [
    ['sign', 'Sign', 'Draw, type or upload', openSignature],
    ['form', 'Fill form', 'Type into form fields', formInfo],
    ['stamp', 'Stamps', 'Approved, paid, ✓, ✗…', openStamps],
    ['calendar', 'Date', "Insert today's date", () => setTool('date')],
  ]],
  ['Enhance & convert', [
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
  ]],
  ['Organize pages', [
    ['merge', 'Merge files', 'Select 2 or more PDFs/images', { after: () => { sidebarHint(); } }],
    ['split', 'Split PDF', 'Into several files', { after: splitDialog }],
    ['extract', 'Extract pages', 'Save chosen pages as new PDF', { after: () => rangeDialog('Extract pages', extractPages, 'Extract') }],
    ['trash', 'Delete pages', 'Remove pages', { after: () => rangeDialog('Delete pages', deletePages, 'Delete') }],
    ['rotr', 'Rotate & reorder', 'Organize pages', { after: sidebarHint }],
  ]],
  ['Protect', [
    ['redact', 'Redact', 'Permanently remove content', { after: () => setTool('redact') }],
    ['layers', 'Flatten', 'Lock forms & annotations', { after: () => doSave({ flatten: true }, `${baseName()}-flattened.pdf`) }],
  ]],
  ['Convert & enhance', [
    ['image', 'Images to PDF', 'JPG, PNG → PDF', { images: true, after: () => toast('Your images are now a PDF. Click Download to save it.', false, 5000) }],
    ['download', 'PDF to images', 'Save pages as PNG/JPG', { after: exportImages }],
    ['compress', 'Compress', 'Reduce file size', { after: compressDialog }],
    ['hash', 'Page numbers', 'Number every page', { after: pageNumbersDialog }],
    ['water', 'Watermark', 'Text across every page', { after: watermarkDialog }],
    ['info', 'Properties', 'Title, author, file name', { after: propertiesDialog }],
    ['pageplus', 'Blank PDF', 'Start from an empty page', { blank: true }],
  ]],
];
$('#homeTools').innerHTML = HOME_GROUPS.map(([g, items], gi) => `<h3>${g}</h3>` + items.map(([ic, t, sub], i) => `<button data-g="${gi}" data-i="${i}"><span class="ti">${icon(ic)}</span><span><b>${esc(t)}</b><small>${esc(sub)}</small></span></button>`).join('')).join('');
$('#homeTools').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-g]'); if (!b) return;
  const opt = HOME_GROUPS[+b.dataset.g][1][+b.dataset.i][3];
  if (opt.blank) return newBlank();
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
$('#btnDownloadMenu').onclick = (e) => { e.stopPropagation(); const r = $('#btnDownloadMenu').getBoundingClientRect(); dm.style.top = r.bottom + 6 + 'px'; dm.style.right = innerWidth - r.right + 'px'; dm.classList.toggle('open'); };
document.addEventListener('click', () => dm.classList.remove('open'));
dm.onclick = (e) => { const a = e.target.dataset.act; dm.classList.remove('open'); if (a === 'save') doSave(); if (a === 'saveFlat') doSave({ flatten: true }, `${baseName()}-flattened.pdf`); if (a === 'images') exportImages(); if (a === 'print') printDoc(); };

/* drag & drop files */
let dragDepth = 0;
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
window.addEventListener('dragenter', (e) => { if (hasFiles(e)) { dragDepth++; $('#dropZone').classList.add('over'); } });
window.addEventListener('dragleave', (e) => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; $('#dropZone').classList.remove('over'); } });
window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return; e.preventDefault(); dragDepth = 0; $('#dropZone').classList.remove('over');
  const files = [...e.dataTransfer.files]; if (!files.length) return;
  if (!S.pages.length) return loadFiles(files, true);
  loadFiles(files, false);
});

/* keyboard */
document.addEventListener('keydown', (e) => {
  const mod = e.ctrlKey || e.metaKey; const k = e.key.toLowerCase();
  if (mod && k === 'o') { e.preventDefault(); pickFiles(); return; }
  if (!S.pages.length) return;
  if (mod && k === 's') { e.preventDefault(); doSave(); return; }
  if (mod && k === 'p') { e.preventDefault(); printDoc(); return; }
  if (mod && k === 'f') { e.preventDefault(); $('#searchInput').focus(); $('#searchInput').select(); return; }
  if (mod && (k === '=' || k === '+')) { e.preventDefault(); zoomStep(1); return; }
  if (mod && k === '-') { e.preventDefault(); zoomStep(-1); return; }
  if ($('#modalBack').classList.contains('open')) { if (k === 'escape') closeModal(null); return; }
  if (isTyping(e.target)) return;
  if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k === 'y') { e.preventDefault(); redo(); return; }
  if (mod && k === 'c' && S.sel) { S.clipboard = JSON.parse(JSON.stringify(annotById(S.sel))); toast('Copied'); return; }
  if (mod && (k === 'v' || k === 'd') && (S.clipboard || S.sel)) {
    e.preventDefault(); const src = k === 'd' ? annotById(S.sel) : S.clipboard; if (!src) return;
    const a = JSON.parse(JSON.stringify(src)); a.id = uid(); a.pageId = k === 'd' ? src.pageId : S.pages[S.current].id; translate(a, 12, 12);
    addAnnot(a, snap()); select(a.id); return;
  }
  if (k === 'escape') { if (S.placing) stopPlacing(); deselect(); $$('.note-pop').forEach((n) => n.remove()); return; }
  if ((k === 'delete' || k === 'backspace') && S.sel) { e.preventDefault(); deleteSelected(); return; }
  if (S.sel && k.startsWith('arrow')) {
    e.preventDefault(); const a = annotById(S.sel); const s = e.shiftKey ? 10 : 1; const before = snap();
    translate(a, k === 'arrowleft' ? -s : k === 'arrowright' ? s : 0, k === 'arrowup' ? -s : k === 'arrowdown' ? s : 0); updateAnnotEl(a); commit(before); return;
  }
  if (!mod && !e.altKey) {
    const map = { v: 'select', h: 'hand', t: 'text', e: 'edittext', d: 'draw', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow', n: 'note' };
    if (map[k]) setTool(map[k]);
    if (k === 'pagedown' || k === 'pageup') { e.preventDefault(); scrollToPage(clamp(S.current + (k === 'pagedown' ? 1 : -1), 0, S.pages.length - 1)); }
  }
});
window.addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

updUndo();
window.__pdfstudio = { S, buildPdf, loadFiles, setTool, pdfjsLib }; // handy for debugging in the console
