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

## Adding a book: required artwork workflow

Every book added to `data/books.json` must receive artwork in the approved system during the same change.

1. Use the book's original published cover as the only book-specific visual reference. Prefer its local file in `assets/`; when one is unavailable, use the exact edition from an official publisher page. Never use an earlier Kindle wrap as the source.
2. Use `assets/kindle-wraps/sisters-in-yellow.jpg` and `assets/kindle-wraps/taipei-story.jpg` only as style anchors for mature editorial restraint, flat screen-print or risograph ink, limited color, tactile paper grain, large readable shapes, and intentional negative space.
3. Invent a fresh visual metaphor from the book's cover, themes, and database description. Each title needs a distinct composition and focal idea; do not reuse another book's subject, layout, centered medallion, or generic landscape.
4. Keep the artwork text-free: no title, author, letters, numbers, quotation marks, logos, badges, borders, device mockups, frames, or watermarks.
5. Save the final image as an `800x1200` JPEG at `assets/kindle-wraps/<slug>.jpg`.
6. Run `node scripts/validate-artwork.mjs`. Resolve every missing file, wrong dimension, duplicate asset, or data inconsistency before publishing.
7. Bump `WRAP_VERSION` in `script.js` and the `script.js?v=` value in `index.html` so existing visitors receive the new artwork.

Use this ImageGen brief as the base, adapting the concept and composition to the specific book:

```text
Use case: stylized-concept
Asset type: vertical Kindle back artwork for "<title>" by <author>
Input images: Image 1 is the original published cover and supplies this book's palette, iconic cues, and emotional tone; ignore its typography. Images 2 and 3 are Sisters in Yellow and Taipei Story and guide only editorial restraint, tactile flat ink, and print texture; never copy their subjects or layouts.
Primary request: Invent a completely new, bespoke visual metaphor for this specific book. Give it a unique identity derived from the original cover and the book context.
Style/medium: minimal mature literary editorial illustration; flat screen-print or risograph inks; simple woodblock-like silhouettes; tactile aged paper.
Composition/framing: portrait 2:3, edge-to-edge; one clear book-specific idea; two to five large readable forms; generous negative space; strong thumbnail silhouette.
Color palette: reinterpret three or four dominant colors from the original cover, including one dark structural tone and one distinctive accent.
Constraints: no text, title, author, letters, numbers, logos, border, mockup, device, frame, watermark, gradients, photorealism, generic centered medallion, or copied style-anchor composition.
```
