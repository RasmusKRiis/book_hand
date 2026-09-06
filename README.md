# Mimmi’s Kindle Library

A single-page reading library designed around an e-ink reader.

## Experience

- The first viewport contains one Kindle-style reader displaying the selected book’s database details.
- Pressing the reader flips it to a graphite back engraved with the verified Open Library cover artwork.
- Scrolling reveals every other book as a Kindle backside with its title and author engraved into the shell.
- Selecting a library device moves that book into the hero reader and updates the `?book=` URL.
- Books without verified cover artwork receive a monogram engraving on the hero back.

## Data

The interface reads `data/books.json`. Cover artwork is loaded only from a numeric `cover_id` using Open Library’s Covers API. No local cover images are used.

## Local preview

Serve the directory over HTTP, then open `index.html`. The JSON data will not load reliably when the page is opened directly with a `file://` URL.
