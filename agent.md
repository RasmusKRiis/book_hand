# Agent notes

## Structure

- `index.html` contains the hero reader, its front/back faces, the status toggle, and the library grid container.
- `styles.css` defines the Kindle-inspired device system, e-ink screen, refresh and flip interactions, and full-shell artwork treatment.
- `script.js` reads `data/books.json`, selects the requested or currently-reading book, updates the screen, samples the active wrap palette for the bezel, filters by reading status, and builds the other device backs.
- `data/books.json` is the interface’s source of truth.

## Behavior to preserve

- The hero starts screen-side up and flips only when pressed or activated with Enter/Space.
- The hero backside never adds title, author, or brand text over the artwork.
- Every database book has a matching text-free wrap at `assets/kindle-wraps/<slug>.jpg`.
- Each wrap fills the hero back and its library device. The hero front shell color is sampled from the wrap’s outer edge.
- The status toggle filters the lower library between `reading` and `read`; its state is preserved in `?view=`.
- The library excludes the active hero book. Selecting another Kindle makes it active, returns the hero to its screen, updates the URL, and scrolls to the top.
- All library entries remain readable and keyboard accessible.
- Published-cover assets are visual references only. The interface displays the original project-owned wraps instead of reproducing those covers.

## Visual direction

- Treat the device as the entire interface: artwork-colored hardware, warm monochrome e-ink, restrained typography, realistic depth, and direct-to-shell printing.
- Library items are always shown backside-first with text-free artwork; do not reintroduce cover cards, title overlays, mosaic blocks, hands, newspaper framing, or simulated 3D books.
