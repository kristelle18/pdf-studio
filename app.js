/* PDF Studio — a client-side PDF editor.
 * Rendering: pdf.js · Writing: pdf-lib · Zips: JSZip. Everything runs in the browser.
 */
const PDFJS_VER = '4.10.38';
const PDFJS_CDN = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}`;
const pdfjsLib = await import(`${PDFJS_CDN}/build/pdf.min.mjs`);
pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_CDN}/build/pdf.worker.min.mjs`;
const PDF_OPTS = { cMapUrl: `${PDFJS_CDN}/cmaps/`, cMapPacked: true, standardFontDataUrl: `${PDFJS_CDN}/standard_fonts/` };
const L = window.PDFLib;

/* ------------------------------------------------------------------ helpers */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const safe = (fn, d) => { try { return fn(); } catch { return d; } };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isTyping = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const hex2rgb = (h) => { const n = parseInt((h || '#000000').slice(1), 16); return L.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ICONS = {
  open: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h3"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  up: '<path d="m18 15-6-6-6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  download: '<path d="M12 3v12m0 0-5-5m5 5 5-5M4 21h16"/>',
  cursor: '<path d="m4 4 7 17 2.5-7.5L21 11z"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.3l-3.6-3.6a2 2 0 0 1 2.8-2.8L7 15"/>',
  text: '<path d="M4 7V4h16v3M9 20h6M12 4v16"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  highlight: '<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>',
  pen: '<path d="M3 17c3-3 5 2 8-1s1-7 4-9 4 1 6 0"/>',
  rect: '<rect x="3" y="5" width="18" height="14" rx="1"/>', ellipse: '<ellipse cx="12" cy="12" rx="9" ry="7"/>',
  line: '<path d="M5 19 19 5"/>', arrow: '<path d="M5 19 19 5M10 5h9v9"/>',
  note: '<path d="M4 4h16v12H9l-5 4z"/>',
  sign: '<path d="M3 17c2-1 3-6 5-6s1 5 3 5 2-3 4-3 2 2 6 2"/><path d="M3 21h18"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  stamp: '<path d="M5 22h14M19 18H5v-3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2zM9 13l-1-5a4 4 0 1 1 8 0l-1 5"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  eraser: '<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 19"/><path d="M22 21H7M5 11l9 9"/>',
  redact: '<rect x="3" y="6" width="18" height="5" fill="currentColor"/><path d="M3 15h18M3 19h12"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>', checkall: '<path d="m3 12 5 5L20 5"/>',
  rotl: '<path d="M3 3v6h6"/><path d="M3.5 13a9 9 0 1 0 2.1-8.4L3 9"/>', rotr: '<path d="M21 3v6h-6"/><path d="M20.5 13a9 9 0 1 1-2.1-8.4L21 9"/>',
  pageplus: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 12v6M9 15h6"/>',
  extract: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M12 18v-6m0 0-3 3m3-3 3 3"/>',
  filepdf: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  merge: '<path d="M8 3v6a4 4 0 0 0 4 4 4 4 0 0 1 4 4v4M16 3v6a4 4 0 0 1-4 4"/>',
  split: '<path d="M16 3h5v5M8 3H3v5M21 3l-9 9-9-9M12 12v9"/>',
  hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
  water: '<path d="M12 2.7s-7 7.3-7 12.3a7 7 0 0 0 14 0c0-5-7-12.3-7-12.3z"/>',
  compress: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/>',
  print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  form: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h10M7 13h6"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
  reverse: '<path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/>',
};
const icon = (n) => `<svg class="i" viewBox="0 0 24 24">${ICONS[n] || ''}</svg>`;
$$('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));

const FONT_CSS = { Helvetica: 'Arial, Helvetica, "Liberation Sans", sans-serif', Times: '"Times New Roman", Times, "Liberation Serif", serif', Courier: '"Courier New", Courier, "Liberation Mono", monospace' };
const BASELINE = { Helvetica: 0.9465, Times: 0.9375, Courier: 0.8665 }; // baseline offset for line-height 1.2
const fontKey = (f, b, i) => ({ Helvetica: ['Helvetica', 'HelveticaBold', 'HelveticaOblique', 'HelveticaBoldOblique'], Times: ['TimesRoman', 'TimesRomanBold', 'TimesRomanItalic', 'TimesRomanBoldItalic'], Courier: ['Courier', 'CourierBold', 'CourierOblique', 'CourierBoldOblique'] }[f] || [])[(b ? 1 : 0) + (i ? 2 : 0)] || 'Helvetica';

/* ------------------------------------------------------------------ state */
const S = {
  sources: new Map(), pages: [], annots: [], assets: {}, form: {}, formInit: {}, fields: [],
  zoom: 1, zoomMode: 'fit', fileName: 'document.pdf', tool: 'select', sel: null, placing: null,
  selPages: new Set(), current: 0, dirty: false, clipboard: null,
  docOps: { pageNumbers: null, watermark: null, meta: null },
  td: {
    text: { color: '#111827', font: 'Helvetica', size: 14, bold: false, italic: false, opacity: 1 },
    highlight: { color: '#fde047', opacity: 0.45 },
    draw: { color: '#2563eb', width: 2, opacity: 1 },
    rect: { color: '#dc2626', fill: null, width: 2, opacity: 1 },
    ellipse: { color: '#dc2626', fill: null, width: 2, opacity: 1 },
    line: { color: '#dc2626', width: 2, opacity: 1 },
    arrow: { color: '#dc2626', width: 2, opacity: 1 },
    image: { opacity: 1 },
  },
};
const TYPE_TOOL = { text: 'text', highlight: 'highlight', ink: 'draw', rect: 'rect', ellipse: 'ellipse', line: 'line', arrow: 'arrow', image: 'image' };
const PROPS_FOR = {
  text: ['color', 'font', 'size', 'bold', 'italic', 'opacity'], date: ['color', 'font', 'size', 'bold', 'italic'], edittext: ['color', 'font', 'size'],
  highlight: ['color', 'opacity'], draw: ['color', 'stroke', 'opacity'], rect: ['color', 'fill', 'stroke', 'opacity'], ellipse: ['color', 'fill', 'stroke', 'opacity'],
  line: ['color', 'stroke', 'opacity'], arrow: ['color', 'stroke', 'opacity'], image: ['opacity'],
};
const HINTS = {
  select: 'Click an item to select it. Drag to move, use the corner handle to resize. Double-click text to edit. Fill form fields by clicking them.',
  hand: 'Drag to scroll around the document.', text: 'Click anywhere on a page to add text.',
  edittext: 'Click on existing text to replace it. The original is covered and your editable copy appears on top.',
  highlight: 'Drag over the area you want to highlight.', draw: 'Draw freehand with your mouse, pen or finger.',
  rect: 'Drag to draw a box.', ellipse: 'Drag to draw a circle or ellipse.', line: 'Drag to draw a line.', arrow: 'Drag to draw an arrow.',
  note: 'Click to add a sticky-note comment.', date: "Click to insert today's date.",
  whiteout: 'Drag to cover content with white. (Hidden content is still in the file — use Redact to remove it.)',
  redact: 'Drag over sensitive content. On save, those pages are flattened and everything under the boxes is permanently removed.',
};

/* ------------------------------------------------------------------ UI utilities */
function toast(msg, err = false, ms = 3500) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), ms);
}
function busy(on, text = 'Working…') { $('#busyText').textContent = text; $('#busy').classList.toggle('on', on); }
function download(bytes, name, type = 'application/pdf') {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
const baseName = () => S.fileName.replace(/\.pdf$/i, '');
const fmtBytes = (n) => n > 1048576 ? (n / 1048576).toFixed(2) + ' MB' : Math.round(n / 1024) + ' KB';

let modalResolve = null;
function modal({ title, body, actions = [], wide = false, onOpen }) {
  const m = $('#modal'); m.className = 'modal' + (wide ? ' wide' : '');
  m.innerHTML = `<header><h2>${esc(title)}</h2><button class="icon-btn" data-close>${icon('x')}</button></header><div class="body">${body}</div>` +
    (actions.length ? `<footer>${actions.map((a, i) => `<button class="btn ${a.primary ? 'primary' : ''}" data-act="${i}">${esc(a.label)}</button>`).join('')}</footer>` : '');
  $('#modalBack').classList.add('open');
  return new Promise((res) => {
    modalResolve = res;
    m.querySelector('[data-close]').onclick = () => closeModal(null);
    actions.forEach((a, i) => { m.querySelector(`[data-act="${i}"]`).onclick = async () => { const v = a.onClick ? await a.onClick(m) : a.value; if (v !== false) closeModal(v ?? a.value ?? true); }; });
    onOpen && onOpen(m);
  });
}
function closeModal(v) { $('#modalBack').classList.remove('open'); $('#modal').innerHTML = ''; const r = modalResolve; modalResolve = null; r && r(v); }
$('#modalBack').addEventListener('pointerdown', (e) => { if (e.target.id === 'modalBack') closeModal(null); });

/* ------------------------------------------------------------------ geometry */
const totalRot = (p) => (((p.baseRot || 0) + (p.rot || 0)) % 360 + 360) % 360;
const dispSize = (p) => (totalRot(p) % 180 ? { w: p.h, h: p.w } : { w: p.w, h: p.h });
// Matrix mapping display space (origin bottom-left of the *displayed* page, y up, points) to PDF user space.
function matrixFor(p) {
  const { x0 = 0, y0 = 0, w, h } = p;
  switch (totalRot(p)) {
    case 90: return [0, 1, -1, 0, x0 + w, y0];
    case 180: return [-1, 0, 0, -1, x0 + w, y0 + h];
    case 270: return [0, -1, 1, 0, x0, y0 + h];
    default: return [1, 0, 0, 1, x0, y0];
  }
}
function dispToPage(p, u, v) { const [a, b, c, d, e, f] = matrixFor(p); const V = dispSize(p).h - v; return { x: a * u + c * V + e, y: b * u + d * V + f }; }
function pageToDisp(p, x, y) {
  const [a, b, c, d, e, f] = matrixFor(p); const det = a * d - b * c; const X = x - e, Y = y - f;
  return { u: (d * X - c * Y) / det, v: dispSize(p).h - (-b * X + a * Y) / det };
}
function pageRectToDisp(p, r) {
  const c1 = pageToDisp(p, r.x, r.y), c2 = pageToDisp(p, r.x + r.width, r.y + r.height);
  return { x: Math.min(c1.u, c2.u), y: Math.min(c1.v, c2.v), w: Math.abs(c2.u - c1.u), h: Math.abs(c2.v - c1.v) };
}
const normRect = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) });

