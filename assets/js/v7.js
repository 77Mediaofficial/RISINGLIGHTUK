/* v7 — every block below is additive. Theme + fonts come entirely from the
   existing CSS variables; nothing above this script is altered by it. */

/* ── v7.11 TOASTS ─────────────────────────────────────────────────── */
window.showToast=function(msg){
  const wrap=document.getElementById('toast-wrap');
  if(!wrap)return;
  const t=document.createElement('div');
  t.className='toast';
  t.textContent=msg;
  wrap.appendChild(t);
  requestAnimationFrame(()=>t.classList.add('in'));
  setTimeout(()=>{t.classList.remove('in');setTimeout(()=>t.remove(),380);},2600);
};

/* ── v7.10 SCROLL PROGRESS + BACK-TO-TOP + MASTHEAD + CHAPTER BAR ──
   One rAF-throttled handler drives all four. Progress is compositor-only
   (transform:scaleX, never width). */
(function(){
  const bar=document.getElementById('scroll-progress');
  const btn=document.getElementById('back-top');
  const mast=document.getElementById('masthead');
  const chbar=document.getElementById('chapter-bar');
  let ticking=false;
  function onScroll(){
    if(ticking)return;ticking=true;
    requestAnimationFrame(()=>{
      const h=document.documentElement;
      const max=h.scrollHeight-h.clientHeight;
      bar.style.transform='scaleX('+(max>0?(h.scrollTop/max):0)+')';
      btn.classList.toggle('show',h.scrollTop>600);
      if(mast)mast.classList.toggle('scrolled',h.scrollTop>10);
      ticking=false;
    });
  }
  /* phones: the chapter bar (with its Join) shows from the first screen, not after 500px
     (owner call 12 Oct 2026): it carries class="show" in the markup, so it never animates in */
  window.addEventListener('scroll',onScroll,{passive:true});
  onScroll();
})();
/* Join us steps aside while the forms or the Quiet Battles chapter are on screen. An
   IntersectionObserver, so nothing runs per scroll event. */
(function(){
  const j=document.getElementById('mast-join');
  if(!j||!('IntersectionObserver' in window))return;
  const on=new Set();
  const io=new IntersectionObserver(function(es){
    es.forEach(function(e){ if(e.isIntersecting)on.add(e.target); else on.delete(e.target); });
    j.classList.toggle('away',on.size>0);
  },{rootMargin:'-15% 0px -15% 0px'});
  ['get-involved','quiet-battles'].forEach(function(id){ const el=document.getElementById(id); if(el)io.observe(el); });
})();
/* "How we handle your details" links open the privacy note in the footer before the
   anchor jump lands on it; a visit straight to #privacy opens it too. */
(function(){
  function openPrivacy(){ const d=document.getElementById('privacy'); if(d)d.open=true; }
  document.addEventListener('click',function(ev){ if(ev.target.closest&&ev.target.closest('a.privacy-link'))openPrivacy(); });
  if(location.hash==='#privacy')openPrivacy();
})();

/* ── CHAPTER-BAR SCROLL-SPY — highlights the section in view ─────── */
(function(){
  const links=document.querySelectorAll('#chapter-bar a[data-spy], #ch-rail a[data-spy]');
  if(!links.length||!('IntersectionObserver'in window))return;
  const byId={};links.forEach(a=>{const k=a.getAttribute('data-spy');(byId[k]=byId[k]||[]).push(a);});
  const io=new IntersectionObserver(es=>{
    es.forEach(e=>{
      if(!e.isIntersecting)return;
      links.forEach(a=>a.classList.remove('active'));
      (byId[e.target.id]||[]).forEach(a=>a.classList.add('active'));
    });
  },{rootMargin:'-40% 0px -55% 0px'});
  Object.keys(byId).forEach(id=>{const t=document.getElementById(id);if(t)io.observe(t);});
})();

/* ── v7.9 SKELETON SHIMMER while events load ─────────────────────── */
(function(){
  const grid=document.getElementById('events-grid');
  if(grid&&grid.querySelector('.loading')){
    /* one row of placeholders (as many as the grid has columns), held at the empty state's height by
       .is-loading, so whatever arrives (the list or "No events listed right now") barely moves the page */
    const cols=Math.max(1,getComputedStyle(grid).gridTemplateColumns.split(' ').length);
    grid.classList.add('is-loading');
    grid.innerHTML=Array.from({length:cols},()=>`
      <div class="skel-card">
        <div class="skel skel-line medium" style="height:18px;margin-bottom:14px"></div>
        <div class="skel skel-line short" style="margin-bottom:24px"></div>
        <div style="display:flex;gap:10px">
          <div class="skel skel-line tall" style="flex:1;margin-bottom:0"></div>
          <div class="skel skel-line tall" style="width:70px;margin-bottom:0"></div>
        </div>
      </div>`).join('');
  }
})();

