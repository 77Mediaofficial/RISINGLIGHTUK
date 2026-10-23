try{
  var _inkBoot=function(){try{
  var _mp=document.getElementById('mission-reveal');
  if(_mp){
    var _full=_mp.textContent.replace(/\s+/g,' ').trim();
    var _esc=function(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')};
    _mp.setAttribute('aria-label',_full);
    _mp.innerHTML='<span aria-hidden="true">'+_full.split(' ').map(function(w){return '<span class="rw">'+_esc(w)+'</span>'}).join(' ')+'</span>';
    var _sp=_mp.querySelectorAll('.rw');
    var _rm=window.matchMedia('(prefers-reduced-motion: reduce)');
    var _ink=function(){
      var p=_rm.matches?1:Math.min(1,Math.max(0,window.scrollY/(window.innerHeight*0.45)));
      var n=Math.round(p*_sp.length);
      for(var i=0;i<_sp.length;i++){_sp[i].classList.toggle('lit',i<n);}
    };
    window.addEventListener('scroll',_ink,{passive:true});
    window.addEventListener('resize',_ink,{passive:true});
    _ink();
  }
  }catch(e){}};
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',_inkBoot);}
  else{_inkBoot();}
}catch(e){}
