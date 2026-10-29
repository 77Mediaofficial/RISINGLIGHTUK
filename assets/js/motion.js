/* ── MOTION FOUNDATION: the scroll reveal (.rl-sr / .rl-sr-in) ──────────────────────────────────────────────
   29 Oct 2026, UI upgrade surface B. Was the v7.8 block in v7.js; it loads first now, so a throw in any other
   script cannot leave content hidden. The CSS, and the page cross-fade, reduced-motion and focus-room notes,
   are block 7 at the end of assets/css/site.css. The primitives, for whoever adds motion next:
   - The hidden start state waits for html.rl-sr-live, which this file adds once the markup pass below has
     run; that also stands the head's 3 s fail-safe down (without it, html.rl-sr-off shows every .rl-sr).
     Only the Home hero's impact row is hidden from the first paint, on html.js (HERO, below).
   - WHO is revealed: elements with class="rl-sr" in the markup; the chapter list below; event cards as they
     render; and anything passed to window.rlReveal(el | NodeList | array). Never anything already on the
     first screen when this runs (pack 7.3), and the screen a #fragment will land on counts as the first
     screen: a markup item there (or one that holds the #fragment's target) has its .rl-sr taken off before
     html.rl-sr-live switches the hidden state on, and the list, the cards and rlReveal add .rl-sr only below
     the screen, so nothing a reader can already see is hidden or fades in. The hero's impact row is the one
     exception: its entrance is the choreography (HERO).
   - WHEN: once, when 15% of it is above the bottom 10% of the screen (threshold .15, rootMargin -10% at
     the bottom), and at the end of any scroll (scrollend), whatever is on screen by then; then it is
     unobserved. So a page at rest never keeps a blank band at the bottom. Reaching the very end of the page
     reveals whatever is left (a 1px sentinel, so a page height with a fraction of a pixel still trips it).
     "On screen" at a scroll end (and in HERO) is read from the box as laid out, without the hidden state's
     16px drop (top0, below): a waiting item whose real top is in the last 16px of the screen counts as on it,
     so it never stays blank at rest (29 Oct 2026; Home's "Figures as of" line did, real top 864 on an
     868-tall screen).
   - STAGGER: items that come in together get --i = 0, 1, 2 … in reading order, capped at 5; the CSS turns
     that into a 60 ms step (300 ms at most). An inline style="--i:n" wins.
   - AFTER: .rl-sr is removed once the reveal has played (0.6 s + its step), leaving .rl-sr-in as a marker,
     so the element's own transitions, hovers and transforms are back in charge.
   - HOOK (29 Oct 2026, surface A): as an element comes in it gets a 'rl-sr-in' event (no bubbling), so
     motion that belongs to the reveal starts with it (the Home impact count-up, v7.js). Listen with
     {once:true}, and check for the class first in case it came in before your script ran.
   - HERO (29 Oct 2026, surface A): markup .rl-sr inside the Home hero (.header: the impact row) waits for
     the hero entrance: 500 ms after top.html adds body.hero-in (the display font is ready), every impact cell
     and the shared "Figures as of" line already on the first screen (the untransformed top, top0, above the
     bottom edge) plays in, stepped as usual, so it follows the call-to-action (0.46 s) instead of racing the
     headline. Only what is below the screen waits, and comes in on scroll like everything else.
   - COST: no layout reads in the observer callbacks; the first-screen test reads every box first, then
     writes. Reduced motion and no JavaScript need nothing here: the hidden state exists only in CSS, under
     html.js and prefers-reduced-motion:no-preference.
   The hidden state sets transform, so put .rl-sr on a wrapper, never on an element with a transform of its
   own. Never reuse the class names for anything else (.rl-vh is the visually-hidden helper), and never put
   .rl-sr on the CH.03 goal or calendar cards: on a phone fling the observer reports them late (it runs on
   the main thread, the fling does not), so they crossed the screen blank and faded in under the reader's
   thumb (18 Oct 2026). ── */
