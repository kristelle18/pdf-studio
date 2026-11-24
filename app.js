// PDF Studio loader: the editor's source is split into parts (src/part1.js …) so each stays small.
// They are joined in order and run as one module, exactly as a single file would be.
const PARTS = 6;
const urls = Array.from({ length: PARTS }, (_, i) => new URL(`src/part${i + 1}.js`, import.meta.url).href);
const code = (await Promise.all(urls.map((u) => fetch(u, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`Could not load ${u}`); return r.text(); })))).join('');
await import(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
