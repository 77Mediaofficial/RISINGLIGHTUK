const SB_URL='https://vtvniushkftodhlvdkom.supabase.co';
const SB_ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0dm5pdXNoa2Z0b2RobHZka29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMTY4NzAsImV4cCI6MjA5MTY5Mjg3MH0.a8R36vH_KRnruIcj39ivrkTuVNtH7YX8OXabbSn3jgg';

/* SECURITY: RL_TOKEN is a real Supabase JWT set only after email+password
   authentication against /auth/v1/token. It is NEVER set client-side from
   a URL param or hardcoded password. The anon key above is safe to expose
   only for public reads — all writes require RL_TOKEN. */
let RL_TOKEN=null;

let allEvents=[];
let currentFilter='all';
let currentCountry='all';
let isUploading=false;
let currentPDF=null;
let currentPDFData=null;
let currentPage=1;
let totalPages=0;

/* Country flag emoji map. Add more as you expand to new countries. */
const COUNTRY_FLAGS={
  'UK':'🇬🇧','USA':'🇺🇸','India':'🇮🇳','Kenya':'🇰🇪','Nepal':'🇳🇵',
  'Bangladesh':'🇧🇩','Pakistan':'🇵🇰','Nigeria':'🇳🇬','South Africa':'🇿🇦',
  'Ghana':'🇬🇭','Uganda':'🇺🇬','Ethiopia':'🇪🇹','Guatemala':'🇬🇹','Other':'🌍'
};

/* Detect country from event name. Searches case-insensitively for keywords.
   Falls back to "Other" if no match. Add aliases as needed. */
function detectCountry(name){
  if(!name)return'Other';
  const n=name.toLowerCase();
  const aliases={
    'UK':['uk','united kingdom','britain','london','surrey','manchester','birmingham','england','scotland','wales'],
    'USA':['usa','united states','america','arizona','phoenix','new york','los angeles','chicago','texas','florida','california'],
    'India':['india','mumbai','delhi','bangalore','kolkata','chennai'],
    'Kenya':['kenya','nairobi'],
    'Nepal':['nepal','kathmandu'],
    'Bangladesh':['bangladesh','dhaka'],
    'Pakistan':['pakistan','karachi','lahore','islamabad'],
    'Nigeria':['nigeria','lagos','abuja'],
    'South Africa':['south africa','cape town','johannesburg'],
    'Ghana':['ghana','accra'],
    'Uganda':['uganda','kampala'],
    'Ethiopia':['ethiopia','addis ababa'],
    'Guatemala':['guatemala','guatemala city']
  };
  for(const [country,keywords] of Object.entries(aliases)){
    if(keywords.some(k=>n.includes(k)))return country;
  }
  return'Other';
}

/* pdf.js loads on first use (22 Oct 2026). Only opening an event's PDF needs it, so no page downloads
   it up front any more. Same file, integrity hash and attributes as the old <script> tag. */
let _rlPdfP=null;
function rlPdfReady(){
  if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
  if(_rlPdfP)return _rlPdfP;
  _rlPdfP=new Promise((res,rej)=>{
    const s=document.createElement('script');
    s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.integrity='sha512-q+4liFwdPC/bNdhUpZx6aXDx/h77yEQtn4I1slHydcbZK34nLaR3cAeYSJshoxIOq3mjEf7xJE8YWIUHMn+oCQ==';
    s.crossOrigin='anonymous';s.referrerPolicy='no-referrer';
    s.onload=()=>{window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';res(window.pdfjsLib);};
    s.onerror=()=>{_rlPdfP=null;s.remove();rej(new Error('pdf.js did not load'));};
    document.head.appendChild(s);
  });
  return _rlPdfP;
}

const fileInput=document.getElementById('file-input');
const uploadZone=document.getElementById('upload-zone');
const uploadStatus=document.getElementById('upload-status');

/* the upload box is on the Events page only (22 Oct 2026: the site became separate pages) */
if(fileInput&&uploadZone){
fileInput.addEventListener('change',handleFiles);
uploadZone.addEventListener('dragover',e=>{e.preventDefault();uploadZone.classList.add('dragover')});
uploadZone.addEventListener('dragleave',()=>uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop',e=>{
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  handleFiles({target:{files:e.dataTransfer.files}});
});
}

async function handleFiles(e){
  /* SECURITY FIX: Require a verified admin JWT (RL_TOKEN), not just
     a client-side sessionStorage flag.
     ARCHITECTURE FIX: Upload to Supabase Storage (binary), store only the
     public URL in the DB. Old approach stored base64 (~4-5× larger) directly
     in the postgres column, which hits row-size limits and bloats the DB. */
  if(!RL_TOKEN){
    uploadStatus.textContent='✗ Admin sign-in required to upload events.';
    uploadStatus.className='upload-status error';
    return;
  }
  if(isUploading){
    uploadStatus.textContent='⏳ Please wait for current upload to finish...';
    uploadStatus.className='upload-status';
    return;
  }

  const MAX_BYTES=10*1024*1024; /* 10 MB */
  const files=Array.from(e.target.files);

  isUploading=true;
  uploadStatus.textContent='Uploading...';
  uploadStatus.className='upload-status';

  for(const file of files){
    if(file.type!=='application/pdf'){
      uploadStatus.textContent='✗ Please upload PDF files only.';
      uploadStatus.className='upload-status error';
      isUploading=false;
      break;
    }
    if(file.size>MAX_BYTES){
      uploadStatus.textContent=`✗ File too large (${(file.size/1024/1024).toFixed(1)} MB). Maximum is 10 MB.`;
      uploadStatus.className='upload-status error';
      isUploading=false;
      break;
    }

    try{
      /* Step 1: Upload binary PDF to Supabase Storage */
      const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
      const storagePath=`${Date.now()}-${safeName}`;

      const storageR=await fetch(`${SB_URL}/storage/v1/object/event-pdfs/${storagePath}`,{
        method:'POST',
        headers:{
          'Authorization':`Bearer ${RL_TOKEN}`,
          'Content-Type':'application/pdf',
          'x-upsert':'false'
        },
        body:file
      });

      if(storageR.status===401||storageR.status===403){
        clearAdminSession();
        uploadStatus.textContent='✗ Session expired — please sign in again.';
        uploadStatus.className='upload-status error';
        isUploading=false;
        return;
      }
      if(!storageR.ok){
        const errTxt=await storageR.text().catch(()=>'');
        throw new Error(`Storage upload failed (${storageR.status}): ${errTxt}`);
      }

      /* Step 2: Build the public URL — bucket must be set to public in Supabase */
      const publicUrl=`${SB_URL}/storage/v1/object/public/event-pdfs/${storagePath}`;

      /* Step 3: Insert DB row with pdf_url (not base64) */
      const dbR=await fetch(`${SB_URL}/rest/v1/risinglight_events`,{
        method:'POST',
        headers:{
          'apikey':SB_ANON,
          'Authorization':`Bearer ${RL_TOKEN}`,
          'Content-Type':'application/json',
          'Prefer':'return=representation'
        },
        body:JSON.stringify({
          name:file.name.replace(/\.pdf$/i,''),
          size:(file.size/1024).toFixed(1)+' KB',
          pdf_url:publicUrl
        })
      });

      if(dbR.status===401||dbR.status===403){
        clearAdminSession();
        uploadStatus.textContent='✗ Session expired — please sign in again.';
        uploadStatus.className='upload-status error';
        isUploading=false;
        return;
      }
      if(dbR.ok){
        uploadStatus.textContent='✓ Upload successful! Ready for next upload.';
        uploadStatus.className='upload-status success';
        await loadEvents();
        setTimeout(()=>{uploadStatus.textContent='';},3000);
      }else{
        const errTxt=await dbR.text().catch(()=>'');
        throw new Error(`DB insert failed (${dbR.status}): ${errTxt}`);
      }
    }catch(err){
      uploadStatus.textContent=`✗ Upload error: ${err.message}`;
      uploadStatus.className='upload-status error';
    }finally{
      isUploading=false;
    }
  }
  fileInput.value='';
}

async function loadEvents(){
  const grid=document.getElementById('events-grid');
  const fail=msg=>{if(grid)grid.innerHTML=`<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-title">Unable to load events</div><div style="font-size:14px;margin-top:8px;color:var(--text3)">${msg}</div></div>`;
    /* the request has settled (badly): the calendar leaves its skeleton and shows this month */
    window._rlEventsSettled=true;if(typeof renderCalendar==='function')renderCalendar();};

  /* Network layer: a thrown fetch is a connection problem; a non-OK status is a
     server problem. The OLD code only handled r.ok and the catch — a 4xx/5xx
     left the skeleton loaders spinning forever with no message. */
  let r;
  try{
    r=await fetch(`${SB_URL}/rest/v1/risinglight_events?order=created_at.desc`,{
      headers:{'apikey':SB_ANON,'Authorization':`Bearer ${SB_ANON}`}
    });
  }catch(e){
    fail('Check your connection and try again.');
    return;
  }
  if(!r.ok){
    fail(`Server returned ${r.status}. Please try again later.`);
    return;
  }
  try{
    allEvents=await r.json();
  }catch(e){
    fail('The response could not be read.');
    return;
  }
  window._rlEventsSettled=true; /* the calendar may now paint a real month (see renderCalendar) */
  window._rlEventsOk=true;      /* the headline event count may now count the real list (rlAutoStats) */
  /* Events page: the month grid and the calendar show only once there are events (Joe, 23 Oct 2026) */
  {const mom=document.getElementById('momentum');if(mom)mom.classList.toggle('mom-empty',!allEvents.length);}

  /* Rendering is isolated from the network try/catch so a rendering exception
     can't masquerade as a "failed to load" message — it surfaces in the console
     instead, and loadEvents still resolves so boot-time counters animate. */
  try{
    /* Impact numbers recalculate from the events just loaded — unless an admin
       has pinned a value, which rlApplyStats honours. */
    if(typeof rlApplyStats==='function')rlApplyStats();
    if(!window._rlCalTouched){calView=null;if(typeof renderCalendar==='function')renderCalendar();}
    if(typeof rlFillStatsForm==='function')rlFillStatsForm();
    renderCountryFilters();
    if(window.rlOnEventsLoaded)window.rlOnEventsLoaded(); // v7: heatmap etc.
  }catch(e){
    console.error('[Rising Light] post-load render failed:',e);
  }
  /* The ticker and the events list sit below CH.03 and are the heavy part of this render (layout and
     text shaping of every new card). They run after the next frame, so CH.03's own updates paint first,
     and while CH.03's goal is counting up they wait for it to land, so the count never freezes
     mid-climb (16 Oct 2026). The wait is capped at 2 s (a hidden tab pauses the count). After the count
     lands they still wait one frame, so its final number paints before this render (18 Oct 2026). */
  const _rest=()=>{try{renderTicker();renderEvents();}catch(e){console.error('[Rising Light] post-load render failed:',e);}
    requestAnimationFrame(rlSettleHash); /* the list has its real height now (22 Oct 2026) */};
  const _next=()=>requestAnimationFrame(()=>setTimeout(_rest,0));
  const _goal=document.getElementById('goal-card');
  const _listAfterGoal=!!(_goal&&grid&&(_goal.compareDocumentPosition(grid)&Node.DOCUMENT_POSITION_FOLLOWING));
  if(window.rlGoalBusy&&_listAfterGoal)Promise.race([window.rlGoalBusy,new Promise(r=>setTimeout(r,2000))]).then(_next);
  else _next();
}

function filterEvents(filter){
  currentFilter=filter;
  // Activate the matching tab by its filter — works whether called from a click
  // OR from a keyboard shortcut (which has no global `event`).
  document.querySelectorAll('.filter-tab').forEach(t=>{
    const oc=t.getAttribute('onclick')||'';
    t.classList.toggle('active', oc.includes("'"+filter+"'"));
  });
  const grid=document.getElementById('events-grid');
  if(grid){grid.style.opacity='0.6';grid.style.transform='translateY(4px)';
    setTimeout(()=>{grid.style.opacity='';grid.style.transform='';renderEvents();},200);
  }else{renderEvents();}
}

function renderEvents(){
  const grid=document.getElementById('events-grid');
  if(!grid)return; /* the list lives on the Events page only */
  const count=document.getElementById('event-count');

  let filtered=allEvents.filter(e=>{
    const country=detectCountry(e.name);
    const matchesCountry=currentCountry==='all'||country===currentCountry;
    if(!matchesCountry)return false;
    if(currentFilter==='all')return true;
    const daysDiff=Math.floor((new Date()-new Date(e.created_at))/(1000*60*60*24));
    if(currentFilter==='recent')return daysDiff<=7;
    return true;
  });

  if(count){
    count.textContent=filtered.length+' event'+(filtered.length!==1?'s':'');
    count.style.display=filtered.length?'':'none'; /* no "0 events" pill: the empty state below says it in words */
  }

  /* country-filter reset — visible only while a filter is active */
  const clr=document.getElementById('filter-clear');
  if(clr){
    clr.classList.toggle('on',currentCountry!=='all');
    if(currentCountry!=='all')clr.textContent='Showing '+currentCountry+' — show all events ×';
  }

  if(filtered.length===0){
    grid.innerHTML=currentCountry!=='all'&&allEvents.length
      ? '<div class="empty"><div class="empty-title">No events listed for '+escapeHtml(currentCountry)+'</div><div class="empty-sub">Choose <strong>Show all events</strong> above to see the rest.</div></div>'
      : '<div class="empty"><div class="empty-title">No events listed right now</div><div class="empty-sub">Follow <a href="https://www.instagram.com/risinglightuk/" target="_blank" rel="noopener noreferrer">@risinglightuk</a> for what we’re doing next, or <a href="get-involved.html">get involved</a>.</div></div>';
    return;
  }

  grid.innerHTML=filtered.map(e=>{
    const daysDiff=Math.floor((new Date()-new Date(e.created_at))/(1000*60*60*24));
    const badge=daysDiff<=7?'New':'';
    const country=detectCountry(e.name);
    /* The share text travels as an HTML-escaped data attribute, never inside an inline
       onclick: encodeURIComponent leaves ' ( ) unescaped, so a name like CHARLIE'S
       PROMISE broke out of the old onclick string (and an admin-typed name could run
       code). One delegated listener (initShareButtons) reads it back. */
    const shareText=escapeHtml('Rising Light event: '+e.name);
    return `
    <div class="event-card">
      ${badge?`<div class="event-badge">${badge}</div>`:''}
      <div class="event-name">${escapeHtml(e.name)}</div>
      <div class="event-actions">
        <button class="btn btn-primary" onclick="viewEvent(${e.id})">View Details</button>
      </div>
      <div class="event-share">
        <button type="button" class="share-btn" data-share="twitter" data-text="${shareText}" aria-label="Share on X" title="Share on X">𝕏</button>
        <button type="button" class="share-btn" data-share="whatsapp" data-text="${shareText}" title="Share on WhatsApp">WhatsApp</button>
        <button type="button" class="share-btn" data-share="copy" data-text="${shareText}" title="Copy link">Copy Link</button>
      </div>
    </div>
  `}).join('');
}

function escapeHtml(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}

