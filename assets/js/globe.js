/* ─── CH.05 GLOBE (14 Oct 2026; live GDACS alerts 15 Oct 2026) ───────────
   Current Orange and Red disaster alerts from GDACS (Global Disaster Awareness and
   Coordination System) on a 3D globe drawn by cobe 2.0.1 (vendor/cobe-2.0.1.esm.js, MIT,
   Shu Ding — self-hosted, no CDN at runtime). They are places where help is needed, NOT
   Rising Light projects (Joe, 15 Oct 2026); Rising Light's own places stay on the CH.01
   Reach map. In its own <script> on purpose: dynamic import() is syntax, so a browser
   without it loses only the globe.
   · Data: data/gdacs.json (same origin, a relative path for the Pages sub-path), written by
     scripts/gdacs-snapshot.mjs from a GitHub Action every six hours. A visitor's browser
     never calls GDACS. The file is fetched ONCE, by its own lazy trigger (the chapter within
     2000px, see Lazy below; cobe's later trigger calls _glbLoad again, a no-op by then), and
     checked again here (finite coordinates, Red / Orange only, capped strings,
     https://www.gdacs.org/ links only); everything reaches the DOM through textContent.
   · States: loading (the globe still draws; one quiet status line), loaded, empty (no
     Orange or Red alerts, said plainly) and error (the globe still draws; one line and a
     link to gdacs.org). The status line is role=status, so changes are read out politely.
     The bot commits when the alerts change, and rewrites an unchanged file once its
     generatedAt is over 7 days old (a weekly heartbeat), so a live pipeline's generatedAt
     is never much more than a week old: when it is over 14 days old, the workflow has
     stopped, and the line says the alerts may be out of date and links to GDACS.
   · Lazy: the alerts file (about 3 KB) is asked for when the chapter is within 2000px of
     the viewport, so it has nearly always arrived before the list is on screen; cobe waits
     until the stage is within 600px (IntersectionObserver → import() → an idle slot). cobe compiles its shaders
     synchronously (one ~80-150 ms task on a cold GPU cache), so it is created in
     requestIdleCallback, well before the stage arrives.
   · One loop: cobe 2.0.1 has NO loop of its own (the README's onRender is ignored), so
     _glbFrame is the only animation-frame callback. It stops whenever the globe is still,
     off-screen (IntersectionObserver) or the tab is hidden. The idle spin draws at most
     ~60 times a second (it moves 0.4px a frame at that rate).
   · Idle spin (WCAG 2.2.2): it turns until the visitor first drags the globe or chooses an
     alert, then stays where they left it; it also pauses while keyboard focus is inside the
     chapter. Reduced motion: no spin at all. The Red pins' pulse follows the same rule
     (.glb-calm / .glb-focus) and pauses off screen (.glb-on); it is CSS on the compositor.
   · Smooth inputs: pointer handlers only record numbers; the frame applies them, draws one
     cobe frame, then moves the pin buttons with transform:translate3d. Each pin's position
     on the sphere is worked out once; a pin already hidden on the far side is skipped.
     Sizes come from a ResizeObserver (stored, applied in the next frame).
   · Touch: the sphere's circle (.glb-hit) and the pins are touch-action:pan-y pinch-zoom, so
     a vertical swipe scrolls the page natively (we just get pointercancel) and only sideways
     drags turn the globe; the stage's empty corners are ordinary page. A second finger hands
     the gesture to the page (pinch-zoom) and puts the globe back where the drag started.
     No wheel listener, no preventDefault on touch.
   · cobe rewrites a <style> in <head> on EVERY update (a full-page style recalc per frame).
     We give it no markers / ids, so that element only ever holds ':root{}' and is detached
     right after createGlobe: its writes then cost nothing.
   · No WebGL / import failure: the list + card still work, and the stage's square is removed
     only while it is wholly below the screen (no layout shift); otherwise it stays, showing
     only its hairline circle (.glb-hold).
     The pins are pointer shortcuts and aria-hidden: the list is the keyboard and
     screen-reader route. */
const _GLB_D2R=Math.PI/180,_GLB_TAU=Math.PI*2;
const _GLB_SPIN=_GLB_TAU/50000; /* idle spin in rad per ms: one turn every 50 s, by the clock */
const _GLB_TILT=0.32;           /* idle tilt (theta, rad): the northern hemisphere leans in */
const _GLB_ZOOM=1.1;            /* selected zoom; the halo still fits the stage up to ~1.12 */
const _GLB_FLY=900;             /* select / deselect glide, ms */
const _GLB_DATA='data/gdacs.json';
const _GLB_SITE='https://www.gdacs.org/';
const _GLB_MAX=60;              /* the snapshot's own cap */
const _GLB_PINS=30;             /* at most this many pins on the globe, the most urgent first: style work per
                                   frame grows with the pins, and the list (and the fly-to) still covers every alert */
const _GLB_STALE=14*864e5;      /* a snapshot whose generatedAt is older than this says it may be out of date */
const _GLB_ACTIVE=8*864e5;      /* the status strip says "Feed active" only while generatedAt is younger than this: a
                                   working feed rewrites it at least weekly (heartbeat), so 8 days catches a stopped
                                   feed a week sooner than the 14-day line (Joe 18 Oct 2026) */
const _GLB_FEW=4;               /* below 960px the list shows four, then "Show all N alerts" (= the rows of
                                   loading room the CSS holds, .glb-res: change both together) */
const _GLB_TZ='Europe/London';
const _GLB_SHORT={EQ:'Earthquake',TC:'Cyclone',FL:'Flood',VO:'Volcano',DR:'Drought',WF:'Wildfire'};
/* the full name every short code is shown beside ("TC · Tropical cyclone"; the normaliser's TYPE_LABELS) */
const _GLB_FULL={EQ:'Earthquake',TC:'Tropical cyclone',FL:'Flood',VO:'Volcano',DR:'Drought',WF:'Wildfire'};
const _GLB_HUD_MS=100;          /* the view-centre readout is rewritten at most this often (about 10 a second) */
/* the card's SOURCE row spells out the agency GDACS names (properties.source) beside its code. Each name was
   checked on 18 Oct 2026 against the source's own text: JTWC and NOAA on gdacs.org/Knowledge/models_tc.aspx,
   GDO on models_dr.aspx, GWIS on models_wf.aspx, NEIC on the USGS page "National Earthquake Information
   Center (NEIC)", GloFAS on the Copernicus page "Global Flood Awareness System (GloFAS)". Any other code
   (GDACS also sends TOKYO and DARWIN for volcanoes: city names, not agency names) shows "GDACS" alone,
   so an expansion is never guessed */
const _GLB_AGENCY={
  JTWC:['Joint Typhoon Warning Center','JTWC'],NOAA:['National Oceanic and Atmospheric Administration','NOAA'],
  NEIC:['National Earthquake Information Center','NEIC'],GDO:['Global Drought Observatory','GDO'],
  GLOFAS:['Global Flood Awareness System','GloFAS'],GWIS:['Global Wildfire Information System','GWIS']
};
/* pure-monochrome cobe colours per site theme (14 Oct spike: neutral greys only, R=G=B).
   Light and dark use opposite land maths in cobe, so they are two separate sets. */
