# Fixes from the 23 Oct 2026 independent review, js-regression lens (JS-01 … JS-07).

def edit(p, old, new, n=1):
    s = open(p, encoding='utf-8').read()
    assert s.count(old) == n, (p, s.count(old), old[:70])
    open(p, 'w', encoding='utf-8', newline='\n').write(s.replace(old, new))

# JS-01: Back/Forward restores the reader's place; only a fresh visit or a reload opens at the top.
T = '_src/partials/top.html'
edit(T, "  if('scrollRestoration' in history){history.scrollRestoration='manual';}\n",
     "  /* Back/Forward keeps the reader's place (the browser restores it); a fresh visit or a reload opens at the top.\n"
     "     scrollRestoration stays 'auto': 'manual' is remembered per history entry and would break Back later. */\n"
     "  var _nav='';try{var _ne=performance.getEntriesByType('navigation')[0];_nav=_ne?_ne.type:'';}catch(e){}\n")
edit(T, "var _rlTop=function(){if(_rlHeld||location.hash)return;",
     "var _rlTop=function(){if(_rlHeld||location.hash||_nav==='back_forward')return;")
edit(T, "  window.addEventListener('pageshow',function(e){if(e&&e.persisted)_rlHeld=false;_rlTop();});",
     "  window.addEventListener('pageshow',function(e){if(e&&e.persisted)return;_rlTop();}); /* a page restored from the back/forward cache keeps its place */")
edit(T, "     2. scrollRestoration=manual + scroll-to-top → the page opens at the top (unless the address has a #section)",
     "     2. scroll-to-top on a fresh visit or reload (not on Back/Forward, not when the address has a #section)")

V7 = 'assets/js/v7.js'
# JS-02: the published figures now live in assets/js/v7.js; publishing means rebuilding the pages
edit(V7, "/* Render the RL_IMPACT block for the values currently in the form. This is what\n   gets pasted back into index.html — it IS the publish step. */",
     "/* Render the RL_IMPACT block for the values currently in the form. This is what\n   gets pasted back into assets/js/v7.js (then py _src/build.py) — it IS the publish step. */")
edit(V7, "? '<strong>Previewing — not published yet.</strong> Replace the <code>RL_IMPACT</code> block near the bottom of <code>index.html</code> with this, then commit &amp; push:'",
     "? '<strong>Previewing — not published yet.</strong> Replace the <code>RL_IMPACT</code> block in <code>assets/js/v7.js</code> with this, run <code>py _src/build.py</code>, then commit &amp; push:'")
edit(V7, "showToast('Code copied — paste into index.html, then push')",
     "showToast('Code copied — paste into assets/js/v7.js, rebuild, then push')")
# JS-07: the loading skeleton is one row (three cards), close to the empty state's height, so the page barely moves
edit(V7, "    grid.innerHTML=Array.from({length:6},()=>`", "    grid.innerHTML=Array.from({length:3},()=>`")

M = 'assets/js/main.js'
# JS-03: the address follows the filter (reload and Back agree with the screen); shares send the page, not the filter
edit(M, """function filterByCountry(country){
  currentCountry=country;
  renderCountryFilters();
  renderEvents();
}""", """function filterByCountry(country){
  currentCountry=country;
  renderCountryFilters();
  renderEvents();
  try{
    const u=new URL(location.href);
    if(country==='all')u.searchParams.delete('country');else u.searchParams.set('country',country);
    history.replaceState(history.state,'',u.pathname+u.search+u.hash);
  }catch(e){}
}""")
edit(M, "    shareEvent(b.dataset.share,b.dataset.text||'',window.location.href,b);",
     "    shareEvent(b.dataset.share,b.dataset.text||'',location.origin+location.pathname,b);")
# JS-04: the goal count-up holds back only a list that comes after it (on the Events page the list is first)
edit(M, "  if(window.rlGoalBusy)Promise.race([window.rlGoalBusy,new Promise(r=>setTimeout(r,2000))]).then(_next);",
     "  const _goal=document.getElementById('goal-card');\n"
     "  const _listAfterGoal=!!(_goal&&grid&&(_goal.compareDocumentPosition(grid)&Node.DOCUMENT_POSITION_FOLLOWING));\n"
     "  if(window.rlGoalBusy&&_listAfterGoal)Promise.race([window.rlGoalBusy,new Promise(r=>setTimeout(r,2000))]).then(_next);")
# JS-05 + JS-06: read the events only on pages that show them (or for a signed-in owner), and filter only a real list
edit(M, "loadEvents().then(()=>{animateAllCounters();rlApplyCountryParam();});",
     """/* Only pages that show events read them: Events (list, calendar, momentum), About (the numbers), Our Work
   (the map card's count) and, for a signed-in owner, the Daily Brief. Home, Quiet Battles, Get Involved and
   Privacy send no request to the database at all (22 Oct 2026). */
let _rlSignedIn=false;try{_rlSignedIn=!!localStorage.getItem('rl_token');}catch(e){}
if(_rlSignedIn||document.querySelector('#events-grid,#cal-grid,#mom-grid,#map-stage,.stats-section,#admin')){
  loadEvents().then(()=>{animateAllCounters();if(window._rlEventsOk)rlApplyCountryParam();});
}""")

# JS-07: the ticker strip starts hidden and appears only when there are events to show
edit('_src/pages/_events.html', '  <div class="ticker-wrap">', '  <div class="ticker-wrap" style="display:none">')

# editor notes that still pointed at the old single file
I = '_src/pages/_impact.html'
edit(I, "<!-- When any figure in RL_IMPACT changes, update this month in the same commit. -->",
     "<!-- When any figure in RL_IMPACT (assets/js/v7.js) changes, update this month in the same commit, then py _src/build.py. -->")
print('ok')
