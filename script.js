const BOOKS_URL = 'data/books.json';

const hero = document.querySelector('.hero');
const heroKindle = document.getElementById('heroKindle');
const kindleInner = heroKindle.querySelector('.kindle-inner');
const flipHint = document.getElementById('flipHint');
const bookTitle = document.getElementById('bookTitle');
const bookAuthor = document.getElementById('bookAuthor');
const bookStatus = document.getElementById('bookStatus');
const bookReleased = document.getElementById('bookReleased');
const bookRead = document.getElementById('bookRead');
const bookRating = document.getElementById('bookRating');
const bookNote = document.getElementById('bookNote');
const screenProgress = document.getElementById('screenProgress');
const kindleBack = document.getElementById('kindleBack');
const libraryGrid = document.getElementById('libraryGrid');
const libraryCount = document.getElementById('libraryCount');
const filterButtons = [...document.querySelectorAll('.filter-button')];

let books = [];
let currentBook = null;
let wrapRequestId = 0;
let libraryView = 'read';
let isFlipping = false;
let libraryWrapObserver = null;
const wrapPaletteCache = new Map();
const libraryWrapData = new WeakMap();

function textOr(value, fallback = '—'){
  const text = String(value ?? '').trim();
  return text || fallback;
}

function hashText(value = ''){
  let hash = 0;
  for(let index = 0; index < value.length; index += 1){
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function formatStatus(status){
  return status === 'reading' ? 'Currently reading' : 'Finished';
}

function formatDate(value){
  const raw = String(value ?? '').trim();
  if(!raw){
    return '—';
  }
  if(/^\d{4}$/.test(raw)){
    return raw;
  }
  const date = new Date(`${raw}T12:00:00`);
  if(Number.isNaN(date.getTime())){
    return raw;
  }
  return new Intl.DateTimeFormat('en', {
    day:'numeric',
    month:'short',
    year:'numeric'
  }).format(date);
}

function formatRating(value){
  const rating = Math.max(0, Math.min(5, Number.parseInt(value, 10) || 0));
  return rating ? `${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}` : 'Not rated';
}

function wrapUrl(book){
  return `assets/kindle-wraps/${book.slug}.jpg`;
}

function setFlipped(flipped){
  isFlipping = false;
  heroKindle.classList.remove('is-turning-to-back', 'is-turning-to-front');
  heroKindle.classList.toggle('is-flipped', flipped);
  heroKindle.setAttribute('aria-pressed', String(flipped));
  heroKindle.setAttribute(
    'aria-label',
    flipped ? 'Flip the reader back to the book details' : 'Flip the reader to reveal the artwork back'
  );
  flipHint.textContent = flipped
    ? 'Press the reader to return to the details'
    : 'Press the reader to see the artwork back';
}

function flipReader(){
  if(isFlipping){
    return;
  }
  const flipped = !heroKindle.classList.contains('is-flipped');
  isFlipping = true;
  heroKindle.classList.toggle('is-flipped', flipped);
  heroKindle.classList.add(flipped ? 'is-turning-to-back' : 'is-turning-to-front');
  heroKindle.setAttribute('aria-pressed', String(flipped));
  heroKindle.setAttribute(
    'aria-label',
    flipped ? 'Flip the reader back to the book details' : 'Flip the reader to reveal the artwork back'
  );
  flipHint.textContent = flipped
    ? 'Press the reader to return to the details'
    : 'Press the reader to see the artwork back';
}

function median(values){
  values.sort((first, second) => first - second);
  return values[Math.floor(values.length / 2)];
}

function sampleWrapPalette(image){
  const width = 18;
  const height = 27;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently:true });
  if(!context){
    return null;
  }
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const channels = [[],[],[]];
  for(let y = 0; y < height; y += 1){
    for(let x = 0; x < width; x += 1){
      if(x > 2 && x < width - 3 && y > 2 && y < height - 3){
        continue;
      }
      const index = (y * width + x) * 4;
      channels[0].push(pixels[index]);
      channels[1].push(pixels[index + 1]);
      channels[2].push(pixels[index + 2]);
    }
  }
  const color = channels.map(median);
  const edge = color.map((channel) => Math.round(channel * .48));
  const glow = color.map((channel) => Math.round(channel * .72 + 255 * .28));
  const luminance = color[0] * .2126 + color[1] * .7152 + color[2] * .0722;
  return {
    color:`rgb(${color.join(',')})`,
    edge:`rgb(${edge.join(',')})`,
    glowRgb:glow.join(','),
    ink:luminance > 146 ? '#11110f' : '#f4f1e7'
  };
}

