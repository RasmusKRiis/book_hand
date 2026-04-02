const toggle = document.getElementById('filterToggle');
const label = document.getElementById('filterLabel');
const searchInput = document.getElementById('searchInput');
const grid = document.getElementById('grid');
const starsEl = document.getElementById('stars');
const bookDisplay = document.getElementById('bookLink');
const coverEl = document.getElementById('cover');
const titleEl = document.getElementById('title');
const authorEl = document.getElementById('author');
const releasedEl = document.getElementById('released');
const readEl = document.getElementById('read');
const aiCommentEl = document.getElementById('aiComment');

const BOOKS_JSON_URL = 'data/books.json';
const FALLBACK_COVER = 'book.png';
const INITIAL_GRID_ITEMS = 10;
const GRID_CHUNK_SIZE = 10;

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

function setImageWithFallback(img, src){
  img.onerror = () => {
    img.onerror = null;
    img.src = FALLBACK_COVER;
  };
  img.src = src;
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

function setHeroContent({ title, author, released, read, note, rating, coverImage }){
  setImageWithFallback(coverEl, coverImage || FALLBACK_COVER);
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
    frag.appendChild(placeholder);
  }

  grid.appendChild(frag);
}

function showLoadingState(){
  currentBook = null;
  selectedSlug = '';
  updateBookLinkState();
  setHeroContent({
    title: 'Loading shelf...',
    author: 'Fetching books',
    released: '--',
    read: '--',
    note: 'Preparing the next stack of covers.',
    rating: 0,
    coverImage: FALLBACK_COVER
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
    rating: 0,
    coverImage: FALLBACK_COVER
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
  const img = document.createElement('img');
  setImageWithFallback(img, `assets/${book.cover_image}`);
  img.alt = book.title;
  img.className = 'thumbnail';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.setAttribute('fetchpriority', 'low');
  img.addEventListener('click', () => {
    showBook(book, true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  return img;
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
    coverImage: `assets/${book.cover_image}`
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
    rating: 0,
    coverImage: FALLBACK_COVER
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

  const hand = bookDisplay?.querySelector('.hand');
  const cover = bookDisplay?.querySelector('#cover');

  const swap = () => {
    applyBookToHero(book);
  };

  if(!animate || !hand || !cover){
    swap();
    return;
  }

  gsap.timeline()
    .to([cover, hand], { y: 60, opacity: 0, duration: 0.25, ease: 'power1.in' })
    .add(swap)
    .fromTo([cover, hand], { y: -60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: 'power1.out' });
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
    const response = await fetch(BOOKS_JSON_URL, { cache: 'force-cache' });
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