async function deleteEvent(id){
  /* SECURITY FIX: Require RL_TOKEN (real JWT). Previously used SB_ANON as
     Bearer — any visitor who knew an event ID could DELETE it via curl. */
  if(!RL_TOKEN){alert('Admin sign-in required to delete events.');return;}
  if(!confirm('Delete this event? This cannot be undone.'))return;

  const ev=allEvents.find(e=>e.id===id);

  try{
    const r=await fetch(`${SB_URL}/rest/v1/risinglight_events?id=eq.${id}`,{
      method:'DELETE',
      headers:{
        'apikey':SB_ANON,
        'Authorization':`Bearer ${RL_TOKEN}`
      }
    });
    if(r.status===401||r.status===403){
      clearAdminSession();
      alert('Session expired — please sign in again.');
      return;
    }
    if(r.ok){
      /* Best-effort: also remove the file from Storage */
      if(ev&&ev.pdf_url){
        const match=ev.pdf_url.match(/\/event-pdfs\/(.+)$/);
        if(match){
          fetch(`${SB_URL}/storage/v1/object/event-pdfs/${match[1]}`,{
            method:'DELETE',
            headers:{'Authorization':`Bearer ${RL_TOKEN}`}
          }).catch(()=>{});
        }
      }
      await loadEvents();
    }else{
      alert('Delete failed');
    }
  }catch(err){
    alert('Delete error: '+err.message);
  }
}

/* ===== REPLACE PDF (admin) — swap the file, keep the same event row =====
   PATCHes the existing row so id / name / event_date / created_at all survive:
   the calendar date you set and the card's position don't change, only the PDF.
   Mirrors the upload (storage POST) + delete (storage cleanup) patterns. */
let replaceTargetId=null;
const replaceInput=document.createElement('input');
replaceInput.type='file';replaceInput.accept='.pdf';replaceInput.style.display='none';
document.body.appendChild(replaceInput);

function replacePdf(id){
  if(!RL_TOKEN){alert('Admin sign-in required to replace PDFs.');return;}
  replaceTargetId=id;
  replaceInput.value='';
  replaceInput.click();
}

replaceInput.addEventListener('change',async()=>{
  const file=replaceInput.files&&replaceInput.files[0];
  const id=replaceTargetId;
  if(!file||id==null)return;
  if(!RL_TOKEN){alert('Admin sign-in required to replace PDFs.');return;}
  if(file.type!=='application/pdf'){alert('Please choose a PDF file.');replaceInput.value='';return;}
  const MAX_BYTES=10*1024*1024; /* 10 MB — same cap as upload */
  if(file.size>MAX_BYTES){alert(`File too large (${(file.size/1024/1024).toFixed(1)} MB). Maximum is 10 MB.`);replaceInput.value='';return;}

  const ev=allEvents.find(e=>e.id===id);
  const oldUrl=ev?ev.pdf_url:null;

  try{
    /* Step 1: upload the new binary to a fresh storage path */
    const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
    const storagePath=`${Date.now()}-${safeName}`;
    const storageR=await fetch(`${SB_URL}/storage/v1/object/event-pdfs/${storagePath}`,{
      method:'POST',
      headers:{'Authorization':`Bearer ${RL_TOKEN}`,'Content-Type':'application/pdf','x-upsert':'false'},
      body:file
    });
    if(storageR.status===401||storageR.status===403){clearAdminSession();alert('Session expired — please sign in again.');return;}
    if(!storageR.ok){const t=await storageR.text().catch(()=>'');throw new Error(`Storage upload failed (${storageR.status}): ${t}`);}

    const publicUrl=`${SB_URL}/storage/v1/object/public/event-pdfs/${storagePath}`;

    /* Step 2: PATCH the existing row — only pdf_url + size change */
    const dbR=await fetch(`${SB_URL}/rest/v1/risinglight_events?id=eq.${id}`,{
      method:'PATCH',
      headers:{'apikey':SB_ANON,'Authorization':`Bearer ${RL_TOKEN}`,'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify({pdf_url:publicUrl,size:(file.size/1024).toFixed(1)+' KB'})
    });
    if(dbR.status===401||dbR.status===403){clearAdminSession();alert('Session expired — please sign in again.');return;}
    if(!dbR.ok){const t=await dbR.text().catch(()=>'');throw new Error(`DB update failed (${dbR.status}): ${t}`);}

    /* Step 3: best-effort delete the old storage file (mirror deleteEvent) */
    if(oldUrl){
      const m=oldUrl.match(/\/event-pdfs\/(.+)$/);
      if(m){fetch(`${SB_URL}/storage/v1/object/event-pdfs/${m[1]}`,{method:'DELETE',headers:{'Authorization':`Bearer ${RL_TOKEN}`}}).catch(()=>{});}
    }

    if(window.showToast)window.showToast('PDF replaced ✓');
    await loadEvents();
  }catch(err){
    alert('Replace error: '+err.message);
  }finally{
    replaceTargetId=null;
    replaceInput.value='';
  }
});

async function viewEvent(id){
  const e=allEvents.find(ev=>ev.id===id);
  if(!e)return;

  /* Support both new (pdf_url → Storage) and old (pdf_data → base64) records */
  const pdfSource=e.pdf_url||e.pdf_data||null;
  if(!pdfSource){
    alert('No PDF available for this event.');
    return;
  }

  document.getElementById('modal-title').textContent=e.name;
  document.getElementById('pdf-modal').classList.add('active');

  currentPDFData=pdfSource;
  currentPage=1;

  document.getElementById('pdf-container').innerHTML='<div style="color:#aaa;text-align:center;padding:40px;font-family:inherit">Loading PDF…</div>';

  try{
    const loadingTask=(await rlPdfReady()).getDocument(pdfSource);
    currentPDF=await loadingTask.promise;
    totalPages=currentPDF.numPages;
    document.getElementById('pdf-page-count').textContent=totalPages;
    await renderAllPages();
  }catch(err){
    console.error('PDF loading error:',err);
    document.getElementById('pdf-container').innerHTML='<div style="color:white;text-align:center;padding:40px">Error loading PDF. The file may have been removed.</div>';
  }
}

async function renderAllPages(){
  const container=document.getElementById('pdf-container');
  container.innerHTML='';

  // Build a horizontal track holding one slide per page. Only the active
  // page is shown at a time; the slide bar / buttons move between them.
  const track=document.createElement('div');
  track.className='pdf-track';
  track.id='pdf-track';

  for(let pageNum=1;pageNum<=totalPages;pageNum++){
    const slide=document.createElement('div');
    slide.className='pdf-slide';

    const page=await currentPDF.getPage(pageNum);
    const viewport=page.getViewport({scale:1.5});

    const canvas=document.createElement('canvas');
    canvas.className='pdf-page';
    const context=canvas.getContext('2d');
    canvas.height=viewport.height;
    canvas.width=viewport.width;

    await page.render({canvasContext:context,viewport:viewport}).promise;

    slide.appendChild(canvas);
    track.appendChild(slide);
  }

  container.appendChild(track);

  // Initialise the slide bar and hide it for single-page documents.
  const slider=document.getElementById('pdf-slider');
  slider.min=1;
  slider.max=totalPages;
  slider.value=1;
  slider.disabled=totalPages<=1;
  document.getElementById('pdf-sliderbar').style.display=totalPages>1?'flex':'none';

  goToPage(1);
}

/* Jump to a page: slides the track and keeps the bar + buttons in sync.
   Global (called from the slider's inline oninput and the Prev/Next buttons). */
function goToPage(n){
  if(!totalPages)return;
  n=Math.max(1,Math.min(totalPages,n));
  currentPage=n;
  const track=document.getElementById('pdf-track');
  if(track)track.style.transform='translateX('+(-(n-1)*100)+'%)';
  const slider=document.getElementById('pdf-slider');
  if(slider&&Number(slider.value)!==n)slider.value=n;
  updatePageControls();
}

function updatePageControls(){
  document.getElementById('pdf-prev').disabled=currentPage<=1;
  document.getElementById('pdf-next').disabled=currentPage>=totalPages;
  document.getElementById('pdf-page-num').textContent=currentPage;
}

function changePDFPage(delta){
  goToPage(currentPage+delta);
}

function downloadPDF(){
  if(!currentPDFData)return;
  const link=document.createElement('a');
  link.href=currentPDFData;
  link.download=document.getElementById('modal-title').textContent+'.pdf';
  link.click();
}

function closeViewer(){
  document.getElementById('pdf-modal').classList.remove('active');
  document.getElementById('pdf-container').innerHTML='';
  currentPDF=null;
  currentPDFData=null;
  currentPage=1;
  totalPages=0;
}

document.getElementById('pdf-modal').addEventListener('click',e=>{if(e.target.id==='pdf-modal')closeViewer()});
document.getElementById('admin-login-modal').addEventListener('click',e=>{if(e.target.id==='admin-login-modal')closeAdminModal()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeViewer();closeAdminModal();}});

/* ─── COUNTRY FILTERS ──────────────────────────────────────────────────── */
function renderCountryFilters(){
  // Build set of countries from events
  const found=new Set(['all']);
  allEvents.forEach(e=>found.add(detectCountry(e.name)));
  const list=Array.from(found);

  const wrap=document.getElementById('country-filters');
  if(!wrap)return; // chip bar removed from UI — map location cards still filter via filterByCountry()
  wrap.innerHTML=list.map(c=>{
    const flag=c==='all'?'🌐':(COUNTRY_FLAGS[c]||'🌍');
    const label=c==='all'?'All Countries':c;
    const active=c===currentCountry?'active':'';
    return `<button class="country-chip ${active}" onclick="filterByCountry('${c}')">${label}</button>`;
  }).join('');
}

function filterByCountry(country){
  currentCountry=country;
  renderCountryFilters();
  renderEvents();
  try{
    const u=new URL(location.href);
    if(country==='all')u.searchParams.delete('country');else u.searchParams.set('country',country);
    history.replaceState(history.state,'',u.pathname+u.search+u.hash);
  }catch(e){}
}

/* ─── TICKER ──────────────────────────────────────────────────────────── */
function renderTicker(){
  const track=document.getElementById('ticker-track');
  if(!track)return;
  /* no events: the whole "LIVE" strip steps aside rather than announce nothing (22 Oct 2026) */
  const wrap=track.closest('.ticker-wrap');
  if(!allEvents.length){track.textContent='';if(wrap)wrap.style.display='none';return;}
  if(wrap)wrap.style.display='';
  const items=allEvents.slice(0,8).map(e=>{
    const days=Math.floor((new Date()-new Date(e.created_at))/(1000*60*60*24));
    const ago=days===0?'today':days===1?'yesterday':days+' days ago';
    return `<span class="ticker-item">→ <strong>${escapeHtml(e.name)}</strong> · added ${ago}</span>`;
  }).join('');
  // Duplicate the content so the slide animation loops seamlessly
  track.innerHTML=items+items;
}

/* ─── SHARE BUTTONS ──────────────────────────────────────────────────── */
/* text and url arrive RAW (not URL-encoded); btn is the clicked button, passed in by
   the delegated listener below rather than read from the global `event`. */
function shareEvent(platform,text,url,btn){
  if(platform==='twitter'){
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,'_blank','noopener,noreferrer');
  }else if(platform==='whatsapp'){
    window.open(`https://wa.me/?text=${encodeURIComponent(text+' '+url)}`,'_blank','noopener,noreferrer');
  }else if(platform==='copy'){
    const fullText=text+' '+url;
    navigator.clipboard.writeText(fullText).then(()=>{
      // Tiny non-blocking confirmation — flash the clicked button's text
      if(btn){const orig=btn.textContent;btn.textContent='Copied ✓';setTimeout(()=>{btn.textContent=orig},1400);}
      if(window.showToast)showToast('Link copied to clipboard 🔗'); // v7
    }).catch(()=>alert('Could not copy. URL: '+url));
  }
}
/* One delegated listener for every event card's share buttons (the cards are
   re-rendered on each filter, so binding per button would leak). */
(function initShareButtons(){
  document.addEventListener('click',function(ev){
    const b=ev.target.closest&&ev.target.closest('.share-btn[data-share]');
    if(!b)return;
    shareEvent(b.dataset.share,b.dataset.text||'',location.origin+location.pathname,b);
  });
})();

/* ─── ANIMATED COUNTERS ──────────────────────────────────────────────── */
function animateCounter(el,target,duration=1400){
  /* The clock starts on the first frame (16 Oct 2026): a frame's timestamp can be older than a
     performance.now() taken just before it, which made the first value negative ("-17 / 500"). */
  let start=null,last=null;
  const startVal=0;
  function step(now){
    if(start===null)start=now;
    const elapsed=now-start;
    const progress=Math.min(Math.max(elapsed/duration,0),1);
    // ease-out for a more natural feel
    const eased=1-Math.pow(1-progress,3);
    const value=Math.floor(startVal+(target-startVal)*eased);
    if(value!==last){el.textContent=value;last=value;}
    if(progress<1)requestAnimationFrame(step);
    else el.textContent=target;
  }
  requestAnimationFrame(step);
}

function animateAllCounters(){
  // Reduced-motion: land on the final number instantly, no count-up.
  const reduce=!!(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches);
  document.querySelectorAll('.stat-number[data-target]').forEach(el=>{
    const target=parseInt(el.dataset.target,10);
    if(isNaN(target))return;
    if(reduce){el.textContent=target;return;}
    animateCounter(el,target);
  });
}

/* ─── DARK MODE TOGGLE ──────────────────────────────────────────────── */
/* The toggle's sun/moon are CSS-driven SVGs keyed off body.dark (rotate-morph
   in the stylesheet) — no icon swapping here. The browser chrome (address bar)
   is kept in sync by driving the single theme-color meta from JS. */
function _rlSyncThemeMeta(isDark){
  const mt=document.querySelector('meta[name="theme-color"]');
  if(mt)mt.setAttribute('content',isDark?'#000000':'#FFFFFF');
  // Root-level color-scheme keeps native scrollbars/pickers/autofill in step
  // (must live on <html>, matching body — see the comment in the stylesheet).
  document.documentElement.style.colorScheme=isDark?'dark':'light';
  const cs=document.querySelector('meta[name="color-scheme"]');
  if(cs)cs.setAttribute('content',isDark?'dark':'light');
  const btn=document.getElementById('theme-toggle');
  if(btn)btn.setAttribute('aria-pressed',isDark?'true':'false');
}
function toggleTheme(){
  const isDark=document.body.classList.toggle('dark');
  try{localStorage.setItem('rl_theme',isDark?'dark':'light');}catch(e){} /* blocked site data: still switch, just not remembered */
  _rlSyncThemeMeta(isDark);
}

function applyStoredTheme(){
  let stored=null;try{stored=localStorage.getItem('rl_theme');}catch(e){} /* blocked site data must not stop the boot */
  // Default to DARK mode (Joe, 19 Oct 2026). Only go light if the visitor chose it
  // with the toggle (toggleTheme is the only writer of rl_theme). The OS preference
  // is still ignored: the site's own toggle decides.
  const useDark=stored!=='light';
  document.body.classList.toggle('dark',useDark);
  _rlSyncThemeMeta(useDark);
}

/* ─── ADMIN AUTH ──────────────────────────────────────────────────────
   SECURITY FIX: Replaces the old URL-param + hardcoded-password system.

   Old approach (INSECURE):
     - ADMIN_PASS='riselight2026' visible in source → anyone could become admin
     - ?admin=riselight2026 in URL → logged in browser history + shareable
     - Only a sessionStorage flag — any client-side code could set it

   New approach (SECURE):
     - Real Supabase email+password auth via /auth/v1/token
     - JWT stored in localStorage — validated against /auth/v1/user on boot
     - All writes use Authorization: Bearer ${RL_TOKEN} (real JWT)
     - RLS on the DB table enforces auth server-side, independent of client

   Setup: In Supabase → Authentication → Users, create an account for your
   admin (email + password). That person uses the lock-icon button to sign in.
*/

