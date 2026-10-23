# One-off (22 Oct 2026): map card links across pages, events ?country=, owner-only shortcuts, QB heading space.
BS = chr(92)

def edit(p, old, new):
    s = open(p, encoding='utf-8').read()
    assert s.count(old) == 1, (p, s.count(old), old[:70])
    open(p, 'w', encoding='utf-8', newline='\n').write(s.replace(old, new))

M = 'assets/js/main.js'
down = BS + 'u2193'
right = BS + 'u2192'
edit(M, "  return n>0?{idx:i,text:'See '+n+' event'+(n===1?'':'s')+' " + down + "'}:{idx:-1,text:'See our events " + down + "'};",
     "  const arrow=document.getElementById('events-grid')?' " + down + "':' " + right + "'; /* down on the Events page, across from Our Work */\n"
     "  return n>0?{idx:i,text:'See '+n+' event'+(n===1?'':'s')+arrow}:{idx:-1,text:'See our events'+arrow};")
edit(M, """function _mapSeeEvents(i){
  const loc=i>=0?LOCATIONS[i]:null;
  _mapCardHide();
""", """function _mapSeeEvents(i){
  const loc=i>=0?LOCATIONS[i]:null;
  _mapCardHide();
  /* the map is on Our Work and the list on Events (22 Oct 2026): go there, carrying the country */
  if(!document.getElementById('events-grid')){
    location.href='events.html'+(loc?'?country='+encodeURIComponent(loc.country):'')+'#events';
    return;
  }
""")
edit(M, "loadEvents().then(()=>animateAllCounters());",
     """/* events.html?country=UK (from the Our Work map) opens the list filtered to that country */
function rlApplyCountryParam(){
  try{
    const c=new URLSearchParams(location.search).get('country');
    if(c&&document.getElementById('events-grid')&&LOCATIONS.some(l=>l.country===c))filterByCountry(c);
  }catch(e){}
}
loadEvents().then(()=>{animateAllCounters();rlApplyCountryParam();});""")

V = 'assets/js/v5.js'
edit(V, """  if (e.metaKey || e.ctrlKey || e.altKey) return;

  const k = e.key.toLowerCase();""", """  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // The single-key shortcuts are owner tools: signed-in only (22 Oct 2026). A visitor
  // pressing R used to filter the events away without knowing why.
  if (!(RL_TOKEN || window.adminMode)) return;

  const k = e.key.toLowerCase();""")

edit('_src/pages/_qb.html', 'Quiet Battles<span class="qb-lockup-sub">Rising Light UK</span>',
     'Quiet Battles<span class="qb-lockup-sub"> Rising Light UK</span>')
print('ok')
