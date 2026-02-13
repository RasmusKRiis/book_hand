const chartSelect = document.getElementById('chartSelect');
const ctx = document.getElementById('chartCanvas').getContext('2d');
const chartArea = document.getElementById('chartArea');
let books = [];
let chart;
let geoIndex = {byName:new Map(), byCode:new Map()};

const palette = {
  yellow:'#F0D572',
  green:'#9FB8A6',
  pink:'#E4A1A1',
  blue:'#8AB6D6',
  olive:'#B5A481'
};

function parseDate(val){
  if(!val){return null;}
  const normalized = /^\d{4}$/.test(val) ? `${val}-01-01` : val;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

function normalizeName(str=''){
  return str.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}

function buildGeoIndex(rows){
  const byName = new Map();
  const byCode = new Map();
  rows.forEach(r=>{
    const name = normalizeName(r.name);
    const code = (r.country || '').toLowerCase();
    const lat = Number(r.latitude);
    const lon = Number(r.longitude);
    if(Number.isFinite(lat) && Number.isFinite(lon)){
      if(name){byName.set(name,{lat,lon});}
      if(code){byCode.set(code,{lat,lon});}
    }
  });
  return {byName,byCode};
}

const countryAlias = {
  'usa':'united states',
  'us':'united states',
  'united states':'united states',
  'uk':'united kingdom',
  'united kingdom':'united kingdom',
  'england':'united kingdom',
  'hong kong':'hong kong',
  'south korea':'south korea',
  'korea':'south korea',
  'korea south':'south korea',
  'china':'china',
  'japan':'japan',
  'australia':'australia'
};

function lookupCoords(countryStr){
  if(!countryStr){return null;}
  const normRaw = normalizeName(countryStr);
  const norm = countryAlias[normRaw] || normRaw;
  const codeMatch = geoIndex.byCode.get(norm.toLowerCase());
  if(codeMatch){return codeMatch;}
  const byName = geoIndex.byName.get(norm);
  if(byName){return byName;}
  return null;
}

function destroyChart(){
  if(chart){chart.destroy();chart=null;}
}

function loadCsv(path){
  return new Promise((resolve,reject)=>{
    Papa.parse(path,{
      download:true,header:true,skipEmptyLines:true,
      complete:(res)=>resolve(res.data),
      error:reject
    });
  });
}

function hexToRgba(hex,alpha=1){
  const h = hex.replace('#','');
  const bigint = parseInt(h,16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function denseRank(map){
  const entries = Object.entries(map).sort((a,b)=>b[1]-a[1]);
  const ranks = {};
  let prevScore=null;let rank=0;
  entries.forEach(([name,score],idx)=>{
    if(score!==prevScore){rank=idx+1;prevScore=score;}
    ranks[name]=rank;
  });
  return ranks;
}

function repel(labels, top, bottom, gap){
  const sorted = labels.slice().sort((a,b)=>a.y-b.y);
  let prev = top;
  sorted.forEach(l=>{
    if(l.y < prev + gap){
      l.y = prev + gap;
    }
    prev = l.y;
  });
  for(let i=sorted.length-1;i>=0;i--){
    if(sorted[i].y > bottom){
      sorted[i].y = bottom;
      if(i>0 && sorted[i].y < sorted[i-1].y + gap){
        sorted[i-1].y = sorted[i].y - gap;
      }
    }
  }
  return sorted;
}

const slopeLabelPlugin = {
  id:'slopeLabels',
  afterDatasetsDraw(chart, args, opts){
    if(!opts || !opts.enabled || !opts.labels){return;}
    const {ctx, chartArea} = chart;
    const xScale = chart.scales.x;
    const yScale = chart.scales.y;
    if(!xScale || !yScale){return;}

    const xRight= xScale.getPixelForValue(2) + 16;
    const top = chartArea.top + 6;
    const bottom = chartArea.bottom - 6;

    const rightLabels= opts.labels.map(l=>{
      const yv = l.rT ?? l.r1 ?? l.r3 ?? 0;
      const py = yScale.getPixelForValue(yv);
      return {name:l.name,y:py,yRaw:py};
    });

    const adjRight= repel(rightLabels, top, bottom, 14);

    ctx.save();
    ctx.font = '14px "Jersey 15", cursive';
    ctx.fillStyle = '#2E2E2E';
    ctx.textAlign = 'left';
    adjRight.forEach((l,i)=>{
      const yPoint = rightLabels[i].yRaw;
      if(Math.abs(yPoint - l.y) > 1){
        ctx.strokeStyle = 'rgba(46,46,46,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xRight-6, yPoint);
        ctx.lineTo(xRight+2, l.y);
        ctx.stroke();
      }
      ctx.fillText(l.name, xRight+6, l.y+4);
    });
    ctx.restore();
  }
};

Chart.register(slopeLabelPlugin);

function renderGapChart(){
  const filtered = books
    .filter(b=>b.status==='read')
    .map(b=>{
      const release = parseDate(b.release_date || `${b.release_date}-01-01`);
      const read = parseDate(b.date_read);
      if(!release || !read){return null;}
      const diffDays = Math.round((read - release)/(1000*60*60*24));
      const readYear = read.getFullYear() + (read.getMonth()/12);
      return {title:b.title,x:readYear,y:diffDays};
    })
    .filter(Boolean)
    .sort((a,b)=>b.y - a.y)
    .slice(0,40);

  destroyChart();
  chart = new Chart(ctx,{
    type:'scatter',
    data:{
      datasets:[{
        label:'Days between release and read',
        data: filtered,
        backgroundColor: palette.yellow,
        borderColor: palette.olive,
        borderWidth:1.5,
        pointRadius:6,
        pointHoverRadius:8
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{
          label:ctx=>{
            const item = ctx.raw;
            return `${item.title}: ${Math.round(item.y)} days (read ${item.x.toFixed(1)})`;
          }
        }}
      },
      scales:{
        x:{
          title:{display:true,text:'Read year'},
          grid:{display:false},
          ticks:{callback:v=>Number(v).toFixed(0)}
        },
        y:{
          beginAtZero:true,
          title:{display:true,text:'Days between release and read'},
          grid:{display:false}
        }
      }
    }
  });
}

function renderCountryChart(){
  const counts = {};
  books.filter(b=>b.status==='read').forEach(b=>{
    const key = b.country?.trim() || 'Unknown';
    counts[key]=(counts[key]||0)+1;
  });
  const entries = Object.entries(counts);
  const data = entries.map(([country,count])=>{
    const coord = lookupCoords(country) || {lat:0,lon:0};
    const x = ((coord.lon + 180)/360)*100;
    const y = 100 - ((coord.lat + 90)/180)*100;
    return {x,y,r:Math.min(30,6 + count*2),country,count};
  });
  destroyChart();
  chart = new Chart(ctx,{
    type:'bubble',
    data:{
      datasets:[{
        label:'Authors by country',
        data,
        backgroundColor: palette.blue,
        borderColor: palette.olive,
        borderWidth:2,
        hoverBackgroundColor: palette.pink
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{
          label:ctx=>{
            const v = ctx.raw;
            return `${v.country || 'Unknown'}: ${v.count} author(s)`;
          }
        }}
      },
      scales:{
        x:{display:false,min:0,max:100,grid:{display:false}},
        y:{display:false,min:0,max:100,grid:{display:false}}
      }
    }
  });
}

function renderRatingChart(){
  const buckets = [0,0,0,0,0];
  books.forEach(b=>{
    const r = Number(b.rating);
    if(Number.isFinite(r) && r>=1 && r<=5){
      buckets[r-1] += 1;
    }
  });
  destroyChart();
  chart = new Chart(ctx,{
    type:'bar',
    data:{
      datasets:[{
        label:'Ratings',
        data:buckets.map((count,i)=>({x:i+1,y:count})),
        backgroundColor: 'rgba(228,161,161,0.8)',
        borderColor: palette.olive,
        borderWidth:1,
        borderRadius:6
      }]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{
          label:ctx=>`${ctx.label}: ${ctx.raw.y}`
        }}
      },
      scales:{
        x:{
          type:'category',
          labels:['1★','2★','3★','4★','5★'],
          title:{display:true,text:'Rating'},
          grid:{display:false},
          ticks:{display:true}
        },
        y:{
          beginAtZero:true,
          display:false,
          grid:{display:false},
          ticks:{display:false}
        }
      }
    }
  });
}

function renderAuthorChart(){
  // read counts per slice
  const now = new Date();
  const oneYearAgo = new Date(now); oneYearAgo.setFullYear(now.getFullYear()-1);
  const threeYearsAgo = new Date(now); threeYearsAgo.setFullYear(now.getFullYear()-3);

  const bucket = (endDate)=>{
    const map = {};
    books.forEach(b=>{
      const a = (b.author || 'Unknown').trim() || 'Unknown';
      const d = parseDate(b.date_read);
      if(b.status !== 'read' || !d){return;}
      if(d <= endDate){map[a]=(map[a]||0)+1;}
    });
    return map;
  };

  const countsT = bucket(now);
  const counts1 = bucket(oneYearAgo);
  const counts3 = bucket(threeYearsAgo);

  const rankT = denseRank(countsT);
  const rank1 = denseRank(counts1);
  const rank3 = denseRank(counts3);

  const top = Object.entries(rankT)
    .sort((a,b)=>{
      if(a[1] !== b[1]) return a[1]-b[1];
      return a[0].localeCompare(b[0]);
    })
    .slice(0,10);
  if(!top.length){destroyChart();return;}

  const buildPositions = (ranks)=>{
    const entries = Object.entries(ranks).sort((a,b)=>{
      if(a[1] !== b[1]) return a[1]-b[1];
      return a[0].localeCompare(b[0]);
    });
    const map={};
    entries.forEach(([name],idx)=>{map[name]=idx+1;});
    return map;
  };

  const pos3 = buildPositions(rank3);
  const pos1 = buildPositions(rank1);
  const posT = buildPositions(rankT);
  const maxPos = top.length;

  const colors = ['#E4A1A1','#9FB8A6','#8AB6D6','#B5A481','#F0D572','#e48fb5','#7daaba','#d4a15f','#a5c07f','#c8b1d6'];
  const labelsMeta=[];
  const datasets = top.map(([author],idx)=>{
    const y3 = pos3[author] ?? maxPos;
    const y1 = pos1[author] ?? maxPos;
    const yT = posT[author] ?? maxPos;
    labelsMeta.push({name:author,r3:y3,r1:y1,rT:yT});
    return {
      label:author,
      data:[{x:0,y:y3},{x:1,y:y1},{x:2,y:yT}],
      borderColor: colors[idx % colors.length],
      backgroundColor: hexToRgba(colors[idx % colors.length],0.35),
      tension:0.15,
      borderWidth:2,
      borderCapStyle:'round',
      borderJoinStyle:'round',
      pointRadius:0,
      pointHoverRadius:4,
      fill:true
    };
  });

  destroyChart();
  chart = new Chart(ctx,{
    type:'line',
    data:{datasets},
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{display:false},
        tooltip:{callbacks:{
          label:ctx=>`${ctx.dataset.label}: ${ctx.formattedValue} reads`
        }},
        slopeLabels:{enabled:true,labels:labelsMeta}
      },
      scales:{
        x:{
          type:'linear',
          min:-0.1,
          max:2.1,
          grid:{display:false},
          ticks:{
            callback:(v)=>{
              if(v===0) return '3 yrs ago';
              if(v===1) return '1 yr ago';
              if(v===2) return 'Today';
              return '';
            }
          }
        },
        y:{
          reverse:true,
          min:1,
          max:maxPos+0.5,
          grid:{display:false},
          title:{display:true,text:'Rank'},
          ticks:{stepSize:1,display:true}
        },
        y1:{
          position:'right',
          reverse:true,
          min:1,
          max:maxPos+0.5,
          grid:{display:false},
          title:{display:true,text:'Rank'},
          ticks:{stepSize:1,display:true}
        }
      }
    }
  });
}

function renderSelected(){
  const val = chartSelect.value;
  if(chartArea){
    chartArea.classList.toggle('world-map', val==='country');
  }
  if(val==='country'){renderCountryChart();}
  else if(val==='rating'){renderRatingChart();}
  else if(val==='authors'){renderAuthorChart();}
  else{renderGapChart();}
}

async function loadAll(){
  try{
    const [mapRows, bookRows] = await Promise.all([
      loadCsv('data/map.csv'),
      loadCsv('data/books.csv')
    ]);
    geoIndex = buildGeoIndex(mapRows);
    books = bookRows;
    renderSelected();
  }catch(err){
    console.error('Failed to load data', err);
  }
}

chartSelect.addEventListener('change', renderSelected);
document.addEventListener('DOMContentLoaded', loadAll);
