const BOOKS_URL = 'data/books.json';

const hero = document.querySelector('.hero');
const heroKindle = document.getElementById('heroKindle');
const flipHint = document.getElementById('flipHint');
const bookTitle = document.getElementById('bookTitle');
const bookAuthor = document.getElementById('bookAuthor');
const bookStatus = document.getElementById('bookStatus');
const bookReleased = document.getElementById('bookReleased');
const bookRead = document.getElementById('bookRead');
const bookRating = document.getElementById('bookRating');
const bookNote = document.getElementById('bookNote');
const screenProgress = document.getElementById('screenProgress');
const heroCover = document.getElementById('heroCover');
const engravedCover = document.getElementById('engravedCover');
const kindleBack = document.getElementById('kindleBack');
const libraryGrid = document.getElementById('libraryGrid');
const libraryCount = document.getElementById('libraryCount');
const filterButtons = [...document.querySelectorAll('.filter-button')];

let books = [];
let currentBook = null;
let coverRequestId = 0;
let libraryView = 'read';

const CUSTOM_WRAPS = {
  butter: {
    image:'assets/butter-kindle-wrap-v1.png',
    color:'#f2b91d',
    edge:'#9d6b08'
  }
};

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

function coverUrl(book){
  const coverId = String(book?.cover_id ?? '').trim();
  return /^\d+$/.test(coverId)
    ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg?default=false`
    : '';
}

function setFlipped(flipped){
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

function renderDitheredEngraving(image){
  const width = 280;
  const height = 400;
  engravedCover.width = width;
  engravedCover.height = height;
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = width;
  sourceCanvas.height = height;
  const sourceContext = sourceCanvas.getContext('2d', { willReadFrequently:true });
  const outputContext = engravedCover.getContext('2d');
  if(!sourceContext || !outputContext){
    throw new Error('Canvas is unavailable');
  }

  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  const sourceX = (image.naturalWidth - cropWidth) / 2;
  const sourceY = (image.naturalHeight - cropHeight) / 2;
  sourceContext.drawImage(image, sourceX, sourceY, cropWidth, cropHeight, 0, 0, width, height);

  const source = sourceContext.getImageData(0, 0, width, height);
  const output = outputContext.createImageData(width, height);
  const luminance = new Float32Array(width * height);
  const bayer = [
    0,8,2,10,
    12,4,14,6,
    3,11,1,9,
    15,7,13,5
  ];
  const palette = [0,44,86,132];

  for(let pixel = 0; pixel < luminance.length; pixel += 1){
    const sourceIndex = pixel * 4;
    luminance[pixel] = source.data[sourceIndex] * .2126
      + source.data[sourceIndex + 1] * .7152
      + source.data[sourceIndex + 2] * .0722;
  }

  for(let y = 0; y < height; y += 1){
    for(let x = 0; x < width; x += 1){
      const pixel = y * width + x;
      const center = luminance[pixel];
      const left = luminance[y * width + Math.max(0, x - 1)];
      const right = luminance[y * width + Math.min(width - 1, x + 1)];
      const up = luminance[Math.max(0, y - 1) * width + x];
      const down = luminance[Math.min(height - 1, y + 1) * width + x];
      const edge = Math.min(255, Math.abs(right - left) + Math.abs(down - up));
      const threshold = (bayer[(y % 4) * 4 + (x % 4)] - 7.5) * 4.5;
      const etchedTone = Math.max(0, Math.min(255, center * .62 + edge * .95 + threshold));
      const level = Math.max(0, Math.min(3, Math.round(etchedTone / 255 * 3)));
      const value = palette[level];
      const outputIndex = pixel * 4;
      output.data[outputIndex] = value;
      output.data[outputIndex + 1] = value;
      output.data[outputIndex + 2] = value;
      output.data[outputIndex + 3] = level === 0 ? 150 : 225;
    }
  }

  outputContext.putImageData(output, 0, 0);
}

function renderEngraving(book){
  const requestId = ++coverRequestId;
  const url = coverUrl(book);
  const customWrap = CUSTOM_WRAPS[book.slug];

  heroKindle.classList.toggle('has-custom-wrap', Boolean(customWrap));
  kindleBack.classList.toggle('has-custom-wrap', Boolean(customWrap));
  kindleBack.style.removeProperty('--wrap-image');
  heroKindle.style.removeProperty('--wrap-color');
  heroKindle.style.removeProperty('--wrap-edge');
  engravedCover.classList.remove('is-ready');
  heroCover.removeAttribute('src');

  if(customWrap){
    kindleBack.style.setProperty('--wrap-image', `url("${customWrap.image}")`);
    heroKindle.style.setProperty('--wrap-color', customWrap.color);
    heroKindle.style.setProperty('--wrap-edge', customWrap.edge);
    return;
  }

  if(!url){
    return;
  }

  heroCover.onload = () => {
    if(requestId !== coverRequestId){
      return;
    }
    try{
      renderDitheredEngraving(heroCover);
      engravedCover.classList.add('is-ready');
    }catch(error){
      console.error(error);
      engravedCover.classList.remove('is-ready');
    }
  };
  heroCover.onerror = () => {
    if(requestId !== coverRequestId){
      return;
    }
    engravedCover.classList.remove('is-ready');
  };
  heroCover.crossOrigin = 'anonymous';
  heroCover.src = url;
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

    const customWrap = CUSTOM_WRAPS[book.slug];
    if(customWrap){
      device.classList.add('has-custom-wrap');
      device.style.setProperty('--wrap-image', `url("${customWrap.image}")`);
      device.style.setProperty('--wrap-color', customWrap.color);
      device.style.setProperty('--wrap-edge', customWrap.edge);
    }else{
      const status = document.createElement('span');
      status.className = 'device-status';
      status.textContent = formatStatus(book.status);

      const title = document.createElement('span');
      title.className = 'device-title';
      title.textContent = textOr(book.title);

      const author = document.createElement('span');
      author.className = 'device-author';
      author.textContent = textOr(book.author);

      device.append(status, title, author);
    }

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
  renderEngraving(book);
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

heroKindle.addEventListener('click', () => {
  setFlipped(!heroKindle.classList.contains('is-flipped'));
});

heroKindle.addEventListener('keydown', (event) => {
  if(event.key !== 'Enter' && event.key !== ' '){
    return;
  }
  event.preventDefault();
  setFlipped(!heroKindle.classList.contains('is-flipped'));
});

filterButtons.forEach((button) => {
  button.addEventListener('click', () => setLibraryView(button.dataset.view));
});

loadBooks();
