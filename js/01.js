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
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
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
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
  crop: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  unlock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.8-1.3"/>',
  ocr: '<path d="M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3"/><path d="M8 9h8M8 12h8M8 15h5"/>',
  compare: '<rect x="3" y="4" width="7" height="16" rx="1"/><rect x="14" y="4" width="7" height="16" rx="1"/><path d="M5.5 9h2M5.5 13h2M16.5 9h2M16.5 13h2"/>',
  word: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="m8 12 1.2 5L12 13l2.8 4L16 12"/>',
  txt: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>',
  scan: '<path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="3"/>',
  workflow: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M9 6h6a3 3 0 0 1 3 3v6"/>',
  speaker: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  present: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  header: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 8h18M3 16h18"/>',
  resize: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  broom: '<path d="m13 11 8-8M8 13l3 3-3 5-6-6 5-3z"/><path d="m11 16 2-2-3-3-2 2"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
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
    highlight: { color: '#fde047', opacity: 0.45, width: 14 },
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
  highlight: ['color', 'stroke', 'opacity'], draw: ['color', 'stroke', 'opacity'], rect: ['color', 'fill', 'stroke', 'opacity'], ellipse: ['color', 'fill', 'stroke', 'opacity'],
  line: ['color', 'stroke', 'opacity'], arrow: ['color', 'stroke', 'opacity'], image: ['opacity'], crop: [], field: [],
};
const HINTS = {
  select: 'Click an item to select it. Drag to move, use the corner handle to resize. Double-click text to edit. Fill form fields by clicking them.',
  hand: 'Drag to scroll around the document.', text: 'Click anywhere on a page to add text.',
  edittext: 'Click on existing text to replace it. Scanned or flattened page? Run OCR first (All tools → OCR) so its text can be edited.',
  highlight: 'Drag sideways along a line of text to highlight it. The stroke stays straight and snaps to the line; change thickness with Width.', draw: 'Draw freehand with your mouse, pen or finger.',
  rect: 'Drag to draw a box.', ellipse: 'Drag to draw a circle or ellipse.', line: 'Drag to draw a line.', arrow: 'Drag to draw an arrow.',
  note: 'Click to add a sticky-note comment.', date: "Click to insert today's date.",
  whiteout: 'Drag to cover content with white. (Hidden content is still in the file — use Redact to remove it.)',
  redact: 'Drag over sensitive content. On save, those pages are flattened and everything under the boxes is permanently removed.',
  crop: 'Drag a box around the part of the page you want to keep.',
  field: 'Drag a box where the fillable field should go. You can then name it and choose its type.',
};

