const toggle = document.getElementById('filterToggle');
const label = document.getElementById('filterLabel');
const searchInput = document.getElementById('searchInput');
const grid = document.getElementById('grid');
const starsEl = document.getElementById('stars');
const bookDisplay = document.getElementById('bookLink');
const coverEl = document.getElementById('cover');
const pixelCoverEl = document.getElementById('pixelCover');
const bookObjectEl = document.getElementById('bookObject');
const titleEl = document.getElementById('title');
const authorEl = document.getElementById('author');
const releasedEl = document.getElementById('released');
const readEl = document.getElementById('read');
const aiCommentEl = document.getElementById('aiComment');
const shelfCountEl = document.getElementById('shelfCount');

const BOOKS_JSON_URL = 'data/books.json';
const INITIAL_GRID_ITEMS = 10;
const GRID_CHUNK_SIZE = 10;
const FINAL_PIXEL_WIDTH = 240;
const HERO_BLOCK_COLUMNS = 24;
const SHELF_BLOCK_WIDTH = 120;
const SHELF_BLOCK_COLUMNS = 10;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let books = [];
let visibleBooks = [];
let filter = 'reading';
let searchTerm = '';
let currentBook = null;
let selectedSlug = '';
let isLoaded = false;
let renderedGridCount = 0;
let gridSentinel = null;
let gridObserver = null;
let paletteRequestId = 0;
let swapTimer = null;
let pixelFrameTimers = [];

function clearPixelFrameTimers(){
  pixelFrameTimers.forEach((timer) => window.clearTimeout(timer));
  pixelFrameTimers = [];
}

function rgbToHsl(red, green, blue){
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;

  if(delta){
    if(max === r){
      hue = ((g - b) / delta) % 6;
    }else if(max === g){
      hue = (b - r) / delta + 2;
    }else{
      hue = (r - g) / delta + 4;
    }
    hue /= 6;
    if(hue < 0){
      hue += 1;
    }
  }

  const lightness = (max + min) / 2;
  const saturation = delta === 0
    ? 0
    : delta / (1 - Math.abs(2 * lightness - 1));

  return { hue, saturation, lightness };
}