async function checkAdmin(){
  const token=localStorage.getItem('rl_token');
  if(!token)return;
  try{
    const r=await fetch(`${SB_URL}/auth/v1/user`,{
      headers:{'apikey':SB_ANON,'Authorization':`Bearer ${token}`}
    });
    if(r.ok){
      RL_TOKEN=token;
      document.body.classList.add('admin');
    }else{
      localStorage.removeItem('rl_token');
    }
  }catch(e){
    /* Network error on boot — leave token in localStorage, user can retry */
    console.warn('Admin session check failed:',e.message);
  }
}

function promptAdmin(){
  const modal=document.getElementById('admin-login-modal');
  modal.classList.add('active');
  setTimeout(()=>document.getElementById('admin-email').focus(),80);
}

function closeAdminModal(){
  document.getElementById('admin-login-modal').classList.remove('active');
  document.getElementById('admin-email').value='';
  document.getElementById('admin-pw').value='';
  const err=document.getElementById('admin-login-err');
  err.style.display='none';
  err.textContent='';
}

async function doAdminLogin(){
  const email=document.getElementById('admin-email').value.trim();
  const pw=document.getElementById('admin-pw').value;
  const errEl=document.getElementById('admin-login-err');
  const btn=document.getElementById('admin-login-btn');

  errEl.style.display='none';
  if(!email||!pw){
    errEl.textContent='Please enter your email and password.';
    errEl.style.display='block';
    return;
  }

  btn.disabled=true;
  btn.textContent='Signing in…';

  try{
    const r=await fetch(`${SB_URL}/auth/v1/token?grant_type=password`,{
      method:'POST',
      headers:{'apikey':SB_ANON,'Content-Type':'application/json'},
      body:JSON.stringify({email,password:pw})
    });
    const data=await r.json();
    if(!r.ok){
      errEl.textContent=data.error_description||data.msg||'Invalid credentials.';
      errEl.style.display='block';
      return;
    }
    RL_TOKEN=data.access_token;
    localStorage.setItem('rl_token',RL_TOKEN);
    document.body.classList.add('admin');
    closeAdminModal();
  }catch(e){
    errEl.textContent='Network error — please try again.';
    errEl.style.display='block';
  }finally{
    btn.disabled=false;
    btn.textContent='Sign In';
  }
}

function clearAdminSession(){
  RL_TOKEN=null;
  localStorage.removeItem('rl_token');
  document.body.classList.remove('admin');
}

function exitAdmin(){
  clearAdminSession();
}

/* ─── REACH MAP DATA ─────────────────────────────────────────────────────
   LAND is a precomputed array of (lat, lon) pairs tracing the continents as
   dots. It powered the old rotating globe; the flat blueprint map below
   reuses it verbatim with a simple equirectangular projection. */

