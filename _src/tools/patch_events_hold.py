# 24 Oct 2026: the Events page jumped 0.23 (layout shift) on phones because the three loading cards (536 px tall
# in one column) gave way to the much shorter empty state (285 px). Now the loading block holds the empty state's
# height: one row of placeholder cards (as many as the grid has columns) inside the same reserved height, so the
# arrival of "No events listed right now" moves nothing. Also drops the emoji from the load-error state.

def edit(p, old, new):
    s = open(p, encoding='utf-8').read()
    assert s.count(old) == 1, (p, s.count(old), old[:70])
    open(p, 'w', encoding='utf-8', newline='\n').write(s.replace(old, new))

V7 = 'assets/js/v7.js'
edit(V7, """  const grid=document.getElementById('events-grid');
  if(grid&&grid.querySelector('.loading')){
    grid.innerHTML=Array.from({length:3},()=>`""",
     """  const grid=document.getElementById('events-grid');
  if(grid&&grid.querySelector('.loading')){
    /* one row of placeholders (as many as the grid has columns), held at the empty state's height by
       .is-loading, so whatever arrives (the list or "No events listed right now") barely moves the page */
    const cols=Math.max(1,getComputedStyle(grid).gridTemplateColumns.split(' ').length);
    grid.classList.add('is-loading');
    grid.innerHTML=Array.from({length:cols},()=>`""")

M = 'assets/js/main.js'
edit(M, "  if(!grid)return; /* the list lives on the Events page only */\n",
     "  if(!grid)return; /* the list lives on the Events page only */\n  grid.classList.remove('is-loading');\n")
edit(M, """  const fail=msg=>{if(grid)grid.innerHTML=`<div class="empty"><div class="empty-icon">⚠️</div><div class="empty-title">Unable to load events</div><div style="font-size:14px;margin-top:8px;color:var(--text3)">${msg}</div></div>`;""",
     """  const fail=msg=>{if(grid){grid.classList.remove('is-loading');grid.innerHTML=`<div class="empty"><div class="empty-title">Unable to load events</div><div class="empty-sub">${msg}</div></div>`;}""")

open('assets/css/site.css', 'a', encoding='utf-8', newline='\n').write(
    '/* Events loading block holds the empty state\'s height (24 Oct 2026): no jump when the list or the empty message lands */\n'
    '.events-grid.is-loading{min-height:262px;align-content:start}\n'
    '@media(max-width:600px){.events-grid.is-loading{min-height:285px}}\n')
print('ok')