/* ── v7.8 SCROLL REVEAL ──────────────────────────────────────────── */
(function(){
  const io=new IntersectionObserver(es=>{
    es.forEach(e=>{
      if(e.isIntersecting){e.target.classList.add('rl-sr-in');io.unobserve(e.target);}
    });
  },{threshold:0.12,rootMargin:'0px 0px -8% 0px'});
  function attach(el,delay){
    if(el.classList.contains('rl-sr')||el.classList.contains('rl-sr-in'))return;
    // Never hide something already in the first viewport — no flash on load
    if(el.getBoundingClientRect().top<window.innerHeight*0.9)return;
    el.classList.add('rl-sr');
    if(delay)el.style.transitionDelay=Math.min(delay,360)+'ms';
    io.observe(el);
  }
  /* CH.03's goal and calendar cards have no scroll reveal (18 Oct 2026). On a phone fling the observer
     reports them late (it runs on the main thread, the fling does not), so they crossed the screen blank
     and then faded in under the reader's thumb, however early the reveal was started. They are simply
     there; the chapter's own motion (the bar, the count, the calendar's first paint) carries it. */
  document.querySelectorAll('#impact,.map-section,.ticker-wrap,.events-header,.rl-globe,.upload-section,.rl-ig,.faq-section,.give-section,.footer')
    .forEach(el=>attach(el,0));
  // Event cards arrive async and re-render on filter — reveal each new batch
  const grid=document.getElementById('events-grid');
  if(grid){
    new MutationObserver(()=>{
      let i=0;
      grid.querySelectorAll('.event-card').forEach(c=>attach(c,(i++%6)*60));
    }).observe(grid,{childList:true});
  }
})();

/* ── v7.12 CURSOR SPOTLIGHT on cards ─────────────────────────────── */
/* Desktop only (no listener on touch) + rAF-throttled, so it does at most one
   layout read + style write per frame instead of one per mousemove event. */
if(!(window.matchMedia&&matchMedia('(pointer:coarse)').matches)){
  let _rlSpotRaf=0,_rlSpotCard=null,_rlSpotX=0,_rlSpotY=0;
  document.addEventListener('mousemove',e=>{
    const card=e.target.closest&&e.target.closest('.event-card,.stat-card');
    if(!card)return;
    _rlSpotCard=card;_rlSpotX=e.clientX;_rlSpotY=e.clientY;
    if(_rlSpotRaf)return;
    _rlSpotRaf=requestAnimationFrame(()=>{
      _rlSpotRaf=0;
      const r=_rlSpotCard.getBoundingClientRect();
      _rlSpotCard.style.setProperty('--mx',((_rlSpotX-r.left)/r.width*100)+'%');
      _rlSpotCard.style.setProperty('--my',((_rlSpotY-r.top)/r.height*100)+'%');
    });
  },{passive:true});
}

/* ══ PUBLISHED IMPACT NUMBERS ═════════════════════════════════════════
   ★ THIS BLOCK IS THE SOURCE OF TRUTH FOR THE THREE HEADLINE STATS. ★
   There is no database — the site is a static file published from git, so
   these values ARE the published figures.

   To change what the public sees:
     1. edit the numbers below (or use the Impact Numbers panel in admin
        mode, which previews them and writes this exact block out for you),
     2. commit and push. GitHub Pages redeploys and everyone sees the change.

   null = let that number calculate itself from the events list.          */
const RL_IMPACT={
  countries:3,         /* pinned 13 Oct 2026 (Joe): UK · USA · Guatemala — matches the map, footer and FAQ; Ghana counts once that trip has happened */
  total_events:4,      /* pinned 18 Oct 2026 (Joe): "change total events to 4" — no longer counts the events list; set null to count again */
  lives_touched:320    /* confirmed by Joe 13 Oct 2026; no automatic source — publish the figure here */
};
/* When you change any figure above, update the month in the "Figures as of" line under the stats. */

const RL_LIVES_FALLBACK=320;  /* used only if lives_touched is left null */
const RL_COUNTRIES_FALLBACK=3;/* shown before events load / none detected */
const RL_EVENTS_FALLBACK=2;   /* total events shown before the list loads, or if it fails — never a false 0 */

/* Working copy the admin panel previews into. Changing this only affects the
   browser you're sitting at — nothing is published until RL_IMPACT above is
   edited and pushed. */
let rlStatsOverride={...RL_IMPACT};

/* ══ MILESTONE BADGES ═════════════════════════════════════════════════
   ★ Like RL_IMPACT above, this list IS the published record. ★
   To award a new badge (or flip one from in-progress to earned):
   edit this array, commit, push. done:false renders as a dashed
   "in progress" ring at reduced opacity.
   glyph: flame · drop · book · pin · rings · peak                     */