const _GLB_THEME={
  light:{dark:0,baseColor:[1,1,1],glowColor:[0.93,0.93,0.93],mapBrightness:1.2,diffuse:1.0,mapBaseBrightness:0,opacity:1},
  dark:{dark:1,baseColor:[0.3,0.3,0.3],glowColor:[0.1,0.1,0.1],mapBrightness:1.5,diffuse:1.2,mapBaseBrightness:0,opacity:1}
};
const _glb={
  events:[],items:[],pins:[],stage:null,layer:null,hit:null,side:null,list:null,status:null,more:null,canvas:null,G:null,cobe:null,
  data:'',gen:null, /* data: '' (not asked yet) | loading | ready | empty | error; gen = the snapshot's time */
  /* opens on the Atlantic (centre longitude 55° W); if the alerts arrive before the globe is
     made, it opens on the most urgent one instead */
  phi:-Math.PI/2+55*_GLB_D2R,theta:_GLB_TILT,scale:1,lp:NaN,lt:NaN,ls:NaN,
  size:0,pendSize:0,isDark:false,themeDirty:false,
  on:false,vis:false,sideVis:false,lost:false,raf:0,last:0,drawT:0,force:0,spinK:0,held:false,focusIn:false,
  ptr:null,mouse:false,touches:new Set(),px:0,py:0,sx:0,sy:0,drag:false,grab:false,swallow:0,ddx:0,ddy:0,vel:0,phi0:0,tLo:-0.5,tHi:0.5,
  tw:null,sel:-1,opener:null,
  hud:null,hudT:-1e9,bar:null, /* the readout's two boxes + their last text; the status strip's parts */
  reduce:!!(window.matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches)
};

/* [lat, lon] → the phi/theta that put it dead centre (cobe 2.0.1 maths; spike: 0.00px error) */
function _glbCentre(lat,lon){return {phi:-Math.PI/2-lon*_GLB_D2R,theta:lat*_GLB_D2R};}
/* phi keeps growing while the globe spins, so glide along the shortest arc */
function _glbNearPhi(cur,tgt){return cur+((((tgt-cur+Math.PI)%_GLB_TAU)+_GLB_TAU)%_GLB_TAU-Math.PI);}
/* [lat, lon] → stage CSS px + facing (1 = dead centre, 0 = the edge, <0 = far side).
   Mirrors cobe's marker vertex shader; the pins sit on the surface (radius 0.8).
   _glbPlacePins runs the same maths with each pin's surface point worked out once. */
function _glbProject(lat,lon){
  const la=lat*_GLB_D2R,lo=lon*_GLB_D2R,cl=Math.cos(la),r=0.8;
  const px=cl*Math.cos(lo)*r,py=Math.sin(la)*r,pz=-cl*Math.sin(lo)*r;
  const cp=Math.cos(_glb.phi),sp=Math.sin(_glb.phi),ct=Math.cos(_glb.theta),st=Math.sin(_glb.theta);
  const x=cp*px+sp*pz,y=sp*st*px+ct*py-cp*st*pz,z=-sp*ct*px+st*py+cp*ct*pz;
  const h=_glb.size/2;
  return {x:h+x*_glb.scale*h,y:h-y*_glb.scale*h,facing:z/r};
}
function _glbTheme(){return document.body.classList.contains('dark')?_GLB_THEME.dark:_GLB_THEME.light;}
function _glbEl(tag,cls,txt){const n=document.createElement(tag);if(cls)n.className=cls;if(txt!=null)n.textContent=txt;return n;}
function _glbPad(n){return (n<10?'0':'')+n;}
/* one coordinate to one decimal with its hemisphere ("13.1° N", "144.8° E"; no-break space). The letter
   follows the ROUNDED value, so -0.04 reads "0.0° N", never "0.0° S" */
function _glbDeg(v,pos,neg){const r=Math.round(Math.abs(v)*10)/10;return r.toFixed(1)+'°\u00A0'+(v<0&&r>0?neg:pos);}
function _glbLatLng(lat,lng){return _glbDeg(lat,'N','S')+' · '+_glbDeg(lng,'E','W');}
/* the same value in words, for screen readers ("13.1 degrees north"), on the same rounding and letter rule */
function _glbSay(v,pos,neg){const r=Math.round(Math.abs(v)*10)/10;return r.toFixed(1)+' degrees '+(v<0&&r>0?neg:pos);}
/* the view centre from the globe's own angles (inverse of _glbCentre): lat = theta, lng = -(phi + 90°),
   brought into -180..180. Written into the readout's fixed boxes only when the rounded text changes,
   from _glbFrame (the one animation-frame callback), at most every _GLB_HUD_MS; fin = the loop is about
   to go idle, so the resting value is always written */
function _glbHud(t,fin){
  const h=_glb.hud;if(!h)return;
  if(!fin&&t-_glb.hudT<_GLB_HUD_MS)return;
  _glb.hudT=t;
  let lng=-(_glb.phi+Math.PI/2)/_GLB_D2R;lng=((lng+180)%360+360)%360-180;
  const a=_glbDeg(_glb.theta/_GLB_D2R,'N','S'),b=_glbDeg(lng,'E','W');
  if(a!==h.a){h.a=a;h.lat.textContent=a;}
  if(b!==h.b){h.b=b;h.lng.textContent=b;}
}

/* ── the one animation-frame callback ── */
function _glbFrame(t){
  _glb.raf=0;
  if(!_glb.on||!_glb.G)return;
  const dt=_glb.last?Math.min(50,Math.max(0,t-_glb.last)):16.7;_glb.last=t;
  let draw=false,spin=false;
  if(_glb.force>0){_glb.force--;draw=true;}
  let busy=_glb.force>0;
  const u={};
  if(_glb.pendSize&&_glb.pendSize!==_glb.size){ /* stored by the ResizeObserver */
    _glb.size=_glb.pendSize;u.width=u.height=_glb.size;u.mapSamples=_glb.size<440?12000:16000;draw=true;
  }
  if(_glb.themeDirty){_glb.themeDirty=false;Object.assign(u,_glbTheme());draw=true;}
  if(_glb.drag){ /* direct manipulation: the surface follows the pointer */
    busy=true;
    const R=Math.max(1,0.4*_glb.size*_glb.scale),d=_glb.ddx/R;
    _glb.phi+=d;
    if(_glb.ddy)_glb.theta=Math.min(_glb.tHi,Math.max(_glb.tLo,_glb.theta+_glb.ddy/R));
    _glb.vel=_glb.vel*0.5+Math.max(-0.006,Math.min(0.006,d/Math.max(dt,1)))*0.5;
    _glb.ddx=_glb.ddy=0;
  }else if(_glb.vel){ /* release glide, decays in about half a second */
    _glb.phi+=_glb.vel*dt;_glb.vel*=Math.exp(-dt/240);
    if(Math.abs(_glb.vel)<1e-5)_glb.vel=0;else busy=true;
  }
  if(_glb.tw){ /* select / deselect glide — easeOutQuint = the house cubic-bezier(.22,1,.36,1) */
    const w=_glb.tw,k=Math.min(1,Math.max(0,(t-w.t0)/_GLB_FLY)),e=1-Math.pow(1-k,5);
    if(_glb.drag)w.zoomOnly=true; /* a drag takes over the turn; a zoom in flight still lands */
    if(!w.zoomOnly){_glb.phi=w.p0+(w.p1-w.p0)*e;_glb.theta=w.h0+(w.h1-w.h0)*e;}
    _glb.scale=w.s0+(w.s1-w.s0)*e;
    if(k<1)busy=true;else _glb.tw=null;
  }
  if(!_glb.reduce&&!_glb.held&&!_glb.focusIn&&_glb.sel<0&&!_glb.drag&&!_glb.vel&&!_glb.tw){
    _glb.spinK=Math.min(1,_glb.spinK+dt/1200); /* the idle spin eases in */
    _glb.phi+=_GLB_SPIN*dt*_glb.spinK;busy=true;spin=true;
  }else _glb.spinK=0;
  if(_glb.drag!==_glb.grab){_glb.grab=_glb.drag;_glb.stage.classList.toggle('glb-grab',_glb.drag);}
  /* the idle spin alone redraws at most every ~12 ms (60 a second on a 120 Hz screen); phi still
     follows the clock every frame, and a drag, a glide or a fly always draws at the full rate */
  if((draw||_glb.phi!==_glb.lp||_glb.theta!==_glb.lt||_glb.scale!==_glb.ls)&&(draw||!spin||t-_glb.drawT>=12)){
    u.phi=_glb.lp=_glb.phi;u.theta=_glb.lt=_glb.theta;u.scale=_glb.ls=_glb.scale;
    _glb.G.update(u);_glb.drawT=t;
    _glbPlacePins();
    if(busy)_glbHud(t,false); /* the readout, throttled; the frame that goes idle writes it below */
  }
  if(busy)_glb.raf=requestAnimationFrame(_glbFrame);else{_glb.last=0;_glbHud(t,true);}
}
/* pins follow the globe by transform only; they fade toward the edge and stop taking pointer
   input before the far side (the list is the always-available route). The rotation is worked
   out once per frame; a pin already invisible on the far side costs one dot product. */