const LAND=[83.46,-37.2,82.45,-49.6,81.89,-29.53,81.05,-41.93,80.29,-54.33,79.84,-34.27,79.16,-46.67,78.76,-26.61,78.52,-59.07,78.14,-39.01,77.55,-51.41,77.2,-31.34,77.16,106.16,76.65,-43.74,76.61,93.77,76.33,-23.68,76.13,-56.14,75.81,-36.08,75.77,101.43,75.31,-48.48,75.28,89.03,75.02,-28.42,74.98,109.09,74.8,76.63,74.54,-40.82,74.51,96.69,74.08,-53.21,74.05,84.29,73.81,-33.15,73.77,104.36,73.6,71.89,73.37,-45.55,73.33,91.96,73.1,-25.49,73.07,112.02,72.94,-57.95,72.91,79.56,72.81,132.08,72.78,-90.41,72.68,-37.89,72.65,99.62,72.52,-70.35,72.49,67.16,72.39,119.68,72.36,-102.81,72.3,172.2,72.27,-50.29,72.24,87.22,72.14,139.74,72.11,-82.75,72.08,54.76,72.02,-30.23,71.99,107.28,71.96,-115.21,71.9,159.81,71.83,74.82,71.74,127.34,71.71,-95.15,71.62,-42.62,71.59,94.88,71.5,147.41,71.47,-75.09,71.44,62.42,71.35,114.95,71.32,-107.55,71.26,167.47,71.23,-55.02,71.2,82.48,71.11,135.01,71.08,-87.48,71.05,50.02,71.0,-34.96,70.97,102.55,70.94,-119.95,70.88,155.07,70.85,-67.42,70.82,70.09,70.73,122.61,70.7,-99.88,70.65,175.13,70.62,-47.36,70.59,90.15,70.5,142.67,70.47,-79.82,70.45,57.69,70.36,110.21,70.33,-112.28,70.28,162.73,70.22,77.75,70.13,130.27,70.11,-92.22,70.02,-39.7,69.99,97.81,69.97,-124.68,69.91,150.33,69.88,-72.16,69.86,65.35,69.83,-157.14,69.77,117.87,69.75,-104.62,69.69,170.4,69.66,-52.1,69.64,85.41,69.55,137.93,69.53,-84.56,69.5,52.95,69.42,105.47,69.39,-117.02,69.34,158.0,69.28,73.01,69.25,-149.48,69.2,125.54,69.17,-96.96,69.12,178.06,69.09,-44.43,69.07,93.07,69.04,-129.42,68.99,145.6,68.96,-76.89,68.93,60.61,68.91,-161.88,68.85,113.14,68.83,-109.36,68.8,28.15,68.77,165.66,68.75,-56.83,68.72,80.68,68.7,-141.82,68.64,133.2,68.62,-89.29,68.59,48.21,68.54,-36.77,68.51,100.74,68.49,-121.75,68.43,153.26,68.41,-69.23,68.38,68.28,68.36,-154.22,68.3,120.8,68.28,-101.69,68.23,173.32,68.2,-49.17,68.18,88.34,68.15,-134.15,68.1,140.86,68.07,-81.63,68.05,55.88,67.97,108.4,67.95,-114.09,67.89,160.92,67.84,75.94,67.82,-146.55,67.77,128.46,67.74,-94.03,67.67,-41.51,67.64,96.0,67.62,-126.49,67.57,148.52,67.54,-73.97,67.52,63.54,67.49,-158.95,67.44,116.06,67.42,-106.43,67.39,31.08,67.37,168.59,67.34,-53.91,67.32,83.6,67.29,-138.89,67.24,136.13,67.22,-86.37,67.19,51.14,67.12,103.66,67.1,-118.83,67.05,156.19,67.0,71.2,66.97,-151.29,66.93,123.73,66.9,-98.77,66.88,38.74,66.83,-46.24,66.8,91.27,66.78,-131.23,66.73,143.79,66.71,-78.7,66.68,58.8,66.66,-163.69,66.61,111.33,66.59,-111.16,66.56,26.34,66.54,163.85,66.49,78.87,66.47,-143.63,66.42,131.39,66.39,-91.1,66.37,46.41,66.3,98.93,66.28,-123.56,66.23,151.45,66.18,66.47,66.16,-156.02,66.11,118.99,66.09,-103.5,66.06,34.01,66.04,171.51,66.02,-50.98,65.99,86.53,65.97,-135.96,65.92,139.05,65.9,-83.44,65.88,54.07,65.81,106.59,65.78,-115.9,65.74,159.11,65.69,74.13,65.67,-148.36,65.62,126.65,65.6,-95.84,65.57,41.67,65.53,-43.32,65.5,94.19,65.48,-128.3,65.44,146.72,65.41,-75.78,65.39,61.73,65.37,-160.76,65.32,114.25,65.3,-108.24,65.27,29.27,65.25,166.78,65.23,-55.71,65.21,81.79,65.18,-140.7,65.14,134.32,65.12,-88.18,65.09,49.33,65.03,101.86,65.0,-120.64,64.96,154.38,64.91,69.39,64.89,-153.1,64.87,-15.59,64.84,121.92,64.82,-100.57,64.8,36.93,64.75,-48.05,64.73,89.46,64.71,-133.04,64.67,141.98,64.64,-80.51,64.62,57.0,64.6,-165.5,64.55,109.52,64.53,-112.97,64.51,24.53,64.49,162.04,64.44,77.06,64.42,-145.43,64.38,129.58,64.35,-92.91,64.33,44.6,64.27,97.12,64.24,-125.37,64.2,149.64,64.16,64.66,64.14,-157.83,64.11,-20.33,64.09,117.18,64.07,-105.31,64.05,32.2,64.0,-52.79,63.98,84.72,63.96,-137.77,63.92,137.24,63.9,-85.25,63.87,52.26,63.81,104.78,63.79,-117.71,63.74,157.31,63.7,72.32,63.68,-150.17,63.64,124.84,63.61,-97.65,63.59,39.86,63.55,-45.12,63.53,92.38,63.51,-130.11,63.46,144.91,63.44,-77.59,63.42,59.92,63.4,-162.57,63.36,112.45,63.34,-110.05,63.32,27.46,63.29,164.97,63.25,79.98,63.23,-142.51,63.19,132.51,63.17,-89.98,63.15,47.52,63.08,100.05,63.06,-122.45,63.02,152.57,62.98,67.59,62.96,-154.91,62.91,120.11,62.89,-102.38,62.87,35.12,62.83,-49.86,62.81,87.65,62.79,-134.84,62.75,140.17,62.73,-82.32,62.71,55.19,62.64,107.71,62.62,-114.78,62.58,160.23,62.54,75.25,62.52,-147.24,62.48,127.77,62.46,-94.72,62.44,42.79,62.37,95.31,62.35,-127.18,62.31,147.83,62.27,62.85,62.25,-159.64,62.21,115.37,62.19,-107.12,62.17,30.39,62.13,-54.6,62.11,82.91,62.09,-139.58,62.05,135.43,62.03,-87.06,62.01,50.45,61.94,102.97,61.92,-119.52,61.88,155.5,61.84,70.51,61.82,-151.98,61.78,123.04,61.76,-99.46,61.74,38.05,61.7,-46.93,61.68,90.57,61.66,-131.92,61.62,143.1,61.58,58.11,61.52,110.64,61.5,-111.86,61.48,25.65,61.46,163.16,61.42,78.18,61.4,-144.32,61.36,130.7,61.34,-91.79,61.32,45.71,61.26,98.24,61.24,-124.25,61.2,150.76,61.16,65.78,61.14,-156.72,61.1,118.3,61.08,-104.19,61.06,33.32,61.02,-51.67,61.0,85.84,60.98,-136.65,60.95,138.36,60.93,-84.13,60.91,53.38,60.85,105.9,60.83,-116.59,60.79,158.42,60.75,73.44,60.73,-149.05,60.69,125.96,60.67,-96.53,60.65,40.98,60.59,93.5,60.57,-128.99,60.53,146.02,60.5,61.04,60.44,113.56,60.42,-108.93,60.4,28.58,60.34,81.1,60.32,-141.39,60.28,133.63,60.26,-88.87,60.25,48.64,60.19,101.16,60.17,-121.33,60.13,153.69,60.09,68.7,60.07,-153.79,60.03,121.23,60.01,-101.27,60.0,36.24,59.94,88.77,59.92,-133.73,59.88,141.29,59.84,56.3,59.79,108.83,59.77,-113.66,59.75,23.84,59.69,76.37,59.63,128.89,59.62,-93.6,59.6,43.91,59.54,96.43,59.52,-126.06,59.48,148.95,59.45,63.97,59.39,116.49,59.37,-106.0,59.35,31.51,59.3,84.03,59.28,-138.46,59.24,136.55,59.2,51.57,59.15,104.09,59.13,-118.4,59.09,156.61,59.07,-65.88,59.05,71.63,59.0,124.15,58.98,-98.34,58.96,39.17,58.91,91.69,58.89,-130.8,58.85,144.22,58.81,59.23,58.76,111.75,58.74,-110.74,58.72,26.77,58.67,79.29,58.63,-5.69,58.61,131.82,58.57,46.83,58.52,99.36,58.5,-123.14,58.47,151.88,58.45,-70.61,58.43,66.89,58.37,119.42,58.36,-103.07,58.34,34.43,58.28,86.96,58.26,-135.54,58.23,139.48,58.19,54.5,58.14,107.02,58.12,-115.47,58.1,22.03,58.05,74.56,57.99,127.08,57.98,-95.41,57.96,42.1,57.9,94.62,57.89,-127.87,57.85,147.14,57.81,62.16,57.76,114.68,57.74,-107.81,57.72,29.7,57.67,82.22,57.63,-2.76,57.62,134.74,57.58,49.76,57.53,102.28,57.51,-120.21,57.46,-67.69,57.44,69.82,57.39,122.34,57.37,-100.15,57.35,37.36,57.3,89.88,57.28,-132.61,57.24,142.41,57.21,57.42,57.16,109.95,57.14,-112.55,57.12,24.96,57.07,77.48,57.03,-7.5,57.02,130.01,57.0,-92.48,56.98,45.02,56.93,97.55,56.91,-124.95,56.88,150.07,56.86,-72.42,56.84,65.09,56.79,117.61,56.77,-104.88,56.75,32.62,56.7,85.15,56.68,-137.34,56.65,137.67,56.61,52.69,56.56,105.21,56.55,-117.28,56.53,20.23,56.49,-64.76,56.48,72.75,56.42,125.27,56.41,-97.22,56.39,40.29,56.34,92.81,56.32,-129.68,56.29,145.33,56.27,-77.16,56.25,60.35,56.2,112.87,56.18,-109.62,56.17,27.89,56.11,80.41,56.08,-4.57,56.06,132.93,56.05,-89.56,56.03,47.95,55.98,100.47,55.96,-122.02,55.94,15.49,55.91,-69.5,55.89,68.01,55.84,120.54,55.82,-101.96,55.76,88.07,55.74,-134.42,55.71,140.6,55.67,55.61,55.62,108.14,55.6,-114.36,55.59,23.15,55.55,-61.83,55.54,75.68,55.5,-9.31,55.49,128.2,55.47,-94.29,55.45,43.21,55.4,95.74,55.38,-126.75,55.37,10.75,55.35,148.26,55.33,-74.23,55.32,63.28,55.27,115.8,55.25,-106.69,55.23,30.82,55.18,83.34,55.15,-1.65,55.13,135.86,55.12,-86.63,55.1,50.88,55.05,103.4,55.03,-119.09,55.02,18.42,54.98,-66.57,54.97,70.94,54.92,123.46,54.9,-99.03,54.83,91.0,54.78,143.52,54.77,-78.97,54.75,58.54,54.7,111.06,54.68,-111.43,54.67,26.08,54.62,78.6,54.59,-6.38,54.57,131.13,54.55,-91.37,54.54,46.14,54.49,98.66,54.47,-123.83,54.45,13.68,54.42,-71.3,54.4,66.2,54.36,118.73,54.34,-103.77,54.27,86.27,54.22,138.79,54.21,-83.7,54.19,53.8,54.14,106.33,54.13,-116.16,54.11,21.34,54.08,-63.64,54.06,73.87,54.01,126.39,54.0,-96.1,53.98,41.41,53.93,93.93,53.92,-128.56,53.9,8.94,53.88,146.45,53.87,-76.04,53.85,61.47,53.8,113.99,53.79,-108.5,53.77,29.01,53.72,81.53,53.69,-3.45,53.67,134.05,53.66,-88.44,53.64,49.07,53.59,101.59,53.58,-120.9,53.56,16.61,53.53,-68.38,53.51,69.13,53.46,121.65,53.45,-100.84,53.38,89.19,53.34,141.72,53.32,-80.78,53.3,56.73,53.26,109.25,53.24,-113.24,53.22,24.27,53.19,-60.71,53.18,76.79,53.14,-8.19,53.13,129.32,53.11,-93.18,53.1,44.33,53.05,96.86,53.03,-125.64,53.02,11.87,52.99,-73.11,52.97,64.39,52.92,116.92,52.91,-105.57,52.84,84.46,52.81,-0.53,52.8,136.98,52.78,-85.51,52.76,52.0,52.72,104.52,52.7,-117.97,52.69,19.53,52.65,-65.45,52.64,72.06,52.59,124.58,52.57,-97.91,52.51,92.12,52.48,7.14,52.45,-77.85,52.43,59.66,52.39,112.18,52.37,-110.31,52.36,27.2,52.32,-57.79,52.31,79.72,52.28,-5.26,52.26,132.24,52.25,-90.25,52.23,47.26,52.18,99.78,52.17,-122.71,52.15,14.8,52.12,-70.19,52.11,67.32,52.06,119.84,52.04,-102.65,51.98,87.38,51.94,139.91,51.92,-82.59,51.9,54.92,51.86,107.45,51.84,-115.05,51.83,22.46,51.8,-62.52,51.78,74.98,51.73,127.51,51.72,-94.98,51.7,42.52,51.66,95.05,51.63,10.06,51.6,-74.92,51.58,62.59,51.53,115.11,51.52,-107.38,51.47,-54.86,51.46,82.65,51.43,-2.34,51.41,135.17,51.4,-87.32,51.38,50.19,51.34,102.71,51.32,-119.78,51.3,17.73,51.27,-67.26,51.26,70.25,51.21,122.77,51.2,-99.72,51.14,90.31,51.11,5.33,51.08,-79.66,51.06,57.85,51.02,110.37,51.0,-112.12,50.99,25.39,50.95,-59.6,50.94,77.91,50.91,-7.07,50.89,130.43,50.88,-92.06,50.86,45.45,50.82,97.97,50.8,-124.52,50.79,12.99,50.76,-72.0,50.74,65.51,50.7,118.04,50.68,-104.46,50.62,85.57,50.59,0.59,50.58,138.1,50.56,-84.39,50.55,53.11,50.5,105.64,50.49,-116.86,50.47,20.65,50.44,-64.33,50.43,73.18,50.38,125.7,50.37,-96.79,50.35,40.71,50.31,93.24,50.28,8.25,50.25,-76.73,50.23,60.78,50.19,113.3,50.17,-109.19,50.13,-56.67,50.11,80.84,50.08,-4.15,50.07,133.36,50.05,-89.13,50.04,48.38,49.99,100.9,49.98,-121.59,49.96,15.92,49.93,-69.07,49.92,68.44,49.88,120.96,49.86,-101.53,49.8,88.5,49.77,3.52,49.76,141.02,49.74,-81.47,49.73,56.04,49.68,108.56,49.67,-113.93,49.65,23.58,49.62,-61.41,49.61,76.1,49.57,128.63,49.55,-93.87,49.54,43.64,49.49,96.16,49.46,11.18,49.43,-73.8,49.42,63.7,49.37,116.23,49.36,-106.27,49.32,-53.74,49.3,83.77,49.27,-1.22,49.26,136.29,49.24,-86.2,49.23,51.3,49.18,103.83,49.17,-118.66,49.15,18.84,49.13,-66.14,49.11,71.37,49.07,123.89,49.05,-98.6,48.99,91.43,48.97,6.44,48.94,-78.54,48.92,58.97,48.88,111.49,48.86,-111.0,48.85,26.51,48.82,-58.48,48.81,79.03,48.76,131.55,48.75,-90.94,48.73,46.57,48.69,99.09,48.68,-123.4,48.66,14.11,48.63,-70.88,48.62,66.63,48.57,119.15,48.56,-103.34,48.5,86.69,48.46,139.22,48.44,-83.28,48.43,54.23,48.39,106.75,48.37,-115.74,48.36,21.77,48.33,-63.21,48.31,74.29,48.27,126.82,48.26,-95.68,48.24,41.83,48.2,94.36,48.17,9.37,48.14,-75.61,48.13,61.89,48.09,114.42,48.07,-108.07,48.03,-55.55,48.01,81.96,47.97,134.48,47.96,-88.01,47.94,49.5,47.9,102.02,47.89,-120.47,47.87,17.03,47.84,-67.95,47.83,69.56,47.79,122.08,47.77,-100.41,47.72,89.62,47.66,-80.35,47.64,57.16,47.6,109.68,47.59,-112.81,47.57,24.7,47.53,77.22,47.49,129.74,47.47,-92.75,47.46,44.76,47.42,97.28,47.39,12.3,47.36,-72.69,47.35,64.82,47.31,117.34,47.29,-105.15,47.23,84.88,47.19,137.41,47.18,-85.09,47.16,52.42,47.12,104.95,47.11,-117.55,47.09,19.96,47.07,-65.02,47.05,72.48,47.01,125.01,47.0,-97.48,46.98,40.02,46.94,92.55,46.88,-77.42,46.87,60.09,46.83,112.61,46.81,-109.88,46.76,80.15,46.72,132.67,46.7,-89.82,46.69,47.69,46.65,100.21,46.63,-122.28,46.62,15.23,46.59,-69.76,46.58,67.75,46.54,120.27,46.52,-102.22,46.47,87.81,46.41,-82.16,46.4,55.35,46.36,107.87,46.34,-114.62,46.33,22.89,46.29,75.41,46.25,127.93,46.23,-94.56,46.22,42.95,46.18,95.47,46.15,10.49,46.12,-74.5,46.11,63.01,46.07,115.54,46.05,-106.96,46.0,83.07,45.96,135.6,45.94,-86.89,45.93,50.61,45.89,103.14,45.87,-119.36,45.86,18.15,45.83,-66.83,45.82,70.68,45.78,123.2,45.76,-99.29,45.71,90.74,45.65,-79.23,45.64,58.28,45.6,110.8,45.59,-111.69,45.53,78.34,45.49,130.86,45.48,-91.63,45.46,45.88,45.42,98.4,45.4,13.42,45.37,-71.57,45.36,65.94,45.31,118.46,45.3,-104.03,45.25,86.0,45.19,-83.97,45.18,53.54,45.14,106.06,45.12,-116.43,45.11,21.08,45.07,73.6,45.03,126.13,45.02,-96.37,45.0,41.14,44.96,93.66,44.91,-76.3,44.89,61.2,44.85,113.73,44.84,-108.77,44.79,81.27,44.75,133.79,44.73,-88.7,44.72,48.8,44.68,101.33,44.67,-121.16,44.65,16.34,44.63,-68.64,44.61,68.87,44.57,121.39,44.56,-101.1,44.51,88.93,44.47,141.45,44.45,-81.04,44.44,56.47,44.4,108.99,44.38,-113.5,44.37,24.01,44.33,76.53,44.29,129.05,44.28,-93.44,44.26,44.07,44.22,96.59,44.2,11.61,44.17,-73.38,44.16,64.13,44.12,116.65,44.1,-105.84,44.05,84.19,44.0,-85.78,43.99,51.73,43.95,104.25,43.93,-118.24,43.92,19.27,43.88,71.79,43.84,124.32,43.83,-98.18,43.77,91.86,43.72,-78.11,43.71,59.39,43.67,111.92,43.65,-110.57,43.6,79.46,43.56,131.98,43.55,-90.51,43.54,47.0,43.5,99.52,43.48,-122.97,43.47,14.53,43.44,-70.45,43.43,67.06,43.39,119.58,43.38,-102.91,43.33,87.12,43.29,139.64,43.27,-82.85,43.26,54.66,43.22,107.18,43.21,-115.31,43.19,22.2,43.15,74.72,43.12,127.24,43.1,-95.25,43.09,42.26,43.05,94.78,43.02,9.8,43.0,-75.19,42.98,62.32,42.95,114.84,42.93,-107.65,42.88,82.38,42.85,-2.6,42.83,-87.59,42.82,49.92,42.78,102.45,42.76,-120.05,42.75,17.46,42.71,69.98,42.67,122.51,42.66,-99.98,42.61,90.05,42.56,-79.92,42.54,57.59,42.5,110.11,42.49,-112.38,42.48,25.12,42.44,77.65,42.41,-7.34,42.4,130.17,42.39,-92.32,42.37,45.19,42.34,97.71,42.31,12.73,42.28,-72.26,42.27,65.25,42.23,117.77,42.22,-104.72,42.17,85.31,42.14,0.33,42.12,-84.66,42.1,52.85,42.06,105.37,42.05,-117.12,42.04,20.39,42.0,72.91,41.96,125.43,41.95,-97.06,41.94,40.45,41.9,92.97,41.87,7.99,41.85,-77.0,41.83,60.51,41.8,113.04,41.78,-109.46,41.77,28.05,41.73,80.57,41.71,-4.41,41.68,-89.39,41.67,48.11,41.63,100.64,41.62,-121.86,41.6,15.65,41.57,68.18,41.53,120.7,41.51,-101.79,41.5,35.71,41.46,88.24,41.44,3.25,41.42,140.76,41.41,-81.73,41.4,55.78,41.36,108.3,41.35,-114.19,41.34,23.32,41.3,75.84,41.26,128.36,41.25,-94.13,41.23,43.38,41.2,95.9,41.17,10.92,41.15,-74.07,41.13,63.44,41.09,115.96,41.08,-106.53,41.07,30.98,41.03,83.5,41.01,-1.48,40.98,-86.47,40.97,51.04,40.93,103.56,40.92,-118.93,40.9,18.58,40.87,71.1,40.83,123.63,40.82,-98.87,40.8,38.64,40.77,91.16,40.74,6.18,40.72,-78.8,40.7,58.7,40.67,111.23,40.65,-111.27,40.64,26.24,40.6,78.77,40.58,-6.22,40.55,-91.2,40.54,46.3,40.5,98.83,40.49,-123.66,40.48,13.84,40.44,66.37,40.4,118.89,40.39,-103.6,40.38,33.91,40.34,86.43,40.31,1.44,40.3,138.95,40.29,-83.54,40.28,53.97,40.24,106.49,40.23,-116.0,40.21,21.51,40.18,74.03,40.14,126.55,40.13,-95.94,40.11,41.57,40.08,94.09,40.05,9.11,40.03,-75.88,40.01,61.63,39.98,114.15,39.96,-108.34,39.95,29.17,39.91,81.69,39.89,-3.29,39.86,-88.28,39.85,49.23,39.81,101.75,39.8,-120.74,39.79,16.77,39.75,69.29,39.72,121.82,39.7,-100.68,39.69,36.83,39.65,89.36,39.63,4.37,39.6,-80.61,39.59,56.89,39.55,109.42,39.54,-113.07,39.49,76.96,39.47,-8.03,39.44,-93.01,39.43,44.5,39.39,97.02,39.37,12.03,39.33,64.56,39.29,117.08,39.28,-105.41,39.27,32.1,39.23,84.62,39.21,-0.36,39.2,137.14,39.18,-85.35,39.17,52.16,39.13,104.68,39.12,-117.81,39.07,72.22,39.04,124.74,39.02,-97.75,39.01,39.76,38.97,92.28,38.95,7.3,38.92,-77.69,38.91,59.82,38.88,112.34,38.86,-110.15,38.81,79.88,38.79,-5.1,38.77,-90.09,38.75,47.42,38.72,99.95,38.7,-122.55,38.69,14.96,38.66,67.48,38.62,120.01,38.61,-102.48,38.59,35.02,38.56,87.55,38.53,2.56,38.52,140.07,38.51,-82.42,38.5,55.09,38.46,107.61,38.45,-114.88,38.4,75.15,38.35,-94.82,38.34,42.69,38.3,95.21,38.28,10.23,38.25,-74.76,38.24,62.75,38.2,115.27,38.19,-107.22,38.18,30.29,38.14,82.81,38.12,-2.17,38.11,135.33,38.1,-87.16,38.08,50.35,38.05,102.87,38.03,-119.62,37.99,70.41,37.95,122.93,37.94,-99.56,37.93,37.95,37.89,90.47,37.86,5.49,37.84,-79.5,37.83,58.01,37.79,110.54,37.78,-111.96,37.73,78.07,37.71,-6.91,37.68,-91.89,37.67,45.61,37.64,98.14,37.58,65.68,37.54,118.2,37.53,-104.29,37.51,33.21,37.48,85.74,37.45,0.75,37.44,138.26,37.43,-84.23,37.42,53.28,37.38,105.8,37.37,-116.69,37.32,73.34,37.27,-96.63,37.26,40.88,37.23,93.4,37.18,-76.57,37.17,60.94,37.13,113.46,37.12,-109.03,37.11,28.48,37.07,81.0,37.05,-3.98,37.02,-88.97,37.01,48.54,36.98,101.06,36.96,-121.43,36.92,68.6,36.88,121.13,36.87,-101.37,36.86,36.14,36.82,88.66,36.77,-81.3,36.76,56.2,36.72,108.73,36.71,-113.77,36.66,76.27,36.62,-93.7,36.61,43.8,36.57,96.33,36.51,63.87,36.47,116.39,36.46,-106.1,36.45,31.41,36.42,83.93,36.39,-1.06,36.38,136.45,36.37,-86.04,36.36,51.47,36.32,103.99,36.31,-118.5,36.26,71.53,36.21,-98.44,36.2,39.07,36.17,91.59,36.12,-78.38,36.11,59.13,36.07,111.65,36.06,-110.84,36.01,79.19,35.97,-90.78,35.95,46.73,35.92,99.25,35.86,66.79,35.82,119.32,35.81,-103.18,35.8,34.33,35.77,86.86,35.72,-83.11,35.71,54.39,35.67,106.92,35.66,-115.57,35.61,74.46,35.57,-95.51,35.55,42.0,35.52,94.52,35.46,62.06,35.42,114.58,35.41,-107.91,35.37,82.12,35.33,134.64,35.32,-87.85,35.31,49.66,35.27,102.18,35.26,-120.31,35.21,69.72,35.17,-100.25,35.16,37.26,35.12,89.78,35.07,-80.19,35.06,57.32,35.03,109.84,35.02,-112.65,34.97,77.38,34.92,-92.59,34.91,44.92,34.88,97.45,34.82,64.98,34.78,117.51,34.77,-104.98,34.72,85.05,34.7,0.06,34.68,-84.92,34.67,52.59,34.63,105.11,34.62,-117.38,34.57,72.65,34.53,-97.32,34.52,40.19,34.48,92.71,34.46,7.73,34.39,112.77,34.38,-109.72,34.33,80.31,34.3,132.83,34.28,-89.66,34.27,47.85,34.24,100.37,34.18,67.91,34.15,120.43,34.13,-102.06,34.09,87.97,34.06,2.99,34.04,-82.0,34.03,55.51,34.0,108.04,33.98,-114.46,33.94,75.57,33.89,-94.39,33.88,43.11,33.85,95.64,33.82,10.65,33.79,63.18,33.75,115.7,33.74,-106.79,33.7,83.24,33.67,-1.75,33.65,-86.73,33.64,50.78,33.6,103.3,33.59,-119.19,33.55,70.84,33.5,-99.13,33.46,90.9,33.43,5.92,33.41,-79.07,33.4,58.44,33.36,110.96,33.35,-111.53,33.31,78.5,33.27,131.03,33.26,-91.47,33.25,46.04,33.22,98.56,33.16,66.1,33.12,118.63,33.11,-103.87,33.07,86.16,33.04,1.18,33.02,-83.8,33.01,53.7,32.98,106.23,32.97,-116.27,32.92,73.77,32.87,-96.2,32.86,41.3,32.83,93.83,32.81,8.84,32.74,113.89,32.73,-108.6,32.68,81.43,32.66,-3.56,32.64,-88.54,32.62,48.97,32.59,101.49,32.53,69.03,32.49,-100.94,32.44,89.09,32.42,4.11,32.4,-80.88,32.39,56.63,32.35,109.15,32.34,-113.34,32.3,76.69,32.25,-93.28,32.24,44.23,32.21,96.75,32.18,11.77,32.12,116.82,32.1,-105.68,32.06,84.36,32.04,-0.63,32.01,-85.61,32.0,51.89,31.97,104.42,31.91,71.96,31.87,-98.01,31.82,92.02,31.8,7.03,31.77,59.56,31.73,112.08,31.72,-110.41,31.68,79.62,31.65,-5.36,31.63,-90.35,31.62,47.16,31.59,99.68,31.56,14.7,31.53,67.22,31.5,119.74,31.49,-102.75,31.44,87.28,31.42,2.3,31.4,-82.69,31.39,54.82,31.35,107.34,31.34,-115.15,31.3,74.88,31.25,-95.09,31.21,94.95,31.18,9.96,31.12,115.01,31.11,-107.48,31.06,82.55,31.04,-2.44,31.02,-87.42,31.01,50.09,30.97,102.61,30.95,17.62,30.92,70.15,30.87,-99.82,30.83,90.21,30.81,5.23,30.77,57.75,30.74,110.27,30.73,-112.22,30.72,25.29,30.68,77.81,30.66,-7.17,30.64,-92.16,30.63,45.35,30.59,97.87,30.57,12.89,30.51,117.94,30.49,-104.56,30.45,85.47,30.43,0.49,30.41,-84.5,30.4,53.01,30.36,105.54,30.34,20.55,30.31,73.07,30.26,-96.89,30.22,93.14,30.2,8.15,30.13,113.2,30.12,-109.29,30.11,28.21,30.07,80.74,30.05,-4.25,30.03,-89.23,30.02,48.28,29.99,100.8,29.96,15.82,29.93,68.34,29.89,-101.63,29.84,88.4,29.82,3.42,29.8,-81.57,29.79,55.94,29.75,108.46,29.74,-114.03,29.73,23.48,29.7,76.0,29.68,-8.98,29.66,-93.97,29.64,43.54,29.61,96.06,29.59,11.08,29.52,116.13,29.51,-106.37,29.5,31.14,29.47,83.66,29.45,-1.32,29.41,51.2,29.38,103.73,29.36,18.74,29.33,71.27,29.28,-98.7,29.24,91.33,29.22,6.34,29.15,111.39,29.14,-111.1,29.13,26.41,29.1,78.93,29.08,-6.06,29.05,-91.04,29.04,46.47,29.01,98.99,28.99,14.01,28.91,-103.44,28.87,86.59,28.85,1.61,28.82,-83.38,28.81,54.13,28.78,106.65,28.76,21.67,28.7,-10.79,28.68,-95.78,28.67,41.73,28.64,94.25,28.62,9.27,28.55,114.32,28.54,-108.18,28.53,29.33,28.5,81.86,28.48,-3.13,28.44,49.39,28.41,101.92,28.39,16.93,28.31,-100.51,28.27,89.52,28.25,4.53,28.18,109.58,28.17,-112.91,28.16,24.6,28.13,77.12,28.11,-7.86,28.07,44.66,28.04,97.18,28.02,12.2,27.96,117.24,27.94,-105.25,27.93,32.26,27.9,84.78,27.88,-0.2,27.82,104.84,27.79,19.86,27.72,-97.59,27.71,39.92,27.67,92.45,27.65,7.46,27.59,112.51,27.58,-109.98,27.57,27.52,27.53,80.05,27.51,-4.94,27.48,47.59,27.45,100.11,27.43,15.12,27.35,-102.32,27.31,87.71,27.29,2.73,27.27,-82.26,27.22,107.77,27.2,22.79,27.17,75.31,27.15,-9.67,27.12,42.85,27.08,95.37,27.06,10.39,27.0,115.44,26.99,-107.06,26.98,30.45,26.94,82.97,26.92,-2.01,26.86,103.04,26.84,18.05,26.76,-99.39,26.75,38.11,26.72,90.64,26.7,5.65,26.63,110.7,26.61,25.71,26.58,78.24,26.56,-6.75,26.53,45.78,26.5,98.3,26.47,13.32,26.41,118.36,26.4,-104.13,26.39,33.38,26.36,85.9,26.34,0.92,26.27,105.96,26.25,20.98,26.2,-11.48,26.16,41.04,26.13,93.56,26.11,8.58,26.05,113.63,26.04,-108.87,26.03,28.64,25.99,81.16,25.97,-3.82,25.94,48.7,25.91,101.23,25.89,16.24,25.81,-101.2,25.8,36.3,25.77,88.83,25.75,3.84,25.73,-81.14,25.72,56.37,25.69,108.89,25.67,23.91,25.63,76.43,25.61,-8.56,25.58,43.97,25.55,96.49,25.53,11.51,25.46,116.55,25.45,-105.94,25.44,31.57,25.41,84.09,25.39,-0.89,25.33,104.15,25.31,19.17,25.25,-13.29,25.23,-98.28,25.22,39.23,25.19,91.75,25.17,6.77,25.11,111.82,25.08,26.83,25.05,79.36,25.03,-5.63,25.0,46.89,24.97,99.42,24.95,14.43,24.87,-103.01,24.83,87.02,24.81,2.03,24.78,54.56,24.75,107.08,24.73,22.1,24.67,-10.36,24.64,42.16,24.61,94.68,24.59,9.7,24.53,114.74,24.51,29.76,24.47,82.28,24.45,-2.7,24.42,49.82,24.39,102.34,24.37,17.36,24.3,-100.09,24.29,37.42,24.25,89.95,24.23,4.96,24.17,110.01,24.15,25.02,24.12,77.55,24.1,-7.44,24.07,45.09,24.03,97.61,24.01,12.62,23.95,117.67,23.94,-104.82,23.93,32.69,23.9,85.21,23.88,0.23,23.85,52.75,23.81,105.27,23.79,20.29,23.74,-12.17,23.72,-97.16,23.71,40.35,23.68,92.87,23.66,7.89,23.6,112.94,23.58,27.95,23.54,80.47,23.52,-4.51,23.49,48.01,23.46,100.54,23.44,15.55,23.37,-101.89,23.36,35.61,23.33,88.14,23.3,3.15,23.27,55.68,23.24,108.2,23.22,23.21,23.19,75.74,23.17,-9.25,23.14,43.28,23.11,95.8,23.09,10.82,23.02,115.86,23.0,30.88,22.97,83.4,22.95,-1.58,22.92,50.94,22.89,103.46,22.87,18.48,22.82,-13.98,22.8,-98.97,22.79,38.54,22.75,91.06,22.73,6.08,22.67,111.13,22.65,26.14,22.62,78.66,22.6,-6.32,22.57,46.2,22.54,98.73,22.52,13.74,22.45,118.79,22.44,-103.7,22.43,33.8,22.4,86.33,22.38,1.34,22.35,53.87,22.32,106.39,22.3,21.41,22.27,73.93,22.25,-11.06,22.22,41.47,22.19,93.99,22.17,9.01,22.1,114.05,22.08,29.07,22.05,81.59,22.03,-3.39,22.0,49.13,21.97,101.65,21.95,16.67,21.9,-15.79,21.88,-100.78,21.87,36.73,21.82,4.27,21.78,56.79,21.75,109.32,21.73,24.33,21.7,76.86,21.68,-8.13,21.65,44.39,21.62,96.92,21.6,11.93,21.54,116.98,21.52,32.0,21.49,84.52,21.47,-0.47,21.44,52.06,21.4,104.58,21.38,19.6,21.33,-12.86,21.31,-97.85,21.3,39.66,21.27,92.18,21.25,7.2,21.23,-77.79,21.19,112.24,21.17,27.26,21.14,79.78,21.12,-5.2,21.09,47.32,21.06,99.85,21.04,14.86,20.97,119.91,20.96,-102.59,20.95,34.92,20.9,2.46,20.87,54.98,20.84,107.51,20.82,22.52,20.79,75.05,20.77,-9.94,20.74,42.59,20.71,95.11,20.69,10.12,20.63,115.17,20.61,30.19,20.58,82.71,20.56,-2.27,20.52,50.25,20.49,102.77,20.47,17.79,20.42,-14.67,20.4,-99.66,20.39,37.85,20.34,5.39,20.32,-79.6,20.28,110.44,20.26,25.45,20.23,77.97,20.21,-7.01,20.18,45.51,20.15,98.04,20.13,13.05,20.07,118.1,20.05,33.11,20.02,85.64,20.0,0.65,19.96,53.18,19.93,105.7,19.91,20.71,19.88,73.24,19.86,-11.75,19.84,-96.73,19.83,40.78,19.8,93.3,19.78,8.32,19.72,113.36,19.7,28.38,19.67,80.9,19.65,-4.08,19.62,48.44,19.59,100.96,19.57,15.98,19.52,-16.48,19.51,121.03,19.5,-101.47,19.49,36.04,19.44,3.58,19.38,108.63,19.36,23.64,19.33,76.16,19.31,-8.82,19.28,43.7,19.25,96.23,19.22,11.24,19.16,116.29,19.14,31.3,19.11,83.83,19.09,-1.16,19.06,51.37,19.03,103.89,19.01,18.91,18.96,-13.56,18.94,-98.54,18.93,38.97,18.88,6.51,18.82,111.55,18.8,26.57,18.77,79.09,18.75,-5.89,18.72,46.63,18.69,99.15,18.67,14.17,18.65,-70.81,18.61,119.22,18.59,34.23,18.54,1.77,18.51,54.29,18.48,106.82,18.46,21.83,18.43,74.36,18.41,-10.63,18.39,-95.61,18.38,41.89,18.35,94.42,18.33,9.43,18.27,114.48,18.25,29.5,18.22,82.02,18.2,-2.97,18.17,49.56,18.14,102.08,18.12,17.1,18.07,-15.36,18.04,37.16,17.99,4.7,17.93,109.74,17.91,24.76,17.88,77.28,17.85,-7.7,17.82,44.82,17.79,97.35,17.77,12.36,17.75,-72.62,17.71,117.41,17.69,32.42,17.64,-0.04,17.61,52.48,17.58,105.01,17.56,20.02,17.53,72.55,17.51,-12.44,17.48,40.09,17.43,7.62,17.37,112.67,17.35,27.69,17.32,80.21,17.3,-4.77,17.27,47.75,17.24,100.27,17.22,15.29,17.2,-69.7,17.16,120.33,17.14,35.35,17.09,2.89,17.03,107.94,17.01,22.95,16.98,75.47,16.96,-9.51,16.93,43.01,16.9,95.54,16.88,10.55,16.82,115.6,16.8,30.61,16.77,83.14,16.75,-1.85,16.72,50.68,16.69,103.2,16.67,18.21,16.63,-14.25,16.62,123.26,16.6,38.28,16.55,5.82,16.49,110.86,16.47,25.88,16.44,78.4,16.42,-6.58,16.39,45.94,16.36,98.46,16.34,13.48,16.28,118.53,16.26,33.54,16.21,1.08,16.15,106.13,16.13,21.14,16.1,73.66,16.08,-11.32,16.05,41.2,16.0,8.74,15.94,113.79,15.92,28.8,15.89,81.33,15.87,-3.66,15.84,48.87,15.81,101.39,15.79,16.41,15.73,121.45,15.71,36.47,15.66,4.01,15.6,109.05,15.58,24.07,15.55,76.59,15.53,-8.39,15.5,44.13,15.47,96.65,15.45,11.67,15.39,116.72,15.37,31.73,15.32,-0.73,15.29,51.79,15.26,104.32,15.24,19.33,15.2,-13.13,15.19,124.38,15.17,39.39,15.12,6.93,15.06,111.98,15.04,27.0,15.01,79.52,14.99,-5.47,14.96,47.06,14.93,99.58,14.91,14.6,14.85,119.64,14.83,34.66,14.78,2.2,14.72,107.24,14.7,22.26,14.67,74.78,14.65,-10.2,14.62,42.32,14.57,9.86,14.51,114.91,14.49,29.92,14.46,82.45,14.44,-2.54,14.41,49.98,14.39,102.51,14.37,17.52,14.31,122.57,14.29,37.59,14.24,5.12,14.18,110.17,14.16,25.19,14.13,77.71,14.11,-7.27,14.08,45.25,14.05,97.77,14.03,12.79,13.97,117.83,13.95,32.85,13.9,0.39,13.84,105.44,13.82,20.45,13.79,72.97,13.77,-12.01,13.76,125.5,13.75,40.51,13.7,8.05,13.64,113.1,13.62,28.11,13.59,80.64,13.57,-4.35,13.54,48.18,13.51,100.7,13.49,15.71,13.43,120.76,13.41,35.78,13.36,3.32,13.3,108.36,13.28,23.38,13.25,75.9,13.23,-9.08,13.2,43.44,13.16,10.98,13.1,116.03,13.08,31.04,13.03,-1.42,12.97,103.63,12.95,18.64,12.89,123.69,12.87,38.7,12.82,6.24,12.76,111.29,12.74,26.3,12.72,78.83,12.7,-6.16,12.67,46.37,12.64,98.89,12.62,13.91,12.56,118.95,12.54,33.97,12.49,1.51,12.43,106.55,12.41,21.57,12.38,74.09,12.36,-10.89,12.33,41.63,12.28,9.17,12.23,114.22,12.21,29.23,12.16,-3.23,12.1,101.82,12.08,16.83,12.02,121.88,12.0,36.89,11.95,4.43,11.89,109.48,11.87,24.5,11.85,77.02,11.83,-7.97,11.8,44.56,11.75,12.1,11.69,117.14,11.67,32.16,11.62,-0.3,11.56,104.74,11.54,19.76,11.48,124.81,11.46,39.82,11.42,7.36,11.36,112.41,11.34,27.42,11.31,79.95,11.29,-5.04,11.26,47.48,11.23,100.01,11.21,15.02,11.15,120.07,11.13,35.09,11.09,2.62,11.03,107.67,11.01,22.69,10.98,75.21,10.96,-9.77,10.93,42.75,10.88,10.29,10.86,-74.7,10.82,115.33,10.8,30.35,10.75,-2.11,10.7,102.94,10.68,17.95,10.62,123.0,10.6,38.01,10.55,5.55,10.49,110.6,10.47,25.61,10.44,78.14,10.42,-6.85,10.39,45.68,10.37,98.2,10.35,13.21,10.33,-71.77,10.29,118.26,10.27,33.28,10.22,0.82,10.16,105.86,10.14,20.88,10.08,125.92,10.06,40.94,10.02,8.48,9.96,113.53,9.94,28.54,9.89,-3.92,9.83,101.13,9.81,16.14,9.79,-68.84,9.75,121.19,9.74,36.2,9.69,3.74,9.63,108.79,9.61,23.8,9.58,76.33,9.56,-8.66,9.55,128.85,9.53,43.87,9.48,11.41,9.46,-73.58,9.43,116.45,9.41,31.47,9.36,-0.99,9.3,104.05,9.28,19.07,9.26,-65.92,9.22,124.12,9.2,39.13,9.15,6.67,9.1,111.72,9.08,26.73,9.03,-5.73,9.02,131.78,9.0,46.79,8.97,99.32,8.95,14.33,8.93,-70.65,8.89,119.38,8.87,34.39,8.83,1.93,8.77,106.98,8.75,22.0,8.73,-62.99,8.69,127.04,8.67,42.06,8.62,9.6,8.6,-75.39,8.56,114.64,8.55,29.66,8.5,-2.8,8.44,102.24,8.42,17.26,8.4,-67.72,8.36,122.31,8.34,37.32,8.29,4.86,8.24,109.91,8.22,24.92,8.2,-60.06,8.16,129.97,8.14,44.98,8.09,12.52,8.07,-72.46,8.03,117.57,8.01,32.59,7.97,0.12,7.91,105.17,7.89,20.19,7.87,-64.8,7.83,125.23,7.81,40.25,7.76,7.79,7.74,-77.2,7.71,112.83,7.69,27.85,7.64,-4.61,7.63,132.9,7.58,100.44,7.56,15.45,7.54,-69.53,7.5,120.5,7.48,35.51,7.44,3.05,7.38,108.1,7.36,23.11,7.34,-61.87,7.3,128.16,7.28,43.18,7.23,10.71,7.22,-74.27,7.18,115.76,7.16,30.78,7.11,-1.68,7.1,135.82,7.05,103.36,7.03,18.38,7.01,-66.61,6.97,123.42,6.96,38.44,6.91,5.98,6.85,111.03,6.83,26.04,6.81,-58.94,6.77,131.09,6.71,13.64,6.69,-71.34,6.65,118.69,6.63,33.7,6.58,1.24,6.52,106.29,6.5,21.3,6.48,-63.68,6.45,126.35,6.43,41.37,6.38,8.91,6.36,-76.08,6.32,113.95,6.3,28.97,6.25,-3.49,6.24,134.01,6.2,101.55,6.18,16.57,6.16,-68.42,6.12,121.62,6.1,36.63,6.05,4.17,5.99,109.22,5.97,24.23,5.96,-60.75,5.92,129.28,5.9,44.29,5.85,11.83,5.83,-73.15,5.79,116.88,5.77,31.89,5.73,-0.57,5.72,136.94,5.67,104.48,5.65,19.5,5.63,-65.49,5.59,124.54,5.57,39.56,5.52,7.1,5.5,-77.89,5.47,112.14,5.45,27.16,5.43,-57.83,5.39,132.21,5.32,14.76,5.3,-70.22,5.26,119.81,5.25,34.82,5.2,2.36,5.14,107.41,5.12,22.42,5.1,-62.56,5.06,127.47,5.04,42.48,5.0,10.02,4.98,-74.96,4.94,115.07,4.92,30.09,4.9,-54.9,4.86,135.13,4.81,102.67,4.79,17.69,4.78,-67.3,4.74,122.73,4.72,37.75,4.61,110.33,4.59,25.35,4.57,-59.63,4.54,130.4,4.47,12.95,4.45,-72.03,4.41,118.0,4.39,33.01,4.37,-51.97,4.34,138.06,4.29,105.6,4.27,20.61,4.25,-64.37,4.21,125.66,4.19,40.68,4.12,-76.77,4.09,113.26,4.07,28.28,4.05,-56.71,4.01,133.32,3.94,15.88,3.92,-69.11,3.89,120.92,3.87,35.94,3.76,108.53,3.74,23.54,3.72,-61.44,3.68,128.59,3.66,43.6,3.62,11.14,3.6,-73.84,3.56,116.19,3.54,31.2,3.52,-53.78,3.48,136.25,3.44,103.79,3.42,18.8,3.4,-66.18,3.36,123.85,3.34,38.87,3.27,-78.58,3.23,111.45,3.22,26.47,3.2,-58.52,3.16,131.51,3.09,14.07,3.07,-70.92,3.03,119.12,3.01,34.13,3.0,-50.85,2.96,139.18,2.91,106.72,2.89,21.73,2.87,-63.25,2.83,126.78,2.81,41.79,2.75,-75.65,2.71,114.38,2.69,29.39,2.67,-55.59,2.63,134.44,2.58,101.98,2.57,17.0,2.55,-67.99,2.51,122.04,2.49,37.06,2.38,109.64,2.36,24.66,2.35,-60.33,2.31,129.71,2.24,12.26,2.22,-72.72,2.18,117.31,2.16,32.32,2.14,-52.66,2.11,137.37,2.06,104.91,2.04,19.92,2.02,-65.06,1.98,124.97,1.96,39.98,1.9,-77.46,1.86,112.57,1.84,27.59,1.82,-57.4,1.78,132.63,1.71,15.19,1.7,-69.8,1.66,120.23,1.64,35.25,1.62,-49.74,1.53,107.83,1.51,22.85,1.49,-62.13,1.46,127.9,1.44,42.91,1.39,10.45,1.37,-74.53,1.33,115.5,1.31,30.51,1.29,-54.47,1.26,135.56,1.21,103.1,1.19,18.11,1.17,-66.87,1.13,123.16,1.11,38.18,1.05,-79.27,1.01,110.76,0.99,25.78,0.97,-59.21,0.93,130.82,0.86,13.38,0.85,-71.61,0.81,118.42,0.79,33.44,0.77,-51.54,0.68,106.03,0.66,21.04,0.64,-63.94,0.61,126.09,0.59,41.1,0.52,-76.34,0.48,113.69,0.46,28.7,0.44,-56.28,0.41,133.75,0.36,101.29,0.34,16.3,0.32,-68.68,0.28,121.35,0.26,36.37,0.24,-48.62,0.16,108.95,0.14,23.97,0.12,-61.02,0.08,129.01,0.01,11.57,-0.0,-73.42,-0.04,116.62,-0.06,31.63,-0.08,-53.35,-0.17,104.22,-0.19,19.23,-0.21,-65.75,-0.24,124.28,-0.26,39.29,-0.33,-78.15,-0.37,111.88,-0.39,26.89,-0.41,-58.09,-0.44,131.94,-0.49,99.48,-0.51,14.5,-0.53,-70.49,-0.57,119.54,-0.59,34.56,-0.61,-50.43,-0.69,107.14,-0.71,22.16,-0.73,-62.83,-0.77,127.21,-0.79,42.22,-0.85,-75.22,-0.89,114.81,-0.91,29.82,-0.93,-55.16,-1.02,102.41,-1.04,17.42,-1.06,-67.56,-1.09,122.47,-1.11,37.48,-1.13,-47.5,-1.22,110.07,-1.24,25.09,-1.26,-59.9,-1.29,130.13,-1.36,12.69,-1.38,-72.3,-1.42,117.73,-1.44,32.75,-1.46,-52.24,-1.56,20.35,-1.58,-64.63,-1.62,125.4,-1.64,40.41,-1.7,-77.03,-1.74,113.0,-1.76,28.01,-1.78,-56.97,-1.82,133.06,-1.87,100.6,-1.89,15.61,-1.91,-69.37,-1.94,120.66,-1.96,35.68,-1.98,-49.31,-2.07,108.26,-2.09,23.28,-2.11,-61.71,-2.14,128.32,-2.18,-41.65,-2.21,10.88,-2.23,-74.11,-2.27,115.92,-2.29,30.94,-2.31,-54.04,-2.35,135.99,-2.39,103.53,-2.41,18.54,-2.43,-66.44,-2.47,123.59,-2.49,38.6,-2.51,-46.38,-2.56,-78.84,-2.59,111.19,-2.61,26.2,-2.63,-58.78,-2.67,131.25,-2.72,98.79,-2.74,13.8,-2.76,-71.18,-2.79,118.85,-2.81,33.87,-2.83,-51.12,-2.87,138.91,-2.94,21.47,-2.96,-63.52,-3.0,126.51,-3.01,41.53,-3.03,-43.45,-3.08,-75.92,-3.12,114.12,-3.14,29.13,-3.16,-55.85,-3.2,134.18,-3.24,101.72,-3.26,16.73,-3.28,-68.25,-3.32,121.78,-3.34,36.79,-3.36,-48.19,-3.44,109.38,-3.46,24.39,-3.48,-60.59,-3.52,129.44,-3.56,-40.53,-3.57,96.98,-3.59,12.0,-3.61,-72.99,-3.65,117.04,-3.66,32.06,-3.68,-52.93,-3.72,137.1,-3.79,19.66,-3.81,-65.33,-3.85,124.71,-3.87,39.72,-3.89,-45.26,-3.93,-77.72,-3.97,112.31,-3.99,27.32,-4.01,-57.66,-4.05,132.37,-4.1,99.91,-4.11,14.92,-4.13,-70.06,-4.17,119.97,-4.19,34.98,-4.21,-50.0,-4.25,140.03,-4.32,22.59,-4.34,-62.4,-4.37,127.63,-4.41,-42.34,-4.46,-74.8,-4.5,115.23,-4.52,30.25,-4.54,-54.74,-4.57,135.3,-4.64,17.85,-4.66,-67.13,-4.7,122.9,-4.72,37.91,-4.74,-47.07,-4.78,142.96,-4.82,110.5,-4.84,25.51,-4.86,-59.47,-4.94,-39.41,-4.95,98.1,-4.97,13.11,-4.99,-71.87,-5.03,118.16,-5.04,33.18,-5.06,-51.81,-5.1,138.22,-5.17,20.78,-5.19,-64.21,-5.23,125.82,-5.25,40.84,-5.26,-44.15,-5.31,-76.61,-5.35,113.42,-5.37,28.44,-5.39,-56.54,-5.43,133.49,-5.49,16.04,-5.51,-68.94,-5.55,121.09,-5.57,36.1,-5.59,-48.88,-5.63,141.15,-5.7,23.7,-5.72,-61.28,-5.79,-41.22,-5.84,-73.68,-5.88,116.35,-5.9,31.37,-5.92,-53.62,-5.96,136.41,-6.02,18.97,-6.04,-66.02,-6.08,124.01,-6.1,39.03,-6.12,-45.95,-6.16,144.08,-6.21,111.62,-6.22,26.63,-6.24,-58.35,-6.32,-38.29,-6.35,14.23,-6.37,-70.75,-6.41,119.28,-6.43,34.29,-6.45,-50.69,-6.48,139.34,-6.55,21.89,-6.57,-63.09,-6.63,41.96,-6.65,-43.03,-6.69,147.0,-6.7,-75.49,-6.73,114.54,-6.75,29.56,-6.77,-55.43,-6.88,17.16,-6.9,-67.83,-6.94,122.21,-6.96,37.22,-6.97,-47.76,-7.01,142.27,-7.08,24.82,-7.1,-60.16,-7.18,-40.1,-7.22,-72.56,-7.26,117.47,-7.28,32.48,-7.3,-52.5,-7.34,137.53,-7.41,20.09,-7.43,-64.9,-7.47,125.13,-7.48,40.15,-7.5,-44.84,-7.54,145.19,-7.61,27.75,-7.63,-57.24,-7.71,-37.17,-7.74,15.35,-7.75,-69.63,-7.79,120.4,-7.81,35.41,-7.83,-49.57,-7.87,140.46,-7.94,23.01,-7.96,-61.97,-8.03,-41.91,-8.08,-74.37,-8.12,115.66,-8.14,30.68,-8.16,-54.31,-8.27,18.28,-8.28,-66.71,-8.32,123.32,-8.34,38.34,-8.36,-46.65,-8.4,143.39,-8.47,25.94,-8.49,-59.04,-8.56,-38.98,-8.59,13.54,-8.61,-71.44,-8.65,118.59,-8.67,33.6,-8.69,-51.38,-8.8,21.2,-8.82,-63.78,-8.87,41.27,-8.89,-43.72,-9.0,28.87,-9.02,-56.12,-9.1,-36.06,-9.13,16.47,-9.14,-68.52,-9.18,121.51,-9.2,36.53,-9.22,-48.45,-9.33,24.13,-9.35,-60.85,-9.43,-40.79,-9.47,-73.25,-9.53,31.79,-9.55,-53.19,-9.66,19.39,-9.68,-65.59,-9.74,39.46,-9.75,-45.53,-9.86,27.06,-9.88,-57.93,-9.96,-37.86,-9.99,14.66,-10.01,-70.33,-10.06,34.72,-10.08,-50.26,-10.19,22.32,-10.21,-62.66,-10.27,42.38,-10.29,-42.6,-10.39,29.99,-10.41,-55.0,-10.52,17.59,-10.54,-67.4,-10.6,37.65,-10.62,-47.34,-10.73,25.25,-10.74,-59.74,-10.82,-39.67,-10.87,-72.13,-10.93,32.91,-10.95,-52.07,-11.06,20.51,-11.08,-64.47,-11.13,40.58,-11.15,-44.41,-11.26,28.18,-11.28,-56.81,-11.36,-36.75,-11.39,15.78,-11.41,-69.21,-11.46,35.84,-11.48,-49.15,-11.52,140.89,-11.59,23.44,-11.61,-61.54,-11.69,-41.48,-11.8,31.1,-11.82,-53.88,-11.85,136.15,-11.92,18.7,-11.94,-66.28,-12.0,38.77,-12.02,-46.22,-12.13,26.37,-12.15,-58.62,-12.19,131.41,-12.23,-38.56,-12.26,13.97,-12.27,-71.02,-12.33,34.03,-12.35,-50.95,-12.39,139.08,-12.46,21.63,-12.48,-63.35,-12.54,41.69,-12.56,-43.29,-12.67,29.29,-12.69,-55.69,-12.72,134.34,-12.79,16.89,-12.81,-68.09,-12.87,36.96,-12.89,-48.03,-12.93,142.0,-13.0,24.56,-13.02,-60.43,-13.06,129.6,-13.08,44.62,-13.1,-40.36,-13.2,32.22,-13.22,-52.76,-13.26,137.27,-13.33,19.82,-13.35,-65.16,-13.41,39.88,-13.43,-45.1,-13.54,27.49,-13.56,-57.5,-13.6,132.53,-13.67,15.09,-13.69,-69.9,-13.75,35.15,-13.76,-49.84,-13.8,140.19,-13.87,22.75,-13.89,-62.24,-13.93,127.8,-13.97,-42.17,-14.08,30.41,-14.1,-54.57,-14.14,135.46,-14.21,18.01,-14.23,-66.97,-14.29,38.08,-14.31,-46.91,-14.35,143.12,-14.41,25.68,-14.43,-59.31,-14.47,130.72,-14.49,45.74,-14.51,-39.25,-14.54,13.28,-14.62,33.34,-14.64,-51.65,-14.68,138.39,-14.75,20.94,-14.77,-64.04,-14.81,125.99,-14.85,-43.98,-14.96,28.6,-14.98,-56.38,-15.02,133.65,-15.04,48.67,-15.09,16.2,-15.11,-68.78,-15.17,36.27,-15.19,-48.72,-15.22,141.31,-15.29,23.87,-15.31,-61.12,-15.35,128.91,-15.37,43.93,-15.39,-41.06,-15.5,31.53,-15.52,-53.45,-15.56,136.58,-15.63,19.13,-15.65,-65.85,-15.71,39.19,-15.73,-45.79,-15.77,144.24,-15.84,26.79,-15.86,-58.19,-15.9,131.84,-15.92,46.86,-15.97,14.39,-15.99,-70.59,-16.05,34.46,-16.07,-50.53,-16.11,139.5,-16.18,22.06,-16.2,-62.93,-16.24,127.1,-16.28,-42.86,-16.39,29.72,-16.41,-55.26,-16.45,134.77,-16.47,49.78,-16.52,17.32,-16.54,-67.66,-16.6,37.38,-16.62,-47.6,-16.65,142.43,-16.72,24.99,-16.74,-60.0,-16.78,130.03,-16.8,45.05,-16.82,-39.94,-16.85,12.59,-16.93,32.65,-16.95,-52.34,-16.99,137.69,-17.06,20.25,-17.08,-64.74,-17.12,125.3,-17.16,-44.67,-17.27,27.91,-17.29,-57.07,-17.33,132.96,-17.35,47.97,-17.4,15.51,-17.42,-69.47,-17.48,35.58,-17.5,-49.41,-17.54,140.62,-17.61,23.18,-17.63,-61.81,-17.67,128.22,-17.69,43.24,-17.71,-41.75,-17.82,30.84,-17.84,-54.15,-17.89,135.89,-17.96,18.44,-17.98,-66.54,-18.02,123.49,-18.06,-46.48,-18.1,143.55,-18.17,26.1,-18.19,-58.88,-18.23,131.15,-18.25,46.17,-18.3,13.7,-18.38,33.77,-18.4,-51.22,-18.44,138.81,-18.51,21.37,-18.53,-63.62,-18.57,126.41,-18.61,-43.56,-18.72,29.03,-18.74,-55.95,-18.78,134.08,-18.8,49.09,-18.85,16.63,-18.87,-68.35,-18.91,121.68,-18.93,36.69,-18.95,-48.29,-18.99,141.74,-19.06,24.29,-19.08,-60.69,-19.12,129.34,-19.14,44.36,-19.16,-40.63,-19.28,31.96,-19.3,-53.03,-19.34,137.0,-19.41,19.56,-19.43,-65.43,-19.47,124.6,-19.51,-45.36,-19.55,144.67,-19.62,27.22,-19.64,-57.76,-19.68,132.27,-19.7,47.28,-19.75,14.82,-19.83,34.88,-19.85,-50.1,-19.89,139.93,-19.96,22.49,-19.99,-62.5,-20.03,127.53,-20.07,-42.44,-20.18,30.15,-20.2,-54.84,-20.24,135.19,-20.31,17.75,-20.33,-67.24,-20.37,122.8,-20.41,-47.17,-20.45,142.86,-20.52,25.41,-20.55,-59.57,-20.59,130.46,-20.61,45.47,-20.74,33.08,-20.76,-51.91,-20.8,138.12,-20.87,20.68,-20.89,-64.31,-20.93,125.72,-20.97,-44.25,-21.02,145.78,-21.09,28.34,-21.11,-56.65,-21.15,133.39,-21.17,48.4,-21.22,15.94,-21.24,-69.04,-21.28,120.99,-21.3,36.0,-21.32,-48.98,-21.36,141.05,-21.44,23.6,-21.46,-61.38,-21.5,128.65,-21.52,43.67,-21.54,-41.32,-21.58,148.71,-21.65,31.27,-21.67,-53.72,-21.71,136.31,-21.78,18.87,-21.8,-66.12,-21.85,123.91,-21.89,-46.06,-21.93,143.98,-22.0,26.53,-22.02,-58.45,-22.06,131.58,-22.08,46.59,-22.2,119.18,-22.22,34.19,-22.24,-50.79,-22.28,139.24,-22.35,21.79,-22.37,-63.19,-22.41,126.84,-22.45,-43.13,-22.5,146.9,-22.55,114.44,-22.57,29.46,-22.59,-55.53,-22.63,134.5,-22.65,49.52,-22.7,17.06,-22.72,-67.93,-22.76,122.1,-22.81,-47.86,-22.85,142.17,-22.92,24.72,-22.94,-60.26,-22.98,129.77,-23.0,44.78,-23.07,149.83,-23.12,117.37,-23.14,32.38,-23.16,-52.6,-23.2,137.43,-23.27,19.99,-23.29,-65.0,-23.34,125.03,-23.38,-44.94,-23.42,145.09,-23.49,27.65,-23.51,-57.34,-23.55,132.69,-23.58,47.71,-23.65,-69.74,-23.69,120.3,-23.73,-49.67,-23.77,140.36,-23.85,22.91,-23.87,-62.07,-23.91,127.96,-23.99,148.02,-24.04,115.56,-24.07,30.58,-24.09,-54.41,-24.13,135.62,-24.2,18.18,-24.22,-66.81,-24.26,123.22,-24.31,-46.75,-24.35,143.28,-24.42,25.84,-24.44,-59.15,-24.48,130.89,-24.51,45.9,-24.57,150.95,-24.62,118.49,-24.64,33.5,-24.66,-51.48,-24.71,138.55,-24.78,21.1,-24.8,-63.88,-24.84,126.15,-24.93,146.21,-24.98,113.75,-25.0,28.77,-25.02,-56.22,-25.06,133.81,-25.14,16.37,-25.16,-68.62,-25.2,121.41,-25.24,-48.56,-25.28,141.48,-25.36,24.03,-25.38,-60.95,-25.42,129.08,-25.51,149.14,-25.56,116.68,-25.58,31.69,-25.6,-53.29,-25.64,136.74,-25.72,19.29,-25.74,-65.69,-25.78,124.34,-25.87,144.4,-25.94,26.96,-25.96,-58.03,-26.01,132.0,-26.09,152.07,-26.1,-70.43,-26.14,119.6,-26.19,-50.36,-26.23,139.67,-26.3,22.22,-26.32,-62.76,-26.37,127.27,-26.45,147.33,-26.51,114.87,-26.53,29.88,-26.55,-55.1,-26.59,134.93,-26.67,17.49,-26.69,-67.5,-26.73,122.53,-26.82,142.59,-26.89,25.15,-26.91,-59.84,-26.95,130.19,-27.04,150.26,-27.09,117.8,-27.12,32.81,-27.14,-52.17,-27.18,137.86,-27.26,20.41,-27.28,-64.57,-27.32,125.46,-27.41,145.52,-27.48,28.08,-27.5,-56.91,-27.55,133.12,-27.64,-69.31,-27.69,120.72,-27.77,140.78,-27.85,23.34,-27.87,-61.65,-27.91,128.39,-28.0,148.45,-28.05,115.99,-28.07,31.0,-28.1,-53.98,-28.14,136.05,-28.22,18.6,-28.24,-66.38,-28.28,123.65,-28.37,143.71,-28.44,26.27,-28.47,-58.72,-28.51,131.31,-28.6,151.37,-28.61,-71.12,-28.65,118.91,-28.74,138.98,-28.81,21.53,-28.84,-63.45,-28.88,126.58,-28.97,146.64,-29.04,29.19,-29.06,-55.79,-29.11,134.24,-29.21,-68.19,-29.25,121.84,-29.34,141.9,-29.41,24.46,-29.44,-60.53,-29.48,129.5,-29.57,149.57,-29.62,117.1,-29.71,137.17,-29.79,19.72,-29.81,-65.26,-29.85,124.77,-29.94,144.83,-30.02,27.38,-30.04,-57.6,-30.09,132.43,-30.17,152.49,-30.18,-70.0,-30.23,120.03,-30.32,140.09,-30.4,22.65,-30.42,-62.34,-30.46,127.69,-30.55,147.76,-30.61,115.3,-30.65,-54.67,-30.69,135.36,-30.79,-67.07,-30.84,122.96,-30.93,143.02,-31.01,25.58,-31.03,-59.41,-31.07,130.62,-31.16,150.68,-31.17,-71.81,-31.22,118.22,-31.31,138.28,-31.39,20.84,-31.41,-64.15,-31.45,125.89,-31.54,145.95,-31.64,-56.48,-31.69,133.55,-31.79,-68.88,-31.83,121.15,-31.92,141.21,-32.0,23.77,-32.03,-61.22,-32.16,148.87,-32.22,116.41,-32.31,136.48,-32.41,-65.95,-32.45,124.08,-32.54,144.14,-32.62,26.69,-32.65,-58.29,-32.79,-70.69,-32.84,119.34,-32.93,139.4,-33.01,21.96,-33.03,-63.03,-33.17,147.07,-33.42,-67.76,-33.47,122.27,-33.56,142.33,-33.64,24.88,-33.66,-60.1,-33.8,149.99,-33.86,117.53,-33.95,137.59,-34.05,-64.84,-34.19,145.26,-34.45,-69.57,-34.59,140.52,-34.69,-61.91,-34.83,148.18,-35.09,-66.65,-35.23,143.45,-35.48,-71.38,-35.62,138.71,-35.73,-63.72,-35.87,146.37,-36.13,-68.45,-36.21,174.1,-36.27,141.64,-36.38,-60.79,-36.52,149.3,-36.78,-65.53,-36.93,144.57,-37.19,-70.26,-37.33,139.83,-37.44,-62.6,-37.59,147.49,-37.85,-67.34,-37.94,175.22,-38.0,142.76,-38.27,-72.07,-38.52,-64.41,-38.67,145.68,-38.94,-69.15,-39.02,173.41,-39.62,-66.22,-39.7,176.34,-40.04,-70.95,-40.13,171.6,-40.73,-68.03,-41.16,-72.76,-41.25,169.79,-41.42,-65.1,-41.86,-69.84,-42.57,-66.91,-43.01,-71.65,-43.73,-68.72,-44.92,-70.53,-45.67,-67.6,-46.9,-69.41,-48.16,-71.22,-53.88,-70.79,-65.34,98.91,-65.64,86.51,-65.83,106.58,-65.95,74.12,-66.02,126.64,-66.06,41.65,-66.13,94.18,-66.25,61.72,-66.32,114.24,-66.44,81.78,-66.56,49.32,-66.63,101.84,-66.76,69.38,-66.83,121.9,-66.88,36.92,-66.95,89.44,-67.07,56.98,-67.15,109.5,-67.19,24.52,-67.27,77.04,-67.34,129.57,-67.39,44.58,-67.42,-177.91,-67.47,97.1,-67.59,64.64,-67.67,117.17,-67.72,32.18,-67.79,84.71,-67.87,137.23,-67.92,52.24,-67.95,-170.25,-68.0,104.77,-68.05,19.78,-68.12,72.31,-68.2,124.83,-68.25,39.85,-68.33,92.37,-68.38,7.38,-68.46,59.91,-68.54,112.43,-68.59,27.45,-68.67,79.97,-68.75,132.49,-68.8,47.51,-68.83,-174.98,-68.88,100.03,-68.93,15.05,-69.01,67.57,-69.09,120.09,-69.15,35.11,-69.23,87.63,-69.28,2.65,-69.31,140.16,-69.36,55.17,-69.39,-167.32,-69.44,107.69,-69.5,22.71,-69.58,75.23,-69.64,-9.75,-69.66,127.76,-69.72,42.77,-69.75,-179.72,-69.8,95.3,-69.86,10.31,-69.88,147.82,-69.94,62.83,-69.97,-159.66,-70.02,115.36,-70.08,30.37,-70.16,82.9,-70.22,-2.09,-70.25,135.42,-70.3,50.44,-70.33,-172.06,-70.39,102.96,-70.45,17.97,-70.53,70.5,-70.59,-14.49,-70.62,123.02,-70.68,38.04,-70.76,90.56,-70.82,5.58,-70.85,143.08,-70.91,58.1,-70.94,-164.39,-70.97,-26.89,-71.0,110.62,-71.05,25.64,-71.14,78.16,-71.2,-6.82,-71.23,130.68,-71.29,45.7,-71.32,-176.79,-71.35,-39.28,-71.38,98.22,-71.44,13.24,-71.47,150.75,-71.53,65.76,-71.56,-156.73,-71.59,-19.22,-71.62,118.29,-71.68,33.3,-71.77,85.82,-71.83,0.84,-71.87,138.35,-71.93,53.36,-71.96,-169.13,-71.99,-31.62,-72.02,105.89,-72.08,20.9,-72.11,158.41,-72.18,73.42,-72.21,-149.07,-72.24,-11.56,-72.27,125.95,-72.33,40.96,-72.39,-44.02,-72.43,93.49,-72.49,8.5,-72.52,146.01,-72.59,61.03,-72.62,-161.47,-72.65,-23.96,-72.68,113.55,-72.75,28.56,-72.84,81.09,-72.87,-141.4,-72.91,-3.9,-72.94,133.61,-73.0,48.63,-73.04,-173.87,-73.07,-36.36,-73.1,101.15,-73.17,16.17,-73.2,153.67,-73.27,68.69,-73.3,-153.8,-73.33,-16.3,-73.37,121.21,-73.43,36.23,-73.5,-48.76,-73.54,88.75,-73.57,-133.74,-73.6,3.77,-73.64,141.27,-73.71,56.29,-73.74,-166.2,-73.77,-28.69,-73.81,108.81,-73.88,23.83,-73.91,161.34,-73.95,-61.16,-73.98,76.35,-74.01,-146.14,-74.05,-8.63,-74.08,128.88,-74.15,43.89,-74.19,-178.6,-74.22,-41.09,-74.26,96.41,-74.29,-126.08,-74.33,11.43,-74.36,148.94,-74.44,63.95,-74.47,-158.54,-74.51,-21.03,-74.54,116.48,-74.61,31.49,-74.65,169.0,-74.69,-53.49,-74.72,84.01,-74.76,-138.48,-74.8,-0.97,-74.83,136.54,-74.91,51.55,-74.94,-170.94,-74.98,-33.43,-75.02,104.08,-75.05,-118.42,-75.09,19.09,-75.13,156.6,-75.16,-65.89,-75.2,71.62,-75.24,-150.88,-75.28,-13.37,-75.31,124.14,-75.39,39.15,-75.43,176.66,-75.47,-45.83,-75.5,91.68,-75.54,-130.81,-75.58,6.69,-75.62,144.2,-75.7,59.22,-75.73,-163.28,-75.77,-25.77,-75.81,111.74,-75.85,-110.75,-75.89,26.76,-75.93,164.26,-75.97,-58.23,-76.01,79.28,-76.05,-143.21,-76.09,-5.71,-76.13,131.8,-76.21,46.82,-76.25,-175.67,-76.29,-38.17,-76.33,99.34,-76.37,-123.15,-76.41,14.36,-76.45,151.86,-76.49,-70.63,-76.53,66.88,-76.57,-155.61,-76.61,-18.1,-76.65,119.4,-76.7,-103.09,-76.74,34.42,-76.78,171.93,-76.82,-50.57,-76.86,86.94,-76.91,-135.55,-76.95,1.96,-76.99,139.47,-77.03,-83.03,-77.08,54.48,-77.12,-168.01,-77.16,-30.5,-77.2,107.0,-77.25,-115.49,-77.29,22.02,-77.33,159.53,-77.38,-62.96,-77.42,74.54,-77.47,-147.95,-77.51,-10.44,-77.55,127.07,-77.6,-95.43,-77.64,42.08,-77.69,179.59,-77.73,-42.9,-77.78,94.6,-77.82,-127.89,-77.87,9.62,-77.91,147.13,-77.96,-75.36,-78.0,62.14,-78.05,-160.35,-78.1,-22.84,-78.14,114.67,-78.19,-107.83,-78.24,29.68,-78.28,167.19,-78.33,-55.3,-78.38,82.21,-78.43,-140.29,-78.47,-2.78,-78.52,134.73,-78.57,-87.76,-78.62,49.74,-78.67,-172.75,-78.71,-35.24,-78.76,102.27,-78.81,-120.22,-78.86,17.28,-78.91,154.79,-78.96,-67.7,-79.01,69.81,-79.06,-152.69,-79.11,-15.18,-79.16,122.33,-79.21,-100.16,-79.26,37.35,-79.32,174.85,-79.37,-47.64,-79.42,89.87,-79.47,-132.62,-79.52,4.88,-79.58,142.39,-79.63,-80.1,-79.68,57.41,-79.74,-165.08,-79.79,-27.58,-79.84,109.93,-79.9,-112.56,-79.95,24.95,-80.01,162.45,-80.06,-60.04,-80.12,77.47,-80.17,-145.02,-80.23,-7.51,-80.29,129.99,-80.34,-92.5,-80.4,45.01,-80.46,-177.48,-80.52,-39.98,-80.57,97.53,-80.63,-124.96,-80.69,12.55,-80.75,150.06,-80.81,-72.44,-80.87,65.07,-80.93,-157.42,-80.99,-19.91,-81.05,117.59,-81.11,-104.9,-81.18,32.61,-81.24,170.12,-81.3,-52.37,-81.37,85.13,-81.43,-137.36,-81.49,0.15,-81.56,137.66,-81.62,-84.84,-81.69,52.67,-81.76,-169.82,-81.82,-32.31,-81.89,105.19,-81.96,-117.3,-82.03,20.21,-82.1,157.72,-82.17,-64.77,-82.24,72.73,-82.31,-149.76,-82.38,-12.25,-82.45,125.26,-82.52,-97.24,-82.6,40.27,-82.67,177.78,-82.75,-44.71,-82.82,92.8,-82.9,-129.7,-82.98,7.81,-83.06,145.32,-83.14,-77.17,-83.22,60.33,-83.3,-162.16,-83.38,-24.65,-83.46,112.86,-83.55,-109.63,-83.63,27.87,-83.72,165.38,-83.81,-57.11,-83.9,80.4,-83.99,-142.1,-84.08,-4.59,-84.17,132.92,-84.27,-89.57,-84.36,47.94,-84.46,-174.56,-84.56,-37.05,-84.66,100.46,-84.77,-122.03,-84.87,15.47,-84.98,152.98,-85.09,-69.51,-85.2,68.0,-85.32,-154.49,-85.44,-16.99,-85.56,120.52,-85.69,-101.97,-85.81,35.54,-85.95,173.04,-86.09,-49.45,-86.23,88.06,-86.38,-134.43,-86.53,3.08,-86.69,140.58,-86.86,-81.91,-87.04,55.6,-87.23,-166.89,-87.44,-29.39,-87.66,108.12,-87.91,-114.37,-88.19,23.14,-88.52,160.65,-88.95,-61.85,-90.0,0.0];

