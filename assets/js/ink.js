/* Home: the mission caption (#mission-reveal) inks word by word from --text3 to --text over the first 45% of a
   screen of scroll (colour only, site.css .overview p:last-child .rw). Screen readers read the sentence once from
   the .rl-vh copy; the word spans are aria-hidden. 29 Oct 2026 (UI upgrade surface A): the scroll and resize
   handlers only ask for one animation frame; that frame reads scrollY (no layout) and touches the word classes
   only when the inked count changes. The screen height is read on resize, never per scroll. Reduced motion inks
   every word at once. */
try{
  var _inkBoot=function(){try{
  var _mp=document.getElementById('mission-reveal');
  if(_mp){
    var _full=_mp.textContent.replace(/\s+/g,' ').trim();
    var _esc=function(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')};
    _mp.innerHTML='<span class="rl-vh">'+_esc(_full)+'</span><span aria-hidden="true">'+_full.split(' ').map(function(w){return '<span class="rw">'+_esc(w)+'</span>'}).join(' ')+'</span>';
    var _sp=_mp.querySelectorAll('.rw');
    var _rm=window.matchMedia('(prefers-reduced-motion: reduce)');
    var _vh=window.innerHeight||1,_lit=-1,_raf=0;
    var _ink=function(){
      _raf=0;
      var p=_rm.matches?1:Math.min(1,Math.max(0,window.scrollY/(_vh*0.45)));
      var n=Math.round(p*_sp.length);
      if(n===_lit)return;
      _lit=n;
      for(var i=0;i<_sp.length;i++){_sp[i].classList.toggle('lit',i<n);}
    };
    var _ask=function(){if(!_raf)_raf=requestAnimationFrame(_ink);};
    window.addEventListener('scroll',_ask,{passive:true});
    window.addEventListener('resize',function(){_vh=window.innerHeight||1;_ask();},{passive:true});
    if(_rm.addEventListener)_rm.addEventListener('change',_ask);
    _ink();
  }
  }catch(e){}};
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',_inkBoot);}
  else{_inkBoot();}
}catch(e){}