function _glbPlacePins(){
  const cp=Math.cos(_glb.phi),sp=Math.sin(_glb.phi),ct=Math.cos(_glb.theta),st=Math.sin(_glb.theta);
  const h=_glb.size/2,k=_glb.scale*h;
  for(let i=0;i<_glb.pins.length;i++){
    const p=_glb.pins[i];
    const facing=(-sp*ct*p.px+st*p.py+cp*ct*p.pz)/0.8;
    const o=Math.round(Math.min(1,Math.max(0,(facing-0.08)/0.22))*100)/100;
    if(o===0&&p.o===0)continue;
    const x=h+(cp*p.px+sp*p.pz)*k,y=h-(sp*st*p.px+ct*p.py-cp*st*p.pz)*k;
    p.x=x;p.y=y; /* kept for _glbNearest */
    const tf='translate3d('+x.toFixed(1)+'px,'+y.toFixed(1)+'px,0)';
    if(tf!==p.tf){p.tf=tf;p.el.style.transform=tf;}
    if(o!==p.o){
      p.o=o;p.el.style.opacity=o;
      const off=o<0.3;if(off!==p.off){p.off=off;p.el.classList.toggle('glb-off',off);}
      const dim=o<0.6;if(dim!==p.dim){p.dim=dim;p.el.classList.toggle('glb-dim',dim);}
    }
  }
}
function _glbKick(){if(_glb.on&&!_glb.raf)_glb.raf=requestAnimationFrame(_glbFrame);}
/* run only while the stage is on screen, the tab is visible and the context is alive
   (.glb-on also lets the Red pulse run; off screen it is paused) */
function _glbSync(){
  const run=_glb.vis&&!document.hidden&&!!_glb.G&&!_glb.lost;
  if(run===_glb.on)return;
  _glb.on=run;_glb.last=0;_glb.spinK=0;
  if(_glb.stage)_glb.stage.classList.toggle('glb-on',run);
  if(run){_glb.force=Math.max(_glb.force,1);_glbKick();}
  else if(_glb.raf){cancelAnimationFrame(_glb.raf);_glb.raf=0;}
}
/* the first drag or choice: the idle spin and the Red pulse stop for good (WCAG 2.2.2) */
function _glbHold(){
  if(_glb.held)return;
  _glb.held=true;
  if(_glb.stage)_glb.stage.classList.add('glb-calm');
}

/* ── selection ── */
function _glbFly(p1,h1,s1){
  if(!_glb.G)return;
  _glb.vel=0;
  if(_glb.reduce){_glb.tw=null;_glb.phi=p1;_glb.theta=h1;_glb.scale=s1;} /* reduced motion: jump */
  else _glb.tw={t0:performance.now(),p0:_glb.phi,h0:_glb.theta,s0:_glb.scale,p1:p1,h1:h1,s1:s1};
  _glbKick();
}
function _glbSelect(i,opener,kbd){
  if(i===_glb.sel){_glbDeselect(false);return;}
  const s=_glb.events[i];if(!s)return;
  _glb.sel=i;_glb.opener=opener||null;_glbHold(); /* from now on the globe stays where the visitor leaves it */
  _glbShowCard();
  const c=_glbCentre(s.lat,s.lng);
  _glbFly(_glbNearPhi(_glb.phi,c.phi),c.theta,_GLB_ZOOM);
  /* phones and tablets: the card sits under the whole list, so a tap (list or pin) could open it
     below the fold; bring it into view (one read on the tap). From the keyboard (kbd: a list button
     pressed with Enter / Space) focus moves to the card's title first, so it follows the scroll
     instead of staying on a button the scroll may carry off the screen; Escape brings it back */
  if(window.matchMedia&&matchMedia('(max-width:959px)').matches){
    const card=document.getElementById('glb-card');if(!card)return;
    const t=kbd&&card.querySelector('.glb-card-title');if(t)t.focus({preventScroll:true});
    _glbIntoView(card);
  }
}
/* scroll the page by just enough to show el clear of the masthead (72px, as [id] scroll-margin) and
   of the phone chapter bar (html's scroll-padding-bottom), nearest edge first; one read, on a tap or
   a key press only. The page's own scroll-behavior decides smooth or instant. */
function _glbIntoView(el){
  const r=el.getBoundingClientRect();
  const pb=parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom)||0,bot=window.innerHeight-pb-16;
  if(r.top<72)window.scrollBy({top:r.top-72});
  else if(r.bottom>bot)window.scrollBy({top:Math.min(r.bottom-bot,r.top-72)});
}
function _glbDeselect(refocus){
  if(_glb.sel<0)return;
  const op=_glb.opener;
  _glb.sel=-1;_glb.opener=null;
  _glbShowCard();
  _glbFly(_glb.phi,_GLB_TILT,1);
  /* back to the button that opened it, without scrolling the page to it; if that list item is
     folded away (phones, past the first four), to the "Show all" toggle instead */
  if(refocus&&op&&document.contains(op)){
    const to=op.getClientRects().length?op:(_glb.more&&!_glb.more.hidden?_glb.more:null);
    if(to){
      to.focus({preventScroll:true});
      /* ...but never leave focus where it cannot be seen (WCAG 2.4.7): if the button is hidden inside
         the desktop list's own scroller or off the screen, bring it into view (one read, on the key press) */
      const k=_glb.items.indexOf(to);if(k>=0)_glbReveal(k);
      _glbIntoView(to);
    }
  }
}
/* a pin picked from the globe: bring its list item into view inside the desktop list's own
   scroller (a one-off read on click; never the page) */