/* Locations we've worked in (lat, lon, label).
   To add new locations, just push another object into this array. */
const LOCATIONS=[
  {lat:51.5074,lon:-0.1278,label:'London',country:'UK'},
  {lat:34.0489,lon:-111.0937,label:'Arizona',country:'USA'},
  {lat:15.7835,lon:-90.2308,label:'Guatemala',country:'Guatemala'}
];
/* ─── REACH MAP ──────────────────────────────────────────────────────────
   Static blueprint dot-map. Renders ONCE (and again only on resize/theme
   flip) — the globe's permanent requestAnimationFrame loop is gone.
   Canvas = land dots · SVG overlay = dashed arcs + compass · nodes = real
   <button>s that open one shared info card. */

/* Per-location card copy + label placement (indexes match LOCATIONS). */
const MAP_INFO=[
  {co:'51.5072° N · 0.1276° W',  tag:'',       body:'Home base — outreach, clothing drives and events across London and Surrey.'},
  {co:'34.0489° N · 111.0937° W',tag:'tag-up', body:'Our United States arm — community support projects in Arizona.'},
  {co:'15.7835° N · 90.2308° W', tag:'',       body:'International projects — help for families and animals in Guatemala.'}
];
/* One view everywhere: the FULL world (Antarctica cropped). An earlier build
   cropped phones to an Atlantic window for tap spacing, but half the planet
   missing read as a broken map — full world wins; node hit areas shrink on
   small screens instead. */