const RL_BADGES=[
  {id:'first',  glyph:'flame', name:'First Mission',  sub:'The work begins',      done:true},
  {id:'school', glyph:'book',  name:'School Aid',     sub:'Learning supported',   done:true},
  {id:'ally',   glyph:'rings', name:'Alliance',       sub:'Charlie&rsquo;s Promise',   done:true},
  {id:'snowdon',glyph:'peak',  name:'Yr Wyddfa',      sub:'Snowdon · Summited',   done:true}
];
/* Tiny wireframe glyphs, drawn to a 24×24 box (stroke-only, inherits color). */
const RL_BADGE_GLYPHS={
  flame:'<path d="M12 3c3 4 5.6 6.2 5.6 9.6a5.6 5.6 0 0 1-11.2 0c0-1.9.9-3.6 2.6-5.4.1 1.7.8 2.7 1.9 3.2C10.6 8.2 11.2 5.4 12 3z"/>',
  drop:'<path d="M12 3.4c3.6 4.9 5.4 7.3 5.4 10a5.4 5.4 0 0 1-10.8 0c0-2.7 1.8-5.1 5.4-10z"/>',
  book:'<path d="M4.6 6.4c2.7-1.3 4.7-1.3 7.4.2 2.7-1.5 4.7-1.5 7.4-.2v12.2c-2.7-1.3-4.7-1.3-7.4.2-2.7-1.5-4.7-1.5-7.4-.2z"/><line x1="12" y1="6.6" x2="12" y2="18.8"/>',
  pin:'<path d="M12 20.6s-5.6-6-5.6-10.2a5.6 5.6 0 1 1 11.2 0c0 4.2-5.6 10.2-5.6 10.2z"/><circle cx="12" cy="10.2" r="2"/>',
  rings:'<circle cx="9.6" cy="12" r="4.6"/><circle cx="14.4" cy="12" r="4.6"/>',
  peak:'<path d="M3.4 18.6h17.2l-5.2-9.4-2.5 3.4-3-5.6z"/>'
};
function renderBadges(){
  const wall=document.getElementById('badge-wall');
  if(!wall||typeof RL_BADGES==='undefined')return;
  wall.innerHTML=RL_BADGES.map(function(b){
    const g=RL_BADGE_GLYPHS[b.glyph]||'';
    const dash=b.done?'':' stroke-dasharray="4 4"';
    return '<li class="badge badge-'+b.id+(b.done?'':' pending')+'" aria-label="'+b.name+(b.done?' — completed':' — in progress')+'">'
      +'<svg class="badge-medal" viewBox="0 0 82 82" aria-hidden="true">'
      +'<circle cx="41" cy="41" r="39" stroke-width="1.2"'+dash+'/>'
      +'<circle cx="41" cy="41" r="32" stroke-width="0.7" opacity="0.6"/>'
      /* compass ticks between the rings, N/E/S/W */
      +'<line x1="41" y1="2.6" x2="41" y2="8.4" stroke-width="1"/>'
      +'<line x1="41" y1="73.6" x2="41" y2="79.4" stroke-width="1"/>'
      +'<line x1="2.6" y1="41" x2="8.4" y2="41" stroke-width="1"/>'
      +'<line x1="73.6" y1="41" x2="79.4" y2="41" stroke-width="1"/>'
      +'<g transform="translate(23,23) scale(1.5)" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round">'+g+'</g>'
      +'</svg>'
      +'<div class="badge-name">'+b.name+'</div>'
      +(b.sub?'<div class="badge-sub">'+b.sub+'</div>':'')
      +'</li>';
  }).join('');
}
renderBadges();

/* What each stat would be with nothing pinned. */
function rlAutoStats(){
  const evs=(typeof allEvents!=='undefined'&&allEvents)||[];
  const countries=new Set(evs.map(e=>detectCountry(e.name||''))).size;
  return{
    countries:countries||RL_COUNTRIES_FALLBACK,
    total_events:window._rlEventsOk?evs.length:RL_EVENTS_FALLBACK,
    lives_touched:RL_LIVES_FALLBACK
  };
}
/* THE source of truth for the three published numbers: a pinned value if there
   is one, otherwise the auto value. Anything on the site that displays these
   stats must read them from here, so nothing can contradict the headline.
   (Note `??` — a pinned 0 is a real value and is respected.) */
function rlEffectiveStats(){
  const auto=rlAutoStats();
  return{
    countries:rlStatsOverride.countries??auto.countries,
    total_events:rlStatsOverride.total_events??auto.total_events,
    lives_touched:rlStatsOverride.lives_touched??auto.lives_touched
  };
}
/* Resolve auto vs pinned and write the result into the three stat cards.
   Sets data-target too, so the count-up animation lands on the right number. */
function rlApplyStats(){
  const eff=rlEffectiveStats();
  const cards=document.querySelectorAll('.stats-section .stat-number');
  const set=(el,v)=>{if(!el)return;el.dataset.target=v;el.textContent=v;};
  set(cards[0],eff.countries);
  set(cards[1],eff.total_events);
  set(cards[2],eff.lives_touched);
  if(window.rlRefreshGoal)window.rlRefreshGoal(); /* keep the goal bar in step */
  return eff;
}
/* Mirror current state into the admin form; placeholders show the auto value
   so it's obvious what "blank" will fall back to. */
