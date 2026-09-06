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
const coverFallback = document.getElementById('coverFallback');
const backTitle = document.getElementById('backTitle');
const backAuthor = document.getElementById('backAuthor');
const libraryGrid = document.getElementById('libraryGrid');
const libraryCount = document.getElementById('libraryCount');

let books = [];
let currentBook = null;
let coverRequestId = 0;

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
    flipped ? 'Flip the reader back to the book details' : 'Flip the reader to reveal the engraved cover'
  );
  flipHint.textContent = flipped
    ? 'Press the reader to return to the details'
    : 'Press the reader to see the engraved cover';
}

function renderEngraving(book){
  const requestId = ++coverRequestId;
  const url = coverUrl(book);
  const fallbackLetter = textOr(book.title, '?').charAt(0).toUpperCase();

  heroCover.classList.add('is-hidden');
  coverFallback.classList.remove('is-hidden');
  coverFallback.textContent = fallbackLetter;
  heroCover.removeAttribute('src');

  if(!url){
    return;
  }

  heroCover.onload = () => {
    if(requestId !== coverRequestId){
      return;
    }
    heroCover.classList.remove('is-hidden');
    coverFallback.classList.add('is-hidden');
  };
  heroCover.onerror = () => {
    if(requestId !== coverRequestId){
      return;
    }
    heroCover.classList.add('is-hidden');
    coverFallback.classList.remove('is-hidden');
  };
  heroCover.src = url;
}

function updateUrl(book){
  const url = new URL(window.location.href);
  url.search = '';
  if(book.slug){
    url.searchParams.set('book', book.slug);
  }
  window.history.replaceState({}, '', url);
}

function renderLibrary(){
  const otherBooks = books.filter((book) => book !== currentBook);
  libraryGrid.innerHTML = '';
  libraryCount.textContent = `${otherBooks.length} other ${otherBooks.length === 1 ? 'book' : 'books'}`;

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
  backTitle.textContent = textOr(book.title);
  backAuthor.textContent = textOr(book.author);

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
  backTitle.textContent = 'Library unavailable';
  backAuthor.textContent = '—';
  coverFallback.textContent = '!';
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
    const requestedBook = requestedSlug
      ? books.find((book) => book.slug === requestedSlug)
      : null;
    const firstReadingBook = books.find((book) => book.status === 'reading');
    selectBook(requestedBook || firstReadingBook || books[0]);
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

loadBooks();
