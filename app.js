// PDF Studio loader: the editor's source is split into parts (js/01.js …) so each file stays small.
// They are joined in order and run as one module, exactly as a single file would be.
const PARTS = 8;
const urls = Array.from({ length: PARTS }, (_, i) => new URL(`js/${String(i + 1).padStart(2, '0')}.js`, import.meta.url).href);
const code = (await Promise.all(urls.map((u) => fetch(u, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`Could not load ${u}`); return r.text(); })))).join('');
await import(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