function rlFillStatsForm(){
  const ids=['rl-stat-countries','rl-stat-events','rl-stat-lives'];
  /* Never overwrite a field the admin is actively typing into (loadEvents can
     re-run mid-edit after an upload or delete). */
  const act=document.activeElement;
  if(act&&ids.indexOf(act.id)!==-1)return;
  const auto=rlAutoStats();
  const put=(id,val,autoVal)=>{
    const el=document.getElementById(id);
    if(!el)return;
    el.value=(val==null?'':val);
    el.placeholder='Auto — '+autoVal;
  };
  put('rl-stat-countries',rlStatsOverride.countries,auto.countries);
  put('rl-stat-events',rlStatsOverride.total_events,auto.total_events);
  put('rl-stat-lives',rlStatsOverride.lives_touched,auto.lives_touched);
}
/* Render the RL_IMPACT block for the values currently in the form. This is what
   gets pasted back into assets/js/v7.js (then py _src/build.py) — it IS the publish step. */
function rlImpactSnippet(v){
  const f=x=>(x===null?'null':x);
  return 'const RL_IMPACT={\n'+
         '  countries:'+f(v.countries)+',\n'+
         '  total_events:'+f(v.total_events)+',\n'+
         '  lives_touched:'+f(v.lives_touched)+'\n'+
         '};';
}
/* Preview the typed numbers on the page AND emit the code to publish them.
   Nothing here reaches the internet — there is no backend to save to. */
async function rlApplyAndCopy(){
  /* Blank = let it calculate itself. Anything else must be a whole number ≥ 0. */
  const read=id=>{
    const raw=(document.getElementById(id).value||'').trim();
    if(raw==='')return null;
    const n=Number(raw);
    if(!isFinite(n)||n<0||Math.floor(n)!==n)throw new Error('Use a whole number of 0 or more, or leave the field blank to calculate it automatically.');
    return n;
  };
  let next;
  try{
    next={
      countries:read('rl-stat-countries'),
      total_events:read('rl-stat-events'),
      lives_touched:read('rl-stat-lives')
    };
  }catch(err){alert(err.message);return;}

  rlStatsOverride=next;
  rlApplyStats();

  const code=rlImpactSnippet(next);
  const hint=document.getElementById('rl-stats-hint');
  const changed=JSON.stringify(next)!==JSON.stringify(RL_IMPACT);
  if(hint){
    hint.innerHTML=
      (changed
        ? '<strong>Previewing — not published yet.</strong> Replace the <code>RL_IMPACT</code> block in <code>assets/js/v7.js</code> with this, run <code>py _src/build.py</code>, then commit &amp; push:'
        : '<strong>These are already the published numbers.</strong> Nothing to push.')+
      '<pre class="stat-edit-code">'+escapeHtml(code)+'</pre>';
  }
  if(!changed)return;
  try{
    await navigator.clipboard.writeText(code);
    if(window.showToast)showToast('Code copied — paste into assets/js/v7.js, rebuild, then push');
  }catch(_){
    /* Clipboard needs a secure context; the code is on screen either way. */
    if(window.showToast)showToast('Preview applied — copy the code shown below');
  }
}
/* Blank every field → all three stats go back to calculating themselves. */
function rlClearStats(){
  ['rl-stat-countries','rl-stat-events','rl-stat-lives'].forEach(id=>{
    const el=document.getElementById(id);if(el)el.value='';
  });
  rlApplyAndCopy();
}
/* ── Impact Numbers modal ─────────────────────────────────────────── */
function openImpactModal(){
  rlFillStatsForm();
  const hint=document.getElementById('rl-stats-hint');
  if(hint)hint.innerHTML='';
  const m=document.getElementById('impact-modal');
  if(!m)return;
  m.classList.add('active');
  setTimeout(()=>{const f=document.getElementById('rl-stat-countries');if(f)f.focus();},80);
}
function closeImpactModal(){
  const m=document.getElementById('impact-modal');
  if(m)m.classList.remove('active');
}
/* Backdrop click + Escape, same as the other modals on the page. */
(function(){
  const m=document.getElementById('impact-modal');
  if(!m)return;
  m.addEventListener('click',e=>{if(e.target===m)closeImpactModal();});
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&m.classList.contains('active'))closeImpactModal();
  });
})();
/* Restore the page to the numbers that are actually published in this file. */
function rlRevertStats(){
  rlStatsOverride={...RL_IMPACT};
  rlApplyStats();
  rlFillStatsForm();
  const hint=document.getElementById('rl-stats-hint');
  if(hint)hint.innerHTML='';
  if(window.showToast)showToast('Reverted to the published numbers');
}

