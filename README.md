# PDF Studio

A free PDF editor that runs entirely in your browser — in the spirit of Adobe Acrobat. Files are never uploaded anywhere: every edit happens on your own device.

**Live site:** https://kristelle18.github.io/pdf-studio/ (after GitHub Pages is turned on — see below)

## Features

| Area | What you can do |
|---|---|
| **Read** | Fast viewer, zoom (fit width / fit page / 25–500%), page thumbnails, go-to-page, text search with highlighted matches |
| **Edit** | Add text (font, size, bold, italic, color), **edit existing text** (click a line to replace it), insert images, white-out |
| **Comment** | Highlight, freehand draw, boxes, circles, lines, arrows, sticky-note comments (saved as real PDF comments) |
| **Sign** | Draw, type (4 handwriting fonts) or upload a signature; remove white background; saved signatures for reuse |
| **Fill forms** | Fill in text fields, checkboxes, radio buttons and dropdowns; keep fields editable or flatten them |
| **Stamps** | Approved, Rejected, Draft, Confidential, Paid…, custom stamps with date, ✓ ✗ ● marks, today's date |
| **Organize** | Merge PDFs and images, split (every N pages / ranges / each page), extract, delete, rotate, duplicate, insert blank pages, drag-and-drop reorder, reverse |
| **Protect** | True redaction: content under redaction boxes is permanently removed (page is flattened to an image) |
| **Convert** | Images → PDF, PDF → PNG/JPG (ZIP), compress, page numbers, watermark, document properties, print |
| **Comfort** | Undo/redo, copy/paste/duplicate items, keyboard shortcuts, drag-and-drop files, works on phones and tablets |

### Keyboard shortcuts

`Ctrl+O` open · `Ctrl+S` save · `Ctrl+P` print · `Ctrl+F` find · `Ctrl+Z` / `Ctrl+Y` undo / redo · `Ctrl+C` / `Ctrl+V` / `Ctrl+D` copy / paste / duplicate · `Del` delete · arrow keys nudge (Shift = 10 pt) · `Esc` cancel
Tools: `V` select · `H` pan · `T` text · `E` edit text · `D` draw · `R` box · `O` circle · `L` line · `A` arrow · `N` note

## Turn on the website (one time)

1. Open the repository on GitHub → **Settings** → **Pages**.
2. Under **Build and deployment**, set **Source** to *Deploy from a branch*, branch **main**, folder **/ (root)**, then **Save**.
3. Wait about a minute. Your editor will be live at `https://kristelle18.github.io/pdf-studio/`.

## How it works

It's a static site (`index.html`, `styles.css`, `app.js`) — no server, no build step.

- [pdf.js](https://github.com/mozilla/pdf.js) (Apache-2.0) renders pages and extracts text.
- [pdf-lib](https://github.com/Hopding/pdf-lib) (MIT) writes the edited PDF.
- [JSZip](https://github.com/Stuk/jszip) (MIT) packages split files and images.

Libraries load from the jsDelivr CDN at pinned versions. Edits are kept as an editable layer while you work and are written into the PDF when you download.

## Known limits

- **Edit text** covers the original words with white and places editable text on top. It works best on plain text on a white background; it doesn't reflow paragraphs.
- Added text uses the standard PDF fonts (Helvetica, Times, Courier), which cover Western European characters. Other scripts show as `?`.
- **Compress** turns pages into images, so it helps scanned/image-heavy PDFs but text stops being selectable.
- Password-protected PDFs can be opened and viewed. When saved, their pages are flattened to images.
- Not included: OCR, comparing files, sending for e-signature, and password-protecting PDFs (browsers can't encrypt PDFs with these libraries).