function _mapView(){
  return {lon0:-180,lon1:180,lat0:-56,lat1:84};
}
function _mapXY(lat,lon,V,W,H){
  return {x:(lon-V.lon0)/(V.lon1-V.lon0)*W, y:(V.lat1-lat)/(V.lat1-V.lat0)*H};
}
let _mapW=0,_mapH=0,_mapOpenIdx=-1;

function renderMap(){
  const stage=document.getElementById('map-stage');
  const cv=document.getElementById('map-dots');
  const svg=document.getElementById('map-overlay');
  if(!stage||!cv||!svg)return;
  const V=_mapView();
  const W=stage.clientWidth;
  if(!W){setTimeout(renderMap,150);return;}
  const H=Math.round(W*(V.lat1-V.lat0)/(V.lon1-V.lon0));
  _mapW=W;_mapH=H;

  /* land dots on canvas, drawn once at device resolution */
  const dpr=Math.min(2.5,window.devicePixelRatio||1);
  cv.width=Math.round(W*dpr);cv.height=Math.round(H*dpr);
  cv.style.height=H+'px';
  const ctx=cv.getContext('2d');
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);
  const ink=getComputedStyle(document.body).getPropertyValue('--text').trim()||'#15140F';
  ctx.fillStyle=ink;ctx.globalAlpha=0.42;
  const r=Math.max(0.75,W/820);
  for(let i=0;i<LAND.length;i+=2){
    const lat=LAND[i],lon=LAND[i+1];
    if(lat<V.lat0||lat>V.lat1||lon<V.lon0||lon>V.lon1)continue;
    const p=_mapXY(lat,lon,V,W,H);
    ctx.beginPath();ctx.arc(p.x,p.y,r,0,7);ctx.fill();
  }

  /* SVG overlay: dashed reach arcs from London + a small compass rose */
  svg.setAttribute('viewBox','0 0 '+W+' '+H);
  const hq=_mapXY(LOCATIONS[0].lat,LOCATIONS[0].lon,V,W,H);
  let s='';
  for(let i=1;i<LOCATIONS.length;i++){
    const p=_mapXY(LOCATIONS[i].lat,LOCATIONS[i].lon,V,W,H);
    const mx=(hq.x+p.x)/2, my=Math.min(hq.y,p.y)-Math.hypot(p.x-hq.x,p.y-hq.y)*0.16;
    s+='<path class="map-arc" d="M'+hq.x.toFixed(1)+' '+hq.y.toFixed(1)+' Q'+mx.toFixed(1)+' '+my.toFixed(1)+' '+p.x.toFixed(1)+' '+p.y.toFixed(1)+'"/>';
  }
  /* compass scales with the canvas so it never clips on short phone maps */
  const cr=Math.max(11,Math.min(20,H*0.12));
  const cx=cr+30, cy=H-cr-28;
  s+='<g class="map-compass" opacity="0.75">'
   +'<circle cx="'+cx+'" cy="'+cy+'" r="'+cr+'" stroke-width="1"/>'
   +'<circle cx="'+cx+'" cy="'+cy+'" r="'+(cr*0.55)+'" stroke-width="0.8"/>'
   +'<line x1="'+(cx-cr-6)+'" y1="'+cy+'" x2="'+(cx+cr+6)+'" y2="'+cy+'" stroke-width="0.8"/>'
   +'<line x1="'+cx+'" y1="'+(cy-cr-6)+'" x2="'+cx+'" y2="'+(cy+cr+6)+'" stroke-width="0.8"/>'
   +'<line x1="'+cx+'" y1="'+cy+'" x2="'+cx+'" y2="'+(cy-cr*0.8)+'" stroke-width="1.8"/>'
   +'<circle class="mc-dot" cx="'+cx+'" cy="'+cy+'" r="2"/>'
   +'<text x="'+cx+'" y="'+(cy-cr-10)+'" text-anchor="middle">N</text>'
   +'</g>';
  svg.innerHTML=s;

  /* location nodes — created once, repositioned every render */
  LOCATIONS.forEach(function(loc,i){
    let btn=stage.querySelector('.map-node[data-idx="'+i+'"]');
    if(!btn){
      btn=document.createElement('button');
      btn.type='button';btn.className='map-node '+(MAP_INFO[i].tag||'');
      btn.dataset.idx=i;btn.setAttribute('aria-expanded','false');
      btn.setAttribute('aria-label',loc.label+' — '+MAP_INFO[i].co);
      btn.innerHTML='<span class="map-node-mark" aria-hidden="true"></span>'
        +'<span class="map-node-tag" aria-hidden="true">'+loc.label.toUpperCase()
        +'<span class="map-node-co">'+MAP_INFO[i].co+'</span></span>';
      stage.insertBefore(btn,document.getElementById('map-card'));
    }
    const p=_mapXY(loc.lat,loc.lon,V,W,H);
    btn.style.left=p.x+'px';btn.style.top=p.y+'px';
  });
  _mapCardHide(); /* geometry changed — reposition on next open */
}

