# 23 Oct 2026 (Joe chose "Hide until events exist"): while no events are listed, the Events page shows the
# events message and the 2026 goal only; the month grid and the calendar come back by themselves once the
# events list has rows. Also the reviewer's refinement of the Back fix: manual restoration on a fresh visit
# or reload (no restore-then-jump), automatic on Back/Forward.

def edit(p, old, new, n=1):
    s = open(p, encoding='utf-8').read()
    assert s.count(old) == n, (p, s.count(old), old[:70])
    open(p, 'w', encoding='utf-8', newline='\n').write(s.replace(old, new))

T = '_src/partials/top.html'
edit(T, """     scrollRestoration stays 'auto': 'manual' is remembered per history entry and would break Back later. */
  var _nav='';try{var _ne=performance.getEntriesByType('navigation')[0];_nav=_ne?_ne.type:'';}catch(e){}
""", """     Restoration is manual on a fresh visit or reload (so a reload never shows the old position and then jumps)
     and automatic on Back/Forward. */
  var _nav='';try{var _ne=performance.getEntriesByType('navigation')[0];_nav=_ne?_ne.type:'';}catch(e){}
  if('scrollRestoration' in history){history.scrollRestoration=_nav==='back_forward'?'auto':'manual';}
""")

# start hidden (there are no events today, so nothing flashes); loadEvents reveals them when rows arrive
edit('_src/pages/_momentum.html', '<section class="chapter" id="momentum" aria-label="Goal and calendar">',
     '<section class="chapter mom-empty" id="momentum" aria-label="Goal and calendar">')

M = 'assets/js/main.js'
edit(M, "  window._rlEventsOk=true;      /* the headline event count may now count the real list (rlAutoStats) */\n",
     "  window._rlEventsOk=true;      /* the headline event count may now count the real list (rlAutoStats) */\n"
     "  /* Events page: the month grid and the calendar show only once there are events (Joe, 23 Oct 2026) */\n"
     "  {const mom=document.getElementById('momentum');if(mom)mom.classList.toggle('mom-empty',!allEvents.length);}\n")

open('assets/css/site.css', 'a', encoding='utf-8', newline='\n').write(
    '/* Events page while no events are listed (Joe, 23 Oct 2026): the goal stays; the month grid and the calendar\n'
    '   wait for real events (main.js loadEvents removes .mom-empty when rows arrive) */\n'
    '#momentum.mom-empty .heat-wrap,#momentum.mom-empty #cal-card{display:none}\n')
print('ok')
