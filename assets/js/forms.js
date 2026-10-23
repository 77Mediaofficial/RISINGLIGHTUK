  /* Submissions save to the risinglight_enquiries table (works on every phone,
     no mail app needed). If that save fails for ANY reason — table not yet
     provisioned, offline, RLS — we fall back to the original mailto: flow so
     the form can never dead-end. Hidden "website" field is a spam honeypot. */
  function rlGiveSubmit(e,kind){
    e.preventDefault();
    var f=e.target, to='svn-77mediaofficial@outlook.com';
    function v(n){var el=f.elements[n];return el?String(el.value||'').trim():'';}
    if(v('website')){ f.reset(); if(window.showToast)showToast('Thank you — message sent ✓'); return false; }

    var btn=f.querySelector('.give-btn'), label=btn?btn.textContent:'';
    function mailtoFallback(){
      var subj,body;
      if(kind==='volunteer'){ subj='Volunteer / partner enquiry'; body='Name: '+v('name')+'\nEmail: '+v('email')+'\nHow I would like to help: '+v('interest'); }
      else { subj='Website enquiry'; body='Name: '+v('name')+'\nEmail: '+v('email')+'\n\nMessage:\n'+v('message'); }
      window.location.href='mailto:'+to+'?subject='+encodeURIComponent('[Rising Light] '+subj)+'&body='+encodeURIComponent(body);
      if(window.showToast){ try{ showToast('Opening your email app...'); }catch(_){ } }
    }
    if(typeof SB_URL==='undefined'||typeof SB_ANON==='undefined'){ mailtoFallback(); return false; }

    if(btn){ btn.disabled=true; btn.textContent='Sending…'; }
    fetch(SB_URL+'/rest/v1/risinglight_enquiries',{
      method:'POST',
      headers:{'apikey':SB_ANON,'Authorization':'Bearer '+SB_ANON,'Content-Type':'application/json','Prefer':'return=minimal'},
      body:JSON.stringify({
        kind:kind,
        name:v('name'),
        email:v('email'),
        interest:kind==='volunteer'?(v('interest')||null):null,
        message:kind==='contact'?v('message'):null
      })
    }).then(function(r){
      if(!r.ok)throw 0;
      f.reset();
      if(window.showToast)showToast(kind==='volunteer'?'Thank you — we’ll be in touch ✓':'Message sent — thank you ✓');
    }).catch(function(){
      mailtoFallback();
    }).finally(function(){
      if(btn){ btn.disabled=false; btn.textContent=label||'Send'; }
    });
    return false;
  }
