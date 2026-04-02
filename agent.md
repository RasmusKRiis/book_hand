- Project: static “Pixel Reading Shelf” that shows Mimi’s reading list with a hero book display and a grid of covers.
- Stack: vanilla HTML/CSS/JS only. External CDNs: GSAP (animations), PapaParse (CSV parsing), ColorThief (loaded but currently unused). Local font `assets/fonts/Jersey-15.*`.
- Entry points
  - `index.html`: lays out the wrapper, hero book section, toggle for filtering, and book grid container. Loads CSS plus the three CDNs and `script.js`.
  - `styles.css`: Wes‑Anderson–inspired palette, grid layout (5 columns desktop, 2 mobile), hero layout, toggle styling, and overall typography.
  - `script.js`: fetches `data/books.csv`, sorts, filters, renders thumbnails, handles click-to-view + animations, and drives the filter toggle.
  - Data: `data/books.csv` (headers: `title,author,cover_image,release_date,date_read,status,comment,ai_comment,rating,country`). Covers live in `assets/`; hand sprite in `assets/hand.png`; `book.png` unused.
  - Serverless: `netlify/functions/update-comment.js` updates `data/books.csv` in GitHub via the GitHub Contents API.

Runtime behavior (script.js)
- On `DOMContentLoaded`, `loadBooks()` parses `data/books.csv` via PapaParse (downloaded from the same origin).
- Books are sorted descending by `date_read`; items with an empty `date_read` (i.e., “reading”) float to the top via the `'9999-12-31'` fallback.
- Initially shows the first `status === 'reading'` book, otherwise the first entry.
- Filter toggle: `filter` defaults to `'reading'`. When checked, `filter = 'all'` and `renderGrid()` shows every book; when unchecked, only `status === 'reading'` appear. `updateLabel()` swaps the label text (`Currently Reading` vs `Read`).
- `renderGrid()` builds `<img>` thumbnails (lazy-loaded, async decoded, low fetch priority) and attaches click handlers to update the hero section and smooth-scroll to top.
- `showBook()` swaps hero content; when animated, a GSAP timeline fades/flies cover + hand out/in, then updates text (`title/author/released/read/comment`).

How to work on this codebase
- No build step. Serve locally (e.g., `python -m http.server 8000`) so the CSV fetch works; opening `index.html` as a file may hit CORS issues.
- Keep data tidy:
  - `status` should be `reading` or `read`. An empty `date_read` means “currently reading” and will be sorted to the top; use ISO `YYYY-MM-DD` for `date_read` when known.
  - `cover_image` must match a file in `assets/`; prefer consistent 3:4 aspect PNGs to avoid layout jumps.
  - Avoid commas inside CSV fields unless quoted.
- UI/logic expectations to preserve:
  - Default view shows only `reading` items and labels “Currently Reading”; toggling shows all and labels “Read”.
  - Hero swap should remain animated when triggered by a grid click; keep GSAP timeline semantics if refactoring.
  - `renderGrid()` should stay fast (document fragment, lazy images). If adding heavy logic, keep it outside the render loop.
- Styling tone: maintain the set palette and Jersey 15 font; keep hand/cover dimensions aligned with `.book-display`.
- Adding dependencies: prefer CDN for small client-only libs; document any new imports in `index.html` and note why they’re needed.
- Robustness tips:
  - Validate new CSV rows before commit; ensure fields exist so DOM textContent calls do not end up `undefined`.
  - When adding features, guard against missing assets or malformed dates (fallback strings) rather than crashing animations.
  - Keep IDs/classes used by JS stable or update both CSS and JS together.
  - Optimize added images (size/format) to keep initial load light; rely on existing lazy-load hints.

Comment persistence (Netlify)
- The frontend posts to `/.netlify/functions/update-comment` with `{ title, author, comment }`.
- The function pulls `data/books.csv` from GitHub, updates the matching row’s `comment`, and commits back to the repo. Environment variables required:
  - `GITHUB_TOKEN` (repo scope)
  - `GITHUB_OWNER` (e.g., `your-username`)
  - `GITHUB_REPO` (e.g., `book_hand`)
  - Optional: `GITHUB_BRANCH` (default `main`), `CSV_PATH` (default `data/books.csv`)
- `netlify.toml` sets `functions = "netlify/functions"` and publishes from the repo root.
- Local dev: the UI works, but saving will fail unless the function can reach GitHub with a valid token. Test by setting env vars and running `netlify dev` or by mocking the endpoint.