function bbox(a) {
  switch (a.type) {
    case 'line': case 'arrow': return { x: Math.min(a.x1, a.x2), y: Math.min(a.y1, a.y2), w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) };
    case 'ink': { const xs = a.points.map((p) => p[0]), ys = a.points.map((p) => p[1]); const x = Math.min(...xs), y = Math.min(...ys); return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y }; }
    case 'note': return { x: a.x, y: a.y, w: 20, h: 20 };
    default: return { x: a.x, y: a.y, w: a.w || 10, h: a.h || 10 };
  }
}
function translate(a, dx, dy) {
  if (a.type === 'line' || a.type === 'arrow') { a.x1 += dx; a.x2 += dx; a.y1 += dy; a.y2 += dy; }
  else if (a.type === 'ink') a.points = a.points.map(([x, y]) => [x + dx, y + dy]);
  else { a.x += dx; a.y += dy; }
}
function scaleTo(a, o, ob, nb) {
  const sx = ob.w ? nb.w / ob.w : 1, sy = ob.h ? nb.h / ob.h : 1;
  const mx = (x) => nb.x + (x - ob.x) * sx, my = (y) => nb.y + (y - ob.y) * sy;
  if (a.type === 'text') { a.size = clamp(o.size * (nb.h / ob.h), 4, 300); }
  else if (a.type === 'line' || a.type === 'arrow') { a.x1 = mx(o.x1); a.x2 = mx(o.x2); a.y1 = my(o.y1); a.y2 = my(o.y2); }
  else if (a.type === 'ink') a.points = o.points.map(([x, y]) => [mx(x), my(y)]);
  else if (a.type !== 'note') { a.x = nb.x; a.y = nb.y; a.w = nb.w; a.h = nb.h; }
}
function arrowHead(x1, y1, x2, y2, w) {
  const len = Math.max(8, w * 4), ang = Math.atan2(y2 - y1, x2 - x1), sp = 0.5;
  const l = [x2 - len * Math.cos(ang - sp), y2 - len * Math.sin(ang - sp)], r = [x2 - len * Math.cos(ang + sp), y2 - len * Math.sin(ang + sp)];
  const base = [x2 - len * 0.8 * Math.cos(ang), y2 - len * 0.8 * Math.sin(ang)];
  return { path: `M ${x2} ${y2} L ${l[0]} ${l[1]} L ${r[0]} ${r[1]} Z`, base };
}
const inkPath = (pts) => pts.length === 1 ? `M ${pts[0][0]} ${pts[0][1]} L ${pts[0][0] + 0.01} ${pts[0][1]}` : 'M ' + pts.map((p) => `${+p[0].toFixed(2)} ${+p[1].toFixed(2)}`).join(' L ');

