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
    const map = { v: 'select', h: 'hand', t: 'text', e: 'edittext', d: 'draw', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow', n: 'note', c: 'crop', f: 'field' };
    if (map[k]) setTool(map[k]);
    if (k === 'pagedown' || k === 'pageup') { e.preventDefault(); scrollToPage(clamp(S.current + (k === 'pagedown' ? 1 : -1), 0, S.pages.length - 1)); }
  }
});
window.addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });

/* ================================================================== more tools (v2) */
S.view = { two: false, night: false, dark: false };
S.ocr = {}; // `${srcId}:${index}` -> [{ t, x, y, w, h, r }] in PDF page space; r = display rotation when recognized
S.bookmarks = [];
const CDN = 'https://cdn.jsdelivr.net/npm/';
const LOCAL_LIB = null; // optional: a folder URL that hosts the OCR/QPDF files locally instead of the CDN
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); });
}
function askText(title, label, value = '', placeholder = '') {
  return modal({
    title, body: `<label class="f">${esc(label)}<input type="text" id="askT" value="${esc(value)}" placeholder="${esc(placeholder)}"></label>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'OK', primary: true, onClick: (m) => m.querySelector('#askT').value }],
    onOpen: (m) => { const i = m.querySelector('#askT'); setTimeout(() => { i.focus(); i.select(); }, 50); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); m.querySelector('footer .primary').click(); } }); },
  });
}
const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
function onChanged() { clearTimeout(onChanged.t); onChanged.t = setTimeout(() => { renderComments(); renderOutline(); }, 60); }
function pagesFromRange(str) { return str && str.trim() ? [...new Set(parseRanges(str, S.pages.length).flat())] : S.pages.map((_, i) => i); }

/* ------------------------------------------------------------------ menus, theme, view modes */
function wireMenu(btn, menu, onPick, onOpen) {
  btn.addEventListener('click', (e) => {
    e.stopPropagation(); const was = menu.classList.contains('open');
    $$('.menu.open').forEach((m) => m.classList.remove('open')); if (was) return;
    onOpen && onOpen(menu);
    const r = btn.getBoundingClientRect(); menu.style.top = r.bottom + 6 + 'px'; menu.style.right = Math.max(8, innerWidth - r.right) + 'px'; menu.classList.add('open');
  });
  menu.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; e.stopPropagation(); menu.classList.remove('open'); onPick(b.dataset); });
}
document.addEventListener('click', () => $$('.menu.open').forEach((m) => m.classList.remove('open')));
function applyTheme() { document.body.classList.toggle('dark', !!S.view.dark); $('#btnTheme').title = S.view.dark ? 'Light mode' : 'Dark mode'; }
S.view.dark = LS.get('pdfstudio.dark', !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches));
applyTheme();
$('#btnTheme').onclick = () => { S.view.dark = !S.view.dark; LS.set('pdfstudio.dark', S.view.dark); applyTheme(); };
function applyViewModes() { document.body.classList.toggle('night', !!S.view.night); }
wireMenu($('#btnView'), $('#viewMenu'), (d) => {
  if (d.v === 'two') { S.view.two = !S.view.two; setZoom(S.zoomMode === 'custom' ? S.zoom : S.zoomMode); scrollToPage(S.current); }
  if (d.v === 'night') { S.view.night = !S.view.night; applyViewModes(); }
  if (d.v === 'present') startPresent();
  if (d.v === 'read') startReading(S.current);
  if (d.v === 'info') infoDialog();
}, (menu) => { menu.querySelector('[data-v="two"]').classList.toggle('on', !!S.view.two); menu.querySelector('[data-v="night"]').classList.toggle('on', !!S.view.night); });

/* resume where you left off */
const resumeKey = () => { const s = S.sources.get(S.pages[0]?.srcId); return s ? `pdfstudio.pos:${S.fileName}:${s.bytes.length}:${S.pages.length}` : null; };
function saveResume() { clearTimeout(saveResume.t); saveResume.t = setTimeout(() => { const k = resumeKey(); if (k) LS.set(k, S.current); }, 500); }
function restoreResume() {
  const k = resumeKey(); const i = k ? LS.get(k, 0) : 0;
  if (i > 0 && i < S.pages.length) setTimeout(() => { scrollToPage(i); toast(`Opened where you left off — page ${i + 1}.`); }, 300);
}

/* presentation mode */
let present = null;
function startPresent() {
  if (!S.pages.length) return; finishEdit(); deselect();
  present = { i: S.current }; const ov = $('#present'); ov.hidden = false;
  safe(() => ov.requestFullscreen && ov.requestFullscreen().catch(() => {}));
  renderPresent();
}
function exitPresent() {
  if (!present) return; const i = present.i; present = null; $('#present').hidden = true; $('#presentStage').innerHTML = '';
  if (document.fullscreenElement) safe(() => document.exitFullscreen().catch(() => {}));
  scrollToPage(i);
}
async function renderPresent() {
  if (!present) return; const token = (present.token = (present.token || 0) + 1);
  const p = S.pages[present.i]; const d = dispSize(p); const W = innerWidth, Hh = innerHeight;
  const sc = Math.min(W / d.w, Hh / d.h) * 0.98;
  const page = await S.sources.get(p.srcId).pdf.getPage(p.index + 1);
  const dpr = Math.min(devicePixelRatio || 1, 2); const vp = page.getViewport({ scale: sc * dpr, rotation: totalRot(p) });
  const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  if (!present || present.token !== token) return;
  const box = document.createElement('div'); box.className = 'present-page'; Object.assign(box.style, { width: d.w * sc + 'px', height: d.h * sc + 'px' });
  Object.assign(c.style, { width: '100%', height: '100%', display: 'block' }); box.appendChild(c);
  const pe = pageEls.get(p.id);
  if (pe) for (const layer of [pe.preview, pe.overlay]) {
    const cl = layer.cloneNode(true); cl.querySelectorAll('.handle,.annot-del,.note-pop').forEach((x) => x.remove());
    Object.assign(cl.style, { width: d.w * S.zoom + 'px', height: d.h * S.zoom + 'px', transformOrigin: '0 0', transform: `scale(${sc / S.zoom})`, pointerEvents: 'none', inset: 'auto', left: 0, top: 0 });
    box.appendChild(cl);
  }
  $('#presentStage').replaceChildren(box);
  $('#presentCount').textContent = `${present.i + 1} / ${S.pages.length}`;
}
function presentGo(delta) { if (!present) return; const n = clamp(present.i + delta, 0, S.pages.length - 1); if (n !== present.i) { present.i = n; renderPresent(); } }
document.addEventListener('keydown', (e) => {
  if (!present) return; const k = e.key;
  if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter'].includes(k)) { e.preventDefault(); e.stopImmediatePropagation(); presentGo(1); }
  else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(k)) { e.preventDefault(); e.stopImmediatePropagation(); presentGo(-1); }
  else if (k === 'Home') { e.preventDefault(); present.i = 0; renderPresent(); }
  else if (k === 'End') { e.preventDefault(); present.i = S.pages.length - 1; renderPresent(); }
  else if (k === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); exitPresent(); }
}, true);
$('#present').addEventListener('click', (e) => { if (e.target.closest('#presentClose')) return exitPresent(); presentGo(e.clientX > innerWidth / 3 ? 1 : -1); });
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && present) exitPresent(); });
window.addEventListener('resize', () => present && renderPresent());

/* read aloud */
const tts = { on: false, page: 0, rate: 1 };
async function startReading(from = 0) {
  if (!('speechSynthesis' in window)) return toast('Read aloud is not supported in this browser.', true);
  stopReading(); tts.on = true; tts.page = from; $('#ttsBar').hidden = false; $('#ttsPause').textContent = 'Pause'; readPage();
}
async function readPage() {
  if (!tts.on) return; if (tts.page >= S.pages.length) { stopReading(); return toast('Finished reading.'); }
  const p = S.pages[tts.page]; scrollToPage(tts.page); $('#ttsLabel').textContent = `Reading page ${tts.page + 1} of ${S.pages.length}`;
  const text = (await pageLines(p)).map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
  if (!tts.on) return;
  if (!text) { tts.page++; return readPage(); }
  const chunks = []; let cur = '';
  for (const s of text.split(/(?<=[.!?;:])\s+/)) { if ((cur + ' ' + s).length > 200 && cur) { chunks.push(cur); cur = s; } else cur = cur ? cur + ' ' + s : s; }
  if (cur) chunks.push(cur);
  let k = 0;
  const next = () => {
    if (!tts.on) return; if (k >= chunks.length) { tts.page++; return readPage(); }
    const u = new SpeechSynthesisUtterance(chunks[k++].slice(0, 400)); u.rate = tts.rate; u.onend = next;
    u.onerror = (e) => { if (e.error === 'not-allowed') { stopReading(); toast('Your browser blocked read aloud. Click View → Read aloud to start it.', true, 6000); } else if (e.error !== 'interrupted' && e.error !== 'canceled') next(); };
    speechSynthesis.speak(u);
  };
  next();
}
function stopReading() { tts.on = false; safe(() => speechSynthesis.cancel()); const b = $('#ttsBar'); if (b) b.hidden = true; }
$('#ttsStop').onclick = stopReading;
$('#ttsPause').onclick = () => { if (speechSynthesis.paused) { speechSynthesis.resume(); $('#ttsPause').textContent = 'Pause'; } else { speechSynthesis.pause(); $('#ttsPause').textContent = 'Resume'; } };
$('#ttsNext').onclick = () => { if (!tts.on) return; safe(() => speechSynthesis.cancel()); const t = tts.on; tts.on = false; setTimeout(() => { tts.on = t; tts.page++; readPage(); }, 50); };
$('#ttsRate').onchange = (e) => { tts.rate = +e.target.value; };

/* ------------------------------------------------------------------ text lines (reading order) */
async function pageLines(p) { return linesFromItems(await textItems(p)); }
function linesFromItems(items) {
  items = items.filter((it) => it.str && it.str.trim() !== '' || it.str === ' ');
  if (!items.length) return [];
  const ref = items.reduce((a, b) => (b.width > a.width ? b : a));
  const D = ref.dir, U = ref.up;
  const rows = items.map((it) => ({ it, along: it.o[0] * D[0] + it.o[1] * D[1], y: -(it.o[0] * U[0] + it.o[1] * U[1]) })).sort((a, b) => a.y - b.y || a.along - b.along);
  const lines = [];
  for (const r of rows) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(r.y - last.y) < Math.max(2, Math.min(r.it.fh, last.size) * 0.5)) last.parts.push(r);
    else lines.push({ y: r.y, size: r.it.fh, parts: [r] });
  }
  return lines.map((l) => {
    l.parts.sort((a, b) => a.along - b.along);
    let text = '', end = null; const rects = []; const sizes = [];
    for (const { it, along } of l.parts) {
      if (end !== null && along - end > it.fh * 0.22 && !text.endsWith(' ') && !it.str.startsWith(' ')) text += ' ';
      text += it.str; end = along + it.width; sizes.push(it.fh); if (it.str.trim()) rects.push(itemRect(it));
    }
    sizes.sort((a, b) => a - b);
    const rect = rects.length ? rects.reduce((a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), r: Math.max(a.r, b.x + b.w), b: Math.max(a.b, b.y + b.h) }), { x: Infinity, y: Infinity, r: -Infinity, b: -Infinity }) : null;
    return { text: text.replace(/\s+/g, ' ').trim(), size: sizes[sizes.length >> 1] || l.size, y: l.y, rect: rect && { x: rect.x, y: rect.y, w: rect.r - rect.x, h: rect.b - rect.y } };
  }).filter((l) => l.text);
}
function bodySize(allLines) { const s = allLines.map((l) => Math.round(l.size * 2) / 2).sort((a, b) => a - b); return s[s.length >> 1] || 11; }
function linesToBlocks(lines, body) {
  const blocks = []; let cur = null;
  for (const ln of lines) {
    const level = ln.size >= body * 1.6 ? 1 : ln.size >= body * 1.3 ? 2 : ln.size >= body * 1.12 ? 3 : 0;
    const bullet = /^([•●▪◦‣\-–*]|\d+[.)])\s+/.test(ln.text);
    if (cur && !level && !cur.level && !bullet && Math.abs(ln.size - cur.size) < body * 0.15 && ln.y - cur.lastY < ln.size * 1.9 && ln.y > cur.lastY) {
      cur.text = cur.text.endsWith('-') ? cur.text.slice(0, -1) + ln.text : cur.text + ' ' + ln.text; cur.lastY = ln.y; continue;
    }
    cur = { text: ln.text, size: ln.size, level, bullet, lastY: ln.y }; blocks.push(cur);
  }
  return blocks;
}

/* ------------------------------------------------------------------ OCR text in the text layer */
function ocrItems(p) {
  const words = S.ocr[`${p.srcId}:${p.index}`]; if (!words) return [];
  const cur = totalRot(p);
  return words.map((w) => {
    const R = pageRectToDisp(p, { x: w.x, y: w.y, width: w.w, height: w.h });
    const delta = ((cur - w.r) % 360 + 360) % 360;
    let o, dir, up, fh, width;
    if (delta === 0) { fh = R.h / 1.16; o = [R.x, R.y + fh * 0.92]; dir = [1, 0]; up = [0, -1]; width = R.w; }
    else if (delta === 90) { fh = R.w / 1.16; o = [R.x + R.w - fh * 0.92, R.y]; dir = [0, 1]; up = [1, 0]; width = R.h; }
    else if (delta === 180) { fh = R.h / 1.16; o = [R.x + R.w, R.y + R.h - fh * 0.92]; dir = [-1, 0]; up = [0, 1]; width = R.w; }
    else { fh = R.w / 1.16; o = [R.x + fh * 0.92, R.y + R.h]; dir = [0, -1]; up = [-1, 0]; width = R.h; }
    return { str: w.t + ' ', eol: false, o, dir, up, fh, width, fontName: null, family: 'sans-serif', ocr: true };
  });
}
function clearTextCache(p) { for (const k of [...textCache.keys()]) if (k.startsWith(`${p.srcId}:${p.index}:`)) { textCache.delete(k); textResolved.delete(k); } }
async function drawOcrLayer(pg, p, vp, getFont) {
  const words = S.ocr[`${p.srcId}:${p.index}`]; if (!words?.length) return;
  const f = await getFont('Helvetica'); const Hd = dispSize(vp).h;
  pg.pushOperators(L.pushGraphicsState(), L.concatTransformationMatrix(...matrixFor(vp)), L.setTextRenderingMode(L.TextRenderingMode.Invisible));
  for (const it of ocrItems(p)) {
    const s = sanitize(f, it.str.trim()); if (!s) continue;
    const size = Math.max(1, it.fh); const nat = f.widthOfTextAtSize(s, size); if (!nat) continue;
    const ang = Math.round(Math.atan2(-it.dir[1], it.dir[0]) * 180 / Math.PI);
    pg.pushOperators(L.setCharacterSqueeze(clamp(it.width / nat * 100, 10, 500)));
    pg.drawText(s, { x: it.o[0], y: Hd - it.o[1], size, font: f, rotate: L.degrees(ang) });
  }
  pg.pushOperators(L.setCharacterSqueeze(100), L.popGraphicsState());
}
const OCR_LANGS = [['eng', 'English'], ['fil', 'Filipino'], ['spa', 'Spanish'], ['fra', 'French'], ['deu', 'German'], ['ita', 'Italian'], ['por', 'Portuguese'], ['nld', 'Dutch'], ['ind', 'Indonesian'], ['vie', 'Vietnamese'], ['chi_sim', 'Chinese (Simplified)'], ['chi_tra', 'Chinese (Traditional)'], ['jpn', 'Japanese'], ['kor', 'Korean'], ['ara', 'Arabic'], ['hin', 'Hindi'], ['rus', 'Russian']];
async function ocrDialog() {
  const saved = LS.get('pdfstudio.ocrLangs', ['eng']);
  const r = await modal({
    title: 'OCR — make scanned pages searchable', wide: true,
    body: `<p class="note" style="margin-top:0">Recognizes text in scanned or photographed pages and adds an invisible text layer, so you can search, select, copy and use Edit text. The first run downloads the OCR engine (a few MB).</p>
      <label class="f">Languages in the document</label><div class="lang-grid">${OCR_LANGS.map(([c, n]) => `<label class="check"><input type="checkbox" value="${c}" ${saved.includes(c) ? 'checked' : ''}> ${n}</label>`).join('')}</div>
      <div class="row2"><label class="f">Pages (blank = all)<input type="text" id="ocrR" placeholder="e.g. 1-3, 5"></label>
      <label class="f">Accuracy<select id="ocrQ"><option value="2.2">Standard (faster)</option><option value="3.2">High (slower, small text)</option></select></label></div>
      <label class="check"><input type="checkbox" id="ocrSkip" checked> Skip pages that already contain text</label>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Start OCR', primary: true, onClick: (m) => {
      const langs = [...m.querySelectorAll('.lang-grid input:checked')].map((i) => i.value); if (!langs.length) { toast('Pick at least one language.', true); return false; }
      let idx; try { idx = pagesFromRange(m.querySelector('#ocrR').value); } catch (e) { toast(e.message, true); return false; }
      return { langs, idx, scale: +m.querySelector('#ocrQ').value, skip: m.querySelector('#ocrSkip').checked };
    } }],
  });
  if (!r) return; LS.set('pdfstudio.ocrLangs', r.langs);
  await runOcr(r);
}
async function getTesseract() {
  if (!window.Tesseract) await loadScript(LOCAL_LIB ? LOCAL_LIB + 'tesseract/tesseract.min.js' : CDN + 'tesseract.js@5.1.1/dist/tesseract.min.js');
  return window.Tesseract;
}
async function runOcr({ langs, idx, scale, skip }) {
  let worker; let done = 0, skipped = 0, words = 0; let cur = 0;
  busy(true, 'Loading OCR engine…');
  try {
    const T = await getTesseract();
    const opts = { logger: (m) => { if (m.status === 'recognizing text') busy(true, `Reading page ${cur} (${done + 1} of ${idx.length})… ${Math.round(m.progress * 100)}%`); else if (m.status && !done) busy(true, 'Loading OCR engine and language data…'); } };
    if (LOCAL_LIB) Object.assign(opts, { workerPath: LOCAL_LIB + 'tesseract/worker.min.js', corePath: LOCAL_LIB + 'tesseract/', langPath: LOCAL_LIB + 'tesseract/lang' });
    worker = await T.createWorker(langs.join('+'), 1, opts);
    for (const i of idx) {
      const p = S.pages[i]; cur = i + 1;
      if (skip && (await textItems(p)).some((it) => !it.ocr && it.str.trim())) { skipped++; done++; continue; }
      const page = await S.sources.get(p.srcId).pdf.getPage(p.index + 1);
      const vp = page.getViewport({ scale, rotation: totalRot(p) });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const { data } = await worker.recognize(c);
      const list = (data.words || []).filter((w) => w.text && w.text.trim() && w.confidence > 25).map((w) => {
        const b = w.bbox; const a = dispToPage(p, b.x0 / scale, b.y0 / scale), z = dispToPage(p, b.x1 / scale, b.y1 / scale);
        return { t: w.text.trim(), x: Math.min(a.x, z.x), y: Math.min(a.y, z.y), w: Math.abs(z.x - a.x), h: Math.abs(z.y - a.y), r: totalRot(p) };
      });
      S.ocr[`${p.srcId}:${p.index}`] = list; words += list.length; clearTextCache(p); done++;
    }
  } catch (e) {
    console.error(e); busy(false);
    return toast((IN_CLAUDE ? 'OCR could not run inside Claude (' : 'OCR failed (') + (e?.message || e) + '). ' + (IN_CLAUDE ? 'Try it on your GitHub website.' : 'Check your internet connection and try again.'), true, 8000);
  } finally { if (worker) safe(() => worker.terminate()); busy(false); }
  S.dirty = true; if (S.tool === 'edittext') S.pages.forEach(renderTextLayer);
  toast(`OCR finished: ${words} words recognized on ${done - skipped} page${done - skipped === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped — already had text)` : ''}. Search and Edit text now work on those pages.`, false, 7000);
}

/* ------------------------------------------------------------------ links and outline (bookmarks) */
const linkCache = new Map();
async function renderLinks(p) {
  const pe = pageEls.get(p.id); if (!pe) return; const key = `${p.srcId}:${p.index}`;
  if (!linkCache.has(key)) linkCache.set(key, S.sources.get(p.srcId).pdf.getPage(p.index + 1).then((pg) => pg.getAnnotations()).then((a) => a.filter((x) => x.subtype === 'Link' && (x.url || x.dest))).catch(() => []));
  const links = await linkCache.get(key); pe.links.innerHTML = ''; const z = S.zoom;
  for (const l of links) {
    const [x1, y1, x2, y2] = l.rect; const r = pageRectToDisp(p, { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) });
    const a = document.createElement('a'); a.className = 'lnk';
    Object.assign(a.style, { left: r.x * z + 'px', top: r.y * z + 'px', width: r.w * z + 'px', height: r.h * z + 'px' });
    if (l.url && /^(https?:|mailto:)/i.test(l.url)) { a.href = l.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.title = l.url; }
    else if (l.dest) { a.href = '#'; a.title = 'Go to linked page'; a.onclick = (e) => { e.preventDefault(); goDest(p.srcId, l.dest); }; }
    else continue;
    pe.links.appendChild(a);
  }
}
async function resolveDest(src, dest) {
  if (typeof dest === 'string') dest = await src.pdf.getDestination(dest);
  if (!Array.isArray(dest) || dest[0] == null) return null;
  const idx = typeof dest[0] === 'object' ? await src.pdf.getPageIndex(dest[0]) : dest[0];
  const pdfY = dest[1]?.name === 'XYZ' && typeof dest[3] === 'number' ? dest[3] : dest[1]?.name === 'FitH' && typeof dest[2] === 'number' ? dest[2] : null;
  return { idx, pdfY };
}
async function goDest(srcId, dest) {
  try {
    const r = await resolveDest(S.sources.get(srcId), dest); if (!r) return;
    const p = S.pages.find((x) => x.srcId === srcId && x.index === r.idx); if (!p) return toast('That page is no longer in this document.');
    goPageY(p, r.pdfY);
  } catch (e) { console.warn(e); }
}
function goPageY(p, pdfY) {
  const i = S.pages.indexOf(p); if (i < 0) return; scrollToPage(i);
  if (pdfY != null) { const pe = pageEls.get(p.id); const v = clamp(pageToDisp(p, p.x0 || 0, pdfY).v, 0, dispSize(p).h); viewer.scrollTop = pe.wrap.offsetTop + v * S.zoom - 12; }
}
async function importOutlines(pages) {
  const bySrc = new Map(); pages.forEach((p) => { if (!bySrc.has(p.srcId)) bySrc.set(p.srcId, []); bySrc.get(p.srcId).push(p); });
  for (const [srcId, pgs] of bySrc) {
    const src = S.sources.get(srcId); const ol = await src.pdf.getOutline().catch(() => null); if (!ol?.length) continue;
    const conv = async (items, depth) => {
      const out = [];
      for (const it of items.slice(0, 2000)) {
        const b = { id: uid(), title: (it.title || 'Untitled').trim(), pageId: null, pdfY: null, url: it.url || null, children: [] };
        try { if (it.dest) { const r = await resolveDest(src, it.dest); const pg = r && pgs.find((x) => x.index === r.idx); if (pg) { b.pageId = pg.id; b.pdfY = r.pdfY; } } } catch { }
        if (it.items?.length && depth < 8) b.children = await conv(it.items, depth + 1);
        out.push(b);
      }
      return out;
    };
    S.bookmarks.push(...await conv(ol, 0));
  }
}
function findBookmark(id, list = S.bookmarks, parent = null) {
  for (let i = 0; i < list.length; i++) { const b = list[i]; if (b.id === id) return { b, list, i, parent }; const r = findBookmark(id, b.children, b); if (r) return r; }
  return null;
}
function renderOutline() {
  const box = $('#outline'); if (!box) return;
  if (!S.bookmarks.length) { box.innerHTML = '<p class="side-empty">No bookmarks yet. Scroll to a spot and click “Add bookmark”.</p>'; return; }
  const open = renderOutline.open || (renderOutline.open = new Set());
  const html = (list) => `<ul>${list.map((b) => {
    const has = b.children.length; const gone = b.pageId && !S.pages.some((p) => p.id === b.pageId);
    return `<li><div class="bm ${gone ? 'gone' : ''}" data-id="${b.id}">${has ? `<button class="bm-tg" data-tg="${b.id}">${open.has(b.id) ? '▾' : '▸'}</button>` : '<span class="bm-sp"></span>'}<span class="bm-t" title="${esc(b.title)}">${esc(b.title)}</span><span class="bm-act"><button data-ren="${b.id}" title="Rename">✎</button><button data-del="${b.id}" title="Delete">×</button></span></div>${has && open.has(b.id) ? html(b.children) : ''}</li>`;
  }).join('')}</ul>`;
  box.innerHTML = html(S.bookmarks);
}
$('#outline').addEventListener('click', async (e) => {
  const t = e.target.closest('[data-tg],[data-ren],[data-del],.bm'); if (!t) return;
  if (t.dataset.tg) { const o = renderOutline.open || (renderOutline.open = new Set()); o.has(t.dataset.tg) ? o.delete(t.dataset.tg) : o.add(t.dataset.tg); return renderOutline(); }
  if (t.dataset.ren) { const f = findBookmark(t.dataset.ren); const v = await askText('Rename bookmark', 'Title', f.b.title); if (v && v.trim()) { const before = snap(); findBookmark(t.dataset.ren).b.title = v.trim(); commit(before); renderOutline(); } return; }
  if (t.dataset.del) { const before = snap(); const f = findBookmark(t.dataset.del); f.list.splice(f.i, 1); commit(before); renderOutline(); return; }
  const f = findBookmark(t.dataset.id); if (!f) return;
  if (f.b.url) { window.open(f.b.url, '_blank', 'noopener'); return; }
  const p = S.pages.find((x) => x.id === f.b.pageId); if (p) goPageY(p, f.b.pdfY); else toast('That page is no longer in this document.');
});
$('#bmAdd').onclick = async () => {
  if (!S.pages.length) return; const p = S.pages[S.current]; const pe = pageEls.get(p.id);
  const v = Math.max(0, (viewer.scrollTop - pe.wrap.offsetTop) / S.zoom);
  const title = await askText('Add bookmark', 'Bookmark title', `Page ${S.current + 1}`); if (!title || !title.trim()) return;
  const before = snap(); S.bookmarks.push({ id: uid(), title: title.trim(), pageId: p.id, pdfY: dispToPage(p, 0, v).y, url: null, children: [] }); commit(before); renderOutline();
  toast('Bookmark added. Bookmarks are saved inside the PDF when you download it.');
};
function writeOutline(out, pageMap) {
  const prune = (list) => list.map((b) => ({ ...b, children: prune(b.children) })).filter((b) => pageMap.has(b.pageId) || b.url || b.children.length);
  const items = prune(S.bookmarks); const cat = out.catalog; const ctx = out.context;
  if (!items.length) { cat.delete(L.PDFName.of('Outlines')); return; }
  const rootRef = ctx.nextRef();
  const build = (list, parentRef) => {
    const refs = list.map(() => ctx.nextRef());
    list.forEach((b, i) => {
      const d = { Title: L.PDFHexString.fromText(b.title), Parent: parentRef };
      if (i > 0) d.Prev = refs[i - 1]; if (i < list.length - 1) d.Next = refs[i + 1];
      const t = pageMap.get(b.pageId);
      if (t) { let y = null; if (b.pdfY != null) { const v = pageToDisp(t.p, t.p.x0 || 0, b.pdfY).v; y = t.mapY(dispToPage(t.vp, 0, v).y); } d.Dest = ctx.obj([t.pg.ref, 'XYZ', null, y, null]); }
      else if (b.url) d.A = ctx.obj({ S: 'URI', URI: L.PDFString.of(b.url) });
      if (b.children.length) { const kids = build(b.children, refs[i]); d.First = kids[0]; d.Last = kids[kids.length - 1]; d.Count = -b.children.length; }
      ctx.assign(refs[i], ctx.obj(d));
    });
    return refs;
  };
  const top = build(items, rootRef);
  ctx.assign(rootRef, ctx.obj({ Type: 'Outlines', First: top[0], Last: top[top.length - 1], Count: top.length }));
  cat.set(L.PDFName.of('Outlines'), rootRef);
}

