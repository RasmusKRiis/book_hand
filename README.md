# Pixel Reading Shelf (view-only)

The live page is read-only. All new books and cover art are added locally and then pushed.

## Quick start
- Serve locally so JSON fetch works: `python -m http.server 8000` and open `http://localhost:8000`.
- Source data lives in `data/books.csv`; the frontend reads generated `data/books.json`. Covers live in `assets/`.
- The grid shows only `status=reading` by default; toggle switches to all books. Sorting is automatic (newest `date_read` first; blanks float to the top).
- URL state is preserved for filter/search/current book, so refreshing keeps the same view.

## Add a new book
1) Prepare the cover  
   - 3:4 aspect PNG preferred (e.g., 900x1200); keep files under ~500 KB.  
   - Name it with lowercase + underscores, e.g., `my_new_book.png`.  
   - Drop the file in `assets/`. If a cover is missing or mistyped, the UI will fall back to `book.png`.

2) Add a row to `data/books.csv`  
   - Columns: `title,author,slug,cover_image,release_date,date_read,status,comment,ai_comment,rating,country,book_url,isbn,language,translated_from,genre`.  
   - `slug`: URL-safe identifier. Leave blank to auto-generate from the title.  
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
   My New Book,Author Name,my-new-book,my_new_book.png,2025,2025-08-01,read,"Quick thought about the book.","AI take here about themes, pacing, vibes.",5,Japan,https://openlibrary.org/works/OL12345W,9780000000000,English,,Literary fiction
   ```

3) Sync JSON  
   - Run `node tools/sync-books-data.mjs`
   - Optional: `node tools/sync-books-data.mjs --enrich-open-library` to backfill missing `book_url`, `isbn`, `language`, and `genre` from Open Library when the service is available.

4) Commit and push  
   - Stage the new cover file and the CSV change.  
   - Include the generated `data/books.json`.
   - Push to deploy; no edits are possible from the live site.

## Automated pixel-cover generation queue
You can drop source covers into a queue folder, and a script will generate pixel-art 3D versions, place them in `assets/`, and update `data/books.csv` so the site uses the new image for that title.

1) Put source files in the queue  
   - Folder: `cover_queue/incoming/`  
   - Filename must match the book title (extension can be `.png`, `.jpg`, `.jpeg`, `.webp`).  
   - Matching is case-insensitive and ignores punctuation, `_`, and `-`.

2) Set API key  
   - `export OPENAI_API_KEY="your_key_here"`

3) Run one scan (recommended first)  
   - `node tools/cover-queue.mjs --once`

4) Run continuously on an interval  
   - Example every 15 minutes:  
     `node tools/cover-queue.mjs --interval-minutes 15`

What it does per file:
- Finds the matching row in `data/books.csv` by title.
- Sends the image to OpenAI image edits with the pixel-art 3D prompt.
- Saves output as `assets/<title>_pixel.png`.
- Sets that row's `cover_image` to `<title>_pixel.png`.
- Moves the original input file to `cover_queue/processed/` to avoid reprocessing.
- After updating covers, run `node tools/sync-books-data.mjs` so `data/books.json` stays current.

Useful options:
- `--dry-run`: show matches/actions without API calls or file changes.
- `--input-dir <path>`: custom incoming folder.
- `--processed-dir <path>`: custom processed folder.
- `--output-dir <path>`: custom generated image folder (default `assets`).
- `--csv <path>`: custom CSV path (default `data/books.csv`).
- `--model <name>`: override image model (default `gpt-image-1`).
- `--size <WxH>`: override image size (default `1024x1536`).
- `--prompt-file <path>`: use a custom prompt text file.

## Tips
- Keep cover filenames unique to avoid browser caching confusion.  
- If you add many books at once, appending to the CSV is fine; run the sync script afterward and the UI will sort them for you.  
- If you need to hide a book temporarily, change `status` to anything else (it will be filtered out by default).
- The page supports keyboard shortcuts: `Esc` clears search, `Enter` opens the selected book page, and the arrow keys move between visible books.
