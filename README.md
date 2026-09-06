# Mimmi’s Kindle Library

A single-page reading library designed around an e-ink reader.

## Experience

- The first viewport contains one Kindle-style reader displaying the selected book’s database details.
- Pressing the reader flips it to an artwork-only back with no title, author, or branding overlay.
- Every book has an original limited-ink wrap informed by its local reference cover. Artwork runs edge to edge on both the hero and shelf Kindle backs.
- The hero Kindle samples the artwork’s edge color so its front shell automatically belongs to the same wrap.
- The flip includes a brief stepped refresh reveal that keeps the transition tactile.
- Scrolling reveals the other books as artwork-wrapped Kindle backs with no text laid over them.
- The library toggle switches those devices between **Currently reading** and **Already read**.
- Selecting a library device moves that book into the hero reader and updates the `?book=` and `?view=` URL state.
- The artwork stays text-free; the Kindle screen remains the only place where title and author appear.

## Data

The interface reads `data/books.json`. Published-cover references remain in `assets/`; the 57 original, print-oriented Kindle wraps are stored in `assets/kindle-wraps/`. The displayed artwork no longer depends on a remote cover API.

## Local preview

Serve the directory over HTTP, then open `index.html`. The JSON data will not load reliably when the page is opened directly with a `file://` URL.
