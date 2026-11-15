import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(readFileSync(join(projectRoot, 'data/books.json'), 'utf8'));
const books = data.books;
const errors = [];
const slugs = new Set();
const hashes = new Map();

function jpegSize(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    offset += 2;

    if (marker === 0xd8 || marker === 0xd9) continue;
    if (offset + 2 > buffer.length) break;

    const length = buffer.readUInt16BE(offset);
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker);

    if (isStartOfFrame && offset + 7 < buffer.length) {
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }

    if (length < 2) break;
    offset += length;
  }

  return null;
}

if (!Array.isArray(books)) errors.push('data/books.json must contain a books array.');
if (data.count !== books.length) {
  errors.push(`data.count is ${data.count}, but the books array contains ${books.length} entries.`);
}

for (const book of books) {
  if (!book.slug) {
    errors.push(`Book "${book.title || 'untitled'}" has no slug.`);
    continue;
  }

  if (slugs.has(book.slug)) errors.push(`Duplicate book slug: ${book.slug}`);
  slugs.add(book.slug);

  const artworkPath = join(projectRoot, 'assets/kindle-wraps', `${book.slug}.jpg`);
  if (!existsSync(artworkPath)) {
    errors.push(`Missing artwork: assets/kindle-wraps/${book.slug}.jpg`);
    continue;
  }

  const buffer = readFileSync(artworkPath);
  const size = jpegSize(buffer);
  if (!size) {
    errors.push(`Artwork is not a readable JPEG: assets/kindle-wraps/${book.slug}.jpg`);
  } else if (size.width !== 800 || size.height !== 1200) {
    errors.push(`${book.slug}.jpg is ${size.width}x${size.height}; expected 800x1200.`);
  }

  const hash = createHash('sha256').update(buffer).digest('hex');
  if (hashes.has(hash)) {
    errors.push(`Duplicate artwork files: ${hashes.get(hash)} and ${book.slug}`);
  } else {
    hashes.set(hash, book.slug);
  }
}

if (errors.length) {
  console.error(`Artwork validation failed with ${errors.length} problem${errors.length === 1 ? '' : 's'}:`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Artwork validation passed: ${books.length} unique books, ${books.length} unique 800x1200 JPEG wraps.`);