/* ── v7.5 GOAL THERMOMETER + v7.6 MONTHLY HEATMAP ────────────────── */
const RL_GOAL=500; /* 2026 target for "Lives Touched" — edit to change the goal */
(function(){
  const card=document.getElementById('goal-card');
  if(!card)return;
  document.getElementById('goal-target').textContent=RL_GOAL;
  const fill=document.getElementById('goal-fill'),nowEl=document.getElementById('goal-now');
  const pctEl=document.getElementById('goal-pct'),foot=card.querySelector('.goal-foot');
  const reduce=window.matchMedia?window.matchMedia('(prefers-reduced-motion:reduce)'):{matches:false};
  let armed=false,painted=false,filling=false,count=null,shrinkTo=null;
  /* Read "lives" at paint time rather than parse time, so a pinned number that
     arrives with the async stats fetch is reflected in the bar. */
  /* Lives Touched: the stat card's number where the card is on the page (About); elsewhere (Events, since
     22 Oct 2026) the same figure from rlEffectiveStats(), so the goal bar never falls back to a stale 320 */
  const livesNow=()=>{const n=document.querySelectorAll('.stats-section .stat-number')[2];if(n&&n.dataset.target)return +n.dataset.target;
    try{const v=rlEffectiveStats().lives_touched;if(v!=null&&!isNaN(+v))return +v;}catch(e){}return RL_LIVES_FALLBACK;};
  const pctOf=v=>Math.min(100,Math.round(v/RL_GOAL*100));
  /* Smooth on phones (16 Oct 2026). Until the count lands, the head and the foot are held at their final
     layout: the number's box at the final value's width (Cinzel's digits differ in width, so on phones
     410–442 px wide the head used to wrap and unwrap as the count climbed, moving the bar, the month
     blocks and the calendar card by 33 px) and the foot at its final height ("0%" becoming "64% of goal"
     made it wrap at 320–324 px, 18 Oct 2026). The hold is taken at boot, while the card is still below
     the screen, so it holds whichever way the reader arrives, and it is cleared when the count lands, so
     the resting layout is the natural one. Before the count the "0" sits right-aligned in the held box,
     where the last digit of the final number will be. */
  function reserve(v){
    const shown=nowEl.textContent,pShown=pctEl.textContent;
    nowEl.style.width='';if(foot)foot.style.minHeight='';
    nowEl.textContent=v;pctEl.textContent=pctOf(v)+'% of goal';
    const w=nowEl.getBoundingClientRect().width,h=foot?foot.getBoundingClientRect().height:0;
    nowEl.textContent=shown;pctEl.textContent=pShown;
    nowEl.style.width=w+'px';if(foot)foot.style.minHeight=h+'px';
  }
  function release(){nowEl.style.width='';if(foot)foot.style.minHeight='';}
  /* The count-up, driven here rather than through animateCounter. It runs on the bar's own clock (the
     fill transition's start time; if that has not started within 60 frames, about 1 s, the count starts
     on its own clock), so the number and the bar stay in step even when the page is busy; progress is
     clamped, so never a negative number; the text is written only when the value changes; no stat-pulse
     reflow; and a repaint mid-count steers the running count instead of fighting it. Same 1600 ms cubic
     ease-out as before. While it runs, window.rlGoalBusy lets the events render wait for it. */
  function countUp(target){
    const c=count={target:target};
    let t0=null,last=null,bar=null,wait=0;
    try{bar=(fill.getAnimations?fill.getAnimations():[]).find(a=>a.transitionProperty==='transform')||null;}catch(e){}
    window.rlGoalBusy=new Promise(res=>{c.done=res;});
    const step=ts=>{
      if(count!==c)return;
      if(t0===null){
        if(bar&&bar.startTime==null&&bar.playState!=='idle'&&++wait<60){} /* the bar has not started yet: hold at 0 */
        else t0=(bar&&bar.startTime!=null)?bar.startTime:ts;
      }
      const p=t0===null?0:Math.min(Math.max((ts-t0)/1600,0),1);
      const v=p<1?Math.floor(c.target*(1-Math.pow(1-p,3))):c.target;
      if(v!==last){nowEl.textContent=v;last=v;}
      if(p<1){requestAnimationFrame(step);return;}
      count=null;release();
      window.rlGoalBusy=null;c.done();
    };
    requestAnimationFrame(step);
  }
  /* The fill's length. The first paint slides it in from the left (the CSS transition). A later change of
     the number (an admin edit) glides from the old length, still on the compositor: while it slides the
     fill keeps the longer of the two widths and the track clips the rest. */
  function setFill(pct){
    const w=pct+'%',was=fill.style.width,a=parseFloat(was)||0;
    shrinkTo=null;
    if(!(painted&&!filling&&!reduce.matches&&a>0&&pct>0&&a!==pct)){
      if(was!==w)fill.style.width=w;
      fill.style.transform='none';
      return;
    }
    fill.style.transition='none';
    if(pct>a){fill.style.width=w;fill.style.transform='translateX('+(-(pct-a)/pct*100)+'%)';}
    else fill.style.transform='none';
    void getComputedStyle(fill).transform;
    fill.style.transition='';
    if(pct>a)fill.style.transform='none';
    else{fill.style.transform='translateX('+(-(a-pct)/a*100)+'%)';shrinkTo=w;}
  }
  fill.addEventListener('transitionend',e=>{
    if(e.target!==fill||e.propertyName!=='transform')return;
    filling=false;
    if(shrinkTo){ /* a shrink has slid home: lay the fill at its new width, no visible change */
      fill.style.transition='none';fill.style.width=shrinkTo;fill.style.transform='none';shrinkTo=null;
      void getComputedStyle(fill).transform;fill.style.transition='';
    }
  });
  function paint(animate){
    const lives=livesNow(),pct=pctOf(lives);
    setFill(pct);
    pctEl.textContent=pct+'% of goal';
    if(count){count.target=lives;return;}
    if(animate&&!reduce.matches){reserve(lives);countUp(lives);}
    else{release();nowEl.textContent=lives;}
  }
  const io=new IntersectionObserver(es=>{
    es.forEach(en=>{
      if(!en.isIntersecting||armed)return;
      io.disconnect();
      armed=true;painted=true;filling=!reduce.matches;
      paint(true);
    });
  },{threshold:0.4});
  io.observe(card);
  /* The hold: taken when rlApplyStats() first sets the number (rlRefreshGoal, below, right after this
     block), on the next frame if that has not happened, again when the web fonts arrive, and again if
     the width changes before the count has run. */
  requestAnimationFrame(()=>{if(!painted&&!nowEl.style.width)reserve(livesNow());});
  /* fonts: re-take the hold whenever a web font lands, even mid-count (a first visit on a slow line can get
     Cinzel after the count has started; the fallback font's width was too narrow) - reserve() puts back
     the text on screen, so it is safe while counting */
  const rehold=()=>{if(!painted)reserve(livesNow());else if(count)reserve(count.target);};
  if(document.fonts&&document.fonts.ready)document.fonts.ready.then(rehold);
  if(document.fonts&&document.fonts.addEventListener)document.fonts.addEventListener('loadingdone',rehold);
  let holdW=window.innerWidth;
  window.addEventListener('resize',()=>{if(painted||window.innerWidth===holdW)return;holdW=window.innerWidth;reserve(livesNow());},{passive:true});
  /* The shimmer runs only while the card is on screen. */
  new IntersectionObserver(es=>{es.forEach(e=>card.classList.toggle('goal-live',e.isIntersecting));}).observe(card);
  /* Re-paint (no count-up) when the numbers change under it; before the count, re-take the hold. */
  window.rlRefreshGoal=function(){if(painted)paint(false);else reserve(livesNow());};
})();

