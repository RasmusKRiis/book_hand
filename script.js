const toggle  = document.getElementById('filterToggle');
const label   = document.getElementById('filterLabel');
const searchInput = document.getElementById('searchInput');
const grid    = document.getElementById('grid');
const starsEl = document.getElementById('stars');
const bookDisplay = document.getElementById('bookLink');
let books     = [];
let filter    = 'reading';
let searchTerm = '';
let currentBook = null;
let visibleBooks = [];
let renderedGridCount = 0;
let gridSentinel = null;
let gridObserver = null;
const FALLBACK_COVER = 'book.png';
const OPEN_LIBRARY_SEARCH_URL = 'https://openlibrary.org/search.json';
const bookUrlCache = new Map();
const INITIAL_GRID_ITEMS = 10;
const GRID_CHUNK_SIZE = 10;

function setImageWithFallback(img, src){
  img.onerror = ()=>{img.onerror=null;img.src=FALLBACK_COVER;};
  img.src = src;
}

function loadBooks(){
  Papa.parse('data/books.csv', {
    download: true, header: true, skipEmptyLines: true,
    complete: (res) => {
      books = res.data.map(book => ({
        ...book,
        _searchIndex: normalizeText([book.title, book.author].join(' '))
      }));

      // sort first (newest read first; "reading" with empty date stay on top)
      books.sort((a,b)=>{
        const da = a.date_read || '9999-12-31';
        const db = b.date_read || '9999-12-31';
        return new Date(db) - new Date(da);
      });

      syncCurrentBook(false);
      resetGrid();
    }
  });
}

function normalizeText(value=''){
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,' ')
    .trim();
}

