const toggle  = document.getElementById('filterToggle');
const label   = document.getElementById('filterLabel');
const grid    = document.getElementById('grid');
const starsEl = document.getElementById('stars');
let books     = [];
let filter    = 'reading';
let currentBook = null;
const FALLBACK_COVER = 'book.png';

function setImageWithFallback(img, src){
  img.onerror = ()=>{img.onerror=null;img.src=FALLBACK_COVER;};
  img.src = src;
}

function loadBooks(){
  const csvUrl = `data/books.csv?ts=${Date.now()}`;
  Papa.parse(csvUrl, {
    download: true, header: true, skipEmptyLines: true,
    complete: (res) => {
      books = res.data;

      // sort first (newest read first; "reading" with empty date stay on top)
      books.sort((a,b)=>{
        const da = a.date_read || '9999-12-31';
        const db = b.date_read || '9999-12-31';
        return new Date(db) - new Date(da);
      });

      renderGrid();

      const first = books.find(b => b.status === 'reading') || books[0];
      first && showBook(first, false);
    }
  });
}

function renderGrid(){
  grid.innerHTML = '';
  const frag = document.createDocumentFragment();

  books
    .filter(b => filter === 'all' || b.status === 'reading')
    .forEach(b => {
      const img = document.createElement('img');
      setImageWithFallback(img, `assets/${b.cover_image}`);
      img.alt = b.title;
      img.className = 'thumbnail';

      // Speed wins: lazy load and async decode, low fetch priority
      img.loading = 'lazy';
      img.decoding = 'async';
      img.setAttribute('fetchpriority', 'low');

      img.addEventListener('click', () => {
        showBook(b, true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });

      frag.appendChild(img);
    });

  grid.appendChild(frag);
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

function showBook(b,animate=true){
  currentBook = b;
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
  renderGrid();
  updateLabel();
});

document.addEventListener('DOMContentLoaded',()=>{loadBooks();updateLabel();});