/* Publish the numbers from RL_IMPACT. Must run AFTER the definitions above —
   the boot block earlier in the page is a separate <script>, so calling it
   there would throw before this block has parsed. */
rlApplyStats();
rlFillStatsForm();

const MONTHS_SHORT=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_LONG=['January','February','March','April','May','June','July','August','September','October','November','December'];
/* Group events by the month ("yyyy-mm") of their event_date, each list sorted by day. */
function _rlEventsByMonth(){
  const map={};
  ((typeof allEvents!=='undefined'&&allEvents)||[]).forEach(e=>{
    if(e&&e.event_date){const k=String(e.event_date).slice(0,7);(map[k]=map[k]||[]).push(e);}
  });
  /* plain comparison of the ISO "yyyy-mm-dd" dates, the same order as localeCompare without paying for
     Intl's collator inside the events-response task (18 Oct 2026) */
  Object.values(map).forEach(a=>a.sort((x,y)=>{const p=String(x.event_date),q=String(y.event_date);return p<q?-1:p>q?1:0;}));
  return map;
}
/* Momentum — the next 18 months as blocks; a month lights up if it holds dated events. */
function renderMomentum(){
  const grid=document.getElementById('mom-grid');
  if(!grid)return;
  const now=new Date(),pad=n=>String(n).padStart(2,'0');
  const startY=now.getFullYear(),startM=now.getMonth();
  const curK=`${startY}-${pad(startM+1)}`;
  const map=_rlEventsByMonth();
  let html='';
  for(let i=0;i<18;i++){
    const d=new Date(startY,startM+i,1),y=d.getFullYear(),m=d.getMonth();
    const k=`${y}-${pad(m+1)}`,evs=map[k]||[],has=evs.length;
    let cls='mom-block';
    if(k===curK)cls+=' cal-current';
    if(has)cls+=' cal-has';
    html+=`<div class="${cls}"${has?` data-k="${k}"`:''}>`+
      (has?`<span class="mom-n">${evs.length}</span>`:'')+
      `<span class="mom-m">${MONTHS_SHORT[m]}</span><span class="mom-y">${y}</span></div>`;
  }
  /* rebuild only when the blocks change (16 Oct 2026): the events load rebuilt all 18 even when
     nothing in the next 18 months had moved */
  if(grid._rlHtml!==html){grid.innerHTML=html;grid._rlHtml=html;}
  const det=document.getElementById('mom-detail');
  if(det&&det.firstChild)det.innerHTML='';
}
(function(){
  const g=document.getElementById('mom-grid');
  if(g)g.addEventListener('click',e=>{
    const block=e.target.closest('.cal-has');if(!block)return;
    const k=block.getAttribute('data-k'),evs=_rlEventsByMonth()[k]||[];
    const det=document.getElementById('mom-detail');if(!det)return;
    const parts=k.split('-'),label=`${MONTHS_SHORT[parseInt(parts[1],10)-1]} ${parts[0]}`;
    det.innerHTML=`<span class="cal-detail-day">${label}</span>`+
      evs.map(ev=>{
        const day=ev.event_date?String(ev.event_date).slice(8,10):'';
        return `<button class="cal-detail-ev" onclick="viewEvent(${ev.id})">${day?day+' · ':''}${escapeHtml(ev.name)}</button>`;
      }).join('');
    det.scrollIntoView({behavior:'smooth',block:'nearest'});
  });
})();
renderMomentum();                                  // paint now
window.rlOnEventsLoaded=function(){renderMomentum();}; // re-paint once data lands

