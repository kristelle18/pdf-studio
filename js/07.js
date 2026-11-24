/* ------------------------------------------------------------------ sidebar tabs and comments list */
$$('.side-tabs button').forEach((b) => b.onclick = () => {
  $$('.side-tabs button').forEach((x) => x.classList.toggle('on', x === b));
  $$('.side-pane').forEach((p) => p.hidden = p.dataset.pane !== b.dataset.pane);
  if (b.dataset.pane === 'comments') renderComments(); if (b.dataset.pane === 'outline') renderOutline();
});
const ANNOT_LABEL = { text: 'Text', highlight: 'Highlight', ink: 'Drawing', rect: 'Box', ellipse: 'Circle', line: 'Line', arrow: 'Arrow', note: 'Comment', image: 'Image / signature', whiteout: 'White-out', redact: 'Redaction', field: 'Form field' };
const ANNOT_ICON = { text: 'text', highlight: 'highlight', ink: 'pen', rect: 'rect', ellipse: 'ellipse', line: 'line', arrow: 'arrow', note: 'note', image: 'image', whiteout: 'eraser', redact: 'redact', field: 'form' };
function renderComments() {
  const box = $('#comments'); if (!box || box.closest('.side-pane').hidden) return;
  const rows = [];
  S.pages.forEach((p, i) => {
    const list = annotsOf(p.id); if (!list.length) return;
    rows.push(`<div class="cm-page">Page ${i + 1}</div>`);
    list.forEach((a) => {
      const snip = a.type === 'text' ? a.text : a.type === 'note' ? (a.text || '(empty comment)') : a.type === 'field' ? `${a.name} (${a.ftype})` : '';
      rows.push(`<div class="cm ${S.sel === a.id ? 'on' : ''}" data-id="${a.id}"><span class="cm-ic" style="color:${a.color || '#6b7280'}">${icon(ANNOT_ICON[a.type] || 'note')}</span><span class="cm-b"><b>${ANNOT_LABEL[a.type] || a.type}</b>${snip ? `<small>${esc(snip.slice(0, 90))}</small>` : ''}</span><button class="cm-x" data-x="${a.id}" title="Delete">×</button></div>`);
    });
  });
  box.innerHTML = rows.length ? rows.join('') : '<p class="side-empty">No comments or markup yet. Anything you add — text, highlights, drawings, notes, stamps — is listed here.</p>';
}
$('#comments').addEventListener('click', (e) => {
  const x = e.target.closest('[data-x]'); const row = e.target.closest('.cm'); if (!row) return;
  const a = annotById(row.dataset.id); if (!a) return;
  if (x) { S.sel = a.id; deleteSelected(); return; }
  if (S.tool !== 'select') setTool('select');
  const p = pageOfAnnot(a); const pe = pageEls.get(p.id); const b = bbox(a);
  viewer.scrollTop = pe.wrap.offsetTop + b.y * S.zoom - viewer.clientHeight / 3; select(a.id); renderComments();
  if (a.type === 'note') openNote(a.id);
});

