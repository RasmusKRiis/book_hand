#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_PROMPT =
  "Create a 3D book cover in pixel art style, shown at a three-quarter angle (with the left spine visible, do not show the right spine), based on the attached book cover. The front should preserve the original title and author text layout, using clear bold fonts as in the orginal IMPORTNAT that are very readable (very subtle slitly pixalated). The artwork should be PIXALATED (very important) but still recognizable, mimicking the original color palette and composition. Place the title and author prominently on the front. Add the book title vertically on the spine. Use soft lighting, clean white background, and output as a high-resolution PNG with transparent background, no shadows.";
const DEFAULT_INPUT_DIR = 'cover_queue/incoming';
const DEFAULT_PROCESSED_DIR = 'cover_queue/processed';
const DEFAULT_OUTPUT_DIR = 'assets';
const DEFAULT_CSV_PATH = 'data/books.csv';
const DEFAULT_INTERVAL_MINUTES = 30;
const DEFAULT_MODEL = 'gpt-image-1';
const DEFAULT_SIZE = '1024x1536';
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

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

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugifyTitle(value) {
  return normalizeTitle(value).replace(/\s+/g, '_') || 'untitled_book';
}

function detectMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') {
    return 'image/png';
  }
  if (ext === '.jpg' || ext === '.jpeg') {
    return 'image/jpeg';
  }
  if (ext === '.webp') {
    return 'image/webp';
  }
  return 'application/octet-stream';
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
        const peek = text[i + 1];
        if (peek === '"') {
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
  if (rows.length === 0) {
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

function indexBooksByTitle(records) {
  const index = new Map();
  records.forEach((record, rowIndex) => {
    const normalized = normalizeTitle(record.title);
    if (!normalized) {
      return;
    }
    if (!index.has(normalized)) {
      index.set(normalized, rowIndex);
    }
  });
  return index;
}

function findBookForFile(filename, records, index) {
  const base = path.parse(filename).name;
  const normalizedFromFile = normalizeTitle(base);
  const directIndex = index.get(normalizedFromFile);
  if (directIndex !== undefined) {
    return directIndex;
  }

  const compact = normalizedFromFile.replace(/\s+/g, '');
  if (!compact) {
    return undefined;
  }

  for (let i = 0; i < records.length; i += 1) {
    const normalizedTitle = normalizeTitle(records[i].title);
    if (normalizedTitle.replace(/\s+/g, '') === compact) {
      return i;
    }
  }

  return undefined;
}

async function listQueueFiles(inputDir) {
  await fs.mkdir(inputDir, { recursive: true });
  const entries = await fs.readdir(inputDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function loadPrompt(args) {
  if (args['prompt-file']) {
    return fs.readFile(String(args['prompt-file']), 'utf8');
  }
  if (args.prompt) {
    return String(args.prompt);
  }
  if (process.env.COVER_GEN_PROMPT) {
    return process.env.COVER_GEN_PROMPT;
  }
  return DEFAULT_PROMPT;
}

function buildPrompt(basePrompt, book) {
  return `${basePrompt}\n\nBook title: ${book.title}\nAuthor: ${book.author || 'Unknown'}`;
}

async function callImageEditApi({ apiKey, model, size, prompt, inputFilePath }) {
  const imageBytes = await fs.readFile(inputFilePath);
  const imageFile = new File([imageBytes], path.basename(inputFilePath), {
    type: detectMimeType(inputFilePath)
  });

  const form = new FormData();
  form.set('model', model);
  form.set('prompt', prompt);
  form.set('image', imageFile);
  form.set('background', 'transparent');
  form.set('output_format', 'png');
  form.set('size', size);

  const response = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI API error (${response.status}): ${bodyText}`);
  }

  let json;
  try {
    json = JSON.parse(bodyText);
  } catch {
    throw new Error('OpenAI API response was not valid JSON.');
  }

  const item = json?.data?.[0];
  if (!item) {
    throw new Error('OpenAI API response did not include image data.');
  }

  if (item.b64_json) {
    return Buffer.from(item.b64_json, 'base64');
  }

  if (item.url) {
    const imageResponse = await fetch(item.url);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download generated image URL (${imageResponse.status}).`);
    }
    const arrayBuffer = await imageResponse.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  throw new Error('OpenAI API image payload was missing b64_json and url.');
}

async function moveToProcessed(sourceFilePath, processedDir) {
  await fs.mkdir(processedDir, { recursive: true });
  const sourceName = path.basename(sourceFilePath);
  let targetPath = path.join(processedDir, sourceName);

  for (let attempt = 1; ; attempt += 1) {
    try {
      await fs.access(targetPath);
      const parsed = path.parse(sourceName);
      targetPath = path.join(processedDir, `${parsed.name}_${Date.now()}_${attempt}${parsed.ext}`);
    } catch {
      break;
    }
  }

  try {
    await fs.rename(sourceFilePath, targetPath);
  } catch (error) {
    if (error?.code !== 'EXDEV') {
      throw error;
    }
    await fs.copyFile(sourceFilePath, targetPath);
    await fs.unlink(sourceFilePath);
  }
}

async function processQueue(config) {
  const {
    csvPath,
    inputDir,
    outputDir,
    processedDir,
    dryRun,
    prompt,
    model,
    size,
    apiKey
  } = config;

  const { headers, records } = await readBooks(csvPath);
  const titleIndex = indexBooksByTitle(records);
  const queueFiles = await listQueueFiles(inputDir);

  if (queueFiles.length === 0) {
    console.log(`[${new Date().toISOString()}] Queue is empty (${inputDir}).`);
    return;
  }

  await fs.mkdir(outputDir, { recursive: true });
  let csvChanged = false;

  for (const filename of queueFiles) {
    try {
      const sourceFilePath = path.join(inputDir, filename);
      const matchRow = findBookForFile(filename, records, titleIndex);
      if (matchRow === undefined) {
        console.warn(`[skip] Could not match file "${filename}" to any book title in ${csvPath}.`);
        continue;
      }

      const book = records[matchRow];
      const outputFileName = `${slugifyTitle(book.title)}_pixel.png`;
      const outputFilePath = path.join(outputDir, outputFileName);
      const coverPrompt = buildPrompt(prompt, book);

      console.log(`[process] "${filename}" -> "${book.title}"`);

      if (dryRun) {
        console.log(`[dry-run] Would generate ${outputFileName}, update CSV, and move source file.`);
        continue;
      }

      const generatedImage = await callImageEditApi({
        apiKey,
        model,
        size,
        prompt: coverPrompt,
        inputFilePath: sourceFilePath
      });

      await fs.writeFile(outputFilePath, generatedImage);

      if (book.cover_image !== outputFileName) {
        book.cover_image = outputFileName;
        csvChanged = true;
      }

      await moveToProcessed(sourceFilePath, processedDir);
      console.log(`[done] Wrote ${outputFilePath}`);
    } catch (error) {
      console.error(`[error] Failed to process "${filename}": ${error.message}`);
    }
  }

  if (!dryRun && csvChanged) {
    const updated = serializeCsv(headers, records);
    await fs.writeFile(csvPath, updated, 'utf8');
    console.log(`[done] Updated ${csvPath}`);
  }
}

function toIntegerOrDefault(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const prompt = await loadPrompt(args);
  const dryRun = Boolean(args['dry-run']);
  const once = Boolean(args.once);
  const intervalMinutes = toIntegerOrDefault(args['interval-minutes'], DEFAULT_INTERVAL_MINUTES);
  const intervalMs = intervalMinutes * 60 * 1000;
  const inputDir = path.resolve(String(args['input-dir'] || DEFAULT_INPUT_DIR));
  const processedDir = path.resolve(String(args['processed-dir'] || DEFAULT_PROCESSED_DIR));
  const outputDir = path.resolve(String(args['output-dir'] || DEFAULT_OUTPUT_DIR));
  const csvPath = path.resolve(String(args.csv || DEFAULT_CSV_PATH));
  const model = String(args.model || process.env.OPENAI_IMAGE_MODEL || DEFAULT_MODEL);
  const size = String(args.size || process.env.COVER_GEN_SIZE || DEFAULT_SIZE);
  const apiKey = process.env.OPENAI_API_KEY;

  if (!dryRun && !apiKey) {
    throw new Error('Missing OPENAI_API_KEY. Export it before running this script.');
  }

  const config = {
    csvPath,
    inputDir,
    outputDir,
    processedDir,
    dryRun,
    prompt,
    model,
    size,
    apiKey
  };

  console.log(`[start] Input: ${inputDir}`);
  console.log(`[start] Processed: ${processedDir}`);
  console.log(`[start] Assets output: ${outputDir}`);
  console.log(`[start] CSV: ${csvPath}`);
  console.log(`[start] Model: ${model}`);
  console.log(`[start] Size: ${size}`);
  if (dryRun) {
    console.log('[start] Running in dry-run mode (no files/API changes).');
  }

  do {
    const startedAt = Date.now();
    try {
      await processQueue(config);
    } catch (error) {
      console.error(`[error] ${error.message}`);
    }

    if (once) {
      break;
    }

    const elapsed = Date.now() - startedAt;
    const waitForMs = Math.max(0, intervalMs - elapsed);
    console.log(`[sleep] Next scan in ${(waitForMs / 1000).toFixed(0)}s`);
    await sleep(waitForMs);
  } while (true);
}

run().catch((error) => {
  console.error(`[fatal] ${error.message}`);
  process.exitCode = 1;
});