/* ── EVENTS CALENDAR (Momentum) ──────────────────────────────────────
   Admin sets a date per PDF event (PATCH event_date — needs RL_TOKEN);
   dated events render on an in-app month calendar. Reads the same
   allEvents array, so setting a date syncs to the calendar instantly. */
let calView=null;
function _rlEventsByDate(){
  const map={};
  ((typeof allEvents!=='undefined'&&allEvents)||[]).forEach(e=>{
    if(e&&e.event_date){const k=String(e.event_date).slice(0,10);(map[k]=map[k]||[]).push(e);}
  });
  return map;
}
function renderCalendar(){
  const grid=document.getElementById('cal-grid');
  if(!grid)return;
  const now=new Date();
  /* First paint (13 Oct 2026 fix): until the events request settles, draw a neutral six-week
     skeleton instead of the current month. Painting October and then jumping to the month of the
     next event (5 rows → 6) was the load-time flash and layout shift. If the visitor taps a month
     arrow first, render for real straight away. */
  if(!window._rlEventsSettled&&!window._rlCalTouched){
    grid.setAttribute('aria-busy','true');
    grid.innerHTML=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<div class="cal-dow">${d}</div>`).join('')
      +'<div class="cal-cell cal-pad"></div>'.repeat(42);
    grid._rlHtml=null;
    return;
  }
  if(!calView){
    calView={y:now.getFullYear(),m:now.getMonth()};
    const _evd=(((typeof allEvents!=='undefined'&&allEvents)||[]).filter(e2=>e2&&e2.event_date).map(e2=>new Date(e2.event_date))).sort((a,b)=>a-b);
    if(_evd.length&&!_evd.some(d=>d.getFullYear()===calView.y&&d.getMonth()===calView.m)){
      const nx=_evd.find(d=>d>=now)||_evd[_evd.length-1];
      calView={y:nx.getFullYear(),m:nx.getMonth()};
    }
  }
  const y=calView.y,m=calView.m,pad=n=>String(n).padStart(2,'0');
  grid.removeAttribute('aria-busy');
  const monthEl=document.getElementById('cal-month');
  /* same text as toLocaleString('en',{month:'long',year:'numeric'}), without the cost of Intl's first call */
  if(monthEl){const lbl=MONTHS_LONG[m]+' '+y;if(monthEl.textContent!==lbl)monthEl.textContent=lbl;}
  const map=_rlEventsByDate();
  const dows=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const lead=(new Date(y,m,1).getDay()+6)%7;       // Monday-first
  const dim=new Date(y,m+1,0).getDate();
  const todayK=`${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
  let html=dows.map(d=>`<div class="cal-dow">${d}</div>`).join('');
  for(let i=0;i<lead;i++)html+='<div class="cal-cell cal-pad"></div>';
  for(let d=1;d<=dim;d++){
    const k=`${y}-${pad(m+1)}-${pad(d)}`;
    const has=map[k]&&map[k].length;
    let cls='cal-cell';
    if(k===todayK)cls+=' cal-today';
    if(has)cls+=' cal-has';
    html+=`<div class="${cls}"${has?` data-k="${k}"`:''}>${d}</div>`;
  }
  /* always six week rows (42 slots), so the card keeps one height whichever month is shown */
  for(let i=lead+dim;i<42;i++)html+='<div class="cal-cell cal-pad"></div>';
  /* rebuilt only when it changes: each events load used to render the calendar twice (16 Oct 2026) */
  if(grid._rlHtml!==html){grid.innerHTML=html;grid._rlHtml=html;}
  /* the first real paint fades the day numbers in once (opacity only) instead of popping */
  if(!window._rlCalShown){
    window._rlCalShown=true;
    grid.classList.add('cal-enter');
    setTimeout(()=>grid.classList.remove('cal-enter'),400);
  }
  const det=document.getElementById('cal-detail');
  if(det&&det.firstChild)det.innerHTML='';
}
function renderManage(){
  const list=document.getElementById('manage-list');
  if(!list)return;
  /* The panel is admin-only (hidden for visitors), so it is built only while signed in, and on sign-in
     (the observer below); a visitor's events load no longer pays for it (18 Oct 2026). */
  if(!document.body.classList.contains('admin')){list._rlStale=true;return;}
  list._rlStale=false;
  const evs=(((typeof allEvents!=='undefined'&&allEvents)||[]).slice())
    .sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
  if(!evs.length){list.innerHTML='<div class="manage-empty">No events yet — upload one above.</div>';return;}
  list.innerHTML=evs.map(e=>`
    <div class="manage-row">
      <input type="text" class="manage-name" value="${escapeHtml(e.name)}" onchange="setEventName(${e.id},this.value)" aria-label="Event name">
      <input type="date" class="manage-date" value="${e.event_date?String(e.event_date).slice(0,10):''}" onchange="setEventDate(${e.id},this.value)" aria-label="Event date">
      <button class="btn btn-replace" onclick="replacePdf(${e.id})">Replace</button>
      <button class="btn btn-delete" onclick="deleteEvent(${e.id})">Delete</button>
    </div>`).join('');
}
async function setEventDate(id,val){
  if(!RL_TOKEN){alert('Admin sign-in required to set a date.');renderManage();return;}
  try{
    const r=await fetch(`${SB_URL}/rest/v1/risinglight_events?id=eq.${id}`,{
      method:'PATCH',
      headers:{'apikey':SB_ANON,'Authorization':`Bearer ${RL_TOKEN}`,'Content-Type':'application/json','Prefer':'return=representation'},
      body:JSON.stringify({event_date:val||null})
    });
    if(r.status===401||r.status===403){if(typeof clearAdminSession==='function')clearAdminSession();alert('Session expired — please sign in again.');return;}
    if(!r.ok){const t=await r.text().catch(()=>'');throw new Error(`Save failed (${r.status}): ${t}`);}
    const ev=((typeof allEvents!=='undefined'&&allEvents)||[]).find(x=>x.id===id);
    if(ev)ev.event_date=val||null;
    renderCalendar();renderMomentum();renderManage();
    if(window.showToast)window.showToast(val?'Date set':'Date cleared');
  }catch(err){console.error('setEventDate',err);alert('Could not save date. '+err.message);}
}
async function setEventName(id,val){
  if(!RL_TOKEN){alert('Admin sign-in required to rename events.');renderManage();return;}
  const name=(val||'').trim();
  if(!name){alert('Name cannot be empty.');renderManage();return;}
  const ev=((typeof allEvents!=='undefined'&&allEvents)||[]).find(x=>x.id===id);
  if(ev&&ev.name===name)return; /* unchanged — skip the write */
  try{
    const r=await fetch(`${SB_URL}/rest/v1/risinglight_events?id=eq.${id}`,{
      method:'PATCH',
      headers:{'apikey':SB_ANON,'Authorization':`Bearer ${RL_TOKEN}`,'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify({name:name})
    });
    if(r.status===401||r.status===403){if(typeof clearAdminSession==='function')clearAdminSession();alert('Session expired — please sign in again.');return;}
    if(!r.ok){const t=await r.text().catch(()=>'');throw new Error(`Rename failed (${r.status}): ${t}`);}
    if(window.showToast)window.showToast('Name updated ✓');
    /* name feeds country detection, ticker, cards & calendar — reload all */
    await loadEvents();
  }catch(err){console.error('setEventName',err);alert('Could not rename. '+err.message);}
}
(function(){
  const prev=window.rlOnEventsLoaded;
  window.rlOnEventsLoaded=function(){if(prev)prev();renderCalendar();renderManage();};
  new MutationObserver(()=>{const l=document.getElementById('manage-list');if(l&&l._rlStale&&document.body.classList.contains('admin'))renderManage();})
    .observe(document.body,{attributes:true,attributeFilter:['class']});
  const stepMonth=delta=>{window._rlCalTouched=true;calView=calView||{y:new Date().getFullYear(),m:new Date().getMonth()};
    let mm=calView.m+delta,yy=calView.y;
    if(mm<0){mm=11;yy--;}else if(mm>11){mm=0;yy++;}
    calView={y:yy,m:mm};renderCalendar();};
  const p=document.getElementById('cal-prev'),n=document.getElementById('cal-next'),g=document.getElementById('cal-grid');
  if(p)p.onclick=()=>stepMonth(-1);
  if(n)n.onclick=()=>stepMonth(1);
  if(g)g.addEventListener('click',e=>{
    const cell=e.target.closest('.cal-has');if(!cell)return;
    const k=cell.getAttribute('data-k'),evs=_rlEventsByDate()[k]||[];
    const det=document.getElementById('cal-detail');if(!det)return;
    det.innerHTML=`<span class="cal-detail-day">${k}</span>`+
      evs.map(ev=>`<button class="cal-detail-ev" onclick="viewEvent(${ev.id})">${escapeHtml(ev.name)}</button>`).join('');
  });
  // Swipe to change month on touch (passive listeners — no scroll jank).
  // Horizontal-dominant gestures only, so vertical page scrolling wins.
  if(g){
    let tx=0,ty=0;
    g.addEventListener('touchstart',e=>{tx=e.touches[0].clientX;ty=e.touches[0].clientY;},{passive:true});
    g.addEventListener('touchend',e=>{
      const dx=e.changedTouches[0].clientX-tx,dy=e.changedTouches[0].clientY-ty;
      if(Math.abs(dx)>44&&Math.abs(dx)>Math.abs(dy)*1.5)stepMonth(dx<0?1:-1);
    },{passive:true});
  }
  renderCalendar();renderManage();
})();

/* (v7 globe arcs + pin interactivity removed with the globe — the reach map
   handles location cards + event filtering itself) */

console.log('[Rising Light v7] Reach map (blueprint dots · location cards · tap-to-filter) + impact tracker (goal bar · heatmap · country bars) + polish (reveal · skeletons · toasts · spotlight · progress · back-to-top · rays) loaded');