/* ------------------------------------------------------------------ history */
const H = { undo: [], redo: [] };
const snap = () => JSON.stringify({ pages: S.pages, annots: S.annots, form: S.form, docOps: S.docOps });
function commit(before) { H.undo.push(before); if (H.undo.length > 150) H.undo.shift(); H.redo.length = 0; S.dirty = true; updUndo(); }
function restore(s) { const o = JSON.parse(s); S.pages = o.pages; S.annots = o.annots; S.form = o.form; S.docOps = o.docOps; S.sel = null; rebuildViewer(); renderThumbs(); updateProps(); }
function undo() { finishEdit(); if (!H.undo.length) return; H.redo.push(snap()); restore(H.undo.pop()); updUndo(); }
function redo() { finishEdit(); if (!H.redo.length) return; H.undo.push(snap()); restore(H.redo.pop()); updUndo(); }
function updUndo() { $('#btnUndo').disabled = !H.undo.length; $('#btnRedo').disabled = !H.redo.length; }

/* ------------------------------------------------------------------ loading */
async function openPdfBytes(bytes, name) {
  const task = pdfjsLib.getDocument({ ...PDF_OPTS, data: bytes.slice() });
  task.onPassword = (cb, reason) => {
    const pw = prompt(reason === 2 ? 'Incorrect password. Try again:' : `"${name}" is password-protected. Enter the password:`);
    if (pw === null) task.destroy(); else cb(pw);
  };
  const pdf = await task.promise;
  const src = { id: uid(), name, bytes, pdf, numPages: pdf.numPages, rasterOnly: false, lib: null };
  try { src.lib = await L.PDFDocument.load(bytes, { updateMetadata: false }); }
  catch (e) { src.rasterOnly = true; console.warn('pdf-lib could not parse; pages will be flattened on save', e); }
  S.sources.set(src.id, src);
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const pg = await pdf.getPage(i); const [x0, y0, x1, y1] = pg.view;
    pages.push({ id: uid(), srcId: src.id, index: i - 1, x0, y0, w: x1 - x0, h: y1 - y0, baseRot: pg.rotate || 0, rot: 0 });
  }
  if (src.lib) detectFields(src);
  return { src, pages };
}
async function normalizeImage(file) {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
  const ctx = c.getContext('2d');
  const isJpg = /jpe?g/i.test(file.type);
  if (isJpg) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
  ctx.drawImage(bmp, 0, 0);
  const type = isJpg ? 'jpg' : 'png';
  const dataUrl = c.toDataURL(isJpg ? 'image/jpeg' : 'image/png', 0.92);
  return { dataUrl, type, w: c.width, h: c.height };
}
const dataUrlBytes = (u) => Uint8Array.from(atob(u.split(',')[1]), (c) => c.charCodeAt(0));
async function imageToPdfBytes(file) {
  const im = await normalizeImage(file);
  const doc = await L.PDFDocument.create();
  const img = im.type === 'png' ? await doc.embedPng(dataUrlBytes(im.dataUrl)) : await doc.embedJpg(dataUrlBytes(im.dataUrl));
  const land = im.w > im.h; const [pw, ph] = land ? [842, 595] : [595, 842];
  const m = 24, s = Math.min((pw - 2 * m) / im.w, (ph - 2 * m) / im.h);
  const page = doc.addPage([pw, ph]);
  page.drawImage(img, { x: (pw - im.w * s) / 2, y: (ph - im.h * s) / 2, width: im.w * s, height: im.h * s });
  return doc.save();
}
async function blankPdfBytes(w = 595.28, h = 841.89) { const d = await L.PDFDocument.create(); d.addPage([w, h]); return d.save(); }
const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isImg = (f) => f.type.startsWith('image/');

