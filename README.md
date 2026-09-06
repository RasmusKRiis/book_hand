# Color-shifting Pixel Reading Shelf (view-only)

The live page is read-only. Covers come only from verified Open Library matches; local cover files are not displayed. Both the selected hero and every shelf cover are rebuilt as mosaics of mixed-size raised image blocks—small squares, wide and tall bricks, and larger merged blocks—with highlighted tops, shaded edges, and small gaps. Shelf covers use a deliberately coarser grid so their mosaic pieces remain prominent at thumbnail size. The complementary page color carries a page-wide, blocky grey pixel-grain texture inspired by the supplied Magnific reference.

## Quick start
- Serve locally so JSON fetch works: `python -m http.server 8000` and open `http://localhost:8000`.
- Source data lives in `data/books.csv`; the frontend reads generated `data/books.json` and requests only verified Open Library `cover_id` images.
- Clicking the `mimmi's shelf` masthead returns to the main shelf.
- The selected image is progressively redrawn from 10 to 240 pixels wide for a softer pixel-materialization animation, then split into raised cover-image blocks. Books without verified API artwork use a generated block-mosaic placeholder.
- Palette extraction remains local and dependency-free.
- The grid shows only `status=reading` by default; toggle switches to all books. Sorting is automatic (newest `date_read` first; blanks float to the top).
- URL state is preserved for filter/search/current book, so refreshing keeps the same view.

## Add a new book
1) Add a row to `data/books.csv`
   - Columns: `title,author,slug,cover_image,cover_id,release_date,date_read,status,comment,ai_comment,rating,country,book_url,isbn,language,translated_from,genre`.
   - `slug`: URL-safe identifier. Leave blank to auto-generate from the title.  
   - `cover_id`: Open Library cover ID. It can be left blank and populated by the enrichment command only when both title and author match.
   - `cover_image`: legacy filename retained in the data for compatibility; the frontend does not load it.
   - `status`: `reading` or `read`.  
   - `date_read`: `YYYY-MM-DD` when finished; leave empty while reading.  
   - `comment`: your short note.  
   - `ai_comment`: longer AI blurb if you want it displayed.  
   - `rating`: integer 0–5; shown as pixel stars. Leaving blank hides stars.  
   - `country`: optional metadata field kept in the CSV.
   - `book_url`: direct link to the book database page used by the hero cover. Leave blank to fall back to an Open Library search URL.
   - `isbn`, `language`, `translated_from`, `genre`: optional metadata fields for richer filtering/search later.

   Example row (copy/paste and edit):  
   ```csv
   My New Book,Author Name,my-new-book,,,2025,2025-08-01,read,"Quick thought about the book.","AI take here about themes, pacing, vibes.",5,Japan,https://openlibrary.org/works/OL12345W,9780000000000,English,,Literary fiction
   ```

2) Find the API cover and sync JSON
   - Run `node tools/sync-books-data.mjs --enrich-covers` to match missing cover IDs. A result is accepted only when both normalized title and author match.
   - Run `node tools/sync-books-data.mjs --refresh-covers` to re-check every cached cover ID under the same strict rule; unmatched IDs are cleared instead of guessed.
   - Run `node tools/sync-books-data.mjs` after ordinary metadata-only edits.
   - Optional: `node tools/sync-books-data.mjs --enrich-open-library` to backfill missing `book_url`, `isbn`, `language`, and `genre` from Open Library when the service is available.

3) Commit and push
   - Stage the CSV change, generated `data/books.json`, and any sync-tool changes.
   - Push to deploy; no edits are possible from the live site.

## Tips
- If you add many books at once, appending to the CSV is fine; run the sync script afterward and the UI will sort them for you.  
- If a verified API cover is unavailable, the page renders a designed placeholder using the same raised-block treatment.
- If you need to hide a book temporarily, change `status` to anything else (it will be filtered out by default).
- The page supports keyboard shortcuts: `Esc` clears search, `Enter` opens the selected book page, and the arrow keys move between visible books.
