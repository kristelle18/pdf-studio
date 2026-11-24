# PDF Studio

A free PDF editor that runs entirely in your browser — in the spirit of Adobe Acrobat. Files are never uploaded anywhere: every edit happens on your own device.

**Live site:** https://kristelle18.github.io/pdf-studio/

## Features

| Area | What you can do |
|---|---|
| **Read** | Fast viewer, zoom, two-page view, full-screen presentation mode, dark mode and night reading, page thumbnails, bookmarks panel, clickable links, text search, read aloud, reopens at the page where you left off |
| **Edit** | Add text, **edit existing text in its original font and color**, insert images, white-out |
| **Comment** | Straight highlighter, freehand draw, boxes, circles, lines, arrows, sticky notes, stamps, and a comments list of everything you've added |
| **Sign & forms** | Draw, type or upload a signature (saved for reuse); fill form fields; **create your own fillable fields** (text, multi-line, checkbox, dropdown) |
| **Organize** | Merge, split, extract, delete, rotate, duplicate, reorder, insert blank pages, **crop**, **resize to A4/Letter/Legal…**, add and edit bookmarks |
| **Protect** | **Password protection (AES-256)** with print/copy/edit permissions, **unlock** password-protected PDFs, true redaction, **clean up hidden data** (metadata, scripts, attachments, links, comments) |
| **Convert** | **OCR** (make scans searchable), **PDF to Word / Markdown / text**, **scan to PDF** from your phone camera, images → PDF, PDF → images, compress |
| **Enhance** | Page numbers, watermark, **header & footer**, **Bates numbering**, document properties, **document info** (fonts, security, metadata — export as JSON) |
| **Review** | **Compare two PDFs** — side-by-side word-level differences, with changed lines highlighted |
| **Automate** | **Workflows** — apply page numbers, Bates numbers, watermark, clean-up, flattening, compression and a password to many PDFs at once |

### Keyboard shortcuts

`Ctrl+O` open · `Ctrl+S` save · `Ctrl+P` print · `Ctrl+F` find · `Ctrl+Z` / `Ctrl+Y` undo / redo · `Ctrl+C` / `Ctrl+V` / `Ctrl+D` copy / paste / duplicate · `Del` delete · arrow keys nudge (Shift = 10 pt) · `Esc` cancel
Tools: `V` select · `H` pan · `T` text · `E` edit text · `D` draw · `R` box · `O` circle · `L` line · `A` arrow · `N` note · `C` crop · `F` form field
Presentation mode: `→` / `Space` next · `←` previous · `Esc` exit

## How it works

It's a static site — no server, no build step. `index.html` and `styles.css` are the page; the editor's code is in `js/01.js … js/08.js`, which `app.js` joins in order and runs as one script.

- [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0) renders pages and extracts text.
- [pdf-lib](https://github.com/Hopding/pdf-lib) (MIT) and [fontkit](https://github.com/Hopding/fontkit) write the edited PDF.
- [QPDF](https://github.com/qpdf/qpdf) compiled to WebAssembly (Apache-2.0) adds and removes passwords. It loads only when you use those tools.
- [Tesseract.js](https://github.com/naptha/tesseract.js) (Apache-2.0) does OCR. It loads only when you run OCR.
- [JSZip](https://github.com/Stuk/jszip) (MIT) packages ZIP downloads and Word files.

Libraries load from the jsDelivr CDN at pinned versions.

## Known limits

- **Edit text** reuses the PDF's own font. PDFs usually contain only the letters they use, so a brand-new character may be drawn in the closest standard font.
- Added text uses the standard PDF fonts (Helvetica, Times, Courier), which cover Western European characters.
- **OCR** accuracy depends on scan quality. The invisible text layer supports Western European characters; other scripts are recognized for search and copy inside PDF Studio but saved as `?`.
- **PDF to Word** keeps text, headings, paragraphs and lists; columns, tables and images are simplified.
- **Compress** turns pages into images (best for scans).
- Not included (they need a server): Word/Excel/PowerPoint → PDF, web page → PDF, certificate-based digital signatures, sending for e-signature.