async function loadFiles(files, replace) {
  files = [...files].filter((f) => isPdf(f) || isImg(f));
  if (!files.length) { toast('Please choose PDF or image files.', true); return; }
  if (replace && S.dirty && !confirm('Discard your unsaved changes and open a new file?')) return;
  busy(true, 'Opening…');
  try {
    const newPages = [];
    for (const f of files) {
      const bytes = isPdf(f) ? new Uint8Array(await f.arrayBuffer()) : await imageToPdfBytes(f);
      const { pages } = await openPdfBytes(bytes, f.name);
      newPages.push(...pages);
    }
    if (replace) {
      resetDoc(newPages);
      S.fileName = files.length === 1 && isPdf(files[0]) ? files[0].name : (isPdf(files[0]) ? files[0].name : 'images.pdf');
      S.pages = newPages; S.dirty = files.some(isImg) || files.length > 1;
      startDoc();
    } else {
      const before = snap(); S.pages.push(...newPages); commit(before);
      rebuildViewer(); renderThumbs(); toast(`Added ${newPages.length} page${newPages.length > 1 ? 's' : ''}.`);
    }
    const nf = S.fields.length;
    if (replace && nf) toast(`This PDF has ${nf} fillable form field${nf > 1 ? 's' : ''}. Click a field to type in it.`, false, 5000);
  } catch (e) {
    console.error(e); toast('Could not open file: ' + (e?.message || e), true, 6000);
  } finally { busy(false); }
}
async function newBlank() {
  if (S.dirty && !confirm('Discard your unsaved changes?')) return;
  const { pages } = await openPdfBytes(await blankPdfBytes(), 'blank.pdf');
  resetDoc(pages); S.fileName = 'untitled.pdf'; S.pages = pages; S.dirty = false; startDoc();
}
function resetDoc(keepPages = []) {
  const keep = new Set(keepPages.map((p) => p.srcId));
  for (const [id, src] of S.sources) if (!keep.has(id)) { safe(() => src.pdf.destroy()); S.sources.delete(id); }
  const keepKey = (k) => keep.has(k.split('::')[0]);
  S.fields = S.fields.filter((f) => keep.has(f.srcId));
  S.form = Object.fromEntries(Object.entries(S.form).filter(([k]) => keepKey(k)));
  S.formInit = Object.fromEntries(Object.entries(S.formInit).filter(([k]) => keepKey(k)));
  S.annots = []; S.sel = null; S.placing = null; S.selPages.clear(); S.current = 0;
  S.docOps = { pageNumbers: null, watermark: null, meta: null };
  H.undo = []; H.redo = []; textCache.clear(); thumbCache.clear(); search.hits = []; search.q = ''; $('#searchInput').value = ''; $('#searchCount').textContent = '';
  for (const pe of pageEls.values()) { io.unobserve(pe.wrap); pe.wrap.remove(); } pageEls.clear();
}
function startDoc() {
  document.body.classList.add('has-doc'); updUndo();
  if (innerWidth < 760) $('#sidebar').classList.add('hidden');
  $('#statusFile').textContent = S.fileName;
  S.zoomMode = 'fit'; computeZoom();
  rebuildViewer(); renderThumbs(); setTool('select');
  $('#viewer').scrollTop = 0;
}

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
      requestAnimationFrame(() => { if (el.isConnected) { a.w = el.offsetWidth / S.zoom; a.h = el.offsetHeight / S.zoom; } });
      break;
    case 'highlight': pos(a); el.style.background = a.color; el.style.opacity = op; break;
    case 'whiteout': pos(a); el.style.background = '#fff'; break;
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
  Object.assign(el.style, { left: a.x * z + 'px', top: a.y * z + 'px', fontSize: a.size * z + 'px', fontFamily: FONT_CSS[a.font], fontWeight: a.bold ? 700 : 400, fontStyle: a.italic ? 'italic' : 'normal', color: a.color, opacity: a.opacity ?? 1 });
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
    case 'highlight': case 'rect': case 'ellipse': case 'whiteout': case 'redact': e.preventDefault(); dragRect(e, p, pe, t); return;
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
  el.oninput = () => { a.text = el.innerText.replace(/\n$/, ''); a.w = el.offsetWidth / S.zoom; a.h = el.offsetHeight / S.zoom; };
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
function textItems(p) {
  const key = `${p.srcId}:${p.index}:${totalRot(p)}`;
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
      out.push({ str: it.str, eol: it.hasEOL, o: [tx[4], tx[5]], dir: [tx[0] / dl, tx[1] / dl], up: [tx[2] / fh, tx[3] / fh], fh, width: it.width, family: tc.styles[it.fontName]?.fontFamily || '' });
    }
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
function convertItem(p, it, r) {
  finishEdit();
  const before = snap();
  const fam = /mono|courier/i.test(it.family) ? 'Courier' : (/serif|times/i.test(it.family) && !/sans/i.test(it.family)) ? 'Times' : 'Helvetica';
  S.annots.push({ id: uid(), pageId: p.id, type: 'whiteout', x: r.x - 1, y: r.y - 1, w: r.w + 2, h: r.h + 2 });
  const size = Math.round(it.fh * 10) / 10;
  const a = { id: uid(), pageId: p.id, type: 'text', text: it.str.replace(/ﬁ/g, 'fi').replace(/ﬂ/g, 'fl').replace(/ﬀ/g, 'ff'), x: it.o[0], y: it.o[1] - size * BASELINE[fam], size, font: fam, bold: false, italic: false, color: '#000000', opacity: 1 };
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
  const drawing = ['highlight', 'rect', 'ellipse', 'line', 'arrow', 'draw', 'whiteout', 'redact'].includes(t);
  $$('.overlay').forEach((o) => { o.classList.toggle('drawing', drawing); o.classList.toggle('texting', ['text', 'date', 'note'].includes(t)); });
  if (t !== 'select') deselect();
  $('#statusHint').textContent = HINTS[t] || '';
  S.pages.forEach((p) => { const pe = pageEls.get(p.id); if (!pe) return; if (t === 'edittext') renderTextLayer(p); else pe.tl.innerHTML = ''; });
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
  if (st.font) $('#propFont').value = st.font;
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
$('#propFont').addEventListener('change', (e) => applyProp('font', e.target.value, true));
$('#propSize').addEventListener('change', (e) => applyProp('size', clamp(+e.target.value || 12, 4, 300), true));
$('#propStroke').addEventListener('input', (e) => applyProp('width', +e.target.value));
$('#propStroke').addEventListener('change', (e) => applyProp('width', +e.target.value, true));
$('#propOpacity').addEventListener('input', (e) => applyProp('opacity', +e.target.value));
$('#propOpacity').addEventListener('change', (e) => applyProp('opacity', +e.target.value, true));
$('#propBold').addEventListener('click', () => { applyProp('bold', !currentStyle().st.bold, true); updateProps(); });
$('#propItalic').addEventListener('click', () => { applyProp('italic', !currentStyle().st.italic, true); updateProps(); });
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
$('#pgDelete').onclick = () => { const ids = selectedOrCurrent(); if (confirm(`Delete ${ids.length} page${ids.length > 1 ? 's' : ''}?`)) deletePages(ids); };
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
async function drawAnnots(out, pg, vp, list, getFont, getImg) {
  if (!list.length) return;
  const Hd = dispSize(vp).h; const notes = [];
  pg.pushOperators(L.pushGraphicsState(), L.concatTransformationMatrix(...matrixFor(vp)));
  for (const a of list) {
    const op = a.opacity ?? 1;
    switch (a.type) {
      case 'text': {
        const f = await getFont(fontKey(a.font, a.bold, a.italic));
        a.text.split('\n').forEach((ln, i) => { const s = sanitize(f, ln); if (s) pg.drawText(s, { x: a.x, y: Hd - (a.y + a.size * (1.2 * i + BASELINE[a.font])), size: a.size, font: f, color: hex2rgb(a.color), opacity: op }); });
        break;
      }
      case 'highlight': pg.drawRectangle({ x: a.x, y: Hd - a.y - a.h, width: a.w, height: a.h, color: hex2rgb(a.color), opacity: op, blendMode: L.BlendMode.Multiply }); break;
      case 'whiteout': pg.drawRectangle({ x: a.x, y: Hd - a.y - a.h, width: a.w, height: a.h, color: L.rgb(1, 1, 1) }); break;
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
  try { const bytes = await buildPdf(opts); download(bytes, name || S.fileName); S.dirty = false; toast(`Saved ${name || S.fileName} (${fmtBytes(bytes.length)})`); return bytes; }
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
$('#btnOpen').onclick = () => $('#fileOpen').click(); $('#wOpen').onclick = () => $('#fileOpen').click();
$('#wImages').onclick = () => $('#fileOpen').click(); $('#wBlank').onclick = newBlank;
$('#btnAdd').onclick = () => $('#fileAdd').click();
$('#fileOpen').onchange = (e) => { const f = [...e.target.files]; e.target.value = ''; if (f.length) loadFiles(f, true); };
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
  if (mod && k === 'o') { e.preventDefault(); $('#fileOpen').click(); return; }
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
window.__pdfstudio = { S, buildPdf, loadFiles, setTool }; // handy for debugging in the console