(function(){
  var root=document.documentElement, STEP=60, DUR=600, pending=new Set(), io=null;

  function playIn(list){
    // reading order, so a row or a list comes in from its first item
    list.sort(function(a,b){return a.compareDocumentPosition(b)&4?-1:1;});
    var k=0;
    list.forEach(function(el){
      if(io)io.unobserve(el);
      pending.delete(el);
      var i=parseFloat(el.style.getPropertyValue('--i'));
      if(isNaN(i)){i=Math.min(k++,5);el.style.setProperty('--i',i);}
      el.classList.add('rl-sr-in');
      try{el.dispatchEvent(new CustomEvent('rl-sr-in'));}catch(e){}
      setTimeout(function(){el.classList.remove('rl-sr');},DUR+Math.min(Math.max(i,0),5)*STEP+50);
    });
  }
  if('IntersectionObserver' in window){
    io=new IntersectionObserver(function(es){
      var inn=[];
      es.forEach(function(e){if(e.isIntersecting)inn.push(e.target);});
      if(inn.length)playIn(inn);
    },{threshold:0.15,rootMargin:'0px 0px -10% 0px'});
    // the end of the page in view: whatever is still waiting comes in
    var end=document.createElement('div');
    end.setAttribute('aria-hidden','true');
    end.style.cssText='height:1px;margin-top:-1px;pointer-events:none';
    document.body.appendChild(end);
    new IntersectionObserver(function(es){
      if(es[es.length-1].isIntersecting&&pending.size)playIn(Array.from(pending));
    }).observe(end);
  }
  // an item's top as laid out: getBoundingClientRect includes the transform, and a waiting item still sits
  // translateY(16px) low, so the hidden state's drop is taken back off (the matrix's ty). A read only.
  function top0(el){
    var s=getComputedStyle(el).transform,m=s&&s!=='none'?/^matrix(3d)?\((.+)\)$/.exec(s):null,v=m?m[2].split(','):null;
    return el.getBoundingClientRect().top-(v?parseFloat(v[m[1]?13:5])||0:0);
  }
  function watch(el){
    if(el.classList.contains('rl-sr-in')||pending.has(el))return;
    el.classList.add('rl-sr');
    if(io){pending.add(el);io.observe(el);}else playIn([el]);
  }
  // the screen a #fragment will land on counts as the first screen: read once, before anything is hidden or
  // shifted, so the browser's fragment scroll measures an untransformed box and lands at the pack 5.1 line, 72px
  // (scroll-padding plus scroll-margin). It applies to the markup pass and the first attach() only (later calls
  // run after the landing). Only the target's ancestors are exempt, not its descendants, so a long target's own
  // parts still come in.
  var hashEl=null;try{hashEl=location.hash&&document.getElementById(decodeURIComponent(location.hash.slice(1)));}catch(e){}
  var off0=hashEl?Math.max(0,hashEl.getBoundingClientRect().top-72):0,firstAttach=true;
  function onLanding(el){return !!hashEl&&el.contains(hashEl);}
  // .rl-sr added from script: only to elements not already on the screen (or the landing screen) (all reads,
  // then all writes). An element that arrives already carrying .rl-sr has been hidden by the CSS since it was
  // inserted, so it is watched wherever it is.
  function attach(list,stepOf){
    var els=Array.prototype.filter.call(list,function(el){return !el.classList.contains('rl-sr-in')&&!pending.has(el);});
    var line=window.innerHeight;
    var off=firstAttach?off0:0;firstAttach=false;var go=els.map(function(el){return el.classList.contains('rl-sr')||(el.getBoundingClientRect().top-off>=line&&!onLanding(el));});
    els.forEach(function(el,n){
      if(!go[n])return;
      if(stepOf)el.style.setProperty('--i',stepOf(n));
      watch(el);
    });
  }
  window.rlReveal=function(t){attach(t&&t.nodeType===1?[t]:(t||[]));};
  // the end of any scroll: whatever is waiting and on screen comes in (all reads, then the writes), so a page at
  // rest after an anchor landing, a Back restore or a scroll that stops with an item's top in the bottom band
  // never keeps a blank band. One call per scroll end, never per frame; without scrollend, the observer alone.
  if('onscrollend' in window)addEventListener('scrollend',function(){if(!pending.size)return;var vh=window.innerHeight,list=Array.from(pending),t=list.map(function(el){return top0(el);});var on=list.filter(function(el,n){return t[n]<vh;});if(on.length)playIn(on);},{passive:true});

  // markup .rl-sr (pack 7.3): an item already on the first screen, on the screen a #fragment will land on, or
  // holding the #fragment's target loses .rl-sr and simply shows; the rest are watched (all reads, then all
  // writes). Only then does html.rl-sr-live switch the hidden state on, in this same task, so nothing on the
  // first screen is painted hidden. The hero's impact row waits for its entrance instead (HERO, above).
  var heroQ=[],marked=[];
  Array.prototype.forEach.call(document.querySelectorAll('.rl-sr'),function(el){
    (el.closest('.header')?heroQ:marked).push(el);
  });
  var line0=window.innerHeight,tops=marked.map(function(el){return el.getBoundingClientRect().top;});
  marked.forEach(function(el,n){if(tops[n]-off0<line0||onLanding(el))el.classList.remove('rl-sr');else watch(el);});
  root.classList.add('rl-sr-live');
  if(heroQ.length){
    var b=document.body,later=function(){setTimeout(function(){var vh=window.innerHeight,on=heroQ.map(function(el){return top0(el)<vh;});playIn(heroQ.filter(function(el,n){return on[n];}));heroQ.forEach(function(el,n){if(!on[n])watch(el);});},500);};
    if(!b.classList.contains('hero-armed')||b.classList.contains('hero-in')||!('MutationObserver' in window))later();
    else{
      var mo=new MutationObserver(function(){if(b.classList.contains('hero-in')){mo.disconnect();later();}});
      mo.observe(b,{attributes:true,attributeFilter:['class']});
    }
  }
  // the chapters revealed since v7.8 (CH.03's goal and calendar cards deliberately not among them)
  attach(document.querySelectorAll('#impact,.map-section,.ticker-wrap,.events-header,.rl-globe,.upload-section,.rl-ig,.faq-section,.give-section,.footer'));
  // event cards arrive after the page and re-render on a filter: each new batch steps 0–5 (at most 300 ms)
  var grid=document.getElementById('events-grid');
  if(grid&&'MutationObserver' in window){
    new MutationObserver(function(){
      attach(grid.querySelectorAll('.event-card'),function(n){return n%6;});
    }).observe(grid,{childList:true});
  }
})();

/* ── KEYBOARD FOCUS vs THE STICKY CHROME ── html scroll-padding (site.css block 7) keeps a focused item clear of
   the masthead and the phone bar, but for a text field Chrome brings only the caret line into view, so a tall
   field could sit partly under them (a textarea was 33% under the phone bar at 768 px). After a Tab press, a
   field that takes focus is brought wholly into view: block 'nearest' moves nothing when it already is, and
   html{scroll-behavior} decides smooth or instant. One call per Tab press, never per frame or per scroll. */
(function(){
  var tabbed=false;
  addEventListener('keydown',function(e){tabbed=e.key==='Tab';},{capture:true,passive:true});
  addEventListener('pointerdown',function(){tabbed=false;},{capture:true,passive:true});
  addEventListener('focusin',function(e){
    var t=e.target;
    if(tabbed&&t&&(t.tagName==='TEXTAREA'||t.tagName==='INPUT'))t.scrollIntoView({block:'nearest'});
  });
})();
