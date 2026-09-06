- Project: static color-shifting “Pixel Reading Shelf” that shows Mimi’s reading list with a hero book display and a grid of covers.
- Stack: vanilla HTML/CSS/JS only. Local font `assets/fonts/Jersey-15.*`; no client library dependencies.
- Entry points
  - `index.html`: lays out the wrapper, reusable block-mosaic cover hero, search/filter controls, and book grid container. Loads CSS and `script.js`.
  - `styles.css`: dynamic theme tokens, page-wide grey pixel-grain, borderless block-cover presentation for the hero and shelf, pixel materialization states, and a 5-column desktop/2-column mobile cover grid.
  - `script.js`: fetches `data/books.json`, loads only strictly verified Open Library cover images, progressively redraws the selected image from 10 to 240 pixels wide as mixed-size raised image blocks, uses a coarser block grid for shelf thumbnails, extracts a dominant hue locally, preserves URL state, renders the progressive grid, supports keyboard navigation, and opens `book_url` in a new tab.
  - Data source: `data/books.csv` plus generated `data/books.json`. `cover_id` supplies the displayed Open Library image; `cover_image` is retained as legacy metadata but is not used by the frontend.
  - Tooling: `tools/sync-books-data.mjs` normalizes the CSV schema, can cache missing cover IDs with `--enrich-covers`, strictly re-check every cover with `--refresh-covers`, optionally enrich other Open Library metadata, and writes `data/books.json`.
  - Serverless: `netlify/functions/update-comment.js` updates `data/books.csv` in GitHub via the GitHub Contents API.

Runtime behavior (script.js)
- On `DOMContentLoaded`, `loadBooks()` fetches `data/books.json` from the same origin.
- Books are sorted descending by `date_read`; items with an empty `date_read` (i.e., “reading”) float to the top via the `'9999-12-31'` fallback.
- Initial UI state comes from query params: `view`, `q`, and `book`.
- Filter toggle: `filter` defaults to `'reading'`. When checked, `filter = 'all'` and the grid shows every book; when unchecked, only `status === 'reading'` appear. `updateLabel()` swaps the label text (`Currently Reading` vs `Read`).
- Search matches normalized title/author/metadata through `search_index`.
- `resetGrid()` renders the first thumbnail chunk immediately, then appends more items via `IntersectionObserver`.
- `showBook()` swaps hero content through a stepped exit followed by a canvas-based pixel materialization, then persists the selected slug in the URL.
- Keyboard: `Esc` clears search, `Enter` opens the selected `book_url`, and arrow keys move between visible books.

How to work on this codebase
- No bundler, but the data file is generated. After editing `data/books.csv`, run `node tools/sync-books-data.mjs` so the frontend JSON stays in sync. Serve locally (e.g., `python -m http.server 8000`) so `fetch()` works; opening `index.html` as a file may hit CORS issues.
- Keep data tidy:
  - `status` should be `reading` or `read`. An empty `date_read` means “currently reading” and will be sorted to the top; use ISO `YYYY-MM-DD` for `date_read` when known.
  - `slug` should stay stable once shared, because it is used in the URL.
  - `cover_id` must come from a title-and-author match. The frontend intentionally does not load `cover_image` or guess by ISBN/edition ID; a missing API match becomes a generated placeholder texture.
  - `book_url` should point directly to a book database page when possible; the sync script falls back to an Open Library search URL if needed.
  - Avoid commas inside CSV fields unless quoted.
- UI/logic expectations to preserve:
  - Default view shows only `reading` items and labels “Currently Reading”; toggling shows all and labels “Read”.
  - Search/filter/current book should round-trip through the URL.
  - Hero swap should retain the progressive low-resolution canvas animation when triggered by a grid click.
  - Grid rendering should stay incremental (initial chunk plus observer-driven append) so large shelves do not block first paint.
- Styling tone: preserve the complementary page color with a weak, blocky grey pixel-grain overlay, free-floating covers, pixel direction, Jersey 15 font, squared controls, and cover art rebuilt from raised, rounded image tiles rather than a simulated 3D book.
- Adding dependencies: prefer dependency-free browser APIs; document any new imports in `index.html` and note why they’re needed.
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