function _mapCardHide(){
  const card=document.getElementById('map-card');
  if(card)card.hidden=true;
  document.querySelectorAll('.map-node[aria-expanded="true"]')
    .forEach(function(b){b.setAttribute('aria-expanded','false');});
  _mapOpenIdx=-1;
}
/* The card's events action: "See N events ↓" when this place has events, else the
   generic "See our events ↓" (which shows the full list), for the Reach card below.
   (The CH.05 globe card shared it until the globe switched to live alerts, 15 Oct 2026.) */
function _mapEventsLink(i){
  const loc=LOCATIONS[i];
  const evs=(typeof allEvents!=='undefined'&&allEvents)||[];
  const n=loc?evs.filter(function(e){return detectCountry(e.name)===loc.country;}).length:0;
  const arrow=document.getElementById('events-grid')?' \u2193':' \u2192'; /* down on the Events page, across from Our Work */
  return n>0?{idx:i,text:'See '+n+' event'+(n===1?'':'s')+arrow}:{idx:-1,text:'See our events'+arrow};
}
function _mapCardShow(i){
  const card=document.getElementById('map-card');
  const btn=document.querySelector('.map-node[data-idx="'+i+'"]');
  const loc=LOCATIONS[i];
  if(!card||!btn||!loc)return;
  const lk=_mapEventsLink(i);
  card.innerHTML='<div class="map-card-title">'+loc.label+'</div>'
    +'<div class="map-card-co">'+MAP_INFO[i].co+'</div>'
    +'<p class="map-card-body">'+MAP_INFO[i].body+'</p>'
    +'<button type="button" class="map-card-link" onclick="_mapSeeEvents('+lk.idx+')">'+lk.text+'</button>';
  card.hidden=false;
  /* place beside the node, clamped inside the stage */
  const bx=parseFloat(btn.style.left),by=parseFloat(btn.style.top);
  const cw=card.offsetWidth,ch=card.offsetHeight;
  card.style.left=Math.max(6,Math.min(_mapW-cw-6,bx+18))+'px';
  card.style.top=Math.max(6,Math.min(_mapH-ch-6,by-ch-16>6?by-ch-16:by+22))+'px';
  document.querySelectorAll('.map-node').forEach(function(b){
    b.setAttribute('aria-expanded',b===btn?'true':'false');
  });
  _mapOpenIdx=i;
}
function _mapSeeEvents(i){
  const loc=i>=0?LOCATIONS[i]:null;
  _mapCardHide();
  /* the map is on Our Work and the list on Events (22 Oct 2026): go there, carrying the country */
  if(!document.getElementById('events-grid')){
    location.href='events.html'+(loc?'?country='+encodeURIComponent(loc.country):'')+'#events';
    return;
  }
  if(loc&&typeof filterByCountry==='function'){
    filterByCountry(loc.country);
    if(window.showToast)showToast('Showing '+loc.country+' events');
  }else if(typeof filterByCountry==='function'&&currentCountry!=='all'){
    /* the generic "See our events" always shows the full list */
    filterByCountry('all');
    if(window.showToast)showToast('Showing all events');
  }
  const target=document.getElementById('events')||document.getElementById('events-grid');
  if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
}
/* open on tap/click; toggle; Escape or outside click closes */
(function(){
  const stage=document.getElementById('map-stage');
  if(!stage)return;
  /* one-time entrance choreography — dots, then arcs, then nodes (CSS-driven) */
  if('IntersectionObserver' in window && !(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches)){
    stage.classList.add('map-pre');
    new IntersectionObserver(function(es,io){
      if(es[0].isIntersecting){stage.classList.add('map-in');io.disconnect();}
    },{threshold:0.3}).observe(stage);
  }
  stage.addEventListener('click',function(e){
    const btn=e.target.closest('.map-node');
    if(btn){
      const i=+btn.dataset.idx;
      (i===_mapOpenIdx)?_mapCardHide():_mapCardShow(i);
      e.stopPropagation();
    }
  });
  document.addEventListener('click',function(e){
    if(_mapOpenIdx>=0&&!e.target.closest('.map-node,.map-card,.map-legend-btn'))_mapCardHide();
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'&&_mapOpenIdx>=0)_mapCardHide();
  });
  /* re-render on real width changes (debounced) and on theme flips */
  let t=null,lastW=0;
  window.addEventListener('resize',function(){
    clearTimeout(t);
    t=setTimeout(function(){
      const s=document.getElementById('map-stage');
      if(s&&s.clientWidth!==lastW){lastW=s.clientWidth;renderMap();}
    },180);
  });
  new MutationObserver(function(){renderMap();})
    .observe(document.body,{attributes:true,attributeFilter:['class']});
})();