function requestWrapPalette(book, imageUrl, callback){
  const cached = wrapPaletteCache.get(book.slug);
  if(cached){
    callback(cached);
    return;
  }
  const image = new Image();
  image.decoding = 'async';
  image.onload = () => {
    try{
      const palette = sampleWrapPalette(image);
      if(palette){
        wrapPaletteCache.set(book.slug, palette);
        callback(palette);
      }
    }catch(error){
      console.error(error);
    }
  };
  image.src = imageUrl;
}

function loadLibraryWrap(device){
  const data = libraryWrapData.get(device);
  if(!data || data.loaded){
    return;
  }
  data.loaded = true;
  device.style.setProperty('--wrap-image', `url("${data.imageUrl}")`);
  requestWrapPalette(data.book, data.imageUrl, (palette) => {
    data.title.style.setProperty('--imprint-color', palette.ink);
    device.parentElement?.style.setProperty('--device-edge', palette.edge);
  });
  libraryWrapObserver?.unobserve(device);
}

function resetLibraryWrapObserver(){
  libraryWrapObserver?.disconnect();
  libraryWrapObserver = null;
  if(!('IntersectionObserver' in window)){
    return;
  }
  libraryWrapObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if(entry.isIntersecting){
        loadLibraryWrap(entry.target);
      }
    });
  }, { rootMargin:'520px 0px', threshold:.01 });
}

function queueLibraryWrap(device, book, title){
  libraryWrapData.set(device, {
    book,
    title,
    imageUrl:wrapUrl(book),
    loaded:false
  });
  if(libraryWrapObserver){
    libraryWrapObserver.observe(device);
  }else{
    loadLibraryWrap(device);
  }
}

function applyWrapPalette(book, imageUrl, requestId){
  requestWrapPalette(book, imageUrl, (palette) => {
    if(requestId !== wrapRequestId){
      return;
    }
    heroKindle.style.setProperty('--wrap-color', palette.color);
    heroKindle.style.setProperty('--wrap-edge', palette.edge);
    document.documentElement.style.setProperty('--active-glow-rgb', palette.glowRgb);
  });
}

function renderWrap(book){
  const requestId = ++wrapRequestId;
  const imageUrl = wrapUrl(book);
  heroKindle.classList.add('has-custom-wrap');
  kindleBack.classList.add('has-custom-wrap');
  kindleBack.style.setProperty('--wrap-image', `url("${imageUrl}")`);
  heroKindle.style.setProperty('--wrap-color', '#9a927d');
  heroKindle.style.setProperty('--wrap-edge', '#49453b');
  applyWrapPalette(book, imageUrl, requestId);
}

function updateUrl(book){
  const url = new URL(window.location.href);
  url.search = '';
  if(book.slug){
    url.searchParams.set('book', book.slug);
  }
  url.searchParams.set('view', libraryView);
  window.history.replaceState({}, '', url);
}

function updateFilterControls(){
  filterButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.view === libraryView));
  });
}

function setLibraryView(view, shouldUpdateUrl = true){
  if(view !== 'reading' && view !== 'read'){
    return;
  }
  libraryView = view;
  updateFilterControls();
  if(books.length){
    renderLibrary();
  }
  if(shouldUpdateUrl && currentBook){
    updateUrl(currentBook);
  }
}