/* ------------------------------------------------------------------ UI utilities */
function toast(msg, err = false, ms = 3500) {
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg;
  $('#toasts').appendChild(t); setTimeout(() => t.remove(), ms);
}
function busy(on, text = 'Working…') { $('#busyText').textContent = text; $('#busy').classList.toggle('on', on); }
// Inside a Claude-hosted page, downloads go through the platform's `downloads` capability.
const IN_CLAUDE = !!(window.claude && typeof window.claude.use === 'function');
let claudeDownloads = null;
if (IN_CLAUDE) window.claude.use('downloads').then((d) => (claudeDownloads = d)).catch(() => {});
async function download(bytes, name, type = 'application/pdf') {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type });
  if (IN_CLAUDE) {
    if (!claudeDownloads) claudeDownloads = await safe(() => window.claude.use('downloads'), null);
    if (!claudeDownloads) { toast('Saving files is not available in this view.', true); return false; }
    try { await claudeDownloads.save({ filename: name, data: blob }); return true; }
    catch (e) {
      if (e?.code === 'declined') toast('Save cancelled.');
      else if (e?.code === 'rate_limited') toast('Another save is waiting for confirmation — try again in a moment.', true);
      else if (e?.code === 'host_unavailable') toast('This app cannot save files. Open the page in a web browser to save.', true, 6000);
      else toast('Could not save the file' + (e?.message ? ': ' + e.message : '.'), true);
      return false;
    }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 30000);
  return true;
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
    actions.forEach((a, i) => { m.querySelector(`[data-act="${i}"]`).onclick = async () => {
      let v;
      if (a.onClick) { v = await a.onClick(m); if (v === false) return; if (v === undefined) v = true; } // false keeps the dialog open (e.g. invalid input)
      else v = 'value' in a ? a.value : true; // Cancel buttons carry value: null / false
      closeModal(v);
    }; });
    onOpen && onOpen(m);
  });
}
function askConfirm(message, okLabel = 'OK', danger = false) {
  return modal({ title: 'Please confirm', body: `<p style="margin:0;line-height:1.5">${esc(message)}</p>`, actions: [{ label: 'Cancel', value: false }, { label: okLabel, primary: true, value: true }] }).then((v) => v === true);
}
function askPassword(message) {
  return modal({
    title: 'Password required', body: `<label class="f">${esc(message)}<input type="password" id="askPw" autocomplete="off"></label>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Open', primary: true, onClick: (m) => m.querySelector('#askPw').value }],
    onOpen: (m) => { const i = m.querySelector('#askPw'); setTimeout(() => i.focus(), 50); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); m.querySelector('footer .primary').click(); } }); },
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
// The visible area of a page in display space: the crop box if the page is cropped.
const contentBox = (p) => { const d = dispSize(p); return p.crop ? { ...p.crop } : { x: 0, y: 0, w: d.w, h: d.h }; };
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
const snap = () => JSON.stringify({ pages: S.pages, annots: S.annots, form: S.form, docOps: S.docOps, bookmarks: S.bookmarks });
function commit(before) { H.undo.push(before); if (H.undo.length > 150) H.undo.shift(); H.redo.length = 0; S.dirty = true; updUndo(); onChanged(); }
function restore(s) { const o = JSON.parse(s); S.pages = o.pages; S.annots = o.annots; S.form = o.form; S.docOps = o.docOps; S.bookmarks = o.bookmarks || []; S.sel = null; rebuildViewer(); renderThumbs(); updateProps(); onChanged(); }
function undo() { finishEdit(); if (!H.undo.length) return; H.redo.push(snap()); restore(H.undo.pop()); updUndo(); }
function redo() { finishEdit(); if (!H.redo.length) return; H.undo.push(snap()); restore(H.redo.pop()); updUndo(); }
function updUndo() { $('#btnUndo').disabled = !H.undo.length; $('#btnRedo').disabled = !H.redo.length; }

/* ------------------------------------------------------------------ loading */
async function openPdfBytes(bytes, name) {
  const task = pdfjsLib.getDocument({ ...PDF_OPTS, data: bytes.slice(), fontExtraProperties: true });
  let usedPw = '';
  task.onPassword = async (cb, reason) => {
    busy(false);
    const pw = await askPassword(reason === 2 ? 'Incorrect password. Try again:' : `"${name}" is password-protected. Enter the password:`);
    busy(true, 'Opening…');
    if (pw === null) task.destroy(); else { usedPw = pw; cb(pw); }
  };
  const pdf = await task.promise;
  const src = { id: uid(), name, bytes, pdf, numPages: pdf.numPages, rasterOnly: false, lib: null };
  try { src.lib = await L.PDFDocument.load(bytes, { updateMetadata: false }); }
  catch (e) {
    if (/encrypt/i.test(e?.message || '')) { // unlock a copy with QPDF so it stays fully editable
      src.encrypted = true; busy(true, 'Unlocking…');
      const dec = await qpdfDecrypt(bytes, usedPw);
      if (dec) { try { src.lib = await L.PDFDocument.load(dec, { updateMetadata: false }); src.bytes = dec; src.unlocked = true; } catch { } }
    }
    if (!src.lib) { src.rasterOnly = true; console.warn('pdf-lib could not parse; pages will be flattened on save', e); }
  }
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
  if (replace && S.dirty && !(await askConfirm('Discard your unsaved changes and open a new file?', 'Discard'))) return;
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
      await importOutlines(newPages);
      startDoc();
    } else {
      const before = snap(); S.pages.push(...newPages); await importOutlines(newPages); commit(before);
      rebuildViewer(); renderThumbs(); toast(`Added ${newPages.length} page${newPages.length > 1 ? 's' : ''}.`);
    }
    const nf = S.fields.length;
    if (replace && nf) toast(`This PDF has ${nf} fillable form field${nf > 1 ? 's' : ''}. Click a field to type in it.`, false, 5000);
  } catch (e) {
    console.error(e); toast('Could not open file: ' + (e?.message || e), true, 6000);
  } finally { busy(false); }
}
async function newBlank() {
  if (S.dirty && !(await askConfirm('Discard your unsaved changes?', 'Discard'))) return;
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
  S.ocr = {}; S.bookmarks = []; linkCache.clear(); stopReading(); if (present) exitPresent();
  H.undo = []; H.redo = []; textCache.clear(); textResolved.clear(); pdfFontJobs.clear(); thumbCache.clear(); search.hits = []; search.q = ''; $('#searchInput').value = ''; $('#searchCount').textContent = '';
  for (const pe of pageEls.values()) { io.unobserve(pe.wrap); pe.wrap.remove(); } pageEls.clear();
}
function startDoc() {
  document.body.classList.add('has-doc'); updUndo();
  if (innerWidth < 760) $('#sidebar').classList.add('hidden');
  $('#statusFile').textContent = S.fileName;
  S.zoomMode = 'fit'; computeZoom();
  rebuildViewer(); renderThumbs(); setTool('select');
  $('#viewer').scrollTop = 0;
  applyViewModes(); renderOutline(); renderComments(); restoreResume();
}