/* ------------------------------------------------------------------ crop and resize */
const PAPER = { A4: [595.28, 841.89], A3: [841.89, 1190.55], A5: [419.53, 595.28], Letter: [612, 792], Legal: [612, 1008], Tabloid: [792, 1224] };
async function cropFromDrag(p, r) {
  const res = await modal({
    title: 'Crop pages', body: '<p style="margin:0;line-height:1.5">Keep only the area you selected? The part outside is hidden in the saved PDF.</p>',
    actions: [{ label: 'Cancel', value: null }, { label: 'This page', value: 'one' }, { label: 'All pages', primary: true, value: 'all' }],
  });
  if (!res) return;
  const before = snap();
  for (const q of res === 'all' ? S.pages : [p]) { const d = dispSize(q); const x = clamp(r.x, 0, d.w - 10), y = clamp(r.y, 0, d.h - 10); q.crop = { x, y, w: Math.min(r.w, d.w - x), h: Math.min(r.h, d.h - y) }; }
  commit(before); rebuildViewer(); setTool('select');
  toast('Cropped. The dimmed area is removed when you save. Use All tools → Crop pages to undo or adjust.', false, 6000);
}
async function cropDialog() {
  const mm = 72 / 25.4; const p = S.pages[S.current]; const d = dispSize(p); const c = p.crop || { x: 0, y: 0, w: d.w, h: d.h };
  const v = (n) => Math.max(0, Math.round(n / mm * 10) / 10);
  const r = await modal({
    title: 'Crop pages', body: `<p class="note" style="margin-top:0">Tip: you can also pick the Crop tool in the toolbar and drag a box over the area to keep.</p>
      <div class="row2"><label class="f">Top margin (mm)<input type="number" id="cT" value="${v(c.y)}" min="0" step="1"></label><label class="f">Bottom margin (mm)<input type="number" id="cB" value="${v(d.h - c.y - c.h)}" min="0" step="1"></label>
      <label class="f">Left margin (mm)<input type="number" id="cL" value="${v(c.x)}" min="0" step="1"></label><label class="f">Right margin (mm)<input type="number" id="cR" value="${v(d.w - c.x - c.w)}" min="0" step="1"></label></div>
      <label class="f">Apply to pages (blank = all)<input type="text" id="cP" placeholder="e.g. 1-3, 5"></label>`,
    actions: [{ label: 'Remove crop', value: 'remove' }, { label: 'Cancel', value: null }, { label: 'Crop', primary: true, onClick: (m) => {
      let idx; try { idx = pagesFromRange(m.querySelector('#cP').value); } catch (e) { toast(e.message, true); return false; }
      return { idx, t: +m.querySelector('#cT').value * mm, b: +m.querySelector('#cB').value * mm, l: +m.querySelector('#cL').value * mm, r: +m.querySelector('#cR').value * mm };
    } }],
  });
  if (!r) return; const before = snap();
  if (r === 'remove') S.pages.forEach((q) => delete q.crop);
  else for (const i of r.idx) { const q = S.pages[i]; const dd = dispSize(q); const w = dd.w - r.l - r.r, h = dd.h - r.t - r.b; if (w < 20 || h < 20) { toast(`Page ${i + 1} is too small for those margins.`, true); continue; } q.crop = { x: r.l, y: r.t, w, h }; }
  commit(before); rebuildViewer();
}
async function resizeDialog() {
  const cur = S.docOps.resize;
  const r = await modal({
    title: 'Resize pages', body: `<label class="f">Page size<select id="rzS">${Object.keys(PAPER).map((k) => `<option ${cur?.name === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <p class="note">Every page is scaled to fit the new size and centered. Portrait and landscape pages keep their orientation. Applied when you save.</p>`,
    actions: [...(cur ? [{ label: 'Remove', value: 'remove' }] : []), { label: 'Cancel', value: null }, { label: 'Apply', primary: true, onClick: (m) => m.querySelector('#rzS').value }],
  });
  if (!r) return; const before = snap(); S.docOps.resize = r === 'remove' ? null : { name: r, w: PAPER[r][0], h: PAPER[r][1] }; commit(before);
  toast(r === 'remove' ? 'Page resizing removed.' : `Pages will be resized to ${r} when you save.`);
}
function applyCropResize(out, pg, p, vp) {
  let mapY = (y) => y;
  if (p.crop) {
    const c = p.crop; const a = dispToPage(vp, c.x, c.y), b = dispToPage(vp, c.x + c.w, c.y + c.h);
    pg.setCropBox(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  }
  const rs = S.docOps.resize;
  if (rs) {
    const cb = pg.getCropBox(); const rot = totalRot(vp) % 180;
    const dw = rot ? cb.height : cb.width, dh = rot ? cb.width : cb.height;
    let Tw = rs.w, Th = rs.h; if ((dw > dh) !== (Tw > Th)) [Tw, Th] = [Th, Tw];
    const s = Math.min(Tw / dw, Th / dh); const PW = rot ? Th : Tw, PH = rot ? Tw : Th;
    const tx = (PW - s * cb.width) / 2 - s * cb.x, ty = (PH - s * cb.height) / 2 - s * cb.y;
    pg.node.normalize(); pg.getContentStream();
    const start = pg.createContentStream(L.pushGraphicsState(), L.concatTransformationMatrix(s, 0, 0, s, tx, ty)); const end = pg.createContentStream(L.popGraphicsState());
    pg.node.wrapContentStreams(out.context.register(start), out.context.register(end));
    const an = pg.node.Annots();
    if (an) for (let k = 0; k < an.size(); k++) {
      const d = an.lookup(k); if (!(d instanceof L.PDFDict)) continue; const R = d.lookup(L.PDFName.of('Rect'));
      if (R instanceof L.PDFArray && R.size() === 4) { const v = R.asArray().map((n) => (n.asNumber ? n.asNumber() : 0)); d.set(L.PDFName.of('Rect'), out.context.obj([s * v[0] + tx, s * v[1] + ty, s * v[2] + tx, s * v[3] + ty])); }
    }
    pg.setMediaBox(0, 0, PW, PH); pg.setCropBox(0, 0, PW, PH);
    for (const k of ['BleedBox', 'TrimBox', 'ArtBox']) pg.node.delete(L.PDFName.of(k));
    mapY = (y) => s * y + ty;
  }
  return mapY;
}

/* ------------------------------------------------------------------ header & footer, Bates numbers */
function hfText(tpl, i, total) {
  const hf = S.docOps.hf; const st = hf.start || 1; const bt = hf.bates || {};
  return tpl.replace(/\{n\}/g, i + st).replace(/\{total\}/g, total + st - 1).replace(/\{date\}/g, new Date().toLocaleDateString())
    .replace(/\{file\}/g, baseName()).replace(/\{bates\}/g, (bt.prefix || '') + String((bt.start ?? 1) + i).padStart(bt.digits || 6, '0'));
}
const HF_KEYS = ['hl', 'hc', 'hr', 'fl', 'fc', 'fr'];
async function headerFooterDialog() {
  const cur = S.docOps.hf || { hl: '', hc: '', hr: '', fl: '', fc: '', fr: '', size: 9, margin: 24, start: 1, color: '#374151', skipFirst: false, bates: { prefix: 'DOC-', start: 1, digits: 6 } };
  const inp = (k, ph) => `<input type="text" id="hf_${k}" value="${esc(cur[k] || '')}" placeholder="${ph}">`;
  const r = await modal({
    title: 'Header & footer, Bates numbering', wide: true,
    body: `<p class="note" style="margin-top:0">Codes you can use: <b>{n}</b> page number, <b>{total}</b> page count, <b>{date}</b> today, <b>{file}</b> file name, <b>{bates}</b> Bates number.</p>
      <label class="f">Header — left / center / right</label><div class="row3">${inp('hl', 'Left')}${inp('hc', 'Center')}${inp('hr', 'Right')}</div>
      <label class="f" style="margin-top:12px">Footer — left / center / right</label><div class="row3">${inp('fl', 'Left')}${inp('fc', 'Center')}${inp('fr', 'Right')}</div>
      <div class="row3" style="margin-top:12px"><label class="f">Font size<input type="number" id="hfZ" value="${cur.size}" min="5" max="36"></label><label class="f">Margin (pt)<input type="number" id="hfM" value="${cur.margin}" min="4" max="144"></label><label class="f">Color<input type="color" id="hfC" value="${cur.color}" style="height:36px"></label></div>
      <h3 style="font-size:14px;margin:8px 0">Bates numbering</h3>
      <div class="row3"><label class="f">Prefix<input type="text" id="btP" value="${esc(cur.bates.prefix)}"></label><label class="f">Start number<input type="number" id="btS" value="${cur.bates.start}" min="0"></label><label class="f">Digits<input type="number" id="btD" value="${cur.bates.digits}" min="1" max="12"></label></div>
      <button class="btn" id="btIns" type="button">Put Bates number in footer right</button>
      <label class="check"><input type="checkbox" id="hfK" ${cur.skipFirst ? 'checked' : ''}> Skip the first page</label>`,
    actions: [...(S.docOps.hf ? [{ label: 'Remove', value: 'remove' }] : []), { label: 'Cancel', value: null }, { label: 'Apply', primary: true, onClick: (m) => {
      const o = { size: +m.querySelector('#hfZ').value || 9, margin: +m.querySelector('#hfM').value || 24, color: m.querySelector('#hfC').value, start: 1, skipFirst: m.querySelector('#hfK').checked,
        bates: { prefix: m.querySelector('#btP').value, start: +m.querySelector('#btS').value || 0, digits: clamp(+m.querySelector('#btD').value || 6, 1, 12) } };
      HF_KEYS.forEach((k) => (o[k] = m.querySelector('#hf_' + k).value));
      if (!HF_KEYS.some((k) => o[k].trim())) { toast('Type something in at least one header or footer box.', true); return false; }
      return o;
    } }],
    onOpen: (m) => { m.querySelector('#btIns').onclick = () => { m.querySelector('#hf_fr').value = '{bates}'; }; },
  });
  if (!r) return; const before = snap(); S.docOps.hf = r === 'remove' ? null : r; commit(before); rebuildViewer();
}
async function drawHeaderFooter(pg, vp, i, total, getFont, p = vp) {
  const hf = S.docOps.hf; if (!hf || (hf.skipFirst && i === 0)) return;
  const d = dispSize(vp); const bx = contentBox(p); const f = await getFont('Helvetica'); const m = hf.margin, sz = hf.size;
  pg.pushOperators(L.pushGraphicsState(), L.concatTransformationMatrix(...matrixFor(vp)));
  HF_KEYS.forEach((k) => {
    if (!hf[k]?.trim()) return; const s = sanitize(f, hfText(hf[k], i, total)); const tw = f.widthOfTextAtSize(s, sz);
    const x = k[1] === 'l' ? bx.x + m : k[1] === 'r' ? bx.x + bx.w - m - tw : bx.x + (bx.w - tw) / 2; const y = k[0] === 'h' ? d.h - bx.y - m - sz * 0.8 : d.h - (bx.y + bx.h) + m;
    pg.drawText(s, { x, y, size: sz, font: f, color: hex2rgb(hf.color) });
  });
  pg.pushOperators(L.popGraphicsState());
}
function renderPreviewExtras(p, i, pe) {
  const z = S.zoom; const d = dispSize(p); const bx = contentBox(p);
  if (p.crop) {
    const c = p.crop; const shade = (l, t, w, h) => { if (w <= 0 || h <= 0) return; const s = document.createElement('div'); s.className = 'crop-shade'; Object.assign(s.style, { left: l * z + 'px', top: t * z + 'px', width: w * z + 'px', height: h * z + 'px' }); pe.preview.appendChild(s); };
    shade(0, 0, d.w, c.y); shade(0, c.y + c.h, d.w, d.h - c.y - c.h); shade(0, c.y, c.x, c.h); shade(c.x + c.w, c.y, d.w - c.x - c.w, c.h);
    const o = document.createElement('div'); o.className = 'crop-line'; Object.assign(o.style, { left: c.x * z + 'px', top: c.y * z + 'px', width: c.w * z + 'px', height: c.h * z + 'px' }); pe.preview.appendChild(o);
  }
  const hf = S.docOps.hf;
  if (hf && !(hf.skipFirst && i === 0)) HF_KEYS.forEach((k) => {
    if (!hf[k]?.trim()) return; const el = document.createElement('div');
    Object.assign(el.style, { position: 'absolute', left: (bx.x + hf.margin) * z + 'px', right: (d.w - bx.x - bx.w + hf.margin) * z + 'px', textAlign: k[1] === 'l' ? 'left' : k[1] === 'r' ? 'right' : 'center', fontFamily: FONT_CSS.Helvetica, fontSize: hf.size * z + 'px', color: hf.color, lineHeight: 1.2, whiteSpace: 'pre',
      top: (k[0] === 'h' ? bx.y + hf.margin - hf.size * 0.15 : bx.y + bx.h - hf.margin - hf.size * BASELINE.Helvetica) * z + 'px' });
    el.textContent = hfText(hf[k], i, S.pages.length); pe.preview.appendChild(el);
  });
}

/* ------------------------------------------------------------------ form fields you create */
function nextFieldName() { const names = new Set([...S.annots.filter((a) => a.type === 'field').map((a) => a.name), ...S.fields.map((f) => f.name)]); let i = 1; while (names.has('Field' + i)) i++; return 'Field' + i; }
async function fieldDialog(cur, selfId) {
  const r = await modal({
    title: selfId ? 'Edit form field' : 'New form field', body: `<div class="row2"><label class="f">Field name<input type="text" id="fdN" value="${esc(cur.name)}"></label>
      <label class="f">Type<select id="fdT">${[['text', 'Text box'], ['multiline', 'Multi-line text'], ['checkbox', 'Checkbox'], ['dropdown', 'Dropdown list']].map(([v, t]) => `<option value="${v}" ${cur.ftype === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
      <label class="f" id="fdOL">Choices for the dropdown (comma-separated)<input type="text" id="fdO" value="${esc(cur.options || '')}" placeholder="e.g. Yes, No, Maybe"></label>
      <p class="note">The field becomes fillable in the saved PDF (in Acrobat, browsers and here after reopening).</p>`,
    actions: [{ label: 'Cancel', value: null }, { label: selfId ? 'Save' : 'Add field', primary: true, onClick: (m) => {
      const name = m.querySelector('#fdN').value.trim().replace(/[.]/g, '_'); const ftype = m.querySelector('#fdT').value; const options = m.querySelector('#fdO').value;
      if (!name) { toast('Give the field a name.', true); return false; }
      if (S.annots.some((a) => a.type === 'field' && a.name === name && a.id !== selfId) || S.fields.some((f) => f.name === name)) { toast('Another field already uses that name.', true); return false; }
      if (ftype === 'dropdown' && !options.split(',').some((s) => s.trim())) { toast('Add at least one choice for the dropdown.', true); return false; }
      return { name, ftype, options };
    } }],
    onOpen: (m) => { const upd = () => (m.querySelector('#fdOL').hidden = m.querySelector('#fdT').value !== 'dropdown'); m.querySelector('#fdT').onchange = upd; upd(); },
  });
  if (r) S.td.field = { ftype: r.ftype };
  return r;
}
async function fieldFromDrag(p, r) {
  const res = await fieldDialog({ ftype: S.td.field?.ftype || 'text', name: nextFieldName(), options: '' }); if (!res) return;
  const a = { id: uid(), pageId: p.id, type: 'field', ...r, ...res }; addAnnot(a, snap()); select(a.id);
}
async function editField(id) {
  const a = annotById(id); if (!a) return; const res = await fieldDialog(a, id); if (!res) return;
  const before = snap(); Object.assign(a, res); commit(before); updateAnnotEl(a);
}
function fieldAnnotHtml(a) {
  const ic = a.ftype === 'checkbox' ? '☐' : a.ftype === 'dropdown' ? '▾' : a.ftype === 'multiline' ? '¶' : 'T';
  return `<span class="fl">${ic} ${esc(a.name)}</span>`;
}
function createFormFields(out, pg, vp, list) {
  const fields = list.filter((a) => a.type === 'field'); if (!fields.length) return;
  const form = out.getForm();
  for (const a of fields) {
    const c1 = dispToPage(vp, a.x, a.y), c2 = dispToPage(vp, a.x + a.w, a.y + a.h);
    const o = { x: Math.min(c1.x, c2.x), y: Math.min(c1.y, c2.y), width: Math.abs(c2.x - c1.x), height: Math.abs(c2.y - c1.y), borderColor: L.rgb(0.55, 0.6, 0.7), borderWidth: 1, rotate: L.degrees(totalRot(vp)) };
    let name = a.name, n = 2; while (safe(() => form.getFieldMaybe(name), null)) name = `${a.name}_${n++}`;
    try {
      if (a.ftype === 'checkbox') form.createCheckBox(name).addToPage(pg, o);
      else if (a.ftype === 'dropdown') { const dd = form.createDropdown(name); dd.addOptions(a.options.split(',').map((s) => s.trim()).filter(Boolean)); dd.addToPage(pg, o); }
      else { const tf = form.createTextField(name); if (a.ftype === 'multiline') tf.enableMultiline(); tf.addToPage(pg, o); }
    } catch (e) { console.warn('field', e); toast(`Could not create field "${a.name}": ${e.message}`, true); }
  }
}

/* ------------------------------------------------------------------ password protect / unlock (QPDF compiled to WebAssembly) */
let qpdfFactory = null;
async function qpdfRun(args, input) {
  if (!qpdfFactory) {
    const base = LOCAL_LIB ? LOCAL_LIB + 'qpdf/' : CDN + '@neslinesli93/qpdf-wasm@0.3.1/dist/';
    const prev = window.Module; await loadScript(base + 'qpdf.js'); qpdfFactory = { create: window.Module, wasm: base + 'qpdf.wasm' }; window.Module = prev;
  }
  const errs = [];
  const m = await qpdfFactory.create({ locateFile: () => qpdfFactory.wasm, noInitialRun: true, print: () => {}, printErr: (t) => errs.push(t) });
  m.FS.writeFile('/in.pdf', input);
  let rc = 0; try { rc = m.callMain(args); } catch (e) { rc = e?.status ?? 2; }
  let out = null; try { out = m.FS.readFile('/out.pdf'); } catch { }
  if (!out || (rc !== 0 && rc !== 3)) throw new Error((errs.join(' ').replace(/this\.program:?/g, '').trim() || 'qpdf failed').slice(0, 200));
  return out;
}
async function qpdfDecrypt(bytes, pw) { try { return await qpdfRun([`--password=${pw || ''}`, '--decrypt', '/in.pdf', '/out.pdf'], bytes); } catch (e) { console.warn('decrypt failed', e); return null; } }
function qpdfEncrypt(bytes, o) {
  const restricted = !o.print || !o.copy || !o.modify;
  const owner = o.owner || (restricted ? Array.from(crypto.getRandomValues(new Uint8Array(18)), (b) => b.toString(36)).join('') : o.user);
  return qpdfRun(['--encrypt', `--user-password=${o.user}`, `--owner-password=${owner}`, '--bits=256', `--print=${o.print ? 'full' : 'none'}`, `--extract=${o.copy ? 'y' : 'n'}`, `--modify=${o.modify ? 'all' : 'none'}`, '--', '/in.pdf', '/out.pdf'], bytes);
}
async function protectDialog() {
  const r = await modal({
    title: 'Protect PDF with a password', body: `<div class="row2"><label class="f">Password to open<input type="password" id="pw1" autocomplete="new-password"></label><label class="f">Type it again<input type="password" id="pw2" autocomplete="new-password"></label></div>
      <label class="f">What people with the password can do</label>
      <label class="check"><input type="checkbox" id="pwP" checked> Print</label><label class="check"><input type="checkbox" id="pwC" checked> Copy text and images</label><label class="check"><input type="checkbox" id="pwE" checked> Edit, comment and fill forms</label>
      <label class="f" style="margin-top:8px">Permissions password (optional — needed to change the restrictions later)<input type="password" id="pwO" autocomplete="new-password"></label>
      <p class="note">Uses AES-256 encryption. Remember your password — it can't be recovered.</p>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Protect & download', primary: true, onClick: (m) => {
      const a = m.querySelector('#pw1').value, b = m.querySelector('#pw2').value;
      if (!a) { toast('Enter a password.', true); return false; } if (a !== b) { toast('The two passwords are different.', true); return false; }
      return { user: a, owner: m.querySelector('#pwO').value, print: m.querySelector('#pwP').checked, copy: m.querySelector('#pwC').checked, modify: m.querySelector('#pwE').checked };
    } }],
    onOpen: (m) => setTimeout(() => m.querySelector('#pw1').focus(), 50),
  });
  if (!r) return;
  busy(true, 'Building PDF…');
  try {
    const bytes = await buildPdf(); busy(true, 'Encrypting…'); const enc = await qpdfEncrypt(bytes, r); busy(false);
    if (await download(enc, `${baseName()}-protected.pdf`)) toast('Password-protected PDF saved.');
  } catch (e) { console.error(e); toast('Could not protect the PDF: ' + e.message + (IN_CLAUDE ? ' — try it on your GitHub website.' : ''), true, 8000); }
  finally { busy(false); }
}
function unlockInfo() {
  const srcs = [...S.sources.values()];
  if (srcs.some((s) => s.unlocked)) toast('Unlocked! Click Download to save a copy without the password.', false, 6000);
  else if (srcs.some((s) => s.encrypted)) toast('This PDF opened, but it could not be fully unlocked here, so pages will be saved as images.', true, 7000);
  else toast('This PDF has no password — there is nothing to unlock.');
}

/* ------------------------------------------------------------------ document info and clean-up */
const fmtPdfDate = (s) => { const d = s && safe(() => pdfjsLib.PDFDateString.toDateObject(s), null); return d ? d.toLocaleString() : (s || ''); };
function scanLib(lib) {
  const res = { fonts: new Map(), js: false, attachments: 0, links: 0, comments: 0, xmp: false };
  if (!lib) return res;
  const N = (n) => L.PDFName.of(n);
  try {
    const cat = lib.catalog; const names = cat.lookup(N('Names'));
    if (names instanceof L.PDFDict) { if (names.lookup(N('JavaScript'))) res.js = true; const ef = names.lookup(N('EmbeddedFiles')); if (ef instanceof L.PDFDict) { const arr = ef.lookup(N('Names')); if (arr instanceof L.PDFArray) res.attachments = arr.size() / 2; } }
    const oa = cat.lookup(N('OpenAction')); if (oa instanceof L.PDFDict && String(oa.lookup(N('S'))) === '/JavaScript') res.js = true;
    if (cat.lookup(N('AA'))) res.js = true; if (cat.lookup(N('Metadata'))) res.xmp = true;
  } catch { }
  lib.getPages().slice(0, 300).forEach((pg) => {
    try {
      const fd = pg.node.Resources()?.lookup(N('Font'));
      if (fd instanceof L.PDFDict) for (const [, ref] of fd.entries()) {
        const f = lib.context.lookup(ref); if (!(f instanceof L.PDFDict)) continue;
        const name = String(f.lookup(N('BaseFont')) || '').replace(/^\//, '').replace(/^[A-Z]{6}\+/, '') || '(unnamed)';
        let desc = f.lookup(N('FontDescriptor')); const df = f.lookup(N('DescendantFonts')); if (!desc && df instanceof L.PDFArray) { const d0 = df.lookup(0); if (d0 instanceof L.PDFDict) desc = d0.lookup(N('FontDescriptor')); }
        const emb = desc instanceof L.PDFDict && !!(desc.lookup(N('FontFile')) || desc.lookup(N('FontFile2')) || desc.lookup(N('FontFile3')));
        res.fonts.set(name, (res.fonts.get(name) || false) || emb);
      }
      const an = pg.node.Annots(); if (an) for (let k = 0; k < an.size(); k++) { const d = an.lookup(k); if (!(d instanceof L.PDFDict)) continue; const st = String(d.lookup(N('Subtype'))); if (st === '/Link') res.links++; else if (COMMENT_TYPES.has(st)) res.comments++; if (st === '/FileAttachment') res.attachments++; const a = d.lookup(N('A')); if (a instanceof L.PDFDict && String(a.lookup(N('S'))) === '/JavaScript') res.js = true; }
    } catch { }
  });
  return res;
}
const COMMENT_TYPES = new Set(['/Text', '/FreeText', '/Highlight', '/Underline', '/StrikeOut', '/Squiggly', '/Ink', '/Square', '/Circle', '/Line', '/Polygon', '/PolyLine', '/Stamp', '/Caret', '/Popup', '/Sound']);
async function infoDialog() {
  const base = S.sources.get(S.pages[0].srcId); const meta = await base.pdf.getMetadata().catch(() => ({})); const info = meta.info || {};
  const d = dispSize(S.pages[0]); const mm = (v) => Math.round(v * 25.4 / 72);
  const paper = Object.entries(PAPER).find(([, [w, h]]) => (Math.abs(w - d.w) < 3 && Math.abs(h - d.h) < 3) || (Math.abs(h - d.w) < 3 && Math.abs(w - d.h) < 3));
  const scan = scanLib(base.lib); const att = await base.pdf.getAttachments().catch(() => null);
  let noText = 0; for (const p of S.pages.slice(0, 50)) if (!(await textItems(p)).some((it) => it.str.trim())) noText++;
  const fonts = [...scan.fonts.entries()];
  const sizeTotal = [...new Set(S.pages.map((p) => p.srcId))].reduce((n, id) => n + S.sources.get(id).bytes.length, 0);
  const rows = [
    ['File name', S.fileName], ['File size', fmtBytes(sizeTotal)], ['Pages', S.pages.length],
    ['Page size', `${mm(d.w)} × ${mm(d.h)} mm (${(d.w / 72).toFixed(2)} × ${(d.h / 72).toFixed(2)} in)${paper ? ' — ' + paper[0] : ''}`],
    ['PDF version', info.PDFFormatVersion || ''], ['Title', info.Title || ''], ['Author', info.Author || ''], ['Subject', info.Subject || ''], ['Keywords', info.Keywords || ''],
    ['Created with', info.Creator || ''], ['Produced by', info.Producer || ''], ['Created', fmtPdfDate(info.CreationDate)], ['Modified', fmtPdfDate(info.ModDate)],
    ['Password protected', base.encrypted ? (base.unlocked ? 'Yes — unlocked for editing' : 'Yes') : 'No'],
    ['Form fields', new Set(S.fields.map((f) => f.key)).size], ['Bookmarks', S.bookmarks.length], ['Links', scan.links], ['Comments in file', scan.comments],
    ['Attachments', att ? Object.keys(att).length : scan.attachments], ['JavaScript', scan.js ? 'Yes — contains scripts or automatic actions' : 'None found'],
    ['XMP metadata', scan.xmp ? 'Yes' : 'No'], ['Pages without text', noText ? `${noText}${S.pages.length > 50 ? ' (of first 50)' : ''} — scanned pages? Try OCR.` : 'None'],
    ['Fonts', fonts.length ? fonts.map(([n, e]) => `${esc(n)}${e ? '' : ' <span class="muted">(not embedded)</span>'}`).join('<br>') : 'None'],
  ];
  const r = await modal({
    title: 'Document info', wide: true,
    body: `<table class="info">${rows.map(([k, v]) => `<tr><th>${k}</th><td>${k === 'Fonts' ? v : esc(String(v)) || '<span class="muted">—</span>'}</td></tr>`).join('')}</table>`,
    actions: [{ label: 'Export as JSON', value: 'json' }, { label: 'Clean up…', value: 'clean' }, { label: 'Close', primary: true, value: null }],
  });
  if (r === 'json') {
    const obj = Object.fromEntries(rows.filter(([k]) => k !== 'Fonts').map(([k, v]) => [k, v])); obj.Fonts = fonts.map(([n, e]) => ({ name: n, embedded: e }));
    download(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), `${baseName()}-info.json`, 'application/json');
  }
  if (r === 'clean') sanitizeDialog();
}
async function sanitizeDialog() {
  const r = await modal({
    title: 'Clean up — remove hidden data', body: `<p class="note" style="margin-top:0">Choose what to strip out before you share the file. You get a cleaned copy; your open document doesn't change.</p>
      <label class="check"><input type="checkbox" id="snM" checked> Metadata (title, author, software, dates, XMP)</label>
      <label class="check"><input type="checkbox" id="snJ" checked> JavaScript and automatic actions</label>
      <label class="check"><input type="checkbox" id="snA" checked> Attached files</label>
      <label class="check"><input type="checkbox" id="snL"> Links</label>
      <label class="check"><input type="checkbox" id="snC"> Comments and markup already in the file</label>
      <label class="check"><input type="checkbox" id="snF"> Flatten form fields</label>`,
    actions: [{ label: 'Cancel', value: null }, { label: 'Clean & download', primary: true, onClick: (m) => ({ meta: m.querySelector('#snM').checked, js: m.querySelector('#snJ').checked, attachments: m.querySelector('#snA').checked, links: m.querySelector('#snL').checked, comments: m.querySelector('#snC').checked, flatten: m.querySelector('#snF').checked }) }],
  });
  if (!r) return; const prev = S.docOps.sanitize; S.docOps.sanitize = r;
  try { await doSave({ flatten: r.flatten }, `${baseName()}-clean.pdf`); } finally { S.docOps.sanitize = prev; }
}
function sanitizePage(pg, o) {
  const N = (n) => L.PDFName.of(n);
  if (o.js) pg.node.delete(N('AA'));
  const an = pg.node.Annots(); if (!an) return;
  for (let k = an.size() - 1; k >= 0; k--) {
    const d = an.lookup(k); if (!(d instanceof L.PDFDict)) continue; const st = String(d.lookup(N('Subtype')));
    if ((o.links && st === '/Link') || (o.attachments && st === '/FileAttachment') || (o.comments && COMMENT_TYPES.has(st))) { an.remove(k); continue; }
    if (o.js) { d.delete(N('AA')); const a = d.lookup(N('A')); if (a instanceof L.PDFDict && String(a.lookup(N('S'))) === '/JavaScript') d.delete(N('A')); }
  }
}
function sanitizeDoc(out, o) {
  const N = (n) => L.PDFName.of(n); const cat = out.catalog;
  if (o.js) { cat.delete(N('OpenAction')); cat.delete(N('AA')); safe(() => out.getForm().getFields().forEach((f) => { f.acroField.dict.delete(N('AA')); f.acroField.getWidgets().forEach((w) => w.dict.delete(N('AA'))); })); }
  const names = cat.lookup(N('Names'));
  if (names instanceof L.PDFDict) { if (o.js) names.delete(N('JavaScript')); if (o.attachments) names.delete(N('EmbeddedFiles')); }
  if (o.meta) { cat.delete(N('Metadata')); const info = safe(() => out.getInfoDict(), null); if (info) for (const k of ['Title', 'Author', 'Subject', 'Keywords', 'Creator', 'Producer', 'CreationDate', 'ModDate', 'Trapped']) info.delete(N(k)); }
}

