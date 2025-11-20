const BRANCH = process.env.GITHUB_BRANCH || 'main';
const CSV_PATH = process.env.CSV_PATH || 'data/books.csv';
const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const TOKEN = process.env.GITHUB_TOKEN;

const HEADERS = {
  'User-Agent': 'netlify-comments-bot',
  Accept: 'application/vnd.github+json'
};

function parseCsv(text){
  const lines = text.trim().split(/\r?\n/);
  if(!lines.length){return {headers:[],rows:[]};}
  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).filter(Boolean).map(l=>{
    const cells = parseLine(l);
    const obj = {};
    headers.forEach((h,i)=>{obj[h]=cells[i] ?? '';});
    return obj;
  });
  return {headers,rows};
}

function parseLine(line){
  const cells=[];let cur='';let inQuotes=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(inQuotes){
      if(c==='"'){
        if(line[i+1]==='"'){cur+='"';i++;}else{inQuotes=false;}
      }else{cur+=c;}
    }else{
      if(c===','){cells.push(cur);cur='';}
      else if(c==='"'){inQuotes=true;}
      else{cur+=c;}
    }
  }
  cells.push(cur);
  return cells;
}

function toCsv(headers,rows){
  const escapeCell = (cell='')=>{
    const needsQuote = /[",\n]/.test(cell);
    let out = String(cell).replace(/"/g,'""');
    return needsQuote ? `"${out}"` : out;
  };
  const headerLine = headers.map(escapeCell).join(',');
  const rowLines = rows.map(r=>headers.map(h=>escapeCell(r[h] ?? '')).join(','));
  return [headerLine,...rowLines].join('\n') + '\n';
}

async function fetchCsv(){
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${CSV_PATH}?ref=${BRANCH}`;
  const res = await fetch(url,{headers:{...HEADERS,Authorization:`Bearer ${TOKEN}`}});
  if(!res.ok){throw new Error(`Failed to fetch CSV: ${res.status}`);}
  const body = await res.json();
  const csvText = Buffer.from(body.content,'base64').toString('utf8');
  return {csvText,sha:body.sha};
}

async function commitCsv(updatedCsv,sha,title){
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${CSV_PATH}`;
  const body = {
    message:`Update comment for ${title}`,
    content:Buffer.from(updatedCsv,'utf8').toString('base64'),
    sha,
    branch:BRANCH
  };
  const res = await fetch(url,{
    method:'PUT',
    headers:{...HEADERS,Authorization:`Bearer ${TOKEN}`},
    body:JSON.stringify(body)
  });
  if(!res.ok){throw new Error(`Failed to write CSV: ${res.status}`);}
  return res.json();
}

exports.handler = async(event)=>{
  if(event.httpMethod !== 'POST'){
    return {statusCode:405,body:JSON.stringify({error:'Method not allowed'})};
  }
  if(!TOKEN || !OWNER || !REPO){
    return {statusCode:500,body:JSON.stringify({error:'Missing GitHub config env vars.'})};
  }

  let payload={};
  try{payload = JSON.parse(event.body || '{}');}
  catch(err){return {statusCode:400,body:JSON.stringify({error:'Invalid JSON body.'})};}

  const title = (payload.title || '').trim();
  const author = (payload.author || '').trim();
  const comment = (payload.comment || '').replace(/\r?\n/g,' ').trim();
  if(!title){return {statusCode:400,body:JSON.stringify({error:'title is required.'})};}
  if(comment.length > 2000){
    return {statusCode:400,body:JSON.stringify({error:'comment too long (max 2000 chars).'} )};
  }

  try{
    const {csvText,sha} = await fetchCsv();
    const {headers,rows} = parseCsv(csvText);
    const idx = rows.findIndex(r=>{
      const titleMatch = (r.title || '').trim() === title;
      const authorMatch = author ? (r.author || '').trim() === author : true;
      return titleMatch && authorMatch;
    });

    if(idx === -1){
      return {statusCode:404,body:JSON.stringify({error:'Book not found in CSV.'})};
    }

    rows[idx].comment = comment;
    const updatedCsv = toCsv(headers,rows);
    await commitCsv(updatedCsv,sha,title);

    return {statusCode:200,body:JSON.stringify({ok:true,comment})};
  }catch(err){
    return {statusCode:500,body:JSON.stringify({error:err.message || 'Failed to update comment.'})};
  }
};
