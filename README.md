# Mimmi’s Kindle Library

A single-page reading library designed around an e-ink reader.

## Experience

- The first viewport contains one Kindle-style reader displaying the selected book’s database details.
- Pressing the reader flips it to an artwork-only back with no title, author, or branding overlay.
- **Butter** is the first custom-wrap prototype: original limited-ink artwork runs edge to edge and colors both the back and front shell.
- Other books keep the verified cover artwork etched across the graphite shell using four-tone e-ink dithering and edge detail.
- The flip includes a brief e-ink refresh reveal so the engraving feels developed into the device rather than pasted on top.
- Scrolling reveals the other books as Kindle backs with their title and author engraved into the shell.
- The library toggle switches those devices between **Currently reading** and **Already read**.
- Selecting a library device moves that book into the hero reader and updates the `?book=` and `?view=` URL state.
- Books without verified artwork use a plain shell rather than adding replacement text.

## Data

The interface reads `data/books.json`. Standard cover artwork is loaded from a numeric `cover_id` using Open Library’s Covers API. The original Butter wrap is stored as `assets/butter-kindle-wrap-v1.png` while that custom-shell direction is being tested.

## Local preview

Serve the directory over HTTP, then open `index.html`. The JSON data will not load reliably when the page is opened directly with a `file://` URL.