function _glbReveal(i){
  const b=_glb.items[i],l=_glb.list;
  if(!b||!l||l.scrollHeight<=l.clientHeight+1||!b.getClientRects().length)return;
  const lr=l.getBoundingClientRect(),br=b.getBoundingClientRect();
  if(br.top<lr.top)l.scrollTop-=lr.top-br.top+4;
  else if(br.bottom>lr.bottom)l.scrollTop+=br.bottom-lr.bottom+4;
}

/* ── dates: UK time, en-GB ("14–15 Oct 2026", "15 Oct 2026, 13:23 UK time") ── */
let _glbFmtDay=null,_glbFmtStamp=null;
function _glbDate(iso){if(typeof iso!=='string'||!iso)return null;const d=new Date(iso);return isNaN(d.getTime())?null:d;}
function _glbParts(d){
  try{
    if(!_glbFmtDay)_glbFmtDay=new Intl.DateTimeFormat('en-GB',{timeZone:_GLB_TZ,day:'numeric',month:'short',year:'numeric'});
    const o={};_glbFmtDay.formatToParts(d).forEach(function(p){o[p.type]=p.value;});
    return {d:o.day,m:o.month,y:o.year};
  }catch(e){
    return {d:String(d.getUTCDate()),m:['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getUTCMonth()],y:String(d.getUTCFullYear())};
  }
}
function _glbRange(from,to){
  const a=_glbDate(from),b=_glbDate(to);
  if(!a&&!b)return '';
  const A=_glbParts(a||b),B=_glbParts(b||a);
  if(A.y!==B.y)return A.d+' '+A.m+' '+A.y+' – '+B.d+' '+B.m+' '+B.y;
  if(A.m!==B.m)return A.d+' '+A.m+' – '+B.d+' '+B.m+' '+B.y;
  if(A.d!==B.d)return A.d+'–'+B.d+' '+B.m+' '+B.y;
  return B.d+' '+B.m+' '+B.y;
}
function _glbDay(iso){const d=_glbDate(iso);if(!d)return '';const P=_glbParts(d);return P.d+' '+P.m;}
/* how many calendar days an alert spans, first and last day included, counted on the same UK (Europe/London)
   dates the range beside it prints, so the two always agree (review, 18 Oct 2026: counting UTC days gave
   "15–16 Oct 2026 · 3 days" for an alert starting 23:30 UTC in summer time): 14 Oct 12:00 → 17 Oct 18:00
   reads "14–17 Oct 2026 · 4 days". 0 (no duration shown) when a date is missing or the two are the wrong way round */
let _glbFmtYmd=null;
function _glbYmd(d){ /* the UK calendar date as a UTC midnight, in ms (UTC if Intl fails, as _glbParts) */
  try{
    if(!_glbFmtYmd)_glbFmtYmd=new Intl.DateTimeFormat('en-GB',{timeZone:_GLB_TZ,day:'numeric',month:'numeric',year:'numeric'});
    const o={};_glbFmtYmd.formatToParts(d).forEach(function(p){o[p.type]=p.value;});
    const t=Date.UTC(+o.year,+o.month-1,+o.day);
    if(!isNaN(t))return t;
  }catch(e){}
  return Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
}
function _glbDays(from,to){
  const a=_glbDate(from),b=_glbDate(to);if(!a||!b)return 0;
  const n=Math.round((_glbYmd(b)-_glbYmd(a))/864e5)+1;
  return n>=1&&n<100000?n:0;
}
function _glbStamp(d){
  try{
    if(!_glbFmtStamp)_glbFmtStamp=new Intl.DateTimeFormat('en-GB',{timeZone:_GLB_TZ,day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
    return _glbFmtStamp.format(d)+' UK time';
  }catch(e){return d.toISOString().slice(0,16).replace('T',' ')+' Coordinated Universal Time';}
}

/* ── the alerts: fetched once, re-checked, then list + pins ── */
/* the normaliser's clean-up again (defence in depth): control, invisible and bidirectional
   characters out, then whitespace collapsed and the length capped */
const _GLB_STRIP=/[\u0000-\u001F\u007F-\u009F\u00AD\u061C\u200B-\u200F\u2028-\u202E\u2060-\u2069\uFEFF]/g;
function _glbStr(v,max){
  if(typeof v!=='string')return '';
  const t=v.replace(_GLB_STRIP,' ').replace(/\s+/g,' ').trim();
  return t.length>max?t.slice(0,max-1).trim()+'…':t;
}
/* only ever link to GDACS itself */
function _glbUrl(v){return typeof v==='string'&&v.indexOf(_GLB_SITE)===0&&v.length<=300&&!/[\s"'<>\\]/.test(v)?v:'';}
/* a GDACS link's query, short letters-and-digits pairs only ("eventid=1001338&episodeid=14&eventtype=TC") */
function _glbQuery(u){
  const o=Object.create(null),i=u.indexOf('?');
  if(i>=0)u.slice(i+1).split('&').forEach(function(p){
    const kv=p.split('=');
    if(kv.length===2&&/^[a-z]{1,12}$/i.test(kv[0])&&/^[A-Za-z0-9]{1,12}$/.test(kv[1]))o[kv[0].toLowerCase()]=kv[1];
  });
  return o;
}
/* the agency's name, as the normaliser cleans it: letters, digits, space . - / only (Latin-only where the
   browser has no Unicode property escapes) */
let _GLB_AGENCY_BAD;
try{_GLB_AGENCY_BAD=new RegExp('[^\\p{L}\\p{N} ./-]','gu');}catch(e){_GLB_AGENCY_BAD=/[^A-Za-z0-9\u00C0-\u024F .\/-]/g;}
function _glbClean(d){
  if(!d||typeof d!=='object'||!Array.isArray(d.events))return null;
  const out=[];
  for(let i=0;i<d.events.length&&out.length<_GLB_MAX;i++){
    const e=d.events[i];
    if(!e||typeof e!=='object'||typeof e.lat!=='number'||typeof e.lng!=='number')continue;
    if(!(e.lat>=-90&&e.lat<=90&&e.lng>=-180&&e.lng<=180))continue;
    if(e.alert!=='Red'&&e.alert!=='Orange')continue;
    const title=_glbStr(e.title,120);if(!title)continue;
    const type=typeof e.type==='string'&&Object.prototype.hasOwnProperty.call(_GLB_SHORT,e.type)?e.type:'';
    const url=_glbUrl(e.url),q=_glbQuery(url);
    /* the data sheet's EVENT row: the snapshot's id ("TC-1001338") and episode (added 18 Oct 2026; older
       files lack both), else the same numbers from the GDACS report link; no row if neither is there */
    const id=typeof e.id==='string'&&/^(EQ|TC|FL|VO|DR|WF)-\d{1,10}$/.test(e.id)?e.id
      :(type&&q.eventtype===type&&/^\d{1,10}$/.test(q.eventid||'')?type+'-'+q.eventid:'');
    /* never for an earthquake: there GDACS's episodeid is a GDACS-wide sequence, not a count of the event's
       updates (EQ-1570339 is episode 1738684 in the fixtures; every other type carries 1 to 44), so "Episode
       1738684" would mislead. An earthquake's EVENT row is its id alone */
    const ep=type==='EQ'?null:Number.isInteger(e.episode)&&e.episode>=0&&e.episode<1e9?e.episode
      :(/^\d{1,9}$/.test(q.episodeid||'')?parseInt(q.episodeid,10):null);
    out.push({
      lat:e.lat,lng:e.lng,title:title,alert:e.alert,red:e.alert==='Red',code:type,id:id,episode:ep,
      typeLabel:type?_GLB_FULL[type]:(_glbStr(e.typeLabel,40)||'Disaster'),short:type?_GLB_SHORT[type]:'Alert',
      place:_glbStr(e.place,40),country:_glbStr(e.country,140),severity:_glbStr(e.severityText,60),
      agency:_glbStr(e.agency,40).replace(_GLB_AGENCY_BAD,'').replace(/\s+/g,' ').trim(),
      description:_glbStr(e.description,320),from:_glbStr(e.from,30),to:_glbStr(e.to,30),url:url
    });
  }
  /* Red first, then the most recently updated (the file is already in this order) */
  return out.sort(function(a,b){return (b.red-a.red)||(a.to<b.to?1:a.to>b.to?-1:0);});
}
function _glbLoad(){
  if(_glb.data)return;
  _glbSetState('loading');
  if(typeof fetch!=='function'){_glbSetState('error');return;}
  const ac=window.AbortController?new AbortController():null;
  const timer=ac?setTimeout(function(){ac.abort();},15000):0;
  fetch(_GLB_DATA,{cache:'no-cache',credentials:'same-origin',signal:ac?ac.signal:undefined})
    .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json();})
    .then(function(d){
      clearTimeout(timer);
      const ev=_glbClean(d);
      if(!ev||(!ev.length&&d.events.length))throw new Error('unusable data');
      const g=typeof d.generatedAt==='string'?new Date(d.generatedAt):null;
      _glb.gen=g&&!isNaN(g.getTime())?g:null;
      _glbSetEvents(ev);
    })
    .catch(function(){clearTimeout(timer);_glbSetState('error');});
}
function _glbLink(text){
  const a=_glbEl('a',null,text);
  a.href=_GLB_SITE;a.target='_blank';a.rel='noopener noreferrer';
  a.appendChild(_glbEl('span','glb-sr',' (opens in a new tab)'));
  return a;
}
/* the one status line + the credit's "Updated" time */
function _glbSetState(st){
  _glb.data=st;
  const s=_glb.status;
  if(s){
    /* the whole message in one span: when the loading room is held with nothing to list (.glb-void),
       the line becomes a frame with the span centred in it, its text and link still one flow */
    const m=document.createElement('span');
    if(st==='loading')m.textContent='Loading the latest disaster alerts…';
    else if(st==='empty')m.textContent='No current Orange or Red disaster alerts from GDACS.';
    else if(st==='error'){
      m.appendChild(document.createTextNode('Live alerts are unavailable right now. '));
      m.appendChild(_glbLink('See the latest on GDACS'));
    }else if(st==='ready'){
      const n=_glb.events.length,r=_glb.events.filter(function(e){return e.red;}).length;
      m.textContent=n===1?'1 current disaster alert ('+_glb.events[0].alert+').'
        :r===0?n+' current disaster alerts, all Orange.'
        :r===n?n+' current disaster alerts, all Red.'
        :n+' current disaster alerts: '+r+' Red, '+(n-r)+' Orange.';
    }
    if((st==='ready'||st==='empty')&&_glbStale()){
      m.appendChild(document.createTextNode(' This may be out of date: '));
      m.appendChild(_glbLink('see the latest on GDACS'));
      m.appendChild(document.createTextNode('.'));
    }
    s.textContent='';s.appendChild(m);
  }
  const up=document.getElementById('glb-updated');
  if(up)up.textContent=(st==='ready'||st==='empty')&&_glb.gen?'Updated '+_glbStamp(_glb.gen)+'.':'';
  _glbBar(st);
  const side=_glb.side;
  if(side){
    side.classList.toggle('glb-void',st==='empty'||st==='error');
    /* the column's loading room (.glb-res) goes now only if the column is wholly BELOW the screen (one
       read, once): on or above the screen, a shorter result would pull everything in view up (scroll
       anchoring does not cover it here: the reveal transforms suppress it), so the room stays, framed
       (see the .glb-res CSS), until the side observer sees the column go below the screen */
    if(st!=='loading'&&side.getBoundingClientRect().top>=window.innerHeight)side.classList.remove('glb-res');
  }
}
/* the snapshot's generatedAt is over 14 days old, or missing. The pipeline rewrites even an unchanged
   file once its generatedAt is a week old, so only a stopped workflow gets here; the alerts' own dates
   play no part (an alert's end date can lie ahead, e.g. a cyclone forecast, and would hide a dead feed) */
function _glbStale(){return !_glb.gen||Date.now()-_glb.gen.getTime()>_GLB_STALE;}
/* the status strip. Accuracy (Joe repeats this to funders): the file is a snapshot whose generatedAt moves
   only when the alerts change (or a weekly heartbeat), and the scheduled checks can land hours after their
   slot, so the strip gives when the DATA was last updated and "checked every 6 hours": never "synced", never
   a next-check time, never "real time". "Feed active" = a usable file under 8 days old (_GLB_ACTIVE) */
function _glbBar(st){
  const b=_glb.bar;if(!b)return;
  const have=st==='ready'||st==='empty',stale=have&&(!_glb.gen||Date.now()-_glb.gen.getTime()>_GLB_ACTIVE);
  b.el.classList.toggle('glb-bar-ok',have&&!stale);
  b.state.textContent=st==='error'?'Feed unavailable':!have?'Loading feed':stale?'Feed may be out of date':'Feed active';
  b.upd.textContent='Updated '+(have&&_glb.gen?_glbStamp(_glb.gen):'--'); /* '--' like the counts while loading */
  const r=have?_glb.events.filter(function(e){return e.red;}).length:-1;
  /* two digits, like the list's "01/04" (at most 60 alerts), so the cell never changes width */
  b.red.textContent=have?_glbPad(r):'--';
  b.orange.textContent=have?_glbPad(_glb.events.length-r):'--';
}
function _glbSetEvents(ev){
  _glb.events=ev;_glb.sel=-1;_glb.items=[];
  const list=_glb.list;
  list.textContent='';
  ev.forEach(function(s,i){
    const li=document.createElement('li');
    const b=_glbEl('button','glb-item'+(s.red?' glb-red':''));
    b.type='button';b.setAttribute('aria-pressed','false');
    b.appendChild(_glbEl('span','glb-item-mark')).setAttribute('aria-hidden','true');
    const main=_glbEl('span','glb-item-main'),k=_glbEl('span','glb-item-kicker');
    /* "01/04": the index is visual only (the list already says "1 of 4" to a screen reader) */
    k.appendChild(_glbEl('span','glb-item-ix',_glbPad(i+1)+'/'+_glbPad(ev.length))).setAttribute('aria-hidden','true');
    k.appendChild(_glbEl('span','glb-item-alert',s.alert+' alert'));
    /* hidden ", " between the parts (alert, title, type / country, date), so a screen reader pauses
       between them: "Red alert, Tropical Cyclone CHAMPI-26, Tropical cyclone, Guam, 17 Oct" */
    k.appendChild(_glbEl('span','glb-sr',', '));
    main.appendChild(k);
    main.appendChild(_glbEl('span','glb-item-name',s.title));
    main.appendChild(_glbEl('span','glb-sr',', '));
    /* "TC · Tropical cyclone · Guam": the code beside its full name (code aria-hidden), then the country.
       The visible "·" have empty alt text; the hidden ", " keep the parts apart when read out */
    const w=_glbEl('span','glb-item-where');
    if(s.code)w.appendChild(_glbEl('span','glb-item-code',s.code)).setAttribute('aria-hidden','true');
    w.appendChild(_glbEl('span','glb-item-type',s.typeLabel));
    if(s.country&&s.title.indexOf(s.country)<0){
      w.appendChild(_glbEl('span','glb-sr',', '));
      w.appendChild(_glbEl('span','glb-item-country',s.country));
    }
    main.appendChild(w);
    b.appendChild(main);
    const iso=s.to||s.from,day=_glbDay(iso);
    if(day){main.appendChild(_glbEl('span','glb-sr',', '));const t=_glbEl('time','glb-item-date',day);t.dateTime=iso;main.appendChild(t);}
    /* detail 0: pressed with Enter / Space (or a screen reader's click), not a pointer */
    b.addEventListener('click',function(e){_glbSelect(i,b,!e.detail);});
    li.appendChild(b);list.appendChild(li);_glb.items.push(b);
  });
  /* phones and tablets: the first four, then a real toggle (no scroller inside the page) */
  const n=ev.length,clip=n>_GLB_FEW,more=_glb.more;
  list.classList.toggle('glb-clip',clip);
  /* while the loading room is held, these frame the part of it the alerts leave (see the .glb-res CSS) */
  list.classList.toggle('glb-few',n>0&&n<_GLB_FEW);
  list.classList.toggle('glb-fit',n>0&&!clip);
  if(more){more.hidden=!clip;more.setAttribute('aria-expanded','false');more.textContent='Show all '+n+' alerts';}
  _glbSetState(n?'ready':'empty');
  _glbShowCard();
  if(_glb.G){_glbMakePins();_glb.force=Math.max(_glb.force,1);_glbKick();}
}
/* the card: built with createElement/textContent only (never innerHTML with data) */
function _glbShowCard(){
  const card=document.getElementById('glb-card');if(!card)return;
  const i=_glb.sel,s=_glb.events[i];
  _glb.items.forEach(function(b,k){b.setAttribute('aria-pressed',k===i?'true':'false');});
  _glb.pins.forEach(function(p,k){p.el.setAttribute('aria-pressed',k===i?'true':'false');});
  card.textContent='';
  /* a landmark only while it holds a card: an empty "Alert details" region would sit in the landmark list */
  if(!s){card.classList.remove('on');card.removeAttribute('role');card.removeAttribute('aria-label');return;}
  card.classList.add('on');card.setAttribute('role','region');card.setAttribute('aria-label','Alert details');
  card.appendChild(_glbEl('div','glb-card-title',s.title)).tabIndex=-1; /* focus target for a keyboard choice on phones (_glbSelect) */
  /* the data sheet: label / value rows (a row with nothing to say is left out, never "undefined") */
  const dl=_glbEl('dl','glb-spec');
  const row=function(k,v){
    if(!v)return null;
    dl.appendChild(_glbEl('dt',null,k));
    const dd=dl.appendChild(_glbEl('dd',null,typeof v==='string'?v:null));
    if(typeof v!=='string')dd.appendChild(v);
    return dd;
  };
  row('Event',s.id?s.id+(s.episode!=null?' · Episode '+s.episode:''):'');
  let ty=s.typeLabel;
  if(s.code){ /* "TC · Tropical cyclone", the code hidden from screen readers (the full name follows) */
    ty=document.createDocumentFragment();
    ty.appendChild(_glbEl('span',null,s.code+' · ')).setAttribute('aria-hidden','true');
    ty.appendChild(document.createTextNode(s.typeLabel));
  }
  row('Type',ty);
  row('Alert',s.alert);
  row('Severity',s.severity);
  row('Area',s.country);
  /* "13.1° N · 144.8° E" on screen; read out as "13.1 degrees north, 144.8 degrees east" */
  const pos=document.createDocumentFragment();
  pos.appendChild(_glbEl('span',null,_glbLatLng(s.lat,s.lng))).setAttribute('aria-hidden','true');
  pos.appendChild(_glbEl('span','glb-sr',_glbSay(s.lat,'north','south')+', '+_glbSay(s.lng,'east','west')));
  row('Position',pos);
  const span=_glbRange(s.from,s.to),days=_glbDays(s.from,s.to);
  row('Active',span?span+(days?' · '+days+(days===1?' day':' days'):''):'');
  /* "Joint Typhoon Warning Center (JTWC) via GDACS": only a checked name (_GLB_AGENCY), else "GDACS" alone */
  const ak=s.agency.toUpperCase(),ag=Object.prototype.hasOwnProperty.call(_GLB_AGENCY,ak)?_GLB_AGENCY[ak]:null;
  row('Source',(ag?ag[0]+' ('+ag[1]+') via ':'')+'GDACS');
  card.appendChild(dl);
  if(s.description)card.appendChild(_glbEl('p','glb-card-body',s.description));
  card.appendChild(_glbEl('p','glb-card-note','A GDACS alert'+(_glb.gen?', data updated '+_glbStamp(_glb.gen):'')
    +'. A place where help is needed, not a Rising Light project.'));
  const a=_glbEl('a','map-card-link',s.url?'Full report on GDACS':'GDACS website');
  a.href=s.url||_GLB_SITE;a.target='_blank';a.rel='noopener noreferrer';
  a.appendChild(_glbEl('span',null,'↗')).setAttribute('aria-hidden','true');
  a.appendChild(_glbEl('span','glb-sr',' (opens in a new tab)'));
  card.appendChild(a);
}

/* ── pointer input: record numbers only; _glbFrame does the work ── */
function _glbDown(e){
  if(!_glb.G)return;
  if(e.pointerType!=='mouse'){
    if(e.isPrimary)_glb.touches.clear(); /* a new gesture: forget any pointer whose up event never came */
    _glb.touches.add(e.pointerId);
    if(_glb.touches.size>1){ /* a second finger: the pinch belongs to the page, the globe goes back */
      if(_glb.drag){_glb.drag=false;_glb.phi=_glb.phi0;}
      _glb.ptr=null;_glb.ddx=_glb.ddy=0;_glb.vel=0;_glbKick();
      return;
    }
    /* a touch must start on the sphere or a pin; the stage's corners are ordinary page */
    if(e.target!==_glb.hit&&!(e.target.closest&&e.target.closest('.glb-pin')))return;
  }
  if(!e.isPrimary||e.button!==0)return;
  _glb.ptr=e.pointerId;_glb.mouse=e.pointerType==='mouse';
  _glb.px=e.clientX;_glb.py=e.clientY;_glb.sx=_glb.sy=0;_glb.ddx=_glb.ddy=0;
  _glb.swallow=0;_glb.vel=0;
}
function _glbMove(e){
  if(e.pointerId!==_glb.ptr)return;
  /* the mouse button came up outside the stage before the drag began (no capture yet):
     end it here, or the next hover would turn the globe with no button held */
  if(_glb.mouse&&!(e.buttons&1)){_glbUp(e);return;}
  const dx=e.clientX-_glb.px,dy=e.clientY-_glb.py;
  _glb.px=e.clientX;_glb.py=e.clientY;
  _glb.ddx+=dx;if(_glb.mouse)_glb.ddy+=dy; /* touch: vertical belongs to the page */
  if(!_glb.drag){
    /* still a tap until it travels: a mouse 6px any way; a finger 8px and mostly SIDEWAYS, so
       the first px of a vertical swipe (before the browser claims the scroll) never turn the globe */
    _glb.sx+=dx;_glb.sy+=dy;
    const ax=Math.abs(_glb.sx),ay=Math.abs(_glb.sy);
    if(_glb.mouse?ax+ay<6:(ax<8||ax<=ay))return;
    _glb.drag=true;_glbHold();_glb.phi0=_glb.phi; /* phi0: where a pinch puts the globe back */
    /* mouse tilt clamps to ±0.5 rad, widened to where a selection left it so nothing jumps */
    _glb.tLo=Math.min(-0.5,_glb.theta);_glb.tHi=Math.max(0.5,_glb.theta);
    if(_glb.mouse){try{_glb.stage.setPointerCapture(e.pointerId);}catch(err){}}
  }
  _glbKick();
}
function _glbUp(e){ /* pointerup, or pointercancel = the browser took a vertical scroll or a pinch */
  if(e.pointerType!=='mouse')_glb.touches.delete(e.pointerId);
  if(e.pointerId!==_glb.ptr)return;
  _glb.ptr=null;
  if(_glb.drag){
    _glb.drag=false;
    _glb.swallow=performance.now()+400; /* the click that may follow a drag is not a pick */
    if(_glb.reduce||e.type==='pointercancel')_glb.vel=0; /* no glide while the page scrolls */
    _glbKick();
  }else{_glb.ddx=_glb.ddy=0;}
}

/* ── creation (after the lazy import) ── */
function _glbMakePins(){
  const layer=_glb.layer;
  layer.textContent='';_glb.pins=[];
  _glb.events.slice(0,_GLB_PINS).forEach(function(s,i){
    const b=_glbEl('button','glb-pin'+(s.red?' glb-red':''));
    /* pointer shortcuts only: the layer is aria-hidden and the keyboard route is the list, so a pin
       never takes focus (mousedown) and the card's opener is the matching list button */
    b.type='button';b.tabIndex=-1;
    b.setAttribute('aria-pressed',i===_glb.sel?'true':'false');
    b.appendChild(_glbEl('span','glb-pin-dot'));
    b.appendChild(_glbEl('span','glb-pin-tag',s.short+(s.place?' · '+s.place:'')));
    b.addEventListener('mousedown',function(e){e.preventDefault();});
    b.addEventListener('click',function(e){const k=_glbNearest(e,i);_glbSelect(k,_glb.items[k]);_glbReveal(k);});
    layer.appendChild(b);
    /* the pin's point on the sphere (radius 0.8), worked out once */
    const la=s.lat*_GLB_D2R,lo=s.lng*_GLB_D2R,cl=Math.cos(la);
    _glb.pins.push({el:b,px:cl*Math.cos(lo)*0.8,py:Math.sin(la)*0.8,pz:-cl*Math.sin(lo)*0.8,tf:'',o:-1,off:null,dim:null});
  });
}
/* pins can sit closer together than their 44px targets (a cyclone and a flood in one region), and the
   one drawn on top would swallow every tap meant for its neighbour: a pointer click goes to the
   visible pin whose CENTRE is nearest (the numbers the last frame wrote, plus one rect read) */
function _glbNearest(e,i){
  if(!e||!e.detail||!_glb.stage)return i; /* detail 0: not a pointer click */
  const sr=_glb.stage.getBoundingClientRect(),x=e.clientX-sr.left,y=e.clientY-sr.top;
  let best=i,bd=Infinity;
  for(let k=0;k<_glb.pins.length;k++){
    const p=_glb.pins[k];if(p.off!==false)continue;
    const d=(p.x-x)*(p.x-x)+(p.y-y)*(p.y-y);if(d<bd){bd=d;best=k;}
  }
  return bd<=22*22?best:i;
}
function _glbCreate(){
  const stage=_glb.stage,S=stage.clientWidth;
  if(!S||!_glb.cobe)return false;
  if(_glb.sel>=0){ /* an alert was chosen from the list before the globe arrived */
    const c=_glbCentre(_glb.events[_glb.sel].lat,_glb.events[_glb.sel].lng);
    _glb.phi=c.phi;_glb.theta=c.theta;_glb.scale=_GLB_ZOOM;
  }else if(!_glb.held&&_glb.events.length){ /* the alerts came first: open on the most urgent */
    _glb.phi=_glbCentre(_glb.events[0].lat,_glb.events[0].lng).phi;
  }
  _glb.isDark=document.body.classList.contains('dark');
  const coarse=!!(window.matchMedia&&matchMedia('(pointer:coarse)').matches);
  const cv=document.createElement('canvas');
  cv.setAttribute('aria-hidden','true');
  stage.insertBefore(cv,_glb.layer);
  const before=new Set(document.head.querySelectorAll('style'));
  let G=null;
  try{
    G=_glb.cobe(cv,Object.assign({
      devicePixelRatio:Math.min(window.devicePixelRatio||1,coarse?1.5:2),
      width:S,height:S,phi:_glb.phi,theta:_glb.theta,scale:_glb.scale,
      mapSamples:S<440?12000:16000
    },_glbTheme()));
  }catch(e){G=null;}
  document.head.querySelectorAll('style').forEach(function(s){if(!before.has(s))s.remove();});
  /* success = cobe wrapped the canvas in its own div; its silent no-op (no WebGL, a blocked GPU,
     or a shader failure) leaves the canvas where we put it */
  if(!G||cv.parentElement===stage){if(G)G.destroy();cv.remove();return false;}
  _glb.G=G;_glb.canvas=cv;_glb.size=_glb.pendSize=S;_glb.lp=NaN;
  cv.addEventListener('webglcontextlost',function(e){
    if(cv!==_glb.canvas)return;
    e.preventDefault();_glb.lost=true;_glbSync();
  });
  cv.addEventListener('webglcontextrestored',function(){if(cv===_glb.canvas)_glbRebuild();});
  if(!_glb.pins.length)_glbMakePins();
  stage.classList.add('glb-live');
  /* the land texture arrives after cobe's first frame and cobe never redraws on its own:
     a few extra frames make sure it shows even when nothing moves (reduced motion) */
  _glb.force=3;
  [250,1000].forEach(function(ms){setTimeout(function(){_glb.force=Math.max(_glb.force,1);_glbKick();},ms);});
  return true;
}
/* cobe 2.0.1 cannot survive a context loss: rebuild on a NEW canvas and free the old one */
function _glbRebuild(){
  const old=_glb.canvas;
  _glb.G=null;_glb.canvas=null;_glbSync();
  /* no G.destroy() here: its buffers + programs died with the lost context (deleting them now only prints WebGL INVALID_OPERATION warnings) */
  try{
    const gl=old.getContext('webgl2')||old.getContext('webgl'),x=gl&&gl.getExtension('WEBGL_lose_context');
    if(x)x.loseContext();
  }catch(e){}
  const wrap=old.parentElement;
  if(wrap&&wrap!==_glb.stage)wrap.remove();else old.remove();
  _glb.lost=false;
  if(_glbCreate())_glbSync();else _glbFallback();
}
/* no globe: the status line, list + card carry the chapter. The stage's square goes only while it
   is wholly below the screen (a one-off read on this failure path); if a reader may have seen it,
   it stays, showing just its hairline circle (.glb-hold), so nothing on the page moves. (The
   sub-line names no globe gesture, so it stays as it is.) */
function _glbFallback(){
  const sec=document.getElementById('globe'),stage=_glb.stage;
  const keep=!!stage&&stage.getBoundingClientRect().top<window.innerHeight;
  if(sec)sec.classList.add(keep?'glb-hold':'glb-nogl');
  _glb.G=null;_glbSync();
}
function _glbWire(){
  const stage=_glb.stage;
  new IntersectionObserver(function(es){_glb.vis=es[es.length-1].isIntersecting;_glbSync();},{threshold:0}).observe(stage);
  document.addEventListener('visibilitychange',_glbSync);
  new ResizeObserver(function(es){
    const w=Math.round(es[es.length-1].contentRect.width);
    if(w>0&&w!==_glb.pendSize){_glb.pendSize=w;_glbKick();}
  }).observe(stage);
  /* site theme = body.dark (toggleTheme), not prefers-color-scheme; guarded to real flips */
  new MutationObserver(function(){
    const d=document.body.classList.contains('dark');
    if(d!==_glb.isDark){_glb.isDark=d;_glb.themeDirty=true;_glbKick();}
  }).observe(document.body,{attributes:true,attributeFilter:['class']});
  stage.addEventListener('pointerdown',_glbDown);
  stage.addEventListener('pointermove',_glbMove);
  stage.addEventListener('pointerup',_glbUp);
  stage.addEventListener('pointercancel',_glbUp);
  /* a drag that ends over a pin is not a click on it */
  stage.addEventListener('click',function(e){
    const s=_glb.swallow;_glb.swallow=0;
    if(s&&performance.now()<s){e.stopPropagation();e.preventDefault();}
  },true);
  if(window.matchMedia){
    const mq=matchMedia('(prefers-reduced-motion:reduce)');
    if(mq.addEventListener)mq.addEventListener('change',function(){_glb.reduce=mq.matches;if(_glb.reduce)_glb.vel=0;_glbKick();});
  }
}
function _glbBoot(){
  import('../../vendor/cobe-2.0.1.esm.js') /* relative to this file (assets/js/), not the page */.then(function(m){
    _glb.cobe=m.default;
    const go=function(){if(_glbCreate())_glbWire();else _glbFallback();};
    if(window.requestIdleCallback)requestIdleCallback(go,{timeout:1000});else setTimeout(go,1);
  }).catch(function(){_glbFallback();});
}

/* wiring now (cheap); the alerts and the globe itself only on approach */
(function(){
  const sec=document.getElementById('globe'),stage=document.getElementById('glb-stage'),
        list=document.getElementById('glb-list'),layer=document.getElementById('glb-pins'),
        hit=document.getElementById('glb-hit'),status=document.getElementById('glb-status'),
        more=document.getElementById('glb-more'),side=list&&list.parentElement;
  if(!sec||!stage||!list||!layer||!hit||!status)return;
  _glb.stage=stage;_glb.side=side;_glb.layer=layer;_glb.hit=hit;_glb.list=list;_glb.status=status;_glb.more=more;
  const hl=document.getElementById('glb-hud-lat'),hg=document.getElementById('glb-hud-lng');
  if(hl&&hg)_glb.hud={lat:hl,lng:hg,a:'',b:''};
  const bar=document.getElementById('glb-bar'),bs=document.getElementById('glb-bar-state'),bu=document.getElementById('glb-bar-upd'),
        br=document.getElementById('glb-bar-red'),bo=document.getElementById('glb-bar-orange');
  if(bar&&bs&&bu&&br&&bo)_glb.bar={el:bar,state:bs,upd:bu,red:br,orange:bo};
  if(more)more.addEventListener('click',function(e){
    const open=more.getAttribute('aria-expanded')!=='true';
    more.setAttribute('aria-expanded',open?'true':'false');
    list.classList.toggle('glb-clip',!open);
    more.textContent=open?'Show fewer alerts':'Show all '+_glb.events.length+' alerts';
    /* the alerts just shown sit BEFORE the toggle, so from the keyboard (detail 0) start on the first
       of them; otherwise the next Tab would skip them all. Brought fully into view, clear of the phone
       chapter bar (one read, on the key press) */
    const f=open&&!e.detail&&_glb.items[_GLB_FEW];
    if(f){f.focus({preventScroll:true});_glbIntoView(f);}
    else if(!open&&!e.detail)_glbIntoView(more); /* collapsing from the keyboard: the toggle moved up with the list - keep it (and its focus ring) in view */
  });
  _glbShowCard();
  /* keyboard focus inside the chapter pauses the idle spin and the Red pulse (WCAG 2.2.2) */
  sec.addEventListener('focusin',function(){_glb.focusIn=true;sec.classList.add('glb-focus');});
  sec.addEventListener('focusout',function(e){
    _glb.focusIn=!!(e.relatedTarget&&sec.contains(e.relatedTarget));
    sec.classList.toggle('glb-focus',_glb.focusIn);_glbKick();
  });
  /* Escape closes the card and returns focus to the list button that opened it. Ours only when focus
     is in this chapter, or on the page itself (Safari doesn't focus buttons on click) while the list +
     card are on screen, and never while a dialog or panel is open: this runs first (window, capture),
     so it still sees them open. */
  window.addEventListener('keydown',function(e){
    if(e.key!=='Escape'||_glb.sel<0||e.defaultPrevented)return;
    if(document.querySelector('.modal.active,.brief-overlay.open,.kbd-help-overlay.open,#qc-panel.open'))return;
    const a=document.activeElement;
    if((a&&a!==document.body)?!sec.contains(a):!_glb.sideVis)return;
    _glbDeselect(true);
  },true);
  if(!('IntersectionObserver' in window)){_glbFallback();_glbLoad();return;}
  if(side)new IntersectionObserver(function(es){
    const en=es[es.length-1];
    _glb.sideVis=en.isIntersecting;
    /* the column's loading room, kept while the column was on or above the screen, goes once the column
       is below the screen, where shrinking it moves nothing in view */
    if(!en.isIntersecting&&en.boundingClientRect.top>0&&_glb.data&&_glb.data!=='loading')side.classList.remove('glb-res');
  },{threshold:0}).observe(side);
  /* no WebGL at all (or no ResizeObserver): never download cobe (a blocked GPU is caught by
     _glbCreate instead); the alerts still load, as a list */
  const gl=!!window.WebGLRenderingContext&&('ResizeObserver' in window);
  if(!gl)_glbFallback();
  /* the alerts file first: the chapter within 2000px (the section starts about 4000px down, so never
     on the first screen); it has then nearly always arrived before the list is in view */
  const dio=new IntersectionObserver(function(es){
    if(!es.some(function(e){return e.isIntersecting;}))return;
    dio.disconnect();_glbLoad();
  },{rootMargin:'2000px 0px'});
  /* the globe: the stage within 600px of the viewport (the section, if the stage was removed);
     _glbLoad again here is a no-op unless the first observer has not fired yet */
  const io=new IntersectionObserver(function(es){
    if(!es.some(function(e){return e.isIntersecting;}))return;
    io.disconnect();_glbLoad();if(gl)_glbBoot();
  },{rootMargin:'600px 0px'});
  /* both start watching only once the page has finished parsing: a first check made mid-parse, before
     the late <style> block lower down applies (about 1900px of height above this chapter at 390px),
     could see the chapter within 2000px and fetch the alerts on page load */
  const watch=function(){dio.observe(sec);io.observe(sec.classList.contains('glb-nogl')?sec:stage);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',watch,{once:true});else watch();
})();