/* ─── BOOT ──────────────────────────────────────────────────────────── */
applyStoredTheme();
checkAdmin();  /* async — restores admin session if JWT still valid */
renderMap();
/* events.html?country=UK (from the Our Work map) opens the list filtered to that country */
function rlApplyCountryParam(){
  try{
    const c=new URLSearchParams(location.search).get('country');
    if(c&&document.getElementById('events-grid')&&LOCATIONS.some(l=>l.country===c))filterByCountry(c);
  }catch(e){}
}
/* A #section address on the Events page (e.g. events.html#momentum): the list above it loads late and is
   shorter than the skeleton cards it replaces, so once it settles, put the section back at the top,
   unless the reader has already started moving. */
let _rlMoved=false;
['wheel','touchstart','keydown','mousedown'].forEach(t=>window.addEventListener(t,()=>{_rlMoved=true;},{passive:true,capture:true}));
function rlSettleHash(){
  if(_rlMoved||!location.hash)return;
  let t=null;try{t=document.getElementById(decodeURIComponent(location.hash.slice(1)));}catch(e){}
  if(!t)return;
  const h=document.documentElement,sb=h.style.scrollBehavior;h.style.scrollBehavior='auto';
  t.scrollIntoView({block:'start'});h.style.scrollBehavior=sb;
}
/* Only pages that show events read them: Events (list, calendar, momentum), About (the numbers), Our Work
   (the map card's count) and, for a signed-in owner, the Daily Brief. Home, Quiet Battles, Get Involved and
   Privacy send no request to the database at all (22 Oct 2026). */
let _rlSignedIn=false;try{_rlSignedIn=!!localStorage.getItem('rl_token');}catch(e){}
if(_rlSignedIn||document.querySelector('#events-grid,#cal-grid,#mom-grid,#map-stage,.stats-section,#admin')){
  loadEvents().then(()=>{animateAllCounters();if(window._rlEventsOk)rlApplyCountryParam();});
}
