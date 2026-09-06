# Agent notes

## Structure

- `index.html` contains the hero reader, its front/back faces, the status toggle, and the library grid container.
- `styles.css` defines the Kindle-inspired device system, textured hero edge, color-matched ambient pixel diffusion, e-ink screen, lift–edge–settle flip with restrained highlight sweep, title imprint, and full-shell artwork treatment.
- `script.js` reads `data/books.json`, selects the requested or currently-reading book, updates the screen, samples the active wrap palette for the bezel and hero atmosphere, filters by reading status, and builds the other device backs.
- `data/books.json` is the interface’s source of truth.

## Behavior to preserve

- The hero starts screen-side up and flips only when pressed or activated with Enter/Space. Ignore repeated activation while the turn is in progress.
- Keep the normal pointer cursor during the turn; the flip is immediate interaction feedback, not a loading state.
- The hero backside never adds title, author, or brand text over the artwork.
- Every database book has a matching text-free wrap at `assets/kindle-wraps/<slug>.jpg`.
- Each wrap fills the hero back and its library device. The hero front shell color is sampled from the wrap’s outer edge.
- Hero and library backgrounds share a medium-dark slate/aubergine palette. Smooth light pools are driven by the active wrap’s sampled `--active-glow-rgb`; do not add background pixels or filtered artwork.
- `.kindle-face::before` supplies the hero’s layered edge micro-texture; keep it pointer-transparent and concentrated around the outer border.
- Shelf wraps and imprint colors are loaded lazily through `IntersectionObserver`; preserve this boundary so offscreen artwork does not compete with the hero animation.
- Lift the library card itself on hover, not its contained device. Do not add paint containment or `content-visibility` to the card: either clips the rotated Kindle edges and its outside shadow.
- The status toggle filters the lower library between `reading` and `read`; its state is preserved in `?view=`.
- The library excludes the active hero book. Selecting another Kindle makes it active, returns the hero to its screen, updates the URL, and scrolls to the top.
- All library entries remain readable and keyboard accessible.
- Published-cover assets are visual references only. The interface displays the original project-owned wraps instead of reproducing those covers.

## Visual direction

- Treat the device as the center of a playful dusk reading room: artwork-colored hardware, warm monochrome e-ink, smooth wrap-matched light, realistic depth, and direct-to-shell printing.
- Library items are always shown backside-first with a direct-to-shell title imprint in luminance-selected black or warm white; do not reintroduce title label boxes, cover cards, mosaic blocks, hands, newspaper framing, or simulated 3D books.
