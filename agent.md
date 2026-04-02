- Project: static “Pixel Reading Shelf” that shows Mimi’s reading list with a hero book display and a grid of covers.
- Stack: vanilla HTML/CSS/JS only. External CDN: GSAP (animations). Local font `assets/fonts/Jersey-15.*`.
- Entry points
  - `index.html`: lays out the wrapper, hero book section, search/filter controls, and book grid container. Loads CSS, GSAP, and `script.js`.
  - `styles.css`: Wes‑Anderson–inspired palette, grid layout (5 columns desktop, 2 mobile), hero layout, toggle styling, and overall typography.
  - `script.js`: fetches `data/books.json`, preserves UI state in the URL, renders the hero + progressive grid, supports keyboard navigation, and opens `book_url` in a new tab.
  - Data source: `data/books.csv` (edited by hand) plus generated `data/books.json` for the frontend. Schema: `title,author,slug,cover_image,release_date,date_read,status,comment,ai_comment,rating,country,book_url,isbn,language,translated_from,genre`. Covers live in `assets/`; hand sprite in `assets/hand.png`; `book.png` is the fallback cover.
  - Tooling: `tools/sync-books-data.mjs` normalizes the CSV schema, optionally enriches missing Open Library metadata, and writes `data/books.json`.
  - Serverless: `netlify/functions/update-comment.js` updates `data/books.csv` in GitHub via the GitHub Contents API.

Runtime behavior (script.js)
- On `DOMContentLoaded`, `loadBooks()` fetches `data/books.json` from the same origin.
- Books are sorted descending by `date_read`; items with an empty `date_read` (i.e., “reading”) float to the top via the `'9999-12-31'` fallback.
- Initial UI state comes from query params: `view`, `q`, and `book`.
- Filter toggle: `filter` defaults to `'reading'`. When checked, `filter = 'all'` and the grid shows every book; when unchecked, only `status === 'reading'` appear. `updateLabel()` swaps the label text (`Currently Reading` vs `Read`).
- Search matches normalized title/author/metadata through `search_index`.
- `resetGrid()` renders the first thumbnail chunk immediately, then appends more items via `IntersectionObserver`.
- `showBook()` swaps hero content; when animated, a GSAP timeline fades/flies cover + hand out/in, then updates text (`title/author/released/read/ai_comment`) and persists the selected slug in the URL.
- Keyboard: `Esc` clears search, `Enter` opens the selected `book_url`, and arrow keys move between visible books.

How to work on this codebase
- No bundler, but the data file is generated. After editing `data/books.csv`, run `node tools/sync-books-data.mjs` so the frontend JSON stays in sync. Serve locally (e.g., `python -m http.server 8000`) so `fetch()` works; opening `index.html` as a file may hit CORS issues.
- Keep data tidy:
  - `status` should be `reading` or `read`. An empty `date_read` means “currently reading” and will be sorted to the top; use ISO `YYYY-MM-DD` for `date_read` when known.
  - `slug` should stay stable once shared, because it is used in the URL.
  - `cover_image` must match a file in `assets/`; prefer consistent 3:4 aspect PNGs to avoid layout jumps.
  - `book_url` should point directly to a book database page when possible; the sync script falls back to an Open Library search URL if needed.
  - Avoid commas inside CSV fields unless quoted.
- UI/logic expectations to preserve:
  - Default view shows only `reading` items and labels “Currently Reading”; toggling shows all and labels “Read”.
  - Search/filter/current book should round-trip through the URL.
  - Hero swap should remain animated when triggered by a grid click; keep GSAP timeline semantics if refactoring.
  - Grid rendering should stay incremental (initial chunk plus observer-driven append) so large shelves do not block first paint.
- Styling tone: maintain the set palette and Jersey 15 font; keep hand/cover dimensions aligned with `.book-display`.
- Adding dependencies: prefer CDN for small client-only libs; document any new imports in `index.html` and note why they’re needed.
- Robustness tips:
  - Validate new CSV rows before commit; ensure fields exist so DOM textContent calls do not end up `undefined`.
  - When adding features, guard against missing assets or malformed dates (fallback strings) rather than crashing animations.
  - Keep IDs/classes used by JS stable or update both CSS and JS together.
  - Optimize added images (size/format) to keep initial load light; rely on existing lazy-load hints and JSON caching.

Comment persistence (Netlify)
- The frontend posts to `/.netlify/functions/update-comment` with `{ title, author, comment }`.
- The function pulls `data/books.csv` from GitHub, updates the matching row’s `comment`, and commits back to the repo. Environment variables required:
  - `GITHUB_TOKEN` (repo scope)
  - `GITHUB_OWNER` (e.g., `your-username`)
  - `GITHUB_REPO` (e.g., `book_hand`)
  - Optional: `GITHUB_BRANCH` (default `main`), `CSV_PATH` (default `data/books.csv`)
- `netlify.toml` sets `functions = "netlify/functions"` and publishes from the repo root.
- Local dev: the UI works, but saving will fail unless the function can reach GitHub with a valid token. Test by setting env vars and running `netlify dev` or by mocking the endpoint.