function getDominantCoverColor(image){
  const canvas = document.createElement('canvas');
  canvas.width = 42;
  canvas.height = 42;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if(!context){
    return { red: 230, green: 156, blue: 50 };
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const buckets = Array.from({ length: 18 }, () => ({
    score: 0,
    red: 0,
    green: 0,
    blue: 0
  }));

  for(let index = 0; index < pixels.length; index += 4){
    if(pixels[index + 3] < 180){
      continue;
    }

    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const { hue, saturation, lightness } = rgbToHsl(red, green, blue);

    if(lightness < .07 || lightness > .94 || saturation < .08){
      continue;
    }

    const weight = (.35 + saturation * 1.45) * (1 - Math.abs(lightness - .52));
    const bucket = buckets[Math.min(17, Math.floor(hue * buckets.length))];
    bucket.score += weight;
    bucket.red += red * weight;
    bucket.green += green * weight;
    bucket.blue += blue * weight;
  }

  const winner = buckets.reduce((best, bucket) => bucket.score > best.score ? bucket : best);
  if(!winner.score){
    return { red: 230, green: 156, blue: 50 };
  }

  return {
    red: Math.round(winner.red / winner.score),
    green: Math.round(winner.green / winner.score),
    blue: Math.round(winner.blue / winner.score)
  };
}

function hslString(hue, saturation, lightness){
  const normalizedHue = ((hue % 360) + 360) % 360;
  return `hsl(${Math.round(normalizedHue)} ${Math.round(saturation)}% ${Math.round(lightness)}%)`;
}

function roundedCanvasRect(context, x, y, width, height, radius){
  context.beginPath();
  if(typeof context.roundRect === 'function'){
    context.roundRect(x, y, width, height, radius);
  }else{
    context.rect(x, y, width, height);
  }
}

function drawBlockCover(image, canvas, width, columns){
  const imageWidth = image?.naturalWidth || image?.width || 0;
  const imageHeight = image?.naturalHeight || image?.height || 0;
  if(!canvas || !imageWidth || !imageHeight){
    return null;
  }

  const ratio = imageWidth / imageHeight;
  const height = Math.max(1, Math.round(width / ratio));
  const blockSize = Math.max(1, Math.ceil(width / Math.min(columns, width)));
  const gridColumns = Math.ceil(width / blockSize);
  const gridRows = Math.ceil(height / blockSize);
  const occupied = Array.from({ length:gridRows }, () => Array(gridColumns).fill(false));
  const sourceIdentity = image?.currentSrc || image?.src || `${imageWidth}x${imageHeight}`;
  const patternSeed = hashText(sourceIdentity);
  const gap = width >= 48 ? Math.max(.65, width / 360) : 0;
  const radius = width >= 48 ? Math.max(1, width / 170) : 0;
  const context = canvas.getContext('2d');
  if(!context){
    return null;
  }

  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;

  const canPlace = (column, row, spanX, spanY) => {
    if(column + spanX > gridColumns || row + spanY > gridRows){
      return false;
    }
    for(let offsetY = 0; offsetY < spanY; offsetY += 1){
      for(let offsetX = 0; offsetX < spanX; offsetX += 1){
        if(occupied[row + offsetY][column + offsetX]){
          return false;
        }
      }
    }
    return true;
  };

  const occupy = (column, row, spanX, spanY) => {
    for(let offsetY = 0; offsetY < spanY; offsetY += 1){
      for(let offsetX = 0; offsetX < spanX; offsetX += 1){
        occupied[row + offsetY][column + offsetX] = true;
      }
    }
  };

  for(let row = 0; row < gridRows; row += 1){
    for(let column = 0; column < gridColumns; column += 1){
      if(occupied[row][column]){
        continue;
      }

      const variant = Math.abs(patternSeed + row * 37 + column * 83 + row * column * 11) % 17;
      const preferredShape = variant === 0
        ? [3, 2]
        : variant <= 2
          ? [2, 2]
          : variant <= 5
            ? [2, 1]
            : variant <= 8
              ? [1, 2]
              : [1, 1];
      let [spanX, spanY] = preferredShape;
      if(!canPlace(column, row, spanX, spanY)){
        [spanX, spanY] = canPlace(column, row, 2, 1)
          ? [2, 1]
          : canPlace(column, row, 1, 2)
            ? [1, 2]
            : [1, 1];
      }
      occupy(column, row, spanX, spanY);

      const x = column * blockSize;
      const y = row * blockSize;
      const cellWidth = Math.min(spanX * blockSize, width - x);
      const cellHeight = Math.min(spanY * blockSize, height - y);
      const inset = gap / 2;
      const drawWidth = Math.max(1, cellWidth - gap);
      const drawHeight = Math.max(1, cellHeight - gap);
      const sourceX = x / width * imageWidth;
      const sourceY = y / height * imageHeight;
      const sourceWidth = cellWidth / width * imageWidth;
      const sourceHeight = cellHeight / height * imageHeight;

      context.save();
      roundedCanvasRect(context, x + inset, y + inset, drawWidth, drawHeight, radius);
      context.clip();
      context.drawImage(
        image,
        sourceX,
        sourceY,
        sourceWidth,
        sourceHeight,
        x + inset,
        y + inset,
        drawWidth,
        drawHeight
      );

      const variation = variant % 5;
      context.fillStyle = variation === 0
        ? 'rgba(255,255,255,.07)'
        : variation === 4
          ? 'rgba(0,0,0,.06)'
          : 'transparent';
      context.fillRect(x + inset, y + inset, drawWidth, drawHeight);

      const bevel = Math.max(.75, width / 260);
      context.fillStyle = 'rgba(255,255,255,.2)';
      context.fillRect(x + inset, y + inset, drawWidth, bevel);
      context.fillRect(x + inset, y + inset, bevel, drawHeight);
      context.fillStyle = 'rgba(0,0,0,.24)';
      context.fillRect(x + inset, y + inset + drawHeight - bevel, drawWidth, bevel);
      context.fillRect(x + inset + drawWidth - bevel, y + inset, bevel, drawHeight);
      context.restore();
    }
  }

  return { width, height };
}

function drawPixelCover(image, width){
  if(!pixelCoverEl || !bookObjectEl){
    return;
  }

  const dimensions = drawBlockCover(image, pixelCoverEl, width, HERO_BLOCK_COLUMNS);
  if(!dimensions){
    return;
  }
  bookObjectEl.style.setProperty('--cover-ratio', `${dimensions.width} / ${dimensions.height}`);
}

function triggerBookMaterialize(){
  if(!bookObjectEl){
    return;
  }
  bookObjectEl.classList.remove('is-loading', 'is-leaving', 'is-materializing');
  void bookObjectEl.offsetWidth;
  bookObjectEl.classList.add('is-materializing');
  const timer = window.setTimeout(() => {
    bookObjectEl.classList.remove('is-materializing');
  }, 700);
  pixelFrameTimers.push(timer);
}

function renderPixelCover(image){
  clearPixelFrameTimers();
  const widths = reducedMotion
    ? [FINAL_PIXEL_WIDTH]
    : [10, 18, 30, 48, 76, 116, FINAL_PIXEL_WIDTH];

  widths.forEach((width, index) => {
    const timer = window.setTimeout(() => {
      drawPixelCover(image, width);
      if(index === 0){
        triggerBookMaterialize();
      }
    }, reducedMotion ? 0 : index * 62);
    pixelFrameTimers.push(timer);
  });
}

function hashText(value = ''){
  let hash = 0;
  for(let index = 0; index < value.length; index += 1){
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function applyPlaceholderPalette(title, author){
  const coverHue = hashText(`${title}|${author}`) % 360;
  const complementHue = (coverHue + 180) % 360;
  const theme = {
    '--theme-cover': hslString(coverHue, 58, 48),
    '--theme-accent': hslString(coverHue, 68, 50),
    '--theme-bg': hslString(complementHue, 40, 78),
    '--theme-panel': hslString(complementHue, 28, 89),
    '--theme-ink': hslString(complementHue, 38, 17),
    '--theme-shadow': hslString(complementHue, 34, 39)
  };

  Object.entries(theme).forEach(([property, value]) => {
    document.documentElement.style.setProperty(property, value);
  });
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme['--theme-bg']);
}

function renderCoverPlaceholder(title, author){
  clearPixelFrameTimers();
  if(!pixelCoverEl || !bookObjectEl){
    return;
  }

  const width = 72;
  const height = 108;
  pixelCoverEl.width = width;
  pixelCoverEl.height = height;
  bookObjectEl.style.setProperty('--cover-ratio', `${width} / ${height}`);
  const context = pixelCoverEl.getContext('2d');
  if(!context){
    return;
  }

  const seed = hashText(`${title}|${author}`);
  const hue = seed % 360;
  context.fillStyle = `hsl(${hue} 44% 26%)`;
  context.fillRect(0, 0, width, height);
  context.fillStyle = `hsl(${(hue + 38) % 360} 72% 62%)`;
  for(let y = 0; y < 72; y += 9){
    for(let x = 0; x < width; x += 9){
      if(((x / 9) + (y / 9) + seed) % 4 === 0){
        context.fillRect(x, y, 9, 9);
      }
    }
  }
  context.fillStyle = 'rgba(255, 248, 232, .92)';
  context.fillRect(10, 13, width - 20, 44);
  context.fillStyle = `hsl(${(hue + 180) % 360} 48% 28%)`;
  context.fillRect(16, 20, width - 32, 6);
  context.fillRect(16, 32, width - 24, 6);
  context.fillRect(16, 44, width - 38, 6);

  const placeholderSource = document.createElement('canvas');
  placeholderSource.width = width;
  placeholderSource.height = height;
  placeholderSource.getContext('2d')?.drawImage(pixelCoverEl, 0, 0);
  drawBlockCover(placeholderSource, pixelCoverEl, width, 12);
  applyPlaceholderPalette(title, author);
  triggerBookMaterialize();
}

function applyCoverPalette(image){
  try{
    const dominant = getDominantCoverColor(image);
    const { hue, saturation, lightness } = rgbToHsl(
      dominant.red,
      dominant.green,
      dominant.blue
    );
    const coverHue = hue * 360;
    const complementHue = (coverHue + 180) % 360;
    const coverSaturation = Math.max(36, Math.min(78, saturation * 100));
    const coverLightness = Math.max(38, Math.min(62, lightness * 100));
    const pageSaturation = Math.max(28, Math.min(58, coverSaturation * .72));

    const theme = {
      '--theme-cover': hslString(coverHue, coverSaturation, coverLightness),
      '--theme-accent': hslString(coverHue, Math.max(55, coverSaturation), 51),
      '--theme-bg': hslString(complementHue, pageSaturation, 79),
      '--theme-panel': hslString(complementHue, Math.max(18, pageSaturation * .62), 89),
      '--theme-ink': hslString(complementHue, Math.max(25, pageSaturation * .72), 17),
      '--theme-shadow': hslString(complementHue, Math.max(22, pageSaturation * .65), 40)
    };

    Object.entries(theme).forEach(([property, value]) => {
      document.documentElement.style.setProperty(property, value);
    });

    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme['--theme-bg']);
  }catch(error){
    console.warn('Could not create a cover palette', error);
  }
}

function normalizeText(value = ''){
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function slugifyTitle(value = ''){
  return normalizeText(value).replace(/\s+/g, '-') || 'untitled-book';
}

function getDisplayText(value){
  const text = String(value || '').trim();
  return text && text !== '--' ? text : '--';
}

function clampRating(value){
  const n = Number(value);
  if(!Number.isFinite(n)){
    return 0;
  }
  return Math.max(0, Math.min(5, Math.round(n)));
}

function renderStars(rating){
  if(!starsEl){
    return;
  }
  starsEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  for(let i = 0; i < 5; i += 1){
    const span = document.createElement('span');
    span.className = `pixel-star${i < rating ? '' : ' off'}`;
    span.setAttribute('aria-hidden', 'true');
    frag.appendChild(span);
  }
  starsEl.appendChild(frag);
}

function updateLabel(){
  if(label){
    label.textContent = filter === 'all' ? 'Read' : 'Currently Reading';
  }
}

function buildFallbackBookUrl(book){
  const params = new URLSearchParams();
  if(book?.title){
    params.set('title', book.title);
  }
  if(book?.author){
    params.set('author', book.author);
  }
  return `https://openlibrary.org/search?${params.toString()}`;
}

function getBookUrl(book){
  return book?.book_url || buildFallbackBookUrl(book);
}

function getOpenLibraryCoverUrl(book, size = 'L'){
  const coverId = String(book?.cover_id || '').trim();
  if(/^\d+$/.test(coverId)){
    return `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg?default=false`;
  }
  return '';
}

function getCoverSources(book, size = 'L'){
  const apiUrl = getOpenLibraryCoverUrl(book, size);
  return apiUrl ? [{ url: apiUrl, kind: 'api' }] : [];
}

function applyUrlStateFromLocation(){
  const params = new URLSearchParams(window.location.search);
  filter = params.get('view') === 'all' ? 'all' : 'reading';
  searchTerm = params.get('q')?.trim() || '';
  selectedSlug = params.get('book')?.trim() || '';

  if(toggle){
    toggle.checked = filter === 'all';
  }
  if(searchInput){
    searchInput.value = searchTerm;
  }
  updateLabel();
}

function updateUrlState(){
  const params = new URLSearchParams();
  if(filter === 'all'){
    params.set('view', 'all');
  }
  const query = searchTerm.trim();
  if(query){
    params.set('q', query);
  }
  const slug = currentBook?.slug || selectedSlug;
  if(slug){
    params.set('book', slug);
  }

  const nextSearch = params.toString();
  const nextUrl = nextSearch ? `${window.location.pathname}?${nextSearch}` : window.location.pathname;
  window.history.replaceState({}, '', nextUrl);
}

function updateBookLinkState(){
  if(!bookDisplay){
    return;
  }
  bookDisplay.disabled = !currentBook;
  const buttonLabel = currentBook?.title
    ? `Open ${currentBook.title} book page`
    : 'Open current book page';
  bookDisplay.setAttribute('aria-label', buttonLabel);
  bookDisplay.title = buttonLabel;
}

function setHeroContent({ title, author, released, read, note, rating, book }){
  const requestId = ++paletteRequestId;
  const coverSources = book ? getCoverSources(book, 'L') : [];
  let sourceIndex = 0;

  if(bookObjectEl){
    bookObjectEl.classList.remove('is-materializing');
    bookObjectEl.classList.add('is-loading');
  }

  const showPlaceholder = () => {
    if(requestId !== paletteRequestId){
      return;
    }
    renderCoverPlaceholder(title, author);
  };

  const tryNextCover = () => {
    if(requestId !== paletteRequestId || !coverEl){
      return;
    }
    const source = coverSources[sourceIndex];
    sourceIndex += 1;
    if(!source){
      showPlaceholder();
      return;
    }

    coverEl.onload = () => {
      if(requestId !== paletteRequestId){
        return;
      }
      renderPixelCover(coverEl);
      applyCoverPalette(coverEl);
    };
    coverEl.onerror = tryNextCover;
    coverEl.removeAttribute('crossorigin');
    if(source.kind === 'api'){
      coverEl.crossOrigin = 'anonymous';
    }
    coverEl.src = source.url;
  };

  if(coverSources.length && coverEl){
    tryNextCover();
  }else{
    showPlaceholder();
  }
  titleEl.textContent = title;
  authorEl.textContent = author;
  releasedEl.textContent = released;
  readEl.textContent = read;
  if(aiCommentEl){
    aiCommentEl.textContent = note;
  }
  renderStars(rating);
}

function renderGridPlaceholders(count = INITIAL_GRID_ITEMS){
  grid.innerHTML = '';
  const frag = document.createDocumentFragment();

  for(let i = 0; i < count; i += 1){
    const placeholder = document.createElement('div');
    placeholder.className = 'thumbnail-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    const { block, face } = createShelfCoverBlock();
    block.classList.add('cover-block--loading');
    face.classList.add('cover-block-face--loading');
    placeholder.appendChild(block);
    frag.appendChild(placeholder);
  }

  grid.appendChild(frag);
}

function createShelfCoverBlock(){
  const block = document.createElement('span');
  block.className = 'cover-block';

  const face = document.createElement('span');
  face.className = 'cover-block-face';
  block.appendChild(face);

  return { block, face };
}

function showLoadingState(){
  currentBook = null;
  updateBookLinkState();
  setHeroContent({
    title: 'Loading shelf...',
    author: 'Fetching books',
    released: '--',
    read: '--',
    note: 'Preparing the next stack of covers.',
    rating: 0
  });
  grid.setAttribute('aria-busy', 'true');
  renderGridPlaceholders();
}

function showLoadError(){
  currentBook = null;
  selectedSlug = '';
  updateBookLinkState();
  setHeroContent({
    title: 'Shelf unavailable',
    author: '--',
    released: '--',
    read: '--',
    note: 'The books could not be loaded right now. Refresh and try again.',
    rating: 0
  });
  grid.removeAttribute('aria-busy');
  grid.innerHTML = '';
  const errorMessage = document.createElement('p');
  errorMessage.className = 'empty-grid-message';
  errorMessage.textContent = 'The shelf data could not be loaded.';
  grid.appendChild(errorMessage);
}

function getVisibleBooks(){
  const query = normalizeText(searchTerm);
  return books.filter((book) => {
    if(filter !== 'all' && book.status !== 'reading'){
      return false;
    }
    if(!query){
      return true;
    }
    return book.search_index.includes(query);
  });
}

function createThumbnail(book){
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'book-tile';
  card.setAttribute('aria-label', `Select ${book.title} by ${getDisplayText(book.author)}`);
  const tileHue = hashText(`${book.title}|${book.author}`) % 360;
  card.style.setProperty('--tile-color', `hsl(${tileHue} 48% 42%)`);
  card.style.setProperty('--tile-tilt', `${((tileHue % 7) - 3) * .25}deg`);

  const { block, face } = createShelfCoverBlock();
  card.appendChild(block);

  const renderMissingCover = () => {
    card.classList.add('book-tile--missing');
    card.style.setProperty('--placeholder-hue', String(tileHue));
    face.classList.add('cover-block-face--missing');
    face.innerHTML = '';

    const status = document.createElement('span');
    status.className = 'missing-cover-status';
    status.textContent = 'No cover found';

    const monogram = document.createElement('span');
    monogram.className = 'missing-cover-monogram';
    monogram.textContent = String(book.title || '?').trim().charAt(0).toUpperCase() || '?';

    const title = document.createElement('span');
    title.className = 'missing-cover-title';
    title.textContent = book.title;

    const author = document.createElement('span');
    author.className = 'missing-cover-author';
    author.textContent = getDisplayText(book.author);

    face.append(status, monogram, title, author);
  };

  const coverSources = getCoverSources(book, 'M');
  if(coverSources.length){
    const canvas = document.createElement('canvas');
    canvas.className = 'thumbnail';
    canvas.width = SHELF_BLOCK_WIDTH;
    canvas.height = Math.round(SHELF_BLOCK_WIDTH * 1.5);
    canvas.setAttribute('aria-hidden', 'true');
    face.prepend(canvas);

    const img = document.createElement('img');
    img.alt = '';
    img.className = 'thumbnail-source';
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.setAttribute('fetchpriority', 'low');
    card.appendChild(img);

    let sourceIndex = 0;
    const tryNextCover = () => {
      const source = coverSources[sourceIndex];
      sourceIndex += 1;
      if(!source){
        renderMissingCover();
        return;
      }
      img.onerror = tryNextCover;
      img.onload = () => {
        drawBlockCover(img, canvas, SHELF_BLOCK_WIDTH, SHELF_BLOCK_COLUMNS);
        try{
          const dominant = getDominantCoverColor(img);
          card.style.setProperty('--tile-color', `rgb(${dominant.red} ${dominant.green} ${dominant.blue})`);
        }catch(error){
          // The deterministic title color remains when a cover host blocks pixel access.
        }
      };
      img.crossOrigin = 'anonymous';
      img.src = source.url;
    };
    tryNextCover();
  }else{
    renderMissingCover();
  }
  card.addEventListener('click', () => {
    showBook(book, true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  return card;
}

function disconnectGridObserver(){
  if(gridObserver){
    gridObserver.disconnect();
    gridObserver = null;
  }
}

function removeGridSentinel(){
  if(gridSentinel){
    gridSentinel.remove();
    gridSentinel = null;
  }
}

function appendGridSentinel(){
  removeGridSentinel();
  if(renderedGridCount >= visibleBooks.length){
    disconnectGridObserver();
    return;
  }

  gridSentinel = document.createElement('div');
  gridSentinel.className = 'grid-sentinel';
  grid.appendChild(gridSentinel);

  if(!('IntersectionObserver' in window)){
    renderNextGridChunk();
    return;
  }

  disconnectGridObserver();
  gridObserver = new IntersectionObserver((entries) => {
    if(entries.some((entry) => entry.isIntersecting)){
      renderNextGridChunk();
    }
  }, { rootMargin: '320px 0px' });

  gridObserver.observe(gridSentinel);
}

function renderEmptyGrid(){
  const empty = document.createElement('p');
  empty.className = 'empty-grid-message';
  empty.textContent = searchTerm ? 'No books match that search.' : 'No books to show.';
  grid.appendChild(empty);
}

function renderNextGridChunk(){
  if(!visibleBooks.length){
    return;
  }

  removeGridSentinel();
  const chunkSize = renderedGridCount === 0 ? INITIAL_GRID_ITEMS : GRID_CHUNK_SIZE;
  const nextBooks = visibleBooks.slice(renderedGridCount, renderedGridCount + chunkSize);
  const frag = document.createDocumentFragment();

  nextBooks.forEach((book) => {
    frag.appendChild(createThumbnail(book));
  });

  renderedGridCount += nextBooks.length;
  grid.appendChild(frag);
  appendGridSentinel();
}

function resetGrid(){
  disconnectGridObserver();
  removeGridSentinel();
  grid.innerHTML = '';
  grid.removeAttribute('aria-busy');
  visibleBooks = getVisibleBooks();
  renderedGridCount = 0;

  if(shelfCountEl){
    shelfCountEl.textContent = String(visibleBooks.length);
  }

  if(!visibleBooks.length){
    renderEmptyGrid();
    return;
  }

  renderNextGridChunk();
}

function applyBookToHero(book){
  setHeroContent({
    title: book.title,
    author: getDisplayText(book.author),
    released: getDisplayText(book.release_date),
    read: getDisplayText(book.date_read),
    note: getDisplayText(book.ai_comment),
    rating: clampRating(book.rating),
    book
  });
}

function showNoMatchState(){
  currentBook = null;
  selectedSlug = '';
  updateBookLinkState();
  setHeroContent({
    title: 'No matching books',
    author: '--',
    released: '--',
    read: '--',
    note: 'Try a different search term.',
    rating: 0
  });
  updateUrlState();
}

function showBook(book, animate = true){
  if(!book){
    return;
  }

  currentBook = book;
  selectedSlug = book.slug || slugifyTitle(book.title);
  updateBookLinkState();
  updateUrlState();

  const swap = () => {
    applyBookToHero(book);
  };

  if(!animate || !bookObjectEl || reducedMotion){
    swap();
    return;
  }

  if(swapTimer){
    window.clearTimeout(swapTimer);
  }
  bookObjectEl.classList.add('is-leaving');
  swapTimer = window.setTimeout(() => {
    swapTimer = null;
    swap();
  }, 150);
}

function syncCurrentBook(animate){
  const matches = getVisibleBooks();
  if(!matches.length){
    showNoMatchState();
    return;
  }

  const preferredBook = selectedSlug
    ? matches.find((book) => book.slug === selectedSlug)
    : null;

  if(preferredBook){
    if(currentBook !== preferredBook){
      showBook(preferredBook, animate);
    }else{
      updateBookLinkState();
      updateUrlState();
    }
    return;
  }

  if(currentBook && matches.includes(currentBook)){
    selectedSlug = currentBook.slug || slugifyTitle(currentBook.title);
    updateBookLinkState();
    updateUrlState();
    return;
  }

  showBook(matches[0], animate);
}

function clearSearch(){
  if(!searchTerm){
    return;
  }
  searchTerm = '';
  if(searchInput){
    searchInput.value = '';
  }
  resetGrid();
  syncCurrentBook(false);
}

function selectRelativeBook(delta){
  const matches = getVisibleBooks();
  if(!matches.length){
    return;
  }

  const currentIndex = currentBook ? matches.indexOf(currentBook) : -1;
  const baseIndex = currentIndex === -1 ? 0 : currentIndex;
  const nextIndex = Math.max(0, Math.min(matches.length - 1, baseIndex + delta));

  if(nextIndex === currentIndex){
    return;
  }

  showBook(matches[nextIndex], true);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleKeydown(event){
  if(!isLoaded){
    return;
  }

  const target = event.target;
  const isTextField = target instanceof HTMLElement && (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.isContentEditable
  );

  if(event.key === 'Escape' && searchTerm){
    event.preventDefault();
    clearSearch();
    if(document.activeElement === searchInput){
      searchInput.blur();
    }
    return;
  }

  if(isTextField){
    return;
  }

  if(event.key === 'Enter'){
    event.preventDefault();
    openBookDatabase(currentBook);
    return;
  }

  if(event.key === 'ArrowRight' || event.key === 'ArrowDown'){
    event.preventDefault();
    selectRelativeBook(1);
    return;
  }

  if(event.key === 'ArrowLeft' || event.key === 'ArrowUp'){
    event.preventDefault();
    selectRelativeBook(-1);
  }
}

async function loadBooks(){
  try{
    const response = await fetch(BOOKS_JSON_URL, { cache: 'no-cache' });
    if(!response.ok){
      throw new Error(`Books JSON request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const records = Array.isArray(payload?.books) ? payload.books : [];

    books = records.map((book) => ({
      ...book,
      slug: book.slug || slugifyTitle(book.title),
      search_index: book.search_index || normalizeText([
        book.title,
        book.author,
        book.genre,
        book.language,
        book.translated_from
      ].filter(Boolean).join(' '))
    }));

    books.sort((a, b) => {
      const dateA = a.date_read || '9999-12-31';
      const dateB = b.date_read || '9999-12-31';
      return new Date(dateB) - new Date(dateA);
    });

    resetGrid();
    syncCurrentBook(false);
  }catch(error){
    console.error('Failed to load books', error);
    showLoadError();
  }finally{
    isLoaded = true;
  }
}

function openBookDatabase(book){
  if(!book){
    return;
  }
  window.open(getBookUrl(book), '_blank', 'noopener');
}

toggle?.addEventListener('change', () => {
  filter = toggle.checked ? 'all' : 'reading';
  updateLabel();
  resetGrid();
  syncCurrentBook(false);
});

searchInput?.addEventListener('input', (event) => {
  searchTerm = event.target.value || '';
  resetGrid();
  syncCurrentBook(false);
});

bookDisplay?.addEventListener('click', () => {
  openBookDatabase(currentBook);
});

window.addEventListener('popstate', () => {
  applyUrlStateFromLocation();
  if(!isLoaded){
    return;
  }
  resetGrid();
  syncCurrentBook(false);
});

document.addEventListener('keydown', handleKeydown);

document.addEventListener('DOMContentLoaded', () => {
  applyUrlStateFromLocation();
  showLoadingState();
  loadBooks();
});
