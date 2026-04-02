#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_CSV_PATH = 'data/books.csv';
const DEFAULT_JSON_PATH = 'data/books.json';
const OPEN_LIBRARY_SEARCH_URL = 'https://openlibrary.org/search.json';
const SCHEMA_HEADERS = [
  'title',
  'author',
  'slug',
  'cover_image',
  'release_date',
  'date_read',
  'status',
  'comment',
  'ai_comment',
  'rating',
  'country',
  'book_url',
  'isbn',
  'language',
  'translated_from',
  'genre'
];

const LANGUAGE_NAMES = {
  eng: 'English',
  jpn: 'Japanese',
  kor: 'Korean',
  chi: 'Chinese',
  zho: 'Chinese',
  nor: 'Norwegian',
  nob: 'Norwegian',
  nno: 'Norwegian',
  swe: 'Swedish',
  fra: 'French',
  deu: 'German',
  spa: 'Spanish',
  ita: 'Italian',
  rus: 'Russian'
};

const GENRE_RULES = [
  ['Graphic novel', ['graphic novels', 'graphic novel', 'comics', 'comic books', 'cartoons']],
  ['Science fiction', ['science fiction', 'aliens', 'space travel', 'time travel', 'dystopias']],
  ['Fantasy', ['fantasy', 'magic', 'mythology', 'folklore']],
  ['Mystery', ['mystery', 'detective', 'murder', 'crime', 'suspense']],
  ['Horror', ['horror', 'ghost stories', 'supernatural']],
  ['Short stories', ['short stories', 'short story']],
  ['History', ['history', 'historical']],
  ['Politics', ['politics and government', 'politics', 'political science']],
  ['Science', ['science', 'genetics', 'biology', 'artificial intelligence']],
  ['Memoir', ['memoir', 'biography', 'autobiography', 'travel writing']],
  ['Essays', ['essays', 'criticism and interpretation']],
  ['Literary fiction', ['fiction', 'social life and customs', 'psychological fiction', 'friendship']]
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }
    const [key, inlineValue] = token.split('=');
    const normalizedKey = key.replace(/^--/, '');
    if (inlineValue !== undefined) {
      args[normalizedKey] = inlineValue;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[normalizedKey] = true;
      continue;
    }
    args[normalizedKey] = next;
    i += 1;
  }
  return args;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      continue;
    }
    if (char === '\r') {
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function toCsvCell(value) {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function serializeCsv(headers, records) {
  const lines = [headers.map((header) => toCsvCell(header)).join(',')];
  for (const record of records) {
    lines.push(headers.map((header) => toCsvCell(record[header] ?? '')).join(','));
  }
  return `${lines.join('\n')}\n`;
}

async function readBooks(csvPath) {
  const raw = await fs.readFile(csvPath, 'utf8');
  const rows = parseCsv(raw);
  if (!rows.length) {
    throw new Error(`CSV is empty: ${csvPath}`);
  }

  const headers = rows[0];
  const records = rows.slice(1).map((columns) => {
    const record = {};
    for (let i = 0; i < headers.length; i += 1) {
      record[headers[i]] = columns[i] ?? '';
    }
    return record;
  });

  return { headers, records };
}

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugifyTitle(value = '') {
  return normalizeText(value).replace(/\s+/g, '-') || 'untitled-book';
}

function cleanField(value) {
  return String(value ?? '').trim();
}

function buildFallbackBookUrl(record) {
  const params = new URLSearchParams();
  if (record.title) {
    params.set('title', record.title);
  }
  if (record.author) {
    params.set('author', record.author);
  }
  return `https://openlibrary.org/search?${params.toString()}`;
}

function getOrderedHeaders(headers) {
  const extraHeaders = headers.filter((header) => !SCHEMA_HEADERS.includes(header));
  return [...SCHEMA_HEADERS, ...extraHeaders];
}

function normalizeRecord(record, headers) {
  const next = {};
  for (const header of headers) {
    next[header] = cleanField(record[header]);
  }

  next.slug = next.slug || slugifyTitle(next.title);
  next.book_url = next.book_url || buildFallbackBookUrl(next);
  return next;
}

function scoreBookMatch(record, candidate) {
  const wantedTitle = normalizeText(record.title);
  const wantedAuthor = normalizeText(record.author);
  const candidateTitle = normalizeText(candidate.title);
  const candidateAuthors = (candidate.author_name || []).map((name) => normalizeText(name));
  const wantedYear = Number.parseInt(record.release_date, 10);

  let score = 0;

  if (candidateTitle === wantedTitle) {
    score += 120;
  } else if (candidateTitle.includes(wantedTitle) || wantedTitle.includes(candidateTitle)) {
    score += 80;
  }

  if (wantedAuthor) {
    if (candidateAuthors.includes(wantedAuthor)) {
      score += 60;
    } else if (candidateAuthors.some((name) => name.includes(wantedAuthor) || wantedAuthor.includes(name))) {
      score += 35;
    }
  }

  if (Number.isFinite(wantedYear) && candidate.first_publish_year === wantedYear) {
    score += 20;
  }

  return score;
}

function pickLanguage(languageCodes) {
  if (!Array.isArray(languageCodes) || !languageCodes.length) {
    return '';
  }

  const normalizedCodes = languageCodes.map((code) => String(code).toLowerCase());
  if (normalizedCodes.includes('eng')) {
    return 'English';
  }

  for (const code of normalizedCodes) {
    if (LANGUAGE_NAMES[code]) {
      return LANGUAGE_NAMES[code];
    }
  }

  return '';
}

function pickGenre(subjects) {
  if (!Array.isArray(subjects) || !subjects.length) {
    return '';
  }

  const normalizedSubjects = subjects.map((subject) => normalizeText(subject));
  for (const [genre, keywords] of GENRE_RULES) {
    if (normalizedSubjects.some((subject) => keywords.some((keyword) => subject.includes(keyword)))) {
      return genre;
    }
  }

  return '';
}

async function lookupOpenLibrary(record) {
  const params = new URLSearchParams({
    title: record.title || '',
    limit: '5',
    fields: 'key,title,author_name,first_publish_year,isbn,language,subject'
  });

  if (record.author) {
    params.set('author', record.author);
  }

  const response = await fetch(`${OPEN_LIBRARY_SEARCH_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Open Library lookup failed with status ${response.status}`);
  }

  const payload = await response.json();
  const candidates = Array.isArray(payload.docs) ? payload.docs : [];
  const bestMatch = candidates
    .map((candidate) => ({ candidate, score: scoreBookMatch(record, candidate) }))
    .sort((a, b) => b.score - a.score)[0];

  if (!bestMatch || bestMatch.score < 80) {
    return null;
  }

  return bestMatch.candidate;
}

async function enrichRecord(record) {
  const candidate = await lookupOpenLibrary(record);
  if (!candidate) {
    return record;
  }

  record.book_url = candidate.key ? `https://openlibrary.org${candidate.key}` : record.book_url;

  if (!record.isbn && Array.isArray(candidate.isbn) && candidate.isbn.length) {
    [record.isbn] = candidate.isbn;
  }

  if (!record.language) {
    record.language = pickLanguage(candidate.language);
  }

  if (!record.genre) {
    record.genre = pickGenre(candidate.subject);
  }

  return record;
}

function buildSearchIndex(record) {
  return normalizeText([
    record.title,
    record.author,
    record.genre,
    record.language,
    record.translated_from
  ].filter(Boolean).join(' '));
}

function toJsonRecord(record) {
  return {
    title: record.title,
    author: record.author,
    slug: record.slug,
    cover_image: record.cover_image,
    release_date: record.release_date,
    date_read: record.date_read,
    status: record.status,
    comment: record.comment,
    ai_comment: record.ai_comment,
    rating: record.rating,
    country: record.country,
    book_url: record.book_url,
    isbn: record.isbn,
    language: record.language,
    translated_from: record.translated_from,
    genre: record.genre,
    search_index: buildSearchIndex(record)
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const csvPath = path.resolve(String(args.csv || DEFAULT_CSV_PATH));
  const jsonPath = path.resolve(String(args.json || DEFAULT_JSON_PATH));
  const shouldEnrich = Boolean(args['enrich-open-library']);

  const { headers, records } = await readBooks(csvPath);
  const orderedHeaders = getOrderedHeaders(headers);
  const normalizedRecords = records.map((record) => normalizeRecord(record, orderedHeaders));

  if (shouldEnrich) {
    for (let i = 0; i < normalizedRecords.length; i += 1) {
      const record = normalizedRecords[i];
      try {
        console.log(`[enrich] ${i + 1}/${normalizedRecords.length}: ${record.title}`);
        await enrichRecord(record);
      } catch (error) {
        console.warn(`[warn] ${record.title}: ${error.message}`);
      }
    }
  }

  const csvOutput = serializeCsv(orderedHeaders, normalizedRecords);
  await fs.writeFile(csvPath, csvOutput, 'utf8');

  const jsonOutput = {
    generated_at: new Date().toISOString(),
    count: normalizedRecords.length,
    books: normalizedRecords.map((record) => toJsonRecord(record))
  };

  await fs.writeFile(jsonPath, `${JSON.stringify(jsonOutput, null, 2)}\n`, 'utf8');

  console.log(`[done] Updated ${csvPath}`);
  console.log(`[done] Wrote ${jsonPath}`);
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
