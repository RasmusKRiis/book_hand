# Agent notes

## Structure

- `index.html` contains the hero reader, its front/back faces, the status toggle, and the library grid container.
- `styles.css` defines the Kindle-inspired device system, e-ink screen, refresh and flip interactions, full-back engraving, and engraved library backs.
- `script.js` reads `data/books.json`, selects the requested or currently-reading book, updates the screen, generates the four-tone cover engraving in canvas, filters by reading status, and builds the other device backs.
- `data/books.json` is the interface’s source of truth.

## Behavior to preserve

- The hero starts screen-side up and flips only when pressed or activated with Enter/Space.
- The hero backside shows a dithered, edge-enhanced cover engraving when `cover_id` is numeric, otherwise a monogram engraving.
- The status toggle filters the lower library between `reading` and `read`; its state is preserved in `?view=`.
- The library excludes the active hero book. Selecting another Kindle makes it active, returns the hero to its screen, updates the URL, and scrolls to the top.
- All library entries remain readable and keyboard accessible.
- Do not use local book-cover assets.

## Visual direction

- Treat the device as the entire interface: graphite hardware, warm monochrome e-ink, restrained typography, realistic depth, and low-contrast engraving.
- Library items are always shown backside-first with engraved title and author; do not reintroduce cover cards, mosaic blocks, hands, newspaper framing, or simulated 3D books.