function renderLibrary(){
  const otherBooks = books.filter((book) => book !== currentBook && book.status === libraryView);
  const viewLabel = libraryView === 'reading' ? 'currently reading' : 'already read';
  libraryGrid.innerHTML = '';
  libraryCount.textContent = `${otherBooks.length} ${viewLabel}`;
  resetLibraryWrapObserver();

  if(!otherBooks.length){
    const emptyLabel = libraryView === 'reading'
      ? 'No other currently-reading books.'
      : 'No other already-read books.';
    libraryGrid.innerHTML = `<p class="library-error">${emptyLabel}</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  otherBooks.forEach((book) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'library-card';
    card.setAttribute('aria-label', `Show ${textOr(book.title)} by ${textOr(book.author)}`);

    const tilt = ((hashText(`${book.slug}|${book.title}`) % 7) - 3) * .32;
    card.style.setProperty('--device-tilt', `${tilt}deg`);

    const device = document.createElement('span');
    device.className = 'library-device';

    device.classList.add('has-custom-wrap');

    const title = document.createElement('span');
    title.className = 'library-device-title';
    title.setAttribute('aria-hidden', 'true');
    title.textContent = textOr(book.title);
    queueLibraryWrap(device, book, title);

    device.appendChild(title);
    card.appendChild(device);
    card.addEventListener('click', () => {
      selectBook(book, true);
      hero.scrollIntoView({ behavior:'smooth', block:'start' });
    });
    fragment.appendChild(card);
  });

  libraryGrid.appendChild(fragment);
}

function selectBook(book, shouldUpdateUrl = false){
  currentBook = book;
  const index = books.indexOf(book);

  bookTitle.textContent = textOr(book.title);
  bookAuthor.textContent = textOr(book.author);
  bookStatus.textContent = formatStatus(book.status);
  bookReleased.textContent = formatDate(book.release_date);
  bookRead.textContent = formatDate(book.date_read);
  bookRating.textContent = formatRating(book.rating);
  bookNote.textContent = textOr(book.ai_comment, 'No reading note yet.');
  screenProgress.textContent = `${index + 1} / ${books.length}`;
  kindleBack.setAttribute('aria-label', `Artwork for ${textOr(book.title)} by ${textOr(book.author)} printed on the reader back`);

  setFlipped(false);
  renderWrap(book);
  renderLibrary();

  if(shouldUpdateUrl){
    updateUrl(book);
  }
}

function showLoadError(){
  bookStatus.textContent = 'Library unavailable';
  bookTitle.textContent = 'Could not open the shelf';
  bookAuthor.textContent = '—';
  bookReleased.textContent = '—';
  bookRead.textContent = '—';
  bookRating.textContent = '—';
  bookNote.textContent = 'The book database could not be loaded. Refresh the page and try again.';
  screenProgress.textContent = 'OFFLINE';
  kindleBack.setAttribute('aria-label', 'Library unavailable');
  libraryCount.textContent = '0 books';
  libraryGrid.innerHTML = '<p class="library-error">The library could not be opened.</p>';
}

async function loadBooks(){
  libraryGrid.innerHTML = '<p class="library-loading">Opening the library…</p>';
  try{
    const response = await fetch(BOOKS_URL, { cache:'no-store' });
    if(!response.ok){
      throw new Error(`Book data returned ${response.status}`);
    }
    const payload = await response.json();
    books = Array.isArray(payload) ? payload : payload.books;
    if(!Array.isArray(books) || !books.length){
      throw new Error('No books were found');
    }

    const requestedSlug = new URLSearchParams(window.location.search).get('book');
    const requestedView = new URLSearchParams(window.location.search).get('view');
    const requestedBook = requestedSlug
      ? books.find((book) => book.slug === requestedSlug)
      : null;
    const firstReadingBook = books.find((book) => book.status === 'reading');
    const initialBook = requestedBook || firstReadingBook || books[0];
    libraryView = requestedView === 'reading' || requestedView === 'read'
      ? requestedView
      : initialBook.status === 'reading' ? 'reading' : 'read';
    updateFilterControls();
    selectBook(initialBook);
  }catch(error){
    console.error(error);
    showLoadError();
  }
}

heroKindle.addEventListener('click', flipReader);

heroKindle.addEventListener('keydown', (event) => {
  if(event.key !== 'Enter' && event.key !== ' '){
    return;
  }
  event.preventDefault();
  flipReader();
});

kindleInner.addEventListener('animationend', (event) => {
  if(event.target !== kindleInner || !event.animationName.startsWith('kindle-turn-')){
    return;
  }
  isFlipping = false;
  heroKindle.classList.remove('is-turning-to-back', 'is-turning-to-front');
});

filterButtons.forEach((button) => {
  button.addEventListener('click', () => setLibraryView(button.dataset.view));
});

loadBooks();