function getVisibleBooks(){
  const query = normalizeText(searchTerm);
  return books.filter(b => {
    if(filter !== 'all' && b.status !== 'reading'){
      return false;
    }
    if(!query){
      return true;
    }
    return b._searchIndex.includes(query);
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
    if(entries.some(entry => entry.isIntersecting)){
      renderNextGridChunk();
    }
  }, {rootMargin:'300px 0px'});
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
  const nextChunkSize = renderedGridCount === 0 ? INITIAL_GRID_ITEMS : GRID_CHUNK_SIZE;
  const nextBooks = visibleBooks.slice(renderedGridCount, renderedGridCount + nextChunkSize);
  const frag = document.createDocumentFragment();

  nextBooks.forEach(book => {
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
  visibleBooks = getVisibleBooks();
  renderedGridCount = 0;

  if(!visibleBooks.length){
    renderEmptyGrid();
    return;
  }

  renderNextGridChunk();
}

function updateLabel(){
  label.textContent = filter==='all' ? 'Read' : 'Currently Reading';
}

function clampRating(val){
  const n = Number(val);
  if(!Number.isFinite(n)){return 0;}
  return Math.max(0, Math.min(5, Math.round(n)));
}

function renderStars(rating){
  if(!starsEl){return;}
  starsEl.innerHTML = '';
  const frag = document.createDocumentFragment();
  for(let i=0;i<5;i++){
    const span = document.createElement('span');
    span.className = 'pixel-star' + (i < rating ? '' : ' off');
    span.setAttribute('aria-hidden','true');
    frag.appendChild(span);
  }
  starsEl.appendChild(frag);
}

function getDisplayText(value){
  const text = value?.trim();
  if(text && text !== '--'){
    return text;
  }
  return '--';
}

function updateBookLinkState(){
  if(!bookDisplay){return;}
  bookDisplay.disabled = !currentBook;
  const label = currentBook?.title
    ? `Open ${currentBook.title} in Open Library`
    : 'Open current book in Open Library';
  bookDisplay.setAttribute('aria-label', label);
  bookDisplay.title = label;
}

function syncCurrentBook(animate){
  const visibleBooks = getVisibleBooks();
  if(!visibleBooks.length){
    currentBook = null;
    const cover = document.getElementById('cover');
    if(cover){
      setImageWithFallback(cover, FALLBACK_COVER);
    }
    document.getElementById('title').textContent = 'No matching books';
    document.getElementById('author').textContent = '--';
    document.getElementById('released').textContent = '--';
    document.getElementById('read').textContent = '--';
    const aiCommentEl = document.getElementById('aiComment');
    if(aiCommentEl){
      aiCommentEl.textContent = 'Try a different search term.';
    }
    renderStars(0);
    updateBookLinkState();
    return;
  }

  if(currentBook && visibleBooks.includes(currentBook)){
    updateBookLinkState();
    return;
  }

  showBook(visibleBooks[0], animate);
}

function getBookCacheKey(book){
  return [book.title, book.author, book.release_date].map(normalizeText).join('|');
}

function buildFallbackBookUrl(book){
  const params = new URLSearchParams();
  if(book.title){params.set('title', book.title);}
  if(book.author){params.set('author', book.author);}
  return `https://openlibrary.org/search?${params.toString()}`;
}

function scoreBookMatch(book, candidate){
  const wantedTitle = normalizeText(book.title);
  const wantedAuthor = normalizeText(book.author);
  const candidateTitle = normalizeText(candidate.title);
  const candidateAuthors = (candidate.author_name || []).map(name => normalizeText(name));
  const wantedYear = Number.parseInt(book.release_date,10);

  let score = 0;

  if(candidateTitle === wantedTitle){
    score += 120;
  }else if(candidateTitle.includes(wantedTitle) || wantedTitle.includes(candidateTitle)){
    score += 80;
  }

  if(wantedAuthor){
    if(candidateAuthors.includes(wantedAuthor)){
      score += 60;
    }else if(candidateAuthors.some(name => name.includes(wantedAuthor) || wantedAuthor.includes(name))){
      score += 35;
    }
  }

  if(Number.isFinite(wantedYear) && candidate.first_publish_year === wantedYear){
    score += 20;
  }

  return score;
}

async function resolveBookUrl(book){
  const cacheKey = getBookCacheKey(book);
  if(bookUrlCache.has(cacheKey)){
    return bookUrlCache.get(cacheKey);
  }

  const params = new URLSearchParams({
    title: book.title || '',
    limit: '5',
    fields: 'key,title,author_name,first_publish_year'
  });
  if(book.author){
    params.set('author', book.author);
  }

  const response = await fetch(`${OPEN_LIBRARY_SEARCH_URL}?${params.toString()}`);
  if(!response.ok){
    throw new Error(`Open Library lookup failed with status ${response.status}`);
  }

  const payload = await response.json();
  const candidates = Array.isArray(payload.docs) ? payload.docs : [];
  const bestMatch = candidates
    .map(candidate => ({candidate, score: scoreBookMatch(book, candidate)}))
    .sort((a,b) => b.score - a.score)[0];

  const resolvedUrl = bestMatch?.score >= 80 && bestMatch.candidate?.key
    ? `https://openlibrary.org${bestMatch.candidate.key}`
    : buildFallbackBookUrl(book);

  bookUrlCache.set(cacheKey, resolvedUrl);
  return resolvedUrl;
}

async function openBookDatabase(book){
  if(!book){return;}

  const popup = window.open('about:blank', '_blank');
  const fallbackUrl = buildFallbackBookUrl(book);

  if(popup){
    popup.opener = null;
    popup.document.title = 'Opening book page...';
    popup.document.body.style.fontFamily = '"Jersey 15", cursive';
    popup.document.body.style.background = '#F5E9D7';
    popup.document.body.style.color = '#2E2E2E';
    popup.document.body.style.padding = '2rem';
    popup.document.body.textContent = 'Looking up the book in Open Library...';
  }

  try{
    const resolvedUrl = await resolveBookUrl(book);
    if(popup){
      popup.location.replace(resolvedUrl);
    }else{
      window.open(resolvedUrl, '_blank', 'noopener');
    }
  }catch(err){
    console.error(err);
    if(popup){
      popup.location.replace(fallbackUrl);
    }else{
      window.open(fallbackUrl, '_blank', 'noopener');
    }
  }
}

function showBook(b,animate=true){
  currentBook = b;
  updateBookLinkState();
  const display=document.querySelector('.book-display');
  const hand   =display.querySelector('.hand');
  const cover  =display.querySelector('#cover');

  const swap=()=>{
    setImageWithFallback(cover, `assets/${b.cover_image}`);
    document.getElementById('title').textContent   = b.title;
    document.getElementById('author').textContent  = getDisplayText(b.author);
    document.getElementById('released').textContent= getDisplayText(b.release_date);
    document.getElementById('read').textContent    = getDisplayText(b.date_read);
    const aiCommentEl = document.getElementById('aiComment');
    if(aiCommentEl){
      aiCommentEl.textContent = getDisplayText(b.ai_comment);
    }
    const rating = clampRating(b.rating);
    renderStars(rating);
  };

  if(!animate){swap();return;}

  gsap.timeline()
    .to([cover,hand],{y:60,opacity:0,duration:.25,ease:'power1.in'})
    .add(swap)
    .fromTo([cover,hand],{y:-60,opacity:0},{y:0,opacity:1,duration:.25,ease:'power1.out'});
}

toggle.addEventListener('change',()=>{
  filter = toggle.checked ? 'all' : 'reading';
  syncCurrentBook(false);
  resetGrid();
  updateLabel();
});

searchInput?.addEventListener('input',(event)=>{
  searchTerm = event.target.value || '';
  syncCurrentBook(false);
  resetGrid();
});

bookDisplay?.addEventListener('click',()=>{openBookDatabase(currentBook);});

document.addEventListener('DOMContentLoaded',()=>{loadBooks();updateLabel();});
