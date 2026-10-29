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

    /* busy while sending (29 Oct 2026, surface D): disabled + aria-busy; CSS block D draws the spinner */
    var refocus=false;
    if(btn){ refocus=document.activeElement===btn; btn.disabled=true; btn.setAttribute('aria-busy','true'); btn.textContent='Sending…'; }
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
      if(btn){
        btn.disabled=false; btn.removeAttribute('aria-busy'); btn.textContent=label||'Send';
        // disabling a focused button drops keyboard focus to the page: hand it back to Send
        if(refocus&&(!document.activeElement||document.activeElement===document.body))btn.focus({preventScroll:true});
      }
    });
    return false;
  }


/* ── INLINE VALIDATION (29 Oct 2026, UI upgrade surface D; markup _src/pages/_give.html, CSS site.css block D) ──
   Each required field in a .give-card form has an error line (.give-err, aria-live polite) named in its
   aria-describedby. The browser's required attributes stay in the markup (and work alone if this script never runs);
   once this runs, noValidate turns the browser's own bubbles off and these plain messages take their place.
   - WHEN: on leaving a field (focusout) once it has been typed in, holds text, or already shows an error, so tabbing
     through an empty form says nothing; on Send, every field; while typing, an error clears the moment the field is
     right (a new error waits for the field to be left). A focusout because the window lost focus is ignored.
   - ON SEND with problems: the send is stopped before rlGiveSubmit runs (capture listener on the document) and focus
     moves to the first field with a problem, whose error line is read with it. Nothing is sent, nothing changes in
     what a correct form sends or where.
   - WHAT: aria-invalid="true" on the field plus one plain sentence (with an .rl-vh "Error: " in front for screen
     readers). Text of only spaces counts as empty. A new required field needs an MSG entry. ── */
(function(){
  var MSG={name:'Enter your name.',email:'Enter your email address.',message:'Enter your message.'};
  var EMAIL_FORMAT='Enter an email address in the correct format, like you@example.com.';
  var typed=typeof WeakSet==='function'?new WeakSet():null;

  function errOf(el){
    var ids=(el&&el.getAttribute&&el.getAttribute('aria-describedby')||'').split(/\s+/);
    for(var i=0;i<ids.length;i++){
      var box=ids[i]&&document.getElementById(ids[i]);
      if(box&&box.classList.contains('give-err'))return box;
    }
    return null;
  }
  function fields(f){
    return Array.prototype.filter.call(f.querySelectorAll('input,textarea'),function(el){return !!errOf(el);});
  }
  function problem(el){
    if(el.required&&!String(el.value||'').trim())return MSG[el.name]||'Fill in this field.';
    var v=el.validity;
    if(v&&v.typeMismatch&&el.type==='email')return EMAIL_FORMAT;
    if(v&&!v.valid)return el.validationMessage||'Check this field.';
    return '';
  }
  function show(el,msg){
    var box=errOf(el);
    if(!box)return;
    if(!msg){
      el.removeAttribute('aria-invalid');
      if(box.firstChild)box.textContent='';
      box.removeAttribute('data-msg');
      return;
    }
    el.setAttribute('aria-invalid','true');
    if(box.getAttribute('data-msg')===msg)return;   // same words: leave the live region alone, no repeat announcement
    var hid=document.createElement('span');
    hid.className='rl-vh';
    hid.textContent='Error: ';
    box.textContent='';
    box.appendChild(hid);
    box.appendChild(document.createTextNode(msg));
    box.setAttribute('data-msg',msg);
  }
  function flagged(el){return el.getAttribute('aria-invalid')==='true';}

  Array.prototype.forEach.call(document.querySelectorAll('form.give-card'),function(f){
    if(!fields(f).length)return;
    f.noValidate=true;
    f.addEventListener('input',function(e){
      var el=e.target;
      if(!errOf(el))return;
      if(typed)typed.add(el);
      if(flagged(el)&&!problem(el))show(el,'');
    });
    f.addEventListener('focusout',function(e){
      var el=e.target;
      if(!errOf(el)||(document.hasFocus&&!document.hasFocus()))return;
      if((typed&&typed.has(el))||flagged(el)||String(el.value||'').trim())show(el,problem(el));
    });
    f.addEventListener('reset',function(){
      fields(f).forEach(function(el){if(typed)typed.delete(el);show(el,'');});
    });
  });

  // capture on the document: runs before the form's own onsubmit (rlGiveSubmit), so a form with a problem never sends
  document.addEventListener('submit',function(e){
    var f=e.target;
    if(!f||!f.classList||!f.classList.contains('give-card'))return;
    var first=null;
    fields(f).forEach(function(el){var m=problem(el);show(el,m);if(m&&!first)first=el;});
    if(!first)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    first.focus();
  },true);
})();
